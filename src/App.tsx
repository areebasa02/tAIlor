import { useState } from "react"
import { AppProvider, useApp } from "./context/AppContext"
import LoginScreen from "./components/LoginScreen"
import HomeTab from "./tabs/HomeTab"
import WardrobeTab from "./tabs/WardrobeTab"
import GeneratorTab from "./tabs/GeneratorTab"
import TryOnTab from "./tabs/TryOnTab"
import LaundryTab from "./tabs/LaundryTab"
import ProfileTab from "./tabs/ProfileTab"

type Tab = "home" | "wardrobe" | "generator" | "laundry" | "tryon" | "profile"

const NAV = [
  { id: "home" as Tab, label: "Today", icon: "✦" },
  { id: "wardrobe" as Tab, label: "Wardrobe", icon: "👔" },
  { id: "generator" as Tab, label: "Stylist", icon: "✧" },
  { id: "laundry" as Tab, label: "Laundry", icon: "🧺" },
  { id: "tryon" as Tab, label: "Try-On", icon: "🪞" },
]

function MainApp() {
  const { user, isAuthenticated, logout, notifications, dismissToast } =
    useApp()
  const [tab, setTab] = useState<Tab>("home")
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [notifPanelOpen, setNotifPanelOpen] = useState(false)

  if (!isAuthenticated) {
    return <LoginScreen />
  }

  return (
    <div
      className="flex flex-col min-h-screen w-full max-w-5xl lg:max-w-6xl mx-auto relative px-3 sm:px-6 lg:px-8"
      style={{ background: "var(--background)" }}
    >
      {/* Toast notifications float */}
      <div className="fixed top-3 right-4 sm:right-6 md:right-8 z-50 w-[90%] max-w-xs space-y-2 pointer-events-none">
        {notifications.map((n) => (
          <div
            key={n.id}
            onClick={() => dismissToast(n.id)}
            className="pointer-events-auto rounded-2xl p-3 shadow-2xl flex items-start gap-2.5 border backdrop-blur-md transition-all animate-in fade-in slide-in-from-top-2 duration-200 cursor-pointer"
            style={{
              background: "rgba(22, 25, 36, 0.96)",
              borderColor:
                n.type === "success"
                  ? "var(--green)"
                  : n.type === "warning"
                    ? "var(--orange)"
                    : "var(--sky)",
            }}
          >
            <span className="text-sm">
              {n.type === "success" ? "✓" : n.type === "warning" ? "⚠" : "ℹ"}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-white leading-tight">
                {n.title}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">
                {n.message}
              </p>
            </div>
            <span className="text-[10px] text-muted-foreground">✕</span>
          </div>
        ))}
      </div>

      {/* Header */}
      <header className="flex items-center justify-between py-4 shrink-0 border-b border-white/5 relative z-40 mb-2">
        {/* Brand Logo & Presentation Tag */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setTab("home")}
            className="flex items-center text-left transition-transform active:scale-95"
            aria-label="tAIlor home"
          >
            <span
              className="text-3xl italic leading-none"
              style={{
                fontFamily: "Nunito, sans-serif",
                color: "var(--magenta)",
              }}
            >
              t
            </span>
            <span
              className="text-3xl font-black leading-none"
              style={{ fontFamily: "Nunito, sans-serif", color: "var(--sky)" }}
            >
              AI
            </span>
            <span
              className="text-3xl italic leading-none"
              style={{
                fontFamily: "Nunito, sans-serif",
                color: "var(--magenta)",
              }}
            >
              lor
            </span>
          </button>

          <span className="hidden sm:inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/5 text-muted-foreground border border-white/10">
            HCI Prototype
          </span>
        </div>

        {/* Right Header Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Active User Persona Pill */}
          <div
            onClick={() => setTab("profile")}
            className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-full border cursor-pointer hover:border-sky-400 transition-colors"
            style={{ background: "var(--muted)", borderColor: "var(--border)" }}
            title="Active Persona Profile"
          >
            <div
              className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white"
              style={{ background: user.avatarBg }}
            >
              {user.initials}
            </div>
            <span className="text-xs font-bold text-white">
              {user.name.split(" ")[0]}
            </span>
          </div>

          {/* Accessibility Indicator Pills */}
          {user.accessibility.lowDecisionMode && (
            <span
              className="hidden md:inline-block text-[9px] font-bold px-2 py-0.5 rounded-full"
              style={{
                background: "rgba(212,0,103,0.15)",
                color: "var(--magenta)",
              }}
              title="Low Decision Mode Active"
            >
              🧠 Low Fatigue
            </span>
          )}

          {user.accessibility.highContrastColors && (
            <span
              className="hidden md:inline-block text-[9px] font-bold px-2 py-0.5 rounded-full"
              style={{
                background: "rgba(114,212,240,0.15)",
                color: "var(--sky)",
              }}
              title="High Contrast Color Labels Active"
            >
              👁️ High Contrast
            </span>
          )}

          {/* Quick Notifications Button */}
          <button
            type="button"
            onClick={() => setNotifPanelOpen(!notifPanelOpen)}
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs relative border transition-transform active:scale-95"
            style={{ background: "var(--muted)", borderColor: "var(--border)" }}
            aria-label="Alerts and suggestions"
          >
            <span>🔔</span>
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#72D4F0]" />
          </button>

          {/* User Avatar Button & Menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              aria-label={`Open ${user.name}'s profile and menu`}
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-md transition-transform active:scale-95 border"
              style={{
                background: user.avatarBg,
                color: "#fff",
                borderColor: "rgba(255,255,255,0.25)",
              }}
            >
              {user.initials}
            </button>

            {/* Quick Profile Dropdown Menu */}
            {userMenuOpen && (
              <div
                className="absolute right-0 mt-2 w-48 rounded-2xl p-2 shadow-2xl border backdrop-blur-md animate-in fade-in zoom-in-95 duration-100 z-50"
                style={{
                  background: "var(--card)",
                  borderColor: "var(--border)",
                }}
              >
                <div className="px-3 py-2 border-b border-white/5 mb-1">
                  <p className="text-xs font-bold text-white truncate">
                    {user.name.split(" ")[0]}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {user.email}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setTab("profile")
                    setUserMenuOpen(false)
                  }}
                  className="w-full px-3 py-2 text-left text-xs font-medium rounded-xl hover:bg-white/5 text-white flex items-center gap-2"
                >
                  <span>👤</span>
                  <span>View Profile & Settings</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setTab("profile")
                    setUserMenuOpen(false)
                  }}
                  className="w-full px-3 py-2 text-left text-xs font-medium rounded-xl hover:bg-white/5 text-white flex items-center gap-2"
                >
                  <span>⚡</span>
                  <span>Switch Persona</span>
                </button>

                <div className="border-t border-white/5 mt-1 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setUserMenuOpen(false)
                      logout()
                    }}
                    className="w-full px-3 py-2 text-left text-xs font-bold rounded-xl text-red-400 hover:bg-red-500/10 flex items-center gap-2"
                  >
                    <span>🚪</span>
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Notifications Drawer */}
      {notifPanelOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
          <div
            className="rounded-3xl p-5 max-w-sm w-full space-y-3.5 shadow-2xl border"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span>🔔</span>
                <h3 className="text-sm font-bold text-white">
                  Daily Wardrobe Insights
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setNotifPanelOpen(false)}
                className="text-xs text-muted-foreground hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2.5">
              <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/5 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-green-400">
                  🧺 Laundry Notice
                </span>
                <p className="text-xs text-foreground">
                  Everyday colors hamper is at 5 pieces. A small cold wash
                  before Friday is recommended.
                </p>
              </div>

              <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/5 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400">
                  ⛅ Climate Update
                </span>
                <p className="text-xs text-foreground">
                  Mild 68°F forecast today. Perfect weather for the Camel
                  trousers or Navy tee.
                </p>
              </div>

              <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/5 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-yellow-400">
                  ✨ Rediscovery Tip
                </span>
                <p className="text-xs text-foreground">
                  Your Mint ribbed mock-neck hasn't been worn in 3 weeks. Check
                  today's "Rediscover" outfit!
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setNotifPanelOpen(false)}
              className="w-full py-2.5 rounded-xl text-xs font-bold text-white"
              style={{ background: "var(--magenta)" }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto pb-28 md:pb-24">
        {tab === "home" && <HomeTab />}
        {tab === "wardrobe" && <WardrobeTab />}
        {tab === "generator" && <GeneratorTab />}
        {tab === "laundry" && <LaundryTab />}
        {tab === "tryon" && <TryOnTab />}
        {tab === "profile" && <ProfileTab onBack={() => setTab("home")} />}
      </main>

      {/* Bottom Navigation: Edge-to-edge on Mobile, Floating Centered Dock on Desktop/Presentation */}
      <nav
        className="fixed bottom-0 left-0 right-0 md:bottom-4 md:left-1/2 md:right-auto md:w-full md:max-w-lg md:-translate-x-1/2 flex items-stretch md:rounded-2xl z-40 transition-all"
        style={{
          background: "rgba(13,15,24,0.95)",
          backdropFilter: "blur(24px)",
          borderTop: "1px solid rgba(255,255,255,0.12)",
          borderLeft: "1px solid rgba(255,255,255,0.12)",
          borderRight: "1px solid rgba(255,255,255,0.12)",
          borderBottom: "1px solid rgba(255,255,255,0.12)",
          paddingBottom: "calc(env(safe-area-inset-bottom) + 2px)",
          boxShadow: "0 -4px 25px rgba(0,0,0,0.5), 0 10px 30px rgba(0,0,0,0.7)",
        }}
      >
        {NAV.map((n) => {
          const active = tab === n.id
          return (
            <button
              key={n.id}
              onClick={() => {
                setTab(n.id)
                setUserMenuOpen(false)
              }}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 sm:py-2 text-xs font-medium relative transition-all hover:bg-white/[0.03] md:rounded-xl"
              style={{
                color: active ? "var(--magenta)" : "rgba(255,255,255,0.65)",
              }}
            >
              <span className="text-base sm:text-lg leading-none">
                {n.icon}
              </span>
              <span className="text-[10px] tracking-wide uppercase font-bold">
                {n.label}
              </span>
              {active && (
                <span
                  className="absolute bottom-0 w-8 h-0.5 rounded-full"
                  style={{ background: "var(--magenta)" }}
                />
              )}
            </button>
          )
        })}
      </nav>
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
      <MainApp />
    </AppProvider>
  )
}
