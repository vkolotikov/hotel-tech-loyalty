import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
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
import type { Bootstrap, Can, HistoryPage, MemberDetail } from '../lib/types'
import { MemberPage } from './MemberPage'

const can = (more: Partial<Can> = {}): Can => ({ award: true, redeem: true, reverse: false, manage_program: false, manage_rewards: false, manage_members: false, view_insights: false, manage_campaigns: false, manage_app: false, ...more })
const boot = (c: Can): Bootstrap => ({
  name: 'HexaTech Loyalty',
  organization: { id: 1, name: 'Lumière', industry: 'hotel' },
  accent: null,
  venue: { timezone: 'Europe/Riga', timezone_named: true, today: '2026-10-21', currency: 'EUR' },
  features: { campaigns: true, wallet: true, push: true },
  staff: { id: 5, name: 'Ada', role: c.manage_members ? 'manager' : 'staff', can: c },
  programme: { on: true, tiers: [{ id: 2, name: 'Gold', color: '#c9a227', min_points: 1000, is_active: true }] },
  counts: { members: 40, requests_waiting: 2 },
})
const detail = (member: Partial<MemberDetail['member']> = {}): MemberDetail => ({
  member: {
    id: 30, name: 'Grace Hopper', email: 'grace@example.test', phone: '+1 555 0100', member_number: 'HL-2026-000030', tier_id: 2, points: 1500,
    lifetime_points: 1800, is_active: true, joined_at: '2026-01-05T10:00:00+00:00', last_activity_at: null, qualifying_points: 1500, referral_code: 'GRACE1',
    language: 'de', nationality: 'American', date_of_birth: '1906-12-09', marketing_consent: true, tier_override_until: '2026-12-31T21:59:59+00:00',
    is_erased: false, ...member,
  },
  progress: { qualifying: 1500, next_tier: null, needed: 0, percent: 100 },
  benefits: [],
  requests: [],
  options: { languages: ['en', 'ru', 'de', 'fr', 'es'] },
})
const history: HistoryPage = {
  page: 1, pages: 1, total: 1,
  lines: [{ id: 1, type: 'earn', points: 200, balance_after: 1500, description: 'Spa visit', by: null, at: '2026-10-01T10:00:00+00:00', is_reversed: false, reversal_of_id: null, can_reverse: false }],
}

function render(c: Can, data: MemberDetail) {
  const client = new QueryClient()
  client.setQueryData(['loyalty', 'member', 30], data)
  client.setQueryData(['loyalty', 'history', 30, 1], history)
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/loyalty/members/30']}>
        <LoyaltyContext.Provider value={{ data: boot(c), isLoading: false, isError: false, error: null, refetch: () => {} }}>
          <Routes><Route path="/loyalty/members/:id" element={<MemberPage />} /></Routes>
        </LoyaltyContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('a member’s page, release 2 (§4.1)', () => {
  it('shows the details block with every field and the day the tier is kept until', () => {
    const html = render(can(), detail())
    const words = text(html)
    expect(words).toContain('Details')
    expect(words).toContain('Email grace@example.test')
    expect(words).toContain('Phone +1 555 0100')
    expect(words).toContain('Language German')
    expect(words).toContain('Nationality American')
    expect(words).toContain('Date of birth December 9, 1906')
    expect(words).toContain('Marketing emails Agreed')
    expect(words).toContain('Member number HL-2026-000030')
    expect(words).toContain('Joined Jan 5, 2026')
    expect(words).toContain('Tier kept until Dec 31, 2026')
  })

  it('says “Not given” for what nobody filled', () => {
    const words = text(render(can(), detail({ phone: null, language: null, nationality: null, date_of_birth: null, marketing_consent: false, tier_override_until: null })))
    expect(words).toContain('Phone Not given')
    expect(words).toContain('Language Not given')
    expect(words).toContain('Marketing emails Not agreed')
    expect(words).not.toContain('Tier kept until')
  })

  it('gives staff Edit details, Card and a More menu, and no manager’s actions', () => {
    const words = text(render(can(), detail()))
    expect(words).toContain('Edit details')
    expect(words).toContain('Card')
    expect(words).toContain('More')
    expect(words).toContain('Award points')
  })

  it('a deleted member shows only what stays: the number and the history', () => {
    const html = render(can({ manage_members: true }), detail({ is_erased: true, name: 'Deleted Member', email: 'deleted-member-30@deleted.local', is_active: false }))
    const words = text(html)
    expect(words).toContain('Deleted member')
    expect(words).toContain('HL-2026-000030')
    expect(words).toContain('This member was deleted.')
    expect(words).toContain('Points history')
    expect(words).toContain('Spa visit')
    for (const gone of ['Award points', 'Redeem points', 'Edit details', 'More', 'Details', 'deleted-member-30@deleted.local']) expect(words).not.toContain(gone)
  })
})
