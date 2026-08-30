import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  PALETTES, FONT_PAIRINGS, PALETTE_IDS, FONT_PAIRING_IDS,
  DEFAULT_PALETTE_ID, DEFAULT_FONT_PAIRING_ID, paletteFor, pairingFor, themePayload, pickerSafeHex,
  type PaletteChoice,
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

/**
 * F6 (phase 3c final fix wave): the tests above (and Task 6's own,
 * unchanged) pin PALETTES by id, shape and dark/light split — none of them
 * would notice `App\Landing\Palette.php` gaining a new hex for a token this
 * module already mirrors, which is exactly the drift that ships a
 * silently-stale admin preview card (the tenant picks "Terracotta" and
 * sees a colour Palette.php no longer actually produces).
 *
 * Reads Palette.php as text from the repo, the same way
 * localeCompleteness.test.ts (frontend/src/i18n) already reads source files
 * from vitest's node environment — chosen over a checked-in PHP-side
 * fixture because the failure this test exists to catch is PHP drifting
 * out from under an unchanged mirror, so the net has to read the real,
 * current Palette.php on every run rather than a snapshot that could go
 * stale in exactly the same way the mirror itself did.
 */
describe('PALETTES mirrors App\\Landing\\Palette.php byte-for-byte', () => {
  const PALETTE_PHP_PATH = path.resolve(__dirname, '../../../../app/Landing/Palette.php')
  const source = fs.readFileSync(PALETTE_PHP_PATH, 'utf8')

  // designChoices.ts field -> Palette.php's own token key for it (only the
  // six fields this module actually mirrors — see PaletteChoice's own
  // comment on which nine tokens it deliberately omits).
  const MIRRORED_KEYS: Record<keyof Omit<PaletteChoice, 'id' | 'label' | 'dark'>, string> = {
    bg: 'bg', bg2: 'bg-2', text: 'text', textSoft: 'text-soft', accent: 'accent', accentBright: 'accent-bright',
  }

  /** The hex Palette.php authors for `id`'s `phpKey` token, or null if the parser below could not find it. */
  function phpPaletteHex(id: string, phpKey: string): string | null {
    const idIndex = source.indexOf(`'${id}' => [`)
    if (idIndex === -1) return null

    // This id's own block ends where the NEXT authored id's block begins
    // (or at EOF for the last one) — good enough because every id below is
    // looked up by its own unique quoted key, so no block can start inside
    // another one.
    const laterIds = PALETTE_IDS
      .filter(other => other !== id)
      .map(other => source.indexOf(`'${other}' => [`))
      .filter(index => index > idIndex)
    const blockEnd = laterIds.length > 0 ? Math.min(...laterIds) : source.length
    const block = source.slice(idIndex, blockEnd)

    const match = block.match(new RegExp(`'${phpKey}'\\s*=>\\s*'(#[0-9a-fA-F]{6})'`))
    return match ? match[1] : null
  }

  it('finds every backend hex the assertions below compare against (guards the parser itself, not the mirror)', () => {
    for (const id of PALETTE_IDS) {
      for (const phpKey of Object.values(MIRRORED_KEYS)) {
        expect(phpPaletteHex(id, phpKey), `Palette.php['${id}']['tokens']['${phpKey}'] was not found`).not.toBeNull()
      }
    }
  })

  it.each(PALETTE_IDS)('matches Palette.php\'s authored hex for every mirrored token of %s', (id) => {
    const palette = PALETTES.find(p => p.id === id)!

    for (const [tsKey, phpKey] of Object.entries(MIRRORED_KEYS) as [keyof typeof MIRRORED_KEYS, string][]) {
      const phpHex = phpPaletteHex(id, phpKey)
      const tsHex = palette[tsKey]

      expect(
        tsHex,
        `designChoices.ts PALETTES['${id}'].${tsKey} ("${tsHex}") no longer matches `
        + `Palette.php['${id}']['tokens']['${phpKey}'] ("${phpHex}") — the admin preview card is now stale.`,
      ).toBe(phpHex)
    }
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

describe('pickerSafeHex', () => {
  // F4 (phase 3c final fix wave): the exact adversarial set the brief
  // names, plus the one value that must NOT fall back — a real 6-hex-digit
  // colour, any case, passes through unchanged.
  it('passes a valid 6-hex-digit colour through unchanged', () => {
    expect(pickerSafeHex('#1f5fa8', '#9b5c8f')).toBe('#1f5fa8')
    expect(pickerSafeHex('#1F5FA8', '#9b5c8f')).toBe('#1F5FA8')
  })

  it('falls back to the given default for every shape a native colour input would coerce to black', () => {
    const fallback = '#9b5c8f'
    // null is deliberately included: it is one of the shapes the picker's
    // own possibly-absent-or-invalid stored value can carry, same as
    // ThemeInput's other loose fields elsewhere in this file.
    const bads: Array<string | undefined | null> = ['#FFF', '9B5C8F', 'rgb(1,2,3)', 'tomato', '', undefined, null]
    for (const bad of bads) {
      expect(pickerSafeHex(bad, fallback), `input: ${JSON.stringify(bad)}`).toBe(fallback)
    }
  })
})
