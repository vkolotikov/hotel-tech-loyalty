import { useTranslation } from 'react-i18next'
import type { PlanFigures } from '../lib/types'

/** Each tile rises a moment after the one before it (written whole, so Tailwind sees the class). */
const DELAYS = ['', '[animation-delay:60ms]', '[animation-delay:120ms]', '[animation-delay:180ms]']

/** The This week strip (spec §4.2): planned, ready, published and empty slots for the week shown; a dash until known. */
export function WeekStrip({ figures, pending }: { figures: PlanFigures | undefined; pending: boolean }) {
  const { t } = useTranslation()
  const tiles = [
    { key: 'planned', title: t('content.plan.strip.planned', 'Planned'), value: figures?.planned },
    { key: 'ready', title: t('content.plan.strip.ready', 'Ready'), value: figures?.ready },
    { key: 'published', title: t('content.plan.strip.published', 'Published'), value: figures?.published },
    { key: 'open', title: t('content.plan.strip.open', 'Empty slots'), value: figures?.open_slots },
  ]
  return (
    <section aria-label={t('content.plan.strip.title', 'This week')} className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {tiles.map((tile, i) => (
        <div key={tile.key} data-figure={tile.key} className={`min-w-0 rounded-xl border border-a-border bg-a-surface px-4 py-3 shadow-a-sm animate-a-rise ${DELAYS[i]}`}>
          <h2 className="font-a-mono text-xs font-medium uppercase tracking-[0.12em] text-a-text-2">{tile.title}</h2>
          <p className="font-a-display text-3xl font-light leading-tight tabular-nums text-a-text">{pending || tile.value === undefined ? '–' : tile.value}</p>
        </div>
      ))}
    </section>
  )
}
