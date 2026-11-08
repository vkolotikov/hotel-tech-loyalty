import { addDays, isDay, weekStart } from '../lib/dates'
import type { Board, Task, Week } from '../lib/types'
import type { TimelineLane } from './DayTimeline'

/**
 * The Planner page's decisions (pure; the tests render to a string): which lanes a day shows, what has no time yet, where
 * the arrows go, and what a week's cell holds.
 */

/** The lane of the day's timed work nobody has yet. */
export const NOBODY = ''

export type View = 'day' | 'week'

export interface PlanQuery { date: string; view: View; person: string | null; everyone: boolean }

/** The page's state from its address: a valid day (else today), the view, one person, and whether people off that day show. */
export function readQuery(search: URLSearchParams, today: string): PlanQuery {
  const date = search.get('date')
  return {
    date: isDay(date) ? date : today,
    view: search.get('view') === 'week' ? 'week' : 'day',
    person: search.get('person') || null,
    everyone: search.get('all') === '1',
  }
}

/** One step back or forward: a day in the day view, a week in the week view. */
export function step(q: PlanQuery, direction: -1 | 1): string {
  return addDays(q.view === 'week' ? weekStart(q.date) : q.date, direction * (q.view === 'week' ? 7 : 1))
}

/**
 * The lanes of a day: one per person (only who works that day or has work in it, unless `everyone`), then "Nobody yet"
 * when the day has timed work without a person. Each lane carries its timed tasks only; the untimed ones are listed
 * apart (untimedOf).
 */
export function lanesOf(board: Board, everyone: boolean, nobodyName: string): TimelineLane[] {
  const lanes: TimelineLane[] = board.people
    .filter(p => everyone || p.works || p.tasks.length > 0)
    .map(p => ({
      key: p.key, name: p.name, works: p.works, window: p.window,
      tasks: p.tasks.filter(t => t.start_time !== null),
      load_pct: p.load_pct, planned_minutes: p.planned_minutes, capacity_minutes: p.capacity_minutes,
    }))
  const timedNobody = board.unassigned.filter(t => t.start_time !== null)
  if (timedNobody.length > 0) {
    lanes.push({ key: NOBODY, name: nobodyName, works: true, window: board.window, tasks: timedNobody })
  }
  return lanes
}

/** The day's work without a time, open first, high priority first, with whose it is. */
export function untimedOf(board: Board): { task: Task; person: string | null; name: string | null }[] {
  const rows = [
    ...board.people.flatMap(p => p.tasks.filter(t => t.start_time === null).map(task => ({ task, person: p.key as string | null, name: p.name as string | null }))),
    ...board.unassigned.filter(t => t.start_time === null).map(task => ({ task, person: null, name: null })),
  ]
  return rows.sort((a, b) => Number(a.task.done) - Number(b.task.done) || a.task.priority_rank - b.task.priority_rank || a.task.id - b.task.id)
}

/** Every task a day shows, for a drop or a sentence to find by id. */
export function allTasks(board: Board): Task[] {
  return [...board.people.flatMap(p => [...p.tasks, ...p.overdue]), ...board.unassigned]
}

/** A week's cell: its tasks in time order (untimed last) and how many more than `max` there are. */
export function cellOf(tasks: Task[], max = 3): { shown: Task[]; more: number } {
  const sorted = [...tasks].sort((a, b) => (a.start_time ?? '99:99').localeCompare(b.start_time ?? '99:99') || a.priority_rank - b.priority_rank)
  return { shown: sorted.slice(0, max), more: Math.max(0, sorted.length - max) }
}

/** The people a week shows: who works or has work that week (or everyone). */
export function weekPeople(week: Week, everyone: boolean): Week['people'] {
  return week.people.filter(p => everyone || p.days.some(d => d.works || d.tasks.length > 0))
}
