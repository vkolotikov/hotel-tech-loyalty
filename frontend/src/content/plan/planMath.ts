import { addDays, addMonths, formatDate, monthGrid, monthOf, weekOf } from '../../workspace/lib/wallClock'
import type { DateKey, PlanFigures, Platform, PostCard, PostStatus, Slot } from '../lib/types'

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

/**
 * A channel chip pressed (spec 2026-10-21 §6.2): the filter keeps the channels shown, none meaning every one; the chip
 * hides or shows its channel, every chip shown again is no filter, and the last channel showing stays.
 */
export function toggleShown(chosen: Platform[], platform: Platform, chips: Platform[]): Platform[] {
  const shown = chosen.length === 0 ? chips : chosen.filter(p => chips.includes(p))
  const next = shown.includes(platform) ? shown.filter(p => p !== platform) : chips.filter(p => p === platform || shown.includes(p))
  if (next.length === 0) return shown
  return chips.every(p => next.includes(p)) ? [] : next
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

/**
 * The open Unscheduled list's box (spec 2026-10-21 §6.2): it stays open while a card is dragged out of it, and then lets
 * the pointer through (faded), so the days under it take the drop.
 */
export function trayListClass(dragging: boolean): string {
  const base = 'absolute left-0 top-full z-30 mt-2 max-h-[60vh] w-80 max-w-[calc(100vw-2rem)] animate-a-pop overflow-y-auto rounded-xl border border-a-border bg-a-surface p-3 shadow-a-lg transition-opacity'
  return dragging ? `${base} pointer-events-none opacity-60` : base
}

/** The month view's numbers over its month alone (the grid's six weeks reach into the months around it), counted as the server counts a range. */
export function monthFigures(posts: PostCard[], slots: Slot[], date: DateKey): PlanFigures {
  const mine = posts.filter(p => p.scheduled_date !== null && inMonth(p.scheduled_date, date))
  return {
    planned: mine.filter(p => p.status !== 'skipped').length,
    ready: mine.filter(p => p.status === 'ready_to_publish').length,
    published: mine.filter(p => p.status === 'published').length,
    open_slots: slots.filter(s => inMonth(s.date, date)).length,
  }
}

/** One slot's name, for the one being filled ("2026-10-07|instagram"). */
export const slotKey = (slot: Slot): string => `${slot.date}|${slot.platform}`

/** After an AI fill comes back: open its post only while the portal still shows the brand it was made for. */
export const opensAfterFill = (madeFor: number | null, shownNow: number | null): boolean => madeFor === shownNow

/** Keep showing the last plan while the next range loads — but never another brand's (a switch, or the server's fallback). */
export const keepWithinBrand = (brand: number | null) =>
  <T,>(previous: T | undefined, previousQuery?: { queryKey: readonly unknown[] }): T | undefined =>
    previousQuery?.queryKey[1] === brand ? previous : undefined

/** The views in the order the calendar bar draws them (spec 2026-10-21 §6.3). */
export const VIEW_ORDER: PlanView[] = ['month', 'week', 'list']

/** The view a key moves to in the Month · Week · List radio group: the arrows wrap, Home and End go to the ends. */
export function viewAfter(view: PlanView, key: string): PlanView | null {
  const at = VIEW_ORDER.indexOf(view)
  if (key === 'ArrowRight' || key === 'ArrowDown') return VIEW_ORDER[(at + 1) % VIEW_ORDER.length]
  if (key === 'ArrowLeft' || key === 'ArrowUp') return VIEW_ORDER[(at - 1 + VIEW_ORDER.length) % VIEW_ORDER.length]
  if (key === 'Home') return VIEW_ORDER[0]
  if (key === 'End') return VIEW_ORDER[VIEW_ORDER.length - 1]
  return null
}

/** A month day's label (spec 2026-10-21 §6.4): its number, and its short month only when it belongs to another month. */
export function monthDayLabel(day: DateKey, shown: DateKey, locale: string): { number: string; month: string | null } {
  return { number: String(Number(day.slice(8))), month: monthOf(day) === monthOf(shown) ? null : formatDate(day, locale, { month: 'short' }) }
}
