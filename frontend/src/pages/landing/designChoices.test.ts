import { describe, expect, it } from 'vitest'
import {
  PALETTES, FONT_PAIRINGS, PALETTE_IDS, FONT_PAIRING_IDS,
  DEFAULT_PALETTE_ID, DEFAULT_FONT_PAIRING_ID, paletteFor, pairingFor, themePayload,
} from './designChoices'

/**
 * The net Task 6's brief asks for: this module is a HAND-COPY of two
 * backend files (`App\Landing\Palette::all()`, `App\Landing\
 * ThemeRules::FONT_PAIRINGS`), and nothing on the TypeScript side can
 * import a `.php` array to check it stays in step. These tests hardcode
 * the six/four ids the backend authors today — the mutation this round's
 * report calls out (drop a palette from `PALETTES`) is caught by the
 * completeness test below, not by any structural assertion, because
 * structure alone cannot tell "five well-formed palettes" from "the wrong
 * five".
 */

const BACKEND_PALETTE_IDS = [
  'champagne_noir', 'porcelain', 'midnight_brass', 'clinic_air', 'terracotta', 'slate_amber',
]

const BACKEND_FONT_PAIRING_IDS = ['editorial', 'modern', 'classic', 'grand']

describe('PALETTES', () => {
  it('has exactly the six ids App\\Landing\\Palette::all() authors, in that order', () => {
    expect(PALETTE_IDS).toEqual(BACKEND_PALETTE_IDS)
  })

  it('has no duplicate id', () => {
    expect(new Set(PALETTE_IDS).size).toBe(PALETTES.length)
  })

  it('gives every palette a complete, non-empty set of preview tokens', () => {
    for (const p of PALETTES) {
      expect(typeof p.label).toBe('string')
      expect(p.label.length).toBeGreaterThan(0)
      expect(typeof p.dark).toBe('boolean')
      for (const key of ['bg', 'bg2', 'text', 'textSoft', 'accent', 'accentBright'] as const) {
        expect(typeof p[key], `${p.id}.${key}`).toBe('string')
        expect(p[key].length, `${p.id}.${key} was empty`).toBeGreaterThan(0)
      }
    }
  })

  it('gives every palette a real 6-digit hex for each colour token', () => {
    const hex = /^#[0-9A-Fa-f]{6}$/
    for (const p of PALETTES) {
      for (const key of ['bg', 'bg2', 'text', 'textSoft', 'accent', 'accentBright'] as const) {
        expect(p[key], `${p.id}.${key} is not a 6-digit hex`).toMatch(hex)
      }
    }
  })

  // The dark/light split the spec's own palette table authors — champagne_noir,
  // midnight_brass and slate_amber are dark; the other three are light.
  it('marks the three dark palettes and the three light ones exactly as authored', () => {
    const dark = PALETTES.filter(p => p.dark).map(p => p.id).sort()
    const light = PALETTES.filter(p => !p.dark).map(p => p.id).sort()
    expect(dark).toEqual(['champagne_noir', 'midnight_brass', 'slate_amber'].sort())
    expect(light).toEqual(['clinic_air', 'porcelain', 'terracotta'].sort())
  })
})

describe('FONT_PAIRINGS', () => {
  it('has exactly the four ids App\\Landing\\ThemeRules::FONT_PAIRINGS authors, in that order', () => {
    expect(FONT_PAIRING_IDS).toEqual(BACKEND_FONT_PAIRING_IDS)
  })

  it('has no duplicate id', () => {
    expect(new Set(FONT_PAIRING_IDS).size).toBe(FONT_PAIRINGS.length)
  })

  it('gives every pairing a complete display + body face', () => {
    for (const fp of FONT_PAIRINGS) {
      expect(typeof fp.label).toBe('string')
      expect(fp.label.length).toBeGreaterThan(0)
      expect(typeof fp.displayFontFamily).toBe('string')
      expect(fp.displayFontFamily.length).toBeGreaterThan(0)
      expect(typeof fp.displayFontWeight).toBe('number')
      expect(typeof fp.displayLetterSpacing).toBe('string')
      expect(typeof fp.bodyFontFamily).toBe('string')
      expect(fp.bodyFontFamily.length).toBeGreaterThan(0)
    }
  })

  // grand is the one pairing D3 says swaps the BODY face too (Cormorant
  // Garamond display over Inter body, not Inter Tight) — pinned by name so
  // a future edit that "fixes" grand's body back to Inter Tight fails loud.
  it('is the only pairing whose body face is not Inter Tight', () => {
    const nonInterTightBody = FONT_PAIRINGS.filter(fp => !fp.bodyFontFamily.includes('Inter Tight')).map(fp => fp.id)
    expect(nonInterTightBody).toEqual(['grand'])
  })

  it('is the only pairing whose display face is Cormorant Garamond', () => {
    const cormorant = FONT_PAIRINGS.filter(fp => fp.displayFontFamily.includes('Cormorant Garamond')).map(fp => fp.id)
    expect(cormorant).toEqual(['grand'])
  })
})

describe('paletteFor / pairingFor', () => {
  it('resolves a known palette id to that exact entry', () => {
    expect(paletteFor('midnight_brass')?.id).toBe('midnight_brass')
  })

  it('falls back to the default palette for an unknown or absent id', () => {
    expect(paletteFor('nope').id).toBe(DEFAULT_PALETTE_ID)
    expect(paletteFor(undefined).id).toBe(DEFAULT_PALETTE_ID)
    expect(paletteFor(null).id).toBe(DEFAULT_PALETTE_ID)
  })

  it('resolves a known pairing id to that exact entry', () => {
    expect(pairingFor('grand')?.id).toBe('grand')
  })

  it('falls back to the default pairing for an unknown or absent id', () => {
    expect(pairingFor('brutalist').id).toBe(DEFAULT_FONT_PAIRING_ID)
    expect(pairingFor(undefined).id).toBe(DEFAULT_FONT_PAIRING_ID)
  })

  it('the default ids are themselves real, authored entries', () => {
    expect(PALETTE_IDS).toContain(DEFAULT_PALETTE_ID)
    expect(FONT_PAIRING_IDS).toContain(DEFAULT_FONT_PAIRING_ID)
  })
})

describe('themePayload', () => {
  it('emits only the three backend-allowlisted keys, never anything else', () => {
    const payload = themePayload({
      brand_color: '#1f5fa8', font_pairing: 'grand', palette: 'midnight_brass',
      // @ts-expect-error — deliberately handing it a key the allowlist has
      // never carried, to prove the function narrows rather than spreads.
      radius: '4px',
    })
    expect(Object.keys(payload).sort()).toEqual(['brand_color', 'font_pairing', 'palette'])
  })

  it('omits a key that was never provided, rather than sending it empty', () => {
    const payload = themePayload({ brand_color: '#1f5fa8' })
    expect(payload).toEqual({ brand_color: '#1f5fa8' })
    expect('font_pairing' in payload).toBe(false)
    expect('palette' in payload).toBe(false)
  })

  it('drops an unrecognised font_pairing or palette id instead of forwarding it', () => {
    const payload = themePayload({ font_pairing: 'brutalist', palette: 'nope' })
    expect(payload).toEqual({})
  })

  it('drops null values for every key', () => {
    expect(themePayload({ brand_color: null, font_pairing: null, palette: null })).toEqual({})
  })

  it('drops an empty-string brand_color rather than sending a blank override', () => {
    expect(themePayload({ brand_color: '' })).toEqual({})
  })

  it('accepts every one of the four real font_pairing ids and six real palette ids', () => {
    for (const id of FONT_PAIRING_IDS) {
      expect(themePayload({ font_pairing: id })).toEqual({ font_pairing: id })
    }
    for (const id of PALETTE_IDS) {
      expect(themePayload({ palette: id })).toEqual({ palette: id })
    }
  })
})
