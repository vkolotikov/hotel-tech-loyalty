import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { apiErrorCode, bookErrorFallback, bookErrorKey, portalApi } from '../../lib/portalApi'
import { formatDay } from '../../lib/dates'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { Field, INPUT_CLASS } from '../../ui/Field'
import { Money } from '../../ui/Money'
import { Notice } from '../../ui/Notice'
import { Skeleton } from '../../ui/Skeleton'
import { Toggle } from '../../ui/Toggle'
import { CouponField } from '../book/CouponField'
import { StayPriceBreakdown } from './StayPriceBreakdown'
import { afterStayQuoteError, stayQuoteBody, type StayReviewPatch, type StayState } from './staySteps'
import type { CouponRef, StayCatalogue, StayQuote, StayQuoteBody } from '../../lib/types'

export interface StayReviewStepProps {
  catalogue: StayCatalogue
  state: StayState
  onChange: (patch: StayReviewPatch) => void
  onBack: () => void
  /** A quote error that belongs to an earlier step (the room is gone, the dates are not sold). */
  onBounce: (to: 'dates' | 'room', code: string) => void
  /** The requests travel with the quote in ONE call. */
  onContinue: (quote: StayQuote, requests: string) => void
}

/**
 * The quote query. `retry: false` — a 409/422 is the server's answer, not a hiccup. `staleTime: 0` and
 * `gcTime: 0` — a price the member is about to accept is always the server's answer for the current choice,
 * and a quote names a hold that lapses: a cached one must never be handed back.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function stayQuoteQueryOptions(body: StayQuoteBody) {
  return { queryKey: ['portal-stay-quote', body], queryFn: () => portalApi.stayQuote(body), retry: false, retryOnMount: false, staleTime: 0, gcTime: 0 } as const
}

export function StayReviewStep({ catalogue, state, onChange, onBack, onBounce, onContinue }: StayReviewStepProps) {
  const { t, i18n } = useTranslation()
  // Local: the requests do not affect the price, so typing must not touch the quote's inputs.
  const [requests, setRequests] = useState(state.requests)
  const body = useMemo(() => stayQuoteBody(state), [state])
  const quote = useQuery(stayQuoteQueryOptions(body))
  const code = quote.isError ? apiErrorCode(quote.error) : null
  const decision = afterStayQuoteError(code)
  const otherError = quote.isError && decision === null && code !== 'extra_lead_time'

  // The error CODE, kept in state: clearing the coupon changes the query key, the query moves on, and a
  // value derived from `code` would vanish with it before the member could read why the coupon was dropped.
  const [couponNotice, setCouponNotice] = useState<string | null>(null)
  const couponErrorMessage = couponNotice ? t(bookErrorKey(couponNotice), bookErrorFallback(couponNotice)) : null

  // The decision is `afterStayQuoteError()`, a pure function with its own tests; this effect only applies
  // it. `state.coupon`, `onChange` and `onBounce` are read and deliberately left out of the deps: the
  // handlers are fresh closures every render, and this must run when the error appears, not on every render.
  useEffect(() => {
    const result = afterStayQuoteError(code)
    if (!result) return
    if (result.to) {
      onBounce(result.to, result.noticeCode)
      return
    }
    if (result.patch && state.coupon !== null) {
      onChange(result.patch)
      setCouponNotice(result.noticeCode)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  const handleCouponChange = (c: CouponRef | null) => {
    setCouponNotice(null)
    onChange({ coupon: c })
  }

  const room = catalogue.rooms.find(r => r.id === state.roomId)
  const policy = quote.data?.policy

  return (
    <div className="space-y-5">
      <h2 tabIndex={-1} data-step-heading="review" className="sr-only">{t('portal.stay.heading_review', 'Check the details')}</h2>
      <Card className="p-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-medium">{quote.data?.room.name ?? room?.name}</p>
          <p className="text-sm text-p-text-2">{state.checkIn && formatDay(state.checkIn, i18n.language)} – {state.checkOut && formatDay(state.checkOut, i18n.language)}</p>
          <p className="text-sm text-p-text-2">{t('portal.stay.guests_line', 'Adults: {{adults}} · children: {{children}}', { adults: state.adults, children: state.children })}</p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>{t('portal.book.change', 'Change')}</Button>
      </Card>

      {catalogue.extras.length > 0 && (
        <section className="space-y-1">
          <h3 className="text-sm font-medium">{t('portal.stay.extras', 'Add-ons')}</h3>
          {catalogue.extras.map(x => (
            <Toggle
              key={x.id}
              label={x.name}
              hint={<Money amount={x.price} currency={catalogue.rules.currency} />}
              checked={state.extras.includes(x.id)}
              onChange={on => onChange({ extras: on ? [...state.extras, x.id] : state.extras.filter(id => id !== x.id) })}
            />
          ))}
          {code === 'extra_lead_time' && <Notice tone="warning">{t(bookErrorKey(code), bookErrorFallback(code))}</Notice>}
        </section>
      )}

      <Field label={t('portal.stay.requests', 'Special requests')} hint={t('portal.stay.requests_hint', 'Optional')}>
        {/* Kept live locally so typing never perturbs the quote's own query key, and pushed to `state` on
           blur — still outside `stayQuoteBody()`, so this never asks for a new price
           — so pressing Change and coming back (Room, then back to Review) doesn't lose what was typed. */}
        <textarea className={INPUT_CLASS} rows={3} maxLength={500} value={requests} onChange={e => setRequests(e.target.value)} onBlur={e => onChange({ requests: e.target.value })} />
      </Field>

      <CouponField value={state.coupon} onChange={handleCouponChange} quote={quote.data ?? null} quoteErrorMessage={couponErrorMessage} />

      {quote.isPending && <Skeleton className="h-28" />}

      {otherError && (
        <div className="space-y-3">
          <Notice tone="danger">{t('portal.common.error', 'Something went wrong. Please try again.')}</Notice>
          <Button variant="secondary" size="sm" onClick={() => { void quote.refetch() }}>{t('portal.common.retry', 'Try again')}</Button>
        </div>
      )}

      {quote.data && <Card tone="paper" className="p-4"><StayPriceBreakdown quote={quote.data} stage="review" /></Card>}

      {policy && (
        <div className="text-xs text-p-text-2 space-y-1">
          <p>{t('portal.stay.arrival_from', 'Arrival from {{time}}', { time: policy.check_in_time })} · {t('portal.stay.departure_by', 'Departure by {{time}}', { time: policy.check_out_time })}</p>
          {policy.cancel_hours > 0 && <p>{t('portal.stay.free_cancellation', 'Free cancellation up to {{count}} hours before arrival.', { count: policy.cancel_hours })}</p>}
          {policy.cancellation_policy && <p><span className="font-medium">{t('portal.bookings.policy', 'Cancellation policy')}:</span> {policy.cancellation_policy}</p>}
        </div>
      )}

      <Button type="button" full disabled={!quote.data} onClick={() => { if (quote.data) onContinue(quote.data, requests) }}>
        {t('portal.book.continue', 'Continue')}
      </Button>
    </div>
  )
}
