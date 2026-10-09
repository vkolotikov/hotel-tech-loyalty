import type { ThemeStyle } from '../hooks/useTheme'

/**
 * Appearance settings that are bookkeeping, not colours. Settings →
 * Branding's Brand Colors card lists every appearance setting as a text
 * field; these three are set by the Style and Palette pickers instead, and
 * a hand-typed theme_style would only earn a 422.
 */
export const THEME_META_KEYS = ['theme_style', 'theme_preset_name', 'theme_mood'] as const

export function withoutThemeMeta<T extends { key: string }>(settings: T[]): T[] {
  return settings.filter(setting => !(THEME_META_KEYS as readonly string[]).includes(setting.key))
}

export const STYLE_NAMES: Record<ThemeStyle, string> = {
  glass: 'Glass',
  classic: 'Classic',
  light: 'Clean light',
}

/** The settings save for a style switch. */
export function styleSettings(style: ThemeStyle): { key: string; value: string }[] {
  return [{ key: 'theme_style', value: style }]
}
