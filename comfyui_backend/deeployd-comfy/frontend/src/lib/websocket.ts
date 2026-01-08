import { useEffect, useMemo, useRef, useState } from 'react'
import type { WSMessage } from '@/types/models'

const WS_BASE = (process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000').replace(/\/$/, '')

// topic can be a room name, e.g., "build:<id>" or "execution:<id>"
export function useWebSocket(topic: string) {
  const [messages, setMessages] = useState<WSMessage[]>([])
  const [isConnected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)

  const url = useMemo(() => `${WS_BASE}/ws/${encodeURIComponent(topic)}?room=${encodeURIComponent(topic)}`, [topic])

  useEffect(() => {
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => setConnected(true)
    ws.onclose = () => setConnected(false)
    ws.onerror = () => setConnected(false)
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data)
        setMessages((prev) => [...prev, { ...data, timestamp: new Date().toISOString() }])
      } catch {
        // ignore malformed
      }
    }

    return () => {
      try { ws.close() } catch {}
      wsRef.current = null
    }
  }, [url])

  return { messages, isConnected }
}
