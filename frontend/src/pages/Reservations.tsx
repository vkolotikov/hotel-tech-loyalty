import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useSettings, triggerExport } from '../lib/crmSettings'
import toast from 'react-hot-toast'
import { Search, ChevronLeft, ChevronRight, Plus, Download, Filter, LogIn, LogOut } from 'lucide-react'
import { BookingSubmissions } from './BookingSubmissions'
import { BrandBadge } from '../components/BrandBadge'

const STATUS_COLORS: Record<string, string> = {
  Confirmed: 'bg-blue-500/20 text-blue-400',
  'Checked In': 'bg-green-500/20 text-green-400',
  'Checked Out': 'bg-gray-500/20 text-gray-400',
  Cancelled: 'bg-red-500/20 text-red-400',
  'No Show': 'bg-orange-500/20 text-orange-400',
}

const PAYMENT_COLORS: Record<string, string> = {
  Pending: 'bg-yellow-500/20 text-yellow-400',
  'Deposit Paid': 'bg-blue-500/20 text-blue-400',
  'Fully Paid': 'bg-green-500/20 text-green-400',
  Refunded: 'bg-red-500/20 text-red-400',
  Comp: 'bg-purple-500/20 text-purple-400',
}

const EMPTY_FORM = {
  guest_id: '', property_id: '', check_in: '', check_out: '',
  num_rooms: '1', num_adults: '1', num_children: '0',
  room_type: '', room_number: '', rate_per_night: '', total_amount: '',
  meal_plan: '', payment_method: '', booking_channel: '',
  special_requests: '', notes: '',
}

type View = 'reservations' | 'submissions'

export function Reservations() {
  const qc = useQueryClient()
  const settings = useSettings()
  const [view, setView] = useState<View>('reservations')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [propertyId, setPropertyId] = useState('')
  const [roomType, setRoomType] = useState('')
  const [mealPlan, setMealPlan] = useState('')
  const [paymentStatus, setPaymentStatus] = useState('')
  const [bookingChannel, setBookingChannel] = useState('')
  const [checkInFrom, setCheckInFrom] = useState('')
  const [checkInTo, setCheckInTo] = useState('')
  const [quickFilter, setQuickFilter] = useState('')
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState('created_at')
  const [dir, setDir] = useState('desc')
  const [showCreate, setShowCreate] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [exporting, setExporting] = useState(false)

  const { data: propertiesData } = useQuery({
    queryKey: ['properties-list'],
    queryFn: () => api.get('/v1/admin/properties', { params: { per_page: 200 } }).then(r => r.data),
    staleTime: 5 * 60 * 1000,
  })
  const properties = propertiesData?.properties ?? propertiesData?.data ?? (Array.isArray(propertiesData) ? propertiesData : [])

  const params: any = { page, per_page: 25, sort, dir }
  if (search) params.search = search
  if (status) params.status = status
  if (propertyId) params.property_id = propertyId
  if (roomType) params.room_type = roomType
  if (mealPlan) params.meal_plan = mealPlan
  if (paymentStatus) params.payment_status = paymentStatus
  if (bookingChannel) params.booking_channel = bookingChannel
  if (checkInFrom) params.check_in_from = checkInFrom
  if (checkInTo) params.check_in_to = checkInTo
  if (quickFilter === 'arrivals_today') params.arrivals_today = 1
  if (quickFilter === 'departures_today') params.departures_today = 1
  if (quickFilter === 'in_house') params.in_house = 1

  const { data, isLoading } = useQuery({
    queryKey: ['reservations', params],
    queryFn: () => api.get('/v1/admin/reservations', { params }).then(r => r.data),
  })

  const createMutation = useMutation({
    mutationFn: (body: any) => api.post('/v1/admin/reservations', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['reservations'] }); setShowCreate(false); setForm({ ...EMPTY_FORM }); toast.success('Reservation created') },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  })

  const checkInMutation = useMutation({
    mutationFn: (id: number) => api.post(`/v1/admin/reservations/${id}/check-in`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['reservations'] }); toast.success('Guest checked in') },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Check-in failed'),
  })

  const checkOutMutation = useMutation({
    mutationFn: (id: number) => api.post(`/v1/admin/reservations/${id}/check-out`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['reservations'] }); toast.success('Guest checked out') },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Check-out failed'),
  })

  const handleExport = async () => {
    setExporting(true)
    try { await triggerExport('/v1/admin/reservations/export', params) }
    catch { toast.error('Export failed') } finally { setExporting(false) }
  }

  const autoTotal = useMemo(() => {
    const rate = parseFloat(form.rate_per_night)
    const rooms = parseInt(form.num_rooms) || 1
    if (!rate || !form.check_in || !form.check_out) return ''
    const nights = Math.max(1, Math.round((new Date(form.check_out).getTime() - new Date(form.check_in).getTime()) / 86400000))
    return (rate * nights * rooms).toFixed(2)
  }, [form.rate_per_night, form.check_in, form.check_out, form.num_rooms])

  const reservations = data?.data ?? []
  const meta = data?.meta ?? {}
  const hasFilters = status || propertyId || roomType || mealPlan || paymentStatus || bookingChannel || checkInFrom || checkInTo

  const toggleSort = (col: string) => {
    if (sort === col) setDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSort(col); setDir('desc') }
  }

  const SortHeader = ({ col, label }: { col: string; label: string }) => (
    <th className="text-left px-4 py-3 text-xs font-medium text-t-secondary cursor-pointer hover:text-gray-300 select-none whitespace-nowrap" onClick={() => toggleSort(col)}>
      {label} {sort === col ? (dir === 'asc' ? '↑' : '↓') : ''}
    </th>
  )

  const setQuick = (val: string) => { setQuickFilter(prev => prev === val ? '' : val); setPage(1) }
  const clearFilters = () => { setStatus(''); setPropertyId(''); setRoomType(''); setMealPlan(''); setPaymentStatus(''); setBookingChannel(''); setCheckInFrom(''); setCheckInTo(''); setPage(1) }
  const calcNights = (ci: string, co: string) => { if (!ci || !co) return '—'; const n = Math.round((new Date(co).getTime() - new Date(ci).getTime()) / 86400000); return n > 0 ? n : '—' }

  const inp = 'w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500'

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white">Reservations</h1>
          <p className="text-xs md:text-sm text-t-secondary mt-0.5">{view === 'reservations' ? `${meta.total ?? 0} total` : 'Booking widget submissions log'}</p>
        </div>
        {view === 'reservations' && (
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={handleExport} disabled={exporting} className="flex items-center gap-1.5 bg-dark-surface border border-dark-border hover:border-primary-500 text-t-secondary hover:text-white font-medium text-xs md:text-sm px-2.5 md:px-3 py-2 rounded-lg transition-colors disabled:opacity-50">
              <Download size={14} /> <span className="hidden sm:inline">Export</span>
            </button>
            <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 bg-primary-600 text-white px-3 md:px-4 py-2 rounded-lg text-xs md:text-sm font-semibold hover:bg-primary-700 transition-colors">
              <Plus size={15} /> <span className="hidden sm:inline">Add Reservation</span><span className="sm:hidden">Add</span>
            </button>
          </div>
        )}
      </div>

      {/* View tabs */}
      <div className="flex gap-1 border-b border-dark-border">
        {([
          { key: 'reservations' as const, label: 'Reservations' },
          { key: 'submissions' as const, label: 'Submissions' },
        ]).map(t => (
          <button key={t.key} onClick={() => setView(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${view === t.key ? 'border-primary-500 text-white' : 'border-transparent text-t-secondary hover:text-white'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {view === 'submissions' && <BookingSubmissions embedded />}

      {view === 'reservations' && <>
      {/* Quick filters — scroll horizontally on mobile if labels overflow */}
      <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
        {[
          { key: 'arrivals_today', label: 'Arrivals Today' },
          { key: 'departures_today', label: 'Departures Today' },
          { key: 'in_house', label: 'In-House' },
          { key: '', label: 'All' },
        ].map(({ key, label }) => (
          <button key={label} onClick={() => setQuick(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border whitespace-nowrap flex-shrink-0 ${quickFilter === key ? 'border-primary-500 bg-primary-500/10 text-primary-400' : 'border-dark-border text-t-secondary hover:text-white hover:border-dark-border2'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Search & Filters */}
      <div className="space-y-2">
        <div className="flex gap-3">
          <div className="relative flex-1 max-w-md">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#636366]" />
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} placeholder="Search confirmation no, guest name, company..." className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-[#636366] focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          <button onClick={() => setShowFilters(f => !f)} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${hasFilters ? 'border-primary-500 text-primary-400' : 'border-dark-border text-t-secondary hover:text-white'}`}>
            <Filter size={14} /> Filters {hasFilters ? '●' : ''}
          </button>
        </div>
        {showFilters && (
          <div className="flex flex-wrap gap-2 items-center">
            <select value={status} onChange={e => { setStatus(e.target.value); setPage(1) }} className="bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500">
              <option value="">All Statuses</option>
              {settings.reservation_statuses.map(s => <option key={s}>{s}</option>)}
            </select>
            <select value={propertyId} onChange={e => { setPropertyId(e.target.value); setPage(1) }} className="bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500">
              <option value="">All Properties</option>
              {properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select value={roomType} onChange={e => { setRoomType(e.target.value); setPage(1) }} className="bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500">
              <option value="">All Room Types</option>
              {settings.room_types.map(s => <option key={s}>{s}</option>)}
            </select>
            <select value={mealPlan} onChange={e => { setMealPlan(e.target.value); setPage(1) }} className="bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500">
              <option value="">All Meal Plans</option>
              {settings.meal_plans.map(s => <option key={s}>{s}</option>)}
            </select>
            <select value={paymentStatus} onChange={e => { setPaymentStatus(e.target.value); setPage(1) }} className="bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500">
              <option value="">All Payments</option>
              {settings.payment_statuses.map(s => <option key={s}>{s}</option>)}
            </select>
            <select value={bookingChannel} onChange={e => { setBookingChannel(e.target.value); setPage(1) }} className="bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500">
              <option value="">All Channels</option>
              {settings.booking_channels.map(s => <option key={s}>{s}</option>)}
            </select>
            <div className="flex items-center gap-1">
              <span className="text-xs text-t-secondary">From</span>
              <input type="date" value={checkInFrom} onChange={e => { setCheckInFrom(e.target.value); setPage(1) }} className="bg-dark-surface border border-dark-border rounded-lg px-2 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs text-t-secondary">To</span>
              <input type="date" value={checkInTo} onChange={e => { setCheckInTo(e.target.value); setPage(1) }} className="bg-dark-surface border border-dark-border rounded-lg px-2 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            {hasFilters && <button onClick={clearFilters} className="text-xs text-[#636366] hover:text-white px-2">Clear</button>}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-dark-surface border border-dark-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-dark-border">
              <SortHeader col="confirmation_no" label="Conf. No" />
              <th className="text-left px-4 py-3 text-xs font-medium text-t-secondary">Guest</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-t-secondary">Property</th>
              <SortHeader col="check_in" label="Check-in" />
              <SortHeader col="check_out" label="Check-out" />
              <th className="text-left px-4 py-3 text-xs font-medium text-t-secondary">Nights</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-t-secondary">Room</th>
              <SortHeader col="total_amount" label="Total" />
              <th className="text-left px-4 py-3 text-xs font-medium text-t-secondary">Payment</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-t-secondary">Status</th>
              <th className="px-4 py-3 text-xs font-medium text-t-secondary">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={11} className="px-4 py-8 text-center text-[#636366]">Loading...</td></tr>}
            {!isLoading && reservations.length === 0 && <tr><td colSpan={11} className="px-4 py-8 text-center text-[#636366]">No reservations found</td></tr>}
            {reservations.map((r: any) => (
              <tr key={r.id} className="border-b border-dark-border/50 hover:bg-dark-surface2 transition-colors">
                <td className="px-4 py-3 text-primary-400 font-medium text-xs">{r.confirmation_no ?? '—'}</td>
                <td className="px-4 py-3">
                  <div className="font-medium text-white text-sm flex items-center gap-1.5 flex-wrap">
                    {r.guest?.full_name ?? '—'}
                    <BrandBadge brandId={r.brand_id} />
                  </div>
                  <div className="text-xs text-[#636366]">{r.guest?.company ?? ''}</div>
                </td>
                <td className="px-4 py-3 text-[#a0a0a0] text-xs">{r.property?.name ?? '—'}</td>
                <td className="px-4 py-3 text-gray-300 text-xs">{r.check_in ?? '—'}</td>
                <td className="px-4 py-3 text-gray-300 text-xs">{r.check_out ?? '—'}</td>
                <td className="px-4 py-3 text-[#a0a0a0] text-xs">{calcNights(r.check_in, r.check_out)}</td>
                <td className="px-4 py-3 text-[#a0a0a0] text-xs">{r.room_type ?? '—'}{r.room_number ? ` #${r.room_number}` : ''}</td>
                <td className="px-4 py-3 text-gray-300 text-xs font-medium">{r.total_amount != null ? `${settings.currency_symbol}${Number(r.total_amount).toLocaleString()}` : '—'}</td>
                <td className="px-4 py-3">
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${PAYMENT_COLORS[r.payment_status] ?? 'bg-gray-500/20 text-t-secondary'}`}>
                    {r.payment_status ?? '—'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${STATUS_COLORS[r.status] ?? 'bg-gray-500/20 text-t-secondary'}`}>
                    {r.status ?? '—'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    {r.status === 'Confirmed' && (
                      <button onClick={() => checkInMutation.mutate(r.id)} disabled={checkInMutation.isPending}
                        className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors disabled:opacity-50"
                        title="Check In">
                        <LogIn size={12} /> In
                      </button>
                    )}
                    {r.status === 'Checked In' && (
                      <button onClick={() => checkOutMutation.mutate(r.id)} disabled={checkOutMutation.isPending}
                        className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-gray-500/10 text-[#a0a0a0] hover:bg-gray-500/20 transition-colors disabled:opacity-50"
                        title="Check Out">
                        <LogOut size={12} /> Out
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {meta.last_page > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-t-secondary">Page {meta.current_page} of {meta.last_page}</span>
          <div className="flex gap-2">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="p-1.5 rounded-lg border border-dark-border text-[#a0a0a0] hover:text-white disabled:opacity-40"><ChevronLeft size={15} /></button>
            <button disabled={page === meta.last_page} onClick={() => setPage(p => p + 1)} className="p-1.5 rounded-lg border border-dark-border text-[#a0a0a0] hover:text-white disabled:opacity-40"><ChevronRight size={15} /></button>
          </div>
        </div>
      )}

      </>}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-surface border border-dark-border rounded-2xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-white mb-4">Add Reservation</h2>
            <form onSubmit={e => {
              e.preventDefault()
              const total = form.total_amount || autoTotal
              createMutation.mutate({
                ...form,
                guest_id: parseInt(form.guest_id) || undefined,
                property_id: parseInt(form.property_id),
                num_rooms: parseInt(form.num_rooms) || 1,
                num_adults: parseInt(form.num_adults) || 1,
                num_children: parseInt(form.num_children) || 0,
                rate_per_night: parseFloat(form.rate_per_night) || 0,
                total_amount: parseFloat(total) || 0,
              })
            }} className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-[#a0a0a0] mb-1">Guest ID</label>
                  <input type="number" value={form.guest_id} onChange={e => setForm(f => ({ ...f, guest_id: e.target.value }))} className={inp} />
                </div>
                <div>
                  <label className="block text-xs text-[#a0a0a0] mb-1">Property *</label>
                  <select required value={form.property_id} onChange={e => setForm(f => ({ ...f, property_id: e.target.value }))} className={inp}>
                    <option value="">-- Select --</option>
                    {properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-[#a0a0a0] mb-1">Booking Channel</label>
                  <select value={form.booking_channel} onChange={e => setForm(f => ({ ...f, booking_channel: e.target.value }))} className={inp}>
                    <option value="">-- Select --</option>
                    {settings.booking_channels.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-[#a0a0a0] mb-1">Check-in *</label>
                  <input required type="date" value={form.check_in} onChange={e => setForm(f => ({ ...f, check_in: e.target.value }))} className={inp} />
                </div>
                <div>
                  <label className="block text-xs text-[#a0a0a0] mb-1">Check-out *</label>
                  <input required type="date" value={form.check_out} onChange={e => setForm(f => ({ ...f, check_out: e.target.value }))} className={inp} />
                </div>
                <div>
                  <label className="block text-xs text-[#a0a0a0] mb-1">Rooms</label>
                  <input type="number" min="1" value={form.num_rooms} onChange={e => setForm(f => ({ ...f, num_rooms: e.target.value }))} className={inp} />
                </div>
                <div>
                  <label className="block text-xs text-[#a0a0a0] mb-1">Room Type</label>
                  <select value={form.room_type} onChange={e => setForm(f => ({ ...f, room_type: e.target.value }))} className={inp}>
                    <option value="">-- Select --</option>
                    {settings.room_types.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-[#a0a0a0] mb-1">Room Number</label>
                  <input value={form.room_number} onChange={e => setForm(f => ({ ...f, room_number: e.target.value }))} className={inp} />
                </div>
                <div>
                  <label className="block text-xs text-[#a0a0a0] mb-1">Rate/Night ({settings.currency_symbol})</label>
                  <input type="number" step="0.01" value={form.rate_per_night} onChange={e => setForm(f => ({ ...f, rate_per_night: e.target.value }))} className={inp} />
                </div>
                <div>
                  <label className="block text-xs text-[#a0a0a0] mb-1">Total ({settings.currency_symbol}) {autoTotal && !form.total_amount ? `auto: ${autoTotal}` : ''}</label>
                  <input type="number" step="0.01" value={form.total_amount} onChange={e => setForm(f => ({ ...f, total_amount: e.target.value }))} placeholder={autoTotal || ''} className={`${inp} placeholder-[#636366]`} />
                </div>
                <div>
                  <label className="block text-xs text-[#a0a0a0] mb-1">Meal Plan</label>
                  <select value={form.meal_plan} onChange={e => setForm(f => ({ ...f, meal_plan: e.target.value }))} className={inp}>
                    <option value="">-- Select --</option>
                    {settings.meal_plans.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-[#a0a0a0] mb-1">Payment Method</label>
                  <select value={form.payment_method} onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))} className={inp}>
                    <option value="">-- Select --</option>
                    {settings.payment_methods.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-[#a0a0a0] mb-1">Special Requests</label>
                <textarea value={form.special_requests} onChange={e => setForm(f => ({ ...f, special_requests: e.target.value }))} rows={2} className={`${inp} resize-none`} />
              </div>
              <div>
                <label className="block text-xs text-[#a0a0a0] mb-1">Notes</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className={`${inp} resize-none`} />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-[#a0a0a0] hover:text-white">Cancel</button>
                <button type="submit" disabled={createMutation.isPending} className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold text-sm rounded-lg disabled:opacity-50">
                  {createMutation.isPending ? 'Saving...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
