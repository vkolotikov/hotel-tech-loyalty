import { api } from '../../../lib/api'
import { formatMoney } from '../../lib/money'

/** One line of the member's own credit (`CreditLedger::forMemberSelf`): signed amounts, never a staff name. */
export interface MemberCreditLine {
  id: number
  /** `earn` | `spend` | `reverse` | `adjust`. */
  type: string
  amount: number
  balance_after: number
  currency: string
  note: string | null
  reference_type: string | null
  created_at: string | null
}

/** `GET member/portal/credit`: whether the venue gives cashback, the balance in its currency, the last 20 lines. */
export interface MemberCredit {
  enabled: boolean
  balance: number
  currency: string
  lines: MemberCreditLine[]
}

/** The member's cashback credit (release 7, spec 2026-10-25 §3): read only — credit is spent at the desk (R7-2). */
export const creditApi = {
  show: (): Promise<MemberCredit> => api.get('/v1/member/portal/credit').then(r => r.data),
}

export const CREDIT_KEY = ['portal-credit'] as const

/** How many lines Home shows under the balance. */
export const RECENT_LINES = 5

/** Whether Home shows credit: the venue gives cashback, or the member still holds some. */
export function showsCredit(credit: Pick<MemberCredit, 'enabled' | 'balance'> | undefined): boolean {
  return credit !== undefined && (credit.enabled || credit.balance > 0)
}

/** The kinds of line the portal names (portal.credit.line.*); one it does not name reads as `other`. */
export type CreditLineKind = 'earn_appointment' | 'earn_stay' | 'earn_purchase' | 'earn' | 'spend' | 'reverse' | 'merge' | 'forfeit' | 'adjust' | 'other'

const EARNED_ON: Record<string, CreditLineKind> = { service_booking: 'earn_appointment', booking_mirror: 'earn_stay', scan_event: 'earn_purchase' }

export function lineKind(line: Pick<MemberCreditLine, 'type' | 'reference_type'>): CreditLineKind {
  switch (line.type) {
    case 'earn': return EARNED_ON[line.reference_type ?? ''] ?? 'earn'
    case 'spend': return 'spend'
    case 'reverse': return 'reverse'
    case 'adjust': return line.reference_type === 'member_merge' ? 'merge' : line.reference_type === 'member_erasure' ? 'forfeit' : 'adjust'
    default: return 'other'
  }
}

/** The words of each kind, in English (portal.credit.line.*). */
export const LINE_WORDS: Record<CreditLineKind, string> = {
  earn_appointment: 'Cashback on an appointment',
  earn_stay: 'Cashback on a stay',
  earn_purchase: 'Cashback on a purchase',
  earn: 'Cashback',
  spend: 'Spent at the desk',
  reverse: 'Cashback taken back (refunded or cancelled)',
  merge: 'Moved from your other membership',
  forfeit: 'Forfeited',
  adjust: 'Correction',
  other: 'Other',
}

/** Whether a line shows its note: only what the team wrote (a spend's note, a correction's reason); the system's are records. */
export function showsNote(line: Pick<MemberCreditLine, 'type' | 'reference_type' | 'note'>): boolean {
  const kind = lineKind(line)
  return (kind === 'spend' || kind === 'adjust') && Boolean(line.note?.trim())
}

/** An amount of credit with its sign: "+€2.25", "−€4.90" (a true minus sign); zero has none. */
export function signedMoney(amount: number, currency: string, locale: string): string {
  const abs = formatMoney(Math.abs(amount), currency, locale)
  return amount > 0 ? `+${abs}` : amount < 0 ? `−${abs}` : abs
}
