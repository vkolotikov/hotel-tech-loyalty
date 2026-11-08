import { addDays, daysBetween, isDay, monthStart, weekStart } from '../lib/dates'
import type { Insights } from '../lib/types'

/**
 * Insights' decisions, kept pure because the page tests render to a string (2026-11-09). Every figure is the server's
 * (App\Services\Time\TimeInsights: done, on time, planned, tracked, accuracy, capacity, load, the pool's ages); these
 * only choose the period, read the address, compare a figure with the period before, order rows and size bars.
 */

/* ─── The period ─────────────────────────────────────────────────── */

/** The periods offered: this week (Monday to today), the last 7 days, this month, the last 30 days, last month, or chosen. */
export const RANGES = ['week', '7', 'month', '30', 'last_month', 'custom'] as const
export type RangeKind = (typeof RANGES)[number]

/** The period when the address names none: the last 7 days (always a whole week to compare with the one before). */
export const DEFAULT_RANGE: RangeKind = '7'

/** The longest period the server reads (TimeInsights::MAX_DAYS); a longer one is cut to its last 92 days. */
export const MAX_DAYS = 92

export interface Range { kind: RangeKind; from: string; to: string; clipped: boolean }

export function rangeKindOf(value: string | null | undefined): RangeKind {
  return (RANGES as readonly string[]).includes(value ?? '') ? (value as RangeKind) : DEFAULT_RANGE
}

/** A period ending `to` that is at most MAX_DAYS long, the earlier day first. */
function bounded(kind: RangeKind, a: string, b: string): Range {
  let from = a <= b ? a : b
  const to = a <= b ? b : a
  let clipped = false
  if (daysBetween(from, to) >= MAX_DAYS) {
    from = addDays(to, -(MAX_DAYS - 1))
    clipped = true
  }
  return { kind, from, to, clipped }
}

/**
 * The days a period covers, by the venue's today (wall-clock day maths, never the browser's clock). A chosen period
 * takes the days the address names; with neither valid it falls back to the default.
 */
export function rangeOf(kind: RangeKind, today: string, from?: string | null, to?: string | null): Range {
  switch (kind) {
    case 'week': return bounded(kind, weekStart(today), today)
    case '7': return bounded(kind, addDays(today, -6), today)
    case 'month': return bounded(kind, monthStart(today), today)
    case '30': return bounded(kind, addDays(today, -29), today)
    case 'last_month': {
      const end = addDays(monthStart(today), -1)
      return bounded(kind, monthStart(end), end)
    }
    case 'custom': {
      const f = isDay(from) ? from : null
      const t = isDay(to) ? to : null
      if (!f && !t) return rangeOf(DEFAULT_RANGE, today)
      return bounded('custom', f ?? (t as string), t ?? (f as string))
    }
  }
}

/** The period the address asks for (`?range=`, and `?from=&to=` for a chosen one). */
export function rangeFromSearch(search: URLSearchParams, today: string): Range {
  return rangeOf(rangeKindOf(search.get('range')), today, search.get('from'), search.get('to'))
}

/** The period the figures compare with: as many days, just before (the server's `previous`). */
export function previousRange(from: string, days: number): { from: string; to: string } {
  const n = Math.max(1, Math.round(days))
  return { from: addDays(from, -n), to: addDays(from, -1) }
}

/** The address for another period: a preset drops the chosen days; the default drops `range` too. */
export function withRange(prev: URLSearchParams, kind: RangeKind, from?: string, to?: string): URLSearchParams {
  const out = new URLSearchParams(prev)
  out.delete('from')
  out.delete('to')
  if (kind === DEFAULT_RANGE) out.delete('range')
  else out.set('range', kind)
  if (kind === 'custom') {
    if (from) out.set('from', from)
    if (to) out.set('to', to)
  }
  return out
}

/** The address with one value set, or removed when it is empty or the default. */
export function withParam(prev: URLSearchParams, key: string, value: string | null, fallback?: string): URLSearchParams {
  const out = new URLSearchParams(prev)
  if (value === null || value === '' || value === fallback) out.delete(key)
  else out.set(key, value)
  return out
}

/** The query key of a period's insights (one person's, or the team's with null); the page test seeds the same. */
export function insightsKey(from: string, to: string, person: string | null): readonly ['time', 'insights', string, string, string | null] {
  return ['time', 'insights', from, to, person] as const
}

/* ─── The page's sections ────────────────────────────────────────── */

export const SECTIONS = ['people', 'work', 'days'] as const
export type InsightsSection = (typeof SECTIONS)[number]

export function sectionOf(value: string | null | undefined): InsightsSection {
  return (SECTIONS as readonly string[]).includes(value ?? '') ? (value as InsightsSection) : 'people'
}

/** Whether the period has anything to show (the page says so instead of empty charts). */
export function isEmpty(data: Pick<Insights, 'totals'> | undefined): boolean {
  return !!data && data.totals.tasks === 0
}

/* ─── Against the period before ──────────────────────────────────── */

/** How a figure moved against the same-length period just before: up, down or level, by an amount. */
export interface Change { kind: 'up' | 'down' | 'same'; amount: number }

function changeOf(diff: number): Change {
  const amount = Math.abs(Math.round(diff))
  return { kind: amount === 0 ? 'same' : diff > 0 ? 'up' : 'down', amount }
}

/** Two of the server's percentages, in points ("+5 pts"); none when either period had nothing to rate. */
export function pointsChange(current: number | null | undefined, previous: number | null | undefined): Change | null {
  if (current === null || current === undefined || previous === null || previous === undefined) return null
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null
  return changeOf(current - previous)
}

/** Two of the server's counts or minutes, as the difference ("+6", "−2 h"); none when both periods had none. */
export function countChange(current: number | null | undefined, previous: number | null | undefined): Change | null {
  if (current === null || current === undefined || previous === null || previous === undefined) return null
  if (!Number.isFinite(current) || !Number.isFinite(previous) || (current === 0 && previous === 0)) return null
  return changeOf(current - previous)
}

/** Whether a move reads as good news: more finished on time is, more overdue is not, more tasks is neither. */
export function changeTone(change: Change | null, upIsGood: boolean | null): 'good' | 'bad' | 'plain' {
  if (!change || change.kind === 'same' || upIsGood === null) return 'plain'
  return (change.kind === 'up') === upIsGood ? 'good' : 'bad'
}

/* ─── Rows and bars ──────────────────────────────────────────────── */

type PersonRow = Insights['people'][number]

/** The people with anything in the period (work, or time they could be planned for), the most planned first. */
export function peopleRows(people: PersonRow[]): PersonRow[] {
  return people
    .filter(p => p.tasks > 0 || p.capacity_minutes > 0)
    .sort((a, b) => b.planned_minutes - a.planned_minutes || a.name.localeCompare(b.name))
}

type GroupRow = Insights['groups'][number]

/** The task types, the most planned first; work without a type last among equals. */
export function groupRows(groups: GroupRow[]): GroupRow[] {
  return [...groups].sort((a, b) => b.planned_minutes - a.planned_minutes || b.tasks - a.tasks
    || Number(a.task_group === null) - Number(b.task_group === null) || (a.task_group ?? '').localeCompare(b.task_group ?? ''))
}

/**
 * What the server's estimate accuracy says about a type: from 130 % its work takes longer than planned, at 70 % or
 * less it takes less (the thresholds of the server's own `takes_longer` / `takes_less` signals).
 */
export function accuracyNote(pct: number | null | undefined): 'longer' | 'shorter' | null {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return null
  if (pct >= 130) return 'longer'
  if (pct <= 70) return 'shorter'
  return null
}

/** A bar's length in percent of the longest; a bar with anything in it stays visible. */
export function barShare(value: number, max: number): number {
  if (!(value > 0) || !(max > 0)) return 0
  return Math.max(2, Math.min(100, Math.round((value / max) * 1000) / 10))
}

/** A load bar's fill: the server's load in percent, full at 100 % and beyond. */
export function loadWidth(pct: number | null | undefined): number {
  if (pct === null || pct === undefined || !(pct > 0)) return 0
  return Math.max(2, Math.min(100, pct))
}

/** The seven weekdays, Monday first, each present. */
export function weekdayRows(weekdays: Insights['weekdays']): Insights['weekdays'] {
  const byDay = new Map(weekdays.map(w => [w.weekday, w]))
  return Array.from({ length: 7 }, (_, i) => byDay.get(i + 1) ?? { weekday: i + 1, tasks: 0, done: 0, minutes: 0 })
}

/**
 * The hours timed tasks start in, every hour from the earliest to the latest present and at least the venue's working
 * window ("09".."17" for 09:00–18:00); none when no task had a time.
 */
export function hourRows(hours: Insights['hours'], window: { start: string; end: string }): { hour: number; label: string; tasks: number }[] {
  const used = hours.filter(h => h.tasks > 0)
  if (used.length === 0) return []
  const startH = Number(/^(\d{2})/.exec(window.start)?.[1] ?? 9)
  const endM = /^(\d{2}):(\d{2})/.exec(window.end)
  const endH = endM ? Math.max(0, Number(endM[1]) - (Number(endM[2]) === 0 ? 1 : 0)) : 17
  const first = Math.min(startH, ...used.map(h => h.hour))
  const last = Math.max(endH, ...used.map(h => h.hour))
  const byHour = new Map(used.map(h => [h.hour, h.tasks]))
  const out: { hour: number; label: string; tasks: number }[] = []
  for (let hour = Math.max(0, first); hour <= Math.min(23, last); hour++) out.push({ hour, label: String(hour).padStart(2, '0'), tasks: byHour.get(hour) ?? 0 })
  return out
}

/** One column of the days chart: its height against the busiest day, and the finished share drawn inside it. */
export interface DayBar { date: string; tasks: number; done: number; planned: number; doneMinutes: number; height: number; doneHeight: number }

export function dayBars(byDay: Insights['by_day']): DayBar[] {
  const max = Math.max(0, ...byDay.map(d => d.planned_minutes))
  return byDay.map(d => ({
    date: d.date, tasks: d.tasks, done: d.done, planned: d.planned_minutes, doneMinutes: d.done_minutes,
    height: barShare(d.planned_minutes, max),
    doneHeight: d.planned_minutes > 0 ? Math.min(100, Math.round((d.done_minutes / d.planned_minutes) * 1000) / 10) : 0,
  }))
}

/** Which columns carry a label under the chart: at most `max`, the latest always. */
export function labelled(count: number, max = 7): boolean[] {
  const step = Math.max(1, Math.ceil(count / max))
  return Array.from({ length: count }, (_, i) => (count - 1 - i) % step === 0)
}

/** The pool's age buckets (under a day, 1–3, 3–7, over 7 days), each with its share of the bar. */
export const POOL_BUCKETS = ['d0', 'd1', 'd3', 'd7'] as const
export type PoolBucket = (typeof POOL_BUCKETS)[number]

export function poolRows(pool: Insights['pool']): { key: PoolBucket; count: number; share: number }[] {
  const total = POOL_BUCKETS.reduce((n, key) => n + (pool[key] || 0), 0)
  return POOL_BUCKETS.map(key => ({ key, count: pool[key] || 0, share: total > 0 ? Math.round(((pool[key] || 0) / total) * 1000) / 10 : 0 }))
}

/** An instant's calendar day in the venue's zone (`YYYY-MM-DD`), or null. */
export function instantDay(iso: string | null | undefined, zone: string): string | null {
  if (!iso) return null
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return null
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: zone }).formatToParts(at)
    const part = (type: string) => parts.find(p => p.type === type)?.value ?? ''
    return `${part('year')}-${part('month')}-${part('day')}`
  } catch {
    return iso.slice(0, 10)
  }
}

/** A day (`YYYY-MM-DD`) as "4 Nov" for a chart's foot, read as a date, never converted. */
export function shortDay(ymd: string, lang: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd)
  if (!m) return ymd
  return new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])))
}

/** The people the person filter offers, by name. */
export function personOptions(people: { key: string; name: string }[]): { key: string; name: string }[] {
  return [...people].sort((a, b) => a.name.localeCompare(b.name)).map(p => ({ key: p.key, name: p.name }))
}
