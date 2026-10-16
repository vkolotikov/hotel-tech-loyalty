import { addDays, isDateKey } from '../../workspace/lib/wallClock'
import { failureOf, type ContentApi } from '../lib/api'
import type { DateKey, PostCard } from '../lib/types'

/** Where a dragged card is dropped: a day, or the tray ("no day"). */
export type DropTarget = { kind: 'day'; date: DateKey } | { kind: 'tray' }

/** A mouse or pen press becomes a drag after this many pixels; a finger after being held this long and this still (as Appointments). */
export const DRAG_THRESHOLD_PX = 4
export const LONG_PRESS_MS = 400
export const TOUCH_SLOP_PX = 8
/** The click a release fires comes within this many milliseconds; a later click is a click. */
export const DRAG_CLICK_MS = 400

interface ElementLike { closest: (selector: string) => { getAttribute: (name: string) => string | null } | null }

/** Where the element under the pointer drops a card: the day it is in ([data-drop-date]), the tray ([data-drop="tray"]), or nowhere. */
export function dropTargetAt(el: ElementLike | null): DropTarget | null {
  if (!el || typeof el.closest !== 'function') return null
  const day = el.closest('[data-drop-date]')?.getAttribute('data-drop-date')
  if (day && isDateKey(day)) return { kind: 'day', date: day }
  return el.closest('[data-drop="tray"]') ? { kind: 'tray' } : null
}

/** The date a drop gives a post (null: the tray); undefined when the drop changes nothing. */
export function movedDate(from: DateKey | null, to: DropTarget): DateKey | null | undefined {
  const date = to.kind === 'day' ? to.date : null
  return date === from ? undefined : date
}

/** Shift+← → on a focused card: the day before or after; undefined for any other key, or a post with no day. */
export function keyMove(date: DateKey | null, key: string, shift: boolean): DateKey | undefined {
  if (!shift || date === null) return undefined
  if (key === 'ArrowLeft') return addDays(date, -1)
  if (key === 'ArrowRight') return addDays(date, 1)
  return undefined
}

export const pointerStartsDrag = (moved: number): boolean => moved >= DRAG_THRESHOLD_PX
export const touchStartsDrag = (heldMs: number, moved: number): boolean => heldMs >= LONG_PRESS_MS && moved <= TOUCH_SLOP_PX
export const isDragClick = (endedAt: number | null, now: number): boolean => endedAt !== null && now - endedAt < DRAG_CLICK_MS

export type MoveResult = { ok: true; moved: PostCard } | { ok: false; code: string }

/**
 * One move (a drop, Shift+arrow, an Undo): the post as it was read, to its
 * new day (null: the tray), and, for an Undo, the time it had. Never throws.
 */
export async function movePost(api: Pick<ContentApi, 'movePost'>, post: PostCard, to: DateKey | null, time?: string | null): Promise<MoveResult> {
  try {
    const { post: moved } = await api.movePost(post.id, { updated_at: post.updated_at, scheduled_date: to, ...(time !== undefined ? { scheduled_time: time } : {}) })
    return { ok: true, moved }
  } catch (error) {
    return { ok: false, code: failureOf(error).code }
  }
}

/** What Undo sends: the moved post (its new version) back to the day and the time it had (a move to the tray clears the time). */
export const undoOf = (before: PostCard, moved: PostCard): { post: PostCard; to: DateKey | null; time: string | null } =>
  ({ post: moved, to: before.scheduled_date, time: before.scheduled_time })

/**
 * The Plan's moves: a saved move is put on the plan at once (`place`), then
 * the plan is read again; a refusal places nothing and reads the plan again
 * when it shows something no longer true. One post moves once at a time: a
 * second move of it while the first is on its way answers `busy` unsent
 * (it would carry the version the first one replaces).
 */
export function createMover({ api, place, refresh }: {
  api: Pick<ContentApi, 'movePost'>
  place: (moved: PostCard) => void
  refresh: () => Promise<unknown>
}) {
  const moving = new Set<number>()
  return async (post: PostCard, to: DateKey | null, time?: string | null): Promise<MoveResult> => {
    if (moving.has(post.id)) return { ok: false, code: 'busy' }
    moving.add(post.id)
    try {
      const result = await movePost(api, post, to, time)
      if (result.ok) {
        place(result.moved)
        await refresh()
      } else if (refetchAfter(result.code)) {
        await refresh()
      }
      return result
    } finally {
      moving.delete(post.id)
    }
  }
}

/** After a refused move, whether the plan must be read again: it shows something that is no longer true, or the answer was lost (the move may have happened). */
export const refetchAfter = (code: string): boolean => code === 'changed_elsewhere' || code === 'not_found' || code === 'published_cannot_move' || code === 'network'

/** A keyboard move to a day outside the range on screen: the Plan shows that day's week and keeps the card focused. */
export const leavesRange = (to: DateKey, range: { from: DateKey; to: DateKey }): boolean => to < range.from || to > range.to
