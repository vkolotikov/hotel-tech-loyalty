import { describe, expect, it } from 'vitest'
import {
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_TONE,
  PAYMENT_STATUS_VALUES,
  TERMINAL_PAYMENT_STATUSES,
  isPaymentStatus,
} from './paymentStatus'

/**
 * Locks the TS PaymentStatus mirror against drift from the PHP enum.
 *
 * The 12 status values must exist in BOTH App\Enums\PaymentStatus and
 * here. The two backend tests (PaymentStatusTest.php + the booking
 * service tests) already enforce the PHP enum's exact set. These
 * tests enforce the TypeScript copy. If anyone adds a 13th case to
 * the PHP enum but forgets the TS mirror, the next frontend feature
 * touching this module compiles but renders the new status as
 * blank/grey (no label, no tone). The map-completeness assertions
 * below catch that case at test time.
 */
describe('PaymentStatus TS mirror', () => {
  it('exposes the 12 canonical status values', () => {
    expect(PAYMENT_STATUS_VALUES).toEqual([
      'open',
      'pending',
      'authorized',
      'paid',
      'partially_refunded',
      'refunded',
      'disputed',
      'invoice_waiting',
      'channel_managed',
      'capture_expired',
      'cancelled',
      'mock',
    ])
  })

  it('PAYMENT_STATUS_LABELS covers every status value', () => {
    for (const status of PAYMENT_STATUS_VALUES) {
      expect(PAYMENT_STATUS_LABELS[status]).toBeTruthy()
      expect(typeof PAYMENT_STATUS_LABELS[status]).toBe('string')
    }
  })

  it('PAYMENT_STATUS_TONE covers every status value with a valid tone', () => {
    const validTones = new Set(['success', 'warning', 'danger', 'info', 'neutral'])
    for (const status of PAYMENT_STATUS_VALUES) {
      expect(validTones.has(PAYMENT_STATUS_TONE[status])).toBe(true)
    }
  })

  it('isPaymentStatus returns true for every known status', () => {
    for (const status of PAYMENT_STATUS_VALUES) {
      expect(isPaymentStatus(status)).toBe(true)
    }
  })

  it('isPaymentStatus rejects unknown strings + non-strings', () => {
    expect(isPaymentStatus('refundedd')).toBe(false)
    expect(isPaymentStatus('')).toBe(false)
    expect(isPaymentStatus(null)).toBe(false)
    expect(isPaymentStatus(undefined)).toBe(false)
    expect(isPaymentStatus(42)).toBe(false)
    expect(isPaymentStatus({})).toBe(false)
  })

  it('TERMINAL_PAYMENT_STATUSES matches the four terminal cases', () => {
    // Mirrors PHP PaymentStatus::isTerminal(): refunded, capture_expired,
    // cancelled, mock all return [] from allowedTransitions().
    expect(TERMINAL_PAYMENT_STATUSES.has('refunded')).toBe(true)
    expect(TERMINAL_PAYMENT_STATUSES.has('capture_expired')).toBe(true)
    expect(TERMINAL_PAYMENT_STATUSES.has('cancelled')).toBe(true)
    expect(TERMINAL_PAYMENT_STATUSES.has('mock')).toBe(true)
  })

  it('TERMINAL_PAYMENT_STATUSES rejects non-terminal cases', () => {
    expect(TERMINAL_PAYMENT_STATUSES.has('paid')).toBe(false)
    expect(TERMINAL_PAYMENT_STATUSES.has('disputed')).toBe(false)
    expect(TERMINAL_PAYMENT_STATUSES.has('authorized')).toBe(false)
    expect(TERMINAL_PAYMENT_STATUSES.has('partially_refunded')).toBe(false)
  })
})
