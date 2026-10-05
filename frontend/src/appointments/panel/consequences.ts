import type { ActionInfo, ActionKey, PointsPreview } from '../lib/types'

/** Actions that touch money, points or a final status are confirmed first; "arrived" and "award points" are not. */
export const NEEDS_CONFIRM: ReadonlySet<ActionKey> = new Set<ActionKey>(['confirm', 'complete', 'no_show', 'cancel'])

export interface Line {
  key: string
  fallback: string
  vars?: Record<string, unknown>
  tone: 'plain' | 'warning'
}

const PAYMENT: Record<string, Omit<Line, 'key'>> = {
  none:                  { fallback: 'No online payment is attached to this appointment.', tone: 'plain' },
  hold_will_be_charged:  { fallback: 'The held card payment will be charged within about 10 minutes.', tone: 'warning' },
  hold_will_be_released: { fallback: 'The card hold is released automatically within about 10 minutes. Nothing is charged.', tone: 'plain' },
  // Older than the capture job's window: nothing charges it and nothing releases it; it lapses at Stripe.
  hold_expired:          { fallback: 'The card hold is too old to charge: it has lapsed or is about to. Nothing will be charged.', tone: 'warning' },
  // Nothing flags a payment that was already taken: the refund is a manager's, in this workspace (Part E) —
  // for a manager cancelling, the refund line sits right under this sentence.
  captured_not_refunded: { fallback: 'The card payment is NOT refunded automatically: only a manager’s refund here sends it back.', tone: 'warning' },
  marked_only:           { fallback: 'This records "paid at the venue" on the appointment. No money is moved.', tone: 'plain' },
}

const REASON: Record<string, string> = {
  not_a_member:           'No points: this client is not a member.',
  programme_off:          'No points: the venue has no active programme.',
  points_on_bookings_off: 'No points: points for appointments are switched off in the programme.',
  already_awarded:        'Points for this visit were already awarded.',
  zero_amount:            'No points: nothing was charged for this visit.',
  refunded:               'No points: the payment was refunded.',
  failed:                 'The visit is completed, but the points could not be awarded just now. Use "Award points" to try again.',
}

/** What the programme will do on completion: the points, or the reason there are none. */
export function pointsLine(points: PointsPreview | null): Line | null {
  if (!points) return null
  if (points.points > 0) {
    return { key: 'appointments.consequence.points_will_award', fallback: 'Completing awards {{points}} points.', vars: { points: points.points }, tone: 'plain' }
  }
  const reason = points.reason ?? 'zero_amount'
  return { key: `appointments.points_reason.${reason}`, fallback: REASON[reason] ?? REASON.zero_amount, tone: 'plain' }
}

/**
 * The server's consequences for one action, as sentences in the order a
 * person needs them: money first, then points, then the coupon, then who is
 * told. The codes are the server's; nothing here decides an outcome.
 */
export function consequenceLines(action: ActionInfo): Line[] {
  const { payment, points, coupon } = action.consequences
  const lines: Line[] = []

  if (payment !== 'none' || action.key === 'cancel' || action.key === 'no_show') {
    const entry = PAYMENT[payment] ?? PAYMENT.none
    lines.push({ key: `appointments.consequence.payment.${payment in PAYMENT ? payment : 'none'}`, ...entry })
  }
  const pts = pointsLine(points)
  if (pts) lines.push(pts)
  if (coupon === 'not_returned') {
    lines.push({ key: 'appointments.consequence.coupon_not_returned', fallback: 'The coupon used on this booking is not returned.', tone: 'warning' })
  }
  // Confirm and cancel ask "Tell the client by email" instead (Part D); a no-show tells nobody.
  if (action.key === 'no_show') {
    lines.push({ key: 'appointments.consequence.no_message', fallback: 'No message is sent to the client.', tone: 'plain' })
  }

  return lines
}
