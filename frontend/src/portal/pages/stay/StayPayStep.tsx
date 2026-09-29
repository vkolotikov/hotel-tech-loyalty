import { Suspense, lazy, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { usePortal } from '../../PortalProvider'
import { apiErrorCode, bookErrorFallback, bookErrorKey, portalApi } from '../../lib/portalApi'
import { formatDay } from '../../lib/dates'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { Notice } from '../../ui/Notice'
import { Skeleton } from '../../ui/Skeleton'
import type { PayVisit } from '../book/steps'
import { StayPriceBreakdown } from './StayPriceBreakdown'
import { afterStayConfirmError, payView, retryConfirmArgs, showCardUnavailable, stayBounceArgs, stayIntentErrorKind, stayPayNoticeKind, type StayIntentAnswer, type StayState } from './staySteps'
import type { PortalBooking, StayQuote } from '../../lib/types'

const StripePayment = lazy(() => import('../book/StripePayment'))

export interface StayPayStepProps {
  /** The quote the member accepted; it names the hold everything here pays for and confirms. */
  quote: StayQuote
  state: StayState
  /** The current attempt to pay, owned by `StayBook` so it lives as long as the attempt, not this component. */
  visit: PayVisit
  onVisitChange: (patch: Partial<PayVisit>) => void
  /** `clearRoom` travels with the bounce itself — computed once, here, from `afterStayConfirmError`'s own
   *  decision — so `StayBook` never has to recompute it (and never needs to know `paid` to do so). */
  onBack: (to: 'dates' | 'room' | 'review', code: string, clearRoom: boolean) => void
  onDone: (booking: PortalBooking) => void
}

const freshId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `k-${Date.now()}-${Math.random()}`)

export function StayPayStep({ quote, state, visit, onVisitChange, onBack, onDone }: StayPayStepProps) {
  const { t, i18n } = useTranslation()
  const { data, refetch } = usePortal()
  const qc = useQueryClient()
  const venue = data?.venue
  const contact = venue?.contact.phone || venue?.contact.email

  const online = quote.payment.mode === 'online'
  // A zero total is never chargeable online, whatever the mode — decided from the
  // quote alone, before the payment-intent query's own `enabled` is even evaluated, so a zero-total online
  // booking never asks for an intent at all.
  const chargeable = online && quote.total_amount > 0
  const publishableKey = data?.capabilities.payments.publishable_key ?? null

  // ONE payment-intent request per visit: keyed on `visit.nonce`, every automatic refetch off, `gcTime: 0`.
  // A cached, server-cancelled intent must never be handed back, and nothing may swap the `clientSecret`
  // a mounted `<Elements>` already has. Disabled once a card is held, the visit needs no card, or the
  // quote's own total is zero.
  const intent = useQuery({
    queryKey: ['portal-stay-payment-intent', visit.nonce],
    queryFn: () => portalApi.stayPaymentIntent(quote.hold_token),
    enabled: chargeable && !!publishableKey && !visit.paid && !visit.noCard,
    staleTime: Infinity,
    gcTime: 0,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
    retryOnMount: false,
  })
  const intentErrorCode = intent.isError ? apiErrorCode(intent.error) : null
  const intentKind = intentErrorCode !== null ? stayIntentErrorKind(intentErrorCode) : null
  const nothingToCharge = visit.noCard || intentKind === 'nothing_to_charge'
  const holdGone = intentKind === 'hold_gone'
  // The breakdown needs to tell `nothing_to_pay` and `pay_at_venue` APART (unlike
  // `nothingToCharge` above, which deliberately merges them for the "offer Confirm without a card" button) —
  // this reads the specific code straight off the current failure when there is one; once `visit.noCard` is
  // remembered without a fresh code to re-derive it from (the intent query is now disabled — a remount after
  // jumping away from Pay and back, say), it falls back to `'pay_at_venue'`, the safer of the two ("owed,
  // just not online") rather than silently reverting to "charged now" for what may still be an online quote.
  const intentAnswer: StayIntentAnswer =
    intentErrorCode === 'nothing_to_pay' || intentErrorCode === 'pay_at_venue' ? intentErrorCode : visit.noCard ? 'pay_at_venue' : null
  // The mode comes from the quote, the key from the bootstrap; a missing key is never a blank step, but
  // it is never shown once the card is captured, or once the visit already knows it needs no
  // card online at all (`showCardUnavailable`, a pure function with its own test).
  const noKey = showCardUnavailable(chargeable, !!publishableKey, visit.paid, nothingToCharge)
  // A fresh nonce, not a refetch of the one that failed.
  const retryIntent = () => onVisitChange({ nonce: freshId() })

  useEffect(() => {
    if (nothingToCharge && !visit.noCard) onVisitChange({ noCard: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nothingToCharge])

  // The hold lapsed or its price moved before a card was ever asked for: back to Review, which asks for a
  // fresh price and with it a fresh hold. Nothing is held yet, so nothing needs releasing.
  useEffect(() => {
    if (holdGone) onBack('review', intentErrorCode as string, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdGone, intentErrorCode])

  const confirm = useMutation({
    mutationFn: (vars: { paymentIntentId: string | null; paid: boolean }) =>
      portalApi.stayConfirm({ hold_token: quote.hold_token, payment_intent_id: vars.paymentIntentId, special_requests: state.requests || null }),
    onSuccess: (r, vars) => {
      // `vars.paid` — the paid state AT THE TIME of THIS confirm attempt, from react-query's own recorded
      // mutation variables, never the (possibly since-changed) `visit` prop closure.
      if (vars.paid) qc.removeQueries({ queryKey: ['portal-stay-payment-intent'] })
      // Everything the booking could have changed: the list, the upcoming count, the coupons, the rooms free.
      qc.invalidateQueries({ queryKey: ['portal-bookings'] })
      qc.invalidateQueries({ queryKey: ['portal-bootstrap'] })
      qc.invalidateQueries({ queryKey: ['portal-offers'] })
      qc.invalidateQueries({ queryKey: ['portal-redemptions'] })
      qc.invalidateQueries({ queryKey: ['portal-stay-availability'] })
      onDone(r.booking)
    },
    onError: (_err, vars) => {
      if (vars.paid) qc.removeQueries({ queryKey: ['portal-stay-payment-intent'] })
    },
  })
  const confirmErrorCode = confirm.isError ? apiErrorCode(confirm.error) : null
  // Same reasoning as `onSuccess`/`onError`: the paid state this particular answer belongs to, not a
  // closure over `visit.paid` that may have moved on by the time it settles.
  const confirmPaid = confirm.variables?.paid ?? visit.paid
  const confirmDecision = confirm.isError ? afterStayConfirmError(confirmErrorCode, confirmPaid) : null

  // The decision is `afterStayConfirmError()`, a pure function with its own exhaustive tests; this effect
  // only applies it. Once the card is authorised (`paid`), only a decision that actually releases something
  // — `to` is a real step, never `'pay'` or `null` — may send the member away; a `hold: 'contact'`/`'retry'`
  // decision stays right here, on Pay, and is rendered from `payView()` below instead.
  useEffect(() => {
    if (!confirm.isError) return
    const decision = afterStayConfirmError(confirmErrorCode, confirmPaid)
    const args = stayBounceArgs(decision, confirmErrorCode as string)
    if (!args) return
    qc.invalidateQueries({ queryKey: ['portal-stay-availability'] })
    onBack(args.to, args.code, args.clearRoom)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirm.isError, confirmErrorCode, confirmPaid])

  const onPayStart = () => onVisitChange({ held: true })
  const onPayFailed = () => onVisitChange({ held: false })
  const onPaid = (paymentIntentId: string) => {
    onVisitChange({ paymentIntentId, paid: true, held: true })
    confirm.mutate({ paymentIntentId, paid: true })
  }
  /** The pay-at-venue / nothing-to-pay confirm: nothing was ever authorised, so `paid: false`. */
  const confirmWithoutCard = () => confirm.mutate({ paymentIntentId: null, paid: false })
  /** The SAME hold and the SAME payment intent id as whatever this visit last tried — never a new one —
   *  whether that's a plain "no answer at all" retry or the "never blank" resend after a captured card.
   *  `retryConfirmArgs`, a pure function with its own test. */
  const retryConfirm = () => confirm.mutate(retryConfirmArgs(visit))

  const hold: 'contact' | 'retry' | null = confirmDecision && confirmDecision.to === 'pay' ? confirmDecision.hold : null
  // Which of the five sentences to show — `stayPayNoticeKind`, a pure function with
  // its own test covering every `{ hold, paid, code }` combination.
  const noticeKind = stayPayNoticeKind(hold, visit.paid, confirmErrorCode)
  const view = payView({
    online,
    total: quote.total_amount,
    noCard: nothingToCharge,
    cardReady: !!intent.data,
    paid: visit.paid,
    confirm: confirm.isPending ? 'pending' : confirm.isSuccess ? 'success' : 'idle',
    hold,
  })

  return (
    <div className="space-y-5">
      <h2 tabIndex={-1} data-step-heading="pay" className="sr-only">{t('portal.stay.heading_pay', 'Confirm your stay')}</h2>
      {/* What and when, on the screen where the member commits to it. */}
      <Card tone="paper" className="p-4 space-y-3">
        <div className="text-sm text-p-text-2">
          <p className="text-p-text font-medium">{quote.room.name}</p>
          <p>{formatDay(quote.check_in, i18n.language)} – {formatDay(quote.check_out, i18n.language)}</p>
          <p>{t('portal.stay.guests_line', 'Adults: {{adults}} · children: {{children}}', { adults: quote.adults, children: quote.children })}</p>
        </div>
        <StayPriceBreakdown quote={quote} stage="pay" paid={visit.paid} intentAnswer={intentAnswer} />
      </Card>

      {noKey && (
        <Notice tone="warning">
          {t('portal.book.card_unavailable', 'Online payment is unavailable right now. Please try again in a moment.')}{' '}
          <button type="button" className="underline" onClick={() => { void refetch() }}>{t('portal.common.retry', 'Try again')}</button>
        </Notice>
      )}

      {/* The breakdown above already says "Nothing to pay." for a zero total — this
         view does not repeat it in a second notice. */}
      {!noKey && view === 'nothing_to_pay' && (
        <Button type="button" full loading={confirm.isPending} onClick={confirmWithoutCard}>
          {t('portal.stay.confirm', 'Confirm stay')}
        </Button>
      )}

      {/* The breakdown above already names the amount ("To pay at {{venue}}: …") — this
         view shows no separate notice repeating it with no amount ("Nothing to pay now. Settle up
         when you visit."). */}
      {!noKey && view === 'at_venue' && (
        <Button type="button" full loading={confirm.isPending} onClick={confirmWithoutCard}>
          {t('portal.stay.confirm', 'Confirm stay')}
        </Button>
      )}

      {!noKey && view === 'loading_card' && (
        intent.isError ? (
          <Notice tone="warning">
            {t('portal.book.card_unavailable', 'Online payment is unavailable right now. Please try again in a moment.')}{' '}
            <button type="button" className="underline" onClick={retryIntent}>{t('portal.common.retry', 'Try again')}</button>
          </Notice>
        ) : (
          <>
            <p className="text-sm text-p-text-2">{t('portal.book.card_loading', 'Loading secure payment…')}</p>
            <Skeleton className="h-40" />
          </>
        )
      )}

      {!noKey && view === 'card' && intent.data && (
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

      {view === 'confirming' && <p className="text-sm text-p-text-2">{t('portal.book.confirming', 'Confirming…')}</p>}

      {/* The server's answer released nothing — the member must stop, never pay again if they DID pay, and
         never be offered a retry here (a `confirm_failed` may even mean the booking already exists): only a
         link to check, and the venue's own contact, same as the room step's own. A
         pay-at-venue member (no card on this visit at all) gets the `_unpaid` sentence — `noticeKind`, from
         `stayPayNoticeKind()`, decides which. */}
      {view === 'contact' && (
        <Notice tone="danger">
          {/* Names the link by its real label (below) — "My bookings" doesn't exist. */}
          <p>{noticeKind === 'contact_unpaid'
            ? t('portal.stay.confirm_contact_unpaid', 'We could not finish the booking. It may still have gone through: check Bookings, or contact {{venue}} before trying again.', { venue: venue?.name ?? '' })
            : t('portal.stay.confirm_contact', 'Your card has been authorised, but we could not finish the booking. Please do not pay again. Check Bookings, or contact {{venue}} and we will sort it out.', { venue: venue?.name ?? '' })}</p>
          <p className="mt-2 flex flex-wrap gap-x-3">
            <Link to="/portal/bookings" className="text-p-accent-deep underline">{t('portal.bookings.title', 'Bookings')}</Link>
            {contact && <a className="text-p-accent-deep underline" href={venue?.contact.phone ? `tel:${venue.contact.phone}` : `mailto:${venue?.contact.email}`}>{contact}</a>}
          </p>
        </Notice>
      )}

      {/* Never a blank pay step. Covers `hold: 'retry'` (the notice above explains
         why) and the defensive "paid, but no confirm has been tried yet" case, with the SAME real Button —
         never a plain link — disabled while a confirm is in flight. */}
      {view === 'confirm_button' && (
        <>
          {hold === 'retry' && (
            <Notice tone="warning">
              {/* payment_check_failed gets its OWN sentence
                 (identical to the server's, kept in sync by portalApi.test.ts) regardless of `paid` — its
                 copy never claims a card exists either way. Otherwise `noticeKind` picks the paid or
                 unpaid variant of the generic retry copy — a pay-at-venue member has no card to have been
                 "authorised" at all. */}
              {noticeKind === 'retry_payment_check_failed'
                ? t(bookErrorKey(confirmErrorCode), bookErrorFallback(confirmErrorCode))
                : noticeKind === 'retry_unpaid'
                  ? t('portal.stay.confirm_retry_unpaid', 'We could not reach the booking service. Please try to confirm once more.')
                  : t('portal.stay.confirm_retry', 'Your card has been authorised. We could not reach the booking service. Please do not pay again. Try to confirm once more.')}
            </Notice>
          )}
          <Button type="button" full loading={confirm.isPending} onClick={retryConfirm}>
            {t('portal.book.confirm', 'Confirm booking')}
          </Button>
        </>
      )}

      {/* Nothing was ever authorised (`paid` false the whole time) and the confirm itself hit a network
         error: the same pay-at-venue confirm is safe to resend, so this is a plain retry alongside
         whichever button above already offers one. */}
      {confirmDecision && confirmDecision.to === null && (
        <Notice tone="danger">
          {t(bookErrorKey(confirmErrorCode), bookErrorFallback(confirmErrorCode))}{' '}
          <button type="button" className="underline" onClick={retryConfirm}>{t('portal.common.retry', 'Try again')}</button>
        </Notice>
      )}
    </div>
  )
}
