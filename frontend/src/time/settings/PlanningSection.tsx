import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Check, Eye, User, Users, type LucideIcon } from 'lucide-react'
import { useBoot } from '../TimeProvider'
import { errorText } from '../lib/errors'
import { useRefresh } from '../lib/queries'
import { plannerApi } from '../lib/tasks'
import { Card } from '../ui/Card'
import { useToast } from '../ui/Toast'
import { PLANNING_MODES, planningModeOf, type PlanningModeKey } from './settingsLogic'

/**
 * Who plans whose day (owner 2026-11-09: "for some companies all team can add to others, in some companies only each user
 * can plan their day"): one of two options, `planner_planning_mode`, saved as soon as a manager picks it. The server
 * keeps the rule for the full admin's Planner and this workspace alike (PlanningMode); this only shows and saves it.
 */
export function PlanningSection({ can }: { can: boolean }) {
  const { t } = useTranslation()
  const boot = useBoot()
  const toast = useToast()
  const refresh = useRefresh()
  const current = planningModeOf(boot.settings.planning_mode)

  const save = useMutation({
    mutationFn: (mode: PlanningModeKey) => plannerApi.saveSetting('planner_planning_mode', mode),
    onSuccess: () => { refresh(); toast(t('time.common.saved', 'Saved')) },
    onError: error => { refresh(); toast(errorText(t, error), 'danger') },
  })

  const options: Record<PlanningModeKey, { icon: LucideIcon; title: string; line: string; points: string[] }> = {
    team: {
      icon: Users,
      title: t('time.settings.planning.team_title', 'The whole team plans together'),
      line: t('time.settings.planning.team_line', 'Anyone can add a task to a colleague’s day, hand work over and plan the team’s day.'),
      points: [
        t('time.settings.planning.team_1', 'Assign, move and finish anyone’s tasks'),
        t('time.settings.planning.team_2', 'Plan a colleague’s or the whole team’s day with AI'),
      ],
    },
    own: {
      icon: User,
      title: t('time.settings.planning.own_title', 'Each person plans their own day'),
      line: t('time.settings.planning.own_line', 'Everyone adds, moves and finishes only their own tasks, and takes work from the open pool.'),
      points: [
        t('time.settings.planning.own_1', 'A colleague’s task opens read-only; it can be copied to one’s own day'),
        t('time.settings.planning.own_2', 'Managers still plan for anyone'),
      ],
    },
  }

  return (
    <Card title={t('time.settings.planning.title', 'Who plans whose day')} icon={Users}
      description={t('time.settings.planning.line', 'Choose how your team works. The same rule holds in the full admin’s Planner.')}>
      <div role="radiogroup" aria-label={t('time.settings.planning.title', 'Who plans whose day')} className="grid gap-3 md:grid-cols-2">
        {PLANNING_MODES.map(mode => {
          const option = options[mode]
          const on = current === mode
          const Icon = option.icon
          return (
            <button key={mode} type="button" role="radio" aria-checked={on} disabled={!can || save.isPending}
              onClick={() => { if (!on) save.mutate(mode) }}
              className={`flex min-w-0 flex-col gap-3 rounded-2xl border p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-a-accent disabled:cursor-default ${on ? 'border-a-accent bg-a-accent/12' : 'border-a-border bg-a-surface hover:border-a-text-2/40'}`}>
              <span className="flex items-start gap-3">
                <span aria-hidden className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${on ? 'bg-a-accent text-a-accent-ink' : 'bg-a-surface-2 text-a-text-2'}`}><Icon size={18} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-a-text">{option.title}</span>
                  <span className="mt-0.5 block text-sm text-a-text-2">{option.line}</span>
                </span>
                {on && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-a-accent px-2 py-0.5 text-xs font-semibold text-a-accent-ink"><Check size={12} aria-hidden />{t('time.settings.planning.chosen', 'In use')}</span>}
              </span>
              <ul className="space-y-1 pl-13">
                {option.points.map(point => (
                  <li key={point} className="flex gap-2 text-xs text-a-text-2"><Check size={13} aria-hidden className="mt-0.5 shrink-0 text-a-st-confirmed" />{point}</li>
                ))}
              </ul>
            </button>
          )
        })}
      </div>
      <p className="mt-4 flex items-start gap-2 text-sm text-a-text-2">
        <Eye size={15} aria-hidden className="mt-0.5 shrink-0" />
        {t('time.settings.planning.seen', 'Either way everyone sees the whole team’s days, and only a manager changes this setting.')}
      </p>
    </Card>
  )
}
