import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { AIErrorBanner } from "../components/AIComponents"
import { AiHostNoticeBanner } from "../components/AiHostStatus"
import { useApp } from "../context/AppContext"
import { getSampleGarmentImage } from "../data/personaData"
import {
  deleteProfileTryOnPhotoFromDb,
  fetchProfileTryOnPhoto,
  formatAiErrorMessage,
  saveProfileTryOnPhotoToDb,
  submitAndPollTryOnJob,
  type SavedProfileTryOnPhoto,
  type TryOnLiveProgress,
} from "../lib/aiHost"
import {
  getGarmentEmoji,
  normalizeGarmentSlot,
  type TryOnSlot,
} from "../lib/garmentCategories"
import { getGarmentImageForTryOn } from "../lib/garmentFlatLay"
import {
  getReadableColorLabel,
  speakText,
  stopSpeaking,
} from "../services/accessibilityHelpers"
import type {
  FavoriteOutfit,
  FavoriteOutfitItem,
  GarmentFitStyle,
  Outfit,
  WardrobeItem,
} from "../types"

type ScreenStep = "outfit" | "subject" | "processing" | "preview" | "error"
type SubjectChoice = "picture" | "mannequin"
type ResultViewMode = "after" | "compare"
type BuilderSlot =
  | "Top"
  | "Bottom"
  | "Full Body"
  | "Outerwear"
  | "Shoes"
  | "Accessory"
type BuilderMode = "separates" | "full_body"

type MannequinBodyOptionId = "petite" | "standard" | "curvy" | "tall"
type MannequinPoseOptionId = "standing" | "hands_on_hips" | "relaxed" | "sitting"

const MANNEQUIN_BODIES: { id: MannequinBodyOptionId; label: string }[] = [
  { id: "petite", label: "Petite" },
  { id: "standard", label: "Standard" },
  { id: "curvy", label: "Curvy" },
  { id: "tall", label: "Tall" },
]

const MANNEQUIN_POSES: { id: MannequinPoseOptionId; label: string; emoji: string }[] = [
  { id: "standing", label: "Standing", emoji: "🧍" },
  { id: "hands_on_hips", label: "Hands on Hips", emoji: "💃" },
  { id: "relaxed", label: "Relaxed", emoji: "✨" },
  { id: "sitting", label: "Sitting", emoji: "🪑" },
]

const FIT_OPTIONS: { id: GarmentFitStyle; label: string }[] = [
  { id: "fitted", label: "Fitted" },
  { id: "standard", label: "Regular" },
  { id: "relaxed", label: "Relaxed" },
]

function getMannequinImagePath(
  body: MannequinBodyOptionId,
  pose: MannequinPoseOptionId,
): string {
  return `/mannequins/${body}_${pose}.png`
}

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

  const prefsKey = `tailor_tryon_prefs_v2_${user.id}`

  const [mannequinBody, setMannequinBody] = useState<MannequinBodyOptionId>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(prefsKey) || "{}")
      if (MANNEQUIN_BODIES.some((b) => b.id === saved.body)) return saved.body
    } catch { }
    return "standard"
  })
  const [mannequinPose, setMannequinPose] = useState<MannequinPoseOptionId>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(prefsKey) || "{}")
      if (MANNEQUIN_POSES.some((p) => p.id === saved.pose)) return saved.pose
    } catch { }
    return "standing"
  })
  const [fitStyle, setFitStyle] = useState<GarmentFitStyle>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(prefsKey) || "{}")
      if (saved.fitStyle === "fitted" || saved.fitStyle === "standard" || saved.fitStyle === "relaxed") {
        return saved.fitStyle
      }
    } catch { }
    return "standard"
  })

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(prefsKey) || "{}")
      setMannequinBody(
        MANNEQUIN_BODIES.some((b) => b.id === saved.body) ? saved.body : "standard",
      )
      setMannequinPose(
        MANNEQUIN_POSES.some((p) => p.id === saved.pose) ? saved.pose : "standing",
      )
      setFitStyle(
        saved.fitStyle === "fitted" || saved.fitStyle === "standard" || saved.fitStyle === "relaxed"
          ? saved.fitStyle
          : "standard",
      )
    } catch {
      setMannequinBody("standard")
      setMannequinPose("standing")
      setFitStyle("standard")
    }
  }, [prefsKey])

  useEffect(() => {
    try {
      localStorage.setItem(
        prefsKey,
        JSON.stringify({ body: mannequinBody, pose: mannequinPose, fitStyle }),
      )
    } catch { }
  }, [prefsKey, mannequinBody, mannequinPose, fitStyle])

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
  const [builderOpen, setBuilderOpen] = useState(
    () => favoriteOutfits.length === 0,
  )
  const [swapSlot, setSwapSlot] = useState<BuilderSlot | null>(null)
  const [activeLayers, setActiveLayers] = useState<Record<BuilderSlot, boolean>>({
    Top: true,
    Bottom: true,
    "Full Body": true,
    Outerwear: true,
    Shoes: true,
    Accessory: true,
  })

  const [step, setStep] = useState<ScreenStep>(() =>
    activeTryOnOutfit ? "subject" : "outfit",
  )
  const [subjectChoice, setSubjectChoice] = useState<SubjectChoice>("picture")
  const [savedProfilePhoto, setSavedProfilePhoto] = useState<SavedProfileTryOnPhoto | null>(null)
  const [sessionPhotoUrl, setSessionPhotoUrl] = useState<string | null>(null)
  const [rememberPhoto, setRememberPhoto] = useState<boolean>(true)
  const [photoBusy, setPhotoBusy] = useState(false)
  const photoInputRef = useRef<HTMLInputElement | null>(null)

  const [liveProgress, setLiveProgress] = useState<TryOnLiveProgress | null>(null)
  const [beforeImage, setBeforeImage] = useState<string | null>(null)
  const [generatedImage, setGeneratedImage] = useState<string | null>(null)
  const [generationError, setGenerationError] = useState("")
  const [resultView, setResultView] = useState<ResultViewMode>("after")
  const [speakingPreview, setSpeakingPreview] = useState(false)

  const tryOnAbortRef = useRef<AbortController | null>(null)

  const cancelInflightTryOn = () => {
    if (tryOnAbortRef.current) {
      tryOnAbortRef.current.abort()
      tryOnAbortRef.current = null
    }
  }

  useEffect(() => {
    return () => {
      cancelInflightTryOn()
      stopSpeaking()
    }
  }, [])

  // Load saved photo for active user; default to "My Photo" when saved, else keep "My Photo" ready to upload
  useEffect(() => {
    let active = true
    setSavedProfilePhoto(null)
    setSessionPhotoUrl(null)
    void fetchProfileTryOnPhoto(user.id).then((photo) => {
      if (!active) return
      setSavedProfilePhoto(photo)
      if (photo) {
        setSubjectChoice("picture")
      }
    })
    return () => {
      active = false
    }
  }, [user.id])

  // Sync incoming outfit selected from Today, Ask AI, or Closet
  useEffect(() => {
    if (!activeTryOnOutfit) return
    setSelectedOutfit(activeTryOnOutfit)
    setBuilderMode(outfitUsesFullBody(activeTryOnOutfit) ? "full_body" : "separates")
    setBuilderOpen(false)
    setGeneratedImage(null)
    setBeforeImage(null)
    setStep("subject")
    setActiveTryOnOutfit(null)
  }, [activeTryOnOutfit, setActiveTryOnOutfit])

  useEffect(() => {
    setActiveLayers({
      Top: true,
      Bottom: true,
      "Full Body": true,
      Outerwear: true,
      Shoes: true,
      Accessory: true,
    })
  }, [selectedOutfit.id, selectedOutfit.label])

  useEffect(() => {
    if (favoriteOutfits.length === 0) {
      setBuilderOpen(true)
    }
  }, [favoriteOutfits.length])

  const activeUserPhotoUrl = sessionPhotoUrl || savedProfilePhoto?.imageDataUrl || null
  const activeMannequinUrl = getMannequinImagePath(mannequinBody, mannequinPose)

  const handlePhotoSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return

    setPhotoBusy(true)
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || ""))
        reader.onerror = () => reject(new Error("Could not read that image."))
        reader.readAsDataURL(file)
      })

      if (rememberPhoto) {
        try {
          const saved = await saveProfileTryOnPhotoToDb(user.id, {
            imageDataUrl: dataUrl,
            photoKind: "full_body",
            consentConfirmed: true,
          })
          setSavedProfilePhoto(saved)
          setSessionPhotoUrl(null)
          showToast("Photo Ready", "Saved for your future try-ons.", "success")
        } catch {
          // If backend storage isn't reachable yet, still use the photo for this session
          setSessionPhotoUrl(dataUrl)
          showToast("Photo Loaded", "Ready to use for this try-on.", "info")
        }
      } else {
        setSessionPhotoUrl(dataUrl)
        showToast("Photo Loaded", "Ready to use for this try-on only.", "info")
      }
    } catch (err) {
      showToast(
        "Couldn't Open Photo",
        err instanceof Error ? err.message : "Please try a different image.",
        "warning",
      )
    } finally {
      setPhotoBusy(false)
    }
  }

  const handleToggleRememberPhoto = async (checked: boolean) => {
    setRememberPhoto(checked)
    if (checked && sessionPhotoUrl) {
      setPhotoBusy(true)
      try {
        const saved = await saveProfileTryOnPhotoToDb(user.id, {
          imageDataUrl: sessionPhotoUrl,
          photoKind: "full_body",
          consentConfirmed: true,
        })
        setSavedProfilePhoto(saved)
        setSessionPhotoUrl(null)
        showToast("Photo Saved", "We'll remember this photo for next time.", "success")
      } catch {
        // Keep session photo quietly
      } finally {
        setPhotoBusy(false)
      }
    }
  }

  const handleRemovePhoto = async () => {
    setPhotoBusy(true)
    try {
      if (savedProfilePhoto) {
        await deleteProfileTryOnPhotoFromDb(user.id)
      }
      setSavedProfilePhoto(null)
      setSessionPhotoUrl(null)
      showToast("Photo Removed", "Your saved photo has been cleared.", "info")
    } catch (err) {
      showToast(
        "Couldn't Remove Photo",
        err instanceof Error ? err.message : "Please try again.",
        "warning",
      )
    } finally {
      setPhotoBusy(false)
    }
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
          tagline: `Custom mix · ${nextItems.length} piece${nextItems.length === 1 ? "" : "s"}`,
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
        const w =
          pool.find((item) => item.id === 14) ||
          pool.find((item) => item.category === "Tops")
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
        const w =
          pool.find((item) => item.id === 13) ||
          pool.find((item) => item.category === "Bottoms")
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
        tagline: `Custom mix · ${nextItems.length} pieces`,
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
        tagline: `Custom mix · ${nextItems.length} pieces`,
        items: nextItems,
        colors: nextItems.map((i) => i.color).slice(0, 3),
      }
    })
    setSwapSlot(null)
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

  const toggleLayer = (slot: BuilderSlot) => {
    setActiveLayers((prev) => ({
      ...prev,
      [slot]: prev[slot] === false,
    }))
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

  const handleGenerate = async (freshSeed = false) => {
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
      showToast(
        "Pick at Least One Piece",
        "Turn on or add a top, bottom, jacket, or dress to try on.",
        "warning",
      )
      return
    }

    const usingPicture = subjectChoice === "picture"
    if (usingPicture && !activeUserPhotoUrl) {
      showToast(
        "Add a Photo First",
        "Upload a photo of yourself, or switch to Mannequin.",
        "warning",
      )
      return
    }

    const referenceImg = usingPicture ? activeUserPhotoUrl! : activeMannequinUrl
    setBeforeImage(referenceImg)
    setGeneratedImage(null)
    setGenerationError("")
    setLiveProgress({
      phase: "subject",
      label: usingPicture ? "Preparing your photo…" : "Preparing studio mannequin…",
      percent: 6,
    })
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

      const result = await submitAndPollTryOnJob(
        {
          mannequinImage: usingPicture ? undefined : activeMannequinUrl,
          userPhotoImage: usingPicture ? activeUserPhotoUrl || undefined : undefined,
          photoMode: usingPicture ? "direct_photo" : "none",
          userId: user.id,
          outfitLabel: selectedOutfit.label,
          garments: preparedGarments,
          subjectMode: usingPicture ? "human" : "mannequin",
          poseLabel: mannequinPose,
          bodyPreset: mannequinBody,
          fitStyle,
          includeMyFace: false,
          hasCustomFaceUpload: usingPicture,
          faceConsentConfirmed: true,
          seed: freshSeed ? Math.floor(Math.random() * 2_000_000_000) : undefined,
        },
        {
          signal: abortController.signal,
          onProgress: (progress) => {
            if (progress.progress) {
              setLiveProgress(progress.progress)
              return
            }
            if (progress.status === "queued") {
              setLiveProgress({
                phase: "queued",
                label: "Getting ready…",
                percent: 6,
              })
            } else if (progress.status === "completed") {
              setLiveProgress({
                phase: "completed",
                label: "All done!",
                percent: 100,
              })
            }
          },
        },
      )

      setGeneratedImage(result.imageUrl)
      setResultView("after")
      setStep("preview")
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return
      }
      setGenerationError(
        formatAiErrorMessage(
          error,
          "We couldn't create this preview right now. Please try again.",
        ),
      )
      setStep("error")
    } finally {
      if (tryOnAbortRef.current === abortController) {
        tryOnAbortRef.current = null
      }
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

  const handleDownloadImage = () => {
    if (!generatedImage) return
    const a = document.createElement("a")
    a.href = generatedImage
    const slug = selectedOutfit.label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
    a.download = `tailor-tryon-${slug || "look"}.jpg`
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  const showListen = Boolean(
    user.accessibility.visionImpairment || user.accessibility.voiceNarration,
  )

  const handleDescribeAloud = () => {
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
    const whoText =
      subjectChoice === "picture"
        ? "using your own photo"
        : `on a ${mannequinBody} mannequin in a ${mannequinPose.replace("_", " ")} pose`
    const text = `Virtual Try-On for ${selectedOutfit.label}, ${whoText}. Pieces: ${itemsText}.`
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

  const swapPool = swapSlot
    ? wardrobe.filter((w) => normalizeSlotType(w.category, w.name) === swapSlot)
    : []

  const getSlotItem = (slot: BuilderSlot) =>
    selectedOutfit.items.find(
      (i) => normalizeSlotType(i.type, i.name) === slot,
    )

  return (
    <div className="pt-1 pb-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h1
            className="text-xl font-black text-foreground leading-tight"
            style={{ fontFamily: "Nunito, sans-serif" }}
          >
            Virtual Try-On
          </h1>
          <p className="text-xs font-semibold text-muted-foreground mt-0.5 leading-snug">
            See how your outfits look on you or a studio mannequin.
          </p>
        </div>
        {showListen && (
          <button
            type="button"
            onClick={handleDescribeAloud}
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

      <AiHostNoticeBanner featureName="Virtual Try-On" />

      {/* Simple 2-Step Indicator (shown during setup steps) */}
      {(step === "outfit" || step === "subject") && (
        <nav
          aria-label="Try-On steps"
          className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-card border-2 border-border shadow-2xs"
        >
          <button
            type="button"
            onClick={() => setStep("outfit")}
            aria-current={step === "outfit" ? "step" : undefined}
            className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              step === "outfit"
                ? "bg-pink text-white shadow-xs"
                : "bg-turquoise/15 text-foreground hover:bg-turquoise/25"
            }`}
          >
            <span aria-hidden="true">{step === "subject" ? "✓" : "1"}</span>
            <span>Choose Outfit</span>
          </button>
          <button
            type="button"
            onClick={() => setStep("subject")}
            aria-current={step === "subject" ? "step" : undefined}
            className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              step === "subject"
                ? "bg-pink text-white shadow-xs"
                : "bg-muted text-foreground hover:bg-muted/80"
            }`}
          >
            <span aria-hidden="true">2</span>
            <span>Preview &amp; Try On</span>
          </button>
        </nav>
      )}

      {/* STEP 1: Choose or Mix an Outfit */}
      {step === "outfit" && (
        <div className="rounded-3xl p-4 border-2 border-border bg-card space-y-3.5 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-black text-foreground">
                Pick an Outfit to Try On
              </h2>
              <p className="text-xs font-medium text-muted-foreground">
                Tap a saved look or mix pieces from your closet.
              </p>
            </div>
            {favoriteOutfits.length > 0 && (
              <button
                type="button"
                onClick={() => setBuilderOpen((o) => !o)}
                className="shrink-0 px-2.5 py-1.5 rounded-xl text-[11px] font-extrabold bg-muted text-foreground border border-border hover:border-turquoise cursor-pointer"
              >
                {builderOpen ? "Hide Builder ▲" : "Mix & Match ▼"}
              </button>
            )}
          </div>

          {favoriteOutfits.length > 0 && (
            <div className="space-y-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-muted-foreground block">
                Saved Outfits
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
                        setStep("subject")
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
                              className="w-10 h-10 rounded-xl border-2 border-card overflow-hidden bg-card flex items-center justify-center text-sm shadow-xs"
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
                        Try On →
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Mix & Match Builder */}
          {(favoriteOutfits.length === 0 || builderOpen) && (
            <div className="space-y-3 pt-2 border-t border-border/80">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                  Mix &amp; Match from Closet
                </span>
                <button
                  type="button"
                  onClick={() => handleQuickRecommend()}
                  className="min-h-[34px] px-3 py-1 rounded-xl text-xs font-black bg-turquoise text-[#0D0F18] border border-[#0D0F18]/15 hover:brightness-105 shadow-xs cursor-pointer"
                >
                  ✨ Surprise Me
                </button>
              </div>

              {outfitList.length > 0 && (
                <div className="flex gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
                  {outfitList.map((o, idx) => (
                    <button
                      key={o.direction || o.label}
                      type="button"
                      onClick={() => handleQuickRecommend(idx)}
                      className="shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border border-border bg-muted text-foreground hover:border-turquoise cursor-pointer"
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Top + Bottom vs Dress / Full Body */}
              <div
                role="group"
                aria-label="Outfit style"
                className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-muted border border-border"
              >
                <button
                  type="button"
                  onClick={() => handleSwitchBuilderMode("separates")}
                  aria-pressed={builderMode === "separates"}
                  className={`min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
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
                  className={`min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                    builderMode === "full_body"
                      ? "bg-card text-foreground border border-pink shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  👗 Dress / Jumpsuit
                </button>
              </div>

              {/* Garment Slots */}
              <div className="grid grid-cols-2 gap-2">
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
                      ? "Dress / Jumpsuit"
                      : slot === "Outerwear"
                        ? "Jacket / Coat"
                        : slot === "Accessory"
                          ? "Bag / Accessory"
                          : slot
                  return (
                    <div
                      key={slot}
                      className={`flex items-center justify-between gap-1.5 px-2.5 py-2 rounded-xl bg-muted border border-border min-w-0 ${
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
                            className="w-8 h-8 rounded-lg object-contain bg-card border border-border shrink-0"
                          />
                        ) : (
                          <span
                            aria-hidden="true"
                            className="w-8 h-8 rounded-lg flex items-center justify-center border border-border text-sm shrink-0"
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
                            {item ? item.name : `Add ${slotLabel}…`}
                          </p>
                        </div>
                      </button>
                      {isOptional && item && (
                        <button
                          type="button"
                          onClick={() => handleRemoveSlot(slot)}
                          aria-label={`Remove ${slotLabel}`}
                          className="text-xs font-bold text-muted-foreground hover:text-red px-1.5 py-1 cursor-pointer"
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
                  onClick={() => setStep("subject")}
                  className="min-h-[46px] py-2.5 px-4 rounded-2xl text-sm font-black bg-pink text-white border-2 border-[#0D0F18]/15 hover:brightness-110 shadow-md shadow-pink/20 cursor-pointer"
                >
                  Continue →
                </button>
                <button
                  type="button"
                  onClick={handleToggleCurrentFavorite}
                  aria-pressed={isCurrentFavorited}
                  className={`min-h-[46px] px-3.5 py-2 rounded-2xl text-xs font-extrabold border-2 transition-colors cursor-pointer ${
                    isCurrentFavorited
                      ? "bg-pink/15 text-pink border-pink"
                      : "bg-muted text-foreground border-border hover:border-pink"
                  }`}
                >
                  {isCurrentFavorited ? "♥ Saved" : "♡ Save"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* STEP 2: Choose Who's Wearing It (My Photo or Mannequin) */}
      {step === "subject" && (
        <div className="space-y-3">
          {/* Active Outfit Summary Bar */}
          <div className="rounded-2xl px-3.5 py-2.5 border-2 border-border bg-card space-y-2 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex -space-x-1.5 shrink-0">
                  {selectedOutfit.items.slice(0, 3).map((item) => (
                    <div
                      key={`${item.type}-${item.name}`}
                      className="w-8 h-8 rounded-lg border border-border overflow-hidden bg-card flex items-center justify-center text-xs"
                      style={
                        item.imageData
                          ? undefined
                          : { background: `${item.color}30` }
                      }
                      title={item.name}
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
                  <p className="text-[11px] font-semibold text-muted-foreground truncate">
                    {selectedOutfit.items.map((i) => i.name).join(" + ")}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={handleToggleCurrentFavorite}
                  aria-pressed={isCurrentFavorited}
                  aria-label={isCurrentFavorited ? "Remove from saved outfits" : "Save outfit"}
                  className={`min-h-[34px] px-2.5 py-1 rounded-xl text-xs font-extrabold border-2 transition-colors cursor-pointer ${
                    isCurrentFavorited
                      ? "bg-pink/15 text-pink border-pink"
                      : "bg-muted text-foreground border-border hover:border-pink"
                  }`}
                >
                  {isCurrentFavorited ? "♥" : "♡"}
                </button>
                <button
                  type="button"
                  onClick={() => setStep("outfit")}
                  className="min-h-[34px] px-2.5 py-1 rounded-xl text-xs font-extrabold bg-muted text-foreground border-2 border-border hover:border-turquoise cursor-pointer"
                >
                  Change
                </button>
              </div>
            </div>

            {/* Optional quick toggles for pieces in this outfit */}
            {selectedOutfit.items.length > 1 && (
              <div
                role="group"
                aria-label="Included pieces"
                className="flex items-center gap-1.5 flex-wrap pt-1.5 border-t border-border/70"
              >
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground mr-0.5">
                  Wearing:
                </span>
                {selectedOutfit.items.map((item) => {
                  const slot = normalizeSlotType(item.type, item.name) as BuilderSlot
                  const isOn = activeLayers[slot] !== false
                  const shortLabel =
                    slot === "Full Body"
                      ? "Dress"
                      : slot === "Outerwear"
                        ? "Jacket"
                        : slot === "Accessory"
                          ? "Accessory"
                          : slot
                  return (
                    <button
                      key={`${slot}-${item.name}`}
                      type="button"
                      aria-pressed={isOn}
                      onClick={() => toggleLayer(slot)}
                      className={`min-h-[28px] px-2.5 py-0.5 rounded-xl text-[11px] font-extrabold inline-flex items-center gap-1.5 border transition-all cursor-pointer ${
                        isOn
                          ? "bg-turquoise/15 text-foreground border-turquoise shadow-2xs"
                          : "bg-muted text-muted-foreground border-border hover:text-foreground line-through"
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className="w-2.5 h-2.5 rounded-full border border-black/20 shrink-0"
                        style={{ background: item.color }}
                      />
                      <span>{shortLabel}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Subject Card: My Photo vs Mannequin */}
          <div className="rounded-3xl p-4 border-2 border-border bg-card space-y-3.5 shadow-sm">
            <div
              role="tablist"
              aria-label="Choose who tries on the outfit"
              className="grid grid-cols-2 gap-2"
            >
              <button
                type="button"
                role="tab"
                aria-selected={subjectChoice === "picture"}
                onClick={() => setSubjectChoice("picture")}
                className={`p-3 rounded-2xl border-2 text-left transition-all cursor-pointer flex items-center gap-2.5 ${
                  subjectChoice === "picture"
                    ? "bg-pink/10 border-pink shadow-xs"
                    : "bg-muted border-border hover:border-turquoise"
                }`}
              >
                <span className="text-xl shrink-0" aria-hidden="true">📸</span>
                <div className="min-w-0">
                  <p className="text-xs font-black text-foreground">My Photo</p>
                  <p className="text-[11px] font-medium text-muted-foreground leading-tight">
                    See it on yourself
                  </p>
                </div>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={subjectChoice === "mannequin"}
                onClick={() => setSubjectChoice("mannequin")}
                className={`p-3 rounded-2xl border-2 text-left transition-all cursor-pointer flex items-center gap-2.5 ${
                  subjectChoice === "mannequin"
                    ? "bg-pink/10 border-pink shadow-xs"
                    : "bg-muted border-border hover:border-turquoise"
                }`}
              >
                <span className="text-xl shrink-0" aria-hidden="true">🧍</span>
                <div className="min-w-0">
                  <p className="text-xs font-black text-foreground">Mannequin</p>
                  <p className="text-[11px] font-medium text-muted-foreground leading-tight">
                    No photo needed
                  </p>
                </div>
              </button>
            </div>

            {/* MY PHOTO PANEL */}
            {subjectChoice === "picture" && (
              <div className="space-y-3">
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => void handlePhotoSelected(e)}
                />

                {activeUserPhotoUrl ? (
                  <div className="space-y-2.5">
                    <div className="relative rounded-2xl overflow-hidden border-2 border-border bg-muted mx-auto w-full max-w-[280px] flex items-center justify-center">
                      <img
                        src={activeUserPhotoUrl}
                        alt="Your photo for virtual try-on"
                        className="w-full h-auto max-h-[340px] object-contain block"
                      />
                    </div>
                    <div className="flex items-center justify-center gap-2 flex-wrap">
                      <button
                        type="button"
                        disabled={photoBusy}
                        onClick={() => photoInputRef.current?.click()}
                        className="min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-black bg-muted text-foreground border-2 border-border hover:border-turquoise cursor-pointer disabled:opacity-50"
                      >
                        {photoBusy ? "Loading…" : "📸 Change Photo"}
                      </button>
                      <button
                        type="button"
                        disabled={photoBusy}
                        onClick={() => void handleRemovePhoto()}
                        className="min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-extrabold text-muted-foreground hover:text-red cursor-pointer disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={photoBusy}
                    onClick={() => photoInputRef.current?.click()}
                    className="w-full py-8 px-4 rounded-2xl border-2 border-dashed border-turquoise/70 bg-turquoise/5 hover:bg-turquoise/10 transition-colors flex flex-col items-center justify-center gap-2 text-center cursor-pointer disabled:opacity-50"
                  >
                    <span className="text-3xl" aria-hidden="true">📸</span>
                    <span className="text-sm font-black text-foreground">
                      {photoBusy ? "Opening photo…" : "Upload a Full-Body Photo"}
                    </span>
                    <span className="text-xs font-medium text-muted-foreground max-w-[260px] leading-snug">
                      Use a clear head-to-toe photo (standing or seated) in good lighting.
                    </span>
                  </button>
                )}

                <label className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-muted/70 border border-border text-xs font-bold text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberPhoto}
                    onChange={(e) => void handleToggleRememberPhoto(e.target.checked)}
                    className="w-4 h-4 accent-pink cursor-pointer"
                  />
                  <span>Remember this photo for next time</span>
                </label>

                <p className="text-[11px] font-medium text-muted-foreground text-center leading-snug">
                  Your photo stays private on this device and is only used to preview outfits.
                </p>
              </div>
            )}

            {/* MANNEQUIN PANEL */}
            {subjectChoice === "mannequin" && (
              <div className="space-y-3">
                <div className="rounded-2xl overflow-hidden border-2 border-border bg-[#E8E6EC] mx-auto w-full max-w-[260px] aspect-[3/4] flex items-center justify-center">
                  <img
                    src={activeMannequinUrl}
                    alt={`${mannequinBody} studio mannequin in ${mannequinPose.replace("_", " ")} pose`}
                    className="w-full h-full object-contain block"
                  />
                </div>

                {/* Body Shape Selector */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-black uppercase tracking-wider text-muted-foreground block">
                    Body Shape
                  </span>
                  <div
                    role="group"
                    aria-label="Mannequin body shape"
                    className="grid grid-cols-4 gap-1.5"
                  >
                    {MANNEQUIN_BODIES.map((b) => {
                      const active = mannequinBody === b.id
                      return (
                        <button
                          key={b.id}
                          type="button"
                          aria-pressed={active}
                          onClick={() => setMannequinBody(b.id)}
                          className={`min-h-[38px] px-2 py-1.5 rounded-xl text-xs font-extrabold border-2 transition-all cursor-pointer ${
                            active
                              ? "bg-pink text-white border-[#0D0F18]/15 shadow-xs"
                              : "bg-muted text-foreground border-border hover:border-turquoise"
                          }`}
                        >
                          {b.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Pose Selector */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-black uppercase tracking-wider text-muted-foreground block">
                    Pose
                  </span>
                  <div
                    role="group"
                    aria-label="Mannequin pose"
                    className="grid grid-cols-2 gap-1.5"
                  >
                    {MANNEQUIN_POSES.map((p) => {
                      const active = mannequinPose === p.id
                      return (
                        <button
                          key={p.id}
                          type="button"
                          aria-pressed={active}
                          onClick={() => setMannequinPose(p.id)}
                          className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-extrabold border-2 transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                            active
                              ? "bg-turquoise text-[#0D0F18] border-[#0D0F18]/20 shadow-xs"
                              : "bg-muted text-foreground border-border hover:border-turquoise"
                          }`}
                        >
                          <span aria-hidden="true">{p.emoji}</span>
                          <span>{p.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Simple 3-Button Fit Picker */}
            <div className="space-y-1.5 pt-2 border-t border-border/80">
              <span className="text-[11px] font-black uppercase tracking-wider text-muted-foreground block">
                Fit Preference
              </span>
              <div
                role="group"
                aria-label="Fit preference"
                className="grid grid-cols-3 gap-1.5"
              >
                {FIT_OPTIONS.map((opt) => {
                  const active = fitStyle === opt.id
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setFitStyle(opt.id)}
                      className={`min-h-[36px] px-2.5 py-1.5 rounded-xl text-xs font-extrabold border-2 transition-all cursor-pointer ${
                        active
                          ? "bg-card text-foreground border-pink shadow-xs"
                          : "bg-muted text-muted-foreground border-border hover:text-foreground"
                      }`}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Primary CTA */}
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setStep("outfit")}
                className="min-h-[48px] px-4 py-2.5 rounded-2xl text-xs font-extrabold border-2 border-border bg-muted text-foreground hover:border-turquoise cursor-pointer"
              >
                ← Back
              </button>
              <button
                type="button"
                disabled={subjectChoice === "picture" && !activeUserPhotoUrl}
                onClick={() => void handleGenerate(false)}
                className="flex-1 min-h-[48px] py-2.5 px-4 rounded-2xl text-sm font-black bg-pink text-white border-2 border-[#0D0F18]/15 shadow-lg shadow-pink/25 hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <span aria-hidden="true">✨</span>
                <span>Try This Outfit On</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PROCESSING SCREEN — Plain-English Friendly Progress */}
      {step === "processing" && (() => {
        const phase = liveProgress?.phase || "queued"
        const pct = Math.max(5, Math.min(100, liveProgress?.percent ?? 8))
        const order = ["queued", "validating", "subject", "collage", "denoising", "finalizing", "completed"]
        const curIdx = order.indexOf(phase)
        const stages = [
          {
            id: "subject",
            label: subjectChoice === "picture" ? "Preparing your photo" : "Preparing studio mannequin",
            done: curIdx > order.indexOf("subject"),
            active: phase === "queued" || phase === "validating" || phase === "subject",
          },
          {
            id: "collage",
            label: "Getting your clothes ready",
            done: curIdx > order.indexOf("collage"),
            active: phase === "collage",
          },
          {
            id: "denoising",
            label: "Fitting the outfit",
            done: curIdx > order.indexOf("denoising"),
            active: phase === "denoising",
            detail:
              phase === "denoising" && liveProgress?.totalSteps
                ? `Step ${liveProgress.step ?? 0} of ${liveProgress.totalSteps}`
                : undefined,
          },
          {
            id: "finalizing",
            label: "Finishing up",
            done: phase === "completed",
            active: phase === "finalizing",
          },
        ]

        return (
          <div className="rounded-3xl p-5 space-y-4 max-w-md mx-auto border-2 border-border bg-card shadow-lg">
            <div className="flex items-center gap-3.5">
              {beforeImage && (
                <div className="w-16 h-20 rounded-2xl overflow-hidden border-2 border-turquoise shadow-sm bg-[#E8E6EC] shrink-0">
                  <img
                    src={beforeImage}
                    alt="Try-on reference"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-black text-foreground">
                    Creating your preview…
                  </p>
                  <span className="text-xs font-black tabular-nums text-pink">
                    {pct}%
                  </span>
                </div>
                <p className="text-xs font-semibold text-muted-foreground leading-snug">
                  {liveProgress?.label || "This usually takes about 30–45 seconds."}
                </p>
                <div
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={liveProgress?.label || "Try-on progress"}
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

            <ol className="space-y-1.5">
              {stages.map((st) => (
                <li
                  key={st.id}
                  className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 transition-colors ${
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
                    <span className="text-[11px] font-black tabular-nums text-pink shrink-0">
                      {st.detail}
                    </span>
                  )}
                </li>
              ))}
            </ol>

            <button
              type="button"
              onClick={() => {
                cancelInflightTryOn()
                setStep("subject")
              }}
              className="w-full min-h-[42px] py-2 rounded-xl text-xs font-extrabold border-2 border-border text-foreground bg-muted hover:border-pink cursor-pointer"
            >
              Cancel
            </button>
          </div>
        )
      })()}

      {/* RESULT SCREEN — Clean Consumer Preview */}
      {step === "preview" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2 className="text-base font-black text-foreground">
              Your Look is Ready
            </h2>
            <div
              role="tablist"
              aria-label="Preview view"
              className="flex gap-1 p-1 rounded-xl bg-muted border border-border"
            >
              {(
                [
                  { id: "after", label: "After" },
                  { id: "compare", label: "Before & After" },
                ] as const
              ).map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  role="tab"
                  aria-selected={resultView === mode.id}
                  onClick={() => setResultView(mode.id)}
                  className={`px-3 py-1 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
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

          {resultView === "after" && generatedImage && (
            <div className="relative rounded-3xl overflow-hidden border-2 border-border shadow-xl mx-auto w-full max-w-[360px] bg-[#E8E6EC] flex items-center justify-center">
              <img
                src={generatedImage}
                alt={`Virtual try-on of ${selectedOutfit.label}`}
                className="w-full h-auto max-h-[540px] object-contain block"
              />
              <span className="absolute bottom-2.5 left-2.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-black/60 text-white backdrop-blur-xs">
                AI Preview
              </span>
            </div>
          )}

          {resultView === "compare" && (
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-2xl overflow-hidden border-2 border-border shadow-md bg-[#E8E6EC] flex flex-col">
                <span className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider bg-white/90 text-neutral-800 border-b border-black/10">
                  Before
                </span>
                {beforeImage && (
                  <img
                    src={beforeImage}
                    alt="Before photo"
                    className="w-full h-[270px] object-contain"
                  />
                )}
              </div>
              <div className="rounded-2xl overflow-hidden border-2 border-pink shadow-md bg-[#E8E6EC] flex flex-col">
                <span className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider bg-pink text-white">
                  After
                </span>
                {generatedImage && (
                  <img
                    src={generatedImage}
                    alt={`After try-on of ${selectedOutfit.label}`}
                    className="w-full h-[270px] object-contain"
                  />
                )}
              </div>
            </div>
          )}

          {/* Everyday Action Buttons */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleWearOutfit}
              className="min-h-[46px] py-2.5 px-3 rounded-2xl text-xs font-black border-2 border-[#0D0F18]/15 bg-green text-white hover:brightness-110 shadow-md shadow-green/20 cursor-pointer"
            >
              ✓ Wear Today
            </button>
            <button
              type="button"
              onClick={handleToggleCurrentFavorite}
              className={`min-h-[46px] py-2.5 px-3 rounded-2xl text-xs font-black border-2 transition-colors cursor-pointer ${
                isCurrentFavorited
                  ? "bg-pink/15 text-pink border-pink"
                  : "bg-card text-foreground border-border hover:border-pink"
              }`}
            >
              {isCurrentFavorited ? "♥ Saved Outfit" : "♡ Save Outfit"}
            </button>
            <button
              type="button"
              onClick={handleDownloadImage}
              className="min-h-[44px] py-2 px-3 rounded-2xl text-xs font-extrabold border-2 border-border bg-muted text-foreground hover:border-turquoise cursor-pointer"
            >
              ⬇ Download Photo
            </button>
            <button
              type="button"
              onClick={() => void handleGenerate(true)}
              className="min-h-[44px] py-2 px-3 rounded-2xl text-xs font-extrabold border-2 border-border bg-muted text-foreground hover:border-pink cursor-pointer"
            >
              ↻ Try Again
            </button>
          </div>

          <button
            type="button"
            onClick={() => setStep("outfit")}
            className="w-full min-h-[44px] py-2.5 rounded-2xl text-xs font-black border-2 border-border bg-card text-foreground hover:border-turquoise cursor-pointer"
          >
            ← Try a Different Outfit
          </button>
        </div>
      )}

      {/* ERROR RECOVERY SCREEN */}
      {step === "error" && (
        <div className="space-y-4 max-w-lg mx-auto">
          <AIErrorBanner
            title="Couldn't Create Preview"
            message={
              generationError ||
              "Something went wrong while creating your outfit preview. Please try again."
            }
            actions={[
              {
                label: "Try Again",
                primary: true,
                onClick: () => void handleGenerate(true),
              },
              {
                label: "Go Back",
                onClick: () => setStep("subject"),
              },
            ]}
          />
        </div>
      )}

      {/* CLOSET PIECE PICKER MODAL */}
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
                Choose {swapSlot === "Full Body" ? "Dress / Jumpsuit" : swapSlot === "Outerwear" ? "Jacket / Coat" : swapSlot}
              </h2>
              <button
                type="button"
                onClick={() => setSwapSlot(null)}
                aria-label="Close picker"
                className="text-xs font-bold text-muted-foreground hover:text-foreground p-1.5 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
              {swapPool.length === 0 ? (
                <div className="py-5 text-center space-y-2.5">
                  <p className="text-xs text-muted-foreground">
                    You don&apos;t have any items in this category yet.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSwapSlot(null)
                      setRequestedTab("wardrobe")
                    }}
                    className="px-3.5 py-2 rounded-xl text-xs font-black bg-turquoise/15 text-turquoise border border-turquoise/40 hover:bg-turquoise/25 cursor-pointer"
                  >
                    + Add One in Closet →
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
                      Pick →
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
