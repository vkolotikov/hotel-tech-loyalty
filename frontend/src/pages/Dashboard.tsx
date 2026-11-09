import { useMemo, useRef, useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { LucideIcon } from 'lucide-react'
import {
  Activity, ArrowDown, ArrowDownRight, ArrowUp, ArrowUpRight, BarChart3, BedDouble, Bell, Briefcase, Calendar, Coins,
  DollarSign, Eye, EyeOff, FileText, Gift, Hotel, LayoutGrid, MessageCircle, MessageSquare, PackageCheck, PlaneLanding,
  Receipt, RotateCcw, Scan, ShieldCheck, Sparkle, SlidersHorizontal, Stethoscope, Timer, TrendingUp, UserCheck, UserPlus,
  Users, Utensils, X,
} from 'lucide-react'
import { api } from '../lib/api'
import { money } from '../lib/money'
import { formatWallTime } from '../lib/venueTime'
import { useVocabulary } from '../lib/vocabulary'
import { useAuthStore } from '../stores/authStore'
import { useSubscription } from '../hooks/useSubscription'
import { useVisibleMenu } from '../components/visibleMenu'
import { DASH_HUE, fill, ink } from '../theme/dashboardPalette'
import { TrendChart, type ChartSeries } from './dashboard/charts'
import {
  compactNumber, DEFAULT_LAYOUT, moveWidget, PERIODS, periodFrom, sumSeries, sumTotals, toggleWidget, type Period,
  type Total, type WidgetId,
} from './dashboard/dashboardMath'
import { useDashLayout } from './dashboard/hooks'
import { NowHero, type Pulse } from './dashboard/NowHero'
import {
  ActivityCard, Card, KpiTile, LiveCard, LoyaltyCard, PipelineCard, ScheduleCard, StatTile, TasksCard, WorkspacesCard,
  type ActivityRow, type AppCard, type KpiSpec, type LiveRow, type ScheduleGroup,
} from './dashboard/widgets'
import './dashboard/dashboard.css'

/**
 * Dashboard — the staff landing page, rebuilt on 2026-11-09 (owner: "more engaging, interesting, maybe animated
 * dashboard with grids … KPI, main graphs, maybe weather info, time … really powerful"). A grid of widgets the person
 * may hide and reorder (Customize; kept in this browser):
 *
 *   1. Now — the venue's clock, greeting and weather (dashboard/pulse), and Live now: what waits for a person.
 *   2. Figures — the industry's "today" tiles (dashboard/kpis) and the period's figures with their change and
 *      sparkline (dashboard/trends: 7, 30 or 90 days).
 *   3. The main chart (revenue, bookings, points, leads and chats by day) and the pipeline by stage.
 *   4. Today's schedule (arrivals, departures, services) and members & tiers.
 *   5. The HexaTech workspaces this person may open (the menu's own filtering), follow-ups due, recent activity.
 *
 * Every figure is the server's; widgets of a product the organisation does not hold are not offered. Motion — figures
 * counting up, lines drawing, cards rising in — stops for reduced motion (dashboard.css).
 */

const KPI_ICONS: Record<string, LucideIcon> = {
  Activity, BarChart3, BedDouble, Briefcase, Calendar, DollarSign,
  FileText, Gift, Hotel, MessageSquare, PackageCheck, PlaneLanding,
  Receipt, Stethoscope, TrendingUp, UserCheck, Users, Utensils,
}

const KPI_HUE: Record<string, string> = {
  sky: DASH_HUE.cyan, emerald: DASH_HUE.emerald, amber: DASH_HUE.amber, violet: DASH_HUE.purple,
  rose: DASH_HUE.red, blue: DASH_HUE.blue, slate: DASH_HUE.indigo,
}

interface KpiTileSpec {
  key: string
  label: string
  value: number | string | null
  delta?: string | null
  format: 'count' | 'currency' | 'percent' | string
  icon: string
  accent: string
  link?: string | null
}

/** An arrival or departure as dashboard/arrivals-today and departures-today answer it. */
/** A service booking as the booking calendar's month answers it (start_at: the venue's wall clock). */
interface ServiceRow { id: number; start_at?: string; date?: string; guest_name?: string; customer_name?: string; service_name?: string; master_name?: string }

interface StayRow { id: number; guest_name?: string; room_type?: string; property?: string; vip_level?: string }

interface Trends {
  days: number
  dates: string[]
  series: Record<string, number[] | null>
  totals: Record<string, Total | null>
}

const PIPELINE_HUES = [DASH_HUE.violet, DASH_HUE.blue, DASH_HUE.cyan, DASH_HUE.emerald, DASH_HUE.amber, DASH_HUE.orange, DASH_HUE.red, DASH_HUE.indigo]

const ACTIVITY: Record<string, { icon: LucideIcon; hue: string }> = {
  inquiry: { icon: FileText, hue: DASH_HUE.blue },
  reservation: { icon: Calendar, hue: DASH_HUE.emerald },
  booking: { icon: Calendar, hue: DASH_HUE.emerald },
  guest: { icon: UserCheck, hue: DASH_HUE.cyan },
  member: { icon: ShieldCheck, hue: DASH_HUE.purple },
  note: { icon: MessageSquare, hue: DASH_HUE.indigo },
}

/** Each workspace's card in the dashboard hue nearest its menu colour (a registered hue, deepened in Clean light). */
const APP_HUE: Record<string, string> = { loyalty: DASH_HUE.amber, appointments: DASH_HUE.emerald, crm: DASH_HUE.pink, content: DASH_HUE.violet, time: DASH_HUE.cyan }

const VIP_HUE: Record<string, string> = { Gold: DASH_HUE.gold, Platinum: DASH_HUE.cyan, Diamond: DASH_HUE.cyan, Silver: DASH_HUE.indigo }

/** The browser's day, `YYYY-MM-DD`: until the venue's day arrives with the pulse. */
function localIso(month = false): string {
  const d = new Date()
  const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  return month ? ym : `${ym}-${String(d.getDate()).padStart(2, '0')}`
}

/** A server day (`YYYY-MM-DD`) in words, without the browser's zone moving it. */
function dayWords(iso: string, lang: string, opts: Intl.DateTimeFormatOptions): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return new Intl.DateTimeFormat(lang, { ...opts, timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)))
}

function moneyShort(value: number, currency: string, lang: string): string {
  try {
    return new Intl.NumberFormat(lang, {
      style: 'currency', currency, notation: Math.abs(value) >= 10000 ? 'compact' : 'standard',
      maximumFractionDigits: Math.abs(value) >= 10000 ? 1 : 0,
    }).format(value)
  } catch {
    return money(value, currency)
  }
}

function formatTileValue(spec: KpiTileSpec, currency: string): string {
  if (spec.value === null || spec.value === undefined) return '—'
  // A non-numeric string for a numeric tile reads '—', never '$NaN' or 'NaN%'.
  const num = Number(spec.value)
  switch (spec.format) {
    case 'currency': return Number.isFinite(num) ? money(num, currency) : '—'
    case 'percent': return Number.isFinite(num) ? num.toLocaleString() + '%' : '—'
    case 'count':
    default:
      if (typeof spec.value === 'string') return spec.value
      return Number.isFinite(num) ? num.toLocaleString() : '—'
  }
}

const PERIOD_KEY = 'hx-dashboard-period-v1'

/** How many period figures sit in a row on a wide screen, by how many there are (seven: four, the first twice as wide). */
const XL_COLS: Record<number, string> = { 3: 'xl:grid-cols-3', 4: 'xl:grid-cols-4', 5: 'xl:grid-cols-5', 6: 'xl:grid-cols-6', 7: 'xl:grid-cols-4' }

export function Dashboard() {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const lang = i18n.language || 'en'
  const vocab = useVocabulary()
  const user = useAuthStore(s => (s as { user?: { id?: number; name?: string; industry?: string } | null }).user)
  const staff = useAuthStore(s => (s as { staff?: { role?: string } | null }).staff)
  const isManager = staff?.role === 'super_admin' || staff?.role === 'manager'
  const { hasProduct } = useSubscription()
  const menu = useVisibleMenu()
  const industry = user?.industry ?? 'hotel'

  const [period, setPeriodState] = useState<Period>(() => {
    try { return periodFrom(localStorage.getItem(PERIOD_KEY)) } catch { return 30 }
  })
  const setPeriod = (p: Period) => {
    setPeriodState(p)
    try { localStorage.setItem(PERIOD_KEY, String(p)) } catch { /* this visit only */ }
  }
  const [layout, setLayout] = useDashLayout(user?.id)
  const [customizing, setCustomizing] = useState(false)
  const [chartTab, setChartTab] = useState<string | null>(null)

  // ── Data ────────────────────────────────────────────────────────────────────────────────────────────────────────
  const { data: pulse } = useQuery<Pulse & { currency?: string }>({
    queryKey: ['dashboard-pulse'],
    queryFn: () => api.get('/v1/admin/dashboard/pulse').then(r => r.data),
    staleTime: 10 * 60_000,
    refetchInterval: 15 * 60_000,
    retry: false,
  })
  const currency = pulse?.currency || 'EUR'
  const { data: trends } = useQuery<Trends>({
    queryKey: ['dashboard-trends', period],
    queryFn: () => api.get('/v1/admin/dashboard/trends', { params: { days: period } }).then(r => r.data),
    staleTime: 60_000,
    placeholderData: prev => prev,
    retry: false,
  })
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
  const booking = hasProduct('booking')
  const loyalty = hasProduct('loyalty')
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
  // The month's service bookings (the booking calendar's own endpoint), today's taken by the venue's day.
  const monthKey = localIso(true)
  const today = pulse?.today ?? localIso()
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
  const { data: statuses } = useQuery({
    queryKey: ['dashboard-inquiries-by-status'],
    queryFn: () => api.get('/v1/admin/dashboard/inquiries-by-status').then(r => r.data),
    staleTime: 60_000,
    retry: false,
  })
  const { data: tasksDue } = useQuery({
    queryKey: ['dashboard-tasks-due'],
    queryFn: () => api.get('/v1/admin/dashboard/tasks-due').then(r => r.data),
    staleTime: 60_000,
    retry: false,
  })
  const { data: birthdays } = useQuery({
    queryKey: ['dashboard-birthdays-today'],
    queryFn: () => api.get('/v1/admin/dashboard/birthdays-today').then(r => r.data),
    staleTime: 10 * 60_000,
    enabled: loyalty,
    retry: false,
  })
  const { data: climbers } = useQuery({
    queryKey: ['dashboard-tier-up'],
    queryFn: () => api.get('/v1/admin/dashboard/tier-up-candidates').then(r => r.data),
    staleTime: 10 * 60_000,
    enabled: loyalty,
    retry: false,
  })

  // ── Shapes ──────────────────────────────────────────────────────────────────────────────────────────────────────
  const fmtCount = (v: number) => compactNumber(Math.round(v), lang)
  const fmtMoney = (v: number) => moneyShort(v, currency, lang)
  const dayLabel = (iso: string, long = false) => dayWords(iso, lang, long ? { weekday: 'short', day: 'numeric', month: 'long' } : { day: 'numeric', month: 'short' })

  const tiles = useMemo<KpiSpec[]>(() => {
    if (!trends) return []
    const s = trends.series, tt = trends.totals
    const out: KpiSpec[] = []
    const add = (spec: Omit<KpiSpec, 'total' | 'series'> & { total: Total | null; series: number[] | null }) => {
      if (spec.total && spec.series) out.push(spec as KpiSpec)
    }
    const seen = (k: string) => (tt[k]?.current ?? 0) + (tt[k]?.previous ?? 0) > 0
    if (booking) {
      add({ key: 'revenue', label: t('dashboard.kpi.revenue', 'Revenue'), sub: t('dashboard.kpi.revenue_sub', 'Stays and services'), icon: DollarSign, hue: DASH_HUE.emerald,
        total: sumTotals(tt.revenue, tt.service_revenue), series: sumSeries(s.revenue, s.service_revenue), format: fmtMoney, to: '/bookings/payments' })
      if (industry === 'hotel' || seen('bookings')) {
        add({ key: 'bookings', label: vocab('Reservations') ?? t('dashboard.kpi.bookings', 'Bookings'), sub: t('dashboard.kpi.bookings_sub', 'Stays booked'), icon: BedDouble, hue: DASH_HUE.blue,
          total: tt.bookings, series: s.bookings, format: fmtCount, to: '/bookings' })
      }
      if (industry !== 'hotel' || seen('services')) {
        add({ key: 'services', label: t('dashboard.kpi.services', 'Appointments'), sub: t('dashboard.kpi.services_sub', 'On the calendar'), icon: Calendar, hue: DASH_HUE.cyan,
          total: tt.services, series: s.services, format: fmtCount, to: '/service-bookings' })
      }
    }
    if (loyalty) {
      add({ key: 'members', label: t('dashboard.kpi.members', 'New members'), sub: t('dashboard.kpi.members_sub', 'Joined'), icon: UserPlus, hue: DASH_HUE.purple,
        total: tt.members, series: s.members, format: fmtCount, to: '/members' })
      add({ key: 'points', label: t('dashboard.kpi.points', 'Points earned'), sub: t('dashboard.kpi.points_sub', 'By members'), icon: Coins, hue: DASH_HUE.gold,
        total: tt.points_earned, series: s.points_earned, format: fmtCount, to: '/program' })
    }
    add({ key: 'leads', label: t('dashboard.kpi.leads', 'New leads'), sub: t('dashboard.kpi.leads_sub', 'Inquiries in'), icon: FileText, hue: DASH_HUE.violet,
      total: tt.leads, series: s.leads, format: fmtCount, to: '/leads' })
    if (hasProduct('chat')) {
      add({ key: 'chats', label: t('dashboard.kpi.chats', 'Website chats'), sub: t('dashboard.kpi.chats_sub', 'Conversations'), icon: MessageCircle, hue: DASH_HUE.orange,
        total: tt.chats, series: s.chats, format: fmtCount, to: '/engagement' })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trends, booking, loyalty, industry, lang, currency, t])

  const chartTabs = useMemo(() => {
    if (!trends) return []
    const s = trends.series
    const tabs: { key: string; label: string; series: ChartSeries[]; format: (v: number) => string; stack?: boolean }[] = []
    if (booking && (s.revenue || s.service_revenue)) {
      tabs.push({ key: 'revenue', label: t('dashboard.chart.revenue', 'Revenue'), stack: true, format: fmtMoney, series: [
        ...(s.revenue && (industry === 'hotel' || s.revenue.some(v => v > 0)) ? [{ key: 'stays', label: t('dashboard.chart.stays', 'Stays'), hue: DASH_HUE.blue, values: s.revenue, kind: 'area' as const }] : []),
        ...(s.service_revenue ? [{ key: 'services', label: t('dashboard.chart.services', 'Services'), hue: DASH_HUE.purple, values: s.service_revenue, kind: 'area' as const }] : []),
      ] })
      tabs.push({ key: 'bookings', label: t('dashboard.chart.bookings', 'Bookings'), format: fmtCount, series: [
        ...(s.bookings && (industry === 'hotel' || s.bookings.some(v => v > 0)) ? [{ key: 'stays', label: t('dashboard.chart.stays', 'Stays'), hue: DASH_HUE.emerald, values: s.bookings, kind: 'bar' as const }] : []),
        ...(s.services ? [{ key: 'services', label: t('dashboard.chart.appointments', 'Appointments'), hue: DASH_HUE.cyan, values: s.services, kind: 'bar' as const }] : []),
      ] })
    }
    if (loyalty && s.points_earned) {
      tabs.push({ key: 'points', label: t('dashboard.chart.points', 'Points'), format: fmtCount, series: [
        { key: 'earned', label: t('dashboard.chart.earned', 'Earned'), hue: DASH_HUE.gold, values: s.points_earned, kind: 'area' },
        ...(s.points_redeemed ? [{ key: 'redeemed', label: t('dashboard.chart.redeemed', 'Redeemed'), hue: DASH_HUE.orange, values: s.points_redeemed, kind: 'line' as const }] : []),
      ] })
    }
    if (s.leads || s.chats) {
      tabs.push({ key: 'leads', label: t('dashboard.chart.leads', 'Leads & chats'), format: fmtCount, series: [
        ...(s.leads ? [{ key: 'leads', label: t('dashboard.chart.leads_line', 'Leads'), hue: DASH_HUE.violet, values: s.leads, kind: 'area' as const }] : []),
        ...(s.chats && hasProduct('chat') ? [{ key: 'chats', label: t('dashboard.chart.chats', 'Chats'), hue: DASH_HUE.cyan, values: s.chats, kind: 'line' as const }] : []),
      ] })
    }
    return tabs.filter(tab => tab.series.length > 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trends, booking, loyalty, industry, lang, currency, t])
  const activeTab = chartTabs.find(tab => tab.key === chartTab) ?? chartTabs[0]

  const todayServices = useMemo(() => {
    const items: ServiceRow[] = serviceData?.bookings ?? []
    return items
      .filter(s => (s.start_at || s.date || '').slice(0, 10) === today)
      .sort((a, b) => (a.start_at || '').localeCompare(b.start_at || ''))
  }, [serviceData, today])

  const arrivalsList: StayRow[] = Array.isArray(arrivals) ? arrivals : []
  const departuresList: StayRow[] = Array.isArray(departures) ? departures : []
  const scheduleGroups: ScheduleGroup[] = [
    ...(industry === 'hotel' || arrivalsList.length + departuresList.length > 0 ? [
      { key: 'arrivals', title: t('dashboard.schedule.arrivals', 'Arrivals'), icon: ArrowUpRight, hue: DASH_HUE.emerald, count: arrivalsList.length, to: '/reservations',
        rows: arrivalsList.slice(0, 4).map(a => ({ key: 'a' + a.id, initial: a.guest_name?.charAt(0) ?? '?', hue: VIP_HUE[a.vip_level ?? ''] ?? DASH_HUE.emerald, primary: a.guest_name ?? '—', secondary: [a.room_type, a.property].filter(Boolean).join(' · '), meta: a.vip_level && a.vip_level !== 'Standard' ? a.vip_level : null, to: '/reservations' })) },
      { key: 'departures', title: t('dashboard.schedule.departures', 'Departures'), icon: ArrowDownRight, hue: DASH_HUE.red, count: departuresList.length, to: '/reservations',
        rows: departuresList.slice(0, 4).map(d => ({ key: 'd' + d.id, initial: d.guest_name?.charAt(0) ?? '?', hue: VIP_HUE[d.vip_level ?? ''] ?? DASH_HUE.red, primary: d.guest_name ?? '—', secondary: [d.room_type, d.property].filter(Boolean).join(' · '), meta: d.vip_level && d.vip_level !== 'Standard' ? d.vip_level : null, to: '/reservations' })) },
    ] : []),
    { key: 'services', title: t('dashboard.schedule.services', 'Services'), icon: Sparkle, hue: DASH_HUE.violet, count: todayServices.length, to: '/service-bookings',
      rows: todayServices.slice(0, 4).map(s => ({
        key: 's' + s.id,
        initial: (s.guest_name || s.customer_name || 'G').charAt(0),
        hue: DASH_HUE.violet,
        primary: s.guest_name || s.customer_name || t('dashboard.schedule.guest', 'Guest'),
        secondary: [
          s.start_at ? formatWallTime(s.start_at) : null,
          s.service_name,
          s.master_name && t('dashboard.schedule.with', { name: s.master_name, defaultValue: 'with {{name}}' }),
        ].filter(Boolean).join(' · '),
        meta: null,
        to: '/service-bookings',
      })) },
  ]

  const op = liveOps ?? {}
  const liveRows: LiveRow[] = [
    ...(hasProduct('chat') ? [
      { key: 'wait', label: t('dashboard.alerts.waiting_chats', 'Waiting Chats'), value: op.waiting_chats ?? 0, icon: Timer, hue: DASH_HUE.red, to: '/chat-inbox', urgent: true },
      { key: 'unas', label: t('dashboard.alerts.unassigned_chats', 'Unassigned Chats'), value: op.unassigned_chats ?? 0, icon: MessageCircle, hue: DASH_HUE.amber, to: '/chat-inbox' },
    ] : []),
    ...(booking ? [{ key: 'sub', label: t('dashboard.alerts.pending_bookings', 'Pending Bookings'), value: op.pending_submissions ?? 0, icon: PackageCheck, hue: DASH_HUE.purple, to: '/bookings/submissions' }] : []),
    { key: 'leads', label: t('dashboard.alerts.new_leads_today', 'New Leads Today'), value: op.new_leads_today ?? 0, icon: UserCheck, hue: DASH_HUE.blue, to: '/visitors' },
    { key: 'inq', label: t('dashboard.alerts.active_inquiries', 'Active Inquiries'), value: kpis?.active_inquiries ?? 0, icon: FileText, hue: DASH_HUE.cyan, to: '/inquiries' },
  ]

  const pipelineSlices = (Array.isArray(statuses) ? statuses : [])
    .map((row: { status: string; count: number; value: number }, i: number) => ({ key: row.status || String(i), label: row.status || '—', count: Number(row.count) || 0, value: Number(row.value) || 0, hue: PIPELINE_HUES[i % PIPELINE_HUES.length] }))
    .filter(s => s.count > 0)

  const appsGroup = menu?.find(g => g.layout === 'apps')
  const apps: AppCard[] = (appsGroup?.items ?? []).map(item => {
    const name = vocab(item.defaultLabel) ?? t(item.labelKey, item.defaultLabel)
    const short = (item.shortKey ?? '').split('.').pop() ?? ''
    const lines: Record<string, string> = {
      loyalty: t('dashboard.apps.loyalty_line', 'Members, points, rewards and campaigns'),
      appointments: t('dashboard.apps.appointments_line', 'The calendar, clients and takings'),
      crm: t('dashboard.apps.crm_line', 'Website chat, leads and the pipeline'),
      content: t('dashboard.apps.content_line', 'Posts planned and written with AI'),
      time: t('dashboard.apps.time_line', "The team's day, planned with AI"),
    }
    return {
      path: item.path, name, short: item.shortKey ? t(item.shortKey, item.shortLabel ?? name) : name, line: lines[short] ?? '', icon: item.icon as LucideIcon, tint: APP_HUE[short] ?? DASH_HUE.cyan,
      locked: item._locked === true,
      onLocked: () => window.dispatchEvent(new CustomEvent('feature:locked', { detail: { feature: item._lockedFeature ?? null, plan: null, upgradeUrl: null, message: t('nav_locked.dispatch_message', '{{label}} is not included in your current plan.', { label: name }) } })),
    }
  })

  const industryTiles: KpiTileSpec[] = Array.isArray(kpis?.kpi_tiles) ? kpis.kpi_tiles : []
  const name = user?.name ? user.name.trim().split(/\s+/)[0] : null

  // ── Which widgets this organisation can have, in the person's order ─────────────────────────────────────────────
  const available: Record<WidgetId, boolean> = {
    now: true,
    live: true,
    kpis: tiles.length > 0 || industryTiles.length > 0 || !trends,
    trend: chartTabs.length > 0 || !trends,
    pipeline: true,
    schedule: booking,
    loyalty: loyalty,
    workspaces: apps.length > 0,
    tasks: true,
    activity: true,
  }
  const widgetName: Record<WidgetId, string> = {
    now: t('dashboard.widgets.now', 'Clock & weather'),
    live: t('dashboard.widgets.live', 'Live now'),
    kpis: t('dashboard.widgets.kpis', 'Key figures'),
    trend: t('dashboard.widgets.trend', 'Main chart'),
    pipeline: t('dashboard.widgets.pipeline', 'Pipeline'),
    schedule: t('dashboard.widgets.schedule', "Today's schedule"),
    loyalty: t('dashboard.widgets.loyalty', 'Members & tiers'),
    workspaces: t('dashboard.widgets.workspaces', 'Your workspaces'),
    tasks: t('dashboard.widgets.tasks', 'Follow-ups due'),
    activity: t('dashboard.widgets.activity', 'Recent activity'),
  }
  const span: Record<WidgetId, string> = {
    now: 'col-span-12 xl:col-span-8',
    live: 'col-span-12 md:col-span-6 xl:col-span-4',
    kpis: 'col-span-12',
    trend: 'col-span-12 xl:col-span-8',
    pipeline: 'col-span-12 md:col-span-6 xl:col-span-4',
    schedule: 'col-span-12 xl:col-span-8',
    loyalty: 'col-span-12 md:col-span-6 xl:col-span-4',
    workspaces: 'col-span-12',
    tasks: 'col-span-12 md:col-span-6 xl:col-span-4',
    activity: 'col-span-12 xl:col-span-8',
  }
  const shown = layout.order.filter(id => available[id] && !layout.hidden.includes(id))
  const previousLabel = t('dashboard.kpi.was', 'was {{value}}', { value: '{{value}}' })

  const render = (id: WidgetId, i: number) => {
    switch (id) {
      case 'now':
        return <NowHero pulse={pulse} name={name} canSetPlace={isManager} index={i} />
      case 'live':
        return <LiveCard rows={liveRows} online={hasProduct('chat') ? (op.online_visitors ?? null) : null} index={i} />
      case 'kpis':
        return (
          <section className="space-y-3" aria-label={widgetName.kpis}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[10px] font-bold uppercase tracking-wider text-t-muted">{t('dashboard.kpi.title', 'The last {{days}} days', { days: period })}</h2>
              <div className="flex rounded-full border border-dark-border bg-dark-surface p-0.5" role="group" aria-label={t('dashboard.period.label', 'Period')}>
                {PERIODS.map(p => (
                  <button key={p} type="button" onClick={() => setPeriod(p)} aria-pressed={period === p}
                    className={`rounded-full px-3 py-1 text-[11px] font-semibold tabular-nums transition-colors ${period === p ? 'bg-primary-600 text-on-primary' : 'text-t-secondary hover:text-white'}`}>
                    {t('dashboard.period.days', '{{count}} d', { count: p })}
                  </button>
                ))}
              </div>
            </div>
            {industryTiles.length > 0 && (
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {industryTiles.slice(0, 4).map((tile, n) => (
                  <StatTile key={tile.key} index={i + n}
                    label={vocab(tile.label) ?? t(`dashboard.kpis.${tile.key}`, tile.label)}
                    value={formatTileValue(tile, currency)} sub={tile.delta ?? null}
                    icon={KPI_ICONS[tile.icon] ?? Activity} hue={KPI_HUE[tile.accent] ?? DASH_HUE.indigo} to={tile.link ?? null} />
                ))}
              </div>
            )}
            {tiles.length > 0 ? (
              // Seven figures fill two rows of four, the first (revenue) twice as wide; six or fewer sit in one row.
              <div className={`grid grid-cols-2 gap-3 md:grid-cols-3 ${XL_COLS[tiles.length] ?? 'xl:grid-cols-4'}`}>
                {tiles.map((spec, n) => (
                  <div key={spec.key} className={`min-w-0 ${n === 0 && tiles.length === 7 ? 'col-span-2' : ''}`}>
                    <KpiTile spec={spec} index={i + n + 1} previousLabel={previousLabel} wide={n === 0 && tiles.length === 7} />
                  </div>
                ))}
              </div>
            ) : !trends ? (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" aria-hidden="true">
                {Array.from({ length: 6 }, (_, n) => <div key={n} className="dash-shimmer h-[134px] rounded-2xl border border-dark-border bg-dark-surface" />)}
              </div>
            ) : null}
          </section>
        )
      case 'trend':
        return (
          <Card index={i} title={t('dashboard.chart.title', 'Day by day')} icon={BarChart3} hue={DASH_HUE.blue}
            sub={trends ? t('dashboard.chart.sub', '{{from}} – {{to}}', { from: dayLabel(trends.dates[0] ?? ''), to: dayLabel(trends.dates[trends.dates.length - 1] ?? '') }) : ' '}
            bodyClassName="p-4 sm:p-5">
            {activeTab && trends ? (
              <>
                {chartTabs.length > 1 && (
                  <div className="-mx-1 mb-3 flex gap-1 overflow-x-auto px-1 pb-1" role="tablist" aria-label={t('dashboard.chart.title', 'Day by day')}>
                    {chartTabs.map(tab => (
                      <button key={tab.key} type="button" role="tab" aria-selected={activeTab?.key === tab.key} onClick={() => setChartTab(tab.key)}
                        className={`shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-colors ${activeTab?.key === tab.key ? 'bg-dark-surface2 text-white shadow-sm' : 'text-t-muted hover:bg-dark-surface2 hover:text-white'}`}>
                        {tab.label}
                      </button>
                    ))}
                  </div>
                )}
                <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1">
                  {activeTab.series.map(s => {
                    const sum = s.values.reduce((a, b) => a + b, 0)
                    return (
                      <span key={s.key} className="flex items-center gap-1.5 text-[11px] text-t-secondary">
                        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: fill(s.hue) }} aria-hidden="true" />
                        {s.label} <span className="font-semibold tabular-nums" style={{ color: ink(s.hue) }}>{activeTab.format(sum)}</span>
                      </span>
                    )
                  })}
                </div>
                <TrendChart key={`${activeTab.key}-${period}`} dates={trends.dates} series={activeTab.series} format={activeTab.format} dayLabel={dayLabel} stack={activeTab.stack} emptyText={t('dashboard.chart.empty', 'Nothing in these days yet.')} />
              </>
            ) : (
              <div className="dash-shimmer h-[260px] rounded-xl bg-dark-surface2" aria-hidden="true" />
            )}
          </Card>
        )
      case 'pipeline':
        return <PipelineCard slices={pipelineSlices} money={fmtMoney} index={i} />
      case 'schedule':
        return <ScheduleCard groups={scheduleGroups} day={dayLabel(today, true)} index={i} />
      case 'loyalty':
        return (
          <LoyaltyCard index={i}
            tiers={(Array.isArray(kpis?.tier_distribution) ? kpis.tier_distribution : []).map((row: { id: number; tier: string; color: string | null; count: number }) => ({ key: String(row.id), name: row.tier, count: Number(row.count) || 0, colour: row.color || null }))}
            birthdays={(birthdays?.items ?? []).map((b: { id: string | number; name: string; tier: string | null }) => ({ id: b.id, name: b.name, tier: b.tier }))}
            climbers={(climbers?.items ?? []).map((c: { id: number; name: string; next_tier: string; points_needed: number; progress_pct?: number }) => ({ id: c.id, name: c.name, next: c.next_tier, needed: c.points_needed, progress: c.progress_pct ?? 0 }))} />
        )
      case 'workspaces':
        return <WorkspacesCard apps={apps} index={i} />
      case 'tasks':
        return (
          <TasksCard index={i} tasks={(Array.isArray(tasksDue) ? tasksDue : []).map((x: { id: number; title: string; due_date: string; is_overdue: boolean; priority: string }) => ({
            id: x.id, title: x.title, overdue: !!x.is_overdue, priority: x.priority, due: x.due_date === today ? t('dashboard.tasks.today', 'Today') : dayLabel(x.due_date ?? ''),
          }))} />
        )
      case 'activity':
        return (
          <ActivityCard index={i} rows={(Array.isArray(recentActivity) ? recentActivity : []).map((act: { type: string; title?: string; description?: string; subtitle?: string; created_at?: string }, n: number): ActivityRow => {
            const meta = ACTIVITY[act.type] ?? ACTIVITY.note
            const when = act.created_at ? new Date(act.created_at) : null
            return {
              key: `${n}`, title: act.title || act.description || '—', subtitle: act.subtitle ?? null, icon: meta.icon, hue: meta.hue,
              when: when ? when.toLocaleString(lang, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: pulse?.timezone }) : '',
            }
          })} />
        )
    }
  }

  return (
    <div className="dash space-y-4">
      {/* Toolbar: what this page is, customise, and the two desk actions */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-t-muted">
          <LayoutGrid size={12} aria-hidden="true" />{t('dashboard.title', 'Dashboard')}
          <span className="dash-live-dot h-1.5 w-1.5 rounded-full" style={{ background: fill(DASH_HUE.emerald) }} aria-hidden="true" />
          <span className="font-semibold normal-case tracking-normal">{t('dashboard.live_label', 'Live')}</span>
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setCustomizing(v => !v)} aria-expanded={customizing}
            className="flex items-center gap-2 rounded-lg border border-dark-border bg-dark-surface px-3 py-2 text-sm font-semibold text-hx-e0e0e0 transition-colors hover:bg-dark-surface2">
            <SlidersHorizontal size={15} aria-hidden="true" /> <span className="hidden sm:inline">{t('dashboard.customize.button', 'Customize')}</span><span className="sr-only sm:hidden">{t('dashboard.customize.button', 'Customize')}</span>
          </button>
          <button type="button" onClick={() => navigate('/scan')}
            className="flex items-center gap-2 rounded-lg border border-dark-border bg-dark-surface px-3 py-2 text-sm font-semibold text-hx-e0e0e0 transition-colors hover:bg-dark-surface2">
            <Scan size={15} aria-hidden="true" /> <span className="hidden sm:inline">{t('dashboard.actions.scan_card', 'Scan Card')}</span><span className="sr-only sm:hidden">{t('dashboard.actions.scan_card', 'Scan Card')}</span>
          </button>
          <button type="button" onClick={() => navigate('/notifications')}
            className="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-700">
            <Bell size={15} aria-hidden="true" /> {t('dashboard.actions.send_campaign', 'Send Campaign')}
          </button>
        </div>
      </div>

      {customizing && (
        <CustomizePanel
          ids={layout.order.filter(id => available[id])}
          hidden={layout.hidden}
          names={widgetName}
          onToggle={id => setLayout(toggleWidget(layout, id))}
          onMove={(id, by) => setLayout(moveWidget(layout, id, by, layout.order.filter(w => available[w])))}
          onReset={() => setLayout(DEFAULT_LAYOUT)}
          onClose={() => setCustomizing(false)}
        />
      )}

      <div className="grid grid-flow-dense grid-cols-12 gap-4">
        {shown.map((id, i) => (
          <div key={id} className={`${span[id]} min-w-0`} data-widget={id}>{render(id, i)}</div>
        ))}
      </div>
      {shown.length === 0 && (
        <p className="py-16 text-center text-sm text-t-muted">{t('dashboard.customize.none', 'Every widget is hidden. Customize brings them back.')}</p>
      )}
    </div>
  )
}

/** Show, hide and order the widgets; kept in this browser for this person. */
function CustomizePanel({ ids, hidden, names, onToggle, onMove, onReset, onClose }: {
  ids: WidgetId[]
  hidden: WidgetId[]
  names: Record<WidgetId, string>
  onToggle: (id: WidgetId) => void
  onMove: (id: WidgetId, by: -1 | 1) => void
  onReset: () => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])
  return (
    <div ref={ref} className="dash-pop rounded-2xl border border-dark-border bg-dark-surface p-4" role="region" aria-label={t('dashboard.customize.title', 'Customize your dashboard')}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-white">{t('dashboard.customize.title', 'Customize your dashboard')}</p>
          <p className="text-[11px] text-t-muted">{t('dashboard.customize.sub', 'Show, hide and order the widgets. Kept in this browser for you.')}</p>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={onReset} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-t-secondary hover:bg-dark-surface2 hover:text-white">
            <RotateCcw size={12} aria-hidden="true" /> {t('dashboard.customize.reset', 'Reset')}
          </button>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-t-secondary hover:bg-dark-surface2 hover:text-white" aria-label={t('dashboard.customize.close', 'Close')}>
            <X size={15} aria-hidden="true" />
          </button>
        </div>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {ids.map((id, i) => {
          const off = hidden.includes(id)
          return (
            <li key={id} className={`flex items-center gap-1 rounded-xl border border-dark-border px-2 py-1.5 ${off ? 'opacity-60' : 'bg-dark-surface2'}`}>
              <button type="button" onClick={() => onToggle(id)} aria-pressed={!off}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-1 text-left text-xs font-semibold text-white">
                {off ? <EyeOff size={13} className="shrink-0 text-t-muted" aria-hidden="true" /> : <Eye size={13} className="shrink-0 text-primary-400" aria-hidden="true" />}
                <span className="truncate">{names[id]}</span>
              </button>
              <button type="button" onClick={() => onMove(id, -1)} disabled={i === 0} className="rounded-md p-1 text-t-muted hover:text-white disabled:opacity-30"
                aria-label={t('dashboard.customize.up', 'Move {{name}} up', { name: names[id] })}><ArrowUp size={12} aria-hidden="true" /></button>
              <button type="button" onClick={() => onMove(id, 1)} disabled={i === ids.length - 1} className="rounded-md p-1 text-t-muted hover:text-white disabled:opacity-30"
                aria-label={t('dashboard.customize.down', 'Move {{name}} down', { name: names[id] })}><ArrowDown size={12} aria-hidden="true" /></button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
