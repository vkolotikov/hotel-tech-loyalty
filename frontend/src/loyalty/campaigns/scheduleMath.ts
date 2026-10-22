import { addDays, dateOf, formatDate, minutesOf, timeOf, venueNow, type DateKey, type Wall } from '../../workspace/lib/wallClock'
import type { ApiFailure } from '../lib/api'
import { isDay } from './campaignsMath'

/**
 * Send later's decisions (spec 2026-10-22 release 4 §5), for email campaigns, push messages and SMS alike, kept out of
 * the components so they can be tested: whether a typed time is one the server takes, the time a new schedule starts
 * from, what the server's `bad_time` says, how a scheduled time reads, and what a scheduled send's page offers. A
 * time is the venue's wall clock (`YYYY-MM-DDTHH:mm`, no offset): it is never handed to `new Date()`. The server decides
 * every time again (App\Services\Loyalty\Campaigns\SendLater); these only choose what to show.
 */

/** A send waiting for its time (SendLater::STATUS). */
export const SCHEDULED = 'scheduled'

export const isScheduled = (status: string): boolean => status === SCHEDULED

/** How a send goes: at once, or at a time on the venue's clock. */
export type SendMode = 'now' | 'later'

/** The earliest a time may be, in minutes from now (SendLater::MIN_LEAD_MINUTES). */
export const MIN_LEAD_MINUTES = 2

/** The reasons the server's `bad_time` gives (SendLater). */
export const BAD_TIME_REASONS = ['format', 'past', 'too_far', 'not_on_clock'] as const

/** A time written as the server takes it: a real day, then the hour and minute (`2026-10-06T10:00`). */
export function isWall(value: string): boolean {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(value)
  return !!m && isDay(m[1]) && Number(m[2]) < 24 && Number(m[3]) < 60
}

/** Where a new schedule starts: tomorrow at 10:00 on the venue's clock. */
export function defaultSendAt(today: DateKey): Wall {
  return `${addDays(today, 1)}T10:00`
}

/**
 * What is wrong with a typed time before it is sent (`format`, or `past`: less than two minutes from the venue's now),
 * or null. The rest (too far ahead, a time the venue's clock skips) is the server's to say.
 */
export function laterProblem(value: string, now: { date: DateKey; minutes: number }): 'format' | 'past' | null {
  if (!isWall(value)) return 'format'
  const day = dateOf(value)
  if (day < now.date) return 'past'
  if (day === now.date && minutesOf(timeOf(value)) < now.minutes + MIN_LEAD_MINUTES) return 'past'
  return null
}

/** The venue's now, for laterProblem (the browser's clock read on the venue's zone). */
export const venueClockNow = (timeZone: string, at?: Date): { date: DateKey; minutes: number } => venueNow(timeZone, at)

/** The reason a refused schedule gives, when it is one the words name; null for any other refusal. */
export function badTimeReason(failure: ApiFailure | null): string | null {
  if (!failure || failure.code !== 'bad_time') return null
  const reason = failure.extra.reason
  return typeof reason === 'string' && (BAD_TIME_REASONS as readonly string[]).includes(reason) ? reason : 'format'
}

/** A scheduled time as it reads: "Tue, 6 Oct, 10:00" in the reader's language, the venue's digits unchanged. */
export function scheduledWhen(wall: string | null, locale: string): string {
  if (!wall || !isWall(wall)) return ''
  return `${formatDate(dateOf(wall), locale, { weekday: 'short', day: 'numeric', month: 'short' })}, ${timeOf(wall)}`
}

/** A waiting send can be moved or taken back to a draft; anything else neither. */
export function scheduleActions(status: string): { move: boolean; takeBack: boolean } {
  const waiting = isScheduled(status)
  return { move: waiting, takeBack: waiting }
}

/** After a refused schedule or take-back: whether the item itself must be read again (its state moved on). */
export function scheduleRefusalRefreshes(code: string): boolean {
  return ['already_started', 'changed', 'not_scheduled', 'not_a_draft', 'incomplete', 'not_found', 'not_editable_here'].includes(code)
}
