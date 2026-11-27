import { useEffect, useRef, useState } from "react"
import { AlertTriangle, Clock, RefreshCw, X } from "lucide-react"
import { useAiHost } from "../context/AiHostContext"

export function AiHostHeaderPill() {
  const { status, payload, statusMessage, hostLabel, lastCheckedAt, refreshHealth } = useAiHost()
  const [open, setOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    window.addEventListener("mousedown", onPointerDown)
    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("mousedown", onPointerDown)
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [open])

  const dotClass =
    status === "online"
      ? "bg-green shadow-[0_0_8px_rgba(16,185,129,0.65)]"
      : status === "loading" || status === "checking"
        ? "bg-[#FFCB44] animate-pulse"
        : "bg-red"

  const pillClass =
    status === "online"
      ? "bg-green/10 border-green/25 text-green"
      : status === "loading" || status === "checking"
        ? "bg-gold/10 border-gold/30 text-gold"
        : "bg-red/10 border-red/25 text-red"

  const shortLabel =
    status === "online"
      ? "Live"
      : status === "loading"
        ? "Warming"
        : status === "checking"
          ? "…"
          : "Offline"

  const backendLoaded = payload?.backend?.loaded
  const activeTask = payload?.backend?.active_task
  const tryOnQueued = (payload?.queue?.tryOnQueued || 0) + (payload?.queue?.tryOnRunning || 0)

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await refreshHealth()
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`AI Host status: ${shortLabel}`}
        title={statusMessage}
        className={`h-7 px-2.5 rounded-full border flex items-center gap-1.5 text-[11px] font-semibold transition-transform active:scale-95 cursor-pointer ${pillClass}`}
      >
        <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClass}`} />
        <span>{shortLabel}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="false"
          aria-label="AI Host Status Details"
          className="absolute left-0 top-9 w-72 max-w-[calc(100vw-2rem)] rounded-2xl p-3.5 border border-border bg-card shadow-2xl z-50 space-y-2.5 animate-in fade-in duration-150"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <span aria-hidden="true" className={`w-2 h-2 rounded-full ${dotClass}`} />
                <span>
                  {status === "online"
                    ? "Host PC AI Online"
                    : status === "loading"
                      ? "Warming Up AI Models"
                      : status === "checking"
                        ? "Checking AI Host…"
                        : "Host PC AI Offline"}
                </span>
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                {statusMessage}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close AI status details"
              className="w-6 h-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="rounded-xl p-2.5 bg-muted/70 border border-border space-y-1.5 text-[11px]">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-muted-foreground">Endpoint</span>
              <span className="font-mono font-semibold text-foreground truncate max-w-[165px]">
                {hostLabel}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-muted-foreground">Stylist (Qwen 3B)</span>
              <span className={`font-semibold ${backendLoaded?.text ? "text-green" : "text-muted-foreground"}`}>
                {status === "offline" ? "Offline" : backendLoaded?.text ? "Ready" : "Loading…"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-muted-foreground">Scanner (Qwen VL)</span>
              <span className={`font-semibold ${backendLoaded?.vision ? "text-green" : "text-muted-foreground"}`}>
                {status === "offline" ? "Offline" : backendLoaded?.vision ? "Ready" : "Loading…"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-muted-foreground">Try-On (SDXL)</span>
              <span className={`font-semibold ${status === "online" ? "text-green" : "text-muted-foreground"}`}>
                {status === "offline"
                  ? "Offline"
                  : backendLoaded?.tryon
                    ? "Loaded"
                    : status === "online"
                      ? "Ready on demand"
                      : "Waiting…"}
              </span>
            </div>
            {(activeTask || tryOnQueued > 0) && (
              <div className="flex items-center justify-between gap-2 pt-1 border-t border-border">
                <span className="font-medium text-muted-foreground">GPU Activity</span>
                <span className="font-semibold text-turquoise">
                  {activeTask ? `Running ${activeTask}` : `${tryOnQueued} in queue`}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-muted-foreground">
              {lastCheckedAt ? `Checked ${new Date(lastCheckedAt).toLocaleTimeString()}` : "Not checked yet"}
            </span>
            <button
              type="button"
              onClick={() => void handleRefresh()}
              disabled={refreshing}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-[11px] font-semibold bg-turquoise text-[#0B0D16] hover:brightness-105 disabled:opacity-60 cursor-pointer"
            >
              <RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} />
              <span>{refreshing ? "Checking…" : "Refresh"}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function AiHostNoticeBanner({
  featureName,
  offlineHint,
}: {
  featureName: string
  offlineHint?: string
}) {
  const { status, statusMessage, refreshHealth } = useAiHost()
  const [checking, setChecking] = useState(false)

  if (status === "online" || status === "checking") return null

  const isLoading = status === "loading"

  return (
    <div
      role="status"
      aria-live="polite"
      className={`rounded-2xl p-3 border flex items-start justify-between gap-3 ${
        isLoading
          ? "bg-gold/10 border-gold/30 text-foreground"
          : "bg-red/8 border-red/25 text-foreground"
      }`}
    >
      <div className="min-w-0 space-y-0.5">
        <p className={`text-xs font-bold flex items-center gap-1.5 ${isLoading ? "text-gold" : "text-red"}`}>
          {isLoading ? (
            <Clock className="w-3.5 h-3.5 shrink-0" />
          ) : (
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          )}
          <span>{isLoading ? `${featureName} is warming up` : "Host PC AI is offline"}</span>
        </p>
        <p className="text-[11px] text-muted-foreground leading-snug">
          {isLoading
            ? statusMessage
            : offlineHint ||
              `${featureName} runs on the host PC's GPU. Ask the host to launch tAIlor AI Host on their PC, then tap Check Again.`}
        </p>
      </div>
      <button
        type="button"
        disabled={checking}
        onClick={async () => {
          setChecking(true)
          try {
            await refreshHealth()
          } finally {
            setChecking(false)
          }
        }}
        className="shrink-0 min-h-[34px] px-2.5 py-1 rounded-xl text-[11px] font-semibold border border-border bg-card text-foreground hover:border-turquoise inline-flex items-center gap-1 disabled:opacity-60 cursor-pointer"
      >
        <RefreshCw className={`w-3 h-3 ${checking ? "animate-spin" : ""}`} />
        <span>{checking ? "Checking…" : "Retry"}</span>
      </button>
    </div>
  )
}
