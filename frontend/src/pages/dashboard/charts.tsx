import { useId, useMemo, useState, type PointerEvent, type ReactNode } from 'react'
import { DASH_HUE, fill } from '../../theme/dashboardPalette'
import { areaPath, indexAt, niceTicks, ringArcs, scalePoints, smoothPath } from './dashboardMath'

/**
 * The dashboard's charts, drawn as SVG (the dashboard is the first page after sign-in, so no chart library joins the
 * main bundle). Lines draw themselves in, areas fade up, rings sweep round (dashboard.css), all still with reduced
 * motion. Colours are registered hues through fill() and ink() (theme/dashboardPalette.ts), so Clean light deepens them.
 */

/** A small line with its area, for a figure's last days. */
export function Sparkline({ values, hue, height = 36, label }: { values: number[]; hue: string; height?: number; label?: string }) {
  const gid = useId().replace(/:/g, '')
  const w = 120
  const pts = useMemo(() => scalePoints(values, w, height, 3), [values, height])
  if (values.length < 2) return null
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="dash-spark block w-full" style={{ height }} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <defs>
        <linearGradient id={`sg${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: fill(hue), stopOpacity: 0.32 }} />
          <stop offset="100%" style={{ stopColor: fill(hue), stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      <path d={areaPath(pts, height)} className="dash-area" style={{ fill: `url(#sg${gid})` }} />
      <path d={smoothPath(pts)} pathLength={1} className="dash-line" vectorEffect="non-scaling-stroke" style={{ fill: 'none', stroke: fill(hue), strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }} />
    </svg>
  )
}

export interface ChartSeries {
  key: string
  label: string
  hue: string
  values: number[]
  /** `area` (stacked on the series before it when `stack`), `line`, or `bar` (side by side). */
  kind: 'area' | 'line' | 'bar'
}

/**
 * The main chart: days along the bottom, a rounded value axis, the series as areas, lines or bars, and a crosshair
 * that names the day under the pointer (or the keyboard: arrows move it) with each series' figure.
 */
export function TrendChart({ dates, series, format, dayLabel, stack = false, height = 240, emptyText }: {
  dates: string[]
  series: ChartSeries[]
  format: (v: number) => string
  dayLabel: (date: string, long?: boolean) => string
  stack?: boolean
  height?: number
  emptyText: string
}) {
  const gid = useId().replace(/:/g, '')
  const [hover, setHover] = useState<number | null>(null)
  const W = 600, H = height, PAD = 0
  const n = dates.length
  const stacked = useMemo(() => {
    if (!stack) return series.map(s => s.values)
    const acc: number[][] = []
    series.forEach((s, i) => acc.push(s.values.map((v, d) => v + (i > 0 ? acc[i - 1][d] : 0))))
    return acc
  }, [series, stack])
  const barSeries = series.filter(s => s.kind === 'bar')
  const max = Math.max(0, ...stacked.flat())
  const ticks = niceTicks(max)
  const top = ticks[ticks.length - 1]
  const empty = max <= 0

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    setHover(indexAt(((e.clientX - box.left) / box.width) * W, W, n, PAD))
  }
  const xAt = (i: number) => (n <= 1 ? 50 : (i / (n - 1)) * 100)
  const labelEvery = Math.max(1, Math.ceil(n / 7))

  return (
    <div className="relative select-none">
      <div className="flex">
        {/* Value axis */}
        <div className="relative w-12 shrink-0" style={{ height: H }} aria-hidden="true">
          {ticks.map(tk => (
            <span key={tk} className="absolute right-2 -translate-y-1/2 text-[10px] tabular-nums text-t-muted" style={{ top: `${100 - (tk / top) * 100}%` }}>
              {format(tk)}
            </span>
          ))}
        </div>
        <div
          className="relative flex-1 outline-hidden focus-visible:ring-2 focus-visible:ring-primary-400/60 rounded-lg"
          style={{ height: H }}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          tabIndex={0}
          role="group"
          aria-label={series.map(s => s.label).join(', ')}
          onKeyDown={e => {
            if (e.key === 'ArrowRight') { e.preventDefault(); setHover(h => Math.min(n - 1, (h ?? n - 2) + 1)) }
            if (e.key === 'ArrowLeft') { e.preventDefault(); setHover(h => Math.max(0, (h ?? n) - 1)) }
            if (e.key === 'Escape') setHover(null)
          }}
          onBlur={() => setHover(null)}
        >
          {/* Grid lines */}
          {ticks.map(tk => (
            <div key={tk} className="absolute inset-x-0 border-t border-dashed border-dark-border" style={{ top: `${100 - (tk / top) * 100}%` }} aria-hidden="true" />
          ))}
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
            <defs>
              {series.map(s => (
                <linearGradient key={s.key} id={`tg${gid}${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" style={{ stopColor: fill(s.hue), stopOpacity: stack ? 0.55 : 0.35 }} />
                  <stop offset="100%" style={{ stopColor: fill(s.hue), stopOpacity: stack ? 0.12 : 0 }} />
                </linearGradient>
              ))}
            </defs>
            {[...series].map((s, i) => ({ s, i })).reverse().map(({ s, i }) => {
              if (s.kind === 'bar') return null
              const pts = scalePoints(stacked[i], W, H, PAD, top)
              return (
                <g key={s.key}>
                  {s.kind === 'area' && <path d={areaPath(pts, H)} className="dash-area" style={{ fill: `url(#tg${gid}${s.key})` }} />}
                  <path d={smoothPath(pts)} pathLength={1} className="dash-line" vectorEffect="non-scaling-stroke" style={{ fill: 'none', stroke: fill(s.hue), strokeWidth: 2.25, strokeLinecap: 'round', strokeLinejoin: 'round' }} />
                </g>
              )
            })}
            {barSeries.length > 0 && dates.map((_, d) => {
              const slot = W / n
              const gap = slot * 0.22
              const bw = (slot - gap) / barSeries.length
              return barSeries.map((s, b) => {
                const v = s.values[d] ?? 0
                const bh = top > 0 ? (v / top) * H : 0
                return (
                  <rect key={`${s.key}${d}`} x={d * slot + gap / 2 + b * bw} y={H - bh} width={Math.max(1, bw - 1)} height={bh} rx={2}
                    className="dash-bar" style={{ fill: fill(s.hue, hover === null || hover === d ? 0.9 : 0.45), animationDelay: `${Math.min(d * 14, 500)}ms` }} />
                )
              })
            })}
          </svg>
          {empty && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-t-muted">{emptyText}</div>
          )}
          {/* Crosshair and the day's figures */}
          {hover !== null && !empty && (
            <>
              <div className="pointer-events-none absolute inset-y-0 w-px bg-white/25" style={{ left: `${xAt(hover)}%` }} aria-hidden="true" />
              {barSeries.length === 0 && series.map((s, i) => (
                <span key={s.key} className="pointer-events-none absolute left-0 top-0 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-dark-surface"
                  style={{ left: `${xAt(hover)}%`, top: `${100 - ((stacked[i][hover] ?? 0) / top) * 100}%`, background: fill(s.hue) }} aria-hidden="true" />
              ))}
              <div
                className="dash-tip pointer-events-none absolute top-1 z-10 min-w-[150px] rounded-xl border border-dark-border bg-dark-surface2 px-3 py-2 shadow-lg"
                style={xAt(hover) > 60 ? { right: `${100 - xAt(hover) + 2}%` } : { left: `${xAt(hover) + 2}%` }}
                role="status"
              >
                <p className="mb-1 text-[11px] font-semibold text-white">{dayLabel(dates[hover], true)}</p>
                {series.map(s => (
                  <p key={s.key} className="flex items-center gap-2 text-[11px] text-t-secondary">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: fill(s.hue) }} aria-hidden="true" />
                    <span className="flex-1 truncate">{s.label}</span>
                    <span className="font-semibold tabular-nums text-white">{format(s.values[hover] ?? 0)}</span>
                  </p>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      {/* Day axis */}
      <div className="relative ml-12 mt-2 h-4" aria-hidden="true">
        {dates.map((d, i) => (i % labelEvery === 0 || i === n - 1) && (i === n - 1 || n - 1 - i >= labelEvery / 2) ? (
          <span key={d} className={`absolute whitespace-nowrap text-[10px] text-t-muted ${i === 0 ? '' : i === n - 1 ? '-translate-x-full' : '-translate-x-1/2'}`} style={{ left: `${xAt(i)}%` }}>{dayLabel(d)}</span>
        ) : null)}
      </div>
    </div>
  )
}

/** A ring of shares with something in its middle (the total). */
export function Ring({ parts, size = 148, thickness = 16, children }: {
  parts: { key: string; value: number; hue: string }[]
  size?: number
  thickness?: number
  children?: ReactNode
}) {
  const radius = (size - thickness) / 2
  const c = 2 * Math.PI * radius
  const arcs = ringArcs(parts)
  const hueOf = (key: string) => parts.find(p => p.key === key)?.hue ?? DASH_HUE.indigo
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} className="stroke-dark-surface2" style={{ fill: 'none', strokeWidth: thickness }} />
        {arcs.map((a, i) => (
          <circle key={a.key} cx={size / 2} cy={size / 2} r={radius} className="dash-ring"
            style={{
              fill: 'none', stroke: fill(hueOf(a.key)), strokeWidth: thickness, strokeLinecap: 'butt',
              strokeDasharray: `${a.length * c} ${c}`, strokeDashoffset: -a.start * c,
              ['--ring-len' as string]: `${a.length * c}`, ['--ring-c' as string]: `${c}`, animationDelay: `${i * 90}ms`,
            }} />
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  )
}
