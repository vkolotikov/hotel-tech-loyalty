import type { CSSProperties } from 'react'
/** Decimal-safe controls clamp only a deliberate step; typed values still pass through existing validation. */
export function steppedValue(value: string, delta: number, min = 0, max = Number.MAX_SAFE_INTEGER): string {
  const parsed = Number(value.replace(',', '.'))
  return String(Math.min(max, Math.max(min, Math.round(((Number.isFinite(parsed) ? parsed : 0) + delta) * 100) / 100)))
}
import { contrast } from '../../workspace/theme/accent'
import { tierHex } from '../theme/tierChip'

/** Keep the owner's tier colour when readable; use the theme's text otherwise. */
export function readableTierColor(color: string | null | undefined, theme: 'light' | 'dark'): string {
  const hex = tierHex(color)
  const surface = theme === 'dark' ? '#2a2f59' : '#eef2f7'
  return hex && contrast(hex, surface) >= 4.5 ? hex : theme === 'dark' ? '#c7d3e5' : '#1b2430'
}

/** Resolve both paints once; CSS follows the live shell theme, including an in-place theme change. */
export function tierTextStyle(color: string | null | undefined): CSSProperties {
  return { '--rd-tier-dark': readableTierColor(color, 'dark'), '--rd-tier-light': readableTierColor(color, 'light') } as CSSProperties
}
