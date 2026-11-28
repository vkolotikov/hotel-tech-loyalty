import { useCallback, useEffect, useState } from 'react'
import { motionOk, revealChars, revealDuration } from '../lib/motion'

/**
 * How much of an answer is written so far (2026-11-28): a fresh answer of `total` characters writes itself out in
 * under a few seconds; an older one, and any answer on a device that asked for less motion, is whole at once.
 * Returns the count and a way to finish at once (a press on the answer).
 */
export function useReveal(total: number, fresh: boolean): [number, () => void] {
  const animate = fresh && total > 0
  const [chars, setChars] = useState(() => (animate && motionOk() ? 0 : total))
  useEffect(() => {
    if (!animate || !motionOk()) return
    let frame = 0
    const started = performance.now()
    const duration = revealDuration(total)
    const tick = (now: number) => {
      const written = revealChars(total, now - started, duration)
      setChars(written)
      if (written < total) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [animate, total])
  const finish = useCallback(() => setChars(total), [total])
  // An answer that is no longer the fresh one is whole, wherever its writing had got to.
  return [animate ? Math.min(chars, total) : total, finish]
}
