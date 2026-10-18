import type { KeyboardEvent, PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useContent } from '../ContentProvider'
import { approvalsOn, cardFlags, flagWords } from '../lib/approval'
import { cardLine } from '../lib/postText'
import type { PostCard } from '../lib/types'
import { CardFlags } from '../ui/CardFlags'
import { PlatformMark } from '../ui/PlatformMark'
import { StatusDot } from '../ui/StatusDot'

/** The one line (drawn once by the Plan) that tells a screen reader how to move a card. */
export const MOVE_HINT_ID = 'content-move-hint'

/**
 * A post on the Plan (spec §4.2): its platform's mark and colour edge, its
 * time, its hook (or title, or topic), its status dot, and the image when it
 * has one. A press drags it to another day or the tray, Shift+← → moves it a
 * day, a click opens it. A published post stays where it went out.
 */
export function PostCardView({ post, compact = false, selected = false, onOpen, onPointerDown, onKeyDown }: {
  post: PostCard
  /** The month grid and the tray: one line, no time, no image. */
  compact?: boolean
  /** Its post is open in the panel. */
  selected?: boolean
  onOpen: (id: number) => void
  onPointerDown?: (e: PointerEvent<HTMLButtonElement>, post: PostCard) => void
  onKeyDown?: (e: KeyboardEvent<HTMLButtonElement>, post: PostCard) => void
}) {
  const { t } = useTranslation()
  const { data } = useContent()
  const text = cardLine(post) || t('content.plan.untitled', 'Untitled post')
  const movable = post.status !== 'published'
  const words = { platform: t(`content.platform.${post.platform}`, post.platform), status: t(`content.status.${post.status}`, post.status), text, time: post.scheduled_time ?? '' }
  // The name starts with what the card shows — platform, time, words — then its status (label in name, WCAG 2.5.3).
  const label = post.scheduled_time
    ? t('content.plan.card_label_time', '{{platform}} {{time}}: {{text}}, {{status}}', words)
    : t('content.plan.card_label', '{{platform}}: {{text}}, {{status}}', words)
  // Spec 2026-10-16 §6.3, §7.1: the card's flags end its name (the compact card draws them without words).
  const flags = flagWords(cardFlags(post, approvalsOn(data)), (key, fallback, vars) => t(key, fallback, vars))
  return (
    <button type="button" data-post={post.id} data-platform={post.platform} data-movable={movable ? 'true' : 'false'} data-stop=""
      aria-label={flags ? `${label}, ${flags}` : label} aria-describedby={movable && post.scheduled_date !== null ? MOVE_HINT_ID : undefined} aria-current={selected ? 'true' : undefined}
      onClick={() => onOpen(post.id)}
      onPointerDown={onPointerDown && movable ? (e) => onPointerDown(e, post) : undefined}
      onKeyDown={onKeyDown ? (e) => onKeyDown(e, post) : undefined}
      className={`c-edge flex w-full min-w-0 select-none rounded-lg border [-webkit-touch-callout:none] bg-a-surface text-left shadow-a-sm transition hover:border-a-text-2/40 [@media(hover:hover)]:hover:-translate-y-px ${compact ? 'items-center gap-2 px-2 py-1' : 'flex-col gap-1 px-2.5 py-2'} ${selected ? 'border-a-accent-text ring-1 ring-a-accent-text' : 'border-a-border'} ${movable && onPointerDown ? 'cursor-grab active:cursor-grabbing' : ''}`}>
      {compact ? (
        <>
          <PlatformMark platform={post.platform} size="sm" />
          <span className="min-w-0 flex-1 truncate text-sm leading-snug text-a-text">{text}</span>
          <CardFlags post={post} compact />
          <StatusDot status={post.status} />
        </>
      ) : (
        <>
          {/* A day on the week is narrow: the words get the card's whole width under this row. */}
          <span className="flex w-full items-center gap-1.5">
            <PlatformMark platform={post.platform} size="sm" />
            {post.scheduled_time && <span className="font-a-mono text-xs text-a-text-2">{post.scheduled_time}</span>}
            <span className="ml-auto flex"><StatusDot status={post.status} /></span>
          </span>
          <span className="line-clamp-3 w-full break-words text-sm leading-snug text-a-text">{text}</span>
          <CardFlags post={post} />
          {post.image_url && <img src={post.image_url} alt="" loading="lazy" draggable={false} className="h-14 w-full max-w-[8rem] rounded-md object-cover" />}
        </>
      )}
    </button>
  )
}
