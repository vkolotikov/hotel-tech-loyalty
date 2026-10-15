import { isDateKey } from '../../workspace/lib/wallClock'
import type { Platform, PostFilters, PostStatus } from '../lib/types'

export const NO_FILTERS: PostFilters = { q: '', status: '', platform: '', pillar_id: null, from: '', to: '', unscheduled: false, page: 1 }

/** A real calendar day as YYYY-MM-DD (the server's date_format:Y-m-d refuses 2026-13-40, which has the right shape). */
function isRealDay(value: string): boolean {
  if (!isDateKey(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

/** A whole number the server takes as an id or a page (PostgreSQL integer); anything else is "not given". */
const whole = (value: string | null): number | null => {
  const n = Number(value)
  return value !== null && Number.isInteger(n) && n > 0 && n <= 2_147_483_647 ? n : null
}

/**
 * The filters a Posts address holds. Anything it cannot use falls back to
 * "not filtered", so a shared or hand-edited link never makes the server
 * refuse the list: an end before the start is dropped, and "only posts with
 * no day" wins over a date range.
 */
export function readFilters(params: URLSearchParams, statuses: readonly PostStatus[], platforms: readonly Platform[]): PostFilters {
  const status = params.get('status') ?? ''
  const platform = params.get('platform') ?? ''
  const unscheduled = params.get('unscheduled') === '1'
  const day = (name: string): string => {
    const value = params.get(name) ?? ''
    return !unscheduled && isRealDay(value) ? value : ''
  }
  const from = day('from')
  let to = day('to')
  if (from !== '' && to !== '' && to < from) to = ''
  return {
    q: (params.get('q') ?? '').slice(0, 100),
    status: (statuses as readonly string[]).includes(status) ? (status as PostStatus) : '',
    platform: (platforms as readonly string[]).includes(platform) ? (platform as Platform) : '',
    pillar_id: whole(params.get('pillar')),
    from: from as PostFilters['from'],
    to: to as PostFilters['to'],
    unscheduled,
    page: whole(params.get('page')) ?? 1,
  }
}

/** The address for these filters: only what holds something, the page only after the first. */
export function writeFilters(filters: PostFilters): URLSearchParams {
  const out = new URLSearchParams()
  if (filters.q !== '') out.set('q', filters.q)
  if (filters.status !== '') out.set('status', filters.status)
  if (filters.platform !== '') out.set('platform', filters.platform)
  if (filters.pillar_id !== null) out.set('pillar', String(filters.pillar_id))
  if (filters.unscheduled) out.set('unscheduled', '1')
  if (!filters.unscheduled && filters.from !== '') out.set('from', filters.from)
  if (!filters.unscheduled && filters.to !== '') out.set('to', filters.to)
  if (filters.page > 1) out.set('page', String(filters.page))
  return out
}

/** A change of filter starts again from the first page; a change of page keeps the filters. */
export const withFilter = (filters: PostFilters, change: Partial<PostFilters>): PostFilters => ({ ...filters, ...change, page: change.page ?? 1 })

/** Whether anything filters the list (the page does not). */
export const isFiltered = (f: PostFilters): boolean =>
  f.q.trim() !== '' || f.status !== '' || f.platform !== '' || f.pillar_id !== null || f.from !== '' || f.to !== '' || f.unscheduled
