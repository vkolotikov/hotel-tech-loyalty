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
import type { Bootstrap, Can, MemberRow, MembersPage as MembersAnswer } from '../lib/types'
import { NO_FILTERS } from './membersQuery'
import { MembersPage } from './MembersPage'

/** The members list in release 8 (spec 2026-10-25 §3): Show by end date, the numbers line's counts, a row's end. */
const can: Can = { award: true, redeem: true, reverse: false, manage_program: false, manage_rewards: false, manage_members: false, view_insights: false, manage_campaigns: false, manage_app: false }
const boot: Bootstrap = {
  name: 'HexaTech Loyalty', organization: { id: 1, name: 'North Club', industry: 'other' }, accent: null,
  venue: { timezone: 'Europe/Riga', timezone_named: true, today: '2026-10-05', currency: 'EUR' },
  features: { campaigns: true, wallet: true, push: true }, staff: { id: 5, name: 'Ada', role: 'staff', can },
  programme: { on: true, tiers: [] }, counts: { members: 3, requests_waiting: 0 },
}
const row = (id: number, name: string, more: Partial<MemberRow>): MemberRow => ({
  id, name, email: null, phone: null, member_number: `HL-${id}`, tier_id: null, points: 0, lifetime_points: 0, is_active: true, joined_at: null, last_activity_at: null, ...more,
})
const page = { page: 1, pages: 1, total: 3, figures: { total: 3, active: 3, new_this_month: 0, average_points: 0, tiers: {}, expiring: 1, expired: 1 },
  members: [
    row(1, 'Soon Ending', { valid_until: '2026-10-20', membership_state: 'expiring' }),
    row(2, 'Long Gone', { valid_until: '2026-09-01', membership_state: 'expired' }),
    row(3, 'Far Off', { valid_until: '2027-06-01', membership_state: 'active' }),
  ] } as MembersAnswer

function render() {
  const client = new QueryClient()
  client.setQueryData(['loyalty', 'members', NO_FILTERS], page)
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/loyalty']}>
        <LoyaltyContext.Provider value={{ data: boot, isLoading: false, isError: false, error: null, refetch: () => {} }}><MembersPage /></LoyaltyContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('the members list by end date', () => {
  it('offers Expiring soon and Expired, counts them and says when a row’s membership ends', () => {
    const html = render()
    const words = text(html)
    expect(html).toContain('<option value="expiring">Expiring soon</option>')
    expect(html).toContain('<option value="expired">Expired</option>')
    expect(words).toContain('1 expiring soon')
    expect(words).toContain('1 expired')
    expect(words).toContain('Ends Oct 20, 2026')
    expect(words).toContain('Expired Sep 1, 2026')
    expect(words).not.toContain('Jun 1, 2027')
  })
})
