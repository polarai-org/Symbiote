import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react"
import type { Event } from "@symbiote/types"

type SCDPSendFunction = (event: Event) => Promise<void>

const SCDPContext = createContext<SCDPSendFunction>(() => {
  throw new Error("useSCDP must be used within a SCDPProvider")
})

const DEFAULT_COREDAEMON_PORT = 3000
const RECONNECT_INTERVAL_MS = 1000

function getSCDPWebsocketUrl() {
  if (typeof window === "undefined") {
    return ""
  }

  const env = (import.meta as any).env
  const configuredUrl = env?.VITE_SCDP_WS_URL?.trim()

  if (configuredUrl) {
    return configuredUrl
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
  const host = window.location.hostname || "127.0.0.1"

  return `${protocol}//${host}:${DEFAULT_COREDAEMON_PORT}/ws`
}

function createWebsocket(url: string) {
  return new WebSocket(url)
}

export function SCDPProvider({ children }: { children: React.ReactNode }) {
  const socketRef = useRef<WebSocket | null>(null)
  const queuedMessagesRef = useRef<string[]>([])
  const reconnectTimeoutRef = useRef<number | null>(null)
  const isMountedRef = useRef(false)

  const connect = useCallback(() => {
    const url = getSCDPWebsocketUrl()
    if (!url) {
      return
    }

    const socket = createWebsocket(url)
    socketRef.current = socket

    socket.addEventListener("open", () => {
      const pending = queuedMessagesRef.current.splice(0)
      pending.forEach((message) => {
        socket.send(message)
      })
    })

    socket.addEventListener("close", () => {
      if (!isMountedRef.current) {
        return
      }

      reconnectTimeoutRef.current = window.setTimeout(() => {
        connect()
      }, RECONNECT_INTERVAL_MS)
    })

    socket.addEventListener("error", () => {
      socket.close()
    })
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    isMountedRef.current = true
    connect()

    return () => {
      isMountedRef.current = false
      if (reconnectTimeoutRef.current !== null) {
        window.clearTimeout(reconnectTimeoutRef.current)
      }
      socketRef.current?.close()
    }
  }, [connect])

  const send = useCallback(async (event: SCDPEvent) => {
    if (!event || typeof event.name !== "string") {
      throw new Error("SCDP event must include a string name")
    }

    const payload = JSON.stringify(event)
    const socket = socketRef.current

    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(payload)
      return
    }

    queuedMessagesRef.current.push(payload)
  }, [])

  const sendFunction = useMemo(() => send, [send])

  return <SCDPContext.Provider value={sendFunction}>{children}</SCDPContext.Provider>
}

export function useSCDP() {
  return useContext(SCDPContext)
}
