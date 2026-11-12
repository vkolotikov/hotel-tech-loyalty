import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CrmContext } from '../CrmProvider'
import type { Bootstrap } from '../lib/types'
import type { LeadRow } from '../leads/leadTypes'
import { dealsQuery } from './dealLogic'
import { DealsPage } from './DealsPage'

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
  features: { chatbot: true, engagement: true, ai_capture: true },
  ai: { status: 'under', percent: 10 },
  staff: { id: 3, name: 'Anna', role: 'staff', can: { manage_bot: false, manage_widget: false, manage_pipelines: false, manage_canned: false, manage_team: false, delete_records: true } },
  widget: null,
  counts: { chats_waiting: 0, leads_new: 0, tasks_due: 0 },
  setup: { done: 6, total: 6, complete: true },
}
const lead = (id: number, name: string, value: string | null, extra: Partial<LeadRow> = {}): LeadRow => ({
  id, guest_id: id, pipeline_id: null, pipeline_stage_id: null, status: 'Confirmed', priority: null, source: null, total_value: value, assigned_to: 'Anna',
  next_task_type: null, next_task_due: null, next_task_notes: null, next_task_completed: false, created_at: null, guest: { id, full_name: name }, ...extra,
})
const fig = (count: number, value: number) => ({ count, value })

function render(at: string, seed: (qc: QueryClient) => void) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  seed(qc)
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[at]}>
        <CrmContext.Provider value={{ data: boot, isLoading: false, isError: false, error: null, refetch: () => {} }}>
          <Routes><Route path="/crm/deals" element={<DealsPage />} /></Routes>
        </CrmContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Deals', () => {
  it('shows the won deals with their step in one compact control and their payment; a deal opens on its Deal tab', () => {
    const html = render('/crm/deals', qc => {
      qc.setQueryData(['crm', 'deals', 'list', dealsQuery('all', 1, 'due_date', { q: '', payment: '', owner: '' })], {
        data: [{ ...lead(5, 'Ada Lovelace', '900'), fulfillment_stage: 'in_production', payment_status: 'partial', paid_amount: '300' }],
        current_page: 1, last_page: 1, total: 1,
      })
    })
    expect(html).toContain('Ada Lovelace')
    expect(html).toContain('The step of Ada Lovelace: In progress')
    expect(html).toContain('3 of 5 steps done')
    expect(html).toContain('Partly paid')
    expect(html).toContain('€600 still to pay')
    // Round 5: the deal opens in its lead's panel on the Deal tab, over the list; the row's "Show more" is gone.
    expect(html).toContain('href="/crm/deals?lead=5&amp;rtab=deal"')
    expect(html).not.toContain('Show more about')
    expect(html).not.toContain('<select')
  })

  it('shows at most four figures that hold something, the step pills with exact counts and the toolbar\'s tools', () => {
    const html = render('/crm/deals?filter=design_needed', qc => {
      qc.setQueryData(['crm', 'deals', 'kpis'], { total: 9, awaiting_payment: fig(4, 3200), design_needed: fig(2, 800), in_production: fig(3, 1500), ready_to_ship: fig(1, 300), completed_month: fig(5, 4100) })
      qc.setQueryData(['crm', 'deals', 'list', dealsQuery('design_needed', 1, 'due_date', { q: '', payment: '', owner: '' })], { data: [], current_page: 1, last_page: 1, total: 0 })
    })
    for (const text of ['Deals in progress', 'Not paid in full', '€3,200', 'Completed this month', 'href="/crm/deals?filter=ready_to_ship"']) expect(html).toContain(text)
    expect(html).toMatch(/Preparation<span[^>]*>2<\/span>/)
    for (const tool of ['aria-label="Filters"', 'aria-label="Export"', 'aria-label="Columns"', 'Sort: Next step soonest']) expect(html).toContain(tool)
    expect(html).toContain('No deal here')
    expect(html).toContain('Show every deal')
  })

  it('shows no row of zeros first', () => {
    const html = render('/crm/deals', qc => {
      qc.setQueryData(['crm', 'deals', 'kpis'], { total: 0, awaiting_payment: fig(0, 0), design_needed: fig(0, 0), in_production: fig(0, 0), ready_to_ship: fig(0, 0), completed_month: fig(0, 0) })
      qc.setQueryData(['crm', 'deals', 'list', dealsQuery('all', 1, 'due_date', { q: '', payment: '', owner: '' })], { data: [], current_page: 1, last_page: 1, total: 0 })
    })
    expect(html).not.toContain('Deals in progress')
    expect(html).toContain('No won deals yet')
  })

  it('adds a deal by hand or from a pasted message, for every staff member (owner 2026-11-08)', () => {
    const html = render('/crm/deals', qc => {
      qc.setQueryData(['crm', 'deals', 'list', dealsQuery('all', 1, 'due_date', { q: '', payment: '', owner: '' })], { data: [], current_page: 1, last_page: 1, total: 0 })
    })
    expect(html).toContain('>Add<')
    expect(html).toContain('From a message')
    expect(html).toContain('crm-ai-soft')
  })
})
