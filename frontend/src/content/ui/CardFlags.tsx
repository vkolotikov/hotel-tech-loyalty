import { useTranslation } from 'react-i18next'
import { Hourglass, MessageSquare, Undo2 } from 'lucide-react'
import { useContent } from '../ContentProvider'
import { approvalsOn, cardFlags } from '../lib/approval'
import type { PostCard } from '../lib/types'

const CHIP = 'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-medium'

/**
 * What a card shows beside its status (spec 2026-10-16 §6.3, §7.1): "Waiting for approval" while the brand's approvals
 * are on, "Sent back", and its comment count. Compact (the month, the tray): the marks alone, each with its words for a
 * screen reader. Nothing when there is nothing to say.
 */
export function CardFlags({ post, compact = false }: { post: PostCard; compact?: boolean }) {
  const { t } = useTranslation()
  const { data } = useContent()
  const flags = cardFlags(post, approvalsOn(data))
  if (!flags.waiting && !flags.sentBack && flags.comments === 0) return null
  const waiting = t('content.flags.waiting', 'Waiting for approval')
  const back = t('content.flags.sent_back', 'Sent back')
  const comments = t('content.flags.comments', 'Comments: {{count}}', { count: flags.comments })
  if (compact) {
    return (
      <span data-flags="" className="flex shrink-0 items-center gap-1 text-a-text-2">
        {flags.waiting && <span title={waiting} className="text-a-accent-text"><Hourglass size={12} aria-hidden /><span className="sr-only">{waiting}</span></span>}
        {flags.sentBack && <span title={back} className="text-a-danger"><Undo2 size={12} aria-hidden /><span className="sr-only">{back}</span></span>}
        {flags.comments > 0 && (
          <span title={comments} className="inline-flex items-center gap-0.5 text-xs tabular-nums">
            <MessageSquare size={12} aria-hidden /><span aria-hidden>{flags.comments}</span><span className="sr-only">{comments}</span>
          </span>
        )}
      </span>
    )
  }
  return (
    <span data-flags="" className="flex flex-wrap items-center gap-1">
      {flags.waiting && <span className={`${CHIP} border border-a-accent-text text-a-accent-text`}><Hourglass size={12} aria-hidden />{waiting}</span>}
      {flags.sentBack && <span className={`${CHIP} bg-a-danger/10 text-a-danger`}><Undo2 size={12} aria-hidden />{back}</span>}
      {flags.comments > 0 && (
        <span title={comments} className={`${CHIP} bg-a-surface-2 text-a-text-2 tabular-nums`}>
          <MessageSquare size={12} aria-hidden /><span aria-hidden>{flags.comments}</span><span className="sr-only">{comments}</span>
        </span>
      )}
    </span>
  )
}
