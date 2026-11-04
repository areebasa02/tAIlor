import { useState, useEffect } from "react"
import { THEME_COLORS, STATUS_COLORS } from "../types/theme"
import {
  type VoiceState,
  type ControlMode,
  type UploadState,
  AnimatedStepProgress,
  PulseOrb,
} from "../components/AIComponents"

function Chip({
  label,
  color = "var(--muted-foreground)",
  bg = "var(--muted)",
}: {
  label: string
  color?: string
  bg?: string
}) {
  return (
    <span
      className="inline-block text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
      style={{ background: bg, color }}
    >
      {label}
    </span>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="text-lg font-semibold mt-8 mb-1"
      style={{ fontFamily: "Nunito, sans-serif", color: "var(--foreground)" }}
    >
      {children}
    </h2>
  )
}

function SubTitle({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-[11px] mb-4"
      style={{ color: "var(--muted-foreground)" }}
    >
      {children}
    </p>
  )
}

function ComponentFrame({
  flow,
  state,
  stateColor,
  children,
}: {
  flow: string
  state: string
  stateColor: string
  children: React.ReactNode
}) {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ border: "1px solid var(--border)" }}
    >
      <div
        className="flex items-center justify-between px-3 py-1.5"
        style={{
          background: "var(--muted)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <span
          className="text-[9px] font-semibold uppercase tracking-widest"
          style={{ color: "var(--muted-foreground)" }}
        >
          {flow}
        </span>
        <Chip label={state} color={stateColor} bg={stateColor + "18"} />
      </div>
      <div className="p-4" style={{ background: "var(--card)" }}>
        {children}
      </div>
    </div>
  )
}

const S = {
  empty: STATUS_COLORS.muted,
  loading: STATUS_COLORS.loading,
  success: STATUS_COLORS.success,
  uncertain: STATUS_COLORS.uncertain,
  error: STATUS_COLORS.error,
}

// ─── 1. AI Text Input ─────────────────────────────────────────────────────────

function TextInputEmpty() {
  return (
    <div className="space-y-2">
      <label className="text-[10px] uppercase tracking-widest text-muted-foreground">
        Describe the event
      </label>
      <div
        className="w-full rounded-xl px-3 py-2.5 text-sm flex items-center bg-muted border border-border text-muted-foreground"
        style={{ minHeight: 44 }}
      >
        e.g. Networking dinner, 7pm Thursday…
      </div>
      <p className="text-[10px] text-muted-foreground">
        The more context you give, the better the suggestion.
      </p>
    </div>
  )
}

function TextInputLoading() {
  return (
    <div className="space-y-2">
      <label className="text-[10px] uppercase tracking-widest text-muted-foreground">
        Describe the event
      </label>
      <div
        className="w-full rounded-xl px-3 py-2.5 text-sm bg-muted border border-turquoise/60"
        style={{ minHeight: 44 }}
      >
        <span className="text-foreground">
          Networking dinner at a rooftop venue…
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-1.5 h-1.5 rounded-full animate-bounce bg-turquoise"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
        <span className="text-[10px] text-turquoise">
          Reading your input…
        </span>
      </div>
    </div>
  )
}

function TextInputSuccess() {
  return (
    <div className="space-y-2">
      <label className="text-[10px] uppercase tracking-widest text-muted-foreground">
        Describe the event
      </label>
      <div
        className="w-full rounded-xl px-3 py-2.5 text-sm bg-muted border border-green/60 text-foreground"
        style={{ minHeight: 44 }}
      >
        Networking dinner at a rooftop venue, 7pm Thursday, business-casual
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-green text-xs">✓</span>
        <span className="text-[10px] text-green">
          Context accepted — generating outfits
        </span>
      </div>
    </div>
  )
}

function TextInputUncertain() {
  return (
    <div className="space-y-2">
      <label className="text-[10px] uppercase tracking-widest text-muted-foreground">
        Describe the event
      </label>
      <div
        className="w-full rounded-xl px-3 py-2.5 text-sm bg-muted border border-gold/60 text-foreground"
        style={{ minHeight: 44 }}
      >
        Dinner
      </div>
      <div className="rounded-xl px-3 py-2 text-[10px] leading-snug bg-gold/10 border border-gold/30 text-gold">
        ⚠ Not enough context — is this casual, formal, or smart-casual? What
        time and venue?
      </div>
    </div>
  )
}

function TextInputError() {
  return (
    <div className="space-y-2">
      <label className="text-[10px] uppercase tracking-widest text-muted-foreground">
        Describe the event
      </label>
      <div
        className="w-full rounded-xl px-3 py-2.5 text-sm bg-muted border border-red/60 text-foreground"
        style={{ minHeight: 44 }}
      >
        asdkjhasd
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-red text-xs">✕</span>
        <span className="text-[10px] text-red">
          Input not understood. Try describing the occasion in plain words.
        </span>
      </div>
    </div>
  )
}

// ─── 2. Voice Input ───────────────────────────────────────────────────────────

function VoiceButton({ state }: { state: VoiceState }) {
  const configs = {
    idle: {
      icon: "🎙",
      label: "Tap to speak",
      ring: "var(--border)",
      bg: "var(--muted)",
      pulse: false,
    },
    listening: {
      icon: "🎙",
      label: "Listening…",
      ring: S.loading,
      bg: `${S.loading}18`,
      pulse: true,
    },
    processing: {
      icon: "⧖",
      label: "Transcribing…",
      ring: S.loading,
      bg: `${S.loading}12`,
      pulse: false,
    },
    captured: {
      icon: "✓",
      label: '"Dinner at 7pm, business-casual"',
      ring: S.success,
      bg: `${S.success}12`,
      pulse: false,
    },
    error: {
      icon: "✕",
      label: "Couldn't hear you — tap to retry",
      ring: S.error,
      bg: `${S.error}12`,
      pulse: false,
    },
  }
  const c = configs[state]
  const iconColor = {
    idle: "var(--muted-foreground)",
    listening: S.loading,
    processing: S.loading,
    captured: S.success,
    error: S.error,
  }[state]

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative">
        {c.pulse && (
          <div
            className="absolute inset-0 rounded-full animate-ping opacity-30"
            style={{ background: S.loading }}
          />
        )}
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center text-xl relative"
          style={{
            background: c.bg,
            border: `2px solid ${c.ring}`,
            boxShadow: `0 0 0 4px ${c.ring}22`,
          }}
        >
          <span style={{ color: iconColor }}>{c.icon}</span>
        </div>
      </div>
      <p
        className="text-xs text-center"
        style={{ color: iconColor, maxWidth: 160 }}
      >
        {c.label}
      </p>
      {state === "captured" && (
        <div className="flex gap-2">
          <button
            className="text-[10px] px-2.5 py-1 rounded-full font-bold"
            style={{ background: S.success + "22", color: S.success }}
          >
            Use this
          </button>
          <button
            className="text-[10px] px-2.5 py-1 rounded-full font-medium bg-muted text-muted-foreground"
          >
            Re-record
          </button>
        </div>
      )}
    </div>
  )
}

// ─── 3. Image Upload ──────────────────────────────────────────────────────────

function ImageUpload({ state }: { state: UploadState }) {
  if (state === "empty")
    return (
      <div
        className="rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-2 py-8 hover:border-turquoise transition-colors text-muted-foreground"
      >
        <span className="text-3xl">📷</span>
        <p className="text-xs font-medium">Take a photo or upload</p>
        <p className="text-[10px]">JPEG, PNG · max 10 MB</p>
      </div>
    )

  if (state === "uploading")
    return (
      <div className="space-y-2">
        <div className="h-28 rounded-xl flex items-center justify-center bg-muted">
          <span className="text-3xl opacity-50">🖼</span>
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>Uploading photo…</span>
            <span>62%</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden bg-muted">
            <div
              className="h-full rounded-full bg-turquoise"
              style={{ width: "62%" }}
            />
          </div>
        </div>
      </div>
    )

  if (state === "analyzing")
    return (
      <div className="space-y-2">
        <div
          className="h-28 rounded-xl flex items-center justify-center relative overflow-hidden"
          style={{ background: "#1A2A3A" }}
        >
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-3xl opacity-30">👕</div>
          </div>
          <div
            className="absolute inset-0 animate-pulse"
            style={{
              background: `linear-gradient(135deg, ${S.loading}22 0%, transparent 60%)`,
            }}
          />
          <div
            className="px-3 py-1.5 rounded-xl text-[10px] font-semibold relative text-turquoise"
            style={{ background: "rgba(0,0,0,0.5)" }}
          >
            Identifying color & category…
          </div>
        </div>
        <div className="space-y-1">
          {["Reading image", "Classifying hue", "Detecting garment type"].map(
            (s, i) => (
              <div key={s} className="flex items-center gap-1.5">
                <div
                  className="w-1 h-1 rounded-full animate-pulse bg-turquoise"
                  style={{ animationDelay: `${i * 250}ms` }}
                />
                <span className="text-[10px] text-muted-foreground">
                  {s}
                </span>
              </div>
            ),
          )}
        </div>
      </div>
    )

  if (state === "success")
    return (
      <div className="space-y-2">
        <div
          className="h-28 rounded-xl relative overflow-hidden"
          style={{ background: THEME_COLORS.darkTeal }}
        >
          <div
            className="absolute bottom-2 left-2 right-2 rounded-lg px-2 py-1.5"
            style={{ background: "rgba(0,0,0,0.6)" }}
          >
            <div className="flex items-center gap-2">
              <div
                className="w-4 h-4 rounded-md border border-white/30"
                style={{ background: THEME_COLORS.darkTeal }}
              />
              <div>
                <p className="text-[10px] font-semibold text-white">
                  Deep Teal · Outerwear
                </p>
                <p className="text-[9px] text-white/60">
                  {THEME_COLORS.darkTeal} · Cool-neutral
                </p>
              </div>
              <span className="ml-auto text-[10px] text-green font-bold">
                ✓ Identified
              </span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button className="flex-1 py-1.5 rounded-xl text-[10px] font-semibold bg-green text-white">
            Save to wardrobe
          </button>
          <button className="px-3 py-1.5 rounded-xl text-[10px] bg-muted text-muted-foreground">
            Correct color
          </button>
        </div>
      </div>
    )

  return (
    <div className="space-y-2">
      <div className="h-28 rounded-xl flex flex-col items-center justify-center gap-2 bg-red/10 border border-dashed border-red/50">
        <span className="text-2xl">⚠</span>
        <p className="text-xs font-medium text-red">
          Photo unusable
        </p>
        <p className="text-[10px] text-center text-muted-foreground">
          Blurry, too dark, or not a clothing item
        </p>
      </div>
      <div className="flex gap-2">
        <button className="flex-1 py-1.5 rounded-xl text-[10px] font-semibold bg-red text-white">
          📷 Retake photo
        </button>
        <button className="flex-1 py-1.5 rounded-xl text-[10px] bg-muted text-muted-foreground">
          Enter manually
        </button>
      </div>
    </div>
  )
}

// ─── 4. Result Presentation & Controls ────────────────────────────────────────

function ResultCardHigh() {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-foreground" style={{ fontFamily: "Nunito, sans-serif" }}>
          Suggested outfit
        </p>
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 rounded-full overflow-hidden w-16 bg-muted">
            <div className="h-full rounded-full bg-green" style={{ width: "92%" }} />
          </div>
          <span className="text-[10px] font-semibold text-green">
            92% match
          </span>
        </div>
      </div>
      {[
        { type: "Top", desc: "Magenta button-down", color: THEME_COLORS.pink },
        { type: "Bottom", desc: "Black wide-legs", color: "#1A1A2E" },
        { type: "Shoes", desc: "White platforms", color: "#E8E8E8" },
      ].map((item) => (
        <div
          key={item.type}
          className="flex items-center gap-2.5 rounded-xl px-3 py-2 bg-muted"
        >
          <div
            className="w-6 h-6 rounded-lg border border-white/10"
            style={{ background: item.color }}
          />
          <div>
            <p className="text-[9px] uppercase tracking-widest text-muted-foreground">
              {item.type}
            </p>
            <p className="text-xs font-medium text-foreground">
              {item.desc}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}

function ResultCardUncertain() {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-foreground" style={{ fontFamily: "Nunito, sans-serif" }}>
          Best guess
        </p>
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 rounded-full overflow-hidden w-16 bg-muted">
            <div className="h-full rounded-full bg-gold" style={{ width: "43%" }} />
          </div>
          <span className="text-[10px] font-semibold text-gold">
            43% match
          </span>
        </div>
      </div>
      <div className="rounded-xl px-3 py-2 text-[10px] leading-snug bg-gold/10 border border-gold/30 text-gold">
        ⚠ Low confidence — the event context is ambiguous. Review carefully or
        add more detail.
      </div>
      {[
        { type: "Top", desc: "Mint mock-neck", color: THEME_COLORS.lightGreen },
        { type: "Bottom", desc: "Camel trousers", color: "#C8965A" },
        { type: "Shoes", desc: "Tan loafers", color: "#B8825A" },
      ].map((item) => (
        <div
          key={item.type}
          className="flex items-center gap-2.5 rounded-xl px-3 py-2 bg-muted opacity-70"
        >
          <div
            className="w-6 h-6 rounded-lg border border-white/10"
            style={{ background: item.color }}
          />
          <div>
            <p className="text-[9px] uppercase tracking-widest text-muted-foreground">
              {item.type}
            </p>
            <p className="text-xs font-medium text-foreground">
              {item.desc}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}

function AlternativeSuggestions() {
  const alts = [
    {
      label: "Try instead",
      desc: "Navy tee + slim jeans + white sneakers",
      confidence: 81,
      colors: ["#2B4B8C", "#4A6FA5", "#F2F2F2"],
    },
    {
      label: "Bolder option",
      desc: "Magenta blouse + black trousers",
      confidence: 74,
      colors: [THEME_COLORS.pink, "#1A1A2E"],
    },
    {
      label: "Safe fallback",
      desc: "Cream blouse + camel trousers + tan loafers",
      confidence: 68,
      colors: ["#F5EFD8", "#C8965A", "#B8825A"],
    },
  ]
  return (
    <div className="space-y-2">
      <p className="text-[10px] uppercase tracking-widest mb-1 text-muted-foreground">
        Alternative suggestions
      </p>
      {alts.map((a) => (
        <div
          key={a.label}
          className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 bg-muted border border-border"
        >
          <div className="flex gap-0.5">
            {a.colors.map((c, i) => (
              <div
                key={i}
                className="w-4 h-4 rounded-md border border-white/10"
                style={{ background: c }}
              />
            ))}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold text-foreground">
              {a.label}
            </p>
            <p className="text-[9px] truncate text-muted-foreground">
              {a.desc}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p
              className="text-[10px] font-bold"
              style={{
                color:
                  a.confidence >= 80
                    ? S.success
                    : a.confidence >= 65
                      ? S.uncertain
                      : S.error,
              }}
            >
              {a.confidence}%
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyResult() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-8 rounded-xl bg-muted border border-dashed border-border">
      <span className="text-3xl opacity-40">🧺</span>
      <div className="text-center">
        <p className="text-xs font-semibold text-foreground">
          No matching outfits
        </p>
        <p className="text-[10px] mt-0.5 max-w-[180px] text-muted-foreground">
          Try a different occasion or browse your wardrobe directly.
        </p>
      </div>
      <button className="text-[10px] px-3 py-1.5 rounded-full font-semibold bg-pink text-white hover:brightness-110 shadow-sm">
        Browse wardrobe
      </button>
    </div>
  )
}

function ControlBar({ mode }: { mode: ControlMode }) {
  const active = (c: string) => ({ background: c, color: "#fff" })
  const muted = { background: "var(--muted)", color: "var(--foreground)" }

  return (
    <div className="space-y-2">
      {mode === "editing" && (
        <div className="rounded-xl px-3 py-1.5 text-[10px] bg-turquoise/10 text-turquoise">
          ✏ Editing — swap any item. Changes update the preview instantly.
        </div>
      )}
      {mode === "undone" && (
        <div className="rounded-xl px-3 py-1.5 text-[10px] bg-green/10 text-green">
          ↩ Reverted to previous suggestion.
        </div>
      )}
      {mode === "rejected" && (
        <div className="rounded-xl px-3 py-1.5 text-[10px] bg-red/10 text-red">
          ✕ Rejected. Tell us why to improve future suggestions.
        </div>
      )}
      {mode === "regenerating" && (
        <div className="rounded-xl px-3 py-1.5 text-[10px] flex items-center gap-1.5 bg-turquoise/10 text-turquoise">
          <div className="w-1 h-1 rounded-full animate-bounce bg-turquoise" />
          Regenerating outfit…
        </div>
      )}

      <button
        className="w-full py-2.5 rounded-xl text-xs font-semibold"
        style={mode === "default" ? active(THEME_COLORS.pink) : muted}
      >
        {mode === "default"
          ? "✓ Approve & wear"
          : mode === "editing"
            ? "Save edits"
            : mode === "undone"
              ? "✓ Keep this version"
              : "Approve"}
      </button>

      <div className="grid grid-cols-4 gap-1.5">
        <button
          className="py-2 rounded-xl text-[10px] font-semibold flex flex-col items-center gap-0.5"
          style={mode === "editing" ? active(S.loading) : muted}
        >
          <span>✏</span>Edit
        </button>
        <button
          className="py-2 rounded-xl text-[10px] font-semibold flex flex-col items-center gap-0.5"
          style={mode === "rejected" ? active(S.error) : muted}
        >
          <span>✕</span>Reject
        </button>
        <button
          className="py-2 rounded-xl text-[10px] font-semibold flex flex-col items-center gap-0.5"
          style={mode === "regenerating" ? active(S.loading) : muted}
        >
          <span>↺</span>Redo
        </button>
        <button
          className="py-2 rounded-xl text-[10px] font-semibold flex flex-col items-center gap-0.5"
          style={mode === "undone" ? active(S.success) : muted}
        >
          <span>↩</span>Undo
        </button>
      </div>

      <button className="w-full py-2 rounded-xl text-[10px] bg-muted text-muted-foreground">
        Why this outfit?
      </button>
    </div>
  )
}

const DEMO_STEPS = [
  "Reading context",
  "Browsing wardrobe",
  "Checking history",
  "Building outfits",
]

// ─── Main AIComponentsTab Export ─────────────────────────────────────────────

export default function AIComponentsTab() {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle")
  const [ctrlMode, setCtrlMode] = useState<ControlMode>("default")

  const cycleVoice = () => {
    const order: VoiceState[] = [
      "idle",
      "listening",
      "processing",
      "captured",
      "error",
    ]
    setVoiceState((s) => order[(order.indexOf(s) + 1) % order.length])
  }

  return (
    <div className="px-5 pt-2 pb-6">
      <div className="mb-2">
        <h2 className="text-xl font-semibold text-foreground" style={{ fontFamily: "Nunito, sans-serif" }}>
          AI component kit
        </h2>
        <p className="text-[11px] mt-0.5 text-muted-foreground">
          All AI interaction states — annotated by flow and state
        </p>
      </div>

      <div className="flex flex-wrap gap-2 rounded-xl px-3 py-2.5 mb-3 bg-muted border border-border">
        {[
          ["empty", S.empty],
          ["loading", S.loading],
          ["success", S.success],
          ["uncertain", S.uncertain],
          ["error", S.error],
        ].map(([label, color]) => (
          <div key={label} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full" style={{ background: color }} />
            <span className="text-[9px] uppercase tracking-widest text-muted-foreground">
              {label}
            </span>
          </div>
        ))}
      </div>

      <SectionTitle>1 · AI Text Input</SectionTitle>
      <SubTitle>Used in: Outfit Generator, event description field</SubTitle>
      <div className="space-y-3">
        <ComponentFrame flow="Generator · Flow 01" state="empty" stateColor={S.empty}>
          <TextInputEmpty />
        </ComponentFrame>
        <ComponentFrame flow="Generator · Flow 01" state="loading" stateColor={S.loading}>
          <TextInputLoading />
        </ComponentFrame>
        <ComponentFrame flow="Generator · Flow 01" state="success" stateColor={S.success}>
          <TextInputSuccess />
        </ComponentFrame>
        <ComponentFrame flow="Generator · Flow 01" state="uncertain" stateColor={S.uncertain}>
          <TextInputUncertain />
        </ComponentFrame>
        <ComponentFrame flow="Generator · Flow 01" state="error" stateColor={S.error}>
          <TextInputError />
        </ComponentFrame>
      </div>

      <SectionTitle>2 · Voice Input</SectionTitle>
      <SubTitle>Used in: Outfit Generator, accessibility mode — tap to cycle states</SubTitle>
      <ComponentFrame
        flow="Generator · Voice"
        state={voiceState}
        stateColor={
          voiceState === "idle"
            ? S.empty
            : voiceState === "captured"
              ? S.success
              : voiceState === "error"
                ? S.error
                : S.loading
        }
      >
        <div className="flex flex-col items-center">
          <VoiceButton state={voiceState} />
          <button
            onClick={cycleVoice}
            className="mt-4 text-[10px] px-3 py-1.5 rounded-full bg-muted text-muted-foreground hover:text-white transition-colors"
          >
            Cycle state →
          </button>
        </div>
      </ComponentFrame>

      <SectionTitle>3 · Image Upload</SectionTitle>
      <SubTitle>Used in: Color Matcher (Flow 03), Virtual Try-On (Flow 04), adding wardrobe items</SubTitle>
      <div className="space-y-3">
        {(["empty", "uploading", "analyzing", "success", "error"] as const).map((state) => (
          <ComponentFrame
            key={state}
            flow="Color Matcher · Flow 03"
            state={state}
            stateColor={
              state === "empty"
                ? S.empty
                : state === "success"
                  ? S.success
                  : state === "error"
                    ? S.error
                    : S.loading
            }
          >
            <ImageUpload state={state} />
          </ComponentFrame>
        ))}
      </div>

      <SectionTitle>4 · AI Processing Feedback</SectionTitle>
      <SubTitle>Used in: all AI flows during model inference</SubTitle>
      <div className="space-y-3">
        <ComponentFrame flow="All flows · loading" state="loading" stateColor={S.loading}>
          <AnimatedStepProgress steps={DEMO_STEPS} intervalMs={1000} />
        </ComponentFrame>
        <ComponentFrame flow="Try-On · Flow 04 · long processing" state="loading" stateColor={S.loading}>
          <PulseOrb label="Generating your preview — this may take up to 30 seconds" />
        </ComponentFrame>
      </div>

      <SectionTitle>5 · AI Result Presentation</SectionTitle>
      <SubTitle>Used in: Outfit Generator, Outfit Discovery, Color Matcher</SubTitle>
      <div className="space-y-3">
        <ComponentFrame flow="Generator · Flow 01" state="success" stateColor={S.success}>
          <ResultCardHigh />
        </ComponentFrame>
        <ComponentFrame flow="Generator · Flow 01" state="uncertain" stateColor={S.uncertain}>
          <ResultCardUncertain />
        </ComponentFrame>
        <ComponentFrame flow="All flows · alternatives" state="success" stateColor={S.success}>
          <AlternativeSuggestions />
        </ComponentFrame>
        <ComponentFrame flow="Discovery · Flow 02" state="empty" stateColor={S.empty}>
          <EmptyResult />
        </ComponentFrame>
      </div>

      <SectionTitle>6 · User Controls</SectionTitle>
      <SubTitle>Used in: all AI result screens — always available</SubTitle>
      <div className="space-y-3">
        {(["default", "editing", "rejected", "regenerating", "undone"] as ControlMode[]).map((mode) => (
          <ComponentFrame
            key={mode}
            flow="All flows · user controls"
            state={
              mode === "default"
                ? "success"
                : mode === "rejected"
                  ? "error"
                  : mode === "undone"
                    ? "success"
                    : "loading"
            }
            stateColor={
              mode === "rejected"
                ? S.error
                : mode === "undone"
                  ? S.success
                  : mode === "default"
                    ? S.success
                    : S.loading
            }
          >
            <ControlBar mode={mode} />
          </ComponentFrame>
        ))}
      </div>
    </div>
  )
}