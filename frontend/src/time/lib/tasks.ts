import { get, params, send } from './api'
import type { RawTask, Template } from './types'

/**
 * The full admin's own planner endpoints, as the Time Planner calls them (2026-11-09): one writer for tasks, subtasks,
 * the backlog, templates, day notes and the planner's settings. Nothing here decides; the pure helpers below only shape
 * what a form holds into what those endpoints take.
 */

export const PRIORITIES = ['High', 'Normal', 'Low'] as const
export type Priority = (typeof PRIORITIES)[number]

export const STATUSES = ['todo', 'in_progress', 'blocked', 'done'] as const
export type Status = (typeof STATUSES)[number]

export const RECURRING = ['none', 'daily', 'weekly', 'monthly'] as const

export const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240] as const

/** The planner's own spelling of a priority the rows may hold in any case ('high', 'Medium', 'Urgent'). */
export function priorityOf(raw: string | null | undefined): Priority {
  const p = (raw ?? '').trim().toLowerCase()
  if (p === 'high' || p === 'urgent') return 'High'
  if (p === 'low') return 'Low'
  return 'Normal'
}

export interface TaskForm {
  title: string
  task_date: string
  start_time: string
  duration_minutes: string
  person: string
  priority: Priority
  status: Status
  task_group: string
  task_category: string
  description: string
  recurring: (typeof RECURRING)[number]
  recurring_until: string
  pool_horizon: '' | 'general' | 'week' | 'day'
  pool_due_date: string
}

export const EMPTY_FORM: TaskForm = {
  title: '', task_date: '', start_time: '', duration_minutes: '', person: '', priority: 'Normal', status: 'todo',
  task_group: '', task_category: '', description: '', recurring: 'none', recurring_until: '', pool_horizon: '', pool_due_date: '',
}

export interface PersonRef { key: string; user_id: number | null; name: string }

/** Who a task names, as the full admin writes it: the account and the name, or nobody (both null). */
export function assignmentOf(person: PersonRef | null | undefined): { assigned_to_user_id: number | null; employee_name: string | null } {
  return person ? { assigned_to_user_id: person.user_id, employee_name: person.name } : { assigned_to_user_id: null, employee_name: null }
}

/** The end of a task from its start and length (`HH:MM`), or null. */
export function endOf(start: string, minutes: number): string | null {
  const m = /^(\d{2}):(\d{2})$/.exec(start)
  if (!m || !(minutes > 0)) return null
  const total = Math.min(24 * 60 - 1, Number(m[1]) * 60 + Number(m[2]) + minutes)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export type FormProblem = 'title' | 'recurring_until' | 'pool_due_date' | 'recurring_needs_day'

/** What stops a form from being saved, first problem first; null when it can be saved. */
export function formProblem(form: TaskForm, creating: boolean): FormProblem | null {
  if (!form.title.trim()) return 'title'
  if (creating && form.recurring !== 'none' && !form.task_date) return 'recurring_needs_day'
  if (creating && form.recurring !== 'none' && form.recurring_until && form.task_date && form.recurring_until <= form.task_date) return 'recurring_until'
  if (!form.task_date && form.pool_horizon === 'day' && !form.pool_due_date) return 'pool_due_date'
  return null
}

/**
 * The body `POST planner/tasks` (creating) or `PUT planner/tasks/{id}` takes. A task without a day is in the backlog: in
 * its person's bucket, or, with nobody, in the pool with its horizon. Repeats are offered only when creating, as in the
 * full admin; an empty field is sent as null so an edit can clear it.
 */
export function payloadOf(form: TaskForm, person: PersonRef | null, creating: boolean): Record<string, unknown> {
  const minutes = Number(form.duration_minutes)
  const duration = Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : null
  const start = form.task_date && /^\d{2}:\d{2}$/.test(form.start_time) ? form.start_time : null
  const body: Record<string, unknown> = {
    title: form.title.trim(),
    task_date: form.task_date || null,
    start_time: start,
    end_time: start && duration ? endOf(start, duration) : null,
    duration_minutes: duration,
    priority: form.priority,
    task_group: form.task_group || null,
    task_category: form.task_category || null,
    description: form.description.trim() || null,
    ...assignmentOf(person),
  }
  if (!creating) body.status = form.status
  if (!form.task_date && !person) {
    body.pool_horizon = form.pool_horizon || 'general'
    if (form.pool_horizon === 'day') body.pool_due_date = form.pool_due_date
  }
  if (creating && form.recurring !== 'none' && form.task_date) {
    body.recurring = form.recurring
    if (form.recurring_until) body.recurring_until = form.recurring_until
  }
  return body
}

/* ─── The full admin's endpoints ─────────────────────────────────── */

export const plannerApi = {
  create: (body: Record<string, unknown>) => send<RawTask>('post', 'planner/tasks', body),
  update: (id: number, body: Record<string, unknown>) => send<RawTask>('put', `planner/tasks/${id}`, body),
  remove: (id: number, scope: 'just_this' | 'all_future' | 'whole_series' = 'just_this') => send<unknown>('delete', `planner/tasks/${id}${params({ scope })}`),
  move: (id: number, body: { task_date: string | null; start_time?: string | null; employee_name?: string | null; assigned_to_user_id?: number | null }) =>
    send<{ success: boolean }>('patch', `planner/tasks/${id}/move`, body),
  copy: (id: number, body: { task_date: string; employee_name?: string | null; assigned_to_user_id?: number | null }) => send<RawTask>('post', `planner/tasks/${id}/copy`, body),
  status: (id: number, status: Status) => send<RawTask>('patch', `planner/tasks/${id}/status`, { status }),
  toggle: (id: number) => send<RawTask>('patch', `planner/tasks/${id}/complete`),
  addSubtask: (id: number, title: string) => send<{ id: number }>('post', `planner/tasks/${id}/subtasks`, { title }),
  toggleSubtask: (id: number) => send<unknown>('patch', `planner/subtasks/${id}/toggle`),
  removeSubtask: (id: number) => send<unknown>('delete', `planner/subtasks/${id}`),
  claim: (id: number) => send<RawTask>('post', `planner/tasks/${id}/claim`),
  release: (id: number) => send<RawTask>('post', `planner/tasks/${id}/release`),
  backlog: <T>(scope: 'mine' | 'pool' | 'team') => get<T>(`planner/backlog${params({ scope })}`),
  templates: () => get<Template[]>('planner/templates'),
  createTemplate: (body: Partial<Template>) => send<Template>('post', 'planner/templates', body),
  updateTemplate: (id: number, body: Partial<Template>) => send<Template>('put', `planner/templates/${id}`, body),
  removeTemplate: (id: number) => send<unknown>('delete', `planner/templates/${id}`),
  dayNote: (date: string) => get<{ note_text?: string | null } | null>(`planner/day-note${params({ date })}`),
  saveDayNote: (date: string, text: string) => send<unknown>('post', 'planner/day-note', { note_date: date, note_text: text }),
  settings: () => get<Record<string, unknown>>('crm-settings'),
  /**
   * A planner setting, written as the full admin writes it: lists as JSON text (its plannerMeta parsers read both), the
   * work day's hours as an object, which is the only shape the server reads (WorkWindow).
   */
  saveSetting: (key: string, value: unknown) => send<unknown>('put', `crm-settings/${key}`, {
    value: key === 'business_hours_profile' || typeof value === 'number' ? value : JSON.stringify(value),
  }),
  /** A person's skills: only the full admin's Team endpoint writes them (a manager's). */
  saveSkills: (staffId: number, skills: string[] | null) => send<unknown>('put', `team/${staffId}`, { planner_skills: skills }),
}
