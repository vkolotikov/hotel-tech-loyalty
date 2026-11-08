import { describe, expect, it } from 'vitest'
import { addDays, daysBetween, isDay, isoWeekday, monthStart, snap, toClock, toMinutes, weekStart } from './dates'
import { dayLabel, duration, firstName, initials, percent, weekdayName } from './format'
import { rankSignals, signalText, signalTone } from './signals'
import { EMPTY_FORM, assignmentOf, endOf, formProblem, payloadOf, priorityOf } from './tasks'
import { timeUrl } from './api'

describe('days and clocks are the venue’s digits', () => {
  it('steps days across months, years and a daylight-saving weekend', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-03-29', -1)).toBe('2026-03-28')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(daysBetween('2026-11-02', '2026-11-09')).toBe(7)
  })

  it('knows weekdays, the week’s Monday and the month’s first day', () => {
    expect(isoWeekday('2026-11-04')).toBe(3)
    expect(isoWeekday('2026-11-08')).toBe(7)
    expect(weekStart('2026-11-08')).toBe('2026-11-02')
    expect(weekStart('2026-11-02')).toBe('2026-11-02')
    expect(monthStart('2026-11-19')).toBe('2026-11-01')
  })

  it('refuses what is not a day', () => {
    expect(isDay('2026-02-30')).toBe(false)
    expect(isDay('2026-11-04')).toBe(true)
    expect(isDay(null)).toBe(false)
  })

  it('reads and writes clocks and snaps a drop', () => {
    expect(toMinutes('09:30')).toBe(570)
    expect(toMinutes('09:30:00')).toBe(570)
    expect(toMinutes(null)).toBeNull()
    expect(toClock(570)).toBe('09:30')
    expect(toClock(5000)).toBe('23:59')
    expect(snap(577)).toBe(570)
    expect(snap(584)).toBe(585)
  })
})

describe('words for lengths and days', () => {
  it('writes a length in hours and minutes', () => {
    expect(duration(45)).toBe('45 min')
    expect(duration(120)).toBe('2 h')
    expect(duration(95, { h: 'ч', min: 'мин' })).toBe('1 ч 35 мин')
    expect(duration(0)).toBe('—')
    expect(duration(null)).toBe('—')
  })

  it('names days and weekdays without the browser’s zone', () => {
    expect(dayLabel('2026-11-04', 'en-GB')).toBe('Wed 4 Nov')
    expect(weekdayName(1, 'en-GB')).toBe('Mon')
    expect(weekdayName(7, 'en-GB', 'long')).toBe('Sunday')
  })

  it('initials, first names and shares', () => {
    expect(initials('Anna Berzina')).toBe('AB')
    expect(firstName('Anna Berzina')).toBe('Anna')
    expect(percent(1, 3)).toBe(33)
    expect(percent(1, 0)).toBeNull()
  })
})

describe('a task form becomes what the full admin’s endpoints take', () => {
  const anna = { key: 'u7', user_id: 7, name: 'Anna Berzina' }

  it('spells priorities the planner’s way', () => {
    expect(priorityOf('high')).toBe('High')
    expect(priorityOf('Urgent')).toBe('High')
    expect(priorityOf('Medium')).toBe('Normal')
    expect(priorityOf('low')).toBe('Low')
    expect(priorityOf(null)).toBe('Normal')
  })

  it('works out the end, and names the person by account and name', () => {
    expect(endOf('09:30', 45)).toBe('10:15')
    expect(endOf('', 45)).toBeNull()
    expect(assignmentOf(anna)).toEqual({ assigned_to_user_id: 7, employee_name: 'Anna Berzina' })
    expect(assignmentOf(null)).toEqual({ assigned_to_user_id: null, employee_name: null })
  })

  it('sends a timed task with its end, and a repeat only when creating', () => {
    const form = { ...EMPTY_FORM, title: ' Rooms ', task_date: '2026-11-05', start_time: '10:00', duration_minutes: '90', recurring: 'weekly' as const, recurring_until: '2026-12-01' }
    const body = payloadOf(form, anna, true)
    expect(body).toMatchObject({ title: 'Rooms', task_date: '2026-11-05', start_time: '10:00', end_time: '11:30', duration_minutes: 90, assigned_to_user_id: 7, recurring: 'weekly', recurring_until: '2026-12-01' })
    expect(body).not.toHaveProperty('status')
    const edit = payloadOf(form, anna, false)
    expect(edit).not.toHaveProperty('recurring')
    expect(edit.status).toBe('todo')
  })

  it('puts a task with no day and nobody in the pool with its horizon, and drops a start without a day', () => {
    const body = payloadOf({ ...EMPTY_FORM, title: 'Fix the gate', start_time: '10:00', pool_horizon: 'day', pool_due_date: '2026-11-06' }, null, true)
    expect(body).toMatchObject({ task_date: null, start_time: null, pool_horizon: 'day', pool_due_date: '2026-11-06', assigned_to_user_id: null })
    expect(payloadOf({ ...EMPTY_FORM, title: 'Mine later' }, anna, true)).not.toHaveProperty('pool_horizon')
  })

  it('says what stops a save', () => {
    expect(formProblem({ ...EMPTY_FORM, title: '  ' }, true)).toBe('title')
    expect(formProblem({ ...EMPTY_FORM, title: 'x', recurring: 'daily' }, true)).toBe('recurring_needs_day')
    expect(formProblem({ ...EMPTY_FORM, title: 'x', recurring: 'daily', task_date: '2026-11-05', recurring_until: '2026-11-05' }, true)).toBe('recurring_until')
    expect(formProblem({ ...EMPTY_FORM, title: 'x', pool_horizon: 'day' }, true)).toBe('pool_due_date')
    expect(formProblem({ ...EMPTY_FORM, title: 'x' }, true)).toBeNull()
  })
})

describe('calls', () => {
  it('reach only the listed areas, for every brand', () => {
    expect(timeUrl('time/today')).toBe('/v1/admin/time/today?brand_id=all')
    expect(timeUrl('planner/tasks?date=2026-11-04')).toBe('/v1/admin/planner/tasks?date=2026-11-04&brand_id=all')
    expect(() => timeUrl('loyalty/members')).toThrow()
  })
})

describe('signals in words', () => {
  const t = ((_key: string, fallback: string, vars: Record<string, unknown>) =>
    fallback.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? ''))) as never
  const names = { person: (k: string) => (k === 'u7' ? 'Anna' : undefined), task: (id: number) => (id === 3 ? { title: 'Rooms' } : undefined) }

  it('names the person, the task and the lengths', () => {
    expect(signalText(t, { code: 'over_capacity', person: 'u7', value: 540, limit: 480 }, names, { h: 'h', min: 'min' })).toBe('Anna has 9 h planned for a 8 h day.')
    expect(signalText(t, { code: 'unscheduled_high', task: 3 }, names, { h: 'h', min: 'min' })).toBe('“Rooms” is high priority and has no time yet.')
    expect(signalText(t, { code: 'made_up' }, names, { h: 'h', min: 'min' })).toBe('')
  })

  it('puts dangers first', () => {
    expect(signalTone('overlap')).toBe('danger')
    expect(signalTone('light_day')).toBe('info')
    expect(rankSignals([{ code: 'light_day' }, { code: 'unassigned' }, { code: 'overlap' }]).map(s => s.code)).toEqual(['overlap', 'unassigned', 'light_day'])
  })
})
