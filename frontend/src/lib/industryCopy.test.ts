import { describe, expect, it } from 'vitest'
import { INDUSTRY_COPY, PICKER_INDUSTRIES, industryCopyFor } from './industryCopy'

/**
 * Locks the per-industry registration-copy layer (Industry
 * Platform Plan Phase 1 — sub-brand identity).
 *
 * Two contracts:
 *
 *   1. industryCopyFor(industry) NEVER throws. Returns the hotel
 *      copy for null / undefined / unknown industries. This is the
 *      load-bearing safety net for stale auth sessions and the
 *      umbrella host (before the picker resolves industry).
 *
 *   2. INDUSTRY_COPY shape:
 *      - The 4 GTM sub-brands (hotel / beauty / medical /
 *        restaurant) carry FULL marketing-quality entries.
 *      - GTM-deferred industries are deliberately ABSENT from the
 *        map (or carry minimal stubs) — the docblock requires the
 *        Phase 4 mismatch banner to fall back to hotel chrome
 *        rather than misleadingly relabel them.
 *
 *   3. PICKER_INDUSTRIES exposes ONLY the GTM-shipped industries.
 *      The umbrella picker on signup must NOT render cards for
 *      Settings-only industries (legal / real_estate / education
 *      / fitness) per decision #7.
 */
describe('industryCopyFor — lookup with hotel fallback', () => {
  it('returns hotel copy for null industry (legacy session)', () => {
    const copy = industryCopyFor(null)
    expect(copy.brand).toBe('HotelTechAI')
  })

  it('returns hotel copy for undefined industry', () => {
    const copy = industryCopyFor(undefined)
    expect(copy.brand).toBe('HotelTechAI')
  })

  it('returns industry-specific copy for the 4 GTM sub-brands', () => {
    expect(industryCopyFor('hotel').brand).toBe('HotelTechAI')
    expect(industryCopyFor('beauty').brand).toBe('BeautyTech.uk')
    expect(industryCopyFor('medical').brand).toBe('MedTechAI')
    expect(industryCopyFor('restaurant').brand).toBeTruthy()
  })

  it('GTM-deferred industries (legal/real_estate/etc.) return their own minimal copy when present', () => {
    // The code carries minimal stub entries for the Settings-only
    // industries — enough for the Phase 4 mismatch banner to
    // identify them honestly ("Switch workspace to Legal Workspace?")
    // without falling back to "HotelTechAI" which would be
    // misleading. Lock the stubs so a refactor doesn't drop them
    // and silently re-introduce the hotel-relabel bug.
    expect(industryCopyFor('legal').brand).toBe('Legal Workspace')
    expect(industryCopyFor('real_estate').brand).toBe('Real Estate Workspace')
    expect(industryCopyFor('education').brand).toBe('Education Workspace')
    expect(industryCopyFor('fitness').brand).toBe('Fitness Workspace')
  })

  it('returns hotel copy for genuinely unknown industry ids', () => {
    // The fallback proper: an industry id not in INDUSTRY_COPY at
    // all falls through to hotel (the canonical baseline). Stale
    // auth sessions or unmapped staging hosts land here.
    const unknown = industryCopyFor('some-unmapped-future-id' as any)
    expect(unknown.brand).toBe('HotelTechAI')
  })

  it('never returns null or undefined — every call yields a usable IndustryCopy', () => {
    const inputs = ['hotel', 'beauty', 'medical', 'restaurant',
                    'legal', 'real_estate', 'education', 'fitness',
                    null, undefined,
                    'completely-unknown-industry' as any] as const
    for (const input of inputs) {
      const c = industryCopyFor(input)
      expect(c).toBeTruthy()
      expect(typeof c.brand).toBe('string')
      expect(c.brand.length).toBeGreaterThan(0)
    }
  })
})

describe('INDUSTRY_COPY content invariants', () => {
  const gtmIndustries = ['hotel', 'beauty', 'medical', 'restaurant'] as const

  it.each(gtmIndustries)('GTM industry "%s" has full copy', (id) => {
    const copy = INDUSTRY_COPY[id]
    expect(copy).toBeTruthy()
    // Every full-copy entry must carry every IndustryCopy field
    // with a non-empty value — the signup page renders all of them.
    expect(copy!.brand.length).toBeGreaterThan(0)
    expect(copy!.hero.length).toBeGreaterThan(0)
    expect(copy!.heroSub.length).toBeGreaterThan(0)
    expect(copy!.tabTitle.length).toBeGreaterThan(0)
    expect(copy!.orgLabel.length).toBeGreaterThan(0)
    expect(copy!.orgPlaceholder.length).toBeGreaterThan(0)
    expect(copy!.planTagline.length).toBeGreaterThan(0)
    expect(copy!.workspaceNoun.length).toBeGreaterThan(0)
  })

  it.each(gtmIndustries)('GTM industry "%s" has exactly 3 hero bullets', (id) => {
    // The landing-page-mirror constraint per docblock —
    // "heroBullets: Hero bullets (3 short benefits)". Locks the
    // sub-brand registration page's visual rhythm.
    const bullets = INDUSTRY_COPY[id]!.heroBullets
    expect(Array.isArray(bullets)).toBe(true)
    expect(bullets.length).toBe(3)
    for (const b of bullets) {
      expect(typeof b).toBe('string')
      expect(b.length).toBeGreaterThan(0)
    }
  })

  it('every full-copy entry has a brand string in the recognised format', () => {
    // The 4 brands are documented: HotelTechAI, BeautyTech.uk,
    // MedTechAI, HospitalityTech / sub-brand. Lock the brand
    // strings as a regression guard against marketing rename
    // surprises.
    expect(INDUSTRY_COPY.hotel!.brand).toBe('HotelTechAI')
    expect(INDUSTRY_COPY.beauty!.brand).toBe('BeautyTech.uk')
    expect(INDUSTRY_COPY.medical!.brand).toBe('MedTechAI')
  })
})

describe('PICKER_INDUSTRIES — umbrella signup card list', () => {
  it('contains ONLY the 4 GTM-shipped industries', () => {
    expect([...PICKER_INDUSTRIES].sort()).toEqual(
      ['beauty', 'hotel', 'medical', 'restaurant'].sort(),
    )
  })

  it('does NOT include Settings-only industries', () => {
    // Per decision #7: legal / real_estate / education / fitness
    // are reachable in Settings → Industry but have NO dedicated
    // sub-brand domain or marketing landing. They MUST NOT appear
    // as picker cards on the umbrella signup view.
    const settingsOnly = ['legal', 'real_estate', 'education', 'fitness'] as const
    for (const id of settingsOnly) {
      expect(PICKER_INDUSTRIES.includes(id as any)).toBe(false)
    }
  })

  it('every PICKER_INDUSTRIES entry has full INDUSTRY_COPY', () => {
    // Inverse invariant: an industry on the picker MUST have full
    // marketing copy. Otherwise the picker card would render a
    // hotel-themed fallback for that industry, defeating the
    // umbrella picker's purpose.
    for (const id of PICKER_INDUSTRIES) {
      expect(INDUSTRY_COPY[id]).toBeTruthy()
      expect(INDUSTRY_COPY[id]!.brand.length).toBeGreaterThan(0)
    }
  })
})
