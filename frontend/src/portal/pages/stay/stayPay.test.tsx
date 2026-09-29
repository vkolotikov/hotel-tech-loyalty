import { describe, expect, it, vi } from 'vitest'
import { render, renderAsync } from '../book/testUtils'
import { newPayVisit, type PayVisit } from '../book/steps'
import { StayPayStep } from './StayPayStep'
import { initialStayState, type StayState } from './staySteps'
import { stayQuote, stayVenue } from './stayTestUtils'

/**
 * As for the appointment's PayStep (see pages/book/pay.test.tsx): the bounce after a confirm error, the
 * query invalidation and everything inside StripePayment live in effects and handlers this renderer never
 * runs. The decisions they apply are pure functions tested in staySteps.test.ts; the wiring is reviewed by
 * hand. `StripePayment` is lazy, so a test that reaches it sees the Suspense fallback, never the mock.
 */

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, fallback?: string | Record<string, unknown>, opts?: Record<string, unknown>) => {
      const vars = typeof fallback === 'object' ? fallback : opts
      let text = typeof fallback === 'string' ? fallback : k
      for (const [key, v] of Object.entries(vars ?? {})) text = text.replace(`{{${key}}}`, String(v))
      return text
    },
    i18n: { language: 'en' },
  }),
}))
vi.mock('../book/StripePayment', () => ({ default: () => <div data-stripe-mounted="1" /> }))
vi.mock('../../lib/portalApi', async () => {
  const actual = await vi.importActual<typeof import('../../lib/portalApi')>('../../lib/portalApi')
  const never = () => new Promise(() => {})
  return { ...actual, portalApi: { ...actual.portalApi, stayPaymentIntent: never, stayConfirm: never } }
})

const noop = () => {}
const state: StayState = { ...initialStayState, step: 'pay', checkIn: '2026-10-10', checkOut: '2026-10-12', roomId: '101', quote: stayQuote }
const online = { ...stayQuote, payment: { mode: 'online' as const, reason: null } }
const onlineVenue = { ...stayVenue, capabilities: { ...stayVenue.capabilities, payments: { services: false, stays: true, publishable_key: 'pk_test_x' } } }
const visit: PayVisit = newPayVisit((() => { let n = 0; return () => `fixed-${n++}` })())
const pay = (quote = stayQuote, v = visit) => <StayPayStep quote={quote} state={state} visit={v} onVisitChange={noop} onBack={noop} onDone={noop} />

describe('StayPayStep', () => {
  it('says which room and which nights right above the price the member is confirming', () => {
    const html = render(pay(), stayVenue)
    expect(html).toMatch(/<h2[^>]*tabindex="-1"[^>]*data-step-heading="pay"/)
    expect(html).toContain('Sea view')
    expect(html).toContain('Adults: 2 · children: 0')
    expect(html.indexOf('Sea view')).toBeLessThan(html.indexOf('Confirm stay'))
  })

  // A total above zero must not show a redundant "Nothing to pay now. Settle up when you visit." notice —
  // the breakdown's own "To pay at {{venue}}: {{amount}}" line already says it, with the amount the
  // notice never named.
  it('at the venue: the breakdown names the amount, offers confirm, and shows no separate notice', () => {
    const html = render(pay(), stayVenue)
    expect(html).toContain('To pay at Seaside Hotel')
    expect(html).toContain('193.50')
    expect(html).toContain('Confirm stay')
    expect(html).not.toContain('Settle up when you visit')
    expect(html).not.toContain('Loading secure payment')
  })

  it('online: asks for the payment intent and shows the loading copy first', () => {
    const html = render(pay(online), onlineVenue)
    expect(html).toContain('Loading secure payment')
    expect(html).not.toContain('Confirm stay')
  })

  it('online without a publishable key: card unavailable, never a blank step', () => {
    const html = render(pay(online), stayVenue)
    expect(html).toContain('Online payment is unavailable right now. Please try again in a moment.')
    expect(html).not.toContain('Loading secure payment')
    expect(html).not.toContain('Confirm stay')
  })

  it('nothing_to_pay and pay_at_venue from the payment-intent call both offer confirm without a card', async () => {
    for (const code of ['nothing_to_pay', 'pay_at_venue']) {
      const html = await renderAsync(pay(online), onlineVenue, async c => {
        await c.prefetchQuery({ queryKey: ['portal-stay-payment-intent', visit.nonce], queryFn: () => Promise.reject({ response: { status: 409, data: { error: code } } }), retry: false })
      })
      expect(html, code).toContain('Confirm stay')
    }
  })

  // The breakdown's own line follows the intent call's SPECIFIC answer, not a merged
  // "no card needed" boolean — nothing_to_pay and pay_at_venue read differently even though both skip the
  // card and offer the same Confirm button (the test just above).
  it('pay_at_venue from the payment-intent call: the breakdown names the amount', async () => {
    const html = await renderAsync(pay(online), onlineVenue, async c => {
      await c.prefetchQuery({ queryKey: ['portal-stay-payment-intent', visit.nonce], queryFn: () => Promise.reject({ response: { status: 409, data: { error: 'pay_at_venue' } } }), retry: false })
    })
    expect(html).toContain('To pay at Seaside Hotel')
    expect(html).not.toContain('Nothing to pay.')
  })

  it('nothing_to_pay from the payment-intent call: the breakdown says nothing to pay, not the amount', async () => {
    const html = await renderAsync(pay(online), onlineVenue, async c => {
      await c.prefetchQuery({ queryKey: ['portal-stay-payment-intent', visit.nonce], queryFn: () => Promise.reject({ response: { status: 409, data: { error: 'nothing_to_pay' } } }), retry: false })
    })
    expect(html).toContain('Nothing to pay.')
    expect(html).not.toContain('To pay at Seaside Hotel')
  })

  it('a payment-intent failure shows the card-unavailable notice with a retry', async () => {
    const html = await renderAsync(pay(online), onlineVenue, async c => {
      await c.prefetchQuery({ queryKey: ['portal-stay-payment-intent', visit.nonce], queryFn: () => Promise.reject({ response: { status: 503, data: { error: 'payment_unavailable' } } }), retry: false })
    })
    expect(html).toContain('Online payment is unavailable right now. Please try again in a moment.')
    expect(html).toContain('Try again')
  })

  it('a visit that already knows it needs no card never asks for an intent again', () => {
    const html = render(pay(online, { ...visit, noCard: true }), onlineVenue)
    expect(html).toContain('Confirm stay')
    expect(html).not.toContain('Loading secure payment')
  })

  it('once the card is held, the card form is gone, and never blank: a real "Confirm booking" button stands in its place', () => {
    const html = render(pay(online, { ...visit, paid: true, held: true, paymentIntentId: 'pi_1' }), onlineVenue, c => c.setQueryData(['portal-stay-payment-intent', visit.nonce], { client_secret: 's', payment_intent_id: 'pi_1', amount: 193.5, currency: 'EUR' }))
    expect(html).not.toContain('Loading secure payment')
    expect(html).not.toContain('Confirm stay')
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>[\s\S]*Confirm booking/)
  })

  // A zero total is never chargeable online — no payment-intent call at all (the
  // mocked `stayPaymentIntent` never resolves, so if it WERE called this would hang on the loading branch
  // forever) — and the copy says there is nothing to pay at all, not "settle up".
  it('a zero total, even online, never asks for a payment intent: nothing to pay, not "settle up"', () => {
    const html = render(pay({ ...online, total_amount: 0 }), onlineVenue)
    expect(html).toContain('Nothing to pay.')
    expect(html).not.toContain('Settle up')
    expect(html).toContain('Confirm stay')
    expect(html).not.toContain('Loading secure payment')
  })
})
