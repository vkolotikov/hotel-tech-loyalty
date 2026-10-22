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
vi.mock('../../lib/api', () => ({ api: {}, resolveImage: (url: string | null | undefined) => url ?? null }))

import { LoyaltyContext } from '../LoyaltyProvider'
import type { Bootstrap, Can } from '../lib/types'
import { campaignsKey, OPTIONS_KEY, SEGMENTS_KEY } from './api'
import { CampaignsPage } from './CampaignsPage'
import { SegmentDialog } from './SegmentDialog'
import type { CampaignsPage as CampaignsList, Segment, SegmentOptions } from './types'

const can = (more: Partial<Can> = {}): Can => ({ award: true, redeem: true, reverse: false, manage_program: false, manage_rewards: false, manage_members: false, view_insights: false, manage_campaigns: false, manage_app: false, ...more })
const boot = (c: Can, campaigns = true): Bootstrap => ({
  name: 'HexaTech Loyalty',
  organization: { id: 1, name: 'Lumière', industry: 'hotel' },
  accent: null,
  venue: { timezone: 'Europe/Riga', timezone_named: true, today: '2026-10-21', currency: 'EUR' },
  features: { campaigns, wallet: true, push: true },
  staff: { id: 5, name: 'Ada', role: c.manage_campaigns ? 'manager' : 'staff', can: c },
  programme: { on: true, tiers: [{ id: 1, name: 'Silver', color: '#9aa4b1', min_points: 0, is_active: true }, { id: 2, name: 'Gold', color: '#c9a227', min_points: 1000, is_active: true }] },
  counts: { members: 40, requests_waiting: 2 },
})
const manager = can({ manage_campaigns: true, manage_program: true })

const list: CampaignsList = {
  page: 1, pages: 1, total: 3,
  campaigns: [
    { id: 7, name: 'Autumn', subject: 'Our autumn', status: 'draft', segment: { id: 3, name: 'Gold' }, recipient_count: 0, sent_count: 0, failed_count: 0, sent_at: null,
      created_at: '2026-10-20T08:00:00+00:00', updated_at: '2026-10-20T09:00:00+00:00' },
    { id: 6, name: 'Summer', subject: 'Our summer', status: 'sent', segment: { id: 3, name: 'Gold' }, recipient_count: 1200, sent_count: 1195, failed_count: 5,
      sent_at: '2026-08-01T10:00:00+00:00', created_at: '2026-07-30T08:00:00+00:00', updated_at: '2026-08-01T10:00:00+00:00' },
    { id: 5, name: 'Spring', subject: '', status: 'sending', segment: null, recipient_count: 400, sent_count: 100, failed_count: 0, sent_at: null, created_at: null, updated_at: null },
  ],
}
const options: SegmentOptions = {
  operators: ['AND', 'OR'],
  max_rules: 20,
  types: [
    { type: 'tier', ops: ['in', 'not_in'], value: 'tiers', max: 50 },
    { type: 'activity', ops: ['active_within', 'inactive_over'], value: 'days', min: 1, max: 3650 },
    { type: 'current_points', ops: ['min', 'max'], value: 'points', min: 0, max: 10_000_000 },
    { type: 'earn', ops: ['any', 'none'], value: 'none' },
  ],
  tiers: [{ id: 1, name: 'Silver', color: '#9aa4b1', is_active: true }, { id: 2, name: 'Gold', color: '#c9a227', is_active: true }],
}
const segments: Segment[] = [
  { id: 3, name: 'Gold, quiet', description: 'Gold members not seen lately', everyone: false, operator: 'AND', members: 1200, problem: null, last_sent_at: '2026-08-01T10:00:00+00:00', updated_at: null,
    filters: [{ type: 'tier', op: 'in', value: [2] }, { type: 'activity', op: 'inactive_over', value: 60 }, { type: 'current_points', op: 'min', value: 1500 }] },
  { id: 4, name: 'All', description: null, everyone: true, operator: 'AND', filters: [], members: 40, problem: null, last_sent_at: null, updated_at: null },
  { id: 9, name: 'Lapsed', description: null, everyone: false, operator: 'AND', filters: [{ type: 'activity', op: 'inactive_days', value: 60 }], members: 40,
    problem: { index: 0, reason: 'unknown_op' }, last_sent_at: null, updated_at: null },
]

const render = (c: Can, path = '/loyalty/campaigns', feature = true) => {
  const client = new QueryClient()
  client.setQueryData(campaignsKey(1), list)
  client.setQueryData(SEGMENTS_KEY, { segments })
  client.setQueryData(OPTIONS_KEY, options)
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <LoyaltyContext.Provider value={{ data: boot(c, feature), isLoading: false, isError: false, error: null, refetch: () => {} }}>
          <CampaignsPage />
        </LoyaltyContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('Campaigns (spec 2026-10-21 release 2 §6)', () => {
  it('lists every campaign with its status and what it reached, and offers a new one', () => {
    const html = render(manager)
    const words = text(html)
    expect(html.indexOf('data-campaign="7"')).toBeLessThan(html.indexOf('data-campaign="6"'))
    expect(words).toContain('Autumn Our autumn Gold')
    expect(words).toContain('Draft')
    expect(words).toContain('1,195 of 1,200 sent · 5 failed')
    expect(words).toContain('Sending')
    expect(words).toContain('No subject yet')
    expect(words).toContain('No segment')
    expect(words).toContain('New campaign')
    expect(html).toContain('href="/loyalty/campaigns/6"')
    expect(html).toContain('aria-selected="true"')
  })

  it('says calmly that the plan has no campaigns, and Segments still work', () => {
    const words = text(render(manager, '/loyalty/campaigns', false))
    expect(words).toContain('Your plan does not include email campaigns. Segments still work here.')
    expect(words).not.toContain('New campaign')
    const segmentsWords = text(render(manager, '/loyalty/campaigns?tab=segments', false))
    expect(segmentsWords).toContain('Gold, quiet')
    expect(segmentsWords).toContain('New segment')
  })

  it('is a manager\'s: staff are told so and see no tab', () => {
    const html = render(can({ manage_rewards: true }))
    expect(text(html)).toContain('Only an owner or a manager can work with campaigns and segments.')
    expect(html).not.toContain('role="tab"')
    expect(text(html)).not.toContain('Autumn')
  })

  it('shows each segment\'s rules in words, its members now, when it was last sent, and a rule it cannot use', () => {
    const html = render(manager, '/loyalty/campaigns?tab=segments')
    const words = text(html)
    expect(words).toContain('Members who match all of these rules')
    expect(words).toContain('Tier is one of Gold')
    expect(words).toContain('Last activity before the last 60 days')
    expect(words).toContain('Points balance at least 1,500')
    expect(words).toContain('Every active member')
    expect(words).toContain('Members now 1,200')
    expect(words).toContain('Last sent Aug 1, 2026')
    expect(words).toContain('Rule 1 cannot be used: Choose how this rule compares. No campaign is sent to this segment until it is fixed.')
    expect(words).toContain('activity inactive_days')
    expect(html).toContain('data-segment="9"')
  })
})

describe('The segment editor', () => {
  const dialog = (segment: Segment | null) => {
    const client = new QueryClient()
    return renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <SegmentDialog segment={segment} options={options} onClose={() => {}} />
        </MemoryRouter>
      </QueryClientProvider>,
    )
  }

  it('starts a new segment with one rule to fill in and Everyone not chosen', () => {
    const html = dialog(null)
    const words = text(html)
    expect(words).toContain('New segment')
    expect(words).toContain('Rule 1')
    expect(words).toContain('Fill in every rule to see who matches.')
    const radios = html.match(/<input type="radio"[^>]*>/g) ?? []
    expect(radios).toHaveLength(2)
    expect(radios[0]).not.toContain('checked')
    expect(radios[1]).toContain('checked=""')
    expect(words).toContain('Add rule')
  })

  it('shows a stored segment\'s rules with values that suit their types, and counts while they are sound', () => {
    const html = dialog(segments[0])
    const words = text(html)
    expect(words).toContain('Change Gold, quiet')
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('value="60"')
    expect(words).toContain('days')
    expect(words).toContain('Counting…')
    expect(html).toContain('aria-label="Remove rule 3"')
  })

  it('names a rule the workspace does not know and counts nothing', () => {
    const html = dialog(segments[2])
    expect(text(html)).toContain('Choose how this rule compares.')
    expect(text(html)).toContain('Fill in every rule to see who matches.')
  })
})
