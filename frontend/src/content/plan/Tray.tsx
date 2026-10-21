import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import type { PostCard } from '../lib/types'
import { PostCardView } from './PostCardView'
import type { PlanHandlers } from './WeekGrid'

/**
 * Posts without a day (spec §4.2), as the "Unscheduled (n)" chip's list (spec 2026-10-21 §6.2): each opens in the panel,
 * one dragged from here to a day gets that day; "Showing n of m" and the way to all of them when the list is cut.
 */
export function TrayList({ posts, total, selectedId, onOpen, onCardPointerDown, onCardKeyDown }: Pick<PlanHandlers, 'onOpen' | 'onCardPointerDown' | 'onCardKeyDown'> & {
  posts: PostCard[]
  /** Every post with no day; the list holds the newest 100. */
  total?: number
  selectedId: number | null
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-2">
      {total !== undefined && total > posts.length && (
        <p className="flex flex-wrap items-center justify-between gap-2 text-xs text-a-text-2">
          <span>{t('content.plan.tray.showing', 'Showing {{shown}} of {{total}}', { shown: posts.length, total })}</span>
          <Link to="/content/posts?unscheduled=1" className="font-semibold text-a-accent-text hover:underline">{t('content.plan.tray.see_all', 'See all')}</Link>
        </p>
      )}
      {posts.length === 0 && <p className="text-xs text-a-text-2">{t('content.plan.tray.empty', 'Drag a post here to take it off the calendar.')}</p>}
      {posts.map(post => (
        <PostCardView key={post.id} post={post} size="tray" selected={selectedId === post.id} onOpen={onOpen} onPointerDown={onCardPointerDown} onKeyDown={onCardKeyDown} />
      ))}
    </div>
  )
}
