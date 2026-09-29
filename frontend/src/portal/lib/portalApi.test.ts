import { describe, expect, it } from 'vitest'
import en from '../i18n/portal.en.json'
import { apiErrorBooking, apiErrorCode, bookErrorFallback, bookErrorKey, cancelErrorFallback, cancelErrorKey } from './portalApi'
import type { PortalBooking } from './types'

/** Every code `bookErrorKey` maps to its own `portal.book.<code>` key — kept here, not derived from the
 *  module under test, so this test still catches a code silently dropped from the internal map. */
const BOOK_ERROR_CODES = [
  'not_bookable', 'slot_taken', 'too_soon', 'too_far_ahead', 'extra_lead_time',
  'payment_required', 'payment_mismatch', 'idempotency_conflict', 'confirm_failed', 'nothing_to_pay',
  'coupon_not_found', 'coupon_used', 'coupon_expired', 'coupon_wrong_tier', 'coupon_no_capacity', 'coupon_untyped',
  'hold_expired', 'price_changed', 'room_unavailable', 'pms_unavailable', 'invalid_stay', 'hold_not_found',
]

describe('apiErrorCode', () => {
  it('reads the server error code off an axios-shaped error', () => {
    expect(apiErrorCode({ response: { data: { error: 'slot_taken' } } })).toBe('slot_taken')
  })

  it('returns null when there is no response body carrying an error code', () => {
    expect(apiErrorCode(new Error('network'))).toBeNull()
    expect(apiErrorCode(null)).toBeNull()
    expect(apiErrorCode({ response: { data: {} } })).toBeNull()
    expect(apiErrorCode({})).toBeNull()
  })
})

describe('apiErrorBooking', () => {
  const booking: PortalBooking = {
    kind: 'service', id: 7, reference: 'SVC-ABC12345', title: 'Facial', subtitle: null, starts_at: null, ends_at: null,
    status: 'confirmed', payment_status: 'refunded', total: 60, currency: 'EUR', discount: null, can_cancel: false, cancel_deadline: null,
    notes: null, party_size: null, guests: null, nights: null, paid_online: true,
  }

  it('reads the booking a cancel_failed 500 body carries, off an axios-shaped error', () => {
    expect(apiErrorBooking({ response: { data: { error: 'cancel_failed', message: 'x', booking } } })).toEqual(booking)
  })

  it('returns null when the body carries no booking, or there is no response body at all', () => {
    expect(apiErrorBooking({ response: { data: { error: 'refund_failed', message: 'x' } } })).toBeNull()
    expect(apiErrorBooking(new Error('network'))).toBeNull()
    expect(apiErrorBooking(null)).toBeNull()
    expect(apiErrorBooking({})).toBeNull()
  })
})

describe('bookErrorKey', () => {
  it('maps a known booking-window or payment error code to its book.* key', () => {
    expect(bookErrorKey('not_bookable')).toBe('portal.book.not_bookable')
    expect(bookErrorKey('slot_taken')).toBe('portal.book.slot_taken')
    expect(bookErrorKey('too_soon')).toBe('portal.book.too_soon')
    expect(bookErrorKey('too_far_ahead')).toBe('portal.book.too_far_ahead')
    expect(bookErrorKey('extra_lead_time')).toBe('portal.book.extra_lead_time')
    expect(bookErrorKey('payment_required')).toBe('portal.book.payment_required')
    expect(bookErrorKey('payment_mismatch')).toBe('portal.book.payment_mismatch')
    expect(bookErrorKey('idempotency_conflict')).toBe('portal.book.idempotency_conflict')
    expect(bookErrorKey('confirm_failed')).toBe('portal.book.confirm_failed')
    expect(bookErrorKey('nothing_to_pay')).toBe('portal.book.nothing_to_pay')
  })

  it('maps every coupon error code to its own portal.book.<code> key', () => {
    expect(bookErrorKey('coupon_not_found')).toBe('portal.book.coupon_not_found')
    expect(bookErrorKey('coupon_used')).toBe('portal.book.coupon_used')
    expect(bookErrorKey('coupon_expired')).toBe('portal.book.coupon_expired')
    expect(bookErrorKey('coupon_wrong_tier')).toBe('portal.book.coupon_wrong_tier')
    expect(bookErrorKey('coupon_no_capacity')).toBe('portal.book.coupon_no_capacity')
    expect(bookErrorKey('coupon_untyped')).toBe('portal.book.coupon_untyped')
  })

  it('falls back to the generic error for an unrecognised or missing code', () => {
    expect(bookErrorKey('something_the_server_never_sends')).toBe('portal.common.error')
    expect(bookErrorKey(null)).toBe('portal.common.error')
  })

  // The server nests this one code's key one level deeper than every other code here
  // (`portal.book.error.<code>`, not `portal.book.<code>`).
  it('maps payment_check_failed to its own nested key', () => {
    expect(bookErrorKey('payment_check_failed')).toBe('portal.book.error.payment_check_failed')
  })
})

describe('bookErrorFallback', () => {
  it('is byte-identical to the English bundle for every code bookErrorKey knows', () => {
    const book = en.book as unknown as Record<string, string>
    for (const code of BOOK_ERROR_CODES) {
      const key = bookErrorKey(code) // 'portal.book.<code>' for every code in this list
      const bundleKey = key.replace('portal.book.', '')
      expect(bookErrorFallback(code)).toBe(book[bundleKey])
    }
  })

  it('falls back to the generic sentence for an unrecognised or missing code', () => {
    expect(bookErrorFallback('something_the_server_never_sends')).toBe(en.common.error)
    expect(bookErrorFallback(null)).toBe(en.common.error)
  })

  // Checked against the bundle's nested book.error.* entry, not book.* like every other code above, and
  // kept identical to the server's own sentence for this code.
  it('is byte-identical to the English bundle for payment_check_failed', () => {
    const bookError = (en.book as unknown as { error: Record<string, string> }).error
    expect(bookErrorFallback('payment_check_failed')).toBe(bookError.payment_check_failed)
  })
})

/** Every code `cancelErrorKey` maps to its own `portal.bookings.cancel_error.<code>` key — `cancel_failed`
 *  (the cancel endpoint's own catch-all 500) is included, since the endpoint really answers with it and
 *  its sentence must not claim nothing happened. */
const CANCEL_ERROR_CODES = ['outside_policy', 'not_cancellable', 'already_cancelled', 'cancel_in_progress', 'refund_failed', 'refund_unavailable', 'cancel_failed']

describe('cancelErrorKey', () => {
  it('maps every cancellation code to its own portal.bookings.cancel_error.<code> key', () => {
    for (const code of CANCEL_ERROR_CODES) {
      expect(cancelErrorKey(code)).toBe(`portal.bookings.cancel_error.${code}`)
    }
  })

  it('falls back to the generic error for an unrecognised or missing code', () => {
    expect(cancelErrorKey('not_found')).toBe('portal.common.error')
    expect(cancelErrorKey(null)).toBe('portal.common.error')
  })
})

describe('cancelErrorFallback', () => {
  it('is byte-identical to the English bundle for every code cancelErrorKey knows', () => {
    const bundle = (en.bookings as unknown as { cancel_error: Record<string, string> }).cancel_error
    for (const code of CANCEL_ERROR_CODES) {
      expect(cancelErrorFallback(code)).toBe(bundle[code])
    }
  })

  it('falls back to the generic sentence for an unrecognised or missing code', () => {
    expect(cancelErrorFallback('not_found')).toBe(en.common.error)
    expect(cancelErrorFallback(null)).toBe(en.common.error)
  })
})
