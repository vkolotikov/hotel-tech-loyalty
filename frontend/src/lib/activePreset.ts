import { paletteWithDefaults } from '../hooks/useTheme'

type Palette = Parameters<typeof paletteWithDefaults>[0]

/**
 * The palette preset the colours are, for Settings → Branding's "… active"
 * badge. Colours compare as the theme paints them: a blank or broken key
 * takes its default. A saved or cached preset name counts only while its
 * colours still match, so a palette edited by hand is custom (null); where
 * several presets share the colours, the saved name, then the cached one,
 * picks between them.
 */
export function activePresetName(
  colors: Record<string, string>,
  presets: Record<string, { colors: Record<string, string> }>,
  keys: readonly string[],
  storedName: string | null,
  cachedName: string | null,
): string | null {
  const effective = (palette: Record<string, string>) => paletteWithDefaults(palette as Palette) as unknown as Record<string, string>
  const current = effective(colors)
  const matches = (name: string | null) => {
    const preset = name ? presets[name] : undefined
    if (!preset) return false
    const theirs = effective(preset.colors)
    return keys.every(key => current[key].toLowerCase() === theirs[key].toLowerCase())
  }
  if (matches(storedName)) return storedName
  if (matches(cachedName)) return cachedName
  return Object.keys(presets).find(matches) ?? null
}
