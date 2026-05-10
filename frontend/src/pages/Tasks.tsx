import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import toast from 'react-hot-toast'
import {
  Plus, Phone, Mail, Calendar as CalendarIcon, FileText,
  CheckCircle2, ChevronRight, Search, Building2, RotateCcw,
  Trash2, AlertCircle, ListChecks,
} from 'lucide-react'
import { TaskDrawer } from '../components/TaskDrawer'

/**
 * Standalone Tasks page (`/tasks`) — CRM Phase 3.
 *
 * Surfaces the same `Task` rows that power the lead-detail Open Tasks
 * panel, but as a per-user inbox: filter by status (Open / Overdue /
 * Today / Soon / Completed), grouped by day, with inline complete /
 * reopen / edit / delete. Calendar view + drag-to-reschedule are
 * Phase 3.5 — out of scope for this drop.
 *
 * See apps/loyalty/CRM_IMPROVEMENT_PLAN.md.
 */

interface Task {
  id: number
  type: string
  title: string
  description: string | null
  due_at: string | null
  completed_at: string | null
  outcome: string | null
  inquiry_id: number | null
  guest_id: number | null
  assignee?: { id: number; name: string }
  inquiry?: { id: number; guest_id: number; status: string }
}

type Status = 'open' | 'overdue' | 'due_today' | 'due_soon' | 'completed' | 'all'

const TASK_TYPES: Record<string, { label: string; icon: any; color: string }> = {
  call:           { label: 'Call',           icon: Phone,        color: '#22d3ee' },
  email:          { label: 'Email',          icon: Mail,         color: '#a78bfa' },
  meeting:        { label: 'Meeting',        icon: CalendarIcon, color: '#fbbf24' },
  send_proposal:  { label: 'Send proposal',  icon: FileText,     color: '#34d399' },
  follow_up:      { label: 'Follow-up',      icon: ChevronRight, color: '#94a3b8' },
  site_visit:     { label: 'Site visit',     icon: Building2,    color: '#f472b6' },
  custom:         { label: 'Custom',         icon: ListChecks,   color: '#94a3b8' },
}

const STATUS_CHIPS: { id: Status; label: string; color: string }[] = [
  { id: 'open',       label: 'Open',       color: '#3b82f6' },
  { id: 'overdue',    label: 'Overdue',    color: '#ef4444' },
  { id: 'due_today',  label: 'Today',      color: '#f59e0b' },
  { id: 'due_soon',   label: 'Soon',       color: '#22d3ee' },
  { id: 'completed',  label: 'Completed',  color: '#10b981' },
  { id: 'all',        label: 'All',        color: '#94a3b8' },
]

export function Tasks() {
  const qc = useQueryClient()
  const [status, setStatus] = useState<Status>('open')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Task | 'new' | null>(null)

  const { data, isLoading } = useQuery<{ data: Task[]; meta: any }>({
    queryKey: ['tasks-list', status],
    queryFn: () => api.get('/v1/admin/tasks', { params: { status, per_page: 200 } }).then(r => r.data),
    refetchInterval: 30_000,
  })

  // Counts for the chip badges. Cheap because the backend already
  // counts per-status when you ask. We just don't want to do 6 calls
  // upfront — fetch counts only for the most-glanced statuses.
  const { data: overdueCount } = useQuery<{ data: Task[]; meta: any }>({
    queryKey: ['tasks-list', 'overdue'],
    queryFn: () => api.get('/v1/admin/tasks', { params: { status: 'overdue', per_page: 1 } }).then(r => r.data),
    enabled: status !== 'overdue',
    staleTime: 60_000,
  })
  const { data: todayCount } = useQuery<{ data: Task[]; meta: any }>({
    queryKey: ['tasks-list', 'due_today'],
    queryFn: () => api.get('/v1/admin/tasks', { params: { status: 'due_today', per_page: 1 } }).then(r => r.data),
    enabled: status !== 'due_today',
    staleTime: 60_000,
  })

  const tasks = useMemo(() => {
    const all = data?.data ?? []
    if (!search.trim()) return all
    const q = search.toLowerCase()
    return all.filter(t =>
      t.title.toLowerCase().includes(q)
      || (t.description ?? '').toLowerCase().includes(q)
      || (t.assignee?.name ?? '').toLowerCase().includes(q)
    )
  }, [data?.data, search])

  // Group by due-day bucket. "Overdue" rows above; then today, tomorrow,
  // this week, later, and "no due date" at the bottom. Completed view
  // groups by completed_at instead.
  const groups = useMemo(() => groupByDay(tasks, status === 'completed'), [tasks, status])

  const completeMut = useMutation({
    mutationFn: (id: number) => api.post(`/v1/admin/tasks/${id}/complete`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks-list'] })
      qc.invalidateQueries({ queryKey: ['inquiry'] }) // any open lead-detail page
      toast.success('Task completed')
    },
    onError: () => toast.error('Could not complete'),
  })

  const reopenMut = useMutation({
    mutationFn: (id: number) => api.post(`/v1/admin/tasks/${id}/reopen`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks-list'] })
      toast.success('Reopened')
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/v1/admin/tasks/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks-list'] })
      toast.success('Task deleted')
    },
  })

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Tasks</h1>
          <p className="text-sm text-t-secondary mt-0.5">
            {overdueCount?.meta?.total ? `${overdueCount.meta.total} overdue · ` : ''}
            {todayCount?.meta?.total ? `${todayCount.meta.total} due today` : 'Stay on top of your follow-ups'}
          </p>
        </div>
        <button
          onClick={() => setEditing('new')}
          className="bg-accent text-black font-bold rounded-lg px-4 py-2 text-sm flex items-center gap-2 hover:bg-accent/90"
        >
          <Plus size={15} /> New task
        </button>
      </div>

      {/* Status chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {STATUS_CHIPS.map(chip => {
          const active = status === chip.id
          return (
            <button
              key={chip.id}
              onClick={() => setStatus(chip.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap border transition ${
                active
                  ? 'text-black'
                  : 'text-t-secondary hover:text-white border-dark-border hover:bg-dark-surface2'
              }`}
              style={active ? { background: chip.color, borderColor: chip.color } : {}}
            >
              {chip.label}
            </button>
          )
        })}

        <div className="flex-1" />

        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-t-secondary" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search…"
            className="bg-dark-surface border border-dark-border rounded-lg pl-7 pr-3 py-1.5 text-xs outline-none focus:border-accent w-44"
          />
        </div>
      </div>

      {/* Body */}
      {isLoading ? (
        <div className="text-center py-16 text-sm text-t-secondary">Loading tasks…</div>
      ) : tasks.length === 0 ? (
        <EmptyState status={status} onCreate={() => setEditing('new')} />
      ) : (
        <div className="space-y-5">
          {groups.map(g => (
            <div key={g.label}>
              <h3 className="flex items-center gap-2 mb-2 text-[11px] uppercase tracking-wider font-bold text-t-secondary">
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: g.color }}
                />
                {g.label}
                <span className="text-t-secondary/60 font-normal">({g.tasks.length})</span>
              </h3>
              <div className="space-y-1.5">
                {g.tasks.map(t => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    onComplete={() => completeMut.mutate(t.id)}
                    onReopen={() => reopenMut.mutate(t.id)}
                    onEdit={() => setEditing(t)}
                    onDelete={() => {
                      if (window.confirm(`Delete "${t.title}"?`)) deleteMut.mutate(t.id)
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <TaskDrawer
          task={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['tasks-list'] })
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

/* ── Task card ──────────────────────────────────────────────── */

function TaskCard({ task, onComplete, onReopen, onEdit, onDelete }: {
  task: Task
  onComplete: () => void
  onReopen: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const meta = TASK_TYPES[task.type] ?? TASK_TYPES.custom
  const Icon = meta.icon
  const completed = !!task.completed_at
  const overdue = !completed && task.due_at && new Date(task.due_at) < new Date()

  return (
    <div
      className={`group flex items-start gap-3 p-3 rounded-lg border transition ${
        completed
          ? 'bg-emerald-500/[0.03] border-emerald-500/15 opacity-70'
          : overdue
            ? 'bg-red-500/[0.03] border-red-500/20 hover:border-red-500/40'
            : 'bg-dark-surface border-dark-border hover:border-dark-border/80'
      }`}
    >
      <button
        onClick={completed ? onReopen : onComplete}
        className={`w-5 h-5 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center transition ${
          completed
            ? 'bg-emerald-500 border-emerald-500'
            : 'border-dark-border hover:border-emerald-400'
        }`}
        title={completed ? 'Reopen' : 'Mark complete'}
      >
        {completed && <CheckCircle2 size={12} className="text-black" />}
      </button>

      <div
        className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{ background: meta.color + '20', border: `1px solid ${meta.color}40` }}
      >
        <Icon size={13} style={{ color: meta.color }} />
      </div>

      <div className="flex-1 min-w-0 cursor-pointer" onClick={onEdit}>
        <p className={`text-sm font-semibold ${completed ? 'text-t-secondary line-through' : 'text-white'}`}>
          {task.title}
        </p>
        {task.description && (
          <p className="text-xs text-t-secondary mt-0.5 line-clamp-2">{task.description}</p>
        )}
        <div className="flex items-center gap-2 mt-1 text-[11px] text-t-secondary flex-wrap">
          <span className="uppercase tracking-wide font-bold" style={{ color: meta.color }}>
            {meta.label}
          </span>
          {task.due_at && (
            <>
              <span>·</span>
              <span className={overdue ? 'text-red-400 font-bold' : ''}>
                {overdue && <AlertCircle size={10} className="inline mr-0.5" />}
                {formatDue(task.due_at, completed)}
              </span>
            </>
          )}
          {task.assignee && (
            <>
              <span>·</span>
              <span>{task.assignee.name}</span>
            </>
          )}
          {task.inquiry_id && (
            <>
              <span>·</span>
              <Link
                to={`/inquiries/${task.inquiry_id}`}
                onClick={e => e.stopPropagation()}
                className="text-accent hover:underline"
              >
                Inquiry #{task.inquiry_id}
              </Link>
            </>
          )}
          {task.outcome && (
            <>
              <span>·</span>
              <span className="text-emerald-400 italic">{task.outcome}</span>
            </>
          )}
        </div>
      </div>

      <div className="opacity-0 group-hover:opacity-100 transition flex items-center gap-1">
        {completed ? (
          <button
            onClick={onReopen}
            className="p-1.5 rounded hover:bg-dark-surface2 text-t-secondary hover:text-white"
            title="Reopen"
          >
            <RotateCcw size={13} />
          </button>
        ) : null}
        <button
          onClick={onDelete}
          className="p-1.5 rounded hover:bg-red-500/15 text-t-secondary hover:text-red-400"
          title="Delete"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}


/* ── Empty state ────────────────────────────────────────────── */

function EmptyState({ status, onCreate }: { status: Status; onCreate: () => void }) {
  const message = status === 'overdue'
    ? 'Nothing overdue — keep it that way.'
    : status === 'due_today'
      ? 'Nothing due today.'
      : status === 'completed'
        ? 'No completed tasks yet.'
        : 'No tasks. Add the next thing you need to do.'
  return (
    <div className="text-center py-20 bg-dark-surface border border-dashed border-dark-border rounded-xl">
      <ListChecks size={32} className="text-t-secondary/40 mx-auto mb-3" />
      <p className="text-sm text-t-secondary mb-4">{message}</p>
      {status !== 'completed' && (
        <button
          onClick={onCreate}
          className="bg-accent text-black font-bold rounded-md px-4 py-2 text-sm hover:bg-accent/90 inline-flex items-center gap-2"
        >
          <Plus size={14} /> New task
        </button>
      )}
    </div>
  )
}

/* ── Helpers ────────────────────────────────────────────────── */

interface Group {
  label: string
  color: string
  tasks: Task[]
}

function groupByDay(tasks: Task[], byCompleted: boolean): Group[] {
  const now = new Date()
  const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0)
  const startOfTomorrow = new Date(startOfToday); startOfTomorrow.setDate(startOfTomorrow.getDate() + 1)
  const endOfWeek = new Date(startOfToday); endOfWeek.setDate(endOfWeek.getDate() + 7)

  const buckets: Record<string, Group> = {
    overdue:  { label: 'Overdue',     color: '#ef4444', tasks: [] },
    today:    { label: 'Today',       color: '#f59e0b', tasks: [] },
    tomorrow: { label: 'Tomorrow',    color: '#3b82f6', tasks: [] },
    week:     { label: 'This week',   color: '#22d3ee', tasks: [] },
    later:    { label: 'Later',       color: '#94a3b8', tasks: [] },
    none:     { label: 'No due date', color: '#94a3b8', tasks: [] },
    done:     { label: 'Completed',   color: '#10b981', tasks: [] },
  }

  for (const t of tasks) {
    if (byCompleted) {
      buckets.done.tasks.push(t)
      continue
    }
    if (!t.due_at) {
      buckets.none.tasks.push(t)
      continue
    }
    const d = new Date(t.due_at)
    if (d < startOfToday)        buckets.overdue.tasks.push(t)
    else if (d < startOfTomorrow) buckets.today.tasks.push(t)
    else if (d < new Date(startOfTomorrow.getTime() + 86400000)) buckets.tomorrow.tasks.push(t)
    else if (d < endOfWeek)       buckets.week.tasks.push(t)
    else                          buckets.later.tasks.push(t)
  }

  const order = byCompleted
    ? ['done']
    : ['overdue', 'today', 'tomorrow', 'week', 'later', 'none']

  return order.map(k => buckets[k]).filter(g => g.tasks.length > 0)
}

function formatDue(iso: string, completed: boolean): string {
  const d = new Date(iso)
  const diffMs = d.getTime() - Date.now()
  const absMs = Math.abs(diffMs)
  const past = diffMs < 0
  const mins = Math.floor(absMs / 60_000)

  if (completed) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  if (mins < 60) return past ? `${mins}m ago` : `in ${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return past ? `${hours}h ago` : `in ${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return past ? `${days}d ago` : `in ${days}d`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
