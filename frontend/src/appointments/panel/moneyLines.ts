import type { DeskMethod, MoneyInfo, MoneyMovement, RefundVia } from '../lib/types'

/** A movement's kind as people say it: a correction undoes a wrong desk entry, a refund gives money back. */
export function kindKey(mv: Pick<MoneyMovement, 'kind' | 'corrects'>): 'payment' | 'refund' | 'correction' {
  return mv.kind === 'refund' && mv.corrects ? 'correction' : mv.kind
}
export const KIND_FALLBACK = { payment: 'Payment', refund: 'Refund', correction: 'Correction' } as const

export const DESK_METHODS: DeskMethod[] = ['cash', 'card_desk', 'transfer', 'other']
export const METHOD_FALLBACK: Record<RefundVia, string> = { cash: 'Cash', card_desk: 'Card at the desk', transfer: 'Bank transfer', other: 'Other', online_card: 'Card, through Stripe' }

/** The ways money can go back now: through Stripe while the online card has some left; at the desk while desk money has some left. */
export function refundWays(m: MoneyInfo): RefundVia[] {
  return [...(m.refundable_online > 0 ? ['online_card' as const] : []), ...(m.refundable_desk > 0 ? DESK_METHODS : [])]
}

/** The most that can go back one way. */
export function refundMax(m: MoneyInfo, via: RefundVia): number {
  return via === 'online_card' ? m.refundable_online : m.refundable_desk
}
