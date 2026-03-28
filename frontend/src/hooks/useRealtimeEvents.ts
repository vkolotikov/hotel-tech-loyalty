import { useEffect, useRef, useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../stores/authStore'
import { API_URL } from '../lib/api'
import toast from 'react-hot-toast'

export interface RealtimeEvent {
  type: string   // arrival, departure, inquiry, points, member, reservation
  title: string
  body: string | null
  data: Record<string, any> | null
  time: string
}

const EVENT_ICONS: Record<string, string> = {
  arrival: '🛬',
  departure: '🛫',
  inquiry: '📩',
  points: '⭐',
  member: '👤',
  reservation: '🏨',
}

// Query key prefixes to invalidate when specific event types arrive
const INVALIDATION_MAP: Record<string, string[]> = {
  arrival:     ['dashboard-kpis', 'dashboard-arrivals', 'reservations'],
  departure:   ['dashboard-kpis', 'dashboard-departures', 'reservations'],
  inquiry:     ['dashboard-kpis', 'dashboard-inquiry-status', 'dashboard-recent-activity', 'inquiries'],
  points:      ['dashboard-kpis', 'member'],
  member:      ['dashboard-kpis', 'members'],
  reservation: ['dashboard-kpis', 'dashboard-recent-activity', 'reservations'],
}

export function useRealtimeEvents() {
  const { token } = useAuthStore()
  const qc = useQueryClient()
  const lastIdRef = useRef(0)
  const retryRef = useRef(0)
  const esRef = useRef<EventSource | null>(null)
  const [connected, setConnected] = useState(false)
  const [events, setEvents] = useState<RealtimeEvent[]>([])

  const handleEvent = useCallback((event: RealtimeEvent) => {
    // Show toast notification
    const icon = EVENT_ICONS[event.type] || '🔔'
    toast(
      `${icon} ${event.title}\n${event.body || ''}`,
      {
        duration: 5000,
        style: {
          background: '#1c1c1e',
          color: '#fff',
          border: '1px solid #2c2c2e',
          fontSize: '13px',
          maxWidth: '350px',
        },
      }
    )

    // Add to local event feed (keep last 20)
    setEvents(prev => [event, ...prev].slice(0, 20))

    // Invalidate relevant queries for auto-refresh
    const keys = INVALIDATION_MAP[event.type]
    if (keys) {
      keys.forEach(key => qc.invalidateQueries({ queryKey: [key] }))
    }
  }, [qc])

  const connect = useCallback(() => {
    if (!token) return

    const isProduction = window.location.hostname !== 'localhost'
    const baseUrl = isProduction ? '/api' : (API_URL + '/api')
    const url = `${baseUrl}/v1/admin/realtime/stream?last_id=${lastIdRef.current}&token=${encodeURIComponent(token)}`

    const es = new EventSource(url)
    esRef.current = es

    es.addEventListener('connected', () => {
      setConnected(true)
      retryRef.current = 0
    })

    es.addEventListener('notification', (e) => {
      try {
        const data = JSON.parse(e.data) as RealtimeEvent
        if (e.lastEventId) lastIdRef.current = Number(e.lastEventId)
        handleEvent(data)
      } catch {}
    })

    es.addEventListener('reconnect', (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.last_id) lastIdRef.current = data.last_id
      } catch {}
      es.close()
      // Reconnect immediately after server-initiated close
      setTimeout(() => connect(), 500)
    })

    es.onerror = () => {
      setConnected(false)
      es.close()
      // Exponential backoff: 2s, 4s, 8s, 16s, max 30s
      const delay = Math.min(2000 * Math.pow(2, retryRef.current), 30000)
      retryRef.current++
      setTimeout(() => connect(), delay)
    }
  }, [token, handleEvent])

  useEffect(() => {
    connect()
    return () => {
      esRef.current?.close()
      esRef.current = null
    }
  }, [connect])

  return { connected, events }
}
