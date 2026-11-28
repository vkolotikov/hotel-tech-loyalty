import { addDays, venueNow } from '../../workspace/lib/wallClock'
import { percent } from '../lib/format'
import type { ChatAnalytics, ChatHourPoint, ChatTrendPoint, DealAnalytics, ForecastReport, LostReasonCount, Pipeline, SignalLead } from './types'

/**
 * Insights' shaping, kept pure because the tests render to a string (2026-11-07). Every figure is the server's
 * (ChatbotAnalyticsController, InquiryController::kpis/insights, PipelineController::index, DealController::analytics);
 * these only choose the period, compare it with the one before, group a long series into weeks, order and label
 * rows, and size bars.
 */

/** The periods Insights offers, in days; 30 when the address names none we have. */
export const PERIODS = [7, 30, 90] as const
export type Period = (typeof PERIODS)[number]

/** One value of the address, or '' (a variable key keeps the API sweep from reading it as a call). */
export function arg(search: URLSearchParams, key: string): string {
  return search.get(key) ?? ''
}

export function periodOf(value: string | null): Period {
  const n = Number(value)
  return (PERIODS as readonly number[]).includes(n) ? (n as Period) : 30
}

/**
 * Insights' sections, kept in the address (`?tab=`); the given default when it names none we have. Round 5 (owner
 * 2026-11-12, "implement all features we have in our main platform"): the deals' analytics and the sales reports of the
 * full admin's Analytics and Reports pages.
 */
export const SECTIONS = ['chat', 'pipeline', 'deals', 'reports'] as const
export type InsightsSection = (typeof SECTIONS)[number]

export function sectionOf(value: string | null, fallback: InsightsSection = 'chat'): InsightsSection {
  return (SECTIONS as readonly string[]).includes(value ?? '') ? (value as InsightsSection) : fallback
}

/** The venue's zone as the hour chart names it: "Europe/Riga", "America/New York" (the zone the server now counts in). */
export function zoneLabel(zone: string): string {
  return zone.trim().replace(/_/g, ' ') || 'UTC'
}

/**
 * The leads' windows for a period: the venue's today and the `days - 1` days before it, and the window of the same
 * length just before it — the venue's days, which `inquiries?date_from=&date_to=` reads since 2026-11-08 (before, UTC
 * days), as the chat analytics count them.
 */
export function windows(days: number, now: Date, zone = 'UTC'): { from: string; prevFrom: string; prevTo: string } {
  const today = venueNow(zone, now).date
  const from = addDays(today, -(days - 1))
  return { from, prevFrom: addDays(from, -days), prevTo: addDays(from, -1) }
}

/** How a figure moved against the period before: up, down or level by an amount, or new (nothing before). */
export type Change = { kind: 'up' | 'down' | 'same'; amount: number; unit: 'percent' | 'points' } | { kind: 'new' }

/** A count against the one before, in whole percent. Nothing either side says nothing. */
export function countChange(current: number, previous: number): Change | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || (current === 0 && previous === 0)) return null
  if (previous === 0) return { kind: 'new' }
  const pct = Math.round(((current - previous) / previous) * 100)
  return { kind: pct > 0 ? 'up' : pct < 0 ? 'down' : 'same', amount: Math.abs(pct), unit: 'percent' }
}

/** A rate against the one before, in points; none when the period before had nothing to rate. */
export function rateChange(current: number, previous: number, previousBase: number): Change | null {
  if (!previousBase || !Number.isFinite(current) || !Number.isFinite(previous)) return null
  const diff = current - previous
  const amount = Math.round(Math.abs(diff) * 10) / 10
  return { kind: amount === 0 ? 'same' : diff > 0 ? 'up' : 'down', amount, unit: 'points' }
}

/** A change the server worked out itself, in whole percent (inquiries/kpis `new_delta_pct`), or none. */
export function serverChange(pct: number | null | undefined): Change | null {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return null
  return { kind: pct > 0 ? 'up' : pct < 0 ? 'down' : 'same', amount: Math.abs(Math.round(pct)), unit: 'percent' }
}

/** Whether a move reads as good news: more conversations is, more chats handed to a person is neither. */
export function changeTone(change: Change | null, upIsGood: boolean | null): 'good' | 'bad' | 'plain' {
  if (!change || change.kind === 'same' || change.kind === 'new' || upIsGood === null) return 'plain'
  return (change.kind === 'up') === upIsGood ? 'good' : 'bad'
}

/** One column of the conversations chart: a day, or a week of them when the period is long. */
export interface Bucket {
  key: string
  from: string
  to: string
  total: number
  ai: number
}

/** The daily series as columns: each day up to a month; weeks for longer (the latest week whole, counted back). */
export function trendBuckets(trend: ChatTrendPoint[]): Bucket[] {
  if (trend.length <= 31) return trend.map(p => ({ key: p.date, from: p.date, to: p.date, total: p.count, ai: p.aiResolved }))
  const out: Bucket[] = []
  for (let end = trend.length - 1; end >= 0; end -= 7) {
    const week = trend.slice(Math.max(0, end - 6), end + 1)
    out.unshift({
      key: week[0].date, from: week[0].date, to: week[week.length - 1].date,
      total: week.reduce((n, p) => n + p.count, 0), ai: week.reduce((n, p) => n + p.aiResolved, 0),
    })
  }
  return out
}

/** A day (`YYYY-MM-DD`, the venue's in the chat series since round 2) as "4 Nov", read as a date, never converted. */
export function shortDay(day: string, lang: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day)
  if (!m) return day
  return new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])))
}

export function bucketLabel(bucket: Pick<Bucket, 'from' | 'to'>, lang: string): string {
  return bucket.from === bucket.to ? shortDay(bucket.from, lang) : `${shortDay(bucket.from, lang)} – ${shortDay(bucket.to, lang)}`
}

/** Which columns carry a label under the chart: at most `max`, the latest always. */
export function labelled(count: number, max = 7): boolean[] {
  const step = Math.max(1, Math.ceil(count / max))
  return Array.from({ length: count }, (_, i) => (count - 1 - i) % step === 0)
}

/** A bar's length in percent of the longest; a bar with anything in it stays visible. */
export function barShare(value: number, max: number): number {
  if (!(value > 0) || !(max > 0)) return 0
  return Math.max(2, Math.min(100, Math.round((value / max) * 1000) / 10))
}

/** The chat states we have words for (crm.status.*), in this order; any other comes after, as the server names it. */
export const CHAT_STATUSES = ['waiting', 'active', 'resolved', 'archived'] as const

export function statusRows(breakdown: Record<string, number> | unknown[] | null | undefined): { key: string; count: number; known: boolean }[] {
  const entries = breakdown && !Array.isArray(breakdown) ? Object.entries(breakdown) : []
  const rows = entries.map(([key, count]) => ({ key, count: Number(count) || 0, known: (CHAT_STATUSES as readonly string[]).includes(key) })).filter(r => r.count > 0)
  const rank = (key: string) => {
    const at = (CHAT_STATUSES as readonly string[]).indexOf(key)
    return at === -1 ? CHAT_STATUSES.length : at
  }
  return rows.sort((a, b) => rank(a.key) - rank(b.key) || b.count - a.count)
}

/** A page's address as a short path ("/rooms/suite?lang=de"), the home page as "/". */
export function shortPath(url: string, max = 48): string {
  let path: string
  try {
    const u = new URL(url)
    path = `${u.pathname}${u.search}` || '/'
  } catch {
    path = url
  }
  return path.length > max ? `${path.slice(0, max - 1)}…` : path
}

/** A country as the server stored it: a two-letter code is named in the person's language. */
export function countryName(value: string, lang: string): string {
  const clean = value.trim()
  if (!/^[a-z]{2}$/i.test(clean)) return clean
  try {
    return new Intl.DisplayNames([lang], { type: 'region' }).of(clean.toUpperCase()) ?? clean
  } catch {
    return clean
  }
}

/** The chat's lead funnel in the server's order, each step as a share of the conversations. */
export const CHAT_FUNNEL = ['conversations', 'engaged', 'with_contact', 'lead_captured'] as const

export function funnelRows(funnel: { stage: string; count: number }[]): { stage: string; count: number; share: number | null }[] {
  const first = funnel[0]?.count ?? 0
  return funnel.map(step => ({ stage: step.stage, count: step.count, share: percent(step.count, first) }))
}

/** The 24 hours, every one present, labelled "00" to "23". */
export function hourRows(hourly: ChatHourPoint[]): { hour: number; label: string; count: number }[] {
  const byHour = new Map(hourly.map(h => [h.hour, h.conversations]))
  return Array.from({ length: 24 }, (_, hour) => ({ hour, label: String(hour).padStart(2, '0'), count: byHour.get(hour) ?? 0 }))
}

/** The hour with the most conversations, or null when there were none. */
export function busiestHour(rows: { hour: number; count: number }[]): number | null {
  let best: { hour: number; count: number } | null = null
  for (const row of rows) if (row.count > 0 && (!best || row.count > best.count)) best = row
  return best ? best.hour : null
}

/** The pipeline to show: the one asked for, else the default, else the first. */
export function pickPipeline(pipelines: Pipeline[], id: number | null): Pipeline | null {
  return pipelines.find(p => p.id === id) ?? pipelines.find(p => p.is_default) ?? pipelines[0] ?? null
}

/** A pipeline's stages in their order with the leads in each (the server's counts). */
export function stageRows(pipeline: Pipeline): { id: number; name: string; kind: string; count: number }[] {
  return [...pipeline.stages]
    .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
    .map(s => ({ id: s.id, name: s.name, kind: s.kind, count: Number(s.inquiries_count) || 0 }))
}

/** Where a pipeline's leads stand now, and of those closed the share won. */
export function pipelineSummary(pipeline: Pipeline): { total: number; open: number; won: number; lost: number; winRate: number | null } {
  const rows = stageRows(pipeline)
  const sum = (kind: string) => rows.filter(r => r.kind === kind).reduce((n, r) => n + r.count, 0)
  const won = sum('won')
  const lost = sum('lost')
  return { total: Number(pipeline.inquiries_count) || 0, open: sum('open'), won, lost, winRate: percent(won, won + lost) }
}

/** Lost reasons with leads lost to them, most first. */
export function lostReasonRows(reasons: LostReasonCount[]): { id: number; label: string; count: number }[] {
  return reasons
    .map(r => ({ id: r.id, label: r.label, count: Number(r.inquiries_count) || 0 }))
    .filter(r => r.count > 0)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

/** A signal's lead by the person's name, else their company. */
export function signalName(lead: SignalLead): string | null {
  return lead.guest?.full_name?.trim() || lead.guest?.company?.trim() || null
}

/** A rate as written: "43.5 %" in the person's language. */
export function rate(value: number | null | undefined, lang: string): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return `${new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(value)} %`
}

/* ─── Round 5: the chat's intents, weekdays and lengths ──────────────────── */

/** The engagement AI's intents (App\Enums\ConversationIntent), in this order; `untagged` before it has tagged one. */
export const INTENTS = ['booking_inquiry', 'info_request', 'complaint', 'cancellation', 'support', 'spam', 'other', 'untagged'] as const

/** The intents with conversations, the most first, those not yet tagged last; an unknown one as the server names it. */
export function intentRows(breakdown: ChatAnalytics['intent_breakdown']): { key: string; count: number; known: boolean }[] {
  return (breakdown ?? [])
    .map(r => ({ key: r.intent || 'untagged', count: Number(r.count) || 0, known: (INTENTS as readonly string[]).includes(r.intent || 'untagged') }))
    .filter(r => r.count > 0)
    .sort((a, b) => Number(a.key === 'untagged') - Number(b.key === 'untagged') || b.count - a.count || a.key.localeCompare(b.key))
}

/** A weekday's short name in the person's language (`dow` 0 = Sunday, as the server counts). */
export function weekdayName(dow: number, lang: string): string {
  // 1 November 2026 was a Sunday: the day `dow` after it carries that weekday.
  return new Intl.DateTimeFormat(lang, { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 10, 1 + (((dow % 7) + 7) % 7))))
}

/** Monday to Sunday with the conversations of each, as the server ordered them (every day present). */
export function weekdayRows(dist: ChatAnalytics['weekday_distribution'], lang: string): { dow: number; label: string; count: number }[] {
  const byDow = new Map((dist ?? []).map(d => [d.dow, Number(d.conversations) || 0]))
  return [1, 2, 3, 4, 5, 6, 0].map(dow => ({ dow, label: weekdayName(dow, lang), count: byDow.get(dow) ?? 0 }))
}

/** The busiest weekday, or null with none. */
export function busiestWeekday(rows: { dow: number; count: number }[]): number | null {
  let best: { dow: number; count: number } | null = null
  for (const row of rows) if (row.count > 0 && (!best || row.count > best.count)) best = row
  return best ? best.dow : null
}

/** The conversations by length in the server's buckets; `none` (no message) is worded by the page. */
export function lengthRows(dist: ChatAnalytics['length_distribution']): { key: string; label: string; count: number }[] {
  return (dist ?? []).map(d => ({ key: d.bucket, label: d.label, count: Number(d.count) || 0 }))
}

/* ─── Round 5: the deals ─────────────────────────────────────────────────── */

/** The period's totals from the server's daily series: the value and number of deals completed, the deals that came in. */
export function dealTotals(data: Pick<DealAnalytics, 'revenue_trend' | 'new_deal_trend'>): { revenue: number; completed: number; fresh: number } {
  const sum = <T>(rows: T[], pick: (row: T) => number) => rows.reduce((n, row) => n + (Number(pick(row)) || 0), 0)
  return {
    revenue: Math.round(sum(data.revenue_trend, r => r.revenue) * 100) / 100,
    completed: sum(data.revenue_trend, r => r.count),
    fresh: sum(data.new_deal_trend, r => r.count),
  }
}

/** A daily series as columns: each day up to a month, weeks for longer (the latest week whole, counted back). */
export function dayBuckets(points: { date: string; value: number }[]): { key: string; from: string; to: string; value: number }[] {
  if (points.length <= 31) return points.map(p => ({ key: p.date, from: p.date, to: p.date, value: Number(p.value) || 0 }))
  const out: { key: string; from: string; to: string; value: number }[] = []
  for (let end = points.length - 1; end >= 0; end -= 7) {
    const week = points.slice(Math.max(0, end - 6), end + 1)
    out.unshift({ key: week[0].date, from: week[0].date, to: week[week.length - 1].date, value: week.reduce((n, p) => n + (Number(p.value) || 0), 0) })
  }
  return out
}

/** The payment states we name (DealController::PAYMENT_STATUSES), in this order; `unset` (none chosen) last. */
export const PAYMENT_ORDER = ['pending', 'invoice_sent', 'partial', 'paid', 'refunded', 'unset'] as const

/** The open deals by payment state, those with any, in the order above; an unknown one after, as the server names it. */
export function paymentRows(dist: DealAnalytics['payment_distribution']): { key: string; count: number }[] {
  const rank = (key: string) => {
    const at = (PAYMENT_ORDER as readonly string[]).indexOf(key)
    return at === -1 ? PAYMENT_ORDER.length : at
  }
  return (dist ?? []).map(d => ({ key: d.status || 'unset', count: Number(d.count) || 0 })).filter(d => d.count > 0)
    .sort((a, b) => rank(a.key) - rank(b.key) || b.count - a.count)
}

/* ─── Round 5: the sales reports ─────────────────────────────────────────── */

/** The reports' windows, in months (the full admin's 3m / 6m / 12m); 6 when the address names none we have. */
export const REPORT_MONTHS = [3, 6, 12] as const
export type ReportMonths = (typeof REPORT_MONTHS)[number]

export function monthsOf(value: string | null): ReportMonths {
  const n = Number(value)
  return (REPORT_MONTHS as readonly number[]).includes(n) ? (n as ReportMonths) : 6
}

/** The owners' board's window for a report window: the same span in days, at most the server's 180. */
export function ownerDays(months: ReportMonths): number {
  return Math.min(180, months * 30)
}

/** A forecast month (`YYYY-MM`) as "Dec 26"; null for the "later" bucket, which the page words. */
export function monthLabel(key: string, lang: string): string | null {
  const m = /^(\d{4})-(\d{2})$/.exec(key)
  if (!m) return null
  return new Intl.DateTimeFormat(lang, { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(new Date(Date.UTC(+m[1], +m[2] - 1, 1)))
}

/** The forecast as columns: what is expected at the bottom, the rest of the open value above it. */
export function forecastColumns(report: Pick<ForecastReport, 'buckets'>): { key: string; expected: number; rest: number; deals: number }[] {
  return report.buckets.map(b => {
    const expected = Math.max(0, Number(b.expected_value) || 0)
    return { key: b.key, expected, rest: Math.max(0, (Number(b.gross_value) || 0) - expected), deals: Number(b.deal_count) || 0 }
  })
}

/** The funnel's stage names the server uses (SalesReports::FUNNEL_STAGES), as keys for their words. */
export const FUNNEL_STAGE_KEYS: Record<string, string> = {
  'New': 'new', 'Responded': 'responded', 'Site Visit': 'site_visit', 'Proposal Sent': 'proposal_sent',
  'Negotiating': 'negotiating', 'Tentative': 'tentative', 'Confirmed': 'confirmed',
}

/** Whether a report was refused for want of the Reports page's right (`can_view_analytics`), not broken. */
export function refusedForRights(code: string): boolean {
  return code === 'not_allowed' || code === 'no_capability' || code === 'permission_denied'
}
