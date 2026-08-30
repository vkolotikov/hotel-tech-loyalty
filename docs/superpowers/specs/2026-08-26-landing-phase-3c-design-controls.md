# Landing Phase 3c — Template Rebuild and Curated Design Controls — Design

The user's decisions, made before this spec: **curated choices, always looks
good** (no free-form design editing); the quality bar is
**https://test.beauty-tech.uk/** ("use as an example"); design/style settings
must be reachable **after publish**, not only in the wizard; the type-style
step needs **real previews**, not labeled grids. Every fact below was
verified at the current tip (feature branch `985089d4a`, production
`d18004c60`) by direct read or fetch, before being designed against.

## 1. The two foundations, as they actually are

### 1.1 The reference (test.beauty-tech.uk, fetched 2026-08-26)

- **100% custom-property driven**: one `:root` block defines the whole look —
  warm charcoal/brown backgrounds (`#15100b → #2b2014`, "not pure black"),
  a five-step champagne/gold scale (`#d8b878`, `#f1d49b`, `#f8ecd0`…), warm
  text (`#f7eeda`), hairline scales, spacing scale, radius scale.
- **Type**: Cormorant Garamond (display, weight 500, italic emphasis words
  filled with a champagne→gold gradient via `background-clip: text`) over
  Inter body at weight 300, 17px/1.7.
- **Signature elements**: floating glass pill nav (fixed, backdrop-blur,
  hairline border, CTA always visible — links hidden ≤880px, CTA kept);
  gold gradient buttons with sheen sweep and halo; Ken Burns hero photo
  under three stacked layers (glow blend, directional veil gradients,
  vignette); eyebrow labels with gradient rules; numbered pillar rows with
  hover gold underline sweeps; a cinematic 4:5 media frame with offset gold
  accent border, glass tag pill and circular logo mark; a champagne booking
  band whose card has a masked-gradient border; ambient blurred glows; a
  3px-dot grain overlay; staggered IntersectionObserver reveals.
- **Discipline**: full `prefers-reduced-motion` block; the chat widget's
  attention animations are deliberately suppressed; selection color themed.

### 1.2 The current template (ruled_page)

- Already token-driven: `public/landing/ruled_page.css` (53KB, 879 lines,
  static, no build step) opens with the Appendix-B `:root` token block
  (paper/ink/brand/warm/type-scale/spacing) — light "paper" design,
  plum brand `#9B5C8F`.
- **No nav element exists at all** (`layout.blade.php` has no header; the
  spec'd sticky nav was never built). No scroll reveals; `ruled_page.js`
  exists and is CSP-clean (`script-src 'self'`).
- Theming today: `theme.brand_color` → `App\Support\Accent` → nonced inline
  `--brand*` overrides; `theme.font_pairing ∈ {editorial,modern,classic}` →
  `data-font-pairing` on `<html>` → heading-face swaps only. **Wizard-only**;
  `LandingEditor.tsx` has zero design controls (grep: no `font_pairing`,
  `brand_color`, `template_key`).
- Fonts: Google Fonts (Fraunces variable + IBM Plex Mono + Inter Tight),
  the only external hosts in the landing CSP. The cookie-consent panel is
  unbuilt (footer.blade.php:1-11 names it the compliance item that matters).
- Storage: `landing_pages.theme` (json) is the design home; `update()`
  validates `theme` only as `array` + `ScalarLeaves(depth:1)` — **any flat
  scalar key is silently accepted** today.
- i18n: no lang files exist; `__()`/`trans_choice()` in reviews return their
  English keys; IndustryProfile vocabulary (9 industries) is hardcoded
  English; no locale middleware on the landing host; `lang` is always `en`.
- Golden/structure tests that pin current bytes and will deliberately move
  are inventoried in §7 of the recon (10 named tests incl. the three
  byte-identical bands and the five font-pairing tests).

## 2. Decisions

- **D1 — one template, rebuilt in place, palette-parameterized from the
  first line.** `template_key` stays `ruled_page`; the rebuild replaces its
  markup/CSS/JS wholesale. Every color, radius, shadow and face is a token;
  **palettes are data, not stylesheets**. All existing pages get the new
  design on deploy (the fleet is one demo page plus new signups — there is
  no legacy look worth preserving; goldens are re-captured deliberately,
  never silently).
- **D2 — six curated palettes, authored as complete token sets, chosen by
  `theme.palette` (allowlisted enum), defaulted per industry.** Each palette
  defines the full surface/text/accent/line scale and its own accent base
  for `Accent` to derive from. `theme.brand_color` keeps its meaning — an
  accent override *within* the palette — through the existing Accent
  pipeline. Authored set (§3): `champagne_noir` (the reference language;
  beauty/spa default), `porcelain` (refined current light; `other` default),
  `midnight_brass` (hotel), `clinic_air` (medical/dental), `terracotta`
  (restaurant/café), `slate_amber` (fitness/education/professional).
  Every palette ships contrast-verified: body text ≥ 4.5:1, UI accents
  ≥ 3:1, stated per token in the palette file.
- **D3 — four type pairings, self-hosted.** Keep `editorial`/`modern`/
  `classic` (Fraunces/Inter Tight/IBM Plex Mono axes) and add `grand`
  (Cormorant Garamond display + Inter body — the reference pairing).
  **All faces move to self-hosted woff2 subsets under
  `public/landing/fonts/`** (OFL-licensed): removes both Google Fonts hosts
  from the CSP (`style-src`/`font-src` become `'self'`-only), removes the
  EU consent exposure for fonts, and makes the wizard/editor previews
  same-origin. The consent panel itself stays a separate parked item — this
  round removes its biggest trigger rather than building the panel.
- **D4 — design controls live in the editor, with real previews, and the
  wizard reuses the same component.** A "Design" panel in `LandingEditor`
  (new tab/section above the content rows): palette cards and type cards,
  each card a **real miniature render** (the tenant's business name set in
  the pairing's faces, on the palette's surfaces, with its accent) — not a
  swatch, not a label. Saving writes `theme.palette`/`theme.font_pairing`/
  `theme.brand_color` through the existing text-save path (they are flat
  scalar theme keys; the one-writer rule is untouched — images stay with
  the photo controls). previewNonce bumps on save as today. The wizard's
  "Make it yours" step swaps its grids for the same cards component.
- **D5 — the structural rebuild** (per-section design language in §4):
  sticky glass pill nav (brand wordmark, up to four section anchors, CTA;
  condenses on scroll; links collapse ≤880px, CTA never); hero as the
  reference's layered composition — Ken Burns photo + glow/veil/vignette
  with an uploaded photo, and a **monogram plate treatment** without one
  (closing the Appendix-B gap deferred by ruling 3b-3); **text-on-photo
  mobile hero** (the Folio graft — H1 over the image under a scrim, never
  `display:none`); services as numbered pillar rows; about keeps its plate,
  upgraded to the cinematic frame (offset accent border, shine); booking as
  the gradient-border card band; staggered reveals via IntersectionObserver
  in `ruled_page.js` with the full reduced-motion block; grain + ambient
  glows; chat-widget calm rules.
- **D6 — `theme` gets an allowlist.** `update()` and the onboarding
  controller validate `theme` against exactly `{brand_color, font_pairing,
  palette}` with per-key rules (palette `in:` the six ids; font_pairing
  `in:` the four ids); unknown keys are refused with a friendly message.
  Plan B extends the same allowlist with `locale` (`in:` the five) — the
  allowlist is one shared constant so the two plans cannot disagree.
  Render-time re-whitelisting stays (defense in depth, as today).
- **D7 — the page speaks the tenant's language (Part C).** Real lang files
  for the landing namespace in en/de/es/fr/ru; a per-page locale
  (`theme.locale`, allowlisted to the five) defaulting to the organization's
  language at page creation; the render controller sets the app locale for
  the request; `lang` attribute follows it. IndustryProfile vocabulary moves
  to translation keys (9 industries × 5 locales); blade fallback labels
  (`address_label` etc.) become `__()` defaults that per-page copy fields
  still override. Carbon date/hour rendering already honors the locale.
- **D8 — golden discipline unchanged in kind.** The rebuild deliberately
  re-captures the render goldens (new captures committed before wiring
  wherever a task's change is meant to be invisible; wholesale-new sections
  get fresh goldens after visual sign-off). The hostile batteries (image
  URLs, nested shapes, contact shapes) must pass unchanged against the new
  markup — they pin survival, not bytes.

## 3. The six palettes (complete token sets)

Each palette is one PHP array in `App\Landing\Palette` (new, mirroring
IndustryProfile's shape): id, label, `dark` flag, and the token map the
layout writes as the nonced inline `:root` override (same mechanism as
Accent today — one inline block, palette tokens first, Accent's brand
derivations after). The CSS's own `:root` holds `porcelain` (the default)
so a page with no palette set renders identically to a page set to
`porcelain` — no-value never means no-design.

Token keys every palette must define (the rebuilt CSS consumes only these):
`bg, bg-2, bg-elev, glass, text, text-soft, text-muted, line, line-soft,
accent, accent-bright, accent-deep, accent-on, halo, scrim` — plus the
`dark` flag driving `color-scheme` and the monogram/veil variants.

Authored values (contrast ratios verified at plan time, stated inline in
the palette file; body-text pairs must clear 4.5:1):

- **champagne_noir** (dark; beauty, spa): bg `#15100b`, bg-2 `#1c150e`,
  elev `#2b2014`, text `#f7eeda`, soft `#d8cdb6`, muted `#a89e88`,
  accent `#d8b878`, bright `#f1d49b`, deep `#927044`, on `#1a1208`.
- **porcelain** (light; `other`, default): bg `#F4F6F8`, bg-2 `#ECE8EE`,
  elev `#FFFFFF`, text `#211C29`, soft `#5B5266`, muted `#7A7186`,
  accent `#9B5C8F`, bright `#C77FB4`, deep `#7E4874`, on `#FFFFFF`.
- **midnight_brass** (dark; hotel): bg `#0f1419`, bg-2 `#151c23`,
  elev `#1d2630`, text `#EDF2F4`, soft `#C3CDD4`, muted `#8B98A3`,
  accent `#C8A96A`, bright `#E3C98F`, deep `#8F7440`, on `#10151A`.
- **clinic_air** (light; medical, dental): bg `#F7FAFB`, bg-2 `#EDF3F5`,
  elev `#FFFFFF`, text `#122A33`, soft `#3D5A66`, muted `#5E7B87`,
  accent `#0E7C86`, bright `#3AA7B0`, deep `#0A5B62`, on `#FFFFFF`.
- **terracotta** (light; restaurant, café): bg `#FAF5EE`, bg-2 `#F3EADD`,
  elev `#FFFFFF`, text `#2A2018`, soft `#5C4C3E`, muted `#82705F`,
  accent `#B4462A`, bright `#D96A47`, deep `#8A3520`, on `#FFFFFF`.
- **slate_amber** (dark; fitness, education, professional): bg `#16181D`,
  bg-2 `#1C1F26`, elev `#242832`, text `#EFF1F4`, soft `#C6CBD4`,
  muted `#9199A6`, accent `#E0A458`, bright `#F2C583`, deep `#A5763B`,
  on `#171310`.

Industry → default palette (in IndustryProfile, next to defaultSections):
beauty → champagne_noir; hotel → midnight_brass; medical → clinic_air;
restaurant → terracotta; fitness/education/legal/real_estate (the
professional bucket slate_amber's label names) → slate_amber;
other → porcelain. (Mapping fixed in Task 1 from `IndustryProfile::all()`'s
nine authored ids; recorded here per the Task 1 review.)

## 4. The rebuilt template, section by section

The data contract is frozen: every section reads exactly the `$copy` keys
and PageContent/IndustryProfile inputs it reads today (recon §1 table).
The rebuild changes markup, classes, CSS and JS — never inputs. Escaping
discipline (`{{ }}` only, no raw echoes) and the no-inline-script rule are
unchanged and stay test-enforced.

- **Nav (new)**: fixed glass pill — wordmark (business name), anchors for
  up to four enabled sections, primary CTA (profile's primaryCta →
  booking/contact anchor). Condenses via a scrolled class from
  `ruled_page.js`. ≤880px: anchors hidden, wordmark + CTA remain.
- **Hero**: with photo — Ken Burns cover under glow/veil/vignette layers,
  chip (industry kicker), H1 with italic gradient emphasis on the last
  word, serif italic subtitle, gold + ghost CTA pair. Without photo — the
  monogram plate becomes a composed device on the palette's elevated
  surface with the accent-border offset (no photography, still designed).
  Mobile: image stays full-bleed behind a scrim with the H1 on it,
  capped ~62vh.
- **About**: cinematic 4:5 frame (offset accent border, shine overlay,
  glass tag with the business name), text in the remaining columns —
  today's column geometry, new dressing. Imageless: text-only, as today.
- **Services**: numbered pillar rows (01/02/03…) with name, description,
  price/duration in mono; hover underline sweep. Service photos, when
  present, as small square plates trailing the row (unchanged data).
- **Team / Reviews / Contact**: restyled to the token system (cards on
  `bg-elev`, glass details, eyebrow kickers); reviews keep the ≥4-ratings
  gate and meter semantics.
- **Booking**: the gradient-border champagne-band card, centered, perks
  row from existing copy keys, primary CTA.
- **Footer**: brand column + contact + CTA on the deepest surface.
- **Motion**: `.reveal` + staggered delays, IntersectionObserver in
  `ruled_page.js`, nav condense, Ken Burns — all inert under
  `prefers-reduced-motion`, chat-widget calm rules appended.

## 5. Editor and wizard

- `LandingEditor`: a Design panel above the section list — palette cards
  (6) and type cards (4), each a live miniature (business name in the
  pairing's display face over the palette's bg/accent, small body
  specimen), plus the brand-color input. Selection state from the page
  query (`theme.*`), saved through the normal save path, previewNonce
  bump on success. New strings in all five locales.
- `LandingWizard` "Make it yours": replaced by the same cards component
  (template grid step untouched this round — one template).
- The cards' fonts come from the self-hosted files (same-origin), so the
  admin SPA adds one `@font-face` sheet for the landing faces used in
  previews (loaded only on these screens).

## 6. Testing

- Backend: palette allowlist (update + onboarding + render re-whitelist);
  every palette id renders (inline token block present, nonced, correct
  values for a sampled token per palette); no-palette renders byte-stable
  against the porcelain default; hostile `theme.palette` values (unknown
  id, array, 200k string) refused/ignored without taking the page down;
  the full existing hostile batteries pass against the new markup; nav
  anchors follow enabled sections; monogram path renders with no image;
  fonts: the CSP no longer names Google hosts, the stylesheet no longer
  links them, `@font-face` sources are same-origin, and the woff2 files
  exist at the declared paths.
- i18n (Part C): each of the five locales renders the vocabulary
  translated (spot keys per industry), `lang` attribute follows
  `theme.locale`, unknown locale falls back to `en`; date/hours honor the
  locale (existing Carbon paths).
- Frontend: pure-function tests for palette/type card data and theme-save
  payload shape; the design panel's strings pass the locale-completeness
  test; existing 438-test baseline holds.
- Visual: build → screenshot desktop (1440) and mobile (390) per palette →
  self-critique against the house-style quality bar (two-surface rhythm,
  mobile hero parity, sticky CTA, contrast, one signature element) before
  golden capture. Goldens re-captured only after that review, committed
  separately from wiring, reviewer verifies order.

## 7. Rollout

Two plans from this spec, executed in order on `feature/landing-phase-3c`
(SDD, per-task review, the established deploy discipline — source patch
onto origin/main, fresh SPA build on the artifact):

- **Plan A — the look and the controls** (D1-D6, §3-§5): palette system →
  fonts self-hosted → template rebuild (nav, hero+monogram, sections,
  motion) → editor/wizard design cards → allowlist. Deployable alone; the
  page is English-first as today.
- **Plan B — the language** (D7): lang files, per-page locale, vocabulary
  keys, locale tests. Small, independent, deployable after A (or before —
  no coupling except both touch blades).

User-supplied images (offered): demo-page photography per vertical for
the live smoke and marketing screenshots — nothing in the build depends
on them (tenant uploads and the monogram path cover both states).

Out of scope, still parked: the cookie-consent panel (its font trigger is
removed by D3; analytics/embeds would re-raise it); `/app/`/`/staff/`
docroot exposure; `is_featured` writer; multi-template catalog.
