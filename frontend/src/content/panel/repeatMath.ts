import { addDays } from '../../workspace/lib/wallClock'
import type { BudgetStatus, DateKey, PostDetail, RepeatEvery } from '../lib/types'

/** The server's limits (ContentRepeat): copies, months after the post's day, copies the AI rewrites. */
export const MAX_COPIES = 26
export const MAX_MONTHS = 12
export const MAX_AI_COPIES = 12

const pad = (n: number) => String(n).padStart(2, '0')
/** Days in a month (`month` 1–12). */
const daysIn = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate()

/** A day `n` months on, kept in its month: the 31st becomes a shorter month's last day (Carbon's addMonthsNoOverflow). */
export function addMonthsKept(day: DateKey, n: number): DateKey {
  const [y, m, d] = day.split('-').map(Number)
  const total = y * 12 + (m - 1) + n
  const year = Math.floor(total / 12)
  const month = (total % 12) + 1
  return `${year}-${pad(month)}-${pad(Math.min(d, daysIn(year, month)))}`
}

/** The copies' days after `from`, up to `until` included, from `today` on: the server's ContentRepeat::dates. */
export function repeatDates(from: DateKey, every: RepeatEvery, until: DateKey, today: DateKey): DateKey[] {
  const out: DateKey[] = []
  for (let k = 1; k <= 400; k++) {
    const day = every === 'month' ? addMonthsKept(from, k) : addDays(from, (every === '2weeks' ? 14 : 7) * k)
    if (day > until) break
    if (day >= today) out.push(day)
  }
  return out
}

export type RepeatProblem = 'no_day' | 'until_too_far' | 'no_dates' | 'too_many_copies' | 'too_many_ai'

/** What stops a repeat before it is sent, in the server's order (RepeatController::store), so the portal names the limit. */
export function repeatProblem({ from, every, until, aiRewrite, today }: {
  from: DateKey | null; every: RepeatEvery; until: DateKey; aiRewrite: boolean; today: DateKey
}): RepeatProblem | null {
  if (from === null) return 'no_day'
  if (until > addMonthsKept(from, MAX_MONTHS)) return 'until_too_far'
  const count = repeatDates(from, every, until, today).length
  if (count === 0) return 'no_dates'
  if (count > MAX_COPIES) return 'too_many_copies'
  if (aiRewrite && count > MAX_AI_COPIES) return 'too_many_ai'
  return null
}

/** The panel reads its post again every few seconds only while the AI rewords the post's series (spec §8). */
export const pollsWhileRewording = (post: PostDetail | undefined): boolean =>
  // …and while the AI adapts a version of its group (spec 2026-10-19 §3.3).
  post?.series?.rewriting === true || (post?.group?.adapting.length ?? 0) > 0

/**
 * The end date Repeat offers: the date the person picked, or else four weeks after the post's day (today, if that day is
 * gone) — read again when the post's day changes, so a post moved weeks on never opens on "no day to repeat on".
 */
export function untilFor(picked: DateKey | null, from: DateKey | null, today: DateKey): DateKey {
  return picked ?? addDays(from !== null && from > today ? from : today, 28)
}

/** The AI rewords the copies only while the box is ticked and this month's AI budget is not used up. */
export const asksAi = (ticked: boolean, budget: BudgetStatus): boolean => ticked && budget !== 'over'
