import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  AlarmClock, BarChart3, CalendarCheck, CalendarDays, CalendarRange, CheckCircle2, Clock, Gauge, Inbox, Layers, Lightbulb, ListChecks, Timer, Users,
} from 'lucide-react'
import { useBoot } from '../TimeProvider'
import { ReviewCard } from '../ai/ReviewCard'
import { timeApi } from '../lib/api'
import { dayLabel, hours } from '../lib/format'
import { usePeople, usePersonName } from '../lib/queries'
import { rankSignals, signalText, signalTone } from '../lib/signals'
import type { Insights } from '../lib/types'
import { loadState } from '../plan/timeline'
import { Card } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'
import { Select, TextInput } from '../ui/inputs'
import { Page } from '../ui/Page'
import { QueryState } from '../ui/QueryState'
import { SectionNav, type Section } from '../ui/SectionNav'
import { StatTile, type Tone } from '../ui/StatTile'
import { Tabs } from '../ui/Tabs'
import { FilterChip, Toolbar } from '../ui/Toolbar'
import { Delta } from './charts'
import { DaysSection, PeopleSection, WorkSection } from './InsightsSections'
import {
  MAX_DAYS, RANGES, countChange, insightsKey, isEmpty, personOptions, pointsChange, previousRange, rangeFromSearch, sectionOf, withParam, withRange,
  type InsightsSection, type RangeKind,
} from './insightsLogic'

const PANEL = 'time-insights-panel'
const PREFIX = 'time-insights-section'

/**
 * Insights (2026-11-09): how the team's time went over a period — the full admin's Planner Stats on the workspace's own
 * `time/insights`. The period (`?range=`, `?from=&to=`) and one person (`?person=`) are kept in the address; the figures
 * compare with the same number of days just before; three sections (`?tab=`): people, work (types, weekdays, start
 * hours) and days (each day, the pool). Every figure is the server's (TimeInsights); the page only formats and orders.
 */
export function InsightsPage() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const boot = useBoot()
  const [search, setSearch] = useSearchParams()
  const range = rangeFromSearch(search, boot.venue.today)
  const person = search.get('person') || null
  const tab = sectionOf(search.get('tab'))
  const people = usePeople().data?.people
  const options = useMemo(() => personOptions(people ?? []), [people])

  const query = useQuery({
    queryKey: insightsKey(range.from, range.to, person),
    queryFn: () => timeApi.insights(range.from, range.to, person),
    placeholderData: keepPreviousData,
  })
  const data = query.data

  const update = (next: (prev: URLSearchParams) => URLSearchParams) => setSearch(prev => next(prev), { replace: true })
  const chooseRange = (kind: RangeKind) => update(prev => withRange(prev, kind, kind === 'custom' ? range.from : undefined, kind === 'custom' ? range.to : undefined))

  const rangeLabels: Record<RangeKind, string> = {
    week: t('time.insights.range.week', 'This week'),
    '7': t('time.insights.range.last7', 'Last 7 days'),
    month: t('time.insights.range.month', 'This month'),
    '30': t('time.insights.range.last30', 'Last 30 days'),
    last_month: t('time.insights.range.last_month', 'Last month'),
    custom: t('time.insights.range.custom', 'Choose days'),
  }
  const personName = options.find(p => p.key === person)?.name ?? data?.people.find(p => p.key === person)?.name ?? person
  const shown = data ? { from: data.from, to: data.to } : range

  const sections: Section<InsightsSection>[] = [
    { key: 'people', icon: Users, tone: 'accent', title: t('time.insights.tab.people', 'People'), caption: t('time.insights.caption.people', 'Each person’s work, load and timing') },
    { key: 'work', icon: Layers, tone: 'progress', title: t('time.insights.tab.work', 'Work'), caption: t('time.insights.caption.work', 'Task types, weekdays and start hours') },
    { key: 'days', icon: CalendarDays, tone: 'success', title: t('time.insights.tab.days', 'Days'), caption: t('time.insights.caption.days', 'Day by day, and the pool') },
  ]

  return (
    <Page title={t('time.nav.insights', 'Insights')}
      line={t('time.insights.line', 'How the team’s time went: what was planned, finished and clocked, and where it slipped.')}
      below={<p className="text-sm font-semibold text-a-text">{dayLabel(shown.from, lang, 'long')} – {dayLabel(shown.to, lang, 'long')}</p>}>
      <Toolbar
        chips={person ? (
          <FilterChip label={t('time.insights.person_chip', 'Person: {{name}}', { name: personName ?? '' })} removeLabel={t('time.insights.remove_filter', 'Remove filter')}
            onRemove={() => update(prev => withParam(prev, 'person', null))} />
        ) : undefined}>
        <span className="inline-flex items-center gap-2 px-1 text-sm font-medium text-a-text-2">
          <CalendarRange size={15} aria-hidden />{t('time.insights.period', 'Period')}
        </span>
        <Tabs label={t('time.insights.period', 'Period')} value={range.kind} onChange={chooseRange}
          items={RANGES.map(kind => ({ key: kind, label: rangeLabels[kind] }))} />
        {range.kind === 'custom' && (
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-sm text-a-text-2">
              {t('time.insights.from', 'From')}
              <TextInput type="date" value={range.from} className="w-auto!" onChange={e => update(prev => withRange(prev, 'custom', e.target.value || range.from, range.to))} />
            </label>
            <label className="flex items-center gap-1.5 text-sm text-a-text-2">
              {t('time.insights.to', 'To')}
              <TextInput type="date" value={range.to} className="w-auto!" onChange={e => update(prev => withRange(prev, 'custom', range.from, e.target.value || range.to))} />
            </label>
          </div>
        )}
        <label className="min-w-0 sm:ml-auto sm:w-56">
          <span className="sr-only">{t('time.insights.person', 'Whose work')}</span>
          <Select value={person ?? ''} onChange={e => update(prev => withParam(prev, 'person', e.target.value || null))}>
            <option value="">{t('time.insights.whole_team', 'The whole team')}</option>
            {options.map(p => <option key={p.key} value={p.key}>{p.name}</option>)}
            {person && !options.some(p => p.key === person) && <option value={person}>{personName}</option>}
          </Select>
        </label>
      </Toolbar>
      {range.clipped && <p className="px-1 text-sm text-a-text-2">{t('time.insights.clipped', 'Insights cover up to {{max}} days at a time, so these are the last {{max}}.', { max: MAX_DAYS })}</p>}

      <QueryState loading={query.isLoading} error={query.error} onRetry={() => void query.refetch()} rows={6}>
        {data && (
          <div className={`space-y-5 transition-opacity ${query.isPlaceholderData ? 'opacity-60' : ''}`} aria-busy={query.isPlaceholderData || undefined}>
            {isEmpty(data) ? (
              <Card>
                <EmptyState icon={BarChart3} title={t('time.insights.empty', 'Nothing was planned in this period')}
                  line={person ? t('time.insights.empty_person_line', 'Pick another period, or look at the whole team.') : t('time.insights.empty_line', 'Pick another period, or plan some work first.')}
                  action={<Link to="/time/plan" className="inline-flex rounded-full bg-a-accent px-4 py-2 text-sm font-semibold text-a-accent-ink">{t('time.insights.open_planner', 'Open the planner')}</Link>} />
              </Card>
            ) : (
              <>
                <Figures data={data} />
                <div className="grid items-start gap-5 lg:grid-cols-2">
                  <SignalsCard data={data} />
                  <ReviewCard ask={{ kind: 'period', from: data.from, to: data.to, person }} title={t('time.insights.review', 'AI review of the period')}
                    line={t('time.insights.review_line', 'What went well, what slipped, and what to change next time.')} />
                </div>
                <SectionNav label={t('time.insights.sections', 'Insights sections')} idPrefix={PREFIX} panelId={PANEL} sections={sections} value={tab}
                  onChange={next => update(prev => withParam(prev, 'tab', next, 'people'))} />
                <div id={PANEL} role="tabpanel" aria-labelledby={`${PREFIX}-${tab}`} className="animate-a-fade">
                  {tab === 'people' && <PeopleSection data={data} />}
                  {tab === 'work' && <WorkSection data={data} />}
                  {tab === 'days' && <DaysSection data={data} />}
                </div>
              </>
            )}
          </div>
        )}
      </QueryState>
    </Page>
  )
}

/** The period's figures, each against the same number of days just before. */
function Figures({ data }: { data: Insights }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const { totals, previous, pool } = data
  const h = t('time.common.h', 'h')
  const hrs = (minutes: number) => `${hours(minutes, lang)} ${h}`
  const pct = (value: number | null | undefined) => (value === null || value === undefined ? '—' : t('time.insights.pct', '{{pct}} %', { pct: value }))
  const load = loadState(totals.load_pct)
  const loadTone: Tone = load === 'over' ? 'danger' : load === 'high' ? 'pending' : load === 'ok' ? 'success' : 'neutral'
  const before = previousRange(data.from, data.days)
  const dot = <span aria-hidden> · </span>

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={ListChecks} tone="accent" label={t('time.insights.tasks', 'Tasks')} value={totals.tasks}
          hint={<>{t('time.insights.done_count', '{{done}} done', { done: totals.done })}{countChange(totals.tasks, previous.tasks) && dot}<Delta change={countChange(totals.tasks, previous.tasks)} unit="count" upIsGood={null} /></>} />
        <StatTile icon={CheckCircle2} tone="success" label={t('time.insights.completion', 'Finished')} value={pct(totals.completion_pct)}
          hint={pointsChange(totals.completion_pct, previous.completion_pct)
            ? <Delta change={pointsChange(totals.completion_pct, previous.completion_pct)} unit="points" upIsGood />
            : t('time.insights.of_tasks', 'of the period’s tasks')} />
        <StatTile icon={CalendarCheck} tone="progress" label={t('time.insights.on_time', 'On time')} value={pct(totals.on_time_pct)}
          hint={<>{t('time.insights.late_count', '{{late}} late', { late: totals.late })}{pointsChange(totals.on_time_pct, previous.on_time_pct) && dot}<Delta change={pointsChange(totals.on_time_pct, previous.on_time_pct)} unit="points" upIsGood /></>} />
        <StatTile icon={AlarmClock} tone={totals.overdue > 0 ? 'danger' : 'neutral'} label={t('time.insights.overdue', 'Overdue, still open')} value={totals.overdue}
          hint={countChange(totals.overdue, previous.overdue)
            ? <Delta change={countChange(totals.overdue, previous.overdue)} unit="count" upIsGood={false} />
            : t('time.insights.overdue_hint', 'open after their day')} />
        <StatTile icon={Timer} tone="progress" label={t('time.insights.planned', 'Planned')} value={hrs(totals.planned_minutes)}
          hint={countChange(totals.planned_minutes, previous.planned_minutes)
            ? <Delta change={countChange(totals.planned_minutes, previous.planned_minutes)} unit="minutes" upIsGood={null} />
            : t('time.insights.planned_hint', 'the tasks’ planned time')} />
        <StatTile icon={Clock} tone="pending" label={t('time.insights.tracked', 'Clocked')} value={hrs(totals.tracked_minutes)}
          hint={totals.accuracy_pct !== null
            ? t('time.insights.accuracy_hint', 'Tasks took {{pct}} % of their planned time', { pct: totals.accuracy_pct })
            : t('time.insights.no_tracked', 'No task was clocked yet')} />
        <StatTile icon={Gauge} tone={loadTone} label={t('time.insights.load', 'Load')} value={pct(totals.load_pct)}
          hint={totals.capacity_minutes
            ? t('time.insights.load_hint', '{{planned}} of {{capacity}} the team could work', { planned: hrs(totals.planned_minutes), capacity: hrs(totals.capacity_minutes) })
            : t('time.insights.no_capacity', 'Nobody had working hours in this period')} />
        <StatTile icon={Inbox} tone={pool.d7 > 0 ? 'pending' : 'accent'} label={t('time.insights.pool', 'In the pool now')} value={pool.open} to="/time/backlog"
          hint={t('time.insights.pool_hint', '{{count}} waiting over a week', { count: pool.d7 })} />
      </div>
      <p className="px-1 text-xs text-a-text-2">
        {t('time.insights.compare_line', 'Arrows compare with {{from}} – {{to}}, the same number of days just before.', { from: dayLabel(before.from, lang), to: dayLabel(before.to, lang) })}
      </p>
    </div>
  )
}

/** What the server found worth a look in the period (TimeInsights' signals), the most serious first. */
function SignalsCard({ data }: { data: Insights }) {
  const { t } = useTranslation()
  const units = { h: t('time.common.h', 'h'), min: t('time.common.min', 'min') }
  const extra = useMemo(() => data.people.map(p => ({ key: p.key, name: p.name })), [data.people])
  const nameOf = usePersonName(extra)
  const signals = rankSignals(data.signals, 8)
  const names = { person: (key: string) => nameOf(key), task: () => undefined }
  return (
    <Card title={t('time.insights.signals', 'Worth a look')} description={t('time.insights.signals_line', 'What stands out in this period.')} icon={Lightbulb} tone="pending">
      {signals.length === 0
        ? <p className="text-sm text-a-text-2">{t('time.insights.signals_none', 'Nothing stands out: the period looks healthy.')}</p>
        : (
          <ul className="space-y-2">
            {signals.map((s, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${signalTone(s.code) === 'danger' ? 'bg-a-danger' : signalTone(s.code) === 'info' ? 'bg-a-st-progress' : 'bg-a-st-pending'}`} />
                <span className="text-a-text">{signalText(t, s, names, units)}</span>
              </li>
            ))}
          </ul>
        )}
    </Card>
  )
}
