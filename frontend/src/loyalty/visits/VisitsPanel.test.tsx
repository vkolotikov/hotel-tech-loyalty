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
import type { Bootstrap, Can, MemberRow, Ways } from '../lib/types'
import { DeskActions, DeskOutcome } from './DeskActions'
import type { StampsView } from './visitsApi'
import { VisitsPanel } from './VisitsPanel'

const can = (award = true): Can => ({ award, redeem: true, reverse: false, manage_program: false, manage_rewards: false, manage_members: false, view_insights: false, manage_campaigns: false, manage_app: false })
const ways = (more: Partial<Ways> = {}): Ways => ({
  stamps: true, stamps_per_card: 10, checkin: true, checkin_points: 10, desk_earn: true, cashback: true, cashback_percent: 5, setup_done: true, ...more,
})
const boot = (w: Ways | undefined, c: Can = can()): Bootstrap => ({
  name: 'HexaTech Loyalty',
  organization: { id: 1, name: 'Lumière', industry: 'beauty' },
  accent: null,
  venue: { timezone: 'Europe/Riga', timezone_named: true, today: '2026-10-05', currency: 'EUR' },
  features: { campaigns: true, wallet: true, push: true },
  staff: { id: 5, name: 'Ada', role: 'staff', can: c },
  programme: { on: true, tiers: [], ways: w },
  counts: { members: 40, requests_waiting: 0 },
})
const member: MemberRow & { is_erased: boolean } = {
  id: 30, name: 'Grace Hopper', email: null, phone: null, member_number: 'LS-000030', tier_id: null, points: 210, lifetime_points: 210, is_active: true,
  joined_at: null, last_activity_at: null, is_erased: false,
}
const view: StampsView = {
  enabled: true,
  stamps_per_card: 10,
  reward: { kind: 'reward', reward_id: 3, reward_name: 'Coffee' },
  card: {
    id: 4, number: 2, stamps_count: 7, stamps_needed: 10, completed_at: null,
    stamps: [{ venue_day: '2026-10-03', source: 'check_in', by: 'Ada' }],
  },
  completed_cards: 1,
  history: {
    stamps: [
      { id: 12, venue_day: '2026-10-03', source: 'check_in', by: 'Ada', card_number: 2 },
      { id: 11, venue_day: '2026-09-28', source: 'appointment', by: null, card_number: 2 },
    ],
    cards: [{ id: 3, number: 1, stamps_count: 10, stamps_needed: 10, completed_at: '2026-09-20T10:00:00+00:00', reward: { kind: 'points', points: 100 } }],
  },
}

function render(node: React.ReactNode, w: Ways | undefined, c?: Can, data?: StampsView) {
  const client = new QueryClient()
  if (data) client.setQueryData(['loyalty', 'stamps', 30], data)
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <LoyaltyContext.Provider value={{ data: boot(w, c), isLoading: false, isError: false, error: null, refetch: () => {} }}>{node}</LoyaltyContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('a member’s visits panel', () => {
  it('shows nothing when the venue uses none of the stamp card, check-in and earning at the desk', () => {
    expect(render(<VisitsPanel member={member} locale="en" timeZone="Europe/Riga" />, ways({ stamps: false, checkin: false, desk_earn: false }), can(), view)).toBe('')
    expect(render(<VisitsPanel member={member} locale="en" timeZone="Europe/Riga" />, undefined, can(), view)).toBe('')
  })

  it('draws the open card as circles with how many to go, what a full card gives, the desk and the history', () => {
    const html = render(<VisitsPanel member={member} locale="en" timeZone="Europe/Riga" />, ways(), can(), view)
    const words = text(html)
    expect(html.match(/data-filled=""/g)?.length).toBe(7)
    expect(html.match(/rounded-full border-2/g)?.length).toBe(10)
    expect(words).toContain('7 of 10 — 3 to go')
    expect(words).toContain('A full card gives a free Coffee.')
    // The count of completed cards once, beside the list's heading (release 9).
    expect(html).toMatch(/Completed cards\s*<span data-completed-cards=""[^>]*>1<\/span>/)
    expect(words).not.toContain('Cards completed')
    expect(words).toContain('Check in')
    expect(words).toContain('Add a purchase')
    expect(words).toContain('Recent stamps')
    expect(words).toContain('Check-in')
    expect(words).toContain('Oct 3, 2026 · Ada')
    expect(words).toContain('Appointment')
    expect(words).toContain('Card 1 · +100 points')
    expect(words).toContain('Sep 20, 2026')
  })

  it('names an event’s stamp, and one of a source it does not know, in words — never the server’s raw code', () => {
    const stamps = [
      { id: 21, venue_day: '2026-10-04', source: 'event', by: 'Ada', card_number: 2 },
      { id: 20, venue_day: '2026-10-03', source: 'mystery', by: null, card_number: 2 },
    ]
    const html = render(<VisitsPanel member={member} locale="en" timeZone="Europe/Riga" />, ways(), can(), { ...view, history: { stamps, cards: [] } })
    const words = text(html)
    expect(words).toContain('Event')
    expect(words).toContain('Visit')
    expect(words).not.toMatch(/\bevent\b|mystery/)
  })

  it('a venue with check-in but no stamp card shows the desk without a card', () => {
    const words = text(render(<VisitsPanel member={member} locale="en" timeZone="Europe/Riga" />, ways({ stamps: false, desk_earn: false }), can(), { ...view, enabled: false, card: null, history: { stamps: [], cards: [] } }))
    expect(words).toContain('Check in')
    expect(words).not.toContain('to go')
    expect(words).not.toContain('Add a purchase')
  })

  it('the first card, before any stamp, is drawn empty at the venue’s size', () => {
    const html = render(<VisitsPanel member={member} locale="en" timeZone="Europe/Riga" />, ways({ stamps_per_card: 6 }), can(), { ...view, stamps_per_card: 6, card: null, completed_cards: 0, history: { stamps: [], cards: [] }, reward: { kind: 'points', points: 50 } })
    expect(html.match(/rounded-full border-2/g)?.length).toBe(6)
    expect(html).not.toContain('data-filled=""')
    expect(text(html)).toContain('0 of 6 — 6 to go')
    expect(text(html)).toContain('A full card gives 50 points.')
  })
})

describe('the desk on the Scan result', () => {
  it('offers only what the venue uses, to whoever may award points', () => {
    expect(text(render(<DeskActions member={member} />, ways({ desk_earn: false })))).toContain('Check in')
    expect(text(render(<DeskActions member={member} />, ways({ desk_earn: false })))).not.toContain('Add a purchase')
    expect(render(<DeskActions member={member} />, ways(), can(false))).toBe('')
    expect(render(<DeskActions member={{ ...member, is_active: false }} />, ways())).toBe('')
  })

  it('says the answer in sentences', () => {
    const words = text(render(<DeskOutcome kind="purchase" answer={{
      already_today: true, points: { checkin: 0, purchase: 45, balance: 255 }, member,
      stamp: { added: false, reason: 'already_today', card: { id: 4, number: 2, stamps_count: 7, stamps_needed: 10, completed_at: null } },
      credit: { line_id: 3, amount: 2.25, balance: 12.4, currency: 'EUR' },
    }} />, ways()))
    expect(words).toContain('Already checked in today +45 points +€2.25 credit')
  })
})
