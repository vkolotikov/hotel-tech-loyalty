import { addDays, hhmm, isDateKey, minutesOf, weekdayOf } from '../workspace/lib/wallClock'

/**
 * The task form's decisions (owner 2026-11-09: one redesigned task form, in clear steps, for HexaTech CRM and the full
 * admin's task drawer). Pure functions only, because the frontend tests render to a string; each screen draws them in
 * its own palette and words them in its own bundle:
 *
 *  1. What: the type, chosen from a grid in four groups; the title, which follows the type (and the lead) until the
 *     person writes their own; the priority.
 *  2. When: a day (quick days or the calendar), then a start time (by part of the day, or any time), then a length,
 *     then how often it repeats. A step needs the one before it: a time needs a day, a length needs a time, a repeat
 *     needs a day — choosing less clears what depends on it, so nothing chosen is silently dropped.
 *  3. Who and what for, then notes.
 *
 * What is sent: the server's own fields (TaskController): `type`, `title`, `description`, `due_at`, `priority`,
 * `duration_minutes`, `recurring_rule` ({freq}). Each screen turns the day and time into `due_at` on its own clock
 * (the CRM on the venue's, the full admin on the person's, as each did before).
 */

/** TaskController's `type` rule. */
export const TASK_TYPES = [
  'call', 'email', 'whatsapp', 'sms', 'video_call', 'meeting', 'site_visit', 'demo', 'send_proposal', 'contract',
  'discovery', 'follow_up', 'custom',
] as const
export type TaskType = (typeof TASK_TYPES)[number]
export const isTaskType = (value: string): value is TaskType => (TASK_TYPES as readonly string[]).includes(value)

export type TypeGroup = 'talk' | 'meet' | 'sell' | 'other'

/** The type grid, in four groups: get in touch, meet, close the sale, anything else. */
export const TYPE_GROUPS: readonly { key: TypeGroup; types: readonly TaskType[] }[] = [
  { key: 'talk', types: ['call', 'email', 'whatsapp', 'sms', 'video_call'] },
  { key: 'meet', types: ['meeting', 'site_visit', 'demo'] },
  { key: 'sell', types: ['discovery', 'send_proposal', 'contract'] },
  { key: 'other', types: ['follow_up', 'custom'] },
]

export function groupOf(type: string): TypeGroup {
  return TYPE_GROUPS.find(g => (g.types as readonly string[]).includes(type))?.key ?? 'other'
}

export const PRIORITIES = ['low', 'normal', 'high'] as const
export type Priority = (typeof PRIORITIES)[number]
export const isPriority = (value: unknown): value is Priority => typeof value === 'string' && (PRIORITIES as readonly string[]).includes(value)

/** The lengths offered, in minutes (the server takes 5 to 720). */
export const DURATIONS = [15, 30, 45, 60, 90, 120, 240] as const

export const REPEATS = ['none', 'daily', 'weekly', 'monthly'] as const
export type Repeat = (typeof REPEATS)[number]
export const isRepeat = (value: unknown): value is Repeat => typeof value === 'string' && (REPEATS as readonly string[]).includes(value)

export type DayPart = 'morning' | 'afternoon' | 'evening'

/** Start times every half hour from 07:00 to 21:30, by part of the day; any other time is typed. */
export function startTimes(): { part: DayPart; times: string[] }[] {
  const range = (from: number, to: number) => Array.from({ length: (to - from) * 2 }, (_, i) => hhmm(from * 60 + i * 30))
  return [
    { part: 'morning', times: range(7, 12) },
    { part: 'afternoon', times: range(12, 17) },
    { part: 'evening', times: range(17, 22) },
  ]
}

export const isTime = (value: string): boolean => /^([01]\d|2[0-3]):[0-5]\d$/.test(value)

/** The part of the day a start time is in (the grid opens there); morning when there is none. */
export function partOf(time: string): DayPart {
  if (!isTime(time)) return 'morning'
  const h = Number(time.slice(0, 2))
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'
}

/** Whether a start time is one of the grid's (else it is shown in the "other time" box). */
export const isGridTime = (time: string): boolean => startTimes().some(p => p.times.includes(time))

export type QuickDay = 'today' | 'tomorrow' | 'in_2_days' | 'next_monday'

/** The quick days from `today` (`YYYY-MM-DD` on the screen's clock): today, tomorrow, in two days, the next Monday. */
export function quickDays(today: string): { key: QuickDay; date: string }[] {
  if (!isDateKey(today)) return []
  const untilMonday = 7 - weekdayOf(today) // weekdayOf: Monday 0 … Sunday 6; today a Monday → the Monday after.
  return [
    { key: 'today', date: today },
    { key: 'tomorrow', date: addDays(today, 1) },
    { key: 'in_2_days', date: addDays(today, 2) },
    { key: 'next_monday', date: addDays(today, untilMonday) },
  ]
}

/** When a task that starts at `time` and lasts `minutes` ends, and whether that is the next day. */
export function endsAt(time: string, minutes: number | null): { time: string; nextDay: boolean } | null {
  if (!isTime(time) || !minutes || minutes <= 0) return null
  const end = minutesOf(time) + minutes
  return { time: hhmm(end % 1440), nextDay: end >= 1440 }
}

/** A length as hours and minutes: `{ hours: 1, minutes: 30 }` for 90. */
export function splitMinutes(total: number): { hours: number; minutes: number } {
  return { hours: Math.floor(total / 60), minutes: total % 60 }
}

/* ─── The form's state ─────────────────────────────────────────────────────── */

export interface TaskFormState {
  type: TaskType
  /** What the person wrote; empty means the suggestion is used. */
  title: string
  priority: Priority
  /** The day and start time on the screen's clock (`YYYY-MM-DD`, `HH:mm`); empty for none. */
  date: string
  time: string
  duration: number | null
  repeat: Repeat
  description: string
}

export const EMPTY_TASK_FORM: TaskFormState = {
  type: 'follow_up', title: '', priority: 'normal', date: '', time: '', duration: null, repeat: 'none', description: '',
}

/** What a stored task holds of the plan (the server's fields; older rows have none of them). */
export interface TaskPlanFields {
  priority?: string | null
  duration_minutes?: number | null
  recurring_rule?: { freq?: string | null } | null
}

/** A stored task's plan as the form holds it. */
export function planOf(task: TaskPlanFields | null | undefined): Pick<TaskFormState, 'priority' | 'duration' | 'repeat'> {
  const freq = task?.recurring_rule?.freq
  const minutes = Number(task?.duration_minutes)
  return {
    priority: isPriority(task?.priority) ? task.priority : 'normal',
    duration: Number.isInteger(minutes) && minutes > 0 ? minutes : null,
    repeat: isRepeat(freq) && freq !== 'none' ? freq : 'none',
  }
}

/** Choosing a day; no day clears the time, the length and the repeat, which need one. */
export function withDate<T extends TaskFormState>(state: T, date: string): T {
  return date ? { ...state, date } : { ...state, date: '', time: '', duration: null, repeat: 'none' }
}

/** Choosing a start time (again to take it back); no time clears the length, which needs one. */
export function withTime<T extends TaskFormState>(state: T, time: string): T {
  const next = state.time === time ? '' : time
  return next ? { ...state, time: next } : { ...state, time: '', duration: null }
}

/** Choosing a length (again to take it back). */
export function withDuration<T extends TaskFormState>(state: T, minutes: number): T {
  return { ...state, duration: state.duration === minutes ? null : minutes }
}

/** The title a type suggests: the type's name, with whom it is for when the form knows ("Call · Ada Lovelace"). */
export function suggestedTitle(typeLabel: string, forName?: string | null): string {
  const name = (forName ?? '').trim()
  return name ? `${typeLabel} · ${name}` : typeLabel
}

/** The title that is saved: what the person wrote, else the suggestion. */
export function titleOf(state: TaskFormState, suggestion: string): string {
  return (state.title.trim() || suggestion.trim()).slice(0, 200)
}

export type FormField = 'title' | 'date' | 'time' | 'duration' | 'repeat' | 'description'
export type FormProblem = 'required' | 'too_long' | 'invalid' | 'needs_date' | 'needs_time'

/** What stops the form (the server's rules: a title up to 200, notes up to 4000; and each step's need of the one before). */
export function formProblems(state: TaskFormState, suggestion: string): Partial<Record<FormField, FormProblem>> {
  const out: Partial<Record<FormField, FormProblem>> = {}
  if (!titleOf(state, suggestion)) out.title = 'required'
  else if (state.title.trim().length > 200) out.title = 'too_long'
  if (state.description.length > 4000) out.description = 'too_long'
  if (state.date && !isDateKey(state.date)) out.date = 'invalid'
  if (state.time && !isTime(state.time)) out.time = 'invalid'
  else if (state.time && !state.date) out.time = 'needs_date'
  if (state.duration && !state.time) out.duration = 'needs_time'
  if (state.repeat !== 'none' && !state.date) out.repeat = 'needs_date'
  return out
}

/** The plan's fields for `POST tasks` / `PUT tasks/{id}` (beside type, title, description and the screen's `due_at`). */
export function planBody(state: TaskFormState): { priority: Priority; duration_minutes: number | null; recurring_rule: { freq: Exclude<Repeat, 'none'> } | null } {
  return {
    priority: state.priority,
    duration_minutes: state.time && state.duration ? state.duration : null,
    recurring_rule: state.date && state.repeat !== 'none' ? { freq: state.repeat } : null,
  }
}

/** What the summary line says, for the screen to word: the type, the day, the start and end, the repeat, the priority. */
export function summaryOf(state: TaskFormState): {
  type: TaskType; date: string | null; start: string | null; end: { time: string; nextDay: boolean } | null; repeat: Repeat; priority: Priority
} {
  return {
    type: state.type,
    date: state.date || null,
    start: state.date && state.time ? state.time : null,
    end: state.date ? endsAt(state.time, state.duration) : null,
    repeat: state.date ? state.repeat : 'none',
    priority: state.priority,
  }
}
