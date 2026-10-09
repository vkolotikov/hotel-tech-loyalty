# Clean light (admin style Part 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third admin style, Clean light, that every organisation can pick in Settings → Branding → Style after the owner previews it on production, while Glass and Classic stay exactly as they are.

**Architecture:** Same structure as Glass: token values from `lightTokens.ts` are written by the Tailwind plugin into a block scoped to `:root[data-style="light"][data-shell="admin"]`; `light.css` holds what tokens cannot. Tailwind's `white` reads `--hx-white` (white everywhere, ink in light), hard-coded colour classes become `hx-*` classes whose fallback is their exact old colour, true whites become `on-fill`, and the screens are then checked and finished group by group.

**Tech Stack:** React 19, TypeScript, Vite 5, Tailwind 3.4, vitest (node env), Laravel 13 (one validation constant), Playwright for screenshots.

**Spec:** `docs/superpowers/specs/2026-10-09-admin-clean-light-design.md` (owner-approved 2026-10-09; §9 lists the planning refinements).

## Global Constraints

- Work in `C:\wamp64\www\Hexa-Tech-glass` on `feature/admin-glass-style`. Never push this branch to `main`; never commit its built `frontend/dist` / `public/spa`.
- Every light rule and variable is scoped to `:root[data-style="light"][data-shell="admin"]` (`LIGHT_SCOPE`). Login, member portal (`frontend/src/portal`), Appointments (`frontend/src/appointments`), landing pages, e-mail and widget preview canvases do not change.
- Glass and Classic render exactly as before: every new variable's fallback is the old literal; `--hx-white` defaults to `255 255 255`; `on-fill` is `255 255 255`.
- Text in light reads at 4.5:1 or better on canvas `#F4F6F8`, surface `#FFFFFF`, surface-2 `#F7F9FB` and hover `#EEF2F5`; brand-button text keeps the 2026-10-09 rule (white while white ≥ 3:1, ink `#03050A` below; `onColor`, unchanged).
- Fonts are self-hosted under HX names (`'HX Geist'`, `'HX Geist Mono'`, existing `'HX Inter'`); no Google request.
- Frontend checks: `cd frontend && npx tsc -b && npx vitest run` (3 `plannerMeta` failures are pre-existing). PHP: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/<Dir>/...` scoped, never bare.
- Prefer the Edit/Write tools for file changes; codemod scripts live outside the repo (scratchpad) and are not committed.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never echo credentials. Local browser checks never save settings through the UI without restoring the rows afterwards (the PWA service worker defeats `page.route` interception).
- Deploys use the source-patch recipe (CLAUDE.md; `docs/landing-page-builder.md` §6): worktree from `origin/main`, the change list, tests on the artifact, fresh build, push, verify by content (poll the CSS file name; Cloud rebuilds the JS).

## Review Focus

1. **Data-coloured fills with white text** (tier pills, stage chips, brand swatches drawn with an inline `style={{ background }}` and `text-white`): text must stay readable in light. Pinned by the inline-fill guard in Task 6.
2. **Device preview leaking**: a non-super-admin setting the preview flag, or the preview being saved into the organisation's theme snapshot, must not happen. Pinned in Task 3.
3. **Native controls** (select option lists, date pickers) must render light inside the light admin and dark everywhere else. Pinned in Task 4 (`color-scheme` rules) and checked in every group's screenshots.
4. **Overlays** (menus, drawers, modals, toasts) must be opaque white with a shadow in light, never see-through. Pinned in Task 4 (overlay rule) and checked per group.
5. **Brands at the edges** (white `#ffffff`, near-white `#f5f5f5`, pale yellow `#fde68a`, black, navy) must keep readable brand text and button text in light. Pinned by `lightContrast.test.ts` over all 28 fixture brands (Task 1).

---

## File map

| File | Responsibility |
|---|---|
| `frontend/src/theme/lightTokens.ts` (new) | Every Clean light value: scope, surfaces, text, greys, coloured-text shades, status, sidebar accents, radius, fonts, deepening target. |
| `frontend/src/theme/light.ts` (new) | Runtime rules: `deepenForLight`, `brandLightVariables`, `lightTextFor`, `lightFillFor`. |
| `frontend/src/theme/hxColours.ts` (new) | The registry of hard-coded colours (`HX_TEXT`, `HX_FILL`), the keep-list and overrides. |
| `frontend/src/theme/lightVariables.ts` (new) | Build-time: the light variable block for the Tailwind plugin. |
| `frontend/src/theme/hx.ts` (new) | Inline-style helpers: `hx()`, `hxWhite()`, `HX_COLOR_SCHEME`, `useIsLight()`, `LIGHT_CHART`. |
| `frontend/src/theme/light.css` (new) | Fonts, shell, sidebar, header, body, mobile nav, cards, overlays, scrollbars, native controls, legacy surfaces. |
| `frontend/src/theme/fonts/geist-var.woff2`, `geist-mono-var.woff2`, `OFL-Geist.txt` (new) | Self-hosted Geist (OFL 1.1, from npm `geist@1.3.1`). |
| `frontend/src/lib/stylePreview.ts` (new) | The super-admin device preview flag. |
| `frontend/tailwind.config.js` | `white` → `--hx-white`, `on-fill`, `hx` families, extra grey text shades, the light plugin block. |
| `frontend/src/hooks/useTheme.ts` | `light` in `THEME_STYLES`/`readThemeStyle`, light brand variables, preview-aware `data-style`. |
| `frontend/src/index.css` | Import `light.css`; mood rules skip the light admin too. |
| `frontend/src/components/Layout.tsx` | Sidebar accent variables for light. |
| `frontend/src/components/settings/StylePicker.tsx`, `frontend/src/pages/Settings.tsx` | Preview button (Task 15), Clean light available (Task 16). |
| `app/Http/Controllers/Api/V1/Admin/SettingsController.php` | `THEME_STYLES` gains `light` (Task 16). |
| Tests (new): `theme/light.test.ts`, `theme/lightContrast.test.ts`, `theme/lightCss.test.ts`, `theme/hxColours.test.ts`, `theme/onFill.test.ts`, `theme/hx.test.ts`, `theme/lightSweep.test.ts`, `lib/stylePreview.test.ts` | |

---

### Task 1: Light tokens and the light colour rules

**Files:**
- Create: `frontend/src/theme/lightTokens.ts`, `frontend/src/theme/light.ts`, `frontend/src/theme/hxColours.ts`
- Test: `frontend/src/theme/light.test.ts`, `frontend/src/theme/lightContrast.test.ts`

**Interfaces:**
- Consumes: `colour.ts` (`SHADES`, `blend`, `contrast`, `hexToRgb`, `hslToRgb`, `rgbToHex`, `rgbToHsl`, `shadeScale`, `luminance`, `type RGB`), `glassTokens.ts` (`SHIFTED_HUES`, `COLOURED_TEXT_SHADES`, `GREY_HUES`, `type SurfaceToken`, `type StatusToken`), `__fixtures__/brandColours.ts`.
- Produces: `LIGHT_SCOPE`, `LIGHT_CANVAS`, `LIGHT_INK`, `LIGHT_SURFACES`, `LIGHT_TEXT`, `LIGHT_GREY_SHADES`, `LIGHT_GREY_TEXT`, `LIGHT_TEXT_SHADE`, `LIGHT_STATUS_TEXT`, `LIGHT_NAV_ACCENT_TEXT`, `LIGHT_RADIUS`, `LIGHT_THEME_RADIUS`, `LIGHT_FONTS`, `DEEPEN_TARGET`, `DEEPEN_TINT_ALPHA`; `deepenForLight(brandHex: string): string`, `brandLightVariables(brandHex: string): Record<string, string>`, `lightTextFor(hex6: string): string`, `lightFillFor(hex6: string): string`; `HX_TEXT: readonly string[]`, `HX_FILL: readonly string[]` (6-digit lowercase, no `#`), `LIGHT_HEX_KEEP: readonly string[]`, `LIGHT_HEX_OVERRIDES: { t: Record<string, string>; f: Record<string, string> }`.

- [ ] **Step 1: Write the failing tests**

`frontend/src/theme/light.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { blend, contrast, hexToRgb } from './colour'
import { brandLightVariables, deepenForLight, lightFillFor, lightTextFor } from './light'
import { DEEPEN_TARGET, DEEPEN_TINT_ALPHA, LIGHT_CANVAS, LIGHT_SURFACES, LIGHT_TEXT } from './lightTokens'
import { BRAND_COLOURS } from './__fixtures__/brandColours'

const rgb = hexToRgb

describe('deepenForLight', () => {
  it('deepens Royal blue until it reads on a 10 % brand tint over the canvas', () => {
    expect(deepenForLight('#3b82f6')).toBe('#0A5BDF')
  })

  it('leaves a colour that already reads alone', () => {
    expect(deepenForLight('#1e3a8a')).toBe('#1E3A8A')
    expect(deepenForLight('#000000')).toBe('#000000')
  })

  it('reaches the target for every fixture brand', () => {
    for (const brand of BRAND_COLOURS) {
      const tint = blend(rgb(brand), DEEPEN_TINT_ALPHA, rgb(LIGHT_CANVAS))
      expect(contrast(rgb(deepenForLight(brand)), tint), brand).toBeGreaterThanOrEqual(DEEPEN_TARGET)
    }
  })
})

describe('brandLightVariables', () => {
  it('writes ten --light-primary shades; 50 to 500 are the deepened colour itself', () => {
    const vars = brandLightVariables('#3b82f6')
    expect(Object.keys(vars).filter(k => k.startsWith('--light-primary-'))).toHaveLength(10)
    expect(vars['--light-primary-300']).toBe('10 91 223')
    expect(vars['--light-primary-500']).toBe('10 91 223')
    expect(vars['--light-primary-700']).not.toBe(vars['--light-primary-500'])
  })
})

describe('lightTextFor (hard-coded text colours)', () => {
  it('maps greys by prominence: the brightest grey on dark becomes the ink', () => {
    expect(lightTextFor('e0e0e0')).toBe(LIGHT_TEXT.primary)
    expect(lightTextFor('c8c8c8')).toBe(LIGHT_TEXT.soft)
    expect(lightTextFor('888888')).toBe('#4A5863')
    expect(lightTextFor('444444')).toBe(LIGHT_TEXT.secondary)
  })

  it('deepens coloured text until it reads on paper', () => {
    const out = lightTextFor('22d3ee')
    expect(contrast(rgb(out), rgb(LIGHT_CANVAS))).toBeGreaterThanOrEqual(4.5)
    expect(contrast(rgb(out), rgb('#FFFFFF'))).toBeGreaterThanOrEqual(4.5)
  })

  it('keeps colours already designed for a light card', () => {
    expect(lightTextFor('1b2a34')).toBe('#1B2A34')
    expect(lightTextFor('54626e')).toBe('#54626E')
  })
})

describe('lightFillFor (hard-coded fills, borders, gradient stops)', () => {
  it('turns dark surfaces into paper, by how dark they were', () => {
    expect(lightFillFor('0a0a0a')).toBe(LIGHT_SURFACES['dark-bg'])
    expect(lightFillFor('1c1c1e')).toBe(LIGHT_SURFACES['dark-surface'])
    expect(lightFillFor('333333')).toBe(LIGHT_SURFACES['dark-border'])
  })

  it('keeps coloured fills (brand, status, WhatsApp) as they are', () => {
    expect(lightFillFor('c9a84c')).toBe('#C9A84C')
    expect(lightFillFor('25d366')).toBe('#25D366')
    expect(lightFillFor('ef4444')).toBe('#EF4444')
  })

  it('keeps colours already designed for a light card', () => {
    expect(lightFillFor('dde3e8')).toBe('#DDE3E8')
  })
})
```

`frontend/src/theme/lightContrast.test.ts`:

```ts
import colors from 'tailwindcss/colors'
import { describe, expect, it } from 'vitest'
import { blend, contrast, hexToRgb, shadeScale, type RGB } from './colour'
import { onColor } from './glass'
import { COLOURED_TEXT_SHADES, SHIFTED_HUES, type StatusToken } from './glassTokens'
import { deepenForLight, lightTextFor } from './light'
import {
  LIGHT_GREY_TEXT, LIGHT_NAV_ACCENT_TEXT, LIGHT_STATUS_TEXT, LIGHT_SURFACES, LIGHT_TEXT, LIGHT_TEXT_SHADE,
} from './lightTokens'
import { HX_TEXT } from './hxColours'
import { BRAND_COLOURS } from './__fixtures__/brandColours'

/**
 * Clean light text must read at 4.5:1 or better on the four surfaces text
 * sits on: canvas, surface (white), surface-2 and hover. Status, coloured
 * and brand text also on their own tints.
 */
const FLOOR = 4.5
const rgb = (hex: string) => hexToRgb(hex)
const SURFACES: Record<string, RGB> = {
  canvas: rgb(LIGHT_SURFACES['dark-bg']),
  surface: rgb(LIGHT_SURFACES['dark-surface']),
  'surface-2': rgb(LIGHT_SURFACES['dark-surface2']),
  hover: rgb(LIGHT_SURFACES['dark-hover']),
}
const STATUS_FILLS: Record<StatusToken, string> = {
  accent: '#32d74b', success: '#32d74b', warning: '#ffd60a', error: '#ff375f', danger: '#ff375f', info: '#0a84ff', notice: '#0a84ff',
}
const SIDEBAR = rgb('#ECEFF3')

describe('Clean light contrast', () => {
  it('text tokens and every grey step read on every surface', () => {
    for (const [name, hex] of Object.entries({ ...LIGHT_TEXT, ...LIGHT_GREY_TEXT })) {
      for (const [where, surface] of Object.entries(SURFACES)) {
        expect(contrast(rgb(hex), surface), `${name} ${hex} on ${where}`).toBeGreaterThanOrEqual(FLOOR)
      }
    }
  })

  it('status text reads on its own 12 % tint over white and on hover', () => {
    for (const [name, hex] of Object.entries(LIGHT_STATUS_TEXT)) {
      const tint = blend(rgb(STATUS_FILLS[name as StatusToken]), 0.12, SURFACES.surface)
      expect(contrast(rgb(hex), tint), name).toBeGreaterThanOrEqual(FLOOR)
      expect(contrast(rgb(hex), SURFACES.hover), name).toBeGreaterThanOrEqual(FLOOR)
    }
  })

  it('coloured text (each hue at its light shade) reads on paper and on its own 12 % tint', () => {
    for (const hue of SHIFTED_HUES) {
      const text = rgb(colors[hue][LIGHT_TEXT_SHADE[hue]])
      const tint = blend(rgb(colors[hue][500]), 0.12, SURFACES.surface)
      for (const [where, surface] of Object.entries({ ...SURFACES, tint })) {
        expect(contrast(text, surface), `${hue} on ${where}`).toBeGreaterThanOrEqual(FLOOR)
      }
    }
    expect(COLOURED_TEXT_SHADES.length).toBeGreaterThan(0)
  })

  it.each(BRAND_COLOURS)('brand text and brand buttons read for brand %s', brand => {
    const deep = rgb(deepenForLight(brand))
    const tint = blend(rgb(brand), 0.1, SURFACES.canvas)
    expect(contrast(deep, tint), 'on its tint').toBeGreaterThanOrEqual(FLOOR)
    expect(contrast(deep, SURFACES.hover), 'on hover').toBeGreaterThanOrEqual(FLOOR)
    const s600 = shadeScale(deepenForLight(brand))[600].split(' ').map(Number) as RGB
    expect(contrast(s600, tint), 'shade 600 on its tint').toBeGreaterThanOrEqual(FLOOR)
    expect(contrast(rgb(onColor(brand)), rgb(brand)), 'button text').toBeGreaterThanOrEqual(3)
  })

  it('sidebar section labels and the active item read on the light sidebar and on a 16 % accent wash', () => {
    for (const [accent, text] of Object.entries(LIGHT_NAV_ACCENT_TEXT)) {
      expect(contrast(rgb(text), SIDEBAR), accent).toBeGreaterThanOrEqual(FLOOR)
      expect(contrast(rgb(text), blend(rgb(accent), 0.16, SIDEBAR)), `${accent} wash`).toBeGreaterThanOrEqual(FLOOR)
      expect(contrast(rgb(text), SURFACES.surface), `${accent} on the white active pill`).toBeGreaterThanOrEqual(FLOOR)
    }
  })

  it('every registered hard-coded text colour reads on paper in light', () => {
    for (const hex of HX_TEXT) {
      for (const [where, surface] of Object.entries(SURFACES)) {
        expect(contrast(rgb(lightTextFor(hex)), surface), `#${hex} on ${where}`).toBeGreaterThanOrEqual(FLOOR)
      }
    }
  })
})
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `cd frontend && npx vitest run src/theme/light.test.ts src/theme/lightContrast.test.ts`
Expected: FAIL, "Failed to load url ./light" (modules do not exist).

- [ ] **Step 3: Write `lightTokens.ts`**

```ts
// Type-only import is enough: SHIFTED_HUES is only used in `typeof` (verbatimModuleSyntax is on).
import type { SHIFTED_HUES, StatusToken, SurfaceToken } from './glassTokens'

/**
 * Every value that makes the admin look like Clean light (spec
 * 2026-10-09-admin-clean-light-design.md §3). The Tailwind plugin writes them
 * into the stylesheet (lightVariables.ts), the theme code reads the brand
 * rule (light.ts), and lightContrast.test.ts measures them.
 *
 * Clean light applies only inside the signed-in admin: <html> carries
 * data-style="light" from the theme code and data-shell="admin" while the
 * admin Layout is mounted.
 */
export const LIGHT_SCOPE = ':root[data-style="light"][data-shell="admin"]'

/** Paper: the page behind cards, inputs and wells. */
export const LIGHT_CANVAS = '#F4F6F8'

/** The ink: body text, and what Tailwind's `white` means inside the style. */
export const LIGHT_INK = '#1B2A34'

/** Surface tokens in Clean light. All opaque. */
export const LIGHT_SURFACES: Record<SurfaceToken, string> = {
  'dark-bg': '#F4F6F8',
  'dark-surface': '#FFFFFF',
  'dark-surface2': '#F7F9FB',
  'dark-card': '#F7F9FB',
  'dark-surface3': '#EEF2F5',
  'dark-hover': '#EEF2F5',
  'dark-surface4': '#E6EBEF',
  'dark-border': '#DDE3E8',
  'dark-border2': '#CBD3DA',
  panel: '#FFFFFF',
  'panel-dim': '#F7F9FB',
  'panel-raised': '#EEF2F5',
  well: '#F4F6F8',
}

/** Text tokens, strongest first. */
export const LIGHT_TEXT = {
  primary: '#1B2A34',
  soft: '#3A4853',
  secondary: '#54626E',
  muted: '#54626E',
} as const

/**
 * Grey text classes (text-gray-*, text-slate-*, placeholders) keep their
 * order: on dark the lightest grey was the most prominent, here the darkest.
 * 100, 200, 700 and 800 were plain Tailwind colours before this style.
 */
export const LIGHT_GREY_SHADES = [100, 200, 300, 400, 500, 600, 700, 800] as const
export const LIGHT_GREY_TEXT: Record<(typeof LIGHT_GREY_SHADES)[number], string> = {
  100: '#1B2A34',
  200: '#1B2A34',
  300: '#2E3C47',
  400: '#3D4B56',
  500: '#4A5863',
  600: '#54626E',
  700: '#54626E',
  800: '#54626E',
}

/**
 * Coloured text (text-red-400, text-amber-300 …) in Clean light: the hue's
 * 700 shade, or 800 where 700 falls under 4.5:1 on its own tint (measured
 * 2026-10-09: orange 4.58, amber 4.46, yellow 4.37, lime 4.44, green 4.46).
 */
export const LIGHT_TEXT_SHADE: Record<(typeof SHIFTED_HUES)[number], 700 | 800> = {
  red: 700, orange: 800, amber: 800, yellow: 800, lime: 800, green: 800, emerald: 700, teal: 700, cyan: 700,
  sky: 700, blue: 700, indigo: 700, violet: 700, purple: 700, fuchsia: 700, pink: 700, rose: 700,
}

/** Status colours as text (fills keep the palette's colours). */
export const LIGHT_STATUS_TEXT: Record<StatusToken, string> = {
  accent: '#17643B',
  success: '#17643B',
  warning: '#8A4B00',
  error: '#A3243B',
  danger: '#A3243B',
  info: '#1D4FA8',
  notice: '#1D4FA8',
}

/**
 * The sidebar's section accents (Tailwind 400 shades, inline in Layout.tsx)
 * as text on the light sidebar: each hue's 800 shade (700 fell to 4.1-4.6:1
 * on the active item's wash for amber, emerald, cyan, pink and sky).
 */
export const LIGHT_NAV_ACCENT_TEXT: Record<string, string> = {
  '#60a5fa': '#1e40af', // blue
  '#a78bfa': '#5b21b6', // violet
  '#38bdf8': '#075985', // sky
  '#fbbf24': '#92400e', // amber
  '#34d399': '#065f46', // emerald
  '#f472b6': '#9d174d', // pink
  '#22d3ee': '#155e75', // cyan
  '#9ca3af': '#1f2937', // gray
}

/** Tailwind's corner scale in Clean light (cards 14 px, controls 10 px). */
export const LIGHT_RADIUS = { md: '6px', lg: '10px', xl: '14px', '2xl': '14px', '3xl': '18px' } as const
export const LIGHT_THEME_RADIUS = { tight: '6px', base: '10px', card: '14px' } as const

/** Faces: Geist for headings, Inter for text, Geist Mono for figures; all self-hosted. */
export const LIGHT_FONTS = {
  body: "'HX Inter', 'Inter', system-ui, sans-serif",
  display: "'HX Geist', 'HX Inter', 'Inter', system-ui, sans-serif",
  data: "'HX Geist Mono', ui-monospace, Menlo, Consolas, monospace",
} as const

/** Brand text is deepened until it reads this ratio on a 10 % brand tint over the canvas. */
export const DEEPEN_TARGET = 4.8
export const DEEPEN_TINT_ALPHA = 0.1
```

- [ ] **Step 4: Write `hxColours.ts`**

Start with empty registries (Task 5 fills them) and the keep-list:

```ts
/**
 * Hard-coded colours the admin uses, by kind, as 6-digit lowercase hex
 * without `#`: HX_TEXT for text and placeholder classes, HX_FILL for
 * backgrounds, borders, rings, gradient stops and inline fills. Each one is a
 * Tailwind class (text-hx-888888, bg-hx-1e1e1e) or an inline hx() value whose
 * fallback is the exact old colour, so Glass and Classic never change; Clean
 * light gives it lightTextFor / lightFillFor. hxColours.test.ts keeps these
 * lists in step with the source.
 */
export const HX_TEXT: readonly string[] = []
export const HX_FILL: readonly string[] = []

/** Colours already designed for a light card (ChatGptConnectionsPanel and friends): kept as they are in light. */
export const LIGHT_HEX_KEEP: readonly string[] = ['1b2a34', '54626e', 'dde3e8', 'eaeef2', 'f4f6f8', 'c1cdd4', 'bdc7ce']

/** Hand-picked light values where the rules in light.ts are wrong for a colour. */
export const LIGHT_HEX_OVERRIDES: { t: Record<string, string>; f: Record<string, string> } = { t: {}, f: {} }
```

- [ ] **Step 5: Write `light.ts`**

```ts
import {
  SHADES, blend, contrast, hexToRgb, hslToRgb, rgbToHex, rgbToHsl, shadeScale, type RGB,
} from './colour'
import { LIGHT_HEX_KEEP, LIGHT_HEX_OVERRIDES } from './hxColours'
import { DEEPEN_TARGET, DEEPEN_TINT_ALPHA, LIGHT_CANVAS, LIGHT_GREY_TEXT, LIGHT_SURFACES, LIGHT_TEXT } from './lightTokens'

const CANVAS = hexToRgb(LIGHT_CANVAS)
const WHITE: RGB = [255, 255, 255]

/** Lower the colour's HSL lightness in 2 % steps until `fits` holds (or lightness hits 2 %). */
function deepen(hex: string, fits: (c: RGB) => boolean): string {
  const start = hexToRgb(hex)
  const [h, s, l0] = rgbToHsl(start)
  let out: RGB = start
  for (let l = l0; !fits(out) && l > 0.02; ) {
    l = Math.max(0.02, l - 0.02)
    const [r, g, b] = hslToRgb([h, s, l])
    out = [Math.round(r), Math.round(g), Math.round(b)]
  }
  return rgbToHex(out)
}

/** The brand colour as Clean light text: deepened until it reads DEEPEN_TARGET on a 10 % brand tint over the canvas. */
export function deepenForLight(brandHex: string): string {
  const tint = blend(hexToRgb(brandHex), DEEPEN_TINT_ALPHA, CANVAS)
  return deepen(brandHex, c => contrast(c, tint) >= DEEPEN_TARGET)
}

/**
 * The inline variables for brand text in Clean light, written in every
 * style; only the light scope reads them (--tc-primary-* → --light-primary-*).
 * On paper a lighter brand shade reads worse, so 50-500 are the deepened
 * colour itself and 600-900 its darker shades.
 */
export function brandLightVariables(brandHex: string): Record<string, string> {
  const scale = shadeScale(deepenForLight(brandHex))
  const vars: Record<string, string> = {}
  for (const shade of SHADES) vars[`--light-primary-${shade}`] = shade <= 500 ? scale[500] : scale[shade]
  return vars
}

const norm = (hex: string) => hex.replace('#', '').toLowerCase()
const isNeutral = (hex: string) => rgbToHsl(hexToRgb(hex))[1] < 0.15

/**
 * A hard-coded TEXT colour in Clean light. Greys keep their prominence
 * (the lightest grey on dark becomes the ink); coloured text is deepened
 * until it reads 4.6:1 on both white and the canvas; colours made for a
 * light card stay.
 */
export function lightTextFor(hex6: string): string {
  const h = norm(hex6)
  if (LIGHT_HEX_OVERRIDES.t[h]) return LIGHT_HEX_OVERRIDES.t[h]
  if (LIGHT_HEX_KEEP.includes(h)) return `#${h.toUpperCase()}`
  if (isNeutral(h)) {
    const l = rgbToHsl(hexToRgb(h))[2]
    if (l >= 0.8) return LIGHT_TEXT.primary
    if (l >= 0.62) return LIGHT_TEXT.soft
    if (l >= 0.45) return LIGHT_GREY_TEXT[500]
    return LIGHT_TEXT.secondary
  }
  return deepen(h, c => contrast(c, WHITE) >= 4.6 && contrast(c, CANVAS) >= 4.6)
}

/**
 * A hard-coded FILL colour (background, border, ring, gradient stop) in
 * Clean light. Dark surfaces, neutral or tinted, become paper by how dark
 * they were; coloured fills (brand, status, WhatsApp green) and light
 * colours stay.
 */
export function lightFillFor(hex6: string): string {
  const h = norm(hex6)
  if (LIGHT_HEX_OVERRIDES.f[h]) return LIGHT_HEX_OVERRIDES.f[h]
  if (LIGHT_HEX_KEEP.includes(h)) return `#${h.toUpperCase()}`
  const [, s, l] = rgbToHsl(hexToRgb(h))
  const darkSurface = l < 0.3 && (s < 0.15 || l < 0.2)
  if (!darkSurface) return `#${h.toUpperCase()}`
  if (l < 0.07) return LIGHT_SURFACES['dark-bg']
  if (l < 0.16) return LIGHT_SURFACES['dark-surface']
  if (l < 0.24) return LIGHT_SURFACES['dark-border']
  return LIGHT_SURFACES['dark-border2']
}
```

Check: `rgbToHsl` returns lightness in 0..1 (it is used that way in `liftForGlass`). `#0a0a0a` has l ≈ 0.04 → canvas; `#1c1c1e` l ≈ 0.11 → white; `#333333` l = 0.2 → `#DDE3E8`; `#c9a84c` l ≈ 0.54 → kept.

- [ ] **Step 6: Run the tests until they pass**

Run: `cd frontend && npx vitest run src/theme/light.test.ts src/theme/lightContrast.test.ts`
Expected: PASS. If `lightTextFor('888888')` is not `#4A5863`, check the lightness band (`#888888` has l = 0.533 → `LIGHT_GREY_TEXT[500]`). If a contrast case fails, change the TOKEN value by one step darker (never the test), and note the change in the commit message.

- [ ] **Step 7: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-glass && git add frontend/src/theme/lightTokens.ts frontend/src/theme/light.ts frontend/src/theme/hxColours.ts frontend/src/theme/light.test.ts frontend/src/theme/lightContrast.test.ts && git commit -m "Clean light: tokens and colour rules, contrast-gated" -m "lightTokens.ts holds every Clean light value from the spec; light.ts deepens brand text (4.8:1 on a 10 % tint over the canvas) and gives hard-coded text and fill colours their light values; lightContrast.test.ts holds every text token, grey step, status and coloured text, brand text and sidebar accent to 4.5:1 on the light surfaces for all 28 fixture brands." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Tailwind wiring (white, on-fill, hx families, grey shades, the light block)

**Files:**
- Create: `frontend/src/theme/lightVariables.ts`
- Modify: `frontend/tailwind.config.js`
- Test: `frontend/src/theme/tailwindTokens.test.ts` (add a `describe('Clean light', …)`)

**Interfaces:**
- Consumes: Task 1 exports; `glassTokens.ts` (`GREY_HUES`, `SHIFTED_HUES`, `COLOURED_TEXT_SHADES`).
- Produces: `lightVariables(): Record<string, string>`; Tailwind classes `text-on-fill`, `bg-on-fill`, `text-hx-<hex6>`, `placeholder-hx-<hex6>`, `bg-hx-<hex6>` / `border-hx-` / `ring-hx-` / `from-hx-` / `via-hx-` / `to-hx-` / `shadow-hx-`; `text-gray-100/200/700/800` (and slate) become variable-backed (`--tc-gray-100` …) with Classic literals.

- [ ] **Step 1: Write the failing tests** (append to `tailwindTokens.test.ts`)

```ts
import { LIGHT_SCOPE } from './lightTokens'

describe('Clean light wiring', () => {
  it('routes white through --hx-white, white by default, and adds on-fill as a fixed white', () => {
    expect(extend.colors.white).toBe('rgb(var(--hx-white, 255 255 255) / <alpha-value>)')
    expect(extend.colors['on-fill']).toBe('rgb(255 255 255 / <alpha-value>)')
  })

  it('gives grey 100, 200, 700 and 800 text a variable with the exact Tailwind value as fallback', () => {
    expect(extend.textColor.gray[100]).toBe('rgb(var(--tc-gray-100, 243 244 246) / <alpha-value>)')
    expect(extend.textColor.gray[800]).toBe('rgb(var(--tc-gray-800, 31 41 55) / <alpha-value>)')
    expect(extend.textColor.slate[700]).toBe('rgb(var(--tc-slate-700, 51 65 85) / <alpha-value>)')
  })

  it('adds a light block, scoped to the signed-in admin, that turns white into the ink', () => {
    const base = glassBase()
    const block = base[LIGHT_SCOPE] as Record<string, string>
    expect(block).toBeDefined()
    expect(block['--hx-white']).toBe('27 42 52')
    expect(block['--style-dark-surface']).toBe('255 255 255')
    expect(block['--alpha-dark-surface']).toBe('1')
    expect(block['--tc-primary-400']).toBe('var(--light-primary-400)')
    expect(block['--tc-gray-100']).toBe('27 42 52')
    expect(block['--tc-amber-400']).toBe('146 64 14') // amber-800
    expect(block['--theme-font-display']).toContain("'HX Geist'")
    expect(block['--hx-color-scheme']).toBe('light')
  })

  it('sets nothing outside the light scope that Glass or Classic could read', () => {
    const base = glassBase()
    for (const [selector, block] of Object.entries(base)) {
      if (selector === LIGHT_SCOPE) continue
      expect(JSON.stringify(block), selector).not.toContain('--hx-white')
      expect(JSON.stringify(block), selector).not.toContain('--light-')
    }
  })
})
```

(`glassBase()` already collects every `addBase` call of every plugin, so the light block shows up once the plugin adds it. If the helper only reads the first plugin, generalise it to loop all plugins — it already loops `config.plugins`.)

- [ ] **Step 2: Run to see it fail**

Run: `cd frontend && npx vitest run src/theme/tailwindTokens.test.ts`
Expected: FAIL on `extend.colors.white` (undefined).

- [ ] **Step 3: Write `lightVariables.ts`**

```ts
import colors from 'tailwindcss/colors'
import { SHADES, hexToRgb, toTriplet } from './colour'
import { COLOURED_TEXT_SHADES, GREY_HUES, SHIFTED_HUES } from './glassTokens'
import { HX_FILL, HX_TEXT } from './hxColours'
import { lightFillFor, lightTextFor } from './light'
import {
  LIGHT_FONTS, LIGHT_GREY_SHADES, LIGHT_GREY_TEXT, LIGHT_INK, LIGHT_RADIUS, LIGHT_STATUS_TEXT, LIGHT_SURFACES,
  LIGHT_TEXT, LIGHT_TEXT_SHADE, LIGHT_THEME_RADIUS,
} from './lightTokens'

/*
 * Build-time only: tailwind.config.js turns this map into the Clean light
 * variable block (LIGHT_SCOPE). Kept out of the runtime bundle because it
 * pulls in Tailwind's colour table.
 */

const triplet = (hex: string) => toTriplet(hexToRgb(hex))

export function lightVariables(): Record<string, string> {
  const vars: Record<string, string> = {}
  for (const [name, hex] of Object.entries(LIGHT_SURFACES)) {
    vars[`--style-${name}`] = triplet(hex)
    vars[`--alpha-${name}`] = '1'
  }
  for (const [name, hex] of Object.entries(LIGHT_TEXT)) vars[`--style-text-${name}`] = triplet(hex)
  for (const [name, hex] of Object.entries(LIGHT_STATUS_TEXT)) vars[`--tc-${name}`] = triplet(hex)
  // The deepened brand shades are written inline by the theme code (they
  // depend on the organisation's colour).
  for (const shade of SHADES) vars[`--tc-primary-${shade}`] = `var(--light-primary-${shade})`
  for (const hue of GREY_HUES) {
    for (const shade of LIGHT_GREY_SHADES) vars[`--tc-${hue}-${shade}`] = triplet(LIGHT_GREY_TEXT[shade])
  }
  for (const hue of SHIFTED_HUES) {
    for (const shade of COLOURED_TEXT_SHADES) vars[`--tc-${hue}-${shade}`] = triplet(colors[hue][LIGHT_TEXT_SHADE[hue]])
  }
  vars['--hx-white'] = triplet(LIGHT_INK)
  for (const hex of HX_TEXT) vars[`--hx-t-${hex}`] = triplet(lightTextFor(hex))
  for (const hex of HX_FILL) vars[`--hx-f-${hex}`] = triplet(lightFillFor(hex))
  for (const [step, value] of Object.entries(LIGHT_RADIUS)) vars[`--radius-${step}`] = value
  for (const [step, value] of Object.entries(LIGHT_THEME_RADIUS)) vars[`--theme-radius-${step}`] = value
  vars['--theme-font-body'] = LIGHT_FONTS.body
  vars['--theme-font-display'] = LIGHT_FONTS.display
  vars['--theme-letter-spacing'] = '0'
  vars['--hx-color-scheme'] = 'light'
  return vars
}
```

- [ ] **Step 4: Wire `tailwind.config.js`**

At the imports:

```js
import { LIGHT_GREY_SHADES, LIGHT_SCOPE } from './src/theme/lightTokens.ts'
import { lightVariables } from './src/theme/lightVariables.ts'
import { HX_FILL, HX_TEXT } from './src/theme/hxColours.ts'
```

Replace the grey text scale so it covers 100-800 (Glass still only sets 300-600; the others fall back to Tailwind's literal, so Glass and Classic are unchanged):

```js
const greyText = textScale(GREY_HUES, LIGHT_GREY_SHADES)
```

Add the hx families next to `triplet`:

```js
/** Hard-coded colours as classes: the exact old colour unless Clean light sets --hx-<kind>-<hex>. */
const hxFamily = (list, kind) => Object.fromEntries(list.map(hex => [hex, `rgb(var(--hx-${kind}-${hex}, ${triplet(hex)}) / <alpha-value>)`]))
```

In `theme.extend.colors` add:

```js
        // Tailwind's white, routed through --hx-white: white in Glass and
        // Classic, the ink in Clean light (theme/lightTokens.ts). on-fill is
        // the white that stays white: text on coloured fills, toggle knobs.
        white: 'rgb(var(--hx-white, 255 255 255) / <alpha-value>)',
        'on-fill': 'rgb(255 255 255 / <alpha-value>)',
        hx: hxFamily(HX_FILL, 'f'),
```

In `theme.extend.textColor` add `hx: hxFamily(HX_TEXT, 't'),` and change `placeholderColor: greyText` to `placeholderColor: { ...greyText, hx: hxFamily(HX_TEXT, 't') },`.

In `plugins`, add a second plugin after the Glass one:

```js
    // The Clean light variable block, generated from src/theme/lightTokens.ts.
    plugin(({ addBase }) => {
      addBase({ [LIGHT_SCOPE]: lightVariables() })
    }),
```

- [ ] **Step 5: Run the tests**

Run: `cd frontend && npx vitest run src/theme/`
Expected: PASS (all theme tests, including the existing Glass/Classic token tests).

- [ ] **Step 6: Prove Glass and Classic did not change**

Build the stylesheet before and after and compare the rules for classes that existed before:

Set `SCRATCH` to the session's scratchpad directory (never a path inside the repo), then:

```bash
cd /c/wamp64/www/Hexa-Tech-glass/frontend && git stash -q && npx vite build --mode development --emptyOutDir --outDir "$SCRATCH/hx-before" >/dev/null 2>&1; git stash pop -q && npx vite build --mode development --emptyOutDir --outDir "$SCRATCH/hx-after" >/dev/null 2>&1; SCRATCH="$SCRATCH" node -e "
const fs=require('fs');const S=process.env.SCRATCH;const read=d=>fs.readFileSync(d+'/assets/'+fs.readdirSync(d+'/assets').find(f=>f.endsWith('.css')),'utf8');
const rules=css=>new Map([...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m=>[m[1].trim(),m[2]]));
const a=rules(read(S+'/hx-before')),b=rules(read(S+'/hx-after'));let n=0;
for(const [sel,body] of a){if(b.has(sel)&&b.get(sel)!==body){n++;if(n<15)console.log(sel,'\n  -',body.slice(0,140),'\n  +',b.get(sel).slice(0,140))}}console.log(n,'changed rules')"
```

Expected: the only changed rules are white-based utilities (`.text-white`, `.bg-white`, `.border-white…`, `.bg-white\/…`, gradient `from-white`, `placeholder-white`, `ring-white`, `divide-white`) whose value is now `rgb(var(--hx-white, 255 255 255) / …)` — identical computed colour — and grey text 100/200/700/800 now `rgb(var(--tc-gray-100, 243 244 246) / …)`. Anything else is a bug: stop and fix. (`--outDir` outside the repo; `--mode development` so tracked `frontend/dist/stats.html` is not rewritten. `git stash` leaves the new untracked files in place, which is fine: the reverted config does not import them.)

- [ ] **Step 7: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-glass && git add frontend/tailwind.config.js frontend/src/theme/lightVariables.ts frontend/src/theme/tailwindTokens.test.ts && git commit -m "Clean light: Tailwind wiring, white through --hx-white, the light block" -m "Tailwind's white reads --hx-white (255 255 255 unless Clean light sets the ink), on-fill is a white that stays white, hard-coded colours get hx-* families whose fallback is the exact old colour, grey text 100-800 is variable-backed with Tailwind's literals, and a second plugin writes the Clean light block from lightTokens.ts. Built CSS compared before/after: only white-based and grey 100/200/700/800 utilities changed, to variables with the same computed colour." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Theme code: the light style and the device preview

**Files:**
- Create: `frontend/src/lib/stylePreview.ts`, `frontend/src/lib/stylePreview.test.ts`
- Modify: `frontend/src/hooks/useTheme.ts` (`THEME_STYLES`, `readThemeStyle`, `applyThemeToDom`, `paintCachedTheme`, `applyStyleOnly`), `frontend/src/theme/themeSettings.ts` (`STYLE_NAMES` is a `Record<ThemeStyle, string>`), `frontend/src/pages/Settings.tsx:1092-1093` (initial `activeStyle`)
- Test: `frontend/src/hooks/useTheme.style.test.ts` (add cases), `frontend/src/theme/themeSettings.test.ts` (add a case)

**Interfaces:**
- Consumes: `brandLightVariables` (Task 1).
- Produces: `ThemeStyle = 'glass' | 'classic' | 'light'`; `readThemeStyle(raw)` returns `'light'` for `'light'`; `readStylePreview(storage?): ThemeStyle | null`; `setStylePreview(style: 'light' | null, storage?): void`; `effectiveStyle(style: ThemeStyle, storage?): ThemeStyle`; `STYLE_PREVIEW_KEY = 'hx-style-preview'`.

- [ ] **Step 1: Write the failing tests**

`frontend/src/lib/stylePreview.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { STYLE_PREVIEW_KEY, effectiveStyle, readStylePreview, setStylePreview } from './stylePreview'

function fakeStorage(role: string | null, preview: string | null) {
  const map = new Map<string, string>()
  if (role) map.set('loyalty-auth', JSON.stringify({ state: { staff: { role } }, version: 1 }))
  if (preview) map.set(STYLE_PREVIEW_KEY, preview)
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v) },
    removeItem: (k: string) => { map.delete(k) },
    map,
  }
}

describe('style preview on this device', () => {
  it('previews Clean light for a super admin who switched it on', () => {
    const s = fakeStorage('super_admin', 'light')
    expect(readStylePreview(s)).toBe('light')
    expect(effectiveStyle('glass', s)).toBe('light')
    expect(effectiveStyle('classic', s)).toBe('light')
  })

  it('is ignored for anyone else, even with the flag set by hand', () => {
    expect(readStylePreview(fakeStorage('manager', 'light'))).toBeNull()
    expect(readStylePreview(fakeStorage(null, 'light'))).toBeNull()
    expect(effectiveStyle('classic', fakeStorage('manager', 'light'))).toBe('classic')
  })

  it('reads nothing when the flag is off or broken, and never throws', () => {
    expect(readStylePreview(fakeStorage('super_admin', null))).toBeNull()
    expect(readStylePreview(fakeStorage('super_admin', 'neon'))).toBeNull()
    const broken = { getItem: () => { throw new Error('blocked') }, setItem: () => {}, removeItem: () => {} }
    expect(readStylePreview(broken)).toBeNull()
  })

  it('switches on and off', () => {
    const s = fakeStorage('super_admin', null)
    setStylePreview('light', s)
    expect(s.map.get(STYLE_PREVIEW_KEY)).toBe('light')
    setStylePreview(null, s)
    expect(s.map.has(STYLE_PREVIEW_KEY)).toBe(false)
  })
})
```

Add to `useTheme.style.test.ts` (it already has a `fakeTarget()` helper):

```ts
  it('knows Clean light', () => {
    expect(readThemeStyle('light')).toBe('light')
    expect(readThemeStyle('classic')).toBe('classic')
    expect(readThemeStyle('neon')).toBe('glass')
  })

  it('writes the deepened brand shades for Clean light in every style', () => {
    const { target, vars } = fakeTarget()
    applyThemeToDom({ primary_color: '#3b82f6' }, null, 'glass', target)
    expect(vars.get('--light-primary-500')).toBe('10 91 223')
  })
```

- [ ] **Step 2: Run to see them fail**

Run: `cd frontend && npx vitest run src/lib/stylePreview.test.ts src/hooks/useTheme.style.test.ts`
Expected: FAIL (module missing; `readThemeStyle('light')` returns `'glass'`).

- [ ] **Step 3: Write `stylePreview.ts`**

```ts
import type { ThemeStyle } from '../hooks/useTheme'

/**
 * Preview a style on this device only, before every organisation can pick
 * it (spec D5). A super admin switches it on from Settings → Branding →
 * Style; nothing is saved to the server and the organisation's own style is
 * untouched. Anyone else's flag is ignored.
 */
export const STYLE_PREVIEW_KEY = 'hx-style-preview'

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
const browser = (): Store | null => (typeof window !== 'undefined' ? window.localStorage : null)

export function readStylePreview(storage: Store | null = browser()): ThemeStyle | null {
  try {
    if (!storage || storage.getItem(STYLE_PREVIEW_KEY) !== 'light') return null
    const auth = JSON.parse(storage.getItem('loyalty-auth') ?? 'null')
    return auth?.state?.staff?.role === 'super_admin' ? 'light' : null
  } catch {
    return null
  }
}

export function setStylePreview(style: 'light' | null, storage: Store | null = browser()): void {
  try {
    if (!storage) return
    if (style) storage.setItem(STYLE_PREVIEW_KEY, style)
    else storage.removeItem(STYLE_PREVIEW_KEY)
  } catch { /* private mode: no preview */ }
}

/** The style to paint: this device's preview wins over the organisation's. */
export function effectiveStyle(style: ThemeStyle, storage: Store | null = browser()): ThemeStyle {
  return readStylePreview(storage) ?? style
}
```

- [ ] **Step 4: Update `useTheme.ts`**

```ts
// line 53
export const THEME_STYLES = ['glass', 'classic', 'light'] as const

/** 'classic' and 'light' are themselves; anything else (missing, empty, unknown) is Glass. */
export function readThemeStyle(raw: unknown): ThemeStyle {
  return raw === 'classic' || raw === 'light' ? raw : DEFAULT_STYLE
}
```

Imports: `import { brandLightVariables } from '../theme/light'` and `import { effectiveStyle } from '../lib/stylePreview'`.

In `applyThemeToDom`, after the `brandGlassVariables` loop:

```ts
  for (const [name, value] of Object.entries(brandLightVariables(merged.primary_color))) set(name, value)
```

and the last line becomes:

```ts
  root.setAttribute('data-style', effectiveStyle(style ?? readThemeStyle(root.getAttribute('data-style'))))
```

In `paintCachedTheme`'s else branch: `target.root.setAttribute('data-style', effectiveStyle(DEFAULT_STYLE))`. In `applyStyleOnly`: `target.root.setAttribute('data-style', effectiveStyle(style))` (the snapshot keeps `style`, the organisation's own). Update the doc comment on `applyThemeToDom` ("The optional `style` writes `data-style` ('glass' | 'classic' | 'light'), or this device's preview…").

In `frontend/src/theme/themeSettings.ts` add `light: 'Clean light',` to `STYLE_NAMES`, and in `themeSettings.test.ts` add `expect(STYLE_NAMES.light).toBe('Clean light')`.

In `frontend/src/pages/Settings.tsx`, the Style card must show the ORGANISATION's style, not the page's (the page can show this device's preview). Change the initial state:

```tsx
  const [activeStyle, setActiveStyle] = useState<ThemeStyle>(() => readThemeStyle(readCachedTheme()?.style))
```

(add `readCachedTheme` to the existing `../hooks/useTheme` import; the snapshot stores the organisation's style, never the preview).

- [ ] **Step 5: Run the tests**

Run: `cd frontend && npx vitest run src/lib/stylePreview.test.ts src/hooks/ src/theme/ && npx tsc -b`
Expected: PASS; tsc clean (StylePicker's `isAvailable` still excludes `'light'`, so nothing can pick it yet).

- [ ] **Step 6: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-glass && git add frontend/src/lib/stylePreview.ts frontend/src/lib/stylePreview.test.ts frontend/src/hooks/useTheme.ts frontend/src/hooks/useTheme.style.test.ts && git commit -m "Clean light: the theme code knows the style and a device preview" -m "readThemeStyle accepts 'light'; applyThemeToDom writes the deepened brand shades (--light-primary-*) in every style; data-style takes this device's preview (super admins only, nothing saved) over the organisation's style. The server still rejects 'light', so nobody can choose it yet." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The light shell (light.css, fonts, mood guard, sidebar accents)

**Files:**
- Create: `frontend/src/theme/light.css`, `frontend/src/theme/fonts/geist-var.woff2`, `frontend/src/theme/fonts/geist-mono-var.woff2`, `frontend/src/theme/fonts/OFL-Geist.txt`, `frontend/src/theme/lightCss.test.ts`
- Modify: `frontend/src/index.css` (import; 70 mood selectors), `frontend/src/components/Layout.tsx` (sidebar group + active item variables), `frontend/src/theme/glassCss.test.ts` (mood guard expectation)

**Interfaces:**
- Consumes: `LIGHT_SCOPE`, `LIGHT_NAV_ACCENT_TEXT`, `LIGHT_FONTS` (Task 1).
- Produces: `data-nav-group` attribute on sidebar groups; inline `--nav-accent-light` on groups and the active item; label colour `var(--nav-label-text, <tint>)`.

- [ ] **Step 1: Get the fonts**

```bash
S="C:/Users/user6399/AppData/Local/Temp/claude/c--wamp64-www-Hexa-Tech/96e9d02c-0684-451f-a0a3-a8fc7d5692f5/scratchpad/geistpkg"; mkdir -p "$S" && cd "$S" && npm pack geist@1.3.1 --silent && tar -xzf geist-1.3.1.tgz package/LICENSE.TXT package/dist/fonts/geist-sans/Geist-Variable.woff2 package/dist/fonts/geist-mono/GeistMono-Variable.woff2 && cp package/dist/fonts/geist-sans/Geist-Variable.woff2 /c/wamp64/www/Hexa-Tech-glass/frontend/src/theme/fonts/geist-var.woff2 && cp package/dist/fonts/geist-mono/GeistMono-Variable.woff2 /c/wamp64/www/Hexa-Tech-glass/frontend/src/theme/fonts/geist-mono-var.woff2 && cp package/LICENSE.TXT /c/wamp64/www/Hexa-Tech-glass/frontend/src/theme/fonts/OFL-Geist.txt && ls -la /c/wamp64/www/Hexa-Tech-glass/frontend/src/theme/fonts/
```

Expected: two woff2 files of about 57 KB and the OFL text ("This Font Software is licensed under the SIL Open Font License, Version 1.1").

- [ ] **Step 2: Write the failing test** `frontend/src/theme/lightCss.test.ts`

```ts
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { LIGHT_SCOPE } from './lightTokens'

const lightCss = readFileSync(new URL('./light.css', import.meta.url), 'utf8')
const legacyCss = readFileSync(new URL('./legacySurfaces.css', import.meta.url), 'utf8')
const indexCss = readFileSync(new URL('../index.css', import.meta.url), 'utf8')
const layout = readFileSync(new URL('../components/Layout.tsx', import.meta.url), 'utf8')

const clean = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')
function splitTopLevel(list: string): string[] {
  const parts: string[] = []; let depth = 0; let cur = ''
  for (const ch of list) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) { parts.push(cur); cur = '' } else cur += ch
  }
  parts.push(cur)
  return parts.map(s => s.trim()).filter(Boolean)
}
function selectors(css: string): string[] {
  const out: string[] = []
  for (const m of clean(css).matchAll(/([^{};]+)\{/g)) {
    const prelude = m[1].trim()
    if (prelude && !prelude.startsWith('@')) out.push(...splitTopLevel(prelude))
  }
  return out
}
function rulesWith(css: string, declaration: string): string[] {
  const out: string[] = []
  for (const m of clean(css).matchAll(/([^{};]+)\{([^{}]*)\}/g)) if (m[2].includes(declaration)) out.push(...splitTopLevel(m[1].trim()))
  return out
}

describe('light.css', () => {
  it('scopes every rule to the signed-in admin in Clean light', () => {
    const all = selectors(lightCss)
    expect(all.length).toBeGreaterThan(15)
    for (const s of all) expect(s.startsWith(LIGHT_SCOPE), s).toBe(true)
  })

  it('self-hosts Geist and Geist Mono from files that ship with the app', () => {
    for (const file of ['geist-var.woff2', 'geist-mono-var.woff2']) {
      expect(lightCss).toContain(`url('./fonts/${file}')`)
      expect(existsSync(new URL(`./fonts/${file}`, import.meta.url)), file).toBe(true)
    }
    expect(lightCss).not.toContain('googleapis')
  })

  it('owns the page colour over the palette the theme code paints on <body>', () => {
    expect(rulesWith(lightCss, 'background-color: #F4F6F8 !important').some(s => s.endsWith(' body'))).toBe(true)
  })

  it('turns native controls light', () => {
    expect(rulesWith(lightCss, 'color-scheme: light').some(s => s.includes('select'))).toBe(true)
  })

  it('draws every overlay surface opaque with a shadow', () => {
    const overlay = rulesWith(lightCss, '0 12px 32px rgb(14 26 36 / 0.14)').join(' ')
    for (const cls of ['bg-dark-bg', 'bg-dark-surface', 'bg-dark-surface2', 'bg-dark-card', 'bg-panel', 'bg-panel-dim', 'bg-well']) {
      expect(new RegExp(`\\.${cls}(?![\\w-])`).test(overlay), cls).toBe(true)
    }
  })

  it('gives every old inline surface variable a light value', () => {
    const names = [...legacyCss.matchAll(/(--legacy-[\w-]+):/g)].map(m => m[1])
    expect(names.length).toBeGreaterThan(10)
    const lightBlock = clean(lightCss)
    for (const name of names) expect(lightBlock.includes(`${name}:`), name).toBe(true)
  })

  it('draws the sidebar labels and the active item in the deep accent', () => {
    expect(rulesWith(lightCss, '--nav-label-text: var(--nav-accent-light)').some(s => s.endsWith('.hx-sidebar [data-nav-group]'))).toBe(true)
    expect(rulesWith(lightCss, '--nav-active-text: var(--nav-accent-light)').some(s => s.endsWith('.hx-sidebar [data-nav-active]'))).toBe(true)
    expect(layout).toContain("'--nav-accent-light': LIGHT_NAV_ACCENT_TEXT[accent] ?? accent")
    expect(layout).toContain('var(--nav-label-text, ')
  })

  it('is imported after glass.css', () => {
    expect(indexCss.indexOf("@import './theme/light.css';")).toBeGreaterThan(indexCss.indexOf("@import './theme/glass.css';"))
  })
})

describe('index.css mood rules', () => {
  it('reach neither the Glass nor the Clean light admin', () => {
    const mood = selectors(indexCss).filter(s => s.includes('[data-mood'))
    expect(mood.length).toBeGreaterThan(60)
    for (const s of mood) {
      expect(s.startsWith(':root:where(:not([data-style="glass"][data-shell="admin"], [data-style="light"][data-shell="admin"]))[data-mood'), s).toBe(true)
    }
  })
})
```

In `glassCss.test.ts`, change the mood test's expected prefix to the same two-style form.

- [ ] **Step 3: Run to see it fail**

Run: `cd frontend && npx vitest run src/theme/lightCss.test.ts src/theme/glassCss.test.ts`
Expected: FAIL (light.css missing; mood prefix differs).

- [ ] **Step 4: Write `light.css`**

```css
/* ════════════════════════════════════════════════════════════════════════
   Clean light: the admin on paper (spec 2026-10-09-admin-clean-light-design.md).
   Token values come from theme/lightTokens.ts through the Tailwind plugin;
   this file holds what tokens cannot: faces, the shell, shadows, scrollbars,
   native controls and the old inline surfaces. Every rule is scoped to the
   signed-in admin in this style.
   ════════════════════════════════════════════════════════════════════════ */

/* Geist and Geist Mono, self-hosted (OFL 1.1, npm geist@1.3.1; OFL-Geist.txt). */
@font-face {
  font-family: 'HX Geist';
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url('./fonts/geist-var.woff2') format('woff2');
}
@font-face {
  font-family: 'HX Geist Mono';
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url('./fonts/geist-mono-var.woff2') format('woff2');
}

/* Native controls, scrollbars and form widgets in their light form. */
:root[data-style="light"][data-shell="admin"] {
  color-scheme: light;
}
:root[data-style="light"][data-shell="admin"] :is(select, input[type="number"], input[type="date"], input[type="time"], input[type="datetime-local"], input[type="month"], input[type="week"]) {
  color-scheme: light;
}

/* The theme code paints the palette on <body> inline; in this style the
   shell owns the page, so overscroll never flashes the dark palette. */
:root[data-style="light"][data-shell="admin"] body {
  background-color: #F4F6F8 !important;
  color: #1B2A34 !important;
}
:root[data-style="light"][data-shell="admin"] .hx-shell {
  background-color: #F4F6F8;
  color: #1B2A34;
}

/* Sidebar: docked, light grey, a hairline on the right. */
:root[data-style="light"][data-shell="admin"] .hx-sidebar {
  background-color: #ECEFF3;
  border-right-color: #DDE3E8;
}
/* Section labels and the active item in each section's deep accent
   (lightTokens.ts LIGHT_NAV_ACCENT_TEXT, set inline by Layout.tsx). The
   active item is a white pill. */
:root[data-style="light"][data-shell="admin"] .hx-sidebar [data-nav-group] {
  --nav-label-text: var(--nav-accent-light);
}
:root[data-style="light"][data-shell="admin"] .hx-sidebar [data-nav-active] {
  --nav-active-text: var(--nav-accent-light);
  background: #FFFFFF !important;
  box-shadow: 0 1px 2px rgb(14 26 36 / 0.08), 0 2px 8px rgb(14 26 36 / 0.05) !important;
}

/* Header: translucent paper with blur, above the page so its own popovers
   stay on top (backdrop-filter makes it a stacking context). */
:root[data-style="light"][data-shell="admin"] .hx-header {
  position: relative;
  z-index: 35;
  background-color: rgb(244 246 248 / 0.82);
  border-bottom-color: #DDE3E8;
  -webkit-backdrop-filter: blur(16px) saturate(140%);
  backdrop-filter: blur(16px) saturate(140%);
}

@media (max-width: 1023px) {
  :root[data-style="light"][data-shell="admin"] .mobile-bottom-nav {
    background: rgb(255 255 255 / 0.92);
    border-top-color: #DDE3E8;
    box-shadow: 0 -4px 14px rgb(14 26 36 / 0.08);
    -webkit-backdrop-filter: blur(16px) saturate(140%);
    backdrop-filter: blur(16px) saturate(140%);
  }
  :root[data-style="light"][data-shell="admin"] .mobile-bottom-nav > a,
  :root[data-style="light"][data-shell="admin"] .mobile-bottom-nav > button {
    color: #54626E;
  }
  :root[data-style="light"][data-shell="admin"] .mobile-bottom-nav > a.active,
  :root[data-style="light"][data-shell="admin"] .mobile-bottom-nav > button.active {
    color: rgb(var(--tc-primary-500, var(--color-primary-500, 59 130 246)));
  }
}

/* Cards: a soft two-step shadow; Tailwind's ring variables stay in it. */
:root[data-style="light"][data-shell="admin"] :is(.bg-dark-surface, .bg-dark-surface2, .bg-dark-card, .bg-panel, .bg-panel-dim).border:not(.absolute, .fixed, .sticky, .hx-sidebar, input, textarea, select, button) {
  box-shadow:
    var(--tw-ring-offset-shadow, 0 0 #0000),
    var(--tw-ring-shadow, 0 0 #0000),
    0 1px 2px rgb(14 26 36 / 0.05),
    0 8px 24px rgb(14 26 36 / 0.06);
}

/* Menus, popovers, sticky headers, modals and drawers: opaque paper with a
   deeper shadow, never see-through. */
:root[data-style="light"][data-shell="admin"] :is(.absolute, .fixed, .sticky, [style*="position: fixed"]):is(.bg-dark-bg, .bg-dark-surface, .bg-dark-surface2, .bg-dark-card, .bg-panel, .bg-panel-dim, .bg-well):not(.hx-sidebar),
:root[data-style="light"][data-shell="admin"] :is(.shadow-xl, .shadow-2xl):is(.bg-dark-bg, .bg-dark-surface, .bg-dark-surface2, .bg-dark-card, .bg-panel, .bg-panel-dim, .bg-well):not(.hx-sidebar),
:root[data-style="light"][data-shell="admin"] .fixed.inset-0 > :is(.bg-dark-bg, .bg-dark-surface, .bg-dark-surface2, .bg-dark-card, .bg-panel, .bg-panel-dim, .bg-well) {
  box-shadow: 0 12px 32px rgb(14 26 36 / 0.14), 0 1px 2px rgb(14 26 36 / 0.06);
}

/* Page titles and big numbers in the display face; figures in Geist Mono. */
:root[data-style="light"][data-shell="admin"] :is(.text-xl, .text-2xl, .text-3xl, .text-4xl, .text-5xl) {
  font-family: var(--theme-font-display);
  letter-spacing: -0.02em;
}
:root[data-style="light"][data-shell="admin"] .font-mono {
  font-family: 'HX Geist Mono', ui-monospace, Menlo, Consolas, monospace;
}

/* Scrollbars on paper. */
:root[data-style="light"][data-shell="admin"] ::-webkit-scrollbar-track {
  background: transparent;
}
:root[data-style="light"][data-shell="admin"] ::-webkit-scrollbar-thumb {
  background: rgb(27 42 52 / 0.2);
}

/* Dark text on status fills (text-dark-bg) stays dark here, where the page
   ink is light. */
:root[data-style="light"][data-shell="admin"] .text-dark-bg {
  --style-dark-bg: 3 5 10;
}

/* The old dark-green inline surfaces (legacySurfaces.css), on paper. */
:root[data-style="light"][data-shell="admin"] {
  --legacy-panel-60: #FFFFFF;
  --legacy-panel-50: #FFFFFF;
  --legacy-panel-raised: #EEF2F5;
  --legacy-well-60: #F4F6F8;
  --legacy-well-50: #F4F6F8;
  --legacy-well-40: #F7F9FB;
  --legacy-well-dark: #EEF2F5;
  --legacy-card: #FFFFFF;
  --legacy-card-deep: #FFFFFF;
  --legacy-card-gradient: linear-gradient(180deg, #FFFFFF, #FBFCFD);
  --legacy-card-gradient-diagonal: linear-gradient(135deg, #FFFFFF, #FBFCFD);
  --legacy-card-gradient-deep: linear-gradient(180deg, #FFFFFF, #F7F9FB);
  --legacy-hero-gradient: linear-gradient(135deg, #FFFFFF, #F7F9FB);
  --legacy-hero-gradient-soft: linear-gradient(135deg, #FBFCFD, #F7F9FB);
  --legacy-tile-gradient: linear-gradient(180deg, #FFFFFF, #FBFCFD);
  --legacy-success-gradient: linear-gradient(180deg, rgb(23 100 59 / 0.08), rgb(23 100 59 / 0.03));
  --legacy-alert-gradient: linear-gradient(180deg, rgb(163 36 59 / 0.08), rgb(163 36 59 / 0.03));
}
```

- [ ] **Step 5: Wire index.css**

Add `@import './theme/light.css';` on the line after `@import './theme/glass.css';`. Then replace all 70 mood prefixes (Edit tool with replace_all):

old: `:root:where(:not([data-style="glass"][data-shell="admin"]))[data-mood`
new: `:root:where(:not([data-style="glass"][data-shell="admin"], [data-style="light"][data-shell="admin"]))[data-mood`

- [ ] **Step 6: Layout sidebar variables**

In `frontend/src/components/Layout.tsx`:
- import: `import { GLASS_NAV_ACCENT_TEXT } from '../theme/glassTokens'` → also `import { LIGHT_NAV_ACCENT_TEXT } from '../theme/lightTokens'`.
- group wrapper `<div key={defaultLabel} className="mb-3 last:mb-1">` →
  `<div key={defaultLabel} className="mb-3 last:mb-1" data-nav-group="" style={{ '--nav-accent-light': LIGHT_NAV_ACCENT_TEXT[accent] ?? accent } as CSSProperties}>`
- group label button `style={{ color: tint(0.9) }}` → `style={{ color: `var(--nav-label-text, ${tint(0.9)})` }}`
- active link style object: add `'--nav-accent-light': LIGHT_NAV_ACCENT_TEXT[accent] ?? accent,` next to `'--nav-accent-glass'`.

- [ ] **Step 7: Run tests and type-check**

Run: `cd frontend && npx vitest run src/theme/ && npx tsc -b`
Expected: PASS.

- [ ] **Step 8: Look at it**

Start the local servers (`CORS_ALLOWED_ORIGINS=http://localhost:5173 /c/wamp64/bin/php/php8.4.20/php.exe artisan serve --port=8000 --no-reload` in the worktree; `VITE_API_URL=http://127.0.0.1:8000/api npm run dev` in `frontend`), sign in as the local demo super admin (credentials in the memory file `local-dev-environment.md`; never write them anywhere), then in the browser console run `localStorage.setItem('hx-style-preview','light'); location.reload()`. Screenshot `/` and `/planner` at 1440×900 and 390×844. Expected: light canvas, white cards with soft shadows, light sidebar with deep-accent labels and a white active pill, translucent header; text readable. Many screens will still show leftovers until Tasks 5-14; that is expected. Then `localStorage.removeItem('hx-style-preview'); location.reload()` and confirm Glass looks exactly as before (sidebar, header, cards). Stop the servers (check ports 5173/8000 are free afterwards).

- [ ] **Step 9: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-glass && git add frontend/src/theme/light.css frontend/src/theme/fonts/geist-var.woff2 frontend/src/theme/fonts/geist-mono-var.woff2 frontend/src/theme/fonts/OFL-Geist.txt frontend/src/theme/lightCss.test.ts frontend/src/theme/glassCss.test.ts frontend/src/index.css frontend/src/components/Layout.tsx && git commit -m "Clean light: the shell, faces and sidebar accents" -m "light.css (scoped): self-hosted Geist and Geist Mono, paper canvas that also overrides the palette painted on <body>, a light docked sidebar whose section labels and active pill use each section's deep accent (Layout sets --nav-accent-light), a translucent header, mobile bar, card and overlay shadows, light native controls and scrollbars, and light values for every legacy inline surface. The 70 mood rules now skip the light admin too." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Hard-coded colour classes → hx classes (310 → 0)

**Files:**
- Modify: every admin source file with a `-[#hex]` class (76 files today); `frontend/src/theme/hxColours.ts` (registries); `frontend/src/theme/rawColourRatchet.test.ts` (baseline → 0)
- Create: `frontend/src/theme/hxColours.test.ts`
- Script (scratchpad, not committed): `hx-classes.mjs`

**Interfaces:**
- Consumes: Task 2's `hx` families (which read `HX_TEXT` / `HX_FILL`).
- Produces: populated `HX_TEXT` / `HX_FILL`; no `-[#…]` colour class left in the admin.

- [ ] **Step 1: Write the failing test** `frontend/src/theme/hxColours.test.ts`

```ts
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { HX_FILL, HX_TEXT } from './hxColours'

const SRC = path.resolve(__dirname, '..')
function adminFiles(dir: string): string[] {
  return fs.readdirSync(dir).flatMap(entry => {
    const full = path.join(dir, entry)
    const rel = path.relative(SRC, full).split(path.sep).join('/')
    if (fs.statSync(full).isDirectory()) return rel === 'portal' || rel === 'appointments' ? [] : adminFiles(full)
    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : []
  })
}
const source = adminFiles(SRC).map(f => fs.readFileSync(f, 'utf8')).join('\n')
// <variants:>prop-hx-<hex>; text and placeholder read the text registry, every other prop the fill registry.
const HX_CLASS = /(?<![\w-])(?:[\w-]+:)*([a-z]+(?:-[a-z]+)*)-hx-([0-9a-f]{6})(?![\w-])/g
const INLINE = /\bhx\(\s*'([tf])',\s*'#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})'/g
const six = (h: string) => (h.length === 3 ? h.split('').map(c => c + c).join('') : h).toLowerCase()

function used(kind: 't' | 'f'): string[] {
  const out = new Set<string>()
  for (const m of source.matchAll(HX_CLASS)) {
    const isText = m[1] === 'text' || m[1] === 'placeholder'
    if ((kind === 't') === isText) out.add(m[2])
  }
  for (const m of source.matchAll(INLINE)) if (m[1] === kind) out.add(six(m[2]))
  return [...out].sort()
}

describe('hard-coded colour registry', () => {
  it('has every hx text colour the source uses, and nothing it does not', () => {
    expect(used('t')).toEqual([...HX_TEXT].sort())
  })

  it('has every hx fill colour the source uses, and nothing it does not', () => {
    expect(used('f')).toEqual([...HX_FILL].sort())
  })

  it('keeps the registries as 6-digit lowercase hex without #', () => {
    for (const hex of [...HX_TEXT, ...HX_FILL]) expect(hex).toMatch(/^[0-9a-f]{6}$/)
  })
})
```

In `rawColourRatchet.test.ts` set `rawHexClasses: 0`.

- [ ] **Step 2: Run to see it fail**

Run: `cd frontend && npx vitest run src/theme/rawColourRatchet.test.ts`
Expected: FAIL ("has no more than 0 raw hex colour classes", total 310).

- [ ] **Step 3: Write and run the codemod** (scratchpad `hx-classes.mjs`)

```js
// -[#hex] colour classes → hx classes; prints the registries.
//   node hx-classes.mjs <frontend/src> [--write]
import fs from 'node:fs'
import path from 'node:path'
const src = path.resolve(process.argv[2]); const write = process.argv.includes('--write')
const files = []
const walk = d => { for (const e of fs.readdirSync(d)) { const f = path.join(d, e); const r = path.relative(src, f).split(path.sep).join('/'); if (fs.statSync(f).isDirectory()) { if (r !== 'portal' && r !== 'appointments') walk(f) } else if (/\.tsx?$/.test(e) && !/\.test\.tsx?$/.test(e)) files.push(f) } }
walk(src)
const six = h => (h.length === 3 ? h.split('').map(c => c + c).join('') : h).toLowerCase()
const TEXT = new Set(['text', 'placeholder'])
const text = new Set(); const fill = new Set(); let n = 0; const odd = []
const RE = /(?<![\w-])((?:[\w-]+:)*)([a-z]+(?:-[a-z]+)*)-\[#([0-9a-fA-F]{3,8})\]/g
for (const f of files) {
  const before = fs.readFileSync(f, 'utf8')
  const after = before.replace(RE, (m, variants, prop, hex) => {
    if (hex.length !== 3 && hex.length !== 6) { odd.push(`${path.relative(src, f)}: ${m}`); return m }
    const h = six(hex); n++
    ;(TEXT.has(prop) ? text : fill).add(h)
    return `${variants}${prop}-hx-${h}`
  })
  if (write && after !== before) fs.writeFileSync(f, after)
}
console.log(`${n} classes${write ? '' : ' (dry run)'}; ${odd.length} need a hand: ${odd.join(' | ')}`)
console.log('HX_TEXT', JSON.stringify([...text].sort()))
console.log('HX_FILL', JSON.stringify([...fill].sort()))
```

Run it dry, then with `--write`. Expected: 310 classes (or the current count), 0 needing a hand (no 8-digit hex classes exist today; if any appear, convert them by hand to `hx-<6digit>/[alpha]`). Paste the two printed arrays into `hxColours.ts` as `HX_TEXT` and `HX_FILL`.

- [ ] **Step 4: Run the tests and the CSS comparison**

Run: `cd frontend && npx vitest run src/theme/ && npx tsc -b`
Expected: PASS (`hxColours.test.ts` lists match; ratchet 0; `lightContrast` checks every `HX_TEXT` in light — if one fails, add a hand-picked `LIGHT_HEX_OVERRIDES.t` value that passes and say why in a comment).

Re-run Task 2 Step 6's before/after CSS comparison (stash this task's changes for "before"). Expected: every class that existed before (`text-[#888]` …) is gone and a new `text-hx-888888` rule has `rgb(var(--hx-t-888888, 136 136 136) / …)`: the same colour. No other rule changes.

- [ ] **Step 5: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-glass && git add -A frontend/src && git commit -m "Clean light: hard-coded colour classes become hx classes" -m "Every -[#hex] colour class in the admin (310 in 76 files) is now an hx class (text-hx-888888, bg-hx-1e1e1e …) whose fallback is the exact old colour, so Glass and Classic render as before; Clean light gives each one lightTextFor / lightFillFor. hxColours.ts registers them and hxColours.test.ts keeps the lists in step with the source. Raw hex ratchet 310 -> 0." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Whites that stay white (on-fill) and their guards

**Files:**
- Modify: admin source files with text-white on coloured fills (≈74 class strings, ≈6 inline backgrounds), solid `bg-white` (≈37)
- Create: `frontend/src/theme/onFill.test.ts`
- Script (scratchpad): `on-fill.mjs`

**Interfaces:**
- Consumes: `on-fill` colour (Task 2); `lightFillFor` and `HX_FILL` (Task 5) to tell coloured hx fills from surfaces.
- Produces: `text-on-fill` / `bg-on-fill` in source; guard tests; `FOREGROUND_WHITE` allowlist in `onFill.test.ts`.

- [ ] **Step 1: Write the failing guard** `frontend/src/theme/onFill.test.ts`

```ts
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { lightFillFor } from './light'

/**
 * Inside Clean light, Tailwind's white is the ink. White that must stay
 * white uses on-fill: text on a solid coloured fill, and white surfaces
 * such as toggle knobs and QR mats.
 */
const SRC = path.resolve(__dirname, '..')
function adminFiles(dir: string): string[] {
  return fs.readdirSync(dir).flatMap(entry => {
    const full = path.join(dir, entry)
    const rel = path.relative(SRC, full).split(path.sep).join('/')
    if (fs.statSync(full).isDirectory()) return rel === 'portal' || rel === 'appointments' ? [] : adminFiles(full)
    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : []
  })
}
function classChunks(source: string): string[] {
  const chunks: string[] = []
  for (const [literal] of source.matchAll(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g)) {
    if (literal[0] !== '`') { chunks.push(literal); continue }
    const parts = literal.split(/(\$\{[^}]*\})/)
    chunks.push(parts.filter((_, i) => i % 2 === 0).join(' '))
    for (const e of parts.filter((_, i) => i % 2 === 1)) chunks.push(...classChunks(e.slice(2, -1)))
  }
  return chunks
}
const rel = (f: string) => path.relative(SRC, f).split(path.sep).join('/')
const files = adminFiles(SRC)

const HUES = 'red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone'
const SOLID = new RegExp(
  `(?<![\\w:/-])(?:bg|from)-(?:(?:${HUES})-(?:500|600|700|800|900)|accent|success|danger|notice|error|warning|info|black)(?:\\/(?:[4-9]\\d|100))?(?![\\w/-])`,
)
const HX_FILL_CLASS = /(?<![\w:/-])(?:bg|from)-hx-([0-9a-f]{6})(?:\/(?:[4-9]\d|100))?(?![\w/-])/
const TEXT_WHITE = /(?<![\w:/[-])text-white(?![\w/-])/
const SOLID_BG_WHITE = /(?<![\w:/[-])bg-white(?![\w/-])/

/** White that means "the foreground colour" (bars, dots, dividers drawn in the text colour): it may follow the ink. */
const FOREGROUND_WHITE: { file: string; snippet: string }[] = []

/**
 * Every JSX opening tag whose style={{…}} sets background or backgroundColor.
 * Brace-aware: arrow functions in other props (onClick={() => …}) contain
 * '>' and would cut a plain regex short.
 */
function tagsWithInlineBackground(s: string): string[] {
  const tags: string[] = []
  for (const m of s.matchAll(/style=\{\{/g)) {
    const start = s.lastIndexOf('<', m.index)
    let depth = 0
    let i = start
    for (; i < s.length; i++) {
      const ch = s[i]
      if (ch === '{') depth++
      else if (ch === '}') depth--
      else if (ch === '>' && depth === 0) break
    }
    const tag = s.slice(start, i + 1)
    if (/style=\{\{[^]*?\bbackground(?:Color)?\s*:/.test(tag)) tags.push(tag)
  }
  return tags
}

const colouredHxFill = (chunk: string) => {
  const m = chunk.match(HX_FILL_CLASS)
  return !!m && lightFillFor(m[1]).toLowerCase() === `#${m[1]}`
}

describe('whites that stay white', () => {
  it('uses text-on-fill, not text-white, on every solid coloured fill', () => {
    const offenders = files.flatMap(f =>
      classChunks(fs.readFileSync(f, 'utf8'))
        .filter(c => (SOLID.test(c) || colouredHxFill(c)) && TEXT_WHITE.test(c))
        .map(c => `${rel(f)}: ${c.slice(0, 120)}`),
    )
    expect(offenders).toEqual([])
  })

  it('uses text-on-fill on elements painted with an inline background', () => {
    const offenders = files.flatMap(f =>
      tagsWithInlineBackground(fs.readFileSync(f, 'utf8'))
        .filter(tag => TEXT_WHITE.test(tag))
        .map(tag => `${rel(f)}: ${tag.slice(0, 140)}`),
    )
    expect(offenders).toEqual([])
  })

  it('has no solid bg-white except foreground whites on the allowlist', () => {
    const offenders = files.flatMap(f =>
      classChunks(fs.readFileSync(f, 'utf8'))
        .filter(c => SOLID_BG_WHITE.test(c))
        .filter(c => !FOREGROUND_WHITE.some(a => rel(f) === a.file && c.includes(a.snippet)))
        .map(c => `${rel(f)}: ${c.slice(0, 120)}`),
    )
    expect(offenders).toEqual([])
  })
})
```

- [ ] **Step 2: Run to see it fail**

Run: `cd frontend && npx vitest run src/theme/onFill.test.ts`
Expected: FAIL with ≈74 / ≈6 / ≈37 offenders listed.

- [ ] **Step 3: Codemod the class strings** (scratchpad `on-fill.mjs`)

Same chunking as `brand-text.mjs` (session scratchpad): in each class chunk that matches `SOLID` or a coloured `bg-hx-`/`from-hx-` fill (copy `HX_FILL` from `hxColours.ts` and the `lightFillFor` rule's "coloured" test: keep when the hex is not a dark surface), replace the standalone `text-white` with `text-on-fill`. Run dry, read the listed lines, then `--write`.

- [ ] **Step 4: Fix the inline-background elements and solid bg-white by hand**

For each offender of the second guard: replace `text-white` on that element with `text-on-fill` when the inline background is a colour (tier, stage, brand, gradient); if the inline background is a dark surface (old green panel), keep `text-white` and convert the background to a `var(--legacy-…)` or token instead.

For each solid `bg-white` offender, decide:
- stays white in light (toggle knob, QR or image mat, white chip with dark text, colour swatch border) → `bg-on-fill`;
- means "the foreground colour" (progress fill, dot, divider in the text colour) → leave `bg-white` and add `{ file, snippet }` to `FOREGROUND_WHITE` with a distinctive snippet from the class string.

- [ ] **Step 5: Run the tests and look**

Run: `cd frontend && npx vitest run src/theme/ && npx tsc -b`
Expected: PASS. In the browser (Task 4 Step 8 recipe, preview on): Members list tier pills, Deals pipeline chips, Delete confirmations (red buttons), AI chat send button, any toggle in Settings: white text and knobs stay white. Preview off: Glass unchanged.

- [ ] **Step 6: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-glass && git add -A frontend/src && git commit -m "Clean light: whites that stay white use on-fill" -m "Text on solid coloured fills (red, violet, emerald, black scrims, coloured hx fills, inline data backgrounds) and white knobs/mats use on-fill, which is white in every style; elsewhere Tailwind's white follows the ink in Clean light. onFill.test.ts guards all three patterns; foreground whites are listed explicitly." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Inline colour helpers, chart colours and the inline sweep

**Files:**
- Create: `frontend/src/theme/hx.ts`, `frontend/src/theme/hx.test.ts`, `frontend/src/theme/lightSweep.test.ts`

**Interfaces:**
- Consumes: `HX_TEXT`/`HX_FILL` registries (Task 5), `LIGHT_SCOPE`.
- Produces: `hx(kind: 't' | 'f', hex: string, alpha?: number): string`; `hxWhite(alpha?: number): string`; `HX_COLOR_SCHEME: string`; `useIsLight(): boolean`; `LIGHT_CHART: { grid: string; tick: string; tooltipBg: string; tooltipBorder: string; tooltipText: string; cursor: string }`; `lightSweep.test.ts` with `CONVERTED_FILES: string[]` and `DATA_COLOURS: Record<string, string[]>`.

- [ ] **Step 1: Write the failing tests**

`frontend/src/theme/hx.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { HX_COLOR_SCHEME, LIGHT_CHART, hx, hxWhite } from './hx'

describe('inline colour helpers', () => {
  it('hx keeps the exact old colour as the fallback', () => {
    expect(hx('f', '#2c2c2c')).toBe('rgb(var(--hx-f-2c2c2c, 44 44 44) / 1)')
    expect(hx('t', '888', 0.5)).toBe('rgb(var(--hx-t-888888, 136 136 136) / 0.5)')
  })

  it('hxWhite is white unless Clean light sets the ink', () => {
    expect(hxWhite(0.06)).toBe('rgb(var(--hx-white, 255 255 255) / 0.06)')
  })

  it('keeps native controls dark outside Clean light', () => {
    expect(HX_COLOR_SCHEME).toBe('var(--hx-color-scheme, dark)')
  })

  it('has light chart colours', () => {
    expect(LIGHT_CHART.grid).toBe('#E5EAEF')
    expect(LIGHT_CHART.tooltipBg).toBe('#FFFFFF')
  })
})
```

`frontend/src/theme/lightSweep.test.ts`:

```ts
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Screens converted for Clean light (Tasks 8-14 add their files): no raw
 * colour literal left in a style={{…}} block or a style constant, except
 * data colours listed here (series colours, brand swatches, status dots)
 * that read on paper as they are. Converted literals use hx() / hxWhite().
 */
export const CONVERTED_FILES: string[] = []
export const DATA_COLOURS: Record<string, string[]> = {}

const SRC = path.resolve(__dirname, '..')
const LITERAL = /['"`](#[0-9a-fA-F]{3,8})['"`]|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*[\d.]+)?\s*\)/g

function literalsIn(file: string): string[] {
  const s = fs.readFileSync(path.join(SRC, file), 'utf8')
  const blocks = [
    ...[...s.matchAll(/style=\{\{[^]*?\}\}/g)].map(m => m[0]),
    ...[...s.matchAll(/^const \w+\s*=\s*\{[^\n]*\}/gm)].map(m => m[0]),
    ...[...s.matchAll(/colorScheme:\s*['"]dark['"]/g)].map(m => m[0]),
  ].join('\n')
  const found = [...blocks.matchAll(LITERAL)].map(m => (m[1] ?? m[0]).toLowerCase())
  if (/colorScheme:\s*['"]dark['"]/.test(blocks)) found.push("colorScheme: 'dark'")
  return found.filter(v => !(DATA_COLOURS[file] ?? []).includes(v))
}

describe('Clean light sweep', () => {
  it.each(CONVERTED_FILES.length ? CONVERTED_FILES : ['(none yet)'])('%s has no unconverted inline colour', file => {
    if (file === '(none yet)') return
    expect(literalsIn(file)).toEqual([])
  })
})
```

- [ ] **Step 2: Run to see them fail**

Run: `cd frontend && npx vitest run src/theme/hx.test.ts src/theme/lightSweep.test.ts`
Expected: FAIL (`./hx` missing); the sweep passes trivially.

- [ ] **Step 3: Write `hx.ts`**

```ts
import { useEffect, useState } from 'react'
import { hexToRgb, toTriplet } from './colour'

const six = (hex: string) => {
  const h = hex.replace('#', '').toLowerCase()
  return h.length === 3 ? h.split('').map(c => c + c).join('') : h
}

/**
 * A hard-coded inline colour Clean light can restyle: `kind` 't' for text,
 * 'f' for fills, borders, strokes and gradient stops. Everywhere else it is
 * exactly the old colour. Register the hex in hxColours.ts.
 */
export function hx(kind: 't' | 'f', hex: string, alpha = 1): string {
  const h = six(hex)
  return `rgb(var(--hx-${kind}-${h}, ${toTriplet(hexToRgb(h))}) / ${alpha})`
}

/** White as an inline colour: the ink in Clean light, white elsewhere (for rgba(255,255,255,a)). */
export function hxWhite(alpha = 1): string {
  return `rgb(var(--hx-white, 255 255 255) / ${alpha})`
}

/** colorScheme for inline styles: dark everywhere but Clean light. */
export const HX_COLOR_SCHEME = 'var(--hx-color-scheme, dark)'

/** Chart chrome in Clean light; each chart keeps its own dark constants for Glass and Classic. */
export const LIGHT_CHART = {
  grid: '#E5EAEF',
  tick: '#54626E',
  tooltipBg: '#FFFFFF',
  tooltipBorder: '#DDE3E8',
  tooltipText: '#1B2A34',
  cursor: 'rgba(27, 42, 52, 0.05)',
} as const

const lightNow = () =>
  typeof document !== 'undefined' &&
  document.documentElement.getAttribute('data-style') === 'light' &&
  document.documentElement.getAttribute('data-shell') === 'admin'

/** True while the admin shows Clean light; re-renders when the style changes. For SVG chart props, which cannot read CSS variables. */
export function useIsLight(): boolean {
  const [light, setLight] = useState(lightNow)
  useEffect(() => {
    const observer = new MutationObserver(() => setLight(lightNow()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-style', 'data-shell'] })
    return () => observer.disconnect()
  }, [])
  return light
}
```

- [ ] **Step 4: Run the tests**

Run: `cd frontend && npx vitest run src/theme/ && npx tsc -b`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-glass && git add frontend/src/theme/hx.ts frontend/src/theme/hx.test.ts frontend/src/theme/lightSweep.test.ts && git commit -m "Clean light: inline colour helpers, chart colours and the sweep" -m "hx()/hxWhite() give inline styles the same exact-old-colour fallback as the hx classes; HX_COLOR_SCHEME keeps native controls dark outside Clean light; useIsLight + LIGHT_CHART for recharts SVG props; lightSweep.test.ts will hold each converted screen group to no raw inline colour." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Deploy the foundation (invisible)**

Run the full suite, then the deploy recipe (Global Constraints) with the change list `git diff --name-status <prod-source-base> HEAD -- frontend/src frontend/tailwind.config.js` (no PHP changes yet). Verify by content: the live CSS has the `:root[data-style="light"][data-shell="admin"]` block and `.text-white{…var(--hx-white, 255 255 255)…}`; open the live admin in Glass and Classic and confirm no visible change. Record the prod main hash in the ledger.

---

### Group procedure (Tasks 8-14)

Every group task follows these steps for its file list. "Files" are relative to `frontend/src`.

1. **Convert inline colours** in the group's files:
   - `'rgba(255,255,255,a)'` → `hxWhite(a)`; `'#ffffff'`/`'#fff'` meaning text on a dark surface → `hxWhite()`; on a coloured fill → keep `'#fff'` and add to `DATA_COLOURS[file]`.
   - Dark surface or text literal `'#xxxxxx'` / `'rgba(r,g,b,a)'` → `hx('f'|'t', '#xxxxxx', a)`; add the hex to `HX_FILL`/`HX_TEXT` in `hxColours.ts` (the registry test fails until you do).
   - `colorScheme: 'dark'` → `colorScheme: HX_COLOR_SCHEME`.
   - Data colours that read on paper (series palettes, status dots, brand swatches, WhatsApp green) stay, listed in `DATA_COLOURS[file]` (lowercase, exactly as `literalsIn` reports them).
   - Inline black shadows (`boxShadow: '… rgba(0,0,0,a)'`) read fine on paper: list them in `DATA_COLOURS[file]`.
   - recharts: keep each file's dark constants; `const light = useIsLight()`, then `stroke={light ? LIGHT_CHART.grid : '<old>'}`, `tick={{ fill: light ? LIGHT_CHART.tick : '<old>' }}`, tooltip `contentStyle={light ? { background: LIGHT_CHART.tooltipBg, border: \`1px solid ${LIGHT_CHART.tooltipBorder}\`, color: LIGHT_CHART.tooltipText } : <old>}`, `cursor={{ fill: light ? LIGHT_CHART.cursor : '<old>' }}`.
2. **Add the files to `CONVERTED_FILES`** in `lightSweep.test.ts`; run `cd frontend && npx vitest run src/theme/ && npx tsc -b`. Expected: PASS.
3. **Look** (Task 4 Step 8 recipe; data-rich screens need the local Salon org: create a Sanctum token for its manager in tinker, serve it to the browser through a temporary `frontend/public` file that you delete right after, set `localStorage.auth_token` and the `loyalty-auth` store from `/api/v1/auth/me`, and set `data-style="light"` via `document.documentElement.setAttribute` because the preview flag is super-admin only; delete the token row afterwards). For every route in the group: screenshot at 1440×900 and 390×844 in light; open each drawer, modal and menu once; check text contrast by eye, white text on fills, native selects. Fix what you see with the same rules (tokens, `hx`, `on-fill`). Then one screenshot per screen in Glass (preview off) to confirm no change. Run the group's routes once in Playwright's Firefox and WebKit builds too (`playwright-core` from the npx cache with `executablePath` pointing at `%LOCALAPPDATA%/ms-playwright/firefox-*/firefox/firefox.exe` and `webkit-*/Playwright.exe`, `serviceWorkers: 'block'`): no page errors, light applied. Never save anything through the UI; if you must, restore the rows (`hotel_settings`, `audit_logs`).
4. **Commit** `Clean light: <group> converted` with the files, and say in the body what the screenshots showed and what was fixed.

### Task 8: Group, shell, dashboard and shared parts

Files: `components/Layout.tsx`, `components/AiChat.tsx`, `components/GlobalSearch.tsx`, `components/BrandBadge.tsx`, `components/BrandRequired.tsx`, `components/BrandSwitcher.tsx`, `components/DailyOpsBar.tsx`, `components/PairTabs.tsx`, `components/ViewToggle.tsx`, `components/QuickCreateBookingModal.tsx`, `hooks/useRealtimeEvents.tsx`, `pages/Dashboard.tsx`, `components/ui/` (all).
Routes: `/`, header popovers (notifications, live activity, brand menu, language), AI chat panel (open, voice overlay closed), global search, mobile drawer and bottom bar at 390.
Follow the Group procedure.

### Task 9: Group, CRM

Files: `components/AddInquiryDrawer.tsx`, `components/InquiryDrawer.tsx`, `components/LeadRow.tsx`, `components/PipelineInsights.tsx`, `hooks/useHotLeadAlert.tsx`, `pages/Deals.tsx`, `pages/hubs/DealsHub.tsx`, `pages/Inquiries.tsx`, `pages/InquiryInsights.tsx`, plus any `pages/*Customer*`, `pages/Corporate*.tsx`, `pages/GuestDetail.tsx`, `pages/Tasks.tsx` that show issues in screenshots.
Routes: `/leads` (all tabs), a lead drawer, Add inquiry drawer, `/deals` (list and pipeline), a customer, `/guests/:id`, the hot-lead toast.
Follow the Group procedure.

### Task 10: Group, members, loyalty and services

Files: `pages/Benefits.tsx`, `pages/Segments.tsx`, `pages/Tiers.tsx`, `pages/ServiceExtras.tsx`, `pages/ServiceMasters.tsx`, `pages/Services.tsx`, plus members/program/rewards screens that show issues.
Routes: `/members` (list, a member, Duplicates, Segments, Member portal tab), `/program` (tiers, benefits), `/rewards`, `/services`, service masters, service extras; their add/edit modals.
Follow the Group procedure.

### Task 11: Group, bookings and venues

Files: `components/settings/BookingTab.tsx`, `pages/BookingCalendar.tsx`, `pages/BookingDetail.tsx`, `pages/BookingExtras.tsx`, `pages/BookingPayments.tsx`, `pages/BookingRooms.tsx`, `pages/Bookings.tsx`, `pages/BookingSubmissions.tsx`, `pages/CalendarUnified.tsx`, `pages/ServiceBookingCalendar.tsx`, `pages/ServiceBookings.tsx`, `pages/Venues.tsx`, `pages/Properties.tsx`.
Routes: `/bookings` (list, donut), a booking, `/bookings/calendar` (day, week, month, timeline), payments, submissions, rooms, extras, `/service-bookings` (list, drawer, calendar), Settings → Booking tab.
Follow the Group procedure.

### Task 12: Group, chat, engagement, marketing and reviews

Files: `pages/ChatbotAnalytics.tsx` (recharts), `pages/ChatbotWidget.tsx` (widget preview keeps its own design: list its colours in `DATA_COLOURS`), `pages/ChatInbox.tsx`, `components/SurveyDesignPanel.tsx`, `pages/CampaignDetail.tsx` (recharts), plus engagement/visitors/knowledge-base/campaign/review screens that show issues.
Routes: `/chat-inbox`, `/engagement`, `/visitors`, chatbot setup (all tabs), `/marketing` (campaigns, templates, reviews), a review, the review form builder, notifications.
Follow the Group procedure.

### Task 13: Group, planner and content planner

Files: `components/ContentPlanner/Dashboard.tsx`, `components/ContentPlanner/PostsView.tsx`, `components/ContentPlanner/StrategyView.tsx`, `components/ContentPlanner/CalendarView.tsx`, `components/PlannerDaySidebar.tsx` (recharts), `components/PlannerStats.tsx` (recharts), `components/PoolManager.tsx`, `pages/Planner.tsx`, `components/BacklogStrip.tsx`, `components/TeamBucketsView.tsx`, `components/PlannerSettings.tsx`.
Routes: `/planner` (day, schedule, month, pool, team, stats), backlog strip and its mobile sheet, task drawer, content planner (dashboard, calendar, posts, strategy).
Follow the Group procedure.

### Task 14: Group, analytics, reports, settings, billing, admin panels and the landing editor chrome

Files: `pages/Analytics.tsx` (recharts), `pages/Reports.tsx` (recharts), `pages/AiInsights.tsx`, `components/AiUsagePanel.tsx`, `components/ApiTokensPanel.tsx`, `components/DocumentationCenter.tsx`, `pages/Brands.tsx`, `pages/Settings.tsx` (preset preview cards keep their own designs: list their colours in `DATA_COLOURS`), `pages/Billing.tsx`, `pages/AuditLog.tsx`, `pages/landing/LandingEditor.tsx` and the editor's chrome components (the preview canvas shows the tenant's page and does not change).
Routes: `/analytics`, `/reports`, `/ai-insights`, every Settings tab, `/billing`, `/brands`, audit log, `/landing-pages` (wizard and editor).
Follow the Group procedure. After this task, deploy (recipe; still invisible: nobody can pick light, and the preview flag is super-admin only).

---

### Task 15: Owner preview on production

**Files:**
- Modify: `frontend/src/components/settings/StylePicker.tsx`, `frontend/src/components/settings/StylePicker.test.tsx`, `frontend/src/pages/Settings.tsx`

**Interfaces:**
- Consumes: `readStylePreview`, `setStylePreview` (Task 3).
- Produces: `StylePreview({ canPreview: boolean; previewing: boolean; onToggle: (on: boolean) => void }): JSX.Element | null`, exported from `StylePicker.tsx` (a separate control below the cards, so the cards stay a pure radio group and their existing tests are untouched).

- [ ] **Step 1: Write the failing tests** (add to `StylePicker.test.tsx`; import `StylePreview` next to `StylePicker`)

```tsx
describe('StylePreview', () => {
  it('offers a device preview of Clean light to super admins only', () => {
    const asOwner = renderToStaticMarkup(<StylePreview canPreview previewing={false} onToggle={() => {}} />)
    expect(asOwner).toContain('Preview Clean light on this device')
    expect(StylePreview({ canPreview: false, previewing: false, onToggle: () => {} })).toBeNull()
  })

  it('switches the preview on and off', () => {
    const onToggle = vi.fn()
    const off = StylePreview({ canPreview: true, previewing: false, onToggle }) as ReactElement<{ onClick: () => void }>
    off.props.onClick()
    const on = StylePreview({ canPreview: true, previewing: true, onToggle }) as ReactElement<{ onClick: () => void }>
    expect(renderToStaticMarkup(on)).toContain('Stop the preview')
    on.props.onClick()
    expect(onToggle.mock.calls).toEqual([[true], [false]])
  })
})
```

- [ ] **Step 2: Run to see them fail**

Run: `cd frontend && npx vitest run src/components/settings/StylePicker.test.tsx`
Expected: FAIL (`StylePreview` is not exported).

- [ ] **Step 3: Implement**

Add to `StylePicker.tsx` (hook-free, like `StylePicker`):

```tsx
/**
 * A super admin's device-only preview of Clean light before it opens to
 * every organisation (spec D5). Nothing is saved; the page reloads in the
 * previewed style. Renders nothing for anyone else.
 */
export function StylePreview({ canPreview, previewing, onToggle }: {
  canPreview: boolean
  previewing: boolean
  onToggle: (on: boolean) => void
}) {
  if (!canPreview) return null
  return (
    <button
      type="button"
      onClick={() => onToggle(!previewing)}
      className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-dark-border px-3 py-1.5 text-xs font-semibold text-t-primary hover:bg-dark-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
    >
      {previewing ? 'Stop the preview' : 'Preview Clean light on this device'}
    </button>
  )
}
```

In `Settings.tsx`, next to the existing `<StylePicker value={activeStyle} … />`:

```tsx
          <StylePreview canPreview={isSuperAdmin} previewing={previewing} onToggle={togglePreview} />
```

with, in the component body (`useAuthStore` is the store in `frontend/src/stores/authStore.ts`; `staff.role` is `'super_admin' | 'manager' | …`):

```tsx
  const isSuperAdmin = useAuthStore(s => s.staff?.role === 'super_admin')
  const [previewing, setPreviewing] = useState(() => readStylePreview() === 'light')
  const togglePreview = (on: boolean) => {
    setStylePreview(on ? 'light' : null)
    setPreviewing(on)
    window.location.reload()
  }
```

(imports: `StylePreview` from `../components/settings/StylePicker`, `readStylePreview, setStylePreview` from `../lib/stylePreview`; reuse an existing `useAuthStore` import if Settings already has one).

- [ ] **Step 4: Run tests, look, deploy**

Run: `cd frontend && npx tsc -b && npx vitest run`. Expected: PASS apart from the 3 known. Look locally as the demo super admin: the button shows under the Style cards, the preview turns the admin light after the reload while the Glass card stays marked Active (the organisation's style), "Stop the preview" turns it back; as the Salon manager the button is absent. Deploy (recipe). Verify by content (the Settings chunk contains "Preview Clean light on this device").

- [ ] **Step 5: Commit** (before the deploy)

```bash
cd /c/wamp64/www/Hexa-Tech-glass && git add frontend/src/components/settings/StylePicker.tsx frontend/src/components/settings/StylePicker.test.tsx frontend/src/pages/Settings.tsx && git commit -m "Clean light: super admins can preview it on their own device" -m "Settings → Branding → Style shows 'Preview Clean light on this device' to super admins: it turns this browser's admin light without saving anything; 'Stop the preview' turns it back. Everyone else sees the card as 'Coming next'." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Owner review gate**

Tell the owner the preview is live and what to look at (their real screens at desk and phone sizes, iPad Safari). Collect fixes; each fix follows the Group procedure in the owning group's files. Do not start Task 16 until the owner says Clean light can open.

---

### Task 16: Release: Clean light for every organisation

**Files:**
- Modify: `app/Http/Controllers/Api/V1/Admin/SettingsController.php:15`, its PHP test (find with `grep -rln "theme_style" tests/`), `frontend/src/components/settings/StylePicker.tsx`, `frontend/src/components/settings/StylePicker.test.tsx`, spec §2 status line.

**Interfaces:**
- Consumes: everything above.
- Produces: `theme_style = 'light'` accepted and saved; the Clean light card selectable.

- [ ] **Step 1: Write the failing tests**

PHP (in the existing theme_style test class): a case that PUTs `settings: [{ key: 'theme_style', value: 'light' }]` as a manager and asserts 200 and `persisted.theme_style === 'light'`; the existing "rejects other values" case stays (e.g. `'neon'` → 422).

Frontend (`StylePicker.test.tsx`): replace "cannot pick Clean light yet" with

```tsx
  it('picks Clean light like the others', () => {
    const { card, onPick } = cards('glass')
    expect(card('light').props.disabled).toBe(false)
    card('light').props.onClick()
    expect(onPick).toHaveBeenCalledWith('light')
  })
```

and update the arrow-key test: from `classic`, ArrowRight now goes to `light`; from `light`, ArrowRight wraps to `glass`.

- [ ] **Step 2: Run to see them fail**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test <the theme_style test file>` and `cd frontend && npx vitest run src/components/settings/StylePicker.test.tsx`.
Expected: both FAIL.

- [ ] **Step 3: Implement**

`SettingsController::THEME_STYLES = ['glass', 'classic', 'light'];` (update its comment and the validation message to "glass, classic or light"). In `StylePicker.tsx`: drop `StyleId`, `isAvailable`, the `disabled`/"Coming next" branches and the `StylePreview` component (every card is a choice; `AVAILABLE` becomes all three ids in card order), and update the Clean light blurb if the owner wants other words. In `Settings.tsx`: remove `<StylePreview … />` and its state, and remove the `StylePreview` tests. Retire the preview in the theme code itself (final review I5): `effectiveStyle()` stops reading the flag (it returns the organisation's style), and the theme code removes `hx-style-preview` from localStorage once when it loads (in `useTheme.ts`, next to the module-load paint), so no browser keeps a stale preview whatever page it opens first. Test: with the flag set in storage, `effectiveStyle('classic')` returns 'classic' and loading the theme module clears the key.

- [ ] **Step 4: Run all tests**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Settings/` (scoped; read the `Tests:` line) and `cd frontend && npx tsc -b && npx vitest run`.
Expected: PASS (3 known plannerMeta failures only).

- [ ] **Step 5: Commit, deploy, verify**

```bash
cd /c/wamp64/www/Hexa-Tech-glass && git add -A app frontend/src tests docs/superpowers/specs/2026-10-09-admin-clean-light-design.md && git commit -m "Clean light: every organisation can pick it" -m "theme_style accepts 'light'; the Style card is a normal choice; the device preview is retired." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Deploy with the recipe (this change includes PHP: run the scoped Settings PHP suite on the deploy worktree too). Verify by content (Settings chunk has no "Coming next"; `SettingsController` change is server-side: confirm by switching a test organisation to Clean light in production only with the owner's go, or by the API answering 200 for `light` with a throwaway org the owner names). Update the ledger and memory.
