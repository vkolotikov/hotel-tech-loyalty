import { describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'
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
import { cohortsKey, insightsKey, moneyKey } from './api'
import { CohortsTable } from './CohortsCard'
import { cohortOffsets, heatStep, noCohorts, noMoney, retentionShare } from './insightsMath'
import { InsightsPage } from './InsightsPage'
import { MoneyView } from './MoneyCard'
import type { Cohorts, Insights, Money } from './types'

/**
 * Release 4 part E in Insights: the money members bring and cohort retention — the decisions by value, the cards by
 * string. Every figure is the server's; the page names them and writes the cohort shares.
 */
const days = Array.from({ length: 30 }, (_, i) => new Date(Date.UTC(2026, 8, 6 + i)).toISOString().slice(0, 10))

const money = (more: Partial<Money> = {}): Money => ({
  period: '30d', bucket: 'day', from: '2026-09-06', to: '2026-10-05', timezone: 'UTC', currency: 'EUR',
  members: { stays: { bookings: 2, amount: 450 }, services: { bookings: 2, amount: 120 }, total: 570 },
  all: { total: 1170 }, share: 48.7, other_currency: { bookings: 1 },
  series: days.map(key => ({ key, stays: key === '2026-10-01' ? 300 : key === '2026-09-20' ? 150 : 0, services: key === '2026-10-02' ? 80 : key === '2026-10-04' ? 40 : 0 })),
  ...more,
})

const cohorts: Cohorts = {
  timezone: 'UTC',
  months: ['2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'],
  rows: [
    { key: '2025-11', members: 1, active: [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    ...['2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'].map((key, i) => ({ key, members: 0, active: Array(11 - i).fill(0) })),
    { key: '2026-07', members: 3, active: [1, 0, 1, 3] },
    { key: '2026-08', members: 0, active: [0, 0, 0] },
    { key: '2026-09', members: 4, active: [2, 1] },
    { key: '2026-10', members: 1, active: [1] },
  ],
}

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
const wrap = (node: ReactElement) => renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>)

describe('the decisions', () => {
  it('a cohort\'s share in whole per cent, none for a month nobody joined, and its shade', () => {
    expect(retentionShare(1, 3)).toBe(33)
    expect(retentionShare(3, 3)).toBe(100)
    expect(retentionShare(0, 0)).toBeNull()
    expect([null, 0, 1, 24, 25, 49, 50, 74, 75, 100].map(heatStep)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4])
  })

  it('the table runs from the joining month to the oldest cohort\'s last; an empty year says so', () => {
    expect(cohortOffsets(cohorts.rows)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    expect(noCohorts(cohorts.rows)).toBe(false)
    expect(noCohorts(cohorts.rows.map(r => ({ ...r, members: 0 })))).toBe(true)
  })

  it('a period with nothing paid anywhere says so; a booking in another currency still shows the card', () => {
    const none = money({ members: { stays: { bookings: 0, amount: 0 }, services: { bookings: 0, amount: 0 }, total: 0 }, all: { total: 0 }, share: null, other_currency: { bookings: 0 } })
    expect(noMoney(none)).toBe(true)
    expect(noMoney({ ...none, other_currency: { bookings: 1 } })).toBe(false)
    expect(noMoney(money())).toBe(false)
  })
})

describe('the money members bring', () => {
  it('shows what members brought in the venue\'s currency, by kind, their share, and the same per day', () => {
    const html = wrap(<MoneyView data={money()} locale="en" />)
    const words = text(html)
    expect(words).toContain('Members brought €570 In EUR')
    expect(words).toContain('Stays €450 Bookings: 2')
    expect(words).toContain('Appointments €120 Bookings: 2')
    expect(words).toContain('Share of all paid bookings 48.7% Of €1,170 paid in all')
    expect(html).toContain('data-chart="columns"')
    expect(words).toContain('Money members bring Day Stays Appointments')
    expect(words).toContain('Oct 1, 2026 €300 €0')
    expect(words).toContain('Paid bookings by members in another currency, not added in: 1.')
  })

  it('says when nothing was paid, and leaves out the other-currency line when there is none', () => {
    const none = money({ members: { stays: { bookings: 0, amount: 0 }, services: { bookings: 0, amount: 0 }, total: 0 }, all: { total: 0 }, share: null, other_currency: { bookings: 0 } })
    expect(text(wrap(<MoneyView data={none} locale="en" />))).toContain('No paid bookings in this period yet.')
    expect(wrap(<MoneyView data={money({ other_currency: { bookings: 0 } })} locale="en" />)).not.toContain('data-other-currency')
  })
})

describe('cohort retention', () => {
  it('lists each month with its members and the share active in each month since, shaded by the share', () => {
    const html = wrap(<CohortsTable data={cohorts} locale="en" />)
    const words = text(html)
    expect(words).toContain('Joined Members Month joined +1 +2 +3')
    expect(html).toMatch(/data-cohort="2026-07"[\s\S]*?Jul 2026[\s\S]*?>3<\/td>[\s\S]*?data-share="33"[^>]*l-heat-2[^>]*>33%[\s\S]*?data-share="0"[^>]*>0%[\s\S]*?data-share="33"[\s\S]*?data-share="100"[^>]*l-heat-4[^>]*>100%/)
    expect(html).toMatch(/data-cohort="2026-08"[\s\S]*?>–<\/td>/)
    expect(html).toContain('title="2 of 4 active"')
  })

  it('says when nobody joined in the twelve months', () => {
    expect(text(wrap(<CohortsTable data={{ ...cohorts, rows: cohorts.rows.map(r => ({ ...r, members: 0 })) }} locale="en" />))).toContain('Nobody joined in the last twelve months.')
  })
})

describe('on the Insights page', () => {
  const can: Can = { award: false, redeem: false, reverse: false, manage_program: false, manage_rewards: false, manage_members: false, view_insights: true, manage_campaigns: false, manage_app: false }
  const boot: Bootstrap = {
    name: 'HexaTech Loyalty', organization: { id: 1, name: 'Lumière', industry: 'hotel' }, accent: null,
    venue: { timezone: 'UTC', timezone_named: false, today: '2026-10-05', currency: 'EUR' }, features: { campaigns: true, wallet: true, push: true },
    staff: { id: 5, name: 'Ada', role: 'manager', can }, programme: { on: true, tiers: [] }, counts: { members: 40, requests_waiting: 0 },
  }
  const insights = {
    period: '30d', bucket: 'day', from: '2026-09-06', to: '2026-10-05', timezone: 'UTC',
    tiles: { members: 5, new_members: 1, active_members: 2, issued: 0, redeemed: 0, expired: 0, outstanding: 0, redemption_rate: null },
    growth: days.map(key => ({ key, new: 0, total: 5 })), points: days.map(key => ({ key, issued: 0, redeemed: 0, expired: 0 })),
    redemptions: days.map(key => ({ key, fulfilled: 0, pending: 0, cancelled: 0 })), tiers: { rows: [], none: 5 },
    movement: { up: 0, down: 0, lateral: 0, flows: [] }, expiry: { overdue: { points: 0, members: 0 }, months: [] },
    engagement: { new: 1, active: 1, at_risk: 1, dormant: 2 }, balances: [],
  } as Insights

  it('shows both cards after the programme\'s own, for the period chosen', () => {
    const client = new QueryClient()
    client.setQueryData(insightsKey('30d'), insights)
    client.setQueryData(moneyKey('30d'), money())
    client.setQueryData(cohortsKey, cohorts)
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/loyalty/insights']}>
          <LoyaltyContext.Provider value={{ data: boot, isLoading: false, isError: false, error: null, refetch: () => {} }}>
            <InsightsPage />
          </LoyaltyContext.Provider>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(html).toMatch(/data-card="insights-balances"[\s\S]*data-card="insights-money"[\s\S]*data-card="insights-cohorts"[\s\S]*data-card="insights-at-risk"/)
    expect(text(html)).toContain('Money members bring')
    expect(text(html)).toContain('Cohort retention')
  })
})
