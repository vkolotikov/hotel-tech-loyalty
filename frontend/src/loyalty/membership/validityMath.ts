import { isDateKey } from '../../workspace/lib/wallClock'
import type { Can, MemberRow } from '../lib/types'
import { LEFT_WORDS } from './words'

/**
 * A membership's end date on the workspace's screens (release 8, spec 2026-10-25 §3), kept out of the components so it
 * can be tested by value: who may change it, the new end each Extend choice gives (said before it is saved), how long is
 * left, what the card's lines say, what Set a date refuses and what each change sends. The state and the saved date are
 * the server's (MembershipValidity); the end Extend gives is worked out here only to say it, and the server works it out
 * again. Days are the venue's `YYYY-MM-DD`, never passed to `new Date()` as a local time.
 */

export type MembershipState = NonNullable<MemberRow['membership_state']>
export type Extension = '1m' | '3m' | '6m' | '1y'

/** Extend's quick choices and their months (MembershipValidity::EXTENSIONS). */
export const EXTENSIONS: readonly Extension[] = ['1m', '3m', '6m', '1y']
export const EXTENSION_MONTHS: Record<Extension, number> = { '1m': 1, '3m': 3, '6m': 6, '1y': 12 }

/** What a change sends: a date (or none, to remove it), or an extension; with this press's key. */
export type ValidityBody = ({ valid_until: string | null } | { extend: Extension }) & { idempotency_key: string }

/** A manager changes a membership's end date (as a tier change); everyone else reads it. A deleted member has none. */
export function validityActions(can: Can, member: { is_erased?: boolean }): { change: boolean } {
  return { change: can.manage_members && !member.is_erased }
}

function parts(date: string): [number, number, number] {
  const [y, m, d] = date.split('-').map(Number)
  return [y, m, d]
}

const pad = (n: number): string => String(n).padStart(2, '0')
const daysIn = (y: number, m: number): number => new Date(Date.UTC(y, m, 0)).getUTCDate()

/** Whole days from one venue day to another (negative when the second is earlier). */
export function daysBetween(from: string, to: string): number {
  const [a, b] = [parts(from), parts(to)]
  return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86_400_000)
}

/** A day `months` months on, on the month's last day when it has no such day (31 January + 1 month: 28 or 29 February). */
export function addMonthsTo(date: string, months: number): string {
  const [y, m, d] = parts(date)
  const total = y * 12 + (m - 1) + months
  const year = Math.floor(total / 12)
  const month = (total % 12) + 1
  return `${year}-${pad(month)}-${pad(Math.min(d, daysIn(year, month)))}`
}

/** The end an Extend choice gives: its months after the later of the venue's today and the current end. */
export function extendedEnd(current: string | null | undefined, today: string, choice: Extension): string {
  const from = current && current > today ? current : today
  return addMonthsTo(from, EXTENSION_MONTHS[choice])
}

/** How long is left from today to the last day: whole years, then months, then days (the last day counts as left). */
export function timeLeft(today: string, end: string): { years: number; months: number; days: number } {
  if (end < today) return { years: 0, months: 0, days: 0 }
  let months = 0
  while (addMonthsTo(today, months + 1) <= end) months++
  const days = daysBetween(addMonthsTo(today, months), end)
  return { years: Math.floor(months / 12), months: months % 12, days }
}

/**
 * What the card says first, by the state the server sent: `none` (no end date), `active` (valid until a day, with the
 * time left), `expiring` (ends in so many days: today, tomorrow, or n days), `expired` (ended on a day) or `off`.
 */
export type ValidityHeadline =
  | { kind: 'none' }
  | { kind: 'active'; until: string; left: { years: number; months: number; days: number } }
  | { kind: 'expiring'; until: string; days: number }
  | { kind: 'expired'; until: string }
  | { kind: 'off'; until: string | null }

export function headlineOf(member: Pick<MemberRow, 'valid_until' | 'membership_state' | 'is_active'>, today: string): ValidityHeadline {
  const until = member.valid_until ?? null
  const state: MembershipState = member.membership_state ?? (member.is_active ? 'active' : 'off')
  if (state === 'off') return { kind: 'off', until }
  if (!until) return { kind: 'none' }
  if (state === 'expired') return { kind: 'expired', until }
  if (state === 'expiring') return { kind: 'expiring', until, days: Math.max(0, daysBetween(today, until)) }
  return { kind: 'active', until, left: timeLeft(today, until) }
}

/** The state as a badge's tone (ToneBadge): green, amber, red, grey. Colour is never the only sign: the word goes with it. */
export function stateTone(state: MembershipState): 'fulfilled' | 'pending' | 'declined' | 'cancelled' {
  return state === 'expiring' ? 'pending' : state === 'expired' ? 'declined' : state === 'off' ? 'cancelled' : 'fulfilled'
}

/** What stops Set a date before anything is sent: no day, or a day before the venue's today. */
export function dateProblem(text: string, today: string): 'date' | 'past' | null {
  const v = text.trim()
  if (!isDateKey(v)) return 'date'
  return v < today ? 'past' : null
}

/** The first day Set a date offers: today (the last day of a membership may be today). */
export const firstEndDay = (today: string): string => today

export function setBody(date: string | null, key: string): ValidityBody {
  return { valid_until: date === null ? null : date.trim(), idempotency_key: key }
}

export function extendBody(choice: Extension, key: string): ValidityBody {
  return { extend: choice, idempotency_key: key }
}

/**
 * Whether a failed change takes a new key for the next press: yes when the server answered with a refusal (4xx — it
 * wrote nothing; `key_reused` included, which a kept key would meet forever), no for a lost answer or a server error,
 * where the change may have been written and the same key makes a retry of the same change a replay.
 */
export function renewsKey(failure: { status: number }): boolean {
  return failure.status >= 400 && failure.status < 500
}

/** How a sentence is said: `t` with its English and values. */
export type Say = (key: string, fallback: string, vars?: Record<string, unknown>) => string

/** "1 year 2 months", "3 months 4 days", "12 days": the two largest parts there are. */
export function leftText(left: { years: number; months: number; days: number }, say: Say): string {
  const part = (unit: 'years' | 'months' | 'days', n: number) => n === 1
    ? say(`loyalty.membership.validity.left.${unit}_one`, LEFT_WORDS[`${unit}_one`])
    : say(`loyalty.membership.validity.left.${unit}_many`, LEFT_WORDS[`${unit}_many`], { n: String(n) })
  const all = ([['years', left.years], ['months', left.months], ['days', left.days]] as const).filter(([, n]) => n > 0)
  if (all.length === 0) return part('days', 0)
  return all.slice(0, 2).map(([unit, n]) => part(unit, n)).join(' ')
}
