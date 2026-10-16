import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import type { PostCard } from '../lib/types'
import { PostCardView } from './PostCardView'
import type { PlanHandlers } from './WeekGrid'

/** Posts without a day (spec §4.2). A card dropped here loses its date; one dragged from here to a day gets that day. */
export function Tray({ posts, total, active, selectedId, onOpen, onCardPointerDown, onCardKeyDown }: Pick<PlanHandlers, 'onOpen' | 'onCardPointerDown' | 'onCardKeyDown'> & {
  posts: PostCard[]
  /** Every post with no day; the tray lists the newest 100. */
  total?: number
  /** A dragged card is over the tray. */
  active: boolean
  selectedId: number | null
}) {
  const { t } = useTranslation()
  return (
    <section data-drop="tray" aria-labelledby="content-tray-title"
      className={`flex min-h-[7rem] flex-col gap-2 rounded-xl border p-3 shadow-a-sm transition-colors xl:max-h-[calc(100vh-14rem)] xl:overflow-y-auto ${active ? 'border-a-accent-text bg-a-accent/10' : 'border-a-border bg-a-surface'}`}>
      <h2 id="content-tray-title" className="flex items-center justify-between font-a-mono text-xs font-medium uppercase tracking-[0.12em] text-a-text-2">
        <span>{t('content.plan.tray.title', 'Unscheduled')}</span>
        <span className="tabular-nums">{Math.max(total ?? 0, posts.length)}</span>
      </h2>
      {total !== undefined && total > posts.length && (
        <p className="flex flex-wrap items-center justify-between gap-2 text-xs text-a-text-2">
          <span>{t('content.plan.tray.showing', 'Showing {{shown}} of {{total}}', { shown: posts.length, total })}</span>
          <Link to="/content/posts?unscheduled=1" className="font-semibold text-a-accent-text hover:underline">{t('content.plan.tray.see_all', 'See all')}</Link>
        </p>
      )}
      {posts.length === 0 && <p className="text-xs text-a-text-2">{t('content.plan.tray.empty', 'Drag a post here to take it off the calendar.')}</p>}
      {posts.map(post => (
        <PostCardView key={post.id} post={post} compact selected={selectedId === post.id} onOpen={onOpen} onPointerDown={onCardPointerDown} onKeyDown={onCardKeyDown} />
      ))}
    </section>
  )
}
