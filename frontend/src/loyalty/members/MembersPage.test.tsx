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
import type { Bootstrap, Can, MembersPage as MembersAnswer } from '../lib/types'
import { NO_FILTERS } from './membersQuery'
import { ListTools, MembersPage } from './MembersPage'

const can = (more: Partial<Can> = {}): Can => ({ award: true, redeem: true, reverse: false, manage_program: false, manage_rewards: false, manage_members: false, view_insights: false, manage_campaigns: false, manage_app: false, ...more })
const boot = (c: Can): Bootstrap => ({
  name: 'HexaTech Loyalty',
  organization: { id: 1, name: 'Lumière', industry: 'hotel' },
  accent: null,
  venue: { timezone: 'Europe/Riga', timezone_named: true, today: '2026-10-21', currency: 'EUR' },
  features: { campaigns: true, wallet: true, push: true },
  staff: { id: 5, name: 'Ada', role: c.manage_members ? 'manager' : 'staff', can: c },
  programme: { on: true, tiers: [] },
  counts: { members: 1, requests_waiting: 0 },
})
const page: MembersAnswer = {
  page: 1, pages: 1, total: 1, figures: { total: 1, active: 1, new_this_month: 0, average_points: 10, tiers: {} },
  members: [{ id: 3, name: 'Grace Hopper', email: 'grace@example.test', phone: null, member_number: 'HL-3', tier_id: null, points: 10, lifetime_points: 10, is_active: true, joined_at: null, last_activity_at: null }],
}

function render(c: Can) {
  const client = new QueryClient()
  client.setQueryData(['loyalty', 'members', NO_FILTERS], page)
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/loyalty']}>
        <LoyaltyContext.Provider value={{ data: boot(c), isLoading: false, isError: false, error: null, refetch: () => {} }}>
          <MembersPage />
        </LoyaltyContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('the members list’s actions (release 2 §4.1)', () => {
  it('gives everyone Add member', () => {
    const words = text(render(can()))
    expect(words).toContain('Add member')
    expect(words).toContain('Grace Hopper')
    for (const tool of ['Import', 'Export', 'Duplicates']) expect(words).not.toContain(tool)
  })

  it('gives a manager Import, Export and Duplicates, under the header’s ⋯ (release 9)', () => {
    const html = render(can({ manage_members: true }))
    expect(html).toContain('aria-label="More"')
    expect(render(can())).not.toContain('aria-label="More"')
    const tools = renderToStaticMarkup(<MemoryRouter><ListTools exporting={false} onExport={() => {}} /></MemoryRouter>)
    expect(text(tools)).toContain('Export')
    expect(tools).toContain('href="/loyalty/members/import"')
    expect(tools).toContain('href="/loyalty/members/duplicates"')
    expect(tools.match(/role="menuitem"/g)).toHaveLength(3)
  })

  it('shows each member with their initials, and Show and Order as named icons', () => {
    const html = render(can())
    expect(text(html)).toContain('GH')
    expect(html).toContain('title="Show"')
    expect(html).toContain('title="Order"')
  })
})
