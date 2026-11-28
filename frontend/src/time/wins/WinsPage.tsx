import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Award, Check, Crown, Flame, Lock, Medal as MedalIcon, Settings2, Star, Trophy } from 'lucide-react'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../TimeProvider'
import { dayLabel, firstName, weekdayName } from '../lib/format'
import { barWidth, staggerDelay } from '../lib/motion'
import { useRecognition } from '../lib/queries'
import type { Recognition, RecognitionMe } from '../lib/types'
import { Avatar } from '../ui/Avatar'
import { Card } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'
import { Page } from '../ui/Page'
import { Pill } from '../ui/Pill'
import { QueryState } from '../ui/QueryState'
import { CountUp } from '../ui/motion'
import { Buddy } from './Buddy'
import { BuddyPicker } from './BuddyPicker'
import { buddiesOn, buddyOf, moodOf, podiumBuddy } from './buddyLogic'
import { GoalRing, Medal, PlaceMark, StreakChip } from './parts'
import { useBadgeWords } from './useBadgeWords'
import { badgePct, dayHeights, dotOf, earnedCount, nextStep, podiumOf, rankingView, ruleRows, shareOf, sortBadges, type RuleRow } from './winsLogic'
import { BUDDY_SAYS, RULE_WORDS } from './words'

/**
 * Achievements (2026-11-28, the owner: "badges … a week rating system … so they are interested to fill and do tasks"):
 * my week's points and place, the week day by day, today's goal (with my character and what it says), the choice of a
 * character, the week's ranking with the team's characters on its podium, my badges and how points are earned. Every figure is the server's (time/recognition, App\Services\Time\Recognition); who sees the
 * ranking is the organisation's choice, and the page only shows what the answer holds.
 */
export function WinsPage() {
  const { t } = useTranslation()
  const boot = useBoot()
  const rec = useRecognition()
  const manager = boot.staff.can.manage_settings
  const settings = manager ? (
    <Link to="/time/settings?tab=recognition" className="inline-flex items-center gap-2 rounded-full border border-a-border bg-a-surface px-3 py-1.5 text-sm font-semibold text-a-text hover:bg-a-surface-2">
      <Settings2 size={15} aria-hidden />{t('time.wins.open_settings', 'Recognition settings')}
    </Link>
  ) : undefined

  return (
    <Page title={t('time.nav.wins', 'Achievements')} line={t('time.wins.line', 'Points and badges for planning your day and finishing what you planned.')} actions={settings}>
      {rec.off ? (
        <EmptyState icon={Trophy} title={t('time.wins.off_title', 'Recognition is switched off')}
          line={manager
            ? t('time.wins.off_manager', 'Nobody collects points or badges. You can switch it on in Settings.')
            : t('time.wins.off_line', 'Your organisation does not use points, badges and the ranking.')} />
      ) : (
        <QueryState loading={rec.isLoading} error={rec.error} onRetry={rec.refetch}>
          {rec.data && <WinsView data={rec.data} />}
        </QueryState>
      )}
    </Page>
  )
}

/** The page's body over one answer of the server. */
export function WinsView({ data }: { data: Recognition }) {
  const { t } = useTranslation()
  const me = data.me ?? null
  return (
    <div className="space-y-5">
      {me ? <Hero data={data} me={me} /> : <Notice tone="info">{t('time.wins.not_on_team', 'You are not on the planner’s team list, so you collect no points.')}</Notice>}
      {me && buddiesOn(data) && <BuddyPicker me={me} />}
      {/* Two columns on a wide screen: the ranking over how points are earned, the badges beside them. On a phone the
          left column dissolves (`contents`) and the order is the ranking, the badges, then the rules. */}
      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        <div className="contents lg:block lg:min-w-0 lg:space-y-5">
          <div className="order-1 min-w-0"><RankingCard data={data} /></div>
          <div className="order-3 min-w-0"><RulesCard data={data} /></div>
        </div>
        {me && <div className="order-2 min-w-0"><BadgesCard data={data} me={me} /></div>}
      </div>
    </div>
  )
}

/** My week: the points and the place, the week day by day, and today's goal. */
function Hero({ data, me }: { data: Recognition; me: RecognitionMe }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const today = me.today
  const step = nextStep(today)
  const heights = dayHeights(me.days)
  const kind = buddiesOn(data) ? buddyOf(me.buddy) : null
  const mood = moodOf(today)
  const range = data.week ? `${dayLabel(data.week.from, lang)} – ${dayLabel(data.week.to, lang)}` : ''
  const headline = step.code === 'plan' ? t('time.wins.band.plan', 'Plan your day to start earning points')
    : step.code === 'goal' ? t('time.wins.band.goal_left', '{{count}} more tasks to reach today’s goal', { count: step.left })
      : step.code === 'sweep' ? t('time.wins.band.sweep_left', 'Finish the last {{count}} tasks for a clean sweep', { count: step.left })
        : t('time.wins.band.done', 'Everything planned is done. Great work!')
  const facts: { label: string; value: string }[] = [
    { label: t('time.wins.fact.done', 'Tasks finished'), value: String(me.week.done) },
    { label: t('time.wins.fact.important', 'High priority'), value: String(me.week.important) },
    { label: t('time.wins.fact.on_time', 'On time'), value: me.week.on_time_pct === null ? '—' : `${me.week.on_time_pct} %` },
    { label: t('time.wins.fact.goal_days', 'Days with the goal'), value: String(me.week.days_goal) },
  ]

  return (
    <section aria-label={t('time.wins.my_week', 'My week')} className="rounded-2xl border p-5 shadow-a-sm time-gold-border time-gold-wash">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-center">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-a-text-2">{t('time.wins.this_week', 'This week')}{range ? ` · ${range}` : ''}</p>
          <p className="mt-1 flex items-baseline gap-2">
            <span className="font-a-display text-6xl leading-none time-gold-figure"><CountUp value={me.week.points} /></span>
            <span className="text-sm font-semibold text-a-text-2">{t('time.wins.points_label', 'points')}</span>
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {me.week.rank !== null && me.week.of !== null && (
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-a-border bg-a-surface py-0.5 pl-0.5 pr-2.5 text-xs font-semibold text-a-text">
                <PlaceMark rank={me.week.rank} />{t('time.wins.place', 'Place {{rank}} of {{of}}', { rank: me.week.rank, of: me.week.of })}
              </span>
            )}
            <StreakChip streak={me.streak} />
          </div>
          {me.last_week && me.last_week.points > 0 && (
            <p className="mt-3 text-sm text-a-text-2">
              {me.last_week.rank !== null
                ? t('time.wins.last_week_place', 'Last week: {{count}} points, place {{rank}}', { count: me.last_week.points, rank: me.last_week.rank })
                : t('time.wins.last_week', 'Last week: {{count}} points', { count: me.last_week.points })}
            </p>
          )}
        </div>

        <ol className="flex h-36 items-end gap-2 sm:gap-3" aria-label={t('time.wins.week_days', 'This week, day by day')}>
          {me.days.map((day, i) => {
            const state = dotOf(day)
            const met = state === 'goal' || state === 'sweep'
            return (
              <li key={day.date} className="flex h-full min-w-8 flex-1 flex-col items-center justify-end gap-1 lg:w-10 lg:flex-none"
                aria-label={`${dayLabel(day.date, lang)}: ${t('time.wins.points', '{{count}} points', { count: day.points })}`}>
                <span aria-hidden className="grid h-4 place-items-center time-gold-text">
                  {state === 'sweep' ? <Star size={14} /> : state === 'goal' ? <Check size={14} /> : null}
                </span>
                <span aria-hidden className="text-xs font-semibold text-a-text-2">{day.future ? '' : day.points}</span>
                <span aria-hidden className="flex w-full flex-1 items-end">
                  <span className={`block w-full rounded-t-md time-rise-y ${met ? 'time-gold-fill' : 'bg-a-accent/45'} ${heights[i] === 0 ? 'opacity-40' : ''}`}
                    style={{ height: `${Math.max(4, heights[i])}%`, animationDelay: `${staggerDelay(i, 60)}ms` }} />
                </span>
                <span aria-hidden className={`text-xs ${day.date === data.today ? 'font-bold text-a-text' : 'text-a-text-2'}`}>{weekdayName(i + 1, lang)}</span>
              </li>
            )
          })}
        </ol>

        <div className="flex min-w-0 items-center gap-4 lg:justify-end">
          <GoalRing data={data} me={me} at="hero" />
          {/* With a character, the words are what it says: a bubble with its tail towards it, opened by its call. */}
          <div data-says={kind ? mood : undefined} className={kind ? 'min-w-0 px-3.5 py-2.5 time-bubble' : 'min-w-0'}>
            <p className={`text-xs font-semibold uppercase tracking-wide ${today.goal_met ? 'time-gold-text' : 'text-a-text-2'}`}>
              {today.goal_met ? t('time.wins.band.goal_met', 'Daily goal reached') : t('time.wins.band.goal', 'Today’s goal')}
            </p>
            <p className="text-sm font-semibold text-a-text">
              {kind && <span className="time-gold-text">{t(`time.wins.buddy.say.${mood}`, BUDDY_SAYS[mood])} </span>}{headline}
            </p>
            <p className="mt-1 text-sm text-a-text-2">{t('time.wins.band.today', 'Today: {{count}} points', { count: today.points })}</p>
            <Link to="/time" className="mt-1 inline-block text-sm font-semibold text-a-accent-text">{t('time.wins.open_day', 'Open my day')}</Link>
          </div>
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3 border-t pt-4 time-gold-border sm:grid-cols-4">
        {facts.map(fact => (
          <div key={fact.label} className="min-w-0">
            <dt className="truncate text-xs text-a-text-2">{fact.label}</dt>
            <dd className="font-a-display text-2xl leading-tight text-a-text">{fact.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

const STEP_HEIGHT = { 1: 'h-24', 2: 'h-16', 3: 'h-11' } as const
const STEP_FILL = { 1: 'time-gold-fill', 2: 'time-silver-fill', 3: 'time-bronze-fill' } as const

/** The week's ranking: the podium, then everyone the person may see, their own row marked. */
function RankingCard({ data }: { data: Recognition }) {
  const { t } = useTranslation()
  const rows = data.ranking ?? []
  const view = rankingView(data)
  const spots = view === 'table' ? podiumOf(rows) : []
  const hidden = data.hidden ?? 0

  return (
    <Card title={t('time.wins.ranking', 'This week’s ranking')} icon={Trophy} tone="gold"
      description={t('time.wins.ranking_line', 'Monday to Sunday, by points. It starts again every week.')}>
      {view === 'private' && (
        <div className="flex items-start gap-3 text-sm text-a-text-2">
          <Lock size={16} aria-hidden className="mt-0.5 shrink-0" />
          <p>{t('time.wins.private', 'Your organisation keeps the ranking private: everyone sees only their own points and badges.')}</p>
        </div>
      )}
      {view === 'empty' && <p className="text-sm text-a-text-2">{t('time.wins.ranking_empty', 'Nobody has points this week yet. Finish a planned task to open the ranking.')}</p>}
      {view === 'table' && (
        <>
          {spots.length > 0 && (
            <ol className="mb-4 flex items-end justify-center gap-3 border-b border-a-border px-2 pt-1" aria-label={t('time.wins.podium', 'The top three')}>
              {spots.map(({ row, step }) => (
                <li key={row.person} className="flex w-24 min-w-0 flex-col items-center gap-1"
                  aria-label={`${t('time.wins.place_n', 'Place {{rank}}', { rank: step })}: ${row.name}, ${t('time.wins.points', '{{count}} points', { count: row.points })}`}>
                  {/* The person's character stands on the step — the winner's crowned and celebrating; without one, initials. */}
                  {podiumBuddy(row, step)
                    ? <Buddy {...podiumBuddy(row, step)!} size={76} />
                    : (
                      <>
                        <span aria-hidden className="grid h-5 place-items-center time-gold-text">{step === 1 && <Crown size={18} className="time-pop" />}</span>
                        <Avatar name={row.name} size="lg" tone={row.me ? 'accent' : 'neutral'} />
                      </>
                    )}
                  <span aria-hidden className="w-full truncate text-center text-sm font-semibold text-a-text">{row.me ? t('time.wins.you', 'You') : firstName(row.name)}</span>
                  <span aria-hidden className="text-xs font-semibold text-a-text-2">{row.points}</span>
                  <span aria-hidden className={`grid w-full justify-center rounded-t-xl pt-1.5 text-lg font-bold time-rise-y ${STEP_FILL[step]} ${STEP_HEIGHT[step]}`}
                    style={{ animationDelay: `${staggerDelay(3 - step, 140)}ms` }}>{step}</span>
                </li>
              ))}
            </ol>
          )}
          <ol className="space-y-1.5" aria-label={t('time.wins.ranking', 'This week’s ranking')}>
            {rows.map(row => (
              <li key={row.person} data-me={row.me ? 'true' : undefined}
                className={`flex items-center gap-3 rounded-xl px-2.5 py-2 ${row.me ? 'bg-a-accent/10 ring-1 ring-a-accent/40' : ''}`}>
                <PlaceMark rank={row.rank} />
                {row.rank !== null && <span className="sr-only">{t('time.wins.place_n', 'Place {{rank}}', { rank: row.rank })}</span>}
                {buddyOf(row.buddy) ? <Buddy kind={buddyOf(row.buddy)!} size={34} still /> : <Avatar name={row.name} size="sm" />}
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-semibold text-a-text">{row.name}</span>
                    {row.me && <Pill tone="accent">{t('time.wins.you', 'You')}</Pill>}
                  </span>
                  <span aria-hidden className="mt-1 block h-1.5 overflow-hidden rounded-full bg-a-surface-2">
                    <span className="block h-full rounded-full time-grow time-gold-fill" style={{ width: `${shareOf(row.points, rows)}%` }} />
                  </span>
                </span>
                <span className="hidden shrink-0 items-center gap-2.5 text-xs text-a-text-2 sm:flex">
                  {row.streak >= 2 && (
                    <span className="inline-flex items-center gap-0.5" title={t('time.wins.streak', '{{count}} days in a row', { count: row.streak })}>
                      <Flame size={13} aria-hidden className="time-gold-text" />{row.streak}
                      <span className="sr-only">{t('time.wins.streak', '{{count}} days in a row', { count: row.streak })}</span>
                    </span>
                  )}
                  {row.badges > 0 && (
                    <span className="inline-flex items-center gap-0.5" title={t('time.wins.badges_n', '{{count}} badges', { count: row.badges })}>
                      <MedalIcon size={13} aria-hidden className="time-gold-text" />{row.badges}
                      <span className="sr-only">{t('time.wins.badges_n', '{{count}} badges', { count: row.badges })}</span>
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-sm font-bold text-a-text">{t('time.wins.points', '{{count}} points', { count: row.points })}</span>
                  <span className="block text-xs text-a-text-2">{t('time.wins.finished_n', '{{count}} finished', { count: row.done })}</span>
                </span>
              </li>
            ))}
          </ol>
          {hidden > 0 && <p className="mt-3 text-sm text-a-text-2">{t('time.wins.hidden', 'and {{count}} more colleagues', { count: hidden })}</p>}
          {rows.length === 1 && hidden === 0 && <p className="mt-3 text-sm text-a-text-2">{t('time.wins.alone', 'Nobody else has work in the planner this week yet.')}</p>}
        </>
      )}
    </Card>
  )
}

/** My badges: the earned ones in gold first, then the ones still to earn with how far each has got. */
function BadgesCard({ data, me }: { data: Recognition; me: RecognitionMe }) {
  const { t } = useTranslation()
  const words = useBadgeWords(data.rules)
  const badges = sortBadges(me.badges)
  return (
    <Card title={t('time.wins.badges', 'Badges')} icon={Award} tone="gold"
      description={t('time.wins.badges_line', '{{earned}} of {{total}} earned. They are earned anew every week.', { earned: earnedCount(badges), total: badges.length })}>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {badges.map((badge, i) => (
          <li key={badge.code} data-badge={badge.code} data-earned={badge.earned ? 'true' : 'false'}
            className={`flex min-w-0 flex-col items-center gap-1.5 rounded-2xl border p-3 text-center animate-a-rise ${badge.earned ? 'time-gold-border time-gold-wash' : 'border-a-border bg-a-surface'}`}
            style={{ animationDelay: `${staggerDelay(i)}ms` }}>
            <Medal code={badge.code} earned={badge.earned} size="lg" />
            <span className="text-sm font-semibold leading-snug text-a-text">{words.name(badge.code)}</span>
            <span className="text-xs leading-snug text-a-text-2">{words.hint(badge.code, badge.need)}</span>
            {badge.earned ? (
              <span className="mt-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold time-gold-soft"><Check size={12} aria-hidden />{t('time.wins.earned', 'Earned')}</span>
            ) : (
              <span className="mt-auto block w-full pt-1">
                <span aria-hidden className="block h-1.5 overflow-hidden rounded-full bg-a-surface-2">
                  <span className="block h-full rounded-full bg-a-accent time-grow" style={{ width: `${barWidth(badgePct(badge))}%` }} />
                </span>
                <span className="mt-1 block text-xs font-semibold text-a-text-2">{t('time.wins.progress', '{{have}} of {{need}}', { have: badge.have, need: badge.need })}</span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </Card>
  )
}

/** How points are earned: the server's own figures, for a task and for a day. */
function RulesCard({ data }: { data: Recognition }) {
  const { t } = useTranslation()
  const rules = data.rules
  const rows = ruleRows(rules)
  if (!rules || rows.length === 0) return null
  const vars = { cap: rules.points.time_cap ?? 0, goal: rules.daily_goal, share: rules.planned_share }
  const list = (kind: RuleRow['kind']) => (
    <ul className="mt-2 space-y-2">
      {rows.filter(row => row.kind === kind).map(row => (
        <li key={row.code} className="flex items-start gap-3">
          <span className="min-w-12 shrink-0 rounded-full px-2 py-0.5 text-center text-xs font-bold time-gold-soft">+{row.points}</span>
          <span className="text-sm text-a-text">{t(`time.wins.rule.${row.code}`, RULE_WORDS[row.code], vars)}</span>
        </li>
      ))}
    </ul>
  )
  return (
    <Card title={t('time.wins.rules', 'How points are earned')} icon={Star} tone="gold"
      description={t('time.wins.rules_line', 'For finishing what was planned, and for a day that went to plan.')}>
      <div className="space-y-5">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-a-text-2">{t('time.wins.rules_task', 'For a finished task')}</h3>
          {list('task')}
        </div>
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-a-text-2">{t('time.wins.rules_day', 'For a day')}</h3>
          {list('day')}
        </div>
      </div>
      <p className="mt-4 text-sm text-a-text-2">
        {t('time.wins.rules_note', 'Points follow your tasks as they are now: a task set back to not done gives its points back. The best {{cap}} tasks of a day count.', { cap: rules.day_task_cap })}
      </p>
    </Card>
  )
}
