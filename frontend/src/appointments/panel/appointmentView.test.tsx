import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { AppointmentView } from './AppointmentView'
import { ActionConfirm } from './ActionConfirm'
import type { ActionInfo, ActionKey, AppointmentDetail } from '../lib/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      const values = vars ?? (typeof fallback === 'object' ? fallback : {}) ?? {}
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String(values[name] ?? ''))
    },
    i18n: { language: 'en' },
  }),
}))
vi.mock('react-router-dom', () => ({ Link: ({ to, children }: { to: string; children: unknown }) => <a href={to}>{children as never}</a> }))

const NONE = { payment: 'none', points: null, coupon: 'none', message: 'none' } as const
const act = (key: ActionKey, allowed: boolean, c: Partial<ActionInfo['consequences']> = {}): ActionInfo => ({ key, allowed, consequences: { ...NONE, ...c } })

const booking: AppointmentDetail = {
  id: 7, reference: 'SVC-ABCD1234', start: '2026-10-06T10:00', end: '2026-10-06T11:00', duration_minutes: 60,
  service: { id: 3, name: 'Haircut & Styling' }, master: { id: 1, name: 'Emma' },
  client: { id: 5, name: 'Sophie Williams', phone: '+44 7700 900123', email: null, member: { id: 9, number: 'HL-9', tier: 'Gold', points: 120 } },
  status: 'confirmed', revision: 'abc',
  payment: { state: 'not_paid_online', raw: 'unpaid', amount: 45, refunded_amount: null, carries_card_payment: false, currency: 'GBP' },
  price: { total: 45, list: 50, discount_label: 'Gold 10%', currency: 'GBP' },
  source: 'phone', notes: { customer: null, staff: 'Prefers quiet' },
  actions: [
    act('confirm', false), act('start', true), act('complete', true, { points: { points: 450, reason: null } }),
    act('no_show', true), act('cancel', true),
    act('award_points', false), act('move', true),
  ],
  loyalty: { member: { id: 9, number: 'HL-9', tier: 'Gold', points: 120 }, benefits: [{ name: 'Priority booking', display: 'Book 30 days ahead', description: null }], points_on_bookings: true, awarded: null },
  history: [{ at: '2026-10-05T09:15:00+00:00', actor: 'Vitalij K', action: 'service_booking.created', description: 'Created', changes: { old: null, new: null } }],
}

function view(overrides: Partial<AppointmentDetail> = {}, extra: Partial<Parameters<typeof AppointmentView>[0]> = {}) {
  return renderToStaticMarkup(
    <AppointmentView booking={{ ...booking, ...overrides }} zone="Europe/London" locale="en-GB" saving={false} error={null} outcome={null} onAction={() => {}} {...extra} />,
  )
}

describe('AppointmentView', () => {
  it('keeps appointment, payment and loyalty as three separate statements', () => {
    const html = view()
    expect(html).toContain('appointments.status.confirmed')
    expect(html).toContain('appointments.payment.not_paid_online')
    expect(html).toContain('Completing awards 450 points')
    expect(html).toContain('10:00 – 11:00')
    expect(html).toMatch(/£45[.,]00/) // the admin's money() uses the machine's number format
    expect(html).toContain('Gold 10%')
  })

  it('shows the client\'s real membership and its benefits', () => {
    const html = view()
    expect(html).toContain('HL-9')
    expect(html).toContain('Gold')
    expect(html).toContain('120')
    expect(html).toContain('Priority booking')
    expect(html).toContain('href="/appointments/clients/5"')
  })

  it('offers only the actions the server allows', () => {
    const html = view()
    for (const label of ['Arrived', 'Complete', 'No-show', 'Cancel appointment', 'Move']) expect(html).toContain(label)
    expect(html).not.toContain('Mark paid at venue') // Part E: Take payment instead
    expect(html).not.toContain('>Confirm<')
    expect(html).not.toContain('Award points')
  })

  it('has one primary action — the next step — however many the server allows', () => {
    const primary = (html: string) => [...html.matchAll(/<button[^>]*class="(?:[^"]*\s)?bg-a-accent(?:\s[^"]*)?"[^>]*>([^<]*)</g)].map(m => m[1])
    expect(primary(view())).toEqual(['Arrived'])
    expect(primary(view({ status: 'in_progress', actions: booking.actions.map(a => (a.key === 'start' ? { ...a, allowed: false } : a)) }))).toEqual(['Complete'])
    expect(primary(view({ status: 'pending', actions: booking.actions.map(a => (a.key === 'confirm' ? { ...a, allowed: true } : a)) }))).toEqual(['Confirm'])
  })

  it('names the client once', () => {
    expect((view().match(/Sophie Williams/g) ?? []).length).toBe(1)
  })

  it('prints a benefit once when its display says the same as its name', () => {
    const same = view({ loyalty: { ...booking.loyalty!, benefits: [{ name: '10% off retail', display: '10% off retail', description: null }] } })
    expect((same.match(/10% off retail/g) ?? []).length).toBe(1)
    expect(view()).toContain('Book 30 days ahead') // a display that adds something is kept
  })

  it('offers nothing on a finished appointment', () => {
    const html = view({ status: 'cancelled', actions: booking.actions.map(a => ({ ...a, allowed: false })) })
    expect(html).not.toMatch(/<button/)
  })

  it('says a client is not a member, and shows no card when there is no programme', () => {
    expect(view({ loyalty: { member: null, benefits: [] } })).toContain('Not a member')
    const none = view({ loyalty: null })
    expect(none).not.toContain('Not a member')
    expect(none).not.toContain('Membership')
  })

  it('reports what the ledger awarded once the visit is completed', () => {
    const html = view({ status: 'completed', loyalty: { ...booking.loyalty!, awarded: 450 } })
    expect(html).toContain('450 points awarded for this visit')
    expect(html).not.toContain('Completing awards')
  })

  it('says points could not be awarded, and offers to run the award again', () => {
    const html = view(
      { status: 'completed', actions: booking.actions.map(a => (a.key === 'award_points' ? { ...a, allowed: true } : { ...a, allowed: false })) },
      { outcome: { awarded: 0, reason: 'failed' } },
    )
    expect(html).toContain('the points could not be awarded just now')
    expect(html).toContain('Award points')
  })

  it('tells the operator when someone else changed the appointment', () => {
    expect(view({}, { error: { code: 'stale', message: 'This appointment was changed by someone else.' } })).toContain('changed by someone else')
  })

  it('lists who changed it and when, in the venue\'s time', () => {
    const html = view()
    expect(html).toContain('Vitalij K')
    expect(html).toContain('10:15') // 09:15 UTC is 10:15 in London on 5 October
  })
})

describe('ActionConfirm', () => {
  const confirm = (action: ActionInfo, reason = '') => renderToStaticMarkup(
    <ActionConfirm booking={booking} action={action} reason={reason} saving={false} error={null} tell onTell={() => {}} onReason={() => {}} onConfirm={() => {}} onBack={() => {}} />,
  )

  it('states every consequence before the button', () => {
    const html = confirm(act('cancel', true, { payment: 'captured_not_refunded', coupon: 'not_returned' }))
    expect(html).toContain('The card payment is NOT refunded automatically')
    expect(html).toContain('The coupon used on this booking is not returned')
    expect(html).not.toContain('No message is sent to the client') // a cancellation asks "Tell the client" instead (Part D)
    expect(html).toContain('Reason')
    expect(html.indexOf('NOT refunded')).toBeLessThan(html.indexOf('Cancel appointment</button>'))
  })

  it('completing shows the points, not a reason field', () => {
    const html = confirm(act('complete', true, { points: { points: 450, reason: null } }))
    expect(html).toContain('Completing awards 450 points')
    expect(html).not.toContain('<textarea')
  })
})
