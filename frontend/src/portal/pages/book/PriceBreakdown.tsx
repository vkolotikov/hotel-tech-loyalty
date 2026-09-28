import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Money } from '../../ui/Money'
import { Notice } from '../../ui/Notice'
import { useVocab } from '../../lib/vocab'
import type { Quote } from '../../lib/types'

/**
 * A top-level component, not a closure inside `PriceBreakdown` — react-hooks'
 * `static-components` rule flags a function that returns JSX and is redefined
 * on every render of its parent.
 */
function Row({ label, children, strong = false, negative = false }: { label: string; children: ReactNode; strong?: boolean; negative?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? 'font-p-display text-lg' : 'text-sm'}`}>
      <span>{label}</span>
      <span className="tabular-nums">{negative && '−'}{children}</span>
    </div>
  )
}

/** Every number here comes straight from the server's quote; nothing is computed client-side. */
export function PriceBreakdown({ quote: q }: { quote: Quote }) {
  const { t } = useTranslation()
  const vocab = useVocab()
  return (
    <div className="space-y-2">
      <Row label={q.service.name}><Money amount={q.lines.service_price} currency={q.currency} /></Row>
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
      {q.coupon?.status === 'outbid' && (
        <Notice tone="info">
          {t('portal.book.coupon_outbid', 'Your membership discount is better than {{label}}, so we kept the bigger saving. The coupon stays available.', { label: q.coupon.label })}
        </Notice>
      )}
      {q.coupon?.status === 'wrong_scope' && (
        <Notice tone="warning">
          {t('portal.book.coupon_wrong_scope', '{{label}} does not apply to {{noun}}.', { label: q.coupon.label, noun: vocab('booking_plural') })}
        </Notice>
      )}
    </div>
  )
}
