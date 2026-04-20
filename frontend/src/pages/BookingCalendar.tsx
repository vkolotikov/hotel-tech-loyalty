import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { money } from '../lib/money'
import { DesktopOnlyBanner } from '../components/DesktopOnlyBanner'

/* ── Unit visual theming ─────────────────────────────────────────── */

interface UnitVis { icon: string; accent: string; soft: string; glow: string }

function unitVisual(name: string): UnitVis {
  const n = (name || '').toLowerCase()
  if (n.includes('sauna'))                     return { icon: 'sauna',   accent: '#5ab4b2', soft: 'rgba(90,180,178,0.14)',  glow: 'rgba(90,180,178,0.22)' }
  if (n.includes('tiny'))                      return { icon: 'tiny',    accent: '#d98f45', soft: 'rgba(217,143,69,0.14)',  glow: 'rgba(217,143,69,0.22)' }
  if (n.includes('lodge'))                     return { icon: 'cabin',   accent: '#74c895', soft: 'rgba(116,200,149,0.14)', glow: 'rgba(116,200,149,0.2)' }
  if (n.includes('no.5') || n.includes('no5')) return { icon: 'retreat', accent: '#81a6e8', soft: 'rgba(129,166,232,0.14)', glow: 'rgba(129,166,232,0.22)' }
  return { icon: 'house', accent: '#d5c06a', soft: 'rgba(213,192,106,0.14)', glow: 'rgba(213,192,106,0.22)' }
}

function UnitIcon({ type, size = 14 }: { type: string; size?: number }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const }
  switch (type) {
    case 'sauna':   return <svg {...p}><path d="M4 20h16M6 16h12M8 12h8M10 4c0 2 2 3 2 5M14 4c0 2 2 3 2 5" /></svg>
    case 'tiny':    return <svg {...p}><path d="M3 21h18M5 21V10l7-7 7 7v11M10 21v-5h4v5" /></svg>
    case 'cabin':   return <svg {...p}><path d="M3 21h18M4 21V11l8-8 8 8v10M9 21v-6h6v6" /></svg>
    case 'retreat':  return <svg {...p}><path d="M2 21h20M4 21V8l8-5 8 5v13M10 21v-4h4v4M8 11h2M14 11h2" /></svg>
    default:        return <svg {...p}><path d="M3 21h18M5 21V10l7-7 7 7v11M10 14h4" /></svg>
  }
}

/* ── Payment bar styling ─────────────────────────────────────────── */

const BAR_STYLE: Record<string, { bg: string; border: string; text: string }> = {
  paid:            { bg: 'linear-gradient(90deg, #22c55ecc, #16a34acc)', border: 'rgba(34,197,94,0.4)',  text: '#fff' },
  open:            { bg: 'linear-gradient(90deg, #ef4444cc, #dc2626cc)', border: 'rgba(239,68,68,0.4)',  text: '#fff' },
  pending:         { bg: 'linear-gradient(90deg, #ef4444cc, #dc2626cc)', border: 'rgba(239,68,68,0.4)',  text: '#fff' },
  invoice_waiting: { bg: 'linear-gradient(90deg, #f59e0bcc, #d97706cc)', border: 'rgba(245,158,11,0.4)', text: '#1a1a1a' },
  channel_managed: { bg: 'linear-gradient(90deg, #14b8a6cc, #0d9488cc)', border: 'rgba(20,184,166,0.4)', text: '#fff' },
}
const DEFAULT_BAR = { bg: 'linear-gradient(90deg, #6b7280cc, #4b5563cc)', border: 'rgba(107,114,128,0.4)', text: '#fff' }

function shortGuest(name: string) {
  if (!name) return '?'
  const p = name.split(' ')
  return p.length === 1 ? p[0] : `${p[0]} ${p[p.length - 1][0]}.`
}

/* ── Main Component ──────────────────────────────────────────────── */

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

  const nav = (d: number) => {
    let m = mon + d, y = year
    if (m < 1) { m = 12; y-- }
    if (m > 12) { m = 1; y++ }
    setMonth(`${y}-${String(m).padStart(2, '0')}`)
  }

  const days = useMemo(() => {
    const r: string[] = []
    if (rangeView === 'week') {
      const t = new Date(), dow = t.getDay() === 0 ? 6 : t.getDay() - 1
      for (let i = -dow; i < 7 - dow; i++) { const d = new Date(t); d.setDate(d.getDate() + i); r.push(d.toISOString().slice(0, 10)) }
    } else {
      const first = new Date(year, mon - 1, 1), last = new Date(year, mon, 0)
      const sDow = first.getDay() === 0 ? 6 : first.getDay() - 1
      const eDow = last.getDay() === 0 ? 6 : last.getDay() - 1
      for (let i = -sDow; i <= last.getDate() - 1 + (6 - eDow); i++) {
        const d = new Date(year, mon - 1, i + 1); r.push(d.toISOString().slice(0, 10))
      }
    }
    return r
  }, [year, mon, rangeView])

  const units = useMemo(() => {
    const m = new Map<string, string>()
    bookings.forEach(b => { if (b.apartment_id) m.set(String(b.apartment_id), b.apartment_name || String(b.apartment_id)) })
    return Array.from(m.entries()).map(([id, name]) => ({ id, name }))
  }, [bookings])

  const filtered = useMemo(() => {
    let l = bookings
    if (paymentFilter) l = l.filter(b => b.payment_status === paymentFilter)
    if (unitFilter) l = l.filter(b => String(b.apartment_id) === unitFilter)
    return l
  }, [bookings, paymentFilter, unitFilter])

  const unitRows = useMemo(() => {
    const m = new Map<string, { name: string; bookings: any[] }>()
    filtered.forEach(b => {
      const k = String(b.apartment_id || 'unknown')
      if (!m.has(k)) m.set(k, { name: b.apartment_name || 'Unknown', bookings: [] })
      m.get(k)!.bookings.push(b)
    })
    return Array.from(m.entries())
  }, [filtered])

  const today = new Date().toISOString().slice(0, 10)
  const monthLabel = new Date(year, mon - 1).toLocaleString('default', { month: 'long', year: 'numeric' })
  const colCount = days.length

  function barCols(b: any) {
    const f = days[0], l = days[days.length - 1]
    const arrDate = (b.arrival_date || '').slice(0, 10)
    const depDate = (b.departure_date || '').slice(0, 10)
    if (!arrDate || !depDate) return null
    if (depDate <= f || arrDate > l) return null
    let s = days.indexOf(arrDate); if (s < 0) s = 0
    let e = days.indexOf(depDate); if (e < 0) e = days.length
    return s < e ? { start: s + 1, end: e + 1 } : null
  }

  /** Assign each booking a row index so overlapping bookings stack vertically */
  function assignRows(list: any[]): { booking: any; cols: { start: number; end: number }; row: number }[] {
    const items = list.map(b => ({ booking: b, cols: barCols(b) })).filter(x => x.cols !== null) as { booking: any; cols: { start: number; end: number } }[]
    // Sort by start column, then by span length descending
    items.sort((a, b) => a.cols.start - b.cols.start || (b.cols.end - b.cols.start) - (a.cols.end - a.cols.start))
    const rows: number[][] = [] // each row tracks the rightmost occupied column
    return items.map(item => {
      let row = 0
      for (; row < rows.length; row++) {
        // Check if this row is free (no overlap with existing items in this row)
        if (rows[row].every(endCol => item.cols.start >= endCol)) break
      }
      if (row === rows.length) rows.push([])
      rows[row].push(item.cols.end)
      return { ...item, row }
    })
  }

  function uStats(list: any[]) {
    const s = { paid: 0, open: 0, inv: 0, ch: 0, nights: 0 }
    list.forEach(b => {
      if (b.payment_status === 'paid') s.paid++; else if (b.payment_status === 'invoice_waiting') s.inv++
      else if (b.payment_status === 'channel_managed') s.ch++; else s.open++
      if (b.arrival_date && b.departure_date) {
        const a = new Date(b.arrival_date), d = new Date(b.departure_date)
        s.nights += Math.ceil((d.getTime() - a.getTime()) / 86400000)
      }
    })
    return s
  }

  const selectClass = 'bg-[#0f1c18] border border-white/[0.08] rounded-xl text-xs text-white px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500/40'

  return (
    <div className="space-y-5">
      <DesktopOnlyBanner pageKey="booking-calendar" message="The booking calendar grid is designed for wider screens. On mobile, you'll need to scroll horizontally to see all units and dates." />
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider mb-2"
            style={{ background: 'rgba(116,200,149,0.12)', color: '#74c895' }}>Calendar</div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Booking Calendar</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="inline-flex p-1 rounded-2xl" style={{ background: 'rgba(22,40,35,0.6)', border: '1px solid rgba(255,255,255,0.06)' }}>
            {(['month', 'week'] as const).map(v => (
              <button key={v} onClick={() => setRangeView(v)}
                className={`px-4 py-1.5 text-xs font-semibold rounded-xl transition-all ${rangeView === v ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}
                style={rangeView === v ? { background: 'linear-gradient(135deg, #74c895, #5ab4b2)', boxShadow: '0 6px 14px rgba(116,200,149,0.2)' } : {}}>
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
          <button onClick={() => nav(-1)} className="p-2 rounded-xl text-gray-500 hover:text-white transition-colors"
            style={{ background: 'rgba(22,40,35,0.6)', border: '1px solid rgba(255,255,255,0.06)' }}><ChevronLeft size={16} /></button>
          <span className="text-white font-semibold min-w-[170px] text-center text-sm">{monthLabel}</span>
          <button onClick={() => nav(1)} className="p-2 rounded-xl text-gray-500 hover:text-white transition-colors"
            style={{ background: 'rgba(22,40,35,0.6)', border: '1px solid rgba(255,255,255,0.06)' }}><ChevronRight size={16} /></button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <select value={paymentFilter} onChange={e => setPaymentFilter(e.target.value)} className={selectClass}>
          <option value="">All Payments</option>
          <option value="paid">Paid</option><option value="pending">Open</option>
          <option value="invoice_waiting">Invoice Waiting</option><option value="channel_managed">Channel Managed</option>
        </select>

        <div className="flex flex-wrap gap-1.5 ml-1">
          <button onClick={() => setUnitFilter('')}
            className="px-3 py-1.5 rounded-full text-[10px] font-bold border transition-all"
            style={{
              background: !unitFilter ? 'rgba(116,200,149,0.12)' : 'transparent',
              borderColor: !unitFilter ? 'rgba(116,200,149,0.3)' : 'rgba(255,255,255,0.06)',
              color: !unitFilter ? '#74c895' : '#8e8e93',
            }}>All Units</button>
          {units.map(u => {
            const vis = unitVisual(u.name)
            const active = unitFilter === u.id
            return (
              <button key={u.id} onClick={() => setUnitFilter(active ? '' : u.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold border transition-all hover:scale-[1.02]"
                style={{
                  background: active ? vis.soft : 'transparent',
                  borderColor: active ? `${vis.accent}44` : 'rgba(255,255,255,0.06)',
                  color: active ? vis.accent : '#8e8e93',
                  boxShadow: active ? `0 4px 12px ${vis.glow}` : 'none',
                }}>
                <UnitIcon type={vis.icon} size={11} /> {u.name}
              </button>
            )
          })}
        </div>

        <div className="flex gap-4 ml-auto">
          {[
            { label: 'Paid', color: '#22c55e' }, { label: 'Open', color: '#ef4444' },
            { label: 'Invoice', color: '#f59e0b' }, { label: 'Channel', color: '#14b8a6' },
          ].map(l => (
            <div key={l.label} className="flex items-center gap-1.5 text-[10px]">
              <div className="w-3 h-1.5 rounded-full" style={{ background: l.color }} />
              <span className="text-gray-500 font-medium">{l.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Timeline */}
      <div className="rounded-2xl border border-white/[0.06] overflow-x-auto"
        style={{ background: 'linear-gradient(180deg, rgba(18,24,22,0.96), rgba(14,20,18,0.98))', boxShadow: '0 16px 30px rgba(0,0,0,0.18)' }}>
        <div style={{ minWidth: colCount * 40 + 260 }}>
          {/* Day axis */}
          <div className="flex border-b border-white/[0.06] sticky top-0 z-10" style={{ background: 'rgba(14,20,18,0.98)' }}>
            <div className="w-[260px] flex-shrink-0 p-3 text-[10px] text-gray-500 font-bold uppercase tracking-wider border-r border-white/[0.06]">Unit</div>
            <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${colCount}, 1fr)` }}>
              {days.map(d => {
                const dt = new Date(d), isToday = d === today, isWe = dt.getDay() === 0 || dt.getDay() === 6, inMonth = d.startsWith(month)
                return (
                  <div key={d} className="text-center py-2 border-r border-white/[0.03]"
                    style={{
                      background: isToday ? 'rgba(116,200,149,0.08)' : isWe ? 'rgba(217,143,69,0.04)' : 'transparent',
                      opacity: inMonth ? 1 : 0.3,
                    }}>
                    <div className={`text-[9px] font-bold ${isToday ? 'text-emerald-400' : isWe ? 'text-amber-500/60' : 'text-gray-600'}`}>
                      {dt.toLocaleDateString('en', { weekday: 'narrow' })}
                    </div>
                    <div className={`text-[11px] font-semibold ${isToday ? 'text-emerald-400' : 'text-gray-400'}`}>{dt.getDate()}</div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Unit rows */}
          {unitRows.length === 0 ? (
            <div className="p-12 text-center text-gray-600">No bookings to display</div>
          ) : unitRows.map(([uid, udata]) => {
            const vis = unitVisual(udata.name)
            const stats = uStats(udata.bookings)
            return (
              <div key={uid} className="flex border-b border-white/[0.04]">
                {/* Unit label */}
                <div className="w-[260px] flex-shrink-0 p-3 border-r border-white/[0.06] relative overflow-hidden"
                  style={{ background: vis.soft }}>
                  {/* Left accent bar */}
                  <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: vis.accent }} />
                  {/* Corner glow */}
                  <div className="absolute top-0 right-0 w-[120px] h-[120px] pointer-events-none"
                    style={{ background: `radial-gradient(circle at 100% 0, ${vis.glow}, transparent 70%)` }} />

                  <div className="relative z-[1] pl-3">
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{ background: vis.soft, border: `1px solid ${vis.accent}33`, color: vis.accent }}>
                        <UnitIcon type={vis.icon} size={15} />
                      </div>
                      <span className="text-sm font-bold text-white truncate">{udata.name}</span>
                    </div>
                    <div className="flex gap-2.5 flex-wrap">
                      {stats.paid > 0 && <span className="text-[9px] font-bold text-emerald-400">{stats.paid} paid</span>}
                      {stats.open > 0 && <span className="text-[9px] font-bold text-red-400">{stats.open} open</span>}
                      {stats.inv > 0 && <span className="text-[9px] font-bold text-amber-400">{stats.inv} inv</span>}
                      {stats.ch > 0 && <span className="text-[9px] font-bold text-teal-400">{stats.ch} ch</span>}
                      <span className="text-[9px] text-gray-600">{stats.nights}n occ.</span>
                    </div>
                  </div>
                </div>

                {/* Bars area */}
                {(() => {
                  const laid = assignRows(udata.bookings)
                  const rowCount = Math.max(1, ...laid.map(l => l.row + 1))
                  const ROW_H = 30, ROW_GAP = 4, PAD = 4
                  const areaH = rowCount * ROW_H + (rowCount - 1) * ROW_GAP + PAD * 2
                  return (
                    <div className="flex-1 relative" style={{ minHeight: Math.max(56, areaH) }}>
                      {/* Day cell backgrounds */}
                      <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${colCount}, 1fr)` }}>
                        {days.map(d => {
                          const dt = new Date(d), isWe = dt.getDay() === 0 || dt.getDay() === 6, isToday = d === today
                          return <div key={d} className="border-r border-white/[0.02]"
                            style={{ background: isToday ? 'rgba(116,200,149,0.04)' : isWe ? 'rgba(217,143,69,0.02)' : 'transparent' }} />
                        })}
                      </div>

                      {/* Booking bars — positioned absolutely within grid columns */}
                      {laid.map(({ booking: b, cols, row }) => {
                        const payStatus = b.payment_status || (Number(b.price_paid || 0) >= Number(b.price_total || 1) && Number(b.price_total) > 0 ? 'paid' : 'open')
                        const s = BAR_STYLE[payStatus] || DEFAULT_BAR
                        const leftPct = ((cols.start - 1) / colCount) * 100
                        const widthPct = ((cols.end - cols.start) / colCount) * 100
                        const arrFmt = b.arrival_date ? new Date(b.arrival_date).toLocaleDateString('en-GB', {day:'numeric',month:'short'}) : ''
                        const depFmt = b.departure_date ? new Date(b.departure_date).toLocaleDateString('en-GB', {day:'numeric',month:'short'}) : ''
                        return (
                          <Link key={b.id} to={`/bookings/${b.id}`}
                            className="absolute flex items-center px-2 rounded-lg text-[10px] font-bold truncate z-[1] transition-all hover:brightness-110 hover:-translate-y-px"
                            style={{
                              left: `${leftPct}%`, width: `${widthPct}%`,
                              top: PAD + row * (ROW_H + ROW_GAP),
                              height: ROW_H, background: s.bg, border: `1px solid ${s.border}`, color: s.text,
                              boxShadow: `0 4px 10px rgba(0,0,0,0.2)`,
                            }}
                            title={`${b.guest_name || '?'} — ${b.apartment_name}\n${arrFmt} → ${depFmt}${b.price_total ? `\n${money(b.price_total)}` : ''}`}>
                            {shortGuest(b.guest_name)}
                            {widthPct > 12 && b.price_total ? <span className="ml-auto text-[9px] opacity-75">{money(b.price_total)}</span> : null}
                          </Link>
                        )
                      })}
                    </div>
                  )
                })()}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
