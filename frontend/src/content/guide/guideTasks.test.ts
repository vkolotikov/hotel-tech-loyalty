import { describe, expect, it } from 'vitest'
import { guideActions, filterTasks, TASKS } from './guideTasks'

describe('Guide tasks and available next steps', () => {
  it('keeps setup actions with managers and lets staff write and use media', () => {
    expect(guideActions('setup', false)).toEqual([])
    expect(guideActions('media', false)).toContain('/content/media')
    expect(guideActions('week', false)).toContain('/content/write/new')
    expect(guideActions('setup', true)).toContain('/content/settings')
    expect(guideActions('setup', true)).toContain('/content/brand?section=channels')
  })
  it('searches translated task text and filters by task group', () => {
    const texts = Object.fromEntries(TASKS.map(task => [task.id, task.id === 'media' ? 'Fotos wiederverwenden' : task.id]))
    expect(filterTasks('WIEDER', 'all', texts).map(t => t.id)).toEqual(['media'])
    expect(filterTasks('', 'collaborate', texts).map(t => t.id)).toContain('approvals')
  })
})
