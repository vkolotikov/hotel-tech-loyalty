/**
 * Round 5 (owner 2026-11-12, "implement all features we have in our main platform"): the alerts the full admin gives —
 * a chat that starts waiting for a person, a new hot lead — across HexaTech CRM. The decisions are pure, for the tests:
 * what a poll means (a rise, never the first look, never the person's own doing), what the tab's title and icon say,
 * whether a sound plays and a desktop notification shows, and what the Alerts switch does.
 */

/** How often the counts are asked for while the tab is visible. */
export const ALERT_POLL_MS = 15_000

/** How long the person's own action (a lead captured from a chat) is waited for in the counts. */
export const OWN_TTL_MS = 60_000

/** What is counted: the chats waiting for a person (`chat-inbox/stats`), the hot leads (`engagement/kpis`). */
export type Signal = 'waiting' | 'hot'

/** One poll's figures; a figure not asked (no Engagement hub) or not answered yet is null. */
export interface Reading { waiting: number | null; hot: number | null }

/** Something the person did that the next poll will count (and so must not alert them about). */
export interface OwnNote { signal: Signal; at: number }

export interface AlertState {
  /** What the figures are of (the brand chosen): another one starts again without alerting. */
  key: string | null
  /** The figures last seen, each set by its first answer. */
  last: Reading
  /** Whether the title and the icon say something: from a rise until there is nothing left to say. */
  armed: boolean
  /** Hot leads that arrived since the badge came on and the person has not looked at Visitors. */
  newHot: number
}

export type Alert = { signal: 'waiting'; rise: number; total: number } | { signal: 'hot'; rise: number }

export const START: AlertState = { key: null, last: { waiting: null, hot: null }, armed: false, newHot: 0 }

const fresh = (n: number | null | undefined): number | null => (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.floor(n) : null)

/**
 * One poll. The first figure of each kind (and every figure after the brand changed) is where counting starts: nothing
 * on first load. After that a figure above the last one is a rise, less what the person did themselves since (their own
 * notes, each counted once and forgotten after OWN_TTL_MS); a figure below it is simply the new level.
 */
export function step(state: AlertState, reading: Reading, key: string, own: readonly OwnNote[], now: number): {
  state: AlertState
  alerts: Alert[]
  own: OwnNote[]
} {
  let notes = own.filter(n => now - n.at <= OWN_TTL_MS)
  if (state.key !== key) {
    return { state: { ...START, key, last: { waiting: fresh(reading.waiting), hot: fresh(reading.hot) } }, alerts: [], own: [] }
  }
  const alerts: Alert[] = []
  const last: Reading = { ...state.last }
  let newHot = state.newHot
  for (const signal of ['waiting', 'hot'] as const) {
    const now_ = fresh(reading[signal])
    if (now_ === null) continue
    const before = state.last[signal]
    last[signal] = now_
    if (before === null || now_ <= before) continue
    let rise = now_ - before
    const mine = notes.filter(n => n.signal === signal).slice(0, rise)
    if (mine.length) {
      rise -= mine.length
      notes = notes.filter(n => !mine.includes(n))
    }
    if (rise <= 0) continue
    if (signal === 'waiting') alerts.push({ signal, rise, total: now_ })
    else { alerts.push({ signal, rise }); newHot += rise }
  }
  const armed = state.armed || alerts.length > 0
  const next: AlertState = { key, last, armed, newHot: armed ? newHot : 0 }
  return { state: settle(next), alerts, own: notes }
}

/** The person looked at the new leads (Visitors is open): they no longer count in the title. */
export function sawHot(state: AlertState): AlertState {
  return state.newHot === 0 ? state : settle({ ...state, newHot: 0 })
}

/** The number in the tab's title and on its icon: the chats waiting and the new hot leads, once a rise armed it. */
export function badgeCount(state: AlertState): number {
  return state.armed ? (state.last.waiting ?? 0) + state.newHot : 0
}

/** Nothing left to say: the title and the icon go back to how they were. */
function settle(state: AlertState): AlertState {
  return state.armed && badgeCount(state) === 0 ? { ...state, armed: false, newHot: 0 } : state
}

const BADGE = /^\(\d+\)\s+/

/** The title without a badge of ours. */
export function stripBadge(title: string): string {
  return title.replace(BADGE, '')
}

/** "(3) HexaTech CRM"; the plain title for 0. */
export function titleWith(title: string, n: number): string {
  const plain = stripBadge(title)
  return n > 0 ? `(${n > 99 ? '99+' : n}) ${plain}` : plain
}

/**
 * The chime (the inbox's own sound setting): for a hot lead anywhere, and for a waiting chat away from the inbox — the
 * inbox chimes by itself when a visitor writes, and twice would be once too many.
 */
export function shouldSound(alerts: readonly Alert[], input: { soundOn: boolean; onInbox: boolean }): boolean {
  if (!input.soundOn || alerts.length === 0) return false
  return alerts.some(a => a.signal === 'hot') || !input.onInbox
}

export type Permission = 'unsupported' | 'default' | 'granted' | 'denied'

/** A desktop notification: only when the person switched it on here, the browser allows it, and they look elsewhere. */
export function shouldNotify(alerts: readonly Alert[], input: { permission: Permission; wanted: boolean; focused: boolean }): boolean {
  return alerts.length > 0 && input.wanted && input.permission === 'granted' && !input.focused
}

export type ToggleAction = 'ask' | 'on' | 'off' | 'none'

/**
 * The Alerts switch in the inbox's header: whether it shows as on, whether it can be pressed, and what a press does —
 * ask the browser (only ever from here), switch alerts on or off on this device, or nothing (blocked or unsupported).
 */
export function toggleState(permission: Permission, wanted: boolean): { on: boolean; action: ToggleAction; reason: 'on' | 'off' | 'blocked' | 'unsupported' } {
  if (permission === 'unsupported') return { on: false, action: 'none', reason: 'unsupported' }
  if (permission === 'denied') return { on: false, action: 'none', reason: 'blocked' }
  if (permission === 'default') return { on: false, action: 'ask', reason: 'off' }
  return wanted ? { on: true, action: 'off', reason: 'on' } : { on: false, action: 'on', reason: 'off' }
}

/** Where an alert leads: the waiting chats, or the hot leads among the visitors. */
export function alertTarget(alerts: readonly Alert[]): string {
  return alerts.some(a => a.signal === 'waiting') ? '/crm/inbox?status=waiting' : '/crm/visitors?tab=hot_lead'
}
