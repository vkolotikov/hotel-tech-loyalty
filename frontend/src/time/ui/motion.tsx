import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { Sparkles } from 'lucide-react'
import { barWidth, countAt, motionOk } from '../lib/motion'
import { loadState } from '../plan/timeline'

/**
 * The pieces of the planner that move (2026-11-28): the AI's orb, a gauge, a counting figure, a load bar, lines still
 * being written, the thinking dots. Their styles are theme/time.css's `time-*` motion classes; a device that asked for
 * less motion gets each in its final state (the frame's rule, the stylesheet's own block, and `motionOk()` here).
 */

const ORB = { sm: 'h-8 w-8', md: 'h-12 w-12', lg: 'h-16 w-16' } as const
const ORB_ICON = { sm: 15, md: 22, lg: 28 } as const

/** The AI's mark: its violet with a slow halo, faster while it works. Decoration only. */
export function Orb({ size = 'md', busy = false, className = '' }: { size?: keyof typeof ORB; busy?: boolean; className?: string }) {
  return (
    <span aria-hidden data-busy={busy || undefined} className={`time-orb shrink-0 ${ORB[size]} ${className}`}>
      <Sparkles size={ORB_ICON[size]} />
    </span>
  )
}

/** Three dots while the AI thinks. Decoration only: say what is happening in words beside it. */
export function Dots() {
  return <span aria-hidden className="time-dots"><span /><span /><span /></span>
}

/** Lines still being written: the widths are Tailwind width classes (`w-3/4`), one per line. */
export function ShimmerLines({ widths = ['w-11/12', 'w-full', 'w-2/3'], className = '' }: { widths?: readonly string[]; className?: string }) {
  return (
    <span aria-hidden className={`block space-y-2 ${className}`}>
      {widths.map((w, i) => <span key={i} className={`block h-3 rounded-full time-shimmer ${w}`} />)}
    </span>
  )
}

/**
 * A gauge: a ring filled to `value` per cent, with what it says in the middle. The fill is drawn by the stylesheet
 * (pathLength 100, so the dash offset is the part still empty); `label` is what a screen reader hears.
 */
export function Ring({ value, size = 96, stroke = 9, label, children }: { value: number; size?: number; stroke?: number; label: string; children?: ReactNode }) {
  const r = (size - stroke) / 2
  const filled = barWidth(value)
  return (
    <span role="img" aria-label={label} className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="time-ring-track" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} pathLength={100} strokeDasharray="100" strokeDashoffset={100 - filled} className="time-ring-value" />
      </svg>
      <span aria-hidden className="absolute inset-0 grid place-items-center">{children}</span>
    </span>
  )
}

/**
 * A figure that counts up to its value when it appears. The page's own text is always the final figure (what a test, a
 * screen reader and a device without motion get); the count is written over it for under a second and ends on it.
 */
export function CountUp({ value, format = String, duration = 800 }: { value: number; format?: (n: number) => string; duration?: number }) {
  const node = useRef<HTMLSpanElement>(null)
  const text = format(value)
  useLayoutEffect(() => {
    // React's own text node is written to (never replaced), so a later render still finds it.
    const leaf = node.current?.firstChild
    if (!leaf) return
    leaf.nodeValue = text
    if (!motionOk() || !Number.isFinite(value) || value === 0) return
    let frame = 0
    const started = performance.now()
    const tick = (now: number) => {
      const progress = (now - started) / duration
      leaf.nodeValue = progress >= 1 ? text : format(countAt(value, progress))
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    leaf.nodeValue = format(0)
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
    // `format` is the caller's own wording of the same figure; a new one would restart the count for nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration, text])
  return <span ref={node}>{text}</span>
}

const LOAD_FILL = { none: 'time-load-ok', ok: 'time-load-ok', high: 'time-load-high', over: 'time-load-over' } as const

/** How full a day is: a track with its fill in the load's colour (room, nearly full, over), growing to its width. */
export function LoadBar({ pct, className = '' }: { pct: number | null | undefined; className?: string }) {
  const state = loadState(pct)
  return (
    <span aria-hidden className={`block h-1.5 overflow-hidden rounded-full bg-a-surface-2 ${className}`}>
      <span className={`block h-full rounded-full time-grow ${LOAD_FILL[state]}`} style={{ width: `${barWidth(pct)}%` }} />
    </span>
  )
}
