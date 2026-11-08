import { createElement, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react'
import { COLOR_OPTIONS, ICON_OPTIONS, getIcon } from '../../lib/plannerMeta'
import { Button } from '../../workspace/ui/Button'

/**
 * The pieces Settings' editors share: a type's or a task's look (its icon on a wash of its own colour, the colour
 * itself as the edge, set inline from the settings as the planner draws a task), the icon and colour picker over the
 * full admin's own lists (lib/plannerMeta, one source of truth), a row's move and remove buttons, and the bar that
 * saves a draft.
 */

/** A look's tile; a button that opens the picker when `onClick` is set. */
export function LookTile({ icon, color, label, onClick, expanded, disabled = false }: {
  icon: string | null | undefined
  color: string
  label?: string
  onClick?: () => void
  expanded?: boolean
  disabled?: boolean
}) {
  // The icon is looked up from the full admin's list, not made here: drawn with createElement (react-hooks/static-components).
  const glyph = createElement(getIcon(icon), { size: 17, 'aria-hidden': true })
  const style = { backgroundColor: `color-mix(in srgb, ${color} 20%, rgb(var(--a-surface)))`, borderColor: color }
  const box = 'grid h-10 w-10 shrink-0 place-items-center rounded-xl border-2 text-a-text'
  if (!onClick) return <span aria-hidden className={box} style={style}>{glyph}</span>
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} aria-expanded={expanded} title={label}
      className={`${box} transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-a-accent disabled:cursor-default`} style={style}>
      {glyph}
    </button>
  )
}

/** The icon and colour picker under a row: the full admin's icons and colours, the chosen ones marked. */
export function LookPicker({ icon, color, onIcon, onColor, onClose }: {
  icon: string
  color: string
  onIcon: (key: string) => void
  onColor: (hex: string) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-3 border-t border-a-border px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-a-text-2">{t('time.settings.icon', 'Icon')}</span>
        <button type="button" onClick={onClose} className="rounded-full px-2 py-0.5 text-xs font-semibold text-a-accent-text hover:bg-a-accent/10">{t('time.settings.done', 'Done')}</button>
      </div>
      <div role="group" aria-label={t('time.settings.icon', 'Icon')} className="flex flex-wrap gap-1.5">
        {Object.entries(ICON_OPTIONS).map(([key, Icon]) => {
          const on = key === icon
          return (
            <button key={key} type="button" aria-pressed={on} aria-label={key.replace(/-/g, ' ')} title={key.replace(/-/g, ' ')} onClick={() => onIcon(key)}
              className={`grid h-9 w-9 place-items-center rounded-lg border transition-colors ${on ? 'border-a-accent bg-a-accent/12 text-a-accent-text' : 'border-transparent text-a-text-2 hover:bg-a-surface-2 hover:text-a-text'}`}>
              <Icon size={16} aria-hidden />
            </button>
          )
        })}
      </div>
      <span className="block text-xs font-semibold text-a-text-2">{t('time.settings.colour', 'Colour')}</span>
      <div role="group" aria-label={t('time.settings.colour', 'Colour')} className="flex flex-wrap gap-2">
        {COLOR_OPTIONS.map(hex => {
          const on = hex.toLowerCase() === color.toLowerCase()
          return (
            <button key={hex} type="button" aria-pressed={on} aria-label={t('time.settings.colour_named', 'Colour {{hex}}', { hex })} title={hex} onClick={() => onColor(hex)}
              className={`h-8 w-8 rounded-full border-2 transition ${on ? 'border-a-text ring-2 ring-a-accent ring-offset-2 ring-offset-a-surface' : 'border-a-surface hover:scale-110'}`}
              style={{ backgroundColor: hex }} />
          )
        })}
      </div>
    </div>
  )
}

/** A row's up, down and remove buttons, each naming what it moves. */
export function RowButtons({ name, first, last, disabled, onUp, onDown, onRemove }: {
  name: string
  first: boolean
  last: boolean
  disabled: boolean
  onUp: () => void
  onDown: () => void
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const btn = 'grid h-9 w-9 place-items-center rounded-lg text-a-text-2 hover:bg-a-surface-2 hover:text-a-text disabled:pointer-events-none disabled:opacity-30'
  return (
    <div className="flex shrink-0 items-center">
      <button type="button" className={btn} disabled={disabled || first} onClick={onUp} aria-label={t('time.settings.move_up', 'Move up: {{name}}', { name })}><ArrowUp size={16} aria-hidden /></button>
      <button type="button" className={btn} disabled={disabled || last} onClick={onDown} aria-label={t('time.settings.move_down', 'Move down: {{name}}', { name })}><ArrowDown size={16} aria-hidden /></button>
      <button type="button" className={`${btn} hover:text-a-danger`} disabled={disabled} onClick={onRemove} aria-label={t('time.settings.remove_named', 'Remove: {{name}}', { name })}><Trash2 size={16} aria-hidden /></button>
    </div>
  )
}

/** The bar that saves a draft: what is unsaved (or what stops the save), Discard and Save changes. */
export function SaveBar({ problem, busy, onSave, onDiscard }: { problem: string | null; busy: boolean; onSave: () => void; onDiscard: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-2xl border border-a-accent/40 bg-a-surface p-3 shadow-a-lg animate-a-fade">
      <p className={`min-w-0 flex-1 text-sm ${problem ? 'text-a-danger' : 'text-a-text'}`}>{problem ?? t('time.settings.unsaved', 'You have unsaved changes.')}</p>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" onClick={onDiscard} disabled={busy}>{t('time.settings.discard', 'Discard')}</Button>
        <Button size="sm" onClick={onSave} loading={busy} disabled={problem !== null}>{t('time.settings.save_changes', 'Save changes')}</Button>
      </div>
    </div>
  )
}

/** A short line under an editor (what a change does, or does not do). */
export function Hint({ children }: { children: ReactNode }) {
  return <p className="text-xs text-a-text-2">{children}</p>
}
