import { useCallback, useEffect, useRef, useState } from 'react'
import { DEFAULT_LAYOUT, sanitizeLayout, type DashLayout } from './dashboardMath'

/** Whether the person asked their system for less motion (no count-up, no drawing, no drifting sky). */
export function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

const easeOutCubic = (k: number) => 1 - (1 - k) ** 3

/**
 * A figure that counts up to its value when it first shows and glides to each new value after (900 ms). With reduced
 * motion, or before the page runs scripts, it is the value itself.
 */
export function useCountUp(target: number, duration = 900): number {
  const [shown, setShown] = useState(0)
  const [still] = useState(prefersReducedMotion)
  const from = useRef(0)
  useEffect(() => {
    if (!Number.isFinite(target) || still) return
    const start = performance.now()
    const a = from.current
    let raf = 0
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / duration)
      const v = a + (target - a) * easeOutCubic(k)
      from.current = v
      setShown(v)
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, duration, still])
  return Number.isFinite(target) && !still ? shown : target
}

/**
 * The person's own choice of widgets and their order, kept in this browser per person (a convenience: the dashboard
 * shows every widget when nothing is stored or storage is refused).
 */
export function useDashLayout(personKey: string | number | undefined): [DashLayout, (next: DashLayout) => void] {
  const key = `hx-dashboard-layout-v1:${personKey ?? 'anon'}`
  const [layout, setLayoutState] = useState<DashLayout>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw ? sanitizeLayout(JSON.parse(raw)) : DEFAULT_LAYOUT
    } catch {
      return DEFAULT_LAYOUT
    }
  })
  const setLayout = useCallback((next: DashLayout) => {
    setLayoutState(next)
    try { localStorage.setItem(key, JSON.stringify(next)) } catch { /* kept for this visit only */ }
  }, [key])
  return [layout, setLayout]
}
