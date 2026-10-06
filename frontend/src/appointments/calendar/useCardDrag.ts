import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import type { AppointmentSummary } from '../lib/types'
import type { GridColumn } from './calendarState'
import {
  LONG_PRESS_MS, TOUCH_SLOP_PX, columnAt, edgeScroll, isDragClick, movedStart, onRelease, pointerStartsDrag, rawMinuteAt,
  resizedLength, touchStartsDrag, type Why,
} from './dragMath'

export type DragKind = 'move' | 'resize'
export interface DragOrigin { appt: AppointmentSummary; colIndex: number; start: number; length: number }
export interface DragPlace { colIndex: number; start: number; length: number; why: Why | null }
export interface DragState {
  kind: DragKind
  origin: DragOrigin
  place: DragPlace
  phase: 'dragging' | 'confirming'
  /** While confirming: the column dropped on, kept from the release — the row can change under an open confirm. */
  column?: GridColumn
}

/** Where a touch on a card is: nothing, a press that may still become a swipe, or a drag. */
export type TouchState = 'idle' | 'pressing' | 'dragging'

/**
 * What a release leaves: a confirm pinned to the column under it, or nothing
 * (the card's own place, outside every column, a place that will not do).
 */
export function releasedDrop(kind: DragKind, origin: DragOrigin, place: DragPlace, columns: GridColumn[]): DragState | null {
  const column = columns[place.colIndex]
  return column && onRelease(place, origin) === 'confirm' ? { kind, origin, place, phase: 'confirming', column } : null
}

/**
 * One non-passive touch listener for the calendar's life, not one per press:
 * Safari decides when a finger lands whether the page may stop it scrolling,
 * so a listener added during the press comes too late. It stops the scroll
 * only during a drag, and the long-press menu over a pressed card.
 */
export function installTouchGuard(target: EventTarget, state: () => TouchState): () => void {
  const onTouchMove = (e: Event) => { if (state() === 'dragging') e.preventDefault() }
  const onContextMenu = (e: Event) => { if (state() !== 'idle') e.preventDefault() }
  target.addEventListener('touchmove', onTouchMove, { passive: false })
  target.addEventListener('contextmenu', onContextMenu)
  return () => {
    target.removeEventListener('touchmove', onTouchMove)
    target.removeEventListener('contextmenu', onContextMenu)
  }
}

interface Options {
  /** The row of columns; each column carries `data-col`, and the scroll box above it `data-calendar-scroll`. */
  gridRef: RefObject<HTMLDivElement | null>
  startMin: number
  /** The columns as drawn now; a release pins the one under it. */
  columns: GridColumn[]
  /** Why a place will not do, as far as the calendar can tell (dragMath.whyNot). */
  check: (colIndex: number, start: number, length: number, appointmentId: number) => Why | null
}

/**
 * The calendar's own drag layer (Part F). A card follows a mouse, pen or
 * finger, snaps to 15 minutes and to the column under it, and on release
 * waits for a confirm. A touch drag starts with a still press, so a swipe
 * still scrolls; Escape cancels. Nothing here talks to the server.
 */
export function useCardDrag({ gridRef, startMin, columns, check }: Options) {
  const [drag, setDrag] = useState<DragState | null>(null)
  /** When the last drag ended (performance.now()); the click the release itself fires is ignored. */
  const dragEndedAt = useRef<number | null>(null)
  const touchState = useRef<TouchState>('idle')
  const columnsNow = useRef(columns)

  useEffect(() => { columnsNow.current = columns }, [columns])
  useEffect(() => installTouchGuard(window, () => touchState.current), [])

  const cancel = useCallback(() => setDrag(null), [])

  const begin = useCallback((e: ReactPointerEvent<HTMLElement>, kind: DragKind, origin: DragOrigin) => {
    if (e.button !== 0 || (kind === 'resize' && e.pointerType === 'touch')) return
    const grid = gridRef.current
    if (!grid) return
    const touch = e.pointerType === 'touch'
    const pointerId = e.pointerId
    const x0 = e.clientX
    const y0 = e.clientY
    const t0 = performance.now()
    const boxes = () => [...grid.querySelectorAll<HTMLElement>('[data-col]')].map(el => el.getBoundingClientRect())
    const grab = rawMinuteAt(y0 - (boxes()[origin.colIndex]?.top ?? 0), startMin) - origin.start
    const scroller = grid.closest<HTMLElement>('[data-calendar-scroll]')
    let active = false
    let x = x0
    let y = y0
    let raf = 0
    let place: DragPlace = { colIndex: origin.colIndex, start: origin.start, length: origin.length, why: null }
    if (touch) touchState.current = 'pressing'

    const placeAt = (): DragPlace => {
      const rects = boxes()
      const colIndex = kind === 'resize' ? origin.colIndex : columnAt(x, rects)
      const top = rects[colIndex < 0 ? origin.colIndex : colIndex]?.top ?? 0
      const minute = rawMinuteAt(y - top, startMin)
      const start = kind === 'move' ? movedStart(minute, grab, origin.length) : origin.start
      const length = kind === 'resize' ? resizedLength(origin.start, minute) : origin.length
      return { colIndex, start, length, why: colIndex < 0 ? null : check(colIndex, start, length, origin.appt.id) }
    }
    const show = () => {
      place = placeAt()
      setDrag({ kind, origin, place, phase: 'dragging' })
    }
    const tick = () => {
      raf = 0
      if (!active || !scroller) return
      const [dx, dy] = edgeScroll({ x, y }, scroller.getBoundingClientRect())
      if (dx === 0 && dy === 0) return
      scroller.scrollBy(dx, dy)
      show()
      raf = requestAnimationFrame(tick)
    }

    function finish(release: boolean) {
      window.clearTimeout(timer)
      if (raf) cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('keydown', onKey)
      touchState.current = 'idle'
      if (!active) return
      dragEndedAt.current = performance.now()
      setDrag(release ? releasedDrop(kind, origin, place, columnsNow.current) : null)
    }
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      x = ev.clientX
      y = ev.clientY
      const moved = Math.hypot(x - x0, y - y0)
      if (!active) {
        if (touch) {
          if (moved > TOUCH_SLOP_PX) finish(false) // a swipe: let the page scroll
          return
        }
        if (!pointerStartsDrag(moved)) return
        active = true
      }
      show()
      if (!raf) raf = requestAnimationFrame(tick)
    }
    const onUp = (ev: PointerEvent) => { if (ev.pointerId === pointerId) finish(true) }
    const onCancel = (ev: PointerEvent) => { if (ev.pointerId === pointerId) finish(false) }
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape' && active) { ev.preventDefault(); finish(false) } }
    const timer = touch
      ? window.setTimeout(() => {
          if (touchStartsDrag(performance.now() - t0, Math.hypot(x - x0, y - y0))) {
            active = true
            touchState.current = 'dragging' // from here the page must not scroll under the finger
            show()
          }
        }, LONG_PRESS_MS)
      : 0

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('keydown', onKey)
  }, [gridRef, startMin, check])

  /** True for the click that ends a drag (that click must not open the panel); false for any later click. */
  const consumeClick = useCallback(() => {
    const was = isDragClick(dragEndedAt.current, performance.now())
    dragEndedAt.current = null
    return was
  }, [])

  return { drag, begin, consumeClick, cancel }
}
