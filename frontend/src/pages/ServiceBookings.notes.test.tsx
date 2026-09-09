import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BookingDetailDrawer } from './ServiceBookings'

vi.mock('../lib/api', () => ({ api: { get: vi.fn(), patch: vi.fn() } }))

const clients: QueryClient[] = []
const booking = {
  id: 1, booking_reference: 'SVC-TEST', service: null, master: null,
  customer_name: 'Test customer', customer_email: 'customer@example.test', customer_phone: null,
  party_size: 1, start_at: '2026-09-09T10:00:00Z', end_at: '2026-09-09T11:00:00Z',
  duration_minutes: 60, total_amount: 50, currency: 'EUR', status: 'confirmed', payment_status: 'paid',
}
function render(notes: string | null) {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } })
  clients.push(client)
  client.setQueryData(['service-booking-detail', booking.id], { ...booking, staff_notes: notes })
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <BookingDetailDrawer booking={booking} onClose={() => {}} onChanged={() => {}} />
    </QueryClientProvider>,
  )
}
afterEach(() => clients.splice(0).forEach(client => client.clear()))

describe('service booking note history', () => {
  it('shows plugin notes as escaped text and leaves the additive editor empty', () => {
    const html = render('[2026-09-09 via ChatGPT] Quiet room.\n\n<script>untrusted()</script>')
    expect(html).toContain('aria-label="Existing staff notes"')
    expect(html).toContain('[2026-09-09 via ChatGPT] Quiet room.')
    expect(html).toContain('&lt;script&gt;untrusted()&lt;/script&gt;')
    expect(html).not.toContain('<script>')
    expect(html).toContain('Add staff note')
    expect(html).toMatch(/<textarea[^>]*id="new-staff-note"[^>]*><\/textarea>/)
  })

  it('allows the first note without a misleading empty history panel', () => {
    const html = render(null)
    expect(html).not.toContain('aria-label="Existing staff notes"')
    expect(html).toContain('Add staff note')
  })
})
