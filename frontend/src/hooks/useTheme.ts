import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { api } from '../lib/api'
import { SHADES, hexToRgb, isHex, shadeScale, toTriplet } from '../theme/colour'
import { brandGlassVariables } from '../theme/glass'
import { brandLightVariables, isPaleBrand } from '../theme/light'
import { effectiveStyle } from '../lib/stylePreview'

interface ThemeColors {
  primary_color: string
  secondary_color: string
  accent_color: string
  background_color: string
  surface_color: string
  text_color: string
  text_secondary_color: string
  border_color: string
  error_color: string
  warning_color: string
  info_color: string
  logo_url: string
  dark_mode_enabled: string
  // Persisted via hotel_settings.theme_mood. Drives the per-mood CSS
  // variable cascade in index.css (body font, heading font, corner
  // radius scale). Empty / missing = neutral default (Inter, standard
  // radii).
  theme_mood?: string
  // Persisted via hotel_settings.theme_style: 'glass' or 'classic'.
  // Missing means Glass, the admin's default style since 2026-10.
  theme_style?: string
}

const DEFAULTS: ThemeColors = {
  primary_color: '#3b82f6',
  secondary_color: '#1e1e1e',
  accent_color: '#32d74b',
  background_color: '#0d0d0d',
  surface_color: '#161616',
  text_color: '#ffffff',
  text_secondary_color: '#8e8e93',
  border_color: '#2c2c2c',
  error_color: '#ff375f',
  warning_color: '#ffd60a',
  info_color: '#0a84ff',
  logo_url: '',
  dark_mode_enabled: 'true',
}

const PALETTE_KEYS = [
  'primary_color', 'secondary_color', 'accent_color', 'background_color', 'surface_color', 'text_color',
  'text_secondary_color', 'border_color', 'error_color', 'warning_color', 'info_color',
] as const

/** The admin styles. Clean light joins in part 2. */
export const THEME_STYLES = ['glass', 'classic', 'light'] as const
export type ThemeStyle = (typeof THEME_STYLES)[number]
export const DEFAULT_STYLE: ThemeStyle = 'glass'

/** Only an explicit 'classic' is Classic; anything else (missing, empty, unknown) is Glass. */
export function readThemeStyle(raw: unknown): ThemeStyle {
  return raw === 'classic' || raw === 'light' ? raw : DEFAULT_STYLE
}

/** What applyThemeToDom paints: <html> and <body>, or a stand-in in tests. */
export interface ThemeTarget {
  root: {
    style: { setProperty(name: string, value: string): void }
    setAttribute(name: string, value: string): void
    removeAttribute(name: string): void
    getAttribute(name: string): string | null
  }
  body: { style: { backgroundColor: string; color: string } }
}

const pageTarget = (): ThemeTarget => ({ root: document.documentElement, body: document.body })

/** The palette over the defaults. A blank or malformed colour keeps its default. */
export function paletteWithDefaults(colors: Partial<ThemeColors>): ThemeColors {
  const merged: ThemeColors = { ...DEFAULTS, ...colors }
  for (const key of PALETTE_KEYS) {
    if (!isHex(merged[key])) merged[key] = DEFAULTS[key]
  }
  return merged
}

const rgb = (hex: string) => toTriplet(hexToRgb(hex))

function surfaceShade(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `${Math.min(255, r + amount)} ${Math.min(255, g + amount)} ${Math.min(255, b + amount)}`
}

/**
 * Apply a colour palette to the DOM's CSS variables immediately —
 * no React state, no query roundtrip, no flicker. Used by both the
 * useTheme hook (after server fetch) and Settings → Theme presets
 * (the moment the staff clicks a preset, before the network save
 * round-trips). Same logic in both places, so a preset's instant
 * preview matches the eventual saved state exactly.
 *
 * The optional `mood` argument writes a `data-mood` attribute on the
 * <html> element so CSS rules in index.css can fork the body + heading
 * fonts and corner-radius scale per mood. Without this, picking a
 * preset only swapped 11 hex values and the admin's typography +
 * geometry stayed identical regardless of preset. Customer feedback
 * 2026-06-13: "cards are different, but after selection, admin do not
 * change style, only colour". Empty/null mood removes the attribute so
 * the default (Inter, neutral corners) renders.
 *
 * The optional `style` writes `data-style` ('glass' | 'classic' | 'light'), or this device's preview when a platform admin has one on (lib/stylePreview.ts); left
 * out, the current style stays. The palette variables are written in
 * every style, plus the Glass extras (lifted brand text, glow colours,
 * text on brand fills). Glass's own values live in the stylesheet, scoped
 * to the signed-in admin (theme/glassTokens.ts), and are read before the
 * palette by the Tailwind tokens, so no variable is ever removed and the
 * pages outside the admin keep the palette exactly as before.
 */
export function applyThemeToDom(
  colors: Partial<ThemeColors>,
  mood?: string | null,
  style?: ThemeStyle,
  target: ThemeTarget = pageTarget(),
): void {
  const merged = paletteWithDefaults(colors)
  const { root, body } = target
  const set = (name: string, value: string) => root.style.setProperty(name, value)

  const shades = shadeScale(merged.primary_color)
  for (const shade of SHADES) set(`--color-primary-${shade}`, shades[shade])

  set('--color-dark-bg',       rgb(merged.background_color))
  set('--color-dark-surface',  rgb(merged.surface_color))
  set('--color-dark-surface2', surfaceShade(merged.surface_color, 8))
  set('--color-dark-surface3', surfaceShade(merged.surface_color, 16))
  set('--color-dark-surface4', surfaceShade(merged.surface_color, 24))
  // dark-card and dark-hover back 29 class names across the chatbot,
  // analytics and canned-reply screens, but nothing ever assigned them, so
  // they stayed on the neutral Tailwind fallback while every surface around
  // them followed the brand. On a navy or gold tenant those cards rendered
  // flat grey and read as a second, foreign design language. Their defaults
  // match surface2/surface3 exactly, which is the relationship they were
  // built to have, so derive them the same way.
  set('--color-dark-card',     surfaceShade(merged.surface_color, 8))
  set('--color-dark-hover',    surfaceShade(merged.surface_color, 16))
  set('--color-dark-border',   rgb(merged.border_color))
  set('--color-dark-border2',  surfaceShade(merged.border_color, 12))

  set('--color-text-primary',   rgb(merged.text_color))
  set('--color-text-secondary', rgb(merged.text_secondary_color))

  set('--color-accent',  rgb(merged.accent_color))
  set('--color-error',   rgb(merged.error_color))
  set('--color-warning', rgb(merged.warning_color))
  set('--color-info',    rgb(merged.info_color))

  for (const [name, value] of Object.entries(brandGlassVariables(merged.primary_color))) set(name, value)
  for (const [name, value] of Object.entries(brandLightVariables(merged.primary_color))) set(name, value)
  // A brand too close to white vanishes on paper; Clean light outlines its solid fills (light.css).
  if (isPaleBrand(merged.primary_color)) root.setAttribute('data-brand-pale', '')
  else root.removeAttribute('data-brand-pale')

  body.style.backgroundColor = merged.background_color
  body.style.color = merged.text_color

  // Mood propagation. CSS in index.css reads :root[data-mood="X"] and
  // forks --theme-font-body / --theme-font-display / --theme-radius-*
  // so EVERY surface in the admin (sidebars, tables, cards, buttons,
  // headings, etc.) shifts to the picked mood's vocabulary on next
  // paint. Without this the admin only changes color. Glass ignores the
  // mood: index.css excludes its mood rules from the Glass admin.
  if (mood && typeof mood === 'string') {
    root.setAttribute('data-mood', mood)
  } else if (mood === null) {
    root.removeAttribute('data-mood')
  }

  root.setAttribute('data-style', effectiveStyle(style ?? readThemeStyle(root.getAttribute('data-style'))))
}

export type { ThemeColors }

/**
 * Cache key for the last-known-good theme snapshot in localStorage.
 *
 * Why: without this, every page reload paints the default palette for
 * the first ~200 ms while the /v1/theme query resolves -- the user sees
 * their carefully-picked Royal Blue / Emerald / etc. flash to default
 * and back. On a slow connection (or briefly offline), the API call
 * may not resolve at all, leaving the admin stuck on defaults and
 * making the user think "my theme didn't save". With the snapshot we
 * apply the last-known palette synchronously before React even mounts.
 */
const THEME_CACHE_KEY = 'loyalty-admin-theme-v1'
const PRESET_CACHE_KEY = 'loyalty-admin-theme-preset-v1'

export interface CachedTheme {
  colors: Partial<ThemeColors>
  preset?: string | null
  mood?: string | null
  // Missing in snapshots written before the styles shipped: read as Glass.
  style?: ThemeStyle | null
  savedAt: number
}

/**
 * Read the cached theme synchronously. Returns null on any parse error
 * or when the cache is missing.
 */
export function readCachedTheme(): CachedTheme | null {
  try {
    const raw = localStorage.getItem(THEME_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedTheme
    if (!parsed?.colors || typeof parsed.colors !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

/**
 * Persist the current theme + active preset name to localStorage so the
 * next page load can paint it instantly. Best-effort -- private mode /
 * quota exceeded just skip silently. A null `style` keeps the cached
 * one, so a preset change never resets the style.
 */
export function persistThemeSnapshot(
  colors: Partial<ThemeColors>,
  preset: string | null = null,
  mood: string | null = null,
  style: ThemeStyle | null = null,
): void {
  try {
    const keptStyle = style ?? readCachedTheme()?.style ?? null
    const payload: CachedTheme = { colors, preset, mood, style: keptStyle, savedAt: Date.now() }
    localStorage.setItem(THEME_CACHE_KEY, JSON.stringify(payload))
    if (preset) localStorage.setItem(PRESET_CACHE_KEY, preset)
  } catch {
    /* quota / privacy mode */
  }
}

/**
 * Read just the cached preset name. Used by the Settings page to keep
 * the "X active" chip lit while the server fetch is in flight, so the
 * user always sees confirmation that their picked preset is sticky.
 */
export function readCachedPreset(): string | null {
  try {
    return localStorage.getItem(PRESET_CACHE_KEY)
  } catch {
    return null
  }
}

/** The theme query's placeholder: the cached palette, mood and style. */
export function placeholderFromSnapshot(snap: CachedTheme | null): ThemeColors | undefined {
  if (!snap?.colors) return undefined
  return {
    ...DEFAULTS,
    ...snap.colors,
    ...(snap.mood ? { theme_mood: snap.mood } : {}),
    theme_style: readThemeStyle(snap.style),
  }
}

/**
 * Paint before React mounts: the cached theme, or with no cache just the
 * default style, so the first frame of the admin is already Glass.
 */
export function paintCachedTheme(snap: CachedTheme | null, target: ThemeTarget = pageTarget()): void {
  if (snap?.colors) {
    applyThemeToDom(snap.colors, snap.mood ?? null, readThemeStyle(snap.style), target)
  } else {
    target.root.setAttribute('data-style', effectiveStyle(DEFAULT_STYLE))
  }
}

/** A server answer with a style but no palette: switch the style only. */
export function applyStyleOnly(style: ThemeStyle, target: ThemeTarget = pageTarget()): void {
  target.root.setAttribute('data-style', effectiveStyle(style))
  const snap = readCachedTheme()
  persistThemeSnapshot(snap?.colors ?? {}, snap?.preset ?? null, snap?.mood ?? null, style)
}

/**
 * What a theme answer asks the DOM to do. A palette (the colours parse)
 * is applied in full with its style, missing style meaning Glass. An
 * answer with only theme_style switches the style. Anything else, an
 * empty answer included, changes nothing: the cached paint stays.
 */
export type ThemeUpdate =
  | { kind: 'full'; mood: string | null; style: ThemeStyle }
  | { kind: 'style'; style: ThemeStyle }
  | null

export function themeUpdateFor(data: unknown): ThemeUpdate {
  if (!data || typeof data !== 'object') return null
  const answer = data as Partial<ThemeColors>
  const style = typeof answer.theme_style === 'string' ? readThemeStyle(answer.theme_style) : null
  const paletteLooksValid =
    typeof answer.primary_color === 'string' && answer.primary_color.startsWith('#') &&
    typeof answer.background_color === 'string' && answer.background_color.startsWith('#')
  if (paletteLooksValid) {
    const mood = typeof answer.theme_mood === 'string' ? answer.theme_mood : null
    return { kind: 'full', mood, style: style ?? DEFAULT_STYLE }
  }
  return style ? { kind: 'style', style } : null
}

// Paint the cached theme to the DOM as early as possible -- this runs
// at module-evaluation time, before React mounts. Eliminates the
// default-palette flash on every reload. Also applies the cached
// mood so the per-mood body/heading font cascade lands in the FIRST
// paint, not after hydration (otherwise the user sees a flash of
// Inter then a swap to Cormorant/Space Grotesk/IBM Plex/etc), and the
// cached style, so a Classic organisation never flashes Glass.
if (typeof window !== 'undefined') {
  paintCachedTheme(readCachedTheme())
}

export function useTheme() {
  const { data } = useQuery<ThemeColors>({
    queryKey: ['admin-theme'],
    // Prefer the authenticated endpoint when the SPA has a token —
    // org binding is GUARANTEED there. The public /v1/theme has manual
    // auth resolution that can silently fail (returning cross-tenant
    // colors or empties) and was the root cause of the customer-reported
    // 'I picked a preset but after refresh it reverted' bug.
    queryFn: async () => {
      const hasToken = typeof window !== 'undefined' && !!localStorage.getItem('auth_token')
      // Members hold a token but no admin rights, so the authenticated
      // endpoint 403s for them — which left the portal unbranded and
      // logged an error on every load. They take the public route, which
      // is exactly what it exists for.
      let isStaff = true
      try {
        const raw = typeof window !== 'undefined' ? localStorage.getItem('loyalty-auth') : null
        if (raw) isStaff = JSON.parse(raw)?.state?.user?.user_type !== 'member'
      } catch { /* fall back to the admin endpoint */ }
      const endpoint = hasToken && isStaff ? '/v1/admin/branding/theme' : '/v1/theme'
      const r = await api.get(endpoint)
      return r.data.theme as ThemeColors
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    // Hydrate from the localStorage snapshot so React's initial render
    // already has the user's saved palette and style -- no
    // default-then-flip visual jolt.
    placeholderData: () => placeholderFromSnapshot(readCachedTheme()),
  })

  // CRITICAL: only act on `data` (server response) when it carries a real
  // palette or an explicit style. An empty answer must NOT fall back to
  // DEFAULTS-spread theme — that's what was wiping the user's selection.
  // The DOM is already painted with the cached snapshot from module-load
  // + placeholderData; we only UPDATE it when a real answer arrives.
  const update = themeUpdateFor(data)

  const theme = { ...DEFAULTS, ...data }

  useEffect(() => {
    // ROOT-CAUSE FIX (2026-06-13): previously this effect ran
    // applyThemeToDom(theme) on EVERY render — including when `data`
    // came back as an empty object. With theme spread over DEFAULTS, an
    // empty `data` resolves to the defaults, and the DOM got REPAINTED to
    // defaults on every fetch. Customer-visible symptom: 'refresh shows
    // the new theme for a second then reverts'. themeUpdateFor() keeps
    // that rule: an empty answer changes nothing.
    if (update?.kind === 'full') {
      applyThemeToDom(theme, update.mood, update.style)
      persistThemeSnapshot(data as Partial<ThemeColors>, readCachedPreset(), update.mood, update.style)
    } else if (update?.kind === 'style') {
      applyStyleOnly(update.style)
    }
  }, [
    theme.primary_color, theme.background_color, theme.surface_color,
    theme.border_color, theme.text_color, theme.text_secondary_color,
    theme.accent_color, theme.error_color, theme.warning_color, theme.info_color,
    data,
    update?.kind,
    update?.style,
    update?.kind === 'full' ? update.mood : null,
  ])

  return theme
}
