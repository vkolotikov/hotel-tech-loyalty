import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Check, EyeOff, Medal, Minus, Plus, Smile, Target, Trophy, User, type LucideIcon } from 'lucide-react'
import { useBoot } from '../TimeProvider'
import { errorText } from '../lib/errors'
import { useRefresh } from '../lib/queries'
import { plannerApi } from '../lib/tasks'
import type { RecognitionMode } from '../lib/types'
import { Card } from '../ui/Card'
import { Toggle } from '../ui/inputs'
import { useToast } from '../ui/Toast'
import { Buddy } from '../wins/Buddy'
import { BUDDY_KINDS } from '../wins/buddyLogic'
import { GOAL_MAX, GOAL_MIN, MODES, modeOf } from '../wins/winsLogic'
import { MODE_WORDS } from '../wins/words'

const MODE_ICON: Record<RecognitionMode, LucideIcon> = { ranking: Trophy, podium: Medal, own: User, off: EyeOff }

/**
 * Recognition (2026-11-28, the owner: "animated stimulus to employees … a week rating system"): who sees the week's
 * ranking — everyone, the top three and one's own place (where nobody chose), only one's own points, or nobody (off) —
 * and how many finished tasks make the daily goal. Both are the server's settings (`planner_recognition`, `planner_daily_goal`,
 * App\Services\Time\Recognition), saved as soon as a manager picks; how points are earned is the server's and is
 * shown on Achievements. And whether the organisation shows characters at all (`planner_buddies`, Buddies): which one
 * is each person's own choice, on Achievements.
 */
export function RecognitionSection({ can }: { can: boolean }) {
  const { t } = useTranslation()
  const boot = useBoot()
  const toast = useToast()
  const refresh = useRefresh()
  const current = modeOf(boot.settings.recognition)
  const saved = boot.settings.daily_goal ?? 3
  // The goal just sent stays on screen until the reloaded settings say the same (no flash of the old figure).
  const [sent, setSent] = useState<number | null>(null)
  if (sent !== null && sent === saved) setSent(null)
  const goal = sent ?? saved

  const save = useMutation({
    mutationFn: ({ key, value }: { key: 'planner_recognition' | 'planner_daily_goal' | 'planner_buddies'; value: string | number }) => plannerApi.saveSetting(key, value),
    onSuccess: () => { refresh(); toast(t('time.common.saved', 'Saved')) },
    onError: error => { setSent(null); refresh(); toast(errorText(t, error), 'danger') },
  })
  const setGoal = (next: number) => { setSent(next); save.mutate({ key: 'planner_daily_goal', value: next }) }
  // Characters are shown where the server says so (on unless a manager switched them off).
  const buddies = boot.settings.buddies === true
  const off = !can || save.isPending
  const step = 'grid h-10 w-10 shrink-0 place-items-center rounded-full border border-a-border bg-a-surface text-a-text hover:bg-a-surface-2 disabled:pointer-events-none disabled:opacity-40'

  return (
    <div className="space-y-4">
      <Card title={t('time.settings.recognition.title', 'Who sees the week’s ranking')} icon={Trophy} tone="gold"
        description={t('time.settings.recognition.line', 'Points and badges are each person’s own. Choose how much of the comparison your team sees.')}>
        <div role="radiogroup" aria-label={t('time.settings.recognition.title', 'Who sees the week’s ranking')} className="grid gap-3 md:grid-cols-2">
          {MODES.map(mode => {
            const on = current === mode
            const Icon = MODE_ICON[mode]
            return (
              <button key={mode} type="button" role="radio" aria-checked={on} disabled={off} data-mode={mode}
                onClick={() => { if (!on) save.mutate({ key: 'planner_recognition', value: mode }) }}
                className={`flex min-w-0 items-start gap-3 rounded-2xl border p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-a-accent disabled:cursor-default ${on ? 'border-a-accent bg-a-accent/12' : 'border-a-border bg-a-surface hover:border-a-text-2/40'}`}>
                <span aria-hidden className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${on ? 'bg-a-accent text-a-accent-ink' : 'bg-a-surface-2 text-a-text-2'}`}><Icon size={18} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-a-text">{t(`time.settings.recognition.mode.${mode}`, MODE_WORDS[mode].title)}</span>
                  <span className="mt-0.5 block text-sm text-a-text-2">{t(`time.settings.recognition.mode_line.${mode}`, MODE_WORDS[mode].line)}</span>
                </span>
                {on && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-a-accent px-2 py-0.5 text-xs font-semibold text-a-accent-ink"><Check size={12} aria-hidden />{t('time.settings.planning.chosen', 'In use')}</span>}
              </button>
            )
          })}
        </div>
        <p className="mt-4 text-sm text-a-text-2">
          {t('time.settings.recognition.note', 'Only finished work is counted and shown; nobody’s late or unfinished tasks appear anywhere. A manager always sees the whole ranking.')}
        </p>
      </Card>

      {current !== 'off' && (
        <Card title={t('time.settings.recognition.goal_title', 'The daily goal')} icon={Target} tone="gold"
          description={t('time.settings.recognition.goal_line', 'How many finished tasks of a day reach the goal.')}>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2" role="group" aria-label={t('time.settings.recognition.goal_title', 'The daily goal')}>
              <button type="button" className={step} disabled={off || goal <= GOAL_MIN} onClick={() => setGoal(goal - 1)}
                aria-label={t('time.settings.recognition.goal_less', 'One task fewer')}><Minus size={16} aria-hidden /></button>
              <output aria-live="polite" className="min-w-14 text-center font-a-display text-4xl leading-none text-a-text">{goal}</output>
              <button type="button" className={step} disabled={off || goal >= GOAL_MAX} onClick={() => setGoal(goal + 1)}
                aria-label={t('time.settings.recognition.goal_more', 'One task more')}><Plus size={16} aria-hidden /></button>
            </div>
            <p className="min-w-0 flex-1 basis-64 text-sm text-a-text-2">
              {t('time.settings.recognition.goal_note', 'A day of few long tasks also reaches it when everything planned is finished on a well-filled day. The streak counts the days in a row with the goal reached.')}
            </p>
          </div>
          <p className="mt-4 text-sm">
            <Link to="/time/wins" className="font-semibold text-a-accent-text">{t('time.settings.recognition.see_rules', 'See how points are earned')}</Link>
          </p>
        </Card>
      )}

      {current !== 'off' && (
        <Card title={t('time.settings.recognition.buddies_title', 'Animated characters')} icon={Smile} tone="gold"
          description={t('time.settings.recognition.buddies_line', 'Each person picks a character that reacts to their day and stands beside their name.')}>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
            <div className="min-w-0 flex-1 basis-72">
              <Toggle checked={buddies} disabled={off} onChange={on => save.mutate({ key: 'planner_buddies', value: on ? 'on' : 'off' })}
                label={t('time.settings.recognition.buddies_toggle', 'Show the characters')}
                hint={t('time.settings.recognition.buddies_hint', 'Switched off, nobody is shown a character and nobody is offered one. Points and badges stay as they are.')} />
            </div>
            <div aria-hidden data-buddies={buddies ? 'on' : 'off'} className={`flex items-end gap-1 ${buddies ? '' : 'opacity-40'}`}>
              {BUDDY_KINDS.map(kind => <Buddy key={kind} kind={kind} mood="ready" still size={52} />)}
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
