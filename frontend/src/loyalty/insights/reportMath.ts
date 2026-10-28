import type { InsightsReport, ReportFilters } from './reportTypes'

export function shiftDay(day: string, n: number): string {
  const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10)
}
export function reportFilters(search: string, today: string): ReportFilters {
  const p = new URLSearchParams(search)
  const valid = (v: string | null) => v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v
  const to = valid(p.get('to')) ? p.get('to')! : shiftDay(today, -1)
  return { from: valid(p.get('from')) ? p.get('from')! : shiftDay(to, -27), to, compare: p.get('compare') === 'none' ? 'none' : 'previous', tier_id: /^\d+$/.test(p.get('tier_id') ?? '') ? p.get('tier_id')! : '' }
}
export function validReportRange(f: ReportFilters, today: string): boolean {
  const d = (Date.parse(f.to) - Date.parse(f.from)) / 86400000
  return Number.isFinite(d) && d >= 0 && d <= 365 && f.to < today
}
export function comparison(current: number | null, previous: number | null, rate = false): number | null {
  if (current === null || previous === null || (!rate && previous === 0)) return null
  return rate ? current - previous : (current - previous) / Math.abs(previous) * 100
}
export function csvCell(value: unknown): string {
  let s = value == null ? '' : String(value)
  if (/^[\s]*[=+@-]/.test(s) && typeof value !== 'number') s = "'" + s
  return '"' + s.replaceAll('"', '""') + '"'
}
/** Portable report, with explicit dates/scope and raw numeric values rather than localized display strings. */
export function reportCsv(r: InsightsReport, level: string): string {
  const rows: unknown[][] = [
    ['HexaTech loyalty report'], ['From', r.from], ['To', r.to], ['Timezone', r.timezone], ['Current membership level', level],
    ['Place', 'All places'], ['Updated', r.updated_at], ['Snapshot date', r.snapshot_date],
    ['Comparison from', r.comparison?.from], ['Comparison to', r.comparison?.to], ['Currency', r.current.money.currency],
    ['Metric', 'Selected period', 'Previous period'],
    ...(['members', 'active', 'new_members', 'participation', 'issued', 'redeemed', 'expired', 'claims', 'fulfilled', 'pending', 'cancelled', 'fulfilment'] as const).map(k => [k, r.current[k], r.previous?.[k]]),
    ['Recorded paid member bookings', r.current.money.members.total, r.previous?.money.members.total],
    ['Other-currency bookings excluded', r.current.money.other_currency.bookings, r.previous?.money.other_currency.bookings],
    ['Current outstanding balance', r.outstanding], ['Current members by level'], ...r.tiers.rows.map(t => [t.name, t.members]), ['No level', r.tiers.none],
    ['Week from', 'Week to', 'Unique active members', 'Recorded paid member bookings'], ...r.series.map(w => [w.from, w.to, w.active, w.sales]),
    ['Previous week from', 'Previous week to', 'Unique active members', 'Recorded paid member bookings'], ...r.previous_series.map(w => [w.from, w.to, w.active, w.sales]),
    ['Join week from', 'Join week to', 'Joined', 'Returned week +1', 'Returned week +2', 'Returned week +3'], ...r.cohorts.map(c => [c.from, c.to, c.members, ...c.returns.map(n => n === null ? 'Not observed' : n)]),
    ['Reward', 'Claims'], ...r.rewards.map(w => [w.name ?? w.id, w.claims]),
    ['Expiry from', r.attention.expiry_from], ['Expiry to', r.attention.expiry_to], ['Points expiring', r.attention.expiring], ['Members with expiring points', r.attention.expiring_members], ['Members quiet 30+ days', r.attention.quiet],
    ['Definitions', 'Activity: non-reversed points earned or redeemed; counts are distinct within each period. Sales: paid member-linked bookings in venue currency, net of refunds, by booking creation date; not loyalty uplift. Claims: reward redemptions created in period, status now; cancelled claims remain in denominator. Level filter: current membership level. Balances/expiry: active members now. Future cohort observations are blank, not zero.'],
  ]
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n')
}
