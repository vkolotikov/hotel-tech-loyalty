import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { TaskGrid, TypeGrid } from './TaskPickers'
import { taskTiles, typeTiles } from './taskFormLogic'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string, vars?: Record<string, unknown>) => (fallback ?? key).replace(/\{\{(\w+)\}\}/g, (_, n) => String((vars ?? {})[n] ?? '')),
  }),
}))

const GROUPS = [{ name: 'Housekeeping', icon: null, color: null }, { name: 'Sales', icon: 'phone', color: '#06b6d4' }]
const CHANNELS = [
  { key: 'room_check', label: 'Room check', icon: 'clipboard-list', color: '#94a3b8', groups: ['Housekeeping'] },
  { key: 'email', label: 'Email', icon: 'mail', color: '#60a5fa', groups: [] },
]

describe('the task form\'s pickers', () => {
  it('draws every type as a tile with its icon, the chosen one pressed and in its colour, no type last', () => {
    const html = renderToStaticMarkup(<TypeGrid tiles={typeTiles(GROUPS, ['Sales'])} value="Housekeeping" onPick={() => {}} person="Anna" />)
    expect(html.match(/aria-pressed="true"/g)?.length).toBe(1)
    expect(html).toMatch(/aria-pressed="true"[^>]*style="background-color:color-mix\(in srgb, #10b981 22%/)
    expect(html).toContain('title="Fits Anna"')
    expect(html.match(/<svg/g)?.length).toBe(3)
    expect(html.indexOf('Custom')).toBeGreaterThan(html.indexOf('Sales'))
  })

  it('draws the chosen type\'s tasks as a grid, the person\'s preferred marked', () => {
    const html = renderToStaticMarkup(<TaskGrid tiles={taskTiles('Housekeeping', CHANNELS, ['email'])} value="room_check" onPick={() => {}} person="Anna" />)
    expect(html).toContain('Room check')
    expect(html).toContain('Email')
    expect(html).toContain('grid-cols-3')
    expect(html.match(/bg-a-st-pending"/g)?.length).toBe(1)
  })
})
