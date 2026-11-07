import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Lock, type LucideIcon } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'

/** Said once above settings a staff member may read but not change. */
export function ReadOnlyNote({ children }: { children?: ReactNode }) {
  const { t } = useTranslation()
  return (
    <Notice>
      <span className="flex items-center gap-2"><Lock size={14} aria-hidden className="shrink-0" />{children ?? t('crm.settings.read_only', 'Only an owner or a manager can change this. You can read everything here.')}</span>
    </Notice>
  )
}

export function Problem({ children }: { children: ReactNode }) {
  return <p role="alert" className="mt-1 text-xs text-a-danger">{children}</p>
}

/** A section's own heading row: what it holds in one line, and its main action at the end. */
export function SectionIntro({ line, action }: { line: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <p className="min-w-0 flex-1 text-sm text-a-text-2">{line}</p>
      {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
    </div>
  )
}

/** A small round button with only an icon; its name is read out. 36 px, and the row around it makes the 44 px target. */
export function IconButton({ label, icon: Icon, onClick, danger = false, disabled = false }: { label: string; icon: LucideIcon; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label}
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-a-text-2 hover:bg-a-surface-2 disabled:opacity-40 disabled:hover:bg-transparent focus-visible:outline-2 focus-visible:outline-a-accent ${danger ? 'hover:text-a-danger' : 'hover:text-a-text'}`}>
      <Icon size={15} aria-hidden />
    </button>
  )
}

/** A colour dot for a stage (the venue's own colour, so drawn inline). */
export function Dot({ colour }: { colour: string | null }) {
  return <span aria-hidden className="inline-block h-3 w-3 shrink-0 rounded-full border border-a-border" style={{ background: colour ?? undefined }} />
}

/** A list's header row on a wide screen (hidden on a phone, where each row is a stacked card): its columns' names. */
export function ListHead({ columns, cols }: { columns: { label: string; align?: 'right'; srOnly?: boolean }[]; cols: string }) {
  return (
    <div role="row" className={`hidden border-b border-a-border px-4 py-2 text-xs font-medium text-a-text-2 md:grid md:gap-4 ${cols}`}>
      {columns.map((c, i) => (
        <span key={i} role="columnheader" className={`${c.align === 'right' ? 'text-right' : ''} ${c.srOnly ? 'sr-only' : ''}`}>{c.label}</span>
      ))}
    </div>
  )
}

/**
 * The one save bar of a list edited as one form (round 2): it shows only while something changed — "Unsaved changes ·
 * Discard · Save" — and sticks to the foot of the screen.
 */
export function SaveBar({ dirty, valid, busy, onSave, onDiscard }: { dirty: boolean; valid: boolean; busy: boolean; onSave: () => void; onDiscard: () => void }) {
  const { t } = useTranslation()
  if (!dirty) return null
  return (
    <div role="region" aria-label={t('crm.settings.unsaved', 'Unsaved changes')} className="sticky bottom-3 z-20 animate-a-pop">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-a-accent/40 bg-a-surface px-4 py-3 shadow-a-lg">
        <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${valid ? 'bg-a-st-pending' : 'bg-a-danger'}`} />
        <span className="min-w-0 flex-1 text-sm font-medium text-a-text">{valid ? t('crm.settings.unsaved', 'Unsaved changes') : t('crm.settings.fix_first', 'Fix the marked fields to save.')}</span>
        <Button type="button" variant="secondary" size="sm" onClick={onDiscard} disabled={busy}>{t('crm.settings.discard', 'Discard')}</Button>
        <Button type="button" size="sm" onClick={onSave} disabled={!valid} loading={busy}>{t('crm.common.save', 'Save')}</Button>
      </div>
    </div>
  )
}
