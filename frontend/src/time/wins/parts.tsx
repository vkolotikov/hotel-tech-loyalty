import { useTranslation } from 'react-i18next'
import { AlarmClockCheck, Award, CalendarCheck, Check, CheckCheck, Crown, Flame, Medal as MedalIcon, Rocket, Star, Target, Timer, Zap, type LucideIcon } from 'lucide-react'
import { dayLabel, weekdayName } from '../lib/format'
import type { RecognitionDay } from '../lib/types'
import { dotOf, type DotState } from './winsLogic'

/**
 * The pieces recognition's screens share (2026-11-28): a badge's medal, the streak's flame, the week as seven dots, a
 * place's mark. Their look is theme/time.css's recognition block (gold for what was earned).
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
