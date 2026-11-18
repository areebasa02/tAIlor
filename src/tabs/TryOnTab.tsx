import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  AIErrorBanner,
  AIStatusPill,
  PulseOrb,
} from "../components/AIComponents"
import TryOnPoseStudio2D, {
  BODY_PRESET_VALUES,
  CAMERA_PRESETS,
  DEFAULT_CUSTOMIZATION,
  DEFAULT_POSE,
  JOINT_LABELS,
  JOINT_ORDER,
  MANNEQUIN_MATERIALS,
  POSE_PRESETS,
  STUDIO_BACKDROP_PRESETS,
  clampPoint2D,
  createRandomPose,
  isValidPose2D,
  mirrorPoseLeftRight,
  projectPoseForView,
  symmetrizePose,
  type BackdropPresetId,
  type CameraPresetId,
  type PosePresetId,
  type TryOnPoseCaptureResult,
} from "../components/TryOnPoseStudio2D"
import { useApp } from "../context/AppContext"
import { getSampleGarmentImage } from "../data/personaData"
import {
  getDefaultFacePortraitDataUrl,
  getGarmentImageForTryOn,
} from "../lib/garmentFlatLay"
import { fileToBase64 } from "../lib/wardrobeScan"
import { AiHostNoticeBanner } from "../components/AiHostStatus"
import { formatAiErrorMessage, submitAndPollTryOnJob } from "../lib/aiHost"
import {
  getReadableColorLabel,
  speakText,
  stopSpeaking,
} from "../services/accessibilityHelpers"
import type {
  FavoriteOutfit,
  FavoriteOutfitItem,
  MannequinBodyPreset,
  MannequinCustomization,
  MannequinMaterialId,
  Outfit,
  Pose2D,
  PoseJointId,
  PosePoint2D,
  WardrobeItem,
} from "../types"

type Step = "studio" | "processing" | "preview" | "error"
type StudioPanelTab = "pose" | "body" | "face"
type ResultViewMode = "ai" | "compare"

const STAGES = [
  "Encoding 2D OpenPose skeleton & camera framing…",
  "Extracting outfit garments & material references…",
  "Generating posed mannequin on local RTX GPU…",
  "Refining cloth drape, seams & studio lighting…",
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
      imageData:
        match?.imageData || getSampleGarmentImage(piece.desc, piece.type),
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
      imageData: w.imageData || getSampleGarmentImage(w.name, w.category),
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

function MiniPosePreviewSVG({
  pose,
  active,
}: {
  pose: Pose2D
  active: boolean
}) {
  const projected = useMemo(
    () => projectPoseForView(pose, DEFAULT_CUSTOMIZATION, "front"),
    [pose],
  )
  const p = projected.norm
  const pt = (id: PoseJointId): [number, number] => [
    12 + p[id][0] * 40,
    5 + p[id][1] * 66,
  ]

  const nose = pt("nose")
  const neck = pt("neck")
  const pelvis = pt("pelvis")
  const shR = pt("shoulderR")
  const shL = pt("shoulderL")
  const elR = pt("elbowR")
  const elL = pt("elbowL")
  const wrR = pt("wristR")
  const wrL = pt("wristL")
  const hipR = pt("hipR")
  const hipL = pt("hipL")
  const knR = pt("kneeR")
  const knL = pt("kneeL")
  const akR = pt("ankleR")
  const akL = pt("ankleL")

  const bodyStroke = active ? "#FFFFFF" : "currentColor"
  const jointFill = active ? "#FFCB44" : "#CE005A"

  return (
    <svg
      viewBox="0 0 64 76"
      aria-hidden="true"
      className="w-11 h-12 shrink-0 overflow-visible"
    >
      <ellipse
        cx="32"
        cy="69.5"
        rx="13"
        ry="2.5"
        fill={active ? "rgba(255,255,255,0.28)" : "rgba(120,120,145,0.22)"}
      />
      <g stroke={bodyStroke} strokeWidth="3.6" strokeLinecap="round" fill="none">
        <line x1={hipR[0]} y1={hipR[1]} x2={knR[0]} y2={knR[1]} />
        <line x1={knR[0]} y1={knR[1]} x2={akR[0]} y2={akR[1]} />
        <line x1={hipL[0]} y1={hipL[1]} x2={knL[0]} y2={knL[1]} />
        <line x1={knL[0]} y1={knL[1]} x2={akL[0]} y2={akL[1]} />
      </g>
      <line x1={hipR[0]} y1={hipR[1]} x2={hipL[0]} y2={hipL[1]} stroke={bodyStroke} strokeWidth="4.4" strokeLinecap="round" />
      <line x1={pelvis[0]} y1={pelvis[1]} x2={neck[0]} y2={neck[1]} stroke={bodyStroke} strokeWidth="6.2" strokeLinecap="round" />
      <line x1={shR[0]} y1={shR[1]} x2={shL[0]} y2={shL[1]} stroke={bodyStroke} strokeWidth="4.4" strokeLinecap="round" />
      <g stroke={bodyStroke} strokeWidth="2.9" strokeLinecap="round" fill="none">
        <line x1={shR[0]} y1={shR[1]} x2={elR[0]} y2={elR[1]} />
        <line x1={elR[0]} y1={elR[1]} x2={wrR[0]} y2={wrR[1]} />
        <line x1={shL[0]} y1={shL[1]} x2={elL[0]} y2={elL[1]} />
        <line x1={elL[0]} y1={elL[1]} x2={wrL[0]} y2={wrL[1]} />
      </g>
      <circle cx={nose[0]} cy={nose[1]} r="4.8" fill={bodyStroke} />
      <g fill={jointFill}>
        {[shL, shR, elL, elR, knL, knR].map((pin, i) => (
          <circle key={i} cx={pin[0]} cy={pin[1]} r="1.5" />
        ))}
      </g>
    </svg>
  )
}

/** Compact floating corner bar for switching studio backdrop & lighting presets directly inside preview cards. */
function StudioBackdropCornerBar({
  value,
  onChange,
}: {
  value: BackdropPresetId
  onChange: (id: BackdropPresetId) => void
}) {
  const activeSpec =
    STUDIO_BACKDROP_PRESETS[value] || STUDIO_BACKDROP_PRESETS.cyclorama
  return (
    <div
      role="group"
      aria-label="Studio backdrop and lighting"
      className="pointer-events-auto inline-flex items-center gap-1 px-1.5 py-1 rounded-2xl bg-white/92 backdrop-blur-md border border-black/15 shadow-md max-w-full"
    >
      {(Object.keys(STUDIO_BACKDROP_PRESETS) as BackdropPresetId[]).map(
        (presetId) => {
          const spec = STUDIO_BACKDROP_PRESETS[presetId]
          const active = value === presetId
          return (
            <button
              key={presetId}
              type="button"
              onClick={() => onChange(presetId)}
              aria-label={`Backdrop & Lighting: ${spec.label}`}
              aria-pressed={active}
              title={`Backdrop & Lighting: ${spec.label}`}
              className={`w-5 h-5 rounded-full border shrink-0 cursor-pointer transition-all ${
                active
                  ? "ring-2 ring-pink border-white scale-110 shadow-xs"
                  : "border-black/25 opacity-85 hover:opacity-100 hover:scale-105"
              }`}
              style={{ background: spec.swatch }}
            />
          )
        },
      )}
      <span className="hidden sm:inline-block pl-1 pr-0.5 text-[10px] font-black text-neutral-900 whitespace-nowrap">
        {activeSpec.label}
      </span>
    </div>
  )
}

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

  const [pose, setPose] = useState<Pose2D>(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (isValidPose2D(parsed?.pose)) {
          return parsed.pose
        }
      }
    } catch { }
    return DEFAULT_POSE
  })

  const [activePosePreset, setActivePosePreset] = useState<PosePresetId | "custom">("classic")
  const [selectedJoint, setSelectedJoint] = useState<PoseJointId>("wristL")
  const [studioTab, setStudioTab] = useState<StudioPanelTab>("pose")
  const [cameraPreset, setCameraPreset] = useState<CameraPresetId>("front")
  const [backdropPreset, setBackdropPreset] = useState<BackdropPresetId>("cyclorama")

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
        if (isValidPose2D(parsed?.pose)) {
          setPose(parsed.pose)
          setActivePosePreset("custom")
        } else {
          setPose(DEFAULT_POSE)
          setActivePosePreset("classic")
        }
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
  const [queueStatusText, setQueueStatusText] = useState<string | null>(null)
  const [poseSnapshot, setPoseSnapshot] = useState<string | null>(null)
  const [barePoseSnapshot, setBarePoseSnapshot] = useState<string | null>(null)
  const [generatedImage, setGeneratedImage] = useState<string | null>(null)
  const [generationError, setGenerationError] = useState("")
  const [resultView, setResultView] = useState<ResultViewMode>("ai")
  const [simulatedError, setSimulatedError] = useState(false)
  const [speakingPreview, setSpeakingPreview] = useState(false)

  const captureFnRef = useRef<(() => Promise<TryOnPoseCaptureResult>) | null>(null)
  const lastKeypointsRef = useRef<Record<string, [number, number, number]> | null>(null)
  const lastOpenposeRef = useRef<string | null>(null)
  const faceUploadInputRef = useRef<HTMLInputElement | null>(null)
  const intervalRef = useRef<number | null>(null)
  const tryOnAbortRef = useRef<AbortController | null>(null)

  const clearTimers = () => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }

  const cancelInflightTryOn = () => {
    clearTimers()
    if (tryOnAbortRef.current) {
      tryOnAbortRef.current.abort()
      tryOnAbortRef.current = null
    }
    setQueueStatusText(null)
  }

  useEffect(() => {
    return () => {
      cancelInflightTryOn()
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
    lastOpenposeRef.current = null
    lastKeypointsRef.current = null
    setStep("studio")
    setActiveTryOnOutfit(null)
  }, [activeTryOnOutfit, setActiveTryOnOutfit])

  useEffect(() => {
    lastOpenposeRef.current = null
    setPoseSnapshot(null)
  }, [selectedOutfit])

  // Open manual builder automatically if favorites become empty
  useEffect(() => {
    if (favoriteOutfits.length === 0) {
      setBuilderOpen(true)
    }
  }, [favoriteOutfits.length])

  const handleRegisterCapture = useCallback(
    (fn: () => Promise<TryOnPoseCaptureResult>) => {
      captureFnRef.current = fn
    },
    [],
  )

  const handleChangeJoint = useCallback(
    (jointId: PoseJointId, pt: PosePoint2D) => {
      const clamped = clampPoint2D(pt)
      setPose((prev) => ({
        ...prev,
        [jointId]: clamped,
      }))
      setActivePosePreset("custom")
    },
    [],
  )

  const handleChangePose = useCallback((nextPose: Pose2D) => {
    setPose(nextPose)
    setActivePosePreset("custom")
  }, [])

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

  const handleMirrorPose = () => {
    setPose((prev) => mirrorPoseLeftRight(prev))
    setActivePosePreset("custom")
  }

  const handleSymmetrizePose = () => {
    setPose((prev) => symmetrizePose(prev))
    setActivePosePreset("custom")
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
        "Your face photo will be blended onto the generated mannequin.",
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
        return (
          slot === "Top" ||
          slot === "Bottom" ||
          slot === "Outerwear" ||
          slot === "Shoes"
        )
      })
      .sort((a, b) => {
        const rank = (t: string) => {
          const s = normalizeSlotType(t)
          if (s === "Top") return 0
          if (s === "Outerwear") return 1
          if (s === "Bottom") return 2
          return 3
        }
        return rank(a.type) - rank(b.type)
      })

    if (garments.length === 0) {
      showToast(
        "Add a Top or Bottom",
        "Select at least one Top, Outerwear, or Bottom to generate a try-on.",
        "warning",
      )
      return
    }

    let bareSnapshot = reuseSnapshot || ""
    let openposeSnapshot = reuseSnapshot ? lastOpenposeRef.current || "" : ""
    let capturedKeypoints = lastKeypointsRef.current
    if (!bareSnapshot || !openposeSnapshot) {
      if (!captureFnRef.current) {
        showToast(
          "Studio Still Loading",
          "Wait a moment for the pose studio canvas to finish initializing.",
          "warning",
        )
        return
      }
      const captureRes = await captureFnRef.current()
      bareSnapshot = captureRes.imageDataUrl
      openposeSnapshot = captureRes.openposeImageDataUrl
      capturedKeypoints = captureRes.keypoints
      lastKeypointsRef.current = capturedKeypoints
      lastOpenposeRef.current = openposeSnapshot
    }

    setBarePoseSnapshot(bareSnapshot)
    setPoseSnapshot(bareSnapshot)
    setGeneratedImage(null)
    setGenerationError("")
    setProcessingStage(0)
    setQueueStatusText("Submitting to host GPU queue…")
    setStep("processing")

    intervalRef.current = window.setInterval(() => {
      setProcessingStage((prev) => Math.min(prev + 1, STAGES.length - 1))
    }, 850)

    const abortController = new AbortController()
    tryOnAbortRef.current = abortController

    try {
      const preparedGarments = selectedOutfit.items.map((g) => {
        const match = wardrobe.find(
          (w) =>
            w.id === g.wardrobeItemId ||
            w.name.trim().toLowerCase() === g.name.trim().toLowerCase(),
        )
        return {
          imageUrl: getGarmentImageForTryOn(g, wardrobe),
          description: g.name,
          type: g.type,
          color: g.color,
          colorName: match?.colorName || "",
          material: match?.material || "",
        }
      })

      const poseLabel =
        activePosePreset === "custom"
          ? "Custom Pose"
          : POSE_PRESETS[activePosePreset].label

      const result = await submitAndPollTryOnJob(
        {
          mannequinImage: bareSnapshot,
          openposeImage: openposeSnapshot,
          garments: preparedGarments,
          keypoints: capturedKeypoints,
          cameraPreset,
          backdropPreset,
          poseLabel,
          bodyPreset: BODY_PRESET_VALUES[customization.bodyPreset].label,
          materialId: customization.materialId,
          includeMyFace: customization.includeMyFace,
          faceImage: customization.includeMyFace
            ? customization.faceImageData || defaultFacePortrait
            : undefined,
          seed: reuseSnapshot ? Math.floor(Math.random() * 2_000_000_000) : undefined,
        },
        {
          signal: abortController.signal,
          onProgress: (progress) => {
            if (progress.status === "queued") {
              const pos = progress.position ?? 1
              setQueueStatusText(
                pos > 1
                  ? `Queued on host GPU (#${pos} in line)…`
                  : "Queued — waiting for GPU slot…",
              )
            } else if (progress.status === "running") {
              const secs = progress.elapsedMs
                ? ` (${Math.max(1, Math.round(progress.elapsedMs / 1000))}s)`
                : ""
              setQueueStatusText(`Generating on host RTX GPU${secs}…`)
            }
          },
        },
      )

      setGeneratedImage(result.imageUrl)
      setResultView("ai")
      setStep("preview")
      showToast(
        "AI Try-On Ready!",
        "Your posed studio virtual try-on render is ready.",
        "success",
      )
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return
      }
      setGenerationError(
        formatAiErrorMessage(error, "Virtual Try-On request failed."),
      )
      setStep("error")
    } finally {
      if (tryOnAbortRef.current === abortController) {
        tryOnAbortRef.current = null
      }
      setQueueStatusText(null)
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

  const currentJointPoint = pose[selectedJoint] || DEFAULT_POSE[selectedJoint]
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
            AI Try-On Studio
          </h1>
          <p className="text-xs font-semibold text-muted-foreground mt-0.5 leading-snug">
            Set the 2D pose, angle, and lighting, then generate a studio photo on your local GPU.
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

      <AiHostNoticeBanner featureName="AI Try-On Studio" />

      {/* Step 1: Select or Build an Outfit (collapses once selected) */}
      {step === "studio" && !outfitSelected && (
        <div className="rounded-3xl p-4 border-2 border-border bg-card space-y-3 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-black text-foreground">
                1. Select or Build an Outfit
              </h2>
              <p className="text-[11px] font-medium text-muted-foreground">
                Pick a favorite look or mix pieces from your closet to open the AI pose studio.
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
              🔒 2. Pose &amp; Customize Studio Look
            </p>
            <p className="text-[11px] font-medium text-muted-foreground mt-0.5">
              Select an outfit above to open the 2D pose &amp; lighting studio.
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

      {/* Step 2 Expanded: Interactive 2D Pose & AI Try-On Studio */}
      {step === "studio" && outfitSelected && (
        <div className="space-y-2.5">
          {/* 2D Pose & Silhouette Preview Window */}
          <div
            className="rounded-3xl overflow-hidden relative border-2 shadow-xl h-[clamp(340px,48dvh,450px)]"
            style={{
              background: STUDIO_BACKDROP_PRESETS[backdropPreset].bg,
              borderColor: "var(--border)",
            }}
          >
            {/* Floating Top Corner Studio HUD: Backdrop & Lighting (top-left) + Camera Framing (top-right) */}
            <div className="absolute top-2.5 left-2.5 right-2.5 z-20 flex items-center justify-between gap-1.5 pointer-events-none flex-wrap">
              <StudioBackdropCornerBar
                value={backdropPreset}
                onChange={setBackdropPreset}
              />

              <div className="flex items-center gap-1 pointer-events-auto shrink-0">
                {(Object.keys(CAMERA_PRESETS) as CameraPresetId[]).map((camId) => {
                  const cam = CAMERA_PRESETS[camId]
                  const activeCam = cameraPreset === camId
                  return (
                    <button
                      key={camId}
                      type="button"
                      onClick={() => setCameraPreset(camId)}
                      className={`px-2 py-1 rounded-xl text-[10px] font-extrabold border shadow-sm cursor-pointer transition-colors ${
                        activeCam
                          ? "bg-pink text-white border-pink"
                          : "bg-white/92 text-neutral-900 border-black/15 hover:border-turquoise"
                      }`}
                      title={`Switch camera framing to ${cam.label} view`}
                    >
                      {cam.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <TryOnPoseStudio2D
              customization={customization}
              pose={pose}
              selectedJoint={selectedJoint}
              onSelectJoint={setSelectedJoint}
              onChangeJoint={handleChangeJoint}
              onChangePose={handleChangePose}
              facePreviewUrl={defaultFacePortrait}
              cameraPreset={cameraPreset}
              backdropPreset={backdropPreset}
              onRegisterCapture={handleRegisterCapture}
            />

            {/* Floating Bottom Studio HUD: Mannequin Finish badge (bottom-left) + Drag Hint (bottom-right) */}
            <div className="absolute bottom-2 left-2.5 right-2.5 z-20 flex items-center justify-between gap-1.5 pointer-events-none flex-wrap">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider shadow-sm bg-white/90 text-neutral-900 border border-black/10">
                  {BODY_PRESET_VALUES[customization.bodyPreset].label} ·{" "}
                  {MANNEQUIN_MATERIALS[customization.materialId].label}
                </span>
                {customization.includeMyFace && (
                  <span className="px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-wider shadow-sm bg-pink text-white">
                    😊 My Face
                  </span>
                )}
              </div>
              <div className="px-2.5 py-1 rounded-full bg-white/90 backdrop-blur-xs border border-black/10 text-[10px] font-bold text-neutral-700 whitespace-nowrap ml-auto">
                Drag joints ({JOINT_LABELS[selectedJoint]}) · Pull wrist/ankle for IK
              </div>
            </div>
          </div>

          {/* Primary Action: Snapshot Bare Pose -> Generate 2D Outfit Try-On */}
          <button
            type="button"
            onClick={() => void handleGenerateFromPose()}
            className="w-full min-h-[48px] py-2.5 px-4 rounded-2xl text-sm font-black bg-pink text-white border-2 border-[#0D0F18]/20 dark:border-white/25 shadow-lg shadow-pink/25 hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            <span aria-hidden="true">✨</span>
            <span>Generate AI Try-On from Pose</span>
          </button>

          {/* Studio Control Panel Tabs (Pose / Body / Face) + Backdrop/Lighting */}
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
                <div className="flex items-center justify-between gap-1.5 flex-wrap">
                  <span className="text-[11px] font-black uppercase tracking-wider text-foreground">
                    Tap a Pose Preview
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={handleMirrorPose}
                      className="min-h-[30px] px-2 py-1 rounded-xl text-[11px] font-extrabold bg-muted text-foreground border border-border hover:border-turquoise cursor-pointer"
                      title="Mirror left and right limbs"
                    >
                      ⇄ Flip L↔R
                    </button>
                    <button
                      type="button"
                      onClick={handleSymmetrizePose}
                      className="min-h-[30px] px-2 py-1 rounded-xl text-[11px] font-extrabold bg-muted text-foreground border border-border hover:border-turquoise cursor-pointer"
                      title="Match both sides symmetrically"
                    >
                      ⚖ Symmetrize
                    </button>
                    <button
                      type="button"
                      onClick={handleResetPose}
                      className="min-h-[30px] px-2 py-1 rounded-xl text-[11px] font-extrabold bg-muted text-foreground border border-border hover:border-pink cursor-pointer"
                    >
                      ↺ Reset
                    </button>
                  </div>
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

                {/* Joint Selector + 2D X/Y Fine Tune Sliders */}
                <div className="space-y-2 pt-2 border-t border-border">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-black uppercase tracking-wider text-foreground">
                      Fine-Tune Joint:{" "}
                      <span className="text-pink">{JOINT_LABELS[selectedJoint]}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        handleChangeJoint(selectedJoint, DEFAULT_POSE[selectedJoint])
                      }
                      className="text-[11px] font-bold text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      Reset joint
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

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-0.5">
                    {(
                      [
                        { idx: 0 as const, label: "Horizontal (Left ↔ Right)", min: 0.08, max: 0.92 },
                        { idx: 1 as const, label: "Vertical (Up ↕ Down)", min: 0.06, max: 0.94 },
                      ] as const
                    ).map(({ idx, label, min, max }) => {
                      const val = currentJointPoint[idx]
                      return (
                        <div key={idx} className="space-y-1">
                          <div className="flex justify-between text-[11px] font-bold text-foreground">
                            <span>{label}</span>
                            <span className="text-muted-foreground tabular-nums">
                              {Math.round(val * 100)}%
                            </span>
                          </div>
                          <input
                            type="range"
                            aria-label={`${JOINT_LABELS[selectedJoint]} ${label}`}
                            min={min}
                            max={max}
                            step={0.01}
                            value={val}
                            onChange={(e) => {
                              const next: PosePoint2D = [...currentJointPoint]
                              next[idx] = Number(e.target.value)
                              handleChangeJoint(selectedJoint, next)
                            }}
                            className="w-full accent-pink cursor-pointer"
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
                      Conditions the local SDXL model with your portrait so the generated mannequin includes your face.
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
                alt="Captured 2D pose skeleton reference"
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
              {queueStatusText || `Applying ${selectedOutfit.label} to your posed mannequin`}
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              cancelInflightTryOn()
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
            <AIStatusPill state="success" label="AI Virtual Try-On Render Ready" />
            <div
              role="tablist"
              aria-label="Preview display mode"
              className="flex gap-1 p-1 rounded-xl bg-muted border border-border"
            >
              {(
                [
                  { id: "ai", label: "✨ AI Photo" },
                  { id: "compare", label: "🔀 Compare" },
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
            <div
              className="relative rounded-3xl overflow-hidden border-2 border-border shadow-xl mx-auto aspect-[3/4] max-h-[440px] w-full max-w-[330px]"
              style={{ background: STUDIO_BACKDROP_PRESETS[backdropPreset].bg }}
            >
              <div className="absolute top-2.5 left-2.5 z-20 pointer-events-none">
                <StudioBackdropCornerBar
                  value={backdropPreset}
                  onChange={setBackdropPreset}
                />
              </div>
              <img
                src={generatedImage}
                alt={`AI virtual try-on of ${selectedOutfit.label}`}
                className="w-full h-full object-cover"
              />
            </div>
          )}

          {resultView === "compare" && (
            <div className="grid grid-cols-2 gap-2">
              <div
                className="rounded-2xl overflow-hidden border-2 border-border shadow-md flex flex-col"
                style={{ background: STUDIO_BACKDROP_PRESETS[backdropPreset].bg }}
              >
                <span className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider bg-white/90 text-neutral-800 border-b border-black/10">
                  Pose Reference
                </span>
                {(barePoseSnapshot || poseSnapshot) && (
                  <img
                    src={barePoseSnapshot || poseSnapshot || ""}
                    alt="Pose silhouette reference"
                    className="w-full h-[260px] object-contain"
                  />
                )}
              </div>
              <div
                className="rounded-2xl overflow-hidden border-2 border-pink shadow-md flex flex-col"
                style={{ background: STUDIO_BACKDROP_PRESETS[backdropPreset].bg }}
              >
                <span className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider bg-pink text-white">
                  AI Try-On Render
                </span>
                {generatedImage && (
                  <img
                    src={generatedImage}
                    alt={`Virtual Try-On render for ${selectedOutfit.label}`}
                    className="w-full h-[260px] object-contain"
                  />
                )}
              </div>
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
              "The local AI model failed to generate this try-on image. Retry or return to the pose studio."
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
