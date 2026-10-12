# HexaTech Appointments "Atelier" — Release 1 (the new look) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Appointments workspace (`/appointments`) the approved Atelier look on every screen, with a per-device Light / Dark / Auto theme, a collapsible side panel, the organisation's brand colour as the accent, and small motion — without changing what anyone can do.

**Architecture:** The workspace already paints only through its own `--a-*` tokens (`appointments/theme/appointments.css`, Tailwind `a-*` aliases, enforced by `appointments/tokens.test.ts`). Release 1 adds a dark token set under `[data-appointments][data-theme="dark"]`, derives the accent tokens at runtime from the brand colour sent by the bootstrap endpoint, stores the theme and side-panel size per device (`lib/look.ts`), self-hosts three type families, and restyles the shell, the shared `ui/` primitives and each screen.

**Tech Stack:** Laravel 13 (PHP 8.4), React 19 + TypeScript, Vite 5, Tailwind 3.4, vitest (node env, static render), lucide-react icons.

**Spec:** `docs/superpowers/specs/2026-10-12-appointments-atelier-design.md` (approved 2026-10-12). Mock: https://claude.ai/artifact/85gyh2CMopJAGGiUcYHePW (board A).

## Global Constraints

- PHP is `/c/wamp64/bin/php/php8.4.20/php.exe`. Never run a bare `artisan test`; run `artisan test tests/Feature/Appointments/` (and the other named directories) in the foreground and read the `Tests:` line.
- Frontend checks: `cd frontend && npx tsc -b && npx vitest run` — after Task 1 only the 3 known `plannerMeta` failures may remain.
- Never run `npm run build` on the feature branch and never commit `frontend/dist`, `public/spa`, `resources/spa-shell` (the controller builds on the deploy worktree).
- Windows: edit files with the Edit/Write tools, not `sed`/`python` (CRLF hazards). Git Bash for git.
- Every colour in `frontend/src/appointments` is an `a-*` token; no raw colour classes, no hex in `.tsx` (`tokens.test.ts`). Every rule in `appointments.css` starts with `[data-appointments]` (`@font-face` blocks are allowed; `@keyframes` live in `tailwind.config.js`, never in `appointments.css`).
- No text smaller than 12 px (`tokens.test.ts`); use `text-xs` (12 px) as the floor.
- Text contrast ≥ 4.5:1 in **both** themes; text on a coloured fill is white while white reads ≥ 3:1 on the fill, else dark ink `#0E1A24`.
- Default theme `light`; Auto follows `prefers-color-scheme` live. Theme and side-panel size are stored per device under the localStorage key `appointments:look` (refinement of spec §4.3: a key of its own, because `appointments:prefs` is written whole by the calendar page and would overwrite a shell change).
- No new npm dependencies; motion is CSS only and is switched off under `prefers-reduced-motion: reduce` (the existing rule in `appointments.css`).
- Nothing outside `frontend/src/appointments`, `frontend/tailwind.config.js`, the bootstrap controller and its test, and the stayBook test changes. The full admin, portal, public widget and e-mails are untouched.
- New user-facing strings go into all five `appointments/i18n/appointments.{en,de,es,fr,ru}.json` files.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A brand colour almost the same as the page (white `#ffffff` in light, near-black `#111111` in dark): primary buttons still show an edge and their text stays readable — Task 2 tests `edge` for both and Task 7 tests the `data-accent-edge` rule.
2. Auto while the device flips between dark and light with the workspace open: the workspace follows without a reload — Task 5 tests the `matchMedia` subscription.
3. A stored look from an older or broken version (`{"theme":"neon"}`, invalid JSON, a throwing `localStorage`): the defaults are used and nothing crashes — Task 5 tests.
4. Russian: Cyrillic headings get the Source Serif face (Fraunces has none) — Task 6 tests the `unicode-range` of the Cyrillic display face; Task 12 checks it in the browser.
5. The slim side panel for keyboard and screen-reader users: every item keeps its name, the toggle reports its state — Task 7 tests (sr-only labels present, `aria-expanded="false"`).

## File Structure

| File | Responsibility |
|------|----------------|
| `frontend/src/portal/pages/stay/stayBook.test.tsx` | Pin the clock (fixture dates passed on 2026-10-10). |
| `frontend/src/appointments/theme/appointments.css` | Light + dark token sets, fonts, tooltips, input polish, accent edge. |
| `frontend/tailwind.config.js` | `a-*` aliases for the new tokens, `font-a-display`/`font-a-mono`, `shadow-a*`, `animate-a-*` keyframes. |
| `frontend/src/appointments/theme/contrast.test.ts` | Contrast pairs for both token sets; CSS accent defaults equal the derivation. |
| `frontend/src/appointments/theme/accent.ts` (+ test) | Brand colour → accent tokens per theme. |
| `app/Http/Controllers/Api/V1/Admin/Appointments/BootstrapController.php` | `accent` in the bootstrap payload. |
| `tests/Feature/Appointments/BootstrapAccentTest.php` | The `accent` field. |
| `frontend/src/appointments/lib/look.ts` (+ test) | Per-device theme + side-panel size, theme resolution, `useLook()`. |
| `frontend/src/appointments/theme/fonts/*` (+ `fonts.test.ts`) | Self-hosted Fraunces, Source Serif 4 (Cyrillic), Inter Tight, IBM Plex Mono + OFL texts. |
| `frontend/src/appointments/AppointmentsShell.tsx` (+ test) | Side panel full/slim, theme switch, accent + theme on the root, top bar, narrow menu. |
| `frontend/src/appointments/ui/ThemeSwitch.tsx` | Light / Dark / Auto segmented control. |
| `frontend/src/appointments/ui/Button.tsx`, `Notice.tsx`, `Typography.tsx` (new), `Skeleton.tsx` (new) | Shared primitives. |
| `frontend/src/appointments/lib/wallClock.ts` | `isoWeek()`. |
| `frontend/src/appointments/calendar/*` | Toolbar, TimeGrid, AppointmentCard, MiniMonth, DayOverview, ListView, CalendarPage. |
| `frontend/src/appointments/panel/AppointmentPanel.tsx`, `AppointmentView.tsx`, `VisitSteps.tsx` (new) | Panel look, visit progress. |
| `frontend/src/appointments/{clients,takings,insights,setup}/*` | Page titles, section titles, figures, tables. |

---

### Task 1: Pin the stayBook test's clock

The portal test `stayBook.test.tsx` builds dates around 2026-10-10 and reads the real clock, so it fails since that day passed. Pin the clock so the suite is green before the redesign starts.

**Files:**
- Modify: `frontend/src/portal/pages/stay/stayBook.test.tsx`

**Interfaces:** none.

- [ ] **Step 1: See it fail**

Run: `cd frontend && npx vitest run src/portal/pages/stay/stayBook.test.tsx`
Expected: 2 failures in `DatesStep` ("Nights: 2", "The shortest stay here is 3 nights.").

- [ ] **Step 2: Pin the date**

Change the first import line and add the hooks right after the `vi.mock(...)` blocks (before `const noop`):

```tsx
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
```

```tsx
// The fixture's stay starts on 2026-10-10: keep "today" before it, whatever day the suite runs.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-01T09:00:00Z'))
})
afterAll(() => { vi.useRealTimers() })
```

- [ ] **Step 3: Run it**

Run: `cd frontend && npx vitest run src/portal/pages/stay/stayBook.test.tsx`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/portal/pages/stay/stayBook.test.tsx
git commit -m "Pin the stayBook test's clock before its fixture dates" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Accent from the brand colour

**Files:**
- Create: `frontend/src/appointments/theme/accent.ts`
- Test: `frontend/src/appointments/theme/accent.test.ts`

**Interfaces:**
- Produces:
  - `export const FALLBACK_ACCENT = '#3b82f6'`
  - `export type ThemeName = 'light' | 'dark'`
  - `export interface AccentTokens { accent: string; ink: string; deep: string; text: string; rail: string; edge: boolean }` (hex strings, lowercase `#rrggbb`)
  - `export function accentTokens(brand: string | null | undefined, theme: ThemeName): AccentTokens`
  - `export function triplet(hex: string): string` → `'r g b'`
  - `export function accentStyle(t: AccentTokens): Record<string, string>` → `{ '--a-accent', '--a-accent-ink', '--a-accent-deep', '--a-accent-text', '--a-accent-rail' }` as triplets
  - `export function contrast(a: string, b: string): number`
- Consumes: nothing. (Task 3's contrast test and Task 7's shell use it.)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { FALLBACK_ACCENT, accentStyle, accentTokens, contrast, triplet } from './accent'

const BRANDS = ['#3b82f6', '#c9a84c', '#ffffff', '#f5f5f5', '#fde68a', '#111111', '#000000', '#0e8f7e', '#b4884d', '#9b5c8f',
  '#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e', '#14b8a6', '#06b6d4', '#0ea5e9', '#6366f1', '#8b5cf6',
  '#d946ef', '#ec4899', '#f43f5e', '#64748b', '#78716c', '#1e3a8a', '#7c2d12', '#a3e635']
const SURFACES = {
  light: ['#f4f6f8', '#ffffff', '#eef2f5'],
  dark: ['#0e1a24', '#13232f', '#1a2e3c'],
} as const

describe('accentTokens', () => {
  it('falls back to the default palette blue for a missing or broken colour', () => {
    expect(accentTokens(null, 'light').accent).toBe(FALLBACK_ACCENT)
    expect(accentTokens(undefined, 'dark').accent).toBe(FALLBACK_ACCENT)
    expect(accentTokens('blue', 'light').accent).toBe(FALLBACK_ACCENT)
    expect(accentTokens('#ABC', 'light').accent).toBe('#aabbcc')
    expect(accentTokens('#C9A84C', 'light').accent).toBe('#c9a84c')
  })

  for (const theme of ['light', 'dark'] as const) {
    for (const brand of BRANDS) {
      it(`${brand} in ${theme}: button text, hover and accent text all read`, () => {
        const t = accentTokens(brand, theme)
        const minInk = t.ink === '#ffffff' ? 3 : 4.5
        expect(contrast(t.ink, t.accent)).toBeGreaterThanOrEqual(minInk)
        expect(contrast(t.ink, t.deep)).toBeGreaterThanOrEqual(minInk)
        for (const s of SURFACES[theme]) expect(contrast(t.text, s)).toBeGreaterThanOrEqual(4.5)
        expect(contrast(t.rail, theme === 'light' ? '#0e1a24' : '#0a141c')).toBeGreaterThanOrEqual(3)
      })
    }
  }

  it('white text while white reads at 3:1 on the brand, dark ink below (owner, 2026-10-09)', () => {
    expect(accentTokens('#3b82f6', 'light').ink).toBe('#ffffff')
    expect(accentTokens('#fde68a', 'light').ink).toBe('#0e1a24')
  })

  it('gives an edge to a brand that is almost the page colour', () => {
    expect(accentTokens('#ffffff', 'light').edge).toBe(true)
    expect(accentTokens('#f5f5f5', 'light').edge).toBe(true)
    expect(accentTokens('#111111', 'dark').edge).toBe(true)
    expect(accentTokens('#3b82f6', 'light').edge).toBe(false)
    expect(accentTokens('#3b82f6', 'dark').edge).toBe(false)
  })

  it('writes the CSS variables as triplets', () => {
    expect(triplet('#0e1a24')).toBe('14 26 36')
    const style = accentStyle(accentTokens('#c9a84c', 'light'))
    expect(Object.keys(style).sort()).toEqual(['--a-accent', '--a-accent-deep', '--a-accent-ink', '--a-accent-rail', '--a-accent-text'])
    expect(style['--a-accent']).toBe('201 168 76')
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd frontend && npx vitest run src/appointments/theme/accent.test.ts`
Expected: FAIL — cannot find module `./accent`.

- [ ] **Step 3: Implement**

```ts
/**
 * The workspace accent from the organisation's brand colour (Settings →
 * Branding → Primary), per theme (spec 4.2):
 *  - accent: the brand itself, for fills (primary button, selected states);
 *  - ink:    text on those fills — white while white reads ≥ 3:1, else dark ink;
 *  - deep:   the hover fill, moved away from the ink so it keeps its contrast;
 *  - text:   accent-coloured text, darkened (light) / lightened (dark) until it
 *            reads ≥ 4.6:1 on the canvas, the surfaces and a 14 % accent tint;
 *  - rail:   a small accent mark on the side panel, ≥ 3:1 on it;
 *  - edge:   the brand is almost the panel colour — fills need an outline.
 */
export type ThemeName = 'light' | 'dark'

export const FALLBACK_ACCENT = '#3b82f6'
const INK = '#0e1a24'
const WHITE = '#ffffff'

/** The colours accent text and marks sit on — the values in appointments.css. */
const SURFACES: Record<ThemeName, { canvas: string; surface: string; surface2: string; side: string }> = {
  light: { canvas: '#f4f6f8', surface: '#ffffff', surface2: '#eef2f5', side: '#0e1a24' },
  dark: { canvas: '#0e1a24', surface: '#13232f', surface2: '#1a2e3c', side: '#0a141c' },
}

export interface AccentTokens { accent: string; ink: string; deep: string; text: string; rail: string; edge: boolean }

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function toHex(c: number[]): string {
  return '#' + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')
}

function mix(a: string, b: string, t: number): string {
  const A = rgb(a), B = rgb(b)
  return toHex(A.map((v, i) => v + (B[i] - v) * t))
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map(v => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4) })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrast(a: string, b: string): number {
  const x = luminance(a), y = luminance(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

function normalise(brand: string | null | undefined): string {
  const v = (brand ?? '').trim().toLowerCase()
  if (/^#[0-9a-f]{6}$/.test(v)) return v
  if (/^#[0-9a-f]{3}$/.test(v)) return '#' + v.slice(1).split('').map(c => c + c).join('')
  return FALLBACK_ACCENT
}

/** The colour moved towards `toward` in 5 % steps until it reads `min` on every background. */
function readableOn(color: string, backgrounds: string[], min: number, toward: string): string {
  for (let i = 0; i <= 20; i++) {
    const c = i === 0 ? color : mix(color, toward, i / 20)
    if (backgrounds.every(b => contrast(c, b) >= min)) return c
  }
  return toward
}

export function accentTokens(brand: string | null | undefined, theme: ThemeName): AccentTokens {
  const accent = normalise(brand)
  const s = SURFACES[theme]
  const ink = contrast(WHITE, accent) >= 3 ? WHITE : INK
  const deep = mix(accent, ink === WHITE ? '#000000' : WHITE, 0.12)
  const tint = mix(s.surface, accent, 0.14)
  const text = readableOn(accent, [s.canvas, s.surface, s.surface2, tint], 4.6, theme === 'light' ? '#000000' : WHITE)
  const rail = readableOn(accent, [s.side], 3, WHITE)
  const edge = contrast(accent, s.surface) < 1.5
  return { accent, ink, deep, text, rail, edge }
}

export function triplet(hex: string): string {
  return rgb(hex).join(' ')
}

export function accentStyle(t: AccentTokens): Record<string, string> {
  return {
    '--a-accent': triplet(t.accent),
    '--a-accent-ink': triplet(t.ink),
    '--a-accent-deep': triplet(t.deep),
    '--a-accent-text': triplet(t.text),
    '--a-accent-rail': triplet(t.rail),
  }
}
```

- [ ] **Step 4: Run it**

Run: `cd frontend && npx vitest run src/appointments/theme/accent.test.ts`
Expected: PASS (61 tests). If a brand fails `ink on deep`, the 12 % mix pushed a borderline colour the wrong way — fix by checking `contrast(ink, deep) >= contrast(ink, accent)` and using `accent` as `deep` otherwise (never weaken the test).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/appointments/theme/accent.ts frontend/src/appointments/theme/accent.test.ts
git commit -m "Appointments: accent tokens from the organisation's brand colour" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Atelier tokens, light and dark

**Files:**
- Modify: `frontend/src/appointments/theme/appointments.css`
- Modify: `frontend/tailwind.config.js` (the `a:` colour block ~line 137, `borderRadius`, `boxShadow`, `fontFamily`, add `keyframes` + `animation` under `theme.extend`)
- Modify: `frontend/src/appointments/theme/contrast.test.ts`

**Interfaces:**
- Consumes: `accentTokens`, `triplet`, `FALLBACK_ACCENT` (Task 2).
- Produces: Tailwind classes `bg-a-accent`, `text-a-accent-text`, `bg-a-accent-deep`, `text-a-accent-ink`, `bg-a-accent-rail`, `text-a-danger-ink`, `bg-a-now`, `text-a-now-ink`, `border-a-now`, `bg-a-scrim`, `font-a-display`, `font-a-mono`, `shadow-a-sm`, `shadow-a`, `shadow-a-lg`, `animate-a-rise`, `animate-a-fade`, `animate-a-slide-in`, `animate-a-pop`, `animate-a-pulse`; CSS variables `--a-font-display`, `--a-font-text`, `--a-font-mono`; `data-theme="dark"` on `[data-appointments]` switches every token.

- [ ] **Step 1: Write the failing contrast test**

Replace the parsing at the top of `contrast.test.ts` so both blocks are read, and check every pair in both themes. The new file:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FALLBACK_ACCENT, accentTokens } from './accent'

/**
 * Every text-on-background pair the workspace draws, at 4.5:1 or better,
 * in the light set ([data-appointments]) and the dark set
 * ([data-appointments][data-theme="dark"]). Status tones are drawn as text
 * in the tone over a 12 % tint of the same tone (cards, StatusMark, Notice).
 */
const css = readFileSync(new URL('./appointments.css', import.meta.url), 'utf8')

function block(selector: string): Record<string, number[]> {
  const start = css.indexOf(`${selector} {`)
  if (start < 0) throw new Error(`no block ${selector}`)
  const body = css.slice(start, css.indexOf('}', start))
  const vars: Record<string, number[]> = {}
  for (const m of body.matchAll(/--a-([a-z0-9-]+):\s*(\d+) (\d+) (\d+);/g)) vars[m[1]] = [Number(m[2]), Number(m[3]), Number(m[4])]
  return vars
}

const lum = (c: number[]) => {
  const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
}
const ratio = (a: number[], b: number[]) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
const tint = (tone: number[], under: number[], k = 0.12) => tone.map((v, i) => v * k + under[i] * (1 - k))
const hex = (c: number[]) => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('')

const TOKENS = ['canvas', 'surface', 'surface-2', 'text', 'text-2', 'border', 'side', 'side-2', 'side-text', 'side-text-2',
  'accent', 'accent-ink', 'accent-deep', 'accent-text', 'accent-rail', 'danger', 'danger-ink', 'now', 'now-ink', 'hatch', 'scrim',
  'st-pending', 'st-confirmed', 'st-progress', 'st-completed', 'st-cancelled', 'st-noshow']

const PAIRS: [string, string][] = [
  ['text', 'canvas'], ['text', 'surface'], ['text', 'surface-2'],
  ['text-2', 'canvas'], ['text-2', 'surface'], ['text-2', 'surface-2'],
  ['side-text', 'side'], ['side-text', 'side-2'], ['side-text-2', 'side'], ['side-text-2', 'side-2'],
  ['accent-text', 'canvas'], ['accent-text', 'surface'], ['accent-text', 'surface-2'],
  ['danger-ink', 'danger'], ['now-ink', 'now'],
]
const TONES = ['st-pending', 'st-confirmed', 'st-progress', 'st-completed', 'st-cancelled', 'st-noshow', 'danger']

for (const [theme, selector] of [['light', '[data-appointments]'], ['dark', '[data-appointments][data-theme="dark"]']] as const) {
  describe(`appointments tokens — ${theme}`, () => {
    const vars = theme === 'light' ? block(selector) : { ...block('[data-appointments]'), ...block(selector) }

    it('defines every token the Tailwind aliases read', () => {
      for (const name of TOKENS) expect(vars[name], `--a-${name} is missing`).toBeDefined()
    })

    for (const [fg, bg] of PAIRS) {
      it(`--a-${fg} on --a-${bg} is at least 4.5:1`, () => {
        expect(ratio(vars[fg], vars[bg])).toBeGreaterThanOrEqual(4.5)
      })
    }

    for (const tone of TONES) {
      for (const under of ['canvas', 'surface', 'surface-2']) {
        it(`${tone} on its tint over ${under} is at least 4.5:1`, () => {
          expect(ratio(vars[tone], tint(vars[tone], vars[under]))).toBeGreaterThanOrEqual(4.5)
        })
      }
    }

    it('the accent defaults are the derivation of the fallback brand colour', () => {
      const t = accentTokens(FALLBACK_ACCENT, theme)
      expect(hex(vars.accent)).toBe(t.accent)
      expect(hex(vars['accent-ink'])).toBe(t.ink)
      expect(hex(vars['accent-deep'])).toBe(t.deep)
      expect(hex(vars['accent-text'])).toBe(t.text)
      expect(hex(vars['accent-rail'])).toBe(t.rail)
    })
  })
}
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd frontend && npx vitest run src/appointments/theme/contrast.test.ts`
Expected: FAIL (missing tokens, missing dark block).

- [ ] **Step 3: Write the token sets**

In `appointments.css`, replace the current `[data-appointments] { … }` block (lines 12-45) with the two blocks below. Keep every other rule in the file. The accent values in both blocks are the output of `accentTokens('#3b82f6', theme)` from Task 2 — print them with
`cd frontend && node -e "import('./src/appointments/theme/accent.ts').then(m => { for (const th of ['light','dark']) { const t = m.accentTokens('#3b82f6', th); console.log(th, [t.accent, t.ink, t.deep, t.text, t.rail].map(m.triplet).join(' | ')) } })"`
(Node 24 strips the types itself; the order printed is accent | ink | deep | text | rail.)
and paste them in place of the `R G B` placeholders marked `/* from accentTokens */` (the contrast test's last case proves they match).

```css
/*
 * Appointments workspace tokens — "Atelier" (spec 2026-10-12). Every rule is
 * scoped under [data-appointments]; every colour is an `R G B` triplet so
 * Tailwind's `<alpha-value>` works. The light set is the default; the dark
 * set applies with data-theme="dark" on the same element. The accent tokens
 * here are the fallback brand's; the shell overrides them inline from the
 * organisation's brand colour (theme/accent.ts). contrast.test.ts pins every
 * text pair at 4.5:1 in both sets.
 */
[data-appointments] {
  --a-canvas: 244 246 248;
  --a-surface: 255 255 255;
  --a-surface-2: 238 242 245;
  --a-text: 27 42 52;
  --a-text-2: 84 98 110;
  --a-border: 221 227 232;

  --a-side: 14 26 36;
  --a-side-2: 31 45 56;
  --a-side-text: 232 238 242;
  --a-side-text-2: 169 186 196;

  --a-accent: R G B; /* from accentTokens */
  --a-accent-ink: R G B; /* from accentTokens */
  --a-accent-deep: R G B; /* from accentTokens */
  --a-accent-text: R G B; /* from accentTokens */
  --a-accent-rail: R G B; /* from accentTokens */
  --a-danger: 176 36 36;
  --a-danger-ink: 255 255 255;
  --a-now: 200 50 60;
  --a-now-ink: 255 255 255;
  --a-hatch: 84 98 110;
  --a-scrim: 14 26 36;

  --a-st-pending: 138 80 0;
  --a-st-confirmed: 18 100 58;
  --a-st-progress: 79 58 176;
  --a-st-completed: 44 70 108;
  --a-st-cancelled: 88 95 107;
  --a-st-noshow: 166 38 58;

  --a-shadow-sm: 0 1px 2px rgb(14 26 36 / 0.05);
  --a-shadow: 0 10px 30px rgb(14 26 36 / 0.10);
  --a-shadow-lg: 0 28px 70px rgb(14 26 36 / 0.20);
  --a-font-display: 'A Display', Georgia, 'Times New Roman', serif;
  --a-font-text: 'A Text', system-ui, sans-serif;
  --a-font-mono: 'A Mono', ui-monospace, 'SFMono-Regular', monospace;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-2xl: 20px;

  color-scheme: light;
  background-color: rgb(var(--a-canvas));
  color: rgb(var(--a-text));
  font-family: var(--a-font-text);
  font-size: 14px;
  line-height: 1.45;
  letter-spacing: 0;
  -webkit-font-smoothing: antialiased;
  transition: background-color 0.3s ease, color 0.3s ease;
}

[data-appointments][data-theme="dark"] {
  --a-canvas: 14 26 36;
  --a-surface: 19 35 47;
  --a-surface-2: 26 46 60;
  --a-text: 232 238 242;
  --a-text-2: 159 178 189;
  --a-border: 42 59 72;

  --a-side: 10 20 28;
  --a-side-2: 22 36 47;
  --a-side-text: 232 238 242;
  --a-side-text-2: 159 178 189;

  --a-accent: R G B; /* from accentTokens */
  --a-accent-ink: R G B; /* from accentTokens */
  --a-accent-deep: R G B; /* from accentTokens */
  --a-accent-text: R G B; /* from accentTokens */
  --a-accent-rail: R G B; /* from accentTokens */
  --a-danger: 255 138 155;
  --a-danger-ink: 14 26 36;
  --a-now: 255 122 128;
  --a-now-ink: 14 26 36;
  --a-hatch: 159 178 189;
  --a-scrim: 4 10 14;

  --a-st-pending: 240 179 90;
  --a-st-confirmed: 95 211 154;
  --a-st-progress: 179 166 255;
  --a-st-completed: 169 193 227;
  --a-st-cancelled: 163 173 184;
  --a-st-noshow: 255 138 155;

  --a-shadow-sm: 0 1px 2px rgb(0 0 0 / 0.30);
  --a-shadow: 0 12px 32px rgb(0 0 0 / 0.42);
  --a-shadow-lg: 0 28px 70px rgb(0 0 0 / 0.55);

  color-scheme: dark;
}
```

Also in `appointments.css`:
- the `select, input, textarea` rule: `color-scheme: inherit;` instead of `light`;
- headings rule: `font-family: var(--a-font-display);` is NOT applied globally — keep `font-family: inherit;` (screens opt in with `font-a-display`);
- `.a-hatch` uses `rgb(var(--a-hatch) / 0.14)`;
- add after the focus rules:

```css
/* Accent fills on a brand that is almost the page colour keep an edge (spec 4.2). */
[data-appointments][data-accent-edge] .bg-a-accent {
  box-shadow: inset 0 0 0 1px rgb(var(--a-accent-text));
}

/* Form controls: a calm transition and the accent for ticks. */
[data-appointments] input,
[data-appointments] select,
[data-appointments] textarea {
  transition: border-color 0.15s ease, box-shadow 0.15s ease, background-color 0.3s ease;
}

[data-appointments] input[type="checkbox"],
[data-appointments] input[type="radio"] {
  accent-color: rgb(var(--a-accent));
}

/* The slim side panel names each icon beside it on hover and on keyboard focus. */
[data-appointments] [data-rail-size="slim"] [data-tip]:hover::after,
[data-appointments] [data-rail-size="slim"] [data-tip]:focus-visible::after {
  content: attr(data-tip);
  position: absolute;
  left: calc(100% + 10px);
  top: 50%;
  transform: translateY(-50%);
  z-index: 50;
  white-space: nowrap;
  padding: 4px 8px;
  border-radius: 8px;
  background: rgb(var(--a-side-2));
  color: rgb(var(--a-side-text));
  font-size: 12px;
  font-weight: 500;
  box-shadow: var(--a-shadow);
  pointer-events: none;
}
```

- [ ] **Step 4: Tailwind aliases**

In `frontend/tailwind.config.js`, inside the `a:` colour object add (keep the existing entries):

```js
          'accent-text':  'rgb(var(--a-accent-text) / <alpha-value>)',
          'accent-rail':  'rgb(var(--a-accent-rail) / <alpha-value>)',
          'danger-ink':   'rgb(var(--a-danger-ink) / <alpha-value>)',
          now:            'rgb(var(--a-now) / <alpha-value>)',
          'now-ink':      'rgb(var(--a-now-ink) / <alpha-value>)',
          hatch:          'rgb(var(--a-hatch) / <alpha-value>)',
          scrim:          'rgb(var(--a-scrim) / <alpha-value>)',
```

Add to `boxShadow` (keep `p`): `'a-sm': 'var(--a-shadow-sm)', a: 'var(--a-shadow)', 'a-lg': 'var(--a-shadow-lg)',`
Add to `fontFamily` (keep the others): `'a-display': ['var(--a-font-display)'], 'a-mono': ['var(--a-font-mono)'],`
Add under `theme.extend` (siblings of `fontFamily`):

```js
      keyframes: {
        'a-rise':     { from: { opacity: '0', transform: 'translateY(12px)' }, to: { opacity: '1', transform: 'none' } },
        'a-fade':     { from: { opacity: '0' }, to: { opacity: '1' } },
        'a-slide-in': { from: { opacity: '0', transform: 'translateX(28px)' }, to: { opacity: '1', transform: 'none' } },
        'a-pop':      { from: { opacity: '0', transform: 'scale(0.98)' }, to: { opacity: '1', transform: 'none' } },
        'a-pulse':    { '0%': { boxShadow: '0 0 0 0 rgb(var(--a-now) / 0.55)' }, '70%': { boxShadow: '0 0 0 8px rgb(var(--a-now) / 0)' }, '100%': { boxShadow: '0 0 0 0 rgb(var(--a-now) / 0)' } },
      },
      animation: {
        'a-rise':     'a-rise 0.45s cubic-bezier(0.2, 0.8, 0.2, 1) both',
        'a-fade':     'a-fade 0.25s ease both',
        'a-slide-in': 'a-slide-in 0.32s cubic-bezier(0.2, 0.8, 0.2, 1) both',
        'a-pop':      'a-pop 0.18s cubic-bezier(0.2, 0.8, 0.2, 1) both',
        'a-pulse':    'a-pulse 2.4s ease-out infinite',
      },
```

(If `theme.extend` already has `keyframes`/`animation`, merge into them.)

- [ ] **Step 5: Move text uses of accent-deep to accent-text, and danger text**

Run: `cd frontend && grep -rn "text-a-accent-deep" src/appointments --include=*.tsx`
In every listed file replace `text-a-accent-deep` with `text-a-accent-text` (Edit tool, `replace_all` per file; 17 occurrences today). `bg-a-accent-deep` (hover fills) stays.
In `ui/Button.tsx` change the danger variant to `'bg-a-danger text-a-danger-ink hover:bg-a-danger/90'`.

- [ ] **Step 6: Run the tests**

Run: `cd frontend && npx vitest run src/appointments/theme src/appointments/tokens.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/appointments frontend/tailwind.config.js
git commit -m "Appointments: Atelier tokens, light and dark" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The brand colour in the bootstrap payload

**Files:**
- Modify: `app/Http/Controllers/Api/V1/Admin/Appointments/BootstrapController.php`
- Create: `tests/Feature/Appointments/BootstrapAccentTest.php`
- Modify: `frontend/src/appointments/lib/types.ts` (the `Bootstrap` interface)

**Interfaces:**
- Produces: bootstrap JSON key `accent` (`'#rrggbb'` lowercase or `null`); `Bootstrap.accent?: string | null`; `BootstrapController::accent(int $orgId): ?string`.

- [ ] **Step 1: Write the failing test**

```php
<?php

namespace Tests\Feature\Appointments;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

/** The workspace takes its accent from Settings → Branding → Primary (spec 4.2). */
class BootstrapAccentTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    private function brand(int $orgId, string $value): void
    {
        DB::table('hotel_settings')->insert(['organization_id' => $orgId, 'key' => 'primary_color', 'value' => $value, 'created_at' => now(), 'updated_at' => now()]);
    }

    public function test_it_sends_the_brand_colour_in_lower_case(): void
    {
        $this->brand($this->org->id, '#C9A84C');
        $this->asStaff()->getJson($this->api('bootstrap'))->assertOk()->assertJsonPath('accent', '#c9a84c');
    }

    public function test_it_sends_null_when_there_is_none_or_it_is_not_a_colour(): void
    {
        $this->asStaff()->getJson($this->api('bootstrap'))->assertOk()->assertJsonPath('accent', null);
        $this->brand($this->org->id, 'blue');
        $this->asStaff()->getJson($this->api('bootstrap'))->assertOk()->assertJsonPath('accent', null);
    }

    public function test_another_organisations_colour_is_never_used(): void
    {
        $this->brand($this->org->id + 1000, '#123456');
        $this->asStaff()->getJson($this->api('bootstrap'))->assertOk()->assertJsonPath('accent', null);
    }
}
```

- [ ] **Step 2: Run it to see it fail**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Appointments/BootstrapAccentTest.php`
Expected: FAIL — `accent` missing from the JSON.

- [ ] **Step 3: Implement**

In `BootstrapController.php` add `use App\Models\HotelSetting;` with the other imports, add the key to the response array right after `'brand' => …`:

```php
            'accent'       => self::accent($orgId),
```

and the method at the end of the class:

```php
    /** The organisation's brand colour (Settings → Branding → Primary) when it is a #rrggbb value. */
    public static function accent(int $orgId): ?string
    {
        $value = HotelSetting::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('key', 'primary_color')
            ->value('value');
        $value = is_string($value) ? strtolower(trim($value)) : '';

        return preg_match('/^#[0-9a-f]{6}$/', $value) === 1 ? $value : null;
    }
```

In `frontend/src/appointments/lib/types.ts`, in `interface Bootstrap`, after `brand: …`:

```ts
  /** The organisation's brand colour (#rrggbb) for the accent; null when none is set (spec 4.2). */
  accent?: string | null
```

- [ ] **Step 4: Run the tests**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Appointments/BootstrapAccentTest.php` → PASS (3).
Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Appointments/` → read the `Tests:` line; all pass.

- [ ] **Step 5: Commit**

```bash
git add app/Http/Controllers/Api/V1/Admin/Appointments/BootstrapController.php tests/Feature/Appointments/BootstrapAccentTest.php frontend/src/appointments/lib/types.ts
git commit -m "Appointments bootstrap carries the organisation's brand colour" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Theme and side panel, per device

**Files:**
- Create: `frontend/src/appointments/lib/look.ts`
- Test: `frontend/src/appointments/lib/look.test.ts`

**Interfaces:**
- Produces:
  - `export type ThemePref = 'light' | 'dark' | 'auto'`, `export type RailSize = 'full' | 'slim'`
  - `export interface Look { theme: ThemePref; rail: RailSize }`, `export const DEFAULT_LOOK: Look = { theme: 'light', rail: 'full' }`
  - `export function parseLook(raw: string | null): Look`, `loadLook(): Look`, `saveLook(look: Look): void`
  - `export function resolveTheme(pref: ThemePref, systemDark: boolean): ThemeName` (`ThemeName` from `../theme/accent`)
  - `export function subscribeSystemDark(onChange: () => void): () => void`, `export function systemDark(): boolean`
  - `export function useLook(): Look & { resolved: ThemeName; setTheme(t: ThemePref): void; setRail(r: RailSize): void }`

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_LOOK, loadLook, parseLook, resolveTheme, saveLook, subscribeSystemDark, systemDark } from './look'

const g = globalThis as unknown as { window?: unknown }
afterEach(() => { delete g.window })

describe('look', () => {
  it('reads a stored look and falls back to Light + full for anything else', () => {
    expect(parseLook(null)).toEqual(DEFAULT_LOOK)
    expect(DEFAULT_LOOK).toEqual({ theme: 'light', rail: 'full' })
    expect(parseLook('{"theme":"dark","rail":"slim"}')).toEqual({ theme: 'dark', rail: 'slim' })
    expect(parseLook('{"theme":"neon","rail":"tiny"}')).toEqual(DEFAULT_LOOK)
    expect(parseLook('{"theme":"auto"}')).toEqual({ theme: 'auto', rail: 'full' })
    expect(parseLook('not json')).toEqual(DEFAULT_LOOK)
    expect(parseLook('[1,2]')).toEqual(DEFAULT_LOOK)
  })

  it('survives a storage that throws, and writes under its own key', () => {
    g.window = { localStorage: { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('full') } } }
    expect(loadLook()).toEqual(DEFAULT_LOOK)
    expect(() => saveLook({ theme: 'dark', rail: 'slim' })).not.toThrow()
    const store = new Map<string, string>()
    g.window = { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v) } } }
    saveLook({ theme: 'auto', rail: 'slim' })
    expect(store.get('appointments:look')).toBe('{"theme":"auto","rail":"slim"}')
    expect(loadLook()).toEqual({ theme: 'auto', rail: 'slim' })
  })

  it('resolves Auto from the device, and Light/Dark as chosen', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
    expect(resolveTheme('auto', true)).toBe('dark')
    expect(resolveTheme('auto', false)).toBe('light')
  })

  it('follows the device while open (Auto)', () => {
    let listener: (() => void) | null = null
    let dark = false
    const mq = { get matches() { return dark }, addEventListener: (_: string, fn: () => void) => { listener = fn }, removeEventListener: vi.fn() }
    g.window = { matchMedia: () => mq }
    const onChange = vi.fn()
    const stop = subscribeSystemDark(onChange)
    expect(systemDark()).toBe(false)
    dark = true
    listener!()
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(systemDark()).toBe(true)
    stop()
    expect(mq.removeEventListener).toHaveBeenCalled()
  })

  it('does nothing without a window (server render, tests)', () => {
    expect(systemDark()).toBe(false)
    expect(() => subscribeSystemDark(() => {})()).not.toThrow()
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd frontend && npx vitest run src/appointments/lib/look.test.ts`
Expected: FAIL — cannot find module `./look`.

- [ ] **Step 3: Implement**

```ts
import { useState, useSyncExternalStore } from 'react'
import type { ThemeName } from '../theme/accent'

/**
 * How the workspace looks on this device: the theme a person picked (spec
 * D2, D6 — Light by default; Auto follows the device) and the side panel's
 * size. Kept apart from `appointments:prefs`, which the calendar writes
 * whole, so the two never overwrite each other.
 */
export type ThemePref = 'light' | 'dark' | 'auto'
export type RailSize = 'full' | 'slim'
export interface Look { theme: ThemePref; rail: RailSize }

export const DEFAULT_LOOK: Look = { theme: 'light', rail: 'full' }

const KEY = 'appointments:look'
const THEMES: readonly string[] = ['light', 'dark', 'auto']
const RAILS: readonly string[] = ['full', 'slim']
const QUERY = '(prefers-color-scheme: dark)'

export function parseLook(raw: string | null): Look {
  let value: unknown
  try {
    value = raw ? JSON.parse(raw) : null
  } catch {
    value = null
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return DEFAULT_LOOK
  const v = value as Record<string, unknown>
  return {
    theme: typeof v.theme === 'string' && THEMES.includes(v.theme) ? (v.theme as ThemePref) : DEFAULT_LOOK.theme,
    rail: typeof v.rail === 'string' && RAILS.includes(v.rail) ? (v.rail as RailSize) : DEFAULT_LOOK.rail,
  }
}

export function loadLook(): Look {
  try {
    return parseLook(window.localStorage.getItem(KEY))
  } catch {
    return DEFAULT_LOOK
  }
}

export function saveLook(look: Look): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(look))
  } catch {
    /* a private window or a full store: the choice simply is not kept */
  }
}

export function resolveTheme(pref: ThemePref, systemDarkNow: boolean): ThemeName {
  return pref === 'auto' ? (systemDarkNow ? 'dark' : 'light') : pref
}

function media(): MediaQueryList | null {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(QUERY) : null
}

export function subscribeSystemDark(onChange: () => void): () => void {
  const mq = media()
  if (!mq) return () => {}
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}

export function systemDark(): boolean {
  return media()?.matches ?? false
}

export function useLook(): Look & { resolved: ThemeName; setTheme: (t: ThemePref) => void; setRail: (r: RailSize) => void } {
  const [look, setLook] = useState<Look>(loadLook)
  // The device's answer on the server render too: without a window it is simply false.
  const dark = useSyncExternalStore(subscribeSystemDark, systemDark, systemDark)
  const update = (patch: Partial<Look>) => {
    const next = { ...look, ...patch }
    saveLook(next)
    setLook(next)
  }
  return {
    ...look,
    resolved: resolveTheme(look.theme, dark),
    setTheme: (theme) => update({ theme }),
    setRail: (rail) => update({ rail }),
  }
}
```

- [ ] **Step 4: Run it**

Run: `cd frontend && npx vitest run src/appointments/lib/look.test.ts`
Expected: PASS (5).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/appointments/lib/look.ts frontend/src/appointments/lib/look.test.ts
git commit -m "Appointments: theme and side panel size remembered per device" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Self-hosted type

**Files:**
- Create: `frontend/src/appointments/theme/fonts/` — `fraunces-latin-wght.woff2`, `fraunces-latin-ext-wght.woff2`, `source-serif-4-cyrillic-wght.woff2`, `source-serif-4-cyrillic-ext-wght.woff2`, `inter-tight-latin-wght.woff2`, `inter-tight-latin-ext-wght.woff2`, `inter-tight-cyrillic-wght.woff2`, `ibm-plex-mono-latin-500.woff2`, `ibm-plex-mono-latin-ext-500.woff2`, `ibm-plex-mono-cyrillic-500.woff2`, and `OFL-Fraunces.txt`, `OFL-SourceSerif4.txt`, `OFL-InterTight.txt`, `OFL-IBMPlexMono.txt`
- Modify: `frontend/src/appointments/theme/appointments.css` (font faces at the top of the file)
- Test: `frontend/src/appointments/theme/fonts.test.ts`

**Interfaces:**
- Produces: font families `'A Display'` (Fraunces for Latin, Source Serif 4 for Cyrillic), `'A Text'` (Inter Tight), `'A Mono'` (IBM Plex Mono 500), read through `--a-font-*` (Task 2).

- [ ] **Step 1: Write the failing test**

```ts
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const DIR = path.resolve(__dirname)
const css = fs.readFileSync(path.join(DIR, 'appointments.css'), 'utf8')
const faces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(m => m[1])
const family = (body: string) => /font-family:\s*'([^']+)'/.exec(body)?.[1]

describe('workspace type', () => {
  it('declares the three families, self-hosted', () => {
    for (const name of ['A Display', 'A Text', 'A Mono']) {
      expect(faces.some(f => family(f) === name), `${name} has no @font-face`).toBe(true)
    }
    expect(css).not.toMatch(/fonts\.googleapis|fonts\.gstatic/)
  })

  it('every face points at a file that exists and swaps in', () => {
    for (const f of faces) {
      const url = /url\('\.\/fonts\/([^']+)'\)/.exec(f)?.[1]
      expect(url, `face without a local url: ${f}`).toBeDefined()
      expect(fs.existsSync(path.join(DIR, 'fonts', url!)), `${url} is missing`).toBe(true)
      expect(f).toContain('font-display: swap')
    }
  })

  it('draws Russian headings in a serif that has Cyrillic (Fraunces has none)', () => {
    const cyrillic = faces.find(f => family(f) === 'A Display' && f.includes('source-serif-4-cyrillic-wght'))
    expect(cyrillic).toBeDefined()
    expect(cyrillic).toMatch(/unicode-range:[^;]*U\+0400-045F/)
    expect(faces.filter(f => family(f) === 'A Display' && f.includes('fraunces')).every(f => !/U\+0400/.test(f))).toBe(true)
  })

  it('ships the licences beside the files', () => {
    for (const name of ['OFL-Fraunces.txt', 'OFL-SourceSerif4.txt', 'OFL-InterTight.txt', 'OFL-IBMPlexMono.txt']) {
      expect(fs.existsSync(path.join(DIR, 'fonts', name)), `${name} is missing`).toBe(true)
    }
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd frontend && npx vitest run src/appointments/theme/fonts.test.ts`
Expected: FAIL — no `A Display` face.

- [ ] **Step 3: Fetch the files**

From `C:\wamp64\www\Hexa-Tech-atelier` (Git Bash), resolve exact versions first and record them in the commit message:

```bash
F=frontend/src/appointments/theme/fonts && mkdir -p $F
VF=$(npm view @fontsource-variable/fraunces version); VS=$(npm view @fontsource-variable/source-serif-4 version)
VI=$(npm view @fontsource-variable/inter-tight version); VM=$(npm view @fontsource/ibm-plex-mono version)
echo "fraunces $VF · source-serif-4 $VS · inter-tight $VI · ibm-plex-mono $VM"
J=https://cdn.jsdelivr.net/npm
curl -fsSL -o $F/fraunces-latin-wght.woff2            $J/@fontsource-variable/fraunces@$VF/files/fraunces-latin-wght-normal.woff2
curl -fsSL -o $F/fraunces-latin-ext-wght.woff2        $J/@fontsource-variable/fraunces@$VF/files/fraunces-latin-ext-wght-normal.woff2
curl -fsSL -o $F/source-serif-4-cyrillic-wght.woff2     $J/@fontsource-variable/source-serif-4@$VS/files/source-serif-4-cyrillic-wght-normal.woff2
curl -fsSL -o $F/source-serif-4-cyrillic-ext-wght.woff2 $J/@fontsource-variable/source-serif-4@$VS/files/source-serif-4-cyrillic-ext-wght-normal.woff2
curl -fsSL -o $F/inter-tight-latin-wght.woff2         $J/@fontsource-variable/inter-tight@$VI/files/inter-tight-latin-wght-normal.woff2
curl -fsSL -o $F/inter-tight-latin-ext-wght.woff2     $J/@fontsource-variable/inter-tight@$VI/files/inter-tight-latin-ext-wght-normal.woff2
curl -fsSL -o $F/inter-tight-cyrillic-wght.woff2      $J/@fontsource-variable/inter-tight@$VI/files/inter-tight-cyrillic-wght-normal.woff2
curl -fsSL -o $F/ibm-plex-mono-latin-500.woff2        $J/@fontsource/ibm-plex-mono@$VM/files/ibm-plex-mono-latin-500-normal.woff2
curl -fsSL -o $F/ibm-plex-mono-latin-ext-500.woff2    $J/@fontsource/ibm-plex-mono@$VM/files/ibm-plex-mono-latin-ext-500-normal.woff2
curl -fsSL -o $F/ibm-plex-mono-cyrillic-500.woff2     $J/@fontsource/ibm-plex-mono@$VM/files/ibm-plex-mono-cyrillic-500-normal.woff2
curl -fsSL -o $F/OFL-Fraunces.txt       $J/@fontsource-variable/fraunces@$VF/LICENSE
curl -fsSL -o $F/OFL-SourceSerif4.txt   $J/@fontsource-variable/source-serif-4@$VS/LICENSE
curl -fsSL -o $F/OFL-InterTight.txt     $J/@fontsource-variable/inter-tight@$VI/LICENSE
curl -fsSL -o $F/OFL-IBMPlexMono.txt    $J/@fontsource/ibm-plex-mono@$VM/LICENSE
ls -la $F
# the unicode ranges, copied verbatim into the faces below:
curl -fsSL $J/@fontsource-variable/fraunces@$VF/wght.css | grep -B2 -A8 "latin"
curl -fsSL $J/@fontsource-variable/source-serif-4@$VS/wght.css | grep -B2 -A8 "cyrillic"
curl -fsSL $J/@fontsource-variable/inter-tight@$VI/wght.css | grep -B2 -A8 "latin\|cyrillic"
curl -fsSL $J/@fontsource/ibm-plex-mono@$VM/500.css | grep -B2 -A8 "latin\|cyrillic"
```

Every `.woff2` must be a few tens of kB; a file of a few hundred bytes is an error page — stop and report.

- [ ] **Step 4: Declare the faces**

At the very top of `appointments.css` (before the tokens), one `@font-face` per file, in this shape (the `unicode-range` value copied verbatim from the matching subset of the fontsource CSS printed in Step 3; the Cyrillic display faces must include `U+0400-045F`):

```css
/* Workspace type (spec 4.4), self-hosted. Loaded only where [data-appointments] uses the family. */
@font-face {
  font-family: 'A Display';
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url('./fonts/fraunces-latin-wght.woff2') format('woff2');
  unicode-range: /* latin, from fraunces wght.css */;
}
```

Faces to write: `A Display` × 4 (fraunces latin, fraunces latin-ext, source-serif-4 cyrillic, source-serif-4 cyrillic-ext; weight `200 900` for Source Serif 4), `A Text` × 3 (inter-tight latin, latin-ext, cyrillic; weight `100 900`), `A Mono` × 3 (ibm-plex-mono latin, latin-ext, cyrillic; `font-weight: 500`).

- [ ] **Step 5: Run the tests**

Run: `cd frontend && npx vitest run src/appointments/theme src/appointments/tokens.test.ts`
Expected: PASS (the scope test ignores `@font-face`).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/appointments/theme
git commit -m "Appointments: self-hosted Fraunces, Source Serif 4 (Cyrillic), Inter Tight, IBM Plex Mono" -m "Versions: <the four versions from Step 3>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The frame — side panel, theme switch, top bar

**Files:**
- Create: `frontend/src/appointments/ui/ThemeSwitch.tsx`
- Modify: `frontend/src/appointments/AppointmentsShell.tsx`
- Modify: `frontend/src/appointments/AppointmentsShell.test.tsx`
- Modify: `frontend/src/appointments/i18n/appointments.{en,de,es,fr,ru}.json`

**Interfaces:**
- Consumes: `useLook()` (Task 5), `accentTokens`, `accentStyle` (Task 2), `Bootstrap.accent` (Task 4), token classes (Task 3).
- Produces: `<ThemeSwitch value onChange vertical? tone? />`; the root `[data-appointments]` carries `data-theme`, `data-accent-edge` and the accent variables inline; the side panel carries `data-rail-size="full|slim"`.

- [ ] **Step 1: Add the words**

Add to each `appointments.<lang>.json` an object `"theme"` and keys under `"shell"` (keep JSON valid; place `theme` beside `shell`):

| key | en | de | es | fr | ru |
|---|---|---|---|---|---|
| `theme.label` | Theme | Darstellung | Tema | Thème | Тема |
| `theme.light` | Light | Hell | Claro | Clair | Светлая |
| `theme.dark` | Dark | Dunkel | Oscuro | Sombre | Тёмная |
| `theme.auto` | Auto | Auto | Auto | Auto | Авто |
| `theme.auto_hint` | Auto follows this device | Auto folgt diesem Gerät | Auto sigue a este dispositivo | Auto suit cet appareil | «Авто» следует настройке устройства |
| `shell.collapse` | Collapse menu | Menü einklappen | Contraer menú | Réduire le menu | Свернуть меню |
| `shell.expand` | Expand menu | Menü ausklappen | Expandir menú | Développer le menu | Развернуть меню |

- [ ] **Step 2: Write the failing tests**

Append to `AppointmentsShell.test.tsx` (it renders with `renderToStaticMarkup`; `localStorage` is absent in node, so `useLook()` reads the default unless the test sets a stub before rendering):

```tsx
describe('AppointmentsShell — Atelier frame', () => {
  const g = globalThis as unknown as { window?: unknown }
  afterEach(() => { delete g.window })
  const withLook = (look: string | null) => {
    g.window = { localStorage: { getItem: () => look, setItem: () => {} }, matchMedia: () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }) }
  }

  it('starts in the light theme with the full side panel', () => {
    const html = render({})
    expect(html).toMatch(/data-appointments=""[^>]*data-theme="light"/)
    expect(html).toContain('data-rail-size="full"')
    expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*>(?:(?!<\/button>)[\s\S])*>Light<\/span><\/button>/)
  })

  it('draws the dark theme when chosen, and Auto from the device', () => {
    withLook('{"theme":"dark","rail":"full"}')
    expect(render({})).toContain('data-theme="dark"')
    withLook('{"theme":"auto","rail":"full"}')
    expect(render({})).toContain('data-theme="dark"') // the stub device prefers dark
  })

  it('takes the accent from the organisation's brand colour', () => {
    const html = render({ data: { ...boot, accent: '#c9a84c' } })
    expect(html).toContain('--a-accent:201 168 76')
  })

  it('outlines accent fills when the brand is almost the page colour', () => {
    expect(render({ data: { ...boot, accent: '#ffffff' } })).toContain('data-accent-edge=""')
    expect(render({ data: { ...boot, accent: '#c9a84c' } })).not.toContain('data-accent-edge')
  })

  it('keeps every name in the slim side panel and says the toggle is collapsed', () => {
    withLook('{"theme":"light","rail":"slim"}')
    const html = render({})
    expect(html).toContain('data-rail-size="slim"')
    expect(html).toMatch(/aria-expanded="false"[^>]*>[\s\S]*?Expand menu/)
    for (const label of ['Calendar', 'Clients', 'Setup']) expect(html).toMatch(new RegExp(`class="sr-only"[^>]*>${label}<`))
  })
})
```

(React serialises inline custom properties as `--a-accent:201 168 76`; adjust only the whitespace if the runtime differs, never the value.)

- [ ] **Step 3: Run to see them fail**

Run: `cd frontend && npx vitest run src/appointments/AppointmentsShell.test.tsx`
Expected: the new cases FAIL (no `data-theme`, no `data-rail-size`).

- [ ] **Step 4: ThemeSwitch**

```tsx
import { useTranslation } from 'react-i18next'
import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react'
import type { ThemePref } from '../lib/look'

/**
 * Light / Dark / Auto (spec D2). On the ink side panel (`tone="side"`) or on a
 * surface (the narrow-screen menu). Vertical in the slim side panel, where
 * the words become the buttons' names and a hover/focus label.
 */
export function ThemeSwitch({ value, onChange, vertical = false, tone = 'side' }: {
  value: ThemePref; onChange: (value: ThemePref) => void; vertical?: boolean; tone?: 'side' | 'surface'
}) {
  const { t } = useTranslation()
  const items: [ThemePref, string, LucideIcon][] = [
    ['light', t('appointments.theme.light', 'Light'), Sun],
    ['dark', t('appointments.theme.dark', 'Dark'), Moon],
    ['auto', t('appointments.theme.auto', 'Auto'), Monitor],
  ]
  const side = tone === 'side'
  return (
    <div role="group" aria-label={t('appointments.theme.label', 'Theme')}
      className={`flex gap-1 rounded-xl p-1 ${vertical ? 'flex-col' : ''} ${side ? 'bg-a-side-2/60' : 'bg-a-surface-2'}`}>
      {items.map(([v, label, Icon]) => {
        const on = value === v
        return (
          <button key={v} type="button" aria-pressed={on} onClick={() => onChange(v)}
            title={v === 'auto' ? t('appointments.theme.auto_hint', 'Auto follows this device') : undefined}
            data-tip={vertical ? label : undefined}
            className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition-colors ${on
              ? (side ? 'bg-a-side-2 text-a-side-text' : 'bg-a-surface text-a-text shadow-a-sm')
              : (side ? 'text-a-side-text-2 hover:text-a-side-text' : 'text-a-text-2 hover:text-a-text')}`}>
            <Icon size={15} aria-hidden />
            <span className={vertical ? 'sr-only' : ''}>{label}</span>
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 5: The shell**

In `AppointmentsShell.tsx`:
1. Imports: add `type CSSProperties` from react; `PanelLeftClose, PanelLeftOpen` from lucide-react; `{ useLook }` from `./lib/look`; `{ accentStyle, accentTokens }` from `./theme/accent`; `{ ThemeSwitch }` from `./ui/ThemeSwitch`.
2. At the top of the component (after the existing hooks, before the `switchedOff` early return so hook order never changes):

```tsx
  const look = useLook()
  const slim = look.rail === 'slim'
  const accent = accentTokens(data?.accent, look.resolved)
  const initial = (data?.organization.name ?? 'H').trim().charAt(0).toUpperCase()
```

3. The root element becomes:

```tsx
    <div data-appointments="" data-theme={look.resolved} data-accent-edge={accent.edge ? '' : undefined}
      style={accentStyle(accent) as CSSProperties} className="min-h-screen flex bg-a-canvas text-a-text">
```

4. Replace the whole `<aside data-rail=…>…</aside>` with:

```tsx
      <aside data-rail="" data-rail-size={look.rail} aria-label={t('appointments.shell.menu', 'Menu')}
        className={`hidden lg:flex ${slim ? 'w-[76px]' : 'w-64'} shrink-0 flex-col gap-6 bg-a-side px-3 py-5 text-a-side-text transition-[width] duration-300 ease-out`}>
        <div className={`flex min-h-11 items-center gap-3 ${slim ? 'justify-center' : 'px-2'}`}>
          <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-a-accent font-a-display text-lg font-semibold text-a-accent-ink">{initial}</span>
          <div className={slim ? 'sr-only' : 'min-w-0'}>
            <div className="truncate text-[15px] font-semibold leading-tight">{data?.organization.name}</div>
            <div className="truncate text-xs text-a-side-text-2">{data?.name ?? 'HexaTech Appointments'}</div>
          </div>
        </div>
        <nav className="space-y-1">
          {nav.map(({ to, end, icon: Icon, label }) => (
            <NavLink key={to} to={to} end={end} data-tip={slim ? label : undefined}
              className={({ isActive }) => `relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors ${slim ? 'justify-center' : ''} ${isActive ? 'bg-a-side-2 text-a-side-text' : 'text-a-side-text-2 hover:bg-a-side-2/60 hover:text-a-side-text'}`}>
              {({ isActive }) => (
                <>
                  <Icon size={18} aria-hidden className="shrink-0" />
                  <span className={slim ? 'sr-only' : 'truncate'}>{label}</span>
                  {isActive && !slim && <span aria-hidden className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-a-accent-rail" />}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto space-y-2 border-t border-a-side-2 pt-4">
          <ThemeSwitch value={look.theme} onChange={look.setTheme} vertical={slim} />
          {!appointmentsOnly && (
            <Link to={fullAdmin} data-tip={slim ? t('appointments.shell.full_admin', 'Full admin') : undefined}
              className={`relative flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm text-a-side-text-2 transition-colors hover:bg-a-side-2/60 hover:text-a-side-text ${slim ? 'justify-center' : ''}`}>
              <LayoutGrid size={16} aria-hidden className="shrink-0" /><span className={slim ? 'sr-only' : ''}>{t('appointments.shell.full_admin', 'Full admin')}</span>
            </Link>
          )}
          {!slim && <div className="px-1">{language('w-full rounded-lg bg-a-side-2 text-a-side-text text-sm px-2 py-1.5 border border-a-side-2')}</div>}
          <div className={`flex items-center gap-2 px-1 ${slim ? 'justify-center' : ''}`}>
            <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-a-side-2 text-xs font-semibold">{(data?.staff.name ?? '').trim().charAt(0).toUpperCase()}</span>
            <span className={slim ? 'sr-only' : 'min-w-0 flex-1 truncate text-xs text-a-side-text-2'}>{data?.staff.name}</span>
            {!slim && (
              <button type="button" onClick={signOut} className="rounded-lg p-2 text-a-side-text-2 hover:text-a-side-text" aria-label={t('appointments.shell.sign_out', 'Sign out')}>
                <LogOut size={16} aria-hidden />
              </button>
            )}
          </div>
          {slim && (
            <button type="button" onClick={signOut} data-tip={t('appointments.shell.sign_out', 'Sign out')}
              className="relative flex min-h-10 w-full items-center justify-center rounded-xl text-a-side-text-2 hover:bg-a-side-2/60 hover:text-a-side-text">
              <LogOut size={16} aria-hidden /><span className="sr-only">{t('appointments.shell.sign_out', 'Sign out')}</span>
            </button>
          )}
          <button type="button" onClick={() => look.setRail(slim ? 'full' : 'slim')} aria-expanded={!slim}
            data-tip={slim ? t('appointments.shell.expand', 'Expand menu') : undefined}
            className={`relative flex min-h-10 w-full items-center gap-3 rounded-xl px-3 text-sm text-a-side-text-2 transition-colors hover:bg-a-side-2/60 hover:text-a-side-text ${slim ? 'justify-center' : ''}`}>
            {slim ? <PanelLeftOpen size={16} aria-hidden /> : <PanelLeftClose size={16} aria-hidden />}
            <span className={slim ? 'sr-only' : ''}>{slim ? t('appointments.shell.expand', 'Expand menu') : t('appointments.shell.collapse', 'Collapse menu')}</span>
          </button>
        </div>
      </aside>
```

5. Header: `className="h-14 shrink-0 flex items-center gap-3 px-4 lg:px-6 bg-a-canvas border-b border-a-border"`; the search input class becomes `w-full rounded-xl bg-a-surface border border-a-border pl-9 pr-3 py-2 text-sm text-a-text placeholder:text-a-text-2 shadow-a-sm`; the New appointment link becomes
`className="ml-auto inline-flex shrink-0 items-center gap-2 rounded-full bg-a-accent px-3 sm:px-4 py-2 text-sm font-semibold text-a-accent-ink shadow-a-sm transition hover:bg-a-accent-deep hover:-translate-y-px whitespace-nowrap"`.
6. The narrow-screen `<details>` menu panel: add `animate-a-pop` to its panel `div` and, before the Full admin link, `<div className="px-1 pb-1"><ThemeSwitch value={look.theme} onChange={look.setTheme} tone="surface" /></div>`.

- [ ] **Step 6: Run the tests**

Run: `cd frontend && npx vitest run src/appointments/AppointmentsShell.test.tsx src/appointments/tokens.test.ts`
Expected: PASS (every earlier shell case still passes; if one asserted the old `w-56` rail or class names, update that assertion to the new markup and say so in the report).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/appointments
git commit -m "Appointments: Atelier frame — ink side panel that collapses, Light/Dark/Auto, brand accent" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Shared primitives

**Files:**
- Modify: `frontend/src/appointments/ui/Button.tsx`, `frontend/src/appointments/ui/Notice.tsx`
- Create: `frontend/src/appointments/ui/Typography.tsx`, `frontend/src/appointments/ui/Skeleton.tsx`
- Test: `frontend/src/appointments/ui/primitives.test.tsx`

**Interfaces:**
- Produces: `PageTitle`, `SectionTitle`, `Eyebrow`, `Figure` (from `ui/Typography`), `Skeleton({ className })` and `CalendarSkeleton()` (from `ui/Skeleton`); `Button` keeps its props.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Button } from './Button'
import { Figure, Eyebrow, PageTitle, SectionTitle } from './Typography'
import { CalendarSkeleton } from './Skeleton'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (_k: string, f?: string) => f ?? _k }) }))

describe('workspace primitives', () => {
  it('titles use the display face; eyebrows the mono face', () => {
    expect(renderToStaticMarkup(<PageTitle>Takings</PageTitle>)).toMatch(/^<h1 class="[^"]*font-a-display[^"]*">Takings<\/h1>$/)
    expect(renderToStaticMarkup(<SectionTitle>Team</SectionTitle>)).toMatch(/^<h2 class="[^"]*font-a-display/)
    expect(renderToStaticMarkup(<Eyebrow>Today</Eyebrow>)).toMatch(/font-a-mono[^"]*uppercase/)
    expect(renderToStaticMarkup(<Figure>€470</Figure>)).toMatch(/font-a-display[^"]*tabular-nums/)
  })

  it('the primary button is the accent pill; danger text follows its own ink', () => {
    expect(renderToStaticMarkup(<Button>Save</Button>)).toMatch(/rounded-full[^"]*bg-a-accent[^"]*text-a-accent-ink/)
    expect(renderToStaticMarkup(<Button variant="danger">Cancel</Button>)).toContain('text-a-danger-ink')
    expect(renderToStaticMarkup(<Button variant="ghost">More</Button>)).toContain('text-a-accent-text')
  })

  it('the calendar placeholder is announced, not read out cell by cell', () => {
    const html = renderToStaticMarkup(<CalendarSkeleton />)
    expect(html).toContain('role="status"')
    expect(html).toContain('Loading…')
    expect(html).toContain('animate-pulse')
  })
})
```

- [ ] **Step 2: Run to see it fail**

Run: `cd frontend && npx vitest run src/appointments/ui/primitives.test.tsx`
Expected: FAIL — missing modules.

- [ ] **Step 3: Implement**

`ui/Typography.tsx`:

```tsx
import type { ReactNode } from 'react'

/** Atelier type roles (spec 4.4): display serif for titles and figures, mono for small labels. */
export function PageTitle({ children }: { children: ReactNode }) {
  return <h1 className="font-a-display text-3xl font-normal leading-tight tracking-tight text-a-text">{children}</h1>
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="font-a-display text-xl font-normal leading-snug text-a-text">{children}</h2>
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="font-a-mono text-xs font-medium uppercase tracking-[0.12em] text-a-text-2">{children}</div>
}

export function Figure({ children }: { children: ReactNode }) {
  return <p className="font-a-display text-3xl font-light leading-tight tracking-tight tabular-nums text-a-text">{children}</p>
}
```

`ui/Skeleton.tsx`:

```tsx
import { useTranslation } from 'react-i18next'

export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-lg bg-a-surface-2 ${className}`} />
}

/** A quiet stand-in for the grid while the calendar loads (spec 4.6). */
export function CalendarSkeleton() {
  const { t } = useTranslation()
  return (
    <div role="status" className="p-4">
      <span className="sr-only">{t('appointments.common.loading', 'Loading…')}</span>
      <div className="flex gap-3">
        {[0, 1, 2, 3].map(c => (
          <div key={c} className="flex-1 space-y-3">
            <Skeleton className="h-10" />
            <Skeleton className="h-24" />
            <Skeleton className="h-14" />
            <Skeleton className="h-32" />
          </div>
        ))}
      </div>
    </div>
  )
}
```

`ui/Button.tsx` — the `VARIANT` map and the class string:

```tsx
const VARIANT: Record<Variant, string> = {
  primary:   'rounded-full bg-a-accent text-a-accent-ink shadow-a-sm hover:bg-a-accent-deep hover:-translate-y-px',
  secondary: 'rounded-full bg-a-surface text-a-text border border-a-border hover:bg-a-surface-2',
  ghost:     'rounded-full bg-transparent text-a-accent-text hover:bg-a-accent/10',
  danger:    'rounded-full bg-a-danger text-a-danger-ink hover:bg-a-danger/90',
}
```

and in the `className` template replace `rounded-lg font-semibold text-sm` with `font-semibold text-sm transition duration-150`.

`ui/Notice.tsx` — add `animate-a-fade` and `border` per tone: `info: 'bg-a-surface-2 text-a-text border-a-border'`, `success: 'bg-a-st-confirmed/[0.12] text-a-st-confirmed border-a-st-confirmed/20'`, `warning: 'bg-a-st-pending/[0.12] text-a-st-pending border-a-st-pending/20'`, `danger: 'bg-a-danger/[0.12] text-a-danger border-a-danger/20'`; the div's class becomes `rounded-xl border px-3.5 py-2.5 text-sm animate-a-fade ${TONE[tone]}`.

- [ ] **Step 4: Run the workspace tests**

Run: `cd frontend && npx vitest run src/appointments`
Expected: PASS. Existing tests that assert `rounded-lg` on a Button now see `rounded-full`: update only those assertions (list them in the report).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/appointments/ui
git commit -m "Appointments: Atelier primitives — titles, figures, pill buttons, quiet loading" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Calendar

**Files:**
- Modify: `frontend/src/appointments/lib/wallClock.ts` (+ `lib/wallClock.test.ts`)
- Modify: `frontend/src/appointments/calendar/Toolbar.tsx`, `TimeGrid.tsx`, `AppointmentCard.tsx`, `MiniMonth.tsx`, `DayOverview.tsx`, `ListView.tsx`, `CalendarPage.tsx`
- Modify: the calendar tests whose class assertions change (`calendar.test.tsx`, `toolbar.test.tsx`, `listView.test.tsx`, `calendarPage.test.tsx`)
- Modify: `i18n/appointments.{en,de,es,fr,ru}.json`

**Interfaces:**
- Consumes: Task 3 classes, `CalendarSkeleton` (Task 8), `Eyebrow` (Task 8).
- Produces: `export function isoWeek(date: DateKey): number` in `lib/wallClock.ts`.

- [ ] **Step 1: Words**

Add under `calendar`: `week` = en "Week {{n}}", de "KW {{n}}", es "Semana {{n}}", fr "Semaine {{n}}", ru "Неделя {{n}}"; `booked` = en "Booked: {{count}}", de "Gebucht: {{count}}", es "Reservas: {{count}}", fr "Réservés : {{count}}", ru "Записей: {{count}}".

- [ ] **Step 2: Write the failing tests**

In `lib/wallClock.test.ts` add:

```ts
  it('numbers ISO weeks', () => {
    expect(isoWeek('2026-10-12')).toBe(42)
    expect(isoWeek('2026-01-01')).toBe(1)
    expect(isoWeek('2025-12-29')).toBe(1)
    expect(isoWeek('2027-01-03')).toBe(53)
  })
```

(import `isoWeek`). In `toolbar.test.tsx` add a case: rendering the day view for `2026-10-12` contains a heading with `font-a-display` holding the date and the text `Week 42`. In `calendar.test.tsx` add cases: a card's class contains `bg-a-surface` and `border-a-border` and no longer `border-l-[3px]`; a completed card contains `bg-a-surface-2`; the now line is `border-a-now` and its dot has `animate-a-pulse`; each column head shows `Booked: N` for its own appointments.

- [ ] **Step 3: Run to see them fail**

Run: `cd frontend && npx vitest run src/appointments/lib/wallClock.test.ts src/appointments/calendar`
Expected: the new cases FAIL.

- [ ] **Step 4: isoWeek**

```ts
/** The ISO-8601 week number of a venue day (weeks start on Monday; week 1 holds the year's first Thursday). */
export function isoWeek(date: DateKey): number {
  const [y, m, d] = date.split('-').map(Number)
  const day = new Date(Date.UTC(y, m - 1, d))
  const weekday = day.getUTCDay() || 7
  day.setUTCDate(day.getUTCDate() + 4 - weekday)
  const yearStart = new Date(Date.UTC(day.getUTCFullYear(), 0, 1))
  return Math.ceil(((day.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
}
```

- [ ] **Step 5: Toolbar**

- Container: `flex flex-wrap items-center gap-2 px-4 lg:px-6 py-3 bg-a-canvas` (no bottom border) keeping the `lg:pr-[456px]` rule.
- `field` constant: `'rounded-xl border border-a-border bg-a-surface px-3 py-1.5 text-sm text-a-text shadow-a-sm transition-colors hover:bg-a-surface-2'`.
- Order: Today, ‹, ›, then the label as `<h2 className="font-a-display text-2xl font-normal tracking-tight text-a-text min-w-[11rem]">{label}</h2>` followed by `<span className="font-a-mono text-xs text-a-text-2">{t('appointments.calendar.week', 'Week {{n}}', { n: isoWeek(p.date) })}</span>`, then the date input (keep its `sr-only` label).
- Views group: `inline-flex gap-1 rounded-xl bg-a-surface-2 p-1`; each button `rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:relative focus-visible:z-10` + `bg-a-surface text-a-text shadow-a-sm` when pressed, `text-a-text-2 hover:text-a-text` otherwise (drop the `first:`/`last:` rounding).

- [ ] **Step 6: TimeGrid**

- Head row: `sticky top-0 z-20 flex bg-a-surface/95 border-b border-a-border`; column head `flex flex-1 min-w-[168px] items-center gap-3 border-l border-a-border px-3 py-2.5 animate-a-fade` (today column keeps `bg-a-accent/10`); avatar `h-9 w-9 … rounded-full bg-a-surface-2 text-a-text text-xs font-semibold ring-1 ring-a-border`; under the subtitle add `<div className="font-a-mono text-xs text-a-text-2">{t('appointments.calendar.booked', 'Booked: {{count}}', { count })}</div>` where `count` is the number of the column's appointments that are not cancelled (compute from `appointments` with the same column match the grid already uses for placing cards).
- Gutter labels: `font-a-mono text-xs text-a-text-2`.
- Half-hour lines: beside each hour line add `<div className="absolute inset-x-0 border-t border-dashed border-a-border/60" style={{ top: (h - startMin + 30) * PX_PER_MIN }} aria-hidden />`.
- Now line: replace the `data-now-line` div with

```tsx
                <div data-now-line="" className="absolute inset-x-0 z-10 border-t-2 border-a-now pointer-events-none" style={{ top: (now.minutes - startMin) * PX_PER_MIN }} aria-hidden>
                  <span className="absolute -left-1.5 -top-[7px] h-3 w-3 rounded-full bg-a-now animate-a-pulse" />
                </div>
```

and in the gutter, when any column shows today, `<span className="absolute right-1 z-10 -translate-y-1/2 rounded-md bg-a-now px-1.5 font-a-mono text-xs text-a-now-ink" style={{ top: (now.minutes - startMin) * PX_PER_MIN }}>{hhmm(now.minutes)}</span>`.
- Time off keeps `a-hatch`; its label `font-medium text-a-text-2`.

- [ ] **Step 7: AppointmentCard**

Class string of the button (keep every attribute, style and handler as is):

```tsx
      className={`absolute z-10 overflow-hidden rounded-lg border px-2.5 text-left shadow-a-sm animate-a-rise transition-[transform,box-shadow,border-color] duration-150 ${density === 'full' || density === 'two' ? 'py-1.5' : 'py-0.5'} ${item.status === 'completed' ? 'bg-a-surface-2 border-a-border' : 'bg-a-surface border-a-border'} ${!lifted ? 'hover:-translate-y-0.5 hover:shadow-a hover:border-a-text-2/40' : ''} ${selected ? 'ring-2 ring-a-accent' : ''} ${draggable ? 'select-none touch-manipulation cursor-grab' : ''} ${lifted ? 'outline-dashed outline-2 outline-a-accent' : ''}`}
```

Content (spec 4.6 order: time, service, client; struck through when cancelled or no-show):

```tsx
      {density === 'line' ? (
        <div className="flex items-center gap-2 text-xs leading-4">
          <span className="shrink-0 font-a-mono text-a-text-2">{timeOf(item.start)}</span>
          <span className={`min-w-0 flex-1 truncate font-semibold text-a-text ${struck}`}>{item.service?.name ?? item.client.name}</span>
          <StatusMark status={item.status} compact />
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2 text-xs leading-4">
            <span className="shrink-0 whitespace-nowrap font-a-mono text-a-text-2">{timeOf(item.start)} – {timeOf(item.end)}</span>
            <StatusMark status={item.status} compact />
          </div>
          <div className={`font-semibold text-a-text truncate ${density === 'tight' ? 'text-xs leading-4' : 'text-sm'} ${struck}`}>{item.service?.name ?? item.client.name}</div>
          {density === 'full' && <div className="text-xs text-a-text-2 truncate">{item.client.name}</div>}
        </>
      )}
```

with `const struck = item.status === 'cancelled' || item.status === 'no_show' ? 'line-through' : ''`. The client's name stays in the card's accessible name at every size: in the `line` and `tight`/`two` branches add `<span className="sr-only">, {item.client.name}</span>` right after the service text (the `full` branch shows it). Remove the now-unused `tone` / `STATUS_TONE` / `TONE_CLASS` imports.

- [ ] **Step 8: Side column, list, page**

- `MiniMonth`: title `font-a-display text-lg font-normal`; selected day `bg-a-accent text-a-accent-ink font-semibold shadow-a-sm`; today `ring-1 ring-a-accent text-a-accent-text font-semibold`; day buttons `transition-colors`.
- `DayOverview`: the two `h2` become `<Eyebrow>` (keep them as headings: wrap — `<h2 className="mb-2"><Eyebrow>…</Eyebrow></h2>` is invalid (div in h2); instead give the h2 the eyebrow classes directly: `font-a-mono text-xs font-medium uppercase tracking-[0.12em] text-a-text-2 mb-2`); the counts `dd` get `font-a-display text-lg font-normal tabular-nums`.
- `ListView`: header row `font-a-mono text-xs uppercase tracking-[0.08em]`; day rows `bg-a-surface-2` with the day in `font-a-display text-sm font-normal`; time button keeps `text-a-accent-text`.
- `CalendarPage`: the scroll area class becomes `flex-1 min-h-0 overflow-auto mx-4 lg:mx-6 mb-4 rounded-xl border border-a-border bg-a-surface shadow-a-sm`; replace the `Loading…` paragraph with `<CalendarSkeleton />`; the right `aside` class becomes `hidden xl:block w-72 shrink-0 bg-a-canvas overflow-y-auto` (no border).

- [ ] **Step 9: Run the calendar and workspace tests**

Run: `cd frontend && npx vitest run src/appointments`
Expected: PASS after updating only the assertions that named old classes or the old client-first order (list each one changed in the report with the reason).

- [ ] **Step 10: Commit**

```bash
git add frontend/src/appointments
git commit -m "Appointments: Atelier calendar — serif date and week, quiet grid, now line, surface cards" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Appointment panel

**Files:**
- Create: `frontend/src/appointments/panel/VisitSteps.tsx`
- Modify: `frontend/src/appointments/panel/AppointmentPanel.tsx`, `frontend/src/appointments/panel/AppointmentView.tsx`
- Test: `frontend/src/appointments/panel/visitSteps.test.tsx`
- Modify: `i18n/appointments.{en,de,es,fr,ru}.json`

**Interfaces:**
- Produces: `export function visitSteps(status: Status): { key: 'confirmed' | 'in_chair' | 'completed'; state: 'done' | 'now' | 'todo' }[] | null` and `export function VisitSteps({ status }: { status: Status })`.

- [ ] **Step 1: Words**

Add `steps`: `label` (en "Visit progress", de "Fortschritt des Termins", es "Progreso de la cita", fr "Avancement du rendez-vous", ru "Ход визита"), `confirmed` (Confirmed / Bestätigt / Confirmada / Confirmé / Подтверждена), `in_chair` (In the chair / Im Termin / En curso / En cours / Идёт визит), `completed` (Completed / Abgeschlossen / Completada / Terminé / Завершена).

- [ ] **Step 2: Write the failing test**

```tsx
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { VisitSteps, visitSteps } from './VisitSteps'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (_k: string, f?: string) => f ?? _k }) }))

describe('visit progress', () => {
  it('reads the status as three steps', () => {
    expect(visitSteps('pending')!.map(s => s.state)).toEqual(['now', 'todo', 'todo'])
    expect(visitSteps('confirmed')!.map(s => s.state)).toEqual(['done', 'now', 'todo'])
    expect(visitSteps('in_progress')!.map(s => s.state)).toEqual(['done', 'done', 'now'])
    expect(visitSteps('completed')!.map(s => s.state)).toEqual(['done', 'done', 'done'])
    expect(visitSteps('cancelled')).toBeNull()
    expect(visitSteps('no_show')).toBeNull()
  })

  it('is a named list whose current step is marked in the markup, not by colour alone', () => {
    const html = renderToStaticMarkup(<VisitSteps status="confirmed" />)
    expect(html).toMatch(/<ol[^>]*aria-label="Visit progress"/)
    expect(html).toMatch(/aria-current="step"[^>]*>[\s\S]*In the chair/)
    expect(renderToStaticMarkup(<VisitSteps status="cancelled" />)).toBe('')
  })
})
```

- [ ] **Step 3: Run to see it fail**

Run: `cd frontend && npx vitest run src/appointments/panel/visitSteps.test.tsx`
Expected: FAIL — missing module.

- [ ] **Step 4: Implement VisitSteps**

```tsx
import { useTranslation } from 'react-i18next'
import type { Status } from '../lib/types'

type StepKey = 'confirmed' | 'in_chair' | 'completed'
const KEYS: StepKey[] = ['confirmed', 'in_chair', 'completed']
const REACHED: Partial<Record<Status, number>> = { pending: 0, confirmed: 1, in_progress: 2, completed: 3 }

/** Where a visit stands, from its status (spec 4.6). Cancelled and no-show visits have no progress. */
export function visitSteps(status: Status): { key: StepKey; state: 'done' | 'now' | 'todo' }[] | null {
  const reached = REACHED[status]
  if (reached === undefined) return null
  return KEYS.map((key, i) => ({ key, state: i < reached ? 'done' : i === reached ? 'now' : 'todo' }))
}

export function VisitSteps({ status }: { status: Status }) {
  const { t } = useTranslation()
  const steps = visitSteps(status)
  if (!steps) return null
  const label: Record<StepKey, string> = {
    confirmed: t('appointments.steps.confirmed', 'Confirmed'),
    in_chair: t('appointments.steps.in_chair', 'In the chair'),
    completed: t('appointments.steps.completed', 'Completed'),
  }
  return (
    <ol aria-label={t('appointments.steps.label', 'Visit progress')} className="grid grid-cols-3 gap-2">
      {steps.map(s => (
        <li key={s.key} aria-current={s.state === 'now' ? 'step' : undefined}
          className={`flex flex-col gap-2 text-xs ${s.state === 'todo' ? 'text-a-text-2' : 'text-a-text'} ${s.state === 'now' ? 'font-semibold' : ''}`}>
          <span aria-hidden className={`h-1.5 rounded-full transition-colors duration-500 ${s.state === 'done' ? 'bg-a-accent' : s.state === 'now' ? 'bg-a-accent/45' : 'bg-a-surface-2'}`} />
          {label[s.key]}
        </li>
      ))}
    </ol>
  )
}
```

- [ ] **Step 5: Panel look**

- `AppointmentPanel.tsx` container: append `animate-a-slide-in shadow-a-lg` and replace `shadow-xl`; header `h2` gets `font-a-display text-xl font-normal`.
- `AppointmentView.tsx`:
  - client name `div`: `font-a-display text-2xl font-normal leading-tight text-a-text truncate`; precede the name block with an initials avatar `<span aria-hidden className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-a-surface-2 text-sm font-semibold text-a-text ring-1 ring-a-border">{initials}</span>` where `initials` = the first letters of the first two words of `b.client.name`, upper-cased;
  - insert `<VisitSteps status={b.status} />` right after the client block;
  - the `<dl className="mt-3 space-y-1.5 text-sm">` becomes `<dl className="mt-4 divide-y divide-a-border overflow-hidden rounded-xl border border-a-border text-sm">` and each row `div` becomes `flex justify-between gap-3 px-3.5 py-2.5`;
  - the contact `section` class becomes `rounded-xl border border-a-border bg-a-surface-2/50 p-3.5 text-sm`.

- [ ] **Step 6: Run the panel and workspace tests**

Run: `cd frontend && npx vitest run src/appointments`
Expected: PASS (update only assertions that named the old classes; list them).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/appointments
git commit -m "Appointments: Atelier appointment panel with visit progress" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Clients, Takings, Insights, Setup

**Files:**
- Modify: `clients/ClientsPage.tsx`, `clients/ClientProfileView.tsx`, `takings/TakingsPage.tsx`, `insights/InsightsPage.tsx`, `setup/SetupPage.tsx`, `setup/Checklist.tsx`, and every file `grep` lists in Step 1
- Modify: their tests where they name old classes

**Interfaces:**
- Consumes: `PageTitle`, `SectionTitle`, `Figure`, `Eyebrow` (Task 8).

- [ ] **Step 1: Locate**

Run: `cd frontend/src/appointments && grep -rn 'className="text-xl font-semibold text-a-text"' --include=*.tsx . ; grep -rn 'className="text-base font-semibold text-a-text"' --include=*.tsx . ; grep -rn 'text-2xl font-semibold text-a-text' --include=*.tsx . ; grep -rln "<table" --include=*.tsx .`
Expected today: 5 page titles (ClientsPage, ClientProfileView, TakingsPage, InsightsPage, SetupPage), 6 section titles, 3 insight figures, tables in TakingsPage and InsightsPage (ListView was Task 9).

- [ ] **Step 2: Apply**

- Each `<h1 className="text-xl font-semibold text-a-text">X</h1>` → `<PageTitle>X</PageTitle>`.
- Each `<h2 className="text-base font-semibold text-a-text">X</h2>` → `<SectionTitle>X</SectionTitle>` (keep any `id`/`ref`/`tabIndex` by leaving that one element as an `h2` and giving it `font-a-display text-xl font-normal text-a-text` instead).
- Each `<p className="text-2xl font-semibold text-a-text">…</p>` in InsightsPage → `<Figure>…</Figure>` (keep the inner `span` for the share).
- Tables: `thead` row cells get `font-a-mono text-xs font-medium uppercase tracking-[0.08em] text-a-text-2`; body rows `border-t border-a-border`; numeric cells `tabular-nums`.
- Bordered boxes `rounded-lg border border-a-border bg-a-surface p-4` → `rounded-xl border border-a-border bg-a-surface p-5 shadow-a-sm` (Setup editors, Takings blocks); the Setup tabs: the selected tab `text-a-text` with `border-b-2 border-a-accent`, others `text-a-text-2 hover:text-a-text` (keep the tab semantics already there).
- `setup/Checklist.tsx` banner: `rounded-xl border border-a-border bg-a-surface p-4 shadow-a-sm animate-a-fade`.

- [ ] **Step 3: Run the workspace tests**

Run: `cd frontend && npx vitest run src/appointments`
Expected: PASS (update only assertions on old heading classes; list them).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/appointments
git commit -m "Appointments: Atelier clients, takings, insights and setup" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Look at it — browser pass and fixes

**Files:** whatever the pass finds (each fix with a test where a test can show it).

- [ ] **Step 1: Full checks**

Run: `cd frontend && npx tsc -b && npx vitest run` → only the 3 plannerMeta failures.
Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Appointments/` and `… tests/Unit/Appointments/` → read both `Tests:` lines.

- [ ] **Step 2: Local servers**

From the worktree: `/c/wamp64/bin/php/php8.4.20/php.exe artisan serve --no-reload --port=8012` (8010 is another project's) and `cd frontend && npx vite --port 5173` with `VITE_API_URL=http://127.0.0.1:8012/api` and `CORS_ALLOWED_ORIGINS=http://localhost:5173` in the worktree `.env` for the session (restore after). Sign in as the local tester (`appointments-tester@example.test`, org 16 Lumière Salon; the password is in the local-dev memory — never write it anywhere).

- [ ] **Step 3: Look**

With Playwright (service workers blocked), screenshot at 1440×900 and 390×844: calendar day/week/list, an open appointment (view, create, move, take payment), clients list and profile, takings, insights, setup tabs — in Light and in Dark, with the side panel full and slim, and once with the language set to Русский. Compare with board A of the mock. Check: keyboard-only through the side panel (slim tooltips appear on focus), Find nothing broken, `prefers-reduced-motion` stops the motion, axe (from cdnjs) shows no new violations. Never save through the UI unless the row is cleaned up afterwards.

- [ ] **Step 4: Fix and record**

Fix what the pass finds (contrast, overflow, a missed raw class, Cyrillic face not applied). Write the record (screens checked, issues, fixes, screenshots' paths) to the plan's SDD workspace.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/appointments
git commit -m "Appointments: Atelier browser-pass fixes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Deploy release 1 (controller)

- [ ] Worktree `../Hexa-Tech-atelier-deploy` on `deploy/appointments-atelier-r1` from `origin/main`; copy `.env` + `frontend/.env`; robocopy `vendor`; junction `frontend/node_modules` → `Hexa-Tech-portal/frontend/node_modules`.
- [ ] File list = `git diff --name-only origin/main...feature/appointments-atelier` minus `docs/superpowers/plans/*` scratch; parity check (each file on main equals the feature base version); `xargs -a list git checkout feature/appointments-atelier --`; commit the source.
- [ ] On the artifact: `artisan test tests/Feature/Appointments/`, `tests/Unit/Appointments/`, `tests/Feature/Settings/`; `npx tsc -b && npx vitest run`.
- [ ] `npm run build`; compare the CSS with live (new rules only under `[data-appointments]`, new `@font-face`, `a-*` keyframes); commit `frontend/dist public/spa resources/spa-shell`.
- [ ] `git push origin deploy/appointments-atelier-r1:main` (owner's go: "lets proceed and deploy", 2026-10-12).
- [ ] Verify by content: the new main bundle's AppointmentsApp chunk contains `appointments:look` and `data-rail-size`; `GET /api/v1/admin/appointments/bootstrap` still answers 401 unauthenticated; the full admin's index loads.
- [ ] `cmd /c rmdir` the junction, `git worktree remove`, ledger + memory.
