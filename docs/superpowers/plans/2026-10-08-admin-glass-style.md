# Admin Styles Part 1: Glass — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Glass becomes the default look of the signed-in HexaTech admin for every organisation, with a per-organisation
Style setting (Glass / Classic, Clean light shown as "Coming next"), while Classic stays exactly as today apart from the
agreed muted-text fix.

**Architecture:** A style is a set of CSS variables scoped to `:root[data-style="glass"][data-shell="admin"]`. Every
Tailwind colour token reads the style's variable first, then the organisation's inline palette (`--color-*`), then
today's literal, so Classic (no style variables) computes exactly as before and Glass is purely additive CSS. The theme
code keeps writing the palette in every style, adds brand-derived Glass extras (lifted text shades, glow colours, text
on brand fills) and the `data-style` attribute; the admin Layout marks `<html>` with `data-shell="admin"` while mounted.
Settings → Branding gets a Style row that saves `theme_style`, which the server validates.

**Tech Stack:** React 19 + TypeScript (strict, `verbatimModuleSyntax`, `erasableSyntaxOnly`), Vite 5, Tailwind 3.4.19
(config plugin), Vitest 2.1.9 in a node environment (no jsdom; components are tested with `renderToStaticMarkup` or by
calling hook-free components as functions), Laravel 13 / PHPUnit on sqlite in memory.

**Spec:** `docs/superpowers/specs/2026-10-08-admin-glass-style-design.md`. Read §4–§9 and the two §12 tables before
starting: §12's second table lists what the rehearsal of this plan changed (style layer instead of `removeProperty`,
fixed clean-up tokens, the fonts import, the measured colours).

Every front-end code block below was rehearsed on a copy of `main` (`3f8edcd18`): all new tests pass, `tsc -b` is
clean, the full suite shows only the 3 known `plannerMeta` failures, both scripts produce the counts quoted, and
`vite build` keeps the fonts import and the scoped rules. The PHP change (Task 6) was not rehearsed; it follows
`tests/Feature/Settings/CancellationHoursSettingsTest.php`, and Task 6 runs it red first.

## Global Constraints

- Classic renders exactly as today except muted text (`#636366` → `#8E8E93`); every new token's Classic value is the exact colour it replaces.
- Every Glass rule, written or generated, is scoped to `:root[data-style="glass"][data-shell="admin"]`; login, member portal, Appointments, the setup wizard and the live wall never get Glass.
- Glass text is at least 4.5:1 on every surface `src/theme/glassContrast.test.ts` measures (a 10 % card, an 18 % raised surface, a hover row in a card, each over the brightest glow); that test is the gate and may not be loosened. Deeper stacks are checked by eye in Task 10.
- `theme_style` accepts exactly `glass` or `classic` (case-sensitive). Anything else answers 422 with the message `theme_style must be glass or classic.` and saves nothing. No saved value means Glass.
- Default palette Royal blue `#3b82f6`: `DEFAULTS.primary_color`, `DEFAULT_PRESET = 'Royal Blue'`, the server's seeded `primary_color`, the Settings preview fallback. Saved palettes are untouched.
- No migration.
- No new raw hex colour classes (`[#…]`) in admin source. New components take colours from tokens; the Style picker's samples are the only inline hex.
- UI copy, exactly: Style card heading `Style`; its note `The look of the whole admin, for everyone in your organisation. Glass is the default; Classic is the original dark admin.`; preset card heading `Palette`; its note `In Glass a palette sets the brand colour. Its surfaces, text colours, fonts and corners apply in Classic.`; badge `Coming next`; undo toast `Back to Glass` / `Back to Classic`.
- PHP is `/c/wamp64/bin/php/php8.4.20/php.exe`. Never run a bare `artisan test` (it segfaults); always pass a file or directory.
- File edits: the Edit and Write tools. Node scripts only where this plan supplies them. No `sed`/`python` edits (CRLF and cp1252 hazards).
- Never commit `frontend/dist`, `public/spa` or `resources/spa-shell` on the feature branch. Never push the feature branch. Never push to `main` without the owner's explicit go-ahead in this conversation.
- Every commit message ends with a `Co-Authored-By` line for the model doing the work (this session: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`).
- Never print credential values. Report `ENOSPC` instead of deleting anything.

## Review Focus

The five failure modes most likely to bite someone using this, each pinned by a test in the task that owns the code:

1. **Glass's fonts never load in production.** The existing font imports follow the Tailwind rules, so the build drops them; Glass would show system fonts. Expected: Inter, Space Grotesk and JetBrains Mono load. Test: `glassCss.test.ts` "opens with the fonts import" (Task 5).
2. **Classic changes colour for organisations on a preset.** 13 of 14 presets set their own secondary text, accent, error and info colours; mapping hard-coded colours to palette tokens would recolour Classic. Expected: Classic identical except muted text. Test: `tailwindTokens.test.ts` "keeps every clean-up token at the exact colour it replaced" (Task 3).
3. **A Classic organisation opens in Glass on a new device.** An organisation with a saved Classic style but no saved palette gets a theme answer the old code ignored. Expected: the style switches. Tests: `useTheme.style.test.ts` `themeUpdateFor` "switches only the style" and `applyStyleOnly` (Task 4).
4. **Menus, modals and sticky table headers are see-through over busy content.** Expected: every surface a menu, popover, sticky header or modal panel uses gets the darker, blurred glass. Test: `glassCss.test.ts` "gives every overlay surface the darker, blurred glass" (Task 5), then every overlay opened once in Task 10.
5. **Text on the brighter glass surfaces drops under 4.5:1.** Text sits on hover rows and raised chips (white 18 %), not only on 7 % cards, and over the brightest glow. Expected: every text token and grey step passes there for every brand colour. Test: `glassContrast.test.ts` "text tokens and grey text read on the brightest surface" (Task 2).

---

## Environment (once, before Task 1)

The worktree exists: `C:\wamp64\www\Hexa-Tech-glass`, branch `feature/admin-glass-style`, cut from `origin/main` at
`3f8edcd18`, holding only the spec and this plan. It has no `vendor`, `node_modules` or `.env`.

- [ ] **E1. Check disk.** `df -h /c`. Under 5 GB free: stop and report.
- [ ] **E2. Front-end packages: a junction to the portal worktree's complete set** (it has `@stripe/*`; the main checkout's set lacks them):

```bash
cmd //c mklink //J "C:\\wamp64\\www\\Hexa-Tech-glass\\frontend\\node_modules" "C:\\wamp64\\www\\Hexa-Tech-portal\\frontend\\node_modules"
```

- [ ] **E3. Back-end packages: a real copy, never a junction** (a junctioned `vendor` makes PHPUnit test the main tree). All trees share the same `composer.lock`. In PowerShell:

```powershell
robocopy C:\wamp64\www\Hexa-Tech\vendor C:\wamp64\www\Hexa-Tech-glass\vendor /E /NFL /NDL /NJH /NJS /NP
```

Robocopy exit code 1 means "files copied" (success). Then rebuild the class map in Git Bash:

```bash
cd /c/wamp64/www/Hexa-Tech-glass && /c/wamp64/bin/php/php8.4.20/php.exe C:/ProgramData/ComposerSetup/bin/composer.phar dump-autoload -o
```

- [ ] **E4. Local env files** (git-ignored; never print or commit them):

```bash
cd /c/wamp64/www/Hexa-Tech-glass && cp ../Hexa-Tech/.env .env && cp ../Hexa-Tech/frontend/.env frontend/.env
```

- [ ] **E5. Tools folder** (`.superpowers/sdd/` is in the shared `.git/info/exclude`, so nothing here is committed):

```bash
mkdir -p /c/wamp64/www/Hexa-Tech-glass/.superpowers/sdd/2026-10-08-admin-glass-style/tools
```

- [ ] **E6. Baselines.** Expected: exactly 3 failures, all in `src/lib/plannerMeta.test.ts` (pre-existing, not ours), and the Settings PHP suite green.

```bash
cd /c/wamp64/www/Hexa-Tech-glass/frontend && npx tsc -b && npx vitest run
cd /c/wamp64/www/Hexa-Tech-glass && /c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Settings/
```

Read the `Tests:` summary lines yourself. Paths below are relative to `C:\wamp64\www\Hexa-Tech-glass` unless they
start with `/c/`. Front-end commands run in `frontend/`.

- [ ] **E7. Record the local theme rows** before any browser check writes to the shared local database (Tasks 5, 7
  and 10 switch styles on the demo organisation; Task 10 restores from this file):

```bash
cd /c/wamp64/www/Hexa-Tech-glass && /c/wamp64/bin/php/php8.4.20/php.exe artisan tinker --execute="echo json_encode(App\Models\HotelSetting::withoutGlobalScopes()->whereIn('key',['theme_style','theme_preset_name','theme_mood','primary_color'])->get(['id','organization_id','key','value']));" > .superpowers/sdd/2026-10-08-admin-glass-style/local-theme-before.json
```

## File map

| File | Task | Responsibility |
|---|---|---|
| `frontend/src/theme/colour.ts` | 1 | Pure colour maths: hex/RGB, WCAG contrast, blending, HSL, the palette's shade scale. |
| `frontend/src/theme/glassTokens.ts` | 2 | Every Glass value in one place (scope, surfaces, text, status, greys, hue shift, radius, fonts, glows, lift rules). |
| `frontend/src/theme/glass.ts` | 2 | Brand rules: glow colours, worst-case panel, lifted brand text, ink-or-white, the inline Glass variables. |
| `frontend/src/theme/__fixtures__/brandColours.ts` | 2 | Every brand colour the tests sweep. |
| `frontend/src/theme/glassVariables.ts` | 3 | Build-time: turns the tokens into the scoped variable blocks (pulls in Tailwind's colour table). |
| `frontend/tailwind.config.js` | 3 | Tokens read style → palette → literal; fixed clean-up tokens; the Glass plugin. |
| `frontend/src/hooks/useTheme.ts` | 4 | Writes palette + Glass extras + `data-style`; snapshot with style; first paint; server answers. |
| `frontend/src/theme/glass.css` | 5, 9 | Component rules: backdrop, shell, blur, cards, overlays, type, scrollbars, legacy surfaces, fallbacks. |
| `frontend/src/index.css` | 5, 9 | Fonts import first; local imports; mood rules guarded out of Glass. |
| `frontend/src/components/Layout.tsx` | 5 | `data-shell="admin"` while mounted; `hx-shell`, `hx-sidebar`, `hx-header` hooks. |
| `app/Http/Controllers/Api/V1/Admin/SettingsController.php` | 6 | `theme_style` filed under appearance, validated before any write; Royal-blue seed. |
| `frontend/src/theme/themeSettings.ts` | 7 | Settings helpers: hide bookkeeping keys, style names, the style save payload. |
| `frontend/src/components/settings/StylePicker.tsx` | 7 | The Style row: three cards with live samples. Hook-free. |
| `frontend/src/pages/Settings.tsx` | 7 | Style row, Palette heading and note, undo for styles, Royal-blue default. |
| `frontend/src/theme/rawColourRatchet.test.ts` | 8, 9 | Hard-coded colours in admin source may only go down. |
| `frontend/src/theme/legacySurfaces.css` | 9 | The old dark-green inline values as `--legacy-*` variables (Classic values). |
| 57 screen files; 25 screen files | 8; 9 | Mechanical clean-ups by the two scripts below. |

---

### Task 1: Colour maths

**Files:**
- Create: `frontend/src/theme/colour.ts`
- Test: `frontend/src/theme/colour.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (used by Tasks 2, 3, 4): `type RGB = [number, number, number]`, `type HSL`, `SHADES` (`50 … 900`), `type Shade`,
  `isHex(value: unknown): value is string`, `hexToRgb(hex: string): RGB` (invalid → `[0,0,0]`), `rgbToHex(rgb: RGB): string`
  (uppercase), `toTriplet(rgb: RGB): string` (`"R G B"`, rounded), `luminance(rgb)`, `contrast(a, b)`, `blend(top, alpha, under): RGB`,
  `rgbToHsl`, `hslToRgb`, `rotateHue(rgb, degrees): RGB`, `capLuminance(rgb, max): RGB`, `shadeScale(hex): Record<Shade, string>`.

- [ ] **Step 1: Write the failing test** — `frontend/src/theme/colour.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  blend, capLuminance, contrast, hexToRgb, isHex, luminance, rgbToHex, rotateHue, shadeScale, toTriplet,
} from './colour'

describe('hex and RGB', () => {
  it('parses six-digit, three-digit and #-less hex', () => {
    expect(hexToRgb('#3b82f6')).toEqual([59, 130, 246])
    expect(hexToRgb('#fff')).toEqual([255, 255, 255])
    expect(hexToRgb('c9a84c')).toEqual([201, 168, 76])
  })

  it('reads anything else as black and says it is not hex', () => {
    expect(hexToRgb('')).toEqual([0, 0, 0])
    expect(hexToRgb('#3b8')).toEqual([51, 187, 136])
    expect(isHex('')).toBe(false)
    expect(isHex('#3b82f6')).toBe(true)
    expect(isHex('blue')).toBe(false)
  })

  it('writes uppercase hex and R G B triplets', () => {
    expect(rgbToHex([59, 130, 246])).toBe('#3B82F6')
    expect(rgbToHex([300, -4, 12.6])).toBe('#FF000D')
    expect(toTriplet([28.08, 33.66, 47.61])).toBe('28 34 48')
  })
})

describe('contrast maths', () => {
  it('matches the WCAG reference points', () => {
    expect(luminance([255, 255, 255])).toBeCloseTo(1, 5)
    expect(contrast([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5)
  })

  it('measures the muted grey the clean-up replaces against the one it adopts', () => {
    const card = hexToRgb('#161616')
    expect(contrast(hexToRgb('#636366'), card)).toBeLessThan(3.2)
    expect(contrast(hexToRgb('#8E8E93'), card)).toBeGreaterThan(5.3)
  })

  it('blends a translucent colour over an opaque one', () => {
    const [r, g, b] = blend([255, 255, 255], 0.07, [11, 17, 32])
    expect(r).toBeCloseTo(28.08, 2)
    expect(g).toBeCloseTo(33.66, 2)
    expect(b).toBeCloseTo(47.61, 2)
  })
})

describe('hue and luminance shifts', () => {
  it('rotates the hue and keeps saturation and lightness', () => {
    expect(rotateHue([255, 0, 0], 120)).toEqual([0, 255, 0])
    expect(rotateHue([255, 0, 0], -120)).toEqual([0, 0, 255])
  })

  it('caps luminance by darkening, and leaves darker colours alone', () => {
    const capped = capLuminance(hexToRgb('#f5f5f5'), 0.25)
    expect(luminance(capped)).toBeLessThanOrEqual(0.25)
    expect(luminance(capped)).toBeGreaterThan(0.22)
    expect(capLuminance(hexToRgb('#3b82f6'), 0.25)).toEqual([59, 130, 246])
  })
})

describe('shadeScale', () => {
  it('produces exactly the shades the palette has always had', () => {
    expect(shadeScale('#c9a84c')).toEqual({
      50: '250 246 237',
      100: '244 238 219',
      200: '233 220 183',
      300: '220 198 139',
      400: '209 181 103',
      500: '201 168 76',
      600: '177 148 67',
      700: '151 126 57',
      800: '131 109 49',
      900: '111 92 42',
    })
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd /c/wamp64/www/Hexa-Tech-glass/frontend && npx vitest run src/theme/colour.test.ts`
Expected: FAIL, `Failed to resolve import "./colour"`.

- [ ] **Step 3: Implement** — `frontend/src/theme/colour.ts`:

```ts
/**
 * Colour maths for the admin styles: hex and RGB, WCAG luminance and
 * contrast, alpha blending, HSL shifts and the ten-step shade scale the
 * palette has always used. Pure functions, no DOM, so the theme code, the
 * Tailwind config and the contrast tests all share one implementation.
 */

export type RGB = [number, number, number]
export type HSL = [number, number, number]

export const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const
export type Shade = (typeof SHADES)[number]

/** True for `#rgb` / `#rrggbb` (the `#` optional). */
export function isHex(value: unknown): value is string {
  return typeof value === 'string' && /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim())
}

/** Parse `#rgb` or `#rrggbb` (with or without `#`). Anything else is black. */
export function hexToRgb(hex: string): RGB {
  let h = hex.trim().replace(/^#/, '')
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  if (!/^[0-9a-f]{6}$/i.test(h)) return [0, 0, 0]
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

export function rgbToHex([r, g, b]: RGB): string {
  const byte = (c: number) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0')
  return `#${byte(r)}${byte(g)}${byte(b)}`.toUpperCase()
}

/** `R G B`, the form every theme variable uses: rgb(var(--x) / <alpha>). */
export function toTriplet([r, g, b]: RGB): string {
  return `${Math.round(r)} ${Math.round(g)} ${Math.round(b)}`
}

/** WCAG 2 relative luminance. */
export function luminance([r, g, b]: RGB): number {
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** WCAG 2 contrast ratio, 1 to 21. */
export function contrast(a: RGB, b: RGB): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** `top` painted at `alpha` over the opaque `under`. */
export function blend(top: RGB, alpha: number, under: RGB): RGB {
  return [
    top[0] * alpha + under[0] * (1 - alpha),
    top[1] * alpha + under[1] * (1 - alpha),
    top[2] * alpha + under[2] * (1 - alpha),
  ]
}

/** Hue in degrees, saturation and lightness 0 to 1. */
export function rgbToHsl([r, g, b]: RGB): HSL {
  const R = r / 255
  const G = g / 255
  const B = b / 255
  const max = Math.max(R, G, B)
  const min = Math.min(R, G, B)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === R) h = (G - B) / d + (G < B ? 6 : 0)
  else if (max === G) h = (B - R) / d + 2
  else h = (R - G) / d + 4
  return [h * 60, s, l]
}

export function hslToRgb([h, s, l]: HSL): RGB {
  if (s === 0) return [l * 255, l * 255, l * 255]
  const hue = (((h % 360) + 360) % 360) / 360
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const channel = (t: number) => {
    const u = t < 0 ? t + 1 : t > 1 ? t - 1 : t
    if (u < 1 / 6) return p + (q - p) * 6 * u
    if (u < 1 / 2) return q
    if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6
    return p
  }
  return [channel(hue + 1 / 3) * 255, channel(hue) * 255, channel(hue - 1 / 3) * 255]
}

/** Same saturation and lightness, hue turned by `degrees`. */
export function rotateHue(rgb: RGB, degrees: number): RGB {
  const [h, s, l] = rgbToHsl(rgb)
  const [r, g, b] = hslToRgb([h + degrees, s, l])
  return [Math.round(r), Math.round(g), Math.round(b)]
}

/** Darken in 1 % steps until the relative luminance is at most `max`. */
export function capLuminance(rgb: RGB, max: number): RGB {
  let out = rgb
  for (let k = 100; k >= 0 && luminance(out) > max; k--) {
    out = [Math.round((rgb[0] * k) / 100), Math.round((rgb[1] * k) / 100), Math.round((rgb[2] * k) / 100)]
  }
  return out
}

/**
 * The ten shades every palette colour gets: 50 to 400 mix towards white,
 * 600 to 900 towards black. The arithmetic is the one useTheme has always
 * used, so Classic renders the same shades as before.
 */
export function shadeScale(hex: string): Record<Shade, string> {
  const [r, g, b] = hexToRgb(hex)
  const lighten = (pct: number) => (c: number) => Math.min(255, Math.round(c + (255 - c) * pct))
  const darken = (pct: number) => (c: number) => Math.max(0, Math.round(c * (1 - pct)))
  const at = (f: (c: number) => number) => `${f(r)} ${f(g)} ${f(b)}`
  return {
    50: at(lighten(0.9)),
    100: at(lighten(0.8)),
    200: at(lighten(0.6)),
    300: at(lighten(0.35)),
    400: at(lighten(0.15)),
    500: `${r} ${g} ${b}`,
    600: at(darken(0.12)),
    700: at(darken(0.25)),
    800: at(darken(0.35)),
    900: at(darken(0.45)),
  }
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/theme/colour.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-glass && git add frontend/src/theme/colour.ts frontend/src/theme/colour.test.ts && git commit -m "Colour maths for the admin styles" -m "Hex and RGB, WCAG contrast, blending, HSL shifts and the palette's shade scale in one pure module, so the theme code, the Tailwind config and the contrast tests share it." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Glass tokens, brand rules and the contrast guarantee

> **Amended during execution (ledger ruling, Task 2 fix round 1):** brand text is lifted against a 15 % tint over the
> 10 % card (`LIFT_PANEL_ALPHA` in glassTokens.ts), so the pinned values are `#93BAFA`, `#D7BF7B` and
> `'147 186 250'`; `glassContrast.test.ts` measures the card, the raised surface and a hover row in a card. The
> committed files are authoritative where the code blocks below differ.

**Files:**
- Create: `frontend/src/theme/glassTokens.ts`, `frontend/src/theme/glass.ts`, `frontend/src/theme/__fixtures__/brandColours.ts`
- Test: `frontend/src/theme/glass.test.ts`, `frontend/src/theme/glassContrast.test.ts`

**Interfaces:**
- Consumes (Task 1): `blend`, `capLuminance`, `contrast`, `hexToRgb`, `hslToRgb`, `luminance`, `rgbToHex`, `rgbToHsl`, `rotateHue`, `shadeScale`, `toTriplet`, `SHADES`, `type RGB`.
- Produces:
  - `glassTokens.ts`: `GLASS_SCOPE`, `GLASS_INK` (`'#0D1426'`), `GLASS_SURFACES`, `type SurfaceToken`, `GLASS_SOLID_SURFACES`, `GLASS_PANEL_ALPHA` (0.07), `GLASS_RAISED_ALPHA` (0.18), `GLASS_TEXT` (`primary, soft, secondary, muted`), `GLASS_STATUS_TEXT` (`accent, success, warning, error, danger, info, notice`), `type StatusToken`, `GREY_HUES`, `GREY_TEXT_SHADES`, `GLASS_GREY_TEXT`, `SHIFTED_HUES`, `COLOURED_TEXT_SHADES`, `GLASS_TEXT_SHIFT`, `GLASS_RADIUS`, `GLASS_THEME_RADIUS`, `GLASS_FONTS`, `GLOWS`, `GLOW_MAX_LUMINANCE`, `LIFT_TARGET`, `LIFT_TINT_ALPHA`, `ON_PRIMARY_INK` (`'#03050A'`).
  - `glass.ts`: `glowsFor(brandHex): [string, string, string]`, `worstGlassPanel(brandHex, alpha = 0.07): RGB`, `liftForGlass(brandHex): string`, `onColor(fillHex): string`, `brandGlassVariables(brandHex): Record<string, string>` (keys `--color-on-primary`, `--glass-primary-50 … 900`, `--glass-glow-1 … 3`).
  - `__fixtures__/brandColours.ts`: `BRAND_COLOURS`.

- [ ] **Step 1: Write the fixture** — `frontend/src/theme/__fixtures__/brandColours.ts`:

```ts
/**
 * Every brand colour an organisation is likely to have, for the Glass
 * contrast tests. Add a colour here when a new preset or industry ships.
 */
export const BRAND_COLOURS = [
  // Settings → Branding presets (pages/Settings.tsx PRESETS)
  '#c9a84c', '#3b82f6', '#10b981', '#e11d48', '#06b6d4', '#8b5cf6', '#f97316',
  '#16a34a', '#d4af37', '#64748b', '#14b8a6', '#9f1239', '#0ea5e9',
  // Member-app presets, which owners also type into the admin palette
  '#78716c', '#f5f5f5', '#c2410c',
  // Industry colours from signup (OrganizationSetupService::industryPrimaryColor)
  '#d96aa8', '#4a9fd8', '#d97742', '#7c6fd8', '#8a99b5', '#3fae8a', '#2a9db5', '#4c6ef5',
  // Edge cases: navy, pale yellow, black, white
  '#1e3a8a', '#fde68a', '#000000', '#ffffff',
] as const
```

- [ ] **Step 2: Write the failing tests** — `frontend/src/theme/glass.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { blend, contrast, hexToRgb, luminance, rgbToHex } from './colour'
import { brandGlassVariables, glowsFor, liftForGlass, onColor, worstGlassPanel } from './glass'
import { GLASS_INK, GLOW_MAX_LUMINANCE } from './glassTokens'
import { BRAND_COLOURS } from './__fixtures__/brandColours'

describe('glowsFor', () => {
  it('keeps the brand colour as the first glow when it is dark enough', () => {
    expect(glowsFor('#3b82f6')[0]).toBe('#3B82F6')
  })

  it('caps every glow, so a near-white brand cannot wash the panels out', () => {
    for (const brand of BRAND_COLOURS) {
      for (const glow of glowsFor(brand)) {
        expect(luminance(hexToRgb(glow)), `${brand} → ${glow}`).toBeLessThanOrEqual(GLOW_MAX_LUMINANCE)
      }
    }
  })
})

describe('worstGlassPanel', () => {
  it('is lighter than bare ink and than the plain 7 % panel', () => {
    const ink = hexToRgb(GLASS_INK)
    const plain = blend([255, 255, 255], 0.07, ink)
    const worst = worstGlassPanel('#3b82f6')
    expect(luminance(worst)).toBeGreaterThan(luminance(plain))
  })
})

describe('liftForGlass', () => {
  it('lifts Royal blue to a light blue and gold a little', () => {
    expect(liftForGlass('#3b82f6')).toBe('#89B4FA')
    expect(liftForGlass('#c9a84c')).toBe('#D2B76B')
  })

  it('leaves colours that already read alone', () => {
    expect(liftForGlass('#fde68a')).toBe('#FDE68A')
    expect(liftForGlass('#f5f5f5')).toBe('#F5F5F5')
  })

  it('makes every brand colour readable on its own tint over the worst panel', () => {
    for (const brand of BRAND_COLOURS) {
      const tint = blend(hexToRgb(brand), 0.15, worstGlassPanel(brand))
      expect(contrast(hexToRgb(liftForGlass(brand)), tint), brand).toBeGreaterThanOrEqual(4.5)
    }
  })
})

describe('onColor', () => {
  it('picks dark ink on light fills and white on dark fills', () => {
    expect(onColor('#3b82f6')).toBe('#03050A')
    expect(onColor('#fde68a')).toBe('#03050A')
    expect(onColor('#1e3a8a')).toBe('#FFFFFF')
  })

  it('gives button text at least 4.5:1 on every brand fill', () => {
    for (const brand of BRAND_COLOURS) {
      expect(contrast(hexToRgb(onColor(brand)), hexToRgb(brand)), brand).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('leaves no fill without readable text, across the whole grey ramp', () => {
    for (let v = 0; v <= 255; v++) {
      const fill = rgbToHex([v, v, v])
      expect(contrast(hexToRgb(onColor(fill)), [v, v, v]), fill).toBeGreaterThanOrEqual(4.5)
    }
  })
})

describe('brandGlassVariables', () => {
  it('writes on-primary, ten lifted text shades and three glows', () => {
    const vars = brandGlassVariables('#3b82f6')
    expect(vars['--color-on-primary']).toBe('3 5 10')
    expect(vars['--glass-primary-500']).toBe('137 180 250')
    expect(Object.keys(vars).filter(k => k.startsWith('--glass-primary-'))).toHaveLength(10)
    expect(vars['--glass-glow-1']).toBe('59 130 246')
    expect(vars['--glass-glow-3']).toBeDefined()
  })
})
```

And `frontend/src/theme/glassContrast.test.ts`:

```ts
import colors from 'tailwindcss/colors'
import { describe, expect, it } from 'vitest'
import { blend, contrast, hexToRgb, shadeScale, type RGB } from './colour'
import { liftForGlass, worstGlassPanel } from './glass'
import {
  COLOURED_TEXT_SHADES, GLASS_GREY_TEXT, GLASS_RAISED_ALPHA, GLASS_SOLID_SURFACES, GLASS_STATUS_TEXT, GLASS_TEXT,
  GLASS_TEXT_SHIFT, SHIFTED_HUES, type StatusToken,
} from './glassTokens'
import { BRAND_COLOURS } from './__fixtures__/brandColours'

/**
 * Glass text must read at 4.5:1 or better wherever it lands. Every check is
 * made at the lightest spot on the screen for that brand: a glass surface
 * over the brightest of its three backdrop glows (glass.ts worstGlassPanel).
 */
const FLOOR = 4.5
const rgb = (hex: string) => hexToRgb(hex)
const fromTriplet = (t: string): RGB => t.split(' ').map(Number) as RGB

/** The status fills text sits on as a 12 % tint (palette defaults and the fixed tokens). */
const STATUS_FILLS: Record<StatusToken, string> = {
  accent: '#32d74b',
  success: '#32d74b',
  warning: '#ffd60a',
  error: '#ff375f',
  danger: '#ff375f',
  info: '#0a84ff',
  notice: '#0a84ff',
}

describe.each(BRAND_COLOURS)('Glass contrast for brand %s', brand => {
  const panel = worstGlassPanel(brand)
  const raised = worstGlassPanel(brand, GLASS_RAISED_ALPHA)

  it('text tokens and grey text read on the brightest surface (dark-surface4)', () => {
    for (const [name, hex] of Object.entries({ ...GLASS_TEXT, ...GLASS_GREY_TEXT })) {
      expect(contrast(rgb(hex), raised), `${name} ${hex}`).toBeGreaterThanOrEqual(FLOOR)
    }
  })

  it('status text reads on its own 12 % tint', () => {
    for (const [name, hex] of Object.entries(GLASS_STATUS_TEXT)) {
      const tint = blend(rgb(STATUS_FILLS[name as StatusToken]), 0.12, panel)
      expect(contrast(rgb(hex), tint), name).toBeGreaterThanOrEqual(FLOOR)
    }
  })

  it('coloured text, one shade lighter, reads on the panel and on its own 15 % tint', () => {
    for (const hue of SHIFTED_HUES) {
      const tint = blend(rgb(colors[hue][500]), 0.15, panel)
      for (const shade of COLOURED_TEXT_SHADES) {
        const text = rgb(colors[hue][GLASS_TEXT_SHIFT[shade]])
        expect(contrast(text, panel), `${hue}-${shade} on panel`).toBeGreaterThanOrEqual(FLOOR)
        expect(contrast(text, tint), `${hue}-${shade} on tint`).toBeGreaterThanOrEqual(FLOOR)
      }
    }
  })

  it('brand text (lifted shades 300 to 500) reads on a 15 % brand tint', () => {
    const tint = blend(rgb(brand), 0.15, panel)
    const lifted = shadeScale(liftForGlass(brand))
    for (const shade of [300, 400, 500] as const) {
      expect(contrast(fromTriplet(lifted[shade]), tint), `primary-${shade}`).toBeGreaterThanOrEqual(FLOOR)
    }
  })
})

describe('Glass solid surfaces (reduced transparency, no blur)', () => {
  it('keep every text token and grey step readable on the lightest solid surface', () => {
    const lightest = rgb(GLASS_SOLID_SURFACES['dark-surface4'])
    for (const [name, hex] of Object.entries({ ...GLASS_TEXT, ...GLASS_GREY_TEXT })) {
      expect(contrast(rgb(hex), lightest), name).toBeGreaterThanOrEqual(FLOOR)
    }
  })
})
```

- [ ] **Step 3: Run them and watch them fail**

Run: `npx vitest run src/theme/glass.test.ts src/theme/glassContrast.test.ts`
Expected: FAIL, `Failed to resolve import "./glass"` (and `"./glassTokens"`).

- [ ] **Step 4: Implement the tokens** — `frontend/src/theme/glassTokens.ts`:

```ts
/**
 * Every value that makes the admin look like Glass, in one place. The
 * Tailwind plugin writes them into the stylesheet (glassVariables.ts), the
 * theme code reads the brand-colour rules (glass.ts), and the contrast test
 * measures them. Change a value here and all three follow.
 *
 * Glass applies only inside the signed-in admin: <html> carries
 * data-style="glass" from the theme code and data-shell="admin" while the
 * admin Layout is mounted. The login page, member portal and Appointments
 * workspace share <html> and never match this selector.
 */
export const GLASS_SCOPE = ':root[data-style="glass"][data-shell="admin"]'

/**
 * The backdrop's ink, the lightest stop of its gradient in glass.css
 * (#0B1120 → #0D1426 → #0A0F1C). Contrast is measured over it, so every
 * other part of the backdrop is at least as dark. glassCss.test.ts holds
 * the stylesheet to that.
 */
export const GLASS_INK = '#0D1426'

/**
 * Admin surface tokens in Glass, as colour plus opacity. The Tailwind
 * classes keep their names (bg-dark-surface, border-dark-border, …); only
 * the values change. panel, panel-dim, panel-raised and well are the greys
 * screens used to hard-code (#1e1e1e, #1a1a1a, #333, #111); Classic keeps
 * those exact values.
 */
export const GLASS_SURFACES = {
  'dark-bg': { rgb: '5 8 15', alpha: 0.55 },
  'dark-surface': { rgb: '255 255 255', alpha: 0.07 },
  'dark-surface2': { rgb: '255 255 255', alpha: 0.1 },
  'dark-card': { rgb: '255 255 255', alpha: 0.1 },
  'dark-surface3': { rgb: '255 255 255', alpha: 0.14 },
  'dark-hover': { rgb: '255 255 255', alpha: 0.14 },
  'dark-surface4': { rgb: '255 255 255', alpha: 0.18 },
  'dark-border': { rgb: '255 255 255', alpha: 0.14 },
  'dark-border2': { rgb: '255 255 255', alpha: 0.22 },
  panel: { rgb: '255 255 255', alpha: 0.1 },
  'panel-dim': { rgb: '255 255 255', alpha: 0.07 },
  'panel-raised': { rgb: '255 255 255', alpha: 0.18 },
  well: { rgb: '5 8 15', alpha: 0.55 },
} as const

export type SurfaceToken = keyof typeof GLASS_SURFACES

/** Opaque stand-ins for reduced transparency and browsers without blur. */
export const GLASS_SOLID_SURFACES: Record<SurfaceToken, string> = {
  'dark-bg': '#0B1120',
  'dark-surface': '#1A2233',
  'dark-surface2': '#20293C',
  'dark-card': '#20293C',
  'dark-surface3': '#283247',
  'dark-hover': '#283247',
  'dark-surface4': '#303B52',
  'dark-border': '#333F57',
  'dark-border2': '#404D68',
  panel: '#20293C',
  'panel-dim': '#1A2233',
  'panel-raised': '#303B52',
  well: '#0B1120',
}

/** The faintest panel text sits on: white at 7 % (dark-surface). */
export const GLASS_PANEL_ALPHA = GLASS_SURFACES['dark-surface'].alpha

/** The brightest surface text sits on: white at 18 % (dark-surface4). */
export const GLASS_RAISED_ALPHA = GLASS_SURFACES['dark-surface4'].alpha

/**
 * Text tokens, lightest first: t-primary, t-soft (the old hard-coded
 * #a0a0a0), t-secondary, t-muted (the old #636366).
 */
export const GLASS_TEXT = {
  primary: '#F3F6FB',
  soft: '#D3DAE5',
  secondary: '#C3CCD9',
  muted: '#C3CCD9',
} as const

/**
 * Status colours as text. Fills keep the palette's colours (and the fixed
 * success / danger / notice values); only text uses read these.
 */
export const GLASS_STATUS_TEXT = {
  accent: '#8EF0B6',
  success: '#8EF0B6',
  warning: '#FCD58E',
  error: '#FFC9D3',
  danger: '#FFC9D3',
  info: '#C3DEFF',
  notice: '#C3DEFF',
} as const

export type StatusToken = keyof typeof GLASS_STATUS_TEXT

/** Hard-coded grey text keeps its order but every step passes on glass. */
export const GREY_HUES = ['gray', 'slate'] as const
export const GREY_TEXT_SHADES = [300, 400, 500, 600] as const
export const GLASS_GREY_TEXT = {
  300: '#E2E8F0',
  400: '#D3DAE5',
  500: '#C8D0DD',
  600: '#C3CCD9',
} as const

/** Coloured text (text-red-400, text-emerald-300 …) shows lighter in Glass. */
export const SHIFTED_HUES = [
  'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan',
  'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose',
] as const
export const COLOURED_TEXT_SHADES = [100, 200, 300, 400, 500] as const
export const GLASS_TEXT_SHIFT = {
  100: 50,
  200: 100,
  300: 200,
  400: 300,
  500: 300,
} as const satisfies Record<(typeof COLOURED_TEXT_SHADES)[number], 50 | 100 | 200 | 300>

/** Tailwind's corner scale in Glass. rounded-sm and rounded-full stay. */
export const GLASS_RADIUS = {
  md: '8px',
  lg: '12px',
  xl: '16px',
  '2xl': '20px',
  '3xl': '24px',
} as const

/** The mood radius variables (--theme-radius-*) that 34 screens read. */
export const GLASS_THEME_RADIUS = {
  tight: '8px',
  base: '12px',
  card: '20px',
} as const

export const GLASS_FONTS = {
  body: "'Inter', system-ui, sans-serif",
  display: "'Space Grotesk', 'Inter', sans-serif",
} as const

/** The three backdrop glows: the brand colour and two companions. */
export const GLOWS = [
  { rotate: 0, alpha: 0.18 },
  { rotate: 40, alpha: 0.16 },
  { rotate: -60, alpha: 0.14 },
] as const

/** Glow colours are darkened to at most this luminance (near-white brands). */
export const GLOW_MAX_LUMINANCE = 0.25

/** Brand text is lifted until it reaches this ratio on a brand tint. */
export const LIFT_TARGET = 4.6
export const LIFT_TINT_ALPHA = 0.15

/**
 * Dark text for light brand fills. Its luminance is under 0.00185, which
 * guarantees that ink or white reaches 4.5:1 on ANY fill: ink passes from
 * fill luminance 0.175 + 4.5 × 0.00185 ≈ 0.1833 up, white below 0.1833.
 * A lighter ink leaves a band of mid colours (the Services indigo #4c6ef5)
 * where neither passes.
 */
export const ON_PRIMARY_INK = '#03050A'
```

- [ ] **Step 5: Implement the brand rules** — `frontend/src/theme/glass.ts`:

```ts
import {
  SHADES, blend, capLuminance, contrast, hexToRgb, hslToRgb, luminance, rgbToHex, rgbToHsl, rotateHue,
  shadeScale, toTriplet, type RGB,
} from './colour'
import {
  GLASS_INK, GLASS_PANEL_ALPHA, GLOWS, GLOW_MAX_LUMINANCE, LIFT_TARGET, LIFT_TINT_ALPHA, ON_PRIMARY_INK,
} from './glassTokens'

const WHITE: RGB = [255, 255, 255]

/** The three backdrop glow colours for a brand: hue-rotated, then capped. */
export function glowsFor(brandHex: string): [string, string, string] {
  const brand = hexToRgb(brandHex)
  const [first, second, third] = GLOWS.map(glow =>
    rgbToHex(capLuminance(rotateHue(brand, glow.rotate), GLOW_MAX_LUMINANCE)),
  )
  return [first, second, third]
}

/**
 * The lightest spot text can land on: a glass surface (white at `alpha`)
 * over the brightest of the brand's three glows. Light text has the least
 * contrast there, so every Glass contrast rule is measured on it.
 */
export function worstGlassPanel(brandHex: string, alpha: number = GLASS_PANEL_ALPHA): RGB {
  const ink = hexToRgb(GLASS_INK)
  const glowSpots = glowsFor(brandHex).map((hex, i) => blend(hexToRgb(hex), GLOWS[i].alpha, ink))
  const brightest = glowSpots.reduce((a, b) => (luminance(b) > luminance(a) ? b : a))
  return blend(WHITE, alpha, brightest)
}

/**
 * The brand colour as Glass text. Lightness rises in 2 % steps until the
 * colour reaches LIFT_TARGET on a 15 % brand tint over the worst panel (the
 * darkest place brand text sits, relative to itself). Colours that already
 * pass come back unchanged.
 */
export function liftForGlass(brandHex: string): string {
  const brand = hexToRgb(brandHex)
  const tint = blend(brand, LIFT_TINT_ALPHA, worstGlassPanel(brandHex))
  const [h, s, start] = rgbToHsl(brand)
  let lifted: RGB = brand
  for (let l = start; contrast(lifted, tint) < LIFT_TARGET && l < 0.97; ) {
    l = Math.min(0.97, l + 0.02)
    const [r, g, b] = hslToRgb([h, s, l])
    lifted = [Math.round(r), Math.round(g), Math.round(b)]
  }
  return rgbToHex(lifted)
}

/** Dark ink or white, whichever reads better on a fill of `fillHex`. */
export function onColor(fillHex: string): string {
  const fill = hexToRgb(fillHex)
  return contrast(hexToRgb(ON_PRIMARY_INK), fill) >= contrast(WHITE, fill) ? ON_PRIMARY_INK : '#FFFFFF'
}

/**
 * The inline variables the theme code writes for a brand colour, in every
 * style: text on brand fills, the lifted text shades and the glow colours.
 * Only Glass's stylesheet reads the --glass-* ones, so Classic is untouched.
 */
export function brandGlassVariables(brandHex: string): Record<string, string> {
  const vars: Record<string, string> = { '--color-on-primary': toTriplet(hexToRgb(onColor(brandHex))) }
  const lifted = shadeScale(liftForGlass(brandHex))
  for (const shade of SHADES) vars[`--glass-primary-${shade}`] = lifted[shade]
  glowsFor(brandHex).forEach((hex, i) => {
    vars[`--glass-glow-${i + 1}`] = toTriplet(hexToRgb(hex))
  })
  return vars
}
```

- [ ] **Step 6: Run them and watch them pass**

Run: `npx vitest run src/theme/glass.test.ts src/theme/glassContrast.test.ts`
Expected: PASS (glass: 10 tests; contrast: 113 tests, 4 per brand colour plus 1).
If a contrast test fails, the token values are wrong, not the test: fix the value in `glassTokens.ts`. Never lower `FLOOR`.

- [ ] **Step 7: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-glass && git add frontend/src/theme/glassTokens.ts frontend/src/theme/glass.ts frontend/src/theme/__fixtures__/brandColours.ts frontend/src/theme/glass.test.ts frontend/src/theme/glassContrast.test.ts && git commit -m "Glass tokens, brand rules and the contrast guarantee" -m "Every Glass value lives in glassTokens.ts. glass.ts derives the glows, the lifted brand text and the ink-or-white button text from any brand colour; the contrast test holds all Glass text to 4.5:1 over the brightest glow for every preset, industry and edge-case colour." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Tailwind tokens and the generated Glass variables

**Files:**
- Create: `frontend/src/theme/glassVariables.ts`
- Modify: `frontend/tailwind.config.js` (whole file below)
- Test: `frontend/src/theme/tailwindTokens.test.ts`

**Interfaces:**
- Consumes (Tasks 1–2): `SHADES`, `hexToRgb`, `toTriplet`; the `glassTokens.ts` exports.
- Produces:
  - Tailwind classes (Task 8 uses them): `t-soft`, `panel`, `panel-dim`, `panel-raised`, `well`, `success`, `danger`, `notice`, `on-primary`; `t-muted` now a text grey.
  - CSS variables the tokens read (Tasks 4–5 rely on them): `--style-<token>` and `--alpha-<token>` (surfaces), `--style-text-<primary|soft|secondary|muted>`, `--tc-<accent|success|warning|error|danger|info|notice>`, `--tc-primary-<shade>` (Glass sets it to `var(--glass-primary-<shade>)`), `--tc-<hue>-<shade>`, `--radius-<md…3xl>`, `--glass-glow-alpha-1…3`.
  - `glassVariables(): Record<string, string>`, `glassSolidVariables(): Record<string, string>`, `shiftedTextColour(hue, shade): string`.

- [ ] **Step 1: Write the failing test** — `frontend/src/theme/tailwindTokens.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
// @ts-ignore -- tailwind.config.js is plain JS outside the app's tsconfig
import config from '../../tailwind.config.js'
import { GLASS_SCOPE } from './glassTokens'

type Block = Record<string, string>

/** Run the config's Glass plugin and collect what it adds to the base layer. */
function glassBase(): Record<string, Block | Record<string, Block>> {
  let base: Record<string, Block | Record<string, Block>> = {}
  for (const p of config.plugins) p.handler({ addBase: (b: typeof base) => { base = { ...base, ...b } } })
  return base
}

const extend = config.theme.extend

describe('Tailwind tokens in Classic', () => {
  it('fall back to exactly the values Classic used before', () => {
    expect(extend.colors.primary[500]).toBe('rgb(var(--color-primary-500, 201 168 76) / <alpha-value>)')
    expect(extend.colors.dark.surface).toBe(
      'rgb(var(--style-dark-surface, var(--color-dark-surface, 22 22 22)) / calc(var(--alpha-dark-surface, 1) * <alpha-value>))',
    )
    expect(extend.textColor.red[400]).toBe('rgb(var(--tc-red-400, 248 113 113) / <alpha-value>)')
    expect(extend.textColor.gray[500]).toBe('rgb(var(--tc-gray-500, 107 114 128) / <alpha-value>)')
    expect(extend.textColor.success).toBe('rgb(var(--tc-success, 50 215 75) / <alpha-value>)')
    expect(extend.colors.success).toBe('rgb(50 215 75 / <alpha-value>)')
    expect(extend.borderRadius.xl).toBe('var(--radius-xl, 0.75rem)')
  })

  it('keeps every clean-up token at the exact colour it replaced, whatever the palette', () => {
    const greys: Record<string, string> = { panel: '30 30 30', 'panel-dim': '26 26 26', 'panel-raised': '51 51 51', well: '17 17 17' }
    for (const [name, rgb] of Object.entries(greys)) {
      expect(extend.colors[name]).toBe(`rgb(var(--style-${name}, ${rgb}) / calc(var(--alpha-${name}, 1) * <alpha-value>))`)
    }
    expect(extend.colors['t-soft']).toBe('rgb(var(--style-text-soft, 160 160 160) / <alpha-value>)')
    const status: Record<string, string> = { success: '50 215 75', danger: '255 55 95', notice: '10 132 255' }
    for (const [name, rgb] of Object.entries(status)) {
      expect(extend.colors[name]).toBe(`rgb(${rgb} / <alpha-value>)`)
      expect(extend.textColor[name]).toBe(`rgb(var(--tc-${name}, ${rgb}) / <alpha-value>)`)
    }
  })
})

describe('the Glass variable block', () => {
  const block = glassBase()[GLASS_SCOPE] as Block

  it('is scoped to the signed-in admin and sets the Glass values', () => {
    expect(block['--style-dark-surface']).toBe('255 255 255')
    expect(block['--alpha-dark-surface']).toBe('0.07')
    expect(block['--tc-primary-400']).toBe('var(--glass-primary-400)')
    expect(block['--tc-red-400']).toBe('252 165 165')
    expect(block['--tc-indigo-500']).toBe('165 180 252')
    expect(block['--tc-gray-500']).toBe('200 208 221')
    expect(block['--radius-xl']).toBe('16px')
  })

  it('defines every style variable the tokens read (no typo leaves a token on Classic)', () => {
    const source = JSON.stringify({ colors: extend.colors, textColor: extend.textColor, placeholderColor: extend.placeholderColor })
    const read = new Set([...source.matchAll(/var\((--(?:style|tc)-[a-z0-9-]+)/g)].map(m => m[1]))
    expect(read.size).toBeGreaterThan(100)
    for (const name of read) expect(block[name], name).toBeDefined()
  })

  it('has solid stand-ins for reduced transparency and no blur', () => {
    const base = glassBase()
    const reduced = base['@media (prefers-reduced-transparency: reduce)'] as Record<string, Block>
    expect(reduced[GLASS_SCOPE]['--alpha-dark-surface']).toBe('1')
    expect(reduced[GLASS_SCOPE]['--style-dark-surface']).toBe('26 34 51')
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/theme/tailwindTokens.test.ts`
Expected: FAIL on the Classic assertions (the old config has no `--style-` layer and no `success`/`panel` tokens) and `TypeError: Cannot read properties of undefined` in the block tests (the old config has no plugin).

- [ ] **Step 3: Write the variable builder** — `frontend/src/theme/glassVariables.ts`:

```ts
import colors from 'tailwindcss/colors'
import { SHADES, hexToRgb, toTriplet } from './colour'
import {
  COLOURED_TEXT_SHADES, GLASS_FONTS, GLASS_GREY_TEXT, GLASS_RADIUS, GLASS_SOLID_SURFACES, GLASS_STATUS_TEXT,
  GLASS_SURFACES, GLASS_TEXT, GLASS_TEXT_SHIFT, GLASS_THEME_RADIUS, GLOWS, GREY_HUES, GREY_TEXT_SHADES,
  SHIFTED_HUES,
} from './glassTokens'

/*
 * Build-time only: tailwind.config.js turns these maps into the Glass
 * variable blocks. Kept out of the runtime bundle because it pulls in
 * Tailwind's colour table.
 */

const triplet = (hex: string) => toTriplet(hexToRgb(hex))

/** Coloured text one shade lighter, as `R G B` (text-red-400 → red-300). */
export function shiftedTextColour(hue: (typeof SHIFTED_HUES)[number], shade: (typeof COLOURED_TEXT_SHADES)[number]): string {
  return triplet(colors[hue][GLASS_TEXT_SHIFT[shade]])
}

/** The Glass variable block: surfaces, text, brand text, radius and type. */
export function glassVariables(): Record<string, string> {
  const vars: Record<string, string> = {}
  for (const [name, { rgb, alpha }] of Object.entries(GLASS_SURFACES)) {
    vars[`--style-${name}`] = rgb
    vars[`--alpha-${name}`] = String(alpha)
  }
  for (const [name, hex] of Object.entries(GLASS_TEXT)) vars[`--style-text-${name}`] = triplet(hex)
  for (const [name, hex] of Object.entries(GLASS_STATUS_TEXT)) vars[`--tc-${name}`] = triplet(hex)
  // The lifted brand shades are written inline by the theme code (they
  // depend on the organisation's colour); Glass points brand text at them.
  for (const shade of SHADES) vars[`--tc-primary-${shade}`] = `var(--glass-primary-${shade})`
  for (const hue of GREY_HUES) {
    for (const shade of GREY_TEXT_SHADES) vars[`--tc-${hue}-${shade}`] = triplet(GLASS_GREY_TEXT[shade])
  }
  for (const hue of SHIFTED_HUES) {
    for (const shade of COLOURED_TEXT_SHADES) vars[`--tc-${hue}-${shade}`] = shiftedTextColour(hue, shade)
  }
  // Glow strengths for the backdrop in glass.css; the colours come inline
  // from the theme code (--glass-glow-1..3).
  GLOWS.forEach((glow, i) => {
    vars[`--glass-glow-alpha-${i + 1}`] = String(glow.alpha)
  })
  for (const [step, value] of Object.entries(GLASS_RADIUS)) vars[`--radius-${step}`] = value
  for (const [step, value] of Object.entries(GLASS_THEME_RADIUS)) vars[`--theme-radius-${step}`] = value
  vars['--theme-font-body'] = GLASS_FONTS.body
  vars['--theme-font-display'] = GLASS_FONTS.display
  vars['--theme-letter-spacing'] = '0'
  return vars
}

/** Opaque surfaces, for reduced transparency and browsers without blur. */
export function glassSolidVariables(): Record<string, string> {
  const vars: Record<string, string> = {}
  for (const [name, hex] of Object.entries(GLASS_SOLID_SURFACES)) {
    vars[`--style-${name}`] = triplet(hex)
    vars[`--alpha-${name}`] = '1'
  }
  return vars
}
```

- [ ] **Step 4: Replace `frontend/tailwind.config.js`** (the `p` and `a` blocks are copied unchanged from the current file):

```js
import colors from 'tailwindcss/colors'
import plugin from 'tailwindcss/plugin'
import {
  COLOURED_TEXT_SHADES, GLASS_SCOPE, GREY_HUES, GREY_TEXT_SHADES, SHIFTED_HUES,
} from './src/theme/glassTokens.ts'
import { glassSolidVariables, glassVariables } from './src/theme/glassVariables.ts'

/*
 * Admin colour tokens read three layers; the first one that is set wins:
 *   1. --style-* (the whole token) or --tc-* (text uses only): set by the
 *      active style's stylesheet block. Only Glass sets them, and only inside
 *      the signed-in admin (GLASS_SCOPE in src/theme/glassTokens.ts).
 *   2. --color-*: the organisation's palette, written inline on <html> by
 *      hooks/useTheme.ts in every style.
 *   3. The literal: today's Classic default.
 * Classic sets no layer-1 variable, so it renders exactly as before.
 */
const triplet = hex => {
  const h = hex.replace('#', '')
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)).join(' ')
}

/** A palette surface: style value, then palette value, each with its own opacity. */
const surface = (name, fallback) =>
  `rgb(var(--style-${name}, var(--color-${name}, ${fallback})) / calc(var(--alpha-${name}, 1) * <alpha-value>))`

/** A grey screens used to hard-code: its exact value in Classic, a style may replace it. */
const fixed = (name, value) =>
  `rgb(var(--style-${name}, ${value}) / calc(var(--alpha-${name}, 1) * <alpha-value>))`

/** A palette text colour the style can replace outright. */
const text = (name, fallback) =>
  `rgb(var(--style-${name}, var(--color-${name}, ${fallback})) / <alpha-value>)`

/** A colour whose TEXT uses the style can swap, leaving fills alone. */
const textOnly = (name, fallback) => `rgb(var(--tc-${name}, ${fallback}) / <alpha-value>)`

const PRIMARY = {
  50: '253 248 235', 100: '249 237 204', 200: '230 213 152', 300: '217 194 114', 400: '212 182 92',
  500: '201 168 76', 600: '184 149 63', 700: '154 122 48', 800: '131 109 49', 900: '107 84 32',
}
const primaryFill = Object.fromEntries(
  Object.entries(PRIMARY).map(([shade, fallback]) => [shade, `rgb(var(--color-primary-${shade}, ${fallback}) / <alpha-value>)`]),
)
const primaryText = Object.fromEntries(
  Object.entries(PRIMARY).map(([shade, fallback]) => [shade, textOnly(`primary-${shade}`, `var(--color-primary-${shade}, ${fallback})`)]),
)

/** text-red-400 and friends: Tailwind's own value in Classic, a lighter shade in Glass. */
const textScale = (hues, shades) => Object.fromEntries(
  hues.map(hue => [hue, Object.fromEntries(shades.map(shade => [shade, textOnly(`${hue}-${shade}`, triplet(colors[hue][shade]))]))]),
)
const shiftedText = textScale(SHIFTED_HUES, COLOURED_TEXT_SHADES)
const greyText = textScale(GREY_HUES, GREY_TEXT_SHADES)

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Fills (bg-, border-, ring-) keep the brand's own shades in every
        // style; text-primary-* is in textColor below.
        primary: primaryFill,
        dark: {
          bg:       surface('dark-bg', '13 13 13'),
          surface:  surface('dark-surface', '22 22 22'),
          surface2: surface('dark-surface2', '30 30 30'),
          surface3: surface('dark-surface3', '38 38 38'),
          surface4: surface('dark-surface4', '46 46 46'),
          // `card` and `hover` were used by 28 class names across the chatbot
          // and analytics screens but were never defined here, so Tailwind
          // generated nothing for them and those cards rendered with NO
          // background — which is why that part of the product looked like a
          // second, flatter design language rather than a styling choice.
          card:     surface('dark-card', '30 30 30'),
          hover:    surface('dark-hover', '38 38 38'),
          border:   surface('dark-border', '44 44 44'),
          border2:  surface('dark-border2', '56 56 56'),
        },
        // The greys screens used to hard-code, as tokens. They never followed
        // the palette, so Classic keeps each exact value.
        panel:          fixed('panel', '30 30 30'),         // was bg-[#1e1e1e]
        'panel-dim':    fixed('panel-dim', '26 26 26'),     // was bg-[#1a1a1a]
        'panel-raised': fixed('panel-raised', '51 51 51'),  // was bg-[#333]
        well:           fixed('well', '17 17 17'),           // was bg-[#111]
        't-primary':   text('text-primary', '255 255 255'),
        't-secondary': text('text-secondary', '142 142 147'),
        't-soft':      'rgb(var(--style-text-soft, 160 160 160) / <alpha-value>)', // was text-[#a0a0a0]
        // Muted text: was #636366 (3.0:1 on a card), now the t-secondary grey (5.4:1).
        't-muted':     'rgb(var(--style-text-muted, 142 142 147) / <alpha-value>)',
        // Text on a brand fill: ink or white, whichever reads (theme/glass.ts onColor).
        'on-primary':  'rgb(var(--color-on-primary, 3 5 10) / <alpha-value>)',
        accent:        'rgb(var(--color-accent, 50 215 75) / <alpha-value>)',
        error:         'rgb(var(--color-error, 255 55 95) / <alpha-value>)',
        warning:       'rgb(var(--color-warning, 255 214 10) / <alpha-value>)',
        info:          'rgb(var(--color-info, 10 132 255) / <alpha-value>)',
        // The fixed status colours screens used to hard-code ([#32d74b],
        // [#ff375f], [#0a84ff]). Unlike accent/error/info they ignore the
        // palette, so Classic keeps the exact old colours.
        success:       'rgb(50 215 75 / <alpha-value>)',
        danger:        'rgb(255 55 95 / <alpha-value>)',
        notice:        'rgb(10 132 255 / <alpha-value>)',
        // Member portal tokens — see src/portal/theme/portal.css. Only
        // frontend/src/portal uses these; the sweep test forbids the reverse.
        p: {
          bg:            'rgb(var(--p-bg) / <alpha-value>)',
          surface:       'rgb(var(--p-surface) / <alpha-value>)',
          'surface-2':   'rgb(var(--p-surface-2) / <alpha-value>)',
          text:          'rgb(var(--p-text) / <alpha-value>)',
          'text-2':      'rgb(var(--p-text-2) / <alpha-value>)',
          border:        'rgb(var(--p-border) / <alpha-value>)',
          accent:        'rgb(var(--p-accent) / <alpha-value>)',
          'accent-ink':  'rgb(var(--p-accent-ink) / <alpha-value>)',
          'accent-deep': 'rgb(var(--p-accent-deep) / <alpha-value>)',
          success:       'rgb(var(--p-success) / <alpha-value>)',
          warning:       'rgb(var(--p-warning) / <alpha-value>)',
          danger:        'rgb(var(--p-danger) / <alpha-value>)',
          scrim:         'rgb(var(--p-scrim) / <alpha-value>)',
        },
        // Appointments workspace tokens — see src/appointments/theme/appointments.css.
        // Only frontend/src/appointments uses these; its sweep test forbids the reverse.
        a: {
          canvas:         'rgb(var(--a-canvas) / <alpha-value>)',
          surface:        'rgb(var(--a-surface) / <alpha-value>)',
          'surface-2':    'rgb(var(--a-surface-2) / <alpha-value>)',
          text:           'rgb(var(--a-text) / <alpha-value>)',
          'text-2':       'rgb(var(--a-text-2) / <alpha-value>)',
          border:         'rgb(var(--a-border) / <alpha-value>)',
          side:           'rgb(var(--a-side) / <alpha-value>)',
          'side-2':       'rgb(var(--a-side-2) / <alpha-value>)',
          'side-text':    'rgb(var(--a-side-text) / <alpha-value>)',
          'side-text-2':  'rgb(var(--a-side-text-2) / <alpha-value>)',
          accent:         'rgb(var(--a-accent) / <alpha-value>)',
          'accent-ink':   'rgb(var(--a-accent-ink) / <alpha-value>)',
          'accent-deep':  'rgb(var(--a-accent-deep) / <alpha-value>)',
          danger:         'rgb(var(--a-danger) / <alpha-value>)',
          'st-pending':   'rgb(var(--a-st-pending) / <alpha-value>)',
          'st-confirmed': 'rgb(var(--a-st-confirmed) / <alpha-value>)',
          'st-progress':  'rgb(var(--a-st-progress) / <alpha-value>)',
          'st-completed': 'rgb(var(--a-st-completed) / <alpha-value>)',
          'st-cancelled': 'rgb(var(--a-st-cancelled) / <alpha-value>)',
          'st-noshow':    'rgb(var(--a-st-noshow) / <alpha-value>)',
        },
      },
      textColor: {
        primary: primaryText,
        accent:  textOnly('accent', 'var(--color-accent, 50 215 75)'),
        error:   textOnly('error', 'var(--color-error, 255 55 95)'),
        warning: textOnly('warning', 'var(--color-warning, 255 214 10)'),
        info:    textOnly('info', 'var(--color-info, 10 132 255)'),
        success: textOnly('success', '50 215 75'),
        danger:  textOnly('danger', '255 55 95'),
        notice:  textOnly('notice', '10 132 255'),
        ...shiftedText,
        ...greyText,
      },
      placeholderColor: greyText,
      borderRadius: {
        // Tailwind's own sizes, routed through variables a style can set.
        md:    'var(--radius-md, 0.375rem)',
        lg:    'var(--radius-lg, 0.5rem)',
        xl:    'var(--radius-xl, 0.75rem)',
        '2xl': 'var(--radius-2xl, 1rem)',
        '3xl': 'var(--radius-3xl, 1.5rem)',
        'p-card':    'var(--p-radius-card)',
        'p-control': 'var(--p-radius-control)',
      },
      boxShadow: {
        p: 'var(--p-shadow)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        'p-display': ['var(--p-font-display)'],
        'p-body': ['var(--p-font-body)'],
      },
    },
  },
  plugins: [
    // The Glass variable blocks, generated from src/theme/glassTokens.ts.
    plugin(({ addBase }) => {
      addBase({
        [GLASS_SCOPE]: glassVariables(),
        '@media (prefers-reduced-transparency: reduce)': { [GLASS_SCOPE]: glassSolidVariables() },
        '@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))': {
          [GLASS_SCOPE]: glassSolidVariables(),
        },
      })
    }),
  ],
}
```

- [ ] **Step 5: Run it and watch it pass, then check the generated CSS**

Run: `npx vitest run src/theme/tailwindTokens.test.ts`
Expected: PASS, 5 tests.

Then confirm Tailwind compiles the classes the way the tests assume (scratch files, deleted afterwards):

```bash
cd /c/wamp64/www/Hexa-Tech-glass/frontend && mkdir -p ../.superpowers/sdd/2026-10-08-admin-glass-style/probe && printf '%s\n' '<div class="text-primary-400 bg-dark-surface/50 text-red-400 bg-red-400 text-gray-500 rounded-xl bg-panel text-success bg-success/15"></div>' > ../.superpowers/sdd/2026-10-08-admin-glass-style/probe/index.html && printf '@tailwind base;\n@tailwind utilities;\n' > ../.superpowers/sdd/2026-10-08-admin-glass-style/probe/in.css && npx tailwindcss -c tailwind.config.js --content ../.superpowers/sdd/2026-10-08-admin-glass-style/probe/index.html -i ../.superpowers/sdd/2026-10-08-admin-glass-style/probe/in.css -o ../.superpowers/sdd/2026-10-08-admin-glass-style/probe/out.css && grep -A2 -E '^\.(text-primary-400|bg-red-400|text-red-400) ' ../.superpowers/sdd/2026-10-08-admin-glass-style/probe/out.css && grep -c 'data-style="glass"' ../.superpowers/sdd/2026-10-08-admin-glass-style/probe/out.css
```

Expected: `.text-primary-400` reads `rgb(var(--tc-primary-400, var(--color-primary-400, 212 182 92)) / var(--tw-text-opacity, 1))`;
`.bg-red-400` is still `rgb(248 113 113 / …)` (fills untouched); `.text-red-400` reads `--tc-red-400`; the scope appears 3 times.
Then delete the scratch files: `rm -rf ../.superpowers/sdd/2026-10-08-admin-glass-style/probe`.

- [ ] **Step 6: Typecheck and run the whole front-end suite** (the token rewrite touches every screen's CSS)

Run: `npx tsc -b && npx vitest run`
Expected: only the 3 `plannerMeta` failures.

- [ ] **Step 7: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-glass && git add frontend/src/theme/glassVariables.ts frontend/tailwind.config.js frontend/src/theme/tailwindTokens.test.ts && git commit -m "Tailwind tokens read a style layer before the palette" -m "Every admin colour token now reads --style-*/--tc-* first, then the palette, then today's literal, so Classic computes as before and Glass is additive. Adds fixed tokens for the colours screens hard-code (t-soft, panel, panel-dim, panel-raised, well, success, danger, notice), the on-primary token, variable corners, and a plugin that generates the scoped Glass variables from glassTokens.ts." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Theme code — style, Glass extras, snapshot, server answers

**Files:**
- Modify: `frontend/src/hooks/useTheme.ts` (whole file below)
- Test: `frontend/src/hooks/useTheme.style.test.ts`

**Interfaces:**
- Consumes: `SHADES`, `hexToRgb`, `isHex`, `shadeScale`, `toTriplet` (Task 1); `brandGlassVariables` (Task 2).
- Produces (Task 7 uses these):
  - `type ThemeStyle = 'glass' | 'classic'`, `THEME_STYLES`, `DEFAULT_STYLE` (`'glass'`), `readThemeStyle(raw: unknown): ThemeStyle`.
  - `applyThemeToDom(colors, mood?, style?, target?)` — `style` omitted keeps the current `data-style` (Glass if none).
  - `persistThemeSnapshot(colors, preset = null, mood = null, style: ThemeStyle | null = null)` — a null style keeps the cached one.
  - `readCachedTheme()`, `readCachedPreset()`, `placeholderFromSnapshot(snap)`, `paintCachedTheme(snap, target?)`, `applyStyleOnly(style, target?)`, `themeUpdateFor(data): ThemeUpdate`, `paletteWithDefaults(colors)`, `type ThemeTarget`, `type CachedTheme`, `type ThemeColors`, `useTheme()`.

- [ ] **Step 1: Write the failing test** — `frontend/src/hooks/useTheme.style.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  applyStyleOnly, applyThemeToDom, paintCachedTheme, paletteWithDefaults, persistThemeSnapshot,
  placeholderFromSnapshot, readCachedTheme, readThemeStyle, themeUpdateFor, type ThemeTarget,
} from './useTheme'

/** A stand-in for <html> and <body> that records what the theme code writes. */
function fakeTarget(initialStyle?: string) {
  const vars = new Map<string, string>()
  const attrs = new Map<string, string>(initialStyle ? [['data-style', initialStyle]] : [])
  const body = { style: { backgroundColor: '', color: '' } }
  const target: ThemeTarget = {
    root: {
      style: { setProperty: (name, value) => { vars.set(name, value) } },
      setAttribute: (name, value) => { attrs.set(name, value) },
      removeAttribute: name => { attrs.delete(name) },
      getAttribute: name => attrs.get(name) ?? null,
    },
    body,
  }
  return { target, vars, attrs, body }
}

/** localStorage for the node test environment. */
function fakeStorage() {
  const items = new Map<string, string>()
  return {
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => { items.set(k, v) },
    removeItem: (k: string) => { items.delete(k) },
    clear: () => items.clear(),
  }
}

beforeEach(() => {
  ;(globalThis as { localStorage?: unknown }).localStorage = fakeStorage()
})
afterEach(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage
})

describe('readThemeStyle', () => {
  it('is Classic only when Classic was chosen; anything else is Glass', () => {
    expect(readThemeStyle('classic')).toBe('classic')
    expect(readThemeStyle('glass')).toBe('glass')
    expect(readThemeStyle(undefined)).toBe('glass')
    expect(readThemeStyle('')).toBe('glass')
    expect(readThemeStyle('neon')).toBe('glass')
  })
})

describe('applyThemeToDom', () => {
  it('sets data-style to the style it is given', () => {
    const { target, attrs } = fakeTarget()
    applyThemeToDom({}, undefined, 'classic', target)
    expect(attrs.get('data-style')).toBe('classic')
  })

  it('keeps the current style when none is given, and starts on Glass', () => {
    const classic = fakeTarget('classic')
    applyThemeToDom({}, undefined, undefined, classic.target)
    expect(classic.attrs.get('data-style')).toBe('classic')

    const fresh = fakeTarget()
    applyThemeToDom({}, undefined, undefined, fresh.target)
    expect(fresh.attrs.get('data-style')).toBe('glass')
  })

  it('writes the palette the same way in both styles', () => {
    const glass = fakeTarget()
    const classic = fakeTarget()
    applyThemeToDom({ surface_color: '#1e293b' }, null, 'glass', glass.target)
    applyThemeToDom({ surface_color: '#1e293b' }, null, 'classic', classic.target)
    expect(glass.vars.get('--color-dark-surface')).toBe('30 41 59')
    expect(glass.vars).toEqual(classic.vars)
  })

  it('writes the Glass extras: lifted brand text, glows and text on brand fills', () => {
    const { target, vars } = fakeTarget()
    applyThemeToDom({ primary_color: '#3b82f6' }, null, 'glass', target)
    expect(vars.get('--color-primary-500')).toBe('59 130 246')
    expect(vars.get('--glass-primary-500')).toBe('147 186 250')
    expect(vars.get('--glass-glow-1')).toBe('59 130 246')
    expect(vars.get('--color-on-primary')).toBe('3 5 10')
  })

  it('defaults to Royal blue, and treats a blank or broken colour as missing', () => {
    expect(paletteWithDefaults({}).primary_color).toBe('#3b82f6')
    expect(paletteWithDefaults({ primary_color: '' }).primary_color).toBe('#3b82f6')
    expect(paletteWithDefaults({ surface_color: 'teal' }).surface_color).toBe('#161616')
    const { target, vars } = fakeTarget()
    applyThemeToDom({ primary_color: '' }, null, 'glass', target)
    expect(vars.get('--color-primary-500')).toBe('59 130 246')
  })

  it('still sets and clears the mood', () => {
    const { target, attrs } = fakeTarget()
    applyThemeToDom({}, 'luxury', 'classic', target)
    expect(attrs.get('data-mood')).toBe('luxury')
    applyThemeToDom({}, null, 'classic', target)
    expect(attrs.has('data-mood')).toBe(false)
  })
})

describe('the cached snapshot', () => {
  it('stores and restores the style', () => {
    persistThemeSnapshot({ primary_color: '#10b981' }, 'Emerald', 'wellness', 'classic')
    expect(readCachedTheme()?.style).toBe('classic')
    expect(placeholderFromSnapshot(readCachedTheme())).toMatchObject({
      primary_color: '#10b981', theme_mood: 'wellness', theme_style: 'classic',
    })
  })

  it('keeps the cached style when a preset change saves without one', () => {
    persistThemeSnapshot({ primary_color: '#10b981' }, 'Emerald', 'wellness', 'classic')
    persistThemeSnapshot({ primary_color: '#e11d48' }, 'Rose Boutique', 'boutique')
    expect(readCachedTheme()?.style).toBe('classic')
  })

  it('reads a snapshot from before the release as Glass', () => {
    localStorage.setItem('loyalty-admin-theme-v1', JSON.stringify({ colors: { primary_color: '#c9a84c' }, savedAt: 1 }))
    const { target, attrs, vars } = fakeTarget()
    paintCachedTheme(readCachedTheme(), target)
    expect(attrs.get('data-style')).toBe('glass')
    expect(vars.get('--color-primary-500')).toBe('201 168 76')
  })

  it('with no snapshot paints only the default style', () => {
    const { target, attrs, vars } = fakeTarget()
    paintCachedTheme(null, target)
    expect(attrs.get('data-style')).toBe('glass')
    expect(vars.size).toBe(0)
  })

  it('switches only the style for an answer that carries no palette', () => {
    persistThemeSnapshot({ primary_color: '#10b981' }, 'Emerald', null, 'glass')
    const { target, attrs, vars } = fakeTarget('glass')
    applyStyleOnly('classic', target)
    expect(attrs.get('data-style')).toBe('classic')
    expect(vars.size).toBe(0)
    expect(readCachedTheme()).toMatchObject({ style: 'classic', colors: { primary_color: '#10b981' } })
  })
})

describe('themeUpdateFor', () => {
  const palette = { primary_color: '#3b82f6', background_color: '#0d0d0d' }

  it('applies a palette in full, a missing style meaning Glass', () => {
    expect(themeUpdateFor(palette)).toEqual({ kind: 'full', mood: null, style: 'glass' })
    expect(themeUpdateFor({ ...palette, theme_style: 'classic', theme_mood: 'luxury' }))
      .toEqual({ kind: 'full', mood: 'luxury', style: 'classic' })
  })

  it('switches only the style when the answer has a style and no palette', () => {
    expect(themeUpdateFor({ theme_style: 'classic' })).toEqual({ kind: 'style', style: 'classic' })
  })

  it('ignores an empty or broken answer, so the cached paint stays', () => {
    expect(themeUpdateFor({})).toBeNull()
    expect(themeUpdateFor(undefined)).toBeNull()
    expect(themeUpdateFor({ primary_color: '', background_color: '' })).toBeNull()
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/hooks/useTheme.style.test.ts`
Expected: FAIL; the module has no `readThemeStyle`, `paintCachedTheme`, `applyStyleOnly`, `themeUpdateFor`, `paletteWithDefaults` or `placeholderFromSnapshot` exports yet.

- [ ] **Step 3: Replace `frontend/src/hooks/useTheme.ts`** with:

```ts
import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { api } from '../lib/api'
import { SHADES, hexToRgb, isHex, shadeScale, toTriplet } from '../theme/colour'
import { brandGlassVariables } from '../theme/glass'

interface ThemeColors {
  primary_color: string
  secondary_color: string
  accent_color: string
  background_color: string
  surface_color: string
  text_color: string
  text_secondary_color: string
  border_color: string
  error_color: string
  warning_color: string
  info_color: string
  logo_url: string
  dark_mode_enabled: string
  // Persisted via hotel_settings.theme_mood. Drives the per-mood CSS
  // variable cascade in index.css (body font, heading font, corner
  // radius scale). Empty / missing = neutral default (Inter, standard
  // radii).
  theme_mood?: string
  // Persisted via hotel_settings.theme_style: 'glass' or 'classic'.
  // Missing means Glass, the admin's default style since 2026-10.
  theme_style?: string
}

const DEFAULTS: ThemeColors = {
  primary_color: '#3b82f6',
  secondary_color: '#1e1e1e',
  accent_color: '#32d74b',
  background_color: '#0d0d0d',
  surface_color: '#161616',
  text_color: '#ffffff',
  text_secondary_color: '#8e8e93',
  border_color: '#2c2c2c',
  error_color: '#ff375f',
  warning_color: '#ffd60a',
  info_color: '#0a84ff',
  logo_url: '',
  dark_mode_enabled: 'true',
}

const PALETTE_KEYS = [
  'primary_color', 'secondary_color', 'accent_color', 'background_color', 'surface_color', 'text_color',
  'text_secondary_color', 'border_color', 'error_color', 'warning_color', 'info_color',
] as const

/** The admin styles. Clean light joins in part 2. */
export const THEME_STYLES = ['glass', 'classic'] as const
export type ThemeStyle = (typeof THEME_STYLES)[number]
export const DEFAULT_STYLE: ThemeStyle = 'glass'

/** Only an explicit 'classic' is Classic; anything else (missing, empty, unknown) is Glass. */
export function readThemeStyle(raw: unknown): ThemeStyle {
  return raw === 'classic' ? 'classic' : DEFAULT_STYLE
}

/** What applyThemeToDom paints: <html> and <body>, or a stand-in in tests. */
export interface ThemeTarget {
  root: {
    style: { setProperty(name: string, value: string): void }
    setAttribute(name: string, value: string): void
    removeAttribute(name: string): void
    getAttribute(name: string): string | null
  }
  body: { style: { backgroundColor: string; color: string } }
}

const pageTarget = (): ThemeTarget => ({ root: document.documentElement, body: document.body })

/** The palette over the defaults. A blank or malformed colour keeps its default. */
export function paletteWithDefaults(colors: Partial<ThemeColors>): ThemeColors {
  const merged: ThemeColors = { ...DEFAULTS, ...colors }
  for (const key of PALETTE_KEYS) {
    if (!isHex(merged[key])) merged[key] = DEFAULTS[key]
  }
  return merged
}

const rgb = (hex: string) => toTriplet(hexToRgb(hex))

function surfaceShade(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `${Math.min(255, r + amount)} ${Math.min(255, g + amount)} ${Math.min(255, b + amount)}`
}

/**
 * Apply a colour palette to the DOM's CSS variables immediately —
 * no React state, no query roundtrip, no flicker. Used by both the
 * useTheme hook (after server fetch) and Settings → Theme presets
 * (the moment the staff clicks a preset, before the network save
 * round-trips). Same logic in both places, so a preset's instant
 * preview matches the eventual saved state exactly.
 *
 * The optional `mood` argument writes a `data-mood` attribute on the
 * <html> element so CSS rules in index.css can fork the body + heading
 * fonts and corner-radius scale per mood. Without this, picking a
 * preset only swapped 11 hex values and the admin's typography +
 * geometry stayed identical regardless of preset. Customer feedback
 * 2026-06-13: "cards are different, but after selection, admin do not
 * change style, only colour". Empty/null mood removes the attribute so
 * the default (Inter, neutral corners) renders.
 *
 * The optional `style` writes `data-style` ('glass' | 'classic'); left
 * out, the current style stays. The palette variables are written in
 * every style, plus the Glass extras (lifted brand text, glow colours,
 * text on brand fills). Glass's own values live in the stylesheet, scoped
 * to the signed-in admin (theme/glassTokens.ts), and are read before the
 * palette by the Tailwind tokens, so no variable is ever removed and the
 * pages outside the admin keep the palette exactly as before.
 */
export function applyThemeToDom(
  colors: Partial<ThemeColors>,
  mood?: string | null,
  style?: ThemeStyle,
  target: ThemeTarget = pageTarget(),
): void {
  const merged = paletteWithDefaults(colors)
  const { root, body } = target
  const set = (name: string, value: string) => root.style.setProperty(name, value)

  const shades = shadeScale(merged.primary_color)
  for (const shade of SHADES) set(`--color-primary-${shade}`, shades[shade])

  set('--color-dark-bg',       rgb(merged.background_color))
  set('--color-dark-surface',  rgb(merged.surface_color))
  set('--color-dark-surface2', surfaceShade(merged.surface_color, 8))
  set('--color-dark-surface3', surfaceShade(merged.surface_color, 16))
  set('--color-dark-surface4', surfaceShade(merged.surface_color, 24))
  // dark-card and dark-hover back 29 class names across the chatbot,
  // analytics and canned-reply screens, but nothing ever assigned them, so
  // they stayed on the neutral Tailwind fallback while every surface around
  // them followed the brand. On a navy or gold tenant those cards rendered
  // flat grey and read as a second, foreign design language. Their defaults
  // match surface2/surface3 exactly, which is the relationship they were
  // built to have, so derive them the same way.
  set('--color-dark-card',     surfaceShade(merged.surface_color, 8))
  set('--color-dark-hover',    surfaceShade(merged.surface_color, 16))
  set('--color-dark-border',   rgb(merged.border_color))
  set('--color-dark-border2',  surfaceShade(merged.border_color, 12))

  set('--color-text-primary',   rgb(merged.text_color))
  set('--color-text-secondary', rgb(merged.text_secondary_color))

  set('--color-accent',  rgb(merged.accent_color))
  set('--color-error',   rgb(merged.error_color))
  set('--color-warning', rgb(merged.warning_color))
  set('--color-info',    rgb(merged.info_color))

  for (const [name, value] of Object.entries(brandGlassVariables(merged.primary_color))) set(name, value)

  body.style.backgroundColor = merged.background_color
  body.style.color = merged.text_color

  // Mood propagation. CSS in index.css reads :root[data-mood="X"] and
  // forks --theme-font-body / --theme-font-display / --theme-radius-*
  // so EVERY surface in the admin (sidebars, tables, cards, buttons,
  // headings, etc.) shifts to the picked mood's vocabulary on next
  // paint. Without this the admin only changes color. Glass ignores the
  // mood: index.css excludes its mood rules from the Glass admin.
  if (mood && typeof mood === 'string') {
    root.setAttribute('data-mood', mood)
  } else if (mood === null) {
    root.removeAttribute('data-mood')
  }

  root.setAttribute('data-style', style ?? readThemeStyle(root.getAttribute('data-style')))
}

export type { ThemeColors }

/**
 * Cache key for the last-known-good theme snapshot in localStorage.
 *
 * Why: without this, every page reload paints the default palette for
 * the first ~200 ms while the /v1/theme query resolves -- the user sees
 * their carefully-picked Royal Blue / Emerald / etc. flash to default
 * and back. On a slow connection (or briefly offline), the API call
 * may not resolve at all, leaving the admin stuck on defaults and
 * making the user think "my theme didn't save". With the snapshot we
 * apply the last-known palette synchronously before React even mounts.
 */
const THEME_CACHE_KEY = 'loyalty-admin-theme-v1'
const PRESET_CACHE_KEY = 'loyalty-admin-theme-preset-v1'

export interface CachedTheme {
  colors: Partial<ThemeColors>
  preset?: string | null
  mood?: string | null
  // Missing in snapshots written before the styles shipped: read as Glass.
  style?: ThemeStyle | null
  savedAt: number
}

/**
 * Read the cached theme synchronously. Returns null on any parse error
 * or when the cache is missing.
 */
export function readCachedTheme(): CachedTheme | null {
  try {
    const raw = localStorage.getItem(THEME_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedTheme
    if (!parsed?.colors || typeof parsed.colors !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

/**
 * Persist the current theme + active preset name to localStorage so the
 * next page load can paint it instantly. Best-effort -- private mode /
 * quota exceeded just skip silently. A null `style` keeps the cached
 * one, so a preset change never resets the style.
 */
export function persistThemeSnapshot(
  colors: Partial<ThemeColors>,
  preset: string | null = null,
  mood: string | null = null,
  style: ThemeStyle | null = null,
): void {
  try {
    const keptStyle = style ?? readCachedTheme()?.style ?? null
    const payload: CachedTheme = { colors, preset, mood, style: keptStyle, savedAt: Date.now() }
    localStorage.setItem(THEME_CACHE_KEY, JSON.stringify(payload))
    if (preset) localStorage.setItem(PRESET_CACHE_KEY, preset)
  } catch {
    /* quota / privacy mode */
  }
}

/**
 * Read just the cached preset name. Used by the Settings page to keep
 * the "X active" chip lit while the server fetch is in flight, so the
 * user always sees confirmation that their picked preset is sticky.
 */
export function readCachedPreset(): string | null {
  try {
    return localStorage.getItem(PRESET_CACHE_KEY)
  } catch {
    return null
  }
}

/** The theme query's placeholder: the cached palette, mood and style. */
export function placeholderFromSnapshot(snap: CachedTheme | null): ThemeColors | undefined {
  if (!snap?.colors) return undefined
  return {
    ...DEFAULTS,
    ...snap.colors,
    ...(snap.mood ? { theme_mood: snap.mood } : {}),
    theme_style: readThemeStyle(snap.style),
  }
}

/**
 * Paint before React mounts: the cached theme, or with no cache just the
 * default style, so the first frame of the admin is already Glass.
 */
export function paintCachedTheme(snap: CachedTheme | null, target: ThemeTarget = pageTarget()): void {
  if (snap?.colors) {
    applyThemeToDom(snap.colors, snap.mood ?? null, readThemeStyle(snap.style), target)
  } else {
    target.root.setAttribute('data-style', DEFAULT_STYLE)
  }
}

/** A server answer with a style but no palette: switch the style only. */
export function applyStyleOnly(style: ThemeStyle, target: ThemeTarget = pageTarget()): void {
  target.root.setAttribute('data-style', style)
  const snap = readCachedTheme()
  persistThemeSnapshot(snap?.colors ?? {}, snap?.preset ?? null, snap?.mood ?? null, style)
}

/**
 * What a theme answer asks the DOM to do. A palette (the colours parse)
 * is applied in full with its style, missing style meaning Glass. An
 * answer with only theme_style switches the style. Anything else, an
 * empty answer included, changes nothing: the cached paint stays.
 */
export type ThemeUpdate =
  | { kind: 'full'; mood: string | null; style: ThemeStyle }
  | { kind: 'style'; style: ThemeStyle }
  | null

export function themeUpdateFor(data: unknown): ThemeUpdate {
  if (!data || typeof data !== 'object') return null
  const answer = data as Partial<ThemeColors>
  const style = typeof answer.theme_style === 'string' ? readThemeStyle(answer.theme_style) : null
  const paletteLooksValid =
    typeof answer.primary_color === 'string' && answer.primary_color.startsWith('#') &&
    typeof answer.background_color === 'string' && answer.background_color.startsWith('#')
  if (paletteLooksValid) {
    const mood = typeof answer.theme_mood === 'string' ? answer.theme_mood : null
    return { kind: 'full', mood, style: style ?? DEFAULT_STYLE }
  }
  return style ? { kind: 'style', style } : null
}

// Paint the cached theme to the DOM as early as possible -- this runs
// at module-evaluation time, before React mounts. Eliminates the
// default-palette flash on every reload. Also applies the cached
// mood so the per-mood body/heading font cascade lands in the FIRST
// paint, not after hydration (otherwise the user sees a flash of
// Inter then a swap to Cormorant/Space Grotesk/IBM Plex/etc), and the
// cached style, so a Classic organisation never flashes Glass.
if (typeof window !== 'undefined') {
  paintCachedTheme(readCachedTheme())
}

export function useTheme() {
  const { data } = useQuery<ThemeColors>({
    queryKey: ['admin-theme'],
    // Prefer the authenticated endpoint when the SPA has a token —
    // org binding is GUARANTEED there. The public /v1/theme has manual
    // auth resolution that can silently fail (returning cross-tenant
    // colors or empties) and was the root cause of the customer-reported
    // 'I picked a preset but after refresh it reverted' bug.
    queryFn: async () => {
      const hasToken = typeof window !== 'undefined' && !!localStorage.getItem('auth_token')
      // Members hold a token but no admin rights, so the authenticated
      // endpoint 403s for them — which left the portal unbranded and
      // logged an error on every load. They take the public route, which
      // is exactly what it exists for.
      let isStaff = true
      try {
        const raw = typeof window !== 'undefined' ? localStorage.getItem('loyalty-auth') : null
        if (raw) isStaff = JSON.parse(raw)?.state?.user?.user_type !== 'member'
      } catch { /* fall back to the admin endpoint */ }
      const endpoint = hasToken && isStaff ? '/v1/admin/branding/theme' : '/v1/theme'
      const r = await api.get(endpoint)
      return r.data.theme as ThemeColors
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    // Hydrate from the localStorage snapshot so React's initial render
    // already has the user's saved palette and style -- no
    // default-then-flip visual jolt.
    placeholderData: () => placeholderFromSnapshot(readCachedTheme()),
  })

  // CRITICAL: only act on `data` (server response) when it carries a real
  // palette or an explicit style. An empty answer must NOT fall back to
  // DEFAULTS-spread theme — that's what was wiping the user's selection.
  // The DOM is already painted with the cached snapshot from module-load
  // + placeholderData; we only UPDATE it when a real answer arrives.
  const update = themeUpdateFor(data)

  const theme = { ...DEFAULTS, ...data }

  useEffect(() => {
    // ROOT-CAUSE FIX (2026-06-13): previously this effect ran
    // applyThemeToDom(theme) on EVERY render — including when `data`
    // came back as an empty object. With theme spread over DEFAULTS, an
    // empty `data` resolves to the defaults, and the DOM got REPAINTED to
    // defaults on every fetch. Customer-visible symptom: 'refresh shows
    // the new theme for a second then reverts'. themeUpdateFor() keeps
    // that rule: an empty answer changes nothing.
    if (update?.kind === 'full') {
      applyThemeToDom(theme, update.mood, update.style)
      persistThemeSnapshot(data as Partial<ThemeColors>, readCachedPreset(), update.mood, update.style)
    } else if (update?.kind === 'style') {
      applyStyleOnly(update.style)
    }
  }, [
    theme.primary_color, theme.background_color, theme.surface_color,
    theme.border_color, theme.text_color, theme.text_secondary_color,
    theme.accent_color, theme.error_color, theme.warning_color, theme.info_color,
    data,
    update?.kind,
    update?.style,
    update?.kind === 'full' ? update.mood : null,
  ])

  return theme
}
```

- [ ] **Step 4: Run it and watch it pass, then the whole suite**

Run: `npx vitest run src/hooks/useTheme.style.test.ts`
Expected: PASS, 15 tests.
Run: `npx tsc -b && npx vitest run`
Expected: only the 3 `plannerMeta` failures. (`Settings.tsx` still calls `applyThemeToDom(colors, mood)` and `persistThemeSnapshot(colors, name, mood)`; both signatures still accept that.)

- [ ] **Step 5: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-glass && git add frontend/src/hooks/useTheme.ts frontend/src/hooks/useTheme.style.test.ts && git commit -m "Theme code knows the admin style" -m "applyThemeToDom writes data-style, keeps writing the palette in every style and adds the brand-derived Glass extras. The snapshot carries the style (old snapshots read as Glass), the first paint sets it before React mounts, an answer with only theme_style switches the style, and blank colours fall back to the defaults, now Royal blue." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Glass stylesheet, shell hooks and fonts

**Files:**
- Create: `frontend/src/theme/glass.css`; tool `.superpowers/sdd/2026-10-08-admin-glass-style/tools/guard-mood-rules.mjs`
- Modify: `frontend/src/index.css:1-15`, `frontend/src/components/Layout.tsx:2`, `:353` (effect), `:683` (root), `:702` (aside), `:980` (header)
- Test: `frontend/src/theme/glassCss.test.ts`

**Interfaces:**
- Consumes: `GLASS_SCOPE`, `GLASS_INK` (Task 2); `hexToRgb`, `luminance` (Task 1); the variables Task 3 generates (`--theme-font-display`, `--glass-glow-alpha-*`) and Task 4 writes (`--glass-glow-*`, `--glass-primary-*`); token classes `bg-panel`, `bg-panel-dim`, `bg-well` (Task 3).
- Produces: `<html data-shell="admin">` while the admin Layout is mounted; class hooks `hx-shell`, `hx-sidebar`, `hx-header`; the Glass look. Task 9 appends the legacy-surface block to `glass.css`.

- [ ] **Step 1: Write the failing test** — `frontend/src/theme/glassCss.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { hexToRgb, luminance } from './colour'
import { GLASS_INK, GLASS_SCOPE } from './glassTokens'

const glassCss = readFileSync(new URL('./glass.css', import.meta.url), 'utf8')
const indexCss = readFileSync(new URL('../index.css', import.meta.url), 'utf8')

/** Split on commas that are not inside parentheses (`:is(.a, .b)` stays whole). */
function splitTopLevel(list: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const ch of list) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      parts.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  parts.push(current)
  return parts.map(s => s.trim()).filter(Boolean)
}

/** Every rule's selectors, at-rule preludes (@media, @supports, @import) left out. */
function selectors(css: string): string[] {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const out: string[] = []
  for (const match of clean.matchAll(/([^{};]+)\{/g)) {
    const prelude = match[1].trim()
    if (prelude && !prelude.startsWith('@')) out.push(...splitTopLevel(prelude))
  }
  return out
}

/** The declarations of the first rule whose selector list contains `needle`. */
function ruleBody(css: string, needle: string): string {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const at = clean.indexOf(needle)
  const open = clean.indexOf('{', at)
  return clean.slice(open + 1, clean.indexOf('}', open))
}

/** The selectors of every rule whose declarations contain `declaration`. */
function selectorsOfRulesWith(css: string, declaration: string): string[] {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const out: string[] = []
  for (const match of clean.matchAll(/([^{};]+)\{([^{}]*)\}/g)) {
    if (match[2].includes(declaration)) out.push(...splitTopLevel(match[1].trim()))
  }
  return out
}

// Every surface class a menu, popover, sticky header or modal panel is drawn with.
const OVERLAY_SURFACES = ['bg-dark-bg', 'bg-dark-surface', 'bg-dark-surface2', 'bg-dark-card', 'bg-panel', 'bg-panel-dim', 'bg-well']

describe('glass.css', () => {
  it('has rules, and every one of them is scoped to the signed-in admin in Glass', () => {
    const all = selectors(glassCss)
    expect(all.length).toBeGreaterThan(20)
    for (const selector of all) expect(selector.startsWith(GLASS_SCOPE), selector).toBe(true)
  })

  it('gives every overlay surface the darker, blurred glass, so menus and modals stay readable', () => {
    const overlay = selectorsOfRulesWith(glassCss, 'rgb(14 20 34 / 0.78)').join(' ')
    for (const cls of OVERLAY_SURFACES) {
      expect(new RegExp(`\\.${cls}(?![\\w-])`).test(overlay), cls).toBe(true)
    }
    for (const position of ['.absolute', '.fixed', '.sticky', '.fixed.inset-0 >']) {
      expect(overlay.includes(position), position).toBe(true)
    }
  })

  it('paints no backdrop ink lighter than the ink the contrast tests measure over', () => {
    const backdrop = ruleBody(glassCss, '.hx-shell {')
    const inks = [...backdrop.matchAll(/#[0-9a-fA-F]{6}\b/g)].map(m => m[0])
    expect(inks.length).toBeGreaterThanOrEqual(3)
    for (const ink of inks) {
      expect(luminance(hexToRgb(ink)), ink).toBeLessThanOrEqual(luminance(hexToRgb(GLASS_INK)) + 1e-9)
    }
  })
})

describe('index.css fonts', () => {
  it('opens with the fonts import, the only position the build keeps', () => {
    const firstStatement = indexCss.replace(/\/\*[\s\S]*?\*\//g, '').trim().split('\n')[0]
    expect(firstStatement).toMatch(/^@import url\('https:\/\/fonts\.googleapis\.com\/css2\?family=Inter:/)
    expect(firstStatement).toContain('family=Space+Grotesk:wght@500;600;700')
    expect(firstStatement).toContain('family=JetBrains+Mono:')
  })
})

describe('index.css mood rules', () => {
  it('never reach the Glass admin (Glass has its own type and corners)', () => {
    const moodRules = selectors(indexCss).filter(s => s.includes('[data-mood'))
    expect(moodRules.length).toBeGreaterThan(60)
    for (const selector of moodRules) {
      expect(selector.startsWith(':root:where(:not([data-style="glass"][data-shell="admin"]))[data-mood'), selector).toBe(true)
    }
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/theme/glassCss.test.ts`
Expected: FAIL, `ENOENT: no such file or directory` for `glass.css`.

- [ ] **Step 3: Create `frontend/src/theme/glass.css`:**

```css
/* ════════════════════════════════════════════════════════════════════════
   Glass, the admin's default style.
   Spec: docs/superpowers/specs/2026-10-08-admin-glass-style-design.md

   The token values (surfaces, text, radius, type) are generated into the
   stylesheet by the Tailwind plugin in tailwind.config.js, from
   src/theme/glassTokens.ts. This file holds the component rules: the
   backdrop, the floating sidebar and header, blur where content passes
   underneath, the card highlight, the old inline surfaces, the fallbacks.

   Every selector starts with :root[data-style="glass"][data-shell="admin"]:
   Glass applies only while the admin Layout is mounted. glassCss.test.ts
   enforces it.
   ════════════════════════════════════════════════════════════════════════ */

/* The backdrop: ink with three glows from the brand colour (theme/glass.ts
   glowsFor). Fallbacks are Royal blue's glows, for the frame before the
   theme loads. The ink stops must stay no lighter than GLASS_INK. */
:root[data-style="glass"][data-shell="admin"] .hx-shell {
  background-color: #0B1120;
  background-image:
    radial-gradient(70rem 46rem at 0% 0%, rgb(var(--glass-glow-1, 59 130 246) / var(--glass-glow-alpha-1, 0.18)), transparent 70%),
    radial-gradient(56rem 40rem at 100% 0%, rgb(var(--glass-glow-2, 113 59 246) / var(--glass-glow-alpha-2, 0.16)), transparent 70%),
    radial-gradient(64rem 44rem at 50% 100%, rgb(var(--glass-glow-3, 37 155 110) / var(--glass-glow-alpha-3, 0.14)), transparent 70%),
    linear-gradient(160deg, #0B1120 0%, #0D1426 55%, #0A0F1C 100%);
  color: rgb(243 246 251);
}

/* Sidebar and header: glass with real blur. */
:root[data-style="glass"][data-shell="admin"] .hx-sidebar,
:root[data-style="glass"][data-shell="admin"] .hx-header {
  -webkit-backdrop-filter: blur(22px) saturate(160%);
  backdrop-filter: blur(22px) saturate(160%);
}

@media (min-width: 1024px) {
  /* The sidebar floats 12px from the window edges; the header is a bar
     along the top of the content column. */
  :root[data-style="glass"][data-shell="admin"] .hx-sidebar {
    margin: 12px 0 12px 12px;
    border: 1px solid rgb(255 255 255 / 0.14);
    border-radius: 20px;
  }
  :root[data-style="glass"][data-shell="admin"] .hx-header {
    margin: 12px 12px 0;
    border: 1px solid rgb(255 255 255 / 0.14);
    border-radius: 16px;
  }
}

@media (max-width: 1023px) {
  /* Phones and tablets: the drawer and the bottom navigation sit over
     page content, so they are darker glass. */
  :root[data-style="glass"][data-shell="admin"] .hx-sidebar,
  :root[data-style="glass"][data-shell="admin"] .mobile-bottom-nav {
    background: rgb(14 20 34 / 0.85);
    -webkit-backdrop-filter: blur(22px) saturate(160%);
    backdrop-filter: blur(22px) saturate(160%);
  }
  :root[data-style="glass"][data-shell="admin"] .mobile-bottom-nav {
    border-top-color: rgb(255 255 255 / 0.14);
  }
  :root[data-style="glass"][data-shell="admin"] .mobile-bottom-nav > a,
  :root[data-style="glass"][data-shell="admin"] .mobile-bottom-nav > button {
    color: rgb(195 204 217);
  }
  :root[data-style="glass"][data-shell="admin"] .mobile-bottom-nav > a.active,
  :root[data-style="glass"][data-shell="admin"] .mobile-bottom-nav > button.active {
    color: rgb(var(--tc-primary-400, var(--color-primary-400, 212 182 92)));
  }
}

/* Cards: a hairline top highlight and a soft shadow make the translucent
   panels read as sheets of glass. No blur: the backdrop under them is
   already soft. Tailwind's ring variables stay in the shadow, so focus
   rings keep working. */
:root[data-style="glass"][data-shell="admin"] :is(.bg-dark-surface, .bg-dark-surface2, .bg-dark-card, .bg-panel, .bg-panel-dim).border:not(.absolute, .fixed, .sticky, .hx-sidebar, input, textarea, select, button) {
  box-shadow:
    var(--tw-ring-offset-shadow, 0 0 #0000),
    var(--tw-ring-shadow, 0 0 #0000),
    inset 0 1px 0 rgb(255 255 255 / 0.08),
    0 12px 32px -12px rgb(0 0 0 / 0.45);
}

/* Menus, popovers, sticky headers, modals and drawers: page content passes
   under them, so they are darker glass with real blur. */
:root[data-style="glass"][data-shell="admin"] :is(.absolute, .fixed, .sticky):is(.bg-dark-bg, .bg-dark-surface, .bg-dark-surface2, .bg-dark-card, .bg-panel, .bg-panel-dim, .bg-well):not(.hx-sidebar),
:root[data-style="glass"][data-shell="admin"] :is(.shadow-xl, .shadow-2xl):is(.bg-dark-bg, .bg-dark-surface, .bg-dark-surface2, .bg-dark-card, .bg-panel, .bg-panel-dim, .bg-well):not(.hx-sidebar),
:root[data-style="glass"][data-shell="admin"] .fixed.inset-0 > :is(.bg-dark-bg, .bg-dark-surface, .bg-dark-surface2, .bg-dark-card, .bg-panel, .bg-panel-dim, .bg-well) {
  background-color: rgb(14 20 34 / 0.78);
  -webkit-backdrop-filter: blur(22px) saturate(160%);
  backdrop-filter: blur(22px) saturate(160%);
}

/* Page titles and big numbers in the display face. */
:root[data-style="glass"][data-shell="admin"] :is(.text-xl, .text-2xl, .text-3xl, .text-4xl, .text-5xl) {
  font-family: var(--theme-font-display);
  letter-spacing: -0.01em;
}

/* Scrollbars without the old solid grey track. */
:root[data-style="glass"][data-shell="admin"] ::-webkit-scrollbar-track {
  background: transparent;
}
:root[data-style="glass"][data-shell="admin"] ::-webkit-scrollbar-thumb {
  background: rgb(255 255 255 / 0.18);
}

/* Reduced transparency, and browsers without backdrop-filter: solid
   panels and no blur. The solid surface tokens come from the Tailwind
   plugin (glassSolidVariables). These selectors match the ones above with
   equal specificity, so coming later in the file is what makes them win. */
@media (prefers-reduced-transparency: reduce) {
  :root[data-style="glass"][data-shell="admin"] .hx-shell {
    background-image: none;
  }
  :root[data-style="glass"][data-shell="admin"] :is(.hx-sidebar, .hx-header, .mobile-bottom-nav),
  :root[data-style="glass"][data-shell="admin"] :is(.absolute, .fixed, .sticky, .shadow-xl, .shadow-2xl):is(.bg-dark-bg, .bg-dark-surface, .bg-dark-surface2, .bg-dark-card, .bg-panel, .bg-panel-dim, .bg-well):not(.hx-sidebar),
  :root[data-style="glass"][data-shell="admin"] .fixed.inset-0 > :is(.bg-dark-bg, .bg-dark-surface, .bg-dark-surface2, .bg-dark-card, .bg-panel, .bg-panel-dim, .bg-well) {
    background: #1A2233;
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
  }
}

@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  :root[data-style="glass"][data-shell="admin"] .hx-shell {
    background-image: none;
  }
  :root[data-style="glass"][data-shell="admin"] :is(.hx-sidebar, .hx-header, .mobile-bottom-nav),
  :root[data-style="glass"][data-shell="admin"] :is(.absolute, .fixed, .sticky, .shadow-xl, .shadow-2xl):is(.bg-dark-bg, .bg-dark-surface, .bg-dark-surface2, .bg-dark-card, .bg-panel, .bg-panel-dim, .bg-well):not(.hx-sidebar),
  :root[data-style="glass"][data-shell="admin"] .fixed.inset-0 > :is(.bg-dark-bg, .bg-dark-surface, .bg-dark-surface2, .bg-dark-card, .bg-panel, .bg-panel-dim, .bg-well) {
    background: #1A2233;
  }
}
```

- [ ] **Step 4: Move the fonts import first and import glass.css.** Edit `frontend/src/index.css`, replacing:

```css
@import './portal/theme/portal.css';
@import './appointments/theme/appointments.css';

@tailwind base;
@tailwind components;
@tailwind utilities;

@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

/* Display fonts used by Settings → Branding theme presets. Without these
```

with:

```css
/* Inter, Space Grotesk and JetBrains Mono: the admin's interface, display
   and code faces. This @import must stay the first statement in the file:
   the build drops an @import that follows any rule (vite warns "@import must
   precede all other statements"). */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Space+Grotesk:wght@500;600;700&family=JetBrains+Mono:wght@400;700&display=swap');
@import './portal/theme/portal.css';
@import './appointments/theme/appointments.css';
@import './theme/glass.css';

@tailwind base;
@tailwind components;
@tailwind utilities;

/* NOTE (2026-10-08): this import has never reached production. It follows
   the rules above, so the build drops it, and the preset fonts below only
   render where they happen to be installed. Moving it up would change how
   Classic looks for every organisation on a preset, so that is left to the
   owner (Glass spec §12). Glass's own faces load from the top of the file. */
/* Display fonts used by Settings → Branding theme presets. Without these
```

Leave the preset-fonts `@import url(...)` line itself unchanged.

- [ ] **Step 5: Keep the mood rules out of Glass.** Write the tool
`.superpowers/sdd/2026-10-08-admin-glass-style/tools/guard-mood-rules.mjs`:

```js
// One-off: keep the mood rules in frontend/src/index.css out of the Glass
// admin. Every selector line that starts with :root[data-mood gains a
// zero-specificity guard, so Classic and the pages outside the admin
// cascade exactly as before.
//   node guard-mood-rules.mjs <path to frontend/src/index.css>
import fs from 'node:fs'

const file = process.argv[2]
const css = fs.readFileSync(file, 'utf8')
const GUARD = ':root:where(:not([data-style="glass"][data-shell="admin"]))[data-mood'
let count = 0
const out = css.replace(/^:root\[data-mood/gm, () => {
  count++
  return GUARD
})
fs.writeFileSync(file, out)
console.log(`guarded ${count} mood selectors`)
```

Run: `cd /c/wamp64/www/Hexa-Tech-glass && node .superpowers/sdd/2026-10-08-admin-glass-style/tools/guard-mood-rules.mjs frontend/src/index.css`
Expected: `guarded 70 mood selectors`. Then `git diff --stat frontend/src/index.css` shows only index.css changed; the two
comment lines that mention `:root[data-mood]` mid-line are untouched.

- [ ] **Step 6: Hook the shell.** Four edits in `frontend/src/components/Layout.tsx`:

  1. Line 2: `import { useState, useRef, useEffect } from 'react'` → `import { useState, useRef, useEffect, useLayoutEffect } from 'react'`
  2. Insert before the comment `// Track viewport — below 1024px the sidebar becomes an off-canvas drawer` (around line 353):

```tsx
  // The admin styles (Glass) apply only inside the signed-in admin: mark
  // <html> while this shell is mounted, before the first paint. The login
  // page, member portal and Appointments share <html> and stay unmarked.
  useLayoutEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-shell', 'admin')
    return () => root.removeAttribute('data-shell')
  }, [])

```

  3. Root (line 683): `<div className="flex h-screen bg-dark-bg">` → `<div className="hx-shell flex h-screen bg-dark-bg">`
  4. Aside (line 702): `'mobile-drawer flex flex-col bg-dark-surface text-white flex-shrink-0 border-r border-dark-border',` → `'hx-sidebar mobile-drawer flex flex-col bg-dark-surface text-white flex-shrink-0 border-r border-dark-border',`
  5. Header (line 980): `<header className="bg-dark-surface border-b border-dark-border px-4 lg:px-6 h-14 flex items-center gap-3 lg:gap-4">` → `<header className="hx-header bg-dark-surface border-b border-dark-border px-4 lg:px-6 h-14 flex items-center gap-3 lg:gap-4">`

- [ ] **Step 7: Run the tests and the suite**

Run: `cd /c/wamp64/www/Hexa-Tech-glass/frontend && npx vitest run src/theme/glassCss.test.ts`
Expected: PASS, 5 tests.
Run: `npx tsc -b && npx vitest run`
Expected: only the 3 `plannerMeta` failures.

- [ ] **Step 8: Confirm the build keeps the fonts and the scoped rules** (output to the git-excluded tools folder, not `dist`):

```bash
cd /c/wamp64/www/Hexa-Tech-glass/frontend && npx vite build --outDir ../.superpowers/sdd/2026-10-08-admin-glass-style/build-check 2>&1 | grep -E "@import|built in"
CSS=$(ls ../.superpowers/sdd/2026-10-08-admin-glass-style/build-check/assets/index-*.css) && head -c 200 "$CSS"; echo; grep -oF '[data-style=glass][data-shell=admin]' "$CSS" | wc -l
```

Expected: one remaining `@import must precede` warning, for the preset-fonts line only (documented in the NOTE);
the CSS starts with `@import"https://fonts.googleapis.com/css2?family=Inter…Space+Grotesk…`; the scope count is
above 90. Delete the `build-check` folder afterwards.

- [ ] **Step 9: Look at it.** Start the local back end and the dev server (see Task 10 Step 1 for the commands and the
port check), log in, and open the Dashboard at 1440×900. Expected: the ink backdrop with brand glows, the floating
glass sidebar, the glass header bar, translucent cards. In DevTools, `document.documentElement.dataset` shows
`style: "glass"` and `shell: "admin"`; on `/login` after logging out, `shell` is absent. Stop both servers.

- [ ] **Step 10: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-glass && git add frontend/src/theme/glass.css frontend/src/theme/glassCss.test.ts frontend/src/index.css frontend/src/components/Layout.tsx && git commit -m "Glass stylesheet, shell hooks and working fonts" -m "glass.css holds the backdrop, floating sidebar and header, blur on overlays, card highlights and the reduced-transparency fallbacks, every rule scoped to the signed-in admin. Layout marks <html> with data-shell while mounted. The mood rules skip the Glass admin. Inter, Space Grotesk and JetBrains Mono now load: the old imports followed the Tailwind rules and the build dropped them." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Server — the `theme_style` setting and the Royal-blue seed

**Files:**
- Modify: `app/Http/Controllers/Api/V1/Admin/SettingsController.php` (imports `:5-10`, constants after `:15`, `update()` after `:290`, `ensureTenantHasDefaultSettings()` `:416`, `inferGroup()` `:583`)
- Test: `tests/Feature/Settings/ThemeStyleSettingTest.php`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces (Tasks 4 and 7 rely on it): `PUT /api/v1/admin/settings` accepts `{key: 'theme_style', value: 'glass'|'classic'}`, files it under `appearance`, refuses anything else with 422 `{"error": "Validation failed", "message": "theme_style must be glass or classic.", "errors": {"theme_style": ["theme_style must be glass or classic."]}}` (the app's renderer in `bootstrap/app.php`) before writing any item of the same save; `GET /api/v1/admin/branding/theme` and `GET /api/v1/theme` return it in `theme`; `SettingsController::THEME_STYLES`.

- [ ] **Step 1: Write the failing test** — `tests/Feature/Settings/ThemeStyleSettingTest.php`:

```php
<?php

namespace Tests\Feature\Settings;

use App\Models\HotelSetting;
use App\Models\Organization;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Settings → Branding → Style saves `theme_style` per organisation: 'glass'
 * (also what no saved value means) or 'classic'. The admin SPA reads it with
 * the colours from the appearance group through both theme endpoints, so the
 * key must land in `appearance`, and a value the SPA can't render must be
 * refused before anything in the same save is written.
 */
class ThemeStyleSettingTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema;

    protected function setUp(): void
    {
        parent::setUp();

        $this->setUpLoyaltySchema();
        $this->setUpBookingRefundSchema();

        if (!Schema::hasColumn('brands', 'logo_url')) {
            Schema::table('brands', fn ($table) => $table->string('logo_url')->nullable());
        }
        if (!Schema::hasColumn('brands', 'sort_order')) {
            Schema::table('brands', fn ($table) => $table->integer('sort_order')->default(0));
        }
        if (!Schema::hasTable('brand_user')) {
            Schema::create('brand_user', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('brand_id');
                $table->unsignedBigInteger('user_id');
                $table->timestamps();
            });
        }
        if (!Schema::hasTable('staff')) {
            Schema::create('staff', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id')->nullable();
                $table->unsignedBigInteger('user_id');
                $table->string('role', 32)->default('staff');
                $table->string('hotel_name')->nullable();
                $table->string('department')->nullable();
                $table->text('allowed_nav_groups')->nullable();
                $table->boolean('is_active')->default(true);
                $table->timestamps();
            });
        }
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        if (app()->bound('current_brand_id')) {
            app()->forgetInstance('current_brand_id');
        }
        parent::tearDown();
    }

    /** An ordinary (non-super_admin) manager, the role that changes branding. */
    private function staffUser(): User
    {
        $org = Organization::create([
            'name'                => 'Riverside Studio',
            'slug'                => 'org-' . uniqid(),
            'subscription_status' => 'ACTIVE',
        ]);

        $user = User::create([
            'organization_id' => $org->id,
            'name'            => 'Studio Manager',
            'email'           => 'staff_' . uniqid('', true) . '@example.test',
            'password'        => 'irrelevant-Password-1',
            'user_type'       => 'staff',
        ]);

        DB::table('staff')->insert([
            'organization_id' => $org->id,
            'user_id'         => $user->id,
            'role'            => 'manager',
            'is_active'       => true,
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);

        return $user;
    }

    /** Find one setting item anywhere in the grouped settings response. */
    private function item(array $json, string $key): ?array
    {
        $found = null;
        $walk = function ($node) use (&$walk, &$found, $key) {
            if ($found !== null || !is_array($node)) {
                return;
            }
            if (($node['key'] ?? null) === $key && array_key_exists('has_value', $node)) {
                $found = $node;
                return;
            }
            foreach ($node as $child) {
                $walk($child);
            }
        };
        $walk($json);

        return $found;
    }

    private function stored(int $orgId, string $key): ?HotelSetting
    {
        return HotelSetting::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('key', $key)
            ->first();
    }

    private function saveStyle(mixed $value)
    {
        return $this->putJson('/api/v1/admin/settings', ['settings' => [['key' => 'theme_style', 'value' => $value]]]);
    }

    public function test_glass_and_classic_are_saved_under_appearance_and_served_by_both_theme_endpoints(): void
    {
        $user = $this->staffUser();
        Sanctum::actingAs($user);
        $this->getJson('/api/v1/admin/settings');

        $save = $this->saveStyle('classic');
        $this->assertSame(200, $save->getStatusCode(), $save->getContent());
        $this->assertSame('classic', (string) $save->json('persisted.theme_style'));

        $row = $this->stored($user->organization_id, 'theme_style');
        $this->assertNotNull($row, 'theme_style was not stored for the organisation.');
        $this->assertSame('appearance', $row->group);

        $this->assertSame('classic', $this->getJson('/api/v1/admin/branding/theme')->json('theme.theme_style'));
        $this->assertSame('classic', $this->getJson('/api/v1/theme')->json('theme.theme_style'));

        $this->assertSame(200, $this->saveStyle('glass')->getStatusCode());
        $this->assertSame('glass', $this->getJson('/api/v1/admin/branding/theme')->json('theme.theme_style'));
    }

    public function test_an_unknown_style_is_refused_and_nothing_is_saved(): void
    {
        $user = $this->staffUser();
        Sanctum::actingAs($user);
        $this->getJson('/api/v1/admin/settings');

        // 'light' is Part 2's style; until it ships it is as unknown as 'neon'.
        foreach (['neon', 'GLASS', 'light', ''] as $bad) {
            $res = $this->saveStyle($bad);
            $this->assertSame(422, $res->getStatusCode(), "'{$bad}' was accepted: " . $res->getContent());
            $this->assertSame('theme_style must be glass or classic.', $res->json('errors.theme_style.0'));
        }

        $this->assertNull($this->stored($user->organization_id, 'theme_style'));
    }

    public function test_a_save_mixing_a_colour_with_a_bad_style_writes_neither(): void
    {
        $user = $this->staffUser();
        Sanctum::actingAs($user);
        $this->getJson('/api/v1/admin/settings');
        $before = $this->stored($user->organization_id, 'primary_color')?->value;

        $res = $this->putJson('/api/v1/admin/settings', ['settings' => [
            ['key' => 'primary_color', 'value' => '#10b981'],
            ['key' => 'theme_style', 'value' => 'neon'],
        ]]);

        $this->assertSame(422, $res->getStatusCode(), $res->getContent());
        $this->assertSame($before, $this->stored($user->organization_id, 'primary_color')?->value);
        $this->assertNull($this->stored($user->organization_id, 'theme_style'));
    }

    public function test_a_fresh_organisation_is_seeded_with_the_royal_blue_palette(): void
    {
        Sanctum::actingAs($this->staffUser());

        $res = $this->getJson('/api/v1/admin/settings');
        $this->assertSame(200, $res->getStatusCode(), $res->getContent());
        $this->assertSame('#3b82f6', $this->item($res->json(), 'primary_color')['value'] ?? null);
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd /c/wamp64/www/Hexa-Tech-glass && /c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Settings/ThemeStyleSettingTest.php`
Expected: 4 failures — `'general'` instead of `'appearance'`; 200 instead of 422 for `neon`; 200 for the mixed save; `#c9a84c` instead of `#3b82f6`.

- [ ] **Step 3: Implement.** In `SettingsController.php`:

  1. Add the import after `use Illuminate\Support\Facades\Storage;`:

```php
use Illuminate\Validation\ValidationException;
```

  2. Add the constant directly above `/** Keys that contain secrets — returned masked unless explicitly empty. */`:

```php
    /** The admin styles `theme_style` may hold (Settings → Branding → Style). Part 2 adds 'light'. */
    public const THEME_STYLES = ['glass', 'classic'];

```

  3. In `update()`, directly after the `$validated = $request->validate([ … ]);` statement:

```php

        // theme_style picks the admin's look for the whole organisation. Refuse a
        // value the SPA can't render before anything in this save is written, so
        // a bad style never lands half a save.
        foreach ($validated['settings'] as $item) {
            if ($item['key'] === 'theme_style' && !in_array($item['value'], self::THEME_STYLES, true)) {
                throw ValidationException::withMessages([
                    'theme_style' => 'theme_style must be glass or classic.',
                ]);
            }
        }
```

  4. In `ensureTenantHasDefaultSettings()`, the `primary_color` default:
     `['key' => 'primary_color',        'value' => '#c9a84c', …` → `'value' => '#3b82f6'` (nothing else on that line changes).

  5. In `inferGroup()`, directly after `if ($k === 'theme_mood') return 'appearance';`:

```php
        // theme_style (2026-10) picks the admin style, Glass or Classic; it
        // travels with the colours through /v1/theme and /v1/admin/branding/theme.
        if ($k === 'theme_style') return 'appearance';
```

- [ ] **Step 4: Run it and the Settings suite**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Settings/ThemeStyleSettingTest.php`
Expected: PASS, 4 tests.
Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Settings/`
Expected: all pass (same count as the E6 baseline plus 4).

- [ ] **Step 5: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-glass && git add app/Http/Controllers/Api/V1/Admin/SettingsController.php tests/Feature/Settings/ThemeStyleSettingTest.php && git commit -m "theme_style setting for the admin style" -m "Filed under appearance so both theme endpoints serve it; anything but glass or classic is refused with a 422 before any item of the save is written. A fresh organisation's seeded palette is Royal blue, matching the admin's new default." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Settings → Branding — the Style row

**Files:**
- Create: `frontend/src/theme/themeSettings.ts`, `frontend/src/components/settings/StylePicker.tsx`
- Modify: `frontend/src/pages/Settings.tsx` (`:6`, `:245`, after `:1083`, `:1110-1116`, `:1139-1145`, `:1174-1180`, `:1465`, `:1515-1519`, `:1527`, `:1559`, `:1567`)
- Test: `frontend/src/theme/themeSettings.test.ts`, `frontend/src/components/settings/StylePicker.test.tsx`

**Interfaces:**
- Consumes: `applyThemeToDom`, `persistThemeSnapshot`, `readThemeStyle`, `type ThemeStyle` (Task 4); `glowsFor` (Task 2); token classes `text-on-primary`, `bg-primary-500`, `border-dark-*`, `text-t-*` (Task 3); the server contract (Task 6).
- Produces: `THEME_META_KEYS`, `withoutThemeMeta<T extends {key: string}>(settings: T[]): T[]`, `STYLE_NAMES: Record<ThemeStyle, string>`, `styleSettings(style): {key, value}[]`; `StylePicker({ value, brand, onPick })`, `STYLE_OPTIONS`.

- [ ] **Step 1: Write the failing tests** — `frontend/src/theme/themeSettings.test.ts`:

```ts
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
```

And `frontend/src/components/settings/StylePicker.test.tsx`:

```tsx
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { StylePicker } from './StylePicker'

/** The picker's cards, found by their data-style-option. */
function cards(value: 'glass' | 'classic', onPick = vi.fn()) {
  const tree = StylePicker({ value, brand: '#3b82f6', onPick }) as ReactElement<{ children: ReactElement[] }>
  const buttons = tree.props.children
  const card = (id: string) => buttons.find(b => (b.props as Record<string, unknown>)['data-style-option'] === id) as ReactElement<Record<string, any>>
  return { card, onPick }
}

describe('StylePicker', () => {
  it('shows the three styles, Clean light labelled as coming next', () => {
    const html = renderToStaticMarkup(<StylePicker value="glass" brand="#3b82f6" onPick={() => {}} />)
    expect(html).toContain('Glass')
    expect(html).toContain('Classic')
    expect(html).toContain('Clean light')
    expect(html).toContain('Coming next')
  })

  it('marks the current style as checked', () => {
    const { card } = cards('classic')
    expect(card('classic').props['aria-checked']).toBe(true)
    expect(card('glass').props['aria-checked']).toBe(false)
  })

  it('picks Glass or Classic on click', () => {
    const { card, onPick } = cards('glass')
    card('classic').props.onClick()
    card('glass').props.onClick()
    expect(onPick.mock.calls).toEqual([['classic'], ['glass']])
  })

  it('cannot pick Clean light yet', () => {
    const { card } = cards('glass')
    expect(card('light').props.disabled).toBe(true)
    expect(card('light').props.onClick).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/theme/themeSettings.test.ts src/components/settings/StylePicker.test.tsx`
Expected: FAIL, `Failed to resolve import "./themeSettings"` and `"./StylePicker"`.

- [ ] **Step 3: Implement the helpers** — `frontend/src/theme/themeSettings.ts`:

```ts
import type { ThemeStyle } from '../hooks/useTheme'

/**
 * Appearance settings that are bookkeeping, not colours. Settings →
 * Branding's Brand Colors card lists every appearance setting as a text
 * field; these three are set by the Style and Palette pickers instead, and
 * a hand-typed theme_style would only earn a 422.
 */
export const THEME_META_KEYS = ['theme_style', 'theme_preset_name', 'theme_mood'] as const

export function withoutThemeMeta<T extends { key: string }>(settings: T[]): T[] {
  return settings.filter(setting => !(THEME_META_KEYS as readonly string[]).includes(setting.key))
}

export const STYLE_NAMES: Record<ThemeStyle, string> = {
  glass: 'Glass',
  classic: 'Classic',
}

/** The settings save for a style switch. */
export function styleSettings(style: ThemeStyle): { key: string; value: string }[] {
  return [{ key: 'theme_style', value: style }]
}
```

- [ ] **Step 4: Implement the picker** — `frontend/src/components/settings/StylePicker.tsx`:

```tsx
import type { CSSProperties } from 'react'
import { Check } from 'lucide-react'
import { clsx } from 'clsx'
import type { ThemeStyle } from '../../hooks/useTheme'
import { glowsFor } from '../../theme/glass'

type StyleId = ThemeStyle | 'light'

interface StyleOption {
  id: StyleId
  name: string
  blurb: string
}

/** The styles, in the order the card row shows them. Clean light ships in part 2. */
export const STYLE_OPTIONS: StyleOption[] = [
  { id: 'glass', name: 'Glass', blurb: 'Frosted panels over a backdrop tinted by your brand colour.' },
  { id: 'classic', name: 'Classic', blurb: 'The original dark admin. Palettes also set its fonts and corners.' },
  { id: 'light', name: 'Clean light', blurb: 'Bright paper and quiet lines.' },
]

const isAvailable = (id: StyleId): id is ThemeStyle => id !== 'light'

/**
 * Settings → Branding → Style. One card per style with a small sample of
 * it. The samples use fixed colours (inline, not tokens) so each one shows
 * its own style whichever style the admin is in. Hook-free on purpose.
 */
export function StylePicker({ value, brand, onPick }: {
  value: ThemeStyle
  brand: string
  onPick: (style: ThemeStyle) => void
}) {
  return (
    <div role="radiogroup" aria-label="Admin style" className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {STYLE_OPTIONS.map(option => {
        const id = option.id
        const available = isAvailable(id)
        const active = id === value
        return (
          <button
            key={id}
            type="button"
            role="radio"
            data-style-option={id}
            aria-checked={active}
            disabled={!available}
            onClick={available ? () => onPick(id) : undefined}
            className={clsx(
              'text-left rounded-2xl border p-3 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400',
              active ? 'border-primary-400 bg-primary-500/10' : 'border-dark-border hover:border-dark-border2',
              !available && 'opacity-60 cursor-not-allowed hover:border-dark-border',
            )}
          >
            <StyleSample id={id} brand={brand} />
            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-t-primary">{option.name}</span>
              {active && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-on-primary">
                  <Check size={10} /> Active
                </span>
              )}
              {!available && (
                <span className="rounded-full border border-dark-border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-t-secondary">
                  Coming next
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-t-secondary">{option.blurb}</p>
          </button>
        )
      })}
    </div>
  )
}

const SAMPLES: Record<StyleId, { canvas: string; card: CSSProperties; ink: string; dim: string }> = {
  glass: {
    canvas: 'linear-gradient(160deg, #0B1120 0%, #0D1426 55%, #0A0F1C 100%)',
    card: { background: 'rgb(255 255 255 / 0.08)', border: '1px solid rgb(255 255 255 / 0.16)', borderRadius: 10, boxShadow: 'inset 0 1px 0 rgb(255 255 255 / 0.1)' },
    ink: '#F3F6FB',
    dim: '#C3CCD9',
  },
  classic: {
    canvas: '#0d0d0d',
    card: { background: '#161616', border: '1px solid #2c2c2c', borderRadius: 8 },
    ink: '#ffffff',
    dim: '#8e8e93',
  },
  light: {
    canvas: '#F5F5F7',
    card: { background: '#FFFFFF', border: '1px solid #E5E5EA', borderRadius: 12, boxShadow: '0 1px 2px rgb(0 0 0 / 0.06)' },
    ink: '#1D1D1F',
    dim: '#6E6E73',
  },
}

function StyleSample({ id, brand }: { id: StyleId; brand: string }) {
  const sample = SAMPLES[id]
  const background = id === 'glass'
    ? `radial-gradient(circle at 15% 10%, ${glowsFor(brand)[0]}66, transparent 60%), ${sample.canvas}`
    : sample.canvas
  return (
    <div aria-hidden="true" className="h-24 rounded-xl p-3 overflow-hidden" style={{ background }}>
      <div className="h-full p-2.5 flex flex-col gap-1.5" style={sample.card}>
        <div className="h-1.5 w-8 rounded-full" style={{ background: brand }} />
        <div className="h-2 w-3/4 rounded-full" style={{ background: sample.ink, opacity: 0.9 }} />
        <div className="h-2 w-1/2 rounded-full" style={{ background: sample.dim, opacity: 0.8 }} />
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Run them and watch them pass**

Run: `npx vitest run src/theme/themeSettings.test.ts src/components/settings/StylePicker.test.tsx`
Expected: PASS, 6 tests.

- [ ] **Step 6: Wire the Style row into `frontend/src/pages/Settings.tsx`.** Eleven edits (old → new):

  1. Line 6 imports:

```tsx
import { applyThemeToDom, persistThemeSnapshot, readCachedPreset } from '../hooks/useTheme'
```
→
```tsx
import { applyThemeToDom, persistThemeSnapshot, readCachedPreset, readThemeStyle, type ThemeStyle } from '../hooks/useTheme'
import { StylePicker } from '../components/settings/StylePicker'
import { STYLE_NAMES, styleSettings, withoutThemeMeta } from '../theme/themeSettings'
```

  2. Line 245: `const DEFAULT_PRESET = 'Gold Luxury'` → `const DEFAULT_PRESET = 'Royal Blue'`

  3. Right after `getVal` (around line 1083). Replace:

```tsx
    return ''
  }

  const handleChange = (key: string, value: string) => {
```
with:
```tsx
    return ''
  }

  // The admin style shown as active in Settings → Branding → Style. Starts
  // from what is painted, follows the saved setting once it loads, and
  // switches the moment a card is clicked (applyStyle / undo).
  const [activeStyle, setActiveStyle] = useState<ThemeStyle>(() =>
    readThemeStyle(document.documentElement.getAttribute('data-style')))
  const savedStyle = getVal('theme_style')
  useEffect(() => {
    if (savedStyle) setActiveStyle(readThemeStyle(savedStyle))
  }, [savedStyle])

  const handleChange = (key: string, value: string) => {
```

`getVal('theme_style')` is always the server's value: nothing puts `theme_style` into `editedSettings` (the Brand
Colors card no longer shows it, and `switchStyle` saves directly).

  4. The undo snapshot type. Replace:

```tsx
    toPresetName: string
    fromMood: string | null
    expiresAt: number
  } | null>(null)
```
with:
```tsx
    toPresetName: string
    fromMood: string | null
    // Set when the change being undone was a style switch: undo then
    // restores this style and leaves the palette alone.
    fromStyle: ThemeStyle | null
    expiresAt: number
  } | null>(null)
```

  5. In `applyPreset`'s snapshot. Replace:

```tsx
      toPresetName: name,
      fromMood: previousMood,
      expiresAt: Date.now() + 15_000,
    })
```
with:
```tsx
      toPresetName: name,
      fromMood: previousMood,
      fromStyle: null,
      expiresAt: Date.now() + 15_000,
    })
```

  6. Replace the doc comment and first lines of `undoPreset`:

```tsx
  /**
   * Revert to the colour palette that was active before the most
   * recent applyPreset() call. Same instant-apply + persist flow.
   */
  const undoPreset = () => {
    if (!undoSnapshot) return
    const { colors, fromPresetName, fromMood } = undoSnapshot
```
→
```tsx
  /**
   * Switch the admin style (Glass / Classic) for the whole organisation.
   * Same order as a preset: instant DOM apply, local cache, then the server
   * save. Only theme_style is saved; the palette is untouched.
   */
  const switchStyle = (style: ThemeStyle) => {
    // The saved palette; blank keys are left out so the defaults fill them.
    const colors: Record<string, string> = {}
    for (const k of COLOR_KEYS) {
      const v = getVal(k)
      if (v) colors[k] = v
    }
    setActiveStyle(style)
    applyThemeToDom(colors, undefined, style)
    persistThemeSnapshot(colors, detectActivePreset(), getVal('theme_mood') || null, style)
    saveMutation.mutate(styleSettings(style))
  }

  /** A click on a Style card: remember the current style for Undo, then switch. */
  const applyStyle = (next: ThemeStyle) => {
    if (next === activeStyle) return
    setUndoSnapshot({
      colors: {},
      fromPresetName: detectActivePreset(),
      toPresetName: STYLE_NAMES[next],
      fromMood: null,
      fromStyle: activeStyle,
      expiresAt: Date.now() + 15_000,
    })
    switchStyle(next)
  }

  /**
   * Revert the most recent preset or style change. Same instant-apply +
   * persist flow.
   */
  const undoPreset = () => {
    if (!undoSnapshot) return
    if (undoSnapshot.fromStyle) {
      const previous = undoSnapshot.fromStyle
      switchStyle(previous)
      setUndoSnapshot(null)
      toast.success(`Back to ${STYLE_NAMES[previous]}`)
      return
    }
    const { colors, fromPresetName, fromMood } = undoSnapshot
```

  7. In `renderBranding`: `const previewPrimary = getVal('primary_color') || '#c9a84c'` → `const previewPrimary = getVal('primary_color') || '#3b82f6'`

  8. Insert the Style card and rename the preset heading. Replace:

```tsx
        {/* Theme Presets */}
        <div className={cardClass} style={cardStyle}>
          <div className="flex items-start justify-between mb-1 gap-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 flex-wrap">
              <Palette size={15} className="text-emerald-400" /> Theme Presets
```
with:
```tsx
        {/* Style */}
        <div className={cardClass} style={cardStyle}>
          <div className="flex items-start justify-between mb-1 gap-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Layers size={15} className="text-emerald-400" /> Style
            </h3>
            {undoSnapshot?.fromStyle && (
              <button
                onClick={undoPreset}
                className="text-[11px] font-medium text-amber-300 hover:text-amber-200 bg-amber-500/10 hover:bg-amber-500/15 border border-amber-400/30 px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1.5"
                title={`Back to ${STYLE_NAMES[undoSnapshot.fromStyle]}`}
              >
                <Undo2 size={11} />
                Undo "{undoSnapshot.toPresetName}"
              </button>
            )}
          </div>
          <p className="text-xs text-gray-500 mb-4">The look of the whole admin, for everyone in your organisation. Glass is the default; Classic is the original dark admin.</p>
          <StylePicker value={activeStyle} brand={previewPrimary} onPick={applyStyle} />
        </div>

        {/* Theme Presets */}
        <div className={cardClass} style={cardStyle}>
          <div className="flex items-start justify-between mb-1 gap-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 flex-wrap">
              <Palette size={15} className="text-emerald-400" /> Palette
```

  9. The preset card's own undo button only for preset changes: `              {undoSnapshot && (` (the one right above `onClick={undoPreset}` inside the Palette header) → `              {undoSnapshot && !undoSnapshot.fromStyle && (`

  10. The palette note, after the preset grid. Replace:

```tsx
                onClick={() => applyPreset(name)}
              />
            ))}
          </div>
        </div>
```
with:
```tsx
                onClick={() => applyPreset(name)}
              />
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-4">In Glass a palette sets the brand colour. Its surfaces, text colours, fonts and corners apply in Classic.</p>
        </div>
```

  11. The Brand Colors card: `          {groupSettings('appearance').map(renderSettingRow)}` → `          {withoutThemeMeta(groupSettings('appearance')).map(renderSettingRow)}`

- [ ] **Step 7: Typecheck and run the suite**

Run: `npx tsc -b && npx vitest run`
Expected: tsc clean; only the 3 `plannerMeta` failures.

- [ ] **Step 8: Look at it.** With the servers from Task 10 Step 1 running, open Settings → Branding at 1440×900:
the Style row sits above Palette with three cards, Glass marked Active, Clean light dimmed with "Coming next". Click
Classic: the admin switches at once, the Undo chip appears in the Style card, a "Settings saved" toast shows; reload
stays Classic. Click Undo: back to Glass, toast "Back to Glass". Pick a palette: its Undo shows in the Palette card,
not the Style card. The Brand Colors card lists no `theme_style`, `theme_preset_name` or `theme_mood` field. Undo
any palette you picked, and switch back to the style the demo organisation started with (E7's file has it; Task 10
restores the rows exactly).

- [ ] **Step 9: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-glass && git add frontend/src/theme/themeSettings.ts frontend/src/theme/themeSettings.test.ts frontend/src/components/settings/StylePicker.tsx frontend/src/components/settings/StylePicker.test.tsx frontend/src/pages/Settings.tsx && git commit -m "Settings: choose the admin style" -m "A Style row above the presets with Glass, Classic and Clean light (coming next), each with a live sample. Switching applies at once, saves theme_style and can be undone. The preset grid is now Palette, with a note on what a palette does in Glass; Royal Blue is the default; the Brand Colors card hides the bookkeeping keys." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Colour clean-up — hard-coded classes to tokens

**Files:**
- Create: tool `.superpowers/sdd/2026-10-08-admin-glass-style/tools/codemod-raw-hex.mjs`
- Modify: 57 files under `frontend/src` (by the tool; reviewed by diff)
- Test: `frontend/src/theme/rawColourRatchet.test.ts`

**Interfaces:**
- Consumes: the Task 3 classes `text-t-muted`, `placeholder-t-muted`, `text-t-soft`, `bg-panel`, `bg-panel-dim`, `bg-well`, `bg-panel-raised`, `text-/bg-success`, `text-/bg-danger`, `text-/bg-notice`.
- Produces: the ratchet test (Task 9 lowers its legacy baseline to 0).

- [ ] **Step 1: Write the failing test** — `frontend/src/theme/rawColourRatchet.test.ts`:

```ts
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * A ratchet on hard-coded colours in the admin (portal/ and appointments/
 * have their own token sets and sweep tests). Hard-coded colours ignore the
 * admin style: on Glass they show as solid blocks or unreadable text. The
 * counts may only go down. When you remove some, lower the baseline in the
 * same commit; never raise it.
 */
const BASELINE = {
  rawHexClasses: 384,
  legacySurfaceColours: 138,
}

const SRC = path.resolve(__dirname, '..')
const RAW_HEX_CLASS = /\b[a-z][a-z-]*-\[#[0-9a-fA-F]{3,8}\]/g
// The old dark-green theme's inline colours: rgba(R, G, B, a) with R 10-39,
// G 10-59, B 10-49 and a fractional alpha.
const LEGACY_SURFACE = /rgba?\(\s*(?:1\d|2\d|3\d),\s*(?:1\d|2\d|3\d|4\d|5\d),\s*(?:1\d|2\d|3\d|4\d)\s*,\s*0?\.\d+\)/g

function adminSourceFiles(dir: string): string[] {
  return fs.readdirSync(dir).flatMap(entry => {
    const full = path.join(dir, entry)
    const rel = path.relative(SRC, full).split(path.sep).join('/')
    if (fs.statSync(full).isDirectory()) return rel === 'portal' || rel === 'appointments' ? [] : adminSourceFiles(full)
    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : []
  })
}

function count(pattern: RegExp): { total: number; byFile: string[] } {
  let total = 0
  const byFile: string[] = []
  for (const file of adminSourceFiles(SRC)) {
    const n = (fs.readFileSync(file, 'utf8').match(pattern) ?? []).length
    if (n > 0) byFile.push(`${n} ${path.relative(SRC, file)}`)
    total += n
  }
  return { total, byFile }
}

describe('hard-coded colours in the admin', () => {
  it('scans the admin source', () => {
    expect(adminSourceFiles(SRC).length).toBeGreaterThan(150)
  })

  it(`has no more than ${BASELINE.rawHexClasses} raw hex colour classes ([#…])`, () => {
    const { total, byFile } = count(RAW_HEX_CLASS)
    expect(total, `use a token instead of a raw hex class. Per file:\n${byFile.join('\n')}`).toBeLessThanOrEqual(BASELINE.rawHexClasses)
  })

  it('uses no more old dark-green inline colours (use var(--legacy-…) or a token)', () => {
    const { total, byFile } = count(LEGACY_SURFACE)
    expect(total, byFile.join('\n')).toBeLessThanOrEqual(BASELINE.legacySurfaceColours)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/theme/rawColourRatchet.test.ts`
Expected: FAIL, `expected 1337 to be less than or equal to 384` (the legacy check passes at 138).

- [ ] **Step 3: Write the tool** — `.superpowers/sdd/2026-10-08-admin-glass-style/tools/codemod-raw-hex.mjs`:

```js
// One-off: replace the most common hard-coded colour classes in the admin
// with tokens. Every token keeps the exact old colour in Classic, except
// muted text (#636366 → #8E8E93, the agreed contrast fix).
//   node codemod-raw-hex.mjs <path to frontend/src>
// Skips portal/ and appointments/ (own token sets) and test files.
import fs from 'node:fs'
import path from 'node:path'

const MAP = [
  ['text', '636366', 'text-t-muted'],
  ['placeholder', '636366', 'placeholder-t-muted'],
  ['text', 'a0a0a0', 'text-t-soft'],
  ['bg', '1e1e1e', 'bg-panel'],
  ['bg', '1a1a1a', 'bg-panel-dim'],
  ['bg', '111', 'bg-well'],
  ['bg', '333', 'bg-panel-raised'],
  ['text', '32d74b', 'text-success'],
  ['bg', '32d74b', 'bg-success'],
  ['text', 'ff375f', 'text-danger'],
  ['bg', 'ff375f', 'bg-danger'],
  ['text', '0a84ff', 'text-notice'],
  ['bg', '0a84ff', 'bg-notice'],
]

const src = path.resolve(process.argv[2])
const files = []
const walk = dir => {
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry)
    const rel = path.relative(src, full).split(path.sep).join('/')
    if (fs.statSync(full).isDirectory()) {
      if (rel !== 'portal' && rel !== 'appointments') walk(full)
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      files.push(full)
    }
  }
}
walk(src)

const counts = new Map()
let changedFiles = 0
for (const file of files) {
  const before = fs.readFileSync(file, 'utf8')
  let after = before
  for (const [prefix, hex, token] of MAP) {
    // The class must start at a boundary (space, quote, backtick, brace or a
    // variant colon) so `hover:text-[#636366]` keeps its `hover:`.
    const re = new RegExp(`(?<=^|[\\s'"\`{(:!])${prefix}-\\[#${hex}\\]`, 'gi')
    after = after.replace(re, () => {
      counts.set(token, (counts.get(token) ?? 0) + 1)
      return token
    })
  }
  if (after !== before) {
    fs.writeFileSync(file, after)
    changedFiles++
  }
}
let total = 0
for (const [token, n] of counts) {
  total += n
  console.log(`${String(n).padStart(4)}  ${token}`)
}
console.log(`${total} replacements in ${changedFiles} files`)
```

- [ ] **Step 4: Run the tool, then run it again**

Run: `cd /c/wamp64/www/Hexa-Tech-glass && node .superpowers/sdd/2026-10-08-admin-glass-style/tools/codemod-raw-hex.mjs frontend/src`
Expected: `953 replacements in 57 files` (323 t-muted, 309 t-soft, 164 panel, 47 placeholder-t-muted, 34 text-success,
19 bg-success, 17 panel-dim, 11 text-danger, 9 bg-danger, 7 well, 6 panel-raised, 5 text-notice, 2 bg-notice).
Run it again. Expected: `0 replacements in 0 files`.
If the first count differs, stop: `main` moved under the branch. Report the numbers before going on.

- [ ] **Step 5: Review the diff.** `git diff --stat` shows only `.tsx`/`.ts` files under `frontend/src` (none in
`portal/`, `appointments/` or tests), and `git diff frontend/src | grep '^[-+]' | grep -v '^[-+][-+]' | grep -vE 'text-t-muted|placeholder-t-muted|text-t-soft|bg-panel|bg-well|success|danger|notice|\[#'`
prints nothing (every changed line is a class swap).

- [ ] **Step 6: Run the ratchet and the suite**

Run: `cd frontend && npx vitest run src/theme/rawColourRatchet.test.ts`
Expected: PASS, 3 tests.
Run: `npx tsc -b && npx vitest run`
Expected: only the 3 `plannerMeta` failures.

- [ ] **Step 7: Stage and check what is staged**

Run: `cd /c/wamp64/www/Hexa-Tech-glass && git add frontend/src && git status --short`
Expected: 57 lines `M  frontend/src/…` (screens) and one `A  frontend/src/theme/rawColourRatchet.test.ts`; nothing
else. Anything else staged: unstage it (`git restore --staged <path>`) and find out why it changed.

- [ ] **Step 8: Commit**

```bash
git commit -m "Hard-coded colour classes become tokens" -m "953 class swaps in 57 files: the muted and soft greys, the panel greys and the iOS status colours now go through tokens that keep their exact Classic colours (muted text excepted, now 5.4:1) and read properly in Glass. A ratchet test keeps the remaining 384 raw hex classes from growing." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Legacy inline surfaces become variables

**Files:**
- Create: `frontend/src/theme/legacySurfaces.css`; tool `.superpowers/sdd/2026-10-08-admin-glass-style/tools/codemod-legacy-surfaces.mjs`
- Modify: `frontend/src/index.css` (import), `frontend/src/theme/glass.css` (legacy block), `frontend/src/pages/Bookings.tsx:99`, 25 screen files (by the tool), `frontend/src/theme/rawColourRatchet.test.ts` (baseline)

**Interfaces:**
- Consumes: the ratchet (Task 8); `glass.css` (Task 5).
- Produces: `--legacy-panel-60`, `--legacy-panel-50`, `--legacy-panel-raised`, `--legacy-well-60`, `--legacy-well-50`, `--legacy-well-40`, `--legacy-well-dark`, `--legacy-card`, `--legacy-card-deep`, `--legacy-card-gradient`, `--legacy-card-gradient-diagonal`, `--legacy-card-gradient-deep`, `--legacy-hero-gradient`, `--legacy-hero-gradient-soft`, `--legacy-tile-gradient`, `--legacy-success-gradient`, `--legacy-alert-gradient`.

- [ ] **Step 1: Tighten the ratchet first.** In `rawColourRatchet.test.ts`, `legacySurfaceColours: 138,` → `legacySurfaceColours: 0,`

Run: `cd /c/wamp64/www/Hexa-Tech-glass/frontend && npx vitest run src/theme/rawColourRatchet.test.ts`
Expected: FAIL, `expected 138 to be less than or equal to 0`, listing 25 files.

- [ ] **Step 2: Create `frontend/src/theme/legacySurfaces.css`** (the exact old values, so Classic is unchanged):

```css
/* ════════════════════════════════════════════════════════════════════════
   Inline backgrounds left from an older dark-green theme (the Booking
   screens, Settings cards, a few panels). Inline styles can't be themed,
   so each old value is a named variable: here it is the exact old colour,
   so Classic renders as before, and glass.css gives Glass its own values.
   Part 2 of the styles work retires these.
   ════════════════════════════════════════════════════════════════════════ */
:root {
  --legacy-panel-60: rgba(22,40,35,0.6);
  --legacy-panel-50: rgba(22,40,35,0.5);
  --legacy-panel-raised: rgba(34,51,45,0.6);
  --legacy-well-60: rgba(15,28,24,0.6);
  --legacy-well-50: rgba(15,28,24,0.5);
  --legacy-well-40: rgba(15,28,24,0.4);
  --legacy-well-dark: rgba(14,18,16,0.6);
  --legacy-card: rgba(18,24,22,0.96);
  --legacy-card-deep: rgba(14,20,18,0.98);
  --legacy-card-gradient: linear-gradient(180deg, rgba(18,24,22,0.96), rgba(14,20,18,0.98));
  --legacy-card-gradient-diagonal: linear-gradient(135deg, rgba(18,24,22,0.96), rgba(14,20,18,0.98));
  --legacy-card-gradient-deep: linear-gradient(180deg, rgba(15,28,24,0.98), rgba(10,18,16,0.99));
  --legacy-hero-gradient: linear-gradient(135deg, rgba(15,28,24,0.95), rgba(10,18,16,0.98));
  --legacy-hero-gradient-soft: linear-gradient(135deg, rgba(15,28,24,0.5), rgba(10,18,16,0.6));
  --legacy-tile-gradient: linear-gradient(180deg, rgba(22,35,30,0.96), rgba(19,33,29,0.98));
  --legacy-success-gradient: linear-gradient(180deg, rgba(18,28,22,0.96), rgba(14,22,18,0.98)), radial-gradient(circle at 100% 0, rgba(116,200,149,0.06), transparent 40%);
  --legacy-alert-gradient: linear-gradient(180deg, rgba(28,18,18,0.96), rgba(22,14,14,0.98)), radial-gradient(circle at 100% 0, rgba(228,132,111,0.06), transparent 40%);
}
```

In `frontend/src/index.css`, `@import './appointments/theme/appointments.css';` → that line followed by
`@import './theme/legacySurfaces.css';` (before the `glass.css` import).

- [ ] **Step 3: Give Glass its values.** In `frontend/src/theme/glass.css`, insert before the comment
`/* Reduced transparency, and browsers without backdrop-filter: solid`:

```css
/* The old dark-green inline surfaces (legacySurfaces.css), as glass. */
:root[data-style="glass"][data-shell="admin"] {
  --legacy-panel-60: rgb(255 255 255 / 0.07);
  --legacy-panel-50: rgb(255 255 255 / 0.06);
  --legacy-panel-raised: rgb(255 255 255 / 0.12);
  --legacy-well-60: rgb(5 8 15 / 0.45);
  --legacy-well-50: rgb(5 8 15 / 0.4);
  --legacy-well-40: rgb(5 8 15 / 0.32);
  --legacy-well-dark: rgb(5 8 15 / 0.55);
  --legacy-card: rgb(255 255 255 / 0.07);
  --legacy-card-deep: rgb(14 20 34 / 0.92);
  --legacy-card-gradient: linear-gradient(180deg, rgb(255 255 255 / 0.08), rgb(255 255 255 / 0.05));
  --legacy-card-gradient-diagonal: linear-gradient(135deg, rgb(255 255 255 / 0.08), rgb(255 255 255 / 0.05));
  --legacy-card-gradient-deep: linear-gradient(180deg, rgb(14 20 34 / 0.92), rgb(10 15 28 / 0.94));
  --legacy-hero-gradient: linear-gradient(135deg, rgb(255 255 255 / 0.09), rgb(255 255 255 / 0.05));
  --legacy-hero-gradient-soft: linear-gradient(135deg, rgb(255 255 255 / 0.06), rgb(255 255 255 / 0.03));
  --legacy-tile-gradient: linear-gradient(180deg, rgb(255 255 255 / 0.08), rgb(255 255 255 / 0.05));
  --legacy-success-gradient: linear-gradient(180deg, rgb(52 211 153 / 0.12), rgb(52 211 153 / 0.05));
  --legacy-alert-gradient: linear-gradient(180deg, rgb(251 113 133 / 0.12), rgb(251 113 133 / 0.05));
}

```

- [ ] **Step 4: Write the tool** — `.superpowers/sdd/2026-10-08-admin-glass-style/tools/codemod-legacy-surfaces.mjs`:

```js
// One-off: the old dark-green inline backgrounds become named variables
// (frontend/src/theme/legacySurfaces.css), so Classic keeps the exact old
// colour and Glass can restyle them.
//   node codemod-legacy-surfaces.mjs <path to frontend/src>
// Skips portal/, appointments/ and test files. Leaves the SVG stroke
// attribute in pages/Bookings.tsx for a hand edit (attributes can't read
// CSS variables).
import fs from 'node:fs'
import path from 'node:path'

// Whole values, longest first: gradients contain the single colours below.
const GRADIENTS = [
  ['linear-gradient(180deg, rgba(18,28,22,0.96), rgba(14,22,18,0.98)), radial-gradient(circle at 100% 0, rgba(116,200,149,0.06), transparent 40%)', 'var(--legacy-success-gradient)'],
  ['linear-gradient(180deg, rgba(28,18,18,0.96), rgba(22,14,14,0.98)), radial-gradient(circle at 100% 0, rgba(228,132,111,0.06), transparent 40%)', 'var(--legacy-alert-gradient)'],
  ['linear-gradient(180deg, rgba(18,24,22,0.96), rgba(14,20,18,0.98))', 'var(--legacy-card-gradient)'],
  ['linear-gradient(135deg, rgba(18,24,22,0.96), rgba(14,20,18,0.98))', 'var(--legacy-card-gradient-diagonal)'],
  ['linear-gradient(180deg, rgba(15,28,24,0.98), rgba(10,18,16,0.99))', 'var(--legacy-card-gradient-deep)'],
  ['linear-gradient(135deg, rgba(15,28,24,0.95), rgba(10,18,16,0.98))', 'var(--legacy-hero-gradient)'],
  ['linear-gradient(135deg, rgba(15,28,24,0.5), rgba(10,18,16,0.6))', 'var(--legacy-hero-gradient-soft)'],
  ['linear-gradient(180deg, rgba(22,35,30,0.96), rgba(19,33,29,0.98))', 'var(--legacy-tile-gradient)'],
]
// Single colours, replaced only when they are the whole quoted value.
const COLOURS = [
  ['rgba(22,40,35,0.6)', 'var(--legacy-panel-60)'],
  ['rgba(22,40,35,0.5)', 'var(--legacy-panel-50)'],
  ['rgba(34,51,45,0.6)', 'var(--legacy-panel-raised)'],
  ['rgba(15,28,24,0.6)', 'var(--legacy-well-60)'],
  ['rgba(15,28,24,0.5)', 'var(--legacy-well-50)'],
  ['rgba(15,28,24,0.4)', 'var(--legacy-well-40)'],
  ['rgba(14,18,16,0.6)', 'var(--legacy-well-dark)'],
  ['rgba(18,24,22,0.96)', 'var(--legacy-card)'],
  ['rgba(14,20,18,0.98)', 'var(--legacy-card-deep)'],
]

const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const src = path.resolve(process.argv[2])
const files = []
const walk = dir => {
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry)
    const rel = path.relative(src, full).split(path.sep).join('/')
    if (fs.statSync(full).isDirectory()) {
      if (rel !== 'portal' && rel !== 'appointments') walk(full)
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      files.push(full)
    }
  }
}
walk(src)

const counts = new Map()
let changedFiles = 0
const bump = name => counts.set(name, (counts.get(name) ?? 0) + 1)
for (const file of files) {
  const before = fs.readFileSync(file, 'utf8')
  let after = before
  for (const [value, variable] of GRADIENTS) {
    after = after.replace(new RegExp(escape(value), 'g'), () => { bump(variable); return variable })
  }
  for (const [value, variable] of COLOURS) {
    after = after.replace(new RegExp(`(['\`])${escape(value)}\\1`, 'g'), (_m, q) => { bump(variable); return `${q}${variable}${q}` })
  }
  if (after !== before) {
    fs.writeFileSync(file, after)
    changedFiles++
  }
}
let total = 0
for (const [variable, n] of counts) {
  total += n
  console.log(`${String(n).padStart(4)}  ${variable}`)
}
console.log(`${total} replacements in ${changedFiles} files`)
```

- [ ] **Step 5: Run the tool**

Run: `cd /c/wamp64/www/Hexa-Tech-glass && node .superpowers/sdd/2026-10-08-admin-glass-style/tools/codemod-legacy-surfaces.mjs frontend/src`
Expected: `97 replacements in 25 files`. A second run: `0 replacements in 0 files`.

- [ ] **Step 6: The hand edit.** `frontend/src/pages/Bookings.tsx:99`:

```tsx
          <circle cx={86} cy={86} r={radius} fill="none" stroke="rgba(34,51,45,0.6)" strokeWidth={stroke} />
```
→
```tsx
          <circle cx={86} cy={86} r={radius} fill="none" style={{ stroke: 'var(--legacy-panel-raised)' }} strokeWidth={stroke} />
```

- [ ] **Step 7: Run the tests and the suite**

Run: `cd frontend && npx vitest run src/theme/rawColourRatchet.test.ts src/theme/glassCss.test.ts`
Expected: PASS (3 + 5).
Run: `npx tsc -b && npx vitest run`
Expected: only the 3 `plannerMeta` failures.

- [ ] **Step 8: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-glass && git add frontend/src && git commit -m "Old dark-green inline surfaces become variables" -m "98 inline values in 25 files (Booking screens, Settings cards) now read --legacy-* variables: the exact old colours in Classic, glass tints in Glass. The ratchet now forbids the old values." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Visual pass and fixes

Spec §9.2. Eyes first, in a real browser, Glass and Classic. Use the Playwright MCP (or Chrome DevTools MCP) tools;
save screenshots under `C:\wamp64\www\Hexa-Tech-glass\.playwright-mcp\` (git-ignored).

**Files:** fixes only, each in the file that owns it: selector sets in `frontend/src/theme/glass.css` (keep
`glassCss.test.ts` green and extend `OVERLAY_SURFACES` if a new surface class is added), token values in
`glassTokens.ts` (keep `glassContrast.test.ts` green), or a one-line class swap in a screen using only the token
mapping from Task 8. Anything else goes on the leftovers list for Part 2.

- [ ] **Step 1: Start the servers.**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8000/api/v1/theme
```

If that prints a status code, port 8000 is taken (another checkout's server): use 8010 below and start Vite with
`VITE_API_URL=http://127.0.0.1:8010/api`. Never stop a server you did not start.

```bash
cd /c/wamp64/www/Hexa-Tech-glass && /c/wamp64/bin/php/php8.4.20/php.exe artisan serve --port=8000
cd /c/wamp64/www/Hexa-Tech-glass/frontend && npm run dev
```

(Both with `run_in_background`.) Open `http://localhost:5173` (use `localhost`, not `127.0.0.1`: the API client
treats any other host as production). Log in as the local demo admin (credentials are in the local-dev notes; ask
the owner if you do not have them; never write them into a file).

- [ ] **Step 2: Confirm the record from E7 exists** (`.superpowers/sdd/2026-10-08-admin-glass-style/local-theme-before.json`,
  written before any task touched the local database). If it is missing, stop: the restore in Step 9 needs it.

- [ ] **Step 3: Glass at 1440×900.** Screenshot and check each: Dashboard `/`; Members `/members` and one member
`/members/:id`; Leads `/leads` and the lead drawer (open the first lead); Deals `/deals`; Bookings `/bookings`, one
booking `/bookings/:id`, `/bookings/calendar`, `/bookings/payments`, `/bookings/submissions`; Service bookings
`/service-bookings` and `/service-bookings/calendar`; Planner `/planner` (day, week, month); Chat inbox `/chat-inbox`;
Campaigns `/campaigns`; Reviews `/marketing?tab=reviews`; Settings → Branding, Pipelines, Planner; Landing pages
`/landing-pages` (the editor); Billing `/billing` (including the Stripe card field, which keeps its own dark theme).
Check on every screen:
  - backdrop glows visible; sidebar floating with 12px margins and rounded corners; header bar glass;
  - no solid grey or dark-green block where a panel should be glass (list each with file:line from a DOM inspect);
  - every text readable (no grey-on-grey); brand text light enough; status chips readable;
  - Space Grotesk on page titles and big numbers (computed `font-family` on a `text-2xl` title);
  - focus rings visible: Tab through Settings → Branding.
- [ ] **Step 4: Every overlay once, in Glass:** a dropdown menu, a popover (date picker), a modal (any "New…"), a
drawer (lead drawer), a sticky table header while scrolling (Members), the Cmd+K search, a toast, the AI chat panel,
the mobile drawer and bottom nav (next step). Each must be the darker blurred glass with readable text over busy
content. A miss is a selector fix in `glass.css` (and `OVERLAY_SURFACES` in the test).
- [ ] **Step 5: Glass at 390×844:** Dashboard, Members, Leads, Planner, Settings → Branding; open the mobile drawer;
check the bottom navigation (glass, readable, active item in the lifted brand colour).
- [ ] **Step 6: Classic at 1440×900.** Switch to Classic in Settings → Branding and repeat Step 3's list. For a
baseline, run the untouched admin from `origin/main` side by side:

```bash
cd /c/wamp64/www/Hexa-Tech && git worktree add ../Hexa-Tech-glass-base origin/main
cmd //c mklink //J "C:\\wamp64\\www\\Hexa-Tech-glass-base\\frontend\\node_modules" "C:\\wamp64\\www\\Hexa-Tech-portal\\frontend\\node_modules"
cp /c/wamp64/www/Hexa-Tech-glass/frontend/.env /c/wamp64/www/Hexa-Tech-glass-base/frontend/.env
cd /c/wamp64/www/Hexa-Tech-glass-base/frontend && npx vite --port 5174
```

(Vite in the background; it talks to the same local back end. Both dev servers share the junctioned
`node_modules/.vite` cache; if one reports a stale dependency, restart it with `--force`.) Expected differences only: muted text lighter
(`#8E8E93`); and, if this machine has no Inter installed, the interface now in Inter (it never loaded before). Any
other difference is a bug: find the class or variable that changed and fix it. Then stop the 5174 server and remove
the base worktree: `cmd //c rmdir "C:\\wamp64\\www\\Hexa-Tech-glass-base\\frontend\\node_modules"` first, then
`git worktree remove ../Hexa-Tech-glass-base` (from `C:\wamp64\www\Hexa-Tech`).
- [ ] **Step 7: Performance.** Back in Glass, record a Chrome performance trace (Chrome DevTools MCP
`performance_start_trace` / `performance_stop_trace`) while scrolling Members and the Planner month view for ~5 s
each. Expected: no long frames attributed to paint or compositing of the blurred layers. A problem is fixed by
narrowing the blur selectors, never by dropping the contrast rules.
- [ ] **Step 8: Other engines.** If Firefox is installed, open the Dashboard and one modal there. Safari (iPad) is an
owner check after release (Task 11 owner notes).
- [ ] **Step 9: Restore the local data.** Compare the four keys with `local-theme-before.json`: delete any
`theme_style` row whose id is not in the file, and set changed values back, with `artisan tinker --execute` one-liners
naming the row ids. Re-run E7's command with the output going to `local-theme-after.json` and diff the two files:
they must match.
- [ ] **Step 10: Stop the servers you started.**
- [ ] **Step 11: Write the findings** to `.superpowers/sdd/2026-10-08-admin-glass-style/visual-pass.md`: per screen,
pass or the issue; what was fixed (commit); leftovers for Part 2 with file:line (expected: the raw hex surfaces such
as Settings' `bg-[#0f1c18]` inputs and a few `bg-[#161616]`/`bg-[#171717]` panels).
- [ ] **Step 12: Run everything and commit the fixes**

```bash
cd /c/wamp64/www/Hexa-Tech-glass/frontend && npx tsc -b && npx vitest run
cd /c/wamp64/www/Hexa-Tech-glass && /c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Settings/
```

Expected suite results as before. Then stage only `frontend/src` (check `git status --short`), and commit with the
title `Glass visual pass fixes`, a body of one line per fix naming the screen and the change (for example
`Date picker popover gets the overlay glass (bg-panel-dim added to the overlay set)`), and the `Co-Authored-By` line.
Skip the commit if the pass found nothing to fix.

---

### Task 11: Release (only after the owner's go-ahead)

Merging to `main` is a production deploy (Laravel Cloud rebuilds the SPA; no migration in this change). Recipe:
`docs/landing-page-builder.md` §6.

- [ ] **Step 1: Ask the owner** for the go-ahead with a short summary: everyone opens in Glass; Classic one click
away; the visual-pass findings and leftovers. Stop here until the owner says yes in this conversation.
- [ ] **Step 2: Deploy worktree from the current `origin/main`:**

```bash
cd /c/wamp64/www/Hexa-Tech && git fetch origin && git worktree add ../Hexa-Tech-glass-deploy -B deploy/admin-glass origin/main
```

Then, as in E2–E4: robocopy `vendor` (PowerShell), `composer dump-autoload -o`, copy `.env` and `frontend/.env`,
junction `frontend/node_modules` to the portal's.
- [ ] **Step 3: The change list,** from the branch, guarded:

```bash
cd /c/wamp64/www/Hexa-Tech-glass-deploy && git diff --name-status origin/main...feature/admin-glass-style
```

Allowed paths only: `docs/superpowers/specs/2026-10-08-admin-glass-style-design.md`,
`docs/superpowers/plans/2026-10-08-admin-glass-style.md`, `frontend/src/**`, `frontend/tailwind.config.js`,
`app/Http/Controllers/Api/V1/Admin/SettingsController.php`, `tests/Feature/Settings/ThemeStyleSettingTest.php`. Any
`frontend/dist`, `public/spa`, `resources/spa-shell` or `database/migrations` entry: stop and report. Apply A/M
with `git checkout feature/admin-glass-style -- <file>` per file; a D with `git rm` (none expected).
- [ ] **Step 4: Parity.** `git diff --cached feature/admin-glass-style -- <the same paths>` prints nothing. If
`origin/main` changed any of these files since `3f8edcd18`, stop: the checkout would revert someone else's work;
rebase the feature branch first and redo the visual pass of the affected screens.
- [ ] **Step 5: Commit the source.**

```bash
git commit -m "Glass: the admin's new default style, with a Style setting" -m "Every organisation opens the admin in Glass; Settings → Branding → Style switches back to Classic. Admin tokens read a style layer before the palette, so Classic renders as before apart from lighter muted text. theme_style is validated server-side, a fresh organisation's palette is Royal blue, and Inter, Space Grotesk and JetBrains Mono now load." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Tests on the artifact:**

```bash
cd /c/wamp64/www/Hexa-Tech-glass-deploy && /c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Settings/
/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Landing/
cd frontend && npx tsc -b && npx vitest run && npm run build
```

Expected: PHP green; the 3 `plannerMeta` failures only; the build succeeds with the single preset-fonts `@import`
warning. Then commit the build:

```bash
cd /c/wamp64/www/Hexa-Tech-glass-deploy && git add frontend/dist public/spa resources/spa-shell && git commit -m "Rebuild the admin SPA for Glass" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
- [ ] **Step 7: Push:** `git push origin deploy/admin-glass:main`.
- [ ] **Step 8: Verify by content** once Laravel Cloud has deployed (never by status code or file hash):

```bash
curl -s https://app.hexa-tech.uk/ | grep -o '/spa/assets/index-[^"]*\.css' | head -1
```

Fetch that CSS: it must start with the Google Fonts `@import` and contain `[data-style=glass][data-shell=admin]`.
The main JS bundle (or the Settings chunk) must contain `Coming next` and `theme_style`.
- [ ] **Step 9: Clean up:** `cmd //c rmdir` the deploy worktree's `frontend\node_modules` junction first, then
`git worktree remove ../Hexa-Tech-glass-deploy`. Keep `feature/admin-glass-style` and its worktree (Part 2 starts from it).
- [ ] **Step 10: Owner notes** (send to the owner):
  - Every organisation, FDS Cards included, now opens in Glass. To go back: Settings → Branding → Style → Classic (Undo works for 15 seconds).
  - To match the mock exactly: pick the Royal Blue palette.
  - Please open the admin once on the iPad (Safari) and, if you use it, Firefox.
  - Decision for you: the preset fonts (Garamond, Playfair, Lora, …) have never loaded in production. Loading them would change Classic's look for every organisation on a preset.
  - Part 2 (Clean light) starts from the leftovers list in the visual-pass notes.
