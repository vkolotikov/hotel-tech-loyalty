import { describe, expect, it, vi } from 'vitest'
import { render, renderAsync } from '../book/testUtils'
import { StayPriceBreakdown } from './StayPriceBreakdown'
import { StayReviewStep, stayQuoteQueryOptions } from './StayReviewStep'
import { initialStayState, stayQuoteBody, type StayState } from './staySteps'
import { stayCatalogue, stayQuote, stayVenue } from './stayTestUtils'

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
vi.mock('../../lib/portalApi', async () => {
  const actual = await vi.importActual<typeof import('../../lib/portalApi')>('../../lib/portalApi')
  const never = () => new Promise(() => {})
  return { ...actual, portalApi: { ...actual.portalApi, stayQuote: never, offers: never, redemptions: never, resolveCoupon: never } }
})

const noop = () => {}
const state: StayState = { ...initialStayState, step: 'review', checkIn: '2026-10-10', checkOut: '2026-10-12', roomId: '101', extras: ['3'] }
const key = stayQuoteQueryOptions(stayQuoteBody(state)).queryKey
const review = (s: StayState = state) => <StayReviewStep catalogue={stayCatalogue} state={s} onChange={noop} onBack={noop} onBounce={noop} onContinue={noop} />

describe('StayPriceBreakdown', () => {
  it('itemises the room, the add-ons, the member discount and the total — every number the server\'s', () => {
    const html = render(<StayPriceBreakdown quote={stayQuote} />, stayVenue)
    expect(html).toContain('Sea view · nights: 2')
    expect(html).toContain('Breakfast')
    expect(html).toContain('Subtotal')
    expect(html).toContain('10% off stays')
    expect(html).toContain('−')
    expect(html).toContain('193.50')
    expect(html.indexOf('Subtotal')).toBeLessThan(html.indexOf('10% off stays'))
    expect(html.indexOf('10% off stays')).toBeLessThan(html.indexOf('Total'))
  })

  it('says why a coupon was not used', () => {
    const outbid = render(<StayPriceBreakdown quote={{ ...stayQuote, coupon: { source: 'offer', source_id: 7, label: '5 off', status: 'outbid', discount: 5 } }} />, stayVenue)
    expect(outbid).toContain('Your membership discount is better than 5 off')
    const wrong = render(<StayPriceBreakdown quote={{ ...stayQuote, coupon: { source: 'offer', source_id: 7, label: 'Spa day', status: 'wrong_scope', discount: 0 } }} />, stayVenue)
    expect(wrong).toContain('Spa day does not apply to stays.')
  })

  // What's charged when, from the quote's own mode and total — the card is authorised
  // now and captured later by the venue's own capture job, never synchronously, so the copy says "reserved…
  // charged later", not "charged now". Review reads an online
  // quote as only a promise for the next step; Pay splits into "not yet authorised" (still only
  // a promise) and "authorised" (`paid`) — the member must never be told a card WAS authorised before it was.
  describe('what\'s charged when', () => {
    it('on Pay, online, authorised: reserved, the venue charges it later', () => {
      const html = render(<StayPriceBreakdown quote={{ ...stayQuote, payment: { mode: 'online', reason: null } }} stage="pay" paid />, stayVenue)
      expect(html).toContain('Reserved on your card. Seaside Hotel charges it later')
      expect(html).toContain('193.50')
    })

    // Before the card is actually authorised, Pay must not say "Reserved" — a
    // completed fact that has not happened yet.
    it('on Pay, online, NOT yet authorised: a promise worded for "now", never "Reserved"', () => {
      const html = render(<StayPriceBreakdown quote={{ ...stayQuote, payment: { mode: 'online', reason: null } }} stage="pay" />, stayVenue)
      expect(html).toContain('To reserve on your card now')
      expect(html).toContain('193.50')
      expect(html).toContain('Seaside Hotel charges it later')
      expect(html).not.toContain('Reserved on your card')
    })

    // On Review no card has been entered yet, so the line is only a promise for the
    // next step — never "has been reserved" before anything has happened, whatever `paid` says.
    it('on Review, online: only a promise for the next step, never "reserved" yet', () => {
      const html = render(<StayPriceBreakdown quote={{ ...stayQuote, payment: { mode: 'online', reason: null } }} stage="review" paid />, stayVenue)
      expect(html).toContain('To reserve on your card at the next step')
      expect(html).toContain('193.50')
      expect(html).not.toContain('Reserved on your card')
    })

    it('at the venue: named plainly, no card language, on either step', () => {
      for (const stage of ['pay', 'review'] as const) {
        const html = render(<StayPriceBreakdown quote={{ ...stayQuote, payment: { mode: 'at_venue', reason: 'payments_off' } }} stage={stage} />, stayVenue)
        expect(html, stage).toContain('To pay at Seaside Hotel')
        expect(html, stage).toContain('193.50')
        expect(html, stage).not.toContain('Reserved on your card')
      }
    })

    it('a zero total wins over the mode: nothing to pay, never "pay at venue: 0.00"', () => {
      const html = render(<StayPriceBreakdown quote={{ ...stayQuote, payment: { mode: 'online', reason: null }, total_amount: 0 }} stage="pay" />, stayVenue)
      expect(html).toContain('Nothing to pay.')
      expect(html).not.toContain('Reserved on your card')
      expect(html).not.toContain('To pay at')
    })

    // On Pay, the payment-intent call's own answer wins over the
    // quote's stale "online" mode — `pay_at_venue` and `nothing_to_pay` must read DIFFERENTLY: a single
    // merged boolean would send both to "pay at venue".
    it('on Pay, intentAnswer pay_at_venue wins over an online quote: names the amount', () => {
      const html = render(<StayPriceBreakdown quote={{ ...stayQuote, payment: { mode: 'online', reason: null } }} stage="pay" intentAnswer="pay_at_venue" />, stayVenue)
      expect(html).toContain('To pay at Seaside Hotel')
      expect(html).not.toContain('Reserved on your card')
      expect(html).not.toContain('Nothing to pay.')
    })

    it('on Pay, intentAnswer nothing_to_pay wins over an online quote: nothing to pay, not the amount', () => {
      const html = render(<StayPriceBreakdown quote={{ ...stayQuote, payment: { mode: 'online', reason: null } }} stage="pay" intentAnswer="nothing_to_pay" />, stayVenue)
      expect(html).toContain('Nothing to pay.')
      expect(html).not.toContain('To pay at Seaside Hotel')
      expect(html).not.toContain('Reserved on your card')
    })
  })
})

describe('StayReviewStep', () => {
  it('shows what is being booked, the add-ons, the price and the venue\'s terms once the quote has landed', () => {
    const html = render(review(), stayVenue, c => c.setQueryData(key, stayQuote))
    expect(html).toMatch(/<h2[^>]*tabindex="-1"[^>]*data-step-heading="review"/)
    expect(html).toContain('Sea view')
    expect(html).toContain('Adults: 2 · children: 0')
    expect(html).toContain('Add-ons')
    expect(html).toContain('Breakfast')
    expect(html).toContain('Special requests')
    expect(html).toContain('193.50')
    expect(html).toContain('Arrival from 15:00')
    expect(html).toContain('Departure by 11:00')
    expect(html).toContain('Free cancellation up to 48 hours before arrival.')
    expect(html).toContain('Free until two days before.')
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Continue/)
  })

  it('holds Continue back until there is a price', () => {
    const html = render(review(), stayVenue)
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Continue/)
    expect(html).not.toContain('Subtotal')
  })

  it('says nothing about free cancellation when the venue gives no hours', () => {
    const html = render(review(), stayVenue, c => c.setQueryData(key, { ...stayQuote, policy: { ...stayQuote.policy, cancel_hours: 0 } }))
    expect(html).not.toContain('Free cancellation up to')
  })

  it('an add-on that needs more notice is said next to the add-ons', async () => {
    const html = await renderAsync(review(), stayVenue, async c => {
      await c.prefetchQuery({ queryKey: key, queryFn: () => Promise.reject({ response: { status: 422, data: { error: 'extra_lead_time' } } }), retry: false })
    })
    expect(html).toContain('One of the add-ons needs more notice than this time allows.')
    expect(html).not.toContain('Something went wrong')
  })

  it('an error it cannot explain offers a retry', async () => {
    const html = await renderAsync(review(), stayVenue, async c => {
      await c.prefetchQuery({ queryKey: key, queryFn: () => Promise.reject(new Error('down')), retry: false })
    })
    expect(html).toContain('Something went wrong. Please try again.')
    expect(html).toContain('Try again')
  })

  it('never keeps a price: a quote is asked again every time Review is shown', () => {
    const options = stayQuoteQueryOptions(stayQuoteBody(state))
    expect(options.gcTime).toBe(0)
    expect(options.staleTime).toBe(0)
    expect(options.retry).toBe(false)
  })
})
