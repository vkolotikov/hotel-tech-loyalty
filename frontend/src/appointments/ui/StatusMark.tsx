import { useTranslation } from 'react-i18next'
import { Check, CheckCheck, Clock, Play, UserX, X, type LucideIcon } from 'lucide-react'
import { STATUSES, STATUS_TONE, TONE_CLASS } from '../lib/status'
import type { Status } from '../lib/types'

const ICON: Record<Status, LucideIcon> = {
  pending: Clock,
  confirmed: Check,
  in_progress: Play,
  completed: CheckCheck,
  cancelled: X,
  no_show: UserX,
}

/**
 * A status as an icon and a word — never colour alone. The full admin's
 * bulk action can write a status this workspace does not know; that one is
 * shown as it is stored, in the awaiting-confirmation tone.
 */
export function StatusMark({ status, compact = false }: { status: Status; compact?: boolean }) {
  const { t } = useTranslation()
  const known = STATUSES.includes(status)
  const Icon = known ? ICON[status] : Clock
  const tone = TONE_CLASS[known ? STATUS_TONE[status] : 'pending']
  const word = known ? t(`appointments.status.${status}`) : String(status)

  // On a card (`compact`) the word gives way before the time does: it is
  // shortened with an ellipsis, and a very narrow card shows the icon alone
  // (appointments.css) — the word stays in the card's name and as a tooltip.
  return (
    <span title={compact ? word : undefined} className={`inline-flex items-center gap-1 text-xs font-semibold whitespace-nowrap ${compact ? 'min-w-0' : 'shrink-0'} ${tone.text}`}>
      <Icon size={compact ? 12 : 14} aria-hidden className="shrink-0" />
      {compact ? <span data-status-word="" className="truncate">{word}</span> : <span>{word}</span>}
    </span>
  )
}
