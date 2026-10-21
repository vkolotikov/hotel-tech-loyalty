import type { RequestState, RequestTab } from '../lib/types'

export type RequestAction = 'approve' | 'done' | 'decline'

/** What a request offers from where it stands (spec 2026-10-21 §4.4): the server's own steps (RequestQueue). */
export function requestActions(state: RequestState): RequestAction[] {
  if (state === 'pending' || state === 'eligible') return ['approve', 'decline']
  if (state === 'approved') return ['done', 'decline']
  return []
}

export const TABS: RequestTab[] = ['waiting', 'approved', 'done']

/** The tab a key moves to from `current` (the arrows wrap, Home and End go to the ends), or null for any other key. */
export function tabAfter(current: RequestTab, key: string): RequestTab | null {
  const i = TABS.indexOf(current)
  const n = TABS.length
  if (key === 'ArrowRight') return TABS[(i + 1) % n]
  if (key === 'ArrowLeft') return TABS[(i - 1 + n) % n]
  if (key === 'Home') return TABS[0]
  if (key === 'End') return TABS[n - 1]
  return null
}

/** The tab an address names, Waiting for anything else. */
export function tabFrom(search: string): RequestTab {
  const tab = new URLSearchParams(search).get('tab') as RequestTab
  return TABS.includes(tab) ? tab : 'waiting'
}
