import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { SubscriptionData } from '../hooks/useSubscription'

/**
 * The RENDERER half of Task 11 / M2, which `landingAccess.test.ts` cannot
 * cover: that file locks `landingNavTreatment`'s decision map (pure
 * function), but the map only decides what an item is TAGGED with
 * (`_lapsed` / `_locked`); a second, un-tested site in Layout.tsx turns
 * those tags into either a real `<Link>` or a dead `<button>`:
 *
 *   const locked = !lapsed && '_locked' in it && it._locked === true
 *
 * Dropping the `!lapsed &&` guard (reverting to the pre-round-2 shape,
 * `'_locked' in it && it._locked === true`) is exactly the regression
 * `landingAccess.test.ts` cannot see: a downgraded-but-still-paying
 * tenant's `/landing-pages` item carries BOTH `_locked: true` (the
 * generic feature-gate map ran first) and `_lapsed: true` (the
 * landing-specific map ran second, per Layout.tsx's own docblock at the
 * `.map(item => { if (item.path !== '/landing-pages') ... })` site).
 * Un-guarded, `locked` reads true for that item too, and it renders as
 * the non-navigating `feature:locked` button instead of a `<Link
 * to="/landing-pages">` — losing the one in-product route left to the
 * Unpublish button for exactly the tenant `routes/api.php` carves
 * `unpublish` out of both gates to serve.
 *
 * A `<button>` rendered by the SAME code path for a genuinely-locked,
 * NON-landing item (here: Brands) is asserted alongside the `<Link>`, so
 * this doesn't just prove "everything becomes a link" — it proves the
 * split is `_lapsed`-specific, matching `landingNavTreatment`'s own
 * contract.
 *
 * Renders with `react-dom/server`'s `renderToStaticMarkup`, which needs
 * no DOM at all — `vitest.config.ts` stays `environment: 'node'`
 * (Layout.tsx's own comment near the `_lapsed` map says "vitest ...
 * cannot render this file"; that was true for jsdom + RTL interaction
 * tests, not for a one-shot server-render string). Only the network,
 * store and i18n modules are mocked below; every other child Layout
 * mounts (GlobalSearch, UpgradeFeatureModal, BrandSwitcher, LangSwitcher,
 * IndustryMismatchBanner, the *Banner components) render as themselves.
 */

// Layout.tsx's very first useState lazy initializer reads localStorage
// UNGUARDED (unlike every other localStorage/sessionStorage read in this
// component tree, which is wrapped in try/catch) — environment: 'node'
// has no such global at all, so this would throw ReferenceError before
// any mock module is even reached.
const memoryStorage = new Map<string, string>()
;(globalThis as any).localStorage = {
  getItem: (k: string) => (memoryStorage.has(k) ? (memoryStorage.get(k) as string) : null),
  setItem: (k: string, v: string) => { memoryStorage.set(k, String(v)) },
  removeItem: (k: string) => { memoryStorage.delete(k) },
  clear: () => memoryStorage.clear(),
  key: (i: number) => Array.from(memoryStorage.keys())[i] ?? null,
  get length() { return memoryStorage.size },
} as Storage

// --- network -----------------------------------------------------------
vi.mock('../lib/api', () => ({
  api: {
    get: () => new Promise(() => { /* never resolves inside a sync SSR pass */ }),
    post: () => new Promise(() => {}),
  },
  resolveImage: (url: string | null | undefined) => url ?? null,
  API_BASE: 'http://mock.test/api',
  API_URL: 'http://mock.test',
  APP_BASE: '',
}))

// --- store ---------------------------------------------------------------
vi.mock('../stores/authStore', () => {
  const state = {
    user: { id: 1, name: 'Ada Lovelace', email: 'ada@example.test', user_type: 'staff', industry: 'hotel' as const },
    staff: {
      role: 'manager',
      hotel_name: 'Test Hotel',
      can_award_points: true,
      can_redeem_points: true,
      can_manage_offers: true,
      can_view_analytics: true,
      allowed_nav_groups: null,
    },
  }
  return {
    useAuthStore: (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state),
  }
})

vi.mock('../stores/brandStore', () => {
  const state = {
    brands: [] as unknown[],
    currentBrandId: null,
    loading: false,
    setBrands: () => {},
    setCurrentBrand: () => {},
    brandCount: () => 0,
    currentBrand: () => null,
  }
  return {
    useBrandStore: (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state),
  }
})

// --- i18n ------------------------------------------------------------
vi.mock('react-i18next', () => ({
  // src/i18n/index.ts (imported transitively via LangSwitcher.tsx) calls
  // i18n.use(initReactI18next) as a side effect on module load — needs a
  // no-op plugin shape or i18next's `.use()` throws before this file's
  // own useTranslation mock is ever reached.
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, defaultValueOrOpts?: unknown, maybeOpts?: Record<string, unknown>) => {
      let defaultValue: string | undefined
      let opts: Record<string, unknown> | undefined
      if (typeof defaultValueOrOpts === 'string') {
        defaultValue = defaultValueOrOpts
        opts = maybeOpts
      } else if (defaultValueOrOpts && typeof defaultValueOrOpts === 'object') {
        opts = defaultValueOrOpts as Record<string, unknown>
        defaultValue = opts.defaultValue as string | undefined
      }
      let out = defaultValue ?? key
      if (opts) {
        for (const [k, v] of Object.entries(opts)) {
          if (k === 'defaultValue') continue
          out = out.split(`{{${k}}}`).join(String(v))
        }
      }
      return out
    },
    // LangSwitcher.tsx reads i18n.language / .resolvedLanguage directly.
    i18n: { language: 'en', resolvedLanguage: 'en', changeLanguage: () => Promise.resolve() },
  }),
}))

// Imported AFTER the mocks above so Layout.tsx (and everything it pulls
// in transitively — useVocabulary, useIndustryHiddenGroups/Items,
// useSubscription, GlobalSearch, UpgradeFeatureModal, BrandSwitcher,
// LangSwitcher, IndustryMismatchBanner, GraceWindowBanner) resolves the
// mocked modules rather than the real network/store/i18n code.
const { Layout } = await import('./Layout')

function subscriptionData(overrides: Partial<SubscriptionData>): SubscriptionData {
  return {
    active: true,
    status: 'ACTIVE',
    plan: { name: 'Enterprise', slug: 'enterprise' },
    features: {
      ai_insights: 'true', engagement: 'true', chatbot: 'true', campaigns: 'true',
      time_management: 'true', brands: 'true', landing_pages: 'true',
    },
    products: ['crm', 'chat', 'loyalty', 'booking'],
    billingAvailable: true,
    ...overrides,
  }
}

function renderSidebar(sub: SubscriptionData): string {
  // Priming the cache (rather than mocking useSubscription itself) means
  // the real hook — real hasFeature/hasProduct/landingEntitled wiring —
  // is what's under test. react-query's QueryObserver reads a primed
  // cache entry synchronously on construction, so `renderToStaticMarkup`
  // sees resolved data on its one and only render pass; nothing async
  // needs to be awaited.
  const qc = new QueryClient()
  qc.setQueryData(['subscription-status'], sub)

  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/']}>
        <Layout><div /></Layout>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Layout sidebar — landing nav renderer (Task 11 M2, round 2)', () => {
  it('gives the downgraded-but-still-paying tenant a real link to /landing-pages, while a control item locked on a DIFFERENT feature still renders the dead upgrade button', () => {
    const html = renderSidebar(subscriptionData({
      status: 'ACTIVE', // subscription itself is healthy — this is a plan downgrade, not a lapse
      features: {
        ai_insights: 'true', engagement: 'true', chatbot: 'true', campaigns: 'true',
        time_management: 'true',
        brands: 'false',        // control: a DIFFERENT feature, genuinely locked
        landing_pages: 'false', // this org's plan dropped landing_pages
      },
    }))

    // The defect: unpublish() stays reachable server-side for exactly
    // this tenant (routes/api.php), so the sidebar must keep a real,
    // navigable route to it.
    expect(html).toContain('href="/landing-pages"')

    // The landing item must NOT also render as a locked button (its
    // accessible name carries the item's own defaultLabel, "Landing
    // Page") — the two treatments are mutually exclusive per item.
    expect(html).not.toMatch(/<button[^>]*aria-label="[^"]*Landing Page[^"]*"[^>]*>/)

    // Control: Brands has no `_lapsed` carve-out anywhere in Layout.tsx,
    // so it must still be the un-navigable locked button — proving the
    // assertion above isn't just "every locked item became a link".
    expect(html).toMatch(/<button[^>]*aria-label="[^"]*Brands[^"]*"[^>]*>/)
    expect(html).not.toContain('href="/brands"')
  })

  it('control: a fully entitled tenant gets a plain, unlocked landing-pages link with no lock styling', () => {
    const html = renderSidebar(subscriptionData({}))

    expect(html).toContain('href="/landing-pages"')
    expect(html).not.toMatch(/<button[^>]*aria-label="[^"]*Landing Page[^"]*"[^>]*>/)
  })
})
