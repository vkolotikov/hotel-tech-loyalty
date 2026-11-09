/**
 * The full admin dashboard's decisions (2026-11-09, owner: "more engaging, animated dashboard with grids … KPI, main
 * graphs, maybe weather info, time"), pure so they are tested without rendering: the venue's clock and part of the
 * day, what a weather code means, the paths the charts draw, changes against the period before, and the person's
 * own choice of widgets. Every figure is the server's (dashboard/trends, dashboard/pulse …); this only shapes it.
 */

export * from '../../lib/venuePulse'

// ── Figures ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface Total { current: number; previous: number; change: number | null }

export type Trend = 'up' | 'down' | 'flat' | 'new'

/** Whether a figure rose against the period before: `new` when there was nothing before, `flat` within half a percent. */
export function trendOf(total: Total | null | undefined): Trend {
  if (!total) return 'flat'
  if (total.change === null) return total.current > 0 ? 'new' : 'flat'
  if (Math.abs(total.change) < 0.5) return 'flat'
  return total.change > 0 ? 'up' : 'down'
}

/** `+12.4%`, `−3%` (a true minus), `0%`. */
export function changeText(change: number | null | undefined, lang = 'en'): string {
  if (change === null || change === undefined || !Number.isFinite(change)) return ''
  const abs = Math.abs(change)
  const body = new Intl.NumberFormat(lang, { maximumFractionDigits: abs >= 10 ? 0 : 1 }).format(abs)
  if (abs < 0.5) return '0%'
  return `${change > 0 ? '+' : '−'}${body}%`
}

/** Day by day sum of several aligned series; a missing one counts as nothing, all missing is null. */
export function sumSeries(...lines: (number[] | null | undefined)[]): number[] | null {
  const present = lines.filter((l): l is number[] => Array.isArray(l))
  if (present.length === 0) return null
  const n = Math.max(...present.map(l => l.length))
  return Array.from({ length: n }, (_, i) => present.reduce((a, l) => a + (Number(l[i]) || 0), 0))
}

/** Two totals added, their change worked out again; null when both are missing. */
export function sumTotals(...totals: (Total | null | undefined)[]): Total | null {
  const present = totals.filter((t): t is Total => !!t)
  if (present.length === 0) return null
  const current = present.reduce((a, t) => a + t.current, 0)
  const previous = present.reduce((a, t) => a + t.previous, 0)
  return { current, previous, change: previous > 0 ? Math.round(((current - previous) / previous) * 1000) / 10 : null }
}

export function compactNumber(value: number, lang = 'en'): string {
  if (!Number.isFinite(value)) return '—'
  if (Math.abs(value) < 10000) return new Intl.NumberFormat(lang, { maximumFractionDigits: 0 }).format(value)
  return new Intl.NumberFormat(lang, { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

// ── Chart paths ─────────────────────────────────────────────────────────────────────────────────────────────────────

export interface Point { x: number; y: number }

/** Points of a series inside a w×h box; `max` lets several series share one scale. A flat line sits on the floor. */
export function scalePoints(values: number[], w: number, h: number, pad = 2, max?: number): Point[] {
  const n = values.length
  if (n === 0) return []
  const top = Math.max(max ?? Math.max(...values), 0)
  const span = top > 0 ? top : 1
  return values.map((v, i) => ({
    x: n === 1 ? w / 2 : pad + (i * (w - pad * 2)) / (n - 1),
    y: h - pad - (Math.max(0, v) / span) * (h - pad * 2),
  }))
}

/**
 * A smooth line through the points that never overshoots them (monotone cubic, Fritsch–Carlson), so a quiet day
 * between two busy ones never dips below zero.
 */
export function smoothPath(points: Point[]): string {
  const n = points.length
  if (n === 0) return ''
  if (n === 1) return `M${r(points[0].x)},${r(points[0].y)}`
  if (n === 2) return `M${r(points[0].x)},${r(points[0].y)}L${r(points[1].x)},${r(points[1].y)}`
  const dx: number[] = [], slope: number[] = []
  for (let i = 0; i < n - 1; i++) {
    dx[i] = points[i + 1].x - points[i].x
    slope[i] = dx[i] === 0 ? 0 : (points[i + 1].y - points[i].y) / dx[i]
  }
  const m: number[] = [slope[0]]
  for (let i = 1; i < n - 1; i++) m[i] = slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2
  m[n - 1] = slope[n - 2]
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) { m[i] = 0; m[i + 1] = 0; continue }
    const a = m[i] / slope[i], b = m[i + 1] / slope[i]
    const s = a * a + b * b
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * slope[i]; m[i + 1] = t * b * slope[i] }
  }
  let d = `M${r(points[0].x)},${r(points[0].y)}`
  for (let i = 0; i < n - 1; i++) {
    const p = points[i], q = points[i + 1], h = dx[i] / 3
    d += `C${r(p.x + h)},${r(p.y + m[i] * h)} ${r(q.x - h)},${r(q.y - m[i + 1] * h)} ${r(q.x)},${r(q.y)}`
  }
  return d
}

/** The line closed down to the floor, for the area under it. */
export function areaPath(points: Point[], floor: number): string {
  if (points.length === 0) return ''
  const line = smoothPath(points)
  const last = points[points.length - 1], first = points[0]
  return `${line}L${r(last.x)},${r(floor)}L${r(first.x)},${r(floor)}Z`
}

function r(n: number): string {
  return (Math.round(n * 100) / 100).toString()
}

/** Which day a pointer at `x` across a chart `w` wide is over. */
export function indexAt(x: number, w: number, n: number, pad = 2): number {
  if (n <= 1) return 0
  const k = (x - pad) / (w - pad * 2)
  return Math.min(n - 1, Math.max(0, Math.round(k * (n - 1))))
}

/** Rounded steps for a value axis: 0 and three more up to a round top at or above the largest value. */
export function niceTicks(max: number): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0, 1]
  const raw = max / 3
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map(s => s * mag).find(s => s >= raw) ?? 10 * mag
  return [0, step, step * 2, step * 3]
}

export interface Arc { key: string; start: number; length: number }

/** A ring's segments as fractions of the circle, in order, each at least a sliver so a small one stays visible. */
export function ringArcs(parts: { key: string; value: number }[], gap = 0.006): Arc[] {
  const total = parts.reduce((a, p) => a + Math.max(0, p.value), 0)
  if (total <= 0) return []
  let at = 0
  return parts.filter(p => p.value > 0).map(p => {
    const share = p.value / total
    const arc = { key: p.key, start: at, length: Math.max(0.004, share - gap) }
    at += share
    return arc
  })
}

// ── The person's own dashboard ──────────────────────────────────────────────────────────────────────────────────────

export const WIDGETS = ['now', 'live', 'kpis', 'trend', 'pipeline', 'schedule', 'loyalty', 'workspaces', 'tasks', 'activity'] as const
export type WidgetId = (typeof WIDGETS)[number]

export interface DashLayout { order: WidgetId[]; hidden: WidgetId[] }

export const DEFAULT_LAYOUT: DashLayout = { order: [...WIDGETS], hidden: [] }

const isWidget = (v: unknown): v is WidgetId => typeof v === 'string' && (WIDGETS as readonly string[]).includes(v)

/**
 * A stored layout made safe: known widgets only, each once; a widget added since the layout was saved takes its
 * default place (after the widget it follows by default), so a new widget is never lost at the bottom or hidden.
 */
export function sanitizeLayout(raw: unknown): DashLayout {
  if (!raw || typeof raw !== 'object') return { order: [...DEFAULT_LAYOUT.order], hidden: [] }
  const r = raw as { order?: unknown; hidden?: unknown }
  const order: WidgetId[] = []
  for (const id of Array.isArray(r.order) ? r.order : []) if (isWidget(id) && !order.includes(id)) order.push(id)
  WIDGETS.forEach((id, i) => {
    if (order.includes(id)) return
    const before = WIDGETS.slice(0, i).reverse().find(b => order.includes(b))
    order.splice(before ? order.indexOf(before) + 1 : 0, 0, id)
  })
  const hidden = (Array.isArray(r.hidden) ? r.hidden : []).filter(isWidget).filter((id, i, a) => a.indexOf(id) === i)
  return { order, hidden }
}

export function toggleWidget(layout: DashLayout, id: WidgetId): DashLayout {
  return { ...layout, hidden: layout.hidden.includes(id) ? layout.hidden.filter(h => h !== id) : [...layout.hidden, id] }
}

/**
 * Moves a widget one place up (-1) or down (+1) among `among` — the widgets the organisation has, so it never swaps
 * places with one the person cannot see; at an end it stays.
 */
export function moveWidget(layout: DashLayout, id: WidgetId, by: -1 | 1, among: readonly WidgetId[] = layout.order): DashLayout {
  const list = among.filter(w => layout.order.includes(w))
  const other = list[list.indexOf(id) + by]
  if (!list.includes(id) || !other) return layout
  const order = [...layout.order]
  const a = order.indexOf(id), b = order.indexOf(other)
  ;[order[a], order[b]] = [order[b], order[a]]
  return { ...layout, order }
}

export const PERIODS = [7, 30, 90] as const
export type Period = (typeof PERIODS)[number]

export function periodFrom(raw: unknown): Period {
  const n = Number(raw)
  return (PERIODS as readonly number[]).includes(n) ? (n as Period) : 30
}
