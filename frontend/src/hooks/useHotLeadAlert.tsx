import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'

/**
 * Engagement Hub Phase 4 — alerts the agent when a new "hot lead" appears
 * in the feed. Detection is purely client-side (diff between feed
 * snapshots), so no backend event-emission plumbing is required for v1.
 *
 * Each call site passes the freshly-fetched list of hot rows plus a
 * function that returns a human-readable name for a row id (used in the
 * toast/notification copy). Callers should pre-filter to rows that are
 * genuinely "arriving" (e.g. online now) — a resolved lead from last week
 * scrolling into view is not an arrival.
 *
 * The hook fires:
 *   - in-app toast (bottom-right) — dismissible × button, click to
 *     navigate to /engagement
 *   - browser Notification API (only when permission is granted)
 *
 * Anti-flood design (the 2026-07 rework — the old version could stack
 * 10+ cards down the whole screen edge):
 *   - `resetKey` — pass the current filter/page/sort/search fingerprint.
 *     When it changes, the next snapshot RE-SEEDS the baseline without
 *     alerting: rows that merely scrolled into a different page/filter
 *     are not arrivals.
 *   - Burst collapse — when one snapshot yields more than
 *     MAX_INDIVIDUAL_ALERTS newly-hot visitors, they collapse into a
 *     single "N hot leads need attention" summary card (and ONE browser
 *     notification) instead of a wall of stacked cards.
 *   - Each individual toast uses id `hot-lead-${visitorId}` so
 *     react-hot-toast REPLACES rather than stacks duplicates — and
 *     coordinates with useRealtimeEvents which fires the same id.
 *   - First snapshot after mount is the baseline; no alerts for rows
 *     that were already hot when we loaded.
 *   - sessionStorage tracks visitor ids we've ALREADY alerted on this
 *     browser session, so refreshing /engagement doesn't replay a toast
 *     (until the session ends or 6 hours pass, whichever comes first).
 *   - Per-visitor rate limit of 30s as a final safety net against rapid
 *     hot/cold flapping.
 */
export interface HotLeadInfo {
  id: number
  name: string
  context?: string  // e.g. current page path, last message preview
}

const SESSION_KEY = 'hot-leads:shown'
const SESSION_TTL_MS = 6 * 60 * 60 * 1000 // 6 hours
/** More new-hot rows than this in one snapshot → one summary card. */
const MAX_INDIVIDUAL_ALERTS = 3

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

/** Shared orange hot-lead card used for both single and summary alerts. */
function fireHotLeadToast(toastId: string, title: string, body: string, context?: string) {
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
        <div style={{ fontWeight: 700, marginBottom: 2 }}>{title}</div>
        <div style={{ color: '#f5f5f7' }}>{body}</div>
        {context && (
          <div style={{ color: '#a0a0a8', marginTop: 2, fontSize: 11 }}>{context}</div>
        )}
        <div style={{ color: '#fbbf24', fontSize: 11, marginTop: 4, fontWeight: 600 }}>
          Click to view →
        </div>
      </div>
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
}

/** Browser notification — no-ops unless permission is already granted. */
function fireBrowserNotification(tag: string, title: string, body: string) {
  if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') return
  try {
    const n = new Notification(title, {
      body,
      tag,
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

export function useHotLeadAlert(
  hotIds: number[],
  lookup: (id: number) => HotLeadInfo | undefined,
  resetKey?: string,
): void {
  // Set of ids that were already hot last time we saw the feed. The
  // FIRST snapshot seeds this without firing alerts (so reloading the
  // page doesn't replay every hot lead currently in the org).
  const previousRef = useRef<Set<number> | null>(null)
  const resetKeyRef = useRef<string | undefined>(resetKey)
  // Per-visitor rate limit so a flapping row doesn't notify repeatedly
  // within a single session. Stored as Map<id, lastTs>.
  const rateLimitRef = useRef<Map<number, number>>(new Map())
  // sessionStorage-backed "already shown this session" set so a refresh
  // within the same session doesn't replay alerts for visitors we've
  // already pinged the user about.
  const shownRef = useRef<Map<number, number>>(loadShown())

  useEffect(() => {
    const current = new Set(hotIds)

    // Seed on first run — no alerts. Same when the caller's view
    // changed (filter / range / search / page / sort): rows that
    // entered the visible set because the QUERY changed are not
    // arrivals, so re-baseline silently.
    if (previousRef.current === null || resetKeyRef.current !== resetKey) {
      previousRef.current = current
      resetKeyRef.current = resetKey
      return
    }

    const now = Date.now()
    const RATE_LIMIT_MS = 30_000

    // Collect everything that qualifies FIRST so a burst can collapse
    // into a single summary card instead of stacking one per visitor.
    const fresh: HotLeadInfo[] = []
    for (const id of current) {
      if (previousRef.current.has(id)) continue
      if (shownRef.current.has(id)) continue

      const lastAt = rateLimitRef.current.get(id) ?? 0
      if (now - lastAt < RATE_LIMIT_MS) continue

      const info = lookup(id)
      if (!info) continue

      rateLimitRef.current.set(id, now)
      shownRef.current.set(id, now)
      fresh.push(info)
    }
    previousRef.current = current
    if (!fresh.length) return
    saveShown(shownRef.current)

    if (fresh.length > MAX_INDIVIDUAL_ALERTS) {
      // Burst → one summary card + one OS notification. Names give the
      // agent a scent without a screen-high stack of cards.
      const names = fresh.slice(0, 3).map(f => f.name).join(', ')
      const more = fresh.length - 3
      fireHotLeadToast(
        'hot-lead-burst',
        `${fresh.length} hot leads need attention`,
        more > 0 ? `${names} +${more} more` : names,
      )
      fireBrowserNotification('hot-lead-burst', `${fresh.length} hot leads need attention`, names)
      return
    }

    for (const info of fresh) {
      const toastId = `hot-lead-${info.id}`
      // react-hot-toast dedupes by `id`, so if useRealtimeEvents already
      // fired a toast for the same visitor, ours replaces it rather than
      // stacking a second copy. The OS-level `tag` does the same for
      // browser notifications.
      fireHotLeadToast(toastId, 'Hot lead arrived', info.name, info.context)
      fireBrowserNotification(toastId, 'Hot lead arrived', `${info.name}${info.context ? ' — ' + info.context : ''}`)
    }
  }, [hotIds, lookup, resetKey])
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
