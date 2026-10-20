import type { ShortLinkFacts } from '../lib/types'

/** What the panel says about a post's short link while its Link field holds what the person typed (spec 2026-10-19 §5.1, §5.5). */
export type LinkState = 'none' | 'pending' | 'live' | 'moving' | 'clearing' | 'off' | 'reviving'

/** The notes' English words, the fallback under the bundles' (linkMath.test.ts keeps them equal to `links.note`). */
export const LINK_NOTES = {
  pending: 'The short link appears once the post is saved.',
  moving: 'Saving keeps this short link: it will lead to the new address, also from posts already out.',
  clearing: 'Saving without a link switches this short link off: anyone who taps it is told it is no longer active.',
  off: 'This short link is switched off. Enter a link to switch it back on.',
  reviving: 'Saving switches this short link back on.',
} as const

/**
 * The short link's state against the field: nothing without a Link; before its first save, that it comes with the save;
 * then live, or what saving the field would do — keep the code for a new address, switch it off when emptied, switch a
 * switched-off one back on.
 */
export function linkState(typed: string, link: ShortLinkFacts | null | undefined): LinkState {
  const address = typed.trim()
  if (!link) return address === '' ? 'none' : 'pending'
  if (!link.on) return address === '' ? 'off' : 'reviving'
  if (address === '') return 'clearing'
  return address === link.destination ? 'live' : 'moving'
}

/** The 14 bars (spec §5.5): each day's share of the busiest day, in percent; a day with clicks shows at least 8 %. */
export function barsOf<T extends { clicks: number }>(days: readonly T[]): (T & { height: number })[] {
  const most = Math.max(0, ...days.map(d => d.clicks))
  return days.map(d => ({ ...d, height: d.clicks <= 0 || most === 0 ? 0 : Math.max(8, Math.round((d.clicks / most) * 100)) }))
}
