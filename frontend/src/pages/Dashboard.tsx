import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Users, Award, DollarSign, Sparkles, RefreshCw, Scan, Bell, Gift, Activity,
  ArrowUpRight, ArrowDownRight, Calendar, Hotel, CreditCard, ChevronRight,
  UserCheck, FileText, Briefcase, Clock, AlertCircle, CheckCircle2, Phone, Mail, MessageSquare
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

const STATUS_COLORS: Record<string, string> = {
  'New': '#3b82f6',
  'In Progress': '#f59e0b',
  'Proposal Sent': '#8b5cf6',
  'Negotiation': '#ec4899',
  'Confirmed': '#32d74b',
  'Lost': '#636366',
  'Tentative': '#06b6d4',
}

const ACTIVITY_ICONS: Record<string, any> = {
  inquiry: { icon: FileText, color: 'text-blue-400', bg: 'bg-blue-500/15' },
  reservation: { icon: Calendar, color: 'text-[#32d74b]', bg: 'bg-[#32d74b]/15' },
  email: { icon: Mail, color: 'text-purple-400', bg: 'bg-purple-500/15' },
  call: { icon: Phone, color: 'text-amber-400', bg: 'bg-amber-500/15' },
  guest: { icon: UserCheck, color: 'text-cyan-400', bg: 'bg-cyan-500/15' },
  note: { icon: MessageSquare, color: 'text-pink-400', bg: 'bg-pink-500/15' },
}

const VIP_COLORS: Record<string, string> = {
  Standard: '#636366',
  Silver: '#C0C0C0',
  Gold: '#FFD700',
  Platinum: '#6B6B6B',
  Diamond: '#00BCD4',
}

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

  // CRM queries
  const { data: arrivals } = useQuery({
    queryKey: ['dashboard-arrivals'],
    queryFn: () => api.get('/v1/admin/dashboard/arrivals-today').then(r => r.data),
  })

  const { data: departures } = useQuery({
    queryKey: ['dashboard-departures'],
    queryFn: () => api.get('/v1/admin/dashboard/departures-today').then(r => r.data),
  })

  const { data: inquiryStatus } = useQuery({
    queryKey: ['dashboard-inquiry-status'],
    queryFn: () => api.get('/v1/admin/dashboard/inquiries-by-status').then(r => r.data),
  })

  const { data: recentActivity } = useQuery({
    queryKey: ['dashboard-recent-activity'],
    queryFn: () => api.get('/v1/admin/dashboard/recent-activity').then(r => r.data),
  })

  const { data: tasksDue } = useQuery({
    queryKey: ['dashboard-tasks-due'],
    queryFn: () => api.get('/v1/admin/dashboard/tasks-due').then(r => r.data),
  })

  const newMembersChange = kpis && kpis.new_members_last_month > 0
    ? Math.round(((kpis.new_members_this_month - kpis.new_members_last_month) / kpis.new_members_last_month) * 100)
    : 0

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

      {/* Today at a Glance — Unified */}
      <div className="bg-gradient-to-r from-primary-700 to-primary-600 rounded-2xl p-6 text-white">
        <p className="text-primary-100 text-sm font-semibold mb-3 uppercase tracking-wide">Today at a Glance</p>
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
          {[
            { label: 'New Members', value: kpis?.new_members_today ?? 0, icon: <Users size={18} />, route: '/members' },
            { label: 'Points Awarded', value: (kpis?.points_issued_today ?? 0).toLocaleString(), icon: <Award size={18} /> },
            { label: 'Points Redeemed', value: (kpis?.points_redeemed_today ?? 0).toLocaleString(), icon: <Gift size={18} /> },
            { label: 'Active Stays', value: kpis?.active_stays ?? 0, icon: <Hotel size={18} /> },
            { label: 'Arrivals', value: kpis?.arrivals_today ?? 0, icon: <ArrowUpRight size={18} />, route: '/reservations' },
            { label: 'Departures', value: kpis?.departures_today ?? 0, icon: <ArrowDownRight size={18} />, route: '/reservations' },
            { label: 'In-House', value: kpis?.in_house_guests ?? 0, icon: <UserCheck size={18} /> },
            { label: 'Pipeline', value: kpis?.pipeline_value ? `$${Number(kpis.pipeline_value).toLocaleString()}` : '$0', icon: <Briefcase size={18} />, route: '/inquiries' },
          ].map(stat => (
            <div
              key={stat.label}
              onClick={() => (stat as any).route && navigate((stat as any).route)}
              className={`bg-white/10 rounded-xl p-3 transition-colors ${(stat as any).route ? 'hover:bg-white/15 cursor-pointer' : ''}`}
            >
              <div className="mb-1 opacity-80">{stat.icon}</div>
              <p className="text-lg font-bold">{stat.value}</p>
              <p className="text-primary-100 text-xs">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          title="Total Members"
          value={kpis?.total_members?.toLocaleString() ?? '—'}
          icon={<Users size={20} />}
          color="bg-blue-500"
          change={newMembersChange}
        />
        <StatCard
          title="Total Guests"
          value={kpis?.total_guests?.toLocaleString() ?? '—'}
          icon={<UserCheck size={20} />}
          color="bg-cyan-500"
        />
        <StatCard
          title="Active Inquiries"
          value={kpis?.active_inquiries?.toLocaleString() ?? '—'}
          icon={<FileText size={20} />}
          color="bg-amber-500"
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

      {/* Arrivals & Departures */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Arrivals */}
        <Card padding={false}>
          <div className="p-5 pb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <ArrowUpRight size={16} className="text-[#32d74b]" />
              Today's Arrivals
            </h3>
            <span className="text-xs text-[#636366]">{(arrivals ?? []).length} guests</span>
          </div>
          <div className="divide-y divide-dark-border">
            {(arrivals ?? []).length === 0 ? (
              <p className="px-5 py-6 text-sm text-[#636366] text-center">No arrivals today</p>
            ) : (arrivals ?? []).slice(0, 5).map((a: any) => (
              <div key={a.id} className="flex items-center gap-3 px-5 py-3 hover:bg-dark-surface2 transition-colors">
                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
                  style={{ backgroundColor: (VIP_COLORS[a.vip_level] || '#636366') + '20', color: VIP_COLORS[a.vip_level] || '#636366' }}>
                  {a.guest_name?.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{a.guest_name}</p>
                  <p className="text-xs text-[#636366]">{a.room_type} · {a.property}</p>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{ backgroundColor: (VIP_COLORS[a.vip_level] || '#636366') + '20', color: VIP_COLORS[a.vip_level] || '#636366' }}>
                  {a.vip_level}
                </span>
              </div>
            ))}
          </div>
        </Card>

        {/* Departures */}
        <Card padding={false}>
          <div className="p-5 pb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <ArrowDownRight size={16} className="text-[#ff375f]" />
              Today's Departures
            </h3>
            <span className="text-xs text-[#636366]">{(departures ?? []).length} guests</span>
          </div>
          <div className="divide-y divide-dark-border">
            {(departures ?? []).length === 0 ? (
              <p className="px-5 py-6 text-sm text-[#636366] text-center">No departures today</p>
            ) : (departures ?? []).slice(0, 5).map((d: any) => (
              <div key={d.id} className="flex items-center gap-3 px-5 py-3 hover:bg-dark-surface2 transition-colors">
                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
                  style={{ backgroundColor: (VIP_COLORS[d.vip_level] || '#636366') + '20', color: VIP_COLORS[d.vip_level] || '#636366' }}>
                  {d.guest_name?.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{d.guest_name}</p>
                  <p className="text-xs text-[#636366]">{d.room_type} · {d.property}</p>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{ backgroundColor: (VIP_COLORS[d.vip_level] || '#636366') + '20', color: VIP_COLORS[d.vip_level] || '#636366' }}>
                  {d.vip_level}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Points Chart + Tier Pie */}
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

      {/* Inquiry Pipeline + Tasks Due */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Inquiry Pipeline */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <Briefcase size={16} className="text-blue-400" />
              Inquiry Pipeline
            </h3>
            <button onClick={() => navigate('/inquiries')} className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-0.5">
              View all <ChevronRight size={12} />
            </button>
          </div>
          <div className="space-y-2.5">
            {(inquiryStatus ?? []).length === 0 ? (
              <p className="text-sm text-[#636366] text-center py-4">No inquiries</p>
            ) : (inquiryStatus ?? []).map((s: any) => {
              const maxCount = Math.max(...(inquiryStatus ?? []).map((x: any) => x.count), 1)
              const barWidth = Math.max((s.count / maxCount) * 100, 8)
              return (
                <div key={s.status} className="flex items-center gap-3">
                  <span className="text-xs text-[#a0a0a0] w-28 truncate">{s.status}</span>
                  <div className="flex-1 h-6 bg-dark-bg rounded-md overflow-hidden relative">
                    <div
                      className="h-full rounded-md transition-all duration-500"
                      style={{ width: `${barWidth}%`, backgroundColor: STATUS_COLORS[s.status] || '#636366' }}
                    />
                    <span className="absolute inset-y-0 left-2 flex items-center text-xs font-semibold text-white">
                      {s.count}
                    </span>
                  </div>
                  <span className="text-xs text-[#636366] w-20 text-right">${Number(s.value).toLocaleString()}</span>
                </div>
              )
            })}
          </div>
        </Card>

        {/* Tasks Due */}
        <Card padding={false}>
          <div className="p-5 pb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <Clock size={16} className="text-amber-400" />
              Tasks Due
            </h3>
            <button onClick={() => navigate('/planner')} className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-0.5">
              Planner <ChevronRight size={12} />
            </button>
          </div>
          <div className="divide-y divide-dark-border">
            {(tasksDue ?? []).length === 0 ? (
              <p className="px-5 py-6 text-sm text-[#636366] text-center">No upcoming tasks</p>
            ) : (tasksDue ?? []).map((t: any) => (
              <div key={t.id} className="flex items-center gap-3 px-5 py-3 hover:bg-dark-surface2 transition-colors">
                {t.is_overdue ? (
                  <AlertCircle size={16} className="text-[#ff375f] flex-shrink-0" />
                ) : (
                  <CheckCircle2 size={16} className="text-[#636366] flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{t.title}</p>
                  <p className="text-xs text-[#636366]">
                    {t.assignee && `${t.assignee} · `}
                    {t.due_date && format(new Date(t.due_date), 'MMM d')}
                  </p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  t.is_overdue ? 'bg-[#ff375f]/15 text-[#ff375f]' :
                  t.priority === 'High' ? 'bg-amber-500/15 text-amber-400' :
                  'bg-dark-surface3 text-[#8e8e93]'
                }`}>
                  {t.is_overdue ? 'Overdue' : t.priority}
                </span>
              </div>
            ))}
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

      {/* Recent Activity + Financial Summary */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <Card padding={false}>
          <div className="p-5 pb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <Activity size={16} className="text-primary-400" />
              Recent Activity
            </h3>
          </div>
          <div className="divide-y divide-dark-border">
            {(recentActivity ?? []).length === 0 ? (
              <p className="px-5 py-6 text-sm text-[#636366] text-center">No recent activity</p>
            ) : (recentActivity ?? []).slice(0, 8).map((a: any) => {
              const act = ACTIVITY_ICONS[a.type] || ACTIVITY_ICONS.note
              const Icon = act.icon
              return (
                <div key={a.id} className="flex items-start gap-3 px-5 py-3">
                  <div className={`w-7 h-7 rounded-full ${act.bg} ${act.color} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                    <Icon size={13} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#e0e0e0] leading-snug">{a.message}</p>
                    <p className="text-xs text-[#636366] mt-0.5">{a.created_at ? format(new Date(a.created_at), 'MMM d, h:mm a') : ''}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        {/* Points Liability */}
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
              <p className="text-xs text-[#8e8e93] mb-1">Conversion Rate</p>
              <p className="text-xl font-bold text-blue-400">{kpis?.conversion_rate ?? 0}%</p>
            </div>
            <div className="bg-[#1a1a2e] rounded-xl p-4 border border-[#2e2e50]">
              <p className="text-xs text-[#8e8e93] mb-1">Avg Daily Rate</p>
              <p className="text-xl font-bold text-[#32d74b]">${Number(kpis?.avg_daily_rate ?? 0).toFixed(0)}</p>
            </div>
          </div>
        </Card>
      </div>

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
