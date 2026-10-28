import type { Money } from './types'

export interface ReportFilters { from: string; to: string; compare: 'previous' | 'none'; tier_id: string }
export interface ReportMetrics {
  members: number; active: number; new_members: number; participation: number | null
  issued: number; redeemed: number; expired: number; claims: number; fulfilled: number; pending: number; cancelled: number
  fulfilment: number | null; money: Money
}
export interface ReportWeek { from: string; to: string; active: number; sales: number }
export interface ReportCohort { from: string; to: string; members: number; returns: (number | null)[] }
export interface InsightsReport {
  from: string; to: string; days: number; timezone: string; updated_at: string; snapshot_date: string; tier_id: number | null
  comparison: { from: string; to: string } | null; current: ReportMetrics; previous: ReportMetrics | null
  series: ReportWeek[]; previous_series: ReportWeek[]
  tiers: { rows: { id: number; name: string; members: number }[]; none: number; total: number }
  outstanding: number; rewards: { id: number; name: string | null; claims: number }[]; cohorts: ReportCohort[]
  attention: { expiring: number; expiring_members: number; expiry_from: string; expiry_to: string; quiet: number }
}
