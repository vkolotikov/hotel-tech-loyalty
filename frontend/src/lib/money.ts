/**
 * Unified currency formatter. Always renders 2 decimals so prices never
 * appear truncated ("€150" vs the real €150.99). Accepts number or numeric
 * string; nullish / NaN returns an em-dash so empty cells read cleanly.
 */
export function money(amount: number | string | null | undefined, currency: string = 'EUR'): string {
  if (amount === null || amount === undefined || amount === '') return '—'
  const n = typeof amount === 'string' ? parseFloat(amount) : amount
  if (!Number.isFinite(n)) return '—'
  const symbol = currencySymbol(currency)
  const body = n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return symbol + body
}

function currencySymbol(currency: string): string {
  switch ((currency || '').toUpperCase()) {
    case 'EUR': return '€'
    case 'USD': return '$'
    case 'GBP': return '£'
    case 'CHF': return 'CHF '
    default: return (currency || '') + ' '
  }
}
