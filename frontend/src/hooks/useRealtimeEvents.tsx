import { useEffect, useRef, useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../stores/authStore'
import { api } from '../lib/api'
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

const POLL_INTERVAL = 5000 // 5 seconds
const STORAGE_KEY = 'realtime:last_id'

function loadLastId(): number | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v ? parseInt(v, 10) : null
  } catch {
    return null
  }
}

function saveLastId(id: number) {
  try {
    localStorage.setItem(STORAGE_KEY, String(id))
  } catch {
    // ignore
  }
}

export function useRealtimeEvents() {
  const { token } = useAuthStore()
  const qc = useQueryClient()
  const lastIdRef = useRef<number | null>(loadLastId())
  const seededRef = useRef(false)
  const [connected, setConnected] = useState(false)
  const [events, setEvents] = useState<RealtimeEvent[]>([])
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const handleEvent = useCallback((event: RealtimeEvent) => {
    const icon = EVENT_ICONS[event.type] || '🔔'
    toast.custom(
      (t) => (
        <div
          style={{
            background: '#1c1c1e',
            color: '#fff',
            border: '1px solid #2c2c2e',
            borderRadius: 10,
            padding: '10px 12px',
            minWidth: 260,
            maxWidth: 360,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            fontSize: 13,
            opacity: t.visible ? 1 : 0,
            transition: 'opacity 200ms ease',
          }}
        >
          <span style={{ fontSize: 18, lineHeight: 1 }}>{icon}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, marginBottom: 2 }}>{event.title}</div>
            {event.body && (
              <div style={{ color: '#a0a0a8', whiteSpace: 'pre-wrap' }}>{event.body}</div>
            )}
          </div>
          <button
            onClick={() => toast.dismiss(t.id)}
            aria-label="Dismiss"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#8a8a92',
              cursor: 'pointer',
              fontSize: 16,
              lineHeight: 1,
              padding: 2,
              marginLeft: 4,
            }}
          >
            ×
          </button>
        </div>
      ),
      { duration: 5000 }
    )

    setEvents(prev => [event, ...prev].slice(0, 20))

    const keys = INVALIDATION_MAP[event.type]
    if (keys) {
      keys.forEach(key => qc.invalidateQueries({ queryKey: [key] }))
    }
  }, [qc])

  const poll = useCallback(async () => {
    if (!token) return
    try {
      // First time ever (or storage cleared) — seed with current max id, no replay.
      if (lastIdRef.current === null && !seededRef.current) {
        seededRef.current = true
        const { data } = await api.get('/v1/admin/realtime/poll', { params: { init: 1 } })
        const maxId = data?.last_id ?? 0
        lastIdRef.current = maxId
        saveLastId(maxId)
        setConnected(true)
        return
      }

      const { data } = await api.get('/v1/admin/realtime/poll', {
        params: { last_id: lastIdRef.current ?? 0 },
      })
      setConnected(true)

      if (data.events?.length) {
        for (const evt of data.events) {
          handleEvent(evt)
        }
      }
      if (typeof data.last_id === 'number' && data.last_id > (lastIdRef.current ?? 0)) {
        lastIdRef.current = data.last_id
        saveLastId(data.last_id)
      }
    } catch {
      setConnected(false)
    }
  }, [token, handleEvent])

  useEffect(() => {
    if (!token) return

    // Initial poll immediately
    poll()

    intervalRef.current = setInterval(poll, POLL_INTERVAL)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [token, poll])

  return { connected, events }
}
