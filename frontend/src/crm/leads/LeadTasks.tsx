import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ChevronDown, Plus } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { useBoot } from '../CrmProvider'
import { get, params } from '../lib/api'
import { QueryState } from '../ui/QueryState'
import { splitBuckets, type Task } from '../tasks/taskLogic'
import { TaskList } from '../tasks/TaskList'
import type { LeadDetail, MetaList } from './leadTypes'

/**
 * The Tasks tab (`GET tasks?inquiry_id=`): the open ones first (overdue, today, later, on the venue's days), the done
 * ones on request; a new one for this lead in the shared task form (the record holds it, so its header adds one too).
 */
export function LeadTasks({ lead, name, onAdd }: { lead: LeadDetail; name: string; onAdd: () => void }) {
  const { t } = useTranslation()
  const boot = useBoot()
  const [showDone, setShowDone] = useState(false)
  const query = { inquiry_id: lead.id, status: 'all', per_page: 100 }
  const tasks = useQuery({
    queryKey: ['crm', 'tasks', 'lead', lead.id],
    queryFn: () => get<MetaList<Task>>(`tasks${params(query)}`),
  })
  const all = tasks.data?.data ?? []
  const buckets = splitBuckets(all, boot.venue.today, boot.venue.timezone)
  const open = [...buckets.overdue, ...buckets.today, ...buckets.upcoming]
  const done = all.filter(task => task.completed_at)
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {buckets.overdue.length > 0 && <span className="text-xs font-medium text-a-danger">{t('crm.leads.tasks_overdue', '{{count}} overdue', { count: buckets.overdue.length })}</span>}
        <Button size="sm" className="ml-auto" onClick={onAdd}><Plus size={14} aria-hidden />{t('crm.leads.task_add_short', 'Add a task')}</Button>
      </div>
      <QueryState loading={tasks.isLoading} error={tasks.error} onRetry={() => { void tasks.refetch() }} rows={2}>
        {open.length === 0 && done.length === 0 && <p className="py-6 text-center text-sm text-a-text-2">{t('crm.leads.tasks_empty', 'No tasks for this lead.')}</p>}
        {open.length > 0 && <div className="overflow-hidden rounded-2xl border border-a-border bg-a-surface"><TaskList tasks={open} showLead={false} leadName={name} /></div>}
        {done.length > 0 && (
          <div>
            <button type="button" aria-expanded={showDone} onClick={() => setShowDone(s => !s)} className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-a-accent-text hover:underline">
              <ChevronDown size={14} aria-hidden className={`transition-transform ${showDone ? 'rotate-180' : ''}`} />
              {showDone ? t('crm.leads.tasks_hide_done', 'Hide the done ones') : t('crm.leads.tasks_show_done', 'Show {{count}} done', { count: done.length })}
            </button>
            {showDone && <div className="overflow-hidden rounded-2xl border border-a-border bg-a-surface"><TaskList tasks={done} showLead={false} leadName={name} /></div>}
          </div>
        )}
      </QueryState>
    </div>
  )
}
