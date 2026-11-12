import type { KeyboardEvent } from 'react'
import type { LucideIcon } from 'lucide-react'
import type { Tone } from '../ui/tones'
import { TONE_INK } from './icons'

/**
 * Round 5 (owner 2026-11-12, "minimize copy, more icons"): the compact controls of the inbox's and Visitors' one header
 * row — a segmented filter (icons with their counts, the words as tooltips and for a screen reader, beside the icons
 * only where `labels` says), and an icon switch.
 */
export interface Segment<T extends string> {
  key: T
  label: string
  icon: LucideIcon
  count?: number
  /** The count's colour when something waits there (waiting chats, hot leads). */
  tone?: Tone
}

export function Segmented<T extends string>({ label, items, value, onChange, labels = 'never', className = '' }: {
  label: string
  items: Segment<T>[]
  value: T
  onChange: (next: T) => void
  /** Whether the words show beside the icons: never (tooltips only), or from a wide screen up. */
  labels?: 'never' | 'wide'
  className?: string
}) {
  // One group of pressed buttons; the arrow keys move along it.
  const move = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    const buttons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('button')]
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement)
    if (at < 0) return
    e.preventDefault()
    buttons[(at + (e.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length].focus()
  }
  return (
    <div role="group" aria-label={label} onKeyDown={move} data-stop=""
      className={`inline-flex max-w-full shrink-0 items-center gap-0.5 overflow-x-auto rounded-xl border border-a-border bg-a-surface p-0.5 [scrollbar-width:none] ${className}`}>
      {items.map(({ key, label: name, icon: Icon, count, tone }) => {
        const on = key === value
        return (
          <button key={key} type="button" aria-pressed={on} title={name} aria-label={count ? `${name} ${count}` : name} onClick={() => onChange(key)}
            className={`inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-a-accent ${on ? 'bg-a-accent text-a-accent-ink' : 'text-a-text-2 hover:bg-a-surface-2 hover:text-a-text'}`}>
            <Icon size={15} aria-hidden className="shrink-0" />
            {labels === 'wide' && <span aria-hidden className="hidden whitespace-nowrap xl:inline">{name}</span>}
            {count !== undefined && count > 0 && (
              <span aria-hidden className={`text-xs tabular-nums ${on ? 'text-a-accent-ink' : tone ? `font-semibold ${TONE_INK[tone]}` : 'text-a-text-2'}`}>{count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/** A switch shown as its icon (pressed while on), its name the tooltip; a count beside the icon when given. */
export function IconToggle({ on, onChange, icon: Icon, label, count, tone, disabled = false, className = '' }: {
  on: boolean
  onChange: (on: boolean) => void
  icon: LucideIcon
  label: string
  count?: number
  tone?: Tone
  disabled?: boolean
  className?: string
}) {
  return (
    <button type="button" aria-pressed={on} title={label} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      className={`inline-flex h-9 min-w-9 shrink-0 items-center justify-center gap-1 rounded-xl border px-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-a-accent disabled:cursor-not-allowed disabled:opacity-40 ${on ? 'border-a-accent/40 bg-a-accent/12 text-a-accent-text' : 'border-a-border bg-a-surface text-a-text-2 hover:text-a-text'} ${className}`}>
      <Icon size={16} aria-hidden className="shrink-0" />
      {count !== undefined && count > 0 && <span aria-hidden className={`text-xs font-semibold tabular-nums ${on ? '' : tone ? TONE_INK[tone] : ''}`}>{count}</span>}
    </button>
  )
}
