import type { RequestsPage } from './types'

export function queueCounts(benefits: RequestsPage['counts'], rewards: number) {
  return { waiting: benefits.waiting + rewards, approved: benefits.approved, open: benefits.waiting + benefits.approved + rewards }
}
/** Refetches can move rows between pages. Never render or operate on a duplicate. */
export function uniqueRows<T extends { id: number }>(rows: T[]): T[] {
  return [...new Map(rows.map(row => [row.id, row])).values()]
}
