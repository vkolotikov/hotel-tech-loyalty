import type { Key } from './i18n/en'
import type { MemberRow, Verdict } from './types'

/**
 * The desk's decisions, kept out of the screens so they can be tested: what a scanned code is, when a retry reuses its
 * key, whether a points form may be sent, and how a scan's answer is told.
 */

/** Zero-width characters some readers and keyboards add, and surrounding space. */
export function cleanCode(raw: string): string {
  return raw.replace(/[​-‍⁠﻿]/g, '').trim()
}

/**
 * Whether typed text is a card code rather than a search: no spaces and no "@", at least four characters, and digits
 * in it (a member number, a card's hex ID or a QR token). Names, emails and phones are searched instead.
 */
export function looksLikeCode(text: string): boolean {
  const value = cleanCode(text)
  return value.length >= 4 && !/\s/.test(value) && !value.includes('@') && /\d/.test(value)
}

/** How long an unanswered scan's key is kept for the same code at the same place (the web's REPLAY_MS). */
export const REPLAY_MS = 10 * 60_000

export interface Unanswered {
  code: string
  where: string
  key: string
  at: number
}

/** The key for a scan: the unanswered one's when the same code is sent again at the same place soon after, else fresh. */
export function keyFor(code: string, where: string, last: Unanswered | null, now: number, fresh: () => string): string {
  return last !== null && last.code === code && last.where === where && now - last.at < REPLAY_MS ? last.key : fresh()
}

/** Points forms: 1 to 100,000 points, a reason of 2 to 200 characters, and no more than the member has to use. */
export const MAX_POINTS = 100_000

export type PointsProblem = 'points.tooMany' | 'points.reasonShort' | 'points.tooFew'

export function pointsProblem(mode: 'award' | 'redeem', points: number, reason: string, balance: number): PointsProblem | null {
  if (!Number.isInteger(points) || points < 1 || points > MAX_POINTS) return 'points.tooMany'
  if (reason.trim().length < 2 || reason.trim().length > 200) return 'points.reasonShort'
  if (mode === 'redeem' && points > balance) return 'points.tooFew'
  return null
}

/** The balance after the form is sent, for the confirm line. */
export function balanceAfter(mode: 'award' | 'redeem', points: number, balance: number): number {
  return mode === 'award' ? balance + points : balance - points
}

/** A whole number from what was typed in the points field ("1 500", "1,500" → 1500), or 0. */
export function pointsFrom(text: string): number {
  const digits = text.replace(/[^\d]/g, '')
  return digits ? Math.min(Number(digits), MAX_POINTS * 10) : 0
}

/** The sentence a door's verdict is told with: the known reasons by name, any other as a plain refusal. */
export function verdictKey(verdict: Verdict): Key {
  if (verdict.granted) return 'verdict.welcome'
  const known: Record<string, Key> = {
    member_erased: 'verdict.member_erased',
    member_off: 'verdict.member_off',
    expired: 'verdict.expired',
    place_off: 'verdict.place_off',
    tier_not_allowed: 'verdict.tier_not_allowed',
    event_not_open: 'verdict.event_not_open',
    event_full: 'verdict.event_full',
    not_signed_up: 'verdict.not_signed_up',
  }
  return known[verdict.reason] ?? 'verdict.refused'
}

/** The error codes the app has its own words for; any other is "Something went wrong". */
const ERROR_KEYS = new Set<string>([
  'network', 'unknown', 'not_found', 'unauthenticated', 'not_allowed', 'invalid', 'not_enough_points', 'workspace_disabled',
  'not_in_plan', 'feature_locked', 'inactive', 'membership_expired', 'card_in_use', 'card_elsewhere', 'bad_uid', 'in_progress',
  'key_reused', 'wrong_state', 'desk_earn_off', 'amount_required', 'event_ended', 'event_full', 'option_off',
])

/** The sentence for a failure's code. A manager's right and a missing capability read as the same missing right. */
export function errorKey(code: string): Key {
  if (code === 'manager_only' || code === 'no_capability') return 'error.not_allowed'
  return (ERROR_KEYS.has(code) ? `error.${code}` : 'error.unknown') as Key
}

/** A membership's state as the card shows it: the server's, else active or switched off from the row. */
export function membershipState(member: MemberRow): 'active' | 'expiring' | 'expired' | 'off' {
  if (member.membership_state) return member.membership_state
  return member.is_active ? 'active' : 'off'
}
