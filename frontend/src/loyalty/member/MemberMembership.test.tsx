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
import { leftText } from '../membership/ValidityCard'
import { LEFT_WORDS } from '../membership/words'
import { progressLine, type ProgressIn } from './memberMath'
import { MemberPage } from './MemberPage'

/**
 * A member's page in release 8 (spec 2026-10-25 §3): the Membership card — until when it holds, its state, and for a
 * manager Extend, Set a date and Remove the end date — and the way to the next tier in the programme's terms.
 */
const can = (manager: boolean): Can => ({
  award: true, redeem: true, reverse: manager, manage_program: manager, manage_rewards: false, manage_members: manager,
  view_insights: false, manage_campaigns: false, manage_app: false,
})
const boot = (c: Can): Bootstrap => ({
  name: 'HexaTech Loyalty',
  organization: { id: 1, name: 'North Club', industry: 'other' },
  accent: null,
  venue: { timezone: 'Europe/Riga', timezone_named: true, today: '2026-10-05', currency: 'EUR' },
  features: { campaigns: true, wallet: true, push: true },
  staff: { id: 5, name: 'Ada', role: c.manage_members ? 'manager' : 'staff', can: c },
  programme: { on: true, tiers: [{ id: 2, name: 'Gold', color: '#c9a227', min_points: 1000, is_active: true }], progress_by: 'visits' },
  counts: { members: 40, requests_waiting: 0 },
})
const detail = (member: Partial<MemberDetail['member']> = {}, progress: ProgressIn = { qualifying: 1500, next_tier: null, needed: 0, percent: 100 }): MemberDetail => ({
  member: {
    id: 30, name: 'Grace Hopper', email: 'grace@example.test', phone: null, member_number: 'HL-2026-000030', tier_id: 2, points: 1500,
    lifetime_points: 1800, is_active: true, joined_at: '2026-01-05T10:00:00+00:00', last_activity_at: null, qualifying_points: 1500, referral_code: 'GRACE1',
    language: 'en', nationality: null, date_of_birth: null, marketing_consent: false, tier_override_until: null, is_erased: false,
    valid_until: null, membership_state: 'active', ...member,
  },
  progress,
  benefits: [],
  requests: [],
  options: { languages: ['en'] },
})
const history: HistoryPage = { page: 1, pages: 1, total: 0, lines: [] }

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

describe('the Membership card on a member’s page', () => {
  it('says until when the membership holds and how long is left, with a manager’s actions', () => {
    const html = render(can(true), detail({ valid_until: '2027-12-08', membership_state: 'active' }))
    const words = text(html)
    expect(words).toContain('Membership')
    expect(words).toContain('Valid until Dec 8, 2027')
    expect(words).toContain('1 year 2 months left.')
    expect(words).toContain('Extend')
    expect(words).toContain('Set a date')
    expect(words).toContain('Remove the end date')
    expect(html).toContain('data-validity="active"')
  })

  it('says a membership without an end, one ending soon and one that ended, each in its words', () => {
    const none = text(render(can(true), detail()))
    expect(none).toContain('No end date')
    expect(none).toContain('The membership never ends.')
    expect(none).not.toContain('Remove the end date')

    const soon = render(can(true), detail({ valid_until: '2026-10-10', membership_state: 'expiring' }))
    expect(text(soon)).toContain('Ends in 5 days')
    expect(text(soon)).toContain('Ending soon')
    expect(soon).toContain('data-state="pending"')
    expect(text(render(can(true), detail({ valid_until: '2026-10-05', membership_state: 'expiring' })))).toContain('Ends today')

    const gone = render(can(true), detail({ valid_until: '2026-10-03', membership_state: 'expired' }))
    expect(text(gone)).toContain('Expired on Oct 3, 2026')
    expect(text(gone)).toContain('Places refuse entry until it is renewed.')
    expect(gone).toContain('data-state="declined"')
  })

  it('is read-only for staff who are not managers', () => {
    const words = text(render(can(false), detail({ valid_until: '2027-12-08', membership_state: 'active' })))
    expect(words).toContain('Valid until Dec 8, 2027')
    expect(words).toContain('Only an owner or a manager can change the end date.')
    expect(words).not.toContain('Set a date')
  })

  it('says the time left in its two largest parts', () => {
    const say = (_k: string, fallback: string, vars?: Record<string, unknown>) => fallback.replace(/\{\{(\w+)\}\}/g, (_, n) => String((vars ?? {})[n] ?? ''))
    expect(leftText({ years: 1, months: 2, days: 3 }, say)).toBe('1 year 2 months')
    expect(leftText({ years: 0, months: 3, days: 4 }, say)).toBe('3 months 4 days')
    expect(leftText({ years: 0, months: 0, days: 1 }, say)).toBe(LEFT_WORDS.days_one)
    expect(leftText({ years: 2, months: 0, days: 9 }, say)).toBe('2 years 9 days')
  })
})

describe('the way to the next tier, in the programme’s terms', () => {
  const gold = { id: 2, name: 'Gold', min_points: 1000 }

  it('reads visits and spend from the server’s measure, and points without one', () => {
    expect(progressLine({ qualifying: 1, next_tier: { ...gold, floor: 3 }, needed: 2, percent: 33, by: 'visits' })).toEqual({ kind: 'visits', by: 'visits', needed: 2, tier: 'Gold' })
    expect(progressLine({ qualifying: 2, next_tier: { ...gold, floor: 3 }, needed: 1, percent: 66, by: 'visits' }).kind).toBe('visit')
    expect(progressLine({ qualifying: 80, next_tier: { ...gold, floor: 200 }, needed: 120, percent: 40, by: 'spend' }).kind).toBe('spend')
    expect(progressLine({ qualifying: 200, next_tier: gold, needed: 800, percent: 20 })).toEqual({ kind: 'points', by: 'points', needed: 800, tier: 'Gold' })
    expect(progressLine({ qualifying: 5, next_tier: { ...gold, floor: 3 }, needed: 0, percent: 100, by: 'visits' }).kind).toBe('ready')
    expect(progressLine({ qualifying: 5, next_tier: null, needed: 0, percent: 100, by: 'visits' }).kind).toBe('top')
  })

  it('shows "3 more visits to Gold", "€120 more to Gold" and the points as before', () => {
    const visits = text(render(can(false), detail({}, { qualifying: 1, next_tier: { ...gold, floor: 4 }, needed: 3, percent: 25, by: 'visits' })))
    expect(visits).toContain('3 more visits to Gold')
    expect(visits).toContain('1 visit counted towards the tiers.')

    const spend = text(render(can(false), detail({}, { qualifying: 80, next_tier: { ...gold, floor: 200 }, needed: 120, percent: 40, by: 'spend' })))
    expect(spend).toContain('€120 more to Gold')
    expect(spend).toContain('€80 spent towards the tiers.')

    expect(text(render(can(false), detail({}, { qualifying: 200, next_tier: gold, needed: 800, percent: 20 })))).toContain('800 more to reach Gold')
  })
})
