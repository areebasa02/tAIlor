import { useState, useEffect } from "react"
import { Moon, Sun, Zap } from "lucide-react"
import { useApp, PRESET_PERSONAS } from "../context/AppContext"
import type { PersonaId, UserProfile } from "../types"
import { THEME_COLORS } from "../types/theme"
import OnboardingQuiz from "./OnboardingQuiz"

export default function LoginScreen() {
  const { login, theme, toggleTheme } = useApp()
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

  const [quizOpen, setQuizOpen] = useState(false)
  const [quizPath, setQuizPath] = useState<"privacy" | "short" | "long" | "guest">("short")

  useEffect(() => {
    if (!forgotModalOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setForgotModalOpen(false)
        setResetSent(false)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [forgotModalOpen])

  const handleSignIn = (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setTimeout(() => {
      const match = Object.values(PRESET_PERSONAS).find(
        (p) => p.email.toLowerCase() === email.toLowerCase()
      )
      if (match) {
        login(match)
      } else {
        const customUser: UserProfile = {
          id: "eliora",
          name: email.split("@")[0] || "Wardrobe User",
          initials:
            (email[0] || "U").toUpperCase() + (email[1] || "S").toUpperCase(),
          email,
          avatarBg: THEME_COLORS.pink,
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
            largeText: false,
            visionImpairment: false,
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
        avatarBg: THEME_COLORS.darkTeal,
        roleTitle: "New Member · Smart Closet",
        preferredStyle,
        typicalSizes: "Tops M · Bottoms 8 · Shoes 8",
        homeClimate: "Mild & changeable",
        stylistNotes: "Personal AI stylist is initializing your profile.",
        accessibility: {
          highContrastColors: highContrast,
          sensorySensitive: sensoryMode,
          lowDecisionMode: lowDecision,
          voiceNarration: false,
          largeText: false,
          visionImpairment: false,
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
      className="min-h-dvh w-full flex justify-center transition-colors"
      style={{ background: "var(--outer-backdrop)" }}
    >
      {/* Skip to sign in link (WCAG 2.4.1 Bypass Blocks) */}
      <a
        href="#login-main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-3 focus:py-2 focus:rounded-xl focus:bg-foreground focus:text-background focus:text-xs focus:font-extrabold focus:shadow-xl"
      >
        Skip to sign in
      </a>

      <div
        className="w-full max-w-[540px] min-h-dvh flex flex-col justify-between pl-[max(0.875rem,env(safe-area-inset-left))] pr-[max(0.875rem,env(safe-area-inset-right))] pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] border-0 min-[560px]:border-x border-border sm:shadow-2xl overflow-y-auto"
        style={{
          backgroundColor: "var(--background)",
          backgroundImage: "var(--mobile-glow)",
        }}
      >
        <div className="space-y-4">
          {/* Top Bar with Editorial Wordmark + Theme Toggle */}
          <header className="flex items-center justify-between">
            <div
              role="img"
              aria-label="tAIlor"
              className="font-editorial text-[30px] leading-none tracking-tight inline-flex items-center"
            >
              <span aria-hidden="true" className="italic font-bold text-pink">
                t
              </span>
              <span aria-hidden="true" className="font-extrabold text-turquoise">
                AI
              </span>
              <span aria-hidden="true" className="italic font-bold text-pink">
                lor
              </span>
            </div>

            <button
              type="button"
              onClick={toggleTheme}
              aria-pressed={theme === "dark"}
              className="h-9 px-3.5 rounded-full flex items-center gap-1.5 text-xs font-semibold border border-border bg-card/85 text-foreground hover:border-turquoise/60 transition-all cursor-pointer"
              aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
            >
              {theme === "light" ? (
                <Moon className="w-3.5 h-3.5" />
              ) : (
                <Sun className="w-3.5 h-3.5 text-[#FFCB44]" />
              )}
              <span>{theme === "light" ? "Dark" : "Light"}</span>
            </button>
          </header>

          <main id="login-main" tabIndex={-1} className="space-y-4 focus:outline-none">
            {/* Editorial Pitch */}
            <div className="px-0.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-turquoise">
                AI Wardrobe Assistant
              </p>
              <h1 className="font-editorial text-2xl font-bold text-foreground leading-tight mt-0.5">
                Effortless daily outfits, tailored to your closet.
              </h1>
              <p className="text-xs mt-1 text-muted-foreground leading-relaxed">
                Curated for comfort, clarity, and your personal style.
              </p>
            </div>

            {/* Auth Card */}
            <div className="lumina-card rounded-[22px] overflow-hidden relative">
              <div aria-hidden="true" className="h-[2.5px] lumina-strip" />
              <div className="p-4 space-y-3.5">
              {/* Sign In vs Sign Up Tabs */}
              <div
                role="tablist"
                aria-label="Account authentication mode"
                className="grid grid-cols-2 p-1 rounded-2xl border border-border bg-muted/80"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === "signin"}
                  onClick={() => setMode("signin")}
                  className={`min-h-[38px] py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    mode === "signin"
                      ? "bg-card text-foreground shadow-sm border border-border"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === "signup"}
                  onClick={() => setMode("signup")}
                  className={`min-h-[38px] py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    mode === "signup"
                      ? "bg-card text-foreground shadow-sm border border-border"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Create Account
                </button>
              </div>

              {/* 1-Click Quick Sign In */}
              <div className="rounded-2xl p-3 space-y-2 border border-turquoise/25 bg-turquoise/8">
                <span className="text-[11px] font-bold uppercase tracking-wider text-turquoise inline-flex items-center gap-1">
                  <Zap className="w-3.5 h-3.5 text-gold" />
                  Quick Sign In
                </span>

                <div className="flex flex-wrap gap-2">
                  {[
                    {
                      id: "areeba" as PersonaId,
                      label: "Areeba",
                      bg: THEME_COLORS.red,
                      initial: "A",
                    },
                    {
                      id: "eliora" as PersonaId,
                      label: "Eliora",
                      bg: THEME_COLORS.pink,
                      initial: "E",
                    },
                    {
                      id: "ethan" as PersonaId,
                      label: "Ethan",
                      bg: THEME_COLORS.darkTeal,
                      initial: "E",
                    },
                    {
                      id: "jordan" as PersonaId,
                      label: "Jordan",
                      bg: THEME_COLORS.green,
                      initial: "J",
                    },
                    {
                      id: "josephine" as PersonaId,
                      label: "Josephine",
                      bg: THEME_COLORS.gold,
                      initial: "J",
                      textDark: true,
                    },
                  ].map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handlePersonaSelect(p.id)}
                      className="flex items-center gap-2 px-3 py-2 min-h-[44px] rounded-xl text-left border-2 transition-all hover:scale-[1.02] active:scale-[0.98] hover:border-turquoise flex-1 min-w-[115px] cursor-pointer"
                      style={{
                        background: "var(--card)",
                        borderColor: "var(--border)",
                      }}
                      title={`Sign in as ${p.label}`}
                    >
                      <div
                        aria-hidden="true"
                        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 shadow-sm border border-black/15"
                        style={{
                          background: p.bg,
                          color: p.textDark ? "#0D0F18" : "#fff",
                        }}
                      >
                        {p.initial}
                      </div>
                      <span className="text-xs font-extrabold text-foreground truncate leading-tight">
                        {p.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Form Area */}
              {mode === "signin" ? (
                <form onSubmit={handleSignIn} className="space-y-3.5">
                  <div>
                    <label
                      htmlFor="login-email"
                      className="text-xs font-extrabold uppercase tracking-wider block mb-1 text-foreground"
                    >
                      Email
                    </label>
                    <input
                      id="login-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@example.com"
                      className="w-full min-h-[44px] rounded-xl px-3.5 py-2.5 text-sm font-medium outline-none transition-colors border-2 focus:border-pink"
                      style={{
                        background: "var(--muted)",
                        color: "var(--foreground)",
                        borderColor: "var(--border)",
                      }}
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label
                        htmlFor="login-password"
                        className="text-xs font-extrabold uppercase tracking-wider block text-foreground"
                      >
                        Password
                      </label>
                      <button
                        type="button"
                        onClick={() => setForgotModalOpen(true)}
                        className="text-xs font-extrabold text-turquoise hover:underline cursor-pointer"
                      >
                        Forgot?
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        id="login-password"
                        type={showPassword ? "text" : "password"}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter password"
                        className="w-full min-h-[44px] rounded-xl pl-3.5 pr-11 py-2.5 text-sm font-medium outline-none transition-colors border-2 focus:border-pink"
                        style={{
                          background: "var(--muted)",
                          color: "var(--foreground)",
                          borderColor: "var(--border)",
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-pressed={showPassword}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center text-sm text-foreground hover:bg-card cursor-pointer"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        <span aria-hidden="true">{showPassword ? "👁" : "👁‍🗨"}</span>
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-0.5">
                    <label className="flex items-center gap-2.5 cursor-pointer select-none text-xs font-semibold text-foreground min-h-[44px]">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="w-5 h-5 rounded accent-pink"
                      />
                      <span>Remember this device</span>
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full min-h-[48px] py-3 rounded-xl text-[15px] font-black flex items-center justify-center gap-2 border-2 border-[#0D0F18]/20 dark:border-white/25 transition-all hover:brightness-110 active:scale-[0.99] shadow-lg bg-pink text-white cursor-pointer"
                  >
                    {isLoading ? (
                      <>
                        <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                        <span>Signing In…</span>
                      </>
                    ) : (
                      <span>Sign In →</span>
                    )}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleSignUp} className="space-y-3">
                  <div>
                    <label
                      htmlFor="signup-name"
                      className="text-[11px] font-bold uppercase tracking-wider block mb-1 text-muted-foreground"
                    >
                      Your First Name
                    </label>
                    <input
                      id="signup-name"
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Jordan"
                      className="w-full min-h-[44px] rounded-xl px-3.5 py-2 text-sm outline-none border-2 focus:border-turquoise"
                      style={{
                        background: "var(--muted)",
                        color: "var(--foreground)",
                        borderColor: "var(--border)",
                      }}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="signup-email"
                      className="text-[11px] font-bold uppercase tracking-wider block mb-1 text-muted-foreground"
                    >
                      Email Address
                    </label>
                    <input
                      id="signup-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full min-h-[44px] rounded-xl px-3.5 py-2 text-sm outline-none border-2 focus:border-turquoise"
                      style={{
                        background: "var(--muted)",
                        color: "var(--foreground)",
                        borderColor: "var(--border)",
                      }}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="signup-style"
                      className="text-[11px] font-bold uppercase tracking-wider block mb-1 text-muted-foreground"
                    >
                      Preferred Style Direction
                    </label>
                    <select
                      id="signup-style"
                      value={preferredStyle}
                      onChange={(e) => setPreferredStyle(e.target.value)}
                      className="w-full min-h-[44px] rounded-xl px-3.5 py-2 text-sm outline-none border-2 focus:border-turquoise"
                      style={{
                        background: "var(--muted)",
                        color: "var(--foreground)",
                        borderColor: "var(--border)",
                      }}
                    >
                      <option>Polished &amp; comfortable</option>
                      <option>Sharp business-casual</option>
                      <option>Minimalist &amp; earth tones</option>
                      <option>Bold creative &amp; colorful</option>
                      <option>Sporty &amp; casual</option>
                    </select>
                  </div>

                  {/* Accessibility Onboarding Preferences */}
                  <div className="space-y-1.5 pt-1 border-t border-border">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-turquoise">
                      Accessibility &amp; Decision Preferences
                    </p>
                    <label className="flex items-center gap-2.5 cursor-pointer text-xs text-muted-foreground min-h-[36px]">
                      <input
                        type="checkbox"
                        checked={highContrast}
                        onChange={(e) => setHighContrast(e.target.checked)}
                        className="w-4 h-4 rounded accent-turquoise"
                      />
                      <span>
                        High-contrast color labels (for visual impairments)
                      </span>
                    </label>
                    <label className="flex items-center gap-2.5 cursor-pointer text-xs text-muted-foreground min-h-[36px]">
                      <input
                        type="checkbox"
                        checked={lowDecision}
                        onChange={(e) => setLowDecision(e.target.checked)}
                        className="w-4 h-4 rounded accent-turquoise"
                      />
                      <span>
                        Low Decision Mode (single best pick to reduce fatigue)
                      </span>
                    </label>
                    <label className="flex items-center gap-2.5 cursor-pointer text-xs text-muted-foreground min-h-[36px]">
                      <input
                        type="checkbox"
                        checked={sensoryMode}
                        onChange={(e) => setSensoryMode(e.target.checked)}
                        className="w-4 h-4 rounded accent-turquoise"
                      />
                      <span>
                        Sensory sensitive (tagless, seamless, soft fabrics)
                      </span>
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full min-h-[48px] py-3 rounded-xl text-sm font-black flex items-center justify-center gap-2 border-2 border-[#0D0F18]/20 transition-all hover:brightness-110 active:scale-[0.99] shadow-lg bg-turquoise text-[#0D0F18] cursor-pointer"
                  >
                    {isLoading ? (
                      <>
                        <span className="w-4 h-4 rounded-full border-2 border-[#0D0F18] border-t-transparent animate-spin" />
                        <span>Creating Profile…</span>
                      </>
                    ) : (
                      <span>Create Account →</span>
                    )}
                  </button>
                </form>
              )}

              {/* Style Quiz & Guest Access */}
              <div className="pt-1 flex flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setQuizPath("short")
                    setQuizOpen(true)
                  }}
                  className="w-full min-h-[44px] py-2.5 rounded-xl text-xs font-bold border-2 border-turquoise/40 text-turquoise hover:bg-turquoise/10 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span aria-hidden="true">✨</span> Style Quiz
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setQuizPath("guest")
                    setQuizOpen(true)
                  }}
                  className="min-h-[36px] text-xs font-semibold py-1 text-muted-foreground hover:text-foreground hover:underline transition-colors cursor-pointer"
                >
                  Continue as Guest
                </button>
              </div>
              </div>
            </div>
          </main>
        </div>

        <footer className="text-[10px] text-center text-muted-foreground pt-4">
          Project tAIlor · The Spice Girls · Southeastern Louisiana University CMPS 4200 HCI
        </footer>
      </div>

      {/* Forgot Password Modal */}
      {forgotModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => {
            setForgotModalOpen(false)
            setResetSent(false)
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="forgot-modal-title"
            className="rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl border-2"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 id="forgot-modal-title" className="text-base font-bold text-foreground">
                Reset Password
              </h2>
              <button
                type="button"
                aria-label="Close Reset Password dialog"
                onClick={() => {
                  setForgotModalOpen(false)
                  setResetSent(false)
                }}
                className="text-xs p-1.5 rounded-lg text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <span aria-hidden="true">✕</span>
              </button>
            </div>

            {!resetSent ? (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Enter your email address to receive an instant recovery login link.
                </p>
                <label htmlFor="forgot-reset-email" className="sr-only">
                  Recovery Email Address
                </label>
                <input
                  id="forgot-reset-email"
                  type="email"
                  value={resetEmail || email}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder="your.email@example.com"
                  className="w-full min-h-[44px] rounded-xl px-3.5 py-2 text-sm outline-none border-2"
                  style={{
                    background: "var(--muted)",
                    color: "var(--foreground)",
                    borderColor: "var(--border)",
                  }}
                />
                <button
                  type="button"
                  onClick={() => setResetSent(true)}
                  className="w-full min-h-[44px] py-2.5 rounded-xl text-xs font-bold text-white bg-pink hover:brightness-110 transition-all shadow-md cursor-pointer"
                >
                  Send Link
                </button>
              </div>
            ) : (
              <div role="status" aria-live="polite" className="space-y-3 text-center py-2">
                <span aria-hidden="true" className="text-3xl">✉️</span>
                <p className="text-xs font-semibold text-green">
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
                  className="w-full min-h-[44px] py-2 rounded-xl text-xs font-semibold cursor-pointer"
                  style={{
                    background: "var(--muted)",
                    color: "var(--foreground)",
                  }}
                >
                  Back
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Onboarding Quiz Modal */}
      {quizOpen && (
        <OnboardingQuiz
          initialPath={quizPath}
          onCancel={() => setQuizOpen(false)}
          onComplete={(result) => {
            setQuizOpen(false)
            const baseUser = { ...PRESET_PERSONAS.eliora }
            if (result) {
              baseUser.quizProfile = result
              baseUser.accessibility.highContrastColors =
                result.derived.ui.high_contrast_ui || result.derived.ui.color_names
              baseUser.accessibility.sensorySensitive = result.derived.filters.soft_fabric
              baseUser.preferredStyle = result.derived.stylist.context
                ? `${result.derived.stylist.context} · ${result.derived.color?.palette || "Custom"}`
                : baseUser.preferredStyle
            }
            login(baseUser)
          }}
        />
      )}
    </div>
  )
}
