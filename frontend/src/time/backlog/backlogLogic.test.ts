import { describe, expect, it } from 'vitest'
import type { Task } from '../lib/types'
import {
  backlogFigures, backlogTab, bucketLoad, claimFailure, dayState, dueGroups, dueOf, filterTasks, filterTeam, giveBody,
  horizonDefaults, horizonOf, isFiltered, matchesSearch, newTaskDefaults, planBody, poolGroups, sortByDue, sortStandard,
  teamTasks, typeCounts, venueDay,
} from './backlogLogic'

function task(id: number, extra: Partial<Task> = {}): Task {
  return {
    id, title: `Task ${id}`, description: null, task_date: null, start_time: null, end_time: null, duration_minutes: null,
    minutes: 30, status: 'todo', done: false, priority: 'Normal', priority_rank: 1, task_group: null, task_category: null,
    assigned_to_user_id: null, employee_name: null, owner: null, subtasks: [], subtasks_done: 0, subtasks_total: 0,
    running: false, started_at: null, actual_minutes: null, recurring: false, pool_horizon: null, pool_due_date: null,
    overdue: false, updated_at: '2026-11-08T09:00:00Z', ...extra,
  }
}

// 2026-11-11 is a Wednesday; its week runs Mon 9 – Sun 15 November.
const TODAY = '2026-11-11'

describe('backlog sections', () => {
  it('reads the section from the address, the team only for someone who may see it', () => {
    expect(backlogTab(null, true)).toBe('mine')
    expect(backlogTab('pool', false)).toBe('pool')
    expect(backlogTab('team', true)).toBe('team')
    expect(backlogTab('team', false)).toBe('mine')
    expect(backlogTab('nonsense', true)).toBe('mine')
  })

  it('starts a new task in the section it was asked from', () => {
    expect(newTaskDefaults('mine', 'u3')).toEqual({ task_date: '', person: 'u3', pool_horizon: '' })
    expect(newTaskDefaults('pool', 'u3')).toEqual({ task_date: '', person: '', pool_horizon: 'general' })
    expect(newTaskDefaults('team', 'u3')).toEqual({ task_date: '', person: '', pool_horizon: '' })
    expect(horizonDefaults('day', TODAY)).toEqual({ task_date: '', person: '', pool_horizon: 'day', pool_due_date: TODAY })
    expect(horizonDefaults('week', TODAY)).toEqual({ task_date: '', person: '', pool_horizon: 'week' })
  })
})

describe('search and types', () => {
  const list = [
    task(1, { title: 'Clean room 12', task_group: 'Housekeeping' }),
    task(2, { title: 'Fix the tap', task_group: 'Maintenance', description: 'Room 12, cold water' }),
    task(3, { title: 'Order towels', task_group: 'Housekeeping' }),
    task(4, { title: 'Call the bank' }),
    task(5, { title: 'Paint the gate', task_group: 'Garden' }),
  ]

  it('keeps tasks with every word somewhere in them, in any case', () => {
    expect(matchesSearch(list[1], 'room 12')).toBe(true)
    expect(matchesSearch(list[1], 'ROOM hot')).toBe(false)
    expect(matchesSearch(list[0], '  ')).toBe(true)
    expect(filterTasks(list, { q: 'room', type: '' }).map(x => x.id)).toEqual([1, 2])
    expect(filterTasks(list, { q: 'room', type: 'Housekeeping' }).map(x => x.id)).toEqual([1])
    expect(filterTasks(list, { q: '', type: 'Garden' }).map(x => x.id)).toEqual([5])
  })

  it('says whether anything is filtered', () => {
    expect(isFiltered({ q: ' ', type: '' })).toBe(false)
    expect(isFiltered({ q: 'x', type: '' })).toBe(true)
    expect(isFiltered({ q: '', type: 'Garden' })).toBe(true)
  })

  it('counts the types present, in the settings order and then the others by name', () => {
    expect(typeCounts(list, [{ name: 'Maintenance' }, { name: 'Housekeeping' }, { name: 'Front desk' }])).toEqual([
      { name: 'Maintenance', count: 1 }, { name: 'Housekeeping', count: 2 }, { name: 'Garden', count: 1 },
    ])
  })
})

describe('due days', () => {
  it('reads a day against today', () => {
    expect(dayState('2026-11-10', TODAY)).toBe('late')
    expect(dayState('2026-11-10', TODAY, false)).toBe('later')
    expect(dayState(TODAY, TODAY)).toBe('today')
    expect(dayState('2026-11-12', TODAY)).toBe('tomorrow')
    expect(dayState('2026-11-20', TODAY)).toBe('later')
  })

  it('knows the horizon, unknown ones counting as anytime', () => {
    expect(horizonOf({ pool_horizon: 'day' })).toBe('day')
    expect(horizonOf({ pool_horizon: 'week' })).toBe('week')
    expect(horizonOf({ pool_horizon: null })).toBe('general')
    expect(horizonOf({ pool_horizon: 'someday' })).toBe('general')
  })

  it('flags a day task once its day has gone, a week task only after its week and a day', () => {
    expect(dueOf(task(1, { pool_horizon: 'day', pool_due_date: '2026-11-09' }), TODAY)).toEqual({ date: '2026-11-09', state: 'late' })
    expect(dueOf(task(1, { pool_horizon: 'day', pool_due_date: '2026-11-09', done: true }), TODAY)?.state).toBe('later')
    expect(dueOf(task(1, { pool_horizon: 'week', pool_due_date: '2026-11-10' }), TODAY)?.state).toBe('later')
    expect(dueOf(task(1, { pool_horizon: 'week', pool_due_date: '2026-11-08' }), TODAY)?.state).toBe('late')
    expect(dueOf(task(1, { pool_horizon: 'general', pool_due_date: '2026-11-01' }), TODAY)).toBeNull()
    expect(dueOf(task(1, { pool_horizon: 'day', pool_due_date: null }), TODAY)).toBeNull()
  })
})

describe('order and grouping', () => {
  it('puts open before done, then high before normal before low, keeping the server order otherwise', () => {
    const list = [task(1, { done: true, priority_rank: 0 }), task(2, { priority_rank: 2 }), task(3), task(4, { priority_rank: 0 }), task(5)]
    expect(sortStandard(list).map(x => x.id)).toEqual([4, 3, 5, 2, 1])
  })

  it('sorts by the soonest due day, the ones without a day after', () => {
    const list = [
      task(1),
      task(2, { pool_horizon: 'day', pool_due_date: '2026-11-13' }),
      task(3, { pool_horizon: 'day', pool_due_date: '2026-11-09' }),
      task(4, { pool_horizon: 'week', pool_due_date: '2026-11-15', priority_rank: 0 }),
      task(5, { pool_horizon: 'day', pool_due_date: '2026-11-08', done: true }),
    ]
    expect(sortByDue(list).map(x => x.id)).toEqual([3, 2, 4, 1, 5])
  })

  it('groups "by a day" tasks under their due day, late first, open before done within a day', () => {
    const groups = dueGroups([
      task(1, { pool_horizon: 'day', pool_due_date: '2026-11-13' }),
      task(2, { pool_horizon: 'day', pool_due_date: '2026-11-09', done: true }),
      task(3, { pool_horizon: 'day', pool_due_date: '2026-11-09' }),
      task(4, { pool_horizon: 'day', pool_due_date: TODAY }),
      task(5, { pool_horizon: 'day', pool_due_date: null }),
      task(6, { pool_horizon: 'day', pool_due_date: '2026-11-08', done: true }),
    ], TODAY)
    expect(groups.map(g => [g.date, g.state, g.tasks.map(x => x.id)])).toEqual([
      ['2026-11-08', 'later', [6]],
      ['2026-11-09', 'late', [3, 2]],
      [TODAY, 'today', [4]],
      ['2026-11-13', 'later', [1]],
      [null, 'none', [5]],
    ])
  })

  it('splits the pool into its three horizons', () => {
    const groups = poolGroups([
      task(1, { pool_horizon: 'general' }),
      task(2, { pool_horizon: 'week', pool_due_date: '2026-11-15' }),
      task(3, { pool_horizon: 'day', pool_due_date: '2026-11-12' }),
      task(4, { pool_horizon: null, priority_rank: 0 }),
    ], TODAY)
    expect(groups.dayCount).toBe(1)
    expect(groups.day.map(g => g.date)).toEqual(['2026-11-12'])
    expect(groups.week.map(x => x.id)).toEqual([2])
    expect(groups.general.map(x => x.id)).toEqual([4, 1])
  })
})

describe('figures', () => {
  it('reads an instant as the venue’s day', () => {
    expect(venueDay('2026-11-10T23:30:00Z', 'Europe/Riga')).toBe('2026-11-11')
    expect(venueDay('2026-11-10T23:30:00Z', 'UTC')).toBe('2026-11-10')
    expect(venueDay('2026-11-10T23:30:00Z', 'Not/AZone')).toBe('2026-11-10')
    expect(venueDay(null, 'UTC')).toBeNull()
    expect(venueDay('soon', 'UTC')).toBeNull()
  })

  it('counts open work: mine, the pool, due by a day this week (late ones too) and untouched for a week', () => {
    const mine = [
      task(1, { pool_horizon: 'day', pool_due_date: '2026-11-10' }),
      task(2, { done: true }),
      task(3, { updated_at: '2026-11-03T08:00:00Z' }),
    ]
    const pool = [
      task(4, { pool_horizon: 'day', pool_due_date: '2026-11-15' }),
      task(5, { pool_horizon: 'day', pool_due_date: '2026-11-16' }),
      task(6, { pool_horizon: 'week', pool_due_date: '2026-11-15' }),
      task(7, { updated_at: '2026-11-05T08:00:00Z' }),
      task(8, { done: true, updated_at: '2026-10-01T08:00:00Z' }),
      task(9, { updated_at: null }),
    ]
    expect(backlogFigures(mine, pool, TODAY, 'UTC')).toEqual({ mine: 2, pool: 5, dueThisWeek: 2, late: 1, stale: 1, weekEnd: '2026-11-15' })
  })
})

describe('writes', () => {
  const refusal = (status: number, data: Record<string, unknown> = {}) => ({ response: { status, data } })

  it('tells someone-took-it-first and missing skills apart from the rest', () => {
    expect(claimFailure(refusal(409, { error: 'Task is already assigned to another user', employee_name: 'Ada' }))).toBe('taken')
    expect(claimFailure(refusal(403, { error: 'You do not have the skills', required_skill: 'Garden' }))).toBe('skills')
    expect(claimFailure(refusal(403, { error: 'Nope' }))).toBe('other')
    expect(claimFailure(new Error('offline'))).toBe('other')
  })

  it('builds the move bodies the full admin takes', () => {
    const me = { key: 'u3', user_id: 3, name: 'Anna' }
    expect(planBody(TODAY, me)).toEqual({ task_date: TODAY, assigned_to_user_id: 3, employee_name: 'Anna' })
    expect(giveBody({ key: 'u9', user_id: 9, name: 'Boris' })).toEqual({ task_date: null, assigned_to_user_id: 9, employee_name: 'Boris' })
  })
})

describe('the team’s buckets', () => {
  const data = {
    pool: [task(1, { title: 'Sweep the yard', task_group: 'Garden' }), task(2, { title: 'Count towels', task_group: 'Housekeeping', priority_rank: 0 })],
    buckets: [
      { key: 'u3', user_id: 3, name: 'Anna', tasks: [task(3, { title: 'Clean room 4', task_group: 'Housekeeping', minutes: 45 }), task(4, { done: true, minutes: 60 })] },
      { key: 'u9', user_id: 9, name: 'Boris', tasks: [] },
    ],
  }

  it('sums a bucket’s open work', () => {
    expect(bucketLoad(data.buckets[0].tasks)).toEqual({ open: 1, minutes: 45 })
    expect(bucketLoad([])).toEqual({ open: 0, minutes: 0 })
  })

  it('filters the pool and every bucket alike, keeping every person', () => {
    const shown = filterTeam(data, { q: '', type: 'Housekeeping' })
    expect(shown.pool.map(x => x.id)).toEqual([2])
    expect(shown.buckets.map(b => [b.key, b.tasks.map(x => x.id)])).toEqual([['u3', [3]], ['u9', []]])
    expect(filterTeam(data, { q: '', type: '' }).pool.map(x => x.id)).toEqual([2, 1])
  })

  it('lists every task of the team, the pool’s first', () => {
    expect(teamTasks(data).map(x => x.id)).toEqual([1, 2, 3, 4])
    expect(teamTasks(undefined)).toEqual([])
  })
})
