import { createServer } from "node:http"
import { createReadStream } from "node:fs"
import { readFile, stat } from "node:fs/promises"
import { readFileSync } from "node:fs"
import { extname, join, normalize } from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../", import.meta.url))
try {
  const envFile = readFileSync(join(root, ".env"), "utf8")
  for (const line of envFile.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "")
    }
  }
} catch {
  // Production platforms provide environment variables directly.
}
const port = Number(process.env.PORT || 8787)
const textModel = process.env.LLM_TEXT_MODEL || "Qwen/Qwen2.5-3B-Instruct"
const visionModel = process.env.LLM_VISION_MODEL || "Qwen/Qwen2.5-VL-3B-Instruct"
const llmBaseUrl = (process.env.LLM_BASE_URL || "http://127.0.0.1:8000/v1").replace(/\/+$/, "")
const textBaseUrl = (process.env.LLM_TEXT_BASE_URL || llmBaseUrl).replace(/\/+$/, "")
const visionBaseUrl = (process.env.LLM_VISION_BASE_URL || llmBaseUrl).replace(/\/+$/, "")
const inferenceUrl = `${textBaseUrl}/chat/completions`
const wardrobeScanUrl = `${visionBaseUrl.replace(/\/v1$/, "")}/v1/wardrobe/scan`
const debugStylist = process.env.STYLIST_DEBUG !== "false"
// Mock by default when no remote tunnel is set so Try Live works without a GPU.
// Set WARDROBE_SCAN_MOCK=false to force live Qwen2.5-VL (local GPU or Colab).
const wardrobeScanMockEnv = (process.env.WARDROBE_SCAN_MOCK || "").toLowerCase()
const effectiveVisionUrl = process.env.LLM_VISION_BASE_URL || process.env.LLM_BASE_URL || ""
const wardrobeScanMock =
  wardrobeScanMockEnv === "true" || wardrobeScanMockEnv === "1"
    ? true
    : wardrobeScanMockEnv === "false" || wardrobeScanMockEnv === "0"
      ? false
      : !effectiveVisionUrl ||
        effectiveVisionUrl.includes("127.0.0.1") ||
        effectiveVisionUrl.includes("localhost")

const MOCK_WARDROBE_SAMPLES = {
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
  default: {
    name: "Detected Cotton Tee",
    category: "Tops",
    color: "#69D5E6",
    colorName: "Soft Turquoise",
    material: "Soft cotton jersey",
    careInstructions: "Machine wash cold · tumble dry low",
    storageLocation: "Closet · Shelf",
    sentimentalValue: "Low",
    cost: "$28",
    confidence: 0.82,
    imageData: "/wardrobe/detected-cotton-tee.png",
  },
}

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
}

function sendJson(response, status, body) {
  const headers = { "Content-Type": "application/json; charset=utf-8" }
  if (process.env.NODE_ENV !== "production") headers["Access-Control-Allow-Origin"] = "*"
  response.writeHead(status, headers)
  response.end(JSON.stringify(body))
}

function logStylist(requestId, message, details = {}) {
  if (!debugStylist) return
  console.log(`[stylist:${requestId}] ${message}`, JSON.stringify(details))
}

function titleForOutfit(label, index) {
  const cleaned = typeof label === "string" ? label.trim() : ""
  if (
    cleaned &&
    !/^(outfit|look|ai look|outfit recommendation|dress|dress recommendation)(\s+\d+)?$/i.test(cleaned) &&
    !/^[.\-_\s]+$/.test(cleaned)
  ) return cleaned
  return index === 0 ? "Polished & Put-Together" : "Creative & Effortless"
}

const titleColorTerms = [
  "black", "blue", "brown", "cream", "gold", "gray", "grey", "green",
  "ivory", "magenta", "navy", "orange", "pink", "purple", "red", "silver",
  "tan", "teal", "white", "yellow",
]

function titleForFinalItems(label, index, items) {
  const candidate = titleForOutfit(label, index)
  const normalizedLabel = candidate.toLowerCase()
  const labelColors = titleColorTerms.filter((color) =>
    new RegExp(`\\b${color}\\b`, "i").test(normalizedLabel),
  )
  const finalText = items
    .map((item) => `${item.desc} ${item.color || ""}`)
    .join(" ")
    .toLowerCase()
  const labelMatchesFinalItems =
    labelColors.length === 0 ||
    labelColors.every((color) => finalText.includes(color))

  if (labelMatchesFinalItems) return candidate

  const top = items.find((item) => item.type === "top") || items[0]
  const fallbackName = top?.desc?.trim()
  return fallbackName ? `${fallbackName} Look` : candidate
}

function categoryKey(item) {
  const category = String(item.category || "").toLowerCase()
  if (category.includes("top") || category.includes("shirt") || category.includes("blouse")) return "tops"
  if (category.includes("bottom") || category.includes("pant") || category.includes("jean") || category.includes("skirt")) return "bottoms"
  if (category.includes("shoe") || category.includes("boot") || category.includes("sneaker") || category.includes("loafer")) return "shoes"
  if (category.includes("outer") || category.includes("coat") || category.includes("jacket")) return "outerwear"
  if (category.includes("accessor") || category.includes("jewelry") || category.includes("jewellery")) return "accessories"
  return category || "other"
}

function itemType(item) {
  const category = categoryKey(item)
  return category === "accessories" ? "accessory" : category.replace(/s$/, "")
}

async function readJsonBody(request, maxBytes = 10_000) {
  let body = ""
  for await (const chunk of request) {
    body += chunk
    if (body.length > maxBytes) throw new Error("Request body is too large.")
  }
  return JSON.parse(body || "{}")
}

const tryOnUrl = `${visionBaseUrl.replace(/\/v1$/, "")}/v1/try-on`

async function handleTryOn(request, response) {
  const body = await readJsonBody(request, 32 * 1024 * 1024)
  const garments = Array.isArray(body.garments)
    ? body.garments
        .filter((garment) => garment && (typeof garment.imageUrl === "string" || typeof garment.description === "string"))
        .map((garment) => ({
          imageUrl: typeof garment.imageUrl === "string" ? garment.imageUrl.trim() : "",
          description: typeof garment.description === "string" ? garment.description : "",
          type: typeof garment.type === "string" ? garment.type : "",
          color: typeof garment.color === "string" ? garment.color : "",
          colorName: typeof garment.colorName === "string" ? garment.colorName : "",
          material: typeof garment.material === "string" ? garment.material : "",
        }))
        .slice(0, 6)
    : []
  const mannequinImage =
    typeof body.mannequinImage === "string" ? body.mannequinImage.trim() : ""
  const openposeImage =
    typeof body.openposeImage === "string" ? body.openposeImage.trim() : ""
  const dressedImage =
    typeof body.dressedImage === "string" ? body.dressedImage.trim() : ""

  if (!mannequinImage && !openposeImage && !dressedImage) {
    sendJson(response, 400, {
      error: "No pose image or skeleton was provided.",
    })
    return
  }
  if (garments.length === 0) {
    sendJson(response, 400, {
      error: "Select at least one outfit piece to generate a try-on.",
    })
    return
  }

  // Run local CUDA GPU model server on port 8000 (colab_server.py /v1/try-on)
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 300_000)
    const localResp = await fetch(tryOnUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.LLM_API_KEY
          ? { Authorization: `Bearer ${process.env.LLM_API_KEY}` }
          : {}),
      },
      body: JSON.stringify({
        mannequinImage: mannequinImage || openposeImage || dressedImage,
        openposeImage: openposeImage || undefined,
        dressedImage: dressedImage || undefined,
        garments,
        keypoints: body.keypoints && typeof body.keypoints === "object" ? body.keypoints : undefined,
        cameraPreset: typeof body.cameraPreset === "string" ? body.cameraPreset : "front",
        backdropPreset: typeof body.backdropPreset === "string" ? body.backdropPreset : "cyclorama",
        includeMyFace: Boolean(body.includeMyFace),
        faceImage: typeof body.faceImage === "string" ? body.faceImage : undefined,
        poseLabel: typeof body.poseLabel === "string" ? body.poseLabel : undefined,
        bodyPreset: typeof body.bodyPreset === "string" ? body.bodyPreset : undefined,
        materialId: typeof body.materialId === "string" ? body.materialId : "porcelain",
        seed: typeof body.seed === "number" ? body.seed : undefined,
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout))

    const payload = await localResp.json().catch(() => ({}))
    if (!localResp.ok || !payload?.imageUrl) {
      const detail = payload?.detail || payload?.error || `Local try-on model returned HTTP ${localResp.status}.`
      sendJson(response, localResp.status >= 400 ? localResp.status : 502, { error: String(detail) })
      return
    }

    sendJson(response, 200, {
      imageUrl: payload.imageUrl,
      model: payload.model || "RealVisXL-OpenPose-IPAdapter",
      runs: payload.runs || garments.length,
    })
  } catch (err) {
    const causeMsg = err instanceof Error && err.cause instanceof Error ? ` (${err.cause.message})` : ""
    const message =
      err instanceof Error ? `${err.message}${causeMsg}` : "Could not reach local GPU try-on server."
    console.error("[try-on] Local GPU try-on error:", message)
    sendJson(response, 502, {
      error: `Local GPU try-on server unavailable (${message}). Ensure colab_server.py is running on ${visionBaseUrl}.`,
    })
  }
}

function normalizeWardrobeScanItem(raw = {}) {
  const categories = new Set(["Tops", "Bottoms", "Shoes", "Outerwear", "Accessories"])
  const categoryAliases = {
    top: "Tops",
    tops: "Tops",
    shirt: "Tops",
    blouse: "Tops",
    bottom: "Bottoms",
    bottoms: "Bottoms",
    pants: "Bottoms",
    jeans: "Bottoms",
    skirt: "Bottoms",
    shoe: "Shoes",
    shoes: "Shoes",
    outerwear: "Outerwear",
    coat: "Outerwear",
    jacket: "Outerwear",
    accessory: "Accessories",
    accessories: "Accessories",
  }
  let category = String(raw.category || "Tops").trim()
  category = categoryAliases[category.toLowerCase()] || category
  if (!categories.has(category)) category = "Tops"

  let color = String(raw.color || "#888888").trim()
  if (!/^#[0-9A-Fa-f]{6}$/.test(color)) color = "#888888"

  let sentimentalValue = String(raw.sentimentalValue || raw.sentimental_value || "Medium")
  if (!["Low", "Medium", "High"].includes(sentimentalValue)) sentimentalValue = "Medium"

  const confidence = Math.max(0, Math.min(1, Number(raw.confidence) || 0.75))

  return {
    name: String(raw.name || "Detected garment").trim().slice(0, 80) || "Detected garment",
    category,
    color: color.toUpperCase(),
    colorName: String(raw.colorName || raw.color_name || "Unknown").trim().slice(0, 40),
    material: String(raw.material || "Unknown fabric").trim().slice(0, 80),
    careInstructions: String(
      raw.careInstructions || raw.care_instructions || "Gentle wash",
    )
      .trim()
      .slice(0, 120),
    storageLocation: String(
      raw.storageLocation || raw.storage_location || "Closet · Main Rack",
    )
      .trim()
      .slice(0, 80),
    sentimentalValue,
    cost: String(raw.cost || "$40").trim().slice(0, 20),
    confidence,
    ...(typeof raw.imageData === "string" && raw.imageData ? { imageData: raw.imageData } : {}),
  }
}

function mockWardrobeScan(mockSample) {
  const key =
    typeof mockSample === "string" && MOCK_WARDROBE_SAMPLES[mockSample]
      ? mockSample
      : "default"
  return {
    item: normalizeWardrobeScanItem(MOCK_WARDROBE_SAMPLES[key]),
    model: "mock/demo",
    source: "mock",
  }
}

async function requestWardrobeScanFromColab(image, mimeType) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 120_000)
  const response = await fetch(wardrobeScanUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.LLM_API_KEY
        ? { Authorization: `Bearer ${process.env.LLM_API_KEY}` }
        : {}),
    },
    body: JSON.stringify({
      image,
      mimeType: mimeType || "image/jpeg",
    }),
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout))
  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message =
      typeof result?.error === "string"
        ? result.error
        : result?.error?.message || result?.detail || "Wardrobe scan request failed."
    throw new Error(message)
  }
  if (!result?.item || typeof result.item !== "object") {
    throw new Error("Wardrobe scan returned no item payload.")
  }
  return {
    item: normalizeWardrobeScanItem(result.item),
    model: result.model || visionModel,
    source: result.source || "qwen-vl",
    raw: result.raw,
  }
}

async function handleWardrobeScan(request, response) {
  const requestId = Math.random().toString(36).slice(2, 8)
  // Images as base64 can be large (JPEG/PNG ≤ 10 MB → ~14 MB encoded).
  const body = await readJsonBody(request, 16_000_000)
  const mockSample = typeof body.mockSample === "string" ? body.mockSample.trim() : ""
  const forceMock = body.useMock === true || Boolean(mockSample)
  const image = typeof body.image === "string" ? body.image : ""
  const mimeType = typeof body.mimeType === "string" ? body.mimeType : "image/jpeg"

  console.log(
    `[wardrobe-scan:${requestId}] request`,
    JSON.stringify({
      forceMock,
      mockSample: mockSample || null,
      hasImage: Boolean(image),
      imageChars: image.length,
      wardrobeScanMock,
    }),
  )

  if (forceMock || (wardrobeScanMock && !image)) {
    const payload = mockWardrobeScan(mockSample || "default")
    sendJson(response, 200, payload)
    return
  }

  if (!image) {
    sendJson(response, 400, {
      error: "Provide a base64 image, or pass mockSample for the demo path.",
    })
    return
  }

  if (wardrobeScanMock || process.env.WARDROBE_SCAN_MOCK === "true") {
    // This is an intentional demo mode, not a live inference fallback.
    const payload = {
      ...mockWardrobeScan("default"),
      note: "Mock result: set LLM_BASE_URL to a Colab tunnel and WARDROBE_SCAN_MOCK=false for live Qwen2.5-VL.",
    }
    sendJson(response, 200, payload)
    return
  }

  try {
    const payload = await requestWardrobeScanFromColab(image, mimeType)
    sendJson(response, 200, payload)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.log(`[wardrobe-scan:${requestId}] failed`, JSON.stringify({ message }))
    sendJson(response, 502, {
      error: `Live wardrobe scan failed using ${visionModel}. ${message} Check that the Colab vision model is loaded and the tunnel is reachable.`,
    })
  }
}

async function requestModel(prompt, temperature = 0.3) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 120_000)
  const inferenceResponse = await fetch(inferenceUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.LLM_API_KEY
        ? { Authorization: `Bearer ${process.env.LLM_API_KEY}` }
        : {}),
    },
    body: JSON.stringify({
      model: textModel,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 450,
      temperature,
    }),
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout))

  const result = await inferenceResponse.json().catch(() => ({}))
  if (!inferenceResponse.ok) {
    const message = typeof result?.error === "string"
      ? result.error
      : result?.error?.message || result?.detail || "Local model server request failed."
    throw new Error(message)
  }

  const text = result?.choices?.[0]?.message?.content
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("The stylist model returned an empty response.")
  }
  return text.trim()
}

function matchWardrobeItem(rawDescription, wardrobeItems) {
  const cleaned = String(rawDescription || "")
    .replace(/\s*\([^)]*\)\s*$/g, "")
    .replace(/^[-*]\s*/, "")
    .trim()
    .toLowerCase()
  if (!cleaned || /^(none|n\/a|na|not applicable|optional|skip|-+)$/i.test(cleaned)) {
    return null
  }
  const exact = wardrobeItems.find((w) => w.name.toLowerCase() === cleaned)
  if (exact) return exact

  // Prefer longest wardrobe name contained inside model output to avoid short-substring collisions
  const contained = wardrobeItems
    .filter((w) => cleaned.includes(w.name.toLowerCase()))
    .sort((a, b) => b.name.length - a.name.length)
  if (contained.length > 0) return contained[0]

  if (cleaned.length >= 4) {
    const partial = wardrobeItems
      .filter((w) => w.name.toLowerCase().includes(cleaned))
      .sort((a, b) => a.name.length - b.name.length)
    if (partial.length > 0) return partial[0]
  }
  return null
}

function parseOutfitResponse(raw) {
  const jsonStart = raw.indexOf("{")
  const jsonEnd = raw.lastIndexOf("}")
  if (jsonStart >= 0 && jsonEnd > jsonStart) {
    try {
      const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1))
      if (parsed && typeof parsed === "object") return parsed
    } catch {
      // Try the simpler line format below.
    }
  }

  const items = []
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*(TOP|BOTTOM|SHOES?|OUTERWEAR|ACCESSOR(?:Y|IES))\s*:\s*(.+?)\s*$/i)
    if (match) items.push({ type: match[1], desc: match[2].replace(/^[-*]\s*/, "").trim() })
  }
  const label = raw.match(/^\s*(?:LABEL|OUTFIT)\s*:\s*(.+?)\s*$/im)?.[1]?.trim()
  return items.length ? { label, items } : null
}

async function handleStylist(request, response) {
  const requestId = Math.random().toString(36).slice(2, 8)
  const body = await readJsonBody(request, 256_000)
  const event = typeof body.event === "string" ? body.event.trim() : ""
  const dresscode = typeof body.dresscode === "string" ? body.dresscode.trim() : ""
  const sensorySensitive = Boolean(body.sensorySensitive)
  const stylistNotes = typeof body.stylistNotes === "string" ? body.stylistNotes.trim() : ""
  const weatherSummary = typeof body.weather === "string" ? body.weather.trim() : ""
  const wardrobeItems = Array.isArray(body.wardrobe)
    ? body.wardrobe
        .filter((item) => item && typeof item.name === "string")
        .slice(0, 40)
    : []
  const wardrobe = wardrobeItems
    .map((item) => {
      const mat = item.material ? `, ${item.material}` : ""
      return `${item.name} (${item.category || "item"}, ${item.color || "unknown color"}${mat})`
    })
    .join(", ")
  logStylist(requestId, "request", {
    event,
    dresscode,
    wardrobeCount: wardrobeItems.length,
  })

  if (event.length < 10) {
    sendJson(response, 400, { error: "Please describe the event in more detail." })
    return
  }

  const sharedPrompt = [
    "You are a practical personal stylist.",
    `Create one outfit recommendation for this event: ${event}.`,
    dresscode ? `Target dress code: ${dresscode}.` : "",
    weatherSummary ? `Current weather: ${weatherSummary}.` : "",
    sensorySensitive ? "Prioritize soft, breathable, tagless/non-scratchy fabrics." : "",
    stylistNotes ? `Wearer preferences: ${stylistNotes}.` : "",
    wardrobe ? `Available wardrobe: ${wardrobe}. Use only these items.` : "",
    "Return ONLY these labeled lines, with no markdown or extra text:",
    "LABEL: short outfit name",
    "TOP: exact wardrobe item name",
    "BOTTOM: exact wardrobe item name",
    "SHOES: exact wardrobe item name",
    "OUTERWEAR: exact wardrobe item name (optional)",
    "ACCESSORY: exact wardrobe item name (optional)",
    "Copy item names exactly from the available wardrobe. Select exactly one top, one bottom, and one pair of shoes when those categories are available; optionally add at most one outerwear item and one accessory. Never include two items from the same category.",
    "Do not describe the outfit in prose. Do not return category objects, colors, multiple JSON objects, or keys other than label and items.",
  ]
    .filter(Boolean)
    .join("\n")

  let generated
  try {
    const rawOutfits = await Promise.all([
      requestModel(`${sharedPrompt}\nMake this look polished and understated.`, 0.3),
      requestModel(`${sharedPrompt}\nMake this look more expressive and distinctive.`, 0.55),
    ])
    const previousOutfitNames = new Set()
    generated = await Promise.all(rawOutfits.map(async (raw, index) => {
      const parsedResponse = raw.match(/```(?:text)?\s*([\s\S]*?)```/i)
      const responseText = (parsedResponse ? parsedResponse[1] : raw).trim()
      const start = responseText.indexOf("{")
      const end = responseText.lastIndexOf("}")
      let outfit
      let usedFallback = false
      let fallbackReason = ""
      outfit = parseOutfitResponse(responseText)
      if (!outfit) {
        usedFallback = true
        fallbackReason = "invalid-outfit-response"
        outfit = {
          label: `AI Look ${index + 1}`,
          items: wardrobeItems.slice(0, 3).map((item) => ({ type: item.category, desc: item.name })),
        }
      }
      if (!outfit || typeof outfit !== "object") {
        throw new Error("The stylist model returned incomplete outfit data.")
      }
      if (!Array.isArray(outfit.items) || outfit.items.length < 2) {
        usedFallback = true
        fallbackReason = "missing-items"
        outfit.items = wardrobeItems.slice(0, 3).map((item) => ({ type: item.category, desc: item.name }))
      }
      if (typeof outfit.label !== "string") outfit.label = `AI Look ${index + 1}`
      logStylist(requestId, `model result ${index + 1}`, {
        raw: raw.slice(0, 1200),
        rawLength: raw.length,
        jsonBounds: { start, end },
        parsed: !fallbackReason,
        usedFallback,
        fallbackReason,
      })
      const usedWardrobeNames = new Set()
      const usedCategories = new Set()
      const reusedNames = new Set(previousOutfitNames)
      const generatedMatches = outfit.items
        .map((generatedItem) =>
          matchWardrobeItem(generatedItem?.desc || generatedItem?.name || "", wardrobeItems),
        )
        .filter(Boolean)
      if (generatedMatches.length < 2) {
        usedFallback = true
        fallbackReason ||= "unmatched-items"
      }
      const candidates = generatedMatches
        .filter((item) => {
          if (usedWardrobeNames.has(item.name)) return false
          usedWardrobeNames.add(item.name)
          return true
        })
      const allCandidates = [...candidates, ...wardrobeItems].filter(
        (item, itemIndex, items) =>
          items.findIndex((candidate) => candidate.name === item.name) === itemIndex,
      )
      const selectedWardrobe = []
      for (const requiredCategory of ["tops", "bottoms", "shoes"]) {
        const categoryCandidates = allCandidates.filter(
          (item) => categoryKey(item) === requiredCategory,
        )
        const match =
          categoryCandidates.find(
            (item) => !reusedNames.has(item.name.toLowerCase()),
          ) ||
          categoryCandidates[0] ||
          wardrobeItems.find(
            (item) =>
              categoryKey(item) === requiredCategory &&
              !reusedNames.has(item.name.toLowerCase()) &&
              !usedCategories.has(categoryKey(item)),
          ) ||
          wardrobeItems.find(
            (item) =>
              categoryKey(item) === requiredCategory &&
              !usedCategories.has(categoryKey(item)),
          )
        if (match) {
          selectedWardrobe.push(match)
          usedCategories.add(requiredCategory)
          usedWardrobeNames.add(match.name)
        }
      }
      // Keep optional categories model-selected. Required categories above may
      // still come from the wardrobe when Qwen omits or misnames them.
      for (const item of [...candidates].sort((a, b) => {
        const aReused = reusedNames.has(a.name.toLowerCase()) ? 1 : 0
        const bReused = reusedNames.has(b.name.toLowerCase()) ? 1 : 0
        return aReused - bReused
      })) {
        const category = categoryKey(item)
        if (selectedWardrobe.length >= 6 || usedCategories.has(category)) continue
        selectedWardrobe.push(item)
        usedCategories.add(category)
      }

      const items = selectedWardrobe.map((selected) => ({
        type: itemType(selected),
        desc: selected.name,
        color: selected.color || "#6B7280",
        emoji: "👕",
      }))
      const finalItems = items
      if (index === 0) {
        finalItems.forEach((item) => previousOutfitNames.add(item.desc.toLowerCase()))
      }
      const explanationPrompt = [
        "You are a personal stylist explaining one completed outfit to the wearer.",
        `Event: ${event}.`,
        dresscode ? `Dress code: ${dresscode}.` : "",
        `Final outfit items: ${finalItems.map((item) => `${item.desc} (${item.type})`).join(", ")}.`,
        "Explain in 2 or 3 natural sentences why these exact items work together for the event.",
        "Mention specific choices such as color, silhouette, comfort, formality, or how the pieces balance one another.",
        "Do not give a new outfit, suggest substitutions, use a fixed list format, or begin with 'For this'. Return only the explanation.",
      ]
        .filter(Boolean)
        .join("\n")
      const rationale = await requestModel(explanationPrompt)

      const finalLabel = titleForFinalItems(outfit.label, index, finalItems)
      logStylist(requestId, `final outfit ${index + 1}`, {
        modelLabel: outfit.label,
        label: finalLabel,
        items: finalItems.map((item) => item.desc),
        reusedItems: finalItems
          .filter((item) => reusedNames.has(item.desc.toLowerCase()))
          .map((item) => item.desc),
        usedFallback,
        explanationSource: "local-model",
      })
      return {
        id: index + 1,
        label: finalLabel,
        dresscodeMatch: `${dresscode || "Chosen dress code"} recommendation`,
        rationale,
        whyExplanation: rationale,
        usedFallback,
        items: finalItems,
      }
    }))
  } catch (error) {
    logStylist(requestId, "request failed", {
      message: error instanceof Error ? error.message : String(error),
    })
    const cause = error instanceof Error && error.cause instanceof Error
      ? ` (${error.cause.message})`
      : ""
    sendJson(response, 502, {
      error: error instanceof Error
        ? `${error.message}${cause}`
        : `Could not connect to the local/Colab model server at ${textBaseUrl}.${cause}`,
    })
    return
  }

  sendJson(response, 200, {
    advice: `Two ${dresscode || "personalized"} looks selected from your wardrobe: ${generated
      .map((outfit) => outfit.label)
      .join(" and ")}.`,
    outfits: generated,
    model: textModel,
  })
}

async function serveStatic(pathname, response) {
  const requestedPath = pathname === "/" ? "/index.html" : pathname
  const filePath = normalize(join(root, "dist", requestedPath))
  if (!filePath.startsWith(normalize(join(root, "dist")))) {
    response.writeHead(403)
    response.end("Forbidden")
    return
  }

  try {
    const fileStat = await stat(filePath)
    if (!fileStat.isFile()) throw new Error("Not a file")
    response.writeHead(200, {
      "Content-Type": contentTypes[extname(filePath)] || "application/octet-stream",
    })
    createReadStream(filePath).pipe(response)
  } catch {
    const index = await readFile(join(root, "dist", "index.html"))
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
    response.end(index)
  }
}

const server = createServer(async (request, response) => {
  try {
    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      })
      response.end()
      return
    }

    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`)
    if (url.pathname === "/api/stylist" && request.method === "POST") {
      await handleStylist(request, response)
      return
    }
    if (url.pathname === "/api/try-on" && request.method === "POST") {
      await handleTryOn(request, response)
      return
    }
    if (url.pathname === "/api/wardrobe/scan" && request.method === "POST") {
      await handleWardrobeScan(request, response)
      return
    }
    if (url.pathname === "/api/ai/health" && request.method === "GET") {
      const backendHealthUrl = `${visionBaseUrl.replace(/\/v1$/, "")}/health`
      let backend = null
      let backendError = null
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 3000)
        const resp = await fetch(backendHealthUrl, { signal: controller.signal }).finally(() =>
          clearTimeout(timeout),
        )
        backend = await resp.json().catch(() => ({ status: resp.status }))
      } catch (err) {
        backendError = err instanceof Error ? err.message : String(err)
      }
      sendJson(response, backend ? 200 : 503, {
        status: backend ? "ok" : "unavailable",
        proxyPort: port,
        backendUrl: backendHealthUrl,
        backend,
        ...(backendError ? { error: backendError } : {}),
      })
      return
    }
    if (url.pathname === "/api/wardrobe/scan/health" && request.method === "GET") {
      sendJson(response, 200, {
        status: "ok",
        mock: wardrobeScanMock,
        textModel,
        visionModel,
        llmBaseUrl,
        textBaseUrl,
        visionBaseUrl,
        scanUrl: wardrobeScanUrl,
      })
      return
    }
    if (request.method === "GET") {
      await serveStatic(url.pathname, response)
      return
    }
    sendJson(response, 405, { error: "Method not allowed." })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error."
    sendJson(response, 500, { error: message })
  }
})

server.listen(port, () => {
  console.log(`tAIlor server listening on http://localhost:${port}`)
})
