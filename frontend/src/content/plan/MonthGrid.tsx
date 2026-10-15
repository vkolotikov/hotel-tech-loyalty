import { useTranslation } from 'react-i18next'
import { formatDate } from '../../workspace/lib/wallClock'
import type { DateKey } from '../lib/types'
import { inMonth, type DayPlan } from './planMath'
import { PostCardView } from './PostCardView'
import type { PlanHandlers } from './WeekGrid'

/** How many posts a day of the month shows before "+n more". */
const SHOWN = 3

/** The month view: six Monday-first weeks; each day its first posts, how many more, and its empty slots. A day's number opens its week. */
export function MonthGrid({ plans, date, today, locale, selectedId, dropDate, onDay, onOpen, onCardPointerDown, onCardKeyDown }: Pick<PlanHandlers, 'onOpen' | 'onCardPointerDown' | 'onCardKeyDown'> & {
  plans: DayPlan[]
  /** A day of the month shown. */
  date: DateKey
  today: DateKey
  locale: string
  selectedId: number | null
  dropDate: DateKey | null
  onDay: (day: DateKey) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="min-w-[42rem]">
      <div className="grid grid-cols-7 border-b border-a-border">
        {plans.slice(0, 7).map(day => (
          <div key={day.date} className="px-2 py-1.5 font-a-mono text-xs uppercase tracking-[0.12em] text-a-text-2">{formatDate(day.date, locale, { weekday: 'short' })}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {plans.map(day => {
          const own = inMonth(day.date, date)
          const extra = day.posts.length - SHOWN
          return (
            <div key={day.date} data-drop-date={day.date}
              className={`min-h-[7.5rem] min-w-0 border-b border-r border-a-border p-1.5 transition-colors ${dropDate === day.date ? 'bg-a-accent/10' : own ? '' : 'bg-a-surface-2/60'}`}>
              <button type="button" onClick={() => onDay(day.date)} aria-current={day.date === today ? 'date' : undefined}
                aria-label={formatDate(day.date, locale, { weekday: 'long', day: 'numeric', month: 'long' })}
                className={`mb-1 rounded-full px-1.5 text-xs font-medium ${day.date === today ? 'bg-a-accent text-a-accent-ink' : own ? 'text-a-text hover:bg-a-surface-2' : 'text-a-text-2 hover:bg-a-surface-2'}`}>
                {Number(day.date.slice(8))}
              </button>
              <div className="space-y-1">
                {day.posts.slice(0, SHOWN).map(post => (
                  <PostCardView key={post.id} post={post} compact selected={selectedId === post.id} onOpen={onOpen} onPointerDown={onCardPointerDown} onKeyDown={onCardKeyDown} />
                ))}
                {extra > 0 && (
                  <button type="button" onClick={() => onDay(day.date)} className="px-1 text-xs font-medium text-a-accent-text hover:underline">
                    {t('content.plan.more', '+{{count}} more', { count: extra })}
                  </button>
                )}
                {day.slots.length > 0 && <p className="px-1 text-xs text-a-text-2">{t('content.plan.open_slots', 'Empty slots: {{count}}', { count: day.slots.length })}</p>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
