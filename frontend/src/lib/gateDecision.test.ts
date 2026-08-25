import { describe, expect, it } from 'vitest'
import { gateDecision } from './gateDecision'

/**
 * Locks GatedRoute's gating contract — see gateDecision.ts for the full
 * story on the loading-race bug this fixes (Task 9b, Fix 2).
 *
 * The load-bearing case is "wait": a fresh hard navigation to a
 * product/feature-gated route (typed URL, bookmark, refresh) must NOT
 * be treated as "not entitled" just because useSubscription hasn't
 * resolved yet. Before this fix, GatedRoute called hasFeature/hasProduct
 * directly, and both return a "not entitled" default while isLoading —
 * so the very case this test locks (isLoading + a feature/product gate)
 * used to fall straight into the old 'redirect' behavior.
 */
describe('gateDecision', () => {
  it('renders when no gate/product/feature is requested at all', () => {
    expect(gateDecision({
      canAccessGate: true, isLoading: true, hasProductResult: false, hasFeatureResult: false,
    })).toBe('render')
  })

  describe('role gate (gate=)', () => {
    it('redirects immediately when canAccessGate is false, even while loading', () => {
      // Role gate is synchronous local auth-store state — never worth
      // waiting on, and must not be softened by an in-flight
      // subscription fetch.
      expect(gateDecision({
        gate: 'admin', canAccessGate: false, isLoading: true,
        hasProductResult: true, hasFeatureResult: true,
      })).toBe('redirect')
    })

    it('does not wait on isLoading when only a role gate is set', () => {
      expect(gateDecision({
        gate: 'admin', canAccessGate: true, isLoading: true,
        hasProductResult: true, hasFeatureResult: true,
      })).toBe('render')
    })
  })

  describe('the loading race (the bug this fixes)', () => {
    it('waits — does not redirect — when a feature gate is set and isLoading is true', () => {
      expect(gateDecision({
        feature: 'landing_pages', canAccessGate: true, isLoading: true,
        hasProductResult: true, hasFeatureResult: false, // false is useSubscription's loading default
      })).toBe('wait')
    })

    it('waits — does not redirect — when a product gate is set and isLoading is true', () => {
      expect(gateDecision({
        product: 'booking', canAccessGate: true, isLoading: true,
        hasProductResult: false, hasFeatureResult: true,
      })).toBe('wait')
    })

    it('never renders gated children while waiting — proves the fix does not fail open', () => {
      // Entitlement is unknown (isLoading), and hasFeatureResult here is
      // deliberately `true` — even a stale/optimistic true must not leak
      // through as 'render' while the real answer is still in flight.
      const decision = gateDecision({
        feature: 'landing_pages', canAccessGate: true, isLoading: true,
        hasProductResult: true, hasFeatureResult: true,
      })
      expect(decision).toBe('wait')
      expect(decision).not.toBe('render')
    })

    it('closes the PRE-EXISTING hasProduct fail-open — round 1 review finding', () => {
      // useSubscription.ts's hasProduct — unlike hasFeature — returns
      // `true` (not `false`) while isLoading: `if (isLoading || isLocal)
      // return true`. Before this fix, GatedRoute called hasProduct
      // directly, so every product-only route (/bookings, /calendar,
      // /chat-inbox, /inbox, and ~10 more) rendered its gated content
      // during the loading window on a fresh hard navigation — not a
      // bounce, an actual entitlement leak. Layout's allowRender masked
      // this for ordinary staff but explicitly exempts super_admin, and
      // FullscreenRoute has no Layout wrapper at all for any role. This
      // pins hasProductResult at its real loading-time value (`true`) and
      // asserts the outcome is still 'wait', not 'render' — the mutation
      // below (deleting the wait-check) flips this straight to 'render'.
      const decision = gateDecision({
        product: 'booking', canAccessGate: true, isLoading: true,
        hasProductResult: true, hasFeatureResult: true,
      })
      expect(decision).toBe('wait')
      expect(decision).not.toBe('render')
    })
  })

  describe('once loaded (isLoading: false) — the real answer decides', () => {
    it('renders when entitled', () => {
      expect(gateDecision({
        feature: 'landing_pages', canAccessGate: true, isLoading: false,
        hasProductResult: true, hasFeatureResult: true,
      })).toBe('render')
    })

    it('redirects when not entitled — the fix must not mask a genuine lock', () => {
      expect(gateDecision({
        feature: 'landing_pages', canAccessGate: true, isLoading: false,
        hasProductResult: true, hasFeatureResult: false,
      })).toBe('redirect')
    })

    it('redirects when the product is not entitled', () => {
      expect(gateDecision({
        product: 'booking', canAccessGate: true, isLoading: false,
        hasProductResult: false, hasFeatureResult: true,
      })).toBe('redirect')
    })

    it('requires BOTH product and feature to pass when both are set', () => {
      expect(gateDecision({
        product: 'chat', feature: 'landing_pages', canAccessGate: true, isLoading: false,
        hasProductResult: true, hasFeatureResult: false,
      })).toBe('redirect')
    })
  })
})

/**
 * Exhaustive check over every (gate, product, feature, canAccessGate,
 * isLoading, hasProductResult, hasFeatureResult) combination — the same
 * 128-combination sweep round-1 review ran by hand against this function
 * (render=39 redirect=53 wait=36, FAIL_OPEN=0). Pinned here so the
 * invariant it found — "every combination with a product/feature gate
 * and isLoading: true returns 'wait', never 'render'" — stays checked by
 * every future change to gateDecision, not just the hand-picked cases
 * above.
 */
describe('gateDecision — exhaustive sweep (round-1 review verification)', () => {
  const BOOL = [true, false] as const
  const GATE = [undefined, 'admin'] as const
  const PRODUCT = [undefined, 'booking'] as const
  const FEATURE = [undefined, 'landing_pages'] as const

  type Combo = {
    gate?: string
    product?: string
    feature?: string
    canAccessGate: boolean
    isLoading: boolean
    hasProductResult: boolean
    hasFeatureResult: boolean
  }

  function allCombos(): Combo[] {
    const combos: Combo[] = []
    for (const gate of GATE) for (const product of PRODUCT) for (const feature of FEATURE)
      for (const canAccessGate of BOOL) for (const isLoading of BOOL)
        for (const hasProductResult of BOOL) for (const hasFeatureResult of BOOL)
          combos.push({ gate, product, feature, canAccessGate, isLoading, hasProductResult, hasFeatureResult })
    return combos
  }

  it('covers exactly 128 combinations', () => {
    expect(allCombos().length).toBe(128)
  })

  it('never renders gated content while a product/feature gate is unresolved (isLoading) — zero fail-open', () => {
    const failOpen = allCombos().filter(c =>
      (c.product || c.feature) && c.isLoading && gateDecision(c) === 'render'
    )
    expect(failOpen).toEqual([])
  })

  it('always waits — never redirects — while a product/feature gate is unresolved, unless the role gate already refused', () => {
    const shouldWaitButDidnt = allCombos().filter(c => {
      const roleRefuses = !!c.gate && !c.canAccessGate
      const shouldWait = !roleRefuses && (!!c.product || !!c.feature) && c.isLoading
      return shouldWait && gateDecision(c) !== 'wait'
    })
    expect(shouldWaitButDidnt).toEqual([])
  })

  it('matches the round-1 review tally: render=39 redirect=53 wait=36', () => {
    const tally = { render: 0, redirect: 0, wait: 0 }
    for (const c of allCombos()) tally[gateDecision(c)]++
    expect(tally).toEqual({ render: 39, redirect: 53, wait: 36 })
  })
})
