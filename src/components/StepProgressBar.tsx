import { Check } from "lucide-react"

export interface StepItem {
  id: string
  label: string
  onClick?: () => void
}

export function StepProgressBar({
  steps,
  activeIndex,
  ariaLabel = "Progress steps",
}: {
  steps: StepItem[]
  activeIndex: number
  ariaLabel?: string
}) {
  return (
    <nav aria-label={ariaLabel} className="flex items-center gap-1.5 py-0.5">
      {steps.map((s, idx) => {
        const done = idx < activeIndex
        const active = idx === activeIndex
        const clickable = Boolean(s.onClick && idx <= activeIndex)

        const content = (
          <span className="inline-flex items-center gap-1.5 min-w-0">
            <span
              aria-hidden="true"
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 transition-colors ${
                done
                  ? "bg-green text-white"
                  : active
                    ? "bg-pink text-white shadow-xs"
                    : "bg-muted text-muted-foreground border border-border"
              }`}
            >
              {done ? <Check className="w-3 h-3" strokeWidth={2.5} /> : idx + 1}
            </span>
            <span
              className={`text-[11px] truncate ${
                active
                  ? "font-bold text-foreground"
                  : done
                    ? "font-semibold text-foreground/80"
                    : "font-medium text-muted-foreground"
              }`}
            >
              {s.label}
            </span>
          </span>
        )

        return (
          <div key={s.id} className="flex items-center gap-1.5 flex-1 min-w-0">
            {clickable ? (
              <button
                type="button"
                onClick={s.onClick}
                aria-current={active ? "step" : undefined}
                className="flex items-center gap-1.5 text-left hover:opacity-85 transition-opacity cursor-pointer min-w-0"
              >
                {content}
              </button>
            ) : (
              <div
                aria-current={active ? "step" : undefined}
                className="flex items-center gap-1.5 min-w-0"
              >
                {content}
              </div>
            )}

            {idx < steps.length - 1 && (
              <div
                aria-hidden="true"
                className={`h-[1.5px] flex-1 rounded-full transition-colors ${
                  done ? "bg-green/60" : "bg-border"
                }`}
              />
            )}
          </div>
        )
      })}
    </nav>
  )
}
