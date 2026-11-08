import { useTranslation } from 'react-i18next'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { duration } from '../lib/format'
import { loadState } from '../plan/timeline'
import { changeTone, loadWidth, type Change } from './insightsLogic'

/**
 * Insights' drawings in plain markup with the workspace's own colour classes (`bg-a-*`, the load bar's `time-load-*`),
 * so they follow light and dark like every other surface. Each column and bar carries its value in an aria-label; the
 * shapes themselves are hidden from screen readers. Lengths come from insightsLogic (barShare, loadWidth).
 */

export interface Column {
  key: string
  /** Under the column ("Mon", "09", "4 Nov"); none when `showLabel` is false. */
  label: string
  showLabel?: boolean
  /** The column's height in percent of the chart. */
  height: number
  /** A darker part inside the column, in percent of the column (what was finished). */
  inner?: number
  /** Written above the column when the chart shows values (by default up to eight columns). */
  value?: string
  /** The whole sentence a screen reader says for the column. */
  aria: string
  /** The column to pick out (today). */
  strong?: boolean
}

export function Columns({ label, items, tall = 'h-40', values = items.length <= 8 }: { label: string; items: Column[]; tall?: string; values?: boolean }) {
  return (
    <div className="min-w-0">
      <div role="list" aria-label={label} className={`flex ${tall} items-end border-b border-a-border ${items.length > 40 ? 'gap-px' : 'gap-0.5 sm:gap-1'}`}>
        {items.map(c => (
          <div key={c.key} role="listitem" aria-label={c.aria} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
            {values && <span aria-hidden className="max-w-full truncate text-xs tabular-nums text-a-text-2">{c.value ?? ''}</span>}
            <span aria-hidden className="flex w-full flex-1 items-end">
              <span className={`relative block w-full overflow-hidden rounded-t-md ${c.strong ? 'bg-a-accent/45' : 'bg-a-accent/25'}`} style={{ height: `${c.height}%` }}>
                {c.inner !== undefined && c.inner > 0 && <span className="absolute inset-x-0 bottom-0 block bg-a-accent" style={{ height: `${c.inner}%` }} />}
              </span>
            </span>
          </div>
        ))}
      </div>
      {/* The labels sit under their columns but may be wider than one: the first starts at the left, the last ends at the right. */}
      <div aria-hidden className="relative mt-1 flex h-5 text-xs text-a-text-2">
        {items.map((c, i) => (
          <span key={c.key} className="relative min-w-0 flex-1">
            {c.showLabel !== false && (
              <span className={`absolute top-0 whitespace-nowrap ${i === items.length - 1 && items.length > 1 ? 'right-0' : i === 0 && items.length > 1 ? 'left-0' : 'left-1/2 -translate-x-1/2'} ${c.strong ? 'font-semibold text-a-text' : ''}`}>
                {c.label}
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  )
}

/** A horizontal bar of a share (a type's planned time against the busiest type's). */
export function ShareBar({ share, label }: { share: number; label: string }) {
  return (
    <span role="img" aria-label={label} className="block h-2 w-full overflow-hidden rounded-full bg-a-surface-2">
      <span className="block h-full rounded-full bg-a-accent" style={{ width: `${share}%` }} />
    </span>
  )
}

/** A person's load: planned against what they could be planned for, in the load's colour (room, nearly full, over). */
export function LoadBar({ pct, label }: { pct: number | null | undefined; label: string }) {
  const state = loadState(pct)
  return (
    <span role="img" aria-label={label} className="block h-2 w-full overflow-hidden rounded-full bg-a-surface-2">
      <span className={`block h-full rounded-full ${state === 'none' ? 'bg-a-text-2/40' : `time-load-${state}`}`} style={{ width: `${loadWidth(pct)}%` }} />
    </span>
  )
}

/** How a figure moved against the period before: "+5 pts", "−2", "+1 h 30 min", in green when good news, red when not. */
export function Delta({ change, unit, upIsGood }: { change: Change | null; unit: 'points' | 'count' | 'minutes'; upIsGood: boolean | null }) {
  const { t } = useTranslation()
  if (!change) return null
  const units = { h: t('time.common.h', 'h'), min: t('time.common.min', 'min') }
  const tone = changeTone(change, upIsGood)
  const colour = tone === 'good' ? 'text-a-st-confirmed' : tone === 'bad' ? 'text-a-danger' : 'text-a-text-2'
  const Icon = change.kind === 'up' ? ArrowUpRight : change.kind === 'down' ? ArrowDownRight : Minus
  let text: string
  if (change.kind === 'same') text = t('time.insights.delta_same', 'no change')
  else if (unit === 'points') {
    text = change.kind === 'up'
      ? t('time.insights.delta_up_points', '+{{amount}} pts', { amount: change.amount })
      : t('time.insights.delta_down_points', '−{{amount}} pts', { amount: change.amount })
  } else {
    const amount = unit === 'minutes' ? duration(change.amount, units) : String(change.amount)
    text = change.kind === 'up'
      ? t('time.insights.delta_up', '+{{amount}}', { amount })
      : t('time.insights.delta_down', '−{{amount}}', { amount })
  }
  return (
    <span className={`inline-flex items-center gap-0.5 font-semibold ${colour}`}>
      <Icon size={13} aria-hidden />{text}
      <span className="sr-only"> {t('time.insights.vs_before', 'vs the period before')}</span>
    </span>
  )
}
