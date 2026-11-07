import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CrmContext } from '../CrmProvider'
import type { Bootstrap } from '../lib/types'
import { dueSections, listQuery, readFilters } from './leadLogic'
import { LeadPage } from './LeadPage'
import { LeadsPage } from './LeadsPage'
import type { LeadDetail, LeadRow, Paginated, Pipeline } from './leadTypes'

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
  organization: { id: 7, name: 'Studio Lumen', industry: 'beauty' },
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
    { id: 2, name: 'Proposal', kind: 'open', sort_order: 1, color: '#f59e0b' },
    { id: 8, name: 'Won', kind: 'won', sort_order: 8, color: '#10b981' },
    { id: 9, name: 'Lost', kind: 'lost', sort_order: 9, color: '#ef4444' },
  ],
}]

const ada: LeadRow = {
  id: 41, guest_id: 12, pipeline_id: null, pipeline_stage_id: null, status: 'Proposal', priority: 'High', source: 'chatbot',
  total_value: '1250.00', assigned_to: 'Anna', next_task_type: 'Call back', next_task_due: '2026-11-05T00:00:00.000000Z', next_task_notes: null,
  next_task_completed: false, created_at: '2026-11-01T09:00:00Z', guest: { id: 12, full_name: 'Ada Lovelace', company: 'Analytical Engines', email: 'ada@example.org' },
}
const page = (rows: LeadRow[]): Paginated<LeadRow> => ({ data: rows, current_page: 1, last_page: 1, total: rows.length })

function render(at: string, seed: (qc: QueryClient) => void) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  seed(qc)
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[at]}>
        <CrmContext.Provider value={{ data: boot, isLoading: false, isError: false, error: null, refetch: () => {} }}>
          <Routes>
            <Route path="/crm/leads" element={<LeadsPage />} />
            <Route path="/crm/leads/:id" element={<LeadPage />} />
          </Routes>
        </CrmContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Leads', () => {
  it('lists the open leads with their stage, follow-up, value and owner, and the list\'s tools', () => {
    const html = render('/crm/leads', qc => {
      qc.setQueryData(['crm', 'pipeline', 'pipelines'], pipelines)
      qc.setQueryData(['crm', 'leads', 'list', listQuery(readFilters(new URLSearchParams('')), 'Anna')], page([ada]))
    })
    expect(html).toContain('Leads')
    expect(html).toContain('Ada Lovelace')
    expect(html).toContain('Analytical Engines')
    expect(html).toContain('Proposal')
    expect(html).toContain('href="/crm/leads/41"')
    expect(html).toMatch(/Follow up Thu,? 5 Nov/)
    expect(html).toContain('€1,250')
    for (const tool of ['Export CSV', 'Add a lead', 'Due now', 'Filters', 'Select this page']) expect(html).toContain(tool)
  })

  it('shows "due now" (Today\'s link) as overdue and today, and opens the form on ?new=1', () => {
    const filters = readFilters(new URLSearchParams('due=1'))
    const html = render('/crm/leads?due=1&new=1', qc => {
      qc.setQueryData(['crm', 'pipeline', 'pipelines'], pipelines)
      for (const section of dueSections(filters, 'Anna')) {
        qc.setQueryData(['crm', 'leads', 'due', section.key, section.query], page(section.key === 'overdue' ? [ada] : []))
      }
    })
    expect(html).toContain('Overdue')
    expect(html).toContain('Nothing due today.')
    expect(html).toContain('Ada Lovelace')
    expect(html).toContain('Add the lead')
    expect(html).toContain('New contact')
    expect(html).not.toContain('Arrival') // no stay fields outside a hotel
  })

  it('draws a lead\'s page: the stage picker, won and lost, the next step, the contact and the AI in violet', () => {
    const detail: LeadDetail = { ...ada, notes: 'Wants a quote for May.', phone_calls_made: 2, emails_sent: 1, ai_brief: 'Ready to book a group.', ai_win_probability: 72 }
    const html = render('/crm/leads/41', qc => {
      qc.setQueryData(['crm', 'pipeline', 'pipelines'], pipelines)
      qc.setQueryData(['crm', 'leads', 'detail', 41], detail)
    })
    expect(html).toContain('Ada Lovelace')
    expect(html).toContain('<option value="2" selected="">Proposal</option>')
    expect(html).toContain('Won')
    expect(html).toContain('Lost')
    expect(html).toContain('Call back')
    expect(html).toMatch(/Overdue since Thu,? 5 Nov/)
    expect(html).toContain('href="/crm/contacts/12"')
    expect(html).toContain('crm-ai-')
    expect(html).toContain('Ready to book a group.')
    expect(html).toContain('72 % likely to win')
    expect(html).toContain('2 calls · 1 emails')
  })
})
