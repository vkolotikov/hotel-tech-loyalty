import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import { ChevronLeft, ChevronRight, BedDouble, Scissors, ClipboardList, X, Clock, User, Users } from 'lucide-react'
import { DesktopOnlyBanner } from '../components/DesktopOnlyBanner'

/* ── source theming ──────────────────────────────────────────────── */

const SOURCE = {
  room:    { accent: '#74c895', soft: 'rgba(116,200,149,0.14)', border: 'rgba(116,200,149,0.35)', text: '#74c895', label: 'Rooms',    Icon: BedDouble },
  service: { accent: '#5ab4b2', soft: 'rgba(90,180,178,0.14)',  border: 'rgba(90,180,178,0.35)',  text: '#5ab4b2', label: 'Services', Icon: Scissors  },
  task:    { accent: '#d98f45', soft: 'rgba(217,143,69,0.14)',  border: 'rgba(217,143,69,0.35)',  text: '#d98f45', label: 'Tasks',    Icon: ClipboardList },
} as const

type SourceKey = keyof typeof SOURCE

interface CellEvent {
  source: SourceKey
  id: string
  key: string
  label: string
  sublabel?: string
  timeLabel?: string
  href: string
  dateKey: string
  sortHint: string
}

function isoDay(iso: string) { return iso.slice(0, 10) }
function fmtTime(iso: string) { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
function fmtShortTime(hhmm: string) {
  if (!hhmm) return ''
  const [h, m] = hhmm.slice(0, 5).split(':').map(Number)
  const suffix = h >= 12 ? 'pm' : 'am'
  return (h % 12 || 12) + (m ? ':' + String(m).padStart(2, '0') : '') + suffix
}

export default function CalendarUnified() {
  const [params, setParams] = useSearchParams()
  const [month, setMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  const visibleParam = params.get('sources')
  const visible: Record<SourceKey, boolean> = useMemo(() => {
    if (!visibleParam) return { room: true, service: true, task: true }
    const set = new Set(visibleParam.split(','))
    return { room: set.has('room'), service: set.has('service'), task: set.has('task') }
  }, [visibleParam])

  const toggle = (key: SourceKey) => {
    const next = { ...visible, [key]: !visible[key] }
    const on = (Object.keys(next) as SourceKey[]).filter(k => next[k])
    const nextParams = new URLSearchParams(params)
    if (on.length === 0 || on.length === 3) nextParams.delete('sources')
    else nextParams.set('sources', on.join(','))
    setParams(nextParams, { replace: true })
  }

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

  // 6-week Mon-first grid
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

  const rangeFrom = days[0]
  const rangeTo   = days[days.length - 1]

  // Source queries — each fetches for the visible grid range.
  const roomsQ = useQuery({
    queryKey: ['unified-calendar', 'rooms', month],
    queryFn: () => api.get('/v1/admin/bookings/calendar', { params: { month } }).then(r => r.data),
  })

  const servicesQ = useQuery({
    queryKey: ['unified-calendar', 'services', month],
    queryFn: () => api.get('/v1/admin/service-bookings/calendar', { params: { month } }).then(r => r.data),
  })

  const tasksQ = useQuery({
    queryKey: ['unified-calendar', 'tasks', rangeFrom, rangeTo],
    queryFn: () => api.get('/v1/admin/planner/tasks', { params: { from: rangeFrom, to: rangeTo } }).then(r => r.data),
  })

  // Expand events to (dateKey -> events[]) respecting visibility.
  const byDay = useMemo(() => {
    const map = new Map<string, CellEvent[]>()
    const push = (ev: CellEvent) => {
      if (!map.has(ev.dateKey)) map.set(ev.dateKey, [])
      map.get(ev.dateKey)!.push(ev)
    }

    if (visible.room) {
      const rooms: any[] = roomsQ.data?.bookings ?? []
      rooms.forEach(b => {
        const arr = (b.arrival_date || '').slice(0, 10)
        const dep = (b.departure_date || '').slice(0, 10)
        if (!arr || !dep) return
        // Each night the guest stays, emit a chip. Skips departure day (checkout).
        const start = new Date(arr), end = new Date(dep)
        for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
          const key = d.toISOString().slice(0, 10)
          push({
            source: 'room',
            id: String(b.id),
            key: `room-${b.id}-${key}`,
            label: b.guest_name || 'Guest',
            sublabel: b.apartment_name || '',
            href: `/bookings/${b.id}`,
            dateKey: key,
            sortHint: '0000',
          })
        }
      })
    }

    if (visible.service) {
      const services: any[] = servicesQ.data?.bookings ?? []
      services.forEach(b => {
        if (!b.start_at) return
        const key = isoDay(b.start_at)
        push({
          source: 'service',
          id: String(b.id),
          key: `service-${b.id}`,
          label: b.customer_name || 'Customer',
          sublabel: b.service?.name || '',
          timeLabel: fmtTime(b.start_at),
          href: `/service-bookings?id=${b.id}`,
          dateKey: key,
          sortHint: b.start_at,
        })
      })
    }

    if (visible.task) {
      const tasks: any[] = Array.isArray(tasksQ.data) ? tasksQ.data : []
      tasks.forEach(t => {
        if (!t.task_date) return
        const key = String(t.task_date).slice(0, 10)
        push({
          source: 'task',
          id: String(t.id),
          key: `task-${t.id}`,
          label: t.title || 'Task',
          sublabel: t.employee_name || '',
          timeLabel: t.start_time ? fmtShortTime(t.start_time) : '',
          href: `/planner?date=${key}`,
          dateKey: key,
          sortHint: t.start_time || '99:99',
        })
      })
    }

    for (const [, list] of map) {
      list.sort((a, b) => (a.sortHint || '').localeCompare(b.sortHint || ''))
    }
    return map
  }, [visible, roomsQ.data, servicesQ.data, tasksQ.data])

  const today = new Date().toISOString().slice(0, 10)
  const monthLabel = new Date(year, mon - 1).toLocaleString('default', { month: 'long', year: 'numeric' })
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  // Counters for the pill filters
  const counts = useMemo(() => {
    const c: Record<SourceKey, number> = { room: 0, service: 0, task: 0 }
    const rooms: any[] = roomsQ.data?.bookings ?? []
    const services: any[] = servicesQ.data?.bookings ?? []
    const tasks: any[] = Array.isArray(tasksQ.data) ? tasksQ.data : []
    c.room = rooms.length
    c.service = services.length
    c.task = tasks.length
    return c
  }, [roomsQ.data, servicesQ.data, tasksQ.data])

  const selectedEvents = selectedDay ? (byDay.get(selectedDay) || []) : []
  const isLoading = roomsQ.isLoading || servicesQ.isLoading || tasksQ.isLoading

  return (
    <div className="space-y-5">
      <DesktopOnlyBanner pageKey="calendar-unified" message="The unified calendar grid is best viewed on a larger screen. On mobile, the timeline requires horizontal scrolling." />
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider mb-2"
            style={{ background: 'rgba(116,200,149,0.12)', color: '#74c895' }}>Calendar</div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Calendar</h1>
          <p className="text-xs text-gray-500 mt-1">
            Unified view of room bookings, service bookings, and planner tasks.
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

      {/* Source pills */}
      <div className="flex flex-wrap gap-2 items-center">
        {(Object.keys(SOURCE) as SourceKey[]).map(key => {
          const s = SOURCE[key]
          const on = visible[key]
          const Icon = s.Icon
          return (
            <button key={key} onClick={() => toggle(key)}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[11px] font-bold border transition-all hover:scale-[1.02]"
              style={{
                background: on ? s.soft : 'transparent',
                borderColor: on ? s.border : 'rgba(255,255,255,0.06)',
                color: on ? s.text : '#636366',
              }}>
              <Icon size={12} />
              {s.label}
              <span className="opacity-70 font-semibold">{counts[key]}</span>
            </button>
          )
        })}

        <div className="flex gap-3 ml-auto">
          {(Object.keys(SOURCE) as SourceKey[]).map(key => {
            const s = SOURCE[key]
            return (
              <div key={key} className="flex items-center gap-1.5 text-[10px]">
                <div className="w-2 h-2 rounded-full" style={{ background: s.accent }} />
                <span className="text-gray-500 font-medium">{s.label}</span>
              </div>
            )
          })}
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
            const visibleChips = list.slice(0, 3)
            const more = list.length - visibleChips.length
            return (
              <button key={d} onClick={() => list.length > 0 && setSelectedDay(d)}
                className="text-left border-r border-b border-white/[0.04] last:border-r-0 p-2 min-h-[118px] transition-colors hover:bg-white/[0.02] focus:outline-none"
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
                  {visibleChips.map(ev => {
                    const s = SOURCE[ev.source]
                    return (
                      <div key={ev.key}
                        className="text-[10px] px-1.5 py-1 rounded-md truncate flex items-center gap-1"
                        style={{ background: s.soft, border: `1px solid ${s.border}`, color: s.text }}
                        title={`${ev.timeLabel ? ev.timeLabel + ' · ' : ''}${ev.label}${ev.sublabel ? ' — ' + ev.sublabel : ''}`}>
                        {ev.timeLabel && <span className="font-bold">{ev.timeLabel}</span>}
                        <span className={`${ev.timeLabel ? 'opacity-85' : 'font-bold'} truncate`}>{ev.label}</span>
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

      {/* Day drawer */}
      {selectedDay && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-end" onClick={() => setSelectedDay(null)}>
          <div onClick={e => e.stopPropagation()}
            className="w-full max-w-md h-full overflow-y-auto border-l border-white/[0.08] p-6"
            style={{ background: 'linear-gradient(180deg, rgba(15,28,24,0.98), rgba(10,18,16,0.99))' }}>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-bold text-white">{new Date(selectedDay).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
                <p className="text-xs text-gray-500 mt-0.5">{selectedEvents.length} item{selectedEvents.length === 1 ? '' : 's'}</p>
              </div>
              <button onClick={() => setSelectedDay(null)} className="p-2 rounded-lg hover:bg-white/[0.06] text-gray-500">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              {selectedEvents.map(ev => {
                const s = SOURCE[ev.source]
                const Icon = s.Icon
                return (
                  <Link key={ev.key} to={ev.href}
                    className="block rounded-xl border border-white/[0.08] p-4 transition-all hover:border-white/[0.16] hover:bg-white/[0.02]">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Icon size={14} style={{ color: s.accent }} />
                        {ev.timeLabel && <span className="text-sm font-bold text-white">{ev.timeLabel}</span>}
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider"
                          style={{ background: s.soft, border: `1px solid ${s.border}`, color: s.text }}>
                          {s.label}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-white font-semibold mb-1">
                      {ev.source === 'task' ? <Clock size={13} className="text-gray-500" /> :
                       ev.source === 'room' ? <Users size={13} className="text-gray-500" /> :
                       <User size={13} className="text-gray-500" />}
                      {ev.label}
                    </div>
                    {ev.sublabel && (
                      <div className="text-xs text-gray-400">{ev.sublabel}</div>
                    )}
                  </Link>
                )
              })}
              {selectedEvents.length === 0 && (
                <div className="text-center text-xs text-gray-600 py-8">Nothing scheduled</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
