import type { Can, LedgerLine, Progress } from '../lib/types'

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

/**
 * A member's NFC cards (release 5): link and switch off for whoever may edit the member — every staff member, as Edit
 * details (the server's access map says the same) — and for nobody on a deleted member, whose cards went with them.
 */
export function cardActions(member: { is_erased: boolean }): { link: boolean; off: boolean } {
  return { link: !member.is_erased, off: !member.is_erased }
}

/** Whether a ledger line offers Reverse to this person: a manager, on a line the server says can be reversed. */
export function offersReverse(line: LedgerLine, can: Can): boolean {
  return can.reverse && line.can_reverse
}

/** The word for a ledger line's kind (loyalty.history.type.*); a kind the workspace does not name reads as "Other". */
export const LINE_TYPES = ['earn', 'bonus', 'adjust', 'redeem', 'expire', 'reverse', 'referral'] as const
export type LineType = typeof LINE_TYPES[number] | 'other'
export const lineType = (type: string): LineType => ((LINE_TYPES as readonly string[]).includes(type) ? (type as LineType) : 'other')

// ─── Progress to the next tier (release 8, spec 2026-10-25 §3) ────────────

/** How the venue's members move between tiers (ProgrammeOptions `tier_progress_by`). */
export type ProgressBy = 'points' | 'visits' | 'spend'

/**
 * The member page's progress as the server sends it: release 8 adds the measure (`by`) and the next tier's floor on it
 * (LoyaltyService::tierProgress()); an answer without them is the points reading it always was.
 */
export type ProgressIn = Omit<Progress, 'next_tier'> & {
  by?: ProgressBy
  next_tier: (NonNullable<Progress['next_tier']> & { floor?: number }) | null
}

/**
 * Which sentence the progress line says, in the programme's terms: `top` (no tier above), `ready` (the floor is
 * reached; the move comes with the next assessment), else what is still needed — `points` ("1,250 more to reach Gold"),
 * `visit` / `visits` ("1 more visit to Gold", "3 more visits to Gold") or `spend` ("€120 more to Gold"). The numbers
 * are the server's.
 */
export function progressLine(progress: ProgressIn): { kind: 'top' | 'ready' | 'points' | 'visit' | 'visits' | 'spend'; by: ProgressBy; needed: number; tier: string | null } {
  const by: ProgressBy = progress.by ?? 'points'
  const tier = progress.next_tier?.name ?? null
  if (!progress.next_tier) return { kind: 'top', by, needed: 0, tier }
  if (progress.needed <= 0) return { kind: 'ready', by, needed: 0, tier }
  if (by === 'visits') return { kind: progress.needed === 1 ? 'visit' : 'visits', by, needed: progress.needed, tier }
  return { kind: by === 'spend' ? 'spend' : 'points', by, needed: progress.needed, tier }
}
