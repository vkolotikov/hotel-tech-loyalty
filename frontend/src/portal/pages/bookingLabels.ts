import type { PortalBooking } from '../lib/types'

/**
 * A booking's status and payment words (the bundle's English as each key's default), framework-free: the portal's
 * row and sheet use them, and so does the members' app.
 */

export type ChipTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger'

export function statusTone(status: string): ChipTone {
  switch (status) {
    case 'confirmed': case 'in_progress': return 'success'
    case 'pending': return 'warning'
    case 'cancelled': return 'danger'
    default: return 'neutral'
  }
}

// The en bundle's own text for each status, passed as i18next's default
// value — so a locale that hasn't shipped a status key yet (and a unit test
// with no resource bundle loaded) both still show real words, not
// `pending`/`in_progress` snake_case.
const STATUS_LABEL: Record<string, string> = {
  pending: 'Awaiting confirmation',
  confirmed: 'Confirmed',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

export function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status
}

// Services only ever carry the first six; a stay's payment_status comes
// from App\Enums\PaymentStatus, which has fourteen cases. Any value outside
// this map is unknown to us, not merely untranslated — paymentLabel returns
// null so the caller can omit the row rather than print a raw enum value
// (or a snake_case English fallback) at a member.
const PAYMENT_LABEL: Record<string, string> = {
  unpaid: 'Pay at the venue',
  authorized: 'Card held',
  paid: 'Paid',
  refunded: 'Refunded',
  failed: 'Payment failed',
  partially_refunded: 'Partly refunded',
  open: 'Payment open',
  pending: 'Payment pending',
  disputed: 'Payment under review',
  invoice_waiting: 'Invoice pending',
  channel_managed: 'Handled by your booking channel',
  capture_expired: 'Card hold expired',
  cancelled: 'Payment cancelled',
  mock: 'Test payment',
}

export function paymentLabel(
  status: string | null,
  // Loosely typed on purpose, matching localisedIndustryCopy's convention:
  // i18next's TFunction has a large overload set a hand-written signature
  // can't satisfy, and this helper only ever uses the (key, defaultValue)
  // form.
  t: (key: string, defaultValue: string) => string,
): string | null {
  if (status === null) return null
  const fallback = PAYMENT_LABEL[status]
  if (!fallback) return null
  return t(`portal.bookings.payment_status.${status}`, fallback)
}

/**
 * The payment row of a booking's sheet. A stay paid at the venue is stored `open` where an
 * appointment is `unpaid`; both read "Pay at the venue". Once a booking with nothing paid is
 * cancelled there is no payment to speak of, so the row is dropped (null). Money that did move
 * (paid, refunded, a card hold) is always shown.
 */
export function bookingPaymentLabel(
  b: Pick<PortalBooking, 'status' | 'payment_status' | 'paid_online' | 'deposit'>,
  t: (key: string, defaultValue: string) => string,
): string | null {
  // Part H: a booking-page deposit booking stays `unpaid` with its deposit charged — never "Pay at the venue".
  if (b.deposit && b.paid_online && b.payment_status === 'unpaid') {
    // A cancelled or missed visit whose deposit the venue kept owes nothing more.
    return b.status === 'cancelled' || b.status === 'no_show'
      ? t('portal.bookings.payment_status.deposit_only', 'Deposit paid')
      : t('portal.bookings.payment_status.deposit_paid', 'Deposit paid, the rest at the venue')
  }
  const unpaid = b.payment_status === 'unpaid' || (b.payment_status === 'open' && !b.paid_online)
  if (unpaid && b.status === 'cancelled') return null
  return paymentLabel(unpaid ? 'unpaid' : b.payment_status, t)
}
