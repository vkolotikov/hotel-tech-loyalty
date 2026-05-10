import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

/**
 * CRM Phase 6 — fires a browser notification when an open task crosses
 * its due time, plus a heads-up at 5 minutes before. Requirements:
 *
 *   • Notification permission must be granted (use
 *     `useNotificationPermission()` to surface the request prompt).
 *   • Mounted in `Layout.tsx` so it runs anywhere in the admin
 *     surface, not just /tasks. Polls every 60s.
 *
 * Each unique (task_id × milestone) fires at most once per session —
 * tracked in a sessionStorage keyed set so reloads don't re-spam, and
 * the user gets ONE 5-min warning + ONE due-now ping. Marking a task
 * complete or rescheduling it server-side will simply stop it from
 * appearing in the polled list.
 */

interface Task {
  id: number
  title: string
  due_at: string
  inquiry_id: number | null
  type: string
}

const FIRED_KEY = 'crm.task-reminders.fired.v1'

function getFired(): Set<string> {
  try {
    const raw = sessionStorage.getItem(FIRED_KEY)
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch { return new Set() }
}
function persistFired(s: Set<string>) {
  try { sessionStorage.setItem(FIRED_KEY, JSON.stringify([...s])) } catch {}
}

export function useTaskReminders(enabled: boolean) {
  const firedRef = useRef<Set<string>>(getFired())

  // Light backend pull — only the next ~24h of due tasks. Default
  // status filter is `open`, ordered by due_at.
  const { data } = useQuery<{ data: Task[] }>({
    queryKey: ['task-reminders'],
    queryFn: () => api.get('/v1/admin/tasks', {
      params: { status: 'open', per_page: 50 },
    }).then(r => r.data),
    enabled,
    refetchInterval: 60_000,        // 1-min poll
    staleTime: 30_000,
  })

  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || !('Notification' in window)) return
    if (Notification.permission !== 'granted') return

    const fired = firedRef.current
    const now = Date.now()
    const tasks = data?.data ?? []

    let changed = false
    for (const t of tasks) {
      if (!t.due_at) continue
      const due = new Date(t.due_at).getTime()
      const minsUntil = (due - now) / 60_000

      // 5-min warning
      if (minsUntil > 0 && minsUntil <= 5) {
        const key = `${t.id}:warn`
        if (!fired.has(key)) {
          fired.add(key); changed = true
          fireNotification('Task due soon', `${t.title} — in ${Math.ceil(minsUntil)} min`, t)
        }
      }

      // Due now / just past
      if (minsUntil <= 0 && minsUntil > -10) {
        const key = `${t.id}:due`
        if (!fired.has(key)) {
          fired.add(key); changed = true
          fireNotification('Task due', t.title, t)
        }
      }
    }
    if (changed) persistFired(fired)
  }, [data, enabled])
}

function fireNotification(title: string, body: string, task: Task) {
  try {
    const n = new Notification(title, {
      body,
      tag: `task-${task.id}`,    // dedupe across rapid polls
      icon: '/favicon.ico',
      requireInteraction: false,
    })
    n.onclick = () => {
      window.focus()
      const url = task.inquiry_id ? `/inquiries/${task.inquiry_id}` : '/tasks'
      if (window.location.pathname !== url) window.location.href = url
      n.close()
    }
  } catch {
    // Browser refused (private mode, OS-level disable). Quietly skip.
  }
}
