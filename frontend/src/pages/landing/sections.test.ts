import { describe, expect, it } from 'vitest'
import { isOfferable, type SectionMeta } from './sections'

const meta = (overrides: Partial<SectionMeta>): SectionMeta => ({
  key: 'reviews',
  label: '',
  sourceLabel: '',
  available: true,
  count: 0,
  ...overrides,
})

describe('isOfferable', () => {
  // Data-backed: services, team, reviews. The wizard's own worked example
  // ("Treatments — 12 from your Services") and the spec's reviews example
  // ("no featured reviews means the toggle is off and says why") are both
  // this kind — offerable only when the tenant actually has rows.
  it('never offers a data-backed section with no data', () => {
    expect(isOfferable(meta({ key: 'reviews', available: true, count: 0 }))).toBe(false)
    expect(isOfferable(meta({ key: 'reviews', available: false, count: 4 }))).toBe(false)
    expect(isOfferable(meta({ key: 'reviews', available: true, count: 4 }))).toBe(true)
  })

  // Copy-backed: hero, about, contact (plus booking, which has no source
  // table either). These have no rows to be empty of — the tenant supplies
  // their content by writing it — so gating them like `reviews` would mean
  // `about` could never become available on a brand-new page.
  it('always offers a copy-backed section, even with zero rows and unavailable', () => {
    expect(isOfferable(meta({ key: 'about', available: false, count: 0 }))).toBe(true)
    expect(isOfferable(meta({ key: 'hero', available: false, count: 0 }))).toBe(true)
    expect(isOfferable(meta({ key: 'contact', available: false, count: 0 }))).toBe(true)
    expect(isOfferable(meta({ key: 'booking', available: false, count: 0 }))).toBe(true)
  })
})
