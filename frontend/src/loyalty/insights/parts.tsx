import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { Skeleton } from '../../workspace/ui/Skeleton'
import { SectionTitle } from '../../workspace/ui/Typography'
import { failureOf } from '../lib/api'
import { refusalKey } from '../lib/errors'
import { ERRORS } from './errors'

/** One chart's card: its title, a line saying what it counts, then the chart. */
export function Card({ id, title, line, children }: { id: string; title: string; line?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id} data-card={id} className="min-w-0 space-y-3 rounded-2xl border border-a-border bg-a-surface p-4">
      <div className="space-y-0.5">
        <SectionTitle><span id={id}>{title}</span></SectionTitle>
        {line && <p className="text-sm text-a-text-2">{line}</p>}
      </div>
      {children}
    </section>
  )
}

export function Loading({ rows = 3 }: { rows?: number }) {
  const { t } = useTranslation()
  return (
    <div role="status" className="space-y-3">
      <span className="sr-only">{t('loyalty.common.loading', 'Loading…')}</span>
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-24" />)}
    </div>
  )
}

/** A read that failed, in Insights' words for its code, with a way to ask again. */
export function LoadFailed({ family, error, onRetry }: { family: 'load' | 'at_risk'; error: unknown; onRetry: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="max-w-xl space-y-3">
      <Notice tone="danger">{t(...refusalKey('loyalty.insights', ERRORS, family, failureOf(error)))}</Notice>
      <Button variant="secondary" onClick={onRetry}>{t('loyalty.common.retry', 'Try again')}</Button>
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-a-border px-4 py-6 text-center text-sm text-a-text-2">{children}</p>
}
