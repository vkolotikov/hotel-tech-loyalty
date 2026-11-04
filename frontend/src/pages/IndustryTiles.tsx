import { useRef } from 'react'
import {
  BedDouble, Briefcase, Check, Dumbbell, GraduationCap, House, LayoutGrid, Scale, Scissors, Stethoscope, UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react'
import type { IndustryId } from '../lib/industryHosts'
import { stepIndex } from './radioKeys'

const ICONS: Record<IndustryId, LucideIcon> = {
  hotel: BedDouble,
  beauty: Scissors,
  medical: Stethoscope,
  restaurant: UtensilsCrossed,
  fitness: Dumbbell,
  education: GraduationCap,
  legal: Scale,
  real_estate: House,
  services: Briefcase,
  other: LayoutGrid,
}

/**
 * The sign-up's "Type of business" (owner 2026-11-04: "improve industry selection, better well designed"): a grid of
 * tiles, each an icon and a short name, that behaves as one radio group — Tab reaches the chosen tile (or the first),
 * the arrows move the choice. The order is the product's (industryOrder), so its most likely businesses come first.
 */
export function IndustryTiles({ ids, labels, value, onChange, labelledBy, invalid }: {
  ids: readonly IndustryId[]
  labels: Record<string, string>
  value: IndustryId | null
  onChange: (id: IndustryId) => void
  labelledBy: string
  invalid?: boolean
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const reachable = value ? Math.max(0, ids.indexOf(value)) : 0
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} aria-invalid={invalid || undefined} data-industry-tiles=""
      className="grid grid-cols-2 gap-2">
      {ids.map((id, i) => {
        const Icon = ICONS[id]
        const chosen = value === id
        return (
          <button
            key={id}
            ref={el => { refs.current[i] = el }}
            type="button"
            role="radio"
            aria-checked={chosen}
            tabIndex={i === reachable ? 0 : -1}
            data-industry={id}
            onClick={() => onChange(id)}
            onKeyDown={e => {
              const next = stepIndex(i, e.key, ids.length)
              if (next === null) return
              e.preventDefault()
              onChange(ids[next])
              refs.current[next]?.focus()
            }}
            className={'group flex min-h-[52px] items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left text-[13px] leading-snug transition focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-500/50 '
              + (chosen
                ? 'border-blue-500 bg-blue-500/10 text-white ring-1 ring-blue-500/40'
                : invalid
                  ? 'border-red-500/40 bg-slate-950/40 text-slate-300 hover:border-red-400/60'
                  : 'border-white/10 bg-slate-950/40 text-slate-300 hover:border-white/25 hover:bg-white/3')}
          >
            <span className={'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition '
              + (chosen ? 'bg-blue-500 text-on-fill' : 'bg-white/5 text-slate-400 group-hover:text-slate-200')}>
              <Icon size={16} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">{labels[id] ?? id}</span>
            {chosen && <Check size={14} className="shrink-0 text-blue-400" aria-hidden />}
          </button>
        )
      })}
    </div>
  )
}
