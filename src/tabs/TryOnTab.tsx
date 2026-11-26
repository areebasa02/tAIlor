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
  HAND_FOOT_PRESETS,
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
  type StudioGarmentPreviewLayer,
  type TryOnPoseCaptureResult,
} from "../components/TryOnPoseStudio2D"
import {
  FIT_EASE,
  deriveBodyMeasurements,
  fitIndicator,
  formatEaseValue,
  formatMeasurement,
  inferFitStyleFromProfile,
  suggestSizes,
  type MeasurementUnit,
} from "../lib/bodyMeasurements"
import { useApp } from "../context/AppContext"
import { getSampleGarmentImage } from "../data/personaData"
import {
  getDefaultFacePortraitDataUrl,
  getGarmentImageForTryOn,
} from "../lib/garmentFlatLay"
import {
  getGarmentEmoji,
  normalizeGarmentSlot,
  type TryOnSlot,
} from "../lib/garmentCategories"
import { fileToBase64 } from "../lib/wardrobeScan"
import { AiHostNoticeBanner } from "../components/AiHostStatus"
import {
  deleteProfileTryOnPhotoFromDb,
  fetchProfileTryOnPhoto,
  formatAiErrorMessage,
  saveProfileTryOnPhotoToDb,
  submitAndPollTryOnJob,
  type SavedProfileTryOnPhoto,
  type TryOnDiagnostics,
  type TryOnLiveProgress,
} from "../lib/aiHost"
import {
  getReadableColorLabel,
  speakText,
  stopSpeaking,
} from "../services/accessibilityHelpers"
import type {
  FavoriteOutfit,
  FavoriteOutfitItem,
  GarmentFitStyle,
  HandFootPresetId,
  MannequinBodyPreset,
  MannequinCustomization,
  MannequinMaterialId,
  Outfit,
  Pose2D,
  PoseJointId,
  PosePoint2D,
  TryOnSubjectMode,
  WardrobeItem,
} from "../types"

type Step = "studio" | "processing" | "preview" | "error"
type WizardStage = "outfit" | "subject" | "pose"
type SubjectChoice = "mannequin" | "picture"
type PictureSource = "saved" | "temporary"
type PicturePoseMode = "direct_photo" | "repose_picture"
type StudioPanelTab = "pose" | "body" | "face"
type ResultViewMode = "ai" | "compare"

type BuilderSlot =
  | "Top"
  | "Bottom"
  | "Full Body"
  | "Outerwear"
  | "Shoes"
  | "Accessory"
type BuilderMode = "separates" | "full_body"

function getPieceEmoji(
  typeOrCat: string,
  fallback = "👕",
  itemName = "",
): string {
  return getGarmentEmoji(typeOrCat, itemName, fallback)
}

function normalizeSlotType(category: string, itemName = ""): TryOnSlot {
  return normalizeGarmentSlot(category, itemName)
}

function outfitUsesFullBody(outfit?: FavoriteOutfit | null): boolean {
  return Boolean(
    outfit?.items?.some(
      (i) => normalizeSlotType(i.type, i.name) === "Full Body",
    ),
  )
}

function mapOutfitToTryOn(outfit: Outfit, wardrobe: WardrobeItem[]): FavoriteOutfit {
  const items: FavoriteOutfitItem[] = outfit.items.map((piece) => {
    const match = wardrobe.find(
      (w) => w.name.trim().toLowerCase() === piece.desc.trim().toLowerCase(),
    )
    const slot = normalizeSlotType(piece.type, piece.desc)
    return {
      type: slot,
      name: piece.desc,
      color: piece.color,
      emoji: getPieceEmoji(piece.type, piece.emoji, piece.desc),
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
  const fullBody = pool.find((w) => w.category === "Full Body")
  const shoes = pool.find((w) => w.category === "Shoes")

  const picked =
    top && bottom
      ? ([top, bottom, shoes].filter(Boolean) as WardrobeItem[])
      : fullBody
        ? ([fullBody, shoes].filter(Boolean) as WardrobeItem[])
        : ([top || bottom, shoes].filter(Boolean) as WardrobeItem[])

  return {
    id: "custom-builder-look",
    label:
      fullBody && !(top && bottom)
        ? fullBody.name
        : picked.length >= 2
          ? `${picked[0].name} & ${picked[1].name}`
          : picked[0]?.name || "Custom Closet Outfit",
    tagline: "Custom mix from your closet",
    colors: picked.map((p) => p.color).slice(0, 3),
    items: picked.map((w) => ({
      type: normalizeSlotType(w.category, w.name),
      name: w.name,
      color: w.color,
      emoji: getPieceEmoji(w.category, "👕", w.name),
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
    setRequestedTab,
  } = useApp()

  const storageKey = `tailor_mannequin_studio_${user.id}`

  const defaultFitStyle = useMemo(
    () => inferFitStyleFromProfile(user.quizProfile?.derived?.filters?.fit_feel),
    [user.quizProfile?.derived?.filters?.fit_feel],
  )

  const [customization, setCustomization] = useState<MannequinCustomization>(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed?.customization) {
          return {
            ...DEFAULT_CUSTOMIZATION,
            fitStyle: defaultFitStyle,
            ...parsed.customization,
          }
        }
      }
    } catch { }
    return { ...DEFAULT_CUSTOMIZATION, fitStyle: defaultFitStyle }
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
  const [studioZoom, setStudioZoom] = useState<number>(1)
  const [measureUnit, setMeasureUnit] = useState<MeasurementUnit>("in")
  const [activeLayers, setActiveLayers] = useState<Record<BuilderSlot, boolean>>({
    Top: true,
    Bottom: true,
    "Full Body": true,
    Outerwear: true,
    Shoes: true,
    Accessory: true,
  })

  // Reload studio customization & pose when switching user persona
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        const parsed = JSON.parse(saved)
        setCustomization(
          parsed?.customization
            ? {
                ...DEFAULT_CUSTOMIZATION,
                fitStyle: defaultFitStyle,
                ...parsed.customization,
              }
            : { ...DEFAULT_CUSTOMIZATION, fitStyle: defaultFitStyle },
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
    setCustomization({ ...DEFAULT_CUSTOMIZATION, fitStyle: defaultFitStyle })
    setPose(DEFAULT_POSE)
    setActivePosePreset("classic")
  }, [storageKey, defaultFitStyle])

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
  const [builderMode, setBuilderMode] = useState<BuilderMode>(() =>
    outfitUsesFullBody(selectedOutfit) ? "full_body" : "separates",
  )

  // Start with mannequin studio collapsed until the user selects/confirms an outfit
  const [outfitSelected, setOutfitSelected] = useState<boolean>(
    () => Boolean(activeTryOnOutfit),
  )

  // Open manual builder automatically when no favorite outfits exist
  const [builderOpen, setBuilderOpen] = useState(
    () => favoriteOutfits.length === 0,
  )
  const [swapSlot, setSwapSlot] = useState<BuilderSlot | null>(null)

  const [step, setStep] = useState<Step>("studio")
  const [wizardStage, setWizardStage] = useState<WizardStage>(() =>
    activeTryOnOutfit ? "subject" : "outfit",
  )
  const [subjectChoice, setSubjectChoice] = useState<SubjectChoice>("mannequin")
  const [pictureSource, setPictureSource] = useState<PictureSource>("saved")
  const [picturePoseMode, setPicturePoseMode] = useState<PicturePoseMode>("direct_photo")
  const [savedProfilePhoto, setSavedProfilePhoto] = useState<SavedProfileTryOnPhoto | null>(null)
  const [tempPictureDataUrl, setTempPictureDataUrl] = useState<string | null>(null)
  const [pictureConsent, setPictureConsent] = useState<boolean>(true)
  const [savingProfilePhoto, setSavingProfilePhoto] = useState(false)
  const tempPhotoInputRef = useRef<HTMLInputElement | null>(null)
  const savedPhotoInputRef = useRef<HTMLInputElement | null>(null)

  const [queueStatusText, setQueueStatusText] = useState<string | null>(null)
  const [liveProgress, setLiveProgress] = useState<TryOnLiveProgress | null>(null)
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
  const lastDepthRef = useRef<string | null>(null)
  const faceUploadInputRef = useRef<HTMLInputElement | null>(null)
  const tryOnAbortRef = useRef<AbortController | null>(null)
  const [lastResultMeta, setLastResultMeta] = useState<{
    model?: string
    elapsedMs?: number
    diagnostics?: TryOnDiagnostics
  } | null>(null)
  const [inspectorOpen, setInspectorOpen] = useState(false)

  const cancelInflightTryOn = () => {
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

  useEffect(() => {
    let active = true
    setSavedProfilePhoto(null)
    void fetchProfileTryOnPhoto(user.id).then((photo) => {
      if (!active) return
      setSavedProfilePhoto(photo)
      if (photo) {
        setPicturePoseMode(photo.photoKind === "portrait" ? "repose_picture" : "direct_photo")
      }
    })
    return () => {
      active = false
    }
  }, [user.id])

  const activeUserPictureUrl =
    pictureSource === "temporary"
      ? tempPictureDataUrl
      : savedProfilePhoto?.imageDataUrl || null

  const handleUploadPictureFile = async (
    e: React.ChangeEvent<HTMLInputElement>,
    saveToProfile: boolean,
  ) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || ""))
        reader.onerror = () => reject(new Error("Could not read image file."))
        reader.readAsDataURL(file)
      })
      setPictureConsent(true)
      if (saveToProfile) {
        setSavingProfilePhoto(true)
        const saved = await saveProfileTryOnPhotoToDb(user.id, {
          imageDataUrl: dataUrl,
          photoKind: picturePoseMode === "repose_picture" ? "portrait" : "full_body",
          consentConfirmed: true,
        })
        setSavedProfilePhoto(saved)
        setPictureSource("saved")
        showToast("Saved to Profile", "Your try-on picture was saved to your local PC database.", "success")
      } else {
        setTempPictureDataUrl(dataUrl)
        setPictureSource("temporary")
        showToast("Temporary Picture Loaded", "This picture stays in memory for this session only.", "info")
      }
    } catch (err) {
      showToast(
        "Photo Upload Error",
        err instanceof Error ? err.message : "Could not load selected picture.",
        "warning",
      )
    } finally {
      setSavingProfilePhoto(false)
    }
  }

  const handleSaveTempToProfile = async () => {
    if (!tempPictureDataUrl) return
    setSavingProfilePhoto(true)
    try {
      const saved = await saveProfileTryOnPhotoToDb(user.id, {
        imageDataUrl: tempPictureDataUrl,
        photoKind: picturePoseMode === "repose_picture" ? "portrait" : "full_body",
        consentConfirmed: pictureConsent,
      })
      setSavedProfilePhoto(saved)
      setPictureSource("saved")
      showToast("Saved to Profile", "Picture persisted to your local SQLite profile database.", "success")
    } catch (err) {
      showToast(
        "Save Failed",
        err instanceof Error ? err.message : "Could not save picture to profile.",
        "warning",
      )
    } finally {
      setSavingProfilePhoto(false)
    }
  }

  const handleDeleteSavedProfilePhoto = async () => {
    setSavingProfilePhoto(true)
    try {
      await deleteProfileTryOnPhotoFromDb(user.id)
      setSavedProfilePhoto(null)
      showToast("Removed", "Deleted saved try-on picture from your profile.", "info")
    } catch (err) {
      showToast(
        "Delete Failed",
        err instanceof Error ? err.message : "Could not remove saved picture.",
        "warning",
      )
    } finally {
      setSavingProfilePhoto(false)
    }
  }

  // Sync incoming outfit selected from Wardrobe -> Favorite Outfits
  useEffect(() => {
    if (!activeTryOnOutfit) return
    setSelectedOutfit(activeTryOnOutfit)
    setBuilderMode(outfitUsesFullBody(activeTryOnOutfit) ? "full_body" : "separates")
    setOutfitSelected(true)
    setWizardStage("subject")
    setBuilderOpen(false)
    setGeneratedImage(null)
    setPoseSnapshot(null)
    lastOpenposeRef.current = null
    lastDepthRef.current = null
    lastKeypointsRef.current = null
    setStep("studio")
    setActiveTryOnOutfit(null)
  }, [activeTryOnOutfit, setActiveTryOnOutfit])

  useEffect(() => {
    lastOpenposeRef.current = null
    lastDepthRef.current = null
    setPoseSnapshot(null)
    setActiveLayers({
      Top: true,
      Bottom: true,
      "Full Body": true,
      Outerwear: true,
      Shoes: true,
      Accessory: true,
    })
  }, [selectedOutfit.id, selectedOutfit.label])

  const activeFitStyle: GarmentFitStyle = customization.fitStyle || "standard"
  const activeSubjectMode: TryOnSubjectMode =
    customization.subjectMode || "mannequin"
  const activeHandFootPreset: HandFootPresetId =
    customization.handFootPreset || "neutral"
  const bodyMeasurements = useMemo(
    () => deriveBodyMeasurements(customization),
    [
      customization.height,
      customization.shoulders,
      customization.chest,
      customization.waistHips,
      customization.limbBuild,
    ],
  )
  const sizeSuggest = useMemo(
    () => suggestSizes(bodyMeasurements),
    [bodyMeasurements],
  )
  const fitSummary = useMemo(
    () => fitIndicator(activeFitStyle, bodyMeasurements, measureUnit),
    [activeFitStyle, bodyMeasurements, measureUnit],
  )
  const activeGarmentPreviewLayers = useMemo<StudioGarmentPreviewLayer[]>(() => {
    const out: StudioGarmentPreviewLayer[] = []
    for (const item of selectedOutfit.items) {
      const slot = normalizeSlotType(item.type, item.name)
      if (
        (slot === "Top" ||
          slot === "Bottom" ||
          slot === "Full Body" ||
          slot === "Outerwear" ||
          slot === "Shoes" ||
          slot === "Accessory") &&
        activeLayers[slot] !== false
      ) {
        out.push({ slot, name: item.name, color: item.color })
      }
    }
    return out
  }, [selectedOutfit.items, activeLayers])

  const toggleLayer = (slot: BuilderSlot) => {
    setActiveLayers((prev) => ({
      ...prev,
      [slot]: prev[slot] === false,
    }))
  }

  const adjustZoom = (delta: number) => {
    setStudioZoom((prev) => {
      const next = Math.round((prev + delta) * 100) / 100
      return Math.min(1.75, Math.max(1, next))
    })
  }

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
      setBuilderMode(outfitUsesFullBody(next) ? "full_body" : "separates")
      showToast(
        "Quick Look Loaded",
        `Loaded "${next.label}" onto your studio.`,
        "info",
      )
      return
    }
    const fallback = buildFallbackWardrobeOutfit(wardrobe)
    setSelectedOutfit(fallback)
    setBuilderMode(outfitUsesFullBody(fallback) ? "full_body" : "separates")
  }

  const handleSwitchBuilderMode = (mode: BuilderMode) => {
    setBuilderMode(mode)
    setSelectedOutfit((prev) => {
      const clean = wardrobe.filter((w) => (w.status || "clean") === "clean")
      const pool = clean.length > 0 ? clean : wardrobe
      if (mode === "full_body") {
        const retained = prev.items.filter((i) => {
          const s = normalizeSlotType(i.type, i.name)
          return s !== "Top" && s !== "Bottom" && s !== "Full Body"
        })
        const existingFull = prev.items.find(
          (i) => normalizeSlotType(i.type, i.name) === "Full Body",
        )
        const pickedFull =
          existingFull ||
          (() => {
            const w = pool.find((item) => item.category === "Full Body")
            if (!w) return undefined
            return {
              type: "Full Body",
              name: w.name,
              color: w.color,
              emoji: getPieceEmoji(w.category, "👗", w.name),
              imageData:
                w.imageData || getSampleGarmentImage(w.name, w.category),
              wardrobeItemId: w.id,
            } satisfies FavoriteOutfitItem
          })()
        const nextItems = pickedFull ? [pickedFull, ...retained] : retained
        const outer = nextItems.find(
          (i) => normalizeSlotType(i.type, i.name) === "Outerwear",
        )
        return {
          ...prev,
          id: `custom-${Date.now()}`,
          label: pickedFull
            ? outer
              ? `${pickedFull.name} & ${outer.name}`
              : pickedFull.name
            : "Dress / Full Body Look",
          tagline: `Manual mix · ${nextItems.length} piece${nextItems.length === 1 ? "" : "s"}`,
          items: nextItems,
          colors: nextItems.map((i) => i.color).slice(0, 3),
        }
      }

      const retained = prev.items.filter(
        (i) => normalizeSlotType(i.type, i.name) !== "Full Body",
      )
      const hasTop = retained.some(
        (i) => normalizeSlotType(i.type, i.name) === "Top",
      )
      const hasBottom = retained.some(
        (i) => normalizeSlotType(i.type, i.name) === "Bottom",
      )
      const extras: FavoriteOutfitItem[] = []
      if (!hasTop) {
        const w = pool.find((item) => item.id === 14) || pool.find((item) => item.category === "Tops")
        if (w) {
          extras.push({
            type: "Top",
            name: w.name,
            color: w.color,
            emoji: getPieceEmoji(w.category, "👕", w.name),
            imageData: w.imageData || getSampleGarmentImage(w.name, w.category),
            wardrobeItemId: w.id,
          })
        }
      }
      if (!hasBottom) {
        const w = pool.find((item) => item.id === 13) || pool.find((item) => item.category === "Bottoms")
        if (w) {
          extras.push({
            type: "Bottom",
            name: w.name,
            color: w.color,
            emoji: getPieceEmoji(w.category, "👖", w.name),
            imageData: w.imageData || getSampleGarmentImage(w.name, w.category),
            wardrobeItemId: w.id,
          })
        }
      }
      const nextItems = [...extras, ...retained]
      const topOrOuter =
        nextItems.find((i) => {
          const s = normalizeSlotType(i.type, i.name)
          return s === "Top" || s === "Outerwear"
        }) || nextItems[0]
      const bottom = nextItems.find(
        (i) => normalizeSlotType(i.type, i.name) === "Bottom",
      )
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
  }

  const handleSwapSlotItem = (slot: BuilderSlot, w: WardrobeItem) => {
    const piece: FavoriteOutfitItem = {
      type: slot,
      name: w.name,
      color: w.color,
      emoji: getPieceEmoji(w.category, "👕", w.name),
      imageData: w.imageData,
      wardrobeItemId: w.id,
    }
    if (slot === "Full Body") {
      setBuilderMode("full_body")
    } else if (slot === "Top" || slot === "Bottom") {
      setBuilderMode("separates")
    }
    setSelectedOutfit((prev) => {
      const conflicts = (item: FavoriteOutfitItem) => {
        const s = normalizeSlotType(item.type, item.name)
        if (s === slot) return true
        if (slot === "Full Body") return s === "Top" || s === "Bottom"
        if (slot === "Top" || slot === "Bottom") return s === "Full Body"
        return false
      }
      const filtered = prev.items.filter((i) => !conflicts(i))
      const nextItems = [...filtered, piece]
      const fullBody = nextItems.find(
        (i) => normalizeSlotType(i.type, i.name) === "Full Body",
      )
      const topOrOuter =
        nextItems.find((i) => {
          const s = normalizeSlotType(i.type, i.name)
          return s === "Top" || s === "Outerwear"
        }) || nextItems[0]
      const bottom = nextItems.find(
        (i) => normalizeSlotType(i.type, i.name) === "Bottom",
      )
      const outer = nextItems.find(
        (i) => normalizeSlotType(i.type, i.name) === "Outerwear",
      )
      return {
        ...prev,
        id: `custom-${Date.now()}`,
        label: fullBody
          ? outer
            ? `${fullBody.name} & ${outer.name}`
            : fullBody.name
          : topOrOuter && bottom
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

  const handleRemoveSlot = (slot: "Outerwear" | "Shoes" | "Accessory") => {
    setSelectedOutfit((prev) => {
      const nextItems = prev.items.filter(
        (i) => normalizeSlotType(i.type, i.name) !== slot,
      )
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
        "Face Uploaded",
        "Confirm portrait consent below to blend your photo onto the generated preview.",
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
    forceFreshStudioBase = false,
  ) => {
    if (simulatedError && !bypassSimulatedError) {
      setGenerationError(
        "Simulated error active. Tap Retry Generation or disable Test Error.",
      )
      setStep("error")
      return
    }

    if (
      customization.includeMyFace &&
      cameraPreset !== "back" &&
      customization.faceImageData &&
      !customization.faceConsentConfirmed
    ) {
      setStudioTab("face")
      showToast(
        "Portrait Consent Required",
        "Please check the portrait permission box in the Face tab before generating with an uploaded photo.",
        "warning",
      )
      return
    }

    const garments = selectedOutfit.items
      .filter((item) => {
        const slot = normalizeSlotType(item.type, item.name)
        const isSupported =
          slot === "Full Body" ||
          slot === "Top" ||
          slot === "Bottom" ||
          slot === "Outerwear" ||
          slot === "Shoes" ||
          slot === "Accessory"
        if (!isSupported) return false
        return activeLayers[slot as BuilderSlot] !== false
      })
      .sort((a, b) => {
        const rank = (t: string, n: string) => {
          const s = normalizeSlotType(t, n)
          if (s === "Full Body") return 0
          if (s === "Outerwear") return 1
          if (s === "Top") return 2
          if (s === "Bottom") return 3
          if (s === "Shoes") return 4
          return 5
        }
        return rank(a.type, a.name) - rank(b.type, b.name)
      })

    const hasPrimaryGarment = garments.some((g) => {
      const s = normalizeSlotType(g.type, g.name)
      return (
        s === "Full Body" ||
        s === "Top" ||
        s === "Outerwear" ||
        s === "Bottom"
      )
    })

    if (!hasPrimaryGarment) {
      const hadOutfitItems = selectedOutfit.items.some((g) => {
        const s = normalizeSlotType(g.type, g.name)
        return s === "Full Body" || s === "Top" || s === "Outerwear" || s === "Bottom"
      })
      showToast(
        hadOutfitItems ? "Enable a Garment Layer" : "Add a Garment First",
        hadOutfitItems
          ? "Turn on at least one Top, Bottom, Outerwear, or Dress layer above the studio before generating."
          : "Select a Dress / Full Body piece or a Top, Outerwear, or Bottom to generate a try-on.",
        "warning",
      )
      return
    }

    const usingPicture = subjectChoice === "picture"
    const directPhotoActive = usingPicture && picturePoseMode === "direct_photo" && Boolean(activeUserPictureUrl)
    if (usingPicture && !activeUserPictureUrl) {
      showToast(
        "Upload a Picture First",
        "Choose your saved profile picture or upload a temporary picture before generating.",
        "warning",
      )
      setWizardStage("subject")
      return
    }
    if (usingPicture && !pictureConsent) {
      showToast(
        "Portrait Consent Required",
        "Confirm permission to use this picture before generating a try-on.",
        "warning",
      )
      setWizardStage("subject")
      return
    }

    let bareSnapshot = reuseSnapshot || ""
    let openposeSnapshot = reuseSnapshot ? lastOpenposeRef.current || "" : ""
    let depthSnapshot = reuseSnapshot ? lastDepthRef.current || "" : ""
    let capturedKeypoints = lastKeypointsRef.current
    if (directPhotoActive && activeUserPictureUrl) {
      bareSnapshot = activeUserPictureUrl
    } else if (!bareSnapshot || !openposeSnapshot || !depthSnapshot) {
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
      depthSnapshot = captureRes.depthImageDataUrl
      capturedKeypoints = captureRes.keypoints
      lastKeypointsRef.current = capturedKeypoints
      lastOpenposeRef.current = openposeSnapshot
      lastDepthRef.current = depthSnapshot
    }

    setBarePoseSnapshot(bareSnapshot)
    setPoseSnapshot(bareSnapshot)
    setGeneratedImage(null)
    setGenerationError("")
    setLiveProgress({
      phase: "queued",
      label: "Submitting job to local GPU worker…",
      percent: 4,
    })
    setQueueStatusText("Submitting job to local GPU worker…")
    setStep("processing")

    const abortController = new AbortController()
    tryOnAbortRef.current = abortController

    try {
      const preparedGarments = garments.map((g) => {
        const match = wardrobe.find(
          (w) =>
            w.id === g.wardrobeItemId ||
            w.name.trim().toLowerCase() === g.name.trim().toLowerCase(),
        )
        return {
          imageUrl: getGarmentImageForTryOn(g, wardrobe),
          description: g.name,
          type: normalizeSlotType(g.type, g.name),
          color: g.color,
          colorName: match?.colorName || "",
          material: match?.material || "",
        }
      })

      const poseLabel =
        activePosePreset === "custom"
          ? "Custom Pose"
          : POSE_PRESETS[activePosePreset].label

      const startedLocal = performance.now()
      const effectiveSubjectMode = usingPicture ? "human" : activeSubjectMode
      const effectivePhotoMode = usingPicture ? picturePoseMode : "none"
      const result = await submitAndPollTryOnJob(
        {
          mannequinImage: bareSnapshot,
          openposeImage: directPhotoActive ? undefined : openposeSnapshot,
          depthImage: directPhotoActive ? undefined : depthSnapshot,
          userPhotoImage: usingPicture ? activeUserPictureUrl || undefined : undefined,
          photoMode: effectivePhotoMode,
          userId: user.id,
          outfitLabel: selectedOutfit.label,
          garments: preparedGarments,
          keypoints: directPhotoActive ? undefined : capturedKeypoints,
          bodySliders: {
            height: customization.height,
            shoulders: customization.shoulders,
            chest: customization.chest,
            waistHips: customization.waistHips,
            limbBuild: customization.limbBuild,
          },
          subjectMode: effectiveSubjectMode,
          handFootPreset: activeHandFootPreset,
          cameraPreset,
          backdropPreset,
          poseLabel,
          bodyPreset: BODY_PRESET_VALUES[customization.bodyPreset].label,
          fitStyle: activeFitStyle,
          materialId: customization.materialId,
          includeMyFace: usingPicture
            ? picturePoseMode === "repose_picture" && cameraPreset !== "back"
            : customization.includeMyFace && cameraPreset !== "back",
          faceImage: usingPicture
            ? picturePoseMode === "repose_picture" && cameraPreset !== "back"
              ? activeUserPictureUrl || undefined
              : undefined
            : customization.includeMyFace && cameraPreset !== "back"
              ? customization.faceImageData || defaultFacePortrait
              : undefined,
          hasCustomFaceUpload: usingPicture
            ? Boolean(activeUserPictureUrl)
            : Boolean(customization.faceImageData),
          faceConsentConfirmed: usingPicture
            ? pictureConsent
            : Boolean(customization.faceConsentConfirmed || !customization.faceImageData),
          bypassPoseCache: forceFreshStudioBase,
          seed: forceFreshStudioBase
            ? Math.floor(Math.random() * 2_000_000_000)
            : undefined,
        },
        {
          signal: abortController.signal,
          onProgress: (progress) => {
            if (progress.progress) {
              setLiveProgress(progress.progress)
              setQueueStatusText(progress.progress.label)
              return
            }
            if (progress.status === "queued") {
              const pos = progress.position ?? 1
              const msg =
                pos > 1
                  ? `Queued on host GPU (#${pos} in line)…`
                  : "Queued — waiting for GPU slot…"
              setLiveProgress({ phase: "queued", label: msg, percent: 5 })
              setQueueStatusText(msg)
            } else if (progress.status === "running") {
              const secs = progress.elapsedMs
                ? ` (${(progress.elapsedMs / 1000).toFixed(1)}s)`
                : ""
              setQueueStatusText(`Running on host GPU${secs}…`)
            } else if (progress.status === "completed") {
              setLiveProgress({ phase: "completed", label: "Render complete!", percent: 100 })
              setQueueStatusText("Render complete; loading your preview…")
            } else if (progress.status === "failed") {
              setQueueStatusText("Host GPU reported a generation failure.")
            }
          },
        },
      )

      setGeneratedImage(result.imageUrl)
      setLastResultMeta({
        model: result.model,
        elapsedMs:
          result.elapsedMs ?? Math.round(performance.now() - startedLocal),
        diagnostics: result.diagnostics,
      })
      setResultView("ai")
      setStep("preview")
      showToast(
        result.diagnostics?.stage1Cached
          ? "Instant Pose-Cached Try-On Ready!"
          : "AI Try-On Ready!",
        result.diagnostics?.stage1Cached
          ? "Reused cached Stage-1 studio pose and draped your new outfit via FastFit."
          : "Your posed studio virtual try-on render is ready.",
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
    const fitLabel = FIT_EASE[activeFitStyle]?.label || "Standard"
    const text = `Virtual Fitting Room for ${selectedOutfit.label}. Mannequin configured as ${bodyLabel}, ${fitLabel} fit, ${matLabel} finish, in ${poseLabel}${customization.includeMyFace && cameraPreset !== "back" ? " with your face included" : ""}. Pieces: ${itemsText}.`
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
    ? wardrobe.filter((w) => normalizeSlotType(w.category, w.name) === swapSlot)
    : []

  const getSlotItem = (slot: BuilderSlot) =>
    selectedOutfit.items.find(
      (i) => normalizeSlotType(i.type, i.name) === slot,
    )

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

      {/* 4-Step Try-On Wizard Stepper: 1. Outfit -> 2. Model/Picture -> 3. Pose & Lighting -> 4. Generate */}
      <nav
        aria-label="Try-On steps"
        className="grid grid-cols-4 gap-1 p-1 rounded-2xl bg-card border-2 border-border shadow-2xs"
      >
        {(
          [
            { id: "outfit", num: "1", label: "Outfit" },
            { id: "subject", num: "2", label: "Model / Pic" },
            { id: "pose", num: "3", label: "Pose & Light" },
            { id: "generate", num: "4", label: "Generate" },
          ] as const
        ).map((s) => {
          const isActive =
            (step === "studio" && wizardStage === s.id) ||
            ((step === "processing" || step === "preview" || step === "error") &&
              s.id === "generate")
          const isDone =
            (s.id === "outfit" && (wizardStage !== "outfit" || step !== "studio")) ||
            (s.id === "subject" && (wizardStage === "pose" || step !== "studio")) ||
            (s.id === "pose" && step !== "studio")
          const canJump =
            s.id === "outfit" ||
            (s.id === "subject" && outfitSelected) ||
            (s.id === "pose" && outfitSelected) ||
            (s.id === "generate" && Boolean(generatedImage))
          return (
            <button
              key={s.id}
              type="button"
              disabled={!canJump}
              onClick={() => {
                if (s.id === "outfit") {
                  setStep("studio")
                  setOutfitSelected(false)
                  setWizardStage("outfit")
                } else if (s.id === "subject") {
                  setStep("studio")
                  setOutfitSelected(true)
                  setWizardStage("subject")
                } else if (s.id === "pose") {
                  setStep("studio")
                  setOutfitSelected(true)
                  setWizardStage("pose")
                } else if (s.id === "generate" && generatedImage) {
                  setStep("preview")
                }
              }}
              className={`min-h-[34px] px-1.5 py-1 rounded-xl text-[10px] font-black transition-all flex items-center justify-center gap-1 ${
                isActive
                  ? "bg-pink text-white shadow-xs"
                  : isDone
                    ? "bg-turquoise/15 text-foreground hover:bg-turquoise/25 cursor-pointer"
                    : canJump
                      ? "bg-muted text-foreground hover:bg-muted/80 cursor-pointer"
                      : "text-muted-foreground/55 cursor-not-allowed"
              }`}
            >
              <span aria-hidden="true">{isDone && !isActive ? "✓" : s.num}</span>
              <span className="truncate">{s.label}</span>
            </button>
          )
        })}
      </nav>

      {/* Step 1: Select or Build an Outfit */}
      {step === "studio" && wizardStage === "outfit" && (
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
                        setBuilderMode(outfitUsesFullBody(fav) ? "full_body" : "separates")
                        setOutfitSelected(true)
                        setWizardStage("subject")
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

              {/* Silhouette Mode Toggle: Separates vs Dress / Full Body */}
              <div
                role="group"
                aria-label="Outfit structure mode"
                className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-muted border border-border"
              >
                <button
                  type="button"
                  onClick={() => handleSwitchBuilderMode("separates")}
                  aria-pressed={builderMode === "separates"}
                  className={`min-h-[34px] px-2.5 py-1 rounded-lg text-[11px] font-black transition-all cursor-pointer ${
                    builderMode === "separates"
                      ? "bg-card text-foreground border border-turquoise shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  👕 Top + Bottom
                </button>
                <button
                  type="button"
                  onClick={() => handleSwitchBuilderMode("full_body")}
                  aria-pressed={builderMode === "full_body"}
                  className={`min-h-[34px] px-2.5 py-1 rounded-lg text-[11px] font-black transition-all cursor-pointer ${
                    builderMode === "full_body"
                      ? "bg-card text-foreground border border-pink shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  👗 Dress / Full Body
                </button>
              </div>

              {/* Garment Slots */}
              <div className="grid grid-cols-2 gap-1.5">
                {(builderMode === "full_body"
                  ? (["Full Body", "Outerwear", "Shoes", "Accessory"] as const)
                  : (["Top", "Bottom", "Outerwear", "Shoes", "Accessory"] as const)
                ).map((slot) => {
                  const item = getSlotItem(slot)
                  const isOptional =
                    slot === "Outerwear" ||
                    slot === "Shoes" ||
                    slot === "Accessory"
                  const slotLabel =
                    slot === "Full Body"
                      ? "Dress / Full Body"
                      : slot === "Accessory"
                        ? "Bag / Accessory"
                        : slot
                  return (
                    <div
                      key={slot}
                      className={`flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-xl bg-muted border border-border min-w-0 ${
                        slot === "Full Body" ||
                        (builderMode === "separates" && slot === "Accessory")
                          ? "col-span-2"
                          : ""
                      }`}
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
                            {getPieceEmoji(
                              slot,
                              slot === "Full Body" ? "👗" : "👕",
                              item?.name,
                            )}
                          </span>
                        )}
                        <div className="min-w-0">
                          <p className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground leading-none">
                            {slotLabel}
                          </p>
                          <p className="text-xs font-bold text-foreground truncate mt-0.5">
                            {item ? item.name : `Pick ${slotLabel}…`}
                          </p>
                        </div>
                      </button>
                      {isOptional && item && (
                        <button
                          type="button"
                          onClick={() => handleRemoveSlot(slot)}
                          aria-label={`Remove ${slotLabel}`}
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

      {/* Collapsed Active Outfit Summary Bar + Non-Destructive Layer Toggles */}
      {step === "studio" && outfitSelected && (
        <div className="rounded-2xl px-3 py-2.5 border-2 border-border bg-card space-y-2 shadow-sm">
          <div className="flex items-center justify-between gap-2">
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
                onClick={() => {
                  setOutfitSelected(false)
                  setWizardStage("outfit")
                }}
                className="min-h-[34px] px-2.5 py-1 rounded-xl text-[11px] font-extrabold bg-muted text-foreground border-2 border-border hover:border-turquoise cursor-pointer"
              >
                ✎ Change Outfit
              </button>
            </div>
          </div>

          {/* Interactive Garment Layer Visibility Toggles */}
          <div
            role="group"
            aria-label="Toggle garment layers"
            className="flex items-center gap-1.5 flex-wrap pt-1.5 border-t border-border/70"
          >
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground mr-0.5">
              Layers:
            </span>
            {(outfitUsesFullBody(selectedOutfit)
              ? (["Full Body", "Outerwear", "Shoes", "Accessory"] as const)
              : (["Top", "Bottom", "Outerwear", "Shoes", "Accessory"] as const)
            ).map((layerSlot) => {
              const slotItem = getSlotItem(layerSlot)
              const hasItem = Boolean(slotItem)
              const isOn = hasItem && activeLayers[layerSlot] !== false
              const shortLabel =
                layerSlot === "Full Body"
                  ? "Dress"
                  : layerSlot === "Accessory"
                    ? "Bag/Acc."
                    : layerSlot
              return (
                <button
                  key={layerSlot}
                  type="button"
                  disabled={!hasItem}
                  aria-pressed={isOn}
                  onClick={() => hasItem && toggleLayer(layerSlot)}
                  title={
                    hasItem
                      ? `Toggle ${shortLabel} (${slotItem?.name})`
                      : `No ${shortLabel} in this outfit`
                  }
                  className={`min-h-[28px] px-2.5 py-0.5 rounded-xl text-[11px] font-extrabold inline-flex items-center gap-1.5 border transition-all ${
                    !hasItem
                      ? "bg-muted/40 text-muted-foreground/50 border-border cursor-not-allowed"
                      : isOn
                        ? "bg-turquoise/15 text-foreground border-turquoise shadow-2xs cursor-pointer"
                        : "bg-muted text-muted-foreground border-border hover:text-foreground cursor-pointer"
                  }`}
                >
                  {hasItem && slotItem?.color && (
                    <span
                      aria-hidden="true"
                      className="w-2.5 h-2.5 rounded-full border border-black/20 shrink-0"
                      style={{ background: slotItem.color }}
                    />
                  )}
                  <span>{shortLabel}</span>
                  <span className="text-[10px]">{!hasItem ? "—" : isOn ? "✓" : "✕"}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Step 2: Pick Between Mannequin and Picture (Saved Profile Photo or Temporary Upload) */}
      {step === "studio" && wizardStage === "subject" && (
        <div className="rounded-3xl p-4 border-2 border-border bg-card space-y-3.5 shadow-sm">
          <div>
            <h2 className="text-sm font-black text-foreground">
              2. Pick Mannequin or Picture
            </h2>
            <p className="text-[11px] font-medium text-muted-foreground">
              Style on a sculpted studio mannequin, or use your own saved or temporary photo.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              aria-pressed={subjectChoice === "mannequin"}
              onClick={() => {
                setSubjectChoice("mannequin")
                setCustomization((prev) => ({ ...prev, subjectMode: "mannequin", includeMyFace: false }))
              }}
              className={`p-3 rounded-2xl border-2 text-left space-y-1 transition-all cursor-pointer ${
                subjectChoice === "mannequin"
                  ? "bg-pink/10 border-pink shadow-xs"
                  : "bg-muted border-border hover:border-turquoise"
              }`}
            >
              <span className="text-lg block" aria-hidden="true">🗿</span>
              <p className="text-xs font-black text-foreground">Sculpted Mannequin</p>
              <p className="text-[10px] font-medium text-muted-foreground leading-snug">
                Featureless studio mannequin with custom body sliders &amp; finishes.
              </p>
            </button>

            <button
              type="button"
              aria-pressed={subjectChoice === "picture"}
              onClick={() => {
                setSubjectChoice("picture")
                setCustomization((prev) => ({ ...prev, subjectMode: "human" }))
              }}
              className={`p-3 rounded-2xl border-2 text-left space-y-1 transition-all cursor-pointer ${
                subjectChoice === "picture"
                  ? "bg-pink/10 border-pink shadow-xs"
                  : "bg-muted border-border hover:border-turquoise"
              }`}
            >
              <span className="text-lg block" aria-hidden="true">📸</span>
              <p className="text-xs font-black text-foreground">My Picture</p>
              <p className="text-[10px] font-medium text-muted-foreground leading-snug">
                Use your saved profile photo or upload a temporary one-time picture.
              </p>
            </button>
          </div>

          {subjectChoice === "mannequin" && (
            <div className="rounded-2xl p-3 bg-muted/60 border border-border space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-black uppercase tracking-wider text-foreground">
                  Mannequin Finish
                </span>
                <span className="text-[11px] font-bold text-muted-foreground">
                  {MANNEQUIN_MATERIALS[customization.materialId].label}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {(Object.keys(MANNEQUIN_MATERIALS) as MannequinMaterialId[]).map((matId) => {
                  const mat = MANNEQUIN_MATERIALS[matId]
                  const active = customization.materialId === matId
                  return (
                    <button
                      key={matId}
                      type="button"
                      onClick={() => setCustomization((prev) => ({ ...prev, materialId: matId }))}
                      aria-label={`Mannequin finish: ${mat.label}`}
                      aria-pressed={active}
                      className={`w-7 h-7 rounded-full border-2 cursor-pointer transition-transform ${
                        active ? "border-pink scale-110 ring-2 ring-pink/30" : "border-black/20"
                      }`}
                      style={{ background: mat.swatch }}
                      title={mat.label}
                    />
                  )
                })}
              </div>
            </div>
          )}

          {subjectChoice === "picture" && (
            <div className="rounded-2xl p-3 bg-muted/60 border border-border space-y-3">
              {/* Saved Profile Photo vs Temporary Picture Toggle */}
              <div
                role="group"
                aria-label="Picture source"
                className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-card border border-border"
              >
                <button
                  type="button"
                  aria-pressed={pictureSource === "saved"}
                  onClick={() => setPictureSource("saved")}
                  className={`min-h-[34px] px-2 py-1 rounded-lg text-[11px] font-black cursor-pointer ${
                    pictureSource === "saved"
                      ? "bg-pink text-white shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  💾 Saved Profile Photo
                </button>
                <button
                  type="button"
                  aria-pressed={pictureSource === "temporary"}
                  onClick={() => setPictureSource("temporary")}
                  className={`min-h-[34px] px-2 py-1 rounded-lg text-[11px] font-black cursor-pointer ${
                    pictureSource === "temporary"
                      ? "bg-turquoise text-[#0D0F18] shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  ⏱ Temporary Upload
                </button>
              </div>

              <div className="flex items-center gap-3">
                {activeUserPictureUrl ? (
                  <img
                    src={activeUserPictureUrl}
                    alt="Selected try-on picture"
                    className="w-20 h-24 rounded-xl object-cover border-2 border-turquoise shrink-0 bg-card"
                  />
                ) : (
                  <div className="w-20 h-24 rounded-xl border-2 border-dashed border-border bg-card flex flex-col items-center justify-center text-muted-foreground shrink-0">
                    <span className="text-xl" aria-hidden="true">📷</span>
                    <span className="text-[9px] font-bold mt-0.5">No photo</span>
                  </div>
                )}

                <div className="flex-1 min-w-0 space-y-2">
                  <input
                    ref={savedPhotoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => void handleUploadPictureFile(e, true)}
                  />
                  <input
                    ref={tempPhotoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => void handleUploadPictureFile(e, false)}
                  />

                  {pictureSource === "saved" ? (
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-semibold text-foreground leading-snug">
                        {savedProfilePhoto
                          ? "Loaded from your profile SQLite database."
                          : "No saved picture yet — upload one to store in your profile."}
                      </p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          type="button"
                          disabled={savingProfilePhoto}
                          onClick={() => savedPhotoInputRef.current?.click()}
                          className="px-3 py-1.5 rounded-xl text-[11px] font-black bg-turquoise text-[#0D0F18] border border-[#0D0F18]/20 hover:brightness-105 cursor-pointer"
                        >
                          {savingProfilePhoto
                            ? "Saving…"
                            : savedProfilePhoto
                              ? "Replace Saved Photo"
                              : "Upload & Save to Profile"}
                        </button>
                        {savedProfilePhoto && (
                          <button
                            type="button"
                            disabled={savingProfilePhoto}
                            onClick={() => void handleDeleteSavedProfilePhoto()}
                            className="px-2.5 py-1.5 rounded-xl text-[11px] font-extrabold bg-card text-red border border-border hover:border-red cursor-pointer"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-semibold text-foreground leading-snug">
                        Temporary picture stays only in this session (not written to your profile DB).
                      </p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          type="button"
                          onClick={() => tempPhotoInputRef.current?.click()}
                          className="px-3 py-1.5 rounded-xl text-[11px] font-black bg-turquoise text-[#0D0F18] border border-[#0D0F18]/20 hover:brightness-105 cursor-pointer"
                        >
                          {tempPictureDataUrl ? "Choose Another Photo" : "Upload Temporary Photo"}
                        </button>
                        {tempPictureDataUrl && (
                          <button
                            type="button"
                            disabled={savingProfilePhoto}
                            onClick={() => void handleSaveTempToProfile()}
                            className="px-2.5 py-1.5 rounded-xl text-[11px] font-extrabold bg-card text-foreground border border-border hover:border-turquoise cursor-pointer"
                          >
                            💾 Also Save to Profile
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Smart Picture Pose Mode */}
              <div className="space-y-1.5 pt-1 border-t border-border/70">
                <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground block">
                  How should we apply your picture?
                </span>
                <div className="grid grid-cols-1 gap-1.5">
                  <button
                    type="button"
                    aria-pressed={picturePoseMode === "direct_photo"}
                    onClick={() => setPicturePoseMode("direct_photo")}
                    className={`p-2.5 rounded-xl border-2 text-left cursor-pointer ${
                      picturePoseMode === "direct_photo"
                        ? "bg-card border-pink"
                        : "bg-card/50 border-border hover:border-turquoise"
                    }`}
                  >
                    <p className="text-[11px] font-black text-foreground">
                      🧍 Full-Body Photo — Keep My Exact Pose &amp; Face (Recommended)
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Drapes clothes directly on your photo; your real face stays 100% untouched pixel-for-pixel.
                    </p>
                  </button>
                  <button
                    type="button"
                    aria-pressed={picturePoseMode === "repose_picture"}
                    onClick={() => setPicturePoseMode("repose_picture")}
                    className={`p-2.5 rounded-xl border-2 text-left cursor-pointer ${
                      picturePoseMode === "repose_picture"
                        ? "bg-card border-pink"
                        : "bg-card/50 border-border hover:border-turquoise"
                    }`}
                  >
                    <p className="text-[11px] font-black text-foreground">
                      🕺 Re-Pose / Face Portrait — Pick Any Studio Pose + 512×512 Face Detailer
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Poses your look in the 2D Pose Studio and runs a high-res 512×512 facial detail pass so faces stay sharp.
                    </p>
                  </button>
                </div>
              </div>

              <label className="flex items-start gap-2 text-[10px] font-semibold text-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={pictureConsent}
                  onChange={(e) => setPictureConsent(e.target.checked)}
                  className="mt-0.5 accent-pink"
                />
                <span>
                  I confirm this is my own photo (or I have explicit consent) for local academic virtual try-on.
                </span>
              </label>
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                setOutfitSelected(false)
                setWizardStage("outfit")
              }}
              className="min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-extrabold border-2 border-border bg-muted text-foreground hover:border-turquoise cursor-pointer"
            >
              ← Outfit
            </button>
            <button
              type="button"
              onClick={() => {
                if (subjectChoice === "picture" && !activeUserPictureUrl) {
                  showToast("Upload a Picture", "Select or upload a picture first, or choose Mannequin.", "warning")
                  return
                }
                setWizardStage("pose")
              }}
              className="flex-1 min-h-[44px] py-2 px-4 rounded-xl text-xs font-black bg-pink text-white border-2 border-[#0D0F18]/20 shadow-md shadow-pink/20 hover:brightness-110 cursor-pointer"
            >
              Continue to 3. Pose &amp; Lighting →
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Pose & Lighting (Direct Photo preview OR Interactive 2D Pose Studio) */}
      {step === "studio" && wizardStage === "pose" && subjectChoice === "picture" && picturePoseMode === "direct_photo" && activeUserPictureUrl && (
        <div className="rounded-3xl p-4 border-2 border-border bg-card space-y-3 shadow-sm">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <h2 className="text-sm font-black text-foreground">
                3. Photo &amp; Studio Lighting
              </h2>
              <p className="text-[11px] font-medium text-muted-foreground">
                Keeping your exact pose &amp; face intact. Pick a studio lighting mood or switch to Re-Pose.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPicturePoseMode("repose_picture")}
              className="px-2.5 py-1 rounded-xl text-[11px] font-extrabold bg-muted text-foreground border border-border hover:border-turquoise cursor-pointer"
            >
              🕺 Switch to Re-Pose Studio
            </button>
          </div>

          <div
            className="relative rounded-3xl overflow-hidden border-2 border-border shadow-md mx-auto w-full max-w-[340px] flex items-center justify-center"
            style={{ background: STUDIO_BACKDROP_PRESETS[backdropPreset].bg }}
          >
            <div className="absolute top-2.5 left-2.5 z-20">
              <StudioBackdropCornerBar value={backdropPreset} onChange={setBackdropPreset} />
            </div>
            <img
              src={activeUserPictureUrl}
              alt="Your uploaded full-body try-on photo"
              className="w-full h-auto max-h-[480px] object-contain block"
            />
            <span className="absolute bottom-2 left-2.5 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-black/65 text-white">
              📸 Real Face &amp; Pose Locked
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setWizardStage("subject")}
              className="min-h-[46px] px-3.5 py-2 rounded-2xl text-xs font-extrabold border-2 border-border bg-muted text-foreground hover:border-turquoise cursor-pointer"
            >
              ← Model / Pic
            </button>
            <button
              type="button"
              onClick={() => void handleGenerateFromPose()}
              className="flex-1 min-h-[48px] py-2.5 px-4 rounded-2xl text-sm font-black bg-pink text-white border-2 border-[#0D0F18]/20 shadow-lg shadow-pink/25 hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <span aria-hidden="true">✨</span>
              <span>Generate AI Try-On</span>
            </button>
          </div>
        </div>
      )}

      {/* Step 3 Expanded: Interactive 2D Pose & Lighting Studio (Mannequin or Re-Posed Picture) */}
      {step === "studio" &&
        wizardStage === "pose" &&
        !(subjectChoice === "picture" && picturePoseMode === "direct_photo" && activeUserPictureUrl) && (
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
              zoom={studioZoom}
              fitStyle={activeFitStyle}
              garmentPreviewLayers={activeGarmentPreviewLayers}
              onRegisterCapture={handleRegisterCapture}
            />

            {/* Floating Bottom Studio HUD: Mannequin Finish badge (bottom-left) + Zoom & Drag Hint (bottom-right) */}
            <div className="absolute bottom-2 left-2.5 right-2.5 z-20 flex items-center justify-between gap-1.5 pointer-events-none flex-wrap">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider shadow-sm bg-white/90 text-neutral-900 border border-black/10">
                  {activeSubjectMode === "human" ? "🧑 Studio Model" : "🗿 Mannequin"} ·{" "}
                  {BODY_PRESET_VALUES[customization.bodyPreset].label} ·{" "}
                  {FIT_EASE[activeFitStyle].label} ·{" "}
                  {MANNEQUIN_MATERIALS[customization.materialId].label}
                </span>
                {customization.includeMyFace && cameraPreset !== "back" && (
                  <span className="px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-wider shadow-sm bg-pink text-white">
                    😊 My Face
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5 ml-auto pointer-events-auto">
                <div
                  role="group"
                  aria-label="Studio viewport zoom"
                  className="inline-flex items-center rounded-full bg-white/92 backdrop-blur-xs border border-black/15 shadow-xs overflow-hidden text-[10px] font-black text-neutral-900"
                >
                  <button
                    type="button"
                    aria-label="Zoom out"
                    disabled={studioZoom <= 1}
                    onClick={() => adjustZoom(-0.35)}
                    className="px-2 py-0.5 hover:bg-black/5 disabled:opacity-40 cursor-pointer"
                  >
                    −
                  </button>
                  <button
                    type="button"
                    aria-label="Reset studio zoom"
                    onClick={() => setStudioZoom(1)}
                    title="Reset studio zoom (AI render stays full-body)"
                    className="px-1.5 py-0.5 border-x border-black/10 tabular-nums hover:bg-black/5 cursor-pointer"
                  >
                    {studioZoom === 1 ? "1×" : `${studioZoom.toFixed(2).replace(/\.?0+$/, "")}×`}
                  </button>
                  <button
                    type="button"
                    aria-label="Zoom in"
                    disabled={studioZoom >= 1.7}
                    onClick={() => adjustZoom(0.35)}
                    className="px-2 py-0.5 hover:bg-black/5 disabled:opacity-40 cursor-pointer"
                  >
                    +
                  </button>
                </div>

                <div className="hidden min-[420px]:block px-2.5 py-1 rounded-full bg-white/90 backdrop-blur-xs border border-black/10 text-[10px] font-bold text-neutral-700 whitespace-nowrap pointer-events-none">
                  Drag joints ({JOINT_LABELS[selectedJoint]}) · Pull wrist/ankle for IK
                </div>
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

          {/* Studio Control Panel Tabs (Pose / Body / Face) + Subject Mode Toggle */}
          <div className="rounded-3xl p-3 border-2 border-border bg-card space-y-3 shadow-sm">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                Studio Subject Mode
              </span>
              <div
                role="group"
                aria-label="Studio subject rendering mode"
                className="grid grid-cols-2 gap-1 p-0.5 rounded-xl bg-muted border border-border"
              >
                {(
                  [
                    { id: "mannequin" as const, label: "🗿 Sculpted Mannequin" },
                    { id: "human" as const, label: "🧑 Realistic Studio Model" },
                  ]
                ).map((m) => {
                  const active = activeSubjectMode === m.id
                  return (
                    <button
                      key={m.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        setCustomization((prev) => ({
                          ...prev,
                          subjectMode: m.id,
                        }))
                      }
                      className={`min-h-[30px] px-2.5 py-1 rounded-lg text-[11px] font-extrabold transition-all cursor-pointer ${
                        active
                          ? "bg-card text-foreground border border-pink shadow-2xs"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {m.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div
              role="tablist"
              aria-label="Mannequin studio controls"
              className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-muted border border-border"
            >
              {(
                [
                  { id: "pose", label: "🕺 Pose" },
                  { id: "body", label: "📐 Body & Fit" },
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

                {/* DWpose Hand & Foot Micro-Presets */}
                <div className="space-y-1.5 pt-2 border-t border-border">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-black uppercase tracking-wider text-foreground">
                      DWpose Hand &amp; Foot Articulation
                    </span>
                    <span className="text-[10px] font-semibold text-muted-foreground">
                      {HAND_FOOT_PRESETS[activeHandFootPreset].desc}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {(Object.keys(HAND_FOOT_PRESETS) as HandFootPresetId[]).map(
                      (hfId) => {
                        const hf = HAND_FOOT_PRESETS[hfId]
                        const active = activeHandFootPreset === hfId
                        return (
                          <button
                            key={hfId}
                            type="button"
                            aria-pressed={active}
                            onClick={() =>
                              setCustomization((prev) => ({
                                ...prev,
                                handFootPreset: hfId,
                              }))
                            }
                            className={`min-h-[34px] px-2 py-1 rounded-xl text-[11px] font-extrabold border transition-all cursor-pointer ${
                              active
                                ? "bg-turquoise/15 text-foreground border-turquoise shadow-2xs"
                                : "bg-muted text-muted-foreground border-border hover:text-foreground"
                            }`}
                          >
                            {hf.emoji} {hf.label}
                          </button>
                        )
                      },
                    )}
                  </div>
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

            {/* Tab 2: Garment Fit/Ease, Body Proportions, Live Measurements & Finish */}
            {studioTab === "body" && (
              <div className="space-y-3">
                {/* Garment Fit / Ease Selector + Fit Indicator */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-black uppercase tracking-wider text-foreground">
                      Garment Fit &amp; Ease
                    </span>
                    <span className="text-[10px] font-semibold text-muted-foreground">
                      {FIT_EASE[activeFitStyle].note}
                    </span>
                  </div>
                  <div
                    role="group"
                    aria-label="Garment fit and ease"
                    className="grid grid-cols-3 gap-1.5"
                  >
                    {(["fitted", "standard", "relaxed"] as const).map((styleId) => {
                      const active = activeFitStyle === styleId
                      return (
                        <button
                          key={styleId}
                          type="button"
                          aria-pressed={active}
                          onClick={() =>
                            setCustomization((prev) => ({
                              ...prev,
                              fitStyle: styleId,
                            }))
                          }
                          className={`min-h-[36px] px-2.5 py-1.5 rounded-xl text-xs font-extrabold border-2 transition-all cursor-pointer ${
                            active
                              ? "bg-pink text-white border-[#0D0F18]/20 shadow-xs"
                              : "bg-muted text-foreground border-border hover:border-pink"
                          }`}
                        >
                          {FIT_EASE[styleId].label}
                        </button>
                      )
                    })}
                  </div>
                  <div className="rounded-xl px-3 py-2 bg-turquoise/10 border border-turquoise/40 text-[11px]">
                    <span className="font-extrabold uppercase tracking-wider text-[9px] text-muted-foreground block">
                      Fit indicator · {FIT_EASE[activeFitStyle].label} · estimate / demo
                    </span>
                    <p className="font-bold text-foreground mt-0.5 leading-snug">
                      {fitSummary.summary}
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5 pt-1 border-t border-border">
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

                {/* Live Slider-Driven Measurements & Suggested Sizes */}
                <div className="rounded-2xl p-3 border border-border bg-muted/45 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                      Mannequin Measurements · estimate / demo
                    </span>
                    <div
                      role="group"
                      aria-label="Measurement units"
                      className="inline-flex rounded-lg border border-border bg-card p-0.5 text-[10px] font-extrabold"
                    >
                      {(["in", "cm"] as const).map((u) => (
                        <button
                          key={u}
                          type="button"
                          aria-pressed={measureUnit === u}
                          onClick={() => setMeasureUnit(u)}
                          className={`px-2 py-0.5 rounded-md cursor-pointer transition-colors ${
                            measureUnit === u
                              ? "bg-turquoise text-[#0D0F18]"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {u}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                    {(
                      [
                        ["Height", formatMeasurement(bodyMeasurements.heightCm, measureUnit, true)],
                        ["Chest", formatMeasurement(bodyMeasurements.chestCm, measureUnit)],
                        ["Waist", formatMeasurement(bodyMeasurements.waistCm, measureUnit)],
                        ["Hip", formatMeasurement(bodyMeasurements.hipCm, measureUnit)],
                        ["Inseam", formatMeasurement(bodyMeasurements.inseamCm, measureUnit)],
                        ["Shoulder", formatMeasurement(bodyMeasurements.shoulderCm, measureUnit)],
                      ] as const
                    ).map(([label, val]) => (
                      <div
                        key={label}
                        className="rounded-xl bg-card border border-border px-2.5 py-1.5"
                      >
                        <div className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
                          {label}
                        </div>
                        <div className="font-extrabold text-foreground tabular-nums">
                          {val}
                        </div>
                      </div>
                    ))}
                  </div>

                  <p className="text-[11px] font-semibold text-muted-foreground leading-snug">
                    Suggested from figure ·{" "}
                    <span className="text-foreground font-extrabold">
                      Tops {sizeSuggest.tops}
                    </span>{" "}
                    ·{" "}
                    <span className="text-foreground font-extrabold">
                      Bottoms {sizeSuggest.bottoms}
                    </span>{" "}
                    ·{" "}
                    <span className="text-foreground font-extrabold">
                      Dress {sizeSuggest.dress}
                    </span>{" "}
                    · Ease +{formatEaseValue(FIT_EASE[activeFitStyle].chestEaseCm, measureUnit)}/
                    +{formatEaseValue(FIT_EASE[activeFitStyle].waistEaseCm, measureUnit)}/
                    +{formatEaseValue(FIT_EASE[activeFitStyle].hipEaseCm, measureUnit)}
                  </p>
                  {user.quizProfile?.derived?.consent?.sizes !== false &&
                    user.typicalSizes && (
                      <p className="text-[10px] font-semibold text-muted-foreground leading-snug">
                        Saved profile sizes ({user.name.split(" ")[0]}):{" "}
                        <span className="text-foreground font-bold">
                          {user.typicalSizes}
                        </span>
                      </p>
                    )}
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
                      {customization.faceImageData && (
                        <label className="flex items-start gap-2 pt-1.5 text-[11px] font-semibold text-foreground cursor-pointer">
                          <input
                            type="checkbox"
                            checked={Boolean(customization.faceConsentConfirmed)}
                            onChange={(e) =>
                              setCustomization((prev) => ({
                                ...prev,
                                faceConsentConfirmed: e.target.checked,
                              }))
                            }
                            className="mt-0.5 accent-pink cursor-pointer"
                          />
                          <span className="leading-snug text-muted-foreground">
                            I confirm this is my photo (or I have explicit permission) for local non-commercial AI preview. Face data is processed ephemerally in RAM and never stored remotely.
                          </span>
                        </label>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Processing Screen — Accurate Real-Time GPU Step Progress */}
      {step === "processing" && (() => {
        const phase = liveProgress?.phase || "queued"
        const pct = Math.max(4, Math.min(100, liveProgress?.percent ?? 5))
        const phaseOrder = ["queued", "validating", "preparing", "stage1", "stage1_cached", "face_detailer", "stage2", "finalizing", "completed"]
        const curIdx = phaseOrder.indexOf(phase)
        const needsFacePass = subjectChoice === "picture" && picturePoseMode === "repose_picture" && cameraPreset !== "back"
        const stages = [
          {
            id: "preparing",
            label: "1. Preparing pose, depth & real garment photos",
            done: curIdx > phaseOrder.indexOf("preparing"),
            active: phase === "queued" || phase === "validating" || phase === "preparing",
            detail: phase === "queued" ? "Waiting in GPU queue" : undefined,
          },
          {
            id: "stage1",
            label:
              phase === "stage1_cached"
                ? "2. Studio pose & lighting (Reused cached pose ⚡)"
                : "2. Stage 1 — Pose & studio lighting (ControlNet Union)",
            done: curIdx > phaseOrder.indexOf("stage1_cached"),
            active: phase === "stage1" || phase === "stage1_cached",
            detail:
              phase === "stage1" && liveProgress?.totalSteps
                ? `Step ${liveProgress.step ?? 0} / ${liveProgress.totalSteps}`
                : undefined,
          },
          ...(needsFacePass
            ? [
                {
                  id: "face_detailer",
                  label: "3. High-Res 512×512 Face Detailer (preventing distortion)",
                  done: curIdx > phaseOrder.indexOf("face_detailer"),
                  active: phase === "face_detailer",
                  detail:
                    phase === "face_detailer" && liveProgress?.totalSteps
                      ? `Step ${liveProgress.step ?? 0} / ${liveProgress.totalSteps}`
                      : undefined,
                },
              ]
            : []),
          {
            id: "stage2",
            label: `${needsFacePass ? "4" : "3"}. Stage 2 — Draping garments (FastFit-MR-1024)`,
            done: curIdx > phaseOrder.indexOf("stage2"),
            active: phase === "stage2",
            detail:
              phase === "stage2" && liveProgress?.totalSteps
                ? `Step ${liveProgress.step ?? 0} / ${liveProgress.totalSteps}`
                : undefined,
          },
          {
            id: "finalizing",
            label: `${needsFacePass ? "5" : "4"}. Finalizing preview & AI disclosure metadata`,
            done: phase === "completed",
            active: phase === "finalizing",
            detail: undefined,
          },
        ]
        return (
          <div className="rounded-3xl p-5 space-y-4 max-w-md mx-auto border-2 border-border bg-card shadow-xl">
            <div className="flex items-center gap-3">
              {poseSnapshot && (
                <div className="w-16 h-20 rounded-xl overflow-hidden border-2 border-turquoise shadow-sm bg-[#E8E5EE] shrink-0">
                  <img
                    src={poseSnapshot}
                    alt="Try-on input reference"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-black text-foreground truncate">
                    Generating Try-On…
                  </p>
                  <span className="text-xs font-black tabular-nums text-pink">
                    {pct}%
                  </span>
                </div>
                <p className="text-[11px] font-bold text-muted-foreground leading-snug">
                  {liveProgress?.label || queueStatusText || "Starting local GPU pipeline…"}
                </p>
                <div
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={liveProgress?.label || "AI try-on progress"}
                  className="h-2.5 rounded-full overflow-hidden bg-muted border border-border"
                >
                  <div
                    aria-hidden="true"
                    className="h-full rounded-full bg-gradient-to-r from-turquoise to-pink transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            </div>

            <ol className="space-y-1.5 text-left">
              {stages.map((st) => (
                <li
                  key={st.id}
                  className={`px-3 py-2 rounded-xl border text-[11px] font-bold flex items-center justify-between gap-2 transition-colors ${
                    st.active
                      ? "bg-pink/10 border-pink text-foreground"
                      : st.done
                        ? "bg-turquoise/10 border-turquoise/40 text-foreground"
                        : "bg-muted/40 border-border/60 text-muted-foreground"
                  }`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span
                      aria-hidden="true"
                      className={`w-4 h-4 rounded-full inline-flex items-center justify-center text-[10px] font-black shrink-0 ${
                        st.done
                          ? "bg-turquoise text-[#0D0F18]"
                          : st.active
                            ? "bg-pink text-white animate-pulse"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {st.done ? "✓" : st.active ? "•" : "○"}
                    </span>
                    <span className="truncate">{st.label}</span>
                  </span>
                  {st.detail && (
                    <span className="text-[10px] font-black tabular-nums text-pink shrink-0">
                      {st.detail}
                    </span>
                  )}
                </li>
              ))}
            </ol>

            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => {
                  cancelInflightTryOn()
                  setStep("studio")
                  setWizardStage("pose")
                }}
                className="min-h-[38px] text-xs py-1.5 px-5 rounded-xl font-extrabold border-2 border-border text-foreground bg-muted cursor-pointer"
              >
                Cancel &amp; Back to Pose
              </button>
            </div>
          </div>
        )
      })()}

      {/* Result Preview & Side-by-Side Comparison */}
      {step === "preview" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap">
              <AIStatusPill state="success" label="AI Virtual Try-On Ready" />
              {lastResultMeta?.diagnostics && (
                <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-turquoise/15 text-foreground border border-turquoise/50">
                  {lastResultMeta.diagnostics.stage1Cached
                    ? `⚡ Cached Pose · ${((lastResultMeta.elapsedMs || lastResultMeta.diagnostics.stage2Ms || 0) / 1000).toFixed(1)}s`
                    : `Stage 1+2 · ${((lastResultMeta.elapsedMs || 0) / 1000).toFixed(1)}s`}{" "}
                  ·{" "}
                  {lastResultMeta.diagnostics.passes === 2
                    ? "2-Pass Layered"
                    : "1-Pass VTON"}
                </span>
              )}
            </div>
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
              className="relative rounded-3xl overflow-hidden border-2 border-border shadow-xl mx-auto w-full max-w-[360px] flex items-center justify-center"
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
                className="w-full h-auto max-h-[540px] object-contain block"
              />
              <div className="absolute bottom-2 left-2.5 right-2.5 z-20 flex justify-between items-center pointer-events-none">
                <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-black/65 text-white backdrop-blur-xs">
                  {lastResultMeta?.diagnostics?.aiDisclosure ||
                    "AI-Generated Preview"}
                </span>
              </div>
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
              🕺 Re-Pose &amp; Swap Layers
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
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => void handleGenerateFromPose(false, poseSnapshot || undefined, false)}
                title="Re-drape garments using cached Stage-1 studio pose"
                className="min-h-[42px] px-2 py-2 rounded-xl text-[11px] font-extrabold border-2 border-border bg-muted text-foreground hover:border-turquoise cursor-pointer"
              >
                ↻ Re-Drape
              </button>
              <button
                type="button"
                onClick={() => void handleGenerateFromPose(false, poseSnapshot || undefined, true)}
                title="Re-roll Stage-1 studio lighting/model seed & re-drape"
                className="min-h-[42px] px-2 py-2 rounded-xl text-[11px] font-extrabold border-2 border-border bg-muted text-foreground hover:border-pink cursor-pointer"
              >
                🎲 Fresh Base
              </button>
            </div>
          </div>

          {/* Collapsible Pose Conditioning & GPU Cache Inspector + Model Attribution */}
          {lastResultMeta?.diagnostics && (
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <button
                type="button"
                aria-expanded={inspectorOpen}
                onClick={() => setInspectorOpen((o) => !o)}
                className="w-full px-3.5 py-2.5 flex items-center justify-between text-left text-xs font-extrabold text-foreground hover:bg-muted/60 cursor-pointer"
              >
                <span>
                  🔍 Pose Conditioning &amp; GPU Cache Inspector
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {inspectorOpen ? "Hide ▲" : "Inspect Maps ▼"}
                </span>
              </button>
              {inspectorOpen && (
                <div className="px-3.5 pb-3.5 pt-1 border-t border-border space-y-2.5">
                  <div className="flex flex-wrap gap-2 text-[11px] font-bold text-muted-foreground">
                    <span>
                      Stage 1 (ControlNet Union):{" "}
                      <strong className="text-foreground">
                        {lastResultMeta.diagnostics.stage1Cached
                          ? "0 ms (LRU Cache Hit ⚡)"
                          : `${lastResultMeta.diagnostics.stage1Ms ?? 0} ms`}
                      </strong>
                    </span>
                    <span>·</span>
                    <span>
                      Stage 2 (FastFit-MR-1024):{" "}
                      <strong className="text-foreground">
                        {lastResultMeta.diagnostics.stage2Ms ?? 0} ms (
                        {lastResultMeta.diagnostics.passes ?? 1} pass
                        {lastResultMeta.diagnostics.passes === 2 ? "es" : ""})
                      </strong>
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {lastResultMeta.diagnostics.dwposePreview && (
                      <div className="rounded-xl overflow-hidden border border-border bg-black text-center">
                        <span className="block py-0.5 text-[9px] font-extrabold text-white bg-neutral-900">
                          DWpose (Hands/Feet)
                        </span>
                        <img
                          src={lastResultMeta.diagnostics.dwposePreview}
                          alt="DWpose skeleton conditioning map"
                          className="w-full h-32 object-contain"
                        />
                      </div>
                    )}
                    {lastResultMeta.diagnostics.depthPreview && (
                      <div className="rounded-xl overflow-hidden border border-border bg-black text-center">
                        <span className="block py-0.5 text-[9px] font-extrabold text-white bg-neutral-900">
                          2D Volume Depth
                        </span>
                        <img
                          src={lastResultMeta.diagnostics.depthPreview}
                          alt="2D depth volume conditioning map"
                          className="w-full h-32 object-contain"
                        />
                      </div>
                    )}
                    {lastResultMeta.diagnostics.maskPreview && (
                      <div className="rounded-xl overflow-hidden border border-border bg-black text-center">
                        <span className="block py-0.5 text-[9px] font-extrabold text-white bg-neutral-900">
                          VTON Slot Mask
                        </span>
                        <img
                          src={lastResultMeta.diagnostics.maskPreview}
                          alt="FastFit slot inpainting mask"
                          className="w-full h-32 object-contain"
                        />
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-snug">
                    Models: {lastResultMeta.model || "RealVisXL V5.0 Lightning + ControlNet Union + FastFit-MR-1024"}.{" "}
                    The FastFit Model is licensed by LavieAI under the FastFit Non-Commercial License (Copyright LavieAI; non-commercial academic use only).
                  </p>
                </div>
              )}
            </div>
          )}
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
                Choose {swapSlot === "Full Body" ? "Dress / Full Body" : swapSlot} from Closet
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
                <div className="py-5 text-center space-y-2.5">
                  <p className="text-xs text-muted-foreground">
                    No pieces found in the{" "}
                    {swapSlot === "Full Body" ? "Dresses / Full Body" : swapSlot}{" "}
                    category yet.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSwapSlot(null)
                      setRequestedTab("wardrobe")
                    }}
                    className="px-3.5 py-2 rounded-xl text-xs font-black bg-turquoise/15 text-turquoise border border-turquoise/40 hover:bg-turquoise/25 cursor-pointer"
                  >
                    + Add one in Closet →
                  </button>
                </div>
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
                        {getPieceEmoji(w.category, "👕", w.name)}
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
