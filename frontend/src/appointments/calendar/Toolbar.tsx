import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import type { CalendarMaster, DateKey } from '../lib/types'
import type { View } from '../lib/prefs'
import { formatDate, hhmm } from '../lib/wallClock'
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

const field = 'rounded-lg border border-a-border bg-a-surface px-3 py-1.5 text-sm text-a-text'

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
    <div className={`flex flex-wrap items-center gap-2 px-4 py-3 border-b border-a-border bg-a-surface ${p.panelOpen ? 'lg:pr-[456px]' : ''}`}>
      <button type="button" onClick={p.onPrev} className={`${field} px-2`} aria-label={t('appointments.calendar.previous', 'Previous')}><ChevronLeft size={16} aria-hidden /></button>
      <button type="button" onClick={p.onNext} className={`${field} px-2`} aria-label={t('appointments.calendar.next', 'Next')}><ChevronRight size={16} aria-hidden /></button>
      <label className="flex items-center gap-2">
        <span className="text-sm font-semibold text-a-text min-w-[11rem]">{label}</span>
        <span className="sr-only">{t('appointments.calendar.go_to_date', 'Go to date')}</span>
        <input type="date" value={p.date} onChange={(e) => { if (e.target.value) p.onDate(e.target.value) }} className={field} />
      </label>
      <button type="button" onClick={p.onToday} className={field}>{t('appointments.calendar.today', 'Today')}</button>

      {!p.viewLocked && (
        // The corners are rounded on the buttons, not clipped by the group: a clip would cut off their focus ring.
        <div className="inline-flex rounded-lg border border-a-border" role="group" aria-label={t('appointments.calendar.view', 'View')}>
          {views.map(([v, text]) => (
            <button key={v} type="button" onClick={() => p.onView(v)} aria-pressed={p.view === v}
              className={`px-3 py-1.5 text-sm font-medium first:rounded-l-[7px] last:rounded-r-[7px] focus-visible:relative focus-visible:z-10 ${p.view === v ? 'bg-a-accent text-a-accent-ink' : 'bg-a-surface text-a-text-2 hover:text-a-text'}`}>{text}</button>
          ))}
        </div>
      )}

      <label>
        <span className="sr-only">{vocab('team_member')}</span>
        <select value={p.masterId ?? ''} onChange={(e) => p.onMaster(e.target.value ? Number(e.target.value) : null)} className={field}>
          {/* A week is one person's week (a column per day), so "whole team" is not on offer there. */}
          {p.view !== 'week' && <option value="">{t('appointments.calendar.all_team', 'Whole team')}</option>}
          {p.masters.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </label>

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
