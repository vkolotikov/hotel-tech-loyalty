import { describe, expect, it, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en-GB' },
  }),
}))
vi.mock('../../lib/api', () => ({ api: {} }))

import { brandWith, profile, renderBrand } from './brandTesting'
import { KeyDatesSection } from './sections/KeyDates'

const withCountry = (holiday_country: string | null, guess: string | null, marketing_days = true) =>
  brandWith({ profile: { ...profile, holiday_country, marketing_days }, holiday_country_guess: guess })

// Spec 2026-10-16 §3.3: managers choose the country (or none) and the marketing switch; staff read them.
describe('KeyDatesSection', () => {
  it('lets a manager choose the country, the automatic guess first, and switch marketing and international days', () => {
    const brand = withCountry(null, 'GB')
    const out = renderBrand(brand, true, <KeyDatesSection brand={brand} canEdit />)
    expect(out).toContain('Key dates')
    expect(out).toContain('Automatic: United Kingdom')
    expect(out).toContain('>United States</option>')
    expect(out).toContain('>No public holidays</option>')
    expect(out).toContain('United Kingdom (guessed from the venue’s time zone)')
    expect(out).toMatch(/<button[^>]*role="switch"[^>]*aria-checked="true"/)
  })

  it('shows staff the country and the switch in words, with nothing to change', () => {
    const brand = withCountry('IE', 'GB', false)
    const out = renderBrand(brand, false, <KeyDatesSection brand={brand} canEdit={false} />)
    expect(out).toContain('Ireland')
    expect(out).toContain('Off')
    expect(out).not.toContain('<select')
    expect(out).not.toContain('role="switch"')
  })

  it('says when there are no public holidays: chosen none, or nothing to guess from', () => {
    expect(renderBrand(withCountry('none', 'GB'), false, <KeyDatesSection brand={withCountry('none', 'GB')} canEdit={false} />)).toContain('No public holidays are shown.')
    expect(renderBrand(withCountry(null, null), false, <KeyDatesSection brand={withCountry(null, null)} canEdit={false} />)).toContain('No public holidays until a country is chosen.')
  })
})
