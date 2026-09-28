import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { apiErrorCode, bookErrorFallback, bookErrorKey, portalApi } from '../../lib/portalApi'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { DateTime } from '../../ui/DateTime'
import { Field, INPUT_CLASS } from '../../ui/Field'
import { Money } from '../../ui/Money'
import { Notice } from '../../ui/Notice'
import { Skeleton } from '../../ui/Skeleton'
import { Stepper } from '../../ui/Stepper'
import { Toggle } from '../../ui/Toggle'
import { CouponField } from './CouponField'
import { PriceBreakdown } from './PriceBreakdown'
import { afterQuoteError, type BookState, type ReviewPatch } from './steps'
import type { Catalogue, CouponRef, Quote, QuoteBody } from '../../lib/types'

export interface ReviewStepProps {
  catalogue: Catalogue
  state: BookState
  onChange: (patch: ReviewPatch) => void
  onBack: () => void
  /** The notes travel with the quote in ONE call (final review, Important 1): a separate `onChange({ notes })`
   *  before it was overwritten by the step change built from the same render's state. */
  onContinue: (quote: Quote, notes: string) => void
}

/** The quote's own booking-window codes: the slot is gone or the chosen time no longer fits the venue's
 *  lead/advance-booking rules — none of these can be fixed by anything on this screen, so the member goes
 *  back to When rather than being offered a "try again" that would fail the same way. */
const WINDOW_CODES = new Set(['slot_taken', 'too_soon', 'too_far_ahead'])

/** service_id/start_at/etc. only — notes are sent at confirm (Task 17), never here: they cost nothing to
 *  change, so they must not perturb the quote's query key and re-fetch a price that hasn't moved. */
// eslint-disable-next-line react-refresh/only-export-components
export function quoteBody(state: BookState): QuoteBody {
  return {
    service_id: state.serviceId!,
    master_id: state.masterId,
    start_at: state.startAt!,
    party_size: state.partySize,
    extras: state.extras.map(id => ({ id, quantity: 1 })),
    coupon: state.coupon,
  }
}

/**
 * The quote query. `retry: false` — a 409/422 is a real answer from the server, not a network hiccup; show it at
 * once, with its own "Try again". `staleTime: 0` and `gcTime: 0` — the app-wide client keeps data fresh for 30 s,
 * which served a cached quote (coupon applied, old total, Continue enabled) when a member re-selected a chip the
 * server had since refused; a price the member is about to accept is always the server's answer for the current
 * selection. Because of `gcTime: 0` the entry, failed or not, is dropped once Review unmounts, so coming back to
 * Review always asks the server again — unlike Book.tsx/WhenStep.tsx, a failed quote is NOT kept failed across a
 * remount; `retryOnMount: false` only matters while the failed entry is still cached.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function quoteQueryOptions(body: QuoteBody) {
  return { queryKey: ['portal-quote', body], queryFn: () => portalApi.quote(body), retry: false, retryOnMount: false, staleTime: 0, gcTime: 0 } as const
}

export function ReviewStep({ catalogue, state, onChange, onBack, onContinue }: ReviewStepProps) {
  const { t } = useTranslation()
  // Local and separate from `state.notes`: notes don't affect price, so keeping them here (handed to the
  // parent only with Continue, in the same call as the quote) keeps every keystroke from touching the quote's
  // inputs.
  const [notes, setNotes] = useState(state.notes)
  // A new `state` object (a notice cleared, say) gives a new body with the same fields; react-query hashes
  // the key by value, so that is the same query — only a change to a pricing field asks the server again.
  const body = useMemo(() => quoteBody(state), [state])
  const quote = useQuery(quoteQueryOptions(body))
  const code = quote.isError ? apiErrorCode(quote.error) : null
  const windowCode = code !== null && WINDOW_CODES.has(code) ? code : null
  const quoteHasCouponError = code !== null && code.startsWith('coupon_')
  const otherError = quote.isError && !windowCode && !quoteHasCouponError && code !== 'extra_lead_time'

  // The error CODE, not the sentence — set by the effect below, from `afterQuoteError()`, and read back into
  // a sentence just before rendering. Kept in state (rather than derived fresh from `code` every render)
  // because clearing the coupon changes the quote's query key: the query moves on to a new (successful)
  // fetch, `code` goes back to `null`, and a value derived straight from it would vanish along with it —
  // the member would never get to read why their coupon was dropped.
  const [couponNotice, setCouponNotice] = useState<string | null>(null)
  const couponErrorMessage = couponNotice ? t(bookErrorKey(couponNotice), bookErrorFallback(couponNotice)) : null

  // The decision itself — which codes clear the coupon, and what to tell the member — is `afterQuoteError()`,
  // a pure function with its own tests: this effect only applies what it returns. `state.coupon`/`onChange`
  // are read but deliberately left out of the deps: `onChange` is a fresh closure every render (Book.tsx
  // rebuilds it on every state change), so depending on it would rerun this on every unrelated render, not
  // just when the error itself appears; the `state.coupon === null` guard (not a dependency either) stops
  // this from re-firing pointlessly once the coupon is already gone.
  useEffect(() => {
    const result = afterQuoteError(code)
    if (!result || state.coupon === null) return
    onChange(result.patch)
    setCouponNotice(result.noticeCode)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  // Any coupon change the member makes themselves — picking a different chip, applying a new code, or
  // pressing Remove — retires whatever notice is showing; it was about the *previous* coupon.
  const handleCouponChange = (c: CouponRef | null) => {
    setCouponNotice(null)
    onChange({ coupon: c })
  }

  const service = catalogue.services.find(s => s.id === state.serviceId)

  return (
    <div className="space-y-5">
      {/* The step's heading, focused by Book after a step change; visually hidden, as on Service. */}
      <h2 tabIndex={-1} data-step-heading="review" className="sr-only">{t('portal.book.heading_review', 'Check the details')}</h2>
      <Card className="p-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-medium">{service?.name}</p>
          {state.startAt && <p className="text-sm text-p-text-2"><DateTime iso={state.startAt} mode="datetime" /></p>}
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>{t('portal.book.change', 'Change')}</Button>
      </Card>

      <Stepper
        label={t('portal.book.party_size', 'How many people')}
        value={state.partySize}
        min={1}
        max={10}
        onChange={v => onChange({ partySize: v })}
        fewerLabel={t('portal.book.fewer', 'Fewer')}
        moreLabel={t('portal.book.more', 'More')}
      />

      {catalogue.extras.length > 0 && (
        <section className="space-y-1">
          <h3 className="text-sm font-medium">{t('portal.book.extras', 'Add-ons')}</h3>
          {catalogue.extras.map(x => (
            <Toggle
              key={x.id}
              label={x.name}
              hint={<Money amount={x.price} currency={x.currency ?? catalogue.rules.currency} />}
              checked={state.extras.includes(x.id)}
              onChange={on => onChange({ extras: on ? [...state.extras, x.id] : state.extras.filter(id => id !== x.id) })}
            />
          ))}
          {code === 'extra_lead_time' && (
            <Notice tone="warning">{t(bookErrorKey(code), bookErrorFallback(code))}</Notice>
          )}
        </section>
      )}

      <Field label={t('portal.book.notes', 'Anything we should know?')} hint={t('portal.book.notes_hint', 'Optional')}>
        <textarea className={INPUT_CLASS} rows={3} maxLength={500} value={notes} onChange={e => setNotes(e.target.value)} />
      </Field>

      <CouponField
        value={state.coupon}
        onChange={handleCouponChange}
        quote={quote.data ?? null}
        quoteErrorMessage={couponErrorMessage}
      />

      {quote.isPending && <Skeleton className="h-28" />}

      {windowCode && (
        <Notice tone="warning">
          {t(bookErrorKey(windowCode), bookErrorFallback(windowCode))}{' '}
          <button type="button" className="underline" onClick={onBack}>{t('portal.book.change', 'Change')}</button>
        </Notice>
      )}

      {otherError && (
        <div className="space-y-3">
          <Notice tone="danger">{t('portal.common.error', 'Something went wrong. Please try again.')}</Notice>
          <Button variant="secondary" size="sm" onClick={() => { void quote.refetch() }}>{t('portal.common.retry', 'Try again')}</Button>
        </div>
      )}

      {quote.data && <Card tone="paper" className="p-4"><PriceBreakdown quote={quote.data} /></Card>}
      {quote.data?.policy.cancellation_policy && (
        <p className="text-xs text-p-text-2"><span className="font-medium">{t('portal.bookings.policy', 'Cancellation policy')}:</span> {quote.data.policy.cancellation_policy}</p>
      )}

      <Button
        type="button"
        full
        disabled={!quote.data}
        onClick={() => { if (quote.data) onContinue(quote.data, notes) }}
      >
        {t('portal.book.continue', 'Continue')}
      </Button>
    </div>
  )
}
