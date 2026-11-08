import type { Lane, Task } from '../lib/types'

/** My day's decisions (pure; the tests render to a string). */

/** Morning before 12, afternoon before 18, else evening — by the venue's clock. */
export function partOfDay(now: string | null): 'morning' | 'afternoon' | 'evening' {
  const h = Number((now ?? '09:00').slice(0, 2))
  if (h < 12) return 'morning'
  if (h < 18) return 'afternoon'
  return 'evening'
}

/** How far the day is: tasks done of all, minutes done of planned, planned of capacity (each a whole percent or null). */
export function progressOf(me: Lane | null): { done: number; total: number; donePct: number | null; loadPct: number | null } {
  if (!me) return { done: 0, total: 0, donePct: null, loadPct: null }
  const total = me.tasks.length
  const done = me.tasks.filter(t => t.done).length
  return { done, total, donePct: total > 0 ? Math.round((done / total) * 100) : null, loadPct: me.load_pct }
}

/** The day's tasks without a time, open ones first then by priority. */
export function untimed(me: Lane | null): Task[] {
  return (me?.tasks ?? []).filter(t => t.start_time === null).sort((a, b) => Number(a.done) - Number(b.done) || a.priority_rank - b.priority_rank || a.id - b.id)
}

/** The day's timed tasks, as the timeline draws them. */
export function timed(me: Lane | null): Task[] {
  return (me?.tasks ?? []).filter(t => t.start_time !== null)
}

/** The longest bar of the week strip is full height; the others in proportion. */
export function weekHeights(week: { minutes: number }[]): number[] {
  const max = Math.max(1, ...week.map(d => d.minutes))
  return week.map(d => Math.round((d.minutes / max) * 100))
}
