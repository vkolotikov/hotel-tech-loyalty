import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

interface Row { source: string; member?: { id: number; name: string; member_number: string } | null; list_amount?: number | string | null; discount?: { amount: number; label: string } | null; total_amount: number | string; currency: string }

/** The source badge, member link and discount line printed under a service booking's total — list row and detail panel share this. */
export function ServiceBookingPricing({ row }: { row: Row }) {
  const { t } = useTranslation()
  return (
    <div className="text-xs text-[#a0a0a0] space-y-0.5">
      {row.source === 'member_portal' && <span className="inline-block px-2 py-0.5 rounded bg-primary-500/20 text-primary-300">{t('service_bookings.source_portal', 'Member portal')}</span>}
      {row.member && <div><Link className="underline" to={`/members/${row.member.id}`}>{row.member.name}</Link> · {row.member.member_number}</div>}
      {row.discount && <div>{t('service_bookings.list_price', 'List')} {Number(row.list_amount ?? 0).toFixed(2)} · {t('service_bookings.discount', 'Discount')} −{row.discount.amount.toFixed(2)} ({row.discount.label})</div>}
    </div>
  )
}
