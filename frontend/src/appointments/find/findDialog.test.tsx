import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppointmentsContext } from '../AppointmentsProvider'
import type { AppointmentSummary, Bootstrap, CalendarPayload } from '../lib/types'
import { FindDialog, FindList } from './FindDialog'
import type { FindItem } from './findResults'

const lang = vi.hoisted(() => ({ current: 'en' }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: lang.current },
  }),
}))

const boot: Bootstrap = {
  name: 'HexaTech Appointments',
  organization: { id: 16, name: 'Lumière Salon', industry: 'beauty' },
  brand: null,
  venue: { timezone: 'UTC', timezone_named: true, today: '2026-10-12', currency: 'GBP' },
  staff: { name: 'Vitalij K', role: 'manager' },
  loyalty: { programme_on: true, points_on_bookings: true },
  readiness: { services: 5, team: 4, bookable: true, checklist: { steps: [], complete: true } },
}

const actions: FindItem[] = [
  { id: 'new', kind: 'action', label: 'New appointment', go: { to: '/appointments?new=1' } },
  { id: 'go-clients', kind: 'action', label: 'Clients', sub: 'Go to', go: { to: '/appointments/clients' } },
]

const appt = (id: number, start: string, client: string): AppointmentSummary => ({
  id, reference: `R${id}`, start, end: start, duration_minutes: 60, service: { id: 1, name: 'Cut' }, master: { id: 1, name: 'Marie' },
  client: { id, name: client, is_member: false }, status: 'confirmed', payment: { state: 'not_paid_online' }, revision: 'r',
})

function render(open: boolean, seed?: (client: QueryClient) => void, list: FindItem[] = actions): string {
  const client = new QueryClient()
  seed?.(client)
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <AppointmentsContext.Provider value={{ data: boot, isLoading: false, isError: false, error: null, refetch: () => {} }}>
        <FindDialog open={open} onClose={() => {}} onRun={() => {}} actions={list} />
      </AppointmentsContext.Provider>
    </QueryClientProvider>,
  )
}

const tag = (html: string, pattern: RegExp): string => html.match(pattern)?.[0] ?? ''

describe('FindDialog', () => {
  afterEach(() => { vi.useRealTimers() })

  it('draws nothing while closed', () => {
    expect(render(false)).toBe('')
  })

  it('is a modal dialog named Find, over a scrim that closes it', () => {
    const html = render(true)
    const dialog = tag(html, /<div[^>]*role="dialog"[^>]*>/)
    expect(dialog).toContain('aria-modal="true"')
    expect(dialog).toContain('aria-label="Find"')
    expect(dialog).toContain('animate-a-pop')
    const scrim = tag(html, /<button[^>]*aria-label="Close"[^>]*>/)
    expect(scrim).toContain('type="button"')
    expect(scrim).toContain('bg-a-scrim/40')
  })

  it('has a combobox that points at the list and at the option it has selected', () => {
    const html = render(true)
    const input = tag(html, /<input[^>]*>/)
    expect(input).toContain('role="combobox"')
    expect(input).toContain('aria-expanded="true"')
    expect(input).toContain('aria-autocomplete="list"')
    expect(input).toContain('aria-controls="find-list"')
    expect(input).toContain('aria-activedescendant="find-opt-new"')
    expect(input).toContain('placeholder="Find a client, appointment or action"')
    expect(tag(html, /<ul[^>]*>/)).toMatch(/id="find-list"[^>]*role="listbox"|role="listbox"[^>]*id="find-list"/)
  })

  it('lists options with ids inside labelled groups, the first one selected', () => {
    const html = render(true)
    const options = [...html.matchAll(/<li[^>]*role="option"[^>]*>/g)].map(m => m[0])
    expect(options).toHaveLength(2)
    expect(options[0]).toContain('id="find-opt-new"')
    expect(options[0]).toContain('aria-selected="true"')
    expect(options[1]).toContain('id="find-opt-go-clients"')
    expect(options[1]).toContain('aria-selected="false"')
    expect(html).toMatch(/role="group"[^>]*aria-label="Actions"|aria-label="Actions"[^>]*role="group"/)
  })

  it('says how many results there are, politely, to a screen reader', () => {
    const html = render(true)
    const live = html.match(/<p[^>]*role="status"[^>]*>([^<]*)<\/p>/)
    expect(live?.[0]).toContain('aria-live="polite"')
    expect(live?.[0]).toContain('sr-only')
    expect(live?.[1]).toBe('Results: 2')
  })

  it('shows what is coming up today from the calendars already loaded, on the venue clock', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-12T13:00:00Z'))
    const payload: CalendarPayload = { from: '2026-10-12', to: '2026-10-12', masters: [], services: [], appointments: [appt(7, '2026-10-12T14:00', 'Mia Chen'), appt(8, '2026-10-12T09:00', 'Early Bird')] }
    const html = render(true, client => client.setQueryData(['appointments', 'calendar', '2026-10-12', '2026-10-12', false, null, false], payload))
    expect(html).toContain('aria-label="Coming up today"')
    expect(html).toContain('id="find-opt-appt-7"')
    expect(html).toContain('14:00 · Mia Chen')
    expect(html).not.toContain('Early Bird')
    expect(html).toContain('Results: 3')
  })

  // The browser showed "Scalp Ritual · Ilze · 2026-09-30" in every language.
  it('dates an appointment the way the workspace does, in the active language, not as an ISO date', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-12T13:00:00Z'))
    const payload: CalendarPayload = { from: '2026-10-12', to: '2026-10-12', masters: [], services: [], appointments: [appt(7, '2026-10-12T14:00', 'Mia Chen')] }
    const seed = (client: QueryClient) => client.setQueryData(['appointments', 'calendar', '2026-10-12', '2026-10-12', false, null, false], payload)
    try {
      for (const [language, day] of [['en', 'Mon, Oct 12'], ['en-GB', 'Mon 12 Oct'], ['ru', 'пн, 12 окт.']]) {
        lang.current = language
        const html = render(true, seed)
        expect(html, language).toContain(`Cut · Marie · ${day}<`)
        expect(html, language).not.toContain('· 2026-10-12')
      }
    } finally {
      lang.current = 'en'
    }
  })

  // The browser drew the workspace's focus outline as a sharp rectangle round the input, inside the rounded box.
  it('shows the focus on the input\'s row as an accent-text underline, not as an outline round the input', () => {
    const html = render(true)
    const before = html.slice(0, html.indexOf('role="combobox"'))
    const row = before.slice(before.lastIndexOf('<div')).match(/^<div([^>]*)>/)?.[1] ?? ''
    expect(row).toContain('data-find-row=""')
    expect(row).toMatch(/\bborder-b\b/)
    const css = readFileSync(new URL('../theme/appointments.css', import.meta.url), 'utf8')
    // Not `outline: none`: a transparent outline draws nothing here, but forced-colours mode (Windows High Contrast)
    // paints it in the system colour, where the row's coloured border and shadow are taken away.
    expect(css).toMatch(/\[data-appointments\] \[data-find-row\] input:focus-visible\s*\{\s*outline: 2px solid transparent;/)
    expect(css).not.toMatch(/\[data-find-row\] input:focus-visible\s*\{\s*outline: none/)
    expect(css).toMatch(/\[data-appointments\] \[data-find-row\]:focus-within\s*\{\s*border-bottom-color: rgb\(var\(--a-accent-text\)\);\s*box-shadow: inset 0 -1px 0 rgb\(var\(--a-accent-text\)\);/)
  })

  it('lists every action when nothing is typed, and gives the list a scroll of its own', () => {
    const many: FindItem[] = Array.from({ length: 10 }, (_, i) => ({ id: `act-${i}`, kind: 'action', label: `Action ${i}`, go: { to: '/appointments' } }))
    const html = render(true, undefined, many)
    expect((html.match(/<li[^>]*role="option"/g) ?? [])).toHaveLength(10)
    expect(html).toContain('Results: 10')
    expect(tag(html, /<ul[^>]*role="listbox"[^>]*>|<ul[^>]*id="find-list"[^>]*>/)).toMatch(/overflow-y-auto/)
  })

  it('shows an appointment where the calendar fetched most recently has it, not where an older range left it', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-12T13:00:00Z'))
    const before = appt(7, '2026-10-12T14:00', 'Mia Chen')
    const moved = { ...before, start: '2026-10-12T16:30', end: '2026-10-12T16:30' }
    const range = (appointments: AppointmentSummary[]): CalendarPayload => ({ from: '2026-10-12', to: '2026-10-18', masters: [], services: [], appointments })
    const html = render(true, client => {
      client.setQueryData(['appointments', 'calendar', 'day', false], range([moved]), { updatedAt: 2000 })
      client.setQueryData(['appointments', 'calendar', 'week', false], range([before]), { updatedAt: 1000 })
    })
    expect(html).toContain('16:30 · Mia Chen')
    expect(html).not.toContain('14:00 · Mia Chen')
    expect((html.match(/id="find-opt-appt-7"/g) ?? [])).toHaveLength(1)
  })

  it('has a footer that names the keys', () => {
    const html = render(true)
    expect((html.match(/<kbd/g) ?? []).length).toBeGreaterThanOrEqual(3)
    for (const word of ['move', 'open', 'close']) expect(html).toContain(word)
  })

  it('names the key for the list of shortcuts in the footer, after the others', () => {
    const footer = (html: string) => html.slice(html.lastIndexOf('<div class="hidden items-center'))
    const html = footer(render(true))
    expect(html).toMatch(/<kbd[^>]*>\?<\/kbd>This list<\/span>/)
    expect(html.indexOf('>Esc<')).toBeLessThan(html.indexOf('>?<'))
  })
})

describe('FindList', () => {
  const groups = [
    { title: 'Appointments', items: [{ id: 'appt-4', kind: 'appointment', label: '09:00 · Zoe Scott', sub: 'Nails · Ilze · 2026-10-13', go: { to: '/appointments?open=4&date=2026-10-13' } }] as FindItem[] },
    { title: 'Clients', items: [
      { id: 'client-9', kind: 'client', label: 'Mia Chen', sub: 'mia@example.test', go: { to: '/appointments/clients/9' } },
      { id: 'search-all', kind: 'search', label: 'Search all clients for “mi”', go: { to: '/appointments/clients?search=mi' } },
    ] as FindItem[] },
  ]
  const draw = (activeId: string | null) => renderToStaticMarkup(<FindList groups={groups} activeId={activeId} onPick={() => {}} onHover={() => {}} />)

  it('marks only the active option as selected', () => {
    const html = draw('client-9')
    expect([...html.matchAll(/aria-selected="true"/g)]).toHaveLength(1)
    expect(tag(html, /<li[^>]*id="find-opt-client-9"[^>]*>/)).toContain('aria-selected="true"')
    expect(tag(html, /<li[^>]*id="find-opt-search-all"[^>]*>/)).toContain('aria-selected="false"')
  })

  it('names every group and draws an icon, a label and a sub line for each option', () => {
    const html = draw(null)
    expect((html.match(/role="group"/g) ?? []).length).toBe(2)
    expect(html).toContain('aria-label="Clients"')
    expect(html).toContain('Nails · Ilze · 2026-10-13')
    expect(html).toContain('Search all clients for “mi”')
    // One icon per option, by what it is: a calendar day, a person, a magnifier.
    expect((html.match(/<svg[^>]*aria-hidden="true"/g) ?? []).length).toBe(3)
    for (const icon of ['lucide-calendar-days', 'lucide-user', 'lucide-search']) expect(html).toContain(icon)
  })

  it('gives an action the plus or the arrow', () => {
    const html = renderToStaticMarkup(<FindList groups={[{ title: 'Actions', items: actions }]} activeId={null} onPick={() => {}} onHover={() => {}} />)
    expect(html).toContain('lucide-plus')
    expect(html).toContain('lucide-arrow-right')
  })
})
