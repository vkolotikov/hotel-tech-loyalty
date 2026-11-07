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

/** A small round button with only an icon; its name is read out. */
export function IconButton({ label, icon: Icon, onClick, danger = false, disabled = false }: { label: string; icon: LucideIcon; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label}
      className={`rounded-full p-2 text-a-text-2 hover:bg-a-surface-2 disabled:opacity-40 disabled:hover:bg-transparent focus-visible:outline-2 focus-visible:outline-a-accent ${danger ? 'hover:text-a-danger' : 'hover:text-a-text'}`}>
      <Icon size={15} aria-hidden />
    </button>
  )
}

/** A colour dot for a stage (the venue's own colour, so drawn inline). */
export function Dot({ colour }: { colour: string | null }) {
  return <span aria-hidden className="inline-block h-3 w-3 shrink-0 rounded-full border border-a-border" style={{ background: colour ?? undefined }} />
}

/** The foot of a list edited as one form: what is unsaved, Discard and Save. */
export function SaveBar({ dirty, valid, busy, onSave, onDiscard }: { dirty: boolean; valid: boolean; busy: boolean; onSave: () => void; onDiscard: () => void }) {
  const { t } = useTranslation()
  if (!dirty) return null
  return (
    <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-2xl border border-a-border bg-a-surface px-4 py-3 shadow-a-lg">
      <span className="min-w-0 flex-1 text-sm text-a-text">{valid ? t('crm.settings.unsaved', 'You have changes that are not saved yet.') : t('crm.settings.fix_first', 'Some fields need another look before saving.')}</span>
      <Button type="button" variant="secondary" size="sm" onClick={onDiscard} disabled={busy}>{t('crm.settings.discard', 'Discard')}</Button>
      <Button type="button" size="sm" onClick={onSave} disabled={!valid} loading={busy}>{t('crm.common.save', 'Save')}</Button>
    </div>
  )
}
