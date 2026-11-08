import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CrmContext } from '../CrmProvider'
import type { Bootstrap, BotGap } from '../lib/types'
import { AssistantPage } from './AssistantPage'
import { BEHAVIOUR_KEY, GAPS_KEY, KNOWLEDGE_KEY, POPUPS_KEY } from './queries'

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
  features: { chatbot: true, engagement: true, ai_capture: true },
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

const behaviour = { id: 1, assistant_name: 'Ava', identity: null, goal: null, sales_style: 'consultative', tone: 'friendly', reply_length: 'moderate', language: 'en', core_rules: ['Never promise a price'], escalation_policy: null, fallback_message: null, custom_instructions: null, is_active: true }

describe('AssistantPage', () => {
  it('shows its five sections as cards with a caption each, the answers to fix counted', () => {
    const html = render('/crm/assistant', {}, qc => qc.setQueryData(GAPS_KEY, [gap]))
    for (const label of ['Behaviour', 'Knowledge', 'Answers to fix', 'Try it', 'Pop-ups']) expect(html).toContain(label)
    expect(html.match(/role="tab"/g)).toHaveLength(5)
    expect(html).toMatch(/Answers to fix<\/span><span[^>]*>1<\/span>/)
    expect(html).toContain('Answers your team rated wrong in the inbox.')
    expect(html).toContain('id="assistant-section-behaviour"')
    expect(html).toContain('role="tabpanel"')
    expect(html).toContain('aria-labelledby="assistant-section-behaviour"')
  })

  it('groups the behaviour in titled cards, says whether it answers, and shows no save bar before a change', () => {
    const html = render('/crm/assistant', {}, qc => qc.setQueryData(BEHAVIOUR_KEY, behaviour))
    for (const title of ['On the website', 'Who it is', 'How it talks', 'What it may promise', 'When to hand over', 'More options']) expect(html).toContain(title)
    expect(html).toContain('value="Ava"')
    expect(html).toContain('value="Never promise a price"')
    expect(html).toContain('Answering visitors')
    expect(html).toContain('Try the assistant')
    expect(html).not.toContain('Unsaved changes')
    expect(html).toContain('aria-expanded="false"')
  })

  it('opens the section ?tab= names: the knowledge, with a toolbar, its answers, categories and documents', () => {
    const html = render('/crm/assistant?tab=knowledge', {}, qc => {
      qc.setQueryData([...KNOWLEDGE_KEY, 'items'], [{ id: 1, question: 'Is there parking?', answer: 'Yes, 20 € a night.', category_id: 2, category: { id: 2, name: 'Getting here' }, keywords: ['car'], priority: 0, use_count: 3, is_active: true }])
      qc.setQueryData([...KNOWLEDGE_KEY, 'categories'], [{ id: 2, name: 'Getting here', description: null, priority: 0, sort_order: 0, is_active: true, items_count: 1 }])
      qc.setQueryData([...KNOWLEDGE_KEY, 'documents'], [])
    })
    expect(html).toContain('Is there parking?')
    expect(html).toContain('Used 3 times')
    expect(html).toContain('Draft from a text')
    expect(html).toContain('Search questions and answers')
    expect(html).toContain('All categories')
    expect(html).toContain('Show the answers in Getting here')
    expect(html).toContain('1 answers')
    expect(html).toContain('PDF, Word (.docx) or text (.txt), up to 10 MB.')
    expect(html).toContain('accept=".pdf,.docx,.txt"')
    expect(html).not.toContain('.doc,')
    expect(html).toContain('aria-selected="true"')
  })

  it('lists an answer to fix with its question and lets a manager teach it', () => {
    const html = render('/crm/assistant?tab=teach', {}, qc => qc.setQueryData(GAPS_KEY, [gap]))
    expect(html).toContain('Do you take dogs?')
    expect(html).toContain('Rated wrong by 2 people')
    expect(html).toContain('href="/crm/inbox?c=3"')
    expect(html).toContain('Teach the assistant')
    expect(html).toContain('1 to fix')
  })

  it('fills a manager\'s answer with a staff member\'s suggestion and says who suggested it', () => {
    const html = render('/crm/assistant?tab=teach', {}, qc => qc.setQueryData(GAPS_KEY, [{ ...gap, suggested_answer: 'Yes, dogs stay for 15 € a night.', suggested_by: 'Peter' }]))
    expect(html).toContain('Suggested by Peter')
    expect(html).toMatch(/<textarea[^>]*>Yes, dogs stay for 15 € a night\.<\/textarea>/)
    expect(html).toContain('Filled in with the suggestion')
  })

  it('shows staff the answers to fix: a manager writes the answer, they may suggest one and open the chat', () => {
    const can = { ...boot.staff.can, manage_bot: false }
    const html = render('/crm/assistant?tab=teach', { staff: { ...boot.staff, role: 'staff', can } }, qc => qc.setQueryData(GAPS_KEY, [{ ...gap, suggested_answer: 'Yes.', suggested_by: 'Peter' }]))
    expect(html).toContain('Do you take dogs?')
    expect(html).toContain('A manager writes the right answer')
    expect(html).toContain('href="/crm/inbox?c=3"')
    expect(html).toContain('Suggest the right answer')
    expect(html).toContain('Send the suggestion')
    expect(html).not.toContain('Teach the assistant')
    // Staff do not get a manager's prefilled form: the suggestion shows, their own box starts empty.
    expect(html).toMatch(/<textarea[^>]*><\/textarea>/)
  })

  it('draws the test chat with the assistant\'s name, starter questions and a message box', () => {
    const html = render('/crm/assistant?tab=try', {}, qc => qc.setQueryData(BEHAVIOUR_KEY, behaviour))
    expect(html).toContain('Ava')
    expect(html).toContain('What are your opening hours?')
    expect(html).toContain('Write as a visitor would…')
    expect(html).toContain('Behind the answer')
    expect(html).not.toContain('Try the assistant')
  })

  it('tells staff that trying the assistant is a manager\'s', () => {
    const can = { ...boot.staff.can, manage_bot: false }
    expect(render('/crm/assistant?tab=try', { staff: { ...boot.staff, role: 'staff', can } })).toContain('Only an owner or a manager can try the assistant here')
  })

  it('lists pop-ups with what starts them and their figures', () => {
    const html = render('/crm/assistant?tab=popups', {}, qc => qc.setQueryData(POPUPS_KEY, [
      { id: 1, name: 'Prices page', is_active: true, trigger_type: 'time_delay', trigger_value: '20', url_match_type: 'contains', url_match_value: '/prices', visitor_type: 'all', language_targets: null, message: 'Questions?', quick_replies: [], priority: 0, impressions_count: 4, clicks_count: 1 },
    ]))
    expect(html).toContain('Prices page')
    expect(html).toContain('After 20 s')
    expect(html).toContain('role="switch"')
    expect(html).toContain('(25 %)')
    expect(html).toContain('1 of 1 on')
  })

  it('says the plan lacks the chatbot instead of showing the sections', () => {
    const html = render('/crm/assistant?tab=knowledge', { features: { chatbot: false, engagement: true, ai_capture: true } })
    expect(html).toContain('Your plan does not include this')
    expect(html).not.toContain('Answers to fix')
  })
})
