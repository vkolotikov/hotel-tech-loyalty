import { describe, expect, it } from 'vitest'
import { blend, selectedTone, toneChoices, toneSwatch, type ToneChoice } from './sectionTones'
import { PALETTES, paletteFor, type PaletteChoice } from './designChoices'

/**
 * The swatch recipes and the served-list gate.
 *
 * Node-env, pure functions only (vitest.config.ts), which is the whole
 * reason the colour maths lives in its own module rather than inline in the
 * component: what a tone LOOKS like is checkable here, and only how it is
 * laid out on the card needs a browser.
 */

const porcelain = paletteFor('porcelain')
const champagne = paletteFor('champagne_noir')

/** `SectionType::toneIds()`, in that constant's order — what the onboarding
 *  response actually sends. Hardcoded rather than imported for the reason
 *  every hand-verified list in this suite is: a list built from the module
 *  it checks cannot catch that module losing an entry. */
const SERVED: string[] = ['page', 'soft', 'accent']

describe('blend', () => {
  it('at alpha 0 is the lower colour and at alpha 1 is the upper one', () => {
    expect(blend('#ffffff', '#000000', 0)).toBe('#000000')
    expect(blend('#ffffff', '#000000', 1)).toBe('#ffffff')
  })

  it('composites in sRGB, channel by channel', () => {
    // 0.5 * 255 + 0.5 * 0 = 127.5 -> 128 (round-half-up, the same direction
    // every channel takes, so the hue does not shift on the rounding).
    expect(blend('#ffffff', '#000000', 0.5)).toBe('#808080')
    expect(blend('#ff0000', '#0000ff', 0.25)).toBe('#4000bf')
  })

  it('refuses anything that is not a 6-digit hex rather than guessing', () => {
    expect(blend('#fff', '#000000', 0.3)).toBeNull()
    expect(blend('#ffffff', 'rgb(0,0,0)', 0.3)).toBeNull()
    expect(blend('tomato', '#000000', 0.3)).toBeNull()
    expect(blend('', '#000000', 0.3)).toBeNull()
  })
})

describe('toneSwatch', () => {
  it('paints page on the palette own background and soft on its second surface', () => {
    expect(toneSwatch(porcelain, 'page')).toBe(porcelain.bg)
    expect(toneSwatch(porcelain, 'soft')).toBe(porcelain.bg2)
    expect(toneSwatch(champagne, 'page')).toBe(champagne.bg)
    expect(toneSwatch(champagne, 'soft')).toBe(champagne.bg2)
  })

  /**
   * The accent swatch is the stylesheet's own composite —
   * `.band--accent{background:linear-gradient(var(--halo), var(--halo)),
   * var(--bg-2)}`, with `--halo` being accent-bright at .30 in every
   * palette. Pinned by literal value for the two palettes at the extremes
   * (a near-black warm dark and the light default), so a change to the alpha
   * shows up as a colour, not just as "some hex moved".
   */
  it('paints accent as the halo composite the stylesheet actually renders', () => {
    // porcelain: 0.3 * #C77FB4 over 0.7 * #ECE8EE
    expect(toneSwatch(porcelain, 'accent')).toBe('#e1c8dd')
    // champagne_noir: 0.3 * #f1d49b over 0.7 * #1c150e
    expect(toneSwatch(champagne, 'accent')).toBe('#5c4e38')
  })

  it('has a recipe for every tone the backend ships, in every palette', () => {
    for (const palette of PALETTES) {
      for (const id of SERVED) {
        const color = toneSwatch(palette, id)
        expect(color, `${palette.id}/${id}`).not.toBeNull()
        expect(color).toMatch(/^#[0-9a-f]{6}$/i)
      }
    }
  })

  /**
   * The three swatches must be three visibly different colours in every
   * palette, or the picker offers a choice that changes nothing — the exact
   * failure `band--ink` was left OUT of the allowlist to avoid. Compared as
   * strings: two tones resolving to the same hex is the thing being ruled
   * out, and it is what a fourth tone mapped onto `--bg-2` would produce.
   */
  it('gives every palette three distinct colours', () => {
    for (const palette of PALETTES) {
      const colors = SERVED.map(id => toneSwatch(palette, id))
      expect(new Set(colors).size, `${palette.id} does not offer three distinct tones`).toBe(3)
    }
  })

  it('has no recipe for a tone this build does not know', () => {
    expect(toneSwatch(porcelain, 'ink')).toBeNull()
    expect(toneSwatch(porcelain, 'band--paper-2')).toBeNull()
    expect(toneSwatch(porcelain, '')).toBeNull()
  })
})

describe('toneChoices', () => {
  it('offers the served ids, in the served order, painted in the active palette', () => {
    expect(toneChoices(SERVED, porcelain)).toEqual([
      { id: 'page', color: porcelain.bg },
      { id: 'soft', color: porcelain.bg2 },
      { id: 'accent', color: '#e1c8dd' },
    ])
  })

  it('follows the server order rather than imposing its own', () => {
    expect(toneChoices(['accent', 'page'], porcelain).map(c => c.id)).toEqual(['accent', 'page'])
  })

  /**
   * A tone the server has grown and this build cannot paint is dropped, not
   * drawn in a guessed colour: the swatches ARE the control, so one missing
   * choice beats three swatches one of which is a lie.
   */
  it('drops a served tone it has no recipe for', () => {
    expect(toneChoices(['page', 'sunset', 'accent'], porcelain).map(c => c.id)).toEqual(['page', 'accent'])
  })

  it('offers nothing at all when the backend published no list', () => {
    expect(toneChoices(null, porcelain)).toEqual([])
    expect(toneChoices(undefined, porcelain)).toEqual([])
    expect(toneChoices([], porcelain)).toEqual([])
  })

  it('ignores a non-string entry rather than rendering one', () => {
    const junk = ['page', 42, null] as unknown as string[]
    expect(toneChoices(junk, porcelain).map(c => c.id)).toEqual(['page'])
  })

  it('repaints when the palette changes, which is the point of deriving them', () => {
    const light = toneChoices(SERVED, porcelain)
    const dark = toneChoices(SERVED, champagne)
    expect(light.map(c => c.color)).not.toEqual(dark.map(c => c.color))
  })
})

describe('selectedTone', () => {
  const choices: ToneChoice[] = toneChoices(SERVED, porcelain)

  it('lights the stored tone when there is one', () => {
    expect(selectedTone('accent', 'soft', choices)).toBe('accent')
  })

  /**
   * A row with no stored tone is NOT "unset" — it is sitting on the colour
   * its section was authored with, and the served `default_tone` names that.
   * Showing nothing lit would invite the tenant to choose the colour the
   * band already is.
   */
  it('falls back to the served default when nothing is stored', () => {
    expect(selectedTone(null, 'soft', choices)).toBe('soft')
    expect(selectedTone(undefined, 'page', choices)).toBe('page')
    expect(selectedTone('', 'soft', choices)).toBe('soft')
  })

  it('lights nothing when neither the stored tone nor the default is offered', () => {
    expect(selectedTone('sunset', null, choices)).toBeNull()
    expect(selectedTone(null, null, choices)).toBeNull()
    expect(selectedTone(null, 'ink', choices)).toBeNull()
  })

  it('lights nothing when there are no choices to light', () => {
    expect(selectedTone('accent', 'soft', [])).toBeNull()
  })
})

describe('the palettes these swatches are painted from', () => {
  /** Every palette this module reads must actually carry the three tokens
   *  the recipes use — `designChoices.ts` mirrors ten of Palette's fifteen
   *  by hand, and a swatch built off a missing one would render as
   *  `undefined`. */
  it('every palette carries the tokens the recipes read', () => {
    for (const palette of PALETTES as PaletteChoice[]) {
      expect(palette.bg).toMatch(/^#[0-9a-f]{6}$/i)
      expect(palette.bg2).toMatch(/^#[0-9a-f]{6}$/i)
      expect(palette.accentBright).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })
})
