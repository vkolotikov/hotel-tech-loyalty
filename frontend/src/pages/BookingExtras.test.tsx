import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import BookingExtras, { ExtraForm } from './BookingExtras'

vi.mock('../lib/api', () => ({ api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() }, resolveImage: (s: string | null) => s }))

// R4-3 (owner, 2026-10-22): the list says how each extra is charged — the way the booking engine charges it.
const extra = (id: number, name: string, price: number, price_type: string) => ({
  id, name, description: null, price, price_type, lead_time_hours: 0, currency: 'EUR',
  image: null, icon: null, category: 'food', sort_order: id, is_active: true,
})
const extras = [
  extra(1, 'Late check-out', 15, 'per_stay'),
  extra(2, 'Parking', 10, 'per_night'),
  extra(3, 'Welcome drink', 5, 'per_person'),
  extra(4, 'Breakfast', 5, 'per_person_night'),
]

const clients: QueryClient[] = []
function renderList(): string {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } })
  clients.push(client)
  client.setQueryData(['booking-extras'], extras)
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/booking/extras']}>
      <QueryClientProvider client={client}><BookingExtras /></QueryClientProvider>
    </MemoryRouter>,
  )
}
const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ')
afterEach(() => clients.splice(0).forEach(client => client.clear()))

describe('booking extras: how each extra is charged', () => {
  it('states each price with what it is charged per', () => {
    const shown = text(renderList())
    expect(shown).toContain('Late check-out€15.00 per stay')
    expect(shown).toContain('Parking€10.00 per night')
    expect(shown).toContain('Welcome drink€5.00 per person')
    expect(shown).toContain('Breakfast€5.00 per person per night')
    expect(shown).not.toContain('/ Per')
  })

  it('says in the form what the guest pays for the chosen type', () => {
    const form = (priceType: string) => text(renderToStaticMarkup(
      <ExtraForm extra={extra(9, 'Breakfast', 5, priceType)} onClose={() => {}} onSave={() => {}} saving={false} />,
    ))
    expect(form('per_stay')).toContain('Charged once for the whole stay.')
    expect(form('per_night')).toContain('Charged for every night of the stay.')
    expect(form('per_person')).toContain('Charged for every guest, children included.')
    expect(form('per_person_night')).toContain('Charged for every guest, children included, for every night of the stay.')
  })

  it('keeps the four types the server accepts as the choices, in the same order', () => {
    const html = renderToStaticMarkup(<ExtraForm extra={null} onClose={() => {}} onSave={() => {}} saving={false} />)
    expect([...html.matchAll(/<option[^>]*value="([^"]+)"/g)].map(m => m[1])).toEqual(['per_stay', 'per_night', 'per_person', 'per_person_night'])
  })
})
