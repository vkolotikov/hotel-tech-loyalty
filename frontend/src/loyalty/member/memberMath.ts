import type { Can, LedgerLine } from '../lib/types'

export type PointsMode = 'award' | 'redeem'

/** The most points one award or redemption may carry (the server's own limit). */
export const MAX_POINTS = 100_000

/** What the Points dialog stops on before anything is sent, or null when it may be sent. */
export type PointsProblem = 'points' | 'too_many' | 'reason' | 'over_balance'

export function pointsProblem(mode: PointsMode, typed: string, reason: string, balance: number): PointsProblem | null {
  const n = Number(typed)
  if (typed.trim() === '' || !Number.isInteger(n) || n < 1) return 'points'
  if (n > MAX_POINTS) return 'too_many'
  if (mode === 'redeem' && n > balance) return 'over_balance'
  if (reason.trim().length < 2) return 'reason'
  return null
}

/** The balance the dialog shows before sending: what the member will have after it; null (the balance now) while the points cannot be sent. */
export function balanceAfter(mode: PointsMode, balance: number, typed: string): number | null {
  const n = Number(typed)
  if (typed.trim() === '' || !Number.isInteger(n) || n < 1) return null
  if (mode === 'redeem' && n > balance) return null
  return mode === 'award' ? balance + n : balance - n
}

/** The member page's actions this person sees (the server checks each again). */
export function memberActions(can: Can): { award: boolean; redeem: boolean; reverse: boolean } {
  return { award: can.award, redeem: can.redeem, reverse: can.reverse }
}

/** Whether a ledger line offers Reverse to this person: a manager, on a line the server says can be reversed. */
export function offersReverse(line: LedgerLine, can: Can): boolean {
  return can.reverse && line.can_reverse
}

/** The word for a ledger line's kind (loyalty.history.type.*); a kind the workspace does not name reads as "Other". */
export const LINE_TYPES = ['earn', 'bonus', 'adjust', 'redeem', 'expire', 'reverse', 'referral'] as const
export type LineType = typeof LINE_TYPES[number] | 'other'
export const lineType = (type: string): LineType => ((LINE_TYPES as readonly string[]).includes(type) ? (type as LineType) : 'other')
