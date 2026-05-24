import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ChevronLeft, ChevronRight, Inbox, Users, Flag, Loader2,
  Hand, Send,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '../lib/api'

type BacklogTask = {
  id: number
  title: string
  priority?: string | null
  task_group?: string | null
  description?: string | null
  duration_minutes?: number | null
  assigned_to_user_id?: number | null
  employee_name?: string | null
  created_at?: string
}

type Scope = 'mine' | 'pool'

interface Props {
  /** Current authenticated user id — used to label "Mine" tab + claim affordance. */
  currentUserId?: number | null
  /** Current user's display name — fallback match for legacy employee_name rows. */
  currentUserName?: string
}

const SCOPE_STORAGE_KEY  = 'planner-backlog-scope'
const OPEN_STORAGE_KEY   = 'planner-backlog-open'

/**
 * Sidebar drawer that holds tasks without a scheduled date — either in
 * the current user's private bucket ("Mine") or in the open company-wide
 * pool ("Open pool"). Each task is HTML5-draggable: drop it onto any
 * Schedule / Day / Month cell to schedule it (the existing drop handlers
 * read `sourceDate=''` as "from backlog" and call moveMutation with the
 * cell's date). Dropping a scheduled task back onto the drawer body
 * unschedules it (task_date → null).
 *
 * Manages its own query + claim/release mutations so the parent only
 * has to mount it. The parent's existing `invalidate()` helper is
 * augmented to also invalidate ['planner-backlog'] so the drawer
 * refreshes whenever the calendar changes.
 */
export function BacklogDrawer({ currentUserId, currentUserName = '' }: Props) {
  const qc = useQueryClient()

  // Drawer expand/collapse — persists across reloads so an admin who
  // works headless can keep it tucked away, and a daily-planner type
  // who lives in the backlog can keep it pinned open.
  const [open, setOpen] = useState<boolean>(() => {
    try { return typeof window !== 'undefined' && localStorage.getItem(OPEN_STORAGE_KEY) !== '0' } catch { return true }
  })
  useEffect(() => {
    try { localStorage.setItem(OPEN_STORAGE_KEY, open ? '1' : '0') } catch {}
  }, [open])

  const [scope, setScope] = useState<Scope>(() => {
    try { return (localStorage.getItem(SCOPE_STORAGE_KEY) as Scope) || 'mine' } catch { return 'mine' }
  })
  useEffect(() => {
    try { localStorage.setItem(SCOPE_STORAGE_KEY, scope) } catch {}
  }, [scope])

  const [quickAdd, setQuickAdd] = useState('')
  const [isDropTarget, setIsDropTarget] = useState(false)

  // Backlog query. The two scopes have completely different filters
  // server-side so we run them as two queries — keeps the badge counts
  // accurate without an extra round trip when switching tabs.
  const { data: mineTasks = [], isLoading: mineLoading } = useQuery<BacklogTask[]>({
    queryKey: ['planner-backlog', 'mine', currentUserId ?? null],
    queryFn: () => api.get('/v1/admin/planner/backlog', { params: { scope: 'mine' } }).then((r: any) => r.data),
    enabled: !!currentUserId,
  })
  const { data: poolTasks = [], isLoading: poolLoading } = useQuery<BacklogTask[]>({
    queryKey: ['planner-backlog', 'pool'],
    queryFn: () => api.get('/v1/admin/planner/backlog', { params: { scope: 'pool' } }).then((r: any) => r.data),
  })

  const activeTasks = scope === 'mine' ? mineTasks : poolTasks
  const isLoading   = scope === 'mine' ? mineLoading : poolLoading

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['planner-backlog'] })
    qc.invalidateQueries({ queryKey: ['planner-tasks']   })
    qc.invalidateQueries({ queryKey: ['planner-stats']   })
  }

  const createMutation = useMutation({
    mutationFn: (body: any) => api.post('/v1/admin/planner/tasks', body),
    onSuccess: () => { invalidate(); setQuickAdd(''); toast.success('Added to backlog') },
    onError:  (e: any) => toast.error(e.response?.data?.message || 'Error'),
  })

  const claimMutation = useMutation({
    mutationFn: (id: number) => api.post(`/v1/admin/planner/tasks/${id}/claim`),
    onSuccess: () => { invalidate(); toast.success('Claimed') },
    onError:  (e: any) => {
      if (e.response?.status === 409) {
        toast.error('Already claimed by ' + (e.response?.data?.employee_name || 'someone else'))
        invalidate()
      } else {
        toast.error(e.response?.data?.message || 'Error')
      }
    },
  })

  const releaseMutation = useMutation({
    mutationFn: (id: number) => api.post(`/v1/admin/planner/tasks/${id}/release`),
    onSuccess: () => { invalidate(); toast.success('Released to pool') },
    onError:  (e: any) => toast.error(e.response?.data?.message || 'Error'),
  })

  // Drag-back-to-backlog → unschedule. Existing scheduled task chips
  // pass taskId + sourceDate via dataTransfer; sourceDate !== '' means
  // it came from a calendar cell, so we send task_date=null + clear the
  // start_time so it doesn't re-render at a stale position when next
  // scheduled. Same mutation pattern as the calendar's moveMutation.
  const unscheduleMutation = useMutation({
    mutationFn: (id: number) => api.patch(`/v1/admin/planner/tasks/${id}/move`, { task_date: null }),
    onSuccess: () => { invalidate(); toast.success('Moved to backlog') },
    onError:  (e: any) => toast.error(e.response?.data?.message || 'Error'),
  })

  const handleQuickAdd = (intoPool: boolean) => {
    const title = quickAdd.trim()
    if (!title) return
    createMutation.mutate({
      title,
      // intoPool=true → unassigned, no employee. intoPool=false → assign
      // to current user immediately so it lands in their bucket.
      assigned_to_user_id: intoPool ? null : (currentUserId ?? null),
      employee_name:       intoPool ? null : (currentUserName || null),
      task_date:           null,
      priority:            'normal',
      status:              'todo',
    })
  }

  // Sort: pinned-by-priority then newest. "High" floats to the top so
  // the user's eye lands on what they should pick next.
  const sorted = useMemo(() => {
    const pri = (p: string | null | undefined) => p === 'high' ? 0 : p === 'normal' ? 1 : 2
    return [...activeTasks].sort((a, b) => {
      const d = pri(a.priority) - pri(b.priority)
      if (d !== 0) return d
      return (b.created_at || '').localeCompare(a.created_at || '')
    })
  }, [activeTasks])

  // Collapsed rail — vertical icon strip with a count badge.
  if (!open) {
    const total = (mineTasks.length || 0) + (poolTasks.length || 0)
    return (
      <div className="hidden md:flex flex-col items-center gap-2 w-12 bg-dark-surface border-r border-white/5 py-3 sticky top-0 h-screen">
        <button
          onClick={() => setOpen(true)}
          className="w-10 h-10 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white relative"
          title="Show backlog"
        >
          <Inbox size={18} />
          {total > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-gold-500 text-black text-[10px] font-bold flex items-center justify-center">
              {total > 99 ? '99+' : total}
            </span>
          )}
        </button>
        <button
          onClick={() => setOpen(true)}
          className="w-10 h-10 rounded-lg bg-white/0 hover:bg-white/5 flex items-center justify-center text-gray-500"
          title="Expand"
        >
          <ChevronRight size={18} />
        </button>
      </div>
    )
  }

  return (
    <div
      className={[
        'hidden md:flex flex-col w-[280px] bg-dark-surface border-r sticky top-0 h-screen overflow-hidden',
        isDropTarget ? 'border-gold-500 ring-2 ring-gold-500/30' : 'border-white/5',
      ].join(' ')}
      onDragOver={(e) => {
        const sourceDate = e.dataTransfer.types.includes('text/plain')
          ? '' : e.dataTransfer.getData('sourceDate')
        // Only highlight + accept drops from CALENDAR (sourceDate is set)
        // — drops from inside the drawer are no-ops.
        if (sourceDate !== '' && sourceDate !== undefined) {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
          setIsDropTarget(true)
        }
      }}
      onDragLeave={() => setIsDropTarget(false)}
      onDrop={(e) => {
        e.preventDefault()
        setIsDropTarget(false)
        const taskId = Number(e.dataTransfer.getData('taskId'))
        const sourceDate = e.dataTransfer.getData('sourceDate')
        if (!taskId || !sourceDate) return  // ignore drops from backlog itself
        unscheduleMutation.mutate(taskId)
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <Inbox size={16} className="text-gold-400" />
          <span className="text-sm font-semibold text-white">Backlog</span>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="w-7 h-7 rounded-md hover:bg-white/5 flex items-center justify-center text-gray-400"
          title="Collapse"
        >
          <ChevronLeft size={16} />
        </button>
      </div>

      {/* Scope tabs */}
      <div className="flex gap-1 p-2 border-b border-white/5">
        <button
          onClick={() => setScope('mine')}
          className={[
            'flex-1 px-2 py-1.5 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 transition',
            scope === 'mine' ? 'bg-gold-500 text-black' : 'bg-white/5 text-gray-300 hover:bg-white/10',
          ].join(' ')}
        >
          <Hand size={12} />
          Mine
          {mineTasks.length > 0 && (
            <span className={['ml-0.5 px-1 rounded text-[10px] tabular-nums', scope === 'mine' ? 'bg-black/20' : 'bg-white/10'].join(' ')}>{mineTasks.length}</span>
          )}
        </button>
        <button
          onClick={() => setScope('pool')}
          className={[
            'flex-1 px-2 py-1.5 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 transition',
            scope === 'pool' ? 'bg-gold-500 text-black' : 'bg-white/5 text-gray-300 hover:bg-white/10',
          ].join(' ')}
        >
          <Users size={12} />
          Open pool
          {poolTasks.length > 0 && (
            <span className={['ml-0.5 px-1 rounded text-[10px] tabular-nums', scope === 'pool' ? 'bg-black/20' : 'bg-white/10'].join(' ')}>{poolTasks.length}</span>
          )}
        </button>
      </div>

      {/* Quick add */}
      <div className="p-2 border-b border-white/5">
        <input
          value={quickAdd}
          onChange={(e) => setQuickAdd(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleQuickAdd(scope === 'pool')
            }
          }}
          placeholder={scope === 'pool' ? 'New task → open pool…' : 'New task → my bucket…'}
          className="w-full bg-dark-bg border border-white/10 rounded-md px-2.5 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-gold-500/50"
        />
        {quickAdd.trim() && (
          <div className="flex gap-1 mt-1.5">
            <button
              onClick={() => handleQuickAdd(false)}
              disabled={createMutation.isPending}
              className="flex-1 px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-[10px] text-gray-300 flex items-center justify-center gap-1"
            >
              <Hand size={10} /> Mine
            </button>
            <button
              onClick={() => handleQuickAdd(true)}
              disabled={createMutation.isPending}
              className="flex-1 px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-[10px] text-gray-300 flex items-center justify-center gap-1"
            >
              <Users size={10} /> Pool
            </button>
          </div>
        )}
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {isLoading && (
          <div className="flex items-center justify-center py-6 text-gray-500">
            <Loader2 size={16} className="animate-spin" />
          </div>
        )}
        {!isLoading && sorted.length === 0 && (
          <div className="px-2 py-6 text-center text-[11px] text-gray-500">
            {scope === 'mine' ? 'No backlog tasks assigned to you.' : 'Open pool is empty.'}
            <div className="mt-1 text-gray-600">
              Drag any scheduled task here to unschedule it, or type above to add one.
            </div>
          </div>
        )}
        {sorted.map((task) => (
          <BacklogCard
            key={task.id}
            task={task}
            scope={scope}
            onClaim={() => claimMutation.mutate(task.id)}
            onRelease={() => releaseMutation.mutate(task.id)}
          />
        ))}
      </div>

      {/* Footer hint */}
      <div className="p-2 border-t border-white/5 text-[10px] text-gray-600">
        Drag a card onto any calendar cell to schedule it.
      </div>
    </div>
  )
}

interface CardProps {
  task: BacklogTask
  scope: Scope
  onClaim: () => void
  onRelease: () => void
}

function BacklogCard({ task, scope, onClaim, onRelease }: CardProps) {
  const accent =
    task.priority === 'high'   ? 'border-l-red-400' :
    task.priority === 'low'    ? 'border-l-gray-500' :
                                 'border-l-blue-400'

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('taskId', String(task.id))
        // Empty sourceDate signals "from backlog" to every calendar drop
        // handler — those treat it the same as a regular move except the
        // task gets a brand-new task_date instead of moving from an old one.
        e.dataTransfer.setData('sourceDate', '')
      }}
      className={[
        'group bg-white/5 hover:bg-white/10 border border-white/10 rounded-md px-2 py-1.5',
        'border-l-2 cursor-move transition',
        accent,
      ].join(' ')}
    >
      <div className="flex items-start gap-1.5">
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-white leading-tight truncate" title={task.title}>
            {task.title}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-gray-500">
            {task.task_group && (
              <span className="px-1 rounded bg-white/5 text-gray-400">{task.task_group}</span>
            )}
            {task.priority === 'high' && (
              <span className="flex items-center gap-0.5 text-red-400"><Flag size={9} />high</span>
            )}
            {task.duration_minutes && (
              <span className="text-gray-500">{task.duration_minutes}m</span>
            )}
            {scope === 'mine' && task.employee_name && (
              <span className="truncate text-gray-600">{task.employee_name}</span>
            )}
          </div>
        </div>
        {/* Claim / release affordance — only show on hover to keep cards tidy. */}
        {scope === 'pool' ? (
          <button
            onClick={(e) => { e.stopPropagation(); onClaim() }}
            className="opacity-0 group-hover:opacity-100 transition w-6 h-6 rounded bg-gold-500/15 hover:bg-gold-500/25 text-gold-400 flex items-center justify-center"
            title="Claim into my bucket"
          >
            <Hand size={11} />
          </button>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); onRelease() }}
            className="opacity-0 group-hover:opacity-100 transition w-6 h-6 rounded bg-white/5 hover:bg-white/10 text-gray-400 flex items-center justify-center"
            title="Release back to open pool"
          >
            <Send size={11} />
          </button>
        )}
      </div>
    </div>
  )
}
