import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import {
  Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Line, ComposedChart, Legend,
} from 'recharts'
import { api } from '../lib/api'
import {
  MessageSquare, UserCheck, Bot, Users, ArrowUpRight, ArrowDownRight,
  Clock, Globe, LayoutList, TrendingUp, CalendarDays, Tags, Filter as FilterIcon,
} from 'lucide-react'

const CHART_TOOLTIP = { backgroundColor: '#1a1a2e', border: '1px solid #2e2e50', borderRadius: 10, color: '#fff' }
const PIE_COLORS = ['#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#32d74b', '#ef4444', '#06b6d4', '#636366']

const DATE_RANGES = [
  { labelKey: 'd7',  fallback: '7d',  days: 7  },
  { labelKey: 'd14', fallback: '14d', days: 14 },
  { labelKey: 'd30', fallback: '30d', days: 30 },
  { labelKey: 'd90', fallback: '90d', days: 90 },
] as const

interface Overview {
  total_conversations: number
  leads_captured: number
  ai_resolved: number
  human_escalated: number
  avg_messages: number
  ai_resolution_rate: number
  lead_conversion_rate: number
  human_escalation_rate: number
}
interface TrendPoint  {
  date: string
  count: number
  engagedCount: number
  aiResolved: number
  aiResolutionRate: number
  prevCount: number
}
interface LengthBucket { bucket: string; label: string; count: number }
interface HourlyPoint { hour: number; label: string; count: number }
interface WeekdayPoint{ dow: number; label: string; count: number }
interface PageRow     { page_url: string; count: number }
interface CountryRow  { country: string; count: number }
interface IntentRow   { intent: string; count: number }
interface FunnelRow   { stage: string; count: number }
interface Analytics {
  overview: Overview
  previous_overview: Overview
  period_days: number
  trend: TrendPoint[]
  status_breakdown: Record<string, number>
  top_pages: PageRow[]
  top_countries: CountryRow[]
  hourly_distribution: HourlyPoint[]
  weekday_distribution: WeekdayPoint[]
  intent_breakdown: IntentRow[]
  funnel: FunnelRow[]
  length_distribution: LengthBucket[]
}

/** % delta vs previous period — pct + direction tone for display. */
function deltaOf(curr: number, prev: number): { pct: number; positive: boolean } | null {
  if (prev === 0 && curr === 0) return null
  if (prev === 0) return { pct: 100, positive: curr > 0 }
  const pct = Math.round(((curr - prev) / prev) * 100)
  return { pct: Math.abs(pct), positive: curr >= prev }
}

function StatCard({
  icon: Icon, label, value, sub, color = 'text-primary-400', delta,
}: {
  icon: any; label: string; value: string | number; sub?: string; color?: string
  delta?: { pct: number; positive: boolean } | null
}) {
  return (
    <div className="bg-dark-card border border-dark-border rounded-xl p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-t-secondary mb-1">{label}</p>
          <p className={`text-2xl font-bold ${color}`}>{value}</p>
          {delta && (
            <p className={`text-[11px] font-semibold mt-0.5 inline-flex items-center gap-0.5 ${delta.positive ? 'text-emerald-400' : 'text-red-400'}`}>
              {delta.positive ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
              {delta.pct}%
              <span className="text-t-secondary font-normal ml-1">vs prev</span>
            </p>
          )}
          {!delta && sub && <p className="text-xs text-t-secondary mt-0.5">{sub}</p>}
        </div>
        <div className="p-2 bg-dark-hover rounded-lg">
          <Icon size={18} className={color} />
        </div>
      </div>
    </div>
  )
}

/** Truncate a URL path to a readable label */
function shortUrl(url: string): string {
  try {
    const u = new URL(url)
    return (u.pathname + u.search).slice(0, 48) || '/'
  } catch {
    return url.slice(0, 48)
  }
}

// 7 canonical intents + fallback. Keep in sync with intentMeta.ts.
const INTENT_LABELS: Record<string, string> = {
  booking_inquiry: 'Booking',
  info_request:    'Info',
  complaint:       'Complaint',
  cancellation:    'Cancellation',
  support:         'Support',
  spam:            'Spam',
  other:           'Other',
  untagged:        'Untagged',
}

export function ChatbotAnalytics() {
  const { t } = useTranslation()
  const [days, setDays] = useState(30)

  const { data, isLoading } = useQuery<Analytics>({
    queryKey: ['chatbot-analytics', days],
    queryFn: () => api.get(`/v1/admin/chatbot/analytics?days=${days}`).then(r => r.data),
  })

  const ov = data?.overview
  const prev = data?.previous_overview
  const statusData = data
    ? Object.entries(data.status_breakdown).map(([name, value]) => ({ name, value }))
    : []

  // Build the funnel widths off the top stage so each row's bar is
  // proportionate to the entry point of the funnel.
  const funnelTop = data?.funnel?.[0]?.count ?? 0
  const funnelLabels: Record<string, string> = {
    conversations: t('chatbot_analytics.funnel.conversations', 'Conversations'),
    engaged:       t('chatbot_analytics.funnel.engaged', 'Engaged (sent message)'),
    with_contact:  t('chatbot_analytics.funnel.with_contact', 'Shared contact'),
    lead_captured: t('chatbot_analytics.funnel.lead_captured', 'Lead captured'),
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">{t('chatbot_analytics.title', 'Chat Analytics')}</h2>
          <p className="text-xs text-t-secondary mt-0.5">{t('chatbot_analytics.subtitle', "Measure your AI sales agent's performance")}</p>
        </div>
        <div className="flex gap-1">
          {DATE_RANGES.map(r => (
            <button key={r.days} onClick={() => setDays(r.days)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${days === r.days ? 'bg-primary-600 text-white' : 'bg-dark-hover text-t-secondary hover:text-white'}`}>
              {t(`chatbot_analytics.ranges.${r.labelKey}`, r.fallback)}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="text-center text-t-secondary py-12">{t('chatbot_analytics.loading', 'Loading analytics…')}</div>
      ) : !data ? (
        <div className="text-center text-t-secondary py-12">{t('chatbot_analytics.no_data', 'No data available')}</div>
      ) : (
        <>
          {/* KPI Cards — each card carries a vs-previous-period delta */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <StatCard icon={MessageSquare} color="text-blue-400"    label={t('chatbot_analytics.kpis.total_conversations', 'Total Conversations')} value={ov!.total_conversations}
              delta={deltaOf(ov!.total_conversations, prev!.total_conversations)} />
            <StatCard icon={UserCheck}     color="text-green-400"   label={t('chatbot_analytics.kpis.leads_captured', 'Leads Captured')} value={ov!.leads_captured}
              delta={deltaOf(ov!.leads_captured, prev!.leads_captured)} />
            <StatCard icon={Bot}           color="text-purple-400"  label={t('chatbot_analytics.kpis.ai_resolved', 'AI Resolved')} value={ov!.ai_resolved}
              delta={deltaOf(ov!.ai_resolved, prev!.ai_resolved)} />
            <StatCard icon={Users}         color="text-amber-400"   label={t('chatbot_analytics.kpis.escalated', 'Escalated to Human')} value={ov!.human_escalated}
              delta={deltaOf(ov!.human_escalated, prev!.human_escalated)} />
            <StatCard icon={TrendingUp}    color="text-cyan-400"    label={t('chatbot_analytics.kpis.avg_messages', 'Avg Messages / Chat')} value={ov!.avg_messages}
              delta={deltaOf(ov!.avg_messages, prev!.avg_messages)} />
            <StatCard icon={ArrowUpRight}  color="text-emerald-400" label={t('chatbot_analytics.kpis.lead_conversion', 'Lead Conversion')} value={`${ov!.lead_conversion_rate}%`}
              delta={deltaOf(ov!.lead_conversion_rate, prev!.lead_conversion_rate)} />
            <StatCard icon={Bot}           color="text-indigo-400"  label={t('chatbot_analytics.kpis.ai_resolution_rate', 'AI Resolution Rate')} value={`${ov!.ai_resolution_rate}%`}
              delta={deltaOf(ov!.ai_resolution_rate, prev!.ai_resolution_rate)} />
            <StatCard icon={ArrowUpRight}  color="text-rose-400"    label={t('chatbot_analytics.kpis.human_escalation_rate', 'Human Escalation Rate')} value={`${ov!.human_escalation_rate}%`}
              delta={deltaOf(ov!.human_escalation_rate, prev!.human_escalation_rate)} />
          </div>

          {/* Lead Funnel */}
          <div className="bg-dark-card border border-dark-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-4">
              <FilterIcon size={14} className="text-t-secondary" />
              <h3 className="text-sm font-semibold text-white">{t('chatbot_analytics.funnel_title', 'Lead Capture Funnel')}</h3>
            </div>
            {funnelTop > 0 ? (
              <div className="space-y-2">
                {data.funnel.map((row, i) => {
                  const prevCount = i > 0 ? data.funnel[i - 1].count : row.count
                  const pct = funnelTop > 0 ? Math.round((row.count / funnelTop) * 100) : 0
                  const dropFromPrev = prevCount > 0 ? Math.round((row.count / prevCount) * 100) : 100
                  return (
                    <div key={row.stage} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-white font-medium">{funnelLabels[row.stage] ?? row.stage}</span>
                        <span className="flex items-center gap-3">
                          <span className="text-white font-bold tabular-nums">{row.count.toLocaleString()}</span>
                          <span className="text-t-secondary tabular-nums w-12 text-right">{pct}%</span>
                          {i > 0 && <span className={`text-[10px] tabular-nums w-12 text-right ${dropFromPrev >= 80 ? 'text-emerald-400' : dropFromPrev >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                            {dropFromPrev}%
                          </span>}
                        </span>
                      </div>
                      <div className="h-2.5 bg-dark-hover rounded-full overflow-hidden">
                        <div className="h-full rounded-full"
                          style={{ width: `${pct}%`, background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-t-secondary text-sm py-4 text-center">{t('chatbot_analytics.no_funnel', 'No conversations to funnel yet')}</p>
            )}
          </div>

          {/* Conversation Trend — current period vs previous-period overlay,
              plus an Engaged series (visitor sent ≥1 message) so staff
              can see how many conversations actually got interaction
              vs total bot-greeter touches. */}
          <div className="bg-dark-card border border-dark-border rounded-xl p-4">
            <h3 className="text-sm font-semibold text-white mb-4">
              {t('chatbot_analytics.trend_title', 'Conversation Trend')}
              <span className="text-[10px] text-t-secondary font-normal ml-2">{t('chatbot_analytics.vs_previous', 'vs previous period')}</span>
            </h3>
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={data.trend} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="convGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2e2e50" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#8e8e93' }}
                  tickFormatter={d => d.slice(5)} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: '#8e8e93' }} />
                <Tooltip contentStyle={CHART_TOOLTIP} labelStyle={{ color: '#8e8e93' }} />
                <Legend wrapperStyle={{ fontSize: 11, color: '#8e8e93' }} />
                <Area type="monotone" dataKey="count" name={t('chatbot_analytics.series.total', 'Total')}
                  stroke="#3b82f6" fill="url(#convGrad)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="engagedCount" name={t('chatbot_analytics.series.engaged', 'Engaged (visitor replied)')}
                  stroke="#22c55e" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="prevCount" name={t('chatbot_analytics.series.previous', 'Previous period')}
                  stroke="#8e8e93" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* AI Resolution Rate trend — % of daily conversations the
              AI closed without human handoff. Surfaces drift in
              answer-quality over time at a glance. */}
          <div className="bg-dark-card border border-dark-border rounded-xl p-4">
            <h3 className="text-sm font-semibold text-white mb-1">{t('chatbot_analytics.resolution_trend_title', 'AI Resolution Rate Trend')}</h3>
            <p className="text-[11px] text-t-secondary mb-3">{t('chatbot_analytics.resolution_trend_sub', 'Daily share of conversations resolved by AI without human handoff')}</p>
            <ResponsiveContainer width="100%" height={200}>
              <ComposedChart data={data.trend} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="resRateGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#a855f7" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2e2e50" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#8e8e93' }}
                  tickFormatter={d => d.slice(5)} interval="preserveStartEnd" />
                <YAxis yAxisId="left"  domain={[0, 100]} tick={{ fontSize: 10, fill: '#8e8e93' }} tickFormatter={v => `${v}%`} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#8e8e93' }} />
                <Tooltip contentStyle={CHART_TOOLTIP} />
                <Legend wrapperStyle={{ fontSize: 11, color: '#8e8e93' }} />
                <Area  yAxisId="left"  type="monotone" dataKey="aiResolutionRate" name={t('chatbot_analytics.series.resolution_rate', 'Resolution rate %')} stroke="#a855f7" fill="url(#resRateGrad)" strokeWidth={2} dot={false} />
                <Line  yAxisId="right" type="monotone" dataKey="aiResolved"       name={t('chatbot_analytics.series.ai_resolved_count', 'AI resolved (count)')} stroke="#22c55e" strokeWidth={1.5} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Conversation length distribution — bucketed visitor-message
              counts. Heavy left-skew means most visitors bounce after
              the greeter; right-skew means engaged conversations. */}
          {data.length_distribution && data.length_distribution.length > 0 && (
            <div className="bg-dark-card border border-dark-border rounded-xl p-4">
              <h3 className="text-sm font-semibold text-white mb-1">{t('chatbot_analytics.length_dist_title', 'Conversation Length Distribution')}</h3>
              <p className="text-[11px] text-t-secondary mb-3">{t('chatbot_analytics.length_dist_sub', 'How many visitor messages each conversation reached')}</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.length_distribution} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2e2e50" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#8e8e93' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#8e8e93' }} />
                  <Tooltip contentStyle={CHART_TOOLTIP} />
                  <Bar dataKey="count" name={t('chatbot_analytics.series.conversations', 'Conversations')} radius={[3, 3, 0, 0]}>
                    {data.length_distribution.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Row: Hourly + Weekday */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-dark-card border border-dark-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-4">
                <Clock size={14} className="text-t-secondary" />
                <h3 className="text-sm font-semibold text-white">{t('chatbot_analytics.peak_hours', 'Peak Hours')}</h3>
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={data.hourly_distribution} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2e2e50" />
                  <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#8e8e93' }} interval={3} />
                  <YAxis tick={{ fontSize: 10, fill: '#8e8e93' }} />
                  <Tooltip contentStyle={CHART_TOOLTIP} />
                  <Bar dataKey="count" name={t('chatbot_analytics.series.messages', 'Messages')} fill="#6366f1" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-dark-card border border-dark-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-4">
                <CalendarDays size={14} className="text-t-secondary" />
                <h3 className="text-sm font-semibold text-white">{t('chatbot_analytics.weekday', 'Day-of-Week Activity')}</h3>
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={data.weekday_distribution} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2e2e50" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#8e8e93' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#8e8e93' }} />
                  <Tooltip contentStyle={CHART_TOOLTIP} />
                  <Bar dataKey="count" name={t('chatbot_analytics.series.conversations', 'Conversations')} fill="#22c55e" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Row: Status breakdown + Intent breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-dark-card border border-dark-border rounded-xl p-4">
              <h3 className="text-sm font-semibold text-white mb-4">{t('chatbot_analytics.status_breakdown', 'Status Breakdown')}</h3>
              {statusData.length > 0 ? (
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width="50%" height={160}>
                    <PieChart>
                      <Pie data={statusData} dataKey="value" nameKey="name"
                        cx="50%" cy="50%" outerRadius={65} innerRadius={35}>
                        {statusData.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={CHART_TOOLTIP} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-2">
                    {statusData.map((s, i) => (
                      <div key={s.name} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                          <span className="text-t-secondary capitalize">{s.name}</span>
                        </span>
                        <span className="text-white font-medium">{s.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-t-secondary text-sm py-8 text-center">{t('chatbot_analytics.no_conversations', 'No conversations yet')}</p>
              )}
            </div>

            <div className="bg-dark-card border border-dark-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-4">
                <Tags size={14} className="text-t-secondary" />
                <h3 className="text-sm font-semibold text-white">{t('chatbot_analytics.intent_breakdown', 'Intent Breakdown')}</h3>
              </div>
              {data.intent_breakdown.length > 0 ? (
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width="50%" height={160}>
                    <PieChart>
                      <Pie data={data.intent_breakdown} dataKey="count" nameKey="intent"
                        cx="50%" cy="50%" outerRadius={65} innerRadius={35}>
                        {data.intent_breakdown.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={CHART_TOOLTIP} formatter={(v: any, _n, p) => [v, INTENT_LABELS[p.payload.intent] ?? p.payload.intent]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-2">
                    {data.intent_breakdown.map((r, i) => (
                      <div key={r.intent} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                          <span className="text-t-secondary">{INTENT_LABELS[r.intent] ?? r.intent}</span>
                        </span>
                        <span className="text-white font-medium">{r.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-t-secondary text-sm py-8 text-center">{t('chatbot_analytics.no_intents', 'No intent data yet')}</p>
              )}
            </div>
          </div>

          {/* Row: Top Pages + Top Countries */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-dark-card border border-dark-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <LayoutList size={14} className="text-t-secondary" />
                <h3 className="text-sm font-semibold text-white">{t('chatbot_analytics.top_pages', 'Top Chat Pages')}</h3>
              </div>
              {data.top_pages.length > 0 ? (
                <div className="space-y-2">
                  {data.top_pages.map((p, i) => {
                    const max = data.top_pages[0].count
                    return (
                      <div key={i} className="space-y-0.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-t-secondary truncate max-w-[70%]" title={p.page_url}>
                            {shortUrl(p.page_url)}
                          </span>
                          <span className="text-xs text-white font-medium">{p.count}</span>
                        </div>
                        <div className="h-1 bg-dark-hover rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full"
                            style={{ width: `${(p.count / max) * 100}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-t-secondary text-sm py-4 text-center">{t('chatbot_analytics.no_page_data', 'No page data yet')}</p>
              )}
            </div>

            <div className="bg-dark-card border border-dark-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Globe size={14} className="text-t-secondary" />
                <h3 className="text-sm font-semibold text-white">{t('chatbot_analytics.visitor_countries', 'Visitor Countries')}</h3>
              </div>
              {data.top_countries.length > 0 ? (
                <div className="space-y-2">
                  {data.top_countries.map((c, i) => {
                    const max = data.top_countries[0].count
                    return (
                      <div key={i} className="space-y-0.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-t-secondary">{c.country}</span>
                          <span className="text-xs text-white font-medium">{c.count}</span>
                        </div>
                        <div className="h-1 bg-dark-hover rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full"
                            style={{ width: `${(c.count / max) * 100}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-t-secondary text-sm py-4 text-center">{t('chatbot_analytics.no_country_data', 'No country data yet')}</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
