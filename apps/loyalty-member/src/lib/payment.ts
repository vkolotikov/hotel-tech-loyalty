import { initPaymentSheet, initStripe, presentPaymentSheet } from '@stripe/stripe-react-native'
import { sheetOutcome, type SheetOutcome } from './paymentOutcome'

/** The phone pays in the app, through Stripe's own payment sheet (cards, Apple Pay and Google Pay where set up). */
export const canPayInApp = true

/** Where a bank or wallet that leaves the app sends the member back (the app's scheme, `app.json`). */
const RETURN_URL = 'hotel-loyalty://stripe-redirect'

let initialisedKey: string | null = null

export interface SheetRequest {
  /** The venue's own publishable key, from the portal bootstrap (`capabilities.payments.publishable_key`). */
  publishableKey: string
  /** The client secret of the one payment intent the server made for this booking. */
  clientSecret: string
  venueName: string
  member: { name: string; email: string }
  /** The venue's accent and the app's navy, so the sheet looks like the app. */
  colors: { accent: string; onAccent: string; background: string; surface: string; border: string; text: string; text2: string; danger: string }
  payLabel: string
}

/**
 * Shows Stripe's payment sheet for one payment intent and answers what happened. Stripe confirms the payment itself
 * (and any bank check it needs); the app only reads the outcome and then asks the server to book.
 */
export async function payWithSheet(request: SheetRequest): Promise<SheetOutcome> {
  try {
    if (initialisedKey !== request.publishableKey) {
      await initStripe({ publishableKey: request.publishableKey, urlScheme: 'hotel-loyalty' })
      initialisedKey = request.publishableKey
    }
    const init = await initPaymentSheet({
      paymentIntentClientSecret: request.clientSecret,
      merchantDisplayName: request.venueName,
      returnURL: RETURN_URL,
      style: 'alwaysDark',
      primaryButtonLabel: request.payLabel,
      defaultBillingDetails: { name: request.member.name, email: request.member.email },
      appearance: {
        colors: {
          primary: request.colors.accent,
          background: request.colors.background,
          componentBackground: request.colors.surface,
          componentBorder: request.colors.border,
          componentDivider: request.colors.border,
          primaryText: request.colors.text,
          secondaryText: request.colors.text2,
          componentText: request.colors.text,
          placeholderText: request.colors.text2,
          icon: request.colors.text2,
          error: request.colors.danger,
        },
        primaryButton: { colors: { background: request.colors.accent, text: request.colors.onAccent } },
      },
    })
    if (init.error) return sheetOutcome(init.error)
    const shown = await presentPaymentSheet()
    return sheetOutcome(shown.error)
  } catch {
    return { kind: 'failed', message: null }
  }
}
