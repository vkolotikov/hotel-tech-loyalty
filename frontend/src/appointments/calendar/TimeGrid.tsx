import { useTranslation } from 'react-i18next'
import type { AppointmentSummary, DateKey } from '../lib/types'
import { PX_PER_MIN, freeSlotStarts, offHours, placeAppointments } from '../lib/layout'
import { coversSlot } from '../lib/status'
import { dateOf, hhmm, minutesOf } from '../lib/wallClock'
import { AppointmentCard } from './AppointmentCard'
import { gridRange, type GridColumn } from './calendarState'

interface Props {
  columns: GridColumn[]
  appointments: AppointmentSummary[]
  now: { date: DateKey; minutes: number }
  today: DateKey
  selectedId: number | null
  onSlot: (masterId: number, date: DateKey, minutes: number) => void
  onOpen: (id: number) => void
}

const SLOT_STEP = 30

/**
 * Time down the left, a column per person (day) or per day (week). White is
 * working time, tinted is outside hours, hatched is time off. Free half
 * hours are real buttons with a name ("Book Emma at 10:30"), so booking
 * from a slot needs neither hover nor drag. Availability shown here is a
 * convenience: the server decides at save.
 */
export function TimeGrid({ columns, appointments, now, today, selectedId, onSlot, onOpen }: Props) {
  const { t } = useTranslation()

  if (columns.length === 0) {
    return <p className="p-8 text-sm text-a-text-2">{t('appointments.calendar.no_team', 'No team members to show. Add team members and their working hours in the full admin.')}</p>
  }

  const { startMin, endMin } = gridRange(columns, appointments)
  const height = (endMin - startMin) * PX_PER_MIN
  const hours = Array.from({ length: (endMin - startMin) / 60 }, (_, i) => startMin + i * 60)

  return (
    <div className="min-w-max">
      <div className="sticky top-0 z-20 flex bg-a-surface border-b border-a-border">
        <div className="w-14 shrink-0" />
        {columns.map(col => (
          <div key={col.key} className={`flex flex-1 min-w-[168px] items-center gap-2 border-l border-a-border px-3 py-2 ${col.isToday ? 'bg-a-accent/10' : ''}`}>
            {col.initials && (
              <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-a-surface-2 text-xs font-semibold text-a-text-2">{col.initials}</span>
            )}
            <div className="min-w-0">
              <div className="text-sm font-semibold text-a-text truncate">{col.title}</div>
              {col.subtitle && <div className="text-xs text-a-text-2 truncate">{col.subtitle}</div>}
            </div>
          </div>
        ))}
      </div>

      <div className="flex">
        <div className="relative w-14 shrink-0" style={{ height }} aria-hidden>
          {hours.map(h => (
            <div key={h} className="absolute right-2 -translate-y-1/2 text-xs text-a-text-2" style={{ top: (h - startMin) * PX_PER_MIN }}>{h === startMin ? '' : hhmm(h)}</div>
          ))}
        </div>

        {columns.map(col => {
          const day = col.master.days[col.date]
          const own = appointments.filter(a => a.master?.id === col.master.id && dateOf(a.start) === col.date)
          const bookable = col.date >= today
          const free = bookable ? freeSlotStarts(day, own.filter(a => coversSlot(a.status)), col.date, SLOT_STEP) : []
          const showNow = col.date === now.date && now.minutes >= startMin && now.minutes <= endMin

          return (
            <div key={col.key} className="relative flex-1 min-w-[168px] border-l border-a-border bg-a-surface" style={{ height }}>
              {offHours(day, startMin, endMin).map(([from, to]) => (
                <div key={`off-${from}`} className="absolute inset-x-0 bg-a-surface-2" style={{ top: (from - startMin) * PX_PER_MIN, height: (to - from) * PX_PER_MIN }} />
              ))}

              {(day?.time_off ?? []).map((off, i) => {
                const from = off.start ? minutesOf(off.start) : startMin
                const to = off.end ? minutesOf(off.end) : endMin
                return (
                  <div key={`timeoff-${i}`} className="a-hatch absolute inset-x-0 px-2 py-1 text-xs font-medium text-a-text-2"
                    style={{ top: (Math.max(from, startMin) - startMin) * PX_PER_MIN, height: (Math.min(to, endMin) - Math.max(from, startMin)) * PX_PER_MIN }}>
                    {t('appointments.calendar.blocked', 'Blocked')}{off.reason ? ` · ${off.reason}` : ''}
                  </div>
                )
              })}

              {hours.map(h => (
                <div key={h} className="absolute inset-x-0 border-t border-a-border" style={{ top: (h - startMin) * PX_PER_MIN }} aria-hidden />
              ))}

              {free.map(m => (
                <button key={m} type="button" onClick={() => onSlot(col.master.id, col.date, m)}
                  aria-label={t('appointments.calendar.book_at', 'Book {{name}} at {{time}}', { name: col.master.name, time: hhmm(m) })}
                  className="group absolute inset-x-0 rounded text-left text-xs text-a-accent-deep hover:bg-a-accent/10 focus-visible:bg-a-accent/10"
                  style={{ top: (m - startMin) * PX_PER_MIN, height: SLOT_STEP * PX_PER_MIN }}>
                  <span className="px-2 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100">+ {hhmm(m)}</span>
                </button>
              ))}

              {placeAppointments(own, col.date, startMin).map(placed => (
                <AppointmentCard key={placed.item.id} placed={placed} selected={placed.item.id === selectedId}
                  gutter={bookable && !coversSlot(placed.item.status)} onOpen={onOpen} />
              ))}

              {showNow && (
                <div data-now-line="" className="absolute inset-x-0 z-10 border-t-2 border-a-danger pointer-events-none" style={{ top: (now.minutes - startMin) * PX_PER_MIN }} aria-hidden />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
