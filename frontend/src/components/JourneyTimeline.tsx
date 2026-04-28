import { useState, useMemo } from 'react'
import { Phone, Mail, MessageSquare, MessageCircle, StickyNote, FileText, Hotel, Star, Sparkles, Activity as ActivityIcon, ChevronDown, ChevronUp } from 'lucide-react'

interface Props {
  activities?: any[]
  inquiries?: any[]
  reservations?: any[]
  bookings?: any[]
}

type EventKind = 'activity' | 'inquiry' | 'reservation' | 'booking'

interface JourneyEvent {
  id: string
  kind: EventKind
  type: string
  title: string
  subtitle?: string
  date: string  // ISO string
  meta?: string
  status?: string
}

/**
 * One chronological feed across all customer touchpoints — calls, emails,
 * notes (activities), CRM inquiries, CRM reservations, and PMS bookings.
 *
 * Source-of-truth approach: rather than re-fetching, we merge whatever
 * the parent passed in. Lets MemberDetail's existing query payload drive
 * the timeline without an extra round-trip. Empty kinds are tolerated.
 *
 * Filter pills let staff narrow to a single channel — useful when a guest
 * has hundreds of activities and reception just wants to skim stays.
 */
export function JourneyTimeline({ activities = [], inquiries = [], reservations = [], bookings = [] }: Props) {
  const [filter, setFilter] = useState<'all' | EventKind>('all')
  const [expanded, setExpanded] = useState(false)

  const events: JourneyEvent[] = useMemo(() => {
    const out: JourneyEvent[] = []
    activities.forEach((a: any) => out.push({
      id: `a-${a.id}`, kind: 'activity', type: (a.type || a.activity_type || 'note'),
      title: (a.type || a.activity_type || 'Activity').replace('_', ' '),
      subtitle: a.description || '',
      date: a.created_at, meta: a.performed_by ? `by ${a.performed_by}` : undefined,
    }))
    inquiries.forEach((i: any) => out.push({
      id: `i-${i.id}`, kind: 'inquiry', type: 'inquiry',
      title: 'Inquiry · ' + (i.inquiry_type || 'general'),
      subtitle: i.event_name || i.room_type_requested
        ? (i.event_name || i.room_type_requested) + (i.check_in ? ` (${i.check_in}${i.check_out ? ` → ${i.check_out}` : ''})` : '')
        : (i.check_in ? `${i.check_in}${i.check_out ? ` → ${i.check_out}` : ''}` : ''),
      date: i.created_at, status: i.status,
      meta: i.assigned_to ? `assigned: ${i.assigned_to}` : undefined,
    }))
    reservations.forEach((r: any) => out.push({
      id: `r-${r.id}`, kind: 'reservation', type: 'reservation',
      title: 'Reservation' + (r.confirmation_no ? ` ${r.confirmation_no}` : ''),
      subtitle: (r.room_type ? r.room_type + ' · ' : '') + (r.check_in ? `${r.check_in}${r.check_out ? ` → ${r.check_out}` : ''}` : ''),
      date: r.created_at || r.check_in, status: r.status,
    }))
    bookings.forEach((b: any) => out.push({
      id: `b-${b.id}`, kind: 'booking', type: 'booking',
      title: 'Stay' + (b.booking_reference ? ` ${b.booking_reference}` : ''),
      subtitle: (b.apartment_name ? b.apartment_name + ' · ' : '') + (b.arrival_date ? `${b.arrival_date}${b.departure_date ? ` → ${b.departure_date}` : ''}` : ''),
      date: b.source_created_at || b.created_at || b.arrival_date,
      status: b.payment_status,
    }))
    return out
      .filter(e => e.date)
      .sort((a, b) => (a.date < b.date ? 1 : -1))
  }, [activities, inquiries, reservations, bookings])

  const counts = {
    all: events.length,
    activity: events.filter(e => e.kind === 'activity').length,
    inquiry: events.filter(e => e.kind === 'inquiry').length,
    reservation: events.filter(e => e.kind === 'reservation').length,
    booking: events.filter(e => e.kind === 'booking').length,
  }

  const filtered = filter === 'all' ? events : events.filter(e => e.kind === filter)
  const visible = expanded ? filtered : filtered.slice(0, 12)

  if (events.length === 0) {
    return <div className="text-center py-6 text-xs text-gray-600">No journey events yet.</div>
  }

  const iconFor = (kind: EventKind, type: string) => {
    if (kind === 'activity') {
      if (type === 'call')     return { Icon: Phone, tone: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/25' }
      if (type === 'email')    return { Icon: Mail, tone: 'text-blue-300 bg-blue-500/10 border-blue-500/25' }
      if (type === 'sms')      return { Icon: MessageSquare, tone: 'text-violet-300 bg-violet-500/10 border-violet-500/25' }
      if (type === 'whatsapp') return { Icon: MessageCircle, tone: 'text-[#25D366] bg-[#25D366]/10 border-[#25D366]/25' }
      if (type === 'note')     return { Icon: StickyNote, tone: 'text-amber-300 bg-amber-500/10 border-amber-500/25' }
      return { Icon: ActivityIcon, tone: 'text-gray-300 bg-gray-500/10 border-gray-500/25' }
    }
    if (kind === 'inquiry')     return { Icon: Sparkles, tone: 'text-purple-300 bg-purple-500/10 border-purple-500/25' }
    if (kind === 'reservation') return { Icon: FileText, tone: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/25' }
    if (kind === 'booking')     return { Icon: Hotel, tone: 'text-indigo-300 bg-indigo-500/10 border-indigo-500/25' }
    return { Icon: Star, tone: 'text-gray-300 bg-gray-500/10 border-gray-500/25' }
  }

  const pills: Array<{ k: 'all' | EventKind; label: string }> = [
    { k: 'all', label: 'All' },
    { k: 'activity', label: 'Activity' },
    { k: 'inquiry', label: 'Inquiries' },
    { k: 'reservation', label: 'Reservations' },
    { k: 'booking', label: 'Stays' },
  ]

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {pills.map(p => {
          const c = counts[p.k]
          if (p.k !== 'all' && c === 0) return null
          const active = filter === p.k
          return (
            <button key={p.k} onClick={() => setFilter(p.k)}
              className={`text-[11px] px-2.5 py-1 rounded-full font-semibold border transition-all ${active
                ? 'bg-primary-500/20 text-primary-300 border-primary-500/30'
                : 'bg-white/[0.025] text-gray-400 border-white/[0.06] hover:border-white/[0.15] hover:text-gray-200'}`}>
              {p.label} <span className="opacity-60 ml-1 tabular-nums">{c}</span>
            </button>
          )
        })}
      </div>

      <div className="relative">
        {/* Vertical guide line — quietly anchors the timeline beats. */}
        <div className="absolute left-[15px] top-2 bottom-2 w-px bg-white/[0.05]" />
        <div className="space-y-2">
          {visible.map(e => {
            const { Icon, tone } = iconFor(e.kind, e.type)
            return (
              <div key={e.id} className="relative flex items-start gap-3 pl-0.5">
                <div className={`relative z-[1] w-8 h-8 rounded-lg border flex items-center justify-center flex-shrink-0 ${tone}`}>
                  <Icon size={13} />
                </div>
                <div className="flex-1 min-w-0 p-2.5 rounded-xl border border-white/[0.06] bg-white/[0.015]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-white capitalize">{e.title}</span>
                    {e.status && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider bg-white/[0.06] text-gray-400">
                        {e.status.replace('_', ' ')}
                      </span>
                    )}
                    <span className="ml-auto text-[10px] text-gray-600 whitespace-nowrap">
                      {new Date(e.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                  {e.subtitle && <p className="text-xs text-gray-400 mt-0.5 truncate">{e.subtitle}</p>}
                  {e.meta && <p className="text-[10px] text-gray-600 mt-0.5">{e.meta}</p>}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {filtered.length > 12 && (
        <button onClick={() => setExpanded(v => !v)}
          className="w-full text-center text-xs text-gray-500 hover:text-white py-2 flex items-center justify-center gap-1">
          {expanded ? <><ChevronUp size={12} /> Show less</> : <><ChevronDown size={12} /> Show {filtered.length - 12} more</>}
        </button>
      )}
    </div>
  )
}
