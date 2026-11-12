import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import { TONE_CHIP, type Tone } from './tones'

export type { Tone }

/**
 * A figure with its label and a short fact beside it; a link when `to` is set. Round 5 (owner 2026-11-12): compact — the
 * icon at the start, the label over the figure — so a row of figures takes half the height it did, and a phone shows
 * the list under it on the first screen. `active` outlines a figure whose filter is on.
 */
export function StatTile({ label, value, hint, icon: Icon, tone = 'neutral', to, active = false }: {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon?: LucideIcon
  tone?: Tone
  to?: string
  active?: boolean
}) {
  const body = (
    <div className="flex min-w-0 items-center gap-3">
      {Icon && <span aria-hidden className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${TONE_CHIP[tone]}`}><Icon size={17} /></span>}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-a-text-2" title={label}>{label}</p>
        <p className="flex min-w-0 items-baseline gap-2">
          <span className="shrink-0 font-a-display text-2xl leading-tight text-a-text">{value}</span>
          {hint && <span className="min-w-0 truncate text-xs text-a-text-2">{hint}</span>}
        </p>
      </div>
    </div>
  )
  const box = `block min-w-0 rounded-2xl border bg-a-surface px-3.5 py-3 shadow-a-sm ${active ? 'border-a-accent' : 'border-a-border'}`
  return to
    ? <Link to={to} aria-current={active ? 'true' : undefined} className={`${box} transition-colors hover:border-a-accent/40 focus-visible:outline-2 focus-visible:outline-a-accent`}>{body}</Link>
    : <div className={box}>{body}</div>
}

/** A row of figures: two across on a phone, as many as fit on a wide screen (at most six). */
export function StatRow({ label, children, count }: { label?: string; children: ReactNode; count: number }) {
  const cols = count >= 6 ? 'lg:grid-cols-6' : count === 5 ? 'lg:grid-cols-5' : count === 4 ? 'lg:grid-cols-4' : count === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-2'
  return <div role="group" aria-label={label} className={`grid grid-cols-2 gap-2 sm:gap-3 ${count >= 3 ? 'md:grid-cols-3' : ''} ${cols}`}>{children}</div>
}
