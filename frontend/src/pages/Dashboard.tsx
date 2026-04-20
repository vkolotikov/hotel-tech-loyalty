import { useQuery } from '@tanstack/react-query'
import {
  Users, Award, DollarSign, Sparkles, RefreshCw, Scan, Bell, Gift, Activity,
  ArrowUpRight, ArrowDownRight, Calendar, Hotel, ChevronRight,
  UserCheck, FileText, Briefcase, Clock, AlertCircle, CheckCircle2, Phone, Mail, MessageSquare,
  Cake, TrendingUp, Timer, Star, PackageCheck, Radio, MessageCircle,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { Card, StatCard } from '../components/ui/Card'
import { format } from 'date-fns'

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
  booking: { icon: Calendar, color: 'text-[#32d74b]', bg: 'bg-[#32d74b]/15' },
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

function ratingStars(n: number | null) {
  if (n === null || n === undefined) return null
  return '★'.repeat(n) + '☆'.repeat(Math.max(0, 5 - n))
}

export function Dashboard() {
  const navigate = useNavigate()

  const { data: kpis } = useQuery({
    queryKey: ['dashboard-kpis'],
    queryFn: () => api.get('/v1/admin/dashboard/kpis').then(r => r.data),
  })

  const { data: weekComp } = useQuery({
    queryKey: ['week-comparison'],
    queryFn: () => api.get('/v1/admin/dashboard/week-comparison').then(r => r.data),
  })

  const { data: aiInsights, refetch: refetchAi, isFetching: aiLoading } = useQuery({
    queryKey: ['ai-insights'],
    queryFn: () => api.get('/v1/admin/dashboard/ai-insights').then(r => r.data),
    enabled: false,
  })

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

  // NEW operational widgets
  const { data: liveOps } = useQuery({
    queryKey: ['dashboard-live-ops'],
    queryFn: () => api.get('/v1/admin/dashboard/live-ops').then(r => r.data),
    refetchInterval: 30000,
  })

  const { data: birthdays } = useQuery({
    queryKey: ['dashboard-birthdays'],
    queryFn: () => api.get('/v1/admin/dashboard/birthdays-today').then(r => r.data),
  })

  const { data: tierUps } = useQuery({
    queryKey: ['dashboard-tier-ups'],
    queryFn: () => api.get('/v1/admin/dashboard/tier-up-candidates').then(r => r.data),
  })

  const { data: expiring } = useQuery({
    queryKey: ['dashboard-expiring'],
    queryFn: () => api.get('/v1/admin/dashboard/expiring-points').then(r => r.data),
  })

  const { data: reviews } = useQuery({
    queryKey: ['dashboard-reviews'],
    queryFn: () => api.get('/v1/admin/dashboard/recent-reviews').then(r => r.data),
  })

  const { data: pendingSubmissions } = useQuery({
    queryKey: ['dashboard-pending-submissions'],
    queryFn: () => api.get('/v1/admin/dashboard/pending-submissions').then(r => r.data),
  })

  const { data: recentChats } = useQuery({
    queryKey: ['dashboard-recent-chats'],
    queryFn: () => api.get('/v1/admin/dashboard/recent-chats').then(r => r.data),
    refetchInterval: 30000,
  })

  const newMembersChange = kpis && kpis.new_members_last_month > 0
    ? Math.round(((kpis.new_members_this_month - kpis.new_members_last_month) / kpis.new_members_last_month) * 100)
    : 0

  const wk = weekComp?.week
  const lwk = weekComp?.last_week
  const weekChange = (curr: number, prev: number) => {
    if (!prev) return curr > 0 ? 100 : 0
    return Math.round(((curr - prev) / prev) * 100)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-t-secondary text-sm mt-1 flex items-center gap-1.5">
            <Calendar size={13} />
            {format(new Date(), "EEEE, MMMM d, yyyy")}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => navigate('/scan')}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-dark-surface border border-dark-border text-[#e0e0e0] px-4 py-2 rounded-lg text-sm font-semibold hover:bg-dark-surface2 transition-colors"
          >
            <Scan size={15} /> Scan Card
          </button>
          <button
            onClick={() => navigate('/notifications')}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-primary-700 transition-colors"
          >
            <Bell size={15} /> Send Campaign
          </button>
        </div>
      </div>

      {/* Live Ops Strip — real-time operational counters */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {[
          { label: 'Online Now', value: liveOps?.online_visitors ?? 0, icon: <Radio size={15} />, color: '#32d74b', route: '/visitors', pulse: (liveOps?.online_visitors ?? 0) > 0 },
          { label: 'Unassigned Chats', value: liveOps?.unassigned_chats ?? 0, icon: <MessageCircle size={15} />, color: '#06b6d4', route: '/chat-inbox', alert: (liveOps?.unassigned_chats ?? 0) > 0 },
          { label: 'Waiting', value: liveOps?.waiting_chats ?? 0, icon: <Timer size={15} />, color: '#f59e0b', route: '/chat-inbox', alert: (liveOps?.waiting_chats ?? 0) > 0 },
          { label: 'Pending Bookings', value: liveOps?.pending_submissions ?? 0, icon: <PackageCheck size={15} />, color: '#8b5cf6', route: '/booking-submissions', alert: (liveOps?.pending_submissions ?? 0) > 0 },
          { label: 'New Leads Today', value: liveOps?.new_leads_today ?? 0, icon: <UserCheck size={15} />, color: '#ec4899', route: '/visitors' },
          { label: 'Chats Today', value: liveOps?.chats_today ?? 0, icon: <MessageSquare size={15} />, color: '#3b82f6', route: '/chat-inbox' },
        ].map(item => (
          <div
            key={item.label}
            onClick={() => navigate(item.route)}
            className="bg-dark-surface rounded-xl p-3 border border-dark-border hover:border-primary-500/40 cursor-pointer transition-colors relative"
          >
            {item.pulse && (
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#32d74b] animate-pulse" />
            )}
            {item.alert && !item.pulse && (
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
            )}
            <div className="flex items-center gap-2 mb-1" style={{ color: item.color }}>
              {item.icon}
              <p className="text-[10px] text-t-secondary uppercase tracking-wide font-semibold">{item.label}</p>
            </div>
            <p className="text-xl font-bold text-white">{item.value}</p>
          </div>
        ))}
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
          title="Engaged Members"
          value={kpis?.engaged_members?.toLocaleString() ?? '—'}
          icon={<Users size={20} />}
          color="bg-blue-500"
          change={newMembersChange}
          subtitle={kpis ? `${(kpis.total_members ?? 0).toLocaleString()} total · ${(kpis.passive_contacts ?? 0).toLocaleString()} passive` : undefined}
        />
        <StatCard
          title="Active in 30 days"
          value={kpis?.engaged_members_30d?.toLocaleString() ?? '—'}
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
                <p className="text-xs text-t-secondary mb-1">{item.label}</p>
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

      {/* Birthdays + Tier-Up Candidates */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Birthdays Today */}
        <Card padding={false}>
          <div className="p-5 pb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <Cake size={16} className="text-pink-400" />
              Birthdays Today
            </h3>
            <span className="text-xs text-[#636366]">{birthdays?.count ?? 0} members</span>
          </div>
          <div className="divide-y divide-dark-border">
            {(birthdays?.items ?? []).length === 0 ? (
              <p className="px-5 py-6 text-sm text-[#636366] text-center">No birthdays today</p>
            ) : (birthdays?.items ?? []).slice(0, 5).map((b: any) => (
              <div
                key={b.id}
                onClick={() => typeof b.id === 'number' ? navigate(`/members/${b.id}`) : navigate(`/guests/${String(b.id).replace('g-', '')}`)}
                className="flex items-center gap-3 px-5 py-3 hover:bg-dark-surface2 cursor-pointer transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-pink-500/20 flex items-center justify-center flex-shrink-0 text-xs font-bold text-pink-400">
                  {b.name?.charAt(0) ?? '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{b.name}</p>
                  <p className="text-xs text-[#636366]">
                    {b.member_number ? `${b.member_number} · ` : ''}
                    {b.tier}
                    {b.age ? ` · turns ${b.age}` : ''}
                  </p>
                </div>
                <Cake size={14} className="text-pink-400/60" />
              </div>
            ))}
          </div>
        </Card>

        {/* Tier-Up Candidates */}
        <Card padding={false}>
          <div className="p-5 pb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <TrendingUp size={16} className="text-amber-400" />
              Close to Next Tier
            </h3>
            <span className="text-xs text-[#636366]">{tierUps?.count ?? 0} candidates</span>
          </div>
          <div className="divide-y divide-dark-border">
            {(tierUps?.items ?? []).length === 0 ? (
              <p className="px-5 py-6 text-sm text-[#636366] text-center">No tier-up candidates</p>
            ) : (tierUps?.items ?? []).slice(0, 5).map((m: any) => (
              <div
                key={m.id}
                onClick={() => navigate(`/members/${m.id}`)}
                className="px-5 py-3 hover:bg-dark-surface2 cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-3 mb-1.5">
                  <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0 text-xs font-bold text-amber-400">
                    {m.name?.charAt(0) ?? '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{m.name}</p>
                    <p className="text-xs text-[#636366]">
                      {m.current_tier} → <span style={{ color: m.next_tier_color || '#c9a84c' }}>{m.next_tier}</span>
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-white">
                    {m.points_needed.toLocaleString()} pts
                  </span>
                </div>
                <div className="h-1.5 bg-dark-bg rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${m.progress_pct}%`, backgroundColor: m.next_tier_color || '#c9a84c' }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Inquiry Pipeline + Tasks Due */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
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
                  'bg-dark-surface3 text-t-secondary'
                }`}>
                  {t.is_overdue ? 'Overdue' : t.priority}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Pending Booking Submissions + Unassigned Chats */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Pending Booking Submissions */}
        <Card padding={false}>
          <div className="p-5 pb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <PackageCheck size={16} className="text-purple-400" />
              Pending Booking Submissions
            </h3>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-[#636366]">{pendingSubmissions?.today ?? 0} today</span>
              {(pendingSubmissions?.failed ?? 0) > 0 && (
                <span className="px-1.5 py-0.5 rounded bg-[#ff375f]/15 text-[#ff375f] font-semibold">
                  {pendingSubmissions.failed} failed
                </span>
              )}
              <button onClick={() => navigate('/booking-submissions')} className="text-primary-400 hover:text-primary-300 flex items-center gap-0.5">
                View all <ChevronRight size={12} />
              </button>
            </div>
          </div>
          <div className="divide-y divide-dark-border">
            {(pendingSubmissions?.items ?? []).length === 0 ? (
              <p className="px-5 py-6 text-sm text-[#636366] text-center">No pending submissions</p>
            ) : (pendingSubmissions?.items ?? []).slice(0, 5).map((s: any) => (
              <div
                key={s.id}
                onClick={() => navigate(`/booking-submissions/${s.id}`)}
                className="flex items-center gap-3 px-5 py-3 hover:bg-dark-surface2 cursor-pointer transition-colors"
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  s.outcome === 'failed' ? 'bg-[#ff375f]/20 text-[#ff375f]' :
                  s.outcome === 'pending' ? 'bg-amber-500/20 text-amber-400' :
                  'bg-purple-500/20 text-purple-400'
                }`}>
                  <PackageCheck size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{s.guest_name || s.guest_email || 'Anonymous'}</p>
                  <p className="text-xs text-[#636366] truncate">
                    {s.unit_name || 'Room'} · {s.check_in} → {s.check_out}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-semibold text-white">${Number(s.gross_total ?? 0).toFixed(0)}</p>
                  <p className="text-[10px] text-[#636366]">{s.time_ago}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Unassigned Chats */}
        <Card padding={false}>
          <div className="p-5 pb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <MessageCircle size={16} className="text-cyan-400" />
              Unassigned Conversations
            </h3>
            <button onClick={() => navigate('/chat-inbox')} className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-0.5">
              Inbox <ChevronRight size={12} />
            </button>
          </div>
          <div className="divide-y divide-dark-border">
            {(recentChats ?? []).length === 0 ? (
              <p className="px-5 py-6 text-sm text-[#636366] text-center">All chats assigned</p>
            ) : (recentChats ?? []).slice(0, 5).map((c: any) => (
              <div
                key={c.id}
                onClick={() => navigate(`/chat-inbox?conversation=${c.id}`)}
                className="flex items-center gap-3 px-5 py-3 hover:bg-dark-surface2 cursor-pointer transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center flex-shrink-0 text-xs font-bold text-cyan-400 relative">
                  {c.visitor_name?.charAt(0) ?? '?'}
                  {c.status === 'waiting' && (
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {c.visitor_name}
                    {c.is_lead && <span className="ml-1.5 text-[10px] px-1 py-0.5 rounded bg-[#32d74b]/15 text-[#32d74b]">LEAD</span>}
                  </p>
                  <p className="text-xs text-[#636366] truncate">
                    {c.country && `${c.country} · `}{c.messages_count} msg · {c.time_ago}
                  </p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  c.status === 'waiting' ? 'bg-amber-500/15 text-amber-400' : 'bg-cyan-500/15 text-cyan-400'
                }`}>
                  {c.status}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Expiring Points + Recent Reviews */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Expiring Points */}
        <Card padding={false}>
          <div className="p-5 pb-3">
            <h3 className="text-base font-semibold text-white flex items-center gap-2 mb-3">
              <Timer size={16} className="text-orange-400" />
              Expiring Points
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-dark-bg rounded-lg p-3 border border-dark-border">
                <p className="text-[10px] text-t-secondary uppercase tracking-wide">Next 30 days</p>
                <p className="text-xl font-bold text-orange-400">{(expiring?.total_expiring_30d ?? 0).toLocaleString()}</p>
              </div>
              <div className="bg-dark-bg rounded-lg p-3 border border-dark-border">
                <p className="text-[10px] text-t-secondary uppercase tracking-wide">Next 60 days</p>
                <p className="text-xl font-bold text-amber-400">{(expiring?.total_expiring_60d ?? 0).toLocaleString()}</p>
              </div>
            </div>
          </div>
          <div className="divide-y divide-dark-border">
            {(expiring?.top_members ?? []).length === 0 ? (
              <p className="px-5 py-6 text-sm text-[#636366] text-center">No expiring points</p>
            ) : (expiring?.top_members ?? []).slice(0, 5).map((m: any) => (
              <div
                key={m.id}
                onClick={() => navigate(`/members/${m.id}`)}
                className="flex items-center gap-3 px-5 py-2.5 hover:bg-dark-surface2 cursor-pointer transition-colors"
              >
                <div className="w-7 h-7 rounded-full bg-orange-500/20 flex items-center justify-center flex-shrink-0 text-xs font-bold text-orange-400">
                  {m.name?.charAt(0) ?? '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{m.name}</p>
                  <p className="text-xs text-[#636366]">{m.tier}</p>
                </div>
                <span className="text-sm font-semibold text-orange-400">
                  {m.expiring_points.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </Card>

        {/* Recent Reviews */}
        <Card padding={false}>
          <div className="p-5 pb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <Star size={16} className="text-yellow-400" />
              Recent Reviews
            </h3>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-[#636366]">
                Avg {reviews?.summary?.avg_rating ?? '—'}★ · NPS {reviews?.summary?.avg_nps ?? '—'}
              </span>
              {(reviews?.summary?.detractors_count ?? 0) > 0 && (
                <span className="px-1.5 py-0.5 rounded bg-[#ff375f]/15 text-[#ff375f] font-semibold">
                  {reviews.summary.detractors_count} detractors
                </span>
              )}
            </div>
          </div>
          <div className="divide-y divide-dark-border">
            {(reviews?.reviews ?? []).length === 0 ? (
              <p className="px-5 py-6 text-sm text-[#636366] text-center">No recent reviews</p>
            ) : (reviews?.reviews ?? []).slice(0, 4).map((r: any) => (
              <div key={r.id} className="px-5 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-white truncate">{r.reviewer_name}</span>
                  {r.is_detractor && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#ff375f]/15 text-[#ff375f] font-semibold">
                      Detractor
                    </span>
                  )}
                  {r.overall_rating !== null && (
                    <span className="text-xs text-yellow-400 ml-auto">{ratingStars(r.overall_rating)}</span>
                  )}
                </div>
                {r.comment && (
                  <p className="text-xs text-[#a0a0a0] line-clamp-2 leading-snug">{r.comment}</p>
                )}
                <p className="text-[10px] text-[#636366] mt-1">{r.time_ago}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

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
          <p className="text-[#636366] text-sm">Click "Generate Insights" to get AI-powered analysis of this week's performance. Trends &amp; charts live in the Analytics section.</p>
        )}
      </Card>
    </div>
  )
}
