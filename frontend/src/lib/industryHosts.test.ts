import { describe, expect, it } from 'vitest'
import {
  HOST_INDUSTRY,
  INDUSTRY_PRIMARY_DOMAIN,
  detectIndustryFromHost,
  detectIndustryFromHostStrict,
} from './industryHosts'

/**
 * Locks the host → industry resolution layer. Phase 1 foundation
 * for the multi-sub-brand SPA: the same code runs on 5 different
 * hostnames and must self-identify per industry.
 *
 * Key invariants per the docblock:
 *
 *   1. Four GTM sub-brand primaries resolve directly (hotel-tech.ai,
 *      beauty-tech.uk, med.hexa-tech.uk, hospitality.hexa-tech.uk).
 *
 *   2. Umbrella `app.hexa-tech.uk` resolves to null — must NOT
 *      default to hotel; the SPA needs the null signal to render
 *      the explicit 4-card industry picker on signup.
 *
 *   3. Subdomain suffix matching: `staging.beauty-tech.uk`, etc.,
 *      resolve to the parent's industry so preview deploys don't
 *      silently fall through to hotel.
 *
 *   4. Localhost + IP loopback default to hotel (dev-flow safety).
 *
 *   5. Lenient (default) variant: unknown hosts default to hotel.
 *      Strict variant: unknown hosts return null so the picker
 *      shows.
 *
 *   6. www.* prefix normalisation: handled lookups regardless of
 *      whether the browser added the www.
 *
 *   7. INDUSTRY_PRIMARY_DOMAIN reverse map: exhaustive — every
 *      IndustryId resolves to a domain (GTM-deferred industries
 *      fall back to the umbrella host).
 */
describe('detectIndustryFromHost — lenient default', () => {
  it('resolves the four GTM sub-brand primaries', () => {
    expect(detectIndustryFromHost('hotel-tech.ai')).toBe('hotel')
    expect(detectIndustryFromHost('beauty-tech.uk')).toBe('beauty')
    expect(detectIndustryFromHost('med.hexa-tech.uk')).toBe('medical')
    expect(detectIndustryFromHost('hospitality.hexa-tech.uk')).toBe('restaurant')
  })

  it('resolves loyalty.hotel-tech.ai as hotel (canonical production host)', () => {
    expect(detectIndustryFromHost('loyalty.hotel-tech.ai')).toBe('hotel')
  })

  it('resolves the umbrella host to null (signal: show picker)', () => {
    // The picker-triggering signal. If this drifts to 'hotel', the
    // signup flow on the umbrella would silently default to a hotel
    // org for a salon admin who landed there.
    expect(detectIndustryFromHost('app.hexa-tech.uk')).toBeNull()
  })

  it('matches sub-brand subdomains via suffix', () => {
    // staging.beauty-tech.uk → beauty so previews don't fall through
    // to the lenient hotel default.
    expect(detectIndustryFromHost('staging.beauty-tech.uk')).toBe('beauty')
    expect(detectIndustryFromHost('preview.med.hexa-tech.uk')).toBe('medical')
    expect(detectIndustryFromHost('ci.hospitality.hexa-tech.uk')).toBe('restaurant')
  })

  it('matches umbrella subdomains as null too (picker for previews of umbrella)', () => {
    expect(detectIndustryFromHost('staging.app.hexa-tech.uk')).toBeNull()
  })

  it('defaults to hotel for localhost / loopback addresses', () => {
    expect(detectIndustryFromHost('localhost')).toBe('hotel')
    expect(detectIndustryFromHost('127.0.0.1')).toBe('hotel')
    expect(detectIndustryFromHost('0.0.0.0')).toBe('hotel')
  })

  it('defaults to hotel for any unmapped host (lenient)', () => {
    // Lenient default keeps dev flows + unmapped staging hosts
    // working without picker friction.
    expect(detectIndustryFromHost('some-unmapped-host.example.com')).toBe('hotel')
    expect(detectIndustryFromHost('vitalys-machine.local')).toBe('hotel')
  })

  it('handles uppercase + trailing dot + www. prefix normalisation', () => {
    expect(detectIndustryFromHost('WWW.BEAUTY-TECH.UK')).toBe('beauty')
    expect(detectIndustryFromHost('beauty-tech.uk.')).toBe('beauty')
    expect(detectIndustryFromHost('www.med.hexa-tech.uk')).toBe('medical')
  })

  it('handles empty + invalid input by falling through to hotel default', () => {
    expect(detectIndustryFromHost('')).toBe('hotel')
  })
})

describe('detectIndustryFromHostStrict — picker-enforcing variant', () => {
  it('returns null for any unmapped host (no lenient fall-through)', () => {
    // The strict variant exists exactly so the umbrella + unknown
    // preview hosts force the picker on signup.
    expect(detectIndustryFromHostStrict('some-random-host.test')).toBeNull()
    expect(detectIndustryFromHostStrict('preview.hexa-tech.uk')).toBeNull()
  })

  it('still resolves the four GTM primaries verbatim', () => {
    expect(detectIndustryFromHostStrict('hotel-tech.ai')).toBe('hotel')
    expect(detectIndustryFromHostStrict('beauty-tech.uk')).toBe('beauty')
    expect(detectIndustryFromHostStrict('med.hexa-tech.uk')).toBe('medical')
  })

  it('still matches sub-brand subdomains via suffix', () => {
    expect(detectIndustryFromHostStrict('staging.beauty-tech.uk')).toBe('beauty')
    expect(detectIndustryFromHostStrict('preview.med.hexa-tech.uk')).toBe('medical')
  })

  it('still defaults localhost to hotel (dev friction-free)', () => {
    // Strict variant explicitly preserves the localhost default to
    // keep local dev frictionless.
    expect(detectIndustryFromHostStrict('localhost')).toBe('hotel')
    expect(detectIndustryFromHostStrict('127.0.0.1')).toBe('hotel')
  })

  it('returns null on the umbrella host (same signal as lenient)', () => {
    expect(detectIndustryFromHostStrict('app.hexa-tech.uk')).toBeNull()
  })
})

describe('HOST_INDUSTRY map invariants', () => {
  it('carries the umbrella host as null (not a typo for hotel)', () => {
    // Lock the null value specifically — a regression that
    // changed it to 'hotel' would silently break the picker.
    expect(HOST_INDUSTRY['app.hexa-tech.uk']).toBeNull()
  })

  it('covers the four GTM sub-brand primaries', () => {
    const expected = ['hotel-tech.ai', 'beauty-tech.uk', 'med.hexa-tech.uk', 'hospitality.hexa-tech.uk']
    for (const host of expected) {
      expect(host in HOST_INDUSTRY).toBe(true)
    }
  })
})

describe('INDUSTRY_PRIMARY_DOMAIN reverse map', () => {
  it('every supported industry resolves to a non-empty domain', () => {
    // The exhaustiveness invariant: every IndustryId must have a
    // primary domain entry — even if the GTM-deferred industries
    // share the umbrella host. Otherwise sign-up branding code
    // crashes on industries it can't reverse-map.
    const industries = ['hotel', 'beauty', 'medical', 'restaurant',
                        'legal', 'real_estate', 'education', 'fitness'] as const
    for (const id of industries) {
      expect(INDUSTRY_PRIMARY_DOMAIN[id]).toBeTruthy()
      expect(INDUSTRY_PRIMARY_DOMAIN[id].length).toBeGreaterThan(0)
    }
  })

  it('GTM-deferred industries (legal/real_estate/education/fitness) point at the umbrella', () => {
    // The docblock acknowledges this is circular UX in some flows;
    // consumers should gate on a GTM check rather than render
    // blindly. Lock the umbrella fallback so a future refactor
    // doesn't silently point them at hotel-tech.ai.
    expect(INDUSTRY_PRIMARY_DOMAIN.legal).toBe('app.hexa-tech.uk')
    expect(INDUSTRY_PRIMARY_DOMAIN.real_estate).toBe('app.hexa-tech.uk')
    expect(INDUSTRY_PRIMARY_DOMAIN.education).toBe('app.hexa-tech.uk')
    expect(INDUSTRY_PRIMARY_DOMAIN.fitness).toBe('app.hexa-tech.uk')
  })

  it('round-trips: each primary domain detects back to its industry', () => {
    // The 4 GTM industries form a clean bijection with their
    // primary domains. A regression on either side surfaces here.
    expect(detectIndustryFromHost(INDUSTRY_PRIMARY_DOMAIN.hotel)).toBe('hotel')
    expect(detectIndustryFromHost(INDUSTRY_PRIMARY_DOMAIN.beauty)).toBe('beauty')
    expect(detectIndustryFromHost(INDUSTRY_PRIMARY_DOMAIN.medical)).toBe('medical')
    expect(detectIndustryFromHost(INDUSTRY_PRIMARY_DOMAIN.restaurant)).toBe('restaurant')
  })
})
