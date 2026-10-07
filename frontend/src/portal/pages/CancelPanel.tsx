import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { cancelErrorFallback, cancelErrorKey } from '../lib/portalApi'
import { formatDateTime } from '../lib/dates'
import { formatMoney } from '../lib/money'
import { Button } from '../ui/Button'
import { Notice } from '../ui/Notice'
import { moneyPromise } from './cancelBooking'
import type { CancelReply, PortalBooking } from '../lib/types'

export interface CancelPanelProps {
  booking: PortalBooking
  venue: { name: string; timezone: string; contact: { email: string | null; phone: string | null } }
  /** `cancelOffer(booking, now)` — decided by the sheet, so this stays a pure picture of it. */
  offer: 'offer' | 'ended' | 'contact' | 'none'
  stage: 'idle' | 'asking' | 'cancelling' | 'done'
  /** The server's error code from the last attempt, shown inside the question. */
  error: string | null
  result: CancelReply['refund'] | null
  onAsk: () => void
  onKeep: () => void
  onConfirm: () => void
}

/**
 * The foot of the booking sheet: cancel, the question before it, and what was done after. It holds no state
 * and makes no call — the sheet owns both — so every stage can be rendered and read in a test.
 *
 * The one exception is focus: moving it to the question's own heading when the panel switches to `asking`,
 * and to the result once it switches to `done`, is an effect — `renderToStaticMarkup` never runs an effect,
 * so `cancelPanel.test.tsx` cannot assert it. It is hand-traced in the task report instead. Both targets are
 * given `tabIndex={-1}`: focusable from script, never a stop in the page's own tab order.
 */
export function CancelPanel({ booking: b, venue, offer, stage, error, result, onAsk, onKeep, onConfirm }: CancelPanelProps) {
  const { t, i18n } = useTranslation()
  const headingRef = useRef<HTMLParagraphElement>(null)
  const resultRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (stage === 'asking') headingRef.current?.focus()
    else if (stage === 'done' && result) resultRef.current?.focus()
  }, [stage, result])

  const contact = venue.contact.phone || venue.contact.email
  const money = (amount: number, currency: string) => formatMoney(amount, currency, i18n.language)
  // A date is an element, not a word in a sentence: the label and the <time> sit side by side, in the
  // venue's own time zone, and no translation has to place a date inside its grammar.
  const deadline = b.cancel_deadline
    ? <time dateTime={b.cancel_deadline}>{formatDateTime(b.cancel_deadline, i18n.language, venue.timezone)}</time>
    : null

  if (stage === 'done' && result) {
    // `refund.outcome` is still the server's own truth — this never overrides `'refunded'`/`'released'`.
    // It only fills the silence `'none'` would otherwise leave for money that was recorded paid but never
    // went through us at all (staff-marked cash/transfer): the same sentence, and the same key, the
    // pre-confirm question already showed for that case.
    const venueMoney = result.outcome === 'none' && moneyPromise(b) === 'venue'
    return (
      <Notice tone="success" ref={resultRef} tabIndex={-1}>
        <p className="font-semibold">{t('portal.bookings.cancelled_done', 'Your booking is cancelled.')}</p>
        {result.outcome === 'refunded' && <p>{t('portal.bookings.cancelled_refunded', 'We have refunded {{amount}}. It can take 5–10 business days to reach your account.', { amount: money(result.amount, result.currency) })}</p>}
        {result.outcome === 'released' && <p>{t('portal.bookings.cancelled_released', 'The hold on your card has been released.')}</p>}
        {venueMoney && <p>{t('portal.bookings.cancel_money_venue', 'This booking was paid at {{venue}}. They will arrange any refund with you.', { venue: venue.name })}</p>}
        {result.coupon_released && <p>{t('portal.bookings.cancelled_coupon', 'Your coupon is back with your coupons.')}</p>}
        {result.points_reversed > 0 && <p>{t('portal.bookings.cancelled_points', 'We have taken back {{count}} points.', { count: result.points_reversed })}</p>}
      </Notice>
    )
  }

  if (offer === 'none') return null

  if (offer === 'ended' || offer === 'contact') {
    return (
      <Notice tone="info">
        {offer === 'ended' && deadline && <p>{t('portal.bookings.cancel_ended', 'Free cancellation ended')} {deadline}</p>}
        <p>
          {t('portal.bookings.contact_to_change', 'To change or cancel, contact {{venue}}.', { venue: venue.name })}
          {contact && <> <a className="text-p-accent-deep underline" href={venue.contact.phone ? `tel:${venue.contact.phone}` : `mailto:${venue.contact.email}`}>{contact}</a></>}
        </p>
      </Notice>
    )
  }

  if (stage === 'idle') {
    return (
      <div className="space-y-2">
        {deadline && <p className="text-xs text-p-text-2">{t('portal.bookings.cancel_until', 'Free cancellation until')} {deadline}</p>}
        <Button type="button" variant="danger" size="sm" onClick={onAsk}>{t('portal.bookings.cancel', 'Cancel booking')}</Button>
      </div>
    )
  }

  const promise = moneyPromise(b)
  const busy = stage === 'cancelling'
  return (
    <div role="group" aria-labelledby="p-cancel-title" className="rounded-p-card border border-p-border p-4 space-y-3">
      <p id="p-cancel-title" ref={headingRef} tabIndex={-1} className="font-semibold">{t('portal.bookings.cancel_title', 'Cancel this booking?')}</p>
      <div className="text-sm text-p-text-2 space-y-1">
        {promise === 'refund' && <p>{t('portal.bookings.cancel_refund', 'We will refund {{amount}} to the card you paid with.', { amount: money(b.total, b.currency) })}</p>}
        {promise === 'release' && <p>{t('portal.bookings.cancel_release', 'The hold on your card will be released. Nothing is charged.')}</p>}
        {promise === 'deposit' && b.deposit && <p>{t('portal.bookings.cancel_deposit', 'We will refund your deposit of {{amount}} to the card you paid with.', { amount: money(b.deposit.amount, b.currency) })}</p>}
        {promise === 'venue' && <p>{t('portal.bookings.cancel_money_venue', 'This booking was paid at {{venue}}. They will arrange any refund with you.', { venue: venue.name })}</p>}
        {promise === 'nothing' && <p>{t('portal.bookings.cancel_nothing', 'Nothing has been charged for this booking.')}</p>}
      </div>
      {error && <Notice tone="danger">{t(cancelErrorKey(error), cancelErrorFallback(error))}</Notice>}
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="secondary" disabled={busy} onClick={onKeep}>{t('portal.bookings.cancel_keep', 'Keep it')}</Button>
        <Button type="button" variant="danger" loading={busy} onClick={onConfirm}>
          {busy ? t('portal.bookings.cancelling', 'Cancelling…') : t('portal.bookings.cancel_confirm', 'Yes, cancel it')}
        </Button>
      </div>
    </div>
  )
}
