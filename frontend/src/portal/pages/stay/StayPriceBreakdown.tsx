import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { usePortal } from '../../PortalProvider'
import { formatMoney } from '../../lib/money'
import { Money } from '../../ui/Money'
import { Notice } from '../../ui/Notice'
import { stayChargeLine, type StayIntentAnswer } from './staySteps'
import type { StayQuote } from '../../lib/types'

function Row({ label, children, strong = false, negative = false }: { label: string; children: ReactNode; strong?: boolean; negative?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? 'font-p-display text-lg' : 'text-sm'}`}>
      <span>{label}</span>
      <span className="tabular-nums">{negative && '−'}{children}</span>
    </div>
  )
}

export interface StayPriceBreakdownProps {
  quote: StayQuote
  /** Which screen this is rendered on — Review has taken no card yet, so an online total
   *  reads as a promise; Pay (`'pay'`, the default — this component's own, more general use)
   *  further splits into "not yet authorised" vs "authorised" via `paid` below. `StayReviewStep.tsx` passes
   *  `'review'` explicitly. */
  stage?: 'review' | 'pay'
  /** Whether the visit's card has actually been authorised — only consulted on Pay.
   *  `stayChargeLine()` must never say "reserved" (a completed fact) before this is `true`. */
  paid?: boolean
  /** The payment-intent call's own answer on Pay — wins over the
   *  quote's own `payment.mode`/total when they disagree, and `'nothing_to_pay'` reads differently from
   *  `'pay_at_venue'` (see `StayIntentAnswer`). Meaningless (and left `null`) on Review, where no such call
   *  has been made yet. */
  intentAnswer?: StayIntentAnswer
}

/** Every number here comes straight from the server's quote; nothing is computed client-side. */
export function StayPriceBreakdown({ quote: q, stage = 'pay', paid = false, intentAnswer = null }: StayPriceBreakdownProps) {
  const { t, i18n } = useTranslation()
  const { data } = usePortal()
  const venueName = data?.venue.name ?? ''
  // The card is AUTHORISED now and CAPTURED later, by the `bookings:capture-pending-pis` backstop
  // (`CapturePendingPaymentIntents`) — never synchronously inside `PortalStayBookingController::confirm()`
  // itself — so "charged now" would be wrong on Pay before `paid`, and a promise of anything already done
  // would be wrong on Review. `stayChargeLine()`, a pure function with its own tests, decides which of the
  // five lines below this quote (plus, on Pay, `paid` and the intent call's own answer) actually calls for.
  const chargeLine = stayChargeLine(q.payment.mode, q.total_amount, stage === 'pay', paid, intentAnswer)
  const amount = formatMoney(q.total_amount, q.currency, i18n.language)
  return (
    <div className="space-y-2">
      <Row label={t('portal.stay.room_line', '{{room}} · nights: {{count}}', { room: q.room.name, count: q.nights })}><Money amount={q.lines.room_total} currency={q.currency} /></Row>
      {q.lines.extras.map(l => (
        <Row key={l.id} label={`${l.name}${l.quantity > 1 ? ` × ${l.quantity}` : ''}`}><Money amount={l.line_total} currency={q.currency} /></Row>
      ))}
      <div className="border-t border-p-border pt-2">
        <Row label={t('portal.book.subtotal', 'Subtotal')}><Money amount={q.list_amount} currency={q.currency} /></Row>
      </div>
      {q.discount && (
        <Row label={q.discount.label} negative><Money amount={q.discount.amount} currency={q.currency} /></Row>
      )}
      <div className="border-t border-p-border pt-2">
        <Row label={t('portal.book.total', 'Total')} strong><Money amount={q.total_amount} currency={q.currency} /></Row>
      </div>
      {chargeLine === 'charged_now' && (
        <p className="text-xs text-p-text-2">{t('portal.stay.charged_now', 'Reserved on your card. {{venue}} charges it later: {{amount}}', { venue: venueName, amount })}</p>
      )}
      {chargeLine === 'charged_pending' && (
        <p className="text-xs text-p-text-2">{t('portal.stay.charged_pending', 'To reserve on your card now: {{amount}}. {{venue}} charges it later.', { venue: venueName, amount })}</p>
      )}
      {chargeLine === 'charged_next_step' && (
        <p className="text-xs text-p-text-2">{t('portal.stay.charged_next_step', 'To reserve on your card at the next step: {{amount}}', { amount })}</p>
      )}
      {chargeLine === 'pay_at_venue' && (
        <p className="text-xs text-p-text-2">{t('portal.stay.pay_at_venue_total', 'To pay at {{venue}}: {{amount}}', { venue: venueName, amount })}</p>
      )}
      {chargeLine === 'nothing_to_pay' && (
        <p className="text-xs text-p-text-2">{t('portal.stay.nothing_to_pay', 'Nothing to pay.')}</p>
      )}
      {q.coupon?.status === 'outbid' && (
        <Notice tone="info">
          {t('portal.book.coupon_outbid', 'Your membership discount is better than {{label}}, so we kept the bigger saving. The coupon stays available.', { label: q.coupon.label })}
        </Notice>
      )}
      {q.coupon?.status === 'wrong_scope' && (
        <Notice tone="warning">
          {t('portal.book.coupon_wrong_scope', '{{label}} does not apply to {{noun}}.', { label: q.coupon.label, noun: t('portal.vocab.hotel.booking_plural', 'stays') })}
        </Notice>
      )}
    </div>
  )
}
