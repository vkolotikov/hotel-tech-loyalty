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
    /** Recognition (2026-11-28): who sees the week's ranking, or `off` (where nobody chose: the top three). */
    recognition?: RecognitionMode
    /** How many finished tasks of a day make the daily goal (1 to 20). */
    daily_goal?: number
    /** Whether the organisation shows characters (Buddies; absent on an older answer: yes). */
    buddies?: boolean
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

export interface Profile {
  skills: string[] | null; knowledge: string; work_start: string | null; work_end: string | null; work_days: number[] | null; break_minutes: number
  /** What a manager teaches the AI about the person (2026-11-14); absent on an older answer. */
  job_title?: string; level?: string | null; strengths?: string; develop?: string
}

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
  from: 'day' | 'unassigned' | 'pool' | 'overdue' | 'backlog'
  previous: { date: string | null; start_time: string | null; person: string | null }
  seen: string | null
  /** A week plan's line names its day (2026-11-14). */
  date?: string
}

/** A week's plan (time/plan-week): each day's lines, what could not be placed. */
export interface WeekPlanResult {
  from: string
  to: string
  source: 'ai' | 'rules'
  ai_status: string
  summary: string
  days: { date: string; proposals: Proposal[]; people: { person: string; name: string; works: boolean; capacity_minutes: number; free_minutes: number }[] }[]
  unplaced: { task_id: number; title: string; reason: string; date: string | null }[]
  people: { key: string; name: string }[]
}

/** A change the assistant proposes, checked by the server, with the planner call that applies it. */
export interface AssistantProposal {
  id: string
  kind: 'create' | 'assign' | 'move' | 'set_length'
  task_id?: number
  title: string
  person?: { key: string; name: string } | null
  date?: string | null
  start_time?: string | null
  minutes?: number
  was?: number
  task_type?: string | null
  note?: string | null
  request: { method: 'post' | 'put' | 'patch'; path: string; body: Record<string, unknown> }
}

export interface AssistantAnswer { reply: string; proposals: AssistantProposal[]; used: string[]; rounds: number }

export interface DurationRow {
  key: string; name: string; samples: number; clocked: number; planned_median: number | null; real_median: number | null
  suggested: number | null; drift_pct: number | null; typical: number | null; advice: 'few' | 'longer' | 'shorter' | 'set_typical' | 'ok'
}

export interface LearnedPerson {
  person: string; name: string; has_account: boolean; tasks: number; done: number; on_time_pct: number | null; completion_pct: number | null
  late_open: number; clocked: number; accuracy_pct: number | null
  types: { type: string; done: number; on_time_pct: number | null; team_on_time_pct: number | null; median_minutes: number | null; team_median_minutes: number | null; speed: number | null }[]
  strengths: string[]; support: string[]
}

export interface Learned {
  from: string; to: string; weeks: number
  totals: { tasks: number; done: number; on_time_pct: number | null; late_open: number; clocked: number; clocked_pct: number | null; accuracy_pct: number | null }
  types: DurationRow[]
  tasks: DurationRow[]
  people: LearnedPerson[]
  leaders: { type: string; people: number; best: { person: string; name: string; done: number; on_time_pct: number | null; speed: number | null }; least: { person: string; name: string; done: number; on_time_pct: number | null; speed: number | null } }[]
}

export interface TypeNote { notes: string; typical_minutes: number | null; best_time: string | null }
export interface TaskNote { notes: string; typical_minutes: number | null }
export interface AiContext { about: string; rules: string; goals: string }

export interface CoachOverview {
  readiness: { score: number; items: { code: string; pct: number; count: number | null; total: number | null }[] }
  learning: Learned
  knowledge: { context: AiContext; types: Record<string, TypeNote>; tasks: Record<string, TaskNote> }
  manager: boolean
  levels: string[]
  best_times: string[]
}

export interface StrategyFix {
  type: 'set_typical' | 'add_skill'; label: string; minutes?: number; type_name?: string; task_key?: string
  person?: string; name?: string; staff_id?: number; skills?: string[]
}

export interface Strategy {
  summary: string
  weeks: number
  recommendations: { title: string; detail?: string; kind: string; impact: 'high' | 'medium' | 'low'; fix?: StrategyFix }[]
}

export type Drafts =
  | { kind: 'people'; people: { person: string; user_id: number; name: string; job_title: string; knowledge: string; strengths: string; develop: string; now: Partial<Profile> }[] }
  | { kind: 'types'; types: ({ type: string } & TypeNote)[]; tasks: ({ task_key: string; label: string } & TaskNote)[] }
  | { kind: 'business'; context: AiContext }

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

/* ─── Recognition (time/recognition, App\Services\Time\Recognition) ─── */

export type RecognitionMode = 'ranking' | 'podium' | 'own' | 'off'

/** A badge and how far it has got. */
export interface Badge { code: string; earned: boolean; have: number; need: number }

/** A row of the week's ranking; `rank` is null for someone who is told no place. */
export interface RankRow {
  person: string; name: string; manager: boolean; points: number; done: number; rank: number | null; me: boolean; streak: number; badges: number
  /** The person's character (Buddies), or none: they chose none, or the organisation shows no characters. */
  buddy?: string | null
}

export interface RecognitionDay { date: string; future: boolean; points: number; planned: number; done: number; goal_met: boolean; sweep: boolean; day_planned: boolean }

export interface RecognitionMe {
  person: string
  name: string
  /** The character I am shown with, and what I chose myself (a kind, `none`, or nothing yet). */
  buddy?: string | null
  buddy_choice?: string | null
  today: { planned: number; done: number; goal: number; goal_met: boolean; sweep: boolean; day_planned: boolean; planned_pct: number | null; important_done: number; points: number }
  week: { points: number; done: number; important: number; on_time_pct: number | null; clocked: number; days_goal: number; days_sweep: number; days_planned: number; rank: number | null; of: number | null }
  streak: number
  badges: Badge[]
  last_week: { points: number; rank: number | null; of: number | null } | null
  days: RecognitionDay[]
}

/** What a person sees of recognition; when it is switched off only `mode` and `manager` come. */
export interface Recognition {
  mode: RecognitionMode
  manager: boolean
  /** Whether the organisation shows characters at all (Buddies). */
  buddies?: boolean
  today?: string
  week?: { from: string; to: string }
  rules?: { points: Record<string, number>; daily_goal: number; planned_share: number; day_task_cap: number; on_time_share?: number }
  me?: RecognitionMe | null
  ranking?: RankRow[]
  hidden?: number
}
