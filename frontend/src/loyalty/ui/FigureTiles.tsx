import type { ReactNode } from 'react'
import { ArrowRight, type LucideIcon } from 'lucide-react'
import type { Hue } from './sections'

/**
 * A row of figures at the top of a page or a section (release 10, the owner's Figma 131:3945 and 163:88): each tile its
 * icon, what it counts, the figure large and a word beside it. A tile that leads on is a button in its colour with an
 * arrow; one that asks for a look is in the waiting colour.
 */
export function FigureTiles({ children, label }: { children: ReactNode; label: string }) {
  return <ul aria-label={label} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{children}</ul>
}

export function FigureTile({ icon: Icon, hue, label, value, note, onClick, name }: {
  icon: LucideIcon
  hue?: Hue
  label: string
  value: string
  note?: string
  /** A tile that leads somewhere (another section); drawn in its colour with an arrow. */
  onClick?: () => void
  name: string
}) {
  const body = (
    <>
      <span aria-hidden className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${hue ? 'l-hue-tile' : 'bg-a-surface-2 text-a-text-2'}`}><Icon size={20} /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-a-text-2">{label}</span>
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-a-display text-4xl font-light leading-tight tabular-nums text-a-text">{value}</span>
          {note && <span className="text-sm text-a-text-2">{note}</span>}
        </span>
      </span>
      {onClick && <ArrowRight size={18} aria-hidden className="l-hue-text shrink-0" />}
    </>
  )
  return (
    <li data-figure={name} data-hue={hue}>
      {onClick
        ? <button type="button" data-leads="" onClick={onClick} className="l-hue-panel flex h-full w-full items-center gap-4 rounded-2xl border p-4 text-left hover:brightness-105">{body}</button>
        : <div className="flex h-full items-center gap-4 rounded-2xl border border-a-border bg-a-surface p-4">{body}</div>}
    </li>
  )
}
