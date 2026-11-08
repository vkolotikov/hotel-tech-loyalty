import { describe, expect, it } from 'vitest'
import {
  DEFAULT_RANGE, MAX_DAYS, accuracyNote, barShare, changeTone, countChange, dayBars, groupRows, hourRows, insightsKey, instantDay, isEmpty,
  labelled, loadWidth, peopleRows, personOptions, pointsChange, poolRows, previousRange, rangeFromSearch, rangeKindOf, rangeOf, sectionOf,
  weekdayRows, withParam, withRange,
} from './insightsLogic'
import type { Insights, Totals } from '../lib/types'

const TODAY = '2026-11-11' // a Wednesday

const totals = (extra: Partial<Totals> = {}): Totals => ({
  tasks: 0, done: 0, on_time: 0, late: 0, overdue: 0, planned_minutes: 0, done_minutes: 0, tracked_minutes: 0, tracked_tasks: 0,
  completion_pct: null, on_time_pct: null, accuracy_pct: null, ...extra,
})
const person = (key: string, name: string, extra: Partial<Insights['people'][number]> = {}): Insights['people'][number] => ({
  ...totals(), key, name, user_id: null, capacity_minutes: 0, load_pct: null, ...extra,
})

describe('the period', () => {
  it('reads presets by the venue\'s today: this week from Monday, the last 7 and 30 days, this month and last month', () => {
    expect(rangeOf('week', TODAY)).toEqual({ kind: 'week', from: '2026-11-09', to: TODAY, clipped: false })
    expect(rangeOf('7', TODAY)).toMatchObject({ from: '2026-11-05', to: TODAY })
    expect(rangeOf('30', TODAY)).toMatchObject({ from: '2026-10-13', to: TODAY })
    expect(rangeOf('month', TODAY)).toMatchObject({ from: '2026-11-01', to: TODAY })
    expect(rangeOf('last_month', TODAY)).toMatchObject({ from: '2026-10-01', to: '2026-10-31' })
    expect(rangeOf('last_month', '2026-03-05')).toMatchObject({ from: '2026-02-01', to: '2026-02-28' })
    expect(rangeOf('week', '2026-11-09')).toMatchObject({ from: '2026-11-09', to: '2026-11-09' })
  })

  it('takes chosen days in either order, and cuts a long period to its last 92 days', () => {
    expect(rangeOf('custom', TODAY, '2026-10-20', '2026-10-01')).toEqual({ kind: 'custom', from: '2026-10-01', to: '2026-10-20', clipped: false })
    const long = rangeOf('custom', TODAY, '2026-01-01', '2026-10-31')
    expect(long).toMatchObject({ from: '2026-08-01', to: '2026-10-31', clipped: true })
    expect(MAX_DAYS).toBe(92)
    expect(rangeOf('custom', TODAY, '2026-10-05', 'nonsense')).toMatchObject({ from: '2026-10-05', to: '2026-10-05' })
    expect(rangeOf('custom', TODAY, null, null)).toMatchObject({ kind: DEFAULT_RANGE, from: '2026-11-05', to: TODAY })
    expect(rangeOf('custom', TODAY, '2026-02-30', '2026-02-31').kind).toBe(DEFAULT_RANGE)
  })

  it('reads the address, falling back to the last 7 days', () => {
    expect(rangeKindOf('month')).toBe('month')
    expect(rangeKindOf('year')).toBe('7')
    expect(rangeFromSearch(new URLSearchParams('range=custom&from=2026-11-01&to=2026-11-03'), TODAY)).toMatchObject({ kind: 'custom', from: '2026-11-01', to: '2026-11-03' })
    expect(rangeFromSearch(new URLSearchParams(''), TODAY)).toMatchObject({ kind: '7' })
  })

  it('writes the address: a preset drops the chosen days, the default drops itself, other keys stay', () => {
    const prev = new URLSearchParams('range=custom&from=2026-11-01&to=2026-11-03&person=u3&tab=work')
    expect(withRange(prev, 'month').toString()).toBe('range=month&person=u3&tab=work')
    expect(withRange(prev, '7').toString()).toBe('person=u3&tab=work')
    expect(withRange(new URLSearchParams('range=week'), 'custom', '2026-10-01', '2026-10-09').toString()).toBe('range=custom&from=2026-10-01&to=2026-10-09')
    expect(withParam(prev, 'tab', 'people', 'people').get('tab')).toBeNull()
    expect(withParam(prev, 'person', null).has('person')).toBe(false)
    expect(withParam(new URLSearchParams(''), 'tab', 'days', 'people').toString()).toBe('tab=days')
  })

  it('names the period before as the server does: as many days, just before', () => {
    expect(previousRange('2026-11-05', 7)).toEqual({ from: '2026-10-29', to: '2026-11-04' })
    expect(previousRange('2026-11-01', 1)).toEqual({ from: '2026-10-31', to: '2026-10-31' })
  })

  it('keys a period\'s read under time', () => {
    expect(insightsKey('2026-11-05', TODAY, null)).toEqual(['time', 'insights', '2026-11-05', TODAY, null])
  })

  it('knows its sections, people first', () => {
    expect(sectionOf('work')).toBe('work')
    expect(sectionOf('nope')).toBe('people')
    expect(sectionOf(null)).toBe('people')
  })
})

describe('against the period before', () => {
  it('compares two percentages in points, and says nothing when either had nothing to rate', () => {
    expect(pointsChange(80, 72)).toEqual({ kind: 'up', amount: 8 })
    expect(pointsChange(60, 75)).toEqual({ kind: 'down', amount: 15 })
    expect(pointsChange(70, 70)).toEqual({ kind: 'same', amount: 0 })
    expect(pointsChange(70, null)).toBeNull()
    expect(pointsChange(null, 50)).toBeNull()
    expect(pointsChange(70, undefined)).toBeNull()
  })

  it('compares counts, and says nothing when both periods had none', () => {
    expect(countChange(12, 9)).toEqual({ kind: 'up', amount: 3 })
    expect(countChange(0, 4)).toEqual({ kind: 'down', amount: 4 })
    expect(countChange(0, 0)).toBeNull()
  })

  it('reads a move as good, bad or plain news', () => {
    expect(changeTone({ kind: 'up', amount: 3 }, true)).toBe('good')
    expect(changeTone({ kind: 'up', amount: 3 }, false)).toBe('bad')
    expect(changeTone({ kind: 'down', amount: 3 }, false)).toBe('good')
    expect(changeTone({ kind: 'down', amount: 3 }, null)).toBe('plain')
    expect(changeTone({ kind: 'same', amount: 0 }, true)).toBe('plain')
    expect(changeTone(null, true)).toBe('plain')
  })
})

describe('rows and bars', () => {
  it('lists people with work or hours, the most planned first, then by name', () => {
    const rows = peopleRows([
      person('u1', 'Zoe', { tasks: 2, planned_minutes: 60 }),
      person('u2', 'Ada', { tasks: 5, planned_minutes: 300 }),
      person('u3', 'Ben', { capacity_minutes: 480 }),
      person('u4', 'Cleo'),
      person('u5', 'Abe', { tasks: 1, planned_minutes: 60 }),
    ])
    expect(rows.map(r => r.name)).toEqual(['Ada', 'Abe', 'Zoe', 'Ben'])
  })

  it('orders task types by planned time, work without a type last among equals', () => {
    const g = (task_group: string | null, planned_minutes: number, tasks = 1) => ({ ...totals({ planned_minutes, tasks }), task_group })
    expect(groupRows([g(null, 60), g('Sales', 60), g('Housekeeping', 120)]).map(r => r.task_group)).toEqual(['Housekeeping', 'Sales', null])
  })

  it('reads the server\'s accuracy with its own thresholds', () => {
    expect(accuracyNote(130)).toBe('longer')
    expect(accuracyNote(129)).toBeNull()
    expect(accuracyNote(71)).toBeNull()
    expect(accuracyNote(70)).toBe('shorter')
    expect(accuracyNote(null)).toBeNull()
  })

  it('sizes bars against the longest, keeping a small one visible', () => {
    expect(barShare(50, 100)).toBe(50)
    expect(barShare(1, 1000)).toBe(2)
    expect(barShare(0, 100)).toBe(0)
    expect(barShare(5, 0)).toBe(0)
    expect(loadWidth(140)).toBe(100)
    expect(loadWidth(45)).toBe(45)
    expect(loadWidth(null)).toBe(0)
    expect(loadWidth(0)).toBe(0)
  })

  it('has all seven weekdays, Monday first', () => {
    const rows = weekdayRows([{ weekday: 3, tasks: 2, done: 1, minutes: 90 }])
    expect(rows.map(r => r.weekday)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(rows[2].minutes).toBe(90)
    expect(rows[0]).toEqual({ weekday: 1, tasks: 0, done: 0, minutes: 0 })
  })

  it('fills the start hours across the working window and any hour outside it', () => {
    const rows = hourRows([{ hour: 7, tasks: 2 }, { hour: 10, tasks: 4 }], { start: '09:00', end: '12:00' })
    expect(rows.map(r => r.label)).toEqual(['07', '08', '09', '10', '11'])
    expect(rows.find(r => r.hour === 10)?.tasks).toBe(4)
    expect(hourRows([{ hour: 20, tasks: 1 }], { start: '09:00', end: '18:30' }).map(r => r.hour)).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20])
    expect(hourRows([], { start: '09:00', end: '18:00' })).toEqual([])
  })

  it('draws each day against the busiest, its finished part inside', () => {
    const bars = dayBars([
      { date: '2026-11-09', tasks: 4, done: 2, planned_minutes: 240, done_minutes: 120 },
      { date: '2026-11-10', tasks: 1, done: 0, planned_minutes: 60, done_minutes: 0 },
      { date: '2026-11-11', tasks: 0, done: 0, planned_minutes: 0, done_minutes: 0 },
    ])
    expect(bars.map(b => b.height)).toEqual([100, 25, 0])
    expect(bars.map(b => b.doneHeight)).toEqual([50, 0, 0])
  })

  it('labels at most a few columns, the latest always', () => {
    expect(labelled(3)).toEqual([true, true, true])
    const many = labelled(30, 6)
    expect(many[29]).toBe(true)
    expect(many.filter(Boolean).length).toBeLessThanOrEqual(6)
  })

  it('splits the pool by age with shares of its bar', () => {
    const rows = poolRows({ open: 4, d0: 1, d1: 0, d3: 1, d7: 2, oldest: null })
    expect(rows.map(r => [r.key, r.count, r.share])).toEqual([['d0', 1, 25], ['d1', 0, 0], ['d3', 1, 25], ['d7', 2, 50]])
    expect(poolRows({ open: 0, d0: 0, d1: 0, d3: 0, d7: 0, oldest: null }).every(r => r.share === 0)).toBe(true)
  })

  it('reads an instant as the venue\'s day', () => {
    expect(instantDay('2026-11-01T23:30:00Z', 'Europe/Riga')).toBe('2026-11-02')
    expect(instantDay('2026-11-01T23:30:00Z', 'America/New_York')).toBe('2026-11-01')
    expect(instantDay(null, 'UTC')).toBeNull()
    expect(instantDay('nonsense', 'UTC')).toBeNull()
  })

  it('says a period is empty only when it had no tasks', () => {
    expect(isEmpty({ totals: totals() })).toBe(true)
    expect(isEmpty({ totals: totals({ tasks: 1 }) })).toBe(false)
    expect(isEmpty(undefined)).toBe(false)
  })

  it('offers people by name', () => {
    expect(personOptions([{ key: 'u2', name: 'Zoe' }, { key: 'u1', name: 'Ada' }])).toEqual([{ key: 'u1', name: 'Ada' }, { key: 'u2', name: 'Zoe' }])
  })
})
