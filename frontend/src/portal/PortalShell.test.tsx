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

  it('links to Book when the venue takes appointments or sells stays, and not otherwise', () => {
    expect(render(withCaps({ services: true, stays: false }))).toContain('href="/portal/book"')
    expect(render(withCaps({ services: false, stays: true }))).toContain('href="/portal/book"')
    expect(render(withCaps({ services: false, stays: false }))).not.toContain('href="/portal/book"')
  })

  it('never shows more than one Book item', () => {
    const html = render(withCaps({ services: true, stays: true }))
    expect(html.match(/href="\/portal\/book"/g)?.length).toBe(2) // the tab bar and the phone bar
    expect(html).toContain('grid-cols-5')
  })

  it('lays five items out in five columns on phones', () => {
    expect(render(withCaps({ services: true, loyalty: true }))).toContain('grid-cols-5')
  })

  it('badges the bookings tab with the upcoming count', () => {
    expect(render(base)).toMatch(/href="\/portal\/bookings"[\s\S]*?>2</)
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
