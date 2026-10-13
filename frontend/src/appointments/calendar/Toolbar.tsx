import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import type { CalendarMaster, DateKey } from '../lib/types'
import type { View } from '../lib/prefs'
import { formatDate, hhmm, isoWeek } from '../lib/wallClock'
import { useVocab } from '../lib/vocab'
import { rangeFor } from './calendarState'

interface Props {
  view: View
  viewLocked: boolean // narrow screens show the list only
  panelOpen?: boolean // the appointment panel lies over the right edge
  date: DateKey
  locale: string
  masters: CalendarMaster[]
  masterId: number | null
  personPicker: boolean // the one-person picker; the day view has team chips instead
  showCancelled: boolean
  updatedAt: number | null // minutes of the venue's day at the last successful load
  refreshing: boolean
  onView: (view: View) => void
  onDate: (date: DateKey) => void
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  onMaster: (id: number | null) => void
  onShowCancelled: (on: boolean) => void
  onRefresh: () => void
}

/**
 * The room kept clear of the open appointment panel on the calendar's header rows (toolbar, today strip, team chips).
 * The panel is 440 px; from xl the day overview column (288 px) already sits under it, so less is reserved there.
 * One literal, so Tailwind sees it and the rows never drift apart.
 */
export const PANEL_CLEARANCE = 'lg:pr-[456px] xl:pr-[176px]'

const field = 'rounded-xl border border-a-border bg-a-surface px-3 py-1.5 text-sm text-a-text shadow-a-sm transition-colors hover:bg-a-surface-2'

export function Toolbar(p: Props) {
  const { t } = useTranslation()
  const vocab = useVocab()
  const range = rangeFor(p.view, p.date)
  const label = p.view === 'day'
    ? formatDate(p.date, p.locale)
    : `${formatDate(range.from, p.locale, { day: 'numeric', month: 'short' })} – ${formatDate(range.to, p.locale, { day: 'numeric', month: 'short', year: 'numeric' })}`
  const views: [View, string][] = [
    ['day', t('appointments.calendar.view_day', 'Day')],
    ['week', t('appointments.calendar.view_week', 'Week')],
    ['list', t('appointments.calendar.view_list', 'List')],
  ]

  return (
    // With the panel open on a wide screen, the toolbar wraps short of it, so "Updated" and Refresh stay in view.
    <div className={`flex flex-wrap items-center gap-2 px-4 lg:px-6 py-3 bg-a-canvas ${p.panelOpen ? PANEL_CLEARANCE : ''}`}>
      <button type="button" onClick={p.onToday} className={field}>{t('appointments.calendar.today', 'Today')}</button>
      <button type="button" onClick={p.onPrev} className={`${field} px-2`} aria-label={t('appointments.calendar.previous', 'Previous')}><ChevronLeft size={16} aria-hidden /></button>
      <button type="button" onClick={p.onNext} className={`${field} px-2`} aria-label={t('appointments.calendar.next', 'Next')}><ChevronRight size={16} aria-hidden /></button>
      {/* The week number belongs to the date: they wrap together. */}
      <div className="flex items-baseline gap-2"><h2 className="font-a-display text-2xl font-normal tracking-tight text-a-text min-w-[11rem]">{label}</h2><span className="font-a-mono text-xs text-a-text-2">{t('appointments.calendar.week', 'Week {{n}}', { n: isoWeek(p.date) })}</span></div>
      <label className="flex items-center gap-2">
        <span className="sr-only">{t('appointments.calendar.go_to_date', 'Go to date')}</span>
        <input type="date" value={p.date} onChange={(e) => { if (e.target.value) p.onDate(e.target.value) }} className={field} />
      </label>

      {!p.viewLocked && (
        // The group has no overflow clip: a clip would cut off the buttons' focus ring.
        <div className="inline-flex gap-1 rounded-xl bg-a-surface-2 p-1" role="group" aria-label={t('appointments.calendar.view', 'View')}>
          {views.map(([v, text]) => (
            <button key={v} type="button" onClick={() => p.onView(v)} aria-pressed={p.view === v}
              className={`rounded-lg px-3.5 py-1.5 text-sm transition-colors focus-visible:relative focus-visible:z-10 ${p.view === v ? 'bg-a-surface text-a-text font-semibold shadow-a-sm' : 'font-medium text-a-text-2 hover:text-a-text'}`}>{text}</button>
          ))}
        </div>
      )}

      {p.personPicker && (
        <label>
          <span className="sr-only">{vocab('team_member')}</span>
          <select value={p.masterId ?? ''} onChange={(e) => p.onMaster(e.target.value ? Number(e.target.value) : null)} className={field}>
            {/* A week is one person's week (a column per day), so "whole team" is not on offer there. */}
            {p.view !== 'week' && <option value="">{t('appointments.calendar.all_team', 'Whole team')}</option>}
            {p.masters.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
      )}

      <label className="flex items-center gap-2 text-sm text-a-text-2">
        <input type="checkbox" checked={p.showCancelled} onChange={(e) => p.onShowCancelled(e.target.checked)} />
        {t('appointments.calendar.show_cancelled', 'Show cancelled')}
      </label>

      <div className="ml-auto flex items-center gap-2 text-xs text-a-text-2">
        {p.updatedAt !== null && <span>{t('appointments.calendar.updated', 'Updated {{time}}', { time: hhmm(p.updatedAt) })}</span>}
        <button type="button" onClick={p.onRefresh} className={`${field} px-2`} aria-label={t('appointments.calendar.refresh', 'Refresh')} aria-busy={p.refreshing || undefined}>
          <RefreshCw size={14} aria-hidden className={p.refreshing ? 'animate-spin' : ''} />
        </button>
      </div>
    </div>
  )
}
