/**
 * HexaTech Staff's look: the previous Hotel Staff and Hotel Loyalty apps' gold on deep navy, with Cormorant Garamond
 * for editorial headings and Inter for every label, made a little deeper and quieter so the member and the gold lead.
 * One dark theme: the desk app is used under bright and dim lights alike, and the dark navy keeps the gold legible.
 */
export const C = {
  bg: '#080b10',
  bgRaised: '#12151b',
  surface: '#17191f',
  surface2: '#242831',
  surface3: '#343842',
  hairline: 'rgba(255,255,255,0.07)',
  hairlineStrong: 'rgba(255,255,255,0.12)',

  text: '#f6f2ea',
  text2: '#aab1be',
  text3: '#aab1be',

  gold: '#f3c582',
  goldLight: '#f5d5a5',
  goldDeep: '#b58b54',
  goldWash: 'rgba(243,197,130,0.12)',
  goldEdge: 'rgba(243,197,130,0.35)',
  onGold: '#1b1711',

  success: '#a2cdb3',
  successWash: 'rgba(61,220,132,0.12)',
  danger: '#efa9a2',
  dangerWash: 'rgba(255,77,109,0.12)',
  warning: '#f3c582',
  warningWash: 'rgba(255,207,74,0.12)',
  info: '#aac7e8',
  infoWash: 'rgba(90,168,255,0.12)',
  scrim: 'rgba(0,0,0,0.65)',
  white: '#ffffff',
  transparent: 'rgba(0,0,0,0)',
}

/** The gold of buttons and the active tab: light at the top, deep at the foot, as polished metal. */
export const GOLD_GRADIENT = ['#f5d5a5', '#f3c582', '#b58b54'] as const
/** The page's backdrop: a faint warm glow at the top fading into the navy. */
export const BACKDROP = ['#121521', '#0a0c14', '#07090f'] as const

export const RADIUS = { sm: 12, md: 16, lg: 22, xl: 28, pill: 999 }
export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 }

/** Bottom padding for a tab screen's scroll content: the tab bar and its raised Scan button need the room. */
export const TAB_BAR_ROOM = 128

/**
 * The widest the screens grow (iPad, a wide Android tablet): the app is one column of cards, centred, with the navy
 * beside it, rather than every card and row stretched across a tablet (on a desk tablet too: the member card keeps its card shape).
 */
export const CONTENT_MAX_WIDTH = 640

export const fonts = {
  display: { fontSize: 38, lineHeight: 44, fontWeight: '400' as const, letterSpacing: -0.6 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '400' as const },
  heading: { fontSize: 23, lineHeight: 29, fontWeight: '500' as const },
  italic: { fontSize: 17, lineHeight: 24 },
  figure: { fontSize: 38, lineHeight: 46, fontWeight: '400' as const },
  amount: { fontSize: 48, lineHeight: 60, fontWeight: '400' as const },
  body: { fontSize: 16, lineHeight: 23 },
  bodyStrong: { fontSize: 16, lineHeight: 23, fontWeight: '500' as const },
  small: { fontSize: 13, lineHeight: 18 },
  smallStrong: { fontSize: 13, lineHeight: 18, fontWeight: '500' as const },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '500' as const },
  button: { fontSize: 17, lineHeight: 23, fontWeight: '500' as const },
  number: { fontSize: 28, lineHeight: 34, fontVariant: ['tabular-nums' as const] },
  tab: { fontSize: 13, lineHeight: 18 },
}

export const SHADOW = {
  card: { shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
  glow: { shadowColor: '#c9a84c', shadowOpacity: 0.45, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 12 },
}

/** Approved Eclipse materials, shared by Home and every operational screen. */
export const ECLIPSE = {
  bg: '#080b10', surface: '#17191f', text: '#f6f2ea', muted: '#aab1be', accent: '#f3c582', ink: '#1b1711',
  edge: 'rgba(224,234,255,0.85)', quietEdge: 'rgba(212,226,250,0.45)',
  rim: ['#687280', '#343842', '#232831', '#72604a'] as const,
  scan: ['rgba(105,119,143,0.84)', 'rgba(48,52,63,0.98)', '#151820', '#25211d', 'rgba(147,104,62,0.84)'] as const,
  scanStops: [0, 0.2, 0.52, 0.83, 1] as const,
  tile: ['rgba(63,65,73,0.88)', 'rgba(32,35,44,0.94)', '#11151c', 'rgba(48,39,30,0.9)'] as const,
  attention: ['rgba(181,139,84,0.8)', 'rgba(75,59,42,0.9)', '#222026', 'rgba(51,41,31,0.9)'] as const,
  tileStops: [0, 0.32, 0.7, 1] as const,
  dock: ['rgba(59,61,69,0.8)', 'rgba(29,30,37,0.9)', 'rgba(12,16,22,0.96)'] as const,
  // Still smoked-glass faces, with a fine travelling light confined to the rim.
  borderLight: { width: 1.1, halo: '#efbc77', core: '#fff4d8' },
  wallpaper: { scrim: ['rgba(8,11,16,0.18)', 'rgba(8,11,16,0.04)', 'rgba(8,11,16,0.16)'] as const },
  mirror: {
    edge: ['rgba(229,240,255,0)', 'rgba(242,248,255,0.70)', 'rgba(229,240,255,0)'] as const,
    scanShadow: '0 9px 28px -14px rgba(243,197,130,0.32)',
    dockShadow: '0 10px 28px rgba(0,0,0,0.32)',
  },
  motion: { borderCycle: 10000, dockTravel: 320, touchIn: 130, touchOut: 240 },
  inset: 24, gap: 16, scanRadius: 44, tileRadius: 26, dockRadius: 32, dockHeight: 64,
  // Use Android's system face; SF Pro belongs to the iPhone design, not the Android bundle.
  type: {
    brand: { fontSize: 22, lineHeight: 29, fontWeight: '600' as const },
    wordmark: { fontSize: 10, lineHeight: 18, letterSpacing: 4 },
    welcome: { fontSize: 38, lineHeight: 44, fontWeight: '400' as const },
    secondary: { fontSize: 13, lineHeight: 18 },
    action: { fontSize: 20, lineHeight: 26 },
    tile: { fontSize: 17, lineHeight: 22 },
    badge: { fontSize: 13, lineHeight: 18, fontWeight: '600' as const },
  },
}

/** A tier's colour as the venue set it, or the gold when it has none or an unreadable one. */
export function tierColor(color: string | null | undefined): string {
  return color && /^#[0-9a-f]{6}$/i.test(color) ? color : C.gold
}

/** `#rrggbb` with an alpha (0–1), for washes of a tier's own colour. */
export function withAlpha(hex: string, alpha: number): string {
  const clean = /^#[0-9a-f]{6}$/i.test(hex) ? hex : C.gold
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255).toString(16).padStart(2, '0')
  return `${clean}${a}`
}

/** Near-black or white text for a background colour, by its relative luminance (WCAG). */
export function readableOn(hex: string): string {
  const clean = /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : 'c9a84c'
  const channel = (i: number) => {
    const v = parseInt(clean.slice(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  }
  const luminance = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4)
  return luminance > 0.45 ? '#14110a' : '#ffffff'
}
