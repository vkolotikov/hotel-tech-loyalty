import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { PortalContext, type PortalContextValue } from './PortalProvider'
import { PortalShell } from './PortalShell'
import type { PortalBootstrap } from './lib/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, fallback?: string) => fallback ?? _k, i18n: { language: 'en' } }),
}))
vi.mock('../stores/authStore', () => ({
  useAuthStore: () => ({ user: { id: 1, name: 'Ada Lovelace', email: 'ada@example.test', user_type: 'member' }, token: 't' }),
}))
vi.mock('../lib/logout', () => ({ logoutAndRedirect: vi.fn() }))

const base: PortalBootstrap = {
  venue: {
    name: 'Numa Skin Lab', logo_url: null, industry: 'beauty', currency: 'EUR', timezone: 'Europe/Riga',
    contact: { email: null, phone: null },
    accent: { hex: '#b04a6e', ink: '#ffffff', deep: '#8e3b58', dark_hex: '#e38ab0', dark_ink: '#1a0b12', dark_deep: '#f0b4cd' },
    display_face: 'cormorant',
  },
  capabilities: { loyalty: true, services: true, stays: false, chat: true, payments: { services: false, stays: false, publishable_key: null } },
  policies: { services_cancel_hours: 24, booking_cancel_hours: 48, services_cancellation_policy: '', booking_cancellation_policy: '', check_in_time: '15:00', check_out_time: '11:00' },
  member: null,
  counts: { unread_notifications: 0, upcoming_bookings: 2 },
}

function withCaps(overrides: Partial<PortalBootstrap['capabilities']>): PortalBootstrap {
  return { ...base, capabilities: { ...base.capabilities, ...overrides } }
}

function render(data: PortalBootstrap) {
  const value: PortalContextValue = { data, isLoading: false, isError: false, error: null, refetch: () => {} }
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/portal']}>
      <PortalContext.Provider value={value}>
        <PortalShell><p>page</p></PortalShell>
      </PortalContext.Provider>
    </MemoryRouter>,
  )
}

function renderWith(value: PortalContextValue) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/portal']}>
      <PortalContext.Provider value={value}>
        <PortalShell><p>page</p></PortalShell>
      </PortalContext.Provider>
    </MemoryRouter>,
  )
}

describe('PortalShell', () => {
  it('is the token scope and names the venue', () => {
    const html = render(base)
    expect(html).toContain('data-portal=""')
    expect(html).toContain('Numa Skin Lab')
    expect(html).toContain('page')
  })

  it('shows Rewards only for a loyalty venue', () => {
    expect(render(base)).toContain('href="/portal/rewards"')
    expect(render({ ...base, capabilities: { ...base.capabilities, loyalty: false } })).not.toContain('href="/portal/rewards"')
  })

  it('keeps booking creation within Home and Bookings instead of adding a fifth primary destination', () => {
    for (const caps of [{ services: true }, { stays: true }, { services: false, stays: false }]) {
      expect(render(withCaps(caps))).not.toContain('href="/portal/book"')
    }
  })

  it('holds the same four destinations on desktop and mobile', () => {
    const html = render(withCaps({ services: true, stays: true }))
    expect(html.match(/href="\/portal\/bookings"/g)?.length).toBe(2)
    expect(html).toContain('grid-cols-4')
  })

  it('uses three columns where Rewards is unavailable', () => {
    expect(render(withCaps({ loyalty: false }))).toContain('grid-cols-3')
  })

  it('keeps navigation free of duplicate booking counters', () => {
    expect(render(base)).toContain('href="/portal/bookings"')
  })

  // Release 4, part A: the inbox is the bell in the header, with the unread count on it.
  const withMember = (unread: number): PortalBootstrap => ({
    ...base, member: { member_number: 'HL-1' } as PortalBootstrap['member'], counts: { unread_notifications: unread, upcoming_bookings: 2 },
  })

  it('puts the inbox bell in the header for a member, badged with the unread count', () => {
    const html = render(withMember(3))
    expect(html).toContain('aria-label="Updates"')
    expect(html).toMatch(/data-inbox-badge=""[^>]*>3</)
    expect(html).toContain('My card')
  })

  it('shows the bell without a badge when nothing is unread, and 99+ past ninety-nine', () => {
    expect(render(withMember(0))).not.toContain('data-inbox-badge')
    expect(render(withMember(250))).toMatch(/data-inbox-badge=""[^>]*>99\+</)
  })

  it('has no inbox without a membership row, whose endpoints answer members only', () => {
    expect(render({ ...base, counts: { unread_notifications: 4, upcoming_bookings: 0 } })).not.toContain('aria-label="Updates"')
  })

  it('keeps four phone destinations with Updates in the header', () => {
    const html = render({ ...withMember(1), capabilities: { ...base.capabilities, services: true, loyalty: true } })
    expect(html).toContain('grid-cols-4')
  })

  it('blocks with the error notice and no page when there is no cached data', () => {
    const html = renderWith({ data: undefined, isLoading: false, isError: true, error: null, refetch: () => {} })
    expect(html).toContain('Something went wrong. Please try again.')
    expect(html).not.toContain('>page<')
  })

  it('keeps the page up with a non-blocking notice when a background refetch fails but data is cached', () => {
    const html = renderWith({ data: base, isLoading: false, isError: true, error: null, refetch: () => {} })
    expect(html).toContain('>page<')
    expect(html).toContain('Something went wrong. Please try again.')
  })

  it('still blocks a portal switched off for the venue even with cached data', () => {
    const error = { response: { status: 403, data: { error: 'portal_disabled' } } }
    const html = renderWith({ data: base, isLoading: false, isError: true, error, refetch: () => {} })
    expect(html).toContain('The member portal is switched off for this venue. Please contact them directly.')
    expect(html).not.toContain('>page<')
  })
})
