import { getApiBaseUrl, getApiUrl } from "../lib/aiHost"
import { parseIcsCalendar } from "../lib/icsParser"
import type { CalendarEvent, PersonaId } from "../types"

export type CalendarEventsSource = "env" | "url" | "upload" | "mock"

export type CalendarEventsResult = {
  events: CalendarEvent[]
  source: CalendarEventsSource
  feedUrl?: string | null
  note?: string
}

export type StoredCalendarState = {
  events: CalendarEvent[]
  source: CalendarEventsSource
  feedUrl?: string | null
  note?: string
  savedAt: number
}

const CALENDAR_STORAGE_PREFIX = "tailor_calendar_"

export function loadSavedCalendar(personaId: PersonaId): StoredCalendarState | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(`${CALENDAR_STORAGE_PREFIX}${personaId}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredCalendarState
    if (!Array.isArray(parsed?.events)) return null
    if (parsed.source !== "upload" && parsed.source !== "url") return null
    return {
      events: parsed.events,
      source: parsed.source,
      feedUrl: parsed.feedUrl ?? null,
      note: typeof parsed.note === "string" ? parsed.note : "",
      savedAt: Number(parsed.savedAt) || Date.now(),
    }
  } catch {
    return null
  }
}

export function saveCalendarForPersona(
  personaId: PersonaId,
  state: Omit<StoredCalendarState, "savedAt">,
): void {
  if (typeof window === "undefined") return
  try {
    const payload: StoredCalendarState = {
      ...state,
      savedAt: Date.now(),
    }
    window.localStorage.setItem(
      `${CALENDAR_STORAGE_PREFIX}${personaId}`,
      JSON.stringify(payload),
    )
  } catch {
    // Ignore storage quota or private mode errors.
  }
}

export function clearSavedCalendarForPersona(personaId: PersonaId): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(`${CALENDAR_STORAGE_PREFIX}${personaId}`)
  } catch {
    // Ignore storage errors.
  }
}

type DemoEventTemplate = {
  dayOffset: number
  hour: number
  minute: number
  durationMinutes: number
  summary: string
  location: string
  description: string
}

const PERSONA_DEMO_TEMPLATES: Record<PersonaId, DemoEventTemplate[]> = {
  eliora: [
    {
      dayOffset: 0,
      hour: 9,
      minute: 30,
      durationMinutes: 60,
      summary: "Morning coffee & journaling",
      location: "Neighborhood café",
      description: "Quiet start in soft, comfortable layers.",
    },
    {
      dayOffset: 0,
      hour: 13,
      minute: 30,
      durationMinutes: 90,
      summary: "Design studio critique",
      location: "Art building",
      description: "Creative afternoon session — expressive colors welcome.",
    },
    {
      dayOffset: 0,
      hour: 19,
      minute: 0,
      durationMinutes: 120,
      summary: "Indie vinyl night",
      location: "Local listening bar",
      description: "Evening show with friends — layered pastel-goth vibe.",
    },
    {
      dayOffset: 1,
      hour: 11,
      minute: 0,
      durationMinutes: 60,
      summary: "Thrift & vintage market",
      location: "Arts district",
      description: "Easy walking shoes and breathable fabrics.",
    },
  ],
  ethan: [
    {
      dayOffset: 0,
      hour: 9,
      minute: 0,
      durationMinutes: 45,
      summary: "Coffee with mentor",
      location: "Midtown café",
      description: "Informational catch-up — smart-casual.",
    },
    {
      dayOffset: 0,
      hour: 13,
      minute: 30,
      durationMinutes: 60,
      summary: "Project presentation",
      location: "Conference room B",
      description: "Polished business-casual presentation.",
    },
    {
      dayOffset: 0,
      hour: 18,
      minute: 30,
      durationMinutes: 90,
      summary: "Alumni networking dinner",
      location: "Downtown bistro",
      description: "Evening mixer — smart casual.",
    },
    {
      dayOffset: 1,
      hour: 12,
      minute: 0,
      durationMinutes: 60,
      summary: "Lunch with college friends",
      location: "Garden patio",
      description: "Relaxed midday catch-up.",
    },
  ],
  jordan: [
    {
      dayOffset: 0,
      hour: 9,
      minute: 30,
      durationMinutes: 60,
      summary: "Morning walk & errands",
      location: "Local park",
      description: "Low-key morning outdoors in comfortable basics.",
    },
    {
      dayOffset: 0,
      hour: 13,
      minute: 0,
      durationMinutes: 120,
      summary: "Afternoon library work",
      location: "Campus library",
      description: "Focused study block — relaxed, breathable layers.",
    },
    {
      dayOffset: 0,
      hour: 18,
      minute: 30,
      durationMinutes: 90,
      summary: "Casual dinner with friends",
      location: "Neighborhood tacos",
      description: "Easy evening hangout.",
    },
    {
      dayOffset: 1,
      hour: 10,
      minute: 30,
      durationMinutes: 60,
      summary: "Weekend farmers market",
      location: "Town square",
      description: "Simple everyday outfit for walking.",
    },
  ],
  josephine: [
    {
      dayOffset: 0,
      hour: 10,
      minute: 0,
      durationMinutes: 75,
      summary: "Book club meetup",
      location: "Community center",
      description: "Cozy morning discussion in soft natural fibers.",
    },
    {
      dayOffset: 0,
      hour: 14,
      minute: 0,
      durationMinutes: 90,
      summary: "Museum audio tour",
      location: "City art museum",
      description: "Afternoon exhibit walk — comfortable shoes.",
    },
    {
      dayOffset: 0,
      hour: 18,
      minute: 30,
      durationMinutes: 90,
      summary: "Acoustic jazz evening",
      location: "Listening room",
      description: "Relaxed evening out with high-contrast layers.",
    },
    {
      dayOffset: 1,
      hour: 11,
      minute: 0,
      durationMinutes: 60,
      summary: "Botanical garden stroll",
      location: "Conservatory",
      description: "Light layers for indoor/outdoor temps.",
    },
  ],
  areeba: [
    {
      dayOffset: 0,
      hour: 9,
      minute: 30,
      durationMinutes: 45,
      summary: "Morning espresso & sketch",
      location: "Corner bakery",
      description: "Creative start before campus.",
    },
    {
      dayOffset: 0,
      hour: 13,
      minute: 0,
      durationMinutes: 90,
      summary: "Senior capstone workshop",
      location: "Campus studio",
      description: "Smart-casual collaborative session.",
    },
    {
      dayOffset: 0,
      hour: 18,
      minute: 30,
      durationMinutes: 90,
      summary: "Gallery opening",
      location: "Arts district",
      description: "Creative chic evening with statement accents.",
    },
    {
      dayOffset: 1,
      hour: 12,
      minute: 30,
      durationMinutes: 60,
      summary: "Brunch with classmates",
      location: "Sunny courtyard",
      description: "Light, breathable layers for humid weather.",
    },
  ],
}

export function getPersonaDemoEvents(
  personaId: PersonaId,
  now = new Date(),
): CalendarEvent[] {
  const templates = PERSONA_DEMO_TEMPLATES[personaId] || PERSONA_DEMO_TEMPLATES.eliora
  const y = now.getFullYear()
  const m = now.getMonth()
  const d = now.getDate()

  return templates.map((tpl) => {
    const start = new Date(y, m, d + tpl.dayOffset, tpl.hour, tpl.minute, 0, 0)
    const end = new Date(
      y,
      m,
      d + tpl.dayOffset,
      tpl.hour,
      tpl.minute + tpl.durationMinutes,
      0,
      0,
    )
    return {
      id: `demo-${personaId}-${tpl.dayOffset}-${tpl.summary.toLowerCase().replace(/\s+/g, "-")}`,
      summary: tpl.summary,
      dtstart: start.toISOString(),
      dtend: end.toISOString(),
      location: tpl.location,
      description: tpl.description,
      allDay: false,
      timeLabel: start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
    }
  })
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

class CalendarHostUnreachableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CalendarHostUnreachableError"
  }
}

/** Clear actionable guidance when Render Static Site has no Node API or VITE_API_BASE_URL is offline. */
export function calendarApiUnreachableMessage(
  kind: "url" | "refresh" | "generic" = "generic",
): string {
  const hasOverride = Boolean(getApiBaseUrl())
  if (kind === "url") {
    return hasOverride
      ? "Connect URL could not reach your Node API (VITE_API_BASE_URL) and the calendar provider blocked direct browser CORS. Start tAIlor AI Host on your PC, or use Upload .ics or Google .zip above (works in-browser with no backend)."
      : "Connect URL needs the Node API when a calendar provider blocks direct browser CORS (Google, Apple, Outlook). On Render Static Site, use Upload .ics or Google .zip above (works with no backend), or set VITE_API_BASE_URL to your tAIlor AI Host."
  }
  if (kind === "refresh") {
    return hasOverride
      ? "Calendar API unreachable at VITE_API_BASE_URL. Upload a .ics/.zip file (works offline) or start tAIlor AI Host."
      : "No calendar API on this Static Site. Upload a .ics/.zip file to import events in-browser, or configure VITE_API_BASE_URL."
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
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw err
    }
    throw new CalendarHostUnreachableError(calendarApiUnreachableMessage("generic"))
  }

  const contentType = response.headers.get("content-type") || ""
  if (!contentType.includes("application/json")) {
    // Render Static Site returns its HTML SPA fallback for /api/* routes when no backend is configured.
    throw new CalendarHostUnreachableError(calendarApiUnreachableMessage("generic"))
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
  } catch (err) {
    if (err instanceof CalendarHostUnreachableError) {
      throw new Error(calendarApiUnreachableMessage("refresh"))
    }
    throw err
  }
}

/**
 * Fetch a public/secret .ics URL via the Node proxy first (CORS-safe), then
 * attempt direct browser fetch+parse for CORS-enabled feeds when on a Static Site.
 */
export async function fetchCalendarEventsFromUrl(
  url: string,
  signal?: AbortSignal,
): Promise<CalendarEventsResult> {
  const normalizedUrl = url.trim().replace(/^webcals?:\/\//i, "https://")
  try {
    return await postCalendarEvents(
      { url: normalizedUrl, limit: 250, horizonHours: 2880 },
      signal,
    )
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error
    }
    if (!(error instanceof CalendarHostUnreachableError)) {
      throw error instanceof Error ? error : new Error(String(error))
    }

    // Node API is unreachable (e.g. Render Static Site with no active host):
    // attempt direct browser fetch+parse in case the feed endpoint allows CORS.
    try {
      const parsedUrl = new URL(normalizedUrl)
      if (parsedUrl.protocol === "https:" || parsedUrl.protocol === "http:") {
        const directResp = await fetch(parsedUrl.toString(), {
          method: "GET",
          headers: { Accept: "text/calendar, text/plain, */*" },
          signal,
        })
        if (directResp.ok) {
          const text = await directResp.text()
          if (/BEGIN:VCALENDAR|BEGIN:VEVENT/i.test(text)) {
            const events = parseIcsCalendar(text, {
              pastDays: 60,
              futureDays: 120,
              limit: 250,
            })
            return {
              events,
              source: "url",
              feedUrl: normalizedUrl,
              note: `Loaded ${events.length} event${events.length === 1 ? "" : "s"} from URL in the browser.`,
            }
          }
        }
      }
    } catch (directErr) {
      if (directErr instanceof DOMException && directErr.name === "AbortError") {
        throw directErr
      }
      // Expected when Google/Apple/Outlook block browser CORS — fall through to actionable Static-Site guidance.
    }

    throw new Error(calendarApiUnreachableMessage("url"))
  }
}

/** Parse an uploaded .ics file directly in the browser (no backend required). */
export async function parseUploadedIcs(
  icsText: string,
): Promise<CalendarEventsResult> {
  const events = parseIcsCalendar(icsText, {
    pastDays: 60,
    futureDays: 120,
    limit: 250,
  })
  return {
    events,
    source: "upload",
    feedUrl: null,
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
