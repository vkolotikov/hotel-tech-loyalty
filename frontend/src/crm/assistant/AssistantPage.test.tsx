import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CrmContext } from '../CrmProvider'
import type { Bootstrap, BotGap } from '../lib/types'
import { AssistantPage } from './AssistantPage'
import { GAPS_KEY, KNOWLEDGE_KEY, POPUPS_KEY } from './queries'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en' },
  }),
}))
vi.mock('../../lib/api', () => ({ api: {}, resolveImage: (url: string | null | undefined) => url ?? null }))

const boot: Bootstrap = {
  name: 'HexaTech CRM',
  organization: { id: 7, name: 'Hotel Riga', industry: 'hotel' },
  accent: null,
  venue: { timezone: 'Europe/Riga', today: '2026-11-07', currency: 'EUR' },
  features: { chatbot: true, engagement: true },
  ai: { status: 'under', percent: 10 },
  staff: { id: 1, name: 'Maria', role: 'manager', can: { manage_bot: true, manage_widget: true, manage_pipelines: true, manage_canned: true, manage_team: true, delete_records: true } },
  widget: { key: 'k', active: true },
  counts: { chats_waiting: 0, leads_new: 0, tasks_due: 0 },
  setup: { done: 2, total: 6, complete: false },
}

const gap: BotGap = { message_id: 9, conversation_id: 3, visitor: 'Ada', question: 'Do you take dogs?', answer: 'No.', comment: null, rated_by: 'Peter', rated_at: '2026-11-06T10:00:00+00:00', ratings: 2, teachable: true }

function render(at: string, data: Partial<Bootstrap> = {}, seed: (qc: QueryClient) => void = () => {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  seed(client)
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[at]}>
        <CrmContext.Provider value={{ data: { ...boot, ...data }, isLoading: false, isError: false, error: null, refetch: () => {} }}>
          <AssistantPage />
        </CrmContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('AssistantPage', () => {
  it('shows its sections as pills, with the answers to fix counted', () => {
    const html = render('/crm/assistant', {}, qc => qc.setQueryData(GAPS_KEY, [gap]))
    for (const label of ['Behaviour', 'Knowledge', 'Answers to fix', 'Try it', 'Pop-ups']) expect(html).toContain(label)
    expect(html).toMatch(/Answers to fix<span[^>]*>1<\/span>/)
  })

  it('opens the section ?tab= names: the knowledge, with its answers', () => {
    const html = render('/crm/assistant?tab=knowledge', {}, qc => {
      qc.setQueryData([...KNOWLEDGE_KEY, 'items'], [{ id: 1, question: 'Is there parking?', answer: 'Yes, 20 € a night.', category_id: null, keywords: ['car'], priority: 0, use_count: 3, is_active: true }])
      qc.setQueryData([...KNOWLEDGE_KEY, 'categories'], [])
      qc.setQueryData([...KNOWLEDGE_KEY, 'documents'], [])
    })
    expect(html).toContain('Is there parking?')
    expect(html).toContain('Used 3 times')
    expect(html).toContain('Draft from a text')
    expect(html).toContain('aria-pressed="true"')
  })

  it('lists an answer to fix with its question and lets a manager teach it', () => {
    const html = render('/crm/assistant?tab=teach', {}, qc => qc.setQueryData(GAPS_KEY, [gap]))
    expect(html).toContain('Do you take dogs?')
    expect(html).toContain('Rated wrong by 2 people')
    expect(html).toContain('href="/crm/inbox?c=3"')
    expect(html).toContain('Teach the assistant')
  })

  it('shows staff the answers to fix, read only', () => {
    const can = { ...boot.staff.can, manage_bot: false }
    const html = render('/crm/assistant?tab=teach', { staff: { ...boot.staff, role: 'staff', can } }, qc => qc.setQueryData(GAPS_KEY, [gap]))
    expect(html).toContain('Do you take dogs?')
    expect(html).toContain('Only an owner or a manager can change the assistant')
    expect(html).not.toContain('Teach the assistant')
  })

  it('lists pop-ups with what starts them', () => {
    const html = render('/crm/assistant?tab=popups', {}, qc => qc.setQueryData(POPUPS_KEY, [
      { id: 1, name: 'Prices page', is_active: true, trigger_type: 'time_delay', trigger_value: '20', url_match_type: 'contains', url_match_value: '/prices', visitor_type: 'all', language_targets: null, message: 'Questions?', quick_replies: [], priority: 0, impressions_count: 4, clicks_count: 1 },
    ]))
    expect(html).toContain('Prices page')
    expect(html).toContain('After 20 s')
    expect(html).toContain('role="switch"')
  })

  it('says the plan lacks the chatbot instead of showing the sections', () => {
    const html = render('/crm/assistant?tab=knowledge', { features: { chatbot: false, engagement: true } })
    expect(html).toContain('Your plan does not include this')
    expect(html).not.toContain('Answers to fix')
  })
})
