import type { CSSProperties } from 'react'
import { contrast, tint, type ThemeName } from '../../../workspace/theme/accent'
import { tierHex } from '../../theme/tierChip'

/** A custom tier colour stays data; exported decorations use its nearest reference tone. */
export function programTierPaint(color: string | null | undefined, theme: ThemeName) {
  const swatch = tierHex(color) ?? (theme === 'dark' ? '#bed7f5' : '#416184')
  const base = theme === 'dark' ? '#28303f' : '#ffffff'
  const raised = tint(base, swatch)
  const text = contrast(swatch, raised) >= 4.5 ? swatch : theme === 'dark' ? '#f5f7fb' : '#1b2430'
  const rgb = (s: string) => [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16))
  const tones = { bronze: '#e8ae89', silver: '#bed7f5', gold: '#ffd18a' }
  const distance = (s: string) => rgb(s).reduce((n, value, i) => n + (value - rgb(swatch)[i]) ** 2, 0)
  const tone = (Object.keys(tones) as (keyof typeof tones)[]).sort((a, b) => distance(tones[a]) - distance(tones[b]))[0]
  return { tone, style: { '--l-pg-tier-swatch': swatch, '--l-pg-tier-raised': raised, '--l-pg-tier-text': text } as CSSProperties }
}
