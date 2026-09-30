export type View = 'day' | 'week' | 'list'

/** Display preferences, per browser. They change what is shown — never what is available and never who may see it. */
export interface Prefs { view: View; masterId: number | null; showCancelled: boolean }

export const DEFAULT_PREFS: Prefs = { view: 'day', masterId: null, showCancelled: false }

const KEY = 'appointments:prefs'
const VIEWS: readonly string[] = ['day', 'week', 'list']

export function parsePrefs(raw: string | null): Prefs {
  let value: unknown
  try {
    value = raw ? JSON.parse(raw) : null
  } catch {
    value = null
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return DEFAULT_PREFS
  const v = value as Record<string, unknown>

  return {
    view: typeof v.view === 'string' && VIEWS.includes(v.view) ? (v.view as View) : DEFAULT_PREFS.view,
    masterId: typeof v.masterId === 'number' && Number.isInteger(v.masterId) ? v.masterId : null,
    showCancelled: v.showCancelled === true,
  }
}

export function loadPrefs(): Prefs {
  try {
    return parsePrefs(window.localStorage.getItem(KEY))
  } catch {
    return DEFAULT_PREFS
  }
}

export function savePrefs(prefs: Prefs): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch {
    /* a private window or a full store: the preference simply is not kept */
  }
}
