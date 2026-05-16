import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import { Search, ChevronLeft, ChevronRight, RefreshCw, Eye, Calendar, DollarSign, Users, TrendingUp, XCircle, AlertTriangle, Clock, Activity, FileText, Wifi, List as ListIcon, CalendarRange, LogIn, LogOut, Hotel, CalendarPlus, Download, Trash2, CheckCheck, X as XIcon, LayoutDashboard, Globe, AlarmClock, CreditCard, Mail, Phone } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { ViewToggle } from '../components/ViewToggle'
import { DailyOpsBar } from '../components/DailyOpsBar'
import { money } from '../lib/money'

/* ── Helpers ─────────────────────────────────────────────────────── */

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—'
  try {
    const date = new Date(d)
    if (isNaN(date.getTime())) return d
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch { return d }
}

function fmtDateShort(d: string | null | undefined): string {
  if (!d) return '—'
  try {
    const date = new Date(d)
    if (isNaN(date.getTime())) return d
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  } catch { return d }
}

function derivePaymentStatus(b: any): string {
  if (b.payment_status && b.payment_status !== 'unknown') return b.payment_status
  const total = Number(b.price_total || 0)
  const paid = Number(b.price_paid || 0)
  if (total <= 0) return 'open'
  if (paid >= total) return 'paid'
  if (paid > 0) return 'pending'
  return 'open'
}

/* ── Shared constants ────────────────────────────────────────────── */

const STATUS_PILL: Record<string, string> = {
  new:           'bg-blue-500/15 text-blue-400 border border-blue-500/20',
  confirmed:     'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20',
  cancelled:     'bg-red-500/15 text-red-400 border border-red-500/20',
  'checked-in':  'bg-green-500/15 text-green-400 border border-green-500/20',
  'checked-out': 'bg-gray-500/15 text-gray-400 border border-gray-500/20',
  'no-show':     'bg-orange-500/15 text-orange-400 border border-orange-500/20',
}

const PAY_PILL: Record<string, string> = {
  paid:            'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20',
  open:            'bg-red-500/15 text-red-400 border border-red-500/20',
  pending:         'bg-red-500/15 text-red-400 border border-red-500/20',
  invoice_waiting: 'bg-amber-500/15 text-amber-400 border border-amber-500/20',
  channel_managed: 'bg-teal-500/15 text-teal-400 border border-teal-500/20',
}

const CHART_COLORS = [
  'var(--color-primary, #74c895)',
  'var(--color-accent, #f0b56f)',
  '#5ab4b2', '#e4846f', '#d5c06a', '#81a6e8',
]

function payLabel(s: string) {
  return s === 'invoice_waiting' ? 'Invoice waiting' : s === 'channel_managed' ? 'Channel managed' : s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ')
}

/* ── Reusable card wrapper ───────────────────────────────────────── */

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-dark-surface rounded-xl border border-dark-border ${className}`}>
      {children}
    </div>
  )
}

/* ── SVG Donut Chart ─────────────────────────────────────────────── */

function DonutChart({ data }: { data: { label: string; key: string; count: number; total: number }[] }) {
  const [hovered, setHovered] = useState<number | null>(null)
  const total = data.reduce((s, d) => s + d.count, 0)
  if (!total) return <div className="text-gray-600 text-sm text-center py-10">No data</div>

  const radius = 68, stroke = 16, circumference = 2 * Math.PI * radius
  let offset = 0
  const active = hovered !== null ? data[hovered] : data.reduce((a, b) => b.count > a.count ? b : a, data[0])

  return (
    <div className="flex items-center gap-8">
      <div className="relative flex-shrink-0">
        <svg width={172} height={172} viewBox="0 0 172 172">
          <circle cx={86} cy={86} r={radius} fill="none" stroke="rgba(34,51,45,0.6)" strokeWidth={stroke} />
          {data.map((d, i) => {
            const pct = d.count / total, dash = pct * circumference, cur = offset
            offset += dash
            return (
              <circle key={d.key} cx={86} cy={86} r={radius} fill="none"
                stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={stroke} strokeLinecap="round"
                strokeDasharray={`${dash} ${circumference - dash}`} strokeDashoffset={-cur}
                transform="rotate(-90 86 86)" className="transition-opacity duration-200"
                opacity={hovered !== null && hovered !== i ? 0.25 : 1}
                onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}
                style={{ cursor: 'pointer' }}
              />
            )
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-3xl font-bold text-white">{active.count}</span>
          <span className="text-[11px] text-gray-400 mt-0.5">{active.label}</span>
        </div>
      </div>
      <div className="space-y-2.5 min-w-0">
        {data.map((d, i) => (
          <div key={d.key} className="flex items-center gap-2.5 text-xs cursor-pointer group"
            onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}>
            <div className="w-3 h-3 rounded-full flex-shrink-0 ring-2 ring-white/10" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
            <span className="text-gray-400 group-hover:text-white transition-colors truncate">{d.label}</span>
            <span className="text-white font-semibold ml-auto tabular-nums">{d.count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Bar Chart ───────────────────────────────────────────────────── */

function BarChart({ data }: { data: { label: string; count: number }[] }) {
  const [hovered, setHovered] = useState<number | null>(null)
  const max = Math.max(1, ...data.map(d => d.count))

  return (
    <div>
      <div className="rounded-xl p-2.5 mb-3" style={{ background: 'rgba(22,40,35,0.5)', border: '1px solid rgba(255,255,255,0.04)' }}>
        <span className="text-[11px] text-gray-400">
          {hovered !== null && data[hovered] ? <>{data[hovered].label}: <span className="text-white font-semibold">{data[hovered].count} arrivals</span></> : 'Hover for details'}
        </span>
      </div>
      <div className="flex items-end gap-[3px] h-[110px]">
        {data.map((d, i) => {
          const isPeak = d.count === max && d.count > 0
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1.5 group"
              onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}>
              <div className="w-full rounded-t-lg transition-all duration-200"
                style={{
                  height: `${Math.max(d.count > 0 ? 6 : 0, (d.count / max) * 88)}px`,
                  background: isPeak
                    ? 'linear-gradient(180deg, #f0b56f, #d98f45)'
                    : hovered === i
                      ? 'linear-gradient(180deg, #74c895cc, #5ab4b2cc)'
                      : 'linear-gradient(180deg, rgba(90,180,178,0.5), rgba(90,180,178,0.3))',
                  boxShadow: isPeak ? '0 8px 18px rgba(217,143,69,0.25)' : hovered === i ? '0 6px 14px rgba(90,180,178,0.2)' : 'none',
                }}
              />
              <span className="text-[8px] text-gray-600 group-hover:text-gray-400 transition-colors truncate w-full text-center">{d.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Horizontal Bars ─────────────────────────────────────────────── */

function HorizontalBars({ data }: { data: { unit_name: string; revenue: number; balance: number; bookings: number; avg_nights: number }[] }) {
  const maxRev = Math.max(1, ...data.map(d => d.revenue))
  if (!data.length) return <div className="text-gray-600 text-sm text-center py-10">No data</div>

  return (
    <div className="space-y-4">
      {data.map((d, i) => (
        <div key={i} className="group">
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-gray-300 font-medium truncate">{d.unit_name || 'Unknown'}</span>
            <span className="text-gray-500 flex-shrink-0 ml-3 tabular-nums">
              {money(d.revenue)} · {d.bookings} bookings · {d.avg_nights}n
            </span>
          </div>
          <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'rgba(34,51,45,0.6)' }}>
            <div className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${(d.revenue / maxRev) * 100}%`,
                background: `linear-gradient(90deg, ${CHART_COLORS[i % CHART_COLORS.length]}cc, ${CHART_COLORS[i % CHART_COLORS.length]})`,
                boxShadow: `0 0 12px ${CHART_COLORS[i % CHART_COLORS.length]}33`,
              }}
            />
          </div>
          {d.balance > 0 && <div className="text-[10px] text-red-400/70 mt-1">{money(d.balance)} outstanding</div>}
        </div>
      ))}
    </div>
  )
}

/* ── Channel List ────────────────────────────────────────────────── */

function ChannelList({ data }: { data: { label: string; count: number }[] }) {
  const total = Math.max(1, data.reduce((s, d) => s + d.count, 0))
  if (!data.length) return <div className="text-gray-600 text-sm text-center py-10">No data</div>

  return (
    <div className="space-y-3.5">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full flex-shrink-0 ring-2 ring-white/10" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
          <span className="text-xs text-gray-400 flex-1 truncate">{d.label}</span>
          <span className="text-xs text-white font-semibold tabular-nums">{d.count}</span>
          <div className="w-24 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(34,51,45,0.6)' }}>
            <div className="h-full rounded-full" style={{
              width: `${(d.count / total) * 100}%`,
              background: `linear-gradient(90deg, ${CHART_COLORS[i % CHART_COLORS.length]}aa, ${CHART_COLORS[i % CHART_COLORS.length]})`,
            }} />
          </div>
        </div>
      ))}
    </div>
  )
}

/* ── Main Component ──────────────────────────────────────────────── */

export function Bookings() {
  const { t } = useTranslation()

  // Tab navigation — Overview / All / Website / Arrivals / Unpaid.
  // Persisted in the URL via ?tab= so deep-links and refresh survive.
  const [sp, setSp] = useSearchParams()
  type TabKey = 'overview' | 'all' | 'website' | 'arrivals' | 'unpaid'
  const tab: TabKey = (['overview', 'all', 'website', 'arrivals', 'unpaid'].includes(sp.get('tab') ?? '')
    ? (sp.get('tab') as TabKey)
    : 'overview')
  const setTab = (next: TabKey) => {
    const params = new URLSearchParams(sp)
    params.set('tab', next)
    setSp(params, { replace: true })
  }

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [paymentStatus, setPaymentStatus] = useState('')
  const [unitId, setUnitId] = useState('')
  const [page, setPage] = useState(1)
  const [syncing, setSyncing] = useState(false)
  const [period, setPeriod] = useState('month')
  // Daily-ops drilldown: clicking a tile in the DailyOpsBar narrows the
  // list below to that segment. Empty string = no daily filter applied.
  const [dailyFocus, setDailyFocus] = useState<'' | 'arrivals' | 'in_house' | 'departures'>('')
  // Bulk selection — Set<id>. Cleared whenever filters change so a
  // selection can't accidentally apply to rows the user can no longer see.
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)

  // Period → from/to date range. Same shape the backend dashboard uses,
  // mirrored here so the Reservations table stays in sync with the
  // KPI cards above (previously the table ignored period and stayed on
  // "all rows" no matter what the user selected).
  const periodRange = useMemo(() => {
    const today = new Date()
    const fmt = (d: Date) => d.toISOString().slice(0, 10)
    const from = new Date(today)
    if (period === 'week')      from.setDate(today.getDate() - 7)
    else if (period === 'year') from.setFullYear(today.getFullYear() - 1)
    else                        from.setMonth(today.getMonth() - 1)
    // 'to' extends 90 days forward so future arrivals stay visible — the
    // table is keyed on arrival_date and most useful when it shows what's
    // *coming up* alongside what just passed.
    const to = new Date(today)
    to.setDate(today.getDate() + 90)
    return { from: fmt(from), to: fmt(to) }
  }, [period])

  const params: any = { page, per_page: 25, from: periodRange.from, to: periodRange.to }
  if (search) params.search = search
  if (status) params.status = status
  // Tab-level filter overrides the dropdown when the tab itself implies
  // a payment state — keeps the tab's purpose stable even if the user
  // hasn't touched the dropdown.
  const effectivePayment = tab === 'unpaid' ? 'open' : paymentStatus
  if (effectivePayment) params.payment_status = effectivePayment
  if (tab === 'website') params.channel = 'Website'
  if (unitId) params.unit_id = unitId

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['bookings-engine', params, tab],
    queryFn: () => api.get('/v1/admin/bookings', { params }).then(r => r.data),
    // Only the All / Website / Unpaid tabs use the paginated list.
    enabled: tab === 'all' || tab === 'website' || tab === 'unpaid',
  })

  const dashParams: any = { period }
  if (unitId) dashParams.unit_id = unitId
  const { data: dashboard } = useQuery({
    queryKey: ['bookings-dashboard', dashParams],
    queryFn: () => api.get('/v1/admin/bookings/dashboard', { params: dashParams }).then(r => r.data),
    staleTime: 60_000,
  })

  // Front-of-house "today" snapshot — refreshes every 2 min so reception
  // sees check-in / check-out updates without a manual reload.
  const { data: today } = useQuery({
    queryKey: ['bookings-today'],
    queryFn: () => api.get('/v1/admin/bookings/today').then(r => r.data),
    staleTime: 120_000,
    refetchInterval: 120_000,
  })

  const bookings = data?.data ?? []
  const lastPage = data?.last_page ?? 1
  const units = data?.filters?.units ?? dashboard?.filters?.units ?? []

  const allOnPageSelected = bookings.length > 0 && bookings.every((b: any) => selected.has(b.id))
  const togglePageSelection = () => {
    setSelected(prev => {
      const next = new Set(prev)
      if (allOnPageSelected) bookings.forEach((b: any) => next.delete(b.id))
      else                   bookings.forEach((b: any) => next.add(b.id))
      return next
    })
  }
  const toggleRow = (id: number) => setSelected(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next
  })

  const runBulk = async (action: string, value?: string, confirmMsg?: string) => {
    if (selected.size === 0) return
    if (confirmMsg && !window.confirm(confirmMsg)) return
    setBulkBusy(true)
    try {
      const { data: res } = await api.post('/v1/admin/bookings/bulk', {
        ids: Array.from(selected), action, value,
      })
      toast.success(res.message || 'Updated')
      setSelected(new Set())
      refetch()
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Bulk action failed')
    } finally { setBulkBusy(false) }
  }

  const exportCsv = async () => {
    setBulkBusy(true)
    try {
      // Selection wins; otherwise we send the live filter state so
      // "Export all" matches what the user sees on screen.
      const body: any = selected.size > 0
        ? { ids: Array.from(selected) }
        : { search, status, payment_status: paymentStatus, unit_id: unitId, from: periodRange.from, to: periodRange.to }
      const res = await api.post('/v1/admin/bookings/export', body, { responseType: 'blob' })
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `reservations-${new Date().toISOString().slice(0,10)}.csv`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
      toast.success('Export downloaded')
    } catch {
      toast.error('Export failed')
    } finally { setBulkBusy(false) }
  }

  const handleSync = async () => {
    setSyncing(true)
    try {
      const { data: res } = await api.post('/v1/admin/bookings/sync')
      toast.success(res.message || 'Sync complete')
      refetch()
    } catch {
      toast.error('Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  const kpis = dashboard?.kpis ?? []
  const kpiMeta: Record<string, { icon: any; color: string; bg: string }> = {
    total_bookings:  { icon: Calendar,      color: 'text-blue-400',    bg: 'bg-blue-500/10' },
    revenue:         { icon: DollarSign,    color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    confirmed:       { icon: TrendingUp,    color: 'text-green-400',   bg: 'bg-green-500/10' },
    cancelled:       { icon: XCircle,       color: 'text-red-400',     bg: 'bg-red-500/10' },
    pending_payment: { icon: AlertTriangle, color: 'text-amber-400',   bg: 'bg-amber-500/10' },
    avg_stay:        { icon: Users,         color: 'text-purple-400',  bg: 'bg-purple-500/10' },
    balance_due:     { icon: Clock,         color: 'text-orange-400',  bg: 'bg-orange-500/10' },
  }

  const selectClass = 'bg-[#1e1e1e] border border-dark-border rounded-lg text-sm text-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none cursor-pointer'
  // Native <option> defaults to OS-light styling; force dark so the open
  // dropdown matches the rest of the admin and the text stays readable.
  const selectStyle = { colorScheme: 'dark' as const }
  const optStyle    = { background: '#0f1c18', color: '#fff' }

  // Hide analytics section entirely when there is no meaningful data to plot
  const a = dashboard?.analytics
  const hasAnalytics = !!a && (
    (a.paymentMix?.length ?? 0) > 0 ||
    (a.arrivalPace?.total ?? 0) > 0 ||
    (a.unitPerformance?.length ?? 0) > 0 ||
    (a.channelMix?.length ?? 0) > 0
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{t('bookings.title', 'Reservations')}</h1>
          <p className="text-sm text-t-secondary mt-0.5">{t('bookings.subtitle', 'PMS reservations synced from your booking channels')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportCsv} disabled={bulkBusy}
            className="flex items-center gap-2 bg-dark-surface border border-dark-border text-[#e0e0e0] px-4 py-2 rounded-lg text-sm font-semibold hover:bg-dark-surface2 transition-colors disabled:opacity-50"
            title={t('bookings.actions.export_csv_tooltip', 'Download CSV of the current filtered list (or selected rows)')}>
            <Download size={16} />
            {t('bookings.actions.export_csv', 'Export CSV')}
          </button>
          <Link to="/bookings/submissions"
            className="flex items-center gap-2 bg-dark-surface border border-dark-border text-[#e0e0e0] px-4 py-2 rounded-lg text-sm font-semibold hover:bg-dark-surface2 transition-colors">
            <FileText size={16} />
            {t('bookings.actions.submission_log', 'Submission log')}
          </Link>
          <button onClick={handleSync} disabled={syncing}
            className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-primary-700 disabled:opacity-50 transition-colors">
            <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
            {syncing ? t('bookings.actions.syncing', 'Syncing…') : t('bookings.actions.sync_pms', 'Sync PMS')}
          </button>
        </div>
      </div>

      {/* List ↔ Timeline view toggle. */}
      <ViewToggle options={[
        { to: '/bookings',          label: t('bookings.view.list',     'List'),     icon: <ListIcon size={12} className="-ml-0.5" /> },
        { to: '/bookings/calendar', label: t('bookings.view.timeline', 'Timeline'), icon: <CalendarRange size={12} className="-ml-0.5" /> },
      ]} />

      {/* Tab navigation — Overview / All / Website / Arrivals / Unpaid.
          Counts pull from the dashboard payload so the badges reflect
          live data without extra queries. */}
      {(() => {
        const totalCount    = dashboard?.kpis?.find((k: any) => k.key === 'total_bookings')?.value ?? null
        const websiteCount  = dashboard?.websiteBookings?.length ?? null
        const arrivalsCount = dashboard?.arrivals?.length ?? null
        const unpaidCount   = dashboard?.kpis?.find((k: any) => k.key === 'pending_payment')?.value ?? null
        const tabDefs: { key: TabKey; label: string; icon: any; count: number | null; tone: string }[] = [
          { key: 'overview', label: t('bookings.tabs.overview', 'Overview'), icon: <LayoutDashboard size={14} />, count: null,         tone: 'text-primary-400' },
          { key: 'all',      label: t('bookings.tabs.all',      'All'),      icon: <ListIcon size={14} />,        count: totalCount,    tone: 'text-blue-400' },
          { key: 'website',  label: t('bookings.tabs.website',  'Website'),  icon: <Globe size={14} />,           count: websiteCount,  tone: 'text-cyan-400' },
          { key: 'arrivals', label: t('bookings.tabs.arrivals', 'Arrivals'), icon: <AlarmClock size={14} />,      count: arrivalsCount, tone: 'text-emerald-400' },
          { key: 'unpaid',   label: t('bookings.tabs.unpaid',   'Unpaid'),   icon: <CreditCard size={14} />,      count: unpaidCount,   tone: 'text-amber-400' },
        ]
        return (
          <div className="flex items-center gap-1.5 bg-dark-surface border border-dark-border rounded-xl p-1 overflow-x-auto">
            {tabDefs.map(td => {
              const active = tab === td.key
              return (
                <button key={td.key} onClick={() => { setTab(td.key); setPage(1) }}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${
                    active ? 'bg-primary-600 text-white shadow-sm' : 'text-t-secondary hover:text-white hover:bg-dark-surface2'
                  }`}>
                  <span className={active ? '' : td.tone}>{td.icon}</span>
                  {td.label}
                  {td.count != null && td.count > 0 && (
                    <span className={`inline-flex items-center justify-center min-w-[20px] h-[18px] px-1.5 rounded-full text-[10px] font-bold tabular-nums ${
                      active ? 'bg-white/20 text-white' : 'bg-dark-surface2 text-t-secondary'
                    }`}>{td.count > 999 ? `${Math.round(td.count / 100) / 10}k` : td.count}</span>
                  )}
                </button>
              )
            })}
          </div>
        )
      })()}

      {/* ════════════════ OVERVIEW TAB ════════════════ */}
      {tab === 'overview' && <>

      {/* Today — front-of-house snapshot. Distinct from the period KPIs
          below: this is the now-shift view of who's arriving / staying /
          leaving, plus a tomorrow preview so staff can pre-stage rooms. */}
      {today && (
        <DailyOpsBar
          title={t('bookings.today.label', 'Today')}
          hint={today.date}
          tiles={[
            { key: 'arrivals',      label: t('bookings.today.arrivals',   'Arrivals Today'),   value: today.arrivals_today?.count ?? 0,   sub: today.arrivals_today?.count   ? t('bookings.today.click_to_view',     'Click to view')        : t('bookings.today.no_check_ins',  'No check-ins'),       tone: 'emerald', icon: <LogIn size={12} />,        active: dailyFocus === 'arrivals',   onClick: () => setDailyFocus(dailyFocus === 'arrivals' ? '' : 'arrivals') },
            { key: 'in_house',      label: t('bookings.today.in_house',   'In-House'),         value: today.in_house?.count ?? 0,         sub: today.in_house?.count         ? t('bookings.today.currently_staying', 'Currently staying')    : t('bookings.today.no_guests',     'No guests on-site'),  tone: 'blue',    icon: <Hotel size={12} />,        active: dailyFocus === 'in_house',   onClick: () => setDailyFocus(dailyFocus === 'in_house' ? '' : 'in_house') },
            { key: 'departures',    label: t('bookings.today.departures', 'Departures Today'), value: today.departures_today?.count ?? 0, sub: today.departures_today?.count ? t('bookings.today.click_to_view',     'Click to view')        : t('bookings.today.no_check_outs', 'No check-outs'),      tone: 'orange',  icon: <LogOut size={12} />,       active: dailyFocus === 'departures', onClick: () => setDailyFocus(dailyFocus === 'departures' ? '' : 'departures') },
            { key: 'tomorrow',      label: t('bookings.today.tomorrow',   'Tomorrow'),         value: today.arrivals_tomorrow_count ?? 0, sub: t('bookings.today.arrivals_prestage', 'Arrivals — pre-stage rooms'),                                                                                                                tone: 'amber',   icon: <CalendarPlus size={12} /> },
          ]}
        />
      )}

      {/* Drilldown panel — clicking a tile expands the matching guest list.
          Inline rather than re-filtering the table below because the lists
          are short (≤25 each) and reception wants them at a glance. */}
      {today && dailyFocus && (
        <div className="rounded-2xl border border-white/[0.06] overflow-hidden"
          style={{ background: 'rgba(18,24,22,0.96)' }}>
          <div className="px-4 py-2 border-b border-white/[0.06] flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
              {dailyFocus === 'arrivals' ? t('bookings.today.arrivals', 'Arrivals Today')
                : dailyFocus === 'in_house' ? t('bookings.today.in_house_guests', 'In-House Guests')
                : t('bookings.today.departures', 'Departures Today')}
            </span>
            <button onClick={() => setDailyFocus('')} className="text-[10px] text-gray-500 hover:text-white">{t('bookings.today.close', 'Close')}</button>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {(dailyFocus === 'arrivals' ? today.arrivals_today?.guests
              : dailyFocus === 'in_house' ? today.in_house?.guests
              : today.departures_today?.guests)?.map((g: any) => (
              <Link key={g.id} to={`/bookings/${g.id}`}
                className="flex items-center justify-between px-4 py-2.5 hover:bg-white/[0.02] transition-colors text-sm">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-white font-semibold truncate">{g.guest_name || '—'}</span>
                  <span className="text-gray-500 text-xs truncate">{g.apartment_name || '—'}</span>
                  {g.adults != null && (
                    <span className="text-gray-600 text-xs">· {g.adults}A{g.children ? ` ${g.children}C` : ''}</span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-400">
                  <span>{fmtDateShort(g.arrival_date)} → {fmtDateShort(g.departure_date)}</span>
                  {g.payment_status && (
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${PAY_PILL[derivePaymentStatus(g)] || 'bg-gray-500/10 text-gray-400'}`}>
                      {payLabel(derivePaymentStatus(g))}
                    </span>
                  )}
                </div>
              </Link>
            ))}
            {!((dailyFocus === 'arrivals' ? today.arrivals_today?.guests
                : dailyFocus === 'in_house' ? today.in_house?.guests
                : today.departures_today?.guests)?.length) && (
              <div className="px-4 py-6 text-center text-xs text-gray-600">{t('bookings.today.empty_segment', 'No bookings in this segment.')}</div>
            )}
          </div>
        </div>
      )}

      {/* PMS deactivated banner */}
      {dashboard?.syncHealth && dashboard.syncHealth.pmsEnabled === false && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 flex items-center gap-3">
          <AlertTriangle size={18} className="text-amber-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-amber-200 font-medium">{t('bookings.pms_banner.deactivated', { name: dashboard.syncHealth.pmsName || t('bookings.pms_banner.pms_fallback', 'PMS'), defaultValue: '{{name}} integration is deactivated' })}</p>
            <p className="text-xs text-amber-200/70 mt-0.5">{t('bookings.pms_banner.deactivated_sub', { name: dashboard.syncHealth.pmsName || t('bookings.pms_banner.pms_fallback_long', 'the PMS'), defaultValue: 'Synced reservations are hidden while the integration is off. Your data in {{name}} is untouched.' })}</p>
          </div>
          <Link to="/settings" className="text-xs font-semibold text-amber-300 hover:text-amber-200 underline-offset-4 hover:underline whitespace-nowrap">{t('bookings.pms_banner.open_settings', 'Open settings →')}</Link>
        </div>
      )}

      {/* Period tabs + unit filter */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="inline-flex p-1 rounded-lg bg-dark-surface border border-dark-border">
          {(['week', 'month', 'year'] as const).map(p => (
            <button key={p} onClick={() => { setPeriod(p); setPage(1) }}
              className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors ${period === p
                ? 'bg-primary-600 text-white'
                : 'text-t-secondary hover:text-white'}`}>
              {t(`bookings.period.${p}`, p.charAt(0).toUpperCase() + p.slice(1))}
            </button>
          ))}
        </div>
        {units.length > 0 && (
          <select value={unitId} onChange={e => { setUnitId(e.target.value); setPage(1) }} className={selectClass} style={selectStyle}>
            <option value="" style={optStyle}>{t('bookings.all_units', 'All Units')}</option>
            {units.map((u: any) => <option key={u.id} value={u.id} style={optStyle}>{u.name}</option>)}
          </select>
        )}
        {dashboard?.scope && (
          <span className="text-xs text-[#636366] ml-auto">{dashboard.scope.label}: {dashboard.scope.from} — {dashboard.scope.to}</span>
        )}
      </div>

      {/* KPI Grid — clean, tight, no double-gradient */}
      {kpis.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {kpis.map((kpi: any) => {
            const meta = kpiMeta[kpi.key] || { icon: Activity, color: 'text-gray-400', bg: 'bg-gray-500/10' }
            const Icon = meta.icon
            return (
              <div key={kpi.key} className="bg-dark-surface rounded-xl border border-dark-border p-4 hover:border-white/10 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-[#636366] font-semibold uppercase tracking-wider truncate">{kpi.label}</span>
                  <div className={`p-1.5 rounded-lg ${meta.bg}`}>
                    <Icon size={12} className={meta.color} />
                  </div>
                </div>
                <div className="text-2xl font-bold text-white tabular-nums">{kpi.displayValue}</div>
              </div>
            )
          })}
        </div>
      )}

      {/* Analytics Charts — 2×2, only shown when there's data */}
      {hasAnalytics && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {(a!.paymentMix?.length ?? 0) > 0 && (
            <Card className="p-6">
              <h3 className="text-xs uppercase tracking-wider text-[#636366] font-bold mb-5">{t('bookings.charts.payment_mix', 'Payment Mix')}</h3>
              <DonutChart data={a!.paymentMix || []} />
            </Card>
          )}
          {(a!.arrivalPace?.total ?? 0) > 0 && (
            <Card className="p-6">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-xs uppercase tracking-wider text-[#636366] font-bold">{t('bookings.charts.arrival_pace', 'Arrival Pace')}</h3>
                <span className="text-xs text-[#636366] tabular-nums">{t('bookings.charts.arrival_pace_total', { count: a!.arrivalPace?.total ?? 0, defaultValue: '{{count}} total' })}</span>
              </div>
              <BarChart data={a!.arrivalPace?.days || []} />
            </Card>
          )}
          {(a!.unitPerformance?.length ?? 0) > 0 && (
            <Card className="p-6">
              <h3 className="text-xs uppercase tracking-wider text-[#636366] font-bold mb-5">{t('bookings.charts.unit_performance', 'Unit Performance')}</h3>
              <HorizontalBars data={a!.unitPerformance || []} />
            </Card>
          )}
          {(a!.channelMix?.length ?? 0) > 0 && (
            <Card className="p-6">
              <h3 className="text-xs uppercase tracking-wider text-[#636366] font-bold mb-5">{t('bookings.charts.channel_mix', 'Channel Mix')}</h3>
              <ChannelList data={a!.channelMix || []} />
            </Card>
          )}
        </div>
      )}

      {/* Bottom panels — 2 columns */}
      {dashboard && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Upcoming Arrivals — enriched row with channel + money. */}
          {(dashboard.arrivals?.length > 0) && (
            <Card className="p-5">
              <h3 className="text-xs uppercase tracking-wider text-[#636366] font-bold mb-4">{t('bookings.panels.upcoming_arrivals', 'Upcoming Arrivals')}</h3>
              <div className="space-y-2">
                {dashboard.arrivals.map((a: any) => {
                  const total = Number(a.price_total ?? 0)
                  const paid  = Number(a.price_paid ?? 0)
                  const balance = Math.max(0, total - paid)
                  return (
                    <Link key={a.id} to={`/bookings/${a.id}`}
                      className="flex items-center justify-between rounded-lg p-3 bg-[#1e1e1e] border border-dark-border hover:border-white/10 hover:bg-dark-surface2 transition-colors">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-white truncate">{a.guest_name || 'Unknown'}</span>
                          {a.channel_name && (
                            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/30">
                              {a.channel_name}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-[#636366] mt-0.5 flex items-center gap-2 flex-wrap">
                          <span className="truncate">{a.apartment_name || '—'}</span>
                          <span>· {a.adults}A{a.children > 0 ? ` ${a.children}C` : ''}</span>
                          <span>· {fmtDateShort(a.arrival_date)} → {fmtDateShort(a.departure_date)}</span>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-3">
                        {total > 0 && (
                          <div className="text-xs tabular-nums">
                            <span className="text-emerald-400 font-semibold">{money(paid)}</span>
                            <span className="text-[#636366]"> / </span>
                            <span className={balance > 0 ? 'text-red-400' : 'text-[#636366]'}>{money(total)}</span>
                          </div>
                        )}
                        {a.payment_status && (
                          <span className={`inline-block mt-1 text-[9px] px-1.5 py-0.5 rounded-full font-bold ${PAY_PILL[a.payment_status] || 'bg-gray-500/15 text-gray-400 border border-gray-500/20'}`}>
                            {payLabel(a.payment_status)}
                          </span>
                        )}
                      </div>
                    </Link>
                  )
                })}
              </div>
            </Card>
          )}

          {/* Recent Unpaid */}
          {(dashboard.recentUnpaidBookings?.length > 0) && (
            <Card className="p-5">
              <h3 className="text-xs uppercase tracking-wider text-[#636366] font-bold mb-4">{t('bookings.panels.recent_unpaid', 'Recent Unpaid')}</h3>
              <div className="space-y-2">
                {dashboard.recentUnpaidBookings.map((b: any) => (
                  <Link key={b.id} to={`/bookings/${b.id}`}
                    className="flex items-center justify-between rounded-lg p-3 bg-[#1e1e1e] border border-dark-border hover:border-white/10 hover:bg-dark-surface2 transition-colors">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white truncate">{b.guest_name || '—'}</div>
                      <div className="text-xs text-[#636366]">{b.apartment_name || '—'} · {fmtDateShort(b.arrival_date)} → {fmtDateShort(b.departure_date)}</div>
                    </div>
                    <div className="text-right flex-shrink-0 ml-3 tabular-nums">
                      <div className="text-xs text-emerald-400 font-semibold">{money(b.price_paid || 0)}</div>
                      <div className="text-xs text-red-400">/ {money(b.price_total || 0)}</div>
                    </div>
                  </Link>
                ))}
              </div>
            </Card>
          )}

          {/* Recent Submissions panel removed — the "Website Reservations"
              dedicated table further down now carries the same info in a
              richer, scannable format. */}

          {/* Sync Health */}
          {dashboard.syncHealth && (
            <Card className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs uppercase tracking-wider text-[#636366] font-bold">{t('bookings.panels.sync_health', 'Sync Health')}</h3>
                <span className={`flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full ${dashboard.syncHealth.pmsEnabled
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                  : 'bg-amber-500/15 text-amber-400 border border-amber-500/20'}`}>
                  <Wifi size={10} />
                  {dashboard.syncHealth.pmsEnabled ? t('bookings.panels.connected', 'CONNECTED') : t('bookings.panels.offline', 'OFFLINE')}
                </span>
              </div>
              <div className="space-y-3">
                {dashboard.syncHealth.pmsName && (
                  <div className="flex justify-between items-center pb-3 border-b border-dark-border">
                    <span className="text-sm text-t-secondary">{t('bookings.panels.provider', 'Provider')}</span>
                    <span className="text-sm text-white font-medium">{dashboard.syncHealth.pmsName}</span>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-sm text-t-secondary">{t('bookings.panels.mirrored_bookings', 'Mirrored Bookings')}</span>
                  <span className="text-lg font-bold text-white tabular-nums">{dashboard.syncHealth.mirroredBookingCount}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-t-secondary">{t('bookings.panels.last_sync', 'Last Sync')}</span>
                  <span className="text-sm text-white">{dashboard.syncHealth.lastSyncAt ? new Date(dashboard.syncHealth.lastSyncAt).toLocaleString() : t('bookings.panels.never', 'Never')}</span>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}

      </>}{/* ════════════════ /OVERVIEW TAB ════════════════ */}

      {/* ════════════════ ARRIVALS TAB ════════════════
          Dedicated view for staff working the front desk — upcoming
          arrivals in one tall list, grouped by date with rich rows. */}
      {tab === 'arrivals' && (
        <Card className="p-0 overflow-hidden">
          <div className="px-5 py-4 border-b border-dark-border flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white">{t('bookings.tabs.arrivals_title', 'Upcoming Arrivals')}</h3>
              <p className="text-xs text-[#636366] mt-0.5">{t('bookings.tabs.arrivals_sub', 'Next 7 days · sorted by arrival date')}</p>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
              {t('bookings.tabs.arrivals_count', { count: dashboard?.arrivals?.length ?? 0, defaultValue: '{{count}} arrivals' })}
            </span>
          </div>
          <div className="divide-y divide-dark-border">
            {(dashboard?.arrivals?.length ?? 0) === 0 ? (
              <div className="p-12 text-center text-sm text-[#636366]">{t('bookings.tabs.arrivals_empty', 'No arrivals scheduled in the next 7 days.')}</div>
            ) : dashboard.arrivals.map((a: any) => (
              <CompactBookingRow key={a.id} b={a} t={t} variant="arrival" />
            ))}
          </div>
        </Card>
      )}

      {/* ════════════════ WEBSITE TAB ════════════════
          Direct bookings made via the public widget. */}
      {tab === 'website' && (
        <Card className="p-0 overflow-hidden">
          <div className="px-5 py-4 border-b border-dark-border flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white">{t('bookings.panels.website_reservations', 'Website Reservations')}</h3>
              <p className="text-xs text-[#636366] mt-0.5">{t('bookings.panels.website_reservations_sub', 'Direct bookings via your booking widget')}</p>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
              {t('bookings.panels.website_count', { count: dashboard?.websiteBookings?.length ?? 0, defaultValue: '{{count}} recent' })}
            </span>
          </div>
          <div className="divide-y divide-dark-border">
            {(dashboard?.websiteBookings?.length ?? 0) === 0 ? (
              <div className="p-12 text-center text-sm text-[#636366]">{t('bookings.panels.website_empty', 'No website bookings yet. Share your booking widget URL to start collecting direct reservations.')}</div>
            ) : dashboard.websiteBookings.map((b: any) => (
              <CompactBookingRow key={b.id} b={b} t={t} variant="website" />
            ))}
          </div>
        </Card>
      )}

      {/* Legacy Website Reservations sub-table inside Overview removed.
          Content lives in the dedicated Website tab above. */}
      {false && dashboard?.websiteBookings && dashboard.websiteBookings.length > 0 && (
        <Card className="p-0 overflow-hidden">
          <div className="px-5 py-4 border-b border-dark-border flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white">{t('bookings.panels.website_reservations', 'Website Reservations')}</h3>
              <p className="text-xs text-[#636366] mt-0.5">{t('bookings.panels.website_reservations_sub', 'Direct bookings via your booking widget')}</p>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/30">
              {t('bookings.panels.website_count', { count: dashboard.websiteBookings.length, defaultValue: '{{count}} recent' })}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-border">
                  <th className="text-left p-3 text-[10px] uppercase tracking-wider font-medium text-[#636366]">{t('bookings.table.guest', 'Guest')}</th>
                  <th className="text-left p-3 text-[10px] uppercase tracking-wider font-medium text-[#636366]">{t('bookings.table.unit', 'Unit')}</th>
                  <th className="text-left p-3 text-[10px] uppercase tracking-wider font-medium text-[#636366]">{t('bookings.table.stay', 'Stay')}</th>
                  <th className="text-right p-3 text-[10px] uppercase tracking-wider font-medium text-[#636366]">{t('bookings.table.total', 'Total')}</th>
                  <th className="text-right p-3 text-[10px] uppercase tracking-wider font-medium text-[#636366]">{t('bookings.table.paid', 'Paid')}</th>
                  <th className="text-left p-3 text-[10px] uppercase tracking-wider font-medium text-[#636366]">{t('bookings.table.payment', 'Payment')}</th>
                  <th className="text-left p-3 text-[10px] uppercase tracking-wider font-medium text-[#636366]">{t('bookings.table.booked', 'Booked')}</th>
                  <th className="text-center p-3 text-[10px] uppercase tracking-wider font-medium text-[#636366]"></th>
                </tr>
              </thead>
              <tbody>
                {dashboard.websiteBookings.map((b: any) => {
                  const paid = Number(b.price_paid ?? 0)
                  const total = Number(b.price_total ?? 0)
                  return (
                    <tr key={b.id} className="border-b border-dark-border/60 hover:bg-dark-surface2/40 transition-colors">
                      <td className="p-3">
                        <div className="text-sm text-white font-medium truncate max-w-[180px]">{b.guest_name || '—'}</div>
                        {b.guest_email && <div className="text-[11px] text-[#636366] truncate max-w-[180px]">{b.guest_email}</div>}
                      </td>
                      <td className="p-3 text-xs text-[#a0a0a0] truncate max-w-[180px]">{b.apartment_name || '—'}</td>
                      <td className="p-3 text-xs text-[#a0a0a0] whitespace-nowrap">
                        {fmtDateShort(b.arrival_date)} → {fmtDateShort(b.departure_date)}
                        {(b.adults != null) && <span className="text-[#636366]"> · {b.adults}A{b.children > 0 ? ` ${b.children}C` : ''}</span>}
                      </td>
                      <td className="p-3 text-right text-sm text-white font-semibold tabular-nums">{money(total)}</td>
                      <td className={`p-3 text-right text-sm tabular-nums ${paid >= total && total > 0 ? 'text-emerald-400 font-semibold' : 'text-[#a0a0a0]'}`}>{money(paid)}</td>
                      <td className="p-3">
                        {b.payment_status && (
                          <span className={`inline-block text-[9px] px-1.5 py-0.5 rounded-full font-bold ${PAY_PILL[b.payment_status] || 'bg-gray-500/15 text-gray-400 border border-gray-500/20'}`}>
                            {payLabel(b.payment_status)}
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-xs text-[#636366] whitespace-nowrap">{b.source_created_at ? new Date(b.source_created_at).toLocaleDateString() : '—'}</td>
                      <td className="p-3 text-center">
                        <Link to={`/bookings/${b.id}`} className="inline-flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300">
                          <Eye size={12} />
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ════════════════ ALL / UNPAID TABS ════════════════
          Same searchable + filterable table for both tabs. Unpaid
          forces payment_status=open via the effectivePayment guard. */}
      {(tab === 'all' || tab === 'unpaid') && <>

      {/* Tab-specific header banner — clarifies why filters might be
          forced when the user lands on Unpaid. */}
      {tab === 'unpaid' && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3 flex items-center gap-3 text-xs">
          <AlertTriangle size={14} className="text-amber-400 flex-shrink-0" />
          <span className="text-amber-200">{t('bookings.tabs.unpaid_hint', 'Showing bookings with open balances. Use the search and filters below to narrow further.')}</span>
        </div>
      )}

      {/* Search & Filters */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#636366]" />
            <input type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
              placeholder={t('bookings.filters.search_placeholder', 'Search guest, email, reference…')}
              className="w-full pl-9 pr-4 py-2 bg-[#1e1e1e] border border-dark-border rounded-lg text-sm text-white placeholder-[#636366] focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <select value={status} onChange={e => { setStatus(e.target.value); setPage(1) }} className={selectClass} style={selectStyle}>
            <option value=""           style={optStyle}>{t('bookings.filters.all_statuses', 'All Statuses')}</option>
            <option value="new"        style={optStyle}>{t('bookings.filters.status.new',         'New')}</option>
            <option value="confirmed"  style={optStyle}>{t('bookings.filters.status.confirmed',   'Confirmed')}</option>
            <option value="checked-in" style={optStyle}>{t('bookings.filters.status.checked_in',  'Checked In')}</option>
            <option value="checked-out" style={optStyle}>{t('bookings.filters.status.checked_out', 'Checked Out')}</option>
            <option value="cancelled"  style={optStyle}>{t('bookings.filters.status.cancelled',   'Cancelled')}</option>
            <option value="no-show"    style={optStyle}>{t('bookings.filters.status.no_show',     'No Show')}</option>
          </select>
          <select value={paymentStatus} onChange={e => { setPaymentStatus(e.target.value); setPage(1) }} className={selectClass} style={selectStyle}>
            <option value=""        style={optStyle}>{t('bookings.filters.all_payments', 'All Payments')}</option>
            <option value="open"    style={optStyle}>{t('bookings.filters.payment.open',            'Open')}</option>
            <option value="paid"    style={optStyle}>{t('bookings.filters.payment.paid',            'Paid')}</option>
            <option value="pending" style={optStyle}>{t('bookings.filters.payment.pending',         'Pending')}</option>
            <option value="invoice_waiting" style={optStyle}>{t('bookings.filters.payment.invoice_waiting', 'Invoice Waiting')}</option>
            <option value="channel_managed" style={optStyle}>{t('bookings.filters.payment.channel_managed', 'Channel Managed')}</option>
          </select>
        </div>
      </Card>

      {/* Table */}
      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-dark-border text-[10px] uppercase tracking-wider text-[#636366] font-bold bg-[#1a1a1a]">
                <th className="text-center p-4 w-10">
                  <input type="checkbox" checked={allOnPageSelected} onChange={togglePageSelection}
                    className="rounded border-white/20 bg-white/[0.04] cursor-pointer" />
                </th>
                <th className="text-left p-4">{t('bookings.table.guest', 'Guest')}</th><th className="text-left p-4">{t('bookings.table.unit', 'Unit')}</th>
                <th className="text-left p-4">{t('bookings.table.arrival', 'Arrival')}</th><th className="text-left p-4">{t('bookings.table.departure', 'Departure')}</th>
                <th className="text-right p-4">{t('bookings.table.total', 'Total')}</th><th className="text-right p-4">{t('bookings.table.balance', 'Balance')}</th>
                <th className="text-left p-4">{t('bookings.table.channel', 'Channel')}</th><th className="text-left p-4">{t('bookings.table.status', 'Status')}</th>
                <th className="text-left p-4">{t('bookings.table.payment', 'Payment')}</th><th className="text-center p-4">{t('bookings.table.view', 'View')}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={11} className="p-12 text-center text-[#636366]">
                  <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto" />
                </td></tr>
              ) : bookings.length === 0 ? (
                <tr><td colSpan={11} className="p-12 text-center text-[#636366]">{t('bookings.table.no_results', 'No bookings found.')}</td></tr>
              ) : bookings.map((b: any) => {
                const payStatus = derivePaymentStatus(b)
                const nights = b.arrival_date && b.departure_date
                  ? Math.max(1, Math.round((new Date(b.departure_date).getTime() - new Date(b.arrival_date).getTime()) / 86400000))
                  : null
                return (
                <tr key={b.id} className={`border-b border-dark-border hover:bg-dark-surface2/50 transition-colors ${selected.has(b.id) ? 'bg-primary-500/[0.04]' : ''}`}>
                  <td className="p-4 text-center">
                    <input type="checkbox" checked={selected.has(b.id)} onChange={() => toggleRow(b.id)}
                      className="rounded border-white/20 bg-white/[0.04] cursor-pointer" />
                  </td>
                  <td className="p-4">
                    <div className="text-white font-medium">{b.guest_name || '—'}</div>
                    <div className="text-[#636366] text-xs">{b.guest_email || ''}</div>
                  </td>
                  <td className="p-4 text-t-secondary text-xs">{b.apartment_name || '—'}</td>
                  <td className="p-4 text-t-secondary text-xs tabular-nums">{fmtDate(b.arrival_date)}</td>
                  <td className="p-4 text-xs tabular-nums">
                    <span className="text-t-secondary">{fmtDate(b.departure_date)}</span>
                    {nights && <span className="text-[#636366] ml-1.5">({nights}n)</span>}
                  </td>
                  <td className="p-4 text-right text-white font-semibold tabular-nums">
                    {money(b.price_total)}
                  </td>
                  <td className="p-4 text-right tabular-nums">
                    {b.balance_due > 0
                      ? <span className="text-red-400 font-semibold">{money(b.balance_due)}</span>
                      : <span className="text-emerald-400/60 text-[10px] font-bold">{t('bookings.table.settled', 'SETTLED')}</span>}
                  </td>
                  <td className="p-4 text-[#636366] text-xs">{b.channel_name || '—'}</td>
                  <td className="p-4">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${STATUS_PILL[b.internal_status] || STATUS_PILL[b.booking_state] || 'bg-gray-500/15 text-gray-400 border border-gray-500/20'}`}>
                      {(b.internal_status || b.booking_state || 'new').replace(/-/g, ' ')}
                    </span>
                  </td>
                  <td className="p-4">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${PAY_PILL[payStatus] || 'bg-gray-500/15 text-gray-400 border border-gray-500/20'}`}>
                      {payLabel(payStatus)}
                    </span>
                  </td>
                  <td className="p-4 text-center">
                    <Link to={`/bookings/${b.id}`}
                      className="inline-flex items-center gap-1 text-xs font-medium transition-colors text-primary-400 hover:text-primary-300">
                      <Eye size={13} /> {t('bookings.table.view', 'View')}
                    </Link>
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {lastPage > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-dark-border">
            <span className="text-xs text-[#636366]">{t('bookings.pagination', { page, total: lastPage, count: data?.total ?? 0, defaultValue: 'Page {{page}} of {{total}} · {{count}} total' })}</span>
            <div className="flex gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="p-2 rounded-lg bg-[#1e1e1e] border border-dark-border text-t-secondary hover:text-white hover:bg-dark-surface2 disabled:opacity-30 transition-colors">
                <ChevronLeft size={14} />
              </button>
              <button onClick={() => setPage(p => Math.min(lastPage, p + 1))} disabled={page === lastPage}
                className="p-2 rounded-lg bg-[#1e1e1e] border border-dark-border text-t-secondary hover:text-white hover:bg-dark-surface2 disabled:opacity-30 transition-colors">
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </Card>

      </>}{/* ════════════════ /ALL / UNPAID TABS ════════════════ */}

      {/* Bulk action floating bar — appears once any row is selected.
          Confirmation prompts on destructive actions (cancel) since the
          row count makes accidental clicks costly. Export uses the
          selection if any, otherwise the live filter set. */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-dark-surface border border-white/10 rounded-2xl shadow-2xl p-3 flex items-center gap-2 backdrop-blur"
          style={{ background: 'rgba(18,24,22,0.96)', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>
          <span className="px-3 py-1.5 text-xs font-bold text-white tabular-nums">
            {t('bookings.bulk.selected', { count: selected.size, defaultValue: '{{count}} selected' })}
          </span>
          <div className="h-5 w-px bg-white/10" />
          <button onClick={() => runBulk('mark_paid')} disabled={bulkBusy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50 transition-colors">
            <CheckCheck size={13} /> {t('bookings.bulk.mark_paid', 'Mark Paid')}
          </button>
          <button onClick={() => runBulk('cancel', undefined, t('bookings.bulk.cancel_confirm', { count: selected.size, defaultValue: 'Cancel {{count}} reservations? This cannot be undone in bulk.' }))}
            disabled={bulkBusy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-red-500/15 text-red-300 hover:bg-red-500/25 disabled:opacity-50 transition-colors">
            <Trash2 size={13} /> {t('bookings.bulk.cancel', 'Cancel')}
          </button>
          <button onClick={exportCsv} disabled={bulkBusy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-blue-500/15 text-blue-300 hover:bg-blue-500/25 disabled:opacity-50 transition-colors">
            <Download size={13} /> {t('bookings.bulk.export', 'Export')}
          </button>
          <div className="h-5 w-px bg-white/10" />
          <button onClick={() => setSelected(new Set())} title={t('bookings.bulk.clear_selection', 'Clear selection')}
            className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/[0.06]">
            <XIcon size={14} />
          </button>
        </div>
      )}
    </div>
  )
}

/* ── CompactBookingRow ─────────────────────────────────────────────
   Single-row booking card used in the Arrivals + Website tabs. Shows
   channel chip, dates, money (paid / total + progress bar), payment
   status, and a View link. Designed for scan-ability — staff can see
   booking source, balance, and stay range without reading text.
*/
function CompactBookingRow({
  b, t, variant = 'all',
}: {
  b: any
  t: (k: string, def?: any) => any
  variant?: 'arrival' | 'website' | 'all'
}) {
  const total = Number(b.price_total ?? b.gross_total ?? 0)
  const paid = Number(b.price_paid ?? 0)
  const balance = Math.max(0, total - paid)
  const paidPct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0
  const payState = derivePaymentStatus(b)
  const channel = b.channel_name ?? (variant === 'website' ? 'Website' : null)

  // Channel chip colour — different brand colour per OTA so staff
  // recognise the source at a glance.
  const channelTone = (() => {
    const c = (channel ?? '').toLowerCase()
    if (c.includes('booking.com'))   return 'bg-blue-500/15 text-blue-300 border-blue-500/30'
    if (c.includes('airbnb'))         return 'bg-pink-500/15 text-pink-300 border-pink-500/30'
    if (c.includes('website'))        return 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
    if (c.includes('direct'))         return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
    if (c.includes('expedia'))        return 'bg-amber-500/15 text-amber-300 border-amber-500/30'
    return 'bg-gray-500/15 text-gray-300 border-gray-500/30'
  })()

  const initial = (b.guest_name ?? '?').charAt(0).toUpperCase()
  const nights = b.arrival_date && b.departure_date
    ? Math.max(1, Math.round((new Date(b.departure_date).getTime() - new Date(b.arrival_date).getTime()) / 86400000))
    : null

  // Progress bar tone: solid emerald when paid, amber when partial, red when nothing paid yet.
  const barTone = paidPct >= 100 ? 'bg-emerald-500' : paidPct > 0 ? 'bg-amber-500' : 'bg-red-500/60'

  return (
    <Link to={`/bookings/${b.id}`}
      className="flex items-center gap-4 px-5 py-3 hover:bg-dark-surface2/40 transition-colors">
      {/* Avatar circle */}
      <div className="w-9 h-9 rounded-full bg-primary-500/15 border border-primary-500/30 flex items-center justify-center text-xs font-bold text-primary-300 flex-shrink-0">
        {initial}
      </div>

      {/* Guest + channel + meta */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-white truncate">{b.guest_name || '—'}</span>
          {channel && (
            <span className={`inline-flex items-center text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${channelTone}`}>
              {channel}
            </span>
          )}
        </div>
        <div className="text-[11px] text-[#a0a0a0] mt-0.5 flex items-center gap-2 flex-wrap">
          {b.guest_email && (
            <span className="inline-flex items-center gap-1 truncate max-w-[180px]">
              <Mail size={10} className="text-[#636366]" />{b.guest_email}
            </span>
          )}
          {b.guest_phone && (
            <span className="inline-flex items-center gap-1">
              <Phone size={10} className="text-[#636366]" />{b.guest_phone}
            </span>
          )}
          {b.apartment_name && <span className="text-[#636366]">· {b.apartment_name}</span>}
        </div>
      </div>

      {/* Stay */}
      <div className="hidden md:block text-right flex-shrink-0 min-w-[140px]">
        <div className="text-xs text-[#e0e0e0] tabular-nums whitespace-nowrap">
          {fmtDateShort(b.arrival_date)} → {fmtDateShort(b.departure_date)}
        </div>
        <div className="text-[10px] text-[#636366]">
          {nights ? `${nights}n` : ''}
          {b.adults != null ? ` · ${b.adults}A${b.children > 0 ? ` ${b.children}C` : ''}` : ''}
        </div>
      </div>

      {/* Money + progress bar */}
      <div className="text-right flex-shrink-0 min-w-[150px]">
        <div className="text-xs tabular-nums whitespace-nowrap">
          <span className={paid >= total && total > 0 ? 'text-emerald-400 font-semibold' : 'text-white font-semibold'}>{money(paid)}</span>
          <span className="text-[#636366]"> / </span>
          <span className="text-[#a0a0a0]">{money(total)}</span>
        </div>
        <div className="h-1 mt-1.5 bg-white/[0.04] rounded-full overflow-hidden">
          <div className={`h-full ${barTone} transition-all`} style={{ width: `${paidPct}%` }} />
        </div>
        {balance > 0 && total > 0 && (
          <div className="text-[10px] text-red-400 font-semibold mt-1 tabular-nums">{money(balance)} {t('bookings.row.due', 'due')}</div>
        )}
      </div>

      {/* Status pill */}
      <div className="hidden sm:block flex-shrink-0">
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${PAY_PILL[payState] || 'bg-gray-500/15 text-gray-400 border border-gray-500/20'}`}>
          {payLabel(payState)}
        </span>
      </div>

      {/* View */}
      <div className="flex-shrink-0">
        <span className="p-1.5 rounded-lg bg-white/[0.04] text-[#a0a0a0] hover:bg-white/[0.08] hover:text-white inline-flex">
          <Eye size={13} />
        </span>
      </div>
    </Link>
  )
}
