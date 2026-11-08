import { describe, expect, it } from 'vitest'
import type { Board, Lane, Proposal, Task } from '../lib/types'
import { NOBODY, cellOf, lanesOf, readQuery, step, untimedOf } from './boardLogic'
import { byPerson, changesPerson, knownReasons, linesToApply } from './planLogic'
import { columnsOf, heightOf, loadState, minutesAt, topOf, visibleRange } from './timeline'

const task = (id: number, start: string | null, minutes = 60, extra: Partial<Task> = {}): Task => ({
  id, title: `Task ${id}`, description: null, task_date: '2026-11-04', start_time: start, end_time: null, duration_minutes: minutes, minutes,
  status: 'todo', done: false, priority: 'Normal', priority_rank: 1, task_group: null, task_category: null, assigned_to_user_id: null,
  employee_name: null, owner: null, subtasks: [], subtasks_done: 0, subtasks_total: 0, running: false, started_at: null, actual_minutes: null,
  recurring: false, pool_horizon: null, pool_due_date: null, overdue: false, updated_at: null, ...extra,
})
const lane = (key: string, tasks: Task[], works = true): Lane => ({
  key, user_id: 1, name: key, role: 'staff', manager: false, listed: true, has_account: true, skills: null, knowledge: '',
  prefers: { groups: [], tasks: [] }, works, window: { start: '09:00', end: '18:00' }, break_minutes: 0, capacity_minutes: 480,
  planned_minutes: 0, done_minutes: 0, tracked_minutes: 0, load_pct: 0, open_count: 0, done_count: 0, unscheduled: 0, tasks, overdue: [],
})

describe('the timeline', () => {
  it('shows the working window widened to every timed task, in whole hours with an hour either side', () => {
    expect(visibleRange({ start: '09:00', end: '18:00' }, [])).toEqual({ start: 480, end: 1140 })
    expect(visibleRange({ start: '09:00', end: '18:00' }, [task(1, '07:30', 30), task(2, '19:00', 90)])).toEqual({ start: 360, end: 1320 })
  })

  it('places tasks by their minutes and keeps short ones readable', () => {
    const range = { start: 480, end: 1140 }
    expect(topOf(540, range)).toBe(64)
    expect(heightOf(60)).toBe(62)
    expect(heightOf(5)).toBe(22)
    expect(minutesAt(100, range)).toBe(570)
    expect(minutesAt(-50, range)).toBe(480)
  })

  it('sets overlapping tasks side by side, and a later one back in the first column', () => {
    const placed = columnsOf([task(1, '09:00', 60), task(2, '09:30', 60), task(3, '11:00', 30)])
    expect(placed.map(p => [p.item.id, p.column, p.columns])).toEqual([[1, 0, 2], [2, 1, 2], [3, 0, 1]])
  })

  it('says a load’s state', () => {
    expect(loadState(null)).toBe('none')
    expect(loadState(50)).toBe('ok')
    expect(loadState(90)).toBe('high')
    expect(loadState(120)).toBe('over')
  })
})

describe('the board', () => {
  const board = {
    date: '2026-11-04', weekday: 3, today: '2026-11-04', is_today: true, now: '12:00', window: { start: '09:00', end: '18:00' },
    people: [lane('u1', [task(1, '09:00'), task(2, null, 30, { priority_rank: 0 })]), lane('u2', [], false), lane('u3', [task(3, null)], false)],
    unassigned: [task(4, '13:00'), task(5, null)],
    pool: { open: 0, for_day: 0 }, totals: { tasks: 5, done: 0, planned_minutes: 0, capacity_minutes: 0, load_pct: null, unassigned: 2, overdue: 0 }, signals: [],
  } as Board

  it('shows who works or has work, then a lane for timed work nobody has', () => {
    expect(lanesOf(board, false, 'Nobody').map(l => l.key)).toEqual(['u1', 'u3', NOBODY])
    expect(lanesOf(board, true, 'Nobody').map(l => l.key)).toEqual(['u1', 'u2', 'u3', NOBODY])
    expect(lanesOf(board, false, 'Nobody')[0].tasks.map(t => t.id)).toEqual([1])
  })

  it('lists untimed work high priority first, with whose it is', () => {
    expect(untimedOf(board).map(u => [u.task.id, u.person])).toEqual([[2, 'u1'], [3, 'u3'], [5, null]])
  })

  it('reads its address and steps by a day or a week', () => {
    const q = readQuery(new URLSearchParams('date=2026-11-08&view=week&person=u3'), '2026-11-04')
    expect(q).toEqual({ date: '2026-11-08', view: 'week', person: 'u3', everyone: false })
    expect(step(q, 1)).toBe('2026-11-09')
    expect(step({ ...q, view: 'day' }, -1)).toBe('2026-11-07')
    expect(readQuery(new URLSearchParams('date=nonsense'), '2026-11-04').date).toBe('2026-11-04')
  })

  it('fills a week’s cell in time order with a count of the rest', () => {
    const cell = cellOf([task(1, null), task(2, '14:00'), task(3, '08:00'), task(4, '10:00')])
    expect(cell.shown.map(t => t.id)).toEqual([3, 4, 2])
    expect(cell.more).toBe(1)
  })
})

describe('a plan as a person reviews it', () => {
  const line = (task_id: number, person: string, start: string, extra: Partial<Proposal> = {}): Proposal => ({
    task_id, title: `T${task_id}`, task_group: null, priority: 'Normal', person, user_id: 1, employee_name: person === 'u1' ? 'Anna' : 'Boris',
    start_time: start, end_time: start, duration_minutes: 30, reasons: ['most_free', 'invented'], note: '', source: 'rules', from: 'day',
    previous: { date: null, start_time: null, person: null }, seen: 'x', ...extra,
  })

  it('groups by person in time order and sends only the ticked lines', () => {
    const lines = [line(1, 'u2', '14:00'), line(2, 'u1', '13:00'), line(3, 'u1', '09:00')]
    expect(byPerson(lines).map(g => [g.name, g.lines.map(l => l.task_id), g.minutes])).toEqual([['Anna', [3, 2], 60], ['Boris', [1], 30]])
    expect(linesToApply(lines, new Set([2]))).toEqual([{ task_id: 2, person: 'u1', start_time: '13:00', duration_minutes: 30, seen: 'x' }])
  })

  it('marks a new person and shows only the reasons it has words for', () => {
    expect(changesPerson(line(1, 'u2', '10:00', { previous: { date: null, start_time: null, person: 'u1' } }))).toBe(true)
    expect(changesPerson(line(1, 'u2', '10:00'))).toBe(false)
    expect(knownReasons(['most_free', 'invented'])).toEqual(['most_free'])
  })
})
