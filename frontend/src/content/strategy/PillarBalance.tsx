import { useTranslation } from 'react-i18next'
import type { PillarBalance as Balance } from '../lib/types'
import { balanceRows } from './strategyMath'

/** This month's posts per pillar against the pillars' target weights (spec §4.5; the old Dashboard's balance). */
export function PillarBalance({ balance }: { balance: Balance }) {
  const { t } = useTranslation()
  const rows = balanceRows(balance)
  const any = rows.some(r => r.posts > 0)
  return (
    <section aria-labelledby="content-balance" className="space-y-3 rounded-xl border border-a-border bg-a-surface p-4">
      <h2 id="content-balance" className="font-a-display text-lg font-normal text-a-text">{t('content.strategy.balance', 'Pillar balance this month')}</h2>
      {!any && <p className="text-sm text-a-text-2">{t('content.strategy.balance_empty', 'No post of this month has a pillar yet.')}</p>}
      <ul className="space-y-3">
        {rows.map(row => (
          <li key={row.id} className="space-y-1">
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span className="font-medium text-a-text">{row.name}</span>
              <span className="text-xs text-a-text-2">
                {t('content.strategy.balance_line', '{{posts}} posts · {{actual}} % of posts · target {{target}} %', { posts: row.posts, actual: row.actual, target: row.target })}
              </span>
            </div>
            <div className="relative h-2 rounded-full bg-a-surface-2" aria-hidden>
              <div className="h-2 rounded-full bg-a-accent" style={{ width: `${row.actual}%` }} />
              <div className="absolute -top-1 h-4 w-0.5 rounded bg-a-text" style={{ left: `${row.target}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
