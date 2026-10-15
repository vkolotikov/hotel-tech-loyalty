import { useTranslation } from 'react-i18next'
import type { PostStatus } from '../lib/types'

/** A post status as a dot in its tone (theme/content.css, [data-status]); the card says the word to a screen reader. */
export function StatusDot({ status }: { status: PostStatus }) {
  return <span data-status={status} aria-hidden className="c-st-dot inline-block h-2 w-2 shrink-0 rounded-full" />
}

/** A post status with its name, in its tone over a tint of itself. */
export function StatusPill({ status }: { status: PostStatus }) {
  const { t } = useTranslation()
  return (
    <span data-status={status} className="c-st-tint c-st-text inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium">
      <span aria-hidden className="c-st-dot h-1.5 w-1.5 rounded-full" />
      {t(`content.status.${status}`, status)}
    </span>
  )
}
