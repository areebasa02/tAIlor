import { useState } from "react"
import {
  AnimatedStepProgress,
  AIStatusPill,
  UncertaintyBanner,
  UserControlBar,
  AIErrorBanner,
  type ControlMode,
  type VoiceState,
} from "../components/AIComponents"
import { useApp } from "../context/AppContext"

type Step = "input" | "loading" | "results" | "error"

interface GeneratedOutfit {
  id: number
  label: string
  dresscodeMatch: string
  rationale: string
  items: { type: string desc: string color: string emoji: string }[]
  whyExplanation: string
}

const PRESET_EVENTS = [
  "Networking dinner at rooftop venue, 7pm Thursday, business-casual",
  "Software engineering conference keynote, casual tech modern",
  "Rainy afternoon client pitch presentation, smart-casual with layers",
  "Art gallery opening & evening social, creative chic with focal color",
]

const GENERATION_STEPS = [
  "Interpreting event context & venue dress code…",
  "Scanning available wardrobe pieces and clean laundry…",
  "Checking historical outfit logs for repeats…",
  "Applying color harmony & social norm algorithms…",
  "Synthesizing tailored styling suggestions…",
]

export default function GeneratorTab() {
  const { wardrobe, logOutfitWorn, showToast } = useApp()
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
  const [activeWhyModal, setActiveWhyModal] = useState<GeneratedOutfit | null>(
    null,
  )
  const [swapTarget, setSwapTarget] = useState<{
    outfitId: number
    itemIndex: number
  } | null>(null)

  const [results, setResults] = useState<GeneratedOutfit[]>([
    {
      id: 1,
      label: "Option A — Polished & Authoritative",
      dresscodeMatch: "98% match for Business-Casual Networking",
      rationale:
        "A monochromatic warm-toned look reads as approachable yet distinctly authoritative — ideal for networking dinners where you want to make an impression without feeling overdressed.",
      items: [
        {
          type: "Top",
          desc: "Cream linen blouse",
          color: "#F5EFD8",
          emoji: "👚",
        },
        {
          type: "Bottom",
          desc: "Camel wide trousers",
          color: "#C8965A",
          emoji: "👖",
        },
        {
          type: "Shoes",
          desc: "Tan leather loafers",
          color: "#B8825A",
          emoji: "👞",
        },
      ],
      whyExplanation:
        "The rooftop temperature will drop after sunset; linen paired with structured wool-blend trousers protects against drafts while maintaining sophisticated warm-tonal elegance.",
    },
    {
      id: 2,
      label: "Option B — Intentional Statement",
      dresscodeMatch: "95% match for Creative Professional",
      rationale:
        "The magenta-black-white triad commands visual focus in a room dominated by navy and grey suits. The black wide trousers ground the vibrant blouse with dignity.",
      items: [
        {
          type: "Top",
          desc: "Magenta button-down",
          color: "#D40067",
          emoji: "👚",
        },
        {
          type: "Bottom",
          desc: "Black wide-leg trousers",
          color: "#1A1A2E",
          emoji: "👖",
        },
        {
          type: "Shoes",
          desc: "White chunky platforms",
          color: "#E8E8E8",
          emoji: "👟",
        },
      ],
      whyExplanation:
        "High-contrast triads signal confidence and creative leadership. Breathable rayon blouse handles indoor dining heat effortlessly.",
    },
  ])

  const inputTooVague =
    eventDesc.trim().length > 0 && eventDesc.trim().length < 14
  const inputReady = eventDesc.trim().length >= 14

  const handleGenerate = () => {
    if (!inputReady) return
    if (serviceError) {
      setStep("error")
      return
    }
    setStep("loading")
  }

  const handleLoadingComplete = () => {
    setStep("results")
    showToast(
      "Outfits Generated",
      "2 tailored event looks ready for review.",
      "success",
    )
  }

  const cycleVoice = () => {
    if (voiceState === "idle" || voiceState === "error") {
      setVoiceState("listening")
    } else if (voiceState === "listening") {
      setVoiceState("processing")
      setTimeout(() => {
        setEventDesc(
          "Networking dinner at a rooftop venue, 7pm Thursday, business-casual",
        )
        setVoiceState("captured")
      }, 1100)
    }
  }

  const handleSwapItem = (
    replacementName: string,
    replacementColor: string,
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
      }),
    )
    setSwapTarget(null)
    showToast("Piece Updated", `Swapped in ${replacementName}.`, "info")
  }

  return (
    <div className="px-5 pt-2 pb-4 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2
            className="text-xl font-bold text-white"
            style={{ fontFamily: "Nunito, sans-serif" }}
          >
            Event Outfit Stylist
          </h2>
          <p
            className="text-xs mt-0.5"
            style={{ color: "var(--muted-foreground)" }}
          >
            Describe your venue, crowd, and vibe — AI crafts the ideal outfit
            from your wardrobe
          </p>
        </div>

        {/* AI Error Simulator for Flow 05 evaluation */}
        <button
          type="button"
          onClick={() => setServiceError(!serviceError)}
          className="text-[10px] px-2 py-1 rounded-lg border transition-colors shrink-0"
          style={{
            borderColor: serviceError ? "var(--orange)" : "var(--border)",
            color: serviceError ? "var(--orange)" : "var(--muted-foreground)",
            background: serviceError ? "rgba(232,75,26,0.1)" : "transparent",
          }}
          title="Simulate service timeout / AI offline recovery flow"
        >
          {serviceError ? "⚠ AI Error ON" : "Test AI Error"}
        </button>
      </div>

      {/* Input Form (Flow 01 Ethan) */}
      {step === "input" && (
        <div className="space-y-4">
          {/* Quick Preset Prompts */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400">
              Quick Event Scenarios:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_EVENTS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    setEventDesc(preset)
                    if (preset.includes("business-casual"))
                      setDresscode("Smart-casual")
                    if (preset.includes("formal")) setDresscode("Formal")
                    if (preset.includes("creative")) setDresscode("Creative")
                  }}
                  className="px-2.5 py-1 rounded-xl text-[10px] text-left border transition-all hover:border-[#72D4F0]"
                  style={{
                    background: "var(--muted)",
                    borderColor: "var(--border)",
                    color: "var(--foreground)",
                  }}
                >
                  {preset.split(",")[0]}
                </button>
              ))}
            </div>
          </div>

          {/* Text Area with Embedded Voice Input */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 block text-muted-foreground">
              Describe Your Upcoming Event
            </label>
            <div
              className="rounded-2xl overflow-hidden shadow-inner transition-colors"
              style={{
                background: "var(--muted)",
                border: inputTooVague
                  ? "1px solid rgba(255,211,61,0.5)"
                  : inputReady
                    ? "1px solid rgba(59,191,108,0.5)"
                    : "1px solid var(--border)",
              }}
            >
              <textarea
                value={eventDesc}
                onChange={(e) => setEventDesc(e.target.value)}
                placeholder="e.g. Networking dinner at a rooftop venue, 7pm Thursday, business-casual"
                rows={3}
                className="w-full px-4 pt-3 pb-1 text-sm outline-none resize-none"
                style={{
                  background: "transparent",
                  color: "var(--foreground)",
                }}
              />

              {/* Voice button bar inside the textarea box */}
              <div
                className="flex items-center gap-2 px-3 pb-2 pt-1.5"
                style={{ borderTop: "1px solid var(--border)" }}
              >
                {voiceState === "captured" ? (
                  <>
                    <span className="text-[10px] flex-1 font-semibold text-green-400">
                      ✓ Voice transcript populated above
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setEventDesc("")
                        setVoiceState("idle")
                      }}
                      className="text-[10px] px-2 py-0.5 rounded-full"
                      style={{
                        background: "var(--card)",
                        color: "var(--muted-foreground)",
                      }}
                    >
                      Clear
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={cycleVoice}
                      disabled={voiceState === "processing"}
                      className="flex items-center gap-1.5 text-[10px] font-bold px-3 py-1 rounded-full transition-all"
                      style={{
                        background:
                          voiceState === "listening"
                            ? "rgba(212,0,103,0.2)"
                            : "var(--card)",
                        color:
                          voiceState === "listening"
                            ? "var(--magenta)"
                            : voiceState === "processing"
                              ? "#72D4F0"
                              : "var(--muted-foreground)",
                        border: `1px solid ${
                          voiceState === "listening"
                            ? "rgba(212,0,103,0.5)"
                            : "var(--border)"
                        }`,
                      }}
                    >
                      <span>{voiceState === "processing" ? "⏳" : "🎙"}</span>
                      <span>
                        {voiceState === "idle"
                          ? "Voice Dictation"
                          : voiceState === "listening"
                            ? "Listening… tap to finish"
                            : "Transcribing speech…"}
                      </span>
                    </button>
                    <span className="text-[9px] text-muted-foreground">
                      or type above
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Context Feedback */}
            {inputTooVague && (
              <div className="mt-2">
                <UncertaintyBanner message="Needs more context — mention the venue, time of day, or dress code for optimal accuracy." />
              </div>
            )}
            {inputReady && (
              <div className="mt-2 flex items-center justify-between">
                <AIStatusPill
                  state="success"
                  label="Event context complete & validated"
                />
                <span className="text-[10px] text-muted-foreground">
                  {eventDesc.length} characters
                </span>
              </div>
            )}
          </div>

          {/* Dress code chips */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider block text-muted-foreground">
              Target Dress Code (Optional Guidance)
            </label>
            <div className="flex flex-wrap gap-2">
              {["Casual", "Smart-casual", "Business", "Formal", "Creative"].map(
                (dc) => (
                  <button
                    key={dc}
                    type="button"
                    onClick={() => setDresscode(dresscode === dc ? "" : dc)}
                    className="px-3.5 py-1.5 rounded-full text-xs font-bold transition-all"
                    style={{
                      background:
                        dresscode === dc ? "var(--magenta)" : "var(--muted)",
                      color:
                        dresscode === dc ? "#fff" : "var(--muted-foreground)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    {dc}
                  </button>
                ),
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={!inputReady}
            className="w-full py-3.5 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 shadow-lg transition-all hover:brightness-110 active:scale-99 disabled:opacity-50"
            style={{
              background: inputReady ? "var(--magenta)" : "var(--muted)",
              color: inputReady ? "#fff" : "var(--muted-foreground)",
            }}
          >
            <span>✧</span>
            <span>Generate Context Outfits</span>
          </button>
        </div>
      )}

      {/* Loading */}
      {step === "loading" && (
        <div
          className="rounded-3xl p-6 space-y-4 shadow-xl border"
          style={{ background: "var(--card)", borderColor: "var(--border)" }}
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-white">Synthesizing Looks</p>
            <AIStatusPill state="loading" label="Llama-3.2 Engine Active" />
          </div>

          <AnimatedStepProgress
            steps={GENERATION_STEPS}
            intervalMs={750}
            onComplete={handleLoadingComplete}
          />

          <button
            type="button"
            onClick={() => setStep("input")}
            className="w-full py-2.5 rounded-xl text-xs font-semibold text-muted-foreground hover:text-white"
          >
            Cancel Generation
          </button>
        </div>
      )}

      {/* Service Error & Recovery (Flow 05) */}
      {step === "error" && (
        <div className="space-y-4">
          <AIErrorBanner
            title="Stylist Engine Temporarily Offline"
            message="We could not establish a connection with the neural wardrobe model. Your digital wardrobe is still accessible for manual browsing."
            actions={[
              {
                label: "Retry AI Generation",
                primary: true,
                onClick: () => {
                  setServiceError(false)
                  setStep("loading")
                },
              },
              {
                label: "Switch to Manual Wardrobe",
                onClick: () => setStep("input"),
              },
            ]}
          />
        </div>
      )}

      {/* Results View */}
      {step === "results" && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-white">
                2 Outfits Tailored for Event
              </p>
              <p className="text-[10px] text-muted-foreground">
                Select an option to approve, edit, or explain
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setStep("input")
                setEventDesc("")
              }}
              className="text-xs font-semibold hover:underline"
              style={{ color: "var(--sky)" }}
            >
              ← New Event
            </button>
          </div>

          {/* Event Context Pill */}
          <div
            className="rounded-2xl px-4 py-2.5 text-xs leading-relaxed flex items-center justify-between"
            style={{
              background: "var(--muted)",
              color: "var(--muted-foreground)",
            }}
          >
            <div className="truncate">
              <span style={{ color: "var(--sky)" }} className="font-semibold">
                ⛅ {dresscode} ·{" "}
              </span>
              <span>{eventDesc}</span>
            </div>
          </div>

          {/* Outfit Cards - Side-by-side on Presentation Screens, Stacked on Mobile */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            {results.map((outfit) => (
              <div
                key={outfit.id}
                className="rounded-3xl p-5 space-y-4 shadow-xl border"
                style={{
                  background: "var(--card)",
                  borderColor: "var(--border)",
                }}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      {outfit.label}
                    </h3>
                    <span className="text-[10px] font-semibold text-green-400">
                      {outfit.dresscodeMatch}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveWhyModal(outfit)}
                    className="text-[11px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1 border border-white/10 hover:border-sky-400"
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      color: "var(--sky)",
                    }}
                  >
                    <span>💡</span>
                    <span>Why?</span>
                  </button>
                </div>

                {/* Items */}
                <div className="space-y-2">
                  {outfit.items.map((item, idx) => (
                    <div
                      key={`${item.type}-${idx}`}
                      className="flex items-center justify-between gap-3 p-2.5 rounded-2xl"
                      style={{
                        background: "var(--muted)",
                        border:
                          ctrlMode[outfit.id] === "editing"
                            ? "1px solid rgba(114,212,240,0.5)"
                            : "1px solid transparent",
                      }}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center text-xs shadow-sm"
                          style={{ background: item.color }}
                        >
                          {item.emoji}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[9px] uppercase font-bold text-muted-foreground">
                            {item.type}
                          </p>
                          <p className="text-xs font-semibold text-white truncate">
                            {item.desc}
                          </p>
                        </div>
                      </div>

                      {ctrlMode[outfit.id] === "editing" ? (
                        <button
                          type="button"
                          onClick={() =>
                            setSwapTarget({
                              outfitId: outfit.id,
                              itemIndex: idx,
                            })
                          }
                          className="text-[10px] font-bold px-2 py-0.5 rounded-lg"
                          style={{ background: "var(--sky)", color: "#0D0F18" }}
                        >
                          Swap ↺
                        </button>
                      ) : (
                        <span className="text-xs">✓</span>
                      )}
                    </div>
                  ))}
                </div>

                {/* Rationale */}
                <div
                  className="rounded-2xl p-3 text-xs leading-relaxed"
                  style={{
                    background: "rgba(114,212,240,0.06)",
                    border: "1px solid rgba(114,212,240,0.15)",
                    color: "var(--muted-foreground)",
                  }}
                >
                  <strong className="text-white">Stylist Note:</strong>{" "}
                  {outfit.rationale}
                </div>

                {/* Control Bar */}
                <UserControlBar
                  mode={ctrlMode[outfit.id]}
                  approveLabel={
                    saved.has(outfit.id)
                      ? "✓ Saved to Collection"
                      : "Approve & Save Look"
                  }
                  onApprove={() => {
                    setSaved((s) => new Set([...s, outfit.id]))
                    logOutfitWorn({
                      label: outfit.label,
                      items: outfit.items.map((i) => i.desc),
                      color: outfit.items[0]?.color || "#D40067",
                      direction: "Event Stylist",
                    })
                    setCtrlMode((m) => ({ ...m, [outfit.id]: "default" }))
                  }}
                  onEdit={() =>
                    setCtrlMode((m) => ({
                      ...m,
                      [outfit.id]:
                        m[outfit.id] === "editing" ? "default" : "editing",
                    }))
                  }
                  onReject={() =>
                    setCtrlMode((m) => ({ ...m, [outfit.id]: "rejected" }))
                  }
                  onRegenerate={() => {
                    setCtrlMode((m) => ({ ...m, [outfit.id]: "regenerating" }))
                    setTimeout(() => {
                      setCtrlMode((m) => ({ ...m, [outfit.id]: "default" }))
                      showToast(
                        "Regenerated",
                        "Look refreshed with subtle style adjustment.",
                        "info",
                      )
                    }, 1200)
                  }}
                  onUndo={() =>
                    setCtrlMode((m) => ({ ...m, [outfit.id]: "undone" }))
                  }
                  onWhy={() => setActiveWhyModal(outfit)}
                  showWhy={true}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Why Modal */}
      {activeWhyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div
            className="rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl border"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">
                Why This Outfit Fits
              </h3>
              <button
                type="button"
                onClick={() => setActiveWhyModal(null)}
                className="text-xs text-muted-foreground hover:text-white"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {activeWhyModal.whyExplanation}
            </p>
            <button
              type="button"
              onClick={() => setActiveWhyModal(null)}
              className="w-full py-2.5 rounded-xl text-xs font-bold text-white"
              style={{ background: "var(--magenta)" }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Swap item modal */}
      {swapTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div
            className="rounded-3xl p-5 max-w-sm w-full space-y-3 shadow-2xl border"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">
                Choose Alternative Piece
              </h3>
              <button
                type="button"
                onClick={() => setSwapTarget(null)}
                className="text-xs text-muted-foreground"
              >
                ✕
              </button>
            </div>
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {wardrobe.slice(0, 5).map((wItem) => (
                <button
                  key={wItem.id}
                  type="button"
                  onClick={() => handleSwapItem(wItem.name, wItem.color)}
                  className="w-full p-2.5 rounded-xl flex items-center gap-2.5 border text-left hover:border-sky-400"
                  style={{
                    background: "var(--muted)",
                    borderColor: "var(--border)",
                  }}
                >
                  <div
                    className="w-5 h-5 rounded-md"
                    style={{ background: wItem.color }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-white truncate">
                      {wItem.name}
                    </p>
                    <p className="text-[9px] text-muted-foreground">
                      {wItem.category}
                    </p>
                  </div>
                  <span className="text-xs text-sky-400 font-bold">Swap</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
