import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowRight, CalendarCheck, Check, Star, Trophy } from 'lucide-react'
import { useRecognition } from '../lib/queries'
import type { Recognition } from '../lib/types'
import { Ring } from '../ui/motion'
import { StreakChip, WeekDots } from './parts'
import { goalPct, nextStep } from './winsLogic'

/**
 * My day's band of progress (2026-11-28, the owner: "so they are interested to fill and do tasks"): the daily goal as
 * a ring, what earns the next points, today's and the week's points, the streak, how full the calendar is, the week
 * day by day and the way to Achievements. Every figure is the server's (time/recognition); nothing shows when the
 * organisation switched recognition off or the person is not on the team list.
 */
export function ProgressBand() {
  const { data } = useRecognition()
  return data?.me ? <ProgressBandView data={data} /> : null
}

export function ProgressBandView({ data }: { data: Recognition }) {
  const { t } = useTranslation()
  const me = data.me
  if (!me) return null
  const today = me.today
  const step = nextStep(today)
  const share = data.rules?.planned_share ?? 60
  const headline = step.code === 'plan' ? t('time.wins.band.plan', 'Plan your day to start earning points')
    : step.code === 'goal' ? t('time.wins.band.goal_left', '{{count}} more tasks to reach today’s goal', { count: step.left })
      : step.code === 'sweep' ? t('time.wins.band.sweep_left', 'Finish the last {{count}} tasks for a clean sweep', { count: step.left })
        : t('time.wins.band.done', 'Everything planned is done. Great work!')
  const chip = 'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold'

  return (
    <section aria-label={t('time.wins.band.title', 'My progress')} data-goal-met={today.goal_met ? 'true' : 'false'}
      className={`flex flex-wrap items-center gap-x-5 gap-y-3 rounded-2xl border p-4 shadow-a-sm ${today.goal_met ? 'time-gold-border time-gold-wash' : 'border-a-border bg-a-surface'}`}>
      <div className="flex min-w-0 flex-1 basis-72 items-center gap-3.5">
        <Ring value={goalPct(today)} size={64} stroke={7} tone={today.goal_met ? 'gold' : 'accent'}
          label={t('time.wins.band.ring', 'Daily goal: {{done}} of {{goal}} tasks done', { done: today.done, goal: today.goal })}>
          {/* Under way it counts; met, a tick says so (more may be done than the goal names); a star for a clean sweep. */}
          {today.sweep ? <Star size={22} className="time-gold-text time-pop" />
            : today.goal_met ? <Check size={24} className="time-gold-text time-pop" />
              : <span className="text-sm font-bold text-a-text">{today.done}/{today.goal}</span>}
        </Ring>
        <div className="min-w-0">
          <p className={`text-xs font-semibold uppercase tracking-wide ${today.goal_met ? 'time-gold-text' : 'text-a-text-2'}`}>
            {today.goal_met ? t('time.wins.band.goal_met', 'Daily goal reached') : t('time.wins.band.goal', 'Today’s goal')}
          </p>
          <p className="font-a-display text-lg leading-snug text-a-text">{headline}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className={`${chip} time-gold-soft`}>
          <Star size={14} aria-hidden />{t('time.wins.band.today', 'Today: {{count}} points', { count: today.points })}
        </span>
        <StreakChip streak={me.streak} />
        <span className={`${chip} bg-a-surface-2 text-a-text`}>
          <Trophy size={14} aria-hidden className="time-gold-text" />
          {t('time.wins.band.week', 'This week: {{count}} points', { count: me.week.points })}
          {me.week.rank !== null && me.week.of !== null && me.week.of > 1 && (
            <span className="text-a-text-2">· {t('time.wins.place', 'Place {{rank}} of {{of}}', { rank: me.week.rank, of: me.week.of })}</span>
          )}
        </span>
        {today.planned_pct !== null && (
          <span className={`${chip} ${today.day_planned ? 'time-gold-soft' : 'bg-a-surface-2 text-a-text-2'}`}
            title={t('time.wins.band.planned_hint', 'Plan at least {{share}} % of your working time for the planning bonus', { share })}>
            <CalendarCheck size={14} aria-hidden />{t('time.wins.band.planned', 'Day planned: {{pct}} %', { pct: today.planned_pct })}
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 basis-64 items-center justify-between gap-3 lg:flex-none lg:basis-auto lg:justify-end lg:gap-5">
        <WeekDots days={me.days} today={data.today} />
        <Link to="/time/wins" className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-sm font-semibold text-a-accent-text">
          {t('time.nav.wins', 'Achievements')}<ArrowRight size={15} aria-hidden />
        </Link>
      </div>
    </section>
  )
}
