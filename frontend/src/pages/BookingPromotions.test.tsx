import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import BookingPromotions from './BookingPromotions'
import { duplicatePromotion, filterPromotions, newPromotion, promotionBody } from './bookingPromotions'
import { initialStayState, stayQuoteBody } from '../portal/pages/stay/staySteps'

vi.mock('../lib/api', () => ({ api: { get: vi.fn(), put: vi.fn(), post: vi.fn() } }))

describe('stay promotions', () => {
  it('finds campaigns by code or name and uses the server status for filtering', () => {
    const list = [{ ...newPromotion('VIPFORREST'), name: 'VIP stay', status: 'published' as const, state: 'scheduled' }, newPromotion('EARLYFOR20')]
    expect(filterPromotions(list, 'forrest', 'scheduled')).toHaveLength(1)
    expect(filterPromotions(list, 'vip stay', 'all')).toHaveLength(1)
    expect(filterPromotions(list, '', 'draft')).toHaveLength(1)
    expect(filterPromotions(list, 'missing', 'all')).toHaveLength(0)
  })
  it('creates free-night campaigns as drafts without inventing dates', () => {
    expect(newPromotion('VIPFORREST', 'second_night_free')).toMatchObject({ code: 'VIPFORREST', min_nights: 2, status: 'draft', booking_from: null, booking_until: null, value: 0 })
  })
  it('duplicates without publishing or copying a redemption history', () => {
    expect(duplicatePromotion({ ...newPromotion('TEST20'), id: 1, revision: 4, status: 'published', name: 'Campaign' })).toMatchObject({ id: undefined, revision: undefined, status: 'draft', code: '' })
  })
  it('keeps local calendar inputs intact and normalizes codes', () => {
    expect(promotionBody({ ...newPromotion(' earlyfor20 '), booking_from: '2026-11-27T00:00' })).toMatchObject({ code: 'EARLYFOR20', booking_from: '2026-11-27T00:00' })
  })
  it('sends an explicit campaign choice without adding a client total', () => {
    const body = stayQuoteBody({ ...initialStayState, roomId: '101', checkIn: '2027-01-01', checkOut: '2027-01-03', promoCode: ' EARLYFOR20 ' })
    expect(body.promo_code).toBe('EARLYFOR20')
    expect(body).not.toHaveProperty('total')
    expect(stayQuoteBody(initialStayState)).not.toHaveProperty('promo_code')
  })
  it('explains stay-only scope, timezone and the disabled checkout switch', () => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } })
    client.setQueryData(['booking-promotions'], { enabled: false, timezone: 'Europe/Riga', currency: 'EUR', rooms: [], promotions: [] })
    const html = renderToStaticMarkup(<QueryClientProvider client={client}><BookingPromotions /></QueryClientProvider>)
    expect(html).toContain('Additional services stay at full price')
    expect(html).toContain('Europe/Riga')
    expect(html).toContain('Second night free')
    expect(html).not.toContain('checked=""')
    client.clear()
  })
})
