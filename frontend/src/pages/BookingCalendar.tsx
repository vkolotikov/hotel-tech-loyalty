import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'

// ── Unit visual theming ──────────────────────────────────────────────
interface UnitVisual { icon: string; accent: string; soft: string }

function resolveUnitVisual(name: string): UnitVisual {
  const n = (name || '').toLowerCase()
  if (n.includes('sauna'))                     return { icon: 'sauna',   accent: '#5ab4b2', soft: 'rgba(90,180,178,0.16)' }
  if (n.includes('tiny'))                      return { icon: 'tiny',    accent: '#d98f45', soft: 'rgba(217,143,69,0.16)' }
  if (n.includes('lodge'))                     return { icon: 'cabin',   accent: '#74c895', soft: 'rgba(116,200,149,0.16)' }
  if (n.includes('no.5') || n.includes('no5')) return { icon: 'retreat', accent: '#81a6e8', soft: 'rgba(129,166,232,0.16)' }
  return { icon: 'house', accent: '#d5c06a', soft: 'rgba(213,192,106,0.16)' }
}

function UnitIcon({ type, size = 14 }: { type: string; size?: number }) {
  const s = size
  const props = { width: s, height: s, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const }
  switch (type) {
    case 'sauna': return <svg {...props}><path d="M4 20h16M6 16h12M8 12h8M10 4c0 2 2 3 2 5M14 4c0 2 2 3 2 5" /></svg>
    case 'tiny':  return <svg {...props}><path d="M3 21h18M5 21V10l7-7 7 7v11M10 21v-5h4v5" /></svg>
    case 'cabin': return <svg {...props}><path d="M3 21h18M4 21V11l8-8 8 8v10M9 21v-6h6v6" /></svg>
    case 'retreat': return <svg {...props}><path d="M2 21h20M4 21V8l8-5 8 5v13M10 21v-4h4v4M8 11h2M14 11h2" /></svg>
    default:      return <svg {...props}><path d="M3 21h18M5 21V10l7-7 7 7v11M10 14h4" /></svg>
  }
}

// ── Payment bar colors ───────────────────────────────────────────────
const PAY_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  paid:            { bg: 'rgba(34,197,94,0.25)',  border: 'rgba(34,197,94,0.5)',  text: '#4ade80' },
  open:            { bg: 'rgba(239,68,68,0.25)',  border: 'rgba(239,68,68,0.5)',  text: '#f87171' },
  pending:         { bg: 'rgba(239,68,68,0.25)',  border: 'rgba(239,68,68,0.5)',  text: '#f87171' },
  invoice_waiting: { bg: 'rgba(245,158,11,0.25)', border: 'rgba(245,158,11,0.5)', text: '#fbbf24' },
  channel_managed: { bg: 'rgba(20,184,166,0.25)', border: 'rgba(20,184,166,0.5)', text: '#2dd4bf' },
}
const DEFAULT_PAY = { bg: 'rgba(107,114,128,0.25)', border: 'rgba(107,114,128,0.5)', text: '#9ca3af' }

function shortGuest(name: string) {
  if (!name) return '?'
  const p = name.split(' ')
  return p.length === 1 ? p[0] : `${p[0]} ${p[p.length - 1][0]}.`
}

export function BookingCalendar() {
  const [month, setMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [rangeView, setRangeView] = useState<'month' | 'week'>('month')
  const [paymentFilter, setPaymentFilter] = useState('')
  const [unitFilter, setUnitFilter] = useState('')

  const { data } = useQuery({
    queryKey: ['booking-calendar', month],
    queryFn: () => api.get('/v1/admin/bookings/calendar', { params: { month } }).then(r => r.data),
  })

  const bookings: any[] = data?.bookings ?? []

  const { year, mon } = useMemo(() => {
    const [y, m] = month.split('-').map(Number)
    return { year: y, mon: m }
  }, [month])

  const nav = (delta: number) => {
    let m = mon + delta, y = year
    if (m < 1) { m = 12; y-- }
    if (m > 12) { m = 1; y++ }
    setMonth(`${y}-${String(m).padStart(2, '0')}`)
  }

  // Build visible days
  const days = useMemo(() => {
    const result: string[] = []
    if (rangeView === 'week') {
      const t = new Date()
      const dow = t.getDay() === 0 ? 6 : t.getDay() - 1
      for (let i = -dow; i < 7 - dow; i++) {
        const d = new Date(t); d.setDate(d.getDate() + i)
        result.push(d.toISOString().slice(0, 10))
      }
    } else {
      const first = new Date(year, mon - 1, 1)
      const last = new Date(year, mon, 0)
      const startDow = first.getDay() === 0 ? 6 : first.getDay() - 1
      const endDow = last.getDay() === 0 ? 6 : last.getDay() - 1
      for (let i = -startDow; i <= last.getDate() - 1 + (6 - endDow); i++) {
        const d = new Date(year, mon - 1, i + 1)
        result.push(d.toISOString().slice(0, 10))
      }
    }
    return result
  }, [year, mon, rangeView])

  // Units from bookings
  const units = useMemo(() => {
    const map = new Map<string, string>()
    bookings.forEach(b => { if (b.apartment_id) map.set(String(b.apartment_id), b.apartment_name || String(b.apartment_id)) })
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
  }, [bookings])

  // Filter
  const filtered = useMemo(() => {
    let list = bookings
    if (paymentFilter) list = list.filter(b => b.payment_status === paymentFilter)
    if (unitFilter) list = list.filter(b => String(b.apartment_id) === unitFilter)
    return list
  }, [bookings, paymentFilter, unitFilter])

  // Group by unit
  const unitRows = useMemo(() => {
    const map = new Map<string, { name: string; bookings: any[] }>()
    filtered.forEach(b => {
      const k = String(b.apartment_id || 'unknown')
      if (!map.has(k)) map.set(k, { name: b.apartment_name || 'Unknown', bookings: [] })
      map.get(k)!.bookings.push(b)
    })
    return Array.from(map.entries())
  }, [filtered])

  const today = new Date().toISOString().slice(0, 10)
  const monthLabel = new Date(year, mon - 1).toLocaleString('default', { month: 'long', year: 'numeric' })

  // Grid col for a booking
  function barCols(b: any): { start: number; end: number } | null {
    const first = days[0], last = days[days.length - 1]
    if (b.departure_date <= first || b.arrival_date > last) return null
    let s = days.indexOf(b.arrival_date)
    if (s < 0) s = 0 // starts before visible range
    let e = days.indexOf(b.departure_date)
    if (e < 0) e = days.length // ends after visible range
    if (s >= e) return null
    return { start: s + 1, end: e + 1 } // 1-based for CSS grid
  }

  function unitStats(list: any[]) {
    const s = { paid: 0, open: 0, inv: 0, ch: 0 }
    list.forEach(b => {
      if (b.payment_status === 'paid') s.paid++
      else if (b.payment_status === 'invoice_waiting') s.inv++
      else if (b.payment_status === 'channel_managed') s.ch++
      else s.open++
    })
    return s
  }

  const colCount = days.length

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-white">Booking Calendar</h1>
        <div className="flex items-center gap-3">
          <div className="flex bg-dark-800 rounded-lg border border-dark-700 p-0.5">
            {(['month', 'week'] as const).map(v => (
              <button key={v} onClick={() => setRangeView(v)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${rangeView === v ? 'bg-primary-600 text-white' : 'text-gray-400 hover:text-white'}`}>
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
          <button onClick={() => nav(-1)} className="p-2 rounded-lg bg-dark-700 hover:bg-dark-600 text-gray-400 hover:text-white"><ChevronLeft size={16} /></button>
          <span className="text-white font-medium min-w-[160px] text-center">{monthLabel}</span>
          <button onClick={() => nav(1)} className="p-2 rounded-lg bg-dark-700 hover:bg-dark-600 text-gray-400 hover:text-white"><ChevronRight size={16} /></button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <select value={paymentFilter} onChange={e => setPaymentFilter(e.target.value)}
          className="bg-dark-700 border border-dark-600 rounded-lg text-xs text-white px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary-500">
          <option value="">All Payments</option>
          <option value="paid">Paid</option>
          <option value="pending">Open</option>
          <option value="invoice_waiting">Invoice Waiting</option>
          <option value="channel_managed">Channel Managed</option>
        </select>

        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setUnitFilter('')}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-medium border transition-colors ${!unitFilter ? 'bg-dark-600 border-dark-500 text-white' : 'bg-dark-800 border-dark-700 text-gray-500 hover:text-gray-300'}`}>
            All Units
          </button>
          {units.map(u => {
            const vis = resolveUnitVisual(u.name)
            const active = unitFilter === u.id
            return (
              <button key={u.id} onClick={() => setUnitFilter(active ? '' : u.id)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium border transition-colors"
                style={{
                  background: active ? vis.soft : undefined,
                  borderColor: active ? vis.accent : 'rgb(40,40,50)',
                  color: active ? vis.accent : '#8e8e93',
                }}>
                <UnitIcon type={vis.icon} size={10} />
                {u.name}
              </button>
            )
          })}
        </div>

        {/* Legend */}
        <div className="flex gap-3 ml-auto">
          {[
            { label: 'Paid', color: '#4ade80' },
            { label: 'Open', color: '#f87171' },
            { label: 'Invoice', color: '#fbbf24' },
            { label: 'Channel', color: '#2dd4bf' },
          ].map(l => (
            <div key={l.label} className="flex items-center gap-1 text-[10px]">
              <div className="w-2 h-2 rounded-full" style={{ background: l.color }} />
              <span className="text-gray-500">{l.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Timeline grid */}
      <div className="bg-dark-800 rounded-xl border border-dark-700 overflow-x-auto">
        <div style={{ minWidth: colCount * 36 + 180 }}>
          {/* Day axis */}
          <div className="flex border-b border-dark-700 sticky top-0 z-10 bg-dark-800">
            <div className="w-[180px] flex-shrink-0 p-2 text-xs text-gray-500 font-medium border-r border-dark-700">Unit</div>
            <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${colCount}, 1fr)` }}>
              {days.map(d => {
                const dt = new Date(d)
                const isToday = d === today
                const isWe = dt.getDay() === 0 || dt.getDay() === 6
                const inMonth = d.startsWith(month)
                return (
                  <div key={d} className={`text-center py-1 border-r border-dark-700/30 ${isWe ? 'bg-dark-700/20' : ''} ${!inMonth ? 'opacity-30' : ''}`}>
                    <div className={`text-[9px] ${isToday ? 'text-primary-400 font-bold' : 'text-gray-600'}`}>
                      {dt.toLocaleDateString('en', { weekday: 'narrow' })}
                    </div>
                    <div className={`text-[11px] font-medium ${isToday ? 'text-primary-400' : 'text-gray-400'}`}>
                      {dt.getDate()}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Unit rows */}
          {unitRows.length === 0 ? (
            <div className="p-8 text-center text-gray-600">No bookings to display</div>
          ) : unitRows.map(([uid, udata]) => {
            const vis = resolveUnitVisual(udata.name)
            const stats = unitStats(udata.bookings)
            return (
              <div key={uid} className="flex border-b border-dark-700/50">
                {/* Unit label */}
                <div className="w-[180px] flex-shrink-0 p-2 border-r border-dark-700 flex flex-col justify-center"
                  style={{ background: vis.soft }}>
                  <div className="flex items-center gap-1.5">
                    <span style={{ color: vis.accent }}><UnitIcon type={vis.icon} size={13} /></span>
                    <span className="text-xs font-medium text-white truncate">{udata.name}</span>
                  </div>
                  <div className="flex gap-2 mt-0.5">
                    {stats.paid > 0 && <span className="text-[9px] text-green-400">{stats.paid}p</span>}
                    {stats.open > 0 && <span className="text-[9px] text-red-400">{stats.open}o</span>}
                    {stats.inv > 0 && <span className="text-[9px] text-amber-400">{stats.inv}i</span>}
                    {stats.ch > 0 && <span className="text-[9px] text-teal-400">{stats.ch}c</span>}
                  </div>
                </div>

                {/* Booking bars grid */}
                <div className="flex-1 relative" style={{ minHeight: 48 }}>
                  {/* Background day cells */}
                  <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${colCount}, 1fr)` }}>
                    {days.map(d => {
                      const isWe = new Date(d).getDay() === 0 || new Date(d).getDay() === 6
                      return <div key={d} className={`border-r border-dark-700/20 ${isWe ? 'bg-dark-700/10' : ''}`} />
                    })}
                  </div>

                  {/* Bars */}
                  <div className="absolute inset-0 grid items-center px-0" style={{ gridTemplateColumns: `repeat(${colCount}, 1fr)`, gridTemplateRows: '1fr' }}>
                    {udata.bookings.map((b: any) => {
                      const cols = barCols(b)
                      if (!cols) return null
                      const c = PAY_COLORS[b.payment_status] || DEFAULT_PAY
                      return (
                        <Link key={b.id} to={`/bookings/${b.id}`}
                          className="flex items-center px-1.5 rounded-md text-[10px] font-medium truncate hover:brightness-125 transition-all h-[28px] z-[1]"
                          style={{
                            gridColumn: `${cols.start} / ${cols.end}`,
                            gridRow: 1,
                            background: c.bg,
                            border: `1px solid ${c.border}`,
                            color: c.text,
                          }}
                          title={`${b.guest_name} — ${b.apartment_name}\n${b.arrival_date} → ${b.departure_date}${b.price_total ? `\n€${b.price_total}` : ''}`}
                        >
                          {shortGuest(b.guest_name)}
                        </Link>
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
