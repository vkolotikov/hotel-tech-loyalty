import { describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CrmContext } from '../CrmProvider'
import type { Bootstrap } from '../lib/types'
import { CHAT_FUNNEL, FUNNEL_STAGE_KEYS, INTENTS, windows } from './insightsMath'
import { InsightsPage } from './InsightsPage'
import type { ChatAnalytics, DealAnalytics, Pipeline } from './types'

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
  features: { chatbot: true, engagement: true, ai_capture: true },
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
  weekday_distribution: [1, 2, 3, 4, 5, 6, 0].map(dow => ({ dow, label: 'x', conversations: dow === 6 ? 9 : 2, visitors: 1, replies: 1 })),
  intent_breakdown: [{ intent: 'untagged', count: 20 }, { intent: 'booking_inquiry', count: 14 }, { intent: 'complaint', count: 2 }],
  length_distribution: [{ bucket: 'none', label: '0 msg', count: 3 }, { bucket: '3_5', label: '3–5', count: 30 }],
}
const deals: DealAnalytics = {
  period_days: 7,
  revenue_trend: Array.from({ length: 7 }, (_, i) => ({ date: `2026-11-0${i + 1}`, count: i === 2 ? 2 : 0, revenue: i === 2 ? 1500 : 0 })),
  new_deal_trend: Array.from({ length: 7 }, (_, i) => ({ date: `2026-11-0${i + 1}`, count: i % 2 })),
  stage_distribution: [{ stage: 'payment_pending', count: 2, revenue: 900 }, { stage: 'completed', count: 2, revenue: 1500 }],
  payment_distribution: [{ status: 'unset', count: 1 }, { status: 'paid', count: 3 }],
  cycle_time_days: 4.5,
  top_customers: [{ guest_id: 9, name: 'Bo Berg', company: 'Berg AB', deals: 2, revenue: 4200 }],
  stuck_deals: 1,
}
const pipeline: Pipeline = {
  id: 2, name: 'Sales', is_default: true, sort_order: 0, inquiries_count: 10,
  stages: [
    { id: 1, name: 'New', kind: 'open', sort_order: 0, inquiries_count: 6 },
    { id: 2, name: 'Won', kind: 'won', sort_order: 1, inquiries_count: 3 },
    { id: 3, name: 'Lost', kind: 'lost', sort_order: 2, inquiries_count: 1 },
  ],
}

function render(manager: boolean, tab: 'chat' | 'pipeline' | 'deals' | 'reports' = 'chat', seed?: (qc: QueryClient) => void) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  const span = windows(7, new Date(), 'Europe/Riga')
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
  qc.setQueryData(['crm', 'insights', 'deals', 7], deals)
  seed?.(qc)
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[tab === 'chat' ? '/crm/insights?days=7' : `/crm/insights?days=7&tab=${tab}`]}>
        <CrmContext.Provider value={{ data: boot(manager), isLoading: false, isError: false, error: null, refetch: () => {} }}>
          <Routes><Route path="/crm/insights" element={<InsightsPage />} /></Routes>
        </CrmContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Insights, rendered', () => {
  it('shows the four sections, the chat first, and the period in the header', () => {
    const html = render(false)
    for (const key of ['chat', 'pipeline', 'deals', 'reports']) expect(html).toContain(`id="crm-insights-section-${key}"`)
    expect(html).toMatch(/id="crm-insights-section-chat"[^>]*aria-selected="true"|aria-selected="true"[^>]*id="crm-insights-section-chat"/)
    expect(html).toContain('role="tabpanel"')
    expect(html).toMatch(/aria-pressed="true"[^>]*>7 d/)
  })

  it('shows the chat’s figures against the period before, short, the sentence as the tooltip', () => {
    const html = render(false)
    expect(html).toContain('title="25 % more than the 7 days before"')
    expect(html).toContain('5 pts')
    expect(html).toContain('Busiest: 4 Nov · 12')
    expect(html).toContain('<div class="sr-only"><table>')
    expect(html).toContain('/rooms?lang=de')
    expect(html).toContain('Latvia')
    expect(html).toContain('Busiest: 10:00')
    expect(html).not.toContain('Your pipeline</h2>')
  })

  it('shows the chat by intent (not yet sorted last), by weekday and by length', () => {
    const html = render(false)
    expect(html).toContain('What visitors want')
    expect(html.indexOf('Wants to book')).toBeLessThan(html.indexOf('Not sorted yet'))
    expect(html).toContain('Complaint')
    expect(html).toContain('By day of the week')
    expect(html).toContain('Busiest: Sat')
    expect(html).toContain('How long they talk')
    expect(html).toContain('No message')
    expect(html).toContain('3–5 messages')
    expect(html).toContain('5.4 per chat')
  })

  it('labels the hours in the venue’s zone, not UTC', () => {
    const html = render(false)
    expect(html).toContain('Europe/Riga')
    expect(html).toContain('by hour (Europe/Riga)')
    expect(html).not.toMatch(/UTC/)
  })

  it('shows the pipeline: new leads, stages, the win rate and what needs attention, each lead in its panel', () => {
    const html = render(false, 'pipeline')
    expect(html).toContain('title="50 % more than the 7 days before"')
    expect(html).toContain('75 %')
    expect(html).toContain('6 open · 3 won · 1 lost')
    expect(html).toContain('href="/crm/insights?days=7&amp;tab=pipeline&amp;lead=41"')
    expect(html).not.toContain('Why leads were lost')
    expect(html).not.toContain('Best customers')
  })

  it('shows managers why leads were lost', () => {
    expect(render(true, 'pipeline')).toContain('Why leads were lost')
  })

  it('shows the deals: revenue and new deals by day, steps, payments, the stuck ones and the best customers', () => {
    const html = render(false, 'deals')
    expect(html).toContain('Revenue completed')
    expect(html).toContain('€1,500')
    expect(html).toContain('2 done')
    expect(html).toContain('4.5 d')
    expect(html).toContain('href="/crm/deals?filter=overdue"')
    expect(html).toContain('Revenue by day')
    expect(html).toContain('Where the deals are')
    expect(html).toContain('Not set')
    expect(html).toContain('Best customers')
    expect(html).toContain('href="/crm/insights?days=7&amp;tab=deals&amp;contact=9"')
  })

  it('shows the sales reports over months, and says once when the person lacks the right', () => {
    const html = render(true, 'reports', qc => {
      qc.setQueryData(['crm', 'insights', 'reports', 'funnel', 6], {
        months: 6, won: 3, lost: 1, win_rate_pct: 75, avg_days_to_close: 5.7,
        stages: [{ stage: 'New', count: 6, value: 0, rate_from_prev: 100, rate_from_start: 100 }, { stage: 'Confirmed', count: 3, value: 660, rate_from_prev: 50, rate_from_start: 50 }],
      })
      qc.setQueryData(['crm', 'insights', 'reports', 'forecast', 6], { months: 6, total_gross: 1400, total_expected: 820, buckets: [{ month: 'Dec 2026', key: '2026-12', gross_value: 1400, expected_value: 820, deal_count: 2 }, { month: 'Later', key: 'beyond', gross_value: 0, expected_value: 0, deal_count: 0 }] })
      qc.setQueryData(['crm', 'insights', 'reports', 'lost', 6], { months: 6, total_count: 2, total_value: 200, reasons: [{ label: 'Price', count: 1, lost_value: 200 }, { label: 'Unspecified', count: 1, lost_value: 0 }] })
      qc.setQueryData(['crm', 'insights', 'reports', 'sources', 6], { months: 6, sources: [{ source: 'unknown', count: 2, won: 0, lost: 1, won_value: 0, win_rate_pct: 0 }] })
      qc.setQueryData(['crm', 'insights', 'reports', 'owners', 180], { days: 180, owners: [{ name: 'Laura Ozola', activities: 6, tasks_done: 1, inquiries: 7, open: 5, won: 1, lost: 1 }] })
      qc.setQueryData(['crm', 'insights', 'reports', 'companies'], { limit: 10, with_bookings: false, companies: [{ id: 5, company_name: 'Acme', industry: null, inquiries_count: 2, won_value: 500, open_pipeline_value: 1000 }] })
    })
    expect(html).toMatch(/aria-pressed="true"[^>]*>6 mo/)
    expect(html).toContain('Pipeline funnel')
    expect(html).toContain('Confirmed')
    expect(html).toContain('3 · 50 %')
    expect(html).toContain('Revenue forecast')
    expect(html).toContain('€820')
    expect(html).toContain('Later')
    expect(html).toContain('No reason given')
    expect(html).toContain('Not known')
    expect(html).toContain('Laura Ozola')
    expect(html).toContain('180 days')
    expect(html).toContain('href="/crm/insights?days=7&amp;tab=reports&amp;company=5"')
    expect(html).toContain('By the value of their won deals, then their open pipeline')
  })
})

describe('Insights’ words built at runtime are in all five languages', () => {
  const dir = path.resolve(__dirname, '../i18n')
  for (const lang of ['en', 'de', 'fr', 'es', 'ru']) {
    it(lang, () => {
      const words = JSON.parse(fs.readFileSync(path.join(dir, `insights.${lang}.json`), 'utf8'))
      expect(CHAT_FUNNEL.filter(stage => typeof words.funnel?.[stage] !== 'string')).toEqual([])
      expect(INTENTS.filter(intent => typeof words.intent?.[intent] !== 'string')).toEqual([])
      expect([...Object.values(FUNNEL_STAGE_KEYS), 'other'].filter(stage => typeof words.stage?.[stage] !== 'string')).toEqual([])
    })
  }
})
