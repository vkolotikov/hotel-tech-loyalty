import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Figure } from '../../workspace/ui/Typography'
import { money, points } from '../lib/format'
import { named } from '../lib/forms'
import { insightsApi, moneyKey } from './api'
import { ColumnChart } from './charts/ColumnChart'
import { Legend } from './charts/parts'
import { bucketLong, bucketShort, noMoney, percentText } from './insightsMath'
import { Card, Empty, LoadFailed, Loading } from './parts'
import type { Money, Period } from './types'
import { BUCKET_HEAD_WORDS } from './words'

/**
 * The money members bring (release 4 part E): paid stays and appointments members booked in the period, in the
 * venue's currency — what they paid less what went back — their share of everything paid in the period, and the same
 * per bucket. Every figure is the server's (InsightsMoney); a paid booking in another currency is counted, never
 * converted or added.
 */
export function MoneyCard({ period, locale }: { period: Period; locale: string }) {
  const { t } = useTranslation()
  const query = useQuery({ queryKey: moneyKey(period), queryFn: () => insightsApi.money(period), placeholderData: keepPreviousData })
  const data = query.data

  return (
    <Card id="insights-money" title={t('loyalty.insights.money.title', 'Money members bring')}
      line={t('loyalty.insights.money.line', 'Paid stays and appointments members booked in this period, by the day they booked: what they paid, less what went back.')}>
      {query.isError && !data && <LoadFailed family="load" error={query.error} onRetry={() => { void query.refetch() }} />}
      {!data && query.isLoading && <Loading rows={1} />}
      {data && <MoneyView data={data} locale={locale} />}
    </Card>
  )
}

export function MoneyView({ data, locale }: { data: Money; locale: string }) {
  const { t } = useTranslation()
  const cash = (amount: number) => money(amount, data.currency, locale)
  if (noMoney(data)) {
    return <Empty>{t('loyalty.insights.money.none', 'No paid bookings in this period yet.')}</Empty>
  }
  const head = named('loyalty.insights.bucket_head', BUCKET_HEAD_WORDS, data.bucket)
  const keys = data.series.map(b => b.key)
  const stays = t('loyalty.insights.money.stays', 'Stays')
  const services = t('loyalty.insights.money.services', 'Appointments')
  const series = [
    { name: stays, tone: 1 as const, values: data.series.map(b => b.stays) },
    { name: services, tone: 2 as const, values: data.series.map(b => b.services) },
  ]
  const bookings = (n: number) => t('loyalty.insights.money.bookings', 'Bookings: {{number}}', { number: points(n, locale) })

  return (
    <>
      <dl data-money="" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MoneyFigure id="members" label={t('loyalty.insights.money.members', 'Members brought')} value={cash(data.members.total)}
          line={t('loyalty.insights.money.currency_line', 'In {{currency}}', { currency: data.currency })} />
        <MoneyFigure id="stays" label={stays} value={cash(data.members.stays.amount)} line={bookings(data.members.stays.bookings)} />
        <MoneyFigure id="services" label={services} value={cash(data.members.services.amount)} line={bookings(data.members.services.bookings)} />
        <MoneyFigure id="share" label={t('loyalty.insights.money.share', 'Share of all paid bookings')} value={percentText(data.share, locale)}
          line={t('loyalty.insights.money.all', 'Of {{total}} paid in all', { total: cash(data.all.total) })} />
      </dl>
      <Legend series={series} />
      <ColumnChart caption={t('loyalty.insights.money.title', 'Money members bring')} heading={head ? t(...head) : data.bucket}
        keys={keys} kind={data.bucket} short={keys.map(k => bucketShort(k, data.bucket, locale))} long={keys.map(k => bucketLong(k, data.bucket, locale))}
        up={series} format={cash} locale={locale} />
      {data.other_currency.bookings > 0 && (
        <p data-other-currency="" className="text-xs text-a-text-2">
          {t('loyalty.insights.money.other_currency', 'Paid bookings by members in another currency, not added in: {{number}}.', { number: points(data.other_currency.bookings, locale) })}
        </p>
      )}
    </>
  )
}

function MoneyFigure({ id, label, value, line }: { id: string; label: string; value: string; line: string }) {
  return (
    <div data-money-figure={id} className="min-w-0 space-y-1 rounded-xl bg-a-surface-2 px-3 py-2 [container-type:inline-size]">
      <dt className="text-xs text-a-text-2">{label}</dt>
      <dd><Figure fit>{value}</Figure></dd>
      <dd className="text-xs text-a-text-2">{line}</dd>
    </div>
  )
}
