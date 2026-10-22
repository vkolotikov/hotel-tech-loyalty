import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PortalContext, type PortalContextValue } from '../PortalProvider'
import { Inbox, InboxRow } from './Inbox'
import type { InboxNotification, LaravelPage, PortalBootstrap, PortalMember } from '../lib/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, fallback?: string | Record<string, unknown>, opts?: Record<string, unknown>) => {
      const vars = typeof fallback === 'object' ? fallback : opts
      let text = typeof fallback === 'string' ? fallback : _k
      for (const [k, v] of Object.entries(vars ?? {})) text = text.replace(`{{${k}}}`, String(v))
      return text
    },
    i18n: { language: 'en' },
  }),
}))
vi.mock('../lib/portalApi', () => ({
  portalApi: { notifications: () => new Promise(() => {}), markNotificationRead: vi.fn(), markAllNotificationsRead: vi.fn() },
  apiMessage: (_e: unknown, f: string) => f,
}))

const member = { member_number: 'HL-1', user: { id: 1, name: 'Ada', email: 'ada@example.test', phone: null, language: 'en' } } as unknown as PortalMember
const base = (unread: number, withMember = true): PortalBootstrap => ({
  venue: { name: 'Numa', logo_url: null, industry: 'beauty', currency: 'EUR', timezone: 'Europe/Riga', contact: { email: null, phone: null },
    accent: { hex: '#b04a6e', ink: '#ffffff', deep: '#8e3b58', dark_hex: '#e38ab0', dark_ink: '#1a0b12', dark_deep: '#f0b4cd' }, display_face: 'cormorant' },
  capabilities: { loyalty: true, services: true, stays: false, chat: true, payments: { services: false, stays: false, publishable_key: null } },
  policies: { services_cancel_hours: 24, booking_cancel_hours: 48, services_cancellation_policy: '', booking_cancellation_policy: '', check_in_time: '15:00', check_out_time: '11:00' },
  member: withMember ? member : null, counts: { unread_notifications: unread, upcoming_bookings: 0 },
})

const row = (id: number, title: string, read_at: string | null, created_at: string): InboxNotification => ({
  id, member_id: 1, type: 'points_earned', title, body: `Body of ${title}`, data: null, channel: 'push', campaign_id: null,
  is_sent: true, sent_at: created_at, read_at, created_at, updated_at: created_at,
})

function render(data: PortalBootstrap, rows: InboxNotification[] | null) {
  const client = new QueryClient()
  if (rows) {
    const page: LaravelPage<InboxNotification> = { data: rows, current_page: 1, last_page: 1, total: rows.length }
    client.setQueryData(['portal-inbox', 1], page)
  }
  const value: PortalContextValue = { data, isLoading: false, isError: false, error: null, refetch: () => {} }
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter><PortalContext.Provider value={value}><Inbox /></PortalContext.Provider></MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Inbox', () => {
  it('lists the kept notifications in the order the server sends them (newest first), unread ones marked', () => {
    const html = render(base(1), [
      row(2, 'Your new level', null, '2026-10-02T09:00:00.000000Z'),
      row(1, 'You earned 120 points', '2026-10-01T10:00:00.000000Z', '2026-10-01T09:00:00.000000Z'),
    ])
    expect(html.indexOf('Your new level')).toBeLessThan(html.indexOf('You earned 120 points'))
    expect(html.match(/Unread/g)?.length).toBe(1)
    expect(html).toContain('Body of Your new level')
    expect(html).toContain('Mark all as read')
    expect(html).toContain('href="/portal/profile#messages"')
  })

  it('offers no "mark all" when everything is read', () => {
    const html = render(base(0), [row(1, 'Old news', '2026-10-01T10:00:00.000000Z', '2026-10-01T09:00:00.000000Z')])
    expect(html).not.toContain('Mark all as read')
  })

  it('shows a calm empty state, naming the venue', () => {
    const html = render(base(0), [])
    expect(html).toContain('Nothing here yet')
    expect(html).toContain('When Numa sends you news')
    expect(html).not.toContain('Mark all as read')
  })

  it('without a membership row it never asks for the list, and shows the empty state', () => {
    const html = render(base(0, false), null)
    expect(html).toContain('Nothing here yet')
  })
})

describe('InboxRow', () => {
  const n = row(5, 'A long message', null, '2026-10-02T09:00:00.000000Z')
  const markup = (isOpen: boolean) => renderToStaticMarkup(
    <PortalContext.Provider value={{ data: base(1), isLoading: false, isError: false, error: null, refetch: () => {} }}>
      <InboxRow n={n} isOpen={isOpen} onOpen={() => {}} />
    </PortalContext.Provider>,
  )

  it('clips the text to two lines until it is opened, then shows all of it', () => {
    expect(markup(false)).toContain('line-clamp-2')
    expect(markup(false)).toContain('aria-expanded="false"')
    expect(markup(true)).not.toContain('line-clamp-2')
    expect(markup(true)).toContain('aria-expanded="true"')
  })

  it('shows when it came, on the venue clock', () => {
    expect(markup(false)).toContain('<time dateTime="2026-10-02T09:00:00.000000Z">')
  })
})
