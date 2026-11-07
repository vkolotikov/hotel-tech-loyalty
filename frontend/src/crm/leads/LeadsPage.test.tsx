import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CrmContext } from '../CrmProvider'
import type { Bootstrap } from '../lib/types'
import { boardQuery } from './board'
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
  features: { chatbot: true, engagement: true, admin_ai: false },
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

function render(at: string, seed: (qc: QueryClient) => void, bootstrap: Bootstrap = boot) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  seed(qc)
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[at]}>
        <CrmContext.Provider value={{ data: bootstrap, isLoading: false, isError: false, error: null, refetch: () => {} }}>
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
    // Round 2: the next step and how late it is on the venue's day (5 Nov against 7 Nov).
    expect(html).toContain('Call back')
    expect(html).toContain('2 d late')
    expect(html).toContain('€1,250')
    for (const tool of ['Export CSV', 'Add a lead', 'Due now', 'Filters', 'Select this page', 'Views', 'Columns']) expect(html).toContain(tool)
    // The plan has no staff AI (the CRM's own packages do not): no "From a message", which would only be refused.
    expect(html).not.toContain('From a message')
  })

  it('offers a lead from a pasted message where the plan includes the staff AI', () => {
    const html = render('/crm/leads', qc => {
      qc.setQueryData(['crm', 'pipeline', 'pipelines'], pipelines)
      qc.setQueryData(['crm', 'leads', 'list', listQuery(readFilters(new URLSearchParams('')), 'Anna')], page([ada]))
    }, { ...boot, features: { ...boot.features, admin_ai: true } })
    expect(html).toContain('From a message')
    expect(html).toContain('crm-ai-soft')
  })

  it('shows the open pipeline\'s figures, a header row, the AI\'s chance and the row\'s menu (round 2)', () => {
    const html = render('/crm/leads', qc => {
      qc.setQueryData(['crm', 'pipeline', 'pipelines'], pipelines)
      qc.setQueryData(['crm', 'leads', 'kpis'], { total: 12, due_today: 2, overdue: 3, estimated_value: 9800, new_this_week: 4, new_delta_pct: 25 })
      qc.setQueryData(['crm', 'leads', 'list', listQuery(readFilters(new URLSearchParams('')), 'Anna')], page([{ ...ada, ai_win_probability: 72, ai_going_cold_risk: 'high', phone_calls_made: 2 }]))
    })
    for (const figure of ['Open leads', '€9,800', 'Follow-ups due', '3 overdue', 'New this week', '+25 % on the week before']) expect(html).toContain(figure)
    expect(html).toContain('<thead>')
    expect(html).toContain('AI signal')
    expect(html).toContain('72 %')
    expect(html).toContain('More for Ada Lovelace')
    expect(html).toContain('Change the stage of Ada Lovelace')
    expect(html).toContain('aria-pressed="true"') // the List view is the one chosen
    // The follow-up pills carry the server's counts.
    expect(html).toMatch(/Overdue<span[^>]*>3<\/span>/)
  })

  it('draws the board as round 1\'s Pipeline did, now under Leads → Board', () => {
    const html = render('/crm/leads?view=board', qc => {
      qc.setQueryData(['crm', 'pipeline', 'pipelines'], pipelines)
      qc.setQueryData(['crm', 'leads', 'board', boardQuery()], page([ada, { ...ada, id: 42, status: 'New', total_value: '100', guest: { id: 13, full_name: 'Grace Hopper' } }]))
    })
    expect(html).toContain('crm-board')
    expect(html).toContain('overflow-x-auto')
    expect(html).toContain('Ada Lovelace')
    expect(html).toContain('Grace Hopper')
    expect(html).toContain('2 open leads worth €1,350')
    expect(html).toContain('Move to')
    expect(html).toContain('Won leads become deals.')
    expect(html).toContain('href="/crm/deals"')
    expect(html).toContain('<option value="2">Proposal (1)</option>')
    expect(html).not.toContain('Select this page')
  })

  it('draws the team: nobody first, then each owner, with "Give to" on every card', () => {
    const html = render('/crm/leads?view=team', qc => {
      qc.setQueryData(['crm', 'pipeline', 'pipelines'], pipelines)
      qc.setQueryData(['crm', 'tasks', 'team'], [{ id: 3, name: 'Anna' }, { id: 4, name: 'Ben' }])
      qc.setQueryData(['crm', 'leads', 'board', boardQuery()], page([ada, { ...ada, id: 42, assigned_to: null, guest: { id: 13, full_name: 'Grace Hopper' } }]))
    })
    expect(html).toContain('Nobody yet')
    expect(html).toContain('Me (Anna)')
    expect(html).toContain('Ben')
    expect(html).toContain('Give to')
    expect(html.indexOf('Nobody yet')).toBeLessThan(html.indexOf('Me (Anna)'))
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
    expect(html).toMatch(/Overdue since Thu,? (5 Nov|Nov 5)/)
    expect(html).toContain('href="/crm/contacts/12"')
    expect(html).toContain('crm-ai-')
    expect(html).toContain('Ready to book a group.')
    expect(html).toContain('72 % likely to win')
    expect(html).toContain('2 calls · 1 emails')
    // Round 2: the overview's stage bar, the email template, the sections a phone jumps to, the voice note's box.
    expect(html).toContain('Proposal, where the lead is')
    expect(html).toContain('Move to New')
    expect(html).toContain('aria-current="step"')
    expect(html).toContain('Send an email')
    expect(html).toContain('On this page')
    expect(html).toContain('id="lead-timeline"')
    expect(html).toContain('Ctrl or ⌘ + Enter adds it')
    expect(html).toContain('More for this lead')
  })
})
