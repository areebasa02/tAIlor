import { useState, useEffect, useRef } from 'react'

// ─── Shared primitives ────────────────────────────────────────────────────────

function Chip({
  label,
  color = 'var(--muted-foreground)',
  bg = 'var(--muted)',
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
      style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--foreground)' }}
    >
      {children}
    </h2>
  )
}

function SubTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] mb-4" style={{ color: 'var(--muted-foreground)' }}>
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
    <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
      {/* annotation bar */}
      <div
        className="flex items-center justify-between px-3 py-1.5"
        style={{ background: 'var(--muted)', borderBottom: '1px solid var(--border)' }}
      >
        <span className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: 'var(--muted-foreground)' }}>
          {flow}
        </span>
        <Chip
          label={state}
          color={stateColor}
          bg={stateColor + '18'}
        />
      </div>
      <div className="p-4" style={{ background: 'var(--card)' }}>
        {children}
      </div>
    </div>
  )
}

// ─── State color map ───────────────────────────────────────────────────────────
const S = {
  empty: '#8B8FA8',
  loading: '#72D4F0',
  success: '#3BBF6C',
  uncertain: '#FFD83D',
  error: '#E84B1A',
}

// ─── 1. AI Text Input ─────────────────────────────────────────────────────────

function TextInputEmpty() {
  return (
    <div className="space-y-2">
      <label className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--muted-foreground)' }}>
        Describe the event
      </label>
      <div
        className="w-full rounded-xl px-3 py-2.5 text-sm flex items-center"
        style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: 'var(--muted-foreground)', minHeight: 44 }}
      >
        e.g. Networking dinner, 7pm Thursday…
      </div>
      <p className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
        The more context you give, the better the suggestion.
      </p>
    </div>
  )
}

function TextInputLoading() {
  return (
    <div className="space-y-2">
      <label className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--muted-foreground)' }}>
        Describe the event
      </label>
      <div
        className="w-full rounded-xl px-3 py-2.5 text-sm"
        style={{ background: 'var(--muted)', border: `1px solid ${S.loading}60`, minHeight: 44 }}
      >
        <span style={{ color: 'var(--foreground)' }}>Networking dinner at a rooftop venue…</span>
      </div>
      <div className="flex items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-1.5 h-1.5 rounded-full animate-bounce"
            style={{ background: S.loading, animationDelay: `${i * 150}ms` }}
          />
        ))}
        <span className="text-[10px]" style={{ color: S.loading }}>Reading your input…</span>
      </div>
    </div>
  )
}

function TextInputSuccess() {
  return (
    <div className="space-y-2">
      <label className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--muted-foreground)' }}>
        Describe the event
      </label>
      <div
        className="w-full rounded-xl px-3 py-2.5 text-sm"
        style={{ background: 'var(--muted)', border: `1px solid ${S.success}60`, minHeight: 44, color: 'var(--foreground)' }}
      >
        Networking dinner at a rooftop venue, 7pm Thursday, business-casual
      </div>
      <div className="flex items-center gap-1.5">
        <span style={{ color: S.success, fontSize: 11 }}>✓</span>
        <span className="text-[10px]" style={{ color: S.success }}>Context accepted — generating outfits</span>
      </div>
    </div>
  )
}

function TextInputUncertain() {
  return (
    <div className="space-y-2">
      <label className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--muted-foreground)' }}>
        Describe the event
      </label>
      <div
        className="w-full rounded-xl px-3 py-2.5 text-sm"
        style={{ background: 'var(--muted)', border: `1px solid ${S.uncertain}60`, minHeight: 44, color: 'var(--foreground)' }}
      >
        Dinner
      </div>
      <div
        className="rounded-xl px-3 py-2 text-[10px] leading-snug"
        style={{ background: `${S.uncertain}12`, border: `1px solid ${S.uncertain}40`, color: S.uncertain }}
      >
        ⚠ Not enough context — is this casual, formal, or smart-casual? What time and venue?
      </div>
    </div>
  )
}

function TextInputError() {
  return (
    <div className="space-y-2">
      <label className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--muted-foreground)' }}>
        Describe the event
      </label>
      <div
        className="w-full rounded-xl px-3 py-2.5 text-sm"
        style={{ background: 'var(--muted)', border: `1px solid ${S.error}60`, minHeight: 44, color: 'var(--foreground)' }}
      >
        asdkjhasd
      </div>
      <div className="flex items-center gap-1.5">
        <span style={{ color: S.error, fontSize: 11 }}>✕</span>
        <span className="text-[10px]" style={{ color: S.error }}>Input not understood. Try describing the occasion in plain words.</span>
      </div>
    </div>
  )
}

// ─── 2. Voice Input ───────────────────────────────────────────────────────────

function VoiceButton({ state }: { state: 'idle' | 'listening' | 'processing' | 'captured' | 'error' }) {
  const configs = {
    idle:       { icon: '🎙', label: 'Tap to speak', ring: 'var(--border)', bg: 'var(--muted)', pulse: false },
    listening:  { icon: '🎙', label: 'Listening…', ring: S.loading, bg: `${S.loading}18`, pulse: true },
    processing: { icon: '⧖', label: 'Transcribing…', ring: S.loading, bg: `${S.loading}12`, pulse: false },
    captured:   { icon: '✓', label: '"Dinner at 7pm, business-casual"', ring: S.success, bg: `${S.success}12`, pulse: false },
    error:      { icon: '✕', label: 'Couldn\'t hear you — tap to retry', ring: S.error, bg: `${S.error}12`, pulse: false },
  }
  const c = configs[state]
  const iconColor = { idle: 'var(--muted-foreground)', listening: S.loading, processing: S.loading, captured: S.success, error: S.error }[state]

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
          style={{ background: c.bg, border: `2px solid ${c.ring}`, boxShadow: `0 0 0 4px ${c.ring}22` }}
        >
          <span style={{ color: iconColor }}>{c.icon}</span>
        </div>
      </div>
      <p className="text-xs text-center" style={{ color: iconColor, maxWidth: 160 }}>{c.label}</p>
      {state === 'captured' && (
        <div className="flex gap-2">
          <button className="text-[10px] px-2.5 py-1 rounded-full" style={{ background: S.success + '22', color: S.success }}>Use this</button>
          <button className="text-[10px] px-2.5 py-1 rounded-full" style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}>Re-record</button>
        </div>
      )}
    </div>
  )
}

// ─── 3. Image Upload ──────────────────────────────────────────────────────────

function ImageUpload({ state }: { state: 'empty' | 'uploading' | 'analyzing' | 'success' | 'error' }) {
  if (state === 'empty') return (
    <div
      className="rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2 py-8"
      style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}
    >
      <span className="text-3xl">📷</span>
      <p className="text-xs font-medium">Take a photo or upload</p>
      <p className="text-[10px]">JPEG, PNG · max 10 MB</p>
    </div>
  )

  if (state === 'uploading') return (
    <div className="space-y-2">
      <div
        className="h-28 rounded-xl flex items-center justify-center"
        style={{ background: 'var(--muted)' }}
      >
        <span className="text-3xl opacity-50">🖼</span>
      </div>
      <div className="space-y-1">
        <div className="flex justify-between text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
          <span>Uploading photo…</span><span>62%</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--muted)' }}>
          <div className="h-full rounded-full" style={{ background: S.loading, width: '62%' }} />
        </div>
      </div>
    </div>
  )

  if (state === 'analyzing') return (
    <div className="space-y-2">
      <div
        className="h-28 rounded-xl flex items-center justify-center relative overflow-hidden"
        style={{ background: '#1A2A3A' }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-3xl opacity-30">👕</div>
        </div>
        <div
          className="absolute inset-0 animate-pulse"
          style={{ background: `linear-gradient(135deg, ${S.loading}22 0%, transparent 60%)` }}
        />
        <div
          className="px-3 py-1.5 rounded-xl text-[10px] font-semibold relative"
          style={{ background: 'rgba(0,0,0,0.5)', color: S.loading }}
        >
          Identifying color & category…
        </div>
      </div>
      <div className="space-y-1">
        {['Reading image', 'Classifying hue', 'Detecting garment type'].map((s, i) => (
          <div key={s} className="flex items-center gap-1.5">
            <div className="w-1 h-1 rounded-full animate-pulse" style={{ background: S.loading, animationDelay: `${i * 250}ms` }} />
            <span className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>{s}</span>
          </div>
        ))}
      </div>
    </div>
  )

  if (state === 'success') return (
    <div className="space-y-2">
      <div
        className="h-28 rounded-xl relative overflow-hidden"
        style={{ background: '#007A8A' }}
      >
        <div
          className="absolute bottom-2 left-2 right-2 rounded-lg px-2 py-1.5"
          style={{ background: 'rgba(0,0,0,0.6)' }}
        >
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-md" style={{ background: '#007A8A', border: '1px solid rgba(255,255,255,0.3)' }} />
            <div>
              <p className="text-[10px] font-semibold" style={{ color: '#fff' }}>Deep Teal · Outerwear</p>
              <p className="text-[9px]" style={{ color: 'rgba(255,255,255,0.6)' }}>#007A8A · Cool-neutral</p>
            </div>
            <span className="ml-auto text-[10px]" style={{ color: S.success }}>✓ Identified</span>
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <button className="flex-1 py-1.5 rounded-xl text-[10px] font-semibold" style={{ background: S.success, color: '#fff' }}>Save to wardrobe</button>
        <button className="px-3 py-1.5 rounded-xl text-[10px]" style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}>Correct color</button>
      </div>
    </div>
  )

  return (
    <div className="space-y-2">
      <div
        className="h-28 rounded-xl flex flex-col items-center justify-center gap-2"
        style={{ background: `${S.error}10`, border: `1px dashed ${S.error}60` }}
      >
        <span className="text-2xl">⚠</span>
        <p className="text-xs font-medium" style={{ color: S.error }}>Photo unusable</p>
        <p className="text-[10px] text-center" style={{ color: 'var(--muted-foreground)' }}>Blurry, too dark, or not a clothing item</p>
      </div>
      <div className="flex gap-2">
        <button className="flex-1 py-1.5 rounded-xl text-[10px] font-semibold" style={{ background: S.error, color: '#fff' }}>📷 Retake photo</button>
        <button className="flex-1 py-1.5 rounded-xl text-[10px]" style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}>Enter manually</button>
      </div>
    </div>
  )
}

// ─── 4. Processing Feedback ───────────────────────────────────────────────────

function StepProgress({ active }: { active: number }) {
  const steps = ['Reading context', 'Browsing wardrobe', 'Checking history', 'Building outfits']
  return (
    <div className="space-y-2.5">
      {steps.map((s, i) => {
        const done = i < active
        const current = i === active
        return (
          <div key={s} className="flex items-center gap-2.5">
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
              style={{
                background: done ? S.success : current ? S.loading : 'var(--muted)',
                color: done || current ? '#fff' : 'var(--muted-foreground)',
              }}
            >
              {done ? '✓' : i + 1}
            </div>
            <p
              className="text-xs"
              style={{ color: done ? S.success : current ? 'var(--foreground)' : 'var(--muted-foreground)' }}
            >
              {s}
            </p>
            {current && (
              <div className="flex gap-0.5 ml-auto">
                {[0, 1, 2].map((j) => (
                  <div key={j} className="w-1 h-1 rounded-full animate-bounce" style={{ background: S.loading, animationDelay: `${j * 120}ms` }} />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="space-y-2 animate-pulse">
      <div className="h-4 rounded-full w-1/2" style={{ background: 'var(--muted)' }} />
      <div className="h-3 rounded-full w-3/4" style={{ background: 'var(--muted)' }} />
      <div className="space-y-1.5 mt-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg shrink-0" style={{ background: 'var(--muted)' }} />
            <div className="flex-1 space-y-1">
              <div className="h-2.5 rounded-full" style={{ background: 'var(--muted)', width: `${60 + i * 10}%` }} />
              <div className="h-2 rounded-full w-1/3" style={{ background: 'var(--muted)' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function PulseOrb({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <div className="relative w-14 h-14">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="absolute inset-0 rounded-full animate-ping opacity-20"
            style={{
              background: 'var(--magenta)',
              animationDelay: `${i * 400}ms`,
              animationDuration: '1.5s',
              transform: `scale(${1 + i * 0.25})`,
            }}
          />
        ))}
        <div
          className="absolute inset-0 rounded-full flex items-center justify-center"
          style={{ background: 'var(--magenta)' }}
        >
          <span className="text-lg text-white">✧</span>
        </div>
      </div>
      <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{label}</p>
    </div>
  )
}

// ─── 5. Result Cards ─────────────────────────────────────────────────────────

function ResultCardHigh() {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold" style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--foreground)' }}>
          Suggested outfit
        </p>
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 rounded-full overflow-hidden w-16" style={{ background: 'var(--muted)' }}>
            <div className="h-full rounded-full" style={{ background: S.success, width: '92%' }} />
          </div>
          <span className="text-[10px] font-semibold" style={{ color: S.success }}>92% match</span>
        </div>
      </div>
      {[
        { type: 'Top', desc: 'Magenta button-down', color: '#D40067' },
        { type: 'Bottom', desc: 'Black wide-legs', color: '#1A1A2E' },
        { type: 'Shoes', desc: 'White platforms', color: '#E8E8E8' },
      ].map((item) => (
        <div key={item.type} className="flex items-center gap-2.5 rounded-xl px-3 py-2" style={{ background: 'var(--muted)' }}>
          <div className="w-6 h-6 rounded-lg" style={{ background: item.color, border: '1px solid rgba(255,255,255,0.1)' }} />
          <div>
            <p className="text-[9px] uppercase tracking-widest" style={{ color: 'var(--muted-foreground)' }}>{item.type}</p>
            <p className="text-xs font-medium" style={{ color: 'var(--foreground)' }}>{item.desc}</p>
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
        <p className="text-xs font-semibold" style={{ fontFamily: 'Nunito, sans-serif', color: 'var(--foreground)' }}>
          Best guess
        </p>
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 rounded-full overflow-hidden w-16" style={{ background: 'var(--muted)' }}>
            <div className="h-full rounded-full" style={{ background: S.uncertain, width: '43%' }} />
          </div>
          <span className="text-[10px] font-semibold" style={{ color: S.uncertain }}>43% match</span>
        </div>
      </div>
      <div
        className="rounded-xl px-3 py-2 text-[10px] leading-snug"
        style={{ background: `${S.uncertain}12`, border: `1px solid ${S.uncertain}40`, color: S.uncertain }}
      >
        ⚠ Low confidence — the event context is ambiguous. Review carefully or add more detail.
      </div>
      {[
        { type: 'Top', desc: 'Mint mock-neck', color: '#B4F0C0' },
        { type: 'Bottom', desc: 'Camel trousers', color: '#C8965A' },
        { type: 'Shoes', desc: 'Tan loafers', color: '#B8825A' },
      ].map((item) => (
        <div key={item.type} className="flex items-center gap-2.5 rounded-xl px-3 py-2" style={{ background: 'var(--muted)', opacity: 0.7 }}>
          <div className="w-6 h-6 rounded-lg" style={{ background: item.color, border: '1px solid rgba(255,255,255,0.1)' }} />
          <div>
            <p className="text-[9px] uppercase tracking-widest" style={{ color: 'var(--muted-foreground)' }}>{item.type}</p>
            <p className="text-xs font-medium" style={{ color: 'var(--foreground)' }}>{item.desc}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

function AlternativeSuggestions() {
  const alts = [
    { label: 'Try instead', desc: 'Navy tee + slim jeans + white sneakers', confidence: 81, colors: ['#2B4B8C', '#4A6FA5', '#F2F2F2'] },
    { label: 'Bolder option', desc: 'Magenta blouse + black trousers', confidence: 74, colors: ['#D40067', '#1A1A2E'] },
    { label: 'Safe fallback', desc: 'Cream blouse + camel trousers + tan loafers', confidence: 68, colors: ['#F5EFD8', '#C8965A', '#B8825A'] },
  ]
  return (
    <div className="space-y-2">
      <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: 'var(--muted-foreground)' }}>Alternative suggestions</p>
      {alts.map((a) => (
        <div
          key={a.label}
          className="flex items-center gap-2.5 rounded-xl px-3 py-2.5"
          style={{ background: 'var(--muted)', border: '1px solid var(--border)' }}
        >
          <div className="flex gap-0.5">
            {a.colors.map((c, i) => (
              <div key={i} className="w-4 h-4 rounded-md" style={{ background: c, border: '1px solid rgba(255,255,255,0.08)' }} />
            ))}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold" style={{ color: 'var(--foreground)' }}>{a.label}</p>
            <p className="text-[9px] truncate" style={{ color: 'var(--muted-foreground)' }}>{a.desc}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[10px] font-bold" style={{ color: a.confidence >= 80 ? S.success : a.confidence >= 65 ? S.uncertain : S.error }}>
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
    <div
      className="flex flex-col items-center justify-center gap-3 py-8 rounded-xl"
      style={{ background: 'var(--muted)', border: '1px dashed var(--border)' }}
    >
      <span className="text-3xl opacity-40">🧺</span>
      <div className="text-center">
        <p className="text-xs font-semibold" style={{ color: 'var(--foreground)' }}>No matching outfits</p>
        <p className="text-[10px] mt-0.5 max-w-[180px]" style={{ color: 'var(--muted-foreground)' }}>
          Try a different occasion or browse your wardrobe directly.
        </p>
      </div>
      <button className="text-[10px] px-3 py-1.5 rounded-full font-semibold" style={{ background: 'var(--magenta)', color: '#fff' }}>
        Browse wardrobe
      </button>
    </div>
  )
}

// ─── 6. Error States ─────────────────────────────────────────────────────────

function ServiceError() {
  return (
    <div
      className="rounded-xl p-3 space-y-2"
      style={{ background: `${S.error}10`, border: `1px solid ${S.error}40` }}
    >
      <div className="flex items-start gap-2">
        <span style={{ color: S.error, fontSize: 14 }}>⚠</span>
        <div>
          <p className="text-xs font-semibold" style={{ color: S.error }}>Service unavailable</p>
          <p className="text-[10px] leading-snug mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
            AI styling is temporarily offline. Your wardrobe is still available.
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <button className="flex-1 py-1.5 rounded-xl text-[10px] font-semibold" style={{ background: S.error, color: '#fff' }}>Retry</button>
        <button className="flex-1 py-1.5 rounded-xl text-[10px]" style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}>Browse manually</button>
      </div>
    </div>
  )
}

function InappropriateOutput() {
  return (
    <div
      className="rounded-xl p-3 space-y-2"
      style={{ background: `${S.error}10`, border: `1px solid ${S.error}40` }}
    >
      <div className="flex items-start gap-2">
        <span style={{ color: S.error, fontSize: 14 }}>🚫</span>
        <div>
          <p className="text-xs font-semibold" style={{ color: S.error }}>Suggestion hidden</p>
          <p className="text-[10px] leading-snug mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
            This result may contain body-shaming or offensive language and has been removed.
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <button className="flex-1 py-1.5 rounded-xl text-[10px] font-semibold" style={{ background: 'var(--magenta)', color: '#fff' }}>Regenerate</button>
        <button className="flex-1 py-1.5 rounded-xl text-[10px]" style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}>Report</button>
      </div>
    </div>
  )
}

// ─── 7. User Control Bar ─────────────────────────────────────────────────────

type CtrlState = 'default' | 'editing' | 'undone' | 'rejected' | 'regenerating'

function ControlBar({ mode }: { mode: CtrlState }) {
  const active = (c: string) => ({ background: c, color: '#fff' })
  const muted = { background: 'var(--muted)', color: 'var(--foreground)' }

  return (
    <div className="space-y-2">
      {/* Status banner */}
      {mode === 'editing' && (
        <div className="rounded-xl px-3 py-1.5 text-[10px]" style={{ background: `${S.loading}12`, color: S.loading }}>
          ✏ Editing — swap any item. Changes update the preview instantly.
        </div>
      )}
      {mode === 'undone' && (
        <div className="rounded-xl px-3 py-1.5 text-[10px]" style={{ background: `${S.success}12`, color: S.success }}>
          ↩ Reverted to previous suggestion.
        </div>
      )}
      {mode === 'rejected' && (
        <div className="rounded-xl px-3 py-1.5 text-[10px]" style={{ background: `${S.error}12`, color: S.error }}>
          ✕ Rejected. Tell us why to improve future suggestions.
        </div>
      )}
      {mode === 'regenerating' && (
        <div className="rounded-xl px-3 py-1.5 text-[10px] flex items-center gap-1.5" style={{ background: `${S.loading}12`, color: S.loading }}>
          <div className="w-1 h-1 rounded-full animate-bounce" style={{ background: S.loading }} />
          Regenerating outfit…
        </div>
      )}

      {/* Primary approve */}
      <button
        className="w-full py-2.5 rounded-xl text-xs font-semibold"
        style={mode === 'default' ? active('var(--magenta)') : muted}
      >
        {mode === 'default' ? '✓ Approve & wear' : mode === 'editing' ? 'Save edits' : mode === 'undone' ? '✓ Keep this version' : 'Approve'}
      </button>

      {/* Action row */}
      <div className="grid grid-cols-4 gap-1.5">
        <button
          className="py-2 rounded-xl text-[10px] font-semibold flex flex-col items-center gap-0.5"
          style={mode === 'editing' ? active(S.loading) : muted}
        >
          <span>✏</span>Edit
        </button>
        <button
          className="py-2 rounded-xl text-[10px] font-semibold flex flex-col items-center gap-0.5"
          style={mode === 'rejected' ? active(S.error) : muted}
        >
          <span>✕</span>Reject
        </button>
        <button
          className="py-2 rounded-xl text-[10px] font-semibold flex flex-col items-center gap-0.5"
          style={mode === 'regenerating' ? active(S.loading) : muted}
        >
          <span>↺</span>Redo
        </button>
        <button
          className="py-2 rounded-xl text-[10px] font-semibold flex flex-col items-center gap-0.5"
          style={mode === 'undone' ? active(S.success) : muted}
        >
          <span>↩</span>Undo
        </button>
      </div>

      {/* Secondary */}
      <button
        className="w-full py-2 rounded-xl text-[10px]"
        style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}
      >
        Why this outfit?
      </button>
    </div>
  )
}

// ─── Interactive demo wrapper ─────────────────────────────────────────────────

function LiveStepProgress() {
  const [step, setStep] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setStep((s) => (s < 4 ? s + 1 : 0)), 1000)
    return () => clearInterval(id)
  }, [])
  return <StepProgress active={step} />
}

// ─── Main tab ────────────────────────────────────────────────────────────────

export default function AIComponentsTab() {
  const [voiceState, setVoiceState] = useState<'idle' | 'listening' | 'processing' | 'captured' | 'error'>('idle')
  const [ctrlMode, setCtrlMode] = useState<CtrlState>('default')

  const cycleVoice = () => {
    const order: typeof voiceState[] = ['idle', 'listening', 'processing', 'captured', 'error']
    setVoiceState((s) => order[(order.indexOf(s) + 1) % order.length])
  }

  return (
    <div className="px-5 pt-2 pb-4">
      {/* Page header */}
      <div className="mb-2">
        <h2 className="text-xl font-semibold" style={{ fontFamily: 'Nunito, sans-serif' }}>
          AI component kit
        </h2>
        <p className="text-[11px] mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
          All AI interaction states — annotated by flow and state
        </p>
      </div>

      {/* Legend */}
      <div
        className="flex flex-wrap gap-2 rounded-xl px-3 py-2.5 mb-2"
        style={{ background: 'var(--muted)', border: '1px solid var(--border)' }}
      >
        {[
          ['empty', S.empty],
          ['loading', S.loading],
          ['success', S.success],
          ['uncertain', S.uncertain],
          ['error', S.error],
        ].map(([label, color]) => (
          <div key={label} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full" style={{ background: color }} />
            <span className="text-[9px] uppercase tracking-widest" style={{ color: 'var(--muted-foreground)' }}>{label}</span>
          </div>
        ))}
      </div>

      {/* ── Section 1: Text Input ── */}
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

      {/* ── Section 2: Voice Input ── */}
      <SectionTitle>2 · Voice Input</SectionTitle>
      <SubTitle>Used in: Outfit Generator, accessibility mode — tap to cycle states</SubTitle>
      <ComponentFrame flow="Generator · Voice" state={voiceState} stateColor={S[voiceState === 'idle' ? 'empty' : voiceState === 'captured' ? 'success' : voiceState]}>
        <div className="flex flex-col items-center">
          <VoiceButton state={voiceState} />
          <button
            onClick={cycleVoice}
            className="mt-4 text-[10px] px-3 py-1.5 rounded-full"
            style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}
          >
            Cycle state →
          </button>
        </div>
      </ComponentFrame>

      {/* ── Section 3: Image Upload ── */}
      <SectionTitle>3 · Image Upload</SectionTitle>
      <SubTitle>Used in: Color Matcher (Flow 03), Virtual Try-On (Flow 04), adding wardrobe items</SubTitle>
      <div className="space-y-3">
        {(['empty', 'uploading', 'analyzing', 'success', 'error'] as const).map((state) => (
          <ComponentFrame
            key={state}
            flow="Color Matcher · Flow 03"
            state={state}
            stateColor={state === 'empty' ? S.empty : state === 'success' ? S.success : state === 'error' ? S.error : S.loading}
          >
            <ImageUpload state={state} />
          </ComponentFrame>
        ))}
      </div>

      {/* ── Section 4: Processing Feedback ── */}
      <SectionTitle>4 · AI Processing Feedback</SectionTitle>
      <SubTitle>Used in: all AI flows during model inference</SubTitle>
      <div className="space-y-3">
        <ComponentFrame flow="All flows · loading" state="loading" stateColor={S.loading}>
          <LiveStepProgress />
        </ComponentFrame>
        <ComponentFrame flow="All flows · skeleton" state="loading" stateColor={S.loading}>
          <SkeletonCard />
        </ComponentFrame>
        <ComponentFrame flow="Try-On · Flow 04 · long processing" state="loading" stateColor={S.loading}>
          <PulseOrb label="Generating your preview — this may take up to 30 seconds" />
        </ComponentFrame>
      </div>

      {/* ── Section 5: Result Presentation ── */}
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

      {/* ── Section 6: Error States ── */}
      <SectionTitle>6 · AI Error States</SectionTitle>
      <SubTitle>Used in: AI Failure & Recovery flow (Flow 05)</SubTitle>
      <div className="space-y-3">
        <ComponentFrame flow="Flow 05 · service error" state="error" stateColor={S.error}>
          <ServiceError />
        </ComponentFrame>
        <ComponentFrame flow="Flow 05 · inappropriate output" state="error" stateColor={S.error}>
          <InappropriateOutput />
        </ComponentFrame>
      </div>

      {/* ── Section 7: User Controls ── */}
      <SectionTitle>7 · User Control Bar</SectionTitle>
      <SubTitle>Used in: all AI result screens — always available, no result blocks manual use</SubTitle>
      <div className="space-y-3">
        {(['default', 'editing', 'rejected', 'regenerating', 'undone'] as CtrlState[]).map((mode) => (
          <ComponentFrame
            key={mode}
            flow="All flows · user controls"
            state={mode === 'default' ? 'success' : mode === 'rejected' ? 'error' : mode === 'undone' ? 'success' : 'loading'}
            stateColor={mode === 'rejected' ? S.error : mode === 'undone' ? S.success : mode === 'default' ? S.success : S.loading}
          >
            <ControlBar mode={mode} />
          </ComponentFrame>
        ))}
      </div>

      <div className="h-4" />
    </div>
  )
}
