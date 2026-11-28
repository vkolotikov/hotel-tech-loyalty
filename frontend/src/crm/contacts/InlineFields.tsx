import { useState, type KeyboardEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Pencil, X, type LucideIcon } from 'lucide-react'
import { errorText } from '../lib/errors'
import { IconButton } from '../ui/IconButton'
import { Select, TextArea, TextInput } from '../ui/inputs'
import type { FieldKind } from './contactsLogic'

export interface InlineField {
  key: string
  label: string
  kind: FieldKind
  /** The value as the editor holds it ('' for none). */
  value: string
  /** How the value reads, when not as written (an amount, a day). */
  display?: ReactNode
  /** A select's choices. */
  options?: string[]
  /** How a choice reads (a company's status in the person's language); as written when left out. */
  optionLabel?: (value: string) => string
  /** Words to offer while typing (the values the organisation has). */
  suggestions?: string[]
  /** Whether emptying it clears it (else it always keeps a value). */
  clearable: boolean
  min?: number
  max?: number
  whole?: boolean
}

export interface InlineGroup { key: string; title: string; icon: LucideIcon; fields: InlineField[] }

export type InlineCheck = { kind: 'same' } | { kind: 'error'; text: string } | { kind: 'send'; body: Record<string, unknown> }

/**
 * A record's details, each changed where it stands (round 2's edit-in-place, compacted in round 5): a row is its label
 * and its value; pressing it opens its editor in the row — Enter or ✓ saves, Escape or × leaves it. What may be saved
 * is `check`'s word (contactsLogic's rules), the save itself the caller's.
 */
export function InlineFields({ idPrefix, groups, check, save }: {
  idPrefix: string
  groups: InlineGroup[]
  check: (key: string, draft: string) => InlineCheck
  save: (body: Record<string, unknown>) => Promise<unknown>
}) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const open = (field: InlineField) => { setEditing(field.key); setDraft(field.value); setProblem(null) }
  const close = () => { setEditing(null); setProblem(null) }
  const commit = async (key: string) => {
    const outcome = check(key, draft)
    if (outcome.kind === 'same') return close()
    if (outcome.kind === 'error') return setProblem(outcome.text)
    setBusy(true)
    try {
      await save(outcome.body)
      close()
    } catch (error) {
      setProblem(errorText(t, error))
    } finally {
      setBusy(false)
    }
  }

  const row = (field: InlineField) => {
    const changeLabel = t('crm.contacts.edit_field', 'Change {{field}}', { field: field.label })
    if (editing !== field.key) {
      const empty = field.value.trim() === ''
      return (
        <div key={field.key} className="flex min-h-10 items-start gap-3 py-1.5">
          <dt className="w-24 shrink-0 pt-1 text-xs text-a-text-2 sm:w-28">{field.label}</dt>
          <dd className="min-w-0 flex-1">
            <button type="button" onClick={() => open(field)} disabled={editing !== null && busy} title={changeLabel}
              className="group/val -mx-1.5 flex w-[calc(100%+0.75rem)] min-w-0 items-start gap-2 rounded-lg px-1.5 py-0.5 text-left hover:bg-a-surface-2 focus-visible:outline-2 focus-visible:outline-a-accent">
              <span className="sr-only">{changeLabel}: </span>
              <span className={`min-w-0 flex-1 whitespace-pre-wrap break-words text-sm ${empty ? 'text-a-text-2' : 'text-a-text'}`}>
                {empty ? <><span aria-hidden>—</span><span className="sr-only">{t('crm.contacts.not_set', 'Not set')}</span></> : (field.display ?? field.value)}
              </span>
              <Pencil size={13} aria-hidden className="mt-1 shrink-0 text-a-text-2 opacity-0 transition-opacity group-hover/val:opacity-100 group-focus-visible/val:opacity-100" />
            </button>
          </dd>
        </div>
      )
    }
    const onKey = (e: KeyboardEvent<HTMLElement>) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close() }
      if (e.key === 'Enter' && (field.kind !== 'textarea' || e.metaKey || e.ctrlKey)) { e.preventDefault(); void commit(field.key) }
    }
    const inputId = `${idPrefix}-${field.key}`
    const listId = field.suggestions?.length ? `${inputId}-list` : undefined
    const input = field.kind === 'textarea'
      ? <TextArea id={inputId} rows={3} value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={onKey} autoFocus />
      : field.kind === 'select'
        ? (
          <Select id={inputId} value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={onKey} autoFocus>
            {(field.clearable || field.value === '') && <option value="">{t('crm.contacts.not_set', 'Not set')}</option>}
            {(field.options ?? []).map(v => <option key={v} value={v}>{field.optionLabel ? field.optionLabel(v) : v}</option>)}
          </Select>
        )
        : (
          <TextInput id={inputId} value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={onKey} autoFocus autoComplete="off" list={listId}
            type={field.kind === 'number' ? 'number' : field.kind}
            inputMode={field.kind === 'number' ? (field.whole ? 'numeric' : 'decimal') : undefined}
            min={field.min} max={field.max} step={field.kind === 'number' ? (field.whole ? 1 : 'any') : undefined} />
        )
    return (
      <div key={field.key} className="-mx-1.5 my-1 rounded-xl bg-a-surface-2/70 p-2">
        <label htmlFor={inputId} className="mb-1 block text-xs font-medium text-a-text-2">{field.label}</label>
        <div className={`flex gap-1.5 ${field.kind === 'textarea' ? 'flex-col' : 'items-center'}`}>
          <div className="min-w-0 flex-1">{input}</div>
          {listId && <datalist id={listId}>{field.suggestions!.map(v => <option key={v} value={v} />)}</datalist>}
          <div className="flex shrink-0 items-center justify-end gap-1">
            <IconButton icon={X} size="sm" label={t('crm.common.cancel', 'Cancel')} onClick={close} disabled={busy} />
            <IconButton icon={Check} size="sm" tone="accent" label={t('crm.common.save', 'Save')} onClick={() => { void commit(field.key) }} disabled={busy} aria-busy={busy || undefined} />
          </div>
        </div>
        {problem && <p role="alert" className="mt-1 text-xs text-a-danger">{problem}</p>}
      </div>
    )
  }

  return (
    <div className="grid gap-x-8 gap-y-4 md:grid-cols-2">
      {groups.map(group => (
        <section key={group.key} aria-labelledby={`${idPrefix}-group-${group.key}`} className={group.fields.some(f => f.kind === 'textarea') && group.fields.length === 1 ? 'md:col-span-2' : ''}>
          <h3 id={`${idPrefix}-group-${group.key}`} className="mb-0.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-a-text-2">
            <group.icon size={13} aria-hidden />{group.title}
          </h3>
          <dl className="divide-y divide-a-border/60">{group.fields.map(row)}</dl>
        </section>
      ))}
    </div>
  )
}
