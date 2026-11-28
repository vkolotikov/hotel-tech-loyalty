import { useTranslation } from 'react-i18next'
import { AlarmClockCheck, Award, CalendarCheck, Check, CheckCheck, Crown, Flame, Medal as MedalIcon, Rocket, Star, Target, Timer, Zap, type LucideIcon } from 'lucide-react'
import { dayLabel, weekdayName } from '../lib/format'
import type { Recognition, RecognitionDay, RecognitionMe } from '../lib/types'
import { Ring } from '../ui/motion'
import { Buddy } from './Buddy'
import { buddiesOn, buddyOf, crowned, moodOf } from './buddyLogic'
import { dotOf, goalPct, type DotState } from './winsLogic'

/**
 * The pieces recognition's screens share (2026-11-28): a badge's medal, the streak's flame, the week as seven dots, a
 * place's mark, and the daily goal's ring — with the person's character inside it when they have one. Their look is
 * theme/time.css's recognition block (gold for what was earned).
 */

const BADGE_ICONS: Record<string, LucideIcon> = {
  priority_hero: Zap,
  goal_getter: Target,
  clean_sweep: CheckCheck,
  well_planned: CalendarCheck,
  on_time: AlarmClockCheck,
  timekeeper: Timer,
  streak_3: Flame,
  streak_7: Rocket,
  podium: MedalIcon,
  champion: Crown,
}

const MEDAL = { sm: 'h-9 w-9', md: 'h-12 w-12', lg: 'h-16 w-16' } as const
const MEDAL_ICON = { sm: 16, md: 22, lg: 30 } as const

/** A badge's medal: gold with a light passing over it once earned, the surface's grey until then. Decoration only. */
export function Medal({ code, earned, size = 'md', icon }: { code?: string; earned: boolean; size?: keyof typeof MEDAL; icon?: LucideIcon }) {
  const Icon = icon ?? BADGE_ICONS[code ?? ''] ?? Award
  return <span aria-hidden data-earned={earned ? 'true' : 'false'} className={`time-medal shrink-0 ${MEDAL[size]}`}><Icon size={MEDAL_ICON[size]} /></span>
}

/** Days in a row with the daily goal met: a flame that flickers from the second day on. Nothing at none. */
export function StreakChip({ streak }: { streak: number }) {
  const { t } = useTranslation()
  if (streak < 1) return null
  return (
    <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold time-gold-soft">
      <Flame size={14} aria-hidden className={streak >= 2 ? 'time-flicker' : ''} />
      {t('time.wins.streak', '{{count}} days in a row', { count: streak })}
    </span>
  )
}

const PLACE_FILL: Record<number, string> = { 1: 'time-gold-fill', 2: 'time-silver-fill', 3: 'time-bronze-fill' }

/** A place in the ranking: gold, silver and bronze for the first three. Decoration: the row says the place in words. */
export function PlaceMark({ rank, size = 'md' }: { rank: number | null; size?: 'md' | 'lg' }) {
  const box = size === 'lg' ? 'h-9 w-9 text-sm' : 'h-7 w-7 text-xs'
  const fill = rank !== null && PLACE_FILL[rank] ? PLACE_FILL[rank] : 'bg-a-surface-2 text-a-text-2'
  return <span aria-hidden className={`grid shrink-0 place-items-center rounded-full font-bold ${box} ${fill}`}>{rank ?? '·'}</span>
}

const DOT: Record<DotState, string> = {
  sweep: 'time-gold-fill',
  goal: 'time-gold-fill',
  open: 'border border-a-border bg-a-surface text-a-text',
  empty: 'bg-a-surface-2 text-a-text-2',
  future: 'border border-dashed border-a-border text-a-text-2',
}

/** The week as seven dots, Monday first: a star for a day with everything done, a tick for the goal, today ringed. */
export function WeekDots({ days, today }: { days: readonly RecognitionDay[]; today: string | undefined }) {
  const { t, i18n } = useTranslation()
  const words: Record<DotState, string> = {
    sweep: t('time.wins.dot.sweep', 'everything done'),
    goal: t('time.wins.dot.goal', 'goal reached'),
    open: t('time.wins.dot.open', 'goal not reached'),
    empty: t('time.wins.dot.empty', 'no tasks'),
    future: t('time.wins.dot.future', 'still to come'),
  }
  return (
    <ol className="flex items-center gap-1.5" aria-label={t('time.wins.week_days', 'This week, day by day')}>
      {days.map((day, i) => {
        const state = dotOf(day)
        const label = `${dayLabel(day.date, i18n.language)}: ${words[state]}`
        return (
          <li key={day.date} title={label} aria-label={label}
            className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold ${DOT[state]} ${day.date === today ? 'ring-2 ring-a-accent ring-offset-2 ring-offset-a-surface' : ''}`}>
            {state === 'sweep' ? <Star size={13} aria-hidden /> : state === 'goal' ? <Check size={13} aria-hidden /> : <span aria-hidden>{weekdayName(i + 1, i18n.language).slice(0, 2)}</span>}
          </li>
        )
      })}
    </ol>
  )
}

const GOAL_RING = {
  band: { plain: 64, buddy: 80, stroke: 7, figure: 60, mark: 23 },
  hero: { plain: 104, buddy: 136, stroke: 10, figure: 104, mark: 31 },
} as const

/**
 * The daily goal as a ring, on My day's band and on Achievements. With a character (Buddies) it stands inside the ring
 * in the mood of the day — the week's leader crowned — and the count sits on a pill under it; without one the ring
 * holds the count itself (a tick once the goal is met, a star for a clean sweep).
 */
export function GoalRing({ data, me, at }: { data: Recognition; me: RecognitionMe; at: keyof typeof GOAL_RING }) {
  const { t } = useTranslation()
  const today = me.today
  const size = GOAL_RING[at]
  const kind = buddiesOn(data) ? buddyOf(me.buddy) : null
  const tone = today.goal_met ? 'gold' : 'accent'
  const label = t('time.wins.band.ring', 'Daily goal: {{done}} of {{goal}} tasks done', { done: today.done, goal: today.goal })

  if (kind) {
    return (
      <span className="relative inline-block shrink-0" data-buddy-ring={kind}>
        <Ring value={goalPct(today)} size={size.buddy} stroke={size.stroke} tone={tone} label={label}>
          <Buddy kind={kind} mood={moodOf(today)} crown={crowned(me.week)} size={size.figure} />
        </Ring>
        <span aria-hidden className={`absolute -bottom-2 left-1/2 inline-flex min-w-9 -translate-x-1/2 items-center justify-center gap-0.5 whitespace-nowrap rounded-full border px-1.5 text-xs font-bold leading-5 ${today.goal_met ? 'border-transparent time-gold-fill' : 'border-a-border bg-a-surface text-a-text'}`}>
          {today.sweep ? <Star size={12} /> : today.goal_met ? <Check size={12} /> : null}
          {today.goal_met ? today.done : `${today.done}/${today.goal}`}
        </span>
      </span>
    )
  }

  // Under way it counts; met, a tick says so (more may be done than the goal names); a star for a clean sweep.
  const mark = today.sweep ? <Star size={size.mark - 1} className="time-gold-text time-pop" />
    : today.goal_met ? <Check size={size.mark + 1} className="time-gold-text time-pop" /> : null
  return (
    <Ring value={goalPct(today)} size={size.plain} stroke={size.stroke} tone={tone} label={label}>
      {at === 'hero' ? (
        <span className="grid justify-items-center text-center">
          {mark ?? <span className="block font-a-display text-2xl leading-none text-a-text">{today.done}/{today.goal}</span>}
          <span className="mt-0.5 block text-xs text-a-text-2">{t('time.wins.today', 'today')}</span>
        </span>
      ) : (mark ?? <span className="text-sm font-bold text-a-text">{today.done}/{today.goal}</span>)}
    </Ring>
  )
}
