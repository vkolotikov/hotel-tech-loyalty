import type { DateKey, Status, Wall } from './types'
import { dateOf, wallMinutes } from './wallClock'

export type Tone = 'pending' | 'confirmed' | 'progress' | 'completed' | 'cancelled' | 'noshow'

/** In the order the legend lists them. */
export const STATUSES: Status[] = ['pending', 'confirmed', 'in_progress', 'completed', 'no_show', 'cancelled']

export const STATUS_TONE: Record<Status, Tone> = {
  pending: 'pending',
  confirmed: 'confirmed',
  in_progress: 'progress',
  completed: 'completed',
  cancelled: 'cancelled',
  no_show: 'noshow',
}

/** Written out in full: Tailwind only generates classes it can see as literals. */
export const TONE_CLASS: Record<Tone, { text: string; tint: string; bar: string }> = {
  pending:   { text: 'text-a-st-pending',   tint: 'bg-a-st-pending/[0.12]',   bar: 'border-a-st-pending' },
  confirmed: { text: 'text-a-st-confirmed', tint: 'bg-a-st-confirmed/[0.12]', bar: 'border-a-st-confirmed' },
  progress:  { text: 'text-a-st-progress',  tint: 'bg-a-st-progress/[0.12]',  bar: 'border-a-st-progress' },
  completed: { text: 'text-a-st-completed', tint: 'bg-a-st-completed/[0.12]', bar: 'border-a-st-completed' },
  cancelled: { text: 'text-a-st-cancelled', tint: 'bg-a-st-cancelled/[0.12]', bar: 'border-a-st-cancelled' },
  noshow:    { text: 'text-a-st-noshow',    tint: 'bg-a-st-noshow/[0.12]',    bar: 'border-a-st-noshow' },
}

/**
 * The appointments whose time the grid treats as used: the three statuses
 * the scheduler refuses to book over (ServiceSchedulingService), and a
 * completed visit — its card fills that time, so a slot button under it
 * could be neither seen nor clicked. Only a cancellation or a no-show
 * leaves its time open on the grid.
 */
export const coversSlot = (status: Status): boolean => status !== 'cancelled' && status !== 'no_show'

/** The statuses the scheduler counts as taking a person's time — and the ones staff may move (Part F). */
export const LIVE: Status[] = ['pending', 'confirmed', 'in_progress']
export const isLive = (status: Status): boolean => LIVE.includes(status)

const LATE_AFTER_MIN = 15

interface Marked { status: Status; start: Wall }

/**
 * Not a status — a reading of two: a request still awaiting confirmation,
 * or a confirmed appointment more than 15 minutes past its start that
 * nobody has started.
 */
export function needsAttention(a: Marked, now: { date: DateKey; minutes: number }): boolean {
  if (a.status === 'pending') return true
  if (a.status !== 'confirmed') return false
  const day = dateOf(a.start)
  if (day !== now.date) return day < now.date
  return now.minutes - wallMinutes(a.start) > LATE_AFTER_MIN
}

export interface Overview { total: number; upcoming: number; in_progress: number; completed: number; attention: number }

/** Counts for one day, from the appointments given. Cancelled ones are not part of the day. */
export function dayOverview(appointments: Marked[], date: DateKey, now: { date: DateKey; minutes: number }): Overview {
  const day = appointments.filter(a => dateOf(a.start) === date && a.status !== 'cancelled')
  return {
    total: day.length,
    upcoming: day.filter(a => a.status === 'confirmed' && !needsAttention(a, now)).length,
    in_progress: day.filter(a => a.status === 'in_progress').length,
    completed: day.filter(a => a.status === 'completed').length,
    attention: day.filter(a => needsAttention(a, now)).length,
  }
}
