/**
 * HexaTech Loyalty's look: deep navy and soft light, with each venue's own accent and heading face (owner,
 * 2026-10-31: "each venue's colours"). The navy, the text and the states are fixed; the accent and the display face
 * are the venue's, from the portal's bootstrap (`venue.accent`, already contrast-checked on the server for a dark
 * page, and `venue.display_face`), with the gold and Cormorant Garamond as the default before a venue is known.
 *
 * The accent fields of `C`, `fonts` and `accentGradient()` read the current look when they are read, so they belong
 * in inline styles, never in `StyleSheet.create` (which reads once, at import). The root layout redraws the screens
 * when the look changes (`useLook`'s `version`).
 */
import { create } from 'zustand'

export interface VenueLook {
  /** The accent on the dark page, its ink (text on the accent) and its deeper shade. */
  accent: string
  ink: string
  deep: string
  /** The portal's display face key (playfair, cormorant, fraunces, newsreader, space, manrope). */
  face: string
}

export const DEFAULT_LOOK: VenueLook = { accent: '#c9a84c', ink: '#1a1406', deep: '#9c7c2c', face: 'cormorant' }

/** Each display face's loaded font family (`_layout.tsx` loads them all). */
export const DISPLAY_FAMILIES: Record<string, { regular: string; italic: string }> = {
  cormorant: { regular: 'CormorantGaramond_600SemiBold', italic: 'CormorantGaramond_500Medium_Italic' },
  playfair: { regular: 'PlayfairDisplay_600SemiBold', italic: 'PlayfairDisplay_500Medium_Italic' },
  fraunces: { regular: 'Fraunces_600SemiBold', italic: 'Fraunces_500Medium_Italic' },
  newsreader: { regular: 'Newsreader_600SemiBold', italic: 'Newsreader_500Medium_Italic' },
  space: { regular: 'SpaceGrotesk_600SemiBold', italic: 'SpaceGrotesk_500Medium' },
  manrope: { regular: 'Manrope_700Bold', italic: 'Manrope_500Medium' },
}

const HEX = /^#[0-9a-f]{6}$/i

/** The venue's look from the bootstrap's `venue`, falling back field by field to the default. */
export function lookFrom(venue: { accent?: { dark_hex?: string | null; dark_ink?: string | null; dark_deep?: string | null } | null; display_face?: string | null } | null | undefined): VenueLook {
  const accent = venue?.accent
  const pick = (value: string | null | undefined, fallback: string) => (value && HEX.test(value) ? value : fallback)
  return {
    accent: pick(accent?.dark_hex, DEFAULT_LOOK.accent),
    ink: pick(accent?.dark_ink, DEFAULT_LOOK.ink),
    deep: pick(accent?.dark_deep, DEFAULT_LOOK.deep),
    face: venue?.display_face && DISPLAY_FAMILIES[venue.display_face] ? venue.display_face : DEFAULT_LOOK.face,
  }
}

interface LookState {
  look: VenueLook
  /** Bumped on every change; the root layout keys the screens on it so every inline style is read again. */
  version: number
  setLook: (look: VenueLook) => void
}

export const useLook = create<LookState>(set => ({
  look: DEFAULT_LOOK,
  version: 0,
  setLook: look => set(state => (sameLook(state.look, look) ? state : { look, version: state.version + 1 })),
}))

function sameLook(a: VenueLook, b: VenueLook): boolean {
  return a.accent === b.accent && a.ink === b.ink && a.deep === b.deep && a.face === b.face
}

const now = () => useLook.getState().look

/** `#rrggbb` with an alpha (0–1). */
export function withAlpha(hex: string, alpha: number): string {
  const clean = HEX.test(hex) ? hex : now().accent
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255).toString(16).padStart(2, '0')
  return `${clean}${a}`
}

/** A colour mixed towards white (amount 0–1), for the accent's lighter tone. */
function lighten(hex: string, amount: number): string {
  const clean = HEX.test(hex) ? hex.slice(1) : 'c9a84c'
  const mix = (i: number) => {
    const v = parseInt(clean.slice(i, i + 2), 16)
    return Math.round(v + (255 - v) * amount).toString(16).padStart(2, '0')
  }
  return `#${mix(0)}${mix(2)}${mix(4)}`
}

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

  // The venue's accent (named gold after the default, so the shared components read as before).
  get gold() { return now().accent },
  get goldLight() { return lighten(now().accent, 0.35) },
  get goldDeep() { return now().deep },
  get goldWash() { return withAlpha(now().accent, 0.12) },
  get goldEdge() { return withAlpha(now().accent, 0.35) },
  get onGold() { return now().ink },

  success: '#3ddc84',
  successWash: 'rgba(61,220,132,0.12)',
  danger: '#ff4d6d',
  dangerWash: 'rgba(255,77,109,0.12)',
  warning: '#ffcf4a',
  warningWash: 'rgba(255,207,74,0.12)',
  info: '#5aa8ff',
  infoWash: 'rgba(90,168,255,0.12)',
}

/** The accent of buttons and the card: light at the top, deep at the foot. */
export function accentGradient(): readonly [string, string, string] {
  const { accent, deep } = now()
  return [lighten(accent, 0.3), accent, deep] as const
}

/** The page's backdrop: a faint glow at the top fading into the navy. */
export const BACKDROP = ['#121521', '#0a0c14', '#07090f'] as const

export const RADIUS = { sm: 12, md: 16, lg: 22, xl: 28, pill: 999 }
export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 }

/** Bottom padding for a tab screen's scroll content: the tab bar and its raised Card button need the room. */
export const TAB_BAR_ROOM = 128

/**
 * The widest the screens grow (iPad, a wide Android tablet): the app is one column of cards, centred, with the navy
 * beside it, rather than every card and row stretched across a tablet (a member reads one column of cards).
 */
export const CONTENT_MAX_WIDTH = 640

const display = () => DISPLAY_FAMILIES[now().face] ?? DISPLAY_FAMILIES.cormorant

export const fonts = {
  get display() { return { fontFamily: display().regular, fontSize: 34, lineHeight: 40, letterSpacing: -0.3 } },
  get title() { return { fontFamily: display().regular, fontSize: 26, lineHeight: 31 } },
  get heading() { return { fontFamily: display().regular, fontSize: 21, lineHeight: 26 } },
  get italic() { return { fontFamily: display().italic, fontSize: 17, lineHeight: 22 } },
  get figure() { return { fontFamily: display().regular, fontSize: 40, lineHeight: 46 } },
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
  get glow() { return { shadowColor: now().accent, shadowOpacity: 0.4, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 12 } },
}

/** A tier's colour as the venue set it, or the accent when it has none or an unreadable one. */
export function tierColor(color: string | null | undefined): string {
  return color && HEX.test(color) ? color : now().accent
}

/** Near-black or white text for a background colour, by its relative luminance (WCAG). */
export function readableOn(hex: string): string {
  const clean = HEX.test(hex) ? hex.slice(1) : 'c9a84c'
  const channel = (i: number) => {
    const v = parseInt(clean.slice(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  }
  const luminance = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4)
  return luminance > 0.45 ? '#14110a' : '#ffffff'
}
