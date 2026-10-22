import type { BookingKind, PaymentReturn } from '../../lib/types'
import { afterConfirmError } from './steps'
import { afterStayConfirmError, stayPayNoticeKind, type StayPayNoticeKind } from '../stay/staySteps'

/**
 * Release 4, part C — the decisions of the return page (`PayReturn.tsx`), the page a redirect-based payment method
 * (a bank, a wallet) sends the member back to. Pure, because the frontend tests render to a string and never run
 * the page's effects: which payment the address names, what the server's answer means, and what a failed confirm
 * on the return means for the member. The page never decides anything about money itself: the server says what the
 * payment is for, and the ordinary confirm endpoints decide — and release — exactly as they do in the flow.
 */

/** The payment intent id Stripe puts on the return address (`?payment_intent=pi_…`), or null for none or one that
 *  is not shaped like an id. */
export function returnIntentId(search: string): string | null {
  const id = new URLSearchParams(search).get('payment_intent')
  return id !== null && /^pi_[A-Za-z0-9_]{1,200}$/.test(id) ? id : null
}

/** Whether the address still carries Stripe's client secret — the page takes it out of the address bar (and the
 *  history entry) once it has read the id, since nothing here needs it. */
export function returnHasSecret(search: string): boolean {
  return new URLSearchParams(search).has('payment_intent_client_secret')
}

/**
 * What the server's answer means:
 * - `booked` — a booking already carries the payment (a reload after the confirm): go to it;
 * - `confirm` — authorised, and the server could rebuild the booking: confirm it through the ordinary endpoint,
 *   which re-checks the hold or slot, the price and the payment and releases the card on every refusal;
 * - `processing` — the bank has not answered yet: nothing is confirmed or released, the member checks again;
 * - `failed` — nothing was taken (declined, or abandoned at the bank): start again;
 * - `lapsed` — authorised, but the booking can no longer be rebuilt (a stay's hold is gone): nothing is booked, and
 *   the card's hold is released by the server's own sweeper.
 */
export type ReturnView = 'booked' | 'confirm' | 'processing' | 'failed' | 'lapsed'

export function returnView(r: PaymentReturn): ReturnView {
  if (r.state === 'booked') return 'booked'
  if (r.state === 'processing') return 'processing'
  if (r.state === 'failed') return 'failed'
  const restorable = r.kind === 'stay' ? r.stay !== null : r.service !== null
  return restorable ? 'confirm' : 'lapsed'
}

/**
 * What a failed confirm on the return means. The card is authorised by the time the return confirms, so the same
 * rules as the flow's own Pay step apply, with `paid` true: `restart` only for an answer the server is known to
 * have released (`afterConfirmError` sends it back a step, `afterStayConfirmError` names a step); `retry` when the
 * same confirm is safe to send again (no answer at all, `payment_check_failed`, the appointment flow's own
 * stay-on-Pay codes); `contact` when nothing was released and the booking may even exist (`confirm_failed` for a
 * stay, and every other stay code outside the released set) — the member is told not to pay again.
 */
export type ReturnConfirmOutcome = 'restart' | 'retry' | 'contact'

export function returnConfirmOutcome(kind: BookingKind, code: string | null): ReturnConfirmOutcome {
  if (kind === 'stay') {
    const d = afterStayConfirmError(code, true)
    if (d.to === 'pay') return d.hold === 'retry' ? 'retry' : 'contact'
    return d.to === null ? 'retry' : 'restart'
  }
  return afterConfirmError(code).to === null ? 'retry' : 'restart'
}

/** The stay sentence for a `retry`/`contact` outcome — the Pay step's own choice, with the card authorised. */
export function returnStayNotice(outcome: ReturnConfirmOutcome, code: string | null): StayPayNoticeKind | null {
  if (outcome === 'restart') return null
  return stayPayNoticeKind(outcome, true, code)
}

/** Where "Start again" goes: the flow the payment was for, the appointment one on its service. */
export function restartPath(r: Pick<PaymentReturn, 'kind' | 'service'>): string {
  if (r.kind === 'stay') return '/portal/book/stay'
  return r.service ? `/portal/book/appointment?service=${r.service.body.service_id}` : '/portal/book/appointment'
}
