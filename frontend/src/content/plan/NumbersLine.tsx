import { useTranslation } from 'react-i18next'
import type { PlanFigures } from '../lib/types'

const metrics = ['planned', 'ready', 'published', 'open_slots'] as const
const labels = { planned: 'Planned', ready: 'Ready', published: 'Published', open_slots: 'Empty slots' }

/** Labels and values have separate tracks: a late count cannot wrap its label onto another line. */
export function NumbersLine({ figures, pending }: { figures: PlanFigures | undefined; pending: boolean }) {
  const { t } = useTranslation()
  const known = !pending && figures !== undefined
  const n = (value: number | undefined) => (known && value !== undefined ? String(value) : '–')
  return (
    <dl data-numbers="" className="c-plan-numbers text-sm tabular-nums text-a-text-2">
      {metrics.map(metric => <div key={metric}>
        <dt>{t(`content.plan.number_labels.${metric}`, labels[metric])}</dt>
        <dd>{n(figures?.[metric])}</dd>
      </div>)}
    </dl>
  )
}
