import type { Bootstrap } from '../lib/types'
import { failureOf } from '../lib/api'
import type { ActivityFilter, Module, Period } from './types'

export const PERIODS: Period[] = ['30d', '90d', '12m']
export const FILTERS: ActivityFilter[] = ['all', 'points', 'rewards', 'visits']
export function periodFrom(search: string): Period {
  const value = new URLSearchParams(search).get('period')
  return PERIODS.includes(value as Period) ? value as Period : '30d'
}
export function filterFrom(search: string): ActivityFilter {
  const value = new URLSearchParams(search).get('activity')
  return FILTERS.includes(value as ActivityFilter) ? value as ActivityFilter : 'all'
}
export function overviewSearch(search: string, change: { period?: Period; activity?: ActivityFilter }): string {
  const params = new URLSearchParams(search)
  Object.entries(change).forEach(([key, value]) => params.set(key, value))
  return `?${params}`
}
export function overviewScope(boot: Bootstrap): string {
  return `${boot.organization.id}:${boot.staff.id}:${JSON.stringify(boot.staff.can)}`
}
export function overviewKey(scope: string, module: Module, period: Period = '30d', filter: ActivityFilter = 'all') {
  return ['loyalty', 'overview', scope, module, ...(module === 'metrics' || module === 'activity' ? [period] : []), ...(module === 'activity' ? [filter] : [])] as const
}
export function denied(error: unknown): boolean {
  return [401, 402, 403].includes(failureOf(error).status)
}
export function canRetain(error: unknown, savedScope: number | undefined, scope: number): boolean {
  return savedScope === scope && !denied(error)
}
