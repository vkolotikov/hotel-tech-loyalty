import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { TimeGrid } from './TimeGrid'
import { DayOverview } from './DayOverview'
import { MiniMonth } from './MiniMonth'
import { columnsFor } from './calendarState'
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

const emma: CalendarMaster = {
  id: 1, name: 'Emma', title: 'Hair Stylist', avatar: null,
  days: { '2026-10-06': { windows: [{ start: '09:00', end: '13:00' }, { start: '14:00', end: '17:00' }], time_off: [{ start: '13:00', end: '14:00', reason: 'Lunch' }] } },
}

const appt = (id: number, start: string, end: string, status: Status = 'confirmed', name = 'Sophie Williams'): AppointmentSummary => ({
  id, reference: `SVC-${id}`, start, end, duration_minutes: 45, service: { id: 1, name: 'Haircut & Styling' }, master: { id: 1, name: 'Emma' },
  client: { id: 5, name, is_member: true }, status, payment: { state: 'not_paid_online' }, revision: 'r',
})

function grid(appointments: AppointmentSummary[], today = '2026-10-06') {
  const columns = columnsFor('day', '2026-10-06', [emma], null, today, 'en-GB')
  return renderToStaticMarkup(
    <TimeGrid columns={columns} appointments={appointments} now={{ date: today, minutes: 10 * 60 + 20 }} today={today}
      selectedId={null} onSlot={() => {}} onOpen={() => {}} />,
  )
}

describe('TimeGrid', () => {
  it('heads each column with the person and draws the appointment as time, client, service and a worded status', () => {
    const html = grid([appt(7, '2026-10-06T09:00', '2026-10-06T10:00')])
    expect(html).toContain('Emma')
    expect(html).toContain('Hair Stylist')
    expect(html).toContain('09:00 – 10:00')
    expect(html).toContain('Sophie Williams')
    expect(html).toContain('Haircut &amp; Styling')
    expect(html).toContain('appointments.status.confirmed')
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

  it('a half-hour card shows its time and client; the service line is left out rather than clipped', () => {
    const html = grid([appt(7, '2026-10-06T09:00', '2026-10-06T09:30')])
    expect(html).toContain('data-density="tight"')
    expect(html).toContain('09:00 – 09:30')
    expect(html).toContain('Sophie Williams')
    expect(html).not.toContain('Haircut &amp; Styling')
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

  it('says so when there is no team to show', () => {
    const html = renderToStaticMarkup(
      <TimeGrid columns={[]} appointments={[]} now={{ date: '2026-10-06', minutes: 600 }} today="2026-10-06" selectedId={null} onSlot={() => {}} onOpen={() => {}} />,
    )
    expect(html).toContain('No team members to show')
  })
})

describe('DayOverview', () => {
  it('counts the day from the appointments it is given, with no comparison to other days', () => {
    const html = renderToStaticMarkup(
      <DayOverview date="2026-10-06" now={{ date: '2026-10-06', minutes: 10 * 60 + 20 }} appointments={[
        appt(1, '2026-10-06T09:00', '2026-10-06T09:45', 'completed'),
        appt(2, '2026-10-06T09:30', '2026-10-06T10:15', 'confirmed'), // 50 minutes late, not started
        appt(3, '2026-10-06T10:00', '2026-10-06T10:45', 'in_progress'),
        appt(4, '2026-10-06T15:00', '2026-10-06T15:45', 'confirmed'),
        appt(5, '2026-10-06T16:00', '2026-10-06T16:45', 'pending'),
        appt(6, '2026-10-07T09:00', '2026-10-07T09:45', 'confirmed'), // another day
      ]} />,
    )
    expect(html).toContain('data-count="total">5<')
    expect(html).toContain('data-count="upcoming">1<')
    expect(html).toContain('data-count="in_progress">1<')
    expect(html).toContain('data-count="completed">1<')
    expect(html).toContain('data-count="attention">2<')
    expect(html).not.toMatch(/%|vs\.|last week/)
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
})
