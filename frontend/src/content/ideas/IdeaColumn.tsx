import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { IdeasColumn, PostCard } from '../lib/types'
import { IdeaCard } from './IdeaCard'
import { COLUMN_TEXT } from './ideasMath'

/**
 * One stage of the board (spec 2026-10-16 §4.1): its name and total, its 50 most recently changed cards, and "See all"
 * past them. While a card from another stage is dragged, it takes the drop.
 */
export function IdeaColumn({ column, posts, total, seeAll, locale, now, pillarName, draggable, locked = false, dropping, onOpen, onMove, onSchedule, onDragStart, onDragEnd, onDrop, children }: {
  column: IdeasColumn
  posts: PostCard[]
  total: number
  seeAll: string
  locale: string
  now: number
  pillarName: (id: number | null) => string | null
  draggable: boolean
  /** Staff while the brand's approvals are on: its cards offer no move into Ready. */
  locked?: boolean
  /** A card from another stage is being dragged: this stage takes the drop. */
  dropping: boolean
  onOpen: (id: number) => void
  onMove: (post: PostCard, to: IdeasColumn) => void
  onSchedule: (post: PostCard) => void
  onDragStart: (post: PostCard) => void
  onDragEnd: () => void
  onDrop: () => void
  /** Above the cards (the Idea stage's capture line). */
  children?: ReactNode
}) {
  const { t } = useTranslation()
  const name = t(`content.ideas.column.${column}`, COLUMN_TEXT[column])
  return (
    <section aria-label={name} data-column={column}
      onDragOver={dropping ? (e) => e.preventDefault() : undefined}
      onDrop={dropping ? (e) => { e.preventDefault(); onDrop() } : undefined}
      className={`flex min-w-0 flex-col gap-2 rounded-xl border bg-a-surface-2 p-3 ${dropping ? 'border-dashed border-a-accent-text' : 'border-a-border'}`}>
      <h2 className="flex items-center justify-between gap-2 text-sm font-semibold text-a-text">
        <span className="truncate">{name}</span>
        <span className="text-xs font-medium tabular-nums text-a-text-2">{total}</span>
      </h2>
      {children}
      {posts.length === 0
        ? <p className="text-xs text-a-text-2">{t('content.ideas.empty', 'Nothing here yet.')}</p>
        : (
          <ul className="space-y-2">
            {posts.map(post => (
              <IdeaCard key={post.id} post={post} column={column} locale={locale} now={now} pillar={pillarName(post.pillar_id)} draggable={draggable} locked={locked}
                onOpen={onOpen} onMove={onMove} onSchedule={onSchedule} onDragStart={onDragStart} onDragEnd={onDragEnd} />
            ))}
          </ul>
        )}
      {total > posts.length && (
        <Link to={seeAll} className="text-xs font-medium text-a-accent-text hover:underline">{t('content.ideas.see_all', 'See all: {{count}}', { count: total })}</Link>
      )}
    </section>
  )
}
