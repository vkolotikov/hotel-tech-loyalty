import { useTranslation } from 'react-i18next'
import { Loader2, PenLine, Sparkles } from 'lucide-react'
import type { Slot } from '../lib/types'
import { PlatformMark } from '../ui/PlatformMark'
import { slotKey } from './planMath'

/** An empty slot (spec §4.2): a day and platform the brand's channels expect, with Write and Fill with AI. */
export function SlotRow({ slot, filling, aiPaused, onWrite, onFill }: {
  slot: Slot
  filling: boolean
  /** This month's AI budget is used up: Fill waits, Write still works. */
  aiPaused: boolean
  onWrite: () => void
  onFill: () => void
}) {
  const { t } = useTranslation()
  const platform = t(`content.platform.${slot.platform}`, slot.platform)
  return (
    <div role="group" aria-label={t('content.plan.slot.label', 'Empty {{platform}} slot', { platform })} data-slot={slotKey(slot)}
      className="flex flex-wrap items-center gap-1 rounded-lg border border-dashed border-a-border bg-a-canvas/60 px-2 py-1.5">
      <PlatformMark platform={slot.platform} size="sm" />
      <button type="button" onClick={onWrite}
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-a-accent-text hover:bg-a-surface-2">
        <PenLine size={12} aria-hidden />{t('content.plan.slot.write', 'Write')}
      </button>
      <button type="button" onClick={onFill} disabled={filling || aiPaused}
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-a-text-2 hover:bg-a-surface-2 hover:text-a-text disabled:opacity-50">
        {filling ? <Loader2 size={12} aria-hidden className="animate-spin" /> : <Sparkles size={12} aria-hidden />}
        {filling ? t('content.plan.slot.filling', 'Writing…') : t('content.plan.slot.fill', 'Fill with AI')}
      </button>
    </div>
  )
}
