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
import { DetailsCard } from '../member/DetailsCard'
import type { MemberProfile } from '../membership/types'
import type { Bootstrap, Can } from '../lib/types'
import { SEGMENTS_KEY, smsAudienceKey, smsKey, smsListKey } from './api'
import { SmsSendDialog } from './SmsSendDialog'
import type { Sms, SmsAudience, SmsOptions, SmsPage, TwilioReadiness } from './types'

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
const ready: TwilioReadiness = { ready: true, missing: [], wrong: [], from: '+15005550006' }
const notReady: TwilioReadiness = { ready: false, missing: ['auth_token'], wrong: ['phone_number'], from: null }
const options = (twilio: TwilioReadiness = ready): SmsOptions => ({
  tags: [{ tag: '{{first_name}}', name: 'first_name', label: 'Member first name' }, { tag: '{{hotel_name}}', name: 'hotel_name', label: 'Hotel name' }],
  known_tags: ['{{first_name}}', '{{hotel_name}}'],
  sample: { '{{first_name}}': 'Ada', '{{hotel_name}}': 'Lumière' },
  max_name: 120, max_body: 918, limit: 5000, gsm: { single: 160, part: 153 }, ucs2: { single: 70, part: 67 }, twilio,
})
const none = { sent: 0, failed: 0, skipped: 0, pending: 0 }
const length = { encoding: 'gsm7' as const, units: 30, segments: 1, per_segment: 160, unicode: [] }
const sms = (more: Partial<Sms> = {}): Sms => ({
  id: 7, name: 'Autumn', excerpt: 'Hi {{first_name}}, double points.', status: 'draft', segment: { id: 3, name: 'Gold' }, recipient_count: 0, results: none,
  segments_sent: 0, scheduled_at: null, scheduled_for: null, sent_at: null, created_at: '2026-10-20T08:00:00+00:00', updated_at: '2026-10-20T09:00:00+00:00',
  body: 'Hi {{first_name}}, double points.', segment_id: 3, missing: [], length, preview: 'Hi Ada, double points.', preview_length: length, unknown_tags: [],
  problem: null, failures: [], last_progress_at: null, created_by: 'Ada', sent_by: null, revision: '2026-10-20T09:00:00+00:00', ...more,
})
const list = (twilio: TwilioReadiness = ready): SmsPage => ({
  page: 1, pages: 1, total: 3, twilio,
  messages: [
    sms(),
    sms({ id: 6, name: 'Summer', status: 'sent', recipient_count: 300, results: { ...none, sent: 290, failed: 10 }, segments_sent: 310, sent_at: '2026-08-01T10:00:00+00:00' }),
    sms({ id: 5, name: 'Weekend', status: 'scheduled', scheduled_at: '2026-10-24T07:00:00+00:00', scheduled_for: '2026-10-24T10:00' }),
  ],
})
const segments = [{ id: 3, name: 'Gold', members: 1200, problem: null }]

const render = (c: Can, path: string, feature = true, more?: (client: QueryClient) => void, twilio: TwilioReadiness = ready) => {
  const client = new QueryClient()
  client.setQueryData(smsListKey(1), list(twilio))
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

describe('SMS campaigns (spec 2026-10-22 release 4 §5)', () => {
  it('is the fourth tab and lists every campaign with its segment, status and how far it got', () => {
    const html = render(manager, '/loyalty/campaigns?tab=sms')
    const words = text(html)
    expect(html).toContain('id="campaigns-tab-sms" aria-selected="true"')
    expect(words).toContain('New SMS')
    expect(words).toContain('Autumn Hi {{first_name}}, double points. Gold')
    expect(words).toContain('290 of 300 sent')
    expect(words).toContain('Goes out Sat, Oct 24, 10:00')
    expect(words).toContain('Scheduled')
    expect(html).toContain('href="/loyalty/campaigns?tab=sms&amp;message=6"')
    expect(html).not.toContain('data-twilio-setup')
  })

  it('says what to set and where while the venue\'s Twilio account is not set up', () => {
    const words = text(render(manager, '/loyalty/campaigns?tab=sms', true, undefined, notReady))
    expect(words).toContain('SMS goes out through the venue’s own Twilio account, which is not set up yet.')
    expect(words).toContain('Settings → Integrations → Twilio')
    expect(words).toContain('Twilio Auth Token: not set yet')
    expect(words).toContain('Twilio Phone Number: not in a form Twilio takes')
    expect(render(manager, '/loyalty/campaigns?tab=sms', true, undefined, notReady)).toContain('href="/settings?tab=integrations"')
  })

  it('says calmly that the plan has no campaigns, and staff see neither the tab nor a campaign', () => {
    expect(text(render(manager, '/loyalty/campaigns?tab=sms', false))).toContain('Your plan does not include campaigns, so SMS campaigns are not available either.')
    const staff = render(can(), '/loyalty/campaigns?tab=sms&message=7')
    expect(staff).not.toContain('role="tab"')
    expect(text(staff)).not.toContain('double points')
  })

  it('opens a draft with the tag bar, the length as the networks count it, the phone preview with the sample, and who it reaches with its SMS parts', () => {
    const html = render(manager, '/loyalty/campaigns?tab=sms&message=7', true, (client) => {
      client.setQueryData(smsKey(7), { sms: sms(), options: options() })
      client.setQueryData(smsAudienceKey(7), { audience: { segment: { id: 3, name: 'Gold' }, members: 1200, reached: 800, no_consent: 300, no_phone: 60, bad_phone: 30, same_phone: 10, segments: 820, limit: 5000 } })
    })
    const words = text(html)
    expect(words).toContain('All SMS campaigns')
    expect(words).toContain('Tags')
    expect(words).toContain('First name')
    expect(words).toContain('Venue name')
    expect(words).toContain('33 of 918 characters · 1 SMS (up to 160 characters each) · Standard SMS alphabet')
    expect(html).toContain('data-sms-preview=""')
    expect(words).toContain('Hi Ada, double points.')
    expect(words).toContain('+15005550006')
    expect(words).toContain('It would reach 800 of the 1,200 members of Gold now: 820 SMS in all.')
    expect(words).toContain('300 have not turned on offers by SMS')
    expect(words).toContain('30 have a number without its country code')
    expect(words).toContain('10 share a number with another member it reaches')
    expect(words).toContain('Reply STOP to opt out')
    expect(html).not.toContain('data-blockers')
  })

  it('names the characters that make a draft Unicode, and holds Send until Twilio is set up', () => {
    const html = render(manager, '/loyalty/campaigns?tab=sms&message=7', true, (client) => {
      client.setQueryData(smsKey(7), { sms: sms({ body: 'It’s on 🎉' }), options: options(notReady) })
    }, notReady)
    const words = text(html)
    expect(html).toContain('data-unicode=""')
    expect(words).toContain('These characters make it Unicode, which fits fewer characters in each SMS: ’ 🎉')
    expect(words).toContain('Set up the venue’s Twilio account first.')
    expect(html).toContain('data-twilio-setup=""')
  })

  it('shows a sent campaign\'s numbers, its SMS parts and why Twilio refused some', () => {
    const words = text(render(manager, '/loyalty/campaigns?tab=sms&message=6', true, (client) => {
      client.setQueryData(smsKey(6), {
        sms: sms({ id: 6, status: 'sent', recipient_count: 300, results: { ...none, sent: 290, failed: 10 }, segments_sent: 310, sent_at: '2026-08-01T10:00:00+00:00',
          failures: [{ reason: 'twilio_21408', count: 7 }, { reason: 'twilio_99999', count: 2 }, { reason: 'unreachable', count: 1 }] }),
        options: options(),
      })
    }))
    expect(words).toContain('How far it got')
    expect(words).toContain('SMS parts 310')
    expect(words).toContain('Not sent: 10')
    expect(words).toContain('7: Sending to this country is not switched on in Twilio')
    expect(words).toContain('2: Twilio refused it (twilio_99999).')
    expect(words).toContain('1: Twilio could not be reached.')
  })

  it('shows a scheduled campaign\'s time on the venue\'s clock with Change time and Take back', () => {
    const words = text(render(manager, '/loyalty/campaigns?tab=sms&message=5', true, (client) => {
      client.setQueryData(smsKey(5), { sms: sms({ id: 5, status: 'scheduled', scheduled_at: '2026-10-24T07:00:00+00:00', scheduled_for: '2026-10-24T10:00', sent_by: 'Ada' }), options: options() })
    }))
    expect(words).toContain('It goes out Sat, Oct 24, 10:00, on the venue’s clock.')
    expect(words).toContain('Scheduled by Ada')
    expect(words).toContain('Change time')
    expect(words).toContain('Take back to a draft')
    expect(words).not.toContain('How far it got')
  })

  it('says why a scheduled one did not start, and why Twilio stopped another', () => {
    const late = text(render(manager, '/loyalty/campaigns?tab=sms&message=5', true, (client) => {
      client.setQueryData(smsKey(5), { sms: sms({ id: 5, status: 'failed', problem: 'not_ready', scheduled_for: '2026-10-24T10:00' }), options: options() })
    }))
    expect(late).toContain('It was due Sat, Oct 24, 10:00 but did not start: the venue’s Twilio account was not set up.')
    const stopped = text(render(manager, '/loyalty/campaigns?tab=sms&message=6', true, (client) => {
      client.setQueryData(smsKey(6), { sms: sms({ id: 6, status: 'failed', problem: 'twilio_20003', recipient_count: 300, results: { ...none, sent: 40 } }), options: options() })
    }))
    expect(stopped).toContain('Sending stopped before the end: 40 were sent')
    expect(stopped).toContain('Twilio refused the Account SID or the Auth Token.')
  })
})

describe('The SMS confirmation', () => {
  const dialog = (audience: SmsAudience | null) => {
    const client = new QueryClient()
    if (audience) client.setQueryData(smsAudienceKey(7), { audience })
    return renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <LoyaltyContext.Provider value={{ data: boot(manager), isLoading: false, isError: false, error: null, refetch: () => {} }}>
          <SmsSendDialog sms={sms()} onClose={() => {}} />
        </LoyaltyContext.Provider>
      </QueryClientProvider>,
    )
  }
  const audience: SmsAudience = { segment: { id: 3, name: 'Gold' }, members: 1200, reached: 800, no_consent: 400, no_phone: 0, bad_phone: 0, same_phone: 0, segments: 830, limit: 5000 }

  it('names who it texts, the SMS parts that come to, who is left out and why, with Not now first', () => {
    const html = dialog(audience)
    const words = text(html)
    expect(words).toContain('It will text 800 members of Gold, starting now.')
    expect(words).toContain('That is 830 SMS in all: some copies are longer than one SMS, and each part is billed.')
    expect(words).toContain('400 have not turned on offers by SMS')
    expect(words).toContain('Twilio bills the venue for each SMS part.')
    expect(html.indexOf('Not now')).toBeLessThan(html.indexOf('Text 800 members'))
    expect(html).toMatch(/<input type="radio"[^>]*checked=""[^>]*value="now"/)
    expect(text(dialog({ ...audience, segments: 800 }))).toContain('That is 800 SMS in all, one each.')
  })

  it('offers nothing to send when nobody can receive it, and counts first', () => {
    expect(text(dialog({ ...audience, reached: 0 }))).toContain('Nobody in Gold can receive it.')
    expect(dialog({ ...audience, reached: 0 })).not.toContain('Text 0 members')
    expect(text(dialog(null))).toContain('Counting who it will reach…')
  })
})

describe('A member\'s details', () => {
  it('show whether the member turned on offers by SMS', () => {
    const member = { id: 1, name: 'Ada', email: 'ada@example.test', phone: '+44 20 7946 0958', member_number: 'LS-1', tier: null, current_points: 0, lifetime_points: 0,
      is_active: true, joined_at: null, last_activity_at: null, qualifying_points: 0, referral_code: null, language: null, nationality: null, date_of_birth: null,
      marketing_consent: false, sms_consent: true, tier_override_until: null, is_erased: false } as unknown as MemberProfile
    const on = text(renderToStaticMarkup(<DetailsCard member={member} locale="en" timeZone="Europe/Riga" />))
    expect(on).toContain('Offers by SMS Turned on by the member')
    const off = text(renderToStaticMarkup(<DetailsCard member={{ ...member, sms_consent: false }} locale="en" timeZone="Europe/Riga" />))
    expect(off).toContain('Offers by SMS Off')
  })
})
