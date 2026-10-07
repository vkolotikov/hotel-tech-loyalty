import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ActionInfo, AppointmentDetail, DepositConsequence, MoneyInfo } from '../lib/types'
import { money as fmt } from '../../lib/money'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en' },
  }),
}))
vi.mock('../lib/vocab', () => ({ useVocab: () => (k: string) => k }))

const { ActionConfirm } = await import('./ActionConfirm')
const { consequenceLines } = await import('./consequences')
const { refundDefaultsFor } = await import('./panelState')

const deposit = (code: DepositConsequence['code']): DepositConsequence => ({ code, amount: 12, currency: 'EUR', cancel_hours: 24 })
const action = (key: 'cancel' | 'no_show', d: DepositConsequence | null): ActionInfo => ({
  key, allowed: true, consequences: { payment: 'none', points: null, coupon: 'none', message: key === 'cancel' ? 'ask' : 'none', deposit: d },
})
const money = (over: Partial<MoneyInfo>): MoneyInfo => ({
  total: 60, currency: 'EUR', held_online: 0, paid_online: 12, refunded_online: 0, paid_desk: 0, refunded_desk: 0, legacy_marked_paid: false,
  owed: 48, to_refund: 0, refundable_online: 12, refundable_desk: 0, paid_in: 12, paid_back: 0, can_take: true, movements: [],
  deposit: { amount: 12, percent: 20, cancel_hours: 24, refund_until: '2026-10-05T10:00:00+00:00' }, ...over,
})

describe('the deposit line', () => {
  it('says the deposit goes back when cancelled in time, in place of the payment line', () => {
    const lines = consequenceLines(action('cancel', deposit('goes_back')))
    expect(lines[0]).toMatchObject({ key: 'appointments.consequence.deposit.goes_back', tone: 'plain', vars: { amount: fmt(12, 'EUR') } })
    expect(lines.map(l => l.key)).not.toContain('appointments.consequence.payment.none')
  })

  it('warns that the venue keeps it when cancelled late, naming the window', () => {
    expect(consequenceLines(action('cancel', deposit('kept_late')))[0]).toMatchObject({
      key: 'appointments.consequence.deposit.kept_late', tone: 'warning', vars: { amount: fmt(12, 'EUR'), hours: 24 },
    })
  })

  it('warns that the venue keeps it on a no-show', () => {
    expect(consequenceLines(action('no_show', deposit('kept')))[0].key).toBe('appointments.consequence.deposit.kept')
  })

  it('leaves a booking without a deposit as before', () => {
    expect(consequenceLines(action('cancel', null))[0].key).toBe('appointments.consequence.payment.none')
  })
})

describe('the cancel sheet with a deposit', () => {
  it('starts the card refund at nothing, so a kept deposit never goes back by accident', () => {
    expect(refundDefaultsFor(money({}))).toEqual({ online: '0', desk: '0', deskMethod: 'cash' })
    expect(refundDefaultsFor(money({ deposit: null, paid_online: 60, refundable_online: 60 }))).toEqual({ online: '60', desk: '0', deskMethod: 'cash' })
    expect(refundDefaultsFor(undefined)).toEqual({ online: '0', desk: '0', deskMethod: 'cash' })
  })

  it('does not tell staff that a manager must refund what the deposit rule takes care of', () => {
    const booking = { id: 1, client: { name: 'Sophie' }, client_email: null, start: '2026-10-06T10:00', end: '2026-10-06T10:45', money: money({}) } as unknown as AppointmentDetail
    const html = renderToStaticMarkup(
      <ActionConfirm booking={booking} action={action('cancel', deposit('goes_back'))} reason="" saving={false} error={null} tell={false} onTell={() => {}}
        canManage={false} onReason={() => {}} onConfirm={() => {}} onBack={() => {}} />,
    )
    expect(html).toContain('goes back to the client')
    expect(html).not.toContain('a manager can refund it')
  })
})
