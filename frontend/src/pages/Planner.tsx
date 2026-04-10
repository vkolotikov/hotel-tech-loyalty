import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useSettings } from '../lib/crmSettings'
import toast from 'react-hot-toast'
import {
  ChevronLeft, ChevronRight, Plus, CheckCircle2, Circle, Copy, Trash2,
  BarChart2, Calendar, CalendarDays, CalendarRange, FileText,
  ChevronDown, Edit, ArrowRight, Clock, User, Flag, Tag, X,
  ListChecks, AlertCircle,
} from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

/* ─── helpers ──────────────────────────────────────────────────────── */

function fmtDate(d: Date): string { return d.toISOString().slice(0, 10) }

function getMonday(d: Date): Date {
  const date = new Date(d); const day = date.getDay()
  date.setDate(date.getDate() - day + (day === 0 ? -6 : 1))
  return date
}
function weekDatesFrom(start: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return d })
}
function monthGrid(year: number, month: number): (Date | null)[][] {
  const first = new Date(year, month, 1), lastDay = new Date(year, month + 1, 0).getDate()
  const startDow = (first.getDay() + 6) % 7
  const weeks: (Date | null)[][] = []; let week: (Date | null)[] = Array(startDow).fill(null)
  for (let d = 1; d <= lastDay; d++) { week.push(new Date(year, month, d)); if (week.length === 7) { weeks.push(week); week = [] } }
  if (week.length) { while (week.length < 7) week.push(null); weeks.push(week) }
  return weeks
}
function friendlyDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const PRIORITY_COLOR: Record<string, string> = { Low: '#6b7280', Normal: '#3b82f6', High: '#ef4444' }
const GROUP_COLORS: Record<string, string> = {
  Housekeeping: 'bg-emerald-500/15 text-emerald-400', 'Front Desk': 'bg-blue-500/15 text-blue-400', 'Front Office': 'bg-blue-500/15 text-blue-400',
  Maintenance: 'bg-amber-500/15 text-amber-400', 'F&B': 'bg-purple-500/15 text-purple-400',
  Management: 'bg-red-500/15 text-red-400', Sales: 'bg-cyan-500/15 text-cyan-400', Events: 'bg-pink-500/15 text-pink-400',
}
const TOOLTIP_STYLE = { backgroundColor: '#1a1a2e', border: '1px solid #2e2e50', borderRadius: 8, fontSize: 12 }

const input = 'w-full bg-dark-surface2 border border-dark-border rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 transition-colors'
const filterSel = 'bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500'

type Tab = 'day' | 'week' | 'month' | 'stats'
type TaskForm = { employee_name: string; title: string; task_date: string; start_time: string; end_time: string; priority: string; task_group: string; task_category: string; duration_minutes: string; description: string; status: string }
const EMPTY_FORM: TaskForm = { employee_name: '', title: '', task_date: '', start_time: '', end_time: '', priority: 'Normal', task_group: '', task_category: '', duration_minutes: '', description: '', status: '' }

/* ─── main component ───────────────────────────────────────────────── */

export function Planner() {
  const qc = useQueryClient()
  const settings = useSettings()
  const [tab, setTab] = useState<Tab>('day')
  const [currentDate, setCurrentDate] = useState(() => fmtDate(new Date()))
  const [weekStart, setWeekStart] = useState(() => fmtDate(getMonday(new Date())))
  const [monthYear, setMonthYear] = useState(() => ({ year: new Date().getFullYear(), month: new Date().getMonth() }))
  const [employee, setEmployee] = useState('')
  const [groupFilter, setGroupFilter] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editTask, setEditTask] = useState<any>(null)
  const [form, setForm] = useState<TaskForm>({ ...EMPTY_FORM })
  const [expandedTask, setExpandedTask] = useState<number | null>(null)
  const [newSubtasks, setNewSubtasks] = useState<Record<number, string>>({})
  const [quickAdd, setQuickAdd] = useState<string | null>(null) // date string for quick-add
  const [quickTitle, setQuickTitle] = useState('')
  const quickRef = useRef<HTMLInputElement>(null)
  const [copyTarget, setCopyTarget] = useState<{ taskId: number; date: string } | null>(null)
  const [moveTarget, setMoveTarget] = useState<{ taskId: number; date: string } | null>(null)
  const [statsFrom, setStatsFrom] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10))
  const [statsTo, setStatsTo] = useState(() => fmtDate(new Date()))

  const today = fmtDate(new Date())
  const getNewSubtask = (id: number) => newSubtasks[id] ?? ''
  const setNewSubtask = (id: number, v: string) => setNewSubtasks(p => ({ ...p, [id]: v }))

  // Focus quick-add input when it opens
  useEffect(() => { if (quickAdd && quickRef.current) quickRef.current.focus() }, [quickAdd])

  /* ─── queries ─────────────────────────────────────────────────── */
  const queryParams: any = { employee: employee || undefined, task_group: groupFilter || undefined }
  if (tab === 'day') queryParams.date = currentDate
  else if (tab === 'week') queryParams.week_start = weekStart
  else if (tab === 'month') {
    queryParams.from = `${monthYear.year}-${String(monthYear.month + 1).padStart(2, '0')}-01`
    const ld = new Date(monthYear.year, monthYear.month + 1, 0).getDate()
    queryParams.to = `${monthYear.year}-${String(monthYear.month + 1).padStart(2, '0')}-${String(ld).padStart(2, '0')}`
  }

  const { data: tasks = [] } = useQuery({
    queryKey: ['planner-tasks', tab, tab === 'day' ? currentDate : tab === 'week' ? weekStart : monthYear, employee, groupFilter],
    queryFn: () => api.get('/v1/admin/planner/tasks', { params: queryParams }).then(r => r.data),
    enabled: tab !== 'stats',
  })

  const { data: dayNote } = useQuery({
    queryKey: ['planner-day-note', tab === 'day' ? currentDate : today],
    queryFn: () => api.get('/v1/admin/planner/day-note', { params: { date: tab === 'day' ? currentDate : today } }).then(r => r.data),
  })

  const { data: stats } = useQuery({
    queryKey: ['planner-stats', statsFrom, statsTo],
    queryFn: () => api.get('/v1/admin/planner/stats', { params: { from: statsFrom, to: statsTo } }).then(r => r.data),
    enabled: tab === 'stats',
  })

  /* ─── mutations ───────────────────────────────────────────────── */
  const invalidate = () => { qc.invalidateQueries({ queryKey: ['planner-tasks'] }); qc.invalidateQueries({ queryKey: ['planner-stats'] }) }

  const createMutation = useMutation({
    mutationFn: (body: any) => api.post('/v1/admin/planner/tasks', body),
    onSuccess: () => { invalidate(); setShowModal(false); setForm({ ...EMPTY_FORM }); toast.success('Task created') },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, ...body }: any) => api.put('/v1/admin/planner/tasks/' + id, body),
    onSuccess: () => { invalidate(); setShowModal(false); setEditTask(null); setForm({ ...EMPTY_FORM }); toast.success('Task updated') },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, completed }: any) => api.put('/v1/admin/planner/tasks/' + id, { completed: !completed }),
    onSuccess: () => { invalidate(); toast.success('Status updated') },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete('/v1/admin/planner/tasks/' + id),
    onSuccess: () => { invalidate(); setExpandedTask(null); toast.success('Task deleted') },
  })

  const copyMutation = useMutation({
    mutationFn: ({ id, task_date, employee_name }: any) => api.post('/v1/admin/planner/tasks/' + id + '/copy', { task_date, employee_name }),
    onSuccess: () => { invalidate(); setCopyTarget(null); toast.success('Task copied') },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  })

  const moveMutation = useMutation({
    mutationFn: ({ id, task_date, employee_name }: any) => api.patch('/v1/admin/planner/tasks/' + id + '/move', { task_date, employee_name }),
    onSuccess: () => { invalidate(); setMoveTarget(null); toast.success('Task moved') },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  })

  const quickCreateMutation = useMutation({
    mutationFn: (body: any) => api.post('/v1/admin/planner/tasks', body),
    onSuccess: () => { invalidate(); setQuickAdd(null); setQuickTitle(''); toast.success('Task added') },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  })

  const addSubtaskMutation = useMutation({
    mutationFn: ({ taskId, title }: any) => api.post('/v1/admin/planner/tasks/' + taskId + '/subtasks', { title }),
    onSuccess: (_d, v) => { invalidate(); setNewSubtask(v.taskId, '') },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  })

  const toggleSubtaskMutation = useMutation({
    mutationFn: (id: number) => api.patch('/v1/admin/planner/subtasks/' + id + '/toggle', {}),
    onSuccess: invalidate,
  })

  const deleteSubtaskMutation = useMutation({
    mutationFn: (id: number) => api.delete('/v1/admin/planner/subtasks/' + id),
    onSuccess: invalidate,
  })

  const upsertNoteMutation = useMutation({
    mutationFn: (body: any) => api.post('/v1/admin/planner/day-note', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['planner-day-note'] }),
  })

  /* ─── navigation ──────────────────────────────────────────────── */
  const navigate = (dir: number) => {
    if (tab === 'day') { const d = new Date(currentDate); d.setDate(d.getDate() + dir); setCurrentDate(fmtDate(d)) }
    else if (tab === 'week') { const d = new Date(weekStart); d.setDate(d.getDate() + dir * 7); setWeekStart(fmtDate(d)) }
    else { setMonthYear(p => { let m = p.month + dir, y = p.year; if (m < 0) { m = 11; y-- } if (m > 11) { m = 0; y++ } return { year: y, month: m } }) }
  }
  const goToday = () => { const n = new Date(); setCurrentDate(fmtDate(n)); setWeekStart(fmtDate(getMonday(n))); setMonthYear({ year: n.getFullYear(), month: n.getMonth() }) }

  const openCreate = (date: string) => { setEditTask(null); setForm({ ...EMPTY_FORM, task_date: date }); setShowModal(true) }
  const openEdit = (task: any) => {
    setEditTask(task)
    setForm({
      employee_name: task.employee_name ?? '', title: task.title ?? '', task_date: (task.task_date ?? '').slice(0, 10),
      start_time: task.start_time ? task.start_time.slice(0, 5) : '', end_time: task.end_time ? task.end_time.slice(0, 5) : '',
      priority: task.priority ?? 'Normal', task_group: task.task_group ?? '', task_category: task.task_category ?? '',
      duration_minutes: task.duration_minutes ? String(task.duration_minutes) : '', description: task.description ?? '',
      status: task.status ?? '',
    })
    setShowModal(true)
  }

  const handleSubmit = () => {
    const body: any = { ...form }
    if (!body.start_time) body.start_time = null
    if (!body.end_time) body.end_time = null
    if (!body.duration_minutes) body.duration_minutes = null
    else body.duration_minutes = Number(body.duration_minutes)
    if (!body.employee_name) body.employee_name = null
    if (!body.task_group) body.task_group = null
    if (!body.task_category) body.task_category = null
    if (!body.status) body.status = null
    if (!body.description) body.description = null
    if (editTask) updateMutation.mutate({ id: editTask.id, ...body })
    else createMutation.mutate(body)
  }

  const handleQuickAdd = () => {
    if (!quickTitle.trim() || !quickAdd) return
    quickCreateMutation.mutate({ title: quickTitle.trim(), task_date: quickAdd, priority: 'Normal' })
  }

  /* ─── derived data ────────────────────────────────────────────── */
  const weekDates = weekDatesFrom(new Date(weekStart))
  const monthWeeks = monthGrid(monthYear.year, monthYear.month)

  const subtitle = tab === 'day'
    ? new Date(currentDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : tab === 'week' ? `${friendlyDate(weekStart)} — ${friendlyDate(fmtDate(weekDates[6]))}`
    : tab === 'month' ? `${MONTHS[monthYear.month]} ${monthYear.year}` : 'Statistics'


  /* ─── progress bar ────────────────────────────────────────────── */
  const ProgressBar = ({ done, total }: { done: number; total: number }) => {
    const pct = total > 0 ? Math.round((done / total) * 100) : 0
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-dark-border rounded-full overflow-hidden">
          <div className="h-full bg-green-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs text-gray-500 min-w-[36px] text-right">{pct}%</span>
      </div>
    )
  }

  /* ─── task row (day view) ─────────────────────────────────────── */
  const TaskRow = ({ task, dateStr }: { task: any; dateStr: string }) => {
    const isExpanded = expandedTask === task.id
    const subDone = task.subtasks?.filter((s: any) => s.is_done).length ?? 0
    const subTotal = task.subtasks?.length ?? 0

    return (
      <div className={'rounded-xl border transition-all duration-200 ' + (isExpanded ? 'bg-dark-surface border-dark-border shadow-lg' : 'bg-dark-surface2/50 border-transparent hover:border-dark-border/50 hover:bg-dark-surface2')}>
        {/* Main row */}
        <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={() => setExpandedTask(isExpanded ? null : task.id)}>
          {/* Complete toggle */}
          <button onClick={e => { e.stopPropagation(); toggleMutation.mutate({ id: task.id, completed: task.completed }) }}
            className="flex-shrink-0 p-1 rounded-lg hover:bg-dark-surface2 transition-colors">
            {task.completed
              ? <CheckCircle2 size={22} className="text-green-400" />
              : <Circle size={22} className="text-gray-600 hover:text-gray-400" />}
          </button>

          {/* Priority indicator */}
          <div className="w-1 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: PRIORITY_COLOR[task.priority] ?? '#6b7280' }} />

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={'font-medium text-sm ' + (task.completed ? 'line-through text-gray-600' : 'text-white')}>{task.title}</span>
              {task.priority === 'High' && <AlertCircle size={14} className="text-red-400 flex-shrink-0" />}
            </div>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              {task.employee_name && <span className="flex items-center gap-1 text-xs text-gray-500"><User size={11} />{task.employee_name}</span>}
              {task.start_time && (
                <span className="flex items-center gap-1 text-xs text-gray-500">
                  <Clock size={11} />
                  {task.start_time.slice(0, 5)}
                  {task.end_time && ` — ${task.end_time.slice(0, 5)}`}
                </span>
              )}
              {task.task_group && (
                <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${GROUP_COLORS[task.task_group] ?? 'bg-gray-500/15 text-gray-400'}`}>
                  {task.task_group}
                </span>
              )}
              {task.task_category && (
                <span className="flex items-center gap-1 text-xs text-gray-600"><Tag size={10} />{task.task_category}</span>
              )}
              {task.duration_minutes && (
                <span className="text-xs text-gray-600">{task.duration_minutes}m</span>
              )}
            </div>
          </div>

          {/* Right side: subtask count + actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {subTotal > 0 && (
              <span className={'flex items-center gap-1 text-xs px-2 py-1 rounded-lg ' + (subDone === subTotal ? 'bg-green-500/10 text-green-400' : 'bg-dark-surface2 text-gray-500')}>
                <ListChecks size={13} /> {subDone}/{subTotal}
              </span>
            )}
            <button onClick={e => { e.stopPropagation(); openEdit(task) }} className="p-2 rounded-lg text-gray-600 hover:text-primary-400 hover:bg-dark-surface2 transition-colors" title="Edit">
              <Edit size={16} />
            </button>
            <ChevronDown size={16} className={'text-gray-600 transition-transform duration-200 ' + (isExpanded ? 'rotate-180' : '')} />
          </div>
        </div>

        {/* Expanded panel */}
        {isExpanded && (
          <div className="px-4 pb-4 space-y-3 border-t border-dark-border/50 pt-3">
            {/* Description */}
            {task.description && (
              <p className="text-sm text-gray-400 leading-relaxed bg-dark-surface2/50 rounded-lg p-3">{task.description}</p>
            )}

            {/* Status info */}
            {task.status && (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="font-medium">Status:</span>
                <span className="px-2 py-0.5 rounded-full bg-dark-surface2 text-gray-400">{task.status}</span>
              </div>
            )}

            {/* Subtasks */}
            <div>
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Subtasks</h4>
              <div className="space-y-1.5">
                {task.subtasks?.map((sub: any) => (
                  <div key={sub.id} className="flex items-center gap-2.5 group py-1 px-2 rounded-lg hover:bg-dark-surface2/50 transition-colors">
                    <button onClick={() => toggleSubtaskMutation.mutate(sub.id)} className="flex-shrink-0 p-0.5">
                      {sub.is_done
                        ? <CheckCircle2 size={18} className="text-green-400" />
                        : <Circle size={18} className="text-gray-600 hover:text-gray-400" />}
                    </button>
                    <span className={'flex-1 text-sm ' + (sub.is_done ? 'line-through text-gray-600' : 'text-gray-300')}>{sub.title}</span>
                    <button onClick={() => deleteSubtaskMutation.mutate(sub.id)} className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-600 hover:text-red-400 transition-all">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                <form className="flex gap-2 mt-2" onSubmit={e => { e.preventDefault(); const v = getNewSubtask(task.id).trim(); if (v) addSubtaskMutation.mutate({ taskId: task.id, title: v }) }}>
                  <input
                    value={getNewSubtask(task.id)}
                    onChange={e => setNewSubtask(task.id, e.target.value)}
                    placeholder="Add a subtask..."
                    className="flex-1 bg-dark-surface2 border border-dark-border rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/30"
                  />
                  <button type="submit" disabled={!getNewSubtask(task.id).trim()} className="px-3 py-2 rounded-lg bg-primary-500/10 text-primary-400 hover:bg-primary-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm font-medium">
                    Add
                  </button>
                </form>
              </div>
            </div>

            {/* Action bar */}
            <div className="flex items-center gap-2 pt-2 border-t border-dark-border/30">
              <button onClick={() => setMoveTarget({ taskId: task.id, date: dateStr })} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-amber-400 hover:bg-amber-500/10 transition-colors">
                <ArrowRight size={14} /> Move
              </button>
              <button onClick={() => setCopyTarget({ taskId: task.id, date: dateStr })} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 transition-colors">
                <Copy size={14} /> Duplicate
              </button>
              <div className="flex-1" />
              <button onClick={() => { if (confirm('Delete this task?')) deleteMutation.mutate(task.id) }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                <Trash2 size={14} /> Delete
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  /* ─── week card (compact) ─────────────────────────────────────── */
  const WeekCard = ({ task, dateStr }: { task: any; dateStr: string }) => (
    <div className="flex items-center gap-2 py-1.5 px-2 rounded-lg bg-dark-surface2/50 hover:bg-dark-surface2 transition-colors group">
      <button onClick={e => { e.stopPropagation(); toggleMutation.mutate({ id: task.id, completed: task.completed }) }} className="flex-shrink-0">
        {task.completed
          ? <CheckCircle2 size={16} className="text-green-400" />
          : <Circle size={16} className="text-gray-600 hover:text-gray-400 transition-colors" />}
      </button>
      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => { setCurrentDate(dateStr); setTab('day'); setExpandedTask(task.id) }}>
        <span className={'text-xs font-medium leading-tight block truncate ' + (task.completed ? 'line-through text-gray-600' : 'text-white')}>{task.title}</span>
        <div className="flex items-center gap-1 mt-0.5">
          {task.start_time && <span className="text-[10px] text-gray-600">{task.start_time.slice(0, 5)}</span>}
          {task.employee_name && <span className="text-[10px] text-gray-600 truncate">{task.employee_name}</span>}
        </div>
      </div>
      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity">
        <button onClick={() => openEdit(task)} className="p-1 rounded text-gray-600 hover:text-primary-400"><Edit size={12} /></button>
        <button onClick={() => { if (confirm('Delete?')) deleteMutation.mutate(task.id) }} className="p-1 rounded text-gray-600 hover:text-red-400"><Trash2 size={12} /></button>
      </div>
    </div>
  )

  /* ─── quick-add inline ────────────────────────────────────────── */
  const QuickAddRow = ({ date }: { date: string }) => {
    if (quickAdd !== date) {
      return (
        <button onClick={() => { setQuickAdd(date); setQuickTitle('') }} className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-gray-600 hover:text-gray-400 hover:bg-dark-surface2/50 transition-colors text-xs">
          <Plus size={14} /> Add task
        </button>
      )
    }
    return (
      <form className="flex gap-1.5 p-1.5" onSubmit={e => { e.preventDefault(); handleQuickAdd() }}>
        <input ref={quickRef} value={quickTitle} onChange={e => setQuickTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') { setQuickAdd(null); setQuickTitle('') } }}
          placeholder="Task title..." className="flex-1 bg-dark-surface2 border border-primary-500/50 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-primary-500/50" />
        <button type="submit" disabled={!quickTitle.trim() || quickCreateMutation.isPending} className="px-2.5 py-1.5 rounded-lg bg-primary-600 text-white text-xs font-medium disabled:opacity-40 hover:bg-primary-500 transition-colors">
          {quickCreateMutation.isPending ? '...' : 'Add'}
        </button>
        <button type="button" onClick={() => { setQuickAdd(null); setQuickTitle('') }} className="p-1.5 rounded-lg text-gray-600 hover:text-white transition-colors">
          <X size={14} />
        </button>
      </form>
    )
  }

  /* ─── render ──────────────────────────────────────────────────── */
  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Planner</h1>
          <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* View tabs */}
          <div className="flex rounded-xl border border-dark-border overflow-hidden bg-dark-surface">
            {([
              ['day', CalendarDays, 'Day'],
              ['week', Calendar, 'Week'],
              ['month', CalendarRange, 'Month'],
              ['stats', BarChart2, 'Stats'],
            ] as const).map(([t, Icon, label]) => (
              <button key={t} onClick={() => setTab(t as Tab)} className={'flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-all ' + (tab === t ? 'bg-primary-500/15 text-primary-400' : 'text-gray-500 hover:text-white hover:bg-dark-surface2')}>
                <Icon size={15} /> {label}
              </button>
            ))}
          </div>

          {tab !== 'stats' && <>
            <select value={employee} onChange={e => setEmployee(e.target.value)} className={filterSel}>
              <option value="">All Team</option>
              {settings.employees.map(e => <option key={e}>{e}</option>)}
            </select>
            <select value={groupFilter} onChange={e => setGroupFilter(e.target.value)} className={filterSel}>
              <option value="">All Groups</option>
              {settings.planner_groups.map(g => <option key={g}>{g}</option>)}
            </select>
            <div className="flex items-center gap-1">
              <button onClick={() => navigate(-1)} className="p-2 rounded-lg border border-dark-border text-gray-400 hover:text-white hover:bg-dark-surface2 transition-all"><ChevronLeft size={16} /></button>
              <button onClick={goToday} className="px-3 py-2 rounded-lg border border-dark-border text-sm text-gray-400 hover:text-white hover:bg-dark-surface2 transition-all font-medium">Today</button>
              <button onClick={() => navigate(1)} className="p-2 rounded-lg border border-dark-border text-gray-400 hover:text-white hover:bg-dark-surface2 transition-all"><ChevronRight size={16} /></button>
            </div>
          </>}
        </div>
      </div>

      {/* ═══ DAY VIEW ═══ */}
      {tab === 'day' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Main task list */}
          <div className="lg:col-span-2 space-y-4">
            {/* Summary bar */}
            <div className="bg-dark-surface border border-dark-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-4">
                  <span className="text-sm font-semibold text-white">{tasks.length} task{tasks.length !== 1 ? 's' : ''}</span>
                  <span className="text-xs text-green-400">{tasks.filter((t: any) => t.completed).length} completed</span>
                  <span className="text-xs text-gray-500">{tasks.filter((t: any) => !t.completed).length} remaining</span>
                </div>
                <button onClick={() => openCreate(currentDate)} className="flex items-center gap-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-500 px-4 py-2 rounded-lg transition-colors">
                  <Plus size={16} /> New Task
                </button>
              </div>
              <ProgressBar done={tasks.filter((t: any) => t.completed).length} total={tasks.length} />
            </div>

            {/* Task list */}
            <div className="space-y-2">
              {tasks.length === 0 && (
                <div className="bg-dark-surface border border-dark-border rounded-xl p-12 text-center">
                  <CalendarDays size={40} className="mx-auto text-gray-700 mb-3" />
                  <p className="text-gray-500 text-sm">No tasks for this day</p>
                  <button onClick={() => openCreate(currentDate)} className="mt-3 text-sm text-primary-400 hover:text-primary-300 font-medium">
                    Create your first task
                  </button>
                </div>
              )}
              {/* High priority first, then by time */}
              {[...tasks]
                .sort((a: any, b: any) => {
                  if (a.completed !== b.completed) return a.completed ? 1 : -1
                  const pOrder: Record<string, number> = { High: 0, Normal: 1, Low: 2 }
                  if ((pOrder[a.priority] ?? 1) !== (pOrder[b.priority] ?? 1)) return (pOrder[a.priority] ?? 1) - (pOrder[b.priority] ?? 1)
                  return (a.start_time ?? 'zz').localeCompare(b.start_time ?? 'zz')
                })
                .map((task: any) => (
                  <TaskRow key={task.id} task={task} dateStr={currentDate} />
                ))}
            </div>

            {/* Quick add */}
            <QuickAddRow date={currentDate} />
          </div>

          {/* Right sidebar */}
          <div className="space-y-4">
            {/* Day Note */}
            <div className="bg-dark-surface border border-dark-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <FileText size={16} className="text-primary-400" />
                <span className="text-sm font-semibold text-white">Day Notes</span>
              </div>
              <textarea
                key={currentDate}
                defaultValue={dayNote?.note_text ?? ''}
                onBlur={e => upsertNoteMutation.mutate({ note_date: currentDate, note_text: e.target.value })}
                rows={4}
                placeholder="Write notes, reminders, or instructions for this day..."
                className="w-full bg-dark-surface2 border border-dark-border rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500 resize-none leading-relaxed"
              />
            </div>

            {/* Day overview */}
            <div className="bg-dark-surface border border-dark-border rounded-xl p-4">
              <h3 className="text-sm font-semibold text-white mb-3">Day Overview</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Total</span>
                  <span className="text-sm font-semibold text-white">{tasks.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Completed</span>
                  <span className="text-sm font-semibold text-green-400">{tasks.filter((t: any) => t.completed).length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">High Priority</span>
                  <span className="text-sm font-semibold text-red-400">{tasks.filter((t: any) => t.priority === 'High' && !t.completed).length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">With subtasks</span>
                  <span className="text-sm font-semibold text-gray-400">{tasks.filter((t: any) => t.subtasks?.length > 0).length}</span>
                </div>
              </div>
            </div>

            {/* Team breakdown if no employee filter */}
            {!employee && tasks.length > 0 && (
              <div className="bg-dark-surface border border-dark-border rounded-xl p-4">
                <h3 className="text-sm font-semibold text-white mb-3">Team Breakdown</h3>
                <div className="space-y-2">
                  {Object.entries(tasks.reduce((acc: any, t: any) => {
                    const name = t.employee_name || 'Unassigned'
                    if (!acc[name]) acc[name] = { total: 0, done: 0 }
                    acc[name].total++
                    if (t.completed) acc[name].done++
                    return acc
                  }, {} as Record<string, { total: number; done: number }>)).map(([name, data]: [string, any]) => (
                    <div key={name}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-gray-400 truncate">{name}</span>
                        <span className="text-[10px] text-gray-600">{data.done}/{data.total}</span>
                      </div>
                      <ProgressBar done={data.done} total={data.total} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ WEEK VIEW ═══ */}
      {tab === 'week' && (
        <>
          {/* Today note */}
          <div className="bg-dark-surface border border-dark-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <FileText size={14} className="text-primary-400" />
              <span className="text-sm font-medium text-white">Today's Note</span>
            </div>
            <textarea
              key={`week-note-${weekStart}`}
              defaultValue={dayNote?.note_text ?? ''}
              onBlur={e => upsertNoteMutation.mutate({ note_date: today, note_text: e.target.value })}
              rows={2}
              placeholder="Add notes for today..."
              className="w-full bg-dark-surface2 border border-dark-border rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500 resize-none"
            />
          </div>

          {/* Week grid */}
          <div className="grid grid-cols-7 gap-2">
            {weekDates.map((date, i) => {
              const dateStr = fmtDate(date)
              const dayTasks = tasks.filter((t: any) => (t.task_date ?? '').slice(0, 10) === dateStr)
              const isToday = dateStr === today
              const done = dayTasks.filter((t: any) => t.completed).length

              return (
                <div key={dateStr} className={'bg-dark-surface border rounded-xl overflow-hidden flex flex-col transition-colors ' + (isToday ? 'border-primary-500/50 ring-1 ring-primary-500/20' : 'border-dark-border')}>
                  {/* Day header — clickable to switch to day view */}
                  <div
                    onClick={() => { setCurrentDate(dateStr); setTab('day') }}
                    className={'px-3 py-2.5 border-b cursor-pointer transition-colors ' + (isToday ? 'border-primary-500/30 bg-primary-500/5 hover:bg-primary-500/10' : 'border-dark-border bg-dark-surface2/50 hover:bg-dark-surface2')}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className={'text-[10px] font-bold uppercase tracking-wider ' + (isToday ? 'text-primary-400' : 'text-gray-600')}>{DAYS[i]}</div>
                        <div className={'text-lg font-bold ' + (isToday ? 'text-primary-300' : 'text-white')}>{date.getDate()}</div>
                      </div>
                      {dayTasks.length > 0 && (
                        <div className="text-right">
                          <div className={'text-xs font-semibold ' + (done === dayTasks.length ? 'text-green-400' : 'text-gray-500')}>{done}/{dayTasks.length}</div>
                        </div>
                      )}
                    </div>
                    {dayTasks.length > 0 && (
                      <div className="mt-1.5"><ProgressBar done={done} total={dayTasks.length} /></div>
                    )}
                  </div>

                  {/* Tasks */}
                  <div className="p-1.5 space-y-1 flex-1 min-h-[120px] max-h-[320px] overflow-y-auto">
                    {dayTasks.map((task: any) => <WeekCard key={task.id} task={task} dateStr={dateStr} />)}
                  </div>

                  {/* Quick add */}
                  <div className="border-t border-dark-border/30">
                    <QuickAddRow date={dateStr} />
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* ═══ MONTH VIEW ═══ */}
      {tab === 'month' && (
        <div className="bg-dark-surface border border-dark-border rounded-xl p-5">
          <div className="grid grid-cols-7 gap-1 mb-2">
            {DAYS.map(d => <div key={d} className="text-center text-xs text-gray-500 font-semibold py-2 uppercase tracking-wider">{d}</div>)}
          </div>
          {monthWeeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 gap-1 mb-1">
              {week.map((date, di) => {
                if (!date) return <div key={di} className="min-h-[100px] rounded-lg bg-dark-surface2/10" />
                const dateStr = fmtDate(date)
                const dayTasks = tasks.filter((t: any) => (t.task_date ?? '').slice(0, 10) === dateStr)
                const isToday = dateStr === today
                const done = dayTasks.filter((t: any) => t.completed).length
                return (
                  <div key={di} onClick={() => { setCurrentDate(dateStr); setTab('day') }}
                    className={'min-h-[100px] rounded-lg border p-2 cursor-pointer transition-all hover:border-primary-500/40 hover:shadow-lg ' +
                      (isToday ? 'border-primary-500/50 bg-primary-500/5' : 'border-dark-border/40 bg-dark-surface2/20 hover:bg-dark-surface2/40')}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className={'text-xs font-bold ' + (isToday ? 'text-primary-400 bg-primary-500/10 w-6 h-6 rounded-full flex items-center justify-center' : 'text-gray-400')}>{date.getDate()}</span>
                      {dayTasks.length > 0 && <span className={'text-[9px] font-semibold ' + (done === dayTasks.length ? 'text-green-400' : 'text-gray-600')}>{done}/{dayTasks.length}</span>}
                    </div>
                    <div className="space-y-0.5">
                      {dayTasks.slice(0, 3).map((t: any) => (
                        <div key={t.id} className="flex items-center gap-1">
                          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: PRIORITY_COLOR[t.priority] ?? '#6b7280' }} />
                          <span className={'text-[10px] truncate ' + (t.completed ? 'text-gray-600 line-through' : 'text-gray-300')}>{t.title}</span>
                        </div>
                      ))}
                      {dayTasks.length > 3 && <div className="text-[10px] text-gray-600 pl-3">+{dayTasks.length - 3} more</div>}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}

      {/* ═══ STATS VIEW ═══ */}
      {tab === 'stats' && (
        <div className="space-y-5">
          <div className="flex gap-3 items-end flex-wrap">
            <div>
              <label className="block text-xs text-gray-400 mb-1">From</label>
              <input type="date" value={statsFrom} onChange={e => setStatsFrom(e.target.value)} className={filterSel} />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">To</label>
              <input type="date" value={statsTo} onChange={e => setStatsTo(e.target.value)} className={filterSel} />
            </div>
          </div>

          {stats && (() => {
            const totalTasks = stats.by_employee.reduce((s: number, e: any) => s + e.total, 0)
            const completedTasks = stats.by_employee.reduce((s: number, e: any) => s + e.completed, 0)
            const rate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
            return (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-dark-surface border border-dark-border rounded-xl p-5">
                    <p className="text-xs text-gray-500 font-medium">Total Tasks</p>
                    <p className="text-3xl font-bold text-white mt-2">{totalTasks}</p>
                  </div>
                  <div className="bg-dark-surface border border-dark-border rounded-xl p-5">
                    <p className="text-xs text-gray-500 font-medium">Completed</p>
                    <p className="text-3xl font-bold text-green-400 mt-2">{completedTasks}</p>
                  </div>
                  <div className="bg-dark-surface border border-dark-border rounded-xl p-5">
                    <p className="text-xs text-gray-500 font-medium">Pending</p>
                    <p className="text-3xl font-bold text-amber-400 mt-2">{totalTasks - completedTasks}</p>
                  </div>
                  <div className="bg-dark-surface border border-dark-border rounded-xl p-5">
                    <p className="text-xs text-gray-500 font-medium">Completion Rate</p>
                    <p className="text-3xl font-bold text-primary-400 mt-2">{rate}%</p>
                    <div className="mt-2"><ProgressBar done={completedTasks} total={totalTasks} /></div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-dark-surface border border-dark-border rounded-xl p-5">
                    <h2 className="text-sm font-semibold text-white mb-4">By Employee</h2>
                    {stats.by_employee.length > 0 ? (
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={stats.by_employee} layout="vertical">
                          <XAxis type="number" tick={{ fontSize: 11, fill: '#6b7280' }} />
                          <YAxis dataKey="employee_name" type="category" tick={{ fontSize: 11, fill: '#9ca3af' }} width={100} />
                          <Tooltip contentStyle={TOOLTIP_STYLE} />
                          <Bar dataKey="completed" fill="#10b981" radius={[0, 4, 4, 0]} name="Done" stackId="a" />
                          <Bar dataKey="total" fill="#374151" radius={[0, 4, 4, 0]} name="Remaining" stackId="a" />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : <div className="h-[260px] flex items-center justify-center text-gray-600 text-sm">No data</div>}
                  </div>
                  <div className="bg-dark-surface border border-dark-border rounded-xl p-5">
                    <h2 className="text-sm font-semibold text-white mb-4">By Group</h2>
                    {stats.by_group.length > 0 ? (
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={stats.by_group}>
                          <XAxis dataKey="task_group" tick={{ fontSize: 10, fill: '#6b7280' }} />
                          <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} />
                          <Tooltip contentStyle={TOOLTIP_STYLE} />
                          <Bar dataKey="total" fill="#c9a84c" radius={[4, 4, 0, 0]} name="Total" />
                          <Bar dataKey="completed" fill="#10b981" radius={[4, 4, 0, 0]} name="Done" />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : <div className="h-[260px] flex items-center justify-center text-gray-600 text-sm">No data</div>}
                  </div>
                </div>
              </>
            )
          })()}
        </div>
      )}

      {/* ═══ COPY MODAL ═══ */}
      {copyTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setCopyTarget(null)}>
          <div className="bg-dark-surface border border-dark-border rounded-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-white mb-4">Duplicate Task</h2>
            <form onSubmit={e => { e.preventDefault(); const fd = new FormData(e.target as HTMLFormElement); copyMutation.mutate({ id: copyTarget.taskId, task_date: fd.get('task_date'), employee_name: fd.get('employee_name') ?? '' }) }} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Target Date</label>
                <input required type="date" name="task_date" defaultValue={copyTarget.date} className={input} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Assign To (optional)</label>
                <select name="employee_name" className={input}>
                  <option value="">Keep original</option>
                  {settings.employees.map(e => <option key={e}>{e}</option>)}
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setCopyTarget(null)} className="px-4 py-2.5 text-sm text-gray-400 hover:text-white rounded-lg hover:bg-dark-surface2 transition-colors">Cancel</button>
                <button type="submit" disabled={copyMutation.isPending} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm rounded-lg disabled:opacity-50 transition-colors">
                  {copyMutation.isPending ? 'Duplicating...' : 'Duplicate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══ MOVE MODAL ═══ */}
      {moveTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setMoveTarget(null)}>
          <div className="bg-dark-surface border border-dark-border rounded-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-white mb-4">Move Task</h2>
            <form onSubmit={e => { e.preventDefault(); const fd = new FormData(e.target as HTMLFormElement); moveMutation.mutate({ id: moveTarget.taskId, task_date: fd.get('task_date'), employee_name: fd.get('employee_name') || undefined }) }} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">New Date</label>
                <input required type="date" name="task_date" defaultValue={moveTarget.date} className={input} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Reassign (optional)</label>
                <select name="employee_name" className={input}>
                  <option value="">Keep current</option>
                  {settings.employees.map(e => <option key={e}>{e}</option>)}
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setMoveTarget(null)} className="px-4 py-2.5 text-sm text-gray-400 hover:text-white rounded-lg hover:bg-dark-surface2 transition-colors">Cancel</button>
                <button type="submit" disabled={moveMutation.isPending} className="px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-semibold text-sm rounded-lg disabled:opacity-50 transition-colors">
                  {moveMutation.isPending ? 'Moving...' : 'Move'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══ CREATE/EDIT MODAL ═══ */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => { setShowModal(false); setEditTask(null); setForm({ ...EMPTY_FORM }) }}>
          <div className="bg-dark-surface border border-dark-border rounded-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-white">
                {editTask ? 'Edit Task' : 'New Task'}
              </h2>
              <button onClick={() => { setShowModal(false); setEditTask(null); setForm({ ...EMPTY_FORM }) }} className="p-1 rounded-lg text-gray-500 hover:text-white hover:bg-dark-surface2 transition-colors">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={e => { e.preventDefault(); handleSubmit() }} className="space-y-4">
              {/* Title */}
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Title *</label>
                <input required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="What needs to be done?" className={input} autoFocus />
              </div>

              {/* Employee + Priority */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-gray-400 mb-1.5"><User size={12} /> Assign To</label>
                  <select value={form.employee_name} onChange={e => setForm(f => ({ ...f, employee_name: e.target.value }))} className={input}>
                    <option value="">Unassigned</option>
                    {settings.employees.map(emp => <option key={emp}>{emp}</option>)}
                  </select>
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-gray-400 mb-1.5"><Flag size={12} /> Priority</label>
                  <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} className={input}>
                    {['Low', 'Normal', 'High'].map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
              </div>

              {/* Date + Time */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-gray-400 mb-1.5"><Calendar size={12} /> Date</label>
                  <input type="date" value={form.task_date} onChange={e => setForm(f => ({ ...f, task_date: e.target.value }))} className={input} required />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-gray-400 mb-1.5"><Clock size={12} /> Start</label>
                  <input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} className={input} />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-gray-400 mb-1.5"><Clock size={12} /> End</label>
                  <input type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} className={input} />
                </div>
              </div>

              {/* Group + Category + Duration */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-gray-400 mb-1.5"><Tag size={12} /> Group</label>
                  <select value={form.task_group} onChange={e => setForm(f => ({ ...f, task_group: e.target.value }))} className={input}>
                    <option value="">None</option>
                    {settings.planner_groups.map(g => <option key={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-400 mb-1.5 block">Category</label>
                  <input value={form.task_category} onChange={e => setForm(f => ({ ...f, task_category: e.target.value }))} placeholder="e.g. Check-in" className={input} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-400 mb-1.5 block">Duration (min)</label>
                  <input type="number" min="1" value={form.duration_minutes} onChange={e => setForm(f => ({ ...f, duration_minutes: e.target.value }))} placeholder="30" className={input} />
                </div>
              </div>

              {/* Status (edit only) */}
              {editTask && (
                <div>
                  <label className="text-xs font-medium text-gray-400 mb-1.5 block">Status</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className={input}>
                    <option value="">None</option>
                    <option value="todo">To Do</option>
                    <option value="in_progress">In Progress</option>
                    <option value="blocked">Blocked</option>
                    <option value="done">Done</option>
                  </select>
                </div>
              )}

              {/* Description */}
              <div>
                <label className="text-xs font-medium text-gray-400 mb-1.5 block">Description</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} placeholder="Add details, instructions, or notes..."
                  className={input + ' resize-none'} />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-2 border-t border-dark-border/50">
                <button type="button" onClick={() => { setShowModal(false); setEditTask(null); setForm({ ...EMPTY_FORM }) }} className="px-4 py-2.5 text-sm text-gray-400 hover:text-white rounded-lg hover:bg-dark-surface2 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={createMutation.isPending || updateMutation.isPending}
                  className="px-6 py-2.5 bg-primary-600 hover:bg-primary-500 text-white font-semibold text-sm rounded-lg disabled:opacity-50 transition-colors">
                  {(createMutation.isPending || updateMutation.isPending) ? 'Saving...' : editTask ? 'Update Task' : 'Create Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
