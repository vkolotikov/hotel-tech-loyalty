import { describe, expect, it } from 'vitest'
import { money } from './money'

/**
 * Locks the money() formatter contract. Used across every booking /
 * member / inquiry / refund cell in the SPA — drift here renders
 * prices as truncated decimals or unstyled cells across dozens of
 * places. Specific contract:
 *
 *   - Always 2 decimal places (never "€150" — must be "€150.00" or
 *     "€150,00" depending on locale).
 *   - Nullish, empty-string, NaN, and Infinity all render an em-dash
 *     so empty cells read cleanly (not "€NaN" or "€0.00" lies).
 *   - Currency code maps to a symbol prefix; unknown codes fall
 *     through to "CODE " (space-suffixed) so the value is still
 *     rendered, not dropped.
 *
 * Locale note: money() calls `toLocaleString(undefined, ...)` which
 * respects the SYSTEM default locale (en-US → ".", de-DE → ",", etc.).
 * Tests must therefore accept EITHER separator. The contract being
 * locked is "2 decimal digits + correct currency prefix", NOT a
 * specific separator character — the latter is intentionally a
 * runtime behaviour driven by the user's locale.
 */
describe('money() formatter', () => {
  // Helper: build a regex that matches "{prefix}{whole}{sep}{frac}"
  // where sep can be . or , — the only locale-dependent bit.
  const moneyRe = (prefix: string, whole: string, frac: string) =>
    new RegExp(`^${prefix.replace(/[$£€]/g, c => '\\' + c)}${whole}[.,]${frac}$`)

  it('renders 2 decimals for whole numbers', () => {
    expect(money(150)).toMatch(moneyRe('€', '150', '00'))
  })

  it('renders 2 decimals for floats', () => {
    expect(money(150.5)).toMatch(moneyRe('€', '150', '50'))
    expect(money(150.99)).toMatch(moneyRe('€', '150', '99'))
  })

  it('truncates / rounds beyond 2 decimals — never shows more', () => {
    // The CLAUDE.md decimal contract: "Always renders 2 decimals so
    // prices never appear truncated". Reverse-side guard: also never
    // shows MORE than 2 decimals.
    expect(money(150.999)).toMatch(/^€\d+[.,]\d{2}$/)
    expect(money(150.005)).toMatch(/^€\d+[.,]\d{2}$/)
  })

  it('accepts a numeric string and parses it', () => {
    // BookingMirror.price_total returns as a string from Eloquent's
    // decimal cast — money() has to handle it transparently.
    expect(money('150.50')).toMatch(moneyRe('€', '150', '50'))
    expect(money('150')).toMatch(moneyRe('€', '150', '00'))
  })

  it('null renders an em-dash', () => {
    expect(money(null)).toBe('—')
  })

  it('undefined renders an em-dash', () => {
    expect(money(undefined)).toBe('—')
  })

  it('empty string renders an em-dash', () => {
    expect(money('')).toBe('—')
  })

  it('non-numeric string renders an em-dash', () => {
    // parseFloat('hello') is NaN; NaN must surface as em-dash, not
    // "€NaN" (which has shown up in past JS money formatters).
    expect(money('hello')).toBe('—')
  })

  it('Infinity renders an em-dash (Number.isFinite guard)', () => {
    expect(money(Infinity)).toBe('—')
    expect(money(-Infinity)).toBe('—')
  })

  it('NaN renders an em-dash', () => {
    expect(money(NaN)).toBe('—')
  })

  it('USD currency renders with $ prefix', () => {
    expect(money(99, 'USD')).toMatch(moneyRe('$', '99', '00'))
  })

  it('GBP currency renders with £ prefix', () => {
    expect(money(99, 'GBP')).toMatch(moneyRe('£', '99', '00'))
  })

  it('CHF currency renders with CHF<space> prefix', () => {
    // CHF doesn't have a single-char symbol — the formatter uses
    // "CHF " (with a trailing space) so the number reads cleanly.
    expect(money(99, 'CHF')).toMatch(/^CHF 99[.,]00$/)
  })

  it('case-insensitive currency code matching', () => {
    // Defensive against admin-input or API casing variation.
    expect(money(99, 'eur')).toMatch(moneyRe('€', '99', '00'))
    expect(money(99, 'usd')).toMatch(moneyRe('$', '99', '00'))
  })

  it('unknown currency code falls through to "{CODE} " prefix', () => {
    // The fallback ensures the value is still rendered, not dropped.
    // Better "JPY 1500.00" than "1500.00" with no currency hint.
    expect(money(1500, 'JPY')).toMatch(/^JPY \d{1,3}([.,]?\d{3})*[.,]00$/)
  })

  it('zero renders as the formatted zero, not em-dash', () => {
    // 0 is a real money value (e.g. a fully-comped booking) and
    // must render. Em-dash is reserved for "no value at all" cases.
    expect(money(0)).toMatch(moneyRe('€', '0', '00'))
  })

  it('negative numbers render with the - sign preserved', () => {
    // Refunded_amount may surface as negative in some admin
    // contexts. The formatter must keep the sign visible so a refund
    // doesn't read as a positive payment. Locales differ on whether
    // the minus precedes the symbol or the digits.
    expect(money(-50)).toMatch(/^-?€-?50[.,]00$/)
  })
})
