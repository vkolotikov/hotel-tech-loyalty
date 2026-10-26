/**
 * The workspace accent from the organisation's brand colour (Settings →
 * Branding → Primary), per theme (spec 4.2):
 *  - accent: the brand itself, for fills (primary button, selected states);
 *  - ink:    text on those fills — white while white reads ≥ 3:1, else dark ink;
 *  - deep:   the hover fill, moved away from the ink so it keeps its contrast;
 *  - text:   accent-coloured text, darkened (light) / lightened (dark) until it
 *            reads ≥ 4.6:1 on the canvas, the surfaces and a 14 % accent tint
 *            over each of them;
 *  - rail:   a small accent mark on the side panel, ≥ 3:1 on it;
 *  - edge:   the brand is almost the page colour (under 1.5:1 on the canvas, the
 *            surface or surface-2) — fills need an outline.
 * Accent LINES and accent text are drawn in `text`, never in `accent`: it reads
 * ≥ 4.6:1 on every surface for every brand, the brand itself seldom reads 3:1.
 */
export type ThemeName = 'light' | 'dark'

export const FALLBACK_ACCENT = '#3b82f6'
const INK = '#0e1a24'
const WHITE = '#ffffff'

/**
 * The colours accent text and marks sit on: the Atelier palette (spec 4.1).
 * theme/contrast.test.ts proves they equal the --a-canvas / --a-surface /
 * --a-surface-2 / --a-side tokens in workspace.css.
 */
export const SURFACES: Record<ThemeName, { canvas: string; surface: string; surface2: string; side: string }> = {
  light: { canvas: '#f4f6f8', surface: '#ffffff', surface2: '#eef2f5', side: '#0e1a24' },
  dark: { canvas: '#0e1a24', surface: '#13232f', surface2: '#1a2e3c', side: '#0a141c' },
}

/**
 * The cards frame's palette (Content spec 2026-10-21 §3.1): the owner's navy in Dark, a light set with the navy side
 * panel in Light. HexaTech Content wears it; content/theme/contentContrast.test.ts proves it equals the [data-content]
 * tokens. (HexaTech Loyalty wore it too until release 10, below.)
 */
export const NAVY_SURFACES: Record<ThemeName, { canvas: string; surface: string; surface2: string; side: string }> = {
  light: { canvas: '#f4f6f9', surface: '#ffffff', surface2: '#eef2f7', side: '#1c232c' },
  dark: { canvas: '#202836', surface: '#242c3a', surface2: '#29303f', side: '#1c232c' },
}

/** HexaTech Content's name for the navy palette (release 7a). */
export const CONTENT_SURFACES = NAVY_SURFACES

/**
 * HexaTech Loyalty's palette (release 10, the owner's Figma drafts 2026-10-26): in Dark the drafts' navy — cards that
 * stand clearly off the canvas, a deeper side panel; in Light the cards frame's, with the same side panel.
 * loyalty/theme/loyaltyContrast.test.ts proves it equals the [data-loyalty] tokens.
 */
export const LOYALTY_SURFACES: Record<ThemeName, { canvas: string; surface: string; surface2: string; side: string }> = {
  light: { canvas: '#f4f6f9', surface: '#ffffff', surface2: '#eef2f7', side: '#111b29' },
  dark: { canvas: '#182231', surface: '#29384b', surface2: '#1f2c3e', side: '#111b29' },
}

/** A post card's text and secondary text in Content (`--a-text` and `--c-card-text-2`). */
const CARD_TEXT: Record<ThemeName, { text: string; text2: string }> = {
  light: { text: '#1b2430', text2: '#546272' },
  dark: { text: '#e8eef4', text2: '#aab8ca' },
}

export interface AccentTokens { accent: string; ink: string; deep: string; text: string; rail: string; edge: boolean }

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function toHex(c: number[]): string {
  return '#' + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')
}

function mix(a: string, b: string, t: number): string {
  const A = rgb(a), B = rgb(b)
  return toHex(A.map((v, i) => v + (B[i] - v) * t))
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map(v => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4) })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrast(a: string, b: string): number {
  const x = luminance(a), y = luminance(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

function normalise(brand: string | null | undefined): string {
  const v = (brand ?? '').trim().toLowerCase()
  if (/^#[0-9a-f]{6}$/.test(v)) return v
  if (/^#[0-9a-f]{3}$/.test(v)) return '#' + v.slice(1).split('').map(c => c + c).join('')
  return FALLBACK_ACCENT
}

/** A 14 % accent tint over a surface — what selected rows and accent chips are drawn on. */
export function tint(surface: string, accent: string): string {
  return mix(surface, accent, 0.14)
}

/** The colour moved towards `toward` in 5 % steps until it reads `min` on every background. */
function readableOn(color: string, backgrounds: string[], min: number, toward: string): string {
  for (let i = 0; i <= 20; i++) {
    const c = i === 0 ? color : mix(color, toward, i / 20)
    if (backgrounds.every(b => contrast(c, b) >= min)) return c
  }
  return toward
}

/** The accent worked out on the Atelier palette, or on the surfaces a workspace passes (Content's navy). */
export function accentTokens(brand: string | null | undefined, theme: ThemeName, surfaces: { canvas: string; surface: string; surface2: string; side: string } = SURFACES[theme]): AccentTokens {
  const accent = normalise(brand)
  const s = surfaces
  const ink = contrast(WHITE, accent) >= 3 ? WHITE : INK
  const deep = mix(accent, ink === WHITE ? '#000000' : WHITE, 0.12)
  const text = readableOn(
    accent,
    [s.canvas, s.surface, s.surface2, tint(s.canvas, accent), tint(s.surface, accent), tint(s.surface2, accent)],
    4.6,
    theme === 'light' ? '#000000' : WHITE,
  )
  const rail = readableOn(accent, [s.side], 3, WHITE)
  // The weakest of the three pages the brand is a fill on: if it nearly vanishes on any of them it needs the edge.
  const edge = Math.min(contrast(accent, s.canvas), contrast(accent, s.surface), contrast(accent, s.surface2)) < 1.5
  return { accent, ink, deep, text, rail, edge }
}

/**
 * A Content post card's fill (spec 2026-10-21 §3.1): the brand mixed 18 % into surface-2 in Dark, 10 % into the surface
 * in Light — less, in 2-point steps, while the card's text or its secondary text would read under 4.5:1 on it.
 */
export function cardFill(brand: string | null | undefined, theme: ThemeName): string {
  const accent = normalise(brand)
  const ground = theme === 'dark' ? CONTENT_SURFACES.dark.surface2 : CONTENT_SURFACES.light.surface
  for (let pct = theme === 'dark' ? 18 : 10; pct > 0; pct -= 2) {
    const card = mix(ground, accent, pct / 100)
    if (contrast(CARD_TEXT[theme].text, card) >= 4.5 && contrast(CARD_TEXT[theme].text2, card) >= 4.5) return card
  }
  return ground
}

export function triplet(hex: string): string {
  return rgb(hex).join(' ')
}

/** The accent's CSS variables, and the post card's fill where a workspace gives one (Content). */
export function accentStyle(t: AccentTokens, card?: string): Record<string, string> {
  return {
    '--a-accent': triplet(t.accent),
    '--a-accent-ink': triplet(t.ink),
    '--a-accent-deep': triplet(t.deep),
    '--a-accent-text': triplet(t.text),
    '--a-accent-rail': triplet(t.rail),
    ...(card ? { '--c-card': triplet(card) } : {}),
  }
}
