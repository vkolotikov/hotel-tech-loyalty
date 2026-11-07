import type { ReactNode } from 'react'
import { TONE_CHIP, type Tone } from './StatTile'

/** A short state in its tone: "Waiting", "Won", "AI". */
export function Pill({ tone = 'neutral', children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex max-w-full items-center gap-1 truncate rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CHIP[tone]}`}>
      {children}
    </span>
  )
}
