import type { MemberFilters, MemberSort, MemberState } from '../lib/types'

/**
 * What the list's Show offers: the members' own switch (active, switched off, all) and, since release 8 (spec
 * 2026-10-25 §3), the switched-on members whose membership is expiring soon or has expired (MemberDirectory::STATES).
 */
export type ListState = MemberState | 'expiring' | 'expired'
export type ListFilters = Omit<MemberFilters, 'state'> & { state: ListState }

const SORTS: MemberSort[] = ['recent', 'points', 'name', 'activity']
export const LIST_STATES: ListState[] = ['active', 'inactive', 'all', 'expiring', 'expired']

export const NO_FILTERS: MemberFilters = { q: '', tier_id: null, state: 'active', sort: 'recent', page: 1 }

/**
 * The filters as the shared client's `members` call types them. The server takes every ListState (the string is sent
 * as it is); lib/types' MemberState predates release 8's two.
 */
export const asMemberFilters = (filters: ListFilters): MemberFilters => filters as MemberFilters

/**
 * The list's filters from its address (spec 2026-10-21 §4.2), so a list can be shared: a value that cannot be used
 * (an unknown tier, a sort that does not exist, a page that is not a number) falls back to none.
 */
export function filtersFrom(search: string, tierIds: number[]): ListFilters {
  const p = new URLSearchParams(search)
  const tier = Number(p.get('tier'))
  const sort = p.get('sort') as MemberSort
  const state = p.get('state') as ListState
  const page = Number(p.get('page'))
  return {
    q: (p.get('q') ?? '').slice(0, 100),
    tier_id: Number.isInteger(tier) && tierIds.includes(tier) ? tier : null,
    state: LIST_STATES.includes(state) ? state : 'active',
    sort: SORTS.includes(sort) ? sort : 'recent',
    page: Number.isInteger(page) && page > 1 ? page : 1,
  }
}

/** The address for these filters: only what differs from the default, so the plain list is plain `/loyalty`. */
export function searchFor(filters: ListFilters): string {
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
export function withChange(filters: ListFilters, change: Partial<Omit<ListFilters, 'page'>>): ListFilters {
  return { ...filters, ...change, page: 1 }
}

/** Pressing a tier's chip shows only that tier; pressing it again shows every tier. */
export function toggleTier(filters: ListFilters, tierId: number): ListFilters {
  return withChange(filters, { tier_id: filters.tier_id === tierId ? null : tierId })
}

/** Whether the list shows members by their membership's end date (release 8): the rows then say it. */
export const byValidity = (state: ListState): boolean => state === 'expiring' || state === 'expired'

/**
 * A name's initials for the list's avatar: the first letters of its first and last words ("Ada Lovelace" → "AL"); for a
 * member known only by an address, of its part before the @ ("grace.hopper@…" → "GH").
 */
export function initials(name: string): string {
  const plain = name.trim()
  const words = (plain.includes('@') && !/\s/.test(plain) ? plain.split('@')[0] : plain).split(/[\s._-]+/).filter(Boolean)
  if (words.length === 0) return '?'
  const first = [...words[0]][0] ?? ''
  const last = words.length > 1 ? [...words[words.length - 1]][0] ?? '' : ''
  return (first + last).toLocaleUpperCase()
}
