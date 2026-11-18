const API_OVERRIDE_KEY = "tailor_api_base_url"

export type AiHostStatusState = "checking" | "online" | "loading" | "offline"

export type AiHostHealthPayload = {
  status: "ok" | "loading" | "unavailable" | "error"
  proxyPort?: number
  backendUrl?: string
  error?: string
  queue?: {
    tryOnRunning?: number
    tryOnQueued?: number
    maxQueue?: number
  }
  features?: {
    stylist?: boolean
    wardrobeScan?: boolean
    tryOn?: boolean
  }
  backend?: {
    status?: string
    load_state?: string
    loading_stage?: string
    load_error?: string | null
    active_task?: string | null
    queued_tasks?: number
    models?: {
      text?: string
      vision?: string
      tryon?: string
    }
    loaded?: {
      text?: boolean
      vision?: boolean
      tryon?: boolean
    }
  } | null
}

function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "")
  if (!trimmed) return ""
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return ""
    return parsed.origin + (parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/, ""))
  } catch {
    return ""
  }
}

export function getApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    try {
      const params = new URLSearchParams(window.location.search)
      const queryOverride = params.get("api")
      if (queryOverride !== null) {
        if (queryOverride.trim().toLowerCase() === "reset") {
          window.localStorage.removeItem(API_OVERRIDE_KEY)
        } else {
          const normalized = normalizeBaseUrl(queryOverride)
          if (normalized) {
            window.localStorage.setItem(API_OVERRIDE_KEY, normalized)
            return normalized
          }
        }
      }
      const saved = window.localStorage.getItem(API_OVERRIDE_KEY)
      if (saved) {
        const normalized = normalizeBaseUrl(saved)
        if (normalized) return normalized
      }
    } catch {
      // Ignore storage/URL errors in restricted contexts
    }
  }

  const envUrl =
    typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE_URL
      ? normalizeBaseUrl(String(import.meta.env.VITE_API_BASE_URL))
      : ""
  return envUrl
}

export function getApiDisplayHost(): string {
  const base = getApiBaseUrl()
  if (!base) return "Local Dev Proxy (/api)"
  try {
    return new URL(base).host
  } catch {
    return base
  }
}

export function getApiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`
  const base = getApiBaseUrl()
  return base ? `${base}${normalizedPath}` : normalizedPath
}

export function formatAiErrorMessage(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : ""
  const lower = raw.toLowerCase()
  if (
    !raw ||
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("load failed") ||
    lower.includes("err_connection") ||
    lower.includes("502") ||
    lower.includes("503") ||
    lower.includes("unavailable") ||
    lower.includes("econnrefused") ||
    lower.includes("static host returned html")
  ) {
    return raw && (lower.includes("warming up") || lower.includes("still loading"))
      ? raw
      : "The AI host PC is offline or still starting. Ask the host to run tAIlor AI Host on their PC, then retry."
  }
  return raw || fallback
}

export async function fetchAiHostHealth(
  signal?: AbortSignal,
): Promise<{
  state: AiHostStatusState
  payload: AiHostHealthPayload | null
  errorMessage?: string
}> {
  const controller = new AbortController()
  const onAbort = () => controller.abort()
  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener("abort", onAbort, { once: true })
  }
  const timeout = setTimeout(() => controller.abort(), 5000)

  try {
    const response = await fetch(getApiUrl("/api/ai/health"), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })

    const contentType = response.headers.get("content-type") || ""
    if (!contentType.includes("application/json")) {
      return {
        state: "offline",
        payload: null,
        errorMessage: "AI backend URL is not reachable (static host returned HTML).",
      }
    }

    const payload = (await response.json().catch(() => null)) as AiHostHealthPayload | null
    if (!payload) {
      return {
        state: "offline",
        payload: null,
        errorMessage: "Received an empty health response from the AI host.",
      }
    }

    if (payload.status === "ok" && response.ok) {
      return { state: "online", payload }
    }
    if (payload.status === "loading" || payload.backend?.load_state === "loading") {
      return {
        state: "loading",
        payload,
        errorMessage: payload.backend?.loading_stage || "Loading AI models on host GPU…",
      }
    }
    return {
      state: "offline",
      payload,
      errorMessage:
        payload.error ||
        payload.backend?.load_error ||
        "Host PC GPU server is not running yet.",
    }
  } catch (err) {
    return {
      state: "offline",
      payload: null,
      errorMessage: formatAiErrorMessage(err, "AI host PC is unreachable."),
    }
  } finally {
    clearTimeout(timeout)
    if (signal) signal.removeEventListener("abort", onAbort)
  }
}

export type TryOnJobProgress = {
  jobId: string
  status: "queued" | "running" | "completed" | "failed"
  position?: number
  totalQueued?: number
  elapsedMs?: number
}

export type TryOnJobResult = {
  imageUrl: string
  model?: string
  runs?: number
  elapsedMs?: number
}

export async function submitAndPollTryOnJob(
  requestBody: Record<string, unknown>,
  options: {
    signal?: AbortSignal
    onProgress?: (progress: TryOnJobProgress) => void
  } = {},
): Promise<TryOnJobResult> {
  const createResp = await fetch(getApiUrl("/api/try-on/jobs"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(requestBody),
    signal: options.signal,
  })

  const contentType = createResp.headers.get("content-type") || ""
  if (!contentType.includes("application/json")) {
    throw new Error("Host PC AI server is offline or unreachable right now.")
  }

  const created = (await createResp.json().catch(() => ({}))) as {
    jobId?: string
    status?: "queued" | "running" | "completed" | "failed"
    position?: number
    totalQueued?: number
    imageUrl?: string
    model?: string
    runs?: number
    error?: string
  }

  if (!createResp.ok) {
    throw new Error(created.error || `Virtual Try-On request failed (HTTP ${createResp.status}).`)
  }

  // Allow direct completion if server responded synchronously
  if (created.imageUrl) {
    return {
      imageUrl: created.imageUrl,
      model: created.model,
      runs: created.runs,
    }
  }

  const jobId = created.jobId
  if (!jobId) {
    throw new Error("Try-On server did not return a job ID.")
  }

  options.onProgress?.({
    jobId,
    status: created.status || "queued",
    position: created.position,
    totalQueued: created.totalQueued,
  })

  const cancelJob = () => {
    void fetch(getApiUrl(`/api/try-on/jobs/${encodeURIComponent(jobId)}`), {
      method: "DELETE",
    }).catch(() => {})
  }

  if (options.signal) {
    options.signal.addEventListener("abort", cancelJob, { once: true })
  }

  try {
    const deadline = Date.now() + 8 * 60_000
    while (Date.now() < deadline) {
      if (options.signal?.aborted) {
        throw new DOMException("Try-On cancelled", "AbortError")
      }

      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          options.signal?.removeEventListener("abort", onAbort)
          resolve()
        }, 1400)
        const onAbort = () => {
          clearTimeout(timer)
          reject(new DOMException("Try-On cancelled", "AbortError"))
        }
        options.signal?.addEventListener("abort", onAbort, { once: true })
      })

      const pollResp = await fetch(
        getApiUrl(`/api/try-on/jobs/${encodeURIComponent(jobId)}`),
        {
          method: "GET",
          headers: { Accept: "application/json" },
          signal: options.signal,
        },
      )

      const pollContentType = pollResp.headers.get("content-type") || ""
      if (!pollContentType.includes("application/json")) {
        throw new Error("Lost connection to the host PC while waiting for Try-On.")
      }

      const job = (await pollResp.json().catch(() => ({}))) as {
        jobId?: string
        status?: "queued" | "running" | "completed" | "failed"
        position?: number
        totalQueued?: number
        elapsedMs?: number
        imageUrl?: string
        model?: string
        runs?: number
        error?: string
      }

      if (!pollResp.ok) {
        throw new Error(job.error || `Try-On job status failed (HTTP ${pollResp.status}).`)
      }

      options.onProgress?.({
        jobId,
        status: job.status || "running",
        position: job.position,
        totalQueued: job.totalQueued,
        elapsedMs: job.elapsedMs,
      })

      if (job.status === "completed" && job.imageUrl) {
        return {
          imageUrl: job.imageUrl,
          model: job.model,
          runs: job.runs,
          elapsedMs: job.elapsedMs,
        }
      }

      if (job.status === "failed") {
        throw new Error(job.error || "Virtual Try-On generation failed on the host GPU.")
      }
    }

    throw new Error("Virtual Try-On timed out waiting for the host GPU queue.")
  } finally {
    if (options.signal) {
      options.signal.removeEventListener("abort", cancelJob)
    }
  }
}
