import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { SectionTitle } from '../../workspace/ui/Typography'
import type { Hue } from '../ui/sections'

/**
 * Pieces Program's sections (tiers, benefits, places, boosts) and the event's page share: a section's head with its
 * mark, and a row's obvious action as an icon.
 */

/** A section's title with its mark (in the section's colour where it has one, release 10), and its action at the end of the row. */
export function SectionHead({ id, title, icon: Icon, hue, children }: { id: string; title: string; icon: LucideIcon; hue?: Hue; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2.5">
        <span aria-hidden data-hue={hue} className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${hue ? 'l-hue-tile' : 'bg-a-accent/10 text-a-accent-text'}`}>
          <Icon size={16} />
        </span>
        <SectionTitle><span id={id}>{title}</span></SectionTitle>
      </div>
      {children}
    </div>
  )
}

/**
 * A row's obvious action (edit, remove) as its icon: the word is the hover tip and, with the thing it acts on, the
 * button's name for a screen reader ("Edit Gold"). 44 px on a phone, smaller where a pointer is precise.
 */
export function IconButton({ icon: Icon, label, name, onClick, danger = false }: {
  icon: LucideIcon
  label: string
  /** What it acts on, read after the word. */
  name?: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button type="button" title={label} onClick={onClick}
      className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-a-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-a-accent-text sm:h-9 sm:w-9 ${danger ? 'text-a-text-2 hover:text-a-danger' : 'text-a-text-2 hover:text-a-text'}`}>
      <Icon size={16} aria-hidden />
      <span className="sr-only">{label}{name ? ` ${name}` : ''}</span>
    </button>
  )
}

/**
 * A card's action as a word with its icon (release 11: the tier card's Rename, Edit and Delete, where a newcomer reads
 * what each does rather than guessing from an icon); the thing it acts on follows for a screen reader.
 */
export function CardAction({ icon: Icon, label, name, onClick, danger = false }: {
  icon: LucideIcon
  label: string
  name?: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button type="button" onClick={onClick}
      className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border border-a-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-a-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-a-accent-text sm:min-h-9 ${danger ? 'text-a-text-2 hover:border-a-danger hover:text-a-danger' : 'text-a-text'}`}>
      <Icon size={15} aria-hidden />
      {label}{name && <span className="sr-only"> {name}</span>}
    </button>
  )
}
