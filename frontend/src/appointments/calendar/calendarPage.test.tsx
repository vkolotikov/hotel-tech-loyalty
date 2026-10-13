import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppointmentsContext } from '../AppointmentsProvider'
import { CalendarPage } from './CalendarPage'
import type { Bootstrap } from '../lib/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en' },
  }),
}))

// Static rendering has no "previous day" to keep, so a test can say the calendar query is showing one (isPlaceholderData).
const forced = vi.hoisted(() => ({ placeholder: false }))
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return {
    ...actual,
    useQuery: ((options: Parameters<typeof actual.useQuery>[0]) => {
      const result = actual.useQuery(options)
      return forced.placeholder && options.queryKey[1] === 'calendar' ? { ...result, isPlaceholderData: true } : result
    }) as typeof actual.useQuery,
  }
})

const boot: Bootstrap = {
  name: 'HexaTech Appointments',
  organization: { id: 16, name: 'Lumière Salon', industry: 'beauty' },
  brand: null,
  venue: { timezone: 'Europe/London', timezone_named: true, today: '2026-10-06', currency: 'GBP' },
  staff: { name: 'Vitalij K', role: 'manager' },
  loyalty: { programme_on: true, points_on_bookings: true },
  readiness: { services: 5, team: 4, bookable: true, checklist: { steps: [], complete: true } },
}
// What the server sends: `can_manage` is what marks a manager (a role word alone does not).
const staffBoot: Bootstrap = { ...boot, staff: { name: 'Sam', role: 'staff', can_manage: false } }
const managerBoot: Bootstrap = { ...boot, staff: { name: 'Vitalij K', role: 'manager', can_manage: true } }

function page() {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/appointments']}>
      <QueryClientProvider client={new QueryClient()}>
        <AppointmentsContext.Provider value={{ data: boot, isLoading: false, isError: false, error: null, refetch: () => {} }}>
          <CalendarPage />
        </AppointmentsContext.Provider>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('CalendarPage', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('opens on the venue\'s today as the server gave it, even when this computer\'s clock is days out', () => {
    vi.setSystemTime(new Date('2026-10-09T12:00:00Z'))
    expect(page()).toContain('value="2026-10-06"')
  })

  it('shows a soft placeholder grid while it loads, in a rounded surface frame; the side column is bare on the canvas', () => {
    vi.setSystemTime(new Date('2026-10-06T12:00:00Z'))
    const html = page()
    expect(html).toContain('role="status"')
    expect(html).toContain('animate-pulse')
    expect(html).not.toMatch(/<p[^>]*role="status"/) // the plain "Loading…" paragraph is gone
    expect(html).not.toContain('At a glance') // no strip of zeros before the day has loaded
    const scroll = html.match(/<div[^>]*data-calendar-scroll=""[^>]*>/)?.[0] ?? ''
    for (const word of ['mx-4', 'rounded-xl', 'border-a-border', 'bg-a-surface', 'shadow-a-sm']) expect(scroll, word).toContain(word)
    const aside = html.match(/<aside[^>]*>/)?.[0] ?? ''
    expect(aside).toContain('bg-a-canvas')
    expect(aside).not.toContain('border-l')
  })
})

describe('CalendarPage team chips (day view)', () => {
  const day = (windows: [string, string][]) => ({ windows: windows.map(([start, end]) => ({ start, end })), time_off: [] })
  const masters = [
    { id: 1, name: 'Marie', title: null, avatar: null, color: '#3b7dd8', days: { '2026-10-06': day([['09:00', '17:00']]) } },
    { id: 2, name: 'Anouk', title: null, avatar: null, color: '#c46f1b', days: { '2026-10-06': day([['09:00', '17:00']]) } },
  ]
  const card = (id: number, masterId: number | null, client: string) => ({
    id, reference: `SVC-${id}`, start: '2026-10-06T10:00', end: '2026-10-06T10:45', duration_minutes: 45, service: { id: 1, name: 'Cut' },
    master: masterId === null ? null : { id: masterId, name: 'x' }, client: { id: id, name: client, is_member: false },
    status: 'confirmed' as const, payment: { state: 'not_paid_online' as const }, revision: 'r',
  })

  /** The page with the day already fetched, and this device's remembered choices stood in for. */
  function seeded(stored: object | null, narrow = false, team = masters, cards = [card(1, 1, 'Ada Marie-client'), card(2, 2, 'Beth Anouk-client')], who: Bootstrap = boot) {
    vi.stubGlobal('window', {
      localStorage: { getItem: () => (stored ? JSON.stringify(stored) : null), setItem: () => {} },
      matchMedia: () => ({ matches: narrow, addEventListener: () => {}, removeEventListener: () => {} }),
    })
    const client = new QueryClient()
    client.setQueryData(['appointments', 'calendar', '2026-10-06', '2026-10-06', false, null, true], {
      from: '2026-10-06', to: '2026-10-06', masters: team, services: [], appointments: cards,
    })
    return renderToStaticMarkup(
      <MemoryRouter initialEntries={['/appointments']}>
        <QueryClientProvider client={client}>
          <AppointmentsContext.Provider value={{ data: who, isLoading: false, isError: false, error: null, refetch: () => {} }}>
            <CalendarPage />
          </AppointmentsContext.Provider>
        </QueryClientProvider>
      </MemoryRouter>,
    )
  }
  // vi.setSystemTime on real timers would leave the clock moved for every later test file in the worker: mock Date alone, and put it back.
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }) })
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); forced.placeholder = false })

  it('puts the chips between the toolbar and the grid and no team picker in the toolbar', () => {
    vi.setSystemTime(new Date('2026-10-06T12:00:00Z'))
    const html = seeded({ view: 'day' })
    expect(html).toMatch(/role="group"[^>]*aria-label="Team on the calendar"/)
    expect(html).not.toContain('Whole team')
    expect(html).not.toContain('<select')
    expect(html.indexOf('Team on the calendar')).toBeLessThan(html.indexOf('data-calendar-scroll'))
    expect(html).toContain('Ada Marie-client')
    expect(html).toContain('Beth Anouk-client')
  })

  it('hides a remembered person\'s column and cards (the grid places no card without a column; dayTeam keeps unassigned ones)', () => {
    vi.setSystemTime(new Date('2026-10-06T12:00:00Z'))
    const html = seeded({ view: 'day', hiddenMasters: [2] })
    expect(html).toContain('Ada Marie-client')
    expect(html).not.toContain('Beth Anouk-client')
    expect(html).toMatch(/aria-pressed="false"[^>]*>[\s\S]*?Anouk/)
    // Anouk's column is gone from the grid; her chip alone still carries her name there.
    const gridAt = html.indexOf('data-calendar-scroll')
    expect(html.slice(gridAt)).not.toContain('Anouk')
    expect(html.slice(html.indexOf('Team on the calendar'), gridAt).match(/Anouk/g)).toHaveLength(1)
    // The Today strip above counts the whole day and the whole team: the chips only choose what the grid shows.
    expect(html).toContain('In: 2')
  })

  it('puts the Today strip between the toolbar and the chips, in the day view only', () => {
    vi.setSystemTime(new Date('2026-10-06T12:00:00Z'))
    const html = seeded({ view: 'day' })
    expect(html).toMatch(/<section[^>]*aria-label="At a glance"/)
    expect(html.indexOf('At a glance')).toBeGreaterThan(html.indexOf('Show cancelled')) // after the toolbar
    expect(html.indexOf('At a glance')).toBeLessThan(html.indexOf('Team on the calendar'))
    expect(html.indexOf('Team on the calendar')).toBeLessThan(html.indexOf('data-calendar-scroll'))
    expect(html).toContain('Appointments')
    expect(seeded({ view: 'list' })).not.toContain('At a glance')
    expect(seeded({ view: 'week' })).not.toContain('At a glance')
  })

  it('shows the strip to a team of one too (it is the chips that need two people)', () => {
    vi.setSystemTime(new Date('2026-10-06T12:00:00Z'))
    const html = seeded({ view: 'day' }, false, [masters[0]], [card(1, 1, 'Ada Marie-client')])
    expect(html).toContain('At a glance')
    expect(html).toContain('In: 1')
  })

  it('keeps money out of the page for staff (can_manage false): they get "Needs attention", not takings', () => {
    vi.setSystemTime(new Date('2026-10-06T12:00:00Z'))
    const html = seeded({ view: 'day' }, false, masters, undefined, staffBoot)
    expect(html).toContain('Needs attention')
    expect(html).not.toMatch(/Takings|Payments:|£/)
  })

  it('gives a manager (can_manage true) the takings tile in that place', () => {
    vi.setSystemTime(new Date('2026-10-06T12:00:00Z'))
    const html = seeded({ view: 'day' }, false, masters, undefined, managerBoot)
    expect(html).toContain('Takings')
    expect(html).not.toContain('Needs attention')
  })

  it('keeps the strip mounted but claims nothing while the next day loads over the previous payload', () => {
    vi.setSystemTime(new Date('2026-10-06T12:00:00Z'))
    const settled = seeded({ view: 'day' })
    expect(settled).toContain('In: 2')
    expect(settled).not.toMatch(/<section[^>]*aria-busy/)

    forced.placeholder = true
    const html = seeded({ view: 'day' })
    expect(html).toMatch(/<section[^>]*aria-label="At a glance"[^>]*aria-busy="true"/)
    expect(html).not.toMatch(/In: \d|Off:|Nothing booked|Nothing else|done ·/)
    // The rest of the page is the previous payload as before: the chips and the cards stay.
    expect(html).toContain('Team on the calendar')
    expect(html).toContain('Ada Marie-client')
  })

  it('shows no chips for a team of one — there is no one to hide — and none for an empty team', () => {
    vi.setSystemTime(new Date('2026-10-06T12:00:00Z'))
    const alone = seeded({ view: 'day' }, false, [masters[0]], [card(1, 1, 'Ada Marie-client')])
    expect(alone).not.toMatch(/role="group"[^>]*aria-label="Team on the calendar"/)
    expect(alone).not.toContain('Team on the calendar')
    expect(alone).toContain('Ada Marie-client')
    const none = seeded({ view: 'day' }, false, [], [])
    expect(none).not.toContain('Team on the calendar')
  })

  it('leaves the list view with its one-person picker and no chips', () => {
    vi.setSystemTime(new Date('2026-10-06T12:00:00Z'))
    const html = seeded({ view: 'list' })
    expect(html).not.toContain('Team on the calendar')
    expect(html).toContain('Whole team')
  })
})
