import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ChevronLeft, ChevronRight, Inbox, Users, Flag, Loader2,
  Hand, Send, X, Calendar as CalendarIcon, Search,
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
  /** Current user's planner skill allowlist. When non-empty, the drawer's
   *  pool quick-add defaults task_group to the first entry so the staff
   *  doesn't accidentally create a task they can't claim themselves. */
  plannerSkills?: string[] | null
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
export function BacklogDrawer({ currentUserId, currentUserName = '', plannerSkills = null }: Props) {
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
  // Local search + group filter for the backlog list. Transient by
  // design — kept in component state so refreshing or switching scopes
  // resets the filter. When the pool grows past ~30 cards, finding the
  // right one to assign without these gets painful.
  const [search, setSearch] = useState('')
  const [groupFilter, setGroupFilter] = useState<string | null>(null)
  // Mobile sheet state. Drag-drop is brutal on touch, so on phones we
  // surface the backlog as a bottom sheet with a date+time picker per
  // card instead. Activated by the floating "Backlog" button below.
  const [mobileOpen, setMobileOpen] = useState(false)
  // Per-card "Schedule" affordance on mobile opens a tiny inline form
  // for date + time. Tracks the task being scheduled by id.
  const [mobileScheduling, setMobileScheduling] = useState<{ id: number; title: string } | null>(null)
  const [mobileDate, setMobileDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [mobileTime, setMobileTime] = useState('09:00')

  const scheduleMutation = useMutation({
    mutationFn: (vars: { id: number; task_date: string; start_time?: string }) =>
      api.patch(`/v1/admin/planner/tasks/${vars.id}/move`, vars),
    onSuccess: () => {
      invalidate(); setMobileScheduling(null); toast.success('Scheduled')
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  })

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
    // Skill-aware default for pool drops: if the current user has a
    // skill allowlist set, tag the new pool task with their first
    // allowed group. Without this, staff who type into the quick-add
    // could create pool tasks they themselves can't claim (since the
    // pool view + claim endpoint both gate on task_group ∈ skills).
    // For the Mine flow this is irrelevant — they're the assignee
    // already, no claim gate applies.
    const defaultGroup = intoPool && plannerSkills && plannerSkills.length > 0
      ? plannerSkills[0]
      : null
    createMutation.mutate({
      title,
      // intoPool=true → unassigned, no employee. intoPool=false → assign
      // to current user immediately so it lands in their bucket.
      assigned_to_user_id: intoPool ? null : (currentUserId ?? null),
      employee_name:       intoPool ? null : (currentUserName || null),
      task_date:           null,
      priority:            'normal',
      status:              'todo',
      task_group:          defaultGroup,
    })
  }

  // Sort: pinned-by-priority then newest. "High" floats to the top so
  // the user's eye lands on what they should pick next.
  const sorted = useMemo(() => {
    const pri = (p: string | null | undefined) => p === 'high' ? 0 : p === 'normal' ? 1 : 2
    const q = search.trim().toLowerCase()
    return [...activeTasks]
      .filter(t => {
        if (groupFilter && (t.task_group || '') !== groupFilter) return false
        if (q && !(t.title || '').toLowerCase().includes(q)) return false
        return true
      })
      .sort((a, b) => {
        const d = pri(a.priority) - pri(b.priority)
        if (d !== 0) return d
        return (b.created_at || '').localeCompare(a.created_at || '')
      })
  }, [activeTasks, search, groupFilter])

  // Distinct task_groups present in the current scope, sorted alphabetically.
  // Used to render the filter chip row — hidden when there's only one or
  // zero groups to filter on (filtering a 1-group list has no value).
  const distinctGroups = useMemo(() => {
    const set = new Set<string>()
    for (const t of activeTasks) if (t.task_group) set.add(t.task_group)
    return Array.from(set).sort()
  }, [activeTasks])

  const totalCount = (mineTasks.length || 0) + (poolTasks.length || 0)

  // Mobile floating button + bottom sheet. Drag-drop is poor on touch,
  // so on phones we surface the same backlog as a list with a tap →
  // inline date/time picker per card. The desktop drawer remains
  // mounted alongside (`hidden md:flex`) so this component handles
  // both responsive surfaces from one render.
  const mobileSurface = (
    <>
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
                        <input
                          type="date"
                          value={mobileDate}
                          onChange={(e) => setMobileDate(e.target.value)}
                          className="flex-1 bg-dark-bg border border-white/10 rounded px-2 py-1.5 text-xs text-white"
                        />
                        <input
                          type="time"
                          value={mobileTime}
                          onChange={(e) => setMobileTime(e.target.value)}
                          className="bg-dark-bg border border-white/10 rounded px-2 py-1.5 text-xs text-white"
                        />
                      </div>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => scheduleMutation.mutate({ id: task.id, task_date: mobileDate, start_time: mobileTime })}
                          disabled={scheduleMutation.isPending}
                          className="flex-1 px-2 py-1.5 rounded bg-gold-500 hover:bg-gold-400 text-black text-xs font-medium disabled:opacity-50"
                        >
                          Schedule
                        </button>
                        <button
                          onClick={() => setMobileScheduling(null)}
                          className="px-2 py-1.5 rounded bg-white/5 text-gray-400 text-xs"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-1.5 mt-2">
                      <button
                        onClick={() => setMobileScheduling({ id: task.id, title: task.title })}
                        className="flex-1 px-2 py-1.5 rounded bg-white/5 hover:bg-white/10 text-xs text-gray-300 flex items-center justify-center gap-1"
                      >
                        <CalendarIcon size={11} /> Schedule
                      </button>
                      {scope === 'pool' && (
                        <button
                          onClick={() => claimMutation.mutate(task.id)}
                          className="px-3 py-1.5 rounded bg-gold-500/15 text-gold-400 text-xs flex items-center gap-1"
                        >
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

  // Collapsed rail — vertical icon strip with a count badge.
  if (!open) {
    return (
      <>
      <div className="hidden md:flex flex-col items-center gap-2 w-12 bg-dark-surface border-r border-white/5 py-3 sticky top-0 h-screen">
        <button
          onClick={() => setOpen(true)}
          className="w-10 h-10 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white relative"
          title="Show backlog"
        >
          <Inbox size={18} />
          {totalCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-gold-500 text-black text-[10px] font-bold flex items-center justify-center">
              {totalCount > 99 ? '99+' : totalCount}
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
      {mobileSurface}
      </>
    )
  }

  return (
    <>
    <div
      className={[
        'hidden md:flex flex-col bg-dark-surface border-r sticky top-0 h-screen overflow-hidden',
        // Drawer is fixed-width; the team-mode 720px override was removed
        // in favour of a dedicated /planner Team tab so the schedule
        // doesn't get squeezed off the right edge.
        'w-[240px]',
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
      {/* Header — compact: title + tabs in adjacent rows. Team-mode
          toggle was removed in favour of a dedicated /planner Team
          tab in the view switcher so the drawer can stay narrow. */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/5">
        <div className="flex items-center gap-2">
          <Inbox size={15} className="text-gold-400" />
          <span className="text-sm font-semibold text-white">Backlog</span>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="w-6 h-6 rounded hover:bg-white/5 flex items-center justify-center text-gray-400"
          title="Collapse"
        >
          <ChevronLeft size={14} />
        </button>
      </div>

      {(<>

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

      {/* Search + group filter. Only renders when there are enough tasks
          to justify it — under 5 tasks any filter just hides cards the
          user could find by scanning. The group filter chip row is
          additionally gated on having >1 distinct group present. */}
      {activeTasks.length >= 5 && (
        <div className="px-2 pt-2 pb-1.5 border-b border-white/5 space-y-1.5">
          <div className="relative">
            <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="w-full bg-dark-bg border border-white/10 rounded-md pl-7 pr-7 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-gold-500/50"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded text-gray-500 hover:text-white hover:bg-white/5 flex items-center justify-center"
              >
                <X size={10} />
              </button>
            )}
          </div>
          {distinctGroups.length > 1 && (
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => setGroupFilter(null)}
                className={['px-1.5 py-0.5 rounded text-[10px] border transition',
                  groupFilter === null
                    ? 'bg-gold-500 border-gold-500 text-black font-medium'
                    : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'].join(' ')}
              >
                All
              </button>
              {distinctGroups.map(g => (
                <button
                  key={g}
                  onClick={() => setGroupFilter(g === groupFilter ? null : g)}
                  className={['px-1.5 py-0.5 rounded text-[10px] border transition truncate max-w-[100px]',
                    groupFilter === g
                      ? 'bg-gold-500 border-gold-500 text-black font-medium'
                      : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'].join(' ')}
                  title={g}
                >
                  {g}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Task list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {isLoading && (
          <div className="flex items-center justify-center py-6 text-gray-500">
            <Loader2 size={16} className="animate-spin" />
          </div>
        )}
        {!isLoading && sorted.length === 0 && (
          <div className="px-2 py-6 text-center text-[11px] text-gray-500">
            {(search || groupFilter)
              ? <>No tasks match your filter. <button onClick={() => { setSearch(''); setGroupFilter(null) }} className="text-gold-400 hover:underline">Clear</button></>
              : scope === 'mine' ? 'No backlog tasks assigned to you.' : 'Open pool is empty.'}
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
      </>)}
    </div>
    {mobileSurface}
    </>
  )
}

interface CardProps {
  task: BacklogTask
  scope: Scope
  onClaim: () => void
  onRelease: () => void
  /** Team mode shows cards inside a manager-driven kanban; the
   *  per-card claim/release affordances make no sense there because
   *  the drag-between-columns is the assignment gesture. */
  hideActions?: boolean
}

function BacklogCard({ task, scope, onClaim, onRelease, hideActions = false }: CardProps) {
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
        {!hideActions && (scope === 'pool' ? (
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
        ))}
      </div>
    </div>
  )
}
