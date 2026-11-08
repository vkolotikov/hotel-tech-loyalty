import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CrmContext, type CrmContextValue } from './CrmProvider'
import { CrmShell } from './CrmShell'
import { areaOf, countOf } from './shell/nav'
import type { Bootstrap } from './lib/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))
vi.mock('../lib/logout', () => ({ logoutAndRedirect: vi.fn() }))
vi.mock('../i18n', () => ({ SUPPORTED_LANGUAGES: [{ code: 'en', label: 'English' }, { code: 'ru', label: 'Русский' }] }))
vi.mock('../lib/api', () => ({ api: {}, resolveImage: (url: string | null | undefined) => url ?? null }))

const boot: Bootstrap = {
  name: 'HexaTech CRM',
  organization: { id: 9, name: 'Harbour Clinic', industry: 'medical' },
  accent: '#0e7490',
  venue: { timezone: 'Europe/Riga', today: '2026-11-04', currency: 'EUR' },
  features: { chatbot: true, engagement: true, ai_capture: true },
  ai: { status: 'under', percent: 12 },
  staff: { id: 3, name: 'Maria Ozola', role: 'manager', can: { manage_bot: true, manage_widget: true, manage_pipelines: true, manage_canned: true, manage_team: true, delete_records: true } },
  widget: { key: 'wk-1', active: true },
  counts: { chats_waiting: 4, leads_new: 2, tasks_due: 0 },
  setup: { done: 3, total: 6, complete: false },
}

function render(value: Partial<CrmContextValue> = {}, data: Partial<Bootstrap> = {}, at = '/crm') {
  const full: CrmContextValue = { data: { ...boot, ...data }, isLoading: false, isError: false, error: null, refetch: () => {}, ...value }
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[at]}>
        <Routes>
          <Route path="/crm/*" element={<CrmContext.Provider value={full}><CrmShell><p>page body</p></CrmShell></CrmContext.Provider>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
const refused = (code: string) => ({ response: { status: 403, data: { error: code } } })

describe('CrmShell (2026-11-07)', () => {
  it('is its own token scope in the frame, names the product and the organisation, and draws the page', () => {
    const html = render()
    expect(html).toContain('data-workspace=""')
    expect(html).toContain('data-crm=""')
    expect(html).not.toContain('data-rail-variant="cards"')
    expect(html).toContain('HexaTech CRM')
    expect(html).toContain('Harbour Clinic')
    expect(html).toContain('page body')
  })

  it('lists every area, with what waits beside Inbox and Leads and nothing at zero', () => {
    const html = render()
    for (const area of ['Today', 'Inbox', 'Visitors', 'Leads', 'Deals', 'Contacts', 'Tasks', 'AI assistant', 'Chat widget', 'Insights', 'Settings']) expect(html).toContain(area)
    for (const group of ['Conversations', 'Sales', 'Reports', 'Set up']) expect(html).toContain(group)
    expect(html.match(/data-nav-section=""/g)?.length).toBe(4)
    expect(html).toMatch(/data-nav-count=""[^>]*>4<\/span>/)
    expect(html).toMatch(/data-nav-count=""[^>]*>2<\/span>/)
    expect(html.match(/data-nav-count=""/g)?.length).toBe(2)
  })

  it('says why it cannot open: switched off, the plan ended, not in the plan', () => {
    const off = render({ data: undefined, isError: true, error: refused('workspace_disabled') })
    expect(off).toContain('HexaTech CRM has been switched off for your organisation.')
    expect(off).not.toContain('page body')
    expect(render({ data: undefined, isError: true, error: refused('subscription_required') })).toContain('is not active')
    expect(render({ data: undefined, isError: true, error: refused('not_in_plan') })).toContain('HexaTech CRM is not part of your plan.')
  })

  it('warns from 80 % of the month\'s AI allowance and says what stops at 100 %', () => {
    expect(render({}, { ai: { status: 'warn', percent: 86 } })).toContain('86 % of this month')
    expect(render({}, { ai: { status: 'over', percent: 100 } })).toContain('hands every chat to your team')
    expect(render()).not.toContain('AI allowance')
  })
})

describe('the areas', () => {
  it('reads the area from the address', () => {
    expect(areaOf('/crm')).toBe('today')
    expect(areaOf('/crm/inbox')).toBe('inbox')
    expect(areaOf('/crm/leads/12')).toBe('leads')
    expect(areaOf('/crm/start')).toBe('today')
  })

  it('counts what waits only where it waits', () => {
    expect([countOf('inbox', boot), countOf('leads', boot), countOf('tasks', boot), countOf('today', boot)]).toEqual([4, 2, 0, undefined])
    expect(countOf('inbox', undefined)).toBeUndefined()
  })
})
