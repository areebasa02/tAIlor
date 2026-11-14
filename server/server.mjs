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
const model = process.env.LLM_MODEL || "meta-llama/Llama-3.2-1B-Instruct"
const llmBaseUrl = (process.env.LLM_BASE_URL || "http://127.0.0.1:8000/v1").replace(/\/+$/, "")
const inferenceUrl = `${llmBaseUrl}/chat/completions`
const debugStylist = process.env.STYLIST_DEBUG !== "false"

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

async function readJsonBody(request) {
  let body = ""
  for await (const chunk of request) {
    body += chunk
    if (body.length > 10_000) throw new Error("Request body is too large.")
  }
  return JSON.parse(body || "{}")
}

async function requestModel(prompt) {
  const inferenceResponse = await fetch(inferenceUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.LLM_API_KEY
        ? { Authorization: `Bearer ${process.env.LLM_API_KEY}` }
        : {}),
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 450,
      temperature: 0.3,
    }),
  })

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
  const body = await readJsonBody(request)
  const event = typeof body.event === "string" ? body.event.trim() : ""
  const dresscode = typeof body.dresscode === "string" ? body.dresscode.trim() : ""
  const wardrobe = Array.isArray(body.wardrobe)
    ? body.wardrobe
        .filter((item) => item && typeof item.name === "string")
        .slice(0, 40)
        .map((item) => `${item.name} (${item.category || "item"}, ${item.color || "unknown color"})`)
        .join(", ")
    : ""
  const wardrobeItems = Array.isArray(body.wardrobe)
    ? body.wardrobe
        .filter((item) => item && typeof item.name === "string")
        .slice(0, 40)
    : []
  logStylist(requestId, "request", {
    event,
    dresscode,
    wardrobeCount: wardrobeItems.length,
  })

  if (event.length < 14) {
    sendJson(response, 400, { error: "Please describe the event in more detail." })
    return
  }

  const sharedPrompt = [
    "You are a practical personal stylist.",
    `Create one outfit recommendation for this event: ${event}.`,
    dresscode ? `Target dress code: ${dresscode}.` : "",
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
      requestModel(`${sharedPrompt}\nMake this look polished and understated.`),
      requestModel(`${sharedPrompt}\nMake this look more expressive and distinctive.`),
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
          items: wardrobeItems.slice(0, 3),
        }
      }
      if (!outfit || typeof outfit !== "object") {
        throw new Error("The stylist model returned incomplete outfit data.")
      }
      if (!Array.isArray(outfit.items) || outfit.items.length < 2) {
        usedFallback = true
        fallbackReason = "missing-items"
        outfit.items = wardrobeItems.slice(0, 3)
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
        .map((generatedItem) => {
          const description = String(generatedItem.desc || "").toLowerCase()
          return wardrobeItems.find((wardrobeItem) => {
            const name = wardrobeItem.name.toLowerCase()
            return description === name || description.includes(name) || name.includes(description)
          })
        })
        .filter(Boolean)
      if (generatedMatches.length < 2) {
        usedFallback = true
        fallbackReason ||= "unmatched-items"
      }
      const candidates = generatedMatches
        .filter((item) => {
          if (usedWardrobeNames.has(item.name)) return false
          const category = categoryKey(item)
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
        : `Could not connect to the local/Colab model server at ${llmBaseUrl}.${cause}`,
    })
    return
  }

  sendJson(response, 200, {
    advice: `Two ${dresscode || "personalized"} looks selected from your wardrobe: ${generated
      .map((outfit) => outfit.label)
      .join(" and ")}.`,
    outfits: generated,
    model,
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
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      })
      response.end()
      return
    }

    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`)
    if (url.pathname === "/api/stylist" && request.method === "POST") {
      await handleStylist(request, response)
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
