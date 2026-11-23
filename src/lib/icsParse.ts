import type { CalendarEvent } from "../types"

function unfoldIcsText(text: string): string {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n[ \t]/g, "")
}

function unescapeIcsValue(value: string): string {
  return String(value || "")
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim()
}

function parseIcsDateTime(
  rawValue: string,
  params = "",
): { date: Date; allDay: boolean } | null {
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

function getIcsProperty(
  block: string,
  name: string,
): { value: string; params: string } | null {
  const lines = unfoldIcsText(block).split("\n")
  const prefix = String(name || "").toUpperCase()
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

function formatCalendarTime(date: Date, allDay: boolean): string {
  if (allDay) return "All day"
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
}

export type ParseIcsOptions = {
  /** Include events starting this many days before today (default 60). */
  pastDays?: number
  /** Include events starting this many days after today (default 120). */
  futureDays?: number
  /** Max events to return (default 250). */
  limit?: number
  now?: Date
}

/**
 * Browser-side .ics parser for static hosting (Render Static Site).
 * Does not need the Node API — file upload works offline.
 */
export function parseIcsEvents(icsText: string, options: ParseIcsOptions = {}): CalendarEvent[] {
  const pastDays = Math.max(0, Number(options.pastDays) || 60)
  const futureDays = Math.max(1, Number(options.futureDays) || 120)
  const limit = Math.max(1, Number(options.limit) || 250)
  const now = options.now instanceof Date ? options.now : new Date()
  const windowStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - pastDays,
    0,
    0,
    0,
    0,
  )
  const windowEnd = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + futureDays,
    23,
    59,
    59,
    999,
  )

  if (!/BEGIN:VCALENDAR/i.test(icsText) && !/BEGIN:VEVENT/i.test(icsText)) {
    throw new Error("That file does not look like a valid .ics calendar export.")
  }
  if (icsText.length > 2_000_000) {
    throw new Error("Calendar file is too large (max ~2 MB).")
  }

  const unfolded = unfoldIcsText(icsText)
  const blocks = unfolded.split(/BEGIN:VEVENT/i).slice(1)
  const events: CalendarEvent[] = []

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
    if (endDate && endDate.getTime() < startParsed.date.getTime()) {
      endDate = new Date(endDate.getTime() + 24 * 60 * 60 * 1000)
    }

    const allDay = startParsed.allDay || Boolean(endParsed?.allDay)
    const startDate = startParsed.date
    const resolvedEnd =
      endDate && !Number.isNaN(endDate.getTime())
        ? endDate
        : allDay
          ? new Date(
              startDate.getFullYear(),
              startDate.getMonth(),
              startDate.getDate(),
              23,
              59,
              59,
              999,
            )
          : new Date(startDate.getTime() + 60 * 60 * 1000)

    const endMs = resolvedEnd.getTime()
    const startMs = startDate.getTime()
    if (endMs < windowStart.getTime() || startMs > windowEnd.getTime()) continue

    const summary = (summaryProp?.value || "Untitled event").trim().slice(0, 160)
    events.push({
      id: (uidProp?.value || `${startDate.toISOString()}::${summary}`).slice(0, 120),
      summary,
      dtstart: startDate.toISOString(),
      dtend: resolvedEnd.toISOString(),
      location: (locationProp?.value || "").trim().slice(0, 160),
      description: (descriptionProp?.value || "").trim().slice(0, 400),
      allDay,
      timeLabel: formatCalendarTime(startDate, allDay),
    })
  }

  events.sort((a, b) => a.dtstart.localeCompare(b.dtstart))
  return events.slice(0, limit)
}
