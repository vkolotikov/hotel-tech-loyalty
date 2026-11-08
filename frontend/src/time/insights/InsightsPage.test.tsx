import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TimeContext } from '../TimeProvider'
import type { Bootstrap, Insights, Person, Totals } from '../lib/types'
import { InsightsPage } from './InsightsPage'
import { insightsKey } from './insightsLogic'

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

const boot: Bootstrap = {
  name: 'HexaTech Time Planner',
  organization: { id: 7, name: 'Villa Riga', industry: 'hotel' },
  accent: null,
  venue: { timezone: 'Europe/Riga', today: '2026-11-11' },
  features: { time_management: true, voice: false },
  ai: { status: 'ok', percent: 10, ready: true, state: 'ready' },
  staff: { id: 3, key: 'u3', name: 'Anna Berzina', role: 'manager', can: { plan_team: true, edit_people: true, team_buckets: true, manage_settings: true, manage_templates: true } },
  settings: {
    window: { start: '09:00', end: '18:00' }, minutes_per_day: 480, days_per_week: 5,
    groups: [{ name: 'Housekeeping', icon: null, color: '#10b981' }, { name: 'Front Desk', icon: 'concierge-bell', color: '#3b82f6' }],
    channels: [],
  },
  counts: { today_open: 0, overdue: 0, pool: 0 },
}

const totals = (extra: Partial<Totals> = {}): Totals => ({
  tasks: 0, done: 0, on_time: 0, late: 0, overdue: 0, planned_minutes: 0, done_minutes: 0, tracked_minutes: 0, tracked_tasks: 0,
  completion_pct: null, on_time_pct: null, accuracy_pct: null, ...extra,
})

const insights = (from: string, to: string, days: number, extra: Partial<Insights> = {}): Insights => ({
  from, to, days, person: null,
  totals: totals({ tasks: 48, done: 40, on_time: 30, late: 6, overdue: 3, planned_minutes: 2400, done_minutes: 2000, tracked_minutes: 1500, tracked_tasks: 12,
    completion_pct: 83, on_time_pct: 83, accuracy_pct: 115, capacity_minutes: 4800, load_pct: 50 }),
  previous: totals({ tasks: 42, done: 30, on_time: 25, late: 5, overdue: 5, planned_minutes: 2100, completion_pct: 78, on_time_pct: 83 }),
  people: [
    { ...totals({ tasks: 20, done: 15, on_time: 10, late: 3, overdue: 2, planned_minutes: 1260, tracked_minutes: 900, completion_pct: 75, on_time_pct: 77 }),
      key: 'u1', name: 'Ada Lovelace', user_id: 1, capacity_minutes: 1200, load_pct: 105 },
    { ...totals({ tasks: 28, done: 25, planned_minutes: 1140, completion_pct: 89 }), key: 'n:Ben', name: 'Ben Outside', user_id: null, capacity_minutes: 2400, load_pct: 48 },
    { ...totals(), key: 'u9', name: 'Nobody Here', user_id: 9, capacity_minutes: 0, load_pct: null },
  ],
  groups: [
    { ...totals({ tasks: 30, done: 26, planned_minutes: 1800, tracked_minutes: 1400, tracked_tasks: 9, accuracy_pct: 140 }), task_group: 'Housekeeping' },
    { ...totals({ tasks: 18, done: 14, planned_minutes: 600, tracked_minutes: 100, tracked_tasks: 3, accuracy_pct: 60 }), task_group: null },
  ],
  weekdays: [1, 2, 3, 4, 5, 6, 7].map(weekday => ({ weekday, tasks: weekday === 3 ? 12 : 4, done: 3, minutes: weekday === 3 ? 600 : 240 })),
  hours: [{ hour: 8, tasks: 3 }, { hour: 10, tasks: 7 }],
  by_day: [
    { date: '2026-11-09', tasks: 10, done: 8, planned_minutes: 600, done_minutes: 480 },
    { date: '2026-11-10', tasks: 6, done: 3, planned_minutes: 300, done_minutes: 150 },
    { date: '2026-11-11', tasks: 4, done: 0, planned_minutes: 240, done_minutes: 0 },
  ],
  pool: { open: 5, d0: 1, d1: 1, d3: 1, d7: 2, oldest: '2026-10-20T21:30:00Z' },
  signals: [{ code: 'takes_longer', group: 'Housekeeping', value: 140 }, { code: 'overloaded', person: 'u1', value: 105 }],
  ...extra,
})

const people = [{ key: 'u1', name: 'Ada Lovelace' }, { key: 'n:Ben', name: 'Ben Outside' }] as unknown as Person[]

function render(path: string, seed: (qc: QueryClient) => void) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  qc.setQueryData(['time', 'people'], { people, knowledge_max: 5 })
  seed(qc)
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <TimeContext.Provider value={{ data: boot, isLoading: false, isError: false, error: null, refetch: () => {} }}>
          <Routes><Route path="/time/insights" element={<InsightsPage />} /></Routes>
        </TimeContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Insights', () => {
  it('opens on the last 7 days with the server\'s figures, each against the period before, and the people', () => {
    const html = render('/time/insights', qc => qc.setQueryData(insightsKey('2026-11-05', '2026-11-11', null), insights('2026-11-05', '2026-11-11', 7)))
    // The period by the venue's today, the default preset pressed.
    expect(html).toMatch(/Last 7 days/)
    expect(html).toMatch(/aria-pressed="true"[^>]*>Last 7 days/)
    expect(html).toMatch(/Thursday,? 5 November/)
    // Figures: tasks with their change, the server's percentages, hours, load and the pool.
    expect(html).toContain('40 done')
    expect(html).toContain('+6')
    expect(html).toContain('83 %')
    expect(html).toContain('+5 pts')
    expect(html).toContain('−2') // overdue went down: good news
    expect(html).toContain('Tasks took 115 % of their planned time')
    expect(html).toContain('40 h of 80 h the team could work')
    expect(html).toContain('2 waiting over a week')
    expect(html).toMatch(/Arrows compare with Thu,? 29 Oct/)
    // Signals in our words, with the person's name; the AI review of the period.
    expect(html).toContain('Ada Lovelace was planned for 105 % of their time.')
    expect(html).toContain('“Housekeeping” work takes 140 % of its planned time.')
    expect(html).toContain('AI review of the period')
    // People: the most planned first, each opening their plan, the load bar named; nobody without work or hours.
    expect(html).toContain('aria-selected="true" aria-controls="time-insights-panel" tabindex="0" data-section="people"')
    expect(html).toContain('href="/time/plan?person=u1"')
    expect(html).toContain('href="/time/plan?person=n%3ABen"')
    expect(html.indexOf('Ada Lovelace</span>')).toBeLessThan(html.indexOf('Ben Outside</span>'))
    expect(html).toContain('Load 105 %: 21 h planned of 20 h')
    expect(html).toContain('time-load-over')
    expect(html).not.toContain('Nobody Here')
  })

  it('shows the work by type with the accuracy\'s meaning, and when work happens', () => {
    const html = render('/time/insights?tab=work', qc => qc.setQueryData(insightsKey('2026-11-05', '2026-11-11', null), insights('2026-11-05', '2026-11-11', 7)))
    expect(html).toContain('Housekeeping')
    expect(html).toContain('Takes longer than planned')
    expect(html).toContain('No type')
    expect(html).toContain('Takes less than planned')
    expect(html).toContain('30 h planned')
    expect(html).toMatch(/aria-label="Wednesday: 10 h planned, 3 of 12 tasks done"/)
    // Start hours from the earliest to the end of the working window.
    expect(html).toContain('aria-label="From 08:00: 3 task(s)"')
    expect(html).toContain('aria-label="From 17:00: 0 task(s)"')
    expect(html).not.toContain('From 18:00')
  })

  it('shows a chosen period day by day, and the pool by age', () => {
    const path = '/time/insights?tab=days&range=custom&from=2026-11-09&to=2026-11-11'
    const html = render(path, qc => qc.setQueryData(insightsKey('2026-11-09', '2026-11-11', null), insights('2026-11-09', '2026-11-11', 3)))
    expect(html).toMatch(/aria-pressed="true"[^>]*>Choose days/)
    expect(html).toContain('type="date"')
    expect(html).toContain('value="2026-11-09"')
    expect(html).toMatch(/aria-label="Monday,? 9 November: 10 h planned, 8 of 10 tasks done"/)
    expect(html).toContain('Over a week')
    expect(html).toMatch(/The oldest has waited since Wednesday,? 21 October\./) // 23:30 in Riga
    expect(html).toContain('href="/time/backlog"')
  })

  it('narrows to one person and says so when the period has no work', () => {
    const empty = insights('2026-11-05', '2026-11-11', 7, { totals: totals(), people: [], groups: [], signals: [] })
    const html = render('/time/insights?person=u1', qc => qc.setQueryData(insightsKey('2026-11-05', '2026-11-11', 'u1'), empty))
    expect(html).toContain('Person: Ada Lovelace')
    expect(html).toContain('Nothing was planned in this period')
    expect(html).toContain('Pick another period, or look at the whole team.')
    expect(html).not.toContain('AI review of the period')
  })
})
