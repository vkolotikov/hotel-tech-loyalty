import { addDays, venueNow } from '../../workspace/lib/wallClock'

/**
 * The Tasks area's decisions, as pure functions: which bucket a task is in on the venue's day, what the list asks the
 * server (TaskController::index), and what the task form sends. A task's `due_at` is an instant; the person types the
 * venue's date and time, which is turned into that instant here, in the venue's zone (`boot.venue.timezone`).
 */

/** What `GET tasks` answers per row (with `assignee` and `inquiry`). */
export interface Task {
  id: number
  type: string
  title: string
  description: string | null
  due_at: string | null
  completed_at: string | null
  outcome: string | null
  inquiry_id: number | null
  guest_id: number | null
  assigned_to: number | null
  assignee?: { id: number; name: string } | null
  inquiry?: { id: number; guest_id: number | null; status: string | null } | null
}

/** TaskController's `type` rule, in the full admin's order (channels, then sales steps, then the catch-all). */
export const TASK_TYPES = [
  'call', 'email', 'whatsapp', 'sms', 'video_call', 'meeting', 'site_visit', 'demo', 'send_proposal', 'contract',
  'discovery', 'follow_up', 'custom',
] as const
export type TaskType = (typeof TASK_TYPES)[number]

export const isTaskType = (value: string): value is TaskType => (TASK_TYPES as readonly string[]).includes(value)

export type Bucket = 'overdue' | 'today' | 'upcoming' | 'done'
export const BUCKETS: readonly Bucket[] = ['overdue', 'today', 'upcoming', 'done']

/** The list's pills (round 2): every open task by day, then round 1's buckets. */
export type Tab = 'open' | Bucket
export const TABS: readonly Tab[] = ['open', 'overdue', 'today', 'upcoming', 'done']

export type Who = 'mine' | 'all'

const read = (sp: URLSearchParams, key: string): string => sp.get(key) ?? ''

export interface TaskView { tab: Tab; who: Who; page: number; type: TaskType | '' }

/** The tab, the scope and the type an address holds: Today and Mine and any type unless it says otherwise. */
export function readView(sp: URLSearchParams): TaskView {
  const tab = read(sp, 'tab') as Tab
  const page = Number(read(sp, 'page'))
  const type = read(sp, 'type')
  return {
    tab: TABS.includes(tab) ? tab : 'today',
    who: read(sp, 'who') === 'all' ? 'all' : 'mine',
    page: Number.isInteger(page) && page > 1 ? page : 1,
    type: isTaskType(type) ? type : '',
  }
}

export function writeView(view: { tab: Tab; who: Who; page: number; type?: TaskType | '' }, current: URLSearchParams = new URLSearchParams()): URLSearchParams {
  const next = new URLSearchParams(current)
  if (view.tab === 'today') next.delete('tab'); else next.set('tab', view.tab)
  if (view.who === 'mine') next.delete('who'); else next.set('who', 'all')
  if (view.page > 1) next.set('page', String(view.page)); else next.delete('page')
  if (view.type) next.set('type', view.type); else next.delete('type')
  return next
}

/** At most this many open tasks are read at once and sorted into buckets here (the full admin reads 200 too). */
export const OPEN_LIMIT = 200

export type Query = Record<string, string | number | boolean | null | undefined>

/**
 * `GET tasks`: the open ones in one read (bucketed on the venue's day, which the server's `overdue`/`due_today` do not
 * use), the done ones a page at a time, newest first. Mine is the person's own (`assigned_to` is an account id).
 */
export function tasksQuery(view: { tab: Tab; who: Who; page: number }, me: number): Query {
  const mine = view.who === 'mine' ? me : undefined
  return view.tab === 'done'
    ? { status: 'completed', assigned_to: mine, page: view.page, per_page: 50 }
    : { status: 'open', assigned_to: mine, per_page: OPEN_LIMIT }
}

/** The venue's calendar day of an instant, or null. */
export function venueDay(iso: string | null | undefined, zone: string): string | null {
  if (!iso) return null
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return null
  return venueNow(zone, new Date(ms)).date
}

/** The venue's date and time (`HH:mm`) of an instant. */
export function venueClock(iso: string | null | undefined, zone: string): { date: string; time: string } | null {
  if (!iso) return null
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return null
  const { date, minutes } = venueNow(zone, new Date(ms))
  return { date, time: `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}` }
}

/**
 * The instant at which the venue's clock reads `date time` (ISO, UTC). The zone's offset is read for that moment, and
 * read again where it lands, so a day on which the clocks change still comes out right. A time that does not exist
 * (skipped by a spring change) moves forward by the gap, as a wall clock would.
 */
export function wallToInstant(date: string, time: string, zone: string): string | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  const t = /^(\d{2}):(\d{2})$/.exec(time || '00:00')
  if (!d || !t) return null
  const wall = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]))
  const offsetAt = (ms: number): number => {
    const { date: day, minutes } = venueNow(zone, new Date(ms))
    const [y, m, dd] = day.split('-').map(Number)
    return Date.UTC(y, m - 1, dd) + minutes * 60_000 - Math.floor(ms / 60_000) * 60_000
  }
  let guess = wall - offsetAt(wall)
  guess = wall - offsetAt(guess)
  return new Date(guess).toISOString()
}

/** Which tab a task belongs in on the venue's day `today`. A task with no due date waits under Upcoming. */
export function bucketOf(task: Pick<Task, 'due_at' | 'completed_at'>, today: string, zone: string): Bucket {
  if (task.completed_at) return 'done'
  const day = venueDay(task.due_at, zone)
  if (!day) return 'upcoming'
  return day < today ? 'overdue' : day === today ? 'today' : 'upcoming'
}

const byDue = (a: Pick<Task, 'due_at' | 'id'>, b: Pick<Task, 'due_at' | 'id'>): number => {
  if (!a.due_at && !b.due_at) return a.id - b.id
  if (!a.due_at) return 1
  if (!b.due_at) return -1
  return Date.parse(a.due_at) - Date.parse(b.due_at) || a.id - b.id
}

/** The open tasks by bucket, soonest first, those without a due date last. */
export function splitBuckets<T extends Pick<Task, 'id' | 'due_at' | 'completed_at'>>(tasks: readonly T[], today: string, zone: string): Record<Exclude<Bucket, 'done'>, T[]> {
  const out: Record<Exclude<Bucket, 'done'>, T[]> = { overdue: [], today: [], upcoming: [] }
  for (const task of tasks) {
    const bucket = bucketOf(task, today, zone)
    if (bucket !== 'done') out[bucket].push(task)
  }
  for (const list of Object.values(out)) list.sort(byDue)
  return out
}

/** Upcoming tasks by venue day, in order; those without a due date in a last group (`day` null). */
export function groupByDay<T extends Pick<Task, 'id' | 'due_at'>>(tasks: readonly T[], zone: string): { day: string | null; tasks: T[] }[] {
  const groups = new Map<string, T[]>()
  for (const task of [...tasks].sort(byDue)) {
    const key = venueDay(task.due_at, zone) ?? ''
    groups.set(key, [...(groups.get(key) ?? []), task])
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)))
    .map(([day, list]) => ({ day: day || null, tasks: list }))
}

/** The tasks of one type ('' for every type), over what is loaded (the server has no type filter). */
export function ofType<T extends Pick<Task, 'type'>>(tasks: readonly T[], type: TaskType | ''): T[] {
  return type ? tasks.filter(task => (isTaskType(task.type) ? task.type : 'custom') === type) : [...tasks]
}

export type DueState = 'done' | 'overdue' | 'today' | 'tomorrow' | 'later' | 'none'

/** How a task's due time reads on the venue's day: done, overdue, today, tomorrow, later, or no day. */
export function dueState(task: Pick<Task, 'due_at' | 'completed_at'>, today: string, zone: string): DueState {
  if (task.completed_at) return 'done'
  const day = venueDay(task.due_at, zone)
  if (!day) return 'none'
  if (day < today) return 'overdue'
  if (day === today) return 'today'
  return day === addDays(today, 1) ? 'tomorrow' : 'later'
}

export interface TaskGroup<T> { key: string; kind: 'overdue' | 'today' | 'tomorrow' | 'day' | 'none'; day: string | null; tasks: T[] }

/**
 * Every open task by the venue's day (round 2's "All open"): everything overdue in one group first, then today,
 * tomorrow and each later day, those without a day last. Within a group, soonest first.
 */
export function groupOpen<T extends Pick<Task, 'id' | 'due_at' | 'completed_at'>>(tasks: readonly T[], today: string, zone: string): TaskGroup<T>[] {
  const buckets = splitBuckets(tasks, today, zone)
  const groups: TaskGroup<T>[] = []
  if (buckets.overdue.length) groups.push({ key: 'overdue', kind: 'overdue', day: null, tasks: buckets.overdue })
  if (buckets.today.length) groups.push({ key: 'today', kind: 'today', day: today, tasks: buckets.today })
  const tomorrow = addDays(today, 1)
  for (const group of groupByDay(buckets.upcoming, zone)) {
    if (group.day === null) groups.push({ key: 'none', kind: 'none', day: null, tasks: group.tasks })
    else groups.push({ key: group.day, kind: group.day === tomorrow ? 'tomorrow' : 'day', day: group.day, tasks: group.tasks })
  }
  return groups
}

/** Done tasks by the venue's day they were done, the latest first. */
export function groupDone<T extends Pick<Task, 'id' | 'completed_at'>>(tasks: readonly T[], zone: string): { day: string | null; tasks: T[] }[] {
  const groups = new Map<string, T[]>()
  const sorted = [...tasks].sort((a, b) => (Date.parse(b.completed_at ?? '') || 0) - (Date.parse(a.completed_at ?? '') || 0) || b.id - a.id)
  for (const task of sorted) {
    const key = venueDay(task.completed_at, zone) ?? ''
    groups.set(key, [...(groups.get(key) ?? []), task])
  }
  return [...groups.entries()].map(([day, list]) => ({ day: day || null, tasks: list }))
}

/** A search over what is loaded: the title, the notes and who it is for. */
export function searchTasks<T extends Pick<Task, 'title' | 'description' | 'assignee'>>(tasks: readonly T[], q: string): T[] {
  const needle = q.trim().toLowerCase()
  if (!needle) return [...tasks]
  return tasks.filter(t => [t.title, t.description ?? '', t.assignee?.name ?? ''].some(s => s.toLowerCase().includes(needle)))
}

/* ─── The task form ──────────────────────────────────────────────────────── */

export interface TaskDraft {
  type: TaskType
  title: string
  description: string
  /** The venue's date and time, as typed. */
  date: string
  time: string
  assignee: number | null
  inquiryId: number | null
}

/** A form's start: a task as the venue's clock shows it, or a new one for the person (and the lead it is opened from). */
export function draftOf(task: Task | null, zone: string, defaults: { me: number; inquiryId?: number | null; date?: string }): TaskDraft {
  if (!task) {
    return { type: 'follow_up', title: '', description: '', date: defaults.date ?? '', time: '', assignee: defaults.me, inquiryId: defaults.inquiryId ?? null }
  }
  const clock = venueClock(task.due_at, zone)
  return {
    type: isTaskType(task.type) ? task.type : 'custom',
    title: task.title,
    description: task.description ?? '',
    date: clock?.date ?? '',
    time: clock && clock.time !== '00:00' ? clock.time : '',
    assignee: task.assigned_to ?? task.assignee?.id ?? null,
    inquiryId: task.inquiry_id,
  }
}

export type TaskField = 'title' | 'date' | 'time' | 'description'
export type TaskProblem = 'required' | 'too_long' | 'invalid' | 'needs_date'

/** What stops the form (the server's rules: a title up to 200, notes up to 4000, a valid date). */
export function validateTask(draft: TaskDraft): Partial<Record<TaskField, TaskProblem>> {
  const errors: Partial<Record<TaskField, TaskProblem>> = {}
  if (!draft.title.trim()) errors.title = 'required'
  else if (draft.title.trim().length > 200) errors.title = 'too_long'
  if (draft.description.length > 4000) errors.description = 'too_long'
  if (draft.date && !/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) errors.date = 'invalid'
  if (draft.time && !/^\d{2}:\d{2}$/.test(draft.time)) errors.time = 'invalid'
  else if (draft.time && !draft.date) errors.time = 'needs_date'
  return errors
}

/**
 * `POST tasks` / `PUT tasks/{id}`. The due time is the instant at which the venue's clock reads the typed date and
 * time (midnight when only a day is given, as the full admin's form does), sent in UTC, so it reads back as typed. The
 * lead is named only on a new task (the server does not move a task to another lead).
 */
export function taskBody(draft: TaskDraft, zone: string, isNew: boolean): Record<string, unknown> {
  const body: Record<string, unknown> = {
    type: draft.type,
    title: draft.title.trim(),
    description: draft.description.trim() || null,
    due_at: draft.date ? wallToInstant(draft.date, draft.time || '00:00', zone) : null,
    assigned_to: draft.assignee,
  }
  if (isNew && draft.inquiryId) body.inquiry_id = draft.inquiryId
  return body
}

/** `POST tasks/{id}/complete`: an optional outcome, at most 60 characters. */
export function completeBody(outcome: string): { outcome?: string } {
  const clean = outcome.trim().slice(0, 60)
  return clean ? { outcome: clean } : {}
}

/** The quick dates beside the date box, from the venue's day. */
export function quickDates(today: string): { key: 'today' | 'tomorrow' | 'next_week'; date: string }[] {
  return [
    { key: 'today', date: today },
    { key: 'tomorrow', date: addDays(today, 1) },
    { key: 'next_week', date: addDays(today, 7) },
  ]
}

/** How a due time reads: the venue's day, and its time unless it is midnight (a day without a time). */
export function dueParts(iso: string | null | undefined, zone: string): { day: string; time: string | null } | null {
  const clock = venueClock(iso, zone)
  if (!clock) return null
  return { day: clock.date, time: clock.time === '00:00' ? null : clock.time }
}
