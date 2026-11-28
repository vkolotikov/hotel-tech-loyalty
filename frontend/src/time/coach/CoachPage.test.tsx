import { describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TimeContext } from '../TimeProvider'
import { AssistantPage } from '../assistant/AssistantPage'
import type { Bootstrap, CoachOverview } from '../lib/types'
import { CoachPage } from './CoachPage'

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

function bootOf(manager: boolean): Bootstrap {
  return {
    name: 'HexaTech Time Planner',
    organization: { id: 7, name: 'Villa Riga', industry: 'hotel' },
    accent: null,
    venue: { timezone: 'Europe/Riga', today: '2026-11-14' },
    features: { time_management: true, voice: false },
    ai: { status: 'ok', percent: 10, ready: true, state: 'ready' },
    staff: {
      id: 9, key: 'u9', name: 'Boris Ozols', role: manager ? 'manager' : 'staff',
      can: { plan_team: manager, edit_people: manager, team_buckets: manager, manage_settings: manager, manage_templates: true },
    },
    settings: {
      window: { start: '09:00', end: '18:00' }, minutes_per_day: 480, days_per_week: 5,
      groups: [{ name: 'Housekeeping', icon: null, color: '#0ea5e9' }],
      channels: [{ key: 'deep_clean', label: 'Deep clean', icon: 'sparkles', color: '#22c55e', groups: ['Housekeeping'] }],
    },
    counts: { today_open: 0, overdue: 0, pool: 0 },
  }
}

const OVERVIEW: CoachOverview = {
  readiness: {
    score: 45,
    items: [
      { code: 'about', pct: 100, count: null, total: null },
      { code: 'rules', pct: 0, count: null, total: null },
      { code: 'skills', pct: 50, count: 1, total: 2 },
      { code: 'clocked', pct: 67, count: 20, total: 100 },
    ],
  },
  learning: {
    from: '2026-09-19', to: '2026-11-14', weeks: 8,
    totals: { tasks: 40, done: 32, on_time_pct: 81, late_open: 2, clocked: 6, clocked_pct: 19, accuracy_pct: 118 },
    types: [{ key: 'Housekeeping', name: 'Housekeeping', samples: 12, clocked: 5, planned_median: 30, real_median: 40, suggested: 40, drift_pct: 133, typical: null, advice: 'longer' }],
    tasks: [],
    people: [{
      person: 'u3', name: 'Anna Berzina', has_account: true, tasks: 20, done: 18, on_time_pct: 90, completion_pct: 90, late_open: 0, clocked: 4, accuracy_pct: 105,
      types: [{ type: 'Housekeeping', done: 10, on_time_pct: 100, team_on_time_pct: 80, median_minutes: 30, team_median_minutes: 40, speed: 1.33 }],
      strengths: ['Housekeeping'], support: [],
    }],
    leaders: [{
      type: 'Housekeeping', people: 2,
      best: { person: 'u3', name: 'Anna Berzina', done: 10, on_time_pct: 100, speed: 1.33 },
      least: { person: 'u4', name: 'Juris Kalns', done: 3, on_time_pct: 33, speed: 0.7 },
    }],
  },
  knowledge: { context: { about: 'A 40-room hotel by the sea', rules: '', goals: '' }, types: { Housekeeping: { notes: 'Rooms first', typical_minutes: 35, best_time: 'morning' } }, tasks: {} },
  manager: true,
  levels: ['trainee', 'junior', 'experienced', 'senior', 'lead'],
  best_times: ['morning', 'midday', 'afternoon', 'evening', 'any'],
}

function render(path: string, at: string, page: ReactElement, manager: boolean) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  qc.setQueryData(['time', 'coach', 8], { ...OVERVIEW, manager })
  qc.setQueryData(['time', 'coach', 'readiness'], OVERVIEW)
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[at]}>
        <TimeContext.Provider value={{ data: bootOf(manager), isLoading: false, isError: false, error: null, refetch: () => {} }}>
          <Routes><Route path={path} element={page} /></Routes>
        </TimeContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('the AI coach', () => {
  it('shows a manager how ready the AI is, the figures and the way to a strategy', () => {
    const html = render('/time/coach', '/time/coach', <CoachPage />, true)
    expect(html).toContain('AI coach')
    expect(html).toContain('45%')
    expect(html).toContain('House rules')
    expect(html).toContain('1 of 2')
    expect(html).toContain('20 % clocked')
    expect(html).toContain('Make a strategy')
    expect(html).toContain('Teach the AI')
  })

  it('shows the lengths planned against real, with the suggestion to write down', () => {
    const html = render('/time/coach', '/time/coach?tab=durations', <CoachPage />, true)
    expect(html).toContain('Plan it longer')
    expect(html).toContain('133 %')
    expect(html).toContain('Use 40 min')
    // Planned against real as two bars: 30 planned is three quarters of the 40 it really took.
    expect(html).toContain('width:75%')
    expect(html).toContain('width:100%')
  })

  it('names who does each type best and who could use support', () => {
    const html = render('/time/coach', '/time/coach?tab=people', <CoachPage />, true)
    expect(html).toContain('At each type')
    expect(html).toContain('Juris Kalns')
    expect(html).toContain('+33 %')
  })

  it('lets a manager teach the AI, filled from what is written down', () => {
    const html = render('/time/coach', '/time/coach?tab=knowledge', <CoachPage />, true)
    expect(html).toContain('A 40-room hotel by the sea')
    expect(html).toContain('Rooms first')
    expect(html).toContain('Draft with AI')
    expect(html).toContain('Deep clean')
  })

  it('keeps a staff member to their own work, without the knowledge editor', () => {
    const html = render('/time/coach', '/time/coach?tab=knowledge', <CoachPage />, false)
    expect(html).not.toContain('Draft with AI')
    expect(html).toContain('Your assistant')
    expect(html).toContain('My work')
  })
})

describe('the AI assistant', () => {
  it('opens on questions to start with and what the AI knows', () => {
    const html = render('/time/assistant', '/time/assistant', <AssistantPage />, true)
    expect(html).toContain('What shall we plan, Boris?')
    expect(html).toContain('Who does Housekeeping best, and who could use support?')
    expect(html).toContain('45%')
    expect(html).toContain('Teach it in the AI coach')
    // Beside the conversation: every other AI tool, and the readiness as a gauge.
    expect(html).toContain('AI tools')
    expect(html).toContain('Plan the team’s week')
    expect(html).toContain('href="/time/plan?view=week&amp;ai=week"')
    expect(html).toContain('aria-label="45 % ready"')
  })

  it('offers a staff member their own day', () => {
    const html = render('/time/assistant', '/time/assistant', <AssistantPage />, false)
    expect(html).toContain('Plan my day.')
    expect(html).not.toContain('Fill next week from the pool')
  })
})
