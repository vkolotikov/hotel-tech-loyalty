import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { AppointmentDetail, MoneyInfo } from '../lib/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en' },
  }),
}))

const { MoneyBlock } = await import('./MoneyBlock')
const { TakePaymentForm } = await import('./TakePaymentForm')
const { RefundForm } = await import('./RefundForm')
const { refundWays } = await import('./moneyLines')
const { panelReducer, CLOSED } = await import('./panelState')

const money = (over: Partial<MoneyInfo> = {}): MoneyInfo => ({
  total: 60, currency: 'EUR', held_online: 0, paid_online: 0, refunded_online: 0, paid_desk: 20, refunded_desk: 0,
  legacy_marked_paid: false, owed: 40, to_refund: 0, refundable_online: 0, refundable_desk: 20, paid_in: 20, paid_back: 0, can_take: true,
  movements: [{ id: 1, kind: 'payment', method: 'cash', amount: 20, currency: 'EUR', note: null, by: 'Mara', at: '2026-10-05T06:00:00+00:00' }],
  ...over,
})
const booking = (m: MoneyInfo) => ({ id: 1, revision: 'r', money: m, client: { name: 'Sophie' } }) as unknown as AppointmentDetail

describe('MoneyBlock', () => {
  it('says what was paid, how, by whom, and what is still owed', () => {
    const html = renderToStaticMarkup(<MoneyBlock money={money()} locale="en" zone="Europe/Riga" />)
    expect(html).toContain('Paid at the desk')
    expect(html).toContain('Still owed')
    expect(html).toContain('Cash')
    expect(html).toContain('by Mara')
  })

  it('names an older booking marked paid, a card held online, and money left to refund', () => {
    expect(renderToStaticMarkup(<MoneyBlock money={money({ legacy_marked_paid: true, movements: [], paid_desk: 0, owed: 0 })} locale="en" zone="UTC" />)).toContain('Marked paid (no amount recorded)')
    expect(renderToStaticMarkup(<MoneyBlock money={money({ held_online: 60, owed: 0, paid_desk: 0, movements: [] })} locale="en" zone="UTC" />)).toContain('Card held online')
    expect(renderToStaticMarkup(<MoneyBlock money={money({ to_refund: 20, owed: 0 })} locale="en" zone="UTC" />)).toContain('to refund')
  })
})

describe('the forms', () => {
  it('Take payment starts at what is owed and offers the four desk methods', () => {
    const html = renderToStaticMarkup(<TakePaymentForm booking={booking(money())} saving={false} error={null} onSave={() => {}} onBack={() => {}} />)
    expect(html).toContain('value="40"')
    for (const m of ['Cash', 'Card at the desk', 'Bank transfer', 'Other']) expect(html, m).toContain(m)
    expect(html).not.toContain('Stripe')
  })

  it('Refund offers only the ways money can go back, each with its limit', () => {
    expect(refundWays(money())).toEqual(['cash', 'card_desk', 'transfer', 'other'])
    expect(refundWays(money({ refundable_desk: 0, refundable_online: 60, paid_online: 60 }))).toEqual(['online_card'])
    expect(refundWays(money({ refundable_desk: 0 }))).toEqual([])
    const html = renderToStaticMarkup(<RefundForm booking={booking(money({ refundable_online: 60, paid_online: 60 }))} saving={false} error={null} onSave={() => {}} onBack={() => {}} />)
    expect(html).toContain('Card, through Stripe')
    expect(html).toContain('Reason')
  })

  it('a desk refund can say the entry was a mistake, so the money is owed again; a card refund cannot', () => {
    const desk = renderToStaticMarkup(<RefundForm booking={booking(money({ correctable_desk: 20 }))} saving={false} error={null} onSave={() => {}} onBack={() => {}} />)
    expect(desk).toContain('Entered by mistake — the client still owes this')
    const card = renderToStaticMarkup(<RefundForm booking={booking(money({ refundable_desk: 0, refundable_online: 60, paid_online: 60, correctable_desk: 0 }))} saving={false} error={null} onSave={() => {}} onBack={() => {}} />)
    expect(card).not.toContain('Entered by mistake')
  })

  it('names a correction as a correction, in the money block and in Takings', () => {
    const corrected = money({ movements: [{ id: 2, kind: 'refund', method: 'cash', amount: 20, currency: 'EUR', note: 'Was card', corrects: true, by: 'Mara', at: '2026-10-05T07:00:00+00:00' }] })
    const html = renderToStaticMarkup(<MoneyBlock money={corrected} locale="en" zone="UTC" />)
    expect(html).toContain('Correction')
    expect(html).not.toContain('>Refund<')
  })
})

describe('panel state', () => {
  it('opens the payment and refund steps from the summary and returns on done', () => {
    const view = panelReducer(CLOSED, { type: 'openView', id: 4 })
    expect(panelReducer(view, { type: 'startPay' })).toMatchObject({ sub: 'pay' })
    const refund = panelReducer(view, { type: 'startRefund' })
    expect(refund).toMatchObject({ sub: 'refund' })
    expect(panelReducer(refund, { type: 'done', outcome: null })).toMatchObject({ sub: 'summary' })
  })
})
