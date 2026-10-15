import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { PostCard } from '../lib/types'
import { LONG_PRESS_MS, dropTargetAt, isDragClick, pointerStartsDrag, touchStartsDrag, TOUCH_SLOP_PX, type DropTarget } from './moveMath'

export interface DragState { post: PostCard; x: number; y: number; target: DropTarget | null }
type TouchState = 'idle' | 'pressing' | 'dragging'

/**
 * One non-passive touch listener for the page's life, not one per press:
 * Safari decides when a finger lands whether the page may stop it scrolling.
 * It stops the scroll only during a drag, and the long-press menu over a
 * pressed card (as Appointments' calendar does).
 */
function installTouchGuard(target: EventTarget, state: () => TouchState): () => void {
  const onTouchMove = (e: Event) => { if (state() === 'dragging') e.preventDefault() }
  const onContextMenu = (e: Event) => { if (state() !== 'idle') e.preventDefault() }
  target.addEventListener('touchmove', onTouchMove, { passive: false })
  target.addEventListener('contextmenu', onContextMenu)
  return () => {
    target.removeEventListener('touchmove', onTouchMove)
    target.removeEventListener('contextmenu', onContextMenu)
  }
}

/**
 * The Plan's drag layer (spec §4.2). A card follows a mouse, pen or finger
 * over the days and the tray and is dropped where it is released. A touch
 * drag starts with a still press, so a swipe still scrolls. Escape cancels
 * and is claimed, so an open panel stays open. Published posts do not move.
 * Nothing here talks to the server: `onDrop` does.
 */
export function useCardDrag(onDrop: (post: PostCard, target: DropTarget) => void) {
  const [state, setState] = useState<DragState | null>(null)
  /** When the last drag ended (performance.now()); the click the release fires is not an opening. */
  const endedAt = useRef<number | null>(null)
  const touch = useRef<TouchState>('idle')
  const drop = useRef(onDrop)
  useEffect(() => { drop.current = onDrop }, [onDrop])
  useEffect(() => installTouchGuard(window, () => touch.current), [])

  const begin = useCallback((e: ReactPointerEvent<HTMLElement>, post: PostCard) => {
    if (e.button !== 0 || post.status === 'published') return
    const isTouch = e.pointerType === 'touch'
    const pointerId = e.pointerId
    const x0 = e.clientX
    const y0 = e.clientY
    const t0 = performance.now()
    let active = false
    let x = x0
    let y = y0
    if (isTouch) touch.current = 'pressing'

    const targetNow = () => dropTargetAt(document.elementFromPoint(x, y))
    const show = () => setState({ post, x, y, target: targetNow() })

    function finish(release: boolean) {
      window.clearTimeout(timer)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('keydown', onKey, true)
      touch.current = 'idle'
      if (!active) return
      endedAt.current = performance.now()
      const target = release ? targetNow() : null
      setState(null)
      if (target) drop.current(post, target)
    }
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      x = ev.clientX
      y = ev.clientY
      const moved = Math.hypot(x - x0, y - y0)
      if (!active) {
        if (isTouch) {
          if (moved > TOUCH_SLOP_PX) finish(false) // a swipe: let the page scroll
          return
        }
        if (!pointerStartsDrag(moved)) return
        active = true
      }
      show()
    }
    const onUp = (ev: PointerEvent) => { if (ev.pointerId === pointerId) finish(true) }
    const onCancel = (ev: PointerEvent) => { if (ev.pointerId === pointerId) finish(false) }
    // Heard before the panel (capture) and claimed while dragging, so an open panel stays.
    const onKey = (ev: KeyboardEvent) => {
      if (!active || ev.key !== 'Escape') return
      ev.preventDefault()
      finish(false)
    }
    const timer = isTouch
      ? window.setTimeout(() => {
          if (touchStartsDrag(performance.now() - t0, Math.hypot(x - x0, y - y0))) {
            active = true
            touch.current = 'dragging' // from here the page must not scroll under the finger
            show()
          }
        }, LONG_PRESS_MS)
      : 0

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('keydown', onKey, true)
  }, [])

  /** True for the click that ends a drag (it must not open the panel); false for any later click. */
  const consumeClick = useCallback(() => {
    const was = isDragClick(endedAt.current, performance.now())
    endedAt.current = null
    return was
  }, [])

  return { state, begin, consumeClick }
}
