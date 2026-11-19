import type { Category } from "../types"

export type TryOnSlot =
  | "Top"
  | "Bottom"
  | "Full Body"
  | "Outerwear"
  | "Shoes"
  | "Accessory"

export const WARDROBE_CATEGORIES: Category[] = [
  "Tops",
  "Bottoms",
  "Full Body",
  "Shoes",
  "Outerwear",
  "Accessories",
]

export const CATEGORY_LABELS: Record<Category, string> = {
  Tops: "Tops",
  Bottoms: "Bottoms",
  "Full Body": "Dresses / Full Body",
  Shoes: "Shoes",
  Outerwear: "Outerwear",
  Accessories: "Accessories",
}

export const CATEGORY_EMOJIS: Record<Category, string> = {
  Tops: "👕",
  Bottoms: "👖",
  "Full Body": "👗",
  Shoes: "👟",
  Outerwear: "🧥",
  Accessories: "💍",
}

const FULL_BODY_KEYWORDS = [
  "full body",
  "full_body",
  "full-body",
  "fullbody",
  "dresses / full body",
  "one-piece",
  "one piece",
  "jumpsuit",
  "romper",
  "boilersuit",
  "coverall",
  "overall",
  "gown",
  "sundress",
  "maxi dress",
  "midi dress",
  "mini dress",
  "wrap dress",
  "shirt dress",
  "slip dress",
  "kaftan",
]

/**
 * Normalize a wardrobe category or outfit piece type into a canonical Try-On slot.
 * Checks explicit category names first so items like "dress shirt" or "dress trousers"
 * are never misclassified as full-body dresses.
 */
export function normalizeGarmentSlot(
  categoryOrType: string,
  itemName = "",
): TryOnSlot {
  const c = (categoryOrType || "").trim().toLowerCase()
  if (
    c === "full body" ||
    c === "full_body" ||
    c === "full-body" ||
    c === "fullbody" ||
    c === "dresses / full body" ||
    c === "dresses" ||
    c === "dress" ||
    c === "one-piece" ||
    c === "one piece"
  ) {
    return "Full Body"
  }
  if (c === "tops" || c === "top") return "Top"
  if (c === "bottoms" || c === "bottom") return "Bottom"
  if (c === "outerwear") return "Outerwear"
  if (c === "shoes" || c === "shoe") return "Shoes"
  if (c === "accessories" || c === "accessory") return "Accessory"

  const combined = `${c} ${(itemName || "").trim().toLowerCase()}`.trim()

  if (
    combined.includes("dress shirt") ||
    combined.includes("dress blouse") ||
    combined.includes("dress top")
  ) {
    return "Top"
  }
  if (
    combined.includes("dress trouser") ||
    combined.includes("dress pant") ||
    combined.includes("dress slack")
  ) {
    return "Bottom"
  }
  if (
    combined.includes("dress shoe") ||
    combined.includes("dress oxford") ||
    combined.includes("dress loafer") ||
    combined.includes("dress boot")
  ) {
    return "Shoes"
  }
  if (combined.includes("dress coat")) {
    return "Outerwear"
  }

  if (
    FULL_BODY_KEYWORDS.some((kw) => combined.includes(kw)) ||
    /\bdress(es)?\b/.test(combined)
  ) {
    return "Full Body"
  }

  if (
    combined.includes("outer") ||
    combined.includes("coat") ||
    combined.includes("jacket") ||
    combined.includes("blazer") ||
    combined.includes("cardigan") ||
    combined.includes("hoodie") ||
    combined.includes("trench")
  ) {
    return "Outerwear"
  }
  if (
    combined.includes("bottom") ||
    combined.includes("pant") ||
    combined.includes("jean") ||
    combined.includes("trouser") ||
    combined.includes("chino") ||
    combined.includes("skirt")
  ) {
    return "Bottom"
  }
  if (
    combined.includes("shoe") ||
    combined.includes("sneaker") ||
    combined.includes("loafer") ||
    combined.includes("boot") ||
    combined.includes("heel") ||
    combined.includes("mary jane") ||
    combined.includes("oxford")
  ) {
    return "Shoes"
  }
  if (
    combined.includes("access") ||
    combined.includes("bag") ||
    combined.includes("belt") ||
    combined.includes("watch") ||
    combined.includes("earring") ||
    combined.includes("choker") ||
    combined.includes("pendant") ||
    combined.includes("bracelet") ||
    combined.includes("tote")
  ) {
    return "Accessory"
  }
  return "Top"
}

export function isFullBodyGarment(
  categoryOrType: string,
  itemName = "",
): boolean {
  return normalizeGarmentSlot(categoryOrType, itemName) === "Full Body"
}

export function categoryToOutfitType(category: Category | string): TryOnSlot {
  return normalizeGarmentSlot(category)
}

export function getGarmentEmoji(
  categoryOrType: string,
  itemName = "",
  fallback = "👕",
): string {
  const slot = normalizeGarmentSlot(categoryOrType, itemName)
  if (slot === "Full Body") return "👗"
  if (slot === "Outerwear") return "🧥"
  if (slot === "Bottom") return "👖"
  if (slot === "Shoes") return "👟"
  if (slot === "Accessory") return "💍"
  if (slot === "Top") {
    const combined = `${categoryOrType} ${itemName}`.toLowerCase()
    if (combined.includes("blouse")) return "👚"
    if (combined.includes("knit") || combined.includes("sweater")) return "🧶"
    return fallback
  }
  return fallback
}

export function swapMatchesCategory(
  targetType: string,
  candidateCategory: Category,
): boolean {
  const targetSlot = normalizeGarmentSlot(targetType)
  const candidateSlot = normalizeGarmentSlot(candidateCategory)
  return targetSlot === candidateSlot
}
