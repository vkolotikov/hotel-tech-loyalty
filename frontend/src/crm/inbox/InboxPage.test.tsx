import { describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CrmContext } from '../CrmProvider'
import type { Bootstrap } from '../lib/types'
import { ToastProvider } from '../ui/Toast'
import { FeedbackDialog } from './FeedbackDialog'
import { InboxPage } from './InboxPage'
import { CHANNELS, DETAILS_TABS, INTENTS, feedConversations } from './inboxLogic'
import type { FeedPage, FeedRow } from './feedLogic'
import { inboxKeys } from './inboxQueries'
import type { Conversation, ConversationDetail, InboxStats, Page } from './types'
import { ACTION_DEFAULTS, ACTION_DONE_DEFAULTS, DICTATION_ERROR_DEFAULTS, FIELD_ERROR_DEFAULTS, RANGE_DEFAULTS, UPLOAD_ERROR_DEFAULTS } from './words'

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
  features: { chatbot: true, engagement: true, ai_capture: true },
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

function render(at: string, data: { list?: Page<Conversation>; status?: string; features?: Bootstrap['features']; feed?: { path: string; key?: string; data: FeedPage }; detail?: ConversationDetail } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const status = data.status ?? 'all'
  client.setQueryData(inboxKeys.stats, stats)
  const list = data.list ?? { data: [row({}), row({ id: 13, visitor_name: 'Jānis', status: 'active', unread_count: 0, ai_enabled: false })], current_page: 1, last_page: 1, total: 2 }
  client.setQueryData([...inboxKeys.lists, `chat-inbox?${status === 'all' ? '' : `status=${status}&`}group_by_visitor=1`, ''], { rows: list.data, page: list.current_page, last: list.last_page, total: list.total })
  if (data.feed) {
    client.setQueryData([...inboxKeys.lists, data.feed.path, data.feed.key ?? 'all:0'], {
      rows: feedConversations(data.feed.data.data, { status: null, unassigned: false }), page: 1, last: 1, total: data.feed.data.meta.total,
    })
  }
  client.setQueryData(inboxKeys.detail(12), data.detail ?? detail)
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
  it('lists the conversations with the statuses as icons and their counts, the most urgent first', () => {
    const html = render('/crm/inbox')
    expect(html).toContain('Inbox')
    expect(html).toContain('Marta Ozola')
    expect(html).toContain('Jānis')
    expect(html.indexOf('Marta Ozola')).toBeLessThan(html.indexOf('Jānis'))
    expect(html).toContain('Do you have a room on Friday?')
    for (const label of ['All', 'Active', 'Waiting', 'Resolved', 'Archived']) expect(html).toContain(`title="${label}"`)
    expect(html).toMatch(/aria-pressed="true" title="All"/)
    expect(html).toContain('1 open with nobody assigned')
    expect(html).toContain('2 unread messages')
    expect(html).toContain('Pick a conversation')
  })

  it('preselects ?status=waiting', () => {
    const html = render('/crm/inbox?status=waiting', { status: 'waiting' })
    expect(html).toMatch(/aria-pressed="true" title="Waiting"/)
  })

  it('opens ?c=12 with its bubbles, the typing visitor, the reply box with the AI draft, and the details in tabs', () => {
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
    expect(html).toContain('aria-label="Translate"')
    expect(html).toContain('Wants to book')
    expect(html).toContain('Resolve (E)')
    expect(html).toContain('Nobody assigned')
    expect(html).toContain('Hide the details')
    expect(html).toContain('Back to the conversations')
    expect(html).not.toContain('Pick a conversation')
  })

  it('opens the Lead and AI tabs from ?dtab=, the lead in its panel', () => {
    expect(render('/crm/inbox?c=12&dtab=lead')).toContain('Capture as lead')
    expect(render('/crm/inbox?c=12&dtab=ai')).toContain('Sum up the chat with AI')
    const linked = render('/crm/inbox?c=12&dtab=lead', { detail: { ...detail, conversation: { ...detail.conversation, inquiry_id: 30, lead_captured: true } } })
    expect(linked).toContain('href="/crm/inbox?c=12&amp;dtab=lead&amp;lead=30"')
    expect(linked).toContain('Open the lead')
  })

  it('leaves out the AI draft, the AI button, translation, the AI tab and the feed on a plan without them', () => {
    const html = render('/crm/inbox?c=12&dtab=ai', { features: { chatbot: false, engagement: false, ai_capture: true } })
    expect(html).not.toContain('Draft a reply with AI')
    expect(html).not.toContain('Take over')
    expect(html).not.toContain('Sum up the chat with AI')
    expect(html).not.toContain('aria-label="Translate"')
    expect(html).not.toContain('Priority first')
    expect(html).toContain('Your reply')
    // An intent was read, so the AI tab still shows what they want; without the hub nothing else.
    expect(html).toContain('What they want')
  })

  it('says when no conversation is there', () => {
    expect(render('/crm/inbox', { list: { data: [], current_page: 1, last_page: 1, total: 0 } })).toContain('No conversations here')
  })
})

describe('the inbox, round 5', () => {
  it('keeps the controls in one header: search, statuses, priority, filters, nobody assigned, one row per visitor, sound, alerts', () => {
    const html = render('/crm/inbox')
    expect(html).toContain('Search by name or email')
    expect(html).toContain('Priority first')
    expect(html).toContain('aria-label="Filters"')
    expect(html).toContain('One row per visitor')
    expect(html).toContain('Sound when a visitor writes')
    // Rendered on a server there is no browser to ask: the switch says so and cannot be pressed.
    expect(html).toContain('This browser cannot show desktop alerts')
  })

  const feedRow = (over: Partial<FeedRow>): FeedRow => ({
    id: 3, display_name: 'Marta Ozola', email: 'marta@example.com', phone: null, is_lead: true, is_online: true, country: 'LV', city: 'Riga',
    visitor_ip: null, current_page: null, current_page_title: null, visit_count: 2, page_views_count: 7, messages_count: 3, last_seen_at: null,
    guest_id: null, guest: null, is_hot_lead: true, priority_score: 1250,
    conversation: { id: 12, status: 'waiting', last_message_preview: 'Do you have a room on Friday?', last_message_sender: 'visitor', last_message_at: null, lead_captured: false, ai_enabled: false, assigned_to: null, unread_admin_count: 1, intent_tag: 'complaint' },
    ...over,
  })

  it('lists the feed in its priority order with the hot-lead and intent icons, the filter as a removable chip', () => {
    const html = render('/crm/inbox?sort=priority', {
      feed: { path: 'engagement/feed?filter=priority&sort=priority&range=all', data: { data: [feedRow({}), feedRow({ id: 4, display_name: 'Ilze', is_hot_lead: false, conversation: null })], meta: { current_page: 1, last_page: 1, per_page: 50, total: 2 } } },
    })
    expect(html).toContain('Marta Ozola')
    expect(html).not.toContain('Ilze')
    expect(html).toContain('Hot lead')
    expect(html).toContain('Complaint')
    expect(html).toContain('Remove the filter: Priority first')
    expect(html).toMatch(/aria-pressed="true" title="Priority first"/)
  })

  it('asks the feed for an intent, newest first, in the window', () => {
    const html = render('/crm/inbox?intent=complaint&range=week', {
      feed: { path: 'engagement/feed?filter=complaint&sort=recent&range=week', data: { data: [feedRow({})], meta: { current_page: 1, last_page: 1, per_page: 50, total: 1 } } },
    })
    expect(html).toContain('Marta Ozola')
    expect(html).toContain('Remove the filter: Complaint')
    expect(html).toContain(`Remove the filter: ${RANGE_DEFAULTS.week}`)
  })

  it('titles the details’ tabs: Contact, Lead, AI, Website', () => {
    const html = render('/crm/inbox?c=12')
    expect(html).toContain('What to do with this chat')
    for (const tab of ['Contact', 'Lead', 'AI', 'Website']) expect(html).toMatch(new RegExp(`role="tab"[^>]*title="${tab}"`))
    expect(html).toContain('Reply tools')
    expect(html).toContain('crm-ai-soft')
  })

  const rated = (manager: boolean) => {
    const client = new QueryClient()
    const value = { data: { ...boot, staff: { ...boot.staff, can: { ...boot.staff.can, manage_bot: manager } } }, isLoading: false, isError: false, error: null, refetch: () => {} }
    return renderToString(
      <QueryClientProvider client={client}>
        <CrmContext.Provider value={value}>
          <ToastProvider><FeedbackDialog message={detail.messages[1]} rating="bad" onClose={() => {}} onSaved={() => {}} /></ToastProvider>
        </CrmContext.Provider>
      </QueryClientProvider>,
    )
  }

  it('lets a staff member suggest the right answer for a manager to check', () => {
    const html = rated(false)
    expect(html).toContain('Suggest the right answer — a manager will check it')
    expect(html).not.toContain('Teach the assistant this answer')
  })

  it('lets a manager teach the assistant at once', () => {
    const html = rated(true)
    expect(html).toContain('Teach the assistant this answer')
    expect(html).not.toContain('Suggest the right answer')
  })
})

describe('the inbox words', () => {
  const dir = path.resolve(__dirname, '../i18n')
  const keys = [
    ...CHANNELS.map(k => `channel.${k}`), ...INTENTS.map(k => `intent.${k}`),
    ...Object.keys(ACTION_DEFAULTS).map(k => `action.${k}`), ...Object.keys(ACTION_DONE_DEFAULTS).map(k => `action_done.${k}`),
    ...Object.keys(UPLOAD_ERROR_DEFAULTS).map(k => `upload_error.${k}`), ...Object.keys(DICTATION_ERROR_DEFAULTS).map(k => `dictation_error.${k}`),
    ...Object.keys(FIELD_ERROR_DEFAULTS).map(k => `field_error.${k}`),
    ...Object.keys(RANGE_DEFAULTS).map(k => `range.${k}`), ...DETAILS_TABS.map(k => `dtab.${k}`),
  ]
  for (const lang of ['en', 'de', 'fr', 'es', 'ru']) {
    it(`has every word the inbox builds at run time in ${lang}`, () => {
      const words = JSON.parse(fs.readFileSync(path.join(dir, `inbox.${lang}.json`), 'utf8'))
      const missing = keys.filter(key => typeof key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], words) !== 'string')
      expect(missing).toEqual([])
    })
  }
})
