import type { KeyboardEvent, PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useContent } from '../ContentProvider'
import { approvalsOn, cardFlags, clicksOf, flagWords, versionsOf } from '../lib/approval'
import { cardLine } from '../lib/postText'
import type { PostCard } from '../lib/types'
import { CardFlags } from '../ui/CardFlags'
import { PlatformMark } from '../ui/PlatformMark'

/** The one line (drawn once by the Plan) that tells a screen reader how to move a card. */
export const MOVE_HINT_ID = 'content-move-hint'

/** Where a card is drawn: a month day (four lines), a week day (six lines and the image), the list or the tray (one line). */
export type CardSize = 'month' | 'week' | 'list' | 'tray'

/**
 * A post on the Plan (spec 2026-10-21 §6.4): on the brand-tinted card fill, its platform's mark, its time, its status word
 * and its hook (or title, or topic); filled with the brand while its post is open. A press drags it to another day or the
 * Unscheduled chip, Shift+← → moves it a day, a click opens it. A published post stays where it went out.
 */
export function PostCardView({ post, size = 'week', selected = false, onOpen, onPointerDown, onKeyDown }: {
  post: PostCard
  size?: CardSize
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
  const status = t(`content.status.${post.status}`, post.status)
  const words = { platform: t(`content.platform.${post.platform}`, post.platform), status, text, time: post.scheduled_time ?? '' }
  // The name says what the card shows in its order (label in name, WCAG 2.5.3): platform and time, then the status before
  // the words on a month or week card (its first row), after them on a one-line card.
  const oneLine = size === 'list' || size === 'tray'
  const label = oneLine
    ? (post.scheduled_time
      ? t('content.plan.card_label_time', '{{platform}} {{time}}: {{text}}, {{status}}', words)
      : t('content.plan.card_label', '{{platform}}: {{text}}, {{status}}', words))
    : (post.scheduled_time
      ? t('content.plan.card_label_time_status', '{{platform}} {{time}}: {{status}}, {{text}}', words)
      : t('content.plan.card_label_status', '{{platform}}: {{status}}, {{text}}', words))
  // Spec 2026-10-16 §6.3, §7.1: the card's flags end its name (the one-line card draws them without words).
  const flags = flagWords(cardFlags(post, approvalsOn(data)), (key, fallback, vars) => t(key, fallback, vars), versionsOf(post), clicksOf(post))
  // The open post's card is filled with the brand; its secondary text takes the brand's ink.
  const fill = selected ? 'bg-gradient-to-br from-a-accent to-a-accent-deep text-a-accent-ink shadow-a' : 'c-card'
  const second = selected ? 'text-a-accent-ink' : 'c-card-2'
  const time = post.scheduled_time && size !== 'tray' && <span className={`font-a-mono text-xs ${second}`}>{post.scheduled_time}</span>
  const statusWord = <span data-status={post.status} title={status} className={`ml-auto max-w-full truncate text-xs ${second}`}>{status}</span>
  return (
    <button type="button" data-post={post.id} data-platform={post.platform} data-movable={movable ? 'true' : 'false'} data-stop=""
      aria-label={flags ? `${label}, ${flags}` : label} aria-describedby={movable && post.scheduled_date !== null ? MOVE_HINT_ID : undefined} aria-current={selected ? 'true' : undefined}
      onClick={() => onOpen(post.id)}
      onPointerDown={onPointerDown && movable ? (e) => onPointerDown(e, post) : undefined}
      onKeyDown={onKeyDown ? (e) => onKeyDown(e, post) : undefined}
      className={`${fill} flex w-full min-w-0 select-none rounded-[10px] [-webkit-touch-callout:none] text-left transition [@media(hover:hover)]:hover:-translate-y-px ${oneLine ? 'items-center gap-2 px-2.5 py-1.5' : 'flex-col gap-1 px-2.5 py-2'} ${movable && onPointerDown ? 'cursor-grab active:cursor-grabbing' : ''}`}>
      {oneLine ? (
        <>
          {/* Spaces between the parts: the card's text reads as its name does (a flex row draws them as nothing). */}
          <PlatformMark platform={post.platform} size="sm" />{' '}
          {time}{' '}
          <span className="min-w-0 flex-1 truncate text-sm leading-snug">{text}</span>{' '}
          <CardFlags post={post} compact />{' '}
          {statusWord}
        </>
      ) : (
        <>
          {/* A day is narrow: the words get the card's whole width under this row. */}
          <span className="flex w-full flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <PlatformMark platform={post.platform} size="sm" />{' '}
            {time}{' '}
            {statusWord}
          </span>{' '}
          <span className={`${size === 'month' ? 'line-clamp-4' : 'line-clamp-6'} w-full break-words text-sm leading-snug`}>{text}</span>{' '}
          <CardFlags post={post} />
          {size === 'week' && post.image_url && <img src={post.image_url} alt="" loading="lazy" draggable={false} className="h-14 w-full max-w-[8rem] rounded-md object-cover" />}
        </>
      )}
    </button>
  )
}
