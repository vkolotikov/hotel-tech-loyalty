import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PortalContext, type PortalContextValue } from '../PortalProvider'
import { BookingSheet } from './BookingSheet'
import type { BookingKind, PortalBooking, PortalBootstrap } from '../lib/types'

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
// The booking is always seeded straight into the query cache (see `render` below); the real calls stay
// never-resolving so a test that forgets to seed fails on a missing assertion, not a stray network call.
vi.mock('../lib/portalApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/portalApi')>('../lib/portalApi')
  const never = () => new Promise(() => {})
  return { ...actual, portalApi: { ...actual.portalApi, booking: never, cancelBooking: never } }
})

const data: PortalBootstrap = {
  venue: { name: 'Numa', logo_url: null, industry: 'beauty', currency: 'EUR', timezone: 'Europe/Riga', contact: { email: null, phone: null },
    accent: { hex: '#b04a6e', ink: '#ffffff', deep: '#8e3b58', dark_hex: '#e38ab0', dark_ink: '#1a0b12', dark_deep: '#f0b4cd' }, display_face: 'cormorant' },
  capabilities: { loyalty: true, services: true, stays: false, chat: false, payments: { services: false, stays: false, publishable_key: null } },
  policies: { services_cancel_hours: 24, booking_cancel_hours: 48, services_cancellation_policy: '', booking_cancellation_policy: '', check_in_time: '15:00', check_out_time: '11:00' },
  member: null, counts: { unread_notifications: 0, upcoming_bookings: 1 },
}

const booking: PortalBooking = {
  kind: 'service', id: 7, reference: 'SVC-ABC12345', title: 'Facial', subtitle: 'Mara', starts_at: '2026-10-03T07:30:00Z', ends_at: '2026-10-03T08:15:00Z',
  status: 'confirmed', payment_status: 'paid', total: 60, currency: 'EUR', discount: null, can_cancel: true, cancel_deadline: '2026-10-02T07:30:00Z',
  notes: null, party_size: 1, guests: null, nights: null, paid_online: true,
}

const stayBooking: PortalBooking = {
  ...booking, kind: 'stay', id: 9, reference: 'BK-STAY1234', title: 'Sea view', subtitle: null,
  starts_at: '2026-10-10', ends_at: '2026-10-12', party_size: null, guests: 2, nights: 2,
}

// The fixtures are dated early October 2026 and the sheet compares the cancel deadline with the clock: the clock is
// pinned before that deadline (the cancellation test began failing on its own once 2 October 2026 had passed).
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-01T09:00:00Z'))
})
afterAll(() => {
  vi.useRealTimers()
})

function render(client: QueryClient, bootstrap: PortalBootstrap = data, kind: BookingKind = 'service') {
  const value: PortalContextValue = { data: bootstrap, isLoading: false, isError: false, error: null, refetch: () => {} }
  const id = kind === 'stay' ? 9 : 7
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter><PortalContext.Provider value={value}><BookingSheet kind={kind} id={id} onClose={() => {}} /></PortalContext.Provider></MemoryRouter>
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

  it('does not offer it for a cancelled booking', () => {
    const client = new QueryClient()
    client.setQueryData(['portal-booking', 'service', 7], { ...booking, status: 'cancelled' })
    const html = render(client)
    expect(html).not.toContain('Add to calendar')
  })

  it('offers cancellation for a booking the server says can be cancelled', () => {
    const client = new QueryClient()
    client.setQueryData(['portal-booking', 'service', 7], booking)
    const html = render(client)
    expect(html).toContain('Cancel booking')
    expect(html).not.toContain('To change or cancel, contact')
  })

  it('points to the venue instead when it cannot', () => {
    const client = new QueryClient()
    client.setQueryData(['portal-booking', 'service', 7], { ...booking, can_cancel: false, cancel_deadline: null })
    const html = render(client)
    expect(html).not.toContain('Cancel booking')
    expect(html).toContain('To change or cancel, contact Numa.')
  })

  it('shows the services\' own policy for an appointment, not the stay\'s', () => {
    const client = new QueryClient()
    client.setQueryData(['portal-booking', 'service', 7], booking)
    const html = render(client, { ...data, policies: { ...data.policies, services_cancellation_policy: 'Appointments: a day ahead.', booking_cancellation_policy: 'Stays: two days ahead.' } })
    expect(html).toContain('Appointments: a day ahead.')
    expect(html).not.toContain('Stays: two days ahead.')
  })

  // The test above only ever renders kind="service", so it never exercises the
  // booking_cancellation_policy branch — this one does.
  it('shows the stay\'s own cancellation policy for a stay booking, not the services\' one', () => {
    const client = new QueryClient()
    client.setQueryData(['portal-booking', 'stay', 9], stayBooking)
    const html = render(client, { ...data, policies: { ...data.policies, services_cancellation_policy: 'Appointments: a day ahead.', booking_cancellation_policy: 'Stays: two days ahead.' } }, 'stay')
    expect(html).toContain('Stays: two days ahead.')
    expect(html).not.toContain('Appointments: a day ahead.')
  })
})
