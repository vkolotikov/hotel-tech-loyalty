import { useLayoutEffect, useRef, useState, type RefObject } from 'react'

/** The width a chart is drawn at before the page has measured its card (and in a render to a string). */
export const DEFAULT_WIDTH = 600

/**
 * A chart's own width in px, followed as its card grows and shrinks, so the drawing is made at the size it is shown
 * at: axis text stays 12 px on a phone and on a wide screen instead of being scaled with the picture.
 */
export function useWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T | null>(null)
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const measure = () => {
      const w = Math.floor(el.getBoundingClientRect().width)
      if (w > 0) setWidth(w)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, width]
}
