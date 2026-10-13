import { claimEscape, type EscapeLike } from './dropDialog'

/**
 * The rest before a card's preview opens, and Escape closing it, kept out of
 * the grid so they can be tested on their own (the grid is a component; this
 * is plain timing and key handling).
 */

/** How long the pointer (or the keyboard focus) rests on a card before its preview opens. */
export const PREVIEW_DELAY_MS = 300

/** What opened a preview: the pointer resting on its card, or the keyboard's focus on it. Its hint says how to open the appointment accordingly. */
export type PreviewOpener = 'pointer' | 'focus'

/** What a preview is for: the card, the grid's columns as they were when the rest on it began (`gridKey`), and what opened it. */
export interface PreviewFor { id: number; grid: string; by: PreviewOpener }

/**
 * The grid's columns as one key: each column's key and its date. A day view's
 * columns keep their keys (one per person) from one day to the next, so the
 * date is what tells Tuesday's grid from Wednesday's.
 */
export function gridKey(columns: readonly { key: string; date: string }[]): string {
  return columns.map(c => `${c.key}@${c.date}`).join(' ')
}

/**
 * A preview stays only while the grid still draws its card, in the columns it
 * opened in. Nothing else closes it when the card goes away without the pointer
 * or the focus leaving it (T, ← →, W / D, a refresh that no longer has it):
 * coming back would draw it where neither is, and its Escape listener would
 * swallow the next Escape.
 */
export function previewStillShown(preview: Pick<PreviewFor, 'id' | 'grid'>, drawn: ReadonlySet<number>, grid: string): boolean {
  return preview.grid === grid && drawn.has(preview.id)
}

/**
 * How long an open preview stays after the pointer leaves its card, so the
 * pointer can cross the gap onto the preview (WCAG 1.4.13: hoverable).
 */
export const PREVIEW_GRACE_MS = 150

export interface PreviewTimer<T> {
  /** Begin resting on a card: its preview opens after the delay. Resting on another card starts over; back on the card whose preview is open, it stays. */
  start: (what: T) => void
  /** The pointer left a card: nothing opens, and an open preview closes after the grace unless the pointer reaches it or comes back. */
  leave: () => void
  /** The pointer is on the preview: it stays open, and nothing else opens. */
  hold: () => void
  /** Close now (focus moved on, a click, Escape, the pointer left the preview, a drag, the card gone). */
  end: () => void
  /** Stop whatever is pending without touching what is shown (a drag began, or the grid went away). */
  cancel: () => void
}

/** `show(what)` opens a card's preview, `show(null)` closes it. */
export function createPreviewTimer<T extends { id: number }>(show: (what: T | null) => void, delay = PREVIEW_DELAY_MS, grace = PREVIEW_GRACE_MS): PreviewTimer<T> {
  let opening: ReturnType<typeof setTimeout> | undefined
  let closing: ReturnType<typeof setTimeout> | undefined
  let shown: T | null = null
  const put = (what: T | null) => { shown = what; show(what) }
  const stopOpening = () => { if (opening !== undefined) clearTimeout(opening); opening = undefined }
  const stopClosing = () => { if (closing !== undefined) clearTimeout(closing); closing = undefined }
  const cancel = () => { stopOpening(); stopClosing() }
  return {
    start: (what) => {
      if (shown !== null && shown.id === what.id) { cancel(); return }
      stopOpening()
      opening = setTimeout(() => { opening = undefined; stopClosing(); put(what) }, delay)
    },
    leave: () => {
      stopOpening()
      if (shown === null) return
      stopClosing()
      closing = setTimeout(() => { closing = undefined; put(null) }, grace)
    },
    hold: cancel,
    end: () => { cancel(); put(null) },
    cancel,
  }
}

/**
 * The pointer left a preview for its own card (`to`: the pointer event's
 * `relatedTarget`, the element it went onto). The card then keeps its
 * preview; anywhere else, leaving the preview closes it.
 */
export function ontoOwnCard(to: unknown, id: number): boolean {
  const el = to as { closest?: (selector: string) => { getAttribute: (name: string) => string | null } | null } | null | undefined
  return typeof el?.closest === 'function' && el.closest('[data-stop]')?.getAttribute('data-stop') === `appt:${id}`
}

/**
 * Escape with a preview open closes it and nothing else (WCAG 1.4.13: dismissable
 * without moving the pointer or the focus). It claims the key the way a drag and
 * the drop dialog do, so an open panel stays; any other key is not ours.
 */
export function previewEscape(e: EscapeLike, close: () => void): void {
  claimEscape(e, close)
}

/** What `watchPreviewEscape` needs of a window: it takes and gives back a keydown listener. */
export interface KeydownTarget {
  addEventListener: (type: 'keydown', listener: (e: KeyboardEvent) => void, capture: boolean) => void
  removeEventListener: (type: 'keydown', listener: (e: KeyboardEvent) => void, capture: boolean) => void
}

/**
 * While a preview is open, Escape is heard in the capture phase wherever the
 * focus is (a mouse-opened preview leaves it on the page or in the panel). Returns
 * the function that stops listening. Without an open preview nothing listens,
 * so Escape behaves exactly as before.
 */
export function watchPreviewEscape(target: KeydownTarget, close: () => void): () => void {
  const onKey = (e: KeyboardEvent) => previewEscape(e, close)
  target.addEventListener('keydown', onKey, true)
  return () => target.removeEventListener('keydown', onKey, true)
}
