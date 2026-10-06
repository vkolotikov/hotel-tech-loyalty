import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { AppointmentSummary, CatalogueService, DateKey } from '../lib/types'
import { PX_PER_MIN, freeSlotStarts, offHours, placeAppointments } from '../lib/layout'
import { coversSlot, isLive } from '../lib/status'
import { dateOf, formatDate, hhmm, minutesOf, wallMinutes } from '../lib/wallClock'
import { AppointmentCard } from './AppointmentCard'
import { DragPreview } from './DragPreview'
import { PendingDrop, type DropTarget } from './DropConfirm'
import { gridRange, type GridColumn } from './calendarState'
import { REASON_FALLBACK, pinnedColumnIndex, whyNot, type Why } from './dragMath'
import { GRID_KEYS, initialStop, nextStop, orderStops, type Stop } from './gridFocus'
import { useCardDrag } from './useCardDrag'

interface Props {
  columns: GridColumn[]
  appointments: AppointmentSummary[]
  now: { date: DateKey; minutes: number }
  today: DateKey
  selectedId: number | null
  onSlot: (masterId: number, date: DateKey, minutes: number) => void
  onOpen: (id: number) => void
  /** Part F: who performs what (the drag's "doesn't do" check). */
  services?: CatalogueService[]
  locale?: string
  /** The venue's "Tell the client" default (Part D), for a drop's confirm. */
  tellDefault?: boolean
  /** Part F: saves a drop. Without it the grid is read-only. */
  onDrop?: (appointment: AppointmentSummary, to: DropTarget) => Promise<void>
}

const SLOT_STEP = 30

/**
 * Time down the left, a column per person (day) or per day (week). White is
 * working time, tinted is outside hours, hatched is time off. Free half
 * hours are real buttons with a name ("Book Emma at 10:30"), so booking
 * from a slot needs neither hover nor drag. Live cards can be dragged to
 * another time or person and stretched by their bottom edge (Part F); a
 * drop is confirmed before it is saved. Availability shown here is a
 * convenience: the server decides at save.
 */
export function TimeGrid({ columns, appointments, now, today, selectedId, onSlot, onOpen, services = [], locale = 'en', tellDefault = false, onDrop }: Props) {
  const { t } = useTranslation()
  const gridRef = useRef<HTMLDivElement>(null)
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const { startMin, endMin } = gridRange(columns, appointments)

  const check = useCallback((colIndex: number, start: number, length: number, id: number): Why | null => {
    const col = columns[colIndex]
    if (!col) return null
    const moved = appointments.find(a => a.id === id)
    const service = services.find(s => s.id === moved?.service?.id)
    return whyNot({
      date: col.date, start, end: start + length, masterId: col.master.id, day: col.master.days[col.date],
      serviceMasterIds: service ? service.master_ids : null, today,
      others: appointments.filter(a => a.id !== id && a.master?.id === col.master.id),
    })
  }, [columns, appointments, services, today])
  const { drag, begin, consumeClick, cancel } = useCardDrag({ gridRef, startMin, columns, check })
  // A drop waiting for its Save stays with the day and person it was dropped on; once the calendar no longer
  // shows them (another date or view), the drop is dropped — Save must never mean a place nobody chose.
  const pendingAt = drag?.phase === 'confirming' && drag.column ? pinnedColumnIndex(columns, drag.column) : -1
  const pendingGone = drag?.phase === 'confirming' && pendingAt < 0
  useEffect(() => { if (pendingGone) cancel() }, [pendingGone, cancel])
  const shownAt = drag?.phase === 'confirming' ? pendingAt : drag?.place.colIndex ?? -1

  if (columns.length === 0) {
    return <p className="p-8 text-sm text-a-text-2">{t('appointments.calendar.no_team', 'No team members to show. Add team members and their working hours in the full admin.')}</p>
  }

  const height = (endMin - startMin) * PX_PER_MIN
  const hours = Array.from({ length: (endMin - startMin) / 60 }, (_, i) => startMin + i * 60)
  const cols = columns.map((col, i) => {
    const day = col.master.days[col.date]
    const own = appointments.filter(a => a.master?.id === col.master.id && dateOf(a.start) === col.date)
    const bookable = col.date >= today
    return {
      col, i, day, bookable,
      free: bookable ? freeSlotStarts(day, own.filter(a => coversSlot(a.status)), col.date, SLOT_STEP) : [],
      placed: placeAppointments(own, col.date, startMin),
    }
  })
  // Part F: the grid is one tab stop; the arrow keys move between free slots and cards.
  const stops: Stop[] = orderStops(cols.flatMap(({ i, free, placed }) => [
    ...free.map(m => ({ key: `slot:${i}:${m}`, col: i, start: m, end: m + SLOT_STEP })),
    ...placed.map(p => ({ key: `appt:${p.item.id}`, col: i, start: wallMinutes(p.item.start), end: wallMinutes(p.item.start) + p.item.duration_minutes })),
  ]))
  const current = initialStop(stops, activeKey, selectedId)
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!(GRID_KEYS as readonly string[]).includes(e.key)) return
    const focused = (e.target as HTMLElement).closest<HTMLElement>('[data-stop]')?.dataset.stop
    const from = stops.find(s => s.key === focused)
    if (!from) return // a key pressed in the drop dialog, not on a stop
    e.preventDefault()
    const next = nextStop(stops, from, e.key)
    if (!next) return
    setActiveKey(next.key)
    gridRef.current?.querySelector<HTMLElement>(`[data-stop="${next.key}"]`)?.focus()
  }
  const placeLabel = (col: GridColumn, start: number, length: number) =>
    `${formatDate(col.date, locale, { weekday: 'short' })} ${hhmm(start)}–${hhmm(start + length)} · ${col.master.name}`
  const whyText = (why: Why, col: GridColumn, moved: AppointmentSummary) =>
    t(`appointments.calendar.drag.reason.${why.reason}`, REASON_FALLBACK[why.reason], { name: col.master.name, client: why.other?.client.name ?? '', service: moved.service?.name ?? '' })

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

      <div className="flex" ref={gridRef} onKeyDown={onKeyDown} aria-describedby="calendar-keys-hint">
        <p id="calendar-keys-hint" className="sr-only">{t('appointments.calendar.keys_hint', 'Use the arrow keys to move between times and people; Enter opens or books.')}</p>
        <div className="relative w-14 shrink-0" style={{ height }} aria-hidden>
          {hours.map(h => (
            <div key={h} className="absolute right-2 -translate-y-1/2 text-xs text-a-text-2" style={{ top: (h - startMin) * PX_PER_MIN }}>{h === startMin ? '' : hhmm(h)}</div>
          ))}
        </div>

        {cols.map(({ col, i, day, bookable, free, placed }) => {
          const showNow = col.date === now.date && now.minutes >= startMin && now.minutes <= endMin

          return (
            <div key={col.key} data-col={i} className="relative flex-1 min-w-[168px] border-l border-a-border bg-a-surface" style={{ height }}>
              {offHours(day, startMin, endMin).map(([from, to]) => (
                <div key={`off-${from}`} className="absolute inset-x-0 bg-a-surface-2" style={{ top: (from - startMin) * PX_PER_MIN, height: (to - from) * PX_PER_MIN }} />
              ))}

              {(day?.time_off ?? []).map((off, k) => {
                const from = off.start ? minutesOf(off.start) : startMin
                const to = off.end ? minutesOf(off.end) : endMin
                return (
                  <div key={`timeoff-${k}`} className="a-hatch absolute inset-x-0 px-2 py-1 text-xs font-medium text-a-text-2"
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
                  data-stop={`slot:${i}:${m}`} tabIndex={current?.key === `slot:${i}:${m}` ? 0 : -1}
                  onFocus={() => setActiveKey(`slot:${i}:${m}`)}
                  aria-label={t('appointments.calendar.book_at', 'Book {{name}} at {{time}}', { name: col.master.name, time: hhmm(m) })}
                  className="group absolute inset-x-0 rounded text-left text-xs text-a-accent-deep hover:bg-a-accent/10 focus-visible:bg-a-accent/10"
                  style={{ top: (m - startMin) * PX_PER_MIN, height: SLOT_STEP * PX_PER_MIN }}>
                  <span className="px-2 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100">+ {hhmm(m)}</span>
                </button>
              ))}

              {placed.map(p => {
                const movable = onDrop !== undefined && isLive(p.item.status)
                return (
                  <AppointmentCard key={p.item.id} placed={p} selected={p.item.id === selectedId}
                    gutter={bookable && !coversSlot(p.item.status)}
                    onOpen={(id) => { if (!consumeClick()) onOpen(id) }}
                    draggable={movable} lifted={drag?.origin.appt.id === p.item.id}
                    stopKey={`appt:${p.item.id}`} tabIndex={current?.key === `appt:${p.item.id}` ? 0 : -1} onFocusStop={setActiveKey}
                    onDragStart={movable ? (e, kind) => begin(e, kind, { appt: p.item, colIndex: i, start: wallMinutes(p.item.start), length: p.item.duration_minutes }) : undefined} />
                )
              })}

              {drag && shownAt === i && (
                <DragPreview top={(drag.place.start - startMin) * PX_PER_MIN} height={drag.place.length * PX_PER_MIN}
                  label={placeLabel(col, drag.place.start, drag.place.length)}
                  why={drag.place.why ? whyText(drag.place.why, col, drag.origin.appt) : null} />
              )}
              {drag && drag.column && pendingAt === i && onDrop && (
                <PendingDrop top={(drag.place.start + drag.place.length - startMin) * PX_PER_MIN + 4} drag={drag} column={drag.column}
                  locale={locale} tellDefault={tellDefault} onDrop={onDrop} onDone={cancel} />
              )}

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
