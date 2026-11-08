import { toMinutes } from '../lib/dates'
import type { Task } from '../lib/types'

/**
 * Where things sit on a day's timeline (pure; the frontend tests render to a string): the hours shown, a task's top
 * and height, side-by-side columns for tasks that overlap, the "now" line, and the time a drop at a height means.
 */

export const HOUR_PX = 64

export interface Range { start: number; end: number }

/** The hours drawn: the working window widened to whole hours and to every timed task, at least 8 hours. */
export function visibleRange(window: { start: string; end: string }, tasks: Pick<Task, 'start_time' | 'minutes'>[]): Range {
  let start = toMinutes(window.start) ?? 9 * 60
  let end = toMinutes(window.end) ?? 18 * 60
  for (const t of tasks) {
    const s = toMinutes(t.start_time)
    if (s === null) continue
    start = Math.min(start, s)
    end = Math.max(end, s + t.minutes)
  }
  start = Math.max(0, Math.floor(start / 60) * 60 - 60)
  end = Math.min(24 * 60, Math.ceil(end / 60) * 60 + 60)
  if (end - start < 8 * 60) end = Math.min(24 * 60, start + 8 * 60)
  return { start, end }
}

export function topOf(minutes: number, range: Range, hourPx = HOUR_PX): number {
  return ((minutes - range.start) / 60) * hourPx
}

export function heightOf(minutes: number, hourPx = HOUR_PX): number {
  return Math.max(22, (minutes / 60) * hourPx - 2)
}

export interface Placed<T> { item: T; column: number; columns: number; start: number; end: number }

/** Timed tasks with the column each takes among those it overlaps (greedy, by start), and how many columns its cluster has. */
export function columnsOf<T extends Pick<Task, 'start_time' | 'minutes' | 'id'>>(tasks: T[]): Placed<T>[] {
  const timed = tasks
    .map(item => ({ item, start: toMinutes(item.start_time), end: 0 }))
    .filter((x): x is { item: T; start: number; end: number } => x.start !== null)
    .map(x => ({ ...x, end: x.start + x.item.minutes }))
    .sort((a, b) => a.start - b.start || b.end - a.end || a.item.id - b.item.id)

  const out: Placed<T>[] = []
  let cluster: Placed<T>[] = []
  let clusterEnd = -1
  const close = () => {
    const columns = Math.max(1, ...cluster.map(p => p.column + 1))
    cluster.forEach(p => { p.columns = columns })
    out.push(...cluster)
    cluster = []
  }
  for (const x of timed) {
    if (cluster.length > 0 && x.start >= clusterEnd) close()
    const used = new Set(cluster.filter(p => p.end > x.start).map(p => p.column))
    let column = 0
    while (used.has(column)) column++
    cluster.push({ item: x.item, column, columns: 1, start: x.start, end: x.end })
    clusterEnd = Math.max(clusterEnd, x.end)
  }
  if (cluster.length > 0) close()
  return out
}

/** The time a point `y` pixels from the top of the timeline means, snapped to `step` minutes and kept inside the range. */
export function minutesAt(y: number, range: Range, step = 15, hourPx = HOUR_PX): number {
  const raw = range.start + (y / hourPx) * 60
  const snapped = Math.round(raw / step) * step
  return Math.max(range.start, Math.min(range.end - step, snapped))
}

/** A load's state for its bar: room, nearly full (from 85 %), or over (above 100 %). */
export function loadState(pct: number | null | undefined): 'none' | 'ok' | 'high' | 'over' {
  if (pct === null || pct === undefined) return 'none'
  if (pct > 100) return 'over'
  if (pct >= 85) return 'high'
  return 'ok'
}
