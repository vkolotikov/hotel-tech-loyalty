import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { money as fmt } from '../../lib/money'
import { useBoot } from '../AppointmentsProvider'
import { appointmentsApi } from '../lib/api'
import type { DateKey, RefundVia, Takings } from '../lib/types'
import { formatInstant } from '../lib/wallClock'
import { KIND_FALLBACK, METHOD_FALLBACK, kindKey } from '../panel/moneyLines'
import { Field } from '../ui/Field'
import { Notice } from '../ui/Notice'

const METHODS: RefundVia[] = ['cash', 'card_desk', 'transfer', 'other', 'online_card']

/** One day's takings for cashing up (Part E, managers only; the server refuses everyone else). */
export function TakingsPage() {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const [date, setDate] = useState<DateKey>(boot.venue.today)
  const q = useQuery({ queryKey: ['appointments', 'takings', date], queryFn: () => appointmentsApi.takings(date) })

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <h1 className="text-xl font-semibold text-a-text">{t('appointments.takings.title', 'Takings')}</h1>
      <Field label={t('appointments.takings.day', 'Day')}>
        <input type="date" className="rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text" value={date} onChange={(e) => { if (e.target.value) setDate(e.target.value) }} />
      </Field>
      {q.isError && <Notice tone="danger">{t('appointments.common.error', 'Something went wrong. Please try again.')}</Notice>}
      {q.data && <TakingsView data={q.data} locale={i18n.language || 'en'} zone={boot.venue.timezone} />}
    </div>
  )
}

export function TakingsView({ data, locale, zone }: { data: Takings; locale: string; zone: string }) {
  const { t } = useTranslation()
  const currencies = Object.keys(data.totals)

  if (data.rows.length === 0 && Object.keys(data.online).length === 0) {
    return <p className="text-sm text-a-text-2">{t('appointments.takings.none', 'No money was recorded on this day.')}</p>
  }

  return (
    <div className="space-y-4 text-sm">
      {currencies.map(cur => (
        <table key={cur} className="w-full max-w-xl">
          <thead><tr className="text-left text-a-text-2"><th className="py-1">{t('appointments.takings.method', 'Method')}</th><th className="text-right">{t('appointments.takings.in', 'In')}</th><th className="text-right">{t('appointments.takings.out', 'Out')}</th><th className="text-right">{t('appointments.takings.net', 'Net')}</th></tr></thead>
          <tbody>
            {METHODS.filter(m => data.totals[cur][m].in > 0 || data.totals[cur][m].out > 0).map(m => (
              <tr key={m} className="border-t border-a-border">
                <td className="py-1 text-a-text">{t(`appointments.money.method.${m}`, METHOD_FALLBACK[m])}</td>
                <td className="text-right">{fmt(data.totals[cur][m].in, cur)}</td>
                <td className="text-right">{fmt(data.totals[cur][m].out, cur)}</td>
                <td className="text-right font-semibold">{fmt(data.totals[cur][m].in - data.totals[cur][m].out, cur)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
      {Object.entries(data.online).map(([cur, amount]) => (
        <p key={cur} className="text-a-text-2">{t('appointments.takings.online', "Paid online for this day's appointments: {{amount}}", { amount: fmt(amount, cur) })}</p>
      ))}
      {data.rows.length > 0 && (
        <ol className="space-y-1">
          {data.rows.map(r => (
            <li key={r.id} className="flex flex-wrap gap-x-3 border-t border-a-border pt-1 text-a-text-2">
              {r.at && <time dateTime={r.at}>{formatInstant(r.at, locale, zone)}</time>}
              <span className="text-a-text">{r.client ?? '—'}</span>
              <span>{r.reference}</span>
              <span>{t(`appointments.money.kind.${kindKey(r)}`, KIND_FALLBACK[kindKey(r)])}</span>
              <span>{t(`appointments.money.method.${r.method}`, METHOD_FALLBACK[r.method])}</span>
              <span className="font-semibold text-a-text">{r.kind === 'refund' ? '−' : ''}{fmt(r.amount, r.currency)}</span>
              {r.by && <span>{r.by}</span>}
              {r.note && <span className="w-full">{r.note}</span>}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
