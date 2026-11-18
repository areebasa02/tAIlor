import { useEffect, useRef, useState } from "react"
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
      ? "bg-green"
      : status === "loading" || status === "checking"
        ? "bg-gold animate-pulse"
        : "bg-red"

  const pillClass =
    status === "online"
      ? "bg-green/12 border-green/40 text-green"
      : status === "loading" || status === "checking"
        ? "bg-gold/12 border-gold/45 text-gold"
        : "bg-red/12 border-red/40 text-red"

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
        className={`h-8 px-2 min-[390px]:px-2.5 rounded-full border-2 flex items-center gap-1.5 text-[11px] font-black transition-transform active:scale-95 cursor-pointer ${pillClass}`}
      >
        <span aria-hidden="true" className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`} />
        <span className="hidden min-[380px]:inline">AI {shortLabel}</span>
        <span className="min-[380px]:hidden">{shortLabel}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="false"
          aria-label="AI Host Status Details"
          className="absolute left-0 top-10 w-72 max-w-[calc(100vw-2rem)] rounded-2xl p-3.5 border-2 border-border bg-card shadow-2xl z-50 space-y-2.5 animate-in fade-in duration-150"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-black text-foreground flex items-center gap-1.5">
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
              className="text-xs font-bold text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded-lg cursor-pointer"
            >
              ✕
            </button>
          </div>

          <div className="rounded-xl p-2.5 bg-muted border border-border space-y-1.5 text-[11px]">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-muted-foreground">Endpoint</span>
              <span className="font-mono font-bold text-foreground truncate max-w-[165px]">
                {hostLabel}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-muted-foreground">Stylist (Qwen 3B)</span>
              <span className={`font-extrabold ${backendLoaded?.text ? "text-green" : "text-muted-foreground"}`}>
                {status === "offline" ? "Offline" : backendLoaded?.text ? "Ready" : "Loading…"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-muted-foreground">Scanner (Qwen VL)</span>
              <span className={`font-extrabold ${backendLoaded?.vision ? "text-green" : "text-muted-foreground"}`}>
                {status === "offline" ? "Offline" : backendLoaded?.vision ? "Ready" : "Loading…"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-muted-foreground">Try-On (SDXL)</span>
              <span className={`font-extrabold ${status === "online" ? "text-green" : "text-muted-foreground"}`}>
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
                <span className="font-bold text-muted-foreground">GPU Activity</span>
                <span className="font-extrabold text-turquoise">
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
              className="px-3 py-1.5 rounded-xl text-[11px] font-black bg-turquoise text-[#0D0F18] hover:brightness-105 disabled:opacity-60 cursor-pointer"
            >
              {refreshing ? "Checking…" : "↻ Refresh"}
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
      className={`rounded-2xl p-3 border-2 flex items-start justify-between gap-3 ${
        isLoading
          ? "bg-gold/10 border-gold/40 text-foreground"
          : "bg-red/10 border-red/35 text-foreground"
      }`}
    >
      <div className="min-w-0 space-y-0.5">
        <p className={`text-xs font-black ${isLoading ? "text-gold" : "text-red"}`}>
          {isLoading ? `⏳ ${featureName} is warming up` : `⚠ Host PC AI is offline`}
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
        className="shrink-0 min-h-[34px] px-2.5 py-1 rounded-xl text-[11px] font-black border border-border bg-card text-foreground hover:border-turquoise disabled:opacity-60 cursor-pointer"
      >
        {checking ? "Checking…" : "↻ Check Again"}
      </button>
    </div>
  )
}
