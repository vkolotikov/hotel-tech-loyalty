/**
 * HexaTech Staff's look: the previous Hotel Staff and Hotel Loyalty apps' gold on deep navy, with Cormorant Garamond
 * for editorial headings and Inter for every label, made a little deeper and quieter so the member and the gold lead.
 * One dark theme: the desk app is used under bright and dim lights alike, and the dark navy keeps the gold legible.
 */
export const C = {
  bg: '#07090f',
  bgRaised: '#0b0e16',
  surface: '#10141d',
  surface2: '#171c28',
  surface3: '#202636',
  hairline: 'rgba(255,255,255,0.07)',
  hairlineStrong: 'rgba(255,255,255,0.12)',

  text: '#f7f4ee',
  text2: '#a5abb8',
  text3: '#6c7282',

  gold: '#c9a84c',
  goldLight: '#e8cf86',
  goldDeep: '#9c7c2c',
  goldWash: 'rgba(201,168,76,0.12)',
  goldEdge: 'rgba(201,168,76,0.35)',
  onGold: '#1a1406',

  success: '#3ddc84',
  successWash: 'rgba(61,220,132,0.12)',
  danger: '#ff4d6d',
  dangerWash: 'rgba(255,77,109,0.12)',
  warning: '#ffcf4a',
  warningWash: 'rgba(255,207,74,0.12)',
  info: '#5aa8ff',
  infoWash: 'rgba(90,168,255,0.12)',
}

/** The gold of buttons and the active tab: light at the top, deep at the foot, as polished metal. */
export const GOLD_GRADIENT = ['#efd892', '#c9a84c', '#a88a35'] as const
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
  display: { fontFamily: 'CormorantGaramond_600SemiBold', fontSize: 34, lineHeight: 38, letterSpacing: -0.3 },
  title: { fontFamily: 'CormorantGaramond_600SemiBold', fontSize: 26, lineHeight: 30 },
  heading: { fontFamily: 'CormorantGaramond_600SemiBold', fontSize: 21, lineHeight: 26 },
  italic: { fontFamily: 'CormorantGaramond_500Medium_Italic', fontSize: 17, lineHeight: 22 },
  figure: { fontFamily: 'CormorantGaramond_700Bold', fontSize: 40, lineHeight: 44 },
  body: { fontFamily: 'Inter_400Regular', fontSize: 15, lineHeight: 21 },
  bodyStrong: { fontFamily: 'Inter_600SemiBold', fontSize: 15, lineHeight: 21 },
  small: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 18 },
  smallStrong: { fontFamily: 'Inter_600SemiBold', fontSize: 13, lineHeight: 18 },
  label: { fontFamily: 'Inter_600SemiBold', fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase' as const },
  button: { fontFamily: 'Inter_700Bold', fontSize: 15, letterSpacing: 0.2 },
  number: { fontFamily: 'Inter_700Bold', fontSize: 22, lineHeight: 26, fontVariant: ['tabular-nums' as const] },
  tab: { fontFamily: 'Inter_600SemiBold', fontSize: 10.5, letterSpacing: 0.2 },
}

export const SHADOW = {
  card: { shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
  glow: { shadowColor: '#c9a84c', shadowOpacity: 0.45, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 12 },
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
