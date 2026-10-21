import { axisRoom, compact, linePaths, scaleFor } from '../insightsMath'
import type { BucketKind } from '../types'
import { MARGIN } from './frame'
import { DataTable, XLabels, YTicks } from './parts'
import { useWidth } from './useWidth'

/**
 * One series as a 2 px line through the buckets' centres (spec 2026-10-21 release 2 §5: members over time), a 10 %
 * wash under it, the last bucket's dot with a ring of the card's colour and its value beside it. The axis starts at
 * zero; the buckets sit where the columns of a chart beside it sit. As every chart here, hidden from screen readers in
 * favour of a table, with a hover tooltip on each bucket.
 */
export function LineChart({ caption, heading, name, keys, kind, short, long, values, format, locale, height = 160 }: {
  caption: string
  heading: string
  /** The series' name, for the table and the tooltips. */
  name: string
  keys: string[]
  kind: BucketKind
  short: string[]
  long: string[]
  values: number[]
  format: (n: number) => string
  locale: string
  height?: number
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const scale = scaleFor(Math.max(0, ...values))
  const ticks = scale.ticks.map(value => ({ value, label: compact(value, locale) }))
  const left = axisRoom(ticks.map(t => t.label))
  const plotWidth = Math.max(40, width - left - MARGIN.right)
  const plotHeight = height - MARGIN.top - MARGIN.bottom
  const slot = plotWidth / Math.max(1, keys.length)
  const base = MARGIN.top + plotHeight
  const yOf = (v: number) => base - (Math.max(0, v) / scale.top) * plotHeight
  const points = values.map((v, i) => ({ x: left + slot * (i + 0.5), y: yOf(v) }))
  const { line, area } = linePaths(points, base)
  const end = points[points.length - 1]

  return (
    <div ref={ref} className="w-full min-w-0">
      <svg aria-hidden="true" focusable="false" width="100%" height={height} viewBox={`0 0 ${width} ${height}`} data-chart="line" className="block">
        <YTicks ticks={ticks} yOf={yOf} left={left} right={left + plotWidth} />
        {area && <path className="l-chart-wash-1" d={area} />}
        {line && <path className="l-chart-line-1" d={line} />}
        {end && (
          <>
            <circle className="l-chart-1 l-chart-ring" cx={end.x} cy={end.y} r={4} />
            <text x={end.x - 8} y={Math.max(MARGIN.top, end.y - 8)} textAnchor="end" className="l-chart-value">{format(values[values.length - 1])}</text>
          </>
        )}
        {keys.map((key, i) => (
          <rect key={key} className="l-chart-hit" x={left + slot * i} y={MARGIN.top} width={slot} height={plotHeight}>
            <title>{`${long[i]}: ${name} ${format(values[i])}`}</title>
          </rect>
        ))}
        <XLabels labels={short} slot={slot} left={left} y={height - MARGIN.bottom + 6} plotWidth={plotWidth} kind={kind} />
      </svg>
      <DataTable caption={caption} heads={[heading, name]} rows={keys.map((key, i) => ({ key, cells: [long[i], format(values[i])] }))} />
    </div>
  )
}
