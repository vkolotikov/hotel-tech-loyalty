import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TimeContext } from '../TimeProvider'
import type { Bootstrap, Lane, Task, Today } from '../lib/types'
import { PlanPage } from '../plan/PlanPage'
import { TodayPage } from './TodayPage'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en-GB' },
  }),
}))
vi.mock('../../lib/api', () => ({ api: {} }))

const boot: Bootstrap = {
  name: 'HexaTech Time Planner',
  organization: { id: 7, name: 'Villa Riga', industry: 'hotel' },
  accent: null,
  venue: { timezone: 'Europe/Riga', today: '2026-11-04' },
  features: { time_management: true, voice: true },
  ai: { status: 'ok', percent: 10, ready: true, state: 'ready' },
  staff: { id: 3, key: 'u3', name: 'Anna Berzina', role: 'staff', can: { plan_team: false, edit_people: false, team_buckets: false, manage_settings: false, manage_templates: true } },
  settings: { window: { start: '09:00', end: '18:00' }, minutes_per_day: 480, days_per_week: 5, groups: [{ name: 'Housekeeping', icon: null, color: '#10b981' }], channels: [] },
  counts: { today_open: 2, overdue: 1, pool: 3 },
}

const task = (id: number, title: string, start: string | null, extra: Partial<Task> = {}): Task => ({
  id, title, description: null, task_date: '2026-11-04', start_time: start, end_time: start ? '10:00' : null, duration_minutes: 60, minutes: 60,
  status: 'todo', done: false, priority: 'Normal', priority_rank: 1, task_group: 'Housekeeping', task_category: null, assigned_to_user_id: 3,
  employee_name: 'Anna Berzina', owner: 'u3', subtasks: [], subtasks_done: 0, subtasks_total: 0, running: false, started_at: null,
  actual_minutes: null, recurring: false, pool_horizon: null, pool_due_date: null, overdue: false, updated_at: null, ...extra,
})

const me: Lane = {
  key: 'u3', user_id: 3, name: 'Anna Berzina', role: 'staff', manager: false, listed: true, has_account: true, skills: null, knowledge: '',
  prefers: { groups: [], tasks: [] }, works: true, window: { start: '09:00', end: '18:00' }, break_minutes: 30, capacity_minutes: 480,
  planned_minutes: 120, done_minutes: 0, tracked_minutes: 0, load_pct: 25, open_count: 2, done_count: 0, unscheduled: 1,
  tasks: [task(1, 'Rooms 101–105', '09:00', { running: true, status: 'in_progress' }), task(2, 'Linen order', null, { priority: 'High', priority_rank: 0 })],
  overdue: [task(5, 'Monday report', null, { task_date: '2026-11-02', overdue: true })],
}

const today: Today = {
  date: '2026-11-04', now: '12:00', window: { start: '09:00', end: '18:00' }, me, next: me.tasks[0],
  signals: [{ code: 'unscheduled_high', task: 2, person: 'u3' }],
  backlog: { mine: 1, pool: 3, pool_for_today: 1 }, pool_top: [task(9, 'Fix the gate', null, { task_date: null, owner: null })],
  week: ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'].map((date, i) => ({ date, tasks: i, done: 0, minutes: i * 30 })),
  note: 'Inspection at 15:00',
}

function render(path: string, element: React.ReactElement, seed: (qc: QueryClient) => void) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  seed(qc)
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <TimeContext.Provider value={{ data: boot, isLoading: false, isError: false, error: null, refetch: () => {} }}>
          <Routes><Route path={path.split('?')[0]} element={element} /></Routes>
        </TimeContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('My day', () => {
  const html = render('/time', <TodayPage />, qc => {
    qc.setQueryData(['time', 'today'], today)
    qc.setQueryData(['time', 'people'], { people: [], knowledge_max: 1000 })
  })

  it('greets by the venue’s clock and offers the AI plan', () => {
    expect(html).toContain('Good afternoon, Anna')
    expect(html).toContain('Plan my day with AI')
  })

  it('shows what is on now, the day on the clock, the untimed work and the overdue', () => {
    expect(html).toContain('On it now')
    expect(html).toContain('Rooms 101–105')
    expect(html).toContain('Without a time')
    expect(html).toContain('Linen order')
    expect(html).toContain('Monday report')
  })

  it('names the server’s signal and offers the pool, the week and the note', () => {
    expect(html).toContain('“Linen order” is high priority and has no time yet.')
    expect(html).toContain('Fix the gate')
    expect(html).toContain('Inspection at 15:00')
    expect(html).toContain('Say what needs doing')
  })
})

describe('the Planner', () => {
  const board = {
    date: '2026-11-04', weekday: 3, today: '2026-11-04', is_today: true, now: '12:00', window: { start: '09:00', end: '18:00' },
    people: [me, { ...me, key: 'u4', user_id: 4, name: 'Boris Ozols', tasks: [task(3, 'Boiler check', '13:00', { owner: 'u4' })], overdue: [] }],
    unassigned: [task(4, 'Lobby flowers', null, { owner: null })],
    pool: { open: 2, for_day: 1 },
    totals: { tasks: 4, done: 0, planned_minutes: 240, capacity_minutes: 960, load_pct: 25, unassigned: 1, overdue: 1 },
    signals: [{ code: 'unassigned', value: 1 }], note: null,
  }
  const html = render('/time/plan', <PlanPage />, qc => {
    qc.setQueryData(['time', 'day', '2026-11-04', null], board)
    qc.setQueryData(['time', 'people'], { people: [], knowledge_max: 1000 })
  })

  it('draws a lane per person with their timed work and lists what has no time', () => {
    expect(html).toContain('Anna Berzina')
    expect(html).toContain('Boris Ozols')
    expect(html).toContain('Boiler check')
    expect(html).toContain('Lobby flowers')
    expect(html).toContain('1 task(s) today have nobody yet.')
  })

  it('offers a staff member the AI plan of their own day, not the team’s', () => {
    expect(html).toContain('Plan my day with AI')
    expect(html).not.toContain('Plan the team with AI')
  })
})
