import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { SubscriptionData } from '../hooks/useSubscription'

/**
 * The full admin's way into HexaTech Loyalty (spec 2026-10-21 §6.7): the first item of "Members & Loyalty", above
 * Members and the hubs that stay, for staff of an organisation that has the workspace (`workspaces.loyalty` from
 * /auth/me). Rendered to a string with the harness of Layout.appointmentsLink.test.tsx.
 */

// Layout reads localStorage unguarded on its first render; node has none.
const memoryStorage = new Map<string, string>()
;(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => (memoryStorage.has(k) ? (memoryStorage.get(k) as string) : null),
  setItem: (k: string, v: string) => { memoryStorage.set(k, String(v)) },
  removeItem: (k: string) => { memoryStorage.delete(k) },
  clear: () => memoryStorage.clear(),
  key: (i: number) => Array.from(memoryStorage.keys())[i] ?? null,
  get length() { return memoryStorage.size },
} as Storage

vi.mock('../lib/api', () => ({
  api: {
    get: () => new Promise(() => {}),
    post: () => new Promise(() => {}),
  },
  resolveImage: (url: string | null | undefined) => url ?? null,
  API_BASE: 'http://mock.test/api',
  API_URL: 'http://mock.test',
  APP_BASE: '',
}))

type Workspaces = { appointments?: { landing?: boolean; has_services?: boolean }; loyalty?: { landing?: boolean } } | undefined
const auth = vi.hoisted(() => ({
  state: {
    user: { id: 1, name: 'Ada Lovelace', email: 'ada@example.test', user_type: 'staff', industry: 'beauty' as const, workspaces: undefined as Workspaces },
    staff: {
      role: 'manager', hotel_name: 'Test Salon', can_award_points: true, can_redeem_points: true,
      can_manage_offers: true, can_view_analytics: true, allowed_nav_groups: null,
    },
  },
}))
vi.mock('../stores/authStore', () => ({
  useAuthStore: (selector?: (s: typeof auth.state) => unknown) => (selector ? selector(auth.state) : auth.state),
}))

vi.mock('../stores/brandStore', () => {
  const state = {
    brands: [] as unknown[], currentBrandId: null, loading: false,
    setBrands: () => {}, setCurrentBrand: () => {}, brandCount: () => 0, currentBrand: () => null,
  }
  return { useBrandStore: (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state) }
})

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, defaultValueOrOpts?: unknown) => (typeof defaultValueOrOpts === 'string' ? defaultValueOrOpts : key),
    i18n: { language: 'en', resolvedLanguage: 'en', changeLanguage: () => Promise.resolve() },
  }),
}))

const { Layout } = await import('./Layout')

const subscription: SubscriptionData = {
  active: true,
  status: 'ACTIVE',
  plan: { name: 'Enterprise', slug: 'enterprise' },
  features: { ai_insights: 'true', engagement: 'true', chatbot: 'true', campaigns: 'true', time_management: 'true', brands: 'true', landing_pages: 'true' },
  products: ['crm', 'chat', 'loyalty', 'booking'],
  billingAvailable: true,
}

function sidebar(workspaces: Workspaces, me?: { workspaces?: Workspaces }): string {
  auth.state.user.workspaces = workspaces
  const qc = new QueryClient()
  qc.setQueryData(['subscription-status'], subscription)
  if (me) qc.setQueryData(['auth-me'], me)
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/']}>
        <Layout><div /></Layout>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const ON = { loyalty: { landing: false } }

describe('the full admin menu', () => {
  it('lists HexaTech Loyalty first in Members & Loyalty, above Members', () => {
    const html = sidebar(ON)
    expect(html).toContain('href="/loyalty"')
    expect(html).toContain('HexaTech Loyalty')
    expect(html.indexOf('href="/loyalty"')).toBeLessThan(html.indexOf('href="/members"'))
  })

  it('leaves it out where the workspace is switched off, and follows the fresh /auth/me answer', () => {
    expect(sidebar(undefined)).not.toContain('href="/loyalty"')
    expect(sidebar(undefined, { workspaces: ON })).toContain('href="/loyalty"')
    expect(sidebar(ON, {})).not.toContain('href="/loyalty"')
  })

  it('is not there for an organisation without the loyalty product', () => {
    const before = subscription.products
    subscription.products = ['crm', 'chat', 'booking']
    try {
      expect(sidebar(ON)).not.toContain('href="/loyalty"')
    } finally {
      subscription.products = before
    }
  })
})
