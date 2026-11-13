import { useState, useRef, useEffect } from "react";
import {
  AnimatedStepProgress,
  AIStatusPill,
  UncertaintyBanner,
  UserControlBar,
  AIErrorBanner,
  type ControlMode,
  type VoiceState,
} from "../components/AIComponents";
import { useApp } from "../context/AppContext";
import { THEME_COLORS } from "../types/theme";

type Step = "input" | "loading" | "results" | "error";

interface GeneratedOutfit {
  id: number;
  label: string;
  dresscodeMatch: string;
  rationale: string;
  items: { type: string; desc: string; color: string; emoji: string }[];
  whyExplanation: string;
  usedFallback: boolean;
}

const PRESET_EVENTS = [
  "Networking dinner at rooftop venue, 7pm Thursday, business-casual",
  "Software engineering conference keynote, casual tech modern",
  "Rainy afternoon client pitch presentation, smart-casual with layers",
  "Art gallery opening & evening social, creative chic with focal color",
];

const GENERATION_STEPS = [
  "Interpreting event context & venue dress code…",
  "Scanning available wardrobe pieces and clean laundry…",
  "Checking historical outfit logs for repeats…",
  "Applying color harmony & social norm algorithms…",
  "Synthesizing tailored styling suggestions…",
];

export default function GeneratorTab() {
  const {
    wardrobe,
    logOutfitWorn,
    showToast,
  } = useApp();
  const errorTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (errorTimerRef.current) {
        clearTimeout(errorTimerRef.current);
      }
    };
  }, []);

  const [step, setStep] = useState<Step>("input");
  const [eventDesc, setEventDesc] = useState("");
  const [dresscode, setDresscode] = useState("Smart-casual");
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [saved, setSaved] = useState<Set<number>>(new Set());
  const [ctrlMode, setCtrlMode] = useState<Record<number, ControlMode>>({
    1: "default",
    2: "default",
  });
  const [serviceError, setServiceError] = useState(false);
  const [serviceErrorMessage, setServiceErrorMessage] = useState("");
  const [slowResponse, setSlowResponse] = useState(false);
  const [activeWhyModal, setActiveWhyModal] = useState<GeneratedOutfit | null>(
    null,
  );
  const [swapTarget, setSwapTarget] = useState<{
    outfitId: number;
    itemIndex: number;
  } | null>(null);

  const [results, setResults] = useState<GeneratedOutfit[]>([]);

  const inputTooVague =
    eventDesc.trim().length > 0 && eventDesc.trim().length < 14;
  const inputReady = eventDesc.trim().length >= 14;

  const handleRetry = () => {
    if (errorTimerRef.current) {
      clearTimeout(errorTimerRef.current);
      errorTimerRef.current = null;
    }
    if (serviceError) {
      setServiceError(false);
      setServiceErrorMessage("");
      setStep("input");
      return;
    }
    void handleGenerate();
  };

  const cancelLoading = () => {
    if (errorTimerRef.current) {
      clearTimeout(errorTimerRef.current);
      errorTimerRef.current = null;
    }
    setStep("input");
  };

  const handleGenerate = async () => {
    if (!inputReady) return;
    if (errorTimerRef.current) {
      clearTimeout(errorTimerRef.current);
      errorTimerRef.current = null;
    }
    if (serviceError) {
      setStep("error");
      return;
    }
    setStep("loading");
    setServiceErrorMessage("");
    try {
      const response = await fetch("/api/stylist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: eventDesc,
          dresscode,
          wardrobe: wardrobe.map(({ name, category, color }) => ({
            name,
            category,
            color,
          })),
        }),
      });
      const result = (await response.json()) as {
        advice?: string;
        outfits?: GeneratedOutfit[];
        error?: string;
      };
      if (!response.ok || !result.advice || !result.outfits?.length) {
        throw new Error(result.error || "The stylist service returned no advice.");
      }
      setResults(result.outfits);
      setCtrlMode(
        Object.fromEntries(
          result.outfits.map((outfit) => [outfit.id, "default" as ControlMode]),
        ),
      );
      setServiceErrorMessage("");
      if (slowResponse) {
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
      }
      handleLoadingComplete(result.outfits.length);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Please try again.";
      setServiceErrorMessage(message);
      setStep("error");
      showToast(
        "Stylist unavailable",
        message,
        "warning",
      );
    }
  };

  const handleLoadingComplete = (outfitCount = results.length) => {
    setStep("results");
    showToast(
      "Outfits Generated",
      `${outfitCount} tailored event looks ready for review.`,
      "success",
    );
  };

  const cycleVoice = () => {
    if (voiceState === "idle" || voiceState === "error") {
      setVoiceState("listening");
    } else if (voiceState === "listening") {
      setVoiceState("processing");
      setTimeout(() => {
        setEventDesc(
          "Networking dinner at a rooftop venue, 7pm Thursday, business-casual",
        );
        setVoiceState("captured");
      }, 1100);
    }
  };

  const handleSwapItem = (
    replacementName: string,
    replacementColor: string,
  ) => {
    if (!swapTarget) return;
    setResults((prev) =>
      prev.map((o) => {
        if (o.id === swapTarget.outfitId) {
          const updated = [...o.items];
          updated[swapTarget.itemIndex] = {
            ...updated[swapTarget.itemIndex],
            desc: replacementName,
            color: replacementColor,
          };
          return { ...o, items: updated };
        }
        return o;
      }),
    );
    setSwapTarget(null);
    showToast("Piece Updated", `Swapped in ${replacementName}.`, "info");
  };

  return (
    <div className="px-5 pt-2 pb-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2
            className="text-xl font-bold text-white"
            style={{ fontFamily: "Nunito, sans-serif" }}
          >
            Event Outfit Stylist
          </h2>
          <p className="text-xs mt-0.5 text-muted-foreground">
            Describe your venue, crowd, and vibe — AI crafts the ideal outfit
            from your wardrobe
          </p>
        </div>

        {/* AI Simulator toggles for Flow 05 evaluation */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setServiceError(!serviceError)}
            className={`text-[10px] px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${
              serviceError
                ? "border-red text-red bg-red/10 font-bold"
                : "border-border text-muted-foreground hover:text-white"
            }`}
            title="Simulate service timeout / AI offline recovery flow"
          >
            {serviceError ? "⚠ AI Error ON" : "Test AI Error"}
          </button>

          <button
            type="button"
            onClick={() => setSlowResponse(!slowResponse)}
            className={`text-[10px] px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${
              slowResponse
                ? "border-turquoise text-turquoise bg-turquoise/10 font-bold"
                : "border-border text-muted-foreground hover:text-white"
            }`}
            title="Simulate a slow AI response delay"
          >
            {slowResponse ? "⏳ Slow Response ON" : "Test slow response"}
          </button>
        </div>
      </div>

      {/* Input Form */}
      {step === "input" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column on Desktop */}
          <div className="lg:col-span-7 space-y-4">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 block text-muted-foreground">
                Describe Your Upcoming Event
              </label>
              <div
                className={`rounded-2xl overflow-hidden shadow-inner transition-colors bg-muted border ${
                  inputTooVague
                    ? "border-gold/50"
                    : inputReady
                      ? "border-green/50"
                      : "border-border"
                }`}
              >
                <textarea
                  value={eventDesc}
                  onChange={(e) => setEventDesc(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleGenerate();
                    }
                  }}
                  placeholder="e.g. Networking dinner at a rooftop venue, 7pm Thursday, business-casual"
                  rows={3}
                  className="w-full px-4 pt-3 pb-1 text-sm outline-none resize-none bg-transparent text-foreground"
                />

                {/* Voice button bar */}
                <div className="flex items-center gap-2 px-3 pb-2 pt-1.5 border-t border-border">
                  {voiceState === "captured" ? (
                    <>
                      <span className="text-[10px] flex-1 font-semibold text-green">
                        ✓ Voice transcript populated above
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setEventDesc("");
                          setVoiceState("idle");
                        }}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-card text-muted-foreground hover:text-white transition-colors"
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
                        className={`flex items-center gap-1.5 text-[10px] font-bold px-3 py-1 rounded-full transition-all border ${
                          voiceState === "listening"
                            ? "bg-pink/20 text-pink border-pink/50 animate-pulse"
                            : voiceState === "processing"
                              ? "bg-card text-turquoise border-border"
                              : "bg-card text-muted-foreground border-border hover:text-white"
                        }`}
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

              <button
                type="button"
                onClick={handleGenerate}
                disabled={!inputReady}
                className={`mt-2 w-full py-3.5 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 shadow-lg transition-all active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed ${
                  inputReady
                    ? "bg-pink text-white hover:brightness-110 shadow-pink/20"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                <span>✧</span>
                <span>Generate Outfits</span>
              </button>
            </div>

            {/* Dress code chips */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider block text-muted-foreground">
                Target Dress Code (Optional Guidance)
              </label>
              <div className="flex flex-wrap gap-2">
                {[
                  "Casual",
                  "Smart-casual",
                  "Business",
                  "Formal",
                  "Creative",
                ].map((dc) => (
                  <button
                    key={dc}
                    type="button"
                    onClick={() => setDresscode(dresscode === dc ? "" : dc)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all border ${
                      dresscode === dc
                        ? "bg-pink text-white border-pink shadow-md shadow-pink/20"
                        : "bg-muted text-muted-foreground border-border hover:text-white"
                    }`}
                  >
                    {dc}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column on Desktop */}
          <div className="lg:col-span-5 space-y-4">
            <div className="p-4 rounded-3xl border border-border bg-card space-y-2.5 shadow-sm">
              <span className="text-[10px] font-bold uppercase tracking-wider text-turquoise block">
                ⚡ Quick Event Scenarios
              </span>
              <div className="flex flex-col gap-1.5">
                {PRESET_EVENTS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setEventDesc(preset);
                      if (preset.includes("business-casual"))
                        setDresscode("Smart-casual");
                      if (preset.includes("formal")) setDresscode("Formal");
                      if (preset.includes("creative")) setDresscode("Creative");
                    }}
                    className="p-2.5 rounded-xl text-[11px] text-left border border-border bg-muted text-foreground transition-all hover:border-turquoise hover:scale-[1.01]"
                  >
                    <p className="font-bold text-white">
                      {preset.split(",")[0]}
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {preset.split(",").slice(1).join(",")}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Loading */}
      {step === "loading" && (
        <div className="rounded-3xl p-6 space-y-4 shadow-xl border border-border bg-card">
          <p className="text-sm font-bold text-white">Synthesizing Looks</p>

          <AnimatedStepProgress
            steps={GENERATION_STEPS}
            intervalMs={750}
          />

          <button
            type="button"
            onClick={cancelLoading}
            className="w-full py-2.5 rounded-xl text-xs font-semibold text-muted-foreground hover:text-white transition-colors"
          >
            Cancel Generation
          </button>
        </div>
      )}

      {/* Network Error & Recovery */}
      {step === "error" && (
        <div className="space-y-4">
          <AIErrorBanner
            title={
              serviceError
                ? "Stylist Engine Temporarily Offline"
                : "Network Error"
            }
            message={
              serviceErrorMessage ||
              (serviceError
                ? "We could not establish a connection with the neural wardrobe model. Your digital wardrobe is still accessible for manual browsing."
                : "The connection was interrupted. Please try again.")
            }
            actions={[
              {
                label: serviceError ? "Retry AI Generation" : "Try Again",
                primary: true,
                onClick: handleRetry,
              },
              {
                label: serviceError
                  ? "Switch to Manual Wardrobe"
                  : "Back to Edit",
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
                {results.length} Outfits Tailored for Event
              </p>
              <p className="text-[10px] text-muted-foreground">
                Select an option to approve, edit, or explain
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setStep("input");
                setEventDesc("");
              }}
              className="text-xs font-semibold text-turquoise hover:underline"
            >
              ← New Event
            </button>
          </div>

          {/* Event Context Pill */}
          <div className="rounded-2xl px-4 py-2.5 text-xs leading-relaxed flex items-center justify-between bg-muted text-muted-foreground">
            <div className="truncate">
              <span className="font-semibold text-turquoise">
                ⛅ {dresscode} ·{" "}
              </span>
              <span>{eventDesc}</span>
            </div>
          </div>

          {/* Outfit Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            {results.map((outfit) => (
              <div
                key={outfit.id}
                className="rounded-3xl p-5 space-y-4 shadow-xl border border-border bg-card"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      {outfit.label}
                    </h3>
                    <span className="text-[10px] font-semibold text-green">
                      {outfit.dresscodeMatch}
                    </span>
                    {outfit.usedFallback && (
                      <span className="block text-[9px] font-semibold text-gold">
                        Fallback normalization used
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveWhyModal(outfit)}
                    className="text-[11px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1 border border-white/10 bg-white/5 text-turquoise hover:border-turquoise transition-colors"
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
                      className={`flex items-center justify-between gap-3 p-2.5 rounded-2xl bg-muted border ${
                        ctrlMode[outfit.id] === "editing"
                          ? "border-turquoise/50"
                          : "border-transparent"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center text-xs shadow-sm border border-white/10"
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
                          className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-turquoise text-[#0D0F18] hover:brightness-110 transition-all"
                        >
                          Swap ↺
                        </button>
                      ) : (
                        <span className="text-xs text-green">✓</span>
                      )}
                    </div>
                  ))}
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
                    setSaved((s) => new Set([...s, outfit.id]));
                    logOutfitWorn({
                      label: outfit.label,
                      items: outfit.items.map((i) => i.desc),
                      color: outfit.items[0]?.color || THEME_COLORS.pink,
                      direction: "Event Stylist",
                    });
                    setCtrlMode((m) => ({ ...m, [outfit.id]: "default" }));
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
                    setCtrlMode((m) => ({ ...m, [outfit.id]: "regenerating" }));
                    setTimeout(() => {
                      setCtrlMode((m) => ({ ...m, [outfit.id]: "default" }));
                      showToast(
                        "Regenerated",
                        "Look refreshed with subtle style adjustment.",
                        "info",
                      );
                    }, 1200);
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
          <div className="rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl border border-border bg-card">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">
                Why This Outfit Works
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
              className="w-full py-2.5 rounded-xl text-xs font-bold text-white bg-pink hover:brightness-110 shadow-md shadow-pink/20 transition-all"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Swap Item Modal */}
      {swapTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="rounded-3xl p-5 max-w-sm w-full space-y-3 shadow-2xl border border-border bg-card">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">
                Choose Alternative Piece
              </h3>
              <button
                type="button"
                onClick={() => setSwapTarget(null)}
                className="text-xs text-muted-foreground hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {wardrobe.slice(0, 5).map((wItem) => (
                <button
                  key={wItem.id}
                  type="button"
                  onClick={() => handleSwapItem(wItem.name, wItem.color)}
                  className="w-full p-2.5 rounded-xl flex items-center gap-2.5 border border-border bg-muted text-left hover:border-turquoise transition-all"
                >
                  <div
                    className="w-5 h-5 rounded-md border border-white/10"
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
                  <span className="text-xs text-turquoise font-bold">Swap</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}