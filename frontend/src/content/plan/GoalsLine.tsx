import { useTranslation } from 'react-i18next'
import { CheckCircle2, Flame } from 'lucide-react'
import type { Goals } from '../lib/types'
import { PlatformMark } from '../ui/PlatformMark'
import { goalMet } from './goalsMath'

/**
 * This week's posting goals (spec 2026-10-15 §7), under the This week strip: per platform "2 of 3 published · 1
 * planned"; a met goal says so in words, not colour alone; the streak, and from Friday how many more posts keep it.
 * Only posts marked published count, and the line says so.
 */
export function GoalsLine({ goals }: { goals: Goals }) {
  const { t } = useTranslation()
  const { streak } = goals
  return (
    <section aria-label={t('content.plan.goals.title', 'Posting goals')} className="flex flex-wrap items-center gap-2 text-sm">
      {goals.platforms.map(g => {
        const met = goalMet(g)
        const platform = t(`content.platform.${g.platform}`, g.platform)
        return (
          <span key={g.platform} data-goal={g.platform} data-met={met ? 'true' : 'false'}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-a-text ${met ? 'border-a-accent-text bg-a-accent/10' : 'border-a-border'}`}>
            <PlatformMark platform={g.platform} size="sm" />
            <span>{t('content.plan.goals.line', '{{platform}}: {{published}} of {{target}} published · {{planned}} planned', { platform, published: g.published, target: g.target, planned: g.planned })}</span>
            {met && <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-a-accent-text"><CheckCircle2 size={12} aria-hidden />{t('content.plan.goals.met', 'met')}</span>}
          </span>
        )
      })}
      {streak.weeks > 0 && (
        <span data-streak="" className="inline-flex items-center gap-1 rounded-full bg-a-surface-2 px-2.5 py-1 font-medium text-a-text">
          <Flame size={14} aria-hidden />{t('content.plan.goals.streak', '{{count}}-week streak', { count: streak.weeks })}
        </span>
      )}
      {streak.at_risk && (
        <span role="status" className="font-medium text-a-text">{t('content.plan.goals.at_risk', 'Posts still needed by Sunday to keep your {{weeks}}-week streak: {{count}}', { count: streak.short_by, weeks: streak.weeks })}</span>
      )}
      <span className="w-full text-xs text-a-text-2">{t('content.plan.goals.hint', 'Only posts marked published count.')}</span>
    </section>
  )
}
