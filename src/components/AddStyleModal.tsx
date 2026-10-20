import React, { useState } from "react"
import { useApp } from "../context/AppContext"
import type { AddCustomStyleInput } from "../context/AppContext"
import type { WardrobeItem, OutfitItem } from "../types"

interface AddStyleModalProps {
  isOpen: boolean
  onClose: () => void
}

const ACCENT_COLORS = [
  { label: "Magenta", value: "#D40067", bgRgba: "rgba(212,0,103,0.12)" },
  { label: "Sky Blue", value: "#72D4F0", bgRgba: "rgba(114,212,240,0.12)" },
  { label: "Pastel Pink", value: "#FFB4D8", bgRgba: "rgba(255,180,216,0.12)" },
  { label: "Soft Mint", value: "#B4F0C0", bgRgba: "rgba(180,240,192,0.12)" },
  { label: "Warm Gold", value: "#FFD83D", bgRgba: "rgba(255,216,61,0.12)" },
  { label: "Coral Orange", value: "#E84B1A", bgRgba: "rgba(232,75,26,0.12)" },
  { label: "Deep Teal", value: "#007A8A", bgRgba: "rgba(0,122,138,0.12)" },
  { label: "Lavender", value: "#A78BFA", bgRgba: "rgba(167,139,250,0.12)" },
]

export function AddStyleModal({ isOpen, onClose }: AddStyleModalProps) {
  const { wardrobe, addCustomStyle } = useApp()

  const tops = wardrobe.filter((i) => i.category === "Tops" || i.category === "Outerwear")
  const bottoms = wardrobe.filter((i) => i.category === "Bottoms")
  const shoes = wardrobe.filter((i) => i.category === "Shoes")

  const [label, setLabel] = useState("")
  const [tagline, setTagline] = useState("")
  const [selectedAccent, setSelectedAccent] = useState(ACCENT_COLORS[0].value)
  const [selectedTopId, setSelectedTopId] = useState<number>(tops[0]?.id || 0)
  const [selectedBottomId, setSelectedBottomId] = useState<number>(bottoms[0]?.id || 0)
  const [selectedShoeId, setSelectedShoeId] = useState<number>(shoes[0]?.id || 0)
  const [customRationale, setCustomRationale] = useState("")
  const [error, setError] = useState("")

  if (!isOpen) return null

  const handleAutoPick = () => {
    if (tops.length > 0) {
      const randomTop = tops[Math.floor(Math.random() * tops.length)]
      setSelectedTopId(randomTop.id)
    }
    if (bottoms.length > 0) {
      const randomBottom = bottoms[Math.floor(Math.random() * bottoms.length)]
      setSelectedBottomId(randomBottom.id)
    }
    if (shoes.length > 0) {
      const randomShoe = shoes[Math.floor(Math.random() * shoes.length)]
      setSelectedShoeId(randomShoe.id)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!label.trim()) {
      setError("Please provide a style name (e.g. 'Presentation Day', 'Rainy Day')")
      return
    }

    const topItem = wardrobe.find((i) => i.id === selectedTopId) || tops[0]
    const bottomItem = wardrobe.find((i) => i.id === selectedBottomId) || bottoms[0]
    const shoeItem = wardrobe.find((i) => i.id === selectedShoeId) || shoes[0]

    if (!topItem || !bottomItem || !shoeItem) {
      setError("Please make sure Top, Bottom, and Shoes are selected.")
      return
    }

    const items: OutfitItem[] = [
      {
        type: topItem.category.slice(0, -1) || "Top",
        desc: topItem.name,
        color: topItem.color,
        emoji: topItem.category === "Outerwear" ? "🧥" : "👚",
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
        weatherReason: `Calibrated for comfortable wear in today's weather.`,
        colorHarmony: `Custom harmony between ${topItem.colorName} and ${bottomItem.colorName}.`,
        wearFrequency: "Personalized recommendation added to your daily stylist rotation.",
        sensoryComfort: "Selected specifically to meet your tactile and fit preferences.",
      },
    }

    addCustomStyle(input)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-lg rounded-3xl border border-white/10 shadow-2xl overflow-hidden text-left flex flex-col max-h-[92vh]"
        style={{ background: "#111422" }}
      >
        {/* Header */}
        <div className="p-5 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center text-lg font-bold shadow-md"
              style={{
                background: selectedAccent,
                color: ["#FFD83D", "#B4F0C0", "#FFB4D8", "#72D4F0"].includes(selectedAccent)
                  ? "#0D0F18"
                  : "#ffffff",
              }}
            >
              +
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Add Custom Style</h3>
              <p className="text-xs text-muted-foreground">
                Add a new recommendation button tailored to your routine
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-white/60 hover:text-white flex items-center justify-center transition-colors text-sm"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs font-semibold">
              {error}
            </div>
          )}

          {/* Style Name */}
          <div>
            <label className="block text-xs font-bold text-white mb-1">
              Style Name <span className="text-pink-400">*</span>
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => {
                setLabel(e.target.value)
                setError("")
              }}
              placeholder="e.g. Presentation Day, Rainy Day, Cozy Coffee, Studio Work"
              className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 text-xs focus:outline-none focus:border-pink-400 transition-colors"
            />
          </div>

          {/* Vibe / Tagline */}
          <div>
            <label className="block text-xs font-bold text-white mb-1">
              Vibe / Tagline (Optional)
            </label>
            <input
              type="text"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="e.g. Polished & structured · keynote ready"
              className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 text-xs focus:outline-none focus:border-pink-400 transition-colors"
            />
          </div>

          {/* Accent Color */}
          <div>
            <label className="block text-xs font-bold text-white mb-1.5">
              Button Accent Color
            </label>
            <div className="grid grid-cols-4 gap-2">
              {ACCENT_COLORS.map((col) => {
                const isSelected = selectedAccent === col.value
                return (
                  <button
                    key={col.value}
                    type="button"
                    onClick={() => setSelectedAccent(col.value)}
                    className="flex items-center gap-2 p-2 rounded-xl border text-left transition-all"
                    style={{
                      background: isSelected ? col.bgRgba : "rgba(255,255,255,0.02)",
                      borderColor: isSelected ? col.value : "rgba(255,255,255,0.08)",
                    }}
                  >
                    <span
                      className="w-4 h-4 rounded-full shrink-0 shadow-sm"
                      style={{ background: col.value }}
                    />
                    <span
                      className="text-[11px] font-semibold truncate"
                      style={{ color: isSelected ? "#ffffff" : "var(--muted-foreground)" }}
                    >
                      {col.label}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Garments Selection */}
          <div className="space-y-3 pt-1 border-t border-white/5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-white">
                Select Outfit Pieces
              </label>
              <button
                type="button"
                onClick={handleAutoPick}
                className="text-[11px] font-semibold text-pink-400 hover:text-pink-300 flex items-center gap-1 transition-colors"
              >
                🎲 Auto-pick pieces
              </button>
            </div>

            {/* Top */}
            <div>
              <span className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">
                Top / Outerwear
              </span>
              <select
                value={selectedTopId}
                onChange={(e) => setSelectedTopId(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-pink-400"
              >
                {tops.map((item) => (
                  <option key={item.id} value={item.id} className="bg-[#181B2B] text-white">
                    {item.name} ({item.colorName})
                  </option>
                ))}
              </select>
            </div>

            {/* Bottom */}
            <div>
              <span className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">
                Bottom
              </span>
              <select
                value={selectedBottomId}
                onChange={(e) => setSelectedBottomId(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-pink-400"
              >
                {bottoms.map((item) => (
                  <option key={item.id} value={item.id} className="bg-[#181B2B] text-white">
                    {item.name} ({item.colorName})
                  </option>
                ))}
              </select>
            </div>

            {/* Shoes */}
            <div>
              <span className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">
                Footwear
              </span>
              <select
                value={selectedShoeId}
                onChange={(e) => setSelectedShoeId(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-pink-400"
              >
                {shoes.map((item) => (
                  <option key={item.id} value={item.id} className="bg-[#181B2B] text-white">
                    {item.name} ({item.colorName})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Custom Stylist Rationale */}
          <div className="pt-1 border-t border-white/5">
            <label className="block text-xs font-bold text-white mb-1">
              Stylist Note / Rationale (Optional)
            </label>
            <textarea
              rows={2}
              value={customRationale}
              onChange={(e) => setCustomRationale(e.target.value)}
              placeholder="Why this outfit works for your needs..."
              className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 text-xs focus:outline-none focus:border-pink-400 transition-colors resize-none"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-white/10 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-white/70 hover:text-white bg-white/5 hover:bg-white/10 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-xs font-bold text-white shadow-md transition-all hover:opacity-90 active:scale-95"
              style={{
                background: selectedAccent,
                color: ["#FFD83D", "#B4F0C0", "#FFB4D8", "#72D4F0"].includes(selectedAccent)
                  ? "#0D0F18"
                  : "#ffffff",
              }}
            >
              Add Style Button
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
