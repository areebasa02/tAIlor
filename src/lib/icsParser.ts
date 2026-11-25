import type { CalendarEvent } from "../types"

const DAY_MS = 24 * 60 * 60 * 1000
const ICS_DAY_MAP: Record<string, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
}

function unfoldIcsText(raw: string): string {
  return String(raw || "")
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

function startOfLocalDay(date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0)
}

function endOfLocalDay(date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999)
}

function formatCalendarTime(date: Date, allDay: boolean): string {
  if (allDay) return "All day"
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
}

type ParsedIcsDate = { date: Date; allDay: boolean }

function parseIcsDateTime(rawValue: string, params = ""): ParsedIcsDate | null {
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
  lines: string[],
  name: string,
): { value: string; params: string } | null {
  const prefix = name.toUpperCase()
  for (const line of lines) {
    const upper = line.toUpperCase()
    if (
      upper === prefix ||
      upper.startsWith(`${prefix}:`) ||
      upper.startsWith(`${prefix};`)
    ) {
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

function getIcsProperties(
  lines: string[],
  name: string,
): Array<{ value: string; params: string }> {
  const prefix = name.toUpperCase()
  const results: Array<{ value: string; params: string }> = []
  for (const line of lines) {
    const upper = line.toUpperCase()
    if (
      upper === prefix ||
      upper.startsWith(`${prefix}:`) ||
      upper.startsWith(`${prefix};`)
    ) {
      const colon = line.indexOf(":")
      if (colon < 0) continue
      const meta = line.slice(0, colon)
      const value = line.slice(colon + 1)
      const params = meta.includes(";") ? meta.slice(meta.indexOf(";") + 1) : ""
      results.push({ value: unescapeIcsValue(value), params })
    }
  }
  return results
}

function parseExdates(lines: string[]): Set<number> {
  const exdates = new Set<number>()
  for (const prop of getIcsProperties(lines, "EXDATE")) {
    for (const part of prop.value.split(",")) {
      const parsed = parseIcsDateTime(part.trim(), prop.params)
      if (parsed) {
        exdates.add(startOfLocalDay(parsed.date).getTime())
      }
    }
  }
  return exdates
}

function parseRrule(raw: string): {
  freq: string
  interval: number
  count?: number
  until?: Date
  byDay: number[]
} | null {
  const parts = raw
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean)
  const map: Record<string, string> = {}
  for (const part of parts) {
    const eq = part.indexOf("=")
    if (eq > 0) {
      map[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1).toUpperCase()
    }
  }
  const freq = map.FREQ
  if (!freq || !["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(freq)) {
    return null
  }
  const interval = Math.max(1, Number.parseInt(map.INTERVAL || "1", 10) || 1)
  const count = map.COUNT ? Math.max(1, Number.parseInt(map.COUNT, 10) || 0) : undefined
  let until: Date | undefined
  if (map.UNTIL) {
    const parsedUntil = parseIcsDateTime(map.UNTIL)
    if (parsedUntil) {
      until = parsedUntil.allDay ? endOfLocalDay(parsedUntil.date) : parsedUntil.date
    }
  }
  const byDay = (map.BYDAY || "")
    .split(",")
    .map((token) => token.replace(/^[+-]?\d+/, "").trim())
    .map((code) => ICS_DAY_MAP[code])
    .filter((day): day is number => typeof day === "number")

  return { freq, interval, count, until, byDay }
}

function expandRruleDates(
  start: Date,
  rruleRaw: string,
  windowStart: Date,
  windowEnd: Date,
  exdates: Set<number>,
): Date[] {
  const rule = parseRrule(rruleRaw)
  if (!rule) return [start]

  const effectiveEnd =
    rule.until && rule.until.getTime() < windowEnd.getTime() ? rule.until : windowEnd
  if (effectiveEnd.getTime() < start.getTime()) return []

  const results: Date[] = []
  const maxOccurrences = rule.count ?? 400
  let generatedCount = 0

  const pushIfValid = (candidate: Date): boolean => {
    if (candidate.getTime() < start.getTime()) return true
    if (candidate.getTime() > effectiveEnd.getTime()) return false
    generatedCount += 1
    if (generatedCount > maxOccurrences) return false
    const dayKey = startOfLocalDay(candidate).getTime()
    if (!exdates.has(dayKey) && candidate.getTime() >= windowStart.getTime()) {
      results.push(candidate)
    }
    return generatedCount < maxOccurrences
  }

  const hh = start.getHours()
  const mm = start.getMinutes()
  const ss = start.getSeconds()

  if (rule.freq === "DAILY") {
    const cursor = new Date(start.getTime())
    // Fast-forward near windowStart while respecting interval.
    if (cursor.getTime() < windowStart.getTime() && !rule.count) {
      const daysBehind = Math.floor((windowStart.getTime() - cursor.getTime()) / DAY_MS)
      const step = Math.floor(daysBehind / rule.interval) * rule.interval
      if (step > 0) cursor.setDate(cursor.getDate() + step)
    }
    while (cursor.getTime() <= effectiveEnd.getTime()) {
      if (!pushIfValid(new Date(cursor.getTime()))) break
      cursor.setDate(cursor.getDate() + rule.interval)
    }
  } else if (rule.freq === "WEEKLY") {
    const targetDays =
      rule.byDay.length > 0
        ? [...new Set(rule.byDay)].sort((a, b) => a - b)
        : [start.getDay()]
    const weekAnchor = startOfLocalDay(start)
    weekAnchor.setDate(weekAnchor.getDate() - weekAnchor.getDay())

    if (weekAnchor.getTime() < windowStart.getTime() && !rule.count) {
      const weeksBehind = Math.floor(
        (windowStart.getTime() - weekAnchor.getTime()) / (7 * DAY_MS),
      )
      const stepWeeks = Math.floor(weeksBehind / rule.interval) * rule.interval
      if (stepWeeks > 0) weekAnchor.setDate(weekAnchor.getDate() + stepWeeks * 7)
    }

    let keepGoing = true
    while (keepGoing && weekAnchor.getTime() <= effectiveEnd.getTime()) {
      for (const dow of targetDays) {
        const candidate = new Date(
          weekAnchor.getFullYear(),
          weekAnchor.getMonth(),
          weekAnchor.getDate() + dow,
          hh,
          mm,
          ss,
          0,
        )
        if (!pushIfValid(candidate)) {
          keepGoing = false
          break
        }
      }
      weekAnchor.setDate(weekAnchor.getDate() + 7 * rule.interval)
    }
  } else if (rule.freq === "MONTHLY") {
    const cursor = new Date(start.getTime())
    let guard = 0
    while (cursor.getTime() <= effectiveEnd.getTime() && guard < 240) {
      guard += 1
      if (!pushIfValid(new Date(cursor.getTime()))) break
      cursor.setMonth(cursor.getMonth() + rule.interval)
    }
  } else if (rule.freq === "YEARLY") {
    const cursor = new Date(start.getTime())
    let guard = 0
    while (cursor.getTime() <= effectiveEnd.getTime() && guard < 30) {
      guard += 1
      if (!pushIfValid(new Date(cursor.getTime()))) break
      cursor.setFullYear(cursor.getFullYear() + rule.interval)
    }
  }

  return results
}

function buildCalendarEvent(
  id: string,
  summary: string,
  startDate: Date,
  endDate: Date | null,
  allDay: boolean,
  location: string,
  description: string,
): CalendarEvent {
  const resolvedEnd =
    endDate && !Number.isNaN(endDate.getTime())
      ? endDate
      : allDay
        ? endOfLocalDay(startDate)
        : new Date(startDate.getTime() + 60 * 60 * 1000)

  return {
    id: id.slice(0, 120),
    summary: summary.slice(0, 160),
    dtstart: startDate.toISOString(),
    dtend: resolvedEnd.toISOString(),
    location: location.slice(0, 160),
    description: description.slice(0, 400),
    allDay,
    timeLabel: formatCalendarTime(startDate, allDay),
  }
}

export interface ParseIcsOptions {
  pastDays?: number
  futureDays?: number
  limit?: number
  now?: Date
}

/**
 * Parse an `.ics` calendar string in the browser, including `RRULE` recurring
 * events, keeping a multi-week window suitable for List, Week, and Month views.
 */
export function parseIcsCalendar(
  icsText: string,
  options: ParseIcsOptions = {},
): CalendarEvent[] {
  const now = options.now instanceof Date ? options.now : new Date()
  const pastDays = Math.max(0, options.pastDays ?? 7)
  const futureDays = Math.max(1, options.futureDays ?? 60)
  const limit = Math.max(1, options.limit ?? 200)

  const windowStart = new Date(startOfLocalDay(now).getTime() - pastDays * DAY_MS)
  const windowEnd = new Date(endOfLocalDay(now).getTime() + futureDays * DAY_MS)

  const unfolded = unfoldIcsText(icsText)
  if (!/BEGIN:VCALENDAR/i.test(unfolded) && !/BEGIN:VEVENT/i.test(unfolded)) {
    throw new Error("That file does not look like a valid .ics calendar.")
  }

  const blocks = unfolded.split(/BEGIN:VEVENT/i).slice(1)
  const collected: Array<{ event: CalendarEvent; startMs: number }> = []

  for (const rawBlock of blocks) {
    const block = rawBlock.split(/END:VEVENT/i)[0] || ""
    const lines = block.split("\n")
    const statusProp = getIcsProperty(lines, "STATUS")
    if (statusProp && statusProp.value.toUpperCase() === "CANCELLED") {
      continue
    }

    const summaryProp = getIcsProperty(lines, "SUMMARY")
    const startProp = getIcsProperty(lines, "DTSTART")
    const endProp = getIcsProperty(lines, "DTEND")
    const locationProp = getIcsProperty(lines, "LOCATION")
    const descriptionProp = getIcsProperty(lines, "DESCRIPTION")
    const uidProp = getIcsProperty(lines, "UID")
    const rruleProp = getIcsProperty(lines, "RRULE")

    if (!startProp?.value) continue
    const startParsed = parseIcsDateTime(startProp.value, startProp.params)
    if (!startParsed) continue

    const endParsed = endProp?.value
      ? parseIcsDateTime(endProp.value, endProp.params)
      : null
    let baseEnd = endParsed?.date ?? null
    if (baseEnd && baseEnd.getTime() < startParsed.date.getTime()) {
      baseEnd = new Date(baseEnd.getTime() + DAY_MS)
    }

    const durationMs = baseEnd
      ? Math.max(15 * 60_000, baseEnd.getTime() - startParsed.date.getTime())
      : startParsed.allDay
        ? DAY_MS - 1
        : 60 * 60_000

    const allDay = startParsed.allDay || Boolean(endParsed?.allDay)
    const summary = summaryProp?.value || "Untitled event"
    const location = locationProp?.value || ""
    const description = descriptionProp?.value || ""
    const baseId = uidProp?.value || `${startParsed.date.toISOString()}::${summary}`

    if (rruleProp?.value) {
      const exdates = parseExdates(lines)
      const occurrences = expandRruleDates(
        startParsed.date,
        rruleProp.value,
        windowStart,
        windowEnd,
        exdates,
      )
      for (const occStart of occurrences) {
        const occEnd = new Date(occStart.getTime() + durationMs)
        const event = buildCalendarEvent(
          `${baseId}::${occStart.toISOString().slice(0, 10)}`,
          summary,
          occStart,
          occEnd,
          allDay,
          location,
          description,
        )
        collected.push({ event, startMs: occStart.getTime() })
      }
    } else {
      const occEnd = baseEnd ?? new Date(startParsed.date.getTime() + durationMs)
      if (
        occEnd.getTime() < windowStart.getTime() ||
        startParsed.date.getTime() > windowEnd.getTime()
      ) {
        continue
      }
      const event = buildCalendarEvent(
        baseId,
        summary,
        startParsed.date,
        occEnd,
        allDay,
        location,
        description,
      )
      collected.push({ event, startMs: startParsed.date.getTime() })
    }
  }

  collected.sort((a, b) => a.startMs - b.startMs)
  return collected.slice(0, limit).map((item) => item.event)
}

/**
 * Extract `.ics` text contents from a Google Calendar export `.zip` archive
 * directly in the browser using the Web Streams `DecompressionStream` API.
 */
export async function extractIcsTextsFromZip(buffer: ArrayBuffer): Promise<string[]> {
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)

  // Locate End of Central Directory (EOCD) signature 0x06054b50.
  let eocdOffset = -1
  const minOffset = Math.max(0, bytes.length - 65557)
  for (let i = bytes.length - 22; i >= minOffset; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i
      break
    }
  }
  if (eocdOffset < 0) {
    throw new Error("Could not read that .zip archive. Please unzip it and upload the .ics file.")
  }

  const totalEntries = view.getUint16(eocdOffset + 10, true)
  const cdOffset = view.getUint32(eocdOffset + 16, true)
  const decoder = new TextDecoder("utf-8")
  const icsTexts: string[] = []

  let ptr = cdOffset
  for (let idx = 0; idx < totalEntries && ptr + 46 <= bytes.length; idx += 1) {
    if (view.getUint32(ptr, true) !== 0x02014b50) break
    const method = view.getUint16(ptr + 10, true)
    const compressedSize = view.getUint32(ptr + 20, true)
    const nameLen = view.getUint16(ptr + 28, true)
    const extraLen = view.getUint16(ptr + 30, true)
    const commentLen = view.getUint16(ptr + 32, true)
    const localHeaderOffset = view.getUint32(ptr + 42, true)

    const fileName = decoder.decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen))
    ptr += 46 + nameLen + extraLen + commentLen

    if (
      !/\.ics$/i.test(fileName) ||
      fileName.startsWith("__MACOSX/") ||
      /holiday/i.test(fileName)
    ) {
      continue
    }

    if (
      localHeaderOffset + 30 > bytes.length ||
      view.getUint32(localHeaderOffset, true) !== 0x04034b50
    ) {
      continue
    }
    const localNameLen = view.getUint16(localHeaderOffset + 26, true)
    const localExtraLen = view.getUint16(localHeaderOffset + 28, true)
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen
    const compressedSlice = bytes.subarray(dataStart, dataStart + compressedSize)

    if (method === 0) {
      icsTexts.push(decoder.decode(compressedSlice))
    } else if (method === 8 && typeof DecompressionStream !== "undefined") {
      const ds = new DecompressionStream("deflate-raw")
      const writer = ds.writable.getWriter()
      void writer.write(compressedSlice)
      void writer.close()
      const text = await new Response(ds.readable).text()
      if (text.trim()) icsTexts.push(text)
    }
  }

  return icsTexts
}

/**
 * Filter a full calendar down to today's and near-term (next 36h) events
 * for the AI climate tip prompt.
 */
export function getUpcomingEventsForWeather(
  events: CalendarEvent[],
  now = new Date(),
  limit = 8,
): CalendarEvent[] {
  const windowStart = startOfLocalDay(now).getTime()
  const cutoff = Math.max(
    endOfLocalDay(now).getTime(),
    now.getTime() + 36 * 60 * 60 * 1000,
  )
  const recentGrace = now.getTime() - 15 * 60_000

  return events
    .filter((event) => {
      const startMs = Date.parse(event.dtstart)
      const endMs = Date.parse(event.dtend || event.dtstart)
      if (Number.isNaN(startMs) || Number.isNaN(endMs)) return false
      return endMs >= windowStart && startMs <= cutoff && endMs >= recentGrace
    })
    .slice(0, limit)
}
