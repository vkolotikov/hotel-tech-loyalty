import { describe, expect, it } from 'vitest'
import { STYLE_NAMES, styleSettings, withoutThemeMeta } from './themeSettings'

describe('withoutThemeMeta', () => {
  it('drops the style, preset name and mood, keeps the colours', () => {
    const rows = [
      { key: 'primary_color', value: '#3b82f6' },
      { key: 'theme_style', value: 'glass' },
      { key: 'theme_preset_name', value: 'Royal Blue' },
      { key: 'theme_mood', value: 'corporate' },
      { key: 'company_logo', value: '' },
    ]
    expect(withoutThemeMeta(rows).map(r => r.key)).toEqual(['primary_color', 'company_logo'])
  })
})

describe('styleSettings', () => {
  it('saves the style under theme_style, the key the server validates', () => {
    expect(styleSettings('classic')).toEqual([{ key: 'theme_style', value: 'classic' }])
    expect(STYLE_NAMES.glass).toBe('Glass')
  })
})
