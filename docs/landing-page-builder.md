# Landing-page builder — current state

**Last verified:** 2026-09-07. Production `main` = `14c2c8e3b` (Laravel Cloud, app `hotel-tech-loyalty`),
which carries every landing commit of `feature/landing-phase-3c` up to and including this document.
Run `git fetch && git log --oneline -3 origin/main` for anything newer; the branch's own history is not
on `main` (deploys are source patches), so compare by content, not by commit list.

This is the canonical description of what exists today. The design specs and plans under
`docs/superpowers/` are historical records of how it got here and are superseded where they differ.

## 1. What the product is

An Enterprise-plan tenant builds one public page per brand in three steps:

1. **Brand** — pick the brand (its name, logo and `primary_color` seed the page).
2. **Design** — pick one of the three owner-drawn templates for that brand's trade.
3. **Configure** — edit copy, photos, section order and the accent colour; publish.

Pages are served on `sites.hexa-tech.uk/{slug}` (`config/landing.php`, `routes/landing.php`), never on an
admin host. The admin SPA runs on six hosts (`config/pwa.php`), all of which may frame the preview.

### The six templates ("kits")

| Vertical | Key | Author's kit source |
|---|---|---|
| beauty | `nocturne_ritual` | `resources/landing-kits/beauty-tech/01-nocturne-ritual/` |
| beauty | `editorial_atelier` | `resources/landing-kits/beauty-tech/02-editorial-atelier/` |
| beauty | `organic_wellness` | `resources/landing-kits/beauty-tech/03-organic-wellness/` |
| dining | `maison_vela` | `resources/landing-kits/hospitality/01-maison-vela/` |
| dining | `luma_garden` | `resources/landing-kits/hospitality/02-luma-garden/` |
| dining | `ember_table` | `resources/landing-kits/hospitality/03-ember-table/` |

The industry picked at signup maps server-side to a vertical (`LandingOnboardingService::industries()`;
orgs with no explicit industry fall back to `IndustryProfile::FALLBACK_INDUSTRY = 'other'`). Only the
designs for that vertical are offered. There is no generic template any more: `ruled_page` was retired on
2026-09-05 by `database/migrations/2026_09_04_090000_retire_ruled_page_landing_template.php`, which moved
the one live page onto `nocturne_ritual` additively (existing sections and content kept).

Every kit is pixel-matched to the author's original at 1440 wide (same document height, every
`[data-block]` at the same y). The kit's `:root` stylesheet ships **verbatim**: `public/landing/<key>.css`
is the author's `style.css` followed by our appended block, and each per-template render test compares the
shipped file against the author's source in `resources/landing-kits/`. Palettes, type pairings and tones do
not exist; the only theme override is `theme.brand_color`, applied through `App\Support\Accent`.

## 2. Where the code is

**Server**

- `routes/landing.php` — `GET /{slug}` (`landing.show`) and the signed `GET /preview/{page}`; both behind
  `landing.security` and a throttle.
- `app/Http/Controllers/Landing/LandingPageController.php` — `show()`, `preview()`; builds the booking URL,
  chat frame URL and feedback URL for the templates.
- `app/Http/Middleware/LandingPageSecurity.php` — the CSP (`script-src 'self'`, nonce-based `style-src`,
  `'self'` fonts), the widget frame allowlist (`WIDGET_FRAME_PATHS`, including `/chat-frame/`), and
  `adminOrigins()` (every admin host may frame the preview).
- `app/Landing/` — `SectionType` (the section catalogue: ids, repeatability, view, fields, image slots,
  limits), `PageContent` (everything a template reads, incl. `bookingMode()` and `imageUrl()`),
  `ThemeRules` (accepts only `brand_color`; refuses unknown keys), `IndustryProfile` (per-industry kickers
  and labels), `Copy` (escaped headings, wordmark, `lines()`), `Money` (`format($amount, $currency, $suffix)`
  → `€92 per guest`), `TemplateImage` (kit photo as slot default; Remove = restore), `ContactDetails`,
  `PreviewDraft` (the unsaved-draft stash for live preview).
- `app/Services/Landing/LandingOnboardingService.php` — the **template registry** (`TEMPLATES`: label,
  description, supports, vertical; `renders`/`fixed_blocks`/`photo_blocks` derived from which partials
  exist), industries, section seeding (`seedSectionsFor`), and what the wizard/editor are served.
- `app/Http/Controllers/Api/V1/Admin/{LandingOnboardingController,LandingPageController,LandingPageSectionController}.php`
  — the admin API under `routes/api.php` (`Route::prefix('landing-pages')`, around line 1289).
- `app/Support/Accent.php`, `app/Support/AssetVersion.php` (content-hash `?v=` on landing assets).
- Models `LandingPage`, `LandingPageSection`, `LandingPageRedirect`; tables from
  `2026_08_21_100000_create_landing_pages_table.php`; the retired design's `landing_page_sections.tone`
  column was dropped by `2026_09_06_190000_drop_tone_from_landing_page_sections.php`.
  The menu rows are `Service` rows (`app/Models/Service.php`, edited on the Services screen and its admin
  `ServiceController`); their per-row `service_window` and `price_is_from` columns come from
  `2026_09_06_180000_add_menu_row_fields_to_services.php`, whose backfill ticks every row in scope of a
  page that had written a band `price_prefix` on a design that printed the word (all but Nocturne Ritual,
  which never read it), so no page lost a word it showed. Two consequences are by design: a restaurant page
  that had written both a prefix and a suffix now prints its starting prices without the suffix, the
  authors' composition; and a row assigned to no brand sits in every brand page's scope, so a mark set
  for one page shows wherever the organisation's other pages list that row.

**Templates**

- `resources/views/landing/<key>/layout.blade.php`, `header.blade.php`, `sections/*.blade.php`;
  `resources/views/landing/shared/` (JSON-LD partial, kit icon).
- `public/landing/<key>.css`, `public/landing/<key>/assets/`, `public/landing/thumbs/<key>/*.svg`,
  `public/landing/kit.js` (one shared script), `public/landing/fonts/` (self-hosted woff2).
- Block contract: 15 `data-block` types (announcement, header, hero, trust, services, story, gallery, team,
  testimonials, faq, booking, contact, feedback, assistant, footer); restaurants drop `team`. Integration
  hooks: `data-action="open-booking"` (+`data-service-id`), `data-action="open-feedback"`,
  `[data-ai-widget-slot]`.
- Blade rule: `{{ }}` only (no raw echo); no inline `style=` or `<script>` (the CSP blocks them).
  Compile-order landmines are documented in the layouts (`@endif@if` never compiles; a literal `@php`
  inside a `{{-- --}}` comment swallows the file).

**Frontend** (`frontend/src/pages/landing/`)

- `LandingWizard.tsx` + `LandingBrandStep.tsx` — brand → design → configure.
- `LandingEditor.tsx` — three tabs (Content / Design / Publish via `?tab=`), collapsed section cards,
  drag-and-drop ordering, add-a-block rails, photo Replace/Restore, gallery strip, FAQ form.
- `DesignPanel.tsx` — accent colour only. `LandingPreview.tsx`, `livePreview.ts`, `previewBridge.ts`,
  `previewFreshness.ts` — live preview. `editorSections.ts` (`fieldsForType`, `FIELD_PRESENTATION`,
  `stripImageLeaves`, `safeImageUrl`), `editorCatalog.ts` (`TemplateOption`), `sections.ts`,
  `landingDraft.ts`, `industryChoices.ts`, `seoCard.ts`, `imageDownscale.ts`, `publishAddress.ts`,
  `landingAccess.ts`, `wizardGate.ts`, `builderShape.ts`, `featuredReviewFeedback.ts`, `LandingTeardown.tsx`.
- Labels live in `frontend/src/i18n/locales/{en,de,es,fr,ru}/common.json`;
  `localeCompleteness.test.ts` fails when a locale drifts.

## 3. Rules that keep it correct (the recurring bug class)

**One source of truth.** The section catalogue (`SectionType`) is *served* to the editor by
`LandingOnboardingService`; the editor derives everything (sections, fields, renders, photo blocks,
supports, vertical) from that payload. Nothing is mirrored in TypeScript. Editor field controls come from
`fieldsForType()` and `FIELD_PRESENTATION` keyed by field name — a new leaf needs a catalogue entry and a
label, never a hardcoded list. `ThemeRules` is the single allowlist for theme keys. The industry→vertical
mapping is server-side.

**Images have one writer.** Image leaves are a finite allowlist (56–59 slots). The API strips image leaves
from content writes (`stripImageLeaves`); uploads go through the media endpoints; kit photographs are the
default for every slot and "Remove" restores the kit photograph. Local dev must never write to the
production bucket (`MEDIA_DISK=public`, `DO_SPACES_*` commented out locally).

**Booking is capability-gated, not industry-gated.** `PageContent::bookingMode()` returns `'stay'`,
`'appointment'` or `null`: appointment needs an active brand-scoped Service linked to an active
ServiceMaster who has an active schedule. The appointment flow is the `/services-widget` iframe opened via
a button (never an inline iframe on the page), bound by `widget_token` only, with deep links
`&service={id}&master={id}&source=landing`. Without a bookable tenant the templates fall back to a
`tel:` call-to-book link.

**The chat widget is isolated.** The landing CSP would shred the widget's inline styles, so it runs in
`/chat-frame/{widgetKey}` inside a template-owned launcher.

**Live preview renders real Blade.** The editor POSTs the unsaved draft, the server validates it with the
real rules, stashes it for 90 s (shared cache required: `CACHE_DRIVER=database`), and the landing host
renders it from a non-persisted model through a signed URL. There is no JavaScript re-render.

## 4. Content model in one screen

- Sections: at most 16 per page, 6 instances per repeatable type (`SectionType::MAX_*`). Order is the
  tenant's; the editor never regroups it.
- Text leaves per section come from the catalogue. Restaurants' gallery cards carry `caption_M` (tile
  title) and `caption_M_note` (the line of prose); Editorial Atelier's tiles carry `caption_M_label`, the
  word after the derived ordinal ("01 / Layers"); 8 image slots per gallery. Each of these is offered
  only on the designs whose partial prints it (`LandingOnboardingService::LEAF_READERS`).
- Services band: rows come from the Services screen (never from content). Each row carries its own
  `service_window` ("Fri–Sun · 12:00", printed where the author put a window: a priceless row's value
  cell on Vela and Ember, every card's meta cell on Luma) and `price_is_from` (a starting price: the word
  before the money and no suffix, "From €48"). The band leaves are the words: `price_prefix` is the word
  for marked rows (blank prints the kit author's own, "From" on the restaurants and "from" on the beauty
  lists), `price_suffix` follows fixed prices only ("€125 per guest"), `window` is the fallback for a row
  with no window of its own, and `item_cta_label` is the per-row Book chip. The band word never marks a
  row by itself.
- Booking chrome (header, footer, floating button) says each author's own words until the tenant writes
  `booking.cta_label`.
- Ember Table's `01 / Lunch` menu label comes from `Service.category`.
- Prices: `Money::format()` — `£145`, not `145.00 GBP`; trailing-symbol currencies use NBSP.

## 5. Tests

Suites: `tests/Feature/Landing/` (30 files), `tests/Unit/Landing/` (6), `tests/Unit/Support/` (8).
Baseline after the menu-row batch (2026-09-06): **1349 backend tests** (Feature/Landing 1060, Unit/Landing 117,
Unit/Support 172); frontend `npx vitest run` **780 passed + exactly 3 pre-existing `plannerMeta` failures**;
`npx tsc -b` clean.

Run them like this, and only like this:

```bash
# pinned PHP: the PATH php (8.3) silently breaks JSON request bodies
/c/wamp64/bin/php/php8.4.20/php.exe artisan view:clear      # after any blade change
/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Unit/Support/
/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Unit/Landing/
/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Landing/
cd frontend && npx tsc -b && npx vitest run
```

Never run a bare `php artisan test` (the full suite segfaults on facade mocks). Run tests in the foreground
and read the summary line; an `artisan test` piped through other tools hides the exit code.

## 6. Deploy recipe (merging to `main` IS deploying)

Laravel Cloud watches `hotel-tech-loyalty:main`, runs `migrate --force`, and **rebuilds the SPA itself**
(the served bundle hash will not match a local build — verify by content). Never push the feature branch to
`main` and never ship the feature branch's committed `frontend/dist`/`public/spa`.

1. `git worktree add ../Hexa-Tech-deploy -B deploy/<name> origin/main`; **robocopy** `vendor` into it
   (a junctioned vendor makes PHPUnit test the main tree); copy `.env`; a junction for
   `frontend/node_modules` is fine.
2. Build the file list from `git diff --name-status <last-deployed-tip> <tip>`; guard it against a
   landing-only allowlist (never `database/migrations/` or `frontend/src/` as whole directories — the branch
   carries unshipped non-landing commits, see §8). Apply A/M with `git checkout <tip> -- <file>` and
   **D with `git rm`** (plain checkout is overlay mode and never deletes). Always include
   `resources/landing-kits/` when kits changed.
3. Parity: `git diff --cached <tip> -- <paths>` must be empty, deletions included. Commit.
4. Tests on the artifact (the three chunks above), then `cd frontend && npx tsc -b && npx vitest run &&
   npm run build`, commit `frontend/dist public/spa resources/spa-shell`.
5. `git push origin deploy/<name>:main`.
6. Verify by content, never by status code: `https://sites.hexa-tech.uk/hexa-academy` must serve a kit
   stylesheet with zero `rp-` markers; retired files must 404; the live admin bundle
   (`https://app.hexa-tech.uk/` → `/spa/assets/index-*.js`) must contain a string only the new source has.
7. Remove the worktree: `cmd /c rmdir` any junction **first**, then `git worktree remove`.

Ops note: an admin tab left open across a deploy must be reloaded before saving a landing page, because the
server refuses theme keys the old bundle still sends.

## 7. Open items (as of 2026-09-06)

- The acceptance seed has no bookable rota, so the booking band never appears in screenshot runs.
- Legacy `theme.palette` / `font_pairing` keys on live rows are inert and wash out on the next save: the
  update endpoint drops any non-allowlisted key the row already stores when a client echoes it back (a
  key the row never stored is still refused), and the editor sends only `brand_color`. Until 2026-09-07 the
  editor echoed the raw stored theme and every save of such a page failed with "Validation failed".
- Cyrillic display faces are absent for some kits (Google publishes none); hospitality icon coordinates
  drift 1–3 px from the author's. (`og:image` resolves the same hero-then-logo chain on all six layouts;
  the earlier "nocturne-only" note was stale.)
- Stock photo library for tenants (owner decision D1 left kit photographs as defaults for now).

## 8. Unshipped, local-only work on this branch (not landing)

Deploys are source patches, so the branch's commit history is never on `main` and
`git log origin/main..feature/landing-phase-3c` is meaningless as a "what is undeployed" list. Compare by
content instead:

```bash
git diff --name-status feature/landing-phase-3c origin/main -- . ':(exclude)frontend/dist' ':(exclude)public/spa' ':(exclude)resources/spa-shell' ':(exclude)*.png' ':(exclude).playwright-mcp' ':(exclude).superpowers'
```

On 2026-09-06 that lists **37 source files** (the two sides' committed SPA builds and 15 junk files —
stray PNGs, `.playwright-mcp/` snapshots — are excluded above). Every landing path is identical. The 37 are
unshipped, local-only work from 2026-08-13..17 that no remote has, dominated by **email deliverability and
compliance**: `app/Mail/*` (`SendsAsVenue`, venue identity on every guest mail), `MailIdentityService`,
`CampaignRateLimiter`, `SendNotificationCampaignChunk`, `EmailSuppression` + `BlockSuppressedRecipients` +
`Webhooks/SesWebhookController`, `config/mail.php`, `config/services.php`, `bootstrap/app.php`,
`AppServiceProvider`, the migrations `2026_08_14_090000_create_email_suppressions_table.php` and
`2026_08_14_100000_remove_dead_byo_smtp_settings.php`, `docs/EMAIL_DELIVERABILITY.md`, plus
`RequireStaffCapability` middleware, `Settings`/`Notification`/`Member`/`Referral`/`WalletPass` controller
changes, `HotelSetting`, `frontend/src/pages/Settings.tsx`, `portal/PortalJoin.tsx`, and seven feature
tests. It was **deliberately not deployed** with the landing work and needs its own review, its own
deploy, and a production check of the SES webhook and mail identity settings before it ships.

## 9. Local-only records (gitignored, on the workstation)

`.superpowers/sdd/2026-08-26-landing-phase-3c-plan-a-design/` holds the execution ledger (`progress.md`,
with every ruling), the 66 KB `template-fidelity-plan.md` (rulings R1–R8, decisions D1–D7), one report per
phase, the improvements batch report and its adversarial review, and 1440-wide screenshots of each kit
against the author's original. Read `progress.md` first when picking the work up.
