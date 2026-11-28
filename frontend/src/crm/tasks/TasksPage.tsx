import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CalendarCheck, CheckCircle2, CheckSquare, ListChecks, Plus, SlidersHorizontal, Sparkles } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../CrmProvider'
import { get, params } from '../lib/api'
import { dayLabel } from '../lib/format'
import { useRecords } from '../lib/useRecords'
import { Card } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'
import { SearchInput, Select } from '../ui/inputs'
import { Popover } from '../ui/Menu'
import { Page } from '../ui/Page'
import { Pager } from '../ui/Pager'
import { QueryState } from '../ui/QueryState'
import { Tabs } from '../ui/Tabs'
import { FilterChip, Toolbar } from '../ui/Toolbar'
import type { MetaList } from '../leads/leadTypes'
import {
  groupByDay, groupDone, groupOpen, OPEN_LIMIT, ofType, openingTab, readView, searchTasks, splitBuckets, TABS, TASK_TYPES, tasksQuery, writeView,
  type Tab, type Task, type TaskType, type TaskView, type Who,
} from './taskLogic'
import { TaskList } from './TaskList'
import { tabLabel, taskTypeLabel } from './taskWords'

/**
 * Tasks (round 2: one toolbar, grouped by day; round 5, owner 2026-11-12: "minimize copy, more icons … popups"): the
 * calls, emails and follow-ups due, the person's own or the whole team's, on the venue's clock — every open task by
 * day, or overdue, today, upcoming — and what is done, by the day it was done. The tabs carry the counts; a page opened
 * without a tab opens where the work is (`openingTab`). Pressing a task opens it in the task form; a new one is made
 * in the frame's panel (`?create=task`). The rows are the full admin's tasks (TaskController); the open ones are read at
 * once and sorted into the venue's days here, the done ones a page at a time.
 */
export function TasksPage() {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const records = useRecords()
  const lang = i18n.language
  const zone = boot.venue.timezone
  const today = boot.venue.today
  const [sp, setSp] = useSearchParams()
  const named = readView(sp)
  const [q, setQ] = useState('')

  const openQuery = tasksQuery({ ...named, tab: 'today' }, boot.staff.id)
  const open = useQuery({
    queryKey: ['crm', 'tasks', 'list', openQuery],
    queryFn: () => get<MetaList<Task>>(`tasks${params(openQuery)}`),
    refetchInterval: 30_000,
  })
  const openTasks = ofType(open.data?.data ?? [], named.type)
  const buckets = splitBuckets(openTasks, today, zone)
  const counts: Partial<Record<Tab, number>> = { open: openTasks.length, overdue: buckets.overdue.length, today: buckets.today.length, upcoming: buckets.upcoming.length }
  const view: TaskView = { ...named, tab: openingTab(sp.get('tab'), open.data ? counts : null) }

  const doneQuery = tasksQuery(view, boot.staff.id)
  const done = useQuery({
    queryKey: ['crm', 'tasks', 'list', doneQuery],
    queryFn: () => get<MetaList<Task>>(`tasks${params(doneQuery)}`),
    enabled: view.tab === 'done',
    refetchInterval: 30_000,
  })

  /** A change of whose tasks or the type keeps an unnamed tab unnamed, so it still opens where the work is. */
  const go = (patch: Partial<TaskView>) => {
    const next = writeView({ ...view, page: 1, ...patch }, sp)
    if (!patch.tab && !sp.has('tab')) next.delete('tab')
    setSp(next, { replace: true })
  }

  const pick = (tab: Tab): Task[] => tab === 'done' ? searchTasks(ofType(done.data?.data ?? [], view.type), q)
    : tab === 'open' ? searchTasks(openTasks, q) : searchTasks(buckets[tab], q)
  const shown = pick(view.tab)
  const active = view.tab === 'done' ? done : open
  const truncated = (open.data?.meta.total ?? 0) > OPEN_LIMIT
  const searching = q.trim() !== ''
  const filters = (view.who === 'all' ? 1 : 0) + (view.type ? 1 : 0)
  const groupTitle = (kind: 'overdue' | 'today' | 'tomorrow' | 'day' | 'none', day: string | null): string => {
    switch (kind) {
      case 'overdue': return t('crm.tasks.tab_overdue', 'Overdue')
      case 'today': return t('crm.tasks.group_today', 'Today, {{day}}', { day: dayLabel(day, lang) })
      case 'tomorrow': return t('crm.tasks.group_tomorrow', 'Tomorrow, {{day}}', { day: dayLabel(day, lang) })
      case 'none': return t('crm.tasks.no_day_group', 'No day set')
      default: return dayLabel(day, lang)
    }
  }
  const add = () => records.create('task')

  const whoTabs = (
    <Tabs label={t('crm.tasks.whose', 'Whose tasks')} value={view.who} onChange={(who: Who) => go({ who })}
      items={[{ key: 'mine', label: t('crm.tasks.mine', 'Mine') }, { key: 'all', label: t('crm.tasks.everyone', 'Everyone') }]} />
  )
  const typeSelect = (
    <label className="block sm:w-44">
      <span className="sr-only">{t('crm.tasks.field_type', 'Type')}</span>
      <Select value={view.type} onChange={e => go({ type: e.target.value as TaskType | '' })} aria-label={t('crm.tasks.field_type', 'Type')}>
        <option value="">{t('crm.tasks.any_type', 'Every type')}</option>
        {TASK_TYPES.map(type => <option key={type} value={type}>{taskTypeLabel(t, type)}</option>)}
      </Select>
    </label>
  )

  return (
    <Page icon={CheckSquare} title={t('crm.nav.tasks', 'Tasks')} line={t('crm.tasks.line', 'Calls, emails and follow-ups, on the venue\'s clock.')}
      actions={<Button onClick={add} className="min-h-10 rounded-full"><Plus size={15} aria-hidden />{t('crm.tasks.add_short', 'Add')}</Button>}>
      <Toolbar
        chips={filters > 0 ? (
          <>
            {view.who === 'all' && <FilterChip label={t('crm.tasks.everyone', 'Everyone')} removeLabel={t('crm.tasks.chip_remove', 'Remove')} onRemove={() => go({ who: 'mine' })} />}
            {view.type && <FilterChip label={taskTypeLabel(t, view.type)} removeLabel={t('crm.tasks.chip_remove', 'Remove')} onRemove={() => go({ type: '' })} />}
          </>
        ) : undefined}>
        <div className="flex min-w-0 items-center gap-2 sm:w-64">
          <div className="min-w-0 flex-1"><SearchInput label={t('crm.tasks.search', 'Search tasks')} value={q} onChange={setQ} /></div>
          {/* A phone keeps the search and folds whose tasks and the type behind one button. */}
          <div className="sm:hidden">
            <Popover label={t('crm.tasks.filters', 'Filters')} align="right" width="w-72"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-a-border bg-a-surface px-3 text-sm font-medium text-a-text-2 hover:text-a-text focus-visible:outline-2 focus-visible:outline-a-accent"
              button={<><SlidersHorizontal size={15} aria-hidden />{t('crm.tasks.filters', 'Filters')}{filters > 0 && <span className="rounded-full bg-a-accent px-1.5 text-xs font-semibold leading-5 text-a-accent-ink">{filters}</span>}</>}>
              <div className="space-y-3 p-1.5">{whoTabs}{typeSelect}</div>
            </Popover>
          </div>
        </div>
        <div className="hidden items-center gap-2 sm:flex">{whoTabs}{typeSelect}</div>
      </Toolbar>

      <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
        <div className="w-max sm:w-auto">
          <Tabs label={t('crm.tasks.when', 'When')} value={view.tab} onChange={tab => go({ tab })}
            items={TABS.map(key => ({ key, label: tabLabel(t, key), count: counts[key] }))} />
        </div>
      </div>

      {truncated && view.tab !== 'done' && (
        <Notice tone="info">{t('crm.tasks.truncated', 'Showing the first {{count}} open tasks, soonest first.', { count: OPEN_LIMIT })}</Notice>
      )}

      <Card padded={false}>
        <QueryState loading={active.isLoading} error={active.error} onRetry={() => { void active.refetch() }}>
          {shown.length === 0 ? (
            <Empty tab={view.tab} searching={searching || view.type !== ''} onAdd={add} />
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
    </Page>
  )
}

/** A group's heading: its day (overdue in red, today in amber) and how many tasks it holds. */
function GroupHead({ kind, title, n }: { kind: 'overdue' | 'today' | 'tomorrow' | 'day' | 'none' | 'done'; title: string; n: number }) {
  const { t } = useTranslation()
  const ink = kind === 'overdue' ? 'text-a-danger' : kind === 'today' ? 'text-a-st-pending' : kind === 'done' ? 'text-a-st-confirmed' : 'text-a-text-2'
  return (
    <h3 className={`flex items-center gap-2 bg-a-surface-2/60 px-4 py-1.5 text-xs font-semibold ${ink}`}>
      <span>{title}</span>
      <span className="ml-auto font-medium text-a-text-2" aria-label={t('crm.tasks.group_count', '{{count}} tasks', { count: n })}>{n}</span>
    </h3>
  )
}

function Empty({ tab, searching, onAdd }: { tab: Tab; searching: boolean; onAdd: () => void }) {
  const { t } = useTranslation()
  if (searching) return <EmptyState icon={ListChecks} title={t('crm.tasks.none_found', 'No task matches')} />
  const add = <Button variant="secondary" onClick={onAdd}><Plus size={15} aria-hidden />{t('crm.tasks.add_short', 'Add')}</Button>
  switch (tab) {
    case 'open': return <EmptyState icon={Sparkles} title={t('crm.tasks.empty_open', 'Nothing to do')} action={add} />
    case 'overdue': return <EmptyState icon={Sparkles} title={t('crm.tasks.empty_overdue', 'Nothing overdue')} />
    case 'today': return <EmptyState icon={CalendarCheck} title={t('crm.tasks.empty_today', 'Nothing due today')} action={add} />
    case 'upcoming': return <EmptyState icon={ListChecks} title={t('crm.tasks.empty_upcoming', 'Nothing planned')} action={add} />
    default: return <EmptyState icon={CheckCircle2} title={t('crm.tasks.empty_done', 'Nothing done yet')} />
  }
}
