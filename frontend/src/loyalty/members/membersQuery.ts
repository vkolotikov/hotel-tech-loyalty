import type { MemberFilters, MemberSort, MemberState } from '../lib/types'

const SORTS: MemberSort[] = ['recent', 'points', 'name', 'activity']
const STATES: MemberState[] = ['active', 'inactive', 'all']

export const NO_FILTERS: MemberFilters = { q: '', tier_id: null, state: 'active', sort: 'recent', page: 1 }

/**
 * The list's filters from its address (spec 2026-10-21 §4.2), so a list can be shared: a value that cannot be used
 * (an unknown tier, a sort that does not exist, a page that is not a number) falls back to none.
 */
export function filtersFrom(search: string, tierIds: number[]): MemberFilters {
  const p = new URLSearchParams(search)
  const tier = Number(p.get('tier'))
  const sort = p.get('sort') as MemberSort
  const state = p.get('state') as MemberState
  const page = Number(p.get('page'))
  return {
    q: (p.get('q') ?? '').slice(0, 100),
    tier_id: Number.isInteger(tier) && tierIds.includes(tier) ? tier : null,
    state: STATES.includes(state) ? state : 'active',
    sort: SORTS.includes(sort) ? sort : 'recent',
    page: Number.isInteger(page) && page > 1 ? page : 1,
  }
}

/** The address for these filters: only what differs from the default, so the plain list is plain `/loyalty`. */
export function searchFor(filters: MemberFilters): string {
  const p = new URLSearchParams()
  if (filters.q.trim() !== '') p.set('q', filters.q.trim())
  if (filters.tier_id !== null) p.set('tier', String(filters.tier_id))
  if (filters.state !== 'active') p.set('state', filters.state)
  if (filters.sort !== 'recent') p.set('sort', filters.sort)
  if (filters.page > 1) p.set('page', String(filters.page))
  const s = p.toString()
  return s ? `?${s}` : ''
}

/** A change of anything but the page starts the list again on its first page. */
export function withChange(filters: MemberFilters, change: Partial<Omit<MemberFilters, 'page'>>): MemberFilters {
  return { ...filters, ...change, page: 1 }
}

/** Pressing a tier's chip shows only that tier; pressing it again shows every tier. */
export function toggleTier(filters: MemberFilters, tierId: number): MemberFilters {
  return withChange(filters, { tier_id: filters.tier_id === tierId ? null : tierId })
}
