import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AlarmClock, CalendarCheck, CalendarDays, CheckCircle2, ListChecks, Plus, Sparkles } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../CrmProvider'
import { get, params } from '../lib/api'
import { count, dayLabel } from '../lib/format'
import { Card } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'
import { SearchInput, Select } from '../ui/inputs'
import { Page } from '../ui/Page'
import { Pager } from '../ui/Pager'
import { QueryState } from '../ui/QueryState'
import { StatTile } from '../ui/StatTile'
import { Tabs } from '../ui/Tabs'
import { FilterChip, Toolbar } from '../ui/Toolbar'
import type { MetaList } from '../leads/leadTypes'
import {
  groupByDay, groupDone, groupOpen, OPEN_LIMIT, ofType, readView, searchTasks, splitBuckets, TABS, TASK_TYPES, tasksQuery, writeView,
  type Tab, type Task, type TaskType, type TaskView, type Who,
} from './taskLogic'
import { TaskForm } from './TaskForm'
import { TaskList } from './TaskList'
import { tabLabel, taskTypeLabel } from './taskWords'

/**
 * Tasks (round 2: one toolbar, grouped by day, clear due states): the calls, emails and follow-ups due, the person's
 * own or the whole team's, on the venue's clock — every open task by day, or overdue, today, upcoming — and what is
 * done, by the day it was done. Overdue in red, today in amber, every row with its day and time. The figures count the
 * open tasks the list holds. The rows are the full admin's tasks (TaskController); the open ones are read at once and
 * sorted into the venue's days here, the done ones a page at a time.
 */
export function TasksPage() {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const lang = i18n.language
  const zone = boot.venue.timezone
  const today = boot.venue.today
  const [sp, setSp] = useSearchParams()
  const view = readView(sp)
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)

  const openQuery = tasksQuery({ ...view, tab: 'today' }, boot.staff.id)
  const open = useQuery({
    queryKey: ['crm', 'tasks', 'list', openQuery],
    queryFn: () => get<MetaList<Task>>(`tasks${params(openQuery)}`),
    refetchInterval: 30_000,
  })
  const doneQuery = tasksQuery(view, boot.staff.id)
  const done = useQuery({
    queryKey: ['crm', 'tasks', 'list', doneQuery],
    queryFn: () => get<MetaList<Task>>(`tasks${params(doneQuery)}`),
    enabled: view.tab === 'done',
    refetchInterval: 30_000,
  })

  const go = (patch: Partial<TaskView>) => setSp(writeView({ ...view, page: 1, ...patch }, sp), { replace: true })
  /** A figure's tile opens its tab, keeping whose tasks and the type. */
  const tabLink = (tab: Tab): string => { const q = writeView({ ...view, page: 1, tab }, sp).toString(); return q ? `/crm/tasks?${q}` : '/crm/tasks' }

  const openTasks = ofType(open.data?.data ?? [], view.type)
  const buckets = splitBuckets(openTasks, today, zone)
  const pick = (tab: Tab): Task[] => tab === 'done' ? searchTasks(ofType(done.data?.data ?? [], view.type), q)
    : tab === 'open' ? searchTasks(openTasks, q) : searchTasks(buckets[tab], q)
  const shown = pick(view.tab)
  const active = view.tab === 'done' ? done : open
  const truncated = (open.data?.meta.total ?? 0) > OPEN_LIMIT
  const counts: Partial<Record<Tab, number>> = { open: openTasks.length, overdue: buckets.overdue.length, today: buckets.today.length, upcoming: buckets.upcoming.length }
  const searching = q.trim() !== ''
  const groupTitle = (kind: 'overdue' | 'today' | 'tomorrow' | 'day' | 'none', day: string | null): string => {
    switch (kind) {
      case 'overdue': return t('crm.tasks.tab_overdue', 'Overdue')
      case 'today': return t('crm.tasks.group_today', 'Today, {{day}}', { day: dayLabel(day, lang) })
      case 'tomorrow': return t('crm.tasks.group_tomorrow', 'Tomorrow, {{day}}', { day: dayLabel(day, lang) })
      case 'none': return t('crm.tasks.no_day_group', 'No day set')
      default: return dayLabel(day, lang)
    }
  }

  return (
    <Page title={t('crm.nav.tasks', 'Tasks')} line={t('crm.tasks.line', 'Calls, emails and follow-ups, on the venue\'s clock.')}
      actions={<Button onClick={() => setAdding(true)} className="min-h-11"><Plus size={15} aria-hidden />{t('crm.tasks.new', 'Add a task')}</Button>}>
      {open.data && (
        <section aria-label={t('crm.tasks.figures', 'Open tasks at a glance')} className="grid grid-cols-3 gap-3">
          <StatTile icon={AlarmClock} tone={buckets.overdue.length > 0 ? 'danger' : 'neutral'} label={t('crm.tasks.tab_overdue', 'Overdue')} value={count(buckets.overdue.length, lang)} to={tabLink('overdue')} />
          <StatTile icon={CalendarCheck} tone={buckets.today.length > 0 ? 'pending' : 'neutral'} label={t('crm.tasks.tab_today', 'Today')} value={count(buckets.today.length, lang)} to={tabLink('today')} />
          <StatTile icon={CalendarDays} tone="progress" label={t('crm.tasks.tab_upcoming', 'Upcoming')} value={count(buckets.upcoming.length, lang)} to={tabLink('upcoming')} />
        </section>
      )}

      <Toolbar
        chips={view.type || view.who === 'all' ? (
          <>
            {view.who === 'all' && <FilterChip label={t('crm.tasks.everyone', 'Everyone')} removeLabel={t('crm.tasks.chip_remove', 'Remove')} onRemove={() => go({ who: 'mine' })} />}
            {view.type && <FilterChip label={taskTypeLabel(t, view.type)} removeLabel={t('crm.tasks.chip_remove', 'Remove')} onRemove={() => go({ type: '' })} />}
          </>
        ) : undefined}>
        <div className="w-full sm:w-64"><SearchInput label={t('crm.tasks.search', 'Search tasks')} value={q} onChange={setQ} /></div>
        <Tabs label={t('crm.tasks.whose', 'Whose tasks')} value={view.who} onChange={(who: Who) => go({ who })}
          items={[{ key: 'mine', label: t('crm.tasks.mine', 'Mine') }, { key: 'all', label: t('crm.tasks.everyone', 'Everyone') }]} />
        <label className="block sm:w-48">
          <span className="sr-only">{t('crm.tasks.field_type', 'Type')}</span>
          <Select value={view.type} onChange={e => go({ type: e.target.value as TaskType | '' })} aria-label={t('crm.tasks.field_type', 'Type')}>
            <option value="">{t('crm.tasks.any_type', 'Every type')}</option>
            {TASK_TYPES.map(type => <option key={type} value={type}>{taskTypeLabel(t, type)}</option>)}
          </Select>
        </label>
      </Toolbar>

      <Tabs label={t('crm.tasks.when', 'When')} value={view.tab} onChange={tab => go({ tab })}
        items={TABS.map(key => ({ key, label: tabLabel(t, key), count: counts[key] }))} />

      {truncated && view.tab !== 'done' && (
        <Notice tone="info">{t('crm.tasks.truncated', 'Showing the first {{count}} open tasks, soonest first.', { count: OPEN_LIMIT })}</Notice>
      )}

      <Card padded={false}>
        <QueryState loading={active.isLoading} error={active.error} onRetry={() => { void active.refetch() }}>
          {shown.length === 0 ? (
            <Empty tab={view.tab} searching={searching || view.type !== ''} onAdd={() => setAdding(true)} />
          ) : view.tab === 'open' ? (
            <div className="divide-y divide-a-border">
              {groupOpen(shown, today, zone).map(group => (
                <section key={group.key} aria-label={groupTitle(group.kind, group.day)}>
                  <GroupHead kind={group.kind} title={groupTitle(group.kind, group.day)} n={group.tasks.length} />
                  <TaskList tasks={group.tasks} />
                </section>
              ))}
            </div>
          ) : view.tab === 'upcoming' ? (
            <div className="divide-y divide-a-border">
              {groupByDay(shown, zone).map(group => (
                <section key={group.day ?? 'none'} aria-label={group.day ? dayLabel(group.day, lang) : t('crm.tasks.no_day_group', 'No day set')}>
                  <GroupHead kind="day" title={group.day ? dayLabel(group.day, lang) : t('crm.tasks.no_day_group', 'No day set')} n={group.tasks.length} />
                  <TaskList tasks={group.tasks} />
                </section>
              ))}
            </div>
          ) : view.tab === 'done' ? (
            <div className="divide-y divide-a-border">
              {groupDone(shown, zone).map(group => (
                <section key={group.day ?? 'none'} aria-label={group.day ? dayLabel(group.day, lang) : t('crm.tasks.no_day_group', 'No day set')}>
                  <GroupHead kind="done" title={group.day === today ? t('crm.tasks.done_today', 'Done today') : group.day ? dayLabel(group.day, lang) : t('crm.tasks.no_day_group', 'No day set')} n={group.tasks.length} />
                  <TaskList tasks={group.tasks} />
                </section>
              ))}
            </div>
          ) : (
            <TaskList tasks={shown} />
          )}
        </QueryState>
      </Card>
      {view.tab === 'done' && done.data && (
        <Pager page={done.data.meta.current_page} last={done.data.meta.last_page} total={done.data.meta.total} onPage={page => go({ page, tab: 'done' })} />
      )}

      {adding && <TaskForm task={null} onClose={() => setAdding(false)} />}
    </Page>
  )

}

/** A group's heading: its day (overdue in red, today in amber) and how many tasks it holds. */
function GroupHead({ kind, title, n }: { kind: 'overdue' | 'today' | 'tomorrow' | 'day' | 'none' | 'done'; title: string; n: number }) {
  const { t } = useTranslation()
  const ink = kind === 'overdue' ? 'text-a-danger' : kind === 'today' ? 'text-a-st-pending' : kind === 'done' ? 'text-a-st-confirmed' : 'text-a-text-2'
  return (
    <h3 className={`flex items-center gap-2 bg-a-surface-2/60 px-4 py-2 text-xs font-semibold ${ink}`}>
      <span>{title}</span>
      <span className="ml-auto font-medium text-a-text-2" aria-label={t('crm.tasks.group_count', '{{count}} tasks', { count: n })}>{n}</span>
    </h3>
  )
}

function Empty({ tab, searching, onAdd }: { tab: Tab; searching: boolean; onAdd: () => void }) {
  const { t } = useTranslation()
  if (searching) return <EmptyState icon={ListChecks} title={t('crm.tasks.none_found', 'No task matches')} line={t('crm.tasks.none_found_line', 'Try another word, another type, or another tab.')} />
  const add = <Button variant="secondary" onClick={onAdd}><Plus size={15} aria-hidden />{t('crm.tasks.new', 'Add a task')}</Button>
  switch (tab) {
    case 'open': return <EmptyState icon={Sparkles} title={t('crm.tasks.empty_open', 'Nothing to do')} line={t('crm.tasks.empty_open_line', 'Every task is done. Add the next call or email so it is not forgotten.')} action={add} />
    case 'overdue': return <EmptyState icon={Sparkles} title={t('crm.tasks.empty_overdue', 'Nothing overdue')} line={t('crm.tasks.empty_overdue_line', 'Every task is on time.')} />
    case 'today': return <EmptyState icon={CalendarCheck} title={t('crm.tasks.empty_today', 'Nothing due today')} line={t('crm.tasks.empty_today_line', 'Add the next call or email so it is not forgotten.')} action={add} />
    case 'upcoming': return <EmptyState icon={ListChecks} title={t('crm.tasks.empty_upcoming', 'Nothing planned')} line={t('crm.tasks.empty_upcoming_line', 'Tasks for the days ahead show here.')} action={add} />
    default: return <EmptyState icon={CheckCircle2} title={t('crm.tasks.empty_done', 'Nothing done yet')} line={t('crm.tasks.empty_done_line', 'Tasks you mark done show here with what came of them.')} />
  }
}
