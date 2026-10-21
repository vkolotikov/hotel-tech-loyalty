import { useId, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { Skeleton } from '../../workspace/ui/Skeleton'
import { SectionTitle } from '../../workspace/ui/Typography'
import { failureOf } from '../lib/api'
import { refusalKey } from '../lib/errors'
import { pickerValue } from './appMath'
import { ERRORS } from './errors'

export const INPUT = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text'

/** What each tab shows while it loads and when it could not load. */
export function Loading() {
  const { t } = useTranslation()
  return (
    <div role="status" className="space-y-3">
      <span className="sr-only">{t('loyalty.common.loading', 'Loading…')}</span>
      <div className="grid gap-3 sm:grid-cols-2"><Skeleton className="h-28" /><Skeleton className="h-28" /></div>
      <Skeleton className="h-48" />
    </div>
  )
}

export function LoadFailed({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="max-w-xl space-y-3">
      <Notice tone="danger">{t(...refusalKey('loyalty.app', ERRORS, 'load', failureOf(error)))}</Notice>
      <Button variant="secondary" onClick={onRetry}>{t('loyalty.common.retry', 'Try again')}</Button>
    </div>
  )
}

/** A titled part of a tab, as a card. */
export function Part({ title, line, children }: { title: string; line?: string; children: ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="space-y-4 rounded-2xl border border-a-border bg-a-surface p-4 sm:p-5">
      <div className="space-y-1">
        <div id={id}><SectionTitle>{title}</SectionTitle></div>
        {line && <p className="text-sm text-a-text-2">{line}</p>}
      </div>
      {children}
    </section>
  )
}

/**
 * A colour: the browser's colour input, which is its swatch, and the same colour as text (`#rrggbb`) beside it for
 * typing or pasting. While the text is not a colour yet the swatch shows black and the field says what is wrong.
 */
export function ColourField({ label, value, problem, hint, onChange }: {
  label: string
  value: string
  problem?: string | null
  hint?: string
  onChange: (text: string) => void
}) {
  const id = useId()
  const described = [hint ? `${id}-hint` : '', problem ? `${id}-problem` : ''].filter(Boolean).join(' ') || undefined
  return (
    <div data-colour="">
      <label htmlFor={`${id}-text`} className="mb-1 block text-xs font-medium text-a-text-2">{label}</label>
      <div className="flex items-center gap-2">
        <input type="color" value={pickerValue(value)} onChange={(e) => onChange(e.target.value)} aria-label={label}
          className="h-9 w-11 shrink-0 cursor-pointer rounded-lg border border-a-border bg-a-surface p-0.5" />
        <input id={`${id}-text`} type="text" value={value} maxLength={7} spellCheck={false} autoComplete="off" onChange={(e) => onChange(e.target.value)}
          aria-invalid={problem ? true : undefined} aria-describedby={described} className={`${INPUT} font-a-mono`} />
      </div>
      {hint && <p id={`${id}-hint`} className="mt-1 text-xs text-a-text-2">{hint}</p>}
      {problem && <p id={`${id}-problem`} className="mt-1 text-xs font-medium text-a-danger">{problem}</p>}
    </div>
  )
}
