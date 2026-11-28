import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TimeContext } from '../TimeProvider'
import type { Bootstrap, Template } from '../lib/types'
import { SettingsPage } from './SettingsPage'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en-GB' },
  }),
}))
vi.mock('../../lib/api', () => ({ api: {} }))

const can = { plan_team: true, edit_people: true, team_buckets: true, manage_settings: true, manage_templates: true }
const boot = (manager: boolean, mode?: 'team' | 'own', extra: Partial<Bootstrap['settings']> = {}): Bootstrap => ({
  name: 'HexaTech Time Planner',
  organization: { id: 7, name: 'Villa Riga', industry: 'hotel' },
  accent: null,
  venue: { timezone: 'Europe/Riga', today: '2026-11-11' },
  features: { time_management: true, voice: false },
  ai: { status: 'ok', percent: 10, ready: true, state: 'ready' },
  staff: { id: 3, key: 'u3', name: 'Anna Berzina', role: manager ? 'manager' : 'staff', can: { ...can, manage_settings: manager } },
  settings: {
    window: { start: '08:30', end: '17:00' }, minutes_per_day: 450, days_per_week: 5,
    groups: [{ name: 'Housekeeping', icon: null, color: null }, { name: 'Front Desk', icon: 'concierge-bell', color: '#3b82f6' }],
    channels: [
      { key: 'room_check', label: 'Room check', icon: 'clipboard-list', color: '#94a3b8', groups: ['Housekeeping'] },
      { key: 'call', label: 'Call', icon: 'phone', color: '#22d3ee', groups: [] },
      { key: 'old_task', label: 'Old task', icon: 'phone', color: '#22d3ee', groups: ['Gone type'] },
    ],
    ...(mode ? { planning_mode: mode } : {}),
    ...extra,
  },
  counts: { today_open: 0, overdue: 0, pool: 0 },
})

const template = (id: number, extra: Partial<Template>): Template => ({
  id, name: `T${id}`, title: `Title ${id}`, category: null, task_group: null, task_category: null, priority: 'Normal', duration_minutes: null,
  description: null, sort_order: 0, ...extra,
})
const TEMPLATES = [
  template(1, { name: 'Morning briefing', category: 'Management', task_group: 'Front Desk', task_category: 'call', priority: 'High', duration_minutes: 30 }),
  template(2, { name: 'Linen count', task_group: 'Housekeeping', task_category: 'room_check', duration_minutes: 45 }),
]

function render(path: string, manager = true, mode?: 'team' | 'own', extra: Partial<Bootstrap['settings']> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  qc.setQueryData(['time', 'templates'], TEMPLATES)
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <TimeContext.Provider value={{ data: boot(manager, mode, extra), isLoading: false, isError: false, error: null, refetch: () => {} }}>
          <Routes><Route path="/time/settings" element={<SettingsPage />} /></Routes>
        </TimeContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Settings', () => {
  it('opens on the working day, with the venue\'s hours and the standard time from the bootstrap', () => {
    const html = render('/time/settings')
    expect(html).toContain('aria-selected="true" aria-controls="time-settings-panel" tabindex="0" data-section="day"')
    expect(html).toContain('type="time"')
    expect(html).toContain('value="08:30"')
    expect(html).toContain('value="17:00"')
    expect(html).toContain('value="7.5"')
    expect(html).toContain('step="0.5"')
    expect(html).toContain('Each person’s own hours, working days and break are set on Team &amp; skills.')
    expect(html).toContain('href="/time/team"')
    expect(html).not.toContain('Only a manager can change')
    expect(html).not.toContain('You have unsaved changes.') // nothing changed yet
    // The other sections stay mounted, hidden.
    expect(html.match(/<div hidden="">/g)?.length).toBe(6)
  })

  it('lists the task types with their looks and every way to change them', () => {
    const html = render('/time/settings?tab=types')
    expect(html).toContain('data-section="types"')
    expect(html).toContain('value="Housekeeping"')
    expect(html).toContain('value="Front Desk"')
    // Housekeeping has no look of its own: the full admin's built-in one (#10b981); Front Desk its own.
    expect(html).toContain('border-color:#10b981')
    expect(html).toContain('border-color:#3b82f6')
    expect(html).toContain('aria-label="Icon and colour: Housekeeping"')
    expect(html).toContain('aria-label="Move up: Front Desk"')
    expect(html).toContain('aria-label="Remove: Housekeeping"')
    expect(html).toContain('aria-label="A new type"')
    expect(html).toContain('Renaming or removing a type leaves the tasks that already have it as they are.')
  })

  it('lists the tasks with their keys and types, "Every type" for one with none', () => {
    const html = render('/time/settings?tab=tasks')
    expect(html).toContain('value="Room check"')
    expect(html).toContain('>room_check</span>')
    expect(html).toMatch(/aria-pressed="true"[^>]*>Housekeeping<\/button>/)
    expect(html).toContain('Every type')
    // A tag whose type is gone is still offered, struck through, so it can be taken off.
    expect(html).toMatch(/line-through[^>]*>Gone type<\/button>/)
  })

  it('lists the templates by category with what each makes, and the account\'s links', () => {
    const html = render('/time/settings?tab=templates')
    expect(html).toContain('Management')
    expect(html).toContain('General')
    expect(html.indexOf('>General<')).toBeLessThan(html.indexOf('>Management<'))
    expect(html).toContain('Front Desk · Call · 30 min · High')
    expect(html).toContain('Housekeeping · Room check · 45 min')
    expect(html).toContain('aria-label="Edit: Morning briefing"')
    expect(html).toContain('New template')
    expect(html).toContain('href="/planner"')
    expect(html).toContain('href="/settings?tab=team"')
  })

  it('offers the two ways of planning, the one in use marked, and saves only a manager\'s choice', () => {
    const html = render('/time/settings?tab=planning')
    expect(html).toContain('data-section="planning"')
    expect(html).toContain('Who plans whose day')
    expect(html).toContain('role="radiogroup"')
    // No choice made yet: the whole team plans together, as the planner always did.
    expect(html).toMatch(/role="radio" aria-checked="true"[^>]*>.*The whole team plans together/)
    expect(html).toMatch(/role="radio" aria-checked="false"[^>]*>.*Each person plans their own day/)
    expect(html).toContain('Managers still plan for anyone')
    expect(html).not.toMatch(/role="radio"[^>]*disabled=""/)

    const own = render('/time/settings?tab=planning', true, 'own')
    expect(own).toMatch(/role="radio" aria-checked="true"[^>]*>.*Each person plans their own day/)

    const staff = render('/time/settings?tab=planning', false, 'own')
    // The two ways of planning (recognition's choices, mounted beside them, carry `data-mode`).
    expect(staff.match(/role="radio" aria-checked="(true|false)" disabled=""(?! data-mode)/g)?.length).toBe(2)
  })

  it('offers who sees the ranking and the daily goal, the choice in use marked', () => {
    const html = render('/time/settings?tab=recognition')
    expect(html).toContain('aria-selected="true" aria-controls="time-settings-panel" tabindex="0" data-section="recognition"')
    expect(html).toContain('Who sees the week’s ranking')
    // No choice made yet: the top three and one's own place, and three finished tasks make the goal.
    expect([...html.matchAll(/role="radio" aria-checked="(true|false)" data-mode="(\w+)"/g)].map(m => `${m[2]}:${m[1]}`))
      .toEqual(['ranking:false', 'podium:true', 'own:false', 'off:false'])
    expect(html).toContain('Everyone sees the ranking')
    expect(html).toContain('The top three and one’s own place')
    expect(html).toContain('Only one’s own points')
    expect(html).toContain('Switched off')
    expect(html).toContain('A manager always sees the whole ranking.')
    expect(html).toMatch(/<output aria-live="polite"[^>]*>3<\/output>/)
    expect(html).toMatch(/<button type="button" class="[^"]*" aria-label="One task fewer">/)
    expect(html).toMatch(/<button type="button" class="[^"]*" aria-label="One task more">/)
    expect(html).toContain('href="/time/wins"')

    const own = render('/time/settings?tab=recognition', true, undefined, { recognition: 'own', daily_goal: 5 })
    expect([...own.matchAll(/role="radio" aria-checked="(true|false)" data-mode="(\w+)"/g)].map(m => `${m[2]}:${m[1]}`))
      .toEqual(['ranking:false', 'podium:false', 'own:true', 'off:false'])
    expect(own).toMatch(/<output aria-live="polite"[^>]*>5<\/output>/)
  })

  it('keeps the daily goal between 1 and 20, hides it when recognition is off, and shows staff the choice read-only', () => {
    expect(render('/time/settings?tab=recognition', true, undefined, { daily_goal: 1 })).toMatch(/<button type="button" class="[^"]*" disabled="" aria-label="One task fewer">/)
    expect(render('/time/settings?tab=recognition', true, undefined, { daily_goal: 20 })).toMatch(/<button type="button" class="[^"]*" disabled="" aria-label="One task more">/)

    const off = render('/time/settings?tab=recognition', true, undefined, { recognition: 'off' })
    expect(off).toMatch(/role="radio" aria-checked="true" data-mode="off"/)
    expect(off).not.toContain('The daily goal')
    expect(off).not.toContain('<output')

    const staff = render('/time/settings?tab=recognition', false, undefined, { recognition: 'podium' })
    expect(staff.match(/role="radio" aria-checked="(true|false)" disabled="" data-mode/g)?.length).toBe(4)
    expect(staff).toMatch(/role="radio" aria-checked="true" disabled="" data-mode="podium"/)
    expect(staff).toMatch(/disabled="" aria-label="One task fewer"/)
    expect(staff).toMatch(/disabled="" aria-label="One task more"/)
  })

  it('shows staff the settings read-only, with templates still theirs', () => {
    const html = render('/time/settings?tab=types', false)
    expect(html).toContain('Only a manager can change the working day, who plans, the types and the tasks; you can see them here.')
    expect(html).not.toContain('aria-label="A new type"')
    expect(html).not.toContain('aria-label="Remove: Housekeeping"')
    expect(html).toMatch(/<input disabled=""[^>]*value="Housekeeping"/)
    expect(html).toContain('aria-label="Edit: Morning briefing"')
  })
})
