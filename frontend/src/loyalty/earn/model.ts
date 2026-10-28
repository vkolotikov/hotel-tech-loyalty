import { decimalOf } from '../lib/forms'
import { groupOf, type OptionsTab } from '../options/groups'
import { isOn } from '../options/optionsMath'
import type { OptionsAnswer, Way } from '../options/types'

export type EarnStatus = 'all' | 'active' | 'off'
export function earnLocation(search: string, ways: Way[]) {
  const p = new URLSearchParams(search)
  const way = ways.find(w => w.key === p.get('way'))?.key ?? null
  const asked = p.get('tab')
  const tab: OptionsTab = ['earn', 'bonus', 'rule', 'more', 'overview'].includes(asked ?? '') ? asked as OptionsTab : way ? groupOf(way) : 'earn'
  const selected = ways.find(w => w.key === (way ?? p.get('selected')) && groupOf(w.key) === tab)?.key ?? null
  return { tab, way: way && groupOf(way) === tab ? way : null, selected, q: p.get('q') ?? '', status: (['active', 'off'].includes(p.get('status') ?? '') ? p.get('status') : 'all') as EarnStatus }
}

/** Retain tab/way bookmarks; selection and filtering do not create a rule or write settings. */
export function earningUrl(tab: OptionsTab, values: { way?: string | null; selected?: string | null; q?: string; status?: EarnStatus } = {}) {
  const p = new URLSearchParams({ tab })
  for (const [key, value] of Object.entries(values)) if (value && value !== 'all') p.set(key, value)
  return `/loyalty/options?${p}`
}

export function filteredWays(answer: OptionsAnswer, group: OptionsTab, q: string, status: EarnStatus, text: (way: Way) => string) {
  const needle = q.trim().toLocaleLowerCase()
  return answer.ways.filter(w => groupOf(w.key) === group && (!needle || text(w).toLocaleLowerCase().includes(needle))
    && (status === 'all' || isOn(w, answer.options) === (status === 'active')))
}

/** Illustrative base only, matching the engine's whole-point floor; never used for an award. */
export function baseExample(amount: string, rate: string): number | null {
  const a = decimalOf(amount), r = decimalOf(rate)
  if (a === null || r === null || a < 0 || r <= 0 || !Number.isSafeInteger(Math.floor(a * r))) return null
  return Math.floor(a * r)
}
