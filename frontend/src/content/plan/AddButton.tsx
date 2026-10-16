import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { formatDate } from '../../workspace/lib/wallClock'
import type { DateKey } from '../lib/types'
import { PopMenu } from '../ui/PopMenu'
import { addChoices, type AddChoice } from './addMath'

/** Each choice's English name, the fallback under the bundles' words. */
const CHOICE_TEXT: Record<AddChoice, string> = { post: 'New post', template: 'From a template…', note: 'Note', event: 'Event' }

/**
 * A day's "+" (spec 2026-10-16 §3.5): a small menu — New post · From a template… (when the brand has templates) · Note ·
 * Event — named by its day. Shown on hover where the device hovers, always on touch, and while its menu is open.
 */
export function AddButton({ day, locale, onAdd, templates = false, align = 'left', side = 'below', className = '' }: {
  day: DateKey
  locale: string
  onAdd: (day: DateKey, choice: AddChoice) => void
  templates?: boolean
  align?: 'left' | 'right'
  /** Above where a menu below would leave the calendar's scroll box (the foot of a week day, the month's last weeks). */
  side?: 'below' | 'above'
  className?: string
}) {
  const { t } = useTranslation()
  const name = t('content.plan.add_menu', 'Add to {{day}}', { day: formatDate(day, locale, { weekday: 'long', day: 'numeric', month: 'long' }) })
  return (
    <PopMenu label={name} title={name} data={{ 'data-add': day }} align={align} side={side} wrapClassName={className} listClassName="w-48"
      items={addChoices(templates).map(choice => ({ id: choice, label: t(`content.plan.add.${choice}`, CHOICE_TEXT[choice]) }))}
      onPick={(id) => onAdd(day, id as AddChoice)}
      className="inline-flex items-center justify-center rounded-md border border-dashed border-a-border px-2 py-1 text-a-text-2 transition-opacity hover:border-a-accent-text hover:text-a-accent-text focus-visible:opacity-100 aria-expanded:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100">
      <Plus size={14} aria-hidden />
    </PopMenu>
  )
}
