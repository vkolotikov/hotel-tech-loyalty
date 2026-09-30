import type { DateKey, Wall } from './types'

/**
 * Time in the workspace.
 *
 * An appointment's time is the VENUE's wall clock — a string like
 * `2026-10-06T10:00` with no zone. It is read and written as digits and is
 * never turned into a `Date`: the browser would read it in its own zone and
 * a receptionist working from another country would see every card an hour
 * or two off. Dates are keys (`2026-10-06`) and their arithmetic runs in
 * UTC, where no clock change exists. The venue's zone is used for one
 * thing: what "now" is at the venue.
 */
const pad = (n: number): string => String(n).padStart(2, '0')

export const dateOf = (wall: Wall): DateKey => wall.slice(0, 10)
export const timeOf = (wall: Wall): string => wall.slice(11, 16)

export function minutesOf(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

export const wallMinutes = (wall: Wall): number => minutesOf(timeOf(wall))

export function hhmm(minutes: number): string {
  const m = Math.max(0, Math.min(1440, Math.round(minutes)))
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
}

export const makeWall = (date: DateKey, minutes: number): Wall => `${date}T${hhmm(minutes)}`

export const isDateKey = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value)

function utc(date: DateKey): number {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

function keyOf(ms: number): DateKey {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

export const addDays = (date: DateKey, n: number): DateKey => keyOf(utc(date) + n * 86_400_000)

/** 0 = Monday … 6 = Sunday. */
export const weekdayOf = (date: DateKey): number => (new Date(utc(date)).getUTCDay() + 6) % 7

export function weekOf(date: DateKey): DateKey[] {
  const monday = addDays(date, -weekdayOf(date))
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

/** 'YYYY-MM' */
export const monthOf = (date: DateKey): string => date.slice(0, 7)

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number)
  const total = y * 12 + (m - 1) + n
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`
}

/** Six Monday-first weeks that contain the month. */
export function monthGrid(month: string): DateKey[] {
  const first = `${month}-01`
  const start = addDays(first, -weekdayOf(first))
  return Array.from({ length: 42 }, (_, i) => addDays(start, i))
}

/** The venue's date and minutes past midnight at `at` (now, by default). A zone the browser does not know is read as UTC. */
export function venueNow(timeZone: string, at: Date = new Date()): { date: DateKey; minutes: number } {
  const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }
  let parts: Intl.DateTimeFormatPart[]
  try {
    parts = new Intl.DateTimeFormat('en-CA', { ...options, timeZone }).formatToParts(at)
  } catch {
    parts = new Intl.DateTimeFormat('en-CA', { ...options, timeZone: 'UTC' }).formatToParts(at)
  }
  const get = (type: string): string => parts.find(p => p.type === type)?.value ?? '00'
  return { date: `${get('year')}-${get('month')}-${get('day')}`, minutes: Number(get('hour')) * 60 + Number(get('minute')) }
}

/** A date key as text. Formatted in UTC from a UTC midnight, so the browser's zone cannot shift the day. */
export function formatDate(
  date: DateKey,
  locale: string,
  options: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' },
): string {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(new Date(utc(date)))
}

/** An audit timestamp — a real instant, unlike an appointment's time — on the venue's clock. */
export function formatInstant(iso: string, locale: string, timeZone: string): string {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return ''
  const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }
  try {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(new Date(ms))
  } catch {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(new Date(ms))
  }
}
