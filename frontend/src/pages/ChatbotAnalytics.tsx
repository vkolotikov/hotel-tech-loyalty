import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { api } from '../lib/api'
import {
  MessageSquare, UserCheck, Bot, Users, ArrowUpRight,
  Clock, Globe, LayoutList, TrendingUp,
} from 'lucide-react'

const CHART_TOOLTIP = { backgroundColor: '#1a1a2e', border: '1px solid #2e2e50', borderRadius: 10, color: '#fff' }
const PIE_COLORS = ['#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#32d74b', '#ef4444', '#06b6d4', '#636366']

const DATE_RANGES = [
  { label: '7d',  days: 7  },
  { label: '14d', days: 14 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
]

interface Overview {
  total_conversations: number
  leads_captured: number
  ai_resolved: number
  human_escalated: number
  avg_messages: number
  ai_resolution_rate: number
  lead_conversion_rate: number
}
interface TrendPoint  { date: string; count: number }
interface HourlyPoint { hour: number; label: string; count: number }
interface PageRow      { page_url: string; count: number }
interface CountryRow   { country: string; count: number }
interface Analytics {
  overview: Overview
  trend: TrendPoint[]
  status_breakdown: Record<string, number>
  top_pages: PageRow[]
  top_countries: CountryRow[]
  hourly_distribution: HourlyPoint[]
}

function StatCard({
  icon: Icon, label, value, sub, color = 'text-primary-400',
}: { icon: any; label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-dark-card border border-dark-border rounded-xl p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-t-secondary mb-1">{label}</p>
          <p className={`text-2xl font-bold ${color}`}>{value}</p>
          {sub && <p className="text-xs text-t-secondary mt-0.5">{sub}</p>}
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

export function ChatbotAnalytics() {
  const [days, setDays] = useState(30)

  const { data, isLoading } = useQuery<Analytics>({
    queryKey: ['chatbot-analytics', days],
    queryFn: () => api.get(`/v1/admin/chatbot/analytics?days=${days}`).then(r => r.data),
  })

  const ov = data?.overview
  const statusData = data
    ? Object.entries(data.status_breakdown).map(([name, value]) => ({ name, value }))
    : []

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Chat Analytics</h2>
          <p className="text-xs text-t-secondary mt-0.5">Measure your AI sales agent's performance</p>
        </div>
        <div className="flex gap-1">
          {DATE_RANGES.map(r => (
            <button key={r.days} onClick={() => setDays(r.days)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${days === r.days ? 'bg-primary-600 text-white' : 'bg-dark-hover text-t-secondary hover:text-white'}`}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="text-center text-t-secondary py-12">Loading analytics…</div>
      ) : !data ? (
        <div className="text-center text-t-secondary py-12">No data available</div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <StatCard icon={MessageSquare} label="Total Conversations" value={ov!.total_conversations} color="text-blue-400" />
            <StatCard icon={UserCheck}    label="Leads Captured"      value={ov!.leads_captured}
              sub={`${ov!.lead_conversion_rate}% conversion`} color="text-green-400" />
            <StatCard icon={Bot}          label="AI Resolved"         value={ov!.ai_resolved}
              sub={`${ov!.ai_resolution_rate}% rate`} color="text-purple-400" />
            <StatCard icon={Users}        label="Escalated to Human"  value={ov!.human_escalated} color="text-amber-400" />
            <StatCard icon={TrendingUp}   label="Avg Messages / Chat" value={ov!.avg_messages} color="text-cyan-400" />
            <StatCard icon={ArrowUpRight} label="Lead Conversion"     value={`${ov!.lead_conversion_rate}%`} color="text-emerald-400" />
            <StatCard icon={Bot}          label="AI Resolution Rate"  value={`${ov!.ai_resolution_rate}%`} color="text-indigo-400" />
            <StatCard icon={ArrowUpRight} label="Human Escalation Rate"
              value={ov!.total_conversations > 0 ? `${Math.round((ov!.human_escalated / ov!.total_conversations) * 100)}%` : '0%'}
              color="text-rose-400" />
          </div>

          {/* Conversation Trend */}
          <div className="bg-dark-card border border-dark-border rounded-xl p-4">
            <h3 className="text-sm font-semibold text-white mb-4">Conversation Trend</h3>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={data.trend} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
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
                <Area type="monotone" dataKey="count" name="Conversations"
                  stroke="#3b82f6" fill="url(#convGrad)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Row: Hourly distribution + Status breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-dark-card border border-dark-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-4">
                <Clock size={14} className="text-t-secondary" />
                <h3 className="text-sm font-semibold text-white">Peak Hours</h3>
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={data.hourly_distribution} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2e2e50" />
                  <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#8e8e93' }}
                    interval={3} />
                  <YAxis tick={{ fontSize: 10, fill: '#8e8e93' }} />
                  <Tooltip contentStyle={CHART_TOOLTIP} />
                  <Bar dataKey="count" name="Messages" fill="#6366f1" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-dark-card border border-dark-border rounded-xl p-4">
              <h3 className="text-sm font-semibold text-white mb-4">Status Breakdown</h3>
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
                <p className="text-t-secondary text-sm py-8 text-center">No conversations yet</p>
              )}
            </div>
          </div>

          {/* Row: Top Pages + Top Countries */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-dark-card border border-dark-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <LayoutList size={14} className="text-t-secondary" />
                <h3 className="text-sm font-semibold text-white">Top Chat Pages</h3>
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
                <p className="text-t-secondary text-sm py-4 text-center">No page data yet</p>
              )}
            </div>

            <div className="bg-dark-card border border-dark-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Globe size={14} className="text-t-secondary" />
                <h3 className="text-sm font-semibold text-white">Visitor Countries</h3>
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
                <p className="text-t-secondary text-sm py-4 text-center">No country data yet</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
