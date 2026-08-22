# HexaTech Beauty Landing Templates — Final Three, Build Spec

## 1. Decision

**Ship: `ruled_page`, `hot_mauve`, `standing_appointment`.**

### Where the judges agreed, and I followed

| Agreement | Judges | Action |
|---|---|---|
| Hot Mauve ships | 3/3 | Ship. Only loud direction; only one that read the codebase. |
| Ruled Page / Folio / Clinical Record are one taste, not three | 3/3 (all three said it unprompted) | At most one of the three may ship. Cool-paper slot goes to exactly one. |
| Phone number at booking-heading weight; tap-to-call in the mobile bar | 3/3 named it | Mandatory in all three. |
| Clinical Record's n<4 review suppression + sourced aggregate is the only honest proof pattern proposed | 3/3 | Mandatory in all three. |
| Ruled Page's `.band--ink + .band--ink` CSS adjacency rule beats every server-side surface pass | 3/3 | Replaces Hot Mauve's `$surfaces` algorithm and Standing Appointment's deckle sequencing outright. |
| Folio's `mix-blend-mode` duotone is the right answer to mismatched tenant photos | 3/3 | Grafted into all three team sections. |

### Where I overrode a judge

**1. Cut Folio — overriding J1 and J2, who both ranked it #1.**
Folio's distinctiveness is load-bearing on assets the tenant does not have. The bleed rule, the zero-gutter duotone contact sheet, the full-bleed plate every fifth service row, the mobile hero-as-cover — every one of them is a photograph doing the work. The brief states the customer supplies images *later*; J3 identified this precisely ("it collapses hardest in the no-images state, which is precisely the launch-day state"). Second: its own spec requests `style-src 'unsafe-inline'`, which the brief's strict CSP forbids, and it is the only direction that builds that dependency into its stagger mechanism. Third: J1's pastiche warning is correct — drop cap + duotone + dot leaders + perforation + column rules + colophon + folio rail is six print signifiers competing, and the first cut (the drop cap) is the one The Ruled Page refuses by name. Folio pays for itself as a donor, exactly as J1 argued Clinical Record should.

**2. Ship The Ruled Page — overriding J3, who ranked it last (5/5).**
J3's three objections are (a) no tap-to-call, (b) no proof instrument, (c) thins out on sparse data. (a) and (b) are grafts I am making mandatory across all three templates — they are not architecture, they are two components. (c) is factually contradicted by the other two judges, who both call its sparse-data handling the best in the set (`data-count` team variants, single-review layout, 700-char about threshold, band adjacency, monogram fallback reused page-wide). J3 was reading the whitespace, not the fallback architecture. What J3 could not override: buildability 9/9/8 — the highest scores in the batch, on a template that ships to every tenant, where build cost compounds — and a signature that all three judges said the others should steal.

**3. Ship Standing Appointment — overriding J1, who ranked it last with the lowest distinctiveness score (6.5), with two amputations.**
J1's critique was correct about *which* elements were templated and wrong that nothing survived removing them. So: **the hand-drawn hero swash is deleted outright** (J1: "now a default"; it also duplicates the arch's job), and **the grain becomes an off-by-default per-tenant flag** (J1: "a signature you are prepared to delete is not a signature" — so it stops being the signature). The deckle carries the direction alone, and it is real craft: hand-authored `clip-path` point lists on a separate divider that never clips content and degrades to a flat edge. I have also replaced its fragile next-section-colour logic with a construction that cannot be wrong (§3.7). What remains unmatched: the only warm palette, the only direction that treats `tel:` as a primary conversion, and the only palette that harmonises with `booking-widget.blade.php`'s shipped `--bg:#faf8f5`.

**4. Cut Clinical Record — overriding J3, who ranked it #1.**
J1's argument holds: it is The Ruled Page's sibling, not its alternative, and shipping both covers two rooms with three templates. Its own thesis is measurement, and J2 caught it hard-pinning `--focus:#C77FB4` at 2.98:1 against its own primary surface. J2 also placed it in the Linear/Stripe cliché (distinctiveness 6) — it escapes the beauty default by landing in the SaaS one. Four of its ideas are grafted; it has done its job.

### Coverage the three actually deliver

| | `ruled_page` | `hot_mauve` | `standing_appointment` |
|---|---|---|---|
| Room | The established quiet studio | The new city salon selling *being seen there* | The neighbourhood independent living off regulars |
| Surface | Cool paper, mauve-shifted neutrals | Mauve-black + one saturated magenta flood | Warm greyed plaster |
| Fraunces register | 300, opsz 144, SOFT 0 / WONK 0 | 900, SOFT 100 / WONK 1 | 300, SOFT 100 / WONK 0 |
| Signature | The Rule (margin hairline as index + ruler + spine) | The Rail dissolving into the flood band | The deckle (hand-torn section edges) |
| Loudness | Whisper | Shout | Speaking voice |
| Primary conversion | Widget | Widget | `tel:` |
| No-image device | Monogram plate | Type-tile | Plaster arch + initial |

No two share a palette, a type register, a signature, or a customer. **And none of the three depends on photography to be distinctive** — that is the test Folio failed.

---

## 2. What was grafted, and into what

| From | Idea | Into | Why |
|---|---|---|---|
| **Folio** | `mix-blend-mode: color` brand duotone over portraits | all 3 team sections | Makes fifteen phone snapshots shot in different light read as one commission. The single best idea in the batch for real tenant photo libraries. |
| **Folio** | Perforated reply-card frame (radial-gradient scallop + dashed rule) | `standing_appointment` booking panel | Best answer proposed to housing a widget you don't fully control. |
| **Folio** | Mobile hero as literal cover — headline set *on* the photograph over a scrim | `ruled_page` mobile hero | All judges called Ruled Page's mobile its weakest face; this is the proven better answer. |
| **Folio** | "Text never touches a page edge; photographs always do" | all 3, as a layout law | The only actual layout *system* anyone proposed. Costs nothing to enforce. Makes each page recognisable at 10% zoom. |
| **Folio** | Promote any review >700 chars into the lead slot instead of letting it orphan a column | all 3 review sections | Fixes the `columns` orphan risk all three of my templates inherit. |
| **Clinical Record** | Rating distribution histogram from real `overall_rating` rows | all 3 | Replaces gold stars / coral squares / hairline segments. Honest proof beats a glyph. |
| **Clinical Record** | **n < 4 suppression, enforced in Blade** | all 3 | A 3-review distribution is misleading. Non-negotiable. |
| **Clinical Record** | Sourced aggregate sentence naming the source | all 3 | House trust rule; nobody else stated it. |
| **Clinical Record** | Tick-meter rating glyph (5 × 10×2px bars) | all 3 | Legible, non-template, works at any size. |
| **Clinical Record** | Reposition the chat launcher rather than pad around it | all 3 (§3.6) | Its own #1 risk was "I don't have the selector." I do now: `#htchat-launcher`, offsets written inline by JS, so the rule needs `!important`. |
| **Standing Appointment** | Phone number at booking-heading weight; `tel:` in every mobile bar | `ruled_page`, `hot_mauve` | Sharpest commercial insight in the batch. Ruled Page shipped no tap-to-call at all. |
| **Standing Appointment** | `@media (hover:none)` duotone lightening | all 3 | Faces must read on touch, where the hover reveal cannot fire. |
| **Standing Appointment** | `postMessage` origin check + numeric clamp | all 3 | House pattern. |
| **Standing Appointment** | Focus ring = ink/paper outline + brand halo, never tenant-derived | all 3 | Contrast-guaranteed on every surface regardless of what hex the tenant picks. Fixes the exact bug that sank Clinical Record. |
| **The Ruled Page** | `.band--ink + .band--ink` adjacency rule | `hot_mauve`, `standing_appointment` | Deletes Hot Mauve's `$surfaces` rotation (J1: "the single most likely thing in the batch to be built wrong") and Standing Appointment's deckle-sequencing dependency. |
| **The Ruled Page** | Per-band `::before` segment (signature drawn per-section, never coordinated) | `hot_mauve` Rail | Rail node offsets no longer need JS measurement or a `ResizeObserver`. |
| **The Ruled Page** | Live "Open until 19:00" status line from Property, echoed hero → mobile bar → footer | `hot_mauve`, `standing_appointment` | A phone visitor's first question is whether you are open right now. |
| **Hot Mauve** | Same-origin `/booking-widget?org=&color=&lang=` embed with `e.origin === location.origin` | all 3 | Only direction that checked. The widget is ours (§3.5); the other four designed around an imaginary third party. |

**Cross-cutting fixes, all mandatory before any build:**
1. Hot Mauve's Google Fonts URL must request `SOFT` and `WONK` or its entire display voice silently renders as plain Fraunces (§5.2).
2. No inline `style` attributes anywhere — stagger uses `:nth-child()`, tenant tokens go in a nonced `<style>` block (§3.2).
3. No `100vw` / `calc(50% - 50vw)` anywhere — it includes the scrollbar and overflows horizontally, and the usual `overflow-x:hidden` patch creates a scroll container that breaks sticky headers. One bleed mechanism only (§3.3).
4. `booking-widget.blade.php` gets a `?profile=` parameter and per-profile tokens (§3.5). It currently renders Cormorant Garamond on warm cream inside pages whose entire thesis is refusing that.

---

## 3. Shared build kit

Everything in this section is written once and used by all three templates. Per-template sections describe only what differs.

### 3.1 Data contract (verified against the repo)

| Section | Source | Fields |
|---|---|---|
| services | `Service` where `is_active`, order `sort_order` | `name`, `short_description` ?? `description`, `duration_minutes`, `price` (decimal:2), `currency`, `image`, `category_id` → `ServiceCategory.name` |
| team | `ServiceMaster` where `is_active`, order `sort_order` | `name`, `title` (the role), `avatar`, `specialties` (array), `bio` |
| reviews | `ReviewSubmission` where `comment` not null, `latest('submitted_at')` | `overall_rating` (int 1–5), `comment`, `anonymous_name` ?? guest name ?? `'Verified client'`, `submitted_at`, `form_id` → `ReviewForm.name` (the source) |
| contact | `Property` | `name`, `address`, `city`, `country`, `phone`, `email`, `timezone`, `currency`, `image_url`, `settings['opening_hours']`, `settings['map_image']`, `settings['lat']`, `settings['lng']` |
| brand | `Brand.primary_color` (nullable `#rrggbb`) | run through `CssColor::safe($hex, $profileDefault)` |

`Property.settings['opening_hours']` contract: `[{day:0..6, open:"09:00", close:"19:00", closed:bool}]`. If absent, every "open now" affordance in every template is omitted (not faked, not left blank).

**Section omission:** each section is wrapped in a single `@if($section->enabled && $section->hasData())` in the layout. `hasData()` per section: services ≥1 active row; team ≥1 active row; reviews ≥1 row with a comment; about non-empty body; contact a Property with at least an address *or* a phone. No section ever renders empty.

### 3.2 CSP posture

```
style-src  'self' 'nonce-{{ csp_nonce() }}' https://fonts.googleapis.com;
font-src   'self' https://fonts.gstatic.com;
script-src 'self' 'nonce-{{ csp_nonce() }}';
frame-src  'self';
img-src    'self' data:;
```

Consequences the developer must honour:
- **Tenant tokens** go in one `<style nonce="{{ csp_nonce() }}">` block in `<head>` — the derived brand tokens (§3.4) and any per-tenant dynamic value (review histogram percentages as `.dist-5{--pct:64%}` … `.dist-1{--pct:2%}`).
- **No `style=""` attributes.** Reveal stagger is `:nth-child()`:
  ```css
  .stagger > * { transition-delay: 0ms }
  .stagger > :nth-child(2){transition-delay:60ms}  .stagger > :nth-child(3){transition-delay:120ms}
  .stagger > :nth-child(4){transition-delay:180ms} .stagger > :nth-child(5){transition-delay:240ms}
  .stagger > :nth-child(6){transition-delay:300ms} .stagger > :nth-child(7){transition-delay:360ms}
  .stagger > :nth-child(8){transition-delay:420ms} .stagger > :nth-child(n+9){transition-delay:480ms}
  ```
  The `n+9` cap is what stops a 30-row service ledger ending with a two-second tail.
- **`frame-src 'self'`** is sufficient. The booking widget is same-origin (`/booking-widget`). No third-party frame exists on any of the three templates: maps are a same-origin cached image or a CSS plan tile plus an outbound `<a>` (a navigation, not a subresource).
- **Google Fonts** is the only external host, one `<link>`, with `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`.
- **QA gate:** `curl -sI "<the exact css2 URL>"` must return `200` and a non-empty body before ship. A malformed variable-axis tuple 404s the whole stylesheet and takes all three faces down with it.

### 3.3 The one bleed mechanism (bans `vw`)

Every template's `<main>` is this grid. `100%` resolves against the content box, which excludes the scrollbar; `100vw` does not.

```css
.page {
  display: grid;
  grid-template-columns:
    [bleed-start] minmax(var(--gutter), 1fr)
    [main-start]  min(100% - (var(--gutter) * 2), var(--maxw))  [main-end]
    minmax(var(--gutter), 1fr) [bleed-end];
}
.page > *        { grid-column: main-start / main-end }
.page > .bleed   { grid-column: bleed-start / bleed-end }
.page > .bleed-r { grid-column: main-start / bleed-end }
.page > .bleed-l { grid-column: bleed-start / main-end }
```

**Layout law (from Folio), enforced in all three:** text lives between `main-start` and `main-end`; every photographic plate is anchored to at least one bleed line. This is what makes each page identifiable at thumbnail size, and it is free.

### 3.4 Tenant brand weave — `App\Support\BrandPalette`

Client-side `color-mix()` / relative-colour syntax is **enhancement only**; the server emits literal hex so nothing depends on browser support. One helper, called once per render, emits into the nonced block.

```php
BrandPalette::for(string $hex, string $profileDefault, array $surfaces): array
```

1. `$hex = CssColor::safe($hex, $profileDefault)` — reuses the existing validator.
2. `hexToHsl()`. Clamp **S to 0.10–0.55** (kills neon), clamp **L to 0.30–0.46** for the base.
3. Emit:

| Token | Derivation | Role |
|---|---|---|
| `--brand` | `hsl(h, s, L)` | Graphics, rules, ticks, fills, text **≥24px only** |
| `--brand-deep` | `hsl(h, min(s+0.05,.60), 0.32)`, then **darken L in 2% steps (max 8) until `contrast(--brand-deep, --paper) ≥ 4.5`** | The only brand token permitted on text under 24px |
| `--brand-bright` | `hsl(h, min(s+0.06,.55), 0.64)`, then lighten until `contrast(…, --ink) ≥ 4.5` | Links and interactive inside ink bands |
| `--brand-on` | `relativeLuminance(--brand) > 0.42 ? #17131E : #FFFFFF` | Label colour on a brand fill |
| `--brand-tint` | `hsl(h, 0.12, 0.925)` | Tinted alternating panel |
| `--brand-line` | `hsl(h, 0.10, 0.865)` | Hairlines |
| `--brand-halo` | `hsla(h, s, L, 0.26)` | Focus halo only |

4. **Hard assertion:** if `--brand-deep` still fails 4.5:1 after 8 steps, or `--brand-bright` fails against `--ink`, discard the whole derivation and emit the profile's house triple. Log it.
5. `--paper`, `--paper-2`, `--text`, `--muted`, `--warm` and every focus colour **never change per tenant**.

Unit test with these adversarial values before ship: `#FFFF00`, `#00FF00`, `#000000`, `#FFFFFF`, `#F5F5F5`, `#7B2D8E`, `#00E5FF`, `#8B0000`, `null`, `"red"`.

### 3.5 The booking widget is ours — retokenise it, don't frame around it

`resources/views/booking-widget.blade.php` is same-origin, already reads `?color=` through `CssColor::safe`, already has a `[data-theme="dark"]` block, and exposes `--radius`, `--font`, `--font-display`, `--bg`, `--surface`, `--border` as custom properties in one file. It currently ships Cormorant Garamond on `#faf8f5` — the exact face and surface all three templates refuse by name.

**Change (one file):** accept `&profile=` and `&tpl=`, and add a per-template token block:

```css
:root[data-tpl="ruled_page"]         { --radius:2px;  --bg:#F4F6F8; --surface:#fff; --border:#DCD7E2;
  --font:'Inter Tight',system-ui,sans-serif; --font-display:'Fraunces',Georgia,serif }
:root[data-tpl="hot_mauve"]          { --radius:2px;  --bg:#FAF8FA; --surface:#fff; --border:#E2D9E0;
  --font:'Inter Tight',system-ui,sans-serif; --font-display:'Fraunces',Georgia,serif }
:root[data-tpl="standing_appointment"]{ --radius:14px; --bg:#FBF9F6; --surface:#fff; --border:#DDD3C9;
  --font:'Inter Tight',system-ui,sans-serif; --font-display:'Fraunces',Georgia,serif }
```

Swap the widget's `@import` to the Fraunces + Inter Tight pair. This removes the "alien iframe" problem every one of the five directions worried about and cannot fix from the outside. Keep the widget in **light** theme on all three templates — do not pass `data-theme=dark`.

**Embed, identical in all three:**
```blade
<iframe src="/booking-widget?org={{ $org->id }}&color={{ $brandHex }}&lang={{ app()->getLocale() }}&tpl={{ $templateKey }}&profile={{ $profile }}{{ $serviceId ? '&service='.$serviceId : '' }}"
        title="{{ __('Book an appointment') }}" loading="lazy" id="bw"
        class="bw__frame"></iframe>
```
Service rows deep-link with `#booking?service={id}`; the section carries `scroll-margin-top: calc(var(--header-h-condensed) + 16px)`.

**Height sync (11 lines, same-origin):**
```js
const bw = document.getElementById('bw');
if (bw) addEventListener('message', e => {
  if (e.origin !== location.origin) return;
  if (!e.data || e.data.type !== 'bw:height') return;
  const h = Math.min(2000, Math.max(400, parseInt(e.data.px, 10) || 0));
  if (h) bw.style.height = h + 'px';
});
```
The CSS `min-height` is the fallback and is already correct if no message ever arrives.

### 3.6 The chat launcher — reposition, never restyle

Verified in `public/widget/hotel-chat.js`: `#htchat-launcher` is `position:fixed; z-index:99998`, default `56px` (configurable via `launcher_size`), and its `bottom`/`left`/`right` are written as **inline styles by `applyPosition()`**, so a stylesheet override requires `!important`. Position is configurable to `bottom-left`.

This is why the 76–84px right-padding workarounds in the original directions were wrong: the launcher's size is tenant-configurable and its side is tenant-configurable. Raise it instead — that is side-agnostic and size-agnostic.

```css
@media (max-width: 899px) {
  body.has-actionbar #htchat-launcher {
    bottom: calc(20px + var(--bar-h) + env(safe-area-inset-bottom)) !important;
    transition: bottom 240ms cubic-bezier(.22,1,.36,1);
  }
}
```

`body.has-actionbar` is toggled by the same IntersectionObserver that reveals the mobile action bar (§3.9). Nothing else about the launcher is touched — not colour, size, shape, radius, icon or z-index. If chat is disabled for the tenant the rule is an inert no-op. Our own z-index budget stays ≤ 60 so the launcher (99998) and panel (99999) are always on top.

### 3.7 Surface adjacency — pure CSS, no server pass

Any section can be toggled off, so adjacency must never be hardcoded and must never be computed.

```css
.band { --surface: var(--paper); background: var(--surface); position: relative }
.band--paper-2 { --surface: var(--paper-2) }
.band--ink     { --surface: var(--ink) }

.band--ink     + .band--ink     { border-block-start: 1px solid var(--line-dark); padding-block-start: var(--pad-seam) }
.band--paper-2 + .band--paper-2 { border-block-start: 1px solid var(--line);      padding-block-start: var(--pad-seam) }
```

Two same-surface sections landing next to each other after a toggle read as two rooms, not one smear. Zero JS, zero Blade logic, cannot desync. **This replaces Hot Mauve's `$surfaces` rotation algorithm entirely** and it is the mechanism that makes Standing Appointment's deckle correct by construction (§6.5).

### 3.8 Reviews — one component, three skins

Shared Blade partial, shared PHP, three stylesheets.

```php
$n    = $reviews->count();
$avg  = $n ? round($reviews->avg('overall_rating'), 1) : null;
$dist = collect(range(5,1))->mapWithKeys(fn($s) => [$s => $n ? round($reviews->where('overall_rating',$s)->count()/$n*100) : 0]);
$lead = $reviews->first(fn($r) => mb_strlen($r->comment) > 700) ?? $reviews->first();  // Folio's orphan fix
$rest = $reviews->reject(fn($r) => $r->is($lead));
```

- **`@if($n >= 4)`** gates the histogram. Below 4 the section renders the aggregate number plus the quotes, and nothing that implies a distribution. Hard rule, in Blade.
- **Sourced aggregate line, always:** `{{ $avg }} average from {{ $n }} reviews left after visits booked here` — the source named in the sentence.
- **Tick meter** replaces every star/square/segment device: five `10×2px` bars, `gap:3px`, filled `--warm-safe` (per-template value that clears 3:1 on that template's surface), empty `--line`, wrapped in `<span role="img" aria-label="Rated 5 out of 5">`. Half-ratings fill via `linear-gradient(90deg, currentColor 50%, transparent 50%)` on the partial bar.
- **Histogram row:** `grid-template-columns: 26px 1fr 44px`, 2px track in `--line`, fill `width: var(--pct)` from the nonced block, count right-aligned in tabular mono.
- Comments server-clamped to 340 chars on a word boundary (except `$lead`), `overflow-wrap:anywhere`.
- No carousel, no autoplay, no accordion, in any of the three.

### 3.9 Mobile action bar — one component, three skins

Present below 900px in all three, and in all three it carries **both** a `tel:` link and the booking CTA.

```
[ ● Open until 19:00 · Call ]  [  Book  ]
   40%, hairline, tel:            60%, filled
```

- `position:fixed; inset:auto 0 0 0; height:var(--bar-h /*64px*/); padding-bottom:env(safe-area-inset-bottom); z-index:50`.
- Revealed by an IntersectionObserver on the hero CTA row: `translateY(100%) → 0`, 240ms. Above the fold there is exactly one CTA, not two.
- **Retracts** (`translateY(100%)`) while `#booking` is on screen — an IntersectionObserver at `threshold:0.25` — so it can never cover a date picker.
- Toggling it also toggles `body.has-actionbar`, which drives the launcher offset (§3.6).
- `<body>` gets `padding-bottom: var(--bar-h)`; the footer additionally reserves `calc(var(--pad) + var(--bar-h) + env(safe-area-inset-bottom))` so legal links are never covered.
- The left cell's status dot and text come from the same Property computation as the hero.

### 3.10 Motion primitives

**Scroll reveal — one observer, whole document, once per element:**
```js
const io = new IntersectionObserver((es) => es.forEach(e => {
  if (!e.isIntersecting) return;
  e.target.classList.add('in');
  io.unobserve(e.target);
}), { threshold: 0.14, rootMargin: '0px 0px -8% 0px' });
document.querySelectorAll('[data-reveal]').forEach(el => io.observe(el));
```
```css
.js [data-reveal] { opacity:0; transform:translateY(14px);
  transition: opacity 520ms var(--ease), transform 520ms var(--ease) }
.js [data-reveal].in { opacity:1; transform:none }
```

**Progressive-enhancement guard — the single most important line in the motion CSS.** An inline nonced one-liner in `<head>`: `document.documentElement.classList.add('js')`. The hiding rule is scoped to `.js`, so if the script is blocked, the CSP kills it, or the observer never fires, the page renders complete and static rather than blank.

**Reduced motion — a no-op, not a shortened animation:**
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration:.01ms !important; animation-iteration-count:1 !important;
    transition-duration:.01ms !important; scroll-behavior:auto !important;
  }
  [data-reveal], [data-reveal].in, [data-rise] { opacity:1 !important; transform:none !important }
  [data-clip] { clip-path:none !important }
  .pulse, .status-dot { animation:none !important; opacity:1 !important }
}
```
Every element lands in its final state. State-carrying feedback (row tint, duotone resolve, focus rings) survives — only travel is removed. Any programmatic `scrollTo` reads `matchMedia('(prefers-reduced-motion: reduce)').matches` and passes `behavior:'auto'`.

**Focus — never tenant-derived (fixes the bug that sank Clinical Record):**
```css
:where(a,button,summary,input,select,textarea,iframe,[tabindex]):focus-visible {
  outline: 2px solid var(--focus-core);
  outline-offset: 3px;
  box-shadow: 0 0 0 6px var(--brand-halo);
}
.band--ink :where(a,button,summary,[tabindex]):focus-visible { --focus-core: var(--on-ink) }
```
`--focus-core` is `--ink` on light surfaces and `--on-ink` on dark ones — 13:1+ on every surface in all three templates, regardless of what hex the tenant picked. The brand supplies identity via the halo only.

### 3.11 Imagery policy — the "no images yet" contract

Two distinct states, both authored:

1. **Curated placeholders (default during trial, and until the tenant's first upload).** Per-profile sets at `/img/tpl/{profile}/{slot}-{n}.avif` with `.webp` and `.jpg` siblings, referenced through `<picture>`, `width`/`height` set, `fetchpriority="high"` on the hero only, real `alt`. Slots: `hero`, `service` (×6), `portrait` (×6), `about`, `room` (×3).
2. **Monogram / type-tile fallback** when placeholders are off and no tenant image exists. Per-template device (§4.4 / §5.4 / §6.4), used **identically in every slot** so it reads as a designed device rather than an error. A tenant with zero images and placeholders off still gets a coherent page.

Every image box has a fixed `aspect-ratio` and sits on a tonal ground (`--paper-2` / `--ink-2`) so a slow or broken image is a deliberate block, never a white flash. Portrait crops default to `object-position: center 25%`; expose an `object_position` field with a 9-point picker in the admin.

### 3.12 Industry profile system

One `profile` value (`beauty | medical | hotel | fitness | restaurant`) re-skins any of the three templates. Four layers:

**(a) Accent triple** — the profile default fed into `BrandPalette::for()`, so tenant colours still override and still pass the same guards.

| Profile | `--brand` | `--brand-bright` | verified |
|---|---|---|---|
| beauty | `#9B5C8F` → deep `#7E4874` | `#C77FB4` | deep 5.8–6.5:1 on all three papers; bright 5.6–6.3:1 on all three inks |
| medical | `#0B6F62` | `#22C7A9` | 5.2–5.7 / 7.8–8.7 |
| hotel | `#8A6432` | `#E0B368` | 4.5–5.0 / 8.6–9.6 (runs through `deepen()`, which nudges it on the warm plaster) |
| fitness | `#1F5FA8` | `#6FB3EE` | 5.5–6.1 / 7.4–8.3 |
| restaurant | `#8C3A2E` | `#E08A6E` | 6.5–7.2 / 6.4–7.2 |

**(b) Nomenclature** — one lang file per profile. `Service` → treatment / procedure / room / class / dish. `ServiceMaster` → stylist / practitioner / host / coach / chef. Section eyebrows, CTA labels, empty-state copy, the `alt` templates.

**(c) Data mapping** — the section contract does not change; only the eloquent source of `services`/`team` may point at `Room`/`Outlet`/`Staff` for hotel. Everything downstream is identical.

**(d) Motif substitution** — one or two per template, listed in each template's §*.8.

The booking widget picks up `?profile=` and `?tpl=` in the same request (§3.5).

---

## 4. Template 1 — `ruled_page`

**Name:** The Ruled Page
**Positioning:** For the established studio that sells one unhurried hour at a stated price — a page set like a letterpressed appointment card, where the luxury signal is measurement and specificity, not atmosphere.

### 4.1 Type

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300..500&family=Inter+Tight:wght@400;500;600&family=IBM+Plex+Mono:wght@500&display=swap">
```
No italic axis is requested — this template bans italics in headings, and does not use them elsewhere. `font-optical-sizing: auto` globally; `SOFT`/`WONK` stay at their defaults (0/0), which is the calm cut.

Metric-matched fallbacks, verified once and locked:
```css
@font-face{font-family:'Fraunces fb';src:local('Georgia');size-adjust:96%;ascent-override:92%;descent-override:24%;line-gap-override:0%}
@font-face{font-family:'Inter Tight fb';src:local('Arial');size-adjust:97%;ascent-override:96%;descent-override:24%;line-gap-override:0%}
```

| Token | Value | Face / notes |
|---|---|---|
| `--t-h1` | `clamp(2.75rem, 5.2vw, 5.125rem)` 44→82px | Fraunces 300, lh 1.02, ls −.025em (−.012em <900px), `text-wrap:balance` |
| `--t-h2` | `clamp(2rem, 3.6vw, 3.25rem)` 32→52px | Fraunces 300, lh 1.06, ls −.02em |
| `--t-quote` | `clamp(1.5rem, 2.6vw, 2.375rem)` 24→38px | Fraunces 300, lh 1.32, max 20em, **no quote glyph, no italic** |
| `--t-h3` | `clamp(1.25rem, 1.6vw, 1.625rem)` 20→26px | Fraunces 400, lh 1.2 |
| `--t-lead` | `clamp(1.125rem, 1.3vw, 1.375rem)` 18→22px | Inter Tight 400, lh 1.55, `--muted`, 46ch |
| `--t-body` | `1.0625rem` 17px | Inter Tight 400, lh 1.65, 62ch |
| `--t-small` | `0.875rem` 14px | Inter Tight |
| `--t-mono` | `0.8125rem` 13px | Plex Mono 500, ls .06em, `font-variant-numeric:tabular-nums` — every price, duration, hour, date |
| `--t-kicker` | `0.75rem` 12px | Plex Mono 500, uppercase, ls .16em |
| `--t-legal` | `0.6875rem` 11px | Plex Mono 500 |

Fraunces never below 20px, never italic, never for UI. Every number on the page is Plex Mono — that is the direction's whole argument.

### 4.2 Tokens (measured, not claimed)

```css
:root{
  /* surfaces — cool paper, mauve-shifted neutrals. Not warm cream, not brown. */
  --paper:#F4F6F8;  --paper-2:#ECE8EE;  --ink:#17131E;  --ink-2:#201A2A;
  /* text */
  --text:#211C29;        /* 15.35:1 on paper · 13.73:1 on paper-2 */
  --muted:#5B5266;       /* 6.82:1 on paper · 6.10:1 on paper-2 — FLOOR, do not lighten */
  --on-ink:#EDE9F2;      /* 15.27:1 on ink · 14.11:1 on ink-2 */
  --muted-dark:#A79BB4;  /* 6.96:1 on ink · 6.43:1 on ink-2 */
  /* rules */
  --line:#DCD7E2;  --line-dark:rgba(237,233,242,.14);
  /* house accent (profile default; tenant overrides via BrandPalette) */
  --brand:#9B5C8F;         /* 4.49:1 on paper — BELOW the small-text floor */
  --brand-deep:#7E4874;    /* 6.32:1 on paper · 5.66:1 on paper-2 */
  --brand-bright:#C77FB4;  /* 6.20:1 on ink · 5.73:1 on ink-2 */
  --brand-on:#FFFFFF;      /* 4.86:1 on --brand — passes for the CTA label */
  --brand-halo:rgba(155,92,143,.26);
  /* human accent — exactly two places on the page */
  --warm:#F0805A;          /* 2.44:1 on paper: STATE DOT ONLY, never text, never a bar */
  --warm-safe:#B4462A;     /* 5.06:1 on paper — the tick meter and histogram fill */
  /* geometry — the commitment */
  --r:0; --r-btn:2px;      /* no other radius exists on this page */
  --shadow: none;          /* there is no shadow token. Zero box-shadows by design. */
  --focus-core:var(--ink);
  --gutter:clamp(20px,4vw,40px); --maxw:1160px;
  --rule-x: max(var(--gutter), calc((100% - var(--maxw)) / 2 - 48px));
  --pad:clamp(72px,10vw,140px); --pad-seam:clamp(56px,7vw,96px);
  --header-h:96px; --header-h-condensed:64px; --bar-h:64px;
  --ease:cubic-bezier(.22,1,.36,1);
}
```

**The hard rule derived from the numbers:** `--brand` is 4.49:1, below the 4.5 floor. It is used **only** for graphics, rules, ticks, borders and text ≥24px. Every accent-coloured word under 24px — every mono eyebrow, every inline link — uses `--brand-deep`. On ink bands, `--brand-bright`.

**Deliberate deviations from house style, stated:**
- **Radius 0** (house says 14–18px). A rounded corner is the fastest way to make printed matter look like a dashboard. Buttons and inputs get 2px so they read as pressable.
- **Zero elevation** (house says soft shadows + 2–4px hover lift). Nothing on a sheet of paper floats. Hover is a hairline changing weight and colour plus a 6px horizontal shift.
- **Ink shifted off `#0E1A24` onto aubergine `#17131E`.** Blue-slate reads cold under mauve. Still nowhere near the demo's brown.
- **Light hero.** House puts the dark spotlight on the hero; here the dark bands are reviews and contact, because the entrance to a quiet studio should be light and the dark moments belong to the human voices and the address on the door.

**Brand weave:** the tenant hex tints `--paper-2` (`--brand-tint`), `--line` (`--brand-line`), and `--ink`/`--ink-2` at 18–20% saturation via `BrandPalette`. Present everywhere, loud nowhere. `--paper`, `--text`, `--muted`, `--warm` never move.

**Surface rhythm:** header (transparent → paper 82% + blur) · hero `paper` · services `paper` · about `paper-2` · team `paper` · reviews **`ink`** · booking `paper-2` · contact **`ink`** · footer `ink` continuous with contact, split by one `--line-dark` hairline. The §3.7 adjacency rule handles every toggled subset.

### 4.3 Signature — **The Rule**

One continuous 1px hairline down the outer margin for the entire length of the document, which indexes, measures and tracks the page. It is the only continuous element on an otherwise floating layout.

1. **Born** in the header, as the 1px `--line` underline 6px below the wordmark's baseline, then drops vertically at `--rule-x`.
2. **Drawn per band**, which is why it survives any toggled subset with zero coordinating logic:
   ```css
   .band::before{content:"";position:absolute;inset-block:0;inset-inline-start:var(--rule-x);
     inline-size:1px;background:var(--line)}
   .band--ink::before{background:var(--line-dark)}
   ```
   Bands stack with no gaps, so the segments read as one unbroken line. Delete any section — still continuous.
3. **Ruler tick at every boundary** — this is what turns a decorative line into an instrument and makes the whitespace read as *measured* rather than empty:
   ```css
   .band::after{content:"";position:absolute;inset-block-start:0;inset-inline-start:var(--rule-x);
     inline-size:13px;block-size:1px;background:var(--line)}
   ```
4. **The mono eyebrow is set vertically ON the rule**, so the left margin becomes the page's index — scanning it gives THE MENU / THE STUDIO / WHO YOU'LL SEE / IN THEIR WORDS / RESERVE / FINDING US:
   ```css
   .band__kicker{position:absolute;inset-inline-start:var(--rule-x);inset-block-start:var(--kicker-top,0);
     transform:translateX(-100%) translateX(-14px);writing-mode:vertical-rl;rotate:180deg;
     font:500 var(--t-kicker)/1 'IBM Plex Mono',ui-monospace,monospace;text-transform:uppercase;
     letter-spacing:.16em;color:var(--brand-deep);white-space:nowrap}
   .band--ink .band__kicker{color:var(--brand-bright)}
   ```
5. **A 2px `--brand` overlay fills it to scroll position** — a reading spine. CSS-only where supported, 7 lines of rAF-throttled passive JS where not:
   ```css
   .rule-progress{position:fixed;inset-block-start:0;inset-inline-start:var(--rule-x);
     translate:-.5px 0;inline-size:2px;block-size:100vh;transform-origin:top;
     scale:1 var(--p,0);background:var(--brand);z-index:40;pointer-events:none}
   @supports (animation-timeline: scroll()){
     .rule-progress{scale:1 1;animation:ruleGrow linear both;animation-timeline:scroll(root block)}
     @keyframes ruleGrow{from{scale:1 0}to{scale:1 1}}
   }
   ```
   Feature-detect in JS (`CSS.supports('animation-timeline','scroll()')`) and **skip attaching the listener entirely** where the CSS handles it. 2px at the brand colour is deliberate: it stays visible over both `--paper` and `--ink` without blend modes or per-band switching.
6. **Terminates by turning 90°** — the contact band's `::before` stops at `.site-footer{border-block-start:1px solid var(--line-dark)}`, the rule laid flat. The page closes the shape it opened with.

**Breakpoints, exactly.** ≥1320px: the rule sits in the true outer margin, 48px clear of the container, eyebrows vertical. 900–1319px: `--rule-x: calc(var(--gutter) - 16px)`, still continuous, eyebrows flip horizontal above each heading preceded by a 12px `--brand` tick. <900px: the vertical rule is removed and **reincarnated as a 2px horizontal progress hairline pinned under the sticky header**, driven by the same `--p`; the ruler ticks survive as the 12px accent marks before each eyebrow.

Written with logical properties throughout (`inset-inline-start`, not `left`) so RTL mirrors for free rather than needing a retrofit.

~30 lines of CSS, ~7 of JS. It encodes real content — page index plus reading position — and it is the only place this design spends any boldness.

### 4.4 The no-image device — the monogram plate

`--paper-2` field, 1px `--line` border, the studio's/service's/person's initials in Fraunces 300 (88px hero / 64px team / 32px service thumb) in `--brand`, and a mono 12px label bottom-left. Identical construction in hero, services, team, about and the map tile. Because it is shared across the whole page it reads as a designed device.

### 4.5 Sections

**1 · header**
*Desktop:* sticky, 96px, transparent over `--paper` so it reads as generous letterhead margin. Inner is the 1160 container, flex, space-between. Left: wordmark Fraunces 300 22px, ls .02em, with the 1px `--line` underline 6px below baseline (the Rule's birth). Centre-right: nav, Inter Tight 500 14px, `--muted`, gap 32px; the in-view link gets `--text` + a 1px `--brand` underline at 6px offset. Right: filled `--brand` rectangle (2px radius), `--brand-on` label, 15px/500, padding 15px 26px, min-height 52px. Condensed (`.is-stuck`): 64px, `rgba(244,246,248,.82)` + `backdrop-filter:blur(14px) saturate(1.1)`, 1px `--line` bottom, wordmark 18px, CTA 44px; 260ms `--ease` on height and background.
*Mobile:* 60px, wordmark 17px, 44×44 hamburger; no inline nav; CTA moves to the action bar.
*No data:* nav is built from the enabled-section list, so a toggled-off section never leaves a dead anchor. No logo → tenant name in Fraunces 300; a missing logo is invisible, not a broken box.

**2 · hero**
*Desktop:* `grid-template-columns: minmax(0,6fr) minmax(0,5fr)`, gap `clamp(40px,5vw,72px)`, align center; padding `clamp(88px,9vw,140px)` / `clamp(96px,11vw,160px)`.
Left: mono eyebrow (`EST. 2019 · KRAKÓW` from Property, `--brand-deep`) → H1, max 3 lines, each wrapped `<span class="line"><span>…</span></span>` for the reveal — default copy **"The unhurried hour."** → lead 46ch, `--muted` — **"Six rooms, one appointment at a time. We don't play music you didn't ask for, and nobody is ever rushed out."** → CTA row: filled `--brand` "Reserve a time" (52px) + quiet text link "See the menu ↓" in `--brand-deep` with a 1px underline at 4px offset → 20px down, the status line: 6px `--warm` dot + mono 13px `--muted` "Open today until 19:00 · ul. Św. Tomasza 12". Beneath that, the **promoted phone number** (Standing Appointment graft): mono 11px `--muted` "or call" over a `tel:` link in Fraunces 400 at 26px `--brand-deep`.
Right: one photographic plate, `aspect-ratio:4/5; block-size:min(78vh,720px)`, `grid-column: main-start / bleed-end` so it bleeds to the right viewport edge (§3.3 — no `vw`). No scrim, no text on the image. Below it a 1px `--line` rule and a mono 12px caption naming the room.
*Mobile (Folio graft):* eyebrow → H1 → lead → CTA row → status + phone → **plate as a literal cover**: full-bleed (`grid-column: bleed`), `aspect-ratio:4/5`, capped 62vh, with the **H1's last line repeated at 32px set ON the photograph**, bottom-left, in `--on-ink` over `linear-gradient(0deg, rgba(23,19,30,.78) 0%, rgba(23,19,30,.34) 42%, transparent 68%)`. The plate is never `display:none` and is the largest object on the screen.
*No data:* no hero image → the monogram plate at the same aspect ratio, with the studio name in mono 12px bottom-left; finished-looking, not broken. No Property hours → the dot and "open until" clause are dropped and only the address remains. No Property at all → the status line is omitted entirely. No phone → the promoted `tel:` block is omitted and the CTA row closes up.

**3 · services**
*Desktop:* `minmax(0,7fr) minmax(0,4fr)`, 72px gap. **Left is the menu, not a card grid.** Each service is an `<a>` wrapping `display:grid; grid-template-columns:1fr auto; align-items:baseline; padding-block:26px; border-block-end:1px solid var(--line)`. Line 1 is a baseline flex row: name (Fraunces 400 26px) — `.leader{flex:1;border-block-end:1px solid var(--line);transform:translateY(-5px)}` — price (mono 500 22px, tabular). Line 2: duration, mono 13px `--muted`. Line 3: description, Inter Tight 15px `--muted`, 58ch, clamped server-side to 180 chars on a word boundary. Category grouping (if `category_id` is used) is a mono 12px `--brand-deep` label with 48px above.
Right is the sticky preview plate: `position:sticky; top:128px; aspect-ratio:3/4; border:1px solid var(--line)`, every service image stacked at `inset:0; object-fit:cover; opacity:0`, first at 1, `aria-hidden="true"` (it duplicates what the rows already carry).
*Mobile:* the plate is removed and its **information preserved inline** — rows become `64px 1fr auto` with a 64×80 image plate left, name + duration centre, price right in mono 17px. Below 560px the leader rule is dropped (no width for it to do its job). Row min-height 62px.
*No data:* no price → the leader still runs and the cell reads `—` in `--muted`. No duration → that line is dropped. No description → name/leader/price only, and it looks intentional. No service has an image → the preview column is omitted by Blade `@if` and the menu goes full width. **Fewer than 3 services → the menu tightens to `max-width:720px`** rather than spanning 7 columns of nothing.

**4 · about**
*Desktop:* `--paper-2`, 12-col. Image plate spans 1–4 with `margin-inline-start:-40px; margin-block-start:-40px` so it hangs off the grid and crosses the band's top hairline — the page's one deliberate "breaks the ruling" moment, and the reason this band is tinted (the overlap needs a colour edge to cross). `aspect-ratio:3/4`, 1px `--line`, mono caption below. Text spans 6–11: mono kicker THE STUDIO → an `about_lead` sentence in Fraunces 300 30px → body 17px. **If `strlen(body) > 900` and viewport ≥1080px** the body sets `columns:2; column-gap:48px; column-rule:1px solid var(--line); column-fill:balance; orphans:3; widows:3` — the column rule is the printed-matter tell and costs one declaration. (Threshold raised from the original 700 on J1's note; a 710-char block balances into two stubs.) Below the threshold it stays single-column at 62ch — the check is server-side in Blade.
Signature detail: the first two words of the lead are wrapped and set `font-variant-caps:all-small-caps; letter-spacing:.08em` — a letterpress opening **instead of a drop cap**, which is refused by name.
*Mobile:* plate first, full-bleed at 4:5, then kicker/lead/body single-column; the −40px hang is removed (it needs margin space mobile does not have).
*No data:* no image → text spans 3–10 at 62ch and the section still reads as designed. No `about_lead` → the small-caps opening moves to the first two words of the body.

**5 · team**
*Desktop:* `repeat(auto-fit, minmax(200px,1fr))`, capped at 4 columns by `--maxw`, `gap:48px 32px`. Each card: portrait plate `aspect-ratio:4/5; overflow:hidden; border-block-end:1px solid var(--line)` (bottom border only — the plate sits on the page like a photograph laid on a ruled sheet), `object-position:center 25%`; 16px below, name in Fraunces 400 20px, `title` in mono 12px uppercase ls .14em `--muted`.
**Contact-sheet stagger:** `@media (min-width:900px){ .member:nth-child(even){margin-block-start:40px} }` — the grid reads as prints laid down by hand. The only place this page is allowed to look imperfect.
**Duotone (Folio graft):** wrapper `isolation:isolate; overflow:hidden`; `img{filter:grayscale(1) contrast(1.06)}`; `figure::after{content:'';position:absolute;inset:0;background:var(--brand);mix-blend-mode:color;opacity:.30;pointer-events:none}`. Cap the grid at 24 portraits (`mix-blend-mode` forces a compositing layer each) and add `content-visibility:auto; contain-intrinsic-size:0 340px` below the fold. `@media (forced-colors:active){figure::after{display:none}}`.
**Count-aware variants** (`data-count` on the wrapper): 1–2 → `repeat(2,1fr); max-inline-size:720px`, plates 3:4, no stagger; 3 → clean 3-up, no stagger; 5+ → auto-fit.
*Mobile:* 2-up, `gap:24px 16px`, stagger removed (it needs 3+ columns to read as intentional), plates 4:5, names 18px. `@media (hover:none){img{filter:none} figure::after{opacity:.12}}` — faces read at rest.
*No data:* no photo → monogram plate. No `title` → the role line is dropped, not left blank.

**6 · reviews**
*Desktop:* `--ink` spotlight, full-bleed, padding `clamp(96px,12vw,168px)`. Kicker IN THEIR WORDS in `--brand-bright`. Sourced aggregate in mono 13px `--muted-dark` (§3.8). **Histogram (Clinical graft, gated at n≥4)** sits in a 300px column at the left: five rows, 2px track `--line-dark`, fill `--warm-safe`, tabular counts. Quotes are a scroll-snap track: `display:flex; overflow-x:auto; scroll-snap-type:x mandatory; gap:clamp(48px,8vw,120px); scrollbar-width:none; overscroll-behavior:contain`, each item `flex:0 0 100%; scroll-snap-align:start`, the quote in columns 2–8 so the band is asymmetric rather than centred. Item order: tick meter + mono `4.9 / 5` → quote in Fraunces 300 `--t-quote`, `--on-ink`, 20em, **no quote glyph, no italics** → 32px `--line-dark` rule → author mono 13px `--on-ink` + date mono 13px `--muted-dark`. Index row below: mono counter `03 / 12` left (a genuine index, so numbering is earned here), 28×1px `--line-dark` ticks right, active 28×2px `--brand-bright`.
*Mobile:* same track, native swipe, quote 24px full-width, histogram collapses into `<details><summary>Rating breakdown</summary>` with the aggregate and tick meter staying visible above it; ticks centre under the track with 44×24px tap targets wrapping the 28×1px visual.
*No data:* ratings all null → aggregate and histogram omitted, quotes only. **n<4 → histogram omitted entirely.** One review → ticks, counter and keyboard handler all omitted, the single quote centred in columns 2–8.

**7 · booking**
*Desktop:* `--paper-2` — a deliberate light clearing between the two dark bands, and the practical choice because the widget is a light surface. **Not centred:** content column `max-inline-size:760px` starting at column 3, so the kicker RESERVE still sits on the Rule. H2 default **"Pick an hour. That's the whole process."** One mono 13px `--muted` line of honest operational detail ("Confirmation is instant. Cancel free up to 24 hours before."). Frame: `border:1px solid var(--line); background:#FFF; padding:8px; min-block-size:620px; color-scheme:light`, iframe inside at `inline-size:100%; border:0; display:block; min-block-size:604px`. A `--paper-2` skeleton with a centred mono "Loading booking…" sits behind it. Always rendered beneath: the fallback line, "Or call {phone}" as a `tel:` link in `--brand-deep`, also wrapped in `<noscript>` prominence.
*Mobile:* full width at the gutters, frame padding 4px, min-height 560px, the "Or call" row a 48px tappable block.
*No data:* widget disabled → the frame is replaced by a 60px filled `--brand` block CTA to the tenant's booking URL, plus the phone fallback. Never an empty band.
*Interaction:* `loading="lazy"` with reserved `min-height`; `:focus-within` puts a 1px `--brand` border on the frame; **no scroll-reveal on the frame** — animating a container whose contents load asynchronously produces a visible double-flash.

**8 · contact**
*Desktop:* `--ink`, 12-col, gap 32px, padding `clamp(88px,10vw,148px)`. Cols 1–4: details stack — mono 11px uppercase `--muted-dark` label over Inter Tight 18px `--on-ink` value; address plain across up to 3 lines; phone `tel:`, email `mailto:`, both with a 1px `rgba(237,233,242,.3)` underline at 4px offset going `--brand-bright` on hover. Cols 6–8: **the hours ledger** — one row per day, `1fr auto`, `padding-block:11px`, `border-block-end:1px solid var(--line-dark)`, day mono 13px, hours right-aligned mono 13px tabular so every colon lines up down the column. Today's row is `--on-ink` while the others are `--muted-dark`, with a 10px `--brand-bright` tick in the left margin (computed server-side from `Property.timezone`). Closed days read "Closed", not an em-dash. Cols 9–12: the map tile at `aspect-ratio:4/3` — an `--ink-2` field, 1px `--line-dark`, a 40px `repeating-linear-gradient` grid in `rgba(237,233,242,.05)` on both axes, a 9px `--brand-bright` dot with a 1px ring at the address point, address in mono 12px bottom-left. The whole tile is an `<a>` to `https://maps.google.com/?q={urlencoded}` with `target="_blank" rel="noopener"` and a mono "Open in Maps ↗" affordance. A tenant-uploaded `settings['map_image']` replaces the field, keeping the link and dot. **No third-party frame** — an outbound navigation is not a subresource, so `frame-src 'self'` holds.
*Mobile:* details → hours → map. **The hours ledger genuinely restructures:** today's row is pinned at the top, full width, in `--on-ink`; the other six collapse into `<details><summary>All hours</summary>` with a 44px summary tap target, the marker replaced by a mono `+` that rotates via `details[open] summary .mark{rotate:45deg}`. Map tile 16:10 with a 48px "Open in Maps" row.
*No data:* no hours → the ledger and the today-tick are omitted and the details stack widens to cols 1–6. No lat/lng and no uploaded image → the CSS plan tile still renders with the address; it is a designed tile, not a placeholder.

**9 · footer**
*Desktop:* `--ink`, continuous with contact, separated by one `--line-dark` hairline (the Rule laid flat). Padding 56px / `calc(40px + env(safe-area-inset-bottom))`. Row 1: wordmark Fraunces 300 20px left; right, the same live mono 13px status line as the hero — "Open today until 19:00" / "Closed today · Opens Tuesday 10:00" — so the page opens and closes on the same honest fact. Row 2 (rule above): Privacy · Terms · Cookie settings · Accessibility in mono 12px uppercase ls .12em `--muted-dark`, gap 28px, 44px min tap height on mobile. Row 3: consent line 11px `--muted-dark`, 68ch — "We use only the cookies needed to run the booking system. Nothing is shared with advertisers." — then `© 2026 {tenant}` left, "Built on BeautyTech" mono 11px at 55% right.
*Mobile:* rows stack, legal links wrap to a 2-column mono grid, `padding-block-end: calc(40px + var(--bar-h) + env(safe-area-inset-bottom))`.
*Consent panel:* **bottom-LEFT card**, 360px, `--paper`, 1px `--line`, radius 0, padding 24px, two 44px buttons ("Accept" filled `--brand`, "Only essential" outlined). Bottom-left is a hard requirement: the chat launcher owns bottom-right. Mobile: `inset-inline:12px; inset-block-end: calc(var(--bar-h) + 12px + env(safe-area-inset-bottom))`. Slides up 16px + fades over 300ms on first visit, dismissed to `localStorage`, re-summonable from "Cookie settings". Under reduced motion it simply appears.
*No scroll-reveal in the footer* — it is already at the end of the page and revealing it is theatre.

### 4.6 Motion

**Load — one sequence, hero only, under 1.8s.** Gate on fonts so the headline never animates mid-swap:
```js
Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 600))])
  .then(() => document.documentElement.classList.add('is-ready'));
```
All keyframes scoped under `.is-ready`, `animation-fill-mode:both`, shared easing `cubic-bezier(.16,1,.3,1)`.

| t | Element | Move |
|---|---|---|
| 0 | wordmark + its hairline | fade, 240ms |
| **80** | **the Rule draws down** | `scaleY(0)→1`, `transform-origin:top`, **900ms** — the page introducing its own signature before any content arrives. The most important beat. |
| 180 | mono eyebrow | fade + rise 8px, 420ms |
| 240 / 310 / 380 | H1's three lines | clipped line reveal — outer span `overflow:hidden;display:block`, inner `translateY(100%)→0`, 620ms. It reads like type being set, not a fade. |
| 300 | hero plate | `clip-path: inset(0 0 100% 0) → inset(0)`, 1100ms, while the `<img>` inside independently settles `scale(1.05)→1` over 1400ms. The offset durations are what make it feel like arriving rather than sliding. |
| 520 | lead | fade + rise 12px, 520ms |
| 600 | CTA row + status line + phone | fade + rise 10px, 480ms |
| 1200 | `--warm` status dot | `opacity .45→1→.45`, 2.4s, infinite — the **only** looping animation on the page, and it exists because it communicates live state |

Nothing else animates on load. Below the fold waits for scroll reveal.

**Scroll reveal:** §3.10, rise 14px, never more. Groups: service rows in batches of 6, team by grid order, contact columns 0/1/2.

**Hover — the page never lifts.** No `box-shadow` token, no `translateY` on hover anywhere. Service row → leader rule `--line`→`--brand`, name `translateX(6px)`, 180ms. Team plate → bottom border `1px --line`→`2px --brand`, inner image `scale(1.03)` over 400ms (**no greyscale-to-colour** — refused by name as the team-section cliché; the duotone lifts instead). Primary CTA → background `--brand`→`--brand-deep` plus a 1px outline at 3px offset, 160ms. Links → underline colour. Map tile → border `--brand-bright`, dot `scale(1.15)`.

### 4.7 Interactive elements, no library

| Element | Implementation | Lines |
|---|---|---|
| Header condense | IntersectionObserver on a 1px sentinel placed immediately after the header, `rootMargin:'-120px 0px 0px 0px'`, toggling `.is-stuck`. No scroll listener, no layout thrash. | 3 |
| Nav active state | Second IntersectionObserver over all `.band`, `rootMargin:'-45% 0px -45% 0px'`, sets `aria-current="true"` on the matching link (also drives the Rule's active tick) | 6 |
| Mobile menu | Real `<button aria-expanded aria-controls>` opening a full-viewport `--paper` index overlay: section names Fraunces 300 32px, each preceded by a mono index and a 12px `--brand` tick, 40ms stagger via `:nth-child()`. Toggles `aria-expanded`, locks body scroll, moves focus to the first link on open and back to the button on close, closes on Escape and on link activation. **No checkbox hack** — the button carries real ARIA state. | 14 |
| Services preview cross-fade | **Pure CSS via `:has()`.** For each row index n (precompiled 1…24): `.svc:has(.svc__row:nth-of-type(n):is(:hover,:focus-visible)) .svc__plate img{opacity:0}` then `… img:nth-child(n){opacity:1}`, `transition:opacity 420ms ease`. Because the trigger includes `:focus-visible`, tabbing drives the plate identically to the mouse. Browsers without `:has()` keep showing the first image — a correct, finished state, but **do not sell a demo on it**. | 0 JS |
| Reviews track | Native scroll-snap (swipe and trackpad work with zero JS). On top: ticks are `<button>`s calling `track.scrollTo({left: item.offsetLeft, behavior: reduced ? 'auto' : 'smooth'})`; a rAF-throttled passive scroll listener updates the counter and active tick; `tabindex="0"`, `role="group"`, `aria-roledescription="carousel"`, ArrowLeft/Right handler; items `aria-label="Review 3 of 12"`. No autoplay — a quiet page does not move things while you read them. | 18 |
| Rule progress | `@supports (animation-timeline: scroll())` → zero JS. Otherwise one rAF-throttled passive scroll handler writing `--p` on `:root`. Feature-detected, listener skipped where CSS handles it. | 7 |
| Hours disclosure | Native `<details>`, `list-style:none` + `::-webkit-details-marker{display:none}`, mono `+` rotating 45° on `[open]` | 0 JS |
| Mobile action bar + launcher offset | §3.9 / §3.6 | shared |

**Total template-specific JS: ~50 lines**, one file, one entry point, no dependencies.

### 4.8 Industry re-skin

Because the Rule is a hairline and the price list is a ruled menu, **this is the most portable of the three** — a ruled menu with leaders is native to a restaurant, and a margin rule with vertical marginalia is native to a clinic, a law firm and an architecture practice.

| Profile | Swaps |
|---|---|
| **medical** | accent → `#0B6F62`/`#22C7A9`; menu becomes the **procedure ledger** (name / duration / "from £", the price cell reading `ON CONSULTATION` where null); team → practitioners, `specialties` becomes a mono credential line under the role; the histogram's honesty rule matters more, not less. Kickers: THE PROCEDURES / THE PRACTICE / YOUR CLINICIANS. |
| **hotel** | accent → `#8A6432`/`#E0B368` (run through `deepen()`); services source → `Room`; the price cell becomes `from £X / night`; the sticky preview plate becomes the room gallery; team → the front-of-house team; contact's hours ledger becomes check-in/check-out plus reception hours. |
| **fitness** | accent → `#1F5FA8`/`#6FB3EE`; services → the **class timetable**, which is the one place `01/02/03` markers become legitimate because a weekly schedule is a sequence — the leader runs from class name to time, and the duration column becomes the day; team → coaches. |
| **restaurant** | accent → `#8C3A2E`/`#E08A6E`; the menu is already correct and needs **no structural change at all** — category grouping becomes courses, the leader is the dish-to-price rule it was designed as. This is the strongest port in the set. |

Unchanged across every profile: the Rule, zero radius, zero shadow, the mono numeral discipline, the monogram device, all nine section shells.

---

## 5. Template 2 — `hot_mauve`

**Name:** Hot Mauve
**Positioning:** For the salon that wants to be the newest place in the city — a fashion-house poster where prices are the largest type on the row and one saturated magenta band is the thing the whole page has been visibly building toward.

### 5.1 Type

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght,SOFT,WONK@0,9..144,400..900,0..100,0..1;1,9..144,400,0..100,0..1&family=Inter+Tight:wght@400;500;600&family=IBM+Plex+Mono:wght@500&display=swap">
```

**This URL is the fix for the direction's single fatal defect.** The original spec's whole typographic thesis is Fraunces at `wght 900 / SOFT 100 / WONK 1`, but its stated URL requested only `ital,opsz,wght`. Unrequested axes are pinned at their defaults, so `font-variation-settings:'SOFT' 100,'WONK' 1` would have done **nothing** and the entire page would have silently rendered as plain Fraunces. Axis ordering in `css2` is: lowercase (registered) axes alphabetically, then uppercase (custom) axes alphabetically — `ital,opsz,wght,SOFT,WONK` — with the value tuples in the same order. Ranges are narrowed to what is actually used (upright 400–900, italic 400 only) to hold the payload down.

**Ship gate:** `curl -sI` the URL, assert 200. A malformed tuple 404s the whole stylesheet and takes Inter Tight and Plex Mono down with it.

Display use is locked to `font-variation-settings:'opsz' 144,'SOFT' 100,'WONK' 1; font-optical-sizing:none`.

| Token | Value | Face |
|---|---|---|
| `--t-display` | `clamp(3.25rem, 13vw, 11.5rem)` 52→184px | Fraunces 900 SOFT100 WONK1, lh .86, ls −.03em |
| `--t-h2` | `clamp(2.5rem, 7.5vw, 5.5rem)` 40→88px | Fraunces 900, lh .92, ls −.02em |
| `--t-h3` | `clamp(1.25rem, 1.6vw, 1.5rem)` | Inter Tight 600, lh 1.25 |
| `--t-price` | `clamp(1.5rem, 2.4vw, 2.25rem)` | Fraunces 700, `font-feature-settings:'tnum'` |
| `--t-mega` | `clamp(6rem, 16vw, 14rem)` | Fraunces 900 tabular — the reviews aggregate |
| `--t-menu` | `clamp(2rem, 11vw, 3.5rem)` | Fraunces 900 — mobile overlay nav |
| `--t-lead` | `clamp(1.125rem, 1.5vw, 1.375rem)` | Inter Tight 400, lh 1.5, 42ch |
| `--t-body` | `1.0625rem` 17px | Inter Tight 400, lh 1.62, 46ch |
| `--t-meta` | `0.8125rem` 13px | Inter Tight / Plex Mono |
| `--t-eyebrow` | `0.6875rem` 11px | Plex Mono 500, uppercase, ls .16em |
| `--t-quote` | `clamp(1.0625rem, 1.4vw, 1.375rem)` | Fraunces 400 **italic**, lh 1.42 |

Fraunces at 900/SOFT 100/WONK 1 grows fat ball terminals and a splayed `g`. Nobody sets Fraunces there — it reads as a bespoke fashion masthead while staying inside the HexaTech family, so the four sub-brands still rhyme.

### 5.2 Tokens (measured)

```css
:root{
  /* neutrals — house ramp retuned off blue-slate onto the mauve hue (~315°). Stated deviation. */
  --paper:#FAF8FA;  --paper-2:#F0EBEF;  --ink:#16101A;  --ink-2:#241A29;
  --text:#1E1622;        /* 16.66:1 on paper */
  --muted:#5E5266;       /* 6.91:1 on paper · 6.20:1 on paper-2 — do not go lighter */
  --on-ink:#FAF8FA;      /* 17.69:1 on ink · 15.84:1 on ink-2 */
  --muted-dark:#B3A2BA;  /* 7.83:1 on ink · 7.01:1 on ink-2 */
  --line:#E2D9E0;  --line-dark:rgba(179,162,186,.20);
  /* vertical accent, split into two safe roles */
  --brand:#9B5C8F;         /* 4.60:1 on paper — large text, rules, links only */
  --brand-deep:#6E3D66;    /* 7.88:1 on paper · 7.07:1 on paper-2 — small accent text, eyebrows */
  --brand-bright:#C77FB4;  /* 6.34:1 on ink · 5.68:1 on ink-2 */
  --brand-halo:rgba(155,92,143,.26);
  /* THE THIRD SURFACE — never a text colour, only a surface */
  --flood:#B4185F;             /* white 6.49:1 · flood on paper 6.14:1 */
  --on-flood:#FFFFFF;
  --on-flood-muted:rgba(255,255,255,.86);  /* composites to 5.12:1 — do NOT lower */
  /* human accent, reviews only */
  --warm:#F0805A;        /* 7.07:1 on ink */
  --warm-safe:#C2512C;   /* 4.41:1 on paper · 3.96:1 on paper-2 — clears the 3:1 graphics floor.
                            The house coral does NOT clear it on a light band and must never be used there. */
  --r:2px; --r-lg:4px;   /* the whole page is rectilinear */
  --shadow:0 14px 34px rgba(30,22,34,.16); --shadow-lg:0 30px 70px rgba(0,0,0,.28);
  --focus-core:var(--ink);
  --pad:clamp(20px,4vw,72px); --maxw:1240px; --gutter:clamp(20px,4vw,40px);
  --rail-w:10px; --header-h:84px; --header-h-condensed:64px; --bar-h:68px;
  --section-y:clamp(72px,10vw,148px); --pad-seam:clamp(56px,7vw,96px);
  --ease:cubic-bezier(.16,1,.3,1);
}
.band--ink{--focus-core:var(--on-ink)}
.band--flood{--focus-core:#FFFFFF}
```

**Deliberate deviations, stated:** (a) **No pills.** House reserves pills for primary CTAs; here the entire page is rectilinear at 2–4px, because a rectilinear system cannot host one soft object, and because it lets the CTA, the Rail and the flood band read as one continuous object. (b) **Neutrals retuned onto the mauve hue** — a blue-black next to a magenta flood makes a muddy tri-hue page.

**Brand weave.** `--flood`, `--brand-deep` and `--brand-bright` all come from `BrandPalette::for()` server-side (§3.4) with literal hex. Optional client-side enhancement only:
```css
@supports (color: oklch(from red l c h)){
  :root{ --flood: oklch(from var(--brand-raw) clamp(.34,l,.52) clamp(.06,c,.20) h) }
}
```
declared **after** the server hex, never instead of it. The brand appears in exactly four places — the Rail, the header Book button, the booking flood band, and hairlines/links inside ink bands. **Admin escape hatch:** "use brand colour for the booking band" defaults **OFF** when the raw brand's OKLCH lightness exceeds 0.60 (yellows, limes), falling back to `#B4185F`. Clamping fixes contrast; it does not fix taste.

**Surface rhythm:** header (transparent → ink) · hero **ink** · services `paper` · about **ink** · team `paper` · reviews `paper-2` · booking **flood** · contact **ink** · footer **ink** continuous with contact. **The `$surfaces` rotation algorithm from the original spec is deleted** — §3.7's two CSS sibling rules do the same job with no server pass, no invariants to get wrong, and no possibility of desync. (J1 called that algorithm "the single most likely thing in the whole batch to be built wrong.")

### 5.3 Signature — **The Rail, and its dissolution**

A chromatic spine down the leading edge of the page that fills as you scroll and then pours sideways into the booking band.

```css
.rail{position:fixed;inset-block:0;inset-inline-start:0;inline-size:var(--rail-w /*10px*/);
      z-index:40;pointer-events:none;background:var(--line-dark)}
.rail__fill{background:var(--flood);transform-origin:top;transform:scaleY(var(--rail,0));will-change:transform}
```

One passive, rAF-coalesced scroll handler writes exactly one custom property — `documentElement.style.setProperty('--rail', scrollY / (scrollHeight - innerHeight))` — and toggles the header's `.is-stuck` in the same frame. **That is the entire scroll cost of the page: one variable write.** No `getBoundingClientRect` in the loop, no per-element transforms, no parallax anywhere.

**Nodes** — a 10×10 `--flood` square at each rendered section, with that section's mono eyebrow beside it in `writing-mode:vertical-rl`, so the leading edge reads like a filmstrip margin labelled SERVICES / ABOUT / TEAM / REVIEWS / BOOK / VISIT. **Drawn per band, using The Ruled Page's donated technique**, not measured by JS:
```css
.band{position:relative}
.band::before{content:"";position:absolute;inset-block-start:0;inset-inline-start:0;
  inline-size:var(--rail-w);block-size:10px;background:var(--flood);z-index:41}
```
This deletes the original spec's JS offset measurement **and** its `ResizeObserver` re-measure — the node cannot drift when a late image changes document height, because it is not positioned by measurement. An IntersectionObserver adds `.is-current` to the in-view band, taking its label from `--muted` to `--flood` (`--brand-bright` inside ink bands).

**The payoff.** The booking section is a full-bleed field of the exact same `--flood`, so when it scrolls in the Rail **stops being visible** — it reads as having poured out sideways and become the band. Reinforced by `.is-flooded` on `<html>` (one IntersectionObserver on `#booking`): labels fade to 0, and the unfilled track turns `rgba(255,255,255,.18)` so even the empty portion disappears. On exit it re-forms. **Zero JS in the merge itself** — the effect is a colour identity, engineered rather than animated. It is the best single idea in the batch and it costs nothing.

**Mobile parity:** the Rail rotates — `position:fixed; inset-block-start:var(--header-h); inset-inline:0; block-size:3px`, `transform:scaleX(var(--rail))`, `transform-origin:left`, no labels, and it performs the identical disappearing act over the flood band. The page's most distinctive element survives at 360px, which is the whole test.

**Reduced motion:** the Rail still fills — it is a position indicator, not decoration — but the fill transition and label crossfade go to 1ms and the merge is instantaneous.

### 5.4 The no-image device — the type-tile

`--ink-2` field on `--ink` (or `--paper-2` on paper), 1px `--line-dark` frame, the subject's name or initials set in Fraunces 900 at `clamp(4rem,10vw,9rem)` — a tonal wordmark. Used in hero, services, team and the locator. Every `<img>` on the page also sits on an `--ink-2`/`--paper-2` box so a slow or broken image is a deliberate block, never a white flash.

### 5.5 Sections

**1 · header** — Sticky, 84px → 64px, `z-index:60`. Full bleed (not constrained to `--maxw`) so the CTA hugs the viewport edge. Grid `auto 1fr auto`. Wordmark Fraunces 900 1.5rem. Nav Inter Tight 500 14px, built server-side from the enabled-section booleans so a hidden section never leaves a dead anchor. CTA right: a 44px `--flood` block, `--on-flood` label, radius 2px. Once stuck the header is ink on **every** band — one state, no per-section colour flipping, which is the fragile thing most templates get wrong. `.is-stuck`: `rgba(22,16,26,.72)` + `backdrop-filter:blur(14px) saturate(1.2)`, guarded by `@supports (backdrop-filter:blur(2px))` with an opaque `--ink` at .94 fallback.
*Mobile:* wordmark + hamburger + the same flood Book block always visible; nav collapses to a full-screen `--ink` **poster** overlay with links in Fraunces 900 at `--t-menu`, stacked, 40ms stagger, focus-trapped, Escape-dismissable.
*No data:* no logo → tenant name in Fraunces 900 stepped down at 18 and 28 characters.

**2 · hero** — Full-bleed `--ink`, `min-block-size:100svh` (svh so the mobile URL bar cannot cause a jump), `grid-template-columns:repeat(12,1fr)`, align-content center.
**The composition:** the H1 is three explicit `<span class="hero__line">` and the key visual is threaded *between* them. Line 1 `grid-column:1/9`. Image `grid-column:7/13; grid-row:1/span 3; aspect-ratio:4/5; object-position:center 30%`. Line 2 `grid-column:1/11; z-index:2` — **it physically crosses in front of the photograph.** Line 3 `grid-column:1/7; z-index:0`, beside it. Legibility is deterministic, not hoped-for: `figure::before` carries `linear-gradient(90deg, rgba(22,16,26,.85) 0%, rgba(22,16,26,.25) 42%, transparent 70%)` and the crossing line gets `text-shadow:0 2px 24px rgba(22,16,26,.55)`.
Below: eyebrow mono `--brand-bright` above the H1; lead `1/5`, `--muted-dark`, 42ch; CTA row `1/6` — primary flood block 60px with an inline arrow SVG, secondary hairline `1px --line-dark` at the same height; then the **promoted phone** (`tel:` in Fraunces 700 at 26px `--brand-bright`, mono "or call" above it). Bottom edge: a mono strip from Property — `{city} · OPEN TILL {close} · WALK-INS WELCOME` — horizontally scrollable on narrow screens.
*Mobile:* order eyebrow → H1 → image → lead → CTAs. Image full-bleed (`grid-column: bleed`), `aspect-ratio:3/4; max-block-size:62svh`, and **the interleave survives** — H1 line 3 overlaps the photo's top edge by `-0.22em` at `z-index:2` while the scrim rotates to `linear-gradient(180deg, rgba(22,16,26,.8), transparent 46%)`. CTAs full-width stacked, 56px each.
*No data:* no hero image → the type-tile, same grid cell, same interleave. **Cap the H1 at three lines server-side**, `text-wrap:balance` on lines 1 and 3, and reject a four-line headline at input with a ~34-chars-per-line guideline and live preview in the admin — a four-line headline must be rejected at input, not handled at render.

**3 · services** — **The Index**, on `--paper`. Not a card grid. `<ul>` of full-width rows, each an `<a>`, separated by `1px solid var(--line)`.
*Desktop ≥1080px:* `grid-template-columns: 11rem minmax(0,1fr) minmax(0,26ch) 7rem 8rem; align-items:baseline; padding-block:clamp(20px,2.4vw,34px)` — [category, mono 11px `--brand-deep`] [name, Fraunces 700 at `--t-price`] [short_description, 15px `--muted`, 2-line clamp] [duration `NN MIN`, mono `--muted`] [price, Fraunces 700 `--t-price`, right, `tnum`]. No category → the first cell is empty and the grid holds. Categories present → a sticky sub-header per group at `top:var(--header-h)` with a 2px `--flood` underline.
**The row wipe:** `::before` at `inset:0; background:var(--ink); transform:scaleX(0); transform-origin:left; transition:transform 420ms var(--ease); z-index:-1` → `scaleX(1)` on `:hover, :focus-visible`; the row's text flips to `--paper`, price to `--brand-bright`, category to `--brand-bright`. Simultaneously the service photo appears as a floating tile: `position:absolute; inset-inline-end:clamp(24px,6vw,96px); inset-block-start:50%; inline-size:260px; aspect-ratio:3/4; transform:translateY(-50%) rotate(-2deg) scale(.94); opacity:0` → `scale(1); opacity:1`, 320ms. The `<ul>` carries `overflow:hidden` so the tile can never produce a horizontal scrollbar.
*Mobile / `@media (hover:none)`:* rows restack as full-width blocks — image (or a `--paper-2` tile bearing the category) as a 16:9 top band, then name left / price right on a shared baseline, then duration + description. `padding-block:24px`, hairlines kept. Row min-height 84px. The information the hover revealed is simply always visible.
*No data:* **no service image → the tile is not rendered and the row instead expands its full description** on a second line, via `grid-template-rows:0fr → 1fr` (400ms). Both states are designed; neither is a fallback. No price → `ON REQUEST` in `--muted`. Rows link to `#booking?service={id}`.

**4 · about** — The one dark feature band house style permits, `--ink`, `min-block-size:90svh`, 12-col. Figure `grid-column: bleed-start / 7` (bleeds to the leading viewport edge via the §3.3 grid, **not** `calc(50% - 50vw)`), `aspect-ratio:3/4; max-block-size:82svh; filter:saturate(.9)`. Over it an offset editorial frame: `::after{inset:18px;border:1px solid var(--brand-bright);opacity:.45}` — costs nothing, reads expensive. Copy `8/13`: mono eyebrow → H2 Fraunces 900 in `--on-ink` → paragraphs at 17px/1.62 `--muted-dark`, 46ch. **No truncation and no column-count** — the copy is customer-written and unpredictable, so the section grows to fit whatever they wrote.
*Mobile:* figure first, full-bleed, `aspect-ratio:4/5`, frame inset 10px; copy below.
*No data:* no image → the figure cell becomes an `--ink-2` type-tile carrying the founding year or city in Fraunces 900, same ratio, same offset frame; the composition is unchanged. Optional `about_quote` renders between paragraphs in Fraunces 400 italic `clamp(1.5rem,3vw,2.25rem)` `--brand-bright` above a 2px `--flood` rule 3ch wide; absent, nothing renders and the spacing closes up.

**5 · team** — **The Reel**, on `--paper`. `grid-auto-flow:column; grid-auto-columns:clamp(240px,26vw,340px); gap:clamp(12px,1.6vw,24px); overflow-x:auto; scroll-snap-type:x mandatory; scroll-padding-inline-start:var(--pad); scrollbar-width:none`, each card `scroll-snap-align:start`. The strip runs past the trailing edge (`grid-column: main-start / bleed-end`) so a partial card always peeks and scrollability is self-evident. Card: portrait `aspect-ratio:3/4; object-position:center 25%; border-radius:2px`; beneath, `name` Fraunces 700 1.375rem, `title` mono 11px uppercase `--brand-deep`, up to three `specialties` as hairline chips.
**Duotone replaces greyscale (Folio graft — the condition J1 put on this set).** The original spec's greyscale-to-colour reel is a cliché that three of its siblings refuse by name. Instead: `img{filter:grayscale(1) contrast(1.06)}` + `figure::after{background:var(--brand); mix-blend-mode:color; opacity:.34}`, resolving to `opacity:0` + `filter:none` on hover/`:focus-within` over 320ms. Same job of unifying photos shot on five different phones, without the dated grey-to-colour reveal. `@media (hover:none){img{filter:none} figure::after{opacity:.12}}`. Per-tenant `team_photo_treatment` flag (`duotone | none`) for salons whose photos are already monochrome; `none` still gets the 4px lift and `--shadow`, so the section never looks unfinished.
*Mobile:* identical reel — already a mobile-native pattern, so parity is free. Card width `clamp(200px,62vw,260px)`, arrows hidden, mono "SWIPE →" hint under the heading.
*No data:* no avatar → type-tile with initials in Fraunces 900 5rem `--brand`. **Fewer than 3 masters → `@class(['team--few' => $masters->count() < 3])`** switches the reel to a static 2-up grid so two stylists never look like a broken carousel. Cap at 24 portraits + `content-visibility:auto`.

**6 · reviews** — **The Big-Number Wall**, on `--paper-2`. Left (`1/5`): the aggregate as a single enormous Fraunces 900 numeral at `--t-mega` in `--ink`, `tnum`, `line-height:.8`; beneath it the **tick meter in `--warm-safe`** (Clinical graft — replacing the five inline-SVG stars, because a real distribution beats a glyph), then `{{ $n }} VERIFIED REVIEWS` in mono, then the sourced line `SOURCE — {{ $form->name }} · {{ $earliest }}–{{ $latest }}` in mono 11px `--muted`. **Below it the histogram, gated at n≥4** — five rows, 2px `--line` track, `--warm-safe` fill, tabular counts.
Right (`6/13`): quotes in `columns:2; column-gap:clamp(20px,2.4vw,40px)`, each `break-inside:avoid; margin-block-end:24px`. Quote in Fraunces 400 **italic** `--t-quote` `--text`; attribution below as name (Inter Tight 600 13px) · date (mono 11px `--muted`). No cards, no borders, no avatars — each quote preceded only by a 2px `--flood` rule 3ch wide. The >700-char review is promoted to a lead slot spanning the full width above the columns (Folio's orphan fix). Bounded server-side at `->latest()->limit(9)`.
*Mobile:* `columns:1`; the aggregate shrinks to `clamp(5rem,26vw,8rem)` and sits on a baseline-aligned flex row beside the tick meter; the histogram goes into `<details>`.
*No data:* **n < 4 → the aggregate numeral and histogram are both suppressed** and the section renders as a quote pair. Anonymous → `anonymous_name` → `'Verified client'`.

**7 · booking** — **The Flood.** Full-bleed `--flood`, `padding-block:clamp(64px,9vw,120px)`. Heading block `1/5` with `position:sticky; top:calc(var(--header-h) + 32px)` so it holds while the widget scrolls past — the whole band feels like one long held note. Eyebrow `--on-flood-muted`, H2 Fraunces 900 in pure `#FFFFFF` (6.49:1), one `--on-flood-muted` lead. Beneath the H2, at the same weight, the **`tel:` link in Fraunces 700 at 2rem `#FFFFFF`** — the Standing Appointment graft, and on this band it is unmissable. Widget `6/13` in a `--paper` panel, `border-radius:4px; box-shadow:var(--shadow-lg); overflow:hidden`, embed per §3.5, light theme.
*Mobile:* heading not sticky; the panel goes near-bleed (`grid-column: bleed` minus 12px) to buy the form every pixel; the persistent bar retracts while this section is in view.
*No data:* widget disabled → a 64px flood-inverse block CTA (white fill, `--flood` label) to the tenant's booking URL. Never an empty band.
*Interaction:* the `.is-flooded` observer (§5.3). Focus ring inside this band is `2px solid #FFF`.

**8 · contact** — `--ink`, `grid-template-columns:1.1fr 1fr; gap:clamp(32px,5vw,80px)`. Left: the address set **HUGE**, Fraunces 400 at `clamp(2rem,4.4vw,3.5rem)`/1.05 in `--on-ink`, one line per line, because a new salon's whole pitch is where it is. Beneath: phone and email as large links (Inter Tight 500 1.25rem `--brand-bright`, `text-underline-offset:6px`). Then hours as a `<dl>` in two columns with **today's row picked out** server-side from `Property.timezone`: a 3px `--flood` left bar, `--on-ink` at 600, and a mono `TODAY` tag. Right: the locator, an `--ink-2` panel at `aspect-ratio:4/3`, wrapped in an `<a>` to `maps.google.com/maps/search/?api=1&query={urlencoded}` — **no map iframe**, because strict CSP forbids the external frame and designing for the constraint beats begging for an exception. Inside: either `settings['map_image']` (`filter:grayscale(1) brightness(.8) contrast(1.1)`) or a pure-CSS street grid (`repeating-linear-gradient` both axes at 32px in `--line-dark`) with a `--flood` inline-SVG pin and the city in Fraunces 700. Both carry an `OPEN IN MAPS ↗` mono label.
*Mobile:* stacked, address first; **hours collapse into `<details>` showing only today's row plus "All hours"** — genuinely different behaviour, not a narrower table.
*No data:* no hours → the `<dl>` and TODAY tag are omitted. No lat/lng and no uploaded image → the CSS grid tile still renders.

**9 · footer** — Continuous with contact on `--ink`, no colour change, only a `1px solid var(--line-dark)` hairline and `padding-block:40px`, so the page ends on one long dark note rather than a fifth surface. Row 1: wordmark Fraunces 900 1.5rem left; legal links right (Privacy, Terms, Cookie Policy, Data Deletion — routes exist) in Inter Tight 500 13px `--muted-dark`, wrapping to a column under 640px. Row 2: consent line mono 11px + a real `<button>` "Cookie settings" styled as an underlined text button. Row 3: "Powered by BeautyTech" mono 11px at 60%. `padding-block-end: calc(40px + var(--bar-h) + env(safe-area-inset-bottom))` on mobile. The Rail terminates at the footer's top hairline with a 10×10 `--flood` square node — the page's full stop. No scroll-reveal.

### 5.6 Motion

**Load — ~1.5s, hero only.** `.is-loaded` on `<html>` inside a double `rAF` on `DOMContentLoaded`; every step is a CSS `transition-delay` off that class, so there is no JS timeline to maintain.

| t | Move |
|---|---|
| 0 | header wordmark + hairline fade, 200ms |
| 80 | mono eyebrow, fade + rise 10px |
| 160 / 250 / 340 | **the three H1 lines bottom-up line-wipe** — `clip-path: inset(0 0 105% 0) → inset(0 0 -12% 0)` plus `translateY(.14em) → 0`, 700ms. This is the page's motion signature and it **recurs on every H2 and on the contact address**, so the whole page has one verb. |
| 420 | hero figure wipes in from the trailing edge, `clip-path: inset(0 0 0 100%) → inset(0)`, 820ms, while the `<img>` counter-scales `1.08 → 1` over 1400ms — a settle, not a Ken Burns loop; it ends and never moves again |
| 640 | lead and CTAs rise 12px, 60ms apart |
| 900 | the Rail draws, `scaleY(0) → scaleY(var(--rail))`, 600ms; the mono availability strip fades in |

Nothing animates on load below the fold.

**Scroll reveal:** §3.10. Headings inside revealed groups swap the plain rise for the line-wipe so the vocabulary stays consistent.

**Scroll-linked — exactly one thing:** the Rail. Section-current state and the `.is-flooded` merge are IntersectionObservers, not scroll math.

**Hover:** CTAs lift 2–4px with a shadow bloom, 150–200ms; service rows wipe to ink over 420ms; team portraits resolve from duotone over 320ms. Every hover state is duplicated under `:focus-visible`.

### 5.7 Interactive elements, no library

| Element | Implementation | Lines |
|---|---|---|
| Rail fill + header condense | One passive rAF-coalesced scroll handler writing `--rail` and toggling `.is-stuck` in the same frame | 9 |
| Rail nodes | Pure CSS `.band::before` (§5.3) — no measurement, no `ResizeObserver` | 0 JS |
| Section-current | IntersectionObserver over `.band`, sets `.is-current` + `aria-current` | 6 |
| Flood merge | IntersectionObserver on `#booking` toggling `.is-flooded` on `<html>`; the merge itself is a colour identity, not an animation | 4 |
| Mobile poster nav | `<button aria-expanded>`, full-screen `--ink` overlay, 40ms `:nth-child()` stagger, first/last-focusable trap loop, Escape closes and restores focus | 14 |
| Team reel arrows | Two 44×44 square buttons calling `reel.scrollBy({left: cardW + gap, behavior: reduced ? 'auto' : 'smooth'})`, `aria-label`'d, disabled at each end by `scrollLeft` check. Native keyboard scrolling preserved via `tabindex="0" role="group" aria-label` on the strip. | 8 |
| Service row wipe | Pure CSS `::before` + `:hover, :focus-visible` | 0 JS |
| Description expand (no-image rows) | `grid-template-rows: 0fr → 1fr` with an inner `overflow:hidden` — no JS, no `max-height` hack, correct for any length | 0 JS |
| Hours disclosure | Native `<details>` | 0 JS |
| Height sync / action bar / launcher | §3.5 / §3.9 / §3.6 | shared |

**Total: ~55 lines**, one file, no libraries, no build step.

### 5.8 Industry re-skin

The narrowest of the three tonally — the flood plus a fat wonky masthead does not become a dental clinic. But it ports structurally, and it is the only chassis in the set that can serve a *loud* vertical.

| Profile | Swaps |
|---|---|
| **fitness** | The strongest port. accent → `#1F5FA8`/`#6FB3EE`, flood → a saturated derivation of it. The Index becomes the class timetable; the Reel becomes coaches; the big-number wall becomes member count or class attendance; the hero interleave is native to gym photography. Fraunces 900 WONK stays — it reads as a training-brand masthead. |
| **restaurant** | accent → `#8C3A2E`/`#E08A6E`. The Index becomes the menu (category cell = course), the row wipe reveals the dish photo, the flood band becomes the reservation moment. Second-strongest port. |
| **hotel** | accent → `#8A6432`/`#E0B368`. Works only for a design/boutique property, not a five-star classic — flag this in the template picker rather than letting a tenant pick it blind. Services → `Room`; the floating tile becomes the room photo. |
| **medical** | **Do not offer.** The flood band and a 900-weight wonky masthead are actively wrong for a clinic. The picker should not list it. |

Unchanged: the Rail and its dissolution, the rectilinear geometry, the interleaved hero, the type-tile.

---

## 6. Template 3 — `standing_appointment`

**Name:** Standing Appointment
**Positioning:** For the neighbourhood independent that lives on regulars — a page built as a stack of hand-torn cotton sheets, where the phone number is set at the same weight as the booking heading because the people who matter most already know the number.

**Amputations from the judged version, stated:** the **hand-drawn hero swash is deleted** (J1: "now a default"; it also duplicates the arch's job and it was the direction's most-templated element). The **grain is demoted to an off-by-default per-tenant flag** — a signature you are prepared to delete under a Lighthouse regression is not a signature, so the deckle now carries the direction alone, and it is strengthened to do so. The **arch is re-motivated as a functional aperture, not an ornament**: it appears only where an image is framed, at exactly three scales, and nowhere else.

### 6.1 Type

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght,SOFT,WONK@0,9..144,300..500,0..100,0..1;1,9..144,300..400,0..100,0..1&family=Inter+Tight:wght@400;500;600&family=IBM+Plex+Mono:wght@500&display=swap">
```
Display sizes set `font-variation-settings:'opsz' 144,'SOFT' 100,'WONK' 0`. **WONK is requested but pinned at 0** — Fraunces at 300 + SOFT 100 is warm and hand-cut without the cocked leg, which at this size tips into whimsy. Small display sizes drop to `'opsz' 24,'SOFT' 60`.

Fallback: `@font-face{font-family:'Fraunces fb';src:local('Georgia');size-adjust:104%;ascent-override:92%}` — the H1 is the LCP element, so this must be verified against real metrics and locked.

| Token | Value | Face |
|---|---|---|
| `--t-h1` | `clamp(2.75rem, 6vw, 5.125rem)` 44→82px | Fraunces 300 SOFT100, lh 1.02, ls −.02em, max 13ch, `text-wrap:balance` |
| `--t-h2` | `clamp(2rem, 4vw, 3.25rem)` 32→52px | Fraunces 400, lh 1.06, ls −.015em |
| `--t-h3` | `1.25rem → 1.625rem` | Fraunces 400 / Inter Tight 600 |
| `--t-lead-in` | `1.1875rem` 19px | Inter Tight 400, lh 1.55 — first about paragraph, review quotes |
| `--t-lead` | `clamp(1.0625rem, 1.3vw, 1.3125rem)` | Inter Tight 400, 46ch, `--muted` |
| `--t-body` | `1.0625rem` 17px | Inter Tight 400, lh 1.62, 52ch |
| `--t-price` | `1.375rem` | Fraunces 400, `font-variant-numeric:tabular-nums` |
| `--t-phone` | `2rem` | Fraunces 300 — **the same weight as the booking H2** |
| `--t-agg` | `3rem` | Fraunces 300 tabular |
| `--t-eyebrow` | `0.75rem` 12px | Plex Mono 500, uppercase, ls .14em |
| `--t-role` | `0.6875rem` 11px | Plex Mono 500, ls .12em |
| `--t-legal` | `0.8125rem` 13px | Inter Tight |

### 6.2 Tokens (measured)

```css
:root{
  /* warm limewash plaster — a STATED deviation from the house cool paper, kept
     low-chroma (~19% sat) specifically to dodge the cream+terracotta cliché the house names */
  --paper:#F1ECE6;  --paper-2:#E7E0D8;  --paper-3:#FBF9F6;  /* linen: the LIGHTEST surface,
                       so cards lift by luminance rather than by shadow */
  --ink:#241C1E;    --ink-2:#32272A;    /* warm plum-black — a warm room needs a warm black */
  --text:#2B2224;        /* 13.18 paper · 11.83 paper-2 · 14.73 linen */
  --muted:#6B5C5E;       /* 5.39 paper · 4.84 paper-2 · 6.02 linen — THE FLOOR, do not lighten */
  --on-ink:#F1ECE6;      /* 14.19 ink · 12.25 ink-2 */
  --muted-ink:#C4B2B4;   /* 8.23 ink · 7.11 ink-2 */
  --line:#DDD3C9;  --line-ink:rgba(196,178,180,.20);
  --brand:#9B5C8F;         /* 4.14 paper · 3.71 paper-2 — graphics and text ≥24px ONLY */
  --brand-deep:#7E4674;    /* 5.93 paper · 5.32 paper-2 · 6.63 linen — all small accent text */
  --brand-bright:#C77FB4;  /* 5.65 ink · 4.88 ink-2 */
  --brand-halo:rgba(155,92,143,.26);
  --warm:#F0805A;          /* 2.25 on paper: the status dot and today's-row marker ONLY */
  --warm-safe:#B4462A;     /* 5.14 on paper — tick meter, histogram fill */
  /* the arch, at exactly three scales and nowhere else */
  --arch-lg:280px; --arch-md:120px; --arch-sm:32px;
  --r-panel:18px;   /* the booking reply card only */
  --shadow-print:0 18px 40px rgba(36,28,30,.10);
  --focus-core:var(--ink);
  --gutter:clamp(20px,5vw,40px); --maxw:1160px;
  --pad:clamp(72px,10vw,140px); --pad-seam:clamp(56px,7vw,96px);
  --header-h:84px; --header-h-condensed:60px; --bar-h:64px;
  --deckle-h:24px;
  --ease:cubic-bezier(.2,.7,.25,1);
}
.band--ink{--focus-core:var(--on-ink)}
```

**Brand weave.** `--brand` is confined to roles where an arbitrary hue cannot break anything: (a) the primary CTA fill (label = `--brand-on`, computed server-side by relative luminance > 0.42 → `#241C1E` else `#FFFFFF`), (b) the section hairline rules, (c) a 10% wash on the booking panel (`--brand-tint`), (d) the duotone tint on team/service/map imagery. **Brand-coloured text never uses the raw token** — it uses `--brand-deep`, which `BrandPalette` has already verified at ≥4.5:1 against `--paper`. If the brand's contrast against `--paper` falls below 2.5:1 (near-white brands) the controller substitutes house mauve entirely.

**Surface rhythm:** header (transparent → plaster + blur) · hero `paper` · services `paper` with `--paper-3` linen on row hover · about `paper-2` · team `paper` · reviews **`ink`** (the one spotlight band — the evening room, lit by `radial-gradient(120% 80% at 50% 0%, var(--brand-tint-a18), transparent 60%)` over ink, like candlelight from above) · booking `paper-2` · contact `paper` · footer **`ink`**. Two ink bands, well separated. §3.7 handles every toggled subset.

### 6.3 Signature — **The Deckle**

Every section boundary is a hand-torn edge, never a straight line. This is now the sole signature and it has been re-engineered so it **cannot be the wrong colour**, which was the original spec's #1 risk.

**The construction.** Each band draws its own tear, upward, in its own surface colour. It therefore never needs to know what precedes it, and toggling any section off cannot break it:

```css
.band { --surface: var(--paper); background: var(--surface); position: relative; isolation: isolate }
.band--paper-2 { --surface: var(--paper-2) }
.band--ink     { --surface: var(--ink) }

.band::before{
  content:""; position:absolute; inset-inline:0;
  inset-block-start: calc(var(--deckle-h) * -1 + 1px);
  block-size: var(--deckle-h);
  background: var(--surface);          /* the band's OWN colour, torn up over its predecessor */
  clip-path: polygon(0 100%, 0 0, 3% 38%, 7% 12%, 11% 61%, 16% 24%, 21% 70%, 25% 33%, 30% 8%,
    34% 55%, 39% 19%, 44% 66%, 48% 29%, 53% 74%, 57% 16%, 62% 48%, 67% 22%, 71% 63%, 76% 31%,
    81% 9%, 85% 57%, 90% 26%, 94% 68%, 97% 35%, 100% 14%, 100% 100%);
  pointer-events:none; z-index:0;
}
.band:nth-of-type(even)::before{
  clip-path: polygon(0 100%, 0 12%, 4% 55%, 9% 21%, 13% 68%, 18% 30%, 23% 9%, 27% 62%, 32% 26%,
    37% 71%, 41% 35%, 46% 14%, 51% 58%, 55% 23%, 60% 66%, 65% 31%, 69% 8%, 74% 52%, 79% 27%,
    84% 70%, 88% 33%, 93% 11%, 97% 60%, 100% 28%, 100% 100%);
}
```

The point lists are **hand-authored and irregular** — that is exactly why they read as torn rather than as a CSS scallop. Two lists alternate so consecutive tears are never identical. Because the tear is a pseudo-element that overlaps upward rather than a clip on the section itself, **no content is ever cut** and `overflow` stays sane. If `clip-path` fails you get a flat edge and the page is still correct.

`--deckle-h` drops `24px → 14px` below 640px so torn edges don't eat scarce vertical space.

**The arch, supporting motif.** One radius family — a salon mirror — at exactly three scales and nowhere else: `--arch-lg` (280px) on the hero portrait, `--arch-md` (120px) on team portraits, `--arch-sm` (32px) on service thumbnails. `border-radius: var(--arch-lg) var(--arch-lg) 8px 8px`. Nothing else on the page is arched, which is what keeps the shape meaningful rather than decorative — and it appears **only where an image is framed**, never as free ornament.

**The grain, per-tenant flag, default OFF.** When `settings['paper_grain']` is true: an inline `<svg width="0" height="0">` in the layout (inline markup, CSP-safe, no data URI, no external request) carrying `<filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.82" numOctaves="4" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter>`, and one fixed overlay at `inset:0; pointer-events:none; z-index:1; contain:strict; filter:url(#grain); mix-blend-mode:multiply; opacity:.06` (`.04` below 820px), wrapped in `@supports (mix-blend-mode: multiply)`. It is static and rasterised once. **Off by default because `filter:url()` plus `mix-blend-mode` on a fixed full-viewport layer forces the browser to re-blend the viewport on every scroll frame** — a real cost on exactly the cheap Androids half a salon's customers hold.

### 6.4 The no-image device — the plaster arch

`--paper-2` field at the slot's aspect ratio and arch radius, with the subject's initial(s) in Fraunces 300 (22vw hero / 2.5rem team / 1.25rem service thumb) in `--brand-tint` — reads as intentional letterpress. Used identically in hero, services, team, about and the map panel.

### 6.5 Sections

**1 · header** — 84px → 60px. Transparent over the hero (which is plaster, so header text is `--text`; no contrast trap, no dark-hero dependency). Stuck: `background: rgba(241,236,230,.86); backdrop-filter: blur(14px) saturate(1.2); border-block-end: 1px solid var(--line)`; wordmark scales to .86, CTA 52 → 44px. Grid `[logo][nav 1fr centered][CTA]`. Wordmark = tenant name in Fraunces 400 opsz 24 SOFT 100 at 1.375rem, replaced by a logo (max-height 32px) if uploaded.
*Mobile ≤820px:* **nav is removed from the header entirely** — logo + "Book" pill only — and navigation duties move to the bottom action bar. This is the sharpest structural decision in the direction: it sidesteps the mobile-nav focus-trap problem the other two must solve, and it puts the two things a phone visitor wants (Call, Book) permanently in thumb reach.
*z-index budget:* grain 1, header 40, bottom bar 50. Everything ours ≤ 60 so the launcher is untouched and always on top.

**2 · hero** — 12-col, `--maxw:1160px`, `min-block-size: min(92vh, 860px)` (deliberately **not** 100vh). Copy cols 1–6. Key visual cols 8–13: a tall **arched portrait**, `inline-size:min(46vw,560px); block-size:min(74vh,700px); border-radius: var(--arch-lg) var(--arch-lg) 8px 8px; object-fit:cover`, flush to the hero's bottom edge so it reads as a mirror set into the plaster wall. Behind it, offset 24px down and 20px toward the leading edge, a bare `--paper-2` block with the same arch radius gives depth with zero assets.
Stack: mono eyebrow (`{city} · est. {year}`, omitted entirely if absent) → H1 → lead 46ch `--muted` → CTA row → status line. CTA row: primary pill (fill `--brand`, label `--brand-on`, 52px, `border-radius:999px`, `::after` content `→`) and a hairline ghost "See the price list" at the same height. Status: a 7px `--warm` dot + mono 12px "Open until 19:00 today", computed server-side; omitted if hours are missing.
**No swash.** The keyword highlight is now a `--brand` 2px underline offset 8px, drawn left-to-right on load — one property, no SVG, and it does not read as a 2023 DTC default.
*Mobile ≤820px:* genuine reorder — eyebrow, H1, **image full-bleed** (`grid-column: bleed`) at `block-size:58vh; border-radius: 200px 200px 8px 8px`, then lead, then CTAs full-width stacked at 56px with the primary first. `display:none` appears nowhere in this design.
*No data:* no image → the plaster arch with the tenant's initial at 22vw. No hours → dot and clause dropped.

**3 · services** — **A typeset price list**, the direction's core refusal. Optional category groups: header in Fraunces 400 1.5rem left with a mono count (`06 TREATMENTS`) right-aligned on the same baseline, separated by a full-width `--line` rule. Each service is one row: `grid-template-columns: 64px 1fr auto auto; align-items:center; column-gap:16px; padding-block:18px; border-block-end:1px solid var(--line)`. Col 1 — a 64px thumbnail at `border-radius: var(--arch-sm) var(--arch-sm) 6px 6px`, duotoned like every other photo. Col 2 — name Inter Tight 600 `--t-h3`, description in a collapsed wrapper below. Between cols 2 and 3, `<span class="leaders" aria-hidden="true">{flex:1; border-block-end:1px dotted var(--line); transform:translateY(-5px); margin:0 12px}` — real menu leader dots. Col 3 — duration mono 12px `--muted`. Col 4 — price Fraunces 400 `--t-price`, tabular, right, `min-inline-size:5ch` so the column is optically flush.
*Mobile ≤640px:* **rows stay rows — a menu is better on a phone than cards are**, and this direction is the only one that argues it out loud. `.leaders{display:none}` (already `aria-hidden`), grid becomes `52px 1fr`, duration + price reflow to a second line as one mono row (`45 MIN · £48`) with the price at Fraunces 1.125rem. Row min-height 62px.
*No data:* no image → plaster arch thumb with the service initial. No price → `—`. No description → the expand wrapper is not rendered. **Because it is a list and not a grid, 1 service and 40 both look finished** — no orphan cell, no ragged final row.

**4 · about** — `--paper-2`. Image cols 1–5, copy 7–12, `align-items:center`. The image is treated as a physical print laid on a table: `aspect-ratio:4/5; rotate:-1.5deg; border:1px solid var(--line); padding:10px; background:var(--paper-3); box-shadow:var(--shadow-print)`; behind it, offset +14px/+14px and `rotate:2deg`, a second empty `--paper-3` rectangle with the same border reads as a second print underneath. CSS only.
Copy: mono eyebrow OUR STUDIO → H2 → prose at 52ch, `--t-body`/1.68; the first paragraph promoted to `--t-lead-in` in `--text`, the rest in `--muted`. **Drop cap** (kept here — it is the one place the direction's warmth earns it, and this template does not refuse it): `.about-copy > p:first-of-type::first-letter{float:left; font-family:'Fraunces'; font-variation-settings:'opsz' 144,'SOFT' 100; font-weight:300; font-size:3.4em; line-height:.82; padding:.06em .14em 0 0; color:var(--brand-deep)}`. This is what makes even average customer-written copy look edited. Optional sign-off: owner's name in Fraunces 300 italic 1.5rem.
*Mobile:* image first at 4:5, rotation eased to −1deg, container `overflow:visible` with 8px extra gutters so the corner never clips; drop cap at 3.1em / 3 lines.
*No data:* no image → the copy column re-centres at 60ch and the drop cap plus sign-off carry it alone.

**5 · team** — `--paper`. `repeat(auto-fit, minmax(200px,1fr)); gap:32px` inside 1160 — up to five across, handles 2 people or 9 without a hole. Each entry is an **arch portrait**, `aspect-ratio:3/4; border-radius: var(--arch-md) var(--arch-md) 8px 8px; object-position:50% 30%`, with **no border, no shadow, no card** — the photograph is the card. Below: `name` Fraunces 400 1.25rem, `title` mono `--t-role` uppercase `--muted`, optional `specialties` line 14px `--muted`.
Duotone: wrapper `isolation:isolate; overflow:hidden`; `img{filter:grayscale(1) contrast(1.04) brightness(1.02)}`; `::after{background:var(--brand); mix-blend-mode:color; opacity:.22}`. **On hover/`:focus-within` the duotone lifts** — `filter:none`, overlay `opacity:0`, 320ms — so the person warms from a toned print into full colour when you look at them. That is the thesis in one gesture. `@media (forced-colors:active){::after{display:none}}`.
*Mobile:* two columns (`minmax(140px,1fr)` at ≤600px), arch radius 80px, gap 20px. `@media (hover:none){img{filter:none} ::after{opacity:.10}}` — faces read at full colour on a phone, with only a whisper of tint left for cohesion. The direction concedes ~half of visitors never see the hover reveal; that is accepted deliberately rather than faked with a scroll trigger that fires unpredictably.
*No data:* no avatar → plaster arch with initials in Fraunces 300 2.5rem `--muted`. Never a grey silhouette icon.

**6 · reviews** — The single `--ink` spotlight, full-bleed, deckled top and bottom, lit by the candlelight radial. Header: mono kicker IN THEIR WORDS → the aggregate in Fraunces 300 `--t-agg` tabular (`4.9 / 5`) → the sourced line in `--muted-ink`. **Histogram, gated n≥4**, five rows, 2px `--line-ink` track, `--warm` fill (7.07:1 on ink — the house coral works here, and this is the section it is reserved for).
The wall: `columns:3; column-gap:32px` (2 at 900px, 1 at 640px), each quote `break-inside:avoid; margin-block-end:32px`. **No cards, no boxes, no carousel.** Each quote: an oversized opening mark in Fraunces 300 3.5rem, `line-height:.6`, `color: color-mix(in oklab, var(--brand-bright) 40%, transparent)` **preceded by a literal hex fallback declaration on the same property** → text in Fraunces 300 *italic* `--t-lead-in`/1.55 in `--on-ink` (≈14:1) → a 40px `--line-ink` hairline → author Inter Tight 500 14px `--muted-ink` and date mono 11px. Rating = the **tick meter** in `--warm`, with `aria-label` and a visually-hidden text equivalent. Clamped server-side to ~320 chars, `overflow-wrap:anywhere` so a hostile review cannot break a column; the >700-char review is promoted to a lead slot above the wall.
*Mobile:* `columns:1`, 28px separation, quotation mark 2.6rem. Because the wall was never a carousel, nothing needs re-engineering for touch.
*No data:* n<4 → histogram suppressed, aggregate reduced to the count. 1 review → the lead slot only.

**7 · booking** — `--paper-2`. The widget is framed, not fought. Left rail cols 1–4, panel cols 5–13.
Rail: mono BOOK → H2 "Pick a time." → three reassurance lines each prefixed with a 14px `--brand` hairline tick ("Free to cancel up to 24h", "You'll get a text reminder", "Pay in the chair") → then, **at equal typographic weight to the H2**, mono "or just call us" above the phone number as a `tel:` link in Fraunces 300 at `--t-phone` `--brand-deep`. A boutique's regulars phone; the design says so out loud. This is the single highest-value decision anyone made across the five directions and it is why this template ships.
Panel: **the perforated reply card (Folio graft)** — `--paper-3` linen, `border:1px solid var(--line); border-radius: var(--r-panel); box-shadow:0 18px 48px rgba(36,28,30,.10); padding:8px; min-block-size:640px` with a scalloped tear at the top edge:
```css
.card::before{content:"";position:absolute;inset:-1px 0 auto 0;block-size:12px;
  background: radial-gradient(circle at 6px 6px, var(--paper-2) 5.5px, transparent 6px) repeat-x;
  background-size:12px 12px}
```
plus a 1px dashed `--line` rule 12px below it. Six lines of CSS and it instantly reads as a card you rip out — the best answer in the batch to housing a widget you don't fully control. Widget embedded per §3.5 with `tpl=standing_appointment`, which gives it `--radius:14px` and the linen ground so its interior finally matches its frame.
*Mobile:* rail stacks above, the `tel:` link promoted to directly under the H2 (people call from phones), panel goes `grid-column: bleed` with `border-radius:0; border-inline:0; min-block-size:720px` — an iframe calendar needs every pixel of width it can get. Perforation retained.
*No data:* widget disabled → a 56px filled `--brand` block CTA plus the phone. The rail's reassurance lines are per-tenant and each is `@if`-guarded.

**8 · contact** — `--paper`. Details cols 1–5, map 6–13. **The address is typeset, not bulleted** — Fraunces 300 1.5rem/1.4 across three lines, because an address deserves typography. Phone and email are links in `--brand-deep`, `text-decoration-thickness:1px; text-underline-offset:4px`, thickening to 2px on hover. Hours are a real `<table>`: `<th>` day mono 11px uppercase `--muted`, `<td>` hours Inter Tight 500 15px tabular, `--line` hairlines between rows, and **today's row marked** — `--paper-3` background, a 2px `--warm` left rule, and a visually-hidden "(today)", matched server-side against `Property.timezone`.
Map: **no Google embed.** A static map tile is fetched once server-side when the address is saved and cached to the tenant's own disk, so at runtime it is a same-origin `<img>` — no external request, no CSP exception, no consent problem. Duotoned to palette (`filter:grayscale(1) contrast(1.1)` + `--brand` `mix-blend-mode:color` at .25), a 10px `--warm` pin dot at the coordinates, and a hairline "Open in Maps" pill linking to `https://maps.google.com/?q=lat,lng` (a navigation, not a subresource).
*Mobile:* details first, map below at 4:3 full-bleed, pill overlaid.
*No cached tile:* the map area becomes a plaster panel carrying the address at 2rem plus the same pill — deliberate, not broken. **The static-map job (address change → fetch → store, with cache invalidation and a licence-compliant tile source) is real backend scope and must be ticketed, not assumed.**

**9 · footer** — `--ink`, deckled top. `grid-template-columns: 2fr 1fr 1fr; gap:48px`. Zone 1: wordmark Fraunces 400 1.375rem + one line of the tenant's own sign-off in `--muted-ink`. Zone 2: Privacy · Terms · Cookies, Inter Tight 400 14px `--muted-ink` (8.23:1), 12px rhythm. Zone 3: "Studio" — short address and a one-line hours summary. Then a `--line-ink` rule and a baseline row: copyright left, consent line right in 13px with "Cookie settings" as a real `<button>` (hairline border, 32px, `border-radius:999px`).
*Mobile:* single column, 32px gaps, and **`padding-block-end: calc(40px + var(--bar-h) + env(safe-area-inset-bottom))`** so the bottom action bar can never cover the legal links.

### 6.6 Motion

**Load — ~1.3s, hero only, three distinct movements and one arrival.**
```css
@keyframes rise{from{opacity:0;transform:translateY(14px)}}
.is-ready .hero > *{animation:rise 600ms var(--ease) both}
```
with `animation-delay` 0 / 70 / 140 / 210 / 280ms on eyebrow, H1, lead, CTA row, status line (via `:nth-child()`, not inline styles).

The arched key visual deliberately does **not** share that move — it **fills upward**, `clip-path: inset(100% 0 0 0) → inset(0)` over 900ms at 120ms delay, like a mirror being uncovered. The sequence closes at 620ms with the H1 keyword's `--brand` underline drawing left-to-right, `transform: scaleX(0) → 1; transform-origin: left`, 520ms (replacing the deleted swash).

**Scroll reveal:** §3.10. Two sections opt out of the generic move:
- **about** settles its two paper "prints" into their final rotations (`rotate: 0deg → -1.5deg` and `→ 2deg` alongside a 14px rise) with an 80ms offset, so they look set down one after the other. The drop cap fades in 120ms behind the first line so it doesn't flash.
- **reviews** assembles column by column via the stagger — the one place the stagger is visible as a composition.

**Deckle reveal:** each band's tear draws itself on scroll-in — `clip-path` is already in play, so instead the band's `::before` animates `opacity 0 → 1` plus `translateY(6px) → 0` over 560ms. Nine torn edges arriving as you descend is the editorial equivalent of a page turn, and it is two properties on one pseudo-element.

**Hover:** cards and pills lift 2px with a shadow bloom, 170ms. **Service rows fade a linen wash only, no lift** — a list shouldn't jump: `.svc-row::before{inset:-8px -16px; border-radius:12px; background:var(--paper-3); opacity:0; transition:opacity 160ms}` → 1, with the price shifting `translateY(-2px)` and taking `--brand-deep`. Team portraits and the map warm from duotone to full colour over 320ms — the same gesture used twice on purpose, which makes it read as a language rather than an effect. Nav and footer links grow an underline from the leading edge via `background-size: 0 1px → 100% 1px`, 180ms.

**Ambient — exactly two loops:** the 2.4s `--warm` status-dot pulse and the 3s map-pin ring, both `box-shadow` only (no layout, no large-area paint). No parallax, no scroll-jacking, no counters, no marquee, no auto-advancing anything.

### 6.7 Interactive elements, no library

| Element | Implementation | Lines |
|---|---|---|
| Header condense | IntersectionObserver on a 1px sentinel at the top of `<body>` toggling `.is-stuck`. No scroll listener, no rAF loop. | 3 |
| Service description expand | `grid-template-rows: 0fr → 1fr` on hover/`:focus-within` with an inner `overflow:hidden`, 260ms. No JS, no `max-height` hack, correct for any description length. Row wrapped in an `<a>` to `#booking?service={id}` so the whole row is one keyboard target and `:focus-within` gives keyboard users the identical reveal. | 0 JS |
| Team duotone lift | CSS `:hover, :focus-within` + `@media (hover:none)` baseline | 0 JS |
| Booking skeleton | A `--paper-2` block with a 1.6s `background-position` sweep behind the iframe; `iframe.onload` adds `.is-loaded` to the panel, fading it out over 240ms. Static 20% hairlines under reduced motion. | 6 |
| Height sync | §3.5, `e.origin === location.origin`, clamped 400–2000 | 11 |
| Nav underline | `background-image: linear-gradient(var(--brand), var(--brand)); background-size: 0 1px; background-position: 0 100%; background-repeat: no-repeat; transition: background-size 180ms` → `100% 1px`. One idiom for every link on the page. | 0 JS |
| Hours / mobile bar / launcher | Native `<details>` / §3.9 / §3.6 | shared |

**Total: ~35 lines** — the lightest of the three, because the deckle, the arch, the duotone, the leaders and the description expand are all pure CSS.

### 6.8 Industry re-skin

Warm plaster and a torn edge port to anything that wants to feel made by hand.

| Profile | Swaps |
|---|---|
| **restaurant** | The strongest port in the whole set. accent → `#8C3A2E`/`#E08A6E`; the price list is already a menu (categories become courses, leaders are native); the arch becomes a doorway/window aperture on the hero; the phone-at-heading-weight is *more* correct for a restaurant than for a salon. The deckle reads as a hand-torn paper menu. |
| **hotel** | accent → `#8A6432`/`#E0B368` — the only one of the three templates whose surface temperature already matches a boutique property. Services → `Room` with the arch on room photography; team → front of house; the reply card becomes the reservation slip; hours become reception hours. |
| **medical** | accent → `#0B6F62`/`#22C7A9`, and **switch `--paper` to the house cool `#F4F6F8`** with `--ink` to `#0E1A24`. Losing the warm plaster costs the direction its thesis, so offer this only for wellness-adjacent practices (physio, osteopathy, dermatology-lite), not for a surgical clinic. Flag it in the picker. |
| **fitness** | accent → `#1F5FA8`/`#6FB3EE`. Weakest port — plaster and torn paper say "hand-made", which is the wrong promise for a gym. Do not offer. |

Unchanged across offered profiles: the deckle, the three-scale arch, the duotone, the leader-dot list, the phone-at-heading-weight, the linen reply card.

---

## 7. Build order and QA gates

**Order.** Build the shared kit (§3) first as `resources/views/templates/_kit/` plus `App\Support\BrandPalette` and the `booking-widget.blade.php` retokenisation. Then `ruled_page` (highest buildability, and it produces the reveal/adjacency/status-line partials the other two consume), then `standing_appointment` (lightest JS), then `hot_mauve` (most JS, most tenant-colour risk).

**Gates — none of these is a note, all are blocking.**

1. **Font URL returns 200.** `curl -sI` each of the three css2 URLs. A malformed axis tuple 404s the stylesheet and takes all three faces down. Hot Mauve's is the one to check twice.
2. **`BrandPalette` unit test** against `#FFFF00 #00FF00 #000000 #FFFFFF #F5F5F5 #7B2D8E #00E5FF #8B0000 null "red"` — every case must emit tokens that pass 4.5:1 for `--brand-deep` on paper and `--brand-bright` on ink, or fall back to the house triple.
3. **Sparse-tenant preview.** Render each template against a fixture with 2 services, 1 master, 3 reviews, no about copy, no images, no hours, placeholders OFF. Every section must look finished or be absent. **This is the state every tenant is in on day one — QA it before the full fixture, not after.** It is the single test Folio would have failed.
4. **Toggle matrix.** Render each template with each section individually disabled, plus the minimum set (header/hero/contact/footer). Assert: no dead nav anchors, no two identical adjacent surfaces without the seam, the signature continuous in every case.
5. **No `vw` in any bleed.** `grep -rn "50vw\|100vw" resources/views/templates/` must return nothing. Then check horizontal overflow at 1280px **with a visible scrollbar** on Windows Chrome.
6. **No inline `style` attributes.** `grep -rn 'style="' resources/views/templates/` must return nothing. Then load with the strict CSP active and check the console for zero violations.
7. **Launcher clearance.** At 390px, with the action bar visible, screenshot with the launcher at both `bottom-right` and `bottom-left` config and at `launcher_size` 44, 56 and 72. Nothing of ours may overlap it and nothing of it may overlap our CTA.
8. **`n < 4`.** Seed 3 reviews. Assert the histogram is absent from the DOM, not merely hidden.
9. **Reduced motion.** With `prefers-reduced-motion: reduce`, every `[data-reveal]` element must be at final opacity and transform on first paint, and both ambient loops must be stopped.
10. **1080p non-retina.** Check Fraunces 300 at 82px on a low-DPI Windows display before ship, not just a MacBook — it can look under-inked, and it is the LCP element on two of the three.

**Known residual risks, accepted:** `:has()` removes the Ruled Page services cross-fade on older webviews (degrades to a correct finished state — do not sell a demo on it); `mix-blend-mode` costs a compositing layer per portrait on all three team sections (capped at 24 + `content-visibility`); Standing Appointment's static-map job is unscoped backend work and until it exists every tenant ships the plaster panel; `animation-timeline` is absent in some engines, so the Ruled Page's CSS-only rail fill silently uses its JS fallback — QA should not report the fallback as a bug.