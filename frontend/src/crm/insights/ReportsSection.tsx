import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Activity, Building2, CheckSquare, Filter, Lock, Share2, TrendingUp, Trophy, Users, XCircle } from 'lucide-react'
import { useBoot } from '../CrmProvider'
import { failureOf, get, params } from '../lib/api'
import { count as countOf, money } from '../lib/format'
import { useRecords } from '../lib/useRecords'
import { Avatar } from '../ui/Avatar'
import { Card } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'
import { QueryState } from '../ui/QueryState'
import { sourceLabel } from '../leads/leadWords'
import { BarList, Columns, Legend } from './charts'
import { FUNNEL_STAGE_KEYS, forecastColumns, monthLabel, ownerDays, rate, refusedForRights, type ReportMonths } from './insightsMath'
import type { CompaniesReport, ForecastReport, FunnelReport, LostReport, OwnersReport, SourcesReport } from './types'

const KEY = ['crm', 'insights', 'reports'] as const

/**
 * The full admin's sales reports in HexaTech CRM (round 5, owner 2026-11-12): the funnel, the forecast, why leads were
 * lost, where they came from, the owners' board and the companies — `crm/reports/*`, answered by the same code as the
 * full admin's Reports page (SalesReports), under its rule (Analytics). A refusal for want of that right is said once
 * for the section. A company's reservation revenue shows only where the server sends it (bookings are the venue's).
 */
export function ReportsSection({ months }: { months: ReportMonths }) {
  const { t } = useTranslation()
  const funnel = useQuery({
    queryKey: [...KEY, 'funnel', months],
    queryFn: () => get<FunnelReport>(`crm/reports/funnel${params({ months })}`),
    staleTime: 60_000,
    retry: false,
  })
  if (funnel.error && refusedForRights(failureOf(funnel.error).code)) {
    return (
      <Card>
        <EmptyState icon={Lock} title={t('crm.insights.reports_locked', 'Reports need the Analytics right')}
          line={t('crm.insights.reports_locked_line', 'A manager can give it to you in Team.')} />
      </Card>
    )
  }
  // The other reports are asked for once the funnel has answered, so a person without the right is refused once.
  return (
    <section aria-label={t('crm.insights.reports_title', 'Sales reports')} className="space-y-4">
      <FunnelCard months={months} query={funnel} />
      {!funnel.isLoading && (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <ForecastCard months={months} />
            <LostCard months={months} />
            <SourcesCard months={months} />
            <OwnersCard days={ownerDays(months)} />
          </div>
          <CompaniesCard />
        </>
      )}
    </section>
  )
}

/** A figure inside a report card: its label over its value. */
function Fact({ label, value, tone = 'text-a-text' }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-a-surface-2 px-2.5 py-2">
      <dt className="truncate text-xs text-a-text-2" title={label}>{label}</dt>
      <dd className={`font-a-display text-xl leading-tight ${tone}`}>{value}</dd>
    </div>
  )
}

function FunnelCard({ months, query }: { months: ReportMonths; query: { data?: FunnelReport; isLoading: boolean; error: unknown; refetch: () => unknown } }) {
  const { t, i18n } = useTranslation()
  const n = (v: number) => countOf(v, i18n.language)
  const data = query.data
  const first = data?.stages[0]?.count ?? 0
  return (
    <Card title={t('crm.insights.report_funnel', 'Pipeline funnel')} icon={Filter} tone="progress"
      description={t('crm.insights.report_funnel_desc', 'Leads of the last {{months}} months that reached each stage or a later one', { months })}>
      <QueryState loading={query.isLoading} error={query.error} onRetry={() => { void query.refetch() }} rows={3}>
        {data && (first === 0 && data.won === 0 && data.lost === 0
          ? <p className="text-sm text-a-text-2">{t('crm.insights.nothing', 'Nothing in these days.')}</p>
          : (
            <div className="space-y-4">
              <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Fact label={t('crm.insights.won', 'Won')} value={n(data.won)} tone="text-a-st-confirmed" />
                <Fact label={t('crm.insights.lost', 'Lost')} value={n(data.lost)} tone="text-a-danger" />
                <Fact label={t('crm.insights.win_rate', 'Win rate')} value={rate(data.win_rate_pct, i18n.language)} />
                <Fact label={t('crm.insights.days_to_close', 'Days to close')} value={data.avg_days_to_close === null ? '—' : new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 }).format(data.avg_days_to_close)} />
              </dl>
              <BarList label={t('crm.insights.report_funnel', 'Pipeline funnel')}
                rows={data.stages.map((s, i) => ({
                  id: s.stage, label: t(`crm.insights.stage.${FUNNEL_STAGE_KEYS[s.stage] ?? 'other'}`, s.stage), value: s.count,
                  text: i === 0 ? n(s.count) : `${n(s.count)} · ${s.rate_from_prev} %`, tone: s.stage === 'Confirmed' ? 'won' : 'accent',
                }))} />
            </div>
          ))}
      </QueryState>
    </Card>
  )
}

function ForecastCard({ months }: { months: ReportMonths }) {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const lang = i18n.language
  const cash = (v: number) => money(v, boot.venue.currency, lang)
  const ahead = Math.min(12, months)
  const forecast = useQuery({ queryKey: [...KEY, 'forecast', ahead], queryFn: () => get<ForecastReport>(`crm/reports/forecast${params({ months: ahead })}`), staleTime: 60_000 })
  const expected = t('crm.insights.expected', 'Expected')
  const rest = t('crm.insights.rest_of_open', 'The rest of the open value')
  return (
    <Card title={t('crm.insights.report_forecast', 'Revenue forecast')} icon={TrendingUp} tone="success"
      description={t('crm.insights.report_forecast_desc', 'Open leads by the month they should close, weighted by their chance')}
      action={<div className="hidden sm:block"><Legend items={[{ name: expected, tone: 'won' }, { name: rest, tone: 'muted' }]} /></div>}>
      <QueryState loading={forecast.isLoading} error={forecast.error} onRetry={() => { void forecast.refetch() }} rows={3}>
        {forecast.data && (forecast.data.total_gross === 0
          ? <p className="text-sm text-a-text-2">{t('crm.insights.no_open_value', 'No open lead has a value yet.')}</p>
          : (
            <div className="space-y-4">
              <dl className="grid grid-cols-2 gap-2">
                <Fact label={expected} value={cash(forecast.data.total_expected)} tone="text-a-st-confirmed" />
                <Fact label={t('crm.insights.open_value', 'Open pipeline')} value={cash(forecast.data.total_gross)} />
              </dl>
              <Columns caption={t('crm.insights.report_forecast', 'Revenue forecast')} heading={t('crm.insights.month', 'Month')} format={cash}
                labels={forecastColumns(forecast.data).map(() => true)}
                columns={forecastColumns(forecast.data).map(c => {
                  const label = monthLabel(c.key, lang) ?? t('crm.insights.later', 'Later')
                  return { key: c.key, label, long: label, parts: [{ name: expected, value: c.expected, tone: 'won' as const }, { name: rest, value: c.rest, tone: 'muted' as const }] }
                })} />
            </div>
          ))}
      </QueryState>
    </Card>
  )
}

function LostCard({ months }: { months: ReportMonths }) {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const lang = i18n.language
  const lost = useQuery({ queryKey: [...KEY, 'lost', months], queryFn: () => get<LostReport>(`crm/reports/lost-reasons${params({ months })}`), staleTime: 60_000 })
  return (
    <Card title={t('crm.insights.lost_reasons', 'Why leads were lost')} icon={XCircle} tone="danger"
      hint={lost.data && lost.data.total_count > 0 ? `${countOf(lost.data.total_count, lang)} · ${money(lost.data.total_value, boot.venue.currency, lang)}` : undefined}>
      <QueryState loading={lost.isLoading} error={lost.error} onRetry={() => { void lost.refetch() }} rows={3}>
        {lost.data && (lost.data.reasons.length === 0
          ? <p className="text-sm text-a-text-2">{t('crm.insights.no_lost_window', 'No lead lost in these months.')}</p>
          : <BarList label={t('crm.insights.lost_reasons', 'Why leads were lost')}
              rows={lost.data.reasons.map(r => ({
                id: r.label, label: r.label === 'Unspecified' ? t('crm.insights.no_reason', 'No reason given') : r.label, value: r.count,
                text: r.lost_value > 0 ? `${countOf(r.count, lang)} · ${money(r.lost_value, boot.venue.currency, lang)}` : countOf(r.count, lang), tone: 'lost',
              }))} />)}
      </QueryState>
    </Card>
  )
}

function SourcesCard({ months }: { months: ReportMonths }) {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const lang = i18n.language
  const n = (v: number) => countOf(v, lang)
  const sources = useQuery({ queryKey: [...KEY, 'sources', months], queryFn: () => get<SourcesReport>(`crm/reports/sources${params({ months })}`), staleTime: 60_000 })
  const head = 'px-2 py-1.5 text-right text-xs font-semibold text-a-text-2'
  const cell = 'px-2 py-1.5 text-right tabular-nums'
  return (
    <Card title={t('crm.insights.report_sources', 'Where leads come from')} icon={Share2} tone="accent"
      description={t('crm.insights.report_sources_desc', 'Leads of the period by source: won, lost, the win rate of those closed and the value won')} padded={false}>
      <div className={sources.data?.sources.length ? '' : 'p-4'}>
        <QueryState loading={sources.isLoading} error={sources.error} onRetry={() => { void sources.refetch() }} rows={3}>
          {sources.data && (sources.data.sources.length === 0
            ? <p className="text-sm text-a-text-2">{t('crm.insights.nothing', 'Nothing in these days.')}</p>
            : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-a-text">
                  <thead className="border-b border-a-border">
                    <tr>
                      <th scope="col" className="px-4 py-1.5 text-left text-xs font-semibold text-a-text-2">{t('crm.insights.source', 'Source')}</th>
                      <th scope="col" className={head}>{t('crm.insights.leads', 'Leads')}</th>
                      <th scope="col" className={head}>{t('crm.insights.won', 'Won')}</th>
                      <th scope="col" className={`${head} hidden sm:table-cell`}>{t('crm.insights.lost', 'Lost')}</th>
                      <th scope="col" className={head}>%</th>
                      <th scope="col" className={`${head} pr-4`}>{t('crm.insights.value_won', 'Value won')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-a-border">
                    {sources.data.sources.map(s => (
                      <tr key={s.source}>
                        <th scope="row" className="max-w-[9rem] truncate px-4 py-1.5 text-left font-medium">{s.source === 'unknown' ? t('crm.insights.source_unknown', 'Not known') : sourceLabel(t, s.source)}</th>
                        <td className={cell}>{n(s.count)}</td>
                        <td className={`${cell} text-a-st-confirmed`}>{n(s.won)}</td>
                        <td className={`${cell} hidden text-a-danger sm:table-cell`}>{n(s.lost)}</td>
                        <td className={cell}>{s.win_rate_pct === null ? '—' : rate(s.win_rate_pct, lang)}</td>
                        <td className={`${cell} pr-4`}>{s.won_value > 0 ? money(s.won_value, boot.venue.currency, lang) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
        </QueryState>
      </div>
    </Card>
  )
}

function OwnersCard({ days }: { days: number }) {
  const { t, i18n } = useTranslation()
  const n = (v: number) => countOf(v, i18n.language)
  const owners = useQuery({ queryKey: [...KEY, 'owners', days], queryFn: () => get<OwnersReport>(`crm/reports/owners${params({ days })}`), staleTime: 60_000 })
  const stat = 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums'
  return (
    <Card title={t('crm.insights.report_owners', 'Who works the pipeline')} icon={Users} tone="pending" padded={false}
      description={t('crm.insights.report_owners_desc', 'Per person: timeline lines they logged, tasks they completed, and their leads')}
      hint={t('crm.insights.in_days_short', '{{days}} days', { days })}>
      <div className={owners.data?.owners.length ? '' : 'p-4'}>
        <QueryState loading={owners.isLoading} error={owners.error} onRetry={() => { void owners.refetch() }} rows={3}>
          {owners.data && (owners.data.owners.length === 0
            ? <p className="text-sm text-a-text-2">{t('crm.insights.nothing', 'Nothing in these days.')}</p>
            : (
              <ol className="divide-y divide-a-border">
                {owners.data.owners.map((o, i) => (
                  <li key={`${o.name}-${i}`} className="flex items-center gap-3 px-4 py-2">
                    <Avatar name={o.name} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-a-text">{o.name}</span>
                    <span className="flex shrink-0 flex-wrap justify-end gap-1">
                      <span className={`${stat} bg-a-surface-2 text-a-text`} title={t('crm.insights.owner_lines', 'Timeline lines')}><Activity size={12} aria-hidden />{n(o.activities)}<span className="sr-only"> {t('crm.insights.owner_lines', 'Timeline lines')}</span></span>
                      <span className={`${stat} bg-a-surface-2 text-a-text`} title={t('crm.insights.owner_tasks', 'Tasks done')}><CheckSquare size={12} aria-hidden />{n(o.tasks_done)}<span className="sr-only"> {t('crm.insights.owner_tasks', 'Tasks done')}</span></span>
                      <span className={`${stat} bg-a-st-confirmed/12 text-a-st-confirmed`} title={t('crm.insights.won', 'Won')}><Trophy size={12} aria-hidden />{n(o.won)}<span className="sr-only"> {t('crm.insights.won', 'Won')}</span></span>
                      <span className={`${stat} hidden bg-a-accent/12 text-a-accent-text sm:inline-flex`}>{t('crm.insights.open_count', '{{count}} open', { count: o.open })}</span>
                    </span>
                  </li>
                ))}
              </ol>
            ))}
        </QueryState>
      </div>
    </Card>
  )
}

function CompaniesCard() {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const records = useRecords()
  const lang = i18n.language
  const cash = (v: number) => money(v, boot.venue.currency, lang)
  const companies = useQuery({ queryKey: [...KEY, 'companies'], queryFn: () => get<CompaniesReport>(`crm/reports/companies${params({ limit: 10 })}`), staleTime: 5 * 60_000 })
  const withBookings = companies.data?.with_bookings ?? false
  return (
    <Card title={t('crm.insights.report_companies', 'Top companies')} icon={Building2} tone="success" padded={false}
      description={withBookings
        ? t('crm.insights.report_companies_bookings', 'By confirmed reservation revenue, with their won deals and open pipeline')
        : t('crm.insights.report_companies_desc', 'By the value of their won deals, then their open pipeline')}>
      <div className={companies.data?.companies.length ? '' : 'p-4'}>
        <QueryState loading={companies.isLoading} error={companies.error} onRetry={() => { void companies.refetch() }} rows={3}>
          {companies.data && (companies.data.companies.length === 0
            ? <p className="text-sm text-a-text-2">{t('crm.insights.no_companies', 'No company has a won or an open lead yet.')}</p>
            : (
              <ol className="grid divide-y divide-a-border md:grid-cols-2 md:divide-y-0">
                {companies.data.companies.map((c, i) => (
                  <li key={c.id} className="md:border-b md:border-a-border">
                    <Link to={records.href('company', c.id)}
                      className="flex items-center gap-3 px-4 py-2 hover:bg-a-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-a-accent">
                      <span aria-hidden className="w-5 shrink-0 text-right text-xs tabular-nums text-a-text-2">{i + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-a-text">{c.company_name}</span>
                        <span className="block truncate text-xs text-a-text-2">
                          {[c.industry, t('crm.insights.leads_count', '{{count}} leads', { count: c.inquiries_count }),
                            c.open_pipeline_value > 0 ? t('crm.insights.open_plus', '+{{amount}} open', { amount: cash(c.open_pipeline_value) }) : null].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-sm tabular-nums text-a-st-confirmed">{cash(withBookings ? c.confirmed_revenue ?? 0 : c.won_value)}</span>
                        {withBookings && c.won_value > 0 && <span className="block text-xs tabular-nums text-a-text-2">{t('crm.insights.won_plus', '{{amount}} won', { amount: cash(c.won_value) })}</span>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            ))}
        </QueryState>
      </div>
    </Card>
  )
}
