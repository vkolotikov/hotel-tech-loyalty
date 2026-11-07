import { describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CrmContext } from '../CrmProvider'
import type { Bootstrap } from '../lib/types'
import { ToastProvider } from '../ui/Toast'
import { InboxPage } from './InboxPage'
import { CHANNELS, INTENTS } from './inboxLogic'
import { inboxKeys } from './inboxQueries'
import type { Conversation, ConversationDetail, InboxStats, Page } from './types'
import { ACTION_DEFAULTS, ACTION_DONE_DEFAULTS, DICTATION_ERROR_DEFAULTS, FIELD_ERROR_DEFAULTS, UPLOAD_ERROR_DEFAULTS } from './words'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en' },
  }),
}))

const boot: Bootstrap = {
  name: 'HexaTech CRM',
  organization: { id: 7, name: 'Hotel Aurora', industry: 'hotel' },
  accent: '#3b82f6',
  venue: { timezone: 'Europe/Riga', today: '2026-11-07', currency: 'EUR' },
  features: { chatbot: true, engagement: true },
  ai: { status: 'under', percent: 20 },
  staff: { id: 4, name: 'Ada', role: 'manager', can: { manage_bot: true, manage_widget: true, manage_pipelines: true, manage_canned: true, manage_team: true, delete_records: true } },
  widget: { key: 'k', active: true },
  counts: { chats_waiting: 1, leads_new: 0, tasks_due: 0 },
  setup: { done: 6, total: 6, complete: true },
}

const row = (over: Partial<Conversation>): Conversation => ({
  id: 12, visitor_id: 3, visitor_name: 'Marta Ozola', visitor_email: 'marta@example.com', visitor_phone: null, visitor_country: 'Latvia',
  visitor_city: 'Riga', page_url: 'https://hotel.example/rooms', channel: 'widget', status: 'waiting', ai_enabled: true, assigned_to: null,
  assigned_agent: null, member: null, unread_count: 2, ip_session_count: 1, last_message: 'Do you have a room on Friday?',
  last_message_at: '2026-11-07T09:01:00+00:00', lead_captured: false, inquiry_id: null, intent_tag: 'booking_inquiry', agent_notes: null,
  created_at: '2026-11-07T09:00:00+00:00', ...over,
})

const stats: InboxStats = { active: 4, waiting: 1, resolved: 9, archived: 2, closed: 11, total: 16, active_24h: 3, unassigned: 1, resolved_today: 0, unread_messages: 2 }

const detail: ConversationDetail = {
  conversation: { ...row({}), visitor: { id: 3, country: 'Latvia', city: 'Riga', visit_count: 2, page_views_count: 7, first_seen_at: '2026-11-01T10:00:00+00:00', last_seen_at: '2026-11-07T09:01:00+00:00', referrer: 'https://www.google.com/', is_lead: false }, visitor_page_views: [{ id: 1, url: 'https://hotel.example/rooms', title: 'Rooms', viewed_at: '2026-11-07T08:59:00+00:00' }] },
  messages: [
    { id: 100, conversation_id: 12, sender_type: 'visitor', sender_user_id: null, content: 'Do you have a room on Friday?', created_at: '2026-11-07T09:00:00+00:00' },
    { id: 101, conversation_id: 12, sender_type: 'ai', sender_user_id: null, content: 'Let me check that for you.', created_at: '2026-11-07T09:00:20+00:00', feedback: null },
    { id: 102, conversation_id: 12, sender_type: 'system', sender_user_id: 4, content: 'AI auto-reply paused by agent', created_at: '2026-11-07T09:00:40+00:00' },
    { id: 103, conversation_id: 12, sender_type: 'agent', sender_user_id: 4, sender_user: { id: 4, name: 'Ada' }, content: 'Yes, we do.', created_at: '2026-11-07T09:01:00+00:00' },
  ],
  siblings: [],
  visitor_typing: true,
}

function render(at: string, data: { list?: Page<Conversation>; status?: string; features?: Bootstrap['features'] } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const status = data.status ?? 'all'
  client.setQueryData(inboxKeys.stats, stats)
  client.setQueryData([...inboxKeys.lists, status, '', true, 1], data.list ?? { data: [row({}), row({ id: 13, visitor_name: 'Jānis', status: 'active', unread_count: 0, ai_enabled: false })], current_page: 1, last_page: 1, total: 2 })
  client.setQueryData(inboxKeys.detail(12), detail)
  const value = { data: { ...boot, features: data.features ?? boot.features }, isLoading: false, isError: false, error: null, refetch: () => {} }
  return renderToString(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[at]}>
        <CrmContext.Provider value={value}>
          <ToastProvider><InboxPage /></ToastProvider>
        </CrmContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('InboxPage', () => {
  it('lists the conversations with the filters and their counts, the most urgent first', () => {
    const html = render('/crm/inbox')
    expect(html).toContain('Inbox')
    expect(html).toContain('Marta Ozola')
    expect(html).toContain('Jānis')
    expect(html.indexOf('Marta Ozola')).toBeLessThan(html.indexOf('Jānis'))
    expect(html).toContain('Do you have a room on Friday?')
    for (const label of ['All', 'Active', 'Waiting', 'Resolved', 'Archived']) expect(html).toContain(label)
    expect(html).toMatch(/aria-pressed="true"[^>]*>All/)
    expect(html).toContain('1 open with nobody assigned')
    expect(html).toContain('Pick a conversation')
  })

  it('preselects ?status=waiting', () => {
    const html = render('/crm/inbox?status=waiting', { status: 'waiting' })
    expect(html).toMatch(/aria-pressed="true"[^>]*>Waiting/)
  })

  it('opens ?c=12 with its bubbles, the typing visitor, the reply box with the AI draft, and the details', () => {
    const html = render('/crm/inbox?c=12')
    expect(html).toContain('crm-bubble-visitor')
    expect(html).toContain('crm-bubble-ai')
    expect(html).toContain('crm-bubble-agent')
    expect(html).toContain('AI auto-reply paused by agent')
    expect(html).toContain('Marta Ozola is typing…')
    expect(html).toContain('Take over')
    expect(html).toContain('Draft a reply with AI')
    expect(html).toContain('Your reply')
    expect(html).toContain('A good answer')
    expect(html).toContain('Translate')
    expect(html).toContain('Wants to book')
    expect(html).toContain('Capture as lead')
    expect(html).toContain('Sum up the chat with AI')
    expect(html).toContain('Back to the conversations')
    expect(html).not.toContain('Pick a conversation')
  })

  it('leaves out the AI draft, the AI button and translation on a plan without them', () => {
    const html = render('/crm/inbox?c=12', { features: { chatbot: false, engagement: false } })
    expect(html).not.toContain('Draft a reply with AI')
    expect(html).not.toContain('Take over')
    expect(html).not.toContain('Sum up the chat with AI')
    expect(html).not.toContain('>Translate<')
    expect(html).toContain('Your reply')
  })

  it('says when no conversation is there', () => {
    expect(render('/crm/inbox', { list: { data: [], current_page: 1, last_page: 1, total: 0 } })).toContain('No conversations here')
  })
})

describe('the inbox words', () => {
  const dir = path.resolve(__dirname, '../i18n')
  const keys = [
    ...CHANNELS.map(k => `channel.${k}`), ...INTENTS.map(k => `intent.${k}`),
    ...Object.keys(ACTION_DEFAULTS).map(k => `action.${k}`), ...Object.keys(ACTION_DONE_DEFAULTS).map(k => `action_done.${k}`),
    ...Object.keys(UPLOAD_ERROR_DEFAULTS).map(k => `upload_error.${k}`), ...Object.keys(DICTATION_ERROR_DEFAULTS).map(k => `dictation_error.${k}`),
    ...Object.keys(FIELD_ERROR_DEFAULTS).map(k => `field_error.${k}`),
  ]
  for (const lang of ['en', 'de', 'fr', 'es', 'ru']) {
    it(`has every word the inbox builds at run time in ${lang}`, () => {
      const words = JSON.parse(fs.readFileSync(path.join(dir, `inbox.${lang}.json`), 'utf8'))
      const missing = keys.filter(key => typeof key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], words) !== 'string')
      expect(missing).toEqual([])
    })
  }
})
