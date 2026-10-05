import { useTranslation } from 'react-i18next'
import { money as fmt } from '../../lib/money'
import type { MoneyInfo } from '../lib/types'
import { formatInstant } from '../lib/wallClock'
import { KIND_FALLBACK, METHOD_FALLBACK, kindKey } from './moneyLines'

/** What the appointment costs, what came in and went back, what is still owed, and every movement (Part E). */
export function MoneyBlock({ money: m, locale, zone }: { money: MoneyInfo; locale: string; zone: string }) {
  const { t } = useTranslation()
  const row = (label: string, amount: number, strong = false) => (
    <div className="flex justify-between gap-3"><dt className="text-a-text-2">{label}</dt><dd className={strong ? 'font-semibold text-a-text' : 'text-a-text'}>{fmt(amount, m.currency)}</dd></div>
  )

  return (
    <section className="rounded-lg border border-a-border p-3 text-sm space-y-2">
      <h3 className="font-semibold text-a-text">{t('appointments.money.title', 'Money')}</h3>
      <dl className="space-y-1">
        {m.held_online > 0 && row(t('appointments.money.held_online', 'Card held online'), m.held_online)}
        {m.paid_online > 0 && row(t('appointments.money.paid_online', 'Paid online by card'), m.paid_online)}
        {m.paid_desk > 0 && row(t('appointments.money.paid_desk', 'Paid at the desk'), m.paid_desk)}
        {m.paid_back > 0 && row(t('appointments.money.refunded', 'Refunded'), m.paid_back)}
        {m.owed > 0 && row(t('appointments.money.owed', 'Still owed'), m.owed, true)}
      </dl>
      {m.legacy_marked_paid && <p className="text-a-text-2">{t('appointments.money.legacy', 'Marked paid (no amount recorded)')}</p>}
      {m.to_refund > 0 && <p className="text-a-text">{t('appointments.money.to_refund', '{{amount}} to refund — a manager can refund it', { amount: fmt(m.to_refund, m.currency) })}</p>}
      {m.movements.length > 0 && (
        <ol className="space-y-1 border-t border-a-border pt-2">
          {m.movements.map(mv => (
            <li key={mv.id} className="flex flex-wrap gap-x-2 text-a-text-2">
              <span className="font-medium text-a-text">{t(`appointments.money.kind.${kindKey(mv)}`, KIND_FALLBACK[kindKey(mv)])}</span>
              <span>{fmt(mv.amount, mv.currency)}</span>
              <span>{t(`appointments.money.method.${mv.method}`, METHOD_FALLBACK[mv.method])}</span>
              {mv.by && <span>{t('appointments.money.by', 'by {{name}}', { name: mv.by })}</span>}
              {mv.at && <time dateTime={mv.at}>{formatInstant(mv.at, locale, zone)}</time>}
              {mv.note && <span className="w-full">{mv.note}</span>}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
