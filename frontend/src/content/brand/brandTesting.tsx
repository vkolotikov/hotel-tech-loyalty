import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { ContentContext } from '../ContentProvider'
import type { Bootstrap, BrandPayload, BrandProfile } from '../lib/types'
import { BrandPage } from './BrandPage'

/** A bootstrap for brand 3 of org 16, as a manager or as staff. */
export const bootFor = (canManage: boolean) => ({
  name: 'HexaTech Content', organization: { id: 16, name: 'Lumière Salon', industry: 'beauty' },
  brand: { id: 3, name: 'Lumière Salon', logo_url: null }, brands: [], accent: null,
  venue: { timezone: 'Europe/London', timezone_named: true, today: '2026-10-07' },
  staff: { name: 'Sam', role: canManage ? 'manager' : 'staff', can_manage: canManage }, profile: { id: 1, setup_completed: true, readiness: 64 },
  ai: { status: 'under', percent: 10 }, platforms: ['instagram', 'linkedin'], statuses: ['draft'], rewrites: [],
}) as unknown as Bootstrap

export const profile = {
  id: 1, name: 'Lumière content', default_language: 'en', primary_goal: 'More bookings', usp: 'Organic colour only',
  brand_values: ['Care', 'Calm'], price_position: 'premium', setup_completed_at: '2026-10-01T09:00:00.000000Z',
  last_knowledge_sync_at: '2026-10-02T09:00:00.000000Z',
} as unknown as BrandProfile

export const brandWith = (more: Partial<BrandPayload> = {}): BrandPayload => ({
  profile, audiences: [], channels: [], voice: null,
  readiness: { overall: 64, sections: [
    { key: 'company', label: 'Company info', score: 60, hints: ['x'], missing: ['mission'] },
    { key: 'knowledge', label: 'FAQ & knowledge', score: 40, hints: ['x'], missing: ['faq_more'], faq_count: 2 },
  ] },
  ...more,
})

/** Renders `element` (the Brand page by default) with the brand in the cache, as a manager or as staff. */
export function renderBrand(payload: BrandPayload, canManage: boolean, element: ReactElement = <BrandPage />) {
  const client = new QueryClient()
  client.setQueryData(['content', 3, 'brand'], payload)
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/content/brand']}>
        <ContentContext.Provider value={{ data: bootFor(canManage), isLoading: false, isError: false, error: null, refetch: () => {}, switchBrand: () => {} }}>
          {element}
        </ContentContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
