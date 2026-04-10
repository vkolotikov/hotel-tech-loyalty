import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useSettings } from '../lib/crmSettings'
import toast from 'react-hot-toast'
import {
  ChevronLeft, ChevronRight, Plus, CheckCircle2, Circle, Copy, Trash2,
  BarChart2, Calendar, CalendarDays, CalendarRange, FileText,
  ChevronDown, Edit, ArrowRight,
} from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

const PRIORITY_COLORS: Record<string, string> = {
  Low: 'border-l-gray-600',
  Normal: 'border-l-blue-500',
  High: 'border-l-red-500',
}

const GROUP_COLORS: Record<string, string> = {
  Housekeeping: 'bg-emerald-500/15 text-emerald-400',
  'Front Desk': 'bg-blue-500/15 text-blue-400',
  Maintenance: 'bg-amber-500/15 text-amber-400',
  'F&B': 'bg-purple-500/15 text-purple-400',
  Management: 'bg-red-500/15 text-red-400',
  Sales: 'bg-cyan-500/15 text-cyan-400',
}

const TOOLTIP_STYLE = { backgroundColor: '#1a1a2e', border: '1px solid #2e2e50', borderRadius: 8, fontSize: 12 }

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function getMonday(d: Date): Date {
  const date = new Date(d)
  const day = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1)
  return new Date(date.setDate(diff))
}

function getWeekDates(startDate: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startDate)
    d.setDate(d.getDate() + i)
    return d
  })
}

function getMonthDates(year: number, month: number): (Date | null)[][] {
  const first = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0).getDate()
  const startDow = (first.getDay() + 6) % 7 // Monday=0
  const weeks: (Date | null)[][] = []
  let week: (Date | null)[] = Array(startDow).fill(null)
  for (let day = 1; day <= lastDay; day++) {
    week.push(new Date(year, month, day))
    if (week.length === 7) { weeks.push(week); week = [] }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null)
    weeks.push(week)
  }
  return weeks
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const EMPTY_FORM = { employee_name: '', title: '', task_date: '', start_time: '', priority: 'Normal', task_group: '', description: '' }

type Tab = 'day' | 'week' | 'month' | 'stats'

export function Planner() {
  const qc = useQueryClient()
  const settings = useSettings()
  const [tab, setTab] = useState<Tab>('week')
  const [currentDate, setCurrentDate] = useState(() => formatDate(new Date()))
  const [weekStart, setWeekStart] = useState(() => formatDate(getMonday(new Date())))
  const [monthYear, setMonthYear] = useState(() => ({ year: new Date().getFullYear(), month: new Date().getMonth() }))
  const [employee, setEmployee] = useState('')
  const [groupFilter, setGroupFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [createDate, setCreateDate] = useState('')
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [expandedTask, setExpandedTask] = useState<number | null>(null)
  const [newSubtask, setNewSubtask] = useState('')
  const [copyTarget, setCopyTarget] = useState<{ taskId: number; date: string } | null>(null)
  const [moveTarget, setMoveTarget] = useState<{ taskId: number; date: string } | null>(null)
  const [editTask, setEditTask] = useState<any>(null)
  const [statsFrom, setStatsFrom] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10))
  const [statsTo, setStatsTo] = useState(() => formatDate(new Date()))

  const today = formatDate(new Date())

  // Build query params based on active tab
  const queryParams: any = { employee: employee || undefined, task_group: groupFilter || undefined }
  if (tab === 'day') {
    queryParams.date = currentDate
  } else if (tab === 'week') {
    queryParams.week_start = weekStart
  } else if (tab === 'month') {
    const mFrom = monthYear.year + '-' + String(monthYear.month + 1).padStart(2, '0') + '-01'
    const lastDay = new Date(monthYear.year, monthYear.month + 1, 0).getDate()
    const mTo = monthYear.year + '-' + String(monthYear.month + 1).padStart(2, '0') + '-' + String(lastDay).padStart(2, '0')
    queryParams.from = mFrom
    queryParams.to = mTo
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

  const invalidate = () => qc.invalidateQueries({ queryKey: ['planner-tasks'] })

  const createMutation = useMutation({
    mutationFn: (body: any) => api.post('/v1/admin/planner/tasks', body),
    onSuccess: () => { invalidate(); setShowCreate(false); setForm({ ...EMPTY_FORM }); toast.success('Task added') },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, ...body }: any) => api.put('/v1/admin/planner/tasks/' + id, body),
    onSuccess: () => { invalidate(); setEditTask(null); toast.success('Task updated') },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, completed }: any) => api.put('/v1/admin/planner/tasks/' + id, { completed: !completed }),
    onSuccess: invalidate,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete('/v1/admin/planner/tasks/' + id),
    onSuccess: () => { invalidate(); toast.success('Deleted') },
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

  const addSubtaskMutation = useMutation({
    mutationFn: ({ taskId, title }: any) => api.post('/v1/admin/planner/tasks/' + taskId + '/subtasks', { title }),
    onSuccess: () => { invalidate(); setNewSubtask('') },
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

  // Navigation helpers
  const moveDay = (dir: number) => {
    const d = new Date(currentDate)
    d.setDate(d.getDate() + dir)
    setCurrentDate(formatDate(d))
  }

  const moveWeek = (dir: number) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + dir * 7)
    setWeekStart(formatDate(d))
  }

  const moveMonth = (dir: number) => {
    setMonthYear(prev => {
      let m = prev.month + dir
      let y = prev.year
      if (m < 0) { m = 11; y-- }
      if (m > 11) { m = 0; y++ }
      return { year: y, month: m }
    })
  }

  const goToday = () => {
    const now = new Date()
    setCurrentDate(formatDate(now))
    setWeekStart(formatDate(getMonday(now)))
    setMonthYear({ year: now.getFullYear(), month: now.getMonth() })
  }

  const openCreate = (date: string) => {
    setCreateDate(date)
    setForm({ ...EMPTY_FORM, task_date: date })
    setShowCreate(true)
  }

  const openEdit = (task: any) => {
    setEditTask(task)
    setForm({
      employee_name: task.employee_name ?? '',
      title: task.title ?? '',
      task_date: (task.task_date ?? '').slice(0, 10),
      start_time: task.start_time ? task.start_time.slice(0, 5) : '',
      priority: task.priority ?? 'Normal',
      task_group: task.task_group ?? '',
      description: task.description ?? '',
    })
  }

  const weekDates = getWeekDates(new Date(weekStart))
  const monthWeeks = getMonthDates(monthYear.year, monthYear.month)

  const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  // Subtitle based on tab
  const subtitle = tab === 'day'
    ? new Date(currentDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : tab === 'week'
    ? 'Week of ' + weekStart
    : tab === 'month'
    ? MONTH_NAMES[monthYear.month] + ' ' + monthYear.year
    : 'Statistics'

  // Task card component
  const TaskCard = ({ task, dateStr, compact }: { task: any; dateStr: string; compact?: boolean }) => {
    const isExpanded = expandedTask === task.id

    return (
      <div className={'rounded-lg bg-dark-surface2 border-l-2 ' + (PRIORITY_COLORS[task.priority] ?? 'border-l-gray-600') + (compact ? ' p-1.5 text-[10px]' : ' p-2.5 text-xs')}>
        <div className="flex items-start gap-1.5">
          <button onClick={() => toggleMutation.mutate({ id: task.id, completed: task.completed })} className="flex-shrink-0 mt-0.5">
            {task.completed
              ? <CheckCircle2 size={compact ? 11 : 13} className="text-green-400" />
              : <Circle size={compact ? 11 : 13} className="text-gray-600 hover:text-gray-400" />}
          </button>
          <div className="flex-1 min-w-0">
            <div className={'font-medium leading-tight ' + (task.completed ? 'line-through text-gray-600' : 'text-white')}>{task.title}</div>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              {task.employee_name && !employee && <span className="text-gray-500 truncate">{task.employee_name}</span>}
              {task.start_time && <span className="text-gray-600">{task.start_time.slice(0, 5)}</span>}
              {task.task_group && (
                <span className={`px-1.5 py-0 rounded text-[9px] font-medium ${GROUP_COLORS[task.task_group] ?? 'bg-gray-500/15 text-gray-400'}`}>
                  {task.task_group}
                </span>
              )}
            </div>
            {task.subtasks?.length > 0 && (
              <div className="text-gray-600 mt-0.5">
                <span className={task.subtasks.every((s: any) => s.is_done) ? 'text-green-500' : ''}>
                  {task.subtasks.filter((s: any) => s.is_done).length}/{task.subtasks.length} subtasks
                </span>
              </div>
            )}
          </div>
          {!compact && (
            <div className="flex items-center gap-0.5">
              <button onClick={() => setExpandedTask(isExpanded ? null : task.id)} className={'p-1 rounded hover:bg-dark-surface transition-colors ' + (isExpanded ? 'text-primary-400' : 'text-gray-600 hover:text-gray-400')} title="Details">
                <ChevronDown size={11} className={'transition-transform ' + (isExpanded ? 'rotate-180' : '')} />
              </button>
              <button onClick={() => openEdit(task)} className="p-1 rounded text-gray-600 hover:text-primary-400 hover:bg-dark-surface transition-colors" title="Edit">
                <Edit size={10} />
              </button>
              <button onClick={() => setMoveTarget({ taskId: task.id, date: dateStr })} className="p-1 rounded text-gray-600 hover:text-amber-400 hover:bg-dark-surface transition-colors" title="Move">
                <ArrowRight size={10} />
              </button>
              <button onClick={() => setCopyTarget({ taskId: task.id, date: dateStr })} className="p-1 rounded text-gray-600 hover:text-blue-400 hover:bg-dark-surface transition-colors" title="Copy">
                <Copy size={10} />
              </button>
              <button onClick={() => { if (confirm('Delete this task?')) deleteMutation.mutate(task.id) }} className="p-1 rounded text-gray-600 hover:text-red-400 hover:bg-dark-surface transition-colors" title="Delete">
                <Trash2 size={10} />
              </button>
            </div>
          )}
          {compact && (
            <div className="flex gap-0.5">
              <button onClick={() => openEdit(task)} className="text-gray-600 hover:text-primary-400 p-0.5" title="Edit"><Edit size={9} /></button>
              <button onClick={() => { if (confirm('Delete?')) deleteMutation.mutate(task.id) }} className="text-gray-600 hover:text-red-400 p-0.5" title="Delete"><Trash2 size={9} /></button>
            </div>
          )}
        </div>

        {/* Expanded details + subtasks */}
        {isExpanded && !compact && (
          <div className="mt-2.5 space-y-2 border-t border-dark-border/50 pt-2.5">
            {task.description && (
              <p className="text-xs text-gray-400 leading-relaxed">{task.description}</p>
            )}

            {/* Subtasks */}
            <div className="space-y-1">
              {task.subtasks?.map((sub: any) => (
                <div key={sub.id} className="flex items-center gap-1.5 group">
                  <button onClick={() => toggleSubtaskMutation.mutate(sub.id)}>
                    {sub.is_done
                      ? <CheckCircle2 size={11} className="text-green-400" />
                      : <Circle size={11} className="text-gray-600 hover:text-gray-400" />}
                  </button>
                  <span className={'flex-1 text-xs ' + (sub.is_done ? 'line-through text-gray-600' : 'text-gray-300')}>{sub.title}</span>
                  <button onClick={() => deleteSubtaskMutation.mutate(sub.id)} className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-opacity">
                    <Trash2 size={9} />
                  </button>
                </div>
              ))}
              <div className="flex gap-1 mt-1">
                <input
                  value={newSubtask}
                  onChange={e => setNewSubtask(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && newSubtask.trim()) { addSubtaskMutation.mutate({ taskId: task.id, title: newSubtask.trim() }); e.preventDefault() } }}
                  placeholder="Add subtask..."
                  className="flex-1 bg-dark-surface border border-dark-border rounded px-2 py-1 text-xs text-white placeholder-gray-700 focus:outline-none focus:border-primary-500"
                />
                <button onClick={() => newSubtask.trim() && addSubtaskMutation.mutate({ taskId: task.id, title: newSubtask.trim() })} className="text-gray-600 hover:text-white px-1">
                  <Plus size={11} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  const filterSel = 'bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500'

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Planner</h1>
          <p className="text-sm text-gray-500">{subtitle}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Tabs */}
          <div className="flex rounded-lg border border-dark-border overflow-hidden">
            {([
              ['day', CalendarDays, 'Day'],
              ['week', Calendar, 'Week'],
              ['month', CalendarRange, 'Month'],
              ['stats', BarChart2, 'Stats'],
            ] as const).map(([t, Icon, label]) => (
              <button key={t} onClick={() => setTab(t as Tab)} className={'flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors ' + (tab === t ? 'bg-primary-500/10 text-primary-400' : 'text-gray-400 hover:text-white')}>
                <Icon size={14} /> {label}
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
              <button onClick={() => tab === 'day' ? moveDay(-1) : tab === 'week' ? moveWeek(-1) : moveMonth(-1)} className="p-2 rounded-lg border border-dark-border text-gray-400 hover:text-white transition-colors"><ChevronLeft size={15} /></button>
              <button onClick={goToday} className="px-3 py-1.5 rounded-lg border border-dark-border text-xs text-gray-400 hover:text-white transition-colors">Today</button>
              <button onClick={() => tab === 'day' ? moveDay(1) : tab === 'week' ? moveWeek(1) : moveMonth(1)} className="p-2 rounded-lg border border-dark-border text-gray-400 hover:text-white transition-colors"><ChevronRight size={15} /></button>
            </div>
          </>}
        </div>
      </div>

      {/* DAY VIEW */}
      {tab === 'day' && (
        <>
          {/* Day Note */}
          <div className="bg-dark-surface border border-dark-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <FileText size={14} className="text-primary-400" />
              <span className="text-sm font-medium text-white">Day Note &mdash; {currentDate}</span>
            </div>
            <textarea
              key={currentDate}
              defaultValue={dayNote?.note_text ?? ''}
              onBlur={e => upsertNoteMutation.mutate({ note_date: currentDate, note_text: e.target.value })}
              rows={2}
              placeholder="Add notes for this day..."
              className="w-full bg-dark-surface2 border border-dark-border rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500 resize-none"
            />
          </div>

          {/* Day Tasks */}
          <div className="bg-dark-surface border border-dark-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-semibold text-white">{tasks.length} task{tasks.length !== 1 ? 's' : ''}</h2>
                {tasks.length > 0 && (
                  <span className="text-xs text-gray-500">
                    {tasks.filter((t: any) => t.completed).length} done
                  </span>
                )}
              </div>
              <button onClick={() => openCreate(currentDate)} className="flex items-center gap-1.5 text-xs font-medium text-primary-400 hover:text-primary-300 bg-primary-500/10 hover:bg-primary-500/20 px-3 py-1.5 rounded-lg transition-colors">
                <Plus size={13} /> Add Task
              </button>
            </div>
            <div className="space-y-2">
              {tasks.length === 0 && <p className="text-gray-600 text-sm text-center py-8">No tasks for this day</p>}
              {tasks.map((task: any) => (
                <TaskCard key={task.id} task={task} dateStr={currentDate} />
              ))}
            </div>
          </div>
        </>
      )}

      {/* WEEK VIEW */}
      {tab === 'week' && (
        <>
          {/* Day Note */}
          <div className="bg-dark-surface border border-dark-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <FileText size={14} className="text-primary-400" />
              <span className="text-sm font-medium text-white">Day Note &mdash; {today}</span>
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

          {/* Week Grid */}
          <div className="grid grid-cols-7 gap-2">
            {weekDates.map((date, i) => {
              const dateStr = formatDate(date)
              const dayTasks = tasks.filter((t: any) => (t.task_date ?? '').slice(0, 10) === dateStr)
              const isToday = dateStr === today
              const doneCount = dayTasks.filter((t: any) => t.completed).length

              return (
                <div key={dateStr} className={'bg-dark-surface border rounded-xl overflow-hidden min-h-[200px] flex flex-col ' + (isToday ? 'border-primary-500/50' : 'border-dark-border')}>
                  <div className={'px-3 py-2 border-b ' + (isToday ? 'border-primary-500/30 bg-primary-500/5' : 'border-dark-border bg-dark-surface2')}>
                    <div className={'text-xs font-semibold ' + (isToday ? 'text-primary-400' : 'text-gray-500')}>{DAY_NAMES[i]}</div>
                    <div className="flex items-baseline gap-2">
                      <span className={'text-sm font-bold ' + (isToday ? 'text-primary-300' : 'text-white')}>{date.getDate()}</span>
                      {dayTasks.length > 0 && (
                        <span className="text-[10px] text-gray-600">{doneCount}/{dayTasks.length}</span>
                      )}
                    </div>
                  </div>

                  <div className="p-2 space-y-1.5 flex-1">
                    {dayTasks.map((task: any) => (
                      <TaskCard key={task.id} task={task} dateStr={dateStr} />
                    ))}
                  </div>

                  <div className="p-2 pt-0">
                    <button onClick={() => openCreate(dateStr)} className="w-full flex items-center justify-center gap-1 p-1.5 rounded-lg text-gray-600 hover:text-gray-400 hover:bg-dark-surface2 transition-colors text-xs">
                      <Plus size={11} /> Add
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* MONTH VIEW */}
      {tab === 'month' && (
        <div className="bg-dark-surface border border-dark-border rounded-xl p-5">
          {/* Month header row */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {DAY_NAMES.map(d => (
              <div key={d} className="text-center text-xs text-gray-500 font-medium py-1">{d}</div>
            ))}
          </div>

          {/* Month grid */}
          {monthWeeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 gap-1 mb-1">
              {week.map((date, di) => {
                if (!date) return <div key={di} className="min-h-[90px] rounded-lg bg-dark-surface2/20" />
                const dateStr = formatDate(date)
                const dayTasks = tasks.filter((t: any) => (t.task_date ?? '').slice(0, 10) === dateStr)
                const isToday = dateStr === today
                const doneCount = dayTasks.filter((t: any) => t.completed).length
                return (
                  <div
                    key={di}
                    onClick={() => { setCurrentDate(dateStr); setTab('day') }}
                    className={'min-h-[90px] rounded-lg border p-2 cursor-pointer transition-colors hover:border-primary-500/40 ' +
                      (isToday ? 'border-primary-500/50 bg-primary-500/5' : 'border-dark-border/50 bg-dark-surface2/30')}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={'text-xs font-semibold ' + (isToday ? 'text-primary-400' : 'text-white')}>{date.getDate()}</span>
                      {dayTasks.length > 0 && (
                        <span className="text-[9px] text-gray-600">{doneCount}/{dayTasks.length}</span>
                      )}
                    </div>
                    <div className="space-y-0.5">
                      {dayTasks.slice(0, 3).map((t: any) => (
                        <div key={t.id} className={'text-[10px] px-1 py-0.5 rounded truncate border-l-2 ' +
                          (PRIORITY_COLORS[t.priority] ?? 'border-l-gray-600') + ' ' +
                          (t.completed ? 'text-gray-600 line-through' : 'text-gray-300')}>
                          {t.title}
                        </div>
                      ))}
                      {dayTasks.length > 3 && <div className="text-[10px] text-gray-500">+{dayTasks.length - 3} more</div>}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}

      {/* STATS VIEW */}
      {tab === 'stats' && (
        <div className="space-y-5">
          <div className="flex gap-3 items-center">
            <div>
              <label className="block text-xs text-gray-400 mb-1">From</label>
              <input type="date" value={statsFrom} onChange={e => setStatsFrom(e.target.value)} className={filterSel} />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">To</label>
              <input type="date" value={statsTo} onChange={e => setStatsTo(e.target.value)} className={filterSel} />
            </div>
          </div>

          {stats && (
            <>
              {/* Summary KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {(() => {
                  const totalTasks = stats.by_employee.reduce((s: number, e: any) => s + e.total, 0)
                  const completedTasks = stats.by_employee.reduce((s: number, e: any) => s + e.completed, 0)
                  const rate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
                  return (
                    <>
                      <div className="bg-dark-surface border border-dark-border rounded-xl p-4">
                        <p className="text-xs text-gray-500">Total Tasks</p>
                        <p className="text-2xl font-bold text-white mt-1">{totalTasks}</p>
                      </div>
                      <div className="bg-dark-surface border border-dark-border rounded-xl p-4">
                        <p className="text-xs text-gray-500">Completed</p>
                        <p className="text-2xl font-bold text-green-400 mt-1">{completedTasks}</p>
                      </div>
                      <div className="bg-dark-surface border border-dark-border rounded-xl p-4">
                        <p className="text-xs text-gray-500">Pending</p>
                        <p className="text-2xl font-bold text-amber-400 mt-1">{totalTasks - completedTasks}</p>
                      </div>
                      <div className="bg-dark-surface border border-dark-border rounded-xl p-4">
                        <p className="text-xs text-gray-500">Completion Rate</p>
                        <p className="text-2xl font-bold text-primary-400 mt-1">{rate}%</p>
                      </div>
                    </>
                  )
                })()}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-dark-surface border border-dark-border rounded-xl p-5">
                  <h2 className="text-sm font-semibold text-white mb-4">By Employee</h2>
                  {stats.by_employee.length > 0 ? (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={stats.by_employee}>
                        <XAxis dataKey="employee_name" tick={{ fontSize: 11, fill: '#6b7280' }} />
                        <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} />
                        <Bar dataKey="total" fill="#6366f1" radius={[4, 4, 0, 0]} name="Total" />
                        <Bar dataKey="completed" fill="#10b981" radius={[4, 4, 0, 0]} name="Done" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : <div className="h-[220px] flex items-center justify-center text-gray-600 text-sm">No data</div>}
                </div>

                <div className="bg-dark-surface border border-dark-border rounded-xl p-5">
                  <h2 className="text-sm font-semibold text-white mb-4">By Group</h2>
                  {stats.by_group.length > 0 ? (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={stats.by_group}>
                        <XAxis dataKey="task_group" tick={{ fontSize: 11, fill: '#6b7280' }} />
                        <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} />
                        <Bar dataKey="total" fill="#c9a84c" radius={[4, 4, 0, 0]} name="Total" />
                        <Bar dataKey="completed" fill="#10b981" radius={[4, 4, 0, 0]} name="Done" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : <div className="h-[220px] flex items-center justify-center text-gray-600 text-sm">No data</div>}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Copy Task Modal */}
      {copyTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-surface border border-dark-border rounded-2xl w-full max-w-sm p-6">
            <h2 className="text-base font-semibold text-white mb-4">Copy Task</h2>
            <form onSubmit={e => { e.preventDefault(); const fd = new FormData(e.target as HTMLFormElement); copyMutation.mutate({ id: copyTarget.taskId, task_date: fd.get('task_date'), employee_name: fd.get('employee_name') ?? '' }) }} className="space-y-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Target Date *</label>
                <input required type="date" name="task_date" defaultValue={copyTarget.date} className="w-full bg-dark-surface2 border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Employee (optional override)</label>
                <select name="employee_name" className="w-full bg-dark-surface2 border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500">
                  <option value="">Keep original</option>
                  {settings.employees.map(e => <option key={e}>{e}</option>)}
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-1">
                <button type="button" onClick={() => setCopyTarget(null)} className="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
                <button type="submit" disabled={copyMutation.isPending} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-lg disabled:opacity-50">
                  {copyMutation.isPending ? 'Copying...' : 'Copy Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Move Task Modal */}
      {moveTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-surface border border-dark-border rounded-2xl w-full max-w-sm p-6">
            <h2 className="text-base font-semibold text-white mb-4">Move Task</h2>
            <form onSubmit={e => { e.preventDefault(); const fd = new FormData(e.target as HTMLFormElement); moveMutation.mutate({ id: moveTarget.taskId, task_date: fd.get('task_date'), employee_name: fd.get('employee_name') || undefined }) }} className="space-y-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">New Date *</label>
                <input required type="date" name="task_date" defaultValue={moveTarget.date} className="w-full bg-dark-surface2 border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Reassign (optional)</label>
                <select name="employee_name" className="w-full bg-dark-surface2 border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500">
                  <option value="">Keep current</option>
                  {settings.employees.map(e => <option key={e}>{e}</option>)}
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-1">
                <button type="button" onClick={() => setMoveTarget(null)} className="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
                <button type="submit" disabled={moveMutation.isPending} className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm rounded-lg disabled:opacity-50">
                  {moveMutation.isPending ? 'Moving...' : 'Move Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create / Edit Task Modal */}
      {(showCreate || editTask) && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-surface border border-dark-border rounded-2xl w-full max-w-md p-6">
            <h2 className="text-base font-semibold text-white mb-4">
              {editTask ? 'Edit Task' : `Add Task \u2014 ${createDate}`}
            </h2>
            <form onSubmit={e => {
              e.preventDefault()
              if (editTask) {
                updateMutation.mutate({ id: editTask.id, ...form })
              } else {
                createMutation.mutate(form)
              }
            }} className="space-y-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Title *</label>
                <input required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  className="w-full bg-dark-surface2 border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Employee</label>
                  <select value={form.employee_name} onChange={e => setForm(f => ({ ...f, employee_name: e.target.value }))} className="w-full bg-dark-surface2 border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500">
                    <option value="">Unassigned</option>
                    {settings.employees.map(emp => <option key={emp}>{emp}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Priority</label>
                  <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} className="w-full bg-dark-surface2 border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500">
                    {['Low', 'Normal', 'High'].map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                {editTask && (
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Date</label>
                    <input type="date" value={form.task_date} onChange={e => setForm(f => ({ ...f, task_date: e.target.value }))} className="w-full bg-dark-surface2 border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
                  </div>
                )}
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Start Time</label>
                  <input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} className="w-full bg-dark-surface2 border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Group</label>
                  <select value={form.task_group} onChange={e => setForm(f => ({ ...f, task_group: e.target.value }))} className="w-full bg-dark-surface2 border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500">
                    <option value="">-- None --</option>
                    {settings.planner_groups.map(g => <option key={g}>{g}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Description</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2}
                  className="w-full bg-dark-surface2 border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none" />
              </div>
              <div className="flex justify-end gap-3 pt-1">
                <button type="button" onClick={() => { setShowCreate(false); setEditTask(null); setForm({ ...EMPTY_FORM }) }} className="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
                <button type="submit" disabled={createMutation.isPending || updateMutation.isPending} className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold text-sm rounded-lg disabled:opacity-50">
                  {(createMutation.isPending || updateMutation.isPending) ? 'Saving...' : editTask ? 'Update Task' : 'Add Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
