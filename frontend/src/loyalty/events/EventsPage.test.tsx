import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const v = vars ?? {}
      const text = v.count === 1 && typeof v.defaultValue_one === 'string' ? v.defaultValue_one : typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String(v[name] ?? ''))
    },
    i18n: { language: 'en' },
  }),
}))
vi.mock('../../lib/api', () => ({ api: {}, resolveImage: (url: string | null | undefined) => url ?? null }))

import { LoyaltyContext } from '../LoyaltyProvider'
import type { Bootstrap, Can } from '../lib/types'
import { EventDialog } from './EventDialog'
import { EventPage } from './EventPage'
import { EventsPage } from './EventsPage'
import type { EventOne, EventPeople, EventsList, LoyaltyEventRow } from './types'

const can = (): Can => ({ award: true, redeem: true, reverse: false, manage_program: false, manage_rewards: false, manage_members: false, view_insights: false, manage_campaigns: false, manage_app: false })
const boot: Bootstrap = {
  name: 'HexaTech Loyalty',
  organization: { id: 1, name: 'Lumière', industry: 'other' },
  accent: null,
  venue: { timezone: 'Europe/Riga', timezone_named: true, today: '2026-10-05', currency: 'EUR' },
  features: { campaigns: true, wallet: true, push: true },
  staff: { id: 5, name: 'Ada', role: 'staff', can: can() },
  programme: { on: true, tiers: [{ id: 1, name: 'Silver', color: '#9aa4b1', min_points: 0, is_active: true }, { id: 2, name: 'Gold', color: '#c9a227', min_points: 1000, is_active: true }] },
  counts: { members: 40, requests_waiting: 0 },
}
const row = (more: Partial<LoyaltyEventRow> = {}): LoyaltyEventRow => ({
  id: 7, title: 'Wine tasting', description: 'Six wines from the Loire.', starts_at: '2026-10-09T18:00', ends_at: '2026-10-09T21:00', place: { id: 3, name: 'Main hall' }, location: null,
  admits: 'tiers', tiers: [{ id: 2, name: 'Gold', color: '#c9a227' }], points: 50, counts_as_visit: true, sign_up: true, walk_ins: true, capacity: 40, status: 'published', phase: 'upcoming',
  counts: { signed_up: 12, checked_in: 0, walk_ins: 0, room_left: 28 }, ...more,
})
const list = (events: LoyaltyEventRow[], canChange: boolean): EventsList => ({
  events, page: 1, pages: 1, total: events.length, totals: { upcoming: events.length, past: 4, drafts: 1 }, can_change: canChange, options: { places: [{ id: 3, name: 'Main hall', is_active: true }] },
})

function render(node: ReactNode, path: string, seed: (client: QueryClient) => void = () => {}) {
  const client = new QueryClient()
  seed(client)
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <LoyaltyContext.Provider value={{ data: boot, isLoading: false, isError: false, error: null, refetch: () => {} }}>
          <Routes><Route path="/loyalty/events" element={node} /><Route path="/loyalty/events/:id" element={node} /></Routes>
        </LoyaltyContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('the Events page', () => {
  it('shows each event as a card: the day, the times and where, who, what it gives, the numbers', () => {
    const html = render(<EventsPage />, '/loyalty/events', c => c.setQueryData(['loyalty', 'events', 'upcoming', 1], list([row()], true)))
    const words = text(html)
    expect(words).toContain('Upcoming 1')
    expect(words).toContain('Drafts 1')
    expect(words).toContain('New event')
    expect(words).toContain('Fri 9 Oct')
    expect(words).toContain('Wine tasting')
    expect(words).toContain('18:00–21:00')
    expect(words).toContain('Main hall')
    expect(words).toContain('Gold')
    expect(words).toContain('+50 points')
    expect(words).toContain('Counts as a visit')
    expect(words).toContain('12 signed up · 28 places left')
    expect(words).toContain('Published')
    expect(html).toContain('href="/loyalty/events/7"')
  })

  it('offers New event only to those who may change events, and says so when the tab is empty', () => {
    const words = text(render(<EventsPage />, '/loyalty/events', c => c.setQueryData(['loyalty', 'events', 'upcoming', 1], list([], false))))
    expect(words).not.toContain('New event')
    expect(words).toContain('No events coming up.')
    expect(words).toContain('Managers and staff allowed to manage offers create events.')
  })

  it('opens the tab the address names', () => {
    const words = text(render(<EventsPage />, '/loyalty/events?tab=drafts', c => c.setQueryData(['loyalty', 'events', 'drafts', 1], list([row({ status: 'draft', phase: 'draft', title: 'Autumn idea' })], true))))
    expect(words).toContain('Autumn idea')
    expect(words).toContain('Draft')
  })
})

describe('an event’s page', () => {
  const seed = (event: LoyaltyEventRow, canChange: boolean) => (c: QueryClient) => {
    const one: EventOne = { event, can_change: canChange, options: { places: [] } }
    const people: EventPeople = {
      event, counts: event.counts, page: 1, pages: 1, total: 3,
      people: [
        { member: { id: 30, name: 'Grace Hopper', member_number: 'LS-000030', tier: { id: 1, name: 'Silver', color: null } }, signed_up_at: '2026-10-01T10:00:00+00:00', cancelled_at: null, checked_in_at: '18:04', walk_in: false, source: 'portal' },
        { member: { id: 31, name: 'Alan Turing', member_number: 'LS-000031', tier: null }, signed_up_at: '2026-10-02T10:00:00+00:00', cancelled_at: null, checked_in_at: null, walk_in: false, source: 'staff' },
        { member: { id: 32, name: 'Ada Lovelace', member_number: 'LS-000032', tier: null }, signed_up_at: null, cancelled_at: null, checked_in_at: '18:10', walk_in: true, source: null },
      ],
    }
    c.setQueryData(['loyalty', 'event', event.id], one)
    c.setQueryData(['loyalty', 'event', event.id, 'people', 1], people)
  }

  it('shows the numbers, Start check-in, the people with their times, and the changes for who may', () => {
    const event = row({ phase: 'on_now', counts: { signed_up: 2, checked_in: 2, walk_ins: 1, room_left: 37 } })
    const html = render(<EventPage />, '/loyalty/events/7', seed(event, true))
    const words = text(html)
    expect(words).toContain('Friday, October 9, 2026 · 18:00–21:00')
    expect(words).toContain('Six wines from the Loire.')
    expect(words).toMatch(/Signed up 2 Checked in 2 Walk-ins 1 Places left 37/)
    expect(words).toContain('Start check-in')
    expect(words).toContain('Door mode')
    expect(html).toContain('href="/loyalty/scan/door?event=7"')
    expect(words).toContain('Check in by name')
    // Add a member, Edit and Cancel event wait under More (eventsMath.test.ts moreItems says which).
    expect(html).toMatch(/data-event-more=""[\s\S]*?aria-label="More"[^>]*aria-haspopup="menu"|data-event-more=""[\s\S]*?aria-haspopup="menu"[^>]*aria-label="More"/)
    expect(words).not.toContain('Delete draft')
    // Each number once: the tiles count them, the groups do not repeat them.
    expect(words).toContain('Signed up Grace Hopper')
    expect(words).not.toContain('Signed up · 2')
    expect(words).toContain('Checked in 18:04')
    expect(words).toContain('Walk-ins Ada Lovelace')
    expect(words).toContain('Walk-in · 18:10')
    expect(words).toContain('Cancel sign-up')
  })

  it('at an event without sign-up, everyone who came is simply checked in: no walk-ins', () => {
    const event = row({ sign_up: false, phase: 'on_now', counts: { signed_up: 0, checked_in: 1, walk_ins: 1, room_left: 39 } })
    const words = text(render(<EventPage />, '/loyalty/events/7', (c) => {
      seed(event, false)(c)
      c.setQueryData(['loyalty', 'event', 7, 'people', 1], {
        event, counts: event.counts, page: 1, pages: 1, total: 1,
        people: [{ member: { id: 32, name: 'Ada Lovelace', member_number: 'LS-000032', tier: null }, signed_up_at: null, cancelled_at: null, checked_in_at: '18:10', walk_in: true, source: null }],
      })
    }))
    expect(words).toMatch(/Checked in 1 Places left 39/)
    expect(words).not.toContain('Walk-in')
    expect(words).toContain('Checked in Ada Lovelace')
    expect(words).toContain('Checked in 18:10')
  })

  it('a member of staff without the right to change events still checks in and signs up', () => {
    const html = render(<EventPage />, '/loyalty/events/7', seed(row(), false))
    const words = text(html)
    expect(words).toContain('Start check-in')
    expect(html).toContain('data-event-more')
    expect(words).not.toContain('Edit')
    expect(words).not.toContain('Cancel event')
  })

  it('a draft says members do not see it and offers Publish and Delete draft', () => {
    const html = render(<EventPage />, '/loyalty/events/7', seed(row({ status: 'draft', phase: 'draft', starts_at: '2099-10-09T18:00', ends_at: '2099-10-09T21:00' }), true))
    const words = text(html)
    expect(words).toContain('A draft: members do not see it')
    expect(words).toContain('Publish')
    expect(html).toContain('data-event-more')
    expect(words).not.toContain('Start check-in')
  })
})

describe('the one dialog', () => {
  it('a new event starts at 18:00–21:00 for every member with 50 points, and saves as a draft or publishes', () => {
    const html = render(<EventDialog event={null} options={{ places: [{ id: 3, name: 'Main hall', is_active: true }, { id: 4, name: 'Old wing', is_active: false }] }} onClose={() => {}} />, '/loyalty/events')
    const words = text(html)
    for (const section of ['When', 'Where', 'Who may come', 'What attending gives', 'Sign-up']) expect(words).toContain(section)
    expect(html).toContain('value="18:00"')
    expect(html).toContain('value="21:00"')
    expect(html).toContain('value="50"')
    expect(html).toContain('Main hall')
    expect(html).not.toContain('Old wing')
    expect(html).toContain('aria-pressed="true"')
    expect(words).toContain('Every member')
    expect(words).toContain('Save as draft')
    expect(words).toContain('Publish')
    expect(words).toContain('On your venue’s clock (Europe/Riga).')
    expect(html).toMatch(/data-duration=""[^>]*>[\s\S]*?3 h 00 min/)
    // Only the hints that prevent a mistake are left.
    expect(words).not.toContain('Given at check-in')
    expect(words).not.toContain('Optional. Members read it in the portal.')
  })

  it('a published event saves its changes and says the members signed up are told', () => {
    const words = text(render(<EventDialog event={row()} options={{ places: [] }} onClose={() => {}} />, '/loyalty/events/7'))
    expect(words).toContain('Change Wine tasting')
    expect(words).toContain('Save changes')
    expect(words).not.toContain('Save as draft')
    expect(words).toContain('If the time or place changes, the members signed up get an inbox message and a push. 12 signed up')
  })
})
