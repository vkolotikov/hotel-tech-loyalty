import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PortalContext, type PortalContextValue } from '../PortalProvider'
import { BookingSheet } from './BookingSheet'
import type { PortalBooking, PortalBootstrap } from '../lib/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, fallback?: string | Record<string, unknown>, opts?: Record<string, unknown>) => {
      const vars = typeof fallback === 'object' ? fallback : opts
      let text = typeof fallback === 'string' ? fallback : k
      for (const [key, v] of Object.entries(vars ?? {})) text = text.replace(`{{${key}}}`, String(v))
      return text
    },
    i18n: { language: 'en' },
  }),
}))
// The booking is always seeded straight into the query cache (see `render` below); the real call stays
// never-resolving so a test that forgets to seed fails on a missing assertion, not a stray network call.
vi.mock('../lib/portalApi', () => ({ portalApi: { booking: () => new Promise(() => {}) } }))

const data: PortalBootstrap = {
  venue: { name: 'Numa', logo_url: null, industry: 'beauty', currency: 'EUR', timezone: 'Europe/Riga', contact: { email: null, phone: null },
    accent: { hex: '#b04a6e', ink: '#ffffff', deep: '#8e3b58', dark_hex: '#e38ab0', dark_ink: '#1a0b12', dark_deep: '#f0b4cd' }, display_face: 'cormorant' },
  capabilities: { loyalty: true, services: true, stays: false, chat: false, payments: { services: false, stays: false, publishable_key: null } },
  policies: { services_cancel_hours: 24, booking_cancel_hours: 48, services_cancellation_policy: '' },
  member: null, counts: { unread_notifications: 0, upcoming_bookings: 1 },
}

const booking: PortalBooking = {
  kind: 'service', id: 7, reference: 'SVC-ABC12345', title: 'Facial', subtitle: 'Mara', starts_at: '2026-10-03T07:30:00Z', ends_at: '2026-10-03T08:15:00Z',
  status: 'confirmed', payment_status: 'paid', total: 60, currency: 'EUR', discount: null, can_cancel: true, cancel_deadline: null,
  notes: null, party_size: 1, guests: null, nights: null,
}

function render(client: QueryClient) {
  const value: PortalContextValue = { data, isLoading: false, isError: false, error: null, refetch: () => {} }
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter><PortalContext.Provider value={value}><BookingSheet kind="service" id={7} onClose={() => {}} /></PortalContext.Provider></MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('BookingSheet', () => {
  it('offers "Add to calendar" once the booking has loaded', () => {
    const client = new QueryClient()
    client.setQueryData(['portal-booking', 'service', 7], booking)
    const html = render(client)
    expect(html).toContain('Add to calendar')
  })

  it('does not offer it while the booking is still loading', () => {
    const html = render(new QueryClient())
    expect(html).not.toContain('Add to calendar')
  })

  it('does not offer it for a cancelled booking (minor finding, fix round 1)', () => {
    const client = new QueryClient()
    client.setQueryData(['portal-booking', 'service', 7], { ...booking, status: 'cancelled' })
    const html = render(client)
    expect(html).not.toContain('Add to calendar')
  })
})
