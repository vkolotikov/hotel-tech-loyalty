/** The shape `StripePayment.tsx` actually reads off `stripe.confirmPayment()`'s result (or off a caught
 *  rejection, wrapped into the same shape — see finding M3/minor C) — typed loosely on purpose so this
 *  stays decoupled from `@stripe/stripe-js`'s own (much larger) result type. */
export interface PayResult {
  error?: { message?: string | null } | null
  paymentIntent?: { id: string; status: string } | null
}

export type PayOutcome = { kind: 'paid'; id: string } | { kind: 'failed'; message: string | null } | { kind: 'incomplete' }

/**
 * What a Stripe `confirmPayment()` result means for the Pay step, extracted as a pure function so it's
 * testable without driving a real effect or a real Stripe mount (fix round 2, finding M3's own decision —
 * "requires_capture"/"succeeded" is a captured card; an `error` is a failure, carrying Stripe's own
 * message when Stripe gave one; anything else (no error, but no matching intent status either — e.g. a
 * redirect-pending or `requires_action` status the portal's `allow_redirects: 'never'` intent should never
 * actually reach) is incomplete.
 *
 * Error is checked before the intent's own status: Stripe's real result is one or the other, never both,
 * but a caller that wraps a caught rejection into `{ error }` (minor C) leaves `paymentIntent` unset either
 * way, so the order only matters for a malformed/synthetic result — and treating an explicit error as
 * failure first is the safer reading of one.
 */
export function payOutcome(result: PayResult): PayOutcome {
  if (result.error) {
    return { kind: 'failed', message: result.error.message ?? null }
  }
  const pi = result.paymentIntent
  if (pi && (pi.status === 'requires_capture' || pi.status === 'succeeded')) {
    return { kind: 'paid', id: pi.id }
  }
  return { kind: 'incomplete' }
}
