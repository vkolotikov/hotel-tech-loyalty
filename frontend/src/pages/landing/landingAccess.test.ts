import { describe, expect, it } from 'vitest'
import { landingAccessDecision, landingEntitled, landingNavTreatment } from './landingAccess'

/**
 * Locks `LandingPages.tsx`'s own gating contract — see `landingAccess.ts`
 * for the full story on the defect this fixes (Task 10b): App.tsx's route
 * gate used to bounce a lapsed tenant off `/landing-pages` before they ever
 * reached the Unpublish button that `routes/api.php` deliberately keeps
 * working for exactly that tenant.
 *
 * The dangerous direction is failing OPEN — a 'teardown' or 'full' decision
 * reached while an answer is still unresolved (or, worse, while the
 * tenant is genuinely not entitled) would render editing/publishing
 * controls to someone routes/api.php refuses on the wire. Every describe
 * block below either proves the safe case or explicitly tries to prove the
 * dangerous one and shows it does not happen.
 */
/**
 * Task 10b round 1 — the Critical the review found: `entitled` used to be
 * just `hasFeature && hasProduct`, which reads `true` for an EXPIRED or
 * CANCELLED org that was ever Enterprise, because nothing clears
 * `plan_features`/`entitled_products` on lapse. `landingEntitled` closes
 * that by also requiring a subscription status `check.subscription`
 * itself would let through. The reviewer's own reproduction — an EXPIRED
 * org built exactly as `getTrialFeatures('enterprise')` builds one — is
 * pinned here verbatim as the load-bearing case.
 */
describe('landingEntitled', () => {
  it('reproduces and closes the round-1 Critical: EXPIRED with landing_pages/chat still granted must NOT be entitled', () => {
    // [ARCHETYPE] status="EXPIRED" landing_pages="true" products=["crm","loyalty","booking","chat"]
    // — the review's own live-execution proof against the real endpoint.
    expect(landingEntitled('EXPIRED', true, true)).toBe(false)
  })

  it('same for CANCELLED — the other status the review named', () => {
    expect(landingEntitled('CANCELLED', true, true)).toBe(false)
  })

  it('same for PAST_DUE — Path 2 of CheckSubscription.php has no grace concept at all for Sanctum-only requests', () => {
    expect(landingEntitled('PAST_DUE', true, true)).toBe(false)
  })

  it('is entitled on ACTIVE with both flags true', () => {
    expect(landingEntitled('ACTIVE', true, true)).toBe(true)
  })

  it('is entitled on TRIALING with both flags true', () => {
    expect(landingEntitled('TRIALING', true, true)).toBe(true)
  })

  it('is entitled on LOCAL with both flags true — the no-SaaS-configured dev escape hatch', () => {
    expect(landingEntitled('LOCAL', true, true)).toBe(true)
  })

  it('is entitled on PAST_DUE_GRACE with both flags true — modelling the live-SaaS-JWT branch grace window', () => {
    expect(landingEntitled('PAST_DUE_GRACE', true, true)).toBe(true)
  })

  it('a known-good status alone is not enough — the feature/product pair still gates ordinary non-Enterprise plans', () => {
    expect(landingEntitled('ACTIVE', false, true)).toBe(false)
    expect(landingEntitled('ACTIVE', true, false)).toBe(false)
    expect(landingEntitled('ACTIVE', false, false)).toBe(false)
  })

  it('LOADING (useSubscription\'s own placeholder status while isLoading) is never entitled', () => {
    expect(landingEntitled('LOADING', true, true)).toBe(false)
  })

  it('exhaustive sweep over every status useSubscription can report × both flags: entitled is true for exactly the 4 known-good statuses with both flags true, and nowhere else', () => {
    const STATUSES = [
      'ACTIVE', 'TRIALING', 'LOCAL', 'PAST_DUE_GRACE',
      'EXPIRED', 'CANCELLED', 'PAST_DUE', 'UNPAID', 'PAUSED', 'NO_PLAN', 'LOADING',
    ]
    const BOOL = [true, false]
    const KNOWN_GOOD = new Set(['ACTIVE', 'TRIALING', 'LOCAL', 'PAST_DUE_GRACE'])

    let checked = 0
    for (const status of STATUSES) {
      for (const hasFeatureResult of BOOL) {
        for (const hasProductResult of BOOL) {
          checked++
          const expected = KNOWN_GOOD.has(status) && hasFeatureResult && hasProductResult
          expect(landingEntitled(status, hasFeatureResult, hasProductResult)).toBe(expected)
        }
      }
    }
    expect(checked).toBe(STATUSES.length * 4)
  })
})

describe('landingAccessDecision', () => {
  describe('role gate', () => {
    it('redirects immediately when the role gate refuses, even while everything else is still loading', () => {
      expect(landingAccessDecision({
        canAccessGate: false, entitled: true, entitlementLoading: true,
        published: true, publishedLoading: true,
      })).toBe('redirect')
    })

    it('redirects when the role gate refuses even though the tenant IS entitled', () => {
      // Role and billing are separate gates — passing one must never
      // substitute for the other.
      expect(landingAccessDecision({
        canAccessGate: false, entitled: true, entitlementLoading: false,
        published: false, publishedLoading: false,
      })).toBe('redirect')
    })
  })

  describe('entitlement still loading — must wait, never guess', () => {
    it('waits when entitlement is loading, regardless of what hasFeature/hasProduct currently read', () => {
      // Mirrors gateDecision.ts's own proof: useSubscription's real
      // loading-time defaults must never leak through as a real answer.
      expect(landingAccessDecision({
        canAccessGate: true, entitled: false, entitlementLoading: true,
        published: false, publishedLoading: false,
      })).toBe('wait')
    })

    it('waits even when the (stale) entitled flag happens to read true — proves no fail-open via a stale true', () => {
      const decision = landingAccessDecision({
        canAccessGate: true, entitled: true, entitlementLoading: true,
        published: false, publishedLoading: false,
      })
      expect(decision).toBe('wait')
      expect(decision).not.toBe('full')
    })
  })

  describe('entitled — the normal wizard/editor flow, unaffected by this fix', () => {
    it('renders full regardless of the (irrelevant) published/publishedLoading values', () => {
      // An entitled tenant never even triggers the status fetch in the
      // real component (see LandingPages.tsx's `enabled` condition), so
      // these values are meaningless noise here — asserted with every
      // combination to prove the decision genuinely ignores them once
      // entitled is true.
      for (const published of [true, false]) {
        for (const publishedLoading of [true, false]) {
          expect(landingAccessDecision({
            canAccessGate: true, entitled: true, entitlementLoading: false,
            published, publishedLoading,
          })).toBe('full')
        }
      }
    })
  })

  describe('not entitled — the new question only this fix asks', () => {
    it('waits for the teardown-status answer before deciding — the exact bug this task exists to fix', () => {
      const decision = landingAccessDecision({
        canAccessGate: true, entitled: false, entitlementLoading: false,
        published: false, publishedLoading: true,
      })
      expect(decision).toBe('wait')
    })

    it('never renders teardown while publishedLoading is true, even if published happens to read true — proves no fail-open via a stale/optimistic true', () => {
      const decision = landingAccessDecision({
        canAccessGate: true, entitled: false, entitlementLoading: false,
        published: true, publishedLoading: true,
      })
      expect(decision).toBe('wait')
      expect(decision).not.toBe('teardown')
    })

    it('shows the reduced teardown screen once a published page is confirmed', () => {
      expect(landingAccessDecision({
        canAccessGate: true, entitled: false, entitlementLoading: false,
        published: true, publishedLoading: false,
      })).toBe('teardown')
    })

    it('redirects — the ordinary upgrade path — once confirmed there is nothing published to tear down', () => {
      expect(landingAccessDecision({
        canAccessGate: true, entitled: false, entitlementLoading: false,
        published: false, publishedLoading: false,
      })).toBe('redirect')
    })
  })
})

/**
 * The literal instruction this task was given: test exhaustively over
 * (entitled, published, role) — with both async "still loading" states
 * pinned to resolved (false), this is exactly that 2×2×2 = 8-combination
 * sweep, spelled out by hand rather than only covered incidentally by the
 * larger sweep below.
 */
describe('landingAccessDecision — exhaustive (entitled, published, role), resolved', () => {
  const BOOL = [true, false] as const

  it('covers exactly 8 combinations and matches the rule by hand', () => {
    let count = 0
    for (const canAccessGate of BOOL) {
      for (const entitled of BOOL) {
        for (const published of BOOL) {
          count++
          const decision = landingAccessDecision({
            canAccessGate, entitled, entitlementLoading: false,
            published, publishedLoading: false,
          })

          const expected =
            !canAccessGate ? 'redirect'
            : entitled ? 'full'
            : published ? 'teardown'
            : 'redirect'

          expect(decision).toBe(expected)
        }
      }
    }
    expect(count).toBe(8)
  })
})

/**
 * The fuller sweep, same shape as `gateDecision.test.ts`'s own exhaustive
 * block — every boolean dimension the function actually takes, including
 * both loading flags. Pinned so the invariant it finds — never 'teardown'
 * or 'full' while an answer that decision depends on is unresolved — stays
 * checked by every future change to this function, not just the
 * hand-picked cases above.
 */
describe('landingAccessDecision — exhaustive sweep, all 5 dimensions', () => {
  const BOOL = [true, false] as const

  type Combo = {
    canAccessGate: boolean
    entitled: boolean
    entitlementLoading: boolean
    published: boolean
    publishedLoading: boolean
  }

  function allCombos(): Combo[] {
    const combos: Combo[] = []
    for (const canAccessGate of BOOL) for (const entitled of BOOL) for (const entitlementLoading of BOOL)
      for (const published of BOOL) for (const publishedLoading of BOOL)
        combos.push({ canAccessGate, entitled, entitlementLoading, published, publishedLoading })
    return combos
  }

  it('covers exactly 32 combinations', () => {
    expect(allCombos().length).toBe(32)
  })

  it('never decides teardown or full while entitlement itself is still loading — zero fail-open', () => {
    const failOpen = allCombos().filter(c =>
      c.entitlementLoading && ['teardown', 'full'].includes(landingAccessDecision(c))
    )
    expect(failOpen).toEqual([])
  })

  it('never decides teardown while NOT entitled and the status fetch is still loading — zero fail-open', () => {
    const failOpen = allCombos().filter(c =>
      c.canAccessGate && !c.entitlementLoading && !c.entitled && c.publishedLoading
      && landingAccessDecision(c) === 'teardown'
    )
    expect(failOpen).toEqual([])
  })

  it('only ever decides teardown for the one combination that has actually earned it', () => {
    const teardowns = allCombos().filter(c => landingAccessDecision(c) === 'teardown')
    expect(teardowns).toEqual([
      { canAccessGate: true, entitled: false, entitlementLoading: false, published: true, publishedLoading: false },
    ])
  })

  /**
   * Hand-derived tally, following the function's own short-circuit order:
   *  - canAccessGate=false -> redirect: 16 combos (half of 32).
   *  - canAccessGate=true, entitlementLoading=true -> wait: 8 combos.
   *  - canAccessGate=true, entitlementLoading=false, entitled=true -> full: 4 combos.
   *  - canAccessGate=true, entitlementLoading=false, entitled=false, publishedLoading=true -> wait: 2 combos.
   *  - canAccessGate=true, entitlementLoading=false, entitled=false, publishedLoading=false, published=true -> teardown: 1 combo.
   *  - canAccessGate=true, entitlementLoading=false, entitled=false, publishedLoading=false, published=false -> redirect: 1 combo.
   * redirect = 16 + 1 = 17, wait = 8 + 2 = 10, full = 4, teardown = 1. Sum = 32.
   */
  it('matches the hand-derived tally: redirect=17 wait=10 full=4 teardown=1', () => {
    const tally = { redirect: 0, wait: 0, full: 0, teardown: 0 }
    for (const c of allCombos()) tally[landingAccessDecision(c)]++
    expect(tally).toEqual({ redirect: 17, wait: 10, full: 4, teardown: 1 })
  })
})

/**
 * Round 2 (M2) — the sidebar precedence, which is the difference between a
 * `<Link>` and a `<button>` that never navigates.
 *
 * `Layout.tsx` maps `_locked` onto any item whose feature the plan lacks,
 * then `_lapsed` onto the landing item when the tenant is not entitled. The
 * second map used to be guarded by `!('_locked' in item)`, so `_locked`
 * always won — and a `_locked` item renders as a button whose only action
 * dispatches `feature:locked`. There are exactly two entry points to
 * `/landing-pages` in the whole SPA (the route and this nav item), so for
 * the one cohort with a live page and no entitlement the only remaining
 * route to the Unpublish button was typing the URL by hand.
 */
describe('landingNavTreatment', () => {
  it('gives the downgraded-but-still-paying tenant a lapsed LINK, not a locked button', () => {
    // The exact combination the old guard could not reach: the plan really
    // did drop `landing_pages` (so the generic lock map fired) while the
    // subscription is perfectly healthy — the cohort routes/api.php names
    // as the reason `unpublish` sits outside `feature:landing_pages`.
    expect(landingNavTreatment({ featureLocked: true, entitled: false })).toBe('lapsed')
  })

  it('gives the cancelled-but-still-flagged tenant the same lapsed link', () => {
    // Nothing clears plan_features on cancellation, so hasFeature stays
    // true and the lock map does NOT fire. This is the case that already
    // worked; it must keep working.
    expect(landingNavTreatment({ featureLocked: false, entitled: false })).toBe('lapsed')
  })

  it('leaves a fully entitled tenant alone', () => {
    expect(landingNavTreatment({ featureLocked: false, entitled: true })).toBe('normal')
  })

  it('still models locked for entitled-but-feature-locked, which landingEntitled makes unreachable today', () => {
    expect(landingNavTreatment({ featureLocked: true, entitled: true })).toBe('locked')
  })

  it('never answers "locked" for an unentitled tenant, whatever the lock map decided', () => {
    for (const featureLocked of [true, false]) {
      expect(landingNavTreatment({ featureLocked, entitled: false })).not.toBe('locked')
    }
  })
})
