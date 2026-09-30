import type { DateKey, MasterDay, Wall } from './types'
import { dateOf, minutesOf, wallMinutes } from './wallClock'

/** 72 px per hour: a 30-minute appointment is tall enough for a time and a name. */
export const PX_PER_MIN = 1.2
export const DEFAULT_START = 8 * 60
export const DEFAULT_END = 19 * 60

interface Timed { start: Wall; end: Wall }

/** The minutes an item occupies on `date`, clipped to that day; null when it starts on another day. */
function span(item: Timed, date: DateKey): [number, number] | null {
  if (dateOf(item.start) !== date) return null
  const from = wallMinutes(item.start)
  const to = dateOf(item.end) === date ? wallMinutes(item.end) : 1440
  return [from, Math.max(to, from + 5)]
}

/** The hours a day must show: 08:00–19:00, widened on whole hours to every working window and every appointment. */
export function dayRange(days: MasterDay[], items: Timed[], date: DateKey): { startMin: number; endMin: number } {
  let start = DEFAULT_START
  let end = DEFAULT_END
  for (const day of days) {
    for (const w of day.windows) {
      start = Math.min(start, minutesOf(w.start))
      end = Math.max(end, minutesOf(w.end))
    }
  }
  for (const item of items) {
    const s = span(item, date)
    if (s) {
      start = Math.min(start, s[0])
      end = Math.max(end, s[1])
    }
  }
  return { startMin: Math.floor(start / 60) * 60, endMin: Math.min(1440, Math.ceil(end / 60) * 60) }
}

export interface Placed<T> { item: T; top: number; height: number; lane: number; lanes: number }

/**
 * Where each card goes in a column. Overlapping appointments (a no-show and
 * its replacement, or data that was double-booked before the scheduler was
 * fixed) sit side by side in lanes — none is hidden behind another.
 */
export function placeAppointments<T extends Timed>(items: T[], date: DateKey, startMin: number): Placed<T>[] {
  const spans = items
    .map(item => ({ item, s: span(item, date) }))
    .filter((x): x is { item: T; s: [number, number] } => x.s !== null)
    .sort((a, b) => a.s[0] - b.s[0] || a.s[1] - b.s[1])

  const out: Placed<T>[] = []
  let cluster: { placed: Placed<T>; end: number }[] = []
  let clusterEnd = -1

  const close = () => {
    const lanes = cluster.reduce((max, c) => Math.max(max, c.placed.lane + 1), 1)
    for (const c of cluster) c.placed.lanes = lanes
    cluster = []
    clusterEnd = -1
  }

  for (const { item, s } of spans) {
    if (cluster.length > 0 && s[0] >= clusterEnd) close()
    const taken = new Set(cluster.filter(c => c.end > s[0]).map(c => c.placed.lane))
    let lane = 0
    while (taken.has(lane)) lane++
    const placed: Placed<T> = { item, top: (s[0] - startMin) * PX_PER_MIN, height: Math.max(22, (s[1] - s[0]) * PX_PER_MIN), lane, lanes: 1 }
    cluster.push({ placed, end: s[1] })
    clusterEnd = Math.max(clusterEnd, s[1])
    out.push(placed)
  }
  close()

  return out
}

export type CardDensity = 'full' | 'two' | 'tight' | 'line'

/**
 * What a card of this height has room for, so that nothing is ever clipped:
 * time, client and service (50 minutes and up); time and client (40–45);
 * the same two set tighter (30); one line (shorter).
 */
export function cardDensity(height: number): CardDensity {
  if (height >= 60) return 'full'
  if (height >= 44) return 'two'
  if (height >= 34) return 'tight'
  return 'line'
}

/**
 * Half-hour starts inside the working windows that no blocking appointment
 * touches — the buttons the grid offers. A convenience only: the server
 * checks the real duration and every rule at save.
 */
export function freeSlotStarts(day: MasterDay | undefined, busy: Timed[], date: DateKey, step = 30): number[] {
  if (!day) return []
  const taken = busy.map(b => span(b, date)).filter((s): s is [number, number] => s !== null)
  const out: number[] = []
  for (const w of day.windows) {
    const to = minutesOf(w.end)
    for (let m = Math.ceil(minutesOf(w.start) / step) * step; m + step <= to; m += step) {
      if (!taken.some(([from, until]) => m < until && m + step > from)) out.push(m)
    }
  }
  return out
}

/** The parts of [startMin, endMin] outside every working window — drawn tinted. */
export function offHours(day: MasterDay | undefined, startMin: number, endMin: number): [number, number][] {
  const windows = (day?.windows ?? [])
    .map(w => [minutesOf(w.start), minutesOf(w.end)] as [number, number])
    .sort((a, b) => a[0] - b[0])
  const out: [number, number][] = []
  let cursor = startMin
  for (const [from, to] of windows) {
    if (from > cursor) out.push([cursor, Math.min(from, endMin)])
    cursor = Math.max(cursor, to)
  }
  if (cursor < endMin) out.push([cursor, endMin])
  return out.filter(([from, to]) => to > from)
}
