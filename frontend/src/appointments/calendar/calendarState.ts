import type { AppointmentSummary, CalendarMaster, DateKey, MasterDay } from '../lib/types'
import type { View } from '../lib/prefs'
import { addDays, formatDate, weekOf } from '../lib/wallClock'
import { dayRange } from '../lib/layout'

export function rangeFor(view: View, date: DateKey): { from: DateKey; to: DateKey } {
  if (view === 'day') return { from: date, to: date }
  const week = weekOf(date)
  return { from: week[0], to: week[6] }
}

/** Working hours and free slots are drawn by the grid only; the list asks the server for none (two queries per person per day). */
export function needsWindows(view: View): boolean {
  return view !== 'list'
}

export function shift(view: View, date: DateKey, dir: 1 | -1): DateKey {
  return addDays(date, dir * (view === 'day' ? 1 : 7))
}

/** Up to two initials of a name: "Mara Ilves-Kask" → "MI". */
function initialsOf(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0].toUpperCase()).join('')
}

/** One column of the time grid: a person on a date. */
export interface GridColumn {
  key: string
  title: string
  subtitle: string | null
  /** The person's initials, for a column that stands for a person; null for a day column. */
  initials: string | null
  date: DateKey
  master: CalendarMaster
  isToday: boolean
}

/**
 * Day view: a column per team member (or the one chosen). Week view: the
 * chosen person — the first when none is chosen — across Monday to Sunday.
 */
export function columnsFor(view: 'day' | 'week', date: DateKey, masters: CalendarMaster[], masterId: number | null, today: DateKey, locale: string): GridColumn[] {
  if (view === 'day') {
    return masters
      .filter(m => masterId === null || m.id === masterId)
      .map(m => ({ key: `m${m.id}`, title: m.name, subtitle: m.title, initials: initialsOf(m.name), date, master: m, isToday: date === today }))
  }

  const master = masters.find(m => m.id === masterId) ?? masters[0]
  if (!master) return []
  return weekOf(date).map(d => ({
    key: `${master.id}-${d}`,
    title: formatDate(d, locale, { weekday: 'short', day: 'numeric' }),
    subtitle: formatDate(d, locale, { month: 'short' }),
    initials: null,
    date: d,
    master,
    isToday: d === today,
  }))
}

/** The hours the grid must show: every column's working hours and every appointment, on a whole-hour frame. */
export function gridRange(columns: GridColumn[], appointments: AppointmentSummary[]): { startMin: number; endMin: number } {
  let startMin = Infinity
  let endMin = -Infinity
  const dates = [...new Set(columns.map(c => c.date))]
  for (const date of dates) {
    const days = columns.filter(c => c.date === date).map(c => c.master.days[date]).filter((d): d is MasterDay => Boolean(d))
    const ids = new Set(columns.filter(c => c.date === date).map(c => c.master.id))
    const range = dayRange(days, appointments.filter(a => a.master !== null && ids.has(a.master.id)), date)
    startMin = Math.min(startMin, range.startMin)
    endMin = Math.max(endMin, range.endMin)
  }
  return Number.isFinite(startMin) ? { startMin, endMin } : dayRange([], [], '1970-01-01')
}
