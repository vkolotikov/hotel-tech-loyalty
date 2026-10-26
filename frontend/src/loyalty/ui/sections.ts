/**
 * The colour families (theme/loyalty.css, `data-hue`): one per kind of thing, so a page reads by colour. Release 10
 * added tier (blue) and place (teal), the owner's section colours.
 */
export type Hue = 'earn' | 'bonus' | 'rule' | 'gift' | 'offer' | 'tier' | 'place' | 'off'

/**
 * The section a key moves to in a row of section cards (one tab stop): the arrow keys step and wrap, Home and End
 * jump to the ends; any other key moves nothing.
 */
export function sectionAfter<T extends string>(ids: readonly T[], current: T, key: string): T | null {
  const i = ids.indexOf(current)
  const n = ids.length
  if (n === 0) return null
  if (key === 'ArrowRight' || key === 'ArrowDown') return ids[(i + 1) % n]
  if (key === 'ArrowLeft' || key === 'ArrowUp') return ids[(i - 1 + n) % n]
  if (key === 'Home') return ids[0]
  if (key === 'End') return ids[n - 1]
  return null
}
