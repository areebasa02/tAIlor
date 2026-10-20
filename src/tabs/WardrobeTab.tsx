import { useState } from "react"
import { ImageUploadWidget, type UploadState } from "../components/AIComponents"
import ColorsTab from "./ColorsTab"
import { useApp } from "../context/AppContext"
import type { Category, WardrobeItem } from "../types"

const CATEGORY_EMOJI: Record<string, string> = {
  Tops: "👕",
  Bottoms: "👖",
  Shoes: "👟",
  Outerwear: "🧥",
  Accessories: "💍",
}

const CATS: (Category | "All")[] = [
  "All",
  "Tops",
  "Bottoms",
  "Shoes",
  "Outerwear",
  "Accessories",
]

type AddStep = "closed" | "photo" | "manual"
type SortMode = "most_worn" | "least_worn" | "name" | "newest"

export default function WardrobeTab() {
  const {
    wardrobe,
    addWardrobeItem,
    deleteWardrobeItem,
    toggleFavorite,
    markItemWorn,
    user,
    showToast,
  } = useApp()
  const [section, setSection] = useState<"wardrobe" | "colors">("wardrobe")
  const [cat, setCat] = useState<Category | "All">("All")
  const [search, setSearch] = useState("")
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [sortMode, setSortMode] = useState<SortMode>("newest")
  const [addStep, setAddStep] = useState<AddStep>("closed")
  const [selectedItem, setSelectedItem] = useState<WardrobeItem | null>(null)

  // Photo upload flow state
  const [uploadState, setUploadState] = useState<UploadState>("empty")
  const [uploadProgress, setUploadProgress] = useState(0)
  const [detectedItem, setDetectedItem] = useState<{
    name: string
    color: string
    colorName: string
    category: Category
  }>({
    name: "Teal Gabardine Trench",
    color: "#007A8A",
    colorName: "Deep Teal",
    category: "Outerwear",
  })

  // Manual entry form state
  const [manualName, setManualName] = useState("")
  const [manualCat, setManualCat] = useState<Category>("Tops")
  const [manualColorName, setManualColorName] = useState("")
  const [manualColorHex, setManualColorHex] = useState("#D40067")
  const [manualMaterial, setManualMaterial] = useState("")
  const [manualLocation, setManualLocation] = useState("")
  const [manualCare, setManualCare] = useState("")
  const [manualSentimental, setManualSentimental] =
    useState<"Low" | "Medium" | "High">("Medium")
  const [manualCost, setManualCost] = useState("")

  const filtered = wardrobe
    .filter((item) => {
      const matchCat = cat === "All" || item.category === cat
      const matchSearch =
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        item.colorName.toLowerCase().includes(search.toLowerCase()) ||
        (item.material &&
          item.material.toLowerCase().includes(search.toLowerCase()))
      const matchFav = !favoritesOnly || item.favorite
      return matchCat && matchSearch && matchFav
    })
    .sort((a, b) => {
      if (sortMode === "most_worn") return b.worn - a.worn
      if (sortMode === "least_worn") return a.worn - b.worn
      if (sortMode === "name") return a.name.localeCompare(b.name)
      return b.id - a.id
    })

  // Simulate CV image upload & detection
  const startUpload = (sampleChoice?: {
    name: string
    color: string
    colorName: string
    category: Category
  }) => {
    if (sampleChoice) {
      setDetectedItem(sampleChoice)
    }
    setUploadState("uploading")
    setUploadProgress(0)

    const tick = setInterval(() => {
      setUploadProgress((p) => {
        if (p >= 100) {
          clearInterval(tick)
          setUploadState("analyzing")
          setTimeout(() => setUploadState("success"), 1400)
          return 100
        }
        return Math.min(100, p + 25)
      })
    }, 200)
  }

  const handleSaveDetected = () => {
    addWardrobeItem({
      name: detectedItem.name,
      category: detectedItem.category,
      color: detectedItem.color,
      colorName: detectedItem.colorName,
      worn: 0,
      favorite: false,
      material: "Detected by AI · Soft cotton blend",
      storageLocation: "Closet · Main Rack",
      careInstructions: "Machine wash cold · line dry",
      sentimentalValue: "Medium",
      cost: "$50",
      status: "clean",
    })
    setAddStep("closed")
    setUploadState("empty")
  }

  const handleSaveManual = (e: React.FormEvent) => {
    e.preventDefault()
    if (!manualName.trim()) return

    addWardrobeItem({
      name: manualName.trim(),
      category: manualCat,
      color: manualColorHex,
      colorName: manualColorName.trim() || "Custom Color",
      worn: 0,
      favorite: false,
      material: manualMaterial.trim() || "Breathable fabric",
      storageLocation: manualLocation.trim() || "Closet Shelf",
      careInstructions: manualCare.trim() || "Gentle wash",
      sentimentalValue: manualSentimental,
      cost: manualCost.trim() ? `$${manualCost.replace("$", "")}` : "$40",
      status: "clean",
    })

    // Reset form
    setManualName("")
    setManualColorName("")
    setManualMaterial("")
    setManualLocation("")
    setManualCare("")
    setManualCost("")
    setAddStep("closed")
  }

  if (section === "colors") {
    return (
      <div>
        <div className="px-5 pb-2">
          <button
            type="button"
            onClick={() => setSection("wardrobe")}
            className="text-xs font-semibold"
            style={{ color: "var(--sky)" }}
          >
            ← Back to wardrobe
          </button>
        </div>
        <ColorsTab />
      </div>
    )
  }

  return (
    <div className="px-5 pt-2 pb-4 space-y-4">
      {/* Wardrobe Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2
            className="text-xl font-bold text-white"
            style={{ fontFamily: "Nunito, sans-serif" }}
          >
            {user.name.split(" ")[0]}'s Wardrobe
          </h2>
          <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            {wardrobe.length} total pieces ·{" "}
            {wardrobe.filter((i) => i.worn < 5).length} rarely worn ·{" "}
            {wardrobe.filter((i) => i.favorite).length} favorites
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSection("colors")}
            className="h-8 rounded-full px-3 flex items-center justify-center gap-1.5 text-xs font-semibold transition-transform active:scale-95"
            style={{
              background: "var(--muted)",
              color: "var(--sky)",
              border: "1px solid var(--border)",
            }}
            title="Open Flow 03 Color matcher and analyzer"
          >
            <span aria-hidden="true">🎨</span>
            <span>Colors</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setAddStep("photo")
              setUploadState("empty")
            }}
            aria-label="Add wardrobe item"
            className="h-8 px-3 rounded-full flex items-center justify-center font-bold text-xs gap-1 shadow-md transition-transform active:scale-95"
            style={{ background: "var(--magenta)", color: "#fff" }}
          >
            <span>+</span>
            <span>Add Item</span>
          </button>
        </div>
      </div>

      {/* Add Item — Photo flow with AI Recognition */}
      {addStep === "photo" && (
        <div
          className="rounded-3xl p-5 space-y-3.5 shadow-xl border animate-in fade-in zoom-in-95 duration-150"
          style={{ background: "var(--card)", borderColor: "var(--border)" }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-white">
                AI Photo Wardrobe Scanner
              </p>
              <p className="text-[10px] text-muted-foreground">
                Qwen2.5-VL model automatically detects garment silhouette, hue &
                fabric
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAddStep("closed")}
              className="text-xs text-muted-foreground hover:text-white p-1"
            >
              ✕
            </button>
          </div>

          {/* Quick Demo Clothing Samples for Instant Testing */}
          {uploadState === "empty" && (
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400">
                Quick Test Samples:
              </span>
              <div className="grid grid-cols-3 gap-2">
                {[
                  {
                    name: "Teal trench coat",
                    color: "#007A8A",
                    colorName: "Deep Teal",
                    category: "Outerwear" as Category,
                  },
                  {
                    name: "Magenta silk blouse",
                    color: "#D40067",
                    colorName: "Vivid Magenta",
                    category: "Tops" as Category,
                  },
                  {
                    name: "Gold knit cardigan",
                    color: "#FFD83D",
                    colorName: "Warm Gold",
                    category: "Tops" as Category,
                  },
                ].map((sample) => (
                  <button
                    key={sample.name}
                    type="button"
                    onClick={() => startUpload(sample)}
                    className="p-2 rounded-xl border text-left transition-transform active:scale-95"
                    style={{
                      background: "var(--muted)",
                      borderColor: "var(--border)",
                    }}
                  >
                    <div
                      className="w-4 h-4 rounded-full mb-1"
                      style={{ background: sample.color }}
                    />
                    <p className="text-[10px] font-semibold text-white truncate">
                      {sample.name}
                    </p>
                    <p className="text-[8px] text-muted-foreground">
                      {sample.category}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          <ImageUploadWidget
            state={uploadState}
            progress={uploadProgress}
            result={
              uploadState === "success"
                ? {
                    name: detectedItem.name,
                    hex: detectedItem.color,
                    category: `${detectedItem.category} · ${detectedItem.colorName}`,
                  }
                : undefined
            }
            onRetake={() => {
              if (uploadState === "empty" || uploadState === "error") {
                startUpload()
              } else {
                setUploadState("empty")
              }
            }}
            onManual={() => setAddStep("manual")}
            onSave={handleSaveDetected}
            onCorrect={() => {
              showToast(
                "Color Corrected",
                "Adjusted to high confidence label.",
                "info",
              )
              handleSaveDetected()
            }}
          />

          {uploadState === "empty" && (
            <button
              type="button"
              onClick={() => setAddStep("manual")}
              className="w-full py-2 rounded-xl text-xs text-muted-foreground hover:text-white transition-colors"
            >
              Enter details manually instead →
            </button>
          )}
        </div>
      )}

      {/* Add Item — Manual Form with Digital Wardrobe Tags */}
      {addStep === "manual" && (
        <form
          onSubmit={handleSaveManual}
          className="rounded-3xl p-5 space-y-3.5 shadow-xl border animate-in fade-in duration-150"
          style={{ background: "var(--card)", borderColor: "var(--border)" }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-white">
                Manual Wardrobe Entry
              </p>
              <p className="text-[10px] text-muted-foreground">
                Log materials, care tags, and storage locations for personalized
                AI styling
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAddStep("closed")}
              className="text-xs text-muted-foreground hover:text-white"
            >
              ✕
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block text-muted-foreground">
                Garment Name *
              </label>
              <input
                required
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                placeholder="e.g. Lavender Linen Shirt"
                className="w-full rounded-xl px-3 py-2 text-xs outline-none"
                style={{
                  background: "var(--muted)",
                  color: "var(--foreground)",
                  border: "1px solid var(--border)",
                }}
              />
            </div>

            <div className="col-span-2 sm:col-span-1">
              <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block text-muted-foreground">
                Category *
              </label>
              <select
                value={manualCat}
                onChange={(e) => setManualCat(e.target.value as Category)}
                className="w-full rounded-xl px-3 py-2 text-xs outline-none"
                style={{
                  background: "var(--muted)",
                  color: "var(--foreground)",
                  border: "1px solid var(--border)",
                }}
              >
                <option value="Tops">Tops</option>
                <option value="Bottoms">Bottoms</option>
                <option value="Shoes">Shoes</option>
                <option value="Outerwear">Outerwear</option>
                <option value="Accessories">Accessories</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block text-muted-foreground">
                Color Name
              </label>
              <input
                value={manualColorName}
                onChange={(e) => setManualColorName(e.target.value)}
                placeholder="e.g. Soft Lavender"
                className="w-full rounded-xl px-3 py-2 text-xs outline-none"
                style={{
                  background: "var(--muted)",
                  color: "var(--foreground)",
                  border: "1px solid var(--border)",
                }}
              />
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block text-muted-foreground">
                Color Swatch
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={manualColorHex}
                  onChange={(e) => setManualColorHex(e.target.value)}
                  className="w-9 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                />
                <span className="text-xs font-mono text-muted-foreground">
                  {manualColorHex}
                </span>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block text-muted-foreground">
                Material & Texture
              </label>
              <input
                value={manualMaterial}
                onChange={(e) => setManualMaterial(e.target.value)}
                placeholder="e.g. 100% Linen, Tagless"
                className="w-full rounded-xl px-3 py-2 text-xs outline-none"
                style={{
                  background: "var(--muted)",
                  color: "var(--foreground)",
                  border: "1px solid var(--border)",
                }}
              />
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block text-muted-foreground">
                Storage Location
              </label>
              <input
                value={manualLocation}
                onChange={(e) => setManualLocation(e.target.value)}
                placeholder="e.g. Top Shelf Closet A"
                className="w-full rounded-xl px-3 py-2 text-xs outline-none"
                style={{
                  background: "var(--muted)",
                  color: "var(--foreground)",
                  border: "1px solid var(--border)",
                }}
              />
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block text-muted-foreground">
                Care Instructions
              </label>
              <input
                value={manualCare}
                onChange={(e) => setManualCare(e.target.value)}
                placeholder="e.g. Cold hand wash"
                className="w-full rounded-xl px-3 py-2 text-xs outline-none"
                style={{
                  background: "var(--muted)",
                  color: "var(--foreground)",
                  border: "1px solid var(--border)",
                }}
              />
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block text-muted-foreground">
                Sentimental Value
              </label>
              <select
                value={manualSentimental}
                onChange={(e) =>
                  setManualSentimental(
                    e.target.value as "Low" | "Medium" | "High",
                  )
                }
                className="w-full rounded-xl px-3 py-2 text-xs outline-none"
                style={{
                  background: "var(--muted)",
                  color: "var(--foreground)",
                  border: "1px solid var(--border)",
                }}
              >
                <option value="High">High (Cherished / Favorite)</option>
                <option value="Medium">Medium (Regular)</option>
                <option value="Low">Low (Basic / Beater)</option>
              </select>
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-2.5 rounded-xl text-xs font-bold transition-all hover:brightness-110 active:scale-98"
            style={{ background: "var(--magenta)", color: "#fff" }}
          >
            Save to Digital Wardrobe
          </button>
        </form>
      )}

      {/* Search and Sort Toolbar */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              🔍
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, color, or material…"
              className="w-full rounded-2xl pl-9 pr-4 py-2.5 text-xs outline-none transition-colors"
              style={{
                background: "var(--muted)",
                color: "var(--foreground)",
                border: "1px solid var(--border)",
              }}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground"
              >
                ✕
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setFavoritesOnly(!favoritesOnly)}
            className="h-10 px-3 rounded-2xl text-xs font-bold flex items-center gap-1.5 transition-all"
            style={{
              background: favoritesOnly
                ? "rgba(212,0,103,0.15)"
                : "var(--muted)",
              color: favoritesOnly
                ? "var(--magenta)"
                : "var(--muted-foreground)",
              border: `1px solid ${
                favoritesOnly ? "var(--magenta)" : "var(--border)"
              }`,
            }}
            title="Filter favorites only"
          >
            <span>{favoritesOnly ? "♥" : "♡"}</span>
            <span className="hidden sm:inline">Favorites</span>
          </button>

          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="h-10 px-2.5 rounded-2xl text-[11px] font-semibold outline-none border text-muted-foreground"
            style={{ background: "var(--muted)", borderColor: "var(--border)" }}
          >
            <option value="newest">Newest First</option>
            <option value="most_worn">Most Worn</option>
            <option value="least_worn">Least Worn</option>
            <option value="name">A–Z Name</option>
          </select>
        </div>

        {/* Category Pills */}
        <div className="flex gap-2 overflow-x-auto md:flex-wrap pb-1 no-scrollbar">
          {CATS.map((c) => {
            const active = cat === c
            return (
              <button
                key={c}
                type="button"
                onClick={() => setCat(c)}
                className="shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all"
                style={{
                  background: active ? "var(--magenta)" : "var(--muted)",
                  color: active ? "#fff" : "var(--muted-foreground)",
                  boxShadow: active ? "0 2px 8px rgba(212,0,103,0.3)" : "none",
                }}
              >
                {c !== "All" && (
                  <span className="mr-1">{CATEGORY_EMOJI[c]}</span>
                )}
                {c}
              </button>
            )
          })}
        </div>
      </div>

      {/* Wardrobe Items Grid - 2 cols on mobile, up to 7 cols on presentation screens */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-3 sm:gap-4">
        {filtered.map((item) => (
          <div
            key={item.id}
            onClick={() => setSelectedItem(item)}
            className="rounded-3xl overflow-hidden flex flex-col border shadow-sm cursor-pointer transition-all hover:scale-[1.02] hover:border-[#72D4F0]/40 group"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            {/* Garment Visual Header */}
            <div
              className="h-24 relative flex items-center justify-center p-3"
              style={{ background: item.color }}
            >
              <span className="text-3xl drop-shadow-md select-none group-hover:scale-110 transition-transform">
                {CATEGORY_EMOJI[item.category] ?? "👗"}
              </span>

              {/* Favorite Heart Button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  toggleFavorite(item.id)
                }}
                className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center text-xs backdrop-blur-md transition-transform active:scale-90"
                style={{
                  background: item.favorite
                    ? "rgba(212,0,103,0.85)"
                    : "rgba(0,0,0,0.4)",
                  color: "#fff",
                }}
                aria-label={item.favorite ? "Unfavorite item" : "Favorite item"}
              >
                {item.favorite ? "♥" : "♡"}
              </button>

              {/* Status Badge */}
              {item.worn < 5 && (
                <span className="absolute bottom-1.5 left-2 px-1.5 py-0.5 rounded-md text-[8px] font-extrabold uppercase bg-black/60 text-green-400 backdrop-blur-xs">
                  Rediscover
                </span>
              )}
            </div>

            {/* Info Area */}
            <div className="p-3 flex-1 flex flex-col justify-between">
              <div>
                <p className="text-xs font-bold text-white truncate leading-tight">
                  {item.name}
                </p>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-1">
                  <span>{item.category}</span>
                  <span className="font-semibold text-white/90">
                    Worn {item.worn}×
                  </span>
                </div>
              </div>

              {/* High-Contrast Accessible Color Pill if enabled */}
              {user.accessibility.highContrastColors ? (
                <div className="mt-2 px-2 py-0.5 rounded-lg bg-black text-white text-[9px] font-mono border border-white/20 truncate">
                  {item.colorName} ({item.color})
                </div>
              ) : (
                <p className="text-[9px] text-muted-foreground truncate mt-1.5">
                  {item.colorName}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 rounded-3xl border border-dashed border-white/10 p-6">
          <span className="text-3xl">👗</span>
          <p className="text-sm font-semibold text-white mt-2">
            No wardrobe pieces found
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Try adjusting your search filter or add a new piece to your closet.
          </p>
          <button
            type="button"
            onClick={() => setAddStep("photo")}
            className="mt-3 px-4 py-2 rounded-xl text-xs font-bold"
            style={{ background: "var(--magenta)", color: "#fff" }}
          >
            + Add New Item
          </button>
        </div>
      )}

      {/* Item Detail Modal */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div
            className="rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl border"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shadow-md shrink-0"
                  style={{ background: selectedItem.color }}
                >
                  {CATEGORY_EMOJI[selectedItem.category] ?? "👗"}
                </div>
                <div>
                  <h3 className="text-base font-bold text-white leading-tight">
                    {selectedItem.name}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {selectedItem.category} · {selectedItem.colorName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                className="text-xs text-muted-foreground hover:text-white p-1"
              >
                ✕
              </button>
            </div>

            {/* Spec Details */}
            <div className="space-y-2 text-xs">
              <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5 flex justify-between">
                <span className="text-muted-foreground">Times Worn:</span>
                <span className="font-bold text-white">
                  {selectedItem.worn} times
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5 flex justify-between">
                <span className="text-muted-foreground">Storage Location:</span>
                <span className="font-semibold text-white">
                  {selectedItem.storageLocation || "Main Closet"}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5 flex justify-between">
                <span className="text-muted-foreground">
                  Fabric & Material:
                </span>
                <span className="font-semibold text-white">
                  {selectedItem.material || "Standard Cotton"}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5 flex justify-between">
                <span className="text-muted-foreground">
                  Care Instructions:
                </span>
                <span className="font-semibold text-white truncate max-w-[180px]">
                  {selectedItem.careInstructions || "Cold wash"}
                </span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  markItemWorn(selectedItem.id)
                  showToast(
                    "Wear Logged",
                    `+1 wear added to ${selectedItem.name}`,
                    "success",
                  )
                  setSelectedItem((prev) =>
                    prev ? { ...prev, worn: prev.worn + 1 } : null,
                  )
                }}
                className="py-2.5 rounded-xl text-xs font-bold text-white"
                style={{ background: "var(--green)" }}
              >
                +1 Worn Today
              </button>

              <button
                type="button"
                onClick={() => {
                  toggleFavorite(selectedItem.id)
                  setSelectedItem((prev) =>
                    prev ? { ...prev, favorite: !prev.favorite } : null,
                  )
                }}
                className="py-2.5 rounded-xl text-xs font-bold text-white"
                style={{ background: "var(--muted)" }}
              >
                {selectedItem.favorite ? "♥ Favorited" : "♡ Add Favorite"}
              </button>

              <button
                type="button"
                onClick={() => {
                  deleteWardrobeItem(selectedItem.id)
                  setSelectedItem(null)
                }}
                className="col-span-2 py-2 rounded-xl text-xs font-semibold text-orange-400 hover:text-red-400"
              >
                Delete from Wardrobe
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
