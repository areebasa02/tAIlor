import { getApiBaseUrl, getApiUrl } from "../lib/aiHost"
import { parseIcsEvents } from "../lib/icsParse"
import type { CalendarEvent } from "../types"

export type CalendarEventsSource = "env" | "url" | "upload" | "mock" | "local"

export type CalendarEventsResult = {
  events: CalendarEvent[]
  source: CalendarEventsSource
  feedUrl?: string | null
  note?: string
}

function normalizeEvent(raw: Partial<CalendarEvent> & { title?: string; start?: string; end?: string }): CalendarEvent | null {
  const summary = String(raw.summary || raw.title || "").trim()
  const dtstart = String(raw.dtstart || raw.start || "").trim()
  if (!summary || !dtstart) return null
  const startDate = new Date(dtstart)
  if (Number.isNaN(startDate.getTime())) return null
  const dtend = String(raw.dtend || raw.end || "").trim()
  const endDate = dtend ? new Date(dtend) : null
  const allDay = Boolean(raw.allDay)
  const timeLabel =
    typeof raw.timeLabel === "string" && raw.timeLabel.trim()
      ? raw.timeLabel.trim()
      : allDay
        ? "All day"
        : startDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })

  return {
    id: String(raw.id || `${dtstart}::${summary}`).slice(0, 120),
    summary: summary.slice(0, 160),
    dtstart: startDate.toISOString(),
    dtend:
      endDate && !Number.isNaN(endDate.getTime())
        ? endDate.toISOString()
        : new Date(startDate.getTime() + 60 * 60 * 1000).toISOString(),
    location: typeof raw.location === "string" ? raw.location.trim().slice(0, 160) : "",
    description: typeof raw.description === "string" ? raw.description.trim().slice(0, 400) : "",
    allDay,
    timeLabel,
  }
}

/** Clear guidance when Static Site has no Node API / wrong VITE_API_BASE_URL. */
export function calendarApiUnreachableMessage(kind: "url" | "refresh" | "generic" = "generic"): string {
  const hasOverride = Boolean(getApiBaseUrl())
  if (kind === "url") {
    return hasOverride
      ? "Connect URL needs a reachable Node API, but VITE_API_BASE_URL (or ?api=) did not respond. Keep server/server.mjs running on that host, or upload a .ics file instead (works without a backend)."
      : "Connect URL needs the Node API. On Render Static Site there is no /api proxy — upload a .ics file instead, or set build-time VITE_API_BASE_URL to a running host (Tailscale Funnel), or redeploy as a Web Service with start command `pnpm start`."
  }
  if (kind === "refresh") {
    return hasOverride
      ? "Calendar API unreachable at VITE_API_BASE_URL. Upload a .ics file (works offline) or start the Node host."
      : "No calendar API on this Static Site. Upload a .ics file to add events, or set VITE_API_BASE_URL / deploy Node with `pnpm start`."
  }
  return hasOverride
    ? "Calendar host is offline or unreachable at the configured API URL."
    : "Calendar host is offline or unreachable (Static Site has no Node /api)."
}

async function postCalendarEvents(
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<CalendarEventsResult> {
  let response: Response
  try {
    response = await fetch(getApiUrl("/api/calendar/events"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      signal,
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error(calendarApiUnreachableMessage("generic"))
  }

  const contentType = response.headers.get("content-type") || ""
  if (!contentType.includes("application/json")) {
    // Static hosts often SPA-fallback HTML for unknown /api routes.
    throw new Error(calendarApiUnreachableMessage("generic"))
  }

  const payload = (await response.json().catch(() => ({}))) as {
    events?: unknown[]
    source?: CalendarEventsSource
    feedUrl?: string | null
    note?: string
    error?: string
  }

  if (!response.ok) {
    throw new Error(payload.error || "Could not load calendar events.")
  }

  const events = Array.isArray(payload.events)
    ? payload.events
        .map((item) => normalizeEvent((item || {}) as Partial<CalendarEvent>))
        .filter((item): item is CalendarEvent => Boolean(item))
    : []

  return {
    events,
    source: payload.source || "mock",
    feedUrl: payload.feedUrl,
    note: payload.note,
  }
}

/** Load upcoming events from env ICS URL (server-side) or demo mock. */
export async function fetchCalendarEvents(signal?: AbortSignal): Promise<CalendarEventsResult> {
  try {
    return await postCalendarEvents({}, signal)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : calendarApiUnreachableMessage("refresh")
    // Soft failure for boot refresh — caller may keep prior events.
    throw new Error(
      message.includes("unreachable") || message.includes("Static Site")
        ? calendarApiUnreachableMessage("refresh")
        : message,
    )
  }
}

/** Fetch a public/secret Google Calendar .ics URL via the Node proxy (CORS-safe). */
export async function fetchCalendarEventsFromUrl(
  url: string,
  signal?: AbortSignal,
): Promise<CalendarEventsResult> {
  try {
    return await postCalendarEvents({ url }, signal)
  } catch (error) {
    const raw = error instanceof Error ? error.message : ""
    if (
      !raw ||
      /unreachable|offline|Static Site|Failed to fetch|NetworkError|load failed/i.test(raw)
    ) {
      throw new Error(calendarApiUnreachableMessage("url"))
    }
    throw error instanceof Error ? error : new Error(String(error))
  }
}

/**
 * Parse an uploaded .ics file in the browser.
 * Works on Render Static Site with no Node server and no VITE_API_BASE_URL.
 */
export async function parseUploadedIcs(
  icsText: string,
  _signal?: AbortSignal,
): Promise<CalendarEventsResult> {
  const events = parseIcsEvents(icsText)
  return {
    events,
    source: "local",
    feedUrl: null,
    note: `Parsed ${events.length} event${events.length === 1 ? "" : "s"} in the browser (no server required).`,
  }
}

export function formatEventForStylist(event: CalendarEvent): string {
  const parts = [event.summary]
  if (event.timeLabel) parts.push(event.timeLabel)
  if (event.location) parts.push(`at ${event.location}`)
  if (event.description) {
    const short = event.description.replace(/\s+/g, " ").trim().slice(0, 80)
    if (short) parts.push(`— ${short}`)
  }
  return parts.join(", ")
}

export function guessDresscodeFromEvent(event: CalendarEvent): string {
  const hay = `${event.summary} ${event.description} ${event.location}`.toLowerCase()
  if (/\b(black tie|gala|wedding|formal)\b/.test(hay)) return "Formal"
  if (/\b(interview|board|client|pitch|business|office)\b/.test(hay)) return "Business"
  if (/\b(gallery|creative|opening|show)\b/.test(hay)) return "Creative"
  if (/\b(networking|dinner|lunch|presentation|conference)\b/.test(hay)) return "Smart-casual"
  if (/\b(hike|errand|casual|brunch|coffee)\b/.test(hay)) return "Casual"
  return "Smart-casual"
}
