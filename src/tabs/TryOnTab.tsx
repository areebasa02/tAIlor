import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import * as THREE from "three"
import {
  AIErrorBanner,
  AIStatusPill,
  PulseOrb,
} from "../components/AIComponents"
import TryOnMannequin3D, {
  BODY_PRESET_VALUES,
  DEFAULT_CUSTOMIZATION,
  DEFAULT_POSE,
  JOINT_LABELS,
  JOINT_LIMITS,
  MANNEQUIN_MATERIALS,
  POSE_PRESETS,
  clampJointAngles,
  createRandomPose,
  type PosePresetId,
} from "../components/TryOnMannequin3D"
import { useApp } from "../context/AppContext"
import {
  getDefaultFacePortraitDataUrl,
  getGarmentImageForTryOn,
} from "../lib/garmentFlatLay"
import { fileToBase64 } from "../lib/wardrobeScan"
import {
  getReadableColorLabel,
  speakText,
  stopSpeaking,
} from "../services/accessibilityHelpers"
import type {
  FavoriteOutfit,
  FavoriteOutfitItem,
  JointAngles,
  MannequinBodyPreset,
  MannequinCustomization,
  MannequinJointId,
  MannequinMaterialId,
  MannequinPose,
  Outfit,
  WardrobeItem,
} from "../types"

type Step = "studio" | "processing" | "preview" | "error"
type StudioPanelTab = "pose" | "body" | "face"
type ResultViewMode = "ai" | "compare" | "studio3d"

const STAGES = [
  "Capturing clean pose snapshot from 3D studio…",
  "Preparing garment flat-lay silhouettes…",
  "Analyzing posed silhouette (cat-VTON)…",
  "Drape-fitting fabrics onto your mannequin pose…",
]

function getPieceEmoji(typeOrCat: string, fallback = "👕"): string {
  const v = typeOrCat.toLowerCase()
  if (v.includes("outer") || v.includes("coat") || v.includes("jacket")) return "🧥"
  if (v.includes("bottom") || v.includes("pant") || v.includes("jean") || v.includes("skirt")) return "👖"
  if (v.includes("shoe") || v.includes("sneaker") || v.includes("loafer")) return "👟"
  if (v.includes("access")) return "💍"
  return fallback
}

function normalizeSlotType(category: string): "Top" | "Bottom" | "Shoes" | "Outerwear" {
  const c = category.toLowerCase()
  if (c.includes("bottom") || c.includes("pant") || c.includes("jean") || c.includes("skirt")) return "Bottom"
  if (c.includes("shoe") || c.includes("sneaker") || c.includes("loafer") || c.includes("boot")) return "Shoes"
  if (c.includes("outer") || c.includes("coat") || c.includes("jacket")) return "Outerwear"
  return "Top"
}

function mapOutfitToTryOn(outfit: Outfit, wardrobe: WardrobeItem[]): FavoriteOutfit {
  const items: FavoriteOutfitItem[] = outfit.items.map((piece) => {
    const match = wardrobe.find(
      (w) => w.name.trim().toLowerCase() === piece.desc.trim().toLowerCase(),
    )
    return {
      type: normalizeSlotType(piece.type),
      name: piece.desc,
      color: piece.color,
      emoji: getPieceEmoji(piece.type, piece.emoji),
      imageData: match?.imageData,
      wardrobeItemId: match?.id,
    }
  })
  return {
    id: `rec-${String(outfit.id || outfit.direction || outfit.label)}`,
    label: outfit.label,
    tagline: outfit.tagline || "Recommended outfit",
    colors: items.map((i) => i.color).slice(0, 3),
    items,
  }
}

function buildFallbackWardrobeOutfit(wardrobe: WardrobeItem[]): FavoriteOutfit {
  const clean = wardrobe.filter((w) => (w.status || "clean") === "clean")
  const pool = clean.length > 0 ? clean : wardrobe
  const top =
    pool.find((w) => w.id === 14) ||
    pool.find((w) => w.category === "Tops")
  const bottom =
    pool.find((w) => w.id === 13) ||
    pool.find((w) => w.category === "Bottoms")
  const shoes = pool.find((w) => w.category === "Shoes")

  const picked = [top, bottom, shoes].filter(Boolean) as WardrobeItem[]
  return {
    id: "custom-builder-look",
    label:
      picked.length >= 2
        ? `${picked[0].name} & ${picked[1].name}`
        : "Custom Closet Outfit",
    tagline: "Custom mix from your closet",
    colors: picked.map((p) => p.color).slice(0, 3),
    items: picked.map((w) => ({
      type: normalizeSlotType(w.category),
      name: w.name,
      color: w.color,
      emoji: getPieceEmoji(w.category),
      imageData: w.imageData,
      wardrobeItemId: w.id,
    })),
  }
}

const POSE_SHORT_LABELS: Record<PosePresetId, string> = {
  classic: "Classic",
  contrapposto: "Editorial",
  hands_on_hips: "On Hips",
  runway: "Runway",
  streetwear: "Casual",
  power: "Power",
  wave: "Wave",
}

function projectPose2D(pose: MannequinPose) {
  const euler = new THREE.Euler()
  const quatFrom = (a: JointAngles) =>
    new THREE.Quaternion().setFromEuler(euler.set(a[0], a[1], a[2], "XYZ"))

  const pelvis = new THREE.Vector3(0, 0.95, 0)
  const qTorso = quatFrom(pose.torso)
  const qHead = qTorso.clone().multiply(quatFrom(pose.head))

  const waistPos = new THREE.Vector3(0, 0.13, 0).add(pelvis)
  const neckPos = new THREE.Vector3(0, 0.44, 0)
    .applyQuaternion(qTorso)
    .add(waistPos)
  const headPos = new THREE.Vector3(0, 0.145, 0)
    .applyQuaternion(qHead)
    .add(neckPos)

  const arm = (side: 1 | -1) => {
    const shKey: MannequinJointId = side === 1 ? "shoulderL" : "shoulderR"
    const elKey: MannequinJointId = side === 1 ? "elbowL" : "elbowR"
    const shoulder = new THREE.Vector3(side * 0.175, 0.345, 0)
      .applyQuaternion(qTorso)
      .add(waistPos)
    const qSh = qTorso.clone().multiply(quatFrom(pose[shKey]))
    const elbow = new THREE.Vector3(0, -0.28, 0)
      .applyQuaternion(qSh)
      .add(shoulder)
    const qEl = qSh.clone().multiply(quatFrom(pose[elKey]))
    const hand = new THREE.Vector3(0, -0.26, 0)
      .applyQuaternion(qEl)
      .add(elbow)
    return { shoulder, elbow, hand }
  }

  const leg = (side: 1 | -1) => {
    const hipKey: MannequinJointId = side === 1 ? "hipL" : "hipR"
    const kneeKey: MannequinJointId = side === 1 ? "kneeL" : "kneeR"
    const hip = new THREE.Vector3(side * 0.09, -0.02, 0).add(pelvis)
    const qHip = quatFrom(pose[hipKey])
    const knee = new THREE.Vector3(0, -0.43, 0)
      .applyQuaternion(qHip)
      .add(hip)
    const qKnee = qHip.clone().multiply(quatFrom(pose[kneeKey]))
    const ankle = new THREE.Vector3(0, -0.43, 0)
      .applyQuaternion(qKnee)
      .add(knee)
    return { hip, knee, ankle }
  }

  const to2D = (v: THREE.Vector3): [number, number] => [
    Number((32 + v.x * 33 + v.z * 5).toFixed(1)),
    Number((69 - v.y * 32.5 + v.z * 2.5).toFixed(1)),
  ]

  const leftArm = arm(1)
  const rightArm = arm(-1)
  const leftLeg = leg(1)
  const rightLeg = leg(-1)

  return {
    head: to2D(headPos),
    neck: to2D(neckPos),
    waist: to2D(waistPos),
    pelvis: to2D(pelvis),
    shL: to2D(leftArm.shoulder),
    elL: to2D(leftArm.elbow),
    hdL: to2D(leftArm.hand),
    shR: to2D(rightArm.shoulder),
    elR: to2D(rightArm.elbow),
    hdR: to2D(rightArm.hand),
    hipL: to2D(leftLeg.hip),
    knL: to2D(leftLeg.knee),
    akL: to2D(leftLeg.ankle),
    hipR: to2D(rightLeg.hip),
    knR: to2D(rightLeg.knee),
    akR: to2D(rightLeg.ankle),
  }
}

function MiniPosePreviewSVG({
  pose,
  active,
}: {
  pose: MannequinPose
  active: boolean
}) {
  const p = useMemo(() => projectPose2D(pose), [pose])
  const bodyStroke = active ? "#FFFFFF" : "currentColor"
  const jointFill = active ? "#FFCB44" : "#CE005A"

  return (
    <svg
      viewBox="0 0 64 76"
      aria-hidden="true"
      className="w-11 h-12 shrink-0 overflow-visible"
    >
      {/* Plinth ground oval */}
      <ellipse
        cx="32"
        cy="69.5"
        rx="13"
        ry="2.5"
        fill={active ? "rgba(255,255,255,0.28)" : "rgba(120,120,145,0.22)"}
      />

      {/* Legs */}
      <g stroke={bodyStroke} strokeWidth="3.6" strokeLinecap="round" fill="none">
        <line x1={p.hipR[0]} y1={p.hipR[1]} x2={p.knR[0]} y2={p.knR[1]} />
        <line x1={p.knR[0]} y1={p.knR[1]} x2={p.akR[0]} y2={p.akR[1]} />
        <line x1={p.hipL[0]} y1={p.hipL[1]} x2={p.knL[0]} y2={p.knL[1]} />
        <line x1={p.knL[0]} y1={p.knL[1]} x2={p.akL[0]} y2={p.akL[1]} />
      </g>

      {/* Pelvis & Torso bridge */}
      <line
        x1={p.hipR[0]}
        y1={p.hipR[1]}
        x2={p.hipL[0]}
        y2={p.hipL[1]}
        stroke={bodyStroke}
        strokeWidth="4.4"
        strokeLinecap="round"
      />
      <line
        x1={p.pelvis[0]}
        y1={p.pelvis[1]}
        x2={p.neck[0]}
        y2={p.neck[1]}
        stroke={bodyStroke}
        strokeWidth="6.2"
        strokeLinecap="round"
      />
      <line
        x1={p.shR[0]}
        y1={p.shR[1]}
        x2={p.shL[0]}
        y2={p.shL[1]}
        stroke={bodyStroke}
        strokeWidth="4.4"
        strokeLinecap="round"
      />

      {/* Arms */}
      <g stroke={bodyStroke} strokeWidth="2.9" strokeLinecap="round" fill="none">
        <line x1={p.shR[0]} y1={p.shR[1]} x2={p.elR[0]} y2={p.elR[1]} />
        <line x1={p.elR[0]} y1={p.elR[1]} x2={p.hdR[0]} y2={p.hdR[1]} />
        <line x1={p.shL[0]} y1={p.shL[1]} x2={p.elL[0]} y2={p.elL[1]} />
        <line x1={p.elL[0]} y1={p.elL[1]} x2={p.hdL[0]} y2={p.hdL[1]} />
      </g>

      {/* Head */}
      <circle cx={p.head[0]} cy={p.head[1]} r="4.8" fill={bodyStroke} />

      {/* Accent joint pins */}
      <g fill={jointFill}>
        <circle cx={p.shL[0]} cy={p.shL[1]} r="1.6" />
        <circle cx={p.shR[0]} cy={p.shR[1]} r="1.6" />
        <circle cx={p.elL[0]} cy={p.elL[1]} r="1.4" />
        <circle cx={p.elR[0]} cy={p.elR[1]} r="1.4" />
        <circle cx={p.knL[0]} cy={p.knL[1]} r="1.5" />
        <circle cx={p.knR[0]} cy={p.knR[1]} r="1.5" />
      </g>
    </svg>
  )
}

const JOINT_ORDER: MannequinJointId[] = [
  "head",
  "torso",
  "shoulderL",
  "shoulderR",
  "elbowL",
  "elbowR",
  "hipL",
  "hipR",
  "kneeL",
  "kneeR",
]

export default function TryOnTab() {
  const {
    wardrobe,
    outfits,
    logOutfitWorn,
    showToast,
    user,
    favoriteOutfits,
    saveFavoriteOutfit,
    removeFavoriteOutfit,
    activeTryOnOutfit,
    setActiveTryOnOutfit,
  } = useApp()

  const storageKey = `tailor_mannequin_studio_${user.id}`

  const [customization, setCustomization] = useState<MannequinCustomization>(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed?.customization) {
          return { ...DEFAULT_CUSTOMIZATION, ...parsed.customization }
        }
      }
    } catch { }
    return DEFAULT_CUSTOMIZATION
  })

  const [pose, setPose] = useState<MannequinPose>(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed?.pose) {
          return { ...DEFAULT_POSE, ...parsed.pose }
        }
      }
    } catch { }
    return DEFAULT_POSE
  })

  const [activePosePreset, setActivePosePreset] = useState<PosePresetId | "custom">("classic")
  const [selectedJoint, setSelectedJoint] = useState<MannequinJointId>("shoulderL")
  const [studioTab, setStudioTab] = useState<StudioPanelTab>("pose")
  const [resetCameraNonce, setResetCameraNonce] = useState(0)

  // Reload studio customization & pose when switching user persona
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        const parsed = JSON.parse(saved)
        setCustomization(
          parsed?.customization
            ? { ...DEFAULT_CUSTOMIZATION, ...parsed.customization }
            : DEFAULT_CUSTOMIZATION,
        )
        setPose(parsed?.pose ? { ...DEFAULT_POSE, ...parsed.pose } : DEFAULT_POSE)
        setActivePosePreset("custom")
        return
      }
    } catch { }
    setCustomization(DEFAULT_CUSTOMIZATION)
    setPose(DEFAULT_POSE)
    setActivePosePreset("classic")
  }, [storageKey])

  // Persist studio customization & pose
  useEffect(() => {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ customization, pose }),
      )
    } catch { }
  }, [storageKey, customization, pose])

  const defaultFacePortrait = useMemo(
    () =>
      getDefaultFacePortraitDataUrl({
        name: user.name,
        initials: user.initials,
        avatarBg: user.avatarBg,
      }),
    [user.name, user.initials, user.avatarBg],
  )

  const outfitList = useMemo(() => Object.values(outfits), [outfits])
  const [recIndex, setRecIndex] = useState(0)

  const [selectedOutfit, setSelectedOutfit] = useState<FavoriteOutfit>(() => {
    if (activeTryOnOutfit) return activeTryOnOutfit
    if (favoriteOutfits.length > 0) return favoriteOutfits[0]
    if (outfitList[0]) return mapOutfitToTryOn(outfitList[0], wardrobe)
    return buildFallbackWardrobeOutfit(wardrobe)
  })

  // Start with mannequin studio collapsed until the user selects/confirms an outfit
  const [outfitSelected, setOutfitSelected] = useState<boolean>(
    () => Boolean(activeTryOnOutfit),
  )

  // Open manual builder automatically when no favorite outfits exist
  const [builderOpen, setBuilderOpen] = useState(
    () => favoriteOutfits.length === 0,
  )
  const [swapSlot, setSwapSlot] = useState<"Top" | "Bottom" | "Outerwear" | "Shoes" | null>(null)

  const [step, setStep] = useState<Step>("studio")
  const [processingStage, setProcessingStage] = useState(0)
  const [poseSnapshot, setPoseSnapshot] = useState<string | null>(null)
  const [generatedImage, setGeneratedImage] = useState<string | null>(null)
  const [generationError, setGenerationError] = useState("")
  const [resultView, setResultView] = useState<ResultViewMode>("ai")
  const [simulatedError, setSimulatedError] = useState(false)
  const [speakingPreview, setSpeakingPreview] = useState(false)

  const captureFnRef = useRef<(() => Promise<string>) | null>(null)
  const faceUploadInputRef = useRef<HTMLInputElement | null>(null)
  const intervalRef = useRef<number | null>(null)

  const clearTimers = () => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }

  useEffect(() => {
    return () => {
      clearTimers()
      stopSpeaking()
    }
  }, [])

  // Sync incoming outfit selected from Wardrobe -> Favorite Outfits
  useEffect(() => {
    if (!activeTryOnOutfit) return
    setSelectedOutfit(activeTryOnOutfit)
    setOutfitSelected(true)
    setBuilderOpen(false)
    setGeneratedImage(null)
    setPoseSnapshot(null)
    setStep("studio")
    setActiveTryOnOutfit(null)
  }, [activeTryOnOutfit, setActiveTryOnOutfit])

  // Open manual builder automatically if favorites become empty
  useEffect(() => {
    if (favoriteOutfits.length === 0) {
      setBuilderOpen(true)
    }
  }, [favoriteOutfits.length])

  const handleRegisterCapture = useCallback((fn: () => Promise<string>) => {
    captureFnRef.current = fn
  }, [])

  const handleChangeJoint = useCallback(
    (jointId: MannequinJointId, angles: JointAngles) => {
      const clamped = clampJointAngles(jointId, angles)
      setPose((prev) => ({
        ...prev,
        [jointId]: clamped,
      }))
      setActivePosePreset("custom")
    },
    [],
  )

  const handleSelectPosePreset = (presetId: PosePresetId) => {
    setPose(POSE_PRESETS[presetId].pose)
    setActivePosePreset(presetId)
  }

  const handleStrikeRandomPose = () => {
    setPose(createRandomPose())
    setActivePosePreset("custom")
  }

  const handleResetPose = () => {
    setPose(DEFAULT_POSE)
    setActivePosePreset("classic")
  }

  const handleBodyPreset = (preset: MannequinBodyPreset) => {
    const spec = BODY_PRESET_VALUES[preset]
    setCustomization((prev) => ({
      ...prev,
      bodyPreset: preset,
      height: spec.height,
      shoulders: spec.shoulders,
      chest: spec.chest,
      waistHips: spec.waistHips,
      limbBuild: spec.limbBuild,
    }))
  }

  const handleQuickRecommend = (targetIndex?: number) => {
    if (outfitList.length > 0) {
      const nextIdx =
        typeof targetIndex === "number"
          ? targetIndex % outfitList.length
          : (recIndex + 1) % outfitList.length
      setRecIndex(nextIdx)
      const next = mapOutfitToTryOn(outfitList[nextIdx], wardrobe)
      setSelectedOutfit(next)
      showToast(
        "Quick Look Loaded",
        `Loaded "${next.label}" onto your studio.`,
        "info",
      )
      return
    }
    const fallback = buildFallbackWardrobeOutfit(wardrobe)
    setSelectedOutfit(fallback)
  }

  const handleSwapSlotItem = (slot: "Top" | "Bottom" | "Outerwear" | "Shoes", w: WardrobeItem) => {
    const piece: FavoriteOutfitItem = {
      type: slot,
      name: w.name,
      color: w.color,
      emoji: getPieceEmoji(w.category),
      imageData: w.imageData,
      wardrobeItemId: w.id,
    }
    setSelectedOutfit((prev) => {
      const filtered = prev.items.filter((i) => normalizeSlotType(i.type) !== slot)
      const nextItems = [...filtered, piece]
      const topOrOuter =
        nextItems.find((i) => i.type === "Top" || i.type === "Outerwear") || nextItems[0]
      const bottom = nextItems.find((i) => i.type === "Bottom")
      return {
        ...prev,
        id: `custom-${Date.now()}`,
        label:
          topOrOuter && bottom
            ? `${topOrOuter.name} & ${bottom.name}`
            : prev.label,
        tagline: `Manual mix · ${nextItems.length} pieces`,
        items: nextItems,
        colors: nextItems.map((i) => i.color).slice(0, 3),
      }
    })
    setSwapSlot(null)
    showToast("Piece Updated", `Swapped ${slot} to ${w.name}.`, "info")
  }

  const handleRemoveSlot = (slot: "Outerwear" | "Shoes") => {
    setSelectedOutfit((prev) => {
      const nextItems = prev.items.filter((i) => normalizeSlotType(i.type) !== slot)
      return {
        ...prev,
        items: nextItems,
        colors: nextItems.map((i) => i.color).slice(0, 3),
      }
    })
  }

  const isCurrentFavorited = favoriteOutfits.some(
    (f) => f.id === selectedOutfit.id || f.label === selectedOutfit.label,
  )

  const handleToggleCurrentFavorite = () => {
    const existing = favoriteOutfits.find(
      (f) => f.id === selectedOutfit.id || f.label === selectedOutfit.label,
    )
    if (existing) {
      removeFavoriteOutfit(existing.id)
    } else {
      saveFavoriteOutfit({
        ...selectedOutfit,
        id: selectedOutfit.id || `fav-${Date.now()}`,
        createdAt: new Date().toISOString(),
      })
    }
  }

  const handleFaceUpload = async (file?: File) => {
    if (!file) return
    try {
      const encoded = await fileToBase64(file)
      const dataUrl = `data:${encoded.mimeType};base64,${encoded.base64}`
      setCustomization((prev) => ({
        ...prev,
        includeMyFace: true,
        faceImageData: dataUrl,
      }))
      showToast(
        "Face Applied",
        "Your face photo is now projected onto the 3D mannequin head.",
        "success",
      )
    } catch (error) {
      showToast(
        "Face Upload Failed",
        error instanceof Error ? error.message : "Could not read photo.",
        "warning",
      )
    }
  }

  const handleGenerateFromPose = async (
    bypassSimulatedError = false,
    reuseSnapshot?: string,
  ) => {
    clearTimers()
    if (simulatedError && !bypassSimulatedError) {
      setGenerationError(
        "Simulated error active. Tap Retry Generation or disable Test Error.",
      )
      setStep("error")
      return
    }

    const garments = selectedOutfit.items
      .filter((item) => {
        const slot = normalizeSlotType(item.type)
        return slot === "Top" || slot === "Bottom" || slot === "Outerwear"
      })
      .sort((a, b) => {
        const aTop = a.type === "Top" || a.type === "Outerwear" ? -1 : 1
        const bTop = b.type === "Top" || b.type === "Outerwear" ? -1 : 1
        return aTop - bTop
      })
      .slice(0, 2)

    if (garments.length === 0) {
      showToast(
        "Add a Top or Bottom",
        "Select at least one Top, Outerwear, or Bottom to generate a try-on.",
        "warning",
      )
      return
    }

    let snapshot = reuseSnapshot || ""
    if (!snapshot) {
      if (!captureFnRef.current) {
        showToast(
          "Studio Still Loading",
          "Wait a moment for the 3D mannequin canvas to finish initializing.",
          "warning",
        )
        return
      }
      snapshot = await captureFnRef.current()
    }

    setPoseSnapshot(snapshot)
    setGeneratedImage(null)
    setGenerationError("")
    setProcessingStage(0)
    setStep("processing")

    intervalRef.current = window.setInterval(() => {
      setProcessingStage((prev) => Math.min(prev + 1, STAGES.length - 1))
    }, 950)

    try {
      const preparedGarments = garments.map((g) => ({
        imageUrl: getGarmentImageForTryOn(g, wardrobe),
        description: g.name,
        type: g.type,
      }))

      const response = await fetch("/api/try-on", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mannequinImage: snapshot,
          garments: preparedGarments,
          includeMyFace: customization.includeMyFace,
          faceImage: customization.includeMyFace
            ? customization.faceImageData || defaultFacePortrait
            : undefined,
        }),
      })
      const result = (await response.json().catch(() => ({}))) as {
        imageUrl?: string
        error?: string
      }
      if (!response.ok || !result.imageUrl) {
        throw new Error(result.error || "Cat-VTON request failed.")
      }

      setGeneratedImage(result.imageUrl)
      setResultView("ai")
      setStep("preview")
      showToast(
        "AI Try-On Ready!",
        "Your posed mannequin try-on image has been generated.",
        "success",
      )
    } catch (error) {
      setGenerationError(
        error instanceof Error ? error.message : "Cat-VTON request failed.",
      )
      setStep("error")
    } finally {
      clearTimers()
    }
  }

  const handleWearOutfit = () => {
    logOutfitWorn({
      label: selectedOutfit.label,
      items: selectedOutfit.items.map((i) => i.name),
      color: selectedOutfit.colors[0] || "#CE005A",
      direction: "Virtual Try-On",
    })
    showToast(
      "Outfit Logged!",
      `"${selectedOutfit.label}" saved to today's wear history.`,
      "success",
    )
  }

  const showListen = Boolean(
    user.accessibility.visionImpairment || user.accessibility.voiceNarration,
  )

  const handleDescribePreviewAloud = () => {
    if (speakingPreview) {
      stopSpeaking()
      setSpeakingPreview(false)
      return
    }
    const itemsText = selectedOutfit.items
      .map(
        (item) =>
          `${item.type}: ${item.name} in ${getReadableColorLabel(item.color, item.name, wardrobe)}`,
      )
      .join(". ")
    const matLabel =
      MANNEQUIN_MATERIALS[customization.materialId]?.label || "Porcelain"
    const bodyLabel =
      BODY_PRESET_VALUES[customization.bodyPreset]?.label || "Standard"
    const poseLabel =
      activePosePreset === "custom"
        ? "Custom Pose"
        : POSE_PRESETS[activePosePreset].label
    const text = `Virtual Fitting Room for ${selectedOutfit.label}. Mannequin configured as ${bodyLabel}, ${matLabel} finish, in ${poseLabel}${customization.includeMyFace ? " with your face included" : ""}. Pieces: ${itemsText}.`
    const started = speakText(text, () => setSpeakingPreview(false))
    if (started) {
      setSpeakingPreview(true)
    } else {
      showToast(
        "Audio Unavailable",
        "Voice narration is not supported in this browser.",
        "warning",
      )
    }
  }

  const currentJointAngles = pose[selectedJoint] || [0, 0, 0]
  const currentJointLimits = JOINT_LIMITS[selectedJoint]
  const swapPool = swapSlot
    ? wardrobe.filter((w) => normalizeSlotType(w.category) === swapSlot)
    : []

  const getSlotItem = (slot: "Top" | "Bottom" | "Outerwear" | "Shoes") =>
    selectedOutfit.items.find((i) => normalizeSlotType(i.type) === slot)

  return (
    <div className="pt-1 pb-4 space-y-2.5">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h1
            className="text-xl font-black text-foreground leading-tight"
            style={{ fontFamily: "Nunito, sans-serif" }}
          >
            3D Try-On Studio
          </h1>
          <p className="text-xs font-semibold text-muted-foreground mt-0.5 leading-snug">
            Customize &amp; pose your mannequin, then dress your exact pose with cat-VTON.
          </p>
        </div>
        {showListen && (
          <button
            type="button"
            onClick={handleDescribePreviewAloud}
            aria-pressed={speakingPreview}
            className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-extrabold border-2 shrink-0 cursor-pointer ${
              speakingPreview
                ? "bg-pink text-white border-pink"
                : "bg-card text-foreground border-border hover:border-turquoise"
            }`}
          >
            {speakingPreview ? "⏹ Stop" : "🔊 Listen"}
          </button>
        )}
      </div>

      {/* Step 1: Select or Build an Outfit (collapses once selected) */}
      {step === "studio" && !outfitSelected && (
        <div className="rounded-3xl p-4 border-2 border-border bg-card space-y-3 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-black text-foreground">
                1. Select or Build an Outfit
              </h2>
              <p className="text-[11px] font-medium text-muted-foreground">
                Pick a favorite look or mix pieces from your closet to open the 3D posing studio.
              </p>
            </div>
            {favoriteOutfits.length > 0 && (
              <button
                type="button"
                onClick={() => setBuilderOpen((o) => !o)}
                className="shrink-0 px-2.5 py-1 rounded-xl text-[11px] font-extrabold bg-muted text-foreground border border-border hover:border-turquoise cursor-pointer"
              >
                {builderOpen ? "Hide Builder ▲" : "✎ Build Custom ▼"}
              </button>
            )}
          </div>

          {favoriteOutfits.length > 0 && (
            <div className="space-y-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-foreground block">
                ❤️ Favorite Outfits ({favoriteOutfits.length})
              </span>
              <div className="grid grid-cols-1 gap-2">
                {favoriteOutfits.map((fav) => {
                  const isCurrent =
                    selectedOutfit.id === fav.id ||
                    selectedOutfit.label === fav.label
                  return (
                    <button
                      key={fav.id}
                      type="button"
                      onClick={() => {
                        setSelectedOutfit(fav)
                        setOutfitSelected(true)
                        setBuilderOpen(false)
                      }}
                      className={`w-full text-left p-3 rounded-2xl flex items-center justify-between gap-3 border-2 transition-all hover:scale-[1.01] cursor-pointer ${
                        isCurrent
                          ? "bg-pink/10 border-pink shadow-xs"
                          : "bg-muted border-border hover:border-turquoise"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="flex -space-x-1.5 shrink-0">
                          {fav.items.slice(0, 3).map((item) => (
                            <div
                              key={`${fav.id}-${item.type}-${item.name}`}
                              className="w-9 h-9 rounded-xl border-2 border-card overflow-hidden bg-card flex items-center justify-center text-sm shadow-xs"
                              style={
                                item.imageData
                                  ? undefined
                                  : { background: `${item.color}28` }
                              }
                            >
                              {item.imageData ? (
                                <img
                                  src={item.imageData}
                                  alt={item.name}
                                  className="w-full h-full object-contain"
                                />
                              ) : (
                                item.emoji
                              )}
                            </div>
                          ))}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-black text-foreground truncate">
                            {fav.label}
                          </p>
                          <p className="text-[11px] font-medium text-muted-foreground truncate">
                            {fav.items.map((i) => i.name).join(" · ")}
                          </p>
                        </div>
                      </div>
                      <span className="text-xs font-black text-pink shrink-0">
                        Pose →
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Manual Outfit Builder / Today-style Quick Recommender */}
          {(favoriteOutfits.length === 0 || builderOpen) && (
            <div className="space-y-2.5 pt-2 border-t border-border/80">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <span className="text-[11px] font-black uppercase tracking-wider text-foreground">
                    {favoriteOutfits.length === 0
                      ? "✨ Quick Outfit Builder & Recommender"
                      : "Manual Outfit Builder"}
                  </span>
                  {favoriteOutfits.length === 0 && (
                    <p className="text-[11px] text-muted-foreground">
                      No favorite outfits yet — tap Quick Recommend or build one below.
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleQuickRecommend()}
                  className="min-h-[34px] px-3 py-1 rounded-xl text-xs font-black bg-turquoise text-[#0D0F18] border-2 border-[#0D0F18]/20 hover:brightness-105 shadow-xs cursor-pointer"
                >
                  ✨ Quick Recommend
                </button>
              </div>

              {outfitList.length > 0 && (
                <div className="flex gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
                  {outfitList.map((o, idx) => (
                    <button
                      key={o.direction || o.label}
                      type="button"
                      onClick={() => handleQuickRecommend(idx)}
                      className="shrink-0 px-2.5 py-1 rounded-full text-[11px] font-bold border border-border bg-muted text-foreground hover:border-turquoise cursor-pointer"
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              )}

              {/* 4 Garment Slots */}
              <div className="grid grid-cols-2 gap-1.5">
                {(["Top", "Bottom", "Outerwear", "Shoes"] as const).map((slot) => {
                  const item = getSlotItem(slot)
                  const isOptional = slot === "Outerwear" || slot === "Shoes"
                  return (
                    <div
                      key={slot}
                      className="flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-xl bg-muted border border-border min-w-0"
                    >
                      <button
                        type="button"
                        onClick={() => setSwapSlot(slot)}
                        className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer"
                      >
                        {item?.imageData ? (
                          <img
                            src={item.imageData}
                            alt={item.name}
                            className="w-7 h-7 rounded-md object-contain bg-card border border-border shrink-0"
                          />
                        ) : (
                          <span
                            aria-hidden="true"
                            className="w-7 h-7 rounded-md flex items-center justify-center border border-border text-xs shrink-0"
                            style={{ background: item ? `${item.color}28` : undefined }}
                          >
                            {getPieceEmoji(slot)}
                          </span>
                        )}
                        <div className="min-w-0">
                          <p className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground leading-none">
                            {slot}
                          </p>
                          <p className="text-xs font-bold text-foreground truncate mt-0.5">
                            {item ? item.name : `Pick ${slot}…`}
                          </p>
                        </div>
                      </button>
                      {isOptional && item && (
                        <button
                          type="button"
                          onClick={() => handleRemoveSlot(slot)}
                          aria-label={`Remove ${slot}`}
                          className="text-[11px] font-bold text-muted-foreground hover:text-red px-1 cursor-pointer"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>

              <div className="grid grid-cols-[1fr_auto] gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setOutfitSelected(true)
                    setBuilderOpen(false)
                  }}
                  className="min-h-[44px] py-2 px-3 rounded-xl text-xs font-black bg-pink text-white border-2 border-[#0D0F18]/20 hover:brightness-110 shadow-md shadow-pink/20 cursor-pointer"
                >
                  🧍 Use This Outfit &amp; Pose Mannequin →
                </button>
                <button
                  type="button"
                  onClick={handleToggleCurrentFavorite}
                  aria-pressed={isCurrentFavorited}
                  className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-extrabold border-2 transition-colors cursor-pointer ${
                    isCurrentFavorited
                      ? "bg-pink/15 text-pink border-pink"
                      : "bg-muted text-foreground border-border hover:border-pink"
                  }`}
                >
                  {isCurrentFavorited ? "♥ Favorited" : "♡ Save"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Collapsed Active Outfit Summary Bar once an outfit is selected */}
      {step === "studio" && outfitSelected && (
        <div className="rounded-2xl px-3 py-2.5 border-2 border-border bg-card flex items-center justify-between gap-2 shadow-sm">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex -space-x-1 shrink-0">
              {selectedOutfit.items.slice(0, 3).map((item) => (
                <div
                  key={`${item.type}-${item.name}`}
                  className="w-7 h-7 rounded-lg border border-border overflow-hidden bg-card flex items-center justify-center text-xs"
                  style={
                    item.imageData
                      ? undefined
                      : { background: `${item.color}30` }
                  }
                  title={`${item.type}: ${item.name}`}
                >
                  {item.imageData ? (
                    <img
                      src={item.imageData}
                      alt={item.name}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    item.emoji
                  )}
                </div>
              ))}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-black text-foreground truncate">
                {selectedOutfit.label}
              </p>
              <p className="text-[10px] font-semibold text-muted-foreground truncate">
                {selectedOutfit.items.map((i) => i.name).join(" + ")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleToggleCurrentFavorite}
              aria-pressed={isCurrentFavorited}
              className={`min-h-[34px] px-2.5 py-1 rounded-xl text-[11px] font-extrabold border-2 transition-colors cursor-pointer ${
                isCurrentFavorited
                  ? "bg-pink/15 text-pink border-pink"
                  : "bg-muted text-foreground border-border hover:border-pink"
              }`}
              title={
                isCurrentFavorited
                  ? "Saved in Favorite Outfits"
                  : "Save outfit to Wardrobe -> Favorite Outfits"
              }
            >
              {isCurrentFavorited ? "♥" : "♡"}
            </button>
            <button
              type="button"
              onClick={() => setOutfitSelected(false)}
              className="min-h-[34px] px-2.5 py-1 rounded-xl text-[11px] font-extrabold bg-muted text-foreground border-2 border-border hover:border-turquoise cursor-pointer"
            >
              ✎ Change Outfit
            </button>
          </div>
        </div>
      )}

      {/* Step 2 Collapsed Card (default until an outfit is selected) */}
      {step === "studio" && !outfitSelected && (
        <div className="rounded-2xl p-3.5 border-2 border-dashed border-border bg-card/70 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-black text-foreground">
              🔒 2. Pose &amp; Customize 3D Mannequin
            </p>
            <p className="text-[11px] font-medium text-muted-foreground mt-0.5">
              Select an outfit above to open the 3D posing studio.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOutfitSelected(true)}
            className="shrink-0 min-h-[34px] px-3 py-1 rounded-xl text-[11px] font-extrabold bg-muted text-foreground border border-border hover:border-turquoise cursor-pointer"
          >
            Open Studio ▼
          </button>
        </div>
      )}

      {/* Step 2 Expanded: Main Interactive 3D Mannequin Studio */}
      {step === "studio" && outfitSelected && (
        <div className="space-y-2.5">
          {/* 3D Mannequin Viewport */}
          <div
            className="rounded-3xl overflow-hidden relative border-2 shadow-xl h-[clamp(320px,45dvh,420px)]"
            style={{ background: "#E8E5EE", borderColor: "var(--border)" }}
          >
            {/* Floating Studio HUD */}
            <div className="absolute top-2.5 left-2.5 right-2.5 z-20 flex items-center justify-between gap-2 pointer-events-none">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider shadow-sm bg-white/90 text-neutral-900 border border-black/10">
                  {BODY_PRESET_VALUES[customization.bodyPreset].label} ·{" "}
                  {MANNEQUIN_MATERIALS[customization.materialId].label}
                </span>
                {customization.includeMyFace && (
                  <span className="px-2 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider shadow-sm bg-pink text-white">
                    😊 My Face
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => setResetCameraNonce((n) => n + 1)}
                className="pointer-events-auto px-2.5 py-1 rounded-xl text-[11px] font-extrabold bg-white/92 text-neutral-900 border border-black/15 hover:border-turquoise shadow-sm cursor-pointer"
                title="Reset camera angle to front full body"
              >
                ↺ Camera
              </button>
            </div>

            <TryOnMannequin3D
              customization={customization}
              pose={pose}
              selectedJoint={selectedJoint}
              onSelectJoint={setSelectedJoint}
              onChangeJoint={handleChangeJoint}
              facePreviewUrl={defaultFacePortrait}
              resetCameraNonce={resetCameraNonce}
              onRegisterCapture={handleRegisterCapture}
            />

            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 px-3 py-1 rounded-full bg-white/88 backdrop-blur-xs border border-black/10 text-[10px] font-bold text-neutral-700 whitespace-nowrap pointer-events-none">
              Orbit background · Drag joint arrows ({JOINT_LABELS[selectedJoint]})
            </div>
          </div>

          {/* Primary Action: Snapshot Pose -> Cat-VTON */}
          <button
            type="button"
            onClick={() => void handleGenerateFromPose()}
            className="w-full min-h-[48px] py-2.5 px-4 rounded-2xl text-sm font-black bg-pink text-white border-2 border-[#0D0F18]/20 dark:border-white/25 shadow-lg shadow-pink/25 hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            <span aria-hidden="true">✨</span>
            <span>Generate AI Try-On from Pose</span>
          </button>

          {/* Studio Control Panel Tabs (Pose / Body / Face) */}
          <div className="rounded-3xl p-3 border-2 border-border bg-card space-y-3 shadow-sm">
            <div
              role="tablist"
              aria-label="Mannequin studio controls"
              className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-muted border border-border"
            >
              {(
                [
                  { id: "pose", label: "🕺 Pose" },
                  { id: "body", label: "📐 Body & Tone" },
                  { id: "face", label: "😊 Face" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={studioTab === tab.id}
                  onClick={() => setStudioTab(tab.id)}
                  className={`min-h-[38px] rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                    studioTab === tab.id
                      ? "bg-card text-foreground border-2 border-turquoise shadow-xs"
                      : "text-muted-foreground border-2 border-transparent hover:text-foreground"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab 1: Pose Controls with Large Visual Preview Grid */}
            {studioTab === "pose" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-black uppercase tracking-wider text-foreground">
                    Tap a Pose Preview
                  </span>
                  <button
                    type="button"
                    onClick={handleResetPose}
                    className="min-h-[30px] px-2.5 py-1 rounded-xl text-[11px] font-extrabold bg-muted text-foreground border border-border hover:border-pink cursor-pointer"
                  >
                    ↺ Reset Pose
                  </button>
                </div>

                <div className="grid grid-cols-4 gap-2">
                  {(Object.keys(POSE_PRESETS) as PosePresetId[]).map((presetKey) => {
                    const preset = POSE_PRESETS[presetKey]
                    const active = activePosePreset === presetKey
                    return (
                      <button
                        key={presetKey}
                        type="button"
                        aria-label={preset.label}
                        aria-pressed={active}
                        onClick={() => handleSelectPosePreset(presetKey)}
                        className={`min-h-[86px] p-2 rounded-2xl flex flex-col items-center justify-center gap-1 border-2 transition-all active:scale-95 cursor-pointer ${
                          active
                            ? "bg-pink text-white border-[#0D0F18]/25 shadow-md shadow-pink/25"
                            : "bg-muted text-foreground border-border hover:border-turquoise"
                        }`}
                      >
                        <MiniPosePreviewSVG pose={preset.pose} active={active} />
                        <span className="text-[10px] font-extrabold leading-tight truncate max-w-full">
                          {POSE_SHORT_LABELS[presetKey]}
                        </span>
                      </button>
                    )
                  })}

                  {/* 8th Grid Card: Visual Randomize Pose */}
                  <button
                    type="button"
                    aria-label="Strike a Random Pose"
                    onClick={handleStrikeRandomPose}
                    className={`min-h-[86px] p-2 rounded-2xl flex flex-col items-center justify-center gap-1 border-2 transition-all active:scale-95 cursor-pointer ${
                      activePosePreset === "custom"
                        ? "bg-turquoise text-[#0D0F18] border-[#0D0F18]/25 shadow-md"
                        : "bg-turquoise/15 text-foreground border-turquoise/50 hover:border-turquoise"
                    }`}
                  >
                    <div className="relative">
                      <MiniPosePreviewSVG
                        pose={activePosePreset === "custom" ? pose : POSE_PRESETS.wave.pose}
                        active={false}
                      />
                      <span
                        aria-hidden="true"
                        className="absolute -top-0.5 -right-1 text-xs leading-none"
                      >
                        🎲
                      </span>
                    </div>
                    <span className="text-[10px] font-black leading-tight">
                      Random
                    </span>
                  </button>
                </div>

                {/* Joint Selector + 3-Axis Fine Tune Sliders */}
                <div className="space-y-2 pt-2 border-t border-border">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-black uppercase tracking-wider text-foreground">
                      Fine-Tune Joint:{" "}
                      <span className="text-pink">{JOINT_LABELS[selectedJoint]}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleChangeJoint(selectedJoint, [0, 0, 0])}
                      className="text-[11px] font-bold text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      Zero joint
                    </button>
                  </div>

                  <div className="flex gap-1 overflow-x-auto pb-1 no-scrollbar">
                    {JOINT_ORDER.map((jid) => (
                      <button
                        key={jid}
                        type="button"
                        onClick={() => setSelectedJoint(jid)}
                        className={`shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                          selectedJoint === jid
                            ? "bg-pink/15 text-pink border-pink"
                            : "bg-muted text-muted-foreground border-border hover:text-foreground"
                        }`}
                      >
                        {JOINT_LABELS[jid]}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-0.5">
                    {(
                      [
                        { idx: 0 as const, label: "Bend / Forward–Back" },
                        { idx: 1 as const, label: "Twist / Turn" },
                        { idx: 2 as const, label: "Lift / Side Tilt" },
                      ] as const
                    ).map(({ idx, label }) => {
                      const val = currentJointAngles[idx]
                      const min = currentJointLimits.min[idx]
                      const max = currentJointLimits.max[idx]
                      const disabled = Math.abs(max - min) < 0.05
                      return (
                        <div key={idx} className="space-y-1">
                          <div className="flex justify-between text-[11px] font-bold text-foreground">
                            <span>{label}</span>
                            <span className="text-muted-foreground tabular-nums">
                              {Math.round((val * 180) / Math.PI)}°
                            </span>
                          </div>
                          <input
                            type="range"
                            aria-label={`${JOINT_LABELS[selectedJoint]} ${label}`}
                            min={min}
                            max={max}
                            step={0.02}
                            disabled={disabled}
                            value={val}
                            onChange={(e) => {
                              const next: JointAngles = [...currentJointAngles]
                              next[idx] = Number(e.target.value)
                              handleChangeJoint(selectedJoint, next)
                            }}
                            className="w-full accent-pink cursor-pointer disabled:opacity-40"
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: Body Proportions & Material Finish */}
            {studioTab === "body" && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <span className="text-[11px] font-black uppercase tracking-wider text-foreground block">
                    Body Build Preset
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {(Object.keys(BODY_PRESET_VALUES) as MannequinBodyPreset[]).map(
                      (presetKey) => {
                        const preset = BODY_PRESET_VALUES[presetKey]
                        const active = customization.bodyPreset === presetKey
                        return (
                          <button
                            key={presetKey}
                            type="button"
                            onClick={() => handleBodyPreset(presetKey)}
                            className={`min-h-[34px] px-3 py-1 rounded-xl text-xs font-extrabold border-2 transition-all cursor-pointer ${
                              active
                                ? "bg-turquoise text-[#0D0F18] border-[#0D0F18]/25 shadow-xs"
                                : "bg-muted text-foreground border-border hover:border-turquoise"
                            }`}
                          >
                            {preset.label}
                          </button>
                        )
                      },
                    )}
                  </div>
                </div>

                {/* Proportion Sliders */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 border-t border-border">
                  {(
                    [
                      { key: "height" as const, label: "Height", min: 0.88, max: 1.14 },
                      { key: "shoulders" as const, label: "Shoulders", min: 0.84, max: 1.24 },
                      { key: "chest" as const, label: "Chest / Torso", min: 0.84, max: 1.22 },
                      { key: "waistHips" as const, label: "Waist & Hips", min: 0.84, max: 1.26 },
                      { key: "limbBuild" as const, label: "Limb Build", min: 0.82, max: 1.24 },
                    ] as const
                  ).map(({ key, label, min, max }) => (
                    <div key={key} className="space-y-1">
                      <div className="flex justify-between text-[11px] font-bold text-foreground">
                        <span>{label}</span>
                        <span className="text-muted-foreground tabular-nums">
                          {Math.round(customization[key] * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        aria-label={label}
                        min={min}
                        max={max}
                        step={0.01}
                        value={customization[key]}
                        onChange={(e) =>
                          setCustomization((prev) => ({
                            ...prev,
                            [key]: Number(e.target.value),
                          }))
                        }
                        className="w-full accent-turquoise cursor-pointer"
                      />
                    </div>
                  ))}
                </div>

                {/* Material & Skin Tone Swatches */}
                <div className="space-y-1.5 pt-1 border-t border-border">
                  <span className="text-[11px] font-black uppercase tracking-wider text-foreground block">
                    Mannequin Finish / Skin Tone
                  </span>
                  <div className="grid grid-cols-2 min-[380px]:grid-cols-4 gap-1.5">
                    {(Object.keys(MANNEQUIN_MATERIALS) as MannequinMaterialId[]).map(
                      (matKey) => {
                        const mat = MANNEQUIN_MATERIALS[matKey]
                        const active = customization.materialId === matKey
                        return (
                          <button
                            key={matKey}
                            type="button"
                            onClick={() =>
                              setCustomization((prev) => ({
                                ...prev,
                                materialId: matKey,
                              }))
                            }
                            className={`flex items-center gap-2 p-1.5 min-h-[36px] rounded-xl text-[11px] font-extrabold border-2 transition-all cursor-pointer ${
                              active
                                ? "bg-pink/10 text-foreground border-pink shadow-xs"
                                : "bg-muted text-foreground border-border hover:border-turquoise"
                            }`}
                          >
                            <span
                              aria-hidden="true"
                              className="w-4 h-4 rounded-full border border-black/25 shrink-0"
                              style={{ background: mat.swatch }}
                            />
                            <span className="truncate">{mat.label}</span>
                          </button>
                        )
                      },
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Tab 3: Include My Face Toggle & Upload */}
            {studioTab === "face" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-muted border border-border">
                  <div className="min-w-0">
                    <p className="text-sm font-black text-foreground">
                      Put My Face on Final Image
                    </p>
                    <p className="text-xs text-muted-foreground leading-snug">
                      Projects your portrait onto the posed 3D mannequin so the Cat-VTON render keeps your face.
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={customization.includeMyFace}
                    aria-label="Toggle put my face on final image"
                    onClick={() =>
                      setCustomization((prev) => ({
                        ...prev,
                        includeMyFace: !prev.includeMyFace,
                      }))
                    }
                    className={`w-12 h-7 rounded-full p-1 transition-colors shrink-0 cursor-pointer border-2 ${
                      customization.includeMyFace
                        ? "bg-pink border-pink"
                        : "bg-card border-border"
                    }`}
                  >
                    <span
                      className={`block w-4 h-4 rounded-full transition-transform ${
                        customization.includeMyFace
                          ? "translate-x-5 bg-white"
                          : "translate-x-0 bg-muted-foreground"
                      }`}
                    />
                  </button>
                </div>

                {customization.includeMyFace && (
                  <div className="flex items-center gap-3 p-3 rounded-2xl bg-turquoise/10 border-2 border-turquoise/40">
                    <img
                      src={customization.faceImageData || defaultFacePortrait}
                      alt="Active face portrait"
                      className="w-14 h-14 rounded-full object-cover border-2 border-pink shrink-0 bg-card"
                    />
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <p className="text-xs font-extrabold text-foreground">
                        {customization.faceImageData
                          ? "Using your uploaded face photo"
                          : `Using default studio portrait for ${user.name.split(" ")[0]}`}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        <input
                          ref={faceUploadInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            void handleFaceUpload(file)
                            e.target.value = ""
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => faceUploadInputRef.current?.click()}
                          className="min-h-[34px] px-3 py-1 rounded-xl text-xs font-black bg-pink text-white hover:brightness-110 cursor-pointer"
                        >
                          📸 Upload Face Photo
                        </button>
                        {customization.faceImageData && (
                          <button
                            type="button"
                            onClick={() =>
                              setCustomization((prev) => ({
                                ...prev,
                                faceImageData: undefined,
                              }))
                            }
                            className="min-h-[34px] px-3 py-1 rounded-xl text-xs font-bold bg-muted text-foreground border border-border hover:border-turquoise cursor-pointer"
                          >
                            Use Default Portrait
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Processing Screen */}
      {step === "processing" && (
        <div className="rounded-3xl p-6 text-center space-y-4 max-w-md mx-auto border-2 border-border bg-card shadow-xl">
          <PulseOrb label="Dressing Your Pose…" />

          {poseSnapshot && (
            <div className="w-28 h-36 mx-auto rounded-2xl overflow-hidden border-2 border-turquoise shadow-md bg-[#E8E5EE]">
              <img
                src={poseSnapshot}
                alt="Captured 3D mannequin pose"
                className="w-full h-full object-cover"
              />
            </div>
          )}

          <div className="space-y-2 max-w-sm mx-auto">
            <p className="text-sm font-black text-foreground">
              {STAGES[processingStage]}
            </p>
            <div className="h-2.5 rounded-full overflow-hidden bg-muted border border-border">
              <div
                className="h-full rounded-full transition-all duration-300 bg-gradient-to-r from-turquoise to-pink"
                style={{
                  width: `${((processingStage + 1) / STAGES.length) * 100}%`,
                }}
              />
            </div>
            <p className="text-xs font-semibold text-muted-foreground">
              Applying {selectedOutfit.label} to your posed mannequin
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              clearTimers()
              setStep("studio")
            }}
            className="min-h-[40px] text-xs py-2 px-5 rounded-xl font-extrabold border-2 border-border text-foreground bg-muted cursor-pointer"
          >
            Back to Pose Studio
          </button>
        </div>
      )}

      {/* Result Preview & Side-by-Side Comparison */}
      {step === "preview" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <AIStatusPill state="success" label="cat-VTON Pose Render Ready" />
            <div
              role="tablist"
              aria-label="Preview display mode"
              className="flex gap-1 p-1 rounded-xl bg-muted border border-border"
            >
              {(
                [
                  { id: "ai", label: "✨ AI Photo" },
                  { id: "compare", label: "🔀 Compare" },
                  { id: "studio3d", label: "🧍 3D View" },
                ] as const
              ).map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  role="tab"
                  aria-selected={resultView === mode.id}
                  onClick={() => setResultView(mode.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold transition-all cursor-pointer ${
                    resultView === mode.id
                      ? "bg-card text-foreground border border-pink shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>

          {/* Preview Canvas / Comparison Grid */}
          {resultView === "ai" && generatedImage && (
            <div className="rounded-3xl overflow-hidden border-2 border-border bg-[#E8E5EE] shadow-xl h-[clamp(300px,46dvh,420px)]">
              <img
                src={generatedImage}
                alt={`AI virtual try-on of ${selectedOutfit.label}`}
                className="w-full h-full object-contain"
              />
            </div>
          )}

          {resultView === "compare" && (
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-2xl overflow-hidden border-2 border-border bg-[#E8E5EE] shadow-md flex flex-col">
                <span className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider bg-white/90 text-neutral-800 border-b border-black/10">
                  Posed 3D Snapshot
                </span>
                {poseSnapshot && (
                  <img
                    src={poseSnapshot}
                    alt="Posed 3D mannequin snapshot"
                    className="w-full h-[260px] object-contain"
                  />
                )}
              </div>
              <div className="rounded-2xl overflow-hidden border-2 border-pink bg-[#E8E5EE] shadow-md flex flex-col">
                <span className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider bg-pink text-white">
                  AI Try-On Render
                </span>
                {generatedImage && (
                  <img
                    src={generatedImage}
                    alt={`Cat-VTON render for ${selectedOutfit.label}`}
                    className="w-full h-[260px] object-contain"
                  />
                )}
              </div>
            </div>
          )}

          {resultView === "studio3d" && (
            <div className="rounded-3xl overflow-hidden border-2 border-border bg-[#E8E5EE] shadow-xl h-[300px]">
              <TryOnMannequin3D
                compact
                customization={customization}
                pose={pose}
                selectedJoint={selectedJoint}
                onSelectJoint={setSelectedJoint}
                onChangeJoint={handleChangeJoint}
                facePreviewUrl={defaultFacePortrait}
              />
            </div>
          )}

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleWearOutfit}
              className="min-h-[46px] py-2.5 rounded-xl text-xs font-black border-2 border-[#0D0F18]/20 bg-green text-white hover:brightness-110 shadow-md shadow-green/20 cursor-pointer"
            >
              ✓ Wear This Outfit Today
            </button>
            <button
              type="button"
              onClick={() => setStep("studio")}
              className="min-h-[46px] py-2.5 rounded-xl text-xs font-black border-2 border-border bg-card text-foreground hover:border-pink cursor-pointer"
            >
              🕺 Re-Pose &amp; Edit
            </button>
            <button
              type="button"
              onClick={handleToggleCurrentFavorite}
              className={`min-h-[42px] py-2 rounded-xl text-xs font-extrabold border-2 cursor-pointer ${
                isCurrentFavorited
                  ? "bg-pink/15 text-pink border-pink"
                  : "bg-muted text-foreground border-border hover:border-pink"
              }`}
            >
              {isCurrentFavorited ? "♥ Saved to Favorites" : "♡ Save to Favorite Outfits"}
            </button>
            <button
              type="button"
              onClick={() => void handleGenerateFromPose(false, poseSnapshot || undefined)}
              className="min-h-[42px] py-2 rounded-xl text-xs font-extrabold border-2 border-border bg-muted text-foreground hover:border-turquoise cursor-pointer"
            >
              ↻ Regenerate Render
            </button>
          </div>
        </div>
      )}

      {/* Error Recovery Screen */}
      {step === "error" && (
        <div className="space-y-4 max-w-lg mx-auto">
          <AIErrorBanner
            title="Virtual Try-On Generation Failed"
            message={
              generationError ||
              "The Cat-VTON request failed. Retry with your current pose or return to the 3D studio."
            }
            actions={[
              {
                label: "Retry Generation",
                primary: true,
                onClick: () => {
                  setSimulatedError(false)
                  void handleGenerateFromPose(true, poseSnapshot || undefined)
                },
              },
              {
                label: "Back to Pose Studio",
                onClick: () => setStep("studio"),
              },
            ]}
          />
        </div>
      )}

      {/* Slot Garment Picker Modal */}
      {swapSlot && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setSwapSlot(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="tryon-slot-picker-title"
            className="rounded-3xl p-5 max-w-[400px] w-full space-y-3 shadow-2xl border-2 border-border bg-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2
                id="tryon-slot-picker-title"
                className="text-sm font-black text-foreground"
              >
                Choose {swapSlot} from Closet
              </h2>
              <button
                type="button"
                onClick={() => setSwapSlot(null)}
                aria-label="Close slot picker"
                className="text-xs font-bold text-muted-foreground hover:text-foreground p-1.5 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
              {swapPool.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">
                  No pieces found in the {swapSlot} category yet.
                </p>
              ) : (
                swapPool.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => handleSwapSlotItem(swapSlot, w)}
                    className="w-full min-h-[48px] p-2.5 rounded-xl flex items-center gap-3 border border-border bg-muted text-left hover:border-turquoise transition-colors cursor-pointer"
                  >
                    {w.imageData ? (
                      <img
                        src={w.imageData}
                        alt={w.name}
                        className="w-9 h-9 rounded-lg object-contain bg-card border border-border shrink-0"
                      />
                    ) : (
                      <div
                        aria-hidden="true"
                        className="w-9 h-9 rounded-lg flex items-center justify-center border border-border text-base shrink-0"
                        style={{ background: `${w.color}28` }}
                      >
                        {getPieceEmoji(w.category)}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold truncate text-foreground">
                        {w.name}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {w.colorName} {w.status && w.status !== "clean" ? `· ${w.status}` : ""}
                      </p>
                    </div>
                    <span className="text-xs font-extrabold text-turquoise">
                      Use →
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Test Mode Footer Bar */}
      <div
        role="group"
        aria-label="Test mode"
        className="mt-2 pt-2.5 border-t-2 border-border flex items-center justify-between gap-2 text-xs"
      >
        <span className="font-bold text-muted-foreground">Test Mode:</span>
        <button
          type="button"
          onClick={() => setSimulatedError(!simulatedError)}
          aria-pressed={simulatedError}
          aria-label="Toggle error recovery test"
          className={`px-3 py-1.5 min-h-[34px] rounded-xl border-2 font-extrabold transition-colors shrink-0 cursor-pointer ${
            simulatedError
              ? "border-red text-white bg-red"
              : "border-border bg-muted text-foreground hover:border-red"
          }`}
        >
          {simulatedError ? "⚠ Error ON" : "Test Error"}
        </button>
      </div>
    </div>
  )
}
