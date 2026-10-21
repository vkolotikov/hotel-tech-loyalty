import { useTranslation } from 'react-i18next'
import { formatDate, weekdayOf } from '../../workspace/lib/wallClock'
import type { DateKey, KeyDate } from '../lib/types'
import { AddButton } from './AddButton'
import { KeyDateChips } from './KeyDateChips'
import { canAdd, clickAdds, type AddChoice } from './addMath'
import { inMonth, monthDayLabel, type DayPlan } from './planMath'
import { PostCardView } from './PostCardView'
import type { PlanHandlers } from './WeekGrid'

/** How many posts a day of the month shows before "+n more". */
const SHOWN = 3

/**
 * The month view (spec 2026-10-21 §6.4): six Monday-first weeks on surface-2 cells; days of another month dimmed with
 * their month, weekend numbers dimmed, today in the brand's circle with "Today"; each day its first posts as cards, how
 * many more, its empty slots and, at its foot, its key dates. The open post's day is outlined. A day's number opens its week.
 */
export function MonthGrid({ plans, date, today, locale, selectedId, dropDate, onDay, onAdd, templates, keyDates, observed = false, onKeyDate, onOpen, onCardPointerDown, onCardKeyDown }: Pick<PlanHandlers, 'onOpen' | 'onCardPointerDown' | 'onCardKeyDown'> & {
  plans: DayPlan[]
  /** A day of the month shown. */
  date: DateKey
  today: DateKey
  locale: string
  selectedId: number | null
  dropDate: DateKey | null
  onDay: (day: DateKey) => void
  /** Opens a new post on a day (spec 2026-10-15 §4): its empty space and its corner "+", from today on. */
  onAdd?: (day: DateKey, choice: AddChoice) => void
  templates?: boolean
  /** Each day's key dates (spec 2026-10-16 §3.4): the month shows the first and how many more. */
  keyDates?: Record<DateKey, KeyDate[]>
  observed?: boolean
  onKeyDate?: (keyDate: KeyDate, day: DateKey) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="min-w-[42rem]">
      <div className="grid grid-cols-7 border-b border-a-border">
        {plans.slice(0, 7).map(day => (
          <div key={day.date} className="bg-a-surface px-3 py-2 font-a-mono text-xs uppercase tracking-[0.12em] text-a-text-2">{formatDate(day.date, locale, { weekday: 'short' })}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {plans.map((day, index) => {
          const own = inMonth(day.date, date)
          const isToday = day.date === today
          const weekend = weekdayOf(day.date) >= 5
          const label = monthDayLabel(day.date, date, locale)
          const extra = day.posts.length - SHOWN
          const adds = onAdd !== undefined && canAdd(day.date, today)
          const open = selectedId !== null && day.posts.some(p => p.id === selectedId)
          return (
            <div key={day.date} data-drop-date={day.date}
              onClick={adds ? (e) => { if (clickAdds(e.target as Element)) onAdd(day.date, 'post') } : undefined}
              className={`group relative flex min-h-[6.5rem] min-w-0 flex-col border-b border-r border-a-border p-1.5 transition-colors ${dropDate === day.date ? 'bg-a-accent/10' : 'bg-a-surface-2'} ${open ? 'ring-1 ring-inset ring-a-accent-text' : ''}`}>
              <div className="mb-1 flex items-center gap-1.5">
                <button type="button" onClick={() => onDay(day.date)} aria-current={isToday ? 'date' : undefined}
                  aria-label={formatDate(day.date, locale, { weekday: 'long', day: 'numeric', month: 'long' })}
                  className={isToday
                    ? 'grid h-6 min-w-6 place-items-center rounded-full bg-a-accent px-1 text-xs font-semibold text-a-accent-ink'
                    : `rounded-md px-1.5 text-xs font-medium hover:bg-a-surface ${own && !weekend ? 'text-a-text' : 'text-a-text-2'}`}>
                  {label.number}
                </button>
                {label.month && <span className="text-xs text-a-text-2">{label.month}</span>}
                {isToday && <span className="text-xs text-a-accent-text">{t('content.common.today', 'Today')}</span>}
              </div>
              {/* The last two weeks open the menu upward, and Mondays rightward: otherwise it would leave the calendar's scroll box. */}
              {adds && <div className="absolute right-1 top-1"><AddButton day={day.date} locale={locale} onAdd={onAdd} templates={templates}
                align={index % 7 === 0 ? 'left' : 'right'} side={index >= plans.length - 14 ? 'above' : 'below'} /></div>}
              <div className="space-y-1.5">
                {day.posts.slice(0, SHOWN).map(post => (
                  <PostCardView key={post.id} post={post} size="month" selected={selectedId === post.id} onOpen={onOpen} onPointerDown={onCardPointerDown} onKeyDown={onCardKeyDown} />
                ))}
                {extra > 0 && (
                  <button type="button" onClick={() => onDay(day.date)} className="px-1 text-xs font-medium text-a-accent-text hover:underline">
                    {t('content.plan.more', '+{{count}} more', { count: extra })}
                  </button>
                )}
                {day.slots.length > 0 && <p className="px-1 text-xs text-a-text-2">{t('content.plan.open_slots', 'Empty slots: {{count}}', { count: day.slots.length })}</p>}
              </div>
              {keyDates?.[day.date] && onKeyDate && (
                <div className="mt-auto pt-1.5">
                  <KeyDateChips items={keyDates[day.date]} observed={observed} compact onPick={(k) => onKeyDate(k, day.date)} onMore={() => onDay(day.date)} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
