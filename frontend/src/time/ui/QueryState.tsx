import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { Skeleton } from '../../workspace/ui/Skeleton'
import { errorKey } from '../lib/errors'

/**
 * A read's three states in one place: skeleton rows while it loads, the failure in our words with "Try again", else
 * the children. A plan that lacks the area's feature says so (FeatureLocked) instead of an error.
 */
export function QueryState({ loading, error, onRetry, rows = 4, children }: {
  loading: boolean
  error: unknown
  onRetry?: () => void
  rows?: number
  children: ReactNode
}) {
  const { t } = useTranslation()
  if (loading) {
    return (
      <div role="status" aria-label={t('time.common.loading', 'Loading…')} className="space-y-2">
        {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    )
  }
  if (error) {
    if (errorKey(error) === 'time.errors.feature_locked') return <FeatureLocked />
    return (
      <div className="space-y-3">
        <Notice tone="danger">{t(errorKey(error), t('time.errors.unknown', 'Something went wrong. Please try again.'))}</Notice>
        {onRetry && <Button variant="secondary" size="sm" onClick={onRetry}>{t('time.common.retry', 'Try again')}</Button>}
      </div>
    )
  }
  return <>{children}</>
}

/** The plan does not include this area (the server answered 402 `feature_locked`). */
export function FeatureLocked() {
  const { t } = useTranslation()
  return <Notice tone="warning">{t('time.errors.feature_locked', 'Your plan does not include this. A larger package does; see Plan & products.')}</Notice>
}
