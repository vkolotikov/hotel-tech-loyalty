import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en' },
  }),
}))
vi.mock('../../lib/api', () => ({ api: {} }))

import { LoyaltyContext } from '../LoyaltyProvider'
import type { Bootstrap, Can } from '../lib/types'
import { CATALOGUE_KEY, OFFERS_KEY, redemptionsKey, referralsKey } from './api'
import { RewardsPage } from './RewardsPage'
import type { Catalogue, OffersList, RedemptionsPage, ReferralsPage } from './types'

const can = (more: Partial<Can> = {}): Can => ({ award: false, redeem: false, reverse: false, manage_program: false, manage_rewards: false, ...more })
const boot = (c: Can): Bootstrap => ({
  name: 'HexaTech Loyalty',
  organization: { id: 1, name: 'Lumière', industry: 'hotel' },
  accent: null,
  venue: { timezone: 'Europe/Riga', timezone_named: true, today: '2026-10-21' },
  staff: { id: 5, name: 'Ada', role: 'staff', can: c },
  programme: { on: true, tiers: [{ id: 1, name: 'Silver', color: '#9aa4b1', min_points: 0, is_active: true }, { id: 2, name: 'Gold', color: '#c9a227', min_points: 1000, is_active: true }] },
  counts: { members: 40, requests_waiting: 2 },
})
const catalogue: Catalogue = {
  rewards: [
    { id: 4, name: 'Breakfast for two', description: null, terms: null, category: 'Dining', points_cost: 1500, stock: 0, per_member_limit: null, discount_type: 'percent_discount',
      discount_value: 10, applies_to: 'stays', expires_at: '2026-12-31T21:59:00+00:00', is_active: true, image_url: null, redeemed: 10, fulfilled: 7 },
  ],
  options: { discount_types: ['percent_discount', 'fixed_amount'], applies_to: ['all', 'stays'] },
}
const redemptions: RedemptionsPage = {
  page: 1, pages: 1, total: 2, counts: { pending: 1 },
  redemptions: [
    { id: 11, code: 'RW-AAAA', state: 'pending', points: 1500, reward: { id: 4, name: 'Breakfast for two' }, member: { id: 30, name: 'Grace Hopper', member_number: 'M-30' },
      at: '2026-10-20T08:00:00+00:00', fulfilled_at: null, cancelled_at: null },
    { id: 12, code: 'RW-BBBB', state: 'fulfilled', points: 500, reward: null, member: null, at: '2026-10-19T08:00:00+00:00', fulfilled_at: '2026-10-19T09:00:00+00:00', cancelled_at: null },
  ],
}
const offers: OffersList = {
  offers: [
    { id: 6, title: 'Autumn weekend', description: 'Two nights', type: 'discount', value: 15, code: 'AUTUMN', applies_to: 'stays', tier_ids: [2], start_date: '2026-10-01',
      end_date: '2026-10-31', usage_limit: 100, times_used: 3, per_member_limit: 1, is_active: true, is_featured: true, state: 'live' },
    { id: 7, title: 'Mystery', description: 'x', type: 'flash_sale', value: 0, code: null, applies_to: 'all', tier_ids: null, start_date: '2026-11-01',
      end_date: '2026-11-30', usage_limit: null, times_used: 0, per_member_limit: null, is_active: true, is_featured: false, state: 'upcoming' },
  ],
  options: { types: ['discount'], applies_to: ['all', 'stays'] },
}
const referrals: ReferralsPage = {
  page: 1, pages: 3, total: 60, figures: { total: 60, rewarded: 40, pending: 20, points_paid: 12000 },
  referrals: [{ id: 1, referrer: { id: 30, name: 'Grace Hopper' }, referee: { id: 31, name: 'Alan Turing' }, state: 'rewarded', points: { referrer: 200, referee: 100 }, at: '2026-10-01T10:00:00+00:00' }],
}

const render = (search: string, c: Can) => {
  const client = new QueryClient()
  client.setQueryData(CATALOGUE_KEY, catalogue)
  client.setQueryData(redemptionsKey('pending', 1), redemptions)
  client.setQueryData(OFFERS_KEY, offers)
  client.setQueryData(referralsKey(1), referrals)
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/loyalty/rewards${search}`]}>
        <LoyaltyContext.Provider value={{ data: boot(c), isLoading: false, isError: false, error: null, refetch: () => {} }}>
          <RewardsPage />
        </LoyaltyContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('Rewards (spec 2026-10-21 §4.6)', () => {
  it('shows the four tabs as a tablist, the address\'s tab selected and the only tab stop', () => {
    const html = render('?tab=offers', can())
    expect(html).toContain('role="tablist"')
    expect(html).toMatch(/role="tab" id="rewards-tab-offers" aria-selected="true"[^>]*tabindex="0"[^>]*>Offers</)
    expect(html).toMatch(/role="tab" id="rewards-tab-catalogue" aria-selected="false"[^>]*tabindex="-1"[^>]*>Catalogue</)
    expect(html).toMatch(/role="tabpanel" aria-labelledby="rewards-tab-offers"/)
    expect(render('', can())).toMatch(/id="rewards-tab-catalogue" aria-selected="true"/)
  })

  it('shows the catalogue as cards, with Add and Edit only for staff who manage offers', () => {
    const staff = text(render('', can({ redeem: true })))
    expect(staff).toContain('Breakfast for two')
    expect(staff).toContain('1,500 pts')
    expect(staff).toContain('Stock None left')
    expect(staff).toContain('Per member No limit')
    expect(staff).toContain('Redeemed 10')
    expect(staff).toContain('Fulfilled 7')
    expect(staff).toContain('10% off · Stays only')
    expect(staff).toContain('Offered until Dec 31, 23:59')
    expect(staff).toContain('Only staff allowed to manage offers can add or change rewards.')
    expect(staff).not.toContain('Add reward')
    expect(staff).not.toContain('Edit')
    const manager = text(render('', can({ manage_rewards: true })))
    expect(manager).toContain('Add reward')
    expect(manager).toContain('Edit Breakfast for two')
  })

  it('offers Mark fulfilled and Cancel on a pending redemption, to whoever may redeem, and links the member', () => {
    const html = render('?tab=redemptions', can({ redeem: true }))
    const words = text(html)
    expect(words).toContain('RW-AAAA')
    expect(html).toContain('href="/loyalty/members/30"')
    expect(words).toContain('Mark fulfilled RW-AAAA')
    expect(words).toContain('Cancel RW-AAAA')
    expect(words).not.toContain('Mark fulfilled RW-BBBB')
    expect(words).not.toContain('Cancel RW-BBBB')
    expect(words).toContain('A reward no longer in the catalogue')
    expect(html).toMatch(/aria-pressed="true"[^>]*>Pending/)
    const staff = text(render('?tab=redemptions', can({ manage_rewards: true })))
    expect(staff).not.toContain('Mark fulfilled')
    expect(staff).toContain('Only staff allowed to redeem points can fulfil or cancel a redemption.')
  })

  it('shows offers with their kind and value, code, days, tiers, use and state; a kind it has no word for as sent', () => {
    const html = render('?tab=offers', can({ manage_rewards: true }))
    const words = text(html)
    expect(words).toContain('Discount · 15% off · Stays only')
    expect(words).toContain('Oct 1, 2026 – Oct 31, 2026 · Used: 3 of 100 · Up to 1 per member · AUTUMN')
    expect(words).toContain('Featured')
    expect(words).toContain('Running')
    expect(words).toContain('flash_sale')
    expect(words).toContain('Upcoming')
    expect(words).toContain('Every tier')
    expect(html).toMatch(/data-offer="6"[\s\S]*?data-tier-chip[^>]*>[\s\S]*?Gold/)
    expect(words).toContain('Add offer')
    expect(text(render('?tab=offers', can()))).not.toContain('Add offer')
  })

  it('shows the referral numbers and list, read only, with pages', () => {
    const html = render('?tab=referrals', can({ manage_rewards: true, redeem: true }))
    const words = text(html)
    expect(words).toContain('Referrals 60')
    expect(words).toContain('Points paid out 12,000')
    expect(words).toContain('Alan Turing Invited by Grace Hopper')
    expect(words).toContain('Points: +200 to the referrer, +100 to the new member')
    expect(words).toContain('Rewarded')
    expect(words).toContain('Page 1 of 3')
    expect(html).toContain('href="/loyalty/members/31"')
  })
})
