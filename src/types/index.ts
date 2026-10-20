export type PersonaId = "eliora" | "ethan" | "jordan" | "josephine" | "areeba"

export interface UserProfile {
  id: PersonaId
  name: string
  initials: string
  email: string
  avatarBg: string
  roleTitle: string
  preferredStyle: string
  typicalSizes: string
  homeClimate: string
  stylistNotes: string
  accessibility: {
    highContrastColors: boolean
    sensorySensitive: boolean
    lowDecisionMode: boolean
    voiceNarration: boolean
  }
}

export type Category = "Tops" | "Bottoms" | "Shoes" | "Outerwear" | "Accessories"

export interface WardrobeItem {
  id: number
  name: string
  category: Category
  color: string
  colorName: string
  worn: number
  favorite: boolean
  material?: string
  storageLocation?: string
  careInstructions?: string
  sentimentalValue?: "Low" | "Medium" | "High"
  cost?: string
  lastWorn?: string
  status?: "clean" | "dirty" | "washing"
}

export interface OutfitItem {
  type: string
  desc: string
  color: string
  emoji: string
  reason: string
}

export interface Outfit {
  id?: number | string
  direction: string
  label: string
  tagline: string
  rationale: string
  items: OutfitItem[]
  accent: string
  bg: string
  isCustom?: boolean
  whyDetails?: {
    weatherReason: string
    colorHarmony: string
    wearFrequency: string
    sensoryComfort: string
  }
}

export interface RecentLook {
  id: string
  day: string
  date: string
  color: string
  items: string[]
  direction: string
  occasion?: string
}

export interface AppNotification {
  id: string
  type: "info" | "success" | "warning"
  title: string
  message: string
  timestamp: string
}

export type Direction = string

export interface WeatherData {
  city: string
  temp: string
  condition: string
  advice: string
  icon: string
}

export function getContrastTextColor(hexBg: string): string {
  if (!hexBg) return "#ffffff"
  const clean = hexBg.replace("#", "").slice(0, 6)
  if (clean.length === 6) {
    const r = parseInt(clean.substring(0, 2), 16)
    const g = parseInt(clean.substring(2, 4), 16)
    const b = parseInt(clean.substring(4, 6), 16)
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    return luminance > 0.62 ? "#0D0F18" : "#ffffff"
  }
  return "#ffffff"
}
