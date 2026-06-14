import { describe, expect, it } from 'vitest'
import {
  ALL_FEATURES,
  PLAN_DISPLAY_ORDER,
  PLAN_FEATURES,
  PLAN_TAGLINES,
  POPULAR_PLAN_SLUG,
} from './planFeatures'

/**
 * Locks the pricing surface. This file IS the buyer-facing source of
 * truth — drift between ALL_FEATURES / PLAN_FEATURES / PLAN_TAGLINES
 * costs revenue (signup page shows different rows than Billing page,
 * "Most Popular" plan doesn't render, gated feature missing from the
 * comparison table → support questions like "what did I just pay for?").
 *
 * Also locks the architectural invariant: every feature key in
 * ALL_FEATURES must be answered by EVERY plan slug in
 * PLAN_DISPLAY_ORDER. Otherwise the comparison table renders blank
 * cells and the upgrade modal can't FRIENDLY_LABEL them.
 *
 * What's deliberately NOT enforced:
 *   - Specific label TEXT for any feature (marketing reshuffles strings
 *     constantly; testing exact strings would create noise commits).
 *     Instead, we assert PRESENCE + TYPE.
 *   - Specific plan slug names beyond the 3 we currently sell (would
 *     spuriously fail any new plan addition).
 */
describe('planFeatures pricing surface', () => {
  it('ALL_FEATURES carries every feature key as a {key,label} pair', () => {
    expect(ALL_FEATURES.length).toBeGreaterThan(0)
    for (const f of ALL_FEATURES) {
      expect(typeof f.key).toBe('string')
      expect(f.key.length).toBeGreaterThan(0)
      expect(typeof f.label).toBe('string')
      expect(f.label.length).toBeGreaterThan(0)
    }
  })

  it('ALL_FEATURES keys are unique — no duplicate rows', () => {
    const keys = ALL_FEATURES.map(f => f.key)
    const unique = new Set(keys)
    expect(unique.size).toBe(keys.length)
  })

  it('PLAN_DISPLAY_ORDER carries the 3 plan slugs we currently sell', () => {
    expect(PLAN_DISPLAY_ORDER).toEqual(['starter', 'growth', 'enterprise'])
  })

  it('POPULAR_PLAN_SLUG points at a real plan in PLAN_DISPLAY_ORDER', () => {
    expect(PLAN_DISPLAY_ORDER).toContain(POPULAR_PLAN_SLUG)
  })

  it('every plan in PLAN_DISPLAY_ORDER has an entry in PLAN_FEATURES', () => {
    for (const slug of PLAN_DISPLAY_ORDER) {
      expect(PLAN_FEATURES[slug]).toBeTruthy()
    }
  })

  it('every plan in PLAN_DISPLAY_ORDER has a tagline in PLAN_TAGLINES', () => {
    for (const slug of PLAN_DISPLAY_ORDER) {
      const tagline = PLAN_TAGLINES[slug]
      expect(typeof tagline).toBe('string')
      expect(tagline.length).toBeGreaterThan(0)
    }
  })

  it('every PLAN_FEATURES plan answers EVERY feature key in ALL_FEATURES', () => {
    // The load-bearing invariant. If someone adds a row to
    // ALL_FEATURES but forgets to map it on every plan, the
    // comparison table renders an empty cell which reads as
    // "we don't know what this feature does."
    for (const slug of PLAN_DISPLAY_ORDER) {
      const plan = PLAN_FEATURES[slug]
      for (const f of ALL_FEATURES) {
        expect(plan).toHaveProperty(f.key)
        const v = plan[f.key]
        // Each value must be boolean OR non-empty string. `false` is
        // valid ("not included on this plan"), `true` is valid, and
        // a string is valid (the detail-when-included copy). null /
        // undefined / empty string are NOT valid.
        const ok = typeof v === 'boolean'
          || (typeof v === 'string' && v.length > 0)
        expect(ok).toBe(true)
      }
    }
  })

  it('Enterprise-only v2 gates resolve TRUE on enterprise + FALSE on starter+growth', () => {
    // The 3 v2 gates have matching backend middleware (CLAUDE.md +
    // the planFeatures.ts docblock inventory). If marketing drifts so
    // that growth = true for any of these, the SPA shows the feature
    // as included but the route 402s — broken-pipe experience.
    const enterpriseOnly = ['time_management', 'admin_ai', 'brands'] as const
    for (const key of enterpriseOnly) {
      expect(PLAN_FEATURES.enterprise[key]).toBeTruthy()
      expect(PLAN_FEATURES.starter[key]).toBe(false)
      expect(PLAN_FEATURES.growth[key]).toBe(false)
    }
  })

  it('Growth+ v3 gates are TRUE on growth AND enterprise, FALSE on starter', () => {
    // The 5 v3 gates each carry matching loyalty middleware. Same
    // broken-pipe risk if Growth drifts to true on any v2 row OR
    // Starter drifts to true on a v3 row outside the grace window.
    const growthPlus = ['campaigns', 'reviews', 'engagement', 'wallet', 'chatbot'] as const
    for (const key of growthPlus) {
      expect(PLAN_FEATURES.growth[key]).toBeTruthy()
      expect(PLAN_FEATURES.enterprise[key]).toBeTruthy()
      expect(PLAN_FEATURES.starter[key]).toBe(false)
    }
  })

  it('mobile is on every plan (CLAUDE.md 2026-06-08 decision)', () => {
    // Per CLAUDE.md: "mobile_app + push_notifications flipped to 'true'
    // on Starter (the marketing surface always promised Starter and
    // the member mobile app)." Lock this in — drift back to false on
    // Starter would re-create the marketing-vs-reality gap the v3
    // arc closed.
    expect(PLAN_FEATURES.starter.mobile).toBeTruthy()
    expect(PLAN_FEATURES.growth.mobile).toBeTruthy()
    expect(PLAN_FEATURES.enterprise.mobile).toBeTruthy()
  })

  it('SLA is Enterprise-only — the differentiated service tier', () => {
    // Per the docblock: "every plan now reads 'Email, online or in
    // person' on the support row. The tier differentiation moved to
    // the SLA row (Enterprise-only)." If Growth gets SLA, the
    // pricing ladder loses its top differentiator.
    expect(PLAN_FEATURES.starter.sla).toBe(false)
    expect(PLAN_FEATURES.growth.sla).toBe(false)
    expect(PLAN_FEATURES.enterprise.sla).toBeTruthy()
  })

  it('support row is uniform across all plans', () => {
    // Channel-based support is uniform per the v2 tightening pass
    // (SLA is the Enterprise differentiator instead).
    const starter = PLAN_FEATURES.starter.support
    const growth = PLAN_FEATURES.growth.support
    const enterprise = PLAN_FEATURES.enterprise.support
    expect(starter).toBe(growth)
    expect(growth).toBe(enterprise)
  })

  it('crm is on every plan (Starter still gets unlimited profiles)', () => {
    // Per Starter spec: "For single-location service businesses
    // getting started with customer data..." CRM as the foundational
    // offering must stay on Starter.
    for (const slug of PLAN_DISPLAY_ORDER) {
      expect(PLAN_FEATURES[slug].crm).toBeTruthy()
    }
  })
})
