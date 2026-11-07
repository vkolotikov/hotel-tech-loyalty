import type { ReactNode } from 'react'
import { Field } from '../../workspace/ui/Field'
import { Pill } from '../ui/Pill'
import { importanceTone } from './contactsLogic'

/** A labelled control with its problem under it. */
export function FieldWithError({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <Field label={label} hint={hint}>{children}</Field>
      {error && <p role="alert" className="mt-1 text-xs text-a-danger">{error}</p>}
    </div>
  )
}

/** Where a contact stands: their lifecycle stage and, when it is above the usual, their importance. */
export function StandingPills({ lifecycle, importance, levels }: { lifecycle: string | null | undefined; importance: string | null | undefined; levels: string[] }) {
  const tone = importanceTone(importance, levels)
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      {lifecycle && <Pill>{lifecycle}</Pill>}
      {importance && tone !== 'neutral' && <Pill tone={tone}>{importance}</Pill>}
    </span>
  )
}

/** A small definition row: a label and its value, or a dash. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-a-text-2">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-a-text">{children ?? '—'}</dd>
    </div>
  )
}
