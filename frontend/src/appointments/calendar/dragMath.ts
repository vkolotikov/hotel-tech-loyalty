import { PX_PER_MIN } from '../lib/layout'
import { isLive } from '../lib/status'
import type { AppointmentSummary, DateKey, MasterDay } from '../lib/types'
import { dateOf, minutesOf, wallMinutes } from '../lib/wallClock'

/** Drags snap to 15 minutes; a length is 15 minutes to 8 hours — the server's own rule (StaffBookingWriter). */
export const DRAG_STEP = 15
export const MIN_LENGTH = 15
export const MAX_LENGTH = 480
/** A mouse or pen press becomes a drag after this many pixels; a touch press after being held this long, this still. */
export const DRAG_THRESHOLD_PX = 4
export const LONG_PRESS_MS = 400
export const TOUCH_SLOP_PX = 8
/** Near the calendar's edges, a drag scrolls it by this much a frame. */
export const EDGE_PX = 40
export const EDGE_SPEED = 12

/** The (unsnapped) minute of the day at `offsetPx` below the top of a column whose first hour is `startMin`. */
export const rawMinuteAt = (offsetPx: number, startMin: number): number => startMin + offsetPx / PX_PER_MIN

/** The column whose [left, right) holds `x`; -1 outside every column. */
export function columnAt(x: number, boxes: { left: number; right: number }[]): number {
  return boxes.findIndex(b => x >= b.left && x < b.right)
}

/** Where a moved card starts: the pointer's minute less where the card was grabbed, snapped, kept inside the day. */
export function movedStart(pointerMinute: number, grabMinutes: number, length: number): number {
  const start = Math.round((pointerMinute - grabMinutes) / DRAG_STEP) * DRAG_STEP
  return Math.min(Math.max(start, 0), 1440 - length)
}

/** The length a bottom-edge drag gives: the start stays, the end snaps; 15 minutes to 8 hours, never past midnight. */
export function resizedLength(start: number, pointerMinute: number): number {
  const raw = Math.round((pointerMinute - start) / DRAG_STEP) * DRAG_STEP
  return Math.min(MAX_LENGTH, 1440 - start, Math.max(MIN_LENGTH, raw))
}

export type DropReason = 'past_day' | 'not_eligible' | 'outside_hours' | 'overlap'
export interface Why { reason: DropReason; other?: AppointmentSummary }

export const REASON_FALLBACK: Record<DropReason, string> = {
  outside_hours: "Outside {{name}}'s hours",
  overlap: "Overlaps {{client}}'s appointment",
  not_eligible: "{{name}} doesn't do {{service}}",
  past_day: 'That day has passed',
}

export interface DropCheck {
  date: DateKey
  start: number
  end: number
  masterId: number
  day: MasterDay | undefined
  /** Who performs the appointment's service; null when the calendar does not know the service (no check). */
  serviceMasterIds: number[] | null
  /** The other appointments in the target column. */
  others: AppointmentSummary[]
  today: DateKey
}

const endOf = (a: AppointmentSummary): number => (dateOf(a.end) === dateOf(a.start) ? wallMinutes(a.end) : 1440)

/**
 * Why the calendar can already tell a place will not do — null when it may.
 * A convenience only: the server decides at Save. Order: the day, the person,
 * the hours (working windows already have time off taken out), an overlap
 * with a live appointment (R3: the scheduler's own set).
 */
export function whyNot(c: DropCheck): Why | null {
  if (c.date < c.today) return { reason: 'past_day' }
  if (c.serviceMasterIds !== null && !c.serviceMasterIds.includes(c.masterId)) return { reason: 'not_eligible' }
  const inside = (c.day?.windows ?? []).some(w => c.start >= minutesOf(w.start) && c.end <= minutesOf(w.end))
  if (!inside) return { reason: 'outside_hours' }
  const other = c.others.find(a => isLive(a.status) && dateOf(a.start) === c.date && c.start < endOf(a) && c.end > wallMinutes(a.start))
  return other ? { reason: 'overlap', other } : null
}

/** A touch press becomes a drag only when held still long enough; a swipe scrolls the page. */
export const touchStartsDrag = (heldMs: number, movedPx: number): boolean => heldMs >= LONG_PRESS_MS && movedPx <= TOUCH_SLOP_PX

/** A mouse or pen press becomes a drag once it moves a few pixels; less is a click. */
export const pointerStartsDrag = (movedPx: number): boolean => movedPx >= DRAG_THRESHOLD_PX

/** What a release does: nothing at the card's own place, outside every column, or over a place that will not do. */
export function onRelease(
  place: { colIndex: number; start: number; length: number; why: Why | null },
  from: { colIndex: number; start: number; length: number },
): 'none' | 'confirm' {
  if (place.colIndex < 0 || place.why !== null) return 'none'
  return place.colIndex === from.colIndex && place.start === from.start && place.length === from.length ? 'none' : 'confirm'
}

/** The same snapped place and the same verdict: nothing to redraw (polish F5). */
export function samePlace(
  a: { colIndex: number; start: number; length: number; why: Why | null },
  b: { colIndex: number; start: number; length: number; why: Why | null },
): boolean {
  return a.colIndex === b.colIndex && a.start === b.start && a.length === b.length
    && a.why?.reason === b.why?.reason && a.why?.other?.id === b.why?.other?.id
}

/**
 * Where a drop waiting for its Save sits now: the column with the same day
 * and person, wherever the row has put it; -1 once the calendar no longer
 * shows them (another date, another view, the person gone). A column's
 * position changes under an open confirm, its day and person do not.
 */
export function pinnedColumnIndex(
  columns: { date: DateKey; master: { id: number } }[],
  pinned: { date: DateKey; master: { id: number } },
): number {
  return columns.findIndex(c => c.date === pinned.date && c.master.id === pinned.master.id)
}

/**
 * A click this soon after a drag ends is the drag's own (the browser fires
 * it when the release lands on the card) and must not open the panel. A drag
 * released elsewhere fires no click, so a later click is a real one.
 */
export const DRAG_CLICK_MS = 250
export const isDragClick = (dragEndedAt: number | null, clickAt: number): boolean =>
  dragEndedAt !== null && clickAt >= dragEndedAt && clickAt - dragEndedAt < DRAG_CLICK_MS

/** How far to scroll the calendar this frame when the pointer is near one of its edges. */
export function edgeScroll(p: { x: number; y: number }, box: { top: number; bottom: number; left: number; right: number }): [number, number] {
  const dx = p.x < box.left + EDGE_PX ? -EDGE_SPEED : p.x > box.right - EDGE_PX ? EDGE_SPEED : 0
  const dy = p.y < box.top + EDGE_PX ? -EDGE_SPEED : p.y > box.bottom - EDGE_PX ? EDGE_SPEED : 0
  return [dx, dy]
}
