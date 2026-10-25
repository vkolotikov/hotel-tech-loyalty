import type { QueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { loyaltyUrl, watched } from '../lib/api'
import type { MemberRow } from '../lib/types'

/** One line of a member's cashback credit (`App\Services\Loyalty\Credit\CreditLedger::line`). Amounts are signed. */
export interface CreditLine {
  id: number
  /** `earn` | `spend` | `reverse` | `adjust`. */
  type: string
  amount: number
  balance_after: number
  /** The venue's currency when the line was written. */
  currency: string
  note: string | null
  /** What the line was for: `service_booking`, `booking_mirror`, `scan_event`, `member_merge`, `member_erasure`, or null. */
  reference_type: string | null
  created_at: string | null
  /** The staff member who wrote it; null for the system's own lines. */
  by: string | null
}

/** `GET members/{id}/credit`: whether cashback is on, the balance and one page of lines, newest first. */
export interface CreditPage {
  enabled: boolean
  balance: number
  currency: string
  lines: CreditLine[]
  pagination: { page: number; pages: number; total: number; per_page: number }
}

/** What Use credit and Adjust answer: the line (the first one, on a retry of the same key), the balance now, the member's row. */
export interface CreditAfter {
  line: CreditLine
  balance: number
  currency: string
  replayed: boolean
  member: MemberRow
}

/**
 * A member's cashback credit (release 7, spec 2026-10-25 §3, R7-2): the lines, Use credit at the desk (whoever may
 * redeem) and a manager's correction. Each write carries the key of one press, so a retry after a lost answer takes
 * nothing off twice.
 */
export const creditApi = {
  show: (memberId: number, page = 1): Promise<CreditPage> =>
    watched(api.get(loyaltyUrl(`members/${memberId}/credit`), { params: page > 1 ? { page } : {} })),
  spend: (memberId: number, body: { amount: number; note?: string; idempotency_key: string }): Promise<CreditAfter> =>
    watched(api.post(loyaltyUrl(`members/${memberId}/credit/spend`), body)),
  adjust: (memberId: number, body: { amount: number; reason: string; idempotency_key: string }): Promise<CreditAfter> =>
    watched(api.post(loyaltyUrl(`members/${memberId}/credit/adjust`), body)),
}

/** The credit's query key (its pages sit under it): the contract with the desk's visits, which invalidate it too. */
export const creditKey = (memberId: number) => ['loyalty', 'credit', memberId] as const

/** What a credit write makes stale: the member's credit, their row (its `credit_balance`) and the members list. */
export function afterCreditChange(client: QueryClient, memberId: number): void {
  void client.invalidateQueries({ queryKey: creditKey(memberId) })
  void client.invalidateQueries({ queryKey: ['loyalty', 'member', memberId] })
  void client.invalidateQueries({ queryKey: ['loyalty', 'members'] })
}
