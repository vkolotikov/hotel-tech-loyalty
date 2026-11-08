import { useId, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, Lock } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { TextInput } from '../ui/inputs'

/** Said once above the settings a staff member may read but not change. */
export function ReadOnlyNote() {
  const { t } = useTranslation()
  return (
    <Notice>
      <span className="flex items-center gap-2"><Lock size={14} aria-hidden className="shrink-0" />{t('crm.widget.read_only', 'Only an owner or a manager can change the chat widget. You can read everything here.')}</span>
    </Notice>
  )
}

export function Problem({ children }: { children: ReactNode }) {
  return <p role="alert" className="mt-1 text-xs text-a-danger">{children}</p>
}

/** One choice of a few, as buttons (aria-pressed). */
export function Choice<T extends string>({ label, options, value, onChange, disabled = false, columns = 'grid-cols-2 sm:grid-cols-3' }: {
  label: string
  options: { value: T; label: string; line?: string; icon?: ReactNode }[]
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
              className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-a-accent disabled:opacity-60 ${on ? 'border-a-accent bg-a-accent/10 text-a-text' : 'border-a-border bg-a-surface text-a-text-2 hover:border-a-text-2/40'}`}>
              {option.icon}
              <span className="min-w-0">
                <span className="block font-medium">{option.label}</span>
                {option.line && <span className="block text-xs text-a-text-2">{option.line}</span>}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * A colour of the widget: a picker and its hex code. Empty means the widget's own default (`fallback`, shown in the
 * picker). The swatch is the visitor's colour, so it is drawn inline.
 */
export function ColourField({ label, value, fallback, onChange, disabled = false, problem }: {
  label: string
  value: string
  fallback: string
  onChange: (next: string) => void
  disabled?: boolean
  problem?: string
}) {
  const shown = /^#[0-9a-f]{6}$/i.test(value) ? value : fallback
  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-a-text-2">{label}</span>
      <div className="flex items-center gap-2">
        <label className="shrink-0">
          <span className="sr-only">{label}</span>
          <input type="color" value={shown} disabled={disabled} onChange={e => onChange(e.target.value)}
            className="h-9 w-11 cursor-pointer rounded-lg border border-a-border bg-a-surface p-0.5 disabled:cursor-default" />
        </label>
        <label className="min-w-0 flex-1">
          <span className="sr-only">{label}</span>
          <TextInput value={value} maxLength={7} placeholder={fallback} disabled={disabled} onChange={e => onChange(e.target.value)} className="font-a-mono" />
        </label>
      </div>
      {problem && <Problem>{problem}</Problem>}
    </div>
  )
}

/**
 * Settings one rarely needs, folded away in their card ("More options"): a button that says so and opens them. Starts
 * open when `open` is set.
 */
export function Disclosure({ label, line, open: startOpen = false, children }: { label: string; line?: string; open?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(startOpen)
  const id = useId()
  return (
    <div className="rounded-xl border border-a-border">
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(o => !o)}
        className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 py-2 text-left hover:bg-a-surface-2/60 focus-visible:outline-2 focus-visible:outline-a-accent">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-a-text">{label}</span>
          {line && <span className="block text-xs text-a-text-2">{line}</span>}
        </span>
        <ChevronDown size={16} aria-hidden className={`shrink-0 text-a-text-2 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <div id={id} hidden={!open} className="border-t border-a-border p-3">{children}</div>
    </div>
  )
}

/**
 * The one save bar of the widget's settings (round 2): it shows only while something changed — "Unsaved changes ·
 * Discard · Save" — and sticks to the foot of the screen.
 */
export function SaveBar({ dirty, valid, busy, onSave, onDiscard }: { dirty: boolean; valid: boolean; busy: boolean; onSave: () => void; onDiscard: () => void }) {
  const { t } = useTranslation()
  if (!dirty) return null
  return (
    <div role="region" aria-label={t('crm.widget.unsaved', 'Unsaved changes')} className="sticky bottom-3 z-20 animate-a-pop">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-a-accent/40 bg-a-surface px-4 py-3 shadow-a-lg">
        <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${valid ? 'bg-a-st-pending' : 'bg-a-danger'}`} />
        <span className="min-w-0 flex-1 text-sm text-a-text">
          <span className="font-medium">{valid ? t('crm.widget.unsaved', 'Unsaved changes') : t('crm.widget.fix_first', 'Fix the marked fields to save.')}</span>
          {valid && <span className="hidden text-a-text-2 sm:inline"> · {t('crm.widget.unsaved_line', 'your website shows them after saving')}</span>}
        </span>
        <Button type="button" variant="secondary" size="sm" onClick={onDiscard} disabled={busy}>{t('crm.widget.discard', 'Discard')}</Button>
        <Button type="button" size="sm" onClick={onSave} disabled={!valid} loading={busy}>{t('crm.common.save', 'Save')}</Button>
      </div>
    </div>
  )
}
