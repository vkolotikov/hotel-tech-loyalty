import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AlarmClock, Banknote, CreditCard, Crown, Handshake, Layers, Timer, TrendingUp } from 'lucide-react'
import { useBoot } from '../CrmProvider'
import { get, params } from '../lib/api'
import { count as countOf, money } from '../lib/format'
import { useRecords } from '../lib/useRecords'
import { Card } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'
import { QueryState } from '../ui/QueryState'
import { StatRow, StatTile } from '../ui/StatTile'
import { fulfilmentLabel, paymentLabel } from '../deals/dealWords'
import { BarList, Columns } from './charts'
import { bucketLabel, dayBuckets, dealTotals, paymentRows, type Period } from './insightsMath'
import type { DealAnalytics } from './types'

/**
 * The deals (round 5, owner 2026-11-12: the full admin's Analytics, Deals tab, on `GET deals/analytics?days=`): the value
 * and number completed in the period, the deals that came in, the average time from first step to done, the stuck ones
 * (open, their next step overdue), by day; where the open ones stand and how they are paid; the best customers. Every
 * figure is DealController::analytics'.
 */
export function DealsSection({ days }: { days: Period }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const boot = useBoot()
  const deals = useQuery({
    queryKey: ['crm', 'insights', 'deals', days],
    queryFn: () => get<DealAnalytics>(`deals/analytics${params({ days })}`),
    staleTime: 60_000,
  })
  return (
    <section aria-label={t('crm.insights.deals_title', 'Deals')} className="space-y-4">
      <QueryState loading={deals.isLoading} error={deals.error} onRetry={() => { void deals.refetch() }}>
        {deals.data && <DealsBody data={deals.data} lang={lang} currency={boot.venue.currency} />}
      </QueryState>
    </section>
  )
}

function DealsBody({ data, lang, currency }: { data: DealAnalytics; lang: string; currency: string }) {
  const { t } = useTranslation()
  const records = useRecords()
  const n = (value: number) => countOf(value, lang)
  const cash = (value: number) => money(value, currency, lang)
  const totals = dealTotals(data)
  const revenue = dayBuckets(data.revenue_trend.map(p => ({ date: p.date, value: p.revenue })))
  const fresh = dayBuckets(data.new_deal_trend.map(p => ({ date: p.date, value: p.count })))
  const weekly = revenue.length !== data.revenue_trend.length
  const payments = paymentRows(data.payment_distribution)
  const stages = data.stage_distribution ?? []
  const empty = totals.completed === 0 && totals.fresh === 0 && stages.every(s => !s.count) && payments.length === 0 && data.top_customers.length === 0

  if (empty) {
    return (
      <Card>
        <EmptyState icon={Handshake} title={t('crm.insights.no_deals', 'No deals yet')}
          action={<Link to="/crm/deals" className="text-sm font-medium text-a-accent-text hover:underline">{t('crm.insights.to_deals', 'Open Deals')}</Link>} />
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <StatRow label={t('crm.insights.deals_title', 'Deals')} count={4}>
        <StatTile icon={Banknote} tone="success" label={t('crm.insights.deal_revenue', 'Revenue completed')} value={cash(totals.revenue)}
          hint={t('crm.insights.deal_completed', '{{count}} done', { count: totals.completed })} />
        <StatTile icon={Handshake} tone="accent" label={t('crm.insights.deal_new', 'New deals')} value={n(totals.fresh)} />
        <StatTile icon={Timer} tone="progress" label={t('crm.insights.deal_cycle', 'Average time to done')}
          value={data.cycle_time_days > 0 ? t('crm.insights.days_value', '{{value}} d', { value: new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(data.cycle_time_days) }) : '—'} />
        <StatTile icon={AlarmClock} tone={data.stuck_deals > 0 ? 'danger' : 'neutral'} label={t('crm.insights.deal_stuck', 'Stuck')} value={n(data.stuck_deals)}
          to={data.stuck_deals > 0 ? '/crm/deals?filter=overdue' : undefined} />
      </StatRow>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={weekly ? t('crm.insights.revenue_by_week', 'Revenue by week') : t('crm.insights.revenue_by_day', 'Revenue by day')} icon={TrendingUp} tone="success"
          description={t('crm.insights.revenue_desc', 'The value of the deals completed each day')}>
          {totals.revenue === 0 && totals.completed === 0
            ? <p className="text-sm text-a-text-2">{t('crm.insights.no_revenue', 'No deal was completed in these days.')}</p>
            : <Columns caption={t('crm.insights.revenue_by_day', 'Revenue by day')} heading={weekly ? t('crm.insights.week', 'Week') : t('crm.insights.day', 'Day')} format={cash}
                columns={revenue.map(b => ({ key: b.key, label: bucketLabel({ from: b.from, to: b.from }, lang), long: bucketLabel(b, lang),
                  parts: [{ name: t('crm.insights.deal_revenue', 'Revenue completed'), value: b.value, tone: 'won' as const }] }))} />}
        </Card>
        <Card title={weekly ? t('crm.insights.deals_by_week', 'New deals by week') : t('crm.insights.deals_by_day', 'New deals by day')} icon={Handshake} tone="accent"
          description={t('crm.insights.deals_desc', 'Deals by the day they came in')}>
          {totals.fresh === 0
            ? <p className="text-sm text-a-text-2">{t('crm.insights.nothing', 'Nothing in these days.')}</p>
            : <Columns caption={t('crm.insights.deals_by_day', 'New deals by day')} heading={weekly ? t('crm.insights.week', 'Week') : t('crm.insights.day', 'Day')} format={n}
                columns={fresh.map(b => ({ key: b.key, label: bucketLabel({ from: b.from, to: b.from }, lang), long: bucketLabel(b, lang),
                  parts: [{ name: t('crm.insights.deal_new', 'New deals'), value: b.value, tone: 'accent' as const }] }))} />}
        </Card>
        <Card title={t('crm.insights.deal_steps', 'Where the deals are')} icon={Layers} tone="progress" description={t('crm.insights.deal_steps_desc', 'Deals at each step now, with their value')}>
          <BarList label={t('crm.insights.deal_steps', 'Where the deals are')}
            rows={stages.map(s => ({ id: s.stage, label: fulfilmentLabel(t, s.stage), value: Number(s.count) || 0,
              text: s.revenue > 0 ? `${n(Number(s.count) || 0)} · ${cash(s.revenue)}` : n(Number(s.count) || 0), tone: s.stage === 'completed' ? 'won' : 'accent' }))} />
        </Card>
        <Card title={t('crm.insights.deal_payments', 'How the open deals are paid')} icon={CreditCard} tone="pending">
          {payments.length === 0
            ? <p className="text-sm text-a-text-2">{t('crm.insights.nothing', 'Nothing in these days.')}</p>
            : <BarList label={t('crm.insights.deal_payments', 'How the open deals are paid')}
                rows={payments.map(p => ({ id: p.key, label: p.key === 'unset' ? t('crm.insights.payment_unset', 'Not set') : paymentLabel(t, p.key), value: p.count, text: n(p.count), tone: p.key === 'paid' ? 'won' : p.key === 'refunded' ? 'lost' : p.key === 'unset' ? 'muted' : 'accent' }))} />}
        </Card>
      </div>

      <Card title={t('crm.insights.best_customers', 'Best customers')} icon={Crown} tone="success" description={t('crm.insights.best_desc', 'By the value of their won deals, all time')} padded={false}>
        {data.top_customers.length === 0
          ? <p className="p-4 text-sm text-a-text-2">{t('crm.insights.no_customers', 'Once leads are won, the customers worth most show here.')}</p>
          : (
            <ol className="divide-y divide-a-border">
              {data.top_customers.slice(0, 8).map((row, i) => (
                <li key={row.guest_id}>
                  <Link to={records.href('contact', row.guest_id)} className="flex items-center gap-3 px-4 py-2 hover:bg-a-surface-2">
                    <span aria-hidden className="w-5 shrink-0 text-right text-xs tabular-nums text-a-text-2">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-a-text">{row.name}</span>
                      <span className="block truncate text-xs text-a-text-2">{[row.company, t('crm.insights.deals_count', 'Deals won: {{count}}', { count: row.deals })].filter(Boolean).join(' · ')}</span>
                    </span>
                    <span className="shrink-0 text-sm tabular-nums text-a-text">{cash(row.revenue)}</span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
      </Card>
    </div>
  )
}
