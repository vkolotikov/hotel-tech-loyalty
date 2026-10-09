import { createElement, isValidElement, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react'
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

/** Wraps a recharts Pie `label` render function; see lightChartChrome. */
export type PieLabelWrap = <P>(text: (props: P) => ReactNode) => (props: P) => ReactNode

/** The chart text Clean light puts in the ink; every field undefined outside it. */
export interface LightChartChrome {
  /** Tooltip box (recharts contentStyle); a chart adds its own radius or font size. */
  tooltipStyle: CSSProperties | undefined
  /** Tooltip item rows (itemStyle): recharts draws them in the series colour. */
  itemStyle: CSSProperties | undefined
  /** Legend `formatter`: recharts draws legend words in the series colour; this keeps the swatch and inks the words. */
  legendFormatter: ((value: unknown) => ReactNode) | undefined
  /** SVG props for pie label text (recharts draws it in the slice fill). */
  pieLabelProps: { fill: string } | undefined
  /** A Pie `label` function drawn with pieLabelProps in light; outside light the same function, untouched. */
  pieLabel: PieLabelWrap
}

const keepPieLabel: PieLabelWrap = text => text
const LIGHT_PIE_LABEL = { fill: LIGHT_CHART.tooltipText }

/** recharts' own pie label text (Text: one line, anchored at the label point), filled with the ink. */
const inkPieLabel: PieLabelWrap = text => props => {
  const label = text(props)
  if (isValidElement(label)) return label
  const { x, y, textAnchor, style } = props as unknown as { x?: number; y?: number; textAnchor?: string; style?: CSSProperties }
  return createElement('text', {
    x, y, textAnchor, style, alignmentBaseline: 'middle', className: 'recharts-pie-label-text', ...LIGHT_PIE_LABEL,
  }, label)
}

const LIGHT_CHART_CHROME: LightChartChrome = {
  tooltipStyle: {
    backgroundColor: LIGHT_CHART.tooltipBg,
    border: `1px solid ${LIGHT_CHART.tooltipBorder}`,
    color: LIGHT_CHART.tooltipText,
  },
  itemStyle: { color: LIGHT_CHART.tooltipText },
  legendFormatter: value => createElement('span', { style: { color: LIGHT_CHART.tooltipText } }, value as ReactNode),
  pieLabelProps: LIGHT_PIE_LABEL,
  pieLabel: inkPieLabel,
}

const DARK_CHART_CHROME: LightChartChrome = {
  tooltipStyle: undefined,
  itemStyle: undefined,
  legendFormatter: undefined,
  pieLabelProps: undefined,
  pieLabel: keepPieLabel,
}

/**
 * One source for the chart text that must read on paper: recharts draws
 * tooltip items, legend words and pie labels in the series colour (2.2-2.5:1
 * on paper). In Clean light this gives the ink for each; outside it every
 * field is undefined and pieLabel hands the label back untouched, so each
 * chart keeps its own dark chrome in Glass and Classic. The objects are
 * module constants: the same identity on every render.
 */
export function lightChartChrome(light: boolean): LightChartChrome {
  return light ? LIGHT_CHART_CHROME : DARK_CHART_CHROME
}

/** Whether <html> shows the admin in Clean light right now (read from the DOM, never cached). */
export const lightNow = (): boolean =>
  typeof document !== 'undefined' &&
  document.documentElement.getAttribute('data-style') === 'light' &&
  document.documentElement.getAttribute('data-shell') === 'admin'

/*
 * One store for every useIsLight() on the page: a single MutationObserver on
 * <html>, made for the first subscriber and dropped with the last, instead
 * of one per call (a Planner list has one per row). useSyncExternalStore
 * re-reads lightNow() when it subscribes, so a component first mounted in
 * the same commit as the Layout that sets data-shell (in a layout effect)
 * still catches the flag, which a per-call observer created afterwards missed.
 */
const lightListeners = new Set<() => void>()
let lightObserver: MutationObserver | null = null

export function subscribeLight(onChange: () => void): () => void {
  lightListeners.add(onChange)
  if (!lightObserver && typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
    lightObserver = new MutationObserver(() => {
      for (const listener of [...lightListeners]) listener()
    })
    lightObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-style', 'data-shell'] })
  }
  return () => {
    lightListeners.delete(onChange)
    if (lightListeners.size === 0 && lightObserver) {
      lightObserver.disconnect()
      lightObserver = null
    }
  }
}

/** True while the admin shows Clean light; re-renders when the style changes. For SVG chart props, which cannot read CSS variables. */
export function useIsLight(): boolean {
  return useSyncExternalStore(subscribeLight, lightNow, () => false)
}

const inkCache = new Map<string, string>()

/**
 * Text in a data colour (a stage, tag or status colour that comes from the
 * server or a palette): in Clean light the same rule as every other
 * hard-coded text colour (lightTextFor: 4.6:1 on white, canvas and hover);
 * everywhere else it is the colour itself. Fills and tints keep the plain colour.
 * Memoised: lightTextFor deepens step by step, and a list asks for the same few colours on every row.
 */
export function dataInkFor(colour: string): string {
  if (!isHex(colour)) return colour
  const key = six(colour.trim())
  let ink = inkCache.get(key)
  if (ink === undefined) {
    ink = lightTextFor(key)
    inkCache.set(key, ink)
  }
  return ink
}

const sameColour = (colour: string) => colour

/** A function that returns a data colour as text: deepened in Clean light, unchanged elsewhere. Stable while the style holds. */
export function useDataInk(): (colour: string) => string {
  return useIsLight() ? dataInkFor : sameColour
}
