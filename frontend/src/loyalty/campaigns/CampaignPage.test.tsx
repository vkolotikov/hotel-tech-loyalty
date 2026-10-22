import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
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
import type { Bootstrap, Can } from '../lib/types'
import { audienceKey, campaignKey, SEGMENTS_KEY } from './api'
import { CampaignPage } from './CampaignPage'
import { SendDialog } from './SendDialog'
import type { Audience, Campaign, CampaignOptions, Segment } from './types'

const can = (more: Partial<Can> = {}): Can => ({ award: true, redeem: true, reverse: false, manage_program: false, manage_rewards: false, manage_members: false, view_insights: false, manage_campaigns: false, manage_app: false, ...more })
const manager = can({ manage_campaigns: true })
const boot = (c: Can, campaigns = true): Bootstrap => ({
  name: 'HexaTech Loyalty',
  organization: { id: 1, name: 'Lumière', industry: 'hotel' },
  accent: null,
  venue: { timezone: 'Europe/Riga', timezone_named: true, today: '2026-10-21', currency: 'EUR' },
  features: { campaigns, wallet: true, push: true },
  staff: { id: 5, name: 'Ada', role: c.manage_campaigns ? 'manager' : 'staff', can: c },
  programme: { on: true, tiers: [] },
  counts: { members: 40, requests_waiting: 0 },
})
const options: CampaignOptions = {
  block_types: ['heading', 'text', 'button', 'divider', 'spacer'],
  new_blocks: {},
  aligns: ['left', 'center', 'right'],
  levels: [1, 2, 3],
  font_sizes: [12, 13, 14, 15, 16, 18],
  max_blocks: 100,
  max_text: { heading: 500, text: 5000, button: 200 },
  max_url: 2000,
  spacer: { min: 4, max: 160 },
  max_name: 120,
  max_subject: 200,
  tags: [
    { tag: '{{member_name}}', name: 'member_name', label: 'Member full name' },
    { tag: '{{first_name}}', name: 'first_name', label: 'Member first name' },
    { tag: '{{lucky_number}}', name: 'lucky_number', label: 'A tag the server added later' },
  ],
  known_tags: ['{{member_name}}', '{{first_name}}', '{{lucky_number}}', '{{member.name}}'],
}
const HTML = '<div style="max-width:600px"><h1>Autumn at Lumière</h1></div>'
const draft = (more: Partial<Campaign> = {}): Campaign => ({
  id: 7, name: 'Autumn', subject: 'Our autumn', status: 'draft', segment: { id: 3, name: 'Gold' }, recipient_count: 0, sent_count: 0, failed_count: 0, sent_at: null,
  scheduled_at: null, scheduled_for: null, schedule_problem: null,
  created_at: '2026-10-20T08:00:00+00:00', updated_at: '2026-10-20T09:00:00+00:00', segment_id: 3, editable_here: true,
  body_blocks: [
    { id: 'h1', type: 'heading', text: 'Autumn at Lumière', level: 1, align: 'center', color: '#1a1a1a' },
    { id: 'b1', type: 'button', text: 'Book now', url: 'https://lumiere.example/book', bgColor: '#c9a84c', textColor: '#0e0e0e', align: 'center' },
  ],
  body_html: HTML, preview_subject: 'Our autumn', preview_html: HTML, unknown_tags: [], missing: [], last_progress_at: null, created_by: 'Ada', sent_by: null, revision: '2026-10-20T09:00:00+00:00', ...more,
})
const segments: Segment[] = [
  { id: 3, name: 'Gold', description: null, everyone: false, operator: 'AND', filters: [{ type: 'tier', op: 'in', value: [2] }], members: 1200, problem: null, last_sent_at: null, updated_at: null },
  { id: 9, name: 'Lapsed', description: null, everyone: false, operator: 'AND', filters: [], members: 40, problem: { index: 0, reason: 'unknown_op' }, last_sent_at: null, updated_at: null },
]

const render = (c: Can, campaign: Campaign | null, feature = true, more?: (client: QueryClient) => void) => {
  const client = new QueryClient()
  if (campaign) client.setQueryData(campaignKey(7), { campaign, options })
  client.setQueryData(SEGMENTS_KEY, { segments })
  more?.(client)
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/loyalty/campaigns/7']}>
        <LoyaltyContext.Provider value={{ data: boot(c, feature), isLoading: false, isError: false, error: null, refetch: () => {} }}>
          <Routes><Route path="/loyalty/campaigns/:id" element={<CampaignPage />} /></Routes>
        </LoyaltyContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
const button = (html: string, label: string) => html.match(new RegExp(`<button[^>]*>(?:(?!</button>).)*${label}(?:(?!</button>).)*</button>`))?.[0] ?? ''

describe('A draft (spec 2026-10-21 release 2 §6)', () => {
  it('opens in the editor with its fields, its blocks, the audience with counts, and the server\'s rendering in a sandboxed frame', () => {
    const html = render(manager, draft())
    const words = text(html)
    expect(html).toContain('value="Our autumn"')
    expect(words).toContain('Gold · 1,200 members')
    expect(words).toContain('Lapsed (a rule needs fixing)')
    expect(html).toContain('value="Autumn at Lumière"')
    expect(html).toContain('value="https://lumiere.example/book"')
    expect(html).toContain('data-block="heading"')
    expect(html).toContain('aria-label="Move Button 2 down"')
    expect(html).toMatch(/<iframe[^>]*sandbox=""[^>]*srcDoc="[^"]*&lt;h1&gt;Autumn at Lumière/)
    expect(words).toContain('Each member’s copy ends with the venue’s name and an unsubscribe link.')
    // Saved and complete: Save waits for a change, Test and Send are open.
    expect(button(html, 'Save draft')).toContain('disabled=""')
    expect(button(html, 'Send me a test')).not.toContain('disabled=""')
    expect(button(html, 'Send…')).not.toContain('disabled=""')
    expect(html).not.toContain('data-blockers')
    for (const kind of ['Heading', 'Text', 'Button', 'Divider', 'Space']) expect(words).toContain(kind)
  })

  it('says what Send still waits for, from the server\'s answer, and keeps Send shut', () => {
    const html = render(manager, draft({ subject: '', segment_id: null, segment: null, missing: ['subject', 'button:1'] }))
    const words = text(html)
    expect(words).toContain('Before it can be sent: Choose who receives it. Write a subject. Give every button a label and a link.')
    expect(button(html, 'Send…')).toContain('disabled=""')
    expect(button(html, 'Send me a test')).toContain('disabled=""')
  })

  it('offers the server\'s tags, waiting for a field to put them in, and says nothing of tags it fills', () => {
    const html = render(manager, draft({ body_blocks: [{ id: 't', type: 'text', text: 'Hi {{member.name}}, {{first_name}}', color: '#555555', align: 'left', fontSize: 15 }] }))
    const words = text(html)
    expect(html).toContain('data-tags=""')
    expect(button(html, 'Full name')).toContain('title="{{member_name}}"')
    expect(button(html, 'First name')).toContain('disabled=""')
    // A tag the workspace has no word for is named by the server's description.
    expect(button(html, 'A tag the server added later')).toContain('title="{{lucky_number}}"')
    expect(words).toContain('Click into the subject, a heading, a text or a button label, then choose a tag to put there. Each member’s copy shows their own.')
    expect(html).not.toContain('data-unknown-tags')
    expect(words).not.toContain('not filled in')
  })

  it('names a double-braced word no tag fills, in the subject or a block, as it is typed', () => {
    const html = render(manager, draft({ subject: 'Hi {{name}}', body_blocks: [{ id: 't', type: 'text', text: 'Your {{favourite}} {{first_name}}', color: '#555555', align: 'left', fontSize: 15 }] }))
    expect(html).toContain('data-unknown-tags=""')
    expect(text(html)).toContain('{{name}}, {{favourite}} will reach members as written: no tag of that name is filled in.')
  })

  it('previews the server\'s rendering with the tags filled with the viewer\'s own sample, and says so', () => {
    const html = render(manager, draft({ subject: 'Hi {{first_name}}', preview_subject: 'Hi Ada', body_html: '<p>Dear {{member.name}}</p>', preview_html: '<p>Dear Ada &lt;Lovelace&gt;</p>' }))
    const words = text(html)
    expect(html).toMatch(/<iframe[^>]*srcDoc="[^"]*&lt;p&gt;Dear Ada &amp;lt;Lovelace&amp;gt;&lt;\/p&gt;/)
    expect(html).not.toMatch(/<iframe[^>]*srcDoc="[^"]*\{\{member\.name\}\}/)
    expect(words).toContain('Subject Hi Ada')
    expect(words).toContain('The tags show a sample — your own name, the first tier, made-up points — as your test email has them.')
    expect(html).toContain('data-sample=""')
    expect(text(render(manager, draft()))).not.toContain('The tags show a sample')
  })

  it('made in the full admin with an image or its own HTML, is shown read-only with the way there', () => {
    const html = render(manager, draft({ editable_here: false, body_blocks: null }))
    const words = text(html)
    expect(words).toContain('This draft was made in the full admin with parts this workspace does not edit')
    expect(html).toContain('href="/campaigns?tab=email"')
    expect(html).toContain('<iframe')
    expect(words).not.toContain('Save draft')
    expect(words).not.toContain('Send…')
    expect(words).toContain('Duplicate')
    expect(words).toContain('Delete draft')
  })
})

describe('A campaign that went out', () => {
  it('while sending shows its progress and Stop sending', () => {
    const html = render(manager, draft({ status: 'sending', recipient_count: 400, sent_count: 100, failed_count: 4, sent_by: 'Ada', last_progress_at: '2026-10-21T08:00:00+00:00' }))
    const words = text(html)
    expect(words).toContain('Sending')
    expect(words).toContain('Sent 100 Failed 4 Of 400')
    expect(html).toContain('aria-valuenow="26"')
    expect(words).toContain('This page updates every 10 seconds.')
    expect(words).toContain('Sent by Ada')
    expect(words).toContain('Stop sending')
    expect(words).not.toContain('Delete draft')
    expect(words).not.toContain('Save draft')
  })

  it('once sent says when, and who it was handed but did not mail', () => {
    const words = text(render(manager, draft({ status: 'sent', recipient_count: 400, sent_count: 395, failed_count: 2, sent_at: '2026-10-21T08:00:00+00:00' })))
    expect(words).toContain('Sent Oct 21, 11:00.')
    expect(words).toContain('3 were not emailed: they withdrew their consent or unsubscribed after it started, or their address was blocked after a bounce or a complaint.')
    expect(words).not.toContain('Stop sending')
    expect(words).toContain('Duplicate')
  })

  it('cancelled or stopped says how many went out first', () => {
    expect(text(render(manager, draft({ status: 'cancelled', recipient_count: 400, sent_count: 200 })))).toContain('Cancelled: 200 were sent before it stopped.')
    expect(text(render(manager, draft({ status: 'failed', recipient_count: 400, sent_count: 300 })))).toContain('Sending stopped before the end: 300 were sent, the rest were not.')
  })
})

describe('Who may see a campaign', () => {
  it('staff are told it is a manager\'s; without the plan it says so', () => {
    expect(text(render(can(), draft()))).toContain('Only an owner or a manager can work with campaigns and segments.')
    expect(text(render(can(), draft()))).not.toContain('Our autumn')
    expect(text(render(manager, draft(), false))).toContain('Your plan does not include email campaigns.')
  })

  it('waits for the campaign with a quiet stand-in', () => {
    expect(render(manager, null)).toContain('Loading…')
  })
})

describe('The confirmation', () => {
  const dialog = (audience: Audience | null, unknown: string[] = []) => {
    const client = new QueryClient()
    if (audience) client.setQueryData(audienceKey(7), { audience })
    return renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <LoyaltyContext.Provider value={{ data: boot(manager, true), isLoading: false, isError: false, error: null, refetch: () => {} }}>
          <SendDialog campaign={draft({ unknown_tags: unknown })} onClose={() => {}} />
        </LoyaltyContext.Provider>
      </QueryClientProvider>,
    )
  }
  const audience = (more: Partial<Audience> = {}): Audience => ({
    segment: { id: 3, name: 'Gold' }, members: 1200, reached: 950, unsubscribed: 50, no_consent: 180, suppressed: 20, no_email: 0, limit: 5000, ...more,
  })

  it('names how many it will email, how many will not get it and why, and the button carries the number', () => {
    const html = dialog(audience(), ['{{name}}', '{{ first_name }}'])
    const words = text(html)
    expect(words).toContain('It will email 950 members of Gold, starting now, under the venue’s name, each with an unsubscribe link.')
    expect(words).toContain('250 of its 1,200 members will not get it:')
    expect(words).toContain('180 have not agreed to marketing email, or switched email off')
    expect(words).toContain('50 unsubscribed')
    expect(words).toContain('20 have an address that bounced or complained, which is never emailed')
    expect(words).not.toContain('have no email address')
    expect(words).toContain('The email holds {{name}}, {{ first_name }}, which no tag fills: members will read it as written.')
    expect(text(dialog(audience()))).not.toContain('which no tag fills')
    expect(words).toContain('emails already sent cannot be taken back')
    expect(button(html, 'Send to 950 members')).toContain('Send to 950 members')
    // Release 4: now or later; now is chosen first.
    expect(html).toMatch(/<input type="radio"[^>]*checked=""[^>]*value="now"/)
    expect(words).toContain('Send later')
    expect(html).not.toContain('type="datetime-local"')
  })

  it('offers no Send when nobody can receive it, or more than one campaign may reach', () => {
    const nobody = dialog(audience({ reached: 0, members: 30, no_consent: 30, unsubscribed: 0, suppressed: 0 }))
    expect(text(nobody)).toContain('Nobody in Gold can receive it.')
    expect(nobody).not.toContain('Send to')
    const over = dialog(audience({ reached: 6000, members: 6000, no_consent: 0, unsubscribed: 0, suppressed: 0 }))
    expect(text(over)).toContain('It would reach 6,000 members, more than 5,000, the most one campaign may. Narrow the segment.')
    expect(over).not.toContain('Send to')
  })

  it('counts before it offers anything', () => {
    const html = dialog(null)
    expect(text(html)).toContain('Counting who it will reach…')
    expect(html).not.toContain('Send to')
  })
})
