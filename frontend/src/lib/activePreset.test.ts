import { describe, expect, it } from 'vitest'
import { activePresetName } from './activePreset'

const KEYS = ['primary_color', 'secondary_color', 'surface_color', 'border_color']
const PRESETS = {
  'Gold Luxury': { colors: { primary_color: '#c9a84c', secondary_color: '#1e1e1e', surface_color: '#161616', border_color: '#2c2c2c' } },
  'Royal Blue': { colors: { primary_color: '#3b82f6', secondary_color: '#1e293b', surface_color: '#1e293b', border_color: '#334155' } },
  'Gold Twin': { colors: { primary_color: '#c9a84c', secondary_color: '#1e1e1e', surface_color: '#161616', border_color: '#2c2c2c' } },
}
const name = (colors: Record<string, string>, stored: string | null = null, cached: string | null = null) =>
  activePresetName(colors, PRESETS, KEYS, stored, cached)

describe('activePresetName', () => {
  it('matches a preset when blank colours take their defaults, as the theme paints them', () => {
    expect(name({ primary_color: '#C9A84C', secondary_color: '#1e1e1e' })).toBe('Gold Luxury')
  })

  it('ignores a cached name whose colours no longer match (the stale "Royal Blue active" badge)', () => {
    expect(name({ primary_color: '#c9a84c' }, null, 'Royal Blue')).toBe('Gold Luxury')
  })

  it('ignores a saved name once the colours were edited by hand', () => {
    expect(name({ ...PRESETS['Royal Blue'].colors, primary_color: '#123456' }, 'Royal Blue')).toBeNull()
  })

  it('lets the saved name, then the cached one, pick between presets with the same colours', () => {
    const gold = PRESETS['Gold Luxury'].colors
    expect(name(gold, 'Gold Twin')).toBe('Gold Twin')
    expect(name(gold, null, 'Gold Twin')).toBe('Gold Twin')
    expect(name(gold, 'Gone', 'Also gone')).toBe('Gold Luxury')
  })

  it('reports a custom palette as no preset', () => {
    expect(name({ primary_color: '#123456' })).toBeNull()
  })
})
