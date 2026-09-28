import type { Catalogue, CouponRef, Quote } from '../../lib/types'

export type Step = 'service' | 'staff' | 'when' | 'review' | 'pay'
export const STEPS: Step[] = ['service', 'staff', 'when', 'review', 'pay']

export interface BookState {
  step: Step
  serviceId: number | null
  masterId: number | null
  startAt: string | null
  partySize: number
  extras: number[]
  coupon: CouponRef | null
  notes: string
  /** The sentence to show on the step a `confirm()` error bounced back to — the error CODE, not the rendered
   *  text (the same reason `ReviewStep`'s own coupon notice is kept as a code). Cleared by the member's next
   *  choice: it was about the previous attempt. */
  notice: { step: Step; code: string } | null
  /** The quote the member accepted with Review's Continue — what Pay charges and confirms. */
  quote: Quote | null
  /** The current attempt to pay for `quote` (see `PayVisit`): created fresh on every entry to Pay, dropped on
   *  success and on a confirm error that released the hold. */
  visit: PayVisit | null
}
export const initialState: BookState = {
  step: 'service', serviceId: null, masterId: null, startAt: null, partySize: 1, extras: [], coupon: null, notes: '',
  notice: null, quote: null, visit: null,
}

/** The fields the Review step edits in place. */
export type ReviewPatch = Partial<Pick<BookState, 'partySize' | 'extras' | 'coupon' | 'notes'>>

export type BookAction =
  | { type: 'pickService'; serviceId: number; catalogue: Catalogue }
  | { type: 'pickStaff'; masterId: number | null }
  | { type: 'pickStart'; startAt: string }
  | { type: 'patchReview'; patch: ReviewPatch }
  /** Review's Continue: the notes typed there travel WITH the step change, so nothing can overwrite them. */
  | { type: 'continueToPay'; notes: string; quote: Quote; visit: PayVisit }
  | { type: 'jump'; step: Step }
  /** A `confirm()` error that sends the member back (see `afterConfirmError`). Every such error has already
   *  released the hold — `afterConfirmError` never returns a `to` without `releasesHold` — so the visit goes. */
  | { type: 'bounce'; to: 'when' | 'review'; code: string; clearStart: boolean }
  | { type: 'visit'; patch: Partial<PayVisit> }
  | { type: 'reset' }

/**
 * Every state transition of the Book flow. `Book.tsx` dispatches these through `useReducer`, so no handler
 * ever builds the next state by spreading a `state` its render closure captured — two handlers called from
 * one click (Review's notes and its Continue, final review Important 1) each apply to the latest state, not
 * to the same stale copy. Pure, so every transition is unit-tested directly (the frontend tests render to a
 * string and never run a handler).
 *
 * Every member choice — picking a service, a person or a time, editing Review, continuing, jumping back
 * through the strip — clears the notice: it was about the previous attempt.
 */
export function bookReducer(state: BookState, action: BookAction): BookState {
  switch (action.type) {
    case 'pickService': {
      const next: BookState = { ...state, serviceId: action.serviceId, masterId: null, startAt: null, extras: [], coupon: null, notice: null }
      return { ...next, step: nextStep({ ...next, step: 'service' }, action.catalogue) }
    }
    case 'pickStaff':
      return { ...state, masterId: action.masterId, startAt: null, notice: null, step: 'when' }
    case 'pickStart':
      return { ...state, startAt: action.startAt, notice: null, step: 'review' }
    case 'patchReview':
      return { ...state, ...action.patch, notice: null }
    case 'continueToPay':
      return { ...state, notes: action.notes, quote: action.quote, visit: action.visit, notice: null, step: 'pay' }
    case 'jump':
      return { ...state, step: action.step, notice: null }
    case 'bounce':
      return {
        ...state,
        step: action.to,
        startAt: action.clearStart ? null : state.startAt,
        notice: { step: action.to, code: action.code },
        visit: null,
      }
    case 'visit':
      // A late callback (Stripe answering after the visit was dropped) must not bring a dropped visit back.
      return state.visit ? { ...state, visit: { ...state.visit, ...action.patch } } : state
    case 'reset':
      return initialState
  }
}

export function mastersFor(catalogue: Catalogue, serviceId: number | null) {
  return catalogue.masters.filter(m => serviceId !== null && m.service_ids.includes(serviceId))
}

/** The staff step is skipped when the venue hides the choice or only one person does the service. */
export function nextStep(s: BookState, catalogue: Catalogue): Step {
  const i = STEPS.indexOf(s.step)
  let next = STEPS[Math.min(i + 1, STEPS.length - 1)]
  if (next === 'staff' && (!catalogue.rules.allow_master_choice || mastersFor(catalogue, s.serviceId).length < 2)) next = 'when'
  return next
}

export type FocusTarget = { kind: 'notice' } | { kind: 'heading'; step: Step }

/**
 * Where keyboard focus goes after the step changes (final review, Minor 11 — it used to drop to `<body>`, so a
 * screen reader heard nothing about the new step): the notice a bounce carried, so its sentence is read first,
 * otherwise the new step's own heading (`data-step-heading`, `tabIndex={-1}`). `Book.tsx`'s effect applies it,
 * skipping the first mount; kept pure because effects never run under the string renderer.
 */
export function focusTargetFor(step: Step, hasNotice: boolean): FocusTarget {
  return hasNotice ? { kind: 'notice' } : { kind: 'heading', step }
}

/**
 * The day whose times the When step shows: the member's chosen day while it is in the seven on screen,
 * otherwise the first bookable day on screen, otherwise none. Paging the strip used to leave the chosen day
 * off-screen while its times stayed listed under a strip of other dates (Task 21 browser pass).
 */
export function visibleDay(selected: string, days: string[], available: Set<string>): string | null {
  if (days.includes(selected)) return selected
  return days.find(d => available.has(d)) ?? null
}

/**
 * What a `coupon_*` error from the quote means for the Review step's state: the coupon the member picked
 * no longer works, so it's cleared, and the caller is told which code failed (`noticeCode`) so it can show
 * the matching sentence. Any other code — a booking-window error, `extra_lead_time`, or no error at all —
 * needs no state change here, so this returns `null`.
 *
 * Kept as a pure function, not inlined into an effect, because `ReviewStep`'s tests render with
 * `renderToStaticMarkup`, which never runs `useEffect` — this is the only way the *decision* the effect
 * applies gets exercised by a test at all.
 */
export function afterQuoteError(code: string | null): { patch: ReviewPatch; noticeCode: string } | null {
  return code !== null && code.startsWith('coupon_') ? { patch: { coupon: null }, noticeCode: code } : null
}

/**
 * One attempt to pay for one specific booking of one specific slot. Created fresh every time the member
 * enters Pay from Review's Continue (see `Book.tsx`) — never reused across a different selection, and
 * never reused after a `confirm()` error that releases the hold — so `nonce` (which keys the payment-intent
 * query) and `idempotencyKey` (the confirm call's `Idempotency-Key` header) are both fresh per attempt.
 * `paymentIntentId`/`paid` track whatever card has actually been captured, if any, so a retry of `confirm()`
 * after a network hiccup can resend the exact same intent id without asking the member to pay again, and so
 * `canLeavePay()` can refuse to let them wander off while a card is held against a booking that isn't
 * confirmed yet. `held` is set the instant the member presses Pay — before Stripe has answered at all — so
 * the lock engages before the browser round-trip, not after it (fix round 2, finding M3): `paid` alone
 * would leave a gap, while `stripe.confirmPayment()` is in flight, where the strip is still clickable.
 * `noCard` remembers that the payment-intent call itself answered "nothing to charge online" (`nothing_to_pay`
 * or `pay_at_venue`), so later renders don't re-request an intent this visit will never need (finding M2).
 */
export interface PayVisit {
  nonce: string
  idempotencyKey: string
  paymentIntentId: string | null
  paid: boolean
  held: boolean
  noCard: boolean
}

/** `random` is injected (rather than calling `crypto.randomUUID()` here directly) so this stays a pure,
 *  deterministically-testable function — `Book.tsx`'s own call site supplies the real generator. */
export function newPayVisit(random: () => string): PayVisit {
  return { nonce: random(), idempotencyKey: random(), paymentIntentId: null, paid: false, held: false, noCard: false }
}

/** False from the moment the member presses Pay (`held`) through a captured card (`paid`) — the step strip
 *  disables every earlier step's button rather than let the member wander off with an authorised, un-booked
 *  charge sitting on their card with no way back to it (finding I1), or into the gap while Stripe's own
 *  round-trip is still in flight (finding M3). `null` (no visit at all, or not on Pay) is always safe to
 *  leave. */
export function canLeavePay(visit: PayVisit | null): boolean {
  return !(visit?.held || visit?.paid)
}

export interface ConfirmErrorDecision {
  /** Which step to bounce back to, or `null` to stay on Pay (with a retry that resends the same body, key
   *  and payment intent id — see PayStep.tsx). */
  to: 'when' | 'review' | null
  /** Whether the server has already released whatever hold the member had — `Book.tsx` drops the
   *  `PayVisit` exactly when this is true, since there is nothing left to protect against leaving. */
  releasesHold: boolean
  /** Whether the picked slot itself is gone, not just its price or its coupon — `Book.tsx` clears
   *  `state.startAt` exactly when this is true, so When doesn't re-offer the same, now-taken time. */
  clearStart: boolean
}

/**
 * What a `confirm()` error means for the Pay step. `PortalServiceBookingController::confirm()`'s own
 * `fail()` helper (see the backend) now releases the member's hold on every exit that has learned a
 * `payment_intent_id`, except `no_membership` (there is no member id yet to verify ownership against) and
 * `payment_required` (can't have an intent by definition) — and the server itself answers both of THOSE
 * with a code too, so as far as this decision is concerned every SERVER-CODED error means "the hold, if
 * there ever was one, is gone" (fix round 3, minor B — `not_found` and `no_membership` used to say
 * otherwise, leaving the member retrying an already-cancelled intent on a locked strip). Only two cases are
 * answered in place instead: no code at all (a network error, which never reached the server's release
 * logic in the first place) and `idempotency_conflict` (a DIFFERENT request already used this key, leaving
 * THIS attempt's own intent exactly where it was) — both retry the same confirm, because the card, if one
 * was ever held, is genuinely still held.
 *
 * `slot_taken`/`too_soon`/`too_far_ahead` mean the booking WINDOW itself no longer holds — back to When,
 * with the stale slot cleared. Every other code — `payment_mismatch`, `extra_lead_time`, any `coupon_*`,
 * `confirm_failed`, `not_found`, `no_membership`, `payment_required`, and any code this decision doesn't
 * otherwise recognise — means the slot itself may still be fine, so it goes back to Review instead, which
 * re-quotes and, on the next Pay-step mount, gets a fresh payment intent.
 *
 * Kept as a pure function, not inlined into an effect, for the same reason as `afterQuoteError`:
 * `PayStep`'s tests render with `renderToStaticMarkup`, which never runs `useEffect` — this is the only way
 * the *decision* the effect applies gets exercised by a test at all.
 */
export function afterConfirmError(code: string | null): ConfirmErrorDecision {
  if (code === null || code === 'idempotency_conflict') {
    return { to: null, releasesHold: false, clearStart: false }
  }
  if (code === 'slot_taken' || code === 'too_soon' || code === 'too_far_ahead') {
    return { to: 'when', releasesHold: true, clearStart: true }
  }
  return { to: 'review', releasesHold: true, clearStart: false }
}
