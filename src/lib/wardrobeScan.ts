import type { Category } from "../types"
import { formatAiErrorMessage, getApiUrl } from "./aiHost"

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

export type MockSampleId =
  | "teal-trench"
  | "magenta-blouse"
  | "gold-cardigan"
  | "burgundy-dress"

const MAX_BYTES = 10 * 1024 * 1024

export function fileToBase64(
  file: File,
  onProgress?: (percentage: number) => void,
): Promise<{ base64: string; mimeType: string }> {
  if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) {
    return Promise.reject(new Error("Please choose a JPEG, PNG, or WebP image."))
  }
  if (file.size > MAX_BYTES) {
    return Promise.reject(new Error("Image must be 10 MB or smaller."))
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error("Could not read the selected image."))
    reader.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress?.(Math.round((event.loaded / event.total) * 100))
      }
    }
    reader.onload = () => {
      const result = String(reader.result || "")
      const comma = result.indexOf(",")
      const base64 = comma >= 0 ? result.slice(comma + 1) : result
      onProgress?.(100)
      resolve({ base64, mimeType: file.type || "image/jpeg" })
    }
    reader.readAsDataURL(file)
  })
}

const LOCAL_MOCK_SAMPLES: Record<MockSampleId, WardrobeScanItem> = {
  "teal-trench": {
    name: "Teal Gabardine Trench",
    category: "Outerwear",
    color: "#007880",
    colorName: "Deep Teal",
    material: "Gabardine cotton blend",
    careInstructions: "Dry clean or gentle cold wash · hang dry",
    storageLocation: "Closet · Main Rack",
    sentimentalValue: "Medium",
    cost: "$89",
    confidence: 0.94,
    imageData: "/wardrobe/teal-gabardine-trench.png",
  },
  "magenta-blouse": {
    name: "Magenta Silk Blouse",
    category: "Tops",
    color: "#CE005A",
    colorName: "Vivid Magenta",
    material: "Silk / satin weave",
    careInstructions: "Hand wash cold · line dry · low iron",
    storageLocation: "Closet · Soft Hanger",
    sentimentalValue: "High",
    cost: "$65",
    confidence: 0.91,
    imageData: "/wardrobe/magenta-silk-blouse.png",
  },
  "gold-cardigan": {
    name: "Gold Knit Cardigan",
    category: "Tops",
    color: "#FFCB44",
    colorName: "Warm Gold",
    material: "Soft knit wool blend",
    careInstructions: "Machine wash cold · reshape flat dry",
    storageLocation: "Drawer · Folded Knits",
    sentimentalValue: "Medium",
    cost: "$48",
    confidence: 0.89,
    imageData: "/wardrobe/gold-knit-cardigan.png",
  },
  "burgundy-dress": {
    name: "Burgundy velvet wrap dress",
    category: "Full Body",
    color: "#6A1A32",
    colorName: "Deep Burgundy",
    material: "Soft silk-touch velvet",
    careInstructions: "Cold delicate wash · hang dry",
    storageLocation: "Closet · Dress Hanger",
    sentimentalValue: "High",
    cost: "$95",
    confidence: 0.93,
    imageData: "/wardrobe/burgundy-velvet-wrap-dress.png",
  },
}

export async function scanWardrobePhoto(options: {
  image?: string
  mimeType?: string
  mockSample?: MockSampleId | string
  useMock?: boolean
}): Promise<WardrobeScanResponse> {
  try {
    const response = await fetch(getApiUrl("/api/wardrobe/scan"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        image: options.image,
        mimeType: options.mimeType,
        mockSample: options.mockSample,
        useMock: options.useMock,
      }),
    })

    const contentType = response.headers.get("content-type") || ""
    if (!contentType.includes("application/json")) {
      throw new Error("Host PC AI server is offline or unreachable.")
    }

    const result = (await response.json().catch(() => ({}))) as WardrobeScanResponse
    if (!response.ok) {
      throw new Error(result.error || "Wardrobe scan request failed.")
    }
    if (!result.item?.name) {
      throw new Error("Scan returned an empty wardrobe entry.")
    }
    return result
  } catch (error) {
    if (
      options.useMock &&
      options.mockSample &&
      options.mockSample in LOCAL_MOCK_SAMPLES
    ) {
      return {
        item: LOCAL_MOCK_SAMPLES[options.mockSample as MockSampleId],
        model: "mock/demo",
        source: "mock",
        note: "Loaded quick test sample locally while host PC AI is offline.",
      }
    }
    throw new Error(
      formatAiErrorMessage(error, "Wardrobe scan request failed."),
    )
  }
}
