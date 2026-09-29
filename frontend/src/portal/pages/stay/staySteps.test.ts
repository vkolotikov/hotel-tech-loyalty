import { describe, expect, it } from 'vitest'
import { newPayVisit } from '../book/steps'
import type { StayQuote } from '../../lib/types'
import {
  addDays, afterStayConfirmError, afterStayQuoteError, datesProblem, initialStayState, nightsBetween, payView, perNightShown, retryConfirmArgs, showCardUnavailable, stayBounceArgs, stayCatalogueGuard, stayChargeLine, stayFocusTarget, stayIntentErrorKind, stayPayNoticeKind, stayQuoteBody, stayReducer, type StayState,
} from './staySteps'

const rules = { currency: 'EUR', min_nights: 2, max_nights: 14 }
const picked: StayState = { ...initialStayState, checkIn: '2026-10-10', checkOut: '2026-10-12', adults: 2, children: 1 }
const quote = { hold_token: 'H', total_amount: 180 } as unknown as StayQuote
const visit = newPayVisit((() => { let n = 0; return () => `id-${n++}` })())

describe('dates', () => {
  it('adds days across a month end and counts nights', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(nightsBetween('2026-10-10', '2026-10-12')).toBe(2)
    expect(nightsBetween('2026-10-30', '2026-11-02')).toBe(3)
    expect(nightsBetween('2026-10-12', '2026-10-10')).toBe(-2)
  })

  it('holds across a DST change, a year end and a leap day — calendar days, never local-clock arithmetic', () => {
    // Europe/Riga ends DST (clocks back an hour) in the night of 2026-10-24/25.
    expect(nightsBetween('2026-10-24', '2026-10-26')).toBe(2)
    // Europe/Riga starts DST (clocks forward an hour) in the night of 2026-03-28/29.
    expect(nightsBetween('2026-03-28', '2026-03-30')).toBe(2)
    expect(addDays('2026-12-31', 2)).toBe('2027-01-02')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29') // 2028 is a leap year
    expect(addDays('2028-02-28', 2)).toBe('2028-03-01')
  })

  it('names what is wrong with a pair of dates, or nothing', () => {
    expect(datesProblem(null, null, rules, '2026-10-01')).toEqual({ code: 'pick_dates', count: 0 })
    expect(datesProblem('2026-10-10', null, rules, '2026-10-01')).toEqual({ code: 'pick_dates', count: 0 })
    expect(datesProblem('2026-09-30', '2026-10-03', rules, '2026-10-01')).toEqual({ code: 'pick_dates', count: 0 })
    expect(datesProblem('2026-10-10', '2026-10-10', rules, '2026-10-01')).toEqual({ code: 'pick_dates', count: 0 })
    expect(datesProblem('2026-10-10', '2026-10-11', rules, '2026-10-01')).toEqual({ code: 'min_nights', count: 2 })
    expect(datesProblem('2026-10-10', '2026-10-25', rules, '2026-10-01')).toEqual({ code: 'max_nights', count: 14 })
    expect(datesProblem('2026-10-10', '2026-10-12', rules, '2026-10-01')).toBeNull()
    expect(datesProblem('2026-10-01', '2026-10-03', rules, '2026-10-01')).toBeNull()
  })
})

describe('stayReducer', () => {
  it('moving the arrival past the departure clears the departure; new dates drop the room and its quote', () => {
    const withRoom: StayState = { ...picked, roomId: '101', quote, extras: ['3'], step: 'review' }
    const next = stayReducer(withRoom, { type: 'setDates', checkIn: '2026-10-15', checkOut: '2026-10-12' })
    expect(next.checkIn).toBe('2026-10-15')
    expect(next.checkOut).toBeNull()
    expect(next.roomId).toBeNull()
    expect(next.quote).toBeNull()
    expect(next.extras).toEqual(['3'])
  })

  it('changing the party drops the room too: a room is chosen for a party', () => {
    const next = stayReducer({ ...picked, roomId: '101' }, { type: 'setGuests', adults: 4, children: 0 })
    expect(next).toMatchObject({ adults: 4, children: 0, roomId: null })
  })

  it('search goes to the rooms, a room goes to review', () => {
    expect(stayReducer(picked, { type: 'search' }).step).toBe('room')
    expect(stayReducer({ ...picked, step: 'room' }, { type: 'pickRoom', roomId: '101' })).toMatchObject({ roomId: '101', step: 'review' })
  })

  it('a new room forgets the coupon verdict of the old one but keeps the choices', () => {
    const next = stayReducer({ ...picked, roomId: '101', coupon: { member_offer_id: 7 }, extras: ['3'], quote }, { type: 'pickRoom', roomId: '102' })
    expect(next.coupon).toEqual({ member_offer_id: 7 })
    expect(next.extras).toEqual(['3'])
    expect(next.quote).toBeNull()
  })

  it('continue carries the requests with the quote in one step', () => {
    const next = stayReducer({ ...picked, roomId: '101', step: 'review' }, { type: 'continueToPay', requests: 'Quiet room', quote, visit })
    expect(next).toMatchObject({ step: 'pay', requests: 'Quiet room', quote, visit })
  })

  it('a bounce drops the visit and the quote, shows the code, and clears the room only when told', () => {
    const paying: StayState = { ...picked, roomId: '101', quote, visit, step: 'pay' }
    const toRoom = stayReducer(paying, { type: 'bounce', to: 'room', code: 'room_unavailable', clearRoom: true })
    expect(toRoom).toMatchObject({ step: 'room', roomId: null, visit: null, quote: null, notice: { step: 'room', code: 'room_unavailable' } })
    const toReview = stayReducer(paying, { type: 'bounce', to: 'review', code: 'price_changed', clearRoom: false })
    expect(toReview).toMatchObject({ step: 'review', roomId: '101', visit: null, quote: null, notice: { step: 'review', code: 'price_changed' } })
  })

  it('every choice the member makes clears the notice', () => {
    const noticed: StayState = { ...picked, roomId: '101', step: 'review', notice: { step: 'review', code: 'price_changed' } }
    expect(stayReducer(noticed, { type: 'patchReview', patch: { extras: ['3'] } }).notice).toBeNull()
    expect(stayReducer(noticed, { type: 'jump', step: 'dates' }).notice).toBeNull()
    expect(stayReducer(noticed, { type: 'setGuests', adults: 1, children: 0 }).notice).toBeNull()
  })

  // Blurring the special-requests field costs nothing and asks for no new price, so it
  // is not "the member's next choice" the way changing an extra or the coupon is — a bounce notice on
  // Review must survive it. A patch that mixes requests with a real choice still clears it.
  it('a requests-only patch (StayReviewStep\'s own onBlur) keeps an existing notice; any other patch still clears it', () => {
    const noticed: StayState = { ...picked, roomId: '101', step: 'review', notice: { step: 'review', code: 'coupon_used' } }
    const requestsOnly = stayReducer(noticed, { type: 'patchReview', patch: { requests: 'Quiet room please' } })
    expect(requestsOnly.notice).toEqual({ step: 'review', code: 'coupon_used' })
    expect(requestsOnly.requests).toBe('Quiet room please')
    expect(stayReducer(noticed, { type: 'patchReview', patch: { extras: ['3'] } }).notice).toBeNull()
    expect(stayReducer(noticed, { type: 'patchReview', patch: { requests: 'x', extras: ['3'] } }).notice).toBeNull()
  })

  it('a late callback cannot bring a dropped visit back', () => {
    expect(stayReducer({ ...picked, visit: null }, { type: 'visit', patch: { paid: true } }).visit).toBeNull()
    expect(stayReducer({ ...picked, visit }, { type: 'visit', patch: { held: true } }).visit).toMatchObject({ held: true })
  })

  it('reset is a clean start', () => {
    expect(stayReducer({ ...picked, roomId: '101', quote, visit, step: 'pay' }, { type: 'reset' })).toEqual(initialStayState)
  })
})

describe('stayQuoteBody', () => {
  it('names the room, the dates, the party, one of each extra and the coupon', () => {
    expect(stayQuoteBody({ ...picked, roomId: '101', extras: ['3', '5'], coupon: { redemption_id: 9 }, requests: 'ignored here' })).toEqual({
      unit_id: '101', check_in: '2026-10-10', check_out: '2026-10-12', adults: 2, children: 1,
      extras: [{ id: '3', quantity: 1 }, { id: '5', quantity: 1 }], coupon: { redemption_id: 9 },
    })
  })
})

describe('afterStayQuoteError', () => {
  it('a coupon error clears the coupon and names the code', () => {
    expect(afterStayQuoteError('coupon_used')).toEqual({ patch: { coupon: null }, noticeCode: 'coupon_used', to: null })
  })

  it('a room that is gone sends the member back to the rooms; bad dates back to the dates', () => {
    expect(afterStayQuoteError('room_unavailable')).toEqual({ patch: null, noticeCode: 'room_unavailable', to: 'room' })
    expect(afterStayQuoteError('not_found')).toEqual({ patch: null, noticeCode: 'room_unavailable', to: 'room' })
    expect(afterStayQuoteError('invalid_stay')).toEqual({ patch: null, noticeCode: 'invalid_stay', to: 'dates' })
  })

  it('nothing for an add-on error (shown in place), an unknown code, or no error', () => {
    expect(afterStayQuoteError('extra_lead_time')).toBeNull()
    expect(afterStayQuoteError('something_else')).toBeNull()
    expect(afterStayQuoteError(null)).toBeNull()
  })
})

describe('afterStayConfirmError', () => {
  describe('paid === false: nothing was ever authorised, so nothing is at risk', () => {
    it('no answer at all: stay and retry — the same hold and payment are sent again, and a hold is booked once', () => {
      expect(afterStayConfirmError(null, false)).toEqual({ to: null, clearRoom: false })
    })

    it('the room is gone: back to the rooms without it', () => {
      expect(afterStayConfirmError('room_unavailable', false)).toEqual({ to: 'room', clearRoom: true })
    })

    it('bad dates: back to the dates', () => {
      expect(afterStayConfirmError('invalid_stay', false)).toEqual({ to: 'dates', clearRoom: true })
    })

    it('every other answer of the server, released or not: back to review, which asks for a fresh price and a fresh hold', () => {
      for (const code of ['hold_expired', 'price_changed', 'payment_mismatch', 'payment_required', 'coupon_used', 'pms_unavailable', 'not_bookable', 'hold_not_found', 'no_membership', 'never_seen_before']) {
        expect(afterStayConfirmError(code, false)).toEqual({ to: 'review', clearRoom: false })
      }
    })

    // confirm_failed means the write itself may have half-happened — the booking might
    // already exist — so, unlike every other code above, it is NEVER read as "safe to send the member away
    // for a fresh hold", even before a card was ever captured.
    it('confirm_failed: the booking may already exist — stay on Pay and tell the member to check, never bounce to a fresh hold', () => {
      expect(afterStayConfirmError('confirm_failed', false)).toEqual({ to: 'pay', hold: 'contact' })
    })
  })

  // payment_check_failed is the server's own code for: Stripe could not be reached to check the
  // payment. The member's authorisation, if there is one, is exactly where it was; nothing was released, and
  // the same confirm (same hold, same intent) is always safe to resend — in EITHER paid state.
  describe('payment_check_failed: decided before paid is even consulted', () => {
    it('stays on Pay with a retry, whether or not a card had been captured on this attempt', () => {
      expect(afterStayConfirmError('payment_check_failed', false)).toEqual({ to: 'pay', hold: 'retry' })
      expect(afterStayConfirmError('payment_check_failed', true)).toEqual({ to: 'pay', hold: 'retry' })
    })
  })

  describe('paid === true: the card is authorised — only a SERVER-CONFIRMED release may send the member away', () => {
    it('the room is gone: released — back to the rooms without it', () => {
      expect(afterStayConfirmError('room_unavailable', true)).toEqual({ to: 'room', clearRoom: true })
    })

    it('bad dates: released — back to the dates', () => {
      expect(afterStayConfirmError('invalid_stay', true)).toEqual({ to: 'dates', clearRoom: true })
    })

    it('hold_expired, price_changed, pms_unavailable, not_bookable, payment_mismatch and every coupon_*: released — back to review with a fresh visit', () => {
      for (const code of ['hold_expired', 'price_changed', 'pms_unavailable', 'not_bookable', 'payment_mismatch', 'coupon_used', 'coupon_expired', 'coupon_not_found']) {
        expect(afterStayConfirmError(code, true)).toEqual({ to: 'review', clearRoom: false })
      }
    })

    it('confirm_failed, hold_not_found, no_membership, any code this decision has never seen: releases nothing — stay on pay, contact the venue, no retry offered here', () => {
      for (const code of ['confirm_failed', 'hold_not_found', 'no_membership', 'payment_required', 'never_seen_before']) {
        expect(afterStayConfirmError(code, true)).toEqual({ to: 'pay', hold: 'contact' })
      }
    })

    it('no code at all (a network error, an empty 5xx): releases nothing either, but the SAME confirm is safe to resend', () => {
      expect(afterStayConfirmError(null, true)).toEqual({ to: 'pay', hold: 'retry' })
    })
  })
})

describe('stayIntentErrorKind', () => {
  it('nothing to charge online: the two codes the payment-intent call itself can answer with', () => {
    expect(stayIntentErrorKind('nothing_to_pay')).toBe('nothing_to_charge')
    expect(stayIntentErrorKind('pay_at_venue')).toBe('nothing_to_charge')
  })

  it('the hold itself is gone: nothing was ever authorised, so nothing needs releasing', () => {
    expect(stayIntentErrorKind('hold_expired')).toBe('hold_gone')
    expect(stayIntentErrorKind('price_changed')).toBe('hold_gone')
    expect(stayIntentErrorKind('hold_not_found')).toBe('hold_gone')
  })

  it('a genuine failure, or no error at all', () => {
    expect(stayIntentErrorKind('payment_unavailable')).toBe('error')
    expect(stayIntentErrorKind('pms_unavailable')).toBe('error')
    expect(stayIntentErrorKind(null)).toBeNull()
  })
})

describe('payView', () => {
  const base = { online: true, total: 100, noCard: false, cardReady: false, paid: false, confirm: 'idle' as const, hold: null }

  it('a confirm in flight, or one that just succeeded, always wins first', () => {
    expect(payView({ ...base, confirm: 'pending' })).toBe('confirming')
    expect(payView({ ...base, confirm: 'success' })).toBe('confirming')
    expect(payView({ ...base, paid: true, confirm: 'pending' })).toBe('confirming')
    expect(payView({ ...base, total: 0, confirm: 'pending' })).toBe('confirming')
  })

  it('paid, and the server said the answer releases nothing worth telling the member to retry: contact the venue', () => {
    expect(payView({ ...base, paid: true, hold: 'contact' })).toBe('contact')
  })

  it('paid, and either the answer is safe to resend or nothing has been tried yet: a bare confirm button, never blank', () => {
    expect(payView({ ...base, paid: true, hold: 'retry' })).toBe('confirm_button')
    expect(payView({ ...base, paid: true, hold: null })).toBe('confirm_button')
  })

  // payment_check_failed's own decision (hold: 'retry') and confirm_failed's (hold:
  // 'contact') both arrive from afterStayConfirmError() EVEN WHEN paid is false — payView must show the
  // same screen either way, not silently drop `hold` because a card never happened to be captured yet.
  it('hold wins over paid, in EITHER direction, even when nothing was ever authorised', () => {
    expect(payView({ ...base, paid: false, hold: 'contact' })).toBe('contact')
    expect(payView({ ...base, paid: false, hold: 'retry' })).toBe('confirm_button')
  })

  it('not paid, a zero total: nothing to pay, whatever the mode', () => {
    expect(payView({ ...base, total: 0 })).toBe('nothing_to_pay')
    expect(payView({ ...base, total: 0, online: false })).toBe('nothing_to_pay')
    expect(payView({ ...base, total: 0, noCard: true })).toBe('nothing_to_pay')
  })

  it('not paid, something owed, but not online right now: at the venue', () => {
    expect(payView({ ...base, online: false })).toBe('at_venue')
    expect(payView({ ...base, noCard: true })).toBe('at_venue')
  })

  it('not paid, genuinely chargeable online: loading, then the card, never both', () => {
    expect(payView({ ...base, cardReady: false })).toBe('loading_card')
    expect(payView({ ...base, cardReady: true })).toBe('card')
  })
})

describe('stayChargeLine', () => {
  // Three distinct online-and-owed states, not two — the member must never be
  // told a card WAS authorised (`charged_now`) before it actually was (`paid`).
  it('on Pay, online, authorised: charged now (reserved, captured later)', () => {
    expect(stayChargeLine('online', 193.5, true, true)).toBe('charged_now')
  })

  it('on Pay, online, NOT yet authorised: only a promise, worded for "now", not "reserved" yet', () => {
    expect(stayChargeLine('online', 193.5, true, false)).toBe('charged_pending')
  })

  // Review has taken no card yet, so the same online quote reads as a promise for the
  // step after this one — `paid` is meaningless there and ignored.
  it('on Review, online: only a promise for the next step, whatever `paid` says', () => {
    expect(stayChargeLine('online', 193.5, false, false)).toBe('charged_next_step')
    expect(stayChargeLine('online', 193.5, false, true)).toBe('charged_next_step')
  })

  it('at the venue with something owed: pay at venue, on either step, whatever `paid` says', () => {
    expect(stayChargeLine('at_venue', 193.5, true, false)).toBe('pay_at_venue')
    expect(stayChargeLine('at_venue', 193.5, false, false)).toBe('pay_at_venue')
  })

  it('a zero total wins over the mode, the step and `paid`: nothing to pay, never "pay at venue: 0"', () => {
    expect(stayChargeLine('online', 0, true, true)).toBe('nothing_to_pay')
    expect(stayChargeLine('at_venue', 0, false, false)).toBe('nothing_to_pay')
  })

  // The payment-intent call's own answer, only meaningful on Pay,
  // wins over the quote's stale "online" mode — the two answers must read DIFFERENTLY: a single merged
  // boolean would send both to "pay at venue".
  it('on Pay, intentAnswer pay_at_venue wins over an online quote: pay at venue, not charged now', () => {
    expect(stayChargeLine('online', 193.5, true, true, 'pay_at_venue')).toBe('pay_at_venue')
  })

  it('on Pay, intentAnswer nothing_to_pay wins even over a positive total: nothing to pay, not pay at venue', () => {
    expect(stayChargeLine('online', 193.5, true, true, 'nothing_to_pay')).toBe('nothing_to_pay')
  })

  it('intentAnswer is ignored on Review — no intent call has been made yet to answer it', () => {
    expect(stayChargeLine('online', 193.5, false, false, 'pay_at_venue')).toBe('charged_next_step')
    expect(stayChargeLine('online', 193.5, false, false, 'nothing_to_pay')).toBe('charged_next_step')
  })
})

describe('showCardUnavailable', () => {
  it('shown only when chargeable, keyless, unpaid and a card is still needed', () => {
    expect(showCardUnavailable(true, false, false, false)).toBe(true)
  })

  it('never once the card is captured', () => {
    expect(showCardUnavailable(true, false, true, false)).toBe(false)
  })

  it('never once the visit knows it needs no card online at all', () => {
    expect(showCardUnavailable(true, false, false, true)).toBe(false)
  })

  it('never when there is a key, or nothing chargeable in the first place', () => {
    expect(showCardUnavailable(true, true, false, false)).toBe(false)
    expect(showCardUnavailable(false, false, false, false)).toBe(false)
  })
})

describe('retryConfirmArgs', () => {
  it('sends the SAME payment intent id and paid state the visit already carries', () => {
    expect(retryConfirmArgs({ paymentIntentId: 'pi_1', paid: true })).toEqual({ paymentIntentId: 'pi_1', paid: true })
    expect(retryConfirmArgs({ paymentIntentId: null, paid: false })).toEqual({ paymentIntentId: null, paid: false })
  })
})

describe('stayBounceArgs', () => {
  it('does nothing for a decision that stays on Pay, or offers nothing at all', () => {
    expect(stayBounceArgs({ to: 'pay', hold: 'contact' }, 'confirm_failed')).toBeNull()
    expect(stayBounceArgs({ to: 'pay', hold: 'retry' }, 'payment_check_failed')).toBeNull()
    expect(stayBounceArgs({ to: null, clearRoom: false }, 'anything')).toBeNull()
  })

  it('carries the step, the code and clearRoom through for a decision that does bounce', () => {
    expect(stayBounceArgs({ to: 'room', clearRoom: true }, 'room_unavailable')).toEqual({ to: 'room', code: 'room_unavailable', clearRoom: true })
    expect(stayBounceArgs({ to: 'review', clearRoom: false }, 'price_changed')).toEqual({ to: 'review', code: 'price_changed', clearRoom: false })
  })
})

// `hold: 'contact'`/`'retry'` fires for a pay-at-venue member too, whose sentence must never claim a
// card was authorised. Every `{ hold, paid, code }` combination the Pay step can actually reach is
// exercised here.
describe('stayPayNoticeKind', () => {
  it('no hold at all: nothing to show', () => {
    expect(stayPayNoticeKind(null, true, null)).toBeNull()
    expect(stayPayNoticeKind(null, false, 'confirm_failed')).toBeNull()
  })

  it('contact, paid: the card-authorised sentence', () => {
    expect(stayPayNoticeKind('contact', true, 'confirm_failed')).toBe('contact')
    expect(stayPayNoticeKind('contact', true, 'hold_not_found')).toBe('contact')
  })

  it('contact, unpaid: the pay-at-venue sentence — no card exists on this visit', () => {
    expect(stayPayNoticeKind('contact', false, 'confirm_failed')).toBe('contact_unpaid')
    expect(stayPayNoticeKind('contact', false, 'no_membership')).toBe('contact_unpaid')
  })

  it('retry, payment_check_failed: its own sentence, in EITHER paid state', () => {
    expect(stayPayNoticeKind('retry', true, 'payment_check_failed')).toBe('retry_payment_check_failed')
    expect(stayPayNoticeKind('retry', false, 'payment_check_failed')).toBe('retry_payment_check_failed')
  })

  it('retry, paid, not payment_check_failed: the card-authorised retry sentence', () => {
    expect(stayPayNoticeKind('retry', true, null)).toBe('retry')
  })

  it('retry, unpaid, not payment_check_failed: the pay-at-venue retry sentence', () => {
    expect(stayPayNoticeKind('retry', false, null)).toBe('retry_unpaid')
  })
})

describe('stayCatalogueGuard', () => {
  it('shows the error only when there is no data at all', () => {
    expect(stayCatalogueGuard(false, true)).toBe('error')
  })

  it('shows the skeleton while it is still loading, with no data and no error yet', () => {
    expect(stayCatalogueGuard(false, false)).toBe('loading')
  })

  // A failed BACKGROUND refetch must never replace the whole tree while the member is
  // mid-payment on Pay — data staying put is what keeps that step mounted.
  it('stays ready the moment there is data, even a stale one a background refetch just failed on', () => {
    expect(stayCatalogueGuard(true, true)).toBe('ready')
    expect(stayCatalogueGuard(true, false)).toBe('ready')
  })
})

describe('stayFocusTarget', () => {
  it('the notice first, else the heading of the step', () => {
    expect(stayFocusTarget('room', true)).toEqual({ kind: 'notice' })
    expect(stayFocusTarget('room', false)).toEqual({ kind: 'heading', step: 'room' })
  })
})

describe('perNightShown', () => {
  it('discounted: the member\'s own total spread over the nights, not the list rate', () => {
    expect(perNightShown({ price_per_night: 100, total_price: 200, member_total: 180 }, 2)).toBe(90)
  })

  it('not discounted: the list rate as given', () => {
    expect(perNightShown({ price_per_night: 90, total_price: 180, member_total: 180 }, 2)).toBe(90)
  })

  it('discounted over three nights rounds to the cent', () => {
    expect(perNightShown({ price_per_night: 100, total_price: 300, member_total: 100 }, 3)).toBe(33.33)
  })

  it('no nights to divide by: falls back to the list rate', () => {
    expect(perNightShown({ price_per_night: 100, total_price: 200, member_total: 180 }, 0)).toBe(100)
  })

  it('no rate and no discount: nothing to show', () => {
    expect(perNightShown({ price_per_night: 0, total_price: 180, member_total: 180 }, 2)).toBeNull()
  })
})
