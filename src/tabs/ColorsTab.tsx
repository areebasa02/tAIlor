import { useState } from "react"
import { THEME_COLORS } from "../types/theme"

export type UploadState = "empty" | "uploading" | "analyzing" | "success" | "error"

interface IdentifiedColor {
  name: string
  hex: string
  category: string
  compatible: { name: string; hex: string; reason: string }[]
}

const IDENTIFIED: IdentifiedColor = {
  name: "Deep Teal",
  hex: THEME_COLORS.darkTeal,
  category: "Cool · Neutral",
  compatible: [
    {
      name: "Camel",
      hex: "#C8965A",
      reason: "Warm-cool contrast creates visual balance.",
    },
    {
      name: "Off-white",
      hex: "#F5EFD8",
      reason: "Classic neutral pairing — clean and timeless.",
    },
    {
      name: "Coral",
      hex: THEME_COLORS.red,
      reason: "Complementary hue, high-energy combination.",
    },
    {
      name: "Soft gold",
      hex: THEME_COLORS.gold,
      reason: "Analogous warmth amplifies teal's depth.",
    },
  ],
}

const SAMPLE_ITEMS = [
  {
    name: "Teal trench coat",
    color: THEME_COLORS.darkTeal,
    emoji: "🧥",
    description: "Water-resistant outerwear · cool teal",
  },
  {
    name: "Magenta blouse",
    color: THEME_COLORS.pink,
    emoji: "👚",
    description: "Oversized button-down · vivid magenta",
  },
  {
    name: "Camel trousers",
    color: "#C8965A",
    emoji: "👖",
    description: "Wide-leg bottoms · warm camel",
  },
  {
    name: "Navy tee",
    color: "#2B4B8C",
    emoji: "👕",
    description: "Relaxed crew top · deep navy",
  },
  {
    name: "Mint mock-neck",
    color: THEME_COLORS.lightGreen,
    emoji: "🧶",
    description: "Ribbed knit top · soft mint",
  },
]

// Fixed type signature with explicit string[][] annotation
function isCompatible(a: string, b: string) {
  const clashes: string[][] = [[THEME_COLORS.pink, THEME_COLORS.red]]
  return !clashes.some((pair) => pair.includes(a) && pair.includes(b))
}

// ── Embedded Upload Widget ──────────────────────────────────────────────────
function ImageUploadWidget({
  state,
  progress,
  result,
  onRetake,
  onManual,
  onSave,
  onCorrect,
}: {
  state: UploadState
  progress: number
  result?: { name: string; hex: string; category: string }
  onRetake: () => void
  onManual: () => void
  onSave: () => void
  onCorrect: () => void
}) {
  if (state === "empty") {
    return (
      <div
        onClick={onRetake}
        className="rounded-2xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-2 py-8 hover:border-turquoise/50 transition-colors cursor-pointer text-muted-foreground"
      >
        <span className="text-3xl">📷</span>
        <p className="text-xs font-semibold text-white">Tap to simulate photo capture</p>
        <p className="text-[10px]">JPEG, PNG · max 10 MB</p>
      </div>
    )
  }

  if (state === "uploading") {
    return (
      <div className="space-y-2 p-4 rounded-2xl bg-card border border-border">
        <div className="flex justify-between text-[11px] text-muted-foreground font-medium">
          <span>Uploading item photo…</span>
          <span className="text-turquoise">{progress}%</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden bg-muted">
          <div
            className="h-full rounded-full bg-turquoise transition-all duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    )
  }

  if (state === "analyzing") {
    return (
      <div className="space-y-2.5 p-4 rounded-2xl bg-card border border-border">
        <div className="flex items-center gap-2 text-turquoise text-xs font-semibold">
          <span className="w-2 h-2 rounded-full bg-turquoise animate-ping" />
          <span>Analyzing RGB and CIELAB color harmony…</span>
        </div>
        <div className="space-y-1">
          {["Extracting dominant garment hue", "Clustering against palette swatches"].map(
            (msg, i) => (
              <p key={i} className="text-[10px] text-muted-foreground">
                • {msg}
              </p>
            ),
          )}
        </div>
      </div>
    )
  }

  if (state === "success" && result) {
    return (
      <div className="space-y-3 p-4 rounded-2xl bg-card border border-border">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl shadow-md border border-white/20 shrink-0"
            style={{ background: result.hex }}
          />
          <div className="flex-1 min-w-0">
            <h4 className="text-xs font-bold text-white truncate">{result.name}</h4>
            <p className="text-[10px] text-muted-foreground">{result.category} · {result.hex}</p>
          </div>
          <span className="text-green text-xs font-bold">✓ Identified</span>
        </div>
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onSave}
            className="flex-1 py-2 rounded-xl text-xs font-bold bg-green text-white hover:brightness-110 transition-all shadow-sm"
          >
            Confirm & Save
          </button>
          <button
            type="button"
            onClick={onCorrect}
            className="px-3 py-2 rounded-xl text-xs font-semibold bg-muted text-muted-foreground hover:text-white transition-colors"
          >
            Correct Color
          </button>
        </div>
      </div>
    )
  }

  return null
}

// ── Embedded Error Banner ───────────────────────────────────────────────────
function AIErrorBanner({
  title,
  message,
  actions,
}: {
  title: string
  message: string
  actions: { label: string; primary?: boolean; onClick: () => void }[]
}) {
  return (
    <div className="rounded-2xl p-4 bg-red/10 border border-red/30 space-y-2.5">
      <div className="flex items-start gap-2.5">
        <span className="text-red text-base leading-none mt-0.5">⚠</span>
        <div>
          <h4 className="text-xs font-bold text-red">{title}</h4>
          <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{message}</p>
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        {actions.map((act, i) => (
          <button
            key={i}
            type="button"
            onClick={act.onClick}
            className={`flex-1 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              act.primary
                ? "bg-red text-white hover:brightness-110 shadow-sm"
                : "bg-muted text-muted-foreground hover:text-white"
            }`}
          >
            {act.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── ColorsTab Component ─────────────────────────────────────────────────────
export default function ColorsTab() {
  const [mode, setMode] = useState<"identify" | "compare">("identify")

  // Identify mode state
  const [identifyStep, setIdentifyStep] = useState<UploadState | "select" | "result">("select")
  const [selectedItem, setSelectedItem] = useState<typeof SAMPLE_ITEMS[0] | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [corrected, setCorrected] = useState(false)

  // Compare mode state
  const [compareA, setCompareA] = useState<typeof SAMPLE_ITEMS[0] | null>(null)
  const [compareB, setCompareB] = useState<typeof SAMPLE_ITEMS[0] | null>(null)
  const [pickingFor, setPickingFor] = useState<"A" | "B">("A")

  const uploadState: UploadState =
    identifyStep === "select"
      ? "empty"
      : identifyStep === "uploading"
        ? "uploading"
        : identifyStep === "analyzing"
          ? "analyzing"
          : identifyStep === "result"
            ? "success"
            : identifyStep === "error"
              ? "error"
              : "empty"

  const startAnalysis = (item: typeof SAMPLE_ITEMS[0]) => {
    setSelectedItem(item)
    setIdentifyStep("uploading")
    setUploadProgress(0)
    const tick = setInterval(() => {
      setUploadProgress((p) => {
        if (p >= 100) {
          clearInterval(tick)
          setIdentifyStep("analyzing")
          setTimeout(() => setIdentifyStep("result"), 1500)
          return 100
        }
        return Math.min(100, p + 25)
      })
    }, 200)
  }

  return (
    <div className="px-5 pt-2 pb-6 space-y-5">
      <div>
        <h2
          className="text-xl font-semibold text-white"
          style={{ fontFamily: "Nunito, sans-serif" }}
        >
          Color matcher
        </h2>
        <p className="text-xs mt-0.5 text-muted-foreground">
          Identify a color from your wardrobe or compare two pieces for compatibility
        </p>
      </div>

      {/* Mode toggle */}
      <div className="flex rounded-xl p-1 bg-muted">
        {(["identify", "compare"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m)
              setIdentifyStep("select")
              setCompareA(null)
              setCompareB(null)
            }}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold capitalize transition-all ${
              mode === m ? "bg-card text-white shadow-sm" : "text-muted-foreground hover:text-white"
            }`}
          >
            {m === "identify" ? "Identify color" : "Compare two items"}
          </button>
        ))}
      </div>

      {/* ── Identify mode ── */}
      {mode === "identify" && (
        <div className="space-y-4">
          <ImageUploadWidget
            state={uploadState}
            progress={uploadProgress}
            result={
              identifyStep === "result" && selectedItem
                ? {
                    name: IDENTIFIED.name,
                    hex: IDENTIFIED.hex,
                    category: IDENTIFIED.category,
                  }
                : undefined
            }
            onRetake={() => {
              if (identifyStep === "select" || identifyStep === "error") {
                startAnalysis(SAMPLE_ITEMS[0])
              } else {
                setIdentifyStep("select")
                setSelectedItem(null)
              }
            }}
            onManual={() => setIdentifyStep("select")}
            onSave={() => {
              setIdentifyStep("select")
              setSelectedItem(null)
            }}
            onCorrect={() => setCorrected(true)}
          />

          {/* Confidence on success */}
          {identifyStep === "result" && (
            <div className="space-y-3">
              <div className="rounded-xl px-3 py-2 text-[10px] leading-snug bg-green/10 text-green border border-green/25 font-semibold">
                ✓ Color recognized — verify it looks right and correct if needed
              </div>

              {corrected && (
                <div className="space-y-1.5">
                  <p className="text-[10px] text-muted-foreground">Correct the color:</p>
                  <div className="flex flex-wrap gap-2">
                    {["Navy", "Teal", "Green", "Blue-green", "Midnight"].map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setCorrected(false)}
                        className="px-3 py-1.5 rounded-full text-xs bg-muted text-white border border-border hover:border-turquoise/50 transition-colors"
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Compatible colors */}
              <div>
                <p className="text-sm font-semibold mb-2 text-white" style={{ fontFamily: "Nunito, sans-serif" }}>
                  Works well with
                </p>
                <div className="space-y-2">
                  {IDENTIFIED.compatible.map((c) => (
                    <div
                      key={c.name}
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5 bg-card border border-border"
                    >
                      <div
                        className="w-8 h-8 rounded-lg shrink-0 border border-white/10"
                        style={{ background: c.hex }}
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-white">{c.name}</p>
                        <p className="text-[10px] leading-snug text-muted-foreground">{c.reason}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setIdentifyStep("select")
                  setSelectedItem(null)
                  setCorrected(false)
                }}
                className="w-full py-2.5 rounded-xl text-sm font-semibold bg-muted text-white hover:bg-muted/80 transition-colors"
              >
                ← Try another
              </button>
            </div>
          )}

          {/* Wardrobe picker (shown when empty) */}
          {identifyStep === "select" && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Or pick from your wardrobe:</p>
              {SAMPLE_ITEMS.map((item) => (
                <button
                  key={item.name}
                  type="button"
                  onClick={() => startAnalysis(item)}
                  className="w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors bg-card border border-border hover:border-turquoise/40"
                >
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-lg shadow-sm border border-white/10"
                    style={{ background: item.color }}
                  >
                    <span aria-hidden="true">{item.emoji}</span>
                  </div>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-white">{item.name}</span>
                    <span className="block text-[10px] truncate text-muted-foreground">{item.description}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">Analyze →</span>
                </button>
              ))}
            </div>
          )}

          {/* Error state */}
          {identifyStep === "error" && (
            <AIErrorBanner
              title="Color not recognized"
              message="The photo may be too dark or the item isn't a standard garment. Try retaking or enter the color name manually."
              actions={[
                {
                  label: "📷 Retake",
                  primary: true,
                  onClick: () => startAnalysis(SAMPLE_ITEMS[0]),
                },
                {
                  label: "Enter manually",
                  onClick: () => setIdentifyStep("select"),
                },
              ]}
            />
          )}
        </div>
      )}

      {/* ── Compare mode ── */}
      {mode === "compare" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {[
              { slot: "A" as const, item: compareA },
              { slot: "B" as const, item: compareB },
            ].map(({ slot, item }) => (
              <div key={slot}>
                <p
                  className={`text-[10px] uppercase tracking-widest mb-1.5 ${
                    (!compareA || !compareB) && pickingFor === slot
                      ? "text-pink font-bold"
                      : "text-muted-foreground"
                  }`}
                >
                  Item {slot}{" "}
                  {(!compareA || !compareB) && pickingFor === slot ? "← picking" : ""}
                </p>
                {item ? (
                  <div
                    className={`rounded-2xl overflow-hidden cursor-pointer ${
                      (!compareA || !compareB) && pickingFor === slot
                        ? "border-2 border-pink shadow-md shadow-pink/20"
                        : "border border-border"
                    }`}
                    onClick={() => {
                      if (slot === "A") setCompareA(null)
                      else setCompareB(null)
                      setPickingFor(slot)
                    }}
                  >
                    <div className="h-16" style={{ background: item.color }} />
                    <div className="p-2 text-center bg-card">
                      <p className="text-[10px] font-medium truncate text-white">{item.name}</p>
                      <p className="text-[9px] text-muted-foreground">tap to change</p>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setPickingFor(slot)}
                    className={`w-full h-24 rounded-2xl border-2 border-dashed flex items-center justify-center text-xs font-semibold transition-all ${
                      pickingFor === slot
                        ? "border-pink text-pink bg-pink/5"
                        : "border-border text-muted-foreground hover:border-border/80"
                    }`}
                  >
                    Pick item {slot}
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Item picker list */}
          {(!compareA || !compareB) && (
            <div className="space-y-2">
              <p className="text-[10px] text-muted-foreground">Picking for:</p>
              <div className="flex gap-2 mb-1">
                {(["A", "B"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setPickingFor(s)}
                    className={`flex-1 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                      pickingFor === s
                        ? "bg-pink text-white border-pink shadow-md shadow-pink/20"
                        : "bg-muted text-muted-foreground border-transparent hover:text-white"
                    }`}
                  >
                    Item {s}{" "}
                    {s === "A"
                      ? compareA
                        ? `· ${compareA.name}`
                        : "· empty"
                      : compareB
                        ? `· ${compareB.name}`
                        : "· empty"}
                  </button>
                ))}
              </div>
              <p className="sr-only">Picking for item {pickingFor}:</p>
              {SAMPLE_ITEMS.map((item) => {
                const alreadyPicked = item === compareA || item === compareB
                return (
                  <button
                    key={item.name}
                    type="button"
                    disabled={alreadyPicked}
                    onClick={() => {
                      if (pickingFor === "A") {
                        setCompareA(item)
                        if (!compareB) setPickingFor("B")
                      } else {
                        setCompareB(item)
                      }
                    }}
                    className="w-full flex items-center gap-3 rounded-xl px-4 py-2.5 text-left transition-all bg-card border border-border"
                    style={{ opacity: alreadyPicked ? 0.4 : 1 }}
                  >
                    <div
                      className="w-7 h-7 rounded-lg shadow-sm border border-white/10"
                      style={{ background: item.color }}
                    />
                    <span className="text-sm font-medium flex-1 text-white">{item.name}</span>
                    {alreadyPicked && (
                      <span className="text-[10px] text-muted-foreground">selected</span>
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {/* Compatibility result */}
          {compareA && compareB && (
            <div className="space-y-3">
              {(() => {
                const compatible = isCompatible(compareA.color, compareB.color)
                return (
                  <>
                    <div
                      className={`rounded-2xl p-4 text-center border ${
                        compatible ? "bg-green/10 border-green/30" : "bg-red/10 border-red/30"
                      }`}
                    >
                      <p
                        className={`text-base font-semibold ${compatible ? "text-green" : "text-red"}`}
                        style={{ fontFamily: "Nunito, sans-serif" }}
                      >
                        {compatible ? "✓ These work well together" : "⚠ High-energy clash"}
                      </p>
                      <p className="text-xs mt-1.5 text-muted-foreground">
                        {compatible
                          ? "The tones complement each other — use one as the hero and the other as accent."
                          : "Both are warm-dominant saturated hues. Consider adding a neutral to separate them."}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="flex-1 py-2.5 rounded-xl text-xs font-semibold bg-green text-white hover:brightness-110 shadow-md"
                      >
                        Use this combination
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCompareA(null)
                          setCompareB(null)
                          setPickingFor("A")
                        }}
                        className="flex-1 py-2.5 rounded-xl text-xs font-semibold bg-muted text-white hover:bg-muted/80"
                      >
                        Try another
                      </button>
                    </div>
                  </>
                )
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  )
}