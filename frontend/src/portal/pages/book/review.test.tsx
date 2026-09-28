import { describe, expect, it, vi } from 'vitest'
import type { Quote } from '../../lib/types'
import { CouponField } from './CouponField'
import { PriceBreakdown } from './PriceBreakdown'
import { ReviewStep, quoteBody, quoteQueryOptions } from './ReviewStep'
import type { BookState } from './steps'
import { base, catalogue, render, renderAsync } from './testUtils'

// This file renders everything with `renderToStaticMarkup` (see testUtils.tsx), which never runs
// `useEffect` — so `ReviewStep`'s coupon-clearing effect (the binding requirement that a `coupon_*` error
// clears the selected coupon and tells the member why) cannot be exercised from here. Its *decision* —
// which codes clear the coupon and what to tell the member — lives in the pure `afterQuoteError()` function
// in `steps.ts` and is covered by `steps.test.ts`; that the resulting sentence is actually displayable while
// no coupon is selected (i.e. after the effect has cleared it) is covered by the `CouponField` test below
// that renders with `value={null}` and a `quoteErrorMessage`. The effect itself is four lines that only
// call `afterQuoteError()` and apply what it returns (see ReviewStep.tsx) — reviewed by eye against those
// same tests, since a live-browser pass needs a running backend and seeded booking/coupon data this
// environment doesn't have wired up.

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
// apiErrorCode/bookErrorKey stay the real implementations, same as book.test.tsx — only the network calls
// are stubbed, and the booking-window/coupon tests below settle their own query via `prefetchQuery`.
vi.mock('../../lib/portalApi', async () => {
  const actual = await vi.importActual<typeof import('../../lib/portalApi')>('../../lib/portalApi')
  return {
    ...actual,
    portalApi: {
      ...actual.portalApi,
      catalogue: () => new Promise(() => {}),
      calendar: () => new Promise(() => {}),
      availability: () => new Promise(() => {}),
      offers: () => new Promise(() => {}),
      redemptions: () => new Promise(() => {}),
      quote: () => new Promise(() => {}),
      resolveCoupon: () => new Promise(() => {}),
    },
  }
})

const quote: Quote = {
  service: { id: 11, name: 'Deep Tissue', duration_minutes: 45 }, master: { id: 5, name: 'Mara' }, start_at: '2026-10-05T09:00:00Z', end_at: '2026-10-05T09:45:00Z', duration_minutes: 45, currency: 'EUR',
  lines: { service_price: 60, extras: [{ id: 3, name: 'Hot towel', unit_price: 5, quantity: 1, line_total: 5 }], extras_total: 5 },
  list_amount: 65, discount: { amount: 6.5, label: '10% off treatments', source: 'tier_benefit' }, coupon: null, total_amount: 58.5,
  payment: { mode: 'at_venue', reason: 'payments_off' }, policy: { cancellation_policy: 'Free cancellation up to 24 hours before.', cancel_hours: 24 },
}

describe('PriceBreakdown', () => {
  it('itemises the lines, the discount and the total', () => {
    const html = render(<PriceBreakdown quote={quote} />)
    expect(html).toContain('Hot towel')
    expect(html).toContain('Subtotal')
    expect(html).toContain('10% off treatments')
    expect(html).toContain('−') // the discount sign
    expect(html).toContain('58.50')
  })
  it('explains an outbid coupon and warns on a wrong-scope one', () => {
    const outbid = render(<PriceBreakdown quote={{ ...quote, coupon: { source: 'offer', source_id: 1, label: 'Five off', status: 'outbid', discount: 5 } }} />)
    expect(outbid).toContain('we kept the bigger saving')
    const wrong = render(<PriceBreakdown quote={{ ...quote, coupon: { source: 'offer', source_id: 1, label: 'Stay deal', status: 'wrong_scope', discount: 0 } }} />)
    expect(wrong).toContain('role="alert"')
  })
})

describe('CouponField', () => {
  it("lists the member's unused claims and pending reward codes as chips, plus the code box", () => {
    const html = render(<CouponField value={null} onChange={() => {}} quote={quote} />, base, c => {
      c.setQueryData(['portal-offers'], { general: [], personalized: [{ id: 21, status: 'claimed', claimed_at: '2026-09-01', used_at: null, expires_at: null, offer: { id: 1, title: 'Welcome ten', description: '', type: 'discount', value: 10, image_url: null, end_date: null, terms_conditions: null, usage_limit: null, times_used: 0 } }] })
      c.setQueryData(['portal-redemptions'], { redemptions: [{ id: 31, code: 'REW-ABCD1234', status: 'pending', points_spent: 100, created_at: '2026-09-01', reward: { id: 2, name: 'Fifteen off', category: null, image_url: null, points_cost: 100 } }] })
    })
    expect(html).toContain('Welcome ten')
    expect(html).toContain('Fifteen off')
    expect(html).toContain('Have a code?')
    expect(html).toContain('aria-pressed="false"')
  })

  it('shows a coupon-field-level error message as an alert even while no coupon is selected', () => {
    // `value={null}`, deliberately: by the time `ReviewStep`'s effect has cleared a rejected coupon, `value`
    // is null — a component that hid this message whenever nothing is selected would go silent right when
    // the member most needs to read it.
    const html = render(<CouponField value={null} onChange={() => {}} quote={null} quoteErrorMessage="That coupon has already been used." />, base, c => {
      c.setQueryData(['portal-offers'], { general: [], personalized: [] })
      c.setQueryData(['portal-redemptions'], { redemptions: [] })
    })
    expect(html).toContain('That coupon has already been used.')
    expect(html).toContain('role="alert"')
  })
})

const reviewState: BookState = {
  step: 'review', serviceId: 11, masterId: 5, startAt: '2026-10-05T09:00:00Z', partySize: 1, extras: [], coupon: null, notes: '',
  notice: null, quote: null, visit: null,
}

describe('ReviewStep', () => {
  it('shows the sentence and a way back to When when the server says the slot was just taken', async () => {
    const body = quoteBody(reviewState)
    const html = await renderAsync(
      <ReviewStep catalogue={catalogue} state={reviewState} onChange={() => {}} onBack={() => {}} onContinue={() => {}} />,
      base,
      async c => {
        c.setQueryData(['portal-offers'], { general: [], personalized: [] })
        c.setQueryData(['portal-redemptions'], { redemptions: [] })
        await c.prefetchQuery({ queryKey: ['portal-quote', body], queryFn: () => Promise.reject({ response: { status: 409, data: { error: 'slot_taken' } } }), retry: false })
      },
    )
    expect(html).toContain('That time was just taken. Please pick another.')
    // The header's own "Change" plus this notice's own way back to When.
    expect(html.match(/Change/g)?.length).toBeGreaterThanOrEqual(2)
    expect(html).not.toContain('Something went wrong. Please try again.')
  })

  // A `coupon_used` (etc.) quote error is deliberately NOT tested at this level any more: showing its
  // sentence now goes through ReviewStep's `useEffect` (so the notice survives the coupon being cleared and
  // the query key changing — see FINDING 3 in this task's fix report), and effects never run under
  // `renderToStaticMarkup`. See the file-level comment above for where this is actually covered.

  it('shows the extra_lead_time sentence beside the add-ons, without unticking the add-on itself', async () => {
    const extrasCatalogue = {
      ...catalogue,
      extras: [{ id: 9, name: 'Late add-on', description: null, price: 15, price_type: 'flat', duration_minutes: null, lead_time_hours: 48, image: null, icon: null, category: null, currency: 'EUR' }],
    }
    const state: BookState = { ...reviewState, extras: [9] }
    const body = quoteBody(state)
    const html = await renderAsync(
      <ReviewStep catalogue={extrasCatalogue} state={state} onChange={() => {}} onBack={() => {}} onContinue={() => {}} />,
      base,
      async c => {
        c.setQueryData(['portal-offers'], { general: [], personalized: [] })
        c.setQueryData(['portal-redemptions'], { redemptions: [] })
        await c.prefetchQuery({ queryKey: ['portal-quote', body], queryFn: () => Promise.reject({ response: { status: 422, data: { error: 'extra_lead_time' } } }), retry: false })
      },
    )
    expect(html).toContain('One of the add-ons needs more notice than this time allows.')
    expect(html).toContain('Late add-on')
    // Still ticked: the server saying the add-on needs more notice doesn't silently untick it.
    expect(html).toContain('aria-checked="true"')
    expect(html).not.toContain('Something went wrong. Please try again.')
  })
})

describe('ReviewStep heading', () => {
  // Final review, Minor 11: Book moves focus to the new step's heading after a step change.
  it('renders a heading that script can focus without joining the tab order', () => {
    const html = render(<ReviewStep catalogue={catalogue} state={reviewState} onChange={() => {}} onBack={() => {}} onContinue={() => {}} />, base, c => {
      c.setQueryData(['portal-offers'], { general: [], personalized: [] })
      c.setQueryData(['portal-redemptions'], { redemptions: [] })
    })
    expect(html).toMatch(/<h2[^>]*tabindex="-1"[^>]*data-step-heading="review"/)
  })
})

describe('quoteQueryOptions', () => {
  // Task 21 browser pass: the app's QueryClient defaults to a 30 s staleTime, so re-selecting a coupon
  // chip within 30 s of an earlier quote showed that cached quote — coupon applied, old total, Continue
  // enabled — without asking the server, which by then refused the coupon (`coupon_used`). A price the
  // member is about to accept must always be the server's answer for the current selection.
  it('never serves a quote from cache: always refetched, never kept once the selection moves on', () => {
    const options = quoteQueryOptions(quoteBody(reviewState))
    expect(options.staleTime).toBe(0)
    expect(options.gcTime).toBe(0)
    expect(options.queryKey).toEqual(['portal-quote', quoteBody(reviewState)])
  })
})

describe('quoteBody', () => {
  it('never includes the notes — they do not affect price and must not perturb the quote query key', () => {
    const state: BookState = { ...reviewState, notes: 'Please knock twice' }
    const body = quoteBody(state)
    expect(Object.keys(body)).not.toContain('notes')
    expect(JSON.stringify(body)).not.toContain('knock')
  })
})
