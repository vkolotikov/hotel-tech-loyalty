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
import type { NfcCardRow } from '../scan/cardsApi'
import { cardActions } from './memberMath'
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

function render(c: Can, data: MemberDetail, cards?: NfcCardRow[]) {
  const client = new QueryClient()
  client.setQueryData(['loyalty', 'member', 30], data)
  client.setQueryData(['loyalty', 'history', 30, 1], history)
  if (cards) client.setQueryData(['loyalty', 'cards', 30], { cards })
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
    expect(words).toContain('Language German')
    expect(words).toContain('Nationality American')
    expect(words).toContain('Date of birth December 9, 1906')
    expect(words).toContain('Marketing emails Agreed')
    expect(words).toContain('Tier kept until Dec 31, 2026')
  })

  it('says each fact once: name, number, joined, email and phone in the header, not again in the details (release 9)', () => {
    const html = render(can(), detail())
    for (const once of ['grace@example.test', '+1 555 0100', 'HL-2026-000030', 'Joined Jan 5, 2026']) {
      expect(html.split(once).length - 1, once).toBe(1)
    }
    expect(html).toContain('data-contact="email"')
    expect(html).toContain('data-contact="phone"')
    for (const gone of ['data-detail="email"', 'data-detail="phone"', 'data-detail="number"', 'data-detail="joined"']) expect(html).not.toContain(gone)
  })

  it('says “Not given” for what nobody filled, and shows no phone when there is none', () => {
    const html = render(can(), detail({ phone: null, language: null, nationality: null, date_of_birth: null, marketing_consent: false, tier_override_until: null }))
    const words = text(html)
    expect(words).toContain('Language Not given')
    expect(words).toContain('Nationality Not given')
    expect(words).toContain('Marketing emails Not agreed')
    expect(words).not.toContain('Tier kept until')
    expect(html).not.toContain('data-contact="phone"')
  })

  it('keeps Award and Redeem as words, Edit details and Card as named icons, and the rest under ⋯ More', () => {
    const html = render(can(), detail())
    const words = text(html)
    expect(words).toContain('Award points')
    expect(words).toContain('Redeem points')
    for (const named of ['Edit details', 'Card', 'More']) expect(html, named).toContain(`aria-label="${named}"`)
    expect(html).toContain('title="Edit details"')
    // The full admin's link and the manager's actions are items of the closed ⋯ menu.
    expect(words).not.toContain('Open in full admin')
  })

  it('a staff member without the money rights sees neither Award nor Redeem, and still the icons', () => {
    const html = render(can({ award: false, redeem: false }), detail())
    expect(text(html)).not.toContain('Award points')
    expect(text(html)).not.toContain('Redeem points')
    expect(html).toContain('aria-label="Edit details"')
  })

  it('a deleted member shows only what stays: the number and the history', () => {
    const html = render(can({ manage_members: true }), detail({ is_erased: true, name: 'Deleted Member', email: 'deleted-member-30@deleted.local', is_active: false }))
    const words = text(html)
    expect(words).toContain('Deleted member')
    expect(words).toContain('HL-2026-000030')
    expect(words).toContain('This member was deleted.')
    expect(words).toContain('Points history')
    expect(words).toContain('Spa visit')
    for (const gone of ['Award points', 'Redeem points', 'Details', 'deleted-member-30@deleted.local']) expect(words).not.toContain(gone)
    for (const gone of ['aria-label="Edit details"', 'aria-label="Card"', 'aria-label="More"']) expect(html).not.toContain(gone)
  })
})

describe('the points history (release 9)', () => {
  const lines = (more: Partial<HistoryPage['lines'][number]>[]): HistoryPage => ({
    page: 1, pages: 1, total: more.length,
    lines: more.map((m, i) => ({ id: i + 1, type: 'earn', points: 100, balance_after: 100, description: '', by: null, at: '2026-10-01T10:00:00+00:00', is_reversed: false, reversal_of_id: null, can_reverse: true, ...m })),
  })
  function withHistory(c: Can, page: HistoryPage) {
    const client = new QueryClient()
    client.setQueryData(['loyalty', 'member', 30], detail())
    client.setQueryData(['loyalty', 'history', 30, 1], page)
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

  it('says a line’s kind once: as its title when it has no description, in the meta when it has one', () => {
    const html = withHistory(can(), lines([{ type: 'adjust', description: '' }, { type: 'bonus', description: 'Birthday bonus' }]))
    const first = text(html.slice(html.indexOf('data-line="1"'), html.indexOf('data-line="2"')))
    expect(first.match(/Adjustment/g)).toHaveLength(1)
    const second = text(html.slice(html.indexOf('data-line="2"')))
    expect(second).toContain('Birthday bonus')
    expect(second).toContain('Bonus ·')
  })

  it('offers Reverse to a manager as a named icon on a line that can be reversed, to nobody else', () => {
    const manager = withHistory(can({ reverse: true }), lines([{}, { can_reverse: false }]))
    expect(manager.match(/aria-label="Reverse"/g)).toHaveLength(1)
    expect(manager).toContain('title="Reverse"')
    expect(withHistory(can(), lines([{}]))).not.toContain('aria-label="Reverse"')
  })
})

describe('a member’s NFC cards (release 5)', () => {
  const cards: NfcCardRow[] = [
    { id: 7, uid: '04a2b3c4d5e6f7', is_active: true, linked_at: '2026-10-01T10:00:00+00:00', last_used_at: '2026-10-20T08:00:00+00:00', scans: 3 },
    { id: 6, uid: '04112233', is_active: false, linked_at: '2026-09-01T10:00:00+00:00', last_used_at: null, scans: 0 },
  ]

  it('lists each card shortened, when it was linked and last used, on or off, with Switch off on the active one', () => {
    const html = render(can(), detail(), cards)
    const words = text(html)
    expect(words).toContain('NFC cards')
    expect(words).toContain('Link NFC card')
    expect(words).toContain('04:A2:…:E6:F7')
    expect(words).toContain('Linked Oct 1, 2026 · Last used Oct 20, 2026')
    expect(words).toContain('04:11:22:33')
    expect(words).toContain('Not used yet')
    expect(words).toContain('On')
    expect(words).toContain('Switched off')
    expect(html.match(/Switch off</g)).toHaveLength(1)
    expect(html).toContain('title="04:A2:B3:C4:D5:E6:F7"')
  })

  it('says when no card is linked', () => {
    expect(text(render(can(), detail(), []))).toContain('No NFC card is linked to this member.')
  })

  it('every staff member may link and switch off; a deleted member has no cards to show', () => {
    expect(cardActions({ is_erased: false })).toEqual({ link: true, off: true })
    expect(cardActions({ is_erased: true })).toEqual({ link: false, off: false })
    const words = text(render(can(), detail({ is_erased: true, name: 'Deleted Member', email: 'deleted-member-30@deleted.local', is_active: false }), cards))
    expect(words).not.toContain('NFC cards')
    expect(words).not.toContain('Link NFC card')
  })
})
