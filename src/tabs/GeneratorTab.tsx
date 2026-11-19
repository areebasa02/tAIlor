import { useState, useRef, useEffect } from "react"
import {
  AnimatedStepProgress,
  UserControlBar,
  AIErrorBanner,
  WhyItWorksDisclosure,
  OutfitFeedbackModal,
  GarmentFeedbackModal,
  type ControlMode,
  type VoiceState,
} from "../components/AIComponents"
import { useApp } from "../context/AppContext"
import { AiHostNoticeBanner } from "../components/AiHostStatus"
import { formatAiErrorMessage, getApiUrl } from "../lib/aiHost"
import { getSampleGarmentImage } from "../data/personaData"
import {
  getGarmentEmoji,
  normalizeGarmentSlot,
  swapMatchesCategory,
} from "../lib/garmentCategories"
import {
  getOutfitItemSelectionTags,
  getReadableColorLabel,
  getSensoryInfo,
  speakText,
  stopSpeaking,
} from "../services/accessibilityHelpers"
import type { WardrobeItem } from "../types"
import { THEME_COLORS } from "../types/theme"

type Step = "input" | "loading" | "results" | "error"

interface GeneratedOutfit {
  id: number
  label: string
  dresscodeMatch: string
  rationale: string
  items: { type: string; desc: string; color: string; emoji: string }[]
  whyExplanation: string
  usedFallback: boolean
}

interface ChatTurn {
  role: "user" | "stylist"
  text: string
}

const PRESET_EVENTS = [
  "Networking dinner at rooftop venue, 7pm Thursday, business-casual",
  "Software engineering conference keynote, casual tech modern",
  "Rainy afternoon client pitch presentation, smart-casual with layers",
  "Art gallery opening & evening social, creative chic with focal color",
]

const GENERATION_STEPS = [
  "Interpreting event context & venue dress code…",
  "Scanning clean wardrobe pieces & sensory preferences…",
  "Checking layering rules & color harmony…",
  "Synthesizing tailored styling suggestions…",
]

function getPieceEmoji(
  typeOrCategory: string,
  fallback = "👗",
  itemName = "",
): string {
  return getGarmentEmoji(typeOrCategory, itemName, fallback)
}

function buildLocalRestyle(
  outfit: GeneratedOutfit,
  reason: string,
  wardrobe: WardrobeItem[]
): GeneratedOutfit {
  const lowerReason = reason.toLowerCase()
  const cleanPool = wardrobe.filter(
    (w) => w.status !== "dirty" && w.status !== "washing"
  )
  const pool = cleanPool.length > 0 ? cleanPool : wardrobe

  let updatedItems = outfit.items.map((item) => ({ ...item }))

  if (lowerReason.includes("no outerwear") || lowerReason.includes("remove jacket")) {
    const withoutOuter = updatedItems.filter(
      (i) => !i.type.toLowerCase().includes("outer")
    )
    if (withoutOuter.length > 0) {
      updatedItems = withoutOuter
    }
  } else if (lowerReason.includes("black shoe")) {
    const blackShoe =
      pool.find(
        (w) =>
          w.category === "Shoes" &&
          (w.colorName.toLowerCase().includes("black") ||
            w.name.toLowerCase().includes("black") ||
            w.color.toLowerCase() === "#000000" ||
            w.color.toLowerCase() === "#1a1a2e")
      ) || pool.find((w) => w.category === "Shoes")
    if (blackShoe) {
      updatedItems = updatedItems.map((i) =>
        i.type.toLowerCase().includes("shoe")
          ? {
              ...i,
              desc: blackShoe.name,
              color: blackShoe.color,
              emoji: "👟",
            }
          : i
      )
    }
  } else {
    const pickReplacement = (
      category: WardrobeItem["category"],
      currentDesc: string
    ): WardrobeItem | undefined => {
      const candidates = pool.filter(
        (w) =>
          w.category === category &&
          w.name.toLowerCase() !== currentDesc.toLowerCase()
      )
      if (candidates.length === 0) return undefined
      if (lowerReason.includes("comfort") || lowerReason.includes("soft")) {
        return (
          candidates.find((c) => getSensoryInfo(c.name, c.material).isSoft) ||
          candidates[0]
        )
      }
      if (lowerReason.includes("formal") || lowerReason.includes("polish")) {
        return (
          candidates.find(
            (c) =>
              c.formality === "formal" ||
              c.formality === "business" ||
              c.formality === "smart-casual"
          ) || candidates[0]
        )
      }
      if (lowerReason.includes("casual")) {
        return (
          candidates.find((c) => c.formality === "casual") || candidates[0]
        )
      }
      return candidates[Math.floor(Math.random() * candidates.length)]
    }

    updatedItems = updatedItems.map((item) => {
      const slot = normalizeGarmentSlot(item.type, item.desc)
      const category: WardrobeItem["category"] =
        slot === "Full Body"
          ? "Full Body"
          : slot === "Outerwear"
            ? "Outerwear"
            : slot === "Bottom"
              ? "Bottoms"
              : slot === "Shoes"
                ? "Shoes"
                : slot === "Accessory"
                  ? "Accessories"
                  : "Tops"
      const next = pickReplacement(category, item.desc)
      if (!next) return item
      return {
        ...item,
        desc: next.name,
        color: next.color,
        emoji: getPieceEmoji(category, item.emoji, next.name),
      }
    })
  }

  const note = reason
    ? `Adjusted for "${reason}" using clean pieces in your closet while preserving ${outfit.dresscodeMatch.toLowerCase()} harmony.`
    : "Rotated in fresh clean alternatives from your wardrobe."

  return {
    ...outfit,
    items: updatedItems,
    rationale: note,
    whyExplanation: `${note} Previously considered: ${outfit.rationale}`,
  }
}

export default function GeneratorTab() {
  const {
    user,
    wardrobe,
    weather,
    logOutfitWorn,
    showToast,
    favoriteOutfitIds,
    toggleFavoriteOutfit,
    saveOutfitFeedback,
    saveGarmentFeedback,
  } = useApp()
  const errorTimerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (errorTimerRef.current) {
        clearTimeout(errorTimerRef.current)
      }
      stopSpeaking()
    }
  }, [])

  const [step, setStep] = useState<Step>("input")
  const [eventDesc, setEventDesc] = useState("")
  const [dresscode, setDresscode] = useState("Smart-casual")
  const [voiceState, setVoiceState] = useState<VoiceState>("idle")
  const [saved, setSaved] = useState<Set<number>>(new Set())
  const [ctrlMode, setCtrlMode] = useState<Record<number, ControlMode>>({
    1: "default",
    2: "default",
  })
  const [serviceError, setServiceError] = useState(false)
  const [serviceErrorMessage, setServiceErrorMessage] = useState("")
  const [slowResponse, setSlowResponse] = useState(false)
  const [speakingOutfitId, setSpeakingOutfitId] = useState<number | null>(null)
  const [showBackupOutfits, setShowBackupOutfits] = useState(false)
  const [activeWhyModal, setActiveWhyModal] = useState<GeneratedOutfit | null>(
    null
  )
  const [swapTarget, setSwapTarget] = useState<{
    outfitId: number
    itemIndex: number
    itemType: string
  } | null>(null)
  const [garmentFeedbackTarget, setGarmentFeedbackTarget] = useState<{
    item: { type: string; desc: string; color: string; emoji: string }
    outfitId: number
    index: number
  } | null>(null)
  const [outfitFeedbackTarget, setOutfitFeedbackTarget] =
    useState<GeneratedOutfit | null>(null)
  const [rejectTargetOutfit, setRejectTargetOutfit] =
    useState<GeneratedOutfit | null>(null)
  const [customRejectNote, setCustomRejectNote] = useState("")
  const [followUpInput, setFollowUpInput] = useState("")
  const [chatHistory, setChatHistory] = useState<ChatTurn[]>([])
  const [results, setResults] = useState<GeneratedOutfit[]>([])

  const inputTooVague =
    eventDesc.trim().length > 0 && eventDesc.trim().length < 10
  const inputReady = eventDesc.trim().length >= 10

  const showListen = Boolean(
    user.accessibility.visionImpairment || user.accessibility.voiceNarration
  )

  const handleGenerate = async (
    refinementPrompt?: string,
    bypassSimulatedError = false
  ) => {
    if (!inputReady) return
    if (errorTimerRef.current) {
      clearTimeout(errorTimerRef.current)
      errorTimerRef.current = null
    }
    if (serviceError && !bypassSimulatedError) {
      setServiceErrorMessage(
        "Simulated connection interruption active. Disable Test Error or tap Try Again to reconnect."
      )
      setStep("error")
      return
    }

    setStep("loading")
    setServiceErrorMessage("")

    const promptPayload = refinementPrompt
      ? `${eventDesc.trim()}. Follow-up adjustment: ${refinementPrompt}`
      : eventDesc.trim()

    try {
      const cleanWardrobe = wardrobe.filter(
        (w) => w.status !== "dirty" && w.status !== "washing"
      )
      const availableWardrobe = cleanWardrobe.length >= 3 ? cleanWardrobe : wardrobe
      const response = await fetch(getApiUrl("/api/stylist"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          event: promptPayload,
          dresscode: dresscode || "Smart-casual",
          weather: weather.condition,
          sensorySensitive: user.accessibility.sensorySensitive,
          stylistNotes: user.stylistNotes,
          wardrobe: availableWardrobe.map(({ name, category, color, material }) => ({
            name,
            category,
            color,
            material,
          })),
        }),
      })

      const contentType = response.headers.get("content-type") || ""
      if (!contentType.includes("application/json")) {
        throw new Error("Host PC AI server is offline or unreachable.")
      }

      const result = (await response.json()) as {
        advice?: string
        outfits?: GeneratedOutfit[]
        error?: string
      }

      if (!response.ok || !result.advice || !result.outfits?.length) {
        throw new Error(
          result.error || "The stylist service returned no advice."
        )
      }

      if (slowResponse) {
        await new Promise((resolve) => window.setTimeout(resolve, 2000))
      }

      setResults(result.outfits)
      setShowBackupOutfits(false)
      stopSpeaking()
      setSpeakingOutfitId(null)
      setCtrlMode(
        Object.fromEntries(
          result.outfits.map((outfit) => [outfit.id, "default" as ControlMode])
        )
      )
      setChatHistory((prev) => {
        const next = [...prev]
        if (refinementPrompt) {
          next.push({ role: "user", text: refinementPrompt })
        } else {
          next.length = 0
          next.push({
            role: "user",
            text: `${eventDesc} (${dresscode || "Any dress code"})`,
          })
        }
        next.push({ role: "stylist", text: result.advice || "" })
        return next
      })
      setStep("results")
      showToast(
        refinementPrompt ? "Looks Refined" : "Outfits Generated",
        `${result.outfits.length} tailored event looks ready for review.`,
        "success"
      )
    } catch (error) {
      const message = formatAiErrorMessage(error, "Please try again.")
      setServiceErrorMessage(message)
      setStep("error")
      showToast("Stylist unavailable", message, "warning")
    }
  }

  const handleRetry = () => {
    if (errorTimerRef.current) {
      clearTimeout(errorTimerRef.current)
      errorTimerRef.current = null
    }
    setServiceError(false)
    setServiceErrorMessage("")
    void handleGenerate(undefined, true)
  }

  const cancelLoading = () => {
    if (errorTimerRef.current) {
      clearTimeout(errorTimerRef.current)
      errorTimerRef.current = null
    }
    setStep("input")
  }

  const handleFollowUpSubmit = async (promptText?: string) => {
    const text = (promptText ?? followUpInput).trim()
    if (!text) return
    setFollowUpInput("")
    await handleGenerate(text)
  }

  const handleRestyleSingleOutfit = (
    outfit: GeneratedOutfit,
    reason: string
  ) => {
    const restyled = buildLocalRestyle(outfit, reason, wardrobe)
    setResults((prev) =>
      prev.map((o) => (o.id === outfit.id ? restyled : o))
    )
    setCtrlMode((m) => ({ ...m, [outfit.id]: "default" }))
    showToast(
      "Look Restyled",
      reason ? `Updated for: "${reason}"` : "Swapped in a fresh option.",
      "info"
    )
  }

  const cycleVoice = () => {
    if (voiceState === "idle" || voiceState === "error") {
      setVoiceState("listening")
    } else if (voiceState === "listening") {
      setVoiceState("processing")
      setTimeout(() => {
        setEventDesc(
          "Networking dinner at a rooftop venue, 7pm Thursday, business-casual"
        )
        setVoiceState("captured")
      }, 900)
    }
  }

  const handleSwapItem = (
    replacementName: string,
    replacementColor: string
  ) => {
    if (!swapTarget) return
    setResults((prev) =>
      prev.map((o) => {
        if (o.id === swapTarget.outfitId) {
          const updated = [...o.items]
          updated[swapTarget.itemIndex] = {
            ...updated[swapTarget.itemIndex],
            desc: replacementName,
            color: replacementColor,
          }
          return { ...o, items: updated }
        }
        return o
      })
    )
    setSwapTarget(null)
    showToast("Piece Updated", `Swapped in ${replacementName}.`, "info")
  }

  return (
    <div className="pt-1 pb-4 space-y-2.5">
      {/* Header */}
      <div className="min-w-0">
        <h1
          className="text-xl font-black leading-tight text-foreground"
          style={{ fontFamily: "Nunito, sans-serif" }}
        >
          Ask AI Stylist
        </h1>
        <p className="text-xs font-semibold mt-0.5 text-muted-foreground leading-snug">
          Tell us where you&apos;re going.
        </p>
      </div>

      <AiHostNoticeBanner featureName="AI Stylist" />

      {/* Input Form */}
      {step === "input" && (
        <div className="space-y-3">
          <div>
            <label
              htmlFor="stylist-event-desc"
              className="text-xs font-extrabold uppercase tracking-wider mb-1.5 block text-foreground"
            >
              Where are you headed?
            </label>
            <div
              className={`rounded-2xl overflow-hidden shadow-sm transition-colors bg-card border-2 ${
                inputTooVague
                  ? "border-gold"
                  : inputReady
                    ? "border-green"
                    : "border-border"
              }`}
            >
              <textarea
                id="stylist-event-desc"
                aria-describedby="stylist-event-status"
                value={eventDesc}
                onChange={(e) => setEventDesc(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    void handleGenerate()
                  }
                }}
                placeholder="e.g. Dinner tonight, job interview, rainy walk…"
                rows={2}
                className="w-full px-3.5 pt-3 pb-2 text-sm font-medium outline-none resize-none bg-transparent text-foreground"
              />

              {/* Voice button bar + status */}
              <div className="flex items-center justify-between gap-2 px-3 py-2 border-t-2 border-border min-h-[46px] bg-muted/40">
                <div className="flex items-center gap-2 min-w-0">
                  {voiceState === "captured" ? (
                    <>
                      <span
                        role="status"
                        className="text-xs font-extrabold text-green truncate"
                      >
                        <span aria-hidden="true">✓ </span>Voice ready
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setEventDesc("")
                          setVoiceState("idle")
                        }}
                        className="text-xs font-extrabold px-2.5 py-1 rounded-full bg-card border-2 border-border text-foreground transition-colors shrink-0 cursor-pointer"
                      >
                        Clear
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={cycleVoice}
                      disabled={voiceState === "processing"}
                      aria-pressed={voiceState === "listening"}
                      aria-label={
                        voiceState === "idle"
                          ? "Speak to describe your event"
                          : voiceState === "listening"
                            ? "Listening — tap to stop"
                            : "Transcribing voice input"
                      }
                      className={`flex items-center gap-1.5 text-xs font-extrabold px-3 min-h-[36px] rounded-full transition-all border-2 shrink-0 cursor-pointer ${
                        voiceState === "listening"
                          ? "bg-pink text-white border-pink animate-pulse"
                          : voiceState === "processing"
                            ? "bg-muted text-foreground border-turquoise"
                            : "bg-card text-foreground border-border hover:border-pink"
                      }`}
                    >
                      <span aria-hidden="true">
                        {voiceState === "processing" ? "⏳" : "🎙"}
                      </span>
                      <span>
                        {voiceState === "idle"
                          ? "Speak"
                          : voiceState === "listening"
                            ? "Listening…"
                            : "Saving…"}
                      </span>
                    </button>
                  )}
                </div>

                <span
                  id="stylist-event-status"
                  role="status"
                  aria-live="polite"
                  className={`text-xs font-extrabold shrink-0 ${
                    inputReady
                      ? "text-green"
                      : inputTooVague
                        ? "text-gold"
                        : "text-muted-foreground"
                  }`}
                >
                  {inputReady
                    ? "✓ Ready"
                    : inputTooVague
                      ? "Add a bit more…"
                      : "Type or speak"}
                </span>
              </div>
            </div>
          </div>

          {/* Dress code chips */}
          <div className="space-y-1.5">
            <span
              id="dress-code-label"
              className="text-xs font-extrabold uppercase tracking-wider block text-muted-foreground"
            >
              Style (Optional)
            </span>
            <div
              role="group"
              aria-labelledby="dress-code-label"
              className="flex flex-wrap gap-1.5"
            >
              {["Casual", "Smart-casual", "Business", "Formal", "Creative"].map(
                (dc) => (
                  <button
                    key={dc}
                    type="button"
                    aria-pressed={dresscode === dc}
                    onClick={() => setDresscode(dresscode === dc ? "" : dc)}
                    className={`min-h-[38px] px-3 py-1 rounded-full text-xs font-extrabold transition-all border-2 shrink-0 cursor-pointer ${
                      dresscode === dc
                        ? "bg-pink text-white border-[#0D0F18]/20 dark:border-white/30 shadow-md shadow-pink/25"
                        : "bg-card text-foreground border-border hover:border-pink"
                    }`}
                  >
                    {dc}
                  </button>
                )
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={!inputReady}
            className={`w-full min-h-[50px] py-3 rounded-2xl text-[15px] font-black flex items-center justify-center gap-2 border-2 shadow-lg transition-all active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${
              inputReady
                ? "bg-pink text-white border-[#0D0F18]/20 dark:border-white/25 hover:brightness-110 shadow-pink/25"
                : "bg-muted text-muted-foreground border-border"
            }`}
          >
            <span aria-hidden="true">✧</span>
            <span>Generate</span>
          </button>

          {/* Quick Ideas */}
          <div className="p-3 rounded-2xl border-2 border-border bg-card space-y-2 shadow-sm">
            <span
              id="quick-scenarios-heading"
              className="text-xs font-extrabold uppercase tracking-wider text-foreground block"
            >
              <span aria-hidden="true">⚡ </span>Quick Ideas (Tap to Fill)
            </span>
            <div
              role="group"
              aria-labelledby="quick-scenarios-heading"
              className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-2"
            >
              {PRESET_EVENTS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  aria-label={`Use idea: ${preset}`}
                  onClick={() => {
                    setEventDesc(preset)
                    if (preset.includes("business-casual")) {
                      setDresscode("Smart-casual")
                    }
                    if (preset.includes("formal")) setDresscode("Formal")
                    if (preset.includes("creative")) setDresscode("Creative")
                  }}
                  className="p-2.5 min-h-[48px] rounded-xl text-xs text-left border-2 border-border bg-muted text-foreground transition-all hover:border-turquoise min-w-0 flex flex-col justify-center cursor-pointer"
                >
                  <p className="font-extrabold text-foreground leading-snug">
                    {preset.split(",")[0]}
                  </p>
                  <p className="text-[11px] font-semibold text-muted-foreground leading-snug truncate mt-0.5">
                    {preset.split(",").slice(1).join(",").trim()}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Loading */}
      {step === "loading" && (
        <div className="rounded-3xl p-5 space-y-4 shadow-md border-2 border-border bg-card">
          <p className="text-sm font-black text-foreground">
            Building outfits…
          </p>
          <AnimatedStepProgress steps={GENERATION_STEPS} intervalMs={400} />
          <button
            type="button"
            onClick={cancelLoading}
            className="w-full min-h-[42px] py-2 rounded-xl text-xs font-extrabold border-2 border-border bg-muted text-foreground transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Network Error & Recovery (Honest backend error, zero silent fallback) */}
      {step === "error" && (
        <div className="space-y-4">
          <AIErrorBanner
            title="Could not load outfits"
            message={
              serviceErrorMessage ||
              "Could not reach the live AI stylist service. Check your backend connection and tap Try Again."
            }
            actions={[
              {
                label: "Try Again",
                primary: true,
                onClick: handleRetry,
              },
              {
                label: "Go Back",
                onClick: () => setStep("input"),
              },
            ]}
          />
        </div>
      )}

      {/* Results View + Conversational Stylist Follow-Up */}
      {step === "results" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-base font-black text-foreground">
              {results.length} Event Looks
            </p>
            <button
              type="button"
              onClick={() => {
                setStep("input")
                setEventDesc("")
                setChatHistory([])
              }}
              className="text-xs font-extrabold px-3 min-h-[38px] rounded-xl bg-muted border-2 border-border text-foreground hover:border-pink shrink-0 cursor-pointer"
            >
              ← New
            </button>
          </div>

          {/* Mini Stylist Chat History */}
          {chatHistory.length > 0 && (
            <div className="rounded-2xl p-2.5 bg-card border-2 border-border space-y-1.5 max-h-28 overflow-y-auto">
              {chatHistory.map((turn, i) => (
                <div
                  key={i}
                  className={`flex ${turn.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] px-3 py-2 rounded-2xl text-xs min-[380px]:text-[13px] font-medium leading-snug break-words border-2 ${
                      turn.role === "user"
                        ? "bg-pink text-white border-pink"
                        : "bg-muted text-foreground border-border"
                    }`}
                  >
                    {turn.role === "stylist" && (
                      <span className="font-bold text-turquoise mr-1">✧</span>
                    )}
                    {turn.text}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Conversational Follow-up Input Bar */}
          <div className="rounded-2xl p-3 bg-card border-2 border-border shadow-sm space-y-2">
            <label
              htmlFor="stylist-followup-input"
              className="text-xs font-extrabold uppercase tracking-wider text-foreground block"
            >
              <span aria-hidden="true">✧ </span>Adjust these outfits
            </label>
            <div className="flex gap-2">
              <input
                id="stylist-followup-input"
                type="text"
                value={followUpInput}
                onChange={(e) => setFollowUpInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    void handleFollowUpSubmit()
                  }
                }}
                placeholder="e.g. no jacket, black shoes"
                className="flex-1 min-w-0 min-h-[42px] rounded-xl px-3 py-2 text-xs font-semibold outline-none bg-muted text-foreground border-2 border-border focus:border-pink"
              />
              <button
                type="button"
                disabled={!followUpInput.trim()}
                onClick={() => void handleFollowUpSubmit()}
                className="px-4 min-h-[42px] py-2 rounded-xl text-xs font-black bg-pink text-white border-2 border-[#0D0F18]/20 disabled:opacity-40 hover:brightness-110 transition-all shrink-0 cursor-pointer"
              >
                Update
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[
                "No outerwear",
                "Black shoes",
                "More comfortable",
                "More formal",
              ].map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => void handleFollowUpSubmit(chip)}
                  className="min-h-[34px] text-xs font-extrabold px-2.5 py-1 rounded-full bg-muted text-foreground border-2 border-border hover:border-turquoise transition-colors cursor-pointer"
                >
                  + {chip}
                </button>
              ))}
            </div>
          </div>

          {/* Outfit Cards */}
          <div className="space-y-3">
            {(user.accessibility.lowDecisionMode && !showBackupOutfits
              ? results.slice(0, 1)
              : results
            ).map((outfit, resultIdx) => {
              const isSpeakingThis = speakingOutfitId === outfit.id
              return (
                <div
                  key={outfit.id}
                  className="rounded-2xl p-3 space-y-2.5 shadow-md border-2 border-border bg-card"
                >
                  {user.accessibility.lowDecisionMode && resultIdx === 0 && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-pink/15 text-pink border-2 border-pink/40">
                      <span aria-hidden="true">⚡</span>
                      <span>Top Match</span>
                    </span>
                  )}

                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-base font-black text-foreground">
                          {outfit.label}
                        </h2>
                        <div
                          role="img"
                          aria-label={`Outfit palette: ${outfit.items
                            .map((i) => getReadableColorLabel(i.color, i.desc, wardrobe))
                            .join(", ")}`}
                          title={`Palette: ${outfit.items
                            .map((i) => getReadableColorLabel(i.color, i.desc, wardrobe))
                            .join(" · ")}`}
                          className="inline-flex items-center p-1 rounded-full bg-muted border border-border shrink-0"
                        >
                          <div className="flex items-center -space-x-1">
                            {outfit.items.map((item, cIdx) => (
                              <span
                                key={`${outfit.id}-${item.desc}-${cIdx}`}
                                className="w-3.5 h-3.5 rounded-full border border-card"
                                style={{ backgroundColor: item.color }}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                      <p className="text-xs font-semibold text-muted-foreground leading-snug line-clamp-2">
                        {outfit.rationale}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {showListen && (
                        <button
                          type="button"
                          onClick={() => {
                            if (isSpeakingThis) {
                              stopSpeaking()
                              setSpeakingOutfitId(null)
                              return
                            }
                            const pieces = outfit.items
                              .map(
                                (i) =>
                                  `${i.type}: ${i.desc}, color ${getReadableColorLabel(i.color, i.desc, wardrobe)}`
                              )
                              .join(". ")
                            const text = `${outfit.label}. ${outfit.dresscodeMatch}. Pieces: ${pieces}. Stylist note: ${outfit.rationale}`
                            const started = speakText(text, () =>
                              setSpeakingOutfitId(null)
                            )
                            if (started) {
                              setSpeakingOutfitId(outfit.id)
                            } else {
                              showToast(
                                "Audio Unavailable",
                                "Voice narration is not supported in this browser.",
                                "warning"
                              )
                            }
                          }}
                          aria-pressed={isSpeakingThis}
                          aria-label={
                            isSpeakingThis
                              ? `Stop reading ${outfit.label} aloud`
                              : `Read ${outfit.label} outfit aloud`
                          }
                          className={`text-xs font-extrabold px-3 min-h-[44px] min-w-[44px] rounded-full flex items-center gap-1.5 border-2 transition-colors shrink-0 cursor-pointer ${
                            isSpeakingThis
                              ? "bg-pink text-white border-pink"
                              : user.accessibility.voiceNarration
                                ? "bg-turquoise text-[#0D0F18] border-[#0D0F18]/25"
                                : "bg-muted text-foreground border-border hover:border-turquoise"
                          }`}
                        >
                          <span aria-hidden="true">
                            {isSpeakingThis ? "⏹" : "🔊"}
                          </span>
                          <span>{isSpeakingThis ? "Stop" : "Listen"}</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setOutfitFeedbackTarget(outfit)}
                        aria-label={`Feedback notes for ${outfit.label}`}
                        title="Give feedback on why this outfit doesn't work"
                        className="text-xs font-extrabold px-3 min-h-[44px] rounded-full flex items-center gap-1 border-2 bg-muted text-foreground border-border hover:border-pink transition-colors shrink-0 cursor-pointer"
                      >
                        <span aria-hidden="true">💬</span>
                        <span>Feedback</span>
                      </button>
                    </div>
                  </div>

                  {/* Items */}
                  <div className="space-y-2">
                    {outfit.items.map((item, idx) => {
                      const readableColor = getReadableColorLabel(
                        item.color,
                        item.desc,
                        wardrobe
                      )
                      const matchedItem = wardrobe.find(
                        (w) =>
                          w.name.toLowerCase() === item.desc.toLowerCase()
                      )
                      const itemImg =
                        matchedItem?.imageData ||
                        getSampleGarmentImage(item.desc, item.type)
                      const selectionTags = getOutfitItemSelectionTags(
                        item,
                        matchedItem
                      )
                      return (
                        <div
                          key={`${item.type}-${idx}`}
                          className="flex items-center justify-between gap-2.5 p-2.5 rounded-xl bg-muted border-2 border-border"
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            {itemImg ? (
                              <img
                                src={itemImg}
                                alt={item.desc}
                                className="w-11 h-11 rounded-xl object-contain bg-[#F6F5F9] p-0.5 border border-border shrink-0"
                              />
                            ) : (
                              <div
                                aria-hidden="true"
                                className="w-11 h-11 rounded-xl flex items-center justify-center border border-border text-lg shrink-0"
                                style={{ background: `${item.color}1E` }}
                              >
                                {getPieceEmoji(item.type, item.emoji)}
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="text-[15px] font-extrabold text-foreground leading-snug">
                                {item.desc}
                              </p>
                              <div className="flex items-center gap-1 flex-wrap mt-1">
                                {selectionTags.map((tag) => (
                                  <span
                                    key={tag}
                                    className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-card text-muted-foreground border border-border leading-tight"
                                  >
                                    {tag}
                                  </span>
                                ))}
                                {user.accessibility.highContrastColors && (
                                  <span className="bg-foreground text-background font-extrabold px-2 py-0.5 rounded-md text-[10px] leading-tight">
                                    {readableColor}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() =>
                                setSwapTarget({
                                  outfitId: outfit.id,
                                  itemIndex: idx,
                                  itemType: item.type,
                                })
                              }
                              aria-label={`Swap ${item.desc} (${item.type}) in ${outfit.label}`}
                              className="text-xs font-extrabold px-3 min-h-[40px] rounded-xl bg-card text-foreground border-2 border-turquoise hover:bg-turquoise/15 transition-all shrink-0 cursor-pointer"
                            >
                              Swap ↺
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setGarmentFeedbackTarget({
                                  item,
                                  outfitId: outfit.id,
                                  index: idx,
                                })
                              }
                              aria-label={`Feedback for ${item.desc}`}
                              title={`Give feedback on ${item.desc}`}
                              className="w-10 h-10 rounded-xl text-xs font-extrabold flex items-center justify-center transition-transform active:scale-95 bg-card text-foreground border-2 border-border hover:border-pink hover:text-pink shrink-0 cursor-pointer"
                            >
                              <span aria-hidden="true">💬</span>
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Collapsible Why it works dropdown disclosure */}
                  <WhyItWorksDisclosure
                    rationale={outfit.rationale}
                    onDeepDive={() => setActiveWhyModal(outfit)}
                  />

                  {/* Control Bar */}
                  <UserControlBar
                    mode={ctrlMode[outfit.id] ?? "default"}
                    approveLabel={
                      saved.has(outfit.id)
                        ? "✓ Saved Look"
                        : "Save This Look"
                    }
                    onApprove={() => {
                      setSaved((s) => new Set([...s, outfit.id]))
                      logOutfitWorn({
                        label: outfit.label,
                        items: outfit.items.map((i) => i.desc),
                        color: outfit.items[0]?.color || THEME_COLORS.pink,
                        direction: "Event Stylist",
                      })
                      setCtrlMode((m) => ({ ...m, [outfit.id]: "default" }))
                    }}
                    onReject={() => setRejectTargetOutfit(outfit)}
                    onRegenerate={() =>
                      handleRestyleSingleOutfit(outfit, "Refresh with new items")
                    }
                    onFavorite={() =>
                      toggleFavoriteOutfit(String(outfit.id || outfit.label))
                    }
                    isFavorite={favoriteOutfitIds.includes(
                      String(outfit.id || outfit.label)
                    )}
                  />
                </div>
              )
            })}

            {user.accessibility.lowDecisionMode && results.length > 1 && (
              <button
                type="button"
                onClick={() => setShowBackupOutfits(!showBackupOutfits)}
                aria-expanded={showBackupOutfits}
                className="w-full min-h-[44px] py-2.5 rounded-2xl text-xs font-extrabold border-2 border-border bg-card text-foreground hover:border-turquoise transition-all shadow-xs cursor-pointer"
              >
                {showBackupOutfits
                  ? "Hide Extra"
                  : `Show More (${results.length - 1})`}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Why Modal */}
      {activeWhyModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setActiveWhyModal(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="stylist-why-modal-title"
            className="rounded-3xl p-5 max-w-sm w-full space-y-4 shadow-2xl border-2 border-border bg-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2
                id="stylist-why-modal-title"
                className="text-base font-black text-foreground"
              >
                Why This Works
              </h2>
              <button
                type="button"
                onClick={() => setActiveWhyModal(null)}
                aria-label="Close explanation dialog"
                className="w-9 h-9 rounded-xl border-2 border-border bg-muted text-foreground font-bold flex items-center justify-center cursor-pointer"
              >
                <span aria-hidden="true">✕</span>
              </button>
            </div>
            <p className="text-xs font-medium text-foreground leading-relaxed">
              {activeWhyModal.whyExplanation}
            </p>
            <button
              type="button"
              onClick={() => setActiveWhyModal(null)}
              className="w-full min-h-[44px] py-2.5 rounded-xl text-sm font-black text-white bg-pink border-2 border-[#0D0F18]/20 hover:brightness-110 shadow-md transition-all cursor-pointer"
            >
              Got It
            </button>
          </div>
        </div>
      )}

      {/* Reject & Custom Feedback Modal */}
      {rejectTargetOutfit && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => {
            setRejectTargetOutfit(null)
            setCustomRejectNote("")
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="stylist-reject-modal-title"
            className="rounded-3xl p-5 max-w-sm w-full space-y-3.5 shadow-2xl border-2 border-border bg-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2
                id="stylist-reject-modal-title"
                className="text-base font-black text-foreground"
              >
                Change &quot;{rejectTargetOutfit.label}&quot;
              </h2>
              <button
                type="button"
                onClick={() => setRejectTargetOutfit(null)}
                aria-label="Close outfit adjustment dialog"
                className="w-9 h-9 rounded-xl border-2 border-border bg-muted text-foreground font-bold flex items-center justify-center cursor-pointer"
              >
                <span aria-hidden="true">✕</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {[
                "No outerwear",
                "Black shoes",
                "Too casual",
                "Too formal",
              ].map((reason) => (
                <button
                  key={reason}
                  type="button"
                  onClick={() => {
                    const target = rejectTargetOutfit
                    setRejectTargetOutfit(null)
                    setCustomRejectNote("")
                    handleRestyleSingleOutfit(target, reason)
                  }}
                  className="p-2.5 min-h-[42px] rounded-xl text-xs font-extrabold text-left border-2 border-border bg-muted hover:border-pink text-foreground transition-all cursor-pointer"
                >
                  {reason}
                </button>
              ))}
            </div>

            <div className="space-y-2 pt-2 border-t-2 border-border">
              <label
                htmlFor="stylist-custom-reject-note"
                className="text-xs font-extrabold text-foreground block"
              >
                Or tell us what to change
              </label>
              <textarea
                id="stylist-custom-reject-note"
                rows={2}
                value={customRejectNote}
                onChange={(e) => setCustomRejectNote(e.target.value)}
                placeholder="e.g. Swap for loafers, or softer shirt…"
                className="w-full rounded-xl p-2.5 text-sm outline-none bg-muted text-foreground border-2 border-border focus:border-pink resize-none"
              />
              <button
                type="button"
                disabled={!customRejectNote.trim()}
                onClick={() => {
                  const target = rejectTargetOutfit
                  const note = customRejectNote.trim()
                  setRejectTargetOutfit(null)
                  setCustomRejectNote("")
                  handleRestyleSingleOutfit(target, note)
                }}
                className="w-full min-h-[44px] py-2.5 rounded-xl text-sm font-black text-white bg-pink border-2 border-[#0D0F18]/20 hover:brightness-110 disabled:opacity-40 transition-all shadow-md cursor-pointer"
              >
                Update Look
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Swap Item Modal */}
      {swapTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setSwapTarget(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="stylist-swap-modal-title"
            className="rounded-3xl p-5 max-w-sm w-full space-y-3 shadow-2xl border-2 border-border bg-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2
                id="stylist-swap-modal-title"
                className="text-base font-black text-foreground"
              >
                Swap {swapTarget.itemType}
              </h2>
              <button
                type="button"
                onClick={() => setSwapTarget(null)}
                aria-label="Close swap garment dialog"
                className="w-9 h-9 rounded-xl border-2 border-border bg-muted text-foreground font-bold flex items-center justify-center cursor-pointer"
              >
                <span aria-hidden="true">✕</span>
              </button>
            </div>
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {wardrobe
                .filter((wItem) =>
                  swapMatchesCategory(swapTarget.itemType, wItem.category),
                )
                .map((wItem) => (
                  <button
                    key={wItem.id}
                    type="button"
                    onClick={() => handleSwapItem(wItem.name, wItem.color)}
                    className="w-full min-h-[48px] p-2.5 rounded-xl flex items-center gap-2.5 border-2 border-border bg-muted text-left hover:border-turquoise transition-all cursor-pointer"
                  >
                    {wItem.imageData ? (
                      <img
                        src={wItem.imageData}
                        alt={wItem.name}
                        className="w-10 h-10 rounded-xl object-contain bg-card border border-border shrink-0"
                      />
                    ) : (
                      <div
                        aria-hidden="true"
                        className="w-10 h-10 rounded-xl flex items-center justify-center border border-border text-lg shrink-0"
                        style={{ background: `${wItem.color}22` }}
                      >
                        {getPieceEmoji(wItem.category)}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-extrabold text-foreground truncate">
                        {wItem.name}
                      </p>
                      <p className="text-xs font-semibold text-muted-foreground">
                        {wItem.colorName}
                      </p>
                    </div>
                    <span className="text-xs font-extrabold px-2.5 py-1 rounded-lg bg-card border-2 border-turquoise text-foreground shrink-0">
                      Pick
                    </span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Demo Test Simulators Footer Bar */}
      <div
        role="group"
        aria-label="Test modes"
        className="mt-2 pt-2.5 border-t-2 border-border flex items-center justify-between gap-2 text-xs"
      >
        <span className="font-bold text-muted-foreground">Test Modes:</span>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setServiceError(!serviceError)}
            aria-pressed={serviceError}
            aria-label="Toggle simulated connection error"
            className={`px-2.5 py-1.5 min-h-[34px] rounded-xl border-2 font-extrabold transition-colors whitespace-nowrap cursor-pointer ${
              serviceError
                ? "border-red text-white bg-red"
                : "border-border bg-muted text-foreground hover:border-red"
            }`}
          >
            {serviceError ? "⚠ Error ON" : "Test Error"}
          </button>
          <button
            type="button"
            onClick={() => setSlowResponse(!slowResponse)}
            aria-pressed={slowResponse}
            aria-label="Toggle simulated slow loading"
            className={`px-2.5 py-1.5 min-h-[34px] rounded-xl border-2 font-extrabold transition-colors whitespace-nowrap cursor-pointer ${
              slowResponse
                ? "border-turquoise text-[#0D0F18] bg-turquoise"
                : "border-border bg-muted text-foreground hover:border-turquoise"
            }`}
          >
            {slowResponse ? "⏳ Slow ON" : "Test Slow"}
          </button>
        </div>
      </div>

      {/* Outfit Feedback Modal */}
      {outfitFeedbackTarget && (
        <OutfitFeedbackModal
          isOpen={Boolean(outfitFeedbackTarget)}
          onClose={() => setOutfitFeedbackTarget(null)}
          outfitLabel={outfitFeedbackTarget.label}
          onSaveFeedback={(notes, reasons) => {
            saveOutfitFeedback(
              String(outfitFeedbackTarget.id || outfitFeedbackTarget.label),
              notes,
              reasons
            )
          }}
          onRegenerateWithFeedback={(notes, reasons) => {
            const combined = [notes, ...reasons].filter(Boolean).join(", ")
            handleRestyleSingleOutfit(outfitFeedbackTarget, combined)
          }}
        />
      )}

      {/* Garment Item Feedback Modal */}
      {garmentFeedbackTarget && (
        <GarmentFeedbackModal
          isOpen={Boolean(garmentFeedbackTarget)}
          onClose={() => setGarmentFeedbackTarget(null)}
          garmentDesc={garmentFeedbackTarget.item.desc}
          garmentType={garmentFeedbackTarget.item.type}
          garmentColor={garmentFeedbackTarget.item.color}
          onSaveFeedback={(notes, reasons) => {
            saveGarmentFeedback(
              `event-look-${garmentFeedbackTarget.outfitId}-${garmentFeedbackTarget.item.desc}`,
              notes,
              reasons
            )
          }}
          onSwapWithFeedback={(notes, reasons) => {
            saveGarmentFeedback(
              `event-look-${garmentFeedbackTarget.outfitId}-${garmentFeedbackTarget.item.desc}`,
              notes,
              reasons
            )
            setSwapTarget({
              outfitId: garmentFeedbackTarget.outfitId,
              itemIndex: garmentFeedbackTarget.index,
              itemType: garmentFeedbackTarget.item.type,
            })
            setGarmentFeedbackTarget(null)
          }}
        />
      )}
    </div>
  )
}
