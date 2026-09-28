import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BookingDetailDrawer } from './ServiceBookings'

vi.mock('../lib/api', () => ({ api: { get: vi.fn(), patch: vi.fn() } }))

const clients: QueryClient[] = []
const baseBooking = {
  id: 1, booking_reference: 'SVC-TEST', service: null, master: null,
  customer_name: 'Test customer', customer_email: 'customer@example.test', customer_phone: null,
  party_size: 1, start_at: '2026-09-09T10:00:00Z', end_at: '2026-09-09T11:00:00Z',
  duration_minutes: 60, total_amount: 24, currency: 'EUR', status: 'confirmed', payment_status: 'paid',
  source: 'admin',
}

function render(detail: Record<string, unknown> | undefined) {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } })
  clients.push(client)
  if (detail) client.setQueryData(['service-booking-detail', baseBooking.id], detail)
  return renderToStaticMarkup(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <BookingDetailDrawer booking={baseBooking} onClose={() => {}} onChanged={() => {}} />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}
afterEach(() => clients.splice(0).forEach(client => client.clear()))

describe('service booking detail — portal source, member link and discount', () => {
  it('shows the member-portal badge, the member link and the discount line', () => {
    const html = render({
      ...baseBooking,
      source: 'member_portal',
      member: { id: 7, name: 'Ann Guest', member_number: 'M-100' },
      list_amount: 30,
      discount: { amount: 6, label: 'Gold tier' },
    })
    expect(html).toContain('Member portal')
    expect(html).toContain('href="/members/7"')
    expect(html).toContain('Ann Guest')
    expect(html).toContain('List 30.00')
    expect(html).toContain('Discount −6.00')
    expect(html).toContain('Gold tier')
  })

  it('shows none of that for a widget booking with no member and no discount', () => {
    const html = render({ ...baseBooking, source: 'widget', member: null, list_amount: null, discount: null })
    expect(html).not.toContain('Member portal')
    expect(html).not.toContain('/members/')
    expect(html).not.toContain('Discount')
  })

  it('falls back to the row passed in when the detail query has not resolved yet', () => {
    const html = render(undefined)
    // No detail fetched: the drawer must not crash, and shows the total with
    // no portal badge (baseBooking itself carries no `source`/`member`). The
    // total's own decimal separator is locale-dependent (`money()` uses
    // `toLocaleString`), so match on the currency-prefixed integer part only.
    expect(html).toMatch(/€24[.,]00/)
    expect(html).not.toContain('Member portal')
  })
})
