import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'

/**
 * Engagement Hub Phase 4 — alerts the agent when a new "hot lead" appears
 * in the feed. Detection is purely client-side (diff between feed
 * snapshots), so no backend event-emission plumbing is required for v1.
 *
 * Each call site passes the freshly-fetched list of hot rows (anything
 * the backend marked `is_hot_lead=true`) plus a function that returns a
 * human-readable name for a row id (used in the toast/notification copy).
 *
 * The hook fires:
 *   - in-app toast (bottom-right)
 *   - browser Notification API (only when permission is granted)
 *
 * Browser notifications fire even when the admin SPA tab is in the
 * background — exactly the case we care about. Foreground-only notifs
 * are still useful when the agent has the page open but is mid-typing
 * elsewhere.
 *
 * Suppression rules to avoid notification spam:
 *   - First snapshot after mount is treated as the baseline; nothing
 *     fires for rows that were already hot when we first loaded.
 *   - We rate-limit at 1 notification per visitor per 30s so a flapping
 *     row (online → offline → online) doesn't pummel the agent.
 */
export interface HotLeadInfo {
  id: number
  name: string
  context?: string  // e.g. current page path, last message preview
}

export function useHotLeadAlert(hotIds: number[], lookup: (id: number) => HotLeadInfo | undefined): void {
  // Set of ids that were already hot last time we saw the feed. The
  // FIRST snapshot seeds this without firing alerts (so reloading the
  // page doesn't replay every hot lead currently in the org).
  const previousRef = useRef<Set<number> | null>(null)
  // Per-visitor rate limit so a flapping row doesn't notify repeatedly.
  const lastNotifiedAtRef = useRef<Map<number, number>>(new Map())

  useEffect(() => {
    const current = new Set(hotIds)

    // Seed on first run — no alerts.
    if (previousRef.current === null) {
      previousRef.current = current
      return
    }

    const now = Date.now()
    const RATE_LIMIT_MS = 30_000

    for (const id of current) {
      if (previousRef.current.has(id)) continue

      const lastAt = lastNotifiedAtRef.current.get(id) ?? 0
      if (now - lastAt < RATE_LIMIT_MS) continue
      lastNotifiedAtRef.current.set(id, now)

      const info = lookup(id)
      if (!info) continue

      // In-app toast — uses the project's react-hot-toast.
      toast.custom((t) => (
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(251,146,60,0.18), rgba(251,146,60,0.08))',
            border: '1px solid rgba(251,146,60,0.45)',
            color: '#fff',
            borderRadius: 10,
            padding: '12px 14px',
            minWidth: 280,
            maxWidth: 380,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            display: 'flex',
            gap: 10,
            fontSize: 13,
            opacity: t.visible ? 1 : 0,
            transition: 'opacity 200ms ease',
          }}
        >
          <span style={{ fontSize: 18, lineHeight: 1 }}>🔥</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, marginBottom: 2 }}>Hot lead arrived</div>
            <div style={{ color: '#f5f5f7' }}>{info.name}</div>
            {info.context && (
              <div style={{ color: '#a0a0a8', marginTop: 2, fontSize: 11 }}>{info.context}</div>
            )}
          </div>
        </div>
      ), { duration: 6000 })

      // Browser notification — only fires when the user has explicitly
      // granted permission. Safe to call even when permission is "denied"
      // (the call no-ops and never throws).
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        try {
          const n = new Notification('Hot lead arrived', {
            body: `${info.name}${info.context ? ' — ' + info.context : ''}`,
            tag: `hot-lead-${id}`, // collapses repeated alerts for the same visitor
            silent: false,
            requireInteraction: false,
          })
          // Auto-close after 8s so a long stack of alerts doesn't pile up.
          setTimeout(() => { try { n.close() } catch {} }, 8_000)
        } catch {
          // Some browsers throw when called without a service worker on
          // pages that aren't tab-foregrounded. Swallow — toast already fired.
        }
      }
    }

    previousRef.current = current
  }, [hotIds, lookup])
}

/* ─── Permission helpers ────────────────────────────────────────── */

/**
 * Returns the current Notification permission state and a function to
 * request it. Re-renders when permission changes (useful for toggling the
 * "Enable notifications" banner off after the user accepts).
 */
export function useNotificationPermission() {
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
    return Notification.permission
  })

  const request = async () => {
    if (permission === 'unsupported') return 'unsupported' as const
    if (permission === 'granted') return 'granted' as const
    try {
      const result = await Notification.requestPermission()
      setPermission(result)
      return result
    } catch {
      return 'denied' as const
    }
  }

  return { permission, request }
}
