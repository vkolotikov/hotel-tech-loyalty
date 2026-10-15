import { useTranslation } from 'react-i18next'
import { formatDate } from '../../workspace/lib/wallClock'
import type { DateKey } from '../lib/types'
import { slotKey, type DayPlan } from './planMath'
import { PostCardView } from './PostCardView'
import { SlotRow } from './SlotRow'
import type { PlanHandlers } from './WeekGrid'

/** The list view (spec §4.2): the shown week's days that hold something, in order. Below 1024 px it is the only view. */
export function ListView({ plans, today, locale, selectedId, fillingKey, aiPaused, onOpen, onWrite, onFill, onCardKeyDown }: Omit<PlanHandlers, 'onCardPointerDown'> & {
  plans: DayPlan[]
  today: DateKey
  locale: string
  selectedId: number | null
  fillingKey: string | null
  aiPaused: boolean
}) {
  const { t } = useTranslation()
  const days = plans.filter(day => day.posts.length > 0 || day.slots.length > 0)
  if (days.length === 0) return <p className="p-6 text-sm text-a-text-2">{t('content.plan.list_empty', 'Nothing planned this week.')}</p>
  return (
    <div className="divide-y divide-a-border">
      {days.map(day => (
        <section key={day.date} data-drop-date={day.date} aria-labelledby={`list-${day.date}`} className="p-3 sm:p-4">
          <h3 id={`list-${day.date}`} aria-current={day.date === today ? 'date' : undefined} className="mb-2 font-a-mono text-xs uppercase tracking-[0.12em] text-a-text-2">
            {formatDate(day.date, locale, { weekday: 'long', day: 'numeric', month: 'long' })}
            {day.date === today && <span className="ml-2 rounded-full bg-a-accent px-2 py-0.5 normal-case tracking-normal text-a-accent-ink">{t('content.common.today', 'Today')}</span>}
          </h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {day.posts.map(post => <PostCardView key={post.id} post={post} selected={selectedId === post.id} onOpen={onOpen} onKeyDown={onCardKeyDown} />)}
            {day.slots.map(slot => (
              <SlotRow key={slot.platform} slot={slot} filling={fillingKey === slotKey(slot)} aiPaused={aiPaused} onWrite={() => onWrite(slot)} onFill={() => onFill(slot)} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
