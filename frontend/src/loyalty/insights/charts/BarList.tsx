import type { ReactNode } from 'react'
import { barShare } from '../insightsMath'
import type { Tone } from './frame'

export interface BarRow {
  id: string
  label: ReactNode
  value: number
  /** The value as written beside the bar ("1,204", "1,204 · 31 %"). */
  text: string
  tone?: Tone
}

/**
 * Bars across a list (spec 2026-10-21 release 2 §5: members by tier, engagement, balances, expiry, tier flows): each
 * row's name, a bar as long as its share of the longest, and its number in words a screen reader reads as they are —
 * the bar itself is hidden from it. Plain markup, so it follows the card's width on its own.
 */
export function BarList({ rows, label }: { rows: BarRow[]; label: string }) {
  const max = Math.max(0, ...rows.map(r => r.value))
  return (
    <ul aria-label={label} className="space-y-2" data-chart="bars">
      {rows.map(row => (
        <li key={row.id} data-row={row.id} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-x-3 text-sm sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_auto]">
          <span className="min-w-0 truncate text-a-text">{row.label}</span>
          <span aria-hidden className="block h-3 min-w-0">
            {row.value > 0 && <span className={`block h-3 rounded-r l-chart-bar-${row.tone ?? 1}`} style={{ width: `${barShare(row.value, max)}%` }} />}
          </span>
          <span className="text-right tabular-nums text-a-text">{row.text}</span>
        </li>
      ))}
    </ul>
  )
}
