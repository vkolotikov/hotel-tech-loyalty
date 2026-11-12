import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Pencil } from 'lucide-react'
import { CONTROL } from '../ui/inputs'

export interface InlineOption { value: string; label: string }

/**
 * One fact changed where it stands (round 5, as the full admin's InquiryDrawer edits a lead): the value reads as text;
 * a press turns it into its box — a list saves on choosing, a box on Enter or on leaving it — and Escape puts it back
 * without closing the panel around it. The caller saves (and says when the value is refused).
 */
export function InlineField({ label, value, display, kind = 'text', options = [], onSave, busy = false, placeholder }: {
  label: string
  /** The raw value the box starts from. */
  value: string
  /** How the value reads (a pill, a sum); the raw value when left out. */
  display?: ReactNode
  kind?: 'text' | 'number' | 'select' | 'textarea'
  options?: readonly InlineOption[]
  onSave: (raw: string) => void
  busy?: boolean
  placeholder?: string
}) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  /** Set by Escape and by a save, so the blur that follows does not save (again). */
  const settled = useRef(false)
  const open = () => { settled.current = false; setDraft(value); setEditing(true) }
  const commit = (raw: string) => {
    if (settled.current) return
    settled.current = true
    setEditing(false)
    if (raw.trim() !== value.trim()) onSave(raw)
  }
  const keys = (e: KeyboardEvent<HTMLElement>) => {
    // Escape puts the value back; the panel around the box keeps it (it checks defaultPrevented).
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); settled.current = true; setEditing(false) }
    if (e.key === 'Enter' && kind !== 'textarea') { e.preventDefault(); commit(draft) }
    if (e.key === 'Enter' && kind === 'textarea' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); commit(draft) }
  }
  const change = t('crm.leads.change_named', 'Change: {{label}}', { label })

  if (!editing) {
    return (
      <button type="button" disabled={busy} onClick={open} title={change}
        className={`group -mx-1.5 flex w-[calc(100%+0.75rem)] min-w-0 items-start gap-1.5 rounded-lg px-1.5 py-1 text-left text-sm text-a-text transition-colors hover:bg-a-surface-2 focus-visible:outline-2 focus-visible:outline-a-accent disabled:opacity-60 ${kind === 'textarea' ? '' : 'min-h-8'}`}>
        <span className="sr-only">{change}. </span>
        <span className={`min-w-0 flex-1 ${kind === 'textarea' ? 'whitespace-pre-wrap break-words' : 'truncate'}`}>{display ?? (value || <span className="text-a-text-2">—</span>)}</span>
        <Pencil size={12} aria-hidden className="mt-1 shrink-0 text-a-text-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
      </button>
    )
  }
  if (kind === 'select') {
    return (
      <select autoFocus aria-label={label} value={draft} onChange={e => commit(e.target.value)} onBlur={() => { settled.current = true; setEditing(false) }} onKeyDown={keys} className={`${CONTROL} py-1.5`}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    )
  }
  if (kind === 'textarea') {
    return (
      <textarea autoFocus aria-label={label} rows={4} value={draft} placeholder={placeholder} onChange={e => setDraft(e.target.value)} onBlur={() => commit(draft)} onKeyDown={keys} className={CONTROL} />
    )
  }
  return (
    <input autoFocus aria-label={label} value={draft} placeholder={placeholder} onChange={e => setDraft(e.target.value)} onBlur={() => commit(draft)} onKeyDown={keys}
      type={kind === 'number' ? 'number' : 'text'} inputMode={kind === 'number' ? 'decimal' : undefined} min={kind === 'number' ? 0 : undefined} step={kind === 'number' ? '0.01' : undefined}
      className={`${CONTROL} py-1.5`} />
  )
}
