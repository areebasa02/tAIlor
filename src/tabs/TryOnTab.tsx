import { lazy, Suspense, useState } from "react"
import {
  PulseOrb,
  AIErrorBanner,
  AIStatusPill,
} from "../components/AIComponents"
import { useApp } from "../context/AppContext"

const TryOnMannequin3D = lazy(() => import("../components/TryOnMannequin3D"))

type Step = "outfit" | "consent" | "processing" | "preview" | "error"

interface TryOnOutfit {
  id: number
  label: string
  tagline: string
  items: { type: string; name: string; color: string; emoji: string }[]
  colors: string[]
}

const TRYON_OUTFITS: TryOnOutfit[] = [
  {
    id: 1,
    label: "Magenta Statement & Camel",
    tagline: "Warm complementary contrast for daytime to evening",
    colors: ["#D40067", "#C8965A", "#B8825A"],
    items: [
      {
        type: "Top",
        name: "Magenta button-down",
        color: "#D40067",
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
    colors: ["#007A8A", "#1A1A2E", "#F2F2F2"],
    items: [
      {
        type: "Outerwear",
        name: "Teal trench coat",
        color: "#007A8A",
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
        name: "White chunky platforms",
        color: "#E8E8E8",
        emoji: "👟",
      },
    ],
  },
]

type AvatarType = "mannequin" | "demo_photo" | "upload_photo"

export default function TryOnTab() {
  const { user, logOutfitWorn, showToast } = useApp()
  const [step, setStep] = useState<Step>("outfit")
  const [selectedOutfit, setSelectedOutfit] = useState<TryOnOutfit | null>(
    TRYON_OUTFITS[0],
  )
  const [avatarType, setAvatarType] = useState<AvatarType>("mannequin")
  const [fitStyle, setFitStyle] = useState<"fitted" | "standard" | "relaxed">(
    "standard",
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

  const STAGES = [
    "Validating garment textures & lighting…",
    "Analyzing body silhouette (cat-VTON)…",
    "Warping clothing mesh to virtual mannequin…",
    "Rendering realistic fabric drape & shadows…",
  ]

  const handleSelectOutfit = (o: TryOnOutfit) => {
    setSelectedOutfit(o)
    setStep("consent")
  }

  const startGeneration = (avatarChoice: AvatarType) => {
    setAvatarType(avatarChoice)
    if (simulatedError) {
      setStep("error")
      return
    }
    setStep("processing")
    setProcessingStage(0)

    const interval = setInterval(() => {
      setProcessingStage((prev) => {
        if (prev >= STAGES.length - 1) {
          clearInterval(interval)
          setTimeout(() => {
            setStep("preview")
            showToast(
              "Preview Ready",
              "cat-VTON virtual fitting room render complete.",
              "success",
            )
          }, 500)
          return prev
        }
        return prev + 1
      })
    }, 700)
  }

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
      "success",
    )
  }

  const toggleLayer = (type: string) => {
    setActiveLayers((prev) => ({ ...prev, [type]: !prev[type] }))
  }

  const reset = () => {
    setStep("outfit")
    setProcessingStage(0)
  }

  return (
    <div className="pt-2 pb-6 space-y-5">
      {/* Page Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2
            className="text-xl sm:text-2xl font-bold text-white"
            style={{ fontFamily: "Nunito, sans-serif" }}
          >
            Virtual Fitting Room
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Preview generated outfits on a digital mannequin or photo before
            touching a hanger
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSimulatedError(!simulatedError)}
          className="text-[10px] px-2.5 py-1 rounded-xl border transition-colors shrink-0"
          style={{
            borderColor: simulatedError ? "var(--orange)" : "var(--border)",
            color: simulatedError ? "var(--orange)" : "var(--muted-foreground)",
            background: simulatedError ? "rgba(232,75,26,0.1)" : "transparent",
          }}
          title="Toggle Flow 05 AI error recovery simulation"
        >
          {simulatedError ? "⚠️ Error Mode ON" : "AI Error Test"}
        </button>
      </div>

      {/* AI disclosure banner */}
      <div
        className="flex items-start gap-2.5 rounded-2xl px-4 py-3 text-xs leading-relaxed border"
        style={{
          background: "rgba(114,212,240,0.08)",
          borderColor: "rgba(114,212,240,0.25)",
          color: "var(--foreground)",
        }}
      >
        <span className="text-sm shrink-0" style={{ color: "var(--sky)" }}>
          ✦
        </span>
        <div className="text-[11px] leading-snug">
          <span className="font-semibold" style={{ color: "var(--sky)" }}>
            cat-VTON Neural Preview ·{" "}
          </span>
          <span style={{ color: "var(--muted-foreground)" }}>
            AI-rendered previews help you visualize color harmony and silhouette
            without touching a hanger.
          </span>
        </div>
      </div>

      {/* Step 1: Choose Outfit - Responsive Multi-Column on Desktop */}
      {step === "outfit" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              1. Select Outfit to Try On
            </p>
            <span className="text-[10px] text-sky-400 font-semibold">
              {TRYON_OUTFITS.length} options ready
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3.5">
            {TRYON_OUTFITS.map((o) => (
              <div
                key={o.id}
                className="rounded-3xl p-4 sm:p-5 space-y-3 transition-all hover:border-[#72D4F0]/50 border flex flex-col justify-between"
                style={{
                  background: "var(--card)",
                  borderColor: "var(--border)",
                }}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-white leading-tight">
                        {o.label}
                      </h3>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {o.tagline}
                      </p>
                    </div>
                  </div>

                  {/* Color swatches */}
                  <div className="flex items-center gap-2 mt-3">
                    <span className="text-[10px] text-muted-foreground">
                      Palette:
                    </span>
                    <div className="flex gap-1.5">
                      {o.colors.map((c, i) => (
                        <div
                          key={i}
                          className="w-5 h-5 rounded-md shadow-sm"
                          style={{
                            background: c,
                            border: "1px solid rgba(255,255,255,0.2)",
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Garments pill list */}
                  <div className="space-y-1.5 pt-3 mt-3 border-t border-white/5">
                    {o.items.map((item) => (
                      <div
                        key={item.name}
                        className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl"
                        style={{ background: "var(--muted)" }}
                      >
                        <span className="text-sm">{item.emoji}</span>
                        <div className="min-w-0">
                          <p className="text-[9px] uppercase tracking-wider font-semibold text-muted-foreground">
                            {item.type}
                          </p>
                          <p className="text-[11px] font-medium truncate text-white">
                            {item.name}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleSelectOutfit(o)}
                  className="w-full mt-3 py-2.5 rounded-xl text-xs font-bold transition-transform active:scale-95"
                  style={{ background: "var(--magenta)", color: "#fff" }}
                >
                  Try On Look →
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Step 2: Consent & Avatar Source Choice */}
      {step === "consent" && selectedOutfit && (
        <div className="space-y-4 max-w-2xl mx-auto">
          <button
            type="button"
            onClick={reset}
            className="text-xs font-semibold text-sky-400 hover:underline"
          >
            ← Back to outfit choices
          </button>

          <div
            className="rounded-3xl p-5 sm:p-7 space-y-5 border shadow-xl"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0"
                style={{ background: selectedOutfit.colors[0], color: "#fff" }}
              >
                🪞
              </div>
              <div>
                <p className="text-base font-bold text-white">
                  {selectedOutfit.label}
                </p>
                <p className="text-xs text-muted-foreground">
                  Choose how you'd like to preview this look:
                </p>
              </div>
            </div>

            {/* Avatar choice options */}
            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => startGeneration("mannequin")}
                className="w-full text-left p-4 rounded-2xl flex items-center justify-between border transition-all hover:scale-[1.01]"
                style={{
                  background: "rgba(212,0,103,0.08)",
                  borderColor: "rgba(212,0,103,0.3)",
                }}
              >
                <div className="flex items-center gap-3">
                  <span className="text-3xl">🧍</span>
                  <div>
                    <p className="text-xs sm:text-sm font-bold text-white">
                      Digital Mannequin (Recommended)
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Zero photo required · Privacy-first 3D neutral avatar
                      tailored to your sizes
                    </p>
                  </div>
                </div>
                <span
                  className="text-xs font-bold"
                  style={{ color: "var(--magenta)" }}
                >
                  Start →
                </span>
              </button>

              <button
                type="button"
                onClick={() => startGeneration("demo_photo")}
                className="w-full text-left p-4 rounded-2xl flex items-center justify-between border transition-all hover:scale-[1.01]"
                style={{
                  background: "rgba(114,212,240,0.08)",
                  borderColor: "rgba(114,212,240,0.3)",
                }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
                    style={{ background: user.avatarBg }}
                  >
                    {user.initials}
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm font-bold text-white">
                      Use Profile Photo ({user.name.split(" ")[0]})
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Saved safe silhouette · Auto-cleared immediately after
                      session
                    </p>
                  </div>
                </div>
                <span className="text-xs font-bold text-sky-400">Use →</span>
              </button>

              <button
                type="button"
                onClick={() => startGeneration("upload_photo")}
                className="w-full text-left p-4 rounded-2xl flex items-center justify-between border transition-all hover:scale-[1.01]"
                style={{
                  background: "var(--muted)",
                  borderColor: "var(--border)",
                }}
              >
                <div className="flex items-center gap-3">
                  <span className="text-3xl">📸</span>
                  <div>
                    <p className="text-xs sm:text-sm font-bold text-white">
                      Upload New Photo / Selfie
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      One-time photo permission · Never stored or shared with
                      3rd parties
                    </p>
                  </div>
                </div>
                <span className="text-xs font-bold text-muted-foreground">
                  Browse →
                </span>
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/5 text-[10px] text-muted-foreground leading-relaxed">
              🔒 <strong className="text-white">Privacy Guarantee:</strong>{" "}
              Photos uploaded to tAIlor are processed entirely in temporary
              volatile memory to compute garment warp and are discarded
              immediately.
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Processing */}
      {step === "processing" && selectedOutfit && (
        <div
          className="rounded-3xl p-8 text-center space-y-4 max-w-md mx-auto border shadow-xl"
          style={{ background: "var(--card)", borderColor: "var(--border)" }}
        >
          <PulseOrb
            label="cat-VTON Neural Cloth Model Active"
            color="var(--magenta)"
          />

          <div className="space-y-2 max-w-sm mx-auto">
            <p className="text-sm font-bold text-white">
              {STAGES[processingStage]}
            </p>
            <div
              className="h-2 rounded-full overflow-hidden"
              style={{ background: "var(--muted)" }}
            >
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  background:
                    "linear-gradient(90deg, var(--sky) 0%, var(--magenta) 100%)",
                  width: `${((processingStage + 1) / STAGES.length) * 100}%`,
                }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground">
              Fitting {selectedOutfit.items.length} garments onto{" "}
              {avatarType === "mannequin"
                ? "digital mannequin"
                : `${user.name.split(" ")[0]}'s silhouette`}
            </p>
          </div>

          <button
            type="button"
            onClick={reset}
            className="text-xs py-2 px-4 rounded-xl font-medium text-muted-foreground hover:text-white"
            style={{ background: "var(--muted)" }}
          >
            Cancel Generation
          </button>
        </div>
      )}

      {/* Step 4: Preview Result - Responsive Grid on Presentation Screens */}
      {step === "preview" && selectedOutfit && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Side: Interactive Fitting Room Canvas */}
          <div className="lg:col-span-7 space-y-3">
            <div className="flex items-center justify-between">
              <AIStatusPill state="success" label="Neural Preview Ready" />
              <span className="text-[10px] text-muted-foreground">
                cat-VTON Model v2
              </span>
            </div>

            <div
              className="rounded-3xl overflow-hidden relative border shadow-2xl min-h-[420px] h-[420px] sm:h-[480px]"
              style={{
                background: "#0e1118",
                borderColor: "var(--border)",
              }}
            >
              {/* PolyOne-style jointed mannequin + garment tints */}
              <Suspense
                fallback={
                  <div className="flex h-full min-h-[360px] items-center justify-center bg-[#0e1118]">
                    <p className="text-[11px] text-neutral-400">
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

              {/* Bottom Canvas Tag */}
              <div
                className="absolute bottom-3 left-4 right-4 rounded-xl px-3 py-1.5 flex items-center justify-between text-[10px] z-20"
                style={{
                  background: "rgba(13,15,24,0.9)",
                  backdropFilter: "blur(8px)",
                }}
              >
                <span className="text-muted-foreground">
                  cat-VTON Diffusion · Color harmony: 96% match
                </span>
                <span className="font-semibold text-white">
                  Size: {user.typicalSizes.split("·")[0]}
                </span>
              </div>
            </div>
          </div>

          {/* Right Side: Layer Controls, Fit Adjuster & User Actions */}
          <div className="lg:col-span-5 space-y-4">
            {/* Fit Adjuster Card */}
            <div
              className="rounded-3xl p-4 border space-y-2.5"
              style={{
                background: "var(--card)",
                borderColor: "var(--border)",
              }}
            >
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                Adjust Mannequin Fit Silhouette
              </span>
              <div className="grid grid-cols-3 gap-2">
                {(["standard", "fitted", "relaxed"] as const).map((style) => (
                  <button
                    key={style}
                    type="button"
                    onClick={() => setFitStyle(style)}
                    className="py-2 rounded-xl text-xs font-bold capitalize transition-all"
                    style={{
                      background:
                        fitStyle === style ? "var(--sky)" : "var(--muted)",
                      color:
                        fitStyle === style
                          ? "#0D0F18"
                          : "var(--muted-foreground)",
                    }}
                  >
                    {style}
                  </button>
                ))}
              </div>
            </div>

            {/* Interactive Layer Visibility Toggles */}
            <div
              className="rounded-3xl p-4 space-y-2.5 border"
              style={{
                background: "var(--card)",
                borderColor: "var(--border)",
              }}
            >
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                Toggle Garment Layers
              </span>
              <div className="grid grid-cols-2 gap-2">
                {["Top", "Bottom", "Shoes", "Outerwear"].map((layer) => (
                  <button
                    key={layer}
                    type="button"
                    onClick={() => toggleLayer(layer)}
                    className="px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition-all"
                    style={{
                      background: activeLayers[layer]
                        ? "rgba(59,191,108,0.15)"
                        : "var(--muted)",
                      color: activeLayers[layer]
                        ? "var(--green)"
                        : "var(--muted-foreground)",
                      border: `1px solid ${
                        activeLayers[layer]
                          ? "rgba(59,191,108,0.4)"
                          : "var(--border)"
                      }`,
                    }}
                  >
                    <span>{layer}</span>
                    <span>{activeLayers[layer] ? "✓" : "✕"}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Actions Grid */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={handleKeepOutfit}
                className="py-3 rounded-2xl text-xs font-bold transition-transform active:scale-95 shadow-md col-span-2 sm:col-span-1"
                style={{ background: "var(--green)", color: "#fff" }}
              >
                ✓ Keep & Wear Today
              </button>

              <button
                type="button"
                onClick={() => setSwapModalOpen(true)}
                className="py-3 rounded-2xl text-xs font-bold transition-transform active:scale-95 border col-span-2 sm:col-span-1"
                style={{
                  background: "var(--muted)",
                  borderColor: "var(--border)",
                  color: "var(--foreground)",
                }}
              >
                ✏ Change an Item
              </button>

              <button
                type="button"
                onClick={() => startGeneration(avatarType)}
                className="py-2.5 rounded-2xl text-xs font-semibold border"
                style={{
                  background: "var(--muted)",
                  borderColor: "var(--border)",
                  color: "var(--foreground)",
                }}
              >
                ↺ Regenerate Look
              </button>

              <button
                type="button"
                onClick={reset}
                className="py-2.5 rounded-2xl text-xs font-semibold"
                style={{
                  background: "var(--muted)",
                  color: "var(--muted-foreground)",
                }}
              >
                ✕ Delete Preview
              </button>
            </div>
          </div>

          {/* Swap modal */}
          {swapModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
              <div
                className="rounded-3xl p-5 max-w-sm w-full space-y-4 shadow-2xl border"
                style={{
                  background: "var(--card)",
                  borderColor: "var(--border)",
                }}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white">Swap Garment</h3>
                  <button
                    type="button"
                    onClick={() => setSwapModalOpen(false)}
                    className="text-xs text-muted-foreground hover:text-white"
                  >
                    ✕
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Select an alternate piece from your digital wardrobe:
                </p>

                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {[
                    {
                      name: "Mint ribbed mock-neck",
                      cat: "Top",
                      color: "#B4F0C0",
                    },
                    {
                      name: "Cream linen blouse",
                      cat: "Top",
                      color: "#F5EFD8",
                    },
                    {
                      name: "Black wide-leg trousers",
                      cat: "Bottom",
                      color: "#1A1A2E",
                    },
                    {
                      name: "White leather sneakers",
                      cat: "Shoes",
                      color: "#F2F2F2",
                    },
                  ].map((alt) => (
                    <button
                      key={alt.name}
                      type="button"
                      onClick={() => {
                        showToast(
                          "Swapped!",
                          `Updated preview with ${alt.name}`,
                          "info",
                        )
                        setSwapModalOpen(false)
                      }}
                      className="w-full p-2.5 rounded-xl flex items-center gap-3 border text-left hover:border-sky-400 transition-colors"
                      style={{
                        background: "var(--muted)",
                        borderColor: "var(--border)",
                      }}
                    >
                      <div
                        className="w-6 h-6 rounded-md shrink-0 shadow-sm"
                        style={{ background: alt.color }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold truncate text-white">
                          {alt.name}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {alt.cat}
                        </p>
                      </div>
                      <span className="text-xs font-bold text-sky-400">
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

      {/* Step 5: Error and Recovery (Flow 05) */}
      {step === "error" && (
        <div className="space-y-4 max-w-lg mx-auto">
          <AIErrorBanner
            title="cat-VTON Neural Preview Failed"
            message="The virtual try-on model was unable to process the selected clothing mesh due to high server load or invalid lighting."
            actions={[
              {
                label: "Retry with Mannequin",
                primary: true,
                onClick: () => {
                  setSimulatedError(false)
                  startGeneration("mannequin")
                },
              },
              {
                label: "Continue Without Preview",
                onClick: reset,
              },
            ]}
          />
        </div>
      )}
    </div>
  )
}
