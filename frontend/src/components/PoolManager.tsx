import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Inbox, Hand, Plus, Flag, Loader2, Search, Pencil, Trash2, Sparkles,
  Infinity as InfinityIcon, CalendarRange, Calendar as CalendarIcon,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '../lib/api'
import { usePlannerMeta, resolveGroupMeta, getIcon } from '../lib/plannerMeta'

type Horizon = 'general' | 'week' | 'day'

export type PoolTask = {
  id: number
  title: string
  priority?: string | null
  task_group?: string | null
  task_category?: string | null
  duration_minutes?: number | null
  description?: string | null
  pool_horizon?: Horizon | null
  pool_due_date?: string | null
  created_at?: string
}

interface Props {
  plannerSkills?: string[] | null
  isManager?: boolean
  /** Open the full new-task drawer in pool mode for a given horizon. */
  onNewTask: (horizon: Horizon) => void
  /** Open the full edit drawer for a pool task (manager quick-edit). */
  onEditTask: (task: any) => void
}

const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }
const parseDay = (s?: string | null) => { if (!s) return null; const d = new Date(String(s).slice(0, 10) + 'T00:00:00'); return isNaN(d.getTime()) ? null : d }
const fmtDM = (d: Date) => `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`

/** Relative "added N ago" from a created_at timestamp. */
function addedAgo(iso?: string): string {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (isNaN(then)) return ''
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000))
  if (mins < 60) return `${mins || 1}m ago`
  const h = Math.round(mins / 60)
  if (h < 24) return `${h}h ago`
  const days = Math.round(h / 24)
  return `${days}d ago`
}

/**
 * Urgency read for a pool task, computed client-side vs local today.
 * Nothing changes server-side — display only.
 */
function urgency(t: PoolTask): { label: string; tone: 'normal' | 'warn' | 'over' } {
  const horizon = (t.pool_horizon || 'general') as Horizon
  const due = parseDay(t.pool_due_date)
  const today = startOfToday()
  if (horizon === 'day' && due) {
    const diff = Math.round((due.getTime() - today.getTime()) / 86400000)
    if (diff < 0) return { label: 'Overdue', tone: 'over' }
    if (diff === 0) return { label: 'Today', tone: 'warn' }
    if (diff === 1) return { label: 'Tomorrow', tone: 'normal' }
    if (diff <= 6) return { label: `in ${diff} days`, tone: 'normal' }
    return { label: fmtDM(due), tone: 'normal' }
  }
  if (horizon === 'week') {
    // 'week' due is the server-computed (UTC) end-of-week; a 1-day grace
    // absorbs the server-UTC vs viewer-local skew at the Sun→Mon boundary
    // while still flagging genuinely stale week tasks (≥7 days past).
    if (due && due.getTime() < today.getTime() - 86400000) return { label: 'Overdue', tone: 'over' }
    return { label: due ? `by ${fmtDM(due)}` : 'this week', tone: 'normal' }
  }
  return { label: t.created_at ? `added ${addedAgo(t.created_at)}` : 'anytime', tone: 'normal' }
}

const COLUMNS: Array<{ key: Horizon; title: string; icon: any; accent: string; hint: string }> = [
  { key: 'day',     title: 'For a day',   icon: CalendarIcon,  accent: '#a78bfa', hint: 'Needs doing on a set day' },
  { key: 'week',    title: 'This week',   icon: CalendarRange, accent: '#3b82f6', hint: 'Get it done within the week' },
  { key: 'general', title: 'General',     icon: InfinityIcon,  accent: '#94a3b8', hint: 'Whenever there is capacity' },
]

/**
 * The Pool tab. A dedicated surface to author + organise UNASSIGNED,
 * UNSCHEDULED work (the "open pool") into three time horizons —
 * For-a-day / This-week / General — categorised by type (task_group,
 * colour-coded) and highlighted by relevance to the viewer's skills.
 *
 * Reads the same ['planner-backlog','pool'] rows as the BacklogStrip +
 * Team pool column, so the three surfaces stay in lock-step. Claiming
 * pulls a task into the claimer's bucket (server-authoritative skill
 * gate); the horizon rides along as metadata.
 */
export function PoolManager({ plannerSkills = null, isManager = false, onNewTask, onEditTask }: Props) {
  const qc = useQueryClient()
  const { groupNames, customGroupMeta, channels } = usePlannerMeta()
  const channelLabel = useMemo(() => Object.fromEntries(channels.map(c => [c.key, c])), [channels])

  const [typeFilter, setTypeFilter] = useState('')          // '' = all types
  const [relevantOnly, setRelevantOnly] = useState(false)
  const [search, setSearch] = useState('')

  const { data: pool = [], isLoading } = useQuery<PoolTask[]>({
    queryKey: ['planner-backlog', 'pool'],
    queryFn: () => api.get('/v1/admin/planner/backlog', { params: { scope: 'pool' } }).then((r: any) => r.data),
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['planner-backlog'] })
    qc.invalidateQueries({ queryKey: ['planner-tasks']   })
    qc.invalidateQueries({ queryKey: ['planner-stats']   })
  }
  const claimMutation = useMutation({
    mutationFn: (id: number) => api.post(`/v1/admin/planner/tasks/${id}/claim`),
    onSuccess: () => { invalidate(); toast.success('Claimed — it is in your backlog now') },
    onError: (e: any) => {
      if (e.response?.status === 409) { toast.error('Already claimed by ' + (e.response?.data?.employee_name || 'someone else')); invalidate() }
      else if (e.response?.status === 403) toast.error(e.response?.data?.error || 'You cannot claim this task type')
      else toast.error(e.response?.data?.message || 'Error')
    },
  })
  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/v1/admin/planner/tasks/${id}`),
    onSuccess: () => { invalidate(); toast.success('Deleted') },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  })

  // Relevance mirrors the server claim gate exactly: null skills = all
  // relevant; a task with no type = relevant to everyone; else the type
  // must be in the viewer's skill allowlist.
  const skillsSet = Array.isArray(plannerSkills) && plannerSkills.length > 0
  const isRelevant = (t: PoolTask) => !skillsSet || !t.task_group || plannerSkills!.includes(t.task_group)
  // The toggle only does something for a viewer who can see tasks OUTSIDE
  // their skills — i.e. a manager (sees the whole pool) with a skill set.
  const showRelevanceToggle = skillsSet && isManager

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return pool.filter(t =>
      (!typeFilter || (t.task_group || '') === typeFilter)
      && (!relevantOnly || isRelevant(t))
      && (!q || (t.title || '').toLowerCase().includes(q))
    )
  }, [pool, typeFilter, relevantOnly, search, plannerSkills])

  const columns = useMemo(() => {
    const byH: Record<Horizon, PoolTask[]> = { day: [], week: [], general: [] }
    for (const t of filtered) {
      const h = (t.pool_horizon || 'general') as Horizon
      ;(byH[h] || byH.general).push(t)
    }
    // Day column sorts by due date asc (soonest / most overdue first);
    // others by priority then recency.
    const pri = (p?: string | null) => (p || '').toLowerCase() === 'high' ? 0 : (p || '').toLowerCase() === 'low' ? 2 : 1
    byH.day.sort((a, b) => (parseDay(a.pool_due_date)?.getTime() ?? Infinity) - (parseDay(b.pool_due_date)?.getTime() ?? Infinity))
    const sortStd = (a: PoolTask, b: PoolTask) => pri(a.priority) - pri(b.priority) || (b.created_at || '').localeCompare(a.created_at || '')
    byH.week.sort(sortStd); byH.general.sort(sortStd)
    return byH
  }, [filtered])

  const typeTabs = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const t of pool) { const g = t.task_group || ''; if (g) counts[g] = (counts[g] || 0) + 1 }
    return groupNames.filter(g => counts[g] > 0).map(g => ({ key: g, count: counts[g] }))
  }, [pool, groupNames])

  return (
    <div className="space-y-4">
      {/* ── Header: intro + create + type filter + relevance ── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-gold-500/15 border border-gold-500/30 flex items-center justify-center">
            <Inbox size={17} className="text-gold-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white leading-tight">Open pool</h2>
            <p className="text-[11px] text-gray-500 leading-tight">Unassigned work anyone can pick up. Claim to move it to your backlog.</p>
          </div>
        </div>

        <div className="relative ml-auto">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search pool…"
            className="bg-dark-surface border border-dark-border rounded-lg pl-8 pr-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500 w-[180px]" />
        </div>
        <button onClick={() => onNewTask('general')}
          className="flex items-center gap-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-500 px-3 py-2 rounded-lg transition-colors">
          <Plus size={16} /> New pool task
        </button>
      </div>

      {/* Type filter + relevance toggle */}
      {(typeTabs.length > 0 || showRelevanceToggle) && (
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setTypeFilter('')}
            className={'px-3 py-1.5 rounded-full text-xs font-medium border transition ' +
              (typeFilter === '' ? 'bg-primary-500 text-black border-primary-500' : 'bg-dark-surface text-gray-300 border-dark-border hover:text-white hover:border-white/15')}>
            All types <span className="text-[10px] opacity-70">{pool.length}</span>
          </button>
          {typeTabs.map(tt => {
            const meta = resolveGroupMeta(tt.key, customGroupMeta)
            const active = typeFilter === tt.key
            return (
              <button key={tt.key} onClick={() => setTypeFilter(active ? '' : tt.key)}
                className={'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition ' +
                  (active ? 'text-black border-transparent' : 'bg-dark-surface text-gray-300 border-dark-border hover:text-white hover:border-white/15')}
                style={active ? { background: meta.color } : {}}>
                <span className="w-2 h-2 rounded-sm" style={{ background: active ? '#00000055' : meta.color }} />
                {tt.key} <span className="text-[10px] opacity-70">{tt.count}</span>
              </button>
            )
          })}
          {showRelevanceToggle && (
            <button onClick={() => setRelevantOnly(v => !v)}
              className={'ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition ' +
                (relevantOnly ? 'bg-amber-500/20 text-amber-300 border-amber-500/50' : 'bg-dark-surface text-gray-400 border-dark-border hover:text-white')}>
              <Sparkles size={12} /> Relevant to me
            </button>
          )}
        </div>
      )}

      {/* ── Columns ── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-gray-500"><Loader2 size={20} className="animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {COLUMNS.map(col => {
            const items = columns[col.key]
            const Icon = col.icon
            return (
              <div key={col.key} className="bg-dark-surface/40 border border-dark-border rounded-xl flex flex-col min-h-[200px]">
                <div className="flex items-center gap-2 px-3 py-2.5 border-b border-dark-border">
                  <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: col.accent + '22', border: `1px solid ${col.accent}44` }}>
                    <Icon size={13} style={{ color: col.accent }} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-white leading-tight">{col.title}</div>
                    <div className="text-[10px] text-gray-500 leading-tight truncate">{col.hint}</div>
                  </div>
                  <span className="ml-auto text-[11px] tabular-nums text-gray-500">{items.length}</span>
                  <button onClick={() => onNewTask(col.key)} title={`Add a ${col.title.toLowerCase()} task`}
                    className="w-6 h-6 rounded-md flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/10 transition">
                    <Plus size={14} />
                  </button>
                </div>
                <div className="p-2 space-y-2 flex-1 overflow-y-auto max-h-[62vh]">
                  {items.length === 0 ? (
                    <button onClick={() => onNewTask(col.key)}
                      className="w-full h-16 flex items-center justify-center rounded-lg border border-dashed border-dark-border/60 text-[11px] text-gray-600 hover:text-primary-400 hover:border-primary-500/40 transition">
                      + Add {col.title.toLowerCase()} task
                    </button>
                  ) : items.map(task => (
                    <PoolCard
                      key={task.id}
                      task={task}
                      meta={resolveGroupMeta(task.task_group, customGroupMeta)}
                      channel={task.task_category ? channelLabel[task.task_category] : undefined}
                      relevant={skillsSet ? isRelevant(task) : false}
                      canManage={isManager}
                      onClaim={() => claimMutation.mutate(task.id)}
                      onEdit={() => onEditTask(task)}
                      onDelete={() => { if (confirm('Delete this pool task?')) deleteMutation.mutate(task.id) }}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function PoolCard({ task, meta, channel, relevant, canManage, onClaim, onEdit, onDelete }: {
  task: PoolTask
  meta: { icon: any; color: string }
  channel?: { label: string; icon: string; color: string }
  relevant: boolean
  canManage: boolean
  onClaim: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const u = urgency(task)
  const uCls = u.tone === 'over' ? 'bg-red-500/15 text-red-300 border-red-500/40'
    : u.tone === 'warn' ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
    : 'bg-white/5 text-gray-400 border-white/10'
  const TypeIcon = meta.icon
  const ChIcon = channel ? getIcon(channel.icon) : null
  return (
    <div
      className={'group relative rounded-lg border p-2.5 transition-colors ' + (relevant ? 'border-amber-500/40 ring-1 ring-amber-500/20' : 'border-white/10 hover:border-white/20')}
      style={{ background: meta.color + '12', borderLeft: `3px solid ${meta.color}` }}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium text-white leading-snug break-words pr-6">{task.title}</div>
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            {task.task_group && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ background: meta.color + '22', color: meta.color }}>
                <TypeIcon size={10} /> {task.task_group}
              </span>
            )}
            {channel && (
              <span className="inline-flex items-center gap-1 text-[10px] text-gray-400">
                {ChIcon && <ChIcon size={10} style={{ color: channel.color }} />} {channel.label}
              </span>
            )}
            {(task.priority || '').toLowerCase() === 'high' && (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-red-400"><Flag size={9} /> High</span>
            )}
            {task.duration_minutes ? <span className="text-[10px] text-gray-500 tabular-nums">{task.duration_minutes}m</span> : null}
          </div>
          <div className="flex items-center gap-1.5 mt-1.5">
            <span className={'inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-medium ' + uCls}>{u.label}</span>
            {relevant && <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-400" title="Fits your skills"><Sparkles size={9} /> fits you</span>}
          </div>
        </div>
      </div>

      {/* Hover actions */}
      <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
        {canManage && (
          <>
            <button onClick={onEdit} title="Edit" className="w-6 h-6 rounded bg-white/5 hover:bg-white/15 text-gray-400 hover:text-white flex items-center justify-center"><Pencil size={11} /></button>
            <button onClick={onDelete} title="Delete" className="w-6 h-6 rounded bg-white/5 hover:bg-red-500/25 text-gray-400 hover:text-red-300 flex items-center justify-center"><Trash2 size={11} /></button>
          </>
        )}
        <button onClick={onClaim} title="Claim into my backlog" className="w-6 h-6 rounded bg-gold-500/15 hover:bg-gold-500/30 text-gold-400 flex items-center justify-center"><Hand size={11} /></button>
      </div>
    </div>
  )
}
