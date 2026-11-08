import { useTranslation } from 'react-i18next'
import { Field } from '../../workspace/ui/Field'
import { Select, TextArea, TextInput } from '../ui/inputs'
import { customText } from './leadLogic'
import type { CustomField } from './leadTypes'

/**
 * The organisation's own lead fields as inputs (Settings → Custom fields in the full admin): one input per type, the
 * required ones marked; the server checks the values (CustomFieldService::validate).
 */
export function CustomFieldInputs({ fields, values, onChange, invalid = [] }: {
  fields: readonly CustomField[]
  values: Record<string, unknown>
  onChange: (next: Record<string, unknown>) => void
  invalid?: readonly string[]
}) {
  const { t } = useTranslation()
  const set = (key: string, value: unknown) => onChange({ ...values, [key]: value })
  return (
    <div className="space-y-3">
      {fields.map(field => {
        const label = field.required ? t('crm.leads.field_required', '{{label}} (needed)', { label: field.label }) : field.label
        const value = values[field.key]
        const bad = invalid.includes(field.key) ? true : undefined
        const options = field.config?.options ?? []
        if (field.type === 'checkbox') {
          return (
            <label key={field.key} className="flex items-center gap-2 text-sm text-a-text">
              <input type="checkbox" checked={value === true} onChange={e => set(field.key, e.target.checked)} className="h-4 w-4 accent-a-accent" />
              {label}
            </label>
          )
        }
        if (field.type === 'multiselect') {
          const chosen = Array.isArray(value) ? value.map(String) : []
          return (
            <fieldset key={field.key} aria-invalid={bad}>
              <legend className="mb-1 block text-xs font-medium text-a-text-2">{label}</legend>
              <div className="flex flex-wrap gap-1.5">
                {options.map(option => {
                  const on = chosen.includes(option)
                  return (
                    <button key={option} type="button" aria-pressed={on}
                      onClick={() => set(field.key, on ? chosen.filter(o => o !== option) : [...chosen, option])}
                      className={`min-h-8 rounded-full border px-3 text-xs font-medium ${on ? 'border-transparent bg-a-accent text-a-accent-ink' : 'border-a-border bg-a-surface text-a-text-2 hover:text-a-text'}`}>
                      {option}
                    </button>
                  )
                })}
              </div>
              {field.help_text && <span className="mt-1 block text-xs text-a-text-2">{field.help_text}</span>}
            </fieldset>
          )
        }
        return (
          <Field key={field.key} label={label} hint={field.help_text ?? undefined}>
            {field.type === 'select' ? (
              <Select value={typeof value === 'string' ? value : ''} onChange={e => set(field.key, e.target.value)} aria-invalid={bad}>
                <option value="">{t('crm.leads.choose', 'Choose…')}</option>
                {options.map(option => <option key={option} value={option}>{option}</option>)}
              </Select>
            ) : field.type === 'textarea' ? (
              <TextArea rows={3} value={typeof value === 'string' ? value : ''} onChange={e => set(field.key, e.target.value)} aria-invalid={bad} />
            ) : (
              <TextInput value={value === null || value === undefined ? '' : String(value)} onChange={e => set(field.key, e.target.value)} aria-invalid={bad}
                type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : field.type === 'phone' ? 'tel' : 'text'}
                inputMode={field.type === 'number' ? 'decimal' : undefined} />
            )}
          </Field>
        )
      })}
    </div>
  )
}

/** The fields' values for reading; an empty one says so. */
export function CustomFieldsView({ fields, values }: { fields: readonly CustomField[]; values: Record<string, unknown> | null | undefined }) {
  const { t } = useTranslation()
  return (
    <dl className="space-y-2.5">
      {fields.map(field => {
        const text = customText(field, values?.[field.key], t('crm.common.yes', 'Yes'), t('crm.common.no', 'No'))
        return (
          <div key={field.key}>
            <dt className="text-xs text-a-text-2">{field.label}</dt>
            <dd className={`text-sm ${text ? 'text-a-text' : 'text-a-text-2'}`}>
              {text && field.type === 'url' && /^https?:\/\//i.test(text)
                ? <a href={text} target="_blank" rel="noreferrer noopener" className="break-all text-a-accent-text hover:underline">{text}</a>
                : (text || '—')}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}
