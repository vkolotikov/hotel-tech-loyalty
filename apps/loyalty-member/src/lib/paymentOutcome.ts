/**
 * What the phone's payment sheet answered, as the booking flow needs it. `paid` means Stripe confirmed the payment
 * (taken, or the card held for later capture): the confirm call follows with the intent's id. `cancelled` means the
 * member closed the sheet; nothing was taken and the Pay button is offered again. `failed` carries Stripe's own
 * sentence when it gave one (a declined card), else the flow shows the portal's "did not go through".
 */
export type SheetOutcome = { kind: 'paid' } | { kind: 'cancelled' } | { kind: 'failed'; message: string | null }

/** The sheet's error (`presentPaymentSheet()`'s `error`), read into an outcome. Pure, so it is tested by value. */
export function sheetOutcome(error: { code?: string; localizedMessage?: string; message?: string } | null | undefined): SheetOutcome {
  if (!error) return { kind: 'paid' }
  if (error.code === 'Canceled') return { kind: 'cancelled' }
  const message = error.localizedMessage || error.message || null
  return { kind: 'failed', message }
}
