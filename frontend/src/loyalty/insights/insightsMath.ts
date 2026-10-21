import { formatDate } from '../../workspace/lib/wallClock'
import type { Can, TierRef } from '../lib/types'
import type { Band, BucketKind, Insights, Period } from './types'

/**
 * Insights' decisions (spec 2026-10-21 release 2 §5), kept out of the components so they can be tested by string:
 * who sees the page, the period and the quiet days in the address, how a venue bucket is written, and the charts'
 * geometry — scales, which labels fit, where each column and segment goes. A bucket key is the venue's own date; it is
 * written through the shared wall-clock formatter and never read as an instant.
 */

// ─── Who sees it ──────────────────────────────────────────────────────────

/** Managers and staff with `can_view_analytics` (the bootstrap's `view_insights`); the server decides again. */
export function insightsAccess(can: Can): { view: boolean } {
  return { view: can.view_insights }
}

// ─── The address ──────────────────────────────────────────────────────────

export const PERIODS: readonly Period[] = ['30d', '90d', '12m']
export const DEFAULT_PERIOD: Period = '30d'

/** The days of quiet the at-risk list offers; the address may hold any whole number from 7 to 365. */
export const QUIET_CHOICES: readonly number[] = [30, 60, 90, 180, 365]
export const DEFAULT_QUIET = 60
export const MIN_QUIET = 7
export const MAX_QUIET = 365

/** `?period=` in the address, or 30 days. */
export function periodFrom(search: string): Period {
  const value = new URLSearchParams(search).get('period')
  return (PERIODS as readonly string[]).includes(value ?? '') ? (value as Period) : DEFAULT_PERIOD
}

/** `?quiet=` in the address: whole days from 7 to 365, or 60. */
export function quietFrom(search: string): number {
  const value = new URLSearchParams(search).get('quiet') ?? ''
  const n = /^\d{1,3}$/.test(value) ? Number(value) : NaN
  return n >= MIN_QUIET && n <= MAX_QUIET ? n : DEFAULT_QUIET
}

/** The address with one choice changed; a default is left out, so the plain page address means the defaults. */
export function searchWith(search: string, change: { period?: Period; quiet?: number }): string {
  const params = new URLSearchParams(search)
  const period = change.period ?? periodFrom(search)
  const quiet = change.quiet ?? quietFrom(search)
  params.delete('period')
  params.delete('quiet')
  if (period !== DEFAULT_PERIOD) params.set('period', period)
  if (quiet !== DEFAULT_QUIET) params.set('quiet', String(quiet))
  const text = params.toString()
  return text ? `?${text}` : ''
}

/** The quiet choices to offer: the usual ones, and the address's own when it is another number. */
export function quietChoices(current: number): number[] {
  return QUIET_CHOICES.includes(current) ? [...QUIET_CHOICES] : [...QUIET_CHOICES, current].sort((a, b) => a - b)
}

// ─── Words for numbers and days ──────────────────────────────────────────

/** A venue bucket as an axis label: "6 Sep" for a day or a week (its Monday), "Sep" for a month. */
export function bucketShort(key: string, kind: BucketKind, locale: string): string {
  return kind === 'month'
    ? formatDate(`${key}-01`, locale || 'en', { month: 'short' })
    : formatDate(key, locale || 'en', { day: 'numeric', month: 'short' })
}

/** A venue bucket in full, for a table row or a tooltip: "6 Sep 2026", or "September 2026" for a month. */
export function bucketLong(key: string, kind: BucketKind, locale: string): string {
  return kind === 'month'
    ? formatDate(`${key}-01`, locale || 'en', { month: 'long', year: 'numeric' })
    : formatDate(key, locale || 'en', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** The period's days: "6 Sep 2026 – 5 Oct 2026". */
export function periodText(from: string, to: string, locale: string): string {
  const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }
  return `${formatDate(from, locale || 'en', options)} – ${formatDate(to, locale || 'en', options)}`
}

/** An axis tick, short from a thousand up: "0", "250", "1.5K" (as the language writes it). */
export function compact(n: number, locale: string): string {
  return new Intl.NumberFormat(locale || 'en', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
}

/** The server's rate (a percentage with one decimal) as the language writes it: "29.2%", "29,2 %"; null is a dash. */
export function percentText(rate: number | null, locale: string): string {
  if (rate === null) return '—'
  return new Intl.NumberFormat(locale || 'en', { style: 'percent', maximumFractionDigits: 1 }).format(rate / 100)
}

/** A whole-number share in per cent, 0 when there is nothing to share. */
export function shareOf(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0
}

/** How a balance band reads: below zero, exactly zero, a range, or a lower bound and up. */
export type BandShape = { kind: 'below' } | { kind: 'zero' } | { kind: 'range'; min: number; max: number } | { kind: 'over'; min: number }

export function bandShape(band: Band): BandShape {
  if (band.min === null) return { kind: 'below' }
  if (band.max === null) return { kind: 'over', min: band.min }
  if (band.min === 0 && band.max === 0) return { kind: 'zero' }
  return { kind: 'range', min: band.min, max: band.max }
}

/** A tier the movement names, from the programme's ladder (the bootstrap holds every tier, switched off or not). */
export function tierOf(id: number, tiers: readonly TierRef[]): TierRef | null {
  return tiers.find(tier => tier.id === id) ?? null
}

/** Nothing to show yet: no member has joined. Points and charts appear once members join and earn. */
export function isEmptyProgramme(data: Insights): boolean {
  return data.tiles.members === 0
}

// ─── Scales ───────────────────────────────────────────────────────────────

/** A round step at or above `raw`: 1, 2 or 5 times a power of ten, never below 1 (counts are whole). */
export function niceStep(raw: number): number {
  if (!(raw > 0)) return 1
  const power = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 5, 10].map(m => m * power).find(s => s >= raw - 1e-9) ?? 10 * power
  return Math.max(1, step)
}

export interface Scale {
  /** The value at the top of the axis. */
  top: number
  /** The ticks from 0 up to `top`. */
  ticks: number[]
}

/** An axis from 0 to a round value at or above the largest, with at most `intervals` steps; all zeros give 0 to 1, one tick. */
export function scaleFor(max: number, intervals = 4): Scale {
  if (!(max > 0)) return { top: 1, ticks: [0] }
  const step = niceStep(max / intervals)
  const top = Math.ceil(max / step - 1e-9) * step
  const ticks: number[] = []
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(Math.round(v))
  return { top, ticks }
}

export interface SplitScale {
  /** The values at the ends of the axis, above and below the zero line. */
  up: number
  down: number
  /** Ticks above (positive) and below (the size of the value going down, positive). */
  upTicks: number[]
  downTicks: number[]
}

/** An axis for points in above the zero line and points out below it, one step size on both sides. */
export function splitScale(maxUp: number, maxDown: number, intervals = 4): SplitScale {
  const up = Math.max(0, maxUp)
  const down = Math.max(0, maxDown)
  if (up === 0 && down === 0) return { up: 1, down: 0, upTicks: [0], downTicks: [] }
  const step = niceStep(Math.max(up, down) / Math.max(1, Math.floor(intervals / 2)))
  const ceil = (v: number) => Math.ceil(v / step - 1e-9) * step
  const range = (top: number) => Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step)
  const top = up > 0 ? ceil(up) : 0
  const bottom = down > 0 ? ceil(down) : 0
  return { up: top, down: bottom, upTicks: range(top), downTicks: range(bottom).slice(1) }
}

// ─── Columns ──────────────────────────────────────────────────────────────

/**
 * The room the y-axis labels take at the plot's left, from the longest of them at about 7 px a character of 12 px
 * text: "1,5 тыс." and "50.000" need more than "1K". At least 24 px, at most 96.
 */
export function axisRoom(labels: readonly string[]): number {
  const longest = Math.max(0, ...labels.map(label => [...label].length))
  return Math.min(96, Math.max(24, Math.ceil(longest * 7) + 10))
}

/** A column's thickness in a slot: two thirds of it, at most 24 px, at least 1 px. */
export function columnWidth(slot: number): number {
  return Math.max(1, Math.min(24, Math.floor(slot * 0.66)))
}

/**
 * Which buckets carry an axis label: as many as fit at `labelWidth` each, counted back from the last bucket (today's),
 * which is always labelled.
 */
export function labelled(count: number, plotWidth: number, labelWidth: number): boolean[] {
  if (count <= 0) return []
  const fit = Math.max(1, Math.floor(plotWidth / Math.max(1, labelWidth)))
  const stride = Math.max(1, Math.ceil(count / fit))
  return Array.from({ length: count }, (_, i) => (count - 1 - i) % stride === 0)
}

export interface Segment {
  /** Which series. */
  series: number
  /** From the zero line outwards, in px: where the segment starts and how long it is. */
  start: number
  size: number
  /** The outermost drawn segment, whose end is rounded. */
  end: boolean
}

/**
 * A stacked column's segments, from the zero line outwards: each series' value at `pxPer` px, those at zero left out,
 * a 2 px gap of the card's colour between neighbours (taken from the inner segment, so the column keeps its height),
 * and at least 1 px for any value above zero. A negative value is drawn as zero.
 */
export function stackSegments(values: readonly number[], pxPer: number, gap = 2): Segment[] {
  const drawn = values.map((v, series) => ({ series, size: Math.max(0, v) * pxPer })).filter(s => s.size > 0)
  const out: Segment[] = []
  let at = 0
  drawn.forEach((s, i) => {
    const last = i === drawn.length - 1
    const size = Math.max(1, last ? s.size : s.size - gap)
    out.push({ series: s.series, start: at, size, end: last })
    at += last ? size : size + gap
  })
  return out
}

/**
 * A column's outline: square at the zero line, its outer corners rounded by up to 4 px when it is the outermost
 * segment. `y` is where it starts (the side nearer the zero line), `grow` −1 upwards and 1 downwards on screen.
 */
export function columnPath(x: number, y: number, width: number, height: number, grow: -1 | 1, rounded: boolean): string {
  const r = rounded ? Math.max(0, Math.min(4, width / 2, height)) : 0
  const far = y + grow * height
  const f = (n: number) => String(Math.round(n * 100) / 100)
  if (r === 0) return `M${f(x)} ${f(y)}H${f(x + width)}V${f(far)}H${f(x)}Z`
  const inner = far - grow * r
  const sweep = grow === -1 ? 1 : 0
  return `M${f(x)} ${f(y)}V${f(inner)}A${f(r)} ${f(r)} 0 0 ${sweep} ${f(x + r)} ${f(far)}H${f(x + width - r)}A${f(r)} ${f(r)} 0 0 ${sweep} ${f(x + width)} ${f(inner)}V${f(y)}Z`
}

/** A line through the buckets' centres, and the area under it down to `base` (for the 10 % wash). */
export function linePaths(points: readonly { x: number; y: number }[], base: number): { line: string; area: string } {
  if (points.length === 0) return { line: '', area: '' }
  const f = (n: number) => String(Math.round(n * 100) / 100)
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${f(p.x)} ${f(p.y)}`).join('')
  const first = points[0]
  const last = points[points.length - 1]
  return { line, area: `${line}L${f(last.x)} ${f(base)}L${f(first.x)} ${f(base)}Z` }
}

/** A bar of a list: its length in per cent of the longest, at least 1 % for anything above zero. */
export function barShare(value: number, max: number): number {
  if (!(value > 0) || !(max > 0)) return 0
  return Math.max(1, Math.round((value / max) * 1000) / 10)
}
