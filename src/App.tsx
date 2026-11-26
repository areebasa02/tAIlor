import { useEffect, useState } from "react"
import { AppProvider, useApp } from "./context/AppContext"
import { AiHostProvider } from "./context/AiHostContext"
import { AiHostHeaderPill } from "./components/AiHostStatus"
import { getContrastTextColor } from "./types"
import {
  getReadableColorLabel,
  speakText,
  stopSpeaking,
} from "./services/accessibilityHelpers"
import LoginScreen from "./components/LoginScreen"
import HomeTab from "./tabs/HomeTab"
import WardrobeTab from "./tabs/WardrobeTab"
import GeneratorTab from "./tabs/GeneratorTab"
import CalendarTab from "./tabs/CalendarTab"
import TryOnTab from "./tabs/TryOnTab"
import LaundryTab from "./tabs/LaundryTab"
import ProfileTab from "./tabs/ProfileTab"

type Tab =
  | "home"
  | "wardrobe"
  | "generator"
  | "calendar"
  | "laundry"
  | "tryon"
  | "profile"

const NAV = [
  { id: "home" as Tab, label: "Today", icon: "✦" },
  { id: "wardrobe" as Tab, label: "Closet", icon: "👔" },
  { id: "generator" as Tab, label: "Ask AI", icon: "✧", featured: true },
  { id: "laundry" as Tab, label: "Laundry", icon: "🧺" },
  { id: "tryon" as Tab, label: "Try-On", icon: "🪞" },
]

function MainApp() {
  const {
    user,
    isAuthenticated,
    logout,
    notifications,
    dismissToast,
    theme,
    toggleTheme,
    fontScale,
    setFontScale,
    accessibleFont,
    setAccessibleFont,
    updateAccessibility,
    currentOutfit,
    weather,
    wardrobe,
    showToast,
    requestedTab,
    setRequestedTab,
  } = useApp()
  const [tab, setTab] = useState<Tab>("home")
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [fontMenuOpen, setFontMenuOpen] = useState(false)
  const [notifPanelOpen, setNotifPanelOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [assistBarOpen, setAssistBarOpen] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)

  useEffect(() => {
    if (requestedTab) {
      setTab(requestedTab)
      setRequestedTab(null)
    }
  }, [requestedTab, setRequestedTab])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setUserMenuOpen(false)
        setFontMenuOpen(false)
        setNotifPanelOpen(false)
        setHelpOpen(false)
        setAssistBarOpen(false)
        stopSpeaking()
        setIsSpeaking(false)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      stopSpeaking()
    }
  }, [])

  const handleReadScreenAloud = () => {
    if (isSpeaking) {
      stopSpeaking()
      setIsSpeaking(false)
      return
    }

    let summary = `tAIlor styling assistant for ${user.name}.`
    if (tab === "home" && currentOutfit) {
      const pieces = currentOutfit.items
        .map(
          (i) =>
            `${i.type}: ${i.desc} in ${getReadableColorLabel(i.color, i.desc, wardrobe)}`
        )
        .join(". ")
      summary = `Today screen for ${user.name}. Local weather in ${weather.city.split(",")[0]} is ${weather.temp}. Recommended outfit: ${currentOutfit.label}, ${currentOutfit.tagline}. Pieces: ${pieces}. Stylist note: ${currentOutfit.rationale}`
    } else if (tab === "wardrobe") {
      summary = `Wardrobe screen. You have ${wardrobe.length} pieces tracked, including ${wardrobe.filter((i) => i.favorite).length} favorites and ${wardrobe.filter((i) => i.worn < 5).length} rarely worn items.`
    } else if (tab === "generator") {
      summary =
        "AI Event Stylist screen. Describe your upcoming event in plain words or tap a quick example scenario to generate tailored outfits from your closet."
    } else if (tab === "calendar") {
      summary =
        "Calendar screen. Upload a Google Calendar .ics file or paste an iCal URL, then switch List, Week, or Month to see plans and outfit wear history."
    } else if (tab === "laundry") {
      summary =
        "Laundry and Fabric Care screen. Track clean clothes versus clothes in your hamper and review washing care instructions."
    } else if (tab === "tryon") {
      summary =
        "Virtual Try-On screen. Preview your outfit on your own photo or a studio mannequin."
    } else if (tab === "profile") {
      summary = `Profile and Accessibility Settings screen for ${user.name}. Switch test personas or adjust large text, voice narration, color names, simple mode, and sensory fabric filters.`
    }

    const started = speakText(summary, () => setIsSpeaking(false))
    if (started) {
      setIsSpeaking(true)
      showToast(
        "Reading Screen Aloud",
        "Playing plain-English voice summary of the current screen.",
        "info"
      )
    } else {
      showToast(
        "Audio Not Available",
        "Text-to-speech is not supported by this browser window.",
        "warning"
      )
    }
  }

  if (!isAuthenticated) {
    return <LoginScreen />
  }

  return (
    <div
      className="h-dvh max-h-dvh w-full flex justify-center overflow-hidden transition-colors"
      style={{
        background: "var(--outer-backdrop)",
        backgroundImage: "var(--desktop-glow)",
      }}
    >
      {/* Skip to Main Content link (WCAG 2.4.1 Bypass Blocks) */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-3 focus:py-2 focus:rounded-xl focus:bg-foreground focus:text-background focus:text-xs focus:font-extrabold focus:shadow-xl"
      >
        Skip to main content
      </a>

      {/* Mobile-First App Shell (edge-to-edge on all mobile aspect ratios & foldables) */}
      <div
        className="w-full max-w-[540px] h-full max-h-full flex flex-col relative pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] min-[380px]:pl-[max(0.875rem,env(safe-area-inset-left))] min-[380px]:pr-[max(0.875rem,env(safe-area-inset-right))] pt-[env(safe-area-inset-top)] border-0 min-[560px]:border-x border-border sm:shadow-2xl overflow-hidden"
        style={{ background: "var(--background)" }}
      >
        {/* Toast notifications float */}
        <div
          role="region"
          aria-label="Live notifications"
          aria-live="polite"
          aria-atomic="true"
          className="fixed top-[64px] left-1/2 -translate-x-1/2 z-50 w-[calc(100%-1.5rem)] max-w-[500px] space-y-2 pointer-events-none"
        >
          {notifications.map((n) => (
            <div
              key={n.id}
              role="status"
              className={`pointer-events-auto rounded-2xl p-3 shadow-xl flex items-start gap-2.5 border backdrop-blur-md transition-all animate-in fade-in slide-in-from-top-2 duration-200 ${
                n.type === "success"
                  ? "border-green"
                  : n.type === "warning"
                    ? "border-gold"
                    : "border-turquoise"
              }`}
              style={{ background: "var(--toast-bg)" }}
            >
              <span className="text-sm" aria-hidden="true">
                {n.type === "success" ? "✓" : n.type === "warning" ? "⚠" : "ℹ"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-foreground leading-tight">
                  {n.title}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                  {n.message}
                </p>
              </div>
              <button
                type="button"
                onClick={() => dismissToast(n.id)}
                aria-label={`Dismiss ${n.title}`}
                className="text-xs text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded-lg cursor-pointer"
              >
                <span aria-hidden="true">✕</span>
              </button>
            </div>
          ))}
        </div>

        {/* Mobile Header (Brand + AI Status + Assist + Aa + Theme + Account) */}
        <header className="flex items-center justify-between gap-1.5 min-[380px]:gap-2 py-2 min-[380px]:py-2.5 shrink-0 border-b-2 border-border relative z-40 mb-1.5">
          {/* Brand Wordmark + Live AI Host Pill */}
          <div className="flex items-center gap-1.5 min-[380px]:gap-2 min-w-0">
            <button
              type="button"
              onClick={() => {
                setTab("home")
                setUserMenuOpen(false)
                setFontMenuOpen(false)
              }}
              className="flex items-center text-left transition-transform active:scale-95 min-h-[40px] px-1 rounded-xl shrink-0 cursor-pointer"
              aria-label="tAIlor — Return to Today home"
            >
              <span
                aria-hidden="true"
                className="text-2xl italic font-black leading-none text-pink"
                style={{ fontFamily: "Nunito, sans-serif" }}
              >
                t
              </span>
              <span
                aria-hidden="true"
                className="text-2xl font-black leading-none text-turquoise"
                style={{ fontFamily: "Nunito, sans-serif" }}
              >
                AI
              </span>
              <span
                aria-hidden="true"
                className="text-2xl italic font-black leading-none text-pink"
                style={{ fontFamily: "Nunito, sans-serif" }}
              >
                lor
              </span>
            </button>

            <AiHostHeaderPill />
          </div>

          {/* Right Header Actions */}
          <div className="flex items-center gap-1.5 min-[360px]:gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setTab("calendar")
                setUserMenuOpen(false)
                setFontMenuOpen(false)
                setAssistBarOpen(false)
              }}
              aria-current={tab === "calendar" ? "page" : undefined}
              aria-label="Open Calendar"
              title="Calendar"
              className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-transform active:scale-95 cursor-pointer ${
                tab === "calendar"
                  ? "bg-pink/15 border-pink text-pink"
                  : "bg-card text-foreground border-border hover:border-turquoise"
              }`}
            >
              <span aria-hidden="true" className="text-base leading-none">
                📅
              </span>
            </button>

            {/* Quick Accessibility Assist Pill */}
            <button
              type="button"
              onClick={() => {
                setAssistBarOpen(!assistBarOpen)
                setFontMenuOpen(false)
                setUserMenuOpen(false)
              }}
              aria-expanded={assistBarOpen}
              aria-label="Open quick accessibility and easy-mode controls"
              title="Vision & Easy Mode Assist"
              className={`h-10 px-3 rounded-full flex items-center justify-center gap-1.5 text-xs font-black border-2 transition-transform active:scale-95 cursor-pointer ${
                assistBarOpen ||
                user.accessibility.largeText ||
                user.accessibility.visionImpairment ||
                user.accessibility.voiceNarration ||
                user.accessibility.highContrastColors
                  ? "bg-turquoise text-accent-foreground border-foreground/30 shadow-xs"
                  : "bg-card text-foreground border-border hover:border-turquoise"
              }`}
            >
              <span aria-hidden="true" className="text-sm leading-none">✨</span>
              <span>Assist</span>
            </button>

            {/* Accessible Font & 5-Size Scale Controls Popover */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setFontMenuOpen(!fontMenuOpen)
                  setUserMenuOpen(false)
                  setAssistBarOpen(false)
                }}
                aria-expanded={fontMenuOpen}
                aria-haspopup="dialog"
                className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-transform active:scale-95 font-black text-sm cursor-pointer ${
                  fontMenuOpen
                    ? "bg-turquoise text-accent-foreground border-foreground/30 shadow-xs"
                    : "bg-card text-foreground border-border hover:border-turquoise"
                }`}
                aria-label="Font size and accessible font options"
                title="Font Size & Typeface Options"
              >
                Aa
              </button>

              {fontMenuOpen && (
                <div
                  role="dialog"
                  aria-modal="false"
                  aria-label="Font size and font options"
                  className="absolute -right-12 min-[360px]:-right-14 min-[390px]:-right-16 min-[480px]:right-0 top-12 w-64 max-w-[calc(100vw-2rem)] rounded-2xl p-3 border-2 border-border bg-card shadow-2xl z-50 space-y-3 animate-in fade-in duration-150"
                  style={{ maxWidth: "calc(100vw - 2rem)" }}
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-black text-foreground uppercase tracking-wider">
                        Font Size
                      </span>
                      <span className="text-[11px] font-bold text-turquoise">
                        {fontScale === "xs"
                          ? "87.5%"
                          : fontScale === "sm"
                            ? "100%"
                            : fontScale === "md"
                              ? "112.5%"
                              : fontScale === "lg"
                                ? "125%"
                                : "137.5%"}
                      </span>
                    </div>
                    <div className="grid grid-cols-5 gap-1 bg-muted p-1 rounded-xl border border-border">
                      {(["xs", "sm", "md", "lg", "xl"] as const).map((scale) => {
                        const labels = { xs: "XS", sm: "S", md: "M", lg: "L", xl: "XL" }
                        const active = fontScale === scale
                        return (
                          <button
                            key={scale}
                            type="button"
                            onClick={() => setFontScale(scale)}
                            aria-pressed={active}
                            className={`h-8 rounded-lg text-xs font-black transition-all cursor-pointer ${
                              active
                                ? "bg-turquoise text-[#0D0F18] shadow-xs"
                                : "text-foreground hover:bg-card"
                            }`}
                            title={`Font scale ${labels[scale]}`}
                          >
                            {labels[scale]}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div className="border-t border-border pt-2.5">
                    <span className="text-xs font-black text-foreground uppercase tracking-wider block mb-1.5">
                      Accessible Typeface
                    </span>
                    <div className="space-y-1">
                      {(
                        [
                          { id: "nunito", label: "Nunito (Standard)", family: "'Nunito', sans-serif" },
                          {
                            id: "atkinson",
                            label: "Atkinson Hyperlegible",
                            family: "'Atkinson Hyperlegible', sans-serif",
                          },
                          { id: "lexend", label: "Lexend (Fluency)", family: "'Lexend', sans-serif" },
                          {
                            id: "opendyslexic",
                            label: "OpenDyslexic",
                            family: "'OpenDyslexic', 'Comic Sans MS', cursive, sans-serif",
                          },
                          {
                            id: "system",
                            label: "System Clean",
                            family: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                          },
                        ] as const
                      ).map((item) => {
                        const active = accessibleFont === item.id
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setAccessibleFont(item.id)}
                            aria-pressed={active}
                            style={{ fontFamily: item.family }}
                            className={`w-full px-2.5 py-1.5 rounded-xl text-left text-xs font-bold border transition-all flex items-center justify-between cursor-pointer ${
                              active
                                ? "bg-pink text-white border-pink shadow-xs"
                                : "bg-muted text-foreground border-border hover:border-turquoise"
                            }`}
                          >
                            <span>{item.label}</span>
                            {active && <span aria-hidden="true" className="text-xs">✓</span>}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Theme Toggle (Light / Dark) */}
            <button
              type="button"
              onClick={toggleTheme}
              aria-pressed={theme === "dark"}
              className="w-10 h-10 rounded-full flex items-center justify-center border-2 border-border bg-card text-foreground transition-transform active:scale-95 hover:border-turquoise text-base cursor-pointer"
              aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
              title={`Switch to ${theme === "light" ? "Dark" : "Light"} Mode`}
            >
              <span aria-hidden="true">{theme === "light" ? "🌙" : "☀️"}</span>
            </button>

            {/* User Avatar Button & Unified Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setUserMenuOpen(!userMenuOpen)
                  setFontMenuOpen(false)
                  setAssistBarOpen(false)
                }}
                aria-haspopup="menu"
                aria-expanded={userMenuOpen}
                aria-label={`Open ${user.name}'s account, tips, and settings menu`}
                className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-black shadow-sm transition-transform active:scale-95 border-2 border-foreground/35 relative cursor-pointer"
                style={{
                  background: user.avatarBg,
                  color: getContrastTextColor(user.avatarBg),
                }}
              >
                {user.initials}
                <span
                  aria-hidden="true"
                  className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-turquoise border-2 border-background"
                />
              </button>

              {/* Account, Alerts & Help Menu */}
              {userMenuOpen && (
                <div
                  role="menu"
                  aria-label="Account menu"
                  className="absolute right-0 mt-2 w-60 max-w-[calc(100vw-1.5rem)] rounded-2xl p-2 shadow-2xl border-2 border-border backdrop-blur-md animate-in fade-in zoom-in-95 duration-100 z-50"
                  style={{ background: "var(--card)" }}
                >
                  <div className="px-3 py-2 border-b-2 border-border mb-1">
                    <p className="text-sm font-black text-foreground truncate">
                      {user.name}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {user.email}
                    </p>
                  </div>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setUserMenuOpen(false)
                      setNotifPanelOpen(true)
                    }}
                    className="w-full px-3 py-2.5 text-left text-[13px] font-bold rounded-xl hover:bg-muted text-foreground flex items-center justify-between gap-2 cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <span aria-hidden="true">🔔</span>
                      <span>Alerts</span>
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-turquoise text-accent-foreground">
                      3
                    </span>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setUserMenuOpen(false)
                      setHelpOpen(true)
                    }}
                    className="w-full px-3 py-2.5 text-left text-[13px] font-bold rounded-xl hover:bg-muted text-foreground flex items-center gap-2 cursor-pointer"
                  >
                    <span
                      aria-hidden="true"
                      className="w-4 h-4 rounded-full bg-[#FFCB44] text-[#0D0F18] text-[11px] font-black flex items-center justify-center"
                    >
                      ?
                    </span>
                    <span>Help</span>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setTab("profile")
                      setUserMenuOpen(false)
                    }}
                    className="w-full px-3 py-2.5 text-left text-[13px] font-bold rounded-xl hover:bg-muted text-foreground flex items-center gap-2 cursor-pointer"
                  >
                    <span aria-hidden="true">⚙️</span>
                    <span>Profile &amp; Demo</span>
                  </button>

                  <div className="border-t-2 border-border mt-1 pt-1">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setUserMenuOpen(false)
                        logout()
                      }}
                      className="w-full px-3 py-2.5 text-left text-[13px] font-extrabold rounded-xl text-red hover:bg-red/10 flex items-center gap-2 cursor-pointer"
                    >
                      <span aria-hidden="true">🚪</span>
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Quick 1-Tap Assist Panel */}
        {assistBarOpen && (
          <div
            role="region"
            aria-label="Quick Accessibility Controls"
            className="shrink-0 mb-2 rounded-2xl p-2.5 border-2 border-border bg-card shadow-sm space-y-2 animate-in fade-in duration-150"
          >
            <div className="flex items-center justify-between gap-2 px-0.5">
              <span className="text-xs font-extrabold uppercase tracking-wider text-turquoise">
                Easy Vision &amp; Comfort
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAssistBarOpen(false)
                    setHelpOpen(true)
                  }}
                  className="text-xs font-bold text-foreground px-2.5 py-1 rounded-lg border-2 border-border bg-muted hover:border-turquoise cursor-pointer"
                >
                  ? Guide
                </button>
                <button
                  type="button"
                  onClick={() => setAssistBarOpen(false)}
                  className="text-xs font-bold text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 min-[350px]:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleReadScreenAloud}
                aria-pressed={isSpeaking}
                className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-extrabold border-2 flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  isSpeaking
                    ? "bg-pink text-white border-pink shadow-xs"
                    : "bg-muted text-foreground border-border hover:border-pink"
                }`}
              >
                <span aria-hidden="true">{isSpeaking ? "⏹" : "🔊"}</span>
                <span>{isSpeaking ? "Stop" : "Read"}</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  updateAccessibility("largeText", !user.accessibility.largeText)
                }
                aria-pressed={Boolean(user.accessibility.largeText)}
                className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-extrabold border-2 flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  user.accessibility.largeText
                    ? "bg-turquoise text-accent-foreground border-foreground/40 shadow-xs"
                    : "bg-muted text-foreground border-border hover:border-turquoise"
                }`}
              >
                <span aria-hidden="true">🔍</span>
                <span>Large Text {user.accessibility.largeText ? "ON" : "OFF"}</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  updateAccessibility(
                    "highContrastColors",
                    !user.accessibility.highContrastColors
                  )
                }
                aria-pressed={user.accessibility.highContrastColors}
                className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-extrabold border-2 flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  user.accessibility.highContrastColors
                    ? "bg-turquoise text-accent-foreground border-foreground/40 shadow-xs"
                    : "bg-muted text-foreground border-border hover:border-turquoise"
                }`}
              >
                <span aria-hidden="true">👁️</span>
                <span>
                  Contrast {user.accessibility.highContrastColors ? "ON" : "OFF"}
                </span>
              </button>

              <button
                type="button"
                onClick={() =>
                  updateAccessibility(
                    "lowDecisionMode",
                    !user.accessibility.lowDecisionMode
                  )
                }
                aria-pressed={user.accessibility.lowDecisionMode}
                className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-extrabold border-2 flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  user.accessibility.lowDecisionMode
                    ? "bg-pink text-white border-pink shadow-xs"
                    : "bg-muted text-foreground border-border hover:border-pink"
                }`}
              >
                <span aria-hidden="true">⚡</span>
                <span>
                  Simple {user.accessibility.lowDecisionMode ? "ON" : "OFF"}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Notifications Drawer */}
        {notifPanelOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
            onClick={() => setNotifPanelOpen(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="notif-modal-title"
              className="rounded-3xl p-4 sm:p-5 max-w-sm w-full max-h-[88dvh] overflow-y-auto space-y-3.5 shadow-2xl border"
              style={{ background: "var(--card)", borderColor: "var(--border)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span aria-hidden="true">🔔</span>
                  <h2 id="notif-modal-title" className="text-sm font-bold text-foreground">
                    Daily Wardrobe Insights
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setNotifPanelOpen(false)}
                  aria-label="Close Daily Wardrobe Insights dialog"
                  className="text-xs text-muted-foreground hover:text-foreground p-1.5 rounded-lg cursor-pointer"
                >
                  <span aria-hidden="true">✕</span>
                </button>
              </div>

              <div className="space-y-2.5">
                <div className="p-3 rounded-2xl bg-muted border border-border space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-green">
                    <span aria-hidden="true">🧺 </span>Laundry Notice
                  </span>
                  <p className="text-xs text-foreground">
                    Everyday colors hamper has 5 pieces. A small cold wash before
                    Friday keeps your favorites ready.
                  </p>
                </div>

                <div className="p-3 rounded-2xl bg-muted border border-border space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-turquoise">
                    <span aria-hidden="true">⛅ </span>Climate Update
                  </span>
                  <p className="text-xs text-foreground">
                    Mild forecast today. Layered tops and breathable trousers stay
                    comfortable indoors and outdoors.
                  </p>
                </div>

                <div className="p-3 rounded-2xl bg-muted border border-border space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gold">
                    <span aria-hidden="true">✨ </span>Rediscovery Tip
                  </span>
                  <p className="text-xs text-foreground">
                    You have unworn pieces in your wardrobe! Tap Ask AI Stylist to
                    surface fresh pairings.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setNotifPanelOpen(false)}
                className="w-full py-2.5 rounded-xl text-xs font-bold text-white bg-pink hover:brightness-110 transition-all shadow-md cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Help & Quick Guide Modal */}
        {helpOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
            onClick={() => setHelpOpen(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="help-modal-title"
              className="rounded-3xl p-4 sm:p-5 max-w-sm w-full max-h-[88dvh] overflow-y-auto space-y-3.5 shadow-2xl border"
              style={{ background: "var(--card)", borderColor: "var(--border)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-border pb-2.5">
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="w-6 h-6 rounded-full bg-[#FFCB44] text-[#0D0F18] font-black text-xs flex items-center justify-center"
                  >
                    ?
                  </span>
                  <h2 id="help-modal-title" className="text-sm font-bold text-foreground">
                    Quick Guide &amp; FAQ
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setHelpOpen(false)}
                  aria-label="Close Quick Guide dialog"
                  className="text-xs text-muted-foreground hover:text-foreground p-1.5 rounded-lg cursor-pointer"
                >
                  <span aria-hidden="true">✕</span>
                </button>
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="p-3 rounded-2xl bg-muted border border-border">
                  <p className="font-bold text-foreground">
                    <span aria-hidden="true">✧ </span>Need an outfit for an event?
                  </p>
                  <p className="text-muted-foreground mt-0.5 leading-snug">
                    Tap the high-contrast{" "}
                    <strong className="text-foreground">✧ Ask AI</strong> button
                    docked in the bottom navigation bar anytime to describe your
                    event or refine outfits by chat.
                  </p>
                </div>

                <div className="p-3 rounded-2xl bg-muted border border-border">
                  <p className="font-bold text-foreground">
                    <span aria-hidden="true">↺ </span>How do I change one item in an outfit?
                  </p>
                  <p className="text-muted-foreground mt-0.5 leading-snug">
                    Tap the <strong className="text-turquoise">Swap ↺</strong>{" "}
                    button right next to any shirt, pants, or shoes to pick another
                    clean piece from your closet.
                  </p>
                </div>

                <div className="p-3 rounded-2xl bg-muted border border-border">
                  <p className="font-bold text-foreground">
                    <span aria-hidden="true">👁️ </span>High-Contrast &amp; Sensory Modes
                  </p>
                  <p className="text-muted-foreground mt-0.5 leading-snug">
                    Tap your avatar in the top right →{" "}
                    <strong className="text-foreground">Profile &amp; Demo</strong> to
                    enable color labels, low-decision mode, vision listen buttons, or
                    sensory filters.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setHelpOpen(false)
                    setTab("generator")
                  }}
                  className="py-2.5 rounded-xl text-xs font-extrabold bg-[#FFCB44] text-[#0D0F18] border border-[#0D0F18] shadow-sm cursor-pointer"
                >
                  Open Stylist
                </button>
                <button
                  type="button"
                  onClick={() => setHelpOpen(false)}
                  className="py-2.5 rounded-xl text-xs font-bold bg-pink text-white cursor-pointer"
                >
                  Got it
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Main Content Area (scrolls cleanly above dedicated bottom dock; zero overlap) */}
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 min-h-0 overflow-y-auto pt-1 pb-3 focus:outline-none"
        >
          {tab === "home" && <HomeTab />}
          {tab === "wardrobe" && <WardrobeTab />}
          {tab === "generator" && <GeneratorTab />}
          {tab === "calendar" && <CalendarTab />}
          {tab === "laundry" && <LaundryTab />}
          {tab === "tryon" && <TryOnTab />}
          {tab === "profile" && <ProfileTab onBack={() => setTab("home")} />}
        </main>

        {/* Bottom Navigation Bar with High-Contrast Raised Center Ask AI Button */}
        <nav
          aria-label="Primary navigation"
          className="shrink-0 -mx-3 min-[380px]:-mx-3.5 px-1.5 flex items-end border-t-2 relative z-30"
          style={{
            background: "var(--nav-bg)",
            backdropFilter: "blur(24px)",
            borderColor: "var(--border)",
            paddingBottom: "calc(env(safe-area-inset-bottom) + 4px)",
          }}
        >
          {NAV.map((n) => {
            const active = tab === n.id

            if (n.featured) {
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => {
                    setTab(n.id)
                    setUserMenuOpen(false)
                    setFontMenuOpen(false)
                  }}
                  aria-current={active ? "page" : undefined}
                  aria-label="Ask AI Stylist"
                  className="flex-1 flex flex-col items-center justify-center pb-0.5 -mt-3 transition-transform active:scale-95 hover:scale-[1.03] focus-visible:z-10 cursor-pointer"
                >
                  <span
                    className={`min-w-[64px] min-[380px]:min-w-[74px] min-h-[50px] px-3 py-1.5 rounded-2xl flex flex-col items-center justify-center gap-0.5 border-2 shadow-lg transition-all ${
                      active
                        ? "bg-pink text-white border-[#0D0F18] dark:border-white ring-2 ring-[#FFCB44]"
                        : "bg-[#FFCB44] text-[#0D0F18] border-[#0D0F18] dark:border-white"
                    }`}
                  >
                    <span aria-hidden="true" className="text-lg leading-none font-black">
                      {n.icon}
                    </span>
                    <span className="text-[11px] min-[390px]:text-xs font-black leading-none tracking-tight">
                      {n.label}
                    </span>
                  </span>
                </button>
              )
            }

            return (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  setTab(n.id)
                  setUserMenuOpen(false)
                  setFontMenuOpen(false)
                }}
                aria-current={active ? "page" : undefined}
                className={`flex-1 min-h-[52px] flex flex-col items-center justify-center gap-0.5 pt-1.5 pb-0.5 text-xs font-medium relative transition-all active:scale-95 cursor-pointer ${
                  active ? "text-pink" : "text-foreground/80 hover:text-foreground"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`flex items-center justify-center rounded-2xl transition-colors border-2 text-base leading-none ${
                    active
                      ? "bg-pink/15 border-pink/40 px-3 py-1"
                      : "border-transparent px-3 py-1"
                  }`}
                >
                  {n.icon}
                </span>
                <span className="text-[11px] min-[390px]:text-xs font-extrabold leading-none">
                  {n.label}
                </span>
              </button>
            )
          })}
        </nav>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <AiHostProvider>
      <AppProvider>
        <MainApp />
      </AppProvider>
    </AiHostProvider>
  )
}
