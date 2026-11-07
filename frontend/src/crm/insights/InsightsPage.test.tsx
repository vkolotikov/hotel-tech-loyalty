import { describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CrmContext } from '../CrmProvider'
import type { Bootstrap } from '../lib/types'
import { CHAT_FUNNEL, windows } from './insightsMath'
import { InsightsPage } from './InsightsPage'
import type { ChatAnalytics, Pipeline } from './types'

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

const boot = (manager: boolean): Bootstrap => ({
  name: 'HexaTech CRM',
  organization: { id: 7, name: 'Villa Riga', industry: 'hotel' },
  accent: null,
  venue: { timezone: 'Europe/Riga', today: '2026-11-07', currency: 'EUR' },
  features: { chatbot: true, engagement: true, admin_ai: false },
  ai: { status: 'under', percent: 10 },
  staff: { id: 3, name: 'Anna', role: manager ? 'manager' : 'staff', can: { manage_bot: manager, manage_widget: manager, manage_pipelines: manager, manage_canned: manager, manage_team: manager, delete_records: true } },
  widget: null,
  counts: { chats_waiting: 0, leads_new: 0, tasks_due: 0 },
  setup: { done: 6, total: 6, complete: true },
})

const overview = { total_conversations: 40, leads_captured: 6, ai_resolved: 18, human_escalated: 9, avg_messages: 5.4, ai_resolution_rate: 45, lead_conversion_rate: 15, human_escalation_rate: 22.5 }
const chat: ChatAnalytics = {
  overview,
  previous_overview: { ...overview, total_conversations: 32, leads_captured: 6, ai_resolution_rate: 40 },
  period_days: 7,
  trend: Array.from({ length: 7 }, (_, i) => ({ date: `2026-11-0${i + 1}`, count: i === 3 ? 12 : 4, engagedCount: 3, aiResolved: 2, aiResolutionRate: 50, prevCount: 3 })),
  status_breakdown: { resolved: 20, active: 12, waiting: 8 },
  top_pages: [{ page_url: 'https://villa.lv/rooms?lang=de', count: 9 }],
  top_countries: [{ country: 'LV', count: 22 }],
  hourly_distribution: [{ hour: 10, label: '10:00', conversations: 7, visitors: 6, replies: 12 }],
  funnel: [{ stage: 'conversations', count: 40 }, { stage: 'engaged', count: 30 }, { stage: 'with_contact', count: 10 }, { stage: 'lead_captured', count: 6 }],
}
const pipeline: Pipeline = {
  id: 2, name: 'Sales', is_default: true, sort_order: 0, inquiries_count: 10,
  stages: [
    { id: 1, name: 'New', kind: 'open', sort_order: 0, inquiries_count: 6 },
    { id: 2, name: 'Won', kind: 'won', sort_order: 1, inquiries_count: 3 },
    { id: 3, name: 'Lost', kind: 'lost', sort_order: 2, inquiries_count: 1 },
  ],
}

function render(manager: boolean, tab: 'chat' | 'pipeline' = 'chat') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  const span = windows(7, new Date())
  qc.setQueryData(['crm', 'insights', 'chat', 7], chat)
  qc.setQueryData(['crm', 'insights', 'new-leads', span.from], { total: 12 })
  qc.setQueryData(['crm', 'insights', 'new-leads-before', span.prevFrom, span.prevTo], { total: 8 })
  qc.setQueryData(['crm', 'insights', 'kpis'], { total: 14, due_today: 2, overdue: 1, estimated_value: 25000, new_this_week: 5, new_delta_pct: 25 })
  qc.setQueryData(['crm', 'insights', 'pipelines'], [pipeline])
  qc.setQueryData(['crm', 'insights', 'signals'], {
    cold: { count: 2, sample: [{ id: 41, total_value: null, guest: { id: 9, full_name: 'Bo Berg', company: null } }] },
    high_value: { total: 18000, sample: [] }, unassigned: { count: 0, sample: [] }, stuck: { count: 1, sample: [] },
  })
  qc.setQueryData(['crm', 'insights', 'lost-reasons'], [{ id: 1, label: 'Price', is_active: true, inquiries_count: 1 }])
  qc.setQueryData(['crm', 'insights', 'deals'], { top_customers: [{ guest_id: 9, name: 'Bo Berg', company: 'Berg AB', deals: 2, revenue: 4200 }] })
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[tab === 'chat' ? '/crm/insights?days=7' : '/crm/insights?days=7&tab=pipeline']}>
        <CrmContext.Provider value={{ data: boot(manager), isLoading: false, isError: false, error: null, refetch: () => {} }}>
          <Routes><Route path="/crm/insights" element={<InsightsPage />} /></Routes>
        </CrmContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Insights, rendered', () => {
  it('shows the two sections, the chat first, and the period in the toolbar', () => {
    const html = render(false)
    expect(html).toContain('id="crm-insights-section-chat"')
    expect(html).toContain('id="crm-insights-section-pipeline"')
    expect(html).toMatch(/id="crm-insights-section-chat"[^>]*aria-selected="true"|aria-selected="true"[^>]*id="crm-insights-section-chat"/)
    expect(html).toContain('role="tabpanel"')
    expect(html).toMatch(/aria-pressed="true"[^>]*>7 days/)
    expect(html).toContain('Each figure against the 7 days before')
  })

  it('shows the chat’s figures against the period before, with the chart as a table for screen readers', () => {
    const html = render(false)
    expect(html).toContain('25 % more than the 7 days before')
    expect(html).toContain('5 points more than the 7 days before')
    expect(html).toContain('The busiest was 4 Nov, with 12.')
    expect(html).toContain('<table class="sr-only">')
    expect(html).toContain('/rooms?lang=de')
    expect(html).toContain('Latvia')
    expect(html).toContain('Busiest around 10:00')
    expect(html).not.toContain('Your pipeline</h2>')
  })

  it('labels the hours in the venue’s zone, not UTC', () => {
    const html = render(false)
    expect(html).toContain('Europe/Riga')
    expect(html).toContain('by hour (Europe/Riga)')
    expect(html).not.toMatch(/UTC/)
  })

  it('shows the pipeline: new leads, stages, the win rate, what needs attention and the best customers', () => {
    const html = render(false, 'pipeline')
    expect(html).toContain('50 % more than the 7 days before')
    expect(html).toContain('75 %')
    expect(html).toContain('10 leads in Sales: 6 open, 3 won, 1 lost.')
    expect(html).toContain('href="/crm/leads/41"')
    expect(html).toContain('href="/crm/contacts/9"')
    expect(html).not.toContain('Why leads were lost')
    expect(html).not.toContain('Busiest around')
  })

  it('shows managers why leads were lost', () => {
    expect(render(true, 'pipeline')).toContain('Why leads were lost')
  })
})

describe('Insights’ words built at runtime are in all five languages', () => {
  const dir = path.resolve(__dirname, '../i18n')
  for (const lang of ['en', 'de', 'fr', 'es', 'ru']) {
    it(lang, () => {
      const words = JSON.parse(fs.readFileSync(path.join(dir, `insights.${lang}.json`), 'utf8'))
      expect(CHAT_FUNNEL.filter(stage => typeof words.funnel?.[stage] !== 'string')).toEqual([])
    })
  }
})
