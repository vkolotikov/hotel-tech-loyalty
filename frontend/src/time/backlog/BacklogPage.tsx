import { useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import {
  AlarmClock, CalendarCheck, CalendarClock, CalendarPlus, CalendarRange, Hourglass, Inbox, Infinity as Anytime, Layers,
  PanelRightOpen, Plus, SearchX, Sparkles, Undo2, UserRound, Users,
} from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { useTimeActions } from '../TimeActions'
import { useBoot } from '../TimeProvider'
import { timeApi } from '../lib/api'
import { addDays } from '../lib/dates'
import { errorText } from '../lib/errors'
import { dayLabel, duration } from '../lib/format'
import { useRefresh } from '../lib/queries'
import { plannerApi, type PersonRef } from '../lib/tasks'
import type { Task } from '../lib/types'
import { TaskCard } from '../task/TaskCard'
import { Card } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'
import { SearchInput, Select } from '../ui/inputs'
import { Page } from '../ui/Page'
import { QueryState } from '../ui/QueryState'
import { SectionNav, type Section } from '../ui/SectionNav'
import { StatTile } from '../ui/StatTile'
import { Tabs } from '../ui/Tabs'
import { useToast } from '../ui/Toast'
import { FilterChip, Toolbar } from '../ui/Toolbar'
import {
  backlogFigures, backlogTab, bucketLoad, claimFailure, dueOf, filterTasks, filterTeam, giveBody, horizonDefaults, isFiltered,
  newTaskDefaults, planBody, poolGroups, sortByDue, teamTasks, typeCounts,
  type BacklogTab, type Bucket, type Due, type DueGroup, type Filters, type Horizon,
} from './backlogLogic'
import { RowMenu } from './RowMenu'

const PREFIX = 'time-backlog'
const PANEL = 'time-backlog-panel'

/** A due day in words: "Was due by Mon 2 Nov", "Due today", "Due tomorrow", "Due by Fri 13 Nov". */
function dueText(t: TFunction, due: Pick<Due, 'date' | 'state'>, lang: string): string {
  const day = dayLabel(due.date, lang)
  if (due.state === 'late') return t('time.backlog.was_due', 'Was due by {{day}}', { day })
  if (due.state === 'today') return t('time.backlog.due_today', 'Due today')
  if (due.state === 'tomorrow') return t('time.backlog.due_tomorrow', 'Due tomorrow')
  return t('time.backlog.due_by', 'Due by {{day}}', { day })
}

function dueTone(state: Due['state'] | 'none'): string {
  return state === 'late' ? 'text-a-danger' : state === 'today' ? 'text-a-st-pending' : 'text-a-text-2'
}

/**
 * The backlog (2026-11-09): the work without a day. My bucket (mine to plan onto a day or hand back), the open pool in
 * its horizons (by a day, this week, anytime — as my skills allow it) to take from, and for a manager the team's
 * buckets, where a task is given to someone. What is listed, who may take what and who may hand back are the full
 * admin's planner endpoints' rules; this page only shows them and asks.
 */
export function BacklogPage() {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const { openTask, openCapture } = useTimeActions()
  const [params, setParams] = useSearchParams()
  const canTeam = boot.staff.can.team_buckets
  const tab = backlogTab(params.get('tab'), canTeam)
  const [q, setQ] = useState('')
  const filters: Filters = { q, type: params.get('type') ?? '' }
  const today = boot.venue.today

  const mine = useQuery({ queryKey: ['time', 'backlog', 'mine'], queryFn: () => timeApi.backlog('mine') })
  const pool = useQuery({ queryKey: ['time', 'backlog', 'pool'], queryFn: () => timeApi.backlog('pool') })
  const team = useQuery({ queryKey: ['time', 'backlog', 'team'], queryFn: () => timeApi.teamBacklog(), enabled: canTeam && tab === 'team' })

  const mineTasks = mine.data?.tasks ?? []
  const poolTasks = pool.data?.tasks ?? []
  const figures = backlogFigures(mineTasks, poolTasks, today, boot.venue.timezone)
  const shown = (n: number, loaded: boolean) => (loaded ? n : '—')
  const both = Boolean(mine.data && pool.data)

  const setParam = (key: string, value: string | null) => setParams(prev => {
    const out = new URLSearchParams(prev)
    if (value) out.set(key, value)
    else out.delete(key)
    return out
  }, { replace: true })
  const choose = (next: BacklogTab) => setParam('tab', next === 'mine' ? null : next)
  const clear = () => { setQ(''); setParam('type', null) }

  const listed = tab === 'mine' ? mineTasks : tab === 'pool' ? poolTasks : teamTasks(team.data)
  const types = typeCounts(listed, boot.settings.groups)

  const sections: Section<BacklogTab>[] = [
    { key: 'mine', icon: Inbox, tone: 'accent', title: t('time.backlog.mine', 'My bucket'), caption: t('time.backlog.mine_caption', 'Yours, to plan when it suits'), badge: figures.mine || undefined },
    { key: 'pool', icon: Layers, tone: 'progress', title: t('time.backlog.pool', 'Open pool'), caption: t('time.backlog.pool_caption', 'Nobody’s yet: take what fits'), badge: figures.pool || undefined },
    ...(canTeam ? [{ key: 'team' as const, icon: Users, tone: 'neutral' as const, title: t('time.backlog.team', 'Team buckets'), caption: t('time.backlog.team_caption', 'Share out everyone’s work') }] : []),
  ]

  const chips = isFiltered(filters) ? (
    <>
      {filters.type && <FilterChip label={t('time.backlog.type_chip', 'Type: {{type}}', { type: filters.type })} onRemove={() => setParam('type', null)} removeLabel={t('time.backlog.remove_filter', 'Remove filter')} />}
      {q.trim() && <FilterChip label={t('time.backlog.search_chip', 'Search: {{q}}', { q: q.trim() })} onRemove={() => setQ('')} removeLabel={t('time.backlog.remove_filter', 'Remove filter')} />}
      <button type="button" onClick={clear} className="px-1 text-xs font-semibold text-a-accent-text">{t('time.backlog.clear', 'Clear the filters')}</button>
    </>
  ) : undefined

  return (
    <Page title={t('time.nav.backlog', 'Backlog & pool')} line={t('time.backlog.line', 'The work without a day: yours to plan, and the open pool anyone may take from.')}
      actions={(
        <>
          <Button variant="secondary" onClick={() => openCapture()} className="time-ai-soft time-ai-border">
            <Sparkles size={15} aria-hidden />{t('time.backlog.with_ai', 'Add with AI')}
          </Button>
          <Button onClick={() => openTask(null, newTaskDefaults(tab, boot.staff.key))}>
            <Plus size={15} aria-hidden />{t('time.task.new', 'New task')}
          </Button>
        </>
      )}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={Inbox} tone="accent" label={t('time.backlog.fig_mine', 'In my bucket')} value={shown(figures.mine, Boolean(mine.data))}
          hint={t('time.backlog.fig_mine_hint', 'Yours, without a day')} to="/time/backlog" />
        <StatTile icon={Layers} tone="progress" label={t('time.backlog.fig_pool', 'In the open pool')} value={shown(figures.pool, Boolean(pool.data))}
          hint={t('time.backlog.fig_pool_hint', 'Open work your skills allow')} to="/time/backlog?tab=pool" />
        <StatTile icon={CalendarClock} tone={figures.late > 0 ? 'danger' : 'pending'} label={t('time.backlog.fig_due', 'Due by a day this week')}
          value={shown(figures.dueThisWeek, both)}
          hint={figures.late > 0
            ? t('time.backlog.fig_due_late', '{{count}} already late', { count: figures.late })
            : t('time.backlog.due_by', 'Due by {{day}}', { day: dayLabel(figures.weekEnd, i18n.language) })} />
        <StatTile icon={Hourglass} tone={figures.stale > 0 ? 'pending' : 'neutral'} label={t('time.backlog.fig_stale', 'Untouched for a week')}
          value={shown(figures.stale, both)} hint={t('time.backlog.fig_stale_hint', 'Not changed in 7 days or more')} />
      </div>

      <SectionNav label={t('time.backlog.sections', 'Backlog sections')} idPrefix={PREFIX} panelId={PANEL} sections={sections} value={tab} onChange={choose} />

      <div id={PANEL} role="tabpanel" aria-labelledby={`${PREFIX}-${tab}`} className="space-y-4 animate-a-fade" key={tab}>
        <Toolbar chips={chips}>
          <SearchInput label={t('time.backlog.search', 'Search tasks')} value={q} onChange={setQ} className="sm:w-64" />
          {types.length > 0 && (
            <Tabs label={t('time.backlog.types', 'Type')} value={filters.type} onChange={next => setParam('type', next || null)}
              items={[{ key: '', label: t('time.backlog.all_types', 'All types') }, ...types.map(x => ({ key: x.name, label: x.name, count: x.count }))]} />
          )}
        </Toolbar>

        {tab === 'mine' && (
          <QueryState loading={mine.isLoading} error={mine.error} onRetry={() => void mine.refetch()}>
            <MineSection tasks={mineTasks} filters={filters} onClear={clear} />
          </QueryState>
        )}
        {tab === 'pool' && (
          <QueryState loading={pool.isLoading} error={pool.error} onRetry={() => void pool.refetch()}>
            <PoolSection tasks={poolTasks} filters={filters} onClear={clear} />
          </QueryState>
        )}
        {tab === 'team' && (
          <QueryState loading={team.isLoading} error={team.error} onRetry={() => void team.refetch()}>
            {team.data && <TeamSection data={team.data} filters={filters} onClear={clear} />}
          </QueryState>
        )}
      </div>
    </Page>
  )
}

/* ─── The writes ───────────────────────────────────────────────────── */

/** Take, plan, hand back and give: the full admin's own claim, move and release, with the page told after each. */
function useBacklogActions() {
  const { t } = useTranslation()
  const boot = useBoot()
  const toast = useToast()
  const refresh = useRefresh()
  const me: PersonRef = { key: boot.staff.key, user_id: boot.staff.id, name: boot.staff.name }
  const today = boot.venue.today

  // Whatever was refused, the lists are read again: a task someone else took first disappears from the pool.
  const refused = (error: unknown) => {
    refresh()
    const why = claimFailure(error)
    if (why === 'taken') toast(t('time.backlog.taken_first', 'Someone took it first. The list is up to date again.'), 'danger')
    else if (why === 'skills') toast(t('time.backlog.no_skill', 'Your skills do not include this type. A manager can change them.'), 'danger')
    else toast(errorText(t, error), 'danger')
  }

  const take = useMutation({
    mutationFn: (task: Task) => plannerApi.claim(task.id),
    onSuccess: () => { refresh(); toast(t('time.backlog.taken', 'In your bucket now')) },
    onError: refused,
  })
  const plan = useMutation({
    // From the pool it is claimed first, so the claim's own checks (someone else has it, my skills) still decide.
    mutationFn: async ({ task, date, fromPool }: { task: Task; date: string; fromPool: boolean }) => {
      if (fromPool) await plannerApi.claim(task.id)
      return plannerApi.move(task.id, planBody(date, me))
    },
    onSuccess: (_, { date }) => {
      refresh()
      toast(date === today ? t('time.backlog.planned_today', 'Planned for today') : t('time.backlog.planned_tomorrow', 'Planned for tomorrow'))
    },
    onError: refused,
  })
  const release = useMutation({
    mutationFn: (task: Task) => plannerApi.release(task.id),
    onSuccess: () => { refresh(); toast(t('time.backlog.released', 'Back in the open pool')) },
    onError: refused,
  })
  const give = useMutation({
    mutationFn: async ({ task, to }: { task: Task; to: Bucket | null }) => {
      if (to) await plannerApi.move(task.id, giveBody(to))
      else await plannerApi.release(task.id)
    },
    onSuccess: (_, { to }) => { refresh(); toast(to ? t('time.backlog.given', 'Given to {{name}}', { name: to.name }) : t('time.backlog.released', 'Back in the open pool')) },
    onError: refused,
  })
  const pending = take.isPending || plan.isPending || release.isPending || give.isPending

  return { take, plan, release, give, pending, today, tomorrow: addDays(today, 1) }
}

type Actions = ReturnType<typeof useBacklogActions>

/* ─── Rows ─────────────────────────────────────────────────────────── */

function DueLine({ due }: { due: Due }) {
  const { t, i18n } = useTranslation()
  const Icon = due.state === 'late' ? AlarmClock : CalendarClock
  return (
    <p className={`flex items-center gap-1 pl-1 text-xs font-semibold ${dueTone(due.state)}`}>
      <Icon size={13} aria-hidden />{dueText(t, due, i18n.language)}
    </p>
  )
}

type Layout = 'slot' | 'row'

const PILL = 'inline-flex min-h-9 items-center rounded-full px-3.5 text-sm font-semibold disabled:opacity-50'

/**
 * A task in a list, its day's line above it when it has one. Its actions sit beside the title from a small tablet up;
 * on a phone they go in a row under the card, so the title keeps its room.
 */
function Row({ task, due, actions }: { task: Task; due?: Due | null; actions?: (layout: Layout) => ReactNode }) {
  const { openTask } = useTimeActions()
  const acts = actions && !task.done
  return (
    <li className="min-w-0 space-y-1">
      {due && <DueLine due={due} />}
      <TaskCard task={task} onOpen={x => openTask(x)} actions={acts ? <div className="hidden items-center gap-1 sm:flex">{actions('slot')}</div> : undefined} />
      {acts && <div className="flex flex-wrap items-center gap-2 pb-1 pl-11 sm:hidden">{actions('row')}</div>}
    </li>
  )
}

/** In the pool: Take, or plan it for today or tomorrow (taken first); beside the title the last two are in its menu. */
function PoolActions({ task, a, layout }: { task: Task; a: Actions; layout: Layout }) {
  const { t } = useTranslation()
  const { openTask } = useTimeActions()
  const take = () => a.take.mutate(task)
  const plan = (date: string) => a.plan.mutate({ task, date, fromPool: true })
  const takeLabel = t('time.backlog.take_task', 'Take “{{title}}”', { title: task.title })
  if (layout === 'row') {
    return (
      <>
        <button type="button" disabled={a.pending} onClick={take} aria-label={takeLabel} className={`${PILL} bg-a-accent text-a-accent-ink`}>{t('time.backlog.take', 'Take')}</button>
        <button type="button" disabled={a.pending} onClick={() => plan(a.today)} aria-label={t('time.backlog.today_task', 'Plan “{{title}}” for today', { title: task.title })}
          className={`${PILL} bg-a-accent/12 text-a-accent-text`}>{t('time.common.today', 'Today')}</button>
        <button type="button" disabled={a.pending} onClick={() => plan(a.tomorrow)} aria-label={t('time.backlog.tomorrow_task', 'Plan “{{title}}” for tomorrow', { title: task.title })}
          className={`${PILL} border border-a-border bg-a-surface text-a-text`}>{t('time.common.tomorrow', 'Tomorrow')}</button>
      </>
    )
  }
  return (
    <>
      <button type="button" disabled={a.pending} onClick={take} aria-label={takeLabel}
        className="rounded-full bg-a-accent px-2.5 py-1 text-xs font-semibold text-a-accent-ink disabled:opacity-50">
        {t('time.backlog.take', 'Take')}
      </button>
      <RowMenu label={t('time.backlog.more', 'More for: {{title}}', { title: task.title })} disabled={a.pending} items={[
        { key: 'today', icon: CalendarCheck, label: t('time.backlog.plan_today', 'Plan for today'), onSelect: () => plan(a.today) },
        { key: 'tomorrow', icon: CalendarPlus, label: t('time.backlog.plan_tomorrow', 'Plan for tomorrow'), onSelect: () => plan(a.tomorrow) },
        { key: 'open', icon: PanelRightOpen, label: t('time.backlog.open', 'Open'), onSelect: () => openTask(task) },
      ]} />
    </>
  )
}

/** In my bucket: Today, tomorrow, or back to the pool; beside the title the last two are in its menu. */
function MineActions({ task, a, layout }: { task: Task; a: Actions; layout: Layout }) {
  const { t } = useTranslation()
  const { openTask } = useTimeActions()
  const plan = (date: string) => a.plan.mutate({ task, date, fromPool: false })
  const todayLabel = t('time.backlog.today_task', 'Plan “{{title}}” for today', { title: task.title })
  if (layout === 'row') {
    return (
      <>
        <button type="button" disabled={a.pending} onClick={() => plan(a.today)} aria-label={todayLabel} className={`${PILL} bg-a-accent/12 text-a-accent-text`}>
          {t('time.common.today', 'Today')}
        </button>
        <button type="button" disabled={a.pending} onClick={() => plan(a.tomorrow)} aria-label={t('time.backlog.tomorrow_task', 'Plan “{{title}}” for tomorrow', { title: task.title })}
          className={`${PILL} border border-a-border bg-a-surface text-a-text`}>{t('time.common.tomorrow', 'Tomorrow')}</button>
        <button type="button" disabled={a.pending} onClick={() => a.release.mutate(task)} aria-label={t('time.backlog.release_task', 'Put “{{title}}” back in the pool', { title: task.title })}
          className={`${PILL} border border-a-border bg-a-surface text-a-text`}>{t('time.backlog.release', 'Back to the pool')}</button>
      </>
    )
  }
  return (
    <>
      <button type="button" disabled={a.pending} onClick={() => plan(a.today)} aria-label={todayLabel}
        className="rounded-full bg-a-accent/12 px-2.5 py-1 text-xs font-semibold text-a-accent-text disabled:opacity-50">
        {t('time.common.today', 'Today')}
      </button>
      <RowMenu label={t('time.backlog.more', 'More for: {{title}}', { title: task.title })} disabled={a.pending} items={[
        { key: 'tomorrow', icon: CalendarPlus, label: t('time.backlog.plan_tomorrow', 'Plan for tomorrow'), onSelect: () => plan(a.tomorrow) },
        { key: 'release', icon: Undo2, label: t('time.backlog.release', 'Back to the pool'), onSelect: () => a.release.mutate(task) },
        { key: 'open', icon: PanelRightOpen, label: t('time.backlog.open', 'Open'), onSelect: () => openTask(task) },
      ]} />
    </>
  )
}

/** In the team's view: who has it — a person's bucket or the open pool. */
function GiveSelect({ task, current, buckets, a, layout }: { task: Task; current: string; buckets: Bucket[]; a: Actions; layout: Layout }) {
  const { t } = useTranslation()
  const select = (
    <Select aria-label={t('time.backlog.give_to', 'Who has “{{title}}”', { title: task.title })} value={current} disabled={a.pending}
      onChange={e => {
        const key = e.target.value
        if (key !== current) a.give.mutate({ task, to: buckets.find(b => b.key === key) ?? null })
      }}
      className={layout === 'slot' ? 'w-36! rounded-full! py-1! text-xs!' : 'min-w-0 flex-1 rounded-full! py-1.5!'}>
      <option value="">{t('time.backlog.to_pool', 'The open pool')}</option>
      {buckets.map(b => <option key={b.key} value={b.key}>{b.name}</option>)}
    </Select>
  )
  if (layout === 'slot') return select
  return (
    <div className="flex w-full max-w-sm items-center gap-2">
      <span aria-hidden className="shrink-0 text-xs font-semibold text-a-text-2">{t('time.backlog.who_has', 'Who has it')}</span>
      {select}
    </div>
  )
}

function NoMatch({ onClear }: { onClear: () => void }) {
  const { t } = useTranslation()
  return (
    <EmptyState icon={SearchX} title={t('time.backlog.no_match', 'No task matches')} line={t('time.backlog.no_match_line', 'Try other words, or another type.')}
      action={<Button variant="secondary" onClick={onClear}>{t('time.backlog.clear', 'Clear the filters')}</Button>} />
  )
}

/* ─── My bucket ────────────────────────────────────────────────────── */

function MineSection({ tasks, filters, onClear }: { tasks: Task[]; filters: Filters; onClear: () => void }) {
  const { t } = useTranslation()
  const boot = useBoot()
  const { openTask } = useTimeActions()
  const a = useBacklogActions()
  const shown = sortByDue(filterTasks(tasks, filters))
  const add = () => openTask(null, newTaskDefaults('mine', boot.staff.key))

  return (
    <Card title={t('time.backlog.mine', 'My bucket')} description={t('time.backlog.mine_line', 'Plan each for a day, or hand it back.')} icon={Inbox}
      action={tasks.length > 0 ? <Button size="sm" variant="ghost" onClick={add}><Plus size={14} aria-hidden />{t('time.common.add', 'Add')}</Button> : undefined}>
      {tasks.length === 0 ? (
        <EmptyState icon={Inbox} title={t('time.backlog.mine_empty', 'Your bucket is empty')}
          line={t('time.backlog.mine_empty_line', 'Add a task to do some day soon, or take one from the open pool.')}
          action={<Button onClick={add}><Plus size={15} aria-hidden />{t('time.task.new', 'New task')}</Button>} />
      ) : shown.length === 0 ? <NoMatch onClear={onClear} /> : (
        <ul className="space-y-2">
          {shown.map(task => <Row key={task.id} task={task} due={dueOf(task, a.today)} actions={layout => <MineActions task={task} a={a} layout={layout} />} />)}
        </ul>
      )}
    </Card>
  )
}

/* ─── The open pool ────────────────────────────────────────────────── */

function PoolSection({ tasks, filters, onClear }: { tasks: Task[]; filters: Filters; onClear: () => void }) {
  const { t, i18n } = useTranslation()
  const { openTask } = useTimeActions()
  const a = useBacklogActions()
  const shown = filterTasks(tasks, filters)
  const groups = poolGroups(shown, a.today)
  const add = (horizon: Horizon) => openTask(null, horizonDefaults(horizon, a.today))
  const late = groups.day.some(g => g.state === 'late')

  if (tasks.length === 0) {
    return (
      <Card>
        <EmptyState icon={Layers} title={t('time.backlog.pool_empty', 'The pool is empty')}
          line={t('time.backlog.pool_empty_line', 'Work nobody has yet waits here for whoever has room. Add some for the team.')}
          action={<Button onClick={() => add('general')}><Plus size={15} aria-hidden />{t('time.backlog.new_pool', 'New pool task')}</Button>} />
      </Card>
    )
  }
  if (shown.length === 0) return <Card><NoMatch onClear={onClear} /></Card>

  const addButton = (horizon: Horizon, label: string) => (
    <Button size="sm" variant="ghost" onClick={() => add(horizon)} aria-label={label}><Plus size={14} aria-hidden />{t('time.common.add', 'Add')}</Button>
  )
  const nothing = <p className="text-sm text-a-text-2">{t('time.backlog.horizon_empty', 'Nothing here right now.')}</p>
  const groupTitle = (g: DueGroup<Task>) => (g.date ? dueText(t, { date: g.date, state: g.state === 'none' ? 'later' : g.state }, i18n.language) : t('time.backlog.no_due', 'No day set'))

  return (
    <div className="space-y-5">
      <Card title={t('time.backlog.by_day', 'Due by a day')} description={t('time.backlog.by_day_line', 'Each by its own day, soonest first.')}
        icon={CalendarClock} tone={late ? 'danger' : 'pending'} action={addButton('day', t('time.backlog.add_day', 'Add a task due by a day'))}>
        {groups.day.length === 0 ? nothing : (
          <div className="space-y-4">
            {groups.day.map(g => (
              <section key={g.date ?? 'none'} aria-label={groupTitle(g)}>
                <h3 className={`mb-2 flex flex-wrap items-center gap-1.5 text-xs font-semibold ${dueTone(g.state)}`}>
                  {g.state === 'late' && <AlarmClock size={13} aria-hidden />}
                  <span>{groupTitle(g)}</span>
                  <span className="font-normal text-a-text-2">· {t('time.backlog.count', '{{count}} task(s)', { count: g.tasks.length })}</span>
                </h3>
                <ul className="space-y-2">
                  {g.tasks.map(task => <Row key={task.id} task={task} actions={layout => <PoolActions task={task} a={a} layout={layout} />} />)}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Card>

      <Card title={t('time.horizon.week', 'This week')} description={t('time.backlog.week_line', 'Some time this week.')} icon={CalendarRange} tone="progress"
        action={addButton('week', t('time.backlog.add_week', 'Add a task for this week'))}>
        {groups.week.length === 0 ? nothing : (
          <ul className="space-y-2">
            {groups.week.map(task => {
              const due = dueOf(task, a.today)
              return <Row key={task.id} task={task} due={due?.state === 'late' ? due : null} actions={layout => <PoolActions task={task} a={a} layout={layout} />} />
            })}
          </ul>
        )}
      </Card>

      <Card title={t('time.horizon.general', 'Anytime')} description={t('time.backlog.anytime_line', 'Whenever someone has room.')} icon={Anytime} tone="neutral"
        action={addButton('general', t('time.backlog.add_anytime', 'Add a task for anytime'))}>
        {groups.general.length === 0 ? nothing : (
          <ul className="space-y-2">
            {groups.general.map(task => <Row key={task.id} task={task} actions={layout => <PoolActions task={task} a={a} layout={layout} />} />)}
          </ul>
        )}
      </Card>
    </div>
  )
}

/* ─── The team's buckets ───────────────────────────────────────────── */

function TeamSection({ data, filters, onClear }: { data: { pool: Task[]; buckets: Bucket[] }; filters: Filters; onClear: () => void }) {
  const { t } = useTranslation()
  const { openTask } = useTimeActions()
  const a = useBacklogActions()
  const units = { h: t('time.common.h', 'h'), min: t('time.common.min', 'min') }
  const shown = filterTeam(data, filters)
  const all = teamTasks(data)
  const matched = teamTasks(shown)
  const nothing = <p className="text-sm text-a-text-2">{t('time.backlog.bucket_empty', 'Nothing in their bucket.')}</p>
  const loadLine = (tasks: Task[]) => {
    const load = bucketLoad(tasks)
    const count = t('time.backlog.count', '{{count}} task(s)', { count: load.open })
    return load.minutes > 0 ? `${count} · ${duration(load.minutes, units)}` : count
  }

  if (all.length === 0) {
    return (
      <Card>
        <EmptyState icon={Users} title={t('time.backlog.team_empty', 'Nobody has work without a day')}
          line={t('time.backlog.team_empty_line', 'Tasks without a day land here: in someone’s bucket or in the open pool.')}
          action={<Button onClick={() => openTask(null, newTaskDefaults('team', ''))}><Plus size={15} aria-hidden />{t('time.task.new', 'New task')}</Button>} />
      </Card>
    )
  }
  if (matched.length === 0) return <Card><NoMatch onClear={onClear} /></Card>

  return (
    <div className="space-y-5">
      <Card title={t('time.backlog.pool', 'Open pool')} description={loadLine(data.pool)} icon={Layers} tone="progress">
        {shown.pool.length === 0 ? <p className="text-sm text-a-text-2">{t('time.backlog.horizon_empty', 'Nothing here right now.')}</p> : (
          <ul className="space-y-2">
            {shown.pool.map(task => <Row key={task.id} task={task} actions={layout => <GiveSelect task={task} current="" buckets={data.buckets} a={a} layout={layout} />} />)}
          </ul>
        )}
      </Card>

      <div className="grid items-start gap-5 md:grid-cols-2">
        {shown.buckets.map(bucket => (
          <Card key={bucket.key} title={bucket.name} description={loadLine(data.buckets.find(b => b.key === bucket.key)?.tasks ?? [])} icon={UserRound}>
            {bucket.tasks.length === 0 ? nothing : (
              <ul className="space-y-2">
                {bucket.tasks.map(task => <Row key={task.id} task={task} actions={layout => <GiveSelect task={task} current={bucket.key} buckets={data.buckets} a={a} layout={layout} />} />)}
              </ul>
            )}
          </Card>
        ))}
      </div>
    </div>
  )
}
