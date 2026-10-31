import { addDays } from '../shared/portal'

/**
 * The stay dates picker's calendar arithmetic, on plain `YYYY-MM-DD` days (the venue's calendar, never a time zone).
 * The portal uses the browser's own date inputs; the phone shows a month grid instead, so these are the app's own.
 */

/** A month's days in weeks starting on Monday, with null before the 1st and after the last day. */
export function monthGrid(month: string): (string | null)[][] {
  const first = `${month}-01`
  const offset = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7
  const cells: (string | null)[] = Array.from({ length: offset }, () => null)
  for (let day = first; day.startsWith(month); day = addDays(day, 1)) cells.push(day)
  while (cells.length % 7 !== 0) cells.push(null)
  return Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7))
}

/** The month `n` months after `month` (`YYYY-MM`). */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number)
  const index = y * 12 + (m - 1) + n
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`
}

/**
 * What a tap on a day makes of the chosen dates: the first tap (or a tap after a whole stay is chosen, or on or before
 * the arrival) picks the arrival; the next, later tap picks the departure. The flow's reducer checks the rest.
 */
export function rangeTap(checkIn: string | null, checkOut: string | null, day: string): { checkIn: string; checkOut: string | null } {
  if (!checkIn || checkOut || day <= checkIn) return { checkIn: day, checkOut: null }
  return { checkIn, checkOut: day }
}
