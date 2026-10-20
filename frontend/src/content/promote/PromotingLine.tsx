import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import type { PromotionRun } from '../lib/types'
import { isPromoting } from './promoteMath'

/** The Plan's line while a promotion writes on the queue worker (spec 2026-10-20 §5); nothing otherwise. */
export function PromotingLine({ run }: { run: PromotionRun | undefined }) {
  const { t } = useTranslation()
  if (!isPromoting(run)) return null
  return (
    <p role="status" className="flex items-center gap-2 text-sm text-a-text-2">
      <Loader2 size={14} aria-hidden className="motion-safe:animate-spin" />
      {t('content.plan.promoting', 'The AI is writing promotion posts…')}
    </p>
  )
}
