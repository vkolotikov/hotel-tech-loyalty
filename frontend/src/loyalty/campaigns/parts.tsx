import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { Skeleton } from '../../workspace/ui/Skeleton'
import { failureOf, type ApiFailure } from '../lib/api'
import { refusalKey } from '../lib/errors'
import { ToneBadge } from '../ui/formParts'
import { statusTone } from './campaignsMath'
import { ERRORS } from './errors'
import { STATUS_WORDS } from './words'

/** What Campaigns' tabs and pages show while loading, when a load failed, and when there is nothing yet. */
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
      <Notice tone="danger">{t(...refusalKey('loyalty.campaigns', ERRORS, 'load', failureOf(error)))}</Notice>
      <Button variant="secondary" onClick={onRetry}>{t('loyalty.common.retry', 'Try again')}</Button>
    </div>
  )
}

/** A tab's own line and its main action. */
export function TabHead({ line, children }: { line: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="min-w-0 flex-1 space-y-0.5 text-sm text-a-text-2">{line}</div>
      {children}
    </div>
  )
}

/** A campaign's status as its tone's badge; a status without a word is shown as sent. */
export function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation()
  return <ToneBadge tone={statusTone(status)}>{status in STATUS_WORDS ? t(`loyalty.campaigns.status.${status}`, STATUS_WORDS[status]) : status}</ToneBadge>
}

/** A refusal in Campaigns' words, with what it carries filled in (`reached`, `limit`, `names`). */
export function Refusal({ family, failure, vars = {} }: { family: string; failure: ApiFailure; vars?: Record<string, unknown> }) {
  const { t } = useTranslation()
  return <Notice tone="danger">{t(...refusalKey('loyalty.campaigns', ERRORS, family, failure), { ...failure.extra, ...vars })}</Notice>
}
