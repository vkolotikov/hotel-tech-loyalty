import type { DateKey, HoursRow } from './types'
import { minutesOf } from './wallClock'

/** Monday first, as a week is read at the desk; the values are the server's day numbers (0 = Sunday). */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const
export const MAX_WINDOWS = 6

export interface Window { start: string; end: string }
export type Week = Record<number, Window[]>
export type DayProblem = 'format' | 'order' | 'overlap' | 'too_many'

/** `HH:MM` from 00:00 to 23:59, or 24:00 as an end: the server's own pattern (WeeklyHours). */
const TIME = /^(([01]\d|2[0-3]):[0-5]\d|24:00)$/

const emptyWeek = (): Week => ({ 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] })

/** Rows → days. A switched-off row is left out: it has no effect, and saving here writes the week without it. */
export function toWeek(rows: HoursRow[]): Week {
  const week = emptyWeek()
  for (const row of rows) if (row.is_active !== false) week[row.day_of_week].push({ start: row.start_time, end: row.end_time })
  for (const day of Object.keys(week)) week[Number(day)].sort((a, b) => a.start.localeCompare(b.start))
  return week
}

export function toRows(week: Week): HoursRow[] {
  return WEEK_ORDER.flatMap(day => week[day].map(w => ({ day_of_week: day, start_time: w.start, end_time: w.end })))
}

/** Monday to Friday take `from`'s windows; Saturday and Sunday keep theirs. */
export function copyToWeekdays(week: Week, from: number): Week {
  const next: Week = { ...week }
  for (const day of [1, 2, 3, 4, 5]) next[day] = week[from].map(w => ({ ...w }))
  return next
}

/** The server's own rules for one day (WeeklyHours), checked while the person types. */
export function dayProblem(windows: Window[]): DayProblem | null {
  if (windows.some(w => !TIME.test(w.start) || !TIME.test(w.end))) return 'format'
  if (windows.length > MAX_WINDOWS) return 'too_many'
  const spans = windows.map(w => [minutesOf(w.start), minutesOf(w.end)] as const)
  if (spans.some(([start, end]) => !(end > start))) return 'order'
  const sorted = [...spans].sort((a, b) => a[0] - b[0])
  for (let i = 1; i < sorted.length; i++) if (sorted[i][0] < sorted[i - 1][1]) return 'overlap'
  return null
}

/** A date in the week of Monday 5 October 2026, for printing a weekday's name with formatDate(). */
export function dayDate(dayOfWeek: number): DateKey {
  return `2026-10-${String(dayOfWeek === 0 ? 11 : 4 + dayOfWeek).padStart(2, '0')}`
}
