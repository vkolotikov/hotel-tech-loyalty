import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BookingDetail } from './BookingDetail'

vi.mock('../lib/api', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, fallback?: string | Record<string, unknown>, opts?: Record<string, unknown>) => {
      const vars = typeof fallback === 'object' ? fallback : opts
      let text = typeof fallback === 'string' ? fallback : String((fallback as Record<string, unknown> | undefined)?.defaultValue ?? k)
      for (const [key, v] of Object.entries(vars ?? {})) text = text.replace(`{{${key}}}`, String(v))
      return text
    },
    i18n: { language: 'en' },
  }),
}))

/**
 * Release 6, item 10: a room of a multi-room stay (one payment, carried by the lead room — GroupPayment) shows the
 * group's payment reference on every room, labelled as the group's; a single room shows its own exactly as before.
 */
const clients: QueryClient[] = []
const room = {
  id: 42, booking_reference: 'BK-102', reservation_id: 'R-102', booking_type: 'reservation', channel_name: 'Website',
  apartment_name: 'Garden', guest_name: 'Ada Lovelace', arrival_date: '2026-11-01', departure_date: '2026-11-03',
  adults: 2, children: 0, price_total: 160, price_paid: 160, payment_status: 'paid', payment_method: 'stripe',
  stripe_payment_intent_id: null, refunded_amount: 0, internal_status: 'confirmed', notes: [], submissions: [], price_elements: [],
}

function render(detail: Record<string, unknown>) {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } })
  clients.push(client)
  client.setQueryData(['booking-detail', String(detail.id)], detail)
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[`/bookings/${detail.id}`]}>
      <QueryClientProvider client={client}>
        <Routes><Route path="/bookings/:id" element={<BookingDetail />} /></Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}
afterEach(() => clients.splice(0).forEach(client => client.clear()))

describe('booking detail — the payment reference of a room group', () => {
  it("shows a following room the group's payment, carried by the lead room, with a link to it", () => {
    const html = render({ ...room, group_payment: { payment_intent_id: 'pi_group_1', lead_id: 41, is_lead: false, total: 360, rooms: [{ id: 41 }, { id: 42 }] } })
    expect(html).toContain('Group payment ID')
    expect(html).toContain('pi_group_1')
    expect(html).toContain('href="https://dashboard.stripe.com/payments/pi_group_1"')
    expect(html).toContain('carried by its lead room')
    expect(html).toContain('href="/bookings/41"')
  })

  it('tells the lead room it carries the one payment for every room', () => {
    const html = render({ ...room, id: 41, stripe_payment_intent_id: 'pi_group_1', group_payment: { payment_intent_id: 'pi_group_1', lead_id: 41, is_lead: true, total: 360, rooms: [{ id: 41 }, { id: 42 }] } })
    expect(html).toContain('Group payment ID')
    expect(html).toContain('pi_group_1')
    expect(html).toContain('One payment for all 2 rooms of this booking, carried by this room.')
    expect(html).not.toContain('href="/bookings/41"')
  })

  it('shows a single room its own payment as before', () => {
    const html = render({ ...room, id: 7, stripe_payment_intent_id: 'pi_single_1', group_payment: null })
    expect(html).toContain('Intent ID')
    expect(html).toContain('pi_single_1')
    expect(html).not.toContain('Group payment ID')
    expect(html).not.toContain('lead room')
  })
})
