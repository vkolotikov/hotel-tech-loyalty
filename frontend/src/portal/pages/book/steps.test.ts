import { describe, expect, it } from 'vitest'
import type { Catalogue, Quote } from '../../lib/types'
import { afterConfirmError, afterQuoteError, bookReducer, canLeavePay, focusTargetFor, initialState, newPayVisit, nextStep, visibleDay, type BookState } from './steps'

const base: Catalogue = {
  categories: [],
  services: [{ id: 11, category_id: null, name: 'Deep Tissue', description: null, short_description: null, duration_minutes: 45, buffer_after_minutes: 0, price: 60, member_price: 54, currency: 'EUR', image: null, gallery: [], tags: [], master_ids: [5, 6] }],
  masters: [
    { id: 5, name: 'Mara', title: null, bio: null, avatar: null, specialties: [], service_ids: [11] },
    { id: 6, name: 'Ilse', title: null, bio: null, avatar: null, specialties: [], service_ids: [11] },
  ],
  extras: [],
  rules: { currency: 'EUR', lead_minutes: 60, slot_step: 15, max_advance_days: 30, allow_master_choice: true, cancellation_policy: '' },
  pricing: { automatic: null },
}

describe('nextStep', () => {
  it('goes to the staff step when the venue allows the choice and more than one master serves the service', () => {
    const state = { ...initialState, serviceId: 11 }
    expect(nextStep(state, base)).toBe('staff')
  })

  it('skips the staff step when only one master serves the service', () => {
    const catalogue: Catalogue = { ...base, masters: base.masters.filter(m => m.id === 5) }
    const state = { ...initialState, serviceId: 11 }
    expect(nextStep(state, catalogue)).toBe('when')
  })

  it('skips the staff step when the venue disallows the choice, even with two masters', () => {
    const catalogue: Catalogue = { ...base, rules: { ...base.rules, allow_master_choice: false } }
    const state = { ...initialState, serviceId: 11 }
    expect(nextStep(state, catalogue)).toBe('when')
  })
})

describe('afterQuoteError', () => {
  const COUPON_CODES = ['coupon_not_found', 'coupon_used', 'coupon_expired', 'coupon_wrong_tier', 'coupon_no_capacity', 'coupon_untyped']

  it('clears the coupon and names the code, for every coupon_* error the quote can answer with', () => {
    for (const code of COUPON_CODES) {
      expect(afterQuoteError(code)).toEqual({ patch: { coupon: null }, noticeCode: code })
    }
  })

  it('does nothing for a booking-window error, an add-on lead-time error, or no error at all', () => {
    expect(afterQuoteError('slot_taken')).toBeNull()
    expect(afterQuoteError('too_soon')).toBeNull()
    expect(afterQuoteError('too_far_ahead')).toBeNull()
    expect(afterQuoteError('extra_lead_time')).toBeNull()
    expect(afterQuoteError(null)).toBeNull()
  })
})

describe('afterConfirmError', () => {
  it('sends the member back to When and clears the stale slot for every booking-window code — the hold is already released', () => {
    for (const code of ['slot_taken', 'too_soon', 'too_far_ahead']) {
      expect(afterConfirmError(code)).toEqual({ to: 'when', releasesHold: true, clearStart: true })
    }
  })

  it('sends the member back to Review, without touching the slot, for every other SERVER-CODED error (fix round 3, minor B)', () => {
    // Every code the server can answer with, except idempotency_conflict, now means the hold (if there
    // ever was one) is released — including not_found/no_membership/payment_required, which used to say
    // "stay and retry" and leave the member on a locked strip retrying an already-cancelled intent, and a
    // code this decision has never seen before ('something_new'), which must not default to "stay" either.
    for (const code of [
      'payment_mismatch', 'extra_lead_time', 'coupon_used', 'coupon_expired', 'coupon_wrong_tier', 'coupon_no_capacity', 'coupon_untyped', 'coupon_not_found',
      'confirm_failed', 'not_found', 'no_membership', 'payment_required', 'something_new',
    ]) {
      expect(afterConfirmError(code)).toEqual({ to: 'review', releasesHold: true, clearStart: false })
    }
  })

  it('stays on Pay, with no hold released, only for a network error or a key already used by a different request', () => {
    // idempotency_conflict: a DIFFERENT request already used this key — THIS attempt's own intent, if one
    // was ever held, is untouched. No code at all: a network error never reached the server's release
    // logic in the first place. These are the ONLY two cases that stay.
    for (const code of ['idempotency_conflict', null]) {
      expect(afterConfirmError(code)).toEqual({ to: null, releasesHold: false, clearStart: false })
    }
  })
})

describe('newPayVisit', () => {
  it('draws both the nonce and the idempotency key from the injected generator, starting unpaid/unheld with no intent and no noCard memory', () => {
    const draws = ['nonce-1', 'key-1']
    const visit = newPayVisit(() => draws.shift()!)
    expect(visit).toEqual({ nonce: 'nonce-1', idempotencyKey: 'key-1', paymentIntentId: null, paid: false, held: false, noCard: false })
  })

  it('gives two different visits two different nonces and keys', () => {
    let n = 0
    const random = () => `id-${n++}`
    const a = newPayVisit(random)
    const b = newPayVisit(random)
    expect(a.nonce).not.toBe(b.nonce)
    expect(a.idempotencyKey).not.toBe(b.idempotencyKey)
  })
})

describe('canLeavePay', () => {
  it('is false the moment the member presses Pay, even before Stripe has answered (fix round 2, finding M3)', () => {
    expect(canLeavePay({ nonce: 'n', idempotencyKey: 'k', paymentIntentId: null, paid: false, held: true, noCard: false })).toBe(false)
  })

  it('is false while a card is held against an unconfirmed booking', () => {
    expect(canLeavePay({ nonce: 'n', idempotencyKey: 'k', paymentIntentId: 'pi_1', paid: true, held: true, noCard: false })).toBe(false)
  })

  it('is true before the member has pressed Pay, once the hold is released, and when there is no visit at all', () => {
    expect(canLeavePay({ nonce: 'n', idempotencyKey: 'k', paymentIntentId: null, paid: false, held: false, noCard: false })).toBe(true)
    expect(canLeavePay(null)).toBe(true)
  })
})

describe('bookReducer', () => {
  const quote: Quote = {
    service: { id: 11, name: 'Deep Tissue', duration_minutes: 45 }, master: null, start_at: '2026-10-05T09:00:00Z', end_at: '2026-10-05T09:45:00Z', duration_minutes: 45, currency: 'EUR',
    lines: { service_price: 60, extras: [], extras_total: 0 }, list_amount: 60, discount: null, coupon: null, total_amount: 60,
    payment: { mode: 'at_venue', reason: 'payments_off' }, policy: { cancellation_policy: null, cancel_hours: 24 },
  }
  const onReview: BookState = { ...initialState, step: 'review', serviceId: 11, masterId: 5, startAt: '2026-10-05T09:00:00Z' }
  const visit = newPayVisit((() => { let n = 0; return () => `v-${n++}` })())

  // Final review, Important 1: Review's Continue used to call onChange({ notes }) and then onContinue(quote),
  // both spreading the same render's `state` — the second overwrote the first and the notes were lost.
  it('patch notes then continue to pay keeps the notes', () => {
    let s = bookReducer(onReview, { type: 'patchReview', patch: { notes: 'Please knock twice' } })
    s = bookReducer(s, { type: 'continueToPay', notes: 'Please knock twice', quote, visit })
    expect(s.step).toBe('pay')
    expect(s.notes).toBe('Please knock twice')
    expect(s.quote).toBe(quote)
    expect(s.visit).toBe(visit)
  })

  it('continue to pay carries the notes typed on Review even without an earlier patch', () => {
    const s = bookReducer(onReview, { type: 'continueToPay', notes: 'Allergic to lavender', quote, visit })
    expect(s.notes).toBe('Allergic to lavender')
  })

  it('bounce to when with clearStart clears the start and sets the notice', () => {
    const onPay = bookReducer(onReview, { type: 'continueToPay', notes: '', quote, visit })
    const s = bookReducer(onPay, { type: 'bounce', to: 'when', code: 'slot_taken', clearStart: true })
    expect(s.step).toBe('when')
    expect(s.startAt).toBeNull()
    expect(s.notice).toEqual({ step: 'when', code: 'slot_taken' })
    // Every bounce follows an error that released the hold (afterConfirmError never bounces otherwise).
    expect(s.visit).toBeNull()
  })

  it('bounce to review without clearStart keeps the slot', () => {
    const onPay = bookReducer(onReview, { type: 'continueToPay', notes: '', quote, visit })
    const s = bookReducer(onPay, { type: 'bounce', to: 'review', code: 'payment_mismatch', clearStart: false })
    expect(s.step).toBe('review')
    expect(s.startAt).toBe('2026-10-05T09:00:00Z')
    expect(s.notice).toEqual({ step: 'review', code: 'payment_mismatch' })
  })

  it('picking a service clears staff, start, extras and coupon', () => {
    const chosen: BookState = { ...onReview, step: 'service', extras: [9], coupon: { member_offer_id: 3 } }
    const s = bookReducer(chosen, { type: 'pickService', serviceId: 12, catalogue: base })
    expect(s).toMatchObject({ serviceId: 12, masterId: null, startAt: null, extras: [], coupon: null })
  })

  it('picking a service goes to the staff step or skips it, as nextStep decides', () => {
    const start: BookState = { ...initialState }
    expect(bookReducer(start, { type: 'pickService', serviceId: 11, catalogue: base }).step).toBe('staff')
    const single: Catalogue = { ...base, masters: base.masters.filter(m => m.id === 5) }
    expect(bookReducer(start, { type: 'pickService', serviceId: 11, catalogue: single }).step).toBe('when')
  })

  it('picking a person clears the start and goes to when; picking a start goes to review', () => {
    const s1 = bookReducer({ ...onReview, step: 'staff' }, { type: 'pickStaff', masterId: 6 })
    expect(s1).toMatchObject({ step: 'when', masterId: 6, startAt: null })
    const s2 = bookReducer(s1, { type: 'pickStart', startAt: '2026-10-06T10:00:00Z' })
    expect(s2).toMatchObject({ step: 'review', startAt: '2026-10-06T10:00:00Z' })
  })

  it("a member's next choice clears the notice", () => {
    const bounced: BookState = { ...onReview, step: 'when', startAt: null, notice: { step: 'when', code: 'slot_taken' } }
    expect(bookReducer(bounced, { type: 'pickStart', startAt: '2026-10-06T10:00:00Z' }).notice).toBeNull()
    const onReviewWithNotice: BookState = { ...onReview, notice: { step: 'review', code: 'coupon_used' } }
    expect(bookReducer(onReviewWithNotice, { type: 'patchReview', patch: { partySize: 2 } }).notice).toBeNull()
    expect(bookReducer(onReviewWithNotice, { type: 'jump', step: 'when' }).notice).toBeNull()
    expect(bookReducer({ ...bounced, step: 'service' }, { type: 'pickService', serviceId: 11, catalogue: base }).notice).toBeNull()
  })

  it('jumping moves to the step and keeps every choice', () => {
    const s = bookReducer(onReview, { type: 'jump', step: 'service' })
    expect(s).toEqual({ ...onReview, step: 'service' })
  })

  it('patches the visit in place, never resurrecting a dropped one', () => {
    const onPay = bookReducer(onReview, { type: 'continueToPay', notes: '', quote, visit })
    const held = bookReducer(onPay, { type: 'visit', patch: { held: true } })
    const paid = bookReducer(held, { type: 'visit', patch: { paymentIntentId: 'pi_1', paid: true } })
    expect(paid.visit).toEqual({ ...visit, held: true, paymentIntentId: 'pi_1', paid: true })
    const dropped = bookReducer(paid, { type: 'bounce', to: 'review', code: 'confirm_failed', clearStart: false })
    expect(bookReducer(dropped, { type: 'visit', patch: { paid: true } }).visit).toBeNull()
  })

  it('a new visit on every entry to Pay', () => {
    const first = bookReducer(onReview, { type: 'continueToPay', notes: '', quote, visit })
    const back = bookReducer(first, { type: 'jump', step: 'review' })
    const other = newPayVisit(() => 'fresh')
    expect(bookReducer(back, { type: 'continueToPay', notes: '', quote, visit: other }).visit).toBe(other)
  })

  it('resets after success, dropping the visit and every choice', () => {
    const onPay = bookReducer(onReview, { type: 'continueToPay', notes: 'x', quote, visit })
    expect(bookReducer(onPay, { type: 'reset' })).toEqual(initialState)
  })
})

describe('focusTargetFor', () => {
  // Final review, Minor 11: after a step change focus used to drop to <body>, so a screen reader heard
  // nothing about the new step.
  it("moves focus to the new step's heading", () => {
    for (const step of ['service', 'staff', 'when', 'review', 'pay'] as const) {
      expect(focusTargetFor(step, false)).toEqual({ kind: 'heading', step })
    }
  })

  it('moves focus to the notice instead when a bounce carried one, so its sentence is read first', () => {
    expect(focusTargetFor('when', true)).toEqual({ kind: 'notice' })
    expect(focusTargetFor('review', true)).toEqual({ kind: 'notice' })
  })
})

describe('visibleDay', () => {
  const week = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']

  // Task 21 browser pass: paging the strip to the next week kept the old day selected off-screen, and the
  // slot list below went on showing that day's times under a strip of different dates.
  it('moves to the first bookable day of the week on screen when the chosen day is not in it', () => {
    expect(visibleDay('2026-09-28', week, new Set(['2026-10-06', '2026-10-08']))).toBe('2026-10-06')
  })

  it('keeps the chosen day while it is on screen, bookable or not', () => {
    expect(visibleDay('2026-10-07', week, new Set(['2026-10-06']))).toBe('2026-10-07')
  })

  it('shows no day (and so no times) when nothing on screen is bookable or the calendar has not answered yet', () => {
    expect(visibleDay('2026-09-28', week, new Set())).toBeNull()
  })
})
