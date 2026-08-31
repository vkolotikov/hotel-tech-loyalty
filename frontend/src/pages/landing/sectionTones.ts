/**
 * The per-section colour picker's own pure logic: which tones this build can
 * PREVIEW, and what colour each swatch should actually be painted.
 *
 * THE ALLOWLIST IS THE SERVER'S, NOT THIS FILE'S. `App\Landing\SectionType::
 * TONES` is the one list of tones that exist; it is served on the onboarding
 * response as `section_tones` (alongside `section_types` and `max_sections`,
 * for the identical reason) and `toneChoices` below is handed that list
 * rather than a copy of it. What lives here is the other half of the
 * question, the half the server has no business answering: what a tone LOOKS
 * like, which depends entirely on the palette the page is currently wearing
 * and changes the moment the tenant picks a different one.
 *
 * Palette values come from `designChoices.ts`, which already mirrors
 * `App\Landing\Palette::all()` by hand for the design cards — the same six
 * palettes, the same subset of tokens, already pinned by
 * `designChoices.test.ts`. Nothing new is mirrored here.
 *
 * A served tone this build cannot preview is DROPPED from the picker rather
 * than drawn with a guessed colour. The swatches are the whole point of the
 * control — the brief's own "show the actual colours, not words alone" — so a
 * swatch painted in a colour the band will not actually be is worse than one
 * missing choice, and a frontend running behind a backend that has grown a
 * fourth tone is exactly the situation where that would happen.
 */
import type { PaletteChoice } from './designChoices'

/** One offerable tone, ready for a swatch button. */
export type ToneChoice = {
  /** `App\Landing\SectionType::TONES`'s own id — what the save sends. */
  id: string
  /** The CSS colour this tone paints the band, in the ACTIVE palette. */
  color: string
}

/**
 * How much of the palette's accent shows through the accent tone's band.
 *
 * `.band--accent` composites `var(--halo)` over `var(--bg-2)`, and `--halo`
 * is every palette's accent-bright at .30 (`App\Landing\Palette`, where all
 * six derive it identically). Repeated here as a number rather than read off
 * a token, because `designChoices.ts` deliberately mirrors only the ten
 * explicit hex values and not the five derived ones — so the swatch blends
 * `accentBright` itself at the same alpha, which is the same colour by
 * construction. `PaletteTest`'s own accent-tone contrast test blends from the
 * authored `halo` literal instead, which is what catches the two drifting.
 */
const ACCENT_TONE_ALPHA = 0.3

/** #rrggbb -> [r, g, b], or null for anything that is not one. */
function channels(hex: string): [number, number, number] | null {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return null

  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
}

function toHex(value: number): string {
  return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0')
}

/**
 * `over` seen through `top` at `alpha` — source-over in sRGB, the same
 * compositing the browser does for the stylesheet's
 * `linear-gradient(var(--halo), var(--halo))` layer over a `var(--bg-2)`
 * background. Returns a flat hex because a swatch is one colour, not a stack.
 */
export function blend(top: string, over: string, alpha: number): string | null {
  const a = channels(top)
  const b = channels(over)

  if (a === null || b === null) return null

  return '#' + a.map((channel, i) => toHex(alpha * channel + (1 - alpha) * b[i])).join('')
}

/**
 * What one tone id paints, in this palette — null when this build has no
 * recipe for it.
 *
 * The three arms mirror `SectionType::TONES`' three classes as the
 * stylesheet defines them: no modifier is the page's own `--bg`,
 * `band--paper-2` is `--bg-2`, and `band--accent` is the halo composite
 * above. `band--ink` is absent for the same reason it is not a tone at all —
 * it is `--bg-2` too (D1's tonal ruling), so it is not a colour a tenant can
 * separately choose.
 */
export function toneSwatch(palette: PaletteChoice, toneId: string): string | null {
  if (toneId === 'page') return palette.bg
  if (toneId === 'soft') return palette.bg2
  if (toneId === 'accent') return blend(palette.accentBright, palette.bg2, ACCENT_TONE_ALPHA)

  return null
}

/**
 * The picker's rows: the SERVED tone ids, in the order the server sent them,
 * reduced to the ones this build can paint.
 *
 * `served` absent or empty (an older backend that does not publish the list,
 * a failed onboarding fetch) yields NO choices and the control does not
 * render at all. Deliberately not a fallback to a hardcoded three: a picker
 * built from a list this file invented is a picker that can offer a value the
 * save would then 422 on, which is the whole thing serving the list avoids.
 */
export function toneChoices(served: string[] | null | undefined, palette: PaletteChoice): ToneChoice[] {
  if (!Array.isArray(served)) return []

  return served.flatMap((id): ToneChoice[] => {
    if (typeof id !== 'string') return []

    const color = toneSwatch(palette, id)

    return color === null ? [] : [{ id, color }]
  })
}

/**
 * Which swatch a row should show as chosen: its stored tone when it has one,
 * otherwise the section type's authored default (`section_types[*].
 * default_tone`, served — the editor does not know which band class each
 * partial was written with, and should not).
 *
 * Both can be absent: a row whose stored tone this build does not recognise,
 * or a type an older backend published without a default, simply has nothing
 * lit. That is honest — the band is on SOME colour, and this build cannot say
 * which — and it is not a state the picker treats as broken.
 */
export function selectedTone(
  stored: string | null | undefined,
  defaultTone: string | null | undefined,
  choices: ToneChoice[],
): string | null {
  const candidate = typeof stored === 'string' && stored !== '' ? stored : defaultTone

  return choices.some(choice => choice.id === candidate) ? (candidate as string) : null
}
