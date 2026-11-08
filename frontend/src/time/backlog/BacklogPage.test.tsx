import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TimeContext } from '../TimeProvider'
import type { Bootstrap, Task } from '../lib/types'
import { BacklogPage } from './BacklogPage'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en' },
  }),
}))
vi.mock('../../lib/api', () => ({ api: {} }))

const TODAY = '2026-11-11'

function bootOf(manager: boolean): Bootstrap {
  return {
    name: 'HexaTech Time Planner',
    organization: { id: 7, name: 'Villa Riga', industry: 'hotel' },
    accent: null,
    venue: { timezone: 'Europe/Riga', today: TODAY },
    features: { time_management: true, voice: false },
    ai: { status: 'ok', percent: 10, ready: true, state: 'ready' },
    staff: {
      id: 3, key: 'u3', name: 'Anna Berzina', role: manager ? 'manager' : 'staff',
      can: { plan_team: manager, edit_people: manager, team_buckets: manager, manage_settings: manager, manage_templates: true },
    },
    settings: {
      window: { start: '09:00', end: '18:00' }, minutes_per_day: 480, days_per_week: 5,
      groups: [{ name: 'Housekeeping', icon: null, color: '#0ea5e9' }, { name: 'Garden', icon: null, color: '#16a34a' }],
      channels: [],
    },
    counts: { today_open: 0, overdue: 0, pool: 3 },
  }
}

function task(id: number, title: string, extra: Partial<Task> = {}): Task {
  return {
    id, title, description: null, task_date: null, start_time: null, end_time: null, duration_minutes: null, minutes: 30,
    status: 'todo', done: false, priority: 'Normal', priority_rank: 1, task_group: null, task_category: null,
    assigned_to_user_id: null, employee_name: null, owner: null, subtasks: [], subtasks_done: 0, subtasks_total: 0,
    running: false, started_at: null, actual_minutes: null, recurring: false, pool_horizon: null, pool_due_date: null,
    overdue: false, updated_at: '2026-11-10T09:00:00Z', ...extra,
  }
}

const MINE = [
  task(1, 'Order new towels', { assigned_to_user_id: 3, employee_name: 'Anna Berzina', owner: 'u3', task_group: 'Housekeeping' }),
  task(2, 'Write the rota', { assigned_to_user_id: 3, employee_name: 'Anna Berzina', owner: 'u3', pool_horizon: 'day', pool_due_date: '2026-11-10' }),
]
const POOL = [
  task(11, 'Mow the lawn', { task_group: 'Garden', pool_horizon: 'day', pool_due_date: '2026-11-09' }),
  task(12, 'Deep clean the sauna', { task_group: 'Housekeeping', pool_horizon: 'week', pool_due_date: '2026-11-15' }),
  task(13, 'Sort the lost property', { pool_horizon: 'general' }),
]

function render(at: string, { manager = false, mine = MINE, pool = POOL }: { manager?: boolean; mine?: Task[]; pool?: Task[] } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  qc.setQueryData(['time', 'backlog', 'mine'], { tasks: mine })
  qc.setQueryData(['time', 'backlog', 'pool'], { tasks: pool })
  qc.setQueryData(['time', 'backlog', 'team'], {
    pool,
    buckets: [
      { key: 'u3', user_id: 3, name: 'Anna Berzina', tasks: mine },
      { key: 'u9', user_id: 9, name: 'Boris Ozols', tasks: [] },
    ],
  })
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[at]}>
        <TimeContext.Provider value={{ data: bootOf(manager), isLoading: false, isError: false, error: null, refetch: () => {} }}>
          <Routes><Route path="/time/backlog" element={<BacklogPage />} /></Routes>
        </TimeContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Backlog & pool', () => {
  it('opens on my bucket with its figures, the due ones first, and no team section for staff', () => {
    const html = render('/time/backlog')
    expect(html).toContain('Backlog &amp; pool')
    expect(html).toContain('In my bucket')
    expect(html).toMatch(/aria-selected="true"[^>]*data-section="mine"/)
    expect(html.indexOf('Write the rota')).toBeLessThan(html.indexOf('Order new towels'))
    expect(html).toMatch(/Was due by Tue,? (10 Nov|Nov 10)/)
    expect(html).toContain('Plan “Write the rota” for today')
    expect(html).not.toContain('Mow the lawn')
    expect(html).not.toContain('data-section="team"')
    // Two "by a day" tasks are due by Sunday, both already late.
    expect(html).toContain('2 already late')
  })

  it('shows the pool in its horizons, the late day flagged, with Take on each', () => {
    const html = render('/time/backlog?tab=pool')
    expect(html).toContain('Due by a day')
    expect(html).toContain('This week')
    expect(html).toContain('Anytime')
    expect(html.indexOf('Mow the lawn')).toBeLessThan(html.indexOf('Deep clean the sauna'))
    expect(html.indexOf('Deep clean the sauna')).toBeLessThan(html.indexOf('Sort the lost property'))
    expect(html).toMatch(/Was due by Mon,? (9 Nov|Nov 9)/)
    expect(html).toContain('Take “Mow the lawn”')
    expect(html).toContain('1 task(s)')
    expect(html).not.toContain('Order new towels')
  })

  it('narrows the list to the type in the address', () => {
    const html = render('/time/backlog?tab=pool&type=Garden')
    expect(html).toContain('Mow the lawn')
    expect(html).not.toContain('Deep clean the sauna')
    expect(html).toContain('Type: Garden')
  })

  it('shows a manager the team’s buckets, each task with who has it', () => {
    const html = render('/time/backlog?tab=team', { manager: true })
    expect(html).toContain('data-section="team"')
    expect(html).toContain('Boris Ozols')
    expect(html).toContain('Nothing in their bucket.')
    expect(html).toContain('Who has “Mow the lawn”')
    expect(html).toContain('Who has “Order new towels”')
  })

  it('says so when my bucket is empty, with the one action that fills it', () => {
    const html = render('/time/backlog', { mine: [] })
    expect(html).toContain('Your bucket is empty')
    expect(html).toContain('New task')
  })
})
