import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { money as fmt } from '../lib/money'
import type { MoneyInfo } from '../appointments/lib/types'

const METHOD: Record<string, string> = { cash: 'Cash', card_desk: 'Card at the desk', transfer: 'Bank transfer', other: 'Other', online_card: 'Card, through Stripe' }

/** The full admin's read-only view of an appointment's money (Part E); taking and refunding live in the workspace. */
export function DeskMoney({ money: m, bookingId }: { money: MoneyInfo; bookingId: number }) {
  const { t } = useTranslation()
  const row = (label: string, amount: number) => (
    <div className="flex justify-between"><span className="text-gray-400">{label}</span><span className="text-white">{fmt(amount, m.currency)}</span></div>
  )

  return (
    <div className="space-y-2 text-xs">
      <p className="text-xs font-semibold text-gray-300">{t('desk_money.title', 'Money')}</p>
      {m.held_online > 0 && row(t('desk_money.held_online', 'Card held online'), m.held_online)}
      {m.paid_online > 0 && row(t('desk_money.paid_online', 'Paid online by card'), m.paid_online)}
      {m.paid_desk > 0 && row(t('desk_money.paid_desk', 'Paid at the desk'), m.paid_desk)}
      {m.paid_back > 0 && row(t('desk_money.refunded', 'Refunded'), m.paid_back)}
      {m.owed > 0 && row(t('desk_money.owed', 'Still owed'), m.owed)}
      {m.to_refund > 0 && row(t('desk_money.to_refund', 'To refund'), m.to_refund)}
      {m.legacy_marked_paid && <p className="text-gray-400">{t('desk_money.legacy', 'Marked paid (no amount recorded)')}</p>}
      {m.movements.map(mv => (
        <p key={mv.id} className="text-gray-400">
          {mv.kind === 'refund' && mv.corrects
            ? t('desk_money.kind.correction', 'Correction')
            : t(`desk_money.kind.${mv.kind}`, mv.kind === 'payment' ? 'Payment' : 'Refund')}
          {' · '}{fmt(mv.amount, mv.currency)} ·{t(`desk_money.method.${mv.method}`, METHOD[mv.method] ?? mv.method)}{mv.by ? ` · ${mv.by}` : ''}{mv.note ? ` · ${mv.note}` : ''}
        </p>
      ))}
      <Link to={`/appointments?open=${bookingId}`} className="inline-block text-emerald-400 hover:text-emerald-300 font-semibold">{t('desk_money.open', 'Take payment / Refund in HexaTech Appointments')}</Link>
    </div>
  )
}
