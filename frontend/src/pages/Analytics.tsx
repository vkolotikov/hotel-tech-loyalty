import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ComposedChart, Line
} from 'recharts'
import { api } from '../lib/api'
import { Card } from '../components/ui/Card'
import {
  Users, Award, TrendingUp, DollarSign, Download, Activity,
  ArrowUpRight, ArrowDownRight, Clock, Target, PieChart as PieIcon,
  BarChart3, Zap, Hotel, AlertTriangle
} from 'lucide-react'

const TIER_COLORS = ['#CD7F32', '#C0C0C0', '#FFD700', '#6B6B6B', '#00BCD4']
const CHART_TOOLTIP = { backgroundColor: '#1a1a2e', border: '1px solid #2e2e50', borderRadius: 10, color: '#fff' }
const CHART_LABEL = { color: '#8e8e93' }

const POINTS_RANGES = [
  { label: '7 Days', days: 7 },
  { label: '30 Days', days: 30 },
  { label: '90 Days', days: 90 },
  { label: '180 Days', days: 180 },
  { label: '1 Year', days: 365 },
]

const BOOKING_RANGES = [
  { label: '7d', days: 7 },
  { label: '14d', days: 14 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
]

const GROWTH_RANGES = [
  { label: '6m', months: 6 },
  { label: '12m', months: 12 },
  { label: '24m', months: 24 },
]

type ActiveTab = 'overview' | 'points' | 'members' | 'bookings'

export function Analytics() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview')
  const [pointsDays, setPointsDays] = useState(30)
  const [bookingDays, setBookingDays] = useState(30)
  const [growthMonths, setGrowthMonths] = useState(12)

  const { data: overview } = useQuery({
    queryKey: ['analytics-overview'],
    queryFn: () => api.get('/v1/admin/analytics/overview').then(r => r.data),
  })

  const { data: pointsData } = useQuery({
    queryKey: ['analytics-points', pointsDays],
    queryFn: () => api.get(`/v1/admin/analytics/points?days=${pointsDays}`).then(r => r.data),
  })

  const { data: memberGrowth } = useQuery({
    queryKey: ['analytics-member-growth', growthMonths],
    queryFn: () => api.get(`/v1/admin/analytics/member-growth?months=${growthMonths}`).then(r => r.data),
  })

  const { data: revenue } = useQuery({
    queryKey: ['analytics-revenue'],
    queryFn: () => api.get('/v1/admin/analytics/revenue').then(r => r.data),
  })

  const { data: revenueTrend } = useQuery({
    queryKey: ['analytics-revenue-trend'],
    queryFn: () => api.get('/v1/admin/analytics/revenue-trend?months=12').then(r => r.data),
  })

  const { data: bookingTrends } = useQuery({
    queryKey: ['analytics-booking-trends', bookingDays],
    queryFn: () => api.get(`/v1/admin/analytics/booking-trends?days=${bookingDays}`).then(r => r.data),
  })

  const { data: engagement } = useQuery({
    queryKey: ['analytics-engagement'],
    queryFn: () => api.get('/v1/admin/analytics/engagement').then(r => r.data),
  })

  const { data: pointsDist } = useQuery({
    queryKey: ['analytics-points-distribution'],
    queryFn: () => api.get('/v1/admin/analytics/points-distribution').then(r => r.data),
  })

  const { data: redemptionTrend } = useQuery({
    queryKey: ['analytics-redemption-trend'],
    queryFn: () => api.get('/v1/admin/analytics/redemption-trend?months=12').then(r => r.data),
  })

  const { data: bookingMetrics } = useQuery({
    queryKey: ['analytics-booking-metrics'],
    queryFn: () => api.get('/v1/admin/analytics/booking-metrics?months=12').then(r => r.data),
  })

  const { data: expiryForecast } = useQuery({
    queryKey: ['analytics-expiry-forecast'],
    queryFn: () => api.get('/v1/admin/analytics/expiry-forecast?months=6').then(r => r.data),
  })

  const kpis = overview?.kpis
  const tierDist = overview?.tier_distribution ?? []

  const tabs: { id: ActiveTab; label: string; icon: any }[] = [
    { id: 'overview', label: 'Overview', icon: <BarChart3 size={15} /> },
    { id: 'points', label: 'Points & Rewards', icon: <Award size={15} /> },
    { id: 'members', label: 'Members', icon: <Users size={15} /> },
    { id: 'bookings', label: 'Bookings & Revenue', icon: <Hotel size={15} /> },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Analytics</h1>
          <p className="text-sm text-[#8e8e93] mt-1">Deep dive into loyalty program performance</p>
        </div>
        <button className="flex items-center gap-2 bg-dark-surface border border-dark-border text-[#e0e0e0] px-4 py-2 rounded-lg text-sm font-semibold hover:bg-dark-surface2 transition-colors">
          <Download size={15} /> Export Report
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 bg-dark-surface rounded-xl p-1 border border-dark-border">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all flex-1 justify-center ${
              activeTab === tab.id
                ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/20'
                : 'text-[#8e8e93] hover:text-white hover:bg-dark-surface2'
            }`}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ════════════════ OVERVIEW TAB ════════════════ */}
      {activeTab === 'overview' && (
        <>
          {/* Metric Summary */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            {[
              { label: 'Total Members', value: kpis?.total_members?.toLocaleString() ?? '—', icon: <Users size={18} />, color: 'text-blue-400', bg: 'bg-blue-500/15' },
              { label: 'Avg Points / Member', value: kpis?.avg_points_per_member?.toLocaleString() ?? '—', icon: <Award size={18} />, color: 'text-amber-400', bg: 'bg-amber-500/15' },
              { label: 'Active Stays', value: kpis?.active_stays ?? '—', icon: <TrendingUp size={18} />, color: 'text-[#32d74b]', bg: 'bg-[#32d74b]/15' },
              { label: 'Revenue (Month)', value: kpis ? `$${Number(kpis.revenue_this_month).toLocaleString()}` : '—', icon: <DollarSign size={18} />, color: 'text-purple-400', bg: 'bg-purple-500/15' },
            ].map(m => (
              <div key={m.label} className="bg-dark-surface rounded-xl border border-dark-border p-5">
                <div className={`inline-flex p-2 rounded-lg ${m.bg} ${m.color} mb-3`}>{m.icon}</div>
                <p className="text-2xl font-bold text-white">{m.value}</p>
                <p className="text-xs text-[#8e8e93] mt-0.5">{m.label}</p>
              </div>
            ))}
          </div>

          {/* Points Activity */}
          <Card>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-base font-semibold text-white">Points Activity</h3>
                <p className="text-xs text-[#636366] mt-0.5">Points earned vs redeemed over time</p>
              </div>
              <div className="flex gap-1 bg-dark-surface2 rounded-lg p-1">
                {POINTS_RANGES.map(r => (
                  <button
                    key={r.days}
                    onClick={() => setPointsDays(r.days)}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                      pointsDays === r.days
                        ? 'bg-primary-600 text-white shadow-sm'
                        : 'text-[#8e8e93] hover:text-white'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={pointsData ?? []}>
                <defs>
                  <linearGradient id="gEarned" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#c9a84c" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#c9a84c" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gRedeemed" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#32d74b" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#32d74b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2c" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#8e8e93' }} tickFormatter={(v) => v?.slice(5) ?? v} />
                <YAxis tick={{ fontSize: 11, fill: '#8e8e93' }} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                <Tooltip contentStyle={CHART_TOOLTIP} labelStyle={CHART_LABEL} formatter={(v: any) => Number(v).toLocaleString()} />
                <Legend />
                <Area type="monotone" dataKey="earned" stroke="#c9a84c" strokeWidth={2} fill="url(#gEarned)" name="Earned" />
                <Area type="monotone" dataKey="redeemed" stroke="#32d74b" strokeWidth={2} fill="url(#gRedeemed)" name="Redeemed" />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          {/* Tier + Revenue by Room Type */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Card>
              <h3 className="text-base font-semibold text-white mb-5 flex items-center gap-2">
                <PieIcon size={16} className="text-primary-400" />
                Tier Distribution
              </h3>
              <div className="flex gap-6 items-center">
                <ResponsiveContainer width="55%" height={220}>
                  <PieChart>
                    <Pie data={tierDist} dataKey="count" cx="50%" cy="50%" innerRadius={55} outerRadius={90}>
                      {tierDist.map((_: any, i: number) => (
                        <Cell key={i} fill={TIER_COLORS[i % TIER_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={CHART_TOOLTIP} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {tierDist.map((t: any, i: number) => {
                    const total = tierDist.reduce((s: number, x: any) => s + x.count, 0)
                    const pct = total > 0 ? Math.round((t.count / total) * 100) : 0
                    return (
                      <div key={i} className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: TIER_COLORS[i % TIER_COLORS.length] }} />
                        <div className="flex-1">
                          <div className="flex justify-between mb-0.5">
                            <span className="text-xs font-medium text-[#e0e0e0]">{t.tier}</span>
                            <span className="text-xs text-[#8e8e93]">{t.count} ({pct}%)</span>
                          </div>
                          <div className="h-1.5 bg-dark-surface3 rounded-full">
                            <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, backgroundColor: TIER_COLORS[i % TIER_COLORS.length] }} />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </Card>

            <Card>
              <h3 className="text-base font-semibold text-white mb-5 flex items-center gap-2">
                <Hotel size={16} className="text-purple-400" />
                Revenue by Room Type
              </h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={revenue ?? []} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2c" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#8e8e93' }} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                  <YAxis dataKey="room_type" type="category" tick={{ fontSize: 11, fill: '#8e8e93' }} width={85} />
                  <Tooltip contentStyle={CHART_TOOLTIP} labelStyle={CHART_LABEL} formatter={(v: any) => `$${Number(v).toLocaleString()}`} />
                  <Bar dataKey="revenue" fill="#8b5cf6" radius={[0, 4, 4, 0]} name="Revenue" />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>

          {/* Member Growth */}
          <Card>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <Activity size={16} className="text-amber-400" />
                Member Growth
              </h3>
              <div className="flex gap-1 bg-dark-surface2 rounded-lg p-1">
                {GROWTH_RANGES.map(r => (
                  <button
                    key={r.months}
                    onClick={() => setGrowthMonths(r.months)}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                      growthMonths === r.months
                        ? 'bg-primary-600 text-white shadow-sm'
                        : 'text-[#8e8e93] hover:text-white'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={memberGrowth ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2c" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#8e8e93' }} />
                <YAxis tick={{ fontSize: 11, fill: '#8e8e93' }} />
                <Tooltip contentStyle={CHART_TOOLTIP} labelStyle={CHART_LABEL} />
                <Legend />
                <Bar dataKey="new_members" fill="#c9a84c" radius={[4, 4, 0, 0]} name="New Members" opacity={0.8} />
                <Line type="monotone" dataKey="new_members" stroke="#9a7a30" strokeWidth={2} dot={false} name="Trend" />
              </ComposedChart>
            </ResponsiveContainer>
          </Card>

          {/* Top Members */}
          <Card>
            <h3 className="text-base font-semibold text-white mb-4">Top Members by Lifetime Points</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[#8e8e93] text-xs uppercase tracking-wide border-b border-dark-border">
                    <th className="pb-3 font-semibold">#</th>
                    <th className="pb-3 font-semibold">Member</th>
                    <th className="pb-3 font-semibold">Tier</th>
                    <th className="pb-3 font-semibold text-right">Lifetime Points</th>
                    <th className="pb-3 font-semibold text-right">Current Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-border">
                  {(overview?.top_members ?? []).map((m: any, i: number) => (
                    <tr key={i} className="hover:bg-dark-surface2 transition-colors">
                      <td className="py-3 text-[#636366] font-bold">{i + 1}</td>
                      <td className="py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded-full bg-primary-500/20 flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-bold text-primary-400">{m.name?.charAt(0)}</span>
                          </div>
                          <div>
                            <p className="font-semibold text-white">{m.name}</p>
                            <p className="text-xs text-[#636366]">{m.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3">
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-dark-surface3 text-[#a0a0a0]">{m.tier}</span>
                      </td>
                      <td className="py-3 font-bold text-white text-right">{m.lifetime_points?.toLocaleString()}</td>
                      <td className="py-3 text-[#a0a0a0] text-right">{m.current_points?.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {/* ════════════════ POINTS TAB ════════════════ */}
      {activeTab === 'points' && (
        <>
          {/* Points KPIs */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            {[
              { label: 'Issued This Month', value: kpis?.points_issued_this_month?.toLocaleString() ?? '—', icon: <ArrowUpRight size={18} />, color: 'text-[#32d74b]', bg: 'bg-[#32d74b]/15' },
              { label: 'Redeemed This Month', value: kpis?.points_redeemed_this_month?.toLocaleString() ?? '—', icon: <ArrowDownRight size={18} />, color: 'text-[#ff375f]', bg: 'bg-[#ff375f]/15' },
              { label: 'Outstanding Points', value: kpis?.total_outstanding_points?.toLocaleString() ?? '—', icon: <Target size={18} />, color: 'text-amber-400', bg: 'bg-amber-500/15' },
              { label: 'Redemption Rate', value: `${kpis?.redemption_rate ?? 0}%`, icon: <Zap size={18} />, color: 'text-purple-400', bg: 'bg-purple-500/15' },
            ].map(m => (
              <div key={m.label} className="bg-dark-surface rounded-xl border border-dark-border p-5">
                <div className={`inline-flex p-2 rounded-lg ${m.bg} ${m.color} mb-3`}>{m.icon}</div>
                <p className="text-2xl font-bold text-white">{m.value}</p>
                <p className="text-xs text-[#8e8e93] mt-0.5">{m.label}</p>
              </div>
            ))}
          </div>

          {/* Points Activity with extended ranges */}
          <Card>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-base font-semibold text-white">Points Flow</h3>
                <p className="text-xs text-[#636366] mt-0.5">Earned vs redeemed over time</p>
              </div>
              <div className="flex gap-1 bg-dark-surface2 rounded-lg p-1">
                {POINTS_RANGES.map(r => (
                  <button
                    key={r.days}
                    onClick={() => setPointsDays(r.days)}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                      pointsDays === r.days ? 'bg-primary-600 text-white shadow-sm' : 'text-[#8e8e93] hover:text-white'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={pointsData ?? []}>
                <defs>
                  <linearGradient id="gEarned2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#c9a84c" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#c9a84c" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gRedeemed2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#32d74b" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#32d74b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2c" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#8e8e93' }} tickFormatter={(v) => v?.slice(5) ?? v} />
                <YAxis tick={{ fontSize: 11, fill: '#8e8e93' }} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                <Tooltip contentStyle={CHART_TOOLTIP} labelStyle={CHART_LABEL} formatter={(v: any) => Number(v).toLocaleString()} />
                <Legend />
                <Area type="monotone" dataKey="earned" stroke="#c9a84c" strokeWidth={2} fill="url(#gEarned2)" name="Earned" />
                <Area type="monotone" dataKey="redeemed" stroke="#32d74b" strokeWidth={2} fill="url(#gRedeemed2)" name="Redeemed" />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          {/* Redemption Rate Trend + Points Distribution */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Card>
              <h3 className="text-base font-semibold text-white mb-5 flex items-center gap-2">
                <Zap size={16} className="text-purple-400" />
                Redemption Rate Trend
              </h3>
              <ResponsiveContainer width="100%" height={250}>
                <ComposedChart data={redemptionTrend ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2c" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#8e8e93' }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#8e8e93' }} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#8e8e93' }} tickFormatter={(v) => `${v}%`} />
                  <Tooltip contentStyle={CHART_TOOLTIP} labelStyle={CHART_LABEL} />
                  <Legend />
                  <Bar yAxisId="left" dataKey="earned" fill="#c9a84c" opacity={0.6} radius={[3, 3, 0, 0]} name="Earned" />
                  <Bar yAxisId="left" dataKey="redeemed" fill="#32d74b" opacity={0.6} radius={[3, 3, 0, 0]} name="Redeemed" />
                  <Line yAxisId="right" type="monotone" dataKey="rate" stroke="#8b5cf6" strokeWidth={2.5} dot={{ r: 3, fill: '#8b5cf6' }} name="Rate %" />
                </ComposedChart>
              </ResponsiveContainer>
            </Card>

            <Card>
              <h3 className="text-base font-semibold text-white mb-5 flex items-center gap-2">
                <Target size={16} className="text-amber-400" />
                Points Balance Distribution
              </h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={pointsDist ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2c" />
                  <XAxis dataKey="range" tick={{ fontSize: 11, fill: '#8e8e93' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#8e8e93' }} />
                  <Tooltip contentStyle={CHART_TOOLTIP} labelStyle={CHART_LABEL} />
                  <Bar dataKey="members" fill="#6366f1" radius={[4, 4, 0, 0]} name="Members" />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>

          {/* Points Expiry Forecast */}
          <Card>
            <h3 className="text-base font-semibold text-white mb-2 flex items-center gap-2">
              <AlertTriangle size={16} className="text-amber-400" />
              Points Expiry Forecast
            </h3>
            <p className="text-xs text-[#636366] mb-5">Points scheduled to expire in upcoming months</p>
            {(expiryForecast ?? []).length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={expiryForecast ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2c" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#8e8e93' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#8e8e93' }} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                  <Tooltip contentStyle={CHART_TOOLTIP} labelStyle={CHART_LABEL} formatter={(v: any, name: any) => [Number(v).toLocaleString(), name === 'points' ? 'Points' : name]} />
                  <Bar dataKey="points" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Expiring Points" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-[#636366] text-sm py-8 text-center">No points expiry data available</p>
            )}
          </Card>

          {/* Financial summary */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="bg-dark-surface rounded-xl border border-dark-border p-5">
              <p className="text-xs text-[#8e8e93] mb-1">Outstanding Points</p>
              <p className="text-2xl font-bold text-amber-400">{(kpis?.total_outstanding_points ?? 0).toLocaleString()}</p>
            </div>
            <div className="bg-dark-surface rounded-xl border border-dark-border p-5">
              <p className="text-xs text-[#8e8e93] mb-1">Estimated Liability</p>
              <p className="text-2xl font-bold text-purple-400">${(kpis?.point_liability_currency ?? 0).toLocaleString()}</p>
            </div>
            <div className="bg-dark-surface rounded-xl border border-dark-border p-5">
              <p className="text-xs text-[#8e8e93] mb-1">Avg Points / Member</p>
              <p className="text-2xl font-bold text-blue-400">{(kpis?.avg_points_per_member ?? 0).toLocaleString()}</p>
            </div>
            <div className="bg-dark-surface rounded-xl border border-dark-border p-5">
              <p className="text-xs text-[#8e8e93] mb-1">Engaged Members (30d)</p>
              <p className="text-2xl font-bold text-[#32d74b]">{(kpis?.engaged_members_30d ?? 0).toLocaleString()}</p>
            </div>
          </div>
        </>
      )}

      {/* ════════════════ MEMBERS TAB ════════════════ */}
      {activeTab === 'members' && (
        <>
          {/* Member KPIs */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            {[
              { label: 'Total Members', value: kpis?.total_members?.toLocaleString() ?? '—', color: 'text-blue-400', bg: 'bg-blue-500/15', icon: <Users size={18} /> },
              { label: 'Active Members', value: kpis?.active_members?.toLocaleString() ?? '—', color: 'text-[#32d74b]', bg: 'bg-[#32d74b]/15', icon: <Activity size={18} /> },
              { label: 'New This Month', value: kpis?.new_members_this_month?.toLocaleString() ?? '—', color: 'text-primary-400', bg: 'bg-primary-500/15', icon: <ArrowUpRight size={18} /> },
              { label: 'Engaged (30d)', value: kpis?.engaged_members_30d?.toLocaleString() ?? '—', color: 'text-amber-400', bg: 'bg-amber-500/15', icon: <Zap size={18} /> },
            ].map(m => (
              <div key={m.label} className="bg-dark-surface rounded-xl border border-dark-border p-5">
                <div className={`inline-flex p-2 rounded-lg ${m.bg} ${m.color} mb-3`}>{m.icon}</div>
                <p className="text-2xl font-bold text-white">{m.value}</p>
                <p className="text-xs text-[#8e8e93] mt-0.5">{m.label}</p>
              </div>
            ))}
          </div>

          {/* Engagement Breakdown + Tier Dist */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Card>
              <h3 className="text-base font-semibold text-white mb-5 flex items-center gap-2">
                <Activity size={16} className="text-[#32d74b]" />
                Member Engagement
              </h3>
              <div className="flex gap-6 items-center">
                <ResponsiveContainer width="45%" height={220}>
                  <PieChart>
                    <Pie data={engagement ?? []} dataKey="count" nameKey="segment" cx="50%" cy="50%" innerRadius={50} outerRadius={85}>
                      {(engagement ?? []).map((e: any, i: number) => (
                        <Cell key={i} fill={e.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={CHART_TOOLTIP} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-3">
                  {(engagement ?? []).map((e: any, i: number) => {
                    const total = (engagement ?? []).reduce((s: number, x: any) => s + x.count, 0)
                    const pct = total > 0 ? Math.round((e.count / total) * 100) : 0
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: e.color }} />
                        <div className="flex-1">
                          <div className="flex justify-between mb-0.5">
                            <span className="text-xs font-medium text-[#e0e0e0]">{e.segment}</span>
                            <span className="text-xs text-[#8e8e93]">{e.count} ({pct}%)</span>
                          </div>
                          <div className="h-1.5 bg-dark-surface3 rounded-full">
                            <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, backgroundColor: e.color }} />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </Card>

            <Card>
              <h3 className="text-base font-semibold text-white mb-5 flex items-center gap-2">
                <PieIcon size={16} className="text-primary-400" />
                Tier Distribution
              </h3>
              <div className="flex gap-6 items-center">
                <ResponsiveContainer width="55%" height={220}>
                  <PieChart>
                    <Pie data={tierDist} dataKey="count" cx="50%" cy="50%" innerRadius={55} outerRadius={90}>
                      {tierDist.map((_: any, i: number) => (
                        <Cell key={i} fill={TIER_COLORS[i % TIER_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={CHART_TOOLTIP} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {tierDist.map((t: any, i: number) => {
                    const total = tierDist.reduce((s: number, x: any) => s + x.count, 0)
                    const pct = total > 0 ? Math.round((t.count / total) * 100) : 0
                    return (
                      <div key={i} className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: TIER_COLORS[i % TIER_COLORS.length] }} />
                        <div className="flex-1">
                          <div className="flex justify-between mb-0.5">
                            <span className="text-xs font-medium text-[#e0e0e0]">{t.tier}</span>
                            <span className="text-xs text-[#8e8e93]">{t.count} ({pct}%)</span>
                          </div>
                          <div className="h-1.5 bg-dark-surface3 rounded-full">
                            <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, backgroundColor: TIER_COLORS[i % TIER_COLORS.length] }} />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </Card>
          </div>

          {/* Member Growth with filter */}
          <Card>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <TrendingUp size={16} className="text-amber-400" />
                Member Growth
              </h3>
              <div className="flex gap-1 bg-dark-surface2 rounded-lg p-1">
                {GROWTH_RANGES.map(r => (
                  <button
                    key={r.months}
                    onClick={() => setGrowthMonths(r.months)}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                      growthMonths === r.months ? 'bg-primary-600 text-white shadow-sm' : 'text-[#8e8e93] hover:text-white'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={memberGrowth ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2c" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#8e8e93' }} />
                <YAxis tick={{ fontSize: 11, fill: '#8e8e93' }} />
                <Tooltip contentStyle={CHART_TOOLTIP} labelStyle={CHART_LABEL} />
                <Legend />
                <Bar dataKey="new_members" fill="#c9a84c" radius={[4, 4, 0, 0]} name="New Members" opacity={0.8} />
                <Line type="monotone" dataKey="new_members" stroke="#9a7a30" strokeWidth={2} dot={false} name="Trend" />
              </ComposedChart>
            </ResponsiveContainer>
          </Card>

          {/* Points Balance Distribution */}
          <Card>
            <h3 className="text-base font-semibold text-white mb-5 flex items-center gap-2">
              <Target size={16} className="text-blue-400" />
              Member Points Balance Distribution
            </h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={pointsDist ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2c" />
                <XAxis dataKey="range" tick={{ fontSize: 11, fill: '#8e8e93' }} />
                <YAxis tick={{ fontSize: 11, fill: '#8e8e93' }} />
                <Tooltip contentStyle={CHART_TOOLTIP} labelStyle={CHART_LABEL} />
                <Bar dataKey="members" fill="#6366f1" radius={[4, 4, 0, 0]} name="Members" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </>
      )}

      {/* ════════════════ BOOKINGS TAB ════════════════ */}
      {activeTab === 'bookings' && (
        <>
          {/* Revenue KPIs */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            {[
              { label: 'Revenue (Month)', value: kpis ? `$${Number(kpis.revenue_this_month).toLocaleString()}` : '—', icon: <DollarSign size={18} />, color: 'text-[#32d74b]', bg: 'bg-[#32d74b]/15' },
              { label: 'Active Stays', value: kpis?.active_stays ?? '—', icon: <Hotel size={18} />, color: 'text-blue-400', bg: 'bg-blue-500/15' },
              { label: 'Liability', value: kpis ? `$${Number(kpis.point_liability_currency).toLocaleString()}` : '—', icon: <AlertTriangle size={18} />, color: 'text-amber-400', bg: 'bg-amber-500/15' },
              { label: 'Redemption Rate', value: `${kpis?.redemption_rate ?? 0}%`, icon: <Zap size={18} />, color: 'text-purple-400', bg: 'bg-purple-500/15' },
            ].map(m => (
              <div key={m.label} className="bg-dark-surface rounded-xl border border-dark-border p-5">
                <div className={`inline-flex p-2 rounded-lg ${m.bg} ${m.color} mb-3`}>{m.icon}</div>
                <p className="text-2xl font-bold text-white">{m.value}</p>
                <p className="text-xs text-[#8e8e93] mt-0.5">{m.label}</p>
              </div>
            ))}
          </div>

          {/* Booking Trends with filter */}
          <Card>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-base font-semibold text-white">Booking Trends</h3>
                <p className="text-xs text-[#636366] mt-0.5">Daily bookings and revenue</p>
              </div>
              <div className="flex gap-1 bg-dark-surface2 rounded-lg p-1">
                {BOOKING_RANGES.map(r => (
                  <button
                    key={r.days}
                    onClick={() => setBookingDays(r.days)}
                    className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
                      bookingDays === r.days ? 'bg-primary-600 text-white shadow-sm' : 'text-[#8e8e93] hover:text-white'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={bookingTrends ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2c" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#8e8e93' }} tickFormatter={(v) => v?.slice(5) ?? v} />
                <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#8e8e93' }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#8e8e93' }} tickFormatter={(v) => `$${v >= 1000 ? (v/1000).toFixed(0) + 'k' : v}`} />
                <Tooltip contentStyle={CHART_TOOLTIP} labelStyle={CHART_LABEL} formatter={(v: any, name: any) => [String(name).includes('Revenue') ? `$${Number(v).toLocaleString()}` : v, name]} />
                <Legend />
                <Bar yAxisId="left" dataKey="bookings" fill="#6366f1" radius={[3, 3, 0, 0]} name="Bookings" />
                <Line yAxisId="right" type="monotone" dataKey="revenue" stroke="#32d74b" strokeWidth={2} dot={false} name="Revenue" />
              </ComposedChart>
            </ResponsiveContainer>
          </Card>

          {/* Revenue Trend + Revenue by Room Type */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Card>
              <h3 className="text-base font-semibold text-white mb-5 flex items-center gap-2">
                <TrendingUp size={16} className="text-[#32d74b]" />
                Monthly Revenue Trend
              </h3>
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={revenueTrend ?? []}>
                  <defs>
                    <linearGradient id="gRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#32d74b" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#32d74b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2c" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#8e8e93' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#8e8e93' }} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={CHART_TOOLTIP} labelStyle={CHART_LABEL} formatter={(v: any) => `$${Number(v).toLocaleString()}`} />
                  <Area type="monotone" dataKey="revenue" stroke="#32d74b" strokeWidth={2} fill="url(#gRevenue)" name="Revenue" />
                </AreaChart>
              </ResponsiveContainer>
            </Card>

            <Card>
              <h3 className="text-base font-semibold text-white mb-5 flex items-center gap-2">
                <Hotel size={16} className="text-purple-400" />
                Revenue by Room Type
              </h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={revenue ?? []} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2c" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#8e8e93' }} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                  <YAxis dataKey="room_type" type="category" tick={{ fontSize: 11, fill: '#8e8e93' }} width={85} />
                  <Tooltip contentStyle={CHART_TOOLTIP} labelStyle={CHART_LABEL} formatter={(v: any) => `$${Number(v).toLocaleString()}`} />
                  <Bar dataKey="revenue" fill="#8b5cf6" radius={[0, 4, 4, 0]} name="Revenue" />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>

          {/* Booking Metrics (avg nights, avg spend) */}
          <Card>
            <h3 className="text-base font-semibold text-white mb-5 flex items-center gap-2">
              <Clock size={16} className="text-blue-400" />
              Booking Metrics Over Time
            </h3>
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={bookingMetrics ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2c" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#8e8e93' }} />
                <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#8e8e93' }} label={{ value: 'Nights', angle: -90, position: 'insideLeft', style: { fill: '#636366', fontSize: 11 } }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#8e8e93' }} tickFormatter={(v) => `$${v}`} label={{ value: 'Avg Spend', angle: 90, position: 'insideRight', style: { fill: '#636366', fontSize: 11 } }} />
                <Tooltip contentStyle={CHART_TOOLTIP} labelStyle={CHART_LABEL} formatter={(v: any, name: any) => [String(name).includes('Spend') ? `$${Number(v).toLocaleString()}` : v, name]} />
                <Legend />
                <Bar yAxisId="left" dataKey="avg_nights" fill="#6366f1" opacity={0.7} radius={[3, 3, 0, 0]} name="Avg Nights" />
                <Line yAxisId="right" type="monotone" dataKey="avg_spend" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 3, fill: '#f59e0b' }} name="Avg Spend" />
                <Line yAxisId="left" type="monotone" dataKey="bookings" stroke="#32d74b" strokeWidth={2} dot={false} name="Bookings" />
              </ComposedChart>
            </ResponsiveContainer>
          </Card>
        </>
      )}
    </div>
  )
}
