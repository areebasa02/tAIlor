import type { GarmentFitStyle, MannequinCustomization } from "../types"

/**
 * Dynamic body measurements & garment ease calculator for the 2D Pose Studio.
 * Derives approximate silhouette measurements from the user's 5 body-proportion
 * sliders (estimate / demo — not a tailor's tape substitute).
 */
export type MeasurementUnit = "in" | "cm"

export type BodyMeasurements = {
  heightCm: number
  chestCm: number
  waistCm: number
  hipCm: number
  inseamCm: number
  shoulderCm: number
}

export type EaseProfile = {
  label: string
  chestEaseCm: number
  waistEaseCm: number
  hipEaseCm: number
  drapeScale: number
  promptDesc: string
  note: string
}

export const FIT_EASE: Record<GarmentFitStyle, EaseProfile> = {
  fitted: {
    label: "Fitted",
    chestEaseCm: 2,
    waistEaseCm: 1,
    hipEaseCm: 2,
    drapeScale: 0.95,
    promptDesc: "tailored close-fitting silhouette",
    note: "Close contour, minimal excess fabric",
  },
  standard: {
    label: "Standard",
    chestEaseCm: 6,
    waistEaseCm: 4,
    hipEaseCm: 5,
    drapeScale: 1.05,
    promptDesc: "classic regular tailored fit",
    note: "Natural wearable ease",
  },
  relaxed: {
    label: "Relaxed",
    chestEaseCm: 12,
    waistEaseCm: 10,
    hipEaseCm: 11,
    drapeScale: 1.18,
    promptDesc: "relaxed oversized loose drape",
    note: "Extra volume at torso and hips",
  },
}

export function inferFitStyleFromProfile(fitFeel?: string): GarmentFitStyle {
  const hay = (fitFeel || "").trim().toLowerCase()
  if (!hay) return "standard"
  if (/(relax|loose|roomy|oversize|flowy|boxy)/.test(hay)) return "relaxed"
  if (/(fit|snug|slim|tailored|form|contour)/.test(hay)) return "fitted"
  return "standard"
}

export function deriveBodyMeasurements(
  customization: Pick<
    MannequinCustomization,
    "height" | "shoulders" | "chest" | "waistHips" | "limbBuild"
  >,
): BodyMeasurements {
  const h = customization.height || 1
  const sh = customization.shoulders || 1
  const ch = customization.chest || 1
  const wh = customization.waistHips || 1
  const lb = customization.limbBuild || 1

  return {
    heightCm: Math.round(172 * h),
    chestCm: Math.round(94 * (0.72 * ch + 0.28 * sh)),
    waistCm: Math.round(76 * (0.68 * wh + 0.32 * ch)),
    hipCm: Math.round(98 * (0.78 * wh + 0.22 * lb)),
    inseamCm: Math.round(78 * h),
    shoulderCm: Math.round(42 * sh),
  }
}

export function formatMeasurement(
  cm: number,
  unit: MeasurementUnit,
  isHeight = false,
): string {
  if (unit === "cm") return `${cm} cm`
  const totalInches = cm / 2.54
  if (isHeight) {
    let feet = Math.floor(totalInches / 12)
    let inches = Math.round(totalInches - feet * 12)
    if (inches === 12) {
      feet += 1
      inches = 0
    }
    return `${feet}'${inches}"`
  }
  const halfStep = Math.round(totalInches * 2) / 2
  return `${Number.isInteger(halfStep) ? halfStep.toFixed(0) : halfStep.toFixed(1)}"`
}

export function formatEaseValue(cm: number, unit: MeasurementUnit): string {
  if (unit === "cm") return `${cm} cm`
  const inches = Math.round((cm / 2.54) * 2) / 2
  return `${Number.isInteger(inches) ? inches.toFixed(0) : inches.toFixed(1)}"`
}

export function suggestSizes(m: BodyMeasurements): {
  tops: string
  bottoms: string
  dress: string
} {
  const chest = m.chestCm
  let tops = "M"
  if (chest < 84) tops = "XS"
  else if (chest < 92) tops = "S"
  else if (chest < 100) tops = "M"
  else if (chest < 108) tops = "L"
  else if (chest < 116) tops = "XL"
  else if (chest < 124) tops = "2XL"
  else tops = "3XL+"

  const hip = m.hipCm
  let bottoms = "30"
  let dress = "M (8–10)"
  if (hip < 90) {
    bottoms = "26–28"
    dress = "XS (2–4)"
  } else if (hip < 98) {
    bottoms = "28–30"
    dress = "S (4–6)"
  } else if (hip < 106) {
    bottoms = "30–32"
    dress = "M (8–10)"
  } else if (hip < 114) {
    bottoms = "32–34"
    dress = "L (12–14)"
  } else if (hip < 122) {
    bottoms = "34–36"
    dress = "XL (16–18)"
  } else {
    bottoms = "36+"
    dress = "2XL+"
  }

  return { tops, bottoms, dress }
}

export function fitIndicator(
  fit: GarmentFitStyle,
  m: BodyMeasurements,
  unit: MeasurementUnit = "in",
): { status: "close" | "natural" | "roomy"; summary: string } {
  const e = FIT_EASE[fit] || FIT_EASE.standard
  if (fit === "fitted") {
    return {
      status: "close",
      summary: `Close contour · garment chest ~${formatMeasurement(m.chestCm + e.chestEaseCm, unit)} (+${formatEaseValue(e.chestEaseCm, unit)} ease)`,
    }
  }
  if (fit === "relaxed") {
    return {
      status: "roomy",
      summary: `Roomy drape · garment hip ~${formatMeasurement(m.hipCm + e.hipEaseCm, unit)} (+${formatEaseValue(e.hipEaseCm, unit)} ease)`,
    }
  }
  return {
    status: "natural",
    summary: `Natural ease · garment waist ~${formatMeasurement(m.waistCm + e.waistEaseCm, unit)} (+${formatEaseValue(e.waistEaseCm, unit)} ease)`,
  }
}
