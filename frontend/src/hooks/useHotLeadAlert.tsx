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
 *   - in-app toast (bottom-right) — dismissible × button, click to
 *     navigate to /engagement
 *   - browser Notification API (only when permission is granted)
 *
 * Browser notifications fire even when the admin SPA tab is in the
 * background — exactly the case we care about. Foreground-only notifs
 * are still useful when the agent has the page open but is mid-typing
 * elsewhere.
 *
 * Dedup strategy:
 *   - Each toast uses id `hot-lead-${visitorId}` so react-hot-toast
 *     REPLACES rather than stacks duplicates. Crucially this also
 *     coordinates with useRealtimeEvents which fires its own toast
 *     with the same id — server-pushed and client-detected events
 *     for the same visitor collapse into a single visible toast.
 *   - First snapshot after mount is the baseline; no alerts for rows
 *     that were already hot when we loaded.
 *   - sessionStorage tracks visitor ids we've ALREADY alerted on for
 *     this browser session, so refreshing /engagement doesn't replay
 *     a toast we already showed (until the session ends or 6 hours
 *     pass, whichever comes first).
 *   - Per-visitor rate limit of 30s on top of all of that as a final
 *     safety net against rapid hot/cold flapping.
 */
export interface HotLeadInfo {
  id: number
  name: string
  context?: string  // e.g. current page path, last message preview
}

const SESSION_KEY = 'hot-leads:shown'
const SESSION_TTL_MS = 6 * 60 * 60 * 1000 // 6 hours

/** Read the per-session set of visitor ids we've already alerted on. */
function loadShown(): Map<number, number> {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return new Map()
    const obj = JSON.parse(raw) as Record<string, number>
    const now = Date.now()
    const out = new Map<number, number>()
    for (const [k, ts] of Object.entries(obj)) {
      if (now - ts < SESSION_TTL_MS) out.set(Number(k), ts)
    }
    return out
  } catch {
    return new Map()
  }
}
function saveShown(m: Map<number, number>) {
  try {
    const obj: Record<string, number> = {}
    m.forEach((ts, id) => { obj[String(id)] = ts })
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(obj))
  } catch {
    // sessionStorage full or unavailable — never throw
  }
}

export function useHotLeadAlert(hotIds: number[], lookup: (id: number) => HotLeadInfo | undefined): void {
  // Set of ids that were already hot last time we saw the feed. The
  // FIRST snapshot seeds this without firing alerts (so reloading the
  // page doesn't replay every hot lead currently in the org).
  const previousRef = useRef<Set<number> | null>(null)
  // Per-visitor rate limit so a flapping row doesn't notify repeatedly
  // within a single session. Stored as Map<id, lastTs>.
  const rateLimitRef = useRef<Map<number, number>>(new Map())
  // sessionStorage-backed "already shown this session" set so a refresh
  // within the same session doesn't replay alerts for visitors we've
  // already pinged the user about.
  const shownRef = useRef<Map<number, number>>(loadShown())

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

      // sessionStorage check — already alerted this session?
      if (shownRef.current.has(id)) continue

      const lastAt = rateLimitRef.current.get(id) ?? 0
      if (now - lastAt < RATE_LIMIT_MS) continue
      rateLimitRef.current.set(id, now)

      const info = lookup(id)
      if (!info) continue

      // Mark as shown in the session-persisted set.
      shownRef.current.set(id, now)
      saveShown(shownRef.current)

      const toastId = `hot-lead-${id}`

      // In-app toast — react-hot-toast dedupes by `id`, so if
      // useRealtimeEvents already fired a toast for the same visitor,
      // ours just replaces it rather than stacking a second copy.
      toast.custom((t) => (
        <div
          onClick={() => {
            try { window.location.assign('/engagement') } catch {}
            toast.dismiss(t.id)
          }}
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
            alignItems: 'flex-start',
            gap: 10,
            fontSize: 13,
            opacity: t.visible ? 1 : 0,
            transition: 'opacity 200ms ease',
            cursor: 'pointer',
          }}
        >
          <span style={{ fontSize: 18, lineHeight: 1 }}>🔥</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, marginBottom: 2 }}>Hot lead arrived</div>
            <div style={{ color: '#f5f5f7' }}>{info.name}</div>
            {info.context && (
              <div style={{ color: '#a0a0a8', marginTop: 2, fontSize: 11 }}>{info.context}</div>
            )}
            <div style={{ color: '#fbbf24', fontSize: 11, marginTop: 4, fontWeight: 600 }}>
              Click to view →
            </div>
          </div>
          {/* Dismiss button — was missing before. Hovers brighter so
              the × is actually findable on dark backgrounds. */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              toast.dismiss(t.id)
            }}
            aria-label="Dismiss"
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.10)',
              color: '#e5e5e7',
              cursor: 'pointer',
              fontSize: 16,
              lineHeight: 1,
              width: 24,
              height: 24,
              borderRadius: 6,
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              transition: 'background 150ms',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.14)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
          >×</button>
        </div>
      ), { duration: 6000, id: toastId })

      // Browser notification — only fires when the user has explicitly
      // granted permission. Tag collapses repeated alerts for the same
      // visitor at the OS level. Safe to call even when permission is
      // "denied" (the call no-ops and never throws).
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        try {
          const n = new Notification('Hot lead arrived', {
            body: `${info.name}${info.context ? ' — ' + info.context : ''}`,
            tag: toastId,
            silent: false,
            requireInteraction: false,
          })
          n.onclick = () => {
            try { window.focus(); window.location.assign('/engagement') } catch {}
            n.close()
          }
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
