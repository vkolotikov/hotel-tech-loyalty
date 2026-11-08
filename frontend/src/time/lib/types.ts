/** The shapes HexaTech Time Planner reads from the server (App\Services\Time\*, the full admin's planner endpoints). */

export interface GroupDef { name: string; icon: string | null; color: string | null }
export interface ChannelDef { key: string; label: string; icon: string; color: string; groups: string[] }

export interface Bootstrap {
  name: string
  organization: { id: number; name: string; industry: string }
  accent: string | null
  venue: { timezone: string; today: string }
  features: { time_management: boolean; voice: boolean }
  ai: { status: 'ok' | 'warn' | 'over' | string; percent: number | null; ready: boolean; state: string }
  staff: {
    id: number
    key: string
    name: string
    role: string | null
    can: { plan_team: boolean; edit_people: boolean; team_buckets: boolean; manage_settings: boolean; manage_templates: boolean }
  }
  settings: {
    window: { start: string; end: string }
    minutes_per_day: number
    days_per_week: number
    groups: GroupDef[]
    channels: ChannelDef[]
    /** Who may put work on whose day (PlanningMode): everyone for everyone, or each their own; `staff.can.plan_team` is mine. */
    planning_mode?: 'team' | 'own'
  }
  counts: { today_open: number; overdue: number; pool: number }
}

export interface Subtask { id: number; title: string; is_done: boolean }

/** A planner task as App\Services\Time\TaskView answers it. */
export interface Task {
  id: number
  title: string
  description: string | null
  task_date: string | null
  start_time: string | null
  end_time: string | null
  duration_minutes: number | null
  minutes: number
  status: string
  done: boolean
  priority: string
  priority_rank: number
  task_group: string | null
  task_category: string | null
  assigned_to_user_id: number | null
  employee_name: string | null
  owner: string | null
  subtasks: Subtask[]
  subtasks_done: number
  subtasks_total: number
  running: boolean
  started_at: string | null
  actual_minutes: number | null
  recurring: boolean
  pool_horizon: string | null
  pool_due_date: string | null
  overdue: boolean
  updated_at: string | null
}

export interface Signal { code: string; person?: string | null; task?: number; other?: number; group?: string | null; value?: number; limit?: number }

export interface Lane {
  key: string
  user_id: number | null
  name: string
  role: string | null
  manager: boolean
  listed: boolean
  has_account: boolean
  skills: string[] | null
  knowledge: string
  prefers: { groups: string[]; tasks: string[] }
  works: boolean
  window: { start: string; end: string }
  break_minutes: number
  capacity_minutes: number
  planned_minutes: number
  done_minutes: number
  tracked_minutes: number
  load_pct: number | null
  open_count: number
  done_count: number
  unscheduled: number
  tasks: Task[]
  overdue: Task[]
}

export interface Board {
  date: string
  weekday: number
  today: string
  is_today: boolean
  now: string | null
  window: { start: string; end: string }
  people: Lane[]
  unassigned: Task[]
  pool: { open: number; for_day: number }
  totals: { tasks: number; done: number; planned_minutes: number; capacity_minutes: number; load_pct: number | null; unassigned: number; overdue: number }
  signals: Signal[]
  note?: string | null
}

export interface Today {
  date: string
  now: string | null
  window: { start: string; end: string }
  me: Lane | null
  next: Task | null
  signals: Signal[]
  backlog: { mine: number; pool: number; pool_for_today: number }
  pool_top: Task[]
  week: { date: string; tasks: number; done: number; minutes: number }[]
  note: string | null
}

export interface WeekCell { date: string; works: boolean; planned_minutes: number; capacity_minutes: number; load_pct: number | null; tasks: Task[] }
export interface Week {
  start: string
  days: { date: string; weekday: number; is_today: boolean; totals: Board['totals'] }[]
  people: { key: string; user_id: number | null; name: string; role: string | null; listed: boolean; planned_minutes: number; capacity_minutes: number; load_pct: number | null; days: WeekCell[] }[]
  unassigned: { date: string; tasks: Task[] }[]
}

export interface Profile { skills: string[] | null; knowledge: string; work_start: string | null; work_end: string | null; work_days: number[] | null; break_minutes: number }

export interface Person {
  key: string
  user_id: number | null
  staff_id: number | null
  name: string
  role: string | null
  department: string | null
  manager: boolean
  avatar_url: string | null
  has_account: boolean
  profile: Profile
  prefers: { groups: string[]; tasks: string[] }
  experience: { done: number; on_time: number; groups: Record<string, { done: number; on_time: number; avg_minutes: number }> }
  today: { works: boolean; planned_minutes: number; capacity_minutes: number; load_pct: number | null; window: { start: string; end: string } } | null
}

export interface Totals {
  tasks: number; done: number; on_time: number; late: number; overdue: number; planned_minutes: number; done_minutes: number
  tracked_minutes: number; tracked_tasks: number; completion_pct: number | null; on_time_pct: number | null; accuracy_pct: number | null
  capacity_minutes?: number; load_pct?: number | null
}

export interface Insights {
  from: string
  to: string
  days: number
  person: string | null
  totals: Totals
  previous: Totals
  people: (Totals & { key: string; name: string; user_id: number | null; capacity_minutes: number; load_pct: number | null })[]
  groups: (Totals & { task_group: string | null })[]
  weekdays: { weekday: number; tasks: number; done: number; minutes: number }[]
  hours: { hour: number; tasks: number }[]
  by_day: { date: string; tasks: number; done: number; planned_minutes: number; done_minutes: number }[]
  pool: { open: number; d0: number; d1: number; d3: number; d7: number; oldest: string | null }
  signals: Signal[]
}

export interface Proposal {
  task_id: number
  title: string
  task_group: string | null
  priority: string
  person: string
  user_id: number | null
  employee_name: string
  start_time: string
  end_time: string
  duration_minutes: number
  reasons: string[]
  note: string
  source: 'ai' | 'rules'
  from: 'day' | 'unassigned' | 'pool' | 'overdue'
  previous: { date: string | null; start_time: string | null; person: string | null }
  seen: string | null
}

export interface PlanResult {
  date: string
  source: 'ai' | 'rules'
  ai_status: string
  summary: string
  proposals: Proposal[]
  unplaced: { task_id: number; title: string; reason: string }[]
  people: { key: string; name: string }[]
}

export interface ApplyResult { applied: number; skipped: { task_id: number; reason: string }[] }

export interface ReviewAction { type: 'assign' | 'move_day' | 'set_time'; task_id: number; person?: string; date?: string; start_time?: string }
export interface Review {
  kind: 'day' | 'period'
  summary: string
  highlights: string[]
  suggestions: { title: string; detail: string; action: ReviewAction | null }[]
}

export interface CaptureDraft {
  title: string
  task_date: string | null
  start_time: string | null
  duration_minutes: number | null
  estimated: boolean
  priority: 'High' | 'Normal' | 'Low'
  task_group: string | null
  task_category: string | null
  person: string | null
  assigned_to_user_id: number | null
  employee_name: string | null
  person_named: string | null
  description: string | null
  subtasks: string[]
}

export interface Template {
  id: number
  name: string
  title: string
  category: string | null
  task_group: string | null
  task_category: string | null
  priority: string | null
  duration_minutes: number | null
  description: string | null
  sort_order: number
}

/** A task as the full admin's planner endpoints answer it (the raw row). */
export interface RawTask {
  id: number
  title: string
  task_date: string | null
  start_time: string | null
  updated_at?: string | null
}
