// Type-only import is enough: SHIFTED_HUES is only used in `typeof` (verbatimModuleSyntax is on).
import type { SHIFTED_HUES, StatusToken, SurfaceToken } from './glassTokens'

/**
 * Every value that makes the admin look like Clean light (spec
 * 2026-10-09-admin-clean-light-design.md §3). The Tailwind plugin writes them
 * into the stylesheet (lightVariables.ts), the theme code reads the brand
 * rule (light.ts), and lightContrast.test.ts measures them.
 *
 * Clean light applies only inside the signed-in admin: <html> carries
 * data-style="light" from the theme code and data-shell="admin" while the
 * admin Layout is mounted.
 */
export const LIGHT_SCOPE = ':root[data-style="light"][data-shell="admin"]'

/** Paper: the page behind cards, inputs and wells. */
export const LIGHT_CANVAS = '#F4F6F8'

/** The ink: body text, and what Tailwind's `white` means inside the style. */
export const LIGHT_INK = '#1B2A34'

/** Surface tokens in Clean light. All opaque. */
export const LIGHT_SURFACES: Record<SurfaceToken, string> = {
  'dark-bg': '#F4F6F8',
  'dark-surface': '#FFFFFF',
  'dark-surface2': '#F7F9FB',
  'dark-card': '#F7F9FB',
  'dark-surface3': '#EEF2F5',
  'dark-hover': '#EEF2F5',
  'dark-surface4': '#E6EBEF',
  'dark-border': '#DDE3E8',
  'dark-border2': '#CBD3DA',
  panel: '#FFFFFF',
  'panel-dim': '#F7F9FB',
  'panel-raised': '#EEF2F5',
  well: '#F4F6F8',
}

/** Text tokens, strongest first. */
export const LIGHT_TEXT = {
  primary: '#1B2A34',
  soft: '#3A4853',
  secondary: '#54626E',
  muted: '#54626E',
} as const

/**
 * Grey text classes (text-gray-*, text-slate-*, placeholders) keep their
 * order: on dark the lightest grey was the most prominent, here the darkest.
 * 100, 200, 700 and 800 were plain Tailwind colours before this style.
 */
export const LIGHT_GREY_SHADES = [100, 200, 300, 400, 500, 600, 700, 800] as const
export const LIGHT_GREY_TEXT: Record<(typeof LIGHT_GREY_SHADES)[number], string> = {
  100: '#1B2A34',
  200: '#1B2A34',
  300: '#2E3C47',
  400: '#3D4B56',
  500: '#4A5863',
  600: '#54626E',
  700: '#54626E',
  800: '#54626E',
}

/**
 * Coloured text (text-red-400, text-amber-300 …) in Clean light: the hue's
 * 700 shade, or 800 where 700 falls under 4.5:1 on its own tint (measured
 * 2026-10-09: orange 4.58, amber 4.46, yellow 4.37, lime 4.44, green 4.46).
 */
export const LIGHT_TEXT_SHADE: Record<(typeof SHIFTED_HUES)[number], 700 | 800> = {
  red: 700, orange: 800, amber: 800, yellow: 800, lime: 800, green: 800, emerald: 700, teal: 700, cyan: 700,
  sky: 700, blue: 700, indigo: 700, violet: 700, purple: 700, fuchsia: 700, pink: 700, rose: 700,
}

/** Status colours as text (fills keep the palette's colours). */
export const LIGHT_STATUS_TEXT: Record<StatusToken, string> = {
  accent: '#17643B',
  success: '#17643B',
  warning: '#8A4B00',
  error: '#A3243B',
  danger: '#A3243B',
  info: '#1D4FA8',
  notice: '#1D4FA8',
}

/**
 * The sidebar's section accents (Tailwind 400 shades, inline in Layout.tsx)
 * as text on the light sidebar: each hue's 800 shade (700 fell to 4.1-4.6:1
 * on the active item's wash for amber, emerald, cyan, pink and sky).
 */
export const LIGHT_NAV_ACCENT_TEXT: Record<string, string> = {
  '#60a5fa': '#1e40af', // blue
  '#a78bfa': '#5b21b6', // violet
  '#38bdf8': '#075985', // sky
  '#fbbf24': '#92400e', // amber
  '#34d399': '#065f46', // emerald
  '#f472b6': '#9d174d', // pink
  '#22d3ee': '#155e75', // cyan
  '#9ca3af': '#1f2937', // gray
}

/** Tailwind's corner scale in Clean light (cards 14 px, controls 10 px). */
export const LIGHT_RADIUS = { md: '6px', lg: '10px', xl: '14px', '2xl': '14px', '3xl': '18px' } as const
export const LIGHT_THEME_RADIUS = { tight: '6px', base: '10px', card: '14px' } as const

/** Faces: Geist for headings, Inter for text, Geist Mono for figures; all self-hosted. */
export const LIGHT_FONTS = {
  body: "'HX Inter', 'Inter', system-ui, sans-serif",
  display: "'HX Geist', 'HX Inter', 'Inter', system-ui, sans-serif",
  data: "'HX Geist Mono', ui-monospace, Menlo, Consolas, monospace",
} as const

/** Brand text is deepened until it reads this ratio on a 10 % brand tint over the canvas. */
export const DEEPEN_TARGET = 4.8
export const DEEPEN_TINT_ALPHA = 0.1
