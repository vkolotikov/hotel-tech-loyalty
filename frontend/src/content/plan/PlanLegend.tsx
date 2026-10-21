import { useTranslation } from 'react-i18next'
import { PencilLine, Sparkles } from 'lucide-react'

/** Under the calendar (spec 2026-10-21 §6.6): what Draft and Key date look like, and — while no post is open — how to open one. */
export function PlanLegend({ open }: { open: boolean }) {
  const { t } = useTranslation()
  return (
    <div data-legend="" className="flex flex-wrap items-center gap-x-5 gap-y-1 px-1 text-xs text-a-text-2">
      <span className="inline-flex items-center gap-1.5"><PencilLine size={12} aria-hidden />{t('content.plan.legend_draft', 'Draft')}</span>
      <span className="inline-flex items-center gap-1.5"><Sparkles size={12} aria-hidden className="c-ai-text" />{t('content.plan.legend_keydate', 'Key date')}</span>
      {!open && <span className="ml-auto">{t('content.plan.select_post', 'Select a post to review its details')}</span>}
    </div>
  )
}
