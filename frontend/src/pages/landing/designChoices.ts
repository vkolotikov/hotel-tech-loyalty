/**
 * The Design tab's one theme control, as data (landing phase 3c).
 *
 * This module used to be the hand-mirror of two backend files — six curated
 * palettes and four self-hosted type pairings — for the design cards. Both
 * were the generic house design's controls (`ruled_page`), and that design
 * is retired and deleted: every one of the owner's six kits ships its
 * author's own `:root` and reads neither key, so the cards were removed
 * with the final scenario and the data left with the design. What is left
 * is the ONE override every kit honours — the accent — and the two helpers
 * its picker needs.
 *
 * `themePayload` narrows to `App\Landing\ThemeRules::keys()` — one key,
 * `brand_color` — and that narrowing is load-bearing rather than tidy: a
 * page saved before the retirement may still carry a stored `palette` or
 * `font_pairing`, and the server refuses either as an unknown key now.
 * Sending only what this function emits is what lets such a page save at
 * all, and what washes the stale keys out on that first save.
 */

/**
 * F4 (phase 3c final fix wave): narrows a possibly-invalid stored colour to
 * something an `<input type="color">` can actually show. The native picker
 * coerces ANYTHING that is not a strict 7-character `#rrggbb` string to
 * `#000000` — a 3-digit short hex (`#FFF`), a bare hex with no `#`
 * (`9B5C8F`), an `rgb()`/`hsl()` string, a named colour (`tomato`), or a
 * garbled/legacy stored value all open the OS colour dialog on black, even
 * though the swatch beside it (a plain CSS `backgroundColor`, which accepts
 * a much wider grammar) still shows the real stored value — so a tenant's
 * very first drag of that black-looking picker silently overwrote their
 * real accent with black.
 *
 * Deliberately only 6-hex-digit values pass, matching `CssColor::safe()`'s
 * own output shape server-side (`Accent::for()` re-validates the actual
 * colour at render time regardless, so narrowing here is a UI courtesy, not
 * a security boundary) — anything else falls back to `fallback` rather
 * than to black, so the picker opens on a colour that is at least
 * recognisably the tenant's accent instead of an alarming void.
 */
export function pickerSafeHex(value: string | null | undefined, fallback: string): string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback
}

/** What a caller hands `themePayload` — the one loose, possibly-absent-or-
 *  invalid field both screens work with before this function narrows it. */
export type ThemeInput = {
  brand_color?: string | null
}

/**
 * `App\Landing\ThemeRules::keys()`'s own allowlist (`brand_color`), applied
 * client-side before a theme patch ever reaches `PUT /v1/admin/landing-pages`
 * — belt-and-braces with the backend's own refusal (`ThemeRules::validate()`'s
 * unknown-key 422), not a replacement for it.
 *
 * `brand_color` is kept whenever it is a non-empty string — the backend's
 * own rule is `nullable|string|max:32`, a length guard rather than a format
 * one (`Accent::for()` re-validates the actual colour syntax at render
 * time), so there is no format to check here either.
 *
 * A key whose value is missing, `null` or empty is simply ABSENT from the
 * result — never sent as `''`/`null` — which is what lets the editor's save
 * path merge this into an existing `theme` object without erasing a value
 * the tenant did not just touch (see `LandingEditor.tsx`'s own
 * `updateTheme`). Any OTHER key a stored `theme` happens to carry (the
 * retired design's `palette`/`font_pairing`) is dropped here, because the
 * server would refuse it.
 */
export function themePayload(input: ThemeInput): Record<string, string> {
  const out: Record<string, string> = {}

  if (typeof input.brand_color === 'string' && input.brand_color !== '') {
    out.brand_color = input.brand_color
  }

  return out
}
