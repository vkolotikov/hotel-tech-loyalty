import { describe, expect, it } from 'vitest'
import { themePayload, pickerSafeHex } from './designChoices'

/**
 * The palettes and the type pairings this module used to mirror by hand
 * (and the byte-for-byte net that read `Palette.php` off disk to keep the
 * mirror honest) are gone with the generic house design they styled. What
 * is left is the accent's own narrowing, and the retired keys are pinned
 * below as things this function must DROP — the page saved before the
 * retirement still carries them, and the server refuses them now.
 */
describe('themePayload', () => {
  it('emits only the one backend-allowlisted key, never anything else', () => {
    const out = themePayload({ brand_color: '#1F5FA8' })

    expect(out).toEqual({ brand_color: '#1F5FA8' })
    expect(Object.keys(out)).toEqual(['brand_color'])
  })

  it('omits a key that was never provided, rather than sending it empty', () => {
    expect(themePayload({})).toEqual({})
    expect('brand_color' in themePayload({})).toBe(false)
  })

  it('drops null values', () => {
    expect(themePayload({ brand_color: null })).toEqual({})
  })

  it('drops an empty-string brand_color rather than sending a blank override', () => {
    expect(themePayload({ brand_color: '' })).toEqual({})
  })

  it('drops the retired designs stored keys, which the server now refuses', () => {
    // A `theme` read straight off a page saved before the retirement.
    const stale = { brand_color: '#1F5FA8', palette: 'champagne_noir', font_pairing: 'grand' } as unknown as { brand_color: string }

    expect(themePayload(stale)).toEqual({ brand_color: '#1F5FA8' })
  })
})

describe('pickerSafeHex', () => {
  const FALLBACK = '#9B5C8F'

  it('passes a valid 6-hex-digit colour through unchanged', () => {
    expect(pickerSafeHex('#1F5FA8', FALLBACK)).toBe('#1F5FA8')
    expect(pickerSafeHex('#abcdef', FALLBACK)).toBe('#abcdef')
  })

  it('falls back to the given default for every shape a native colour input would coerce to black', () => {
    for (const bad of ['#FFF', '9B5C8F', 'rgb(1, 2, 3)', 'tomato', '', null, undefined, '#12345', '#1234567']) {
      expect(pickerSafeHex(bad, FALLBACK), String(bad)).toBe(FALLBACK)
    }
  })
})
