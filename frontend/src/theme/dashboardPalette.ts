import { hx } from './hx'

/**
 * The full admin dashboard's data colours (2026-11-09, pages/dashboard): one hue per measure. Text takes ink(), fills,
 * strokes and washes fill(): each hue's call is written out below, so hxColours.ts registers it and Clean light gives
 * it a deeper shade (a hue it does not know is drawn as it is). A new hue gets a line in both tables.
 */
export const DASH_HUE = {
  blue: '#3b82f6',
  emerald: '#10b981',
  cyan: '#22d3ee',
  violet: '#8b5cf6',
  purple: '#a855f7',
  amber: '#f59e0b',
  indigo: '#6366f1',
  red: '#ef4444',
  orange: '#f97316',
  gold: '#c9a84c',
  pink: '#ec4899',
} as const

export type DashHue = keyof typeof DASH_HUE

const INK: Record<string, string> = {
  '#3b82f6': hx('t', '#3b82f6'),
  '#10b981': hx('t', '#10b981'),
  '#22d3ee': hx('t', '#22d3ee'),
  '#8b5cf6': hx('t', '#8b5cf6'),
  '#a855f7': hx('t', '#a855f7'),
  '#f59e0b': hx('t', '#f59e0b'),
  '#6366f1': hx('t', '#6366f1'),
  '#ef4444': hx('t', '#ef4444'),
  '#f97316': hx('t', '#f97316'),
  '#c9a84c': hx('t', '#c9a84c'),
  '#ec4899': hx('t', '#ec4899'),
}

const FILL: Record<string, (alpha: number) => string> = {
  '#3b82f6': a => hx('f', '#3b82f6', a),
  '#10b981': a => hx('f', '#10b981', a),
  '#22d3ee': a => hx('f', '#22d3ee', a),
  '#8b5cf6': a => hx('f', '#8b5cf6', a),
  '#a855f7': a => hx('f', '#a855f7', a),
  '#f59e0b': a => hx('f', '#f59e0b', a),
  '#6366f1': a => hx('f', '#6366f1', a),
  '#ef4444': a => hx('f', '#ef4444', a),
  '#f97316': a => hx('f', '#f97316', a),
  '#c9a84c': a => hx('f', '#c9a84c', a),
}

/** A hue as text, in Clean light its deeper shade. */
export function ink(hue: string): string {
  return INK[hue.toLowerCase()] ?? hx('t', hue)
}

/** A hue as a fill, stroke or wash at `alpha`. */
export function fill(hue: string, alpha = 1): string {
  return FILL[hue.toLowerCase()]?.(alpha) ?? hx('f', hue, alpha)
}
