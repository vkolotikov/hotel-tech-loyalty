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
 */
export function applyThemeToDom(colors: Partial<ThemeColors>): void {
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
export function persistThemeSnapshot(colors: Partial<ThemeColors>, preset: string | null = null): void {
  try {
    const payload: CachedTheme = { colors, preset, savedAt: Date.now() }
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
// default-palette flash on every reload.
const _earlySnapshot = typeof window !== 'undefined' ? readCachedTheme() : null
if (_earlySnapshot?.colors) {
  applyThemeToDom(_earlySnapshot.colors)
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

  const theme = { ...DEFAULTS, ...data }

  useEffect(() => {
    applyThemeToDom(theme)
    // Persist whenever the server hands us a fresh theme so the next
    // load can use it as the placeholder. CRITICAL: only persist when
    // the server returned a real theme (at least primary_color +
    // background_color). Without this guard, a /v1/theme call that
    // silently fails its org-id resolution (e.g. Sanctum guard returns
    // null on a public route, no fallback matches) returns empty colors,
    // which we'd then write to localStorage — overwriting the user's
    // just-saved Rose Boutique with defaults. Next refresh paints
    // defaults: 'I picked Rose Boutique but after refresh it reverted.'
    // This is exactly the customer-reported bug as of 2026-06-13.
    const looksValid =
      data &&
      typeof data === 'object' &&
      typeof (data as any).primary_color === 'string' &&
      (data as any).primary_color.startsWith('#') &&
      typeof (data as any).background_color === 'string' &&
      (data as any).background_color.startsWith('#')
    if (looksValid) {
      persistThemeSnapshot(data, readCachedPreset())
    }
  }, [
    theme.primary_color, theme.background_color, theme.surface_color,
    theme.border_color, theme.text_color, theme.text_secondary_color,
    theme.accent_color, theme.error_color, theme.warning_color, theme.info_color,
    data,
  ])

  return theme
}
