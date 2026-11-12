import { describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CrmContext } from '../CrmProvider'
import type { Bootstrap } from '../lib/types'
import { ToastProvider } from '../ui/Toast'
import type { Visitor, VisitorDetail, VisitorList } from './types'
import { VisitorsPage } from './VisitorsPage'
import { ALL_VISITOR_TABS, PANEL_TABS, feedList } from './visitorsLogic'
import type { FeedPage } from '../inbox/feedLogic'
import { PRESENCE_DEFAULTS } from './words'

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
  accent: null,
  venue: { timezone: 'Europe/Riga', today: '2026-11-07', currency: 'EUR' },
  features: { chatbot: true, engagement: false, ai_capture: true },
  ai: { status: 'under', percent: 20 },
  staff: { id: 4, name: 'Ada', role: 'staff', can: { manage_bot: false, manage_widget: false, manage_pipelines: false, manage_canned: false, manage_team: false, delete_records: true } },
  widget: { key: 'k', active: true },
  counts: { chats_waiting: 0, leads_new: 0, tasks_due: 0 },
  setup: { done: 6, total: 6, complete: true },
}

const now = new Date().toISOString()
const visitor = (over: Partial<Visitor>): Visitor => ({
  id: 5, visitor_ip: '10.0.0.1', country: 'Latvia', city: 'Riga', referrer: 'https://www.google.com/', current_page: 'https://hotel.example/suites',
  current_page_title: 'Suites', first_seen_at: '2026-11-01T10:00:00+00:00', last_seen_at: now, visit_count: 3, page_views_count: 9, messages_count: 2,
  is_lead: true, is_online: true, guest_id: 8, display_name: 'Marta Ozola', email: 'marta@example.com', phone: null,
  guest: { id: 8, full_name: 'Marta Ozola', email: 'marta@example.com', phone: null }, ...over,
})

function render(at: string, list: VisitorList, detail?: VisitorDetail, opts: { engagement?: boolean; feed?: { path: string; data: FeedPage } } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const tab = new URLSearchParams(at.split('?')[1] ?? '').get('tab') ?? 'online'
  const path = tab === 'leads' ? 'visitors?status=all&lead_only=1' : `visitors?status=${tab}`
  client.setQueryData(['crm', 'visitors', 'list', path], { rows: list.data, page: list.meta.current_page, last: list.meta.last_page, total: list.meta.total, online: list.stats.online, stats: list.stats })
  if (opts.feed) {
    const { rows, meta } = feedList(opts.feed.data)
    client.setQueryData(['crm', 'visitors', 'list', opts.feed.path], { rows, page: meta?.current_page ?? 1, last: meta?.last_page ?? 1, total: meta?.total ?? 0, online: null })
    client.setQueryData(['crm', 'visitors', 'stats'], list.stats)
    client.setQueryData(['crm', 'visitors', 'feed-counts', 'all'], { hot_lead: 1, has_contact: 2, missed: 3 })
  }
  if (detail) client.setQueryData(['crm', 'visitors', 'detail', detail.visitor.id], detail)
  const data = { ...boot, features: { ...boot.features, engagement: opts.engagement ?? boot.features.engagement } }
  return renderToString(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[at]}>
        <CrmContext.Provider value={{ data, isLoading: false, isError: false, error: null, refetch: () => {} }}>
          <ToastProvider><VisitorsPage /></ToastProvider>
        </CrmContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const list: VisitorList = {
  data: [visitor({}), visitor({ id: 6, display_name: null, email: null, guest: null, guest_id: null, is_lead: false, last_seen_at: '2026-10-01T10:00:00+00:00', current_page: null, current_page_title: null })],
  meta: { current_page: 1, last_page: 1, per_page: 50, total: 2 },
  stats: { online: 1, offline: 1, leads: 1, total: 2 },
}

describe('VisitorsPage', () => {
  it('lists who is on the site with the tabs as icons and their counts, a live dot and icons for what they left', () => {
    const html = render('/crm/visitors', list)
    expect(html).toContain('Visitors')
    expect(html).toContain('Marta Ozola')
    expect(html).toContain('Anonymous visitor')
    expect(html).toContain('Riga, Latvia')
    expect(html).toContain('Suites')
    expect(html).toContain('Left a contact')
    expect(html).toMatch(/aria-pressed="true" title="On the site now"/)
    for (const label of ['Everyone', 'Away', 'Leads']) expect(html).toContain(`title="${label}"`)
    // Without the plan's Engagement hub, its filters are not offered.
    expect(html).not.toContain('title="Hot leads"')
  })

  it('keeps the tab from ?tab=', () => {
    expect(render('/crm/visitors?tab=leads', list)).toMatch(/aria-pressed="true" title="Leads"/)
  })

  it('opens ?v= in the record panel, in tabs, with a way to chat, to the contact and to delete', () => {
    const detail: VisitorDetail = {
      visitor: visitor({}),
      page_views: [{ id: 1, url: 'https://hotel.example/suites', title: 'Suites', viewed_at: now }],
      conversations: [{ id: 12, channel: 'widget', status: 'waiting', visitor_name: 'Marta', messages_count: 4, lead_captured: true, last_message_at: now, created_at: now }],
    }
    const html = render('/crm/visitors?v=5', list, detail)
    expect(html).toContain('role="dialog"')
    expect(html).toContain('Open their chat')
    expect(html).toContain('aria-label="Delete"')
    expect(html).toContain('href="/crm/visitors?contact=8"')
    expect(html).toContain('On the site now')
    for (const tab of ['Overview', 'Chats', 'Pages']) expect(html).toMatch(new RegExp(`role="tab"[^>]*>.*?${tab}`))
    expect(html).toContain('Pages viewed')
    const chats = render('/crm/visitors?v=5&vtab=chats', list, detail)
    expect(chats).toContain('href="/crm/inbox?c=12"')
    expect(render('/crm/visitors?v=5&vtab=pages', list, detail)).toContain('/suites')
  })

  it('keeps the controls in one header and the rows in aligned columns, with who is online now', () => {
    const html = render('/crm/visitors', list)
    expect(html).toContain('Search by name, email, address or page')
    expect(html).toContain('aria-label="Refresh"')
    expect(html).toContain('Last seen')
    expect(html).toContain('Pages viewed')
    expect(html).toContain('1 on the site right now')
  })

  it('says when nobody is there, with the one way on', () => {
    const html = render('/crm/visitors', { ...list, data: [], meta: { ...list.meta, total: 0 } })
    expect(html).toContain('Nobody is on the site right now')
    expect(html).toContain('Show everyone')
  })

  it('offers the full admin’s hot leads, has contact and missed on a plan with the hub, from its feed', () => {
    const feed: FeedPage = {
      data: [{
        id: 9, display_name: 'Ilze Bērziņa', email: 'ilze@example.com', phone: null, is_lead: true, is_online: false, country: 'Latvia', city: 'Riga',
        visitor_ip: null, current_page: null, current_page_title: null, visit_count: 2, page_views_count: 3, messages_count: 4, last_seen_at: now,
        guest_id: null, guest: null, is_hot_lead: true, priority_score: 300,
        conversation: { id: 20, status: 'resolved', last_message_preview: null, last_message_sender: null, last_message_at: null, lead_captured: true, ai_enabled: true, assigned_to: null, unread_admin_count: 0, intent_tag: 'cancellation' },
      }],
      meta: { current_page: 1, last_page: 1, per_page: 50, total: 1 },
    }
    const html = render('/crm/visitors?tab=hot_lead', list, undefined, { engagement: true, feed: { path: 'engagement/feed?filter=hot_lead&sort=priority&range=all', data: feed } })
    expect(html).toMatch(/aria-pressed="true" title="Hot leads"/)
    for (const label of ['Has contact', 'Missed']) expect(html).toContain(`title="${label}"`)
    expect(html).toContain('Ilze Bērziņa')
    expect(html).toContain('Hot lead')
    expect(html).toContain('Wants to cancel')
    expect(html).toContain('When: All time')
  })
})

describe('the visitors words', () => {
  const keys = [...ALL_VISITOR_TABS.map(k => `tab.${k}`), ...Object.keys(PRESENCE_DEFAULTS).map(k => `presence.${k}`), ...PANEL_TABS.map(k => `ptab.${k}`)]
  for (const lang of ['en', 'de', 'fr', 'es', 'ru']) {
    it(`has every word the page builds at run time in ${lang}`, () => {
      const words = JSON.parse(fs.readFileSync(path.resolve(__dirname, `../i18n/visitors.${lang}.json`), 'utf8'))
      const missing = keys.filter(key => typeof key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], words) !== 'string')
      expect(missing).toEqual([])
    })
  }
})
