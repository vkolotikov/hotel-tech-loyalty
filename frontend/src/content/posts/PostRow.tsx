import { useTranslation } from 'react-i18next'
import { formatDate } from '../../workspace/lib/wallClock'
import { cardLine } from '../lib/postText'
import type { PostCard } from '../lib/types'
import { PlatformMark } from '../ui/PlatformMark'
import { StatusPill } from '../ui/StatusDot'

/** One post on the Posts page: its platform, its words, its day (or none) and pillar, its image and status; a click opens it. */
export function PostRow({ post, locale, pillar, selected, onOpen }: {
  post: PostCard
  locale: string
  /** The pillar's name, or null for a post without one. */
  pillar: string | null
  selected: boolean
  onOpen: (id: number) => void
}) {
  const { t } = useTranslation()
  const text = cardLine(post) || t('content.plan.untitled', 'Untitled post')
  const day = post.scheduled_date
    ? formatDate(post.scheduled_date, locale, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) + (post.scheduled_time ? ` · ${post.scheduled_time}` : '')
    : t('content.common.unscheduled', 'Unscheduled')
  return (
    <button type="button" data-post-row={post.id} aria-current={selected ? 'true' : undefined} onClick={() => onOpen(post.id)}
      className={`flex w-full items-center gap-3 border-b border-a-border px-4 py-3 text-left last:border-b-0 hover:bg-a-surface-2 ${selected ? 'bg-a-surface-2' : ''}`}>
      <PlatformMark platform={post.platform} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-a-text">{text}</span>
        <span className="block truncate text-xs text-a-text-2">{pillar ? `${day} · ${pillar}` : day}</span>
      </span>
      {post.image_url && <img src={post.image_url} alt="" loading="lazy" draggable={false} className="hidden h-10 w-10 shrink-0 rounded-md object-cover sm:block" />}
      <StatusPill status={post.status} />
    </button>
  )
}
