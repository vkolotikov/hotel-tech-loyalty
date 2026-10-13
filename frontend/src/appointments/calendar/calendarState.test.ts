import { describe, expect, it } from 'vitest'
import { columnsFor, dayTeam, gridRange, needsWindows, rangeFor, shift } from './calendarState'
import type { AppointmentSummary, CalendarMaster } from '../lib/types'

const day = (windows: [string, string][]) => ({ windows: windows.map(([start, end]) => ({ start, end })), time_off: [] })
const emma: CalendarMaster = { id: 1, name: 'Emma', title: 'Hair Stylist', avatar: null, color: '#3b7dd8', days: { '2026-10-06': day([['09:00', '17:00']]), '2026-10-07': day([['10:00', '18:00']]) } }
const james: CalendarMaster = { id: 2, name: 'James', title: null, avatar: null, color: '#c46f1b', days: { '2026-10-06': day([['08:00', '12:00']]) } }

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

  it('a name that starts with an emoji keeps the whole emoji as its initial, not half a pair', () => {
    const initials = (name: string) => columnsFor('day', '2026-10-06', [{ ...emma, name }], null, '2026-10-06', 'en-GB')[0].initials
    expect(initials('🌸 Rose')).toBe('🌸R')
    expect(initials('🌸')).toBe('🌸')
    expect(initials('anna 🌸 lee')).toBe('A🌸')
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

describe('dayTeam', () => {
  const own = (id: number, masterId: number | null, status: AppointmentSummary['status'] = 'confirmed'): AppointmentSummary => ({
    ...appt('2026-10-06T10:00', '2026-10-06T10:45', masterId ?? 1), id, status, master: masterId === null ? null : { id: masterId, name: 'x' },
  })
  const cards = [own(1, 1), own(2, 2), own(3, null), own(4, 2, 'cancelled'), own(5, 2)]

  it('shows everyone when no one is hidden', () => {
    const team = dayTeam([emma, james], cards, [])
    expect(team.hidden).toEqual([])
    expect(team.masters.map(m => m.id)).toEqual([1, 2])
    expect(team.appointments.map(a => a.id)).toEqual([1, 2, 3, 4, 5])
  })

  it('hides a person\'s column and cards, keeps cards nobody is assigned to, and still counts the hidden person', () => {
    const team = dayTeam([emma, james], cards, [2])
    expect(team.hidden).toEqual([2])
    expect(team.masters.map(m => m.id)).toEqual([1])
    expect(team.appointments.map(a => a.id)).toEqual([1, 3])
    expect(team.counts).toEqual({ 1: 1, 2: 2 }) // the cancelled card is not counted
  })

  it('ignores a stored id that names no one on the team', () => {
    const team = dayTeam([emma, james], cards, [9, 1])
    expect(team.hidden).toEqual([1])
    expect(team.masters.map(m => m.id)).toEqual([2])
  })

  it('never hides everyone: a stored list that covers the whole team shows the whole team', () => {
    const team = dayTeam([emma, james], cards, [1, 2])
    expect(team.hidden).toEqual([])
    expect(team.masters.map(m => m.id)).toEqual([1, 2])
    expect(dayTeam([], [], [1]).hidden).toEqual([])
  })
})
