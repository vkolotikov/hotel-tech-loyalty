import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { sectionAfter, type Hue } from './sections'

export interface SectionCard<T extends string> {
  id: T
  icon: LucideIcon
  hue: Hue
  title: string
  /** One line of what the section is for. */
  caption: string
  /** A count or a state beside the title (how many, how many waiting). */
  badge?: ReactNode
}

/**
 * A page's sections as cards (release 10, the owner's Figma section navigation 171:401): each with its icon in its
 * colour, its title and a line of what it is for; the chosen one filled with its colour and outlined in it. A tab list
 * with one tab stop — the arrow keys, Home and End move between the sections — controlling `panelId`; the page keeps
 * the chosen section in its address. Two across on a phone, as many as fit in a row on a wide screen.
 */
export function SectionCards<T extends string>({ label, idPrefix, panelId, items, value, onChange }: {
  label: string
  idPrefix: string
  panelId: string
  items: SectionCard<T>[]
  value: T
  onChange: (next: T) => void
}) {
  const ids = items.map(item => item.id)
  const wide = items.length >= 4 ? 'lg:grid-cols-4' : items.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-2'
  return (
    <div role="tablist" aria-label={label} className={`grid grid-cols-2 gap-2 sm:gap-3 ${wide}`}>
      {items.map(({ id, icon: Icon, hue, title, caption, badge }) => {
        const on = id === value
        return (
          <button key={id} type="button" role="tab" id={`${idPrefix}-${id}`} aria-selected={on} aria-controls={panelId} tabIndex={on ? 0 : -1}
            data-section={id} data-hue={hue} onClick={() => onChange(id)}
            onKeyDown={(e) => {
              const next = sectionAfter(ids, value, e.key)
              if (next === null) return
              e.preventDefault()
              onChange(next)
              document.getElementById(`${idPrefix}-${next}`)?.focus()
            }}
            className={`flex min-h-[4.5rem] items-center gap-3 rounded-2xl border p-3 text-left transition-colors sm:p-4 ${on ? 'l-hue-card' : 'border-a-border bg-a-surface hover:bg-a-surface-2'}`}>
            <span aria-hidden className="l-hue-tile inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"><Icon size={20} /></span>
            <span className="min-w-0 flex-1">
              <span className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 font-semibold leading-tight ${on ? 'l-hue-text' : 'text-a-text'}`}>
                <span>{title}</span>{badge}
              </span>
              <span className="mt-0.5 block text-xs leading-snug text-a-text-2 sm:text-sm">{caption}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * A section's count beside its title, in the card's own colour family; `waiting` draws it in the waiting colour (codes
 * at the desk, warnings to look at), with `waitingLabel` read out after the figure.
 */
export function SectionCount({ value, waiting = false, waitingLabel }: { value: string; waiting?: boolean; waitingLabel?: string }) {
  return waiting
    ? (
      <span data-tab-count="" data-state="pending" className="l-st-tint l-st-text rounded-full px-2 text-xs font-bold tabular-nums">
        {value}{waitingLabel && <span className="sr-only"> {waitingLabel}</span>}
      </span>
    )
    : <span data-tab-count="" className="rounded-full bg-a-surface-2 px-2 text-xs font-semibold tabular-nums text-a-text-2">{value}</span>
}
