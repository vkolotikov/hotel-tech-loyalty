import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Inbox, Users, Flag, Loader2, Hand, X, Plus, Search,
  Calendar as CalendarIcon, ChevronDown, ChevronUp,
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
  currentUserId?: number | null
  currentUserName?: string
  /** When set, pool quick-add defaults task_group to the first entry
   *  so a staff member doesn't accidentally create a task they can't
   *  claim themselves (the pool view + claim endpoint both gate on
   *  task_group ∈ skills). */
  plannerSkills?: string[] | null
}

const SCOPE_STORAGE_KEY = 'planner-backlog-scope'
const OPEN_STORAGE_KEY  = 'planner-backlog-strip-open'

/**
 * Horizontal "backlog strip" above the calendar. Replaces the previous
 * left-sidebar drawer which competed with the calendar for horizontal
 * real estate.
 *
 *   ┌─────────────────────────────────────────────────────────────────┐
 *   │ 📥 Backlog · [Mine 3] [Pool 12] · 🔍 search · [+ New] · [▼]   │  ← header (always visible)
 *   ├─────────────────────────────────────────────────────────────────┤
 *   │ [card 1] [card 2] [card 3] [card 4] [card 5] ►►►                │  ← cards row (when expanded)
 *   └─────────────────────────────────────────────────────────────────┘
 *
 * Collapsed = header row only (~40px). Expanded = header + cards row
 * (~100px). State persists per session. Drag any card DOWN onto a
 * calendar cell to schedule it; drag a scheduled chip UP into the
 * strip's cards row to unschedule.
 *
 * Mobile uses a floating button + bottom sheet (md:hidden) since
 * drag-drop is poor on touch. Desktop renders the strip + hides the
 * mobile FAB via the responsive class chain.
 */
export function BacklogStrip({ currentUserId, currentUserName = '', plannerSkills = null }: Props) {
  const qc = useQueryClient()

  const [open, setOpen] = useState<boolean>(() => {
    try { return typeof window !== 'undefined' && localStorage.getItem(OPEN_STORAGE_KEY) === '1' } catch { return false }
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
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [search, setSearch] = useState('')
  const [isDropTarget, setIsDropTarget] = useState(false)

  // Mobile bottom-sheet state (same surface as the old drawer's mobile
  // variant — touch-friendly tap-to-schedule rather than drag-drop).
  const [mobileOpen, setMobileOpen] = useState(false)
  const [mobileScheduling, setMobileScheduling] = useState<{ id: number; title: string } | null>(null)
  const [mobileDate, setMobileDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [mobileTime, setMobileTime] = useState('09:00')

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
    onSuccess: () => { invalidate(); setQuickAdd(''); setShowQuickAdd(false); toast.success('Added to backlog') },
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

  const unscheduleMutation = useMutation({
    mutationFn: (id: number) => api.patch(`/v1/admin/planner/tasks/${id}/move`, { task_date: null }),
    onSuccess: () => { invalidate(); toast.success('Moved to backlog') },
    onError:  (e: any) => toast.error(e.response?.data?.message || 'Error'),
  })

  const scheduleMutation = useMutation({
    mutationFn: (vars: { id: number; task_date: string; start_time?: string }) =>
      api.patch(`/v1/admin/planner/tasks/${vars.id}/move`, vars),
    onSuccess: () => { invalidate(); setMobileScheduling(null); toast.success('Scheduled') },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  })

  const handleQuickAdd = (intoPool: boolean) => {
    const title = quickAdd.trim()
    if (!title) return
    const defaultGroup = intoPool && plannerSkills && plannerSkills.length > 0 ? plannerSkills[0] : null
    createMutation.mutate({
      title,
      assigned_to_user_id: intoPool ? null : (currentUserId ?? null),
      employee_name:       intoPool ? null : (currentUserName || null),
      task_date:           null,
      priority:            'normal',
      status:              'todo',
      task_group:          defaultGroup,
    })
  }

  // Sort + filter the active scope's tasks by priority + recency, then
  // client-side search. Keeps the visible row scannable when the user
  // is hunting for a specific card to drag onto the calendar.
  const sorted = useMemo(() => {
    const pri = (p: string | null | undefined) => p === 'high' ? 0 : p === 'normal' ? 1 : 2
    const q = search.trim().toLowerCase()
    return [...activeTasks]
      .filter(t => !q || (t.title || '').toLowerCase().includes(q))
      .sort((a, b) => {
        const d = pri(a.priority) - pri(b.priority)
        if (d !== 0) return d
        return (b.created_at || '').localeCompare(a.created_at || '')
      })
  }, [activeTasks, search])

  const totalCount = mineTasks.length + poolTasks.length

  return (
    <>
      {/* ── Desktop strip ────────────────────────────────────────── */}
      <div
        className={[
          'hidden md:block bg-dark-surface border rounded-xl overflow-hidden transition-colors',
          isDropTarget ? 'border-gold-500 ring-2 ring-gold-500/30' : 'border-dark-border',
        ].join(' ')}
        onDragOver={(e) => {
          // Drop-target highlight + acceptance. Same `sourceDate !== ''`
          // sentinel pattern as the calendar drop handlers — we only
          // accept drops from scheduled chips (which carry a real
          // sourceDate). Backlog→backlog drops are no-ops.
          const sourceDate = e.dataTransfer.types.includes('text/plain')
            ? '' : e.dataTransfer.getData('sourceDate')
          if (sourceDate !== '' && sourceDate !== undefined) {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
            setIsDropTarget(true)
          }
        }}
        onDragLeave={(e) => {
          if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setIsDropTarget(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          setIsDropTarget(false)
          const taskId = Number(e.dataTransfer.getData('taskId'))
          const sourceDate = e.dataTransfer.getData('sourceDate')
          if (!taskId || !sourceDate) return
          unscheduleMutation.mutate(taskId)
        }}
      >
        {/* Header row — always visible. Scope tabs, search, quick-add,
            expand toggle. Designed to feel like a single 40px control
            row, not a panel header. */}
        <div className="flex items-center gap-2 px-3 py-2">
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Inbox size={14} className="text-gold-400" />
            <span className="text-xs font-semibold text-white uppercase tracking-wide">Backlog</span>
          </div>

          {/* Scope tabs as inline pills */}
          <div className="flex gap-1 flex-shrink-0">
            <button
              onClick={() => setScope('mine')}
              className={[
                'flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition',
                scope === 'mine' ? 'bg-gold-500 text-black' : 'bg-white/5 text-gray-400 hover:bg-white/10',
              ].join(' ')}
            >
              <Hand size={10} /> Mine
              {mineTasks.length > 0 && (
                <span className={['ml-0.5 px-1 rounded text-[10px] tabular-nums', scope === 'mine' ? 'bg-black/20' : 'bg-white/10'].join(' ')}>{mineTasks.length}</span>
              )}
            </button>
            <button
              onClick={() => setScope('pool')}
              className={[
                'flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition',
                scope === 'pool' ? 'bg-gold-500 text-black' : 'bg-white/5 text-gray-400 hover:bg-white/10',
              ].join(' ')}
            >
              <Users size={10} /> Open pool
              {poolTasks.length > 0 && (
                <span className={['ml-0.5 px-1 rounded text-[10px] tabular-nums', scope === 'pool' ? 'bg-black/20' : 'bg-white/10'].join(' ')}>{poolTasks.length}</span>
              )}
            </button>
          </div>

          {/* Search — only when expanded + there are enough tasks */}
          {open && activeTasks.length >= 5 && (
            <div className="relative flex-shrink-0">
              <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                className="bg-dark-bg border border-white/10 rounded-md pl-6 pr-2 py-1 text-[11px] text-white placeholder-gray-500 focus:outline-none focus:border-gold-500/50 w-[140px]"
              />
            </div>
          )}

          <div className="flex-1" />

          {/* Quick-add: inline input that expands on click. Same dual-
              destination pattern (Mine / Pool) as the old drawer. */}
          {showQuickAdd ? (
            <div className="flex items-center gap-1 flex-shrink-0">
              <input
                autoFocus
                value={quickAdd}
                onChange={(e) => setQuickAdd(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); handleQuickAdd(scope === 'pool') }
                  if (e.key === 'Escape') { setShowQuickAdd(false); setQuickAdd('') }
                }}
                placeholder={scope === 'pool' ? 'New pool task…' : 'New task for me…'}
                className="bg-dark-bg border border-gold-500/40 rounded-md px-2 py-1 text-[11px] text-white placeholder-gray-500 focus:outline-none focus:border-gold-500 w-[180px]"
              />
              <button
                onClick={() => handleQuickAdd(scope === 'pool')}
                disabled={!quickAdd.trim() || createMutation.isPending}
                className="px-2 py-1 rounded-md bg-gold-500 text-black text-[11px] font-bold disabled:opacity-40"
              >
                Add
              </button>
              <button
                onClick={() => { setShowQuickAdd(false); setQuickAdd('') }}
                className="w-6 h-6 rounded text-gray-500 hover:text-white hover:bg-white/5 flex items-center justify-center"
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowQuickAdd(true)}
              className="flex items-center gap-1 px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 text-gray-300 text-[11px] font-medium flex-shrink-0"
            >
              <Plus size={11} /> New task
            </button>
          )}

          {/* Expand / collapse */}
          <button
            onClick={() => setOpen(o => !o)}
            className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-white/5 text-gray-400 hover:text-white text-[11px] font-medium flex-shrink-0"
            title={open ? 'Collapse backlog' : 'Show backlog cards'}
          >
            {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {open ? 'Hide' : 'Show'}
          </button>
        </div>

        {/* Cards row — only when expanded. Horizontal scroll. Each card
            is HTML5-draggable with `sourceDate=''` so calendar drop
            handlers schedule it on drop. */}
        {open && (
          <div className="border-t border-white/5 px-3 py-2 overflow-x-auto">
            {isLoading && (
              <div className="flex items-center justify-center py-2 text-gray-500">
                <Loader2 size={14} className="animate-spin" />
              </div>
            )}
            {!isLoading && sorted.length === 0 && (
              <div className="text-[11px] text-gray-500 py-2 italic">
                {search
                  ? <>No matches for &ldquo;{search}&rdquo;. <button onClick={() => setSearch('')} className="text-gold-400 hover:underline">Clear</button></>
                  : scope === 'mine'
                    ? 'No backlog tasks assigned to you. Drag any scheduled task here to unschedule.'
                    : 'Open pool is empty. Drag any scheduled task here to release it, or click "+ New task" to seed one.'
                }
              </div>
            )}
            {sorted.length > 0 && (
              <div className="flex gap-1.5 min-w-min">
                {sorted.map(task => (
                  <BacklogCardChip
                    key={task.id}
                    task={task}
                    scope={scope}
                    onClaim={() => claimMutation.mutate(task.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Mobile floating button + bottom sheet ─────────────────── */}
      <button
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed bottom-20 right-4 z-30 w-14 h-14 rounded-full bg-gold-500 hover:bg-gold-400 text-black shadow-lg flex items-center justify-center"
        title="Backlog"
      >
        <Inbox size={22} />
        {totalCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-[20px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-dark-bg">
            {totalCount > 99 ? '99+' : totalCount}
          </span>
        )}
      </button>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex flex-col bg-black/80" onClick={() => setMobileOpen(false)}>
          <div className="mt-auto bg-dark-surface rounded-t-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-3 border-b border-white/5">
              <div className="flex items-center gap-2">
                <Inbox size={16} className="text-gold-400" />
                <span className="text-sm font-semibold text-white">Backlog</span>
              </div>
              <button onClick={() => setMobileOpen(false)} className="w-8 h-8 rounded-md hover:bg-white/5 text-gray-400 flex items-center justify-center">
                <X size={16} />
              </button>
            </div>
            <div className="flex gap-1 p-2 border-b border-white/5">
              <button
                onClick={() => setScope('mine')}
                className={['flex-1 px-2 py-2 rounded-md text-xs font-medium flex items-center justify-center gap-1.5',
                  scope === 'mine' ? 'bg-gold-500 text-black' : 'bg-white/5 text-gray-300'].join(' ')}
              >
                <Hand size={12} /> Mine {mineTasks.length > 0 && <span className="ml-0.5 px-1 rounded bg-black/20 text-[10px]">{mineTasks.length}</span>}
              </button>
              <button
                onClick={() => setScope('pool')}
                className={['flex-1 px-2 py-2 rounded-md text-xs font-medium flex items-center justify-center gap-1.5',
                  scope === 'pool' ? 'bg-gold-500 text-black' : 'bg-white/5 text-gray-300'].join(' ')}
              >
                <Users size={12} /> Pool {poolTasks.length > 0 && <span className="ml-0.5 px-1 rounded bg-black/20 text-[10px]">{poolTasks.length}</span>}
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {isLoading && (
                <div className="flex items-center justify-center py-6 text-gray-500">
                  <Loader2 size={16} className="animate-spin" />
                </div>
              )}
              {!isLoading && activeTasks.length === 0 && (
                <div className="px-2 py-6 text-center text-[11px] text-gray-500">
                  {scope === 'mine' ? 'No backlog tasks assigned to you.' : 'Open pool is empty.'}
                </div>
              )}
              {activeTasks.map(task => (
                <div key={task.id} className="bg-white/5 border border-white/10 rounded-md p-2.5">
                  <div className="text-sm text-white font-medium">{task.title}</div>
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-500">
                    {task.task_group && <span className="px-1 rounded bg-white/5">{task.task_group}</span>}
                    {task.priority === 'high' && <span className="text-red-400 flex items-center gap-0.5"><Flag size={9} />high</span>}
                  </div>
                  {mobileScheduling?.id === task.id ? (
                    <div className="mt-2 flex flex-col gap-1.5">
                      <div className="flex gap-1.5">
                        <input type="date" value={mobileDate} onChange={(e) => setMobileDate(e.target.value)} className="flex-1 bg-dark-bg border border-white/10 rounded px-2 py-1.5 text-xs text-white" />
                        <input type="time" value={mobileTime} onChange={(e) => setMobileTime(e.target.value)} className="bg-dark-bg border border-white/10 rounded px-2 py-1.5 text-xs text-white" />
                      </div>
                      <div className="flex gap-1.5">
                        <button onClick={() => scheduleMutation.mutate({ id: task.id, task_date: mobileDate, start_time: mobileTime })} disabled={scheduleMutation.isPending} className="flex-1 px-2 py-1.5 rounded bg-gold-500 hover:bg-gold-400 text-black text-xs font-medium disabled:opacity-50">Schedule</button>
                        <button onClick={() => setMobileScheduling(null)} className="px-2 py-1.5 rounded bg-white/5 text-gray-400 text-xs">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-1.5 mt-2">
                      <button onClick={() => setMobileScheduling({ id: task.id, title: task.title })} className="flex-1 px-2 py-1.5 rounded bg-white/5 hover:bg-white/10 text-xs text-gray-300 flex items-center justify-center gap-1">
                        <CalendarIcon size={11} /> Schedule
                      </button>
                      {scope === 'pool' && (
                        <button onClick={() => claimMutation.mutate(task.id)} className="px-3 py-1.5 rounded bg-gold-500/15 text-gold-400 text-xs flex items-center gap-1">
                          <Hand size={11} /> Claim
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function BacklogCardChip({ task, scope, onClaim }: {
  task: BacklogTask
  scope: Scope
  onClaim: () => void
}) {
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
        // Empty sourceDate is the "from backlog" sentinel the calendar
        // drop handlers (Schedule cell, Day timeline, Month cell) all
        // look for to differentiate a new schedule from a date move.
        e.dataTransfer.setData('sourceDate', '')
      }}
      className={[
        'group flex-shrink-0 w-[160px] bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 hover:border-white/20 rounded-md px-2 py-1.5 cursor-move transition border-l-2',
        accent,
      ].join(' ')}
      title={task.title + (task.task_group ? ` · ${task.task_group}` : '')}
    >
      <div className="flex items-start gap-1.5">
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-medium text-white leading-tight truncate">{task.title}</div>
          <div className="flex items-center gap-1.5 mt-0.5 text-[9px] text-gray-500">
            {task.task_group && <span className="px-1 rounded bg-white/5 text-gray-400 truncate max-w-[60px]">{task.task_group}</span>}
            {task.priority === 'high' && <span className="flex items-center gap-0.5 text-red-400"><Flag size={8} />high</span>}
            {task.duration_minutes && <span className="text-gray-500 tabular-nums">{task.duration_minutes}m</span>}
          </div>
        </div>
        {/* Pool cards expose a tiny claim affordance on hover; mine
            cards don't (you can already drag them onto a cell). */}
        {scope === 'pool' && (
          <button
            onClick={(e) => { e.stopPropagation(); onClaim() }}
            className="opacity-0 group-hover:opacity-100 transition w-5 h-5 rounded bg-gold-500/15 hover:bg-gold-500/25 text-gold-400 flex items-center justify-center flex-shrink-0"
            title="Claim into my bucket"
          >
            <Hand size={9} />
          </button>
        )}
      </div>
    </div>
  )
}
