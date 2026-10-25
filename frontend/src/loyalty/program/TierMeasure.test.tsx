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
import { ProgramPage } from './ProgramPage'
import { TierDialog } from './TierDialog'
import type { Program, Tier } from './types'

/** Program by the programme's measure (release 8, spec 2026-10-25 §3): tier cards and the tier form show its floor. */
const can: Can = { award: true, redeem: true, reverse: true, manage_program: true, manage_rewards: false, manage_members: true, view_insights: false, manage_campaigns: false, manage_app: false }
const boot = (by: 'points' | 'visits' | 'spend'): Bootstrap => ({
  name: 'HexaTech Loyalty', organization: { id: 1, name: 'North Club', industry: 'other' }, accent: null,
  venue: { timezone: 'Europe/Riga', timezone_named: true, today: '2026-10-05', currency: 'EUR' },
  features: { campaigns: true, wallet: true, push: true }, staff: { id: 5, name: 'Ada', role: 'manager', can },
  programme: { on: true, tiers: [], progress_by: by }, counts: { members: 3, requests_waiting: 0 },
})
const tier = (more: Partial<Tier>): Tier => ({
  id: 1, name: 'Member', description: null, color: '#94a3b8', min_points: 0, min_nights: null, min_stays: null, min_spend: null, min_visits: 0,
  earn_rate: 1, is_active: true, sort_order: 1, members: 3, benefits: [], ...more,
})
const program: Program = {
  tiers: [tier({}), tier({ id: 2, name: 'Regular', min_points: 1000, min_visits: 10, min_spend: 250 }), tier({ id: 3, name: 'Insider', min_points: 3000, min_visits: null, min_spend: 800 })],
  benefits: [], boosts: [], options: { categories: [], fulfillment_modes: [], value_types: [], applies_to: [] },
}

function wrap(by: 'points' | 'visits' | 'spend', node: ReactNode, data?: Program) {
  const client = new QueryClient()
  if (data) client.setQueryData(PROGRAM_KEY, data)
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <LoyaltyContext.Provider value={{ data: boot(by), isLoading: false, isError: false, error: null, refetch: () => {} }}>{node}</LoyaltyContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('tiers on the programme’s measure', () => {
  it('cards show the visits or the spend that reach each tier, or that none is set', () => {
    const visits = text(wrap('visits', <ProgramPage />, program))
    expect(visits).toContain('Visits to reach 10')
    expect(visits).toContain('Visits to reach Not set')
    expect(visits).not.toContain('Points to reach')

    const spend = text(wrap('spend', <ProgramPage />, program))
    expect(spend).toContain('Spend to reach €250')
    expect(spend).not.toContain('Visits to reach')

    expect(text(wrap('points', <ProgramPage />, program))).toContain('Points to reach 1,000')
  })

  it('the tier form asks for the measure’s floor and hides the others', () => {
    const visits = text(wrap('visits', <TierDialog tier={program.tiers[1]} onClose={() => {}} />))
    expect(visits).toContain('Visits to reach this tier')
    expect(visits).toContain('Members move between tiers by their visits.')
    expect(visits).not.toContain('Points to reach it')

    const spend = text(wrap('spend', <TierDialog tier={null} onClose={() => {}} />))
    expect(spend).toContain('Spend to reach this tier')
    expect(spend).toContain('In EUR, what members spent at their visits.')

    const points = text(wrap('points', <TierDialog tier={null} onClose={() => {}} />))
    expect(points).toContain('Points to reach it')
    expect(points).not.toContain('Visits to reach this tier')
  })
})
