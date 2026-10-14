import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppointmentsContext } from '../AppointmentsProvider'
import { money } from '../../lib/money'
import { TodayStrip } from './TodayStrip'
import type { AppointmentSummary, Bootstrap, CalendarMaster, RefundVia, Status, Takings } from '../lib/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en' },
  }),
}))

// The options each query is made with, as the strip passes them (a static render never fetches, so the options are what can be checked).
const seen = vi.hoisted(() => ({ queries: [] as { queryKey: readonly unknown[]; enabled?: unknown; refetchInterval?: unknown; refetchOnWindowFocus?: unknown }[] }))
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return {
    ...actual,
    useQuery: ((options: Parameters<typeof actual.useQuery>[0]) => {
      seen.queries.push(options as (typeof seen.queries)[number])
      return actual.useQuery(options)
    }) as typeof actual.useQuery,
  }
})

const DAY = '2026-10-06'
const NOW = { date: DAY, minutes: 10 * 60 + 20 }

const boot = (canManage: boolean): Bootstrap => ({
  name: 'HexaTech Appointments',
  organization: { id: 16, name: 'Lumière Salon', industry: 'beauty' },
  brand: null,
  venue: { timezone: 'Europe/London', timezone_named: true, today: DAY, currency: 'EUR' },
  staff: { name: 'Vitalij K', role: canManage ? 'manager' : 'staff', can_manage: canManage },
  loyalty: { programme_on: true, points_on_bookings: true },
  readiness: { services: 5, team: 4, bookable: true, checklist: { steps: [], complete: true } },
})

const appt = (id: number, start: string, status: Status, over: Partial<AppointmentSummary> = {}): AppointmentSummary => ({
  id, reference: `SVC-${id}`, start, end: start, duration_minutes: 45, service: { id: 1, name: 'Haircut' }, master: { id: 1, name: 'Marie' },
  client: { id, name: `Client ${id}`, is_member: false }, status, payment: { state: 'not_paid_online' }, revision: 'r', ...over,
})

const windows = [{ start: '09:00', end: '17:00' }]
const masters: CalendarMaster[] = [
  { id: 1, name: 'Marie', title: null, avatar: null, color: '#3b7dd8', days: { [DAY]: { windows, time_off: [] } } },
  { id: 2, name: 'Anouk', title: null, avatar: null, color: '#c46f1b', days: { [DAY]: { windows, time_off: [] } } },
  { id: 3, name: 'Jonas', title: null, avatar: null, color: '#2e8b57', days: { [DAY]: { windows, time_off: [{ start: null, end: null, reason: 'Holiday' }] } } },
]

const list = [
  appt(1, `${DAY}T09:00`, 'completed'),
  appt(2, `${DAY}T09:30`, 'no_show'),
  appt(3, `${DAY}T14:30`, 'confirmed', { service: { id: 2, name: 'Colour' }, client: { id: 3, name: 'Ada Lovelace', is_member: false }, master: { id: 2, name: 'Anouk' } }),
  appt(4, `${DAY}T16:00`, 'pending'),
  appt(5, `${DAY}T17:00`, 'cancelled'),
]

const methods = (m: Partial<Record<RefundVia, { in: number; out: number }>>): Record<RefundVia, { in: number; out: number }> => ({
  cash: { in: 0, out: 0 }, card_desk: { in: 0, out: 0 }, transfer: { in: 0, out: 0 }, other: { in: 0, out: 0 }, online_card: { in: 0, out: 0 }, ...m,
})
const takings: Takings = {
  date: DAY,
  totals: { EUR: methods({ cash: { in: 150.5, out: 0 }, card_desk: { in: 100, out: 20 } }) },
  rows: [
    { id: 1, kind: 'payment', method: 'cash', amount: 150.5, currency: 'EUR', note: null, by: null, at: null, reference: 'SVC-1', client: 'A' },
    { id: 2, kind: 'payment', method: 'card_desk', amount: 100, currency: 'EUR', note: null, by: null, at: null, reference: 'SVC-2', client: 'B' },
    { id: 3, kind: 'refund', method: 'card_desk', amount: 20, currency: 'EUR', note: null, by: null, at: null, reference: 'SVC-2', client: 'B' },
  ],
  online: {},
}

function strip(opts: { manager: boolean; date?: string; appointments?: AppointmentSummary[]; loaded?: boolean; people?: CalendarMaster[]; pending?: boolean }) {
  const date = opts.date ?? DAY
  const client = new QueryClient()
  if (opts.loaded !== false) client.setQueryData(['appointments', 'takings', date], takings)
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <AppointmentsContext.Provider value={{ data: boot(opts.manager), isLoading: false, isError: false, error: null, refetch: () => {} }}>
        <TodayStrip date={date} now={NOW} appointments={opts.appointments ?? list} masters={opts.people ?? masters} pending={opts.pending} />
      </AppointmentsContext.Provider>
    </QueryClientProvider>,
  )
}

/** The text of the tile whose heading is `title` (from its heading to the next tile). */
function tile(html: string, title: string): string {
  const tiles = html.split('<div class="rounded-xl').slice(1)
  return tiles.find(t => t.includes(`>${title}</h2>`)) ?? ''
}

describe('TodayStrip', () => {
  it('is a section named "At a glance" with four tiles, each headed by a mono eyebrow heading', () => {
    const html = strip({ manager: true })
    expect(html).toMatch(/^<div[^>]*><section[^>]*aria-label="At a glance"/)
    const heads = [...html.matchAll(/<h2 class="([^"]*)"/g)].map(m => m[1])
    expect(heads).toHaveLength(4)
    for (const classes of heads) {
      expect(classes).toContain('font-a-mono')
      expect(classes).toContain('uppercase')
    }
  })

  // At 1280 px with the panel open each of four tiles was 125 px wide, and "$1,234.50" ran out of its tile.
  it('lays its tiles out by its own width, not the screen\'s: four in a row where they fit, else two by two', () => {
    const html = strip({ manager: true })
    expect(html).toMatch(/^<div class="\[container-type:inline-size\]"><section/)
    const section = html.match(/<section[^>]*>/)?.[0] ?? ''
    expect(section).toContain('data-glance=""')
    expect(section).toMatch(/class="[^"]*\bgrid-cols-2\b/)
    expect(section).not.toMatch(/xl:grid-cols-4/) // the screen's width ignored the panel and the side menu
    const css = readFileSync(new URL('../../workspace/theme/workspace.css', import.meta.url), 'utf8')
    expect(css).toMatch(/@container \(min-width: 660px\)\s*\{\s*\[data-workspace\] \[data-glance\]\s*\{\s*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/)
  })

  // "CHF 1,234.50" is 170 px at 30 px and a tile has 129 px inside at 1280 (104 at the narrowest): every figure is sized to its own tile.
  it('makes each tile a container and sizes every display figure in it to that tile (fitCqi, workspace.css [data-fit])', () => {
    for (const manager of [true, false]) {
      const html = strip({ manager })
      const tiles = [...html.matchAll(/<div class="([^"]*\brounded-xl\b[^"]*)"/g)].map(m => m[1])
      expect(tiles).toHaveLength(4)
      for (const classes of tiles) expect(classes).toContain('[container-type:inline-size]')
      const figures = [...html.matchAll(/<p([^>]*)>([^<]*)</g)].filter(m => m[1].includes('font-a-display'))
      expect(figures.map(m => m[2])).toEqual(manager ? ['4', '14:30', money(230.5, 'EUR')] : ['4', '14:30', '1'])
      for (const m of figures) expect(m[1], m[2]).toContain('data-fit=""')
    }
    // The one rule sizes them; the narrow-strip step-down it replaces is gone.
    const css = readFileSync(new URL('../../workspace/theme/workspace.css', import.meta.url), 'utf8')
    expect(css).toMatch(/\[data-workspace\] \[data-glance\] \[data-fit\]\s*\{\s*font-size: clamp\(1\.125rem, calc\(var\(--a-fit, 100\) \* 1cqi\), 1\.875rem\);/)
    expect(css).not.toMatch(/@container \(max-width: \d+px\)\s*\{\s*\[data-(?:workspace|appointments)\] \[data-glance\] \.font-a-display/)
    expect(readFileSync(new URL('../theme/appointments.css', import.meta.url), 'utf8')).not.toContain('[data-glance]')
    // The loading dash in the Team tile is a single character in the display face: it always fits at the design's size.
    expect(strip({ manager: true, pending: true })).toMatch(/<span aria-hidden="true" class="font-a-display[^"]*">—<\/span>/)
  })

  it('staggers the tiles by 60 ms steps, the first not at all', () => {
    const html = strip({ manager: true })
    const tiles = html.split('<div class="rounded-xl').slice(1)
    expect(tiles).toHaveLength(4)
    expect(tiles[0]).not.toContain('animation-delay')
    expect(html).toContain('[animation-delay:60ms]')
    expect(html).toContain('[animation-delay:120ms]')
    expect(html).toContain('[animation-delay:180ms]')
  })

  it('counts the appointments of the day (not the cancelled one), with done and no-show beneath', () => {
    const html = strip({ manager: true })
    const t = tile(html, 'Appointments')
    expect(t).toMatch(/font-a-display[^>]*>4</)
    expect(t).toContain('1 done · 1 no-show')
  })

  it('shows the next appointment\'s time in the display face, with service, client and person', () => {
    const html = strip({ manager: true })
    const t = tile(html, 'Next up')
    expect(t).toMatch(/<p class="[^"]*font-a-display[^"]*"[^>]*>14:30<\/p>/)
    expect(t).toContain('Colour · Ada Lovelace with Anouk')
    expect(html).not.toContain('First appointment')
  })

  it('says "First appointment" for another day, and says so when nothing is booked', () => {
    const other = '2026-10-08'
    const html = strip({ manager: true, date: other, appointments: [appt(9, `${other}T08:15`, 'confirmed')] })
    expect(tile(html, 'First appointment')).toMatch(/font-a-display[^>]*>08:15</)
    expect(html).not.toContain('Next up')
    const empty = strip({ manager: true, date: other, appointments: [] })
    expect(tile(empty, 'First appointment')).toContain('Nothing booked')
    expect(tile(empty, 'First appointment')).toContain('—')
  })

  it('says "Nothing else booked today" when the rest of today is empty', () => {
    const html = strip({ manager: true, appointments: [appt(1, `${DAY}T09:00`, 'completed')] })
    expect(tile(html, 'Next up')).toContain('Nothing else booked today')
  })

  // The browser showed "Nothing else booked today" on a today with no appointments at all.
  it('says "Nothing booked" when today has no appointments at all (a cancelled one is none)', () => {
    for (const appointments of [[], [appt(1, `${DAY}T11:00`, 'cancelled')]]) {
      const t = tile(strip({ manager: true, appointments }), 'Next up')
      expect(t).toContain('Nothing booked')
      expect(t).not.toContain('Nothing else')
    }
  })

  it('shows a manager the day\'s net takings in the venue\'s currency and the number of payments', () => {
    const html = strip({ manager: true })
    const t = tile(html, 'Takings')
    expect(t).toContain(money(230.5, 'EUR'))
    expect(t).toContain('Payments: 2')
    expect(html).not.toContain('Needs attention')
  })

  it('shows a dash while the manager\'s takings are not loaded yet', () => {
    const html = strip({ manager: true, loaded: false })
    expect(tile(html, 'Takings')).toMatch(/font-a-display[^>]*>—</)
    expect(html).not.toContain('Payments:')
  })

  // A payment at a second desk, on a staff phone or an online deposit must show up while the cards refresh every 30 s.
  it('keeps a manager\'s takings fresh the way the calendar is: every 30 s and on coming back to the window', () => {
    seen.queries.length = 0
    strip({ manager: true })
    const takingsQuery = seen.queries.find(q => q.queryKey[1] === 'takings')
    expect(takingsQuery?.queryKey).toEqual(['appointments', 'takings', DAY])
    expect(takingsQuery?.enabled).toBe(true)
    expect(takingsQuery?.refetchInterval).toBe(30_000)
    expect(takingsQuery?.refetchOnWindowFocus).toBe(true)
  })

  it('never fetches takings for staff: the query is switched off, so neither the 30 s refresh nor a refocus runs it', () => {
    seen.queries.length = 0
    const html = strip({ manager: false, loaded: false })
    const takingsQuery = seen.queries.find(q => q.queryKey[1] === 'takings')
    expect(takingsQuery?.enabled).toBe(false)
    expect(html).not.toContain('Takings')
  })

  it('shows everyone else "Needs attention" with the count — and no money anywhere', () => {
    const html = strip({ manager: false })
    const t = tile(html, 'Needs attention')
    expect(t).toMatch(/font-a-display[^>]*>1</) // the pending request; the confirmed one at 14:30 is not late yet
    expect(t).toContain('Awaiting confirmation or late')
    expect(html).not.toContain('Takings')
    expect(html).not.toContain('Payments:')
    expect(html).not.toMatch(/€|\$|£|EUR/)
  })

  it('lists who is in and who is off', () => {
    const html = strip({ manager: true })
    const t = tile(html, 'Team')
    expect(t).toContain('In: 2')
    expect(t).toContain('Off: Jonas')
    const avatars = [...t.matchAll(/<span([^>]*a-member-ring[^>]*)>([^<]*)</g)]
    expect(avatars.map(m => m[2])).toEqual(['M', 'A'])
    expect(avatars[0][1]).toContain('--a-m:#3b7dd8')
    expect(avatars[1][1]).toContain('--a-m:#c46f1b')
    expect(avatars[0][1]).not.toContain('-ml-1.5')
    expect(avatars[1][1]).toContain('-ml-1.5')
  })

  it('leaves out "Off" when everyone is in', () => {
    const html = strip({ manager: true, people: masters.slice(0, 2) })
    const t = tile(html, 'Team')
    expect(t).toContain('In: 2')
    expect(t).not.toContain('Off:')
  })
})

describe('TodayStrip while the next day loads over the previous payload (pending)', () => {
  // The calendar keeps the previous day's data on screen while the next day is fetched: this day's hours and
  // appointments are not in it, so read as they are they would claim "Nothing booked" and "Off: the whole team".
  const NEXT = '2026-10-07'

  it('control: without pending, the same inputs do say the team is off and nothing is booked', () => {
    const html = strip({ manager: true, date: NEXT })
    expect(html).toContain('Off: Marie, Anouk, Jonas')
    expect(html).toContain('Nothing booked')
    expect(html).not.toContain('aria-busy')
  })

  // Each word is first shown to be there when the same inputs are settled, so its absence while pending means something.
  // The cases: the day whose appointments the payload holds (names, counts, money), the next day (nothing booked, all
  // off), and a day with only a finished appointment ("Nothing else booked today").
  const CASES = [
    { date: DAY },
    { date: NEXT },
    { date: DAY, appointments: [appt(1, `${DAY}T09:00`, 'completed')] },
  ]
  const WORDS = ['Off:', 'In:', 'Marie', 'Anouk', 'Jonas', 'Colour', 'Ada Lovelace', 'Nothing booked', 'Nothing else', 'done', 'no-show']
  const MONEY = ['Payments:', money(230.5, 'EUR')]

  for (const manager of [true, false]) {
    it(`${manager ? 'a manager' : 'staff'} sees dashes for every figure, and no count, name, "Off:" or money`, () => {
      const words = manager ? [...WORDS, ...MONEY] : WORDS
      const settled = CASES.map(c => strip({ manager, ...c })).join('\n')
      for (const word of words) expect(settled, `control: "${word}" is shown when settled`).toContain(word)
      expect(settled).toMatch(/a-member-ring/)

      for (const c of CASES) {
        const html = strip({ manager, ...c, pending: true })
        const figures = [...html.matchAll(/<p class="[^"]*font-a-display[^"]*"[^>]*>([^<]*)</g)].map(m => m[1])
        expect(figures).toEqual(['—', '—', '—'])
        for (const word of words) expect(html, `${c.date}: ${word}`).not.toContain(word)
        if (!manager) for (const word of MONEY) expect(html, word).not.toContain(word)
        expect(html).not.toMatch(/a-member-ring/) // no avatars of a team that has not arrived
        expect(html).not.toMatch(/>\d+</) // no count of any kind
        expect(html).toMatch(/<section[^>]*aria-busy="true"/)
      }
    })
  }

  it('stays mounted as the same four tiles with the same headings, and every tile keeps its sub line so nothing jumps', () => {
    const settled = strip({ manager: true, date: NEXT })
    const pending = strip({ manager: true, date: NEXT, pending: true })
    const heads = (html: string) => [...html.matchAll(/<h2 [^>]*>([^<]*)</g)].map(m => m[1])
    expect(heads(pending)).toEqual(heads(settled))
    expect(pending.match(/class="mt-1 (line-clamp-2 )?text-sm[^"]*"/g)).toHaveLength(4)
  })

  it('still names the unchanging explanation under "Needs attention" for staff', () => {
    expect(strip({ manager: false, date: NEXT, pending: true })).toContain('Awaiting confirmation or late')
  })
})
