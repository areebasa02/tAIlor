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
  id?: number
  direction: "safe" | "stylish" | "rediscover" | "event"
  label: string
  tagline: string
  rationale: string
  items: OutfitItem[]
  accent: string
  bg: string
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
