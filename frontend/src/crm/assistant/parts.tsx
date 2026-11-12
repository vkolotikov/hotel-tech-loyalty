import { useId, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, Lock, Plus, X, type LucideIcon } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { InfoTip } from '../ui/InfoTip'
import { TextInput } from '../ui/inputs'
import { addText, removeAt } from './lists'

/** Said once above a form a staff member may read but not change. */
export function ReadOnlyNote({ children }: { children?: ReactNode }) {
  const { t } = useTranslation()
  return (
    <Notice>
      <span className="flex items-center gap-2"><Lock size={14} aria-hidden className="shrink-0" />{children ?? t('crm.assistant.read_only_short', 'Read only: a manager makes changes here.')}</span>
    </Notice>
  )
}

/**
 * A section's own slim row (round 5, "minimize copy"): its main action or state at the end, and what the section is
 * for as an (i) beside it rather than a sentence.
 */
export function SectionIntro({ line, action }: { line: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
      <InfoTip text={line} align="right" />
    </div>
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

/** A button that asks the AI for something, in the AI's violet: `fill` for the main one of a form, else the soft tint. */
export function AiButton({ fill = false, size = 'md', className = '', children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { fill?: boolean; size?: 'sm' | 'md'; children: ReactNode }) {
  return (
    <button type="button" {...rest}
      className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-full font-semibold transition-opacity disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-a-accent ${size === 'sm' ? 'px-3 py-1.5 text-sm' : 'px-4 py-2.5 text-sm'} ${fill ? 'crm-ai-fill' : 'crm-ai-soft'} ${className}`}>
      {children}
    </button>
  )
}

/** A small round button with only an icon; its name is read out. */
export function IconButton({ label, icon: Icon, onClick, danger = false, disabled = false }: { label: string; icon: LucideIcon; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label}
      className={`grid h-9 w-9 place-items-center rounded-full text-a-text-2 hover:bg-a-surface-2 disabled:opacity-40 disabled:hover:bg-transparent focus-visible:outline-2 focus-visible:outline-a-accent ${danger ? 'hover:text-a-danger' : 'hover:text-a-text'}`}>
      <Icon size={15} aria-hidden />
    </button>
  )
}

/**
 * Settings one rarely needs, folded away in their card ("More options"): a button that says so and opens them. Starts
 * open when `open` is set (something in it is already filled in).
 */
export function Disclosure({ label, line, open: startOpen = false, children }: { label: string; line?: string; open?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(startOpen)
  const id = useId()
  return (
    <div>
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-2 rounded-xl px-1 py-1.5 text-left focus-visible:outline-2 focus-visible:outline-a-accent">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-a-accent-text">{label}</span>
          {line && <span className="block text-xs text-a-text-2">{line}</span>}
        </span>
        <ChevronDown size={16} aria-hidden className={`shrink-0 text-a-text-2 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <div id={id} hidden={!open} className="pt-3">{children}</div>
    </div>
  )
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
              className={`min-h-11 rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-a-accent disabled:opacity-60 ${on ? 'border-a-accent bg-a-accent/10' : 'border-a-border bg-a-surface hover:border-a-text-2/40'}`}>
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
            <li key={`${item}-${i}`} className="inline-flex max-w-full items-center gap-1 rounded-full border border-a-border bg-a-surface-2 py-0.5 pl-2.5 pr-1 text-xs text-a-text">
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
          <label className="min-w-0 flex-1 basis-40">
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
    <label className={`inline-flex min-h-9 items-center p-1 ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
      <input type="checkbox" role="switch" className="peer sr-only" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
      <span className="sr-only">{label}</span>
      <span aria-hidden className="relative h-5 w-9 shrink-0 rounded-full bg-a-border transition-colors peer-checked:bg-a-accent peer-focus-visible:ring-2 peer-focus-visible:ring-a-accent/40 after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-a-surface after:shadow-a-sm after:transition-transform peer-checked:after:translate-x-4" />
    </label>
  )
}

/**
 * The one save bar of a long form (round 2): it shows only while something changed — "Unsaved changes · Discard ·
 * Save" — and sticks to the foot of the screen, so the form's cards need no buttons of their own.
 */
export function SaveBar({ dirty, valid, busy, onSave, onDiscard }: { dirty: boolean; valid: boolean; busy: boolean; onSave: () => void; onDiscard: () => void }) {
  const { t } = useTranslation()
  if (!dirty) return null
  return (
    <div role="region" aria-label={t('crm.assistant.unsaved', 'Unsaved changes')} className="sticky bottom-3 z-20 animate-a-pop">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-a-accent/40 bg-a-surface px-4 py-3 shadow-a-lg">
        <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${valid ? 'bg-a-st-pending' : 'bg-a-danger'}`} />
        <span className="min-w-0 flex-1 text-sm font-medium text-a-text">{valid ? t('crm.assistant.unsaved', 'Unsaved changes') : t('crm.assistant.fix_first', 'Fix the marked fields to save.')}</span>
        <Button type="button" variant="secondary" size="sm" onClick={onDiscard} disabled={busy}>{t('crm.assistant.discard', 'Discard')}</Button>
        <Button type="button" size="sm" onClick={onSave} disabled={!valid} loading={busy}>{t('crm.common.save', 'Save')}</Button>
      </div>
    </div>
  )
}
