import { useEffect, useState } from "react"
import {
  ImageUploadWidget,
  SCAN_ISSUE_OPTIONS,
  WardrobeScanCorrectionModal,
  type ScanIssueId,
  type UploadState,
} from "../components/AIComponents"
import { AiHostNoticeBanner } from "../components/AiHostStatus"
import ColorsTab from "./ColorsTab"
import { useApp } from "../context/AppContext"
import {
  fileToBase64,
  scanWardrobePhoto,
  type MockSampleId,
  type WardrobeScanItem,
} from "../lib/wardrobeScan"
import {
  getClosetItemTags,
  getSensoryInfo,
  speakText,
  stopSpeaking,
} from "../services/accessibilityHelpers"
import type { Category, FavoriteOutfit, FavoriteOutfitItem, WardrobeItem } from "../types"
import { THEME_COLORS } from "../types/theme"

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
    favoriteOutfits,
    saveFavoriteOutfit,
    removeFavoriteOutfit,
    setActiveTryOnOutfit,
    setRequestedTab,
  } = useApp()
  const [section, setSection] = useState<"wardrobe" | "favorites" | "colors">("wardrobe")
  const [cat, setCat] = useState<Category | "All">("All")
  const [search, setSearch] = useState("")
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [sensoryOnly, setSensoryOnly] = useState(false)
  const [sortMode, setSortMode] = useState<SortMode>("newest")
  const [addStep, setAddStep] = useState<AddStep>("closed")
  const [selectedItem, setSelectedItem] = useState<WardrobeItem | null>(null)
  const [speakingItem, setSpeakingItem] = useState(false)

  // Favorite Outfit Builder state
  const [builderOpen, setBuilderOpen] = useState(false)
  const [favLabel, setFavLabel] = useState("")
  const [favTopId, setFavTopId] = useState<number | "">("")
  const [favBottomId, setFavBottomId] = useState<number | "">("")
  const [favShoesId, setFavShoesId] = useState<number | "">("")
  const [favOuterId, setFavOuterId] = useState<number | "">("")

  useEffect(() => () => stopSpeaking(), [])

  // Photo upload flow state (live backend scan + thumbnail capture)
  const [uploadState, setUploadState] = useState<UploadState>("empty")
  const [uploadProgress, setUploadProgress] = useState(0)
  const [scanError, setScanError] = useState("")
  const [scanSource, setScanSource] = useState("")
  const [scanNote, setScanNote] = useState("")
  const [pendingImageData, setPendingImageData] = useState<string | undefined>()
  const [correctionStep, setCorrectionStep] = useState<
    "idle" | "ask_reason" | "modal"
  >("idle")
  const [wrongIssues, setWrongIssues] = useState<ScanIssueId[]>([])
  const [wrongNote, setWrongNote] = useState("")
  const [detectedItem, setDetectedItem] = useState<WardrobeScanItem>({
    name: "Teal Gabardine Trench",
    color: THEME_COLORS.darkTeal,
    colorName: "Deep Teal",
    category: "Outerwear",
    material: "Gabardine cotton blend",
    careInstructions: "Dry clean or gentle cold wash · hang dry",
    storageLocation: "Closet · Main Rack",
    sentimentalValue: "Medium",
    cost: "$89",
    confidence: 0.94,
  })

  const QUICK_SAMPLES: {
    id: MockSampleId
    name: string
    color: string
    colorName: string
    category: Category
    imageData: string
  }[] = [
    {
      id: "teal-trench",
      name: "Teal trench coat",
      color: THEME_COLORS.darkTeal,
      colorName: "Deep Teal",
      category: "Outerwear",
      imageData: "/wardrobe/teal-trench-coat.png",
    },
    {
      id: "magenta-blouse",
      name: "Magenta silk blouse",
      color: THEME_COLORS.pink,
      colorName: "Vivid Magenta",
      category: "Tops",
      imageData: "/wardrobe/magenta-silk-blouse.png",
    },
    {
      id: "gold-cardigan",
      name: "Gold knit cardigan",
      color: THEME_COLORS.gold,
      colorName: "Warm Gold",
      category: "Tops",
      imageData: "/wardrobe/gold-knit-cardigan.png",
    },
  ]

  // Manual entry form state
  const [manualName, setManualName] = useState("")
  const [manualCat, setManualCat] = useState<Category>("Tops")
  const [manualColorName, setManualColorName] = useState("")
  const [manualColorHex, setManualColorHex] = useState<string>(THEME_COLORS.pink)
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
      const matchSensory =
        !sensoryOnly || getSensoryInfo(item.name, item.material).isSoft
      return matchCat && matchSearch && matchFav && matchSensory
    })
    .sort((a, b) => {
      if (sortMode === "most_worn") return b.worn - a.worn
      if (sortMode === "least_worn") return a.worn - b.worn
      if (sortMode === "name") return a.name.localeCompare(b.name)
      return b.id - a.id
    })

  const resetCorrectionFlow = () => {
    setCorrectionStep("idle")
    setWrongIssues([])
    setWrongNote("")
  }

  const toggleWrongIssue = (id: ScanIssueId) => {
    setWrongIssues((prev) => {
      if (id === "all") {
        return prev.includes("all") ? [] : ["all"]
      }
      const withoutAll = prev.filter((item) => item !== "all")
      return withoutAll.includes(id)
        ? withoutAll.filter((item) => item !== id)
        : [...withoutAll, id]
    })
  }

  const applyScanResult = (
    item: WardrobeScanItem,
    source?: string,
    note?: string
  ) => {
    resetCorrectionFlow()
    setDetectedItem(item)
    setScanSource(source || "")
    setScanNote(note || "")
    setScanError("")
    setUploadState("success")
  }

  const runScan = async (options: {
    mockSample?: MockSampleId
    file?: File
  }) => {
    resetCorrectionFlow()
    setScanError("")
    setScanNote("")
    setScanSource("")
    setUploadState("uploading")
    setUploadProgress(15)

    try {
      let image: string | undefined
      let mimeType: string | undefined
      if (options.file) {
        const encoded = await fileToBase64(options.file)
        image = encoded.base64
        mimeType = encoded.mimeType
        setPendingImageData(`data:${mimeType};base64,${image}`)
        setUploadProgress(55)
      } else {
        const sampleImg = QUICK_SAMPLES.find(
          (s) => s.id === options.mockSample,
        )?.imageData
        setPendingImageData(sampleImg)
        setUploadProgress(45)
      }

      setUploadState("analyzing")
      setUploadProgress(80)

      const result = await scanWardrobePhoto({
        image,
        mimeType,
        mockSample: options.mockSample,
        useMock: Boolean(options.mockSample),
      })

      setUploadProgress(100)
      applyScanResult(result.item, result.source, result.note)
      if (result.note) {
        showToast("Demo scan", result.note, "info")
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Wardrobe scan failed unexpectedly."
      setScanError(message)
      setUploadState("error")
      showToast("Scan failed", message, "warning")
    }
  }

  const saveScanItemToWardrobe = (
    itemToSave: WardrobeScanItem,
    sourceLabel?: string
  ) => {
    addWardrobeItem({
      name: itemToSave.name,
      category: itemToSave.category,
      color: itemToSave.color,
      colorName: itemToSave.colorName,
      worn: 0,
      favorite: false,
      material: itemToSave.material || "Detected by AI",
      storageLocation: itemToSave.storageLocation || "Closet · Main Rack",
      careInstructions: itemToSave.careInstructions || "Gentle wash",
      sentimentalValue: itemToSave.sentimentalValue || "Medium",
      cost: itemToSave.cost || "$40",
      status: "clean",
      imageData: pendingImageData,
    })
    showToast(
      "Added to wardrobe",
      `${itemToSave.name} saved from ${sourceLabel || scanSource || "AI scan"}.`,
      "success"
    )
    resetCorrectionFlow()
    setAddStep("closed")
    setUploadState("empty")
    setScanNote("")
    setScanSource("")
    setPendingImageData(undefined)
  }

  const handleSaveDetected = () => {
    saveScanItemToWardrobe(detectedItem)
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

    setManualName("")
    setManualColorName("")
    setManualMaterial("")
    setManualLocation("")
    setManualCare("")
    setManualCost("")
    setAddStep("closed")
  }

  const topsPool = wardrobe.filter((w) => w.category === "Tops")
  const bottomsPool = wardrobe.filter((w) => w.category === "Bottoms")
  const shoesPool = wardrobe.filter((w) => w.category === "Shoes")
  const outerPool = wardrobe.filter((w) => w.category === "Outerwear")

  const openBuilderWithDefaults = () => {
    setBuilderOpen((prev) => {
      const next = !prev
      if (next) {
        if (favTopId === "" && topsPool[0]) setFavTopId(topsPool[0].id)
        if (favBottomId === "" && bottomsPool[0]) setFavBottomId(bottomsPool[0].id)
        if (favShoesId === "" && shoesPool[0]) setFavShoesId(shoesPool[0].id)
      }
      return next
    })
  }

  const buildFavoriteFromForm = (): FavoriteOutfit | null => {
    const picked: WardrobeItem[] = []
    const top = topsPool.find((i) => i.id === favTopId)
    const bottom = bottomsPool.find((i) => i.id === favBottomId)
    const outer = outerPool.find((i) => i.id === favOuterId)
    const shoes = shoesPool.find((i) => i.id === favShoesId)
    if (top) picked.push(top)
    if (outer) picked.push(outer)
    if (bottom) picked.push(bottom)
    if (shoes) picked.push(shoes)

    if (picked.length < 2) {
      showToast(
        "Pick at least 2 pieces",
        "Select at least two wardrobe pieces (such as a Top and Bottom) to build an outfit.",
        "warning",
      )
      return null
    }

    const items: FavoriteOutfitItem[] = picked.map((w) => ({
      type:
        w.category === "Accessories"
          ? "Accessory"
          : w.category === "Outerwear"
            ? "Outerwear"
            : w.category.slice(0, -1),
      name: w.name,
      color: w.color,
      emoji: CATEGORY_EMOJI[w.category] || "👕",
      imageData: w.imageData,
      wardrobeItemId: w.id,
    }))

    const autoLabel =
      picked
        .slice(0, 2)
        .map((p) => p.name)
        .join(" & ") || "Custom Favorite Look"

    return {
      id: `fav-${Date.now()}`,
      label: favLabel.trim() || autoLabel,
      tagline: `Built from ${picked.length} closet pieces`,
      colors: picked.slice(0, 3).map((p) => p.color),
      items,
      createdAt: new Date().toISOString(),
    }
  }

  const showListen = Boolean(
    user.accessibility.visionImpairment || user.accessibility.voiceNarration
  )

  return (
    <div className="pt-1 pb-4 space-y-2.5">
      {/* Wardrobe Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h1
            className="text-xl font-black text-foreground leading-tight"
            style={{ fontFamily: "Nunito, sans-serif" }}
          >
            {user.name.split(" ")[0]}&apos;s Closet
          </h1>
          <p className="text-xs font-semibold text-muted-foreground leading-snug mt-0.5">
            {wardrobe.length} pieces · {favoriteOutfits.length} favorite outfit
            {favoriteOutfits.length === 1 ? "" : "s"}
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setSection("wardrobe")
            setAddStep("photo")
            setUploadState("empty")
            setScanError("")
            setScanNote("")
            setPendingImageData(undefined)
            resetCorrectionFlow()
          }}
          aria-label="Add wardrobe item"
          className="min-h-[40px] px-3.5 rounded-xl flex items-center justify-center font-black text-xs gap-1 whitespace-nowrap shrink-0 shadow-md shadow-pink/25 transition-all active:scale-95 bg-pink text-white border-2 border-[#0D0F18]/20 dark:border-white/25 hover:brightness-110 cursor-pointer"
        >
          <span aria-hidden="true">+</span>
          <span>Add Piece</span>
        </button>
      </div>

      {/* 3-Button Closet Section Bar */}
      <div
        role="tablist"
        aria-label="Closet sections"
        className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl border-2 border-border bg-muted"
      >
        <button
          type="button"
          role="tab"
          aria-selected={section === "wardrobe"}
          onClick={() => setSection("wardrobe")}
          className={`min-h-[38px] px-2 py-1.5 rounded-xl text-[11px] font-extrabold transition-all cursor-pointer truncate ${
            section === "wardrobe"
              ? "bg-card text-foreground border-2 border-pink shadow-xs"
              : "text-muted-foreground border-2 border-transparent hover:text-foreground"
          }`}
        >
          <span aria-hidden="true">👔 </span>Pieces ({wardrobe.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={section === "favorites"}
          onClick={() => setSection("favorites")}
          className={`min-h-[38px] px-2 py-1.5 rounded-xl text-[11px] font-extrabold transition-all cursor-pointer truncate ${
            section === "favorites"
              ? "bg-card text-foreground border-2 border-pink shadow-xs"
              : "text-muted-foreground border-2 border-transparent hover:text-foreground"
          }`}
        >
          <span aria-hidden="true">❤️ </span>Fav Outfits ({favoriteOutfits.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={section === "colors"}
          onClick={() => setSection("colors")}
          className={`min-h-[38px] px-2 py-1.5 rounded-xl text-[11px] font-extrabold transition-all cursor-pointer truncate ${
            section === "colors"
              ? "bg-card text-foreground border-2 border-turquoise shadow-xs"
              : "text-muted-foreground border-2 border-transparent hover:text-foreground"
          }`}
        >
          <span aria-hidden="true">🎨 </span>Colors
        </button>
      </div>

      {section === "colors" && <ColorsTab />}

      {section === "favorites" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-black text-foreground">
                Saved Favorite Outfits
              </h2>
              <p className="text-[11px] font-medium text-muted-foreground">
                Ready for 1-tap loading in your 3D Mannequin Studio.
              </p>
            </div>
            <button
              type="button"
              onClick={openBuilderWithDefaults}
              className="min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-black bg-turquoise text-[#0D0F18] border-2 border-[#0D0F18]/20 hover:brightness-105 shadow-xs transition-all cursor-pointer shrink-0"
            >
              {builderOpen ? "Close Builder" : "+ Build New Favorite Outfit"}
            </button>
          </div>

          {builderOpen && (
            <div className="rounded-3xl p-4 space-y-3 border-2 border-turquoise bg-card shadow-lg animate-in fade-in duration-150">
              <div>
                <h3 className="text-sm font-black text-foreground">
                  Build Favorite Outfit
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  Mix pieces from your closet to save and try on your 3D mannequin.
                </p>
              </div>

              <div>
                <label
                  htmlFor="fav-outfit-label"
                  className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1"
                >
                  Outfit Name (optional)
                </label>
                <input
                  id="fav-outfit-label"
                  value={favLabel}
                  onChange={(e) => setFavLabel(e.target.value)}
                  placeholder="e.g. Weekend Blue Denim Look"
                  className="w-full min-h-[40px] rounded-xl px-3 py-2 text-xs font-semibold outline-none bg-muted text-foreground border-2 border-border focus:border-turquoise"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label
                    htmlFor="fav-top-select"
                    className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1"
                  >
                    Top
                  </label>
                  <select
                    id="fav-top-select"
                    value={favTopId}
                    onChange={(e) =>
                      setFavTopId(e.target.value ? Number(e.target.value) : "")
                    }
                    className="w-full min-h-[40px] rounded-xl px-2.5 py-2 text-xs font-semibold outline-none bg-muted text-foreground border-2 border-border focus:border-turquoise"
                  >
                    <option value="">None</option>
                    {topsPool.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} ({w.colorName})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="fav-bottom-select"
                    className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1"
                  >
                    Bottom
                  </label>
                  <select
                    id="fav-bottom-select"
                    value={favBottomId}
                    onChange={(e) =>
                      setFavBottomId(e.target.value ? Number(e.target.value) : "")
                    }
                    className="w-full min-h-[40px] rounded-xl px-2.5 py-2 text-xs font-semibold outline-none bg-muted text-foreground border-2 border-border focus:border-turquoise"
                  >
                    <option value="">None</option>
                    {bottomsPool.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} ({w.colorName})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="fav-outer-select"
                    className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1"
                  >
                    Outerwear (optional)
                  </label>
                  <select
                    id="fav-outer-select"
                    value={favOuterId}
                    onChange={(e) =>
                      setFavOuterId(e.target.value ? Number(e.target.value) : "")
                    }
                    className="w-full min-h-[40px] rounded-xl px-2.5 py-2 text-xs font-semibold outline-none bg-muted text-foreground border-2 border-border focus:border-turquoise"
                  >
                    <option value="">None</option>
                    {outerPool.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} ({w.colorName})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="fav-shoes-select"
                    className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1"
                  >
                    Shoes
                  </label>
                  <select
                    id="fav-shoes-select"
                    value={favShoesId}
                    onChange={(e) =>
                      setFavShoesId(e.target.value ? Number(e.target.value) : "")
                    }
                    className="w-full min-h-[40px] rounded-xl px-2.5 py-2 text-xs font-semibold outline-none bg-muted text-foreground border-2 border-border focus:border-turquoise"
                  >
                    <option value="">None</option>
                    {shoesPool.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} ({w.colorName})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    const built = buildFavoriteFromForm()
                    if (!built) return
                    saveFavoriteOutfit(built)
                    setFavLabel("")
                    setBuilderOpen(false)
                  }}
                  className="min-h-[42px] py-2 rounded-xl text-xs font-black bg-pink text-white border-2 border-[#0D0F18]/20 hover:brightness-110 shadow-sm cursor-pointer"
                >
                  ♥ Save Favorite
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const built = buildFavoriteFromForm()
                    if (!built) return
                    saveFavoriteOutfit(built)
                    setFavLabel("")
                    setBuilderOpen(false)
                    setActiveTryOnOutfit(built)
                    setRequestedTab("tryon")
                  }}
                  className="min-h-[42px] py-2 rounded-xl text-xs font-black bg-turquoise text-[#0D0F18] border-2 border-[#0D0F18]/20 hover:brightness-105 shadow-sm cursor-pointer"
                >
                  🪞 Save & Try On
                </button>
              </div>
            </div>
          )}

          {favoriteOutfits.length === 0 ? (
            <div className="text-center py-8 rounded-3xl border-2 border-dashed border-border p-5 bg-card/60 space-y-2">
              <span aria-hidden="true" className="text-3xl">
                ❤️
              </span>
              <p className="text-sm font-black text-foreground">
                No favorite outfits yet
              </p>
              <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                Build a custom look above, favorite a recommendation on the Today tab, or use the manual outfit builder inside Try-On.
              </p>
              <div className="flex flex-wrap justify-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={openBuilderWithDefaults}
                  className="min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-black bg-pink text-white border-2 border-[#0D0F18]/20 hover:brightness-110 cursor-pointer"
                >
                  + Build Favorite Outfit
                </button>
                <button
                  type="button"
                  onClick={() => setRequestedTab("tryon")}
                  className="min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-extrabold bg-muted text-foreground border-2 border-border hover:border-turquoise cursor-pointer"
                >
                  Open Try-On Studio →
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              {favoriteOutfits.map((outfit) => (
                <div
                  key={outfit.id}
                  className="rounded-2xl p-3.5 space-y-2.5 border-2 border-border bg-card shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-base font-black text-foreground leading-tight">
                        {outfit.label}
                      </h3>
                      <p className="text-xs font-medium text-muted-foreground mt-0.5">
                        {outfit.tagline}
                      </p>
                    </div>
                    <div className="flex gap-1.5 shrink-0 pt-0.5">
                      {outfit.colors.map((c, idx) => (
                        <div
                          key={idx}
                          aria-hidden="true"
                          className="w-5 h-5 rounded-md border-2 border-foreground/20"
                          style={{ background: c }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-2 border-t-2 border-border">
                    {outfit.items.map((item) => (
                      <div
                        key={`${outfit.id}-${item.type}-${item.name}`}
                        className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-muted border border-border"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {item.imageData ? (
                            <img
                              src={item.imageData}
                              alt={item.name}
                              className="w-8 h-8 rounded-lg object-contain bg-card border border-border shrink-0"
                            />
                          ) : (
                            <div
                              aria-hidden="true"
                              className="w-8 h-8 rounded-lg flex items-center justify-center border border-border text-sm shrink-0"
                              style={{ background: `${item.color}22` }}
                            >
                              {item.emoji}
                            </div>
                          )}
                          <p className="text-xs font-bold text-foreground truncate">
                            {item.name}
                          </p>
                        </div>
                        <span className="text-[11px] uppercase tracking-wider font-extrabold text-muted-foreground shrink-0">
                          {item.type}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-[1fr_auto] gap-2 pt-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTryOnOutfit(outfit)
                        setRequestedTab("tryon")
                      }}
                      className="min-h-[42px] py-2 px-3 rounded-xl text-xs font-black bg-pink text-white border-2 border-[#0D0F18]/20 hover:brightness-110 shadow-sm cursor-pointer"
                    >
                      🪞 Try On Mannequin
                    </button>
                    <button
                      type="button"
                      onClick={() => removeFavoriteOutfit(outfit.id)}
                      className="min-h-[42px] py-2 px-3 rounded-xl text-xs font-extrabold bg-muted text-foreground border-2 border-border hover:border-red cursor-pointer"
                    >
                      Remove ♥
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {section === "wardrobe" && (
        <>
          {/* Add Item — Photo flow with Live AI Recognition */}
      {addStep === "photo" && (
        <div className="rounded-3xl p-4 sm:p-5 space-y-3.5 shadow-xl border-2 border-border bg-card animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-black text-foreground">
                Add by Photo
              </h2>
              <p className="text-xs text-muted-foreground">
                Qwen2.5-VL detects garment type, color &amp; fabric
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                resetCorrectionFlow()
                setAddStep("closed")
                setPendingImageData(undefined)
              }}
              aria-label="Close photo scanner"
              className="w-9 h-9 rounded-xl border-2 border-border bg-muted text-foreground font-bold flex items-center justify-center cursor-pointer"
            >
              <span aria-hidden="true">✕</span>
            </button>
          </div>

          {/* Quick Demo Clothing Samples for Instant Testing */}
          <AiHostNoticeBanner
            featureName="AI Photo Scanner"
            offlineHint="Live garment photo scanning requires Qwen2.5-VL running on the host PC. Quick Test Samples still work offline."
          />

          {uploadState === "empty" && (
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-turquoise">
                Quick Test Samples:
              </span>
              <div className="grid grid-cols-3 gap-2">
                {QUICK_SAMPLES.map((sample) => (
                  <button
                    key={sample.id}
                    type="button"
                    onClick={() => void runScan({ mockSample: sample.id })}
                    className="p-2 rounded-xl border border-border bg-muted text-left transition-transform active:scale-95 hover:border-turquoise/40 cursor-pointer"
                  >
                    <img
                      src={sample.imageData}
                      alt={sample.name}
                      className="w-full h-12 object-contain rounded-lg bg-card border border-border mb-1.5"
                    />
                    <p className="text-xs font-semibold text-foreground leading-snug">
                      {sample.name}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
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
            errorMessage={scanError}
            result={
              uploadState === "success"
                ? {
                    name: detectedItem.name,
                    hex: detectedItem.color,
                    category: `${detectedItem.category} · ${detectedItem.colorName}`,
                    material: detectedItem.material,
                    source: scanSource || undefined,
                  }
                : undefined
            }
            onFileSelected={(file) => void runScan({ file })}
            onRetake={() => {
              resetCorrectionFlow()
              setScanError("")
              setScanNote("")
              setPendingImageData(undefined)
              setUploadState("empty")
              setUploadProgress(0)
            }}
            onManual={() => {
              resetCorrectionFlow()
              setAddStep("manual")
            }}
            onSave={handleSaveDetected}
            isCorrecting={correctionStep !== "idle"}
            onCorrect={() => {
              setCorrectionStep((prev) =>
                prev === "idle" ? "ask_reason" : "idle"
              )
            }}
          />

          {uploadState === "success" && correctionStep === "ask_reason" && (
            <div
              role="region"
              aria-label="Report what was wrong with the AI scan"
              className="rounded-2xl p-3.5 border-2 border-turquoise/50 bg-muted/70 space-y-3 animate-in fade-in duration-150"
            >
              <div>
                <h3 className="text-xs font-black text-foreground">
                  What was wrong with this scan?
                </h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Pick everything the AI got wrong, then enter your correction.
                </p>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {SCAN_ISSUE_OPTIONS.map((opt) => {
                  const selected = wrongIssues.includes(opt.id)
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggleWrongIssue(opt.id)}
                      className={`text-xs font-bold px-2.5 py-1.5 rounded-lg border-2 transition-all cursor-pointer ${
                        selected
                          ? "bg-pink text-white border-pink shadow-xs"
                          : "bg-card text-foreground border-border hover:border-turquoise"
                      }`}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="scan-wrong-note"
                  className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground block"
                >
                  Optional details
                </label>
                <input
                  id="scan-wrong-note"
                  type="text"
                  value={wrongNote}
                  onChange={(e) => setWrongNote(e.target.value)}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      (wrongIssues.length > 0 || wrongNote.trim())
                    ) {
                      e.preventDefault()
                      setCorrectionStep("modal")
                    }
                  }}
                  placeholder="e.g. It's a navy cardigan, not black"
                  className="w-full min-h-[38px] rounded-xl px-3 py-1.5 text-xs font-semibold text-foreground bg-card border-2 border-border focus:border-turquoise outline-none"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={resetCorrectionFlow}
                  className="min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold bg-card text-muted-foreground border-2 border-border hover:text-foreground cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={wrongIssues.length === 0 && !wrongNote.trim()}
                  onClick={() => setCorrectionStep("modal")}
                  className="flex-1 min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-black bg-turquoise text-[#0D0F18] border-2 border-[#0D0F18]/20 hover:brightness-105 disabled:opacity-45 disabled:cursor-not-allowed transition-all cursor-pointer"
                >
                  Enter Correction →
                </button>
              </div>
            </div>
          )}

          {scanNote && uploadState === "success" && (
            <p className="text-[11px] leading-relaxed text-gold font-medium">
              {scanNote}
            </p>
          )}

          {uploadState === "empty" && (
            <button
              type="button"
              onClick={() => setAddStep("manual")}
              className="w-full py-2 rounded-xl text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              Enter details manually instead →
            </button>
          )}
        </div>
      )}

      {/* Add Item — Manual Form */}
      {addStep === "manual" && (
        <form
          onSubmit={handleSaveManual}
          className="rounded-3xl p-4 sm:p-5 space-y-3.5 shadow-xl border-2 border-border bg-card animate-in fade-in duration-150"
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-foreground">
                Manual Wardrobe Entry
              </h2>
              <p className="text-[10px] text-muted-foreground">
                Log materials, care tags, and storage locations for personalized AI
                styling
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAddStep("closed")}
              aria-label="Close Manual Wardrobe Entry form"
              className="text-xs text-muted-foreground hover:text-foreground p-1.5 rounded-lg cursor-pointer"
            >
              <span aria-hidden="true">✕</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label
                htmlFor="wd-name"
                className="text-[10px] font-bold uppercase tracking-wider mb-1 block text-muted-foreground"
              >
                Garment Name *
              </label>
              <input
                id="wd-name"
                required
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                placeholder="e.g. Lavender Linen Shirt"
                className="w-full rounded-xl px-3 py-2 text-xs outline-none bg-muted text-foreground border border-border focus:border-pink transition-colors"
              />
            </div>

            <div className="col-span-2">
              <label
                htmlFor="wd-cat"
                className="text-[10px] font-bold uppercase tracking-wider mb-1 block text-muted-foreground"
              >
                Category *
              </label>
              <select
                id="wd-cat"
                value={manualCat}
                onChange={(e) => setManualCat(e.target.value as Category)}
                className="w-full rounded-xl px-3 py-2 text-xs outline-none bg-muted text-foreground border border-border focus:border-pink transition-colors"
              >
                <option value="Tops">Tops</option>
                <option value="Bottoms">Bottoms</option>
                <option value="Shoes">Shoes</option>
                <option value="Outerwear">Outerwear</option>
                <option value="Accessories">Accessories</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="wd-color-name"
                className="text-[10px] font-bold uppercase tracking-wider mb-1 block text-muted-foreground"
              >
                Color Name
              </label>
              <input
                id="wd-color-name"
                value={manualColorName}
                onChange={(e) => setManualColorName(e.target.value)}
                placeholder="e.g. Soft Lavender"
                className="w-full rounded-xl px-3 py-2 text-xs outline-none bg-muted text-foreground border border-border focus:border-pink transition-colors"
              />
            </div>

            <div>
              <label
                htmlFor="wd-color-hex"
                className="text-[10px] font-bold uppercase tracking-wider mb-1 block text-muted-foreground"
              >
                Color Swatch
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="wd-color-hex"
                  type="color"
                  aria-label="Pick garment color swatch"
                  value={manualColorHex}
                  onChange={(e) => setManualColorHex(e.target.value)}
                  className="w-9 h-8 rounded-lg cursor-pointer bg-transparent border border-border"
                />
                <span className="text-xs font-mono text-muted-foreground">
                  {manualColorHex}
                </span>
              </div>
            </div>

            <div>
              <label
                htmlFor="wd-material"
                className="text-[10px] font-bold uppercase tracking-wider mb-1 block text-muted-foreground"
              >
                Material &amp; Texture
              </label>
              <input
                id="wd-material"
                value={manualMaterial}
                onChange={(e) => setManualMaterial(e.target.value)}
                placeholder="e.g. 100% Linen, Tagless"
                className="w-full rounded-xl px-3 py-2 text-xs outline-none bg-muted text-foreground border border-border focus:border-pink transition-colors"
              />
            </div>

            <div>
              <label
                htmlFor="wd-location"
                className="text-[10px] font-bold uppercase tracking-wider mb-1 block text-muted-foreground"
              >
                Storage Location
              </label>
              <input
                id="wd-location"
                value={manualLocation}
                onChange={(e) => setManualLocation(e.target.value)}
                placeholder="e.g. Top Shelf Closet A"
                className="w-full rounded-xl px-3 py-2 text-xs outline-none bg-muted text-foreground border border-border focus:border-pink transition-colors"
              />
            </div>

            <div>
              <label
                htmlFor="wd-care"
                className="text-[10px] font-bold uppercase tracking-wider mb-1 block text-muted-foreground"
              >
                Care Instructions
              </label>
              <input
                id="wd-care"
                value={manualCare}
                onChange={(e) => setManualCare(e.target.value)}
                placeholder="e.g. Cold hand wash"
                className="w-full rounded-xl px-3 py-2 text-xs outline-none bg-muted text-foreground border border-border focus:border-pink transition-colors"
              />
            </div>

            <div>
              <label
                htmlFor="wd-sentimental"
                className="text-[10px] font-bold uppercase tracking-wider mb-1 block text-muted-foreground"
              >
                Sentimental Value
              </label>
              <select
                id="wd-sentimental"
                value={manualSentimental}
                onChange={(e) =>
                  setManualSentimental(
                    e.target.value as "Low" | "Medium" | "High"
                  )
                }
                className="w-full rounded-xl px-3 py-2 text-xs outline-none bg-muted text-foreground border border-border focus:border-pink transition-colors"
              >
                <option value="High">High (Cherished / Favorite)</option>
                <option value="Medium">Medium (Regular)</option>
                <option value="Low">Low (Basic / Everyday)</option>
              </select>
            </div>
          </div>

          <button
            type="submit"
            className="w-full min-h-[44px] py-2.5 rounded-xl text-xs font-bold transition-all hover:brightness-110 active:scale-[0.98] bg-pink text-white shadow-md shadow-pink/20 cursor-pointer"
          >
            Save Item
          </button>
        </form>
      )}

      {/* Search and Sort Toolbar */}
      <div className="space-y-1.5">
        <div className="relative w-full">
          <label htmlFor="wardrobe-search" className="sr-only">
            Search clothes by name or color
          </label>
          <span
            aria-hidden="true"
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground"
          >
            🔍
          </span>
          <input
            id="wardrobe-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clothes or colors…"
            className="w-full min-h-[42px] rounded-xl pl-9 pr-8 py-2 text-xs font-semibold outline-none transition-colors bg-muted text-foreground border-2 border-border focus:border-turquoise"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear search query"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-foreground p-1.5 rounded cursor-pointer"
            >
              <span aria-hidden="true">✕</span>
            </button>
          )}
        </div>

        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setFavoritesOnly(!favoritesOnly)}
              aria-pressed={favoritesOnly}
              aria-label="Filter favorites only"
              className={`min-h-[42px] px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all border-2 cursor-pointer ${
                favoritesOnly
                  ? "bg-pink text-white border-[#0D0F18]/20 dark:border-white/30 shadow-md shadow-pink/25"
                  : "bg-muted text-foreground border-border hover:border-pink"
              }`}
              title="Filter favorites only"
            >
              <span aria-hidden="true">{favoritesOnly ? "♥" : "♡"}</span>
              <span>Favorites</span>
            </button>

            <button
              type="button"
              onClick={() => setSensoryOnly(!sensoryOnly)}
              aria-pressed={sensoryOnly}
              aria-label="Filter sensory-safe soft breathable clothes only"
              className={`min-h-[42px] px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all border-2 cursor-pointer ${
                sensoryOnly
                  ? "bg-green text-white border-[#0D0F18]/20 dark:border-white/30 shadow-md shadow-green/25"
                  : "bg-muted text-foreground border-border hover:border-green"
              }`}
              title="Filter soft fabrics only"
            >
              <span aria-hidden="true">🌿</span>
              <span>Sensory-Safe</span>
            </button>
          </div>

          <select
            aria-label="Sort wardrobe items"
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="w-full min-h-[42px] px-3 rounded-xl text-xs font-bold outline-none border-2 border-border bg-muted text-foreground"
          >
            <option value="newest">Sort: Newest First</option>
            <option value="most_worn">Sort: Most Worn</option>
            <option value="least_worn">Sort: Least Worn</option>
            <option value="name">Sort: A–Z Name</option>
          </select>
        </div>

        {/* Category Pills */}
        <div
          role="tablist"
          aria-label="Filter wardrobe by category"
          className="flex gap-1.5 overflow-x-auto pb-0.5 no-scrollbar"
        >
          {CATS.map((c) => {
            const active = cat === c
            return (
              <button
                key={c}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setCat(c)}
                className={`shrink-0 min-h-[38px] px-3 py-1.5 rounded-full text-xs font-extrabold border-2 transition-all cursor-pointer ${
                  active
                    ? "bg-pink text-white border-[#0D0F18]/20 dark:border-white/30 shadow-md shadow-pink/25"
                    : "bg-muted text-foreground border-border hover:border-pink"
                }`}
              >
                {c !== "All" && (
                  <span aria-hidden="true" className="mr-1">
                    {CATEGORY_EMOJI[c]}
                  </span>
                )}
                {c}
              </button>
            )
          })}
        </div>
      </div>

      {/* Wardrobe Items Grid */}
      <div className="grid grid-cols-1 min-[340px]:grid-cols-2 gap-2.5">
        {filtered.map((item) => {
          const sensory = getSensoryInfo(item.name, item.material)
          return (
            <div
              key={item.id}
              role="button"
              tabIndex={0}
              aria-label={`${item.name}, ${item.category}, ${item.colorName}, worn ${item.worn} times. Tap for details.`}
              onClick={() => setSelectedItem(item)}
              onKeyDown={(e) => {
                if (
                  e.target === e.currentTarget &&
                  (e.key === "Enter" || e.key === " ")
                ) {
                  e.preventDefault()
                  setSelectedItem(item)
                }
              }}
              className="rounded-2xl overflow-hidden flex flex-col border-2 border-border bg-card shadow-sm cursor-pointer transition-all hover:scale-[1.01] hover:border-turquoise group text-left"
            >
              {/* Garment Visual Header (Photo thumbnail if present, else color swatch + emoji) */}
              <div
                className={`h-24 relative flex items-center justify-center border-b-2 border-border overflow-hidden ${
                  item.imageData ? "p-1" : "p-2"
                }`}
                style={{
                  background: item.imageData ? "#F6F5F9" : item.color,
                }}
              >
                {item.imageData ? (
                  <img
                    src={item.imageData}
                    alt={item.name}
                    className="h-full w-full object-contain group-hover:scale-105 transition-transform"
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="text-3xl drop-shadow-sm group-hover:scale-110 transition-transform"
                  >
                    {CATEGORY_EMOJI[item.category] ?? "👗"}
                  </span>
                )}

                {/* Favorite Heart Button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleFavorite(item.id)
                  }}
                  aria-pressed={item.favorite}
                  className={`absolute top-1.5 right-1.5 w-8 h-8 rounded-full flex items-center justify-center text-xs backdrop-blur-md transition-transform active:scale-90 text-white border-2 border-white/40 cursor-pointer ${
                    item.favorite
                      ? "bg-pink shadow-md shadow-pink/30"
                      : "bg-black/55 hover:bg-black/75"
                  }`}
                  aria-label={
                    item.favorite
                      ? `Remove ${item.name} from favorites`
                      : `Add ${item.name} to favorites`
                  }
                >
                  <span aria-hidden="true">{item.favorite ? "♥" : "♡"}</span>
                </button>

                {/* Status Badge */}
                {item.worn < 5 && (
                  <span className="absolute bottom-1.5 left-1.5 px-2 py-0.5 rounded-md text-[10px] min-[380px]:text-[11px] font-extrabold uppercase bg-[#0D0F18]/90 text-[#2ED38B] leading-none">
                    Unworn
                  </span>
                )}
              </div>

              {/* Info Area */}
              <div className="p-2.5 flex-1 flex flex-col justify-between gap-1.5">
                <p className="text-[14px] min-[380px]:text-[15px] font-extrabold text-foreground line-clamp-2 leading-snug">
                  {item.name}
                </p>

                <div className="flex flex-wrap gap-1">
                  {getClosetItemTags(item).map((tag, tagIdx) => (
                    <span
                      key={`${item.id}-tag-${tagIdx}`}
                      className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-muted text-muted-foreground border border-border leading-tight"
                    >
                      {tag}
                    </span>
                  ))}
                  {user.accessibility.highContrastColors && (
                    <span className="px-2 py-0.5 rounded-md bg-foreground text-background font-bold text-[10px] font-mono border border-border leading-tight">
                      {item.color}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-10 rounded-3xl border-2 border-dashed border-border p-6 bg-card/50">
          <span aria-hidden="true" className="text-3xl">
            👗
          </span>
          <p className="text-sm font-extrabold text-foreground mt-2">
            No matching clothes
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Try clearing filters or add a new item.
          </p>
          <button
            type="button"
            onClick={() => setAddStep("photo")}
            className="mt-3 min-h-[42px] px-4 py-2 rounded-xl text-xs font-black bg-pink text-white border-2 border-[#0D0F18]/20 hover:brightness-110 shadow-md shadow-pink/20 transition-all cursor-pointer"
          >
            + Add Item
          </button>
        </div>
      )}
        </>
      )}

      {/* Item Detail Modal */}
      {selectedItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => {
            stopSpeaking()
            setSpeakingItem(false)
            setSelectedItem(null)
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="wardrobe-item-modal-title"
            className="rounded-3xl p-5 sm:p-6 max-w-sm w-full space-y-4 shadow-2xl border-2 border-border bg-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-md shrink-0 border-2 border-border overflow-hidden"
                  style={{
                    background: selectedItem.imageData
                      ? "var(--muted)"
                      : selectedItem.color,
                  }}
                >
                  {selectedItem.imageData ? (
                    <img
                      src={selectedItem.imageData}
                      alt={selectedItem.name}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <span aria-hidden="true" className="text-2xl">
                      {CATEGORY_EMOJI[selectedItem.category] ?? "👗"}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <h2
                    id="wardrobe-item-modal-title"
                    className="text-base font-bold text-foreground leading-tight"
                  >
                    {selectedItem.name}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {selectedItem.category} · {selectedItem.colorName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  stopSpeaking()
                  setSpeakingItem(false)
                  setSelectedItem(null)
                }}
                aria-label="Close garment details dialog"
                className="text-xs text-muted-foreground hover:text-foreground p-1.5 rounded-lg shrink-0 cursor-pointer"
              >
                <span aria-hidden="true">✕</span>
              </button>
            </div>

            {/* Audio description action for low vision */}
            {showListen && (
              <button
                type="button"
                onClick={() => {
                  if (speakingItem) {
                    stopSpeaking()
                    setSpeakingItem(false)
                    return
                  }
                  const sensory = getSensoryInfo(
                    selectedItem.name,
                    selectedItem.material
                  )
                  const text = `${selectedItem.name}. ${selectedItem.category}, color ${selectedItem.colorName}. Material: ${selectedItem.material || "Standard Cotton"}. Comfort note: ${sensory.label}. Stored at ${selectedItem.storageLocation || "Main Closet"}. Care: ${selectedItem.careInstructions || "Cold wash"}. Worn ${selectedItem.worn} times.`
                  const started = speakText(text, () => setSpeakingItem(false))
                  if (started) {
                    setSpeakingItem(true)
                  } else {
                    showToast(
                      "Audio Unavailable",
                      "Voice narration is not supported in this browser.",
                      "warning"
                    )
                  }
                }}
                aria-pressed={speakingItem}
                aria-label={
                  speakingItem
                    ? "Stop reading garment details aloud"
                    : `Listen to description for ${selectedItem.name} read aloud`
                }
                className={`w-full min-h-[44px] py-2.5 px-3 rounded-xl text-xs font-bold border-2 flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  speakingItem
                    ? "bg-pink text-white border-pink shadow-xs"
                    : "bg-turquoise text-accent-foreground border-turquoise shadow-xs hover:opacity-90"
                }`}
              >
                <span aria-hidden="true">{speakingItem ? "⏹" : "🔊"}</span>
                <span>{speakingItem ? "Stop" : "Listen"}</span>
              </button>
            )}

            {/* Spec Details */}
            <div className="space-y-2 text-xs">
              <div className="p-2.5 rounded-xl bg-muted border border-border flex justify-between">
                <span className="text-muted-foreground">Times Worn:</span>
                <span className="font-bold text-foreground">
                  {selectedItem.worn} times
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-muted border border-border flex justify-between">
                <span className="text-muted-foreground">Storage Location:</span>
                <span className="font-semibold text-foreground">
                  {selectedItem.storageLocation || "Main Closet"}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-muted border border-border flex justify-between">
                <span className="text-muted-foreground">
                  Fabric &amp; Material:
                </span>
                <span className="font-semibold text-foreground">
                  {selectedItem.material || "Standard Cotton"}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-muted border border-border flex justify-between gap-2">
                <span className="text-muted-foreground shrink-0">
                  Care Instructions:
                </span>
                <span className="font-semibold text-foreground truncate text-right">
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
                    "success"
                  )
                  setSelectedItem((prev) =>
                    prev ? { ...prev, worn: prev.worn + 1 } : null
                  )
                }}
                className="min-h-[44px] py-2.5 rounded-xl text-xs font-bold text-white bg-green hover:brightness-110 shadow-md shadow-green/20 transition-all cursor-pointer"
              >
                +1 Worn
              </button>

              <button
                type="button"
                onClick={() => {
                  toggleFavorite(selectedItem.id)
                  setSelectedItem((prev) =>
                    prev ? { ...prev, favorite: !prev.favorite } : null
                  )
                }}
                className="min-h-[44px] py-2.5 rounded-xl text-xs font-bold text-foreground bg-muted border border-border hover:bg-muted/80 transition-colors cursor-pointer"
              >
                {selectedItem.favorite ? "♥ Favorited" : "♡ Favorite"}
              </button>

              <button
                type="button"
                onClick={() => {
                  stopSpeaking()
                  setSpeakingItem(false)
                  deleteWardrobeItem(selectedItem.id)
                  setSelectedItem(null)
                }}
                className="col-span-2 py-2 rounded-xl text-xs font-semibold text-red hover:underline transition-colors cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Scan Correction Popup Modal */}
      <WardrobeScanCorrectionModal
        isOpen={
          addStep === "photo" &&
          uploadState === "success" &&
          correctionStep === "modal"
        }
        onClose={() => setCorrectionStep("idle")}
        onBack={() => setCorrectionStep("ask_reason")}
        detectedItem={detectedItem}
        imagePreview={pendingImageData}
        issueIds={wrongIssues}
        issueNote={wrongNote}
        onApplyPreview={(corrected) => {
          setDetectedItem(corrected)
          setScanSource("user-corrected")
          resetCorrectionFlow()
          showToast(
            "Preview Updated",
            "Review the updated details, then tap Confirm & Save.",
            "info"
          )
        }}
        onSaveCorrected={(corrected) => {
          saveScanItemToWardrobe(corrected, "user correction")
        }}
      />
    </div>
  )
}
