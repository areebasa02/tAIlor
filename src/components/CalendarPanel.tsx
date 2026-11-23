import { useEffect, useMemo, useState } from "react"
import { useApp } from "../context/AppContext"
import {
  addDays,
  formatDayHeading,
  monthGrid,
  parseIsoDay,
  startOfWeek,
  toIsoDay,
  wearsOnDay,
} from "../lib/wearLog"
import type { CalendarEvent, OutfitWearEntry } from "../types"

type CalendarViewMode = "list" | "week" | "month"
type CalendarLayer = "both" | "events" | "outfits"

function eventDay(event: CalendarEvent): string {
  return toIsoDay(new Date(event.dtstart))
}

function eventsOnDay(events: CalendarEvent[], isoDay: string): CalendarEvent[] {
  return events.filter((event) => eventDay(event) === isoDay)
}

export default function CalendarPanel() {
  const {
    calendarEvents,
    calendarSource,
    calendarLoading,
    calendarNote,
    refreshCalendar,
    outfitWearLog,
    outfitWearCounts,
  } = useApp()

  const [viewMode, setViewMode] = useState<CalendarViewMode>("month")
  const [layer, setLayer] = useState<CalendarLayer>("both")
  const [anchor, setAnchor] = useState(() => new Date())
  const [selectedDay, setSelectedDay] = useState(() => toIsoDay())

  useEffect(() => {
    // Keep selection inside the visible month/week when navigating.
    if (viewMode === "month") {
      const selected = parseIsoDay(selectedDay)
      if (
        selected.getMonth() !== anchor.getMonth() ||
        selected.getFullYear() !== anchor.getFullYear()
      ) {
        setSelectedDay(toIsoDay(new Date(anchor.getFullYear(), anchor.getMonth(), 1)))
      }
    }
  }, [anchor, viewMode, selectedDay])

  const weekDays = useMemo(() => {
    const start = startOfWeek(anchor)
    return Array.from({ length: 7 }, (_, i) => addDays(start, i))
  }, [anchor])

  const monthDays = useMemo(() => monthGrid(anchor), [anchor])

  const selectedEvents = useMemo(
    () => (layer === "outfits" ? [] : eventsOnDay(calendarEvents, selectedDay)),
    [calendarEvents, layer, selectedDay],
  )
  const selectedWears = useMemo(
    () => (layer === "events" ? [] : wearsOnDay(outfitWearLog, selectedDay)),
    [outfitWearLog, layer, selectedDay],
  )

  const listRows = useMemo(() => {
    const rows: Array<
      | { kind: "event"; sort: string; event: CalendarEvent }
      | { kind: "wear"; sort: string; wear: OutfitWearEntry }
    > = []
    if (layer !== "outfits") {
      for (const event of calendarEvents) {
        rows.push({ kind: "event", sort: event.dtstart, event })
      }
    }
    if (layer !== "events") {
      for (const wear of outfitWearLog) {
        rows.push({ kind: "wear", sort: `${wear.wornOn}T12:00:00`, wear })
      }
    }
    return rows.sort((a, b) => b.sort.localeCompare(a.sort)).slice(0, 24)
  }, [calendarEvents, outfitWearLog, layer])

  const monthLabel = anchor.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  })

  const shiftAnchor = (delta: number) => {
    setAnchor((prev) => {
      if (viewMode === "week") return addDays(prev, delta * 7)
      return new Date(prev.getFullYear(), prev.getMonth() + delta, 1)
    })
  }

  const renderDayCell = (day: Date, compact = false) => {
    const iso = toIsoDay(day)
    const inMonth = day.getMonth() === anchor.getMonth()
    const isSelected = iso === selectedDay
    const isToday = iso === toIsoDay()
    const dayEvents = layer === "outfits" ? [] : eventsOnDay(calendarEvents, iso)
    const dayWears = layer === "events" ? [] : wearsOnDay(outfitWearLog, iso)
    const hasEvents = dayEvents.length > 0
    const hasWears = dayWears.length > 0

    return (
      <button
        key={iso}
        type="button"
        onClick={() => setSelectedDay(iso)}
        aria-pressed={isSelected}
        aria-label={`${formatDayHeading(iso)}${hasEvents ? `, ${dayEvents.length} events` : ""}${hasWears ? `, ${dayWears.length} outfits worn` : ""}`}
        className={`${compact ? "min-h-[52px]" : "min-h-[64px]"} rounded-xl border-2 p-1.5 text-left transition-colors cursor-pointer ${
          isSelected
            ? "border-pink bg-pink/10"
            : isToday
              ? "border-turquoise bg-turquoise/10"
              : "border-border bg-muted/40 hover:border-turquoise"
        } ${!inMonth && viewMode === "month" ? "opacity-45" : ""}`}
      >
        <div className="flex items-center justify-between gap-1">
          <span className="text-[11px] font-extrabold text-foreground">
            {day.getDate()}
          </span>
          <span className="flex items-center gap-0.5">
            {hasEvents ? (
              <span className="w-1.5 h-1.5 rounded-full bg-turquoise" aria-hidden="true" />
            ) : null}
            {hasWears ? (
              <span className="w-1.5 h-1.5 rounded-full bg-pink" aria-hidden="true" />
            ) : null}
          </span>
        </div>
        {!compact && (hasEvents || hasWears) ? (
          <p className="mt-1 text-[10px] font-bold text-muted-foreground leading-tight truncate">
            {hasWears
              ? dayWears[0].label
              : dayEvents[0]?.summary || ""}
          </p>
        ) : null}
      </button>
    )
  }

  return (
    <section
      className="rounded-2xl p-3 space-y-2.5 shadow-sm border-2 bg-card border-border"
      aria-labelledby="calendar-views-heading"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2
            id="calendar-views-heading"
            className="text-sm font-black text-foreground"
            style={{ fontFamily: "Nunito, sans-serif" }}
          >
            Schedule & wears
          </h2>
          <p className="text-[11px] font-semibold text-muted-foreground leading-snug">
            ICS plans + outfit wear dates/counts
            {calendarSource ? ` · ${calendarSource}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refreshCalendar()}
          disabled={calendarLoading}
          className="min-h-[32px] px-2.5 rounded-full text-[11px] font-extrabold border-2 border-border bg-muted text-foreground cursor-pointer disabled:opacity-50"
        >
          {calendarLoading ? "…" : "Refresh"}
        </button>
      </div>

      <div
        role="group"
        aria-label="Calendar view"
        className="flex flex-wrap gap-1.5"
      >
        {(
          [
            ["list", "List"],
            ["week", "Week"],
            ["month", "Month"],
          ] as const
        ).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            aria-pressed={viewMode === mode}
            onClick={() => setViewMode(mode)}
            className={`min-h-[34px] px-3 rounded-full text-[11px] font-extrabold border-2 cursor-pointer ${
              viewMode === mode
                ? "bg-pink text-white border-pink"
                : "bg-card text-foreground border-border hover:border-turquoise"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        role="group"
        aria-label="Calendar layers"
        className="flex flex-wrap gap-1.5"
      >
        {(
          [
            ["both", "Events + outfits"],
            ["events", "Events only"],
            ["outfits", "Outfits only"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={layer === value}
            onClick={() => setLayer(value)}
            className={`min-h-[30px] px-2.5 rounded-full text-[10px] font-extrabold border-2 cursor-pointer ${
              layer === value
                ? "bg-turquoise/20 text-foreground border-turquoise"
                : "bg-muted text-muted-foreground border-border"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {viewMode !== "list" ? (
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => shiftAnchor(-1)}
            className="min-h-[34px] px-2.5 rounded-lg text-xs font-extrabold border-2 border-border bg-muted cursor-pointer"
            aria-label="Previous period"
          >
            ‹
          </button>
          <p className="text-xs font-black text-foreground">{monthLabel}</p>
          <button
            type="button"
            onClick={() => shiftAnchor(1)}
            className="min-h-[34px] px-2.5 rounded-lg text-xs font-extrabold border-2 border-border bg-muted cursor-pointer"
            aria-label="Next period"
          >
            ›
          </button>
        </div>
      ) : null}

      {viewMode === "list" ? (
        <div className="space-y-1.5 max-h-[280px] overflow-y-auto pr-0.5">
          {listRows.length === 0 ? (
            <p className="text-xs font-semibold text-muted-foreground py-2">
              No calendar events or logged outfits yet.
            </p>
          ) : (
            listRows.map((row) =>
              row.kind === "event" ? (
                <div
                  key={`e-${row.event.id}`}
                  className="rounded-xl border-2 border-border bg-muted/50 px-2.5 py-2"
                >
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-turquoise">
                    Event · {formatDayHeading(eventDay(row.event))}
                  </p>
                  <p className="text-xs font-extrabold text-foreground leading-snug">
                    {row.event.summary}
                  </p>
                  <p className="text-[11px] font-semibold text-muted-foreground truncate">
                    {[row.event.timeLabel, row.event.location].filter(Boolean).join(" · ")}
                  </p>
                </div>
              ) : (
                <div
                  key={`w-${row.wear.id}`}
                  className="rounded-xl border-2 border-border bg-muted/50 px-2.5 py-2"
                >
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-pink">
                    Worn · {formatDayHeading(row.wear.wornOn)}
                  </p>
                  <p className="text-xs font-extrabold text-foreground leading-snug">
                    {row.wear.label}
                  </p>
                  <p className="text-[11px] font-semibold text-muted-foreground">
                    Worn {outfitWearCounts.get(row.wear.outfitKey) || 1} time
                    {(outfitWearCounts.get(row.wear.outfitKey) || 1) === 1 ? "" : "s"} total
                  </p>
                </div>
              ),
            )
          )}
        </div>
      ) : null}

      {viewMode === "week" ? (
        <div className="grid grid-cols-7 gap-1">
          {weekDays.map((day) => renderDayCell(day, true))}
        </div>
      ) : null}

      {viewMode === "month" ? (
        <div className="space-y-1">
          <div className="grid grid-cols-7 gap-1">
            {["S", "M", "T", "W", "T", "F", "S"].map((label, idx) => (
              <span
                key={`${label}-${idx}`}
                className="text-[10px] font-extrabold text-center text-muted-foreground"
              >
                {label}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {monthDays.map((day) => renderDayCell(day))}
          </div>
        </div>
      ) : null}

      {viewMode !== "list" ? (
        <div className="rounded-xl border-2 border-border bg-muted/40 p-2.5 space-y-1.5">
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">
            {formatDayHeading(selectedDay)}
          </p>
          {selectedEvents.length === 0 && selectedWears.length === 0 ? (
            <p className="text-xs font-semibold text-muted-foreground">
              Nothing logged for this day.
            </p>
          ) : null}
          {selectedEvents.map((event) => (
            <div key={event.id} className="text-xs">
              <p className="font-extrabold text-foreground">
                <span className="text-turquoise">Event · </span>
                {event.summary}
              </p>
              <p className="font-semibold text-muted-foreground">
                {[event.timeLabel, event.location].filter(Boolean).join(" · ")}
              </p>
            </div>
          ))}
          {selectedWears.map((wear) => {
            const count = outfitWearCounts.get(wear.outfitKey) || 1
            return (
              <div key={wear.id} className="text-xs">
                <p className="font-extrabold text-foreground">
                  <span className="text-pink">Worn · </span>
                  {wear.label}
                </p>
                <p className="font-semibold text-muted-foreground">
                  Date worn: {wear.wornOn} · {count} total wear{count === 1 ? "" : "s"}
                </p>
                {wear.items.length > 0 ? (
                  <p className="font-semibold text-muted-foreground truncate">
                    {wear.items.slice(0, 3).join(" · ")}
                  </p>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : null}

      {calendarNote ? (
        <p className="text-[11px] font-semibold text-muted-foreground leading-snug">
          {calendarNote}
        </p>
      ) : null}

      <p className="text-[10px] font-semibold text-muted-foreground">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-turquoise mr-1 align-middle" />
        Calendar event
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-pink mx-1 align-middle" />
        Outfit worn
      </p>
    </section>
  )
}
