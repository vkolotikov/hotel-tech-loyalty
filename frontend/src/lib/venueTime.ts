/**
 * Service-booking times in the full admin, read as the venue's clock.
 *
 * The server stores and sends an appointment's time as the venue's wall
 * clock (labelled +00:00). Passing it to `new Date()` and printing it in
 * the browser's zone moves it by that zone's offset — a 15:00 appointment
 * showed as 18:00 in Riga — and building calendar days through
 * `toISOString()` moved every date one day back east of UTC. Everything
 * here reads the wall clock from the text itself and does its calendar
 * arithmetic on UTC dates, which no zone moves. The appointments workspace
 * keeps the same rule (appointments/lib/wallClock.ts).
 */

/** 'YYYY-MM-DD' */
export type DayKey = string

const WALL = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/

/** A Date whose UTC fields are the wall clock. Only ever print it with `timeZone: 'UTC'`. */
function wallAsUtc(value: string | null | undefined): Date | null {
  const m = value ? WALL.exec(value) : null
  if (!m) return null
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], m[6] ? +m[6] : 0))
}

const keyUtc = (key: DayKey): Date => {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}
const keyOf = (utc: Date): DayKey => utc.toISOString().slice(0, 10)

/** The time of day, in the locale's usual form ('15:00', '03:00 PM'). Empty for no time. */
export function formatWallTime(value: string | null | undefined, locale?: string | string[], options: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' }): string {
  const d = wallAsUtc(value)
  return d ? d.toLocaleTimeString(locale ?? [], { ...options, timeZone: 'UTC' }) : ''
}

/** Date and time, as `toLocaleString()` would print them. Empty for no time. */
export function formatWallDateTime(value: string | null | undefined, locale?: string | string[]): string {
  const d = wallAsUtc(value)
  return d ? d.toLocaleString(locale ?? [], { timeZone: 'UTC' }) : ''
}

/** The hour of the venue's clock, or null. */
export function wallHour(value: string | null | undefined): number | null {
  const m = value ? WALL.exec(value) : null
  return m ? +m[4] : null
}

/** The venue's calendar date of a booking time. */
export function wallDay(value: string): DayKey {
  return value.slice(0, 10)
}

export function dayKey(year: number, month: number, day: number): DayKey {
  return keyOf(new Date(Date.UTC(year, month - 1, day)))
}

export function addDaysToKey(key: DayKey, days: number): DayKey {
  const d = keyUtc(key)
  d.setUTCDate(d.getUTCDate() + days)
  return keyOf(d)
}

/** Whole months later or earlier, kept on the last day when the month is shorter. */
export function addMonthsToKey(key: DayKey, months: number): DayKey {
  const [y, m, d] = key.split('-').map(Number)
  const first = new Date(Date.UTC(y, m - 1 + months, 1))
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
  return keyOf(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, lastDay))))
}

/** Monday 0 … Sunday 6 */
export function weekdayOfKey(key: DayKey): number {
  return (keyUtc(key).getUTCDay() + 6) % 7
}

export function mondayOfKey(key: DayKey): DayKey {
  return addDaysToKey(key, -weekdayOfKey(key))
}

export function weekKeys(key: DayKey): DayKey[] {
  const monday = mondayOfKey(key)
  return Array.from({ length: 7 }, (_, i) => addDaysToKey(monday, i))
}

/** Six Monday-first weeks: the month's own days and the days around them. */
export function monthGridKeys(year: number, month: number): DayKey[] {
  const start = mondayOfKey(dayKey(year, month, 1))
  return Array.from({ length: 42 }, (_, i) => addDaysToKey(start, i))
}

export function dayNumber(key: DayKey): number {
  return Number(key.slice(8, 10))
}

/** Today on this computer's own calendar (the desk's clock is the venue's). */
export function todayKey(now: Date = new Date()): DayKey {
  return dayKey(now.getFullYear(), now.getMonth() + 1, now.getDate())
}

/** A day's name, without moving it. */
export function formatDayKey(key: DayKey, locale?: string | string[], options: Intl.DateTimeFormatOptions = {}): string {
  return keyUtc(key).toLocaleDateString(locale ?? [], { ...options, timeZone: 'UTC' })
}
