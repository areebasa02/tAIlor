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
