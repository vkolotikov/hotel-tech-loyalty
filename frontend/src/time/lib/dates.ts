/**
 * Days and clocks as the planner stores them: a day is `YYYY-MM-DD`, a time `HH:MM`, both the venue's wall clock.
 * Every step here is plain arithmetic on those digits (through UTC dates), never `new Date('YYYY-MM-DD')` in the
 * browser's zone, so a person abroad sees the venue's days.
 */

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/

function parse(ymd: string): Date {
  const m = DAY.exec(ymd)
  if (!m) throw new Error(`not a day: ${ymd}`)
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
}

function format(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

export function isDay(value: unknown): value is string {
  if (typeof value !== 'string' || !DAY.test(value)) return false
  return format(parse(value)) === value
}

export function addDays(ymd: string, days: number): string {
  const d = parse(ymd)
  d.setUTCDate(d.getUTCDate() + days)
  return format(d)
}

/** 1 = Monday … 7 = Sunday. */
export function isoWeekday(ymd: string): number {
  const w = parse(ymd).getUTCDay()
  return w === 0 ? 7 : w
}

/** The Monday of the day's week. */
export function weekStart(ymd: string): string {
  return addDays(ymd, 1 - isoWeekday(ymd))
}

/** Whole days from a to b (b later is positive). */
export function daysBetween(a: string, b: string): number {
  return Math.round((parse(b).getTime() - parse(a).getTime()) / 86_400_000)
}

/** The first day of the day's month. */
export function monthStart(ymd: string): string {
  return `${ymd.slice(0, 8)}01`
}

export function toMinutes(hhmm: string | null | undefined): number | null {
  const m = /^(\d{2}):(\d{2})/.exec(hhmm ?? '')
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

export function toClock(minutes: number): string {
  const v = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutes)))
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`
}

/** The time rounded to a step (minutes), for a drop on the timeline. */
export function snap(minutes: number, step = 15): number {
  return Math.round(minutes / step) * step
}
