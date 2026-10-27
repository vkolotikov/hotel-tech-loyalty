import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { usePortal } from '../../PortalProvider'
import { apiErrorCode, bookErrorFallback, bookErrorKey, portalApi } from '../../lib/portalApi'
import { formatDay } from '../../lib/dates'
import { Card } from '../../ui/Card'
import { DateTime } from '../../ui/DateTime'
import { Money } from '../../ui/Money'
import { Notice } from '../../ui/Notice'
import { Skeleton } from '../../ui/Skeleton'
import type { PaymentReturn, PortalBooking } from '../../lib/types'
import { restartPath, returnConfirmOutcome, returnHasSecret, returnIntentId, returnStayNotice, returnView } from './payReturnState'
import { clearReturnStash, readReturnStash, returnIdempotencyKey } from './returnStash'

/**
 * Release 4, part C — `/portal/book/return`, where a redirect-based payment method (a bank, a wallet) sends the
 * member back. The booking flow's own state is gone by then (it lived in memory), so this page asks the server what
 * the payment is for (`portalApi.paymentReturn`: the hold or the slot named in the payment's own metadata, never
 * anything from this address but the payment's id), shows it, and confirms it once through the ordinary confirm
 * endpoint — which checks the payment, the hold or slot and the price again, and releases the card on every
 * refusal under its usual rules. Every decision is a pure function in `payReturn.ts`; this component only wires
 * them (the frontend tests render to a string and cannot run its effects).
 */
export function PayReturn() {
  const location = useLocation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const pi = returnIntentId(location.search)

  // Stripe's client secret is not needed here: out of the address bar and the history entry once the id is read.
  useEffect(() => {
    if (pi && returnHasSecret(location.search)) navigate(`/portal/book/return?payment_intent=${encodeURIComponent(pi)}`, { replace: true })
  }, [pi, location.search, navigate])

  const answer = useQuery({
    queryKey: ['portal-payment-return', pi],
    queryFn: () => portalApi.paymentReturn(pi as string),
    enabled: pi !== null,
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    retryOnMount: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  const goTo = (b: PortalBooking) => navigate(`/portal/bookings/${b.kind}/${b.id}?confirmed=1`, { replace: true })

  const confirm = useMutation({
    mutationFn: (r: PaymentReturn) => {
      const stash = readReturnStash(r.payment_intent_id)
      if (r.kind === 'stay' && r.stay) {
        return portalApi.stayConfirm({ hold_token: r.stay.hold_token, payment_intent_id: r.payment_intent_id, special_requests: stash.notes || null })
      }
      // `returnView()` only answers `confirm` for an appointment when the server rebuilt its body.
      return portalApi.confirm({ ...r.service!.body, notes: stash.notes || null, payment_intent_id: r.payment_intent_id }, returnIdempotencyKey(r.payment_intent_id, stash))
    },
    onSuccess: (res, r) => {
      clearReturnStash(r.payment_intent_id)
      qc.invalidateQueries({ queryKey: ['portal-bookings'] })
      qc.invalidateQueries({ queryKey: ['portal-bootstrap'] })
      qc.invalidateQueries({ queryKey: ['portal-offers'] })
      qc.invalidateQueries({ queryKey: ['portal-redemptions'] })
      goTo(res.booking)
    },
  })

  const view = answer.data ? returnView(answer.data) : null
  // One confirm per page, whatever re-renders (and StrictMode's repeated effect) happen.
  const started = useRef(false)
  useEffect(() => {
    if (view === 'confirm' && answer.data && !started.current) {
      started.current = true
      confirm.mutate(answer.data)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, answer.data])
  useEffect(() => {
    if (view === 'booked' && answer.data?.booking) goTo(answer.data.booking)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, answer.data])

  return (
    <PayReturnBody
      paymentIntentId={pi}
      answer={answer.data ?? null}
      answerError={answer.isError ? { code: apiErrorCode(answer.error) } : null}
      confirmState={confirm.isPending ? 'pending' : confirm.isError ? 'error' : confirm.isSuccess ? 'success' : 'idle'}
      confirmCode={confirm.isError ? apiErrorCode(confirm.error) : null}
      onRetryAnswer={() => { void answer.refetch() }}
      onRetryConfirm={() => { if (answer.data) confirm.mutate(answer.data) }}
    />
  )
}

export interface PayReturnBodyProps {
  paymentIntentId: string | null
  answer: PaymentReturn | null
  answerError: { code: string | null } | null
  confirmState: 'idle' | 'pending' | 'error' | 'success'
  confirmCode: string | null
  onRetryAnswer: () => void
  onRetryConfirm: () => void
}

/** What the return page shows, from props alone — rendered directly by the tests. */
export function PayReturnBody({ paymentIntentId, answer, answerError, confirmState, confirmCode, onRetryAnswer, onRetryConfirm }: PayReturnBodyProps) {
  const { t, i18n } = useTranslation()
  const { data } = usePortal()
  const venue = data?.venue
  const contact = venue?.contact.phone || venue?.contact.email

  const bookingsLink = <Link to="/portal/bookings" className="text-p-accent-deep underline">{t('portal.bookings.title', 'Bookings')}</Link>
  const heading = <h1 className="font-p-display text-2xl">{t('portal.payment.return_title', 'Your payment')}</h1>

  if (paymentIntentId === null || (answerError && answerError.code === 'payment_not_found')) {
    return (
      <div className="space-y-5">
        {heading}
        <Notice tone="warning"><p>{t('portal.payment.return_not_found', 'We could not find this payment. If you paid, check Bookings or contact the venue.')}</p><p className="mt-2">{bookingsLink}</p></Notice>
      </div>
    )
  }
  if (answerError) {
    return (
      <div className="space-y-5">
        {heading}
        <Notice tone="warning">
          {t(bookErrorKey(answerError.code), bookErrorFallback(answerError.code))}{' '}
          <button type="button" className="underline" onClick={onRetryAnswer}>{t('portal.common.retry', 'Try again')}</button>
        </Notice>
      </div>
    )
  }
  if (!answer) {
    return (
      <div className="space-y-5">
        {heading}
        <p className="text-sm text-p-text-2">{t('portal.payment.return_checking', 'Checking your payment…')}</p>
        <Skeleton className="h-32" />
      </div>
    )
  }

  const view = returnView(answer)
  const restart = <Link to={restartPath(answer)} className="text-p-accent-deep underline">{t('portal.payment.return_start_again', 'Start again')}</Link>
  const outcome = confirmState === 'error' ? returnConfirmOutcome(answer.kind, confirmCode) : null
  const stayNotice = outcome && answer.kind === 'stay' ? returnStayNotice(outcome, confirmCode) : null

  return (
    <div className="space-y-5">
      {heading}

      {(answer.service || answer.stay) && (
        <Card tone="paper" className="p-4 space-y-1 text-sm text-p-text-2">
          {answer.service && (
            <>
              <p className="text-p-text font-medium">{answer.service.name}</p>
              <p><DateTime iso={answer.service.start_at} mode="datetime" />{answer.service.master ? ` · ${answer.service.master}` : ''}</p>
            </>
          )}
          {answer.stay && (
            <>
              <p className="text-p-text font-medium">{answer.stay.room.name}</p>
              <p>{formatDay(answer.stay.check_in, i18n.language)} – {formatDay(answer.stay.check_out, i18n.language)}</p>
              <p>{t('portal.stay.guests_line', 'Adults: {{adults}} · children: {{children}}', { adults: answer.stay.adults, children: answer.stay.children })}</p>
            </>
          )}
          <p className="pt-1 text-p-text">{t('portal.payment.return_amount', 'Amount')}: <Money amount={answer.amount} currency={answer.currency} /></p>
        </Card>
      )}

      {view === 'booked' && (
        <Notice tone="success"><p>{t('portal.payment.return_booked', 'This payment is already booked. You will find the booking under Bookings.')}</p><p className="mt-2">{bookingsLink}</p></Notice>
      )}

      {view === 'processing' && (
        <Notice tone="info">
          {t('portal.payment.return_processing', 'Your bank is still confirming the payment. This can take a moment.')}{' '}
          <button type="button" className="underline" onClick={onRetryAnswer}>{t('portal.payment.return_check_again', 'Check again')}</button>
        </Notice>
      )}

      {view === 'failed' && (
        <Notice tone="warning"><p>{t('portal.payment.return_failed', 'The payment was not completed, so nothing was booked and nothing was charged.')}</p><p className="mt-2">{restart}</p></Notice>
      )}

      {view === 'lapsed' && (
        <Notice tone="warning"><p>{t('portal.payment.return_lapsed', 'This booking can no longer be completed and nothing was booked. If your card shows a hold for it, it is released automatically within the hour.')}</p><p className="mt-2">{restart}</p></Notice>
      )}

      {view === 'confirm' && (confirmState === 'idle' || confirmState === 'pending' || confirmState === 'success') && (
        <p className="text-sm text-p-text-2">{t('portal.payment.return_confirming', 'Confirming your booking…')}</p>
      )}

      {view === 'confirm' && outcome === 'restart' && (
        <Notice tone="danger">
          <p>{t(bookErrorKey(confirmCode), bookErrorFallback(confirmCode))}</p>
          <p className="mt-1">{t('portal.payment.return_released', 'Nothing was charged: the hold on your card has been released.')}</p>
          <p className="mt-2">{restart}</p>
        </Notice>
      )}

      {view === 'confirm' && outcome === 'retry' && (
        <Notice tone="warning">
          {stayNotice === 'retry_payment_check_failed' || answer.kind === 'service'
            ? t(bookErrorKey(confirmCode), bookErrorFallback(confirmCode))
            : t('portal.stay.confirm_retry', 'Your card has been authorised. We could not reach the booking service. Please do not pay again. Try to confirm once more.')}{' '}
          <button type="button" className="underline" onClick={onRetryConfirm}>{t('portal.common.retry', 'Try again')}</button>
        </Notice>
      )}

      {view === 'confirm' && outcome === 'contact' && (
        <Notice tone="danger">
          <p>{t('portal.stay.confirm_contact', 'Your card has been authorised, but we could not finish the booking. Please do not pay again. Check Bookings, or contact {{venue}} and we will sort it out.', { venue: venue?.name ?? '' })}</p>
          <p className="mt-2 flex flex-wrap gap-x-3">
            {bookingsLink}
            {contact && <a className="text-p-accent-deep underline" href={venue?.contact.phone ? `tel:${venue.contact.phone}` : `mailto:${venue?.contact.email}`}>{contact}</a>}
          </p>
        </Notice>
      )}
    </div>
  )
}
