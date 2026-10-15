import { addDays, addMonths, formatDate, monthGrid, monthOf, weekOf } from '../../workspace/lib/wallClock'
import type { DateKey, Platform, PostCard, PostStatus, Slot } from '../lib/types'

/** The Plan's views (spec §4.2): the week (default), the month, and the list, the only one below 1024 px. */
export type PlanView = 'week' | 'month' | 'list'
export interface PlanRange { from: DateKey; to: DateKey; days: DateKey[] }

/** The days a view shows around `date`: its Monday-first week (week and list), or the six weeks that hold its month. */
export function rangeFor(view: PlanView, date: DateKey): PlanRange {
  const days = view === 'month' ? monthGrid(monthOf(date)) : weekOf(date)
  return { from: days[0], to: days[days.length - 1], days }
}

/** One page back or forward: a week, or a month (landing on its first day). */
export function shiftDate(view: PlanView, date: DateKey, step: 1 | -1): DateKey {
  return view === 'month' ? `${addMonths(monthOf(date), step)}-01` : addDays(date, 7 * step)
}

/** Untimed posts first (spec §4.2), then by time, then oldest first. */
export function byTime(a: PostCard, b: PostCard): number {
  if (a.scheduled_time === null) return b.scheduled_time === null ? a.id - b.id : -1
  if (b.scheduled_time === null) return 1
  return a.scheduled_time.localeCompare(b.scheduled_time) || a.id - b.id
}

export interface DayPlan { date: DateKey; posts: PostCard[]; slots: Slot[] }

/** Each shown day with its posts, in order, and its open slots. */
export function plansFor(days: DateKey[], posts: PostCard[], slots: Slot[]): DayPlan[] {
  return days.map(date => ({
    date,
    posts: posts.filter(p => p.scheduled_date === date).sort(byTime),
    slots: slots.filter(s => s.date === date),
  }))
}

/** The platform chips and the status choice; no platform chosen means every platform. */
export interface PlanFilter { platforms: Platform[]; status: PostStatus | 'all' }
export const NO_FILTER: PlanFilter = { platforms: [], status: 'all' }

/** What the filters leave on the plan. Slots follow the platforms only: an empty slot has no status. */
export function filtered(posts: PostCard[], slots: Slot[], filter: PlanFilter): { posts: PostCard[]; slots: Slot[] } {
  const platformOk = (p: Platform) => filter.platforms.length === 0 || filter.platforms.includes(p)
  return {
    posts: posts.filter(p => platformOk(p.platform) && (filter.status === 'all' || p.status === filter.status)),
    slots: slots.filter(s => platformOk(s.platform)),
  }
}

export function togglePlatform(chosen: Platform[], platform: Platform): Platform[] {
  return chosen.includes(platform) ? chosen.filter(p => p !== platform) : [...chosen, platform]
}

/** The chips worth showing: the platforms the plan holds and those already chosen, in the brand's order. */
export function presentPlatforms(order: Platform[], posts: PostCard[], slots: Slot[], chosen: Platform[]): Platform[] {
  const seen = new Set<Platform>([...posts.map(p => p.platform), ...slots.map(s => s.platform), ...chosen])
  return order.filter(p => seen.has(p))
}

/** The toolbar's title: "5 Oct – 11 Oct 2026" for a week (or the list), "October 2026" for a month. */
export function rangeLabel(view: PlanView, range: PlanRange, date: DateKey, locale: string): string {
  if (view === 'month') return formatDate(`${monthOf(date)}-01`, locale, { month: 'long', year: 'numeric' })
  return `${formatDate(range.from, locale, { day: 'numeric', month: 'short' })} – ${formatDate(range.to, locale, { day: 'numeric', month: 'short', year: 'numeric' })}`
}

/** Whether a day of the month grid belongs to the month shown (the days around it are dimmed). */
export const inMonth = (day: DateKey, date: DateKey): boolean => monthOf(day) === monthOf(date)

/** One slot's name, for the one being filled ("2026-10-07|instagram"). */
export const slotKey = (slot: Slot): string => `${slot.date}|${slot.platform}`
