import { describe, expect, it } from 'vitest'
import { columnsFor, gridRange, needsWindows, rangeFor, shift } from './calendarState'
import type { AppointmentSummary, CalendarMaster } from '../lib/types'

const day = (windows: [string, string][]) => ({ windows: windows.map(([start, end]) => ({ start, end })), time_off: [] })
const emma: CalendarMaster = { id: 1, name: 'Emma', title: 'Hair Stylist', avatar: null, days: { '2026-10-06': day([['09:00', '17:00']]), '2026-10-07': day([['10:00', '18:00']]) } }
const james: CalendarMaster = { id: 2, name: 'James', title: null, avatar: null, days: { '2026-10-06': day([['08:00', '12:00']]) } }

const appt = (start: string, end: string, masterId = 1): AppointmentSummary => ({
  id: 1, reference: 'SVC-1', start, end, duration_minutes: 45, service: { id: 1, name: 'Cut' }, master: { id: masterId, name: 'x' },
  client: { id: null, name: 'Ada', is_member: false }, status: 'confirmed', payment: { state: 'not_paid_online' }, revision: 'r',
})

describe('needsWindows', () => {
  it('only the grid views draw working hours and free slots; the list asks for none', () => {
    expect(needsWindows('day')).toBe(true)
    expect(needsWindows('week')).toBe(true)
    expect(needsWindows('list')).toBe(false)
  })
})

describe('rangeFor / shift', () => {
  it('a day is one date; week and list are Monday to Sunday', () => {
    expect(rangeFor('day', '2026-10-06')).toEqual({ from: '2026-10-06', to: '2026-10-06' })
    expect(rangeFor('week', '2026-10-06')).toEqual({ from: '2026-10-05', to: '2026-10-11' })
    expect(rangeFor('list', '2026-10-11')).toEqual({ from: '2026-10-05', to: '2026-10-11' })
  })

  it('moves by a day or by a week', () => {
    expect(shift('day', '2026-10-31', 1)).toBe('2026-11-01')
    expect(shift('week', '2026-10-06', -1)).toBe('2026-09-29')
    expect(shift('list', '2026-12-28', 1)).toBe('2027-01-04')
  })
})

describe('columnsFor', () => {
  it('day view: one column per team member, or just the chosen one', () => {
    const all = columnsFor('day', '2026-10-06', [emma, james], null, '2026-10-06', 'en-GB')
    expect(all.map(c => [c.title, c.subtitle, c.date, c.isToday])).toEqual([
      ['Emma', 'Hair Stylist', '2026-10-06', true],
      ['James', null, '2026-10-06', true],
    ])
    expect(columnsFor('day', '2026-10-06', [emma, james], 2, '2026-10-06', 'en-GB').map(c => c.title)).toEqual(['James'])
    // A person's column is headed by their initials; a day column in the week view is not.
    expect(all.map(c => c.initials)).toEqual(['E', 'J'])
    expect(columnsFor('day', '2026-10-06', [{ ...emma, name: 'mara  ilves-kask' }], null, '2026-10-06', 'en-GB')[0].initials).toBe('MI')
  })

  it('week view: seven day columns for the chosen person, the first when none is chosen', () => {
    const week = columnsFor('week', '2026-10-07', [emma, james], null, '2026-10-06', 'en-GB')
    expect(week).toHaveLength(7)
    expect(week.every(c => c.master.id === 1)).toBe(true)
    expect(week.map(c => c.date)).toEqual(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'])
    expect(week.map(c => c.isToday)).toEqual([false, true, false, false, false, false, false])
    expect(new Set(week.map(c => c.key)).size).toBe(7)
    expect(week.every(c => c.initials === null)).toBe(true)
    expect(columnsFor('week', '2026-10-07', [emma, james], 2, '2026-10-06', 'en-GB')[0].master.id).toBe(2)
  })

  it('no team, no columns', () => {
    expect(columnsFor('day', '2026-10-06', [], null, '2026-10-06', 'en-GB')).toEqual([])
    expect(columnsFor('week', '2026-10-06', [], null, '2026-10-06', 'en-GB')).toEqual([])
  })
})

describe('gridRange', () => {
  it('covers every column\'s hours and every appointment shown', () => {
    const columns = columnsFor('day', '2026-10-06', [emma, james], null, '2026-10-06', 'en-GB')
    expect(gridRange(columns, [])).toEqual({ startMin: 8 * 60, endMin: 19 * 60 })
    expect(gridRange(columns, [appt('2026-10-06T06:30', '2026-10-06T07:15'), appt('2026-10-06T20:00', '2026-10-06T21:30', 2)]))
      .toEqual({ startMin: 6 * 60, endMin: 22 * 60 })
  })
})
