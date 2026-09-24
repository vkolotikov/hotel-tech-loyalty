import { resolveLocale } from './dates'

/** Money in the venue's currency, in the member's language. */
export function formatMoney(amount: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(resolveLocale(locale), { style: 'currency', currency, currencyDisplay: 'symbol' }).format(amount)
  } catch {
    // An unknown or malformed code throws RangeError; the amount is still worth showing.
    return `${amount.toFixed(2)} ${currency}`
  }
}
