import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Search, ChevronLeft, ChevronRight, Filter, RefreshCw, Eye, Calendar, DollarSign, Users, TrendingUp } from 'lucide-react'
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

export function Bookings() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [syncing, setSyncing] = useState(false)

  const params: any = { page, per_page: 25 }
  if (search) params.search = search
  if (status) params.status = status

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['bookings-engine', params],
    queryFn: () => api.get('/v1/admin/bookings', { params }).then(r => r.data),
  })

  const { data: dashboard } = useQuery({
    queryKey: ['bookings-dashboard'],
    queryFn: () => api.get('/v1/admin/bookings/dashboard').then(r => r.data),
    staleTime: 60_000,
  })

  const bookings = data?.data ?? []
  const lastPage = data?.last_page ?? 1

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

  return (
    <div className="space-y-6">
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

      {/* KPI Cards */}
      {dashboard && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'Total Bookings', value: dashboard.total, icon: Calendar, color: 'text-blue-400' },
            { label: 'Revenue', value: `€${(dashboard.revenue || 0).toLocaleString()}`, icon: DollarSign, color: 'text-green-400' },
            { label: 'Confirmed', value: dashboard.confirmed, icon: TrendingUp, color: 'text-emerald-400' },
            { label: 'Cancelled', value: dashboard.cancelled, icon: Filter, color: 'text-red-400' },
            { label: 'Avg Stay', value: `${dashboard.avg_nights || 0} nights`, icon: Users, color: 'text-purple-400' },
          ].map(kpi => (
            <div key={kpi.label} className="bg-dark-800 rounded-xl border border-dark-700 p-4">
              <div className="flex items-center gap-2 mb-1">
                <kpi.icon size={14} className={kpi.color} />
                <span className="text-xs text-gray-500">{kpi.label}</span>
              </div>
              <div className="text-xl font-bold text-white">{kpi.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Upcoming Arrivals */}
      {dashboard?.arrivals?.length > 0 && (
        <div className="bg-dark-800 rounded-xl border border-dark-700 p-4">
          <h3 className="text-sm font-medium text-gray-400 mb-3">Upcoming Arrivals (Next 7 Days)</h3>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {dashboard.arrivals.map((a: any) => (
              <Link key={a.id} to={`/bookings/${a.id}`}
                className="flex-shrink-0 bg-dark-700 rounded-lg p-3 min-w-[180px] hover:bg-dark-600 transition-colors">
                <div className="text-sm font-medium text-white truncate">{a.guest_name || 'Unknown'}</div>
                <div className="text-xs text-gray-500 mt-1">{a.apartment_name}</div>
                <div className="text-xs text-primary-400 mt-1">{a.arrival_date} → {a.departure_date}</div>
                <div className="text-xs text-gray-500">{a.adults} adults{a.children > 0 ? `, ${a.children} children` : ''}</div>
              </Link>
            ))}
          </div>
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
                <th className="text-left p-3">Guests</th>
                <th className="text-right p-3">Total</th>
                <th className="text-left p-3">Channel</th>
                <th className="text-left p-3">Status</th>
                <th className="text-center p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={9} className="p-8 text-center text-gray-500">Loading...</td></tr>
              ) : bookings.length === 0 ? (
                <tr><td colSpan={9} className="p-8 text-center text-gray-500">No bookings found. Sync from your PMS or wait for incoming reservations.</td></tr>
              ) : bookings.map((b: any) => (
                <tr key={b.id} className="border-b border-dark-700/50 hover:bg-dark-700/30">
                  <td className="p-3">
                    <div className="text-white font-medium">{b.guest_name || '—'}</div>
                    <div className="text-gray-500 text-xs">{b.guest_email || ''}</div>
                  </td>
                  <td className="p-3 text-gray-300">{b.apartment_name || b.apartment_id || '—'}</td>
                  <td className="p-3 text-gray-300">{b.arrival_date || '—'}</td>
                  <td className="p-3 text-gray-300">{b.departure_date || '—'}</td>
                  <td className="p-3 text-gray-300">{b.adults || 0}{b.children > 0 ? `+${b.children}` : ''}</td>
                  <td className="p-3 text-right text-white font-medium">
                    {b.price_total ? `€${Number(b.price_total).toLocaleString()}` : '—'}
                  </td>
                  <td className="p-3 text-gray-400 text-xs">{b.channel_name || '—'}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[b.internal_status] || 'bg-gray-500/20 text-gray-400'}`}>
                      {b.internal_status || 'new'}
                    </span>
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
            <span className="text-xs text-gray-500">Page {page} of {lastPage}</span>
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
