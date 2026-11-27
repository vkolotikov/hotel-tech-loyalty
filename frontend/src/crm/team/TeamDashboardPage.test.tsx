import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CrmContext } from '../CrmProvider'
import type { Bootstrap } from '../lib/types'
import words from '../i18n/team.en.json'
import { TeamDashboardPage } from './TeamDashboardPage'
import { actionLink, teamOptions, type TeamAction, type TeamBoard } from './teamBoard'

vi.mock('react-i18next', () => ({ useTranslation: () => ({
  i18n: { language: 'en' },
  t: (key: string, vars: Record<string, unknown> = {}) => ((words as Record<string, string>)[key.replace('crm.team.', '')] ?? key)
    .replace(/\{\{(\w+)\}\}/g, (_, name) => String(vars[name])),
}) }))

const boot = { organization: { id: 8, name: 'Example studio' }, venue: { timezone: 'Europe/Riga' } } as Bootstrap
const mail: TeamAction = { key: '14-mail', lead_id: 14, kind: 'email', priority: 'urgent', ai_reason: 'purchase_decision',
  company: 'Independent studio', name: 'Sam', owner: 'Anna', amount: '3200.00', currency: 'EUR', signals: ['delivery_due'],
  deadline: '2026-11-28', quantity: null, at: 1780000000, source: 'mail', message_id: 'verified-message', subject: 'Artwork approval' }
const base: TeamBoard = { period: 'week', from: '2026-11-23', through: '2026-11-27', as_of: new Date().toISOString(), leads: 14, wins: 3,
  undated_wins: 2, days: [{ date: '2026-11-23', leads: 2, wins: 1 }], emails: 7, period_emails: 4, actions_total: 10,
  matching: 10, reviewed: 2, page: 1, pages: 2, actions: [mail] }

function render(search = '', board = base) {
  const options = teamOptions(new URLSearchParams(search))
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } })
  qc.setQueryData(['crm', 'team-dashboard', 8, 'all', options.period, options.filter, options.page, options.tv], board)
  return renderToStaticMarkup(<QueryClientProvider client={qc}><MemoryRouter initialEntries={['/crm/team?' + search]}>
    <CrmContext.Provider value={{ data: boot, isLoading: false, isError: false, error: null, refetch: () => {} }}><TeamDashboardPage /></CrmContext.Provider>
  </MemoryRouter></QueryClientProvider>)
}

describe('team dashboard', () => {
  it('renders scoped statistics and links the decision to the right correspondence', () => {
    const html = render()
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
})
