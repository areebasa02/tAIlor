import type { WardrobeItem } from "../types"
import { THEME_COLORS } from "../types/theme"

/** Check whether the browser Web Speech API is available. */
export function isSpeechSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof SpeechSynthesisUtterance !== "undefined"
  )
}

/** Cancel any active speech synthesis utterance. */
export function stopSpeaking(): void {
  if (!isSpeechSupported()) return
  window.speechSynthesis.cancel()
}

/** Speak text aloud using browser Web Speech API; returns false when unsupported. */
export function speakText(text: string, onEnd?: () => void): boolean {
  if (!isSpeechSupported() || !text.trim()) {
    return false
  }
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.rate = 0.98
  if (onEnd) {
    utterance.onend = () => onEnd()
    utterance.onerror = () => onEnd()
  }
  window.speechSynthesis.speak(utterance)
  return true
}

const KNOWN_COLOR_NAMES: Record<string, string> = {
  "var(--pink)": "Magenta Pink",
  "var(--turquoise)": "Deep Teal",
  "var(--dark-teal)": "Deep Teal",
  "var(--green)": "Forest Green",
  "var(--rose)": "Dusty Rose",
  "var(--gold)": "Warm Gold",
  "var(--red)": "Crimson Red",
  [THEME_COLORS.pink.toLowerCase()]: "Magenta Pink",
  [THEME_COLORS.turquoise.toLowerCase()]: "Bright Turquoise",
  [THEME_COLORS.darkTeal.toLowerCase()]: "Deep Teal",
  [THEME_COLORS.green.toLowerCase()]: "Forest Green",
  [THEME_COLORS.rose.toLowerCase()]: "Dusty Rose",
  [THEME_COLORS.gold.toLowerCase()]: "Warm Gold",
  [THEME_COLORS.red.toLowerCase()]: "Crimson Red",
  "#ce005a": "Magenta Pink",
  "#d13375": "Vivid Rose Pink",
  "#1a1a2e": "Midnight Black",
  "#111111": "Jet Black",
  "#0d0f18": "Deep Obsidian",
  "#e8e8e8": "Crisp White",
  "#f2f2f2": "Crisp White",
  "#f7f7f7": "Pure White",
  "#f5f1e6": "Warm Ivory",
  "#f1e7d3": "Soft Cream",
  "#c8965a": "Warm Camel",
  "#c19a6b": "Warm Camel",
  "#b8825a": "Cognac Tan",
  "#4a6fa5": "Medium Denim Blue",
  "#2b4b8c": "Classic Navy",
  "#1f2a44": "Deep Navy",
  "#6a1a32": "Deep Burgundy",
  "#007880": "Deep Teal",
  "#00897b": "Rich Teal",
  "#76e09a": "Fresh Mint",
  "#da400c": "Rust Terracotta",
  "#ffcb44": "Warm Gold",
  "#e2828f": "Pastel Dusty Pink",
}

/**
 * Translate raw hex codes or CSS variables into plain-English color labels,
 * preferring an exact or partial match from the user's wardrobe when available.
 */
export function getReadableColorLabel(
  rawColor: string,
  itemDesc?: string,
  wardrobe?: WardrobeItem[],
): string {
  if (itemDesc && wardrobe?.length) {
    const target = itemDesc.trim().toLowerCase()
    const matched =
      wardrobe.find((w) => w.name.toLowerCase() === target) ||
      wardrobe.find(
        (w) =>
          target.includes(w.name.toLowerCase()) ||
          w.name.toLowerCase().includes(target),
      )
    if (matched) {
      return `${matched.colorName} (${matched.color})`
    }
  }

  const normalized = (rawColor || "").trim().toLowerCase()
  const mappedName = KNOWN_COLOR_NAMES[normalized]
  if (mappedName) {
    return normalized.startsWith("#")
      ? `${mappedName} (${rawColor.toUpperCase()})`
      : mappedName
  }

  return rawColor || "Neutral shade"
}

export interface SensoryAssessment {
  label: string
  isSoft: boolean
  summary: string
}

const SOFT_KEYWORDS = [
  "cotton",
  "linen",
  "modal",
  "bamboo",
  "viscose",
  "soft",
  "tagless",
  "relaxed",
  "knit",
  "mock-neck",
  "scoop",
  "tee",
  "cardigan",
  "sneaker",
  "loafer",
  "wide-leg",
  "wide trousers",
  "crepe",
]

const STRUCTURED_KEYWORDS = [
  "blazer",
  "trench",
  "oxford",
  "pointed-toe",
  "platform",
  "structured",
]

/** Assess fabric/silhouette comfort for sensory-sensitive and neurodivergent users. */
export function getSensoryInfo(
  itemDesc: string,
  material?: string,
): SensoryAssessment {
  const combined = `${itemDesc} ${material || ""}`.toLowerCase()

  const hasExplicitSoftOverride =
    combined.includes("tagless") ||
    combined.includes("soft") ||
    combined.includes("modal") ||
    combined.includes("bamboo")

  const isStructured =
    !hasExplicitSoftOverride &&
    STRUCTURED_KEYWORDS.some((kw) => combined.includes(kw))

  if (isStructured) {
    return {
      label: "Structured Fit: Layer for Comfort",
      isSoft: false,
      summary: "Tailored silhouette; pair with a soft base layer",
    }
  }

  const isSoft = SOFT_KEYWORDS.some((kw) => combined.includes(kw))
  if (isSoft) {
    return {
      label: "Sensory-Safe: Soft & Breathable",
      isSoft: true,
      summary: "Gentle texture, low seam friction",
    }
  }

  return {
    label: "Structured Fit: Layer for Comfort",
    isSoft: false,
    summary: "Tailored silhouette; pair with a soft base layer",
  }
}

/**
 * Derive 2–3 concise selection tags explaining why a garment was picked for an outfit.
 * Replaces generic category ("Bottom") and binary comfort ("Soft") labels.
 */
export function getOutfitItemSelectionTags(
  item: { type: string; desc: string; color: string; reason?: string },
  matchedItem?: WardrobeItem,
  weatherTemp?: string,
): string[] {
  const tags: string[] = []
  const pushTag = (t?: string) => {
    if (!t) return
    const clean = t.trim()
    if (!clean) return
    if (!tags.some((existing) => existing.toLowerCase() === clean.toLowerCase())) {
      tags.push(clean)
    }
  }

  const combined = `${item.desc} ${item.reason || ""} ${matchedItem?.material || ""}`.toLowerCase()

  // 1. Fabric / silhouette highlight
  if (matchedItem?.material) {
    const firstPart = matchedItem.material.split(",")[0].split("(")[0].trim()
    if (firstPart && firstPart.length <= 22) {
      pushTag(firstPart)
    }
  }
  if (tags.length === 0) {
    if (combined.includes("denim") || combined.includes("jean")) pushTag("Stretch denim")
    else if (combined.includes("linen")) pushTag("Airy linen")
    else if (combined.includes("knit") || combined.includes("ribbed")) pushTag("Textured knit")
    else if (combined.includes("leather")) pushTag("Polished leather")
    else if (combined.includes("cotton")) pushTag("Breathable cotton")
    else if (combined.includes("satin") || combined.includes("silk")) pushTag("Lustrous drape")
    else if (combined.includes("memory foam") || combined.includes("cushioned")) pushTag("Cushioned sole")
  }

  // 2. Selection-reason cue
  if (combined.includes("water-resistant") || combined.includes("wind") || combined.includes("insulated") || combined.includes("shield")) {
    pushTag("Weather shield")
  } else if (combined.includes("unworn") || (matchedItem && matchedItem.worn < 5)) {
    pushTag("Fresh rotation")
  } else if (combined.includes("breathable") || combined.includes("airy")) {
    pushTag("Breathable")
  } else if (combined.includes("stretch") || combined.includes("flexible") || combined.includes("all-day")) {
    pushTag("All-day ease")
  } else if (combined.includes("polished") || combined.includes("tailored") || combined.includes("executive") || combined.includes("sharp")) {
    pushTag("Tailored line")
  } else if (combined.includes("cozy") || combined.includes("soft") || combined.includes("tagless")) {
    pushTag("Gentle feel")
  } else if (combined.includes("balanced") || combined.includes("monotony") || combined.includes("contrast") || combined.includes("palette") || combined.includes("pastel")) {
    pushTag("Palette anchor")
  }

  // 3. Weather / wear frequency / formality fallback so every item has 2-3 useful tags
  if (weatherTemp && tags.length < 3) {
    const tempMatch = weatherTemp.match(/-?\d+\s*°[FC]?/i)
    if (tempMatch) {
      pushTag(`${tempMatch[0].replace(/\s+/g, "")} fit`)
    }
  }
  if (matchedItem?.formality && tags.length < 3) {
    const f = matchedItem.formality.replace("-", " ")
    pushTag(f.charAt(0).toUpperCase() + f.slice(1))
  }
  if (matchedItem && tags.length < 3) {
    pushTag(matchedItem.worn >= 12 ? "Most worn staple" : `${matchedItem.worn}× worn`)
  }
  if (tags.length < 2 && item.reason) {
    const words = item.reason.replace(/[.!,;:—-]+/g, " ").trim().split(/\s+/).slice(0, 2).join(" ")
    pushTag(words)
  }

  return tags.slice(0, 3)
}

/**
 * Derive concise display tags for Closet item cards without category or "Soft" badges.
 */
export function getClosetItemTags(item: WardrobeItem): string[] {
  const tags: string[] = []
  if (item.colorName) {
    tags.push(item.colorName)
  }
  if (item.material) {
    const mat = item.material.split(",")[0].split("(")[0].trim()
    if (mat && mat.length <= 22) {
      tags.push(mat)
    }
  }
  tags.push(`${item.worn}× worn`)
  return tags.slice(0, 3)
}
