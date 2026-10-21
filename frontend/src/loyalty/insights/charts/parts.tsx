import type { ReactNode } from 'react'
import { labelled } from '../insightsMath'
import type { BucketKind } from '../types'
import { labelWidth, type Tone } from './frame'

/** A legend for two or more series: a swatch beside each name, the name in the text's own ink. */
export function Legend({ series }: { series: { name: string; tone: Tone }[] }) {
  if (series.length < 2) return null
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-a-text-2" data-legend="">
      {series.map(s => (
        <li key={s.name} className="inline-flex items-center gap-1.5">
          <span aria-hidden className={`inline-block h-2.5 w-2.5 rounded-sm l-chart-bar-${s.tone}`} />
          {s.name}
        </li>
      ))}
    </ul>
  )
}

/** Hairline gridlines at each tick across the plot, with the tick's label at the left. */
export function YTicks({ ticks, yOf, left, right }: { ticks: { value: number; label: string }[]; yOf: (value: number) => number; left: number; right: number }) {
  return (
    <g>
      {ticks.map(({ value, label }) => {
        const y = Math.round(yOf(value)) + 0.5
        return (
          <g key={value}>
            <line x1={left} x2={right} y1={y} y2={y} className={value === 0 ? 'l-chart-base' : 'l-chart-grid'} />
            <text x={left - 6} y={y} dy="0.32em" textAnchor="end" className="l-chart-text">{label}</text>
          </g>
        )
      })}
    </g>
  )
}

/** The buckets' labels under the plot, as many as fit, today's always; the first and last kept inside the drawing. */
export function XLabels({ labels, slot, left, y, plotWidth, kind }: { labels: string[]; slot: number; left: number; y: number; plotWidth: number; kind: BucketKind }) {
  const shown = labelled(labels.length, plotWidth, labelWidth(kind))
  const last = labels.length - 1
  return (
    <g>
      {labels.map((label, i) => {
        if (!shown[i]) return null
        const centre = left + slot * (i + 0.5)
        const half = labelWidth(kind) / 2
        const anchor = i === last && centre + half > left + plotWidth ? 'end' : i === 0 && centre - half < left ? 'start' : 'middle'
        const x = anchor === 'end' ? left + plotWidth : anchor === 'start' ? left : centre
        return <text key={i} x={x} y={y} dy="1em" textAnchor={anchor} className="l-chart-text">{label}</text>
      })}
    </g>
  )
}

/**
 * The chart's numbers as a table, read by screen readers instead of the drawing (which is hidden from them), and the
 * same numbers a sighted reader finds in each column's tooltip.
 */
export function DataTable({ caption, heads, rows }: { caption: string; heads: string[]; rows: { key: string; cells: ReactNode[] }[] }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>{heads.map((h, i) => <th key={i} scope="col">{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map(row => (
          <tr key={row.key}>
            {row.cells.map((cell, i) => (i === 0 ? <th key={i} scope="row">{cell}</th> : <td key={i}>{cell}</td>))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
