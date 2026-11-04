/**
 * The item a key press moves to in a radio group (the sign-up's business-type tiles, IndustryTiles): the arrows step
 * through the list and wrap round, Home and End jump to the ends; any other key moves nothing.
 */
export function stepIndex(from: number, key: string, count: number): number | null {
  if (count === 0) return null
  if (key === 'ArrowRight' || key === 'ArrowDown') return (from + 1) % count
  if (key === 'ArrowLeft' || key === 'ArrowUp') return (from - 1 + count) % count
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  return null
}
