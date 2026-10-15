import { addDays, addMonths, isDateKey, monthOf, weekOf } from '../../workspace/lib/wallClock'
import { MAX_RANGE_DAYS } from '../lib/constants'
import type { DateKey } from '../lib/types'

/** Generate's ranges (spec §4.2): this week, next week, this month, or the days a manager picks (at most 62). */
export type Preset = 'this_week' | 'next_week' | 'this_month' | 'custom'
export const PRESETS: readonly Preset[] = ['this_week', 'next_week', 'this_month', 'custom']

/** The presets' English names (generateMath.test.ts keeps the bundle equal to these). */
export const PRESET_TEXT: Record<Preset, string> = { this_week: 'This week', next_week: 'Next week', this_month: 'This month', custom: 'Custom' }

/** The days a preset covers on the venue's clock. The server starts at the venue's today in any case. */
export function presetRange(preset: Exclude<Preset, 'custom'>, today: DateKey): { from: DateKey; to: DateKey } {
  if (preset === 'this_month') {
    const month = monthOf(today)
    return { from: `${month}-01`, to: addDays(`${addMonths(month, 1)}-01`, -1) }
  }
  const week = weekOf(preset === 'next_week' ? addDays(today, 7) : today)
  return { from: week[0], to: week[6] }
}

/** Days from `from` to `to`, both counted. */
export function daysIn(from: DateKey, to: DateKey): number {
  const ms = (d: DateKey) => { const [y, m, day] = d.split('-').map(Number); return Date.UTC(y, m - 1, day) }
  return Math.round((ms(to) - ms(from)) / 86_400_000) + 1
}

export type RangeProblem = 'missing' | 'order' | 'too_long' | 'past'

/** The English words for each problem (generateMath.test.ts keeps the bundle equal to these). */
export const PROBLEM_TEXT: Record<RangeProblem, string> = {
  missing: 'Choose both days.',
  order: 'The last day comes before the first.',
  too_long: 'Choose at most 62 days.',
  past: 'These days are already over.',
}

/** What is wrong with a range before it is sent, or null. */
export function rangeProblem(from: string, to: string, today: DateKey): RangeProblem | null {
  if (!isDateKey(from) || !isDateKey(to)) return 'missing'
  if (to < from) return 'order'
  if (daysIn(from, to) > MAX_RANGE_DAYS) return 'too_long'
  if (to < today) return 'past'
  return null
}
