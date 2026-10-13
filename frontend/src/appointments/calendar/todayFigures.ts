import { dayOverview } from '../lib/status'
import type { AppointmentSummary, CalendarMaster, DateKey, Takings } from '../lib/types'
import { dateOf, wallMinutes } from '../lib/wallClock'

export interface TodayFigures {
  total: number; done: number; noShow: number; attention: number
  next: AppointmentSummary | null; nextIsFirst: boolean
  teamIn: CalendarMaster[]; teamOff: CalendarMaster[]
}

/** The day at a glance (spec §5.4), from what the calendar already holds — no second source of numbers. */
export function todayFigures(appointments: AppointmentSummary[], masters: CalendarMaster[], date: DateKey, now: { date: DateKey; minutes: number }): TodayFigures {
  const day = appointments.filter(a => dateOf(a.start) === date && a.status !== 'cancelled')
    .sort((a, b) => a.start.localeCompare(b.start) || a.id - b.id)
  const isToday = date === now.date
  const next = isToday
    ? day.find(a => (a.status === 'pending' || a.status === 'confirmed') && wallMinutes(a.start) >= now.minutes) ?? null
    : day[0] ?? null
  const working = (m: CalendarMaster) => {
    const d = m.days[date]
    if (!d || d.windows.length === 0) return false
    return !d.time_off.some(off => off.start === null && off.end === null)
  }
  return {
    total: day.length,
    done: day.filter(a => a.status === 'completed').length,
    noShow: day.filter(a => a.status === 'no_show').length,
    attention: dayOverview(appointments, date, now).attention,
    next,
    nextIsFirst: !isToday,
    teamIn: masters.filter(working),
    teamOff: masters.filter(m => !working(m)),
  }
}

/**
 * Net money taken on the day in one currency, and how many payments made it (the Takings screen's own figures).
 * A refund lowers the amount but is not a payment.
 */
export function takenNet(t: Takings, currency: string): { amount: number; payments: number } {
  const methods = t.totals[currency] ?? {}
  const amount = Object.values(methods).reduce((sum, m) => sum + (m?.in ?? 0) - (m?.out ?? 0), 0)
  const payments = t.rows.filter(r => r.currency === currency && r.kind === 'payment').length
  return { amount: Math.round(amount * 100) / 100, payments }
}

/** The most people the Team tile draws as avatars, however wide it is; the rest are counted ("+3"). */
export const MAX_AVATARS = 6
/** An avatar is 36 px; each further one adds 30 px (it overlaps the last by 6). Their 2 px rings may reach into the tile's padding. */
const AVATAR_FIRST = 36
const AVATAR_STEP = 30

/**
 * How many of `people` the Team tile draws in a row `width` px wide, and how many it counts instead: everyone the
 * row has room for, else as many as leave the last place to the "+N" circle — never more than MAX_AVATARS. A row
 * not measured yet (0: on the server, before the first layout) draws up to MAX_AVATARS.
 */
export function avatarsThatFit(people: number, width: number): { shown: number; more: number } {
  const room = width > 0 ? Math.max(1, Math.floor((width - AVATAR_FIRST) / AVATAR_STEP) + 1) : MAX_AVATARS + 1
  if (people <= Math.min(room, MAX_AVATARS)) return { shown: people, more: 0 }
  const shown = Math.max(0, Math.min(MAX_AVATARS, room - 1))
  return { shown, more: people - shown }
}
