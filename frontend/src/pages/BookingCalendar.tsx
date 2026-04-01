import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const COLORS = [
  'bg-blue-500/30 border-blue-500/50 text-blue-300',
  'bg-emerald-500/30 border-emerald-500/50 text-emerald-300',
  'bg-purple-500/30 border-purple-500/50 text-purple-300',
  'bg-amber-500/30 border-amber-500/50 text-amber-300',
  'bg-pink-500/30 border-pink-500/50 text-pink-300',
  'bg-cyan-500/30 border-cyan-500/50 text-cyan-300',
  'bg-orange-500/30 border-orange-500/50 text-orange-300',
]

export function BookingCalendar() {
  const [month, setMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })

  const { data } = useQuery({
    queryKey: ['booking-calendar', month],
    queryFn: () => api.get('/v1/admin/bookings/calendar', { params: { month } }).then(r => r.data),
  })

  const bookings = data?.bookings ?? []

  const { year, mon } = useMemo(() => {
    const [y, m] = month.split('-').map(Number)
    return { year: y, mon: m }
  }, [month])

  const navigate = (delta: number) => {
    let m = mon + delta
    let y = year
    if (m < 1) { m = 12; y-- }
    if (m > 12) { m = 1; y++ }
    setMonth(`${y}-${String(m).padStart(2, '0')}`)
  }

  // Build calendar grid
  const firstDay = new Date(year, mon - 1, 1)
  const startDow = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1 // Monday-based

  const cells: { day: number; date: string }[] = []
  for (let i = -startDow; i < 42 - startDow && cells.length < 42; i++) {
    const d = new Date(year, mon - 1, i + 1)
    cells.push({
      day: d.getDate(),
      date: d.toISOString().slice(0, 10),
    })
  }

  // Map unit IDs to colors
  const unitColors: Record<string, string> = {}
  let colorIdx = 0
  bookings.forEach((b: any) => {
    if (b.apartment_id && !unitColors[b.apartment_id]) {
      unitColors[b.apartment_id] = COLORS[colorIdx % COLORS.length]
      colorIdx++
    }
  })

  const getBookingsForDate = (date: string) => {
    return bookings.filter((b: any) => {
      return b.arrival_date <= date && b.departure_date > date
    })
  }

  const isCurrentMonth = (date: string) => date.startsWith(month)
  const isToday = (date: string) => date === new Date().toISOString().slice(0, 10)

  const monthName = new Date(year, mon - 1).toLocaleString('default', { month: 'long', year: 'numeric' })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Booking Calendar</h1>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-lg bg-dark-700 hover:bg-dark-600 text-gray-400 hover:text-white">
            <ChevronLeft size={16} />
          </button>
          <span className="text-white font-medium min-w-[160px] text-center">{monthName}</span>
          <button onClick={() => navigate(1)} className="p-2 rounded-lg bg-dark-700 hover:bg-dark-600 text-gray-400 hover:text-white">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Legend */}
      {Object.keys(unitColors).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {bookings.reduce((acc: any[], b: any) => {
            if (b.apartment_id && !acc.find((x: any) => x.id === b.apartment_id)) {
              acc.push({ id: b.apartment_id, name: b.apartment_name || b.apartment_id })
            }
            return acc
          }, []).map((unit: any) => (
            <div key={unit.id} className={`px-2 py-0.5 rounded text-xs border ${unitColors[unit.id]}`}>
              {unit.name}
            </div>
          ))}
        </div>
      )}

      <div className="bg-dark-800 rounded-xl border border-dark-700 overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-dark-700">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
            <div key={d} className="p-2 text-center text-xs text-gray-500 font-medium">{d}</div>
          ))}
        </div>

        {/* Calendar cells */}
        <div className="grid grid-cols-7">
          {cells.map((cell, i) => {
            const dayBookings = getBookingsForDate(cell.date)
            const inMonth = isCurrentMonth(cell.date)
            const today = isToday(cell.date)

            return (
              <div key={i} className={`min-h-[80px] border-b border-r border-dark-700/50 p-1 ${!inMonth ? 'opacity-30' : ''}`}>
                <div className={`text-xs mb-1 font-medium ${today ? 'text-primary-400' : 'text-gray-400'}`}>
                  {cell.day}
                </div>
                <div className="space-y-0.5">
                  {dayBookings.slice(0, 3).map((b: any) => (
                    <Link key={b.id} to={`/bookings/${b.id}`}
                      className={`block px-1 py-0.5 rounded text-[10px] truncate border ${unitColors[b.apartment_id] || 'bg-gray-500/20 border-gray-500/30 text-gray-400'}`}
                      title={`${b.guest_name} - ${b.apartment_name}`}
                    >
                      {b.guest_name?.split(' ')[0] || '?'}
                    </Link>
                  ))}
                  {dayBookings.length > 3 && (
                    <div className="text-[10px] text-gray-500 pl-1">+{dayBookings.length - 3} more</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
