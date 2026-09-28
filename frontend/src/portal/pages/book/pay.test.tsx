import { describe, expect, it, vi } from 'vitest'
import { render, renderAsync, base } from './testUtils'
import { PayStep } from './PayStep'
import { initialState, newPayVisit, type PayVisit } from './steps'
import type { Quote } from '../../lib/types'

/**
 * What `renderToStaticMarkup` cannot exercise here, and where it's actually covered instead:
 * - The auto-bounce to When/Review on a `confirm()` error, the query invalidation before it, and the
 *   `removeQueries` calls on every confirm success/error all live in effects/handlers — none of them run
 *   under this renderer. The *decision* they apply (`afterConfirmError`) is a pure function with its own
 *   exhaustive tests in `steps.test.ts`.
 * - `canLeavePay`/`newPayVisit` (the step-strip lock and the fresh-nonce-per-visit rule) are likewise pure
 *   functions tested directly in `steps.test.ts`; `StepStrip`'s own rendering of `locked` is tested in
 *   `stepStrip.test.tsx`; the notice sentence Book.tsx shows on the step it bounced back to is tested in
 *   `bookNotice.test.tsx`.
 * - Stripe's own `confirmPayment()` call, and `StripePayment`'s pay-button staying disabled once paid, need
 *   a real Stripe Elements mount (jsdom + Stripe test mode) this environment doesn't have; `StripePayment`
 *   is mocked below in every test, per the brief, and reviewed by eye.
 * - `StripePayment` is loaded with `React.lazy()`; a dynamic `import()` is always a Promise even when
 *   `vi.mock` makes the module synchronously available, so a `<Suspense>` boundary around it always
 *   renders its own fallback under `renderToStaticMarkup`, never the mocked component's markup. Tests that
 *   reach that branch can only check that they got there (loading copy gone, the fallback skeleton showing)
 *   — never `data-stripe-mounted` itself.
 * - Fix round 2: `onPayStart`/`onPayFailed` (finding M3 — the step-strip lock engaging on press, not on
 *   capture) are only ever called from inside `StripePayment`'s own `PayForm`, which is mocked out entirely
 *   here; there is nothing for a test in this file to call. The lock itself (`canLeavePay` reading
 *   `visit.held`) is a pure function tested directly in `steps.test.ts`. The unmount guard inside
 *   `StripePayment` needs a real mount/unmount cycle this static renderer can't drive either — reviewed by
 *   eye.
 */

vi.mock('./StripePayment', () => ({ default: () => <div data-stripe-mounted="1" /> }))
// `paymentIntent`/`confirm` stay never-resolving by default, the same way `review.test.tsx`/`book.test.tsx`
// stub their own network calls. PayStep fetches the payment intent with a `useQuery` keyed on the visit's
// own nonce (see PayStep.tsx for why: a per-visit query is seedable into a given state the same way
// ReviewStep's quote is, which a `useMutation` fired from an effect that never runs under
// `renderToStaticMarkup` cannot be) — so rendering it online with nothing seeded would otherwise dispatch a
// real, unstubbed network call.
vi.mock('../../lib/portalApi', async () => {
  const actual = await vi.importActual<typeof import('../../lib/portalApi')>('../../lib/portalApi')
  return {
    ...actual,
    portalApi: {
      ...actual.portalApi,
      paymentIntent: () => new Promise(() => {}),
      confirm: () => new Promise(() => {}),
    },
  }
})

const quote: Quote = {
  service: { id: 11, name: 'Deep Tissue', duration_minutes: 45 }, master: null, start_at: '2026-10-05T09:00:00Z', end_at: '2026-10-05T09:45:00Z', duration_minutes: 45, currency: 'EUR',
  lines: { service_price: 60, extras: [], extras_total: 0 }, list_amount: 60, discount: null, coupon: null, total_amount: 60,
  payment: { mode: 'at_venue', reason: 'payments_off' }, policy: { cancellation_policy: null, cancel_hours: 24 },
}
const state = { ...initialState, serviceId: 11, startAt: '2026-10-05T09:00:00Z', step: 'pay' as const }
const online = { ...quote, payment: { mode: 'online' as const, reason: null } }
const onlineData = { ...base, capabilities: { ...base.capabilities, payments: { services: true, stays: false, publishable_key: 'pk_test_x' } } }
const visit: PayVisit = newPayVisit((() => { let n = 0; return () => `fixed-${n++}` })())
const noop = () => {}

describe('PayStep', () => {
  // Task 21 browser pass: the last screen before "Confirm booking" showed the price but not WHEN or WITH
  // WHOM — the member confirmed a time they last saw two screens earlier.
  it('says when and with whom right above the price the member is confirming', () => {
    const html = render(<PayStep quote={{ ...quote, master: { id: 5, name: 'Mara' } }} state={state} visit={visit} onVisitChange={noop} onBack={noop} onDone={noop} />)
    expect(html).toContain('<time dateTime="2026-10-05T09:00:00Z">')
    expect(html).toContain('Mara')
    expect(html.indexOf('<time')).toBeLessThan(html.indexOf('Confirm booking'))
  })

  // Final review, Minor 11: Book moves focus to the new step's heading after a step change.
  it('renders a heading that script can focus without joining the tab order', () => {
    const html = render(<PayStep quote={quote} state={state} visit={visit} onVisitChange={noop} onBack={noop} onDone={noop} />)
    expect(html).toMatch(/<h2[^>]*tabindex="-1"[^>]*data-step-heading="pay"/)
  })

  it('at the venue: explains there is nothing to pay now and offers confirm', () => {
    const html = render(<PayStep quote={quote} state={state} visit={visit} onVisitChange={noop} onBack={noop} onDone={noop} />)
    expect(html).toContain('Nothing to pay now')
    expect(html).toContain('Confirm booking')
    expect(html).not.toContain('Loading secure payment')
  })

  it('online: asks for the payment intent and shows the loading copy first', () => {
    const html = render(<PayStep quote={online} state={state} visit={visit} onVisitChange={noop} onBack={noop} onDone={noop} />, onlineData)
    expect(html).toContain('Loading secure payment')
    expect(html).not.toContain('Confirm booking')
  })

  it('the quote says online but there is no publishable key: card unavailable, never a blank step', () => {
    // `base` itself carries no publishable key — the RULING case: the mode comes from the quote, the key
    // from the bootstrap, and a missing key is never a blank step.
    const html = render(<PayStep quote={online} state={state} visit={visit} onVisitChange={noop} onBack={noop} onDone={noop} />, base)
    expect(html).toContain('Online payment is unavailable right now. Please try again in a moment.')
    expect(html).toContain('Try again')
    expect(html).not.toContain('Loading secure payment')
    expect(html).not.toContain('Confirm booking')
  })

  it('nothing_to_pay: a coupon covered the whole price, so it offers confirm without a card', async () => {
    const html = await renderAsync(
      <PayStep quote={online} state={state} visit={visit} onVisitChange={noop} onBack={noop} onDone={noop} />,
      onlineData,
      async c => {
        await c.prefetchQuery({
          queryKey: ['portal-payment-intent', visit.nonce],
          queryFn: () => Promise.reject({ response: { status: 409, data: { error: 'nothing_to_pay' } } }),
          retry: false,
        })
      },
    )
    expect(html).toContain('Nothing to pay now')
    expect(html).toContain('Confirm booking')
    expect(html).not.toContain('Loading secure payment')
    expect(html).not.toContain('Online payment is unavailable right now')
  })

  it('pay_at_venue from the payment-intent call (venue turned online payment off mid-flow) is handled the same way', async () => {
    const html = await renderAsync(
      <PayStep quote={online} state={state} visit={visit} onVisitChange={noop} onBack={noop} onDone={noop} />,
      onlineData,
      async c => {
        await c.prefetchQuery({
          queryKey: ['portal-payment-intent', visit.nonce],
          queryFn: () => Promise.reject({ response: { status: 409, data: { error: 'pay_at_venue' } } }),
          retry: false,
        })
      },
    )
    expect(html).toContain('Nothing to pay now')
    expect(html).toContain('Confirm booking')
  })

  it('a genuine payment-intent failure (payment_unavailable) shows the card-unavailable notice with a retry', async () => {
    const html = await renderAsync(
      <PayStep quote={online} state={state} visit={visit} onVisitChange={noop} onBack={noop} onDone={noop} />,
      onlineData,
      async c => {
        await c.prefetchQuery({
          queryKey: ['portal-payment-intent', visit.nonce],
          queryFn: () => Promise.reject({ response: { status: 503, data: { error: 'payment_unavailable' } } }),
          retry: false,
        })
      },
    )
    expect(html).toContain('Online payment is unavailable right now. Please try again in a moment.')
    expect(html).toContain('Try again')
    expect(html).not.toContain('Confirm booking')
  })

  it('reaches the Stripe-mount branch, not the loading branch, once the intent for THIS visit has resolved', async () => {
    const html = await renderAsync(
      <PayStep quote={online} state={state} visit={visit} onVisitChange={noop} onBack={noop} onDone={noop} />,
      onlineData,
      async c => {
        await c.prefetchQuery({
          queryKey: ['portal-payment-intent', visit.nonce],
          queryFn: () => Promise.resolve({ client_secret: 'secret_1', payment_intent_id: 'pi_1', amount: 60, currency: 'EUR' }),
        })
      },
    )
    // `StripePayment` is `React.lazy()`-loaded; a dynamic `import()` is always a Promise even when
    // `vi.mock` makes the module synchronously available, so `renderToStaticMarkup`'s `<Suspense>` here
    // always renders ITS OWN fallback (the skeleton), never the mocked module's own markup — so
    // `data-stripe-mounted` can never appear under this harness. What IS checkable synchronously is that
    // this reached the Suspense/StripePayment branch at all: the loading copy is gone, and a skeleton the
    // right size is standing in for the still-unresolved lazy chunk. The next test proves the converse —
    // an intent seeded under a DIFFERENT visit stays on the loading branch instead of reaching this one.
    expect(html).not.toContain('Loading secure payment')
    expect(html).toContain('animate-pulse')
  })

  it('never hands back a cached intent that belongs to a DIFFERENT visit (finding C1)', async () => {
    // Seeded under a different nonce than `visit.nonce` — a query keyed on the quote/body alone would have
    // matched this and handed the stale intent straight to a fresh mount; keyed on the visit's own nonce,
    // it can't, so this stays on the loading branch rather than reaching the previous test's branch.
    const html = await renderAsync(
      <PayStep quote={online} state={state} visit={visit} onVisitChange={noop} onBack={noop} onDone={noop} />,
      onlineData,
      async c => {
        await c.prefetchQuery({
          queryKey: ['portal-payment-intent', 'some-other-visits-nonce'],
          queryFn: () => Promise.resolve({ client_secret: 'stale_secret', payment_intent_id: 'pi_stale', amount: 60, currency: 'EUR' }),
        })
      },
    )
    expect(html).not.toContain('data-stripe-mounted="1"')
    expect(html).not.toContain('stale_secret')
    expect(html).toContain('Loading secure payment')
  })

  it('a visit that already knows it needs no card (noCard) offers confirm straight away, with no intent request at all (finding M2)', () => {
    const noCardVisit: PayVisit = { ...visit, noCard: true }
    // Nothing seeded under `['portal-payment-intent', ...]` for this visit — if the query were still
    // enabled it would have nothing to show but the loading branch; `noCard` disables it outright.
    const html = render(<PayStep quote={online} state={state} visit={noCardVisit} onVisitChange={noop} onBack={noop} onDone={noop} />, onlineData)
    expect(html).toContain('Nothing to pay now')
    expect(html).toContain('Confirm booking')
    expect(html).not.toContain('Loading secure payment')
  })
})
