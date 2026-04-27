import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import {
  Scan, Bell, Calendar, Users, MessageSquare, Gift, BarChart3, Sparkles,
  ArrowUpRight, ArrowDownRight, ChevronRight, CheckCircle2,
  Hotel, ShieldCheck, Sparkle, FileText, DollarSign, UserCheck,
  PackageCheck, MessageCircle, Timer, Activity,
} from 'lucide-react'
import { api } from '../lib/api'
import { money } from '../lib/money'

/**
 * Dashboard — staff landing page.
 *
 * Design priorities (in order):
 *   1. Surface what NEEDS ACTION (waiting chats, pending bookings, unassigned)
 *   2. Show what's happening TODAY (arrivals/departures/services schedule)
 *   3. Quick-glance health numbers (4 KPIs that actually matter)
 *   4. Quick-access launcher to every major section
 *   5. Recent activity feed for context
 *
 * Trade-offs vs the previous dashboard:
 *   - Killed the 8-card "Today at a Glance" purple block (every cell was 0
 *     for new tenants, and the same data lives in the Today panel below).
 *   - Killed the week-comparison strip (analytics belong in /analytics).
 *   - Killed Birthdays / Tier-Up Candidates / Inquiry Pipeline / Tasks / Reviews
 *     panels — useful, but they each have dedicated pages and were burying
 *     the front-of-house signal staff actually need.
 *
 * What stayed: the live-ops counters (now reframed as smart alerts that hide
 * when zero), today's arrivals/departures, and a tighter recent-activity feed.
 */

const VIP_COLORS: Record<string, string> = {
  Standard: '#8e8e93',
  Silver: '#C0C0C0',
  Gold: '#FFD700',
  Platinum: '#9E9E9E',
  Diamond: '#00BCD4',
}

const ACTIVITY_ICONS: Record<string, { icon: any; bg: string; color: string }> = {
  inquiry:     { icon: FileText,    bg: 'bg-blue-500/15',     color: 'text-blue-400' },
  reservation: { icon: Calendar,    bg: 'bg-emerald-500/15',  color: 'text-emerald-400' },
  booking:     { icon: Calendar,    bg: 'bg-emerald-500/15',  color: 'text-emerald-400' },
  guest:       { icon: UserCheck,   bg: 'bg-cyan-500/15',     color: 'text-cyan-400' },
  member:      { icon: ShieldCheck, bg: 'bg-purple-500/15',   color: 'text-purple-400' },
  note:        { icon: MessageSquare, bg: 'bg-pink-500/15',   color: 'text-pink-400' },
}

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function thisMonthIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function timeOfDayGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

export function Dashboard() {
  const navigate = useNavigate()

  const { data: kpis } = useQuery({
    queryKey: ['dashboard-kpis'],
    queryFn: () => api.get('/v1/admin/dashboard/kpis').then(r => r.data),
    staleTime: 60_000,
  })

  const { data: liveOps } = useQuery({
    queryKey: ['dashboard-live-ops'],
    queryFn: () => api.get('/v1/admin/dashboard/live-ops').then(r => r.data),
    refetchInterval: 30_000,
  })

  const { data: arrivals } = useQuery({
    queryKey: ['dashboard-arrivals'],
    queryFn: () => api.get('/v1/admin/dashboard/arrivals-today').then(r => r.data),
    staleTime: 60_000,
  })

  const { data: departures } = useQuery({
    queryKey: ['dashboard-departures'],
    queryFn: () => api.get('/v1/admin/dashboard/departures-today').then(r => r.data),
    staleTime: 60_000,
  })

  // Service bookings calendar (whole month) — filter to today client-side.
  // Kept on the same endpoint the staff/admin booking calendar already uses.
  const monthKey = thisMonthIso()
  const today = todayIso()
  const { data: serviceData } = useQuery({
    queryKey: ['dashboard-service-bookings-month', monthKey],
    queryFn: () => api.get('/v1/admin/service-bookings/calendar', { params: { month: monthKey } }).then(r => r.data),
    staleTime: 60_000,
    retry: false,
  })

  const { data: recentActivity } = useQuery({
    queryKey: ['dashboard-recent-activity'],
    queryFn: () => api.get('/v1/admin/dashboard/recent-activity').then(r => r.data),
    staleTime: 30_000,
  })

  const todayServices = useMemo(() => {
    const items: any[] = serviceData?.bookings ?? []
    return items
      .filter(s => (s.start_at || s.date || '').slice(0, 10) === today)
      .sort((a, b) => (a.start_at || '').localeCompare(b.start_at || ''))
  }, [serviceData, today])

  // Smart alerts strip: only show items that need action (count > 0). When
  // everything is zero, render a single "all clear" pill instead of six
  // empty cards.
  const alerts = useMemo(() => {
    const items: { key: string; label: string; value: number; color: string; icon: any; route: string }[] = []
    const op = liveOps ?? {}
    if ((op.waiting_chats ?? 0) > 0)        items.push({ key: 'wait',  label: 'Waiting Chats',     value: op.waiting_chats,        color: '#ff375f', icon: Timer,         route: '/chat-inbox' })
    if ((op.unassigned_chats ?? 0) > 0)     items.push({ key: 'unas',  label: 'Unassigned Chats',  value: op.unassigned_chats,     color: '#f59e0b', icon: MessageCircle, route: '/chat-inbox' })
    if ((op.pending_submissions ?? 0) > 0)  items.push({ key: 'sub',   label: 'Pending Bookings',  value: op.pending_submissions,  color: '#a855f7', icon: PackageCheck,  route: '/bookings/submissions' })
    if ((op.new_leads_today ?? 0) > 0)      items.push({ key: 'leads', label: 'New Leads Today',   value: op.new_leads_today,      color: '#3b82f6', icon: UserCheck,     route: '/visitors' })
    if ((kpis?.active_inquiries ?? 0) > 0)  items.push({ key: 'inq',   label: 'Active Inquiries',  value: kpis.active_inquiries,   color: '#06b6d4', icon: FileText,      route: '/inquiries' })
    return items
  }, [liveOps, kpis])

  const arrivalsList = arrivals ?? []
  const departuresList = departures ?? []
  const totalToday = arrivalsList.length + departuresList.length + todayServices.length

  return (
    <div className="space-y-5">
      {/* ───────────── Header ───────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">{timeOfDayGreeting()}</h1>
          <p className="text-t-secondary text-sm mt-1 flex items-center gap-1.5">
            <Calendar size={13} />
            {format(new Date(), 'EEEE, MMMM d, yyyy')}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => navigate('/scan')}
            className="flex items-center justify-center gap-2 bg-dark-surface border border-dark-border text-[#e0e0e0] px-4 py-2 rounded-lg text-sm font-semibold hover:bg-dark-surface2 transition-colors">
            <Scan size={15} /> Scan Card
          </button>
          <button onClick={() => navigate('/notifications')}
            className="flex items-center justify-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-primary-700 transition-colors">
            <Bell size={15} /> Send Campaign
          </button>
        </div>
      </div>

      {/* ───────────── Needs Attention ───────────── */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-[#636366] font-bold mb-2">Needs your attention</p>
        {alerts.length === 0 ? (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-dark-surface border border-emerald-500/15 text-sm">
            <CheckCircle2 size={16} className="text-emerald-400" />
            <span className="text-emerald-200">All clear.</span>
            <span className="text-t-secondary">Nothing waiting on you right now.</span>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {alerts.map(a => {
              const Icon = a.icon
              return (
                <button key={a.key} onClick={() => navigate(a.route)}
                  className="group flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border transition-all hover:scale-[1.02]"
                  style={{ background: a.color + '14', borderColor: a.color + '44' }}>
                  <Icon size={15} style={{ color: a.color }} />
                  <span className="text-base font-bold tabular-nums" style={{ color: a.color }}>{a.value}</span>
                  <span className="text-xs text-t-secondary">{a.label}</span>
                  <ChevronRight size={13} className="text-[#636366] group-hover:text-white transition-colors" />
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ───────────── Today + KPIs (2-column) ───────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Today's schedule — spans 2 cols */}
        <div className="lg:col-span-2 bg-dark-surface rounded-2xl border border-dark-border overflow-hidden">
          <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-dark-border">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary-500/15 flex items-center justify-center text-primary-400">
                <Calendar size={17} />
              </div>
              <div>
                <p className="text-sm font-bold text-white">Today's schedule</p>
                <p className="text-[11px] text-[#636366]">{format(new Date(), 'EEEE · MMMM d')}</p>
              </div>
            </div>
            <span className="text-[11px] font-semibold text-t-secondary">{totalToday} events</span>
          </div>

          {totalToday === 0 ? (
            <div className="px-5 py-12 text-center">
              <div className="inline-flex w-12 h-12 rounded-full bg-dark-surface2 items-center justify-center mb-3">
                <Calendar size={20} className="text-[#636366]" />
              </div>
              <p className="text-sm text-t-secondary">Nothing on the books for today.</p>
              <p className="text-[11px] text-[#636366] mt-1">Future arrivals and services will appear here.</p>
            </div>
          ) : (
            <div className="divide-y divide-dark-border">
              <ScheduleSection
                title="Arrivals"
                count={arrivalsList.length}
                icon={ArrowUpRight}
                accent="#32d74b"
                rows={arrivalsList.slice(0, 4).map((a: any) => ({
                  key: 'a' + a.id,
                  initial: a.guest_name?.charAt(0) ?? '?',
                  initialColor: VIP_COLORS[a.vip_level] || '#8e8e93',
                  primary: a.guest_name,
                  secondary: [a.room_type, a.property].filter(Boolean).join(' · '),
                  meta: a.vip_level !== 'Standard' ? a.vip_level : null,
                  metaColor: VIP_COLORS[a.vip_level] || '#8e8e93',
                  onClick: () => navigate('/reservations'),
                }))}
                onViewAll={() => navigate('/reservations')}
              />
              <ScheduleSection
                title="Departures"
                count={departuresList.length}
                icon={ArrowDownRight}
                accent="#ff375f"
                rows={departuresList.slice(0, 4).map((d: any) => ({
                  key: 'd' + d.id,
                  initial: d.guest_name?.charAt(0) ?? '?',
                  initialColor: VIP_COLORS[d.vip_level] || '#8e8e93',
                  primary: d.guest_name,
                  secondary: [d.room_type, d.property].filter(Boolean).join(' · '),
                  meta: d.vip_level !== 'Standard' ? d.vip_level : null,
                  metaColor: VIP_COLORS[d.vip_level] || '#8e8e93',
                  onClick: () => navigate('/reservations'),
                }))}
                onViewAll={() => navigate('/reservations')}
              />
              <ScheduleSection
                title="Services"
                count={todayServices.length}
                icon={Sparkle}
                accent="#9a7ef0"
                rows={todayServices.slice(0, 4).map((s: any) => ({
                  key: 's' + s.id,
                  initial: (s.guest_name || s.customer_name || 'G').charAt(0),
                  initialColor: '#9a7ef0',
                  primary: s.guest_name || s.customer_name || 'Guest',
                  secondary: [
                    s.start_at ? new Date(s.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null,
                    s.service_name,
                    s.master_name && `with ${s.master_name}`,
                  ].filter(Boolean).join(' · '),
                  meta: null,
                  metaColor: '#9a7ef0',
                  onClick: () => navigate('/service-bookings'),
                }))}
                onViewAll={() => navigate('/service-bookings')}
              />
            </div>
          )}
        </div>

        {/* Numbers that matter — 2x2 stat grid */}
        <div className="grid grid-cols-2 gap-3 content-start">
          <KpiTile
            label="Active Members"
            value={(kpis?.engaged_members ?? 0).toLocaleString()}
            sub={kpis ? `${(kpis.total_members ?? 0).toLocaleString()} total` : undefined}
            icon={Users}
            accent="#3b82f6"
            onClick={() => navigate('/members')}
          />
          <KpiTile
            label="Revenue (MTD)"
            value={kpis ? money(kpis.revenue_this_month ?? 0) : '—'}
            sub="This month"
            icon={DollarSign}
            accent="#10b981"
            onClick={() => navigate('/analytics')}
          />
          <KpiTile
            label="Active in 30d"
            value={(kpis?.engaged_members_30d ?? 0).toLocaleString()}
            sub={kpis?.total_members ? `${Math.round(((kpis.engaged_members_30d ?? 0) / kpis.total_members) * 100)}% of base` : undefined}
            icon={Activity}
            accent="#06b6d4"
            onClick={() => navigate('/analytics')}
          />
          <KpiTile
            label="Pipeline"
            value={kpis ? money(kpis.pipeline_value ?? 0) : '—'}
            sub={kpis ? `${kpis.active_inquiries ?? 0} open` : undefined}
            icon={Hotel}
            accent="#a855f7"
            onClick={() => navigate('/inquiries')}
          />
        </div>
      </div>

      {/* ───────────── Quick Access (8 nav tiles) ───────────── */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-[#636366] font-bold mb-2">Quick access</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {[
            { to: '/members',          label: 'Members',     icon: Users,         color: '#3b82f6' },
            { to: '/bookings',         label: 'Bookings',    icon: Hotel,         color: '#10b981' },
            { to: '/bookings/calendar',label: 'Calendar',    icon: Calendar,      color: '#06b6d4' },
            { to: '/service-bookings', label: 'Services',    icon: Sparkle,       color: '#9a7ef0' },
            { to: '/chat-inbox',       label: 'Inbox',       icon: MessageSquare, color: '#f59e0b' },
            { to: '/offers',           label: 'Offers',      icon: Gift,          color: '#ec4899' },
            { to: '/analytics',        label: 'Analytics',   icon: BarChart3,     color: '#a855f7' },
            { to: '/ai',               label: 'AI Insights', icon: Sparkles,      color: '#c9a84c' },
          ].map(item => {
            const Icon = item.icon
            return (
              <button key={item.to} onClick={() => navigate(item.to)}
                className="group flex flex-col items-center justify-center gap-2 p-4 rounded-xl bg-dark-surface border border-dark-border hover:border-white/15 transition-all hover:scale-[1.02]">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110"
                  style={{ background: item.color + '18', color: item.color }}>
                  <Icon size={18} />
                </div>
                <span className="text-xs font-semibold text-white">{item.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ───────────── Recent Activity ───────────── */}
      <div className="bg-dark-surface rounded-2xl border border-dark-border overflow-hidden">
        <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-dark-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/15 flex items-center justify-center text-cyan-400">
              <Activity size={17} />
            </div>
            <p className="text-sm font-bold text-white">Recent activity</p>
          </div>
          <button onClick={() => navigate('/audit-log')} className="text-[11px] text-primary-400 hover:text-primary-300 flex items-center gap-0.5 font-semibold">
            View all <ChevronRight size={11} />
          </button>
        </div>
        {((recentActivity ?? []).length === 0) ? (
          <div className="px-5 py-10 text-center text-sm text-[#636366]">No recent activity yet.</div>
        ) : (
          <div className="divide-y divide-dark-border">
            {(recentActivity ?? []).slice(0, 8).map((act: any, i: number) => {
              const meta = ACTIVITY_ICONS[act.type] || ACTIVITY_ICONS.note
              const Icon = meta.icon
              const when = act.created_at ? new Date(act.created_at) : null
              const timeStr = when
                ? when.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                : ''
              return (
                <div key={i} className="flex items-center gap-3 px-5 py-3 hover:bg-dark-surface2 transition-colors">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${meta.bg}`}>
                    <Icon size={15} className={meta.color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{act.title || act.description || '—'}</p>
                    {act.subtitle && <p className="text-[11px] text-[#636366] truncate">{act.subtitle}</p>}
                  </div>
                  <span className="text-[11px] text-[#636366] tabular-nums whitespace-nowrap">{timeStr}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Sub-components ───────────────────────────────────────────────── */

interface ScheduleRow {
  key: string
  initial: string
  initialColor: string
  primary: string
  secondary: string
  meta: string | null
  metaColor: string
  onClick: () => void
}

function ScheduleSection({
  title, count, icon: Icon, accent, rows, onViewAll,
}: {
  title: string
  count: number
  icon: any
  accent: string
  rows: ScheduleRow[]
  onViewAll: () => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between px-5 pt-3 pb-1">
        <div className="flex items-center gap-2">
          <Icon size={13} style={{ color: accent }} />
          <span className="text-xs font-bold text-white">{title}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-md font-bold tabular-nums"
            style={{ background: accent + '20', color: accent }}>
            {count}
          </span>
        </div>
        {count > 4 && (
          <button onClick={onViewAll} className="text-[10px] text-primary-400 hover:text-primary-300 font-semibold flex items-center gap-0.5">
            +{count - 4} more <ChevronRight size={10} />
          </button>
        )}
      </div>
      {count === 0 ? (
        <p className="px-5 pb-3 text-[11px] text-[#636366]">None today.</p>
      ) : (
        <div>
          {rows.map(r => (
            <button key={r.key} onClick={r.onClick}
              className="w-full flex items-center gap-3 px-5 py-2.5 hover:bg-dark-surface2 transition-colors">
              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
                style={{ background: r.initialColor + '20', color: r.initialColor }}>
                {r.initial.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-medium text-white truncate">{r.primary}</p>
                {r.secondary && <p className="text-[11px] text-[#636366] truncate">{r.secondary}</p>}
              </div>
              {r.meta && (
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold flex-shrink-0"
                  style={{ background: r.metaColor + '20', color: r.metaColor }}>
                  {r.meta}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function KpiTile({
  label, value, sub, icon: Icon, accent, onClick,
}: {
  label: string
  value: string
  sub?: string
  icon: any
  accent: string
  onClick?: () => void
}) {
  return (
    <button onClick={onClick}
      className="group bg-dark-surface rounded-xl border border-dark-border p-4 text-left hover:border-white/10 transition-colors">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-wider font-bold text-[#636366]">{label}</span>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ background: accent + '18', color: accent }}>
          <Icon size={13} />
        </div>
      </div>
      <p className="text-xl font-bold text-white tabular-nums leading-tight">{value}</p>
      {sub && <p className="text-[10px] text-[#636366] mt-1 truncate">{sub}</p>}
    </button>
  )
}
