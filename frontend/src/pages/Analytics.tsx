import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ComposedChart, Line, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis
} from 'recharts'
import { api } from '../lib/api'
import { triggerExport } from '../lib/crmSettings'
import { Card } from '../components/ui/Card'
import {
  Users, Award, TrendingUp, DollarSign, Download, Activity,
  ArrowUpRight, ArrowDownRight, Clock, Target, PieChart as PieIcon,
  BarChart3, Zap, Hotel, AlertTriangle, Briefcase, MapPin, Globe, UserCheck
} from 'lucide-react'

const TIER_COLORS = ['#CD7F32', '#C0C0C0', '#FFD700', '#6B6B6B', '#00BCD4']
const CHART_TOOLTIP = { backgroundColor: '#1a1a2e', border: '1px solid #2e2e50', borderRadius: 10, color: '#fff' }
const CHART_LABEL = { color: '#8e8e93' }
const PIE_COLORS = ['#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#32d74b', '#636366', '#06b6d4', '#ef4444']

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

const CRM_PERIOD_OPTIONS = [
  { label: '2 Weeks', value: 'days14' },
  { label: '6 Weeks', value: 'weeks6' },
  { label: '6 Months', value: 'months6' },
  { label: '12 Months', value: 'months12' },
]

type ActiveTab = 'overview' | 'points' | 'members' | 'bookings' | 'pipeline' | 'venues'

export function Analytics() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview')
  const [pointsDays, setPointsDays] = useState(30)
  const [bookingDays, setBookingDays] = useState(30)
  const [growthMonths, setGrowthMonths] = useState(12)
  const [crmPeriod, setCrmPeriod] = useState('months6')

  // Loyalty queries
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

  // CRM queries
  const { data: crmTrends } = useQuery({
    queryKey: ['analytics-crm-trends', crmPeriod],
    queryFn: () => api.get(`/v1/admin/analytics/crm-trends?period=${crmPeriod}`).then(r => r.data),
    enabled: activeTab === 'pipeline' || activeTab === 'overview',
  })

  const { data: inquiryPipeline } = useQuery({
    queryKey: ['analytics-inquiry-pipeline'],
    queryFn: () => api.get('/v1/admin/analytics/inquiry-pipeline').then(r => r.data),
    enabled: activeTab === 'pipeline' || activeTab === 'overview',
  })

  const { data: bookingChannels } = useQuery({
    queryKey: ['analytics-booking-channels'],
    queryFn: () => api.get('/v1/admin/analytics/booking-channels').then(r => r.data),
    enabled: activeTab === 'pipeline',
  })

  const { data: revenueComparison } = useQuery({
    queryKey: ['analytics-revenue-comparison'],
    queryFn: () => api.get('/v1/admin/analytics/revenue-comparison').then(r => r.data),
    enabled: activeTab === 'pipeline',
  })

  const { data: occupancy } = useQuery({
    queryKey: ['analytics-occupancy', crmPeriod],
    queryFn: () => api.get(`/v1/admin/analytics/occupancy?period=${crmPeriod}`).then(r => r.data),
    enabled: activeTab === 'venues',
  })

  const { data: vipDist } = useQuery({
    queryKey: ['analytics-vip-dist'],
    queryFn: () => api.get('/v1/admin/analytics/vip-distribution').then(r => r.data),
    enabled: activeTab === 'venues',
  })

  const { data: nationality } = useQuery({
    queryKey: ['analytics-nationality'],
    queryFn: () => api.get('/v1/admin/analytics/nationality').then(r => r.data),
    enabled: activeTab === 'venues',
  })

  const { data: venueUtil } = useQuery({
    queryKey: ['analytics-venue-util'],
    queryFn: () => api.get('/v1/admin/analytics/venue-utilization').then(r => r.data),
    enabled: activeTab === 'venues',
  })

  const { data: revByProperty } = useQuery({
    queryKey: ['analytics-rev-by-property'],
    queryFn: () => api.get('/v1/admin/analytics/revenue-by-property').then(r => r.data),
    enabled: activeTab === 'venues' || activeTab === 'pipeline',
  })

  const kpis = overview?.kpis
  const tierDist = overview?.tier_distribution ?? []

  const tabs: { id: ActiveTab; label: string; icon: any }[] = [
    { id: 'overview', label: 'Overview', icon: <BarChart3 size={15} /> },
    { id: 'points', label: 'Points & Rewards', icon: <Award size={15} /> },
    { id: 'members', label: 'Members', icon: <Users size={15} /> },
    { id: 'bookings', label: 'Bookings & Revenue', icon: <Hotel size={15} /> },
    { id: 'pipeline', label: 'CRM Pipeline', icon: <Briefcase size={15} /> },
    { id: 'venues', label: 'Venues & Guests', icon: <MapPin size={15} /> },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Analytics</h1>
          <p className="text-sm text-t-secondary mt-1">Deep dive into loyalty & CRM performance</p>
        </div>
        <button
          onClick={() => triggerExport('/v1/admin/analytics/export')}
          className="flex items-center gap-2 bg-dark-surface border border-dark-border text-[#e0e0e0] px-4 py-2 rounded-lg text-sm font-semibold hover:bg-dark-surface2 transition-colors"
        >
          <Download size={15} /> Export Report
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 bg-dark-surface rounded-xl p-1 border border-dark-border overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all flex-1 justify-center whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/20'
                : 'text-t-secondary hover:text-white hover:bg-dark-surface2'
            }`}
          >
            {tab.icon}
            <span className="hidden md:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ════════════════ OVERVIEW TAB ════════════════ */}
      {activeTab === 'overview' && (
        <>
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
                <p className="text-xs text-t-secondary mt-0.5">{m.label}</p>
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
                  <button key={r.days} onClick={() => setPointsDays(r.days)}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${pointsDays === r.days ? 'bg-primary-600 text-white shadow-sm' : 'text-t-secondary hover:text-white'}`}>
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
                <PieIcon size={16} className="text-primary-400" /> Tier Distribution
              </h3>
              <div className="flex gap-6 items-center">
                <ResponsiveContainer width="55%" height={220}>
                  <PieChart>
                    <Pie data={tierDist} dataKey="count" cx="50%" cy="50%" innerRadius={55} outerRadius={90}>
                      {tierDist.map((_: any, i: number) => <Cell key={i} fill={TIER_COLORS[i % TIER_COLORS.length]} />)}
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
                            <span className="text-xs text-t-secondary">{t.count} ({pct}%)</span>
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
                <Hotel size={16} className="text-purple-400" /> Revenue by Room Type
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
                <Activity size={16} className="text-amber-400" /> Member Growth
              </h3>
              <div className="flex gap-1 bg-dark-surface2 rounded-lg p-1">
                {GROWTH_RANGES.map(r => (
                  <button key={r.months} onClick={() => setGrowthMonths(r.months)}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${growthMonths === r.months ? 'bg-primary-600 text-white shadow-sm' : 'text-t-secondary hover:text-white'}`}>
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

          {/* Top Members Table */}
          <Card>
            <h3 className="text-base font-semibold text-white mb-4">Top Members by Lifetime Points</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-t-secondary text-xs uppercase tracking-wide border-b border-dark-border">
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
                <p className="text-xs text-t-secondary mt-0.5">{m.label}</p>
              </div>
            ))}
          </div>

          <Card>
            <div className="flex items-center justify-between mb-5">
              <div><h3 className="text-base font-semibold text-white">Points Flow</h3><p className="text-xs text-[#636366] mt-0.5">Earned vs redeemed over time</p></div>
              <div className="flex gap-1 bg-dark-surface2 rounded-lg p-1">
                {POINTS_RANGES.map(r => (
                  <button key={r.days} onClick={() => setPointsDays(r.days)}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${pointsDays === r.days ? 'bg-primary-600 text-white shadow-sm' : 'text-t-secondary hover:text-white'}`}>
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={pointsData ?? []}>
                <defs>
                  <linearGradient id="gEarned2" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#c9a84c" stopOpacity={0.25} /><stop offset="95%" stopColor="#c9a84c" stopOpacity={0} /></linearGradient>
                  <linearGradient id="gRedeemed2" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#32d74b" stopOpacity={0.25} /><stop offset="95%" stopColor="#32d74b" stopOpacity={0} /></linearGradient>
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

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Card>
              <h3 className="text-base font-semibold text-white mb-5 flex items-center gap-2"><Zap size={16} className="text-purple-400" /> Redemption Rate Trend</h3>
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
              <h3 className="text-base font-semibold text-white mb-5 flex items-center gap-2"><Target size={16} className="text-amber-400" /> Points Balance Distribution</h3>
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

          <Card>
            <h3 className="text-base font-semibold text-white mb-2 flex items-center gap-2"><AlertTriangle size={16} className="text-amber-400" /> Points Expiry Forecast</h3>
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

          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="bg-dark-surface rounded-xl border border-dark-border p-5">
              <p className="text-xs text-t-secondary mb-1">Outstanding Points</p>
              <p className="text-2xl font-bold text-amber-400">{(kpis?.total_outstanding_points ?? 0).toLocaleString()}</p>
            </div>
            <div className="bg-dark-surface rounded-xl border border-dark-border p-5">
              <p className="text-xs text-t-secondary mb-1">Estimated Liability</p>
              <p className="text-2xl font-bold text-purple-400">${(kpis?.point_liability_currency ?? 0).toLocaleString()}</p>
            </div>
            <div className="bg-dark-surface rounded-xl border border-dark-border p-5">
              <p className="text-xs text-t-secondary mb-1">Avg Points / Member</p>
              <p className="text-2xl font-bold text-blue-400">{(kpis?.avg_points_per_member ?? 0).toLocaleString()}</p>
            </div>
            <div className="bg-dark-surface rounded-xl border border-dark-border p-5">
              <p className="text-xs text-t-secondary mb-1">Engaged Members (30d)</p>
              <p className="text-2xl font-bold text-[#32d74b]">{(kpis?.engaged_members_30d ?? 0).toLocaleString()}</p>
            </div>
          </div>
        </>
      )}

      {/* ════════════════ MEMBERS TAB ════════════════ */}
      {activeTab === 'members' && (
        <>
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
                <p className="text-xs text-t-secondary mt-0.5">{m.label}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Card>
              <h3 className="text-base font-semibold text-white mb-5 flex items-center gap-2"><Activity size={16} className="text-[#32d74b]" /> Member Engagement</h3>
              <div className="flex gap-6 items-center">
                <ResponsiveContainer width="45%" height={220}>
                  <PieChart>
                    <Pie data={engagement ?? []} dataKey="count" nameKey="segment" cx="50%" cy="50%" innerRadius={50} outerRadius={85}>
                      {(engagement ?? []).map((e: any, i: number) => <Cell key={i} fill={e.color} />)}
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
                            <span className="text-xs text-t-secondary">{e.count} ({pct}%)</span>
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
              <h3 className="text-base font-semibold text-white mb-5 flex items-center gap-2"><PieIcon size={16} className="text-primary-400" /> Tier Distribution</h3>
              <div className="flex gap-6 items-center">
                <ResponsiveContainer width="55%" height={220}>
                  <PieChart>
                    <Pie data={tierDist} dataKey="count" cx="50%" cy="50%" innerRadius={55} outerRadius={90}>
                      {tierDist.map((_: any, i: number) => <Cell key={i} fill={TIER_COLORS[i % TIER_COLORS.length]} />)}
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
                            <span className="text-xs text-t-secondary">{t.count} ({pct}%)</span>
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

          <Card>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold text-white flex items-center gap-2"><TrendingUp size={16} className="text-amber-400" /> Member Growth</h3>
              <div className="flex gap-1 bg-dark-surface2 rounded-lg p-1">
                {GROWTH_RANGES.map(r => (
                  <button key={r.months} onClick={() => setGrowthMonths(r.months)}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${growthMonths === r.months ? 'bg-primary-600 text-white shadow-sm' : 'text-t-secondary hover:text-white'}`}>
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

          <Card>
            <h3 className="text-base font-semibold text-white mb-5 flex items-center gap-2"><Target size={16} className="text-blue-400" /> Member Points Balance Distribution</h3>
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
                <p className="text-xs text-t-secondary mt-0.5">{m.label}</p>
              </div>
            ))}
          </div>

          <Card>
            <div className="flex items-center justify-between mb-5">
              <div><h3 className="text-base font-semibold text-white">Booking Trends</h3><p className="text-xs text-[#636366] mt-0.5">Daily bookings and revenue</p></div>
              <div className="flex gap-1 bg-dark-surface2 rounded-lg p-1">
                {BOOKING_RANGES.map(r => (
                  <button key={r.days} onClick={() => setBookingDays(r.days)}
                    className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all ${bookingDays === r.days ? 'bg-primary-600 text-white shadow-sm' : 'text-t-secondary hover:text-white'}`}>
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

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Card>
              <h3 className="text-base font-semibold text-white mb-5 flex items-center gap-2"><TrendingUp size={16} className="text-[#32d74b]" /> Monthly Revenue Trend</h3>
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={revenueTrend ?? []}>
                  <defs>
                    <linearGradient id="gRevenue" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#32d74b" stopOpacity={0.25} /><stop offset="95%" stopColor="#32d74b" stopOpacity={0} /></linearGradient>
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
              <h3 className="text-base font-semibold text-white mb-5 flex items-center gap-2"><Hotel size={16} className="text-purple-400" /> Revenue by Room Type</h3>
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

          <Card>
            <h3 className="text-base font-semibold text-white mb-5 flex items-center gap-2"><Clock size={16} className="text-blue-400" /> Booking Metrics Over Time</h3>
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={bookingMetrics ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2c" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#8e8e93' }} />
                <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#8e8e93' }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#8e8e93' }} tickFormatter={(v) => `$${v}`} />
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

      {/* ════════════════ CRM PIPELINE TAB ════════════════ */}
      {activeTab === 'pipeline' && (
        <>
          {/* MoM Comparison Cards */}
          {revenueComparison && (
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              {[
                { label: 'Revenue', curr: revenueComparison.current.total_revenue, pct: revenueComparison.changes.revenue_pct, fmt: (v: number) => `$${Number(v).toLocaleString()}` },
                { label: 'Bookings', curr: revenueComparison.current.total_bookings, pct: revenueComparison.changes.bookings_pct, fmt: (v: number) => v.toLocaleString() },
                { label: 'Avg Rate', curr: revenueComparison.current.avg_rate, pct: revenueComparison.changes.rate_pct, fmt: (v: number) => `$${Number(v).toFixed(0)}` },
                { label: 'New Guests', curr: revenueComparison.current.new_guests, pct: revenueComparison.changes.guests_pct, fmt: (v: number) => v.toLocaleString() },
              ].map(item => (
                <div key={item.label} className="bg-dark-surface rounded-xl border border-dark-border p-5">
                  <p className="text-xs text-t-secondary mb-2">{item.label}</p>
                  <p className="text-2xl font-bold text-white">{item.fmt(item.curr)}</p>
                  <div className={`flex items-center gap-1 text-xs mt-1 ${item.pct >= 0 ? 'text-[#32d74b]' : 'text-[#ff375f]'}`}>
                    {item.pct >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                    <span>{Math.abs(item.pct)}% vs last month</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Performance Trends */}
          <Card>
            <div className="flex items-center justify-between mb-5">
              <div><h3 className="text-base font-semibold text-white">Performance Trends</h3><p className="text-xs text-[#636366] mt-0.5">Guests, inquiries, and conversions over time</p></div>
              <div className="flex gap-1 bg-dark-surface2 rounded-lg p-1">
                {CRM_PERIOD_OPTIONS.map(p => (
                  <button key={p.value} onClick={() => setCrmPeriod(p.value)}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${crmPeriod === p.value ? 'bg-primary-600 text-white shadow-sm' : 'text-t-secondary hover:text-white'}`}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={crmTrends ?? []}>
                <defs>
                  <linearGradient id="gGuests" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} /><stop offset="95%" stopColor="#3b82f6" stopOpacity={0} /></linearGradient>
                  <linearGradient id="gInq" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25} /><stop offset="95%" stopColor="#f59e0b" stopOpacity={0} /></linearGradient>
                  <linearGradient id="gConf" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#32d74b" stopOpacity={0.25} /><stop offset="95%" stopColor="#32d74b" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2c" />
                <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#8e8e93' }} />
                <YAxis tick={{ fontSize: 11, fill: '#8e8e93' }} />
                <Tooltip contentStyle={CHART_TOOLTIP} labelStyle={CHART_LABEL} />
                <Legend />
                <Area type="monotone" dataKey="new_guests" stroke="#3b82f6" strokeWidth={2} fill="url(#gGuests)" name="New Guests" />
                <Area type="monotone" dataKey="new_inquiries" stroke="#f59e0b" strokeWidth={2} fill="url(#gInq)" name="Inquiries" />
                <Area type="monotone" dataKey="confirmed_inquiries" stroke="#32d74b" strokeWidth={2} fill="url(#gConf)" name="Confirmed" />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          {/* Inquiry Pipeline + Booking Channels */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Card>
              <h3 className="text-base font-semibold text-white mb-5 flex items-center gap-2"><Briefcase size={16} className="text-blue-400" /> Inquiry Pipeline</h3>
              <div className="flex gap-6 items-center">
                <ResponsiveContainer width="45%" height={220}>
                  <PieChart>
                    <Pie data={inquiryPipeline ?? []} dataKey="count" nameKey="status" cx="50%" cy="50%" innerRadius={50} outerRadius={85}>
                      {(inquiryPipeline ?? []).map((_: any, i: number) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={CHART_TOOLTIP} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {(inquiryPipeline ?? []).map((s: any, i: number) => (
                    <div key={s.status} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="text-xs text-[#e0e0e0] flex-1">{s.status}</span>
                      <span className="text-xs font-semibold text-white">{s.count}</span>
                      <span className="text-xs text-[#636366] w-16 text-right">${Number(s.value).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            <Card>
              <h3 className="text-base font-semibold text-white mb-5 flex items-center gap-2"><BarChart3 size={16} className="text-[#32d74b]" /> Booking Channels</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={bookingChannels ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2c" />
                  <XAxis dataKey="channel" tick={{ fontSize: 11, fill: '#8e8e93' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#8e8e93' }} />
                  <Tooltip contentStyle={CHART_TOOLTIP} labelStyle={CHART_LABEL} formatter={(v: any, name: any) => [name === 'revenue' ? `$${Number(v).toLocaleString()}` : v, name === 'revenue' ? 'Revenue' : 'Bookings']} />
                  <Legend />
                  <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} name="Bookings" />
                  <Bar dataKey="revenue" fill="#32d74b" radius={[4, 4, 0, 0]} name="Revenue" />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>

          {/* Revenue by Property */}
          <Card>
            <h3 className="text-base font-semibold text-white mb-5 flex items-center gap-2"><Hotel size={16} className="text-purple-400" /> Revenue by Property</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-t-secondary text-xs uppercase tracking-wide border-b border-dark-border">
                    <th className="pb-3 font-semibold">Property</th>
                    <th className="pb-3 font-semibold text-right">Bookings</th>
                    <th className="pb-3 font-semibold text-right">Revenue</th>
                    <th className="pb-3 font-semibold text-right">Avg Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-border">
                  {(revByProperty ?? []).map((p: any, i: number) => (
                    <tr key={i} className="hover:bg-dark-surface2 transition-colors">
                      <td className="py-3">
                        <p className="font-semibold text-white">{p.name}</p>
                        <p className="text-xs text-[#636366]">{p.code}</p>
                      </td>
                      <td className="py-3 text-right text-[#a0a0a0]">{p.bookings}</td>
                      <td className="py-3 text-right font-semibold text-white">${Number(p.revenue).toLocaleString()}</td>
                      <td className="py-3 text-right text-[#a0a0a0]">${Number(p.avg_rate).toFixed(0)}</td>
                    </tr>
                  ))}
                  {(revByProperty ?? []).length === 0 && (
                    <tr><td colSpan={4} className="py-6 text-center text-[#636366]">No property data available</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {/* ════════════════ VENUES & GUESTS TAB ════════════════ */}
      {activeTab === 'venues' && (
        <>
          {/* Venue Utilization + Revenue */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Card>
              <h3 className="text-base font-semibold text-white mb-5 flex items-center gap-2"><MapPin size={16} className="text-[#32d74b]" /> Venue Utilization by Type</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={venueUtil ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2c" />
                  <XAxis dataKey="venue_type" tick={{ fontSize: 11, fill: '#8e8e93' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#8e8e93' }} />
                  <Tooltip contentStyle={CHART_TOOLTIP} labelStyle={CHART_LABEL} />
                  <Legend />
                  <Bar dataKey="bookings" fill="#6366f1" radius={[4, 4, 0, 0]} name="Bookings" />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card>
              <h3 className="text-base font-semibold text-white mb-5 flex items-center gap-2"><DollarSign size={16} className="text-amber-400" /> Venue Revenue Split</h3>
              <div className="flex gap-6 items-center">
                <ResponsiveContainer width="45%" height={220}>
                  <PieChart>
                    <Pie data={venueUtil ?? []} dataKey="revenue" nameKey="venue_type" cx="50%" cy="50%" innerRadius={50} outerRadius={85}>
                      {(venueUtil ?? []).map((_: any, i: number) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={CHART_TOOLTIP} formatter={(v: any) => `$${Number(v).toLocaleString()}`} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {(venueUtil ?? []).map((v: any, i: number) => (
                    <div key={v.venue_type} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="text-xs text-[#e0e0e0] flex-1 capitalize">{v.venue_type}</span>
                      <span className="text-xs text-[#636366]">${Number(v.revenue).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>

          {/* Occupancy Trend */}
          <Card>
            <div className="flex items-center justify-between mb-5">
              <div><h3 className="text-base font-semibold text-white">Occupancy Rate</h3><p className="text-xs text-[#636366] mt-0.5">Property occupancy over time</p></div>
              <div className="flex gap-1 bg-dark-surface2 rounded-lg p-1">
                {CRM_PERIOD_OPTIONS.map(p => (
                  <button key={p.value} onClick={() => setCrmPeriod(p.value)}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${crmPeriod === p.value ? 'bg-primary-600 text-white shadow-sm' : 'text-t-secondary hover:text-white'}`}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={occupancy ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2c" />
                <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#8e8e93' }} />
                <YAxis tick={{ fontSize: 11, fill: '#8e8e93' }} tickFormatter={(v) => `${v}%`} />
                <Tooltip contentStyle={CHART_TOOLTIP} labelStyle={CHART_LABEL} formatter={(v: any, name: any) => [name === 'occupancy_rate' ? `${v}%` : Number(v).toLocaleString(), name === 'occupancy_rate' ? 'Occupancy %' : name]} />
                <Bar dataKey="occupancy_rate" fill="#6366f1" radius={[4, 4, 0, 0]} name="Occupancy %" opacity={0.7} />
                <Line type="monotone" dataKey="occupancy_rate" stroke="#c9a84c" strokeWidth={2.5} dot={{ r: 3, fill: '#c9a84c' }} name="Trend" />
              </ComposedChart>
            </ResponsiveContainer>
          </Card>

          {/* VIP Distribution + Nationalities */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Card>
              <h3 className="text-base font-semibold text-white mb-5 flex items-center gap-2"><UserCheck size={16} className="text-amber-400" /> VIP Level Distribution</h3>
              <div className="flex gap-6 items-center">
                <ResponsiveContainer width="45%" height={220}>
                  <PieChart>
                    <Pie data={vipDist ?? []} dataKey="count" nameKey="level" cx="50%" cy="50%" innerRadius={50} outerRadius={85}>
                      {(vipDist ?? []).map((_: any, i: number) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={CHART_TOOLTIP} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {(vipDist ?? []).map((v: any, i: number) => (
                    <div key={v.level} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="text-xs text-[#e0e0e0] flex-1">{v.level}</span>
                      <span className="text-xs font-semibold text-white">{v.count}</span>
                      <span className="text-xs text-[#636366]">${Number(v.revenue).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            <Card>
              <h3 className="text-base font-semibold text-white mb-5 flex items-center gap-2"><Globe size={16} className="text-blue-400" /> Guest Nationalities</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={(nationality ?? []).slice(0, 10)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2c" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#8e8e93' }} />
                  <YAxis dataKey="nationality" type="category" tick={{ fontSize: 11, fill: '#8e8e93' }} width={80} />
                  <Tooltip contentStyle={CHART_TOOLTIP} labelStyle={CHART_LABEL} />
                  <Bar dataKey="count" fill="#06b6d4" radius={[0, 4, 4, 0]} name="Guests" />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>

          {/* VIP Revenue Radar */}
          {(vipDist ?? []).length > 0 && (
            <Card>
              <h3 className="text-base font-semibold text-white mb-5 flex items-center gap-2"><Award size={16} className="text-purple-400" /> VIP Revenue Impact</h3>
              <ResponsiveContainer width="100%" height={300}>
                <RadarChart data={vipDist ?? []}>
                  <PolarGrid stroke="#2c2c2c" />
                  <PolarAngleAxis dataKey="level" tick={{ fontSize: 11, fill: '#8e8e93' }} />
                  <PolarRadiusAxis tick={{ fontSize: 10, fill: '#636366' }} />
                  <Tooltip contentStyle={CHART_TOOLTIP} />
                  <Radar name="Revenue" dataKey="revenue" stroke="#c9a84c" fill="#c9a84c" fillOpacity={0.2} />
                  <Radar name="Guests" dataKey="count" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} />
                  <Legend />
                </RadarChart>
              </ResponsiveContainer>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
