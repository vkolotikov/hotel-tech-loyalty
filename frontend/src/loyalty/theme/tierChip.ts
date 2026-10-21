import { NAVY_SURFACES, contrast, triplet, type ThemeName } from '../../workspace/theme/accent'

const WHITE = '#ffffff'
const INK = '#14181c'

/** A tier colour as the server stores it (`#rgb` or `#rrggbb`), or null for one that is not a colour. */
export function tierHex(color: string | null | undefined): string | null {
  const v = (color ?? '').trim().toLowerCase()
  if (/^#[0-9a-f]{6}$/.test(v)) return v
  if (/^#[0-9a-f]{3}$/.test(v)) return '#' + v.slice(1).split('').map(c => c + c).join('')
  return null
}

export interface TierPaint {
  /** The chip's variables (`--l-tier`, `--l-tier-ink`); empty for a tier without a colour (the surface's own). */
  style: Record<string, string>
  /** The colour nearly vanishes on the page: the chip takes an outline. */
  edge: boolean
}

/**
 * A tier's chip (spec 2026-10-21 §6.2): the tier's own colour as the fill, its name in white where white reads
 * 4.5:1 on it (the rule for small text on a fill, owner 2026-10-15), else in the dark ink — whichever reads better
 * where neither does — and an outline where the fill reads under 1.5:1 on the surface it sits on.
 */
export function tierPaint(color: string | null | undefined, theme: ThemeName): TierPaint {
  const fill = tierHex(color)
  if (!fill) return { style: {}, edge: true }
  const onWhite = contrast(WHITE, fill)
  const onInk = contrast(INK, fill)
  const ink = onWhite >= 4.5 ? WHITE : onInk >= 4.5 ? INK : onWhite >= onInk ? WHITE : INK
  const surface = NAVY_SURFACES[theme].surface

  return {
    style: { '--l-tier': triplet(fill), '--l-tier-ink': triplet(ink) },
    edge: contrast(fill, surface) < 1.5,
  }
}
