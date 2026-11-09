import { createElement } from 'react'
import { useTranslation } from 'react-i18next'
import { getIcon } from '../../lib/plannerMeta'
import type { TaskTile, TypeTile } from './taskFormLogic'

/**
 * The task form's two pickers as the full admin's drawer draws them (2026-11-09): a grid of types, each with its icon in
 * its colour, then a grid of the chosen type's tasks. The colours are the planner's settings, set inline as the planner
 * draws a task; a chosen tile takes a wash of its colour and its colour as the edge. An amber dot marks what fits the
 * chosen person best (their preferred work, a hint only).
 */

const wash = (color: string) => `color-mix(in srgb, ${color} 22%, rgb(var(--a-surface)))`

function Tile({ on, preferred, color, icon, label, hint, onClick, small = false }: {
  on: boolean
  preferred: boolean
  color: string
  icon: string
  label: string
  hint?: string
  onClick: () => void
  small?: boolean
}) {
  // The icon is the full admin's list's (lib/plannerMeta), drawn with createElement (react-hooks/static-components).
  const glyph = createElement(getIcon(icon), { size: small ? 15 : 17, 'aria-hidden': true })
  return (
    <button type="button" aria-pressed={on} onClick={onClick} title={hint}
      className={`relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl border px-1.5 text-center font-semibold leading-tight transition-colors focus-visible:outline-2 focus-visible:outline-a-accent disabled:cursor-default ${small ? 'min-h-14 py-1.5 text-xs' : 'min-h-16 py-2 text-xs'} ${on ? 'text-a-text shadow-a-sm' : preferred ? 'border-a-st-pending/50 bg-a-st-pending/8 text-a-text hover:bg-a-st-pending/12' : 'border-a-border bg-a-surface text-a-text-2 hover:border-a-text-2/40 hover:text-a-text'}`}
      style={on ? { backgroundColor: wash(color), borderColor: color } : undefined}>
      {preferred && <span aria-hidden className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-a-st-pending" />}
      <span style={{ color }}>{glyph}</span>
      <span className="line-clamp-2 break-words">{label}</span>
    </button>
  )
}

export function TypeGrid({ tiles, value, onPick, person }: { tiles: TypeTile[]; value: string; onPick: (type: string) => void; person?: string }) {
  const { t } = useTranslation()
  return (
    <div className="grid grid-cols-3 gap-1.5" role="group" aria-label={t('time.task.type', 'Type')}>
      {tiles.map(tile => (
        <Tile key={tile.value || '—'} on={value === tile.value} preferred={tile.preferred} color={tile.color} icon={tile.icon}
          label={tile.name || t('time.task.custom_type', 'Custom')}
          hint={tile.preferred && person ? t('time.task.fits', 'Fits {{name}}', { name: person }) : undefined}
          onClick={() => onPick(tile.value)} />
      ))}
    </div>
  )
}

export function TaskGrid({ tiles, value, onPick, person }: { tiles: TaskTile[]; value: string; onPick: (tile: TaskTile) => void; person?: string }) {
  const { t } = useTranslation()
  return (
    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4" role="group" aria-label={t('time.task.category', 'Task')}>
      {tiles.map(tile => (
        <Tile key={tile.key} small on={value === tile.key} preferred={tile.preferred} color={tile.color} icon={tile.icon} label={tile.label}
          hint={tile.preferred && person ? t('time.task.fits', 'Fits {{name}}', { name: person }) : undefined}
          onClick={() => onPick(tile)} />
      ))}
    </div>
  )
}
