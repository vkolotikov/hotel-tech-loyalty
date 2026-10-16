import { useTranslation } from 'react-i18next'
import { CalendarRange, Globe, Landmark, StickyNote, Tag, type LucideIcon } from 'lucide-react'
import { dayLabel, type Words } from '../lib/dayNames'
import type { KeyDate } from '../lib/types'
import { isBuiltIn, keyOf, KIND_TEXT } from './keyDateMath'

const ICONS: Record<KeyDate['kind'], LucideIcon> = { holiday: Landmark, marketing: Tag, industry: Globe, event: CalendarRange, note: StickyNote }

/**
 * A day's key dates as chips above its posts (spec 2026-10-16 §3.4): each kind its own icon; a click opens the day's
 * card (a built-in day) or its editor (an event or a note). Compact (the month view): the first chip and how many more,
 * a button that opens the day's week (`onMore`), so a click on it never reaches the day's empty space.
 */
export function KeyDateChips({ items, observed, compact = false, onPick, onMore }: {
  items: KeyDate[]
  observed: boolean
  compact?: boolean
  onPick: (keyDate: KeyDate) => void
  /** The month view's "+N more": the day's week, where every key date shows. */
  onMore?: () => void
}) {
  const { t } = useTranslation()
  const words: Words = (key, english, vars) => t(key, english, vars)
  const shown = compact ? items.slice(0, 1) : items
  return (
    <div className="flex min-w-0 flex-wrap gap-1">
      {shown.map(k => {
        const Icon = ICONS[k.kind]
        const name = isBuiltIn(k) ? dayLabel(words, k, observed) : k.title
        const kind = t(`content.keydates.kind.${k.kind}`, KIND_TEXT[k.kind])
        return (
          <button key={keyOf(k)} type="button" data-keydate={k.kind} onClick={() => onPick(k)} aria-label={`${kind}: ${name}`} title={name}
            className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-full border border-a-border bg-a-surface-2 px-2 py-0.5 text-xs text-a-text hover:border-a-accent-text">
            <Icon size={12} aria-hidden className="shrink-0 text-a-text-2" />
            <span className="truncate">{name}</span>
          </button>
        )
      })}
      {compact && items.length > 1 && (onMore
        ? <button type="button" onClick={onMore} className="px-1 text-xs text-a-text-2 hover:text-a-text hover:underline">{t('content.plan.more', '+{{count}} more', { count: items.length - 1 })}</button>
        : <span className="px-1 text-xs text-a-text-2">{t('content.plan.more', '+{{count}} more', { count: items.length - 1 })}</span>)}
    </div>
  )
}
