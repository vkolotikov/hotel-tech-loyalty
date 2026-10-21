import { useTranslation } from 'react-i18next'
import { formatDate } from '../../workspace/lib/wallClock'
import type { DateKey, KeyDate, Platform } from '../lib/types'
import { AddButton } from './AddButton'
import { KeyDateChips } from './KeyDateChips'
import { canAdd, type AddChoice } from './addMath'
import { slotKey, type DayPlan } from './planMath'
import { PostCardView } from './PostCardView'
import { SlotRow } from './SlotRow'
import type { PlanHandlers } from './WeekGrid'

/** The list view (spec §4.2): the shown week's days that hold something, in order. Below 1024 px it is the only view. */
export function ListView({ plans, today, locale, selectedId, fillingKey, aiPaused, times, onAdd, templates, keyDates, observed = false, onKeyDate, onOpen, onWrite, onFill, onCardKeyDown }: Omit<PlanHandlers, 'onCardPointerDown'> & {
  plans: DayPlan[]
  today: DateKey
  locale: string
  selectedId: number | null
  fillingKey: string | null
  aiPaused: boolean
  /** Each platform's usual time, for its slots' "Best around". */
  times?: Partial<Record<Platform, string>>
  /** Opens a new post on a day (spec 2026-10-15 §4): a "+" at the end of each day's header, from today on. */
  onAdd?: (day: DateKey, choice: AddChoice) => void
  templates?: boolean
  /** Each day's key dates (spec 2026-10-16 §3.4): a day holding only key dates shows too, a past one included. */
  keyDates?: Record<DateKey, KeyDate[]>
  observed?: boolean
  onKeyDate?: (keyDate: KeyDate, day: DateKey) => void
}) {
  const { t } = useTranslation()
  // The days that hold something (key dates too), and — where a new post can be started — today and the days ahead even when empty.
  const days = plans.filter(day => day.posts.length > 0 || day.slots.length > 0 || (keyDates?.[day.date]?.length ?? 0) > 0
    || (onAdd !== undefined && canAdd(day.date, today)))
  if (days.length === 0) return <p className="p-6 text-sm text-a-text-2">{t('content.plan.list_empty', 'Nothing planned this week.')}</p>
  return (
    <div className="divide-y divide-a-border">
      {days.map((day, index) => (
        <section key={day.date} data-drop-date={day.date} aria-labelledby={`list-${day.date}`} className="group p-3 sm:p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 id={`list-${day.date}`} aria-current={day.date === today ? 'date' : undefined} className="font-a-mono text-xs uppercase tracking-[0.12em] text-a-text-2">
              {formatDate(day.date, locale, { weekday: 'long', day: 'numeric', month: 'long' })}
              {day.date === today && <span className="ml-2 rounded-full bg-a-accent px-2 py-0.5 normal-case tracking-normal text-a-accent-ink">{t('content.common.today', 'Today')}</span>}
            </h3>
            {/* The last of several days opens its menu upward: below, it would leave the calendar's scroll box. */}
            {onAdd && canAdd(day.date, today) && (
              <AddButton day={day.date} locale={locale} onAdd={onAdd} templates={templates} align="right" side={index > 0 && index === days.length - 1 ? 'above' : 'below'} />
            )}
          </div>
          {keyDates?.[day.date] && onKeyDate && <div className="mb-2"><KeyDateChips items={keyDates[day.date]} observed={observed} onPick={(k) => onKeyDate(k, day.date)} /></div>}
          <div className="grid gap-2 sm:grid-cols-2">
            {day.posts.map(post => <PostCardView key={post.id} post={post} size="list" selected={selectedId === post.id} onOpen={onOpen} onKeyDown={onCardKeyDown} />)}
            {day.slots.map(slot => (
              <SlotRow key={slot.platform} slot={slot} time={times?.[slot.platform] ?? null} filling={fillingKey === slotKey(slot)} aiPaused={aiPaused} onWrite={() => onWrite(slot)} onFill={() => onFill(slot)} />
            ))}
            {day.posts.length === 0 && day.slots.length === 0 && <p className="text-xs text-a-text-2">{t('content.plan.empty_day', 'Nothing planned')}</p>}
          </div>
        </section>
      ))}
    </div>
  )
}
