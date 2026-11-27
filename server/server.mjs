import { createServer } from "node:http"
import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import { createReadStream, existsSync, readFileSync } from "node:fs"
import { readFile, stat } from "node:fs/promises"
import { extname, join, normalize } from "node:path"
import { fileURLToPath } from "node:url"
import {
  deleteProfileTryOnPhoto,
  getDbStats,
  getProfileTryOnPhoto,
  listTryOnHistory,
  recordTryOnHistory,
  saveProfileTryOnPhoto,
} from "./db.mjs"

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
const bindHost = process.env.HOST || "127.0.0.1"
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
  "burgundy-dress": {
    name: "Burgundy velvet wrap dress",
    category: "Full Body",
    color: "#7E1D39",
    colorName: "Deep Burgundy",
    material: "Stretch silk velvet",
    careInstructions: "Dry clean or cold delicate wash · hang dry",
    storageLocation: "Closet · Padded Hanger",
    sentimentalValue: "High",
    cost: "$145",
    confidence: 0.93,
    imageData: "/wardrobe/burgundy-velvet-wrap-dress.png",
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

const MAX_TRYON_QUEUE = Math.max(1, Number(process.env.MAX_TRYON_QUEUE || 6))
const MAX_LLM_INFLIGHT = Math.max(1, Number(process.env.MAX_LLM_INFLIGHT || 8))
const TRYON_RATE_LIMIT_PER_MIN = Math.max(1, Number(process.env.TRYON_RATE_LIMIT_PER_MIN || 10))
const STYLIST_RATE_LIMIT_PER_MIN = Math.max(1, Number(process.env.STYLIST_RATE_LIMIT_PER_MIN || 30))
const WEATHER_ADVICE_RATE_LIMIT_PER_MIN = Math.max(1, Number(process.env.WEATHER_ADVICE_RATE_LIMIT_PER_MIN || STYLIST_RATE_LIMIT_PER_MIN))
const SCAN_RATE_LIMIT_PER_MIN = Math.max(1, Number(process.env.SCAN_RATE_LIMIT_PER_MIN || 30))

const configuredAllowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean),
)

function isOriginAllowed(origin, request) {
  if (!origin) return true
  const normalized = origin.trim().replace(/\/+$/, "")
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(normalized)) {
    return true
  }
  if (configuredAllowedOrigins.has(normalized)) {
    return true
  }
  const forwardedHost = String(request.headers["x-forwarded-host"] || request.headers.host || "").split(",")[0].trim()
  if (forwardedHost && (normalized === `https://${forwardedHost}` || normalized === `http://${forwardedHost}`)) {
    return true
  }
  return false
}

function applyCorsHeaders(request, response) {
  const origin = typeof request.headers.origin === "string" ? request.headers.origin.trim() : ""
  if (!origin) return true
  if (!isOriginAllowed(origin, request)) {
    return false
  }
  response.setHeader("Access-Control-Allow-Origin", origin)
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept")
  response.setHeader("Access-Control-Max-Age", "86400")
  response.setHeader("Vary", "Origin")
  return true
}

function getClientIp(request) {
  const forwarded = request.headers["x-forwarded-for"]
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim()
  }
  return request.socket?.remoteAddress || "unknown"
}

const rateBuckets = new Map()
function checkRateLimit(bucketName, clientIp, maxRequests, windowMs = 60_000) {
  const now = Date.now()
  const key = `${bucketName}:${clientIp}`
  const cutoff = now - windowMs
  const timestamps = (rateBuckets.get(key) || []).filter((ts) => ts > cutoff)
  if (timestamps.length >= maxRequests) {
    const oldest = timestamps[0] || now
    const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000))
    rateBuckets.set(key, timestamps)
    return { allowed: false, retryAfterSec }
  }
  timestamps.push(now)
  rateBuckets.set(key, timestamps)
  return { allowed: true, retryAfterSec: 0 }
}

setInterval(() => {
  const cutoff = Date.now() - 120_000
  for (const [key, timestamps] of rateBuckets.entries()) {
    const active = timestamps.filter((ts) => ts > cutoff)
    if (active.length === 0) rateBuckets.delete(key)
    else rateBuckets.set(key, active)
  }
}, 60_000).unref()

let llmInflightCount = 0

function sendJson(response, status, body, extraHeaders = {}) {
  const headers = { "Content-Type": "application/json; charset=utf-8", ...extraHeaders }
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

  const anchor =
    items.find(
      (item) =>
        item.type === "Full Body" ||
        item.type === "full_body" ||
        item.type === "top",
    ) || items[0]
  const fallbackName = anchor?.desc?.trim()
  return fallbackName ? `${fallbackName} Look` : candidate
}

function categoryKey(item) {
  const category = String(item?.category || "").toLowerCase().trim()
  const name = String(item?.name || "").toLowerCase().trim()
  const combined = `${category} ${name}`

  // Protect compound "dress ..." pieces that are NOT full-body dresses
  if (/(dress\s+shirt|dress\s+blouse|dress\s+top)/.test(combined)) return "tops"
  if (/(dress\s+trouser|dress\s+pant|dress\s+slack)/.test(combined)) return "bottoms"
  if (/(dress\s+oxford|dress\s+shoe|dress\s+boot|dress\s+loafer)/.test(combined)) return "shoes"
  if (/(dress\s+coat|dress\s+jacket)/.test(combined)) return "outerwear"

  if (
    category === "full body" ||
    category === "full_body" ||
    category === "full-body" ||
    /\b(dress|dresses|gown|jumpsuit|romper|boilersuit|coverall|coveralls|overalls|one-piece|one piece)\b/.test(category) ||
    (!category && /\b(dress|gown|jumpsuit|romper|boilersuit|coverall|coveralls|overalls|one-piece)\b/.test(name))
  ) {
    return "full_body"
  }
  if (category.includes("top") || category.includes("shirt") || category.includes("blouse")) return "tops"
  if (category.includes("bottom") || category.includes("pant") || category.includes("jean") || category.includes("skirt")) return "bottoms"
  if (category.includes("shoe") || category.includes("boot") || category.includes("sneaker") || category.includes("loafer")) return "shoes"
  if (category.includes("outer") || category.includes("coat") || category.includes("jacket")) return "outerwear"
  if (category.includes("accessor") || category.includes("jewelry") || category.includes("jewellery")) return "accessories"
  return category || "other"
}

function itemType(item) {
  const category = categoryKey(item)
  if (category === "full_body") return "Full Body"
  if (category === "accessories") return "accessory"
  return category.replace(/s$/, "")
}

function emojiForCategoryKey(category) {
  switch (category) {
    case "full_body":
      return "👗"
    case "bottoms":
      return "👖"
    case "shoes":
      return "👟"
    case "outerwear":
      return "🧥"
    case "accessories":
      return "💍"
    default:
      return "👕"
  }
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
const tryOnProgressBaseUrl = `${visionBaseUrl.replace(/\/v1$/, "")}/v1/try-on/progress`

function parseTryOnPayload(body) {
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
  const depthImage =
    typeof body.depthImage === "string" ? body.depthImage.trim() : ""
  const dressedImage =
    typeof body.dressedImage === "string" ? body.dressedImage.trim() : ""
  const userPhotoImage =
    typeof body.userPhotoImage === "string" ? body.userPhotoImage.trim() : ""

  const subjectMode = typeof body.subjectMode === "string" ? body.subjectMode : "mannequin"
  const hasMannequinTemplate =
    subjectMode === "mannequin" &&
    (typeof body.poseLabel === "string" || typeof body.bodyPreset === "string")

  if (!mannequinImage && !openposeImage && !dressedImage && !userPhotoImage && !hasMannequinTemplate) {
    return { error: "No pose image, skeleton, or user photo was provided." }
  }
  if (garments.length === 0) {
    return { error: "Select at least one outfit piece to generate a try-on." }
  }

  return {
    payload: {
      mannequinImage: mannequinImage || openposeImage || dressedImage || userPhotoImage || undefined,
      openposeImage: openposeImage || undefined,
      depthImage: depthImage || undefined,
      dressedImage: dressedImage || undefined,
      userPhotoImage: userPhotoImage || undefined,
      photoMode: typeof body.photoMode === "string" ? body.photoMode : "none",
      userId: typeof body.userId === "string" ? body.userId : undefined,
      outfitLabel: typeof body.outfitLabel === "string" ? body.outfitLabel : undefined,
      garments,
      keypoints: body.keypoints && typeof body.keypoints === "object" ? body.keypoints : undefined,
      bodySliders: body.bodySliders && typeof body.bodySliders === "object" ? body.bodySliders : undefined,
      subjectMode: typeof body.subjectMode === "string" ? body.subjectMode : "mannequin",
      handFootPreset: typeof body.handFootPreset === "string" ? body.handFootPreset : "neutral",
      cameraPreset: typeof body.cameraPreset === "string" ? body.cameraPreset : "front",
      backdropPreset: typeof body.backdropPreset === "string" ? body.backdropPreset : "cyclorama",
      includeMyFace: Boolean(body.includeMyFace),
      faceImage: typeof body.faceImage === "string" ? body.faceImage : undefined,
      hasCustomFaceUpload: Boolean(body.hasCustomFaceUpload),
      faceConsentConfirmed: body.faceConsentConfirmed !== false,
      poseLabel: typeof body.poseLabel === "string" ? body.poseLabel : undefined,
      bodyPreset: typeof body.bodyPreset === "string" ? body.bodyPreset : undefined,
      fitStyle: typeof body.fitStyle === "string" ? body.fitStyle : "standard",
      materialId: typeof body.materialId === "string" ? body.materialId : "porcelain",
      seed: typeof body.seed === "number" ? body.seed : undefined,
      bypassPoseCache: Boolean(body.bypassPoseCache),
    },
  }
}

async function fetchGpuJobProgress(jobId) {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 900)
    const resp = await fetch(`${tryOnProgressBaseUrl}/${encodeURIComponent(jobId)}`, {
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout))
    if (!resp.ok) return null
    return await resp.json().catch(() => null)
  } catch {
    return null
  }
}

async function executeTryOnOnGpu(payload, jobId) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 300_000)
  try {
    const localResp = await fetch(tryOnUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.LLM_API_KEY
          ? { Authorization: `Bearer ${process.env.LLM_API_KEY}` }
          : {}),
      },
      body: JSON.stringify({ ...payload, jobId }),
      signal: controller.signal,
    })
    const result = await localResp.json().catch(() => ({}))
    if (!localResp.ok || !result?.imageUrl) {
      const detail = result?.detail || result?.error || `Local try-on model returned HTTP ${localResp.status}.`
      const err = new Error(String(detail))
      err.statusCode = localResp.status >= 400 ? localResp.status : 502
      throw err
    }
    return {
      imageUrl: result.imageUrl,
      model: result.model || "RealVisXL-V5-Lightning+ControlNetUnion+FastFit",
      runs: result.runs || payload.garments.length,
      diagnostics: result.diagnostics || undefined,
    }
  } catch (err) {
    if (err && typeof err === "object" && "statusCode" in err) throw err
    const causeMsg = err instanceof Error && err.cause instanceof Error ? ` (${err.cause.message})` : ""
    const message =
      err instanceof Error ? `${err.message}${causeMsg}` : "Could not reach local GPU try-on server."
    const wrapped = new Error(
      `Local GPU try-on server unavailable (${message}). Ensure colab_server.py is running on ${visionBaseUrl}.`,
    )
    wrapped.statusCode = 502
    throw wrapped
  } finally {
    clearTimeout(timeout)
  }
}

const tryOnJobs = new Map()
const tryOnQueue = []
let activeTryOnJobId = null

function getTryOnQueuePosition(jobId) {
  if (activeTryOnJobId === jobId) return 0
  const idx = tryOnQueue.indexOf(jobId)
  if (idx < 0) return 0
  return idx + (activeTryOnJobId ? 2 : 1)
}

function pumpTryOnQueue() {
  if (activeTryOnJobId !== null) return
  while (tryOnQueue.length > 0) {
    const nextId = tryOnQueue.shift()
    const job = tryOnJobs.get(nextId)
    if (!job || job.cancelled || job.status !== "queued") continue

    activeTryOnJobId = job.id
    job.status = "running"
    job.startedAt = Date.now()
    console.log(`[try-on:${job.id.slice(0, 8)}] running (${job.payload.garments.length} garments, queued=${tryOnQueue.length})`)

    executeTryOnOnGpu(job.payload, job.id)
      .then((result) => {
        job.status = "completed"
        job.result = result
        job.finishedAt = Date.now()
        if (job.payload?.userId && result?.imageUrl) {
          recordTryOnHistory({
            userId: job.payload.userId,
            outfitLabel: job.payload.outfitLabel || "Studio Try-On",
            subjectMode: job.payload.subjectMode || "mannequin",
            imageDataUrl: result.imageUrl,
          })
        }
        job.resolveWaiters?.(result)
        console.log(`[try-on:${job.id.slice(0, 8)}] completed in ${job.finishedAt - job.startedAt}ms`)
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err)
        job.status = "failed"
        job.error = message
        job.statusCode = err?.statusCode || 502
        job.finishedAt = Date.now()
        job.rejectWaiters?.(err)
        console.error(`[try-on:${job.id.slice(0, 8)}] failed: ${message}`)
      })
      .finally(() => {
        activeTryOnJobId = null
        pumpTryOnQueue()
      })
    return
  }
}

function enqueueTryOnJob(payload, clientIp) {
  if (tryOnQueue.length >= MAX_TRYON_QUEUE) {
    const err = new Error(`Try-On GPU queue is full (${tryOnQueue.length} waiting). Please retry in a moment.`)
    err.statusCode = 503
    throw err
  }
  const jobId = randomUUID()
  let resolveWaiters
  let rejectWaiters
  const donePromise = new Promise((resolve, reject) => {
    resolveWaiters = resolve
    rejectWaiters = reject
  })
  const job = {
    id: jobId,
    status: "queued",
    payload,
    clientIp,
    createdAt: Date.now(),
    startedAt: null,
    finishedAt: null,
    result: null,
    error: null,
    statusCode: 200,
    cancelled: false,
    donePromise,
    resolveWaiters,
    rejectWaiters,
  }
  tryOnJobs.set(jobId, job)
  tryOnQueue.push(jobId)
  const position = getTryOnQueuePosition(jobId)
  console.log(`[try-on:${jobId.slice(0, 8)}] queued from ${clientIp} (position=${position})`)
  pumpTryOnQueue()
  return {
    job,
    position: getTryOnQueuePosition(jobId),
    totalQueued: tryOnQueue.length + (activeTryOnJobId ? 1 : 0),
  }
}

setInterval(() => {
  const cutoff = Date.now() - 10 * 60_000
  for (const [jobId, job] of tryOnJobs.entries()) {
    if ((job.status === "completed" || job.status === "failed") && (job.finishedAt || job.createdAt) < cutoff) {
      tryOnJobs.delete(jobId)
    }
  }
}, 60_000).unref()

async function handleCreateTryOnJob(request, response) {
  const clientIp = getClientIp(request)
  const limit = checkRateLimit("try-on", clientIp, TRYON_RATE_LIMIT_PER_MIN)
  if (!limit.allowed) {
    sendJson(
      response,
      429,
      { error: "Too many Try-On requests from your browser. Please wait a few seconds and retry." },
      { "Retry-After": String(limit.retryAfterSec) },
    )
    return
  }

  const body = await readJsonBody(request, 32 * 1024 * 1024)
  const parsed = parseTryOnPayload(body)
  if (parsed.error) {
    sendJson(response, 400, { error: parsed.error })
    return
  }

  try {
    const { job, position, totalQueued } = enqueueTryOnJob(parsed.payload, clientIp)
    sendJson(response, 202, {
      jobId: job.id,
      status: job.status,
      position,
      totalQueued,
      createdAt: job.createdAt,
    })
  } catch (err) {
    sendJson(response, err?.statusCode || 503, {
      error: err instanceof Error ? err.message : "Could not enqueue Try-On job.",
    })
  }
}

async function handleGetTryOnJob(jobId, response) {
  const job = tryOnJobs.get(jobId)
  if (!job) {
    sendJson(response, 404, { error: "Try-On job not found or expired." })
    return
  }
  if (job.status === "completed" && job.result) {
    sendJson(response, 200, {
      jobId: job.id,
      status: "completed",
      imageUrl: job.result.imageUrl,
      model: job.result.model,
      runs: job.result.runs,
      diagnostics: job.result.diagnostics,
      elapsedMs: (job.finishedAt || Date.now()) - (job.startedAt || job.createdAt),
    })
    return
  }
  if (job.status === "failed") {
    sendJson(response, 200, {
      jobId: job.id,
      status: "failed",
      error: job.error || "Virtual Try-On generation failed.",
    })
    return
  }
  const liveProgress = job.status === "running" ? await fetchGpuJobProgress(job.id) : null
  sendJson(response, 200, {
    jobId: job.id,
    status: job.status,
    position: getTryOnQueuePosition(job.id),
    totalQueued: tryOnQueue.length + (activeTryOnJobId ? 1 : 0),
    elapsedMs: job.startedAt ? Date.now() - job.startedAt : 0,
    ...(liveProgress ? { progress: liveProgress } : {}),
  })
}

async function handleCancelTryOnJob(jobId, response) {
  const job = tryOnJobs.get(jobId)
  if (!job) {
    sendJson(response, 404, { error: "Try-On job not found." })
    return
  }
  job.cancelled = true
  const qIdx = tryOnQueue.indexOf(jobId)
  if (qIdx >= 0) {
    tryOnQueue.splice(qIdx, 1)
    job.status = "failed"
    job.error = "Cancelled by user."
    job.finishedAt = Date.now()
  }
  sendJson(response, 200, { jobId, cancelled: true, status: job.status })
}

async function handleTryOn(request, response) {
  const clientIp = getClientIp(request)
  const limit = checkRateLimit("try-on", clientIp, TRYON_RATE_LIMIT_PER_MIN)
  if (!limit.allowed) {
    sendJson(
      response,
      429,
      { error: "Too many Try-On requests from your browser. Please wait a few seconds and retry." },
      { "Retry-After": String(limit.retryAfterSec) },
    )
    return
  }

  const body = await readJsonBody(request, 32 * 1024 * 1024)
  const parsed = parseTryOnPayload(body)
  if (parsed.error) {
    sendJson(response, 400, { error: parsed.error })
    return
  }

  try {
    const { job } = enqueueTryOnJob(parsed.payload, clientIp)
    const result = await job.donePromise
    sendJson(response, 200, result)
  } catch (err) {
    sendJson(response, err?.statusCode || 502, {
      error: err instanceof Error ? err.message : "Could not reach local GPU try-on server.",
    })
  }
}

function normalizeWardrobeScanItem(raw = {}) {
  const categories = new Set(["Tops", "Bottoms", "Full Body", "Shoes", "Outerwear", "Accessories"])
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
    "full body": "Full Body",
    full_body: "Full Body",
    "full-body": "Full Body",
    "dresses / full body": "Full Body",
    dress: "Full Body",
    dresses: "Full Body",
    gown: "Full Body",
    jumpsuit: "Full Body",
    romper: "Full Body",
    boilersuit: "Full Body",
    coverall: "Full Body",
    coveralls: "Full Body",
    overalls: "Full Body",
    "one-piece": "Full Body",
    "one piece": "Full Body",
    shoe: "Shoes",
    shoes: "Shoes",
    outerwear: "Outerwear",
    coat: "Outerwear",
    jacket: "Outerwear",
    accessory: "Accessories",
    accessories: "Accessories",
  }
  const name = String(raw.name || "Detected garment").trim().slice(0, 80) || "Detected garment"
  let category = String(raw.category || "Tops").trim()
  category = categoryAliases[category.toLowerCase()] || category
  if (!categories.has(category)) category = "Tops"
  if (
    category === "Tops" &&
    !/(dress\s+shirt|dress\s+blouse|dress\s+top|dress\s+trouser|dress\s+pant|dress\s+oxford|dress\s+shoe|dress\s+coat)/i.test(name) &&
    /\b(dress|gown|jumpsuit|romper|boilersuit|coverall|coveralls|overalls|one-piece)\b/i.test(name)
  ) {
    category = "Full Body"
  }

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

async function requestModel(prompt, temperature = 0.3, options = {}) {
  const maxTokens = options.maxTokens ?? 450
  const timeoutMs = options.timeoutMs ?? 120_000
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
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
      max_tokens: maxTokens,
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
    const match = line.match(/^\s*(FULL[\s_-]*BODY|DRESS|ONE[\s_-]*PIECE|JUMPSUIT|TOP|BOTTOM|SHOES?|OUTERWEAR|ACCESSOR(?:Y|IES))\s*:\s*(.+?)\s*$/i)
    if (match) {
      const desc = match[2].replace(/^[-*]\s*/, "").trim()
      if (desc && !/^(none|n\/a|na|not applicable|optional|omit|skip|-+)$/i.test(desc)) {
        items.push({ type: match[1], desc })
      }
    }
  }
  const label = raw.match(/^\s*(?:LABEL|OUTFIT)\s*:\s*(.+?)\s*$/im)?.[1]?.trim()
  return items.length ? { label, items } : null
}

function hashString(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function rotateArray(items, offset) {
  if (!Array.isArray(items) || items.length <= 1) return items
  const shift = ((offset % items.length) + items.length) % items.length
  if (shift === 0) return items
  return [...items.slice(shift), ...items.slice(0, shift)]
}

async function handleStylist(request, response) {
  const requestId = Math.random().toString(36).slice(2, 8)
  const body = await readJsonBody(request, 256_000)
  const event = typeof body.event === "string" ? body.event.trim() : ""
  const dresscode = typeof body.dresscode === "string" ? body.dresscode.trim() : ""
  const everyday = body.everyday === true
  const forceRegenerate = body.forceRegenerate === true
  const reasonConstraint =
    typeof body.reasonConstraint === "string" ? body.reasonConstraint.trim() : ""
  const rawStyleDir =
    body.styleDirection && typeof body.styleDirection === "object"
      ? body.styleDirection
      : null
  const styleDirection = rawStyleDir
    ? {
        key: typeof rawStyleDir.key === "string" ? rawStyleDir.key.trim().slice(0, 60) : "",
        label: typeof rawStyleDir.label === "string" ? rawStyleDir.label.trim().slice(0, 80) : "",
        tagline: typeof rawStyleDir.tagline === "string" ? rawStyleDir.tagline.trim().slice(0, 120) : "",
        description:
          typeof rawStyleDir.description === "string"
            ? rawStyleDir.description.trim().slice(0, 260)
            : "",
      }
    : null
  const avoidItems = Array.isArray(body.avoidItems)
    ? body.avoidItems
        .filter((item) => typeof item === "string" && item.trim())
        .map((item) => item.trim().slice(0, 120))
        .slice(0, 20)
    : []
  const incomingCalendar = sanitizeIncomingCalendarEvents(body.calendarEvents || body.events)
  const sensorySensitive = Boolean(body.sensorySensitive)
  const stylistNotes = typeof body.stylistNotes === "string" ? body.stylistNotes.trim() : ""
  const weatherSummary = typeof body.weather === "string" ? body.weather.trim() : ""
  const rawWardrobeItems = Array.isArray(body.wardrobe)
    ? body.wardrobe
        .filter((item) => item && typeof item.name === "string")
        .slice(0, 40)
    : []
  const rotationSeed = hashString(
    `${styleDirection?.key || styleDirection?.label || event}::${forceRegenerate ? requestId : "base"}`,
  )
  const wardrobeItems = rotateArray(rawWardrobeItems, rotationSeed)
  const wardrobe = wardrobeItems
    .map((item) => {
      const mat = item.material ? `, ${item.material}` : ""
      return `${item.name} (${item.category || "item"}, ${item.color || "unknown color"}${mat})`
    })
    .join(", ")
  logStylist(requestId, "request", {
    event,
    dresscode,
    styleDirection: styleDirection?.label || null,
    avoidCount: avoidItems.length,
    calendarCount: incomingCalendar.length,
    wardrobeCount: wardrobeItems.length,
  })

  if (event.length < 10) {
    sendJson(response, 400, { error: "Please describe the event in more detail." })
    return
  }

  const calendarPromptBlock =
    incomingCalendar.length > 0
      ? `Today's upcoming schedule: ${incomingCalendar
          .slice(0, 5)
          .map((ev) => `${ev.summary}${ev.timeLabel ? ` (${ev.timeLabel})` : ""}${ev.location ? ` at ${ev.location}` : ""}`)
          .join("; ")}. Factor these plans into formality and comfort.`
      : ""

  const stylePromptBlock = styleDirection?.label
    ? [
        `Target style direction: "${styleDirection.label}"${styleDirection.tagline ? ` (${styleDirection.tagline})` : ""}.`,
        styleDirection.description ? `Style vibe to embody: ${styleDirection.description}` : "",
        "Make sure the chosen pieces clearly reflect this specific style direction rather than a generic default look.",
      ]
        .filter(Boolean)
        .join(" ")
    : ""

  const sharedPrompt = [
    "You are a practical personal stylist.",
    everyday
      ? styleDirection?.label
        ? `Create one cohesive outfit for today in the "${styleDirection.label}" style direction.`
        : "Create one practical, comfortable outfit for everyday wear today."
      : `Create one outfit recommendation for this event: ${event}.`,
    stylePromptBlock,
    !styleDirection?.label && dresscode ? `Target dress code: ${dresscode}.` : "",
    weatherSummary
      ? `Current live weather: ${weatherSummary}. Match fabric weight and layering strictly to this live temperature and weather: choose breathable, lighter pieces when warm (>=72°F) and avoid heavy coats/sweaters unless raining; add warm layers or rain protection only when cool (<62°F), windy, or wet.`
      : "",
    calendarPromptBlock,
    sensorySensitive ? "Prioritize soft, breathable, tagless/non-scratchy fabrics." : "",
    stylistNotes ? `Wearer preferences: ${stylistNotes}.` : "",
    reasonConstraint ? `Additional wearer request: ${reasonConstraint}.` : "",
    avoidItems.length > 0
      ? `IMPORTANT VARIETY RULE: Do NOT select these primary garments that were already used in other style tabs or a rejected look (pick different tops, bottoms, or full-body pieces from the wardrobe instead): ${avoidItems.join(", ")}.`
      : "",
    wardrobe ? `Available wardrobe: ${wardrobe}. Use only these items.` : "",
    "Return ONLY these labeled lines, with no markdown or extra text:",
    "LABEL: short outfit name",
    "FULL BODY: exact wardrobe item name (optional — use instead of TOP and BOTTOM for a dress, gown, jumpsuit, romper, or overalls)",
    "TOP: exact wardrobe item name (omit if using FULL BODY)",
    "BOTTOM: exact wardrobe item name (omit if using FULL BODY)",
    "SHOES: exact wardrobe item name",
    "OUTERWEAR: exact wardrobe item name (optional — include ONLY if today's live weather is cool, windy, or rainy, or the style specifically calls for a light layer)",
    "ACCESSORY: exact wardrobe item name (optional)",
    "Copy item names exactly from the available wardrobe. Either select ONE Full Body item OR select ONE top and ONE bottom (never stack a dress/full-body item with a top or bottom), plus one pair of shoes when available; optionally add at most one outerwear item and one accessory. Never include two items from the same category.",
    "Do not describe the outfit in prose. Do not return category objects, colors, multiple JSON objects, or keys other than label and items.",
  ]
    .filter(Boolean)
    .join("\n")

  let generated
  try {
    const prompts = everyday
      ? [
          `${sharedPrompt}\nMake this "${styleDirection?.label || "everyday"}" look distinct, weather-appropriate, and true to its style vibe.`,
        ]
      : [
          `${sharedPrompt}\nMake this look polished and understated.`,
          `${sharedPrompt}\nMake this look more expressive and distinctive.`,
        ]
    const baseTemp = everyday ? (forceRegenerate ? 0.65 : 0.45) : 0.3
    const rawOutfits = await Promise.all(
      prompts.map((prompt, index) => requestModel(prompt, index === 0 ? baseTemp : 0.55)),
    )
    const previousOutfitNames = new Set(avoidItems.map((name) => name.toLowerCase()))
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
      const modelChoseFullBody = candidates.some(
        (item) => categoryKey(item) === "full_body",
      )
      const hasFullBodyInCloset = wardrobeItems.some(
        (item) => categoryKey(item) === "full_body",
      )
      const hasSeparatesInCloset =
        wardrobeItems.some((item) => categoryKey(item) === "tops") &&
        wardrobeItems.some((item) => categoryKey(item) === "bottoms")
      const useFullBody =
        modelChoseFullBody || (hasFullBodyInCloset && !hasSeparatesInCloset)

      const requiredCategories = useFullBody
        ? ["full_body", "shoes"]
        : ["tops", "bottoms", "shoes"]
      const selectedWardrobe = []
      for (const requiredCategory of requiredCategories) {
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
        if (useFullBody && (category === "tops" || category === "bottoms")) continue
        if (!useFullBody && category === "full_body") continue
        selectedWardrobe.push(item)
        usedCategories.add(category)
      }

      const items = selectedWardrobe.map((selected) => ({
        type: itemType(selected),
        desc: selected.name,
        color: selected.color || "#6B7280",
        emoji: emojiForCategoryKey(categoryKey(selected)),
      }))
      const finalItems = items
      if (index === 0) {
        finalItems.forEach((item) => previousOutfitNames.add(item.desc.toLowerCase()))
      }
      const explanationPrompt = [
        "You are a personal stylist explaining one completed outfit to the wearer.",
        everyday
          ? styleDirection?.label
            ? `Style direction: ${styleDirection.label}${styleDirection.tagline ? ` (${styleDirection.tagline})` : ""}.`
            : "Context: everyday wear today."
          : `Event: ${event}.`,
        !styleDirection?.label && dresscode ? `Dress code: ${dresscode}.` : "",
        weatherSummary ? `Live weather: ${weatherSummary}.` : "",
        calendarPromptBlock,
        `Final outfit items: ${finalItems.map((item) => `${item.desc} (${item.type})`).join(", ")}.`,
        everyday
          ? `Explain in 2 or 3 natural sentences why these exact pieces fit the "${styleDirection?.label || "everyday"}" vibe, today's live weather, and any upcoming plans.`
          : "Explain in 2 or 3 natural sentences why these exact items work together for the event and weather.",
        "Mention specific choices such as color, silhouette, fabric comfort for today's temperature, or how the pieces balance one another.",
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
        dresscodeMatch: everyday
          ? "Everyday wear recommendation"
          : `${dresscode || "Chosen dress code"} recommendation`,
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
    advice: everyday
      ? `Today's everyday outfit: ${generated[0]?.label || "personalized look"}.`
      : `Two ${dresscode || "personalized"} looks selected from your wardrobe: ${generated
          .map((outfit) => outfit.label)
          .join(" and ")}.`,
    outfits: generated,
    model: textModel,
  })
}

function cleanWeatherAdviceText(raw) {
  return String(raw || "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/^[-*•]\s*/, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
}

function unfoldIcsText(raw) {
  return String(raw || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n[ \t]/g, "")
}

function unescapeIcsValue(value) {
  return String(value || "")
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim()
}

function parseIcsDateTime(rawValue, params = "") {
  const value = String(rawValue || "").trim()
  if (!value) return null
  const isDateOnly =
    /VALUE=DATE/i.test(params) || (/^\d{8}$/.test(value) && !value.includes("T"))
  const match = value.match(
    /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?(Z)?$/i,
  )
  if (!match) return null
  const [, y, mo, d, hh = "00", mm = "00", ss = "00", zulu] = match
  if (isDateOnly) {
    const local = new Date(Number(y), Number(mo) - 1, Number(d), 0, 0, 0, 0)
    if (Number.isNaN(local.getTime())) return null
    return { date: local, allDay: true }
  }
  if (zulu) {
    const utc = new Date(
      Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mm), Number(ss)),
    )
    if (Number.isNaN(utc.getTime())) return null
    return { date: utc, allDay: false }
  }
  const floating = new Date(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(hh),
    Number(mm),
    Number(ss),
    0,
  )
  if (Number.isNaN(floating.getTime())) return null
  return { date: floating, allDay: false }
}

function getIcsProperty(block, name) {
  const lines = unfoldIcsText(block).split("\n")
  const prefix = `${String(name || "").toUpperCase()}`
  for (const line of lines) {
    const upper = line.toUpperCase()
    if (upper === prefix || upper.startsWith(`${prefix}:`) || upper.startsWith(`${prefix};`)) {
      const colon = line.indexOf(":")
      if (colon < 0) continue
      const meta = line.slice(0, colon)
      const value = line.slice(colon + 1)
      const params = meta.includes(";") ? meta.slice(meta.indexOf(";") + 1) : ""
      return { value: unescapeIcsValue(value), params }
    }
  }
  return null
}

function startOfLocalDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0)
}

function endOfLocalDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999)
}

function formatCalendarTime(date, allDay) {
  if (allDay) return "All day"
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
}

function normalizeCalendarEvent(raw = {}) {
  const summary =
    typeof raw.summary === "string" && raw.summary.trim()
      ? raw.summary.trim().slice(0, 160)
      : "Untitled event"
  const location =
    typeof raw.location === "string" ? raw.location.trim().slice(0, 160) : ""
  const description =
    typeof raw.description === "string" ? raw.description.trim().slice(0, 400) : ""
  const startDate =
    raw.start instanceof Date
      ? raw.start
      : typeof raw.start === "string" || typeof raw.dtstart === "string"
        ? new Date(raw.start || raw.dtstart)
        : null
  const endDate =
    raw.end instanceof Date
      ? raw.end
      : typeof raw.end === "string" || typeof raw.dtend === "string"
        ? new Date(raw.end || raw.dtend)
        : null
  if (!startDate || Number.isNaN(startDate.getTime())) return null
  const allDay = Boolean(raw.allDay)
  const end =
    endDate && !Number.isNaN(endDate.getTime())
      ? endDate
      : allDay
        ? new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 23, 59, 59, 999)
        : new Date(startDate.getTime() + 60 * 60 * 1000)
  return {
    id:
      typeof raw.id === "string" && raw.id.trim()
        ? raw.id.trim().slice(0, 120)
        : `${startDate.toISOString()}::${summary}`.slice(0, 120),
    summary,
    dtstart: startDate.toISOString(),
    dtend: end.toISOString(),
    location,
    description,
    allDay,
    timeLabel: formatCalendarTime(startDate, allDay),
    startMs: startDate.getTime(),
    endMs: end.getTime(),
  }
}

function parseIcsEvents(icsText, options = {}) {
  const horizonHours = Math.max(1, Number(options.horizonHours) || 36)
  const now = options.now instanceof Date ? options.now : new Date()
  const windowStart = startOfLocalDay(now)
  const windowEnd = new Date(now.getTime() + horizonHours * 60 * 60 * 1000)
  const dayEnd = endOfLocalDay(now)
  const cutoff = windowEnd.getTime() > dayEnd.getTime() ? windowEnd : dayEnd

  const unfolded = unfoldIcsText(icsText)
  const blocks = unfolded.split(/BEGIN:VEVENT/i).slice(1)
  const events = []
  for (const rawBlock of blocks) {
    const block = rawBlock.split(/END:VEVENT/i)[0] || ""
    const summaryProp = getIcsProperty(block, "SUMMARY")
    const startProp = getIcsProperty(block, "DTSTART")
    const endProp = getIcsProperty(block, "DTEND")
    const locationProp = getIcsProperty(block, "LOCATION")
    const descriptionProp = getIcsProperty(block, "DESCRIPTION")
    const uidProp = getIcsProperty(block, "UID")
    if (!startProp?.value) continue
    const startParsed = parseIcsDateTime(startProp.value, startProp.params)
    if (!startParsed) continue
    const endParsed = endProp?.value
      ? parseIcsDateTime(endProp.value, endProp.params)
      : null
    let endDate = endParsed?.date
    // Same-day DTEND earlier than DTSTART usually means the event crosses midnight.
    if (endDate && endDate.getTime() < startParsed.date.getTime()) {
      endDate = new Date(endDate.getTime() + 24 * 60 * 60 * 1000)
    }
    const normalized = normalizeCalendarEvent({
      id: uidProp?.value,
      summary: summaryProp?.value || "Untitled event",
      start: startParsed.date,
      end: endDate,
      allDay: startParsed.allDay || Boolean(endParsed?.allDay),
      location: locationProp?.value || "",
      description: descriptionProp?.value || "",
    })
    if (!normalized) continue
    // Keep events that overlap today / the near horizon.
    if (normalized.endMs < windowStart.getTime() || normalized.startMs > cutoff.getTime()) {
      continue
    }
    if (normalized.endMs < now.getTime() - 15 * 60_000) continue
    events.push(normalized)
  }
  events.sort((a, b) => a.startMs - b.startMs)
  return events.slice(0, Math.max(1, Number(options.limit) || 12))
}

function buildMockCalendarEvents(now = new Date()) {
  const y = now.getFullYear()
  const m = now.getMonth()
  const d = now.getDate()
  const mk = (hour, minute, durationMinutes, summary, location, description) =>
    normalizeCalendarEvent({
      id: `mock-${summary.toLowerCase().replace(/\s+/g, "-")}`,
      summary,
      start: new Date(y, m, d, hour, minute, 0, 0),
      end: new Date(y, m, d, hour, minute + durationMinutes, 0, 0),
      location,
      description,
      allDay: false,
    })
  return [
    mk(9, 30, 60, "Morning coffee & walk", "Neighborhood café", "Relaxed start to the day."),
    mk(13, 0, 60, "Afternoon study / work block", "Local studio", "Comfortable, breathable layers."),
    mk(18, 30, 90, "Dinner with friends", "Downtown bistro", "Casual evening out."),
  ].filter(Boolean)
}

function isSafeCalendarUrl(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl || "").trim())
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false
    if (parsed.username || parsed.password) return false
    const host = parsed.hostname.toLowerCase()
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host.endsWith(".local") ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    ) {
      return false
    }
    return true
  } catch {
    return false
  }
}

async function fetchIcsTextFromUrl(url) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20_000)
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "text/calendar, text/plain, */*",
        "User-Agent": "tAIlor-calendar-proxy/1.0",
      },
      signal: controller.signal,
      redirect: "follow",
    })
    if (!response.ok) {
      throw new Error(`Calendar feed returned HTTP ${response.status}.`)
    }
    const text = await response.text()
    if (!/BEGIN:VCALENDAR/i.test(text) && !/BEGIN:VEVENT/i.test(text)) {
      throw new Error("Fetched URL did not look like an .ics calendar feed.")
    }
    if (text.length > 2_000_000) {
      throw new Error("Calendar feed is too large.")
    }
    return text
  } finally {
    clearTimeout(timeout)
  }
}

function sanitizeIncomingCalendarEvents(rawEvents) {
  if (!Array.isArray(rawEvents)) return []
  return rawEvents
    .map((item) =>
      normalizeCalendarEvent({
        id: item?.id,
        summary: item?.summary || item?.title,
        start: item?.dtstart || item?.start,
        end: item?.dtend || item?.end,
        location: item?.location,
        description: item?.description,
        allDay: item?.allDay,
      }),
    )
    .filter(Boolean)
    .slice(0, 12)
}

async function resolveCalendarEvents(body = {}) {
  const limit = Math.max(1, Math.min(250, Number(body.limit) || 8))
  const horizonHours = Math.max(6, Math.min(2880, Number(body.horizonHours) || 36))
  const icsText = typeof body.ics === "string" ? body.ics : ""
  const requestedUrl = typeof body.url === "string" ? body.url.trim() : ""
  const envUrl = typeof process.env.GOOGLE_CALENDAR_ICS_URL === "string"
    ? process.env.GOOGLE_CALENDAR_ICS_URL.trim()
    : ""

  if (icsText.trim()) {
    if (icsText.length > 2_000_000) {
      return { error: "Uploaded calendar file is too large.", status: 400 }
    }
    return {
      events: parseIcsEvents(icsText, { limit, horizonHours }),
      source: "upload",
      feedUrl: null,
    }
  }

  const feedUrl = requestedUrl || envUrl
  if (feedUrl) {
    if (!isSafeCalendarUrl(feedUrl)) {
      return { error: "Calendar URL must be a public http(s) .ics feed.", status: 400 }
    }
    try {
      const text = await fetchIcsTextFromUrl(feedUrl)
      return {
        events: parseIcsEvents(text, { limit, horizonHours }),
        source: requestedUrl ? "url" : "env",
        feedUrl,
      }
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Could not fetch calendar feed.",
        status: 502,
      }
    }
  }

  return {
    events: buildMockCalendarEvents().slice(0, limit),
    source: "mock",
    feedUrl: null,
    note: "No GOOGLE_CALENDAR_ICS_URL or upload provided — returning demo events for today.",
  }
}

async function handleCalendarEvents(request, response) {
  const body = await readJsonBody(request, 2_100_000)
  const resolved = await resolveCalendarEvents(body)
  if (resolved.error) {
    sendJson(response, resolved.status || 400, { error: resolved.error })
    return
  }
  sendJson(response, 200, {
    events: resolved.events.map(({ startMs, endMs, ...rest }) => rest),
    source: resolved.source,
    feedUrl: resolved.feedUrl,
    ...(resolved.note ? { note: resolved.note } : {}),
  })
}

function buildWeatherAdvicePrompt(
  weather,
  preferences,
  calendarEvents = [],
  outfitContext = {},
) {
  const weatherFacts = [
    weather.city ? `Location: ${weather.city}` : "",
    weather.conditionLabel || weather.condition
      ? `Conditions: ${weather.conditionLabel || weather.condition}`
      : "",
    typeof weather.tempF === "number"
      ? `Temperature: ${weather.tempF}°F`
      : weather.temp
        ? `Temperature: ${weather.temp}`
        : "",
    typeof weather.feelsLikeF === "number" && weather.feelsLikeF !== weather.tempF
      ? `Feels like: ${weather.feelsLikeF}°F`
      : "",
    typeof weather.humidity === "number" ? `Humidity: ${weather.humidity}%` : "",
    typeof weather.windMph === "number" ? `Wind: ${weather.windMph} mph` : "",
  ]
    .filter(Boolean)
    .join(", ")

  const prefLines = [
    preferences.preferredStyle ? `Preferred style: ${preferences.preferredStyle}` : "",
    preferences.homeClimate
      ? `Wearer's typical climate preference: ${preferences.homeClimate}`
      : "",
    preferences.stylistNotes ? `Style notes: ${preferences.stylistNotes}` : "",
    preferences.sensorySensitive
      ? "Sensory sensitivity: prioritize soft, breathable, tagless/non-scratchy fabrics."
      : "",
    preferences.lowDecisionMode
      ? "Low-decision mode: keep the recommendation simple, direct, and easy to act on."
      : "",
    preferences.fitFeel ? `Preferred fit/feel: ${preferences.fitFeel}` : "",
    preferences.easyClosures ? "Needs easy closures (zips, magnets, large buttons)." : "",
    preferences.palette ? `Color palette preference: ${preferences.palette}` : "",
    preferences.mood ? `Desired outfit mood: ${preferences.mood}` : "",
    Array.isArray(preferences.attributes) && preferences.attributes.length > 0
      ? `Favorite details: ${preferences.attributes.join(", ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n")

  const calendarLines = calendarEvents
    .slice(0, 6)
    .map((event) => {
      const bits = [
        event.summary,
        event.timeLabel || event.dtstart,
        event.location ? `at ${event.location}` : "",
      ].filter(Boolean)
      return `- ${bits.join(" · ")}`
    })
    .join("\n")

  const wardrobeList = Array.isArray(outfitContext.wardrobeItems)
    ? outfitContext.wardrobeItems.slice(0, 30).join(", ")
    : ""
  const currentOutfitItems = Array.isArray(outfitContext.currentOutfitItems)
    ? outfitContext.currentOutfitItems.slice(0, 6).join(", ")
    : ""
  const currentOutfitLabel =
    typeof outfitContext.currentOutfitLabel === "string"
      ? outfitContext.currentOutfitLabel.trim()
      : ""

  const tempLabel =
    typeof weather.tempF === "number" ? `${weather.tempF}°F` : weather.temp || "today's temperature"

  return [
    "You are a concise personal wardrobe stylist.",
    `Current live weather: ${weatherFacts}.`,
    prefLines ? `Wearer preferences:\n${prefLines}` : "",
    currentOutfitItems
      ? `Today's recommended outfit${currentOutfitLabel ? ` (${currentOutfitLabel})` : ""}: ${currentOutfitItems}.`
      : "",
    wardrobeList
      ? `Wearer's available wardrobe items: ${wardrobeList}.`
      : "",
    calendarLines
      ? `Today's upcoming calendar events:\n${calendarLines}\nFactor these plans into fabric comfort and layering when relevant.`
      : "",
    `Write 1 or 2 short sentences (under 35 words total) of practical climate and styling advice for today's live weather (${tempLabel}).`,
    currentOutfitItems
      ? "Keep your tip consistent with Today's recommended outfit above (do NOT suggest a competing outfit). If extra rain/wind/cool-evening protection is needed, only mention outerwear or layers that actually exist in the wearer's available wardrobe."
      : wardrobeList
        ? "Only mention specific garments if they exist in the wearer's available wardrobe; never invent blazers, skirts, or cardigans the wearer does not own."
        : "",
    `Base warmth strictly on today's live temperature (${tempLabel}) and weather conditions: choose light, breathable guidance when warm/humid and extra layers or rain protection only when cool, windy, or wet.`,
    "Return ONLY plain text advice with no markdown, no bullet points, no quotes, and no greeting.",
  ]
    .filter(Boolean)
    .join("\n")
}

async function handleWeatherAdvice(request, response) {
  const requestId = Math.random().toString(36).slice(2, 8)
  const body = await readJsonBody(request, 64_000)
  const rawWeather = body?.weather && typeof body.weather === "object" ? body.weather : {}
  const rawPrefs = body?.preferences && typeof body.preferences === "object" ? body.preferences : {}

  const weather = {
    city: typeof rawWeather.city === "string" ? rawWeather.city.trim().slice(0, 80) : "",
    temp: typeof rawWeather.temp === "string" ? rawWeather.temp.trim().slice(0, 20) : "",
    tempF: typeof rawWeather.tempF === "number" && Number.isFinite(rawWeather.tempF) ? Math.round(rawWeather.tempF) : undefined,
    feelsLikeF: typeof rawWeather.feelsLikeF === "number" && Number.isFinite(rawWeather.feelsLikeF) ? Math.round(rawWeather.feelsLikeF) : undefined,
    condition: typeof rawWeather.condition === "string" ? rawWeather.condition.trim().slice(0, 80) : "",
    conditionLabel: typeof rawWeather.conditionLabel === "string" ? rawWeather.conditionLabel.trim().slice(0, 60) : "",
    humidity: typeof rawWeather.humidity === "number" && Number.isFinite(rawWeather.humidity) ? Math.round(rawWeather.humidity) : undefined,
    windMph: typeof rawWeather.windMph === "number" && Number.isFinite(rawWeather.windMph) ? Math.round(rawWeather.windMph) : undefined,
  }

  if (!weather.condition && !weather.conditionLabel && !weather.temp && typeof weather.tempF !== "number") {
    sendJson(response, 400, { error: "Weather data is required to generate weather advice." })
    return
  }

  const preferences = {
    preferredStyle: typeof rawPrefs.preferredStyle === "string" ? rawPrefs.preferredStyle.trim().slice(0, 160) : "",
    homeClimate: typeof rawPrefs.homeClimate === "string" ? rawPrefs.homeClimate.trim().slice(0, 120) : "",
    stylistNotes: typeof rawPrefs.stylistNotes === "string" ? rawPrefs.stylistNotes.trim().slice(0, 400) : "",
    sensorySensitive: Boolean(rawPrefs.sensorySensitive),
    lowDecisionMode: Boolean(rawPrefs.lowDecisionMode),
    fitFeel: typeof rawPrefs.fitFeel === "string" ? rawPrefs.fitFeel.trim().slice(0, 80) : "",
    easyClosures: Boolean(rawPrefs.easyClosures),
    palette: typeof rawPrefs.palette === "string" ? rawPrefs.palette.trim().slice(0, 60) : "",
    mood: typeof rawPrefs.mood === "string" ? rawPrefs.mood.trim().slice(0, 60) : "",
    attributes: Array.isArray(rawPrefs.attributes)
      ? rawPrefs.attributes.filter((item) => typeof item === "string").map((item) => item.trim().slice(0, 50)).slice(0, 5)
      : [],
  }

  const hasExplicitCalendar =
    Array.isArray(body?.calendarEvents) || Array.isArray(body?.events)
  let calendarEvents = sanitizeIncomingCalendarEvents(body?.calendarEvents || body?.events)
  if (!hasExplicitCalendar && calendarEvents.length === 0) {
    const resolved = await resolveCalendarEvents({})
    if (!resolved.error && Array.isArray(resolved.events)) {
      calendarEvents = resolved.events
    }
  }

  logStylist(requestId, "weather-advice request", {
    city: weather.city,
    temp: weather.temp || weather.tempF,
    condition: weather.conditionLabel || weather.condition,
    sensorySensitive: preferences.sensorySensitive,
    calendarCount: calendarEvents.length,
  })

  const rawOutfitCtx =
    body?.outfitContext && typeof body.outfitContext === "object"
      ? body.outfitContext
      : {}
  const outfitContext = {
    wardrobeItems: Array.isArray(rawOutfitCtx.wardrobeItems)
      ? rawOutfitCtx.wardrobeItems
          .filter((item) => typeof item === "string" && item.trim())
          .map((item) => item.trim().slice(0, 100))
          .slice(0, 35)
      : [],
    currentOutfitLabel:
      typeof rawOutfitCtx.currentOutfitLabel === "string"
        ? rawOutfitCtx.currentOutfitLabel.trim().slice(0, 80)
        : "",
    currentOutfitItems: Array.isArray(rawOutfitCtx.currentOutfitItems)
      ? rawOutfitCtx.currentOutfitItems
          .filter((item) => typeof item === "string" && item.trim())
          .map((item) => item.trim().slice(0, 100))
          .slice(0, 6)
      : [],
  }

  try {
    const prompt = buildWeatherAdvicePrompt(
      weather,
      preferences,
      calendarEvents,
      outfitContext,
    )
    const rawAdvice = await requestModel(prompt, 0.3, { maxTokens: 90, timeoutMs: 45_000 })
    const advice = cleanWeatherAdviceText(rawAdvice)
    if (!advice) {
      throw new Error("The local model returned empty weather advice.")
    }
    logStylist(requestId, "weather-advice ready", { chars: advice.length })
    sendJson(response, 200, {
      advice,
      model: textModel,
      source: "local-model",
      calendarCount: calendarEvents.length,
    })
  } catch (error) {
    const cause = error instanceof Error && error.cause instanceof Error
      ? ` (${error.cause.message})`
      : ""
    sendJson(response, 502, {
      error: error instanceof Error
        ? `${error.message}${cause}`
        : `Could not connect to the local model server at ${textBaseUrl}.${cause}`,
    })
  }
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
  const startedAt = Date.now()
  try {
    const corsAllowed = applyCorsHeaders(request, response)

    if (request.method === "OPTIONS") {
      if (!corsAllowed) {
        response.writeHead(403)
        response.end()
        return
      }
      response.writeHead(204)
      response.end()
      return
    }

    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`)

    if (!corsAllowed && url.pathname.startsWith("/api/")) {
      console.warn(`[cors] Blocked ${request.method} ${url.pathname} from origin=${request.headers.origin}`)
      sendJson(response, 403, { error: "Origin is not allowed by host CORS policy." })
      return
    }

    if (url.pathname === "/api/stylist" && request.method === "POST") {
      const clientIp = getClientIp(request)
      const limit = checkRateLimit("stylist", clientIp, STYLIST_RATE_LIMIT_PER_MIN)
      if (!limit.allowed) {
        sendJson(
          response,
          429,
          { error: "Too many stylist requests. Please wait a few seconds and retry." },
          { "Retry-After": String(limit.retryAfterSec) },
        )
        return
      }
      if (llmInflightCount >= MAX_LLM_INFLIGHT) {
        sendJson(response, 503, { error: "Host GPU queue is busy right now. Please retry in a moment." })
        return
      }
      llmInflightCount += 1
      try {
        await handleStylist(request, response)
      } finally {
        llmInflightCount = Math.max(0, llmInflightCount - 1)
        console.log(`[api] POST /api/stylist ip=${clientIp} status=${response.statusCode} (${Date.now() - startedAt}ms)`)
      }
      return
    }

    if (url.pathname === "/api/weather/advice" && request.method === "POST") {
      const clientIp = getClientIp(request)
      const limit = checkRateLimit("weather-advice", clientIp, WEATHER_ADVICE_RATE_LIMIT_PER_MIN)
      if (!limit.allowed) {
        sendJson(
          response,
          429,
          { error: "Too many weather advice requests. Please wait a few seconds and retry." },
          { "Retry-After": String(limit.retryAfterSec) },
        )
        return
      }
      if (llmInflightCount >= MAX_LLM_INFLIGHT) {
        sendJson(response, 503, { error: "Host GPU queue is busy right now. Please retry in a moment." })
        return
      }
      llmInflightCount += 1
      try {
        await handleWeatherAdvice(request, response)
      } finally {
        llmInflightCount = Math.max(0, llmInflightCount - 1)
        console.log(`[api] POST /api/weather/advice ip=${clientIp} status=${response.statusCode} (${Date.now() - startedAt}ms)`)
      }
      return
    }

    if (url.pathname === "/api/calendar/events" && request.method === "POST") {
      const clientIp = getClientIp(request)
      const limit = checkRateLimit("calendar-events", clientIp, STYLIST_RATE_LIMIT_PER_MIN)
      if (!limit.allowed) {
        sendJson(
          response,
          429,
          { error: "Too many calendar requests. Please wait a few seconds and retry." },
          { "Retry-After": String(limit.retryAfterSec) },
        )
        return
      }
      try {
        await handleCalendarEvents(request, response)
      } finally {
        console.log(`[api] POST /api/calendar/events ip=${clientIp} status=${response.statusCode} (${Date.now() - startedAt}ms)`)
      }
      return
    }

    if (url.pathname === "/api/try-on/jobs" && request.method === "POST") {
      await handleCreateTryOnJob(request, response)
      return
    }

    // Local SQLite Profile Try-On Photo & History API
    const profilePhotoMatch = url.pathname.match(/^\/api\/profile\/([^/]+)\/tryon-photo$/)
    if (profilePhotoMatch) {
      const userId = decodeURIComponent(profilePhotoMatch[1])
      if (request.method === "GET") {
        const photo = getProfileTryOnPhoto(userId)
        sendJson(response, 200, { photo })
        return
      }
      if (request.method === "PUT" || request.method === "POST") {
        const body = await readJsonBody(request, 16 * 1024 * 1024)
        if (!body?.imageDataUrl || typeof body.imageDataUrl !== "string") {
          sendJson(response, 400, { error: "imageDataUrl is required." })
          return
        }
        try {
          const saved = saveProfileTryOnPhoto({
            userId,
            imageDataUrl: body.imageDataUrl,
            photoKind: body.photoKind === "portrait" ? "portrait" : "full_body",
            consentConfirmed: body.consentConfirmed !== false,
          })
          sendJson(response, 200, { photo: saved })
        } catch (err) {
          sendJson(response, 400, {
            error: err instanceof Error ? err.message : "Could not save profile photo.",
          })
        }
        return
      }
      if (request.method === "DELETE") {
        const result = deleteProfileTryOnPhoto(userId)
        sendJson(response, 200, result)
        return
      }
    }

    const profileHistoryMatch = url.pathname.match(/^\/api\/profile\/([^/]+)\/tryon-history$/)
    if (profileHistoryMatch && request.method === "GET") {
      const userId = decodeURIComponent(profileHistoryMatch[1])
      const items = listTryOnHistory(userId, 12)
      sendJson(response, 200, { items })
      return
    }

    if (url.pathname.startsWith("/api/try-on/jobs/")) {
      const jobId = decodeURIComponent(url.pathname.slice("/api/try-on/jobs/".length)).trim()
      if (!jobId) {
        sendJson(response, 400, { error: "Missing job ID." })
        return
      }
      if (request.method === "GET") {
        await handleGetTryOnJob(jobId, response)
        return
      }
      if (request.method === "DELETE") {
        await handleCancelTryOnJob(jobId, response)
        return
      }
    }

    if (url.pathname === "/api/try-on" && request.method === "POST") {
      await handleTryOn(request, response)
      return
    }

    if (url.pathname === "/api/wardrobe/remove-bg" && request.method === "POST") {
      try {
        const body = await readJsonBody(request, 20 * 1024 * 1024)
        const image = typeof body?.image === "string" ? body.image : ""
        if (!image) {
          sendJson(response, 400, { error: "Missing image payload." })
          return
        }
        const venvPy =
          process.platform === "win32"
            ? join(root, ".venv", "Scripts", "python.exe")
            : join(root, ".venv", "bin", "python")
        const pyExe = existsSync(venvPy) ? venvPy : "python"
        const scriptPath = join(root, "scripts", "remove_bg_cli.py")
        const maxDimension = Math.min(1024, Math.max(256, Number(body?.maxDimension) || 560))

        const result = await new Promise((resolve, reject) => {
          const child = spawn(pyExe, [scriptPath], { cwd: root })
          let stdout = ""
          let stderr = ""
          const timer = setTimeout(() => {
            child.kill()
            reject(new Error("Background removal timed out"))
          }, 15000)

          child.stdout.on("data", (chunk) => {
            stdout += chunk.toString("utf8")
          })
          child.stderr.on("data", (chunk) => {
            stderr += chunk.toString("utf8")
          })
          child.on("error", (err) => {
            clearTimeout(timer)
            reject(err)
          })
          child.on("close", (code) => {
            clearTimeout(timer)
            if (code !== 0) {
              reject(new Error(stderr.trim() || `remove_bg_cli exited with ${code}`))
              return
            }
            try {
              resolve(JSON.parse(stdout))
            } catch (parseErr) {
              reject(parseErr)
            }
          })
          child.stdin.end(JSON.stringify({ image, maxDimension }))
        })

        sendJson(response, 200, result)
      } catch (error) {
        const message = error instanceof Error ? error.message : "Background removal failed."
        sendJson(response, 503, { error: message })
      }
      return
    }

    if (url.pathname === "/api/wardrobe/scan" && request.method === "POST") {
      const clientIp = getClientIp(request)
      const limit = checkRateLimit("scan", clientIp, SCAN_RATE_LIMIT_PER_MIN)
      if (!limit.allowed) {
        sendJson(
          response,
          429,
          { error: "Too many photo scan requests. Please wait a few seconds and retry." },
          { "Retry-After": String(limit.retryAfterSec) },
        )
        return
      }
      if (llmInflightCount >= MAX_LLM_INFLIGHT) {
        sendJson(response, 503, { error: "Host GPU queue is busy right now. Please retry in a moment." })
        return
      }
      llmInflightCount += 1
      try {
        await handleWardrobeScan(request, response)
      } finally {
        llmInflightCount = Math.max(0, llmInflightCount - 1)
        console.log(`[api] POST /api/wardrobe/scan ip=${clientIp} status=${response.statusCode} (${Date.now() - startedAt}ms)`)
      }
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
      const backendStatus = backend?.status
      const healthStatus = !backend
        ? "unavailable"
        : backendStatus === "loading"
          ? "loading"
          : backendStatus === "error"
            ? "error"
            : "ok"
      const httpCode = healthStatus === "ok" || healthStatus === "loading" ? 200 : 503
      sendJson(response, httpCode, {
        status: healthStatus,
        proxyPort: port,
        backendUrl: backendHealthUrl,
        backend,
        queue: {
          tryOnRunning: activeTryOnJobId ? 1 : 0,
          tryOnQueued: tryOnQueue.length,
          maxQueue: MAX_TRYON_QUEUE,
        },
        features: {
          stylist: true,
          weatherAdvice: true,
          wardrobeScan: true,
          tryOn: true,
          calendar: true,
          profilePhotoDb: true,
        },
        database: getDbStats(),
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

server.listen(port, bindHost, () => {
  console.log(`tAIlor server listening on http://${bindHost}:${port}`)
  if (configuredAllowedOrigins.size > 0) {
    console.log(`CORS allowed origins: ${Array.from(configuredAllowedOrigins).join(", ")}`)
  } else {
    console.log("CORS allowed origins: localhost / 127.0.0.1 / same-host (set ALLOWED_ORIGINS for Render)")
  }
})
