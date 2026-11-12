import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CrmContext } from '../CrmProvider'
import type { Bootstrap } from '../lib/types'
import { boardQuery } from './board'
import { dueSections, listQuery, readFilters } from './leadLogic'
import { LeadPage } from './LeadPage'
import { LeadRecordPanel } from './LeadRecord'
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
  features: { chatbot: true, engagement: true, ai_capture: true },
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
  it('lists the open leads with their stage, follow-up, value and owner, and the list\'s tools; a row opens its panel', () => {
    const html = render('/crm/leads', qc => {
      qc.setQueryData(['crm', 'pipeline', 'pipelines'], pipelines)
      qc.setQueryData(['crm', 'leads', 'list', listQuery(readFilters(new URLSearchParams('')), 'Anna')], page([ada]))
    })
    expect(html).toContain('Leads')
    expect(html).toContain('Ada Lovelace')
    expect(html).toContain('Analytical Engines')
    expect(html).toContain('Proposal')
    // Round 5: the lead opens in its panel over the list (the address keeps the list's own keys), not on a page of its own.
    expect(html).toContain('href="/crm/leads?lead=41"')
    expect(html).not.toContain('href="/crm/leads/41"')
    expect(html).not.toContain('Show more about')
    // Round 2: the next step and how late it is on the venue's day (5 Nov against 7 Nov).
    expect(html).toContain('Call back')
    expect(html).toContain('2 d late')
    expect(html).toContain('€1,250')
    // Round 5: the tools are icons named for a screen reader and a tooltip; the export is Excel or CSV.
    for (const tool of ['aria-label="Export"', '>Add<', 'Due now', 'aria-label="Filters"', 'aria-label="Select this page"', 'aria-label="Saved views"', 'aria-label="Columns"', 'Sort: Newest first']) expect(html).toContain(tool)
    expect(html).not.toContain('Export CSV')
    // The AI capture is every staff member's, without the staff AI (owner 2026-11-08).
    expect(html).toContain('From a message')
    expect(html).toContain('crm-ai-soft')
    expect(html).toContain('1 in all')
  })

  it('offers no lead from a pasted message where the server says the capture would be refused', () => {
    const html = render('/crm/leads', qc => {
      qc.setQueryData(['crm', 'pipeline', 'pipelines'], pipelines)
      qc.setQueryData(['crm', 'leads', 'list', listQuery(readFilters(new URLSearchParams('')), 'Anna')], page([ada]))
    }, { ...boot, features: { ...boot.features, ai_capture: false } })
    expect(html).not.toContain('From a message')
  })

  it('shows the open pipeline\'s figures, a header row, the AI\'s chance and the row\'s menu', () => {
    const html = render('/crm/leads', qc => {
      qc.setQueryData(['crm', 'pipeline', 'pipelines'], pipelines)
      qc.setQueryData(['crm', 'leads', 'kpis'], { total: 12, due_today: 2, overdue: 3, estimated_value: 9800, new_this_week: 4, new_delta_pct: 25 })
      qc.setQueryData(['crm', 'leads', 'list', listQuery(readFilters(new URLSearchParams('')), 'Anna')], page([{ ...ada, ai_win_probability: 72, ai_going_cold_risk: 'high', phone_calls_made: 2 }]))
    })
    for (const figure of ['Open leads', '€9,800', 'Follow-ups due', '3 overdue', 'New this week', '+25 %']) expect(html).toContain(figure)
    expect(html).toContain('<thead>')
    expect(html).toMatch(/>AI<\/th>/)
    expect(html).toContain('72 %')
    expect(html).toContain('More for Ada Lovelace')
    expect(html).toContain('Change the stage of Ada Lovelace')
    expect(html).toContain('aria-pressed="true"') // the List view is the one chosen
    // The follow-up pills carry the server's counts.
    expect(html).toMatch(/Overdue<span[^>]*>3<\/span>/)
  })

  it('shows no row of zeros first: no figures while there is no open lead, none that hold nothing', () => {
    const empty = render('/crm/leads', qc => {
      qc.setQueryData(['crm', 'pipeline', 'pipelines'], pipelines)
      qc.setQueryData(['crm', 'leads', 'kpis'], { total: 0, due_today: 0, overdue: 0, estimated_value: 0, new_this_week: 0 })
      qc.setQueryData(['crm', 'leads', 'list', listQuery(readFilters(new URLSearchParams('')), 'Anna')], page([]))
    })
    expect(empty).not.toContain('Open leads')
    expect(empty).toContain('No open leads yet')
    const some = render('/crm/leads', qc => {
      qc.setQueryData(['crm', 'pipeline', 'pipelines'], pipelines)
      qc.setQueryData(['crm', 'leads', 'kpis'], { total: 4, due_today: 0, overdue: 0, estimated_value: 500, new_this_week: 0 })
      qc.setQueryData(['crm', 'leads', 'list', listQuery(readFilters(new URLSearchParams('')), 'Anna')], page([ada]))
    })
    expect(some).toContain('Open leads')
    expect(some).not.toContain('Follow-ups due')
    expect(some).not.toContain('New this week')
  })

  it('draws the board as round 1\'s Pipeline did, now under Leads → Board, with compact cards that open their panel', () => {
    const html = render('/crm/leads?view=board', qc => {
      qc.setQueryData(['crm', 'pipeline', 'pipelines'], pipelines)
      qc.setQueryData(['crm', 'leads', 'board', boardQuery()], page([ada, { ...ada, id: 42, status: 'New', total_value: '100', guest: { id: 13, full_name: 'Grace Hopper' } }]))
    })
    expect(html).toContain('crm-board')
    expect(html).toContain('overflow-x-auto')
    expect(html).toContain('Ada Lovelace')
    expect(html).toContain('Grace Hopper')
    expect(html).toContain('2 open leads worth €1,350')
    expect(html).toContain('Move Ada Lovelace to')
    expect(html).toContain('Won leads become deals.')
    expect(html).toContain('href="/crm/deals"')
    expect(html).toContain('href="/crm/leads?view=board&amp;lead=41"')
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
    expect(html).toContain('Give Ada Lovelace to')
    expect(html).toContain('href="/crm/leads?view=team&amp;lead=41"')
    expect(html.indexOf('Nobody yet')).toBeLessThan(html.indexOf('Me (Anna)'))
  })

  it('shows "due now" (Today\'s link) as overdue and today, and still opens the form on a contact\'s ?new=1', () => {
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

  const detail: LeadDetail = { ...ada, notes: 'Wants a quote for May.', phone_calls_made: 2, emails_sent: 1, ai_brief: 'Ready to book a group.', ai_win_probability: 72, open_tasks: [{ id: 1 }, { id: 2 }] }

  it('draws a lead\'s own page as its record, full width: the header, its actions and the tabs (round 5)', () => {
    const html = render('/crm/leads/41', qc => {
      qc.setQueryData(['crm', 'pipeline', 'pipelines'], pipelines)
      qc.setQueryData(['crm', 'leads', 'detail', 41], detail)
    })
    expect(html).toContain('Ada Lovelace')
    expect(html).toContain('href="/crm/leads"') // All leads
    // The header: the badges, the subtitle, the actions.
    expect(html).toContain('Analytical Engines · Website chat · came in')
    expect(html).toContain('Change the stage')
    expect(html).toContain('Won')
    expect(html).toContain('Lost')
    expect(html).toContain('Send email')
    expect(html).toContain('href="mailto:ada@example.org"')
    expect(html).toContain('AI brief')
    expect(html).toContain('Proposal')
    expect(html).toContain('More for this lead')
    // The tabs, with what they hold; no Deal (not won) and no Chat (no chat known).
    expect(html).toContain('role="tablist"')
    for (const tab of ['Overview', 'Activity', 'Tasks', 'Emails', 'Files']) expect(html).toContain(`>${tab}</span>`)
    expect(html).not.toContain('lead-record-tab-deal')
    expect(html).not.toContain('lead-record-tab-chat')
    expect(html).toMatch(/Tasks<\/span><span[^>]*>2<\/span>/)
    // The Overview: the stage bar, the facts changed in place, the AI in violet, the contact, the details.
    expect(html).toContain('Proposal, where the lead is')
    expect(html).toContain('Move to New')
    expect(html).toContain('aria-current="step"')
    expect(html).toContain('Change: Value')
    expect(html).toContain('Call back')
    expect(html).toContain('2 d late')
    expect(html).toContain('crm-ai-')
    expect(html).toContain('Ready to book a group.')
    expect(html).toContain('72 % likely to win')
    expect(html).toContain('href="/crm/leads/41?contact=12"')
    expect(html).toContain('2 calls · 1 emails')
    expect(html).toContain('Wants a quote for May.')
    expect(html).not.toContain('On this page')
  })

  it('opens a tab from the page\'s address (?rtab=) as the panel does', () => {
    const html = render('/crm/leads/41?rtab=activity', qc => {
      qc.setQueryData(['crm', 'pipeline', 'pipelines'], pipelines)
      qc.setQueryData(['crm', 'leads', 'detail', 41], detail)
    })
    expect(html).toMatch(/id="lead-record-tab-activity" aria-selected="true"/)
    expect(html).toContain('title="Ctrl or ⌘ + Enter adds it"')
    expect(html).toContain('Log a touch')
    expect(html).not.toContain('Proposal, where the lead is')
  })

  it('draws the same record in its panel: previous, next, the full page on the same tab, close', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
    qc.setQueryData(['crm', 'pipeline', 'pipelines'], pipelines)
    qc.setQueryData(['crm', 'leads', 'detail', 41], detail)
    const html = renderToStaticMarkup(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/crm/leads?lead=41&rtab=tasks']}>
          <CrmContext.Provider value={{ data: boot, isLoading: false, isError: false, error: null, refetch: () => {} }}>
            <LeadRecordPanel id={41} tab="tasks" onTab={() => {}} onClose={() => {}} onPrev={null} onNext={() => {}} />
          </CrmContext.Provider>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-label="Ada Lovelace"')
    expect(html).toContain('href="/crm/leads/41?rtab=tasks"')
    expect(html).toMatch(/id="lead-record-tab-tasks" aria-selected="true"/)
    expect(html).toContain('Add a task')
    expect(html).toContain('Change the stage')
  })

  it('gives a won lead its Deal tab: the steps and the payment', () => {
    const won: LeadDetail = { ...detail, status: 'Confirmed', pipeline_stage_id: 8, fulfillment_stage: 'design_needed', payment_status: 'partial', paid_amount: '250' }
    const html = render('/crm/leads/41?rtab=deal', qc => {
      qc.setQueryData(['crm', 'pipeline', 'pipelines'], pipelines)
      qc.setQueryData(['crm', 'leads', 'detail', 41], won)
    })
    expect(html).toMatch(/id="lead-record-tab-deal" aria-selected="true"/)
    expect(html).toContain('Preparation, where the deal is')
    expect(html).toContain('Move Ada Lovelace on to Review')
    expect(html).toContain('Partly paid')
    expect(html).toContain('€1,000') // still to pay
    expect(html).toContain('Paid in full')
    expect(html).not.toMatch(/>Won<\/button>/)
  })
})
