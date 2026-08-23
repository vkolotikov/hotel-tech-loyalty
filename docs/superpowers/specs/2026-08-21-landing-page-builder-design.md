# Industry Landing-Page Builder — Design

**Status:** approved in outline, awaiting review of this document
**Date:** 2026-08-21
**Plan tier:** Enterprise only

Appendices, both produced by reading the codebase rather than from memory:

- **A — Integration brief** (`…-appendix-a-integration.md`): every subsystem this touches, with `file:line` references, and an explicit list of what could not be confirmed.
- **B — Template build spec** (`…-appendix-b-templates.md`): the three template designs, developed from five independent directions scored by three judges.

---

## 1. The problem

A salon, clinic or studio signs up, gets a working chatbot, booking engine and loyalty programme — and has nowhere to put them, because it has no website. Today the answer is "embed our widgets on your site", which assumes a site.

The goal is a customer with no web presence publishing a real, credible page in about ninety seconds, with our tools already wired into it, using data they have already entered.

**The insight that shapes everything:** almost none of the content needs to be typed. `Service` already holds name, description, price, duration, image and gallery. `ServiceMaster` holds practitioners. `Property` holds address, phone, email and city. The brand colour and logo exist. So the wizard's job is *confirm and arrange*, not *compose*. That is what makes this a contained feature rather than a website builder.

---

## 2. Decisions

| # | Decision | Why |
|---|---|---|
| 1 | Served from a **dedicated host**, path-based: `sites.hexa-tech.uk/{slug}` | See §6. Not negotiable on security grounds. |
| 2 | **Fixed sections, toggleable**, never reorderable | Guarantees design quality; keeps the injection surface small; makes three templates realistic. |
| 3 | **Three industry-adaptive designs**, `beauty` profile first | A template is a design; an industry profile is a layer of defaults on top. Adding `medical` later is authoring one data file. |
| 4 | **Live data, stored copy** | Change a price, the site is right immediately. Bespoke copy changes only on publish. |
| 5 | Rendered as **server-side Blade** | Real HTML for crawlers — the entire point for a business with no site. No JS bundle, cacheable, and existing widgets embed unchanged. |
| 6 | Reviews are **explicitly curated** by staff | There is no approval flag today (§5.3). Auto-publishing every submission would put one-star complaints on a customer's website. |
| 7 | Opening hours read from **`ChatWidgetConfig.business_hours`** | The only customer-facing hours we hold. See §5.2 — this corrected an earlier error. |

### Decisions that changed during design

Two things I asserted early were wrong, and the corrections are load-bearing.

**Hosting.** The original plan put pages on `app.hexa-tech.uk`. Then the integration map established, and I verified, that the admin SPA stores a Sanctum bearer token in `localStorage` (`frontend/src/stores/authStore.ts:92`), that the token never expires (`config/sanctum.php:45` — `'expiration' => null`), and that it carries full abilities, because every `createToken()` call passes no ability array and Sanctum then defaults to `['*']`. Same-origin JavaScript can read `localStorage`. A page whose whole purpose is rendering customer-supplied content therefore cannot share an origin with the admin. Escaping and CSP reduce the odds; they do not change the consequence.

**Reviews.** I described reviews as rendering live. `ReviewSubmission` has no `is_public`, `is_approved` or `is_featured`, and no Review model has any publish concept. "Live" would have meant publishing every submission, including anonymous one-star ones, the moment a customer pressed Publish.

---

## 3. Scope

**In:** three templates; the `beauty` industry profile; a four-step wizard; a two-pane editor; draft/preview/publish; `/{slug}` rendering on a dedicated host; the `landing_pages` Enterprise entitlement; review curation (`is_featured` + a toggle).

**Out, deliberately:** custom domains (designed for, not built — §6.4); more than one industry profile; reordering sections; rich text or raw HTML; multi-page sites; A/B testing; form builders beyond the existing lead-form embed.

---

## 4. Data model

Two new tables. No new content tables — that is the point.

### `landing_pages`

| Column | Notes |
|---|---|
| `id`, `organization_id`, `brand_id` | `BelongsToOrganization` + `BelongsToBrand`, so tenancy is inherited, not reimplemented |
| `slug` | **globally unique**, not per-tenant — `/{slug}` is one shared namespace |
| `template_key` | `ruled_page` \| `hot_mauve` \| `standing_appointment` |
| `industry` | snapshot of `Organization::normaliseIndustry()` at creation; the customer may override |
| `status` | `draft` \| `published` |
| `published_at`, `first_published_at` | |
| `theme` (json) | font pairing choice, palette choice, logo media id, hero media id |
| `content` (json) | per-section written copy, keyed by section |
| `seo` (json) | title, description, OG image id |

One page per brand in v1 — enforced by a unique index on `(organization_id, brand_id)`. A multi-brand tenant gets one page per brand, which is the natural unit.

**Slug rules.** Lowercase, `[a-z0-9-]`, 3–63 chars, no leading or trailing hyphen. A reserved list blocks `api`, `admin`, `login`, `spa`, `assets`, `storage`, `www`, `sites`, plus every value in `Organization::INDUSTRIES`. Slug changes keep the old slug as a 301 for 90 days, in a `landing_page_redirects` table — a business that has printed the URL should not lose it.

### `landing_page_sections`

`landing_page_id`, `key`, `enabled`, `sort`, `content` (json).

Rows are seeded from the template's manifest when the page is created. Storing `sort` rather than reading it from the template means a later template revision cannot silently reorder someone's live page.

### Review curation

One column on `review_submissions`: `is_featured` (boolean, default false, indexed with `organization_id`). One toggle in the existing reviews screen. The public query filters on it.

---

## 5. Content sources

### 5.1 Live, from existing tables

| Section | Source | Absent when |
|---|---|---|
| Services | `Service` where `is_active` | no active services |
| Team | `ServiceMaster` where `is_active` | no active practitioners |
| Reviews | `ReviewSubmission` where `is_featured` | fewer than 1 featured |
| Contact | `Property` (address, phone, email, city) | never — required by the wizard |
| Offers | `SpecialOffer` where active | no live offer |

**A section with no data is omitted entirely, never rendered empty.** On a live customer site that is the difference between "considered" and "broken".

### 5.2 Opening hours — corrected

Hours are not on `Property`. Two sources exist and they mean different things:

- `ChatWidgetConfig.business_hours` — customer-facing; drives the chat widget's offline message.
- `crm_settings.business_hours_profile` — the staff workday; drives the Planner. Publishing this as opening hours would be wrong.

The page reads `ChatWidgetConfig.business_hours`. The wizard lets the customer confirm or edit it and **writes back to the same field**, so the website and the chat widget can never disagree. No third source is introduced.

### 5.3 Reviews — curated, and honest about it

Text comes only from `is_featured` submissions, presented as *selected testimonials*, not as "our reviews". The aggregate is computed from **all** submissions and states its source in words.

Appendix B makes one rule mandatory across all three templates: **if fewer than four reviews exist, the aggregate is suppressed entirely.** A rating distribution drawn from three rows is misleading, and a business's first week is exactly when the temptation to show one is strongest.

Presenting a filtered subset as though it were the whole is an unfair commercial practice under UK CMA and EU consumer rules. Curation plus honest labelling plus an unfiltered aggregate is defensible; "we show our 4★+ reviews" without saying so is not.

### 5.4 Stored on the page

Hero headline and subtext, about copy, section headings the customer overrode, chosen images, SEO fields. These change only on publish.

---

## 6. Hosting, routing and security

### 6.1 The host

```
sites.hexa-tech.uk/glamour-salon
```

One DNS record, one certificate. The admin SPA is **never** served on this host — that is the entire security control, and it must be enforced, not assumed: the landing routes are registered under `Route::domain()`, and the SPA catch-all is constrained to exclude that host.

### 6.2 What the separate origin buys

`localStorage` is per-origin. On a dedicated host there is no admin token to steal, no `loyalty-auth` blob with capability flags, no readable `XSRF-TOKEN`, and no same-origin `fetch('/api/v1/...')`. The worst case for an XSS collapses from *full tenant compromise* to *defacement of one customer's page*.

### 6.3 Controls the page carries

- **No sessions.** These routes skip `StartSession`. Today every anonymous visit to a public page starts a session and sets cookies (`hotelloyalty_session`, `XSRF-TOKEN`) before any consent — wasteful, and poor under GDPR on a marketing page.
- **A real CSP.** There is no security-header middleware anywhere in the application today; the only CSP in the repo is `frame-ancestors *` on widget routes, which restricts nothing about script execution. These routes get `default-src 'self'`, an explicit `script-src`, `style-src` with a per-request nonce, `img-src` including the DO Spaces host, and `frame-ancestors 'none'`. Plus `X-Content-Type-Options: nosniff` and `Referrer-Policy: strict-origin-when-cross-origin`.
- **No raw HTML.** Not one `{!! !!}`. `resources/views` currently has zero, and that record is worth keeping.
- **Colours normalised** through `App\Support\CssColor` (shipped 2026-08-20 in response to a live reflected CSS injection found while designing this).
- **Rate limiting.** Public web routes are entirely unthrottled today. These get a named bucket, because each render runs several queries.
- **Cache headers.** Short and revalidating. The widget's one-year immutable cache once made it unfixable in the field; the SPA shell had to be corrected the same week.

### 6.4 Custom domains later

A `landing_page_domains` table (`landing_page_id`, `hostname`, `verified_at`, `cert_status`) is designed now and unused. Adding custom domains becomes another hostname resolving to the same renderer, not a migration of every published page.

---

## 7. Industry model

**Do not create a new taxonomy.** `Organization::INDUSTRIES` already defines nine ids — `hotel`, `beauty`, `medical`, `restaurant`, `legal`, `real_estate`, `education`, `fitness`, `other` — with `INDUSTRY_ALIASES` already normalising `hospitality` → `restaurant`, `GTM_INDUSTRIES` naming the four with their own domains, and `DEFAULT_INDUSTRY = 'hotel'`. A parallel list of "template industries" is precisely the drift that produced two separate bugs in the week this was designed.

A template is a design. A profile is a layer of defaults:

```
Template  layout, typography, motion, section order    industry-agnostic
Profile   vocabulary, defaults, placeholder imagery    one per industry
```

| Industry | Services called | People called | Primary CTA |
|---|---|---|---|
| `beauty` | Treatments | Therapists | Book appointment |
| `medical` | Procedures | Practitioners | Request appointment |
| `hotel` | Rooms & Services | — | Check availability |
| `fitness` | Classes & Memberships | Trainers | Book a class |
| `restaurant` | Menu | — | Reserve a table |

v1 authors `beauty` only. Priority after that follows `GTM_INDUSTRIES`.

---

## 8. Templates

Three ship. Full build specs — tokens with measured contrast, section-by-section layouts, motion, and the no-library implementation of every interactive element — are in Appendix B.

| | `ruled_page` | `hot_mauve` | `standing_appointment` |
|---|---|---|---|
| For | The established quiet studio | The new city salon | The neighbourhood independent |
| Surface | Cool paper | Mauve-black + magenta flood | Warm greyed plaster |
| Signature | The Rule — a margin hairline acting as index, ruler and spine | The Rail dissolving into a flood band | The deckle — hand-torn section edges |
| Loudness | Whisper | Shout | Speaking voice |
| Primary conversion | Widget | Widget | `tel:` |

No two share a palette, a type register, a signature, or a customer.

**The constraint that decided the shortlist:** none of the three depends on photography to look distinctive. A fourth direction scored higher with two of three judges and was cut for exactly that reason — its distinctiveness rested on images the customer supplies *later*, which is to say it collapsed on launch day. Each template instead has a no-image device: a monogram plate, a type-tile, a plaster arch.

Mandatory in all three, and worth naming because they are commercial rather than decorative: the phone number set at booking-heading weight with `tel:` in the mobile action bar; the `n < 4` review suppression; a rating distribution drawn from real rows rather than a row of gold stars; and repositioning — never restyling — the existing `#htchat-launcher`.

---

## 9. Wizard and editor

Most users are inexperienced. That has to change the design, not just the wording.

### Wizard — four steps

1. **Pick a look.** Three cards, each rendering a real preview containing *their* business name, services and colour. They are choosing between three versions of their own page, not three abstractions.
2. **Check your details.** Prefilled from `Property`. Mostly they press Continue.
3. **Make it yours.** Logo, colour prefilled from the brand, three curated font pairings shown as specimens. Never a font dropdown.
4. **Choose what to show.** Section toggles labelled in plain English with their source — *"Treatments — 12 from your Services"*.

**An empty section is never offered as a choice.** No featured reviews means the reviews toggle is off and says why.

### Editor — two panes, no canvas

A drag-and-drop canvas is the thing inexperienced users struggle with most. Left: section list with inline fields. Right: live preview, desktop/mobile toggle. Clicking a section in the preview opens its fields; editing a field scrolls the preview to it. Autosave to draft; publishing stays deliberate.

The word "slug" never appears. It is "Web address", shown whole with a Copy button.

Conventions to follow are in Appendix A §7 — the `ChatbotWizard` step shell, the save-status indicator, the shared card/button/input class names, react-query mutation patterns, and `t()` throughout so it lands in all five languages.

### Placeholder imagery

Customer images come later. Each profile ships curated placeholders so a page looks finished on publish day, and the editor marks them plainly as placeholders so nobody mistakes them for their own.

---

## 10. Plan gating

`landing_pages`, Enterprise only. The mechanism exists: `RequireFeature` middleware, `Organization::hasFeature()` reading cached entitlements, `useSubscription().hasFeature()` hiding the UI. Appendix A §3.2 has the repeatable checklist.

Two gotchas from that section worth repeating here: the frontend `hasFeature` returns `true` on localhost before it reads anything, so local testing proves nothing about gating; and the feature catalog lives in the SaaS backend, which is **not checked out here**, so the key must be added there in a separate migration or every org will simply lack it.

The public renderer is **not** gated — a page must not vanish because a card expired mid-month. Downgrade unpublishes at the next billing event, with notice.

---

## 11. Delivery phases

This is too large for one implementation plan, so it is deliberately cut into
four. Each phase gets its own plan, and each ends with something real rather
than with scaffolding.

**Phase 1 — Renderer and one template.** The host, `Route::domain()` routing,
both tables, the `landing_pages` entitlement, security headers, draft/preview/
publish, and `ruled_page` with the `beauty` profile. No admin UI at all: a page
is created and edited through the API. Ends with a real page live on
`sites.hexa-tech.uk`.

This is deliberately first. Everything load-bearing and everything risky lives
here — origin isolation, tenancy in the public query layer, the CSP, the
section-omission contract. Proving it before any UI exists means the wizard is
built against a renderer already known to work, and it fails cheaply if the
hosting assumptions turn out wrong.

**Phase 2 — Wizard and editor.** The four-step wizard, the two-pane editor,
media upload, the `is_featured` column and its toggle in the reviews screen,
and the entitlement gating in the SPA.

**Phase 3 — Templates two and three.** `hot_mauve` and `standing_appointment`,
purely additive once the shared build kit has carried a template to production.

**Phase 4 — Further industry profiles.** `medical`, `hotel`, `restaurant`,
following `GTM_INDUSTRIES`. Data authoring, no new code.

The natural stopping point is the end of phase 2: a customer can produce and
publish a page. Phases 3 and 4 widen the offer without changing the machine.

---

## 12. Testing

Follow the repo's conventions, which are unusual and non-negotiable here: `DatabaseTransactions` plus a `SetsUpMinimalSchema` composition, never `RefreshDatabase` — the 137 production migrations do not run on sqlite.

Coverage that matters:

- Slug uniqueness, reserved words, and the redirect after a slug change.
- **Tenancy:** a page renders only its own org's services, staff and reviews. Cross-tenant leakage is the worst failure available here.
- Every section absent when its data is absent — asserted per section.
- Only `is_featured` reviews appear; aggregate suppressed below four.
- Draft is not reachable at the public URL; the signed preview is, and expires.
- The security headers are actually present on the response.
- The admin SPA is **not** served on the landing host.
- Entitlement: a non-Enterprise org cannot reach the admin endpoints.

**Two local-environment hazards to know before starting.** The full `php artisan test` run segfaults on this machine — run in chunks. And local PHP is 8.3.6 while `symfony/var-dumper` calls `ReflectionProperty::isVirtual()` (8.4+), so *any* failing test crashes the reporter instead of naming the failure. Both cost real time during the CSS-injection fix. Fixing the PHP mismatch would pay for itself.

---

## 13. Risks

| Risk | Response |
|---|---|
| Customer content on a page we host reflects on us | Dedicated origin, CSP, no raw HTML, curated reviews |
| A tenant publishes a page then edits a service and breaks a section | Sections omit rather than empty; preview before publish |
| Slug squatting across tenants | Global uniqueness, reserved list, 63-char cap |
| Three templates become three forks | One shared build kit (Appendix B §3); templates are tokens plus layout only |
| Profiles drift from `Organization::INDUSTRIES` | A test asserts every profile key is a valid industry id |
| SEO value never materialises | Server-rendered, JSON-LD `LocalBusiness`, per-page meta, sitemap |

---

## 14. Open questions

1. **Wildcard vs single host.** `sites.hexa-tech.uk` needs one certificate. Confirm Laravel Cloud issues it for an added domain without extra work.
2. **The SaaS feature catalog schema** is unverified — that repo is not checked out here (Appendix A §9.7).
3. **Placeholder imagery licensing.** Curated stock needs a licence permitting redistribution to customers. Not yet sourced.
4. **Cookie consent.** The page embeds our chat and booking widgets. Whether they set cookies before interaction determines whether a consent banner is required, and that has not been established.

---

## 15. Follow-ups this design surfaced but does not fix

Recorded so they are not lost:

- `X-Frame-Options: ALLOWALL` with `frame-ancestors *` on the widget routes.
- No CSP anywhere in the application.
- `hotel_settings.primary_color` accepts any string — `SettingsController::update` validates it as no more than `present`. Render-time normalisation now contains it; write-time validation is still absent.
- Admin Sanctum tokens never expire and carry `['*']`. This is the single largest security exposure found, and it is what forced decision 1.
