import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import { api } from '../lib/api'
import {
  TrendingUp, BarChart3, Funnel, X, Users,
  Building2, Trophy, Clock,
} from 'lucide-react'

/**
 * Sales Reporting (`/reports`) — CRM Phase 4.
 *
 * Five panels:
 *   1. Funnel (existing /analytics/inquiry-funnel) — stage drop-off
 *      + win rate + avg days to close
 *   2. Forecast — probability × value of open deals, bucketed by month
 *   3. Lost reasons — funnel-leak breakdown by reason + lost value
 *   4. Source attribution — per-source win rate + won-value
 *   5. Owner scoreboard — per-rep activities + open / won / lost
 *
 * Plus a top strip of LTV from corporate accounts.
 *
 * Each panel is a single backend call. The page is read-only — actions
 * (drilling into a deal, etc.) link back to the Inquiries / Companies
 * surfaces.
 */

const COLORS = {
  accent: '#22d3ee',
  emerald: '#10b981',
  amber: '#f59e0b',
  red: '#ef4444',
  violet: '#a78bfa',
  rose: '#f472b6',
  slate: '#94a3b8',
} as const

const STAGE_PALETTE = [
  '#3b82f6', '#6366f1', '#a855f7', '#eab308',
  '#f59e0b', '#fb923c', '#22c55e',
]

const PIE_PALETTE = ['#ef4444', '#f97316', '#f59e0b', '#eab308', '#a855f7', '#94a3b8']

export function Reports() {
  const { t } = useTranslation()
  const [windowMonths, setWindowMonths] = useState(6)
  const [ownerDays, setOwnerDays] = useState(30)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">{t('reports.title', 'Sales Reporting')}</h1>
          <p className="text-sm text-t-secondary mt-0.5">
            {t('reports.subtitle', 'Funnel, forecast, lost-reason breakdown, and per-rep scoreboard.')}
          </p>
        </div>
        <div className="flex items-center gap-1.5 bg-dark-surface border border-dark-border rounded-lg p-0.5">
          {[3, 6, 12].map(m => (
            <button
              key={m}
              onClick={() => setWindowMonths(m)}
              className={`px-3 py-1.5 rounded-md text-xs font-bold ${
                windowMonths === m
                  ? 'bg-accent text-black'
                  : 'text-t-secondary hover:text-white'
              }`}
            >
              {m}m
            </button>
          ))}
        </div>
      </div>

      <FunnelCard months={windowMonths} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ForecastCard months={windowMonths} />
        <LostReasonsCard months={windowMonths} />
      </div>

      <SourceAttributionCard months={windowMonths} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <OwnerScoreboardCard days={ownerDays} setDays={setOwnerDays} />
        <CompanyLtvCard />
      </div>
    </div>
  )
}

/* ── 1. Funnel ──────────────────────────────────────────────── */

function FunnelCard({ months }: { months: number }) {
  const { t } = useTranslation()
  const { data, isLoading } = useQuery<any>({
    queryKey: ['reporting-funnel', months],
    queryFn: () => api.get('/v1/admin/analytics/inquiry-funnel', { params: { months } }).then(r => r.data),
  })

  return (
    <Card icon={<Funnel size={14} className="text-accent" />}
      title={t('reports.funnel.title', 'Pipeline funnel')}
      subtitle={t('reports.funnel.subtitle', { months, defaultValue: 'Stage drop-off, last {{months}} months' })}>
      {isLoading ? <Loading /> : !data?.stages?.length ? <Empty label={t('reports.funnel.empty', 'No deals in this window.')} /> : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Stat label={t('reports.funnel.won_deals', 'Won deals')} value={data.won} valueClass="text-emerald-400" />
            <Stat label={t('reports.funnel.lost_deals', 'Lost deals')} value={data.lost} valueClass="text-red-400" />
            <Stat label={t('reports.funnel.win_rate', 'Win rate')} value={`${data.win_rate_pct}%`} valueClass="text-white" />
            <Stat
              label={t('reports.funnel.avg_days_to_close', 'Avg days to close')}
              value={data.avg_days_to_close ?? '—'}
              valueClass="text-white"
            />
          </div>
          <div className="space-y-1.5">
            {data.stages.map((s: any, i: number) => {
              const max = data.stages[0]?.count || 1
              const pct = (s.count / max) * 100
              return (
                <div key={s.stage} className="flex items-center gap-3">
                  <span className="w-32 text-xs font-semibold text-t-secondary">{s.stage}</span>
                  <div className="flex-1 relative h-7 bg-dark-bg rounded">
                    <div
                      className="h-full rounded transition-all"
                      style={{
                        width: `${pct}%`,
                        background: STAGE_PALETTE[i] ?? COLORS.slate,
                        opacity: 0.85,
                      }}
                    />
                    <div className="absolute inset-0 flex items-center px-2 gap-2">
                      <span className="text-xs font-bold text-white tabular-nums">{s.count}</span>
                      {s.value > 0 && (
                        <span className="text-[10px] text-white/70">€{Math.round(s.value).toLocaleString()}</span>
                      )}
                      <span className="ml-auto text-[10px] text-white/70 tabular-nums">
                        {t('reports.funnel.from_prev_overall', { from_prev: i === 0 ? 100 : s.rate_from_prev, overall: s.rate_from_start, defaultValue: '{{from_prev}}% from prev · {{overall}}% overall' })}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </Card>
  )
}

/* ── 2. Forecast ────────────────────────────────────────────── */

function ForecastCard({ months }: { months: number }) {
  const { t } = useTranslation()
  const { data, isLoading } = useQuery<any>({
    queryKey: ['reporting-forecast', months],
    queryFn: () => api.get('/v1/admin/reporting/forecast', { params: { months } }).then(r => r.data),
  })

  return (
    <Card
      icon={<TrendingUp size={14} className="text-emerald-400" />}
      title={t('reports.forecast.title', 'Revenue forecast')}
      subtitle={t('reports.forecast.subtitle', 'Open pipeline weighted by win probability')}
    >
      {isLoading ? <Loading /> : !data?.buckets?.length ? <Empty label={t('reports.forecast.empty', 'No open deals.')} /> : (
        <>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <Stat
              label={t('reports.forecast.expected_weighted', 'Expected (weighted)')}
              value={`€${Math.round(data.total_expected).toLocaleString()}`}
              valueClass="text-emerald-400"
            />
            <Stat
              label={t('reports.forecast.gross_pipeline', 'Gross open pipeline')}
              value={`€${Math.round(data.total_gross).toLocaleString()}`}
              valueClass="text-white"
            />
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={data.buckets} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(v) => `€${Math.round(v/1000)}k`} />
              <Tooltip
                contentStyle={{ background: '#0a0a0a', border: '1px solid #27272a', borderRadius: 8, fontSize: 12 }}
                formatter={(v: any) => [`€${Math.round(v).toLocaleString()}`, '']}
              />
              <Bar dataKey="gross_value" fill={COLORS.slate} fillOpacity={0.4} name={t('reports.forecast.gross', 'Gross')} />
              <Bar dataKey="expected_value" fill={COLORS.emerald} name={t('reports.forecast.expected', 'Expected')} />
            </BarChart>
          </ResponsiveContainer>
        </>
      )}
    </Card>
  )
}

/* ── 3. Lost reasons ────────────────────────────────────────── */

function LostReasonsCard({ months }: { months: number }) {
  const { t } = useTranslation()
  const { data, isLoading } = useQuery<any>({
    queryKey: ['reporting-lost-reasons', months],
    queryFn: () => api.get('/v1/admin/reporting/lost-reasons', { params: { months } }).then(r => r.data),
  })

  return (
    <Card
      icon={<X size={14} className="text-red-400" />}
      title={t('reports.lost.title', 'Lost reasons')}
      subtitle={t('reports.lost.subtitle', { count: data?.total_count ?? 0, defaultValue: 'Why {{count}} deals slipped away' })}
    >
      {isLoading ? <Loading /> : !data?.reasons?.length ? <Empty label={t('reports.lost.empty', 'No lost deals — nice.')} /> : (
        <>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <Stat label={t('reports.lost.total_lost', 'Total lost')} value={data.total_count} valueClass="text-red-400" />
            <Stat
              label={t('reports.lost.lost_value', 'Lost value')}
              value={`€${Math.round(data.total_value).toLocaleString()}`}
              valueClass="text-red-400"
            />
          </div>
          <div className="grid grid-cols-2 gap-3 items-center">
            <ResponsiveContainer width="100%" height={150}>
              <PieChart>
                <Pie
                  data={data.reasons.map((r: any) => ({ name: r.label, value: r.count }))}
                  dataKey="value"
                  innerRadius={35}
                  outerRadius={60}
                  paddingAngle={1}
                >
                  {data.reasons.map((_: any, i: number) => (
                    <Cell key={i} fill={PIE_PALETTE[i % PIE_PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#0a0a0a', border: '1px solid #27272a', borderRadius: 8, fontSize: 12 }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-1.5">
              {data.reasons.map((r: any, i: number) => (
                <div key={r.label} className="flex items-center gap-2 text-xs">
                  <span
                    className="w-2 h-2 rounded-sm flex-shrink-0"
                    style={{ background: PIE_PALETTE[i % PIE_PALETTE.length] }}
                  />
                  <span className="text-white flex-1 truncate">{r.label}</span>
                  <span className="text-t-secondary tabular-nums">{r.count}</span>
                  {r.lost_value > 0 && (
                    <span className="text-red-400 tabular-nums text-[10px]">€{Math.round(r.lost_value/1000)}k</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </Card>
  )
}

/* ── 4. Source attribution ──────────────────────────────────── */

function SourceAttributionCard({ months }: { months: number }) {
  const { t } = useTranslation()
  const { data, isLoading } = useQuery<any>({
    queryKey: ['reporting-sources', months],
    queryFn: () => api.get('/v1/admin/reporting/source-attribution', { params: { months } }).then(r => r.data),
  })

  return (
    <Card
      icon={<BarChart3 size={14} className="text-violet-400" />}
      title={t('reports.sources.title', 'Source attribution')}
      subtitle={t('reports.sources.subtitle', 'Where the deals come from and which channel converts')}
    >
      {isLoading ? <Loading /> : !data?.sources?.length ? <Empty label={t('reports.sources.empty', 'No data yet.')} /> : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-t-secondary border-b border-dark-border">
              <th className="text-left font-bold py-2">{t('reports.sources.table.source', 'Source')}</th>
              <th className="text-right font-bold py-2">{t('reports.sources.table.total', 'Total')}</th>
              <th className="text-right font-bold py-2">{t('reports.sources.table.won', 'Won')}</th>
              <th className="text-right font-bold py-2">{t('reports.sources.table.lost', 'Lost')}</th>
              <th className="text-right font-bold py-2">{t('reports.sources.table.win_rate', 'Win rate')}</th>
              <th className="text-right font-bold py-2">{t('reports.sources.table.won_value', 'Won value')}</th>
            </tr>
          </thead>
          <tbody>
            {data.sources.map((s: any) => (
              <tr key={s.source} className="border-b border-dark-border/50">
                <td className="py-2 text-white capitalize">{s.source.replace('_', ' ')}</td>
                <td className="py-2 text-right tabular-nums text-white">{s.count}</td>
                <td className="py-2 text-right tabular-nums text-emerald-400">{s.won}</td>
                <td className="py-2 text-right tabular-nums text-red-400">{s.lost}</td>
                <td className="py-2 text-right tabular-nums text-white">
                  {s.win_rate_pct === null ? <span className="text-t-secondary">—</span> : `${s.win_rate_pct}%`}
                </td>
                <td className="py-2 text-right tabular-nums text-emerald-400">
                  {s.won_value > 0 ? `€${Math.round(s.won_value).toLocaleString()}` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  )
}

/* ── 5. Owner scoreboard ────────────────────────────────────── */

function OwnerScoreboardCard({ days, setDays }: { days: number; setDays: (n: number) => void }) {
  const { t } = useTranslation()
  const { data, isLoading } = useQuery<any>({
    queryKey: ['reporting-owner-activity', days],
    queryFn: () => api.get('/v1/admin/reporting/owner-activity', { params: { days } }).then(r => r.data),
  })

  return (
    <Card
      icon={<Users size={14} className="text-rose-400" />}
      title={t('reports.owner.title', 'Owner scoreboard')}
      subtitle={t('reports.owner.subtitle', { days, defaultValue: 'Per-rep activity, last {{days}} days' })}
      action={
        <div className="flex items-center gap-1 bg-dark-bg border border-dark-border rounded-md p-0.5">
          {[7, 30, 90].map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-2 py-1 text-[10px] font-bold rounded ${
                days === d ? 'bg-accent text-black' : 'text-t-secondary'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      }
    >
      {isLoading ? <Loading /> : !data?.owners?.length ? <Empty label={t('reports.owner.empty', 'No activity recorded yet.')} /> : (
        <div className="space-y-1.5">
          {data.owners.map((o: any, i: number) => (
            <div key={o.name + i} className="flex items-center gap-3 p-2 rounded-md hover:bg-dark-surface2">
              <span className="text-xs font-bold text-t-secondary w-5">{i + 1}</span>
              <span className="text-sm font-semibold text-white flex-1 truncate">{o.name}</span>
              <Pill icon={<Clock size={9} />} label={o.activities} color="#22d3ee" />
              <Pill icon={<Trophy size={9} />} label={o.won} color="#10b981" />
              <Pill label={t('reports.owner.open_pill', { count: o.open, defaultValue: '{{count}} open' })} color="#3b82f6" muted />
              <Pill label={t('reports.owner.lost_pill', { count: o.lost, defaultValue: '{{count}} lost' })} color="#ef4444" muted />
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function Pill({ icon, label, color, muted }: { icon?: React.ReactNode; label: any; color: string; muted?: boolean }) {
  return (
    <span
      className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold tabular-nums ${muted ? '' : 'border'}`}
      style={{
        color,
        background: muted ? 'transparent' : color + '15',
        borderColor: muted ? 'transparent' : color + '30',
      }}
    >
      {icon}
      {label}
    </span>
  )
}

/* ── 6. Top companies (LTV) ─────────────────────────────────── */

function CompanyLtvCard() {
  const { t } = useTranslation()
  const { data, isLoading } = useQuery<any>({
    queryKey: ['reporting-company-ltv'],
    queryFn: () => api.get('/v1/admin/reporting/company-ltv', { params: { limit: 10 } }).then(r => r.data),
  })

  return (
    <Card
      icon={<Building2 size={14} className="text-amber-400" />}
      title={t('reports.companies.title', 'Top companies')}
      subtitle={t('reports.companies.subtitle', 'By confirmed reservation revenue')}
    >
      {isLoading ? <Loading /> : !data?.companies?.length ? <Empty label={t('reports.companies.empty', 'No corporate revenue yet.')} /> : (
        <div className="space-y-1.5">
          {data.companies.map((c: any, i: number) => {
            const utilization = c.credit_limit
              ? Math.min(100, Math.round(c.confirmed_revenue / Number(c.credit_limit) * 100))
              : null
            return (
              <Link
                to="/corporate"
                key={c.id}
                className="flex items-center gap-3 p-2 rounded-md hover:bg-dark-surface2 group"
              >
                <span className="text-xs font-bold text-t-secondary w-5">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{c.company_name}</p>
                  <div className="flex items-center gap-2 text-[10px] text-t-secondary">
                    {c.industry && <span>{c.industry}</span>}
                    {utilization !== null && (
                      <>
                        {c.industry && <span>·</span>}
                        <span className={utilization >= 80 ? 'text-amber-400 font-bold' : ''}>
                          {t('reports.companies.credit_used', { percent: utilization, defaultValue: 'Credit {{percent}}% used' })}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-emerald-400 tabular-nums">
                    €{Math.round(c.confirmed_revenue).toLocaleString()}
                  </p>
                  {c.open_pipeline_value > 0 && (
                    <p className="text-[10px] text-t-secondary tabular-nums">
                      +€{Math.round(c.open_pipeline_value).toLocaleString()} {t('reports.companies.open_suffix', 'open')}
                    </p>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </Card>
  )
}

/* ── Helpers ────────────────────────────────────────────────── */

function Card({ icon, title, subtitle, action, children }: {
  icon: React.ReactNode
  title: string
  subtitle?: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="bg-dark-surface border border-dark-border rounded-xl p-4">
      <div className="flex items-start justify-between mb-3 gap-3">
        <div>
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            {icon}
            {title}
          </h2>
          {subtitle && <p className="text-xs text-t-secondary mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

function Stat({ label, value, valueClass = 'text-white' }: {
  label: string
  value: any
  valueClass?: string
}) {
  return (
    <div className="bg-dark-bg border border-dark-border rounded-md p-2.5">
      <p className="text-[10px] uppercase tracking-wide font-bold text-t-secondary">{label}</p>
      <p className={`text-lg font-bold tabular-nums mt-0.5 ${valueClass}`}>{value}</p>
    </div>
  )
}

function Loading() {
  const { t } = useTranslation()
  return <p className="text-sm text-t-secondary py-8 text-center">{t('reports.loading', 'Loading…')}</p>
}

function Empty({ label }: { label: string }) {
  return <p className="text-sm text-t-secondary py-8 text-center italic">{label}</p>
}
