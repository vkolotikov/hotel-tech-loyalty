import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { ChevronLeft, ChevronRight, Clock, User, Scissors, X } from 'lucide-react'

interface ServiceBookingLite {
  id: number
  booking_reference: string
  service_id: number
  service_master_id: number | null
  customer_name: string
  start_at: string
  end_at: string | null
  duration_minutes: number
  status: string
  payment_status: string
  total_amount: number | string
  service?: { id: number; name: string; duration_minutes?: number } | null
  master?: { id: number; name: string } | null
}

const STATUS_STYLES: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  pending:     { bg: 'rgba(234,179,8,0.14)',   border: 'rgba(234,179,8,0.35)',   text: '#facc15', dot: '#facc15' },
  confirmed:   { bg: 'rgba(116,200,149,0.14)', border: 'rgba(116,200,149,0.35)', text: '#74c895', dot: '#74c895' },
  in_progress: { bg: 'rgba(90,180,178,0.14)',  border: 'rgba(90,180,178,0.35)',  text: '#5ab4b2', dot: '#5ab4b2' },
  completed:   { bg: 'rgba(59,130,246,0.14)',  border: 'rgba(59,130,246,0.35)',  text: '#60a5fa', dot: '#60a5fa' },
  cancelled:   { bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.3)',    text: '#f87171', dot: '#f87171' },
  no_show:     { bg: 'rgba(148,163,184,0.12)', border: 'rgba(148,163,184,0.3)',  text: '#94a3b8', dot: '#94a3b8' },
}
const DEFAULT_STYLE = STATUS_STYLES.pending

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function isoDay(iso: string) {
  return iso.slice(0, 10)
}

export default function ServiceBookingCalendar() {
  const [month, setMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [statusFilter, setStatusFilter] = useState('')
  const [masterFilter, setMasterFilter] = useState('')
  const [serviceFilter, setServiceFilter] = useState('')
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['service-booking-calendar', month],
    queryFn: () => api.get('/v1/admin/service-bookings/calendar', { params: { month } }).then(r => r.data),
  })

  const bookings: ServiceBookingLite[] = data?.bookings ?? []

  const { year, mon } = useMemo(() => {
    const [y, m] = month.split('-').map(Number)
    return { year: y, mon: m }
  }, [month])

  const nav = (d: number) => {
    let m = mon + d, y = year
    if (m < 1) { m = 12; y-- }
    if (m > 12) { m = 1; y++ }
    setMonth(`${y}-${String(m).padStart(2, '0')}`)
  }

  // Build full 6-week grid (Mon-first)
  const days = useMemo(() => {
    const first = new Date(year, mon - 1, 1)
    const last  = new Date(year, mon, 0)
    const sDow  = first.getDay() === 0 ? 6 : first.getDay() - 1
    const eDow  = last.getDay() === 0 ? 6 : last.getDay() - 1
    const result: string[] = []
    for (let i = -sDow; i <= last.getDate() - 1 + (6 - eDow); i++) {
      const d = new Date(year, mon - 1, i + 1)
      result.push(d.toISOString().slice(0, 10))
    }
    while (result.length < 42) {
      const d = new Date(result[result.length - 1])
      d.setDate(d.getDate() + 1)
      result.push(d.toISOString().slice(0, 10))
    }
    return result.slice(0, 42)
  }, [year, mon])

  const masters = useMemo(() => {
    const m = new Map<number, string>()
    bookings.forEach(b => { if (b.master) m.set(b.master.id, b.master.name) })
    return Array.from(m.entries())
  }, [bookings])

  const services = useMemo(() => {
    const m = new Map<number, string>()
    bookings.forEach(b => { if (b.service) m.set(b.service.id, b.service.name) })
    return Array.from(m.entries())
  }, [bookings])

  const filtered = useMemo(() => {
    return bookings.filter(b => {
      if (statusFilter && b.status !== statusFilter) return false
      if (masterFilter && String(b.service_master_id || '') !== masterFilter) return false
      if (serviceFilter && String(b.service_id) !== serviceFilter) return false
      return true
    })
  }, [bookings, statusFilter, masterFilter, serviceFilter])

  const byDay = useMemo(() => {
    const map = new Map<string, ServiceBookingLite[]>()
    filtered.forEach(b => {
      const k = isoDay(b.start_at)
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(b)
    })
    for (const [, list] of map) list.sort((a, b) => a.start_at.localeCompare(b.start_at))
    return map
  }, [filtered])

  const today = new Date().toISOString().slice(0, 10)
  const monthLabel = new Date(year, mon - 1).toLocaleString('default', { month: 'long', year: 'numeric' })
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  const dayTotals = useMemo(() => {
    let bookings = 0, revenue = 0
    filtered.forEach(b => {
      if (b.status !== 'cancelled') {
        bookings++
        revenue += Number(b.total_amount || 0)
      }
    })
    return { bookings, revenue }
  }, [filtered])

  const selectClass = 'bg-[#0f1c18] border border-white/[0.08] rounded-xl text-xs text-white px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary-500/40'

  const selectedBookings = selectedDay ? (byDay.get(selectedDay) || []) : []

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider mb-2"
            style={{ background: 'rgba(116,200,149,0.12)', color: '#74c895' }}>Service Calendar</div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Service Bookings</h1>
          <p className="text-xs text-gray-500 mt-1">
            {dayTotals.bookings} bookings &middot; {Number(dayTotals.revenue).toLocaleString(undefined, { maximumFractionDigits: 0 })} total value this month
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => nav(-1)} className="p-2 rounded-xl text-gray-500 hover:text-white transition-colors"
            style={{ background: 'rgba(22,40,35,0.6)', border: '1px solid rgba(255,255,255,0.06)' }}><ChevronLeft size={16} /></button>
          <span className="text-white font-semibold min-w-[170px] text-center text-sm">{monthLabel}</span>
          <button onClick={() => nav(1)} className="p-2 rounded-xl text-gray-500 hover:text-white transition-colors"
            style={{ background: 'rgba(22,40,35,0.6)', border: '1px solid rgba(255,255,255,0.06)' }}><ChevronRight size={16} /></button>
          <button onClick={() => {
            const d = new Date()
            setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
          }} className="px-3 py-1.5 rounded-xl text-xs font-semibold text-gray-400 hover:text-white transition-colors"
            style={{ background: 'rgba(22,40,35,0.6)', border: '1px solid rgba(255,255,255,0.06)' }}>Today</button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={selectClass}>
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="confirmed">Confirmed</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="no_show">No-show</option>
        </select>

        <select value={serviceFilter} onChange={e => setServiceFilter(e.target.value)} className={selectClass}>
          <option value="">All Services</option>
          {services.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>

        <select value={masterFilter} onChange={e => setMasterFilter(e.target.value)} className={selectClass}>
          <option value="">All Masters</option>
          {masters.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>

        <div className="flex gap-4 ml-auto">
          {Object.entries(STATUS_STYLES).filter(([k]) => k !== 'cancelled' && k !== 'no_show').map(([k, s]) => (
            <div key={k} className="flex items-center gap-1.5 text-[10px]">
              <div className="w-2 h-2 rounded-full" style={{ background: s.dot }} />
              <span className="text-gray-500 font-medium capitalize">{k.replace('_', ' ')}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Month grid */}
      <div className="rounded-2xl border border-white/[0.06] overflow-hidden"
        style={{ background: 'linear-gradient(180deg, rgba(18,24,22,0.96), rgba(14,20,18,0.98))' }}>
        {/* Weekday axis */}
        <div className="grid grid-cols-7 border-b border-white/[0.06]">
          {weekdays.map(w => (
            <div key={w} className="py-2 text-center text-[10px] font-bold uppercase tracking-wider text-gray-500 border-r border-white/[0.04] last:border-r-0">
              {w}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7">
          {days.map((d, idx) => {
            const inMonth = d.startsWith(month)
            const isToday = d === today
            const isWe = [5, 6].includes(idx % 7)
            const list = byDay.get(d) || []
            const visible = list.slice(0, 3)
            const more = list.length - visible.length
            return (
              <button key={d} onClick={() => list.length > 0 && setSelectedDay(d)}
                className="text-left border-r border-b border-white/[0.04] last:border-r-0 p-2 min-h-[108px] transition-colors hover:bg-white/[0.02] focus:outline-none"
                style={{
                  background: isToday ? 'rgba(116,200,149,0.05)' : isWe && inMonth ? 'rgba(217,143,69,0.02)' : 'transparent',
                  opacity: inMonth ? 1 : 0.35,
                  cursor: list.length > 0 ? 'pointer' : 'default',
                }}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`text-[11px] font-bold ${isToday ? 'text-emerald-400' : 'text-gray-400'}`}>
                    {new Date(d).getDate()}
                  </span>
                  {list.length > 0 && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-white/[0.04] text-gray-400">
                      {list.length}
                    </span>
                  )}
                </div>
                <div className="space-y-1">
                  {visible.map(b => {
                    const s = STATUS_STYLES[b.status] || DEFAULT_STYLE
                    return (
                      <div key={b.id}
                        className="text-[10px] px-1.5 py-1 rounded-md truncate"
                        style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.text }}
                        title={`${fmtTime(b.start_at)} ${b.customer_name} — ${b.service?.name || ''}`}>
                        <span className="font-bold">{fmtTime(b.start_at)}</span>
                        <span className="ml-1 opacity-80">{b.customer_name}</span>
                      </div>
                    )
                  })}
                  {more > 0 && (
                    <div className="text-[9px] text-gray-500 font-semibold px-1.5">+{more} more</div>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {isLoading && (
        <div className="text-center text-xs text-gray-600 py-4">Loading calendar…</div>
      )}

      {/* Day detail drawer */}
      {selectedDay && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-end" onClick={() => setSelectedDay(null)}>
          <div onClick={e => e.stopPropagation()}
            className="w-full max-w-md h-full overflow-y-auto border-l border-white/[0.08] p-6"
            style={{ background: 'linear-gradient(180deg, rgba(15,28,24,0.98), rgba(10,18,16,0.99))' }}>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-bold text-white">{new Date(selectedDay).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
                <p className="text-xs text-gray-500 mt-0.5">{selectedBookings.length} booking{selectedBookings.length === 1 ? '' : 's'}</p>
              </div>
              <button onClick={() => setSelectedDay(null)} className="p-2 rounded-lg hover:bg-white/[0.06] text-gray-500">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              {selectedBookings.map(b => {
                const s = STATUS_STYLES[b.status] || DEFAULT_STYLE
                return (
                  <Link key={b.id} to={`/service-bookings?id=${b.id}`}
                    className="block rounded-xl border border-white/[0.08] p-4 transition-all hover:border-white/[0.16] hover:bg-white/[0.02]">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Clock size={14} className="text-gray-500" />
                        <span className="text-sm font-bold text-white">{fmtTime(b.start_at)}</span>
                        {b.end_at && <span className="text-xs text-gray-500">— {fmtTime(b.end_at)}</span>}
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider"
                        style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.text }}>
                        {b.status.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-white font-semibold mb-1">
                      <User size={13} className="text-gray-500" />
                      {b.customer_name}
                    </div>
                    {b.service && (
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <Scissors size={11} className="text-gray-600" />
                        {b.service.name}
                        {b.master && <span className="text-gray-600">· with {b.master.name}</span>}
                      </div>
                    )}
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/[0.04]">
                      <span className="text-[10px] text-gray-600 font-mono">{b.booking_reference}</span>
                      <span className="text-xs font-bold text-white">
                        {Number(b.total_amount).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
