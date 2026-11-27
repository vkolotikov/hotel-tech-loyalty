import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CrmContext } from '../CrmProvider'
import type { Bootstrap } from '../lib/types'
import words from '../i18n/team.en.json'
import dayWords from '../i18n/dayplan.en.json'
import focusWords from '../i18n/focus.en.json'
import { TeamDashboardPage } from './TeamDashboardPage'
import { actionLink, advanceSlide, planPage, type DayPlan, boardView, teamOptions, type TeamAction, type TeamBoard } from './teamBoard'

vi.mock('react-i18next', () => ({ useTranslation: () => ({
  i18n: { language: 'en' },
  t: (key: string, vars: Record<string, unknown> = {}) => ((focusWords as Record<string, string>)[key.replace('crm.focus.', '')] ?? (dayWords as Record<string, string>)[key.replace('crm.dayplan.', '')] ?? (words as Record<string, string>)[key.replace('crm.team.', '')] ?? key)
    .replace(/\{\{(\w+)\}\}/g, (_, name) => String(vars[name])),
}) }))

const boot = { organization: { id: 8, name: 'Example studio' }, venue: { timezone: 'Europe/Riga' } } as Bootstrap
const mail: TeamAction = { key: '14-mail', lead_id: 14, kind: 'email', priority: 'urgent', ai_reason: 'purchase_decision',
  company: 'Independent studio', name: 'Sam', owner: 'Anna', amount: '3200.00', currency: 'EUR', signals: ['delivery_due'],
  deadline: '2026-11-28', quantity: null, at: 1780000000, source: 'mail', message_id: 'verified-message', subject: 'Artwork approval' }
const value = { currency: 'EUR', amount: '4500.00', rate_date: null, converted: false, groups: [], valued: 2, missing_currency: 0, missing_rate: 0 }
const countries = { total: 14, unknown: 2, rows: [{ code: 'GB', count: 12 }] }
const base: TeamBoard = { period: 'week', from: '2026-11-23', through: '2026-11-27', as_of: new Date().toISOString(), leads: 14, wins: 3,
  urgent: 2, portfolio: { total: 31, total_value: value, open: 10, open_value: value, due_today: 3, overdue: 1, countries },
  performance: { countries, won_value: value, lead_change: 2, win_change: 1, previous_from: '2026-11-16', previous_through: '2026-11-20' },
  undated_wins: 2, days: [{ date: '2026-11-23', leads: 2, wins: 1 }], emails: 7, period_emails: 4, actions_total: 10,
  matching: 10, reviewed: 2, page: 1, pages: 2, actions: [mail] }

const plan: DayPlan = { date: '2026-11-27', today: '2026-11-27', as_of: new Date().toISOString(), total: 1, done: 0, planner: true,
  people: ['Ruth','Jon','Lea','Ana','Mia'].map((name, i) => ({ key: 'u'+i, name, user_id: i, assignable: true, done: 0,
    tasks: i ? [] : [{ id: 1, source: 'planner', title: 'Prepare proof', status: 'in_progress', time: '10:30', priority: 0, editable: true }] })), top_tasks: [] }

function render(search = '', board = base) {
  const options = teamOptions(new URLSearchParams(search))
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } })
  qc.setQueryData(['crm', 'team-dashboard', 8, 'all', options.period, options.filter, options.page, options.tv], board)
  qc.setQueryData(['crm', 'team-customers', 8, 'all', new URLSearchParams(search).get('customers') === 'period' ? options.period : 'all'], {
    as_of: new Date().toISOString(), total: 2, rows: [
      { type: 'company', id: 22, name: 'Aster Group', company: '', wins: 4, amount: '8275.00', currency: 'EUR', valued: 3 },
      { type: 'contact', id: 7, name: 'Jean', company: 'Paper Studio', wins: 1, amount: null, currency: 'EUR', valued: 0 },
    ] })
  qc.setQueryData(['crm', 'team-day-plan', 8, 'all', ''], plan)
  return renderToStaticMarkup(<QueryClientProvider client={qc}><MemoryRouter initialEntries={['/crm/team?' + search]}>
    <CrmContext.Provider value={{ data: boot, isLoading: false, isError: false, error: null, refetch: () => {} }}><TeamDashboardPage /></CrmContext.Provider>
  </MemoryRouter></QueryClientProvider>)
}

describe('team dashboard', () => {
  it('renders scoped statistics and links the decision to the right correspondence', () => {
    const html = render('view=actions')
    for (const label of ['Leads received','Deals won','Unanswered email threads','Priority actions','Buying decision','Delivery Nov 28','AI has reviewed 2 of 10 actions','Artwork approval','Independent studio']) expect(html).toContain(label)
    expect(html).toContain('mail_message=verified-message')
    expect(actionLink({ ...mail, source: 'activity', message_id: '52' })).toBe('/crm/leads?lead=14&rtab=activity&activity=52')
    expect(actionLink({ ...mail, kind: 'delivery' })).toBe('/crm/leads?lead=14')
  })
  it('supports a bookmarked TV and month view, empty queues and rules-only ranking', () => {
    const html = render('period=month&display=tv&filter=email', { ...base, period: 'month', actions: [], reviewed: 0, matching: 0 })
    for (const label of ['<dialog','This month','Exit TV view','Ranked by current CRM signals','No actions waiting here','this month']) expect(html).toContain(label)
    expect(teamOptions(new URLSearchParams('period=unknown&filter=allx&page=-3'))).toEqual({ period: 'week', filter: 'all', page: 1, tv: false })
  })
  it('shows shared assignments and current sales signals, with planning controls only on the working view', () => {
    const board = { ...base, arrivals: { today: 6, yesterday: 3, week: 18, last_week: 19, day_change: 3, week_change: -1 }, top_leads: [mail] }
    const work = render('view=plan', board)
    for (const label of ['Leads today','Leads this week','+3','-1','Team plan','In progress','Ruth','Mia','Prepare proof','Nothing planned','Independent studio','Add a task','Open full planner']) expect(work).toContain(label)
    const tv = render('view=plan&display=tv&people=2&plan_date=2026-11-24', board)
    expect(tv).toContain('Mia')
    for (const hidden of ['Prepare proof','Open full planner','Add a task','type="date"']) expect(tv).not.toContain(hidden)
  })
  it('opens customer records and exact messages, shows partial values and distinguishes the two seven-day waits', () => {
    const sent: TeamAction = { ...mail, key: 'sent', lead_id: 62, kind: 'checkin', company: 'Oak Group', at: 1000, age_days: 12, source: 'activity', message_id: '99' }
    const attention = { needed: 9, waiting_week: 4, checkin: 3, top: [{ ...mail, age_days: 8 }], followups: [sent] }
    const html = render('display=tv', { ...base, attention })
    for (const label of ['Top customers','Aster Group','€8,275','3 of 4 valued','Waiting 7+ days for us','No customer reply for 7+ days','8 d','12 d','Oak Group','€3,200']) expect(html).toContain(label)
    for (const link of ['/crm/contacts?tab=companies&amp;company=22','/crm/contacts?contact=7','mail_message=verified-message','rtab=activity&amp;activity=99']) expect(html).toContain(link)
    const empty = render('view=customers&customers=period', { ...base, attention: { needed: 0, waiting_week: 0, checkin: 0, top: [], followups: [] } })
    expect(empty).toContain('No leads need action')
    expect(empty).toContain('No open leads are waiting')
    for (const filter of ['needed','waiting_week','checkin']) expect(teamOptions(new URLSearchParams({ filter })).filter).toBe(filter)
  })
  it('rotates across the whole roster and returns to overview with the selected period', () => {
    let search = new URLSearchParams('period=month&display=tv&view=overview&page=3')
    const screens = []
    for (let i = 0; i < 6; i++) {
      search = advanceSlide(search, 3)
      screens.push(boardView(search) + planPage(search, 3))
    }
    expect(screens).toEqual(['customers1','plan1','plan2','plan3','actions1','overview1'])
    expect(search.get('period')).toBe('month')
    expect(search.has('page')).toBe(false)
    expect(planPage(new URLSearchParams('people=-4'), 3)).toBe(1)
    expect(planPage(new URLSearchParams('people=8'), 3)).toBe(3)
  })
  it('opens on the performance overview and keeps earlier filtered links on the queue', () => {
    const html = render()
    for (const label of ['Total leads','Open pipeline value','Won deal value','Lead and deal activity','United Kingdom','Country unknown · 2','Overdue follow-ups','Urgent actions']) expect(html).toContain(label)
    expect(html).toContain('due=overdue')
    expect(html).toContain('€4,500')
    expect(boardView(new URLSearchParams('display=tv'))).toBe('customers')
    expect(boardView(new URLSearchParams('filter=email'))).toBe('actions')
    expect(boardView(new URLSearchParams('view=overview&filter=email'))).toBe('overview')
  })
})
