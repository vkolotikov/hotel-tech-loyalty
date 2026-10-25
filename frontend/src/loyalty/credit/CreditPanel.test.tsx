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
import type { Bootstrap, Can, MemberRow, Ways } from '../lib/types'
import type { CreditPage } from './creditApi'
import { CreditPanel } from './CreditPanel'
import { CreditSummary } from './CreditSummary'

const can = (more: Partial<Can> = {}): Can => ({ award: true, redeem: true, reverse: false, manage_program: false, manage_rewards: false, manage_members: false, view_insights: false, manage_campaigns: false, manage_app: false, ...more })
const ways = (cashback: boolean): Ways => ({ stamps: false, stamps_per_card: 10, checkin: false, checkin_points: 0, desk_earn: false, cashback, cashback_percent: 5, setup_done: true })
const boot = (c: Can, w?: Ways): Bootstrap => ({
  name: 'HexaTech Loyalty',
  organization: { id: 1, name: 'Lumière', industry: 'beauty' },
  accent: null,
  venue: { timezone: 'Europe/Riga', timezone_named: true, today: '2026-10-25', currency: 'EUR' },
  features: { campaigns: true, wallet: true, push: true },
  staff: { id: 5, name: 'Ada', role: 'staff', can: c },
  programme: { on: true, tiers: [], ...(w ? { ways: w } : {}) },
  counts: { members: 40, requests_waiting: 0 },
})
const member = (balance?: number): MemberRow => ({
  id: 30, name: 'Grace Hopper', email: 'grace@example.test', phone: null, member_number: 'LS-000030', tier_id: null, points: 200, lifetime_points: 200,
  is_active: true, joined_at: '2026-01-05T10:00:00+00:00', last_activity_at: null, ...(balance !== undefined ? { credit_balance: balance } : {}),
})
const page: CreditPage = {
  enabled: true, balance: 7.5, currency: 'EUR',
  lines: [
    { id: 3, type: 'spend', amount: -4.9, balance_after: 7.5, currency: 'EUR', note: 'Two coffees', reference_type: null, created_at: '2026-10-25T09:30:00+00:00', by: 'Ada' },
    { id: 2, type: 'earn', amount: 12.4, balance_after: 12.4, currency: 'EUR', note: '5% cashback on 248.00 EUR', reference_type: 'service_booking', created_at: '2026-10-24T15:00:00+00:00', by: null },
  ],
  pagination: { page: 1, pages: 1, total: 2, per_page: 25 },
}

function render(node: ReactElement, b: Bootstrap, data?: CreditPage) {
  const client = new QueryClient()
  if (data) client.setQueryData(['loyalty', 'credit', 30, 1], data)
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <LoyaltyContext.Provider value={{ data: b, isLoading: false, isError: false, error: null, refetch: () => {} }}>{node}</LoyaltyContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('the credit on a member’s page', () => {
  it('shows the balance, Use credit and the history in the venue’s currency, and not the rate again (release 9)', () => {
    const words = text(render(<CreditPanel member={member(7.5)} locale="en" timeZone="Europe/Riga" />, boot(can(), ways(true)), page))
    expect(words).toContain('Credit')
    expect(words).toContain('€7.50')
    expect(words).not.toContain('Members get')
    expect(words).toContain('Use credit')
    expect(words).not.toContain('Adjust')
    expect(words).toContain('−€4.90')
    expect(words).toContain('Used at the desk · Two coffees')
    expect(words).toContain('by Ada')
    expect(words).toContain('+€12.40')
    expect(words).toContain('Cashback on an appointment')
    // The system's own note is a record, not shown.
    expect(words).not.toContain('5% cashback on 248.00 EUR')
  })

  it('offers Adjust to a manager and says when cashback is off but the credit can still be used', () => {
    const words = text(render(<CreditPanel member={member(7.5)} locale="en" timeZone="Europe/Riga" />, boot(can({ reverse: true }), ways(false)), { ...page, enabled: false }))
    expect(words).toContain('Adjust')
    expect(words).toContain('Cashback is switched off: nothing new is earned, and this credit can still be used at the desk.')
  })

  it('shows nothing when the venue does not use cashback and the member holds none, or the member was deleted', () => {
    expect(render(<CreditPanel member={member(0)} locale="en" timeZone="Europe/Riga" />, boot(can(), ways(false)))).toBe('')
    expect(render(<CreditPanel member={member()} locale="en" timeZone="Europe/Riga" />, boot(can()))).toBe('')
    expect(render(<CreditPanel member={{ ...member(5), is_erased: true }} locale="en" timeZone="Europe/Riga" />, boot(can(), ways(true)))).toBe('')
  })

  it('says so when there is no credit yet, and offers no Use credit on nothing', () => {
    const words = text(render(<CreditPanel member={member(0)} locale="en" timeZone="Europe/Riga" />, boot(can(), ways(true)), { ...page, balance: 0, lines: [], pagination: { page: 1, pages: 1, total: 0, per_page: 25 } }))
    expect(words).toContain('No credit yet.')
    expect(words).toContain('€0')
    expect(words).not.toContain('Use credit')
  })
})

describe('the credit on the Scan result', () => {
  it('shows the member’s balance and Use credit', () => {
    const words = text(render(<CreditSummary member={member(12.4)} />, boot(can(), ways(true))))
    expect(words).toContain('Credit €12.40')
    expect(words).toContain('Use credit')
    expect(words).not.toContain('Adjust')
  })

  it('shows a balance earned before cashback was switched off, and nothing without one', () => {
    expect(text(render(<CreditSummary member={member(3)} />, boot(can({ redeem: false, reverse: true }), ways(false))))).toContain('Credit €3 Adjust')
    expect(render(<CreditSummary member={member(0)} />, boot(can(), ways(false)))).toBe('')
  })
})
