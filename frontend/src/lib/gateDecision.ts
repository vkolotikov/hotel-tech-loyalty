/**
 * Pure decision logic for App.tsx's `GatedRoute`, extracted so the
 * loading-race fix (Task 9b, Fix 2) can be covered by a plain vitest
 * unit test — vitest.config.ts is deliberately node-env with no jsdom/
 * React Testing Library, so a function with no React/DOM dependency is
 * the only practical way to exercise this logic in this repo's test
 * suite without adding new test infrastructure.
 *
 * The bug: GatedRoute used to evaluate `hasFeature`/`hasProduct` from
 * useSubscription() unconditionally. Both default to "not entitled"
 * while useSubscription's query is still loading (no cached data yet —
 * true on the FIRST render of a hard navigation, page refresh, or
 * bookmark). GatedRoute treated that "don't know yet" as "definitely
 * not entitled" and redirected to "/" — a customer typing a gated
 * route's URL, or a platform admin whose synthetic feature map load is
 * itself the thing being awaited, got bounced before the real
 * /v1/auth/subscription answer ever arrived.
 *
 * The fix: a third outcome, 'wait', for exactly the window where a
 * product/feature gate exists AND the subscription answer isn't in yet.
 * Only PageLoader renders — never the gated children, and never a
 * redirect off a real (if not yet confirmed) entitlement. Once
 * isLoading flips false (query resolved, or errored — react-query's
 * `retry: false` means that happens quickly either way) the real
 * hasFeature/hasProduct answer decides render vs redirect, same as
 * before.
 *
 * Note `gate` (the staff role check, e.g. gate="admin") is NOT part of
 * this wait — it's synchronous local auth-store state, already known on
 * the very first render, so waiting on it would only add a pointless
 * flash of PageLoader.
 *
 * DEPENDS ON REACT-QUERY v5's `isLoading` semantics (this repo pins
 * @tanstack/react-query ^5.90.21): `isLoading` is `isPending && isFetching`
 * — true only while a query has no data AND is actively fetching, false
 * once it settles (success OR error) or while `enabled: false` leaves it
 * merely pending-but-idle. Under react-query v4, `isLoading` meant
 * "pending" alone, so a DISABLED query (`enabled: false`, no fetch ever
 * started) reported `isLoading: true` indefinitely. `useSubscription`
 * sets `enabled: isStaff` — a loyalty member has `isStaff === false`, so
 * on v4 semantics that query would sit at `isLoading: true` forever for
 * every member. `FullscreenRoute` (App.tsx) calls `GatedRoute` WITHOUT a
 * `ProtectedRoute` wrapper, so nothing upstream catches a member on a
 * `feature=`/`product=`-gated `FullscreenRoute` either — they would hang
 * on `PageLoader` permanently instead of the redirect a member is
 * supposed to get. Correct today on v5; would silently regress on a v4
 * downgrade or a v4-semantics query-library swap.
 */
export type GateDecision = 'render' | 'redirect' | 'wait'

export function gateDecision({
  gate,
  product,
  feature,
  canAccessGate,
  isLoading,
  hasProductResult,
  hasFeatureResult,
}: {
  /** Whether a role gate (e.g. "admin") was requested at all. */
  gate?: string
  /** Whether a product gate (e.g. "booking") was requested at all. */
  product?: string
  /** Whether a feature gate (e.g. "landing_pages") was requested at all. */
  feature?: string
  /** Result of canAccess(gate, staff) — ignored when `gate` is unset. */
  canAccessGate: boolean
  /** useSubscription().isLoading */
  isLoading: boolean
  /** Result of hasProduct(product) — ignored when `product` is unset. */
  hasProductResult: boolean
  /** Result of hasFeature(feature) — ignored when `feature` is unset. */
  hasFeatureResult: boolean
}): GateDecision {
  if (gate && !canAccessGate) return 'redirect'
  if ((product || feature) && isLoading) return 'wait'
  if (product && !hasProductResult) return 'redirect'
  if (feature && !hasFeatureResult) return 'redirect'
  return 'render'
}
