import { useState } from "react"
import {
  ImageUploadWidget,
  AIErrorBanner,
  type UploadState,
} from "../components/AIComponents"
import { useApp } from "../context/AppContext"
import { getSampleGarmentImage } from "../data/personaData"
import { THEME_COLORS } from "../types/theme"

export type { UploadState }

interface ColorPickerItem {
  id?: number
  name: string
  color: string
  colorName?: string
  category?: string
  emoji: string
  imageData?: string
  description: string
}

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

const SAMPLE_ITEMS: ColorPickerItem[] = [
  {
    name: "Teal trench coat",
    color: THEME_COLORS.darkTeal,
    category: "Outerwear",
    colorName: "Deep Teal",
    emoji: "🧥",
    imageData: "/wardrobe/teal-trench-coat.png",
    description: "Water-resistant outerwear · cool teal",
  },
  {
    name: "Magenta blouse",
    color: THEME_COLORS.pink,
    category: "Tops",
    colorName: "Vivid Magenta",
    emoji: "👚",
    imageData: "/wardrobe/magenta-button-down.png",
    description: "Oversized button-down · vivid magenta",
  },
  {
    name: "Camel trousers",
    color: "#C8965A",
    category: "Bottoms",
    colorName: "Warm Camel",
    emoji: "👖",
    imageData: "/wardrobe/camel-wide-trousers.png",
    description: "Wide-leg bottoms · warm camel",
  },
  {
    name: "Navy tee",
    color: "#2B4B8C",
    category: "Tops",
    colorName: "Deep Navy",
    emoji: "👕",
    imageData: "/wardrobe/navy-crew-tee.png",
    description: "Relaxed crew top · deep navy",
  },
  {
    name: "Mint mock-neck",
    color: THEME_COLORS.lightGreen,
    category: "Tops",
    colorName: "Soft Mint",
    emoji: "🧶",
    imageData: "/wardrobe/mint-ribbed-mock-neck.png",
    description: "Ribbed knit top · soft mint",
  },
]

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const clean = hex.replace("#", "").padEnd(6, "0").slice(0, 6)
  const r = Number.parseInt(clean.slice(0, 2), 16) / 255 || 0
  const g = Number.parseInt(clean.slice(2, 4), 16) / 255 || 0
  const b = Number.parseInt(clean.slice(4, 6), 16) / 255 || 0
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
    else if (max === g) h = ((b - r) / d + 2) / 6
    else h = ((r - g) / d + 4) / 6
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) }
}

function evaluateColorCompatibility(
  a: ColorPickerItem,
  b: ColorPickerItem
): {
  compatible: boolean
  score: number
  headline: string
  explanation: string
} {
  const hslA = hexToHsl(a.color)
  const hslB = hexToHsl(b.color)
  const aNeutral = hslA.s < 22 || hslA.l < 16 || hslA.l > 88
  const bNeutral = hslB.s < 22 || hslB.l < 16 || hslB.l > 88
  const lDiff = Math.abs(hslA.l - hslB.l)
  const hueDiff = Math.min(
    Math.abs(hslA.h - hslB.h),
    360 - Math.abs(hslA.h - hslB.h)
  )

  if (aNeutral || bNeutral) {
    const score = lDiff >= 25 ? 95 : 89
    return {
      compatible: true,
      score,
      headline: "Clean Neutral Pairing",
      explanation: `${a.colorName || a.name} pairs cleanly with ${b.colorName || b.name} because neutral bases anchor accent tones without visual clash.`,
    }
  }

  if (hueDiff >= 135 && hueDiff <= 200) {
    return {
      compatible: true,
      score: 92,
      headline: "Balanced Complementary Contrast",
      explanation: `${a.colorName || a.name} and ${b.colorName || b.name} sit on opposite sides of the color wheel, giving intentional contrast.`,
    }
  }

  if (hueDiff <= 45 && lDiff >= 18) {
    return {
      compatible: true,
      score: 88,
      headline: "Harmonious Tonal Gradient",
      explanation: `Shared hue family with clear lightness separation creates an effortless monochromatic look.`,
    }
  }

  if (lDiff < 12 && hueDiff > 55 && hueDiff < 120) {
    return {
      compatible: false,
      score: 54,
      headline: "Competing Mid-Tones",
      explanation: `Both pieces sit at similar brightness (${hslA.l}% vs ${hslB.l}%) in competing hues. Adding a neutral cream, black, or denim anchor helps separate them.`,
    }
  }

  return {
    compatible: true,
    score: 84,
    headline: "Wearable Everyday Match",
    explanation: `${a.colorName || a.name} and ${b.colorName || b.name} offer distinct value contrast that reads cleanly indoors and outdoors.`,
  }
}

export default function ColorsTab() {
  const { wardrobe, addCustomStyle, showToast } = useApp()
  const [mode, setMode] = useState<"identify" | "compare">("identify")

  // Identify mode state
  const [identifyStep, setIdentifyStep] = useState<
    UploadState | "select" | "result"
  >("select")
  const [selectedItem, setSelectedItem] = useState<ColorPickerItem | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [corrected, setCorrected] = useState(false)

  // Compare mode state
  const [compareA, setCompareA] = useState<ColorPickerItem | null>(null)
  const [compareB, setCompareB] = useState<ColorPickerItem | null>(null)
  const [pickingFor, setPickingFor] = useState<"A" | "B">("A")

  const pickerItems: ColorPickerItem[] =
    wardrobe.length > 0
      ? wardrobe.slice(0, 10).map((w) => ({
          id: w.id,
          name: w.name,
          color: w.color,
          colorName: w.colorName,
          category: w.category,
          imageData: w.imageData || getSampleGarmentImage(w.name, w.category),
          emoji:
            w.category === "Outerwear"
              ? "🧥"
              : w.category === "Bottoms"
                ? "👖"
                : w.category === "Shoes"
                  ? "👟"
                  : w.category === "Accessories"
                    ? "💍"
                    : "👕",
          description: `${w.colorName} · ${w.material || w.category}`,
        }))
      : SAMPLE_ITEMS

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

  const startAnalysis = (item: ColorPickerItem) => {
    setSelectedItem(item)
    setIdentifyStep("uploading")
    setUploadProgress(0)
    const tick = setInterval(() => {
      setUploadProgress((p) => {
        if (p >= 100) {
          clearInterval(tick)
          setIdentifyStep("analyzing")
          setTimeout(() => setIdentifyStep("result"), 1200)
          return 100
        }
        return Math.min(100, p + 25)
      })
    }, 180)
  }

  return (
    <div className="pt-1 pb-4 space-y-3">
      <div>
        <h1
          className="text-xl font-black text-foreground"
          style={{ fontFamily: "Nunito, sans-serif" }}
        >
          Color Matcher
        </h1>
        <p className="text-xs font-semibold mt-0.5 text-muted-foreground">
          Check one color or compare two pieces together.
        </p>
      </div>

      {/* Mode toggle */}
      <div
        role="tablist"
        aria-label="Color matcher mode"
        className="flex rounded-xl p-1 bg-muted border-2 border-border"
      >
        {(["identify", "compare"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => {
              setMode(m)
              setIdentifyStep("select")
              setCompareA(null)
              setCompareB(null)
            }}
            className={`flex-1 min-h-[40px] py-2 rounded-lg text-xs font-extrabold capitalize transition-all cursor-pointer ${
              mode === m
                ? "bg-card text-foreground border-2 border-border shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {m === "identify" ? "Identify" : "Compare"}
          </button>
        ))}
      </div>

      {/* Identify mode */}
      {mode === "identify" && (
        <div className="space-y-4">
          <ImageUploadWidget
            state={uploadState}
            progress={uploadProgress}
            emptyLabel="Tap to test color analysis"
            analyzingLabel="Analyzing hue & harmony rules…"
            result={
              identifyStep === "result" && selectedItem
                ? {
                    name: selectedItem.colorName || IDENTIFIED.name,
                    hex: selectedItem.color,
                    category: selectedItem.category || IDENTIFIED.category,
                  }
                : undefined
            }
            onRetake={() => {
              if (identifyStep === "select" || identifyStep === "error") {
                startAnalysis(pickerItems[0])
              } else {
                setIdentifyStep("select")
                setSelectedItem(null)
              }
            }}
            onManual={() => setIdentifyStep("select")}
            onSave={() => {
              if (selectedItem) {
                showToast(
                  "Color Profile Confirmed",
                  `Saved ${selectedItem.colorName || selectedItem.color} harmony for ${selectedItem.name}.`,
                  "success"
                )
              }
              setIdentifyStep("select")
              setSelectedItem(null)
            }}
            onCorrect={() => setCorrected(true)}
          />

          {/* Confidence on success */}
          {identifyStep === "result" && (
            <div className="space-y-3">
              <div className="rounded-xl px-3 py-2 text-[11px] leading-snug bg-green/10 text-green border border-green/25 font-semibold">
                ✓ Color recognized — verify it looks right and correct if needed
              </div>

              {corrected && (
                <div className="space-y-1.5">
                  <p className="text-[11px] text-muted-foreground">
                    Correct the color:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {["Navy", "Teal", "Green", "Blue-green", "Midnight"].map(
                      (c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => {
                            if (selectedItem) {
                              setSelectedItem({ ...selectedItem, colorName: c })
                            }
                            setCorrected(false)
                          }}
                          className="px-3 py-1.5 rounded-full text-xs bg-muted text-foreground border border-border hover:border-turquoise/50 transition-colors cursor-pointer"
                        >
                          {c}
                        </button>
                      )
                    )}
                  </div>
                </div>
              )}

              {/* Compatible colors */}
              <div>
                <p
                  className="text-sm font-semibold mb-2 text-foreground"
                  style={{ fontFamily: "Nunito, sans-serif" }}
                >
                  Works well with in your closet
                </p>
                <div className="space-y-2">
                  {(selectedItem
                    ? pickerItems
                        .filter(
                          (candidate) => candidate.name !== selectedItem.name
                        )
                        .map((candidate) => ({
                          name: candidate.name,
                          hex: candidate.color,
                          evalResult: evaluateColorCompatibility(
                            selectedItem,
                            candidate
                          ),
                        }))
                        .filter((pair) => pair.evalResult.compatible)
                        .slice(0, 4)
                    : IDENTIFIED.compatible.map((c) => ({
                        name: c.name,
                        hex: c.hex,
                        evalResult: {
                          headline: c.name,
                          explanation: c.reason,
                          score: 92,
                        },
                      }))
                  ).map((c) => (
                    <div
                      key={c.name}
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5 bg-card border border-border"
                    >
                      <div
                        role="img"
                        aria-label={`${c.name} color swatch`}
                        className="w-8 h-8 rounded-lg shrink-0 border border-border"
                        style={{ background: c.hex }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-foreground">
                          {c.name}
                        </p>
                        <p className="text-[11px] leading-snug text-muted-foreground">
                          {c.evalResult.explanation}
                        </p>
                      </div>
                      <span className="text-[11px] font-bold text-green shrink-0">
                        {c.evalResult.score}%
                      </span>
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
                className="w-full py-2.5 rounded-xl text-sm font-semibold bg-muted text-foreground border border-border hover:bg-muted/80 transition-colors cursor-pointer"
              >
                ← Another
              </button>
            </div>
          )}

          {/* Wardrobe picker */}
          {identifyStep === "select" && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-muted-foreground">
                Pick from your closet:
              </p>
              {pickerItems.map((item) => (
                <button
                  key={item.name}
                  type="button"
                  onClick={() => startAnalysis(item)}
                  className="w-full min-h-[48px] flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-left transition-colors bg-card border-2 border-border hover:border-turquoise cursor-pointer"
                >
                  {item.imageData ? (
                    <img
                      src={item.imageData}
                      alt={item.name}
                      className="w-10 h-10 rounded-xl object-contain bg-muted border border-border shrink-0"
                    />
                  ) : (
                    <div
                      aria-hidden="true"
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 border border-border"
                      style={{ background: `${item.color}25` }}
                    >
                      {item.emoji}
                    </div>
                  )}
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-extrabold text-foreground truncate">
                      {item.name}
                    </span>
                    <span className="block text-xs text-muted-foreground leading-snug">
                      {item.description}
                    </span>
                  </span>
                  <span className="text-xs font-extrabold text-foreground shrink-0">
                    Check →
                  </span>
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
                  onClick: () => startAnalysis(pickerItems[0]),
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

      {/* Compare mode */}
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
                  {(!compareA || !compareB) && pickingFor === slot
                    ? "← picking"
                    : ""}
                </p>
                {item ? (
                  <button
                    type="button"
                    aria-label={`Change Item ${slot}: ${item.name}`}
                    className={`w-full rounded-2xl overflow-hidden text-left transition-all border-2 cursor-pointer ${
                      (!compareA || !compareB) && pickingFor === slot
                        ? "border-pink shadow-md shadow-pink/20"
                        : "border-border"
                    }`}
                    onClick={() => {
                      if (slot === "A") setCompareA(null)
                      else setCompareB(null)
                      setPickingFor(slot)
                    }}
                  >
                    <div
                      className="h-16 flex items-center justify-center border-b-2 border-border"
                      style={{
                        background: item.imageData ? "var(--muted)" : item.color,
                      }}
                    >
                      {item.imageData ? (
                        <img
                          src={item.imageData}
                          alt={item.name}
                          className="h-full w-full object-contain p-1"
                        />
                      ) : (
                        <span aria-hidden="true" className="text-2xl">
                          {item.emoji}
                        </span>
                      )}
                    </div>
                    <div className="p-2 text-center bg-card">
                      <p className="text-xs font-extrabold truncate text-foreground">
                        {item.name}
                      </p>
                      <p className="text-[11px] font-semibold text-muted-foreground">
                        tap to change
                      </p>
                    </div>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setPickingFor(slot)}
                    className={`w-full h-24 rounded-2xl border-2 border-dashed flex items-center justify-center text-xs font-extrabold transition-all cursor-pointer ${
                      pickingFor === slot
                        ? "border-pink text-pink bg-pink/10"
                        : "border-border text-muted-foreground hover:text-foreground"
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
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-muted-foreground">
                  Choose two items to check match:
                </p>
                <span className="text-xs font-extrabold px-2.5 py-0.5 rounded-full bg-pink/15 text-pink border-2 border-pink/40 shrink-0">
                  Picking {pickingFor}
                </span>
              </div>
              {pickerItems.map((item) => {
                const alreadyPicked =
                  item.name === compareA?.name || item.name === compareB?.name
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
                    className="w-full min-h-[48px] flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-left transition-all bg-card border-2 border-border hover:border-turquoise cursor-pointer"
                    style={{ opacity: alreadyPicked ? 0.4 : 1 }}
                  >
                    {item.imageData ? (
                      <img
                        src={item.imageData}
                        alt={item.name}
                        className="w-9 h-9 rounded-lg object-contain bg-muted border border-border shrink-0"
                      />
                    ) : (
                      <div
                        aria-hidden="true"
                        className="w-9 h-9 rounded-lg flex items-center justify-center text-base shrink-0 border border-border"
                        style={{ background: `${item.color}25` }}
                      >
                        {item.emoji}
                      </div>
                    )}
                    <span className="text-sm font-extrabold flex-1 text-foreground truncate">
                      {item.name}
                    </span>
                    {alreadyPicked && (
                      <span className="text-xs font-bold text-muted-foreground">
                        picked
                      </span>
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
                const evaluation = evaluateColorCompatibility(compareA, compareB)
                const handleUseCombination = () => {
                  const chosenNames = new Set([compareA.name, compareB.name])
                  const findFallback = (
                    cats: string[],
                    fallbackName: string,
                    fallbackColor: string
                  ) => {
                    const match = wardrobe.find(
                      (w) =>
                        cats.includes(w.category) &&
                        !chosenNames.has(w.name) &&
                        (w.status || "clean") === "clean"
                    )
                    return match
                      ? {
                          name: match.name,
                          color: match.color,
                          category: match.category,
                        }
                      : {
                          name: fallbackName,
                          color: fallbackColor,
                          category: cats[0],
                        }
                  }

                  const topPiece =
                    [compareA, compareB].find(
                      (p) =>
                        p.category === "Tops" || p.category === "Outerwear"
                    ) ||
                    findFallback(["Tops"], "White silk-blend shell", "#F5F2EB")
                  const bottomPiece =
                    [compareA, compareB].find(
                      (p) => p.category === "Bottoms"
                    ) ||
                    findFallback(
                      ["Bottoms"],
                      "Tailored navy trousers",
                      "#1D2842"
                    )
                  const shoePiece =
                    [compareA, compareB].find((p) => p.category === "Shoes") ||
                    findFallback(["Shoes"], "Black leather loafers", "#161822")

                  const shortA = compareA.name.split(" ").slice(0, 2).join(" ")
                  const shortB = compareB.name.split(" ").slice(0, 2).join(" ")
                  const lookLabel = `${shortA} + ${shortB}`

                  addCustomStyle({
                    label: lookLabel,
                    tagline: `Saved color pairing (${evaluation.score}% match)`,
                    accent: topPiece.color || "#C4005F",
                    items: [
                      {
                        type:
                          topPiece.category === "Outerwear"
                            ? "Outerwear"
                            : "Top",
                        desc: topPiece.name,
                        color: topPiece.color,
                        emoji: topPiece.category === "Outerwear" ? "🧥" : "👕",
                        reason: "Selected from Color Matcher pairing",
                      },
                      {
                        type: "Bottom",
                        desc: bottomPiece.name,
                        color: bottomPiece.color,
                        emoji: "👖",
                        reason: "Harmonious tonal anchor",
                      },
                      {
                        type: "Shoes",
                        desc: shoePiece.name,
                        color: shoePiece.color,
                        emoji: "👟",
                        reason: "Completes full daily look",
                      },
                    ],
                    rationale: evaluation.explanation,
                  })

                  showToast(
                    "Combination Saved!",
                    `"${lookLabel}" added to Today's outfit options & Stylist.`,
                    "success"
                  )
                }

                return (
                  <>
                    <div
                      role="status"
                      aria-live="polite"
                      className={`rounded-2xl p-4 text-center border-2 ${
                        evaluation.compatible
                          ? "bg-green/10 border-green/50"
                          : "bg-red/10 border-red/50"
                      }`}
                    >
                      <span
                        className={`inline-block mb-1 px-3 py-0.5 rounded-full text-xs font-black ${
                          evaluation.compatible
                            ? "bg-green text-white"
                            : "bg-red text-white"
                        }`}
                      >
                        {evaluation.score}% Match
                      </span>
                      <p
                        className={`text-base font-black ${
                          evaluation.compatible ? "text-green" : "text-red"
                        }`}
                        style={{ fontFamily: "Nunito, sans-serif" }}
                      >
                        <span aria-hidden="true">
                          {evaluation.compatible ? "✓" : "⚠"}{" "}
                        </span>
                        {evaluation.headline}
                      </p>
                      <p className="text-xs font-medium mt-1.5 text-foreground/90">
                        {evaluation.explanation}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleUseCombination}
                        className="flex-1 min-h-[44px] py-2.5 rounded-xl text-xs font-black bg-green text-white border-2 border-[#0D0F18]/20 hover:brightness-110 shadow-md cursor-pointer"
                      >
                        Save Look
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCompareA(null)
                          setCompareB(null)
                          setPickingFor("A")
                        }}
                        className="flex-1 min-h-[44px] py-2.5 rounded-xl text-xs font-extrabold bg-muted text-foreground border-2 border-border hover:border-turquoise cursor-pointer"
                      >
                        Reset
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
