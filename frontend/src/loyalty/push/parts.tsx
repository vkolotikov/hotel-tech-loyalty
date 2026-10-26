import { useTranslation } from 'react-i18next'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { Skeleton } from '../../workspace/ui/Skeleton'
import { failureOf, type ApiFailure } from '../lib/api'
import { refusalKey } from '../lib/errors'
import { ToneBadge } from '../ui/formParts'
import { ERRORS } from './errors'
import { statusTone } from './pushMath'
import { CATEGORY_WORDS, STATUS_WORDS } from './words'

/** What the push messages tab shows while loading, when a load failed, and when there is nothing yet. */
export function Loading({ rows = 3 }: { rows?: number }) {
  const { t } = useTranslation()
  return (
    <div role="status" className="space-y-2">
      <span className="sr-only">{t('loyalty.common.loading', 'Loading…')}</span>
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-16" />)}
    </div>
  )
}

export function LoadFailed({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="max-w-xl space-y-3">
      <Notice tone="danger">{t(...refusalKey('loyalty.push', ERRORS, 'load', failureOf(error)))}</Notice>
      <Button variant="secondary" onClick={onRetry}>{t('loyalty.common.retry', 'Try again')}</Button>
    </div>
  )
}

/** A message's status as its tone's badge; a status without a word is shown as sent. */
export function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation()
  return <ToneBadge tone={statusTone(status)}>{status in STATUS_WORDS ? t(`loyalty.push.status.${status}`, STATUS_WORDS[status]) : status}</ToneBadge>
}

/** A category's name; one without a word is shown as the server sent it, and none as "No kind chosen yet". */
export function CategoryName({ category }: { category: string | null }) {
  const { t } = useTranslation()
  if (category === null) return <>{t('loyalty.push.list.no_category', 'No kind chosen yet')}</>
  return <>{category in CATEGORY_WORDS ? t(`loyalty.push.category.${category}`, CATEGORY_WORDS[category]) : category}</>
}

/** A refusal in push messages' words, with what it carries filled in (`reached`, `limit`). */
export function Refusal({ family, failure, vars = {} }: { family: string; failure: ApiFailure; vars?: Record<string, unknown> }) {
  const { t } = useTranslation()
  return <Notice tone="danger">{t(...refusalKey('loyalty.push', ERRORS, family, failure), { ...failure.extra, ...vars })}</Notice>
}
