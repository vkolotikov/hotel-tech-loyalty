import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { money as fmt } from '../../lib/money'
import { useBoot } from '../AppointmentsProvider'
import { appointmentsApi } from '../lib/api'
import type { DateKey, RefundVia, Takings } from '../lib/types'
import { formatInstant } from '../../workspace/lib/wallClock'
import { KIND_FALLBACK, METHOD_FALLBACK, kindKey } from '../panel/moneyLines'
import { Field } from '../../workspace/ui/Field'
import { Notice } from '../../workspace/ui/Notice'
import { PageTitle } from '../../workspace/ui/Typography'

const METHODS: RefundVia[] = ['cash', 'card_desk', 'transfer', 'other', 'online_card']
/** Table heads: mono, small caps feel, hairline weight (spec 4.6). */
const HEAD = 'font-a-mono text-xs font-medium uppercase tracking-[0.08em] text-a-text-2'

/** One day's takings for cashing up (Part E, managers only; the server refuses everyone else). */
export function TakingsPage() {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const [date, setDate] = useState<DateKey>(boot.venue.today)
  const q = useQuery({ queryKey: ['appointments', 'takings', date], queryFn: () => appointmentsApi.takings(date) })

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <PageTitle>{t('appointments.takings.title', 'Takings')}</PageTitle>
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
        <div key={cur} className="max-w-xl rounded-xl border border-a-border bg-a-surface p-5 shadow-a-sm">
          <table className="w-full">
            <thead>
              <tr>
                <th className={`${HEAD} pb-2 text-left`}>{t('appointments.takings.method', 'Method')}</th>
                <th className={`${HEAD} pb-2 text-right`}>{t('appointments.takings.in', 'In')}</th>
                <th className={`${HEAD} pb-2 text-right`}>{t('appointments.takings.out', 'Out')}</th>
                <th className={`${HEAD} pb-2 text-right`}>{t('appointments.takings.net', 'Net')}</th>
              </tr>
            </thead>
            <tbody>
              {METHODS.filter(m => data.totals[cur][m].in > 0 || data.totals[cur][m].out > 0).map(m => (
                <tr key={m} className="border-t border-a-border">
                  <td className="py-2 text-a-text">{t(`appointments.money.method.${m}`, METHOD_FALLBACK[m])}</td>
                  <td className="py-2 text-right tabular-nums">{fmt(data.totals[cur][m].in, cur)}</td>
                  <td className="py-2 text-right tabular-nums">{fmt(data.totals[cur][m].out, cur)}</td>
                  <td className="py-2 text-right font-semibold tabular-nums">{fmt(data.totals[cur][m].in - data.totals[cur][m].out, cur)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {Object.entries(data.online).map(([cur, amount]) => (
        <p key={cur} className="text-a-text-2">{t('appointments.takings.online', "Paid online for this day's appointments: {{amount}}", { amount: fmt(amount, cur) })}</p>
      ))}
      {data.rows.length > 0 && (
        <ol className="rounded-xl border border-a-border bg-a-surface px-5 py-3 shadow-a-sm">
          {data.rows.map(r => (
            <li key={r.id} className="flex flex-wrap gap-x-3 border-t border-a-border py-2 text-a-text-2 first:border-t-0">
              {r.at && <time dateTime={r.at} className="font-a-mono tabular-nums">{formatInstant(r.at, locale, zone)}</time>}
              <span className="text-a-text">{r.client ?? '—'}</span>
              <span className="font-a-mono">{r.reference}</span>
              <span>{t(`appointments.money.kind.${kindKey(r)}`, KIND_FALLBACK[kindKey(r)])}</span>
              <span>{t(`appointments.money.method.${r.method}`, METHOD_FALLBACK[r.method])}</span>
              <span className="font-semibold tabular-nums text-a-text">{r.kind === 'refund' ? '−' : ''}{fmt(r.amount, r.currency)}</span>
              {r.by && <span>{r.by}</span>}
              {r.note && <span className="w-full">{r.note}</span>}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
