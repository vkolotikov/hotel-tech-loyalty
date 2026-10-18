import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarPlus } from 'lucide-react'
import type { IdeasColumn, PostCard } from '../lib/types'
import { CardFlags } from '../ui/CardFlags'
import { PlatformMark } from '../ui/PlatformMark'
import { PopMenu } from '../ui/PopMenu'
import { StatusPill } from '../ui/StatusDot'
import { ageText, COLUMN_TEXT, IDEAS_HINT_ID, ideaLine, moveTargets, stepTarget } from './ideasMath'

/**
 * One post without a day (spec 2026-10-16 §4.2): its platform, words, pillar and age; a click opens it in the panel.
 * It moves by drag (where the board drags), by Shift + ← / → when focused, or by "Move to…"; Schedule gives it a day.
 */
export function IdeaCard({ post, column, locale, now, pillar, draggable, locked = false, onOpen, onMove, onSchedule, onDragStart, onDragEnd }: {
  post: PostCard
  column: IdeasColumn
  locale: string
  /** When the board was read: the card's age counts from it. */
  now: number
  pillar: string | null
  draggable: boolean
  /** Staff while the brand's approvals are on: no move into Ready (spec 2026-10-16 §6.2). */
  locked?: boolean
  onOpen: (id: number) => void
  onMove: (post: PostCard, to: IdeasColumn) => void
  onSchedule: (post: PostCard) => void
  onDragStart: (post: PostCard) => void
  onDragEnd: () => void
}) {
  const { t } = useTranslation()
  const line = ideaLine(post) || t('content.plan.untitled', 'Untitled post')
  const sub = [pillar, ageText(post.updated_at, now, locale)].filter(Boolean).join(' · ')
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!e.shiftKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return
    e.preventDefault()
    const to = stepTarget(column, e.key === 'ArrowLeft' ? -1 : 1, locked)
    if (to) onMove(post, to)
  }
  const moveLabel = t('content.ideas.move_to', 'Move to…')
  return (
    <li draggable={draggable || undefined}
      onDragStart={draggable ? (e) => { e.dataTransfer.setData('text/plain', String(post.id)); e.dataTransfer.effectAllowed = 'move'; onDragStart(post) } : undefined}
      onDragEnd={draggable ? onDragEnd : undefined}
      className="rounded-lg border border-a-border bg-a-surface p-2.5 shadow-a-sm">
      <button type="button" data-post={post.id} data-stop="" aria-describedby={IDEAS_HINT_ID} onClick={() => onOpen(post.id)} onKeyDown={onKeyDown}
        className="flex w-full items-start gap-2 rounded-md text-left">
        <PlatformMark platform={post.platform} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="line-clamp-3 block break-words text-sm font-medium text-a-text">{line}</span>
          {sub && <span className="block truncate text-xs text-a-text-2">{sub}</span>}
        </span>
      </button>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {(column === 'review' || column === 'ready') && <StatusPill status={post.status} />}
        <CardFlags post={post} />
        <button type="button" onClick={() => onSchedule(post)}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-a-accent-text hover:bg-a-surface-2">
          <CalendarPlus size={12} aria-hidden />{t('content.ideas.schedule', 'Schedule')}
        </button>
        <PopMenu label={moveLabel} align="right" listClassName="w-40"
          items={moveTargets(column, locked).map(c => ({ id: c, label: t(`content.ideas.column.${c}`, COLUMN_TEXT[c]) }))}
          onPick={(id) => onMove(post, id as IdeasColumn)}
          className="rounded-md px-1.5 py-0.5 text-xs font-medium text-a-text-2 hover:bg-a-surface-2 hover:text-a-text">
          {moveLabel}
        </PopMenu>
      </div>
    </li>
  )
}
