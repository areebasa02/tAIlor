import { useState } from "react"
import { useApp, PRESET_PERSONAS } from "../context/AppContext"
import type { PersonaId } from "../types"
import { getContrastTextColor } from "../types"

export default function ProfileTab({ onBack }: { onBack: () => void }) {
  const {
    user,
    switchUser,
    updateAccessibility,
    logout,
    wardrobe,
    recentLooks,
    showToast,
  } = useApp()
  const [confirmLogout, setConfirmLogout] = useState(false)

  const cleanItems = wardrobe.filter((i) => i.status !== "dirty").length
  const dirtyItems = wardrobe.filter((i) => i.status === "dirty").length
  const favItems = wardrobe.filter((i) => i.favorite).length
  const rarelyWorn = wardrobe.filter((i) => i.worn < 5).length

  return (
    <div className="pt-2 pb-6 space-y-5">
      {/* Back button */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="text-xs font-bold hover:underline flex items-center gap-1"
          style={{ color: "var(--sky)" }}
        >
          ← Back to Today
        </button>

        <button
          type="button"
          onClick={() => setConfirmLogout(true)}
          className="text-xs font-bold px-3 py-1.5 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors"
        >
          Sign Out
        </button>
      </div>

      {/* Responsive Grid: 1 Column on Mobile, 2 Columns on Desktop & Presentation Screens */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column on Desktop: User Hero, Persona Switcher & Closet Analytics */}
        <div className="lg:col-span-5 space-y-4">
          {/* User Hero */}
          <div className="flex items-center gap-4 p-4 rounded-3xl border shadow-sm" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold shadow-lg shrink-0"
              style={{
                background: user.avatarBg,
                color: getContrastTextColor(user.avatarBg),
              }}
            >
              {user.initials}
            </div>
            <div className="min-w-0 flex-1">
              <h2
                className="text-xl font-bold text-white truncate"
                style={{ fontFamily: "Nunito, sans-serif" }}
              >
                {user.name}
              </h2>
              <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              <span className="inline-block mt-1 text-[9px] font-bold px-2 py-0.5 rounded-full bg-white/10 text-sky-400">
                {user.roleTitle}
              </span>
            </div>
          </div>

          {/* Persona Switcher - Crucial for Presentation / HCI Testing */}
          <div
            className="rounded-3xl p-4 space-y-3 border shadow-sm"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400">
                ⚡ Switch Active HCI Persona
              </span>
              <span className="text-[9px] text-muted-foreground">
                Team & User Study
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-2">
              {Object.values(PRESET_PERSONAS).map((p) => {
                const active = user.id === p.id
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => switchUser(p.id)}
                    className="p-2 rounded-2xl border text-left flex items-center gap-2 transition-all hover:scale-[1.02]"
                    style={{
                      background: active ? "rgba(212,0,103,0.15)" : "var(--muted)",
                      borderColor: active ? "var(--magenta)" : "var(--border)",
                    }}
                  >
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                      style={{
                        background: p.avatarBg,
                        color: getContrastTextColor(p.avatarBg),
                      }}
                    >
                      {p.initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-bold text-white truncate leading-tight">
                        {p.name.split(" ")[0]}
                      </p>
                      <p className="text-[8px] text-muted-foreground truncate">
                        {p.id === "eliora" ? "Senior IT" : p.id}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Wardrobe & Sustainability Analytics (Proposal Item 3) */}
          <div
            className="rounded-3xl p-4 space-y-3 border shadow-sm"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
              Closet & Wear Analytics
            </span>

            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="p-2.5 rounded-2xl bg-white/[0.02] border border-white/5">
                <p className="text-lg font-bold text-white">{wardrobe.length}</p>
                <p className="text-[9px] text-muted-foreground">Total Pieces</p>
              </div>
              <div className="p-2.5 rounded-2xl bg-white/[0.02] border border-white/5">
                <p className="text-lg font-bold text-green-400">{cleanItems}</p>
                <p className="text-[9px] text-muted-foreground">Clean & Ready</p>
              </div>
              <div className="p-2.5 rounded-2xl bg-white/[0.02] border border-white/5">
                <p className="text-lg font-bold text-pink-400">{dirtyItems}</p>
                <p className="text-[9px] text-muted-foreground">In Laundry</p>
              </div>
              <div className="p-2.5 rounded-2xl bg-white/[0.02] border border-white/5">
                <p className="text-lg font-bold text-yellow-400">{favItems}</p>
                <p className="text-[9px] text-muted-foreground">Favorites ♥</p>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5 flex items-center justify-between text-xs">
              <div>
                <p className="font-semibold text-white">Rediscovery Opportunity</p>
                <p className="text-[10px] text-muted-foreground">
                  {rarelyWorn} pieces worn less than 5 times. AI prioritizes these
                  in rediscovery recommendations.
                </p>
              </div>
              <span className="text-xl">✨</span>
            </div>
          </div>
        </div>

        {/* Right Column on Desktop: Accessibility Settings & Profile Details */}
        <div className="lg:col-span-7 space-y-4">
          {/* Accessibility & Sensory Toggles */}
          <div
            className="rounded-3xl p-4 sm:p-5 space-y-3 border shadow-sm"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400 block">
              Accessibility & Neurodivergent Settings
            </span>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="pr-2">
                  <p className="text-xs font-bold text-white">
                    High-Contrast Color Labels
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Displays exact hue names and hex codes for visual impairments &
                    color blindness.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    updateAccessibility(
                      "highContrastColors",
                      !user.accessibility.highContrastColors,
                    )
                  }
                  className="w-11 h-6 rounded-full p-0.5 transition-colors shrink-0"
                  style={{
                    background: user.accessibility.highContrastColors
                      ? "var(--sky)"
                      : "var(--muted)",
                  }}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white transition-transform ${
                      user.accessibility.highContrastColors
                        ? "translate-x-5"
                        : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-white/5">
                <div className="pr-2">
                  <p className="text-xs font-bold text-white">Low Decision Mode</p>
                  <p className="text-[10px] text-muted-foreground">
                    Reduces morning decision fatigue by highlighting the primary AI look
                    while preserving full customization.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    updateAccessibility(
                      "lowDecisionMode",
                      !user.accessibility.lowDecisionMode,
                    )
                  }
                  className="w-11 h-6 rounded-full p-0.5 transition-colors shrink-0"
                  style={{
                    background: user.accessibility.lowDecisionMode
                      ? "var(--magenta)"
                      : "var(--muted)",
                  }}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white transition-transform ${
                      user.accessibility.lowDecisionMode
                        ? "translate-x-5"
                        : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-white/5">
                <div className="pr-2">
                  <p className="text-xs font-bold text-white">
                    Sensory Fabric Filter
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Flags tagless, seamless, and breathable natural fibers; warns on
                    itchy wool.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    updateAccessibility(
                      "sensorySensitive",
                      !user.accessibility.sensorySensitive,
                    )
                  }
                  className="w-11 h-6 rounded-full p-0.5 transition-colors shrink-0"
                  style={{
                    background: user.accessibility.sensorySensitive
                      ? "var(--green)"
                      : "var(--muted)",
                  }}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white transition-transform ${
                      user.accessibility.sensorySensitive
                        ? "translate-x-5"
                        : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Profile Details List */}
          <div
            className="rounded-3xl overflow-hidden border shadow-sm"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            {[
              ["Preferred style", user.preferredStyle],
              ["Typical sizes", user.typicalSizes],
              ["Home climate", user.homeClimate],
              ["Stylist notes", user.stylistNotes],
            ].map(([label, value], index) => (
              <div
                key={label}
                className="px-4 py-3"
                style={{ borderTop: index ? "1px solid var(--border)" : undefined }}
              >
                <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">
                  {label}
                </p>
                <p className="text-xs font-medium text-white mt-0.5">{value}</p>
              </div>
            ))}
          </div>

          {/* AI Personalization Notice */}
          <div
            className="rounded-3xl p-4 border leading-relaxed"
            style={{
              background: "rgba(114,212,240,0.06)",
              borderColor: "rgba(114,212,240,0.2)",
              color: "var(--muted-foreground)",
            }}
          >
            <p className="text-xs font-bold text-sky-400">
              About tAIlor AI Personalization
            </p>
            <p className="text-[11px] mt-1 leading-relaxed">
              tAIlor continually adapts to your approvals, item swaps, and wear
              frequency. Your styling rules remain private to your local profile.
            </p>
          </div>
        </div>
      </div>

      {/* Confirm Logout Dialog */}
      {confirmLogout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div
            className="rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl border"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <h3 className="text-base font-bold text-white">
              Sign Out of tAIlor?
            </h3>
            <p className="text-xs text-muted-foreground">
              You will return to the login screen. Your wardrobe data and recent
              wear logs will be preserved for your next session.
            </p>
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmLogout(false)}
                className="py-2.5 rounded-xl text-xs font-semibold text-muted-foreground hover:text-white"
                style={{ background: "var(--muted)" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmLogout(false)
                  logout()
                }}
                className="py-2.5 rounded-xl text-xs font-bold text-white"
                style={{ background: "var(--magenta)" }}
              >
                Confirm Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
