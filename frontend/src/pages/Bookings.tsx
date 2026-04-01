import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Search, ChevronLeft, ChevronRight, RefreshCw, Eye, Calendar, DollarSign, Users, TrendingUp, XCircle, CheckCircle, AlertTriangle, Clock, Activity } from 'lucide-react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'

const STATUS_COLORS: Record<string, string> = {
  new: 'bg-blue-500/20 text-blue-400',
  confirmed: 'bg-green-500/20 text-green-400',
  cancelled: 'bg-red-500/20 text-red-400',
  'checked-in': 'bg-emerald-500/20 text-emerald-400',
  'checked-out': 'bg-gray-500/20 text-gray-400',
  'no-show': 'bg-orange-500/20 text-orange-400',
}

const PAYMENT_STATE_COLORS: Record<string, string> = {
  paid: 'bg-green-500/20 text-green-400 border-green-500/30',
  open: 'bg-red-500/20 text-red-400 border-red-500/30',
  pending: 'bg-red-500/20 text-red-400 border-red-500/30',
  invoice_waiting: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  channel_managed: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
}

const CHART_COLORS = ['#5ab4b2', '#d98f45', '#74c895', '#81a6e8', '#d5c06a', '#c084fc']

function paymentStateLabel(s: string) {
  if (s === 'invoice_waiting') return 'Invoice waiting'
  if (s === 'channel_managed') return 'Channel managed'
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ')
}

// ── SVG Donut Chart ──────────────────────────────────────────────────
function DonutChart({ data }: { data: { label: string; key: string; count: number; total: number }[] }) {
  const [hovered, setHovered] = useState<number | null>(null)
  const total = data.reduce((s, d) => s + d.count, 0)
  if (!total) return <div className="text-gray-600 text-sm text-center py-8">No data</div>

  const radius = 70
  const stroke = 18
  const circumference = 2 * Math.PI * radius
  let offset = 0

  const activeItem = hovered !== null ? data[hovered] : data.reduce((a, b) => b.count > a.count ? b : a, data[0])

  return (
    <div className="flex items-center gap-6">
      <div className="relative flex-shrink-0">
        <svg width={180} height={180} viewBox="0 0 180 180">
          <circle cx={90} cy={90} r={radius} fill="none" stroke="rgb(40,40,50)" strokeWidth={stroke} />
          {data.map((d, i) => {
            const pct = d.count / total
            const dash = pct * circumference
            const currentOffset = offset
            offset += dash
            return (
              <circle key={d.key} cx={90} cy={90} r={radius} fill="none"
                stroke={CHART_COLORS[i % CHART_COLORS.length]}
                strokeWidth={stroke}
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-currentOffset}
                transform="rotate(-90 90 90)"
                className="transition-opacity"
                opacity={hovered !== null && hovered !== i ? 0.3 : 1}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                style={{ cursor: 'pointer' }}
              />
            )
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-2xl font-bold text-white">{activeItem.count}</span>
          <span className="text-[10px] text-gray-400">{activeItem.label}</span>
        </div>
      </div>
      <div className="space-y-1.5 min-w-0">
        {data.map((d, i) => (
          <div key={d.key} className="flex items-center gap-2 text-xs"
            onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}>
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
            <span className="text-gray-300 truncate">{d.label}</span>
            <span className="text-white font-medium ml-auto">{d.count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Bar Chart (arrivals timeline) ────────────────────────────────────
function BarChart({ data }: { data: { label: string; count: number }[] }) {
  const [hovered, setHovered] = useState<number | null>(null)
  const max = Math.max(1, ...data.map(d => d.count))

  return (
    <div>
      {hovered !== null && data[hovered] && (
        <div className="text-xs text-gray-400 mb-2">{data[hovered].label}: <span className="text-white font-medium">{data[hovered].count} arrivals</span></div>
      )}
      <div className="flex items-end gap-1 h-[100px]">
        {data.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1"
            onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}>
            <div className="w-full rounded-t transition-all duration-200"
              style={{
                height: `${(d.count / max) * 80}px`,
                minHeight: d.count > 0 ? 4 : 0,
                background: hovered === i ? '#81a6e8' : d.count === max ? '#5ab4b2' : 'rgb(60,60,80)',
              }}
            />
            <span className="text-[9px] text-gray-600 truncate w-full text-center">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Horizontal Bars (unit performance) ───────────────────────────────
function HorizontalBars({ data }: { data: { unit_name: string; revenue: number; balance: number; bookings: number; avg_nights: number }[] }) {
  const maxRev = Math.max(1, ...data.map(d => d.revenue))
  if (!data.length) return <div className="text-gray-600 text-sm text-center py-8">No data</div>

  return (
    <div className="space-y-3">
      {data.map((d, i) => (
        <div key={i}>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-gray-300 font-medium truncate">{d.unit_name || 'Unknown'}</span>
            <span className="text-gray-500 flex-shrink-0 ml-2">
              €{d.revenue.toLocaleString()} · {d.bookings} bookings · {d.avg_nights}n avg
            </span>
          </div>
          <div className="h-2 bg-dark-700 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all"
              style={{ width: `${(d.revenue / maxRev) * 100}%`, background: CHART_COLORS[i % CHART_COLORS.length] }}
            />
          </div>
          {d.balance > 0 && (
            <div className="text-[10px] text-red-400/70 mt-0.5">€{d.balance.toLocaleString()} outstanding</div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Channel List ─────────────────────────────────────────────────────
function ChannelList({ data }: { data: { label: string; count: number }[] }) {
  const total = Math.max(1, data.reduce((s, d) => s + d.count, 0))
  if (!data.length) return <div className="text-gray-600 text-sm text-center py-8">No data</div>

  return (
    <div className="space-y-2.5">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
          <span className="text-xs text-gray-300 flex-1 truncate">{d.label}</span>
          <span className="text-xs text-white font-medium">{d.count}</span>
          <div className="w-20 h-1.5 bg-dark-700 rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${(d.count / total) * 100}%`, background: CHART_COLORS[i % CHART_COLORS.length] }} />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────
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
  const kpiIcons: Record<string, any> = {
    total_bookings: Calendar,
    revenue: DollarSign,
    confirmed: TrendingUp,
    cancelled: XCircle,
    pending_payment: AlertTriangle,
    avg_stay: Users,
    balance_due: Clock,
  }
  const kpiColors: Record<string, string> = {
    total_bookings: 'text-blue-400',
    revenue: 'text-green-400',
    confirmed: 'text-emerald-400',
    cancelled: 'text-red-400',
    pending_payment: 'text-amber-400',
    avg_stay: 'text-purple-400',
    balance_due: 'text-orange-400',
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Booking Engine</h1>
          <p className="text-sm text-gray-500 mt-1">PMS reservations synced from your booking channels</p>
        </div>
        <button onClick={handleSync} disabled={syncing}
          className="flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
          <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Syncing...' : 'Sync PMS'}
        </button>
      </div>

      {/* Period tabs + unit filter */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex bg-dark-800 rounded-lg border border-dark-700 p-0.5">
          {['week', 'month', 'year'].map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${period === p ? 'bg-primary-600 text-white' : 'text-gray-400 hover:text-white'}`}>
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
        {units.length > 0 && (
          <select value={unitId} onChange={e => { setUnitId(e.target.value); setPage(1) }}
            className="bg-dark-700 border border-dark-600 rounded-lg text-xs text-white px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary-500">
            <option value="">All Units</option>
            {units.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        )}
        {dashboard?.scope && (
          <span className="text-xs text-gray-600 ml-auto">{dashboard.scope.label}: {dashboard.scope.from} — {dashboard.scope.to}</span>
        )}
      </div>

      {/* KPI Grid */}
      {kpis.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {kpis.map((kpi: any) => {
            const Icon = kpiIcons[kpi.key] || Activity
            const color = kpiColors[kpi.key] || 'text-gray-400'
            return (
              <div key={kpi.key} className="bg-dark-800 rounded-xl border border-dark-700 p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon size={13} className={color} />
                  <span className="text-[10px] text-gray-500 truncate">{kpi.label}</span>
                </div>
                <div className="text-lg font-bold text-white">{kpi.displayValue}</div>
              </div>
            )
          })}
        </div>
      )}

      {/* Analytics Charts — 2×2 grid */}
      {dashboard?.analytics && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Payment Mix Donut */}
          <div className="bg-dark-800 rounded-xl border border-dark-700 p-5">
            <h3 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-4">Payment Mix</h3>
            <DonutChart data={dashboard.analytics.paymentMix || []} />
          </div>

          {/* Arrivals Timeline */}
          <div className="bg-dark-800 rounded-xl border border-dark-700 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Arrival Pace</h3>
              <span className="text-xs text-gray-500">{dashboard.analytics.arrivalPace?.total ?? 0} total</span>
            </div>
            <BarChart data={dashboard.analytics.arrivalPace?.days || []} />
          </div>

          {/* Unit Performance */}
          <div className="bg-dark-800 rounded-xl border border-dark-700 p-5">
            <h3 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-4">Unit Performance</h3>
            <HorizontalBars data={dashboard.analytics.unitPerformance || []} />
          </div>

          {/* Channel Mix */}
          <div className="bg-dark-800 rounded-xl border border-dark-700 p-5">
            <h3 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-4">Channel Mix</h3>
            <ChannelList data={dashboard.analytics.channelMix || []} />
          </div>
        </div>
      )}

      {/* Sync Health + Arrivals + Unpaid + Submissions — 2 columns */}
      {dashboard && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Upcoming Arrivals */}
          {dashboard.arrivals?.length > 0 && (
            <div className="bg-dark-800 rounded-xl border border-dark-700 p-4">
              <h3 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-3">Upcoming Arrivals</h3>
              <div className="space-y-2">
                {dashboard.arrivals.map((a: any) => (
                  <Link key={a.id} to={`/bookings/${a.id}`}
                    className="flex items-center justify-between bg-dark-700/50 rounded-lg p-2.5 hover:bg-dark-700 transition-colors">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-white truncate">{a.guest_name || 'Unknown'}</div>
                      <div className="text-xs text-gray-500">{a.apartment_name} · {a.adults} adults{a.children > 0 ? `, ${a.children} kids` : ''}</div>
                    </div>
                    <div className="text-right flex-shrink-0 ml-2">
                      <div className="text-xs text-primary-400">{a.arrival_date}</div>
                      {a.payment_status && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${PAYMENT_STATE_COLORS[a.payment_status] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'}`}>
                          {paymentStateLabel(a.payment_status)}
                        </span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Recent Unpaid */}
          {dashboard.recentUnpaidBookings?.length > 0 && (
            <div className="bg-dark-800 rounded-xl border border-dark-700 p-4">
              <h3 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-3">Recent Unpaid</h3>
              <div className="space-y-2">
                {dashboard.recentUnpaidBookings.map((b: any) => (
                  <Link key={b.id} to={`/bookings/${b.id}`}
                    className="flex items-center justify-between bg-dark-700/50 rounded-lg p-2.5 hover:bg-dark-700 transition-colors">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-white truncate">{b.guest_name || '—'}</div>
                      <div className="text-xs text-gray-500">{b.apartment_name} · {b.arrival_date} → {b.departure_date}</div>
                    </div>
                    <div className="text-right flex-shrink-0 ml-2">
                      <div className="text-xs text-green-400">€{Number(b.price_paid || 0).toFixed(0)}</div>
                      <div className="text-xs text-red-400">/ €{Number(b.price_total || 0).toFixed(0)}</div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Recent Submissions */}
          {dashboard.recentSubmissions?.length > 0 && (
            <div className="bg-dark-800 rounded-xl border border-dark-700 p-4">
              <h3 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-3">Recent Submissions</h3>
              <div className="space-y-2">
                {dashboard.recentSubmissions.map((s: any) => (
                  <div key={s.id} className="flex items-center justify-between bg-dark-700/50 rounded-lg p-2.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        {s.outcome === 'success' ? <CheckCircle size={12} className="text-green-400" /> : <XCircle size={12} className="text-red-400" />}
                        <span className="text-sm text-white truncate">{s.guest_name || '—'}</span>
                      </div>
                      <div className="text-xs text-gray-500">{s.unit_name} · {s.check_in} → {s.check_out}</div>
                    </div>
                    <div className="text-right flex-shrink-0 ml-2">
                      {s.gross_total && <div className="text-xs text-white">€{Number(s.gross_total).toFixed(0)}</div>}
                      {s.payment_method && <div className="text-[10px] text-gray-500">{s.payment_method}</div>}
                      <div className="text-[10px] text-gray-600">{new Date(s.created_at).toLocaleDateString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sync Health */}
          {dashboard.syncHealth && (
            <div className="bg-dark-800 rounded-xl border border-dark-700 p-4">
              <h3 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-3">Sync Health</h3>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Mirrored Bookings</span>
                  <span className="text-white font-medium">{dashboard.syncHealth.mirroredBookingCount}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Last Sync</span>
                  <span className="text-white">
                    {dashboard.syncHealth.lastSyncAt ? new Date(dashboard.syncHealth.lastSyncAt).toLocaleString() : 'Never'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Search guest, email, reference..."
            className="w-full pl-9 pr-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}
          className="bg-dark-700 border border-dark-600 rounded-lg text-sm text-white px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary-500">
          <option value="">All Statuses</option>
          <option value="new">New</option>
          <option value="confirmed">Confirmed</option>
          <option value="checked-in">Checked In</option>
          <option value="checked-out">Checked Out</option>
          <option value="cancelled">Cancelled</option>
          <option value="no-show">No Show</option>
        </select>
        <select value={paymentStatus} onChange={e => { setPaymentStatus(e.target.value); setPage(1) }}
          className="bg-dark-700 border border-dark-600 rounded-lg text-sm text-white px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary-500">
          <option value="">All Payments</option>
          <option value="paid">Paid</option>
          <option value="pending">Pending</option>
          <option value="invoice_waiting">Invoice Waiting</option>
          <option value="channel_managed">Channel Managed</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-dark-800 rounded-xl border border-dark-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-dark-700 text-gray-500 text-xs uppercase tracking-wider">
                <th className="text-left p-3">Guest</th>
                <th className="text-left p-3">Unit</th>
                <th className="text-left p-3">Arrival</th>
                <th className="text-left p-3">Departure</th>
                <th className="text-right p-3">Total</th>
                <th className="text-right p-3">Balance</th>
                <th className="text-left p-3">Channel</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Payment</th>
                <th className="text-center p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={10} className="p-8 text-center text-gray-500">Loading...</td></tr>
              ) : bookings.length === 0 ? (
                <tr><td colSpan={10} className="p-8 text-center text-gray-500">No bookings found.</td></tr>
              ) : bookings.map((b: any) => (
                <tr key={b.id} className="border-b border-dark-700/50 hover:bg-dark-700/30">
                  <td className="p-3">
                    <div className="text-white font-medium">{b.guest_name || '—'}</div>
                    <div className="text-gray-500 text-xs">{b.guest_email || ''}</div>
                  </td>
                  <td className="p-3 text-gray-300">{b.apartment_name || '—'}</td>
                  <td className="p-3 text-gray-300">{b.arrival_date || '—'}</td>
                  <td className="p-3 text-gray-300">{b.departure_date || '—'}</td>
                  <td className="p-3 text-right text-white font-medium">
                    {b.price_total ? `€${Number(b.price_total).toLocaleString()}` : '—'}
                  </td>
                  <td className="p-3 text-right">
                    {b.balance_due > 0 ? (
                      <span className="text-red-400 font-medium">€{Number(b.balance_due).toLocaleString()}</span>
                    ) : (
                      <span className="text-green-400/60 text-xs">Settled</span>
                    )}
                  </td>
                  <td className="p-3 text-gray-400 text-xs">{b.channel_name || '—'}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[b.internal_status] || 'bg-gray-500/20 text-gray-400'}`}>
                      {b.internal_status || 'new'}
                    </span>
                  </td>
                  <td className="p-3">
                    {b.payment_status && (
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium border ${PAYMENT_STATE_COLORS[b.payment_status] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'}`}>
                        {paymentStateLabel(b.payment_status)}
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-center">
                    <Link to={`/bookings/${b.id}`}
                      className="inline-flex items-center gap-1 text-primary-400 hover:text-primary-300 text-xs">
                      <Eye size={12} /> View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {lastPage > 1 && (
          <div className="flex items-center justify-between p-3 border-t border-dark-700">
            <span className="text-xs text-gray-500">Page {page} of {lastPage} ({data?.total ?? 0} total)</span>
            <div className="flex gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="p-1.5 rounded bg-dark-700 text-gray-400 hover:text-white disabled:opacity-30">
                <ChevronLeft size={14} />
              </button>
              <button onClick={() => setPage(p => Math.min(lastPage, p + 1))} disabled={page === lastPage}
                className="p-1.5 rounded bg-dark-700 text-gray-400 hover:text-white disabled:opacity-30">
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
