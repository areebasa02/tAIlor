import { getApiUrl } from "../lib/aiHost"
import type { CalendarEvent } from "../types"

export type CalendarEventsSource = "env" | "url" | "upload" | "mock"

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

async function postCalendarEvents(
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<CalendarEventsResult> {
  const response = await fetch(getApiUrl("/api/calendar/events"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    signal,
    body: JSON.stringify(body),
  })

  const contentType = response.headers.get("content-type") || ""
  if (!contentType.includes("application/json")) {
    throw new Error("Calendar host is offline or unreachable.")
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
  return postCalendarEvents({}, signal)
}

/** Fetch a public/secret Google Calendar .ics URL via the Node proxy. */
export async function fetchCalendarEventsFromUrl(
  url: string,
  signal?: AbortSignal,
): Promise<CalendarEventsResult> {
  return postCalendarEvents({ url }, signal)
}

/** Parse an uploaded .ics file through the Node parser. */
export async function parseUploadedIcs(
  icsText: string,
  signal?: AbortSignal,
): Promise<CalendarEventsResult> {
  return postCalendarEvents({ ics: icsText }, signal)
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
