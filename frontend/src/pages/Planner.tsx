import { useState, useRef, useEffect, useMemo, memo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import { useSettings } from '../lib/crmSettings'
import {
  TASK_GROUP_META as SHARED_TASK_GROUP_META,
  CUSTOM_GROUP_META as SHARED_CUSTOM_GROUP_META,
  parsePlannerGroups, parsePlannerChannels, parseEmployeePrefs, getIcon,
  type GroupMeta,
} from '../lib/plannerMeta'
import { useAuthStore } from '../stores/authStore'
import toast from 'react-hot-toast'
import {
  ChevronLeft, ChevronRight, Plus, CheckCircle2, Circle, Trash2,
  BarChart2, Calendar, CalendarDays, CalendarRange, FileText, LayoutGrid,
  ChevronDown, Edit, ArrowRight, Clock, User, X, Copy,
  ListChecks, AlertCircle, Flag, Tag, Pencil, Repeat, PlayCircle,
  Sparkles,
} from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { DesktopOnlyBanner } from '../components/DesktopOnlyBanner'
import { BacklogStrip } from '../components/BacklogStrip'
import { TeamBucketsView } from '../components/TeamBucketsView'
import { PlannerDaySidebar } from '../components/PlannerDaySidebar'

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

// Icon + hex accent per status. Used by chip badges across views so
// "in progress" / "blocked" tasks are obvious without opening the
// popover. `todo` is the default state and intentionally has no
// badge — clutters the chip when nothing's actually happening.
const STATUS_META: Record<string, { icon: any; color: string; label: string }> = {
  in_progress: { icon: PlayCircle,   color: '#3b82f6', label: 'In progress' },
  blocked:     { icon: AlertCircle,  color: '#ef4444', label: 'Blocked' },
  done:        { icon: CheckCircle2, color: '#22c55e', label: 'Done' },
}

/**
 * Icon + accent color per task group. Drives the icon-grid "Type"
 * picker at the top of the New/Edit Task drawer. Falls back to the
 * Custom tile for any group not listed here, so non-hotel orgs that
 * defined their own groups still get a usable picker.
 */
// Built-in group meta — proxied from the shared module so the
// settings UI and the live planner pull from the same map.
const TASK_GROUP_META = SHARED_TASK_GROUP_META
const CUSTOM_GROUP_META: GroupMeta = SHARED_CUSTOM_GROUP_META

/**
 * Module-mutable map of admin-customised group icon/color overrides,
 * synced from settings on every Planner render. All 18 chip-render
 * sites resolve through `getGroupMeta()` so a custom icon set in
 * Settings → Planner shows up everywhere without having to thread a
 * prop through every sub-component. Reset on logout / org switch
 * (the settings query refetches and overwrites the map).
 */
let _customGroupMeta: Record<string, GroupMeta> = {}
function getGroupMeta(group: string | null | undefined): GroupMeta {
  if (!group) return CUSTOM_GROUP_META
  return _customGroupMeta[group] ?? TASK_GROUP_META[group] ?? CUSTOM_GROUP_META
}

/**
 * Half-hour time slots from 07:00 to 21:00 (work-day window). Drives
 * the start-time picker in the new-task drawer. Labels show 24-hour
 * HH:MM directly — matches the planner's timeline + how hotel staff
 * read shift rosters in practice.
 */
const TIME_SLOTS: string[] = (() => {
  const out: string[] = []
  for (let h = 7; h <= 21; h++) {
    out.push(String(h).padStart(2, '0') + ':00')
    if (h < 21) out.push(String(h).padStart(2, '0') + ':30')
  }
  return out
})()

/**
 * Duration quick-picks. Backend stores `duration_minutes` as int;
 * picking a chip just sets the form value to the integer. Custom
 * durations still work via the underlying free-form fallback.
 */
const DURATION_CHIPS: Array<{ minutes: number; label: string }> = [
  { minutes: 15,  label: '15m' },
  { minutes: 30,  label: '30m' },
  { minutes: 45,  label: '45m' },
  { minutes: 60,  label: '1h' },
  { minutes: 90,  label: '1.5h' },
  { minutes: 120, label: '2h' },
  { minutes: 240, label: '4h' },
]

/**
 * Computes `end_time = start_time + duration_minutes`. Returns
 * empty string if either input is missing. We use this to auto-fill
 * the end_time so users picking a 30-min slot + a 45-min duration
 * don't need to mentally compute "ends at 11:15".
 */
function addMinutes(timeHHMM: string, minutes: number): string {
  if (!timeHHMM || !minutes) return ''
  const [h, m] = timeHHMM.split(':').map(Number)
  const total = h * 60 + m + minutes
  if (total >= 24 * 60) return ''
  return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0')
}
const TOOLTIP_STYLE = { backgroundColor: '#1a1a2e', border: '1px solid #2e2e50', borderRadius: 8, fontSize: 12 }

const inp = 'w-full bg-dark-surface2 border border-dark-border rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 transition-colors'
const filterSel = 'bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500'

type Tab = 'day' | 'schedule' | 'month' | 'team' | 'stats'
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
  const groupMeta = getGroupMeta(task.task_group)
  const GroupIcon = groupMeta.icon

  return (
    <div draggable onDragStart={onDragStart}
      style={!isExpanded && !task.completed ? { borderLeftColor: groupMeta.color, borderLeftWidth: 3 } : {}}
      className={'rounded-xl border transition-all duration-200 cursor-move ' + (isExpanded ? 'bg-dark-surface border-dark-border shadow-lg' : 'bg-dark-surface2/50 border-transparent hover:border-dark-border/50 hover:bg-dark-surface2')}>
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={onToggleExpand}>
        <button onClick={e => { e.stopPropagation(); onToggleComplete() }} className="flex-shrink-0 p-1 rounded-lg hover:bg-dark-surface2 transition-colors">
          {task.completed
            ? <CheckCircle2 size={22} className="text-green-400" />
            : <Circle size={22} className="text-gray-600 hover:text-gray-400" />}
        </button>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: groupMeta.color + '20', color: groupMeta.color }}>
          <GroupIcon size={15} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={'font-medium text-sm ' + (task.completed ? 'line-through text-gray-600' : 'text-white')}>{task.title}</span>
            {task.priority === 'High' && <AlertCircle size={14} className="text-red-400 flex-shrink-0" />}
            {task.status && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_COLOR[task.status] ?? 'bg-gray-500/15 text-gray-400'}`}>{task.status === 'in_progress' ? 'In Prog' : task.status.charAt(0).toUpperCase() + task.status.slice(1)}</span>}
            {(task.recurring || task.recurring_parent_id) && (
              <span
                className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-300"
                title={task.recurring ? `Recurring (${task.recurring})` : 'Part of a recurring series'}
              >
                <Repeat size={9} />
                {task.recurring ? task.recurring : 'in series'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            {task.employee_name && <span className="flex items-center gap-1 text-xs text-gray-500"><User size={11} />{task.employee_name}</span>}
            {task.start_time && (
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <Clock size={11} />{fmtTime(task.start_time)}{task.end_time && ` — ${fmtTime(task.end_time)}`}
              </span>
            )}
            {task.task_group && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                style={{ backgroundColor: groupMeta.color + '20', color: groupMeta.color }}>
                {task.task_group}
              </span>
            )}
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

/* ─── task templates (Planner v2 — server-side, org-wide) ─────────── */

interface ServerTemplate {
  id: number
  name: string
  title: string
  category: string
  task_group: string | null
  task_category: string | null
  priority: string
  duration_minutes: number | null
  description: string | null
  sort_order: number
}

/**
 * Suggested starter templates the admin can one-click seed if their
 * org has none yet. Hand-curated for hospitality but generic enough
 * to be useful for service businesses too.
 */
const SUGGESTED_TEMPLATES: Array<Omit<ServerTemplate, 'id' | 'sort_order'>> = [
  { name: 'Check-in guest',      title: 'Check-in guest',       category: 'Front Office',  task_group: 'Front Desk',   task_category: null, priority: 'Medium', duration_minutes: 15, description: null },
  { name: 'Check-out guest',     title: 'Check-out guest',      category: 'Front Office',  task_group: 'Front Desk',   task_category: null, priority: 'Medium', duration_minutes: 10, description: null },
  { name: 'Room cleaning',       title: 'Room cleaning',        category: 'Housekeeping',  task_group: 'Housekeeping', task_category: null, priority: 'Medium', duration_minutes: 45, description: null },
  { name: 'Mini-bar restock',    title: 'Mini-bar restocking',  category: 'Housekeeping',  task_group: 'Housekeeping', task_category: null, priority: 'Low',    duration_minutes: 20, description: null },
  { name: 'Equipment check',     title: 'Equipment check',      category: 'Maintenance',   task_group: 'Maintenance',  task_category: null, priority: 'Medium', duration_minutes: 30, description: null },
  { name: 'Facility inspection', title: 'Facility inspection',  category: 'Maintenance',   task_group: 'Maintenance',  task_category: null, priority: 'Medium', duration_minutes: 60, description: null },
  { name: 'Daily briefing',      title: 'Daily briefing',       category: 'Management',    task_group: 'Management',   task_category: null, priority: 'High',   duration_minutes: 30, description: null },
  { name: 'Staff meeting',       title: 'Staff meeting',        category: 'Management',    task_group: 'Management',   task_category: null, priority: 'Medium', duration_minutes: 60, description: null },
  { name: 'Follow-up call',      title: 'Follow-up call',       category: 'Sales',         task_group: 'Sales',        task_category: null, priority: 'Medium', duration_minutes: 15, description: null },
  { name: 'Client meeting',      title: 'Client meeting',       category: 'Sales',         task_group: 'Sales',        task_category: null, priority: 'High',   duration_minutes: 60, description: null },
]

function TaskTemplates({ onCreate }: { onCreate: (title: string, date: string, group?: string, category?: string, duration?: number) => void }) {
  const qc = useQueryClient()
  const currentDate = fmtDate(new Date())
  const [mode, setMode] = useState<'closed' | 'pick' | 'add' | 'manage'>('closed')
  const [editing, setEditing] = useState<ServerTemplate | null>(null)

  const { data: templates = [], isLoading } = useQuery<ServerTemplate[]>({
    queryKey: ['planner-templates'],
    queryFn: () => api.get('/v1/admin/planner/templates').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  })

  const grouped = templates.reduce<Record<string, ServerTemplate[]>>((acc, t) => {
    const cat = t.category || 'General'
    ;(acc[cat] ||= []).push(t)
    return acc
  }, {})

  const createMut = useMutation({
    mutationFn: (body: Partial<ServerTemplate>) => api.post('/v1/admin/planner/templates', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['planner-templates'] }); toast.success('Template added') },
    onError: () => toast.error('Save failed'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, ...body }: Partial<ServerTemplate> & { id: number }) =>
      api.put('/v1/admin/planner/templates/' + id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['planner-templates'] }); toast.success('Template updated'); setEditing(null) },
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete('/v1/admin/planner/templates/' + id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['planner-templates'] }); toast.success('Template deleted') },
  })

  // First-run seeding — saves the admin from typing 10 templates by
  // hand. Idempotent: only runs when the list is empty + the user
  // clicks the suggestion. Server-side dedup isn't enforced (admins
  // can create dupes), so we only offer this when there are none.
  const seedSuggested = async () => {
    for (const tpl of SUGGESTED_TEMPLATES) {
      // eslint-disable-next-line no-await-in-loop
      await api.post('/v1/admin/planner/templates', tpl)
    }
    qc.invalidateQueries({ queryKey: ['planner-templates'] })
    toast.success(`${SUGGESTED_TEMPLATES.length} starter templates added`)
  }

  return (
    <div className="space-y-1.5 mb-3">
      {mode === 'closed' && (
        // Brighter than the previous gray-600-on-empty look — the
        // buttons were nearly invisible against the dark surface,
        // making the "Templates" entry point feel hidden. Now reads
        // as a real action row.
        <div className="flex gap-1.5">
          <button
            onClick={() => setMode('pick')}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium text-gray-400 hover:text-white bg-white/[0.02] hover:bg-white/[0.06] border border-white/5 hover:border-white/15 transition-colors"
          >
            <FileText size={13} /> Templates {templates.length > 0 && <span className="text-[10px] text-gray-500 tabular-nums">({templates.length})</span>}
          </button>
          <button
            onClick={() => setMode('manage')}
            className="px-3 py-2 rounded-lg text-gray-500 hover:text-white bg-white/[0.02] hover:bg-white/[0.06] border border-white/5 hover:border-white/15 transition-colors text-xs"
            title="Manage templates"
          >
            ⚙
          </button>
        </div>
      )}

      {mode === 'pick' && (
        // Card-grid layout instead of a plain stacked list. Each
        // category header carries its group color (TASK_GROUP_META)
        // so a glance separates Housekeeping from F&B from Maintenance
        // without reading the labels. Templates render as 2-column
        // cards on wider screens with name + duration + group dot.
        <div className="bg-dark-surface border border-dark-border rounded-xl p-3">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-white">Pick a template</span>
            <button onClick={() => setMode('closed')} className="w-6 h-6 rounded hover:bg-white/5 text-gray-400 flex items-center justify-center">
              <X size={12} />
            </button>
          </div>
          {isLoading ? (
            <p className="text-xs text-gray-600 text-center py-4">Loading…</p>
          ) : templates.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-xs text-gray-500 mb-2">No templates yet — start with our suggestions:</p>
              <button onClick={seedSuggested} className="text-xs py-1.5 px-3 rounded bg-primary-600 text-white font-medium hover:bg-primary-500">
                + Seed {SUGGESTED_TEMPLATES.length} starter templates
              </button>
            </div>
          ) : (
            <div className="space-y-3 max-h-[420px] overflow-y-auto">
              {Object.entries(grouped).map(([cat, tmps]) => {
                const groupMeta = getGroupMeta(tmps[0]?.task_group)
                const accent = groupMeta.color
                return (
                  <div key={cat}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: accent }} />
                      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: accent }}>{cat}</span>
                      <span className="text-[10px] text-gray-600 tabular-nums">{tmps.length}</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                      {tmps.map(t => (
                        <button
                          key={t.id}
                          onClick={() => {
                            onCreate(t.title, currentDate, t.task_group ?? undefined, t.task_category ?? undefined, t.duration_minutes ?? undefined)
                            setMode('closed')
                          }}
                          className="w-full text-left bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 hover:border-white/15 rounded-lg px-3 py-2 transition-colors flex items-center justify-between gap-2 group"
                        >
                          <span className="text-xs font-medium text-gray-200 group-hover:text-white truncate">{t.name}</span>
                          {t.duration_minutes && (
                            <span className="text-[10px] text-gray-500 tabular-nums flex-shrink-0">{t.duration_minutes}m</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {mode === 'manage' && (
        <div className="bg-dark-surface2/50 rounded-lg p-2 border border-dark-border/50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-400">Manage templates</span>
            <button onClick={() => { setMode('closed'); setEditing(null) }} className="p-1 rounded text-gray-600 hover:text-white">
              <X size={12} />
            </button>
          </div>
          <div className="space-y-1 max-h-[280px] overflow-y-auto mb-2">
            {templates.length === 0 ? (
              <p className="text-xs text-gray-600 italic text-center py-4">
                No templates yet. Click + Add below to create your first one.
              </p>
            ) : (
              Object.entries(grouped).map(([cat, tmps]) => (
                <div key={cat}>
                  <div className="text-[9px] font-bold uppercase text-gray-500 px-2 py-1">{cat}</div>
                  {tmps.map(t => (
                    <div key={t.id} className="flex items-center justify-between gap-1 px-2 py-1 text-xs text-gray-400 bg-dark-surface/50 rounded group">
                      <div className="min-w-0 flex-1 truncate">
                        <span>{t.name}</span>
                        {t.duration_minutes && <span className="text-[9px] text-gray-600 ml-2">{t.duration_minutes}m</span>}
                      </div>
                      <button
                        onClick={() => setEditing(t)}
                        className="p-0.5 text-gray-500 hover:text-primary-400 opacity-0 group-hover:opacity-100"
                        title="Edit"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Delete template "${t.name}"?`)) deleteMut.mutate(t.id)
                        }}
                        className="p-0.5 text-red-500 hover:text-red-400 opacity-0 group-hover:opacity-100"
                        title="Delete"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
          <button
            onClick={() => setMode('add')}
            className="w-full text-xs py-1.5 rounded bg-primary-600 text-white font-medium hover:bg-primary-500"
          >
            + Add new template
          </button>
        </div>
      )}

      {(mode === 'add' || editing) && (
        <TemplateForm
          initial={editing}
          onCancel={() => { setMode('manage'); setEditing(null) }}
          onSave={(data) => {
            if (editing) updateMut.mutate({ id: editing.id, ...data })
            else createMut.mutate(data)
            setMode('manage')
          }}
          busy={createMut.isPending || updateMut.isPending}
        />
      )}
    </div>
  )
}

function TemplateForm({ initial, onCancel, onSave, busy }: {
  initial: ServerTemplate | null
  onCancel: () => void
  onSave: (body: Partial<ServerTemplate>) => void
  busy: boolean
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [title, setTitle] = useState(initial?.title ?? '')
  const [category, setCategory] = useState(initial?.category ?? 'General')
  const [taskGroup, setTaskGroup] = useState(initial?.task_group ?? '')
  const [priority, setPriority] = useState(initial?.priority ?? 'Medium')
  const [duration, setDuration] = useState(initial?.duration_minutes ? String(initial.duration_minutes) : '')
  const [description, setDescription] = useState(initial?.description ?? '')

  return (
    <div className="bg-dark-surface2/50 rounded-lg p-2 border border-dark-border/50 space-y-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-gray-400">{initial ? 'Edit template' : 'New template'}</span>
        <button onClick={onCancel} className="p-1 rounded text-gray-600 hover:text-white">
          <X size={12} />
        </button>
      </div>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Template name (e.g. Morning briefing)" className="w-full text-xs bg-dark-surface border border-dark-border rounded px-2 py-1 text-white placeholder-gray-600" />
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Task title (what shows on the task)" className="w-full text-xs bg-dark-surface border border-dark-border rounded px-2 py-1 text-white placeholder-gray-600" />
      <div className="grid grid-cols-2 gap-1.5">
        <input value={category} onChange={e => setCategory(e.target.value)} placeholder="Category" className="text-xs bg-dark-surface border border-dark-border rounded px-2 py-1 text-white placeholder-gray-600" />
        <input value={taskGroup} onChange={e => setTaskGroup(e.target.value)} placeholder="Group" className="text-xs bg-dark-surface border border-dark-border rounded px-2 py-1 text-white placeholder-gray-600" />
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <select value={priority} onChange={e => setPriority(e.target.value)} className="text-xs bg-dark-surface border border-dark-border rounded px-2 py-1 text-white">
          <option>Low</option><option>Medium</option><option>High</option><option>Urgent</option>
        </select>
        <input value={duration} onChange={e => setDuration(e.target.value)} placeholder="Duration (min)" type="number" className="text-xs bg-dark-surface border border-dark-border rounded px-2 py-1 text-white placeholder-gray-600" />
      </div>
      <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Description (optional)" rows={2} className="w-full text-xs bg-dark-surface border border-dark-border rounded px-2 py-1 text-white placeholder-gray-600 resize-none" />
      <button
        onClick={() => {
          if (!name.trim() || !title.trim()) return
          onSave({
            name: name.trim(), title: title.trim(),
            category: category.trim() || 'General',
            task_group: taskGroup.trim() || null,
            priority,
            duration_minutes: duration ? Number(duration) : null,
            description: description.trim() || null,
          })
        }}
        disabled={busy || !name.trim() || !title.trim()}
        className="w-full text-xs py-1.5 rounded bg-primary-600 text-white font-medium hover:bg-primary-500 disabled:opacity-40"
      >
        {busy ? 'Saving…' : initial ? 'Update' : 'Save template'}
      </button>
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
    <button onClick={() => { setOpen(true); setTitle('') }}
      className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium text-gray-400 hover:text-white bg-white/[0.02] hover:bg-white/[0.06] border border-white/5 hover:border-white/15 transition-colors">
      <Plus size={13} /> Add custom task
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

/**
 * Horizontally scrollable icon-tab bar for filtering planner tasks
 * by group. Replaces the old `<select>` dropdown — staff scan the
 * row of icons + counts much faster than they parse a closed dropdown.
 *
 * Renders an "All" tab + one tab per configured planner_group. Each
 * tab shows the group icon, label, and a live count of tasks in the
 * current scope (the parent already filters tasks by date / employee
 * for the active view). Active tab fills with the group's accent
 * color so the rest of the page picks up the visual cue.
 *
 * `tasks` is the unfiltered slice for the current scope — we count
 * locally so the badge counts are correct even before the server
 * round-trip lands.
 */
function GroupFilterTabs({ groups, value, onChange, tasks }: {
  groups: string[]
  value: string
  onChange: (g: string) => void
  tasks: any[]
}) {
  const countFor = (g: string) => g === '' ? tasks.length : tasks.filter((t: any) => (t.task_group || '') === g).length
  // Cleaner pill design — drop the surrounding container chrome, drop
  // the icons (they were visually noisy when there are 6-8 groups), and
  // render label + inline count instead of a separate count badge. Looks
  // closer to Notion / Linear / Asana filter rows where the labels are
  // the data and the active pill carries one accent fill.
  const allTab = { key: '', label: 'All', color: '#fbbf24' /* gold — matches app accent */ }
  const tabs = [allTab, ...groups.map(g => {
    const meta = getGroupMeta(g)
    return { key: g, label: g, color: meta.color }
  })]
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 -mb-1">
      {tabs.map(tab => {
        const active = value === tab.key
        const n = countFor(tab.key)
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className={[
              'flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all border',
              active
                ? 'bg-primary-500 text-black border-primary-500 shadow-[0_2px_8px_rgba(201,168,76,0.3)]'
                : 'bg-dark-surface text-gray-300 border-dark-border hover:bg-dark-surface2 hover:border-white/15 hover:text-white',
            ].join(' ')}
          >
            <span>{tab.label}</span>
            {n > 0 && (
              <span className={[
                'text-[10px] tabular-nums font-bold',
                active ? 'text-black/70' : 'text-gray-500',
              ].join(' ')}>
                {n}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Tiny inline input used inside Schedule + Month cells. Replaces the
 * old "click empty cell → open big modal" flow for the common case of
 * "I just want to jot a one-line task on this day for this person".
 * Submit on Enter; Escape or empty-blur cancels.
 */
function InlineQuickAdd({ onSubmit, onCancel, autoFocus = true }: {
  onSubmit: (title: string) => void
  onCancel: () => void
  autoFocus?: boolean
}) {
  const [title, setTitle] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (autoFocus && ref.current) ref.current.focus() }, [autoFocus])
  return (
    <form onSubmit={e => { e.preventDefault(); if (title.trim()) onSubmit(title.trim()) }}
          onClick={e => e.stopPropagation()}>
      <input
        ref={ref}
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); onCancel() } }}
        onBlur={() => { if (!title.trim()) onCancel() }}
        placeholder="Task title…"
        className="w-full bg-dark-surface border border-primary-500/60 rounded px-1.5 py-1 text-[11px] text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-primary-500/40"
      />
    </form>
  )
}

/**
 * Lightweight floating popover anchored to a clicked task chip in
 * Schedule / Month views. Bypasses the big edit modal for the four
 * actions that account for ~90% of edits: rename, change priority,
 * toggle complete, jump to full edit, delete. Click outside or Escape
 * to dismiss.
 *
 * `anchor` is the DOMRect of the clicked element — we use it to
 * fixed-position the popover just below the task chip. Falls back to
 * viewport-bottom if the popover would clip off the screen.
 */
/**
 * Compact, click-to-expand "Today's Note" block. Default rendering is a
 * single low-attention row that shows the existing note text or a tiny
 * "+ Add note" link — recovers ~80px of vertical real estate that the
 * always-expanded version was eating, especially on weeks where no note
 * was set. Click the row → full textarea modal-ish inline editor with
 * Save/Cancel. Save fires `onSave` and collapses back.
 */
function CollapsibleNote({ value, weekStart, placeholder, label, onSave }: {
  value: string
  weekStart: string
  placeholder: string
  label: string
  onSave: (text: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  // Reset draft when the week changes or upstream value updates while
  // collapsed. Avoids stale draft text after switching weeks.
  useEffect(() => { if (!editing) setDraft(value) }, [value, weekStart, editing])

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="w-full flex items-center gap-2.5 px-3 py-2 bg-dark-surface border border-dark-border rounded-lg hover:bg-dark-surface2 hover:border-primary-500/30 transition text-left"
      >
        <FileText size={13} className={value ? 'text-primary-400' : 'text-gray-600'} />
        <span className="text-[11px] uppercase tracking-wide font-semibold text-gray-500">{label}</span>
        <span className={'text-xs truncate flex-1 ' + (value ? 'text-gray-300' : 'text-gray-600 italic')}>
          {value || placeholder}
        </span>
        <span className="text-[10px] text-gray-600 flex-shrink-0">click to edit</span>
      </button>
    )
  }

  return (
    <div className="bg-dark-surface border border-primary-500/40 rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-2">
        <FileText size={13} className="text-primary-400" />
        <span className="text-[11px] uppercase tracking-wide font-semibold text-gray-400">{label}</span>
      </div>
      <textarea
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={3}
        placeholder={placeholder}
        className="w-full bg-dark-surface2 border border-dark-border rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500 resize-none"
      />
      <div className="flex gap-2 justify-end">
        <button
          onClick={() => { setDraft(value); setEditing(false) }}
          className="px-3 py-1.5 text-xs text-gray-400 hover:text-white"
        >
          Cancel
        </button>
        <button
          onClick={() => { onSave(draft); setEditing(false) }}
          className="px-3 py-1.5 bg-primary-500 hover:bg-primary-400 text-black text-xs font-bold rounded-md"
        >
          Save note
        </button>
      </div>
    </div>
  )
}

function TaskPopover({ task, anchor, onClose, onRename, onTogglePriority, onComplete, onFullEdit, onDelete, onDuplicate, onReschedule }: {
  task: any
  anchor: DOMRect
  onClose: () => void
  onRename: (title: string) => void
  onTogglePriority: (priority: string) => void
  onComplete: () => void
  onFullEdit: () => void
  onDelete: () => void
  onDuplicate: (toDate: string) => void
  onReschedule: (toDate: string) => void
}) {
  const [title, setTitle] = useState(task.title || '')
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    document.addEventListener('keydown', onKey)
    setTimeout(() => document.addEventListener('mousedown', onClick), 0)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onClick) }
  }, [onClose])

  /**
   * Position below the chip unless that pushes the popover below the
   * viewport — then flip above. Same horizontal anchor with viewport
   * clamping to keep it visible on small screens.
   */
  const popHeight = 320
  const popWidth = 300
  const top = anchor.bottom + popHeight > window.innerHeight ? Math.max(8, anchor.top - popHeight - 4) : anchor.bottom + 4
  const left = Math.min(window.innerWidth - popWidth - 8, Math.max(8, anchor.left))

  const cyclePriority = () => {
    const order = ['Low', 'Normal', 'High']
    const idx = order.indexOf(task.priority || 'Normal')
    onTogglePriority(order[(idx + 1) % order.length])
  }

  // Quick reschedule shortcuts — compute the dates fresh on each
  // render so a popover left open across midnight still produces
  // the right offsets.
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const tomorrowStr = (() => { const d = new Date(today); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10) })()
  const nextWeekStr = (() => { const d = new Date(today); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10) })()
  const todayStr = today.toISOString().slice(0, 10)

  return (
    <div
      ref={ref}
      onClick={e => e.stopPropagation()}
      style={{ position: 'fixed', top, left, width: popWidth, zIndex: 60 }}
      className="bg-dark-surface border border-dark-border rounded-xl shadow-2xl p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          onBlur={() => { if (title.trim() && title.trim() !== task.title) onRename(title.trim()) }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.currentTarget as HTMLInputElement).blur() } }}
          className="flex-1 bg-transparent border-b border-dark-border focus:border-primary-500 px-1 py-0.5 text-sm font-medium text-white focus:outline-none"
        />
        <button onClick={onClose} className="p-1 rounded text-gray-600 hover:text-white"><X size={14} /></button>
      </div>

      <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
        {task.start_time && <span>{fmtShort(task.start_time)}{task.end_time ? `–${fmtShort(task.end_time)}` : ''}</span>}
        {task.employee_name && <span className="truncate">· {task.employee_name}</span>}
      </div>

      {/* Primary actions: complete + priority */}
      <div className="grid grid-cols-2 gap-1.5">
        <button onClick={onComplete}
          className={'flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ' +
            (task.completed ? 'bg-green-500/15 text-green-400 hover:bg-green-500/25' : 'bg-dark-surface2 text-white hover:bg-primary-500/20')}>
          {task.completed ? <CheckCircle2 size={13} /> : <Circle size={13} />}
          {task.completed ? 'Done' : 'Mark done'}
        </button>
        <button onClick={cyclePriority}
          className="flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium bg-dark-surface2 text-white hover:bg-primary-500/20 transition-colors">
          <Flag size={13} style={{ color: PRIORITY_COLOR[task.priority] ?? '#6b7280' }} />
          {task.priority || 'Normal'}
        </button>
      </div>

      {/* Reschedule quick chips */}
      <div>
        <div className="text-[9px] uppercase tracking-wider font-bold text-gray-500 px-1 mb-1">Reschedule</div>
        <div className="grid grid-cols-3 gap-1.5">
          <button onClick={() => onReschedule(todayStr)}
            className="px-2 py-1.5 rounded-lg text-[11px] font-medium bg-dark-surface2 text-gray-300 hover:bg-primary-500/15 hover:text-white transition-colors">
            Today
          </button>
          <button onClick={() => onReschedule(tomorrowStr)}
            className="px-2 py-1.5 rounded-lg text-[11px] font-medium bg-dark-surface2 text-gray-300 hover:bg-primary-500/15 hover:text-white transition-colors">
            Tomorrow
          </button>
          <button onClick={() => onReschedule(nextWeekStr)}
            className="px-2 py-1.5 rounded-lg text-[11px] font-medium bg-dark-surface2 text-gray-300 hover:bg-primary-500/15 hover:text-white transition-colors">
            +1 week
          </button>
        </div>
      </div>

      {/* Secondary actions: duplicate + edit + delete */}
      <div className="grid grid-cols-3 gap-1.5">
        <button onClick={() => onDuplicate(todayStr)}
          className="flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium bg-dark-surface2 text-gray-300 hover:bg-blue-500/15 hover:text-blue-300 transition-colors"
          title="Duplicate this task to today">
          <Copy size={12} /> Copy
        </button>
        <button onClick={onFullEdit}
          className="flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium bg-dark-surface2 text-gray-300 hover:bg-primary-500/15 hover:text-white transition-colors">
          <Edit size={12} /> Edit
        </button>
        <button onClick={onDelete}
          className="flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors">
          <Trash2 size={12} /> Delete
        </button>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  DAY TIMELINE — true time-axis grid                                */
/* ═══════════════════════════════════════════════════════════════════ */

/**
 * Renders a vertical time-axis (6am → 10pm by default) with tasks
 * positioned absolutely by their start_time + duration_minutes. Tasks
 * that fall outside the window are clamped to the edges with a marker
 * so they don't silently disappear. The "Now" red line auto-refreshes
 * every minute when viewing today and the page mounts pre-scrolled so
 * the current hour is in view.
 *
 * Overlap handling: tasks that overlap visually stack with the later
 * one on top — z-index by start time. A future iteration could split
 * the column into lanes, but for typical hotel-ops workloads (5–15
 * tasks/day) plain overlap is fine and a click still hits the right
 * chip because the popover anchor is the absolutely-positioned chip.
 */
function DayTimeline({ tasks, isToday, currentDate, onTaskClick, onCreateAtTime, onTaskUpdate, onTaskDropAtTime, onAddTask, employees, viewMode, onViewModeChange }: {
  tasks: any[]
  isToday: boolean
  /** ISO date (Y-m-d) — shown as the day pill in the top-left of the header. */
  currentDate: string
  onTaskClick: (task: any, anchor: DOMRect) => void
  /** hhmm is the snapped start; emp is the column the user clicked
   *  (undefined in single-column mode or when click hit no column). */
  onCreateAtTime: (hhmm: string, emp?: string) => void
  onTaskUpdate: (taskId: number, body: Record<string, any>) => void
  /** Fired when a task is HTML5-dragged onto an empty slot in the
   *  timeline (e.g. from the BacklogDrawer or another day's chip).
   *  hhmm is the snapped start, emp is the column in team mode. The
   *  parent uses this to fire moveMutation with task_date + start_time. */
  onTaskDropAtTime: (taskId: number, hhmm: string, emp?: string) => void
  /** Fired by the "+ Add task" button at the bottom of the timeline.
   *  Opens the new-task drawer for the current date with no time
   *  pre-selected. */
  onAddTask: () => void
  /** Employees to render as columns when viewMode === 'team'. Order is
   *  preserved, with `__unassigned__` reserved for null employees. */
  employees: string[]
  viewMode: 'single' | 'team'
  onViewModeChange: (mode: 'single' | 'team') => void
}) {
  const HOUR_START = 6
  const HOUR_END = 22
  // 72px/hour (was 56) — gives a 1-hour chip ~66px of content height,
  // enough to fit time + title + sublabel without cropping. Mirrors
  // the airier vertical rhythm of the mockup.
  const PX_PER_HOUR = 72
  const TOTAL_HEIGHT = (HOUR_END - HOUR_START) * PX_PER_HOUR
  // Widened to fit the 12-hour "10:00 AM" hour labels without clipping.
  const TIME_LABEL_WIDTH = 72

  /**
   * Drag state for in-grid reschedule + resize. Pointer-events on
   * chip body start a "move" drag, on the bottom edge a "resize"
   * drag. Live preview updates the rendered top/height while the
   * mouse moves; we commit via onTaskUpdate on mouseup. A small
   * 4px dead-zone prevents accidental drags from a simple click,
   * and `justDraggedRef` suppresses the onClick that would
   * otherwise fire the popover at the end of a drag.
   *
   * In team mode, move drags ALSO track horizontal position so
   * the user can drag a chip into another employee's column to
   * reassign. `origColumn` / `currentColumn` are 0-based indices
   * into the `employees` array; commit includes employee_name
   * when currentColumn differs from origColumn.
   */
  const [drag, setDrag] = useState<null | {
    taskId: number
    mode: 'move' | 'resize'
    startY: number
    startX: number
    origStartMin: number
    origDuration: number
    origColumn: number
    currentStartMin: number
    currentDuration: number
    currentColumn: number
    moved: boolean
  }>(null)
  const justDraggedRef = useRef(false)
  // Ref to the time-grid container — used during cross-column drag
  // to convert clientX into a column index. Assigned by the <div
  // className="relative cursor-cell"> below.
  const gridRef = useRef<HTMLDivElement>(null)

  // Global mouse listeners — only active while a drag is in flight.
  useEffect(() => {
    if (!drag) return
    const onMove = (e: MouseEvent) => {
      const dy = e.clientY - drag.startY
      const minutesDelta = Math.round((dy / PX_PER_HOUR) * 60 / 15) * 15 // snap 15min

      // Compute the live column from the cursor's X. Only matters
      // when the user is doing a "move" drag in team mode. In single
      // mode this resolves to the original column and is a no-op.
      let newColumn = drag.origColumn
      const inTeam = drag.mode === 'move' && employees.length >= 2 && gridRef.current
      if (inTeam) {
        const rect = gridRef.current!.getBoundingClientRect()
        const xInCols = e.clientX - rect.left - TIME_LABEL_WIDTH
        const colsW = rect.width - TIME_LABEL_WIDTH
        if (colsW > 0) {
          newColumn = Math.max(0, Math.min(employees.length - 1, Math.floor((xInCols / colsW) * employees.length)))
        }
      }

      if (drag.mode === 'move') {
        const newStart = Math.max(
          HOUR_START * 60,
          Math.min(HOUR_END * 60 - drag.origDuration, drag.origStartMin + minutesDelta),
        )
        const verticalChanged = newStart !== drag.currentStartMin
        const horizontalChanged = newColumn !== drag.currentColumn
        const dx = e.clientX - drag.startX
        const moved = drag.moved || Math.abs(dy) >= 4 || Math.abs(dx) >= 4
        if (!verticalChanged && !horizontalChanged && moved === drag.moved) return
        setDrag(d => d ? { ...d, currentStartMin: newStart, currentColumn: newColumn, moved } : null)
      } else {
        const newDuration = Math.max(15, Math.min(HOUR_END * 60 - drag.origStartMin, drag.origDuration + minutesDelta))
        if (newDuration === drag.currentDuration && Math.abs(dy) < 4) return
        setDrag(d => d ? { ...d, currentDuration: newDuration, moved: d.moved || Math.abs(dy) >= 4 } : null)
      }
    }
    const onUp = () => {
      if (drag.moved) {
        justDraggedRef.current = true
        setTimeout(() => { justDraggedRef.current = false }, 80)
        if (drag.mode === 'move') {
          const body: Record<string, any> = {}
          if (drag.currentStartMin !== drag.origStartMin) {
            const hh = String(Math.floor(drag.currentStartMin / 60)).padStart(2, '0')
            const mm = String(drag.currentStartMin % 60).padStart(2, '0')
            body.start_time = `${hh}:${mm}`
          }
          if (employees.length >= 2 && drag.currentColumn !== drag.origColumn) {
            const target = employees[drag.currentColumn]
            // Map the synthetic `__unassigned__` column back to a
            // null employee_name on the server.
            body.employee_name = target === '__unassigned__' ? null : target
          }
          if (Object.keys(body).length > 0) onTaskUpdate(drag.taskId, body)
        } else if (drag.mode === 'resize' && drag.currentDuration !== drag.origDuration) {
          onTaskUpdate(drag.taskId, { duration_minutes: drag.currentDuration })
        }
      }
      setDrag(null)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [drag, onTaskUpdate, employees])

  // Tick every 60s so the "Now" line + the "Now" pill text stay
  // current without the parent re-rendering.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    if (!isToday) return
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [isToday])

  // Convert HH:MM[:SS] to minutes-since-midnight. Returns null when
  // the input doesn't parse (so we can filter out untimed tasks).
  const parseMin = (t: string | null | undefined): number | null => {
    if (!t) return null
    const m = /^(\d{1,2}):(\d{1,2})/.exec(t)
    if (!m) return null
    return Number(m[1]) * 60 + Number(m[2])
  }

  const minutesToPx = (mins: number) => {
    const fromStart = mins - HOUR_START * 60
    return (fromStart / 60) * PX_PER_HOUR
  }

  const scrollRef = useRef<HTMLDivElement>(null)

  // On first mount, scroll the timeline so the current hour (or the
  // first task) is roughly centered. Only fires once per mount, so a
  // user scrolling around won't get yanked back.
  useEffect(() => {
    if (!scrollRef.current) return
    let scrollToMin: number | null = null
    if (isToday) scrollToMin = now.getHours() * 60 + now.getMinutes()
    else {
      const firstTask = [...tasks].sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''))[0]
      const m = parseMin(firstTask?.start_time)
      if (m != null) scrollToMin = m
    }
    if (scrollToMin == null) return
    const px = minutesToPx(scrollToMin) - PX_PER_HOUR * 2 // padding above
    scrollRef.current.scrollTop = Math.max(0, px)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const nowMin = now.getHours() * 60 + now.getMinutes()
  const showNowLine = isToday && nowMin >= HOUR_START * 60 && nowMin <= HOUR_END * 60
  const nowTop = minutesToPx(nowMin)

  // Build the hour-label rows.
  const hours: number[] = []
  for (let h = HOUR_START; h <= HOUR_END; h++) hours.push(h)
  const formatHourLabel = (h: number) => {
    if (h === 0) return '12:00 AM'
    if (h === 12) return '12:00 PM'
    if (h < 12) return `${h}:00 AM`
    return `${h - 12}:00 PM`
  }
  // 12-hour clock with AM/PM for the "now" pill label. `s` is in
  // HH:MM 24-hour form.
  const to12h = (s: string) => {
    const [hh, mm] = s.split(':').map(Number)
    const period = hh >= 12 ? 'PM' : 'AM'
    const h12 = hh % 12 === 0 ? 12 : hh % 12
    return `${h12}:${String(mm).padStart(2, '0')} ${period}`
  }
  // 12-hour clock WITHOUT AM/PM — used in chip headers since the
  // column already implies the day and AM/PM clutters short chips.
  const to12hNoSuffix = (s: string) => {
    const [hh, mm] = s.split(':').map(Number)
    const h12 = hh % 12 === 0 ? 12 : hh % 12
    return `${h12}:${String(mm).padStart(2, '0')}`
  }

  // Sort tasks by start so later-starting tasks paint on top of
  // earlier ones in an overlap — feels more natural since the "next
  // task" is usually the one the user wants to click.
  const sorted = [...tasks].sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''))

  // Team mode only makes sense when there are 2+ employees in scope.
  // Force single mode otherwise so the toggle doesn't dangle as a
  // useless control. The actual rendered mode also defaults to
  // single when team mode is requested but employees list is empty
  // — defensive against query timing where tasks load before
  // settings.employees.
  const canTeam = employees.length >= 2
  const renderedMode: 'single' | 'team' = (viewMode === 'team' && canTeam) ? 'team' : 'single'

  // Per-employee task count for the column header (team mode) — fed
  // off the same task slice the timeline renders so the badge stays
  // honest as the user filters. Unassigned bucket counts separately.
  const employeeTaskCount = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of tasks) {
      const key = t.employee_name || '__unassigned__'
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return map
  }, [tasks])

  // Day pill labels ("Mon", "25") parsed from the ISO date so the
  // header reads at a glance like a paper calendar. Falls back to "—"
  // when currentDate is empty (shouldn't happen but defensive).
  const dayLabel = useMemo(() => {
    if (!currentDate) return { name: '—', num: '' }
    const d = new Date(currentDate + 'T00:00:00')
    if (Number.isNaN(d.getTime())) return { name: '—', num: '' }
    return {
      name: d.toLocaleDateString([], { weekday: 'short' }),
      num: String(d.getDate()),
    }
  }, [currentDate])

  return (
    <div className="bg-dark-surface border border-dark-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border gap-3 flex-wrap">
        <h3 className="text-sm font-semibold text-white">Timeline</h3>
        <div className="flex items-center gap-3 text-[10px] text-gray-500 flex-wrap">
          {/* View-mode toggle — only shown when team mode is possible
              (i.e. there are 2+ employees in scope). Single-column is
              still useful when filtered to one person, so we don't
              hide that mode unconditionally. */}
          {canTeam && (
            <div className="inline-flex p-0.5 rounded-md border border-dark-border bg-dark-surface2">
              <button
                onClick={() => onViewModeChange('single')}
                title="One timeline for the selected scope"
                className={'flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ' +
                  (renderedMode === 'single' ? 'bg-primary-500 text-black' : 'text-gray-400 hover:text-white')}>
                <CalendarDays size={10} /> Combined
              </button>
              <button
                onClick={() => onViewModeChange('team')}
                title="One column per person — Google Calendar-style team view"
                className={'flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ' +
                  (renderedMode === 'team' ? 'bg-primary-500 text-black' : 'text-gray-400 hover:text-white')}>
                <User size={10} /> By person
              </button>
            </div>
          )}
          {isToday && (
            <span className="inline-flex items-center gap-1.5 text-red-400">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              {to12h(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`).toLowerCase()} now
            </span>
          )}
          <span className="hidden sm:inline">6 AM → 10 PM</span>
        </div>
      </div>

      <div ref={scrollRef} className="relative overflow-y-auto" style={{ maxHeight: renderedMode === 'team' ? 720 : 640 }}>
        {/* Sticky header row — date pill in the top-left + per-employee
            columns (team mode) or empty space (single mode). Lives in
            the scroll container so it stays pinned while the time
            grid scrolls underneath. */}
        <div className="sticky top-0 z-30 bg-dark-surface border-b border-dark-border flex">
          <div
            className="flex flex-col items-center justify-center border-r border-dark-border/40 select-none"
            style={{ width: TIME_LABEL_WIDTH, minHeight: 60 }}>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-primary-400 leading-none">
              {dayLabel.name}
            </span>
            <span className="text-xl font-bold text-primary-400 leading-none mt-0.5 tabular-nums">
              {dayLabel.num}
            </span>
          </div>
          {renderedMode === 'team' ? (
            employees.map(emp => {
              const label = emp === '__unassigned__' ? 'Unassigned' : emp
              const initials = label.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
              const count = employeeTaskCount.get(emp) ?? 0
              const isUn = emp === '__unassigned__'
              return (
                <div key={emp} className="flex-1 px-3 py-2.5 border-l border-dark-border/30 flex items-center gap-2 min-w-0">
                  <div className={'w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 ring-1 ' + (isUn ? 'bg-gray-700/40 text-gray-300 ring-gray-600/40' : 'bg-gradient-to-br from-primary-500/30 to-primary-600/30 text-primary-200 ring-primary-500/40')}>
                    {initials}
                  </div>
                  <div className="flex flex-col min-w-0 leading-tight">
                    <span className="text-[12px] font-semibold text-white truncate">{label}</span>
                    <span className="text-[10px] text-gray-500">
                      {count} {count === 1 ? 'task' : 'tasks'}
                    </span>
                  </div>
                </div>
              )
            })
          ) : (
            <div className="flex-1 px-3 py-2.5 flex items-center min-h-[60px]">
              <span className="text-[11px] text-gray-500">
                {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'} scheduled
              </span>
            </div>
          )}
        </div>

        <div
          ref={gridRef}
          className="relative cursor-cell"
          style={{ height: TOTAL_HEIGHT, paddingLeft: TIME_LABEL_WIDTH }}
          onDragOver={(e) => {
            // Accept drops from any chip (backlog or another scheduled
            // chip). dataTransfer.types is the only thing we can read in
            // dragover (Firefox blocks getData); presence of 'taskid' is
            // our signal.
            if (e.dataTransfer.types.includes('taskid') || e.dataTransfer.types.includes('text/plain')) {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
            }
          }}
          onDrop={(e) => {
            e.preventDefault()
            const taskId = Number(e.dataTransfer.getData('taskId'))
            if (!taskId) return
            const wrap = e.currentTarget.getBoundingClientRect()
            const y = e.clientY - wrap.top
            const mins = (y / PX_PER_HOUR) * 60
            const snapped = Math.max(0, Math.round(mins / 15) * 15)
            const total = HOUR_START * 60 + snapped
            const hh = String(Math.floor(total / 60)).padStart(2, '0')
            const mm = String(total % 60).padStart(2, '0')
            // Same column resolution as the click handler — in team
            // mode, map clientX to an employee column so dropping in
            // the Maintenance column auto-assigns it.
            let emp: string | undefined
            if (renderedMode === 'team' && employees.length > 0) {
              const colsW = wrap.width - TIME_LABEL_WIDTH
              const x = Math.max(0, e.clientX - wrap.left - TIME_LABEL_WIDTH)
              const colIdx = Math.min(employees.length - 1, Math.floor((x / colsW) * employees.length))
              const candidate = employees[colIdx]
              if (candidate && candidate !== '__unassigned__') emp = candidate
            }
            onTaskDropAtTime(taskId, `${hh}:${mm}`, emp)
          }}
          onClick={(e) => {
            // Click on empty timeline space → open the new-task drawer
            // with this hour pre-selected. We skip when the click
            // bubbled from a chip button so a chip click doesn't also
            // create a task underneath it. In team mode we also work
            // out which employee column was clicked.
            const tgt = e.target as HTMLElement | null
            if (!tgt) return
            if (tgt.closest('button')) return
            const wrap = e.currentTarget.getBoundingClientRect()
            const y = e.clientY - wrap.top
            const mins = (y / PX_PER_HOUR) * 60
            const snapped = Math.max(0, Math.round(mins / 15) * 15)
            const total = HOUR_START * 60 + snapped
            const hh = String(Math.floor(total / 60)).padStart(2, '0')
            const mm = String(total % 60).padStart(2, '0')
            let emp: string | undefined
            if (renderedMode === 'team' && employees.length > 0) {
              const colsW = wrap.width - TIME_LABEL_WIDTH
              const x = Math.max(0, e.clientX - wrap.left - TIME_LABEL_WIDTH)
              const colIdx = Math.min(employees.length - 1, Math.floor((x / colsW) * employees.length))
              const candidate = employees[colIdx]
              if (candidate && candidate !== '__unassigned__') emp = candidate
            }
            onCreateAtTime(`${hh}:${mm}`, emp)
          }}
        >
          {/* Hour grid */}
          {hours.map((h, i) => (
            <div key={h} className="absolute left-0 right-0 flex items-start pointer-events-none" style={{ top: i * PX_PER_HOUR, height: PX_PER_HOUR }}>
              <span className="pr-3 text-right text-[11px] font-medium text-gray-500 -mt-1.5 select-none" style={{ width: TIME_LABEL_WIDTH }}>
                {formatHourLabel(h)}
              </span>
              <span className="flex-1 border-t border-dark-border/40" />
            </div>
          ))}

          {/* Half-hour ticks (subtle) */}
          {hours.slice(0, -1).map((h) => (
            <div key={`half-${h}`}
              className="absolute border-t border-dashed border-dark-border/20 pointer-events-none"
              style={{
                top: (h - HOUR_START) * PX_PER_HOUR + PX_PER_HOUR / 2,
                left: TIME_LABEL_WIDTH,
                right: 0,
              }} />
          ))}

          {/* Vertical column dividers — only in team mode. Drawn via
              percentage so they auto-distribute as the columns resize. */}
          {renderedMode === 'team' && employees.slice(1).map((emp, i) => (
            <div key={`col-${emp}`}
              className="absolute top-0 bottom-0 border-l border-dark-border/40 pointer-events-none"
              style={{ left: `calc(${TIME_LABEL_WIDTH}px + (${(i + 1) / employees.length} * (100% - ${TIME_LABEL_WIDTH}px)))` }} />
          ))}

          {/* Now line — bright red across the grid, time pill on the
              left edge so it reads against the dark header even when
              the user scrolls. */}
          {showNowLine && (
            <div className="absolute left-0 right-0 z-30 pointer-events-none" style={{ top: nowTop }}>
              <div className="flex items-center">
                <span
                  className="text-right text-[10px] font-bold text-white bg-red-500 px-1.5 py-0.5 rounded shadow-[0_2px_6px_rgba(239,68,68,0.5)] mr-1"
                  style={{ width: TIME_LABEL_WIDTH - 4 }}>
                  {to12h(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`)}
                </span>
                <span className="flex-1 relative">
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_0_3px_rgba(239,68,68,0.25)]" />
                  <span className="block border-t-2 border-red-500" />
                </span>
              </div>
            </div>
          )}

          {/* Task chips, positioned absolutely */}
          {sorted.map(task => {
            const rawStartMin = parseMin(task.start_time)
            if (rawStartMin == null) return null
            const rawDuration = Math.max(15, Number(task.duration_minutes) || 30)
            const meta = getGroupMeta(task.task_group)
            const Icon = meta.icon
            // In team mode, find which column this task belongs to.
            // Tasks whose employee_name isn't in the employees array
            // (e.g. orphaned data) are skipped so we don't paint
            // outside any column.
            let colIdx = -1
            if (renderedMode === 'team') {
              const empKey = task.employee_name || '__unassigned__'
              colIdx = employees.indexOf(empKey)
              if (colIdx < 0) return null
            }
            // While the chip is being dragged, render at the live
            // drag position instead of the persisted value — gives
            // instant feedback before mutation commits.
            const isDragging = !!(drag && drag.taskId === task.id && drag.moved)
            const startMin = isDragging && drag ? drag.currentStartMin : rawStartMin
            const duration = isDragging && drag ? drag.currentDuration : rawDuration
            // In team mode, position the chip in its LIVE column
            // during a drag so the user sees it jump into the new
            // employee's lane as they cross the column boundary.
            const effectiveCol = isDragging && drag && renderedMode === 'team' ? drag.currentColumn : colIdx
            // Clamp top + height to keep tasks inside the visible window.
            const topRaw = minutesToPx(startMin)
            const top = Math.max(0, Math.min(TOTAL_HEIGHT - 18, topRaw))
            const heightRaw = (duration / 60) * PX_PER_HOUR
            const maxHeight = TOTAL_HEIGHT - top
            const height = Math.max(20, Math.min(maxHeight, heightRaw))
            const endMin = startMin + duration
            const endLabel = `${String(Math.floor(endMin / 60) % 24).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`
            const startLabel = `${String(Math.floor(startMin / 60) % 24).padStart(2, '0')}:${String(startMin % 60).padStart(2, '0')}`
            // Position style differs by mode. Single = full-width
            // chip across the columns area. Team = chip restricted
            // to its employee's column via CSS calc against the
            // columns-area width.
            const positionStyle: React.CSSProperties = renderedMode === 'team'
              ? {
                  top: top + 3,
                  left: `calc(${TIME_LABEL_WIDTH}px + (${effectiveCol / employees.length} * (100% - ${TIME_LABEL_WIDTH}px)) + 5px)`,
                  width: `calc((100% - ${TIME_LABEL_WIDTH}px) / ${employees.length} - 10px)`,
                  height: height - 6,
                }
              : {
                  top: top + 3,
                  left: TIME_LABEL_WIDTH + 10,
                  right: 10,
                  height: height - 6,
                }
            return (
              <button
                key={task.id}
                onClick={(e) => {
                  // Suppress the click that fires at the end of a
                  // drag — the popover would steal focus from the
                  // user who just dropped the chip in its new home.
                  if (justDraggedRef.current) { e.preventDefault(); e.stopPropagation(); return }
                  onTaskClick(task, (e.currentTarget as HTMLElement).getBoundingClientRect())
                }}
                onMouseDown={(e) => {
                  // Only the primary button starts a drag. Other
                  // buttons (right-click) fall through to default.
                  if (e.button !== 0) return
                  // In team mode, capture the chip's starting column
                  // so we can detect cross-column moves on mouseup.
                  // colIdx was computed above; in single mode it's
                  // -1 which we coerce to 0 (we never read it in
                  // single mode anyway).
                  const origCol = renderedMode === 'team' ? Math.max(0, colIdx) : 0
                  setDrag({
                    taskId: task.id, mode: 'move', startY: e.clientY, startX: e.clientX,
                    origStartMin: rawStartMin, origDuration: rawDuration, origColumn: origCol,
                    currentStartMin: rawStartMin, currentDuration: rawDuration, currentColumn: origCol,
                    moved: false,
                  })
                }}
                title={`${task.title} — ${to12h(startLabel)}${duration ? ` to ${to12h(endLabel)}` : ''} · drag to move, drag bottom edge to resize`}
                className={'absolute group transition-shadow hover:shadow-lg hover:shadow-black/40 hover:z-20 cursor-grab active:cursor-grabbing ' + (isDragging ? 'z-30 shadow-2xl' : '')}
                style={{
                  // Solid saturated tint (no gradient) so titles stay
                  // legible top-to-bottom; backdrop-saturated bg gives
                  // the same "frosted color" feel as the sample cards.
                  ...positionStyle,
                  background: meta.color + '38',
                  border: `1px solid ${meta.color}80`,
                  borderRadius: 12,
                  boxShadow: `inset 0 1px 0 ${meta.color}30`,
                  opacity: task.completed ? 0.55 : (isDragging ? 0.9 : 1),
                  zIndex: isDragging ? 30 : 10,
                  transition: isDragging ? 'none' : 'top 0.15s, height 0.15s, box-shadow 0.15s',
                }}>
                <div className="h-full px-3 py-2 flex flex-col items-start text-left overflow-hidden relative gap-0.5">
                  {/* Time range — bright color, matches sample's
                      "9:00 – 10:00" header. Drops AM/PM since the
                      column already groups by day. */}
                  <span className="text-[10.5px] font-medium tabular-nums flex-shrink-0 pr-7 leading-none" style={{ color: meta.color, filter: 'brightness(1.5)' }}>
                    {to12hNoSuffix(startLabel)}{duration ? ` – ${to12hNoSuffix(endLabel)}` : ''}
                  </span>
                  {/* Title — bright white, with right-padding so the
                      corner icon never overlaps. Wraps to 2 lines on
                      chips ≥ 80px tall (45min+ at 72px/hr), truncates
                      otherwise so half-hour slots stay readable. */}
                  <span
                    className={'text-[13px] font-semibold text-white leading-tight w-full pr-7 ' + (task.completed ? 'line-through' : '')}
                    style={{
                      display: '-webkit-box',
                      WebkitLineClamp: height >= 80 ? 2 : 1,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}>
                    {task.title}
                  </span>
                  {/* Sublabel — group label in team mode (column shows
                      employee), employee in single mode. Shows on
                      chips ≥ 60px (45min+ at 72px/hr) so the third
                      line never gets clipped. */}
                  {height >= 60 && (
                    <span className="text-[10px] text-white/60 mt-auto truncate w-full pr-1">
                      {renderedMode === 'team' ? (task.task_group || 'Task') : (task.employee_name || task.task_group || 'Unassigned')}
                    </span>
                  )}
                  {/* Corner icon — single circular dot in the
                      top-right, mirroring the sample design where each
                      card has a single accent badge (no rectangular
                      tile). Priority / recurring / status sit
                      vertically beneath, only when set, so the corner
                      stays uncluttered. */}
                  <span
                    className="absolute top-2 right-2 inline-flex items-center justify-center w-5 h-5 rounded-full flex-shrink-0"
                    style={{ background: meta.color + 'cc', boxShadow: `0 1px 4px ${meta.color}55` }}
                    title={task.task_group || 'Task'}>
                    <Icon size={11} className="text-white" />
                  </span>
                  {/* Secondary badges — stacked under the corner icon
                      only when they exist. Keeps the top-right corner
                      uncluttered on the common case (no priority, not
                      recurring, default status). */}
                  {(task.priority === 'High' || (task.recurring || task.recurring_parent_id) || STATUS_META[task.status]) && (
                    <div className="absolute top-8 right-2 flex flex-col items-end gap-0.5">
                      {task.priority === 'High' && (
                        <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-red-500/80 flex-shrink-0" title="High priority">
                          <Flag size={8} className="text-white" />
                        </span>
                      )}
                      {(task.recurring || task.recurring_parent_id) && (
                        <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-purple-500/80" title="Part of a recurring series">
                          <Repeat size={8} className="text-white" />
                        </span>
                      )}
                      {(() => {
                        const sm = STATUS_META[task.status]
                        if (!sm) return null
                        const SIcon = sm.icon
                        return (
                          <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full flex-shrink-0"
                            style={{ background: sm.color }} title={sm.label}>
                            <SIcon size={8} className="text-white" />
                          </span>
                        )
                      })()}
                    </div>
                  )}
                </div>
                {/* Resize handle — bottom 6px of the chip. Drag to
                    adjust duration. stopPropagation prevents the
                    chip-body onMouseDown from also starting a move
                    drag, and the cursor switches to row-resize on
                    hover so the affordance is obvious. */}
                <div
                  onMouseDown={(e) => {
                    if (e.button !== 0) return
                    e.stopPropagation()
                    const origCol = renderedMode === 'team' ? Math.max(0, colIdx) : 0
                    setDrag({
                      taskId: task.id, mode: 'resize', startY: e.clientY, startX: e.clientX,
                      origStartMin: rawStartMin, origDuration: rawDuration, origColumn: origCol,
                      currentStartMin: rawStartMin, currentDuration: rawDuration, currentColumn: origCol,
                      moved: false,
                    })
                  }}
                  className="absolute bottom-0 left-0 right-0 h-1.5 cursor-row-resize opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ background: meta.color + '60', borderBottomLeftRadius: 8, borderBottomRightRadius: 8 }}
                  title="Drag to resize duration"
                />
              </button>
            )
          })}
        </div>
        {/* Bottom "+ Add task" affordance — mirrors the sample's
            centered footer button. Scrolls with the grid so it's
            always at the end of the day, not anchored above the
            fold. */}
        <div className="flex justify-center py-3 border-t border-dark-border/40 bg-dark-surface/60 sticky bottom-0 z-20">
          <button
            type="button"
            onClick={onAddTask}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-medium text-gray-300 hover:text-white bg-dark-surface2/60 hover:bg-dark-surface2 border border-dark-border hover:border-primary-500/40 transition">
            <Plus size={13} />
            Add task
          </button>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  MAIN PLANNER COMPONENT                                           */
/* ═══════════════════════════════════════════════════════════════════ */

export function Planner() {
  const qc = useQueryClient()
  const { t } = useTranslation()
  const settings = useSettings()
  const { user } = useAuthStore()
  const myName = user?.name ?? ''

  // Raw settings read for the bits useSettings() flattens (it reduces
  // enriched planner_groups to plain strings + has no awareness of
  // planner_channels). We use the same cached query so no extra round
  // trip. Sync the module-level customisation map on every render so
  // every chip render in this file picks up admin icon/color edits.
  const { data: rawSettings } = useQuery<Record<string, any>>({
    queryKey: ['crm-settings'],
    queryFn: () => api.get('/v1/admin/crm-settings').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  })
  const { custom: customGroupMetaSnapshot } = parsePlannerGroups(rawSettings?.planner_groups)
  _customGroupMeta = customGroupMetaSnapshot
  const taskChannels = parsePlannerChannels(rawSettings?.planner_channels)
  const employeePrefs = parseEmployeePrefs(rawSettings?.planner_employee_prefs)
  // Assignable employees come from the REAL team (staff/users via
  // /v1/admin/team) so people added in Settings → Team show up in every
  // assign dropdown — unioned with the legacy settings.employees list.
  const { data: teamData } = useQuery<{ staff?: any[] }>({
    queryKey: ['admin-team'],
    queryFn: () => api.get('/v1/admin/team').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  })
  const assignableEmployees: string[] = Array.from(new Set([
    ...((teamData?.staff ?? []).filter((s: any) => s.is_active !== false).map((s: any) => s.name).filter(Boolean)),
    ...(settings.employees ?? []),
  ])) as string[]
  const [tab, setTab] = useState<Tab>('schedule')
  const [currentDate, setCurrentDate] = useState(() => fmtDate(new Date()))
  const [weekStart, setWeekStart] = useState(() => fmtDate(getMonday(new Date())))
  const [monthYear, setMonthYear] = useState(() => ({ year: new Date().getFullYear(), month: new Date().getMonth() }))
  const [employee, setEmployee] = useState('')
  const [groupFilter, setGroupFilter] = useState('')
  // "Just mine" filter — client-side. Persists across sessions so an
  // agent who always works this way doesn't have to re-toggle every
  // morning. Falls back to false when the user isn't logged in.
  const [mineOnly, setMineOnly] = useState<boolean>(() => {
    try { return typeof window !== 'undefined' && localStorage.getItem('planner-mine-only') === '1' } catch { return false }
  })
  useEffect(() => {
    try { localStorage.setItem('planner-mine-only', mineOnly ? '1' : '0') } catch {}
  }, [mineOnly])
  const [showModal, setShowModal] = useState(false)
  const [editTask, setEditTask] = useState<any>(null)
  const [form, setForm] = useState<TaskForm>({ ...EMPTY_FORM })
  const [expandedTask, setExpandedTask] = useState<number | null>(null)
  const [copyTarget, setCopyTarget] = useState<{ taskId: number; date: string } | null>(null)
  const [moveTarget, setMoveTarget] = useState<{ taskId: number; date: string } | null>(null)
  const [statsFrom, setStatsFrom] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10))
  const [statsTo, setStatsTo] = useState(() => fmtDate(new Date()))
  // Auto-plan modal state — null = closed, populated = showing preview.
  const [autoPlan, setAutoPlan] = useState<null | {
    proposals: Array<{ task_id: number; title: string; task_group: string | null; priority: string | null; duration_minutes: number; start_time: string }>
    skipped: Array<{ task_id: number; title: string; reason: string }>
    work: { start: string; end: string }
  }>(null)
  const [autoPlanLoading, setAutoPlanLoading] = useState(false)
  const [autoPlanApplying, setAutoPlanApplying] = useState(false)
  // Day-view layout mode: 'single' = one combined timeline, 'team' =
  // one column per person (Google Calendar-style). Persisted so the
  // user's preference survives reloads. The DayTimeline component
  // falls back to single when fewer than 2 employees are in scope.
  const [dayViewMode, setDayViewMode] = useState<'single' | 'team'>(() => {
    try { return typeof window !== 'undefined' && localStorage.getItem('planner-day-view-mode') === 'team' ? 'team' : 'single' } catch { return 'single' }
  })
  useEffect(() => {
    try { localStorage.setItem('planner-day-view-mode', dayViewMode) } catch {}
  }, [dayViewMode])
  const [dragOverDate, setDragOverDate] = useState<string | null>(null)
  /**
   * Drop-target highlight key for Schedule + Month views. Composed
   * as `${date}|${employee_or_blank}` so we can distinguish the
   * same date across two different employee rows.
   */
  const [dragOverCell, setDragOverCell] = useState<string | null>(null)
  /**
   * Lightweight popover for click-on-task. Keeps the heavy modal
   * out of the way for the common edits: rename, mark done, change
   * priority, jump to full edit, delete.
   */
  const [taskPopover, setTaskPopover] = useState<{ task: any; anchor: DOMRect } | null>(null)
  /**
   * Inline-add state for Schedule + Month cells. Cell key follows
   * the same composition as `dragOverCell`. When set, that cell
   * renders an inline title input instead of the `+` button — saves
   * a round trip through the big modal.
   */
  const [quickAddCell, setQuickAddCell] = useState<string | null>(null)
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  // Recurring-delete modal — null = closed. Replaces the old window.prompt
  // numbered choice flow which was confusing + visually crusty next to
  // the rest of the SPA. Carries the task so we can show its title for
  // confirmation before the user picks a scope.
  const [recurringDelete, setRecurringDelete] = useState<any | null>(null)

  const today = fmtDate(new Date())

  /* ─── queries ─────────────────────────────────────────────────── */
  // task_group filter is applied client-side (see allTasks → tasks
  // below) so the GroupFilterTabs counts stay accurate as the user
  // flips between tabs without an extra round trip per click.
  const queryParams: any = { employee: employee || undefined }
  if (tab === 'day') queryParams.date = currentDate
  else if (tab === 'schedule') queryParams.week_start = weekStart
  else if (tab === 'month') {
    queryParams.from = `${monthYear.year}-${String(monthYear.month + 1).padStart(2, '0')}-01`
    const ld = new Date(monthYear.year, monthYear.month + 1, 0).getDate()
    queryParams.to = `${monthYear.year}-${String(monthYear.month + 1).padStart(2, '0')}-${String(ld).padStart(2, '0')}`
  }

  const { data: allTasks = [] } = useQuery({
    queryKey: ['planner-tasks', tab, tab === 'day' ? currentDate : tab === 'schedule' ? weekStart : monthYear, employee],
    queryFn: () => api.get('/v1/admin/planner/tasks', { params: queryParams }).then(r => r.data),
    enabled: tab !== 'stats',
  })
  const tasks = (() => {
    let out = allTasks
    if (groupFilter) out = out.filter((t: any) => (t.task_group || '') === groupFilter)
    if (mineOnly && myName) out = out.filter((t: any) => (t.employee_name || '') === myName)
    return out
  })()

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
  // Backlog drawer reads from ['planner-backlog'] — scheduling /
  // unscheduling moves tasks between the two pools, so every calendar
  // mutation has to bust both query keys to keep counts in sync.
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['planner-tasks']   })
    qc.invalidateQueries({ queryKey: ['planner-stats']   })
    qc.invalidateQueries({ queryKey: ['planner-backlog'] })
  }

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
    mutationFn: ({ id, scope }: { id: number; scope?: 'just_this' | 'all_future' | 'whole_series' }) =>
      api.delete('/v1/admin/planner/tasks/' + id + (scope ? '?scope=' + scope : '')),
    onSuccess: () => { invalidate(); setExpandedTask(null); toast.success('Deleted') },
  })

  /**
   * For recurring tasks, prompt the user to pick the scope before
   * deleting: just this occurrence, all future occurrences, or the
   * whole series. Standalone tasks bypass the prompt.
   */
  const deleteWithScope = useCallback((task: any) => {
    const isRecurring = task.recurring || task.recurring_parent_id
    if (!isRecurring) {
      if (confirm('Delete this task?')) deleteMutation.mutate({ id: task.id })
      return
    }
    // Recurring task — open the scope picker modal. State carries the
    // whole task so the modal can show its title for confirmation.
    setRecurringDelete(task)
  }, [deleteMutation])

  const copyMutation = useMutation({
    mutationFn: ({ id, task_date, employee_name }: any) => api.post('/v1/admin/planner/tasks/' + id + '/copy', { task_date, employee_name }),
    onSuccess: () => { invalidate(); setCopyTarget(null); toast.success('Duplicated') },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  })

  /**
   * Move task — optimistic. The task jumps to the new cell instantly;
   * if the server rejects, we roll back the cache and show an error.
   * Used by drag-and-drop in every view, so latency matters.
   */
  const moveMutation = useMutation({
    // start_time is optional — only the Day-timeline backlog drop sends it
    // (it knows the exact slot the user dropped on). Schedule / Month
    // drops omit it because those views only know the date, not the time.
    mutationFn: ({ id, task_date, employee_name, start_time }: any) => api.patch('/v1/admin/planner/tasks/' + id + '/move', { task_date, employee_name, start_time }),
    onMutate: async ({ id, task_date, employee_name, start_time }: any) => {
      await qc.cancelQueries({ queryKey: ['planner-tasks'] })
      const snapshots = qc.getQueriesData({ queryKey: ['planner-tasks'] })
      qc.setQueriesData({ queryKey: ['planner-tasks'] }, (old: any) => {
        if (!Array.isArray(old)) return old
        return old.map((t: any) => t.id === id
          ? { ...t, task_date,
              ...(employee_name !== undefined ? { employee_name } : {}),
              ...(start_time !== undefined ? { start_time } : {}),
            }
          : t)
      })
      return { snapshots }
    },
    onError: (_e, _vars, ctx: any) => {
      ctx?.snapshots?.forEach(([key, data]: any) => qc.setQueryData(key, data))
      toast.error('Could not move task')
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['planner-tasks']   })
      qc.invalidateQueries({ queryKey: ['planner-backlog'] })
      setMoveTarget(null)
    },
  })

  const quickCreateMutation = useMutation({
    mutationFn: (body: any) => api.post('/v1/admin/planner/tasks', body),
    onSuccess: () => { invalidate(); toast.success('Task added') },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  })

  /**
   * Auto-plan fetch — hits the backend's deterministic
   * priority-sorted fitter and shows the result in a preview
   * modal. Nothing is mutated until the user clicks Apply. We
   * fetch on demand (not via useQuery) because this is a
   * user-initiated, single-shot action.
   */
  const runAutoPlan = useCallback(async () => {
    setAutoPlanLoading(true)
    try {
      const body: any = { date: currentDate }
      if (employee) body.employee_name = employee
      const res = await api.post('/v1/admin/planner/auto-plan', body)
      setAutoPlan(res.data)
      if (res.data.proposals.length === 0) {
        toast('No unscheduled tasks to fit', { icon: '👍' })
      }
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Could not build a plan')
    } finally {
      setAutoPlanLoading(false)
    }
  }, [currentDate, employee])

  const applyAutoPlan = useCallback(async () => {
    if (!autoPlan) return
    setAutoPlanApplying(true)
    try {
      const res = await api.post('/v1/admin/planner/auto-plan/apply', { proposals: autoPlan.proposals })
      toast.success(`${res.data.applied} task${res.data.applied === 1 ? '' : 's'} scheduled`)
      setAutoPlan(null)
      invalidate()
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Could not apply the plan')
    } finally {
      setAutoPlanApplying(false)
    }
  }, [autoPlan])

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

  /**
   * Toggle complete — optimistic. The strike-through appears
   * immediately and the green check fills in; only rollback on
   * server reject. Critical for tight day-planner workflow.
   */
  const completeMutation = useMutation({
    mutationFn: (id: number) => api.patch('/v1/admin/planner/tasks/' + id + '/complete', {}),
    onMutate: async (id: number) => {
      await qc.cancelQueries({ queryKey: ['planner-tasks'] })
      const snapshots = qc.getQueriesData({ queryKey: ['planner-tasks'] })
      qc.setQueriesData({ queryKey: ['planner-tasks'] }, (old: any) => {
        if (!Array.isArray(old)) return old
        return old.map((t: any) => t.id === id
          ? { ...t, completed: !t.completed, status: !t.completed ? 'done' : 'todo' }
          : t)
      })
      return { snapshots }
    },
    onError: (_e, _id, ctx: any) => {
      ctx?.snapshots?.forEach(([key, data]: any) => qc.setQueryData(key, data))
      toast.error('Could not update task')
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['planner-tasks'] }),
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

  const openCreate = (date: string, emp?: string, startTime?: string) => {
    setEditTask(null)
    setShowTemplatePicker(false)
    setForm({
      ...EMPTY_FORM,
      task_date: date,
      employee_name: emp ?? myName,
      start_time: startTime ?? '',
    })
    setShowModal(true)
  }

  /**
   * Apply a server-side template to the form. Replaces the title +
   * group + category + duration + priority + description fields with
   * the template's pre-filled values. Date / employee / time stay
   * whatever the user already had.
   */
  const applyTemplate = useCallback((t: ServerTemplate) => {
    setForm(f => ({
      ...f,
      title: t.title,
      task_group: t.task_group ?? f.task_group,
      task_category: t.task_category ?? f.task_category,
      priority: t.priority ?? f.priority,
      duration_minutes: t.duration_minutes ? String(t.duration_minutes) : f.duration_minutes,
      description: t.description ?? f.description,
    }))
    setShowTemplatePicker(false)
  }, [])

  // Fetch server-side templates for the in-form picker (same data as
  // TaskTemplates uses; React Query dedupes the request).
  const { data: formTemplates = [] } = useQuery<ServerTemplate[]>({
    queryKey: ['planner-templates'],
    queryFn: () => api.get('/v1/admin/planner/templates').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  })

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

    // Recurring tasks — Planner v2: one POST, backend expands the
    // series. The old code fired N mutations client-side which was
    // racy + wasteful. Map the form's `recurring_end_date` field to
    // the backend's `recurring_until` column.
    if (!editTask && body.recurring && body.recurring !== 'none') {
      const payload: Record<string, unknown> = { ...body }
      payload.recurring_until = body.recurring_end_date || null
      delete payload.recurring_end_date
      createMutation.mutate(payload)
    } else {
      // Strip recurring fields on standalone create — the backend
      // accepts them but normalises 'none' → null anyway, so we keep
      // the wire payload tidy.
      const payload: Record<string, unknown> = { ...body }
      if (payload.recurring === 'none') delete payload.recurring
      delete payload.recurring_end_date

      if (editTask) updateMutation.mutate({ id: editTask.id, ...payload })
      else createMutation.mutate(payload)
    }
  }

  const handleQuickCreate = useCallback((title: string, date: string, group?: string, category?: string, duration?: number, employeeOverride?: string) => {
    quickCreateMutation.mutate({
      title, task_date: date, priority: 'Normal',
      employee_name: employeeOverride !== undefined ? employeeOverride : (myName || undefined),
      task_group: group || undefined, task_category: category || undefined, duration_minutes: duration || undefined
    })
  }, [myName])

  /* ─── derived data ────────────────────────────────────────────── */
  const weekDates = weekDatesFrom(new Date(weekStart))
  const monthWeeks = monthGrid(monthYear.year, monthYear.month)

  // Collect unique employees from tasks for the schedule view
  const scheduleEmployees: string[] = (() => {
    const fromTasks = [...new Set(tasks.map((t: any) => t.employee_name).filter(Boolean))]
    const fromSettings = assignableEmployees
    const merged = [...new Set([...fromSettings, ...fromTasks])] as string[]
    if (employee) return merged.filter(e => e === employee)
    return merged.length > 0 ? merged : ['Unassigned']
  })()

  const subtitle = tab === 'day'
    ? new Date(currentDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : tab === 'schedule'
    ? t('planner.subtitle.week_range', {
        start: new Date(weekStart + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        end: new Date(fmtDate(weekDates[6]) + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        defaultValue: 'Week {{start}} — {{end}}',
      })
    : tab === 'month' ? `${MONTHS[monthYear.month]} ${monthYear.year}` : t('planner.subtitle.statistics', 'Statistics')

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
            <h1 className="text-lg md:text-xl font-semibold text-white">{t('planner.title', 'Work Schedule')}</h1>
            <p className="text-xs md:text-sm text-gray-500 mt-0.5 truncate">{subtitle}</p>
          </div>
          {/* Mobile-only: Add button next to title to save a row */}
          {tab !== 'stats' && tab !== 'team' && (
            <button
              onClick={() => openCreate(tab === 'day' ? currentDate : today)}
              className="md:hidden flex items-center gap-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-500 px-3 py-2 rounded-lg transition-colors flex-shrink-0"
            >
              <Plus size={16} /> {t('planner.actions.add', 'Add')}
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap md:flex-nowrap">
          {/* View switcher — modernized segmented control. Active state
              now uses the brand gold fill (same pattern as Engagement
              filters + Members tier pills) instead of the muted
              translucent primary tint, so the current view is more
              obvious at a glance. */}
          <div className="flex p-1 rounded-xl border border-dark-border overflow-x-auto bg-dark-surface w-full sm:w-auto gap-0.5">
            {(() => {
              // Distinct icons per view — was three near-identical Calendar*
              // icons before, which made the segmented control read as a
              // homogeneous row of dates instead of distinct surfaces. Now:
              // Day = single Calendar, Schedule = CalendarDays (week grid),
              // Month = CalendarRange, Team = LayoutGrid (kanban columns),
              // Stats = BarChart2 (data).
              const tabs: Array<readonly [Tab, any, string]> = [
                ['day', Calendar, t('planner.tabs.day', 'Day')],
                ['schedule', CalendarDays, t('planner.tabs.schedule', 'Schedule')],
                ['month', CalendarRange, t('planner.tabs.month', 'Month')],
              ]
              // Team tab is manager-only — it's a cross-employee kanban view
              // of the backlog. Non-managers don't need it (they only see
              // their own bucket via the drawer's "Mine" tab anyway).
              if (useAuthStore.getState().isAdmin()) {
                tabs.push(['team', LayoutGrid, t('planner.tabs.team', 'Team')])
              }
              tabs.push(['stats', BarChart2, t('planner.tabs.stats', 'Stats')])
              return tabs.map(([tabKey, Icon, label]) => {
                const active = tab === tabKey
                return (
                  <button
                    key={tabKey}
                    onClick={() => setTab(tabKey as Tab)}
                    className={'flex items-center gap-1.5 px-3 md:px-4 py-1.5 rounded-lg text-xs md:text-sm font-semibold transition-all whitespace-nowrap flex-1 sm:flex-initial justify-center ' +
                      (active
                        ? 'bg-primary-500 text-black shadow-[0_2px_8px_rgba(201,168,76,0.3)]'
                        : 'text-gray-500 hover:text-white hover:bg-dark-surface2')}
                  >
                    <Icon size={14} /> {label}
                  </button>
                )
              })
            })()}
          </div>

          {tab !== 'stats' && tab !== 'team' && <>
            {/* "Just mine" filter — quick toggle to hide everyone
                else's tasks. Persists in localStorage so the user's
                preference survives reload. Hidden when no user name
                is known (e.g. unauthenticated edge case). */}
            {myName && (
              <button
                onClick={() => setMineOnly(o => !o)}
                title={mineOnly ? 'Showing only your tasks — click to show everyone' : 'Click to show only your tasks'}
                className={'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ' +
                  (mineOnly
                    ? 'bg-primary-500/15 border-primary-500/40 text-primary-300'
                    : 'bg-dark-surface border-dark-border text-gray-500 hover:text-white')}
              >
                <User size={13} />
                <span className="hidden sm:inline">{mineOnly ? 'Just mine' : 'All team'}</span>
              </button>
            )}
            <select value={employee} onChange={e => setEmployee(e.target.value)} className={filterSel + ' flex-1 sm:flex-initial min-w-0'}>
              <option value="">{t('planner.actions.all_team', 'All Team')}</option>
              {assignableEmployees.map((e: string) => <option key={e}>{e}</option>)}
            </select>
            <div className="flex items-center gap-1">
              <button onClick={() => navigate(-1)} className="p-2 rounded-lg border border-dark-border text-gray-400 hover:text-white hover:bg-dark-surface2 transition-all"><ChevronLeft size={16} /></button>
              <button onClick={goToday} className="px-3 py-2 rounded-lg border border-dark-border text-sm text-gray-400 hover:text-white hover:bg-dark-surface2 transition-all font-medium">{t('planner.actions.today', 'Today')}</button>
              <button onClick={() => navigate(1)} className="p-2 rounded-lg border border-dark-border text-gray-400 hover:text-white hover:bg-dark-surface2 transition-all"><ChevronRight size={16} /></button>
            </div>
            {/* Desktop-only Add (mobile already has one above) */}
            <button
              onClick={() => openCreate(tab === 'day' ? currentDate : today)}
              className="hidden md:flex items-center gap-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-500 px-4 py-2 rounded-lg transition-colors"
            >
              <Plus size={16} /> {t('planner.actions.add', 'Add')}
            </button>
          </>}
        </div>
      </div>

      {/* Group filter tabs — shared across Day / Schedule / Month */}
      {tab !== 'stats' && tab !== 'team' && (settings.planner_groups?.length ?? 0) > 0 && (
        <div className="mb-4">
          <GroupFilterTabs
            groups={settings.planner_groups}
            value={groupFilter}
            onChange={setGroupFilter}
            tasks={allTasks}
          />
        </div>
      )}

      {/* Backlog strip — horizontal panel sitting above the KPI bar.
          Replaces the previous left-sidebar drawer that was competing
          with the calendar for horizontal space. Collapsed by default
          to a one-row header with scope tabs + quick-add; expand to
          see the cards row. Drag cards DOWN onto any calendar cell
          to schedule; drag a scheduled chip UP into the strip to
          unschedule. Hidden on Team + Stats (those views don't drop
          tasks onto a calendar). */}
      {tab !== 'stats' && tab !== 'team' && (
        <BacklogStrip
          currentUserId={user?.id ?? null}
          currentUserName={myName}
          plannerSkills={useAuthStore.getState().staff?.planner_skills ?? null}
        />
      )}

      {/* Universal KPI strip — appears across Day / Schedule / Month so
          the agent always sees workload at a glance. Counts come from
          `tasks` which is the post-group-filter slice, so the numbers
          mirror what's actually rendered below. Overdue + Unassigned
          are clickable filters (a future iteration could deep-link
          into a filtered subview — for now they're informational). */}
      {tab !== 'stats' && tab !== 'team' && (() => {
        const todayISO = fmtDate(new Date())
        const total = tasks.length
        const completed = tasks.filter((t: any) => t.completed).length
        const overdue = tasks.filter((t: any) => !t.completed && (t.task_date ?? '').slice(0, 10) < todayISO).length
        const highPriority = tasks.filter((t: any) => !t.completed && t.priority === 'High').length
        const unassigned = tasks.filter((t: any) => !t.employee_name).length
        const completedPct = total > 0 ? Math.round((completed / total) * 100) : 0
        // Focus time = sum of duration_minutes for incomplete tasks
        // in the current scope. Default 60min when duration isn't set.
        const focusMins = tasks
          .filter((t: any) => !t.completed)
          .reduce((sum: number, t: any) => sum + Number(t.duration_minutes ?? 60), 0)
        const focusH = Math.floor(focusMins / 60)
        const focusM = focusMins % 60
        const focusLabel = focusH > 0 ? `${focusH}h${focusM ? ` ${focusM}m` : ''}` : `${focusM}m`

        // Discrete cards instead of a divided strip — matches the
        // dashboard-style design where each KPI is a separate tile
        // with the value top-left + a small icon tile top-right. Reads
        // as a row of dashboard widgets rather than a packed stat bar.
        const kpis = [
          { label: 'Total',     sublabel: total === 1 ? 'task' : 'tasks',  value: String(total),      accent: '#a78bfa', bg: 'rgba(167,139,250,0.10)', border: 'rgba(167,139,250,0.25)', icon: ListChecks },
          { label: 'Completed', sublabel: `${completedPct}%`,              value: String(completed),  accent: '#22c55e', bg: 'rgba(34,197,94,0.10)',   border: 'rgba(34,197,94,0.25)',   icon: CheckCircle2 },
          { label: 'Overdue',   sublabel: overdue === 1 ? 'task' : 'tasks', value: String(overdue),    accent: '#ef4444', bg: 'rgba(239,68,68,0.10)',   border: 'rgba(239,68,68,0.25)',   icon: AlertCircle, dim: overdue === 0 },
          { label: 'High Priority', sublabel: highPriority === 1 ? 'task' : 'tasks', value: String(highPriority), accent: '#f59e0b', bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.25)', icon: Flag,    dim: highPriority === 0 },
          { label: 'Focus Time',sublabel: 'today',                          value: focusLabel,         accent: '#0ea5e9', bg: 'rgba(14,165,233,0.10)',  border: 'rgba(14,165,233,0.25)',  icon: Clock },
          { label: 'Unassigned', sublabel: unassigned === 1 ? 'task' : 'tasks', value: String(unassigned), accent: '#3b82f6', bg: 'rgba(59,130,246,0.10)', border: 'rgba(59,130,246,0.25)', icon: User,    dim: unassigned === 0 },
        ]

        return (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            {kpis.map((k) => {
              const KIcon = k.icon
              return (
                <div key={k.label}
                  className={'bg-dark-surface border border-dark-border rounded-xl p-3 transition-opacity ' + (k.dim ? 'opacity-50' : '')}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 truncate">{k.label}</p>
                      <p className="text-2xl font-bold text-white mt-1 leading-none tabular-nums">{k.value}</p>
                      <p className="text-[10px] text-gray-500 mt-1 truncate" style={k.dim ? {} : { color: k.accent }}>
                        {k.sublabel}
                      </p>
                    </div>
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: k.bg, border: `1px solid ${k.border}` }}>
                      <KIcon size={16} style={{ color: k.accent }} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )
      })()}

      {/* ═══ DAY VIEW ═══
          2-col grid on lg+: main timeline + tasks on the left, sidebar
          on the right with mini-calendar + donut summary + Up Next.
          Below lg it collapses to a single column and the sidebar drops
          to the bottom — better than competing for horizontal space on
          narrow screens. The right sidebar was REMOVED in an earlier
          pass (because the old Overview panel duplicated the KPI bar);
          this brings it back with widgets that COMPLEMENT the KPI bar
          rather than duplicate it (mini-cal for date nav, visual donut,
          time-ordered upcoming-tasks list). */}
      {tab === 'day' && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
          <div className="space-y-4 min-w-0">
          {/* Day note — compact, click to expand. Same pattern as Schedule. */}
          <CollapsibleNote
            value={dayNote?.note_text ?? ''}
            weekStart={currentDate}
            placeholder={t('planner.notes.placeholder_day', 'Write notes for this day…')}
            label={t('planner.notes.day_notes', 'Day notes')}
            onSave={(text) => upsertNoteMutation.mutate({ note_date: currentDate, note_text: text })}
          />

          <div className="space-y-4">
            {/* Day-view action row — progress + Auto-plan button. Only
                renders when there are tasks, since otherwise the empty
                state below already invites task creation. */}
            {tasks.length > 0 && (
              <div className="bg-dark-surface border border-dark-border rounded-xl p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <ProgressBar done={tasks.filter((t: any) => t.completed).length} total={tasks.length} />
                </div>
                {/* Auto-plan — only meaningful if there are
                    unscheduled tasks to fit. Hidden otherwise so the
                    UI doesn't dangle a useless button. */}
                {tasks.some((t: any) => !t.start_time && !t.completed) && (
                  <button
                    onClick={runAutoPlan}
                    disabled={autoPlanLoading}
                    title="Smart-fit your unscheduled tasks into the day in priority order"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-500/15 text-purple-300 border border-purple-500/30 hover:bg-purple-500/25 transition-colors disabled:opacity-50">
                    <Sparkles size={12} />
                    {autoPlanLoading ? 'Planning…' : 'Auto-plan'}
                  </button>
                )}
              </div>
            )}

            {/* Timeline — true time-axis grid. 6am → 10pm, 56px/hour.
                Tasks position absolutely by start_time + duration so a
                glance gives a real sense of the day's shape (gaps,
                cluster, overlap). Tasks without a start_time render
                below in an "Untimed" pile. A red "Now" line shows
                current time when viewing today and auto-refreshes via
                <DayTimeline />'s internal minute tick. */}
            {tasks.some((t: any) => t.start_time) && (() => {
              // Build the list of employees rendered as columns when
              // team mode is active. When a single-employee filter
              // is set we force single mode (a one-column "team"
              // view would be a useless layout). Otherwise: union
              // of `settings.employees` and any names that actually
              // appear on today's tasks, plus a synthetic
              // `__unassigned__` slot when there are tasks without
              // an employee_name so they remain visible.
              const dayTasks = tasks.filter((t: any) => t.start_time)
              const fromTasks = Array.from(new Set(dayTasks.map((t: any) => t.employee_name).filter(Boolean))) as string[]
              const fromSettings = assignableEmployees
              const merged = Array.from(new Set([...fromSettings, ...fromTasks]))
              const hasUnassigned = dayTasks.some((t: any) => !t.employee_name)
              const dayEmployees = employee
                ? merged.filter(e => e === employee)
                : (hasUnassigned ? [...merged, '__unassigned__'] : merged)
              return (
                <DayTimeline
                  tasks={dayTasks}
                  isToday={currentDate === today}
                  currentDate={currentDate}
                  employees={dayEmployees}
                  viewMode={dayViewMode}
                  onViewModeChange={setDayViewMode}
                  onTaskClick={(task, anchor) => setTaskPopover({ task, anchor })}
                  onCreateAtTime={(hhmm, emp) => openCreate(currentDate, emp, hhmm)}
                  onAddTask={() => openCreate(currentDate, employee || undefined)}
                  onTaskDropAtTime={(taskId, hhmm, emp) => {
                    // Backlog or cross-day drop landed on an exact time
                    // slot. Schedule with task_date=currentDate +
                    // start_time=hhmm + employee from the column (or
                    // current employee filter when not in team mode).
                    const targetEmp = emp ?? (employee || undefined)
                    // Capacity warning (informational) — same shape as the
                    // Schedule view check. Skipped for unassigned drops.
                    if (targetEmp) {
                      const dropped = allTasks.find((t: any) => t.id === taskId)
                      const newMins = Number(dropped?.duration_minutes ?? 60)
                      const existingMins = (allTasks as any[]).filter(t =>
                        t.id !== taskId
                        && (t.employee_name || '') === targetEmp
                        && (t.task_date ?? '').slice(0, 10) === currentDate
                      ).reduce((sum, t) => sum + Number(t.duration_minutes ?? 60), 0)
                      const totalH = (existingMins + newMins) / 60
                      if (totalH > 8) {
                        toast(
                          `${targetEmp} now at ${totalH.toFixed(1)}h on ${currentDate}. Consider redistributing.`,
                          { icon: '⚠️', duration: 5000 },
                        )
                      }
                    }
                    moveMutation.mutate({
                      id: taskId,
                      task_date: currentDate,
                      start_time: hhmm,
                      employee_name: targetEmp,
                    })
                  }}
                  onTaskUpdate={(taskId, body) => {
                    // Optimistic patch: update the cached query data
                    // immediately so the chip stays where the user
                    // dropped it. The mutation then commits server-
                    // side; on success the invalidate refreshes with
                    // the canonical value. On failure we'd rollback
                    // but the existing patterns (drag-drop, complete)
                    // don't rollback either, so we match that
                    // behaviour — the chip will snap back when the
                    // refetch returns the un-modified row.
                    qc.setQueriesData({ queryKey: ['planner-tasks'] }, (old: any) =>
                      Array.isArray(old) ? old.map((t: any) => t.id === taskId ? { ...t, ...body } : t) : old)
                    updateMutation.mutate({ id: taskId, ...body })
                  }}
                />
              )
            })()}

            {/* Untimed tasks pulled out of the timeline so they don't
                vanish — same width as the timed list, just listed at
                the bottom under a small label. */}
            {tasks.some((t: any) => t.start_time) && tasks.some((t: any) => !t.start_time) && (
              <div className="bg-dark-surface border border-dark-border rounded-xl p-3">
                <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-2">
                  {t('planner.timeline.untimed', 'No specific time')}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {tasks.filter((t: any) => !t.start_time).map((task: any) => {
                    const meta = getGroupMeta(task.task_group)
                    const Icon = meta.icon
                    return (
                      <button key={task.id}
                        onClick={(e) => setTaskPopover({ task, anchor: (e.currentTarget as HTMLElement).getBoundingClientRect() })}
                        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium transition-all hover:scale-[1.02]"
                        style={{
                          background: meta.color + '20',
                          border: '1px solid ' + meta.color + '40',
                          color: meta.color,
                          textDecoration: task.completed ? 'line-through' : 'none',
                          opacity: task.completed ? 0.6 : 1,
                        }}>
                        <Icon size={10} />
                        <span className="truncate max-w-[200px]">{task.title}</span>
                      </button>
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
                // Compact, horizontal empty state. The previous card was
                // p-10 with a w-14 icon tile + centered headline — felt
                // like a dialog blocking the page. This version reads as
                // a one-line prompt: small icon, inline copy, two CTAs.
                // Recovers vertical space so the templates + quick-add
                // below stay in the same viewport.
                <div className="flex items-center justify-between gap-4 bg-dark-surface border border-dark-border rounded-xl px-4 py-3 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{
                        background: 'linear-gradient(135deg, rgba(201,168,76,0.18), rgba(201,168,76,0.04))',
                        border: '1px solid rgba(201,168,76,0.3)',
                      }}>
                      <CalendarDays size={18} className="text-primary-400" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white">{t('planner.empty.no_tasks_today', 'No tasks for this day')}</div>
                      <div className="text-[11px] text-gray-500 leading-snug">
                        {t('planner.empty.hint', 'Start with a quick task or pick from a template below.')}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => openCreate(currentDate)}
                      className="inline-flex items-center gap-1.5 bg-primary-500 hover:bg-primary-400 text-black font-bold px-3 py-1.5 rounded-lg text-xs transition-colors">
                      <Plus size={12} /> {t('planner.empty.create_first', 'Create your first task')}
                    </button>
                    <button onClick={() => setShowTemplatePicker(s => !s)}
                      className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-white px-3 py-1.5 rounded-lg border border-dark-border hover:border-white/20 transition-colors">
                      <FileText size={11} /> {t('planner.empty.use_template', 'Use a template')}
                    </button>
                  </div>
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
                  onDelete={() => deleteWithScope(task)}
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

          {/* Team workload — compact horizontal strip. Only renders when
              we have multiple distinct assignees AND tasks present, so
              single-person days don't show a one-item meta panel. Was a
              vertical sidebar panel before; this layout puts the same
              data on one line so the timeline stays uncramped. */}
          {!employee && tasks.length > 0 && (() => {
            const byEmp = tasks.reduce((acc: any, t: any) => {
              const n = t.employee_name || 'Unassigned'
              if (!acc[n]) acc[n] = { total: 0, done: 0 }
              acc[n].total++; if (t.completed) acc[n].done++
              return acc
            }, {} as Record<string, { total: number; done: number }>)
            const entries = Object.entries(byEmp) as Array<[string, { total: number; done: number }]>
            if (entries.length < 2) return null
            return (
              <div className="bg-dark-surface border border-dark-border rounded-xl px-3 py-2.5">
                <div className="flex items-center gap-2 mb-2">
                  <User size={12} className="text-gray-500" />
                  <span className="text-[10px] uppercase tracking-wider font-bold text-gray-500">{t('planner.team', 'Team workload today')}</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-2">
                  {entries.map(([name, d]) => (
                    <div key={name} className="min-w-0">
                      <div className="flex items-center justify-between mb-0.5 gap-2">
                        <span className="text-xs text-gray-300 truncate">{name}</span>
                        <span className="text-[10px] text-gray-500 tabular-nums flex-shrink-0">{d.done}/{d.total}</span>
                      </div>
                      <ProgressBar done={d.done} total={d.total} />
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}
          </div>

          {/* Right sidebar — mini calendar, donut, Up Next. Renders only
              on lg+ via the parent grid's responsive cols. */}
          <aside className="lg:sticky lg:top-4 lg:self-start">
            <PlannerDaySidebar
              currentDate={currentDate}
              tasks={tasks}
              onDateChange={setCurrentDate}
            />
          </aside>
        </div>
      )}

      {/* ═══ SCHEDULE VIEW (Connecteam-style) ═══ */}
      {tab === 'schedule' && (
        <div className="space-y-4">
          {/* Day note — collapsed by default to recover vertical space
              for the schedule grid. Shows the note inline if one exists;
              otherwise renders as a compact "+ Add note" link. The full
              textarea is opened on click. */}
          <CollapsibleNote
            value={dayNote?.note_text ?? ''}
            weekStart={weekStart}
            placeholder={t('planner.notes.placeholder_today', 'Add notes for today…')}
            label={t('planner.notes.todays_note', "Today's Note")}
            onSave={(text) => upsertNoteMutation.mutate({ note_date: today, note_text: text })}
          />

          {/* Empty state — only the synthetic Unassigned row + no tasks.
              The grid still renders below for the fallback, but this
              gold callout points the user at Settings → Team so they
              know how to populate it. Without this, a fresh org sees an
              eerie one-row table and nothing about how to fix it. */}
          {scheduleEmployees.length === 1 && scheduleEmployees[0] === 'Unassigned' && tasks.length === 0 && (
            <div className="bg-gradient-to-br from-primary-500/10 via-primary-500/[0.04] to-transparent border border-primary-500/30 rounded-xl p-5 flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary-500/20 border border-primary-500/30 flex items-center justify-center flex-shrink-0">
                <User size={18} className="text-primary-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-white">No team members configured yet</div>
                <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">
                  Add staff in Settings → Team so the Schedule grid shows real workload columns. Until then the grid only renders an Unassigned row.
                </p>
              </div>
              {/* Settings → Team is mounted as a tab inside /settings,
                  not a standalone route. `/team` 404'd in production. */}
              <a href="/settings?tab=team" className="px-3 py-1.5 bg-primary-500 hover:bg-primary-400 text-black text-xs font-bold rounded-md flex-shrink-0">
                Add staff
              </a>
            </div>
          )}

          {/* Schedule Grid: employee rows × day columns
              Outer overflow-x-auto + min-width on the grid lets the table
              scroll horizontally on mobile instead of cramming all 8 columns
              (employee + 7 days) into ~375px and rendering each cell unusable. */}
          <div className="bg-dark-surface border border-dark-border rounded-xl overflow-x-auto">
            {/* Header row — left column sticky so the "View by employee"
                label stays put while the user scrolls the day columns
                horizontally on cramped screens. */}
            <div className="grid border-b border-dark-border min-w-[760px]" style={{ gridTemplateColumns: '180px repeat(7, 1fr)' }}>
              <div className="sticky left-0 z-10 bg-dark-surface px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center border-r border-dark-border/30">
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
              // Workload calc: sum of duration_minutes across the
              // week, falling back to a typed default (30 min) when a
              // task has no duration. The bar is normalised against
              // 40h/week (240 / 5 = 8h/day). Over 40h paints red;
              // 80% paints amber. Pure visualisation — no enforcement.
              const totalMinutes = empTasks.reduce((sum: number, t: any) =>
                sum + (Number(t.duration_minutes) || 30), 0)
              const totalHours = totalMinutes / 60
              const loadPct = Math.min(100, (totalHours / 40) * 100)
              const loadColor = totalHours > 40 ? '#ef4444' : totalHours > 32 ? '#f59e0b' : '#22c55e'
              return (
                <div key={emp} className="grid border-b border-dark-border/50 hover:bg-dark-surface2/20 transition-colors min-w-[760px]" style={{ gridTemplateColumns: '180px repeat(7, 1fr)' }}>
                  {/* Employee name cell — sticky left so the name +
                      workload stay visible while horizontally
                      scrolling the day columns. z-10 keeps it above
                      the chips when scrolled. */}
                  <div className="sticky left-0 z-10 bg-dark-surface px-4 py-3 flex flex-col gap-2 border-r border-dark-border/30">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-500/30 to-primary-700/30 flex items-center justify-center text-xs font-bold text-primary-400 flex-shrink-0">
                        {emp.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-white truncate">{emp}</div>
                        {empTasks.length > 0 && (
                          <div className="text-[10px] text-gray-500 mt-0.5">
                            {empTasks.length} task{empTasks.length === 1 ? '' : 's'} · {totalHours.toFixed(1)}h
                          </div>
                        )}
                      </div>
                    </div>
                    {/* Workload bar — only renders when there's something to show.
                        Bar width = % of 40h. Color shifts amber > 32h, red > 40h. */}
                    {empTasks.length > 0 && (
                      <div className="w-full h-1 rounded-full bg-dark-surface2 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${loadPct}%`, background: loadColor }}
                          title={`${totalHours.toFixed(1)}h of 40h capacity`}
                        />
                      </div>
                    )}
                  </div>

                  {/* Day cells */}
                  {weekDates.map((date) => {
                    const dateStr = fmtDate(date)
                    const isToday = dateStr === today
                    const cellTasks = empTasks.filter((t: any) => (t.task_date ?? '').slice(0, 10) === dateStr)
                    const cellId = dateStr + '|' + emp
                    const isDropTarget = dragOverCell === cellId
                    // inline quick-add removed — clicking the "+" now
                    // opens the full new-task drawer instead
                    return (
                      <div key={dateStr}
                        onDragEnter={() => setDragOverCell(cellId)}
                        onDragLeave={(e) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setDragOverCell(null) }}
                        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
                        onDrop={(e) => {
                          e.preventDefault()
                          setDragOverCell(null)
                          const taskId = Number(e.dataTransfer.getData('taskId'))
                          const sourceDate = e.dataTransfer.getData('sourceDate')
                          const sourceEmp = e.dataTransfer.getData('sourceEmp')
                          if (!taskId) return
                          if (dateStr === sourceDate && emp === (sourceEmp || 'Unassigned')) return
                          // Y-coordinate → hour-resolution start_time. The
                          // cell is too small (typically ~72-120px tall)
                          // for minute precision, so we map to a 9am-18pm
                          // working window with hour snapping. Drops in
                          // the top 20% become 9am; in the bottom 20%
                          // become 17pm. Refinable in the task popover.
                          // Skipped when the source is a scheduled chip
                          // (sourceDate !== '') and it already has a
                          // start_time — that case is just a date move,
                          // we preserve the existing time.
                          const cell = e.currentTarget.getBoundingClientRect()
                          const ratio = Math.max(0, Math.min(1, (e.clientY - cell.top) / Math.max(1, cell.height)))
                          const WORK_START = 9, WORK_END = 18 // 9-hour window
                          const hour = WORK_START + Math.round(ratio * (WORK_END - WORK_START))
                          const droppedStart = `${String(hour).padStart(2, '0')}:00`
                          // Only set start_time for backlog drops (sourceDate === '')
                          // or when the source chip has no start_time. Keeps
                          // existing scheduled chips at their original
                          // time on a cross-day drag.
                          const isFromBacklog = !sourceDate
                          const body: any = {
                            id: taskId,
                            task_date: dateStr,
                            employee_name: emp === 'Unassigned' ? null : emp,
                          }
                          if (isFromBacklog) body.start_time = droppedStart
                          // Capacity warning — informational only, doesn't
                          // block. Sums existing task duration for the
                          // target employee + day (excluding the task being
                          // moved so a within-day re-shuffle doesn't fire
                          // a false positive), and warns when the new total
                          // crosses 8h. Default 60min for tasks with no
                          // duration set so we don't undercount. Skipped
                          // for the Unassigned row since "Unassigned" isn't
                          // a real person to over-book.
                          if (emp !== 'Unassigned') {
                            const dropped = allTasks.find((t: any) => t.id === taskId)
                            const newMins = Number(dropped?.duration_minutes ?? 60)
                            const existingMins = (allTasks as any[]).filter(t =>
                              t.id !== taskId
                              && (t.employee_name || '') === emp
                              && (t.task_date ?? '').slice(0, 10) === dateStr
                            ).reduce((sum, t) => sum + Number(t.duration_minutes ?? 60), 0)
                            const totalH = (existingMins + newMins) / 60
                            if (totalH > 8) {
                              const existingH = existingMins / 60
                              toast(
                                `${emp} now at ${totalH.toFixed(1)}h on ${dateStr} (was ${existingH.toFixed(1)}h). Consider redistributing.`,
                                { icon: '⚠️', duration: 5000 },
                              )
                            }
                          }
                          moveMutation.mutate(body)
                        }}
                        className={'px-2 py-2 border-l border-dark-border/30 min-h-[72px] transition-colors ' +
                          (isDropTarget ? 'bg-primary-500/15 ring-1 ring-primary-500/40 ring-inset' : (isToday ? 'bg-primary-500/5' : ''))}>
                        <div className="space-y-1">
                          {cellTasks.map((task: any) => (
                            <div
                              key={task.id}
                              draggable
                              onDragStart={(e) => {
                                e.dataTransfer.effectAllowed = 'move'
                                e.dataTransfer.setData('taskId', String(task.id))
                                e.dataTransfer.setData('sourceDate', dateStr)
                                e.dataTransfer.setData('sourceEmp', emp === 'Unassigned' ? '' : emp)
                              }}
                              className="relative group cursor-grab active:cursor-grabbing">
                              {(() => {
                                /**
                                 * Color the chip by task group: subtle tinted background +
                                 * accent left-border. This is what makes a week-at-a-glance
                                 * scan readable — staff see the visual cluster of housekeeping
                                 * vs maintenance vs F&B before they read any text.
                                 */
                                const meta = getGroupMeta(task.task_group)
                                const Icon = meta.icon
                                return (
                                  <button
                                    onClick={(e) => setTaskPopover({ task, anchor: (e.currentTarget as HTMLElement).getBoundingClientRect() })}
                                    style={task.completed ? {} : { borderLeftColor: meta.color, backgroundColor: meta.color + '18' }}
                                    className={'w-full text-left p-2 rounded-lg transition-all hover:ring-1 border-l-[3px] ' +
                                      (task.completed
                                        ? 'bg-green-500/10 border-green-500 hover:bg-green-500/15 hover:ring-green-500/30'
                                        : 'hover:ring-white/20 hover:brightness-125')}>
                                    {(task.start_time || task.end_time) && (
                                      <div className={'text-xs font-semibold ' + (task.completed ? 'text-green-400' : '')}
                                        style={task.completed ? {} : { color: meta.color }}>
                                        {fmtShort(task.start_time)}{task.end_time ? `-${fmtShort(task.end_time)}` : ''}
                                      </div>
                                    )}
                                    <div className={'flex items-start gap-1 mt-0.5 ' + (task.completed ? 'text-gray-600' : 'text-white')}>
                                      <Icon size={10} className="mt-0.5 flex-shrink-0" style={{ color: meta.color, opacity: task.completed ? 0.5 : 1 }} />
                                      <span className={'text-xs truncate flex-1 ' + (task.completed ? 'line-through' : '')}>
                                        {task.title}
                                      </span>
                                    </div>
                                    {(task.subtasks?.length > 0 || task.priority === 'High') && (
                                      <div className="flex items-center gap-2 mt-1">
                                        {task.subtasks?.length > 0 && (
                                          <span className={'inline-flex items-center gap-0.5 text-[10px] ' + (task.subtasks.every((s: any) => s.is_done) ? 'text-green-400' : 'text-gray-500')}>
                                            <ListChecks size={9} />
                                            {task.subtasks.filter((s: any) => s.is_done).length}/{task.subtasks.length}
                                          </span>
                                        )}
                                        {task.priority === 'High' && (
                                          <span className="inline-flex items-center gap-0.5 text-[10px] text-red-400">
                                            <Flag size={9} /> High
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </button>
                                )
                              })()}
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
                          {/* Quick-add button now opens the full new-task
                              drawer with date + employee pre-filled, so
                              the user gets the proper Type + Group +
                              Priority controls instead of a plain title
                              input. The isQuickAdd state is kept around
                              for backward compatibility but always
                              false now in the Schedule cell path. */}
                          <button
                            onClick={() => openCreate(dateStr, emp === 'Unassigned' ? undefined : emp)}
                            className={'w-full flex items-center justify-center rounded text-gray-700 hover:text-primary-400 transition-colors ' +
                              (cellTasks.length === 0 ? 'min-h-[56px] border border-dashed border-dark-border/30 hover:border-primary-500/40' : 'py-1')}>
                            <Plus size={cellTasks.length === 0 ? 16 : 12} className={cellTasks.length === 0 ? 'opacity-0 group-hover:opacity-100' : ''} />
                          </button>
                        </div>
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
                    <span className="text-sm font-medium text-gray-500 italic">{t('planner.actions.unassigned', 'Unassigned')}</span>
                  </div>
                  {weekDates.map((date) => {
                    const dateStr = fmtDate(date)
                    const isToday = dateStr === today
                    const cellTasks = unassigned.filter((t: any) => (t.task_date ?? '').slice(0, 10) === dateStr)
                    const cellId = dateStr + '|__unassigned'
                    const isDropTarget = dragOverCell === cellId
                    // inline quick-add replaced by full drawer — see
                    // the "+" button at the bottom of this cell
                    return (
                      <div key={dateStr}
                        onDragEnter={() => setDragOverCell(cellId)}
                        onDragLeave={(e) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setDragOverCell(null) }}
                        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
                        onDrop={(e) => {
                          e.preventDefault()
                          setDragOverCell(null)
                          const taskId = Number(e.dataTransfer.getData('taskId'))
                          const sourceDate = e.dataTransfer.getData('sourceDate')
                          const sourceEmp = e.dataTransfer.getData('sourceEmp')
                          if (!taskId) return
                          if (dateStr === sourceDate && !sourceEmp) return
                          moveMutation.mutate({ id: taskId, task_date: dateStr, employee_name: null })
                        }}
                        className={'px-2 py-2 border-l border-dark-border/30 min-h-[72px] transition-colors ' +
                          (isDropTarget ? 'bg-primary-500/15 ring-1 ring-primary-500/40 ring-inset' : (isToday ? 'bg-primary-500/5' : ''))}>
                        <div className="space-y-1">
                          {cellTasks.map((task: any) => (
                            <div
                              key={task.id}
                              draggable
                              onDragStart={(e) => {
                                e.dataTransfer.effectAllowed = 'move'
                                e.dataTransfer.setData('taskId', String(task.id))
                                e.dataTransfer.setData('sourceDate', dateStr)
                                e.dataTransfer.setData('sourceEmp', '')
                              }}
                              className="relative group cursor-grab active:cursor-grabbing">
                              {(() => {
                                const meta = getGroupMeta(task.task_group)
                                const Icon = meta.icon
                                return (
                                  <button
                                    onClick={(e) => setTaskPopover({ task, anchor: (e.currentTarget as HTMLElement).getBoundingClientRect() })}
                                    style={task.completed ? {} : { borderLeftColor: meta.color, backgroundColor: meta.color + '18' }}
                                    className={'w-full text-left p-2 rounded-lg transition-all border-l-[3px] hover:ring-1 hover:ring-white/20 ' +
                                      (task.completed ? 'bg-green-500/10 border-green-500' : '')}>
                                    {(task.start_time || task.end_time) && (
                                      <div className={'text-xs font-semibold ' + (task.completed ? 'text-green-400' : '')}
                                        style={task.completed ? {} : { color: meta.color }}>
                                        {fmtShort(task.start_time)}{task.end_time ? `-${fmtShort(task.end_time)}` : ''}
                                      </div>
                                    )}
                                    <div className={'flex items-start gap-1 mt-0.5 ' + (task.completed ? 'text-gray-600' : 'text-white')}>
                                      <Icon size={10} className="mt-0.5 flex-shrink-0" style={{ color: meta.color, opacity: task.completed ? 0.5 : 1 }} />
                                      <span className={'text-xs truncate flex-1 ' + (task.completed ? 'line-through' : '')}>{task.title}</span>
                                    </div>
                                  </button>
                                )
                              })()}
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
                          {/* Same change as the employee-row quick-add:
                              click → full drawer instead of inline
                              title input, but with no pre-selected
                              employee so the user can pick later. */}
                          <button
                            onClick={() => openCreate(dateStr)}
                            className={'w-full flex items-center justify-center rounded text-gray-700 hover:text-primary-400 transition-colors ' +
                              (cellTasks.length === 0 ? 'min-h-[56px] border border-dashed border-dark-border/20 hover:border-primary-500/40' : 'py-1')}>
                            <Plus size={cellTasks.length === 0 ? 16 : 12} />
                          </button>
                        </div>
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
                const cellId = dateStr + '|__month'
                const isDropTarget = dragOverCell === cellId
                const isQuickAdd = quickAddCell === cellId
                return (
                  <div key={di}
                    onClick={() => { if (!isQuickAdd) { setCurrentDate(dateStr); setTab('day') } }}
                    onDragEnter={() => setDragOverCell(cellId)}
                    onDragLeave={(e) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setDragOverCell(null) }}
                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
                    onDrop={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setDragOverCell(null)
                      const taskId = Number(e.dataTransfer.getData('taskId'))
                      const sourceDate = e.dataTransfer.getData('sourceDate')
                      if (!taskId || dateStr === sourceDate) return
                      moveMutation.mutate({ id: taskId, task_date: dateStr })
                    }}
                    className={'min-h-[100px] rounded-lg border p-2 cursor-pointer transition-all hover:border-primary-500/40 hover:shadow-lg group/cell ' +
                      (isDropTarget ? 'border-primary-500 bg-primary-500/15 ring-2 ring-primary-500/40' :
                        (isToday ? 'border-primary-500/50 bg-primary-500/5' : 'border-dark-border/40 bg-dark-surface2/20 hover:bg-dark-surface2/40'))}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className={'text-xs font-bold ' + (isToday ? 'text-primary-400 bg-primary-500/10 w-6 h-6 rounded-full flex items-center justify-center' : 'text-gray-400')}>{date.getDate()}</span>
                      <div className="flex items-center gap-1">
                        {dayTasks.length > 0 && <span className={'text-[9px] font-semibold ' + (done === dayTasks.length ? 'text-green-400' : 'text-gray-600')}>{done}/{dayTasks.length}</span>}
                        <button
                          onClick={(e) => { e.stopPropagation(); setQuickAddCell(cellId) }}
                          className="opacity-0 group-hover/cell:opacity-100 transition-opacity p-0.5 rounded hover:bg-primary-500/20 text-gray-500 hover:text-primary-400"
                          title={t('planner.actions.quick_add', 'Quick add')}>
                          <Plus size={11} />
                        </button>
                      </div>
                    </div>
                    {isQuickAdd ? (
                      <div onClick={(e) => e.stopPropagation()}>
                        <InlineQuickAdd
                          autoFocus
                          onSubmit={(title) => { handleQuickCreate(title, dateStr); setQuickAddCell(null) }}
                          onCancel={() => setQuickAddCell(null)}
                        />
                      </div>
                    ) : (
                      <div className="space-y-0.5">
                        {dayTasks.slice(0, 3).map((t: any) => {
                          const tMeta = getGroupMeta(t.task_group)
                          return (
                            <div
                              key={t.id}
                              draggable
                              onDragStart={(e) => {
                                e.stopPropagation()
                                e.dataTransfer.effectAllowed = 'move'
                                e.dataTransfer.setData('taskId', String(t.id))
                                e.dataTransfer.setData('sourceDate', dateStr)
                                e.dataTransfer.setData('sourceEmp', t.employee_name || '')
                              }}
                              onClick={(e) => {
                                e.stopPropagation()
                                setTaskPopover({ task: t, anchor: (e.currentTarget as HTMLElement).getBoundingClientRect() })
                              }}
                              className="flex items-center gap-1 rounded px-1 py-0.5 cursor-grab active:cursor-grabbing hover:bg-primary-500/15 transition-colors"
                              style={{ borderLeft: `2px solid ${tMeta.color}`, paddingLeft: 4 }}>
                              <span className={'text-[10px] truncate ' + (t.completed ? 'text-gray-600 line-through' : 'text-gray-300')}>{t.title}</span>
                            </div>
                          )
                        })}
                        {dayTasks.length > 3 && <div className="text-[10px] text-gray-600 pl-3">+{dayTasks.length - 3} more</div>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}

      {/* ═══ TEAM VIEW (manager-only) ═══
          Full-width cross-employee bucket kanban — the same data the
          drawer's old "team mode" rendered at 720px wide, now promoted
          to its own page-level view so the schedule isn't squeezed off
          the right edge. Renders TeamBucketsView which fetches
          ['planner-backlog','team'] and reuses the BacklogCard styling. */}
      {tab === 'team' && (
        <TeamBucketsView
          currentUserId={user?.id ?? null}
          invalidate={() => {
            qc.invalidateQueries({ queryKey: ['planner-tasks']   })
            qc.invalidateQueries({ queryKey: ['planner-backlog'] })
            qc.invalidateQueries({ queryKey: ['planner-stats']   })
          }}
        />
      )}

      {/* ═══ STATS VIEW ═══ */}
      {tab === 'stats' && (
        <div className="space-y-5">
          <div className="flex gap-3 items-end flex-wrap">
            <div><label className="block text-xs text-gray-400 mb-1">{t('planner.stats.from', 'From')}</label><input type="date" value={statsFrom} onChange={e => setStatsFrom(e.target.value)} className={filterSel} /></div>
            <div><label className="block text-xs text-gray-400 mb-1">{t('planner.stats.to', 'To')}</label><input type="date" value={statsTo} onChange={e => setStatsTo(e.target.value)} className={filterSel} /></div>
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
                  <h2 className="text-sm font-semibold text-white mb-4">{t('planner.stats.by_employee', 'By Employee')}</h2>
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
                  ) : <div className="h-[260px] flex items-center justify-center text-gray-600 text-sm">{t('planner.empty.no_data', 'No data')}</div>}
                </div>
                <div className="bg-dark-surface border border-dark-border rounded-xl p-5">
                  <h2 className="text-sm font-semibold text-white mb-4">{t('planner.stats.by_group', 'By Group')}</h2>
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
                  ) : <div className="h-[260px] flex items-center justify-center text-gray-600 text-sm">{t('planner.empty.no_data', 'No data')}</div>}
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
            <h2 className="text-lg font-semibold text-white mb-4">{t('planner.duplicate_modal.title', 'Duplicate Task')}</h2>
            <form onSubmit={e => { e.preventDefault(); const fd = new FormData(e.target as HTMLFormElement); copyMutation.mutate({ id: copyTarget.taskId, task_date: fd.get('task_date'), employee_name: fd.get('employee_name') ?? '' }) }} className="space-y-4">
              <div><label className="block text-xs font-medium text-gray-400 mb-1.5">{t('planner.duplicate_modal.target_date', 'Target Date')}</label><input required type="date" name="task_date" defaultValue={copyTarget.date} className={inp} /></div>
              <div><label className="block text-xs font-medium text-gray-400 mb-1.5">{t('planner.duplicate_modal.assign_to', 'Assign To')}</label>
                <select name="employee_name" className={inp}><option value="">{t('planner.duplicate_modal.keep_original', 'Keep original')}</option>{assignableEmployees.map((e: string) => <option key={e}>{e}</option>)}</select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setCopyTarget(null)} className="px-4 py-2.5 text-sm text-gray-400 hover:text-white rounded-lg hover:bg-dark-surface2 transition-colors">{t('actions.cancel', 'Cancel')}</button>
                <button type="submit" disabled={copyMutation.isPending} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm rounded-lg disabled:opacity-50 transition-colors">{copyMutation.isPending ? 'Duplicating...' : 'Duplicate'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══ MOVE MODAL ═══ */}
      {/* Auto-plan preview modal — opens after runAutoPlan resolves.
          Shows a proposal row per fitted task and any that couldn't
          fit. The user accepts the whole plan with Apply; nothing
          mutates until then. */}
      {autoPlan && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setAutoPlan(null)}>
          <div className="bg-dark-surface border border-dark-border rounded-2xl w-full max-w-lg p-6 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.35)' }}>
                <Sparkles size={18} className="text-purple-300" />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-white">Auto-plan for {currentDate}</h2>
                <p className="text-xs text-t-secondary mt-0.5">
                  Fitted into your {autoPlan.work.start}–{autoPlan.work.end} window in priority order. Already-scheduled tasks are skipped. Click Apply to commit.
                </p>
              </div>
            </div>

            {autoPlan.proposals.length === 0 ? (
              <div className="text-center py-10 text-sm text-t-secondary">
                No unscheduled tasks to fit. You're all set.
              </div>
            ) : (
              <div className="space-y-2 mb-4">
                {autoPlan.proposals.map(p => {
                  const meta = getGroupMeta(p.task_group ?? '')
                  const Icon = meta.icon
                  return (
                    <div key={p.task_id}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg border"
                      style={{ borderColor: meta.color + '40', background: meta.color + '10' }}>
                      <span className="text-xs font-mono font-bold flex-shrink-0" style={{ color: meta.color, minWidth: 50 }}>
                        {p.start_time}
                      </span>
                      <Icon size={14} style={{ color: meta.color }} className="flex-shrink-0" />
                      <span className="flex-1 text-sm text-white truncate">{p.title}</span>
                      <span className="text-[10px] text-gray-400 flex-shrink-0">{p.duration_minutes}m</span>
                      {p.priority === 'High' && (
                        <Flag size={11} className="text-red-400 flex-shrink-0" />
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {autoPlan.skipped.length > 0 && (
              <div className="mb-4 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30">
                <p className="text-[11px] font-bold uppercase tracking-wider text-amber-300 mb-1">
                  {autoPlan.skipped.length} task{autoPlan.skipped.length === 1 ? '' : 's'} didn't fit
                </p>
                <ul className="text-xs text-amber-200/80 space-y-0.5">
                  {autoPlan.skipped.map(s => (
                    <li key={s.task_id}>· {s.title} — {s.reason}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-dark-border">
              <button onClick={() => setAutoPlan(null)}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white rounded-lg hover:bg-dark-surface2 transition-colors">
                Cancel
              </button>
              {autoPlan.proposals.length > 0 && (
                <button onClick={applyAutoPlan} disabled={autoPlanApplying}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-purple-500 hover:bg-purple-400 text-white font-semibold text-sm rounded-lg disabled:opacity-50 transition-colors">
                  <Sparkles size={13} />
                  {autoPlanApplying ? 'Applying…' : `Apply ${autoPlan.proposals.length} task${autoPlan.proposals.length === 1 ? '' : 's'}`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {moveTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setMoveTarget(null)}>
          <div className="bg-dark-surface border border-dark-border rounded-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-white mb-4">{t('planner.move_modal.title', 'Move Task')}</h2>
            <form onSubmit={e => { e.preventDefault(); const fd = new FormData(e.target as HTMLFormElement); moveMutation.mutate({ id: moveTarget.taskId, task_date: fd.get('task_date'), employee_name: fd.get('employee_name') || undefined }) }} className="space-y-4">
              <div><label className="block text-xs font-medium text-gray-400 mb-1.5">{t('planner.move_modal.new_date', 'New Date')}</label><input required type="date" name="task_date" defaultValue={moveTarget.date} className={inp} /></div>
              <div><label className="block text-xs font-medium text-gray-400 mb-1.5">{t('planner.move_modal.reassign', 'Reassign')}</label>
                <select name="employee_name" className={inp}><option value="">{t('planner.move_modal.keep_current', 'Keep current')}</option>{assignableEmployees.map((e: string) => <option key={e}>{e}</option>)}</select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setMoveTarget(null)} className="px-4 py-2.5 text-sm text-gray-400 hover:text-white rounded-lg hover:bg-dark-surface2 transition-colors">{t('actions.cancel', 'Cancel')}</button>
                <button type="submit" disabled={moveMutation.isPending} className="px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-semibold text-sm rounded-lg disabled:opacity-50 transition-colors">{moveMutation.isPending ? 'Moving...' : 'Move'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══ CREATE/EDIT MODAL ═══ */}
      {showModal && (() => {
        /**
         * New layout: side drawer mirroring the CRM TaskDrawer
         * pattern — type icon-grid → title → assign → date/priority →
         * time slots + duration chips → recurring → notes. Fewer
         * dropdowns and chunky chips so a non-expert can compose a
         * fully-specified task in <10 seconds.
         */
        const close = () => { setShowModal(false); setEditTask(null); setForm({ ...EMPTY_FORM }) }

        const setDuration = (mins: number) => {
          setForm(f => ({
            ...f,
            duration_minutes: String(mins),
            // Auto-compute end_time if a start_time is set. Otherwise
            // leave it blank — user might be back-filling the end.
            end_time: f.start_time ? addMinutes(f.start_time, mins) : f.end_time,
          }))
        }
        const setStartTime = (t: string) => {
          setForm(f => ({
            ...f,
            start_time: t,
            // Keep end_time consistent with duration when a duration
            // is already chosen — staff almost never need to picker
            // both start AND end manually.
            end_time: f.duration_minutes ? addMinutes(t, Number(f.duration_minutes)) : f.end_time,
          }))
        }
        const setDateQuick = (offset: number) => {
          const d = new Date(); d.setDate(d.getDate() + offset)
          setForm(f => ({ ...f, task_date: fmtDate(d) }))
        }

        // Pull the live group list from settings so the drawer
        // mirrors whatever the admin configured in Settings → Planner.
        // Always include "Custom" as the bottom-row fallback for tasks
        // that don't fit a configured group.
        const groups = [...(settings.planner_groups || []), 'Custom']
        const activeMeta = getGroupMeta(form.task_group)
        // The Task picker shows only tasks tagged to the selected group;
        // untagged tasks (groups: []) are universal and show for every group
        // (incl. "Custom", where task_group is '').
        const visibleTasks = taskChannels.filter(c => {
          const g = c.groups ?? []
          if (g.length === 0) return true
          return form.task_group ? g.includes(form.task_group) : false
        })
        // Preferred groups/tasks for the assigned employee — highlighted
        // (amber) in the pickers below. Soft hint only; any choice is allowed.
        const empPref = form.employee_name ? employeePrefs[form.employee_name] : undefined
        const prefGroups = empPref?.groups ?? []
        const prefTasks = empPref?.tasks ?? []

        return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex justify-end" onClick={close}>
          <div className="bg-dark-surface border-l border-dark-border w-full max-w-md h-full flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-dark-border">
              <h2 className="text-lg font-bold text-white">{editTask ? 'Edit task' : 'New task'}</h2>
              <button onClick={close} className="p-1.5 rounded hover:bg-dark-surface2 text-gray-500 hover:text-white"><X size={16} /></button>
            </div>

            <form onSubmit={e => { e.preventDefault(); handleSubmit() }} className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Type / Group icon grid */}
              <div>
                <label className="text-[10px] uppercase tracking-wide font-bold text-gray-500 mb-1.5 block">{t('planner.drawer.type_label', 'Type')}</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {groups.map(g => {
                    const meta = getGroupMeta(g)
                    const active = (form.task_group || 'Custom') === g
                    const Icon = meta.icon
                    return (
                      <button key={g} type="button"
                        onClick={() => setForm(f => {
                          const ng = g === 'Custom' ? '' : g
                          // Drop the chosen task if it isn't available for the new group.
                          const keep = taskChannels.some(c => c.key === f.task_category &&
                            ((c.groups ?? []).length === 0 || (!!ng && (c.groups ?? []).includes(ng))))
                          return { ...f, task_group: ng, task_category: keep ? f.task_category : '' }
                        })}
                        className={'relative flex flex-col items-center gap-1 p-2 rounded-md border text-[11px] font-bold transition ' +
                          (active ? 'text-black'
                            : prefGroups.includes(g) ? 'text-amber-200 border-amber-400/50 bg-amber-400/10 hover:bg-amber-400/15'
                            : 'text-gray-400 border-dark-border hover:bg-dark-surface2')}
                        style={active ? { background: meta.color, borderColor: meta.color } : {}}>
                        {prefGroups.includes(g) && <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-400" title={`Fits ${form.employee_name}`} />}
                        <Icon size={14} />
                        {g}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Task — the specific task within the selected group. Reads from
                  settings.planner_channels (the "Tasks" editor in Settings →
                  Planner) filtered to tasks tagged to the chosen group; untagged
                  tasks show under every group. Stored in task_category as the
                  task's stable `key`. */}
              {visibleTasks.length > 0 && (
              <div>
                <label className="text-[10px] uppercase tracking-wide font-bold text-gray-500 mb-1.5 block">{t('planner.drawer.task_label', 'Task')}</label>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                  {visibleTasks.map(c => {
                    const active = (form.task_category || '') === c.key
                    const Icon = getIcon(c.icon)
                    return (
                      <button key={c.key} type="button"
                        onClick={() => setForm(f => ({ ...f, task_category: active ? '' : c.key }))}
                        className={'relative flex flex-col items-center gap-0.5 p-1.5 rounded-md border text-[10px] font-semibold transition ' +
                          (active ? 'text-black'
                            : prefTasks.includes(c.key) ? 'text-amber-200 border-amber-400/50 bg-amber-400/10 hover:bg-amber-400/15'
                            : 'text-gray-400 border-dark-border hover:bg-dark-surface2')}
                        style={active ? { background: c.color, borderColor: c.color } : {}}>
                        {prefTasks.includes(c.key) && <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-amber-400" title={`Fits ${form.employee_name}`} />}
                        <Icon size={13} />
                        {c.label}
                      </button>
                    )
                  })}
                </div>
              </div>
              )}

              {/* Template picker — collapsed by default */}
              {!editTask && formTemplates.length > 0 && (
                <div>
                  <button type="button" onClick={() => setShowTemplatePicker(v => !v)}
                    className="flex items-center gap-1.5 text-xs text-primary-400 hover:text-primary-300 transition-colors">
                    <FileText size={12} />
                    {showTemplatePicker ? 'Hide templates' : 'Use a template'}
                    <ChevronDown size={11} className={'transition-transform ' + (showTemplatePicker ? 'rotate-180' : '')} />
                  </button>
                  {showTemplatePicker && (
                    <div className="mt-2 border border-dark-border rounded-md overflow-hidden max-h-40 overflow-y-auto">
                      {Object.entries(
                        formTemplates.reduce<Record<string, ServerTemplate[]>>((acc, t) => {
                          const k = t.category || 'General'
                          ;(acc[k] ||= []).push(t)
                          return acc
                        }, {})
                      ).map(([cat, items]) => (
                        <div key={cat}>
                          <div className="px-2 py-1 bg-dark-surface text-[10px] font-bold text-gray-500 uppercase tracking-wider border-b border-dark-border/50">{cat}</div>
                          <div className="flex flex-wrap gap-1 p-1.5 bg-dark-surface2/30">
                            {items.map(t => (
                              <button type="button" key={t.id} onClick={() => applyTemplate(t)}
                                className="px-2 py-0.5 rounded bg-dark-surface border border-dark-border text-[11px] text-gray-300 hover:bg-primary-500/15 hover:border-primary-500/40 hover:text-primary-300 transition-all">
                                {t.name}
                                {t.duration_minutes ? <span className="ml-1 text-gray-600">{t.duration_minutes}m</span> : null}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Title */}
              <div>
                <label className="text-[10px] uppercase tracking-wide font-bold text-gray-500 mb-1.5 block">{t('planner.drawer.title_label', 'Title')}</label>
                <input required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder={t('planner.drawer.title_placeholder', 'What needs to be done?')}
                  autoFocus={!editTask}
                  className="w-full bg-dark-bg border border-dark-border rounded-md px-3 py-2 text-sm placeholder-gray-600 outline-none focus:border-primary-500" />
              </div>

              {/* Assign + Priority chip rows */}
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide font-bold text-gray-500 mb-1.5"><User size={11} /> Assign to</label>
                  <select value={form.employee_name} onChange={e => setForm(f => ({ ...f, employee_name: e.target.value }))}
                    className="w-full bg-dark-bg border border-dark-border rounded-md px-3 py-2 text-sm outline-none focus:border-primary-500">
                    <option value="">{t('planner.drawer.unassigned_option', 'Unassigned')}</option>
                    {myName && <option value={myName}>{myName} (me)</option>}
                    {assignableEmployees.filter((e: string) => e !== myName).map((emp: string) => <option key={emp}>{emp}</option>)}
                  </select>
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide font-bold text-gray-500 mb-1.5"><Flag size={11} /> Priority</label>
                  <div className="flex gap-1.5">
                    {['Low', 'Normal', 'High'].map(p => {
                      const active = form.priority === p
                      return (
                        <button key={p} type="button" onClick={() => setForm(f => ({ ...f, priority: p }))}
                          className={'flex-1 px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors ' +
                            (active
                              ? p === 'High' ? 'bg-red-500/20 border-red-500/60 text-red-300'
                                : p === 'Low' ? 'bg-gray-500/20 border-gray-500/60 text-gray-300'
                                : 'bg-blue-500/20 border-blue-500/60 text-blue-300'
                              : 'border-dark-border text-gray-500 hover:text-white hover:bg-dark-surface2')}>
                          {p}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Date with quick chips */}
              <div>
                <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide font-bold text-gray-500 mb-1.5"><Calendar size={11} /> Date</label>
                <input type="date" required value={form.task_date} onChange={e => setForm(f => ({ ...f, task_date: e.target.value }))}
                  className="w-full bg-dark-bg border border-dark-border rounded-md px-3 py-2 text-sm outline-none focus:border-primary-500" />
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  {[{ off: 0, lbl: 'Today' }, { off: 1, lbl: 'Tomorrow' }, { off: 2, lbl: 'In 2 days' }, { off: 7, lbl: 'Next week' }].map(d => (
                    <button key={d.lbl} type="button" onClick={() => setDateQuick(d.off)}
                      className="text-[11px] px-2 py-1 rounded bg-dark-bg border border-dark-border text-gray-500 hover:text-white hover:border-dark-border/80">
                      {d.lbl}
                    </button>
                  ))}
                </div>
              </div>

              {/* Start time — 30min slots, 24h labels (07:00 → 21:00). */}
              <div>
                <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide font-bold text-gray-500 mb-1.5"><Clock size={11} /> Start time</label>
                <div className="grid grid-cols-6 gap-1 max-h-32 overflow-y-auto p-1 bg-dark-bg border border-dark-border rounded-md">
                  {TIME_SLOTS.map(t => {
                    const active = form.start_time && form.start_time.slice(0, 5) === t
                    return (
                      <button key={t} type="button" onClick={() => setStartTime(t)}
                        className={'px-1.5 py-1 rounded text-[11px] font-mono tabular-nums transition-colors ' +
                          (active ? 'bg-primary-500 text-white' : 'text-gray-400 hover:bg-dark-surface2 hover:text-white')}>
                        {t}
                      </button>
                    )
                  })}
                </div>
                {form.start_time && (
                  <button type="button" onClick={() => setForm(f => ({ ...f, start_time: '', end_time: '' }))}
                    className="mt-1 text-[10px] text-gray-600 hover:text-gray-400">
                    Clear time
                  </button>
                )}
              </div>

              {/* Duration chips */}
              <div>
                <label className="text-[10px] uppercase tracking-wide font-bold text-gray-500 mb-1.5 block">{t('planner.drawer.duration_label', 'Duration')}</label>
                <div className="flex flex-wrap gap-1.5">
                  {DURATION_CHIPS.map(d => {
                    const active = Number(form.duration_minutes) === d.minutes
                    return (
                      <button key={d.minutes} type="button" onClick={() => setDuration(d.minutes)}
                        className={'px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors ' +
                          (active ? 'bg-primary-500 border-primary-500 text-white' : 'border-dark-border text-gray-400 hover:bg-dark-surface2 hover:text-white')}>
                        {d.label}
                      </button>
                    )
                  })}
                  <button type="button" onClick={() => setForm(f => ({ ...f, duration_minutes: '', end_time: '' }))}
                    className="px-2 py-1.5 rounded-md text-[11px] text-gray-600 hover:text-gray-400">
                    Clear
                  </button>
                </div>
                {form.start_time && form.end_time && (
                  <div className="mt-2 text-[11px] text-gray-500 flex items-center gap-1.5">
                    <activeMeta.icon size={11} style={{ color: activeMeta.color }} />
                    {fmtShort(form.start_time)} — {fmtShort(form.end_time)}
                  </div>
                )}
              </div>

              {/* Recurring */}
              <div>
                <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide font-bold text-gray-500 mb-1.5"><Repeat size={11} /> Repeat</label>
                <div className="flex gap-1.5 flex-wrap">
                  {[{ k: 'none', l: 'No repeat' }, { k: 'daily', l: 'Daily' }, { k: 'weekly', l: 'Weekly' }, { k: 'monthly', l: 'Monthly' }].map(r => {
                    const active = (form.recurring || 'none') === r.k
                    return (
                      <button key={r.k} type="button" onClick={() => setForm(f => ({ ...f, recurring: r.k }))}
                        className={'px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ' +
                          (active ? 'bg-primary-500/20 border-primary-500/60 text-primary-300' : 'border-dark-border text-gray-500 hover:text-white hover:bg-dark-surface2')}>
                        {r.l}
                      </button>
                    )
                  })}
                </div>
                {form.recurring && form.recurring !== 'none' && (
                  <div className="mt-2">
                    <label className="text-[10px] uppercase tracking-wide font-bold text-gray-500 mb-1 block">{t('planner.drawer.repeat_until_label', 'Repeat until (optional)')}</label>
                    <input type="date" value={form.recurring_end_date || ''}
                      onChange={e => setForm(f => ({ ...f, recurring_end_date: e.target.value }))}
                      className="w-full bg-dark-bg border border-dark-border rounded-md px-3 py-2 text-sm outline-none focus:border-primary-500" />
                  </div>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="text-[10px] uppercase tracking-wide font-bold text-gray-500 mb-1.5 block">Notes (optional)</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={3} placeholder={t('planner.drawer.description_placeholder', 'Anything the staff picking this up should know.')}
                  className="w-full bg-dark-bg border border-dark-border rounded-md px-3 py-2 text-sm placeholder-gray-600 outline-none focus:border-primary-500 resize-none" />
              </div>

              {/* Status — collapsed in edit mode only since new tasks default to "todo" */}
              {editTask && (
                <div>
                  <label className="text-[10px] uppercase tracking-wide font-bold text-gray-500 mb-1.5 block">Status</label>
                  <div className="flex gap-1.5 flex-wrap">
                    {[{ k: 'todo', l: 'To Do' }, { k: 'in_progress', l: 'In Progress' }, { k: 'blocked', l: 'Blocked' }, { k: 'done', l: 'Done' }].map(s => {
                      const active = form.status === s.k
                      return (
                        <button key={s.k} type="button" onClick={() => setForm(f => ({ ...f, status: s.k }))}
                          className={'px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ' +
                            (active ? 'bg-dark-surface2 border-primary-500/60 text-white' : 'border-dark-border text-gray-500 hover:text-white')}>
                          {s.l}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </form>

            <div className="border-t border-dark-border p-4 flex justify-end gap-2">
              <button onClick={close} className="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
              <button onClick={handleSubmit}
                disabled={createMutation.isPending || updateMutation.isPending || !form.title.trim()}
                className="bg-primary-500 hover:bg-primary-400 text-white font-bold rounded-md px-4 py-2 text-sm disabled:opacity-50 transition-colors">
                {(createMutation.isPending || updateMutation.isPending) ? 'Saving…' : editTask ? 'Update task' : 'Create task'}
              </button>
            </div>
          </div>
        </div>
        )
      })()}

      {taskPopover && (
        <TaskPopover
          task={taskPopover.task}
          anchor={taskPopover.anchor}
          onClose={() => setTaskPopover(null)}
          onRename={(title) => updateMutation.mutate({ id: taskPopover.task.id, title })}
          onTogglePriority={(priority) => {
            qc.setQueriesData({ queryKey: ['planner-tasks'] }, (old: any) =>
              Array.isArray(old) ? old.map((t: any) => t.id === taskPopover.task.id ? { ...t, priority } : t) : old)
            setTaskPopover(p => p ? { ...p, task: { ...p.task, priority } } : null)
            api.put('/v1/admin/planner/tasks/' + taskPopover.task.id, { priority })
              .then(() => qc.invalidateQueries({ queryKey: ['planner-tasks'] }))
              .catch(() => { toast.error('Could not change priority'); qc.invalidateQueries({ queryKey: ['planner-tasks'] }) })
          }}
          onComplete={() => { completeMutation.mutate(taskPopover.task.id); setTaskPopover(null) }}
          onFullEdit={() => { const t = taskPopover.task; setTaskPopover(null); openEdit(t) }}
          onDelete={() => { const t = taskPopover.task; setTaskPopover(null); deleteWithScope(t) }}
          onDuplicate={(toDate) => {
            copyMutation.mutate({ id: taskPopover.task.id, task_date: toDate, employee_name: taskPopover.task.employee_name ?? '' })
            setTaskPopover(null)
          }}
          onReschedule={(toDate) => {
            moveMutation.mutate({ id: taskPopover.task.id, task_date: toDate, employee_name: taskPopover.task.employee_name ?? undefined })
            setTaskPopover(null)
          }}
        />
      )}

      {/* Recurring-delete scope picker. Replaces the previous window.prompt
          with three numbered choices, which felt out of place next to the
          rest of the SPA. Each button labels its impact explicitly so the
          user can't pick the wrong scope by counting wrong. */}
      {recurringDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setRecurringDelete(null)}>
          <div className="bg-dark-surface border border-dark-border rounded-xl p-5 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-red-500/15 border border-red-500/30 flex items-center justify-center flex-shrink-0">
                <Trash2 size={18} className="text-red-400" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold text-white">Delete recurring task</h3>
                <p className="text-xs text-gray-500 mt-0.5 truncate" title={recurringDelete.title}>
                  {recurringDelete.title}
                </p>
              </div>
            </div>
            <p className="text-xs text-gray-400 leading-relaxed mb-4">
              This task is part of a recurring series. Pick what you want to delete:
            </p>
            <div className="space-y-2">
              <button
                onClick={() => { deleteMutation.mutate({ id: recurringDelete.id, scope: 'just_this' }); setRecurringDelete(null) }}
                className="w-full text-left px-3 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition group"
              >
                <div className="text-sm font-medium text-white group-hover:text-primary-300">Just this occurrence</div>
                <div className="text-[11px] text-gray-500 mt-0.5">Future copies stay scheduled.</div>
              </button>
              <button
                onClick={() => { deleteMutation.mutate({ id: recurringDelete.id, scope: 'all_future' }); setRecurringDelete(null) }}
                className="w-full text-left px-3 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition group"
              >
                <div className="text-sm font-medium text-white group-hover:text-amber-300">This + all future occurrences</div>
                <div className="text-[11px] text-gray-500 mt-0.5">Past occurrences are kept; the series stops here.</div>
              </button>
              <button
                onClick={() => { deleteMutation.mutate({ id: recurringDelete.id, scope: 'whole_series' }); setRecurringDelete(null) }}
                className="w-full text-left px-3 py-2.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 transition group"
              >
                <div className="text-sm font-medium text-red-300">Delete the WHOLE series</div>
                <div className="text-[11px] text-red-400/70 mt-0.5">Removes every past + future occurrence. Cannot be undone.</div>
              </button>
            </div>
            <button
              onClick={() => setRecurringDelete(null)}
              className="w-full mt-3 px-3 py-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] text-xs text-gray-400"
            >
              Cancel — keep everything
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
