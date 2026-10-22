import { describe, expect, it, vi } from 'vitest'
import { base, render, renderAsync } from './testUtils'
import { PayReturnBody, type PayReturnBodyProps } from './PayReturn'
import { PayStep } from './PayStep'
import { StayPayStep } from '../stay/StayPayStep'
import { initialState, newPayVisit } from './steps'
import { initialStayState, type StayState } from '../stay/staySteps'
import { stayQuote, stayVenue } from '../stay/stayTestUtils'
import type { PaymentReturn, Quote } from '../../lib/types'

/**
 * Release 4, part C. The return page's body and the pay-at-venue fallback notice, rendered to a string. The page's
 * own effects (reading the address, the one confirm, the redirect to the booking) never run here; the decisions they
 * apply are the pure functions of `payReturn.ts`, tested in `payReturn.test.ts`.
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
vi.mock('./StripePayment', () => ({ default: () => <div data-stripe-mounted="1" /> }))
vi.mock('../../lib/portalApi', async () => {
  const actual = await vi.importActual<typeof import('../../lib/portalApi')>('../../lib/portalApi')
  const never = () => new Promise(() => {})
  return { ...actual, portalApi: { ...actual.portalApi, paymentIntent: never, confirm: never, stayPaymentIntent: never, stayConfirm: never, paymentReturn: never } }
})

const stay: PaymentReturn = {
  kind: 'stay', state: 'authorised', payment_intent_id: 'pi_1', amount: 193.5, currency: 'EUR', booking: null, service: null,
  stay: { hold_token: 'HOLD', hold_active: true, room: { id: '101', name: 'Sea view' }, check_in: '2026-10-10', check_out: '2026-10-12', nights: 2, adults: 2, children: 0 },
}
const service: PaymentReturn = {
  kind: 'service', state: 'authorised', payment_intent_id: 'pi_2', amount: 60, currency: 'EUR', booking: null, stay: null,
  service: { body: { service_id: 11, master_id: 5, start_at: '2026-10-05T10:00:00+03:00', party_size: 1, extras: [], coupon: null }, name: 'Deep Tissue', master: 'Mara', start_at: '2026-10-05T10:00:00+03:00' },
}
const props = (p: Partial<PayReturnBodyProps>): PayReturnBodyProps => ({
  paymentIntentId: 'pi_1', answer: null, answerError: null, confirmState: 'idle', confirmCode: null, onRetryAnswer: () => {}, onRetryConfirm: () => {}, ...p,
})
const page = (p: Partial<PayReturnBodyProps>, data = stayVenue) => render(<PayReturnBody {...props(p)} />, data, undefined, '/portal/book/return?payment_intent=pi_1')

describe('PayReturnBody', () => {
  it('checks the payment with the server first', () => {
    expect(page({})).toContain('Checking your payment…')
  })

  it('an address without a payment, or a payment that is not the member\'s, says so and points to Bookings', () => {
    for (const html of [page({ paymentIntentId: null }), page({ answerError: { code: 'payment_not_found' } })]) {
      expect(html).toContain('We could not find this payment.')
      expect(html).toContain('href="/portal/bookings"')
      expect(html).not.toContain('Confirming')
    }
  })

  it('Stripe unreachable: its own sentence and a retry of the same question', () => {
    const html = page({ answerError: { code: 'payment_check_failed' } })
    expect(html).toContain('We could not check your payment just now.')
    expect(html).toContain('Try again')
  })

  it('an authorised stay: shows what is being booked, and that it is being confirmed', () => {
    const html = page({ answer: stay, confirmState: 'pending' })
    expect(html).toContain('Sea view')
    expect(html).toContain('Adults: 2 · children: 0')
    expect(html).toContain('193.50')
    expect(html).toContain('Confirming your booking…')
  })

  it('an authorised appointment: the service, the person and the time', () => {
    const html = page({ answer: service, paymentIntentId: 'pi_2' }, base)
    expect(html).toContain('Deep Tissue')
    expect(html).toContain('Mara')
    expect(html).toContain('<time dateTime="2026-10-05T10:00:00+03:00">')
  })

  it('a refusal the server released: its sentence, that the card was released, and Start again', () => {
    const html = page({ answer: stay, confirmState: 'error', confirmCode: 'hold_expired' })
    expect(html).toContain('This took a little too long. Please check the price again.')
    expect(html).toContain('the hold on your card has been released')
    expect(html).toContain('href="/portal/book/stay"')
    expect(html).not.toContain('Confirming your booking')
  })

  it('a stay the server could not finish: never pay again, contact the venue', () => {
    const html = page({ answer: stay, confirmState: 'error', confirmCode: 'confirm_failed' })
    expect(html).toContain('Please do not pay again')
    expect(html).toContain('hello@seaside.test')
    expect(html).not.toContain('Start again')
  })

  it('a stay that could not reach the booking service: a retry of the same confirm', () => {
    const html = page({ answer: stay, confirmState: 'error', confirmCode: null })
    expect(html).toContain('Your card has been authorised. We could not reach the booking service.')
    expect(html).toContain('Try again')
    const checked = page({ answer: stay, confirmState: 'error', confirmCode: 'payment_check_failed' })
    expect(checked).toContain('We could not check your payment just now.')
  })

  it('an appointment slot taken meanwhile: its sentence and Start again on the same service', () => {
    const html = page({ answer: service, paymentIntentId: 'pi_2', confirmState: 'error', confirmCode: 'slot_taken' }, base)
    expect(html).toContain('That time was just taken.')
    expect(html).toContain('href="/portal/book/appointment?service=11"')
  })

  it('the bank still processing, a failed payment, a booking that lapsed, a booking already made', () => {
    expect(page({ answer: { ...stay, state: 'processing' } })).toContain('Your bank is still confirming the payment.')
    const failed = page({ answer: { ...stay, state: 'failed' } })
    expect(failed).toContain('nothing was booked and nothing was charged')
    expect(failed).not.toContain('Confirming')
    const lapsed = page({ answer: { ...stay, stay: null } })
    expect(lapsed).toContain('released automatically within the hour')
    expect(page({ answer: { ...stay, state: 'booked' } })).toContain('This payment is already booked.')
  })
})

const quote: Quote = {
  service: { id: 11, name: 'Deep Tissue', duration_minutes: 45 }, master: null, start_at: '2026-10-05T09:00:00Z', end_at: '2026-10-05T09:45:00Z', duration_minutes: 45, currency: 'EUR',
  lines: { service_price: 60, extras: [], extras_total: 0 }, list_amount: 60, discount: null, coupon: null, total_amount: 60,
  payment: { mode: 'online', reason: null }, policy: { cancellation_policy: null, cancel_hours: 24 },
}
const onlineData = { ...base, capabilities: { ...base.capabilities, payments: { services: true, stays: true, publishable_key: 'pk_test_x' } } }
const visit = newPayVisit((() => { let n = 0; return () => `fixed-${n++}` })())
const unavailable = { response: { status: 409, data: { error: 'pay_at_venue', reason: 'payment_unavailable', pay_at_venue_grant: 'grant-1' } } }
const noop = () => {}

describe('paying at the venue when online payment is unavailable', () => {
  it('the appointment Pay step says so plainly, offers Confirm without a card and a try online again', async () => {
    const html = await renderAsync(<PayStep quote={quote} state={{ ...initialState, serviceId: 11, step: 'pay' }} visit={visit} onVisitChange={noop} onBack={noop} onDone={noop} />, onlineData, async c => {
      await c.prefetchQuery({ queryKey: ['portal-payment-intent', visit.nonce], queryFn: () => Promise.reject(unavailable), retry: false })
    })
    expect(html).toContain('Online payment is unavailable right now. You can still book now and pay at the venue.')
    expect(html).toContain('Try paying online again')
    expect(html).toContain('Confirm booking')
    expect(html).not.toContain('Nothing to pay now')
  })

  it('a visit that already remembers the grant shows the same', () => {
    const html = render(<PayStep quote={quote} state={{ ...initialState, serviceId: 11, step: 'pay' }} visit={{ ...visit, noCard: true, atVenueGrant: 'grant-1' }} onVisitChange={noop} onBack={noop} onDone={noop} />, onlineData)
    expect(html).toContain('You can still book now and pay at the venue.')
  })

  it('a venue that turned cards off mid-flow keeps its own sentence, with no grant', async () => {
    const html = await renderAsync(<PayStep quote={quote} state={{ ...initialState, serviceId: 11, step: 'pay' }} visit={visit} onVisitChange={noop} onBack={noop} onDone={noop} />, onlineData, async c => {
      await c.prefetchQuery({ queryKey: ['portal-payment-intent', visit.nonce], queryFn: () => Promise.reject({ response: { status: 409, data: { error: 'pay_at_venue' } } }), retry: false })
    })
    expect(html).toContain('Nothing to pay now')
    expect(html).not.toContain('Try paying online again')
  })

  it('the stay Pay step: the amount to pay at the venue, the plain sentence and Confirm stay', async () => {
    const online = { ...stayQuote, payment: { mode: 'online' as const, reason: null } }
    const state: StayState = { ...initialStayState, step: 'pay', checkIn: '2026-10-10', checkOut: '2026-10-12', roomId: '101', quote: online }
    const venue = { ...stayVenue, capabilities: { ...stayVenue.capabilities, payments: { services: false, stays: true, publishable_key: 'pk_test_x' } } }
    const html = await renderAsync(<StayPayStep quote={online} state={state} visit={visit} onVisitChange={noop} onBack={noop} onDone={noop} />, venue, async c => {
      await c.prefetchQuery({ queryKey: ['portal-stay-payment-intent', visit.nonce], queryFn: () => Promise.reject(unavailable), retry: false })
    })
    expect(html).toContain('To pay at Seaside Hotel')
    expect(html).toContain('Online payment is unavailable right now. You can still book now and pay at the venue.')
    expect(html).toContain('Confirm stay')
  })
})
