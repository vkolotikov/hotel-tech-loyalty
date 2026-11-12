import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowDownRight, ArrowUpRight, Minus, Sparkles } from 'lucide-react'
import { barShare, changeTone, labelled, type Change } from './insightsMath'

/**
 * Insights' charts, drawn in plain markup with the workspace's own colour classes (`bg-a-*` and the AI's `crm-ai-fill`),
 * so they follow light and dark like every other surface — no SVG presentation attributes, where a CSS variable may
 * not resolve. Every drawing is hidden from screen readers, which read the same numbers as a table or a list.
 */

export type BarTone = 'accent' | 'ai' | 'won' | 'lost' | 'muted'

const FILL: Record<BarTone, string> = {
  accent: 'bg-a-accent',
  ai: 'crm-ai-fill',
  won: 'bg-a-st-confirmed',
  lost: 'bg-a-danger',
  muted: 'bg-a-text-2/40',
}

export interface BarRow {
  id: string
  label: ReactNode
  /** The full name, when the label is shortened (a page's address). */
  title?: string
  value: number
  /** The value as written beside the bar ("124", "124 · 31 %"). */
  text: string
  tone?: BarTone
}

/** Bars across a list: each row's name, a bar as long as its share of the longest, and its number in words. */
export function BarList({ label, rows }: { label: string; rows: BarRow[] }) {
  const max = Math.max(0, ...rows.map(r => r.value))
  return (
    <ul aria-label={label} className="space-y-2.5" data-chart="bars">
      {rows.map(row => (
        <li key={row.id} className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)_auto] items-center gap-x-3 text-sm sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto]">
          <span className="min-w-0 truncate text-a-text" title={row.title}>{row.label}</span>
          <span aria-hidden className="block h-2.5 min-w-0 rounded-full bg-a-surface-2">
            {row.value > 0 && <span className={`block h-2.5 rounded-full ${FILL[row.tone ?? 'accent']}`} style={{ width: `${barShare(row.value, max)}%` }} />}
          </span>
          <span className="text-right tabular-nums text-a-text">{row.text}</span>
        </li>
      ))}
    </ul>
  )
}

export interface Column {
  key: string
  /** Under the column. */
  label: string
  /** In the tooltip and the table: the day, the week, the hour in full. */
  long: string
  /** Stacked from the bottom: the first part sits on the base line. */
  parts: { name: string; value: number; tone: BarTone }[]
}

/**
 * Columns over time, each a stack of its parts (AI-closed at the bottom, the rest above). Labels under at most seven,
 * the latest always; the tallest column's number at the top left for scale; a tooltip on each column, and a table for
 * screen readers.
 */
export function Columns({ caption, heading, columns, format, labels }: {
  caption: string
  heading: string
  columns: Column[]
  format: (n: number) => string
  /** Which columns carry a label; at most seven, the latest always, when not given. */
  labels?: boolean[]
}) {
  const totals = columns.map(c => c.parts.reduce((n, p) => n + Math.max(0, p.value), 0))
  const max = Math.max(0, ...totals)
  const shown = labels ?? labelled(columns.length)
  const names = columns[0]?.parts.map(p => p.name) ?? []
  return (
    <div className="min-w-0">
      <div aria-hidden data-chart="columns">
        <div className="mb-1 text-xs tabular-nums text-a-text-2">{max > 0 ? format(max) : ''}</div>
        <div className="flex h-40 items-end gap-px border-b border-a-border sm:gap-0.5">
          {columns.map((column, i) => (
            <div key={column.key} className="flex h-full min-w-0 flex-1 flex-col-reverse" title={`${column.long}: ${column.parts.map(p => `${p.name} ${format(p.value)}`).join(', ')}`}>
              {max > 0 && column.parts.map(part => (
                part.value > 0
                  ? <span key={part.name} className={`block w-full last:rounded-t-sm ${FILL[part.tone]}`} style={{ height: `${(part.value / max) * 100}%` }} />
                  : null
              ))}
              {totals[i] === 0 && <span className="block h-px w-full bg-a-border" />}
            </div>
          ))}
        </div>
        <div className="relative mt-1 flex h-5 text-xs text-a-text-2">
          {columns.map((column, i) => (
            <span key={column.key} className="relative min-w-0 flex-1">
              {shown[i] && (
                <span className={`absolute top-0 whitespace-nowrap ${i === columns.length - 1 ? 'right-0' : i === 0 ? 'left-0' : 'left-1/2 -translate-x-1/2'}`}>{column.label}</span>
              )}
            </span>
          ))}
        </div>
      </div>
      <table className="sr-only">
        <caption>{caption}</caption>
        <thead><tr><th scope="col">{heading}</th>{names.map(n => <th key={n} scope="col">{n}</th>)}</tr></thead>
        <tbody>
          {columns.map(column => (
            <tr key={column.key}><th scope="row">{column.long}</th>{column.parts.map(p => <td key={p.name}>{format(p.value)}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** The swatches of a chart with two or more series. */
export function Legend({ items }: { items: { name: string; tone: BarTone }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-a-text-2">
      {items.map(item => (
        <li key={item.name} className="inline-flex items-center gap-1.5">
          <span aria-hidden className={`inline-block h-2.5 w-2.5 rounded-sm ${FILL[item.tone]}`} />
          {item.name}
        </li>
      ))}
    </ul>
  )
}

const TONE_TEXT = { good: 'text-a-st-confirmed', bad: 'text-a-danger', plain: 'text-a-text-2' } as const

/**
 * A figure's move against the period before, short (round 5, "minimize copy"): an arrow and the amount ("▲ 12 %"), the
 * sentence ("12 % more than the 30 days before") as its tooltip and for a screen reader.
 */
export function ChangeLine({ change, upIsGood, days }: { change: Change | null; upIsGood: boolean | null; days: number }) {
  const { t } = useTranslation()
  if (!change) {
    const words = t('crm.insights.change.none', 'Nothing to compare with yet')
    return <span className="text-a-text-2" title={words}><span aria-hidden>—</span><span className="sr-only">{words}</span></span>
  }
  const tone = TONE_TEXT[changeTone(change, upIsGood)]
  if (change.kind === 'new') {
    const words = t('crm.insights.change.new', 'New: none in the {{days}} days before', { days })
    return <span className={`inline-flex items-center gap-1 ${tone}`} title={words}><Sparkles size={13} aria-hidden /><span aria-hidden>{t('crm.insights.change.short_new', 'New')}</span><span className="sr-only">{words}</span></span>
  }
  const Icon = change.kind === 'up' ? ArrowUpRight : change.kind === 'down' ? ArrowDownRight : Minus
  const words = change.kind === 'same'
    ? t('crm.insights.change.same', 'Level with the {{days}} days before', { days })
    : change.unit === 'points'
      ? (change.kind === 'up'
        ? t('crm.insights.change.up_points', '{{amount}} points more than the {{days}} days before', { amount: change.amount, days })
        : t('crm.insights.change.down_points', '{{amount}} points less than the {{days}} days before', { amount: change.amount, days }))
      : (change.kind === 'up'
        ? t('crm.insights.change.up', '{{amount}} % more than the {{days}} days before', { amount: change.amount, days })
        : t('crm.insights.change.down', '{{amount}} % less than the {{days}} days before', { amount: change.amount, days }))
  const short = change.kind === 'same' ? null
    : change.unit === 'points' ? t('crm.insights.change.short_points', '{{amount}} pts', { amount: change.amount }) : `${change.amount} %`
  return (
    <span className={`inline-flex items-center gap-1 ${tone}`} title={words}>
      <Icon size={13} aria-hidden />{short && <span aria-hidden>{short}</span>}<span className="sr-only">{words}</span>
    </span>
  )
}
