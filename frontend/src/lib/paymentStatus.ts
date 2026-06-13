/**
 * TS mirror of App\Enums\PaymentStatus.
 *
 * Keep in lockstep with `app/Enums/PaymentStatus.php`. New values must
 * be added in BOTH files in the same PR. Backend is the source of
 * truth — if these drift, the frontend is wrong, not the backend.
 *
 * See AUDIT-2026-06-13-ADDENDUM.md maintainability finding (state-
 * machine constants split across files).
 */

export const PAYMENT_STATUS_VALUES = [
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
] as const

export type PaymentStatus = typeof PAYMENT_STATUS_VALUES[number]

/** Human-readable label per status — drives UI badges + filter pills. */
export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  open:                'Open',
  pending:             'Pending',
  authorized:          'Authorized',
  paid:                'Paid',
  partially_refunded:  'Partial refund',
  refunded:            'Refunded',
  disputed:            'Disputed',
  invoice_waiting:     'Invoice pending',
  channel_managed:     'OTA / channel',
  capture_expired:     'Auth expired',
  cancelled:           'Cancelled',
  mock:                'Mock',
}

/** Tailwind color token per status. Used by row badges, the detail
 *  hero, and the filter chips so the visual vocabulary stays consistent. */
export const PAYMENT_STATUS_TONE: Record<PaymentStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  open:                'neutral',
  pending:             'warning',
  authorized:          'warning',
  paid:                'success',
  partially_refunded:  'warning',
  refunded:            'neutral',
  disputed:            'danger',
  invoice_waiting:     'info',
  channel_managed:     'info',
  capture_expired:     'danger',
  cancelled:           'neutral',
  mock:                'info',
}

/** True if a value is a known PaymentStatus literal. Safer than
 *  string-comparing in conditional rendering paths. */
export function isPaymentStatus(value: unknown): value is PaymentStatus {
  return typeof value === 'string'
    && (PAYMENT_STATUS_VALUES as readonly string[]).includes(value)
}

/** Terminal states — no further legal transitions. */
export const TERMINAL_PAYMENT_STATUSES: ReadonlySet<PaymentStatus> = new Set([
  'refunded',
  'capture_expired',
  'cancelled',
  'mock',
])
