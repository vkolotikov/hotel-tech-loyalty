import type { Platform, PostStatus } from '../lib/types'
import type { PlanFilter, PlanView } from './planMath'

/** The Plan's choices on this device: the view and the filters (spec §4.2). Kept apart from the look (lib/look.ts). */
export const PREFS_KEY = 'content:plan'

/** `keyDates`: the Key dates layer shows (spec 2026-10-16 §3.4; on until switched off on this device). */
export interface PlanPrefs { view: PlanView; filter: PlanFilter; keyDates: boolean }
export const DEFAULT_PREFS: PlanPrefs = { view: 'week', filter: { platforms: [], status: 'all' }, keyDates: true }

const VIEWS: readonly PlanView[] = ['week', 'month', 'list']

/** Whatever is stored, a usable answer: anything unknown or broken falls back to the default, one field at a time. */
export function parsePrefs(raw: string | null, platforms: readonly string[], statuses: readonly string[]): PlanPrefs {
  let value: unknown = null
  try { value = raw ? JSON.parse(raw) : null } catch { value = null }
  const o = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  const f = (o.filter && typeof o.filter === 'object' ? o.filter : {}) as Record<string, unknown>
  return {
    view: VIEWS.includes(o.view as PlanView) ? (o.view as PlanView) : DEFAULT_PREFS.view,
    filter: {
      platforms: Array.isArray(f.platforms) ? (f.platforms.filter(p => typeof p === 'string' && platforms.includes(p)) as Platform[]) : [],
      status: typeof f.status === 'string' && statuses.includes(f.status) ? (f.status as PostStatus) : 'all',
    },
    keyDates: typeof o.keyDates === 'boolean' ? o.keyDates : true,
  }
}

export function loadPrefs(platforms: readonly string[], statuses: readonly string[]): PlanPrefs {
  try {
    return parsePrefs(window.localStorage.getItem(PREFS_KEY), platforms, statuses)
  } catch {
    return DEFAULT_PREFS
  }
}

export function savePrefs(prefs: PlanPrefs): void {
  try { window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)) } catch { /* a private window: the choice lasts this visit */ }
}
