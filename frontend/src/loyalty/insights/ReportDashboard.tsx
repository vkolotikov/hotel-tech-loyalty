import { useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import { formatDate } from '../../workspace/lib/wallClock'
import { useBoot } from '../LoyaltyProvider'
import { failureOf, loyaltyUrl, watched } from '../lib/api'
import { points, when } from '../lib/format'
import { overviewScope } from '../overview/overviewMath'
import { OverviewButton, OverviewDialog, OverviewRecovery, OverviewSkeleton } from '../overview/OverviewUI'
import { DetailedInsights } from './DetailedInsights'
import { ReportTrend, ReportLevels, ReportPoints } from './ReportCharts'
import { comparison, reportCsv, reportFilters, reportRequest } from './reportMath'
import type { InsightsReport } from './reportTypes'
import { ReportFiltersPanel } from './ReportFiltersPanel'
import { useReportWords } from './reportWords'
import './report.css'

export function InsightsPage() {
  const [params] = useSearchParams(), say = useReportWords()
  if (params.get('view') === 'detailed' || params.has('period') || params.has('quiet')) return <div className="l-in-legacy"><Link className="l-ov-link" to="/loyalty/insights">← {say('back')}</Link><DetailedInsights /></div>
  return <ReportDashboard />
}
export function ReportCard({ title, action, className = '', children }: { title: string; action?: ReactNode; className?: string; children: ReactNode }) {
  return <section className={`l-ov-panel l-in-card ${className}`}><header><h2>{title}</h2>{action}</header>{children}</section>
}
function ReportDashboard() {
  const boot = useBoot(), say = useReportWords(), { t, i18n } = useTranslation()
  const [params, setParams] = useSearchParams(), filters = reportFilters(params.toString(), boot.venue.today)
  const [modal, setModal] = useState<'definitions' | null>(null)
  const [cohort, setCohort] = useState<{ n: number; total: number; week: number; from: string; to: string } | null>(null)
  const allowed = boot.staff.can.view_insights
  const query = useQuery({ queryKey: ['loyalty', 'insights', 'report', overviewScope(boot), filters],
    queryFn: ({ signal }): Promise<InsightsReport> => watched(api.get(loyaltyUrl('insights/report'), { params: reportRequest(filters), signal })),
    enabled: allowed, retry: (n, e) => ![401, 402, 403, 422].includes(failureOf(e).status) && n < 1 })
  const forbidden = !allowed || [401, 402, 403].includes(failureOf(query.error).status), data = forbidden ? undefined : query.data
  const n = (v: number) => points(v, i18n.language)
  const date = (v: string) => formatDate(v, i18n.language, { day: 'numeric', month: 'short', year: 'numeric' })
  const period = (from: string, to: string) => `${date(from)} – ${date(to)}`
  const level = filters.tier_id === 'none' ? say('noLevel') : boot.programme.tiers.find(x => String(x.id) === filters.tier_id)?.name ?? say('allLevels')
  const exportReport = () => {
    if (!data || query.isError || query.isFetching) return
    const url = URL.createObjectURL(new Blob([reportCsv(data, level)], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = `loyalty-insights-${data.from}-${data.to}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <div className="l-ov-page l-in-page">
    <header className="l-ov-page-heading"><div><h1>{t('loyalty.insights.title', 'Insights')}</h1><p>{say('line')}</p></div><div className="l-in-actions"><OverviewButton onClick={() => setModal('definitions')}>{say('definitions')}</OverviewButton><OverviewButton primary disabled={!data || query.isFetching || query.isError} onClick={exportReport}>{say('export')}</OverviewButton></div></header>
    {allowed && <ReportFiltersPanel key={JSON.stringify(filters)} value={filters} options={data?.filter_options} busy={query.isFetching} onApply={next => setParams({ ...next })} />}
    {forbidden && <OverviewRecovery forbidden onRetry={() => { void query.refetch() }} />}
    {!forbidden && query.isError && <OverviewRecovery title={data ? say('stale') : undefined} onRetry={() => { void query.refetch() }} busy={query.isFetching} />}
    {!forbidden && query.isPending && <OverviewSkeleton rows={8} />}
    {data && <>
      <div className="l-in-context"><p>{say('context', { days: data.days, zone: data.timezone })}{data.comparison && <> · {say('previous')}: {period(data.comparison.from, data.comparison.to)}</>} · {say('updated', { when: when(data.updated_at, i18n.language, data.timezone) ?? '—' })}</p><button onClick={() => { void query.refetch() }} disabled={query.isFetching} className="l-ov-link">{say('refresh')}</button></div>
      {data.current.members === 0 && <p role="status">{say('empty')}</p>}
      <ReportTiles data={data} onDefinitions={() => setModal('definitions')} />
      <div className="l-in-grid l-in-wide l-in-activity-row"><ReportTrend data={data} /><ReportLevels data={data} /></div>
      <div className="l-in-grid l-in-even"><ReportPoints data={data} /><ReportCard title={say('rewards')} action={<Link className="l-ov-link" to="/loyalty/requests?type=redemption&view=all">{say('requests')}</Link>}>
        <p>{say('claimsLine', { n: n(data.current.claims) })}</p>
        <dl className="l-in-outcomes">{[[say('fulfilled'), n(data.current.fulfilled)], [say('pending'), n(data.current.pending)], [say('rate'), data.current.fulfilment === null ? '—' : n(data.current.fulfilment) + '%']].map(([label, value], i) => <div key={label} data-tone={i}><dd>{value}</dd><dt>{label}</dt></div>)}</dl>
        <div className="l-in-claimbar" aria-hidden>{(['fulfilled', 'pending', 'cancelled'] as const).map(k => <span key={k} data-state={k} style={{ flex: data.current[k] }} />)}</div>
        {data.current.cancelled > 0 && <small>{say('cancelled')}: {n(data.current.cancelled)}</small>}
        <h3>{say('ranking')}</h3>{data.rewards.length ? <ul className="l-in-rank">{data.rewards.map(r => <li key={r.id}><span>{r.name ?? say('unknownReward', { id: r.id })}</span><span className="l-in-bar"><i style={{ width: `${r.claims / Math.max(1, data.rewards[0].claims) * 100}%` }} /></span><span>{n(r.claims)}</span></li>)}</ul> : <p>{say('noClaims')}</p>}
      </ReportCard></div>
      <div className="l-in-grid l-in-wide"><ReportCard title={say('cohorts')} className="l-in-cohorts" action={<button className="l-ov-link" onClick={() => setModal('definitions')}>{say('how')}</button>}>
        <p>{say('cohortLine', { n: n(data.current.new_members) })}</p>
        <div className="l-in-table-scroll" tabIndex={0} role="region" aria-label={say('cohorts')}><table><caption className="sr-only">{say('cohorts')}</caption><thead><tr><th>{say('joinWeek')}</th><th>{say('joined')}</th>{[1, 2, 3].map(k => <th key={k}>{say('weekAfter', { n: k })}</th>)}</tr></thead><tbody>{data.cohorts.map(c => <tr key={c.from}><th scope="row">{period(c.from, c.to)}</th><td>{n(c.members)}</td>{c.returns.map((count, i) => <td key={i}>{count === null || c.members === 0 ? <span className="l-in-cohort-empty">—<small>{say(count === null ? 'unobserved' : 'zeroCohort')}</small></span> : <button className="l-in-cell" onClick={() => setCohort({ n: count, total: c.members, week: i + 1, from: c.from, to: c.to })}><strong>{new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(count / c.members * 100)}%</strong><small>{say('of', { n: n(count), total: n(c.members) })}</small></button>}</td>)}</tr>)}</tbody></table></div>
        <small>{say('cohortHint')}</small>
      </ReportCard><ReportCard title={say('attention')} className="l-in-attention">
        <Link to="/loyalty/insights?view=detailed#insights-expiry"><strong>{say('points', { n: n(data.attention.expiring) })}</strong><span>{say('expiring')}</span><small>{say('people', { n: n(data.attention.expiring_members) })} · {period(data.attention.expiry_from, data.attention.expiry_to)}</small></Link>
        <Link to="/loyalty/insights?view=detailed&quiet=30#insights-at-risk"><strong>{say('people', { n: n(data.attention.quiet) })}</strong><span>{say('quiet')}</span><small>{say('quietHint')}</small></Link>
        <Link to="/loyalty/requests?type=redemption&view=open"><strong>{say('claimCount', { n: n(data.current.pending) })}</strong><span>{say('pendingHint')}</span><small>{say('periodClaims')}</small></Link>
      </ReportCard></div>
      <footer className="l-in-footer"><span>{data.timezone} · {say('snapshot', { date: date(data.snapshot_date) })}</span><Link className="l-ov-link" to="/loyalty/insights?view=detailed">{say('details')} →</Link></footer>
    </>}
    {modal === 'definitions' && <ReportDefinitions onClose={() => setModal(null)} />}
    {cohort && <OverviewDialog kind="form" className="l-in-dialog" title={say('cohortDetail')} onClose={() => setCohort(null)}><p>{period(cohort.from, cohort.to)}</p><div className="l-in-definition"><h3>{say('cohortResult', { n: n(cohort.n), total: n(cohort.total), week: cohort.week })}</h3><p>{say('defCohortsText')}</p></div><OverviewButton onClick={() => setCohort(null)}>{say('close')}</OverviewButton></OverviewDialog>}
  </div>
}
function ReportTiles({ data: r, onDefinitions }: { data: InsightsReport; onDefinitions: () => void }) {
  const say = useReportWords(), { i18n } = useTranslation()
  const n = (v: number) => new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 }).format(v)
  const signed = (v: number) => new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1, signDisplay: 'exceptZero' }).format(v)
  const money = (v: number) => new Intl.NumberFormat(i18n.language, { style: 'currency', currency: r.current.money.currency, maximumFractionDigits: 0 }).format(v)
  const entries = [
    { key: 'active' as const, value: r.current.active, prior: r.previous?.active, hint: say('during') },
    { key: 'new' as const, value: r.current.new_members, prior: r.previous?.new_members, hint: say('during') },
    { key: 'participation' as const, value: r.current.participation, prior: r.previous?.participation, hint: say('of', { n: n(r.current.active), total: n(r.current.members) }), rate: true },
    { key: 'sales' as const, value: r.current.money.members.total, prior: r.previous?.money.members.total, hint: say('salesHint'), money: true },
    { key: 'issued' as const, value: r.current.issued, prior: r.previous?.issued, hint: say('during') },
    { key: 'redeemed' as const, value: r.current.redeemed, prior: r.previous?.redeemed, hint: say('during') },
    { key: 'claims' as const, value: r.current.claims, prior: r.previous?.claims, hint: say('during') },
    { key: 'fulfilment' as const, value: r.current.fulfilment, prior: r.previous?.fulfilment, hint: say('of', { n: n(r.current.fulfilled), total: n(r.current.claims) }), rate: true },
  ]
  return <div className="l-in-tiles">{entries.map(e => { const delta = comparison(e.value, e.prior ?? null, e.rate)
    return <button className="l-in-tile" key={e.key} onClick={onDefinitions}><span>{say(e.key)}</span><strong>{e.value === null ? '—' : e.money ? money(e.value) : n(e.value) + (e.rate ? '%' : '')}</strong><small>{r.previous && <>{delta === null ? say('noBaseline') : say(e.rate ? 'pp' : 'change', { n: signed(delta) })} · </>}{e.hint}</small></button>
  })}</div>
}
function ReportDefinitions({ onClose }: { onClose: () => void }) {
  const say = useReportWords()
  return <OverviewDialog kind="form" className="l-in-dialog" title={say('definitionsTitle')} onClose={onClose}><p>{say('definitionsLine')}</p>{(['Active', 'Sales', 'Points', 'Claims', 'Cohorts', 'Scope'] as const).map(k => <div className="l-in-definition" key={k}><h3>{say(`def${k}`)}</h3><p>{say(`def${k}Text`)}</p></div>)}<OverviewButton onClick={onClose}>{say('close')}</OverviewButton></OverviewDialog>
}
