import { useState } from "react"
import { useApp, PRESET_PERSONAS } from "../context/AppContext"
import type { PersonaId, UserProfile } from "../types"

export default function LoginScreen() {
  const { login } = useApp()
  const [mode, setMode] = useState<"signin" | "signup">("signin")
  const [email, setEmail] = useState("eliora.browning@example.com")
  const [password, setPassword] = useState("••••••••••••")
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)
  const [name, setName] = useState("")
  const [preferredStyle, setPreferredStyle] = useState("Polished & comfortable")
  const [highContrast, setHighContrast] = useState(false)
  const [lowDecision, setLowDecision] = useState(false)
  const [sensoryMode, setSensoryMode] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [forgotModalOpen, setForgotModalOpen] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [resetEmail, setResetEmail] = useState("")

  const handleSignIn = (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setTimeout(() => {
      const match = Object.values(PRESET_PERSONAS).find(
        (p) => p.email.toLowerCase() === email.toLowerCase(),
      )
      if (match) {
        login(match)
      } else {
        const customUser: UserProfile = {
          id: "eliora",
          name: email.split("@")[0] || "Wardrobe User",
          initials:
            (email[0] || "U").toUpperCase() + (email[1] || "S").toUpperCase(),
          email: email,
          avatarBg: "var(--magenta)",
          roleTitle: "Custom Wardrobe Member",
          preferredStyle: "Comfortable & Versatile",
          typicalSizes: "Tops M · Bottoms 30",
          homeClimate: "Mild (68°F)",
          stylistNotes: "Custom preferences applied.",
          accessibility: {
            highContrastColors: highContrast,
            sensorySensitive: sensoryMode,
            lowDecisionMode: lowDecision,
            voiceNarration: false,
          },
        }
        login(customUser)
      }
      setIsLoading(false)
    }, 500)
  }

  const handleSignUp = (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setTimeout(() => {
      const initials = name
        ? name
            .split(" ")
            .map((p) => p[0])
            .join("")
            .toUpperCase()
            .slice(0, 2)
        : "NU"

      const newUser: UserProfile = {
        id: "eliora",
        name: name || "New Fashionista",
        initials: initials || "NF",
        email: email || "user@tailor.app",
        avatarBg: "#007A8A",
        roleTitle: "New Member · Smart Closet",
        preferredStyle: preferredStyle,
        typicalSizes: "Tops M · Bottoms 8 · Shoes 8",
        homeClimate: "Mild & changeable",
        stylistNotes: "Personal AI stylist is initializing your profile.",
        accessibility: {
          highContrastColors: highContrast,
          sensorySensitive: sensoryMode,
          lowDecisionMode: lowDecision,
          voiceNarration: false,
        },
      }
      login(newUser)
      setIsLoading(false)
    }, 600)
  }

  const handlePersonaSelect = (personaId: PersonaId) => {
    const p = PRESET_PERSONAS[personaId]
    setEmail(p.email)
    setIsLoading(true)
    setTimeout(() => {
      login(p)
      setIsLoading(false)
    }, 350)
  }

  return (
    <div
      className="min-h-screen w-full flex flex-col justify-center px-4 sm:px-6 lg:px-8 xl:px-12 2xl:px-16 py-6 lg:py-12"
      style={{ background: "var(--background)" }}
    >
      <div className="w-full max-w-7xl 2xl:max-w-[1700px] mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 xl:gap-16 2xl:gap-24 items-center">
          {/* Left Column on Desktop / Top on Mobile: Hero & Project Proposal Pitch */}
          <div className="lg:col-span-5 flex flex-col space-y-5 text-center lg:text-left">
            <div>
              <div className="inline-flex items-center gap-1 justify-center lg:justify-start">
                <span
                  className="text-4xl sm:text-5xl italic leading-none"
                  style={{
                    fontFamily: "Nunito, sans-serif",
                    color: "var(--magenta)",
                  }}
                >
                  t
                </span>
                <span
                  className="text-4xl sm:text-5xl font-black leading-none"
                  style={{
                    fontFamily: "Nunito, sans-serif",
                    color: "var(--sky)",
                  }}
                >
                  AI
                </span>
                <span
                  className="text-4xl sm:text-5xl italic leading-none"
                  style={{
                    fontFamily: "Nunito, sans-serif",
                    color: "var(--magenta)",
                  }}
                >
                  lor
                </span>
              </div>
              <p
                className="text-xs sm:text-sm mt-2 font-bold tracking-wide"
                style={{ color: "var(--sky)" }}
              >
                Accessible AI-Powered Wardrobe Assistant
              </p>
              <p className="text-xs sm:text-sm mt-2 text-muted-foreground leading-relaxed max-w-md mx-auto lg:mx-0">
                Getting dressed shouldn't be a daily debacle. tAIlor combines
                color theory, climate context, and object permanence tracking to
                eliminate decision fatigue.
              </p>
            </div>

            {/* Target Users Pills */}
            <div className="flex flex-wrap gap-2 justify-center lg:justify-start">
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-white">
                ♿ Differently-abled & Neurodivergent
              </span>
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-sky-400">
                🧠 Decision Fatigue Optimization
              </span>
            </div>

            {/* Feature Highlights Grid */}
            <div className="grid grid-cols-2 gap-2.5 pt-1">
              {[
                {
                  icon: "✦",
                  title: "Context Generator",
                  desc: "Weather & vibe-aligned styling",
                },
                {
                  icon: "🎨",
                  title: "Color Theory",
                  desc: "High-contrast accessible palettes",
                },
                {
                  icon: "🪞",
                  title: "Virtual Fitting",
                  desc: "cat-VTON preview before dressing",
                },
                {
                  icon: "🧺",
                  title: "Laundry Tracker",
                  desc: "Protects delicate fabrics & routine",
                },
              ].map((f) => (
                <div
                  key={f.title}
                  className="p-3 rounded-2xl flex items-start gap-2.5 text-left transition-colors"
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <span
                    className="text-base leading-none mt-0.5"
                    style={{ color: "var(--magenta)" }}
                  >
                    {f.icon}
                  </span>
                  <div>
                    <p className="text-[11px] font-bold text-white leading-tight">
                      {f.title}
                    </p>
                    <p className="text-[9px] text-muted-foreground leading-snug mt-0.5">
                      {f.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-[11px] text-muted-foreground pt-1">
              Project tAIlor · The Spice Girls · Southeastern Louisiana
              University CMPS 4200 HCI
            </p>
          </div>

          {/* Right Column on Desktop / Center on Mobile: Auth Card */}
          <div className="lg:col-span-7 w-full max-w-lg mx-auto lg:max-w-none">
            <div
              className="rounded-3xl p-5 sm:p-7 space-y-5 shadow-2xl relative border"
              style={{
                background: "var(--card)",
                borderColor: "rgba(255,255,255,0.1)",
              }}
            >
              {/* Sign In vs Sign Up Tabs */}
              <div
                className="grid grid-cols-2 p-1 rounded-2xl"
                style={{ background: "var(--muted)" }}
              >
                <button
                  type="button"
                  onClick={() => setMode("signin")}
                  className="py-2.5 rounded-xl text-xs font-bold transition-all"
                  style={{
                    background:
                      mode === "signin" ? "var(--magenta)" : "transparent",
                    color:
                      mode === "signin" ? "#fff" : "var(--muted-foreground)",
                    boxShadow:
                      mode === "signin"
                        ? "0 2px 10px rgba(212,0,103,0.35)"
                        : "none",
                  }}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => setMode("signup")}
                  className="py-2.5 rounded-xl text-xs font-bold transition-all"
                  style={{
                    background:
                      mode === "signup" ? "var(--magenta)" : "transparent",
                    color:
                      mode === "signup" ? "#fff" : "var(--muted-foreground)",
                    boxShadow:
                      mode === "signup"
                        ? "0 2px 10px rgba(212,0,103,0.35)"
                        : "none",
                  }}
                >
                  Create Account
                </button>
              </div>

              {/* 1-Click HCI Persona Login Badges (FIRST NAMES ONLY) */}
              <div
                className="rounded-2xl p-3.5 space-y-2.5 border"
                style={{
                  background: "rgba(114,212,240,0.06)",
                  borderColor: "rgba(114,212,240,0.2)",
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400">
                    ⚡ 1-Click Persona Login
                  </span>
                  <span className="text-[9px] text-muted-foreground">
                    First Name Demo Profiles
                  </span>
                </div>

                {/* Persona Buttons - ONLY FIRST NAMES */}
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2">
                  {[
                    {
                      id: "eliora" as PersonaId,
                      label: "Eliora",
                      sub: "Front-End & Research",
                      bg: "#D40067",
                      initials: "EB",
                    },
                    {
                      id: "ethan" as PersonaId,
                      label: "Ethan",
                      sub: "Flow 01: Events",
                      bg: "#007A8A",
                      initials: "EC",
                    },
                    {
                      id: "jordan" as PersonaId,
                      label: "Jordan",
                      sub: "Flow 02: Fatigue",
                      bg: "#3BBF6C",
                      initials: "JM",
                    },
                    {
                      id: "josephine" as PersonaId,
                      label: "Josephine",
                      sub: "Flow 03: Contrast",
                      bg: "#FFD83D",
                      initials: "JD",
                      textDark: true,
                    },
                    {
                      id: "areeba" as PersonaId,
                      label: "Areeba",
                      sub: "Team Lead",
                      bg: "#E84B1A",
                      initials: "AA",
                    },
                  ].map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handlePersonaSelect(p.id)}
                      className="flex items-center gap-2 p-2 rounded-xl text-left border transition-all hover:scale-[1.02] active:scale-[0.98] hover:border-sky-400/50"
                      style={{
                        background: "var(--card)",
                        borderColor: "var(--border)",
                      }}
                      title={`Sign in as ${p.label}`}
                    >
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 shadow-sm"
                        style={{
                          background: p.bg,
                          color: p.textDark ? "#0D0F18" : "#fff",
                        }}
                      >
                        {p.initials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-bold text-white truncate leading-tight">
                          {p.label}
                        </p>
                        <p className="text-[9px] text-muted-foreground truncate leading-none mt-0.5">
                          {p.sub}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Form Area */}
              {mode === "signin" ? (
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider block mb-1.5 text-muted-foreground">
                      Email Address
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@example.com"
                      className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none transition-colors border"
                      style={{
                        background: "var(--muted)",
                        color: "var(--foreground)",
                        borderColor: "var(--border)",
                      }}
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-wider block text-muted-foreground">
                        Password
                      </label>
                      <button
                        type="button"
                        onClick={() => setForgotModalOpen(true)}
                        className="text-[10px] font-semibold text-sky-400 hover:underline"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter password"
                        className="w-full rounded-xl pl-3.5 pr-10 py-2.5 text-sm outline-none transition-colors border"
                        style={{
                          background: "var(--muted)",
                          color: "var(--foreground)",
                          borderColor: "var(--border)",
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-white"
                        aria-label={
                          showPassword ? "Hide password" : "Show password"
                        }
                      >
                        {showPassword ? "👁" : "👁‍🗨"}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-foreground">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="w-4 h-4 rounded accent-[#D40067]"
                      />
                      <span>Remember this device</span>
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all hover:brightness-110 active:scale-[0.99] shadow-lg"
                    style={{
                      background: "var(--magenta)",
                      color: "#fff",
                    }}
                  >
                    {isLoading ? (
                      <>
                        <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                        <span>Signing In…</span>
                      </>
                    ) : (
                      <span>Sign In to Wardrobe →</span>
                    )}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleSignUp} className="space-y-3.5">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider block mb-1 text-muted-foreground">
                      Your First Name
                    </label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Jordan"
                      className="w-full rounded-xl px-3.5 py-2 text-sm outline-none border"
                      style={{
                        background: "var(--muted)",
                        color: "var(--foreground)",
                        borderColor: "var(--border)",
                      }}
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider block mb-1 text-muted-foreground">
                      Email Address
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full rounded-xl px-3.5 py-2 text-sm outline-none border"
                      style={{
                        background: "var(--muted)",
                        color: "var(--foreground)",
                        borderColor: "var(--border)",
                      }}
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider block mb-1 text-muted-foreground">
                      Preferred Style Direction
                    </label>
                    <select
                      value={preferredStyle}
                      onChange={(e) => setPreferredStyle(e.target.value)}
                      className="w-full rounded-xl px-3.5 py-2 text-sm outline-none border"
                      style={{
                        background: "var(--muted)",
                        color: "var(--foreground)",
                        borderColor: "var(--border)",
                      }}
                    >
                      <option>Polished & comfortable</option>
                      <option>Sharp business-casual</option>
                      <option>Minimalist & earth tones</option>
                      <option>Bold creative & colorful</option>
                      <option>Sporty & casual</option>
                    </select>
                  </div>

                  {/* Accessibility Onboarding Preferences */}
                  <div className="space-y-1.5 pt-1 border-t border-white/10">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-sky-400">
                      Accessibility & Decision Preferences
                    </p>
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={highContrast}
                        onChange={(e) => setHighContrast(e.target.checked)}
                        className="rounded accent-[#72D4F0]"
                      />
                      <span>
                        High-contrast color labels (for visual impairments)
                      </span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={lowDecision}
                        onChange={(e) => setLowDecision(e.target.checked)}
                        className="rounded accent-[#72D4F0]"
                      />
                      <span>
                        Low Decision Mode (single best pick to reduce fatigue)
                      </span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={sensoryMode}
                        onChange={(e) => setSensoryMode(e.target.checked)}
                        className="rounded accent-[#72D4F0]"
                      />
                      <span>
                        Sensory sensitive (tagless, seamless, soft fabrics)
                      </span>
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all hover:brightness-110 active:scale-[0.99] shadow-lg"
                    style={{
                      background: "var(--sky)",
                      color: "#0D0F18",
                    }}
                  >
                    {isLoading ? (
                      <>
                        <span className="w-4 h-4 rounded-full border-2 border-black border-t-transparent animate-spin" />
                        <span>Creating Profile…</span>
                      </>
                    ) : (
                      <span>Complete Setup & Enter →</span>
                    )}
                  </button>
                </form>
              )}

              {/* Instant Guest Mode */}
              <div className="pt-1 text-center">
                <button
                  type="button"
                  onClick={() => handlePersonaSelect("eliora")}
                  className="text-xs font-semibold py-1 text-muted-foreground hover:text-white hover:underline transition-colors"
                >
                  Continue as Guest (Instant Access)
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {forgotModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div
            className="rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl border"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">Reset Password</h3>
              <button
                type="button"
                onClick={() => {
                  setForgotModalOpen(false)
                  setResetSent(false)
                }}
                className="text-xs p-1 text-muted-foreground hover:text-white"
              >
                ✕
              </button>
            </div>

            {!resetSent ? (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Enter your email address to receive an instant recovery login
                  link.
                </p>
                <input
                  type="email"
                  value={resetEmail || email}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder="your.email@example.com"
                  className="w-full rounded-xl px-3.5 py-2 text-sm outline-none border"
                  style={{
                    background: "var(--muted)",
                    color: "var(--foreground)",
                    borderColor: "var(--border)",
                  }}
                />
                <button
                  type="button"
                  onClick={() => setResetSent(true)}
                  className="w-full py-2.5 rounded-xl text-xs font-bold text-white"
                  style={{ background: "var(--magenta)" }}
                >
                  Send Recovery Link
                </button>
              </div>
            ) : (
              <div className="space-y-3 text-center py-2">
                <span className="text-3xl">✉️</span>
                <p className="text-xs font-semibold text-green-400">
                  Password reset link sent!
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Check your inbox for instructions to securely sign back in.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setForgotModalOpen(false)
                    setResetSent(false)
                  }}
                  className="w-full py-2 rounded-xl text-xs font-semibold"
                  style={{
                    background: "var(--muted)",
                    color: "var(--foreground)",
                  }}
                >
                  Back to Sign In
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
