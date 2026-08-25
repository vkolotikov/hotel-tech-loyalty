/**
 * Pure decision logic for `LandingPages.tsx`'s own gate — the fix for the
 * defect Task 10's own report found: `App.tsx`'s route-level
 * `gate="admin" product="chat" feature="landing_pages"` bounced a lapsed
 * tenant (CANCELLED, EXPIRED, PAST_DUE, UNPAID, PAUSED — every status
 * `check.subscription` treats as "not paying") straight to "/" before they
 * ever reached the Unpublish button, even though `routes/api.php`'s own
 * `unpublish` (and, since Task 10b, `status`) sit deliberately outside both
 * `feature:landing_pages` and `check.subscription` — exactly so a former
 * customer can take their own page off the internet without us running an
 * UPDATE by hand.
 *
 * The fix moves the product/feature entitlement decision OUT of `App.tsx`'s
 * route gate (which now only checks the "admin" role — see its own
 * comment) and into this page, because only the page can ask the one
 * question the generic `GatedRoute`/`gateDecision.ts` has no way to ask:
 * does this UNENTITLED tenant have something to tear down? `GET
 * /v1/admin/landing-pages/status` answers that, with no entitlement and no
 * live subscription required — the read counterpart to `unpublish`.
 *
 * Same vocabulary and same shape as `gateDecision.ts` (Task 9b) on
 * purpose — this is the same problem (don't fail open while an async
 * answer is still in flight) one level down, now with a second async
 * question instead of one:
 *
 *  - 'wait'     Either the entitlement answer or (once entitlement is
 *               confirmed false) the teardown-status answer hasn't
 *               resolved yet. Never render anything that depends on an
 *               answer we don't have yet — the exact fail-open
 *               `gateDecision.ts`'s own 'wait' state exists to close, one
 *               level down.
 *  - 'redirect' The role gate refused, OR the tenant is confirmed not
 *               entitled AND confirmed to have nothing published. Nothing
 *               to tear down means the ordinary upgrade/redirect path
 *               (same bounce as before this fix) is correct for them.
 *  - 'teardown' NOT entitled, but a published page exists. The reduced
 *               screen: live status, the public URL, and Unpublish. NEVER
 *               the wizard, the editor, Publish, or any edit control —
 *               this is the boundary `routes/api.php` itself draws, and
 *               this decision must mirror it exactly, not widen it.
 *  - 'full'     Entitled — the normal wizard/editor flow, byte-for-byte
 *               unchanged from before this fix.
 *
 * `canAccessGate` is evaluated first and short-circuits everything else,
 * same as `gateDecision.ts` — it is synchronous local auth-store state,
 * never worth waiting on. In practice `LandingPages.tsx` is only ever
 * mounted behind `App.tsx`'s own `gate="admin"` `GatedRoute`, so this is
 * belt-and-braces (the same "structural guarantee" reasoning this whole
 * phase's ledger keeps coming back to), not the primary enforcement —
 * but it is included and tested because the task asked for the decision
 * to cover (entitled, published, role) exhaustively, not just the two
 * async dimensions this file was written to add.
 */
export type LandingAccessDecision = 'wait' | 'redirect' | 'teardown' | 'full'

/**
 * Task 10b round 1 (review Critical): `entitled` is NOT just
 * `hasFeature('landing_pages') && hasProduct('chat')`. The assembled
 * backend gate on every build verb is `check.subscription` **AND**
 * `feature:landing_pages` (routes/api.php) — two independent refusals —
 * and the round-0 fix modelled only the second half.
 *
 * The gap that opened: `AuthController::subscription()`'s cached-org
 * branch (the ONLY branch the admin SPA's Sanctum-only requests ever
 * reach — `frontend/src/lib/api.ts` sends no SaaS JWT, so `saas_org_id`
 * is never set and the live-SaaS-JWT branch never runs) returns
 * `'features' => $orgForBilling->plan_features ?: []` and `'products' =>
 * $orgForBilling->entitled_products ?: []` **verbatim, regardless of
 * `subscription_status`** — nothing clears those columns on lapse
 * (`ExpireTrials.php`, `CheckSubscription.php` both write only the status
 * column). So a CANCELLED/EXPIRED org built the way
 * `getTrialFeatures('enterprise')` builds one (`landing_pages: 'true'`,
 * `chat` in `entitled_products` — the ordinary shape for any org that was
 * ever on a paid/trial Enterprise plan) reads `hasFeature`/`hasProduct` as
 * `true` right up until the trial-expiry sweep, even though every build
 * verb on the backend has ALREADY started refusing it with 403
 * `subscription_required` from `check.subscription` alone. Round 0 read
 * that combination as `entitled: true` -> decision `'full'` -> the
 * `status` query (gated on `!entitled`) never fired -> `LandingTeardown`
 * never mounted -> the wizard/editor's own `onboarding`/`show` queries
 * 403'd instead, landing the tenant on a bare `QueryError` retry card
 * with the page still live — worse than the pre-10b bounce, which at
 * least reached `SubscriptionWall`'s "choose a plan" CTA.
 *
 * The fix: `entitled` must also require the subscription status itself
 * be one `check.subscription` actually lets through. `useSubscription()`
 * already exposes `status` for exactly this. Modelled here as a small
 * allow-list rather than inline in the caller, so it can be tested
 * exhaustively against the reviewer's own reproduction (an EXPIRED org
 * with `landing_pages`/`chat` both still granted) alongside every other
 * status string `useSubscription` can report.
 *
 * `LOCAL` is included because it is the frontend's own escape hatch for
 * "no SaaS configured at all" (`useSubscription.ts`'s `ALL_FEATURES`
 * branch) — a status `check.subscription` itself grants unconditionally
 * (Path 3, `!$saasApi`). `PAST_DUE_GRACE` is included because it is the
 * literal status `check.subscription`'s live-SaaS-JWT branch (Path 1)
 * sets while inside the 3-day failed-charge grace window — not reachable
 * via this SPA's own Sanctum-only requests today, but the correct
 * modelling of "would check.subscription let this through", and free to
 * include: it can only ever ADD an entitled=true case for a status the
 * real gate would in fact pass, never open a hole.
 */
const SUBSCRIPTION_KNOWN_GOOD = new Set(['ACTIVE', 'TRIALING', 'LOCAL', 'PAST_DUE_GRACE'])

export function landingEntitled(
  subscriptionStatus: string,
  hasFeatureResult: boolean,
  hasProductResult: boolean,
): boolean {
  return SUBSCRIPTION_KNOWN_GOOD.has(subscriptionStatus) && hasFeatureResult && hasProductResult
}

/**
 * How the sidebar must treat the `/landing-pages` item — the precedence
 * question, not the entitlement one.
 *
 * `Layout.tsx` runs two maps over the nav items. The first turns any item
 * whose `feature` the plan does not include into `_locked`, which renders
 * as a `<button>` that dispatches `feature:locked` and NEVER navigates. The
 * second adds `_lapsed`, which keeps the item a real `<Link>` and only
 * dims it. The second used to be guarded by `!('_locked' in item)`, so
 * `_locked` always won — and that made the item unreachable for exactly the
 * cohort `routes/api.php`'s own comment names as the reason `unpublish`
 * sits outside `feature:landing_pages`: a tenant who is still paying, whose
 * subscription is perfectly healthy, and whose plan genuinely dropped
 * `landing_pages` in a downgrade. `hasFeature('landing_pages')` is false
 * for them (SaasAuthMiddleware rewrites `plan_features` on every stale
 * sync, and the Stripe webhook nulls `entitlements_synced_at` to force
 * one), so the FIRST map fired and the second could not.
 *
 * The backend serves that cohort correctly — every build verb 402s, while
 * `status` reports the live page and `unpublish` takes it off the internet
 * — and `landingAccessDecision({entitled:false, published:true})` already
 * returns `'teardown'`. Only the sidebar was in the way, and there are
 * exactly two entry points to `/landing-pages` in the whole SPA: the route
 * and this nav item. So the remaining path was typing the URL by hand.
 *
 * Hence: LAPSED WINS. Being unentitled is answered by letting the tenant
 * through to a screen that decides for itself, never by a button that
 * refuses to navigate.
 *
 * The objection — that this gives every Starter org a permanently dimmed
 * landing-pages item pointing at a screen they cannot use — is already
 * answered one level down: `landingAccessDecision` returns `'redirect'`
 * when `published` is false, which is every org that never had a page. The
 * item leads somewhere real for the tenant with a live page and bounces
 * harmlessly for everyone else, which is the trade the teardown promise is
 * worth.
 *
 * 'locked' is still returned for the entitled-but-feature-locked case so
 * this models the whole space rather than the half it was written for; that
 * combination is unreachable while `landingEntitled` requires the feature,
 * and it costs nothing to be right about it if that ever changes.
 */
export type LandingNavTreatment = 'normal' | 'locked' | 'lapsed'

export function landingNavTreatment({
  featureLocked,
  entitled,
}: {
  /** `item.feature && !hasFeature(item.feature)` — the generic lock map's own test. */
  featureLocked: boolean
  /** `landingEntitled(subStatus, hasFeature('landing_pages'), hasProduct('chat'))`. */
  entitled: boolean
}): LandingNavTreatment {
  if (!entitled) return 'lapsed'
  return featureLocked ? 'locked' : 'normal'
}

export function landingAccessDecision({
  canAccessGate,
  entitled,
  entitlementLoading,
  published,
  publishedLoading,
}: {
  /** canAccess('admin', staff) — the role gate. Unrelated to billing. */
  canAccessGate: boolean
  /** `landingEntitled(subStatus, hasFeature('landing_pages'), hasProduct('chat'))` — see that function's own docblock for why this is not just the feature/product pair. */
  entitled: boolean
  /** useSubscription().isLoading */
  entitlementLoading: boolean
  /**
   * Whether the tenant's page (if any) is currently published, per `GET
   * .../landing-pages/status`. Only ever consulted once `entitled` is
   * confirmed false — an entitled tenant gets the full editor regardless
   * of this, so a stale/loading value here can never leak into an
   * entitled tenant's render.
   */
  published: boolean
  /**
   * Whether the status fetch above is still in flight. Only consulted in
   * the same circumstances as `published` — see above.
   */
  publishedLoading: boolean
}): LandingAccessDecision {
  if (!canAccessGate) return 'redirect'
  if (entitlementLoading) return 'wait'
  if (entitled) return 'full'
  if (publishedLoading) return 'wait'
  return published ? 'teardown' : 'redirect'
}
