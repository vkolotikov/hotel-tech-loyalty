import type { KeyboardEvent, PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDate } from '../../workspace/lib/wallClock'
import type { DateKey, PostCard, Slot } from '../lib/types'
import { slotKey, type DayPlan } from './planMath'
import { PostCardView } from './PostCardView'
import { SlotRow } from './SlotRow'

/** What the Plan's views do when a card or a slot is used. */
export interface PlanHandlers {
  onOpen: (id: number) => void
  onWrite: (slot: Slot) => void
  onFill: (slot: Slot) => void
  /** Starts a drag (the week and month views and the tray; the list has none). */
  onCardPointerDown?: (e: PointerEvent<HTMLButtonElement>, post: PostCard) => void
  /** Shift+← → moves the post a day. */
  onCardKeyDown?: (e: KeyboardEvent<HTMLButtonElement>, post: PostCard) => void
}

/** The week view (spec §4.2): seven day columns, Monday first, on the venue's clock; each day's posts, then its empty slots. */
export function WeekGrid({ plans, today, locale, selectedId, dropDate, fillingKey, aiPaused, onOpen, onWrite, onFill, onCardPointerDown, onCardKeyDown }: PlanHandlers & {
  plans: DayPlan[]
  today: DateKey
  locale: string
  selectedId: number | null
  /** The day a dragged card is over. */
  dropDate: DateKey | null
  fillingKey: string | null
  aiPaused: boolean
}) {
  const { t } = useTranslation()
  return (
    <div className="grid min-h-full min-w-[42rem] grid-cols-7 divide-x divide-a-border">
      {plans.map(day => (
        <section key={day.date} data-drop-date={day.date} aria-labelledby={`day-${day.date}`}
          className={`flex min-w-0 flex-col gap-2 p-2 transition-colors ${dropDate === day.date ? 'bg-a-accent/10' : ''}`}>
          <h3 id={`day-${day.date}`} aria-current={day.date === today ? 'date' : undefined} className="flex items-baseline gap-1.5 px-1 pb-1">
            <span className="font-a-mono text-xs uppercase tracking-[0.12em] text-a-text-2">{formatDate(day.date, locale, { weekday: 'short' })}</span>
            <span className={day.date === today
              ? 'grid h-7 min-w-7 place-items-center rounded-full bg-a-accent px-1.5 font-a-display text-base text-a-accent-ink'
              : 'font-a-display text-lg text-a-text'}>{Number(day.date.slice(8))}</span>
          </h3>
          {day.posts.map(post => (
            <PostCardView key={post.id} post={post} selected={selectedId === post.id} onOpen={onOpen} onPointerDown={onCardPointerDown} onKeyDown={onCardKeyDown} />
          ))}
          {day.slots.map(slot => (
            <SlotRow key={slot.platform} slot={slot} filling={fillingKey === slotKey(slot)} aiPaused={aiPaused} onWrite={() => onWrite(slot)} onFill={() => onFill(slot)} />
          ))}
          {day.posts.length === 0 && day.slots.length === 0 && <p className="px-1 text-xs text-a-text-2">{t('content.plan.empty_day', 'Nothing planned')}</p>}
        </section>
      ))}
    </div>
  )
}
