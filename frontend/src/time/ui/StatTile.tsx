import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import { TONE_CHIP, type Tone } from './tones'

export type { Tone }

/** A figure with its label and a line under it; a link when `to` is set. */
export function StatTile({ label, value, hint, icon: Icon, tone = 'neutral', to }: {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon?: LucideIcon
  tone?: Tone
  to?: string
}) {
  const body = (
    <>
      <div className="flex items-center gap-2">
        {Icon && <span aria-hidden className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${TONE_CHIP[tone]}`}><Icon size={16} /></span>}
        {/* Two lines before an ellipsis: six tiles in a row, or a German label, still say what they count. */}
        <span className="line-clamp-2 min-w-0 break-words text-xs font-medium leading-snug text-a-text-2">{label}</span>
      </div>
      <p className="mt-2 font-a-display text-3xl leading-none text-a-text">{value}</p>
      {hint && <p className="mt-1.5 text-xs text-a-text-2">{hint}</p>}
    </>
  )
  const box = 'block min-w-0 rounded-2xl border border-a-border bg-a-surface p-4 shadow-a-sm'
  return to
    ? <Link to={to} className={`${box} transition-colors hover:border-a-accent/40 focus-visible:outline-2 focus-visible:outline-a-accent`}>{body}</Link>
    : <div className={box}>{body}</div>
}
