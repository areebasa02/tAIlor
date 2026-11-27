import { useEffect, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  icon?: ReactNode
  children: ReactNode
  footer?: ReactNode
  titleId?: string
}

export function BottomSheet({
  open,
  onClose,
  title,
  subtitle,
  icon,
  children,
  footer,
  titleId = "bottom-sheet-title",
}: BottomSheetProps) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-[3px] animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="bottom-sheet-enter w-full max-w-[540px] sm:max-w-[440px] max-h-[86dvh] flex flex-col rounded-t-[26px] sm:rounded-[26px] border-t sm:border border-border bg-card shadow-2xl overflow-hidden"
        style={{
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {/* Top grab handle (mobile) */}
        <div className="flex justify-center pt-2.5 pb-1 sm:hidden shrink-0">
          <span
            aria-hidden="true"
            className="w-10 h-1 rounded-full bg-foreground/15"
          />
        </div>

        {/* Sheet Header */}
        <div className="flex items-start justify-between gap-3 px-5 pt-2 sm:pt-4 pb-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            {icon && (
              <span className="w-8 h-8 rounded-xl bg-muted border border-border flex items-center justify-center text-foreground shrink-0">
                {icon}
              </span>
            )}
            <div className="min-w-0">
              <h2
                id={titleId}
                className="font-editorial text-lg font-bold text-foreground leading-tight truncate"
              >
                {title}
              </h2>
              {subtitle && (
                <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${title}`}
            className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>

        {/* Scrollable Sheet Body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
          {children}
        </div>

        {/* Optional Sticky Footer in Thumb Zone */}
        {footer && (
          <div className="px-5 py-3 border-t border-border bg-card/95 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
