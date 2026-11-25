import { useRef, useState } from "react"
import CalendarPanel from "../components/CalendarPanel"
import { useApp } from "../context/AppContext"
import { extractIcsTextsFromZip } from "../lib/icsParser"
import { parseUploadedIcs } from "../services/calendarService"

type GuideProvider = "google" | "apple" | "outlook" | "canvas"

type GuideStep = {
  title: string
  detail: string
}

const CALENDAR_GUIDES: Record<
  GuideProvider,
  {
    label: string
    badge: string
    shortcutUrl?: string
    shortcutLabel?: string
    fileSteps: GuideStep[]
    urlSteps: GuideStep[]
    tip: string
  }
> = {
  google: {
    label: "Google",
    badge: "Google Calendar",
    shortcutUrl: "https://calendar.google.com/calendar/u/0/r/settings/export",
    shortcutLabel: "Open Google Calendar Export ↗",
    fileSteps: [
      {
        title: "Open Google Calendar on a computer",
        detail: "Go to calendar.google.com (the mobile app doesn't have an export button).",
      },
      {
        title: "Open Settings",
        detail: "Click the ⚙️ gear icon in the top-right corner, then click Settings.",
      },
      {
        title: "Export your calendar",
        detail: "In the left sidebar, click Import & export, then click the Export button to download a .zip file.",
      },
      {
        title: "Upload the .zip or .ics file below",
        detail: "Click Upload .ics / .zip below — you can pick Google's downloaded .zip directly or unzip it first!",
      },
    ],
    urlSteps: [
      {
        title: "Open Calendar Settings",
        detail: "At calendar.google.com, click ⚙️ → Settings, then click your name under Settings for my calendars on the left.",
      },
      {
        title: "Scroll to Integrate calendar",
        detail: "Scroll near the bottom of that page until you see Secret address in iCal format.",
      },
      {
        title: "Copy & paste the link",
        detail: "Click the Copy button next to that link, paste it into Or paste ICS URL below, and tap Connect URL.",
      },
    ],
    tip: "Google Calendar exports a .zip containing your .ics file — tAIlor accepts both .zip and .ics!",
  },
  apple: {
    label: "Apple",
    badge: "Apple / iCloud Calendar",
    shortcutUrl: "https://www.icloud.com/calendar/",
    shortcutLabel: "Open iCloud Calendar ↗",
    fileSteps: [
      {
        title: "Open the Calendar app on Mac",
        detail: "Launch the built-in Apple Calendar app on macOS.",
      },
      {
        title: "Select your calendar",
        detail: "Click the calendar you want to export in the left sidebar (e.g. Home, Work, or School).",
      },
      {
        title: "Export to a .ics file",
        detail: "In the top menu bar, choose File → Export → Export… and save the .ics file.",
      },
      {
        title: "Upload your saved .ics",
        detail: "Click Upload .ics / .zip below and choose the file you just saved.",
      },
    ],
    urlSteps: [
      {
        title: "Sign in to iCloud Calendar",
        detail: "Go to icloud.com/calendar (or on iPhone Calendar: tap Calendars at the bottom → tap the ⓘ button next to your calendar).",
      },
      {
        title: "Turn on Public Calendar",
        detail: "Toggle Public Calendar on, then tap Copy Link (it starts with webcal://).",
      },
      {
        title: "Paste the webcal:// or https:// link",
        detail: "Paste that link into Or paste ICS URL below — we convert webcal:// automatically.",
      },
    ],
    tip: "On iPhone or iPad without a Mac, using the Public Calendar webcal:// link is the fastest way.",
  },
  outlook: {
    label: "Outlook",
    badge: "Outlook / Microsoft 365",
    shortcutUrl: "https://outlook.office.com/calendar/options/calendar/SharedCalendars",
    shortcutLabel: "Open Outlook Shared Calendars ↗",
    fileSteps: [
      {
        title: "Open Outlook on the web",
        detail: "Sign in at outlook.live.com or outlook.office.com (for school/work accounts).",
      },
      {
        title: "Go to Shared calendars",
        detail: "Click ⚙️ Settings (top right) → Calendar → Shared calendars.",
      },
      {
        title: "Publish & download ICS",
        detail: "Under Publish a calendar, pick your calendar, select Can view all details, and click Publish.",
      },
      {
        title: "Download or copy the ICS link",
        detail: "Click the generated ICS link → Download to get a .ics file (then upload it below), or copy the link directly.",
      },
    ],
    urlSteps: [
      {
        title: "Publish your Outlook calendar",
        detail: "In ⚙️ Settings → Calendar → Shared calendars, publish your calendar with Can view all details.",
      },
      {
        title: "Copy the ICS link",
        detail: "Click the ICS URL (not the HTML link) and choose Copy link.",
      },
      {
        title: "Paste below",
        detail: "Paste the .ics link into Or paste ICS URL below and click Connect URL.",
      },
    ],
    tip: "Using Outlook Desktop on Windows? Go to File → Save Calendar to save a .ics file directly.",
  },
  canvas: {
    label: "Canvas",
    badge: "Canvas / School Schedule",
    fileSteps: [
      {
        title: "Open Canvas Calendar",
        detail: "Log in to your school's Canvas site and click Calendar in the left navigation bar.",
      },
      {
        title: "Click Calendar Feed",
        detail: "Look at the bottom of the right-hand sidebar (below your course list) and click Calendar Feed.",
      },
      {
        title: "Download the .ics file",
        detail: "Click 'Click to view Calendar Feed' in the popup to download your .ics file.",
      },
      {
        title: "Upload below",
        detail: "Tap Upload .ics / .zip below and pick the downloaded Canvas .ics file.",
      },
    ],
    urlSteps: [
      {
        title: "Open Canvas → Calendar → Calendar Feed",
        detail: "Click Calendar Feed at the bottom-right of your Canvas Calendar page.",
      },
      {
        title: "Copy the feed URL",
        detail: "Copy the https://…/feeds/calendars/user_….ics link shown in the popup box.",
      },
      {
        title: "Connect URL below",
        detail: "Paste that URL into Or paste ICS URL and tap Connect URL.",
      },
    ],
    tip: "Great for syncing class times, lab presentations, and campus deadlines!",
  },
}

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
  const [showWalkthrough, setShowWalkthrough] = useState(false)
  const [guideProvider, setGuideProvider] = useState<GuideProvider>("google")
  const [guideMethod, setGuideMethod] = useState<"file" | "url">("file")

  const busy = calendarLoading || icsUploading || urlLoading
  const activeGuide = CALENDAR_GUIDES[guideProvider]
  const activeSteps = guideMethod === "file" ? activeGuide.fileSteps : activeGuide.urlSteps

  const handleIcsUpload = async (file: File | undefined) => {
    if (!file) return
    const isZip = /\.zip$/i.test(file.name) || /zip/i.test(file.type)
    const isIcs =
      /\.ics$/i.test(file.name) || (!file.type ? false : /calendar|text/i.test(file.type))

    if (!isZip && !isIcs) {
      showToast(
        "Calendar file",
        "Please choose a .ics calendar file (or Google Calendar's exported .zip).",
        "warning",
      )
      return
    }
    setIcsUploading(true)
    try {
      if (isZip) {
        const buffer = await file.arrayBuffer()
        const icsTexts = await extractIcsTextsFromZip(buffer)
        if (icsTexts.length === 0) {
          throw new Error("No .ics calendar file was found inside that .zip archive.")
        }
        const seenIds = new Set<string>()
        const mergedEvents = []
        for (const text of icsTexts) {
          try {
            const parsed = await parseUploadedIcs(text)
            for (const ev of parsed.events) {
              if (!seenIds.has(ev.id)) {
                seenIds.add(ev.id)
                mergedEvents.push(ev)
              }
            }
          } catch {
            // Skip unreadable secondary calendars inside the archive.
          }
        }
        mergedEvents.sort((a, b) => Date.parse(a.dtstart) - Date.parse(b.dtstart))
        const capped = mergedEvents.slice(0, 200)
        setCalendarFromUpload(
          capped,
          `Imported ${capped.length} event${capped.length === 1 ? "" : "s"} from ${file.name}.`,
        )
        showToast(
          "Calendar imported",
          capped.length > 0
            ? `${capped.length} upcoming event${capped.length === 1 ? "" : "s"} extracted from ${file.name}.`
            : "Unzipped your calendar, but found no events in the next 60 days.",
          capped.length > 0 ? "success" : "info",
        )
        setShowWalkthrough(false)
        return
      }

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
      setShowWalkthrough(false)
    } catch (error) {
      showToast(
        "Calendar import failed",
        error instanceof Error ? error.message : "Could not read that calendar file.",
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
      setShowWalkthrough(false)
    } finally {
      setUrlLoading(false)
    }
  }

  const sourceLabel =
    calendarSource === "upload"
      ? "Uploaded file"
      : calendarSource === "url"
        ? "Connected URL"
        : calendarSource === "env"
          ? "Server feed"
          : calendarSource === "mock"
            ? "Demo schedule"
            : null

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
          Sync your schedule (.ics) and outfit wear history — List, Week, or Month.
        </p>
      </div>

      {/* Prominent import controls + step-by-step walkthrough */}
      <section
        className="rounded-2xl p-3 space-y-3 border-2 border-turquoise/50 bg-turquoise/10 shadow-sm"
        aria-labelledby="calendar-import-heading"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2
              id="calendar-import-heading"
              className="text-sm font-black text-foreground"
            >
              Add your calendar
            </h2>
            <p className="text-[11px] font-semibold text-muted-foreground mt-0.5 leading-snug">
              Upload a calendar export (.ics or Google .zip) or paste an iCal link.
              {sourceLabel ? ` · ${sourceLabel}` : ""}
              {calendarEvents.length > 0 ? ` (${calendarEvents.length} events)` : ""}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowWalkthrough((prev) => !prev)}
            aria-expanded={showWalkthrough}
            aria-controls="calendar-walkthrough-panel"
            className={`shrink-0 min-h-[36px] px-2.5 py-1 rounded-xl text-[11px] font-extrabold border-2 transition-colors flex items-center gap-1 cursor-pointer ${
              showWalkthrough
                ? "bg-turquoise text-[#0D0F18] border-[#0D0F18]/25 shadow-xs"
                : "bg-card text-foreground border-border hover:border-turquoise"
            }`}
          >
            <span aria-hidden="true">{showWalkthrough ? "▾" : "❓"}</span>
            <span>{showWalkthrough ? "Hide guide" : "How to find it"}</span>
          </button>
        </div>

        {/* Interactive Walkthrough Panel */}
        {showWalkthrough && (
          <div
            id="calendar-walkthrough-panel"
            className="rounded-2xl p-3 space-y-2.5 bg-card border-2 border-border shadow-sm animate-in fade-in duration-150"
          >
            <div className="space-y-1">
              <p className="text-xs font-black text-foreground">
                Where is your calendar stored?
              </p>
              <p className="text-[11px] font-medium text-muted-foreground leading-snug">
                Pick your calendar app below for quick step-by-step export instructions. Your events stay stored locally in your browser.
              </p>
            </div>

            {/* Provider Selector Tabs */}
            <div
              role="tablist"
              aria-label="Calendar provider guide"
              className="grid grid-cols-4 gap-1"
            >
              {(Object.keys(CALENDAR_GUIDES) as GuideProvider[]).map((key) => {
                const selected = guideProvider === key
                return (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setGuideProvider(key)}
                    className={`min-h-[36px] px-2 py-1 rounded-xl text-[11px] font-extrabold border-2 transition-all cursor-pointer ${
                      selected
                        ? "bg-pink text-white border-[#0D0F18]/20 shadow-xs"
                        : "bg-muted text-foreground border-border hover:border-pink"
                    }`}
                  >
                    {CALENDAR_GUIDES[key].label}
                  </button>
                )
              })}
            </div>

            {/* Method Toggle: File Download vs Secret URL */}
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-muted border border-border">
              <button
                type="button"
                onClick={() => setGuideMethod("file")}
                className={`flex-1 min-h-[32px] px-2 py-1 rounded-lg text-[11px] font-extrabold transition-colors cursor-pointer ${
                  guideMethod === "file"
                    ? "bg-card text-foreground shadow-2xs border border-border"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                📁 Download .ics file (Easiest)
              </button>
              <button
                type="button"
                onClick={() => setGuideMethod("url")}
                className={`flex-1 min-h-[32px] px-2 py-1 rounded-lg text-[11px] font-extrabold transition-colors cursor-pointer ${
                  guideMethod === "url"
                    ? "bg-card text-foreground shadow-2xs border border-border"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                🔗 Copy iCal URL
              </button>
            </div>

            {/* Direct Shortcut Link (when available) */}
            {activeGuide.shortcutUrl && (
              <a
                href={activeGuide.shortcutUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-extrabold text-turquoise underline underline-offset-2 hover:brightness-110"
              >
                {activeGuide.shortcutLabel}
              </a>
            )}

            {/* Numbered Step-by-Step List */}
            <ol className="space-y-2 pt-0.5">
              {activeSteps.map((step, index) => (
                <li
                  key={step.title}
                  className="flex items-start gap-2.5 rounded-xl p-2 bg-muted/65 border border-border"
                >
                  <span
                    aria-hidden="true"
                    className="w-5 h-5 rounded-full bg-turquoise text-[#0D0F18] text-[11px] font-black flex items-center justify-center shrink-0 mt-0.5"
                  >
                    {index + 1}
                  </span>
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-xs font-extrabold text-foreground leading-snug">
                      {step.title}
                    </p>
                    <p className="text-[11px] font-medium text-muted-foreground leading-snug">
                      {step.detail}
                    </p>
                  </div>
                </li>
              ))}
            </ol>

            {/* Helpful Tip */}
            <div className="rounded-xl px-2.5 py-2 bg-turquoise/10 border border-turquoise/40 text-[11px] font-semibold text-foreground leading-snug">
              <span aria-hidden="true" className="mr-1">
                💡
              </span>
              {activeGuide.tip}
            </div>

            {guideMethod === "file" && (
              <button
                type="button"
                onClick={() => icsInputRef.current?.click()}
                disabled={busy}
                className="w-full min-h-[40px] rounded-xl text-xs font-black border-2 border-turquoise bg-turquoise/15 text-foreground hover:bg-turquoise/25 transition-colors cursor-pointer disabled:opacity-50"
              >
                Got my file — Choose .ics or .zip
              </button>
            )}
          </div>
        )}

        <input
          ref={icsInputRef}
          type="file"
          accept=".ics,.zip,text/calendar,application/zip"
          className="sr-only"
          aria-label="Upload calendar .ics or .zip file"
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
          {icsUploading ? "Importing…" : "Upload .ics or Google .zip"}
        </button>

        <div className="space-y-1.5">
          <label
            htmlFor="calendar-ics-url"
            className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground block"
          >
            Or paste ICS / webcal URL
          </label>
          <div className="flex flex-col min-[380px]:flex-row gap-1.5">
            <input
              id="calendar-ics-url"
              type="text"
              inputMode="url"
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
