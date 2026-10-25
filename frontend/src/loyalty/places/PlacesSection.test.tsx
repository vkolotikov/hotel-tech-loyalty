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
import type { Bootstrap, Can } from '../lib/types'
import { EntriesDialog, EntryRow } from './EntriesDialog'
import { PlaceDialog } from './PlaceDialog'
import { PlacesSection } from './PlacesSection'
import { PLACES_KEY, entriesKey, type EntriesPage, type Place, type PlacesList } from './placesApi'
import { TierPlaces } from './TierPlaces'

const can = (manager: boolean): Can => ({ award: true, redeem: true, reverse: manager, manage_program: manager, manage_rewards: false, manage_members: manager, view_insights: false, manage_campaigns: false, manage_app: false })
const boot = (manager: boolean): Bootstrap => ({
  name: 'HexaTech Loyalty',
  organization: { id: 1, name: 'Lumière', industry: 'fitness' },
  accent: null,
  venue: { timezone: 'Europe/Riga', timezone_named: true, today: '2026-10-05', currency: 'EUR' },
  features: { campaigns: true, wallet: true, push: true },
  staff: { id: 5, name: 'Sam', role: manager ? 'manager' : 'staff', can: can(manager) },
  programme: { on: true, tiers: [] },
  counts: { members: 40, requests_waiting: 0 },
})
const gold = { id: 2, name: 'Gold', color: '#c9a227' }
const platinum = { id: 3, name: 'Platinum', color: '#e5e4e2' }
const places: Place[] = [
  { id: 1, name: 'Main entrance', description: null, admits: 'all', tiers: [], is_active: true, sort_order: 1, today: { granted: 12, denied: 1 } },
  { id: 2, name: 'VIP lounge', description: 'Members’ bar, from 18:00', admits: 'tiers', tiers: [gold, platinum], is_active: true, sort_order: 2, today: { granted: 0, denied: 0 } },
  { id: 3, name: 'Old spa', description: null, admits: 'all', tiers: [], is_active: false, sort_order: 3, today: { granted: 0, denied: 0 } },
]
const list = (more: Partial<PlacesList> = {}): PlacesList => ({ places, tiers: [{ id: 1, name: 'Silver', color: '#9aa4b1' }, gold, platinum], can_change: true, ...more })

const render = (node: ReactElement, manager: boolean, seed: (client: QueryClient) => void = () => {}) => {
  const client = new QueryClient()
  seed(client)
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <LoyaltyContext.Provider value={{ data: boot(manager), isLoading: false, isError: false, error: null, refetch: () => {} }}>
          {node}
        </LoyaltyContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
const withList = (data: PlacesList) => (client: QueryClient) => client.setQueryData(PLACES_KEY, data)

describe('Program’s Places (release 8 §1)', () => {
  it('lists each place with who may enter, whether it is on and today’s entries', () => {
    const html = render(<PlacesSection manage />, true, withList(list()))
    const words = text(html)
    expect(words).toContain('Places')
    expect(words).toContain('Where members scan in, and which tiers may enter.')
    expect(html.indexOf('data-place="1"')).toBeLessThan(html.indexOf('data-place="2"'))
    expect(words).toContain('Main entrance Switched on')
    expect(words).toContain('Who may enter Every member')
    expect(words).toContain('Today: 12 in · 1 refused')
    expect(words).toContain('No entries today')
    expect(words).toContain('Old spa Switched off')
    expect(words).toContain('Members’ bar, from 18:00')
    // The tiers let in wear their own colours.
    expect(html).toMatch(/data-place="2"[\s\S]*?data-tier-chip[^>]*>[\s\S]*?Gold[\s\S]*?Platinum/)
    expect(words).toContain(': see the entries at Main entrance')
  })

  it('gives a manager Add a place and Edit', () => {
    const words = text(render(<PlacesSection manage />, true, withList(list())))
    expect(words).toContain('Add a place')
    expect(words).toContain('Edit Main entrance')
    expect(words).toContain('Edit VIP lounge')
  })

  it('shows staff everything but no change', () => {
    const words = text(render(<PlacesSection manage={false} />, false, withList(list({ can_change: false }))))
    expect(words).toContain('Today: 12 in · 1 refused')
    expect(words).not.toContain('Add a place')
    expect(words).not.toContain('Edit')
    // The server's word counts too: no change without it.
    expect(text(render(<PlacesSection manage />, true, withList(list({ can_change: false }))))).not.toContain('Add a place')
  })

  it('teaches the first step when there is no place', () => {
    const manager = text(render(<PlacesSection manage />, true, withList(list({ places: [] }))))
    expect(manager).toContain('No places yet. Add your entrance first: scans there say who may come in.')
    expect(manager).toContain('Add the entrance')
    const staff = text(render(<PlacesSection manage={false} />, false, withList(list({ places: [], can_change: false }))))
    expect(staff).toContain('No places yet. An owner or a manager adds them here.')
    expect(staff).not.toContain('Add the entrance')
  })

  it('says it is loading, with no action, until the list is read', () => {
    const html = render(<PlacesSection manage />, true)
    expect(text(html)).toContain('Loading…')
    expect(html).not.toContain('<button')
  })
})

describe('a tier’s places (one source: the places list)', () => {
  it('names the places a tier can enter', () => {
    const spa: Place = { ...places[1], id: 4, name: 'Spa', tiers: [platinum] }
    expect(text(render(<TierPlaces tierId={2} />, false, withList(list({ places: [...places, spa] }))))).toContain('Can enter: Main entrance, VIP lounge')
    expect(text(render(<TierPlaces tierId={2} />, false, withList(list())))).toContain('Can enter: every place')
    expect(text(render(<TierPlaces tierId={1} />, false, withList(list())))).toContain('Can enter: Main entrance')
    expect(text(render(<TierPlaces tierId={1} />, false, withList(list({ places: [places[1]] }))))).toContain('Can enter: no place yet')
  })

  it('says nothing without places, or before they are read', () => {
    expect(render(<TierPlaces tierId={2} />, false, withList(list({ places: [] })))).toBe('')
    expect(render(<TierPlaces tierId={2} />, false)).toBe('')
  })
})

describe('the place dialog', () => {
  it('asks for a name and who may enter, every member by default, switched on', () => {
    const html = render(<PlaceDialog place={null} places={places} tiers={list().tiers} onClose={() => {}} />, true)
    const words = text(html)
    expect(words).toContain('Add a place')
    expect(words).toContain('Name')
    expect(words).toContain('Who may enter')
    expect(words).toContain('Every member')
    expect(words).toContain('Only these tiers')
    expect(words).toContain('Description')
    expect(words).toContain('Switched on')
    expect(words).toContain('Add place')
    expect(html).toMatch(/<input[^>]*type="radio"[^>]*checked=""[^>]*>[\s\S]*?Every member/)
    expect(html).not.toContain('aria-pressed')
    expect(words).not.toContain('Remove place')
  })

  it('shows a place’s tiers ticked, in their colours, and offers Remove', () => {
    const html = render(<PlaceDialog place={places[1]} places={places} tiers={list().tiers} onClose={() => {}} onRemove={() => {}} />, true)
    const words = text(html)
    expect(words).toContain('Change VIP lounge')
    expect(html).toContain('value="VIP lounge"')
    expect((html.match(/aria-pressed="true"/g) ?? []).length).toBe(2)
    expect((html.match(/aria-pressed="false"/g) ?? []).length).toBe(1)
    expect(words).toContain('Remove place')
    expect(words).toContain('Save place')
  })

  it('says so when the programme has no tier to choose', () => {
    const tiersPlace = { ...places[1], tiers: [] }
    expect(text(render(<PlaceDialog place={tiersPlace} places={places} tiers={[]} onClose={() => {}} />, true)))
      .toContain('Your programme has no tiers in use yet. Add one under Tiers first.')
  })
})

describe('a place’s entries', () => {
  const page: EntriesPage = {
    entries: [
      { id: 9, at: '2026-10-05T19:02', member: { id: 7, name: 'Ada Lovelace', member_number: 'LS-000007' }, granted: true, reason: 'welcome', by: 'Sam' },
      { id: 8, at: '2026-10-05T18:40', member: { id: 8, name: 'Grace Hopper', member_number: 'LS-000008' }, granted: false, reason: 'expired', by: 'Sam' },
      { id: 7, at: '2026-10-05T18:00', member: null, granted: false, reason: 'not_found', by: null },
    ],
    page: 1, pages: 1, counts: { granted: 1, denied: 2 },
  }

  it('lists today’s scans, newest first, with the reason in words and an icon, never colour alone', () => {
    const html = render(<EntriesDialog place={places[0]} onClose={() => {}} />, false, (client) => client.setQueryData(entriesKey(1, '2026-10-05', 1), page))
    const words = text(html)
    expect(words).toContain('Entries at Main entrance')
    expect(words).toContain('Today · 1 in · 2 refused')
    expect(html.indexOf('data-entry="9"')).toBeLessThan(html.indexOf('data-entry="7"'))
    expect(words).toContain('19:02 Let in: Ada Lovelace LS-000007 Let in · by Sam')
    expect(words).toContain('18:40 Refused: Grace Hopper LS-000008 Membership expired · by Sam')
    expect(words).toContain('18:00 Refused: Unknown card or code No member has this card or number')
    expect(html).toContain('max="2026-10-05"')
    expect(html).toMatch(/aria-label="The day after"[^>]*disabled=""|disabled=""[^>]*aria-label="The day after"/)
  })

  it('says when nobody came', () => {
    const words = text(render(<EntriesDialog place={places[0]} onClose={() => {}} />, false,
      (client) => client.setQueryData(entriesKey(1, '2026-10-05', 1), { entries: [], page: 1, pages: 1, counts: { granted: 0, denied: 0 } })))
    expect(words).toContain('Nobody scanned in here on this day.')
  })

  it('an entry row stands alone', () => {
    expect(text(render(<ul><EntryRow entry={page.entries[1]} /></ul>, false))).toContain('Membership expired')
  })
})
