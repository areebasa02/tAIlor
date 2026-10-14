import { useState } from "react"
import {
  AnimatedStepProgress,
  UserControlBar,
  type ControlMode,
} from "../components/AIComponents"
import { useApp } from "../context/AppContext"
import type { Outfit, OutfitItem } from "../types"

type Direction = "safe" | "stylish" | "rediscover"

const BASE_OUTFITS: Record<Direction, Outfit> = {
  safe: {
    direction: "safe",
    label: "Safe",
    tagline: "Familiar favorites · zero morning stress",
    rationale:
      "These are your most-worn, high-comfort pieces. They match effortlessly and are calibrated for today's 68°F forecast.",
    accent: "var(--sky)",
    bg: "rgba(114,212,240,0.08)",
    items: [
      {
        type: "Top",
        desc: "Navy relaxed crew tee",
        color: "#2B4B8C",
        emoji: "👕",
        reason: "Reliable, breathable Pima cotton base.",
      },
      {
        type: "Bottom",
        desc: "Slim medium jeans",
        color: "#4A6FA5",
        emoji: "👖",
        reason: "Easy stretch structure for all-day wear.",
      },
      {
        type: "Shoes",
        desc: "White leather sneakers",
        color: "#F2F2F2",
        emoji: "👟",
        reason: "Maximum cushioning for time on your feet.",
      },
    ],
    whyDetails: {
      weatherReason:
        "Optimal for 68°F mild weather; breathable layers prevent overheating.",
      colorHarmony:
        "Tonal Navy & Medium Indigo blue create a calming monochromatic foundation.",
      wearFrequency: "Your signature comfort staple — high confidence rating.",
      sensoryComfort: "Tagless crew neck, zero friction on neck and waist.",
    },
  },
  stylish: {
    direction: "stylish",
    label: "Stylish",
    tagline: "Bold contrast · intentional statement",
    rationale:
      "Vivid magenta and warm camel form a sophisticated complementary pairing. You haven't worn this blouse in over a week — prime time to shine.",
    accent: "var(--magenta)",
    bg: "rgba(212,0,103,0.08)",
    items: [
      {
        type: "Top",
        desc: "Magenta button-down",
        color: "#D40067",
        emoji: "👚",
        reason: "Adds an authoritative, confident focal color.",
      },
      {
        type: "Bottom",
        desc: "Camel wide trousers",
        color: "#C8965A",
        emoji: "👖",
        reason: "Balances the vibrant hue with grounded earthiness.",
      },
      {
        type: "Shoes",
        desc: "Tan leather loafers",
        color: "#B8825A",
        emoji: "👞",
        reason: "Brings refined structure without being rigid.",
      },
    ],
    whyDetails: {
      weatherReason:
        "Drapey rayon blouse with lined trousers keeps you cozy in air conditioning and mild outdoor breeze.",
      colorHarmony:
        "Complementary color triad: Magenta (cold red) harmonizes with Camel (warm neutral).",
      wearFrequency:
        "Blouse worn 12 times; trousers worn 18 times. Well-balanced rotation.",
      sensoryComfort: "Loose wide-leg cut eliminates constriction when seated.",
    },
  },
  rediscover: {
    direction: "rediscover",
    label: "Rediscover",
    tagline: "Something you haven't worn lately",
    rationale:
      "Your mint mock-neck knit hasn't been logged in 21 days! Paired with midnight black wide trousers, the pastel hue pops effortlessly.",
    accent: "var(--green)",
    bg: "rgba(59,191,108,0.08)",
    items: [
      {
        type: "Top",
        desc: "Mint ribbed mock-neck",
        color: "#B4F0C0",
        emoji: "🧶",
        reason: "Brings an unworn gem back into rotation.",
      },
      {
        type: "Bottom",
        desc: "Black wide-leg trousers",
        color: "#1A1A2E",
        emoji: "👖",
        reason: "Keeps the light mint knit visually anchored.",
      },
      {
        type: "Shoes",
        desc: "Chunky platform sneakers",
        color: "#E8E8E8",
        emoji: "👟",
        reason: "Mirrors the crisp, fresh lightness of the top.",
      },
    ],
    whyDetails: {
      weatherReason:
        "Ribbed knit keeps core temperature steady during morning chill.",
      colorHarmony:
        "Pastel Mint against deep Black achieves high visual accessibility and clarity.",
      wearFrequency:
        "Mint mock-neck worn only 4 times this season. AI recommends rediscovery.",
      sensoryComfort: "100% organic cotton knit; non-scratchy ribbed texture.",
    },
  },
}

const GENERATION_STEPS = [
  "Reading digital wardrobe & local forecast…",
  "Analyzing wear history & color theory rules…",
  "Synthesizing accessible outfit options…",
  "Finalizing personalized stylist notes…",
]

export default function HomeTab() {
  const {
    user,
    recentLooks,
    logOutfitWorn,
    sendOutfitToLaundry,
    showToast,
    wardrobe,
  } = useApp()
  const [selectedDirection, setSelectedDirection] =
    useState<Direction>("stylish")
  const [activeOutfits, setActiveOutfits] = useState(BASE_OUTFITS)
  const [previousOutfits, setPreviousOutfits] = useState<Outfit[]>([])
  const [loading, setLoading] = useState(false)
  const [ctrlMode, setCtrlMode] = useState<ControlMode>("default")
  const [wornToday, setWornToday] = useState(false)
  const [whyModalOpen, setWhyModalOpen] = useState(false)
  const [rejectModalOpen, setRejectModalOpen] = useState(false)
  const [swapModalOpen, setSwapModalOpen] = useState(false)
  const [swapTargetIndex, setSwapTargetIndex] = useState<number | null>(null)
  const [weatherCity] = useState("Hammond, LA")
  const [weatherTemp, setWeatherTemp] = useState("68°F")
  const [weatherDesc, setWeatherDesc] = useState("Partly Cloudy · Mild breeze")

  const currentOutfit = activeOutfits[selectedDirection]

  const handleRegenerate = (reasonConstraint?: string) => {
    setPreviousOutfits((prev) => [currentOutfit, ...prev])
    setCtrlMode("regenerating")
    setLoading(true)
    setWornToday(false)

    setTimeout(() => {
      setActiveOutfits((prev) => {
        const target = prev[selectedDirection]
        const alternateTops: OutfitItem[] = [
          {
            type: "Top",
            desc: "Cream linen blouse",
            color: "#F5EFD8",
            emoji: "👚",
            reason: "Crisp light layer with gentle drape.",
          },
          {
            type: "Top",
            desc: "Teal trench coat",
            color: "#007A8A",
            emoji: "🧥",
            reason: "Polished statement top layer.",
          },
          {
            type: "Top",
            desc: "Navy relaxed crew tee",
            color: "#2B4B8C",
            emoji: "👕",
            reason: "Minimalist neutral base.",
          },
        ]
        const randomTop =
          alternateTops[Math.floor(Math.random() * alternateTops.length)]
        const newItems = [randomTop, target.items[1], target.items[2]]
        return {
          ...prev,
          [selectedDirection]: {
            ...target,
            rationale: reasonConstraint
              ? `Adjusted for "${reasonConstraint}". Updated palette with ${randomTop.desc}.`
              : target.rationale,
            items: newItems,
          },
        }
      })
      setLoading(false)
      setCtrlMode("default")
      showToast(
        "Outfit Regenerated",
        reasonConstraint
          ? `Re-styled for: ${reasonConstraint}`
          : "New variation generated.",
        "info",
      )
    }, 1500)
  }

  const handleApprove = () => {
    logOutfitWorn({
      label: currentOutfit.label,
      items: currentOutfit.items.map((i) => i.desc),
      color: currentOutfit.items[0]?.color || "#D40067",
      direction: currentOutfit.label,
    })
    setWornToday(true)
    setCtrlMode("default")
  }

  const handleUndo = () => {
    if (previousOutfits.length > 0) {
      const [reverted, ...rest] = previousOutfits
      setActiveOutfits((prev) => ({
        ...prev,
        [reverted.direction]: reverted,
      }))
      setPreviousOutfits(rest)
      setCtrlMode("undone")
      showToast(
        "Suggestion Restored",
        "Reverted back to your previous outfit option.",
        "info",
      )
    } else {
      setCtrlMode("undone")
    }
  }

  const handleSwapItem = (replacementItem: typeof wardrobe[0]) => {
    if (swapTargetIndex === null) return
    setActiveOutfits((prev) => {
      const target = prev[selectedDirection]
      const updatedItems = [...target.items]
      updatedItems[swapTargetIndex] = {
        type: replacementItem.category.slice(0, -1) || "Piece",
        desc: replacementItem.name,
        color: replacementItem.color,
        emoji:
          replacementItem.category === "Tops"
            ? "👚"
            : replacementItem.category === "Bottoms"
              ? "👖"
              : "👟",
        reason: `Manually swapped for ${replacementItem.colorName}.`,
      }
      return {
        ...prev,
        [selectedDirection]: {
          ...target,
          items: updatedItems,
        },
      }
    })
    setSwapModalOpen(false)
    setSwapTargetIndex(null)
    showToast(
      "Piece Swapped",
      `Replaced with ${replacementItem.name}.`,
      "success",
    )
  }

  const refreshWeather = () => {
    const temps = ["68°F", "72°F", "65°F", "70°F"]
    const descs = [
      "Partly Cloudy · Mild breeze",
      "Sunny & Clear · 72°F",
      "Light Scattered Showers · Bring umbrella",
    ]
    const nextTemp = temps[Math.floor(Math.random() * temps.length)]
    const nextDesc = descs[Math.floor(Math.random() * descs.length)]
    setWeatherTemp(nextTemp)
    setWeatherDesc(nextDesc)
    showToast(
      "Weather Refreshed",
      `Updated forecast for ${weatherCity}: ${nextTemp}`,
      "info",
    )
  }

  return (
    <div className="pt-2 pb-6 space-y-6">
      {/* Responsive Grid: Stacks on Mobile, 2-Column on Presentation / Large Screens */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column on Desktop: Today's Outfit Card & Controls */}
        <div className="lg:col-span-7 space-y-4">
          {/* Section Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2
                className="text-xl sm:text-2xl font-bold text-white"
                style={{ fontFamily: "Nunito, sans-serif" }}
              >
                Today's Outfit
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {user.accessibility.lowDecisionMode
                  ? "Low Decision Mode active · AI selected single best look"
                  : "Choose a direction — your AI stylist handles color theory & comfort"}
              </p>
            </div>

            {wornToday && (
              <span
                className="text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider"
                style={{
                  background: "rgba(59,191,108,0.15)",
                  color: "var(--green)",
                  border: "1px solid var(--green)",
                }}
              >
                ✓ Worn Today
              </span>
            )}
          </div>

          {/* Direction Pills */}
          {!user.accessibility.lowDecisionMode && (
            <div className="grid grid-cols-3 gap-2">
              {(["safe", "stylish", "rediscover"] as Direction[]).map((dir) => {
                const o = activeOutfits[dir]
                const active = selectedDirection === dir
                return (
                  <button
                    key={dir}
                    type="button"
                    onClick={() => {
                      setSelectedDirection(dir)
                      setCtrlMode("default")
                      setWornToday(false)
                    }}
                    className="py-2.5 px-2 rounded-2xl text-xs font-bold tracking-wide uppercase transition-all duration-200"
                    style={{
                      background: active ? o.accent : "var(--muted)",
                      color: active
                        ? dir === "safe"
                          ? "#0D0F18"
                          : "#fff"
                        : "var(--muted-foreground)",
                      border: active
                        ? `1px solid ${o.accent}`
                        : "1px solid transparent",
                      boxShadow: active ? `0 4px 12px ${o.accent}35` : "none",
                    }}
                  >
                    {o.label}
                  </button>
                )
              })}
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div
              className="rounded-3xl p-6 space-y-3 border"
              style={{
                background: "var(--card)",
                borderColor: "var(--border)",
              }}
            >
              <p className="text-xs font-bold text-white">
                Stylist Engine Generating Look…
              </p>
              <AnimatedStepProgress
                steps={GENERATION_STEPS}
                intervalMs={700}
                onComplete={() => setLoading(false)}
              />
            </div>
          )}

          {/* Main Outfit Card */}
          {!loading && (
            <div
              className="rounded-3xl p-5 sm:p-6 space-y-4 shadow-xl border transition-all"
              style={{
                background: currentOutfit.bg,
                borderColor: `${currentOutfit.accent}40`,
              }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <span
                    className="text-xs font-extrabold uppercase tracking-widest"
                    style={{ color: currentOutfit.accent }}
                  >
                    {currentOutfit.label} Direction
                  </span>
                  <p className="text-sm sm:text-base font-semibold text-white mt-0.5">
                    {currentOutfit.tagline}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setWhyModalOpen(true)}
                  className="text-[11px] font-bold px-3 py-1.5 rounded-full flex items-center gap-1 transition-transform active:scale-95"
                  style={{
                    background: "rgba(255,255,255,0.08)",
                    color: "var(--foreground)",
                    border: "1px solid rgba(255,255,255,0.15)",
                  }}
                >
                  <span>💡</span>
                  <span>Why this?</span>
                </button>
              </div>

              {/* Garments List */}
              <div className="space-y-2.5">
                {currentOutfit.items.map((item, idx) => (
                  <div
                    key={`${item.type}-${idx}`}
                    className="flex items-center justify-between gap-3 p-3 rounded-2xl transition-all"
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border:
                        ctrlMode === "editing"
                          ? "1px solid rgba(114,212,240,0.5)"
                          : "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-11 h-11 rounded-2xl flex items-center justify-center text-xl shrink-0 shadow-md"
                        style={{
                          background: item.color,
                          border: "1.5px solid rgba(255,255,255,0.2)",
                        }}
                      >
                        <span>{item.emoji}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                          {item.type}
                        </p>
                        <p className="text-xs sm:text-sm font-semibold text-white truncate">
                          {item.desc}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {item.reason}
                        </p>
                      </div>
                    </div>

                    {ctrlMode === "editing" ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSwapTargetIndex(idx)
                          setSwapModalOpen(true)
                        }}
                        className="px-2.5 py-1 rounded-xl text-[10px] font-bold shrink-0 transition-transform active:scale-95"
                        style={{ background: "var(--sky)", color: "#0D0F18" }}
                      >
                        Swap ↺
                      </button>
                    ) : (
                      <span
                        className="w-3.5 h-3.5 rounded-full shrink-0 shadow-inner"
                        style={{
                          background: item.color,
                          border: "1px solid rgba(255,255,255,0.3)",
                        }}
                        title={item.color}
                      />
                    )}
                  </div>
                ))}
              </div>

              {/* Rationale */}
              <div
                className="rounded-2xl p-3 text-xs leading-relaxed"
                style={{
                  background: "rgba(0,0,0,0.35)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  color: "var(--foreground)",
                }}
              >
                <span
                  className="font-semibold"
                  style={{ color: currentOutfit.accent }}
                >
                  Stylist Rationale:
                </span>{" "}
                <span style={{ color: "var(--muted-foreground)" }}>
                  {currentOutfit.rationale}
                </span>
              </div>

              {/* Control Bar */}
              <UserControlBar
                mode={ctrlMode}
                approveLabel={
                  wornToday ? "✓ Approved & Worn Today" : "Approve & Wear Today"
                }
                onApprove={handleApprove}
                onEdit={() =>
                  setCtrlMode(ctrlMode === "editing" ? "default" : "editing")
                }
                onReject={() => setRejectModalOpen(true)}
                onRegenerate={() => handleRegenerate()}
                onUndo={handleUndo}
                onWhy={() => setWhyModalOpen(true)}
                showWhy={true}
              />

              {/* Post-Approve Laundry Prompt */}
              {wornToday && (
                <div
                  className="rounded-2xl p-3 flex items-center justify-between gap-2 animate-in fade-in duration-200"
                  style={{
                    background: "rgba(59,191,108,0.1)",
                    border: "1px solid rgba(59,191,108,0.3)",
                  }}
                >
                  <div className="text-xs">
                    <p className="font-bold text-white">
                      Outfit ready for the day!
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Done with yesterday's clothes?
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      sendOutfitToLaundry(["Navy tee", "Slim jeans"])
                      showToast(
                        "Laundry Updated",
                        "Yesterday's clothes moved to hamper.",
                        "info",
                      )
                    }}
                    className="px-3 py-1.5 rounded-xl text-[10px] font-bold text-white shrink-0"
                    style={{ background: "var(--secondary)" }}
                  >
                    🧺 Send Yesterday's to Hamper
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column on Desktop / Bottom on Mobile: Climate & Recent Looks History */}
        <div className="lg:col-span-5 space-y-4">
          {/* Date & Weather Card */}
          <div
            className="rounded-3xl p-4 sm:p-5 space-y-3 shadow-md border"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  {new Date().toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                  })}
                </p>
                <h1
                  className="text-lg sm:text-xl font-bold mt-0.5 truncate text-white"
                  style={{ fontFamily: "Nunito, sans-serif" }}
                >
                  Good morning, {user.name.split(" ")[0]}
                </h1>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {user.roleTitle}
                </p>
              </div>

              <button
                type="button"
                onClick={refreshWeather}
                className="flex items-center gap-2 p-2 rounded-2xl border transition-transform active:scale-95 shrink-0"
                style={{
                  background: "var(--muted)",
                  borderColor: "var(--border)",
                }}
                title="Click to refresh local forecast"
              >
                <span className="text-2xl leading-none">⛅</span>
                <div className="text-right">
                  <p className="text-xs font-bold text-white">{weatherTemp}</p>
                  <p className="text-[9px] text-muted-foreground">
                    {weatherCity.split(",")[0]}
                  </p>
                </div>
              </button>
            </div>

            {/* AI Climate Advice */}
            <div
              className="rounded-2xl px-3.5 py-2.5 flex items-center justify-between text-xs"
              style={{
                background: "rgba(114,212,240,0.08)",
                border: "1px solid rgba(114,212,240,0.2)",
              }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="text-sm shrink-0"
                  style={{ color: "var(--sky)" }}
                >
                  ✦
                </span>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  {weatherDesc}. Soft layers will keep you comfortable across
                  transitions.
                </p>
              </div>
              <button
                type="button"
                onClick={refreshWeather}
                className="text-[10px] font-bold text-sky-400 hover:underline shrink-0 ml-2"
              >
                ↻
              </button>
            </div>
          </div>

          {/* Recent Looks Wear History */}
          <div
            className="rounded-3xl p-4 sm:p-5 space-y-3 shadow-md border"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <div className="flex items-center justify-between">
              <div>
                <h3
                  className="text-sm font-bold text-white"
                  style={{ fontFamily: "Nunito, sans-serif" }}
                >
                  Recent Looks History
                </h3>
                <p className="text-[10px] text-muted-foreground">
                  Tracks rotation to prevent accidental repeats
                </p>
              </div>
              <span className="text-[10px] font-bold text-sky-400">
                {recentLooks.length} logged
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5 max-h-80 overflow-y-auto pr-1">
              {recentLooks.slice(0, 6).map((r) => (
                <div
                  key={r.id}
                  className="rounded-2xl overflow-hidden flex flex-col border shadow-sm transition-all hover:scale-[1.02]"
                  style={{
                    background: "var(--muted)",
                    borderColor: "var(--border)",
                  }}
                >
                  <div
                    className="h-12 w-full relative p-2 flex items-start justify-between"
                    style={{ background: r.color }}
                  >
                    <span className="text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded-md bg-black/60 text-white backdrop-blur-xs">
                      {r.date}
                    </span>
                    <span className="text-xs">👔</span>
                  </div>
                  <div className="p-2 flex-1 flex flex-col justify-between">
                    <div>
                      <p className="text-[10px] font-bold text-white leading-tight">
                        {r.day}
                      </p>
                      <ul className="mt-1 space-y-0.5">
                        {r.items.slice(0, 2).map((item) => (
                          <li
                            key={item}
                            className="text-[8px] text-muted-foreground truncate"
                          >
                            · {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Deep-Dive "Why this outfit?" Modal */}
      {whyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div
            className="rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl border"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">💡</span>
                <h3 className="text-base font-bold text-white">
                  Stylist Explainability
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setWhyModalOpen(false)}
                className="text-xs text-muted-foreground hover:text-white p-1"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-muted-foreground">
              Here is how tAIlor chose the{" "}
              <strong className="text-white">{currentOutfit.label}</strong>{" "}
              outfit based on your profile, weather, and color science:
            </p>

            <div className="space-y-2.5">
              <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/5 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400">
                  ⛅ Weather Alignment ({weatherTemp})
                </span>
                <p className="text-xs text-foreground">
                  {currentOutfit.whyDetails?.weatherReason ||
                    "Matched to current temperature and humidity."}
                </p>
              </div>

              <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/5 space-y-1">
                <span
                  className="text-[10px] font-bold uppercase tracking-wider"
                  style={{ color: "var(--magenta)" }}
                >
                  🎨 Color Theory Harmony
                </span>
                <p className="text-xs text-foreground">
                  {currentOutfit.whyDetails?.colorHarmony ||
                    "High contrast complementary triad."}
                </p>
              </div>

              <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/5 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-green-400">
                  🔄 Wardrobe Rotation
                </span>
                <p className="text-xs text-foreground">
                  {currentOutfit.whyDetails?.wearFrequency ||
                    "Keeps your closet rotation healthy."}
                </p>
              </div>

              <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/5 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-yellow-400">
                  🧵 Sensory & Accessibility Notes
                </span>
                <p className="text-xs text-foreground">
                  {currentOutfit.whyDetails?.sensoryComfort ||
                    "Breathable fabrics with soft non-irritating seams."}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setWhyModalOpen(false)}
              className="w-full py-2.5 rounded-xl text-xs font-bold text-white transition-colors"
              style={{ background: "var(--magenta)" }}
            >
              Understood
            </button>
          </div>
        </div>
      )}

      {/* Reject Reason Modal */}
      {rejectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div
            className="rounded-3xl p-5 max-w-sm w-full space-y-4 shadow-2xl border"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">
                Why reject this outfit?
              </h3>
              <button
                type="button"
                onClick={() => setRejectModalOpen(false)}
                className="text-xs text-muted-foreground hover:text-white"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-muted-foreground">
              Select an optional reason so your AI stylist learns your
              preferences:
            </p>

            <div className="grid grid-cols-2 gap-2">
              {[
                "Too formal",
                "Too casual",
                "Wrong temperature",
                "Colors clash",
                "Worn too recently",
                "Sensory / Fabric issue",
              ].map((reason) => (
                <button
                  key={reason}
                  type="button"
                  onClick={() => {
                    setRejectModalOpen(false)
                    handleRegenerate(reason)
                  }}
                  className="p-2.5 rounded-xl text-xs font-medium text-left border hover:border-magenta hover:bg-white/5 transition-all text-white"
                  style={{
                    background: "var(--muted)",
                    borderColor: "var(--border)",
                  }}
                >
                  {reason}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => {
                setRejectModalOpen(false)
                handleRegenerate()
              }}
              className="w-full py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:text-white"
            >
              Skip reason and regenerate
            </button>
          </div>
        </div>
      )}

      {/* Garment Swap Modal */}
      {swapModalOpen && swapTargetIndex !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div
            className="rounded-3xl p-5 max-w-sm w-full space-y-4 shadow-2xl border"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">
                Swap {currentOutfit.items[swapTargetIndex]?.type}
              </h3>
              <button
                type="button"
                onClick={() => setSwapModalOpen(false)}
                className="text-xs text-muted-foreground hover:text-white"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-muted-foreground">
              Choose an alternate piece from your clean digital wardrobe:
            </p>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {wardrobe
                .filter((item) => {
                  const targetType =
                    currentOutfit.items[swapTargetIndex]?.type.toLowerCase()
                  if (targetType.includes("top"))
                    return item.category === "Tops"
                  if (targetType.includes("bottom"))
                    return item.category === "Bottoms"
                  if (targetType.includes("shoe"))
                    return item.category === "Shoes"
                  return true
                })
                .map((wItem) => (
                  <button
                    key={wItem.id}
                    type="button"
                    onClick={() => handleSwapItem(wItem)}
                    className="w-full p-2.5 rounded-xl flex items-center gap-3 border text-left hover:border-sky transition-all"
                    style={{
                      background: "var(--muted)",
                      borderColor: "var(--border)",
                    }}
                  >
                    <div
                      className="w-7 h-7 rounded-lg shrink-0 shadow-sm"
                      style={{ background: wItem.color }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-white truncate">
                        {wItem.name}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {wItem.colorName}
                      </p>
                    </div>
                    <span className="text-xs font-bold text-sky-400">
                      Select
                    </span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
