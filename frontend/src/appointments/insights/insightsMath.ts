import type { DateKey, InsightsMoney } from '../lib/types'
import { addDays, addMonths, isDateKey, monthOf, weekdayOf } from '../lib/wallClock'

/** Part G's arithmetic, in one place: the server sends counts and money, the screen works out the rest (spec §5.1). */

export type Pick = 'this_week' | 'last_week' | 'this_month' | 'last_month'
export const PICKS: Pick[] = ['this_week', 'last_week', 'this_month', 'last_month']
export interface Range { from: DateKey; to: DateKey }

const lastDayOf = (month: string): DateKey => addDays(`${addMonths(month, 1)}-01`, -1)

/** A quick pick on the venue's calendar; weeks run Monday to Sunday, as in the calendar. */
export function rangeFor(pick: Pick, today: DateKey): Range {
  const monday = addDays(today, -weekdayOf(today))
  const month = monthOf(today)
  switch (pick) {
    case 'this_week': return { from: monday, to: addDays(monday, 6) }
    case 'last_week': return { from: addDays(monday, -7), to: addDays(monday, -1) }
    case 'this_month': return { from: `${month}-01`, to: lastDayOf(month) }
    case 'last_month': {
      const before = addMonths(month, -1)
      return { from: `${before}-01`, to: lastDayOf(before) }
    }
  }
}

export function pickOf(range: Range, today: DateKey): Pick | 'custom' {
  return PICKS.find(p => {
    const r = rangeFor(p, today)
    return r.from === range.from && r.to === range.to
  }) ?? 'custom'
}

/** The period in the address, or This week when it is missing or garbled. The server judges the rest (From after To, a year). */
export function rangeFromSearch(params: URLSearchParams, today: DateKey): Range {
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  return isDateKey(from) && isDateKey(to) ? { from, to } : rangeFor('this_week', today)
}

/** A share of bookings due; null when nothing was due (spec §4.3). */
export function share(count: number, due: number): number | null {
  return due > 0 ? count / due : null
}

/** "5.6%" under 10%, "78%" from 10%, "—" without a rate. */
export function formatShare(value: number | null, locale: string): string {
  if (value === null) return '—'
  const digits = value > 0 && value < 0.1 ? 1 : 0
  return new Intl.NumberFormat(locale, { style: 'percent', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)
}

export type Direction = 'up' | 'down' | 'same'
export interface Change { direction: Direction; delta: number }

const changeOf = (diff: number): Change => ({ direction: diff > 0 ? 'up' : diff < 0 ? 'down' : 'same', delta: Math.abs(diff) })

export const countChange = (now: number, before: number): Change => changeOf(now - before)

/** In percentage points, to one decimal; none when either period had nothing due. */
export function pointsChange(now: number | null, before: number | null): Change | null {
  if (now === null || before === null) return null
  return changeOf(Math.round((now - before) * 1000) / 10)
}

/** Only when both periods had money in that currency. */
export function moneyChange(now: number | undefined, before: number | undefined): Change | null {
  if (now === undefined || before === undefined) return null
  return changeOf(Math.round((now - before) * 100) / 100)
}

export type Metric = 'done' | 'no_show' | 'late_cancel' | 'value_done' | 'average' | 'taken'
const HIGHER_IS_BETTER: Record<Metric, boolean> = { done: true, no_show: false, late_cancel: false, value_done: true, average: true, taken: true }

export function toneOf(metric: Metric, direction: Direction): 'good' | 'bad' | 'plain' {
  if (direction === 'same') return 'plain'
  return (direction === 'up') === HIGHER_IS_BETTER[metric] ? 'good' : 'bad'
}

export const TONE_CLASS: Record<'good' | 'bad' | 'plain', string> = { good: 'text-a-st-confirmed', bad: 'text-a-danger', plain: 'text-a-text-2' }
export const ARROW: Record<Direction, string> = { up: '▲', down: '▼', same: '' }

export const average = (m: InsightsMoney): number | null => (m.done > 0 ? m.value_done / m.done : null)

export function onlineShare(s: { online: number; desk: number; other: number }): number | null {
  return share(s.online, s.online + s.desk + s.other)
}

/** "6–12 Oct 2026" in the reader's language; venue dates, so read in UTC. */
export function formatPeriod(range: Range, locale: string): string {
  const fmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  return fmt.formatRange(new Date(`${range.from}T00:00:00Z`), new Date(`${range.to}T00:00:00Z`))
}

export const needsDeskNote = (from: DateKey, since: DateKey): boolean => from < since
