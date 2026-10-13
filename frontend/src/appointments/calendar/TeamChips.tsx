import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import type { CalendarMaster } from '../lib/types'

/** Hidden ids that still name someone on the team; the one visible person cannot be hidden (spec §5.4). */
// eslint-disable-next-line react-refresh/only-export-components
export function toggleHidden(hidden: number[], id: number, allIds: number[]): number[] {
  const current = hidden.filter(h => allIds.includes(h))
  if (current.includes(id)) return current.filter(h => h !== id)
  const visible = allIds.filter(a => !current.includes(a))
  if (visible.length <= 1 && visible.includes(id)) return current
  return [...current, id]
}

/**
 * Show or hide people on the day view, remembered on this device. `pending`: the
 * calendar still holds the last day while this one loads, so each count is a dash
 * (as in the Today strip), not that day's number.
 */
export function TeamChips({ masters, hidden, counts, onToggle, pending = false }: {
  masters: CalendarMaster[]; hidden: number[]; counts: Record<number, number>; onToggle: (id: number) => void; pending?: boolean
}) {
  const { t } = useTranslation()
  const ids = masters.map(m => m.id)
  const visible = ids.filter(id => !hidden.includes(id))
  return (
    <div role="group" aria-label={t('appointments.calendar.team_chips', 'Team on the calendar')} aria-busy={pending || undefined} className="flex flex-wrap items-center gap-2">
      {masters.map(m => {
        const shown = !hidden.includes(m.id)
        const last = shown && visible.length === 1
        return (
          <button key={m.id} type="button" aria-pressed={shown} aria-disabled={last || undefined}
            title={last ? t('appointments.calendar.team_chips_last', 'At least one person stays on the calendar') : undefined}
            onClick={() => { if (!last) onToggle(m.id) }}
            style={{ '--a-m': m.color } as CSSProperties}
            className={`inline-flex min-h-9 items-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors ${shown ? 'border-a-border bg-a-surface text-a-text' : 'border-dashed border-a-border bg-transparent text-a-text-2'}`}>
            <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${shown ? 'a-member-dot' : 'a-member-ring'}`} />
            {m.name}
            <span className="font-a-mono text-xs text-a-text-2">{pending ? '—' : counts[m.id] ?? 0}</span>
          </button>
        )
      })}
    </div>
  )
}
