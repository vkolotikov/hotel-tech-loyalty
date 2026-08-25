import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Navigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { api } from '../lib/api'
import { QueryError } from '../components/QueryError'
import { BrandRequired } from '../components/BrandRequired'
import { canAccess } from '../components/Layout'
import { useAuthStore } from '../stores/authStore'
import { useBrandStore } from '../stores/brandStore'
import { useSubscription } from '../hooks/useSubscription'
import { LandingWizard } from './landing/LandingWizard'
import { LandingEditor } from './landing/LandingEditor'
import { LandingTeardown } from './landing/LandingTeardown'
import { landingAccessDecision, landingEntitled } from './landing/landingAccess'
import { brandToken, showWizard, type BrandToken } from './landing/wizardGate'

/**
 * Host page for the Landing Page builder. Decides between the wizard (the
 * tenant has no page yet), the editor (a page already exists) and, since
 * Task 10b, a reduced teardown-only screen for a tenant who has neither —
 * Appendix A §7.2: the gate lives HERE, in the host, not inside any of the
 * three.
 *
 * Task 10b moved the product/feature entitlement check OUT of `App.tsx`'s
 * route (`<Route path="/landing-pages">` now only gates on the "admin"
 * role — see its own comment) and IN here, via `landingAccessDecision()`.
 * The generic route-level `GatedRoute` has no way to ask the one question
 * this fix depends on: an UNENTITLED tenant with a PUBLISHED page must
 * still reach this component, because `routes/api.php`'s own `unpublish`
 * (and its read counterpart `status`) are deliberately reachable with no
 * entitlement and no live subscription — so a former customer can always
 * take their own page off the internet. Before this fix `App.tsx` bounced
 * that exact tenant to "/" before they ever got here at all.
 *
 * EVERY hook below runs before any early return. Putting a gate above a
 * query is exactly the mistake Members.tsx's own comment warns about — it
 * crashes with "Rendered more hooks than during the previous render" on a
 * hard refresh, because the loading render and the content render would
 * call a different number of hooks. Both queries below use `enabled`
 * rather than being called conditionally, for exactly this reason.
 */
export function LandingPages() {
  const { t } = useTranslation()
  const { staff } = useAuthStore()

  // Local latch: once the wizard reports done, stay on the editor even
  // while `landing-onboarding` is still refetching its stale
  // `completed: false`. invalidateQueries() alone leaves the wizard on
  // screen through that refetch window.
  //
  // Fix round 1 (Task 7): this used to be a flat boolean, so finishing the
  // wizard for one brand permanently forced the editor for every OTHER
  // brand too — nothing here ever mounts on a brand switch
  // (`BrandSwitcher.switchTo()` only calls `setCurrentBrand` +
  // `invalidateQueries()`, no navigation), so nothing ever reset it.
  // `undefined` until a wizard finishes; from then on it holds the token of
  // the brand it finished FOR, and `showWizard()` only suppresses the
  // wizard for that exact token — see `wizardGate.ts`.
  const [doneForBrand, setDoneForBrand] = useState<BrandToken | undefined>(undefined)

  // RULING 11: `prefill` carries the brand's own Property (business_name,
  // phone, email, address) and brand_color, exactly the fields Task 4 spent
  // two backend fix rounds keeping brand-pure. `BrandSwitcher` sets this
  // store synchronously and only THEN calls a keyless `invalidateQueries()`,
  // so an un-parameterised key left a window where `currentBrandId` had
  // already flipped while `data.prefill` still held the OLD brand's — the
  // wizard would draw brand B's screen with brand A's contact details until
  // the refetch landed. Parameterising the key closes that window: the new
  // brand's query starts uncached rather than showing stale data.
  const { currentBrandId } = useBrandStore()

  // hasFeature/hasProduct both default to "not entitled" while loading
  // (useSubscription.ts) — landingAccessDecision's own 'wait' outcome is
  // what keeps that from being misread as a real, confirmed no.
  //
  // Task 10b round 1 (review Critical): `entitled` is NOT just the
  // feature/product pair — see `landingEntitled`'s own docblock for why.
  // Short version: the admin SPA's Sanctum-only requests never clear
  // `plan_features`/`entitled_products` on a lapsed subscription (nothing
  // writes those columns on expiry), so an EXPIRED/CANCELLED org that was
  // ever Enterprise still reads `hasFeature('landing_pages')` and
  // `hasProduct('chat')` as `true`. `status` closes that by also
  // requiring the subscription itself be in a state `check.subscription`
  // (routes/api.php) actually lets through.
  const { hasFeature, hasProduct, status: subStatus, isLoading: entitlementLoading } = useSubscription()
  const entitled = landingEntitled(subStatus, hasFeature('landing_pages'), hasProduct('chat'))

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['landing-onboarding', currentBrandId],
    queryFn: () => api.get('/v1/admin/landing-pages/onboarding').then(r => r.data),
    // Only an entitled tenant may reach `onboarding` at all —
    // `feature:landing_pages` (routes/api.php) 402s everyone else. Firing
    // it regardless would waste a call AND route this component into the
    // generic QueryError branch below for a tenant who needs the
    // teardown screen instead, not an error message.
    enabled: entitled,
  })

  // The entitlement-free read `LandingTeardown` needs: whether there is
  // currently a published page, and its address. Fired ONLY once
  // entitlement is confirmed false — never during the entitlement loading
  // window (nothing to ask yet) and never for an entitled tenant (who
  // gets the full editor regardless and must never wait on this).
  const { data: statusData, isLoading: statusLoading } = useQuery<{ published: boolean; url: string | null }>({
    queryKey: ['landing-page-status', currentBrandId],
    queryFn: () => api.get('/v1/admin/landing-pages/status').then(r => r.data),
    enabled: !entitlementLoading && !entitled,
  })

  const decision = landingAccessDecision({
    canAccessGate: canAccess('admin', staff),
    entitled,
    entitlementLoading,
    // A network/server error on the status fetch leaves `statusData`
    // undefined; defaulting to `false` here fails CLOSED (the ordinary
    // redirect, same as before this fix) rather than open into a screen
    // this tenant may not actually have anything published for.
    published: statusData?.published ?? false,
    publishedLoading: statusLoading,
  })

  if (decision === 'wait') {
    return (
      <div className="flex items-center justify-center py-24 text-t-secondary">
        <Loader2 size={18} className="animate-spin mr-2" />
        {t('landing_pages.loading', 'Preparing your page…')}
      </div>
    )
  }

  if (decision === 'redirect') {
    return <Navigate to="/" replace />
  }

  if (decision === 'teardown') {
    return (
      <BrandRequired feature={t('landing_pages.brand_required', 'your landing page')}>
        <LandingTeardown url={statusData?.url ?? ''} />
      </BrandRequired>
    )
  }

  // decision === 'full' from here down — the wizard/editor flow, unchanged.

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-t-secondary">
        <Loader2 size={18} className="animate-spin mr-2" />
        {t('landing_pages.loading', 'Preparing your page…')}
      </div>
    )
  }

  if (error) {
    return (
      <QueryError
        onRetry={() => refetch()}
        message={t('landing_pages.load_error', 'Could not load your landing page.')}
      />
    )
  }

  if (data && showWizard(data.completed, doneForBrand, currentBrandId)) {
    // RULING 11: a structural guarantee alongside the wizard's own
    // render-time `formBrandId !== currentBrandId` reset (Task 6's fix
    // round 1) — a brand switch remounts the whole component from scratch
    // rather than relying on every future piece of step state being wired
    // into that reset by hand.
    return <LandingWizard key={currentBrandId ?? 'org'} prefill={data} onDone={() => setDoneForBrand(brandToken(currentBrandId))} />
  }

  // A landing page belongs to a single brand (Phase 1's BelongsToBrand),
  // so — unlike the wizard, which can still resolve a default brand for a
  // page that does not exist yet — the editor needs one brand selected
  // before it opens.
  //
  // Task 8: `key={currentBrandId ?? 'org'}` forces a full remount on brand
  // switch, the same structural guarantee RULING 11 gave the wizard above.
  // Unlike the wizard, the editor keeps no draft to restore across a
  // switch, so a remount is the whole story — there is nothing brand B
  // should inherit from brand A's in-progress, unsaved edits.
  //
  // `sections` hands down the SAME onboarding response the wizard branch
  // above reads (`data`), not a second fetch: neither `show` nor the
  // sections endpoint carries a label, a source or an availability count
  // for any section — only `LandingOnboardingService::sections()` does,
  // and it is the identical `PageContent` resolution the wizard's own
  // step 4 gates on (RULING 4). Reusing it here, rather than a
  // second/editor-only computation, is what keeps the wizard and the
  // editor unable to disagree about which sections are real.
  return (
    <BrandRequired feature={t('landing_pages.brand_required', 'your landing page')}>
      <LandingEditor key={currentBrandId ?? 'org'} sections={data?.sections ?? []} />
    </BrandRequired>
  )
}
