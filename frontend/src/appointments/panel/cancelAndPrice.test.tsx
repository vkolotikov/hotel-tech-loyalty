import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ActionInfo, AppointmentDetail, MoneyInfo, PriceQuote } from '../lib/types'

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
const { CreateForm } = await import('./CreateForm')
const { emptyDraft, draftBody } = await import('./panelState')

const money = (over: Partial<MoneyInfo>): MoneyInfo => ({ total: 60, currency: 'EUR', held_online: 0, paid_online: 0, refunded_online: 0, paid_desk: 0, refunded_desk: 0, legacy_marked_paid: false, owed: 60, to_refund: 0, refundable_online: 0, refundable_desk: 0, paid_in: 0, paid_back: 0, can_take: true, movements: [], ...over })
const cancel: ActionInfo = { key: 'cancel', allowed: true, consequences: { payment: 'none', points: null, coupon: 'none', message: 'ask' } }
const booking = (m: MoneyInfo) => ({ id: 1, client: { name: 'Sophie' }, client_email: null, start: '2026-10-06T10:00', end: '2026-10-06T10:45', money: m }) as unknown as AppointmentDetail
const confirm = (m: MoneyInfo, canManage: boolean) => renderToStaticMarkup(
  <ActionConfirm booking={booking(m)} action={cancel} reason="" saving={false} error={null} tell={false} onTell={() => {}}
    canManage={canManage} refunds={{ online: String(m.refundable_online), desk: String(m.refundable_desk), deskMethod: 'cash' }} onRefunds={() => {}}
    onReason={() => {}} onConfirm={() => {}} onBack={() => {}} />,
)

describe('Cancel with refund', () => {
  it('offers a manager the card and the desk lines, filled with everything refundable', () => {
    const html = confirm(money({ paid_online: 60, refundable_online: 60, paid_desk: 10, refundable_desk: 10 }), true)
    expect(html).toContain('Refund the card (through Stripe)')
    expect(html).toContain('value="60"')
    expect(html).toContain('Give back at the desk')
    expect(html).toContain('value="10"')
  })

  it('tells staff a manager can refund, and asks nothing when nothing was paid', () => {
    expect(confirm(money({ paid_desk: 45, refundable_desk: 45 }), false)).toContain('a manager can refund it')
    expect(confirm(money({}), true)).not.toContain('Money back')
  })
})

describe('New appointment price', () => {
  const quote: PriceQuote = { list_amount: 60, discount: { amount: 6, label: 'Gold 10%', source: 'tier_benefit' }, coupon: null, total_amount: 54, currency: 'EUR', member: true }
  const sophie = { id: 5, name: 'Sophie', phone: null, email: null, member: { id: 9, number: 'HL-9', tier: 'Gold', points: 0 } }
  const render = (extra: Record<string, unknown>) => renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <CreateForm draft={{ ...emptyDraft('2026-10-06'), masterId: 1, serviceId: 3, client: sophie, time: '10:00' }} masters={[{ id: 1, name: 'Mara', title: null, avatar: null, days: {} }]}
        services={[{ id: 3, name: 'Cut', duration_minutes: 45, buffer_after_minutes: 0, price: 60, currency: 'EUR', master_ids: [1] }]}
        slots={{ slots: [{ start: '2026-10-06T10:00', end: '2026-10-06T10:45', label: '10:00' }], duration_minutes: 45, price: 60, currency: 'EUR' }}
        slotsLoading={false} today="2026-10-06" saving={false} error={null} onEdit={() => {}} onSave={() => {}} tell={false} onTell={() => {}}
        quote={quote} coupons={[{ kind: 'offer', coupon: { member_offer_id: 7 }, label: 'Summer 15' }]} onResolveCode={async () => {}} {...extra} />
    </QueryClientProvider>,
  )

  it('shows the list price, the member discount, the total and the members coupons', () => {
    const html = render({})
    expect(html).toContain('Gold 10%')
    expect(html).toContain('Summer 15')
    expect(html).toContain('No coupon')
  })

  it('sends the chosen coupon with the booking', () => {
    const body = draftBody({ ...emptyDraft('2026-10-06'), time: '10:00', masterId: 1, serviceId: 3, client: sophie, coupon: { member_offer_id: 7 } })
    expect(body).toMatchObject({ coupon: { member_offer_id: 7 } })
    expect(draftBody({ ...emptyDraft('2026-10-06'), time: '10:00', masterId: 1, serviceId: 3, client: sophie })).not.toHaveProperty('coupon')
  })
})
