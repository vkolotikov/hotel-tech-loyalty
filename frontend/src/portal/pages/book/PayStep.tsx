import { Suspense, lazy, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { usePortal } from '../../PortalProvider'
import { apiErrorCode, bookErrorFallback, bookErrorKey, portalApi } from '../../lib/portalApi'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { DateTime } from '../../ui/DateTime'
import { Notice } from '../../ui/Notice'
import { Skeleton } from '../../ui/Skeleton'
import { PriceBreakdown } from './PriceBreakdown'
import { quoteBody } from './ReviewStep'
import { afterConfirmError, type BookState, type PayVisit } from './steps'
import type { PortalBooking, Quote } from '../../lib/types'

const StripePayment = lazy(() => import('./StripePayment'))

export interface PayStepProps {
  quote: Quote
  state: BookState
  /** The current attempt to pay for this quote — owned by `Book.tsx`, not this component, so the idempotency
   *  key, the captured payment intent id, and whether a card is currently held all survive exactly as long
   *  as the attempt does, not just as long as this component happens to stay mounted (finding I1). */
  visit: PayVisit
  /** A patch applied by `bookReducer` to the CURRENT visit — never a copy of the `visit` prop this render
   *  captured, which a later callback (Stripe answering after a re-render) would otherwise write back stale. */
  onVisitChange: (patch: Partial<PayVisit>) => void
  onBack: (to: 'when' | 'review', code: string) => void
  onDone: (booking: PortalBooking) => void
}

/**
 * Codes the payment-intent call can answer with when there is genuinely nothing to charge online: a
 * coupon covered the whole price (`nothing_to_pay`), or the venue turned online payment off between
 * Review and Pay (`pay_at_venue`). Both are shown exactly like an at-venue booking — a Confirm button with
 * no card — not as failures.
 */
const NOTHING_TO_CHARGE = new Set(['nothing_to_pay', 'pay_at_venue'])

const freshId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `k-${Date.now()}-${Math.random()}`)

export function PayStep({ quote, state, visit, onVisitChange, onBack, onDone }: PayStepProps) {
  const { t } = useTranslation()
  const { data, refetch } = usePortal()
  const qc = useQueryClient()

  const online = quote.payment.mode === 'online'
  const publishableKey = data?.capabilities.payments.publishable_key ?? null
  // RULING: the mode comes from the quote, never `capabilities.payments`; the key comes from the
  // bootstrap. If the quote says online but there is no key, this is never a blank step — it's the same
  // "card unavailable" notice as a failed payment-intent call, with a retry that re-reads the bootstrap.
  const noKey = online && !publishableKey

  const body = quoteBody(state)
  // ONE payment-intent request per visit (finding C1): keyed on `visit.nonce`, not the quote body, with
  // every automatic refetch trigger turned off and `gcTime: 0`. A cached, server-cancelled intent must
  // never be handed back on a later mount, and nothing may ever swap the `clientSecret` a mounted
  // `<Elements>` already has (react-stripe-js treats it as immutable). Disabled outright once a card is
  // captured (`visit.paid`) OR once the visit is known to need no card at all (`visit.noCard` — fix round
  // 2, finding M2): from either point on, re-requesting an intent this visit will never use again is
  // exactly the failure mode that let a confirm() error resurrect a "Loading secure payment…" spinner where
  // the Confirm button used to be.
  const intent = useQuery({
    queryKey: ['portal-payment-intent', visit.nonce],
    queryFn: () => portalApi.paymentIntent(body),
    enabled: online && !!publishableKey && !visit.paid && !visit.noCard,
    staleTime: Infinity,
    gcTime: 0,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
    retryOnMount: false,
  })
  const intentErrorCode = intent.isError ? apiErrorCode(intent.error) : null
  const nothingToCharge = visit.noCard || (intentErrorCode !== null && NOTHING_TO_CHARGE.has(intentErrorCode))
  const payAtVenue = !online || nothingToCharge
  // A genuine payment-intent failure gets a fresh nonce, not a refetch of the same one — refetching would
  // keep re-asking under the identity that already failed; a new nonce is a clean, one-shot new request.
  const retryIntent = () => onVisitChange({ nonce: freshId() })

  // Remembered on `visit`, not derived fresh from `intent` every render (finding M2): once disabled above,
  // `intent`'s cached error is what `nothingToCharge` reads on every later render anyway, but a `visit`
  // field survives even if some future change ever clears that cache entry — the point of owning this on
  // `visit` in the first place (see steps.ts) is that nothing here depends on a query still holding it.
  useEffect(() => {
    if (nothingToCharge && !visit.noCard) onVisitChange({ noCard: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nothingToCharge])

  const confirm = useMutation({
    mutationFn: (paymentIntentId: string | null) =>
      portalApi.confirm({ ...body, notes: state.notes || null, payment_intent_id: paymentIntentId }, visit.idempotencyKey),
    onSuccess: r => {
      // Only when a real intent was captured: the pay-at-venue/nothing-to-charge paths never had one, and
      // removing a query that's disabled anyway (see `enabled` above) but whose cached "nothing to charge"
      // answer this render still reads would just make react-query refetch it — the exact M2 bug.
      if (visit.paid) qc.removeQueries({ queryKey: ['portal-payment-intent'] })
      // Every query the confirmed booking could have changed: the bookings list (any scope/page), the
      // upcoming-count badge on the bootstrap, and — since a coupon may have just been consumed — the
      // member's offers/redemptions and the slot listings for whatever was just booked.
      qc.invalidateQueries({ queryKey: ['portal-bookings'] })
      qc.invalidateQueries({ queryKey: ['portal-bootstrap'] })
      qc.invalidateQueries({ queryKey: ['portal-offers'] })
      qc.invalidateQueries({ queryKey: ['portal-redemptions'] })
      qc.invalidateQueries({ queryKey: ['portal-slots'] })
      qc.invalidateQueries({ queryKey: ['portal-calendar'] })
      onDone(r.booking)
    },
    // Every confirm() failure, not only the ones that bounce back a step: a CAPTURED intent is either about
    // to be abandoned (a bounce) or about to be retried with the SAME id via `visit.paymentIntentId`, never
    // re-fetched — so the payment-intent query has nothing left to do. See onSuccess above for why this is
    // gated on `visit.paid`.
    onError: () => {
      if (visit.paid) qc.removeQueries({ queryKey: ['portal-payment-intent'] })
    },
  })
  const confirmErrorCode = confirm.isError ? apiErrorCode(confirm.error) : null
  const confirmDecision = confirm.isError ? afterConfirmError(confirmErrorCode) : null

  // The decision (which codes send the member back, to which step, and whether the picked slot itself is
  // now stale) is `afterConfirmError()`, a pure function with its own tests — `renderToStaticMarkup` never
  // runs this effect, so it's the only way the decision itself gets exercised by a test. Before bouncing:
  // the slot/calendar queries that fed the now-stale selection are invalidated, so When doesn't silently
  // re-offer a slot the server just said was gone. (The quote needs nothing here: its query has `gcTime: 0`
  // — see ReviewStep's `quoteQueryOptions` — so Review always fetches a fresh one when it mounts.)
  //
  // Keyed on `confirm.isError`/`confirmErrorCode` (primitives), not on `confirmDecision` itself:
  // `afterConfirmError()` returns a fresh object every call, so depending on its identity would re-run this
  // effect (and re-invalidate those two queries) on every unrelated re-render while sitting in a
  // "stay and retry" error state, not just when the error itself actually changes.
  useEffect(() => {
    if (!confirm.isError) return
    const decision = afterConfirmError(confirmErrorCode)
    if (decision.to) {
      qc.invalidateQueries({ queryKey: ['portal-slots'] })
      qc.invalidateQueries({ queryKey: ['portal-calendar'] })
      onBack(decision.to, confirmErrorCode as string)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirm.isError, confirmErrorCode])

  // All three recorded on `visit` (owned by `Book.tsx`), not local state, so they survive exactly as long
  // as the attempt does — including through a confirm() retry after this component has re-rendered, or a
  // late Stripe callback after this component has unmounted — not just as long as this component happens
  // to stay mounted (finding I1). `onPayStart` engages the step-strip lock the instant the member presses
  // Pay — before Stripe has answered at all (finding M3): `paid` alone would leave a gap, while
  // `stripe.confirmPayment()` is in flight, where the strip was still clickable. `onPayFailed` releases
  // that lock again on a card that was never actually captured.
  const onPayStart = () => onVisitChange({ held: true })
  const onPayFailed = () => onVisitChange({ held: false })
  const onPaid = (paymentIntentId: string) => {
    onVisitChange({ paymentIntentId, paid: true, held: true })
    confirm.mutate(paymentIntentId)
  }
  const retryConfirm = () => confirm.mutate(visit.paymentIntentId)

  return (
    <div className="space-y-5">
      {/* The step's heading, focused by Book after a step change; visually hidden, as on Service. */}
      <h2 tabIndex={-1} data-step-heading="pay" className="sr-only">{t('portal.book.heading_pay', 'Confirm your booking')}</h2>
      {/* When and with whom, on the screen where the member commits to it — not only two steps back. */}
      <Card tone="paper" className="p-4 space-y-3">
        <p className="text-sm text-p-text-2"><DateTime iso={quote.start_at} mode="datetime" />{quote.master ? ` · ${quote.master.name}` : ''}</p>
        <PriceBreakdown quote={quote} />
      </Card>

      {noKey && (
        <Notice tone="warning">
          {t('portal.book.card_unavailable', 'Online payment is unavailable right now. Please try again in a moment.')}{' '}
          <button type="button" className="underline" onClick={() => { void refetch() }}>{t('portal.common.retry', 'Try again')}</button>
        </Notice>
      )}

      {!noKey && payAtVenue && (
        <>
          <Notice tone="info">{t('portal.book.pay_at_venue_note', 'Nothing to pay now. Settle up when you visit.')}</Notice>
          <Button type="button" full loading={confirm.isPending} onClick={() => confirm.mutate(null)}>
            {confirm.isPending ? t('portal.book.confirming', 'Confirming…') : t('portal.book.confirm', 'Confirm booking')}
          </Button>
        </>
      )}

      {!noKey && online && !payAtVenue && !visit.paid && (
        <>
          {!intent.data && !intent.isError && (
            <>
              <p className="text-sm text-p-text-2">{t('portal.book.card_loading', 'Loading secure payment…')}</p>
              <Skeleton className="h-40" />
            </>
          )}
          {intent.isError && (
            <Notice tone="warning">
              {t('portal.book.card_unavailable', 'Online payment is unavailable right now. Please try again in a moment.')}{' '}
              <button type="button" className="underline" onClick={retryIntent}>{t('portal.common.retry', 'Try again')}</button>
            </Notice>
          )}
          {intent.data && (
            // A fresh `key` per client secret: a new secret always mounts a brand-new `<Elements>` tree
            // rather than hand react-stripe-js a changed prop it treats as immutable (finding C1).
            <Suspense fallback={<Skeleton className="h-40" />}>
              <StripePayment
                key={intent.data.client_secret}
                clientSecret={intent.data.client_secret}
                publishableKey={publishableKey as string}
                payLabel={t('portal.book.pay_online', 'Pay now')}
                paymentFailedMessage={t('portal.book.payment_failed', 'The payment did not go through. Please check the card details or try another card.')}
                paymentIncompleteMessage={t('portal.book.payment_incomplete', 'The payment was not completed. Please try again.')}
                onPayStart={onPayStart}
                onPayFailed={onPayFailed}
                onPaid={onPaid}
              />
            </Suspense>
          )}
        </>
      )}

      {visit.paid && confirm.isPending && <p className="text-sm text-p-text-2">{t('portal.book.confirming', 'Confirming…')}</p>}

      {confirm.isError && confirmDecision && !confirmDecision.to && (
        <Notice tone="danger">
          {t(bookErrorKey(confirmErrorCode), bookErrorFallback(confirmErrorCode))}{' '}
          <button type="button" className="underline" onClick={retryConfirm}>{t('portal.common.retry', 'Try again')}</button>
        </Notice>
      )}
    </div>
  )
}
