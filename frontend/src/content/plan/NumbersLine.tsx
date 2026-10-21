import { useTranslation } from 'react-i18next'
import type { PlanFigures } from '../lib/types'

/** The period's numbers under the Plan's title (spec 2026-10-21 §6.1): planned, ready, published and empty slots; a dash until known. */
export function NumbersLine({ figures, pending }: { figures: PlanFigures | undefined; pending: boolean }) {
  const { t } = useTranslation()
  const known = !pending && figures !== undefined
  const n = (value: number | undefined) => (known && value !== undefined ? String(value) : '–')
  return (
    <p data-numbers="" className="text-sm tabular-nums text-a-text-2">
      {t('content.plan.numbers', 'Planned: {{planned}} · Ready: {{ready}} · Published: {{published}} · Empty slots: {{open}}', {
        planned: n(figures?.planned), ready: n(figures?.ready), published: n(figures?.published), open: n(figures?.open_slots),
      })}
    </p>
  )
}
