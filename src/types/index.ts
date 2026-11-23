export type PersonaId = "eliora" | "ethan" | "jordan" | "josephine" | "areeba"

export interface ColorStats {
  palette: string
  swatches: string[]
  mean_L: number
  L_range: number
  mean_chroma: number
  mean_b: number
  range_label: "wide" | "medium" | "narrow"
  temperature: "near-neutral" | "warm-leaning" | "cool-leaning" | "balanced"
}

export interface DerivedProfile {
  color?: ColorStats
  ui: {
    color_names: boolean
    high_contrast_ui: boolean
  }
  filters: {
    soft_fabric: boolean
    easy_closures: boolean
    fit_feel?: string
  }
  consent: {
    outfit_history: boolean
    item_photo_ai: boolean
    tryon_camera: boolean
    sizes: boolean
  }
  stylist: {
    context?: string
    dresscode_help?: string
    mood_exploratory?: string
    explain_default?: "none" | "short" | "full" | "tap"
    confidence_display?: "percent" | "words" | "unsure" | "hide"
    contrast_pref?: string
  }
  wardrobe: {
    attribute_terms?: string[]
    item_fields?: string[]
  }
}

export interface QuizResult {
  path: "privacy" | "short" | "long" | "guest"
  answers: Record<string, any>
  derived: DerivedProfile
  seconds_per_question: Record<string, number>
}

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
    largeText?: boolean
    visionImpairment?: boolean
  }
  quizProfile?: QuizResult
}

export type Category =
  | "Tops"
  | "Bottoms"
  | "Full Body"
  | "Shoes"
  | "Outerwear"
  | "Accessories"

export interface WardrobeItem {
  id: number
  name: string
  category: Category
  color: string
  colorName: string
  imageData?: string
  worn: number
  favorite: boolean
  material?: string
  storageLocation?: string
  careInstructions?: string
  sentimentalValue?: "Low" | "Medium" | "High"
  cost?: string
  lastWorn?: string
  status?: "clean" | "dirty" | "washing"
  formality?: "formal" | "business" | "smart-casual" | "casual"
}

export interface LaundryMachineProfile {
  loaderType: "front" | "top_impeller" | "top_agitator"
  waterTemp: "cold" | "cool" | "warm"
  spinSpeed: "low" | "medium" | "high"
  delicateMeshBag: boolean
  notes: string
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
  /** ISO calendar day (YYYY-MM-DD) when known — used by the outfit calendar. */
  wornOn?: string
}

/** One logged outfit wear on a specific calendar day. */
export interface OutfitWearEntry {
  id: string
  outfitKey: string
  label: string
  wornOn: string
  color: string
  items: string[]
  direction?: string
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
  tempF?: number
  feelsLikeF?: number
  condition: string
  conditionLabel?: string
  humidity?: number
  windMph?: number
  weatherCode?: number
  advice: string
  ruleAdvice?: string
  adviceSource?: "ai" | "rule" | "preset"
  adviceModel?: string
  icon: string
  lat?: number
  lon?: number
  timeZone?: string
  locationSource?: "gps" | "city" | "ip" | "last-known" | "hammond" | "fallback"
}

export interface CalendarEvent {
  id: string
  summary: string
  dtstart: string
  dtend: string
  location: string
  description: string
  allDay?: boolean
  timeLabel?: string
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

export type FontScale = "xs" | "sm" | "md" | "lg" | "xl"
export type AccessibleFont = "nunito" | "atkinson" | "lexend" | "opendyslexic" | "system"

export interface FeedbackRecord {
  id: string
  type: "outfit" | "garment"
  targetId: string
  targetName: string
  reasons: string[]
  notes: string
  timestamp: string
}

export interface FavoriteOutfitItem {
  type: string
  name: string
  color: string
  emoji: string
  imageData?: string
  wardrobeItemId?: number
}

export interface FavoriteOutfit {
  id: string
  label: string
  tagline: string
  colors: string[]
  items: FavoriteOutfitItem[]
  createdAt?: string
}

export type MannequinBodyPreset =
  | "petite"
  | "standard"
  | "athletic"
  | "curvy"
  | "tall"

export type MannequinMaterialId =
  | "porcelain"
  | "bisque"
  | "sand"
  | "tan"
  | "espresso"
  | "walnut"
  | "charcoal"

export interface MannequinCustomization {
  bodyPreset: MannequinBodyPreset
  height: number
  shoulders: number
  chest: number
  waistHips: number
  limbBuild: number
  materialId: MannequinMaterialId
  includeMyFace: boolean
  faceImageData?: string
}

export type PoseJointId =
  | "nose"
  | "neck"
  | "shoulderL"
  | "shoulderR"
  | "elbowL"
  | "elbowR"
  | "wristL"
  | "wristR"
  | "pelvis"
  | "hipL"
  | "hipR"
  | "kneeL"
  | "kneeR"
  | "ankleL"
  | "ankleR"

export type PosePoint2D = [number, number]

export type Pose2D = Record<PoseJointId, PosePoint2D>

/** Legacy aliases retained temporarily for local state typing */
export type MannequinJointId = PoseJointId
export type MannequinPose = Pose2D