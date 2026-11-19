import React, { useState, useEffect } from "react"
import { useApp } from "../context/AppContext"
import type { AddCustomStyleInput } from "../context/AppContext"
import { categoryToOutfitType, getGarmentEmoji } from "../lib/garmentCategories"
import type { OutfitItem } from "../types"

interface AddStyleModalProps {
  isOpen: boolean
  onClose: () => void
}

const ACCENT_COLORS = [
  { label: "Pink", value: "#ce005a", bgRgba: "rgba(206,0,90,0.15)" },
  { label: "Turquoise", value: "#69d5e6", bgRgba: "rgba(105,213,230,0.15)" },
  { label: "Rose", value: "#e2828f", bgRgba: "rgba(226,130,143,0.15)" },
  { label: "Light Green", value: "#76e09a", bgRgba: "rgba(118,224,154,0.15)" },
  { label: "Gold", value: "#ffcb44", bgRgba: "rgba(255,203,68,0.15)" },
  { label: "Red", value: "#da400c", bgRgba: "rgba(218,64,12,0.15)" },
  { label: "Dark Teal", value: "#007880", bgRgba: "rgba(0,120,128,0.15)" },
  { label: "Green", value: "#40b066", bgRgba: "rgba(64,176,102,0.15)" },
]

export function AddStyleModal({ isOpen, onClose }: AddStyleModalProps) {
  const { wardrobe, addCustomStyle } = useApp()

  const tops = wardrobe.filter(
    (i) => i.category === "Tops" || i.category === "Outerwear"
  )
  const bottoms = wardrobe.filter((i) => i.category === "Bottoms")
  const fullBodyItems = wardrobe.filter((i) => i.category === "Full Body")
  const shoes = wardrobe.filter((i) => i.category === "Shoes")

  const [label, setLabel] = useState("")
  const [tagline, setTagline] = useState("")
  const [selectedAccent, setSelectedAccent] = useState(ACCENT_COLORS[0].value)
  const [styleMode, setStyleMode] = useState<"separates" | "full_body">("separates")
  const [selectedTopId, setSelectedTopId] = useState<number>(tops[0]?.id || 0)
  const [selectedBottomId, setSelectedBottomId] = useState<number>(
    bottoms[0]?.id || 0
  )
  const [selectedFullBodyId, setSelectedFullBodyId] = useState<number>(
    fullBodyItems[0]?.id || 0
  )
  const [selectedShoeId, setSelectedShoeId] = useState<number>(shoes[0]?.id || 0)
  const [customRationale, setCustomRationale] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleAutoPick = () => {
    if (styleMode === "full_body") {
      if (fullBodyItems.length > 0) {
        const randomFullBody =
          fullBodyItems[Math.floor(Math.random() * fullBodyItems.length)]
        setSelectedFullBodyId(randomFullBody.id)
      }
    } else {
      if (tops.length > 0) {
        const randomTop = tops[Math.floor(Math.random() * tops.length)]
        setSelectedTopId(randomTop.id)
      }
      if (bottoms.length > 0) {
        const randomBottom = bottoms[Math.floor(Math.random() * bottoms.length)]
        setSelectedBottomId(randomBottom.id)
      }
    }
    if (shoes.length > 0) {
      const randomShoe = shoes[Math.floor(Math.random() * shoes.length)]
      setSelectedShoeId(randomShoe.id)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!label.trim()) {
      setError(
        "Please provide a style name (e.g. 'Presentation Day', 'Rainy Day')"
      )
      return
    }

    const shoeItem = wardrobe.find((i) => i.id === selectedShoeId) || shoes[0]

    if (styleMode === "full_body") {
      const fullBodyItem =
        wardrobe.find((i) => i.id === selectedFullBodyId) || fullBodyItems[0]
      if (!fullBodyItem || !shoeItem) {
        setError("Please make sure a Dress / Full-Body piece and Shoes are selected.")
        return
      }
      const items: OutfitItem[] = [
        {
          type: "Full Body",
          desc: fullBodyItem.name,
          color: fullBodyItem.color,
          emoji: getGarmentEmoji(fullBodyItem.category, fullBodyItem.name),
          reason: `Selected for ${fullBodyItem.material || fullBodyItem.colorName}.`,
        },
        {
          type: "Shoes",
          desc: shoeItem.name,
          color: shoeItem.color,
          emoji: "👟",
          reason: `Selected for ${shoeItem.name}.`,
        },
      ]
      addCustomStyle({
        label: label.trim(),
        tagline: tagline.trim() || "Custom curated full-body look",
        accent: selectedAccent,
        items,
        rationale:
          customRationale.trim() ||
          `Custom look curated for "${label.trim()}". Pairs ${fullBodyItem.name} with ${shoeItem.name} for effortless one-piece styling.`,
        whyDetails: {
          weatherReason: "Calibrated for comfortable wear in today's weather.",
          colorHarmony: `Custom harmony between ${fullBodyItem.colorName} and ${shoeItem.colorName}.`,
          wearFrequency:
            "Personalized recommendation added to your daily stylist rotation.",
          sensoryComfort:
            "Selected specifically to meet your tactile and fit preferences.",
        },
      })
      onClose()
      return
    }

    const topItem = wardrobe.find((i) => i.id === selectedTopId) || tops[0]
    const bottomItem =
      wardrobe.find((i) => i.id === selectedBottomId) || bottoms[0]

    if (!topItem || !bottomItem || !shoeItem) {
      setError("Please make sure Top, Bottom, and Shoes are selected.")
      return
    }

    const items: OutfitItem[] = [
      {
        type: categoryToOutfitType(topItem.category),
        desc: topItem.name,
        color: topItem.color,
        emoji: getGarmentEmoji(topItem.category, topItem.name),
        reason: `Selected for ${topItem.material || topItem.colorName}.`,
      },
      {
        type: "Bottom",
        desc: bottomItem.name,
        color: bottomItem.color,
        emoji: "👖",
        reason: `Selected for comfortable ${bottomItem.colorName} pairing.`,
      },
      {
        type: "Shoes",
        desc: shoeItem.name,
        color: shoeItem.color,
        emoji: "👟",
        reason: `Selected for ${shoeItem.name}.`,
      },
    ]

    const input: AddCustomStyleInput = {
      label: label.trim(),
      tagline: tagline.trim() || "Custom curated recommendation",
      accent: selectedAccent,
      items,
      rationale:
        customRationale.trim() ||
        `Custom look curated for "${label.trim()}". Combines ${topItem.name} with ${bottomItem.name} and ${shoeItem.name} for tailored comfort.`,
      whyDetails: {
        weatherReason: "Calibrated for comfortable wear in today's weather.",
        colorHarmony: `Custom harmony between ${topItem.colorName} and ${bottomItem.colorName}.`,
        wearFrequency:
          "Personalized recommendation added to your daily stylist rotation.",
        sensoryComfort:
          "Selected specifically to meet your tactile and fit preferences.",
      },
    }

    addCustomStyle(input)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-style-modal-title"
        className="w-full max-w-[410px] rounded-3xl border border-border shadow-2xl overflow-hidden text-left flex flex-col max-h-[92vh]"
        style={{ background: "var(--card)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              aria-hidden="true"
              className="w-10 h-10 rounded-2xl flex items-center justify-center text-lg font-bold shadow-md"
              style={{
                background: selectedAccent,
                color: ["#ffcb44", "#76e09a", "#e2828f", "#69d5e6"].includes(
                  selectedAccent
                )
                  ? "#0D0F18"
                  : "#ffffff",
              }}
            >
              +
            </div>
            <div>
              <h2
                id="add-style-modal-title"
                className="text-base font-bold text-foreground"
              >
                Add Custom Style
              </h2>
              <p className="text-xs text-muted-foreground">
                Add a new recommendation button tailored to your routine
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Add Custom Style dialog"
            className="w-8 h-8 rounded-full bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors text-sm cursor-pointer"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form
          onSubmit={handleSubmit}
          className="p-5 space-y-4 overflow-y-auto flex-1 text-xs"
        >
          {error && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-red/10 border border-red/30 text-red text-xs font-semibold"
            >
              {error}
            </div>
          )}

          {/* Style Name */}
          <div>
            <label
              htmlFor="custom-style-name"
              className="block text-xs font-bold text-foreground mb-1"
            >
              Style Name <span className="text-pink">*</span>
            </label>
            <input
              id="custom-style-name"
              type="text"
              value={label}
              onChange={(e) => {
                setLabel(e.target.value)
                setError("")
              }}
              placeholder="e.g. Presentation Day, Rainy Day, Cozy Coffee"
              className="w-full min-h-[40px] px-3.5 py-2 rounded-xl bg-muted border border-border text-foreground placeholder:text-muted-foreground text-xs focus:outline-none focus:border-pink transition-colors"
            />
          </div>

          {/* Vibe / Tagline */}
          <div>
            <label
              htmlFor="custom-style-tagline"
              className="block text-xs font-bold text-foreground mb-1"
            >
              Vibe / Tagline (Optional)
            </label>
            <input
              id="custom-style-tagline"
              type="text"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="e.g. Polished & structured · keynote ready"
              className="w-full min-h-[40px] px-3.5 py-2 rounded-xl bg-muted border border-border text-foreground placeholder:text-muted-foreground text-xs focus:outline-none focus:border-pink transition-colors"
            />
          </div>

          {/* Accent Color */}
          <div>
            <span
              id="custom-accent-label"
              className="block text-xs font-bold text-foreground mb-1.5"
            >
              Button Accent Color
            </span>
            <div
              role="group"
              aria-labelledby="custom-accent-label"
              className="grid grid-cols-2 gap-1.5"
            >
              {ACCENT_COLORS.map((col) => {
                const isSelected = selectedAccent === col.value
                return (
                  <button
                    key={col.value}
                    type="button"
                    aria-pressed={isSelected}
                    aria-label={`Select ${col.label} accent color`}
                    onClick={() => setSelectedAccent(col.value)}
                    className="flex items-center gap-2 px-2.5 py-2 rounded-xl border text-left transition-all cursor-pointer"
                    style={{
                      background: isSelected
                        ? col.bgRgba
                        : "var(--surface-subtle)",
                      borderColor: isSelected ? col.value : "var(--border)",
                    }}
                  >
                    <span
                      aria-hidden="true"
                      className="w-4 h-4 rounded-full shrink-0 shadow-sm border border-border"
                      style={{ background: col.value }}
                    />
                    <span
                      className="text-[11px] font-semibold"
                      style={{
                        color: isSelected
                          ? "var(--foreground)"
                          : "var(--muted-foreground)",
                      }}
                    >
                      {col.label}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Garments Selection */}
          <div className="space-y-3 pt-1 border-t border-border">
            <div className="flex items-center justify-between">
              <span className="block text-xs font-bold text-foreground">
                Select Outfit Pieces
              </span>
              <button
                type="button"
                onClick={handleAutoPick}
                className="text-[11px] font-semibold text-pink hover:brightness-110 flex items-center gap-1 transition-colors cursor-pointer"
              >
                <span aria-hidden="true">✨ </span>Auto-Pick
              </button>
            </div>

            {/* Garment Layout Switcher */}
            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-muted border border-border">
              <button
                type="button"
                onClick={() => setStyleMode("separates")}
                className={`min-h-[34px] rounded-lg text-[11px] font-extrabold transition-all cursor-pointer ${
                  styleMode === "separates"
                    ? "bg-card text-foreground border border-pink shadow-2xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                👕 Top + Bottom
              </button>
              <button
                type="button"
                onClick={() => setStyleMode("full_body")}
                className={`min-h-[34px] rounded-lg text-[11px] font-extrabold transition-all cursor-pointer ${
                  styleMode === "full_body"
                    ? "bg-card text-foreground border border-pink shadow-2xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                👗 Dress / Full Body
              </button>
            </div>

            {styleMode === "full_body" ? (
              <div>
                <label
                  htmlFor="custom-style-fullbody"
                  className="text-[10px] uppercase font-bold text-muted-foreground block mb-1"
                >
                  Dress / Full Body
                </label>
                <select
                  id="custom-style-fullbody"
                  value={selectedFullBodyId}
                  onChange={(e) => setSelectedFullBodyId(Number(e.target.value))}
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-muted border border-border text-foreground text-xs focus:outline-none focus:border-pink"
                >
                  {fullBodyItems.length === 0 ? (
                    <option value={0}>No dresses or full-body pieces in closet</option>
                  ) : (
                    fullBodyItems.map((item) => (
                      <option
                        key={item.id}
                        value={item.id}
                        className="bg-card text-foreground"
                      >
                        {item.name} ({item.colorName})
                      </option>
                    ))
                  )}
                </select>
              </div>
            ) : (
              <>
                {/* Top */}
                <div>
                  <label
                    htmlFor="custom-style-top"
                    className="text-[10px] uppercase font-bold text-muted-foreground block mb-1"
                  >
                    Top / Outerwear
                  </label>
                  <select
                    id="custom-style-top"
                    value={selectedTopId}
                    onChange={(e) => setSelectedTopId(Number(e.target.value))}
                    className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-muted border border-border text-foreground text-xs focus:outline-none focus:border-pink"
                  >
                    {tops.map((item) => (
                      <option
                        key={item.id}
                        value={item.id}
                        className="bg-card text-foreground"
                      >
                        {item.name} ({item.colorName})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Bottom */}
                <div>
                  <label
                    htmlFor="custom-style-bottom"
                    className="text-[10px] uppercase font-bold text-muted-foreground block mb-1"
                  >
                    Bottom
                  </label>
                  <select
                    id="custom-style-bottom"
                    value={selectedBottomId}
                    onChange={(e) => setSelectedBottomId(Number(e.target.value))}
                    className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-muted border border-border text-foreground text-xs focus:outline-none focus:border-pink"
                  >
                    {bottoms.map((item) => (
                      <option
                        key={item.id}
                        value={item.id}
                        className="bg-card text-foreground"
                      >
                        {item.name} ({item.colorName})
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {/* Shoes */}
            <div>
              <label
                htmlFor="custom-style-shoe"
                className="text-[10px] uppercase font-bold text-muted-foreground block mb-1"
              >
                Footwear
              </label>
              <select
                id="custom-style-shoe"
                value={selectedShoeId}
                onChange={(e) => setSelectedShoeId(Number(e.target.value))}
                className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-muted border border-border text-foreground text-xs focus:outline-none focus:border-pink"
              >
                {shoes.map((item) => (
                  <option
                    key={item.id}
                    value={item.id}
                    className="bg-card text-foreground"
                  >
                    {item.name} ({item.colorName})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Custom Stylist Rationale */}
          <div className="pt-1 border-t border-border">
            <label
              htmlFor="custom-style-rationale"
              className="block text-xs font-bold text-foreground mb-1"
            >
              Stylist Note / Rationale (Optional)
            </label>
            <textarea
              id="custom-style-rationale"
              rows={2}
              value={customRationale}
              onChange={(e) => setCustomRationale(e.target.value)}
              placeholder="Why this outfit works for your needs..."
              className="w-full px-3 py-2 rounded-xl bg-muted border border-border text-foreground placeholder:text-muted-foreground text-xs focus:outline-none focus:border-pink transition-colors resize-none"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-border flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] px-4 py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground bg-muted hover:bg-muted/80 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="min-h-[40px] px-5 py-2 rounded-xl text-xs font-bold shadow-md transition-all hover:opacity-90 active:scale-95 cursor-pointer"
              style={{
                background: selectedAccent,
                color: ["#ffcb44", "#76e09a", "#e2828f", "#69d5e6"].includes(
                  selectedAccent
                )
                  ? "#0D0F18"
                  : "#ffffff",
              }}
            >
              Save Style
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
