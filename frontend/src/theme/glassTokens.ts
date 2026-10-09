/**
 * Every value that makes the admin look like Glass, in one place. The
 * Tailwind plugin writes them into the stylesheet (glassVariables.ts), the
 * theme code reads the brand-colour rules (glass.ts), and the contrast test
 * measures them. Change a value here and all three follow.
 *
 * Glass applies only inside the signed-in admin: <html> carries
 * data-style="glass" from the theme code and data-shell="admin" while the
 * admin Layout is mounted. The login page, member portal and Appointments
 * workspace share <html> and never match this selector.
 */
export const GLASS_SCOPE = ':root[data-style="glass"][data-shell="admin"]'

/**
 * The backdrop's ink, the lightest stop of its gradient in glass.css
 * (#0B1120 → #0D1426 → #0A0F1C). Contrast is measured over it, so every
 * other part of the backdrop is at least as dark. glassCss.test.ts holds
 * the stylesheet to that.
 */
export const GLASS_INK = '#0D1426'

/**
 * Admin surface tokens in Glass, as colour plus opacity. The Tailwind
 * classes keep their names (bg-dark-surface, border-dark-border, …); only
 * the values change. panel, panel-dim, panel-raised and well are the greys
 * screens used to hard-code (#1e1e1e, #1a1a1a, #333, #111); Classic keeps
 * those exact values.
 */
export const GLASS_SURFACES = {
  'dark-bg': { rgb: '5 8 15', alpha: 0.55 },
  'dark-surface': { rgb: '255 255 255', alpha: 0.07 },
  'dark-surface2': { rgb: '255 255 255', alpha: 0.1 },
  'dark-card': { rgb: '255 255 255', alpha: 0.1 },
  'dark-surface3': { rgb: '255 255 255', alpha: 0.14 },
  'dark-hover': { rgb: '255 255 255', alpha: 0.14 },
  'dark-surface4': { rgb: '255 255 255', alpha: 0.18 },
  'dark-border': { rgb: '255 255 255', alpha: 0.14 },
  'dark-border2': { rgb: '255 255 255', alpha: 0.22 },
  panel: { rgb: '255 255 255', alpha: 0.1 },
  'panel-dim': { rgb: '255 255 255', alpha: 0.07 },
  'panel-raised': { rgb: '255 255 255', alpha: 0.18 },
  well: { rgb: '5 8 15', alpha: 0.55 },
} as const

export type SurfaceToken = keyof typeof GLASS_SURFACES

/** Opaque stand-ins for reduced transparency and browsers without blur. */
export const GLASS_SOLID_SURFACES: Record<SurfaceToken, string> = {
  'dark-bg': '#0B1120',
  'dark-surface': '#1A2233',
  'dark-surface2': '#20293C',
  'dark-card': '#20293C',
  'dark-surface3': '#283247',
  'dark-hover': '#283247',
  'dark-surface4': '#303B52',
  'dark-border': '#333F57',
  'dark-border2': '#404D68',
  panel: '#20293C',
  'panel-dim': '#1A2233',
  'panel-raised': '#303B52',
  well: '#0B1120',
}

/** The faintest panel text sits on: white at 7 % (dark-surface). */
export const GLASS_PANEL_ALPHA = GLASS_SURFACES['dark-surface'].alpha

/** The brightest surface text sits on: white at 18 % (dark-surface4). */
export const GLASS_RAISED_ALPHA = GLASS_SURFACES['dark-surface4'].alpha

/**
 * Text tokens, lightest first: t-primary, t-soft (the old hard-coded
 * #a0a0a0), t-secondary, t-muted (the old #636366).
 */
export const GLASS_TEXT = {
  primary: '#F3F6FB',
  soft: '#D3DAE5',
  secondary: '#C3CCD9',
  muted: '#C3CCD9',
} as const

/**
 * Status colours as text. Fills keep the palette's colours (and the fixed
 * success / danger / notice values); only text uses read these.
 */
export const GLASS_STATUS_TEXT = {
  accent: '#8EF0B6',
  success: '#8EF0B6',
  warning: '#FCD58E',
  error: '#FFC9D3',
  danger: '#FFC9D3',
  info: '#C3DEFF',
  notice: '#C3DEFF',
} as const

export type StatusToken = keyof typeof GLASS_STATUS_TEXT

/** Hard-coded grey text keeps its order but every step passes on glass. */
export const GREY_HUES = ['gray', 'slate'] as const
export const GREY_TEXT_SHADES = [300, 400, 500, 600] as const
export const GLASS_GREY_TEXT = {
  300: '#E2E8F0',
  400: '#D3DAE5',
  500: '#C8D0DD',
  600: '#C3CCD9',
} as const

/** Coloured text (text-red-400, text-emerald-300 …) shows lighter in Glass. */
export const SHIFTED_HUES = [
  'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan',
  'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose',
] as const
export const COLOURED_TEXT_SHADES = [100, 200, 300, 400, 500] as const
export const GLASS_TEXT_SHIFT = {
  100: 50,
  200: 100,
  300: 200,
  400: 300,
  500: 300,
} as const satisfies Record<(typeof COLOURED_TEXT_SHADES)[number], 50 | 100 | 200 | 300>

/**
 * The sidebar draws its active item in the group's accent, a Tailwind 400
 * shade set inline (Layout.tsx), on a 16 % wash of that accent. In Glass that
 * text shows one shade lighter, like all coloured text: the 300 shade
 * (measured at 3.4–5.0:1 as 400s over the brightest glow, 5.0–6.1:1 as 300s).
 */
export const GLASS_NAV_ACCENT_TEXT: Record<string, string> = {
  '#60a5fa': '#93c5fd', // blue
  '#a78bfa': '#c4b5fd', // violet
  '#38bdf8': '#7dd3fc', // sky
  '#fbbf24': '#fcd34d', // amber
  '#34d399': '#6ee7b7', // emerald
  '#f472b6': '#f9a8d4', // pink
  '#22d3ee': '#67e8f9', // cyan
  '#9ca3af': '#d1d5db', // gray
}

/** Tailwind's corner scale in Glass. rounded-sm and rounded-full stay. */
export const GLASS_RADIUS = {
  md: '8px',
  lg: '12px',
  xl: '16px',
  '2xl': '20px',
  '3xl': '24px',
} as const

/** The mood radius variables (--theme-radius-*) that 34 screens read. */
export const GLASS_THEME_RADIUS = {
  tight: '8px',
  base: '12px',
  card: '20px',
} as const

/** Glass's faces: self-hosted in glass.css under Glass-only names. */
export const GLASS_FONTS = {
  body: "'HX Inter', 'Inter', system-ui, sans-serif",
  display: "'HX Space Grotesk', 'HX Inter', 'Inter', sans-serif",
} as const

/** The three backdrop glows: the brand colour and two companions. */
export const GLOWS = [
  { rotate: 0, alpha: 0.18 },
  { rotate: 40, alpha: 0.16 },
  { rotate: -60, alpha: 0.14 },
] as const

/** Glow colours are darkened to at most this luminance (near-white brands). */
export const GLOW_MAX_LUMINANCE = 0.25

/** Brand text is lifted until it reaches this ratio on a brand tint. */
export const LIFT_TARGET = 4.6
export const LIFT_TINT_ALPHA = 0.15

/**
 * Brand text is lifted against a brand tint over this panel: the 10 % card
 * (dark-surface2 / dark-card), the brightest panel brand text commonly sits
 * on. Measured on the 7 % panel instead, shade 500 fell to 4.25:1 on a card.
 */
export const LIFT_PANEL_ALPHA = GLASS_SURFACES['dark-surface2'].alpha

/**
 * Dark text for light brand fills. Its luminance is under 0.00185, which
 * guarantees that ink or white reaches 4.5:1 on ANY fill: ink passes from
 * fill luminance 0.175 + 4.5 × 0.00185 ≈ 0.1833 up, white below 0.1833.
 * A lighter ink leaves a band of mid colours (the Services indigo #4c6ef5)
 * where neither passes.
 */
export const ON_PRIMARY_INK = '#03050A'
