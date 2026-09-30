import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { DateKey } from '../lib/types'
import { addMonths, formatDate, monthGrid, monthOf } from '../lib/wallClock'

/** A month to jump around in. Every day is a button; the chosen day and the venue's today are marked in the markup, not by colour alone. */
export function MiniMonth({ date, today, locale, onPick }: { date: DateKey; today: DateKey; locale: string; onPick: (date: DateKey) => void }) {
  const { t } = useTranslation()
  const [month, setMonth] = useState(monthOf(date))
  // Follow the calendar into another month without being remounted — a
  // remount would drop the keyboard focus from the day that was just chosen.
  const [followed, setFollowed] = useState(date)
  if (date !== followed) {
    setFollowed(date)
    setMonth(monthOf(date))
  }
  const days = monthGrid(month)

  return (
    <section className="p-4" aria-label={t('appointments.calendar.month', 'Month')}>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-a-text">{formatDate(`${month}-01`, locale, { month: 'long', year: 'numeric' })}</h2>
        <div className="flex gap-1">
          <button type="button" onClick={() => setMonth(addMonths(month, -1))} className="rounded p-1 text-a-text-2 hover:text-a-text" aria-label={t('appointments.calendar.previous_month', 'Previous month')}><ChevronLeft size={16} aria-hidden /></button>
          <button type="button" onClick={() => setMonth(addMonths(month, 1))} className="rounded p-1 text-a-text-2 hover:text-a-text" aria-label={t('appointments.calendar.next_month', 'Next month')}><ChevronRight size={16} aria-hidden /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center text-xs text-a-text-2" aria-hidden>
        {days.slice(0, 7).map(d => <div key={d}>{formatDate(d, locale, { weekday: 'narrow' })}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-y-1 mt-1">
        {days.map(d => {
          const selected = d === date
          const isToday = d === today
          return (
            <button key={d} type="button" onClick={() => onPick(d)}
              aria-pressed={selected} aria-current={isToday ? 'date' : undefined}
              aria-label={formatDate(d, locale, { weekday: 'long', day: 'numeric', month: 'long' })}
              className={`mx-auto h-8 w-8 rounded-full text-sm ${selected ? 'bg-a-accent text-a-accent-ink font-semibold' : isToday ? 'border border-a-accent text-a-accent-deep font-semibold' : monthOf(d) === month ? 'text-a-text hover:bg-a-surface-2' : 'text-a-text-2 hover:bg-a-surface-2'}`}>{Number(d.slice(8))}</button>
          )
        })}
      </div>
    </section>
  )
}
