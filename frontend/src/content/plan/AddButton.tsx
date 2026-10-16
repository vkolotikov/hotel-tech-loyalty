import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { formatDate } from '../../workspace/lib/wallClock'
import type { DateKey } from '../lib/types'

/**
 * The "+" that opens a new post on a day (spec 2026-10-15 §4): shown on hover and keyboard focus where the device
 * hovers, always where it cannot (a phone, a tablet). A real button, named by its day. Release 4 turns it into a menu.
 */
export function AddButton({ day, locale, onAdd, className = '' }: { day: DateKey; locale: string; onAdd: (day: DateKey) => void; className?: string }) {
  const { t } = useTranslation()
  const name = t('content.plan.add_on', 'New post on {{day}}', { day: formatDate(day, locale, { weekday: 'long', day: 'numeric', month: 'long' }) })
  return (
    <button type="button" data-add={day} aria-label={name} title={name} onClick={() => onAdd(day)}
      className={`inline-flex items-center justify-center rounded-md border border-dashed border-a-border px-2 py-1 text-a-text-2 transition-opacity hover:border-a-accent-text hover:text-a-accent-text focus-visible:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100 ${className}`}>
      <Plus size={14} aria-hidden />
    </button>
  )
}
