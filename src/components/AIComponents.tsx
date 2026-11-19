import { useState, useEffect } from "react"
import { CATEGORY_LABELS, WARDROBE_CATEGORIES } from "../lib/garmentCategories"
import type { WardrobeScanItem } from "../lib/wardrobeScan"
import type { Category } from "../types"
import { THEME_COLORS } from "../types/theme"

// ─── Exported Types ───────────────────────────────────────────────────────────
export type VoiceState = "idle" | "listening" | "processing" | "captured" | "error"
export type ControlMode = "default" | "editing" | "rejected" | "regenerating" | "undone"
export type UploadState = "empty" | "uploading" | "analyzing" | "success" | "error"
export type ScanIssueId = "name" | "category" | "color" | "material" | "details" | "all"

export const SCAN_ISSUE_OPTIONS: { id: ScanIssueId; label: string }[] = [
  { id: "name", label: "Garment name" },
  { id: "category", label: "Category" },
  { id: "color", label: "Color" },
  { id: "material", label: "Fabric / material" },
  { id: "details", label: "Care & storage" },
  { id: "all", label: "Multiple / everything" },
]

// ─── Exported Reusable AI Components ──────────────────────────────────────────

const STATUS_CLASS_MAP = {
  loading: "bg-turquoise/15 border-turquoise/40 text-turquoise",
  success: "bg-green/15 border-green/40 text-green",
  uncertain: "bg-gold/15 border-gold/40 text-gold",
  error: "bg-red/15 border-red/40 text-red",
} as const

export function AIStatusPill({
  state,
  label,
}: {
  state: "loading" | "success" | "uncertain" | "error"
  label: string
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${STATUS_CLASS_MAP[state]}`}
    >
      <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-current" />
      <span>{label}</span>
    </div>
  )
}

export function UncertaintyBanner({ message }: { message: string }) {
  return (
    <div
      role="status"
      className="rounded-xl px-3 py-2 text-[11px] leading-snug border bg-gold/15 border-gold/40 text-gold font-semibold"
    >
      <span aria-hidden="true">⚠ </span>
      {message}
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
    <div role="status" aria-live="polite" className="space-y-2.5">
      {steps.map((s, i) => {
        const done = i < current
        const isCurrent = i === current
        return (
          <div key={s} className="flex items-center gap-2.5">
            <div
              aria-hidden="true"
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                done
                  ? "bg-green text-white"
                  : isCurrent
                    ? "bg-turquoise text-accent-foreground"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {done ? "✓" : i + 1}
            </div>
            <p
              className={`text-xs ${
                done
                  ? "text-green font-semibold"
                  : isCurrent
                    ? "text-foreground font-semibold"
                    : "text-muted-foreground"
              }`}
            >
              {s}
            </p>
            {isCurrent && (
              <span aria-hidden="true" className="w-2 h-2 rounded-full bg-turquoise animate-ping ml-auto" />
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
    <div
      role="alert"
      aria-live="assertive"
      className="rounded-2xl p-4 bg-red/10 border border-red/35 space-y-2.5"
    >
      <div className="flex items-start gap-2.5">
        <span aria-hidden="true" className="text-red text-base leading-none mt-0.5">
          ⚠
        </span>
        <div>
          <h3 className="text-xs font-bold text-red">{title}</h3>
          <p className="text-[11px] text-foreground mt-0.5 leading-relaxed">{message}</p>
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        {actions.map((act, i) => (
          <button
            key={i}
            type="button"
            onClick={act.onClick}
            className={`flex-1 min-h-[40px] py-2 px-3 rounded-xl text-xs font-semibold transition-all border ${
              act.primary
                ? "bg-red text-white border-red hover:brightness-110 shadow-sm"
                : "bg-muted text-foreground border-border hover:brightness-95"
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
  errorMessage,
  emptyLabel = "Tap to upload a garment photo",
  analyzingLabel = "Qwen2.5-VL detecting silhouette, hue & fabric…",
  onFileSelected,
  onRetake,
  onManual,
  onSave,
  onCorrect,
  isCorrecting = false,
}: {
  state: UploadState
  progress: number
  result?: { name: string; hex: string; category: string; material?: string; source?: string }
  errorMessage?: string
  emptyLabel?: string
  analyzingLabel?: string
  onFileSelected?: (file: File) => void
  onRetake: () => void
  onManual: () => void
  onSave: () => void
  onCorrect: () => void
  isCorrecting?: boolean
}) {
  if (state === "empty") {
    if (onFileSelected) {
      return (
        <label className="w-full rounded-2xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-2 py-6 hover:border-turquoise/50 transition-colors cursor-pointer text-muted-foreground">
          <span aria-hidden="true" className="text-3xl">📷</span>
          <span className="text-xs font-semibold text-foreground">{emptyLabel}</span>
          <span className="text-[10px]">JPEG, PNG · max 10 MB</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ""
              if (file) onFileSelected(file)
              else onRetake()
            }}
          />
        </label>
      )
    }

    return (
      <button
        type="button"
        onClick={onRetake}
        aria-label={`${emptyLabel} (JPEG or PNG up to 10 MB)`}
        className="w-full rounded-2xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-2 py-5 hover:border-turquoise/50 transition-colors text-muted-foreground cursor-pointer"
      >
        <span aria-hidden="true" className="text-3xl">📷</span>
        <span className="text-xs font-semibold text-foreground">{emptyLabel}</span>
        <span className="text-[10px]">JPEG, PNG · max 10 MB</span>
      </button>
    )
  }

  if (state === "uploading") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="space-y-2 p-4 rounded-2xl bg-card border border-border"
      >
        <div className="flex justify-between text-[11px] text-muted-foreground font-medium">
          <span>Uploading item photo…</span>
          <span className="text-turquoise font-bold">{progress}%</span>
        </div>
        <div
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Uploading item photo"
          className="h-1.5 rounded-full overflow-hidden bg-muted"
        >
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
      <div
        role="status"
        aria-live="polite"
        className="space-y-2.5 p-4 rounded-2xl bg-card border border-border"
      >
        <div className="flex items-center gap-2 text-turquoise text-xs font-semibold">
          <span aria-hidden="true" className="w-2 h-2 rounded-full bg-turquoise animate-ping" />
          <span>{analyzingLabel}</span>
        </div>
        <div className="space-y-1">
          {[
            "Detecting garment silhouette / category",
            "Reading dominant hue",
            "Estimating fabric & care tags",
          ].map((msg, i) => (
            <p key={i} className="text-[10px] text-muted-foreground">
              • {msg}
            </p>
          ))}
        </div>
      </div>
    )
  }

  if (state === "error") {
    return (
      <AIErrorBanner
        title="Wardrobe scan failed"
        message={
          errorMessage ||
          "Could not reach the vision model. Use a quick-test sample, try again, or enter details manually."
        }
        actions={[
          { label: "Try again", primary: true, onClick: onRetake },
          { label: "Enter manually", onClick: onManual },
        ]}
      />
    )
  }

  if (state === "success" && result) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="space-y-3 p-4 rounded-2xl bg-card border border-border"
      >
        <div className="flex items-center gap-3">
          <div
            role="img"
            aria-label={`Identified ${result.name} color swatch`}
            className="w-10 h-10 rounded-xl shadow-md border border-border shrink-0"
            style={{ background: result.hex }}
          />
          <div className="flex-1 min-w-0">
            <h3 className="text-xs font-bold text-foreground truncate">{result.name}</h3>
            <p className="text-[10px] text-muted-foreground">
              {result.category} · {result.hex}
              {result.material ? ` · ${result.material}` : ""}
            </p>
            {result.source && (
              <p className="text-[9px] text-muted-foreground/80 mt-0.5">
                Source: {result.source}
              </p>
            )}
          </div>
          <span className="text-green text-xs font-bold shrink-0">
            <span aria-hidden="true">✓ </span>Identified
          </span>
        </div>
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onSave}
            className="flex-1 min-h-[40px] py-2 rounded-xl text-xs font-bold bg-green text-white hover:brightness-110 transition-all shadow-sm cursor-pointer"
          >
            Confirm &amp; Save
          </button>
          <button
            type="button"
            onClick={onCorrect}
            aria-expanded={isCorrecting}
            className={`min-h-[40px] px-3 py-2 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
              isCorrecting
                ? "bg-turquoise/15 text-foreground border-turquoise"
                : "bg-muted text-foreground border-border hover:brightness-95"
            }`}
          >
            {isCorrecting ? "Correcting…" : "Correct"}
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
    <div role="status" aria-live="polite" className="flex flex-col items-center gap-3 py-2">
      <div aria-hidden="true" className="relative w-14 h-14">
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

export function WhyItWorksDisclosure({
  rationale,
  onDeepDive,
}: {
  rationale: string
  onDeepDive?: () => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-xl border-2 border-border bg-muted/60 overflow-hidden text-xs min-[380px]:text-[13px] transition-all">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="w-full px-3 py-2.5 font-extrabold text-pink flex items-center justify-between text-left hover:bg-muted transition-colors cursor-pointer min-h-[44px]"
      >
        <span className="flex items-center gap-2">
          <span aria-hidden="true">💡</span>
          <span>Why it works</span>
        </span>
        <span
          aria-hidden="true"
          className={`text-muted-foreground font-black text-xs transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        >
          ▼
        </span>
      </button>
      {open && (
        <div className="px-3 pb-2.5 pt-1 text-foreground/90 font-medium border-t border-border/40 leading-snug space-y-2 animate-in fade-in duration-150">
          <p>{rationale}</p>
          {onDeepDive && (
            <button
              type="button"
              onClick={onDeepDive}
              className="text-[11px] font-extrabold text-turquoise hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>Full breakdown</span>
              <span aria-hidden="true">→</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export function OutfitFeedbackModal({
  isOpen,
  onClose,
  outfitLabel,
  onSaveFeedback,
  onRegenerateWithFeedback,
}: {
  isOpen: boolean
  onClose: () => void
  outfitLabel: string
  onSaveFeedback: (notes: string, reasons: string[]) => void
  onRegenerateWithFeedback?: (notes: string, reasons: string[]) => void
}) {
  const [selectedReasons, setSelectedReasons] = useState<string[]>([])
  const [customNotes, setCustomNotes] = useState("")

  useEffect(() => {
    if (isOpen) {
      setSelectedReasons([])
      setCustomNotes("")
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const chipOptions = [
    "Too formal",
    "Too casual",
    "Weather mismatch",
    "Colors clash",
    "Uncomfortable fit",
    "Sensory discomfort",
  ]

  const toggleReason = (reason: string) => {
    setSelectedReasons((prev) =>
      prev.includes(reason) ? prev.filter((r) => r !== reason) : [...prev, reason]
    )
  }

  const handleSaveOnly = () => {
    onSaveFeedback(customNotes, selectedReasons)
    onClose()
  }

  const handleSaveAndRegenerate = () => {
    onSaveFeedback(customNotes, selectedReasons)
    if (onRegenerateWithFeedback) {
      onRegenerateWithFeedback(customNotes, selectedReasons)
    }
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="outfit-feedback-title"
        className="rounded-3xl p-4 sm:p-5 max-w-sm w-full max-h-[90dvh] overflow-y-auto space-y-3.5 shadow-2xl border-2"
        style={{ background: "var(--card)", borderColor: "var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-2 border-b border-border">
          <div>
            <h2 id="outfit-feedback-title" className="text-base font-black text-foreground">
              Outfit Feedback
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Why doesn&apos;t &ldquo;{outfitLabel}&rdquo; work?
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close feedback modal"
            className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted text-sm font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-bold text-foreground">Quick reasons:</p>
          <div className="flex flex-wrap gap-1.5">
            {chipOptions.map((reason) => {
              const active = selectedReasons.includes(reason)
              return (
                <button
                  key={reason}
                  type="button"
                  onClick={() => toggleReason(reason)}
                  aria-pressed={active}
                  className={`text-xs font-bold px-2.5 py-1.5 rounded-lg border-2 transition-all cursor-pointer ${
                    active
                      ? "bg-pink text-white border-pink shadow-xs"
                      : "bg-muted text-foreground border-border hover:border-pink/50"
                  }`}
                >
                  {reason}
                </button>
              )
            })}
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="outfit-feedback-notes" className="text-xs font-bold text-foreground block">
            Specific notes for AI stylist:
          </label>
          <textarea
            id="outfit-feedback-notes"
            rows={3}
            value={customNotes}
            onChange={(e) => setCustomNotes(e.target.value)}
            placeholder="Notes on why this outfit doesn't work for your needs..."
            className="w-full rounded-xl p-2.5 text-xs text-foreground bg-muted border-2 border-border focus:border-pink outline-none resize-none"
          />
        </div>

        <div className="flex flex-col gap-2 pt-1">
          {onRegenerateWithFeedback && (
            <button
              type="button"
              onClick={handleSaveAndRegenerate}
              className="w-full min-h-[44px] py-2.5 px-3 rounded-xl text-xs font-extrabold bg-pink text-white border-2 border-[#0D0F18]/20 hover:brightness-110 active:scale-95 transition-all shadow-sm cursor-pointer"
            >
              Save &amp; Update Look →
            </button>
          )}
          <button
            type="button"
            onClick={handleSaveOnly}
            className="w-full min-h-[44px] py-2.5 px-3 rounded-xl text-xs font-bold bg-muted text-foreground border-2 border-border hover:border-turquoise active:scale-95 transition-all cursor-pointer"
          >
            Save Notes
          </button>
        </div>
      </div>
    </div>
  )
}

export function GarmentFeedbackModal({
  isOpen,
  onClose,
  garmentDesc,
  garmentType,
  garmentColor,
  onSaveFeedback,
  onSwapWithFeedback,
}: {
  isOpen: boolean
  onClose: () => void
  garmentDesc: string
  garmentType: string
  garmentColor?: string
  onSaveFeedback: (notes: string, reasons: string[]) => void
  onSwapWithFeedback?: (notes: string, reasons: string[]) => void
}) {
  const [selectedReasons, setSelectedReasons] = useState<string[]>([])
  const [customNotes, setCustomNotes] = useState("")

  useEffect(() => {
    if (isOpen) {
      setSelectedReasons([])
      setCustomNotes("")
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const chipOptions = [
    "Itchy / Uncomfortable",
    "Fit issue (tight/loose)",
    "Too warm / cool",
    "Dislike cut / style",
    "Needs wash",
    "Doesn't match other pieces",
  ]

  const toggleReason = (reason: string) => {
    setSelectedReasons((prev) =>
      prev.includes(reason) ? prev.filter((r) => r !== reason) : [...prev, reason]
    )
  }

  const handleSaveOnly = () => {
    onSaveFeedback(customNotes, selectedReasons)
    onClose()
  }

  const handleSaveAndSwap = () => {
    onSaveFeedback(customNotes, selectedReasons)
    if (onSwapWithFeedback) {
      onSwapWithFeedback(customNotes, selectedReasons)
    }
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="garment-feedback-title"
        className="rounded-3xl p-4 sm:p-5 max-w-sm w-full max-h-[90dvh] overflow-y-auto space-y-3.5 shadow-2xl border-2"
        style={{ background: "var(--card)", borderColor: "var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-2 border-b border-border">
          <div>
            <h2 id="garment-feedback-title" className="text-base font-black text-foreground">
              Garment Feedback
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Why doesn&apos;t this item work?
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close feedback modal"
            className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted text-sm font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Piece preview */}
        <div className="flex items-center gap-2.5 p-2 rounded-xl bg-muted border border-border">
          {garmentColor && (
            <span
              aria-hidden="true"
              className="w-4 h-4 rounded-full border border-foreground/30 shrink-0"
              style={{ backgroundColor: garmentColor }}
            />
          )}
          <div className="min-w-0 flex-1">
            <span className="text-[10px] font-black uppercase text-muted-foreground block">
              {garmentType}
            </span>
            <p className="text-xs font-bold text-foreground truncate">{garmentDesc}</p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-bold text-foreground">Why does it not work?</p>
          <div className="flex flex-wrap gap-1.5">
            {chipOptions.map((reason) => {
              const active = selectedReasons.includes(reason)
              return (
                <button
                  key={reason}
                  type="button"
                  onClick={() => toggleReason(reason)}
                  aria-pressed={active}
                  className={`text-xs font-bold px-2.5 py-1.5 rounded-lg border-2 transition-all cursor-pointer ${
                    active
                      ? "bg-turquoise text-accent-foreground border-turquoise shadow-xs"
                      : "bg-muted text-foreground border-border hover:border-turquoise/50"
                  }`}
                >
                  {reason}
                </button>
              )
            })}
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="garment-feedback-notes" className="text-xs font-bold text-foreground block">
            Item notes / preferences:
          </label>
          <textarea
            id="garment-feedback-notes"
            rows={3}
            value={customNotes}
            onChange={(e) => setCustomNotes(e.target.value)}
            placeholder="Notes on why this item doesn't work for you..."
            className="w-full rounded-xl p-2.5 text-xs text-foreground bg-muted border-2 border-border focus:border-turquoise outline-none resize-none"
          />
        </div>

        <div className="flex flex-col gap-2 pt-1">
          {onSwapWithFeedback && (
            <button
              type="button"
              onClick={handleSaveAndSwap}
              className="w-full min-h-[44px] py-2.5 px-3 rounded-xl text-xs font-extrabold bg-turquoise text-accent-foreground border-2 border-[#0D0F18]/20 hover:brightness-110 active:scale-95 transition-all shadow-sm cursor-pointer"
            >
              Save &amp; Swap Piece ↺
            </button>
          )}
          <button
            type="button"
            onClick={handleSaveOnly}
            className="w-full min-h-[44px] py-2.5 px-3 rounded-xl text-xs font-bold bg-muted text-foreground border-2 border-border hover:border-turquoise active:scale-95 transition-all cursor-pointer"
          >
            Save Notes
          </button>
        </div>
      </div>
    </div>
  )
}

export function UserControlBar({
  mode = "default",
  approveLabel = "Wear This Now",
  onApprove,
  onEdit: _onEdit,
  onReject,
  onRegenerate,
  onUndo: _onUndo,
  onWhy: _onWhy,
  showWhy: _showWhy = false,
  onFavorite,
  isFavorite = false,
}: {
  mode?: ControlMode
  approveLabel?: string
  onApprove: () => void
  onEdit?: () => void
  onReject: () => void
  onRegenerate: () => void
  onUndo?: () => void
  onWhy?: () => void
  showWhy?: boolean
  onFavorite?: () => void
  isFavorite?: boolean
}) {
  return (
    <div className="space-y-2 pt-1">
      {/* Enlarged Wear This Now primary action */}
      <button
        type="button"
        onClick={onApprove}
        className="w-full min-h-[54px] py-3.5 px-5 rounded-2xl text-base min-[380px]:text-lg font-black tracking-wide bg-pink text-white border-2 border-[#0D0F18]/20 dark:border-white/25 hover:brightness-110 active:scale-[0.98] transition-all shadow-lg shadow-pink/30 flex items-center justify-center gap-2 cursor-pointer"
      >
        {approveLabel}
      </button>

      {mode === "editing" && (
        <div
          role="status"
          className="rounded-xl px-3 py-2 text-xs font-bold bg-turquoise/15 border-2 border-turquoise text-foreground flex items-center gap-2"
        >
          <span aria-hidden="true">👆</span>
          <span>Tap Swap next to any piece above to pick a different item.</span>
        </div>
      )}

      {/* Exactly 3 side-by-side buttons in a single row */}
      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Outfit actions">
        {/* 1. Dislike */}
        <button
          type="button"
          onClick={onReject}
          aria-pressed={mode === "rejected"}
          aria-label="Dislike outfit"
          className={`min-h-[46px] py-2 px-1.5 rounded-xl text-xs min-[380px]:text-[13px] font-extrabold flex items-center justify-center gap-1 border-2 transition-all cursor-pointer ${
            mode === "rejected"
              ? "bg-red text-white border-red shadow-xs"
              : "bg-card text-foreground border-border shadow-2xs hover:border-red hover:text-red active:scale-95"
          }`}
        >
          <span aria-hidden="true" className={mode === "rejected" ? "" : "text-red font-black"}>✕</span>
          <span>Dislike</span>
        </button>

        {/* 2. New Look */}
        <button
          type="button"
          onClick={onRegenerate}
          aria-pressed={mode === "regenerating"}
          aria-label="Generate new look"
          className={`min-h-[46px] py-2 px-1.5 rounded-xl text-xs min-[380px]:text-[13px] font-extrabold flex items-center justify-center gap-1 border-2 transition-all cursor-pointer ${
            mode === "regenerating"
              ? "bg-turquoise text-accent-foreground border-[#0D0F18]/30 shadow-xs"
              : "bg-card text-foreground border-border shadow-2xs hover:border-pink active:scale-95"
          }`}
        >
          <span aria-hidden="true" className={mode === "regenerating" ? "" : "text-pink font-black"}>↺</span>
          <span>New Look</span>
        </button>

        {/* 3. ❤️ Favorite */}
        <button
          type="button"
          onClick={onFavorite}
          aria-pressed={isFavorite}
          aria-label={isFavorite ? "Remove outfit from favorites" : "Add outfit to favorites"}
          className={`min-h-[46px] py-2 px-1.5 rounded-xl text-xs min-[380px]:text-[13px] font-extrabold flex items-center justify-center gap-1 border-2 transition-all cursor-pointer active:scale-95 ${
            isFavorite
              ? "bg-pink/15 text-pink border-pink shadow-xs"
              : "bg-card text-foreground border-border shadow-2xs hover:border-pink"
          }`}
        >
          <span aria-hidden="true">❤️</span>
          <span>Favorite</span>
        </button>
      </div>
    </div>
  )
}

const SCAN_CATEGORIES: Category[] = WARDROBE_CATEGORIES

export function WardrobeScanCorrectionModal({
  isOpen,
  onClose,
  onBack,
  detectedItem,
  imagePreview,
  issueIds,
  issueNote,
  onApplyPreview,
  onSaveCorrected,
}: {
  isOpen: boolean
  onClose: () => void
  onBack: () => void
  detectedItem: WardrobeScanItem
  imagePreview?: string
  issueIds: ScanIssueId[]
  issueNote: string
  onApplyPreview: (corrected: WardrobeScanItem) => void
  onSaveCorrected: (corrected: WardrobeScanItem) => void
}) {
  const [name, setName] = useState(detectedItem.name)
  const [category, setCategory] = useState<Category>(detectedItem.category)
  const [colorName, setColorName] = useState(detectedItem.colorName)
  const [colorHex, setColorHex] = useState(detectedItem.color)
  const [material, setMaterial] = useState(detectedItem.material)
  const [careInstructions, setCareInstructions] = useState(
    detectedItem.careInstructions
  )
  const [storageLocation, setStorageLocation] = useState(
    detectedItem.storageLocation
  )
  const [sentimentalValue, setSentimentalValue] = useState<
    "Low" | "Medium" | "High"
  >(detectedItem.sentimentalValue || "Medium")
  const [cost, setCost] = useState(detectedItem.cost || "$40")
  const [showAllFields, setShowAllFields] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setName(detectedItem.name)
    setCategory(detectedItem.category)
    setColorName(detectedItem.colorName)
    setColorHex(
      /^#[0-9A-Fa-f]{6}$/.test(detectedItem.color)
        ? detectedItem.color
        : "#888888"
    )
    setMaterial(detectedItem.material)
    setCareInstructions(detectedItem.careInstructions)
    setStorageLocation(detectedItem.storageLocation)
    setSentimentalValue(detectedItem.sentimentalValue || "Medium")
    setCost(detectedItem.cost || "$40")
    setShowAllFields(issueIds.includes("all") || issueIds.length === 0)
  }, [isOpen, detectedItem, issueIds])

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const showName = showAllFields || issueIds.includes("name")
  const showCategory = showAllFields || issueIds.includes("category")
  const showColor = showAllFields || issueIds.includes("color")
  const showMaterial = showAllFields || issueIds.includes("material")
  const showDetails = showAllFields || issueIds.includes("details")

  const flaggedLabels = SCAN_ISSUE_OPTIONS.filter((opt) =>
    issueIds.includes(opt.id)
  ).map((opt) => opt.label)

  const buildCorrectedItem = (): WardrobeScanItem => ({
    ...detectedItem,
    name: name.trim() || detectedItem.name || "Corrected garment",
    category,
    color: /^#[0-9A-Fa-f]{6}$/.test(colorHex.trim())
      ? colorHex.trim().toUpperCase()
      : detectedItem.color,
    colorName: colorName.trim() || detectedItem.colorName || "Custom Color",
    material: material.trim() || detectedItem.material || "Breathable fabric",
    careInstructions:
      careInstructions.trim() ||
      detectedItem.careInstructions ||
      "Gentle wash",
    storageLocation:
      storageLocation.trim() ||
      detectedItem.storageLocation ||
      "Closet · Main Rack",
    sentimentalValue,
    cost: cost.trim() || detectedItem.cost || "$40",
    confidence: 1,
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSaveCorrected(buildCorrectedItem())
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="scan-correction-modal-title"
        className="rounded-3xl p-4 sm:p-5 max-w-sm w-full max-h-[90dvh] overflow-y-auto space-y-3.5 shadow-2xl border-2"
        style={{ background: "var(--card)", borderColor: "var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 pb-2 border-b border-border">
          <div className="min-w-0">
            <h2
              id="scan-correction-modal-title"
              className="text-base font-black text-foreground"
            >
              Correct Scan Details
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Update what the AI missed before saving.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close correction popup"
            className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted text-sm font-bold shrink-0 cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Uploaded garment preview + summary of what was flagged */}
        <div className="flex items-center gap-3 p-2.5 rounded-2xl bg-muted border border-border">
          {imagePreview ? (
            <img
              src={imagePreview}
              alt={name || detectedItem.name}
              className="w-12 h-12 rounded-xl object-contain bg-card border border-border shrink-0"
            />
          ) : (
            <div
              aria-hidden="true"
              className="w-12 h-12 rounded-xl border border-border shrink-0"
              style={{ backgroundColor: colorHex }}
            />
          )}
          <div className="min-w-0 flex-1 space-y-0.5">
            {flaggedLabels.length > 0 && (
              <p className="text-[11px] font-extrabold text-pink leading-snug">
                Fixing: {flaggedLabels.join(", ")}
              </p>
            )}
            {issueNote.trim() && (
              <p className="text-[11px] text-muted-foreground leading-snug break-words">
                &ldquo;{issueNote.trim()}&rdquo;
              </p>
            )}
            {flaggedLabels.length === 0 && !issueNote.trim() && (
              <p className="text-[11px] text-muted-foreground leading-snug">
                Edit any incorrect details below.
              </p>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {showName && (
            <div className="space-y-1">
              <label
                htmlFor="corr-garment-name"
                className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground block"
              >
                Garment Name *
              </label>
              <input
                id="corr-garment-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Navy Knit Cardigan"
                className="w-full min-h-[40px] rounded-xl px-3 py-2 text-xs font-semibold text-foreground bg-muted border-2 border-turquoise/60 focus:border-pink outline-none"
              />
            </div>
          )}

          {showCategory && (
            <div className="space-y-1">
              <label
                htmlFor="corr-garment-category"
                className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground block"
              >
                Category *
              </label>
              <select
                id="corr-garment-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as Category)}
                className="w-full min-h-[40px] rounded-xl px-3 py-2 text-xs font-semibold text-foreground bg-muted border-2 border-turquoise/60 focus:border-pink outline-none"
              >
                {SCAN_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>
          )}

          {showColor && (
            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <label
                  htmlFor="corr-color-name"
                  className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground block"
                >
                  Color Name
                </label>
                <input
                  id="corr-color-name"
                  value={colorName}
                  onChange={(e) => setColorName(e.target.value)}
                  placeholder="e.g. Deep Navy"
                  className="w-full min-h-[40px] rounded-xl px-3 py-2 text-xs font-semibold text-foreground bg-muted border-2 border-turquoise/60 focus:border-pink outline-none"
                />
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="corr-color-hex"
                  className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground block"
                >
                  Color Swatch
                </label>
                <div className="flex items-center gap-2 min-h-[40px] px-2.5 rounded-xl bg-muted border-2 border-turquoise/60">
                  <input
                    id="corr-color-hex"
                    type="color"
                    aria-label="Pick corrected color swatch"
                    value={/^#[0-9A-Fa-f]{6}$/.test(colorHex) ? colorHex : "#888888"}
                    onChange={(e) => setColorHex(e.target.value.toUpperCase())}
                    className="w-7 h-7 rounded-lg cursor-pointer bg-transparent border border-border shrink-0"
                  />
                  <span className="text-xs font-mono font-bold text-foreground truncate">
                    {colorHex.toUpperCase()}
                  </span>
                </div>
              </div>
            </div>
          )}

          {showMaterial && (
            <div className="space-y-1">
              <label
                htmlFor="corr-material"
                className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground block"
              >
                Fabric / Material
              </label>
              <input
                id="corr-material"
                value={material}
                onChange={(e) => setMaterial(e.target.value)}
                placeholder="e.g. 100% Cotton Knit"
                className="w-full min-h-[40px] rounded-xl px-3 py-2 text-xs font-semibold text-foreground bg-muted border-2 border-turquoise/60 focus:border-pink outline-none"
              />
            </div>
          )}

          {showDetails && (
            <div className="space-y-2.5">
              <div className="space-y-1">
                <label
                  htmlFor="corr-care"
                  className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground block"
                >
                  Care Instructions
                </label>
                <input
                  id="corr-care"
                  value={careInstructions}
                  onChange={(e) => setCareInstructions(e.target.value)}
                  placeholder="e.g. Cold gentle wash · hang dry"
                  className="w-full min-h-[40px] rounded-xl px-3 py-2 text-xs font-semibold text-foreground bg-muted border-2 border-border focus:border-pink outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label
                    htmlFor="corr-storage"
                    className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground block"
                  >
                    Storage
                  </label>
                  <input
                    id="corr-storage"
                    value={storageLocation}
                    onChange={(e) => setStorageLocation(e.target.value)}
                    placeholder="Closet · Main Rack"
                    className="w-full min-h-[40px] rounded-xl px-3 py-2 text-xs font-semibold text-foreground bg-muted border-2 border-border focus:border-pink outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="corr-sentimental"
                    className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground block"
                  >
                    Value &amp; Cost
                  </label>
                  <div className="flex gap-1.5">
                    <select
                      id="corr-sentimental"
                      aria-label="Sentimental value"
                      value={sentimentalValue}
                      onChange={(e) =>
                        setSentimentalValue(
                          e.target.value as "Low" | "Medium" | "High"
                        )
                      }
                      className="flex-1 min-w-0 min-h-[40px] rounded-xl px-2 py-2 text-xs font-semibold text-foreground bg-muted border-2 border-border focus:border-pink outline-none"
                    >
                      <option value="Low">Low</option>
                      <option value="Medium">Med</option>
                      <option value="High">High</option>
                    </select>
                    <input
                      aria-label="Estimated cost"
                      value={cost}
                      onChange={(e) => setCost(e.target.value)}
                      placeholder="$40"
                      className="w-16 min-h-[40px] rounded-xl px-2 py-2 text-xs font-semibold text-foreground bg-muted border-2 border-border focus:border-pink outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {!issueIds.includes("all") && issueIds.length > 0 && (
            <button
              type="button"
              onClick={() => setShowAllFields((prev) => !prev)}
              className="text-[11px] font-extrabold text-turquoise hover:underline cursor-pointer"
            >
              {showAllFields
                ? "Hide extra fields"
                : "+ Edit other garment details"}
            </button>
          )}

          <div className="flex flex-col gap-2 pt-1 border-t border-border">
            <button
              type="submit"
              className="w-full min-h-[44px] py-2.5 px-3 rounded-xl text-xs font-black bg-green text-white border-2 border-[#0D0F18]/20 hover:brightness-110 active:scale-95 transition-all shadow-sm cursor-pointer"
            >
              Save Corrected Item to Wardrobe
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onBack}
                className="min-h-[40px] py-2 px-3 rounded-xl text-xs font-bold bg-muted text-foreground border-2 border-border hover:border-pink cursor-pointer"
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={() => onApplyPreview(buildCorrectedItem())}
                className="min-h-[40px] py-2 px-3 rounded-xl text-xs font-bold bg-muted text-foreground border-2 border-border hover:border-turquoise cursor-pointer"
              >
                Update Preview
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
