import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PortalContext, type PortalContextValue } from '../../PortalProvider'
import type { PortalBootstrap, PortalMember } from '../../lib/types'
import { applyMessageChange, marketingNeedsEmail, messageBody, messageKinds, preferencesOf, smsSwitch } from './messages'
import { MessagesCard } from './MessagesCard'

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
vi.mock('../../lib/portalApi', () => ({ portalApi: { updateProfile: vi.fn() }, apiMessage: (_e: unknown, f: string) => f }))

const member = (over: Partial<PortalMember> = {}): PortalMember => ({
  member_number: 'HL-1', name: 'Ada', tier: null, current_points: 0, lifetime_points: 0, referral_code: null,
  progress: { percentage: 0, points_needed: 0, next_tier: null }, recent_activity: [],
  marketing_consent: false, email_notifications: true, push_notifications: true, member_since: '2026-01-01',
  user: { id: 1, name: 'Ada', email: 'ada@example.test', phone: '+371 20000000', language: 'en' }, benefits: [],
  ...over,
})
const boot = (m: PortalMember | null, loyalty = true): PortalBootstrap => ({
  venue: { name: 'Numa', logo_url: null, industry: 'hotel', currency: 'EUR', timezone: 'Europe/Riga', contact: { email: null, phone: null },
    accent: { hex: '#b04a6e', ink: '#ffffff', deep: '#8e3b58', dark_hex: '#e38ab0', dark_ink: '#1a0b12', dark_deep: '#f0b4cd' }, display_face: 'playfair' },
  capabilities: { loyalty, services: false, stays: true, chat: true, payments: { services: false, stays: false, publishable_key: null } },
  policies: { services_cancel_hours: 24, booking_cancel_hours: 48, services_cancellation_policy: '', booking_cancellation_policy: '', check_in_time: '15:00', check_out_time: '11:00' },
  member: m, counts: { unread_notifications: 0, upcoming_bookings: 0 },
})

describe('the message settings decide', () => {
  it('which kinds a venue offers: all four with a programme, only bookings without one', () => {
    expect(messageKinds({ loyalty: true })).toEqual(['offers', 'points', 'tier', 'stays'])
    expect(messageKinds({ loyalty: false })).toEqual(['stays'])
  })

  it("the member's kinds, on wherever the server has not said otherwise", () => {
    expect(preferencesOf(member())).toEqual({ offers: true, points: true, tier: true, stays: true })
    expect(preferencesOf(member({ notification_preferences: { offers: false, points: true, tier: true, stays: false } })))
      .toEqual({ offers: false, points: true, tier: true, stays: false })
  })

  it('what one switch saves: a kind on its own (the server merges it), a channel as its own field', () => {
    expect(messageBody({ kind: 'offers', on: false })).toEqual({ notification_preferences: { offers: false } })
    expect(messageBody({ field: 'email_notifications', on: false })).toEqual({ email_notifications: false })
    expect(messageBody({ field: 'sms_consent', on: true })).toEqual({ sms_consent: true })
  })

  it('how the bootstrap reads once a save landed, leaving everything else as it was', () => {
    const b = boot(member())
    const kind = applyMessageChange(b, { kind: 'tier', on: false })
    expect(kind?.member?.notification_preferences).toEqual({ offers: true, points: true, tier: false, stays: true })
    expect(kind?.member?.email_notifications).toBe(true)
    expect(applyMessageChange(b, { field: 'push_notifications', on: false })?.member?.push_notifications).toBe(false)
    expect(applyMessageChange(boot(null), { field: 'push_notifications', on: false })).toEqual(boot(null))
    expect(applyMessageChange(undefined, { field: 'push_notifications', on: false })).toBeUndefined()
  })

  it('that offers by email need emails on to arrive', () => {
    expect(marketingNeedsEmail(member({ marketing_consent: true, email_notifications: false }))).toBe(true)
    expect(marketingNeedsEmail(member({ marketing_consent: true, email_notifications: true }))).toBe(false)
    expect(marketingNeedsEmail(member({ marketing_consent: false, email_notifications: false }))).toBe(false)
  })

  it('that "Offers by SMS" shows only once the server sends it, and needs a phone to be turned on', () => {
    expect(smsSwitch(member()).show).toBe(false)
    expect(smsSwitch(member({ sms_consent: false }))).toEqual({ show: true, on: false, needsPhone: false, disabled: false })
    const noPhone = member({ sms_consent: false, user: { id: 1, name: 'Ada', email: 'a@x.test', phone: '  ', language: 'en' } })
    expect(smsSwitch(noPhone)).toEqual({ show: true, on: false, needsPhone: true, disabled: true })
    // Always possible to turn off.
    expect(smsSwitch({ ...noPhone, sms_consent: true }).disabled).toBe(false)
  })
})

function render(m: PortalMember, loyalty = true) {
  const value: PortalContextValue = { data: boot(m, loyalty), isLoading: false, isError: false, error: null, refetch: () => {} }
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <PortalContext.Provider value={value}><MessagesCard member={m} /></PortalContext.Provider>
    </QueryClientProvider>,
  )
}

/** The switch named `label`, as rendered: aria-checked and disabled. */
function switchOf(html: string, label: string): { checked: boolean; disabled: boolean } | null {
  const m = new RegExp(`<button[^>]*role="switch"[^>]*aria-label="${label}"[^>]*>`).exec(html)
  if (!m) return null
  return { checked: m[0].includes('aria-checked="true"'), disabled: /\sdisabled=""/.test(m[0]) }
}

describe('MessagesCard', () => {
  it('shows the four kinds with their state and says what switching one off means', () => {
    const html = render(member({ notification_preferences: { offers: false, points: true, tier: true, stays: true } }))
    expect(switchOf(html, 'Offers')).toEqual({ checked: false, disabled: false })
    expect(switchOf(html, 'Points')?.checked).toBe(true)
    expect(switchOf(html, 'Your level')?.checked).toBe(true)
    expect(switchOf(html, 'Your vocab')).toBeNull()
    expect(html).toContain('is not sent to you at all: no push on your phone, and nothing in your inbox')
    expect(html).toContain('id="messages"')
  })

  it('names the bookings kind in the venue’s own word', () => {
    // useVocab() reads portal.vocab.<industry>.booking_plural; the test t() returns the key without a fallback.
    expect(render(member())).toContain('aria-label="Your portal.vocab.hotel.booking_plural"')
  })

  it('offers only the bookings kind at a venue without a programme', () => {
    const html = render(member(), false)
    expect(switchOf(html, 'Offers')).toBeNull()
    expect(switchOf(html, 'Points')).toBeNull()
  })

  it('explains push needs the app, and the email switches with their state', () => {
    const html = render(member({ email_notifications: false, marketing_consent: true }))
    expect(html).toContain('it needs the app installed and signed in')
    expect(switchOf(html, 'Emails from Numa')?.checked).toBe(false)
    expect(switchOf(html, 'Offers and news by email')?.checked).toBe(true)
    expect(html).toContain('These arrive only while emails from Numa are on.')
  })

  it('shows "Offers by SMS" once the server sends sms_consent, off until turned on', () => {
    expect(switchOf(render(member()), 'Offers by SMS')).toBeNull()
    const html = render(member({ sms_consent: false }))
    expect(switchOf(html, 'Offers by SMS')).toEqual({ checked: false, disabled: false })
    expect(html).toContain('to +371 20000000. Off until you turn it on.')
    const noPhone = render(member({ sms_consent: false, user: { id: 1, name: 'Ada', email: 'a@x.test', phone: null, language: 'en' } }))
    expect(switchOf(noPhone, 'Offers by SMS')).toEqual({ checked: false, disabled: true })
    expect(noPhone).toContain('Add your phone number above to get offers by SMS.')
  })
})
