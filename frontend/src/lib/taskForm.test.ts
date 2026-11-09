import { describe, expect, it } from 'vitest'
import {
  EMPTY_TASK_FORM, endsAt, formProblems, groupOf, isGridTime, partOf, planBody, planOf, quickDays, splitMinutes, startTimes, suggestedTitle,
  summaryOf, TASK_TYPES, titleOf, TYPE_GROUPS, withDate, withDuration, withTime, type TaskFormState,
} from './taskForm'

const state = (patch: Partial<TaskFormState> = {}): TaskFormState => ({ ...EMPTY_TASK_FORM, ...patch })

describe('the task form, shared by HexaTech CRM and the full admin', () => {
  it('puts every server type in exactly one group', () => {
    const grouped = TYPE_GROUPS.flatMap(g => g.types)
    expect([...grouped].sort()).toEqual([...TASK_TYPES].sort())
    expect(new Set(grouped).size).toBe(TASK_TYPES.length)
    expect(groupOf('whatsapp')).toBe('talk')
    expect(groupOf('site_visit')).toBe('meet')
    expect(groupOf('contract')).toBe('sell')
    expect(groupOf('anything')).toBe('other')
  })

  it('offers start times every half hour from 07:00 to 21:30, by part of the day', () => {
    const parts = startTimes()
    expect(parts.map(p => p.part)).toEqual(['morning', 'afternoon', 'evening'])
    expect(parts[0].times[0]).toBe('07:00')
    expect(parts[0].times.at(-1)).toBe('11:30')
    expect(parts[1].times[0]).toBe('12:00')
    expect(parts[2].times.at(-1)).toBe('21:30')
    expect(parts.flatMap(p => p.times)).toHaveLength(30)
  })

  it('opens the time grid on the part of the day the time is in', () => {
    expect([partOf(''), partOf('07:00'), partOf('11:59'), partOf('12:00'), partOf('16:30'), partOf('17:00'), partOf('23:15')])
      .toEqual(['morning', 'morning', 'morning', 'afternoon', 'afternoon', 'evening', 'evening'])
    expect([isGridTime('09:30'), isGridTime('09:15'), isGridTime('06:30')]).toEqual([true, false, false])
  })

  it('knows the quick days, the next Monday included (a Monday counts the one after)', () => {
    // Wednesday 4 November 2026.
    expect(quickDays('2026-11-04')).toEqual([
      { key: 'today', date: '2026-11-04' }, { key: 'tomorrow', date: '2026-11-05' },
      { key: 'in_2_days', date: '2026-11-06' }, { key: 'next_monday', date: '2026-11-09' },
    ])
    expect(quickDays('2026-11-09').at(-1)).toEqual({ key: 'next_monday', date: '2026-11-16' })
    expect(quickDays('2026-11-08').at(-1)).toEqual({ key: 'next_monday', date: '2026-11-09' })
    expect(quickDays('not a day')).toEqual([])
  })

  it('says when a task ends, the next day included', () => {
    expect(endsAt('09:30', 45)).toEqual({ time: '10:15', nextDay: false })
    expect(endsAt('21:30', 240)).toEqual({ time: '01:30', nextDay: true })
    expect(endsAt('', 30)).toBeNull()
    expect(endsAt('09:30', null)).toBeNull()
    expect(splitMinutes(90)).toEqual({ hours: 1, minutes: 30 })
  })

  it('clears what a step needs when the step before it is taken away', () => {
    const full = state({ date: '2026-11-05', time: '09:30', duration: 30, repeat: 'weekly' })
    expect(withDate(full, '')).toEqual(state())
    expect(withDate(full, '2026-11-06')).toEqual({ ...full, date: '2026-11-06' })
    expect(withTime(full, '09:30')).toEqual({ ...full, time: '', duration: null })
    expect(withTime(full, '10:00')).toEqual({ ...full, time: '10:00' })
    expect(withDuration(full, 30).duration).toBeNull()
    expect(withDuration(full, 60).duration).toBe(60)
  })

  it('follows the type with the title until the person writes their own', () => {
    expect(suggestedTitle('Call', 'Ada Lovelace')).toBe('Call · Ada Lovelace')
    expect(suggestedTitle('Call', '  ')).toBe('Call')
    expect(titleOf(state(), 'Call · Ada')).toBe('Call · Ada')
    expect(titleOf(state({ title: ' Ask about the dates ' }), 'Call · Ada')).toBe('Ask about the dates')
  })

  it('says what stops the form, each step needing the one before', () => {
    expect(formProblems(state(), 'Follow up')).toEqual({})
    expect(formProblems(state(), '')).toEqual({ title: 'required' })
    expect(formProblems(state({ title: 'x'.repeat(201) }), 'Call')).toEqual({ title: 'too_long' })
    expect(formProblems(state({ time: '09:30' }), 'Call')).toEqual({ time: 'needs_date' })
    expect(formProblems(state({ date: '2026-11-05', duration: 30 }), 'Call')).toEqual({ duration: 'needs_time' })
    expect(formProblems(state({ repeat: 'daily' }), 'Call')).toEqual({ repeat: 'needs_date' })
    expect(formProblems(state({ date: '5/11/2026' }), 'Call')).toEqual({ date: 'invalid' })
    expect(formProblems(state({ date: '2026-11-05', time: '25:00' }), 'Call')).toEqual({ time: 'invalid' })
    expect(formProblems(state({ description: 'x'.repeat(4001) }), 'Call')).toEqual({ description: 'too_long' })
  })

  it('sends the plan as the server\'s own fields, never a length without a time or a repeat without a day', () => {
    expect(planBody(state({ date: '2026-11-05', time: '09:30', duration: 45, repeat: 'weekly', priority: 'high' })))
      .toEqual({ priority: 'high', duration_minutes: 45, recurring_rule: { freq: 'weekly' } })
    expect(planBody(state({ duration: 45, repeat: 'weekly' }))).toEqual({ priority: 'normal', duration_minutes: null, recurring_rule: null })
  })

  it('reads a stored task\'s plan, older rows as normal with no length or repeat', () => {
    expect(planOf({ priority: 'high', duration_minutes: 90, recurring_rule: { freq: 'monthly' } })).toEqual({ priority: 'high', duration: 90, repeat: 'monthly' })
    expect(planOf({})).toEqual({ priority: 'normal', duration: null, repeat: 'none' })
    expect(planOf({ priority: 'urgent', duration_minutes: 0, recurring_rule: { freq: 'hourly' } })).toEqual({ priority: 'normal', duration: null, repeat: 'none' })
    expect(planOf(null)).toEqual({ priority: 'normal', duration: null, repeat: 'none' })
  })

  it('sums the task up for its footer', () => {
    expect(summaryOf(state({ type: 'call', date: '2026-11-05', time: '09:30', duration: 30, repeat: 'weekly', priority: 'high' })))
      .toEqual({ type: 'call', date: '2026-11-05', start: '09:30', end: { time: '10:00', nextDay: false }, repeat: 'weekly', priority: 'high' })
    expect(summaryOf(state({ type: 'email' }))).toEqual({ type: 'email', date: null, start: null, end: null, repeat: 'none', priority: 'normal' })
  })
})
