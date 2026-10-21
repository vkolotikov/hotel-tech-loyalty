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
import { atRiskKey, insightsKey } from './api'
import { InsightsPage } from './InsightsPage'
import type { AtRisk, Insights, Period } from './types'

const can = (more: Partial<Can> = {}): Can => ({ award: true, redeem: true, reverse: false, manage_program: false, manage_rewards: false, manage_members: false, view_insights: false, manage_campaigns: false, manage_app: false, ...more })
const boot = (c: Can): Bootstrap => ({
  name: 'HexaTech Loyalty',
  organization: { id: 1, name: 'Lumière', industry: 'hotel' },
  accent: null,
  venue: { timezone: 'America/New_York', timezone_named: true, today: '2026-10-05', currency: 'EUR' },
  features: { campaigns: true, wallet: true },
  staff: { id: 5, name: 'Ada', role: 'manager', can: c },
  programme: { on: true, tiers: [
    { id: 1, name: 'Silver', color: '#9aa4b1', min_points: 0, is_active: true },
    { id: 2, name: 'Gold', color: '#c9a227', min_points: 1000, is_active: true },
    { id: 3, name: 'Legacy', color: null, min_points: 0, is_active: false },
  ] },
  counts: { members: 40, requests_waiting: 2 },
})

const days = Array.from({ length: 30 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 8, 6 + i))
  return d.toISOString().slice(0, 10)
})
const zeroes = (make: (key: string) => Record<string, unknown>) => days.map(key => ({ key, ...make(key) }))

const insights = (more: Partial<Insights> = {}): Insights => ({
  period: '30d', bucket: 'day', from: '2026-09-06', to: '2026-10-05', timezone: 'America/New_York',
  tiles: { members: 1204, new_members: 31, active_members: 702, issued: 1028, redeemed: 300, expired: 40, outstanding: 182400, redemption_rate: 29.2 },
  growth: zeroes(key => ({ new: key === '2026-10-01' ? 3 : 0, total: key >= '2026-10-01' ? 1204 : 1201 })) as Insights['growth'],
  points: zeroes(key => ({ issued: key === '2026-10-01' ? 1000 : 0, redeemed: key === '2026-10-03' ? 300 : 0, expired: key === '2026-09-30' ? 40 : 0 })) as Insights['points'],
  redemptions: zeroes(key => ({ fulfilled: key === '2026-10-01' ? 2 : 0, pending: key === '2026-10-01' ? 1 : 0, cancelled: 0 })) as Insights['redemptions'],
  tiers: { rows: [
    { id: 3, name: 'Legacy', color: null, sort_order: 0, is_active: false, members: 2 },
    { id: 1, name: 'Silver', color: '#9aa4b1', sort_order: 1, is_active: true, members: 900 },
    { id: 2, name: 'Gold', color: '#c9a227', sort_order: 2, is_active: true, members: 300 },
  ], none: 2 },
  movement: { up: 12, down: 3, lateral: 0, flows: [{ from: 1, to: 2, count: 12, direction: 'up' }, { from: 2, to: 1, count: 3, direction: 'down' }] },
  expiry: { overdue: { points: 160, members: 2 }, months: [
    { key: '2026-10', points: 30 }, { key: '2026-11', points: 70 }, { key: '2026-12', points: 0 },
    { key: '2027-01', points: 0 }, { key: '2027-02', points: 0 }, { key: '2027-03', points: 20 },
  ] },
  engagement: { new: 31, active: 400, at_risk: 200, dormant: 573 },
  balances: [
    { min: null, max: -1, members: 1 }, { min: 0, max: 0, members: 100 }, { min: 1, max: 500, members: 500 }, { min: 501, max: 2000, members: 400 },
    { min: 2001, max: 5000, members: 150 }, { min: 5001, max: 10000, members: 40 }, { min: 10001, max: null, members: 13 },
  ],
  ...more,
})

const atRisk: AtRisk = {
  days: 60, total: 140, limit: 100,
  members: [
    { id: 77, name: 'Long Gone', email: 'long@example.test', phone: null, member_number: 'LS-000077', tier_id: 2, points: 640, lifetime_points: 900, is_active: true,
      joined_at: '2026-01-01T10:00:00+00:00', last_activity_at: '2026-03-01T15:00:00+00:00', days_quiet: 218 },
  ],
}

const render = (c: Can, options: { data?: Insights | null; period?: Period; search?: string; quiet?: AtRisk | null } = {}) => {
  const client = new QueryClient()
  const period = options.period ?? '30d'
  if (options.data !== null) client.setQueryData(insightsKey(period), options.data ?? insights())
  if (options.quiet !== null) client.setQueryData(atRiskKey(options.quiet?.days ?? 60), options.quiet ?? atRisk)
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/loyalty/insights${options.search ?? ''}`]}>
        <LoyaltyContext.Provider value={{ data: boot(c), isLoading: false, isError: false, error: null, refetch: () => {} }}>
          <InsightsPage />
        </LoyaltyContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
const manager = can({ view_insights: true, manage_program: true })

describe('Insights (spec 2026-10-21 release 2 §5)', () => {
  it('heads the page with the period choice, the chosen one pressed, and the period\'s days on the venue\'s clock', () => {
    const html = render(manager)
    expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*>30 days<\/button>/)
    expect(html).toMatch(/<button[^>]*aria-pressed="false"[^>]*>12 months<\/button>/)
    expect(text(html)).toContain('Sep 6, 2026 – Oct 5, 2026, by day')
  })

  it('takes the period from the address', () => {
    const data = insights({ period: '12m', bucket: 'month', from: '2025-11-01', points: [{ key: '2026-10', issued: 5, redeemed: 0, expired: 0 }], growth: [{ key: '2026-10', new: 1, total: 4 }], redemptions: [{ key: '2026-10', fulfilled: 0, pending: 0, cancelled: 0 }] })
    const html = render(manager, { period: '12m', search: '?period=12m', data })
    expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*>12 months<\/button>/)
    expect(text(html)).toContain('Nov 1, 2025 – Oct 5, 2026, by month')
    expect(text(html)).toContain('October 2026')
  })

  it('shows the figures, numbers written as the language groups them', () => {
    const words = text(render(manager))
    for (const tile of ['Members 1,204', 'New in this period 31', 'Active, last 90 days 702', 'Points outstanding 182,400', 'Points issued 1,028', 'Points redeemed 300', 'Points expired 40', 'Redemption rate 29.2%']) {
      expect(words).toContain(tile)
    }
  })

  it('draws each chart with a legend for several series and a table of its numbers for a screen reader', () => {
    const html = render(manager)
    expect(html.match(/data-chart="columns"/g)).toHaveLength(3)
    expect(html).toContain('data-chart="line"')
    expect(html).toMatch(/<svg aria-hidden="true"/)
    expect(html.match(/<table class="sr-only">/g)).toHaveLength(4)
    const words = text(html)
    expect(words).toContain('Points in and out Day Issued Redeemed Expired')
    expect(words).toContain('Oct 1, 2026 1,000 0 0')
    expect(words).toContain('Oct 3, 2026 0 300 0')
    expect(words).toContain('Reward redemptions Day Fulfilled Waiting Cancelled')
    expect(html).toMatch(/data-legend=""[\s\S]*?Issued[\s\S]*?Redeemed[\s\S]*?Expired/)
    // A tooltip on each bucket says what it holds.
    expect(html).toContain('<title>Oct 1, 2026: Issued 1,000, Redeemed 0, Expired 0</title>')
    // The running total ends on its own value.
    expect(html).toMatch(/class="l-chart-value"[^>]*>1,204<\/text>/)
  })

  it('lists members by tier on their chips, the switched-off tier marked, and those without a tier', () => {
    const html = render(manager)
    const words = text(html)
    expect(html).toMatch(/data-row="tier-3"[\s\S]*?Legacy[\s\S]*?switched off/)
    expect(words).toContain('Silver 900 · 75%')
    expect(words).toContain('No tier 2 · 0%')
  })

  it('shows tier movement with its flows named from the ladder', () => {
    const words = text(render(manager))
    expect(words).toContain('Up 12 Down 3 Sideways 0')
    expect(words).toContain('Silver → Gold · Up 12')
    expect(words).toContain('Gold → Silver · Down 3')
  })

  it('says what is overdue and lists the six months ahead', () => {
    const words = text(render(manager))
    expect(words).toContain('160 points of 2 members have reached their date and go at the next expiry run.')
    expect(words).toContain('October 2026 30')
    expect(words).toContain('March 2027 20')
  })

  it('splits engagement into four groups with their shares and what puts a member in each', () => {
    const words = text(render(manager))
    expect(words).toContain('New 31 · 3%')
    expect(words).toContain('Dormant 573 · 48%')
    expect(words).toContain('At risk: Last activity 31 to 90 days ago')
  })

  it('names the balance bands', () => {
    const words = text(render(manager))
    for (const band of ['Below zero 1', 'None 100', '1–500 500', '501–2,000 400', '10,001 or more 13']) expect(words).toContain(band)
  })

  it('lists the members gone quiet, linked to their page, and says when the list is cut short', () => {
    const html = render(manager)
    expect(html).toContain('href="/loyalty/members/77"')
    const words = text(html)
    expect(words).toContain('The 1 quietest of 140.')
    expect(words).toContain('Last seen Mar 1, 2026 · days quiet: 218')
    expect(words).toContain('640 pts')
    expect(html).toMatch(/<option value="60" selected="">60 days<\/option>/)
  })

  it('offers the address\'s own number of quiet days', () => {
    const html = render(manager, { search: '?quiet=45', quiet: { ...atRisk, days: 45 } })
    expect(html).toMatch(/<option value="45" selected="">45 days<\/option>/)
  })

  it('says what will appear once an empty programme has members, and draws nothing', () => {
    const html = render(manager, { data: insights({ tiles: { members: 0, new_members: 0, active_members: 0, issued: 0, redeemed: 0, expired: 0, outstanding: 0, redemption_rate: null } }) })
    expect(text(html)).toContain('Nothing to show yet. Once members join and earn points')
    expect(html).not.toContain('data-chart')
    expect(html).not.toContain('data-at-risk')
  })

  it('shows staff without the right a calm notice and no figures, the period choice or a request', () => {
    const html = render(can(), { data: null, quiet: null })
    expect(text(html)).toContain('Insights are for owners, managers and staff who may see analytics.')
    expect(html).not.toContain('aria-pressed')
    expect(html).not.toContain('Loading…')
    expect(html).not.toContain('role="alert"')
  })

  it('waits for the figures with a quiet stand-in', () => {
    expect(render(manager, { data: null })).toContain('Loading…')
  })
})
