import type { Options } from '../options/types'
import type { Look } from '../app/types'

export type Period = '30d' | '90d' | '12m'
export type ActivityFilter = 'all' | 'points' | 'rewards' | 'visits'
export type Mode = 'points' | 'discounts' | 'visits' | 'services'
export type Module = 'summary' | 'checks' | 'metrics' | 'queue' | 'activity'
export type Panel = 'program' | 'preview' | 'issues' | 'numbers' | 'activity' | 'requests'
export interface Envelope<T> {
  scope: number
  as_of: string
  period: { choice: Period; from: string; to: string; start: string; end: string; timezone: string }
  data: T
}
export interface Summary {
  mode: Mode
  configured: boolean
  options: Options
  tiers: { id: number; name: string; min_points: number; min_visits: number | null; min_spend: number | null; invitation_only: boolean }[]
  rewards: number
  benefits: number
  offers: number
  minimum_reward: { id: number; name: string; points_cost: number } | null
  setup: { done: number; total: number; steps: { key: string; done: boolean; count: number }[] }
  appearance: Look
}
export interface Issue {
  id: string; area: 'program' | 'options'; code: string; level: 'warn' | 'tip'
  params: Record<string, number>; entities: { id: number; name: string }[]; href: string
}
export interface Checks { issues: Issue[]; warnings: number }
export type MetricKey = 'members' | 'rewards_used' | 'points_available' | 'offers_used' | 'active_offers' | 'checkins' | 'benefits_fulfilled' | 'active_benefits'
export interface Metric { key: MetricKey; value: number | null; kind: 'current' | 'period'; reason?: string }
export interface Metrics { mode: Mode; joined: number; items: Metric[] }
export interface QueueItem { source: 'benefit' | 'redemption'; id: number; status: string; title: string | null; member: string | null; created_at: string | null; href: string }
export interface Queue { total: number; items: QueueItem[]; sources: ('benefits' | 'redemptions')[] }
export interface ActivityItem { source: 'points' | 'reward' | 'visit' | 'member' | 'tier' | 'benefit' | 'offer'; id: number; at: string; member: string | null; amount: number | null; kind: string; label: string | null; href: string }
export interface Activity { items: ActivityItem[]; filter: ActivityFilter; limit: number }
export interface ModuleData { summary: Summary; checks: Checks; metrics: Metrics; queue: Queue; activity: Activity }
