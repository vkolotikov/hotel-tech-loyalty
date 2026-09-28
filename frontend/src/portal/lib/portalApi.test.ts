import { describe, expect, it } from 'vitest'
import en from '../i18n/portal.en.json'
import { apiErrorCode, bookErrorFallback, bookErrorKey } from './portalApi'

/** Every code `bookErrorKey` maps to its own `portal.book.<code>` key — kept here, not derived from the
 *  module under test, so this test still catches a code silently dropped from the internal map. */
const BOOK_ERROR_CODES = [
  'not_bookable', 'slot_taken', 'too_soon', 'too_far_ahead', 'extra_lead_time',
  'payment_required', 'payment_mismatch', 'idempotency_conflict', 'confirm_failed', 'nothing_to_pay',
  'coupon_not_found', 'coupon_used', 'coupon_expired', 'coupon_wrong_tier', 'coupon_no_capacity', 'coupon_untyped',
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
})

describe('bookErrorFallback', () => {
  it('is byte-identical to the English bundle for every code bookErrorKey knows', () => {
    const book = en.book as Record<string, string>
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
})
