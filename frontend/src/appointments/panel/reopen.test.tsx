import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ActionInfo, ActionKey, AppointmentDetail } from '../lib/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en' },
  }),
}))
vi.mock('react-router-dom', () => ({ Link: ({ to, children }: { to: string; children: unknown }) => <a href={to}>{children as never}</a> }))

const { AppointmentView } = await import('./AppointmentView')
const { ActionConfirm } = await import('./ActionConfirm')
const { NEEDS_CONFIRM, consequenceLines } = await import('./consequences')

const NONE = { payment: 'none', points: null, coupon: 'none', message: 'none' } as const
const act = (key: ActionKey, allowed: boolean, c: Partial<ActionInfo['consequences']> = {}): ActionInfo => ({ key, allowed, consequences: { ...NONE, ...c } })

const booking = {
  id: 7, reference: 'SVC-7', start: '2026-10-06T10:00', end: '2026-10-06T10:45', duration_minutes: 45,
  service: { id: 1, name: 'Massage' }, master: { id: 1, name: 'Mara' },
  client: { id: 5, name: 'Sophie', phone: null, email: null, member: null }, status: 'cancelled', revision: 'r',
  payment: { state: 'not_paid_online', raw: 'unpaid', amount: 60, refunded_amount: null, carries_card_payment: false, currency: 'EUR' },
  price: { total: 60, list: null, discount_label: null, currency: 'EUR' }, source: 'admin', notes: { customer: null, staff: null },
  actions: [act('reopen', true, { message: 'ask' }), act('move', false)], loyalty: null, history: [],
} as unknown as AppointmentDetail

const view = (canManage: boolean) => renderToStaticMarkup(
  <AppointmentView booking={booking} zone="Europe/London" locale="en-GB" saving={false} error={null} outcome={null} onAction={() => {}} canManage={canManage} />,
)
const confirm = (action: ActionInfo) => renderToStaticMarkup(
  <ActionConfirm booking={booking} action={action} reason="" saving={false} error={null} tell onTell={() => {}} onReason={() => {}} onConfirm={() => {}} onBack={() => {}} />,
)

describe('Reopen', () => {
  it('is a button for a manager and a line for everyone else', () => {
    expect(view(true)).toContain('>Reopen<')
    expect(view(false)).not.toContain('>Reopen<')
    expect(view(false)).toContain('A manager can reopen it.')
  })

  it('says money went back instead of offering Reopen once it did', () => {
    // Polish F3: the server no longer offers reopen for such a visit; the panel says why, to everyone.
    const refunded = { ...booking, actions: [act('reopen', false), act('move', false)] } as unknown as AppointmentDetail
    for (const canManage of [true, false]) {
      const html = renderToStaticMarkup(<AppointmentView booking={refunded} zone="Europe/London" locale="en-GB" saving={false} error={null} outcome={null} onAction={() => {}} canManage={canManage} />)
      expect(html).not.toContain('>Reopen<')
      expect(html).not.toContain('A manager can reopen it.')
      expect(html).toContain('Money was given back for this visit — book it again instead.')
    }
  })

  it('says to book the client again when the time was taken since, never "choose another"', () => {
    // Polish F4: the workspace's slot_taken words offer a choice this dialog does not have.
    const html = renderToStaticMarkup(<ActionConfirm booking={booking} action={act('reopen', true)} reason="" saving={false}
      error={{ code: 'slot_taken', message: 'That time is not free. Choose another.' }} tell onTell={() => {}} onReason={() => {}} onConfirm={() => {}} onBack={() => {}} />)
    expect(html).toContain('That time is taken now — book the client again at another time.')
    expect(html).not.toContain('Choose another')
  })

  it('is confirmed first, says what it does, and asks about the client only for a cancellation', () => {
    expect(NEEDS_CONFIRM.has('reopen')).toBe(true)
    const asks = confirm(act('reopen', true, { message: 'ask' }))
    expect(asks).toContain('The visit goes back to Confirmed at its own time.')
    expect(asks).toContain('No email address') // the box, for a client with no address
    const quiet = confirm(act('reopen', true))
    expect(quiet).toContain('No message is sent to the client.')
    expect(quiet).not.toContain('No email address')
    expect(consequenceLines(act('reopen', true)).map(l => l.key)).toContain('appointments.consequence.reopen')
  })
})
