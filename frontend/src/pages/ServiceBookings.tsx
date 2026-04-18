import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import toast from 'react-hot-toast'
import {
  Search, Filter, Calendar as CalendarIcon, RefreshCw, X, Plus,
  CheckCircle2, AlertCircle,
} from 'lucide-react'
import { PairTabs, BOOKINGS_TABS } from '../components/PairTabs'
import { money } from '../lib/money'

interface ServiceBooking {
  id: number
  booking_reference: string
  service: { id: number; name: string } | null
  master: { id: number; name: string } | null
  customer_name: string
  customer_email: string
  customer_phone: string | null
  party_size: number
  start_at: string
  end_at: string
  duration_minutes: number
  total_amount: number
  currency: string
  status: string
  payment_status: string
}

interface Paginated {
  data: ServiceBooking[]
  current_page: number
  last_page: number
  total: number
}

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'pending',     label: 'Pending' },
  { value: 'confirmed',   label: 'Confirmed' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed',   label: 'Completed' },
  { value: 'cancelled',   label: 'Cancelled' },
  { value: 'no_show',     label: 'No-show' },
]

const STATUS_COLOR: Record<string, string> = {
  pending:     'bg-yellow-500/15 text-yellow-400',
  confirmed:   'bg-emerald-500/15 text-emerald-400',
  in_progress: 'bg-blue-500/15 text-blue-400',
  completed:   'bg-green-600/15 text-green-300',
  cancelled:   'bg-red-500/15 text-red-400',
  no_show:     'bg-orange-500/15 text-orange-400',
}

const PAYMENT_COLOR: Record<string, string> = {
  unpaid:   'bg-gray-500/15 text-gray-300',
  paid:     'bg-emerald-500/15 text-emerald-400',
  refunded: 'bg-purple-500/15 text-purple-300',
  failed:   'bg-red-500/15 text-red-400',
}

const card = 'rounded-2xl border border-white/[0.06]'
const cardBg = { background: 'linear-gradient(135deg, rgba(15,28,24,0.5), rgba(10,18,16,0.6))', backdropFilter: 'blur(20px)' }
const inputCls = 'w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5 text-sm text-white placeholder-gray-500 outline-none focus:border-primary-500/50 focus:ring-1 focus:ring-primary-500/20 transition-all'
const btnPrimaryStyle = { background: 'linear-gradient(135deg, var(--color-primary, #74c895), color-mix(in srgb, var(--color-primary, #74c895) 80%, #000))', color: '#fff' }

export default function ServiceBookings() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [showCreate, setShowCreate] = useState(false)
  const [active, setActive] = useState<ServiceBooking | null>(null)

  const { data, isLoading } = useQuery<Paginated>({
    queryKey: ['service-bookings', { search, status, page }],
    queryFn: () => api.get('/v1/admin/service-bookings', {
      params: { search, status, page },
    }).then(r => r.data),
  })

  const { data: dashboard } = useQuery<any>({
    queryKey: ['service-bookings-dashboard'],
    queryFn: () => api.get('/v1/admin/service-bookings/dashboard').then(r => r.data),
  })

  const updateStatusMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      api.patch(`/v1/admin/service-bookings/${id}/status`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['service-bookings'] })
      qc.invalidateQueries({ queryKey: ['service-bookings-dashboard'] })
      toast.success('Status updated')
    },
  })

  return (
    <div className="space-y-6">
      <PairTabs tabs={BOOKINGS_TABS} />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Service Bookings</h1>
          <p className="text-xs text-gray-500 mt-1">Reservations from your services widget, plus manual walk-ins.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/service-bookings/calendar"
            className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold uppercase tracking-wider bg-white/[0.04] border border-white/[0.06] text-gray-300 hover:text-white transition-all">
            <CalendarIcon size={14} /> Calendar
          </Link>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-all" style={btnPrimaryStyle}>
            <Plus size={14} /> New Booking
          </button>
        </div>
      </div>

      {/* KPI strip */}
      {dashboard && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {dashboard.kpis.map((k: any) => (
            <div key={k.key} className={card + ' p-4'} style={cardBg}>
              <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">{k.label}</div>
              <div className="text-xl font-bold text-white mt-1">
                {typeof k.value === 'number' && k.key === 'revenue' ? money(k.value) : k.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className={card + ' p-3 flex items-center gap-2'} style={cardBg}>
        <div className="relative flex-1 max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Search by name, email, reference…" className={inputCls + ' pl-9'} />
        </div>
        <Filter size={14} className="text-gray-500 ml-2" />
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1) }} className={inputCls + ' max-w-xs'}>
          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className={card + ' overflow-hidden'} style={cardBg}>
        {isLoading ? (
          <div className="flex justify-center py-20"><RefreshCw size={20} className="animate-spin text-gray-500" /></div>
        ) : (data?.data || []).length === 0 ? (
          <div className="text-center py-20">
            <CalendarIcon size={36} className="mx-auto text-gray-600 mb-3" />
            <p className="text-gray-400 font-medium">No bookings found</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-[10px] font-bold uppercase tracking-wider text-gray-500 border-b border-white/[0.04]">
              <tr>
                <th className="text-left p-4">Reference</th>
                <th className="text-left p-4">Service / Master</th>
                <th className="text-left p-4">Customer</th>
                <th className="text-left p-4">Start</th>
                <th className="text-left p-4">Total</th>
                <th className="text-left p-4">Status</th>
                <th className="text-left p-4">Payment</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(data?.data || []).map(b => (
                <tr key={b.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] cursor-pointer" onClick={() => setActive(b)}>
                  <td className="p-4 font-mono text-xs text-gray-400">{b.booking_reference}</td>
                  <td className="p-4">
                    <div className="text-white font-medium">{b.service?.name || '—'}</div>
                    {b.master && <div className="text-xs text-gray-500">{b.master.name}</div>}
                  </td>
                  <td className="p-4">
                    <div className="text-white">{b.customer_name}</div>
                    <div className="text-xs text-gray-500">{b.customer_email}</div>
                  </td>
                  <td className="p-4 text-gray-300">{new Date(b.start_at).toLocaleString()}</td>
                  <td className="p-4 font-bold text-white">{money(b.total_amount, b.currency)}</td>
                  <td className="p-4">
                    <span className={`text-[10px] px-2 py-1 rounded-full font-bold uppercase ${STATUS_COLOR[b.status] || 'bg-white/[0.05] text-gray-400'}`}>
                      {b.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="p-4">
                    <span className={`text-[10px] px-2 py-1 rounded-full font-bold uppercase ${PAYMENT_COLOR[b.payment_status] || 'bg-white/[0.05] text-gray-400'}`}>
                      {b.payment_status}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    {b.status === 'pending' && (
                      <button onClick={e => { e.stopPropagation(); updateStatusMut.mutate({ id: b.id, status: 'confirmed' }) }}
                        className="text-xs text-emerald-400 hover:text-emerald-300 font-bold">Confirm</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {(data?.last_page || 1) > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-white/[0.04]">
            <div className="text-xs text-gray-500">Page {data?.current_page} of {data?.last_page} — {data?.total} bookings</div>
            <div className="flex gap-2">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                className="px-3 py-1.5 text-xs rounded-lg bg-white/[0.04] border border-white/[0.06] text-gray-300 disabled:opacity-30">Prev</button>
              <button disabled={page >= (data?.last_page || 1)} onClick={() => setPage(p => p + 1)}
                className="px-3 py-1.5 text-xs rounded-lg bg-white/[0.04] border border-white/[0.06] text-gray-300 disabled:opacity-30">Next</button>
            </div>
          </div>
        )}
      </div>

      {active && <BookingDetailDrawer booking={active} onClose={() => setActive(null)} onChanged={() => qc.invalidateQueries({ queryKey: ['service-bookings'] })} />}
      {showCreate && <ManualBookingForm onClose={() => setShowCreate(false)} onSaved={() => { qc.invalidateQueries({ queryKey: ['service-bookings'] }); setShowCreate(false) }} />}
    </div>
  )
}

function BookingDetailDrawer({ booking, onClose, onChanged }: { booking: ServiceBooking; onClose: () => void; onChanged: () => void }) {
  const qc = useQueryClient()
  const { data: detail } = useQuery<any>({
    queryKey: ['service-booking-detail', booking.id],
    queryFn: () => api.get(`/v1/admin/service-bookings/${booking.id}`).then(r => r.data),
  })

  const [savingStatus, setSavingStatus] = useState(false)
  const [status, setStatus] = useState(booking.status)
  const [paymentStatus, setPaymentStatus] = useState(booking.payment_status)
  const [staffNotes, setStaffNotes] = useState('')

  const save = async () => {
    setSavingStatus(true)
    try {
      await api.patch(`/v1/admin/service-bookings/${booking.id}/status`, {
        status, payment_status: paymentStatus, staff_notes: staffNotes || undefined,
      })
      toast.success('Updated')
      qc.invalidateQueries({ queryKey: ['service-booking-detail', booking.id] })
      onChanged()
    } catch {
      toast.error('Failed to update')
    } finally {
      setSavingStatus(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-end overflow-y-auto">
      <div className="w-full max-w-md min-h-full bg-[#0a1210] border-l border-white/[0.08] p-6 overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">{booking.booking_reference}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/[0.06] text-gray-500"><X size={18} /></button>
        </div>

        <div className="space-y-1 mb-6">
          <p className="text-xs text-gray-500">Service</p>
          <p className="text-white font-medium">{booking.service?.name || '—'}</p>
          {booking.master && <p className="text-xs text-gray-400">Master: {booking.master.name}</p>}
        </div>

        <div className="space-y-1 mb-6">
          <p className="text-xs text-gray-500">Customer</p>
          <p className="text-white font-medium">{booking.customer_name}</p>
          <p className="text-xs text-gray-400">{booking.customer_email}</p>
          {booking.customer_phone && <p className="text-xs text-gray-400">{booking.customer_phone}</p>}
          <p className="text-xs text-gray-500 mt-1">Party size: {booking.party_size}</p>
        </div>

        <div className="space-y-1 mb-6">
          <p className="text-xs text-gray-500">Schedule</p>
          <p className="text-white font-medium">{new Date(booking.start_at).toLocaleString()}</p>
          <p className="text-xs text-gray-400">→ {new Date(booking.end_at).toLocaleTimeString()} ({booking.duration_minutes} min)</p>
        </div>

        {detail?.extras && detail.extras.length > 0 && (
          <div className="space-y-2 mb-6">
            <p className="text-xs text-gray-500">Extras</p>
            {detail.extras.map((e: any) => (
              <div key={e.id} className="flex items-center justify-between text-xs">
                <span className="text-gray-300">{e.name} × {e.quantity}</span>
                <span className="text-white font-medium">{money(e.line_total, booking.currency)}</span>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-1 mb-6">
          <p className="text-xs text-gray-500">Total</p>
          <p className="text-2xl font-bold text-white">{money(booking.total_amount, booking.currency)}</p>
        </div>

        <hr className="border-white/[0.06] my-4" />

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1.5">Status</label>
            <select value={status} onChange={e => setStatus(e.target.value)} className={inputCls}>
              {STATUS_OPTIONS.filter(o => o.value).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1.5">Payment</label>
            <select value={paymentStatus} onChange={e => setPaymentStatus(e.target.value)} className={inputCls}>
              <option value="unpaid">Unpaid</option>
              <option value="paid">Paid</option>
              <option value="refunded">Refunded</option>
              <option value="failed">Failed</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1.5">Staff note</label>
            <textarea value={staffNotes} onChange={e => setStaffNotes(e.target.value)} rows={3} className={inputCls + ' resize-none'} />
          </div>
          <button onClick={save} disabled={savingStatus}
            className="w-full flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-all" style={btnPrimaryStyle}>
            {savingStatus ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Save Changes
          </button>
        </div>
      </div>
    </div>
  )
}

function ManualBookingForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { data: services = [] } = useQuery<any[]>({
    queryKey: ['services-min'],
    queryFn: () => api.get('/v1/admin/services').then(r => r.data),
  })
  const { data: masters = [] } = useQuery<any[]>({
    queryKey: ['service-masters-min'],
    queryFn: () => api.get('/v1/admin/service-masters').then(r => r.data),
  })

  const [serviceId, setServiceId] = useState<number | ''>('')
  const [masterId, setMasterId] = useState<number | ''>('')
  const [date, setDate] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [partySize, setPartySize] = useState(1)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [slots, setSlots] = useState<any[]>([])
  const [slotStart, setSlotStart] = useState('')

  const loadSlots = async () => {
    if (!serviceId || !date) return
    try {
      const r = await api.get('/v1/admin/service-bookings/availability', {
        params: { service_id: serviceId, master_id: masterId || undefined, date },
      })
      setSlots(r.data.slots || [])
      if ((r.data.slots || []).length === 0) toast('No slots available for that day', { icon: <AlertCircle className="text-yellow-400" size={16} /> })
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Failed to load slots')
    }
  }

  const submit = async () => {
    if (!serviceId || !slotStart || !name || !email) {
      toast.error('Service, slot, name and email are required')
      return
    }
    setSaving(true)
    try {
      await api.post('/v1/admin/service-bookings', {
        service_id: serviceId,
        service_master_id: masterId || undefined,
        start_at: slotStart,
        customer_name: name,
        customer_email: email,
        customer_phone: phone || undefined,
        party_size: partySize,
        source: 'admin',
        staff_notes: notes || undefined,
      })
      toast.success('Booking created')
      onSaved()
    } catch (e: any) {
      toast.error(e?.response?.data?.error || e?.response?.data?.message || 'Failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center pt-[5vh] overflow-y-auto pb-10">
      <div className="w-full max-w-xl rounded-2xl border border-white/[0.08] p-6" style={{ background: 'linear-gradient(135deg, rgba(15,28,24,0.95), rgba(10,18,16,0.98))' }}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-white">New Booking</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/[0.06] text-gray-500"><X size={18} /></button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1.5">Service *</label>
              <select value={serviceId} onChange={e => { setServiceId(e.target.value ? Number(e.target.value) : ''); setSlots([]); setSlotStart('') }} className={inputCls}>
                <option value="">Select service…</option>
                {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1.5">Master (optional)</label>
              <select value={masterId} onChange={e => { setMasterId(e.target.value ? Number(e.target.value) : ''); setSlots([]); setSlotStart('') }} className={inputCls}>
                <option value="">Any available</option>
                {masters.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          </div>

          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-gray-400 mb-1.5">Date *</label>
              <input type="date" value={date} onChange={e => { setDate(e.target.value); setSlots([]); setSlotStart('') }} className={inputCls} />
            </div>
            <button onClick={loadSlots} className="px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-white/[0.04] border border-white/[0.06] text-gray-300">Find Slots</button>
          </div>

          {slots.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-2">Available slots</label>
              <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                {slots.map(s => (
                  <button key={s.start} onClick={() => setSlotStart(s.start)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                      slotStart === s.start
                        ? 'bg-primary-500/15 border-primary-500/30 text-primary-400'
                        : 'bg-white/[0.02] border-white/[0.06] text-gray-300 hover:border-white/[0.12]'
                    }`}>
                    {s.time_label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1.5">Customer name *</label>
              <input value={name} onChange={e => setName(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1.5">Email *</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1.5">Phone</label>
              <input value={phone} onChange={e => setPhone(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1.5">Party size</label>
              <input type="number" value={partySize} onChange={e => setPartySize(Number(e.target.value))} min={1} className={inputCls} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1.5">Staff notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className={inputCls + ' resize-none'} />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-white/[0.04]">
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-white/[0.04] border border-white/[0.06] text-gray-400">Cancel</button>
          <button onClick={submit} disabled={saving} className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-bold uppercase tracking-wider transition-all" style={btnPrimaryStyle}>
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
            Create Booking
          </button>
        </div>
      </div>
    </div>
  )
}
