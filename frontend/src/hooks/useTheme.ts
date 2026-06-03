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

export function useTheme() {
  const { data } = useQuery<ThemeColors>({
    queryKey: ['admin-theme'],
    queryFn: () => api.get('/v1/theme').then(r => r.data.theme),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })

  const theme = { ...DEFAULTS, ...data }

  useEffect(() => {
    applyThemeToDom(theme)
  }, [
    theme.primary_color, theme.background_color, theme.surface_color,
    theme.border_color, theme.text_color, theme.text_secondary_color,
    theme.accent_color, theme.error_color, theme.warning_color, theme.info_color,
  ])

  return theme
}
