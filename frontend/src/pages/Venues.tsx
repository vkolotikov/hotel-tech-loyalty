import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useSettings } from '../lib/crmSettings'
import toast from 'react-hot-toast'
import { PairTabs, LOCATIONS_TABS } from '../components/PairTabs'
import {
  Plus, Search, Filter, ChevronLeft, ChevronRight, X,
  Calendar, CalendarDays, CalendarRange, Users as UsersIcon, MapPin, Building2,
  Monitor, Coffee, CheckCircle, XCircle,
  AlertCircle, Play, ArrowRight,
} from 'lucide-react'

const VENUE_TYPES = ['Conference', 'Meeting Room', 'Spa', 'Banquet Hall', 'Boardroom', 'Outdoor Terrace']
const EVENT_TYPES = ['Meeting', 'Conference', 'Wedding', 'Spa Treatment', 'Workshop', 'Gala Dinner', 'Team Building']
const SETUP_STYLES = ['Theater', 'Classroom', 'U-Shape', 'Boardroom', 'Banquet', 'Cocktail', 'Spa']
const BOOKING_STATUSES = ['Tentative', 'Confirmed', 'In Progress', 'Completed', 'Cancelled']

const STATUS_COLORS: Record<string, string> = {
  Tentative: 'bg-yellow-500/20 text-yellow-400',
  Confirmed: 'bg-blue-500/20 text-blue-400',
  'In Progress': 'bg-green-500/20 text-green-400',
  Completed: 'bg-gray-500/20 text-gray-400',
  Cancelled: 'bg-red-500/20 text-red-400',
}

const STATUS_ICONS: Record<string, typeof CheckCircle> = {
  Tentative: AlertCircle,
  Confirmed: CheckCircle,
  'In Progress': Play,
  Completed: CheckCircle,
  Cancelled: XCircle,
}

const TYPE_ICONS: Record<string, string> = {
  Conference: '🏛️',
  'Meeting Room': '💼',
  Spa: '🧖',
  'Banquet Hall': '🎉',
  Boardroom: '📋',
  'Outdoor Terrace': '🌿',
}

const EMPTY_BOOKING = {
  venue_id: '',
  guest_id: '',
  corporate_account_id: '',
  booking_date: '',
  start_time: '09:00',
  end_time: '17:00',
  event_name: '',
  event_type: '',
  attendees: '',
  setup_style: '',
  catering_required: false,
  av_required: false,
  special_requirements: '',
  contact_name: '',
  contact_phone: '',
  contact_email: '',
  rate_charged: '',
  status: 'Confirmed',
  notes: '',
}

const EMPTY_VENUE = {
  property_id: '',
  name: '',
  venue_type: '',
  capacity: '',
  hourly_rate: '',
  half_day_rate: '',
  full_day_rate: '',
  amenities: '',
  floor: '',
  area_sqm: '',
  description: '',
}

function venueColor(venueType: string): string {
  if (venueType === 'Spa') return 'bg-purple-500/10 border-purple-500'
  if (venueType === 'Conference') return 'bg-blue-500/10 border-blue-500'
  if (venueType === 'Meeting Room') return 'bg-cyan-500/10 border-cyan-500'
  if (venueType === 'Banquet Hall') return 'bg-amber-500/10 border-amber-500'
  return 'bg-gray-500/10 border-gray-500'
}

function BookingCard({ b, fmtTime }: { b: any; fmtTime: (t: string) => string }) {
  return (
    <div className={'rounded-lg px-3 py-2.5 border-l-2 ' + venueColor(b.venue_type)}>
      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-400">{fmtTime(b.start_time)} - {fmtTime(b.end_time)}</div>
        {b.status && <span className="text-[10px] text-gray-500">{b.status}</span>}
      </div>
      <div className="text-sm text-white font-medium mt-0.5">{b.event_name || b.venue_name}</div>
      <div className="text-xs text-gray-500 mt-0.5">{b.venue_name}{b.attendees ? ' \u00B7 ' + b.attendees + ' pax' : ''}{b.contact_name ? ' \u00B7 ' + b.contact_name : ''}</div>
    </div>
  )
}

export function Venues() {
  const qc = useQueryClient()
  const settings = useSettings()
  const curr = settings.currency_symbol

  const [activeView, setActiveView] = useState<'bookings' | 'venues' | 'calendar'>('bookings')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [venueTypeFilter, setVenueTypeFilter] = useState('')
  const [venueIdFilter, setVenueIdFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [showFilters, setShowFilters] = useState(false)
  const [showCreateBooking, setShowCreateBooking] = useState(false)
  const [showCreateVenue, setShowCreateVenue] = useState(false)
  const [bookingForm, setBookingForm] = useState({ ...EMPTY_BOOKING })
  const [venueForm, setVenueForm] = useState({ ...EMPTY_VENUE })
  const [calDate, setCalDate] = useState(() => {
    const d = new Date()
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
  })
  const [calView, setCalView] = useState<'day' | 'week' | 'month'>('week')
  const [calMonth, setCalMonth] = useState(() => ({ year: new Date().getFullYear(), month: new Date().getMonth() }))

  /* Data Queries */
  const { data: propertiesData } = useQuery({
    queryKey: ['properties-list'],
    queryFn: () => api.get('/v1/admin/properties', { params: { per_page: 200 } }).then(r => r.data),
    staleTime: 5 * 60 * 1000,
  })
  const properties = propertiesData?.properties ?? propertiesData?.data ?? (Array.isArray(propertiesData) ? propertiesData : [])

  const { data: venuesData } = useQuery({
    queryKey: ['venues-all'],
    queryFn: () => api.get('/v1/admin/venues').then(r => r.data),
    staleTime: 60_000,
  })
  const venues = venuesData ?? []

  const bookingParams: any = { page, per_page: 20 }
  if (search) bookingParams.search = search
  if (statusFilter) bookingParams.status = statusFilter
  if (venueTypeFilter) bookingParams.venue_type = venueTypeFilter
  if (venueIdFilter) bookingParams.venue_id = venueIdFilter
  if (dateFrom) bookingParams.date_from = dateFrom
  if (dateTo) bookingParams.date_to = dateTo

  const { data: bookingsData, isLoading: bookingsLoading } = useQuery({
    queryKey: ['venue-bookings', bookingParams],
    queryFn: () => api.get('/v1/admin/venues/bookings', { params: bookingParams }).then(r => r.data),
  })
  const bookings = bookingsData?.data ?? []
  const meta = bookingsData?.meta ?? {}

  // Calendar data — compute date range based on calView
  const calRangeFrom = (() => {
    if (calView === 'day') return calDate
    if (calView === 'month') return calMonth.year + '-' + String(calMonth.month + 1).padStart(2, '0') + '-01'
    const d = new Date(calDate); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toISOString().slice(0, 10)
  })()
  const calRangeTo = (() => {
    if (calView === 'day') return calDate
    if (calView === 'month') { const ld = new Date(calMonth.year, calMonth.month + 1, 0).getDate(); return calMonth.year + '-' + String(calMonth.month + 1).padStart(2, '0') + '-' + String(ld).padStart(2, '0') }
    const d = new Date(calRangeFrom); d.setDate(d.getDate() + 6); return d.toISOString().slice(0, 10)
  })()

  const { data: calendarRaw = {} } = useQuery({
    queryKey: ['venue-calendar', calRangeFrom, calRangeTo],
    queryFn: () => api.get('/v1/admin/venues/bookings/calendar', { params: { date_from: calRangeFrom, date_to: calRangeTo } }).then(r => r.data).catch(() => ({})),
    enabled: activeView === 'calendar',
  })
  const calendarData = calendarRaw as Record<string, any[]>

  /* Mutations */
  const createBookingMut = useMutation({
    mutationFn: (body: any) => api.post('/v1/admin/venues/bookings', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['venue-bookings'] }); qc.invalidateQueries({ queryKey: ['venue-calendar'] }); setShowCreateBooking(false); setBookingForm({ ...EMPTY_BOOKING }); toast.success('Booking created') },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  })

  const createVenueMut = useMutation({
    mutationFn: (body: any) => api.post('/v1/admin/venues', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['venues-all'] }); setShowCreateVenue(false); setVenueForm({ ...EMPTY_VENUE }); toast.success('Venue created') },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  })

  const hasFilters = statusFilter || venueTypeFilter || venueIdFilter || dateFrom || dateTo
  const clearFilters = () => { setStatusFilter(''); setVenueTypeFilter(''); setVenueIdFilter(''); setDateFrom(''); setDateTo(''); setPage(1) }

  const fmtTime = (t: string) => t?.slice(0, 5) || ''

  // Calendar helpers
  const calWeekStart = new Date(calRangeFrom)
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(calWeekStart)
    d.setDate(d.getDate() + i)
    return d
  })
  const calWeekEnd = new Date(calWeekStart); calWeekEnd.setDate(calWeekEnd.getDate() + 6)
  const calWeekLabel = calWeekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' \u2014 ' + calWeekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  const DAY_NAMES_S = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  const shiftCal = (dir: number) => {
    if (calView === 'day') {
      const d = new Date(calDate); d.setDate(d.getDate() + dir); setCalDate(d.toISOString().slice(0, 10))
    } else if (calView === 'week') {
      const d = new Date(calDate); d.setDate(d.getDate() + dir * 7); setCalDate(d.toISOString().slice(0, 10))
    } else {
      setCalMonth(prev => { let m = prev.month + dir, y = prev.year; if (m < 0) { m = 11; y-- } if (m > 11) { m = 0; y++ } return { year: y, month: m } })
    }
  }
  const calGoToday = () => {
    const now = new Date()
    setCalDate(now.toISOString().slice(0, 10))
    setCalMonth({ year: now.getFullYear(), month: now.getMonth() })
  }

  // Month grid for calendar
  const calMonthWeeks = (() => {
    const first = new Date(calMonth.year, calMonth.month, 1)
    const lastDay = new Date(calMonth.year, calMonth.month + 1, 0).getDate()
    const startDow = (first.getDay() + 6) % 7
    const weeks: (Date | null)[][] = []
    let week: (Date | null)[] = Array(startDow).fill(null)
    for (let day = 1; day <= lastDay; day++) {
      week.push(new Date(calMonth.year, calMonth.month, day))
      if (week.length === 7) { weeks.push(week); week = [] }
    }
    if (week.length > 0) { while (week.length < 7) week.push(null); weeks.push(week) }
    return weeks
  })()

  return (
    <div className="p-6 space-y-5">
      <PairTabs tabs={LOCATIONS_TABS} />
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Venues & Bookings</h1>
          <p className="text-sm text-gray-500">Conference rooms, spa facilities, and event spaces</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-dark-surface border border-dark-border rounded-xl p-1">
            {[
              { key: 'bookings' as const, label: 'Bookings' },
              { key: 'calendar' as const, label: 'Calendar' },
              { key: 'venues' as const, label: 'Venues' },
            ].map(v => (
              <button key={v.key} onClick={() => setActiveView(v.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeView === v.key ? 'bg-primary-500/15 text-primary-400' : 'text-gray-500 hover:text-white'
                }`}>
                {v.label}
              </button>
            ))}
          </div>
          {activeView === 'bookings' && (
            <button onClick={() => setShowCreateBooking(true)}
              className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-dark-bg font-semibold text-sm px-4 py-2 rounded-lg transition-colors">
              <Plus size={15} /> New Booking
            </button>
          )}
          {activeView === 'venues' && (
            <button onClick={() => setShowCreateVenue(true)}
              className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-dark-bg font-semibold text-sm px-4 py-2 rounded-lg transition-colors">
              <Plus size={15} /> Add Venue
            </button>
          )}
        </div>
      </div>

      {/* BOOKINGS VIEW */}
      {activeView === 'bookings' && (
        <>
          <div className="space-y-2">
            <div className="flex gap-3">
              <div className="relative flex-1 max-w-md">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
                  placeholder="Search event name, contact..."
                  className="w-full bg-dark-surface border border-dark-border rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500" />
              </div>
              <button onClick={() => setShowFilters(f => !f)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${hasFilters ? 'border-primary-500 text-primary-400' : 'border-dark-border text-gray-400 hover:text-white'}`}>
                <Filter size={14} /> Filters
              </button>
            </div>
            {showFilters && (
              <div className="flex flex-wrap gap-2 items-center">
                <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
                  className="bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500">
                  <option value="">All Statuses</option>
                  {BOOKING_STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
                <select value={venueTypeFilter} onChange={e => { setVenueTypeFilter(e.target.value); setPage(1) }}
                  className="bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500">
                  <option value="">All Types</option>
                  {VENUE_TYPES.map(s => <option key={s}>{s}</option>)}
                </select>
                <select value={venueIdFilter} onChange={e => { setVenueIdFilter(e.target.value); setPage(1) }}
                  className="bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500">
                  <option value="">All Venues</option>
                  {venues.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-500">From</span>
                  <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1) }}
                    className="bg-dark-surface border border-dark-border rounded-lg px-2 py-2 text-sm text-white focus:outline-none focus:border-primary-500" />
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-500">To</span>
                  <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1) }}
                    className="bg-dark-surface border border-dark-border rounded-lg px-2 py-2 text-sm text-white focus:outline-none focus:border-primary-500" />
                </div>
                {hasFilters && <button onClick={clearFilters} className="text-xs text-gray-500 hover:text-white px-2">Clear</button>}
              </div>
            )}
          </div>

          <div className="bg-dark-surface border border-dark-border rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-border">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Date</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Time</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Venue</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Event</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Guest / Company</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Pax</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Setup</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Services</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Rate</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody>
                {bookingsLoading && <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-600">Loading...</td></tr>}
                {!bookingsLoading && bookings.length === 0 && <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-600">No bookings found</td></tr>}
                {bookings.map((b: any) => {
                  const StIcon = STATUS_ICONS[b.status] || CheckCircle
                  return (
                    <tr key={b.id} className="border-b border-dark-border/50 hover:bg-dark-surface2 transition-colors">
                      <td className="px-4 py-3 text-gray-300 text-xs whitespace-nowrap">{b.booking_date?.slice(0, 10)}</td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        <span className="text-primary-400 font-medium">{fmtTime(b.start_time)}</span>
                        <ArrowRight size={10} className="inline mx-1 text-gray-600" />
                        <span className="text-gray-400">{fmtTime(b.end_time)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-white text-xs font-medium">{b.venue?.name ?? '—'}</div>
                        <div className="text-[10px] text-gray-500">{b.venue?.venue_type} &middot; {b.venue?.property?.name}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-white text-xs">{b.event_name || '—'}</div>
                        {b.event_type && <div className="text-[10px] text-gray-500">{b.event_type}</div>}
                      </td>
                      <td className="px-4 py-3">
                        {b.guest ? (
                          <div className="text-xs text-gray-300">{b.guest.full_name}</div>
                        ) : b.corporate_account ? (
                          <div className="text-xs text-gray-300">{b.corporate_account.company_name}</div>
                        ) : b.contact_name ? (
                          <div className="text-xs text-gray-300">{b.contact_name}</div>
                        ) : (
                          <span className="text-xs text-gray-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{b.attendees ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{b.setup_style ?? '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          {b.catering_required && <span title="Catering" className="w-5 h-5 rounded bg-amber-500/10 flex items-center justify-center"><Coffee size={10} className="text-amber-400" /></span>}
                          {b.av_required && <span title="AV Equipment" className="w-5 h-5 rounded bg-blue-500/10 flex items-center justify-center"><Monitor size={10} className="text-blue-400" /></span>}
                          {!b.catering_required && !b.av_required && <span className="text-xs text-gray-600">—</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-primary-400 text-xs font-medium">{b.rate_charged ? `${curr}${Number(b.rate_charged).toLocaleString()}` : '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${STATUS_COLORS[b.status] ?? 'bg-gray-500/20 text-gray-400'}`}>
                          <StIcon size={10} /> {b.status}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {meta.last_page > 1 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Page {meta.current_page} of {meta.last_page} ({meta.total} bookings)</span>
              <div className="flex gap-2">
                <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="p-1.5 rounded-lg border border-dark-border text-gray-400 hover:text-white disabled:opacity-40"><ChevronLeft size={15} /></button>
                <button disabled={page === meta.last_page} onClick={() => setPage(p => p + 1)} className="p-1.5 rounded-lg border border-dark-border text-gray-400 hover:text-white disabled:opacity-40"><ChevronRight size={15} /></button>
              </div>
            </div>
          )}
        </>
      )}

      {/* CALENDAR VIEW */}
      {activeView === 'calendar' && (
        <div className="bg-dark-surface border border-dark-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="flex rounded-lg border border-dark-border overflow-hidden">
                {([['day', CalendarDays, 'Day'], ['week', Calendar, 'Week'], ['month', CalendarRange, 'Month']] as const).map(([v, Icon, label]) => (
                  <button key={v} onClick={() => setCalView(v as any)} className={'flex items-center gap-1 px-2.5 py-1.5 text-xs transition-colors ' + (calView === v ? 'bg-primary-500/10 text-primary-400' : 'text-gray-400 hover:text-white')}>
                    <Icon size={12} /> {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => shiftCal(-1)} className="p-1.5 rounded-lg border border-dark-border text-gray-400 hover:text-white"><ChevronLeft size={14} /></button>
              <span className="text-xs text-gray-400 min-w-[180px] text-center">
                {calView === 'day' && new Date(calDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                {calView === 'week' && calWeekLabel}
                {calView === 'month' && (MONTH_NAMES[calMonth.month] + ' ' + calMonth.year)}
              </span>
              <button onClick={() => shiftCal(1)} className="p-1.5 rounded-lg border border-dark-border text-gray-400 hover:text-white"><ChevronRight size={14} /></button>
              <button onClick={calGoToday} className="text-xs text-primary-400 hover:text-primary-300 px-2">Today</button>
            </div>
          </div>

          {/* Day View */}
          {calView === 'day' && (() => {
            const dayBookings = calendarData[calDate] ?? []
            return (
              <div>
                <h3 className="text-sm font-medium text-white mb-3">{dayBookings.length} booking{dayBookings.length !== 1 ? 's' : ''}</h3>
                {dayBookings.length === 0 && <p className="text-gray-600 text-sm text-center py-12">No bookings for this day</p>}
                <div className="space-y-2">
                  {dayBookings.map((b: any) => (
                    <BookingCard key={b.id} b={b} fmtTime={fmtTime} />
                  ))}
                </div>
              </div>
            )
          })()}

          {/* Week View */}
          {calView === 'week' && (
            <div className="grid grid-cols-7 gap-2">
              {weekDays.map((day) => {
                const ds = day.toISOString().slice(0, 10)
                const isToday = ds === new Date().toISOString().slice(0, 10)
                const dayBookings = calendarData[ds] ?? []
                return (
                  <div key={ds} className={'rounded-xl border p-3 min-h-[180px] ' + (isToday ? 'border-primary-500/50 bg-primary-500/5' : 'border-dark-border bg-dark-surface2/30')}>
                    <div className="flex items-center justify-between mb-2">
                      <span className={'text-xs font-medium ' + (isToday ? 'text-primary-400' : 'text-gray-400')}>
                        {day.toLocaleDateString('en-US', { weekday: 'short' })}
                      </span>
                      <span className={'text-lg font-semibold ' + (isToday ? 'text-primary-400' : 'text-white')}>
                        {day.getDate()}
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {dayBookings.length === 0 && <p className="text-[10px] text-gray-600 text-center py-4">No bookings</p>}
                      {dayBookings.map((b: any) => (
                        <div key={b.id} className={'rounded-lg px-2 py-1.5 border-l-2 ' + venueColor(b.venue_type)}>
                          <div className="text-[10px] text-gray-400">{fmtTime(b.start_time)} - {fmtTime(b.end_time)}</div>
                          <div className="text-xs text-white font-medium truncate">{b.event_name || b.venue_name}</div>
                          <div className="text-[10px] text-gray-500 truncate">{b.venue_name}{b.attendees ? ' \u00B7 ' + b.attendees + ' pax' : ''}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Month View */}
          {calView === 'month' && (
            <div>
              <div className="grid grid-cols-7 gap-1 mb-2">
                {DAY_NAMES_S.map(d => <div key={d} className="text-center text-xs text-gray-500 font-medium py-1">{d}</div>)}
              </div>
              {calMonthWeeks.map((week, wi) => (
                <div key={wi} className="grid grid-cols-7 gap-1 mb-1">
                  {week.map((date, di) => {
                    if (!date) return <div key={di} className="min-h-[80px] rounded-lg bg-dark-surface2/20" />
                    const ds = date.toISOString().slice(0, 10)
                    const isToday = ds === new Date().toISOString().slice(0, 10)
                    const dayBookings = calendarData[ds] ?? []
                    return (
                      <div
                        key={di}
                        onClick={() => { setCalDate(ds); setCalView('day') }}
                        className={'min-h-[80px] rounded-lg border p-2 cursor-pointer transition-colors hover:border-primary-500/40 ' +
                          (isToday ? 'border-primary-500/50 bg-primary-500/5' : 'border-dark-border/50 bg-dark-surface2/30')}
                      >
                        <div className={'text-xs font-semibold mb-1 ' + (isToday ? 'text-primary-400' : 'text-white')}>{date.getDate()}</div>
                        <div className="space-y-0.5">
                          {dayBookings.slice(0, 2).map((b: any) => (
                            <div key={b.id} className={'text-[10px] px-1 py-0.5 rounded truncate border-l-2 text-gray-300 ' + venueColor(b.venue_type)}>
                              {b.event_name || b.venue_name}
                            </div>
                          ))}
                          {dayBookings.length > 2 && <div className="text-[10px] text-gray-500">+{dayBookings.length - 2} more</div>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* VENUES VIEW */}
      {activeView === 'venues' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {venues.length === 0 && <p className="col-span-3 text-center text-gray-500 py-12">No venues configured</p>}
          {venues.map((v: any) => (
            <div key={v.id} className="bg-dark-surface border border-dark-border rounded-xl p-5 hover:border-dark-border/80 transition-colors">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl">{TYPE_ICONS[v.venue_type] || '🏢'}</span>
                  <div>
                    <h3 className="text-sm font-semibold text-white">{v.name}</h3>
                    <p className="text-xs text-gray-500">{v.venue_type} &middot; {v.property?.name}</p>
                  </div>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${v.is_active ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
                  {v.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-3">
                {v.capacity && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-400">
                    <UsersIcon size={11} className="text-gray-500" /> {v.capacity} pax
                  </div>
                )}
                {v.area_sqm && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-400">
                    <MapPin size={11} className="text-gray-500" /> {v.area_sqm} m²
                  </div>
                )}
                {v.floor && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-400">
                    <Building2 size={11} className="text-gray-500" /> Floor {v.floor}
                  </div>
                )}
              </div>

              <div className="flex gap-2 mb-3">
                {v.hourly_rate && <span className="text-[10px] px-2 py-0.5 bg-primary-500/10 text-primary-400 rounded">{curr}{v.hourly_rate}/hr</span>}
                {v.half_day_rate && <span className="text-[10px] px-2 py-0.5 bg-primary-500/10 text-primary-400 rounded">{curr}{v.half_day_rate}/½day</span>}
                {v.full_day_rate && <span className="text-[10px] px-2 py-0.5 bg-primary-500/10 text-primary-400 rounded">{curr}{v.full_day_rate}/day</span>}
              </div>

              {v.amenities && v.amenities.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {(v.amenities as string[]).map((a: string) => (
                    <span key={a} className="text-[10px] px-1.5 py-0.5 bg-dark-surface2 border border-dark-border rounded text-gray-400">{a}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* CREATE BOOKING MODAL */}
      {showCreateBooking && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-surface border border-dark-border rounded-2xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-white">New Venue Booking</h2>
              <button onClick={() => setShowCreateBooking(false)} className="text-gray-500 hover:text-white"><X size={18} /></button>
            </div>
            <form onSubmit={e => {
              e.preventDefault()
              createBookingMut.mutate({
                ...bookingForm,
                venue_id: parseInt(bookingForm.venue_id) || undefined,
                guest_id: bookingForm.guest_id ? parseInt(bookingForm.guest_id) : undefined,
                corporate_account_id: bookingForm.corporate_account_id ? parseInt(bookingForm.corporate_account_id) : undefined,
                attendees: bookingForm.attendees ? parseInt(bookingForm.attendees) : undefined,
                rate_charged: bookingForm.rate_charged ? parseFloat(bookingForm.rate_charged) : undefined,
              })
            }} className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Venue *</label>
                  <select required value={bookingForm.venue_id} onChange={e => setBookingForm(f => ({ ...f, venue_id: e.target.value }))}
                    className="w-full bg-dark-surface2 border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500">
                    <option value="">-- Select --</option>
                    {venues.map((v: any) => <option key={v.id} value={v.id}>{v.name} ({v.venue_type})</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Date *</label>
                  <input required type="date" value={bookingForm.booking_date} onChange={e => setBookingForm(f => ({ ...f, booking_date: e.target.value }))}
                    className="w-full bg-dark-surface2 border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Status</label>
                  <select value={bookingForm.status} onChange={e => setBookingForm(f => ({ ...f, status: e.target.value }))}
                    className="w-full bg-dark-surface2 border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500">
                    {BOOKING_STATUSES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Start Time *</label>
                  <input required type="time" value={bookingForm.start_time} onChange={e => setBookingForm(f => ({ ...f, start_time: e.target.value }))}
                    className="w-full bg-dark-surface2 border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">End Time *</label>
                  <input required type="time" value={bookingForm.end_time} onChange={e => setBookingForm(f => ({ ...f, end_time: e.target.value }))}
                    className="w-full bg-dark-surface2 border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Attendees</label>
                  <input type="number" value={bookingForm.attendees} onChange={e => setBookingForm(f => ({ ...f, attendees: e.target.value }))}
                    className="w-full bg-dark-surface2 border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Event Name</label>
                  <input value={bookingForm.event_name} onChange={e => setBookingForm(f => ({ ...f, event_name: e.target.value }))}
                    className="w-full bg-dark-surface2 border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Event Type</label>
                  <select value={bookingForm.event_type} onChange={e => setBookingForm(f => ({ ...f, event_type: e.target.value }))}
                    className="w-full bg-dark-surface2 border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500">
                    <option value="">-- Select --</option>
                    {EVENT_TYPES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Setup Style</label>
                  <select value={bookingForm.setup_style} onChange={e => setBookingForm(f => ({ ...f, setup_style: e.target.value }))}
                    className="w-full bg-dark-surface2 border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500">
                    <option value="">-- Select --</option>
                    {SETUP_STYLES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Guest ID</label>
                  <input type="number" value={bookingForm.guest_id} onChange={e => setBookingForm(f => ({ ...f, guest_id: e.target.value }))}
                    className="w-full bg-dark-surface2 border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Rate ({curr})</label>
                  <input type="number" step="0.01" value={bookingForm.rate_charged} onChange={e => setBookingForm(f => ({ ...f, rate_charged: e.target.value }))}
                    className="w-full bg-dark-surface2 border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div className="flex items-end gap-4 pb-2">
                  <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
                    <input type="checkbox" checked={bookingForm.catering_required} onChange={e => setBookingForm(f => ({ ...f, catering_required: e.target.checked }))}
                      className="rounded bg-dark-surface2 border-dark-border" />
                    <Coffee size={12} /> Catering
                  </label>
                  <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
                    <input type="checkbox" checked={bookingForm.av_required} onChange={e => setBookingForm(f => ({ ...f, av_required: e.target.checked }))}
                      className="rounded bg-dark-surface2 border-dark-border" />
                    <Monitor size={12} /> AV
                  </label>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Contact Name</label>
                  <input value={bookingForm.contact_name} onChange={e => setBookingForm(f => ({ ...f, contact_name: e.target.value }))}
                    className="w-full bg-dark-surface2 border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Contact Phone</label>
                  <input value={bookingForm.contact_phone} onChange={e => setBookingForm(f => ({ ...f, contact_phone: e.target.value }))}
                    className="w-full bg-dark-surface2 border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Contact Email</label>
                  <input value={bookingForm.contact_email} onChange={e => setBookingForm(f => ({ ...f, contact_email: e.target.value }))}
                    className="w-full bg-dark-surface2 border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Special Requirements</label>
                <textarea value={bookingForm.special_requirements} onChange={e => setBookingForm(f => ({ ...f, special_requirements: e.target.value }))} rows={2}
                  className="w-full bg-dark-surface2 border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowCreateBooking(false)} className="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
                <button type="submit" disabled={createBookingMut.isPending}
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-dark-bg font-semibold text-sm rounded-lg disabled:opacity-50">
                  {createBookingMut.isPending ? 'Creating...' : 'Create Booking'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE VENUE MODAL */}
      {showCreateVenue && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-surface border border-dark-border rounded-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-white">Add Venue</h2>
              <button onClick={() => setShowCreateVenue(false)} className="text-gray-500 hover:text-white"><X size={18} /></button>
            </div>
            <form onSubmit={e => {
              e.preventDefault()
              createVenueMut.mutate({
                ...venueForm,
                property_id: parseInt(venueForm.property_id) || undefined,
                capacity: venueForm.capacity ? parseInt(venueForm.capacity) : undefined,
                hourly_rate: venueForm.hourly_rate ? parseFloat(venueForm.hourly_rate) : undefined,
                half_day_rate: venueForm.half_day_rate ? parseFloat(venueForm.half_day_rate) : undefined,
                full_day_rate: venueForm.full_day_rate ? parseFloat(venueForm.full_day_rate) : undefined,
                area_sqm: venueForm.area_sqm ? parseInt(venueForm.area_sqm) : undefined,
                amenities: venueForm.amenities ? venueForm.amenities.split(',').map((a: string) => a.trim()).filter(Boolean) : [],
              })
            }} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs text-gray-400 mb-1">Name *</label>
                  <input required value={venueForm.name} onChange={e => setVenueForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full bg-dark-surface2 border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Property *</label>
                  <select required value={venueForm.property_id} onChange={e => setVenueForm(f => ({ ...f, property_id: e.target.value }))}
                    className="w-full bg-dark-surface2 border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500">
                    <option value="">-- Select --</option>
                    {(Array.isArray(properties) ? properties : []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Type *</label>
                  <select required value={venueForm.venue_type} onChange={e => setVenueForm(f => ({ ...f, venue_type: e.target.value }))}
                    className="w-full bg-dark-surface2 border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500">
                    <option value="">-- Select --</option>
                    {VENUE_TYPES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Capacity</label>
                  <input type="number" value={venueForm.capacity} onChange={e => setVenueForm(f => ({ ...f, capacity: e.target.value }))}
                    className="w-full bg-dark-surface2 border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Area (m²)</label>
                  <input type="number" value={venueForm.area_sqm} onChange={e => setVenueForm(f => ({ ...f, area_sqm: e.target.value }))}
                    className="w-full bg-dark-surface2 border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Hourly Rate ({curr})</label>
                  <input type="number" step="0.01" value={venueForm.hourly_rate} onChange={e => setVenueForm(f => ({ ...f, hourly_rate: e.target.value }))}
                    className="w-full bg-dark-surface2 border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Half-Day Rate ({curr})</label>
                  <input type="number" step="0.01" value={venueForm.half_day_rate} onChange={e => setVenueForm(f => ({ ...f, half_day_rate: e.target.value }))}
                    className="w-full bg-dark-surface2 border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Full-Day Rate ({curr})</label>
                  <input type="number" step="0.01" value={venueForm.full_day_rate} onChange={e => setVenueForm(f => ({ ...f, full_day_rate: e.target.value }))}
                    className="w-full bg-dark-surface2 border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Floor</label>
                  <input value={venueForm.floor} onChange={e => setVenueForm(f => ({ ...f, floor: e.target.value }))}
                    className="w-full bg-dark-surface2 border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-400 mb-1">Amenities (comma-separated)</label>
                  <input value={venueForm.amenities} onChange={e => setVenueForm(f => ({ ...f, amenities: e.target.value }))}
                    placeholder="Projector, Whiteboard, Sound System..."
                    className="w-full bg-dark-surface2 border border-dark-border rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-400 mb-1">Description</label>
                  <textarea value={venueForm.description} onChange={e => setVenueForm(f => ({ ...f, description: e.target.value }))} rows={2}
                    className="w-full bg-dark-surface2 border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none" />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowCreateVenue(false)} className="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
                <button type="submit" disabled={createVenueMut.isPending}
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-dark-bg font-semibold text-sm rounded-lg disabled:opacity-50">
                  {createVenueMut.isPending ? 'Creating...' : 'Create Venue'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
