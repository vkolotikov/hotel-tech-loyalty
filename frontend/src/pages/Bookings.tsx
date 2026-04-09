import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Search, ChevronLeft, ChevronRight, RefreshCw, Eye, Calendar, DollarSign, Users, TrendingUp, XCircle, CheckCircle, AlertTriangle, Clock, Activity } from 'lucide-react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'

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

function Card({ children, className = '', accent = false }: { children: React.ReactNode; className?: string; accent?: boolean }) {
  return (
    <div className={`relative rounded-2xl border border-white/[0.06] overflow-hidden ${className}`}
      style={{
        background: 'linear-gradient(180deg, rgba(18,24,22,0.96), rgba(14,20,18,0.98))',
        boxShadow: '0 16px 30px rgba(0,0,0,0.18)',
      }}>
      {accent && <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: 'linear-gradient(90deg, #74c895, #d98f45)' }} />}
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
              €{d.revenue.toLocaleString()} · {d.bookings} bookings · {d.avg_nights}n
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
          {d.balance > 0 && <div className="text-[10px] text-red-400/70 mt-1">€{d.balance.toLocaleString()} outstanding</div>}
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
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [paymentStatus, setPaymentStatus] = useState('')
  const [unitId, setUnitId] = useState('')
  const [page, setPage] = useState(1)
  const [syncing, setSyncing] = useState(false)
  const [period, setPeriod] = useState('month')

  const params: any = { page, per_page: 25 }
  if (search) params.search = search
  if (status) params.status = status
  if (paymentStatus) params.payment_status = paymentStatus
  if (unitId) params.unit_id = unitId

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['bookings-engine', params],
    queryFn: () => api.get('/v1/admin/bookings', { params }).then(r => r.data),
  })

  const dashParams: any = { period }
  if (unitId) dashParams.unit_id = unitId
  const { data: dashboard } = useQuery({
    queryKey: ['bookings-dashboard', dashParams],
    queryFn: () => api.get('/v1/admin/bookings/dashboard', { params: dashParams }).then(r => r.data),
    staleTime: 60_000,
  })

  const bookings = data?.data ?? []
  const lastPage = data?.last_page ?? 1
  const units = data?.filters?.units ?? dashboard?.filters?.units ?? []

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
  const kpiMeta: Record<string, { icon: any; color: string; gradient: string }> = {
    total_bookings:  { icon: Calendar,      color: 'text-blue-400',    gradient: 'from-blue-500/20' },
    revenue:         { icon: DollarSign,    color: 'text-emerald-400', gradient: 'from-emerald-500/20' },
    confirmed:       { icon: TrendingUp,    color: 'text-green-400',   gradient: 'from-green-500/20' },
    cancelled:       { icon: XCircle,       color: 'text-red-400',     gradient: 'from-red-500/20' },
    pending_payment: { icon: AlertTriangle, color: 'text-amber-400',   gradient: 'from-amber-500/20' },
    avg_stay:        { icon: Users,         color: 'text-purple-400',  gradient: 'from-purple-500/20' },
    balance_due:     { icon: Clock,         color: 'text-orange-400',  gradient: 'from-orange-500/20' },
  }

  const selectClass = 'bg-dark-surface border border-white/[0.08] rounded-xl text-sm text-white px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary-500/40 appearance-none cursor-pointer'

  return (
    <div className="space-y-7">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider mb-2"
            style={{ background: 'rgba(var(--color-primary-rgb, 116,200,149),0.12)', color: 'rgb(var(--color-primary-rgb, 116,200,149))' }}>
            Booking Engine
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Reservations</h1>
          <p className="text-sm text-gray-500 mt-1">PMS reservations synced from your booking channels</p>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/bookings/submissions" className="text-xs text-gray-500 hover:text-gray-300 transition-colors underline-offset-4 hover:underline">
            Submission log
          </Link>
        <button onClick={handleSync} disabled={syncing}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-all hover:scale-[1.02]"
          style={{
            background: 'linear-gradient(135deg, rgb(var(--color-primary-rgb, 116,200,149)), #5ab4b2)',
            boxShadow: '0 8px 20px rgba(var(--color-primary-rgb, 116,200,149),0.25)',
          }}>
          <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Syncing...' : 'Sync PMS'}
        </button>
        </div>
      </div>

      {/* Period tabs + unit filter */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="inline-flex p-1 rounded-2xl" style={{ background: 'rgba(22,40,35,0.6)', border: '1px solid rgba(255,255,255,0.06)' }}>
          {['week', 'month', 'year'].map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-4 py-1.5 text-xs font-semibold rounded-xl transition-all ${period === p
                ? 'text-white shadow-lg'
                : 'text-gray-500 hover:text-gray-300'}`}
              style={period === p ? { background: 'linear-gradient(135deg, rgb(var(--color-primary-rgb, 116,200,149)), #5ab4b2)', boxShadow: '0 6px 16px rgba(var(--color-primary-rgb, 116,200,149),0.2)' } : {}}>
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
        {units.length > 0 && (
          <select value={unitId} onChange={e => { setUnitId(e.target.value); setPage(1) }} className={selectClass}>
            <option value="">All Units</option>
            {units.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        )}
        {dashboard?.scope && (
          <span className="text-[11px] text-gray-600 ml-auto font-medium">{dashboard.scope.label}: {dashboard.scope.from} — {dashboard.scope.to}</span>
        )}
      </div>

      {/* KPI Grid */}
      {kpis.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {kpis.map((kpi: any) => {
            const meta = kpiMeta[kpi.key] || { icon: Activity, color: 'text-gray-400', gradient: 'from-gray-500/20' }
            const Icon = meta.icon
            return (
              <Card key={kpi.key} accent>
                <div className={`p-4 bg-gradient-to-br ${meta.gradient} to-transparent`}>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Icon size={13} className={meta.color} />
                    <span className="text-[10px] text-gray-500 font-medium uppercase tracking-wider truncate">{kpi.label}</span>
                  </div>
                  <div className="text-2xl font-bold text-white tabular-nums">{kpi.displayValue}</div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Analytics Charts — 2×2 */}
      {dashboard?.analytics && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-6">
            <h3 className="text-[11px] uppercase tracking-wider text-gray-500 font-bold mb-5">Payment Mix</h3>
            <DonutChart data={dashboard.analytics.paymentMix || []} />
          </Card>
          <Card className="p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-[11px] uppercase tracking-wider text-gray-500 font-bold">Arrival Pace</h3>
              <span className="text-xs text-gray-600 font-medium tabular-nums">{dashboard.analytics.arrivalPace?.total ?? 0} total</span>
            </div>
            <BarChart data={dashboard.analytics.arrivalPace?.days || []} />
          </Card>
          <Card className="p-6">
            <h3 className="text-[11px] uppercase tracking-wider text-gray-500 font-bold mb-5">Unit Performance</h3>
            <HorizontalBars data={dashboard.analytics.unitPerformance || []} />
          </Card>
          <Card className="p-6">
            <h3 className="text-[11px] uppercase tracking-wider text-gray-500 font-bold mb-5">Channel Mix</h3>
            <ChannelList data={dashboard.analytics.channelMix || []} />
          </Card>
        </div>
      )}

      {/* Bottom panels — 2 columns */}
      {dashboard && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Upcoming Arrivals */}
          {(dashboard.arrivals?.length > 0) && (
            <Card className="p-5">
              <h3 className="text-[11px] uppercase tracking-wider text-gray-500 font-bold mb-4">Upcoming Arrivals</h3>
              <div className="space-y-2">
                {dashboard.arrivals.map((a: any) => (
                  <Link key={a.id} to={`/bookings/${a.id}`}
                    className="flex items-center justify-between rounded-xl p-3 transition-all hover:-translate-y-px hover:shadow-lg"
                    style={{
                      background: 'linear-gradient(180deg, rgba(22,35,30,0.95), rgba(19,33,29,0.98))',
                      border: '1px solid rgba(255,255,255,0.05)',
                    }}>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white truncate">{a.guest_name || 'Unknown'}</div>
                      <div className="text-[11px] text-gray-500 mt-0.5">{a.apartment_name} · {a.adults}A{a.children > 0 ? ` ${a.children}C` : ''}</div>
                    </div>
                    <div className="text-right flex-shrink-0 ml-3">
                      <div className="text-[11px] font-medium" style={{ color: '#74c895' }}>{fmtDateShort(a.arrival_date)}</div>
                      {a.payment_status && (
                        <span className={`inline-block mt-1 text-[9px] px-1.5 py-0.5 rounded-full font-bold ${PAY_PILL[a.payment_status] || 'bg-gray-500/15 text-gray-400 border border-gray-500/20'}`}>
                          {payLabel(a.payment_status)}
                        </span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </Card>
          )}

          {/* Recent Unpaid */}
          {(dashboard.recentUnpaidBookings?.length > 0) && (
            <Card className="p-5">
              <h3 className="text-[11px] uppercase tracking-wider text-gray-500 font-bold mb-4">Recent Unpaid</h3>
              <div className="space-y-2">
                {dashboard.recentUnpaidBookings.map((b: any) => (
                  <Link key={b.id} to={`/bookings/${b.id}`}
                    className="flex items-center justify-between rounded-xl p-3 transition-all hover:-translate-y-px"
                    style={{ background: 'linear-gradient(180deg, rgba(22,35,30,0.95), rgba(19,33,29,0.98))', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white truncate">{b.guest_name || '—'}</div>
                      <div className="text-[11px] text-gray-500">{b.apartment_name} · {fmtDateShort(b.arrival_date)} → {fmtDateShort(b.departure_date)}</div>
                    </div>
                    <div className="text-right flex-shrink-0 ml-3 tabular-nums">
                      <div className="text-xs text-emerald-400 font-semibold">€{Number(b.price_paid || 0).toFixed(0)}</div>
                      <div className="text-xs text-red-400">/ €{Number(b.price_total || 0).toFixed(0)}</div>
                    </div>
                  </Link>
                ))}
              </div>
            </Card>
          )}

          {/* Recent Submissions */}
          {(dashboard.recentSubmissions?.length > 0) && (
            <Card className="p-5">
              <h3 className="text-[11px] uppercase tracking-wider text-gray-500 font-bold mb-4">Recent Submissions</h3>
              <div className="space-y-2">
                {dashboard.recentSubmissions.map((s: any) => (
                  <div key={s.id} className="flex items-center justify-between rounded-xl p-3"
                    style={{ background: 'linear-gradient(180deg, rgba(22,35,30,0.95), rgba(19,33,29,0.98))', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div className="min-w-0 flex items-center gap-2">
                      {s.outcome === 'success' ? <CheckCircle size={14} className="text-emerald-400 flex-shrink-0" /> : <XCircle size={14} className="text-red-400 flex-shrink-0" />}
                      <div>
                        <span className="text-sm text-white font-medium truncate block">{s.guest_name || '—'}</span>
                        <div className="text-[11px] text-gray-500">{s.unit_name} · {s.check_in} → {s.check_out}</div>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 ml-3">
                      {s.gross_total && <div className="text-xs text-white font-semibold tabular-nums">€{Number(s.gross_total).toFixed(0)}</div>}
                      <div className="text-[10px] text-gray-600">{new Date(s.created_at).toLocaleDateString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Sync Health */}
          {dashboard.syncHealth && (
            <Card className="p-5">
              <h3 className="text-[11px] uppercase tracking-wider text-gray-500 font-bold mb-4">Sync Health</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-400">Mirrored Bookings</span>
                  <span className="text-lg font-bold text-white tabular-nums">{dashboard.syncHealth.mirroredBookingCount}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-400">Last Sync</span>
                  <span className="text-sm text-white">{dashboard.syncHealth.lastSyncAt ? new Date(dashboard.syncHealth.lastSyncAt).toLocaleString() : 'Never'}</span>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Search & Filters */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-600" />
            <input type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
              placeholder="Search guest, email, reference..."
              className="w-full pl-10 pr-4 py-2.5 bg-dark-surface border border-white/[0.06] rounded-xl text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-primary-500/40"
            />
          </div>
          <select value={status} onChange={e => { setStatus(e.target.value); setPage(1) }} className={selectClass}>
            <option value="">All Statuses</option>
            <option value="new">New</option><option value="confirmed">Confirmed</option>
            <option value="checked-in">Checked In</option><option value="checked-out">Checked Out</option>
            <option value="cancelled">Cancelled</option><option value="no-show">No Show</option>
          </select>
          <select value={paymentStatus} onChange={e => { setPaymentStatus(e.target.value); setPage(1) }} className={selectClass}>
            <option value="">All Payments</option>
            <option value="paid">Paid</option><option value="pending">Pending</option>
            <option value="invoice_waiting">Invoice Waiting</option><option value="channel_managed">Channel Managed</option>
          </select>
        </div>
      </Card>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] text-[10px] uppercase tracking-wider text-gray-500 font-bold">
                <th className="text-left p-4">Guest</th><th className="text-left p-4">Unit</th>
                <th className="text-left p-4">Arrival</th><th className="text-left p-4">Departure</th>
                <th className="text-right p-4">Total</th><th className="text-right p-4">Balance</th>
                <th className="text-left p-4">Channel</th><th className="text-left p-4">Status</th>
                <th className="text-left p-4">Payment</th><th className="text-center p-4">View</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={10} className="p-12 text-center text-gray-600">
                  <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
                </td></tr>
              ) : bookings.length === 0 ? (
                <tr><td colSpan={10} className="p-12 text-center text-gray-600">No bookings found.</td></tr>
              ) : bookings.map((b: any) => {
                const payStatus = derivePaymentStatus(b)
                const nights = b.arrival_date && b.departure_date
                  ? Math.max(1, Math.round((new Date(b.departure_date).getTime() - new Date(b.arrival_date).getTime()) / 86400000))
                  : null
                return (
                <tr key={b.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                  <td className="p-4">
                    <div className="text-white font-medium">{b.guest_name || '—'}</div>
                    <div className="text-gray-600 text-[11px]">{b.guest_email || ''}</div>
                  </td>
                  <td className="p-4 text-gray-400 text-xs">{b.apartment_name || '—'}</td>
                  <td className="p-4 text-gray-400 text-xs tabular-nums">{fmtDate(b.arrival_date)}</td>
                  <td className="p-4 text-xs tabular-nums">
                    <span className="text-gray-400">{fmtDate(b.departure_date)}</span>
                    {nights && <span className="text-gray-600 ml-1.5">({nights}n)</span>}
                  </td>
                  <td className="p-4 text-right text-white font-semibold tabular-nums">
                    {b.price_total ? `€${Number(b.price_total).toLocaleString()}` : '—'}
                  </td>
                  <td className="p-4 text-right tabular-nums">
                    {b.balance_due > 0
                      ? <span className="text-red-400 font-semibold">€{Number(b.balance_due).toLocaleString()}</span>
                      : <span className="text-emerald-400/50 text-[10px] font-bold">SETTLED</span>}
                  </td>
                  <td className="p-4 text-gray-500 text-[11px]">{b.channel_name || '—'}</td>
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
                      <Eye size={13} /> View
                    </Link>
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {lastPage > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-white/[0.06]">
            <span className="text-xs text-gray-600">Page {page} of {lastPage} · {data?.total ?? 0} total</span>
            <div className="flex gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="p-2 rounded-lg text-gray-500 hover:text-white disabled:opacity-30 transition-colors" style={{ background: 'rgba(22,40,35,0.6)' }}>
                <ChevronLeft size={14} />
              </button>
              <button onClick={() => setPage(p => Math.min(lastPage, p + 1))} disabled={page === lastPage}
                className="p-2 rounded-lg text-gray-500 hover:text-white disabled:opacity-30 transition-colors" style={{ background: 'rgba(22,40,35,0.6)' }}>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
