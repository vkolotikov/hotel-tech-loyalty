import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Users, TrendingUp, Award, DollarSign, Sparkles, RefreshCw, Scan, Bell, Gift, Activity,
  ArrowUpRight, ArrowDownRight, Calendar, Hotel, CreditCard, ChevronRight
} from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { Card, StatCard } from '../components/ui/Card'
import { TierBadge } from '../components/ui/TierBadge'
import { format } from 'date-fns'

const TIER_COLORS = ['#CD7F32', '#C0C0C0', '#FFD700', '#E5E4E2', '#B9F2FF']
const CHART_TOOLTIP = { backgroundColor: '#1a1a2e', border: '1px solid #2e2e50', borderRadius: 10, color: '#fff' }
const CHART_LABEL = { color: '#8e8e93' }

const POINTS_RANGES = [
  { label: '7d', days: 7 },
  { label: '14d', days: 14 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
]

export function Dashboard() {
  const navigate = useNavigate()
  const [pointsDays, setPointsDays] = useState(30)

  const { data: kpis } = useQuery({
    queryKey: ['dashboard-kpis'],
    queryFn: () => api.get('/v1/admin/dashboard/kpis').then(r => r.data),
  })

  const { data: pointsChart } = useQuery({
    queryKey: ['points-chart', pointsDays],
    queryFn: () => api.get(`/v1/admin/dashboard/points-chart?days=${pointsDays}`).then(r => r.data),
  })

  const { data: memberGrowth } = useQuery({
    queryKey: ['member-growth'],
    queryFn: () => api.get('/v1/admin/dashboard/member-growth').then(r => r.data),
  })

  const { data: topMembers } = useQuery({
    queryKey: ['top-members'],
    queryFn: () => api.get('/v1/admin/dashboard/top-members').then(r => r.data),
  })

  const { data: weekComp } = useQuery({
    queryKey: ['week-comparison'],
    queryFn: () => api.get('/v1/admin/dashboard/week-comparison').then(r => r.data),
  })

  const { data: bookingTrends } = useQuery({
    queryKey: ['dashboard-booking-trends'],
    queryFn: () => api.get('/v1/admin/dashboard/booking-trends?days=14').then(r => r.data),
  })

  const { data: aiInsights, refetch: refetchAi, isFetching: aiLoading } = useQuery({
    queryKey: ['ai-insights'],
    queryFn: () => api.get('/v1/admin/dashboard/ai-insights').then(r => r.data),
    enabled: false,
  })

  const newMembersChange = kpis && kpis.new_members_last_month > 0
    ? Math.round(((kpis.new_members_this_month - kpis.new_members_last_month) / kpis.new_members_last_month) * 100)
    : 0

  const glanceItems = [
    { label: 'New Members', value: kpis?.new_members_today ?? 0, icon: <Users size={20} />, route: '/members' },
    { label: 'Points Awarded', value: (kpis?.points_issued_today ?? 0).toLocaleString(), icon: <Award size={20} /> },
    { label: 'Points Redeemed', value: (kpis?.points_redeemed_today ?? 0).toLocaleString(), icon: <Gift size={20} /> },
    { label: 'Active Stays', value: kpis?.active_stays ?? 0, icon: <Hotel size={20} /> },
  ]

  // Week comparison helpers
  const wk = weekComp?.week
  const lwk = weekComp?.last_week
  const weekChange = (curr: number, prev: number) => {
    if (!prev) return curr > 0 ? 100 : 0
    return Math.round(((curr - prev) / prev) * 100)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-[#8e8e93] text-sm mt-1 flex items-center gap-1.5">
            <Calendar size={13} />
            {format(new Date(), "EEEE, MMMM d, yyyy")}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigate('/scan')}
            className="flex items-center gap-2 bg-dark-surface border border-dark-border text-[#e0e0e0] px-4 py-2 rounded-lg text-sm font-semibold hover:bg-dark-surface2 transition-colors"
          >
            <Scan size={15} /> Scan Card
          </button>
          <button
            onClick={() => navigate('/notifications')}
            className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-primary-700 transition-colors"
          >
            <Bell size={15} /> Send Campaign
          </button>
        </div>
      </div>

      {/* Today at a Glance */}
      <div className="bg-gradient-to-r from-primary-700 to-primary-600 rounded-2xl p-6 text-white">
        <p className="text-primary-100 text-sm font-semibold mb-3 uppercase tracking-wide">Today at a Glance</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {glanceItems.map(stat => (
            <div
              key={stat.label}
              onClick={() => (stat as any).route && navigate((stat as any).route)}
              className={`bg-white/10 rounded-xl p-3 transition-colors ${(stat as any).route ? 'hover:bg-white/15 cursor-pointer' : ''}`}
            >
              <div className="mb-1 opacity-80">{stat.icon}</div>
              <p className="text-xl font-bold">{stat.value}</p>
              <p className="text-primary-100 text-xs">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* KPI Cards with change indicators */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          title="Total Members"
          value={kpis?.total_members?.toLocaleString() ?? '—'}
          icon={<Users size={20} />}
          color="bg-blue-500"
          change={newMembersChange}
        />
        <StatCard
          title="Points Issued (Month)"
          value={kpis?.points_issued_this_month?.toLocaleString() ?? '—'}
          icon={<Award size={20} />}
          color="bg-amber-500"
        />
        <StatCard
          title="Points Redeemed (Month)"
          value={kpis?.points_redeemed_this_month?.toLocaleString() ?? '—'}
          icon={<TrendingUp size={20} />}
          color="bg-green-500"
        />
        <StatCard
          title="Revenue (Month)"
          value={kpis ? `$${Number(kpis.revenue_this_month).toLocaleString()}` : '—'}
          icon={<DollarSign size={20} />}
          color="bg-purple-500"
        />
      </div>

      {/* Week-over-Week Comparison */}
      {wk && lwk && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'New Members', curr: wk.new_members, prev: lwk.new_members },
            { label: 'Points Earned', curr: wk.points_issued, prev: lwk.points_issued },
            { label: 'Points Redeemed', curr: wk.points_redeemed, prev: lwk.points_redeemed },
            { label: 'Bookings', curr: wk.new_bookings, prev: lwk.new_bookings },
            { label: 'Revenue', curr: wk.revenue, prev: lwk.revenue, isCurrency: true },
          ].map(item => {
            const change = weekChange(item.curr, item.prev)
            const isUp = change >= 0
            return (
              <div key={item.label} className="bg-dark-surface rounded-xl border border-dark-border p-4">
                <p className="text-xs text-[#8e8e93] mb-1">{item.label}</p>
                <p className="text-lg font-bold text-white">
                  {item.isCurrency ? `$${Number(item.curr).toLocaleString()}` : Number(item.curr).toLocaleString()}
                </p>
                <div className={`flex items-center gap-1 text-xs mt-1 ${isUp ? 'text-[#32d74b]' : 'text-[#ff375f]'}`}>
                  {isUp ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                  <span>{Math.abs(change)}% vs last week</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Points Chart with filter + Tier Pie */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="xl:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-white">Points Activity</h3>
            <div className="flex gap-1 bg-dark-surface2 rounded-lg p-0.5">
              {POINTS_RANGES.map(r => (
                <button
                  key={r.days}
                  onClick={() => setPointsDays(r.days)}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
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
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={pointsChart ?? []}>
              <defs>
                <linearGradient id="earned" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#c9a84c" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#c9a84c" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="redeemed" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#32d74b" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#32d74b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2c" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#8e8e93' }} tickFormatter={(v) => v?.slice(5)} />
              <YAxis tick={{ fontSize: 11, fill: '#8e8e93' }} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
              <Tooltip contentStyle={CHART_TOOLTIP} labelStyle={CHART_LABEL} formatter={(v: any) => Number(v).toLocaleString()} />
              <Legend />
              <Area type="monotone" dataKey="earned" stroke="#c9a84c" strokeWidth={2} fill="url(#earned)" name="Earned" />
              <Area type="monotone" dataKey="redeemed" stroke="#32d74b" strokeWidth={2} fill="url(#redeemed)" name="Redeemed" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        {/* Tier Distribution */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-white">Tier Distribution</h3>
            <span className="text-xs text-[#636366]">{kpis?.total_members ?? 0} total</span>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie
                data={kpis?.tier_distribution ?? []}
                dataKey="count"
                nameKey="tier"
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={70}
              >
                {(kpis?.tier_distribution ?? []).map((_: any, i: number) => (
                  <Cell key={i} fill={TIER_COLORS[i % TIER_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={CHART_TOOLTIP} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5 mt-2">
            {(kpis?.tier_distribution ?? []).map((t: any, i: number) => {
              const total = (kpis?.tier_distribution ?? []).reduce((s: number, x: any) => s + x.count, 0)
              const pct = total > 0 ? Math.round((t.count / total) * 100) : 0
              return (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: TIER_COLORS[i % TIER_COLORS.length] }} />
                  <span className="text-xs text-[#a0a0a0] flex-1">{t.tier}</span>
                  <span className="text-xs font-medium text-white">{t.count}</span>
                  <span className="text-xs text-[#636366] w-8 text-right">{pct}%</span>
                </div>
              )
            })}
          </div>
        </Card>
      </div>

      {/* Booking Trends + Member Growth */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-semibold text-white">Booking Trends</h3>
              <p className="text-xs text-[#636366] mt-0.5">Last 14 days</p>
            </div>
            <Hotel size={18} className="text-[#636366]" />
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={bookingTrends ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2c" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#8e8e93' }} tickFormatter={(v) => v?.slice(5)} />
              <YAxis tick={{ fontSize: 11, fill: '#8e8e93' }} />
              <Tooltip
                contentStyle={CHART_TOOLTIP}
                labelStyle={CHART_LABEL}
                formatter={(v: any, name: any) => [String(name).includes('Revenue') ? `$${Number(v).toLocaleString()}` : v, name]}
              />
              <Legend />
              <Bar dataKey="bookings" fill="#6366f1" radius={[3, 3, 0, 0]} name="Bookings" />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-semibold text-white">Member Growth</h3>
              <p className="text-xs text-[#636366] mt-0.5">New signups by month</p>
            </div>
            <Activity size={18} className="text-[#636366]" />
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={memberGrowth ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2c" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#8e8e93' }} />
              <YAxis tick={{ fontSize: 11, fill: '#8e8e93' }} />
              <Tooltip contentStyle={CHART_TOOLTIP} labelStyle={CHART_LABEL} />
              <Bar dataKey="new_members" fill="#c9a84c" radius={[4, 4, 0, 0]} name="New Members" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Financial Summary + Top Members */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Financial Stats */}
        <Card>
          <h3 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
            <CreditCard size={16} className="text-primary-400" />
            Points Liability
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[#1a1a2e] rounded-xl p-4 border border-[#2e2e50]">
              <p className="text-xs text-[#8e8e93] mb-1">Outstanding Points</p>
              <p className="text-xl font-bold text-amber-400">{(kpis?.total_outstanding_points ?? 0).toLocaleString()}</p>
            </div>
            <div className="bg-[#1a1a2e] rounded-xl p-4 border border-[#2e2e50]">
              <p className="text-xs text-[#8e8e93] mb-1">Estimated Liability</p>
              <p className="text-xl font-bold text-purple-400">${(kpis?.point_liability_currency ?? 0).toLocaleString()}</p>
            </div>
            <div className="bg-[#1a1a2e] rounded-xl p-4 border border-[#2e2e50]">
              <p className="text-xs text-[#8e8e93] mb-1">Redemption Rate</p>
              <p className="text-xl font-bold text-[#32d74b]">{kpis?.redemption_rate ?? 0}%</p>
            </div>
            <div className="bg-[#1a1a2e] rounded-xl p-4 border border-[#2e2e50]">
              <p className="text-xs text-[#8e8e93] mb-1">Avg Points / Member</p>
              <p className="text-xl font-bold text-blue-400">{(kpis?.avg_points_per_member ?? 0).toLocaleString()}</p>
            </div>
          </div>
        </Card>

        {/* Top Members */}
        <Card padding={false}>
          <div className="p-6 pb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold text-white">Top Members</h3>
            <button
              onClick={() => navigate('/members')}
              className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-0.5"
            >
              View all <ChevronRight size={12} />
            </button>
          </div>
          <div className="divide-y divide-dark-border">
            {(topMembers ?? []).slice(0, 5).map((m: any, i: number) => (
              <div
                key={i}
                onClick={() => navigate(`/members/${m.id}`)}
                className="flex items-center gap-3 px-6 py-3 hover:bg-dark-surface2 cursor-pointer transition-colors"
              >
                <span className="text-sm font-bold text-[#636366] w-5">{i + 1}</span>
                <div className="w-8 h-8 rounded-full bg-primary-500/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-primary-400">{m.name?.charAt(0)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{m.name}</p>
                  <p className="text-xs text-[#636366]">{m.member_number}</p>
                </div>
                <TierBadge tier={m.tier} />
                <span className="text-sm font-semibold text-[#e0e0e0]">{m.lifetime_points?.toLocaleString()} pts</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* AI Insights */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <Sparkles size={18} className="text-primary-400" />
            AI Weekly Insights
          </h3>
          <button
            onClick={() => refetchAi()}
            disabled={aiLoading}
            className="flex items-center gap-2 text-sm text-primary-400 hover:text-primary-500 disabled:opacity-50"
          >
            <RefreshCw size={14} className={aiLoading ? 'animate-spin' : ''} />
            {aiLoading ? 'Generating...' : 'Generate Insights'}
          </button>
        </div>
        {aiInsights?.insight ? (
          <div className="prose prose-sm max-w-none text-[#a0a0a0] leading-relaxed whitespace-pre-wrap">
            {aiInsights.insight}
          </div>
        ) : (
          <p className="text-[#636366] text-sm">Click "Generate Insights" to get AI-powered analysis of this week's performance.</p>
        )}
      </Card>
    </div>
  )
}
