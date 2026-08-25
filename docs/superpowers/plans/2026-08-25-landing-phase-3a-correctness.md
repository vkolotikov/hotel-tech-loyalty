# Landing Phase 3a — Correctness and Reachability — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Contact details editable inside the builder with Property fallback; all nine industries speak their own vocabulary; the hotel-shaped booking widget appears only on hotel pages; Landing Pages becomes a nav group; the Phase 2 locale gaps close.

**Architecture:** One new value object (`ContactDetails`) replaces the raw `?Property` on the live view-model, resolving field-level overrides stored in the page's existing `content` JSON. Industry data is authored into the existing `IndustryProfile` shape — no new code paths. The booking gate rides the one shared `has()` switch Phase 2 established. Frontend work is additive fields plus a nav group.

**Tech Stack:** Laravel 13 (pinned PHP 8.4.20 locally), React 18 + TS, react-query v5, i18next, vitest (node-env — component rendering untestable; extract pure functions).

**Spec:** `docs/superpowers/specs/2026-08-25-landing-phase-3a-correctness-design.md`

## Global Constraints

- **The live renderer must not move for untouched pages.** A page with no `content.contact` key renders byte-identically (nonce-normalised) before and after Task 1; a hotel page keeps its booking band through Task 4. Prove both by execution with `php artisan view:clear` between renders.
- **A public page must never 500 on stored data.** Hostile shapes written via `DB::table()->update()` (arrays, objects, 200k strings in the new leaves) must render 200. `ScalarLeaves`/`ScalarTree` exist for exactly this.
- The word **"slug" never reaches a tenant**; no default Laravel validation message may surface for landing fields — custom messages as done in Phase 2.
- Admin API prefix `/v1/admin/…`; no `withoutGlobalScopes()` on any admin path; brand resolution only through `LandingPageGuard` (never a bare `first()`, never `BrandScope` trust — this defect shipped six times in Phase 2).
- Frontend: surface token `bg-dark-surface`; no hardcoded hex in admin chrome except previewed customer data; all calls via shared `api` (auto-attaches `brand_id` — never manual); no optimistic updates; i18n inline-default `t('key', 'Fallback')` everywhere **and every new key added to all five locale files** (en, de, es, fr, ru).
- **Every fix ships with a test proven by mutation** — break the code, watch the named test go red, restore. A test that stays green under its mutation gets strengthened or deleted, and the report says which.
- Environment (each cost an hour in Phase 2): never bare `php artisan test` (segfaults; scope always); pinned binary `/c/wamp64/bin/php/php8.4.20/php.exe` (PATH php is 8.3.6 and silently no-ops JSON PUT/POST bodies while returning 200); no bash heredocs with backslashes; prefer Edit over `python -c` (LF→CRLF hazard); `view:clear` after any Blade touch; vitest is node-env only.
- Baselines that must not drop: backend landing scope (`tests/Feature/Landing/ tests/Unit/Landing/ tests/Unit/Support/`) **498 passed / 1650 assertions**; `tests/Feature/Auth/` + `Middleware/` per-file **45**; frontend vitest **384 passed** (+3 pre-existing `plannerMeta` failures, unrelated).

---

## File Structure

- Create: `app/Landing/ContactDetails.php` — the resolved contact facts, one place.
- Modify: `app/Landing/PageContent.php` — construct `ContactDetails`, widen `has('contact')`, gate `count('booking')` by industry.
- Modify: `app/Landing/IndustryProfile.php` — eight new profiles, fallback → `other`, schema types.
- Modify: `resources/views/landing/ruled_page/{layout,sections/hero,sections/contact,sections/booking,sections/footer,sections/services}.blade.php` — mechanical `contact` reads; hero CTA fallback.
- Modify: `app/Services/Landing/LandingOnboardingService.php` — prefill effective contact; apply stores edited contact fields.
- Modify: `app/Http/Controllers/Api/V1/Admin/LandingOnboardingController.php` — contact validation rules.
- Modify: `frontend/src/pages/landing/LandingWizard.tsx` (step 2 fields), `LandingEditor.tssx→tsx` contact inputs, `frontend/src/components/Layout.tsx` (group), five `frontend/src/i18n/locales/*/common.json`.
- Tests: `tests/Unit/Landing/ContactDetailsTest.php` (new), `tests/Feature/Landing/{PageContentTest,RuledPageRenderTest,RuledPageSectionsTest,LandingOnboardingTest,LandingSeoTest}.php` (extend), `tests/Unit/Landing/IndustryProfileTest.php` (new or extend), `frontend/src/components/Layout.landingSidebar.test.tsx` (extend).

---

## Task 1: ContactDetails — overrides with Property fallback, on the live renderer

**Files:**
- Create: `app/Landing/ContactDetails.php`
- Modify: `app/Landing/PageContent.php` (constructor property, `for()` around line 112, `has()`/`count()` at ~423)
- Modify: the six Blade files listed above (rename-only except where noted)
- Test: `tests/Unit/Landing/ContactDetailsTest.php`, extend `tests/Feature/Landing/PageContentTest.php`, `RuledPageRenderTest.php`

**Interfaces:**
- Produces: `ContactDetails` with readonly `?string` fields `name, phone, email, address, city, country, currency, timezone` and factory `ContactDetails::resolve(?Property $property, array $overrides): self`. `PageContent::$contact` becomes non-nullable `ContactDetails`.
- Consumed by Task 2 (prefill/apply) and Task 4 (booking blade's phone read).

**The discovery the spec missed, now binding:** consumers read eight fields, not three — `layout.blade.php:191-193` (address/city/country for JSON-LD postal address), `:262/:266-267` (name/telephone/email), `services.blade.php:37` (currency), plus `timezone` via hours handling, `hero.blade.php:25` and `footer.blade.php:15` (name), `booking.blade.php:25` (phone), `contact.blade.php:28+`. `ContactDetails` therefore carries all eight; overrides apply **only** to phone/email/address, the rest pass through Property verbatim.

- [ ] **Step 1: Write the failing unit test**

```php
<?php

namespace Tests\Unit\Landing;

use App\Landing\ContactDetails;
use App\Models\Property;
use PHPUnit\Framework\TestCase;

class ContactDetailsTest extends TestCase
{
    private function property(): Property
    {
        $p = new Property();
        $p->name = 'Maison Mimi';   $p->phone = '+371 111';
        $p->email = 'hi@mimi.lv';   $p->address = '1 Elm St';
        $p->city = 'Riga';          $p->country = 'LV';
        $p->currency = 'EUR';       $p->timezone = 'Europe/Riga';
        return $p;
    }

    public function test_an_override_wins_for_its_field_only(): void
    {
        $c = ContactDetails::resolve($this->property(), ['phone' => '+371 999']);

        $this->assertSame('+371 999', $c->phone);
        $this->assertSame('hi@mimi.lv', $c->email);     // untouched field: Property
        $this->assertSame('Riga', $c->city);            // pass-through field
    }

    public function test_a_blank_override_falls_back_rather_than_blanking_the_page(): void
    {
        $c = ContactDetails::resolve($this->property(), ['phone' => '   ', 'email' => '']);

        $this->assertSame('+371 111', $c->phone);
        $this->assertSame('hi@mimi.lv', $c->email);
    }

    public function test_overrides_work_with_no_property_at_all(): void
    {
        $c = ContactDetails::resolve(null, ['phone' => '+371 999']);

        $this->assertSame('+371 999', $c->phone);
        $this->assertNull($c->name);
        $this->assertNull($c->currency);
    }

    public function test_non_string_overrides_are_ignored_not_fatal(): void
    {
        $c = ContactDetails::resolve($this->property(), ['phone' => ['x'], 'email' => 7]);

        $this->assertSame('+371 111', $c->phone);
        $this->assertSame('hi@mimi.lv', $c->email);
    }
}
```

- [ ] **Step 2: Run to verify it fails** — `php artisan test tests/Unit/Landing/ContactDetailsTest.php` → FAIL, class not found.

- [ ] **Step 3: Write the class**

```php
<?php

namespace App\Landing;

use App\Models\Property;

/**
 * The contact facts a landing page publishes, resolved once.
 *
 * Two sources answer "what is this business's phone number": the tenant's
 * Property row, and per-page overrides typed into the builder (stored under
 * content.contact). Before this class, blades read the Property directly,
 * which is why the wizard could only say "go edit it somewhere else" - and
 * why that somewhere was misnamed. Field-level precedence lives here and
 * nowhere else: an override wins for its own field; a BLANK override is
 * absence, not erasure, so clearing a field in the builder falls back to
 * the Property instead of blanking the public page.
 *
 * Only phone, email and address are overridable - they are what a tenant
 * needs to correct per-page. The rest (name, city, country, currency,
 * timezone) pass through the Property untouched; JSON-LD and the services
 * currency read them and must keep meaning "the business", not "this page".
 *
 * Overrides arrive from a schemaless JSON column, so resolve() treats any
 * non-string as absent rather than fatal - the public page must degrade,
 * never 500 (the ScalarLeaves/ScalarTree lesson from Phase 2).
 */
final class ContactDetails
{
    public function __construct(
        public readonly ?string $name,
        public readonly ?string $phone,
        public readonly ?string $email,
        public readonly ?string $address,
        public readonly ?string $city,
        public readonly ?string $country,
        public readonly ?string $currency,
        public readonly ?string $timezone,
    ) {}

    public static function resolve(?Property $property, array $overrides): self
    {
        $pick = static function (string $key) use ($property, $overrides): ?string {
            $o = $overrides[$key] ?? null;
            if (is_string($o) && trim($o) !== '') {
                return trim($o);
            }
            $p = $property?->{$key};
            return is_string($p) && trim($p) !== '' ? $p : null;
        };

        return new self(
            name:     is_string($property?->name) ? $property->name : null,
            phone:    $pick('phone'),
            email:    $pick('email'),
            address:  $pick('address'),
            city:     is_string($property?->city) ? $property->city : null,
            country:  is_string($property?->country) ? $property->country : null,
            currency: is_string($property?->currency) ? $property->currency : null,
            timezone: is_string($property?->timezone) ? $property->timezone : null,
        );
    }
}
```

- [ ] **Step 4: Run to verify it passes.**

- [ ] **Step 5: Wire into PageContent.** In `for()` (around the `$contact = self::preferOwnBrand(...)` block ending `->first();`), keep the Property query exactly as is, then wrap:

```php
$contact = ContactDetails::resolve(
    $contactProperty,                                       // the ->first() result, renamed
    is_array($page->content['contact'] ?? null) ? $page->content['contact'] : [],
);
```

Change the constructor property to `public readonly ContactDetails $contact` (non-nullable — resolve() always returns an instance). Update `has('contact')` at ~:423 from `contact !== null && (filled(address) || filled(phone))` to:

```php
'contact' => (filled($this->contact->phone)
    || filled($this->contact->email)
    || filled($this->contact->address)) ? 1 : 0,
```

**Byte-parity note this creates, handle deliberately:** email-only Properties previously did NOT render the contact band; now they do. That is the spec's intent. The parity fixture in Step 7 therefore uses a phone+address Property (the normal case, identical before/after), and a separate new test pins the email-only widening as intended behaviour, not drift.

- [ ] **Step 6: Update the blades — mechanical.** Every `$content->contact?->X` becomes `$content->contact->X` (object now non-null; fields still nullable so `??` chains behave identically). Files and lines: `layout.blade.php:59,191-193,262,266-267,277`, `hero.blade.php:25`, `footer.blade.php:15`, `booking.blade.php:25`, `services.blade.php:37`, `contact.blade.php:28` onward. `contact.blade.php` also reads hours via the chat config — untouched. Run `php artisan view:clear`.

- [ ] **Step 7: Feature tests.** Extend `PageContentTest`: overrides reach the rendered band; blank override falls back; JSON-LD `telephone` reflects an override while `addressLocality` still comes from Property. Extend `RuledPageRenderTest`: (a) parity — publish a page with phone+address Property and NO `content.contact`, capture bytes at merge-base... impractical mid-branch; instead assert against a golden capture taken BEFORE Step 5 lands (implementer: render and save the bytes in the test as the expected value before wiring, the Phase 2 technique); (b) hostile shapes — write `content.contact` as `["phone"=>["x"]]`, `"just a string"`, an object, a 200k string via `DB::table()`; page and preview stay 200; (c) email-only Property now renders the band (pins the widening).

- [ ] **Step 8: Mutations.** (1) Swap `$pick` precedence (Property before override) → the override test AND the rendered-band test go red. (2) Revert `has('contact')` to the old two-field form → the email-only test goes red. (3) Make `resolve()` return null-everything on missing Property → `test_overrides_work_with_no_property_at_all` red. Report each.

- [ ] **Step 9: Run the landing scope; commit** — `git add` the five PHP/Blade paths + tests; message: `Landing contact details resolve overrides before the Property`.

---

## Task 2: Contact editable in the wizard and editor

**Files:**
- Modify: `app/Services/Landing/LandingOnboardingService.php` (prefill + apply), `app/Http/Controllers/Api/V1/Admin/LandingOnboardingController.php` (rules)
- Modify: `frontend/src/pages/landing/LandingWizard.tsx` (step 2), `frontend/src/pages/landing/LandingEditor.tsx` (contact section fields)
- Test: extend `tests/Feature/Landing/LandingOnboardingTest.php`; extend `frontend/src/pages/landing/landingDraft.test.ts` if the draft shape gains fields

**Interfaces:**
- Consumes: `ContactDetails` (Task 1). Prefill's `prefill.phone/email/address` become **effective** values (`ContactDetails::resolve` output), not raw Property.
- Produces: apply/update accept `contact: {phone?, email?, address?}`; stored under `content.contact` **only for fields the tenant actually edited** (differ from the effective prefill) — untouched fields store nothing, so Property remains their source of truth.

- [ ] **Step 1: Backend failing tests** (in `LandingOnboardingTest`):

```php
public function test_apply_stores_only_the_contact_fields_the_tenant_edited(): void
{
    $this->makeProperty(['phone' => '+371 111', 'email' => 'hi@mimi.lv']);

    $this->postJson('/api/v1/admin/landing-pages/onboarding', $this->validApply([
        'contact' => ['phone' => '+371 999', 'email' => 'hi@mimi.lv'],
    ]))->assertCreated();

    $stored = LandingPage::first()->content['contact'] ?? [];
    $this->assertSame(['phone' => '+371 999'], $stored,
        'Unedited fields must not be frozen into the page - the Property stays their source of truth.');
}

public function test_prefill_contact_reflects_page_overrides_once_a_page_exists(): void
{
    $this->makeProperty(['phone' => '+371 111']);
    $this->makePage(['content' => ['contact' => ['phone' => '+371 999']]]);

    $this->getJson('/api/v1/admin/landing-pages/onboarding')
        ->assertOk()->assertJsonPath('prefill.phone', '+371 999');
}
```

(`validApply()` = the existing helper payload; add it if the file uses inline payloads.)

- [ ] **Step 2: Run → fail. Step 3: Implement.** Controller rules (custom messages so no default text leaks — Phase 2 rule):

```php
'contact.phone'   => 'nullable|string|max:64',
'contact.email'   => 'nullable|string|email|max:191',
'contact.address' => 'nullable|string|max:191',
```

Service: `prefill()` builds effective values via `ContactDetails::resolve($property, $pageOverrides)`; `apply()` diffs submitted contact against effective prefill and stores only changed, `filled()` values under `content['contact']`. The admin `update()` path needs no rule change (`ScalarLeaves(depth: 2)` already admits `contact.phone` leaves) — but verify the editor's PUT round-trips.

- [ ] **Step 4: Frontend.** Wizard step 2: `SummaryRow`s for phone/email/address become inputs (verbatim `input`/`label` classes), prefilled from `prefill.*`, wired into the form state and `buildPayload()` as `contact:{...}` (only when differing from prefill). Replace the three dead-end hints; the header link becomes `t('landing_pages.wizard.open_properties', 'Open Properties')` → `/properties`. Editor: the Contact section gains the same three inputs bound through the existing `update()`/`content.contact` path, plus caption `t('landing_pages.editor.contact_caption', 'Filled from your Properties screen — edit here to override for this page.')`. Every new key into all five locales.

- [ ] **Step 5: Verify** — backend scope green; `npx tsc -b`; vitest ≥384. **Step 6: Mutations** — (1) apply stores unedited fields too → the only-edited test red; (2) prefill ignores overrides → the reflects-overrides test red. **Step 7: Commit** — `Contact details editable in the landing builder`.

---

## Task 3: Nine industry profiles, authored

**Files:**
- Modify: `app/Landing/IndustryProfile.php`
- Test: `tests/Unit/Landing/IndustryProfileTest.php` (create or extend existing coverage — check `tests/Unit/Landing/` first)

**Interfaces:** none new — same shape, more data. Consumed everywhere `IndustryProfile::for()` already is.

- [ ] **Step 1: Failing tests**

```php
public function test_every_platform_industry_has_an_authored_profile(): void
{
    foreach (\App\Models\Organization::INDUSTRIES as $id) {
        $this->assertArrayHasKey($id, IndustryProfile::all(),
            "Industry '{$id}' silently inherits another industry's vocabulary.");
    }
}

public function test_an_unknown_industry_falls_back_to_other_not_beauty(): void
{
    $p = IndustryProfile::for('cryptozoology');
    $this->assertSame('Services', $p->servicesLabel);
    $this->assertNotSame('Treatments', $p->servicesLabel);
}

public function test_education_speaks_education(): void
{
    $p = IndustryProfile::for('education');
    $this->assertSame('Courses', $p->servicesLabel);
    $this->assertSame('Instructors', $p->peopleLabel);
}

public function test_aliases_resolve_before_profile_lookup(): void
{
    $this->assertSame(
        IndustryProfile::for('restaurant')->servicesLabel,
        IndustryProfile::for('hospitality')->servicesLabel,
    );
}
```

- [ ] **Step 2: Run → fail. Step 3: Author the data.** Add the eight profiles to `all()` using **exactly** the spec §4.2 table and kicker lists (final copy — do not improvise). `defaultSections`: `['hero','services','about','team','reviews','contact']` for all new profiles, hotel additionally `'booking'` (after `reviews`); beauty unchanged. Change the `for()` fallback line `$all[$id] ?? $all['beauty']` → `$all[$id] ?? $all['other']` and update its comment. Extend the `schemaType()` mapping (read its current mechanism first) with: hotel `Hotel`, medical `MedicalClinic`, restaurant `Restaurant`, legal `LegalService`, real_estate `RealEstateAgent`, education `EducationalOrganization`, fitness `ExerciseGym`, other `LocalBusiness`. Profiles without booking in `defaultSections` omit the `booking` kicker; verify the layout's kicker read tolerates the missing key (`?? null` or equivalent) — if it does not, make it.

- [ ] **Step 4: Contrast property test.** Extend the existing `AccentTest` 262k-sample property to iterate every authored accent as the brand input, asserting zero WCAG failures — the accents are fallbacks the machinery must handle.

- [ ] **Step 5: Mutation** — point education's labels at beauty's → `test_education_speaks_education` red; restore. Delete `other` from `all()` → the fallback test red (proves it exercises `other`, not a coincidence). **Step 6: landing scope green; commit** — `Every industry speaks its own language on its landing page`.

---

## Task 4: Booking only where its widget fits

**Files:**
- Modify: `app/Landing/PageContent.php` (`count('booking')`), `resources/views/landing/ruled_page/sections/hero.blade.php` (CTA target)
- Modify: `app/Services/Landing/LandingOnboardingService.php` if the unavailable-reason copy lives there (`SECTION_COPY`)
- Test: extend `RuledPageSectionsTest`, `RuledPageRenderTest`, `LandingOnboardingTest`

**Interfaces:** consumes `IndustryProfile` (Task 3) — the gate reads the **page's** resolved industry, the same value `PageContent` already carries for kickers.

- [ ] **Step 1: Failing tests.** (a) An education page with a booking section row enabled renders **no** `data-section="booking"` and no booking iframe, on real response bytes; (b) a hotel page renders both (the parity half); (c) education hero CTA is `href="#contact"` when contact renders, and absent when contact is off too; (d) onboarding `sections` reports booking `available: false` for education with the reason string, `available: true` for hotel.

- [ ] **Step 2: Run → fail** (education currently renders the band — the hero comment itself documents `has('booking')` as unconditionally true).

- [ ] **Step 3: Implement.** `PageContent`: booking count becomes `$this->industry === 'hotel' ? 1 : 0` (use the already-resolved industry field/profile — read the class first; do not re-derive from the org). Hero (`hero.blade.php:46-47`): the current guard `@if ($sections->firstWhere('key','booking')?->enabled)` becomes the same two-part test the section loop uses — row enabled AND `has('booking')` — with an `@elseif` on the contact row (enabled AND `has('contact')`) emitting `href="#contact"`, else no button. `contact.blade.php` must carry `id="contact"` on its section element — check, add if absent. Reason copy via the existing per-section source/reason mechanism: "Online booking currently supports hotel stays. Your '{primaryCta}' button will point visitors at your contact details instead." (i18n'd on the frontend surface, verbatim from the backend if the reason travels in the payload — follow where `source_label` strings live today.)

- [ ] **Step 4: Mutations** — hardcode booking count to 1 → tests (a) and (d) red; drop the hero `@elseif` → test (c) red. **Step 5: `view:clear`, landing scope green; commit** — `Show the booking widget only where its questions make sense`.

---

## Task 5: Nav group and locale completeness

**Files:**
- Modify: `frontend/src/components/Layout.tsx` (nav array — follow the existing group shape at :80-:165), five `frontend/src/i18n/locales/*/common.json`
- Test: extend `frontend/src/components/Layout.landingSidebar.test.tsx` (the Phase 2 SSR harness); add a locale-completeness vitest

- [ ] **Step 1: Failing SSR test** — an entitled org's sidebar renders a group labelled by `nav.groups.landing_pages` containing links `/landing-pages` and `/reviews`; the lapsed-tenant treatment from Phase 2 (`_lapsed` anchor) still holds inside the group (extend the existing cohort cases rather than duplicating the harness).

- [ ] **Step 2: Implement.** Group `labelKey: 'nav.groups.landing_pages', defaultLabel: 'Landing pages'`, items: existing `/landing-pages` entry moved in unchanged (gates intact), plus `{ path: '/reviews', labelKey: 'nav.items.landing_featured_reviews', defaultLabel: 'Featured reviews', icon: Star, gate: 'admin', product: 'chat', feature: 'reviews' }`. If `/reviews` already appears in another group, it stays there too — this is a second door, not a move; note it in the report if the nav mechanism forbids duplicates and pick the landing group as the single home in that case.

- [ ] **Step 3: Locale sweep.** Add `reviews.featured_on`, `featured_off`, `featured_on_section_off`, `featured_on_no_page`, `feature`, `featured`, `feature_hint` plus all Task 2/4/5 keys to **all five** locale files (translate properly — de/es/fr/ru, not English copies). Then the completeness test: a vitest that greps `frontend/src/pages/landing/`, `frontend/src/pages/LandingPages.tsx` and `Reviews.tsx` for `t('...')` keys with prefixes `landing_pages.` / `reviews.` / `nav.groups.landing_pages` / `nav.items.landing_` and asserts each key exists in every locale JSON. Pure-function friendly (fs + regex, node-env).

- [ ] **Step 4: Mutations** — delete one key from `fr/common.json` → completeness test red naming key and locale; revert the group to a flat item → SSR test red. **Step 5: `tsc -b`, vitest, backend scope untouched; commit** — `Landing pages becomes a sidebar group, and its copy exists in five languages`.

---

## Self-Review

**Spec coverage:** §4.1 → Tasks 1–2 (ContactDetails widened to eight fields — a deliberate, recorded deviation the consumers force). §4.2 → Task 3 (plus `schemaType`, which the spec missed but JSON-LD requires). §4.3 → Task 4, including the hero CTA whose current guard the spec didn't know was row-only. §4.4 → Task 5. §4.5 → Tasks 2 and 5. §6's harness requirements are embedded per task rather than a final sweep — this round is small enough that a separate verification task would re-run identical suites.

**Placeholders:** none; profile copy comes verbatim from spec §4.2; all test code concrete. Two "read the mechanism first" instructions remain (schemaType, section-reason plumbing) — they name the exact file and what to extend, which is discovery, not a gap.

**Type consistency:** `ContactDetails::resolve(?Property, array): self` used identically in Tasks 1–2; `content['contact']` key spelled once; `has('booking')`/count gate named the same in Tasks 3–4.

**Known risk:** Task 1's golden-capture parity depends on capturing bytes *before* wiring — the task orders it explicitly; a reviewer should confirm the capture predates the change.
