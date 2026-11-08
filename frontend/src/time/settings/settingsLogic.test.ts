import { describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/api', () => ({ api: {} }))

import type { ChannelDef, Template } from '../lib/types'
import {
  GENERAL, NEW_CHANNEL_LOOK, NEW_GROUP_LOOK, addChannel, addGroup, categoriesOf, channelOf, channelsFor, channelsPayload, clockValue, dayChanges,
  dayFormOf, dayProblem, groupEntries, groupsPayload, lookOf, moved, nameProblems, newNameProblem, replaced, sameChannels, sameDay, sameGroups,
  settingsTabOf, slugOf, templateFormOf, templateGroups, templatePayload, templateProblem, toggleType, typeChips, uniqueKey, withTab, withType,
  without, type DayForm, type TemplateForm,
} from './settingsLogic'

const channel = (key: string, label: string, groups: string[] = []): ChannelDef => ({ key, label, icon: 'phone', color: '#94a3b8', groups })
const template = (id: number, extra: Partial<Template> = {}): Template => ({
  id, name: `T${id}`, title: `Title ${id}`, category: null, task_group: null, task_category: null, priority: 'Normal', duration_minutes: null,
  description: null, sort_order: 0, ...extra,
})

describe('sections and lists', () => {
  it('keeps the section in the address, the working day by default', () => {
    expect(settingsTabOf('templates')).toBe('templates')
    expect(settingsTabOf('nope')).toBe('day')
    expect(withTab(new URLSearchParams('tab=types'), 'day').toString()).toBe('')
    expect(withTab(new URLSearchParams(''), 'tasks').toString()).toBe('tab=tasks')
  })

  it('moves, removes and replaces entries without touching the original', () => {
    const list = ['a', 'b', 'c']
    expect(moved(list, 0, 1)).toEqual(['b', 'a', 'c'])
    expect(moved(list, 2, -1)).toEqual(['a', 'c', 'b'])
    expect(moved(list, 0, -1)).toEqual(['a', 'b', 'c'])
    expect(moved(list, 2, 1)).toEqual(['a', 'b', 'c'])
    expect(without(list, 1)).toEqual(['a', 'c'])
    expect(replaced(list, 1, 'x')).toEqual(['a', 'x', 'c'])
    expect(list).toEqual(['a', 'b', 'c'])
  })
})

describe('the working day', () => {
  const settings = { window: { start: '08:30', end: '17:00' }, minutes_per_day: 450, days_per_week: 5 }
  const saved: DayForm = dayFormOf(settings)

  it('reads the bootstrap\'s settings into the form', () => {
    expect(saved).toEqual({ start: '08:30', end: '17:00', hours: '7.5', days: '5' })
    expect(clockValue('09:15:00')).toBe('09:15')
  })

  it('refuses a day that ends before it starts, and hours or days out of range', () => {
    expect(dayProblem(saved)).toBeNull()
    expect(dayProblem({ ...saved, start: '9:00' })).toBe('start')
    expect(dayProblem({ ...saved, end: '25:00' })).toBe('end')
    expect(dayProblem({ ...saved, end: '08:30' })).toBe('end_before_start')
    expect(dayProblem({ ...saved, end: '07:00' })).toBe('end_before_start')
    expect(dayProblem({ ...saved, hours: '0.5' })).toBe('hours')
    expect(dayProblem({ ...saved, hours: '24.5' })).toBe('hours')
    expect(dayProblem({ ...saved, hours: '7.25' })).toBe('hours')
    expect(dayProblem({ ...saved, hours: '' })).toBe('hours')
    expect(dayProblem({ ...saved, hours: '24' })).toBeNull()
    expect(dayProblem({ ...saved, days: '8' })).toBe('days')
    expect(dayProblem({ ...saved, days: '4.5' })).toBe('days')
    expect(dayProblem({ ...saved, days: '' })).toBe('days')
  })

  it('writes only what changed: the window as an object, hours and days as numbers', () => {
    expect(dayChanges(saved, saved)).toEqual([])
    expect(dayChanges({ ...saved, end: '18:00' }, saved)).toEqual([{ key: 'business_hours_profile', value: { start: '08:30', end: '18:00' } }])
    expect(dayChanges({ ...saved, hours: '8', days: '6' }, saved)).toEqual([
      { key: 'planner_work_hours_per_day', value: 8 },
      { key: 'planner_work_days_per_week', value: 6 },
    ])
    expect(dayChanges({ ...saved, hours: '7.50' }, saved)).toEqual([])
    expect(sameDay({ ...saved, hours: '7.50' }, saved)).toBe(true)
    expect(sameDay({ ...saved, start: '08:00' }, saved)).toBe(false)
  })
})

describe('task types', () => {
  it('fills a type\'s look: its own, else the built-in one for its name, else the Custom fallback', () => {
    const groups = [
      { name: 'Housekeeping', icon: null, color: null },
      { name: 'Spa', icon: 'heart', color: '#ec4899' },
      { name: 'Garden', icon: null, color: null },
    ]
    expect(groupEntries(groups)).toEqual([
      { name: 'Housekeeping', icon: 'bed-double', color: '#10b981' },
      { name: 'Spa', icon: 'heart', color: '#ec4899' },
      { name: 'Garden', ...NEW_GROUP_LOOK },
    ])
    expect(lookOf('spa', groups)).toEqual({ icon: 'heart', color: '#ec4899' })
    expect(lookOf(null, groups)).toEqual(NEW_GROUP_LOOK)
  })

  it('saves the whole list in its order with trimmed names', () => {
    const list = addGroup([{ name: ' Spa ', icon: 'heart', color: '#ec4899' }], '  Concierge ')
    expect(groupsPayload(list)).toEqual([{ name: 'Spa', icon: 'heart', color: '#ec4899' }, { name: 'Concierge', icon: 'sparkles', color: '#94a3b8' }])
    expect(sameGroups(list, [{ name: 'Spa', icon: 'heart', color: '#ec4899' }, { name: 'Concierge', icon: 'sparkles', color: '#94a3b8' }])).toBe(true)
    expect(sameGroups(list, [...list].reverse())).toBe(false)
  })

  it('marks empty names and repeats without regard to case, keeping the first', () => {
    expect(nameProblems(['Spa', 'spa ', '', 'Bar'])).toEqual([null, 'duplicate', 'empty', null])
    expect(newNameProblem(' SPA', ['Spa'])).toBe('duplicate')
    expect(newNameProblem('  ', ['Spa'])).toBe('empty')
    expect(newNameProblem('Bar', ['Spa'])).toBeNull()
  })
})

describe('tasks', () => {
  it('makes a key from the first label as the full admin does, unique among the others', () => {
    expect(slugOf('Room check')).toBe('room_check')
    expect(slugOf('  Call / e-mail!  ')).toBe('call_e_mail')
    expect(slugOf('Уборка')).toBe('task')
    expect(uniqueKey('task', ['task', 'task_2'])).toBe('task_3')
    expect(uniqueKey('room_check', ['call'])).toBe('room_check')
    const list = addChannel([channel('room_check', 'Room check')], 'Room-check ')
    expect(list[1]).toEqual({ key: 'room_check_2', label: 'Room-check', ...NEW_CHANNEL_LOOK, groups: [] })
  })

  it('keeps the key when a task is renamed, and saves the whole list', () => {
    const list = replaced([channel('room_check', 'Room check')], 0, { ...channel('room_check', 'Room check'), label: ' Room inspection ' })
    expect(channelsPayload(list)).toEqual([{ key: 'room_check', label: 'Room inspection', icon: 'phone', color: '#94a3b8', groups: [] }])
    expect(sameChannels(list, [channel('room_check', 'Room inspection')])).toBe(true)
  })

  it('tags a task with types, none meaning every type, and still offers a tag whose type is gone', () => {
    const c = channel('call', 'Call', ['Sales'])
    expect(toggleType(c, 'Events').groups).toEqual(['Sales', 'Events'])
    expect(toggleType(c, 'Sales').groups).toEqual([])
    expect(typeChips(channel('call', 'Call', ['Old type']), ['Sales', 'Events'])).toEqual(['Sales', 'Events', 'Old type'])
  })
})

describe('templates', () => {
  const channels = [channel('call', 'Call'), channel('room_check', 'Room check', ['Housekeeping']), channel('pitch', 'Pitch', ['Sales'])]

  it('offers the tasks of a type and the untagged ones', () => {
    expect(channelsFor('Housekeeping', channels).map(c => c.key)).toEqual(['call', 'room_check'])
    expect(channelsFor('', channels).map(c => c.key)).toEqual(['call', 'room_check', 'pitch'])
  })

  it('finds a stored task by its key or its label', () => {
    expect(channelOf('room_check', channels)?.label).toBe('Room check')
    expect(channelOf('room CHECK', channels)?.key).toBe('room_check')
    expect(channelOf('', channels)).toBeUndefined()
  })

  it('fills the form from a template, or a new one in General at Normal', () => {
    expect(templateFormOf(null)).toMatchObject({ category: GENERAL, priority: 'Normal', task_group: '', duration: '' })
    const form = templateFormOf(template(1, { category: 'Rooms', task_group: 'Housekeeping', task_category: 'Room check', priority: 'Medium', duration_minutes: 45 }), channels)
    expect(form).toMatchObject({ category: 'Rooms', task_group: 'Housekeeping', task_category: 'room_check', priority: 'Normal', duration: '45' })
    expect(templateFormOf(template(2, { priority: 'urgent', task_category: 'Unknown' }), channels)).toMatchObject({ priority: 'High', task_category: 'Unknown' })
  })

  it('drops the task when the new type does not offer it', () => {
    const form: TemplateForm = { ...templateFormOf(null), task_group: 'Housekeeping', task_category: 'room_check' }
    expect(withType(form, 'Sales', channels)).toMatchObject({ task_group: 'Sales', task_category: '' })
    expect(withType({ ...form, task_category: 'call' }, 'Sales', channels)).toMatchObject({ task_group: 'Sales', task_category: 'call' })
    expect(withType(form, '', channels).task_category).toBe('room_check')
  })

  it('needs a name, a title and a whole number of minutes from 1', () => {
    const ok: TemplateForm = { ...templateFormOf(null), name: 'Briefing', title: 'Morning briefing' }
    expect(templateProblem(ok)).toBeNull()
    expect(templateProblem({ ...ok, name: ' ' })).toBe('name')
    expect(templateProblem({ ...ok, title: '' })).toBe('title')
    expect(templateProblem({ ...ok, duration: '0' })).toBe('duration')
    expect(templateProblem({ ...ok, duration: '12.5' })).toBe('duration')
    expect(templateProblem({ ...ok, duration: '30' })).toBeNull()
  })

  it('sends a category and a priority always, and empty fields as null', () => {
    const form: TemplateForm = { ...templateFormOf(null), name: ' Briefing ', title: ' Morning briefing ', category: ' ', duration: '30', description: '  ' }
    expect(templatePayload(form)).toEqual({
      name: 'Briefing', title: 'Morning briefing', category: GENERAL, task_group: null, task_category: null, priority: 'Normal',
      duration_minutes: 30, description: null,
    })
    expect(templatePayload({ ...form, task_group: 'Sales', task_category: 'pitch', priority: 'High', duration: '' })).toMatchObject({
      task_group: 'Sales', task_category: 'pitch', priority: 'High', duration_minutes: null,
    })
  })

  it('groups templates by category, General for none, each in its saved order', () => {
    const groups = templateGroups([
      template(3, { category: 'Rooms', sort_order: 2 }), template(1, { category: 'Rooms', sort_order: 1 }), template(2), template(4, { category: '  ' }),
    ])
    expect(groups.map(g => [g.category, g.items.map(i => i.id)])).toEqual([['General', [2, 4]], ['Rooms', [1, 3]]])
    expect(categoriesOf([template(1, { category: 'Rooms' })])).toEqual(['General', 'Rooms'])
  })
})
