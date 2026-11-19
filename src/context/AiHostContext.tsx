import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import {
  fetchAiHostHealth,
  getApiDisplayHost,
  type AiHostHealthPayload,
  type AiHostStatusState,
} from "../lib/aiHost"

type AiHostContextValue = {
  status: AiHostStatusState
  payload: AiHostHealthPayload | null
  statusMessage: string
  hostLabel: string
  lastCheckedAt: number | null
  refreshHealth: () => Promise<void>
}

const AiHostContext = createContext<AiHostContextValue | null>(null)

export function AiHostProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AiHostStatusState>("checking")
  const [payload, setPayload] = useState<AiHostHealthPayload | null>(null)
  const [statusMessage, setStatusMessage] = useState<string>("Checking AI host PC…")
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null)
  const inflightRef = useRef<AbortController | null>(null)
  const statusRef = useRef<AiHostStatusState>("checking")

  const refreshHealth = useCallback(async () => {
    inflightRef.current?.abort()
    const controller = new AbortController()
    inflightRef.current = controller

    const result = await fetchAiHostHealth(controller.signal)
    if (controller.signal.aborted) return

    statusRef.current = result.state
    setStatus(result.state)
    setPayload(result.payload)
    setLastCheckedAt(Date.now())
    if (result.state === "online") {
      setStatusMessage("Host PC GPU is online and models are ready.")
    } else if (result.state === "loading") {
      setStatusMessage(result.errorMessage || "Host PC is warming up AI models…")
    } else {
      setStatusMessage(
        result.errorMessage || "Host PC AI server is offline. Ask the host to launch tAIlor AI Host.",
      )
    }
  }, [])

  useEffect(() => {
    void refreshHealth()

    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refreshHealth()
      }
    }, 15_000)

    const handleVisibleOrOnline = () => {
      if (document.visibilityState === "visible") {
        void refreshHealth()
      }
    }

    window.addEventListener("online", handleVisibleOrOnline)
    window.addEventListener("focus", handleVisibleOrOnline)
    document.addEventListener("visibilitychange", handleVisibleOrOnline)

    return () => {
      window.clearInterval(timer)
      window.removeEventListener("online", handleVisibleOrOnline)
      window.removeEventListener("focus", handleVisibleOrOnline)
      document.removeEventListener("visibilitychange", handleVisibleOrOnline)
      inflightRef.current?.abort()
    }
  }, [refreshHealth])

  return (
    <AiHostContext.Provider
      value={{
        status,
        payload,
        statusMessage,
        hostLabel: getApiDisplayHost(),
        lastCheckedAt,
        refreshHealth,
      }}
    >
      {children}
    </AiHostContext.Provider>
  )
}

export function useOptionalAiHost() {
  return useContext(AiHostContext)
}

export function useAiHost() {
  const ctx = useContext(AiHostContext)
  if (!ctx) throw new Error("useAiHost must be used within AiHostProvider")
  return ctx
}
