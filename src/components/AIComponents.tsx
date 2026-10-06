import { useEffect, useState } from 'react'

export const AI_COLORS = {
  loading: '#72D4F0',
  success: '#3BBF6C',
  uncertain: '#FFD83D',
  error: '#E84B1A',
  muted: '#8B8FA8',
}

// ─── Confidence bar ────────────────────────────────────────────────────────────

export function ConfidenceBar({ value }: { value: number }) {
  const color =
    value >= 80 ? AI_COLORS.success : value >= 55 ? AI_COLORS.uncertain : AI_COLORS.error
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 rounded-full overflow-hidden flex-1" style={{ background: 'var(--muted)' }}>
        <div className="h-full rounded-full" style={{ background: color, width: `${value}%` }} />
      </div>
      <span className="text-[10px] font-bold shrink-0" style={{ color }}>
        {value}%
      </span>
    </div>
  )
}

// ─── Inline AI status pill ─────────────────────────────────────────────────────

export function AIStatusPill({
  state,
  label,
}: {
  state: 'loading' | 'success' | 'uncertain' | 'error'
  label: string
}) {
  const color = AI_COLORS[state]
  return (
    <div className="flex items-center gap-1.5">
      {state === 'loading' ? (
        <div className="flex gap-0.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-1 h-1 rounded-full animate-bounce"
              style={{ background: color, animationDelay: `${i * 120}ms` }}
            />
          ))}
        </div>
      ) : (
        <div className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      )}
      <span className="text-[10px]" style={{ color }}>
        {label}
      </span>
    </div>
  )
}

// ─── Step progress (loading) ───────────────────────────────────────────────────

export function StepProgress({ steps, active }: { steps: string[]; active: number }) {
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
                background: done
                  ? AI_COLORS.success
                  : current
                  ? AI_COLORS.loading
                  : 'var(--muted)',
                color: done || current ? '#fff' : 'var(--muted-foreground)',
              }}
            >
              {done ? '✓' : i + 1}
            </div>
            <p
              className="text-xs flex-1"
              style={{
                color: done
                  ? AI_COLORS.success
                  : current
                  ? 'var(--foreground)'
                  : 'var(--muted-foreground)',
              }}
            >
              {s}
            </p>
            {current && (
              <div className="flex gap-0.5">
                {[0, 1, 2].map((j) => (
                  <div
                    key={j}
                    className="w-1 h-1 rounded-full animate-bounce"
                    style={{ background: AI_COLORS.loading, animationDelay: `${j * 120}ms` }}
                  />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Animated step progress (auto-cycles) ─────────────────────────────────────

export function AnimatedStepProgress({
  steps,
  intervalMs = 900,
  onComplete,
}: {
  steps: string[]
  intervalMs?: number
  onComplete?: () => void
}) {
  const [active, setActive] = useState(0)
  useEffect(() => {
    if (active >= steps.length) { onComplete?.(); return }
    const id = setTimeout(() => setActive((a) => a + 1), intervalMs)
    return () => clearTimeout(id)
  }, [active, steps.length, intervalMs, onComplete])
  return <StepProgress steps={steps} active={active} />
}

// ─── Pulse orb (long-running AI tasks) ────────────────────────────────────────

export function PulseOrb({ label, color = 'var(--magenta)' }: { label: string; color?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-4">
      <div className="relative w-14 h-14">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="absolute inset-0 rounded-full animate-ping opacity-20"
            style={{ background: color, animationDelay: `${i * 400}ms`, animationDuration: '1.6s' }}
          />
        ))}
        <div
          className="absolute inset-0 rounded-full flex items-center justify-center"
          style={{ background: color }}
        >
          <span className="text-lg text-white">✧</span>
        </div>
      </div>
      <p className="text-xs text-center max-w-[200px]" style={{ color: 'var(--muted-foreground)' }}>
        {label}
      </p>
    </div>
  )
}

// ─── Skeleton card ────────────────────────────────────────────────────────────

export function SkeletonOutfitCard() {
  return (
    <div className="space-y-2 animate-pulse">
      <div className="h-4 rounded-full w-2/5" style={{ background: 'var(--muted)' }} />
      <div className="h-3 rounded-full w-3/5" style={{ background: 'var(--muted)' }} />
      <div className="space-y-2 mt-3">
        {[72, 85, 60].map((w) => (
          <div key={w} className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg shrink-0" style={{ background: 'var(--muted)' }} />
            <div className="flex-1 space-y-1">
              <div className="h-2.5 rounded-full" style={{ background: 'var(--muted)', width: `${w}%` }} />
              <div className="h-2 rounded-full w-1/4" style={{ background: 'var(--muted)' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── AI uncertainty banner ─────────────────────────────────────────────────────

export function UncertaintyBanner({ message }: { message: string }) {
  return (
    <div
      className="rounded-xl px-3 py-2.5 text-[10px] leading-snug flex items-start gap-2"
      style={{
        background: `${AI_COLORS.uncertain}12`,
        border: `1px solid ${AI_COLORS.uncertain}40`,
        color: AI_COLORS.uncertain,
      }}
    >
      <span className="shrink-0">⚠</span>
      <span>{message}</span>
    </div>
  )
}

// ─── AI error banner ──────────────────────────────────────────────────────────

export function AIErrorBanner({
  title,
  message,
  actions,
}: {
  title: string
  message: string
  actions?: { label: string; primary?: boolean; onClick?: () => void }[]
}) {
  return (
    <div
      className="rounded-xl p-3 space-y-2.5"
      style={{
        background: `${AI_COLORS.error}10`,
        border: `1px solid ${AI_COLORS.error}40`,
      }}
    >
      <div className="flex items-start gap-2">
        <span style={{ color: AI_COLORS.error, fontSize: 13 }}>⚠</span>
        <div>
          <p className="text-xs font-semibold" style={{ color: AI_COLORS.error }}>
            {title}
          </p>
          <p className="text-[10px] leading-snug mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
            {message}
          </p>
        </div>
      </div>
      {actions && (
        <div className="flex gap-2">
          {actions.map((a) => (
            <button
              key={a.label}
              onClick={a.onClick}
              className="flex-1 py-1.5 rounded-xl text-[10px] font-semibold"
              style={
                a.primary
                  ? { background: AI_COLORS.error, color: '#fff' }
                  : { background: 'var(--muted)', color: 'var(--foreground)' }
              }
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Image upload widget ───────────────────────────────────────────────────────

export type UploadState = 'empty' | 'uploading' | 'analyzing' | 'success' | 'error'

export function ImageUploadWidget({
  state,
  progress = 62,
  result,
  onRetake,
  onManual,
  onSave,
  onCorrect,
}: {
  state: UploadState
  progress?: number
  result?: { name: string; hex: string; category: string }
  onRetake?: () => void
  onManual?: () => void
  onSave?: () => void
  onCorrect?: () => void
}) {
  if (state === 'empty') return (
    <div
      className="rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2 py-8 cursor-pointer"
      style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}
      onClick={onRetake}
    >
      <span className="text-3xl">📷</span>
      <p className="text-xs font-medium">Take a photo or upload</p>
      <p className="text-[10px]">JPEG · PNG · max 10 MB</p>
    </div>
  )

  if (state === 'uploading') return (
    <div className="space-y-2">
      <div className="h-28 rounded-xl flex items-center justify-center" style={{ background: 'var(--muted)' }}>
        <span className="text-3xl opacity-40">🖼</span>
      </div>
      <div className="space-y-1">
        <div className="flex justify-between text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
          <span>Uploading…</span>
          <span>{progress}%</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--muted)' }}>
          <div className="h-full rounded-full transition-all" style={{ background: AI_COLORS.loading, width: `${progress}%` }} />
        </div>
      </div>
    </div>
  )

  if (state === 'analyzing') return (
    <div className="space-y-2">
      <div
        className="h-28 rounded-xl flex items-center justify-center relative overflow-hidden"
        style={{ background: '#1A2530' }}
      >
        <div className="text-3xl opacity-25">👕</div>
        <div
          className="absolute inset-0 animate-pulse"
          style={{ background: `linear-gradient(135deg, ${AI_COLORS.loading}22 0%, transparent 60%)` }}
        />
        <div
          className="absolute bottom-2 left-2 right-2 rounded-lg px-2 py-1 text-[10px] font-semibold"
          style={{ background: 'rgba(0,0,0,0.55)', color: AI_COLORS.loading }}
        >
          Identifying color & category…
        </div>
      </div>
      <div className="space-y-1">
        {['Reading image', 'Classifying hue', 'Detecting garment type'].map((s, i) => (
          <div key={s} className="flex items-center gap-1.5">
            <div
              className="w-1 h-1 rounded-full animate-pulse"
              style={{ background: AI_COLORS.loading, animationDelay: `${i * 250}ms` }}
            />
            <span className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>{s}</span>
          </div>
        ))}
      </div>
    </div>
  )

  if (state === 'success' && result) return (
    <div className="space-y-2">
      <div className="h-28 rounded-xl relative overflow-hidden" style={{ background: result.hex }}>
        <div
          className="absolute bottom-0 left-0 right-0 px-3 py-2"
          style={{ background: 'rgba(0,0,0,0.55)' }}
        >
          <div className="flex items-center gap-2">
            <div
              className="w-5 h-5 rounded-md shrink-0"
              style={{ background: result.hex, border: '1.5px solid rgba(255,255,255,0.3)' }}
            />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold" style={{ color: '#fff' }}>{result.name}</p>
              <p className="text-[9px]" style={{ color: 'rgba(255,255,255,0.6)' }}>
                {result.hex} · {result.category}
              </p>
            </div>
            <span className="text-[10px] shrink-0" style={{ color: AI_COLORS.success }}>✓</span>
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onSave}
          className="flex-1 py-2 rounded-xl text-[10px] font-semibold"
          style={{ background: AI_COLORS.success, color: '#fff' }}
        >
          Save to wardrobe
        </button>
        <button
          onClick={onCorrect}
          className="px-3 py-2 rounded-xl text-[10px]"
          style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}
        >
          Correct color
        </button>
      </div>
    </div>
  )

  // error
  return (
    <div className="space-y-2">
      <div
        className="h-28 rounded-xl flex flex-col items-center justify-center gap-2"
        style={{ background: `${AI_COLORS.error}10`, border: `1px dashed ${AI_COLORS.error}60` }}
      >
        <span className="text-2xl">⚠</span>
        <p className="text-xs font-medium" style={{ color: AI_COLORS.error }}>Photo unusable</p>
        <p className="text-[10px] text-center px-4" style={{ color: 'var(--muted-foreground)' }}>
          Blurry, too dark, or not a clothing item
        </p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onRetake}
          className="flex-1 py-2 rounded-xl text-[10px] font-semibold"
          style={{ background: AI_COLORS.error, color: '#fff' }}
        >
          📷 Retake
        </button>
        <button
          onClick={onManual}
          className="flex-1 py-2 rounded-xl text-[10px]"
          style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}
        >
          Enter manually
        </button>
      </div>
    </div>
  )
}

// ─── Voice input button ────────────────────────────────────────────────────────

export type VoiceState = 'idle' | 'listening' | 'processing' | 'captured' | 'error'

export function VoiceInputButton({
  state,
  transcript,
  onTap,
  onAccept,
  onReRecord,
}: {
  state: VoiceState
  transcript?: string
  onTap?: () => void
  onAccept?: () => void
  onReRecord?: () => void
}) {
  const color =
    state === 'idle'
      ? 'var(--muted-foreground)'
      : state === 'captured'
      ? AI_COLORS.success
      : state === 'error'
      ? AI_COLORS.error
      : AI_COLORS.loading

  const ringColor =
    state === 'idle'
      ? 'var(--border)'
      : state === 'captured'
      ? AI_COLORS.success
      : state === 'error'
      ? AI_COLORS.error
      : AI_COLORS.loading

  const label = {
    idle: 'Tap to speak',
    listening: 'Listening…',
    processing: 'Transcribing…',
    captured: transcript || 'Captured',
    error: "Couldn't hear you — tap to retry",
  }[state]

  return (
    <div className="flex items-center gap-3">
      <button onClick={onTap} className="relative shrink-0">
        {state === 'listening' && (
          <div
            className="absolute inset-0 rounded-full animate-ping opacity-30"
            style={{ background: AI_COLORS.loading }}
          />
        )}
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center relative"
          style={{
            background: state === 'idle' ? 'var(--muted)' : `${ringColor}18`,
            border: `2px solid ${ringColor}`,
          }}
        >
          <span style={{ color, fontSize: 16 }}>
            {state === 'captured' ? '✓' : state === 'error' ? '✕' : '🎙'}
          </span>
        </div>
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-xs truncate" style={{ color }}>
          {label}
        </p>
        {state === 'captured' && (
          <div className="flex gap-2 mt-1">
            <button onClick={onAccept} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: `${AI_COLORS.success}22`, color: AI_COLORS.success }}>
              Use this
            </button>
            <button onClick={onReRecord} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}>
              Re-record
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── User control bar ─────────────────────────────────────────────────────────

export type ControlMode = 'default' | 'editing' | 'rejected' | 'regenerating' | 'undone'

interface ControlBarProps {
  mode: ControlMode
  onApprove?: () => void
  onEdit?: () => void
  onReject?: () => void
  onRegenerate?: () => void
  onUndo?: () => void
  onWhy?: () => void
  approveLabel?: string
}

export function UserControlBar({
  mode,
  onApprove,
  onEdit,
  onReject,
  onRegenerate,
  onUndo,
  onWhy,
  approveLabel = 'Approve & wear',
}: ControlBarProps) {
  const statusBanner: Record<Exclude<ControlMode, 'default'>, { color: string; text: string }> = {
    editing:      { color: AI_COLORS.loading,   text: '✏ Editing — swap any item to update the suggestion.' },
    rejected:     { color: AI_COLORS.error,     text: '✕ Rejected. Tell us why to improve future suggestions.' },
    regenerating: { color: AI_COLORS.loading,   text: '↺ Regenerating outfit…' },
    undone:       { color: AI_COLORS.success,   text: '↩ Reverted to previous suggestion.' },
  }

  const banner = mode !== 'default' ? statusBanner[mode] : null

  const activeStyle = (color: string) => ({ background: color, color: '#fff' } as const)
  const mutedStyle = { background: 'var(--muted)', color: 'var(--foreground)' } as const

  return (
    <div className="space-y-2">
      {banner && (
        <div
          className="rounded-xl px-3 py-2 text-[10px]"
          style={{ background: `${banner.color}15`, color: banner.color }}
        >
          {banner.text}
        </div>
      )}
      <button
        onClick={onApprove}
        className="w-full py-2.5 rounded-xl text-xs font-semibold"
        style={mode === 'default' ? activeStyle('var(--magenta)') : mutedStyle}
      >
        {mode === 'editing' ? 'Save edits' : mode === 'undone' ? '✓ Keep this version' : approveLabel}
      </button>
      <div className="grid grid-cols-4 gap-1.5">
        {[
          { label: 'Edit',   icon: '✏', active: mode === 'editing',      fn: onEdit,       activeColor: AI_COLORS.loading },
          { label: 'Reject', icon: '✕', active: mode === 'rejected',     fn: onReject,     activeColor: AI_COLORS.error },
          { label: 'Redo',   icon: '↺', active: mode === 'regenerating', fn: onRegenerate, activeColor: AI_COLORS.loading },
          { label: 'Undo',   icon: '↩', active: mode === 'undone',       fn: onUndo,       activeColor: AI_COLORS.success },
        ].map((btn) => (
          <button
            key={btn.label}
            onClick={btn.fn}
            className="py-2 rounded-xl text-[10px] font-semibold flex flex-col items-center gap-0.5"
            style={btn.active ? activeStyle(btn.activeColor) : mutedStyle}
          >
            <span>{btn.icon}</span>
            {btn.label}
          </button>
        ))}
      </div>
      <button
        onClick={onWhy}
        className="w-full py-2 rounded-xl text-[10px]"
        style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}
      >
        Why this outfit?
      </button>
    </div>
  )
}
