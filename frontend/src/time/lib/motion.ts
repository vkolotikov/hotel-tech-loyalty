/**
 * The arithmetic of the planner's motion (2026-11-28), pure so it can be tested: how far a count has got, how much of a
 * text is written, how long a reveal lasts. The components (ui/motion.tsx) only draw what these say, and none of it
 * runs for someone who asked their device for less motion.
 */

/** Whether the device lets things move (true where it cannot be asked: a test, an old browser). */
export function motionOk(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** A quick start and a soft landing, 0 → 1. */
export function easeOut(progress: number): number {
  const p = Math.min(1, Math.max(0, progress))
  return 1 - (1 - p) ** 3
}

/** A count on its way from 0 to `value` at `progress` (0 → 1): whole numbers, the value itself at the end. */
export function countAt(value: number, progress: number): number {
  if (progress >= 1) return value
  return Math.round(value * easeOut(progress))
}

/** How long a text takes to write itself: longer for a longer one, never slow (0.5 to 2.2 seconds). */
export function revealDuration(chars: number): number {
  return Math.min(2200, Math.max(500, chars * 14))
}

/** How many characters are written after `elapsed` of `duration` milliseconds. */
export function revealChars(total: number, elapsed: number, duration: number): number {
  if (duration <= 0 || elapsed >= duration) return total
  return Math.max(0, Math.floor((total * elapsed) / duration))
}

/** A bar's width in per cent: what it shows of `pct`, never past its track. */
export function barWidth(pct: number | null | undefined): number {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return 0
  return Math.min(100, Math.max(0, Math.round(pct)))
}

/** An item's wait before it appears in a list that fills in one by one: 45 ms apart, the wait capped at the 12th. */
export function staggerDelay(index: number, step = 45): number {
  return Math.min(Math.max(0, index), 12) * step
}
