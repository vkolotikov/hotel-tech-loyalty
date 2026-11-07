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
import { VISITOR_TABS } from './visitorsLogic'
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
  features: { chatbot: true, engagement: false },
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

function render(at: string, list: VisitorList, detail?: VisitorDetail) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const tab = new URLSearchParams(at.split('?')[1] ?? '').get('tab') ?? 'online'
  client.setQueryData(['crm', 'visitors', 'list', tab, '', 1], list)
  if (detail) client.setQueryData(['crm', 'visitors', 'detail', detail.visitor.id], detail)
  return renderToString(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[at]}>
        <CrmContext.Provider value={{ data: boot, isLoading: false, isError: false, error: null, refetch: () => {} }}>
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
  it('lists who is on the site with the tabs and their counts', () => {
    const html = render('/crm/visitors', list)
    expect(html).toContain('Visitors')
    expect(html).toContain('Marta Ozola')
    expect(html).toContain('Anonymous visitor')
    expect(html).toContain('Riga, Latvia')
    expect(html).toContain('Suites')
    expect(html).toContain('Left a contact')
    expect(html).toMatch(/aria-pressed="true"[^>]*>On the site now/)
    for (const label of ['Everyone', 'Away', 'Leads']) expect(html).toContain(label)
  })

  it('keeps the tab from ?tab=', () => {
    expect(render('/crm/visitors?tab=leads', list)).toMatch(/aria-pressed="true"[^>]*>Leads/)
  })

  it('opens ?v= at a glance with a way to chat and to delete', () => {
    const html = render('/crm/visitors?v=5', list, {
      visitor: visitor({}),
      page_views: [{ id: 1, url: 'https://hotel.example/suites', title: 'Suites', viewed_at: now }],
      conversations: [{ id: 12, channel: 'widget', status: 'waiting', visitor_name: 'Marta', messages_count: 4, lead_captured: true, last_message_at: now, created_at: now }],
    })
    expect(html).toContain('Open their chat')
    expect(html).toContain('Delete')
    expect(html).toContain('Pages they viewed')
    expect(html).toContain('href="/crm/inbox?c=12"')
    expect(html).toContain('href="/crm/contacts/8"')
    expect(html).toContain('On the site now')
  })

  it('says when nobody is there', () => {
    expect(render('/crm/visitors', { ...list, data: [], meta: { ...list.meta, total: 0 } })).toContain('Nobody is on the site right now')
  })
})

describe('the visitors words', () => {
  const keys = [...VISITOR_TABS.map(k => `tab.${k}`), ...Object.keys(PRESENCE_DEFAULTS).map(k => `presence.${k}`)]
  for (const lang of ['en', 'de', 'fr', 'es', 'ru']) {
    it(`has every word the page builds at run time in ${lang}`, () => {
      const words = JSON.parse(fs.readFileSync(path.resolve(__dirname, `../i18n/visitors.${lang}.json`), 'utf8'))
      const missing = keys.filter(key => typeof key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], words) !== 'string')
      expect(missing).toEqual([])
    })
  }
})
