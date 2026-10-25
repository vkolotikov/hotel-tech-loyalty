import { money } from '../lib/format'
import type { Can, Ways } from '../lib/types'
import { DONE_WORDS } from './words'

/**
 * Cashback credit's decisions (release 7, spec 2026-10-25 §3), as pure functions the tests read by value: when the
 * screens show credit, who sees Use credit and Adjust, what stops a dialog before it sends, the balance it will leave,
 * and the words of a line. Every check here is a hint: the server's CreditLedger decides (the balance under its lock,
 * the currency's decimals by Stripe's list) and its refusals are shown in the workspace's words.
 */

export type CreditMode = 'use' | 'adjust'

/** The most one Use credit or Adjust may move (CreditLedger::MAX_AMOUNT). */
export const MAX_CREDIT = 10_000_000

/** Whether a screen shows credit: the venue uses cashback, or the member still holds some (a balance outlives the switch). */
export function showsCredit(ways: Ways | undefined, balance: number | undefined): boolean {
  return Boolean(ways?.cashback) || (balance ?? 0) > 0
}

/**
 * The credit actions this person sees: Use credit for whoever may redeem, on a balance above zero; Adjust for a manager
 * (a correction, as reversing a points line). Neither on a deleted member, whose balance was forfeited.
 */
export function creditActions(can: Can, member: { credit_balance?: number; is_erased?: boolean }): { use: boolean; adjust: boolean } {
  if (member.is_erased) return { use: false, adjust: false }
  return { use: can.redeem && (member.credit_balance ?? 0) > 0, adjust: can.reverse }
}

/** The currency's decimals as the browser knows them (0 for JPY, 2 for EUR); 2 for a code it does not know. */
export function currencyDecimals(currency: string): number {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2
  } catch {
    return 2
  }
}

/** A typed amount as a number — "12.40", "12,40" and "−5" alike — or null when it is not one. */
export function parseAmount(typed: string): number | null {
  const clean = typed.trim().replace(/\s/g, '').replace(',', '.').replace('−', '-')
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(clean)) return null
  const n = Number(clean)
  return Number.isFinite(n) ? n : null
}

/** Whole cents of an amount (floats kept honest: 0.1 + 0.2 is 30). */
export const toCents = (amount: number): number => Math.round(amount * 100)

/** What stops a dialog before anything is sent, or null when it may be sent. */
export type CreditProblem = 'amount' | 'decimals' | 'too_large' | 'over_balance' | 'below_zero' | 'reason'

/** Whether an amount has more decimals than the currency's. */
function tooPrecise(n: number, decimals: number): boolean {
  const scaled = n * 10 ** decimals
  return Math.abs(scaled - Math.round(scaled)) > 1e-6
}

/**
 * Use credit takes an amount above zero, at most the balance; Adjust a signed amount other than zero that leaves the
 * balance at zero or above, and a reason. Either keeps to the currency's decimals and the largest amount.
 */
export function creditProblem(mode: CreditMode, typed: string, reason: string, balance: number, decimals: number): CreditProblem | null {
  const n = parseAmount(typed)
  if (n === null || (mode === 'use' ? n <= 0 : n === 0)) return 'amount'
  if (tooPrecise(n, decimals)) return 'decimals'
  if (Math.abs(n) > MAX_CREDIT) return 'too_large'
  if (mode === 'use' && toCents(n) > toCents(balance)) return 'over_balance'
  if (mode === 'adjust' && toCents(balance) + toCents(n) < 0) return 'below_zero'
  if (mode === 'adjust' && reason.trim().length < 2) return 'reason'
  return null
}

/** The balance the dialog shows before sending: what the member will have after it; null (the balance now) while the amount cannot be sent. */
export function creditAfter(mode: CreditMode, balance: number, typed: string, decimals: number): number | null {
  const problem = creditProblem(mode, typed, 'ok', balance, decimals)
  if (problem !== null) return null
  const n = parseAmount(typed) as number
  return (toCents(balance) + (mode === 'use' ? -toCents(n) : toCents(n))) / 100
}

/** The kinds of line the screens name (loyalty.credit.line.*); one the workspace does not name reads as `other`. */
export type CreditLineKind = 'earn_appointment' | 'earn_stay' | 'earn_purchase' | 'earn' | 'spend' | 'reverse' | 'merge' | 'forfeit' | 'adjust' | 'other'

const EARNED_ON: Record<string, CreditLineKind> = { service_booking: 'earn_appointment', booking_mirror: 'earn_stay', scan_event: 'earn_purchase' }

/** A line's kind, from its type and what it was for. */
export function lineKind(line: { type: string; reference_type: string | null }): CreditLineKind {
  switch (line.type) {
    case 'earn': return EARNED_ON[line.reference_type ?? ''] ?? 'earn'
    case 'spend': return 'spend'
    case 'reverse': return 'reverse'
    case 'adjust': return line.reference_type === 'member_merge' ? 'merge' : line.reference_type === 'member_erasure' ? 'forfeit' : 'adjust'
    default: return 'other'
  }
}

/** Whether a line shows its note: only what a person wrote (a spend's note, a correction's reason); the system's are records. */
export function showsNote(line: { type: string; reference_type: string | null; note: string | null }): boolean {
  const kind = lineKind(line)
  return (kind === 'spend' || kind === 'adjust') && Boolean(line.note?.trim())
}

/** An amount of credit with its sign: "+€2.25", "−€5" (a true minus sign); zero has none. */
export function signedMoney(amount: number, currency: string, locale: string): string {
  const abs = money(Math.abs(amount), currency, locale)
  return amount > 0 ? `+${abs}` : amount < 0 ? `−${abs}` : abs
}

/**
 * What a finished Use credit or Adjust says — the amount it moved and the credit now — as the key, its English
 * (words.ts `DONE_WORDS`) and its values for `t()`.
 */
export function doneMessage(mode: CreditMode, after: { line: { amount: number }; balance: number; currency: string }, locale: string): [string, string, Record<string, string>] {
  const balance = money(after.balance, after.currency, locale)
  const amount = mode === 'use' ? money(Math.abs(after.line.amount), after.currency, locale) : signedMoney(after.line.amount, after.currency, locale)
  return [`loyalty.credit.done.${mode}`, DONE_WORDS[mode], { amount, balance }]
}
