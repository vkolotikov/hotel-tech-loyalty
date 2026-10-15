import { useTranslation } from 'react-i18next'
import { cardLine } from '../lib/postText'
import type { PostCard } from '../lib/types'
import { PlatformMark } from '../ui/PlatformMark'

/** The card under the pointer while it is dragged. It never takes the pointer, so the day under it can be found. */
export function DragGhost({ post, x, y }: { post: PostCard; x: number; y: number }) {
  const { t } = useTranslation()
  return (
    <div aria-hidden className="pointer-events-none fixed z-50 w-52 -translate-x-1/2 -translate-y-1/2 rotate-1 opacity-90" style={{ left: x, top: y }}>
      <div data-platform={post.platform} className="c-edge flex items-center gap-2 rounded-lg border border-a-border bg-a-surface px-2.5 py-2 shadow-a-lg">
        <PlatformMark platform={post.platform} size="sm" />
        <span className="truncate text-sm text-a-text">{cardLine(post) || t('content.plan.untitled', 'Untitled post')}</span>
      </div>
    </div>
  )
}
