import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Check, ListPlus, Pencil, SlidersHorizontal, X } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Field } from '../../workspace/ui/Field'
import { Notice } from '../../workspace/ui/Notice'
import { failureOf } from '../lib/api'
import { dayLabel } from '../lib/format'
import { errorText } from '../lib/errors'
import { EmptyState } from '../ui/EmptyState'
import { Select, TextArea, TextInput } from '../ui/inputs'
import {
  customDraft, customErrorKeys, customPayload, customText, missingRequired, sameDraft,
  type CustomFieldDef, type CustomValues,
} from './recordLogic'

/** The inputs of the organisation's own fields: one per type, the required ones marked, the ones the server refused outlined. */
export function CustomFieldInputs({ idPrefix, fields, values, onChange, invalid = [] }: {
  idPrefix: string
  fields: readonly CustomFieldDef[]
  values: CustomValues
  onChange: (next: CustomValues) => void
  invalid?: readonly string[]
}) {
  const { t } = useTranslation()
  const set = (key: string, value: unknown) => onChange({ ...values, [key]: value })
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {fields.map(field => {
        const label = field.required ? t('crm.contacts.custom.required', '{{label}} (needed)', { label: field.label }) : field.label
        const value = values[field.key]
        const bad = invalid.includes(field.key) ? true : undefined
        const wide = field.type === 'textarea' || field.type === 'multiselect' ? 'sm:col-span-2' : ''
        const options = field.config?.options ?? []
        if (field.type === 'checkbox') {
          return (
            <label key={field.key} className={`flex min-h-10 items-center gap-2 self-end text-sm text-a-text ${wide}`}>
              <input type="checkbox" checked={value === true} onChange={e => set(field.key, e.target.checked)} className="h-4 w-4 accent-a-accent" aria-invalid={bad} />
              {label}
            </label>
          )
        }
        if (field.type === 'multiselect') {
          const chosen = Array.isArray(value) ? value.map(String) : []
          return (
            <fieldset key={field.key} aria-invalid={bad} className={wide}>
              <legend className="mb-1 block text-xs font-medium text-a-text-2">{label}</legend>
              <div className="flex flex-wrap gap-1.5">
                {options.map(option => {
                  const on = chosen.includes(option)
                  return (
                    <button key={option} type="button" aria-pressed={on}
                      onClick={() => set(field.key, on ? chosen.filter(o => o !== option) : [...chosen, option])}
                      className={`min-h-8 rounded-full border px-3 text-xs font-medium focus-visible:outline-2 focus-visible:outline-a-accent ${on ? 'border-transparent bg-a-accent text-a-accent-ink' : 'border-a-border bg-a-surface text-a-text-2 hover:text-a-text'}`}>
                      {option}
                    </button>
                  )
                })}
              </div>
            </fieldset>
          )
        }
        const text = typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value)
        return (
          <div key={field.key} className={wide}>
            <Field label={label} hint={field.help_text ?? undefined}>
              {field.type === 'select' ? (
                <Select id={`${idPrefix}-${field.key}`} value={text} onChange={e => set(field.key, e.target.value)} aria-invalid={bad}>
                  <option value="">{t('crm.contacts.bulk_pick', 'Choose…')}</option>
                  {options.map(option => <option key={option} value={option}>{option}</option>)}
                </Select>
              ) : field.type === 'textarea' ? (
                <TextArea id={`${idPrefix}-${field.key}`} rows={3} value={text} onChange={e => set(field.key, e.target.value)} aria-invalid={bad} />
              ) : (
                <TextInput id={`${idPrefix}-${field.key}`} value={text} onChange={e => set(field.key, e.target.value)} aria-invalid={bad} autoComplete="off"
                  type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : field.type === 'phone' ? 'tel' : 'text'}
                  inputMode={field.type === 'number' ? 'decimal' : undefined} step={field.type === 'number' ? 'any' : undefined} />
              )}
            </Field>
          </div>
        )
      })}
    </div>
  )
}

/**
 * The organisation's own fields of a contact or a company (Settings → Fields; the full admin's CustomFieldsForm and
 * CustomFieldsDisplay): read at a glance, changed all together with Edit, saved as `custom_data`. The server checks
 * each value (CustomFieldService::validate) and names the ones it refuses.
 */
export function CustomFieldsCard({ idPrefix, fields, values, save, canSetUp }: {
  idPrefix: string
  fields: readonly CustomFieldDef[]
  values: CustomValues | null | undefined
  save: (customData: CustomValues) => Promise<unknown>
  /** A manager makes the fields (custom-fields: a manager's change), so only a manager is pointed to Settings. */
  canSetUp: boolean
}) {
  const { t, i18n } = useTranslation()
  const [draft, setDraft] = useState<CustomValues | null>(null)
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<{ text: string; keys: string[] } | null>(null)

  if (fields.length === 0) {
    return (
      <EmptyState icon={SlidersHorizontal} title={t('crm.contacts.custom.none', 'No fields of your own yet')}
        action={canSetUp && <Link to="/crm/settings?tab=fields" className="inline-flex min-h-10 items-center gap-2 rounded-full border border-a-border bg-a-surface px-4 text-sm font-semibold text-a-text hover:bg-a-surface-2 focus-visible:outline-2 focus-visible:outline-a-accent">
          <ListPlus size={15} aria-hidden />{t('crm.contacts.custom.set_up', 'Set up fields')}
        </Link>} />
    )
  }

  const start = customDraft(fields, values)
  if (!draft) {
    return (
      <div className="space-y-3">
        <div className="flex justify-end">
          <Button variant="secondary" size="sm" onClick={() => { setDraft(start); setTried(false); setFailure(null) }}><Pencil size={14} aria-hidden />{t('crm.common.edit', 'Edit')}</Button>
        </div>
        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {fields.map(field => {
            const raw = values?.[field.key]
            const text = customText(field, raw, t('crm.common.yes', 'Yes'), t('crm.common.no', 'No'))
            const shown = field.type === 'date' && text ? dayLabel(text, i18n.language) || text : text
            return (
              <div key={field.key} className="min-w-0">
                <dt className="text-xs text-a-text-2">{field.label}</dt>
                <dd className={`mt-0.5 whitespace-pre-wrap break-words text-sm ${text ? 'text-a-text' : 'text-a-text-2'}`}>
                  {text && field.type === 'url' && /^https?:\/\//i.test(text)
                    ? <a href={text} target="_blank" rel="noreferrer noopener" className="break-all text-a-accent-text hover:underline">{text}</a>
                    : (shown || '—')}
                </dd>
              </div>
            )
          })}
        </dl>
      </div>
    )
  }

  const missing = missingRequired(fields, draft)
  const shownMissing = tried ? missing : []
  const submit = async () => {
    setTried(true)
    setFailure(null)
    if (missing.length > 0) return
    setBusy(true)
    try {
      await save(customPayload(fields, draft))
      setDraft(null)
    } catch (error) {
      setFailure({ text: errorText(t, error), keys: customErrorKeys(failureOf(error).fields) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="space-y-3" onSubmit={e => { e.preventDefault(); void submit() }}>
      {shownMissing.length > 0 && <Notice tone="warning">{t('crm.contacts.custom.missing', 'Fill in the fields marked as needed.')}</Notice>}
      {failure && <Notice tone="danger">{failure.text}</Notice>}
      <CustomFieldInputs idPrefix={idPrefix} fields={fields} values={draft} onChange={setDraft} invalid={[...shownMissing, ...(failure?.keys ?? [])]} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => setDraft(null)} disabled={busy}><X size={14} aria-hidden />{t('crm.common.cancel', 'Cancel')}</Button>
        <Button type="submit" size="sm" loading={busy} disabled={sameDraft(draft, start)}><Check size={14} aria-hidden />{t('crm.common.save', 'Save')}</Button>
      </div>
    </form>
  )
}
