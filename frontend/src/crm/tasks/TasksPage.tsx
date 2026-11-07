import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CalendarCheck, CheckCircle2, ListChecks, Plus, Sparkles } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../CrmProvider'
import { get, params } from '../lib/api'
import { dayLabel } from '../lib/format'
import { Card } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'
import { SearchInput } from '../ui/inputs'
import { Page } from '../ui/Page'
import { Pager } from '../ui/Pager'
import { QueryState } from '../ui/QueryState'
import { Tabs } from '../ui/Tabs'
import type { MetaList } from '../leads/leadTypes'
import { BUCKETS, groupByDay, OPEN_LIMIT, readView, searchTasks, splitBuckets, tasksQuery, writeView, type Bucket, type Task, type Who } from './taskLogic'
import { TaskForm } from './TaskForm'
import { TaskList } from './TaskList'
import { bucketLabel } from './taskWords'

/**
 * Tasks (2026-11-07): the calls, emails and follow-ups due, the person's own or the whole team's, in the venue's day —
 * overdue, today, upcoming — and what is done. The rows are the full admin's tasks (TaskController); the open ones are
 * read at once and sorted into the venue's days here, the done ones a page at a time.
 */
export function TasksPage() {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const zone = boot.venue.timezone
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

  const go = (patch: Partial<{ tab: Bucket; who: Who; page: number }>) =>
    setSp(writeView({ ...view, page: 1, ...patch }, sp), { replace: true })

  const buckets = splitBuckets(open.data?.data ?? [], boot.venue.today, zone)
  const shown = view.tab === 'done' ? searchTasks(done.data?.data ?? [], q) : searchTasks(buckets[view.tab], q)
  const active = view.tab === 'done' ? done : open
  const truncated = (open.data?.meta.total ?? 0) > OPEN_LIMIT

  return (
    <Page title={t('crm.nav.tasks', 'Tasks')} line={t('crm.tasks.line', 'Calls, emails and follow-ups, on the venue\'s clock.')}
      actions={<Button onClick={() => setAdding(true)}><Plus size={15} aria-hidden />{t('crm.tasks.new', 'Add a task')}</Button>}>
      <div className="flex flex-wrap items-center gap-3">
        <Tabs label={t('crm.tasks.whose', 'Whose tasks')} value={view.who} onChange={who => go({ who })}
          items={[{ key: 'mine', label: t('crm.tasks.mine', 'Mine') }, { key: 'all', label: t('crm.tasks.everyone', 'Everyone') }]} />
        <SearchInput label={t('crm.tasks.search', 'Search tasks')} value={q} onChange={setQ} className="w-full sm:ml-auto sm:w-64" />
      </div>
      <Tabs label={t('crm.tasks.when', 'When')} value={view.tab} onChange={tab => go({ tab })}
        items={BUCKETS.map(key => ({ key, label: bucketLabel(t, key), count: key === 'done' ? undefined : buckets[key].length }))} />

      {truncated && view.tab !== 'done' && (
        <Notice tone="info">{t('crm.tasks.truncated', 'Showing the first {{count}} open tasks, soonest first.', { count: OPEN_LIMIT })}</Notice>
      )}

      <Card padded={false}>
        <QueryState loading={active.isLoading} error={active.error} onRetry={() => { void active.refetch() }}>
          {shown.length === 0 ? (
            <Empty tab={view.tab} searching={q.trim() !== ''} onAdd={() => setAdding(true)} />
          ) : view.tab === 'upcoming' ? (
            <div className="divide-y divide-a-border">
              {groupByDay(shown, zone).map(group => (
                <section key={group.day ?? 'none'}>
                  <h3 className="bg-a-surface-2/60 px-4 py-2 text-xs font-semibold text-a-text-2">
                    {group.day ? dayLabel(group.day, i18n.language) : t('crm.tasks.no_day_group', 'No day set')}
                  </h3>
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

function Empty({ tab, searching, onAdd }: { tab: Bucket; searching: boolean; onAdd: () => void }) {
  const { t } = useTranslation()
  if (searching) return <EmptyState icon={ListChecks} title={t('crm.tasks.none_found', 'No task matches')} line={t('crm.tasks.none_found_line', 'Try another word, or another tab.')} />
  const add = <Button variant="secondary" onClick={onAdd}><Plus size={15} aria-hidden />{t('crm.tasks.new', 'Add a task')}</Button>
  switch (tab) {
    case 'overdue': return <EmptyState icon={Sparkles} title={t('crm.tasks.empty_overdue', 'Nothing overdue')} line={t('crm.tasks.empty_overdue_line', 'Every task is on time.')} />
    case 'today': return <EmptyState icon={CalendarCheck} title={t('crm.tasks.empty_today', 'Nothing due today')} line={t('crm.tasks.empty_today_line', 'Add the next call or email so it is not forgotten.')} action={add} />
    case 'upcoming': return <EmptyState icon={ListChecks} title={t('crm.tasks.empty_upcoming', 'Nothing planned')} line={t('crm.tasks.empty_upcoming_line', 'Tasks for the days ahead show here.')} action={add} />
    default: return <EmptyState icon={CheckCircle2} title={t('crm.tasks.empty_done', 'Nothing done yet')} line={t('crm.tasks.empty_done_line', 'Tasks you mark done show here with what came of them.')} />
  }
}
