import React, { useState, useRef } from "react"
import type { QuizResult, DerivedProfile, ColorStats } from "../types"

interface OnboardingQuizProps {
  onComplete: (result?: QuizResult) => void
  onCancel?: () => void
  initialPath?: "privacy" | "short" | "long" | "guest"
}

/* Research Sources */
const SRC: Record<string, string> = {
  color: "Attribute analysis and modeling of color harmony (CIELAB variables, Random Forest)",
  disent: "Disentangling Features for Fashion Recommendation (ACM TOMM)",
  explain: "A Review of Explainable Fashion Compatibility Modeling Methods (ACM Computing Surveys, 2024)",
  retr: "Performance-Efficiency Trade-off for Fashion Image Retrieval (arXiv)",
  fash: "Fashionpedia ontology and API",
  encl: "Evaluating the Evidence for Enclothed Cognition (z-curve and meta-analyses)",
  type: "Typeform: How to build a style quiz",
  forced: "Typeform: Forced-choice questions",
}

const PALETTES: Record<string, { label: string; sw: [string, string][] | null }> = {
  quiet: { label: "Quiet neutrals", sw: [["Cream", "#F1E7D3"], ["Camel", "#C19A6B"], ["Stone", "#A8A29A"], ["Charcoal", "#3A3A3C"]] },
  bright: { label: "Bold brights", sw: [["Magenta", "#C4005F"], ["Cobalt", "#1E50C8"], ["Sunflower", "#F2C230"], ["Teal", "#00897B"]] },
  deep: { label: "Deep and muted", sw: [["Navy", "#1F2A44"], ["Forest", "#2F4F3E"], ["Plum", "#4A2C4F"], ["Mocha", "#5B4636"]] },
  contrast: { label: "High-contrast pairs", sw: [["Black", "#111111"], ["White", "#F7F7F7"], ["Navy", "#1F2A44"], ["Ivory", "#F5F1E6"]] },
  mixed: { label: "A bit of everything", sw: null },
}

const QS: Record<string, any> = {
  p_access: {
    section: "Setup", kind: "multi",
    title: "Is anything about how you see or wear clothes useful for us to know?",
    desc: "Optional. These answers change how tAIlor names colors and which clothes it suggests.",
    options: [
      { v: "colorvision", label: "Some colors look alike to me (e.g., red and green)", note: "We’ll name colors in words and add labels." },
      { v: "darkshades", label: "Dark shades like navy, black, and brown are hard to tell apart", note: "We’ll state color names and contrast in plain words." },
      { v: "visualui", label: "I need high-contrast screens or audio descriptions" },
      { v: "sensory", label: "Fabric feel matters (no scratchy tags or textures)" },
      { v: "motor", label: "Easy closures matter (zips, magnets, large buttons)" },
      { v: "none", label: "None of these", exclusive: true },
      { v: "skip", label: "Prefer not to say", exclusive: true },
    ],
    research: { src: ["type", "explain"], feeds: "UI flags (color names and labels, high-contrast mode) and sensory fabric filters." },
  },
  p_data: {
    section: "Setup", kind: "multi",
    title: "What are you comfortable sharing?",
    desc: "Choose only what you want. Each choice says what it is used for and where it goes.",
    options: [
      { v: "history", label: "Remember what I’ve worn", note: "Used to avoid repeats and calibrate suggestions." },
      { v: "itemphotos", label: "Read my clothing photos with AI", note: "Photo is analyzed by AI for color and type." },
      { v: "camera", label: "Use my camera for try-on previews", note: "Processed by cat-VTON for fitting previews; not saved." },
      { v: "measurements", label: "Save my sizes", note: "Used to filter wardrobe items by fit." },
      { v: "none", label: "None of these for now", exclusive: true },
    ],
    research: { src: ["type", "retr"], feeds: "Consent flags that gate outfit history, item photo analysis, and virtual try-on." },
  },
  q_week: {
    section: "Style", kind: "single",
    title: "Which week sounds most like yours?",
    desc: "Easier to answer than 'describe your style.' Decides which questions come next.",
    options: [
      { v: "work", label: "Mostly work or classes" },
      { v: "events", label: "Lots of plans and events" },
      { v: "home", label: "Mostly home and errands" },
      { v: "mix", label: "It changes week to week" },
      { v: "other", label: "Something else", other: true },
    ],
    research: { src: ["type"], feeds: "Context tags for LLM styling prompts and branch logic for dress-code questions." },
  },
  q_dresscode: {
    section: "Style", kind: "single",
    when: (a: any) => a.q_week === "work" || a.q_week === "events",
    title: "When an invite says “business casual,” what helps most?",
    desc: "Dress codes are vague for many people. This sets how much the stylist explains.",
    options: [
      { v: "pieces", label: "Name the exact pieces from my closet" },
      { v: "explain", label: "Explain what the dress code means" },
      { v: "guess", label: "I’m comfortable guessing" },
      { v: "unsure", label: "Not sure" },
    ],
    research: { src: ["type", "forced"], feeds: "Dress-code assistance level in event suggestions." },
  },
  q_palette: {
    section: "Style", kind: "single",
    title: "Which palette feels most like you?",
    desc: "Every color is named, so you never have to rely on the swatch alone.",
    options: Object.keys(PALETTES).map((k) => ({
      v: k,
      label: PALETTES[k].label,
      sw: PALETTES[k].sw,
      note: PALETTES[k].sw ? "" : "No strong preference. Ranks on color harmony alone.",
    })),
    research: { src: ["color", "type"], feeds: "Target values for CIELAB features (lightness, chroma, warm/cool)." },
  },
  q_contrast: {
    section: "Style", kind: "single", long: true,
    when: (a: any) => ["bright", "quiet", "deep"].includes(a.q_palette),
    build: (a: any) =>
      a.q_palette === "bright"
        ? {
            title: "How many bold pieces feel right in one outfit?",
            desc: "Sets how much color and light-to-dark contrast we allow between pieces.",
            options: [
              { v: "one", label: "One statement piece, the rest calm" },
              { v: "few", label: "Two or three that work together" },
              { v: "all", label: "Head to toe bold" },
            ],
          }
        : {
            title: "How do you add interest without bright color?",
            desc: "Sets how much tone contrast we expect between pieces.",
            options: [
              { v: "texture", label: "Texture, like knit or linen" },
              { v: "layers", label: "Layers and shape" },
              { v: "accents", label: "Small accessories" },
              { v: "plain", label: "I keep it plain" },
            ],
          },
    research: { src: ["color", "type"], feeds: "Tone-contrast tolerance weight for ranking outfits." },
  },
  q_fit: {
    section: "Style", kind: "single",
    title: "How should clothes feel on your body?",
    desc: "Comfort comes first. Your answer becomes a fit and feel tag.",
    options: [
      { v: "loose", label: "Loose, airy, and barely there" },
      { v: "compression", label: "Gentle compression, like a soft hug" },
      { v: "oversized", label: "Oversized and protective" },
      { v: "other", label: "Something else", other: true },
    ],
    research: { src: ["explain"], feeds: "Fit/feel tag for filtering closet items." },
  },
  q_attrs: {
    section: "Style", kind: "multi", max: 2, long: true,
    title: "Which details show up in clothes you love?",
    desc: "Pick up to two. Matched against fashion attributes behind the scenes.",
    options: [
      { v: "asymmetrical", label: "Asymmetrical cuts and unusual shapes", short: "asymmetrical cuts" },
      { v: "pleated", label: "Pleats, ruching, or gathers", short: "pleated details" },
      { v: "structured", label: "Sturdy, structured fabric, like heavy denim", short: "structured fabric" },
      { v: "seamless", label: "Minimal, seamless, and hardware-free", short: "seamless, minimal details" },
      { v: "notsure", label: "Not sure what these mean", exclusive: true },
    ],
    research: { src: ["fash", "disent"], feeds: "Attribute terms passed to CLIP prompts to avoid category clashes." },
  },
  q_mood: {
    section: "Style", kind: "single",
    title: "On a day that matters, what should your outfit do for you?",
    desc: "Helps tailor outfit personality and focus.",
    options: [
      { v: "confident", label: "Make me feel sharp and confident" },
      { v: "comfortable", label: "Keep me comfortable so I can focus" },
      { v: "creative", label: "Let me show something creative" },
      { v: "blend", label: "Help me blend in without thinking about it" },
    ],
    research: { src: ["encl"], feeds: "Enclothed cognition mood tag for academic or professional contexts." },
  },
  q_tags: {
    section: "Style", kind: "multi", long: true,
    title: "Which details should we record for each item?",
    desc: "Choose what extra information your wardrobe records.",
    options: [
      { v: "size", label: "Size and fit", short: "size" },
      { v: "material", label: "Fabric and feel", short: "fabric" },
      { v: "price", label: "Price paid", short: "price" },
      { v: "care", label: "Care instructions", short: "care instructions" },
      { v: "other", label: "Something else", other: true },
      { v: "none", label: "Just the photo and color", exclusive: true },
    ],
    research: { src: ["explain"], feeds: "Active metadata fields in the digital wardrobe database." },
  },
  q_explain: {
    section: "Style", kind: "single",
    title: "When the stylist suggests an outfit, how much should it say?",
    desc: "You can change this anytime.",
    options: [
      { v: "none", label: "Just the outfit" },
      { v: "short", label: "One short reason" },
      { v: "full", label: "An item-by-item breakdown" },
      { v: "tap", label: "Nothing until I tap “Why this outfit?”" },
    ],
    research: { src: ["explain"], feeds: "Default depth of outfit explanation in Today and Stylist tabs." },
  },
  q_conf: {
    section: "Style", kind: "single", long: true,
    title: "How should the stylist show how sure it is?",
    desc: "Based on rater agreement in compatibility models.",
    options: [
      { v: "percent", label: "A match score, like 88%" },
      { v: "words", label: "Plain words: strong match, decent match, or risky" },
      { v: "unsure", label: "Only when it’s unsure" },
      { v: "hide", label: "Don’t show it" },
    ],
    research: { src: ["color", "explain"], feeds: "Confidence presentation style." },
  },
}

const ORDER = ["q_week", "q_dresscode", "q_palette", "q_contrast", "q_fit", "q_attrs", "q_mood", "q_tags", "q_explain", "q_conf"]

const PATHS = [
  { id: "privacy", time: "About 1 minute", title: "Privacy & setup only", desc: "Two quick questions about accessibility and data permissions." },
  { id: "short", time: "About 3 minutes", title: "Short style quiz", desc: "Two setup questions, then 5 to 6 style preference questions." },
  { id: "long", time: "About 5 minutes", title: "Full setup", desc: "Complete 10 to 12 questions with fabric, tags, and explainability." },
  { id: "guest", time: "Instant access", title: "Continue as guest", desc: "Explore tAIlor without saving data to a profile.", quiet: true },
]

/* CIELAB helper functions */
function hexToLab(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16)
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
  const r = lin(((n >> 16) & 255) / 255),
    g = lin(((n >> 8) & 255) / 255),
    b = lin((n & 255) / 255)
  const X = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047
  const Y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b
  const Z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116)
  const fx = f(X), fy = f(Y), fz = f(Z)
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) }
}

function paletteStats(sw: [string, string][]): ColorStats {
  const labs = sw.map((s) => hexToLab(s[1]))
  const avg = (arr: number[]) => arr.reduce((s, x) => s + x, 0) / arr.length
  const Ls = labs.map((l) => l.L)
  const meanB = avg(labs.map((l) => l.b))
  const meanC = avg(labs.map((l) => Math.hypot(l.a, l.b)))
  const range = Math.max(...Ls) - Math.min(...Ls)
  return {
    palette: "",
    swatches: sw.map((s) => s[0]),
    mean_L: Math.round(avg(Ls)),
    L_range: Math.round(range),
    mean_chroma: Math.round(meanC),
    mean_b: Math.round(meanB),
    range_label: range >= 55 ? "wide" : range >= 30 ? "medium" : "narrow",
    temperature: meanC < 12 ? "near-neutral" : meanB > 5 ? "warm-leaning" : meanB < -5 ? "cool-leaning" : "balanced",
  }
}

export default function OnboardingQuiz({ onComplete, onCancel, initialPath }: OnboardingQuizProps) {
  const [screen, setScreen] = useState<"welcome" | "guest" | "q" | "results">(
    initialPath ? (initialPath === "guest" ? "guest" : "q") : "welcome"
  )
  const [path, setPath] = useState<string | null>(initialPath || null)
  const [idx, setIdx] = useState(0)
  const [answers, setAnswers] = useState<Record<string, any>>({})
  const [custom, setCustom] = useState<Record<string, string>>({})
  const [times, setTimes] = useState<Record<string, number>>({})
  const [researchMode, setResearchMode] = useState(false)
  const [guestAgreed, setGuestAgreed] = useState(false)
  const [copiedNotice, setCopiedNotice] = useState("")

  const stepEntered = useRef<number>(Date.now())

  const resolve = (id: string) => {
    const q = QS[id]
    if (!q) return null
    return q.build ? { id, ...q, ...q.build(answers) } : { id, ...q }
  }

  const sequence = () => {
    const out: string[] = []
    if (path === "privacy" || path === "short" || path === "long") {
      out.push("p_access", "p_data")
    }
    if (path === "short" || path === "long") {
      ORDER.forEach((id) => {
        const q = QS[id]
        if (q.long && path !== "long") return
        if (q.when && !q.when(answers)) return
        out.push(id)
      })
    }
    return out
  }

  const seq = sequence()
  const currentQId = seq[idx]
  const currentQ = currentQId ? resolve(currentQId) : null

  const stampTime = (qId: string) => {
    if (!qId) return
    const elapsed = (Date.now() - stepEntered.current) / 1000
    setTimes((prev) => ({ ...prev, [qId]: (prev[qId] || 0) + elapsed }))
  }

  const isCurrentAnswered = () => {
    if (!currentQ) return false
    const val = answers[currentQ.id]
    const txt = (custom[currentQ.id] || "").trim()
    if (currentQ.kind === "single") {
      if (!val) return false
      const opt = currentQ.options.find((x: any) => x.v === val)
      return opt && opt.other ? txt.length > 0 : true
    }
    if (!Array.isArray(val) || !val.length) return false
    const otherOn = currentQ.options.some((o: any) => o.other && val.includes(o.v))
    return otherOn ? txt.length > 0 : true
  }

  const handleNext = () => {
    if (currentQId) stampTime(currentQId)
    if (idx + 1 < seq.length) {
      setIdx(idx + 1)
      stepEntered.current = Date.now()
    } else {
      setScreen("results")
    }
  }

  const handleBack = () => {
    if (currentQId) stampTime(currentQId)
    if (idx === 0) {
      setScreen("welcome")
    } else {
      setIdx(idx - 1)
      stepEntered.current = Date.now()
    }
  }

  const handleOptionToggle = (qId: string, val: string, isSingle: boolean, isExclusive?: boolean) => {
    setAnswers((prev) => {
      if (isSingle) {
        return { ...prev, [qId]: val }
      }
      let currentArr = Array.isArray(prev[qId]) ? [...prev[qId]] : []
      if (isExclusive) {
        return { ...prev, [qId]: [val] }
      }
      currentArr = currentArr.filter((x) => !(currentQ.options.find((o: any) => o.v === x) || {}).exclusive)
      if (currentArr.includes(val)) {
        currentArr = currentArr.filter((x) => x !== val)
      } else {
        if (!currentQ.max || currentArr.length < currentQ.max) {
          currentArr.push(val)
        }
      }
      return { ...prev, [qId]: currentArr }
    })
  }

  const deriveProfile = (): DerivedProfile => {
    const has = (arr: any, v: string) => Array.isArray(arr) && arr.includes(v)
    const d: DerivedProfile = {
      ui: {
        color_names: has(answers.p_access, "colorvision") || has(answers.p_access, "darkshades"),
        high_contrast_ui: has(answers.p_access, "visualui"),
      },
      filters: {
        soft_fabric: has(answers.p_access, "sensory"),
        easy_closures: has(answers.p_access, "motor"),
        fit_feel: answers.q_fit === "other" ? custom.q_fit : answers.q_fit,
      },
      consent: {
        outfit_history: has(answers.p_data, "history"),
        item_photo_ai: has(answers.p_data, "itemphotos"),
        tryon_camera: has(answers.p_data, "camera"),
        sizes: has(answers.p_data, "measurements"),
      },
      stylist: {
        context: answers.q_week,
        dresscode_help: answers.q_dresscode,
        mood_exploratory: answers.q_mood,
        explain_default: answers.q_explain,
        confidence_display: answers.q_conf,
        contrast_pref: answers.q_contrast,
      },
      wardrobe: {
        attribute_terms: has(answers.q_attrs, "notsure") ? [] : answers.q_attrs,
        item_fields: answers.q_tags,
      },
    }
    const pal = PALETTES[answers.q_palette]
    if (pal && pal.sw) {
      d.color = { ...paletteStats(pal.sw), palette: answers.q_palette }
    }
    return d
  }

  const handleFinalSubmit = () => {
    const derived = deriveProfile()
    const result: QuizResult = {
      path: (path as any) || "short",
      answers,
      derived,
      seconds_per_question: Object.fromEntries(
        Object.entries(times).map(([k, v]) => [k, Math.round(v * 10) / 10])
      ),
    }
    onComplete(result)
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 text-white">
      <div className="w-full max-w-2xl bg-[#151626] border border-[#2E3050] rounded-3xl p-5 sm:p-8 shadow-2xl relative flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-[#2E3050]">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold italic tracking-tight" style={{ fontFamily: "Nunito, sans-serif" }}>
              <span className="text-[#C4005F]">t</span>
              <span className="text-[#72D4F0]">AI</span>
              <span className="text-[#C4005F]">lor</span>
            </span>
            <span className="text-[11px] font-semibold text-slate-400 px-2 py-0.5 rounded-full border border-slate-700 bg-slate-900/60">
              Style Discovery
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setResearchMode(!researchMode)}
              className={`text-xs px-2.5 py-1 rounded-xl border transition-colors ${
                researchMode
                  ? "bg-[#10303A] border-[#7BDCF0] text-[#7BDCF0]"
                  : "bg-transparent border-[#2E3050] text-slate-400 hover:text-white"
              }`}
            >
              Research View: {researchMode ? "On" : "Off"}
            </button>
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="text-slate-400 hover:text-white text-sm p-1 ml-1"
                aria-label="Close"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Screen 1: Welcome */}
        {screen === "welcome" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-white">Set up tAIlor your way</h2>
              <p className="text-sm text-slate-400 mt-1">
                Answer only what helps. Each answer adapts your stylist, color naming, or accessibility settings.
              </p>
            </div>

            <div className="space-y-2.5">
              {PATHS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setPath(p.id)
                    setIdx(0)
                    stepEntered.current = Date.now()
                    setScreen(p.id === "guest" ? "guest" : "q")
                  }}
                  className="w-full text-left p-4 rounded-2xl border border-[#2E3050] bg-[#1D1F33]/60 hover:bg-[#1D1F33] hover:border-slate-500 transition-all group flex flex-col sm:flex-row sm:items-center justify-between gap-1"
                >
                  <div>
                    <span className="text-base font-bold text-white group-hover:text-[#72D4F0] transition-colors block">
                      {p.title}
                    </span>
                    <span className="text-xs text-slate-400 block mt-0.5">{p.desc}</span>
                  </div>
                  <span className="text-[11px] font-semibold text-slate-500 shrink-0 mt-1 sm:mt-0">
                    {p.time}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Screen 2: Guest Disclaimer */}
        {screen === "guest" && (
          <div className="space-y-5">
            <h2 className="text-2xl font-bold text-white">Continue as a guest</h2>
            <ul className="text-xs text-slate-300 space-y-2 pl-4 list-disc">
              <li>Nothing is saved after you close tAIlor: no wardrobe changes, outfit history, or custom tags.</li>
              <li>Photos are processed in-memory for outfit recommendations and are not permanently saved.</li>
            </ul>

            <div className="p-3.5 rounded-2xl bg-[#1D1F33] border border-[#2E3050] text-xs text-slate-300">
              <strong className="text-white">Research note:</strong> tAIlor is an HCI prototype. Outfit suggestions and virtual try-ons are AI-generated and meant as a styling companion.
            </div>

            <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer pt-2">
              <input
                type="checkbox"
                checked={guestAgreed}
                onChange={(e) => setGuestAgreed(e.target.checked)}
                className="w-4 h-4 rounded accent-[#C4005F]"
              />
              <span>I understand and agree to continue as a guest.</span>
            </label>

            <div className="flex items-center justify-between pt-4 border-t border-[#2E3050]">
              <button
                type="button"
                onClick={() => setScreen("welcome")}
                className="px-4 py-2 rounded-xl border border-[#2E3050] text-xs font-semibold text-slate-300 hover:bg-[#1D1F33]"
              >
                Back
              </button>
              <button
                type="button"
                disabled={!guestAgreed}
                onClick={handleFinalSubmit}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-[#C4005F] text-white disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 shadow-lg"
              >
                Enter as Guest →
              </button>
            </div>
          </div>
        )}

        {/* Screen 3: Question Flow */}
        {screen === "q" && currentQ && (
          <div className="space-y-5">
            {/* Tape measure progress indicator */}
            <div>
              <div className="flex justify-between text-xs text-slate-400 mb-1.5 font-medium">
                <span>{currentQ.section}</span>
                <span>Step {idx + 1} of {seq.length}</span>
              </div>
              <div className="relative h-4 rounded-lg bg-[#1D1F33] border border-[#2E3050] overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#C4005F] to-[#72D4F0] transition-all duration-300"
                  style={{ width: `${((idx + 1) / seq.length) * 100}%` }}
                />
                <div
                  className="absolute inset-0 pointer-events-none opacity-40"
                  style={{
                    backgroundImage: "linear-gradient(to right, rgba(255,255,255,0.4) 1px, transparent 1px)",
                    backgroundSize: "8px 100%",
                  }}
                />
              </div>
            </div>

            {/* Title & Desc */}
            <div>
              <h3 className="text-xl font-bold text-white">{currentQ.title}</h3>
              <p className="text-xs text-slate-400 mt-1">{currentQ.desc}</p>
            </div>

            {/* Research View Sidebar (if toggled) */}
            {researchMode && currentQ.research && (
              <div className="p-3 rounded-2xl bg-[#10303A] border-l-4 border-[#7BDCF0] text-xs text-[#7BDCF0] space-y-1">
                <p>
                  <strong>Research Source:</strong>{" "}
                  {currentQ.research.src.map((s: string) => SRC[s]).join("; ")}
                </p>
                <p>
                  <strong>Backend Feed:</strong> {currentQ.research.feeds}
                </p>
              </div>
            )}

            {/* Options List */}
            <div className="space-y-2 pt-1 max-h-[46vh] overflow-y-auto pr-1">
              {currentQ.options.map((opt: any) => {
                const isSelected =
                  currentQ.kind === "single"
                    ? answers[currentQ.id] === opt.v
                    : Array.isArray(answers[currentQ.id]) && answers[currentQ.id].includes(opt.v)

                return (
                  <label
                    key={opt.v}
                    onClick={() => handleOptionToggle(currentQ.id, opt.v, currentQ.kind === "single", opt.exclusive)}
                    className={`block p-3.5 rounded-2xl border transition-all cursor-pointer ${
                      isSelected
                        ? "bg-[#C4005F]/15 border-[#C4005F] shadow-sm"
                        : "bg-[#1D1F33]/40 border-[#2E3050] hover:border-slate-500"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-5 h-5 rounded-${currentQ.kind === "single" ? "full" : "md"} border flex items-center justify-center shrink-0 mt-0.5 ${
                          isSelected
                            ? "bg-[#C4005F] border-[#C4005F] text-white"
                            : "border-slate-600 bg-transparent"
                        }`}
                      >
                        {isSelected && <span className="text-xs font-black">✓</span>}
                      </div>

                      <div className="min-w-0 flex-1">
                        <span className="text-xs font-bold text-white block">{opt.label}</span>
                        {opt.note && <span className="text-[11px] text-slate-400 mt-0.5 block">{opt.note}</span>}

                        {/* Swatch chips for color palette */}
                        {opt.sw && (
                          <div className="flex flex-wrap gap-2.5 mt-2">
                            {opt.sw.map(([cname, hex]: [string, string]) => (
                              <div key={cname} className="flex items-center gap-1.5 text-[11px] text-slate-300">
                                <span
                                  className="w-3.5 h-3.5 rounded-full border border-white/20 inline-block shadow-sm"
                                  style={{ backgroundColor: hex }}
                                />
                                <span>{cname}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </label>
                )
              })}

              {/* Custom 'Other' text input */}
              {currentQ.options.some((o: any) => o.other) && (
                <div className="pt-1">
                  <input
                    type="text"
                    placeholder="Please specify..."
                    value={custom[currentQ.id] || ""}
                    onChange={(e) => setCustom({ ...custom, [currentQ.id]: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#1D1F33] border border-[#2E3050] text-xs text-white placeholder-slate-500 outline-none focus:border-[#72D4F0]"
                  />
                </div>
              )}
            </div>

            {/* Navigation Buttons */}
            <div className="flex items-center justify-between pt-4 border-t border-[#2E3050]">
              <button
                type="button"
                onClick={handleBack}
                className="px-4 py-2 rounded-xl border border-[#2E3050] text-xs font-semibold text-slate-300 hover:bg-[#1D1F33]"
              >
                Back
              </button>
              <button
                type="button"
                disabled={!isCurrentAnswered()}
                onClick={handleNext}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-[#C4005F] text-white disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 shadow-lg"
              >
                {idx + 1 === seq.length ? "Finish & Review" : "Next →"}
              </button>
            </div>
          </div>
        )}

        {/* Screen 4: Results */}
        {screen === "results" && (
          <div className="space-y-5">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#72D4F0]">
                Your Configured Profile
              </span>
              <h2 className="text-3xl font-extrabold tracking-tight text-white mt-1">
                {answers.q_palette && answers.q_mood
                  ? `${answers.q_palette.charAt(0).toUpperCase() + answers.q_palette.slice(1)} Discovery`
                  : "Setup Complete"}
              </h2>
            </div>

            <div className="p-4 rounded-2xl bg-[#1D1F33]/70 border border-[#2E3050] space-y-3 text-xs">
              <h4 className="font-bold text-white text-sm">Stylist Adaptations</h4>
              <ul className="space-y-1.5 list-disc pl-4 text-slate-300">
                {answers.q_palette && (
                  <li>
                    Color recommendations prioritize <strong>{PALETTES[answers.q_palette]?.label}</strong> with CIELAB harmony constraints.
                  </li>
                )}
                {answers.p_access?.includes("colorvision") && (
                  <li>Color vision assist active: all swatches show explicit text labels and contrast names.</li>
                )}
                {answers.p_access?.includes("sensory") && (
                  <li>Sensory filter active: prefers tagless cottons and soft modal fabrics.</li>
                )}
                {answers.q_explain && (
                  <li>Explanation depth set to: <strong>{answers.q_explain}</strong>.</li>
                )}
              </ul>
            </div>

            {/* Research View: Profile JSON */}
            {researchMode && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-400">Exportable Profile JSON</span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(JSON.stringify(deriveProfile(), null, 2))
                      setCopiedNotice("Copied to clipboard!")
                      setTimeout(() => setCopiedNotice(""), 2000)
                    }}
                    className="text-[11px] text-[#72D4F0] hover:underline"
                  >
                    {copiedNotice || "Copy JSON"}
                  </button>
                </div>
                <pre className="p-3 rounded-xl bg-black/60 border border-slate-800 text-[10px] text-slate-300 max-h-36 overflow-auto">
                  {JSON.stringify(deriveProfile(), null, 2)}
                </pre>
              </div>
            )}

            <div className="flex items-center justify-between pt-4 border-t border-[#2E3050]">
              <button
                type="button"
                onClick={() => {
                  setScreen("welcome")
                  setAnswers({})
                  setIdx(0)
                }}
                className="px-4 py-2 rounded-xl border border-[#2E3050] text-xs font-semibold text-slate-300 hover:bg-[#1D1F33]"
              >
                Start Over
              </button>
              <button
                type="button"
                onClick={handleFinalSubmit}
                className="px-6 py-2.5 rounded-xl text-xs font-bold bg-[#C4005F] text-white hover:brightness-110 shadow-lg"
              >
                Apply & Enter tAIlor →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}