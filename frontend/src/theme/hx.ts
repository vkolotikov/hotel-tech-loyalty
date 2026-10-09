import { useEffect, useState } from 'react'
import { hexToRgb, isHex, toTriplet } from './colour'
import { lightTextFor } from './light'

const six = (hex: string) => {
  const h = hex.replace('#', '').toLowerCase()
  return h.length === 3 ? h.split('').map(c => c + c).join('') : h
}

/**
 * A hard-coded inline colour Clean light can restyle: `kind` 't' for text,
 * 'f' for fills, borders, strokes and gradient stops. Everywhere else it is
 * exactly the old colour. Register the hex in hxColours.ts.
 */
export function hx(kind: 't' | 'f', hex: string, alpha = 1): string {
  const h = six(hex)
  return `rgb(var(--hx-${kind}-${h}, ${toTriplet(hexToRgb(h))}) / ${alpha})`
}

/** White as an inline colour: the ink in Clean light, white elsewhere (for rgba(255,255,255,a)). */
export function hxWhite(alpha = 1): string {
  return `rgb(var(--hx-white, 255 255 255) / ${alpha})`
}

/** colorScheme for inline styles: dark everywhere but Clean light. */
export const HX_COLOR_SCHEME = 'var(--hx-color-scheme, dark)'

/** Chart chrome in Clean light; each chart keeps its own dark constants for Glass and Classic. */
export const LIGHT_CHART = {
  grid: '#E5EAEF',
  tick: '#54626E',
  tooltipBg: '#FFFFFF',
  tooltipBorder: '#DDE3E8',
  tooltipText: '#1B2A34',
  cursor: 'rgba(27, 42, 52, 0.05)',
} as const

const lightNow = () =>
  typeof document !== 'undefined' &&
  document.documentElement.getAttribute('data-style') === 'light' &&
  document.documentElement.getAttribute('data-shell') === 'admin'

/** True while the admin shows Clean light; re-renders when the style changes. For SVG chart props, which cannot read CSS variables. */
export function useIsLight(): boolean {
  const [light, setLight] = useState(lightNow)
  useEffect(() => {
    const observer = new MutationObserver(() => setLight(lightNow()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-style', 'data-shell'] })
    return () => observer.disconnect()
  }, [])
  return light
}

/**
 * Text in a data colour (a stage, tag or status colour that comes from the
 * server or a palette): in Clean light the same rule as every other
 * hard-coded text colour (lightTextFor: 4.6:1 on white, canvas and hover);
 * everywhere else it is the colour itself. Fills and tints keep the plain colour.
 */
export function dataInkFor(colour: string): string {
  return isHex(colour) ? lightTextFor(six(colour.trim())) : colour
}

/** A function that returns a data colour as text: deepened in Clean light, unchanged elsewhere. */
export function useDataInk(): (colour: string) => string {
  const light = useIsLight()
  return light ? dataInkFor : (colour: string) => colour
}
