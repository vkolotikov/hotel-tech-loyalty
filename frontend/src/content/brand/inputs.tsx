import { useState, type KeyboardEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { addTags, removeTag } from './brandForms'

export const INPUT = 'w-full rounded-lg border bg-a-surface px-3 py-2 text-sm text-a-text'
const edge = (invalid: boolean) => (invalid ? 'border-a-danger' : 'border-a-border')

function Label({ text, children, hint }: { text: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-a-text-2">{text}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-a-text-2">{hint}</span>}
    </label>
  )
}

/** A text input, or a textarea with `rows`. */
export function TextField({ label, value, onChange, rows, maxLength = 5000, invalid = false, hint, required = false }: {
  label: string; value: string; onChange: (value: string) => void; rows?: number; maxLength?: number; invalid?: boolean; hint?: string; required?: boolean
}) {
  return (
    <Label text={label} hint={hint}>
      {rows
        ? <textarea value={value} rows={rows} maxLength={maxLength} aria-invalid={invalid || undefined} onChange={(e) => onChange(e.target.value)} className={`${INPUT} ${edge(invalid)}`} />
        : <input value={value} maxLength={maxLength} required={required} aria-invalid={invalid || undefined} onChange={(e) => onChange(e.target.value)} className={`${INPUT} ${edge(invalid)}`} />}
    </Label>
  )
}

/**
 * A select over `options` ([value, name]); a stored value the list lacks stays offered as itself. `required`: a chosen
 * value cannot be emptied (the server refuses null there), so the empty choice shows only while nothing is chosen.
 */
export function SelectField({ label, value, options, onChange, empty, invalid = false, required = false }: {
  label: string; value: string; options: [string, string][]; onChange: (value: string) => void; empty: string; invalid?: boolean; required?: boolean
}) {
  const known = value === '' || options.some(([v]) => v === value)
  return (
    <Label text={label}>
      <select value={value} aria-invalid={invalid || undefined} onChange={(e) => onChange(e.target.value)} className={`${INPUT} ${edge(invalid)}`}>
        {(!required || value === '') && <option value="">{empty}</option>}
        {!known && <option value={value}>{value}</option>}
        {options.map(([v, name]) => <option key={v} value={v}>{name}</option>)}
      </select>
    </Label>
  )
}

/** A list of short texts: Enter or a comma adds what was typed (or pasted), each tag removes with its ×, Backspace in the empty box removes the last. */
export function TagInput({ label, values, onChange, invalid = false }: { label: string; values: string[]; onChange: (values: string[]) => void; invalid?: boolean }) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const commit = () => {
    if (text.trim() === '') return
    onChange(addTags(values, text))
    setText('')
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      commit()
    } else if (e.key === 'Backspace' && text === '' && values.length > 0) {
      onChange(values.slice(0, -1))
    }
  }
  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-a-text-2">{label}</span>
      <div className={`flex flex-wrap items-center gap-1.5 rounded-lg border bg-a-surface px-2 py-1.5 ${edge(invalid)}`}>
        {values.map((value, i) => (
          <span key={`${i}:${value}`} className="inline-flex items-center gap-1 rounded-full bg-a-surface-2 px-2 py-0.5 text-xs text-a-text">
            {value}
            <button type="button" onClick={() => onChange(removeTag(values, i))} aria-label={t('content.brand.tag_remove', 'Remove {{item}}', { item: value })}
              className="rounded-full text-a-text-2 hover:text-a-text"><X size={12} aria-hidden /></button>
          </span>
        ))}
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} onBlur={commit} aria-label={label}
          placeholder={values.length === 0 ? t('content.brand.tag_add', 'Type and press Enter') : ''}
          className="min-w-[8rem] flex-1 bg-transparent px-1 py-0.5 text-sm text-a-text outline-none" />
      </div>
    </div>
  )
}

/**
 * Toggle chips over `options`: one or many may be on; a stored value the list lacks shows as its own chip, on, so it
 * stays until removed. `required` (single choice): the chosen chip cannot be pressed off.
 */
export function ChoiceChips({ label, options, values, onChange, multiple = true, required = false }: {
  label: string; options: [string, string][]; values: string[]; onChange: (values: string[]) => void; multiple?: boolean; required?: boolean
}) {
  const extras = values.filter(v => !options.some(([o]) => o === v)).map(v => [v, v] as [string, string])
  const toggle = (value: string) => {
    const on = values.includes(value)
    if (on && required && !multiple) return
    onChange(on ? values.filter(v => v !== value) : multiple ? [...values, value] : [value])
  }
  return (
    <div role="group" aria-label={label}>
      <span className="mb-1 block text-xs font-medium text-a-text-2">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {[...options, ...extras].map(([value, name]) => (
          <button key={value} type="button" aria-pressed={values.includes(value)} onClick={() => toggle(value)}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium ${values.includes(value) ? 'border-a-accent-text bg-a-accent/10 text-a-text' : 'border-a-border text-a-text-2 hover:text-a-text'}`}>
            {name}
          </button>
        ))}
      </div>
    </div>
  )
}

/** One choice from a few; pressing the chosen one again clears it, unless `required` (the server refuses null there). */
export function Segmented({ label, options, value, onChange, required = false }: {
  label: string; options: [string, string][]; value: string; onChange: (value: string) => void; required?: boolean
}) {
  return <ChoiceChips label={label} options={options} values={value === '' ? [] : [value]} multiple={false} required={required} onChange={(values) => onChange(values[0] ?? '')} />
}

/** One field in a section's read view; "Not set yet" when empty. `className` places it in the grid (a dl allows one div per row). */
export function ReadRow({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  const { t } = useTranslation()
  return (
    <div className={`space-y-0.5 ${className}`}>
      <dt className="text-xs font-medium text-a-text-2">{label}</dt>
      <dd className={`whitespace-pre-wrap text-sm ${value.trim() === '' ? 'text-a-text-2' : 'text-a-text'}`}>{value.trim() === '' ? t('content.brand.empty', 'Not set yet') : value}</dd>
    </div>
  )
}

/** A list in a section's read view, as chips. */
export function ReadTags({ label, values }: { label: string; values: string[] }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-1">
      <dt className="text-xs font-medium text-a-text-2">{label}</dt>
      <dd className="flex flex-wrap gap-1.5">
        {values.length === 0
          ? <span className="text-sm text-a-text-2">{t('content.brand.empty', 'Not set yet')}</span>
          : values.map((v, i) => <span key={`${i}:${v}`} className="rounded-full bg-a-surface-2 px-2 py-0.5 text-xs text-a-text">{v}</span>)}
      </dd>
    </div>
  )
}
