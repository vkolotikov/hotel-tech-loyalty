import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { api } from '../lib/api'

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
}

const DEFAULTS: ThemeColors = {
  primary_color: '#c9a84c',
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

function hexToRgb(hex: string): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `${r} ${g} ${b}`
}

function generateShades(hex: string) {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)

  const lighten = (c: number, pct: number) => Math.min(255, Math.round(c + (255 - c) * pct))
  const darken = (c: number, pct: number) => Math.max(0, Math.round(c * (1 - pct)))

  return {
    50: `${lighten(r, 0.9)} ${lighten(g, 0.9)} ${lighten(b, 0.9)}`,
    100: `${lighten(r, 0.8)} ${lighten(g, 0.8)} ${lighten(b, 0.8)}`,
    200: `${lighten(r, 0.6)} ${lighten(g, 0.6)} ${lighten(b, 0.6)}`,
    300: `${lighten(r, 0.35)} ${lighten(g, 0.35)} ${lighten(b, 0.35)}`,
    400: `${lighten(r, 0.15)} ${lighten(g, 0.15)} ${lighten(b, 0.15)}`,
    500: `${r} ${g} ${b}`,
    600: `${darken(r, 0.12)} ${darken(g, 0.12)} ${darken(b, 0.12)}`,
    700: `${darken(r, 0.25)} ${darken(g, 0.25)} ${darken(b, 0.25)}`,
    800: `${darken(r, 0.35)} ${darken(g, 0.35)} ${darken(b, 0.35)}`,
    900: `${darken(r, 0.45)} ${darken(g, 0.45)} ${darken(b, 0.45)}`,
  }
}

function surfaceShade(hex: string, amount: number): string {
  const h = hex.replace('#', '')
  const r = Math.min(255, parseInt(h.slice(0, 2), 16) + amount)
  const g = Math.min(255, parseInt(h.slice(2, 4), 16) + amount)
  const b = Math.min(255, parseInt(h.slice(4, 6), 16) + amount)
  return `${r} ${g} ${b}`
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
 */
export function applyThemeToDom(colors: Partial<ThemeColors>, mood?: string | null): void {
  const merged: ThemeColors = { ...DEFAULTS, ...colors } as ThemeColors
  const root = document.documentElement

  const shades = generateShades(merged.primary_color)
  root.style.setProperty('--color-primary-50',  shades[50])
  root.style.setProperty('--color-primary-100', shades[100])
  root.style.setProperty('--color-primary-200', shades[200])
  root.style.setProperty('--color-primary-300', shades[300])
  root.style.setProperty('--color-primary-400', shades[400])
  root.style.setProperty('--color-primary-500', shades[500])
  root.style.setProperty('--color-primary-600', shades[600])
  root.style.setProperty('--color-primary-700', shades[700])
  root.style.setProperty('--color-primary-800', shades[800])
  root.style.setProperty('--color-primary-900', shades[900])

  root.style.setProperty('--color-dark-bg',       hexToRgb(merged.background_color))
  root.style.setProperty('--color-dark-surface',  hexToRgb(merged.surface_color))
  root.style.setProperty('--color-dark-surface2', surfaceShade(merged.surface_color, 8))
  root.style.setProperty('--color-dark-surface3', surfaceShade(merged.surface_color, 16))
  root.style.setProperty('--color-dark-surface4', surfaceShade(merged.surface_color, 24))
  root.style.setProperty('--color-dark-border',   hexToRgb(merged.border_color))
  root.style.setProperty('--color-dark-border2',  surfaceShade(merged.border_color, 12))

  root.style.setProperty('--color-text-primary',   hexToRgb(merged.text_color))
  root.style.setProperty('--color-text-secondary', hexToRgb(merged.text_secondary_color))

  root.style.setProperty('--color-accent',  hexToRgb(merged.accent_color))
  root.style.setProperty('--color-error',   hexToRgb(merged.error_color))
  root.style.setProperty('--color-warning', hexToRgb(merged.warning_color))
  root.style.setProperty('--color-info',    hexToRgb(merged.info_color))

  document.body.style.backgroundColor = merged.background_color
  document.body.style.color = merged.text_color

  // Mood propagation. CSS in index.css reads :root[data-mood="X"] and
  // forks --theme-font-body / --theme-font-display / --theme-radius-*
  // so EVERY surface in the admin (sidebars, tables, cards, buttons,
  // headings, etc.) shifts to the picked mood's vocabulary on next
  // paint. Without this the admin only changes color.
  if (mood && typeof mood === 'string') {
    root.setAttribute('data-mood', mood)
  } else if (mood === null) {
    root.removeAttribute('data-mood')
  }
}

export type { ThemeColors }

/**
 * Cache key for the last-known-good theme snapshot in localStorage.
 *
 * Why: without this, every page reload paints Gold Luxury defaults for
 * the first ~200 ms while the /v1/theme query resolves -- the user sees
 * their carefully-picked Royal Blue / Emerald / etc. flash to default
 * and back. On a slow connection (or briefly offline), the API call
 * may not resolve at all, leaving the admin stuck on defaults and
 * making the user think "my theme didn't save". With the snapshot we
 * apply the last-known palette synchronously before React even mounts.
 */
const THEME_CACHE_KEY = 'loyalty-admin-theme-v1'
const PRESET_CACHE_KEY = 'loyalty-admin-theme-preset-v1'

interface CachedTheme {
  colors: Partial<ThemeColors>
  preset?: string | null
  mood?: string | null
  savedAt: number
}

/**
 * Read the cached theme synchronously. Returns null on any parse error
 * or when the cache is missing.
 */
function readCachedTheme(): CachedTheme | null {
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
 * quota exceeded just skip silently.
 */
export function persistThemeSnapshot(
  colors: Partial<ThemeColors>,
  preset: string | null = null,
  mood: string | null = null,
): void {
  try {
    const payload: CachedTheme = { colors, preset, mood, savedAt: Date.now() }
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

// Paint the cached theme to the DOM as early as possible -- this runs
// at module-evaluation time, before React mounts. Eliminates the
// default-palette flash on every reload. Also applies the cached
// mood so the per-mood body/heading font cascade lands in the FIRST
// paint, not after hydration (otherwise the user sees a flash of
// Inter then a swap to Cormorant/Space Grotesk/IBM Plex/etc).
const _earlySnapshot = typeof window !== 'undefined' ? readCachedTheme() : null
if (_earlySnapshot?.colors) {
  applyThemeToDom(_earlySnapshot.colors, _earlySnapshot.mood ?? null)
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
      const endpoint = hasToken ? '/v1/admin/branding/theme' : '/v1/theme'
      const r = await api.get(endpoint)
      return r.data.theme as ThemeColors
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    // Hydrate from the localStorage snapshot so React's initial render
    // already has the user's saved palette -- no Gold-Luxury-then-flip
    // visual jolt.
    placeholderData: () => {
      const snap = readCachedTheme()
      return snap?.colors ? ({ ...DEFAULTS, ...snap.colors } as ThemeColors) : undefined
    },
  })

  // CRITICAL: only validate against `data` (server response). If it's
  // empty/missing, we DO NOT want to fall back to DEFAULTS-spread theme
  // — that's what was wiping the user's selection. The DOM is already
  // painted with the cached snapshot from module-load + placeholderData;
  // we only need to UPDATE the DOM when a real fresh theme arrives.
  const dataLooksValid =
    data &&
    typeof data === 'object' &&
    typeof (data as any).primary_color === 'string' &&
    (data as any).primary_color.startsWith('#') &&
    typeof (data as any).background_color === 'string' &&
    (data as any).background_color.startsWith('#')

  const theme = { ...DEFAULTS, ...data }

  useEffect(() => {
    // ROOT-CAUSE FIX (2026-06-13): previously this effect ran
    // applyThemeToDom(theme) on EVERY render — including when `data`
    // came back as an empty object. With theme spread over DEFAULTS, an
    // empty `data` resolves to the gold-luxury defaults, and the DOM
    // got REPAINTED to defaults on every fetch. Customer-visible
    // symptom: 'refresh shows the new theme for a second then reverts'.
    //
    // Now we only touch the DOM (and localStorage) when the server gave
    // us a real, parseable theme. The initial paint from the
    // module-load `_earlySnapshot` + the useQuery placeholderData
    // covers the page-load case. The DOM stays on the cached colors
    // until a valid server response replaces them.
    if (dataLooksValid) {
      const serverMood = typeof (data as any)?.theme_mood === 'string' ? (data as any).theme_mood : null
      applyThemeToDom(theme, serverMood)
      persistThemeSnapshot(data, readCachedPreset(), serverMood)
    }
  }, [
    theme.primary_color, theme.background_color, theme.surface_color,
    theme.border_color, theme.text_color, theme.text_secondary_color,
    theme.accent_color, theme.error_color, theme.warning_color, theme.info_color,
    data,
    dataLooksValid,
  ])

  return theme
}
