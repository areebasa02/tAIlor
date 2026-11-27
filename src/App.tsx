import { useEffect, useRef, useState } from "react"
import {
  AlertTriangle,
  Bell,
  Calendar,
  Check,
  CheckCircle2,
  CloudSun,
  Contrast,
  HelpCircle,
  Home,
  Info,
  LogOut,
  Moon,
  RefreshCw,
  ScanFace,
  Settings,
  Shirt,
  SlidersHorizontal,
  Sparkles,
  Square,
  Sun,
  Type,
  Volume2,
  WashingMachine,
  X,
  Zap,
  ZoomIn,
} from "lucide-react"
import { AppProvider, useApp } from "./context/AppContext"
import { AiHostProvider } from "./context/AiHostContext"
import { AiHostHeaderPill } from "./components/AiHostStatus"
import { BottomSheet } from "./components/BottomSheet"
import { getContrastTextColor, type AccessibleFont, type FontScale } from "./types"
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
  { id: "home" as Tab, label: "Today", Icon: Home },
  { id: "wardrobe" as Tab, label: "Closet", Icon: Shirt },
  { id: "generator" as Tab, label: "Ask AI", Icon: Sparkles, featured: true },
  { id: "laundry" as Tab, label: "Laundry", Icon: WashingMachine },
  { id: "tryon" as Tab, label: "Try-On", Icon: ScanFace },
]

const FONT_OPTIONS: {
  id: AccessibleFont
  label: string
  tag: string
  family: string
}[] = [
  {
    id: "editorial",
    label: "Editorial Lumina",
    tag: "Default · Serif + Sans",
    family: "'Playfair Display', Georgia, serif",
  },
  {
    id: "jakarta",
    label: "Plus Jakarta Sans",
    tag: "Airy Modern",
    family: "'Plus Jakarta Sans', sans-serif",
  },
  {
    id: "inter",
    label: "Inter",
    tag: "Crisp UI",
    family: "'Inter', sans-serif",
  },
  {
    id: "dm-sans",
    label: "DM Sans",
    tag: "Geometric",
    family: "'DM Sans', sans-serif",
  },
  {
    id: "nunito",
    label: "Nunito",
    tag: "Soft Rounded",
    family: "'Nunito', sans-serif",
  },
  {
    id: "georgia",
    label: "Georgia Classic",
    tag: "Full Serif",
    family: "Georgia, 'Times New Roman', serif",
  },
  {
    id: "atkinson",
    label: "Atkinson Hyperlegible",
    tag: "Low Vision",
    family: "'Atkinson Hyperlegible', sans-serif",
  },
  {
    id: "lexend",
    label: "Lexend",
    tag: "Reading Fluency",
    family: "'Lexend', sans-serif",
  },
  {
    id: "opendyslexic",
    label: "OpenDyslexic",
    tag: "Dyslexia Friendly",
    family: "'OpenDyslexic', 'Comic Sans MS', cursive, sans-serif",
  },
  {
    id: "system",
    label: "System Clean",
    tag: "Native OS",
    family: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
]

const SCALE_OPTIONS: { id: FontScale; label: string; pct: string }[] = [
  { id: "xs", label: "XS", pct: "87.5%" },
  { id: "sm", label: "S", pct: "100%" },
  { id: "md", label: "M", pct: "112.5%" },
  { id: "lg", label: "L", pct: "125%" },
  { id: "xl", label: "XL", pct: "137.5%" },
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
  const [assistSheetOpen, setAssistSheetOpen] = useState(false)
  const [notifPanelOpen, setNotifPanelOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const mainRef = useRef<HTMLElement | null>(null)
  const userMenuRef = useRef<HTMLDivElement | null>(null)

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
        setAssistSheetOpen(false)
        setNotifPanelOpen(false)
        setHelpOpen(false)
        stopSpeaking()
        setIsSpeaking(false)
      }
    }
    const onPointerDown = (e: MouseEvent) => {
      if (
        userMenuOpen &&
        userMenuRef.current &&
        !userMenuRef.current.contains(e.target as Node)
      ) {
        setUserMenuOpen(false)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("mousedown", onPointerDown)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("mousedown", onPointerDown)
      stopSpeaking()
    }
  }, [userMenuOpen])

  const handleSelectTab = (nextTab: Tab) => {
    setUserMenuOpen(false)
    setAssistSheetOpen(false)
    if (nextTab === tab) {
      mainRef.current?.scrollTo({ top: 0, behavior: "smooth" })
      return
    }
    setTab(nextTab)
    mainRef.current?.scrollTo({ top: 0 })
  }

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

  const hasActiveAssist = Boolean(
    user.accessibility.largeText ||
      user.accessibility.visionImpairment ||
      user.accessibility.voiceNarration ||
      user.accessibility.highContrastColors ||
      user.accessibility.lowDecisionMode ||
      isSpeaking
  )

  const activeScalePct =
    SCALE_OPTIONS.find((s) => s.id === fontScale)?.pct || "100%"

  if (!isAuthenticated) {
    return <LoginScreen />
  }

  return (
    <div
      className="fixed inset-0 w-full flex justify-center overflow-hidden transition-colors"
      style={{
        background: "var(--outer-backdrop)",
        backgroundImage: "var(--desktop-glow)",
      }}
    >
      {/* Skip to Main Content link (WCAG 2.4.1 Bypass Blocks) */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-3 focus:py-2 focus:rounded-xl focus:bg-foreground focus:text-background focus:text-xs focus:font-bold focus:shadow-xl"
      >
        Skip to main content
      </a>

      {/* Editorial Lumina Mobile-First App Shell */}
      <div
        className="w-full max-w-[540px] h-full max-h-full flex flex-col relative pl-[max(0.875rem,env(safe-area-inset-left))] pr-[max(0.875rem,env(safe-area-inset-right))] pt-[env(safe-area-inset-top)] border-0 min-[560px]:border-x border-border sm:shadow-2xl overflow-hidden"
        style={{
          backgroundColor: "var(--background)",
          backgroundImage: "var(--mobile-glow)",
        }}
      >
        {/* Toast notifications float */}
        <div
          role="region"
          aria-label="Live notifications"
          aria-live="polite"
          aria-atomic="true"
          className="fixed top-[62px] left-1/2 -translate-x-1/2 z-50 w-[calc(100%-1.75rem)] max-w-[500px] space-y-2 pointer-events-none"
        >
          {notifications.map((n) => (
            <div
              key={n.id}
              role="status"
              className={`pointer-events-auto rounded-2xl p-3 shadow-xl flex items-start gap-2.5 border backdrop-blur-md transition-all animate-in fade-in slide-in-from-top-2 duration-200 ${
                n.type === "success"
                  ? "border-green/45"
                  : n.type === "warning"
                    ? "border-gold/50"
                    : "border-turquoise/45"
              }`}
              style={{ background: "var(--toast-bg)" }}
            >
              <span
                aria-hidden="true"
                className={`mt-0.5 shrink-0 ${
                  n.type === "success"
                    ? "text-green"
                    : n.type === "warning"
                      ? "text-gold"
                      : "text-turquoise"
                }`}
              >
                {n.type === "success" ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : n.type === "warning" ? (
                  <AlertTriangle className="w-4 h-4" />
                ) : (
                  <Info className="w-4 h-4" />
                )}
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
                className="text-muted-foreground hover:text-foreground p-1 rounded-lg cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>

        {/* Slim 5-Item Mobile Header */}
        <header className="flex items-center justify-between gap-2 py-2.5 shrink-0 border-b border-border relative z-40">
          {/* Left: Editorial Wordmark + Compact Live AI Pill */}
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => handleSelectTab("home")}
              className="flex items-center text-left transition-transform active:scale-95 min-h-[38px] px-0.5 rounded-lg shrink-0 cursor-pointer"
              aria-label="tAIlor — Return to Today home"
            >
              <span className="font-editorial text-[24px] leading-none tracking-tight">
                <span className="italic font-bold text-pink">t</span>
                <span className="font-extrabold text-turquoise">AI</span>
                <span className="italic font-bold text-pink">lor</span>
              </span>
            </button>

            <AiHostHeaderPill />
          </div>

          {/* Right: Calendar + Quick Assist/Font + Theme Toggle + Avatar */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => handleSelectTab("calendar")}
              aria-current={tab === "calendar" ? "page" : undefined}
              aria-label="Open Calendar"
              title="Calendar"
              className={`w-9 h-9 rounded-full flex items-center justify-center border transition-all active:scale-95 cursor-pointer ${
                tab === "calendar"
                  ? "bg-pink/12 border-pink/40 text-pink"
                  : "bg-card/85 text-foreground/85 border-border hover:border-turquoise/60 hover:text-foreground"
              }`}
            >
              <Calendar className="w-[17px] h-[17px]" strokeWidth={1.85} />
            </button>

            <button
              type="button"
              onClick={() => {
                setAssistSheetOpen(true)
                setUserMenuOpen(false)
              }}
              aria-expanded={assistSheetOpen}
              aria-label="Open Quick Assist, Font Size & Typeface controls"
              title="Assist, Font Size & Typeface"
              className={`w-9 h-9 rounded-full flex items-center justify-center border relative transition-all active:scale-95 cursor-pointer ${
                assistSheetOpen || hasActiveAssist
                  ? "bg-turquoise/15 border-turquoise/50 text-turquoise"
                  : "bg-card/85 text-foreground/85 border-border hover:border-turquoise/60 hover:text-foreground"
              }`}
            >
              <SlidersHorizontal className="w-[17px] h-[17px]" strokeWidth={1.85} />
              {hasActiveAssist && (
                <span
                  aria-hidden="true"
                  className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-[#FFCB44] ring-2 ring-background"
                />
              )}
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              aria-pressed={theme === "dark"}
              className="w-9 h-9 rounded-full flex items-center justify-center border border-border bg-card/85 text-foreground/85 transition-all active:scale-95 hover:border-turquoise/60 hover:text-foreground cursor-pointer"
              aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
              title={`Switch to ${theme === "light" ? "Dark" : "Light"} Mode`}
            >
              {theme === "light" ? (
                <Moon className="w-[17px] h-[17px]" strokeWidth={1.85} />
              ) : (
                <Sun className="w-[17px] h-[17px] text-[#FFCB44]" strokeWidth={1.85} />
              )}
            </button>

            {/* User Avatar Button & Dropdown Menu */}
            <div ref={userMenuRef} className="relative">
              <button
                type="button"
                onClick={() => {
                  setUserMenuOpen(!userMenuOpen)
                  setAssistSheetOpen(false)
                }}
                aria-haspopup="menu"
                aria-expanded={userMenuOpen}
                aria-label={`Open ${user.name}'s account, alerts, and settings menu`}
                className="btn-shine w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold shadow-sm transition-transform active:scale-95 border border-foreground/15 relative cursor-pointer"
                style={{
                  background: user.avatarBg,
                  color: getContrastTextColor(user.avatarBg),
                }}
              >
                {user.initials}
                <span
                  aria-hidden="true"
                  className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#FFCB44] border-2 border-background"
                />
              </button>

              {userMenuOpen && (
                <div
                  role="menu"
                  aria-label="Account menu"
                  className="absolute right-0 mt-2 w-60 max-w-[calc(100vw-1.5rem)] rounded-2xl p-2 shadow-2xl border border-border backdrop-blur-md animate-in fade-in zoom-in-95 duration-100 z-50 bg-card"
                >
                  <div className="px-3 py-2 border-b border-border mb-1">
                    <p className="text-sm font-bold text-foreground truncate">
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
                    className="w-full px-3 py-2.5 text-left text-[13px] font-semibold rounded-xl hover:bg-muted text-foreground flex items-center justify-between gap-2 cursor-pointer"
                  >
                    <span className="flex items-center gap-2.5">
                      <Bell className="w-4 h-4 text-turquoise" strokeWidth={1.9} />
                      <span>Daily Insights</span>
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FFCB44] text-[#0F172A]">
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
                    className="w-full px-3 py-2.5 text-left text-[13px] font-semibold rounded-xl hover:bg-muted text-foreground flex items-center gap-2.5 cursor-pointer"
                  >
                    <HelpCircle className="w-4 h-4 text-gold" strokeWidth={1.9} />
                    <span>Quick Guide</span>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setUserMenuOpen(false)
                      handleSelectTab("profile")
                    }}
                    className="w-full px-3 py-2.5 text-left text-[13px] font-semibold rounded-xl hover:bg-muted text-foreground flex items-center gap-2.5 cursor-pointer"
                  >
                    <Settings className="w-4 h-4 text-muted-foreground" strokeWidth={1.9} />
                    <span>Profile &amp; Demo</span>
                  </button>

                  <div className="border-t border-border mt-1 pt-1">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setUserMenuOpen(false)
                        logout()
                      }}
                      className="w-full px-3 py-2.5 text-left text-[13px] font-semibold rounded-xl text-red hover:bg-red/10 flex items-center gap-2.5 cursor-pointer"
                    >
                      <LogOut className="w-4 h-4" strokeWidth={1.9} />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Unified Quick Assist & Typography Bottom Sheet */}
        <BottomSheet
          open={assistSheetOpen}
          onClose={() => setAssistSheetOpen(false)}
          title="Comfort & Typography"
          subtitle="Instant readability, voice assist, and font pairing"
          icon={<SlidersHorizontal className="w-4 h-4 text-turquoise" />}
          titleId="assist-sheet-title"
          footer={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setAssistSheetOpen(false)
                  setHelpOpen(true)
                }}
                className="flex-1 min-h-[42px] rounded-xl text-xs font-semibold border border-border bg-muted text-foreground hover:border-turquoise inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                <span>Quick Guide</span>
              </button>
              <button
                type="button"
                onClick={() => setAssistSheetOpen(false)}
                className="btn-shine btn-lumina-primary flex-1 min-h-[42px] rounded-xl text-xs font-bold cursor-pointer"
              >
                Done
              </button>
            </div>
          }
        >
          <div className="space-y-5">
            {/* 1-Tap Assist Toggles */}
            <div className="space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Quick Assist
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleReadScreenAloud}
                  aria-pressed={isSpeaking}
                  className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold border flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    isSpeaking
                      ? "bg-pink text-white border-pink shadow-sm"
                      : "bg-muted/70 text-foreground border-border hover:border-pink/50"
                  }`}
                >
                  {isSpeaking ? (
                    <Square className="w-3.5 h-3.5 fill-current" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                  <span>{isSpeaking ? "Stop Audio" : "Read Aloud"}</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    updateAccessibility("largeText", !user.accessibility.largeText)
                  }
                  aria-pressed={Boolean(user.accessibility.largeText)}
                  className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold border flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    user.accessibility.largeText
                      ? "bg-turquoise text-accent-foreground border-turquoise shadow-sm"
                      : "bg-muted/70 text-foreground border-border hover:border-turquoise/50"
                  }`}
                >
                  <ZoomIn className="w-4 h-4" />
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
                  className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold border flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    user.accessibility.highContrastColors
                      ? "bg-turquoise text-accent-foreground border-turquoise shadow-sm"
                      : "bg-muted/70 text-foreground border-border hover:border-turquoise/50"
                  }`}
                >
                  <Contrast className="w-4 h-4" />
                  <span>Contrast {user.accessibility.highContrastColors ? "ON" : "OFF"}</span>
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
                  className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold border flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    user.accessibility.lowDecisionMode
                      ? "bg-pink text-white border-pink shadow-sm"
                      : "bg-muted/70 text-foreground border-border hover:border-pink/50"
                  }`}
                >
                  <Zap className="w-4 h-4" />
                  <span>Simple {user.accessibility.lowDecisionMode ? "ON" : "OFF"}</span>
                </button>
              </div>
            </div>

            {/* 5-Step Font Scale */}
            <div className="space-y-2 pt-1 border-t border-border">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5">
                  <Type className="w-3.5 h-3.5" />
                  Text Size
                </span>
                <span className="text-xs font-bold text-turquoise">
                  {activeScalePct}
                </span>
              </div>
              <div className="grid grid-cols-5 gap-1 bg-muted p-1 rounded-xl border border-border">
                {SCALE_OPTIONS.map((scale) => {
                  const active = fontScale === scale.id
                  return (
                    <button
                      key={scale.id}
                      type="button"
                      onClick={() => setFontScale(scale.id)}
                      aria-pressed={active}
                      className={`h-9 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        active
                          ? "bg-card text-foreground shadow-sm border border-border"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {scale.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Expanded Typeface Picker */}
            <div className="space-y-2 pt-1 border-t border-border">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Typeface Collection
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {FONT_OPTIONS.length} styles
                </span>
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                {FONT_OPTIONS.map((item) => {
                  const active = accessibleFont === item.id
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setAccessibleFont(item.id)}
                      aria-pressed={active}
                      className={`w-full px-3 py-2.5 rounded-xl text-left border transition-all flex items-center justify-between gap-2 cursor-pointer ${
                        active
                          ? "bg-pink/10 border-pink/45 text-foreground"
                          : "bg-muted/50 border-border text-foreground hover:border-turquoise/50"
                      }`}
                    >
                      <div className="min-w-0">
                        <span
                          style={{ fontFamily: item.family }}
                          className="text-[13px] font-bold block leading-tight truncate"
                        >
                          {item.label}
                        </span>
                        <span className="text-[10px] text-muted-foreground block mt-0.5">
                          {item.tag}
                        </span>
                      </div>
                      {active && (
                        <span className="w-5 h-5 rounded-full bg-pink text-white flex items-center justify-center shrink-0">
                          <Check className="w-3 h-3" strokeWidth={2.5} />
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </BottomSheet>

        {/* Daily Wardrobe Insights Bottom Sheet */}
        <BottomSheet
          open={notifPanelOpen}
          onClose={() => setNotifPanelOpen(false)}
          title="Daily Wardrobe Insights"
          subtitle="Smart nudges from your closet & weather"
          icon={<Bell className="w-4 h-4 text-turquoise" />}
          titleId="notif-modal-title"
          footer={
            <button
              type="button"
              onClick={() => setNotifPanelOpen(false)}
              className="btn-shine btn-lumina-primary w-full min-h-[42px] rounded-xl text-xs font-bold cursor-pointer"
            >
              Got it
            </button>
          }
        >
          <div className="space-y-3">
            <div className="p-3.5 rounded-2xl bg-muted/60 border border-border space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-green inline-flex items-center gap-1.5">
                <WashingMachine className="w-3.5 h-3.5" />
                Laundry Notice
              </span>
              <p className="text-xs text-foreground leading-relaxed">
                Everyday colors hamper has 5 pieces. A small cold wash before
                Friday keeps your favorites ready.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-muted/60 border border-border space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-turquoise inline-flex items-center gap-1.5">
                <CloudSun className="w-3.5 h-3.5" />
                Climate Update
              </span>
              <p className="text-xs text-foreground leading-relaxed">
                Mild forecast today. Layered tops and breathable trousers stay
                comfortable indoors and outdoors.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-muted/60 border border-border space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gold inline-flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                Rediscovery Tip
              </span>
              <p className="text-xs text-foreground leading-relaxed">
                You have unworn pieces in your wardrobe! Tap Ask AI to surface
                fresh pairings.
              </p>
            </div>
          </div>
        </BottomSheet>

        {/* Quick Guide Bottom Sheet */}
        <BottomSheet
          open={helpOpen}
          onClose={() => setHelpOpen(false)}
          title="Quick Guide & FAQ"
          subtitle="Make the most of your AI wardrobe"
          icon={<HelpCircle className="w-4 h-4 text-gold" />}
          titleId="help-modal-title"
          footer={
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setHelpOpen(false)
                  handleSelectTab("generator")
                }}
                className="btn-shine ask-ai-gradient min-h-[42px] rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Open Ask AI
              </button>
              <button
                type="button"
                onClick={() => setHelpOpen(false)}
                className="min-h-[42px] rounded-xl text-xs font-semibold bg-muted border border-border text-foreground cursor-pointer"
              >
                Close
              </button>
            </div>
          }
        >
          <div className="space-y-3 text-xs">
            <div className="p-3.5 rounded-2xl bg-muted/60 border border-border">
              <p className="font-bold text-foreground flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-pink" />
                Need an outfit for an event?
              </p>
              <p className="text-muted-foreground mt-1 leading-relaxed">
                Tap the glossy <strong className="text-foreground">Ask AI</strong>{" "}
                button in the center of the bottom bar anytime to describe your
                event or refine outfits by chat.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-muted/60 border border-border">
              <p className="font-bold text-foreground flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5 text-turquoise" />
                How do I change one item in an outfit?
              </p>
              <p className="text-muted-foreground mt-1 leading-relaxed">
                Tap <strong className="text-turquoise">Swap</strong> right next to
                any top, bottom, or pair of shoes to pick another clean piece from
                your closet.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-muted/60 border border-border">
              <p className="font-bold text-foreground flex items-center gap-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5 text-gold" />
                Fonts, Contrast &amp; Sensory Modes
              </p>
              <p className="text-muted-foreground mt-1 leading-relaxed">
                Tap the sliders icon in the top bar for instant fonts, text scale,
                read-aloud, and high-contrast mode, or open{" "}
                <strong className="text-foreground">Profile &amp; Demo</strong>{" "}
                from your avatar for full sensory filters.
              </p>
            </div>
          </div>
        </BottomSheet>

        {/* Main Content Area with subtle tab transition */}
        <main
          ref={mainRef}
          id="main-content"
          tabIndex={-1}
          className="flex-1 min-h-0 overflow-y-auto pt-1 pb-4 focus:outline-none"
        >
          <div key={tab} className="tab-fade-enter">
            {tab === "home" && <HomeTab />}
            {tab === "wardrobe" && <WardrobeTab />}
            {tab === "generator" && <GeneratorTab />}
            {tab === "calendar" && <CalendarTab />}
            {tab === "laundry" && <LaundryTab />}
            {tab === "tryon" && <TryOnTab />}
            {tab === "profile" && <ProfileTab onBack={() => handleSelectTab("home")} />}
          </div>
        </main>

        {/* Slim Editorial Lumina Bottom Navigation Bar with Glossy Pink-to-Gold Ask AI */}
        <nav
          aria-label="Primary navigation"
          className="shrink-0 -mx-3.5 px-2 pt-1.5 flex items-center border-t border-border relative z-30"
          style={{
            background: "var(--nav-bg)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            paddingBottom: "calc(env(safe-area-inset-bottom) + 6px)",
          }}
        >
          {NAV.map((n) => {
            const active = tab === n.id
            const Icon = n.Icon

            if (n.featured) {
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleSelectTab(n.id)}
                  aria-current={active ? "page" : undefined}
                  aria-label="Ask AI Stylist"
                  className="flex-1 flex flex-col items-center justify-center py-0.5 transition-transform active:scale-95 focus-visible:z-10 cursor-pointer"
                >
                  <span
                    className={`btn-shine ask-ai-gradient h-10 px-4 rounded-full flex items-center justify-center gap-1.5 transition-all ${
                      active
                        ? "ring-2 ring-foreground/40 ring-offset-2 ring-offset-background scale-[1.03]"
                        : "hover:brightness-105"
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0 text-[#FFCB44]" strokeWidth={2.2} />
                    <span className="text-[11px] font-extrabold tracking-tight whitespace-nowrap">
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
                onClick={() => handleSelectTab(n.id)}
                aria-current={active ? "page" : undefined}
                className={`flex-1 min-h-[48px] flex flex-col items-center justify-center gap-1 py-1 relative transition-colors active:scale-95 cursor-pointer ${
                  active
                    ? "text-pink"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <span
                  className={`w-10 h-6 rounded-full flex items-center justify-center transition-colors ${
                    active ? "bg-pink/12" : ""
                  }`}
                >
                  <Icon
                    className="w-[18px] h-[18px]"
                    strokeWidth={active ? 2.2 : 1.75}
                  />
                </span>
                <span
                  className={`text-[10px] leading-none ${
                    active ? "font-bold" : "font-medium"
                  }`}
                >
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
