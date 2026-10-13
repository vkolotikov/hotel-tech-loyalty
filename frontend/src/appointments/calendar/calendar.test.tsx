import { describe, expect, it, vi } from 'vitest'
import type { ComponentProps, ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { TimeGrid } from './TimeGrid'
import { AppointmentCard } from './AppointmentCard'
import { DayOverview } from './DayOverview'
import { MiniMonth } from './MiniMonth'
import { columnsFor } from './calendarState'
import { placeAppointments } from '../lib/layout'
import type { AppointmentSummary, CalendarMaster, Status } from '../lib/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? (typeof fallback === 'object' ? fallback : {}) ?? {})[name] ?? ''))
    },
    i18n: { language: 'en' },
  }),
}))

/** The server sends each person's colour as data; the tests hold their own fixtures (component files hold no hex). */
const MEMBER_COLOURS = ['#3b7dd8', '#c46f1b']

const emma: CalendarMaster = {
  id: 1, name: 'Emma', title: 'Hair Stylist', avatar: null, color: MEMBER_COLOURS[0],
  days: { '2026-10-06': { windows: [{ start: '09:00', end: '13:00' }, { start: '14:00', end: '17:00' }], time_off: [{ start: '13:00', end: '14:00', reason: 'Lunch' }] } },
}

const appt = (id: number, start: string, end: string, status: Status = 'confirmed', name = 'Sophie Williams'): AppointmentSummary => ({
  id, reference: `SVC-${id}`, start, end, duration_minutes: 45, service: { id: 1, name: 'Haircut & Styling' }, master: { id: 1, name: 'Emma' },
  client: { id: 5, name, is_member: true }, status, payment: { state: 'not_paid_online' }, revision: 'r',
})

const james: CalendarMaster = { id: 2, name: 'James', title: null, avatar: null, color: MEMBER_COLOURS[1], days: { '2026-10-06': { windows: [{ start: '09:00', end: '17:00' }], time_off: [] } } }

function grid(appointments: AppointmentSummary[], today = '2026-10-06') {
  const columns = columnsFor('day', '2026-10-06', [emma], null, today, 'en-GB')
  return renderToStaticMarkup(
    <TimeGrid columns={columns} appointments={appointments} now={{ date: today, minutes: 10 * 60 + 20 }} today={today}
      selectedId={null} onSlot={() => {}} onOpen={() => {}} />,
  )
}

/** The grid for any set of columns, with "now" at 10:20 on 2026-10-06. */
function gridOf(columns: ReturnType<typeof columnsFor>, appointments: AppointmentSummary[]) {
  return renderToStaticMarkup(
    <TimeGrid columns={columns} appointments={appointments} now={{ date: '2026-10-06', minutes: 10 * 60 + 20 }} today="2026-10-06"
      selectedId={null} onSlot={() => {}} onOpen={() => {}} />,
  )
}

/** The opening tag of the first appointment card, and its class list as words. */
const cardTag = (html: string) => html.match(/<button[^>]*data-density="[^"]*"[^>]*>/)?.[0] ?? ''
const classesOf = (tag: string) => (tag.match(/class="([^"]*)"/)?.[1] ?? '').split(/\s+/)

describe('TimeGrid', () => {
  it('is one tab stop: exactly one slot or card is reachable by Tab, and the keys are explained (Part F)', () => {
    const html = grid([appt(7, '2026-10-06T09:00', '2026-10-06T10:00')])
    expect(html.match(/data-stop="[^"]+"[^>]*tabindex="0"|tabindex="0"[^>]*data-stop="[^"]+"/g)).toHaveLength(1)
    expect(html).toContain('id="calendar-keys-hint"')
  })

  it('heads each column with the person and draws the appointment as time, service, client and a worded status', () => {
    const html = grid([appt(7, '2026-10-06T09:00', '2026-10-06T10:00')])
    expect(html).toContain('Emma')
    expect(html).toContain('Hair Stylist')
    expect(html).toContain('>09:00<span class="sr-only"> – 10:00</span>')
    expect(html).toContain('Sophie Williams')
    expect(html).toContain('Haircut &amp; Styling')
    expect(html).toContain('appointments.status.confirmed')
    // Atelier order (spec 4.6): the time, then the service in bold, then the client.
    const card = html.slice(html.indexOf('data-density'))
    expect(card.indexOf('>09:00<')).toBeLessThan(card.indexOf('Haircut &amp; Styling'))
    expect(card.indexOf('Haircut &amp; Styling')).toBeLessThan(card.indexOf('Sophie Williams'))
  })

  it('draws a card as a surface with a hairline border, not a coloured bar; a completed visit sits on surface-2', () => {
    const live = classesOf(cardTag(grid([appt(7, '2026-10-06T09:00', '2026-10-06T10:00')])))
    expect(live).toContain('bg-a-surface')
    expect(live).toContain('border-a-border')
    expect(live).not.toContain('border-l-[3px]')
    expect(live).not.toContain('bg-a-surface-2')
    expect(live).toContain('shadow-a-sm')
    expect(live).toContain('animate-a-rise')

    const done = classesOf(cardTag(grid([appt(7, '2026-10-06T09:00', '2026-10-06T10:00', 'completed')])))
    expect(done).toContain('bg-a-surface-2')
    expect(done).not.toContain('bg-a-surface')
    expect(done).toContain('border-a-border')
  })

  it('shows only the start time on a card and keeps the end in its name, at every size', () => {
    // Controller ruling (spec 4.6 "mono time", mock A): at four columns the range cut the status word ("Confirm…").
    const sized: [string, string][] = [['full', '10:00'], ['two', '09:40'], ['tight', '09:30'], ['line', '09:20']]
    for (const [density, end] of sized) {
      const html = grid([appt(7, '2026-10-06T09:00', `2026-10-06T${end}`)])
      const card = html.match(/<button[^>]*data-density="[^"]*"[^>]*>[\s\S]*?<\/button>/)?.[0] ?? ''
      expect(card, density).toContain(`data-density="${density}"`)
      const visible = card.replace(/<span class="sr-only">[^<]*<\/span>/g, '').replace(/<[^>]+>/g, '')
      expect(visible, density).toContain('09:00')
      expect(visible, density).not.toContain(end)
      expect(visible, density).not.toContain('–')
      expect(card, density).toContain(`<span class="sr-only"> – ${end}</span>`)
      expect(card.replace(/<[^>]+>/g, ''), density).toContain(`09:00 – ${end}`) // the card's accessible name
    }
  })

  it('keeps the column head opaque, so cards scrolled under it never show through its names', () => {
    const head = grid([]).match(/<div class="(sticky top-0[^"]*)"/)?.[1] ?? ''
    expect(head.split(' ')).toContain('bg-a-surface')
    expect(head).not.toMatch(/bg-a-surface\/\d+/)
  })

  it('hides the hour label the now chip would sit on, and only while the chip is near it', () => {
    // At 09:53 the chip covered half of "10:00" (seen in the browser pass); both are 16 px tall at 1.2 px a minute.
    const columns = columnsFor('day', '2026-10-06', [emma], null, '2026-10-06', 'en-GB')
    const at = (minutes: number, date = '2026-10-06') => renderToStaticMarkup(
      <TimeGrid columns={columns} appointments={[]} now={{ date, minutes }} today={date} selectedId={null} onSlot={() => {}} onOpen={() => {}} />,
    )
    const label = (html: string, text: string) => html.match(new RegExp(`<div class="([^"]*)"[^>]*>${text}</div>`))?.[1] ?? ''
    const near = at(9 * 60 + 53)
    expect(label(near, '10:00')).toContain('invisible')
    expect(label(near, '09:00')).not.toContain('invisible')
    expect(label(near, '11:00')).not.toContain('invisible')
    expect(label(at(10 * 60 + 10), '10:00')).toContain('invisible')
    expect(label(at(10 * 60 + 30), '10:00')).not.toContain('invisible')
    // No chip on a day that is not today: every label shows.
    expect(label(at(9 * 60 + 53, '2026-10-05'), '10:00')).not.toContain('invisible')
  })

  it('lifts a card on hover only where there is a real hover, so a tapped card on an iPad does not stay raised', () => {
    const live = classesOf(cardTag(grid([appt(7, '2026-10-06T09:00', '2026-10-06T10:00')])))
    expect(live).toEqual(expect.arrayContaining([
      '[@media(hover:hover)]:hover:-translate-y-0.5',
      '[@media(hover:hover)]:hover:shadow-a',
      '[@media(hover:hover)]:hover:border-a-text-2/40',
    ]))
    // No bare hover: utility left on the card.
    expect(live.filter((c: string) => c.startsWith('hover:'))).toEqual([])
  })

  it('shows the service first and the client under it, struck through for a no-show or a cancellation', () => {
    for (const status of ['no_show', 'cancelled'] as const) {
      const html = grid([appt(7, '2026-10-06T09:00', '2026-10-06T10:00', status)])
      expect(html).toMatch(/line-through[^"]*">Haircut &amp; Styling<\/div>/)
    }
    expect(grid([appt(7, '2026-10-06T09:00', '2026-10-06T10:00')])).not.toContain('line-through')
  })

  it('keeps the client in the name of a card at every size, and shows it in the card only where there is room', () => {
    const sized: [string, string][] = [['full', '10:00'], ['two', '09:40'], ['tight', '09:30'], ['line', '09:20']]
    for (const [density, end] of sized) {
      const html = grid([appt(7, '2026-10-06T09:00', `2026-10-06T${end}`)])
      expect(html, density).toContain(`data-density="${density}"`)
      expect(html, density).toContain('Sophie Williams')
      const hidden = html.includes('<span class="sr-only">, Sophie Williams</span>')
      expect(hidden, density).toBe(density !== 'full') // the full card prints it on a line of its own
      expect(html.match(/Sophie Williams/g), density).toHaveLength(1)
    }
  })

  it('a card with no service shows the client once, in the service\'s place', () => {
    const noService = { ...appt(7, '2026-10-06T09:00', '2026-10-06T10:00'), service: null }
    expect(grid([noService]).match(/Sophie Williams/g)).toHaveLength(1)
    const short = { ...appt(8, '2026-10-06T09:00', '2026-10-06T09:20'), service: null }
    expect(grid([short]).match(/Sophie Williams/g)).toHaveLength(1)
  })

  it('offers every free half hour as a real, named button and none where someone is booked', () => {
    const html = grid([appt(7, '2026-10-06T09:00', '2026-10-06T10:00')])
    expect(html).toContain('aria-label="Book Emma at 10:00"')
    expect(html).toContain('aria-label="Book Emma at 16:30"')
    expect(html).not.toContain('aria-label="Book Emma at 09:00"')
    expect(html).not.toContain('aria-label="Book Emma at 09:30"')
    expect(html).not.toContain('aria-label="Book Emma at 13:00"') // time off
    expect(html).not.toContain('aria-label="Book Emma at 17:00"') // closed
  })

  it('labels time off as blocked, with its reason', () => {
    expect(grid([])).toContain('Blocked · Lunch')
  })

  it('a cancelled or no-show appointment does not block its slot', () => {
    const html = grid([appt(7, '2026-10-06T09:00', '2026-10-06T10:00', 'no_show')])
    expect(html).toContain('aria-label="Book Emma at 09:00"')
    expect(html).toContain('appointments.status.no_show')
  })

  it('a no-show card stands aside so the slot under it can be reached; a live card does not', () => {
    expect(grid([appt(7, '2026-10-06T09:00', '2026-10-06T10:00', 'no_show')])).toContain('data-gutter=""')
    expect(grid([appt(7, '2026-10-06T09:00', '2026-10-06T10:00', 'confirmed')])).not.toContain('data-gutter')
  })

  it('never fades a card: a faded no-show or cancellation is text below 4.5:1', () => {
    for (const status of ['no_show', 'cancelled'] as const) {
      const html = grid([appt(7, '2026-10-06T09:00', '2026-10-06T10:00', status)])
      const card = html.slice(html.indexOf('data-density'))
      expect(card.slice(0, card.indexOf('>'))).not.toMatch(/opacity-/)
    }
    expect(grid([appt(7, '2026-10-06T09:00', '2026-10-06T10:00', 'cancelled')])).toContain('line-through')
  })

  it('offers no slot under a completed visit — that time was used', () => {
    const html = grid([appt(7, '2026-10-06T09:00', '2026-10-06T10:00', 'completed')])
    expect(html).not.toContain('aria-label="Book Emma at 09:00"')
    expect(html).not.toContain('aria-label="Book Emma at 09:30"')
    expect(html).toContain('aria-label="Book Emma at 10:00"')
    expect(html).not.toContain('data-gutter')
  })

  it('a half-hour card shows its time and service; the client line is left out of view rather than clipped, and stays in its name', () => {
    const html = grid([appt(7, '2026-10-06T09:00', '2026-10-06T09:30')])
    expect(html).toContain('data-density="tight"')
    expect(html).toContain('>09:00<span class="sr-only"> – 09:30</span>')
    expect(html).toContain('Haircut &amp; Styling')
    expect(html).toContain('<span class="sr-only">, Sophie Williams</span>')
    expect(html).toContain('appointments.status.confirmed')
  })

  it('marks the status word on a card, so a narrow column can drop it from view and keep the icon and the name', () => {
    const html = grid([appt(7, '2026-10-06T09:00', '2026-10-06T10:00')])
    expect(html).toMatch(/<span[^>]*title="appointments\.status\.confirmed"[^>]*>.*?<span data-status-word=""[^>]*>appointments\.status\.confirmed<\/span>/)
  })

  it('an hour-long card has the service line', () => {
    const html = grid([appt(7, '2026-10-06T09:00', '2026-10-06T10:00')])
    expect(html).toContain('data-density="full"')
    expect(html).toContain('Haircut &amp; Styling')
  })

  it('offers no slot on a day that has passed', () => {
    const html = grid([], '2026-10-07')
    expect(html).not.toContain('aria-label="Book Emma at')
  })

  it('draws the current-time line only on the venue\'s today', () => {
    expect(grid([])).toContain('data-now-line')
    expect(grid([], '2026-10-05')).not.toContain('data-now-line')
  })

  it('the now line is the now colour with a pulsing dot, and the gutter says the time on a chip', () => {
    const html = grid([])
    expect(html).toMatch(/<div data-now-line="" class="[^"]*\bborder-a-now\b[^"]*"[^>]*><span class="[^"]*\banimate-a-pulse\b[^"]*"/)
    expect(html).not.toContain('border-a-danger')
    expect(html).toMatch(/<span class="[^"]*\bbg-a-now\b[^"]*font-a-mono[^"]*text-a-now-ink[^"]*"[^>]*>10:20<\/span>/)
    // No column shows today: neither the line nor the chip.
    expect(grid([], '2026-10-05')).not.toContain('bg-a-now')
  })

  it('draws a fainter dashed line at each half hour, beside each hour line', () => {
    const html = grid([])
    const hourLines = html.match(/border-t border-a-border"/g) ?? []
    const halves = html.match(/border-t border-dashed border-a-border\/60"/g) ?? []
    expect(hourLines.length).toBeGreaterThan(0)
    expect(halves).toHaveLength(hourLines.length)
    expect(html).toMatch(/border-dashed[^>]*style="top:36px"[^>]*aria-hidden/) // 30 minutes below the first hour line
  })

  it('sets the gutter times in mono', () => {
    expect(grid([])).toMatch(/font-a-mono text-xs text-a-text-2" style="top:/)
  })

  it('says how many are booked in each column, counting its own appointments and not the cancelled', () => {
    const own = (id: number, masterId: number, status: Status = 'confirmed') => ({ ...appt(id, `2026-10-06T${9 + id}:00`, `2026-10-06T${10 + id}:00`, status), master: { id: masterId, name: 'x' } })
    const html = gridOf(columnsFor('day', '2026-10-06', [emma, james], null, '2026-10-06', 'en-GB'), [
      own(1, 1), own(2, 1, 'cancelled'), own(3, 1, 'no_show'), own(4, 2),
    ])
    expect(html).toMatch(/Emma<\/div><div[^>]*>Hair Stylist<\/div><div[^>]*font-a-mono[^>]*>Booked: 2<\/div>/)
    expect(html).toMatch(/James<\/div><div[^>]*font-a-mono[^>]*>Booked: 1<\/div>/)
  })

  it('in the week view each day column counts only its own day', () => {
    const week = columnsFor('week', '2026-10-06', [emma, james], 1, '2026-10-06', 'en-GB')
    const html = gridOf(week, [
      appt(1, '2026-10-06T09:00', '2026-10-06T10:00'), appt(2, '2026-10-06T11:00', '2026-10-06T12:00', 'cancelled'),
      appt(3, '2026-10-07T09:00', '2026-10-07T10:00'), { ...appt(4, '2026-10-07T11:00', '2026-10-07T12:00'), master: { id: 2, name: 'James' } },
    ])
    expect([...html.matchAll(/Booked: (\d+)/g)].map(m => m[1])).toEqual(['0', '1', '1', '0', '0', '0', '0']) // Monday to Sunday
  })

  describe('team colours (spec 5.3)', () => {
    const tagsWith = (html: string, cls: string) => (html.match(/<span[^>]*>/g) ?? []).filter(tag => classesOf(tag).includes(cls))
    const colourOf = (tag: string) => tag.match(/style="--a-m:([^";]+)/)?.[1]
    const cardsOf = (html: string) => html.match(/<button[^>]*data-density="[^"]*"[^>]*>[\s\S]*?<\/button>/g) ?? []
    const text = (html: string) => html.replace(/<[^>]+>/g, '')
    const james2 = (id: number, start: string, end: string) => ({ ...appt(id, start, end), master: { id: 2, name: 'James' } })

    it('rings each column-head avatar in that person\'s colour, in place of the grey hairline', () => {
      const html = gridOf(columnsFor('day', '2026-10-06', [emma, james], null, '2026-10-06', 'en-GB'), [])
      const rings = tagsWith(html, 'a-member-ring')
      expect(rings.map(colourOf)).toEqual(MEMBER_COLOURS)
      for (const ring of rings) {
        expect(ring).toContain('aria-hidden')
        expect(classesOf(ring)).not.toContain('ring-1')
        expect(classesOf(ring)).not.toContain('ring-a-border')
      }
    })

    it('leads each card with a dot in its person\'s colour, at every card size, and the dot says nothing', () => {
      const sized: [string, string][] = [['full', '10:00'], ['two', '09:40'], ['tight', '09:30'], ['line', '09:20']]
      const columns = columnsFor('day', '2026-10-06', [emma, james], null, '2026-10-06', 'en-GB')
      for (const [density, end] of sized) {
        const html = gridOf(columns, [appt(7, '2026-10-06T09:00', `2026-10-06T${end}`), james2(8, '2026-10-06T11:00', '2026-10-06T12:00')])
        const [emmaCard = '', jamesCard = ''] = cardsOf(html)
        expect(emmaCard, density).toContain(`data-density="${density}"`)
        const dots = tagsWith(emmaCard, 'a-member-dot')
        expect(dots.map(colourOf), density).toEqual([MEMBER_COLOURS[0]])
        expect(dots[0], density).toContain('aria-hidden')
        expect(emmaCard, density).toMatch(/<span[^>]*class="a-member-dot [^"]*"[^>]*><\/span>/) // nothing inside it
        // The first thing in the time row (inside the row's own time group when the status icon shares it).
        expect(emmaCard.replace(/^<button[^>]*>/, ''), density).toMatch(/^<div class="flex items-center[^"]*">(<span class="flex[^"]*">)?<span[^>]*class="a-member-dot /)
        expect(tagsWith(jamesCard, 'a-member-dot').map(colourOf), density).toEqual([MEMBER_COLOURS[1]])
      }
    })

    it('never makes the colour the status: the card reads the same with and without it', () => {
      const a = appt(7, '2026-10-06T09:00', '2026-10-06T10:00')
      const placed = placeAppointments([a], '2026-10-06', 9 * 60)[0]
      const draw = (memberColor?: string) => renderToStaticMarkup(<AppointmentCard placed={placed} selected={false} gutter={false} onOpen={() => {}} memberColor={memberColor} />)
      const plain = draw()
      const coloured = draw(MEMBER_COLOURS[0])
      expect(plain).not.toContain('a-member-dot')
      expect(coloured).toContain('a-member-dot')
      expect(text(coloured)).toBe(text(plain)) // the same words: time, service, client, status
      for (const html of [plain, coloured]) {
        expect(html).toMatch(/<span[^>]*title="appointments\.status\.confirmed"[^>]*>.*?<span data-status-word=""[^>]*>appointments\.status\.confirmed<\/span>/) // icon + word
      }
    })
  })

  it('says so when there is no team to show', () => {
    const html = renderToStaticMarkup(
      <TimeGrid columns={[]} appointments={[]} now={{ date: '2026-10-06', minutes: 600 }} today="2026-10-06" selectedId={null} onSlot={() => {}} onOpen={() => {}} />,
    )
    expect(html).toContain('No team members to show')
  })
})

describe('AppointmentCard hover preview', () => {
  const a = appt(7, '2026-10-06T09:00', '2026-10-06T10:00')
  const placed = placeAppointments([a], '2026-10-06', 9 * 60)[0]
  const base = { placed, selected: false, gutter: false, onOpen: () => {} }
  type Handler = (e: unknown) => void
  type Handlers = { onPointerEnter?: Handler; onPointerLeave?: Handler; onBlur?: Handler; onFocus?: Handler; onKeyDown?: Handler; onClick?: Handler }
  /** The card's event handlers, read off the button it draws (the card holds no state, so it can be called as a function). */
  const handlersOf = (extra: Partial<ComponentProps<typeof AppointmentCard>>) => (AppointmentCard({ ...base, ...extra }) as ReactElement<Handlers>).props
  const describedBy = (extra: { describedBy?: string; previewId?: string }) =>
    renderToStaticMarkup(<AppointmentCard {...base} {...extra} />).match(/<button[^>]*aria-describedby="([^"]*)"/)?.[1]

  it('points at its preview while the preview is open, besides the grid\'s keys hint when it is the current stop', () => {
    expect(describedBy({})).toBeUndefined()
    expect(describedBy({ describedBy: 'calendar-keys-hint' })).toBe('calendar-keys-hint')
    expect(describedBy({ previewId: 'card-preview-7' })).toBe('card-preview-7')
    expect(describedBy({ describedBy: 'calendar-keys-hint', previewId: 'card-preview-7' })).toBe('calendar-keys-hint card-preview-7')
  })

  it('previews after a mouse arrives, never for touch or a pen (a tap opens the panel as before); the pointer leaving hands over to the grid\'s grace, not an immediate close', () => {
    const start = vi.fn()
    const end = vi.fn()
    const leave = vi.fn()
    const h = handlersOf({ onPreviewStart: start, onPreviewEnd: end, onPreviewLeave: leave })
    h.onPointerEnter?.({ pointerType: 'touch' })
    h.onPointerEnter?.({ pointerType: 'pen' })
    expect(start).not.toHaveBeenCalled()
    h.onPointerEnter?.({ pointerType: 'mouse' })
    expect(start.mock.calls).toEqual([[7, 'pointer']]) // opened by the pointer: the preview says "Click to open"
    h.onPointerLeave?.({ pointerType: 'mouse' })
    expect(leave).toHaveBeenCalledTimes(1)
    expect(end).not.toHaveBeenCalled() // the pointer may be on its way to the preview (WCAG 1.4.13)
  })

  it('previews when the keyboard focuses it, closes when it loses focus, and still reports itself as the grid\'s stop', () => {
    const start = vi.fn()
    const end = vi.fn()
    const stop = vi.fn()
    const h = handlersOf({ onPreviewStart: start, onPreviewEnd: end, stopKey: 'appt:7', onFocusStop: stop })
    h.onFocus?.({ currentTarget: { matches: (q: string) => q === ':focus-visible' } })
    expect(start.mock.calls).toEqual([[7, 'focus']]) // opened by the keyboard: the preview says "Press Enter to open"
    expect(stop.mock.calls).toEqual([['appt:7']])
    h.onBlur?.({})
    expect(end).toHaveBeenCalledTimes(1)
  })

  it('does not preview for focus that is not the keyboard\'s (a click, or focus handed back when the panel closes), yet still reports the stop', () => {
    const start = vi.fn()
    const stop = vi.fn()
    const h = handlersOf({ onPreviewStart: start, stopKey: 'appt:7', onFocusStop: stop })
    h.onFocus?.({ currentTarget: { matches: () => false } })
    expect(start).not.toHaveBeenCalled()
    expect(stop.mock.calls).toEqual([['appt:7']])
    // An engine that does not know :focus-visible throws on the selector: every focus then counts as the keyboard's.
    h.onFocus?.({ currentTarget: { matches: () => { throw new SyntaxError('not a valid selector') } } })
    expect(start.mock.calls).toEqual([[7, 'focus']])
  })

  it('closes the preview when it is clicked, then opens the panel (Safari and Firefox on macOS do not focus a button on click, so no blur would)', () => {
    const calls: string[] = []
    const h = handlersOf({ onPreviewEnd: () => calls.push('end'), onOpen: (id) => calls.push(`open ${id}`), previewId: 'card-preview-7' })
    h.onClick?.({})
    expect(calls).toEqual(['end', 'open 7'])
  })

  it('still opens the panel on a click when the grid gave it no preview props', () => {
    const open = vi.fn()
    handlersOf({ onOpen: open }).onClick?.({})
    expect(open.mock.calls).toEqual([[7]])
  })

  it('leaves the keyboard alone: the grid closes a preview on Escape from the window, so the card handles no key of its own', () => {
    expect(handlersOf({ onPreviewEnd: vi.fn(), previewId: 'card-preview-7' }).onKeyDown).toBeUndefined()
    expect(handlersOf({}).onKeyDown).toBeUndefined()
  })

  it('is untouched without the preview props: no handler throws', () => {
    const h = handlersOf({})
    expect(() => { h.onPointerEnter?.({ pointerType: 'mouse' }); h.onPointerLeave?.({}); h.onBlur?.({}); h.onFocus?.({ currentTarget: { matches: () => true } }) }).not.toThrow()
  })

  it('draws no preview until one is asked for', () => {
    const html = grid([appt(7, '2026-10-06T09:00', '2026-10-06T10:00')])
    expect(html).not.toContain('role="tooltip"')
    expect(html).not.toContain('card-preview-')
  })
})

describe('DayOverview', () => {
  it('keeps only the status legend: the day\'s counts moved to the Today strip', () => {
    const html = renderToStaticMarkup(<DayOverview />)
    expect(html).not.toContain('data-count')
    expect(html).not.toContain('<dl')
    expect(html).not.toMatch(/overview\.(total|upcoming|in_progress|completed|attention)/)
    expect(html).toContain('Statuses')
    for (const status of ['pending', 'confirmed', 'in_progress', 'completed', 'no_show', 'cancelled']) expect(html, status).toContain(`appointments.status.${status}`)
  })

  it('keeps its one heading a heading, set as a mono eyebrow', () => {
    const html = renderToStaticMarkup(<DayOverview />)
    const heads = [...html.matchAll(/<h2 class="([^"]*)"/g)].map(m => m[1])
    expect(heads).toHaveLength(1)
    expect(heads[0]).toContain('font-a-mono')
    expect(heads[0]).toContain('uppercase')
  })
})

describe('MiniMonth', () => {
  it('marks the selected day and today, and every day is a button', () => {
    const html = renderToStaticMarkup(<MiniMonth date="2026-10-06" today="2026-10-08" locale="en-GB" onPick={() => {}} />)
    expect((html.match(/<button/g) ?? []).length).toBe(42 + 2) // 42 days, previous and next month
    expect(html).toMatch(/aria-pressed="true"[^>]*>6</)
    expect(html).toMatch(/aria-current="date"[^>]*>8</)
    expect(html).toContain('October 2026')
  })

  it('sets the month in the display serif; the chosen day is an accent chip and today a ringed day', () => {
    const html = renderToStaticMarkup(<MiniMonth date="2026-10-06" today="2026-10-08" locale="en-GB" onPick={() => {}} />)
    expect(html).toMatch(/<h2 class="[^"]*font-a-display[^"]*">October 2026<\/h2>/)
    expect(html).toMatch(/aria-pressed="true"[^>]*class="[^"]*bg-a-accent text-a-accent-ink font-semibold shadow-a-sm[^"]*"[^>]*>6</)
    expect(html).toMatch(/aria-current="date"[^>]*class="[^"]*ring-1 ring-a-accent-text text-a-accent-text font-semibold[^"]*"[^>]*>8</)
  })
})
