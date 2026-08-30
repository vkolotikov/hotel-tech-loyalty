/**
 * Pure data for the design cards (landing phase 3c, Task 6, D4): the six
 * curated palettes and four self-hosted type pairings, mirrored BY HAND
 * from the two backend files that actually own these facts —
 *
 *   - `App\Landing\Palette::all()` (app/Landing/Palette.php) — the six
 *     palette ids, their `dark` flag and their fifteen authored tokens.
 *     Only a HANDFUL of those tokens are copied here (`bg`, `bg2`, `text`,
 *     `textSoft`, `accent`, `accentBright`) — exactly the ones a miniature
 *     card render needs (surface, running-text colour, an accent dot/bar).
 *     The other nine (glass, line, line-soft, halo, scrim, accent-deep,
 *     accent-on, bg-elev, text-muted) are real-page chrome the card has no
 *     use for.
 *   - `App\Landing\ThemeRules::FONT_PAIRINGS` (app/Landing/ThemeRules.php)
 *     — the four pairing ids, in that exact order. The font-family/weight/
 *     tracking values themselves are copied from `public/landing/
 *     ruled_page.css`'s own `:root[data-font-pairing="X"] h1,h2,h3` rules
 *     (and, for `grand`, its one `--font-body` override) — the CSS is the
 *     rendering truth; this module is a deliberately narrow read of it.
 *
 * Both id lists are HARDCODED here rather than fetched at runtime (there is
 * no endpoint that serves them, and there should not be one just for this)
 * — `designChoices.test.ts` is what catches the two functions drifting
 * apart: it pins the six/four ids by literal value, so removing or
 * misspelling one here fails a test instead of silently shipping a design
 * panel with five palettes.
 *
 * Every font-family string below lists the SELF-HOSTED face first (Task 3,
 * D3 — `frontend/src/styles/landing-preview-fonts.css` is what actually
 * loads those files for these two screens) and a plain system fallback
 * after it — never the metric-matched `'Fraunces fb'`/`'Inter Tight fb'`
 * local()-only faces `ruled_page.css` declares for the PUBLISHED page's
 * own anti-FOUC swap: those families are never declared in the admin
 * SPA's own CSS, so naming them here would just be dead weight the browser
 * skips over on its way to Georgia/Arial anyway.
 */

export type PaletteId =
  | 'champagne_noir'
  | 'porcelain'
  | 'midnight_brass'
  | 'clinic_air'
  | 'terracotta'
  | 'slate_amber'

export type FontPairingId = 'editorial' | 'modern' | 'classic' | 'grand'

export type PaletteChoice = {
  id: PaletteId
  /** English fallback only — screens pass this as `t()`'s default value. */
  label: string
  dark: boolean
  bg: string
  bg2: string
  text: string
  textSoft: string
  accent: string
  accentBright: string
}

export type FontPairingChoice = {
  id: FontPairingId
  /** English fallback only — screens pass this as `t()`'s default value. */
  label: string
  /** The self-hosted display/heading face, plain system fallback after it. */
  displayFontFamily: string
  displayFontWeight: number
  displayLetterSpacing: string
  /** Only `editorial`/`classic` set this (Fraunces' `opsz` axis). */
  displayFontVariationSettings?: string
  /** Only `modern` sets this. */
  displayTextTransform?: 'uppercase'
  /** The running-text face. Only `grand` differs from the Inter Tight
   *  every other pairing leaves alone (`ruled_page.css`'s `--font-body`). */
  bodyFontFamily: string
}

/**
 * `App\Landing\Palette::all()`'s own array order, verbatim — the six
 * authored ids and the ten explicit hex values each carries (this module's
 * own subset of them; see the header comment for which five are omitted
 * and why).
 */
export const PALETTES: PaletteChoice[] = [
  {
    id: 'champagne_noir',
    label: 'Champagne Noir',
    dark: true,
    bg: '#15100b',
    bg2: '#1c150e',
    text: '#f7eeda',
    textSoft: '#d8cdb6',
    accent: '#d8b878',
    accentBright: '#f1d49b',
  },
  {
    id: 'porcelain',
    label: 'Porcelain',
    dark: false,
    bg: '#F4F6F8',
    bg2: '#ECE8EE',
    text: '#211C29',
    textSoft: '#5B5266',
    accent: '#9B5C8F',
    accentBright: '#C77FB4',
  },
  {
    id: 'midnight_brass',
    label: 'Midnight Brass',
    dark: true,
    bg: '#0f1419',
    bg2: '#151c23',
    text: '#EDF2F4',
    textSoft: '#C3CDD4',
    accent: '#C8A96A',
    accentBright: '#E3C98F',
  },
  {
    id: 'clinic_air',
    label: 'Clinic Air',
    dark: false,
    bg: '#F7FAFB',
    bg2: '#EDF3F5',
    text: '#122A33',
    textSoft: '#3D5A66',
    accent: '#0E7C86',
    accentBright: '#3AA7B0',
  },
  {
    id: 'terracotta',
    label: 'Terracotta',
    dark: false,
    bg: '#FAF5EE',
    bg2: '#F3EADD',
    text: '#2A2018',
    textSoft: '#5C4C3E',
    accent: '#B4462A',
    accentBright: '#D96A47',
  },
  {
    id: 'slate_amber',
    label: 'Slate Amber',
    dark: true,
    bg: '#16181D',
    bg2: '#1C1F26',
    text: '#EFF1F4',
    textSoft: '#C6CBD4',
    accent: '#E0A458',
    accentBright: '#F2C583',
  },
]

/**
 * `App\Landing\ThemeRules::FONT_PAIRINGS`'s own array order, verbatim —
 * `['editorial', 'modern', 'classic', 'grand']`. Values below mirror
 * `public/landing/ruled_page.css`'s `:root[data-font-pairing="X"]
 * h1,h2,h3` rules (and, for `grand` only, its `--font-body` override) —
 * see that file's own "font pairing (RULING 5)" comment block for the
 * full reasoning per pairing.
 *
 * `classic` carries no `displayFontWeight`/`displayLetterSpacing` override
 * in the CSS at all (its pairing rule only re-declares
 * `font-variation-settings: 'opsz' 144`, letting the base `h1,h2,h3` rule's
 * `font-weight: 300; letter-spacing: -.01em` keep winning) — copied here as
 * literal 300 / '-0.01em' so this module carries the FULL resolved value a
 * heading actually renders with, not just the one property classic's own
 * pairing selector happens to declare.
 */
export const FONT_PAIRINGS: FontPairingChoice[] = [
  {
    id: 'editorial',
    label: 'Editorial',
    displayFontFamily: 'Fraunces, Georgia, serif',
    displayFontWeight: 450,
    displayLetterSpacing: '-0.02em',
    displayFontVariationSettings: "'opsz' 30",
    bodyFontFamily: "'Inter Tight', system-ui, sans-serif",
  },
  {
    id: 'modern',
    label: 'Modern',
    displayFontFamily: "'IBM Plex Mono', ui-monospace, 'SFMono-Regular', Menlo, monospace",
    displayFontWeight: 500,
    displayLetterSpacing: '0.02em',
    displayTextTransform: 'uppercase',
    bodyFontFamily: "'Inter Tight', system-ui, sans-serif",
  },
  {
    id: 'classic',
    label: 'Classic',
    displayFontFamily: 'Fraunces, Georgia, serif',
    displayFontWeight: 300,
    displayLetterSpacing: '-0.01em',
    displayFontVariationSettings: "'opsz' 144",
    bodyFontFamily: "'Inter Tight', system-ui, sans-serif",
  },
  {
    id: 'grand',
    label: 'Grand',
    displayFontFamily: "'Cormorant Garamond', Georgia, serif",
    displayFontWeight: 500,
    displayLetterSpacing: '-0.005em',
    bodyFontFamily: 'Inter, system-ui, -apple-system, sans-serif',
  },
]

export const PALETTE_IDS: PaletteId[] = PALETTES.map(p => p.id)
export const FONT_PAIRING_IDS: FontPairingId[] = FONT_PAIRINGS.map(p => p.id)

/**
 * The CSS's own no-choice defaults — `porcelain` is the literal `:root`
 * block in `ruled_page.css` (a page with no `theme.palette` renders
 * byte-identical to one explicitly set to `porcelain`), and `classic` is
 * what an unset `data-font-pairing` renders as (the base `h1,h2,h3` rule,
 * which `classic`'s own pairing rule only adds one property on top of —
 * see that entry's own comment above). Used here purely as the CARD
 * PREVIEW's fallback surface/face when nothing is selected yet (the
 * wizard, before a tenant has touched either picker) — never written to
 * `theme` by this module itself; see `LandingOnboardingService::theme()`
 * for the (different, industry-aware) backend default actually stored.
 */
export const DEFAULT_PALETTE_ID: PaletteId = 'porcelain'
export const DEFAULT_FONT_PAIRING_ID: FontPairingId = 'classic'

/** The palette for `id`, or the no-choice default when `id` is absent or
 *  unrecognised — a card grid must always have SOMETHING to render the
 *  other axis's cards against. */
export function paletteFor(id: string | null | undefined): PaletteChoice {
  return PALETTES.find(p => p.id === id) ?? PALETTES.find(p => p.id === DEFAULT_PALETTE_ID)!
}

/** The pairing for `id`, or the no-choice default — same reasoning as
 *  `paletteFor` above. */
export function pairingFor(id: string | null | undefined): FontPairingChoice {
  return FONT_PAIRINGS.find(p => p.id === id) ?? FONT_PAIRINGS.find(p => p.id === DEFAULT_FONT_PAIRING_ID)!
}

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
 * recognisably the tenant's palette/accent instead of an alarming void.
 */
export function pickerSafeHex(value: string | null | undefined, fallback: string): string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback
}

/** What a caller hands `themePayload` — the same three loose, possibly-
 *  absent-or-invalid fields both screens work with before this function
 *  narrows them. */
export type ThemeInput = {
  palette?: string | null
  font_pairing?: string | null
  brand_color?: string | null
}

/**
 * `App\Landing\ThemeRules::keys()`'s own allowlist (`brand_color`,
 * `font_pairing`, `palette`), applied client-side before a theme patch ever
 * reaches `PUT /v1/admin/landing-pages` — belt-and-braces with the
 * backend's own refusal (`ThemeRules::validate()`'s unknown-key 422), not a
 * replacement for it. Three independent narrowings, one per key:
 *
 *   - `brand_color` is kept whenever it is a non-empty string — the
 *     backend's own rule is `nullable|string|max:32`, a length guard rather
 *     than a format one (`Accent::for()` re-validates the actual colour
 *     syntax at render time), so there is no format to check here either.
 *   - `font_pairing`/`palette` are each kept only when they are a string
 *     AND one of this module's own four/six ids — an unrecognised value
 *     (a hand-edited draft, a stale build's removed id) is DROPPED rather
 *     than sent, the same "narrow before it reaches the wire" discipline
 *     `mergeFormDraft` (landingDraft.ts) already applies to a restored
 *     wizard draft.
 *
 * A key whose value is missing, `null` or invalid is simply ABSENT from
 * the result — never sent as `''`/`null` — which is what lets the editor's
 * save path merge this into an existing `theme` object without erasing a
 * sibling key the tenant did not just touch (see `LandingEditor.tsx`'s own
 * `updateTheme`).
 */
export function themePayload(input: ThemeInput): Record<string, string> {
  const out: Record<string, string> = {}

  if (typeof input.brand_color === 'string' && input.brand_color !== '') {
    out.brand_color = input.brand_color
  }

  if (typeof input.font_pairing === 'string'
    && (FONT_PAIRING_IDS as string[]).includes(input.font_pairing)) {
    out.font_pairing = input.font_pairing
  }

  if (typeof input.palette === 'string'
    && (PALETTE_IDS as string[]).includes(input.palette)) {
    out.palette = input.palette
  }

  return out
}
