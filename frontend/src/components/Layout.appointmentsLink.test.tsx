import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { SubscriptionData } from '../hooks/useSubscription'

/**
 * The full admin's ways into HexaTech Appointments: a menu item that is the
 * first one in the Bookings group (owner, 2026-10-11; there is no button in
 * the top bar any more), and a button on the two service-booking pages. Both
 * appear only for staff of an organisation that has the workspace
 * (`workspaces.appointments` from /auth/me). Rendered to a string, like
 * Layout.landingSidebar.test.tsx, whose harness this follows.
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

function button(workspaces: Workspaces): string {
  auth.state.user.workspaces = workspaces
  return renderToStaticMarkup(<MemoryRouter><OpenInAppointments /></MemoryRouter>)
}

const ON = { appointments: { landing: false, has_services: true } }

describe('the full admin menu', () => {
  // Owner, 2026-10-11: the way in lives in the left panel only, and it leads the Bookings group.
  it('lists HexaTech Appointments first in Bookings, above Reservations and Services, for a venue that can book', () => {
    const html = sidebar(ON)
    expect(html).toContain('href="/appointments"')
    expect(html).toContain('HexaTech Appointments')
    const appointments = html.indexOf('href="/appointments"')
    const reservations = html.indexOf('href="/bookings"')
    const services = html.indexOf('href="/service-bookings"')
    expect(reservations).toBeGreaterThan(-1)
    expect(services).toBeGreaterThan(-1)
    expect(appointments).toBeLessThan(reservations)
    expect(appointments).toBeLessThan(services)
  })

  it('lists it for a venue with no services yet (owner, 2026-10-06: Setup is where the first one is added)', () => {
    expect(sidebar({ appointments: { landing: false, has_services: false } })).toContain('href="/appointments"')
  })

  it('leaves it out where the workspace is switched off', () => {
    expect(sidebar(undefined)).not.toContain('href="/appointments"')
  })

  // Polish review: the item follows the menu's own rules, not only "the venue has services".
  it('is not there for a staff member whose manager limited their menu to other groups', () => {
    const before = auth.state.staff
    auth.state.staff = { ...before, role: 'staff', allowed_nav_groups: ['Loyalty'] as unknown as null }
    try {
      expect(sidebar(ON)).not.toContain('href="/appointments"')
    } finally {
      auth.state.staff = before
    }
  })

  // Owner, 2026-10-07: "I still don't see it". A session signed in before the workspace existed keeps the user it
  // signed in with; the full admin follows the server's answer now (/v1/auth/me), not the stored one.
  it('follows the fresh /auth/me answer over a session signed in before the workspace existed', () => {
    const html = sidebar(undefined, { workspaces: { appointments: { landing: false, has_services: false } } })
    expect(html).toContain('href="/appointments"')
  })

  it('hides it once the server says the workspace is switched off, whatever the stored session says', () => {
    expect(sidebar(ON, {})).not.toContain('href="/appointments"')
  })

  it('is not there for an organisation without the booking product', () => {
    const before = subscription.products
    subscription.products = ['crm', 'chat', 'loyalty']
    try {
      expect(sidebar(ON)).not.toContain('href="/appointments"')
    } finally {
      subscription.products = before
    }
  })
})

describe('the full admin top bar', () => {
  // The owner asked for the way in to live in the left panel only (2026-10-11): the button the top bar carried since
  // 2026-10-06 is gone, for a venue that can book and for one with no services yet.
  it('no longer carries a HexaTech Appointments button, for a venue that can book', () => {
    const html = sidebar(ON)
    const start = html.indexOf('<header')
    const header = html.slice(start, html.indexOf('</header>'))
    expect(start).toBeGreaterThan(-1)
    expect(header.length).toBeGreaterThan(0)
    expect(header).not.toContain('href="/appointments"')
    expect(header).not.toContain('HexaTech Appointments')
    expect(html).not.toContain('data-topbar-appointments')
  })

  it('has none for a venue with no services yet either, while the menu item stays', () => {
    const html = sidebar({ appointments: { landing: false, has_services: false } })
    const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'))
    expect(header).not.toContain('href="/appointments"')
    expect(html).not.toContain('data-topbar-appointments')
    expect(html).toContain('href="/appointments"')
  })
})

describe('OpenInAppointments', () => {
  it('opens the workspace from the service-booking pages', () => {
    const html = button(ON)
    expect(html).toContain('href="/appointments"')
    expect(html).toContain('Open in HexaTech Appointments')
  })

  it('is there with no services yet, and not when the workspace is not', () => {
    expect(button({ appointments: { landing: false, has_services: false } })).toContain('href="/appointments"')
    expect(button(undefined)).toBe('')
  })
})
