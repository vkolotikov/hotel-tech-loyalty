import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react'
import { Button } from '../../workspace/ui/Button'
import { Dialog } from '../../workspace/ui/Dialog'
import { Notice } from '../../workspace/ui/Notice'
import type { Tone } from '../lib/forms'

/**
 * The small pieces Program's and Rewards' forms share (spec 2026-10-21 §4.5, §4.6, §7): a field that says in the
 * workspace's words what is wrong with it, a checkbox, a pressed/not-pressed chip, a state badge and the confirm step
 * before something that cannot be taken back. A dialog's first field takes the focus through lib/useFirstFocus.ts in the
 * component that opens the shared Dialog (`autoFocus` loses to the Dialog's own focus).
 */

/**
 * A labelled control and what is wrong with it. The label wraps the control; the hint and the problem are tied to it
 * by `aria-describedby`, and the control says it is invalid while there is a problem.
 */
export function FormField({ label, hint, problem, children }: { label: string; hint?: string; problem?: string | null; children: ReactElement }) {
  const id = useId()
  const described = [hint ? `${id}-hint` : '', problem ? `${id}-problem` : ''].filter(Boolean).join(' ')
  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, { 'aria-invalid': problem ? true : undefined, 'aria-describedby': described || undefined })
    : children
  return (
    <div>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-a-text-2">{label}</span>
        {control}
      </label>
      {hint && <p id={`${id}-hint`} className="mt-1 text-xs text-a-text-2">{hint}</p>}
      {problem && <p id={`${id}-problem`} className="mt-1 text-xs font-medium text-a-danger">{problem}</p>}
    </div>
  )
}

/** A checkbox with its label beside it, and a line under it saying what it does. */
export function Check({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (on: boolean) => void }) {
  const id = useId()
  return (
    <div className="flex items-start gap-2.5">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-describedby={hint ? `${id}-hint` : undefined}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-a-border accent-a-accent-text" />
      <div className="min-w-0">
        <label htmlFor={id} className="block text-sm font-medium text-a-text">{label}</label>
        {hint && <p id={`${id}-hint`} className="text-xs text-a-text-2">{hint}</p>}
      </div>
    </div>
  )
}

/** One choice of several that may all be on (a weekday, a tier): a real button that says whether it is pressed. */
export function Toggle({ on, onClick, label, children }: { on: boolean; onClick: () => void; label?: string; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={on} aria-label={label} onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium ${on ? 'border-a-accent-text bg-a-accent/10 text-a-text' : 'border-a-border bg-a-surface text-a-text-2 hover:text-a-text'}`}>
      {children}
    </button>
  )
}

/** A state as its tone's dot and word over the tone's tint (theme/loyalty.css). */
export function ToneBadge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span data-state={tone} className="l-st-tint l-st-text inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold">
      <span aria-hidden className="l-st-dot h-1.5 w-1.5 rounded-full" />
      {children}
    </span>
  )
}

/**
 * The step before an action that cannot be taken back: what it does, in a sentence, and two plain answers, the safe
 * one first.
 */
export function ConfirmDialog({ title, children, confirm, keep, busy, failure, onConfirm, onClose }: {
  title: string
  children: ReactNode
  confirm: string
  keep: string
  busy: boolean
  failure: string | null
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Dialog title={title} onClose={onClose} busy={busy}>
      <div className="space-y-4">
        <div className="space-y-2 text-sm text-a-text">{children}</div>
        {failure && <Notice tone="danger">{failure}</Notice>}
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>{keep}</Button>
          <Button type="button" variant="danger" loading={busy} onClick={onConfirm}>{confirm}</Button>
        </div>
      </div>
    </Dialog>
  )
}

/** The buttons at the foot of a form: leave, and save. */
export function FormFoot({ cancel, save, busy, onCancel }: { cancel: string; save: string; busy: boolean; onCancel: () => void }) {
  return (
    <div className="flex flex-wrap justify-end gap-2 pt-1">
      <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>{cancel}</Button>
      <Button type="submit" loading={busy}>{save}</Button>
    </div>
  )
}
