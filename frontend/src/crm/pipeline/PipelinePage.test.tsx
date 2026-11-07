import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CrmContext } from '../CrmProvider'
import type { Bootstrap } from '../lib/types'
import type { LeadRow, Pipeline } from '../leads/leadTypes'
import { boardQuery, dealsQuery } from './board'
import { PipelinePage } from './PipelinePage'

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

const boot: Bootstrap = {
  name: 'HexaTech CRM',
  organization: { id: 7, name: 'Villa Riga', industry: 'hotel' },
  accent: null,
  venue: { timezone: 'Europe/Riga', today: '2026-11-07', currency: 'EUR' },
  features: { chatbot: true, engagement: true },
  ai: { status: 'under', percent: 10 },
  staff: { id: 3, name: 'Anna', role: 'staff', can: { manage_bot: false, manage_widget: false, manage_pipelines: false, manage_canned: false, manage_team: false, delete_records: true } },
  widget: null,
  counts: { chats_waiting: 0, leads_new: 0, tasks_due: 0 },
  setup: { done: 6, total: 6, complete: true },
}
const pipelines: Pipeline[] = [{
  id: 1, name: 'Sales', is_default: true, sort_order: 0,
  stages: [
    { id: 1, name: 'New', kind: 'open', sort_order: 0, color: '#3b82f6' },
    { id: 2, name: 'Proposal', kind: 'open', sort_order: 1, color: null },
    { id: 8, name: 'Won', kind: 'won', sort_order: 8, color: null, inquiries_count: 5 },
    { id: 9, name: 'Lost', kind: 'lost', sort_order: 9, color: null, inquiries_count: 2 },
  ],
}]
const lead = (id: number, name: string, status: string, value: string | null): LeadRow => ({
  id, guest_id: id, pipeline_id: null, pipeline_stage_id: null, status, priority: null, source: null, total_value: value, assigned_to: 'Anna',
  next_task_type: null, next_task_due: null, next_task_notes: null, next_task_completed: false, created_at: null, guest: { id, full_name: name },
})

function render(at: string, seed: (qc: QueryClient) => void) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  seed(qc)
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[at]}>
        <CrmContext.Provider value={{ data: boot, isLoading: false, isError: false, error: null, refetch: () => {} }}>
          <Routes><Route path="/crm/pipeline" element={<PipelinePage />} /></Routes>
        </CrmContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Pipeline', () => {
  it('draws one column per stage with counts and values, in its own scrolling frame, and a stage picker for phones', () => {
    const html = render('/crm/pipeline', qc => {
      qc.setQueryData(['crm', 'pipeline', 'pipelines'], pipelines)
      qc.setQueryData(['crm', 'pipeline', 'board', boardQuery()], { data: [lead(1, 'Ada Lovelace', 'New', '100.00'), lead(2, 'Grace Hopper', 'Proposal', '400')], current_page: 1, last_page: 1, total: 2 })
      qc.setQueryData(['crm', 'pipeline', 'kpis'], { total: 2, due_today: 1, overdue: 1, estimated_value: 500, new_this_week: 2 })
    })
    expect(html).toContain('crm-board')
    expect(html).toContain('overflow-x-auto')
    expect(html).toContain('Ada Lovelace')
    expect(html).toContain('Grace Hopper')
    expect(html).toContain('2 open leads worth €500')
    expect(html).toContain('Move to')
    expect(html).toContain('Won leads become deals.')
    expect(html).toContain('>5</span>') // the won column's count from the server
    expect(html).toContain('<option value="2" selected="">Proposal (1)</option>'.replace(' selected=""', '')) // a phone's stage picker
    expect(html).toContain('Follow-ups due')
  })

  it('shows the won deals with their fulfilment step and payment', () => {
    const html = render('/crm/pipeline?tab=won', qc => {
      qc.setQueryData(['crm', 'pipeline', 'deals', dealsQuery('all', 1, 'due_date')], {
        data: [{ ...lead(5, 'Ada Lovelace', 'Confirmed', '900'), fulfillment_stage: 'in_production', payment_status: 'partial', paid_amount: '300' }],
        current_page: 1, last_page: 1, total: 1,
      })
    })
    expect(html).toContain('Ada Lovelace')
    expect(html).toContain('<option value="in_production" selected="">In progress</option>')
    expect(html).toContain('Partly paid')
    expect(html).toContain('€600 still to pay')
  })
})
