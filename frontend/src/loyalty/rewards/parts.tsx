import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { Skeleton } from '../../workspace/ui/Skeleton'
import { failureOf } from '../lib/api'
import { refusalKey } from '../lib/errors'
import { FormField } from '../ui/formParts'
import { ERRORS } from './errors'
import { brandChoice, brandName } from './rewardsMath'
import type { BrandOptions } from './types'

/** What every Rewards tab shows while it loads, when it could not load, and when there is nothing yet. */
export function Loading() {
  const { t } = useTranslation()
  return (
    <div role="status" className="space-y-2">
      <span className="sr-only">{t('loyalty.common.loading', 'Loading…')}</span>
      {[0, 1, 2].map(i => <Skeleton key={i} className="h-16" />)}
    </div>
  )
}

export function LoadFailed({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="max-w-xl space-y-3">
      <Notice tone="danger">{t(...refusalKey('loyalty.rewards', ERRORS, 'load', failureOf(error)))}</Notice>
      <Button variant="secondary" onClick={onRetry}>{t('loyalty.common.retry', 'Try again')}</Button>
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-a-border px-4 py-8 text-center text-sm text-a-text-2">{children}</p>
}

/** A tab's own line: what it holds, why it has no actions for this person, and its main action. */
export function TabHead({ line, children }: { line: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="min-w-0 flex-1 space-y-0.5 text-sm text-a-text-2">{line}</div>
      {children}
    </div>
  )
}

/**
 * The brand of a reward, an offer or a boost (release 4), only where there is more than one to choose: a new one picks
 * it (the server's default chosen to begin with), a saved one shows the brand it is on — a change keeps it. `refused`
 * is the server's field error (`brand`): a brand that is no longer offered.
 */
export function BrandField({ options, value, saved, refused, onChange }: {
  options: BrandOptions | undefined
  value: number | null
  /** The saved row's brand; undefined for a new one. */
  saved?: number | null
  refused?: boolean
  onChange: (id: number) => void
}) {
  const { t } = useTranslation()
  if (!options || !brandChoice(options)) return null
  const label = t('loyalty.rewards.brand.label', 'Brand')
  if (saved !== undefined) {
    const name = brandName(saved, options)
    return name === null ? null : (
      <p data-brand="" className="text-sm text-a-text-2">{t('loyalty.rewards.brand.saved', 'Brand: {{name}}. It stays on this brand.', { name })}</p>
    )
  }
  return (
    <FormField label={label} hint={t('loyalty.rewards.brand.hint', 'Which of your brands it belongs to.')}
      problem={refused ? t('loyalty.rewards.brand.refused', 'Choose one of the brands listed.') : null}>
      <select data-brand="" value={value ?? ''} onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text">
        {options.list.map(brand => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
      </select>
    </FormField>
  )
}
