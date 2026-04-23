import { useState, useRef, useEffect, memo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useSettings } from '../lib/crmSettings'
import { useAuthStore } from '../stores/authStore'
import toast from 'react-hot-toast'
import {
  ChevronLeft, ChevronRight, Plus, CheckCircle2, Circle, Trash2,
  BarChart2, Calendar, CalendarDays, CalendarRange, FileText,
  ChevronDown, Edit, ArrowRight, Clock, User, X, Copy,
  ListChecks, AlertCircle, Flag, Tag,
} from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { DesktopOnlyBanner } from '../components/DesktopOnlyBanner'

/* ─── helpers ──────────────────────────────────────────────────────── */
function fmtDate(d: Date): string { return d.toISOString().slice(0, 10) }
function getMonday(d: Date): Date {
  const date = new Date(d); const day = date.getDay()
  date.setDate(date.getDate() - day + (day === 0 ? -6 : 1)); return date
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
function fmtTime(t: string | null) { return t ? t.slice(0, 5) : '' }
function fmtShort(t: string | null) {
  if (!t) return ''
  const [h, m] = t.slice(0, 5).split(':').map(Number)
  const suffix = h >= 12 ? 'pm' : 'am'
  return (h % 12 || 12) + (m ? ':' + String(m).padStart(2, '0') : '') + suffix
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
const PRIORITY_COLOR: Record<string, string> = { Low: '#6b7280', Normal: '#3b82f6', High: '#ef4444' }
const STATUS_COLOR: Record<string, string> = {
  todo: 'bg-gray-500/15 text-gray-400',
  in_progress: 'bg-blue-500/15 text-blue-400',
  blocked: 'bg-red-500/15 text-red-400',
  done: 'bg-green-500/15 text-green-400',
}
const GROUP_COLORS: Record<string, string> = {
  Housekeeping: 'bg-emerald-500/15 text-emerald-400', 'Front Desk': 'bg-blue-500/15 text-blue-400',
  'Front Office': 'bg-blue-500/15 text-blue-400', Maintenance: 'bg-amber-500/15 text-amber-400',
  'F&B': 'bg-purple-500/15 text-purple-400', Management: 'bg-red-500/15 text-red-400',
  Sales: 'bg-cyan-500/15 text-cyan-400', Events: 'bg-pink-500/15 text-pink-400',
}
const STATUS_BORDER: Record<string, string> = {
  todo: 'border-l-gray-600',
  in_progress: 'border-l-blue-500',
  blocked: 'border-l-red-500',
  done: 'border-l-green-500',
}
const TOOLTIP_STYLE = { backgroundColor: '#1a1a2e', border: '1px solid #2e2e50', borderRadius: 8, fontSize: 12 }

const inp = 'w-full bg-dark-surface2 border border-dark-border rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 transition-colors'
const filterSel = 'bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500'

type Tab = 'day' | 'schedule' | 'month' | 'stats'
type TaskForm = {
  employee_name: string; title: string; task_date: string; start_time: string; end_time: string
  priority: string; task_group: string; task_category: string; duration_minutes: string
  description: string; status: string; recurring?: string; recurring_end_date?: string
}
const EMPTY_FORM: TaskForm = {
  employee_name: '', title: '', task_date: '', start_time: '', end_time: '',
  priority: 'Normal', task_group: '', task_category: '', duration_minutes: '',
  description: '', status: 'todo', recurring: 'none', recurring_end_date: '',
}

/* ─── progress bar ──────────────────────────────────────────────── */
const ProgressBar = memo(({ done, total }: { done: number; total: number }) => {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-dark-border rounded-full overflow-hidden">
        <div className="h-full bg-green-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500 min-w-[32px] text-right">{pct}%</span>
    </div>
  )
})

/* ─── subtask row ────────────────────────────────────────────────── */
const SubtaskRow = memo(({ sub, onToggle, onDelete }: { sub: any; onToggle: () => void; onDelete: () => void }) => (
  <div className="flex items-center gap-2.5 group py-1 px-2 rounded-lg hover:bg-dark-surface2/50 transition-colors">
    <button onClick={onToggle} className="flex-shrink-0 p-0.5">
      {sub.is_done
        ? <CheckCircle2 size={18} className="text-green-400" />
        : <Circle size={18} className="text-gray-600 hover:text-gray-400" />}
    </button>
    <span className={'flex-1 text-sm ' + (sub.is_done ? 'line-through text-gray-600' : 'text-gray-300')}>{sub.title}</span>
    <button onClick={onDelete} className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-600 hover:text-red-400 transition-all">
      <Trash2 size={14} />
    </button>
  </div>
))

/* ─── subtask input (standalone to avoid remount) ────────────────── */
function SubtaskInput({ taskId, onAdd }: { taskId: number; onAdd: (taskId: number, title: string) => void }) {
  const [value, setValue] = useState('')
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (value.trim()) { onAdd(taskId, value.trim()); setValue('') }
  }
  return (
    <form className="flex gap-2 mt-2" onSubmit={handleSubmit}>
      <input value={value} onChange={e => setValue(e.target.value)} placeholder="Add a subtask..."
        className="flex-1 bg-dark-surface2 border border-dark-border rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/30" />
      <button type="submit" disabled={!value.trim()} className="px-3 py-2 rounded-lg bg-primary-500/10 text-primary-400 hover:bg-primary-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm font-medium">
        Add
      </button>
    </form>
  )
}

/* ─── task row (day view) — extracted outside to prevent re-mount ── */
const TaskRow = memo(({
  task, isExpanded, onToggleExpand, onToggleComplete, onEdit, onMove, onCopy, onDelete,
  onToggleSubtask, onDeleteSubtask, onAddSubtask, onDragStart, onMarkDone, onMarkBlocked,
}: {
  task: any; isExpanded: boolean
  onToggleExpand: () => void; onToggleComplete: () => void
  onEdit: () => void; onMove: () => void; onCopy: () => void; onDelete: () => void
  onToggleSubtask: (id: number) => void; onDeleteSubtask: (id: number) => void
  onAddSubtask: (taskId: number, title: string) => void
  onDragStart?: (e: React.DragEvent) => void
  onMarkDone: () => void; onMarkBlocked: () => void
}) => {
  const subDone = task.subtasks?.filter((s: any) => s.is_done).length ?? 0
  const subTotal = task.subtasks?.length ?? 0

  return (
    <div draggable onDragStart={onDragStart} className={'rounded-xl border transition-all duration-200 cursor-move ' + (isExpanded ? 'bg-dark-surface border-dark-border shadow-lg' : 'bg-dark-surface2/50 border-transparent hover:border-dark-border/50 hover:bg-dark-surface2')}>
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={onToggleExpand}>
        <button onClick={e => { e.stopPropagation(); onToggleComplete() }} className="flex-shrink-0 p-1 rounded-lg hover:bg-dark-surface2 transition-colors">
          {task.completed
            ? <CheckCircle2 size={22} className="text-green-400" />
            : <Circle size={22} className="text-gray-600 hover:text-gray-400" />}
        </button>
        <div className="w-1 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: PRIORITY_COLOR[task.priority] ?? '#6b7280' }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={'font-medium text-sm ' + (task.completed ? 'line-through text-gray-600' : 'text-white')}>{task.title}</span>
            {task.priority === 'High' && <AlertCircle size={14} className="text-red-400 flex-shrink-0" />}
            {task.status && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_COLOR[task.status] ?? 'bg-gray-500/15 text-gray-400'}`}>{task.status === 'in_progress' ? 'In Prog' : task.status.charAt(0).toUpperCase() + task.status.slice(1)}</span>}
          </div>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            {task.employee_name && <span className="flex items-center gap-1 text-xs text-gray-500"><User size={11} />{task.employee_name}</span>}
            {task.start_time && (
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <Clock size={11} />{fmtTime(task.start_time)}{task.end_time && ` — ${fmtTime(task.end_time)}`}
              </span>
            )}
            {task.task_group && <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${GROUP_COLORS[task.task_group] ?? 'bg-gray-500/15 text-gray-400'}`}>{task.task_group}</span>}
            {task.task_category && <span className="flex items-center gap-1 text-xs text-gray-600"><Tag size={10} />{task.task_category}</span>}
            {task.duration_minutes && <span className="text-xs text-gray-600">{task.duration_minutes}m</span>}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {subTotal > 0 && (
            <span className={'flex items-center gap-1 text-xs px-2 py-1 rounded-lg ' + (subDone === subTotal ? 'bg-green-500/10 text-green-400' : 'bg-dark-surface2 text-gray-500')}>
              <ListChecks size={13} /> {subDone}/{subTotal}
            </span>
          )}
          {!task.completed && task.status !== 'done' && (
            <button onClick={e => { e.stopPropagation(); onMarkDone() }} className="px-1.5 py-1 rounded-lg text-gray-600 hover:text-green-400 hover:bg-green-500/10 transition-colors text-[10px] font-bold" title="Mark Done">
              ✓ Done
            </button>
          )}
          {!task.completed && task.status !== 'blocked' && (
            <button onClick={e => { e.stopPropagation(); onMarkBlocked() }} className="px-1.5 py-1 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-colors text-[10px] font-bold" title="Block Task">
              ⊘ Block
            </button>
          )}
          <button onClick={e => { e.stopPropagation(); onEdit() }} className="p-2 rounded-lg text-gray-600 hover:text-primary-400 hover:bg-dark-surface2 transition-colors" title="Edit">
            <Edit size={16} />
          </button>
          <ChevronDown size={16} className={'text-gray-600 transition-transform duration-200 ' + (isExpanded ? 'rotate-180' : '')} />
        </div>
      </div>

      {isExpanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-dark-border/50 pt-3">
          {task.description && <p className="text-sm text-gray-400 leading-relaxed bg-dark-surface2/50 rounded-lg p-3">{task.description}</p>}
          {task.status && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span className="font-medium">Status:</span>
              <span className="px-2 py-0.5 rounded-full bg-dark-surface2 text-gray-400">{task.status}</span>
            </div>
          )}
          <div>
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Subtasks</h4>
            <div className="space-y-1.5">
              {task.subtasks?.map((sub: any) => (
                <SubtaskRow key={sub.id} sub={sub} onToggle={() => onToggleSubtask(sub.id)} onDelete={() => onDeleteSubtask(sub.id)} />
              ))}
              <SubtaskInput taskId={task.id} onAdd={onAddSubtask} />
            </div>
          </div>
          <div className="flex items-center gap-2 pt-2 border-t border-dark-border/30">
            <button onClick={onMove} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"><ArrowRight size={14} /> Move</button>
            <button onClick={onCopy} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 transition-colors"><Copy size={14} /> Duplicate</button>
            <div className="flex-1" />
            <button onClick={onDelete} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"><Trash2 size={14} /> Delete</button>
          </div>
        </div>
      )}
    </div>
  )
})

/* ─── task templates ───────────────────────────────────────────────── */
const DEFAULT_TEMPLATES: Record<string, Array<{ title: string; group?: string; category?: string; duration?: number }>> = {
  'Guest Services': [
    { title: 'Check-in Guest', group: 'Front Desk', duration: 15 },
    { title: 'Check-out Guest', group: 'Front Desk', duration: 10 },
    { title: 'Room Cleaning', group: 'Housekeeping', duration: 45 },
    { title: 'Mini-bar Restocking', group: 'Housekeeping', duration: 20 },
  ],
  'Maintenance': [
    { title: 'Equipment Check', group: 'Maintenance', duration: 30 },
    { title: 'Facility Inspection', group: 'Maintenance', duration: 60 },
    { title: 'Repair Request', group: 'Maintenance', category: 'Urgent' },
  ],
  'Admin': [
    { title: 'Daily Briefing', group: 'Management', duration: 30 },
    { title: 'Staff Meeting', group: 'Management', duration: 60 },
    { title: 'Report Review', group: 'Management', duration: 45 },
  ],
  'Sales': [
    { title: 'Follow-up Call', group: 'Sales', duration: 15 },
    { title: 'Client Meeting', group: 'Sales', duration: 60 },
    { title: 'Proposal Review', group: 'Sales', duration: 45 },
  ],
}

function getTemplates(): Record<string, Array<{ title: string; group?: string; category?: string; duration?: number }>> {
  try {
    const custom = localStorage.getItem('planner-custom-templates')
    return custom ? JSON.parse(custom) : DEFAULT_TEMPLATES
  } catch {
    return DEFAULT_TEMPLATES
  }
}

function TaskTemplates({ onCreate }: { onCreate: (title: string, date: string, group?: string, category?: string, duration?: number) => void }) {
  const currentDate = fmtDate(new Date())
  const [showTemplates, setShowTemplates] = useState(false)
  const [showAddTemplate, setShowAddTemplate] = useState(false)
  const [showManage, setShowManage] = useState(false)
  const [newTemplate, setNewTemplate] = useState({ category: 'Custom', title: '', group: '', duration: '' })
  const [templates, setTemplates] = useState(getTemplates())

  const addCustomTemplate = () => {
    if (!newTemplate.title.trim()) return
    const updated = { ...templates }
    if (!updated[newTemplate.category]) updated[newTemplate.category] = []
    updated[newTemplate.category].push({
      title: newTemplate.title,
      group: newTemplate.group || undefined,
      duration: newTemplate.duration ? Number(newTemplate.duration) : undefined,
    })
    localStorage.setItem('planner-custom-templates', JSON.stringify(updated))
    setTemplates(updated)
    setNewTemplate({ category: 'Custom', title: '', group: '', duration: '' })
    setShowAddTemplate(false)
  }

  const deleteTemplate = (category: string, index: number) => {
    const updated = { ...templates }
    updated[category] = updated[category].filter((_, i) => i !== index)
    if (updated[category].length === 0) delete updated[category]
    localStorage.setItem('planner-custom-templates', JSON.stringify(updated))
    setTemplates(updated)
  }

  const exportTemplates = () => {
    const data = JSON.stringify(templates, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `task-templates-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const importTemplates = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target?.result as string)
        localStorage.setItem('planner-custom-templates', JSON.stringify(imported))
        setTemplates(imported)
      } catch {
        alert('Invalid JSON file')
      }
    }
    reader.readAsText(file)
  }

  return (
    <div className="space-y-1.5 mb-3">
      {!showTemplates && !showAddTemplate && !showManage ? (
        <div className="flex gap-1.5">
          <button onClick={() => setShowTemplates(true)} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-gray-600 hover:text-gray-400 hover:bg-dark-surface2/50 transition-colors text-xs">
            <Plus size={14} /> Templates
          </button>
          <button onClick={() => setShowManage(true)} className="px-3 py-2 rounded-lg text-gray-600 hover:text-gray-400 hover:bg-dark-surface2/50 transition-colors text-xs font-medium" title="Manage templates">
            ⚙
          </button>
        </div>
      ) : showManage ? (
        <div className="bg-dark-surface2/50 rounded-lg p-2 border border-dark-border/50 space-y-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-400">Manage Templates</span>
            <button onClick={() => setShowManage(false)} className="p-1 rounded text-gray-600 hover:text-white transition-colors">
              <X size={12} />
            </button>
          </div>
          <div className="space-y-1 max-h-[250px] overflow-y-auto mb-2">
            {Object.entries(templates).filter(([cat]) => cat !== 'Guest Services' && cat !== 'Maintenance' && cat !== 'Admin' && cat !== 'Sales').map(([cat, tmps]) => (
              <div key={cat}>
                <div className="text-[9px] font-bold uppercase text-gray-500 px-2 py-1">{cat}</div>
                {tmps.map((t, i) => (
                  <div key={i} className="flex items-center justify-between gap-1 px-2 py-1 text-xs text-gray-400 bg-dark-surface/50 rounded">
                    <span>{t.title}</span>
                    <button onClick={() => deleteTemplate(cat, i)} className="p-0.5 text-red-500 hover:text-red-400 transition-colors">
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="flex gap-1">
            <button onClick={() => { setShowManage(false); setShowAddTemplate(true) }} className="flex-1 text-xs py-1.5 rounded bg-primary-600 text-white font-medium hover:bg-primary-500 transition-colors">
              + Add
            </button>
            <button onClick={exportTemplates} className="flex-1 text-xs py-1.5 rounded bg-blue-600 text-white font-medium hover:bg-blue-500 transition-colors">
              Export
            </button>
            <label className="flex-1">
              <input type="file" accept=".json" onChange={importTemplates} className="hidden" />
              <span className="block text-xs py-1.5 rounded bg-green-600 text-white font-medium hover:bg-green-500 transition-colors text-center cursor-pointer">
                Import
              </span>
            </label>
          </div>
        </div>
      ) : showAddTemplate ? (
        <div className="bg-dark-surface2/50 rounded-lg p-2 border border-dark-border/50 space-y-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-400">New Template</span>
            <button onClick={() => setShowAddTemplate(false)} className="p-1 rounded text-gray-600 hover:text-white transition-colors">
              <X size={12} />
            </button>
          </div>
          <input value={newTemplate.title} onChange={e => setNewTemplate(p => ({ ...p, title: e.target.value }))} placeholder="Task title" className="w-full text-xs bg-dark-surface border border-dark-border rounded px-2 py-1 text-white placeholder-gray-600" />
          <input value={newTemplate.group} onChange={e => setNewTemplate(p => ({ ...p, group: e.target.value }))} placeholder="Task group (e.g. Housekeeping)" className="w-full text-xs bg-dark-surface border border-dark-border rounded px-2 py-1 text-white placeholder-gray-600" />
          <input value={newTemplate.category} onChange={e => setNewTemplate(p => ({ ...p, category: e.target.value }))} placeholder="Category" className="w-full text-xs bg-dark-surface border border-dark-border rounded px-2 py-1 text-white placeholder-gray-600" />
          <input value={newTemplate.duration} onChange={e => setNewTemplate(p => ({ ...p, duration: e.target.value }))} placeholder="Duration (min)" type="number" className="w-full text-xs bg-dark-surface border border-dark-border rounded px-2 py-1 text-white placeholder-gray-600" />
          <button onClick={addCustomTemplate} disabled={!newTemplate.title.trim()} className="w-full text-xs py-1.5 rounded bg-primary-600 text-white font-medium hover:bg-primary-500 disabled:opacity-40 transition-colors">
            Save Template
          </button>
        </div>
      ) : (
        <div className="bg-dark-surface2/50 rounded-lg p-2 border border-dark-border/50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-400">Select Template</span>
            <button onClick={() => setShowTemplates(false)} className="p-1 rounded text-gray-600 hover:text-white transition-colors">
              <X size={12} />
            </button>
          </div>
          <div className="space-y-1 max-h-[300px] overflow-y-auto">
            {Object.entries(templates).map(([cat, tmps]) => (
              <div key={cat}>
                <div className="text-[9px] font-bold uppercase text-gray-600 px-2 py-1 tracking-wider">{cat}</div>
                {tmps.map((t, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      onCreate(t.title, currentDate, t.group, t.category, t.duration)
                      setShowTemplates(false)
                    }}
                    className="w-full text-left text-xs px-3 py-1.5 rounded-md text-gray-300 hover:bg-primary-500/10 hover:text-primary-400 transition-colors flex items-center justify-between">
                    <span>{t.title}</span>
                    {t.duration && <span className="text-[9px] text-gray-600">{t.duration}m</span>}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── quick-add component ────────────────────────────────────────── */
function QuickAdd({ date, onCreate }: { date: string; onCreate: (title: string, date: string, group?: string, category?: string, duration?: number) => void }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => { if (open && ref.current) ref.current.focus() }, [open])

  if (!open) return (
    <button onClick={() => { setOpen(true); setTitle('') }} className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-gray-600 hover:text-gray-400 hover:bg-dark-surface2/50 transition-colors text-xs">
      <Plus size={14} /> Add custom task
    </button>
  )

  return (
    <form className="flex gap-1.5 p-1.5" onSubmit={e => { e.preventDefault(); if (title.trim()) { onCreate(title.trim(), date); setTitle(''); setOpen(false) } }}>
      <input ref={ref} value={title} onChange={e => setTitle(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape') setOpen(false) }}
        placeholder="Task title..."
        className="flex-1 bg-dark-surface2 border border-primary-500/50 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-primary-500/50" />
      <button type="submit" disabled={!title.trim()} className="px-2.5 py-1.5 rounded-lg bg-primary-600 text-white text-xs font-medium disabled:opacity-40 hover:bg-primary-500 transition-colors">Add</button>
      <button type="button" onClick={() => setOpen(false)} className="p-1.5 rounded-lg text-gray-600 hover:text-white transition-colors"><X size={14} /></button>
    </form>
  )
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  MAIN PLANNER COMPONENT                                           */
/* ═══════════════════════════════════════════════════════════════════ */

export function Planner() {
  const qc = useQueryClient()
  const settings = useSettings()
  const { user } = useAuthStore()
  const myName = user?.name ?? ''
  const [tab, setTab] = useState<Tab>('schedule')
  const [currentDate, setCurrentDate] = useState(() => fmtDate(new Date()))
  const [weekStart, setWeekStart] = useState(() => fmtDate(getMonday(new Date())))
  const [monthYear, setMonthYear] = useState(() => ({ year: new Date().getFullYear(), month: new Date().getMonth() }))
  const [employee, setEmployee] = useState('')
  const [groupFilter, setGroupFilter] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editTask, setEditTask] = useState<any>(null)
  const [form, setForm] = useState<TaskForm>({ ...EMPTY_FORM })
  const [expandedTask, setExpandedTask] = useState<number | null>(null)
  const [copyTarget, setCopyTarget] = useState<{ taskId: number; date: string } | null>(null)
  const [moveTarget, setMoveTarget] = useState<{ taskId: number; date: string } | null>(null)
  const [statsFrom, setStatsFrom] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10))
  const [statsTo, setStatsTo] = useState(() => fmtDate(new Date()))
  const [dragOverDate, setDragOverDate] = useState<string | null>(null)
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)

  const today = fmtDate(new Date())

  /* ─── queries ─────────────────────────────────────────────────── */
  const queryParams: any = { employee: employee || undefined, task_group: groupFilter || undefined }
  if (tab === 'day') queryParams.date = currentDate
  else if (tab === 'schedule') queryParams.week_start = weekStart
  else if (tab === 'month') {
    queryParams.from = `${monthYear.year}-${String(monthYear.month + 1).padStart(2, '0')}-01`
    const ld = new Date(monthYear.year, monthYear.month + 1, 0).getDate()
    queryParams.to = `${monthYear.year}-${String(monthYear.month + 1).padStart(2, '0')}-${String(ld).padStart(2, '0')}`
  }

  const { data: tasks = [] } = useQuery({
    queryKey: ['planner-tasks', tab, tab === 'day' ? currentDate : tab === 'schedule' ? weekStart : monthYear, employee, groupFilter],
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
    onSuccess: () => { invalidate(); setShowModal(false); setEditTask(null); setForm({ ...EMPTY_FORM }); toast.success('Task created') },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, ...body }: any) => api.put('/v1/admin/planner/tasks/' + id, body),
    onSuccess: () => { invalidate(); setShowModal(false); setEditTask(null); setForm({ ...EMPTY_FORM }); toast.success('Task updated') },
    onError: (e: any) => {
      if (e.response?.status === 404) {
        toast.error('Task not found – refreshing list')
        invalidate()
      } else {
        toast.error(e.response?.data?.message || 'Error')
      }
    },
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, completed }: any) => api.put('/v1/admin/planner/tasks/' + id, { completed: !completed }),
    onSuccess: () => { invalidate(); toast.success('Updated') },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete('/v1/admin/planner/tasks/' + id),
    onSuccess: () => { invalidate(); setExpandedTask(null); toast.success('Deleted') },
  })

  const copyMutation = useMutation({
    mutationFn: ({ id, task_date, employee_name }: any) => api.post('/v1/admin/planner/tasks/' + id + '/copy', { task_date, employee_name }),
    onSuccess: () => { invalidate(); setCopyTarget(null); toast.success('Duplicated') },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  })

  const moveMutation = useMutation({
    mutationFn: ({ id, task_date, employee_name }: any) => api.patch('/v1/admin/planner/tasks/' + id + '/move', { task_date, employee_name }),
    onSuccess: () => { invalidate(); setMoveTarget(null); toast.success('Moved') },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  })

  const quickCreateMutation = useMutation({
    mutationFn: (body: any) => api.post('/v1/admin/planner/tasks', body),
    onSuccess: () => { invalidate(); toast.success('Task added') },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  })

  const addSubtaskMutation = useMutation({
    mutationFn: ({ taskId, title }: any) => api.post('/v1/admin/planner/tasks/' + taskId + '/subtasks', { title }),
    onSuccess: () => invalidate(),
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

  const completeMutation = useMutation({
    mutationFn: (id: number) => api.patch('/v1/admin/planner/tasks/' + id + '/complete', {}),
    onSuccess: () => { invalidate(); toast.success('Updated') },
    onError: () => { toast.error('Could not update task'); invalidate() },
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      api.patch('/v1/admin/planner/tasks/' + id + '/status', { status }),
    onSuccess: () => { invalidate(); toast.success('Status updated') },
    onError: () => { toast.error('Could not update status'); invalidate() },
  })

  const upsertNoteMutation = useMutation({
    mutationFn: (body: any) => api.post('/v1/admin/planner/day-note', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['planner-day-note'] }),
  })

  /* ─── callbacks (stable refs) ──────────────────────────────────── */
  const handleAddSubtask = useCallback((taskId: number, title: string) => {
    addSubtaskMutation.mutate({ taskId, title })
  }, [])

  /* ─── navigation ──────────────────────────────────────────────── */
  const navigate = (dir: number) => {
    if (tab === 'day') { const d = new Date(currentDate); d.setDate(d.getDate() + dir); setCurrentDate(fmtDate(d)) }
    else if (tab === 'schedule') { const d = new Date(weekStart); d.setDate(d.getDate() + dir * 7); setWeekStart(fmtDate(d)) }
    else { setMonthYear(p => { let m = p.month + dir, y = p.year; if (m < 0) { m = 11; y-- } if (m > 11) { m = 0; y++ } return { year: y, month: m } }) }
  }
  const goToday = () => { const n = new Date(); setCurrentDate(fmtDate(n)); setWeekStart(fmtDate(getMonday(n))); setMonthYear({ year: n.getFullYear(), month: n.getMonth() }) }

  const openCreate = (date: string, emp?: string) => {
    setEditTask(null)
    setShowTemplatePicker(false)
    setForm({ ...EMPTY_FORM, task_date: date, employee_name: emp ?? myName })
    setShowModal(true)
  }

  const applyTemplate = useCallback((t: { title: string; group?: string; category?: string; duration?: number }) => {
    setForm(f => ({
      ...f,
      title: t.title,
      task_group: t.group ?? f.task_group,
      task_category: t.category ?? f.task_category,
      duration_minutes: t.duration ? String(t.duration) : f.duration_minutes,
    }))
    setShowTemplatePicker(false)
  }, [])

  const openEdit = (task: any) => {
    setEditTask(task)
    setShowTemplatePicker(false)
    setForm({
      employee_name: task.employee_name ?? '', title: task.title ?? '',
      task_date: (task.task_date ?? '').slice(0, 10),
      start_time: task.start_time ? task.start_time.slice(0, 5) : '',
      end_time: task.end_time ? task.end_time.slice(0, 5) : '',
      priority: task.priority ?? 'Normal', task_group: task.task_group ?? '',
      task_category: task.task_category ?? '',
      duration_minutes: task.duration_minutes ? String(task.duration_minutes) : '',
      description: task.description ?? '', status: task.status ?? '',
    })
    setShowModal(true)
  }

  const handleSubmit = () => {
    const body: any = { ...form }
    if (!body.start_time) body.start_time = null
    if (!body.end_time) body.end_time = null
    if (!body.duration_minutes) body.duration_minutes = null
    else body.duration_minutes = Number(body.duration_minutes)
    ;['employee_name', 'task_group', 'task_category', 'description'].forEach(k => { if (!body[k]) body[k] = null })
    // For status, ensure it's always a valid value or null
    if (!body.status || !['todo', 'in_progress', 'blocked', 'done'].includes(body.status)) {
      body.status = editTask ? editTask.status : 'todo'
    }

    // Handle recurring tasks
    if (!editTask && body.recurring && body.recurring !== 'none') {
      const startDate = new Date(body.task_date)
      const endDate = body.recurring_end_date ? new Date(body.recurring_end_date) : null
      const increment = body.recurring === 'daily' ? 1 : body.recurring === 'weekly' ? 7 : 30

      let currentDate = new Date(startDate)
      while (!endDate || currentDate <= endDate) {
        const dateStr = fmtDate(currentDate)
        createMutation.mutate({ ...body, task_date: dateStr, recurring: undefined, recurring_end_date: undefined })
        currentDate.setDate(currentDate.getDate() + increment)
        if (endDate && currentDate > endDate) break
        if (currentDate.getTime() - startDate.getTime() > 365 * 24 * 60 * 60 * 1000) break // Max 1 year
      }
    } else {
      if (editTask) updateMutation.mutate({ id: editTask.id, ...body })
      else createMutation.mutate(body)
    }
  }

  const handleQuickCreate = useCallback((title: string, date: string, group?: string, category?: string, duration?: number) => {
    quickCreateMutation.mutate({
      title, task_date: date, priority: 'Normal', employee_name: myName || undefined,
      task_group: group || undefined, task_category: category || undefined, duration_minutes: duration || undefined
    })
  }, [myName])

  /* ─── derived data ────────────────────────────────────────────── */
  const weekDates = weekDatesFrom(new Date(weekStart))
  const monthWeeks = monthGrid(monthYear.year, monthYear.month)

  // Collect unique employees from tasks for the schedule view
  const scheduleEmployees: string[] = (() => {
    const fromTasks = [...new Set(tasks.map((t: any) => t.employee_name).filter(Boolean))]
    const fromSettings = settings.employees ?? []
    const merged = [...new Set([...fromSettings, ...fromTasks])] as string[]
    if (employee) return merged.filter(e => e === employee)
    return merged.length > 0 ? merged : ['Unassigned']
  })()

  const subtitle = tab === 'day'
    ? new Date(currentDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : tab === 'schedule'
    ? `Week ${new Date(weekStart + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} — ${new Date(fmtDate(weekDates[6]) + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    : tab === 'month' ? `${MONTHS[monthYear.month]} ${monthYear.year}` : 'Statistics'

  /* ═══ RENDER ══════════════════════════════════════════════════════ */
  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-5">
      <DesktopOnlyBanner pageKey="planner" message="The planner's week and month views work best on desktop. On mobile, use Day view for the smoothest experience." />

      {/* Header — restructured for mobile:
          Row 1: title + Add button
          Row 2: tab switcher (scrolls horizontally if cramped)
          Row 3 (if not stats): filters + date nav
          On md+ everything packs into the original two-row flex. */}
      <div className="space-y-3 md:space-y-0 md:flex md:items-center md:justify-between md:flex-wrap md:gap-3">
        <div className="flex items-start justify-between md:block gap-3">
          <div className="min-w-0">
            <h1 className="text-lg md:text-xl font-semibold text-white">Work Schedule</h1>
            <p className="text-xs md:text-sm text-gray-500 mt-0.5 truncate">{subtitle}</p>
          </div>
          {/* Mobile-only: Add button next to title to save a row */}
          {tab !== 'stats' && (
            <button
              onClick={() => openCreate(tab === 'day' ? currentDate : today)}
              className="md:hidden flex items-center gap-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-500 px-3 py-2 rounded-lg transition-colors flex-shrink-0"
            >
              <Plus size={16} /> Add
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap md:flex-nowrap">
          {/* Tabs — horizontal scroll on cramped phones */}
          <div className="flex rounded-xl border border-dark-border overflow-x-auto bg-dark-surface w-full sm:w-auto">
            {([
              ['day', CalendarDays, 'Day'],
              ['schedule', Calendar, 'Schedule'],
              ['month', CalendarRange, 'Month'],
              ['stats', BarChart2, 'Stats'],
            ] as const).map(([t, Icon, label]) => (
              <button
                key={t}
                onClick={() => setTab(t as Tab)}
                className={'flex items-center gap-1.5 px-3 md:px-4 py-2 text-xs md:text-sm font-medium transition-all whitespace-nowrap flex-1 sm:flex-initial justify-center ' + (tab === t ? 'bg-primary-500/15 text-primary-400' : 'text-gray-500 hover:text-white hover:bg-dark-surface2')}
              >
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>

          {tab !== 'stats' && <>
            <select value={employee} onChange={e => setEmployee(e.target.value)} className={filterSel + ' flex-1 sm:flex-initial min-w-0'}>
              <option value="">All Team</option>
              {settings.employees.map((e: string) => <option key={e}>{e}</option>)}
            </select>
            <select value={groupFilter} onChange={e => setGroupFilter(e.target.value)} className={filterSel + ' flex-1 sm:flex-initial min-w-0'}>
              <option value="">All Groups</option>
              {settings.planner_groups.map((g: string) => <option key={g}>{g}</option>)}
            </select>
            <div className="flex items-center gap-1">
              <button onClick={() => navigate(-1)} className="p-2 rounded-lg border border-dark-border text-gray-400 hover:text-white hover:bg-dark-surface2 transition-all"><ChevronLeft size={16} /></button>
              <button onClick={goToday} className="px-3 py-2 rounded-lg border border-dark-border text-sm text-gray-400 hover:text-white hover:bg-dark-surface2 transition-all font-medium">Today</button>
              <button onClick={() => navigate(1)} className="p-2 rounded-lg border border-dark-border text-gray-400 hover:text-white hover:bg-dark-surface2 transition-all"><ChevronRight size={16} /></button>
            </div>
            {/* Desktop-only Add (mobile already has one above) */}
            <button
              onClick={() => openCreate(tab === 'day' ? currentDate : today)}
              className="hidden md:flex items-center gap-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-500 px-4 py-2 rounded-lg transition-colors"
            >
              <Plus size={16} /> Add
            </button>
          </>}
        </div>
      </div>

      {/* ═══ DAY VIEW ═══ */}
      {tab === 'day' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-4">
            {/* Summary */}
            <div className="bg-dark-surface border border-dark-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-4">
                  <span className="text-sm font-semibold text-white">{tasks.length} task{tasks.length !== 1 ? 's' : ''}</span>
                  <span className="text-xs text-green-400">{tasks.filter((t: any) => t.completed).length} completed</span>
                  <span className="text-xs text-gray-500">{tasks.filter((t: any) => !t.completed).length} remaining</span>
                </div>
              </div>
              <ProgressBar done={tasks.filter((t: any) => t.completed).length} total={tasks.length} />
            </div>

            {/* Timeline */}
            {tasks.some((t: any) => t.start_time) && (
              <div className="bg-dark-surface border border-dark-border rounded-xl p-4">
                <h3 className="text-sm font-semibold text-white mb-3">Timeline</h3>
                <div className="space-y-2">
                  {[...tasks].filter((t: any) => t.start_time).sort((a: any, b: any) => (a.start_time ?? '').localeCompare(b.start_time ?? '')).map((task: any) => {
                    const duration = task.duration_minutes || 30
                    const width = Math.min((duration / 480) * 100, 100) // 480 = 8 hours
                    return (
                      <div key={task.id} className="flex items-center gap-2">
                        <span className="text-[10px] font-semibold text-gray-500 min-w-[45px]">{fmtTime(task.start_time)}</span>
                        <div className="flex-1 h-6 rounded-md bg-dark-surface2/50 border border-dark-border/50 relative overflow-hidden" title={task.title}>
                          <div className="h-full rounded-md transition-all" style={{
                            width: `${width}%`,
                            backgroundColor: STATUS_COLOR[task.status]?.split(' ')[1] || '#3b82f6',
                            opacity: 0.7,
                          }} />
                          <span className="absolute inset-0 flex items-center px-2 text-[9px] font-semibold text-white truncate pointer-events-none">
                            {task.title}
                          </span>
                        </div>
                        <span className="text-[10px] text-gray-600 min-w-[30px] text-right">{duration}m</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Tasks */}
            <div className={'space-y-2 transition-all rounded-xl p-2 ' + (dragOverDate === currentDate ? 'ring-2 ring-primary-500/40 bg-primary-500/5' : '')}
              onDragEnter={() => setDragOverDate(currentDate)}
              onDragLeave={() => setDragOverDate(null)}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
              onDrop={(e) => {
                e.preventDefault()
                setDragOverDate(null)
                const taskId = e.dataTransfer.getData('taskId')
                const sourceDate = e.dataTransfer.getData('sourceDate')
                if (taskId && sourceDate !== currentDate) {
                  moveMutation.mutate({ id: Number(taskId), task_date: currentDate, employee_name: undefined })
                }
              }}>
              {tasks.length === 0 && (
                <div className="bg-dark-surface border border-dark-border rounded-xl p-12 text-center">
                  <CalendarDays size={40} className="mx-auto text-gray-700 mb-3" />
                  <p className="text-gray-500 text-sm">No tasks for this day</p>
                  <button onClick={() => openCreate(currentDate)} className="mt-3 text-sm text-primary-400 hover:text-primary-300 font-medium">Create your first task</button>
                </div>
              )}
              {[...tasks].sort((a: any, b: any) => {
                if (a.completed !== b.completed) return a.completed ? 1 : -1
                const po: Record<string, number> = { High: 0, Normal: 1, Low: 2 }
                if ((po[a.priority] ?? 1) !== (po[b.priority] ?? 1)) return (po[a.priority] ?? 1) - (po[b.priority] ?? 1)
                return (a.start_time ?? 'zz').localeCompare(b.start_time ?? 'zz')
              }).map((task: any) => (
                <TaskRow key={task.id} task={task}
                  isExpanded={expandedTask === task.id}
                  onToggleExpand={() => setExpandedTask(expandedTask === task.id ? null : task.id)}
                  onToggleComplete={() => toggleMutation.mutate({ id: task.id, completed: task.completed })}
                  onEdit={() => openEdit(task)}
                  onMove={() => setMoveTarget({ taskId: task.id, date: currentDate })}
                  onCopy={() => setCopyTarget({ taskId: task.id, date: currentDate })}
                  onDelete={() => { if (confirm('Delete this task?')) deleteMutation.mutate(task.id) }}
                  onToggleSubtask={(id) => toggleSubtaskMutation.mutate(id)}
                  onDeleteSubtask={(id) => deleteSubtaskMutation.mutate(id)}
                  onAddSubtask={handleAddSubtask}
                  onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('taskId', String(task.id)); e.dataTransfer.setData('sourceDate', currentDate) }}
                  onMarkDone={() => statusMutation.mutate({ id: task.id, status: 'done' })}
                  onMarkBlocked={() => statusMutation.mutate({ id: task.id, status: 'blocked' })}
                />
              ))}
            </div>
            <TaskTemplates onCreate={handleQuickCreate} />
            <QuickAdd date={currentDate} onCreate={handleQuickCreate} />
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <div className="bg-dark-surface border border-dark-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <FileText size={16} className="text-primary-400" />
                <span className="text-sm font-semibold text-white">Day Notes</span>
              </div>
              <textarea key={currentDate} defaultValue={dayNote?.note_text ?? ''}
                onBlur={e => upsertNoteMutation.mutate({ note_date: currentDate, note_text: e.target.value })}
                rows={4} placeholder="Write notes for this day..."
                className="w-full bg-dark-surface2 border border-dark-border rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500 resize-none leading-relaxed" />
            </div>

            <div className="bg-dark-surface border border-dark-border rounded-xl p-4">
              <h3 className="text-sm font-semibold text-white mb-3">Overview</h3>
              <div className="space-y-3">
                {[
                  ['Total', tasks.length, 'text-white'],
                  ['Completed', tasks.filter((t: any) => t.completed).length, 'text-green-400'],
                  ['High Priority', tasks.filter((t: any) => t.priority === 'High' && !t.completed).length, 'text-red-400'],
                  ['With subtasks', tasks.filter((t: any) => t.subtasks?.length > 0).length, 'text-gray-400'],
                ].map(([label, val, cls]) => (
                  <div key={label as string} className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">{label}</span>
                    <span className={'text-sm font-semibold ' + cls}>{val as number}</span>
                  </div>
                ))}
              </div>
            </div>

            {!employee && tasks.length > 0 && (
              <div className="bg-dark-surface border border-dark-border rounded-xl p-4">
                <h3 className="text-sm font-semibold text-white mb-3">Team</h3>
                <div className="space-y-2">
                  {Object.entries(tasks.reduce((acc: any, t: any) => {
                    const n = t.employee_name || 'Unassigned'; if (!acc[n]) acc[n] = { total: 0, done: 0 }
                    acc[n].total++; if (t.completed) acc[n].done++; return acc
                  }, {} as Record<string, { total: number; done: number }>)).map(([name, d]: [string, any]) => (
                    <div key={name}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-gray-400 truncate">{name}</span>
                        <span className="text-[10px] text-gray-600">{d.done}/{d.total}</span>
                      </div>
                      <ProgressBar done={d.done} total={d.total} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ SCHEDULE VIEW (Connecteam-style) ═══ */}
      {tab === 'schedule' && (
        <div className="space-y-4">
          {/* Day Note */}
          <div className="bg-dark-surface border border-dark-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <FileText size={14} className="text-primary-400" />
              <span className="text-sm font-medium text-white">Today's Note</span>
            </div>
            <textarea key={`note-${weekStart}`} defaultValue={dayNote?.note_text ?? ''}
              onBlur={e => upsertNoteMutation.mutate({ note_date: today, note_text: e.target.value })}
              rows={2} placeholder="Add notes for today..."
              className="w-full bg-dark-surface2 border border-dark-border rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500 resize-none" />
          </div>

          {/* Schedule Grid: employee rows × day columns
              Outer overflow-x-auto + min-width on the grid lets the table
              scroll horizontally on mobile instead of cramming all 8 columns
              (employee + 7 days) into ~375px and rendering each cell unusable. */}
          <div className="bg-dark-surface border border-dark-border rounded-xl overflow-x-auto">
            {/* Header row */}
            <div className="grid border-b border-dark-border min-w-[760px]" style={{ gridTemplateColumns: '180px repeat(7, 1fr)' }}>
              <div className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center">
                <User size={14} className="mr-2" /> View by employee
              </div>
              {weekDates.map((date, i) => {
                const dateStr = fmtDate(date)
                const isToday = dateStr === today
                return (
                  <div key={dateStr} className={'px-3 py-3 text-center border-l border-dark-border ' + (isToday ? 'bg-primary-500/5' : '')}>
                    <div className={'text-xs font-semibold ' + (isToday ? 'text-primary-400' : 'text-gray-500')}>{DAYS[i]}</div>
                    <div className={'text-sm font-bold mt-0.5 ' + (isToday ? 'text-primary-300' : 'text-white')}>
                      {isToday ? (
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary-500 text-white">{date.getDate()}</span>
                      ) : (
                        <span>{date.getMonth() + 1}/{date.getDate()}</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Employee rows */}
            {scheduleEmployees.map((emp) => {
              const empTasks = tasks.filter((t: any) => (t.employee_name || 'Unassigned') === emp)
              return (
                <div key={emp} className="grid border-b border-dark-border/50 hover:bg-dark-surface2/20 transition-colors min-w-[760px]" style={{ gridTemplateColumns: '180px repeat(7, 1fr)' }}>
                  {/* Employee name cell */}
                  <div className="px-4 py-3 flex items-center gap-3 border-r border-dark-border/30">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-500/30 to-primary-700/30 flex items-center justify-center text-xs font-bold text-primary-400 flex-shrink-0">
                      {emp.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <span className="text-sm font-medium text-white truncate">{emp}</span>
                  </div>

                  {/* Day cells */}
                  {weekDates.map((date) => {
                    const dateStr = fmtDate(date)
                    const isToday = dateStr === today
                    const cellTasks = empTasks.filter((t: any) => (t.task_date ?? '').slice(0, 10) === dateStr)

                    return (
                      <div key={dateStr} className={'px-2 py-2 border-l border-dark-border/30 min-h-[72px] ' + (isToday ? 'bg-primary-500/5' : '')}>
                        {cellTasks.length === 0 ? (
                          <button onClick={() => openCreate(dateStr, emp)}
                            className="w-full h-full min-h-[56px] rounded-lg border border-dashed border-dark-border/30 hover:border-primary-500/40 flex items-center justify-center text-gray-700 hover:text-gray-500 transition-all group">
                            <Plus size={16} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                          </button>
                        ) : (
                          <div className="space-y-1">
                            {cellTasks.map((task: any) => (
                              <div key={task.id} className="relative group">
                                <button onClick={() => openEdit(task)}
                                  className={'w-full text-left p-2 rounded-lg transition-all hover:ring-1 hover:ring-primary-500/40 border-l-2 ' +
                                    (task.completed ? 'bg-green-500/10 border-green-500 hover:bg-green-500/15' : (STATUS_BORDER[task.status] ?? 'border-gray-600') + ' bg-primary-500/10 hover:bg-primary-500/15')}>
                                  {(task.start_time || task.end_time) && (
                                    <div className={'text-xs font-semibold ' + (task.completed ? 'text-green-400' : 'text-primary-400')}>
                                      {fmtShort(task.start_time)}{task.end_time ? `-${fmtShort(task.end_time)}` : ''}
                                    </div>
                                  )}
                                  <div className={'text-xs mt-0.5 truncate ' + (task.completed ? 'line-through text-gray-600' : 'text-white')}>
                                    {task.title}
                                  </div>
                                  {task.subtasks?.length > 0 && (
                                    <div className="flex items-center gap-1 mt-1">
                                      <ListChecks size={10} className="text-gray-600" />
                                      <span className={'text-[10px] ' + (task.subtasks.every((s: any) => s.is_done) ? 'text-green-400' : 'text-gray-600')}>
                                        {task.subtasks.filter((s: any) => s.is_done).length}/{task.subtasks.length}
                                      </span>
                                    </div>
                                  )}
                                  {task.priority === 'High' && (
                                    <div className="flex items-center gap-1 mt-0.5">
                                      <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                                      <span className="text-[10px] text-red-400">High</span>
                                    </div>
                                  )}
                                </button>
                                <button
                                  onClick={e => { e.stopPropagation(); completeMutation.mutate(task.id) }}
                                  className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 p-0.5 rounded transition-all hover:bg-dark-surface"
                                  title={task.completed ? 'Mark undone' : 'Mark done'}>
                                  {task.completed
                                    ? <CheckCircle2 size={14} className="text-green-400" />
                                    : <Circle size={14} className="text-gray-600 hover:text-green-400" />}
                                </button>
                              </div>
                            ))}
                            <button onClick={() => openCreate(dateStr, emp)}
                              className="w-full flex items-center justify-center py-1 rounded text-gray-700 hover:text-gray-500 transition-colors">
                              <Plus size={12} />
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}

            {/* Add unassigned row */}
            {!employee && (() => {
              const unassigned = tasks.filter((t: any) => !t.employee_name)
              if (unassigned.length === 0 && scheduleEmployees.length > 0) return null
              return (
                <div className="grid border-b border-dark-border/50 min-w-[760px]" style={{ gridTemplateColumns: '180px repeat(7, 1fr)' }}>
                  <div className="px-4 py-3 flex items-center gap-3 border-r border-dark-border/30">
                    <div className="w-8 h-8 rounded-full bg-gray-700/30 flex items-center justify-center text-xs font-bold text-gray-500 flex-shrink-0">?</div>
                    <span className="text-sm font-medium text-gray-500 italic">Unassigned</span>
                  </div>
                  {weekDates.map((date) => {
                    const dateStr = fmtDate(date)
                    const isToday = dateStr === today
                    const cellTasks = unassigned.filter((t: any) => (t.task_date ?? '').slice(0, 10) === dateStr)
                    return (
                      <div key={dateStr} className={'px-2 py-2 border-l border-dark-border/30 min-h-[72px] ' + (isToday ? 'bg-primary-500/5' : '')}>
                        {cellTasks.length === 0 ? (
                          <button onClick={() => openCreate(dateStr)}
                            className="w-full h-full min-h-[56px] rounded-lg border border-dashed border-dark-border/20 hover:border-primary-500/40 flex items-center justify-center text-gray-700 hover:text-gray-500 transition-all group">
                            <Plus size={16} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                          </button>
                        ) : (
                          <div className="space-y-1">
                            {cellTasks.map((task: any) => (
                              <div key={task.id} className="relative group">
                                <button onClick={() => openEdit(task)}
                                  className={'w-full text-left p-2 rounded-lg transition-all hover:ring-1 hover:ring-gray-500/40 border-l-2 ' +
                                    (task.completed ? 'bg-green-500/10 border-green-500 hover:bg-green-500/15' : (STATUS_BORDER[task.status] ?? 'border-gray-600') + ' bg-gray-500/10 hover:bg-gray-500/15')}>
                                  {(task.start_time || task.end_time) && (
                                    <div className={'text-xs font-semibold ' + (task.completed ? 'text-green-400' : 'text-gray-400')}>{fmtShort(task.start_time)}{task.end_time ? `-${fmtShort(task.end_time)}` : ''}</div>
                                  )}
                                  <div className={'text-xs mt-0.5 truncate ' + (task.completed ? 'line-through text-gray-600' : 'text-white')}>{task.title}</div>
                                </button>
                                <button
                                  onClick={e => { e.stopPropagation(); completeMutation.mutate(task.id) }}
                                  className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 p-0.5 rounded transition-all hover:bg-dark-surface"
                                  title={task.completed ? 'Mark undone' : 'Mark done'}>
                                  {task.completed
                                    ? <CheckCircle2 size={14} className="text-green-400" />
                                    : <Circle size={14} className="text-gray-600 hover:text-green-400" />}
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {/* ═══ MONTH VIEW ═══
          Each cell needs ~90px+ to render the date number + status pill +
          three task chips. On mobile (375 / 7 = 53px) the content overflows.
          Wrap in horizontal scroll with min-width so cells stay readable. */}
      {tab === 'month' && (
        <div className="bg-dark-surface border border-dark-border rounded-xl p-3 md:p-5 overflow-x-auto">
          <div className="grid grid-cols-7 gap-1 mb-2 min-w-[700px]">
            {DAYS.map(d => <div key={d} className="text-center text-xs text-gray-500 font-semibold py-2 uppercase tracking-wider">{d}</div>)}
          </div>
          {monthWeeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 gap-1 mb-1 min-w-[700px]">
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
            <div><label className="block text-xs text-gray-400 mb-1">From</label><input type="date" value={statsFrom} onChange={e => setStatsFrom(e.target.value)} className={filterSel} /></div>
            <div><label className="block text-xs text-gray-400 mb-1">To</label><input type="date" value={statsTo} onChange={e => setStatsTo(e.target.value)} className={filterSel} /></div>
          </div>
          {stats && (() => {
            const total = stats.by_employee.reduce((s: number, e: any) => s + e.total, 0)
            const done = stats.by_employee.reduce((s: number, e: any) => s + e.completed, 0)
            const rate = total > 0 ? Math.round((done / total) * 100) : 0
            return (<>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[['Total Tasks', total, 'text-white'], ['Completed', done, 'text-green-400'], ['Pending', total - done, 'text-amber-400'], ['Rate', rate + '%', 'text-primary-400']].map(([l, v, c]) => (
                  <div key={l as string} className="bg-dark-surface border border-dark-border rounded-xl p-5">
                    <p className="text-xs text-gray-500 font-medium">{l}</p>
                    <p className={'text-3xl font-bold mt-2 ' + c}>{v}</p>
                    {l === 'Rate' && <div className="mt-2"><ProgressBar done={done} total={total} /></div>}
                  </div>
                ))}
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
            </>)
          })()}
        </div>
      )}

      {/* ═══ COPY MODAL ═══ */}
      {copyTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setCopyTarget(null)}>
          <div className="bg-dark-surface border border-dark-border rounded-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-white mb-4">Duplicate Task</h2>
            <form onSubmit={e => { e.preventDefault(); const fd = new FormData(e.target as HTMLFormElement); copyMutation.mutate({ id: copyTarget.taskId, task_date: fd.get('task_date'), employee_name: fd.get('employee_name') ?? '' }) }} className="space-y-4">
              <div><label className="block text-xs font-medium text-gray-400 mb-1.5">Target Date</label><input required type="date" name="task_date" defaultValue={copyTarget.date} className={inp} /></div>
              <div><label className="block text-xs font-medium text-gray-400 mb-1.5">Assign To</label>
                <select name="employee_name" className={inp}><option value="">Keep original</option>{settings.employees.map((e: string) => <option key={e}>{e}</option>)}</select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setCopyTarget(null)} className="px-4 py-2.5 text-sm text-gray-400 hover:text-white rounded-lg hover:bg-dark-surface2 transition-colors">Cancel</button>
                <button type="submit" disabled={copyMutation.isPending} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm rounded-lg disabled:opacity-50 transition-colors">{copyMutation.isPending ? 'Duplicating...' : 'Duplicate'}</button>
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
              <div><label className="block text-xs font-medium text-gray-400 mb-1.5">New Date</label><input required type="date" name="task_date" defaultValue={moveTarget.date} className={inp} /></div>
              <div><label className="block text-xs font-medium text-gray-400 mb-1.5">Reassign</label>
                <select name="employee_name" className={inp}><option value="">Keep current</option>{settings.employees.map((e: string) => <option key={e}>{e}</option>)}</select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setMoveTarget(null)} className="px-4 py-2.5 text-sm text-gray-400 hover:text-white rounded-lg hover:bg-dark-surface2 transition-colors">Cancel</button>
                <button type="submit" disabled={moveMutation.isPending} className="px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-semibold text-sm rounded-lg disabled:opacity-50 transition-colors">{moveMutation.isPending ? 'Moving...' : 'Move'}</button>
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
              <h2 className="text-lg font-semibold text-white">{editTask ? 'Edit Task' : 'New Task'}</h2>
              <button onClick={() => { setShowModal(false); setEditTask(null); setForm({ ...EMPTY_FORM }) }} className="p-1 rounded-lg text-gray-500 hover:text-white hover:bg-dark-surface2 transition-colors"><X size={18} /></button>
            </div>
            <form onSubmit={e => { e.preventDefault(); handleSubmit() }} className="space-y-4">
              {!editTask && (
                <div className="mb-3">
                  <button type="button" onClick={() => setShowTemplatePicker(v => !v)}
                    className="flex items-center gap-1.5 text-xs text-primary-400 hover:text-primary-300 transition-colors mb-2">
                    <FileText size={12} />
                    {showTemplatePicker ? 'Hide templates' : 'Use a template'}
                    <ChevronDown size={11} className={'transition-transform ' + (showTemplatePicker ? 'rotate-180' : '')} />
                  </button>
                  {showTemplatePicker && (
                    <div className="border border-dark-border rounded-xl overflow-hidden mb-3 max-h-52 overflow-y-auto">
                      {Object.entries(getTemplates()).map(([cat, items]) => (
                        <div key={cat}>
                          <div className="px-3 py-1.5 bg-dark-surface text-[10px] font-bold text-gray-500 uppercase tracking-wider border-b border-dark-border/50">{cat}</div>
                          <div className="flex flex-wrap gap-1 p-2 bg-dark-surface2/30">
                            {(items as any[]).map((t, i) => (
                              <button type="button" key={i} onClick={() => applyTemplate(t)}
                                className="px-2.5 py-1 rounded-lg bg-dark-surface border border-dark-border text-xs text-gray-300 hover:bg-primary-500/15 hover:border-primary-500/40 hover:text-primary-300 transition-all">
                                {t.title}{t.duration ? <span className="ml-1 text-gray-600 text-[10px]">{t.duration}m</span> : null}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Title *</label>
                <input required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="What needs to be done?" className={inp} autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-gray-400 mb-1.5"><User size={12} /> Assign To</label>
                  <select value={form.employee_name} onChange={e => setForm(f => ({ ...f, employee_name: e.target.value }))} className={inp}>
                    <option value="">Unassigned</option>
                    {myName && <option value={myName}>{myName} (me)</option>}
                    {settings.employees
                      .filter((e: string) => e !== myName)
                      .map((emp: string) => <option key={emp}>{emp}</option>)}
                  </select>
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-gray-400 mb-1.5"><Flag size={12} /> Priority</label>
                  <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} className={inp}>
                    {['Low', 'Normal', 'High'].map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-gray-400 mb-1.5"><Calendar size={12} /> Date</label>
                  <input type="date" value={form.task_date} onChange={e => setForm(f => ({ ...f, task_date: e.target.value }))} className={inp} required />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-gray-400 mb-1.5"><Clock size={12} /> Start</label>
                  <input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} className={inp} />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-gray-400 mb-1.5"><Clock size={12} /> End</label>
                  <input type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} className={inp} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-gray-400 mb-1.5"><Tag size={12} /> Group</label>
                  <select value={form.task_group} onChange={e => setForm(f => ({ ...f, task_group: e.target.value }))} className={inp}>
                    <option value="">None</option>
                    {settings.planner_groups.map((g: string) => <option key={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-400 mb-1.5 block">Category</label>
                  <input value={form.task_category} onChange={e => setForm(f => ({ ...f, task_category: e.target.value }))} placeholder="e.g. Check-in" className={inp} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-400 mb-1.5 block">Duration (min)</label>
                  <input type="number" min="1" value={form.duration_minutes} onChange={e => setForm(f => ({ ...f, duration_minutes: e.target.value }))} placeholder="30" className={inp} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-400 mb-1.5 block">Status</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className={inp}>
                    <option value="todo">To Do</option><option value="in_progress">In Progress</option><option value="blocked">Blocked</option><option value="done">Done</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-400 mb-1.5 block">Repeat</label>
                  <select value={form.recurring || 'none'} onChange={e => setForm(f => ({ ...f, recurring: e.target.value }))} className={inp}>
                    <option value="none">No repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>
                  </select>
                </div>
              </div>
              {(form.recurring && form.recurring !== 'none') && (
                <div>
                  <label className="text-xs font-medium text-gray-400 mb-1.5 block">Repeat Until (optional)</label>
                  <input type="date" value={form.recurring_end_date || ''} onChange={e => setForm(f => ({ ...f, recurring_end_date: e.target.value }))} className={inp} />
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-gray-400 mb-1.5 block">Description</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} placeholder="Add details..." className={inp + ' resize-none'} />
              </div>
              <div className="flex justify-end gap-3 pt-2 border-t border-dark-border/50">
                <button type="button" onClick={() => { setShowModal(false); setEditTask(null); setForm({ ...EMPTY_FORM }) }} className="px-4 py-2.5 text-sm text-gray-400 hover:text-white rounded-lg hover:bg-dark-surface2 transition-colors">Cancel</button>
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
