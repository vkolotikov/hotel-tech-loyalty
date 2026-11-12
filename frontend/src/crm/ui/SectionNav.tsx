import type { KeyboardEvent, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { TONE_CHIP, type Tone } from './tones'

export interface Section<T extends string> {
  key: T
  icon: LucideIcon
  title: string
  /** One line of what the section is for. */
  caption?: string
  /** A count or a state beside the title (what waits there). */
  badge?: ReactNode
  tone?: Tone
}

/** Which section the arrow keys, Home and End move to (one tab stop for the whole row). */
// eslint-disable-next-line react-refresh/only-export-components
export function sectionAfter<T extends string>(keys: readonly T[], current: T, key: string): T | null {
  const i = keys.indexOf(current)
  if (i < 0 || keys.length === 0) return null
  if (key === 'ArrowRight' || key === 'ArrowDown') return keys[(i + 1) % keys.length]
  if (key === 'ArrowLeft' || key === 'ArrowUp') return keys[(i - 1 + keys.length) % keys.length]
  if (key === 'Home') return keys[0]
  if (key === 'End') return keys[keys.length - 1]
  return null
}

/**
 * A page's sections (round 2, "structured sections"; round 5, owner 2026-11-12, "minimize copy, more icons … tabs"): one
 * strip of tabs, each its icon in its tone, its title and what waits there; the line of what a section is for is the
 * tab's tooltip. A tab list with one tab stop controlling `panelId`; the page keeps the chosen section in its address
 * (`?tab=`). The strip scrolls sideways on a phone rather than wrapping. `compact` is kept for callers of round 2.
 */
export function SectionNav<T extends string>({ label, idPrefix, panelId, sections, value, onChange }: {
  label: string
  idPrefix: string
  panelId: string
  sections: Section<T>[]
  value: T
  onChange: (next: T) => void
  compact?: boolean
}) {
  const keys = sections.map(s => s.key)
  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const next = sectionAfter(keys, value, e.key)
    if (!next) return
    e.preventDefault()
    onChange(next)
    document.getElementById(`${idPrefix}-${next}`)?.focus()
  }
  return (
    <div className="rounded-2xl border border-a-border bg-a-surface p-1.5 shadow-a-sm">
      <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto [scrollbar-width:none]">
        {sections.map(({ key, icon: Icon, title, caption, badge, tone = 'accent' }) => {
          const on = key === value
          return (
            <button key={key} type="button" role="tab" id={`${idPrefix}-${key}`} aria-selected={on} aria-controls={panelId} tabIndex={on ? 0 : -1}
              data-section={key} title={caption} onClick={() => onChange(key)} onKeyDown={onKey}
              className={`flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-2.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-a-accent ${on ? 'bg-a-accent/15 text-a-text' : 'text-a-text-2 hover:bg-a-surface-2 hover:text-a-text'}`}>
              <span aria-hidden className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${TONE_CHIP[tone]}`}><Icon size={15} /></span>
              <span className="whitespace-nowrap">{title}</span>
              {badge !== undefined && badge !== null && badge !== 0 && (
                <span className="shrink-0 rounded-full bg-a-accent px-1.5 text-center text-xs font-semibold leading-5 text-a-accent-ink">{badge}</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
