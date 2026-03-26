import { useCallback, useEffect, useRef, useState } from 'react'

import { wsProgressUrl } from '../api/client'

export interface ProgressPayload {
  type: string
  download_id: string
  status?: string
  percent?: number | null
  speed?: string | null
  eta?: string | null
  filename?: string | null
  error?: string | null
  raw_line?: string
}

export function useProgressWebSocket(
  onMessage: (msg: ProgressPayload) => void,
) {
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return
    const url = wsProgressUrl()
    const ws = new WebSocket(url)
    wsRef.current = ws
    ws.onopen = () => {
      setConnected(true)
      ws.send('subscribed')
    }
    ws.onclose = () => {
      setConnected(false)
      wsRef.current = null
    }
    ws.onerror = () => {
      setConnected(false)
    }
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data as string) as ProgressPayload
        onMessageRef.current(data)
      } catch {
        /* ignore */
      }
    }
  }, [])

  useEffect(() => {
    connect()
    return () => {
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [connect])

  return { connected, reconnect: connect }
}
