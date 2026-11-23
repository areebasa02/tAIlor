import type { OutfitWearEntry, RecentLook } from "../types"

export function toIsoDay(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

export function parseIsoDay(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0)
}

export function outfitKeyFromLabel(label: string): string {
  return String(label || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
}

export function inferIsoFromRelativeDate(dateLabel: string, dayName?: string): string | null {
  const raw = String(dateLabel || "").trim().toLowerCase()
  const now = new Date()
  if (!raw) return null
  if (raw === "today") return toIsoDay(now)
  if (raw === "yesterday") {
    const d = new Date(now)
    d.setDate(d.getDate() - 1)
    return toIsoDay(d)
  }
  const daysAgo = raw.match(/^(\d+)\s+days?\s+ago$/)
  if (daysAgo) {
    const d = new Date(now)
    d.setDate(d.getDate() - Number(daysAgo[1]))
    return toIsoDay(d)
  }
  // ISO already
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw

  // Fallback: match weekday name within the last 7 days
  if (dayName) {
    for (let ago = 0; ago < 7; ago += 1) {
      const d = new Date(now)
      d.setDate(d.getDate() - ago)
      const name = d.toLocaleDateString("en-US", { weekday: "long" })
      if (name.toLowerCase() === dayName.toLowerCase()) return toIsoDay(d)
    }
  }
  return null
}

export function recentLookToWearEntry(look: RecentLook): OutfitWearEntry | null {
  const wornOn =
    look.wornOn ||
    inferIsoFromRelativeDate(look.date, look.day) ||
    null
  if (!wornOn) return null
  const label = look.direction || look.occasion || look.items[0] || "Outfit"
  return {
    id: look.id || `wear-${wornOn}-${outfitKeyFromLabel(label)}`,
    outfitKey: outfitKeyFromLabel(label),
    label,
    wornOn,
    color: look.color || "#69D5E6",
    items: Array.isArray(look.items) ? look.items : [],
    direction: look.direction,
  }
}

export function seedWearLogFromRecentLooks(looks: RecentLook[]): OutfitWearEntry[] {
  const entries: OutfitWearEntry[] = []
  const seen = new Set<string>()
  for (const look of looks) {
    const entry = recentLookToWearEntry(look)
    if (!entry) continue
    const dedupe = `${entry.wornOn}::${entry.outfitKey}`
    if (seen.has(dedupe)) continue
    seen.add(dedupe)
    entries.push(entry)
  }
  return entries.sort((a, b) => b.wornOn.localeCompare(a.wornOn))
}

export function aggregateWearCounts(entries: OutfitWearEntry[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const entry of entries) {
    counts.set(entry.outfitKey, (counts.get(entry.outfitKey) || 0) + 1)
  }
  return counts
}

export function wearsOnDay(entries: OutfitWearEntry[], isoDay: string): OutfitWearEntry[] {
  return entries.filter((entry) => entry.wornOn === isoDay)
}

export function startOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const day = d.getDay() // 0 Sun
  d.setDate(d.getDate() - day)
  return d
}

export function addDays(date: Date, amount: number): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  d.setDate(d.getDate() + amount)
  return d
}

export function sameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
}

export function monthGrid(anchor: Date): Date[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  const start = startOfWeek(first)
  const cells: Date[] = []
  for (let i = 0; i < 42; i += 1) {
    cells.push(addDays(start, i))
  }
  return cells
}

export function formatDayHeading(iso: string): string {
  return parseIsoDay(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  })
}
