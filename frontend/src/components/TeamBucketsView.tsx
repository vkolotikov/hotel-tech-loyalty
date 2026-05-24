import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Users, Plus, Flag } from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '../lib/api'

type Task = {
  id: number
  title: string
  priority?: string | null
  task_group?: string | null
  duration_minutes?: number | null
  assigned_to_user_id?: number | null
  employee_name?: string | null
}

type Bucket = {
  user_id: number
  user_name: string
  avatar_url?: string | null
  tasks: Task[]
}

type TeamData = { pool: Task[]; buckets: Bucket[] }

/**
 * Full-width manager-only kanban — one column per active staff member's
 * backlog bucket + the open pool. Drag a card between columns to
 * reassign (PATCH /move with new assigned_to_user_id + employee_name).
 *
 * Replaces the old "team mode" toggle on the BacklogDrawer which widened
 * the drawer to 720px and squeezed the schedule off the right edge.
 * Promoting this to its own page-level tab lets the kanban breathe
 * (full viewport width, large droppable columns, real bucket headers
 * with avatar + task count + total estimated hours).
 *
 * Optimistic patch on reassign so the card jumps the instant the drop
 * lands. Same rollback-on-error pattern as the calendar's moveMutation.
 */
export function TeamBucketsView({ currentUserId, invalidate }: {
  currentUserId: number | null
  invalidate: () => void
}) {
  const qc = useQueryClient()
  const [quickAdd, setQuickAdd] = useState('')
  const [hotCol, setHotCol] = useState<string | null>(null)

  const { data, isLoading } = useQuery<TeamData>({
    queryKey: ['planner-backlog', 'team'],
    queryFn: () => api.get('/v1/admin/planner/backlog', { params: { scope: 'team' } }).then((r: any) => r.data),
  })

  // Create-into-pool quick add. Pinned to the top right so the most
  // common manager action ("dump 5 new tasks into the open pool, let
  // staff claim") is one click + Enter.
  const createMutation = useMutation({
    mutationFn: (title: string) => api.post('/v1/admin/planner/tasks', {
      title,
      task_date: null,
      status: 'todo',
      priority: 'normal',
      assigned_to_user_id: null,
      employee_name: null,
    }),
    onSuccess: () => { invalidate(); setQuickAdd(''); toast.success('Added to pool') },
    onError:  (e: any) => toast.error(e.response?.data?.message || 'Error'),
  })

  // Reassign — optimistic across the team payload so the card jumps
  // the instant the drop lands.
  const reassignMutation = useMutation({
    mutationFn: (vars: { id: number; user_id: number | null; user_name: string | null }) =>
      api.patch(`/v1/admin/planner/tasks/${vars.id}/move`, {
        task_date: null,
        assigned_to_user_id: vars.user_id,
        employee_name: vars.user_name,
      }),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ['planner-backlog', 'team'] })
      const snapshot = qc.getQueryData<TeamData>(['planner-backlog', 'team'])
      if (!snapshot) return { snapshot }
      let moved: Task | undefined
      const stripFrom = (list: Task[]) => {
        const idx = list.findIndex(t => t.id === vars.id)
        if (idx === -1) return list
        moved = { ...list[idx], assigned_to_user_id: vars.user_id, employee_name: vars.user_name }
        return [...list.slice(0, idx), ...list.slice(idx + 1)]
      }
      const next: TeamData = {
        pool: stripFrom(snapshot.pool),
        buckets: snapshot.buckets.map(b => ({ ...b, tasks: stripFrom(b.tasks) })),
      }
      if (!moved) return { snapshot }
      if (vars.user_id === null) next.pool = [moved, ...next.pool]
      else next.buckets = next.buckets.map(b =>
        b.user_id === vars.user_id ? { ...b, tasks: [moved!, ...b.tasks] } : b)
      qc.setQueryData(['planner-backlog', 'team'], next)
      return { snapshot }
    },
    onError: (e: any, _vars, ctx: any) => {
      if (ctx?.snapshot) qc.setQueryData(['planner-backlog', 'team'], ctx.snapshot)
      toast.error(e.response?.data?.message || 'Could not reassign')
    },
    onSettled: () => invalidate(),
  })

  const handleQuickAdd = () => {
    const title = quickAdd.trim()
    if (!title) return
    createMutation.mutate(title)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={20} className="animate-spin text-gray-500" />
      </div>
    )
  }
  if (!data) return null

  // Suppress the current user's own bucket on the team view — they have
  // their personal "Mine" tab in the drawer for that. Keeps the team
  // overview focused on cross-staff visibility.
  const otherBuckets = data.buckets.filter(b => b.user_id !== currentUserId)
  const myBucket = data.buckets.find(b => b.user_id === currentUserId)

  const sumHours = (tasks: Task[]) =>
    (tasks.reduce((s, t) => s + Number(t.duration_minutes ?? 60), 0) / 60).toFixed(1)

  return (
    <div className="space-y-4">
      {/* Header with quick-add into pool */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-primary-500/15 border border-primary-500/30 flex items-center justify-center">
            <Users size={18} className="text-primary-400" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Team workload</h2>
            <p className="text-[11px] text-gray-500">Drag any card between columns to reassign. Drop into Open pool to release.</p>
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <input
            value={quickAdd}
            onChange={(e) => setQuickAdd(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleQuickAdd() } }}
            placeholder="Type a task title and press Enter → Open pool"
            className="bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-primary-500 w-[280px]"
          />
          <button
            onClick={handleQuickAdd}
            disabled={!quickAdd.trim() || createMutation.isPending}
            className="bg-primary-500 hover:bg-primary-400 text-black font-bold rounded-lg px-3 py-2 text-xs disabled:opacity-40 flex items-center gap-1.5"
          >
            <Plus size={13} /> Add to pool
          </button>
        </div>
      </div>

      {/* Kanban columns — horizontally scrollable when many staff */}
      <div className="overflow-x-auto pb-2">
        <div className="flex gap-3" style={{ minWidth: 'fit-content' }}>
          <Column
            id="pool"
            label="Open pool"
            sublabel="Anyone can claim"
            count={data.pool.length}
            hours={sumHours(data.pool)}
            accent="border-cyan-500/40 bg-cyan-500/[0.03]"
            tasks={data.pool}
            isHot={hotCol === 'pool'}
            onDragEnter={() => setHotCol('pool')}
            onDragLeave={() => setHotCol(prev => prev === 'pool' ? null : prev)}
            onDrop={(taskId) => { setHotCol(null); reassignMutation.mutate({ id: taskId, user_id: null, user_name: null }) }}
          />
          {myBucket && (
            <Column
              id={`me-${myBucket.user_id}`}
              label={myBucket.user_name + ' (you)'}
              sublabel="Your bucket"
              count={myBucket.tasks.length}
              hours={sumHours(myBucket.tasks)}
              accent="border-primary-500/40 bg-primary-500/[0.03]"
              tasks={myBucket.tasks}
              isHot={hotCol === `me-${myBucket.user_id}`}
              onDragEnter={() => setHotCol(`me-${myBucket.user_id}`)}
              onDragLeave={() => setHotCol(prev => prev === `me-${myBucket.user_id}` ? null : prev)}
              onDrop={(taskId) => { setHotCol(null); reassignMutation.mutate({ id: taskId, user_id: myBucket.user_id, user_name: myBucket.user_name }) }}
            />
          )}
          {otherBuckets.map(b => (
            <Column
              key={b.user_id}
              id={`u-${b.user_id}`}
              label={b.user_name || 'Unnamed'}
              sublabel={b.tasks.length === 0 ? 'Free' : null}
              count={b.tasks.length}
              hours={sumHours(b.tasks)}
              accent="border-white/10"
              tasks={b.tasks}
              isHot={hotCol === `u-${b.user_id}`}
              onDragEnter={() => setHotCol(`u-${b.user_id}`)}
              onDragLeave={() => setHotCol(prev => prev === `u-${b.user_id}` ? null : prev)}
              onDrop={(taskId) => { setHotCol(null); reassignMutation.mutate({ id: taskId, user_id: b.user_id, user_name: b.user_name }) }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function Column({ id, label, sublabel, count, hours, accent, tasks, isHot, onDragEnter, onDragLeave, onDrop }: {
  id: string
  label: string
  sublabel: string | null
  count: number
  hours: string
  accent: string
  tasks: Task[]
  isHot: boolean
  onDragEnter: () => void
  onDragLeave: () => void
  onDrop: (taskId: number) => void
}) {
  return (
    <div
      onDragEnter={onDragEnter}
      onDragLeave={(e) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) onDragLeave() }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('taskid')) {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
        }
      }}
      onDrop={(e) => {
        e.preventDefault()
        const taskId = Number(e.dataTransfer.getData('taskId'))
        if (taskId) onDrop(taskId)
      }}
      className={[
        'flex-shrink-0 w-[260px] flex flex-col rounded-xl border overflow-hidden transition',
        isHot ? 'border-primary-500 ring-2 ring-primary-500/30 bg-primary-500/[0.06]' : accent,
      ].join(' ')}
    >
      <div className="px-3 py-2.5 border-b border-white/5 bg-dark-surface/40">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-white truncate" title={label}>{label}</div>
            {sublabel && <div className="text-[10px] text-gray-500 mt-0.5">{sublabel}</div>}
          </div>
          <div className="flex items-center gap-2 text-[10px] tabular-nums text-gray-500 flex-shrink-0">
            <span><span className="text-white font-semibold">{count}</span> task{count === 1 ? '' : 's'}</span>
            {count > 0 && <span>·</span>}
            {count > 0 && <span>{hours}h</span>}
          </div>
        </div>
      </div>
      <div className="flex-1 p-2 space-y-1.5 min-h-[200px] max-h-[600px] overflow-y-auto">
        {tasks.length === 0 && (
          <div className="h-full min-h-[180px] flex items-center justify-center text-center text-[10px] text-gray-600 px-3 py-6">
            Drag a task here to assign to <span className="text-gray-400 font-medium">{id === 'pool' ? 'Open pool' : label.replace(' (you)', '')}</span>
          </div>
        )}
        {tasks.map(task => (
          <TeamCard key={task.id} task={task} />
        ))}
      </div>
    </div>
  )
}

function TeamCard({ task }: { task: Task }) {
  const accent =
    task.priority === 'high' ? 'border-l-red-400' :
    task.priority === 'low'  ? 'border-l-gray-500' :
                               'border-l-blue-400'
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('taskId', String(task.id))
        e.dataTransfer.setData('sourceDate', '')
      }}
      className={['bg-white/[0.04] hover:bg-white/[0.07] border border-white/10 rounded-md px-2.5 py-2 cursor-move transition border-l-2', accent].join(' ')}
    >
      <div className="text-xs font-medium text-white leading-tight" title={task.title}>{task.title}</div>
      <div className="flex items-center gap-1.5 mt-1 text-[10px] text-gray-500">
        {task.task_group && (
          <span className="px-1 rounded bg-white/5 text-gray-400">{task.task_group}</span>
        )}
        {task.priority === 'high' && (
          <span className="flex items-center gap-0.5 text-red-400"><Flag size={9} />high</span>
        )}
        {task.duration_minutes && (
          <span className="text-gray-500">{task.duration_minutes}m</span>
        )}
      </div>
    </div>
  )
}
