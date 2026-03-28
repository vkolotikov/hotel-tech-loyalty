import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useSettings } from '../lib/crmSettings'
import toast from 'react-hot-toast'
import {
  ChevronLeft, ChevronRight, Plus, CheckCircle2, Circle, Copy, Trash2,
  BarChart2, Calendar, FileText,
} from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

const PRIORITY_COLORS: Record<string, string> = {
  Low: 'border-l-gray-600',
  Normal: 'border-l-blue-500',
  High: 'border-l-red-500',
}

const TOOLTIP_STYLE = { backgroundColor: '#1a1a2e', border: '1px solid #2e2e50', borderRadius: 8, fontSize: 12 }

function getWeekDates(startDate: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startDate)
    d.setDate(d.getDate() + i)
    return d
  })
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function getMonday(d: Date): Date {
  const date = new Date(d)
  const day = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1)
  return new Date(date.setDate(diff))
}

type Tab = 'week' | 'stats'

export function Planner() {
  const qc = useQueryClient()
  const settings = useSettings()
  const [tab, setTab] = useState<Tab>('week')
  const [weekStart, setWeekStart] = useState(() => formatDate(getMonday(new Date())))
  const [employee, setEmployee] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [createDate, setCreateDate] = useState('')
  const [form, setForm] = useState({ employee_name: '', title: '', task_date: '', start_time: '', priority: 'Normal', task_group: '', description: '' })
  const [expandedTask, setExpandedTask] = useState<number | null>(null)
  const [newSubtask, setNewSubtask] = useState('')
  const [copyTarget, setCopyTarget] = useState<{ taskId: number; date: string } | null>(null)
  const [statsFrom, setStatsFrom] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10))
  const [statsTo, setStatsTo] = useState(() => formatDate(new Date()))

  const weekDates = getWeekDates(new Date(weekStart))
  const today = formatDate(new Date())

  const { data: tasks = [] } = useQuery({
    queryKey: ['planner-tasks', weekStart, employee],
    queryFn: () => api.get('/v1/admin/planner/tasks', { params: { week_start: weekStart, employee: employee || undefined } }).then(r => r.data),
  })

  const { data: dayNote } = useQuery({
    queryKey: ['planner-day-note', today],
    queryFn: () => api.get('/v1/admin/planner/day-note', { params: { date: today } }).then(r => r.data),
  })

  const { data: stats } = useQuery({
    queryKey: ['planner-stats', statsFrom, statsTo],
    queryFn: () => api.get('/v1/admin/planner/stats', { params: { from: statsFrom, to: statsTo } }).then(r => r.data),
    enabled: tab === 'stats',
  })

  const createMutation = useMutation({
    mutationFn: (body: any) => api.post('/v1/admin/planner/tasks', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['planner-tasks'] }); setShowCreate(false); toast.success('Task added') },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, completed }: any) => api.put(`/v1/admin/planner/tasks/${id}`, { completed: !completed }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['planner-tasks'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/v1/admin/planner/tasks/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['planner-tasks'] }); toast.success('Deleted') },
  })

  const copyMutation = useMutation({
    mutationFn: ({ id, task_date, employee_name }: any) => api.post(`/v1/admin/planner/tasks/${id}/copy`, { task_date, employee_name }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['planner-tasks'] }); setCopyTarget(null); toast.success('Task copied') },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  })

  const addSubtaskMutation = useMutation({
    mutationFn: ({ taskId, title }: any) => api.post(`/v1/admin/planner/tasks/${taskId}/subtasks`, { title }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['planner-tasks'] }); setNewSubtask('') },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  })

  const toggleSubtaskMutation = useMutation({
    mutationFn: (id: number) => api.patch(`/v1/admin/planner/subtasks/${id}/toggle`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['planner-tasks'] }),
  })

  const deleteSubtaskMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/v1/admin/planner/subtasks/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['planner-tasks'] }),
  })

  const upsertNoteMutation = useMutation({
    mutationFn: (body: any) => api.post('/v1/admin/planner/day-note', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['planner-day-note'] }),
  })

  const moveWeek = (dir: number) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + dir * 7)
    setWeekStart(formatDate(d))
  }

  const openCreate = (date: string) => {
    setCreateDate(date)
    setForm(f => ({ ...f, task_date: date }))
    setShowCreate(true)
  }

  const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Planner</h1>
          <p className="text-sm text-gray-500">Week of {weekStart}</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Tabs */}
          <div className="flex rounded-lg border border-dark-border overflow-hidden">
            {([['week', Calendar, 'Week'], ['stats', BarChart2, 'Stats']] as const).map(([t, Icon, label]) => (
              <button key={t} onClick={() => setTab(t)} className={`flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors ${tab === t ? 'bg-primary-500/10 text-primary-400' : 'text-gray-400 hover:text-white'}`}>
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>

          {tab === 'week' && <>
            <select value={employee} onChange={e => setEmployee(e.target.value)} className="bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500">
              <option value="">All Team</option>
              {settings.employees.map(e => <option key={e}>{e}</option>)}
            </select>
            <div className="flex items-center gap-1">
              <button onClick={() => moveWeek(-1)} className="p-2 rounded-lg border border-dark-border text-gray-400 hover:text-white transition-colors"><ChevronLeft size={15} /></button>
              <button onClick={() => setWeekStart(formatDate(getMonday(new Date())))} className="px-3 py-1.5 rounded-lg border border-dark-border text-xs text-gray-400 hover:text-white transition-colors">Today</button>
              <button onClick={() => moveWeek(1)} className="p-2 rounded-lg border border-dark-border text-gray-400 hover:text-white transition-colors"><ChevronRight size={15} /></button>
            </div>
          </>}
        </div>
      </div>

      {tab === 'week' && (
        <>
          {/* Day Note */}
          <div className="bg-dark-surface border border-dark-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <FileText size={14} className="text-primary-400" />
              <span className="text-sm font-medium text-white">Day Note — {today}</span>
            </div>
            <textarea
              defaultValue={dayNote?.note_text ?? ''}
              onBlur={e => upsertNoteMutation.mutate({ note_date: today, note_text: e.target.value })}
              rows={2}
              placeholder="Add notes for today…"
              className="w-full bg-dark-surface2 border border-dark-border rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500 resize-none"
            />
          </div>

          {/* Week Grid */}
          <div className="grid grid-cols-7 gap-2">
            {weekDates.map((date, i) => {
              const dateStr = formatDate(date)
              const dayTasks = tasks.filter((t: any) => (t.task_date ?? '').slice(0, 10) === dateStr)
              const isToday = dateStr === today

              return (
                <div key={dateStr} className={`bg-dark-surface border rounded-xl overflow-hidden min-h-[200px] ${isToday ? 'border-primary-500/50' : 'border-dark-border'}`}>
                  <div className={`px-3 py-2 border-b ${isToday ? 'border-primary-500/30 bg-primary-500/5' : 'border-dark-border bg-dark-surface2'}`}>
                    <div className={`text-xs font-semibold ${isToday ? 'text-primary-400' : 'text-gray-500'}`}>{DAY_NAMES[i]}</div>
                    <div className={`text-sm font-bold ${isToday ? 'text-primary-300' : 'text-white'}`}>{date.getDate()}</div>
                    {dayTasks.length > 0 && <div className="text-xs text-gray-600 mt-0.5">{dayTasks.filter((t: any) => t.completed).length}/{dayTasks.length}</div>}
                  </div>

                  <div className="p-2 space-y-1.5">
                    {dayTasks.map((task: any) => (
                      <div key={task.id} className={`p-2 rounded-lg bg-dark-surface2 border-l-2 ${PRIORITY_COLORS[task.priority] ?? 'border-l-gray-600'} text-xs`}>
                        <div className="flex items-start gap-1.5">
                          <button onClick={() => toggleMutation.mutate({ id: task.id, completed: task.completed })} className="flex-shrink-0 mt-0.5">
                            {task.completed
                              ? <CheckCircle2 size={12} className="text-green-400" />
                              : <Circle size={12} className="text-gray-600" />}
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className={`font-medium leading-tight ${task.completed ? 'line-through text-gray-600' : 'text-white'}`}>{task.title}</div>
                            {task.employee_name && !employee && <div className="text-gray-500 mt-0.5 truncate">{task.employee_name}</div>}
                            {task.start_time && <div className="text-gray-600">{task.start_time.slice(0, 5)}</div>}
                            {task.subtasks?.length > 0 && (
                              <div className="text-gray-600 mt-0.5">{task.subtasks.filter((s: any) => s.is_done).length}/{task.subtasks.length} subtasks</div>
                            )}
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <button onClick={() => setExpandedTask(expandedTask === task.id ? null : task.id)} className="text-gray-600 hover:text-gray-400 p-0.5" title="Details">
                              <Plus size={10} />
                            </button>
                            <button onClick={() => setCopyTarget({ taskId: task.id, date: dateStr })} className="text-gray-600 hover:text-blue-400 p-0.5" title="Copy">
                              <Copy size={10} />
                            </button>
                            <button onClick={() => { if (confirm('Delete?')) deleteMutation.mutate(task.id) }} className="text-gray-600 hover:text-red-400 p-0.5" title="Delete">
                              <Trash2 size={10} />
                            </button>
                          </div>
                        </div>

                        {/* Expanded subtasks */}
                        {expandedTask === task.id && (
                          <div className="mt-2 space-y-1 border-t border-dark-border/50 pt-2">
                            {task.subtasks?.map((sub: any) => (
                              <div key={sub.id} className="flex items-center gap-1.5 group">
                                <button onClick={() => toggleSubtaskMutation.mutate(sub.id)}>
                                  {sub.is_done
                                    ? <CheckCircle2 size={10} className="text-green-400" />
                                    : <Circle size={10} className="text-gray-600" />}
                                </button>
                                <span className={`flex-1 text-xs ${sub.is_done ? 'line-through text-gray-600' : 'text-gray-300'}`}>{sub.title}</span>
                                <button onClick={() => deleteSubtaskMutation.mutate(sub.id)} className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400">
                                  <Trash2 size={9} />
                                </button>
                              </div>
                            ))}
                            <div className="flex gap-1 mt-1">
                              <input
                                value={newSubtask}
                                onChange={e => setNewSubtask(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter' && newSubtask.trim()) { addSubtaskMutation.mutate({ taskId: task.id, title: newSubtask.trim() }); e.preventDefault() } }}
                                placeholder="Add subtask…"
                                className="flex-1 bg-dark-surface border border-dark-border rounded px-2 py-0.5 text-xs text-white placeholder-gray-700 focus:outline-none focus:border-primary-500"
                              />
                              <button onClick={() => newSubtask.trim() && addSubtaskMutation.mutate({ taskId: task.id, title: newSubtask.trim() })} className="text-gray-600 hover:text-white">
                                <Plus size={10} />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}

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

      {tab === 'stats' && (
        <div className="space-y-5">
          <div className="flex gap-3 items-center">
            <div>
              <label className="block text-xs text-gray-400 mb-1">From</label>
              <input type="date" value={statsFrom} onChange={e => setStatsFrom(e.target.value)} className="bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">To</label>
              <input type="date" value={statsTo} onChange={e => setStatsTo(e.target.value)} className="bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500" />
            </div>
          </div>

          {stats && (
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
                <button type="submit" disabled={copyMutation.isPending} className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-dark-bg font-semibold text-sm rounded-lg disabled:opacity-50">
                  {copyMutation.isPending ? 'Copying…' : 'Copy'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Task Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-surface border border-dark-border rounded-2xl w-full max-w-md p-6">
            <h2 className="text-base font-semibold text-white mb-4">Add Task — {createDate}</h2>
            <form onSubmit={e => { e.preventDefault(); createMutation.mutate(form) }} className="space-y-3">
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
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Start Time</label>
                  <input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} className="w-full bg-dark-surface2 border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Group</label>
                  <select value={form.task_group} onChange={e => setForm(f => ({ ...f, task_group: e.target.value }))} className="w-full bg-dark-surface2 border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500">
                    <option value="">— None —</option>
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
                <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
                <button type="submit" disabled={createMutation.isPending} className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-dark-bg font-semibold text-sm rounded-lg disabled:opacity-50">
                  {createMutation.isPending ? 'Saving…' : 'Add Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
