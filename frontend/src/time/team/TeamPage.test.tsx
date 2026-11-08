import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TimeContext } from '../TimeProvider'
import type { Bootstrap, Person } from '../lib/types'
import { TeamPage } from './TeamPage'

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
    venue: { timezone: 'Europe/Riga', today: '2026-11-11' },
    features: { time_management: true, voice: false },
    ai: { status: 'ok', percent: 10, ready: true, state: 'ready' },
    staff: {
      id: 9, key: 'u9', name: 'Boris Ozols', role: manager ? 'manager' : 'staff',
      can: { plan_team: manager, edit_people: manager, team_buckets: manager, manage_settings: manager, manage_templates: true },
    },
    settings: {
      window: { start: '09:00', end: '18:00' }, minutes_per_day: 480, days_per_week: 5,
      groups: [{ name: 'Housekeeping', icon: null, color: '#0ea5e9' }, { name: 'Maintenance', icon: null, color: '#f97316' }],
      channels: [{ key: 'deep_clean', label: 'Deep clean', icon: 'sparkles', color: '#22c55e', groups: ['Housekeeping'] }],
    },
    counts: { today_open: 0, overdue: 0, pool: 0 },
  }
}

const PEOPLE: Person[] = [
  {
    key: 'u3', user_id: 3, staff_id: 103, name: 'Anna Berzina', role: 'staff', department: 'Rooms', manager: false, avatar_url: null, has_account: true,
    profile: { skills: ['Housekeeping'], knowledge: 'Speaks Latvian and German; first-aid certificate', work_start: '08:00', work_end: '16:00', work_days: [1, 2, 3, 4, 5], break_minutes: 30 },
    prefers: { groups: ['Housekeeping'], tasks: ['deep_clean'] },
    experience: { done: 14, on_time: 12, groups: { Housekeeping: { done: 10, on_time: 9, avg_minutes: 42 }, '—': { done: 4, on_time: 3, avg_minutes: 20 } } },
    today: { works: true, planned_minutes: 240, capacity_minutes: 450, load_pct: 53, window: { start: '08:00', end: '16:00' } },
  },
  {
    key: 'u9', user_id: 9, staff_id: 109, name: 'Boris Ozols', role: 'manager', department: null, manager: true, avatar_url: null, has_account: true,
    profile: { skills: null, knowledge: '', work_start: null, work_end: null, work_days: null, break_minutes: 0 },
    prefers: { groups: [], tasks: [] },
    experience: { done: 0, on_time: 0, groups: {} },
    today: { works: true, planned_minutes: 540, capacity_minutes: 540, load_pct: 100, window: { start: '09:00', end: '18:00' } },
  },
  {
    key: 'n:Outside Cleaner', user_id: null, staff_id: null, name: 'Outside Cleaner', role: null, department: null, manager: false, avatar_url: null, has_account: false,
    profile: { skills: null, knowledge: '', work_start: null, work_end: null, work_days: null, break_minutes: 0 },
    prefers: { groups: [], tasks: [] },
    experience: { done: 0, on_time: 0, groups: {} },
    today: null,
  },
]

function render(at: string, manager: boolean, people: Person[] = PEOPLE) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  qc.setQueryData(['time', 'people'], { people, knowledge_max: 1000 })
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[at]}>
        <TimeContext.Provider value={{ data: bootOf(manager), isLoading: false, isError: false, error: null, refetch: () => {} }}>
          <Routes><Route path="/time/team" element={<TeamPage />} /></Routes>
        </TimeContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Team & skills', () => {
  it('shows each person as the planner knows them, with the team’s figures', () => {
    const html = render('/time/team', true)
    expect(html).toContain('Team &amp; skills')
    // Figures: three people, two working today, (240 + 540) of (450 + 540) planned.
    expect(html).toContain('With an account: 2')
    expect(html).toContain('79 %')
    // Anna: her hours, days, break, the pool rule, what fits, what she knows, what she has shown.
    expect(html).toContain('08:00–16:00')
    expect(html).toContain('Their own hours')
    expect(html).toContain('Break 30 min')
    expect(html).toContain('Speaks Latvian and German')
    expect(html).toContain('Deep clean')
    expect(html).toContain('14 finished · 86 % on time')
    expect(html).toContain('10 done · 90 % on time · ~42 min')
    expect(html).toContain('No type')
    expect(html).toContain('Measured from the last 90 days of finished work')
    expect(html).toContain('4 h of 7 h 30 min · 53 %')
    // Boris: a manager takes any type, every day, the venue's hours.
    expect(html).toContain('Any type (a manager)')
    expect(html).toContain('Every day')
    expect(html).toContain('The venue’s hours')
    // The cleaner has no account.
    expect(html).toContain('Without an account the AI does not plan their day')
    expect(html).toContain('Not on today’s board.')
    // A manager edits and plans.
    expect(html).toContain('Edit Anna Berzina’s planner profile')
    expect(html).toContain('Plan the team’s day with AI')
    expect(html).not.toContain('A manager edits planner profiles.')
  })

  it('is read-only for staff, with a note that a manager edits profiles', () => {
    const html = render('/time/team', false)
    expect(html).toContain('A manager edits planner profiles.')
    expect(html).not.toContain('planner profile"')
    expect(html).not.toContain('Edit Anna Berzina')
    expect(html).toContain('Plan my day with AI')
  })

  it('shows each type of work: who may take it, who it fits and who has done most', () => {
    const html = render('/time/team?tab=types', true)
    expect(html).toMatch(/aria-selected="true"[^>]*data-section="types"/)
    expect(html).toContain('May take it: 3 · Prefer it: 1')
    expect(html).toContain('Everyone on the team')
    expect(html).toContain('May take it: 2 · Prefer it: 0')
    expect(html).toContain('10 done · 90 % on time')
  })

  it('says so when nobody is on the team yet', () => {
    const html = render('/time/team', true, [])
    expect(html).toContain('Nobody on the team yet')
    expect(html).toContain('href="/settings?tab=team"')
  })
})
