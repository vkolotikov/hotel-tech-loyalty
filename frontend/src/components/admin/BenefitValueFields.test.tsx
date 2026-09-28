import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { BenefitValueFields, benefitDisplay, type BenefitValue } from './BenefitValueFields'

const base: BenefitValue = { value: '', value_type: 'text', value_amount: '', applies_to: 'all' }

function render(value: BenefitValue) {
  return renderToStaticMarkup(<BenefitValueFields value={value} onChange={() => {}} />)
}

describe('BenefitValueFields', () => {
  it('hides the amount input for the text type', () => {
    const html = render(base)
    expect(html).not.toContain('type="number"')
  })

  it('shows the amount input for each numeric type', () => {
    for (const value_type of ['percent_discount', 'fixed_amount', 'points_multiplier'] as const) {
      const html = render({ ...base, value_type })
      expect(html).toContain('type="number"')
    }
  })

  it('always renders the applies-to scope select with its three options', () => {
    // No i18n is loaded in this render (matches the rest of src/pages/*.test.tsx),
    // so `t(key, fallback)` returns its literal fallback — here the raw scope id,
    // since BenefitValueFields falls back to `s` itself, not a prose label.
    const html = render(base)
    expect(html).toContain('>all<')
    expect(html).toContain('>services<')
    expect(html).toContain('>stays<')
  })
})

describe('benefitDisplay', () => {
  // Simulates a real i18next `t(key, defaultValue, options)` call closely
  // enough to prove the interpolation contract: it interpolates `{{amount}}`
  // from `options` into whichever fallback string is given, the same way a
  // loaded locale's own translated string would be interpolated at runtime.
  const t = (_key: string, fallback: string, options?: Record<string, unknown>) =>
    options ? fallback.replace(/\{\{(\w+)\}\}/g, (_m, name) => String(options[name] ?? '')) : fallback

  it('formats a percent discount with its scope', () => {
    expect(benefitDisplay({ value: null, value_type: 'percent_discount', value_amount: 10, applies_to: 'services' }, t))
      .toBe('10% off · services')
  })

  it('formats a fixed amount with two decimals', () => {
    expect(benefitDisplay({ value: null, value_type: 'fixed_amount', value_amount: 6, applies_to: 'all' }, t))
      .toBe('6.00 off')
  })

  it('formats a percent discount without a trailing .0 when the amount is a whole number', () => {
    expect(benefitDisplay({ value: null, value_type: 'percent_discount', value_amount: '10.00', applies_to: 'all' }, t))
      .toBe('10% off')
  })

  it('formats a points multiplier', () => {
    expect(benefitDisplay({ value: null, value_type: 'points_multiplier', value_amount: 2, applies_to: 'all' }, t))
      .toBe('2× points')
  })

  it('falls back to the prose value for the text type, with no scope suffix when applies_to is all', () => {
    expect(benefitDisplay({ value: 'Late checkout on request', value_type: 'text', value_amount: null, applies_to: 'all' }, t))
      .toBe('Late checkout on request')
  })

  it('omits the scope suffix entirely when applies_to is absent', () => {
    expect(benefitDisplay({ value: 'Free breakfast', value_type: 'text', value_amount: null }, t))
      .toBe('Free breakfast')
  })

  it('routes the numeric formats through the given translator instead of hardcoding English', () => {
    // A loaded locale would return its own translated string here, not the
    // English fallback — proving `benefitDisplay` actually calls `t()` for
    // the formatted amount rather than building the English words itself.
    const translated = (_key: string, _fallback: string, options?: Record<string, unknown>) =>
      `${options?.amount}% de réduction`
    expect(benefitDisplay({ value: null, value_type: 'percent_discount', value_amount: 15, applies_to: 'all' }, translated))
      .toBe('15% de réduction')
  })
})
