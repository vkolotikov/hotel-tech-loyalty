import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
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
import { PROGRAM_KEY, removalKey } from './api'
import { ProgramPage } from './ProgramPage'
import { moveTarget, tierRemovalLines } from './programMath'
import { RemoveBenefit, RemoveTier, RenameDialog } from './RemoveDialogs'
import type { Benefit, Program, Tier, TierRemoval } from './types'

const can = (manager: boolean): Can => ({ award: true, redeem: true, reverse: manager, manage_program: manager, manage_rewards: false, manage_members: false, view_insights: false, manage_campaigns: false, manage_app: false })
const boot = (manager: boolean): Bootstrap => ({
  name: 'HexaTech Loyalty',
  organization: { id: 1, name: 'Lumière', industry: 'beauty' },
  accent: null,
  venue: { timezone: 'Europe/Riga', timezone_named: true, today: '2026-10-26', currency: 'EUR' },
  features: { campaigns: true, wallet: true, push: true },
  staff: { id: 5, name: 'Ada', role: manager ? 'manager' : 'staff', can: can(manager) },
  programme: { on: true, tiers: [] },
  counts: { members: 40, requests_waiting: 0 },
})
const silver: Tier = { id: 1, name: 'Silver', description: null, color: '#9aa4b1', min_points: 0, min_nights: null, min_stays: null, min_spend: null, earn_rate: 1, is_active: true, sort_order: 1, members: 12, benefits: [] }
const spa: Benefit = { id: 7, name: 'Spa access', code: 'SPA', description: null, category: 'wellness', fulfillment_mode: 'on_request', is_active: true, sort_order: 0 }
const removal = (more: Partial<TierRemoval> = {}): TierRemoval => ({
  tier: { id: 1, name: 'Silver' }, members: 12, members_off: 0, blocked: null, move_to: 2,
  move_options: [{ id: 2, name: 'Gold' }, { id: 3, name: 'Platinum' }],
  benefits: 2,
  places: [{ id: 4, name: 'Lounge', only: false }, { id: 5, name: 'Spa', only: true }],
  events: [{ id: 6, name: 'Silver tasting', only: true }],
  boosts: [{ id: 7, name: 'Silver days', only: true }],
  offers: [],
  segments: [{ id: 8, name: 'Silver or Gold', only: false }],
  ...more,
})
const program: Program = {
  tiers: [silver],
  benefits: [spa],
  boosts: [],
  options: { categories: ['wellness'], fulfillment_modes: ['on_request'], value_types: ['text'], applies_to: ['all'], brands: [] },
} as unknown as Program

function wrap(children: ReactNode, manager: boolean, seed: (client: QueryClient) => void = () => {}, at = '/loyalty/program') {
  const client = new QueryClient()
  seed(client)
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[at]}>
        <LoyaltyContext.Provider value={{ data: boot(manager), isLoading: false, isError: false, error: null, refetch: () => {} }}>{children}</LoyaltyContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('Deleting and renaming tiers and benefits (release 11, owner 2026-10-26)', () => {
  it('says what else a delete changes, in order, the ones that need staff afterwards marked', () => {
    expect(tierRemovalLines(removal()).map(l => [l.code, l.warn])).toEqual([
      ['benefits', false], ['place', false], ['place_only', true], ['event_only', true], ['boost_only', true], ['segment', false],
    ])
    expect(tierRemovalLines(removal()).find(l => l.code === 'place_only')?.vars).toEqual({ name: 'Spa', tier: 'Silver' })
    expect(tierRemovalLines(removal({ benefits: 0, places: [], events: [], boosts: [], segments: [] }))).toEqual([])
  })

  it('moves members to the tier chosen while it is offered, else to the one the server suggests', () => {
    expect(moveTarget(removal(), null)).toBe(2)
    expect(moveTarget(removal(), 3)).toBe(3)
    // A choice no longer offered (deleted meanwhile) falls back to the suggestion.
    expect(moveTarget(removal(), 99)).toBe(2)
    expect(moveTarget(removal({ move_to: null, move_options: [], blocked: 'last_tier' }), null)).toBeNull()
  })

  it('asks where the members go and lists the rest before the delete', () => {
    const html = wrap(<RemoveTier tier={silver} onClose={() => {}} />, true, c => c.setQueryData(removalKey('tier', 1), { removal: removal() }))
    const words = text(html)
    expect(words).toContain('Delete Silver?')
    expect(words).toContain('Silver leaves the programme and every list. Members’ history keeps its name.')
    expect(words).toContain('Members of Silver (12) move to')
    expect(html).toMatch(/<option value="2" selected="">Gold<\/option><option value="3">Platinum<\/option>/)
    expect(words).toContain('Their points stay as they are. They are not sent a message.')
    expect([...html.matchAll(/data-line="([a-z_]+)"/g)].map(m => m[1])).toEqual(['benefits', 'place', 'place_only', 'event_only', 'boost_only', 'segment'])
    expect(html).toMatch(/data-line="place_only" data-warn=""/)
    expect(words).toContain('Spa lets in only Silver: afterwards it lets in no tier until you choose its tiers again.')
    expect(words).toContain('The boost “Silver days” is for Silver only, so it is switched off.')
    expect(words).toContain('Keep it')
    expect(words).toContain('Delete Silver')
  })

  it('says nobody holds a tier without members, and offers no delete of the last tier switched on', () => {
    const empty = text(wrap(<RemoveTier tier={silver} onClose={() => {}} />, true, c => c.setQueryData(removalKey('tier', 1), { removal: removal({ members: 0, benefits: 0, places: [], events: [], boosts: [], segments: [] }) })))
    expect(empty).toContain('No member holds this tier.')
    // Switched-off members move too: counted apart from the card's figure, or on their own when nobody else holds it.
    const both = text(wrap(<RemoveTier tier={silver} onClose={() => {}} />, true, c => c.setQueryData(removalKey('tier', 1), { removal: removal({ members_off: 2 }) })))
    expect(both).toContain('Members of Silver (12) move to')
    expect(both).toContain('They are not sent a message. Switched-off members (2) move with them.')
    const offOnly = text(wrap(<RemoveTier tier={silver} onClose={() => {}} />, true, c => c.setQueryData(removalKey('tier', 1), { removal: removal({ members: 0, members_off: 3 }) })))
    expect(offOnly).toContain('Switched-off members of Silver (3) move to')
    expect(offOnly).not.toContain('No member holds')
    expect(empty).not.toContain('move to')
    expect(empty).not.toContain('It also changes')

    const last = wrap(<RemoveTier tier={silver} onClose={() => {}} />, true, c => c.setQueryData(removalKey('tier', 1), { removal: removal({ blocked: 'last_tier', move_to: null, move_options: [] }) }))
    expect(text(last)).toContain('Silver is the last tier switched on. Members need a tier, so it cannot be deleted. Add or switch on another tier first.')
    expect(text(last)).toContain('Close')
    expect(last).not.toContain('Delete Silver<')
    expect(last).not.toContain('move to')
  })

  it('says where a benefit goes from and what stays of it', () => {
    const words = text(wrap(<RemoveBenefit benefit={spa} onClose={() => {}} />, true, c => c.setQueryData(removalKey('benefit', 7), { removal: { benefit: { id: 7, name: 'Spa access' }, tiers: ['Silver', 'Gold'], waiting: 3, requests: 9 } })))
    expect(words).toContain('Delete Spa access?')
    expect(words).toContain('It leaves the catalogue and the tiers that give it: Silver · Gold.')
    expect(words).toContain('Requests for it still waiting: 3. They stay in Requests for you to approve or decline.')
    expect(words).toContain('Members’ past requests keep its name.')
    expect(words).toContain('To pause it instead, switch it off')
    expect(words).toContain('Delete benefit')

    const none = text(wrap(<RemoveBenefit benefit={spa} onClose={() => {}} />, true, c => c.setQueryData(removalKey('benefit', 7), { removal: { benefit: { id: 7, name: 'Spa access' }, tiers: [], waiting: 0, requests: 0 } })))
    expect(none).toContain('It leaves the catalogue. No tier gives it now.')
    expect(none).not.toContain('still waiting')
    expect(none).not.toContain('past requests')
  })

  it('renames with the name alone, the current one filled in', () => {
    const html = wrap(<RenameDialog subject={{ kind: 'tier', tier: silver }} onClose={() => {}} />, true)
    expect(text(html)).toContain('Rename Silver')
    expect(html).toMatch(/value="Silver"/)
    expect(text(html)).toContain('Members see the new name on their card, in the app and in the portal.')
    expect(text(wrap(<RenameDialog subject={{ kind: 'benefit', benefit: spa }} onClose={() => {}} />, true))).toContain('Members see the new name in the app and the portal, on their requests too.')
  })

  it('gives a manager Rename, Edit and Delete on each tier and benefit, in words on a tier card; nobody else', () => {
    const tiers = wrap(<ProgramPage />, true, c => c.setQueryData(PROGRAM_KEY, program))
    expect(tiers).toMatch(/data-tier-actions=""/)
    expect(text(tiers)).toContain('Rename Silver Edit Silver Delete Silver')
    const benefits = wrap(<ProgramPage />, true, c => c.setQueryData(PROGRAM_KEY, program), '/loyalty/program?tab=benefits')
    for (const word of ['Rename', 'Edit', 'Delete']) expect(benefits).toContain(`<span class="sr-only">${word} Spa access</span>`)

    const staff = wrap(<ProgramPage />, false, c => c.setQueryData(PROGRAM_KEY, program)) + wrap(<ProgramPage />, false, c => c.setQueryData(PROGRAM_KEY, program), '/loyalty/program?tab=benefits')
    expect(staff).not.toContain('data-tier-actions')
    expect(staff).not.toMatch(/Rename|Delete/)
  })
})
