import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

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

import { LoyaltyContext } from '../LoyaltyProvider'
import { CampaignsPage } from '../campaigns/CampaignsPage'
import type { Bootstrap, Can } from '../lib/types'
import { pushAudienceKey, pushKey, pushListKey, SEGMENTS_KEY } from './api'
import { PushSendDialog } from './PushSendDialog'
import type { Push, PushAudience, PushesPage, PushOptions, SegmentChoice } from './types'

const can = (more: Partial<Can> = {}): Can => ({ award: true, redeem: true, reverse: false, manage_program: false, manage_rewards: false, manage_members: false, view_insights: false, manage_campaigns: false, manage_app: false, ...more })
const manager = can({ manage_campaigns: true })
const boot = (c: Can, push = true): Bootstrap => ({
  name: 'HexaTech Loyalty',
  organization: { id: 1, name: 'Lumière', industry: 'hotel' },
  accent: null,
  venue: { timezone: 'Europe/Riga', timezone_named: true, today: '2026-10-21', currency: 'EUR' },
  features: { campaigns: true, wallet: true, push },
  staff: { id: 5, name: 'Ada', role: c.manage_campaigns ? 'manager' : 'staff', can: c },
  programme: { on: true, tiers: [] },
  counts: { members: 40, requests_waiting: 0 },
})
const options: PushOptions = { categories: ['offers', 'points', 'tier', 'stays'], max_name: 120, max_title: 100, title_guide: 40, max_body: 500, body_guide: 150, limit: 5000 }
const none = { sent: 0, failed: 0, inbox_only: 0, skipped: 0, pending: 0 }
const message = (more: Partial<Push> = {}): Push => ({
  id: 7, name: 'Autumn', title: 'Double points this weekend', category: 'offers', status: 'draft', segment: { id: 3, name: 'Gold' }, recipient_count: 0, results: none,
  sent_at: null, scheduled_at: null, scheduled_for: null, schedule_problem: null,
  created_at: '2026-10-20T08:00:00+00:00', updated_at: '2026-10-20T09:00:00+00:00', body: 'Every visit until Sunday earns double points.', segment_id: 3,
  missing: [], last_progress_at: null, created_by: 'Ada', sent_by: null, revision: '2026-10-20T09:00:00+00:00', ...more,
})
const list: PushesPage = {
  page: 1, pages: 1, total: 3,
  messages: [
    message(),
    message({ id: 6, name: 'Summer', title: 'Our summer', status: 'sent', category: 'points', recipient_count: 1200, results: { ...none, sent: 1180, failed: 20 }, sent_at: '2026-08-01T10:00:00+00:00' }),
    message({ id: 5, name: 'Spring', title: '', status: 'draft', category: null, segment: null, segment_id: null }),
  ],
}
const segments: SegmentChoice[] = [{ id: 3, name: 'Gold', members: 1200, problem: null }, { id: 9, name: 'Lapsed', members: 40, problem: { index: 0, reason: 'unknown_op' } }]

const render = (c: Can, path: string, feature = true, more?: (client: QueryClient) => void) => {
  const client = new QueryClient()
  client.setQueryData(pushListKey(1), list)
  client.setQueryData(SEGMENTS_KEY, { segments })
  more?.(client)
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <LoyaltyContext.Provider value={{ data: boot(c, feature), isLoading: false, isError: false, error: null, refetch: () => {} }}>
          <CampaignsPage />
        </LoyaltyContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
const button = (html: string, label: string) => html.match(new RegExp(`<button[^>]*>(?:(?!</button>).)*${label}(?:(?!</button>).)*</button>`))?.[0] ?? ''

describe('Push messages (spec 2026-10-22 release 3 §5)', () => {
  it('lists every message with its kind, segment, status and how far it got, and offers a new one', () => {
    const html = render(manager, '/loyalty/campaigns?tab=push')
    const words = text(html)
    expect(html).toContain('data-channel="push" aria-current="page"')
    expect(html.indexOf('data-push="7"')).toBeLessThan(html.indexOf('data-push="6"'))
    expect(words).toMatch(/Autumn Double points this weekend .*Offers.*Gold/)
    expect(words).toContain('1,180 of 1,200 pushed')
    expect(words).toContain('Sent')
    expect(words).toContain('No title yet')
    expect(words).toContain('No kind chosen yet')
    expect(words).toContain('No segment')
    expect(words).toContain('New push message')
    expect(html).toContain('href="/loyalty/campaigns?tab=push&amp;message=6"')
  })

  it('says calmly that the plan has no push messages', () => {
    const html = render(manager, '/loyalty/campaigns?tab=push', false)
    expect(text(html)).toContain('Your plan does not include push messages. Email campaigns and segments are not affected.')
    expect(html).toContain('data-plan-locked=""')
    expect(text(html)).not.toContain('New push message')
  })

  it('is a manager\'s: staff see neither the tab nor a message', () => {
    const html = render(can({ manage_rewards: true }), '/loyalty/campaigns?tab=push&message=7')
    expect(text(html)).toContain('Only an owner or a manager can work with campaigns and segments.')
    expect(html).not.toContain('role="tab"')
    expect(text(html)).not.toContain('Double points')
  })

  it('opens a draft in the editor with the server\'s kinds, the segment counts, the length guide and a phone preview', () => {
    const html = render(manager, '/loyalty/campaigns?tab=push&message=7', true, (client) => {
      client.setQueryData(pushKey(7), { push: message(), options })
      client.setQueryData(pushAudienceKey(7), { audience: { segment: { id: 3, name: 'Gold' }, category: 'offers', members: 1200, reached: 800, push_off: 100, no_device: 280, opted_out: 20, limit: 5000 } })
    })
    const words = text(html)
    expect(words).toContain('All push messages')
    expect(words).toContain('Kind of message')
    for (const kind of ['Offers', 'Points', 'Tier news', 'Visits and bookings']) expect(words).toContain(kind)
    expect(html.match(/<input type="radio"[^>]*>/g) ?? []).toHaveLength(4)
    expect(html).toMatch(/<input type="radio"[^>]*checked=""[^>]*value="offers"/)
    expect(words).toContain('Gold · 1,200 members')
    expect(words).toContain('Lapsed (a rule needs fixing)')
    expect(words).toContain('26 of about 40 characters that show in full')
    expect(html).toContain('data-phone-preview=""')
    expect(words).toContain('Lumière now')
    expect(words).toContain('It would reach 800 of the 1,200 members of Gold now.')
    expect(words).toContain('100 switched push notifications off')
    expect(words).toContain('280 have no phone with the app')
    expect(words).toContain('20 switched off this kind of message')
    expect(button(html, 'Send…')).not.toContain('disabled=""')
    expect(button(html, 'Save draft')).toContain('disabled=""')
    expect(words).toContain('Delete draft')
  })

  it('says why a draft cannot be sent yet and asks for a kind and a segment before counting', () => {
    const html = render(manager, '/loyalty/campaigns?tab=push&message=5', true, (client) => {
      client.setQueryData(pushKey(5), { push: message({ id: 5, title: '', body: '', category: null, segment: null, segment_id: null, missing: ['title', 'body', 'category'] }), options })
    })
    const words = text(html)
    expect(html).toContain('data-blockers=""')
    expect(words).toContain('Write a title.')
    expect(words).toContain('Write the message.')
    expect(words).toContain('Choose what kind of message it is.')
    expect(words).toContain('Choose who receives it.')
    expect(words).toContain('Choose a kind and a segment to see who it reaches.')
    expect(words).toContain('Your title')
    expect(button(html, 'Send…')).toContain('disabled=""')
  })

  it('shows a long title cut as a phone cuts it', () => {
    const html = render(manager, '/loyalty/campaigns?tab=push&message=7', true, (client) => {
      client.setQueryData(pushKey(7), { push: message({ title: 'Double points on every visit this whole weekend long' }), options })
    })
    const words = text(html)
    expect(words).toContain('Double points on every visit this whole…')
    expect(words).toContain('Phones cut a title after about 40 characters, as here.')
    expect(words).toContain('52 characters: phones may cut it after about 40')
  })

  it('shows a sending message\'s results with Stop sending and what came of the others', () => {
    const html = render(manager, '/loyalty/campaigns?tab=push&message=6', true, (client) => {
      client.setQueryData(pushKey(6), {
        push: message({ id: 6, name: 'Summer', status: 'sending', recipient_count: 400, results: { sent: 180, failed: 5, inbox_only: 10, skipped: 5, pending: 0 }, sent_by: 'Ada', last_progress_at: '2026-10-21T10:00:00+00:00' }),
        options,
      })
    })
    const words = text(html)
    expect(html).toContain('data-progress="sending"')
    expect(html).toContain('aria-valuenow="50"')
    expect(words).toContain('Pushed 180')
    expect(words).toContain('Of 400')
    expect(words).toContain('Sending, in batches of 100. This page updates every 10 seconds.')
    expect(words).toContain('Not delivered: 5')
    expect(words).toContain('Inbox only: 10')
    expect(words).toContain('Passed over: 5')
    expect(words).not.toContain('Under way')
    expect(words).toContain('Sent by Ada')
    expect(words).toContain('Stop sending')
    expect(words).toContain('Duplicate')
    expect(words).not.toContain('Delete draft')
  })

  it('shows the way back to the list while a message loads', () => {
    const html = render(manager, '/loyalty/campaigns?tab=push&message=99')
    expect(text(html)).toContain('All push messages')
    expect(text(html)).toContain('Loading…')
    expect(html).toContain('href="/loyalty/campaigns?tab=push"')
  })
})

describe('The send confirmation', () => {
  const dialog = (audience: PushAudience | null) => {
    const client = new QueryClient()
    if (audience) client.setQueryData(pushAudienceKey(7), { audience })
    return renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <LoyaltyContext.Provider value={{ data: boot(manager), isLoading: false, isError: false, error: null, refetch: () => {} }}>
            <PushSendDialog push={message()} onClose={() => {}} />
          </LoyaltyContext.Provider>
        </MemoryRouter>
      </QueryClientProvider>,
    )
  }
  const audience: PushAudience = { segment: { id: 3, name: 'Gold' }, category: 'offers', members: 1200, reached: 800, push_off: 100, no_device: 280, opted_out: 20, limit: 5000 }

  it('names the number it will push to, who is left out and why, with Not now first', () => {
    const html = dialog(audience)
    const words = text(html)
    expect(words).toContain('Send this push message')
    expect(words).toContain('It will push to 800 members of Gold, starting now.')
    expect(words).toContain('400 of its 1,200 members will not get it:')
    expect(words).toContain('20 switched off this kind of message')
    expect(words).toContain('Send to 800 members')
    expect(html.indexOf('Not now')).toBeLessThan(html.indexOf('Send to 800 members'))
  })

  it('offers no Send when nobody can receive it, or the segment is too large', () => {
    expect(text(dialog({ ...audience, reached: 0 }))).toContain('Nobody in Gold can receive it.')
    expect(dialog({ ...audience, reached: 0 })).not.toContain('Send to')
    const over = text(dialog({ ...audience, members: 9000, reached: 6000 }))
    expect(over).toContain('It would reach 6,000 members, more than 5,000, the most one message may. Narrow the segment.')
    expect(over).not.toContain('Send to 6,000')
  })

  it('counts first', () => {
    expect(text(dialog(null))).toContain('Counting who it will reach…')
  })
})
