/**
 * Approximate body measurements from the MakeHuman 1.72 m meter-frame body.
 * Values are derived from the base mesh silhouette (cm). Used for size/ease UI —
 * not a tailor's tape substitute.
 */
export type BodyMeasurements = {
  heightCm: number
  chestCm: number
  waistCm: number
  hipCm: number
  inseamCm: number
  shoulderCm: number
}

/** Static measurements for the Surface makehuman-body.glb (1.72 m). */
export const SURFACE_BODY_MEASUREMENTS: BodyMeasurements = {
  heightCm: 172,
  chestCm: 94,
  waistCm: 76,
  hipCm: 98,
  inseamCm: 78,
  shoulderCm: 42,
}

export type EaseProfile = {
  label: string
  chestEaseCm: number
  waistEaseCm: number
  hipEaseCm: number
  note: string
}

export const FIT_EASE: Record<"fitted" | "standard" | "relaxed", EaseProfile> = {
  fitted: {
    label: "Fitted",
    chestEaseCm: 2,
    waistEaseCm: 1,
    hipEaseCm: 2,
    note: "Close contour, minimal excess fabric",
  },
  standard: {
    label: "Standard",
    chestEaseCm: 6,
    waistEaseCm: 4,
    hipEaseCm: 5,
    note: "Natural wearable ease",
  },
  relaxed: {
    label: "Relaxed",
    chestEaseCm: 12,
    waistEaseCm: 10,
    hipEaseCm: 11,
    note: "Extra volume at torso and hips",
  },
}

/** Suggest garment size band from chest (tops) / hip (bottoms). */
export function suggestSizes(m: BodyMeasurements): { tops: string; bottoms: string } {
  const chest = m.chestCm
  let tops = "M"
  if (chest < 84) tops = "XS"
  else if (chest < 92) tops = "S"
  else if (chest < 100) tops = "M"
  else if (chest < 108) tops = "L"
  else if (chest < 116) tops = "XL"
  else tops = "2XL+"

  const hip = m.hipCm
  let bottoms = "30"
  if (hip < 90) bottoms = "26–28"
  else if (hip < 98) bottoms = "28–30"
  else if (hip < 106) bottoms = "30–32"
  else if (hip < 114) bottoms = "32–34"
  else bottoms = "34+"

  return { tops, bottoms }
}

export function fitIndicator(
  fit: "fitted" | "standard" | "relaxed",
  m: BodyMeasurements = SURFACE_BODY_MEASUREMENTS,
): { status: "close" | "natural" | "roomy"; summary: string } {
  const e = FIT_EASE[fit]
  if (fit === "fitted") {
    return {
      status: "close",
      summary: `Close fit · chest ~${m.chestCm + e.chestEaseCm} cm with ${e.chestEaseCm} cm ease`,
    }
  }
  if (fit === "relaxed") {
    return {
      status: "roomy",
      summary: `Roomy fit · hip ~${m.hipCm + e.hipEaseCm} cm with ${e.hipEaseCm} cm ease`,
    }
  }
  return {
    status: "natural",
    summary: `Natural fit · waist ~${m.waistCm + e.waistEaseCm} cm with ${e.waistEaseCm} cm ease`,
  }
}
