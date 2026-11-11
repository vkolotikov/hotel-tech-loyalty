import type { SheetOutcome } from './paymentOutcome'
import type { SheetRequest } from './payment'

/**
 * The browser preview has no Stripe payment sheet (a native module): a venue that takes cards shows "online payment
 * is unavailable" there, exactly as the flow does when the server cannot make an intent. Bookings paid at the venue
 * work as on the phone.
 */
export const canPayInApp = false

export async function payWithSheet(_request: SheetRequest): Promise<SheetOutcome> {
  return { kind: 'failed', message: null }
}
