import type { ReactNode } from 'react'
import { Field } from '../../workspace/ui/Field'
import { Pill } from '../ui/Pill'
import { useTranslation } from 'react-i18next'
import { COMPANY_TONE, companyStatusKey, importanceTone } from './contactsLogic'

/** The icon links' look beside a record's main action (an `<a>` that opens another app keeps IconButton's shape). */
export const ICON_LINK = 'inline-grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-a-border text-a-text-2 transition-colors hover:bg-a-surface-2 hover:text-a-text focus-visible:outline-2 focus-visible:outline-a-accent'

/** A page's or a record's one main action drawn as a link (a new lead for this contact). */
export const PRIMARY_LINK = 'inline-flex min-h-9 items-center gap-1.5 rounded-full bg-a-accent px-3.5 text-sm font-semibold text-a-accent-ink shadow-a-sm hover:bg-a-accent-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-a-accent'

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

const STATUS_FALLBACK: Record<string, string> = { Active: 'Active', Pending: 'Pending', Expired: 'Expired', Suspended: 'Suspended' }

/** A company's state in its tone, in the person's language when we know the word. */
export function CompanyStatus({ status }: { status: string | null | undefined }) {
  const { t } = useTranslation()
  if (!status) return null
  const key = companyStatusKey(status)
  return <Pill tone={COMPANY_TONE[status] ?? 'neutral'}>{key ? t(`crm.contacts.${key}`, STATUS_FALLBACK[status] ?? status) : status}</Pill>
}
