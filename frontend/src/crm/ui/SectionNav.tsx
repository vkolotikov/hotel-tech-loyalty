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
 * A page's sections as cards (round 2, "structured sections"): each with its icon in its tone, its title, a line of what
 * it is for and what waits there; the chosen one outlined in the accent. A tab list with one tab stop controlling
 * `panelId`; the page keeps the chosen section in its address (`?tab=`). Two across on a phone, up to five on a wide
 * screen; `compact` drops the captions (a page with many sections, or a phone).
 */
export function SectionNav<T extends string>({ label, idPrefix, panelId, sections, value, onChange, compact = false }: {
  label: string
  idPrefix: string
  panelId: string
  sections: Section<T>[]
  value: T
  onChange: (next: T) => void
  compact?: boolean
}) {
  const keys = sections.map(s => s.key)
  const cols = sections.length >= 5 ? 'lg:grid-cols-5' : sections.length === 4 ? 'lg:grid-cols-4' : sections.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-2'
  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const next = sectionAfter(keys, value, e.key)
    if (!next) return
    e.preventDefault()
    onChange(next)
    document.getElementById(`${idPrefix}-${next}`)?.focus()
  }
  return (
    <div role="tablist" aria-label={label} className={`grid grid-cols-2 gap-2 sm:gap-3 ${sections.length >= 3 ? 'sm:grid-cols-3' : ''} ${cols}`}>
      {sections.map(({ key, icon: Icon, title, caption, badge, tone = 'accent' }) => {
        const on = key === value
        return (
          <button key={key} type="button" role="tab" id={`${idPrefix}-${key}`} aria-selected={on} aria-controls={panelId} tabIndex={on ? 0 : -1}
            data-section={key} onClick={() => onChange(key)} onKeyDown={onKey}
            className={`group flex min-w-0 items-start gap-3 rounded-2xl border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-a-accent sm:p-3.5 ${on ? 'border-a-accent bg-a-accent/10 shadow-a-sm' : 'border-a-border bg-a-surface hover:border-a-text-2/40'}`}>
            <span aria-hidden className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${TONE_CHIP[tone]}`}><Icon size={17} /></span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className={`truncate text-sm font-semibold ${on ? 'text-a-text' : 'text-a-text'}`}>{title}</span>
                {badge !== undefined && badge !== null && badge !== 0 && (
                  <span className="ml-auto shrink-0 rounded-full bg-a-accent px-1.5 text-center text-xs font-semibold leading-5 text-a-accent-ink">{badge}</span>
                )}
              </span>
              {caption && !compact && <span className="mt-0.5 line-clamp-2 block text-xs text-a-text-2">{caption}</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}
