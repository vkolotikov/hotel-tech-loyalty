import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import type { GenerateRun } from '../lib/types'
import { isRunning } from './generateRun'

/** The Plan's line while a Generate run writes on the queue worker (2026-10-20); nothing otherwise. */
export function GeneratingLine({ run }: { run: GenerateRun | undefined }) {
  const { t } = useTranslation()
  if (!isRunning(run)) return null
  return (
    <p role="status" className="flex items-center gap-2 text-sm text-a-text-2">
      <Loader2 size={14} aria-hidden className="motion-safe:animate-spin" />
      {t('content.plan.generating', 'The AI is writing posts…')}
    </p>
  )
}
