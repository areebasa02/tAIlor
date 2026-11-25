import { useRef, useState } from "react"
import CalendarPanel from "../components/CalendarPanel"
import { useApp } from "../context/AppContext"
import { parseUploadedIcs } from "../services/calendarService"

export default function CalendarTab() {
  const {
    calendarLoading,
    calendarNote,
    calendarSource,
    calendarEvents,
    refreshCalendar,
    setCalendarFromUpload,
    setCalendarFromUrl,
    clearCalendar,
    showToast,
  } = useApp()
  const icsInputRef = useRef<HTMLInputElement | null>(null)
  const [icsUploading, setIcsUploading] = useState(false)
  const [icsUrl, setIcsUrl] = useState("")
  const [urlLoading, setUrlLoading] = useState(false)

  const busy = calendarLoading || icsUploading || urlLoading

  const handleIcsUpload = async (file: File | undefined) => {
    if (!file) return
    if (!/\.ics$/i.test(file.name) && file.type && !/calendar|text/i.test(file.type)) {
      showToast("Calendar file", "Please choose a .ics calendar file.", "warning")
      return
    }
    setIcsUploading(true)
    try {
      const text = await file.text()
      const result = await parseUploadedIcs(text)
      setCalendarFromUpload(
        result.events,
        result.note ||
          `Imported ${result.events.length} event${result.events.length === 1 ? "" : "s"} from ${file.name}.`,
      )
      showToast(
        "Calendar imported",
        result.events.length > 0
          ? `${result.events.length} upcoming event${result.events.length === 1 ? "" : "s"} on your calendar.`
          : "No upcoming events found in that .ics file.",
        result.events.length > 0 ? "success" : "info",
      )
    } catch (error) {
      showToast(
        "Calendar import failed",
        error instanceof Error ? error.message : "Could not read that .ics file.",
        "warning",
      )
    } finally {
      setIcsUploading(false)
    }
  }

  const handleConnectUrl = async () => {
    setUrlLoading(true)
    try {
      await setCalendarFromUrl(icsUrl)
    } finally {
      setUrlLoading(false)
    }
  }

  return (
    <div className="pt-1 pb-4 space-y-3">
      <div className="min-w-0">
        <h1
          className="text-xl font-black leading-tight text-foreground"
          style={{ fontFamily: "Nunito, sans-serif" }}
        >
          Calendar
        </h1>
        <p className="text-xs font-semibold mt-0.5 text-muted-foreground leading-snug">
          Google Calendar .ics events and outfit wear history — List, Week, or Month.
        </p>
      </div>

      {/* Prominent import controls */}
      <section
        className="rounded-2xl p-3 space-y-3 border-2 border-turquoise/50 bg-turquoise/10 shadow-sm"
        aria-labelledby="calendar-import-heading"
      >
        <div>
          <h2
            id="calendar-import-heading"
            className="text-sm font-black text-foreground"
          >
            Add your calendar
          </h2>
          <p className="text-[11px] font-semibold text-muted-foreground mt-0.5 leading-snug">
            Upload a Google Calendar export (.ics) or paste the secret iCal URL.
            {calendarSource ? ` Currently: ${calendarSource}` : ""}
            {calendarEvents.length > 0
              ? ` · ${calendarEvents.length} upcoming`
              : ""}
          </p>
        </div>

        <input
          ref={icsInputRef}
          type="file"
          accept=".ics,text/calendar"
          className="sr-only"
          aria-label="Upload calendar .ics file"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ""
            void handleIcsUpload(file)
          }}
        />

        <button
          type="button"
          onClick={() => icsInputRef.current?.click()}
          disabled={busy}
          className="w-full min-h-[52px] rounded-2xl text-[15px] font-black border-2 border-[#0D0F18]/20 bg-pink text-white shadow-md shadow-pink/20 hover:brightness-110 disabled:opacity-50 cursor-pointer"
        >
          {icsUploading ? "Uploading…" : "Upload .ics"}
        </button>

        <div className="space-y-1.5">
          <label
            htmlFor="calendar-ics-url"
            className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground block"
          >
            Or paste ICS URL
          </label>
          <div className="flex flex-col min-[380px]:flex-row gap-1.5">
            <input
              id="calendar-ics-url"
              type="url"
              value={icsUrl}
              onChange={(e) => setIcsUrl(e.target.value)}
              placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
              className="flex-1 min-h-[44px] rounded-xl border-2 border-border bg-card px-3 text-xs font-semibold text-foreground outline-none focus:border-turquoise"
            />
            <button
              type="button"
              onClick={() => void handleConnectUrl()}
              disabled={busy || !icsUrl.trim()}
              className="min-h-[44px] px-3 rounded-xl text-xs font-extrabold border-2 border-border bg-card text-foreground cursor-pointer disabled:opacity-50 shrink-0"
            >
              {urlLoading ? "Connecting…" : "Connect URL"}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => void refreshCalendar()}
            disabled={busy}
            className="min-h-[34px] px-2.5 rounded-full text-[11px] font-extrabold border-2 border-border bg-card text-foreground cursor-pointer disabled:opacity-50"
          >
            Refresh feed
          </button>
          {(calendarSource === "upload" || calendarSource === "url") && (
            <button
              type="button"
              onClick={() => clearCalendar()}
              disabled={busy}
              className="min-h-[34px] px-2.5 rounded-full text-[11px] font-extrabold border-2 border-border bg-card text-foreground hover:border-pink cursor-pointer disabled:opacity-50"
            >
              Clear &amp; use demo
            </button>
          )}
          {calendarNote ? (
            <p className="text-[11px] font-semibold text-muted-foreground leading-snug self-center">
              {calendarNote}
            </p>
          ) : null}
        </div>
      </section>

      <CalendarPanel />
    </div>
  )
}
