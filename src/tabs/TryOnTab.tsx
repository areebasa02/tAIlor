import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react"
import {
  PulseOrb,
  AIErrorBanner,
  AIStatusPill,
} from "../components/AIComponents"
import { useApp } from "../context/AppContext"
import {
  getReadableColorLabel,
  speakText,
  stopSpeaking,
} from "../services/accessibilityHelpers"
import { THEME_COLORS } from "../types/theme"

const TryOnMannequin3D = lazy(() => import("../components/TryOnMannequin3D"))

type Step = "outfit" | "consent" | "processing" | "preview" | "error"
type AvatarType = "mannequin" | "demo_photo" | "upload_photo"

interface TryOnOutfit {
  id: number
  label: string
  tagline: string
  items: {
    type: string
    name: string
    color: string
    emoji: string
    imageData?: string
  }[]
  colors: string[]
}

const TRYON_OUTFITS: TryOnOutfit[] = [
  {
    id: 1,
    label: "Magenta Statement & Camel",
    tagline: "Warm complementary contrast for daytime to evening",
    colors: [THEME_COLORS.pink, "#C8965A", "#B8825A"],
    items: [
      {
        type: "Top",
        name: "Magenta button-down",
        color: THEME_COLORS.pink,
        emoji: "👚",
      },
      {
        type: "Bottom",
        name: "Camel wide trousers",
        color: "#C8965A",
        emoji: "👖",
      },
      {
        type: "Shoes",
        name: "Tan leather loafers",
        color: "#B8825A",
        emoji: "👞",
      },
    ],
  },
  {
    id: 2,
    label: "Casual Navy & Denim",
    tagline: "Zero-friction daily comfort for walking and errands",
    colors: ["#2B4B8C", "#4A6FA5", "#F2F2F2"],
    items: [
      {
        type: "Top",
        name: "Navy relaxed crew tee",
        color: "#2B4B8C",
        emoji: "👕",
      },
      {
        type: "Bottom",
        name: "Slim medium jeans",
        color: "#4A6FA5",
        emoji: "👖",
      },
      {
        type: "Shoes",
        name: "White leather sneakers",
        color: "#F2F2F2",
        emoji: "👟",
      },
    ],
  },
  {
    id: 3,
    label: "Deep Teal Trench & Noir",
    tagline: "High-polish city layers with weather protection",
    colors: [THEME_COLORS.darkTeal, "#1A1A2E", "#F2F2F2"],
    items: [
      {
        type: "Outerwear",
        name: "Teal trench coat",
        color: THEME_COLORS.darkTeal,
        emoji: "🧥",
      },
      {
        type: "Bottom",
        name: "Black wide-leg trousers",
        color: "#1A1A2E",
        emoji: "👖",
      },
      {
        type: "Shoes",
        name: "White sneakers",
        color: "#F2F2F2",
        emoji: "👟",
      },
    ],
  },
]

const STAGES = [
  "Validating garment textures & lighting…",
  "Analyzing body silhouette (cat-VTON)…",
  "Warping clothing mesh to virtual mannequin…",
  "Rendering realistic fabric drape & shadows…",
]

function getItemEmoji(typeOrCat: string, fallback = "👕"): string {
  const v = typeOrCat.toLowerCase()
  if (v.includes("outer") || v.includes("coat") || v.includes("jacket")) return "🧥"
  if (v.includes("bottom") || v.includes("pant") || v.includes("jean")) return "👖"
  if (v.includes("shoe") || v.includes("sneaker") || v.includes("loafer")) return "👟"
  if (v.includes("access")) return "💍"
  return fallback
}

export default function TryOnTab() {
  const { wardrobe, logOutfitWorn, showToast, user } = useApp()

  const savedOutfit = useMemo<TryOnOutfit | null>(() => {
    const pieces = [
      wardrobe.find((item) => item.id === 14),
      wardrobe.find((item) => item.id === 13),
    ].filter(Boolean)
    if (pieces.length < 2) return null
    return {
      id: 100,
      label: "Light Blue Button-Up & Blue Jeans",
      tagline: "A clean, casual look from your saved wardrobe",
      colors: pieces.map((item) => item!.color),
      items: pieces.map((item) => ({
        type:
          item!.category === "Accessories"
            ? "Accessory"
            : item!.category.slice(0, -1),
        name: item!.name,
        color: item!.color,
        emoji:
          item!.category === "Shoes"
            ? "👟"
            : item!.category === "Bottoms"
              ? "👖"
              : "👕",
        imageData: item!.imageData,
      })),
    }
  }, [wardrobe])

  const tryOnOutfits = useMemo(
    () => [...(savedOutfit ? [savedOutfit] : []), ...TRYON_OUTFITS],
    [savedOutfit]
  )

  const [step, setStep] = useState<Step>("outfit")
  const [selectedOutfit, setSelectedOutfit] = useState<TryOnOutfit | null>(
    savedOutfit ?? TRYON_OUTFITS[0]
  )
  const [avatarType, setAvatarType] = useState<AvatarType>("mannequin")
  const [fitStyle, setFitStyle] = useState<"fitted" | "standard" | "relaxed">(
    "standard"
  )
  const [processingStage, setProcessingStage] = useState(0)
  const [activeLayers, setActiveLayers] = useState<Record<string, boolean>>({
    Top: true,
    Bottom: true,
    Shoes: true,
    Outerwear: true,
  })
  const [swapModalOpen, setSwapModalOpen] = useState(false)
  const [simulatedError, setSimulatedError] = useState(false)
  const [generatedImage, setGeneratedImage] = useState<string | null>(null)
  const [generationError, setGenerationError] = useState("")
  const [speakingPreview, setSpeakingPreview] = useState(false)

  const intervalRef = useRef<number | null>(null)
  const timeoutRef = useRef<number | null>(null)

  const clearTimers = () => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }

  useEffect(() => {
    return () => {
      clearTimers()
      stopSpeaking()
    }
  }, [])

  const showListen = Boolean(
    user.accessibility.visionImpairment || user.accessibility.voiceNarration
  )

  const handleSelectOutfit = (o: TryOnOutfit) => {
    setSelectedOutfit(o)
    setStep("consent")
  }

  const startGeneration = async (
    avatarChoice: AvatarType,
    bypassSimulatedError = false
  ) => {
    clearTimers()
    setAvatarType(avatarChoice)
    if (simulatedError && !bypassSimulatedError) {
      setGenerationError(
        "Simulated error active. Tap Use Mannequin below or disable Test Error."
      )
      setStep("error")
      return
    }

    setStep("processing")
    setProcessingStage(0)
    setGeneratedImage(null)
    setGenerationError("")

    const garments = selectedOutfit?.items
      .filter(
        (item) =>
          item.imageData &&
          (item.type === "Top" ||
            item.type === "Bottom" ||
            item.type === "Outerwear")
      )
      .sort((a, b) =>
        a.type === "Top" || a.type === "Outerwear"
          ? -1
          : b.type === "Top" || b.type === "Outerwear"
            ? 1
            : 0
      )
      .slice(0, 2)

    if (garments && garments.length > 0) {
      intervalRef.current = window.setInterval(() => {
        setProcessingStage((prev) => Math.min(prev + 1, STAGES.length - 1))
      }, 900)

      try {
        const response = await fetch("/api/try-on", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            garments: garments.map((garment) => ({
              imageUrl: garment.imageData,
              description: garment.name,
              type: garment.type,
            })),
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
        setStep("preview")
        showToast(
          "Preview Ready",
          "cat-VTON virtual fitting room render complete.",
          "success"
        )
      } catch (error) {
        setGenerationError(
          error instanceof Error ? error.message : "Cat-VTON request failed."
        )
        setStep("error")
      } finally {
        clearTimers()
      }
      return
    }

    // Preset outfits without photo assets render on the interactive 3D mannequin
    intervalRef.current = window.setInterval(() => {
      setProcessingStage((prev) => {
        if (prev >= STAGES.length - 1) {
          clearTimers()
          timeoutRef.current = window.setTimeout(() => {
            setStep("preview")
            showToast(
              "Preview Ready",
              "3D fitting room look is ready.",
              "success"
            )
          }, 400)
          return prev
        }
        return prev + 1
      })
    }, 550)
  }

  const fitNote = selectedOutfit
    ? {
        harmonyScore: "96% color harmony",
        drapeNote:
          fitStyle === "fitted"
            ? "Tailored silhouette along shoulders & waist"
            : fitStyle === "relaxed"
              ? "Loose, breezy drape for zero constriction"
              : "Balanced everyday fit across chest & hip",
        sizeLabel: `Size: ${user.typicalSizes.split("·")[0]?.trim() || "Medium"}`,
        summary: `${selectedOutfit.label} calibrated for ${fitStyle} comfort.`,
      }
    : null

  const handleKeepOutfit = () => {
    if (!selectedOutfit) return
    logOutfitWorn({
      label: selectedOutfit.label,
      items: selectedOutfit.items.map((i) => i.name),
      color: selectedOutfit.colors[0],
      direction: "Virtual Try-On",
    })
    showToast(
      "Outfit Kept & Logged",
      "Logged to your wear history for today.",
      "success"
    )
  }

  const toggleLayer = (type: string) => {
    setActiveLayers((prev) => ({ ...prev, [type]: !prev[type] }))
  }

  const reset = () => {
    clearTimers()
    stopSpeaking()
    setSpeakingPreview(false)
    setGeneratedImage(null)
    setGenerationError("")
    setStep("outfit")
    setProcessingStage(0)
  }

  const handleDescribePreviewAloud = () => {
    if (speakingPreview) {
      stopSpeaking()
      setSpeakingPreview(false)
      return
    }
    if (!selectedOutfit) return
    const visibleItems = selectedOutfit.items
      .filter((item) => activeLayers[item.type] !== false)
      .map(
        (item) =>
          `${item.type}: ${item.name} in ${getReadableColorLabel(item.color, item.name, wardrobe)}`
      )
      .join(". ")
    const hiddenItems = selectedOutfit.items
      .filter((item) => activeLayers[item.type] === false)
      .map((item) => item.type)
      .join(", ")
    const text = `Virtual Fitting Room Preview for ${selectedOutfit.label}. Silhouette fit is set to ${fitStyle}. Currently visible: ${visibleItems || "no active layers"}.${hiddenItems ? ` Hidden layers: ${hiddenItems}.` : ""} ${fitNote ? `${fitNote.harmonyScore}. ${fitNote.summary}. ${fitNote.drapeNote}.` : ""}`
    const started = speakText(text, () => setSpeakingPreview(false))
    if (started) {
      setSpeakingPreview(true)
    } else {
      showToast(
        "Audio Unavailable",
        "Voice narration is not supported in this browser.",
        "warning"
      )
    }
  }

  return (
    <div className="pt-1 pb-4 space-y-2.5">
      {/* Page Header */}
      <div className="min-w-0">
        <h1
          className="text-xl font-black text-foreground leading-tight"
          style={{ fontFamily: "Nunito, sans-serif" }}
        >
          Virtual Fitting Room
        </h1>
        <p className="text-xs font-semibold text-muted-foreground mt-0.5 leading-snug">
          Preview saved photos with cat-VTON or a 3D mannequin before getting dressed.
        </p>
      </div>

      {/* Step 1: Choose Outfit */}
      {step === "outfit" && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-foreground">
              1. Pick an Outfit
            </h2>
            <span className="text-xs text-muted-foreground font-extrabold">
              {tryOnOutfits.length} ready
            </span>
          </div>

          <div className="grid grid-cols-1 gap-2.5">
            {tryOnOutfits.map((o) => {
              const usesCatVton = o.items.some((i) => Boolean(i.imageData))
              return (
                <div
                  key={o.id}
                  className="rounded-2xl p-3 space-y-2 transition-all hover:border-turquoise border-2 border-border bg-card flex flex-col justify-between shadow-sm"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h3 className="text-base font-black text-foreground leading-tight">
                            {o.label}
                          </h3>
                          {usesCatVton && (
                            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-turquoise/15 text-turquoise border border-turquoise/40">
                              cat-VTON Photo
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-medium text-muted-foreground mt-0.5 leading-snug">
                          {o.tagline}
                        </p>
                      </div>
                      <div
                        role="img"
                        aria-label={`Color palette for ${o.label}`}
                        className="flex gap-1.5 shrink-0 pt-0.5"
                        title="Outfit palette"
                      >
                        {o.colors.map((c, i) => (
                          <div
                            key={i}
                            aria-hidden="true"
                            className="w-5 h-5 rounded-md shadow-xs border-2 border-foreground/25"
                            style={{ background: c }}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Garments pill list */}
                    <div className="space-y-1.5 pt-2.5 mt-2 border-t-2 border-border">
                      {o.items.map((item) => (
                        <div
                          key={item.name}
                          className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-muted border-2 border-border"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {item.imageData ? (
                              <img
                                src={item.imageData}
                                alt={item.name}
                                className="w-8 h-8 rounded-lg object-contain bg-card border border-border shrink-0"
                              />
                            ) : (
                              <div
                                aria-hidden="true"
                                className="w-8 h-8 rounded-lg flex items-center justify-center border border-border text-sm shrink-0"
                                style={{ background: `${item.color}22` }}
                              >
                                {getItemEmoji(item.type, item.emoji)}
                              </div>
                            )}
                            <p className="text-xs font-bold leading-snug text-foreground truncate">
                              {item.name}
                            </p>
                          </div>
                          <span className="text-[11px] uppercase tracking-wider font-extrabold text-muted-foreground shrink-0">
                            {item.type}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleSelectOutfit(o)}
                    className="w-full min-h-[46px] mt-2 py-2.5 rounded-xl text-sm font-black border-2 border-[#0D0F18]/20 dark:border-white/25 transition-all active:scale-95 bg-pink text-white hover:brightness-110 shadow-md shadow-pink/25 cursor-pointer"
                  >
                    Try On
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Step 2: Consent & Avatar Source Choice */}
      {step === "consent" && selectedOutfit && (
        <div className="space-y-4 max-w-2xl mx-auto">
          <button
            type="button"
            onClick={reset}
            className="text-xs font-extrabold px-3 min-h-[38px] rounded-xl border-2 border-border bg-muted text-foreground hover:border-pink cursor-pointer"
          >
            ← Outfits
          </button>

          <div className="rounded-3xl p-5 space-y-4 border-2 border-border bg-card shadow-xl">
            <div className="flex items-center gap-3">
              <div
                aria-hidden="true"
                className="w-12 h-12 rounded-2xl border-2 border-border flex items-center justify-center text-2xl shrink-0 text-white shadow-md"
                style={{ background: selectedOutfit.colors[0] }}
              >
                🪞
              </div>
              <div>
                <p className="text-base font-black text-foreground">
                  {selectedOutfit.label}
                </p>
                <p className="text-xs font-semibold text-muted-foreground">
                  Choose how to preview:
                </p>
              </div>
            </div>

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => void startGeneration("mannequin")}
                className="w-full text-left p-4 rounded-2xl flex items-center justify-between gap-2 border-2 border-pink bg-pink/10 transition-all hover:scale-[1.01] cursor-pointer"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span aria-hidden="true" className="text-3xl shrink-0">
                    🧍
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-black text-foreground">
                      3D Mannequin (Fastest)
                    </p>
                    <p className="text-xs text-muted-foreground">
                      No photo needed · Sized to your profile
                    </p>
                  </div>
                </div>
                <span className="text-xs font-black text-pink shrink-0">
                  Start →
                </span>
              </button>

              <button
                type="button"
                onClick={() => void startGeneration("demo_photo")}
                className="w-full text-left p-4 rounded-2xl flex items-center justify-between gap-2 border-2 border-turquoise bg-turquoise/10 transition-all hover:scale-[1.01] cursor-pointer"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    aria-hidden="true"
                    className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-black text-white border-2 border-border shrink-0"
                    style={{ background: user.avatarBg }}
                  >
                    {user.initials}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-extrabold text-foreground">
                      Profile Avatar ({user.name.split(" ")[0]})
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Uses saved silhouette privately
                    </p>
                  </div>
                </div>
                <span className="text-xs font-extrabold text-foreground shrink-0">
                  Use →
                </span>
              </button>

              <button
                type="button"
                onClick={() => void startGeneration("upload_photo")}
                className="w-full text-left p-4 rounded-2xl flex items-center justify-between gap-2 border-2 border-border bg-muted transition-all hover:scale-[1.01] hover:border-turquoise cursor-pointer"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span aria-hidden="true" className="text-3xl shrink-0">
                    📸
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-extrabold text-foreground">
                      Upload Photo
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Private one-time preview
                    </p>
                  </div>
                </div>
                <span className="text-xs font-extrabold text-foreground shrink-0">
                  Browse →
                </span>
              </button>
            </div>

            <div className="p-3 rounded-2xl bg-muted border-2 border-border text-xs text-muted-foreground leading-snug">
              🔒 <strong className="text-foreground">Privacy:</strong> Photos
              stay temporary on your device and are never saved or shared.
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Processing */}
      {step === "processing" && selectedOutfit && (
        <div className="rounded-3xl p-8 text-center space-y-4 max-w-md mx-auto border-2 border-border bg-card shadow-xl">
          <PulseOrb label="Fitting Your Outfit…" />

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
              Fitting {selectedOutfit.items.length} pieces on{" "}
              {avatarType === "mannequin"
                ? "virtual model"
                : `${user.name.split(" ")[0]}'s profile`}
            </p>
          </div>

          <button
            type="button"
            onClick={reset}
            className="min-h-[42px] text-xs py-2 px-5 rounded-xl font-extrabold border-2 border-border text-foreground bg-muted transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Step 4: Preview Result */}
      {step === "preview" && selectedOutfit && (
        <div className="space-y-3">
          {/* Interactive Fitting Room Canvas */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <AIStatusPill
                state="success"
                label={generatedImage ? "cat-VTON Ready" : "3D Preview Ready"}
              />
              <span className="text-xs font-extrabold text-muted-foreground">
                {generatedImage ? "cat-VTON Neural Render" : "3D Mirror"}
              </span>
            </div>

            {showListen && (
              <button
                type="button"
                onClick={handleDescribePreviewAloud}
                aria-pressed={speakingPreview}
                aria-label={
                  speakingPreview
                    ? "Stop reading try-on preview aloud"
                    : "Listen to try-on preview description read aloud"
                }
                className={`w-full min-h-[44px] py-2.5 px-3 rounded-xl text-xs font-extrabold border-2 flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  speakingPreview
                    ? "bg-pink text-white border-pink shadow-xs"
                    : user.accessibility.voiceNarration
                      ? "bg-turquoise text-[#0D0F18] border-[#0D0F18]/25 shadow-xs"
                      : "bg-card text-foreground border-border hover:border-turquoise"
                }`}
              >
                <span aria-hidden="true">{speakingPreview ? "⏹" : "🔊"}</span>
                <span>{speakingPreview ? "Stop" : "Listen"}</span>
              </button>
            )}

            <div
              className="rounded-2xl overflow-hidden relative border-2 shadow-xl min-h-[260px] h-[clamp(260px,44dvh,400px)]"
              style={{
                background: "#e4e2ea",
                borderColor: "var(--border)",
              }}
            >
              {generatedImage ? (
                <img
                  src={generatedImage}
                  alt={`Cat-VTON preview of ${selectedOutfit.label}`}
                  className="h-full w-full object-contain"
                />
              ) : (
                <Suspense
                  fallback={
                    <div className="flex h-full min-h-[240px] items-center justify-center bg-[#e4e2ea]">
                      <p className="text-xs font-bold text-neutral-700">
                        Loading 3D mannequin…
                      </p>
                    </div>
                  }
                >
                  <TryOnMannequin3D
                    items={selectedOutfit.items}
                    activeLayers={activeLayers}
                    fitStyle={fitStyle}
                    avatarLabel={fitStyle}
                  />
                </Suspense>
              )}

              {/* Bottom Canvas Tag */}
              {fitNote && (
                <div
                  className="absolute bottom-2 left-2.5 right-2.5 rounded-xl px-3 py-1.5 flex items-center justify-between gap-2 text-xs z-20 shadow-sm border-2 border-black/15"
                  style={{
                    background: "rgba(255,255,255,0.95)",
                    backdropFilter: "blur(8px)",
                  }}
                >
                  <span className="text-neutral-900 font-bold leading-tight">
                    {fitNote.harmonyScore} · {fitNote.drapeNote}
                  </span>
                  <span className="font-black text-neutral-900 shrink-0">
                    {fitNote.sizeLabel}
                  </span>
                </div>
              )}
            </div>

            {fitNote && (
              <div className="rounded-xl px-3 py-2 bg-turquoise/10 border-2 border-turquoise/45 text-xs font-medium text-foreground leading-snug">
                <span className="font-extrabold text-foreground">
                  <span aria-hidden="true">✦ </span>Fit Note:{" "}
                </span>
                {fitNote.summary} {fitNote.drapeNote}.
              </div>
            )}
          </div>

          {/* Layer Controls, Fit Adjuster & User Actions */}
          <div className="space-y-2.5">
            {!generatedImage && (
              <>
                {/* Fit Adjuster Card */}
                <div className="rounded-2xl p-3 border-2 border-border bg-card space-y-2">
                  <span
                    id="fit-silhouette-label"
                    className="text-xs font-extrabold uppercase tracking-wider text-foreground block"
                  >
                    Fit Style
                  </span>
                  <div
                    role="group"
                    aria-labelledby="fit-silhouette-label"
                    className="grid grid-cols-3 gap-2"
                  >
                    {(["standard", "fitted", "relaxed"] as const).map((style) => (
                      <button
                        key={style}
                        type="button"
                        aria-pressed={fitStyle === style}
                        onClick={() => setFitStyle(style)}
                        className={`min-h-[40px] py-1.5 rounded-xl text-xs font-extrabold capitalize border-2 transition-all cursor-pointer ${
                          fitStyle === style
                            ? "bg-turquoise text-[#0D0F18] border-[#0D0F18]/25 shadow-sm"
                            : "bg-muted text-foreground border-border hover:border-turquoise"
                        }`}
                      >
                        {style}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Interactive Layer Visibility Toggles */}
                <div className="rounded-2xl p-3 space-y-2 border-2 border-border bg-card">
                  <span
                    id="toggle-layers-label"
                    className="text-xs font-extrabold uppercase tracking-wider text-foreground block"
                  >
                    Show / Hide Layers
                  </span>
                  <div
                    role="group"
                    aria-labelledby="toggle-layers-label"
                    className="grid grid-cols-2 gap-2"
                  >
                    {["Top", "Bottom", "Shoes", "Outerwear"].map((layer) => (
                      <button
                        key={layer}
                        type="button"
                        aria-pressed={activeLayers[layer]}
                        aria-label={`${layer} layer (${activeLayers[layer] ? "visible" : "hidden"})`}
                        onClick={() => toggleLayer(layer)}
                        className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center justify-between border-2 transition-all cursor-pointer ${
                          activeLayers[layer]
                            ? "bg-green/15 text-green border-green"
                            : "bg-muted text-foreground border-border hover:border-turquoise"
                        }`}
                      >
                        <span>{layer}</span>
                        <span aria-hidden="true">
                          {activeLayers[layer] ? "✓" : "✕"}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Actions Grid */}
            <div className="grid grid-cols-2 gap-2 pt-0.5">
              <button
                type="button"
                onClick={handleKeepOutfit}
                className="min-h-[46px] py-2.5 rounded-xl text-xs font-black border-2 border-[#0D0F18]/20 transition-all active:scale-95 shadow-md bg-green text-white hover:brightness-110 shadow-green/20 cursor-pointer"
              >
                <span aria-hidden="true">✓ </span>Wear This Now
              </button>

              <button
                type="button"
                onClick={() => setSwapModalOpen(true)}
                className="min-h-[46px] py-2.5 rounded-xl text-xs font-extrabold transition-all active:scale-95 border-2 border-border bg-card text-foreground hover:border-turquoise cursor-pointer"
              >
                <span aria-hidden="true">✏ </span>Swap
              </button>

              <button
                type="button"
                onClick={() => void startGeneration(avatarType)}
                className="min-h-[44px] py-2 rounded-xl text-xs font-extrabold border-2 border-border bg-muted text-foreground hover:border-pink transition-colors cursor-pointer"
              >
                <span aria-hidden="true">↺ </span>Retry
              </button>

              <button
                type="button"
                onClick={reset}
                className="min-h-[44px] py-2 rounded-xl text-xs font-extrabold bg-muted text-foreground border-2 border-border hover:border-red transition-colors cursor-pointer"
              >
                <span aria-hidden="true">✕ </span>Close
              </button>
            </div>
          </div>

          {/* Swap modal */}
          {swapModalOpen && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150"
              onClick={() => setSwapModalOpen(false)}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="tryon-swap-modal-title"
                className="rounded-3xl p-5 max-w-[400px] w-full space-y-4 shadow-2xl border-2 border-border bg-card"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between">
                  <h2
                    id="tryon-swap-modal-title"
                    className="text-sm font-bold text-foreground"
                  >
                    Swap Garment
                  </h2>
                  <button
                    type="button"
                    onClick={() => setSwapModalOpen(false)}
                    aria-label="Close swap garment dialog"
                    className="text-xs text-muted-foreground hover:text-foreground p-1.5 rounded-lg cursor-pointer"
                  >
                    <span aria-hidden="true">✕</span>
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Select an alternate piece from your digital wardrobe:
                </p>

                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {(wardrobe.length > 0
                    ? wardrobe
                        .filter(
                          (w) =>
                            (w.status || "clean") === "clean" &&
                            w.category !== "Accessories"
                        )
                        .slice(0, 8)
                        .map((w) => ({
                          name: w.name,
                          cat:
                            w.category === "Tops"
                              ? "Top"
                              : w.category === "Bottoms"
                                ? "Bottom"
                                : w.category,
                          color: w.color,
                          imageData: w.imageData,
                        }))
                    : [
                        {
                          name: "Mint ribbed mock-neck",
                          cat: "Top",
                          color: THEME_COLORS.lightGreen,
                          imageData: undefined,
                        },
                        {
                          name: "Cream linen blouse",
                          cat: "Top",
                          color: "#F5EFD8",
                          imageData: undefined,
                        },
                        {
                          name: "Black wide-leg trousers",
                          cat: "Bottom",
                          color: "#1A1A2E",
                          imageData: undefined,
                        },
                        {
                          name: "White leather sneakers",
                          cat: "Shoes",
                          color: "#F2F2F2",
                          imageData: undefined,
                        },
                      ]
                  ).map((alt) => (
                    <button
                      key={alt.name}
                      type="button"
                      onClick={() => {
                        setSelectedOutfit((prev) => {
                          if (!prev) return prev
                          const hasSlot = prev.items.some(
                            (i) => i.type === alt.cat
                          )
                          const nextItems = hasSlot
                            ? prev.items.map((i) =>
                                i.type === alt.cat
                                  ? {
                                      ...i,
                                      name: alt.name,
                                      color: alt.color,
                                      imageData: alt.imageData,
                                    }
                                  : i
                              )
                            : [
                                ...prev.items,
                                {
                                  type: alt.cat,
                                  name: alt.name,
                                  color: alt.color,
                                  emoji: getItemEmoji(alt.cat),
                                  imageData: alt.imageData,
                                },
                              ]
                          return {
                            ...prev,
                            items: nextItems,
                            colors: nextItems.slice(0, 3).map((i) => i.color),
                          }
                        })
                        showToast(
                          "Swapped!",
                          `Updated preview with ${alt.name}`,
                          "info"
                        )
                        setSwapModalOpen(false)
                      }}
                      className="w-full min-h-[48px] p-2.5 rounded-xl flex items-center gap-3 border border-border bg-muted text-left hover:border-turquoise transition-colors cursor-pointer"
                    >
                      {alt.imageData ? (
                        <img
                          src={alt.imageData}
                          alt={alt.name}
                          className="w-9 h-9 rounded-lg object-contain bg-card border border-border shrink-0"
                        />
                      ) : (
                        <div
                          aria-hidden="true"
                          className="w-9 h-9 rounded-lg flex items-center justify-center border border-border text-base shrink-0"
                          style={{ background: `${alt.color}22` }}
                        >
                          {getItemEmoji(alt.cat)}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold truncate text-foreground">
                          {alt.name}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {alt.cat}
                        </p>
                      </div>
                      <span className="text-xs font-bold text-turquoise">
                        Select →
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 5: Error and Recovery */}
      {step === "error" && (
        <div className="space-y-4 max-w-lg mx-auto">
          <AIErrorBanner
            title="Virtual Try-On Preview Failed"
            message={
              generationError ||
              "The fitting room hit a snag. Try again or go back to choose another outfit."
            }
            actions={[
              {
                label: "Retry",
                primary: true,
                onClick: () => {
                  setSimulatedError(false)
                  void startGeneration("mannequin", true)
                },
              },
              {
                label: "Go Back",
                onClick: reset,
              },
            ]}
          />
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
          title="Test error message"
        >
          {simulatedError ? "⚠ Error ON" : "Test Error"}
        </button>
      </div>
    </div>
  )
}
