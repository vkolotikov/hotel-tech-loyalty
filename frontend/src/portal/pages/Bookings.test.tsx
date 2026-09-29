import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { PortalContext, type PortalContextValue } from '../PortalProvider'
import { BookingRow, bookingPaymentLabel, paymentLabel, statusTone } from './BookingRow'
import { Bookings } from './Bookings'
import type { Paginated, PortalBooking, PortalBootstrap } from '../lib/types'

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
// The Bookings-page tests below only ever seed `['portal-bookings', ...]`/`['portal-booking', ...]`
// through the query cache (see `renderBookingsPage`); the real calls stay never-resolving, same as
// `Home.test.tsx`'s `bookings` stub, so nothing here dispatches a real network request.
vi.mock('../lib/portalApi', () => ({
  portalApi: { bookings: () => new Promise(() => {}), booking: () => new Promise(() => {}) },
}))

const data = {
  venue: { timezone: 'Europe/Riga', name: 'Numa', industry: 'beauty', currency: 'EUR', logo_url: null, contact: { email: null, phone: null },
    accent: { hex: '#b04a6e', ink: '#ffffff', deep: '#8e3b58', dark_hex: '#e38ab0', dark_ink: '#1a0b12', dark_deep: '#f0b4cd' }, display_face: 'cormorant' },
  capabilities: { loyalty: true, services: true, stays: false, chat: true, payments: { services: false, stays: false, publishable_key: null } },
  policies: { services_cancel_hours: 24, booking_cancel_hours: 48, services_cancellation_policy: '', booking_cancellation_policy: '', check_in_time: '15:00', check_out_time: '11:00' },
  member: null, counts: { unread_notifications: 0, upcoming_bookings: 1 },
} as PortalBootstrap

const service: PortalBooking = {
  kind: 'service', id: 7, reference: 'SVC-ABC12345', title: 'Facial', subtitle: 'Mara', starts_at: '2026-10-03T07:30:00Z', ends_at: '2026-10-03T08:15:00Z',
  status: 'confirmed', payment_status: 'unpaid', total: 60, currency: 'EUR', discount: null, can_cancel: false, cancel_deadline: null,
  notes: null, party_size: 1, guests: null, nights: null, paid_online: false,
}
const stay: PortalBooking = { ...service, kind: 'stay', id: 9, reference: 'BK-1', title: 'Sea view', subtitle: null, starts_at: '2026-10-10', ends_at: '2026-10-12', total: 240, status: 'cancelled', guests: 2, nights: 2 }

function render(b: PortalBooking) {
  const value: PortalContextValue = { data, isLoading: false, isError: false, error: null, refetch: () => {} }
  return renderToStaticMarkup(<MemoryRouter><PortalContext.Provider value={value}><BookingRow booking={b} onOpen={() => {}} /></PortalContext.Provider></MemoryRouter>)
}

describe('BookingRow', () => {
  it('renders an appointment in the venue timezone with its price and status', () => {
    const html = render(service)
    expect(html).toContain('Facial')
    expect(html).toContain('10:30')
    expect(html).toContain('€60.00')
    expect(html).toContain('Confirmed')
  })
  it('renders a stay as calendar dates with nights and guests', () => {
    const html = render(stay)
    expect(html).toContain('10 Oct 2026')
    expect(html).toContain('2 nights · 2 guests')
    expect(html).toContain('Cancelled')
  })
  it('maps statuses to tones', () => {
    expect(statusTone('confirmed')).toBe('success')
    expect(statusTone('pending')).toBe('warning')
    expect(statusTone('cancelled')).toBe('danger')
    expect(statusTone('completed')).toBe('neutral')
  })
  it('translates a known payment status and hides an unknown one', () => {
    const { t } = useTranslation()
    expect(paymentLabel('disputed', t)).toBe('Payment under review')
    expect(paymentLabel('weird', t)).toBeNull()
  })
  // A stay paid at the venue is stored `open` in payment_status (an appointment's equivalent is
  // `unpaid`) — both must read "Pay at the venue", and neither once the booking is cancelled, since
  // nothing was or will be paid.
  it('names a stay paid at the venue like an appointment, and drops the row once an unpaid booking is cancelled', () => {
    const { t } = useTranslation()
    const openStay = { ...stay, status: 'confirmed', payment_status: 'open', paid_online: false }
    expect(bookingPaymentLabel(openStay, t)).toBe('Pay at the venue')
    expect(bookingPaymentLabel(service, t)).toBe('Pay at the venue')
    expect(bookingPaymentLabel({ ...openStay, status: 'cancelled' }, t)).toBeNull()
    expect(bookingPaymentLabel({ ...service, status: 'cancelled' }, t)).toBeNull()
    // Money that moved is still shown on a cancelled booking.
    expect(bookingPaymentLabel({ ...openStay, status: 'cancelled', payment_status: 'refunded', paid_online: true }, t)).toBe('Refunded')
    expect(bookingPaymentLabel({ ...openStay, payment_status: 'paid', paid_online: true }, t)).toBe('Paid')
  })
})

/** Routed like the real app (`bookings/:kind/:id` mounts the same `<Bookings>`, not a separate detail
 *  page), so `useParams` actually reads `kind`/`id` off the path. */
function renderBookingsPage(path: string, seed?: (c: QueryClient) => void) {
  const client = new QueryClient()
  seed?.(client)
  const value: PortalContextValue = { data, isLoading: false, isError: false, error: null, refetch: () => {} }
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <PortalContext.Provider value={value}>
          <Routes>
            <Route path="/portal/bookings" element={<Bookings />} />
            <Route path="/portal/bookings/:kind/:id" element={<Bookings />} />
          </Routes>
        </PortalContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// `Bookings.tsx` drops `?confirmed=1` from the address bar in a `useEffect` once the banner has something
// to show, keeping the banner visible for the rest of that mount via `showConfirmedBanner` local state — so
// a reload or Back (which land on the now-stripped URL) don't show it again. `renderToStaticMarkup` never
// runs that effect, so the `navigate(..., { replace: true })` call itself isn't exercised here; what IS
// exercised, in the second test below, is the actual observable behaviour after that navigation has
// happened — a mount with no `confirmed` param renders no banner, regardless of what's loaded.
describe('Bookings — confirmation banner', () => {
  it('shows "You\'re booked" with the reference once the list contains the just-confirmed booking', () => {
    const html = renderBookingsPage('/portal/bookings/service/7?confirmed=1', c => {
      const page: Paginated<PortalBooking> = { data: [service], meta: { scope: 'upcoming', page: 1, per_page: 20, total: 1 } }
      c.setQueryData(['portal-bookings', 'upcoming', 1], page)
    })
    expect(html).toContain("You&#x27;re booked")
    expect(html).toContain('SVC-ABC12345')
  })

  it('does not show the banner without ?confirmed=1, even with the same booking loaded', () => {
    const html = renderBookingsPage('/portal/bookings/service/7', c => {
      const page: Paginated<PortalBooking> = { data: [service], meta: { scope: 'upcoming', page: 1, per_page: 20, total: 1 } }
      c.setQueryData(['portal-bookings', 'upcoming', 1], page)
    })
    expect(html).not.toContain("You&#x27;re booked")
  })

  it('does not show the banner on the plain list, with no :kind/:id in the URL at all', () => {
    const html = renderBookingsPage('/portal/bookings', c => {
      const page: Paginated<PortalBooking> = { data: [service], meta: { scope: 'upcoming', page: 1, per_page: 20, total: 1 } }
      c.setQueryData(['portal-bookings', 'upcoming', 1], page)
    })
    expect(html).not.toContain("You&#x27;re booked")
  })
})
