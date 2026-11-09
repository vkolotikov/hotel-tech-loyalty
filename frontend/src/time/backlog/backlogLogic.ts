import { failureOf } from '../lib/api'
import { addDays, daysBetween, isDay, weekStart } from '../lib/dates'
import { assignmentOf, type PersonRef, type TaskForm } from '../lib/tasks'
import type { GroupDef, Task } from '../lib/types'

/**
 * The backlog's decisions (2026-11-09), pure because the page tests render to a string: which section the address
 * names, what the search and the type chips keep, how the pool falls into its horizons and due days, the figures, what a
 * refused claim means and the bodies the full admin's planner endpoints take. What is listed at all is the server's
 * (`planner/backlog`: my bucket, the pool my skills allow, the team's buckets for a manager).
 */

export const BACKLOG_TABS = ['mine', 'pool', 'team'] as const
export type BacklogTab = (typeof BACKLOG_TABS)[number]

/** The section `?tab=` names; the team's buckets only for someone who may see them, else my bucket. */
export function backlogTab(raw: string | null | undefined, canTeam: boolean): BacklogTab {
  if (raw === 'pool') return 'pool'
  if (raw === 'team' && canTeam) return 'team'
  return 'mine'
}

export type Horizon = 'day' | 'week' | 'general'

/** When a pool task should be done: by a day, this week, or anytime (no horizon, or one the planner does not know). */
export function horizonOf(task: Pick<Task, 'pool_horizon'>): Horizon {
  return task.pool_horizon === 'day' ? 'day' : task.pool_horizon === 'week' ? 'week' : 'general'
}

/* ─── Search and types ─────────────────────────────────────────────── */

export interface Filters { q: string; type: string }

/** Whether every word of the search is in the task's title, notes, type, task or person (any case). */
export function matchesSearch(task: Pick<Task, 'title' | 'description' | 'task_group' | 'task_category' | 'employee_name'>, q: string): boolean {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const hay = [task.title, task.description, task.task_group, task.task_category, task.employee_name]
    .filter((x): x is string => typeof x === 'string' && x !== '').join(' ').toLowerCase()
  return words.every(word => hay.includes(word))
}

/** The tasks the search and the chosen type keep, in their order. */
export function filterTasks<T extends Task>(tasks: T[], filters: Filters): T[] {
  return tasks.filter(task => (!filters.type || task.task_group === filters.type) && matchesSearch(task, filters.q))
}

export function isFiltered(filters: Filters): boolean {
  return filters.q.trim() !== '' || filters.type !== ''
}

/** The types the list holds, each with its count: in the settings' order, then any other type by name. */
export function typeCounts(tasks: Pick<Task, 'task_group'>[], groups: Pick<GroupDef, 'name'>[]): { name: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const task of tasks) {
    if (task.task_group) counts.set(task.task_group, (counts.get(task.task_group) ?? 0) + 1)
  }
  const known = groups.map(g => g.name).filter(name => counts.has(name))
  const others = [...counts.keys()].filter(name => !groups.some(g => g.name === name)).sort((a, b) => a.localeCompare(b))
  return [...known, ...others].map(name => ({ name, count: counts.get(name) ?? 0 }))
}

/* ─── Due days and order ───────────────────────────────────────────── */

export type DueState = 'late' | 'today' | 'tomorrow' | 'later'

export interface Due { date: string; state: DueState }

/** How a due day stands against today. A day already gone is `late` only while something is still open. */
export function dayState(date: string, today: string, open = true): DueState {
  const diff = daysBetween(today, date)
  if (diff < 0) return open ? 'late' : 'later'
  if (diff === 0) return 'today'
  if (diff === 1) return 'tomorrow'
  return 'later'
}

/**
 * The day a task without a day is due by, as the pool keeps it: a "by a day" task's own day; a "this week" task's end of
 * the week, late only once that week is behind us (a day's grace, as the full admin gives: the server works the week's
 * end out in UTC). Anytime has none.
 */
export function dueOf(task: Pick<Task, 'pool_horizon' | 'pool_due_date' | 'done'>, today: string): Due | null {
  const horizon = horizonOf(task)
  if (horizon === 'general' || !isDay(task.pool_due_date)) return null
  if (horizon === 'week') {
    return { date: task.pool_due_date, state: !task.done && daysBetween(task.pool_due_date, today) > 1 ? 'late' : 'later' }
  }
  return { date: task.pool_due_date, state: dayState(task.pool_due_date, today, !task.done) }
}

/** Open first, then high before normal before low; ties keep the server's order (newest first). */
export function sortStandard<T extends Pick<Task, 'done' | 'priority_rank'>>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => Number(a.done) - Number(b.done) || a.priority_rank - b.priority_rank)
}

/** Open first, then the soonest due day (the late ones lead; none last), then priority; ties keep the server's order. */
export function sortByDue<T extends Pick<Task, 'done' | 'priority_rank' | 'pool_due_date' | 'pool_horizon'>>(tasks: T[]): T[] {
  const dueKey = (task: T) => (horizonOf(task) !== 'general' && isDay(task.pool_due_date) ? task.pool_due_date : '9999-12-31')
  return [...tasks].sort((a, b) => Number(a.done) - Number(b.done) || dueKey(a).localeCompare(dueKey(b)) || a.priority_rank - b.priority_rank)
}

export interface DueGroup<T> { date: string | null; state: DueState | 'none'; tasks: T[] }

/** "By a day" tasks under their due day, soonest first (the late ones lead); a task missing its day comes last. */
export function dueGroups<T extends Task>(tasks: T[], today: string): DueGroup<T>[] {
  const byDate = new Map<string | null, T[]>()
  for (const task of tasks) {
    const date = isDay(task.pool_due_date) ? task.pool_due_date : null
    const list = byDate.get(date)
    if (list) list.push(task)
    else byDate.set(date, [task])
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => (a ?? '9999-12-31').localeCompare(b ?? '9999-12-31'))
    .map(([date, list]): DueGroup<T> => ({
      date,
      state: date ? dayState(date, today, list.some(x => !x.done)) : 'none',
      tasks: sortStandard(list),
    }))
}

export interface PoolGroups<T> { day: DueGroup<T>[]; dayCount: number; week: T[]; general: T[] }

/** The pool in its three horizons: by a day (under each due day), this week, anytime. */
export function poolGroups<T extends Task>(tasks: T[], today: string): PoolGroups<T> {
  const day = tasks.filter(x => horizonOf(x) === 'day')
  return {
    day: dueGroups(day, today),
    dayCount: day.length,
    week: sortByDue(tasks.filter(x => horizonOf(x) === 'week')),
    general: sortStandard(tasks.filter(x => horizonOf(x) === 'general')),
  }
}

/* ─── Figures ──────────────────────────────────────────────────────── */

/** An instant's day on the venue's clock (`YYYY-MM-DD`), or null. */
export function venueDay(iso: string | null | undefined, zone: string): string | null {
  if (!iso) return null
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return null
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at)
    const part = (type: string) => parts.find(p => p.type === type)?.value ?? ''
    const day = `${part('year')}-${part('month')}-${part('day')}`
    return isDay(day) ? day : at.toISOString().slice(0, 10)
  } catch {
    return at.toISOString().slice(0, 10)
  }
}

export const STALE_DAYS = 7

export interface BacklogFigures {
  /** Open tasks in my bucket. */
  mine: number
  /** Open tasks in the pool (as my skills allow). */
  pool: number
  /** Open "by a day" tasks, mine or the pool's, due by the end of this week (the late ones too). */
  dueThisWeek: number
  /** Of those, the ones whose day has gone. */
  late: number
  /** Open tasks nobody has changed for a week or more (the rows carry no creation time). */
  stale: number
  /** The last day of this week (Sunday), which "due this week" counts up to. */
  weekEnd: string
}

export function backlogFigures(mine: Task[], pool: Task[], today: string, zone: string): BacklogFigures {
  const openMine = mine.filter(x => !x.done)
  const openPool = pool.filter(x => !x.done)
  const open = [...openMine, ...openPool]
  const weekEnd = addDays(weekStart(today), 6)
  const due = open.filter(x => horizonOf(x) === 'day' && isDay(x.pool_due_date) && x.pool_due_date <= weekEnd)
  const stale = open.filter(x => {
    const day = venueDay(x.updated_at, zone)
    return day !== null && daysBetween(day, today) >= STALE_DAYS
  })
  return {
    mine: openMine.length,
    pool: openPool.length,
    dueThisWeek: due.length,
    late: due.filter(x => (x.pool_due_date as string) < today).length,
    stale: stale.length,
    weekEnd,
  }
}

/* ─── Writes ───────────────────────────────────────────────────────── */

export type ClaimFailure = 'taken' | 'skills' | 'other'

/** Why a claim was refused: someone else has it (409), my skills do not cover its type (403 naming the skill), or else. */
export function claimFailure(error: unknown): ClaimFailure {
  const failure = failureOf(error)
  if (failure.status === 409) return 'taken'
  if (failure.status === 403 && 'required_skill' in failure.extra) return 'skills'
  return 'other'
}

/** `PATCH planner/tasks/{id}/move` to put a task on a day as this person's. */
export function planBody(date: string, person: PersonRef): { task_date: string; assigned_to_user_id: number | null; employee_name: string | null } {
  return { task_date: date, ...assignmentOf(person) }
}

/** `PATCH planner/tasks/{id}/move` to put a task, still without a day, into this person's bucket. */
export function giveBody(person: PersonRef): { task_date: null; assigned_to_user_id: number | null; employee_name: string | null } {
  return { task_date: null, ...assignmentOf(person) }
}

/** What "New task" starts with in a section: no day; mine in my bucket, the pool's anytime, the team's nobody's yet. */
export function newTaskDefaults(tab: BacklogTab, staffKey: string): Partial<TaskForm> {
  return { task_date: '', person: tab === 'mine' ? staffKey : '', pool_horizon: tab === 'pool' ? 'general' : '' }
}

/** A new pool task in one horizon; "by a day" starts due today. */
export function horizonDefaults(horizon: Horizon, today: string): Partial<TaskForm> {
  return { task_date: '', person: '', pool_horizon: horizon, ...(horizon === 'day' ? { pool_due_date: today } : {}) }
}

/* ─── The team's buckets ───────────────────────────────────────────── */

export interface Bucket { key: string; user_id: number; name: string; tasks: Task[] }

export interface TeamBacklog { pool: Task[]; buckets: Bucket[] }

/** A bucket's open tasks and their minutes together. */
export function bucketLoad(tasks: Pick<Task, 'done' | 'minutes'>[]): { open: number; minutes: number } {
  const open = tasks.filter(x => !x.done)
  return { open: open.length, minutes: open.reduce((sum, x) => sum + (x.minutes > 0 ? x.minutes : 0), 0) }
}

/** The team's backlog as the filters keep it, every list in its order (open first, then priority). */
export function filterTeam(data: TeamBacklog, filters: Filters): TeamBacklog {
  return {
    pool: sortStandard(filterTasks(data.pool, filters)),
    buckets: data.buckets.map(b => ({ ...b, tasks: sortStandard(filterTasks(b.tasks, filters)) })),
  }
}

/** Every task of the team's backlog, the pool's first. */
export function teamTasks(data: TeamBacklog | undefined): Task[] {
  return data ? [...data.pool, ...data.buckets.flatMap(b => b.tasks)] : []
}
