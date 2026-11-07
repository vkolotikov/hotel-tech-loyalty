import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Lock, Plus, X } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { TextInput } from '../ui/inputs'
import { addText, removeAt } from './lists'

/** Said once above a form a staff member may read but not change. */
export function ReadOnlyNote() {
  const { t } = useTranslation()
  return (
    <Notice>
      <span className="flex items-center gap-2"><Lock size={14} aria-hidden className="shrink-0" />{t('crm.assistant.read_only', 'Only an owner or a manager can change the assistant. You can read everything here.')}</span>
    </Notice>
  )
}

/** A field's problem, under it. */
export function Problem({ children }: { children: ReactNode }) {
  return <p role="alert" className="mt-1 text-xs text-a-danger">{children}</p>
}

/** "120 / 500" under a long text, in the danger tone once it is over. */
export function CharCount({ value, max }: { value: string; max: number }) {
  const n = value.trim().length
  return <span className={`mt-1 block text-right text-xs ${n > max ? 'text-a-danger' : 'text-a-text-2'}`}>{n} / {max}</span>
}

/** One choice of a few, as buttons (aria-pressed), each with an optional line under its label. */
export function Choice<T extends string>({ label, options, value, onChange, disabled = false, columns = 'sm:grid-cols-2' }: {
  label: string
  options: { value: T; label: string; line?: string }[]
  value: T
  onChange: (next: T) => void
  disabled?: boolean
  columns?: string
}) {
  return (
    <div role="group" aria-label={label}>
      <span className="mb-1 block text-xs font-medium text-a-text-2">{label}</span>
      <div className={`grid gap-2 ${columns}`}>
        {options.map(option => {
          const on = option.value === value
          return (
            <button key={option.value} type="button" aria-pressed={on} disabled={disabled} onClick={() => onChange(option.value)}
              className={`rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-a-accent disabled:opacity-60 ${on ? 'border-a-accent bg-a-accent/10' : 'border-a-border bg-a-surface hover:border-a-accent/40'}`}>
              <span className="block text-sm font-medium text-a-text">{option.label}</span>
              {option.line && <span className="block text-xs text-a-text-2">{option.line}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** A list of short texts (keywords, quick replies) as removable chips, and a box to add one. */
export function ChipEditor({ label, items, onChange, max, placeholder, disabled = false, extra }: {
  label: string
  items: string[]
  onChange: (next: string[]) => void
  max: number
  placeholder: string
  disabled?: boolean
  extra?: ReactNode
}) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const add = () => { onChange(addText(items, text, max)); setText('') }
  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-a-text-2">{label}</span>
      {items.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5">
          {items.map((item, i) => (
            <li key={`${item}-${i}`} className="inline-flex max-w-full items-center gap-1 rounded-full bg-a-surface-2 py-0.5 pl-2.5 pr-1 text-xs text-a-text">
              <span className="truncate">{item}</span>
              {!disabled && (
                <button type="button" onClick={() => onChange(removeAt(items, i))} aria-label={t('crm.assistant.remove_item', 'Remove {{item}}', { item })}
                  className="rounded-full p-0.5 text-a-text-2 hover:text-a-danger"><X size={12} aria-hidden /></button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!disabled && (
        <div className="flex flex-wrap gap-2">
          <label className="min-w-0 flex-1">
            <span className="sr-only">{placeholder}</span>
            <TextInput value={text} maxLength={max} placeholder={placeholder} onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }} />
          </label>
          <Button type="button" variant="secondary" size="sm" onClick={add} disabled={!text.trim()}><Plus size={14} aria-hidden />{t('crm.common.add', 'Add')}</Button>
          {extra}
        </div>
      )}
    </div>
  )
}

/** A switch in a list row: its name is read out, not shown (the row says what it is for). */
export function InlineSwitch({ label, checked, onChange, disabled = false }: { label: string; checked: boolean; onChange: (on: boolean) => void; disabled?: boolean }) {
  return (
    <label className={`inline-flex items-center p-1 ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
      <input type="checkbox" role="switch" className="peer sr-only" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
      <span className="sr-only">{label}</span>
      <span aria-hidden className="relative h-5 w-9 shrink-0 rounded-full bg-a-border transition-colors peer-checked:bg-a-accent peer-focus-visible:ring-2 peer-focus-visible:ring-a-accent/40 after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-a-surface after:shadow-a-sm after:transition-transform peer-checked:after:translate-x-4" />
    </label>
  )
}

/** The foot of a long form: what is unsaved, Discard and Save. Sticks to the bottom of the screen while there is. */
export function SaveBar({ dirty, valid, busy, onSave, onDiscard }: { dirty: boolean; valid: boolean; busy: boolean; onSave: () => void; onDiscard: () => void }) {
  const { t } = useTranslation()
  if (!dirty) return null
  return (
    <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-2xl border border-a-border bg-a-surface px-4 py-3 shadow-a-lg">
      <span className="min-w-0 flex-1 text-sm text-a-text">{valid ? t('crm.assistant.unsaved', 'You have changes that are not saved yet.') : t('crm.assistant.fix_first', 'Some fields need another look before saving.')}</span>
      <Button type="button" variant="secondary" size="sm" onClick={onDiscard} disabled={busy}>{t('crm.assistant.discard', 'Discard')}</Button>
      <Button type="button" size="sm" onClick={onSave} disabled={!valid} loading={busy}>{t('crm.common.save', 'Save')}</Button>
    </div>
  )
}
