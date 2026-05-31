import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import type { Event } from "@symbiote/types"

type SCDPStatus = "connecting" | "open" | "closed"
type SCDPListener = (event: Event) => void

type SCDPClient = {
  status: SCDPStatus
  error: string | null
  send: (event: Event) => Promise<void>
  subscribe: (listener: SCDPListener) => () => void
}

const SCDPContext = createContext<SCDPClient | null>(null)
const RECONNECT_INTERVAL_MS = 1000

function createWebsocket(url: string) {
  return new WebSocket(url)
}

export function SCDPProvider({
  children,
  websocketUrl,
}: {
  children: React.ReactNode
  websocketUrl: string
}) {
  const socketRef = useRef<WebSocket | null>(null)
  const queuedMessagesRef = useRef<string[]>([])
  const reconnectTimeoutRef = useRef<number | null>(null)
  const isMountedRef = useRef(false)
  const listenersRef = useRef(new Set<SCDPListener>())
  const [status, setStatus] = useState<SCDPStatus>("connecting")
  const [error, setError] = useState<string | null>(null)

  const emit = useCallback((event: Event) => {
    listenersRef.current.forEach((listener) => {
      listener(event)
    })
  }, [])

  const send = useCallback(async (event: Event) => {
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

  const subscribe = useCallback((listener: SCDPListener) => {
    listenersRef.current.add(listener)

    return () => {
      listenersRef.current.delete(listener)
    }
  }, [])

  const connect = useCallback(() => {
    if (!websocketUrl) {
      setStatus("closed")
      setError("Missing websocket URL")
      return
    }

    setStatus("connecting")
    const socket = createWebsocket(websocketUrl)
    socketRef.current = socket

    socket.addEventListener("open", () => {
      setStatus("open")
      setError(null)
      socket.send(JSON.stringify({ name: "conversations.list" } satisfies Event))

      const pending = queuedMessagesRef.current.splice(0)
      pending.forEach((message) => {
        socket.send(message)
      })
    })

    socket.addEventListener("message", (message) => {
      try {
        emit(JSON.parse(message.data.toString()) as Event)
      } catch {
        setError("Received invalid websocket payload")
      }
    })

    socket.addEventListener("close", () => {
      setStatus("closed")
      if (!isMountedRef.current) {
        return
      }

      reconnectTimeoutRef.current = window.setTimeout(() => {
        connect()
      }, RECONNECT_INTERVAL_MS)
    })

    socket.addEventListener("error", () => {
      setError("Websocket connection failed")
      socket.close()
    })
  }, [emit, websocketUrl])

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

  const client = useMemo<SCDPClient>(() => ({
    status,
    error,
    send,
    subscribe,
  }), [error, send, status, subscribe])

  return <SCDPContext.Provider value={client}>{children}</SCDPContext.Provider>
}

export function useSCDP() {
  const client = useContext(SCDPContext)

  if (!client) {
    throw new Error("useSCDP must be used within a SCDPProvider")
  }

  return client
}
