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

export function useRealtimeEvents() {
  const { token } = useAuthStore()
  const qc = useQueryClient()
  const lastIdRef = useRef(0)
  const [connected, setConnected] = useState(false)
  const [events, setEvents] = useState<RealtimeEvent[]>([])
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const handleEvent = useCallback((event: RealtimeEvent) => {
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

    setEvents(prev => [event, ...prev].slice(0, 20))

    const keys = INVALIDATION_MAP[event.type]
    if (keys) {
      keys.forEach(key => qc.invalidateQueries({ queryKey: [key] }))
    }
  }, [qc])

  const poll = useCallback(async () => {
    if (!token) return
    try {
      const { data } = await api.get('/v1/admin/realtime/poll', {
        params: { last_id: lastIdRef.current },
      })
      setConnected(true)

      if (data.events?.length) {
        for (const evt of data.events) {
          handleEvent(evt)
        }
      }
      if (data.last_id) {
        lastIdRef.current = data.last_id
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
