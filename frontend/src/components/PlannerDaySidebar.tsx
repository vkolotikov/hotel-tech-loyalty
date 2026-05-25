import { useMemo } from 'react'
import { ChevronLeft, ChevronRight, CheckCircle2, PlayCircle, AlertCircle, Circle, Clock } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'

type Task = {
  id: number
  title: string
  task_date?: string | null
  start_time?: string | null
  duration_minutes?: number | null
  task_group?: string | null
  status?: string | null
  priority?: string | null
  completed?: boolean
  employee_name?: string | null
}

interface Props {
  /** ISO date string (Y-m-d) that the calendar centers on. */
  currentDate: string
  /** Today's tasks (post-filter slice — same array the timeline renders). */
  tasks: Task[]
  /** Called when the user picks a date from the mini-calendar. */
  onDateChange: (dateStr: string) => void
}

/**
 * Right sidebar for the Planner Day view. Three stacked widgets:
 *
 *   1. Mini calendar — month grid of the current date's month, with
 *      today highlighted, the selected date marked, and dots on dates
 *      that have any tasks scheduled. Click any date to jump.
 *
 *   2. Task summary donut — centered total + four-segment breakdown
 *      (Completed / In Progress / Overdue / To Do) with counts +
 *      percentages. Visual complement to the KPI strip's tabular
 *      view at the top of the page.
 *
 *   3. Up Next — next 3 scheduled tasks for today after the current
 *      time, ordered by start_time. Hides when there's nothing
 *      upcoming so it doesn't dangle a useless panel.
 *
 * Render only on Day view (parent gates this), only on md+ screens
 * (the parent uses md:block / hidden so it folds away on mobile).
 */
export function PlannerDaySidebar({ currentDate, tasks, onDateChange }: Props) {
  return (
    <div className="space-y-4">
      <MiniCalendar currentDate={currentDate} tasks={tasks} onDateChange={onDateChange} />
      <TaskSummaryDonut tasks={tasks} />
      <UpNext currentDate={currentDate} tasks={tasks} />
    </div>
  )
}

/* ───────────────────────── Mini calendar ───────────────────────── */

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

function MiniCalendar({ currentDate, tasks, onDateChange }: { currentDate: string; tasks: Task[]; onDateChange: (d: string) => void }) {
  const current = new Date(currentDate + 'T00:00:00')
  const year = current.getFullYear()
  const month = current.getMonth()
  const today = new Date()
  const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  // ISO date strings that have ANY task in the current scope. Used to
  // dot the calendar cells so the user sees their busy days at a glance.
  // (Only considers tasks for this month — we don't have other months
  // loaded in the parent's `tasks` prop, but that's OK because Day view
  // queries today only; future enhancement could fetch a month range.)
  const taskDates = useMemo(() => {
    const s = new Set<string>()
    for (const t of tasks) if (t.task_date) s.add(String(t.task_date).slice(0, 10))
    return s
  }, [tasks])

  // Build the grid (Monday-first). Pad the first row with the trailing
  // days of the previous month, the last row with the leading days of
  // the next month, so the grid is always 6 rows × 7 columns.
  const firstOfMonth = new Date(year, month, 1)
  const lastOfMonth = new Date(year, month + 1, 0)
  const startWeekday = (firstOfMonth.getDay() + 6) % 7 // Mon=0 .. Sun=6
  const totalDays = lastOfMonth.getDate()
  const cells: Array<{ date: Date; inMonth: boolean }> = []
  // Leading prev-month days
  const prevLast = new Date(year, month, 0).getDate()
  for (let i = startWeekday - 1; i >= 0; i--) {
    cells.push({ date: new Date(year, month - 1, prevLast - i), inMonth: false })
  }
  // Current month days
  for (let d = 1; d <= totalDays; d++) {
    cells.push({ date: new Date(year, month, d), inMonth: true })
  }
  // Trailing next-month days to fill 42 cells (6 weeks)
  while (cells.length < 42) {
    const last = cells[cells.length - 1].date
    const next = new Date(last)
    next.setDate(last.getDate() + 1)
    cells.push({ date: next, inMonth: false })
  }

  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  const stepMonth = (delta: number) => {
    const next = new Date(year, month + delta, Math.min(current.getDate(), 28))
    onDateChange(fmt(next))
  }

  return (
    <div className="bg-dark-surface border border-dark-border rounded-xl p-3">
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => stepMonth(-1)} className="w-6 h-6 rounded hover:bg-white/5 text-gray-400 flex items-center justify-center">
          <ChevronLeft size={14} />
        </button>
        <span className="text-sm font-semibold text-white tabular-nums">
          {MONTH_NAMES[month]} {year}
        </span>
        <button onClick={() => stepMonth(1)} className="w-6 h-6 rounded hover:bg-white/5 text-gray-400 flex items-center justify-center">
          <ChevronRight size={14} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {WEEKDAY_LABELS.map((w, i) => (
          <div key={w} className={'text-center text-[10px] font-bold uppercase ' + (i >= 5 ? 'text-primary-400/70' : 'text-gray-600')}>
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((c, i) => {
          const iso = fmt(c.date)
          const isToday = iso === todayISO
          const isSelected = iso === currentDate
          const hasTask = taskDates.has(iso)
          return (
            <button
              key={i}
              onClick={() => onDateChange(iso)}
              className={[
                'relative h-8 rounded-md text-xs font-medium transition tabular-nums',
                !c.inMonth && 'text-gray-700',
                c.inMonth && !isSelected && !isToday && 'text-gray-300 hover:bg-white/5',
                isToday && !isSelected && 'text-primary-400 font-bold',
                isSelected && 'bg-primary-500 text-black font-bold shadow-[0_2px_8px_rgba(201,168,76,0.3)]',
              ].filter(Boolean).join(' ')}
            >
              {c.date.getDate()}
              {hasTask && !isSelected && (
                <span className={'absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ' + (isToday ? 'bg-primary-400' : 'bg-primary-500/60')} />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ───────────────────────── Task summary donut ───────────────────────── */

function TaskSummaryDonut({ tasks }: { tasks: Task[] }) {
  const todayISO = new Date().toISOString().slice(0, 10)
  const total = tasks.length
  const completed = tasks.filter(t => t.completed).length
  const inProgress = tasks.filter(t => !t.completed && t.status === 'in_progress').length
  const overdue = tasks.filter(t => !t.completed && (t.task_date ?? '').slice(0, 10) < todayISO).length
  // To-do = everything else that isn't completed/in-progress/overdue.
  const todo = Math.max(0, total - completed - inProgress - overdue)

  const segments = [
    { label: 'Completed',   value: completed,  color: '#22c55e', Icon: CheckCircle2 },
    { label: 'In Progress', value: inProgress, color: '#3b82f6', Icon: PlayCircle },
    { label: 'Overdue',     value: overdue,    color: '#ef4444', Icon: AlertCircle },
    { label: 'To Do',       value: todo,       color: '#9ca3af', Icon: Circle },
  ]
  // Donut data — Recharts hides zero-value slices automatically. When
  // total == 0 we render a single gray "ring" instead of an empty
  // chart so the widget doesn't render a confusing blank circle.
  const data = total === 0
    ? [{ name: 'empty', value: 1, color: '#1f2937' }]
    : segments.filter(s => s.value > 0).map(s => ({ name: s.label, value: s.value, color: s.color }))

  return (
    <div className="bg-dark-surface border border-dark-border rounded-xl p-4">
      <h3 className="text-sm font-semibold text-white mb-3">Task summary</h3>
      <div className="relative h-[140px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={45} outerRadius={62} paddingAngle={total === 0 ? 0 : 2} dataKey="value" stroke="none">
              {data.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-2xl font-bold text-white tabular-nums leading-none">{total}</span>
          <span className="text-[10px] uppercase tracking-wider text-gray-500 mt-1">Tasks</span>
        </div>
      </div>
      <div className="space-y-1.5 mt-3">
        {segments.map(s => {
          const pct = total > 0 ? Math.round((s.value / total) * 100) : 0
          return (
            <div key={s.label} className="flex items-center gap-2 text-xs">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
              <span className="flex-1 text-gray-300">{s.label}</span>
              <span className="text-gray-500 tabular-nums">{s.value} <span className="text-gray-600">({pct}%)</span></span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ───────────────────────── Up next ───────────────────────── */

function UpNext({ currentDate, tasks }: { currentDate: string; tasks: Task[] }) {
  const todayISO = new Date().toISOString().slice(0, 10)
  const isViewingToday = currentDate === todayISO
  const now = new Date()
  const nowMinutes = now.getHours() * 60 + now.getMinutes()

  // Tasks for today with a start_time after now (or all timed tasks
  // when viewing a future date). Sorted ascending, top 3.
  const upcoming = useMemo(() => {
    const timed = tasks
      .filter(t => t.start_time && !t.completed)
      .map(t => {
        const [h, m] = String(t.start_time).split(':').map(Number)
        return { ...t, _mins: (h ?? 0) * 60 + (m ?? 0) }
      })
      .sort((a, b) => a._mins - b._mins)
    const filtered = isViewingToday ? timed.filter(t => t._mins >= nowMinutes) : timed
    return filtered.slice(0, 3)
  }, [tasks, isViewingToday, nowMinutes])

  if (upcoming.length === 0) return null

  return (
    <div className="bg-dark-surface border border-dark-border rounded-xl p-4">
      <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-1.5">
        <Clock size={13} className="text-primary-400" />
        {isViewingToday ? 'Up next' : 'Today\'s schedule'}
      </h3>
      <div className="space-y-2">
        {upcoming.map(t => (
          <div key={t.id} className="flex items-start gap-2.5 p-2 rounded-lg bg-white/[0.02] border border-white/5 hover:border-white/15 transition">
            <span className={[
              'w-2 h-2 rounded-full mt-1.5 flex-shrink-0',
              t.priority === 'high' ? 'bg-red-400' : t.priority === 'low' ? 'bg-gray-500' : 'bg-blue-400',
            ].join(' ')} />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-white truncate">{t.title}</div>
              <div className="text-[10px] text-gray-500 mt-0.5">
                {t.start_time ? String(t.start_time).slice(0, 5) : ''}
                {t.employee_name && <span className="text-gray-600"> · {t.employee_name}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
