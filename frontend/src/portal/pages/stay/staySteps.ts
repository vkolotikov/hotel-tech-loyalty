import type { AvailableRoom, CouponRef, StayQuote, StayQuoteBody, StayRules } from '../../lib/types'
import type { PayVisit } from '../book/steps'

export type StayStep = 'dates' | 'room' | 'review' | 'pay'
export const STAY_STEPS: StayStep[] = ['dates', 'room', 'review', 'pay']

export interface StayState {
  step: StayStep
  /** Calendar days, `YYYY-MM-DD`, in the venue's own calendar. */
  checkIn: string | null
  checkOut: string | null
  adults: number
  children: number
  /** A room's id is a string: the PMS id when the room has one. */
  roomId: string | null
  /** Extra ids; one of each. */
  extras: string[]
  coupon: CouponRef | null
  requests: string
  /** The error CODE to show on the step a bounce landed on; cleared by the member's next choice. */
  notice: { step: StayStep; code: string } | null
  /** The quote the member accepted with Review's Continue — what Pay charges and confirms. It names the hold. */
  quote: StayQuote | null
  visit: PayVisit | null
}

export const initialStayState: StayState = {
  step: 'dates', checkIn: null, checkOut: null, adults: 2, children: 0, roomId: null, extras: [], coupon: null, requests: '',
  notice: null, quote: null, visit: null,
}

export type StayReviewPatch = Partial<Pick<StayState, 'extras' | 'coupon' | 'requests'>>

export type StayAction =
  | { type: 'setDates'; checkIn: string | null; checkOut: string | null }
  | { type: 'setGuests'; adults: number; children: number }
  | { type: 'search' }
  | { type: 'pickRoom'; roomId: string }
  | { type: 'patchReview'; patch: StayReviewPatch }
  /** Review's Continue: the requests typed there travel WITH the step change. */
  | { type: 'continueToPay'; requests: string; quote: StayQuote; visit: PayVisit }
  | { type: 'jump'; step: StayStep }
  /** A quote or confirm error that sends the member back. The server has released whatever it held. */
  | { type: 'bounce'; to: 'dates' | 'room' | 'review'; code: string; clearRoom: boolean }
  | { type: 'visit'; patch: Partial<PayVisit> }
  | { type: 'reset' }

/**
 * Every state transition of the stay flow, pure, so each is unit-tested directly (the frontend tests render to
 * a string and never run a handler). `StayBook.tsx` dispatches these through `useReducer`; no handler builds
 * the next state from a `state` its render closure captured.
 *
 * A room is chosen for a set of dates and a party: changing either drops the room and the quote made for it.
 * Extras, the coupon and the requests are the member's own choices and survive.
 */
export function stayReducer(state: StayState, action: StayAction): StayState {
  switch (action.type) {
    // `setDates`, `setGuests` and `pickRoom` none of them touch `visit`, and that's not an oversight: a
    // `PayVisit` only ever exists on the `pay` step, and the only way onto `pay` is `continueToPay`, which
    // installs a fresh one. These three actions fire while the member is still on `dates` or `room` — before
    // any visit exists to clear — and even if one somehow lingered, `StepStrip`'s `locked={!canLeavePay(visit)}`
    // (see `Book.tsx`/`StayBook.tsx`) disables every earlier step's controls the moment a visit is `held` or
    // `paid`, so these actions can't fire against a live one anyway.
    case 'setDates': {
      const checkOut = action.checkIn && action.checkOut && action.checkOut > action.checkIn ? action.checkOut : null
      return { ...state, checkIn: action.checkIn, checkOut, roomId: null, quote: null, notice: null }
    }
    case 'setGuests':
      return { ...state, adults: action.adults, children: action.children, roomId: null, quote: null, notice: null }
    case 'search':
      return { ...state, step: 'room', notice: null }
    case 'pickRoom':
      return { ...state, roomId: action.roomId, quote: null, notice: null, step: 'review' }
    case 'patchReview': {
      // Blurring the special-requests field (StayReviewStep's own onBlur) must not clear
      // a bounce notice that's already showing on Review — it costs nothing and asks for no new price, so
      // it is not "the member's next choice" the way changing an extra or the coupon is. Only a patch that
      // touches requests AND NOTHING ELSE gets this exemption; a real choice mixed into the same patch still
      // clears the notice.
      const onlyRequests = Object.keys(action.patch).length === 1 && 'requests' in action.patch
      return { ...state, ...action.patch, notice: onlyRequests ? state.notice : null }
    }
    case 'continueToPay':
      return { ...state, requests: action.requests, quote: action.quote, visit: action.visit, notice: null, step: 'pay' }
    case 'jump':
      return { ...state, step: action.step, notice: null }
    case 'bounce':
      return {
        ...state,
        step: action.to,
        roomId: action.clearRoom ? null : state.roomId,
        quote: null,
        visit: null,
        notice: { step: action.to, code: action.code },
      }
    case 'visit':
      // A late callback (Stripe answering after the visit was dropped) must not bring a dropped visit back.
      return state.visit ? { ...state, visit: { ...state.visit, ...action.patch } } : state
    case 'reset':
      return initialStayState
  }
}

/** Calendar arithmetic in UTC, so a day never shifts with the clock or the client's zone. */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function nightsBetween(checkIn: string, checkOut: string): number {
  return Math.round((Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / 86_400_000)
}

/**
 * What stops these dates from being searched, or null. The server enforces the same (`invalid_stay`); this is
 * what lets the page say which rule, before asking. `today` is the venue's own day.
 */
export function datesProblem(checkIn: string | null, checkOut: string | null, rules: StayRules, today: string): { code: 'pick_dates' | 'min_nights' | 'max_nights'; count: number } | null {
  if (!checkIn || !checkOut || checkIn < today || checkOut <= checkIn) return { code: 'pick_dates', count: 0 }
  const nights = nightsBetween(checkIn, checkOut)
  if (nights < rules.min_nights) return { code: 'min_nights', count: rules.min_nights }
  if (nights > rules.max_nights) return { code: 'max_nights', count: rules.max_nights }
  return null
}

/** The requests are sent at confirm, never here: they cost nothing, so they must not ask for a new price. */
export function stayQuoteBody(state: StayState): StayQuoteBody {
  return {
    unit_id: state.roomId!,
    check_in: state.checkIn!,
    check_out: state.checkOut!,
    adults: state.adults,
    children: state.children,
    extras: state.extras.map(id => ({ id, quantity: 1 })),
    coupon: state.coupon,
  }
}

export type StayFocusTarget = { kind: 'notice' } | { kind: 'heading'; step: StayStep }

export function stayFocusTarget(step: StayStep, hasNotice: boolean): StayFocusTarget {
  return hasNotice ? { kind: 'notice' } : { kind: 'heading', step }
}

/**
 * What an error from the stay quote means for Review. A `coupon_*` error clears the coupon and is shown next
 * to it; a room that is gone (`room_unavailable`, or `not_found` for a room the venue switched off since)
 * sends the member back to the rooms; dates the venue does not sell, back to the dates. `extra_lead_time` is
 * shown in place, next to the add-ons. Anything else gets Review's own "try again".
 */
export function afterStayQuoteError(code: string | null): { patch: StayReviewPatch | null; noticeCode: string; to: 'dates' | 'room' | null } | null {
  if (code === null) return null
  if (code.startsWith('coupon_')) return { patch: { coupon: null }, noticeCode: code, to: null }
  if (code === 'room_unavailable' || code === 'not_found') return { patch: null, noticeCode: 'room_unavailable', to: 'room' }
  if (code === 'invalid_stay') return { patch: null, noticeCode: 'invalid_stay', to: 'dates' }
  return null
}

export type StayConfirmDecision =
  /** Send the member away: the server has released whatever it held (a hold, a coupon, a mismatched
   *  intent of its own) — safe to ask for a fresh price, a fresh room, or fresh dates. */
  | { to: 'dates' | 'room' | 'review'; clearRoom: boolean }
  /** Stay on Pay: nothing was released, so no fresh hold and no fresh card may ever be offered.
   *  `hold: 'contact'` — the server answered with a code, but not one that releases anything: the member
   *  must be told to stop and check, never invited to retry themselves (`confirm_failed` may even mean the
   *  booking already exists). `hold: 'retry'` — no code at all (a network error, an empty 5xx), OR
   *  `payment_check_failed` (the server's own code for: Stripe itself was unreachable): the same confirm is safe to
   *  resend either way, because a hold is booked once and a repeat answers whatever the first attempt
   *  actually did. */
  | { to: 'pay'; hold: 'contact' | 'retry' }
  /** Nothing was ever authorised (pay at venue, or the payment-intent call never got that far): stay on
   *  Pay and offer a plain retry of the same confirm, same as `hold: 'retry'` but with nothing at stake. */
  | { to: null; clearRoom: false }

/** The confirm codes `PortalStayBookingController::confirm()`'s own `fail()` helper releases the member's
 *  authorisation for (or, for `payment_mismatch`, cancels a mismatched intent of its own) — every one of
 *  these is safe to send the member away from. Anything not in this set — `confirm_failed`, `hold_not_found`,
 *  `no_membership`, any code this decision has never seen, or no code at all — releases NOTHING. */
const RELEASES_TO_ROOM = 'room_unavailable'
const RELEASES_TO_DATES = 'invalid_stay'
const RELEASES_TO_REVIEW = new Set(['hold_expired', 'price_changed', 'pms_unavailable', 'not_bookable', 'payment_mismatch'])

/**
 * What an error from the stay confirm means for Pay, given whether the member's card had already been
 * authorised (`paid`) by the time this particular answer arrived.
 *
 * Two codes are decided before `paid` is even consulted, because neither one depends on it:
 * `payment_check_failed` (the server's own code) is the 503 Stripe-
 * unreachable answer — the member's authorisation, if any, is exactly where it was, and the same confirm
 * (same hold, same intent) is always safe to resend, in EITHER paid state. `confirm_failed`
 * means the write itself may have half-happened — the booking might already exist — so it is never
 * treated as a release either, whether or not a card had been captured yet: the member is told to stop and
 * check, not invited to pay again or sent back for a fresh hold that could double-book them.
 *
 * `paid === false` for everything else — pay at venue, or nothing was ever authorised — has nothing at
 * risk yet: no answer at all (a network error) stays on Pay with a
 * plain retry; every other coded answer sends the member back (to the rooms when the room is gone, to the
 * dates when the dates are, otherwise to Review for a fresh price and hold).
 *
 * `paid === true` changes the rule completely for what's left: the member must never be invited to pay a
 * second time while an authorisation from THIS attempt might still be live. Only the closed, server-confirmed
 * "this really was released" set above may send the member away; every other coded answer, and any answer
 * with no code at all, keeps them on Pay — see the `StayConfirmDecision` doc for what `hold: 'contact'`/
 * `'retry'` mean.
 */
export function afterStayConfirmError(code: string | null, paid: boolean): StayConfirmDecision {
  if (code === 'payment_check_failed') return { to: 'pay', hold: 'retry' }
  if (code === 'confirm_failed') return { to: 'pay', hold: 'contact' }
  if (!paid) {
    if (code === null) return { to: null, clearRoom: false }
    if (code === RELEASES_TO_ROOM) return { to: 'room', clearRoom: true }
    if (code === RELEASES_TO_DATES) return { to: 'dates', clearRoom: true }
    return { to: 'review', clearRoom: false }
  }
  if (code === RELEASES_TO_ROOM) return { to: 'room', clearRoom: true }
  if (code === RELEASES_TO_DATES) return { to: 'dates', clearRoom: true }
  if (code !== null && (RELEASES_TO_REVIEW.has(code) || code.startsWith('coupon_'))) {
    return { to: 'review', clearRoom: false }
  }
  return code === null ? { to: 'pay', hold: 'retry' } : { to: 'pay', hold: 'contact' }
}

/** The arguments a retry of the stay confirm sends: the SAME hold and the SAME payment intent id (or none)
 *  the visit already carries — never a new one — so a resend after `hold: 'retry'` (a network hiccup, or
 *  `payment_check_failed`) answers whatever the first attempt actually did. Kept apart from
 *  `StayPayStep.tsx`'s own `retryConfirm` so the choice of arguments has a test of its own, not just the
 *  component wiring around it. */
export function retryConfirmArgs(visit: { paymentIntentId: string | null; paid: boolean }): { paymentIntentId: string | null; paid: boolean } {
  return { paymentIntentId: visit.paymentIntentId, paid: visit.paid }
}

/** What the stay Pay step's own bounce effect should send `onBack`, or `null` to do nothing.
 *  `afterStayConfirmError`'s own decision already carries everything needed; this translates it so the
 *  "which decisions never bounce, and which fields travel when one does" wiring is a pure function a test
 *  can drive directly — the effect in `StayPayStep.tsx` itself is untestable under the string renderer. */
export function stayBounceArgs(decision: StayConfirmDecision, code: string): { to: 'dates' | 'room' | 'review'; code: string; clearRoom: boolean } | null {
  if (decision.to === 'pay' || decision.to === null) return null
  return { to: decision.to, code, clearRoom: decision.clearRoom }
}

/** Which of five sentences the Pay step's own `hold: 'contact'`/`'retry'` notice shows.
 *  `hold: 'contact'`/`'retry'` fires for a PAY-AT-VENUE member too (`confirm_failed`
 *  and `payment_check_failed`, per `afterStayConfirmError`, both apply in EITHER paid state), so the generic
 *  sentences (`portal.stay.confirm_contact`/`confirm_retry`), which both say "your card has been
 *  authorised", must not be used unpaid — that claim is true only when `paid` (no card exists on that visit
 *  otherwise). `payment_check_failed` keeps its own single sentence regardless of `paid` — its copy is itself
 *  careful never to claim a card exists ("no new payment was made" is true either way) — and wins over the
 *  generic retry copy the moment it is the cause. */
export type StayPayNoticeKind = 'contact' | 'contact_unpaid' | 'retry' | 'retry_unpaid' | 'retry_payment_check_failed'

export function stayPayNoticeKind(hold: 'contact' | 'retry' | null, paid: boolean, code: string | null): StayPayNoticeKind | null {
  if (hold === 'contact') return paid ? 'contact' : 'contact_unpaid'
  if (hold === 'retry') {
    if (code === 'payment_check_failed') return 'retry_payment_check_failed'
    return paid ? 'retry' : 'retry_unpaid'
  }
  return null
}

/** What a failed stay payment-intent call means: nothing to charge online at all (offer Confirm without a
 *  card, same as pay-at-venue), the hold itself is already gone (bounce to Review — nothing was ever
 *  authorised, so nothing needs releasing), or a genuine failure (card unavailable, offer a retry with a
 *  fresh nonce). Kept as its own pure function, apart from `StayPayStep.tsx`'s component wiring. */
export type StayIntentErrorKind = 'nothing_to_charge' | 'hold_gone' | 'error'

const INTENT_NOTHING_TO_CHARGE = new Set(['nothing_to_pay', 'pay_at_venue'])
const INTENT_HOLD_GONE = new Set(['hold_expired', 'price_changed', 'hold_not_found'])

export function stayIntentErrorKind(code: string | null): StayIntentErrorKind | null {
  if (code === null) return null
  if (INTENT_NOTHING_TO_CHARGE.has(code)) return 'nothing_to_charge'
  if (INTENT_HOLD_GONE.has(code)) return 'hold_gone'
  return 'error'
}

/**
 * What the Pay step's own body shows — the component renders from this, rather than from a scatter of
 * booleans, so every reachable combination is a single pure-function call a test can drive directly (the
 * frontend tests render to a string and cannot run the mutation whose state this is really keyed on).
 *
 * Order matters: `confirm` (an attempt already in flight, or just answered) always wins first — nothing
 * else may show once a confirm is running or has succeeded. Next, `hold` — checked BEFORE `paid`:
 * `afterStayConfirmError` can answer `hold: 'contact'`/`'retry'` for `payment_check_failed` and
 * `confirm_failed` in EITHER paid state, so this step must show the same "stop, do not pay again" or "safe
 * to retry" screen whether or not a card happened to be captured on this particular attempt — a bare
 * `confirm_button` for `retry` (the button doubles as that retry's control) or the defensive "paid, but
 * nothing in flight and no error either" case, so this step is never blank; `contact` for the rest. Once
 * `hold` is null, `paid` alone still forces a bare `confirm_button` (nothing else is safe to show a captured
 * card next to). Only once none of that applies does the total/online/card state before any money has moved
 * come into play.
 */
export type StayPayView = 'card' | 'loading_card' | 'confirming' | 'confirm_button' | 'contact' | 'at_venue' | 'nothing_to_pay'

export interface StayPayViewInput {
  online: boolean
  /** The quote's own total — a zero total means nothing is owed anywhere, not even at the venue. */
  total: number
  /** The payment-intent call (or a visit that already remembers its own answer) said there is nothing to
   *  charge ONLINE — distinct from `total <= 0`: something may still be owed at the venue in person. */
  noCard: boolean
  /** Whether the payment-intent query has a usable client secret yet — only consulted once genuinely
   *  chargeable online (not `paid`, not `noCard`, a positive total). */
  cardReady: boolean
  paid: boolean
  confirm: 'idle' | 'pending' | 'success'
  /** `afterStayConfirmError`'s own `hold`, when its decision was to stay on Pay — `null` otherwise
   *  (no error, or an error that sent the member away instead). */
  hold: 'contact' | 'retry' | null
}

export function payView(v: StayPayViewInput): StayPayView {
  if (v.confirm === 'pending' || v.confirm === 'success') return 'confirming'
  if (v.hold === 'contact') return 'contact'
  if (v.hold === 'retry' || v.paid) return 'confirm_button'
  if (v.total <= 0) return 'nothing_to_pay'
  if (!v.online || v.noCard) return 'at_venue'
  return v.cardReady ? 'card' : 'loading_card'
}

/** Whether to show the "online payment is unavailable" notice (a missing publishable key). Never once the
 *  card is captured (there is nothing left for a missing key to block), and never once
 *  the visit already knows it needs no card online at all — both would otherwise tell a member their payment
 *  is broken when there is nothing left to pay online in the first place. */
export function showCardUnavailable(chargeable: boolean, hasKey: boolean, paid: boolean, noCard: boolean): boolean {
  return chargeable && !hasKey && !paid && !noCard
}

/** The payment-intent call's own two "nothing chargeable online" answers.
 *  `payView`/the Confirm-without-card button (`StayPayStep.tsx`) treat them the same — both
 *  offer Confirm with no card — but the breakdown's own line must not: `'nothing_to_pay'` means the total
 *  itself is not owed at all (the breakdown says so — "Nothing to pay."); `'pay_at_venue'` means it IS owed,
 *  just not online (the breakdown still names the amount — "To pay at {{venue}}: …"). A single merged
 *  boolean cannot tell these apart. */
export type StayIntentAnswer = 'nothing_to_pay' | 'pay_at_venue' | null

/** What the price breakdown's own "what's charged when" line says. Checked in this order on purpose: a zero
 *  total means nothing is owed anywhere, even when the mode is otherwise "online" or "at venue" — never "pay
 *  at venue: €0.00".
 *
 * `onPayStep: true` (Pay) is where `intentAnswer` — the
 * payment-intent call's own answer, not the quote's stale `mode` — decides, and the two answers read
 * differently (see `StayIntentAnswer`): `'nothing_to_pay'` wins even over a positive `total` (the quote may
 * be stale); `'pay_at_venue'` wins over an `online` `mode`. Ignored on Review (`onPayStep: false`), where no
 * such call has been made yet.
 *
 * An `online` total must not collapse "about to be reserved" and "already reserved"
 * into one `charged_now` state — the member must never be told a card WAS authorised before it actually was.
 * Three distinct states cover the whole online-and-owed case: `'charged_next_step'` on Review (nothing
 * has happened yet — only a promise for the step after this one); `'charged_pending'` on Pay BEFORE the card
 * is authorised (still only a promise, worded for "you are on this step now" rather than "at the next
 * step"); `'charged_now'` on Pay only once `paid` — the visit's own authorised state — is `true`. */
export type StayChargeLine = 'charged_now' | 'charged_pending' | 'charged_next_step' | 'pay_at_venue' | 'nothing_to_pay'

export function stayChargeLine(mode: 'online' | 'at_venue', total: number, onPayStep: boolean, paid: boolean, intentAnswer: StayIntentAnswer = null): StayChargeLine {
  if (total <= 0) return 'nothing_to_pay'
  if (onPayStep && intentAnswer === 'nothing_to_pay') return 'nothing_to_pay'
  if (mode !== 'online') return 'pay_at_venue'
  if (onPayStep && intentAnswer === 'pay_at_venue') return 'pay_at_venue'
  if (!onPayStep) return 'charged_next_step'
  return paid ? 'charged_now' : 'charged_pending'
}

/**
 * The per-night figure the room card shows, directly under its big total — chosen so the two never
 * contradict each other. When the member's own total is the one on display (it is lower than the list
 * total, and there is at least one night to spread it over), this is THAT total divided by the nights,
 * rounded to the cent, never the separate (and higher) list rate the availability endpoint also sends.
 * Otherwise — no discount, or `nights` is `0` (a caller hasn't loaded `StayAvailability.nights` yet) — this
 * falls back to the list rate itself, and `null` when there isn't one to show at all.
 */
export function perNightShown(room: Pick<AvailableRoom, 'price_per_night' | 'total_price' | 'member_total'>, nights: number): number | null {
  const discounted = room.member_total < room.total_price
  if (discounted && nights > 0) return Math.round((room.member_total / nights) * 100) / 100
  return room.price_per_night > 0 ? room.price_per_night : null
}

/**
 * What `StayBook.tsx` shows in place of the whole flow while the stay catalogue is loading, failed, or in
 * hand. Kept as its own pure function so the one invariant that matters has a test of its own: `'error'`
 * only when there is NO catalogue data at ALL. A
 * failed BACKGROUND refetch (the catalogue query stays enabled and can retry on its own) must never replace
 * the whole tree while the member is mid-payment on Pay — `hasData` staying `true` is what keeps that step
 * mounted, so `'ready'` wins over `isError` whenever there is already data to show, stale or not.
 */
export type StayCatalogueGuard = 'error' | 'loading' | 'ready'

export function stayCatalogueGuard(hasData: boolean, isError: boolean): StayCatalogueGuard {
  if (hasData) return 'ready'
  return isError ? 'error' : 'loading'
}
