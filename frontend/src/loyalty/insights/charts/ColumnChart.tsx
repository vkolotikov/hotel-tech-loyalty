import { axisRoom, columnPath, columnWidth, compact, scaleFor, splitScale, stackSegments } from '../insightsMath'
import type { BucketKind } from '../types'
import { MARGIN, type Series } from './frame'
import { DataTable, XLabels, YTicks } from './parts'
import { useWidth } from './useWidth'

/**
 * Columns per bucket (spec 2026-10-21 release 2 §5): one series, several stacked (a 2 px gap of the card's colour
 * between segments), or split at a zero line — `up` above it, `down` below it, as points issued against points
 * redeemed and expired; the axis below the line counts upwards from it too. Drawn at the card's own width; the
 * outermost segment has 4 px rounded corners, the zero line's side stays square. The drawing is hidden from screen
 * readers, which read the same numbers in a table; each bucket's full height is a hover target whose tooltip says
 * what it holds.
 */
export function ColumnChart({ caption, heading, keys, kind, short, long, up, down = [], format, locale, height = 180 }: {
  /** Names the table for a screen reader. */
  caption: string
  /** The table's first column: "Day", "Week of", "Month". */
  heading: string
  keys: string[]
  kind: BucketKind
  /** Each bucket's axis label and its full name (insightsMath `bucketShort` / `bucketLong`). */
  short: string[]
  long: string[]
  up: Series[]
  down?: Series[]
  /** A value as text: points, a count. */
  format: (n: number) => string
  locale: string
  height?: number
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const sum = (series: Series[], i: number) => series.reduce((n, s) => n + Math.max(0, s.values[i] ?? 0), 0)
  const maxUp = Math.max(0, ...keys.map((_, i) => sum(up, i)))
  const maxDown = Math.max(0, ...keys.map((_, i) => sum(down, i)))
  const split = down.length > 0 ? splitScale(maxUp, maxDown) : null
  const scale = scaleFor(maxUp)
  const topValue = split ? split.up : scale.top
  // Below the zero line the axis counts the points going out, upwards from it, so its labels carry no sign.
  const ticks = (split ? [...split.upTicks, ...split.downTicks.map(v => -v)] : scale.ticks)
    .map(value => ({ value, label: compact(Math.abs(value), locale) }))

  const left = axisRoom(ticks.map(t => t.label))
  const plotWidth = Math.max(40, width - left - MARGIN.right)
  const plotHeight = height - MARGIN.top - MARGIN.bottom
  const slot = plotWidth / Math.max(1, keys.length)
  const barWidth = columnWidth(slot)
  const pxPer = plotHeight / Math.max(1, topValue + (split ? split.down : 0))
  const base = MARGIN.top + topValue * pxPer
  const all = [...up, ...down]

  return (
    <div ref={ref} className="w-full min-w-0">
      <svg aria-hidden="true" focusable="false" width="100%" height={height} viewBox={`0 0 ${width} ${height}`} data-chart="columns" className="block">
        <YTicks ticks={ticks} yOf={v => base - v * pxPer} left={left} right={left + plotWidth} />
        {keys.map((key, i) => {
          const x = left + slot * i + (slot - barWidth) / 2
          return (
            <g key={key} data-bucket={key}>
              {stackSegments(up.map(s => s.values[i] ?? 0), pxPer).map(seg => (
                <path key={`up-${seg.series}`} className={`l-chart-${up[seg.series].tone}`} d={columnPath(x, base - seg.start, barWidth, seg.size, -1, seg.end)} />
              ))}
              {stackSegments(down.map(s => s.values[i] ?? 0), pxPer).map(seg => (
                <path key={`down-${seg.series}`} className={`l-chart-${down[seg.series].tone}`} d={columnPath(x, base + seg.start, barWidth, seg.size, 1, seg.end)} />
              ))}
              <rect className="l-chart-hit" x={left + slot * i} y={MARGIN.top} width={slot} height={plotHeight}>
                <title>{`${long[i]}: ${all.map(s => `${s.name} ${format(s.values[i] ?? 0)}`).join(', ')}`}</title>
              </rect>
            </g>
          )
        })}
        <XLabels labels={short} slot={slot} left={left} y={height - MARGIN.bottom + 6} plotWidth={plotWidth} kind={kind} />
      </svg>
      <DataTable caption={caption} heads={[heading, ...all.map(s => s.name)]}
        rows={keys.map((key, i) => ({ key, cells: [long[i], ...all.map(s => format(s.values[i] ?? 0))] }))} />
    </div>
  )
}
