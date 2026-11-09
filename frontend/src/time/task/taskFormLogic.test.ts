import { describe, expect, it } from 'vitest'
import { EMPTY_FORM } from '../lib/tasks'
import type { ChannelDef, GroupDef } from '../lib/types'
import { nextForm, taskTiles, tasksOfType, typeTiles, withTask, withType } from './taskFormLogic'

const GROUPS: GroupDef[] = [{ name: 'Housekeeping', icon: null, color: null }, { name: 'Sales', icon: 'phone', color: '#06b6d4' }]
const CHANNELS: ChannelDef[] = [
  { key: 'room_check', label: 'Room check', icon: 'clipboard-list', color: '#94a3b8', groups: ['Housekeeping'] },
  { key: 'call', label: 'Call', icon: 'phone', color: '#22d3ee', groups: ['Sales'] },
  { key: 'email', label: 'Email', icon: 'mail', color: '#60a5fa', groups: [] },
]

describe('the task form\'s type and task pickers (the full admin\'s drawer)', () => {
  it('offers every type with its look, the person\'s preferred marked, and no type last', () => {
    const tiles = typeTiles(GROUPS, ['Sales'])
    expect(tiles.map(t => [t.value, t.preferred])).toEqual([['Housekeeping', false], ['Sales', true], ['', false]])
    expect(tiles[0]).toMatchObject({ icon: 'bed-double', color: '#10b981' }) // the built-in look of a known name
    expect(tiles[1]).toMatchObject({ icon: 'phone', color: '#06b6d4' })
  })

  it('shows a type\'s own tasks and the untagged ones; with no type only the untagged', () => {
    expect(tasksOfType('Housekeeping', CHANNELS).map(c => c.key)).toEqual(['room_check', 'email'])
    expect(tasksOfType('', CHANNELS).map(c => c.key)).toEqual(['email'])
    expect(taskTiles('Sales', CHANNELS, ['call']).map(t => [t.key, t.preferred])).toEqual([['call', true], ['email', false]])
  })

  it('keeps the task when the new type still offers it, and an older row\'s own text always', () => {
    const form = { ...EMPTY_FORM, task_group: 'Housekeeping', task_category: 'room_check' }
    expect(withType(form, 'Sales', CHANNELS).task_category).toBe('')
    expect(withType({ ...form, task_category: 'email' }, 'Sales', CHANNELS).task_category).toBe('email')
    expect(withType({ ...form, task_category: 'Old text' }, 'Sales', CHANNELS).task_category).toBe('Old text')
  })

  it('fills an empty title from the task, replaces only its own fill, and never what the person typed', () => {
    const first = withTask(EMPTY_FORM, CHANNELS[0], null)
    expect([first.form.title, first.form.task_category, first.filled]).toEqual(['Room check', 'room_check', 'Room check'])
    const second = withTask(first.form, CHANNELS[2], first.filled)
    expect([second.form.title, second.filled]).toEqual(['Email', 'Email'])
    const cleared = withTask(second.form, CHANNELS[2], second.filled)
    expect([cleared.form.title, cleared.form.task_category]).toEqual(['', ''])
    const typed = withTask({ ...EMPTY_FORM, title: 'Call the supplier' }, CHANNELS[1], null)
    expect([typed.form.title, typed.form.task_category, typed.filled]).toEqual(['Call the supplier', 'call', null])
  })

  it('starts the next task on the same day, person and type', () => {
    const sent = { ...EMPTY_FORM, title: 'Room 101', task_date: '2026-11-10', person: 'u4', task_group: 'Housekeeping', task_category: 'room_check', duration_minutes: '30' }
    expect(nextForm(EMPTY_FORM, sent)).toEqual({ ...EMPTY_FORM, task_date: '2026-11-10', person: 'u4', task_group: 'Housekeeping' })
  })
})
