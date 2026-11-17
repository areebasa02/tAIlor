import type { Category } from "../types"

export type WardrobeScanItem = {
  name: string
  category: Category
  color: string
  colorName: string
  material: string
  careInstructions: string
  storageLocation: string
  sentimentalValue: "Low" | "Medium" | "High"
  cost: string
  confidence: number
  imageData?: string
}

export type WardrobeScanResponse = {
  item: WardrobeScanItem
  model?: string
  source?: string
  note?: string
  error?: string
}

export type MockSampleId = "teal-trench" | "magenta-blouse" | "gold-cardigan"

const MAX_BYTES = 10 * 1024 * 1024

export function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) {
    return Promise.reject(new Error("Please choose a JPEG, PNG, or WebP image."))
  }
  if (file.size > MAX_BYTES) {
    return Promise.reject(new Error("Image must be 10 MB or smaller."))
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error("Could not read the selected image."))
    reader.onload = () => {
      const result = String(reader.result || "")
      const comma = result.indexOf(",")
      const base64 = comma >= 0 ? result.slice(comma + 1) : result
      resolve({ base64, mimeType: file.type || "image/jpeg" })
    }
    reader.readAsDataURL(file)
  })
}

export async function scanWardrobePhoto(options: {
  image?: string
  mimeType?: string
  mockSample?: MockSampleId | string
  useMock?: boolean
}): Promise<WardrobeScanResponse> {
  const response = await fetch("/api/wardrobe/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image: options.image,
      mimeType: options.mimeType,
      mockSample: options.mockSample,
      useMock: options.useMock,
    }),
  })

  const result = (await response.json().catch(() => ({}))) as WardrobeScanResponse
  if (!response.ok) {
    throw new Error(result.error || "Wardrobe scan request failed.")
  }
  if (!result.item?.name) {
    throw new Error("Scan returned an empty wardrobe entry.")
  }
  return result
}
