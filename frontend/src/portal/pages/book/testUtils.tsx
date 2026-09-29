import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PortalContext, type PortalContextValue } from '../../PortalProvider'
import type { Catalogue, PortalBootstrap } from '../../lib/types'

/**
 * Fixtures and a render helper shared by every Book-flow test file
 * (book.test.tsx and the review/pay tests that follow it). `vi.mock`
 * is hoisted per test FILE, so the mocks themselves cannot live here — each
 * test file declares its own `vi.mock('react-i18next', ...)` and
 * `vi.mock('../../lib/portalApi', ...)` lines and imports only these three
 * from this file.
 */

export const catalogue: Catalogue = {
  categories: [{ id: 1, name: 'Massage', slug: 'massage', description: null, icon: null, image: null, color: null }],
  services: [
    {
      id: 11, category_id: 1, name: 'Deep Tissue', description: null, short_description: '45 minutes of relief',
      duration_minutes: 45, buffer_after_minutes: 0, price: 60, member_price: 54, currency: 'EUR',
      image: null, gallery: [], tags: [], master_ids: [5, 6],
    },
    {
      id: 12, category_id: 1, name: 'Hot Stone', description: null, short_description: null,
      duration_minutes: 60, buffer_after_minutes: 0, price: 80, member_price: 80, currency: 'EUR',
      image: null, gallery: [], tags: [], master_ids: [5],
    },
  ],
  masters: [
    { id: 5, name: 'Mara', title: null, bio: null, avatar: null, specialties: [], service_ids: [11, 12] },
    { id: 6, name: 'Ilse', title: null, bio: null, avatar: null, specialties: [], service_ids: [11] },
  ],
  extras: [],
  rules: { currency: 'EUR', lead_minutes: 60, slot_step: 15, max_advance_days: 30, allow_master_choice: true, cancellation_policy: '' },
  pricing: { automatic: { label: '10% off treatments', type: 'percent_discount', value: 10 } },
}

export const base: PortalBootstrap = {
  venue: {
    name: 'Numa', logo_url: null, industry: 'beauty', currency: 'EUR', timezone: 'Europe/Riga',
    contact: { email: null, phone: null },
    accent: { hex: '#b04a6e', ink: '#ffffff', deep: '#8e3b58', dark_hex: '#e38ab0', dark_ink: '#1a0b12', dark_deep: '#f0b4cd' },
    display_face: 'cormorant',
  },
  capabilities: { loyalty: true, services: true, stays: false, chat: false, payments: { services: false, stays: false, publishable_key: null } },
  policies: { services_cancel_hours: 24, booking_cancel_hours: 48, services_cancellation_policy: '', booking_cancellation_policy: '', check_in_time: '15:00', check_out_time: '11:00' },
  member: null,
  counts: { unread_notifications: 0, upcoming_bookings: 0 },
}

/** Renders under the portal context, a router at `path`, and a query client seeded by `seed`. */
export function render(ui: ReactElement, data: PortalBootstrap = base, seed?: (c: QueryClient) => void, path = '/portal/book') {
  const client = new QueryClient()
  seed?.(client)
  const value: PortalContextValue = { data, isLoading: false, isError: false, error: null, refetch: () => {} }
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}><PortalContext.Provider value={value}>{ui}</PortalContext.Provider></MemoryRouter>
    </QueryClientProvider>,
  )
}

/**
 * Like `render`, but for a query that must already be in the *error* state —
 * `setQueryData` only ever produces a success state, so this awaits `seed`
 * (typically a `client.prefetchQuery` with a rejecting `queryFn`) before
 * rendering, letting the query actually fail and settle into the cache
 * first.
 */
export async function renderAsync(ui: ReactElement, data: PortalBootstrap = base, seed: (c: QueryClient) => Promise<void>, path = '/portal/book') {
  const client = new QueryClient()
  await seed(client)
  const value: PortalContextValue = { data, isLoading: false, isError: false, error: null, refetch: () => {} }
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}><PortalContext.Provider value={value}>{ui}</PortalContext.Provider></MemoryRouter>
    </QueryClientProvider>,
  )
}
