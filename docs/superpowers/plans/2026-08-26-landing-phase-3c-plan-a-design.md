# Landing Phase 3c Plan A — The Look and the Controls — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the `ruled_page` template to the beauty-tech.uk reference quality, palette-parameterized, with curated design controls in the editor and wizard.

**Architecture:** Palettes are data (`App\Landing\Palette` token sets) emitted as a nonced inline `:root` override, consumed by a rebuilt token-first CSS; fonts move self-hosted; the editor gains a Design panel of real miniature previews writing allowlisted `theme.*` keys through the existing save path.

**Tech Stack:** Laravel 13 blades + static CSS/JS (no build step on the landing side), React 18 + TS + vitest (admin), PHPUnit.

**Spec:** `docs/superpowers/specs/2026-08-26-landing-phase-3c-design-controls.md` — decisions D1-D6, palette token values §3, section design language §4, editor/wizard §5, testing §6. **Reference stylesheet (the design language, verbatim):** `docs/superpowers/specs/assets/2026-08-26-beauty-tech-reference.css` (+ `.html`).

## Global Constraints

- Escaping discipline: `{{ }}` only under `resources/views/landing/` — the no-raw-echo tests stay green at every commit.
- No inline `<script>` anywhere in the template; every inline `<style>` carries the request nonce (existing tests enforce both).
- The section data contract is FROZEN: each section reads exactly the `$copy` keys and `PageContent`/`IndustryProfile` inputs it reads today. New markup, same data.
- Backend suite scope: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Landing/ tests/Unit/Landing/ tests/Unit/Support/` — baseline **583 passed / 2066 assertions** at branch start. NEVER bare `php artisan test`. `php artisan view:clear` (pinned php) after every blade touch or restore.
- Frontend baseline: `cd frontend && npx vitest run` → **438 passed + exactly 3 pre-existing plannerMeta failures**; `npx tsc -b` clean. vitest is node-env: pure functions only, no component rendering.
- Hostile batteries (image URLs, nested shapes, contact shapes) pin SURVIVAL, not bytes — they must pass unchanged against new markup in every task.
- Deliberate visual changes re-capture goldens; the re-capture commit is separate from wiring and the task states which tests moved and why. Never silently.
- All tests FOREGROUND. Mutations never overlap test runs. Edit tool over `python -c`. No bash heredocs with backslashes.
- PATH php is 8.3.6 and silently breaks JSON request bodies — always the pinned php.

---

### Task 1: Palette system — backend

**Files:**
- Create: `app/Landing/Palette.php`
- Modify: `app/Landing/IndustryProfile.php` (defaultPalette per industry), `resources/views/landing/ruled_page/layout.blade.php` (inline token emission), `app/Http/Controllers/Landing/LandingPageController.php` (render-time whitelist only if the layout needs a resolved value passed — prefer resolving inside the layout like font_pairing today)
- Test: `tests/Feature/Landing/RuledPageRenderTest.php` (new palette group), `tests/Unit/Landing/PaletteTest.php`

**Interfaces:**
- Produces: `Palette::for(?string $id): ?self` (null for unknown/absent — absent means the CSS's own `:root` porcelain default), `Palette::ids(): array` (the six ids), `$palette->tokens: array<string,string>` (exactly the 16 keys spec §3 names), `$palette->dark: bool`, `Palette::THEME_RULES` is NOT here (Task 2 owns validation).
- Consumes: `theme.palette` raw value from the page (whitelist inside `Palette::for`, mirroring the `font_pairing` defensive pattern at `layout.blade.php:29-31`).

- [ ] **Step 1: failing tests.** `PaletteTest`: six ids exist; every palette defines all 16 token keys and no others; every `bg`/`text` pair and `bg`/`text-soft` pair clears WCAG 4.5:1 (compute the ratio in the test — ~15 lines of relative-luminance math, no dependency); unknown id → null. Render tests: a page with `theme: {palette: 'champagne_noir'}` emits a nonced inline style containing `--bg:#15100b` and `--accent:#d8b878`; `theme: {palette: 'nope'}` and array/200k hostile values emit NO palette block and render 200; a page with NO palette renders **byte-identical** to before this task (capture golden FIRST, commit it before wiring).
- [ ] **Step 2: run, expect red** (golden green — it pins current bytes).
- [ ] **Step 3: implement.** `Palette` as pure data (mirror `IndustryProfile`'s authored-array shape) with the spec §3 values verbatim; each palette's array carries a `// contrast: text-on-bg 13.2:1` style comment per pair. `IndustryProfile` gains `public string $defaultPalette` wired per industry (mapping spec §3; fix the exact nine-industry mapping from `IndustryProfile::all()` and record it in the report). Layout: after the existing Accent block, one additional nonced `<style>` emitting `:root{--bg:…;…}` for a resolved palette, `color-scheme: dark` when `$palette->dark`; nothing emitted when null. Accent's brand overrides must come AFTER palette tokens in source order (Accent wins on the accent slot — `brand_color` remains the tenant override).
- [ ] **Step 4: green.** Full scoped suite; the no-palette golden proves old CSS + emitted-but-unconsumed tokens change nothing for palette-less pages.
- [ ] **Step 5: mutation.** Swap two palettes' `bg` values → the sampled-token render test goes red. Restore. Commit.

Note: `defaultPalette` is DATA in this task — nothing applies it to pages yet. The editor shows it as the pre-selected card (Task 6); new-page creation defaulting is Task 6's backend half.

### Task 2: `theme` allowlist (D6)

**Files:**
- Modify: `app/Http/Controllers/Api/V1/Admin/LandingPageController.php` (update), `app/Http/Controllers/Api/V1/Admin/LandingOnboardingController.php`
- Create: `app/Landing/ThemeRules.php` (the shared constant spec D6 demands)
- Test: `tests/Feature/Landing/LandingPageApiTest.php` (or the file where update() validation tests live — locate first)

**Interfaces:**
- Produces: `ThemeRules::keys()` → `['brand_color','font_pairing','palette']`; `ThemeRules::rules()` → the per-key Laravel rules (`brand_color` as today; `font_pairing` `in:` editorial,modern,classic — Task 3 adds `grand` by editing ONLY this constant; `palette` `in:` implode of `Palette::ids()`).
- Consumes: `Palette::ids()` from Task 1.

- [ ] Failing tests: unknown `theme.whatever` → 422 with a friendly message (no field-name leakage, no default Laravel text); `theme.palette: 'champagne_noir'` accepted and persisted; `theme.palette: 'nope'` → 422 friendly; both endpoints. Existing brand_color/font_pairing writes stay green.
- [ ] Implement: both controllers validate through `ThemeRules`; unknown-key refusal via a `Rule` or explicit key-diff check with the friendly message.
- [ ] Mutation: drop the unknown-key refusal → its test red. Restore, commit.

### Task 3: Self-hosted fonts + the `grand` pairing (D3)

**Files:**
- Create: `public/landing/fonts/*.woff2` (latin subsets: Fraunces var, Inter Tight 400/500/600, IBM Plex Mono 500, Cormorant Garamond 400/500/600 + italics 300/400/500, Inter 300/400/500)
- Modify: `public/landing/ruled_page.css` (@font-face block prepended; `grand` pairing selectors), `resources/views/landing/ruled_page/layout.blade.php` (drop Google links/preconnects), `app/Http/Middleware/LandingPageSecurity.php` (CSP: `style-src` and `font-src` lose the Google hosts), `app/Landing/ThemeRules.php` (add `grand`), `layout.blade.php:29-31` whitelist (add `grand`)
- Test: `RuledPageRenderTest.php` (font/CSP group — several existing tests move deliberately)

- [ ] Acquire fonts: fetch each family's css2 stylesheet with a woff2-capable User-Agent, download the latin-subset woff2 URLs it names, store under `public/landing/fonts/` with stable names (`fraunces-var.woff2`, `cormorant-500.woff2`, …). All OFL-licensed; record each source URL in the task report. If any download fails, STOP and report BLOCKED — do not substitute faces.
- [ ] Failing tests first where behavior is pinned: CSP header contains neither `fonts.googleapis.com` nor `fonts.gstatic.com`; rendered head has no Google link; every `@font-face` `src` is `url('fonts/…')` (same-origin relative); each declared file exists on disk (test reads the CSS, extracts sources, asserts `File::exists(public_path(...))`); `grand` accepted by ThemeRules and rendered as `data-font-pairing="grand"`; the pairing-selector test extends to four.
- [ ] Rework the three existing Google-coupled tests (`test_the_fraunces_request_spans_…`, `test_the_stylesheet_sets_the_text_face_…`, `test_no_font_pairing_rule_declares_an_axis_…`) to their self-hosted equivalents — same intent (the faces the CSS uses are the faces that load), new mechanism. State each rewrite in the report.
- [ ] Green, mutation (point one @font-face at a missing file → existence test red), restore, commit.

### Task 4: Template rebuild I — shell (nav, surfaces, motion, footer)

**Files:**
- Modify: `layout.blade.php` (nav markup, grain/glow elements, footer include unchanged), `public/landing/ruled_page.css` (token consumption + shell components), `public/landing/ruled_page.js` (reveals + nav condense), `resources/views/landing/ruled_page/sections/footer.blade.php`
- Test: `RuledPageRenderTest.php`

The CSS pivot: the rebuilt sheet's `:root` holds the **porcelain** palette under the NEW token names (spec §3 keys) plus the existing type-scale/spacing tokens; component rules consume only new tokens. The Accent inline block's output keys are remapped in the layout emission (its computed values written as `--accent`/`--accent-bright`/`--accent-deep`/`--accent-on`/`--halo`) — `App\Support\Accent`'s PHP is untouched; only the emission template renames. Design language: reference CSS §nav/§ambient/§footer verbatim adapted to tokens (glass pill nav fixed top, hairline border, backdrop-blur; links = up to the first four enabled sections having headings, from `$renderedSections`; CTA = profile primaryCta anchored to booking-else-contact; ≤880px links hidden, CTA kept; `.is-condensed` class toggled by JS at scrollY > 24). Reveals: `.reveal`/`.is-visible` + `data-delay` 1-4, IntersectionObserver (threshold 0.15, unobserve after), applied by JS adding `.reveal` — markup stays reveal-free so no-JS renders everything visible. Reduced-motion: reveals inert, Ken Burns off (Task 5 hooks in), condense transition off. Chat calm rules appended from the reference. Grain via `body::after`, two ambient glows in layout.

- [ ] Screenshot the CURRENT render first (desktop 1440 + mobile 390) via the signed preview route (generate with tinker `URL::temporarySignedRoute('landing.preview',…)` for the seeded test page on the local app host) — the before-state for Task 7's critique.
- [ ] Failing structural tests: a `<nav>` exists with the business name and a CTA; nav anchors equal the first four enabled anchorable sections (toggle sections in the test and assert); no inline script appears (existing test re-asserts); anchors absent when sections disabled.
- [ ] Implement shell; hostile batteries + no-raw-echo + nonce tests must stay green throughout. The three byte-identical goldens (hero/about/contact bands) WILL go red here — re-capture them in a SEPARATE commit immediately after the wiring commit, stating the deliberate move; the hostile/survival assertions inside those test methods stay as-is.
- [ ] Green (full scoped suite), view:clear, commit wiring, then commit re-captures.
- [ ] Mutation: remove the nav-condense JS listener → no test red is EXPECTED (JS behavior untestable in PHPUnit) — instead assert in the report that `ruled_page.js` is referenced with `defer` and the condense class exists in CSS (grep-level pins in a test).

### Task 5: Template rebuild II — hero, monogram, mobile

**Files:** `sections/hero.blade.php`, `monogram.blade.php`, `ruled_page.css`, `ruled_page.js` (Ken Burns is CSS-only; JS untouched unless reveal hooks), `RuledPageRenderTest.php`

Design: with `imageUrl('hero')` — full-bleed cover div (CSS background is NOT usable for tenant URLs without inline style; use the `<img>` plate absolutely positioned as cover with `fetchpriority="high" decoding="async"`, object-fit cover) under glow/veil/vignette layers (reference hero §), Ken Burns animation on the img, chip = industry kicker, H1 emphasis: LAST WORD wrapped in `<em>` server-side (pure helper on PageContent or in-blade `Str` split — escaping preserved, no raw echo), gold + ghost CTA pair from profile/section availability. Without image — monogram plate composed on `--bg-elev` with offset accent border (reference media-accent treatment), same content column. Mobile ≤899px: image behind scrim (`--scrim` token), H1 on it, block capped 62vh, never display:none (assert `display:none` absent for the hero img/plate selectors in a CSS-level test).
- [ ] Failing tests → implement → hostile image battery green unchanged → new goldens (imageless hero WITH new design; with-image structural assertions updated) in separate commit → mutations: (a) drop the `<em>` wrap helper's escaping-safe path → no-raw-echo or breakout test red; (b) unconditional plate → imageless golden red. Commit.

### Task 6: Editor + wizard design cards, creation default

**Files:**
- Create: `frontend/src/pages/landing/designChoices.ts` (+ `.test.ts`) — pure module: the six palettes' preview swatches/tokens and four pairings' faces, mirrored from `Palette`/CSS with a comment naming the source of truth; `frontend/src/pages/landing/DesignPanel.tsx`; `frontend/src/styles/landing-preview-fonts.css` (@font-face for the self-hosted faces, loaded by the two landing screens only)
- Modify: `LandingEditor.tsx` (Design panel above sections, saves `theme.*` through the existing update path, previewNonce bump), `LandingWizard.tsx` ("Make it yours" uses DesignPanel's cards; deletes FONT_PAIRING_SPECS grid), five locale files, `app/Services/Landing/LandingOnboardingService.php` (new page: `theme.palette` defaults from `IndustryProfile->defaultPalette` when tenant didn't choose)
- Test: `designChoices.test.ts`, backend onboarding default test

- [ ] Cards are REAL miniatures: business name in the pairing's display face over the palette's `bg` with `accent` accents and a two-line body specimen — rendered DOM+CSS, no images. Selected state from the page query's `theme`. Saving uses the normal form path (flat scalar theme keys — the one-writer rule untouched; `image_url` handling untouched).
- [ ] Vitest: designChoices ids match backend ids (hardcode the six + four and test shape/uniqueness/completeness); payload builder emits only allowlisted keys. Mutation: drop a palette from the module → completeness test red.
- [ ] Backend test: onboarding without a palette choice stores the industry default; with a choice, stores the choice. Locale-completeness vitest passes with the new strings.
- [ ] `tsc -b` clean, 438+new baseline, commit.

### Task 7: Rebuild III — sections restyle + visual QA + final goldens

**Files:** `sections/{about,services,team,reviews,booking,contact}.blade.php`, `ruled_page.css`, `RuledPageRenderTest.php`

- [ ] Restyle per spec §4 (about cinematic frame; services pillars with mono price/duration; team/reviews cards on `--bg-elev`; booking gradient-border band; contact restyle) — data contract frozen, batteries green throughout.
- [ ] **Visual QA loop (house-style ship checklist):** local preview screenshots — all six palettes × desktop 1440 × mobile 390 (12 shots minimum, plus the imageless hero state) via the signed preview route and the browser tooling available locally. Critique each against the quality bar: two-surface rhythm, mobile hero visible, sticky CTA reachable, contrast spot-checks, one signature element, remove-one-thing pass. Fix and re-shoot until clean. Attach the shot list + verdicts to the task report.
- [ ] THEN re-capture remaining goldens (separate commit), update structural assertions, full scoped suite green, frontend untouched (verify empty frontend diff this task). Commit.

### Task 8: Whole-branch final review + deploy prep

Per the established process: review package over the whole Plan-A range, whole-branch review (lenses + adversarial verify), fix wave if needed, then the deploy recipe (source patch onto origin/main — check file-divergence against origin/main first as in 3b —, fresh SPA build, discriminating probes: the new nav class + a palette token in the served CSS). Deploy only on explicit user approval.
