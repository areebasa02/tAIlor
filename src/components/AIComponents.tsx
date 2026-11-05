import { useState, useEffect } from "react"
import { THEME_COLORS, STATUS_COLORS } from "../types/theme"

// ─── Exported Types ───────────────────────────────────────────────────────────
export type VoiceState = "idle" | "listening" | "processing" | "captured" | "error"
export type ControlMode = "default" | "editing" | "rejected" | "regenerating" | "undone"
export type UploadState = "empty" | "uploading" | "analyzing" | "success" | "error"

// ─── Exported Reusable AI Components ──────────────────────────────────────────

export function AIStatusPill({
  state,
  label,
}: {
  state: "loading" | "success" | "uncertain" | "error"
  label: string
}) {
  const color = STATUS_COLORS[state]
  return (
    <div
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border"
      style={{
        background: `${color}18`,
        borderColor: `${color}40`,
        color,
      }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      <span>{label}</span>
    </div>
  )
}

export function UncertaintyBanner({ message }: { message: string }) {
  return (
    <div
      className="rounded-xl px-3 py-2 text-[10px] leading-snug border"
      style={{
        background: `${STATUS_COLORS.uncertain}15`,
        borderColor: `${STATUS_COLORS.uncertain}40`,
        color: STATUS_COLORS.uncertain,
      }}
    >
      ⚠ {message}
    </div>
  )
}

export function AnimatedStepProgress({
  steps,
  intervalMs = 750,
  onComplete,
}: {
  steps: string[]
  intervalMs?: number
  onComplete?: () => void
}) {
  const [current, setCurrent] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrent((prev) => {
        if (prev < steps.length - 1) return prev + 1
        clearInterval(timer)
        onComplete?.()
        return prev
      })
    }, intervalMs)
    return () => clearInterval(timer)
  }, [steps.length, intervalMs, onComplete])

  return (
    <div className="space-y-2.5">
      {steps.map((s, i) => {
        const done = i < current
        const isCurrent = i === current
        return (
          <div key={s} className="flex items-center gap-2.5">
            <div
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                done
                  ? "bg-green text-white"
                  : isCurrent
                    ? "bg-turquoise text-[#0D0F18]"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {done ? "✓" : i + 1}
            </div>
            <p
              className={`text-xs ${
                done
                  ? "text-green font-medium"
                  : isCurrent
                    ? "text-white font-semibold"
                    : "text-muted-foreground"
              }`}
            >
              {s}
            </p>
            {isCurrent && (
              <span className="w-2 h-2 rounded-full bg-turquoise animate-ping ml-auto" />
            )}
          </div>
        )
      })}
    </div>
  )
}

export function AIErrorBanner({
  title,
  message,
  actions,
}: {
  title: string
  message: string
  actions: { label: string; primary?: boolean; onClick: () => void }[]
}) {
  return (
    <div className="rounded-2xl p-4 bg-red/10 border border-red/30 space-y-2.5">
      <div className="flex items-start gap-2.5">
        <span className="text-red text-base leading-none mt-0.5">⚠</span>
        <div>
          <h4 className="text-xs font-bold text-red">{title}</h4>
          <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{message}</p>
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        {actions.map((act, i) => (
          <button
            key={i}
            type="button"
            onClick={act.onClick}
            className={`flex-1 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              act.primary
                ? "bg-red text-white hover:brightness-110 shadow-sm"
                : "bg-muted text-muted-foreground hover:text-white"
            }`}
          >
            {act.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function ImageUploadWidget({
  state,
  progress,
  result,
  onRetake,
  onManual,
  onSave,
  onCorrect,
}: {
  state: UploadState
  progress: number
  result?: { name: string; hex: string; category: string }
  onRetake: () => void
  onManual: () => void
  onSave: () => void
  onCorrect: () => void
}) {
  if (state === "empty") {
    return (
      <div
        onClick={onRetake}
        className="rounded-2xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-2 py-8 hover:border-turquoise/50 transition-colors cursor-pointer text-muted-foreground"
      >
        <span className="text-3xl">📷</span>
        <p className="text-xs font-semibold text-white">Tap to simulate photo capture</p>
        <p className="text-[10px]">JPEG, PNG · max 10 MB</p>
      </div>
    )
  }

  if (state === "uploading") {
    return (
      <div className="space-y-2 p-4 rounded-2xl bg-card border border-border">
        <div className="flex justify-between text-[11px] text-muted-foreground font-medium">
          <span>Uploading item photo…</span>
          <span className="text-turquoise">{progress}%</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden bg-muted">
          <div
            className="h-full rounded-full bg-turquoise transition-all duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    )
  }

  if (state === "analyzing") {
    return (
      <div className="space-y-2.5 p-4 rounded-2xl bg-card border border-border">
        <div className="flex items-center gap-2 text-turquoise text-xs font-semibold">
          <span className="w-2 h-2 rounded-full bg-turquoise animate-ping" />
          <span>Analyzing RGB and CIELAB color harmony…</span>
        </div>
        <div className="space-y-1">
          {["Extracting dominant garment hue", "Clustering against palette swatches"].map(
            (msg, i) => (
              <p key={i} className="text-[10px] text-muted-foreground">
                • {msg}
              </p>
            ),
          )}
        </div>
      </div>
    )
  }

  if (state === "success" && result) {
    return (
      <div className="space-y-3 p-4 rounded-2xl bg-card border border-border">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl shadow-md border border-white/20 shrink-0"
            style={{ background: result.hex }}
          />
          <div className="flex-1 min-w-0">
            <h4 className="text-xs font-bold text-white truncate">{result.name}</h4>
            <p className="text-[10px] text-muted-foreground">{result.category} · {result.hex}</p>
          </div>
          <span className="text-green text-xs font-bold">✓ Identified</span>
        </div>
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onSave}
            className="flex-1 py-2 rounded-xl text-xs font-bold bg-green text-white hover:brightness-110 transition-all shadow-sm"
          >
            Confirm & Save
          </button>
          <button
            type="button"
            onClick={onCorrect}
            className="px-3 py-2 rounded-xl text-xs font-semibold bg-muted text-muted-foreground hover:text-white transition-colors"
          >
            Correct Color
          </button>
        </div>
      </div>
    )
  }

  return null
}

export function PulseOrb({
  label,
  color = THEME_COLORS.pink,
}: {
  label: string
  color?: string
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <div className="relative w-14 h-14">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="absolute inset-0 rounded-full animate-ping opacity-20"
            style={{
              background: color,
              animationDelay: `${i * 400}ms`,
              animationDuration: "1.5s",
              transform: `scale(${1 + i * 0.25})`,
            }}
          />
        ))}
        <div
          className="absolute inset-0 rounded-full flex items-center justify-center shadow-lg"
          style={{ background: color }}
        >
          <span className="text-lg text-white">✧</span>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

export function UserControlBar({
  mode,
  approveLabel = "Approve",
  onApprove,
  onEdit,
  onReject,
  onRegenerate,
  onUndo,
  onWhy,
  showWhy = false,
}: {
  mode: ControlMode
  approveLabel?: string
  onApprove: () => void
  onEdit: () => void
  onReject: () => void
  onRegenerate: () => void
  onUndo: () => void
  onWhy?: () => void
  showWhy?: boolean
}) {
  return (
    <div className="space-y-2 pt-1">
      <button
        type="button"
        onClick={onApprove}
        className="w-full py-2.5 rounded-xl text-xs font-bold bg-pink text-white hover:brightness-110 transition-all shadow-md shadow-pink/20"
      >
        {approveLabel}
      </button>

      <div className="grid grid-cols-4 gap-1.5">
        <button
          type="button"
          onClick={onEdit}
          className={`py-2 rounded-xl text-[10px] font-semibold flex flex-col items-center gap-0.5 border transition-all ${
            mode === "editing"
              ? "bg-turquoise text-[#0D0F18] border-turquoise font-bold"
              : "bg-muted text-muted-foreground border-border hover:text-white"
          }`}
        >
          <span>✏</span>Edit
        </button>
        <button
          type="button"
          onClick={onReject}
          className={`py-2 rounded-xl text-[10px] font-semibold flex flex-col items-center gap-0.5 border transition-all ${
            mode === "rejected"
              ? "bg-red text-white border-red font-bold"
              : "bg-muted text-muted-foreground border-border hover:text-white"
          }`}
        >
          <span>✕</span>Reject
        </button>
        <button
          type="button"
          onClick={onRegenerate}
          className={`py-2 rounded-xl text-[10px] font-semibold flex flex-col items-center gap-0.5 border transition-all ${
            mode === "regenerating"
              ? "bg-turquoise text-[#0D0F18] border-turquoise font-bold"
              : "bg-muted text-muted-foreground border-border hover:text-white"
          }`}
        >
          <span>↺</span>Redo
        </button>
        <button
          type="button"
          onClick={onUndo}
          className={`py-2 rounded-xl text-[10px] font-semibold flex flex-col items-center gap-0.5 border transition-all ${
            mode === "undone"
              ? "bg-green text-white border-green font-bold"
              : "bg-muted text-muted-foreground border-border hover:text-white"
          }`}
        >
          <span>↩</span>Undo
        </button>
      </div>

      {showWhy && onWhy && (
        <button
          type="button"
          onClick={onWhy}
          className="w-full py-1.5 rounded-xl text-[10px] font-semibold bg-muted text-muted-foreground hover:text-white transition-colors"
        >
          Why this outfit?
        </button>
      )}
    </div>
  )
}