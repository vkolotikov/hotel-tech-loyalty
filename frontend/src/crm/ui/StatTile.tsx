import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'

export type Tone = 'neutral' | 'accent' | 'pending' | 'progress' | 'success' | 'danger' | 'ai'

/** The icon's chip per tone: a 12 % tint of the tone with the tone as ink (the Atelier status tones, the AI's violet). */
export const TONE_CHIP: Record<Tone, string> = {
  neutral: 'bg-a-surface-2 text-a-text-2',
  accent: 'bg-a-accent/12 text-a-accent-text',
  pending: 'bg-a-st-pending/12 text-a-st-pending',
  progress: 'bg-a-st-progress/12 text-a-st-progress',
  success: 'bg-a-st-confirmed/12 text-a-st-confirmed',
  danger: 'bg-a-danger/12 text-a-danger',
  ai: 'crm-ai-soft',
}

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
        <span className="min-w-0 truncate text-xs font-medium text-a-text-2">{label}</span>
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
