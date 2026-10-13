import { describe, expect, it } from 'vitest'
import { dayOverview } from '../lib/status'
import type { AppointmentSummary, CalendarMaster, RefundVia, Status, Takings, TakingsRow } from '../lib/types'
import { avatarsThatFit, takenNet, todayFigures } from './todayFigures'

const DAY = '2026-10-06'
const NOW = { date: DAY, minutes: 10 * 60 + 20 }

const appt = (id: number, start: string, status: Status = 'confirmed'): AppointmentSummary => ({
  id, reference: `SVC-${id}`, start, end: start, duration_minutes: 45, service: { id: 1, name: 'Haircut' }, master: { id: 1, name: 'Marie' },
  client: { id: id, name: `Client ${id}`, is_member: false }, status, payment: { state: 'not_paid_online' }, revision: 'r',
})

const master = (id: number, name: string, days: CalendarMaster['days']): CalendarMaster => ({ id, name, title: null, avatar: null, color: '#3b7dd8', days })

describe('todayFigures: counts', () => {
  const list = [
    appt(1, `${DAY}T09:00`, 'completed'),
    appt(2, `${DAY}T09:30`, 'confirmed'),   // 50 minutes late, not started: needs attention
    appt(3, `${DAY}T10:00`, 'in_progress'),
    appt(4, `${DAY}T15:00`, 'confirmed'),
    appt(5, `${DAY}T16:00`, 'pending'),     // awaiting confirmation: needs attention
    appt(6, `${DAY}T11:00`, 'no_show'),
    appt(7, `${DAY}T12:00`, 'cancelled'),   // not part of the day
    appt(8, '2026-10-07T09:00', 'confirmed'), // another day
  ]

  it('counts the day without cancelled ones, done = completed, no-show = no_show', () => {
    const f = todayFigures(list, [], DAY, NOW)
    expect(f.total).toBe(6)
    expect(f.done).toBe(1)
    expect(f.noShow).toBe(1)
  })

  it('takes "needs attention" from the day overview, so the two never disagree', () => {
    const f = todayFigures(list, [], DAY, NOW)
    expect(f.attention).toBe(dayOverview(list, DAY, NOW).attention)
    expect(f.attention).toBe(2)
  })
})

describe('todayFigures: next up', () => {
  const list = [
    appt(1, `${DAY}T09:00`, 'completed'),
    appt(2, `${DAY}T09:30`, 'confirmed'),
    appt(3, `${DAY}T10:00`, 'in_progress'),
    appt(4, `${DAY}T15:00`, 'confirmed'),
    appt(5, `${DAY}T12:00`, 'pending'),
    appt(6, `${DAY}T11:00`, 'cancelled'),
    appt(7, `${DAY}T11:30`, 'no_show'),
  ]

  it('on the venue\'s today is the earliest pending or confirmed one starting now or later', () => {
    const f = todayFigures(list, [], DAY, NOW)
    expect(f.next?.id).toBe(5) // 12:00 pending: before the 15:00 one; the 09:30 one has begun, 10:00 is in progress, 11:00 is cancelled, 11:30 no-show
    expect(f.nextIsFirst).toBe(false)
  })

  it('counts an appointment that starts at this very minute', () => {
    const f = todayFigures([appt(1, `${DAY}T10:20`, 'confirmed')], [], DAY, NOW)
    expect(f.next?.id).toBe(1)
  })

  it('is null when nothing is left to come today', () => {
    const f = todayFigures(list, [], DAY, { date: DAY, minutes: 17 * 60 })
    expect(f.next).toBeNull()
    expect(f.nextIsFirst).toBe(false)
  })

  it('breaks a tie of two at the same minute by id', () => {
    const f = todayFigures([appt(9, `${DAY}T14:00`), appt(4, `${DAY}T14:00`)], [], DAY, NOW)
    expect(f.next?.id).toBe(4)
  })

  it('on another day is the first appointment of that day that is not cancelled, whatever its status', () => {
    const other = '2026-10-08'
    const f = todayFigures([
      appt(1, `${other}T08:00`, 'cancelled'),
      appt(2, `${other}T13:00`, 'confirmed'),
      appt(3, `${other}T09:00`, 'completed'),
      appt(4, `${DAY}T07:00`, 'confirmed'),
    ], [], other, NOW)
    expect(f.next?.id).toBe(3)
    expect(f.nextIsFirst).toBe(true)
  })

  it('on another day with nothing booked is null, still "first"', () => {
    const f = todayFigures(list, [], '2026-10-09', NOW)
    expect(f.next).toBeNull()
    expect(f.nextIsFirst).toBe(true)
  })
})

describe('todayFigures: team', () => {
  const windows = [{ start: '09:00', end: '17:00' }]
  const people = [
    master(1, 'Marie', { [DAY]: { windows, time_off: [] } }),
    master(2, 'Anouk', { [DAY]: { windows, time_off: [{ start: null, end: null, reason: 'Holiday' }] } }),  // whole day off
    master(3, 'Jonas', { [DAY]: { windows: [], time_off: [] } }),                                           // no hours that day
    master(4, 'Lena', {}),                                                                                   // the day is not in her payload
    master(5, 'Petra', { [DAY]: { windows, time_off: [{ start: '13:00', end: '14:00', reason: 'Lunch' }] } }), // an hour off: still in
  ]

  it('is in with working hours and no whole-day time off; off with a whole day off or no hours', () => {
    const f = todayFigures([], people, DAY, NOW)
    expect(f.teamIn.map(m => m.name)).toEqual(['Marie', 'Petra'])
    expect(f.teamOff.map(m => m.name)).toEqual(['Anouk', 'Jonas', 'Lena'])
  })
})

describe('takenNet', () => {
  const methods = (m: Partial<Record<RefundVia, { in: number; out: number }>>): Record<RefundVia, { in: number; out: number }> => ({
    cash: { in: 0, out: 0 }, card_desk: { in: 0, out: 0 }, transfer: { in: 0, out: 0 }, other: { in: 0, out: 0 }, online_card: { in: 0, out: 0 }, ...m,
  })
  const row = (id: number, kind: 'payment' | 'refund', currency: string, amount: number): TakingsRow => ({
    id, kind, method: 'cash', amount, currency, note: null, by: null, at: null, reference: `SVC-${id}`, client: 'Client',
  })

  const takings: Takings = {
    date: DAY,
    totals: {
      EUR: methods({ cash: { in: 120, out: 20 }, card_desk: { in: 80.5, out: 0 }, online_card: { in: 40, out: 10 } }),
      USD: methods({ cash: { in: 999, out: 0 } }),
    },
    rows: [row(1, 'payment', 'EUR', 120), row(2, 'refund', 'EUR', 20), row(3, 'payment', 'EUR', 80.5), row(4, 'payment', 'EUR', 40), row(5, 'refund', 'EUR', 10), row(6, 'payment', 'USD', 999)],
    online: {},
  }

  it('sums in minus out over every method of the currency, and counts that currency\'s payments only (a refund is not a payment)', () => {
    expect(takenNet(takings, 'EUR')).toEqual({ amount: 210.5, payments: 3 })
  })

  it('ignores another currency', () => {
    expect(takenNet(takings, 'USD')).toEqual({ amount: 999, payments: 1 })
    expect(takenNet(takings, 'GBP')).toEqual({ amount: 0, payments: 0 })
  })

  it('does not let float dust show (0.1 + 0.2 is 0.3)', () => {
    const dust: Takings = { ...takings, totals: { EUR: methods({ cash: { in: 0.1, out: 0 }, transfer: { in: 0.2, out: 0 } }) }, rows: [] }
    expect(takenNet(dust, 'EUR').amount).toBe(0.3)
  })
})

describe('avatarsThatFit', () => {
  // A 36 px avatar; each further one overlaps the last by 6 px. The rings (2 px) may reach into the tile's padding.
  it('draws everyone the row has room for, and keeps the last place for "+N" when some are left over', () => {
    expect(avatarsThatFit(4, 171)).toEqual({ shown: 4, more: 0 }) // 1440 px: five fit
    expect(avatarsThatFit(5, 171)).toEqual({ shown: 5, more: 0 })
    expect(avatarsThatFit(8, 171)).toEqual({ shown: 4, more: 4 }) // the case the browser showed spilling out
    expect(avatarsThatFit(4, 133)).toEqual({ shown: 4, more: 0 }) // the panel open: four fit exactly
    expect(avatarsThatFit(4, 129)).toEqual({ shown: 4, more: 0 }) // 1280 px: 4 × 36 − 3 × 6 = 126 (the rings may reach into the tile's padding)
    expect(avatarsThatFit(5, 133)).toEqual({ shown: 3, more: 2 })
    expect(avatarsThatFit(4, 93)).toEqual({ shown: 1, more: 3 })
  })

  it('never draws more than six, however wide the row', () => {
    expect(avatarsThatFit(6, 400)).toEqual({ shown: 6, more: 0 })
    expect(avatarsThatFit(9, 400)).toEqual({ shown: 6, more: 3 })
  })

  it('before the row is measured (0), draws up to six and counts the rest', () => {
    expect(avatarsThatFit(4, 0)).toEqual({ shown: 4, more: 0 })
    expect(avatarsThatFit(9, 0)).toEqual({ shown: 6, more: 3 })
  })

  it('with room for one circle only, it is the count', () => {
    expect(avatarsThatFit(3, 50)).toEqual({ shown: 0, more: 3 })
    expect(avatarsThatFit(1, 50)).toEqual({ shown: 1, more: 0 })
    expect(avatarsThatFit(0, 171)).toEqual({ shown: 0, more: 0 })
  })
})
