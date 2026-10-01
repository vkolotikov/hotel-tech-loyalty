import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { SubscriptionData } from '../hooks/useSubscription'

/**
 * The full admin's ways into HexaTech Appointments: a menu item in the
 * Bookings group, under "Services", and a button on the two service-booking
 * pages. Both appear only for staff of an organisation that has the
 * workspace and at least one active service (`workspaces.appointments`
 * from /auth/me). Rendered to a string, like Layout.landingSidebar.test.tsx,
 * whose harness this follows.
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

type Workspaces = { appointments?: { landing?: boolean; has_services?: boolean } } | undefined
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
const { OpenInAppointments } = await import('./OpenInAppointments')

const subscription: SubscriptionData = {
  active: true,
  status: 'ACTIVE',
  plan: { name: 'Enterprise', slug: 'enterprise' },
  features: { ai_insights: 'true', engagement: 'true', chatbot: 'true', campaigns: 'true', time_management: 'true', brands: 'true', landing_pages: 'true' },
  products: ['crm', 'chat', 'loyalty', 'booking'],
  billingAvailable: true,
}

function sidebar(workspaces: Workspaces): string {
  auth.state.user.workspaces = workspaces
  const qc = new QueryClient()
  qc.setQueryData(['subscription-status'], subscription)
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/']}>
        <Layout><div /></Layout>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function button(workspaces: Workspaces): string {
  auth.state.user.workspaces = workspaces
  return renderToStaticMarkup(<MemoryRouter><OpenInAppointments /></MemoryRouter>)
}

const ON = { appointments: { landing: false, has_services: true } }

describe('the full admin menu', () => {
  it('lists HexaTech Appointments in Bookings, right under Services, for a venue that can book', () => {
    const html = sidebar(ON)
    expect(html).toContain('href="/appointments"')
    expect(html).toContain('HexaTech Appointments')
    expect(html.indexOf('href="/service-bookings"')).toBeLessThan(html.indexOf('href="/appointments"'))
    expect(html.indexOf('href="/appointments"')).toBeLessThan(html.indexOf('href="/booking-rooms"'))
  })

  it('leaves it out where nothing can be booked, and where the workspace is switched off', () => {
    expect(sidebar({ appointments: { landing: false, has_services: false } })).not.toContain('href="/appointments"')
    expect(sidebar(undefined)).not.toContain('href="/appointments"')
  })
})

describe('OpenInAppointments', () => {
  it('opens the workspace from the service-booking pages', () => {
    const html = button(ON)
    expect(html).toContain('href="/appointments"')
    expect(html).toContain('Open in HexaTech Appointments')
  })

  it('is not there when the workspace is not', () => {
    expect(button({ appointments: { landing: false, has_services: false } })).toBe('')
    expect(button(undefined)).toBe('')
  })
})
