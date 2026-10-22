import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
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
vi.mock('../../lib/api', () => ({ api: {}, resolveImage: (url: string | null | undefined) => url ?? null }))

import { LoyaltyContext } from '../LoyaltyProvider'
import type { Bootstrap, Can } from '../lib/types'
import { PROGRAM_KEY } from './api'
import { BoostDialog } from './BoostDialog'
import { ProgramPage } from './ProgramPage'
import type { Program } from './types'

const can = (more: Partial<Can> = {}): Can => ({ award: true, redeem: true, reverse: false, manage_program: false, manage_rewards: false, manage_members: false, view_insights: false, manage_campaigns: false, manage_app: false, ...more })
const boot = (c: Can): Bootstrap => ({
  name: 'HexaTech Loyalty',
  organization: { id: 1, name: 'Lumière', industry: 'hotel' },
  accent: null,
  venue: { timezone: 'Europe/Riga', timezone_named: true, today: '2026-10-21', currency: 'EUR' },
  features: { campaigns: true, wallet: true, push: true },
  staff: { id: 5, name: 'Ada', role: c.manage_program ? 'manager' : 'staff', can: c },
  programme: { on: true, tiers: [{ id: 1, name: 'Silver', color: '#9aa4b1', min_points: 0, is_active: true }, { id: 2, name: 'Gold', color: '#c9a227', min_points: 1000, is_active: true }] },
  counts: { members: 40, requests_waiting: 2 },
})
const program: Program = {
  tiers: [
    { id: 1, name: 'Silver', description: null, color: '#9aa4b1', min_points: 0, min_nights: null, min_stays: null, min_spend: null, earn_rate: 1, is_active: true, sort_order: 1, members: 30, benefits: [] },
    {
      id: 2, name: 'Gold', description: 'Our best guests.', color: '#c9a227', min_points: 1000, min_nights: 5, min_stays: null, min_spend: null, earn_rate: 1.5,
      is_active: false, sort_order: 2, members: 1200,
      benefits: [{ id: 9, benefit_id: 7, name: 'Late checkout', category: 'accommodation', value: 'Until 2 pm', value_type: 'percent_discount', value_amount: 10, applies_to: 'stays' }],
    },
  ],
  benefits: [
    { id: 7, name: 'Late checkout', code: 'LATE', description: null, category: 'accommodation', fulfillment_mode: 'on_request', is_active: true, sort_order: 0 },
    { id: 8, name: 'Spa ritual', code: 'SPA', description: null, category: 'spa', fulfillment_mode: 'voucher', is_active: false, sort_order: 1 },
  ],
  boosts: [
    { id: 3, name: 'Double weekend', description: null, multiplier: 2, starts_at: '2026-10-24T07:00:00+00:00', ends_at: '2026-10-25T21:59:00+00:00', days_of_week: [6, 0], tier_ids: [2], is_active: true, state: 'upcoming' },
    { id: 4, name: 'Summer', description: null, multiplier: 1.5, starts_at: '2026-06-01T00:00:00+00:00', ends_at: '2026-08-31T00:00:00+00:00', days_of_week: null, tier_ids: null, is_active: true, state: 'ended' },
  ],
  options: { categories: ['accommodation', 'other'], fulfillment_modes: ['on_request', 'voucher'], value_types: ['text', 'percent_discount'], applies_to: ['all', 'stays'] },
}

const render = (c: Can, data: Program | null = program) => {
  const client = new QueryClient()
  if (data) client.setQueryData(PROGRAM_KEY, data)
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <LoyaltyContext.Provider value={{ data: boot(c), isLoading: false, isError: false, error: null, refetch: () => {} }}>
          <ProgramPage />
        </LoyaltyContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('Program (spec 2026-10-21 §4.5, §5)', () => {
  it('shows the ladder in order with what reaches each tier, its earn rate, members, state and benefits', () => {
    const html = render(can())
    const words = text(html)
    expect(html.indexOf('data-tier="1"')).toBeLessThan(html.indexOf('data-tier="2"'))
    expect(words).toContain('Points to reach 1,000')
    expect(words).toContain('Nights to reach 5')
    expect(words).toContain('Earn rate ×1.5')
    expect(words).toContain('Members 1,200')
    expect(words).toContain('Switched off')
    expect(words).toContain('Late checkout · Until 2 pm · 10% off · Stays only')
    expect(words).toContain('This tier gives no benefit yet.')
  })

  it('names the catalogue\'s categories and ways of giving, and shows a value it has no word for as sent', () => {
    const words = text(render(can()))
    expect(words).toContain('Accommodation · On request')
    expect(words).toContain('spa · Voucher')
  })

  it('shows boosts on the venue\'s clock with their days, tiers and state', () => {
    const html = render(can())
    const words = text(html)
    expect(words).toContain('Oct 24, 10:00 – Oct 25, 23:59 · Sat, Sun')
    expect(words).toContain('Upcoming')
    expect(words).toContain('Ended')
    expect(words).toContain('Every day')
    expect(words).toContain('Every tier')
    expect(html).toMatch(/data-boost="3"[\s\S]*?data-tier-chip[^>]*>[\s\S]*?Gold/)
  })

  it('gives a manager every action', () => {
    const words = text(render(can({ manage_program: true })))
    for (const action of ['Add tier', 'Edit Gold', 'Add benefit Gold', 'Change Late checkout', 'Add benefit', 'Switch off Late checkout', 'Switch on Spa ritual', 'Add boost', 'Remove Double weekend']) {
      expect(words).toContain(action)
    }
    expect(render(can({ manage_program: true }))).toContain('aria-label="Take Late checkout off Gold"')
    expect(words).not.toContain('Only an owner or a manager can change the programme.')
  })

  it('shows staff everything, read-only, and says why', () => {
    const html = render(can({ manage_rewards: true }))
    const words = text(html)
    expect(words).toContain('Only an owner or a manager can change the programme.')
    expect(words).toContain('Late checkout · Until 2 pm')
    for (const action of ['Add tier', 'Edit', 'Add benefit', 'Switch off', 'Add boost', 'Remove']) expect(words).not.toContain(action)
    expect(html).not.toContain('Take Late checkout off Gold')
    expect(html).not.toContain('<button')
  })

  it('waits for the programme with a quiet stand-in', () => {
    expect(render(can(), null)).toContain('Loading…')
  })

  it('asks for a boost\'s times to be checked when they were saved before the fix, until it ends (R4-6)', () => {
    const flagged: Program = { ...program, boosts: program.boosts.map(b => ({ ...b, check_time: true })) }
    const html = render(can({ manage_program: true }), flagged)
    expect(html.match(/data-time-check=""/g)).toHaveLength(1)
    expect(html).toMatch(/data-boost="3"[\s\S]*data-time-check=""[\s\S]*data-boost="4"/)
    expect(text(html)).toContain('Check the time: saved in the full admin before its times were read on the venue’s clock')
    expect(render(can({ manage_program: true }))).not.toContain('data-time-check')
  })

  it('in the boost dialog: the time check, and the brand only when there is more than one (release 4)', () => {
    const inDialog = (node: ReactNode) => renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <LoyaltyContext.Provider value={{ data: boot(can({ manage_program: true })), isLoading: false, isError: false, error: null, refetch: () => {} }}>{node}</LoyaltyContext.Provider>
      </QueryClientProvider>,
    )
    const two = { list: [{ id: 1, name: 'Lumière Spa', is_default: true }, { id: 2, name: 'Lumière Hotel', is_default: false }], default: 1 }
    const flagged = text(inDialog(<BoostDialog boost={{ ...program.boosts[0], check_time: true, brand_id: 2 }} tiers={program.tiers} brands={two} onClose={() => {}} />))
    expect(flagged).toContain('Check these times: they were saved in the full admin before it read times on the venue’s clock')
    expect(flagged).toContain('Brand: Lumière Hotel. It stays on this brand.')
    expect(inDialog(<BoostDialog boost={null} tiers={program.tiers} brands={two} onClose={() => {}} />)).toContain('<select data-brand=""')
    const plain = inDialog(<BoostDialog boost={program.boosts[0]} tiers={program.tiers} onClose={() => {}} />)
    expect(plain).not.toContain('Check these times')
    expect(plain).not.toContain('data-brand')
  })
})
