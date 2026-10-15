/**
 * Fitting a display figure to its tile (the Today strip). The tile is an
 * inline-size container; the figure's size is
 * `clamp(18px, var(--a-fit) × 1cqi, 30px)` (workspace.css, [data-fit]),
 * and `--a-fit` is worked out here from the figure's own width in ems, measured
 * once per value: the browser then follows the tile's width by itself. A
 * width counted from the characters would not do: in the display face a "1" is
 * 0.40 em and a "W" 0.97, so "CHF 1,234.50" and "WWW 1,234.50", both twelve
 * characters, are 170 and 198 px at 30 px.
 */

/** The share of its tile's width a fitted figure takes, in per cent: 2 % is left for rounding, so a figure sized to the last pixel never spills. */
export const FIT_SHARE = 98

/** The figure's size in cqi (per cent of its tile's inner width) at which a text `ems` em wide takes FIT_SHARE of the tile; null when nothing was measured. */
export function fitCqi(ems: number): number | null {
  return Number.isFinite(ems) && ems > 0 ? FIT_SHARE / ems : null
}

/** The width of the element's text on one line, in ems of its own font size (layout only: a transform does not change it). */
export function emsOf(el: HTMLElement): number {
  const size = parseFloat(getComputedStyle(el).fontSize)
  const { whiteSpace, width } = el.style
  el.style.whiteSpace = 'nowrap'
  el.style.width = 'max-content'
  const wide = el.getBoundingClientRect().width
  el.style.whiteSpace = whiteSpace
  el.style.width = width
  return size > 0 ? wide / size : 0
}
