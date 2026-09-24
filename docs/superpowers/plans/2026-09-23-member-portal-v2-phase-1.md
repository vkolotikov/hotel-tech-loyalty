# Member Portal v2 — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the member web portal's shell and foundations (design tokens, five-language copy, industry wording), port the existing pages onto them, and add a real "my bookings" list, wallet buttons, password change, referral sharing, an operator-facing join link and portal links in the welcome emails — everything the spec's phase 1 names, deployable on its own.

**Architecture:** One new backend prefix `member/portal/*` (bootstrap payload, bookings list) behind a `member.only` middleware, plus two small shared services (`BookingCapability`, `PortalTheme`) and a bookings read model (`MemberBookingQuery`). One new frontend folder `frontend/src/portal/` with its own CSS-variable tokens (`--p-*`, light-first, dark by OS), a `portal` locale bundle registered into i18next, a provider that loads the bootstrap payload once, and pages that use only portal tokens and member endpoints. The old `frontend/src/pages/portal/` is deleted at the end.

**Tech Stack:** Laravel 13 (PHP 8.4), Sanctum, PHPUnit with the repo's minimal-schema traits; React 19, react-router 7, TanStack Query 5, Tailwind 3.4, i18next, lucide-react, Vitest (node environment, `react-dom/server` render-to-string tests). No new dependencies in this phase.

**Spec:** `docs/superpowers/specs/2026-09-23-member-portal-v2-design.md` (§3 architecture, §4 design system, §5 phase 1, §8 errors, §9 security, §10 rollout). Read it first; the plan argues from it.

## Global Constraints

- Work in worktree `C:\wamp64\www\Hexa-Tech-portal`, branch `feature/member-portal-v2` (cut from production main `3727e6808`). Never push this branch to `main`; never commit `frontend/dist`, `public/spa` or `resources/spa-shell/index.html` from it.
- PHP is always `/c/wamp64/bin/php/php8.4.20/php.exe`. NEVER run a bare `php artisan test`; every run is scoped to a directory or file and run in the foreground, and you read the `Tests:` summary line yourself.
- Run `/c/wamp64/bin/php/php8.4.20/php.exe artisan view:clear` after every Blade change before testing.
- Frontend commands run in `C:\wamp64\www\Hexa-Tech-portal\frontend`, which needs a junction to the main checkout's `node_modules` (Task 7 creates it): `cmd /c mklink /J C:\wamp64\www\Hexa-Tech-portal\frontend\node_modules C:\wamp64\www\Hexa-Tech\frontend\node_modules`. Remove it with `cmd /c rmdir C:\wamp64\www\Hexa-Tech-portal\frontend\node_modules` before the worktree is ever removed. Checks are `npx tsc -b && npx vitest run` (3 `plannerMeta` failures are pre-existing).
- Every commit message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Use the Edit/Write tools for file changes (CRLF and cp1252 hazards with sed/python); use Git Bash for POSIX commands.
- Portal code (`frontend/src/portal/**`) uses only `p-*` Tailwind classes and the portal `ui/*` primitives: no `dark-*`, `t-primary`, `t-secondary`, `text-white`, `primary-*`, `accent`, `error`, `warning`, `info` colour classes (Task 7's sweep enforces it). It never calls an admin endpoint (`/v1/admin/*`); the sweep enforces that too.
- Every portal string goes through `t('portal.<key>', 'English fallback')` and the key exists in all five `portal.<lang>.json` files (Task 8's completeness test enforces it).
- New API only under `member/portal/*`; every existing member endpoint keeps its shape (the mobile app calls them).
- Body text contrast ≥ 4.5:1 in light and dark; verified by eye on screenshots at 390 and 1440 before tests are trusted (Task 16).
- Error bodies from the new endpoints are `{error: <snake_code>, message: <English sentence>}`.

## Review Focus

Inputs the spec implies but no task's tests exercised at first draft; each now has a test in the task named.

1. A member whose organisation has **no active tier** (programme never set up) opens `/portal`: the bootstrap must answer 200 with `member: null` and `capabilities.loyalty: false`, not 404 — Task 3 test `test_a_venue_without_tiers_gets_a_portal_without_loyalty`.
2. A **staff** user's token on a portal route must answer 403 `member_only`, never 500 — Task 3 test `test_a_staff_token_is_refused_with_member_only`.
3. A booking made **by email only** (widget or app WebView, no `member_id`, no linked guest) belongs to the member; a booking with the same email in **another organisation** does not — Task 4 tests `test_bookings_are_matched_by_email_within_the_organisation` and `test_a_booking_in_another_organisation_is_never_shown`.
4. A venue that switched **Smoobu off** hides its mirrors from the member exactly as it hides them from staff — Task 4 test `test_stays_follow_the_smoobu_integration_switch`.
5. A join link whose organisation has **no colour set** must still paint (industry default), and a venue whose colour is unreadable (dead-band hex) must fall back to the default rather than ship an unreadable accent — Task 2 tests `test_theme_falls_back_to_the_industry_default_when_no_colour_is_set` and `test_an_unreadable_tenant_colour_is_replaced`.

## File map

Backend (create unless marked modify):

| File | Responsibility |
|---|---|
| `app/Services/Booking/BookingCapability.php` | "Can this org take appointments / stays online" — one query each |
| `app/Landing/PageContent.php` (modify) | delegates `appointmentsBookable` to the service |
| `app/Services/Portal/PortalTheme.php` | accent tokens (light + dark) and display face for an organisation |
| `app/Services/Portal/PortalLinks.php` | absolute portal URLs (join, claim) with the app.url fallback rule |
| `app/Services/Portal/PortalBootstrap.php` | the bootstrap payload |
| `app/Services/Portal/MemberBookingQuery.php` | the member's bookings across two tables, one DTO |
| `app/Services/MemberProvisioner.php` | `ensureForUser()` — moved out of `MemberController` |
| `app/Http/Middleware/MemberOnly.php` | 403 for non-members and for a switched-off portal |
| `app/Http/Controllers/Api/V1/Member/Portal/PortalController.php` | `GET member/portal` |
| `app/Http/Controllers/Api/V1/Member/Portal/PortalBookingController.php` | `GET member/portal/bookings`, `GET member/portal/bookings/{kind}/{id}` |
| `app/Http/Controllers/Api/V1/Admin/MemberPortalLinkController.php` | `GET admin/member-portal/link` |
| `app/Http/Controllers/Api/V1/PublicJoinController.php` (modify) | adds `theme` |
| `app/Http/Controllers/Api/V1/Member/MemberController.php` (modify) | uses `MemberProvisioner` |
| `app/Mail/WelcomeMemberMail.php`, `app/Mail/BookingMembershipMail.php` (modify) + their Blade views | portal claim link |
| `routes/api.php`, `routes/web.php`, `bootstrap/app.php` (modify) | routes, manifest variant, middleware alias |
| `tests/Feature/Member/Portal/*`, `tests/Feature/Booking/BookingCapabilityTest.php`, `tests/Feature/Pwa/WebManifestTest.php` (modify), `tests/Feature/Mail/MemberPortalLinksInMailTest.php`, `tests/Feature/Admin/MemberPortalLinkTest.php` | tests |

Frontend (create unless marked modify):

| File | Responsibility |
|---|---|
| `frontend/src/portal/theme/portal.css` | `--p-*` tokens, dark block, font faces |
| `frontend/src/portal/theme/applyPortalTheme.ts` | writes the venue accent + display face variables |
| `frontend/tailwind.config.js` (modify) | `p` colour namespace, radii, fonts, shadow |
| `frontend/src/portal/lib/money.ts`, `dates.ts`, `vocab.ts`, `portalApi.ts`, `types.ts` | formatters, industry nouns, typed API client |
| `frontend/src/portal/i18n/index.ts`, `portal.{en,ru,de,fr,es}.json` | the `portal` bundle |
| `frontend/src/i18n/localeCompleteness.test.ts` (modify) | scans `src/portal` and the five portal files |
| `frontend/src/portal/tokens.test.ts` | the class/endpoint sweep |
| `frontend/src/portal/ui/*.tsx` | Button, Card, Sheet, Tabs, Field, Toggle, Skeleton, EmptyState, Notice, Chip, Money, DateTime |
| `frontend/src/portal/PortalProvider.tsx`, `PortalShell.tsx`, `PortalApp.tsx` | provider, shell, routes |
| `frontend/src/portal/pages/{Home,Rewards,Bookings,Activity,Profile,Join,Claim}.tsx` | pages |
| `frontend/src/App.tsx` (modify) | mounts `/portal/*`, join and claim |
| `frontend/src/components/MemberPortalLinkCard.tsx`, `frontend/src/pages/hubs/MembersHub.tsx` (modify) | operator join link |
| `frontend/src/pages/portal/*` (delete) | replaced |
| `docs/member-portal.md`, `CLAUDE.md` (modify) | how the portal is built and checked |

---

### Task 1: BookingCapability service, PageContent delegates to it

**Files:**
- Create: `app/Services/Booking/BookingCapability.php`
- Modify: `app/Landing/PageContent.php:227` (the `appointmentsBookable:` argument) and `:288-301` (delete the private method)
- Test: `tests/Feature/Booking/BookingCapabilityTest.php`

**Interfaces:**
- Produces: `App\Services\Booking\BookingCapability::appointmentsBookable(int $orgId, ?int $brandId = null): bool` and `staysBookable(int $orgId): bool`. Later tasks resolve it with `app(BookingCapability::class)`.

- [ ] **Step 1: Write the failing test**

```php
<?php

namespace Tests\Feature\Booking;

use App\Services\Booking\BookingCapability;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * "Can this venue be booked online" has one answer for the landing page,
 * the portal and anything else that asks. The precondition is exactly what
 * ServiceSchedulingService enforces: an active service, linked to an active
 * master, who has an active schedule row with a real window.
 */
class BookingCapabilityTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpServiceCatalogSchema();
        $this->setUpAvailabilitySchema();

        if (!Schema::hasTable('service_master_schedules')) {
            Schema::create('service_master_schedules', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id');
                $table->unsignedBigInteger('service_master_id');
                $table->unsignedTinyInteger('day_of_week');
                $table->string('start_time', 8);
                $table->string('end_time', 8);
                $table->boolean('is_active')->default(true);
                $table->timestamps();
            });
        }
    }

    private function service(int $orgId, bool $active = true): int
    {
        return DB::table('services')->insertGetId([
            'organization_id' => $orgId, 'name' => 'Massage', 'duration_minutes' => 60,
            'price' => 80, 'is_active' => $active, 'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    private function master(int $orgId, bool $active = true): int
    {
        return DB::table('service_masters')->insertGetId([
            'organization_id' => $orgId, 'name' => 'Anna', 'is_active' => $active,
            'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    private function link(int $orgId, int $serviceId, int $masterId): void
    {
        DB::table('service_master_service')->insert([
            'organization_id' => $orgId, 'service_master_id' => $masterId, 'service_id' => $serviceId,
            'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    private function schedule(int $orgId, int $masterId, string $start = '09:00:00', string $end = '17:00:00', bool $active = true): void
    {
        DB::table('service_master_schedules')->insert([
            'organization_id' => $orgId, 'service_master_id' => $masterId, 'day_of_week' => 1,
            'start_time' => $start, 'end_time' => $end, 'is_active' => $active,
            'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    public function test_a_full_rota_makes_appointments_bookable(): void
    {
        $s = $this->service(1); $m = $this->master(1);
        $this->link(1, $s, $m); $this->schedule(1, $m);

        $this->assertTrue(app(BookingCapability::class)->appointmentsBookable(1));
    }

    public function test_a_service_with_no_master_or_no_window_is_not_bookable(): void
    {
        $s = $this->service(1);
        $this->assertFalse(app(BookingCapability::class)->appointmentsBookable(1), 'no master');

        $m = $this->master(1); $this->link(1, $s, $m);
        $this->assertFalse(app(BookingCapability::class)->appointmentsBookable(1), 'no schedule');

        $this->schedule(1, $m, '17:00:00', '09:00:00');
        $this->assertFalse(app(BookingCapability::class)->appointmentsBookable(1), 'empty window');

        $this->schedule(1, $m, '09:00:00', '17:00:00', false);
        $this->assertFalse(app(BookingCapability::class)->appointmentsBookable(1), 'inactive schedule');
    }

    public function test_another_organisations_rota_does_not_count(): void
    {
        $s = $this->service(2); $m = $this->master(2);
        $this->link(2, $s, $m); $this->schedule(2, $m);

        $this->assertFalse(app(BookingCapability::class)->appointmentsBookable(1));
        $this->assertTrue(app(BookingCapability::class)->appointmentsBookable(2));
    }

    public function test_stays_need_an_active_room(): void
    {
        $this->assertFalse(app(BookingCapability::class)->staysBookable(1));

        DB::table('booking_rooms')->insert([
            'organization_id' => 1, 'pms_id' => 'r1', 'name' => 'Sea view', 'max_guests' => 2,
            'base_price' => 120, 'is_active' => false, 'created_at' => now(), 'updated_at' => now(),
        ]);
        $this->assertFalse(app(BookingCapability::class)->staysBookable(1), 'inactive room');

        DB::table('booking_rooms')->insert([
            'organization_id' => 1, 'pms_id' => 'r2', 'name' => 'Garden', 'max_guests' => 2,
            'base_price' => 100, 'is_active' => true, 'created_at' => now(), 'updated_at' => now(),
        ]);
        $this->assertTrue(app(BookingCapability::class)->staysBookable(1));
        $this->assertFalse(app(BookingCapability::class)->staysBookable(2));
    }
}
```

If `booking_rooms` in `setUpAvailabilitySchema()` lacks a column the insert names, add it in `setUp()` with the same `Schema::hasColumn` guard the other member tests use; do not change the trait.

- [ ] **Step 2: Run it to make sure it fails**

Run (Git Bash, from the worktree root):
```bash
cd /c/wamp64/www/Hexa-Tech-portal && /c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Booking/BookingCapabilityTest.php
```
Expected: FAIL with `Class "App\Services\Booking\BookingCapability" not found`.

- [ ] **Step 3: Write the service**

`app/Services/Booking/BookingCapability.php`:
```php
<?php

namespace App\Services\Booking;

use App\Models\BookingRoom;
use App\Models\Service;
use Illuminate\Database\Eloquent\Builder;

/**
 * Can this organisation be booked online — one answer for every surface.
 *
 * The landing page's booking band, the member portal's "Book" tab and any
 * later caller must agree, or a member is offered a widget that says "no
 * times available" forever. So the precondition lives here once and is
 * exactly what ServiceSchedulingService enforces, nothing looser: at least
 * one active service linked to at least one active master who has at least
 * one active schedule row whose window is not empty.
 *
 * Every query runs withoutGlobalScopes(): a public landing request has no
 * bound tenant and TenantScope fails closed, so the organisation is named
 * explicitly instead.
 */
final class BookingCapability
{
    public function appointmentsBookable(int $orgId, ?int $brandId = null): bool
    {
        return Service::query()
            ->withoutGlobalScopes()
            ->where('services.organization_id', $orgId)
            // A row with brand_id NULL is "not assigned to any brand", not
            // "belongs to no brand's page" — the landing page's rule.
            ->when($brandId, fn (Builder $q) => $q->where(
                fn (Builder $w) => $w->where('services.brand_id', $brandId)->orWhereNull('services.brand_id')
            ))
            ->where('services.is_active', true)
            ->whereHas('masters', fn (Builder $masters) => $masters
                ->withoutGlobalScopes()
                ->where('service_masters.organization_id', $orgId)
                ->where('service_masters.is_active', true)
                ->whereHas('schedules', fn (Builder $rows) => $rows
                    ->withoutGlobalScopes()
                    ->where('service_master_schedules.is_active', true)
                    ->whereColumn('service_master_schedules.end_time', '>', 'service_master_schedules.start_time')))
            ->exists();
    }

    /** At least one active room to sell. The industry test belongs to the caller. */
    public function staysBookable(int $orgId): bool
    {
        return BookingRoom::query()
            ->withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('is_active', true)
            ->exists();
    }
}
```

- [ ] **Step 4: Make PageContent delegate**

In `app/Landing/PageContent.php`, change line 227 from
```php
            appointmentsBookable: self::appointmentsBookable($orgId, $brandId),
```
to
```php
            appointmentsBookable: app(\App\Services\Booking\BookingCapability::class)->appointmentsBookable($orgId, $brandId),
```
and delete the private static `appointmentsBookable()` method (lines 267-301, the docblock included). Keep the `use` of `Service` only if something else in the file still references it (check with grep; remove an unused import).

- [ ] **Step 5: Run the new test and the landing tests that cover bookingMode**

```bash
cd /c/wamp64/www/Hexa-Tech-portal && /c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Booking/BookingCapabilityTest.php && /c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Landing/PageContentTest.php
```
Expected: both `Tests:` lines show 0 failed.

- [ ] **Step 6: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-portal && git add app/Services/Booking/BookingCapability.php app/Landing/PageContent.php tests/Feature/Booking/BookingCapabilityTest.php && git commit -q -F - <<'EOF'
Give "can this venue be booked online" one home

The landing page answered it privately in PageContent; the member
portal needs the same answer for its Book tab, so the precondition
(active service, active master, active non-empty schedule) moves to
BookingCapability and PageContent delegates. Stays get the sibling
question: an active room.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 2: PortalTheme, PortalLinks, and the join page's theme

**Files:**
- Create: `app/Services/Portal/PortalTheme.php`, `app/Services/Portal/PortalLinks.php`
- Modify: `app/Http/Controllers/Api/V1/PublicJoinController.php:60-69`
- Test: `tests/Feature/Member/Portal/PortalThemeTest.php`, `tests/Feature/Member/Portal/PublicJoinThemeTest.php`

**Interfaces:**
- Produces: `PortalTheme::for(Organization $org): array` returning `['accent' => ['hex','ink','deep','dark_hex','dark_ink','dark_deep'], 'display_face' => string, 'industry' => string, 'logo_url' => ?string]`; `PortalTheme::DISPLAY_FACES`, `PortalTheme::ACCENT_DEFAULTS`, `PortalTheme::ACCENT_FALLBACK`.
- Produces: `PortalLinks::base(): ?string`, `PortalLinks::join(string $widgetToken, ?string $ref = null): ?string`, `PortalLinks::claim(): ?string`.
- Consumes: `App\Support\Accent::for(?string $hex, string $profileDefault, ?string $surface)` (existing) whose result exposes `->brand`, `->on`, `->deep`.

- [ ] **Step 1: Write the failing tests**

`tests/Feature/Member/Portal/PortalThemeTest.php`:
```php
<?php

namespace Tests\Feature\Member\Portal;

use App\Models\Organization;
use App\Services\Portal\PortalTheme;
use App\Support\Accent;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

class PortalThemeTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpBookingRefundSchema(); // organizations + hotel_settings
        if (!Schema::hasColumn('organizations', 'industry')) {
            Schema::table('organizations', fn ($t) => $t->string('industry', 32)->nullable());
        }
    }

    private function org(string $industry = 'beauty'): Organization
    {
        $org = Organization::create(['name' => 'Numa', 'slug' => 'numa-' . uniqid()]);
        DB::table('organizations')->where('id', $org->id)->update(['industry' => $industry]);
        return $org->fresh();
    }

    private function colour(Organization $org, string $hex): void
    {
        DB::table('hotel_settings')->insert([
            'organization_id' => $org->id, 'key' => 'primary_color', 'value' => $hex,
            'type' => 'string', 'group' => 'appearance', 'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    public function test_theme_falls_back_to_the_industry_default_when_no_colour_is_set(): void
    {
        $theme = PortalTheme::for($this->org('beauty'));

        $this->assertSame(PortalTheme::ACCENT_DEFAULTS['beauty'], strtoupper($theme['accent']['hex']));
        $this->assertSame('cormorant', $theme['display_face']);
        $this->assertSame('beauty', $theme['industry']);
    }

    public function test_a_readable_tenant_colour_is_kept_and_both_modes_get_readable_ink(): void
    {
        $org = $this->org('hotel');
        $this->colour($org, '#1F7A73');

        $a = PortalTheme::for($org)['accent'];

        $this->assertSame('#1f7a73', $a['hex']);
        $this->assertGreaterThanOrEqual(Accent::FLOOR, Accent::contrast($a['ink'], $a['hex']));
        $this->assertGreaterThanOrEqual(Accent::FLOOR, Accent::contrast($a['dark_ink'], $a['dark_hex']));
        // The text shade must read on its own surface in each mode.
        $this->assertGreaterThanOrEqual(4.5, Accent::contrast($a['deep'], PortalTheme::LIGHT_SURFACE));
        $this->assertGreaterThanOrEqual(4.5, Accent::contrast($a['dark_deep'], PortalTheme::DARK_SURFACE));
    }

    public function test_an_unreadable_tenant_colour_is_replaced(): void
    {
        $org = $this->org('hotel');
        $this->colour($org, '#0078D7'); // the dead-band hex Accent documents

        $a = PortalTheme::for($org)['accent'];

        $this->assertNotSame('#0078d7', $a['hex']);
        $this->assertGreaterThanOrEqual(Accent::FLOOR, Accent::contrast($a['ink'], $a['hex']));
    }

    public function test_unknown_industries_get_the_generic_face_and_accent(): void
    {
        $theme = PortalTheme::for($this->org('legal'));

        $this->assertSame('manrope', $theme['display_face']);
        $this->assertSame(PortalTheme::ACCENT_FALLBACK, strtoupper($theme['accent']['hex']));
    }
}
```

`tests/Feature/Member/Portal/PublicJoinThemeTest.php`:
```php
<?php

namespace Tests\Feature\Member\Portal;

use Tests\Feature\Member\MemberEndpointTestCase;

class PublicJoinThemeTest extends MemberEndpointTestCase
{
    public function test_the_join_context_carries_the_venue_theme(): void
    {
        $org = $this->tenant('Numa Skin Lab');

        $json = $this->getJson('/api/v1/public/join/' . $org->fresh()->widget_token)
            ->assertOk()
            ->json();

        $this->assertTrue($json['accepting_joins']);
        $this->assertSame('Numa Skin Lab', $json['organization']['name']);
        $this->assertMatchesRegularExpression('/^#[0-9a-f]{6}$/', $json['theme']['accent']['hex']);
        $this->assertMatchesRegularExpression('/^#[0-9a-f]{6}$/', $json['theme']['accent']['dark_hex']);
        $this->assertContains($json['theme']['display_face'], ['playfair', 'cormorant', 'fraunces', 'newsreader', 'space', 'manrope']);
        $this->assertArrayHasKey('industry', $json['theme']);
    }
}
```

- [ ] **Step 2: Run them to make sure they fail**

```bash
cd /c/wamp64/www/Hexa-Tech-portal && /c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Member/Portal/
```
Expected: FAIL — `PortalTheme` not found; the join test fails on the missing `theme` key.

- [ ] **Step 3: Write PortalTheme**

`app/Services/Portal/PortalTheme.php`:
```php
<?php

namespace App\Services\Portal;

use App\Models\HotelSetting;
use App\Models\Organization;
use App\Support\Accent;

/**
 * The venue's colour and face for the member portal, computed once, server
 * side, with the contrast check the landing kits already trust.
 *
 * The SPA's own ramp (useTheme.ts) lightens and darkens without measuring
 * anything; App\Support\Accent measures. So the portal asks Accent twice —
 * once against the light paper, once against the dark one — and ships six
 * values the client writes into CSS variables verbatim.
 */
final class PortalTheme
{
    public const LIGHT_SURFACE = '#F7F6F3';
    public const DARK_SURFACE  = '#0F1113';

    /** Display face per industry; the body face is always Inter. */
    public const DISPLAY_FACES = [
        'hotel'      => 'playfair',
        'beauty'     => 'cormorant',
        'medical'    => 'fraunces',
        'restaurant' => 'newsreader',
        'fitness'    => 'space',
    ];
    public const DEFAULT_FACE = 'manrope';

    /** Accent when the venue has not chosen a colour. */
    public const ACCENT_DEFAULTS = [
        'hotel'      => '#B8924A',
        'beauty'     => '#B04A6E',
        'medical'    => '#1F7A73',
        'restaurant' => '#B5552F',
        'fitness'    => '#2E7D5B',
    ];
    public const ACCENT_FALLBACK = '#2F5D8A';

    public static function for(Organization $org): array
    {
        $industry = $org->resolved_industry ?? Organization::DEFAULT_INDUSTRY;
        $default  = self::ACCENT_DEFAULTS[$industry] ?? self::ACCENT_FALLBACK;

        // The appearance setting the admin theme editor writes. Read outside
        // the cached map on purpose: this runs for public join requests where
        // no tenant is bound and HotelSetting::getValue() would look at the
        // wrong organisation.
        $hex = HotelSetting::withoutGlobalScopes()
            ->where('organization_id', $org->id)
            ->where('key', 'primary_color')
            ->value('value');
        $hex = is_string($hex) && $hex !== '' ? $hex : null;

        $light = Accent::for($hex, $default, self::LIGHT_SURFACE);
        $dark  = Accent::for($hex, $default, self::DARK_SURFACE);

        $logo = HotelSetting::withoutGlobalScopes()
            ->where('organization_id', $org->id)
            ->whereIn('key', ['logo_url', 'company_logo'])
            ->orderByRaw("CASE key WHEN 'logo_url' THEN 0 ELSE 1 END")
            ->value('value');

        return [
            'accent' => [
                'hex'       => $light->brand,
                'ink'       => $light->on,
                'deep'      => $light->deep,
                'dark_hex'  => $dark->brand,
                'dark_ink'  => $dark->on,
                'dark_deep' => $dark->deep,
            ],
            'display_face' => self::DISPLAY_FACES[$industry] ?? self::DEFAULT_FACE,
            'industry'     => $industry,
            'logo_url'     => (is_string($logo) && $logo !== '') ? $logo : ($org->logo_url ?: null),
        ];
    }
}
```

`Accent::for()` returns lower-case hex from `CssColor::safe()`; the tests compare with `strtoupper` where they name a constant.

- [ ] **Step 4: Write PortalLinks**

`app/Services/Portal/PortalLinks.php`:
```php
<?php

namespace App\Services\Portal;

/**
 * Absolute URLs into the member portal.
 *
 * Same fallback rule as Member\ReferralController and
 * AuthController::resolveLoyaltyUrl: an unset app.url in production must
 * not quietly produce a localhost link in something a member forwards, so
 * outside production the request host fills in and in production the
 * caller gets null and hides the link.
 */
final class PortalLinks
{
    public static function base(): ?string
    {
        $base = trim((string) config('app.url'));
        if (!$base && !app()->environment('production') && app()->runningInConsole() === false) {
            $base = request()->getSchemeAndHttpHost();
        }
        return $base ? rtrim($base, '/') : null;
    }

    public static function join(string $widgetToken, ?string $ref = null): ?string
    {
        $base = self::base();
        if (!$base) {
            return null;
        }
        return $base . '/portal/join?org=' . urlencode($widgetToken)
            . ($ref ? '&ref=' . urlencode($ref) : '');
    }

    public static function claim(): ?string
    {
        $base = self::base();
        return $base ? $base . '/portal/claim' : null;
    }
}
```

- [ ] **Step 5: Return the theme from the join endpoint**

In `PublicJoinController::show()`, replace the final `return response()->json([...])` (lines 60-69) with:
```php
        return response()->json([
            'organization' => [
                'id'   => $org->id,
                'name' => $brand->name ?: $org->name,
            ],
            'accepting_joins' => true,
            'starting_tier'   => $tier->name,
            // Shown on the form as the reason to bother signing up.
            'welcome_bonus'   => (int) HotelSetting::getValue('welcome_bonus_points', 0),
            // The page paints the venue before any session exists.
            'theme'           => \App\Services\Portal\PortalTheme::for($org),
        ]);
```
Also change the 404 message `'Please check with the hotel for a current link.'` to `'Please check with the venue for a current link.'` (the portal is no longer hotel-only).

- [ ] **Step 6: Run the tests**

```bash
cd /c/wamp64/www/Hexa-Tech-portal && /c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Member/Portal/ && /c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Auth/
```
Expected: `Tests:` lines with 0 failed (the Auth suite holds `PublicRegisterTenantIsolationTest`, which reads the join endpoint).

- [ ] **Step 7: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-portal && git add app/Services/Portal/PortalTheme.php app/Services/Portal/PortalLinks.php app/Http/Controllers/Api/V1/PublicJoinController.php tests/Feature/Member/Portal/ && git commit -q -F - <<'EOF'
Compute the member portal's colour and face on the server

PortalTheme asks App\Support\Accent for a contrast-checked accent
against the light and the dark paper and names the industry's display
face; the join page now receives it, so a sign-up form paints the
venue before anyone has a session. PortalLinks holds the absolute
portal URLs with the same app.url fallback rule the referral link uses.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 3: `member.only` middleware, `MemberProvisioner`, the bootstrap endpoint

**Files:**
- Create: `app/Http/Middleware/MemberOnly.php`, `app/Services/MemberProvisioner.php`, `app/Services/Portal/PortalBootstrap.php`, `app/Http/Controllers/Api/V1/Member/Portal/PortalController.php`
- Modify: `bootstrap/app.php:56-65` (alias), `routes/api.php:403` (after the member group closes), `app/Http/Controllers/Api/V1/Member/MemberController.php:24-99`
- Test: `tests/Feature/Member/Portal/PortalBootstrapTest.php`

**Interfaces:**
- Consumes: `BookingCapability` (Task 1), `PortalTheme` (Task 2), `LoyaltyService::getMemberSummary()`, `DiscountService::benefitsFor()`, `StripeService::isEnabled()/currency()/publishableKey()`, `IndustryPromptService::for($industry)->hasLoyalty`.
- Produces: `GET /api/v1/member/portal` → the payload in spec §5.2 (without `applies_to` on benefits, which arrives in phase 2). `MemberProvisioner::ensureForUser(User $user): ?LoyaltyMember`. `PortalBootstrap::build(User $user, ?LoyaltyMember $member): array`. The `member.only` middleware alias. Task 4 adds `counts.upcoming_bookings` through `MemberBookingQuery`; until then it is `0`.

- [ ] **Step 1: Write the failing test**

`tests/Feature/Member/Portal/PortalBootstrapTest.php`:
```php
<?php

namespace Tests\Feature\Member\Portal;

use App\Models\HotelSetting;
use App\Models\LoyaltyTier;
use App\Models\Organization;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\Feature\Member\MemberEndpointTestCase;

/**
 * GET /v1/member/portal — the one call the portal shell makes on load.
 *
 * Every assertion is on the payload's meaning for the member: what the bar
 * shows (capabilities), what the card says (member), which colour paints
 * (venue.accent). Statuses alone prove nothing here.
 */
class PortalBootstrapTest extends MemberEndpointTestCase
{
    private const ENDPOINT = '/api/v1/member/portal';

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpServiceCatalogSchema();
        $this->setUpAvailabilitySchema();
        $this->setUpNotificationSchema();

        if (!Schema::hasTable('service_master_schedules')) {
            Schema::create('service_master_schedules', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id');
                $table->unsignedBigInteger('service_master_id');
                $table->unsignedTinyInteger('day_of_week');
                $table->string('start_time', 8);
                $table->string('end_time', 8);
                $table->boolean('is_active')->default(true);
                $table->timestamps();
            });
        }
        if (!Schema::hasColumn('organizations', 'industry')) {
            Schema::table('organizations', fn ($t) => $t->string('industry', 32)->nullable());
        }
        foreach (['email', 'phone', 'currency', 'timezone', 'logo_url'] as $col) {
            if (!Schema::hasColumn('organizations', $col)) {
                Schema::table('organizations', fn ($t) => $t->string($col)->nullable());
            }
        }
    }

    private function setting(Organization $org, string $key, string $value, string $group = 'general'): void
    {
        DB::table('hotel_settings')->insert([
            'organization_id' => $org->id, 'key' => $key, 'value' => $value, 'type' => 'string',
            'group' => $group, 'created_at' => now(), 'updated_at' => now(),
        ]);
        HotelSetting::flushCacheFor($org->id);
    }

    private function rota(Organization $org): void
    {
        $s = DB::table('services')->insertGetId([
            'organization_id' => $org->id, 'name' => 'Facial', 'duration_minutes' => 45, 'price' => 60,
            'is_active' => true, 'created_at' => now(), 'updated_at' => now(),
        ]);
        $m = DB::table('service_masters')->insertGetId([
            'organization_id' => $org->id, 'name' => 'Mara', 'is_active' => true,
            'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('service_master_service')->insert([
            'organization_id' => $org->id, 'service_master_id' => $m, 'service_id' => $s,
            'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('service_master_schedules')->insert([
            'organization_id' => $org->id, 'service_master_id' => $m, 'day_of_week' => 1,
            'start_time' => '09:00:00', 'end_time' => '17:00:00', 'is_active' => true,
            'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    public function test_it_requires_a_signed_in_member(): void
    {
        $this->getJson(self::ENDPOINT)->assertStatus(401);
    }

    public function test_a_staff_token_is_refused_with_member_only(): void
    {
        $org = $this->tenant();
        $staff = User::create([
            'organization_id' => $org->id, 'name' => 'Desk', 'email' => 'desk_' . uniqid() . '@example.test',
            'password' => 'x', 'user_type' => 'staff',
        ]);
        Sanctum::actingAs($staff);

        $this->getJson(self::ENDPOINT)->assertStatus(403)->assertJsonPath('error', 'member_only');
    }

    public function test_a_member_gets_venue_capabilities_and_their_card(): void
    {
        $org = $this->tenant('Seaside Hotel');
        DB::table('organizations')->where('id', $org->id)->update([
            'email' => 'hello@seaside.test', 'phone' => '+371 20000000', 'currency' => 'EUR', 'timezone' => 'Europe/Riga',
        ]);
        ['token' => $token, 'member' => $member] = $this->member($org);

        $json = $this->withToken($token)->getJson(self::ENDPOINT)->assertOk()->json();

        $this->assertSame('Seaside Hotel', $json['venue']['name']);
        $this->assertSame('hotel', $json['venue']['industry']);
        $this->assertSame('EUR', $json['venue']['currency']);
        $this->assertSame('Europe/Riga', $json['venue']['timezone']);
        $this->assertSame('hello@seaside.test', $json['venue']['contact']['email']);
        $this->assertSame('playfair', $json['venue']['display_face']);
        $this->assertMatchesRegularExpression('/^#[0-9a-f]{6}$/', $json['venue']['accent']['hex']);

        $this->assertTrue($json['capabilities']['loyalty']);
        $this->assertFalse($json['capabilities']['services'], 'no rota yet');
        $this->assertFalse($json['capabilities']['stays'], 'no rooms yet');
        $this->assertFalse($json['capabilities']['payments']['services']);
        $this->assertNull($json['capabilities']['payments']['publishable_key']);

        $this->assertSame($member->member_number, $json['member']['member_number']);
        $this->assertSame('Bronze', $json['member']['tier']['name']);
        $this->assertSame(24, $json['policies']['services_cancel_hours']);
        $this->assertSame(48, $json['policies']['booking_cancel_hours']);
        $this->assertSame(0, $json['counts']['unread_notifications']);
        $this->assertSame(0, $json['counts']['upcoming_bookings']);
    }

    public function test_a_rota_switches_services_on_and_rooms_switch_stays_on_for_hotels_only(): void
    {
        $org = $this->tenant();
        ['token' => $token] = $this->member($org);
        $this->rota($org);
        DB::table('booking_rooms')->insert([
            'organization_id' => $org->id, 'pms_id' => 'r1', 'name' => 'Sea view', 'max_guests' => 2,
            'base_price' => 120, 'is_active' => true, 'created_at' => now(), 'updated_at' => now(),
        ]);

        $json = $this->withToken($token)->getJson(self::ENDPOINT)->assertOk()->json();
        $this->assertTrue($json['capabilities']['services']);
        $this->assertTrue($json['capabilities']['stays'], 'hotel with an active room');

        DB::table('organizations')->where('id', $org->id)->update(['industry' => 'beauty']);
        $this->flushHeaders();
        $json = $this->withToken($token)->getJson(self::ENDPOINT)->assertOk()->json();
        $this->assertTrue($json['capabilities']['services']);
        $this->assertFalse($json['capabilities']['stays'], 'a salon never sells stays, rooms or not');
        $this->assertSame('cormorant', $json['venue']['display_face']);
    }

    public function test_a_medical_venue_gets_the_portal_without_loyalty(): void
    {
        $org = $this->tenant('Forma Dental');
        ['token' => $token] = $this->member($org);
        DB::table('organizations')->where('id', $org->id)->update(['industry' => 'medical']);

        $json = $this->withToken($token)->getJson(self::ENDPOINT)->assertOk()->json();

        $this->assertFalse($json['capabilities']['loyalty']);
        $this->assertNotNull($json['member'], 'the member still has a name and number to show');
        $this->assertSame('fraunces', $json['venue']['display_face']);
    }

    public function test_a_venue_without_tiers_gets_a_portal_without_loyalty(): void
    {
        $org = $this->tenant();
        ['token' => $token] = $this->member($org);
        LoyaltyTier::withoutGlobalScopes()->where('organization_id', $org->id)->update(['is_active' => false]);

        $json = $this->withToken($token)->getJson(self::ENDPOINT)->assertOk()->json();

        $this->assertFalse($json['capabilities']['loyalty']);
        $this->assertNotNull($json['member']);
    }

    public function test_online_payment_needs_stripe_and_a_matching_currency_per_booking_kind(): void
    {
        $org = $this->tenant();
        ['token' => $token] = $this->member($org);
        $this->setting($org, 'booking_payment_enabled', 'true', 'integrations');
        $this->setting($org, 'stripe_secret_key', 'sk_test_x', 'integrations');
        $this->setting($org, 'stripe_publishable_key', 'pk_test_x', 'integrations');
        $this->setting($org, 'stripe_currency', 'eur', 'integrations');
        $this->setting($org, 'services_currency', 'EUR', 'services');
        $this->setting($org, 'booking_currency', 'USD', 'booking');

        $json = $this->withToken($token)->getJson(self::ENDPOINT)->assertOk()->json();

        $this->assertTrue($json['capabilities']['payments']['services']);
        $this->assertFalse($json['capabilities']['payments']['stays'], 'USD widget vs EUR Stripe');
        $this->assertSame('pk_test_x', $json['capabilities']['payments']['publishable_key']);
    }

    public function test_a_switched_off_portal_answers_portal_disabled(): void
    {
        $org = $this->tenant();
        ['token' => $token] = $this->member($org);
        $this->setting($org, 'portal_enabled', 'false', 'loyalty');

        $this->withToken($token)->getJson(self::ENDPOINT)->assertStatus(403)->assertJsonPath('error', 'portal_disabled');
    }

    public function test_the_payload_never_carries_another_venues_settings(): void
    {
        $a = $this->tenant('Venue A');
        $b = $this->tenant('Venue B');
        ['token' => $tokenA] = $this->member($a);
        $this->rota($b);
        $this->setting($b, 'primary_color', '#1F7A73', 'appearance');

        $json = $this->withToken($tokenA)->getJson(self::ENDPOINT)->assertOk()->json();

        $this->assertSame('Venue A', $json['venue']['name']);
        $this->assertFalse($json['capabilities']['services'], "B's rota must not switch A on");
        $this->assertNotSame('#1f7a73', $json['venue']['accent']['hex']);
    }
}
```

If the minimal `hotel_settings` table has no `type` or `group` column, drop those keys from `setting()`'s insert rather than editing the trait; if `users` lacks `user_type`, add it with the `hasColumn` guard in `setUp()`.

- [ ] **Step 2: Run it to make sure it fails**

```bash
cd /c/wamp64/www/Hexa-Tech-portal && /c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Member/Portal/PortalBootstrapTest.php
```
Expected: FAIL — every authenticated case answers 404 (no route).

- [ ] **Step 3: Write the middleware and register the alias**

`app/Http/Middleware/MemberOnly.php`:
```php
<?php

namespace App\Http\Middleware;

use App\Models\HotelSetting;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * The member portal's door.
 *
 * Several member endpoints answer 500 to a staff token because they read a
 * loyalty_member row that does not exist; the portal prefix refuses at the
 * door instead. It also honours the venue's switch: a portal that is off
 * answers the same 403 on every route, so the SPA can show one page.
 */
class MemberOnly
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if (!$user || $user->user_type !== 'member') {
            return response()->json([
                'error'   => 'member_only',
                'message' => 'This area is for members of the venue.',
            ], 403);
        }

        $enabled = HotelSetting::getValue('portal_enabled', true);
        if (!filter_var($enabled, FILTER_VALIDATE_BOOLEAN)) {
            return response()->json([
                'error'   => 'portal_disabled',
                'message' => 'The member portal is switched off for this venue.',
            ], 403);
        }

        return $next($request);
    }
}
```

In `bootstrap/app.php`, inside `$middleware->alias([...])` (lines 56-65) add after `'staff.can'`:
```php
            'member.only'        => \App\Http\Middleware\MemberOnly::class,
```

- [ ] **Step 4: Move the self-heal into MemberProvisioner**

`app/Services/MemberProvisioner.php`:
```php
<?php

namespace App\Services;

use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Models\User;

/**
 * Creates the loyalty_member row a member-type user should have but does
 * not — legacy accounts from before the transactional register flow, or a
 * User an admin created without enrolling. Shared by the profile endpoint
 * and the portal bootstrap so both heal the same way.
 */
final class MemberProvisioner
{
    public function __construct(private QrCodeService $qr)
    {
    }

    /** Null when the organisation has no active tier; the caller says so. */
    public function ensureForUser(User $user): ?LoyaltyMember
    {
        if ($user->user_type !== 'member' || !$user->organization_id) {
            return null;
        }

        if (!app()->bound('current_organization_id')) {
            app()->instance('current_organization_id', $user->organization_id);
        }

        $tier = LoyaltyTier::withoutGlobalScopes()
            ->where('organization_id', $user->organization_id)
            ->where('is_active', true)
            ->orderBy('min_points')
            ->first();

        if (!$tier) {
            return null;
        }

        return LoyaltyMember::create([
            'user_id'       => $user->id,
            'tier_id'       => $tier->id,
            'member_number' => $this->qr->generateMemberNumber(),
            'qr_code_token' => hash_hmac('sha256', $user->id . now()->timestamp, config('app.key')),
            'referral_code' => $this->qr->generateReferralCode(),
            'joined_at'     => $user->created_at ?? now(),
            'is_active'     => true,
        ]);
    }
}
```

In `MemberController.php`: replace lines 33-36 with
```php
        if (!$member && $user->user_type === 'member' && $user->organization_id) {
            $member = app(\App\Services\MemberProvisioner::class)->ensureForUser($user);
            $member?->load(['tier', 'user']);
        }
```
and delete the private `ensureLoyaltyMember()` method (lines 71-99). Remove the now-unused `use App\Models\LoyaltyTier;` import if nothing else in the file uses it (grep first).

- [ ] **Step 5: Write PortalBootstrap**

`app/Services/Portal/PortalBootstrap.php`:
```php
<?php

namespace App\Services\Portal;

use App\Models\HotelSetting;
use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Models\Organization;
use App\Models\PushNotification;
use App\Models\User;
use App\Services\Booking\BookingCapability;
use App\Services\DiscountService;
use App\Services\IndustryPrompts\IndustryPromptService;
use App\Services\LoyaltyService;
use App\Services\StripeService;
use Illuminate\Support\Facades\Log;

/**
 * Everything the portal shell needs on load, in one call: who the venue is
 * and how it looks, what the member can do here, what the card says.
 *
 * Capabilities are facts about the data, not the industry alone: a salon
 * with no rota cannot take appointments, a hotel with no rooms cannot sell
 * a stay, and a venue without Stripe (or with Stripe in another currency
 * than the booking kind) takes payment at the desk.
 */
final class PortalBootstrap
{
    public function __construct(
        private BookingCapability $capability,
        private LoyaltyService $loyalty,
        private DiscountService $discounts,
        private IndustryPromptService $industries,
    ) {
    }

    public function build(User $user, ?LoyaltyMember $member): array
    {
        $org = Organization::withoutGlobalScopes()->findOrFail($user->organization_id);
        $theme = PortalTheme::for($org);
        $industry = $theme['industry'];

        $hasTier = LoyaltyTier::withoutGlobalScopes()
            ->where('organization_id', $org->id)
            ->where('is_active', true)
            ->exists();
        $loyalty = $hasTier && $this->industries->for($industry)->hasLoyalty;

        return [
            'venue'        => $this->venue($org, $theme),
            'capabilities' => $this->capabilities($org, $industry, $loyalty),
            'policies'     => [
                'services_cancel_hours'        => (int) HotelSetting::getValue('services_cancel_hours', 24),
                'booking_cancel_hours'         => (int) HotelSetting::getValue('booking_cancel_hours', 48),
                'services_cancellation_policy' => (string) HotelSetting::getValue('services_cancellation_policy', ''),
            ],
            'member'       => $member ? $this->member($member, $loyalty) : null,
            'counts'       => [
                'unread_notifications' => $member ? PushNotification::where('member_id', $member->id)
                    ->where('is_sent', true)->whereNull('read_at')->count() : 0,
                'upcoming_bookings'    => $member ? $this->upcomingBookings($member) : 0,
            ],
        ];
    }

    private function venue(Organization $org, array $theme): array
    {
        return [
            'name'         => $org->name,
            'logo_url'     => $theme['logo_url'],
            'industry'     => $theme['industry'],
            'currency'     => strtoupper((string) ($org->currency ?: HotelSetting::getValue('services_currency', 'EUR'))),
            'timezone'     => $org->timezone ?: config('app.timezone', 'UTC'),
            'contact'      => ['email' => $org->email ?: null, 'phone' => $org->phone ?: null],
            'accent'       => $theme['accent'],
            'display_face' => $theme['display_face'],
        ];
    }

    private function capabilities(Organization $org, string $industry, bool $loyalty): array
    {
        $stripe = app(StripeService::class);
        $mock = filter_var(HotelSetting::getValue('booking_mock_mode', false), FILTER_VALIDATE_BOOLEAN);
        $online = $stripe->isEnabled() && !$mock;
        $stripeCurrency = strtolower((string) $stripe->currency());
        $services = strtolower((string) HotelSetting::getValue('services_currency', 'EUR'));
        $stays    = strtolower((string) HotelSetting::getValue('booking_currency', 'EUR'));

        $payServices = $online && $services === $stripeCurrency;
        $payStays    = $online && $stays === $stripeCurrency;
        if ($online && (!$payServices || !$payStays)) {
            Log::warning('portal: booking currency differs from Stripe currency; paying at the venue', [
                'organization_id' => $org->id, 'stripe' => $stripeCurrency, 'services' => $services, 'stays' => $stays,
            ]);
        }

        return [
            'loyalty'  => $loyalty,
            'services' => $this->capability->appointmentsBookable($org->id),
            'stays'    => $industry === 'hotel' && $this->capability->staysBookable($org->id),
            'chat'     => true,
            'payments' => [
                'services'        => $payServices,
                'stays'           => $payStays,
                'publishable_key' => ($payServices || $payStays) ? ($stripe->publishableKey() ?: null) : null,
            ],
        ];
    }

    private function member(LoyaltyMember $member, bool $loyalty): array
    {
        $member->loadMissing(['tier', 'user']);
        $summary = $this->loyalty->getMemberSummary($member);

        $summary['benefits'] = $loyalty
            ? $this->discounts->benefitsFor($member)->map(fn ($tb) => [
                'id'           => $tb->id,
                'name'         => $tb->benefit->name,
                'category'     => $tb->benefit->category,
                'display'      => $tb->value,
                'value_type'   => $tb->value_type,
                'value_amount' => $tb->value_amount !== null ? (float) $tb->value_amount : null,
            ])->values()->all()
            : [];

        return $summary;
    }

    /** Task 4 replaces this with MemberBookingQuery::count(). */
    private function upcomingBookings(LoyaltyMember $member): int
    {
        return 0;
    }
}
```

- [ ] **Step 6: Write the controller and the route**

`app/Http/Controllers/Api/V1/Member/Portal/PortalController.php`:
```php
<?php

namespace App\Http\Controllers\Api\V1\Member\Portal;

use App\Http\Controllers\Controller;
use App\Services\MemberProvisioner;
use App\Services\Portal\PortalBootstrap;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PortalController extends Controller
{
    /** GET /v1/member/portal — the shell's one startup call. */
    public function index(Request $request, PortalBootstrap $bootstrap, MemberProvisioner $provisioner): JsonResponse
    {
        $user = $request->user();
        $member = $user->loyaltyMember()->with(['tier', 'user'])->first()
            ?? $provisioner->ensureForUser($user);

        return response()->json($bootstrap->build($user, $member));
    }
}
```

In `routes/api.php`, directly after the member prefix group closes (the `});` at line 403, before `// ─── AI Chatbot`), add:
```php
        // ─── Member portal (web) ──────────────────────────────────────────────
        // Its own prefix so the mobile app's endpoints above keep their shapes.
        // member.only refuses staff tokens at the door (several member routes
        // answer 500 to them) and honours the venue's portal_enabled switch.
        Route::prefix('member/portal')->middleware('member.only')->group(function () {
            Route::get('/', [\App\Http\Controllers\Api\V1\Member\Portal\PortalController::class, 'index']);
        });
```

- [ ] **Step 7: Run the tests**

```bash
cd /c/wamp64/www/Hexa-Tech-portal && /c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Member/
```
Expected: `Tests:` 0 failed. The existing `tests/Feature/Member/*` (password, wallet link, referral) must stay green — the `MemberController` change touches their controller.

If `Organization::findOrFail` under `withoutGlobalScopes()` complains about a missing `industry` accessor column, the `hasColumn` guard in the test's `setUp()` is what adds it; production has the column.

- [ ] **Step 8: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-portal && git add app/Http/Middleware/MemberOnly.php app/Services/MemberProvisioner.php app/Services/Portal/PortalBootstrap.php app/Http/Controllers/Api/V1/Member/Portal/PortalController.php app/Http/Controllers/Api/V1/Member/MemberController.php bootstrap/app.php routes/api.php tests/Feature/Member/Portal/PortalBootstrapTest.php && git commit -q -F - <<'EOF'
Give the member portal one startup call

GET member/portal answers who the venue is and how it looks, what the
member can do here (loyalty, appointments, stays, online payment per
kind) and what their card says. The member/portal prefix sits behind a
member.only middleware, so a staff token gets 403 instead of the 500
several member endpoints answer, and a venue can switch the portal off
with one setting. The profile endpoint's self-heal moves into
MemberProvisioner so both callers heal the same way.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 4: `MemberBookingQuery` and the bookings endpoints

**Files:**
- Create: `app/Services/Portal/MemberBookingQuery.php`, `app/Http/Controllers/Api/V1/Member/Portal/PortalBookingController.php`
- Modify: `app/Services/Portal/PortalBootstrap.php` (constructor + `upcomingBookings()`), `routes/api.php` (the `member/portal` group)
- Test: `tests/Feature/Member/Portal/PortalBookingsTest.php`

**Interfaces:**
- Produces: `MemberBookingQuery::list(LoyaltyMember $member, string $scope, int $page = 1, int $perPage = 20): array{data: array, meta: array}`, `::count(LoyaltyMember $member, string $scope): int`, `::find(LoyaltyMember $member, string $kind, int $id): ?array`. DTO keys: `kind, id, reference, title, subtitle, starts_at, ends_at, status, payment_status, total, currency, discount, can_cancel, cancel_deadline, notes, party_size, guests`.
- `GET /api/v1/member/portal/bookings?scope=upcoming|past&page=N` → `{data, meta: {scope, page, per_page, total}}`; `GET /api/v1/member/portal/bookings/{kind}/{id}` → the DTO or 404 `{error: 'not_found'}`.

- [ ] **Step 1: Write the failing test**

`tests/Feature/Member/Portal/PortalBookingsTest.php`:
```php
<?php

namespace Tests\Feature\Member\Portal;

use App\Models\Organization;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\Feature\Member\MemberEndpointTestCase;

/**
 * "My bookings" across service_bookings and booking_mirror.
 *
 * Ownership has three spellings because three generations of booking wrote
 * three different links: member_id (this programme), guest_id through the
 * CRM (the stay engine), or nothing but an email (the widget and the app's
 * WebView). Every one of them is the member's history.
 */
class PortalBookingsTest extends MemberEndpointTestCase
{
    private const LIST = '/api/v1/member/portal/bookings';

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpCapturePendingSchema(); // service_bookings
        $this->setUpBookingRefundSchema();  // booking_mirror + hotel_settings

        $this->ensureColumns('service_bookings', [
            'member_id' => 'integer', 'guest_id' => 'integer', 'customer_email' => 'string', 'customer_name' => 'string',
            'booking_reference' => 'string', 'service_id' => 'integer', 'service_master_id' => 'integer',
            'start_at' => 'datetime', 'end_at' => 'datetime', 'status' => 'string', 'payment_status' => 'string',
            'total_amount' => 'decimal', 'currency' => 'string', 'party_size' => 'integer', 'customer_notes' => 'text',
            'cancelled_at' => 'datetime', 'organization_id' => 'integer',
        ]);
        $this->ensureColumns('booking_mirror', [
            'guest_id' => 'integer', 'guest_email' => 'string', 'guest_name' => 'string', 'booking_reference' => 'string',
            'apartment_name' => 'string', 'arrival_date' => 'date', 'departure_date' => 'date',
            'internal_status' => 'string', 'payment_status' => 'string', 'price_total' => 'decimal',
            'adults' => 'integer', 'children' => 'integer', 'organization_id' => 'integer',
        ]);
        if (!Schema::hasColumn('guests', 'member_id')) {
            Schema::table('guests', fn ($t) => $t->unsignedBigInteger('member_id')->nullable());
        }
    }

    private function ensureColumns(string $table, array $columns): void
    {
        foreach ($columns as $name => $type) {
            if (Schema::hasColumn($table, $name)) {
                continue;
            }
            Schema::table($table, function ($t) use ($name, $type) {
                match ($type) {
                    'integer'  => $t->unsignedBigInteger($name)->nullable(),
                    'decimal'  => $t->decimal($name, 10, 2)->nullable(),
                    'datetime' => $t->dateTime($name)->nullable(),
                    'date'     => $t->date($name)->nullable(),
                    'text'     => $t->text($name)->nullable(),
                    default    => $t->string($name)->nullable(),
                };
            });
        }
    }

    private function serviceBooking(Organization $org, array $attrs): int
    {
        return DB::table('service_bookings')->insertGetId(array_merge([
            'organization_id' => $org->id, 'booking_reference' => 'SVC-' . strtoupper(uniqid()),
            'customer_name' => 'Someone', 'customer_email' => 'other@example.test',
            'start_at' => now()->addDays(3), 'end_at' => now()->addDays(3)->addHour(),
            'status' => 'confirmed', 'payment_status' => 'unpaid', 'total_amount' => 60, 'currency' => 'EUR',
            'created_at' => now(), 'updated_at' => now(),
        ], $attrs));
    }

    private function stay(Organization $org, array $attrs): int
    {
        return DB::table('booking_mirror')->insertGetId(array_merge([
            'organization_id' => $org->id, 'booking_reference' => 'BK-' . strtoupper(uniqid()),
            'reservation_id' => 'LOCAL-' . uniqid(), 'guest_name' => 'Someone', 'guest_email' => 'other@example.test',
            'apartment_name' => 'Sea view', 'arrival_date' => now()->addDays(10)->toDateString(),
            'departure_date' => now()->addDays(12)->toDateString(), 'internal_status' => 'confirmed',
            'payment_status' => 'paid', 'price_total' => 240, 'adults' => 2, 'children' => 0,
            'created_at' => now(), 'updated_at' => now(),
        ], $attrs));
    }

    public function test_bookings_are_matched_by_member_id_by_linked_guest_and_by_email(): void
    {
        $org = $this->tenant();
        ['token' => $token, 'member' => $member, 'user' => $user] = $this->member($org);
        $guestId = DB::table('guests')->insertGetId([
            'organization_id' => $org->id, 'member_id' => $member->id, 'first_name' => 'App', 'last_name' => 'Member',
            'email' => 'linked@example.test', 'created_at' => now(), 'updated_at' => now(),
        ]);

        $byMember = $this->serviceBooking($org, ['member_id' => $member->id]);
        $byGuest  = $this->stay($org, ['guest_id' => $guestId]);
        $byEmail  = $this->serviceBooking($org, ['customer_email' => strtoupper($user->email)]);
        $this->serviceBooking($org, []); // somebody else's

        $json = $this->withToken($token)->getJson(self::LIST . '?scope=upcoming')->assertOk()->json();

        $ids = array_map(fn ($b) => $b['kind'] . ':' . $b['id'], $json['data']);
        $this->assertEqualsCanonicalizing(["service:$byMember", "stay:$byGuest", "service:$byEmail"], $ids);
        $this->assertSame(3, $json['meta']['total']);
    }

    public function test_bookings_are_matched_by_email_within_the_organisation(): void
    {
        $org = $this->tenant();
        ['token' => $token, 'user' => $user] = $this->member($org);
        $id = $this->serviceBooking($org, ['customer_email' => $user->email, 'member_id' => null, 'guest_id' => null]);

        $json = $this->withToken($token)->getJson(self::LIST . '?scope=upcoming')->assertOk()->json();

        $this->assertSame([$id], array_column($json['data'], 'id'));
    }

    public function test_a_booking_in_another_organisation_is_never_shown(): void
    {
        $a = $this->tenant('A');
        $b = $this->tenant('B');
        ['token' => $token, 'user' => $user] = $this->member($a);
        $this->serviceBooking($b, ['customer_email' => $user->email]);
        $foreign = $this->stay($b, ['guest_email' => $user->email]);

        $json = $this->withToken($token)->getJson(self::LIST . '?scope=upcoming')->assertOk()->json();
        $this->assertSame([], $json['data']);

        $this->withToken($token)->getJson(self::LIST . "/stay/{$foreign}")->assertStatus(404)->assertJsonPath('error', 'not_found');
    }

    public function test_upcoming_and_past_split_on_the_start_and_cancelled_rows_are_past(): void
    {
        $org = $this->tenant();
        ['token' => $token, 'member' => $member] = $this->member($org);
        $future    = $this->serviceBooking($org, ['member_id' => $member->id, 'start_at' => now()->addDay(), 'end_at' => now()->addDay()->addHour()]);
        $past      = $this->serviceBooking($org, ['member_id' => $member->id, 'start_at' => now()->subDay(), 'end_at' => now()->subDay()->addHour(), 'status' => 'completed']);
        $cancelled = $this->serviceBooking($org, ['member_id' => $member->id, 'status' => 'cancelled', 'cancelled_at' => now()]);

        $upcoming = $this->withToken($token)->getJson(self::LIST . '?scope=upcoming')->assertOk()->json('data');
        $this->flushHeaders();
        $pastRows = $this->withToken($token)->getJson(self::LIST . '?scope=past')->assertOk()->json('data');

        $this->assertSame([$future], array_column($upcoming, 'id'));
        $this->assertEqualsCanonicalizing([$past, $cancelled], array_column($pastRows, 'id'));
        $this->assertSame('completed', collect($pastRows)->firstWhere('id', $past)['status']);
    }

    public function test_the_detail_carries_what_the_sheet_shows(): void
    {
        $org = $this->tenant();
        ['token' => $token, 'member' => $member] = $this->member($org);
        $id = $this->serviceBooking($org, ['member_id' => $member->id, 'customer_notes' => 'Window seat please', 'party_size' => 2]);

        $json = $this->withToken($token)->getJson(self::LIST . "/service/{$id}")->assertOk()->json();

        $this->assertSame('service', $json['kind']);
        $this->assertStringStartsWith('SVC-', $json['reference']);
        $this->assertSame(60.0, $json['total']);
        $this->assertSame('EUR', $json['currency']);
        $this->assertSame('Window seat please', $json['notes']);
        $this->assertSame(2, $json['party_size']);
        $this->assertNull($json['discount']);
        $this->assertFalse($json['can_cancel']);
    }

    public function test_stays_follow_the_smoobu_integration_switch(): void
    {
        $org = $this->tenant();
        ['token' => $token, 'member' => $member] = $this->member($org);
        $guestId = DB::table('guests')->insertGetId([
            'organization_id' => $org->id, 'member_id' => $member->id, 'first_name' => 'A', 'last_name' => 'B',
            'email' => 'x@example.test', 'created_at' => now(), 'updated_at' => now(),
        ]);
        $this->stay($org, ['guest_id' => $guestId]);

        $this->assertCount(1, $this->withToken($token)->getJson(self::LIST . '?scope=upcoming')->json('data'));

        DB::table('hotel_settings')->insert([
            'organization_id' => $org->id, 'key' => 'smoobu_enabled', 'value' => 'false', 'type' => 'boolean',
            'group' => 'integrations', 'created_at' => now(), 'updated_at' => now(),
        ]);
        $this->flushHeaders();
        $this->assertCount(0, $this->withToken($token)->getJson(self::LIST . '?scope=upcoming')->json('data'));
    }

    public function test_the_bootstrap_counts_upcoming_bookings(): void
    {
        $org = $this->tenant();
        ['token' => $token, 'member' => $member] = $this->member($org);
        $this->serviceBooking($org, ['member_id' => $member->id]);
        $this->serviceBooking($org, ['member_id' => $member->id, 'start_at' => now()->subDays(2), 'end_at' => now()->subDays(2)->addHour()]);

        $this->withToken($token)->getJson('/api/v1/member/portal')->assertOk()->assertJsonPath('counts.upcoming_bookings', 1);
    }
}
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
cd /c/wamp64/www/Hexa-Tech-portal && /c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Member/Portal/PortalBookingsTest.php
```
Expected: FAIL — 404 on the list route; the bootstrap count test fails on `1` vs `0`.

- [ ] **Step 3: Write the query service**

`app/Services/Portal/MemberBookingQuery.php`:
```php
<?php

namespace App\Services\Portal;

use App\Models\BookingMirror;
use App\Models\Guest;
use App\Models\HotelSetting;
use App\Models\LoyaltyMember;
use App\Models\ServiceBooking;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

/**
 * The member's bookings as one list, whatever table they came from.
 *
 * A booking belongs to the member when, inside the member's organisation,
 * it names their member_id, or a guest linked to them, or simply their
 * email. The email rule is what gives a member the history the widget and
 * the app's WebView wrote before anything linked a member at all.
 *
 * Mirrors are read through the Smoobu integration scope exactly as staff
 * read them, so a venue that switched Smoobu off hides the same rows here.
 */
final class MemberBookingQuery
{
    public const UPCOMING = 'upcoming';
    public const PAST     = 'past';

    /** Statuses that mean the appointment never happens. */
    private const SERVICE_DEAD = ['cancelled', 'no_show'];
    private const STAY_DEAD    = ['cancelled', 'no-show', 'no_show'];

    public function list(LoyaltyMember $member, string $scope, int $page = 1, int $perPage = 20): array
    {
        $rows = $this->all($member, $scope);
        $page = max(1, $page);

        return [
            'data' => $rows->forPage($page, $perPage)->values()->all(),
            'meta' => ['scope' => $scope, 'page' => $page, 'per_page' => $perPage, 'total' => $rows->count()],
        ];
    }

    public function count(LoyaltyMember $member, string $scope): int
    {
        return $this->all($member, $scope)->count();
    }

    public function find(LoyaltyMember $member, string $kind, int $id): ?array
    {
        if ($kind === 'service') {
            $row = $this->services($member)->with(['service', 'master'])->whereKey($id)->first();
            return $row ? self::serviceDto($row) : null;
        }
        if ($kind === 'stay') {
            $row = $this->stays($member)->whereKey($id)->first();
            return $row ? self::stayDto($row) : null;
        }
        return null;
    }

    private function all(LoyaltyMember $member, string $scope): Collection
    {
        $upcoming = $scope === self::UPCOMING;

        $services = $this->services($member)->with(['service', 'master'])->get()
            ->map(fn (ServiceBooking $b) => self::serviceDto($b));
        $stays = $this->stays($member)->get()
            ->map(fn (BookingMirror $m) => self::stayDto($m));

        $rows = $services->concat($stays)->filter(function (array $dto) use ($upcoming) {
            $ends = $dto['ends_at'] ?? $dto['starts_at'];
            $live = !in_array($dto['status'], ['cancelled', 'no_show', 'completed'], true)
                && $ends !== null && strtotime($ends) >= time();
            return $upcoming ? $live : !$live;
        });

        return $upcoming
            ? $rows->sortBy(fn ($d) => $d['starts_at'] ?? '')->values()
            : $rows->sortByDesc(fn ($d) => $d['starts_at'] ?? '')->values();
    }

    private function services(LoyaltyMember $member): Builder
    {
        return $this->owned(
            ServiceBooking::query()->withoutGlobalScopes()->where('service_bookings.organization_id', $member->organization_id),
            $member, 'member_id', 'guest_id', 'customer_email',
        );
    }

    private function stays(LoyaltyMember $member): Builder
    {
        // No member_id column until phase 3; keep TenantScope (the request
        // has bound the tenant) and the Smoobu scope, and name the org too.
        return $this->owned(
            BookingMirror::query()->where('booking_mirror.organization_id', $member->organization_id),
            $member, null, 'guest_id', 'guest_email',
        );
    }

    private function owned(Builder $query, LoyaltyMember $member, ?string $memberColumn, string $guestColumn, string $emailColumn): Builder
    {
        $guestIds = Guest::withoutGlobalScopes()
            ->where('organization_id', $member->organization_id)
            ->where('member_id', $member->id)
            ->pluck('id')
            ->all();
        $email = mb_strtolower(trim((string) ($member->user?->email ?? '')));

        return $query->where(function (Builder $q) use ($member, $memberColumn, $guestColumn, $guestIds, $emailColumn, $email) {
            $any = false;
            if ($memberColumn) {
                $q->where($memberColumn, $member->id);
                $any = true;
            }
            if ($guestIds) {
                $any ? $q->orWhereIn($guestColumn, $guestIds) : $q->whereIn($guestColumn, $guestIds);
                $any = true;
            }
            if ($email !== '') {
                $any ? $q->orWhereRaw("LOWER({$emailColumn}) = ?", [$email]) : $q->whereRaw("LOWER({$emailColumn}) = ?", [$email]);
                $any = true;
            }
            if (!$any) {
                $q->whereRaw('1 = 0');
            }
        });
    }

    public static function serviceDto(ServiceBooking $b): array
    {
        $status = in_array($b->status, self::SERVICE_DEAD, true) ? 'cancelled' : $b->status;

        return [
            'kind'            => 'service',
            'id'              => $b->id,
            'reference'       => $b->booking_reference,
            'title'           => $b->service?->name ?? 'Service',
            'subtitle'        => $b->master?->name,
            'starts_at'       => $b->start_at?->toIso8601String(),
            'ends_at'         => $b->end_at?->toIso8601String(),
            'status'          => $status,
            'payment_status'  => $b->payment_status,
            'total'           => (float) $b->total_amount,
            'currency'        => strtoupper((string) ($b->currency ?: 'EUR')),
            'discount'        => null,
            'can_cancel'      => false,
            'cancel_deadline' => null,
            'notes'           => $b->customer_notes,
            'party_size'      => $b->party_size !== null ? (int) $b->party_size : null,
            'guests'          => null,
        ];
    }

    public static function stayDto(BookingMirror $m): array
    {
        $internal = (string) $m->internal_status;
        $status = match (true) {
            in_array($internal, self::STAY_DEAD, true) => 'cancelled',
            $internal === 'checked-out'               => 'completed',
            $internal === 'checked-in'                => 'in_progress',
            default                                   => 'confirmed',
        };
        $nights = ($m->arrival_date && $m->departure_date) ? $m->arrival_date->diffInDays($m->departure_date) : null;
        $guests = (int) $m->adults + (int) $m->children;

        return [
            'kind'            => 'stay',
            'id'              => $m->id,
            'reference'       => $m->booking_reference ?: (string) $m->reservation_id,
            'title'           => $m->apartment_name ?: 'Stay',
            'subtitle'        => $nights !== null ? "{$nights}n · {$guests}p" : null,
            'starts_at'       => $m->arrival_date?->toDateString(),
            'ends_at'         => $m->departure_date?->toDateString(),
            'status'          => $status,
            'payment_status'  => $m->payment_status instanceof \BackedEnum ? $m->payment_status->value : (string) $m->payment_status,
            'total'           => (float) $m->price_total,
            'currency'        => strtoupper((string) HotelSetting::getValue('booking_currency', 'EUR')),
            'discount'        => null,
            'can_cancel'      => false,
            'cancel_deadline' => null,
            'notes'           => null,
            'party_size'      => null,
            'guests'          => $guests,
        ];
    }
}
```

The `subtitle` for stays is a compact code (`2n · 2p`); the portal renders it through `t('portal.bookings.nights_guests', ...)` from `nights`/`guests` instead of showing the code. Add `'nights' => $nights` to the stay DTO right after `'guests'` and `'nights' => null` to the service DTO, so the client has the numbers.

- [ ] **Step 4: Write the controller, the routes, and wire the count**

`app/Http/Controllers/Api/V1/Member/Portal/PortalBookingController.php`:
```php
<?php

namespace App\Http\Controllers\Api\V1\Member\Portal;

use App\Http\Controllers\Controller;
use App\Services\Portal\MemberBookingQuery;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PortalBookingController extends Controller
{
    public function __construct(private MemberBookingQuery $bookings)
    {
    }

    /** GET /v1/member/portal/bookings?scope=upcoming|past&page=N */
    public function index(Request $request): JsonResponse
    {
        $member = $request->user()->loyaltyMember;
        if (!$member) {
            return response()->json(['data' => [], 'meta' => ['scope' => 'upcoming', 'page' => 1, 'per_page' => 20, 'total' => 0]]);
        }

        $scope = $request->query('scope') === MemberBookingQuery::PAST ? MemberBookingQuery::PAST : MemberBookingQuery::UPCOMING;
        $page = max(1, (int) $request->query('page', 1));

        return response()->json($this->bookings->list($member, $scope, $page));
    }

    /** GET /v1/member/portal/bookings/{kind}/{id} */
    public function show(Request $request, string $kind, int $id): JsonResponse
    {
        $member = $request->user()->loyaltyMember;
        $dto = $member ? $this->bookings->find($member, $kind, $id) : null;

        if (!$dto) {
            return response()->json(['error' => 'not_found', 'message' => 'We could not find that booking.'], 404);
        }

        return response()->json($dto);
    }
}
```

In `routes/api.php`, inside the `member/portal` group added in Task 3, after the `Route::get('/', …)` line:
```php
            Route::get('bookings', [\App\Http\Controllers\Api\V1\Member\Portal\PortalBookingController::class, 'index']);
            Route::get('bookings/{kind}/{id}', [\App\Http\Controllers\Api\V1\Member\Portal\PortalBookingController::class, 'show'])
                ->whereIn('kind', ['service', 'stay'])
                ->whereNumber('id');
```

In `PortalBootstrap.php`: add `private MemberBookingQuery $bookings,` as the last constructor parameter, and replace the `upcomingBookings()` method body with `return $this->bookings->count($member, MemberBookingQuery::UPCOMING);` (delete the "Task 4 replaces this" comment).

- [ ] **Step 5: Run the tests**

```bash
cd /c/wamp64/www/Hexa-Tech-portal && /c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Member/
```
Expected: `Tests:` 0 failed.

If `BookingMirror`'s `payment_status` is cast to the `PaymentStatus` enum on read and the minimal table stores a plain string, the `instanceof \BackedEnum` branch handles both.

- [ ] **Step 6: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-portal && git add app/Services/Portal/MemberBookingQuery.php app/Services/Portal/PortalBootstrap.php app/Http/Controllers/Api/V1/Member/Portal/PortalBookingController.php routes/api.php tests/Feature/Member/Portal/PortalBookingsTest.php && git commit -q -F - <<'EOF'
List a member's bookings from both engines as one thing

"My bookings" read the legacy bookings table, which only the demo
seeder writes. MemberBookingQuery unions service_bookings and
booking_mirror into one DTO, owned by member_id, by a linked guest or
by the member's email inside their organisation, and splits upcoming
from past on the end time. Mirrors keep the Smoobu integration scope
staff already see them through.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 5: Portal links in the welcome and membership emails

**Files:**
- Modify: `app/Mail/WelcomeMemberMail.php:39-52`, `app/Mail/BookingMembershipMail.php:44-55`, `resources/views/emails/welcome-member.blade.php:53-71`, `resources/views/emails/booking-membership.blade.php:59-77`
- Test: `tests/Feature/Mail/MemberPortalLinksInMailTest.php`

**Interfaces:**
- Consumes: `PortalLinks::claim()` (Task 2).
- Produces: both views receive `$portalUrl` (string|null) and render the claim link when it is set.

- [ ] **Step 1: Write the failing test**

```php
<?php

namespace Tests\Feature\Mail;

use App\Mail\BookingMembershipMail;
use App\Mail\WelcomeMemberMail;
use App\Models\Organization;
use Tests\Feature\Member\MemberEndpointTestCase;

/**
 * Both activation emails told a member to tap "Forgot password" on a login
 * screen; the flow they describe is /portal/claim. The link has to be in
 * the email, or the member is left guessing which app to install.
 */
class MemberPortalLinksInMailTest extends MemberEndpointTestCase
{
    public function test_the_welcome_email_links_to_the_claim_page(): void
    {
        config(['app.url' => 'https://app.example.test']);
        $org = $this->tenant();
        ['member' => $member] = $this->member($org);
        $member->load(['user', 'tier']);

        $html = (new WelcomeMemberMail($member, $org, '123456'))->render();

        $this->assertStringContainsString('https://app.example.test/portal/claim', $html);
        $this->assertStringNotContainsString('Forgot password', $html);
        $this->assertStringContainsString('123456', $html);
    }

    public function test_the_booking_membership_email_links_to_the_claim_page(): void
    {
        config(['app.url' => 'https://app.example.test']);
        $org = Organization::create(['name' => 'Seaside', 'slug' => 'seaside-' . uniqid()]);
        app()->instance('current_organization_id', $org->id);

        $html = (new BookingMembershipMail('Ada', 'Seaside', 'HL-1', 'Bronze', 'ada@example.test', '654321'))->render();

        $this->assertStringContainsString('https://app.example.test/portal/claim', $html);
        $this->assertStringNotContainsString('Forgot password', $html);
    }

    public function test_without_an_app_url_in_production_the_link_is_left_out_rather_than_wrong(): void
    {
        config(['app.url' => '']);
        app()->detectEnvironment(fn () => 'production');
        $org = $this->tenant();
        ['member' => $member] = $this->member($org);
        $member->load(['user', 'tier']);

        $html = (new WelcomeMemberMail($member, $org, '123456'))->render();

        $this->assertStringNotContainsString('localhost', $html);
        $this->assertStringContainsString('member portal', $html);
    }
}
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
cd /c/wamp64/www/Hexa-Tech-portal && /c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Mail/MemberPortalLinksInMailTest.php
```
Expected: FAIL — the rendered HTML has no `/portal/claim` and still says "Forgot password".

- [ ] **Step 3: Pass the link from both mailables**

`WelcomeMemberMail::content()` — add `'portalUrl' => \App\Services\Portal\PortalLinks::claim(),` after the `'code'` line of the `with` array.

`BookingMembershipMail::content()` — the `with` array becomes:
```php
            with: [
                'industry'  => $industry,
                'profile'   => $profile,
                'portalUrl' => \App\Services\Portal\PortalLinks::claim(),
            ],
```

- [ ] **Step 4: Rewrite the "How to activate" panel in both views**

In `resources/views/emails/welcome-member.blade.php`, replace lines 53-71 (the whole `<div class="panel">…</div>` for "How to activate") with:
```blade
    <div class="panel">
        <div class="panel-title">How to activate</div>
        @if (!empty($portalUrl))
        <p style="margin:0 0 8px;">
            <strong style="color:#e3c66a;">1.</strong>
            Open the member portal:
            <a href="{{ $portalUrl }}" style="color:#e3c66a;font-weight:600;">{{ $portalUrl }}</a>
        </p>
        @else
        <p style="margin:0 0 8px;">
            <strong style="color:#e3c66a;">1.</strong>
            Open the <strong style="color:#ffffff;">{{ $hotelName }}</strong> member portal or member app.
        </p>
        @endif
        <p style="margin:0 0 8px;">
            <strong style="color:#e3c66a;">2.</strong>
            Enter your email <strong style="color:#ffffff;">{{ $email }}</strong> and ask for a code.
        </p>
        <p style="margin:0;">
            <strong style="color:#e3c66a;">3.</strong>
            Enter the 6-digit code above and choose your password.
        </p>
    </div>
```

In `resources/views/emails/booking-membership.blade.php`, replace lines 59-77 (the "How to activate" panel) with the same block — `$hotelName` and `$email` are public properties of that mailable, so the view already sees them.

- [ ] **Step 5: Clear views, run the mail suites**

```bash
cd /c/wamp64/www/Hexa-Tech-portal && /c/wamp64/bin/php/php8.4.20/php.exe artisan view:clear && /c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Mail/
```
Expected: `Tests:` 0 failed (the existing `BookingMembershipMailTest` keeps passing — it asserts the code and the venue sender, not the old step text; if it asserted "Forgot password", update that one assertion to the new sentence).

- [ ] **Step 6: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-portal && git add app/Mail/WelcomeMemberMail.php app/Mail/BookingMembershipMail.php resources/views/emails/welcome-member.blade.php resources/views/emails/booking-membership.blade.php tests/Feature/Mail/MemberPortalLinksInMailTest.php && git commit -q -F - <<'EOF'
Point activation emails at the portal's claim page

Both emails described "Forgot password" on a login screen; the flow a
new member actually takes is /portal/claim. The link is rendered when
app.url is known and left out, never wrong, when it is not.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 6: The operator's join link — endpoint and Members hub tab

**Files:**
- Create: `app/Http/Controllers/Api/V1/Admin/MemberPortalLinkController.php`, `frontend/src/components/MemberPortalLinkCard.tsx`
- Modify: `routes/api.php` (admin group, next to the `members/stats` route — find it with `grep -n "members/stats" routes/api.php`), `frontend/src/pages/hubs/MembersHub.tsx`, the five `frontend/src/i18n/locales/<lang>/common.json`
- Test: `tests/Feature/Admin/MemberPortalLinkTest.php`

**Interfaces:**
- Consumes: `PortalLinks::join()/claim()` (Task 2), `QrCodeService::urlQrDataUri(string $url): string` (existing).
- Produces: `GET /api/v1/admin/member-portal/link` → `{url, claim_url, qr}` (`qr` is a data URI), 422 `{error: 'no_widget_token'}` when the organisation has none.

- [ ] **Step 1: Write the failing test**

```php
<?php

namespace Tests\Feature\Admin;

use App\Models\Organization;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * No admin screen showed the portal join link; tenants had to assemble
 * `/portal/join?org=<token>` by hand from a widget snippet. This endpoint
 * is what the Members hub card reads.
 */
class MemberPortalLinkTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema;

    private const ENDPOINT = '/api/v1/admin/member-portal/link';

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltySchema();
        if (!Schema::hasTable('staff')) {
            Schema::create('staff', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id');
                $table->unsignedBigInteger('user_id');
                $table->string('role', 32)->default('manager');
                $table->timestamps();
            });
        }
        config(['app.url' => 'https://app.example.test']);
    }

    private function staff(Organization $org): User
    {
        $user = User::create([
            'organization_id' => $org->id, 'name' => 'Desk', 'email' => 'desk_' . uniqid() . '@example.test',
            'password' => 'x', 'user_type' => 'staff',
        ]);
        DB::table('staff')->insert([
            'organization_id' => $org->id, 'user_id' => $user->id, 'role' => 'manager',
            'created_at' => now(), 'updated_at' => now(),
        ]);
        return $user;
    }

    public function test_staff_get_the_join_link_the_claim_link_and_a_qr(): void
    {
        $org = Organization::create(['name' => 'Seaside', 'slug' => 'seaside-' . uniqid(), 'subscription_status' => 'ACTIVE']);
        Sanctum::actingAs($this->staff($org));

        $json = $this->getJson(self::ENDPOINT)->assertOk()->json();

        $this->assertSame('https://app.example.test/portal/join?org=' . urlencode($org->fresh()->widget_token), $json['url']);
        $this->assertSame('https://app.example.test/portal/claim', $json['claim_url']);
        $this->assertStringStartsWith('data:image/', $json['qr']);
    }

    public function test_it_is_staff_only(): void
    {
        $this->getJson(self::ENDPOINT)->assertStatus(401);
    }
}
```

If the admin middleware chain in this fixture needs more tables than `setUpLoyaltySchema()` creates (it creates brands, loyalty_tiers, loyalty_members), copy the table the failing message names from the guard used in `tests/Feature/Loyalty/SettingsSecretFallbackTest.php`, which already drives an admin route through the same chain.

- [ ] **Step 2: Run it to make sure it fails**

```bash
cd /c/wamp64/www/Hexa-Tech-portal && /c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Admin/MemberPortalLinkTest.php
```
Expected: FAIL with 404 for the staff case.

- [ ] **Step 3: Write the controller and the route**

`app/Http/Controllers/Api/V1/Admin/MemberPortalLinkController.php`:
```php
<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Organization;
use App\Services\Portal\PortalLinks;
use App\Services\QrCodeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** The link a venue prints, shares and puts on a QR at the desk. */
class MemberPortalLinkController extends Controller
{
    public function show(Request $request, QrCodeService $qr): JsonResponse
    {
        $org = Organization::withoutGlobalScopes()->find($request->user()->organization_id);
        $token = $org?->widget_token;

        if (!$token) {
            return response()->json([
                'error'   => 'no_widget_token',
                'message' => 'This organisation has no widget token yet; save Settings once to create one.',
            ], 422);
        }

        $url = PortalLinks::join($token);
        if (!$url) {
            return response()->json([
                'error'   => 'no_app_url',
                'message' => 'APP_URL is not configured, so no absolute link can be built.',
            ], 422);
        }

        return response()->json([
            'url'       => $url,
            'claim_url' => PortalLinks::claim(),
            'qr'        => $qr->urlQrDataUri($url),
        ]);
    }
}
```

In `routes/api.php`, inside the `Route::prefix('admin')->middleware(['admin', 'check.subscription'])` group, next to the `members/stats` route, add:
```php
            // The portal join link + QR for the Members hub card.
            Route::get('member-portal/link', [\App\Http\Controllers\Api\V1\Admin\MemberPortalLinkController::class, 'show']);
```

- [ ] **Step 4: Run the test**

```bash
cd /c/wamp64/www/Hexa-Tech-portal && /c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Admin/MemberPortalLinkTest.php
```
Expected: `Tests:` 2 passed.

- [ ] **Step 5: The hub card**

`frontend/src/components/MemberPortalLinkCard.tsx`:
```tsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Copy, Check, Loader2, Link2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '../lib/api'

interface LinkPayload { url: string; claim_url: string | null; qr: string }

/**
 * The join link and its QR, for the desk. Members who already exist from
 * an import use the claim link instead; both are shown so staff can answer
 * "how do I get in" with one glance.
 */
export function MemberPortalLinkCard() {
  const { t } = useTranslation()
  const [copied, setCopied] = useState<string | null>(null)
  const { data, isLoading, isError, error } = useQuery<LinkPayload>({
    queryKey: ['member-portal-link'],
    queryFn: () => api.get('/v1/admin/member-portal/link').then(r => r.data),
    retry: false,
  })

  const copy = async (value: string, which: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(which)
      setTimeout(() => setCopied(null), 1800)
    } catch {
      toast.error(t('members.portal.copy_failed', 'Could not copy — select the link and copy it by hand'))
    }
  }

  if (isLoading) {
    return <div className="flex justify-center py-10 text-t-secondary"><Loader2 className="animate-spin" size={20} /></div>
  }

  if (isError || !data) {
    const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message
    return (
      <div className="rounded-xl border border-dark-border bg-dark-surface p-5 text-sm text-t-secondary">
        {message || t('members.portal.unavailable', 'The portal link is not available yet.')}
      </div>
    )
  }

  const Row = ({ label, value, which }: { label: string; value: string; which: string }) => (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-t-secondary mb-1">{label}</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 min-w-0 truncate bg-dark-surface2 border border-dark-border rounded-lg px-3 py-2 text-xs text-white">{value}</code>
        <button
          onClick={() => copy(value, which)}
          aria-label={t('members.portal.copy', 'Copy link')}
          className="shrink-0 border border-dark-border rounded-lg p-2 text-t-secondary hover:text-white"
        >
          {copied === which ? <Check size={15} className="text-accent" /> : <Copy size={15} />}
        </button>
      </div>
    </div>
  )

  return (
    <div className="grid md:grid-cols-[1fr_auto] gap-6 rounded-xl border border-dark-border bg-dark-surface p-5">
      <div className="space-y-4 min-w-0">
        <div className="flex items-center gap-2">
          <Link2 size={16} className="text-primary-400" />
          <h2 className="text-base font-semibold text-white">{t('members.portal.title', 'Member portal')}</h2>
        </div>
        <p className="text-sm text-t-secondary">
          {t('members.portal.intro', 'Share the join link with new customers. People you imported set their password through the second link.')}
        </p>
        <Row label={t('members.portal.join_link', 'Join link')} value={data.url} which="join" />
        {data.claim_url && <Row label={t('members.portal.claim_link', 'Existing customers')} value={data.claim_url} which="claim" />}
      </div>
      <div className="flex flex-col items-center gap-2">
        <img src={data.qr} alt={t('members.portal.qr_alt', 'QR code for the join link')} className="w-40 h-40 rounded-lg bg-white p-2" />
        <a href={data.qr} download="member-portal-join.png" className="text-xs text-primary-400 hover:text-primary-300">
          {t('members.portal.download_qr', 'Download QR')}
        </a>
      </div>
    </div>
  )
}
```

In `frontend/src/pages/hubs/MembersHub.tsx`, add the import `import { Smartphone } from 'lucide-react'` (extend the existing lucide import) and `import { MemberPortalLinkCard } from '../../components/MemberPortalLinkCard'`, then append a fourth tab after `segments`:
```tsx
        {
          key: 'portal',
          label: 'Member portal',
          icon: <Smartphone size={15} />,
          description: 'The link and QR your customers use to join or sign in.',
          render: () => <MemberPortalLinkCard />,
        },
```

Add the keys to each `frontend/src/i18n/locales/<lang>/common.json` under a new top-level `"members"` group if the file has none, else inside the existing `members` object, as a `"portal"` object:

| key | en | ru | de | fr | es |
|---|---|---|---|---|---|
| title | Member portal | Портал участника | Mitgliederportal | Portail membre | Portal de miembros |
| intro | Share the join link with new customers. People you imported set their password through the second link. | Отправьте ссылку для регистрации новым клиентам. Импортированные участники задают пароль по второй ссылке. | Teilen Sie den Beitrittslink mit neuen Kunden. Importierte Mitglieder setzen ihr Passwort über den zweiten Link. | Partagez le lien d'inscription avec vos nouveaux clients. Les membres importés définissent leur mot de passe via le second lien. | Comparta el enlace de registro con los nuevos clientes. Los miembros importados crean su contraseña con el segundo enlace. |
| join_link | Join link | Ссылка для регистрации | Beitrittslink | Lien d'inscription | Enlace de registro |
| claim_link | Existing customers | Существующие клиенты | Bestehende Kunden | Clients existants | Clientes existentes |
| copy | Copy link | Скопировать ссылку | Link kopieren | Copier le lien | Copiar enlace |
| copy_failed | Could not copy — select the link and copy it by hand | Не удалось скопировать — выделите ссылку и скопируйте вручную | Kopieren fehlgeschlagen – Link markieren und manuell kopieren | Copie impossible — sélectionnez le lien et copiez-le manuellement | No se pudo copiar: seleccione el enlace y cópielo a mano |
| qr_alt | QR code for the join link | QR-код ссылки для регистрации | QR-Code des Beitrittslinks | Code QR du lien d'inscription | Código QR del enlace de registro |
| download_qr | Download QR | Скачать QR | QR herunterladen | Télécharger le QR | Descargar QR |
| unavailable | The portal link is not available yet. | Ссылка на портал пока недоступна. | Der Portal-Link ist noch nicht verfügbar. | Le lien du portail n'est pas encore disponible. | El enlace del portal aún no está disponible. |

- [ ] **Step 6: Type-check and run the frontend tests**

Create the junction if it does not exist yet, then:
```bash
cd /c/wamp64/www/Hexa-Tech-portal/frontend && npx tsc -b && npx vitest run 2>&1 | tail -15
```
Expected: `tsc` silent; vitest shows only the 3 pre-existing `plannerMeta` failures.

- [ ] **Step 7: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-portal && git add app/Http/Controllers/Api/V1/Admin/MemberPortalLinkController.php routes/api.php frontend/src/components/MemberPortalLinkCard.tsx frontend/src/pages/hubs/MembersHub.tsx frontend/src/i18n/locales tests/Feature/Admin/MemberPortalLinkTest.php && git commit -q -F - <<'EOF'
Show operators the member portal's join link

No admin screen built /portal/join?org=<token>; venues had to lift the
token from a widget snippet. The Members hub gains a tab with the join
link, the claim link for imported members and a QR to print.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 7: The portal's install manifest

**Files:**
- Modify: `routes/web.php:619-662`
- Test: `tests/Feature/Pwa/WebManifestTest.php` (append two tests)

**Interfaces:**
- Produces: `GET /manifest.webmanifest?app=portal` → name `"<short_name> Member"`, `short_name: "Member"`, `id`/`start_url`: `/portal`, no shortcuts, light colours. Task 10's provider swaps the `<link rel="manifest">` to this URL for members.

- [ ] **Step 1: Write the failing tests** (append inside the class in `WebManifestTest.php`)

```php
    public function test_the_portal_variant_starts_in_the_portal_and_drops_admin_shortcuts(): void
    {
        $m = $this->get('http://beauty-tech.uk/manifest.webmanifest?app=portal')->assertOk()->json();

        $this->assertSame('BeautyTech Member', $m['name']);
        $this->assertSame('Member', $m['short_name']);
        $this->assertSame('/portal', $m['start_url']);
        $this->assertSame('/portal', $m['id']);
        $this->assertSame('/', $m['scope']);
        $this->assertSame([], $m['shortcuts']);
        $this->assertSame('#F7F6F3', $m['theme_color']);
        $this->assertContains('192x192', array_column($m['icons'], 'sizes'));
    }

    public function test_the_admin_manifest_is_unchanged_by_the_portal_variant(): void
    {
        $m = $this->manifest();

        $this->assertSame('/', $m['start_url']);
        $this->assertNotSame([], $m['shortcuts']);
    }
```

- [ ] **Step 2: Run them to make sure they fail**

```bash
cd /c/wamp64/www/Hexa-Tech-portal && /c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Pwa/WebManifestTest.php
```
Expected: FAIL on `name` ("BeautyTech Admin" vs "BeautyTech Member").

- [ ] **Step 3: Branch the manifest route**

Replace the body of the closure in `routes/web.php:619-662` with:
```php
Route::get('/manifest.webmanifest', function (\Illuminate\Http\Request $request) {
    $brand = config('pwa.hosts')[strtolower($request->getHost())] ?? config('pwa.default');
    // The member portal installs as its own app: a member's home screen
    // must not read "… Admin" nor open on the staff dashboard.
    $portal = $request->query('app') === 'portal';

    $icon = fn (string $file, int $size, string $purpose) => [
        'src'     => '/spa/pwa/' . $file,
        'sizes'   => $size . 'x' . $size,
        'type'    => 'image/png',
        'purpose' => $purpose,
    ];

    $icons = [
        $icon('icon-192.png', 192, 'any'),
        $icon('icon-512.png', 512, 'any'),
        // Windows and Android crop icons to their own shape; the maskable
        // variant keeps the mark inside the safe area so it survives that.
        $icon('icon-maskable-512.png', 512, 'maskable'),
    ];

    return response()->json([
        'id'               => $portal ? '/portal' : '/',
        'name'             => $portal ? $brand['short_name'] . ' Member' : $brand['name'],
        'short_name'       => $portal ? 'Member' : $brand['short_name'],
        'start_url'        => $portal ? '/portal' : '/',
        'scope'            => '/',
        'display'          => 'standalone',
        'orientation'      => 'any',
        'theme_color'      => $portal ? '#F7F6F3' : config('pwa.theme_color'),
        'background_color' => $portal ? '#F7F6F3' : config('pwa.background_color'),
        'categories'       => $portal ? ['lifestyle'] : ['business', 'productivity'],

        // Clicking the taskbar icon while a window is already open should
        // raise that window, not open a second copy of the same console.
        'launch_handler'   => ['client_mode' => 'focus-existing'],

        'icons' => $icons,

        'shortcuts' => $portal ? [] : array_map(fn ($s) => [
            'name' => $s['name'],
            'url'  => $s['url'],
            'icons' => [$icon('icon-192.png', 192, 'any')],
        ], config('pwa.shortcuts')),
    ], 200, [
        'Content-Type'  => 'application/manifest+json',
        'Cache-Control' => 'public, max-age=3600',
    ], JSON_UNESCAPED_SLASHES);
});
```

- [ ] **Step 4: Run the Pwa suite**

```bash
cd /c/wamp64/www/Hexa-Tech-portal && /c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Pwa/
```
Expected: `Tests:` 0 failed.

- [ ] **Step 5: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-portal && git add routes/web.php tests/Feature/Pwa/WebManifestTest.php && git commit -q -F - <<'EOF'
Let the member portal install under its own name

?app=portal on the manifest answers "<Sub-brand> Member", starts in
/portal, drops the admin jump list and paints the portal's light chrome.
The admin manifest is byte-for-byte what it was.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 8: Portal design tokens, Tailwind namespace, theme writer, formatters, the sweep

**Files:**
- Create: `frontend/src/portal/theme/portal.css`, `frontend/src/portal/theme/applyPortalTheme.ts`, `frontend/src/portal/lib/money.ts`, `frontend/src/portal/lib/dates.ts`, `frontend/src/portal/tokens.test.ts`, `frontend/src/portal/theme/applyPortalTheme.test.ts`, `frontend/src/portal/lib/format.test.ts`
- Modify: `frontend/tailwind.config.js`, `frontend/src/index.css:1-3` (one import line)

**Interfaces:**
- Produces: Tailwind classes `bg-p-bg`, `bg-p-surface`, `bg-p-surface-2`, `text-p-text`, `text-p-text-2`, `border-p-border`, `bg-p-accent`, `text-p-accent-ink`, `text-p-accent-deep`, `text-p-success`, `text-p-warning`, `text-p-danger` (each with `/alpha`), `rounded-p-card`, `rounded-p-control`, `font-p-display`, `font-p-body`, `shadow-p`.
- Produces: `applyPortalTheme(root: HTMLElement, theme: PortalThemeInput): void`, `clearPortalTheme(root: HTMLElement): void`, `DISPLAY_FACE_STACKS: Record<string, string>`; `formatMoney(amount: number, currency: string, locale: string): string`; `formatDay(iso: string, locale: string): string`; `formatDateTime(iso: string, locale: string, timeZone?: string): string`; `formatTime(iso: string, locale: string, timeZone?: string): string`.
- The portal root element carries `data-portal` (Task 11's shell sets it; Task 16's join/claim pages set it too).

- [ ] **Step 1: Create the node_modules junction and confirm the toolchain**

```bash
cmd /c "if not exist C:\wamp64\www\Hexa-Tech-portal\frontend\node_modules mklink /J C:\wamp64\www\Hexa-Tech-portal\frontend\node_modules C:\wamp64\www\Hexa-Tech\frontend\node_modules"
cd /c/wamp64/www/Hexa-Tech-portal/frontend && npx tsc -b && npx vitest run 2>&1 | tail -5
```
Expected: `tsc` silent; vitest summary shows only the 3 known `plannerMeta` failures. (If `npm install` was run in the main checkout after a pull, the junction shares it.)

- [ ] **Step 2: Write the failing tests**

`frontend/src/portal/tokens.test.ts` — the sweep:
```ts
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * The portal's two hard rules, enforced on the source rather than remembered:
 *
 *  1. Only `p-*` colour tokens. An admin class (`bg-dark-surface`,
 *     `text-white`, `text-primary-400`) inside the portal paints a member's
 *     screen in the staff console's dark palette the moment the admin theme
 *     changes, and reads as a second design language the moment it doesn't.
 *  2. No admin endpoint. `/v1/admin/*` answers 403 to a member and, for a
 *     lapsed tenant, fires the subscription wall on a screen that has no
 *     subscription to sell.
 */
const PORTAL_DIR = path.resolve(__dirname)

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir).flatMap(entry => {
    const full = path.join(dir, entry)
    if (fs.statSync(full).isDirectory()) return sourceFiles(full)
    return /\.(tsx?|css)$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : []
  })
}

const FORBIDDEN_CLASS = /(?:^|[\s'"`{(])(?:hover:|focus:|focus-visible:|active:|disabled:|sm:|md:|lg:)*(?:bg|text|border|ring|divide|placeholder|from|to|via|outline|fill|stroke)-(?:dark-[a-z0-9]+|primary-\d{2,3}|t-primary|t-secondary|t-muted|white|black|accent|error|warning|info)(?:\/\d+)?(?=[\s'"`)}])/

describe('portal token sweep', () => {
  const files = sourceFiles(PORTAL_DIR)

  it('actually scans the portal (the folder is not empty)', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  for (const file of files) {
    const rel = path.relative(PORTAL_DIR, file)
    const source = fs.readFileSync(file, 'utf8')

    it(`${rel} uses only p-* colour classes`, () => {
      const lines = source.split('\n')
      const hits = lines
        .map((line, i) => (FORBIDDEN_CLASS.test(line) ? `${i + 1}: ${line.trim()}` : null))
        .filter((x): x is string => x !== null)
      expect(hits, `admin colour classes in ${rel}:\n${hits.join('\n')}`).toEqual([])
    })

    it(`${rel} never calls an admin endpoint`, () => {
      expect(source.includes('/v1/admin/'), `${rel} references /v1/admin/`).toBe(false)
    })
  }
})
```

`frontend/src/portal/theme/applyPortalTheme.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { applyPortalTheme, clearPortalTheme, DISPLAY_FACE_STACKS } from './applyPortalTheme'

/** A tiny stand-in for an element's inline style, enough for the writer. */
function fakeRoot() {
  const vars = new Map<string, string>()
  return {
    vars,
    style: {
      setProperty: (k: string, v: string) => { vars.set(k, v) },
      removeProperty: (k: string) => { vars.delete(k) },
    },
  } as unknown as HTMLElement & { vars: Map<string, string> }
}

const THEME = {
  accent: { hex: '#b04a6e', ink: '#ffffff', deep: '#8e3b58', dark_hex: '#e38ab0', dark_ink: '#1a0b12', dark_deep: '#f0b4cd' },
  display_face: 'cormorant',
}

describe('applyPortalTheme', () => {
  it('writes the six accent values as rgb triplets and the display face stack', () => {
    const root = fakeRoot()
    applyPortalTheme(root, THEME)

    expect(root.vars.get('--p-accent-l')).toBe('176 74 110')
    expect(root.vars.get('--p-accent-l-ink')).toBe('255 255 255')
    expect(root.vars.get('--p-accent-l-deep')).toBe('142 59 88')
    expect(root.vars.get('--p-accent-d')).toBe('227 138 176')
    expect(root.vars.get('--p-accent-d-ink')).toBe('26 11 18')
    expect(root.vars.get('--p-accent-d-deep')).toBe('240 180 205')
    expect(root.vars.get('--p-font-display')).toBe(DISPLAY_FACE_STACKS.cormorant)
  })

  it('falls back to the generic face for an unknown one and ignores a malformed hex', () => {
    const root = fakeRoot()
    applyPortalTheme(root, { accent: { ...THEME.accent, hex: 'nope' }, display_face: 'wingdings' })

    expect(root.vars.get('--p-font-display')).toBe(DISPLAY_FACE_STACKS.manrope)
    expect(root.vars.has('--p-accent-l')).toBe(false)
    expect(root.vars.get('--p-accent-d')).toBe('227 138 176')
  })

  it('clears everything it wrote', () => {
    const root = fakeRoot()
    applyPortalTheme(root, THEME)
    clearPortalTheme(root)
    expect(root.vars.size).toBe(0)
  })
})
```

`frontend/src/portal/lib/format.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { formatMoney } from './money'
import { formatDay, formatDateTime, formatTime } from './dates'

describe('formatMoney', () => {
  it('formats in the venue currency for the member locale', () => {
    expect(formatMoney(1234.5, 'EUR', 'de')).toBe('1.234,50\u00a0€')
    expect(formatMoney(80, 'GBP', 'en')).toBe('£80.00')
  })
  it('survives an unknown currency code', () => {
    expect(formatMoney(12, 'XXX?', 'en')).toBe('12.00 XXX?')
  })
})

describe('dates', () => {
  it('renders a calendar date without letting the timezone move it', () => {
    expect(formatDay('2026-10-03', 'en')).toBe('3 Oct 2026')
    expect(formatDay('2026-10-03T23:59:59+03:00', 'en')).toBe('3 Oct 2026')
  })
  it('renders an instant in the venue timezone', () => {
    expect(formatDateTime('2026-10-03T07:30:00Z', 'en', 'Europe/Riga')).toBe('3 Oct 2026, 10:30')
    expect(formatTime('2026-10-03T07:30:00Z', 'en', 'Europe/Riga')).toBe('10:30')
  })
  it('gives the raw value back rather than "Invalid Date"', () => {
    expect(formatDateTime('not-a-date', 'en')).toBe('not-a-date')
  })
})
```

- [ ] **Step 3: Run them to make sure they fail**

```bash
cd /c/wamp64/www/Hexa-Tech-portal/frontend && npx vitest run src/portal 2>&1 | tail -20
```
Expected: FAIL — modules not found; the sweep's "folder is not empty" passes only once source files exist (it will after this task, since `portal.css` and the `.ts` modules count).

- [ ] **Step 4: Write the tokens**

`frontend/src/portal/theme/portal.css`:
```css
/*
 * Member portal tokens. Scoped to [data-portal] so nothing here leaks into
 * the staff console, and every colour is an `R G B` triplet so Tailwind's
 * `<alpha-value>` works (`bg-p-accent/10` is the soft tint).
 *
 * Light first: a member reads this on a phone in daylight. Dark follows the
 * OS unless the root says otherwise. The accent arrives from the server
 * (PortalTheme, contrast-checked) as --p-accent-l / --p-accent-d and their
 * ink and deep companions; the fallbacks below are the generic industry
 * accent.
 */
[data-portal] {
  --p-bg: 247 246 243;
  --p-surface: 255 255 255;
  --p-surface-2: 240 238 233;
  --p-text: 23 25 28;
  --p-text-2: 95 100 107;
  --p-border: 228 225 218;
  --p-accent: var(--p-accent-l, 47 93 138);
  --p-accent-ink: var(--p-accent-l-ink, 255 255 255);
  --p-accent-deep: var(--p-accent-l-deep, 36 72 107);
  --p-success: 31 122 77;
  --p-warning: 154 103 0;
  --p-danger: 179 38 30;
  --p-radius-card: 18px;
  --p-radius-control: 12px;
  --p-shadow: 0 1px 2px rgba(23, 25, 28, 0.06), 0 8px 24px -12px rgba(23, 25, 28, 0.18);
  --p-font-body: 'Inter', system-ui, sans-serif;
  /* --p-font-display is written by applyPortalTheme; this is the generic face. */
  --p-font-display: 'PortalDisplay-Manrope', 'Manrope', 'Inter', system-ui, sans-serif;

  color-scheme: light;
  background-color: rgb(var(--p-bg));
  color: rgb(var(--p-text));
  font-family: var(--p-font-body);
  -webkit-font-smoothing: antialiased;
}

[data-portal] select,
[data-portal] input,
[data-portal] textarea {
  color-scheme: light;
}

@media (prefers-color-scheme: dark) {
  [data-portal]:not([data-portal-theme="light"]) {
    --p-bg: 15 17 19;
    --p-surface: 24 27 31;
    --p-surface-2: 34 38 43;
    --p-text: 242 242 240;
    --p-text-2: 162 167 174;
    --p-border: 46 51 58;
    --p-accent: var(--p-accent-d, 127 176 224);
    --p-accent-ink: var(--p-accent-d-ink, 15 17 19);
    --p-accent-deep: var(--p-accent-d-deep, 168 204 240);
    --p-success: 76 195 138;
    --p-warning: 229 185 92;
    --p-danger: 242 139 130;
    --p-shadow: 0 1px 2px rgba(0, 0, 0, 0.4), 0 8px 24px -12px rgba(0, 0, 0, 0.6);
    color-scheme: dark;
  }
  [data-portal]:not([data-portal-theme="light"]) select,
  [data-portal]:not([data-portal-theme="light"]) input,
  [data-portal]:not([data-portal-theme="light"]) textarea {
    color-scheme: dark;
  }
}

[data-portal][data-portal-theme="dark"] {
  --p-bg: 15 17 19;
  --p-surface: 24 27 31;
  --p-surface-2: 34 38 43;
  --p-text: 242 242 240;
  --p-text-2: 162 167 174;
  --p-border: 46 51 58;
  --p-accent: var(--p-accent-d, 127 176 224);
  --p-accent-ink: var(--p-accent-d-ink, 15 17 19);
  --p-accent-deep: var(--p-accent-d-deep, 168 204 240);
  --p-success: 76 195 138;
  --p-warning: 229 185 92;
  --p-danger: 242 139 130;
  --p-shadow: 0 1px 2px rgba(0, 0, 0, 0.4), 0 8px 24px -12px rgba(0, 0, 0, 0.6);
  color-scheme: dark;
}

/* One orchestrated moment: the member card rises once on first paint. */
@keyframes p-rise {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
[data-portal] .p-rise { animation: p-rise 220ms ease-out both; }
[data-portal] .p-lift { transition: transform 160ms ease-out, box-shadow 160ms ease-out; }
[data-portal] .p-lift:hover { transform: translateY(-2px); }

@media (prefers-reduced-motion: reduce) {
  [data-portal] .p-rise { animation: none; }
  [data-portal] .p-lift, [data-portal] .p-lift:hover { transition: none; transform: none; }
  [data-portal] * { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }
}

/* Focus is never tenant-derived: a fixed 2px ring in the text colour. */
[data-portal] :focus-visible {
  outline: 2px solid rgb(var(--p-text));
  outline-offset: 2px;
}

/* Display faces, self-hosted under public/landing/fonts (served on every
   host). Distinct family names so the SPA's Google Fonts imports of the same
   families can never win a race against these. Fill the src file names from
   `ls public/landing/fonts` — prefer the `*-var.woff2` variable file of each
   family and give it the 400–700 weight range. */
@font-face { font-family: 'PortalDisplay-Playfair';   src: url('/landing/fonts/FILL.woff2') format('woff2'); font-weight: 400 700; font-display: swap; }
@font-face { font-family: 'PortalDisplay-Cormorant';  src: url('/landing/fonts/FILL.woff2') format('woff2'); font-weight: 400 700; font-display: swap; }
@font-face { font-family: 'PortalDisplay-Fraunces';   src: url('/landing/fonts/FILL.woff2') format('woff2'); font-weight: 400 700; font-display: swap; }
@font-face { font-family: 'PortalDisplay-Newsreader'; src: url('/landing/fonts/FILL.woff2') format('woff2'); font-weight: 400 700; font-display: swap; }
@font-face { font-family: 'PortalDisplay-Space';      src: url('/landing/fonts/FILL.woff2') format('woff2'); font-weight: 400 700; font-display: swap; }
@font-face { font-family: 'PortalDisplay-Manrope';    src: url('/landing/fonts/FILL.woff2') format('woff2'); font-weight: 400 700; font-display: swap; }
```

Then replace each `FILL.woff2` with the real file: run `ls /c/wamp64/www/Hexa-Tech-portal/public/landing/fonts | grep -Ei '^(playfair|cormorant|fraunces|newsreader|space|manrope)'`, pick each family's variable file (`…-var.woff2`) or, where a family only ships fixed weights, its 400 and 700 files as two `@font-face` rules with `font-weight: 400` and `font-weight: 700`. No `FILL` may remain (the sweep test in Task 17's verification greps for it).

Add `@import './portal/theme/portal.css';` as the FIRST line of `frontend/src/index.css`, above `@tailwind base;` — an `@import` that follows other rules is ignored by the cascade and is not inlined by Vite's postcss-import. Vite inlines it there, so the tokens ship in the main stylesheet at negligible size and the portal chunk needs no CSS of its own.

- [ ] **Step 5: Extend Tailwind**

In `frontend/tailwind.config.js`, inside `theme.extend.colors` after `info:` add:
```js
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
        },
```
and, as siblings of `colors` inside `extend`:
```js
      borderRadius: {
        'p-card':    'var(--p-radius-card)',
        'p-control': 'var(--p-radius-control)',
      },
      boxShadow: {
        p: 'var(--p-shadow)',
      },
```
and extend `fontFamily` to:
```js
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        'p-display': ['var(--p-font-display)'],
        'p-body': ['var(--p-font-body)'],
      },
```

- [ ] **Step 6: Write the theme writer and the formatters**

`frontend/src/portal/theme/applyPortalTheme.ts`:
```ts
/**
 * Writes the venue's accent and display face onto a root element as CSS
 * variables. The values come from the server already contrast-checked
 * (PortalTheme → App\Support\Accent); nothing is derived here, so what the
 * server measured is what paints.
 */
export interface PortalAccent {
  hex: string
  ink: string
  deep: string
  dark_hex: string
  dark_ink: string
  dark_deep: string
}

export interface PortalThemeInput {
  accent: PortalAccent
  display_face: string
}

export const DISPLAY_FACE_STACKS: Record<string, string> = {
  playfair:   "'PortalDisplay-Playfair', 'Playfair Display', Georgia, serif",
  cormorant:  "'PortalDisplay-Cormorant', 'Cormorant Garamond', Georgia, serif",
  fraunces:   "'PortalDisplay-Fraunces', 'Fraunces', Georgia, serif",
  newsreader: "'PortalDisplay-Newsreader', 'Newsreader', Georgia, serif",
  space:      "'PortalDisplay-Space', 'Space Grotesk', 'Inter', system-ui, sans-serif",
  manrope:    "'PortalDisplay-Manrope', 'Manrope', 'Inter', system-ui, sans-serif",
}

const WRITTEN = [
  '--p-accent-l', '--p-accent-l-ink', '--p-accent-l-deep',
  '--p-accent-d', '--p-accent-d-ink', '--p-accent-d-deep',
  '--p-font-display',
] as const

/** "#b04a6e" → "176 74 110"; null for anything that is not six hex digits. */
export function hexToTriplet(hex: string | null | undefined): string | null {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? '').trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`
}

export function applyPortalTheme(root: HTMLElement, theme: PortalThemeInput): void {
  const pairs: Array<[string, string | null | undefined]> = [
    ['--p-accent-l',      theme.accent?.hex],
    ['--p-accent-l-ink',  theme.accent?.ink],
    ['--p-accent-l-deep', theme.accent?.deep],
    ['--p-accent-d',      theme.accent?.dark_hex],
    ['--p-accent-d-ink',  theme.accent?.dark_ink],
    ['--p-accent-d-deep', theme.accent?.dark_deep],
  ]
  for (const [name, hex] of pairs) {
    const triplet = hexToTriplet(hex)
    if (triplet) root.style.setProperty(name, triplet)
    else root.style.removeProperty(name)
  }
  const face = DISPLAY_FACE_STACKS[theme.display_face] ?? DISPLAY_FACE_STACKS.manrope
  root.style.setProperty('--p-font-display', face)
}

export function clearPortalTheme(root: HTMLElement): void {
  for (const name of WRITTEN) root.style.removeProperty(name)
}
```

`frontend/src/portal/lib/money.ts`:
```ts
import { resolveLocale } from './dates'

/** Money in the venue's currency, in the member's language. */
export function formatMoney(amount: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(resolveLocale(locale), { style: 'currency', currency, currencyDisplay: 'symbol' }).format(amount)
  } catch {
    // An unknown or malformed code throws RangeError; the amount is still worth showing.
    return `${amount.toFixed(2)} ${currency}`
  }
}
```

`frontend/src/portal/lib/dates.ts`:
```ts
/**
 * Dates for members. Two shapes arrive from the API: calendar dates
 * (`2026-10-03`, a stay's arrival) that must never shift with the clock, and
 * instants (`2026-10-03T07:30:00Z`, an appointment) that are shown in the
 * venue's timezone because that is where the member will stand.
 */

/**
 * i18next hands over bare language codes, and to Intl a bare `en` is en-US:
 * month first, 12-hour clock. The platform's English is UK English
 * (BeautyTech.uk, day-first dates), so `en` resolves to en-GB; every other
 * code passes through.
 */
export function resolveLocale(locale: string): string {
  return locale === 'en' ? 'en-GB' : locale
}

export function formatDay(value: string, locale: string): string {
  const [datePart] = value.split(/[T ]/)
  const [y, m, d] = datePart.split('-').map(Number)
  if (!y || !m || !d) return value
  return new Intl.DateTimeFormat(resolveLocale(locale), { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(y, m - 1, d))
}

export function formatDateTime(iso: string, locale: string, timeZone?: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  try {
    return new Intl.DateTimeFormat(resolveLocale(locale), {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone,
    }).format(date)
  } catch {
    return date.toLocaleString(resolveLocale(locale))
  }
}

export function formatTime(iso: string, locale: string, timeZone?: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  try {
    return new Intl.DateTimeFormat(resolveLocale(locale), { hour: '2-digit', minute: '2-digit', hour12: false, timeZone }).format(date)
  } catch {
    return date.toLocaleTimeString(resolveLocale(locale))
  }
}
```

If Node's ICU formats `formatDateTime` with a different separator than `, ` for `en` (older Node builds print `3 Oct 2026, 10:30` with a narrow no-break space before `10:30`), adjust the test's expected string to what Node 24 prints once, and add a comment naming the Node version; do not loosen it to a regex.

- [ ] **Step 7: Run the portal tests and the type check**

```bash
cd /c/wamp64/www/Hexa-Tech-portal/frontend && npx tsc -b && npx vitest run src/portal 2>&1 | tail -20
```
Expected: all portal tests pass, including one sweep pair per file created so far.

- [ ] **Step 8: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-portal && git add frontend/tailwind.config.js frontend/src/index.css frontend/src/portal && git commit -q -F - <<'EOF'
Lay down the member portal's own tokens

A [data-portal] token set (light first, dark by OS preference), a `p-*`
Tailwind namespace bound to it, a writer for the server-measured accent
and display face, money and date formatters in the member's language,
and a sweep that fails the suite when portal code reaches for an admin
colour class or an admin endpoint.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 9: The `portal` locale bundle, industry nouns, completeness sweep

**Files:**
- Create: `frontend/src/portal/i18n/index.ts`, `frontend/src/portal/i18n/portal.en.json`, `portal.ru.json`, `portal.de.json`, `portal.fr.json`, `portal.es.json`, `frontend/src/portal/i18n/portalLocales.test.ts`
- Modify: `frontend/src/i18n/localeCompleteness.test.ts:40-46, 79-82`

**Interfaces:**
- Produces: `registerPortalLocales(): void` (idempotent; merges each bundle under the `portal` key of the `common` namespace, so keys are `t('portal.nav.home')`); `PORTAL_LOCALE_FILES` map; the `vocab.<industry>.<noun>` keys that Task 11's `useVocab()` reads.

- [ ] **Step 1: Write the failing tests**

Extend `frontend/src/i18n/localeCompleteness.test.ts`: change `SCAN_TARGETS` to add `path.join(SRC_DIR, 'portal')` and `KEY_PREFIXES` to add `'portal.'`; change `readLocale()` to merge the portal bundle:
```ts
function readLocale(locale: string): unknown {
  const common = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, locale, 'common.json'), 'utf8'))
  // The member portal registers its bundle under `portal` at runtime
  // (src/portal/i18n/index.ts); resolve `portal.*` keys the same way.
  const portalFile = path.join(SRC_DIR, 'portal/i18n', `portal.${locale}.json`)
  const portal = fs.existsSync(portalFile) ? JSON.parse(fs.readFileSync(portalFile, 'utf8')) : {}
  return { ...common, portal }
}
```
and add to the first `it('actually found the keys…')`: `expect(keys).toContain('portal.nav.home')`.

`frontend/src/portal/i18n/portalLocales.test.ts` — the dynamic keys the regex cannot see:
```ts
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const LOCALES = ['en', 'ru', 'de', 'fr', 'es'] as const
const INDUSTRIES = ['hotel', 'beauty', 'medical', 'restaurant', 'fitness', 'other'] as const
const NOUNS = ['booking', 'booking_plural', 'service', 'service_plural', 'staff', 'venue', 'visit'] as const
const STATUSES = ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'] as const

function bundle(locale: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(__dirname, `portal.${locale}.json`), 'utf8'))
}
function at(json: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((n, p) => (n && typeof n === 'object' ? (n as Record<string, unknown>)[p] : undefined), json)
}

describe('portal bundle — keys built at runtime', () => {
  for (const locale of LOCALES) {
    it(`${locale}: every industry noun and booking status is translated`, () => {
      const json = bundle(locale)
      const missing: string[] = []
      for (const ind of INDUSTRIES) for (const noun of NOUNS) {
        const v = at(json, `vocab.${ind}.${noun}`)
        if (typeof v !== 'string' || !v.trim()) missing.push(`vocab.${ind}.${noun}`)
      }
      for (const s of STATUSES) {
        const v = at(json, `bookings.status.${s}`)
        if (typeof v !== 'string' || !v.trim()) missing.push(`bookings.status.${s}`)
      }
      expect(missing, `${locale} is missing: ${missing.join(', ')}`).toEqual([])
    })
  }

  it('the five bundles carry exactly the same key set', () => {
    const flatten = (o: unknown, prefix = ''): string[] =>
      Object.entries(o as Record<string, unknown>).flatMap(([k, v]) =>
        v && typeof v === 'object' ? flatten(v, `${prefix}${k}.`) : [`${prefix}${k}`])
    const en = flatten(bundle('en')).sort()
    for (const locale of LOCALES) {
      expect(flatten(bundle(locale)).sort(), `${locale} keys differ from en`).toEqual(en)
    }
  })
})
```

- [ ] **Step 2: Run them to make sure they fail**

```bash
cd /c/wamp64/www/Hexa-Tech-portal/frontend && npx vitest run src/portal/i18n src/i18n 2>&1 | tail -20
```
Expected: FAIL — bundle files missing.

- [ ] **Step 3: Write the registration module**

`frontend/src/portal/i18n/index.ts`:
```ts
import i18n from '../../i18n'
import en from './portal.en.json'
import ru from './portal.ru.json'
import de from './portal.de.json'
import fr from './portal.fr.json'
import es from './portal.es.json'

/**
 * The member portal's strings, kept out of the admin's common.json so a
 * staff session never downloads them and a translator sees them as one
 * file per language. Registered under the `portal` key of the `common`
 * namespace, so call sites read `t('portal.nav.home')` — dotted keys the
 * locale sweep in src/i18n/localeCompleteness.test.ts can see.
 */
export const PORTAL_LOCALE_FILES = { en, ru, de, fr, es } as const

let registered = false

export function registerPortalLocales(): void {
  if (registered) return
  for (const [lang, bundle] of Object.entries(PORTAL_LOCALE_FILES)) {
    i18n.addResourceBundle(lang, 'common', { portal: bundle }, true, true)
  }
  registered = true
}
```

(The `useVocab()` hook that reads these keys needs the provider and is created in Task 11.)

- [ ] **Step 4: Write the five bundles**

`frontend/src/portal/i18n/portal.en.json`:
```json
{
  "nav": { "home": "Home", "book": "Book", "rewards": "Rewards", "bookings": "Bookings", "profile": "Profile", "activity": "Activity" },
  "common": {
    "loading": "Loading…", "retry": "Try again", "error": "Something went wrong. Please try again.",
    "save": "Save changes", "saved": "Saved", "cancel": "Cancel", "confirm": "Confirm", "close": "Close",
    "copy": "Copy", "copied": "Copied", "share": "Share", "sign_out": "Sign out", "back": "Back", "see_all": "See all",
    "points": "points", "optional": "optional", "previous": "Previous", "next": "Next", "page_of": "Page {{page}} of {{total}}"
  },
  "shell": { "greeting": "Hello, {{name}}", "membership": "My membership", "menu": "Menu", "portal_off": "The member portal is switched off for this venue. Please contact them directly." },
  "home": {
    "balance": "Points balance", "lifetime": "{{count}} earned all time", "progress_to": "Progress to {{tier}}",
    "points_to_go": "{{count}} points to go", "member_number": "Member number", "show_at_counter": "Show this at the counter to earn or redeem.",
    "next_booking": "Your next {{noun}}", "no_upcoming": "Nothing booked yet.", "view_booking": "View",
    "quick_rewards": "Spend points", "quick_rewards_hint": "Browse the rewards catalogue",
    "quick_offers": "Your offers", "quick_offers_hint": "Discounts available to you",
    "recent_activity": "Recent activity", "no_activity": "Your points will appear here after your first visit.",
    "member_since": "Member since {{date}}", "contact": "Questions? Contact {{venue}}",
    "wallet_apple": "Add to Apple Wallet", "wallet_google": "Add to Google Wallet",
    "wallet_unavailable": "Wallet passes are not set up for this venue yet.", "wallet_error": "Could not prepare the pass. Please try again."
  },
  "rewards": {
    "title": "Rewards", "you_have": "You have {{count}} points", "tab_benefits": "Benefits", "tab_catalogue": "Catalogue",
    "tab_offers": "Offers", "tab_codes": "My codes",
    "benefits_empty": "No benefits on your level yet. Keep earning points to unlock them.", "tier_level": "{{tier}} level",
    "request": "Request this", "requested": "Requested — the venue will confirm", "approved": "Approved — ready when you are",
    "cancel_request": "Cancel request", "request_sent": "Requested", "request_cancelled": "Request cancelled",
    "request_failed": "Could not send that request", "automatic": "Applied automatically", "voucher": "Issued as a voucher — ask at the desk",
    "last_used": "Last used {{date}}",
    "catalogue_empty": "No rewards are available right now. Check back soon.", "redeem": "Redeem", "already_claimed": "Already claimed",
    "out_of_stock": "Out of stock", "points_needed": "{{count}} more points needed", "redeem_title": "Redeem {{name}}?",
    "redeem_body": "This spends {{count}} points. You'll get a code to show at the desk.", "redeemed": "Redeemed — your code is {{code}}",
    "redeem_failed": "Could not redeem that reward",
    "offers_yours": "Yours to use", "offers_available": "Available to you", "offers_empty": "No offers right now. We'll let you know when something arrives.",
    "claim": "Claim offer", "claimed": "Offer claimed — show it at the desk", "claim_failed": "Could not claim that offer",
    "already_claimed_offer": "Already claimed — see above", "fully_claimed": "Fully claimed", "used_on": "Used {{date}}",
    "valid_until": "Valid until {{date}}", "ready_to_use": "Ready to use — show this at the desk", "ends": "Ends {{date}}",
    "percent_off": "{{value}}% off", "amount_off": "{{value}} off", "points_multiplier": "{{value}}x points",
    "codes_empty": "Codes you redeem will be kept here.", "code_pending": "Show at the desk", "code_fulfilled": "Used", "code_cancelled": "Cancelled",
    "codes_hint": "Each code works once. The venue marks it used when you present it."
  },
  "bookings": {
    "title": "Bookings", "upcoming": "Upcoming", "past": "Past", "empty_upcoming": "No upcoming {{noun}}.", "empty_past": "No past {{noun}} yet.",
    "reference": "Reference", "when": "When", "where": "Where", "with": "With", "guests": "Guests", "nights": "Nights",
    "nights_guests": "{{nights}} nights · {{guests}} guests", "party": "For {{count}} people", "total": "Total", "discount": "Member discount",
    "payment": "Payment", "notes": "Your notes", "policy": "Cancellation policy", "contact_to_change": "To change or cancel, contact {{venue}}.",
    "status": { "pending": "Awaiting confirmation", "confirmed": "Confirmed", "in_progress": "In progress", "completed": "Completed", "cancelled": "Cancelled" },
    "payment_status": { "unpaid": "Pay at the venue", "authorized": "Card held", "paid": "Paid", "refunded": "Refunded", "failed": "Payment failed", "partially_refunded": "Partly refunded" },
    "not_found": "We could not find that booking."
  },
  "activity": { "title": "Activity", "entries": "{{count}} entries", "empty": "No points activity yet. Your first visit will show up here.", "balance": "balance {{count}}", "reversed": "reversed",
    "type": { "earn": "Earned", "bonus": "Bonus", "redeem": "Redeemed", "adjust": "Adjustment", "expire": "Expired", "reverse": "Reversed" } },
  "profile": {
    "title": "Profile", "name": "Name", "email": "Email", "email_hint": "Contact the venue if you need to change this", "phone": "Phone",
    "birthday": "Date of birth", "language": "Language", "communication": "Communication",
    "marketing": "Offers and news by email", "marketing_hint": "Occasional emails about rewards, offers and events. You can turn this off at any time.",
    "push": "Push notifications", "push_hint": "Points updates and reminders on your phone.",
    "service_messages": "You'll still receive service messages about your account — password resets, booking confirmations and similar — regardless of these settings.",
    "invite_title": "Invite a friend", "invite_body": "Share your link — you'll both be rewarded when they join.", "invite_share": "Share my link", "invite_copy": "Copy link",
    "invite_stats": "{{count}} friends joined", "invite_unavailable": "Referral links are not available yet.",
    "password_title": "Password", "password_change": "Change password", "password_current": "Current password", "password_new": "New password",
    "password_confirm": "Confirm new password", "password_hint": "At least 8 characters", "password_changed": "Password changed. Other devices have been signed out.",
    "password_failed": "Could not change the password", "password_mismatch": "Those two passwords don't match.",
    "delete_title": "Delete account", "delete_body": "This removes your membership and points at this venue. It cannot be undone.",
    "delete_confirm_label": "Type DELETE to confirm", "delete_password": "Your password", "delete_button": "Delete my account", "delete_failed": "Could not delete the account",
    "save_failed": "Could not save your changes", "member_number": "Member number {{number}}"
  },
  "join": {
    "title": "Join {{venue}}", "with_bonus": "Start with {{count}} points on us.", "no_bonus": "Earn points every time you visit.",
    "name": "Your name", "email": "Email", "phone": "Phone (optional)", "password": "Password", "password_confirm": "Confirm password",
    "referral": "Referral code (optional)", "referral_prefilled": "Your friend's code is filled in — you'll both be rewarded",
    "referral_hint": "If a friend gave you a code, you'll both be rewarded", "submit": "Create my membership",
    "already": "Already a member?", "sign_in": "Sign in", "existing": "Been a customer for a while?", "set_up": "Set up your existing account",
    "incomplete_title": "This link is incomplete", "incomplete_body": "Sign-up links include a code that tells us which programme you're joining. Please use the link the venue gave you.",
    "closed_title": "Sign-up isn't available", "closed_body": "This sign-up link is not valid, or the programme is not open for new members yet. Please check with the venue.",
    "failed": "Could not create your account.", "go_sign_in": "Go to sign in"
  },
  "claim": {
    "title": "Set up your account", "intro": "Already a customer? Choose a password to see your points online.", "code_sent": "We've sent a 6-digit code to {{email}}.",
    "email": "Your email", "email_hint": "Use the address the venue has on file for you", "send_code": "Send me a code",
    "code": "6-digit code", "password": "Choose a password", "password_confirm": "Confirm password", "finish": "Finish setup",
    "resend": "Didn't get it? Send another code", "resent": "A new code is on its way.", "change_email": "Use a different email",
    "rate_limited": "A code was just sent. Please wait a minute before asking for another.", "send_failed": "Could not send a code to that address.",
    "claim_failed": "That code did not work. Check it and try again.", "already_set_up": "Already set up?"
  },
  "vocab": {
    "hotel":      { "booking": "stay", "booking_plural": "stays", "service": "service", "service_plural": "services", "staff": "host", "venue": "hotel", "visit": "stay" },
    "beauty":     { "booking": "appointment", "booking_plural": "appointments", "service": "treatment", "service_plural": "treatments", "staff": "stylist", "venue": "salon", "visit": "visit" },
    "medical":    { "booking": "appointment", "booking_plural": "appointments", "service": "procedure", "service_plural": "procedures", "staff": "practitioner", "venue": "clinic", "visit": "visit" },
    "restaurant": { "booking": "reservation", "booking_plural": "reservations", "service": "service", "service_plural": "services", "staff": "host", "venue": "venue", "visit": "visit" },
    "fitness":    { "booking": "session", "booking_plural": "sessions", "service": "class", "service_plural": "classes", "staff": "trainer", "venue": "studio", "visit": "session" },
    "other":      { "booking": "appointment", "booking_plural": "appointments", "service": "service", "service_plural": "services", "staff": "team member", "venue": "venue", "visit": "visit" }
  }
}
```

`portal.ru.json`, `portal.de.json`, `portal.fr.json`, `portal.es.json`: the same key tree. Translate every value; keep `{{placeholders}}` verbatim. Reference renderings for the strings a member sees first (the rest follow the same register — polite, short, "you"):

| key | ru | de | fr | es |
|---|---|---|---|---|
| nav.home | Главная | Start | Accueil | Inicio |
| nav.book | Записаться | Buchen | Réserver | Reservar |
| nav.rewards | Награды | Prämien | Récompenses | Recompensas |
| nav.bookings | Записи | Buchungen | Réservations | Reservas |
| nav.profile | Профиль | Profil | Profil | Perfil |
| nav.activity | История | Verlauf | Activité | Actividad |
| shell.greeting | Здравствуйте, {{name}} | Hallo, {{name}} | Bonjour {{name}} | Hola, {{name}} |
| home.balance | Баланс баллов | Punktestand | Solde de points | Saldo de puntos |
| home.next_booking | Ваш следующий {{noun}} | Ihr nächster {{noun}} | Votre prochain {{noun}} | Su próximo {{noun}} |
| home.show_at_counter | Покажите это на стойке, чтобы копить или тратить баллы. | Zeigen Sie dies am Empfang, um Punkte zu sammeln oder einzulösen. | Présentez ceci à l'accueil pour gagner ou utiliser vos points. | Muestre esto en recepción para ganar o canjear puntos. |
| rewards.redeem_body | Будет списано {{count}} баллов. Вы получите код, который нужно показать на стойке. | Dafür werden {{count}} Punkte eingelöst. Sie erhalten einen Code für den Empfang. | Cela utilise {{count}} points. Vous recevrez un code à présenter à l'accueil. | Se gastarán {{count}} puntos. Recibirá un código para mostrar en recepción. |
| bookings.status.pending | Ожидает подтверждения | Wartet auf Bestätigung | En attente de confirmation | Pendiente de confirmación |
| bookings.status.confirmed | Подтверждено | Bestätigt | Confirmée | Confirmada |
| bookings.status.in_progress | Идёт сейчас | Läuft | En cours | En curso |
| bookings.status.completed | Завершено | Abgeschlossen | Terminée | Completada |
| bookings.status.cancelled | Отменено | Storniert | Annulée | Cancelada |
| bookings.payment_status.unpaid | Оплата на месте | Zahlung vor Ort | Paiement sur place | Pago en el local |
| profile.service_messages | Сервисные сообщения об аккаунте — сброс пароля, подтверждения записей и подобное — будут приходить независимо от этих настроек. | Servicemitteilungen zu Ihrem Konto – Passwort-Zurücksetzen, Buchungsbestätigungen und Ähnliches – erhalten Sie unabhängig von diesen Einstellungen. | Vous recevrez toujours les messages de service liés à votre compte (réinitialisation du mot de passe, confirmations de réservation, etc.), quels que soient ces réglages. | Seguirá recibiendo mensajes de servicio sobre su cuenta (restablecimiento de contraseña, confirmaciones de reserva y similares) independientemente de estos ajustes. |
| join.submit | Создать членство | Mitgliedschaft erstellen | Créer mon adhésion | Crear mi membresía |
| claim.send_code | Отправить код | Code senden | M'envoyer un code | Enviarme un código |
| vocab.beauty.booking | запись | Termin | rendez-vous | cita |
| vocab.beauty.service | процедура | Behandlung | soin | tratamiento |
| vocab.beauty.staff | мастер | Stylist(in) | styliste | estilista |
| vocab.hotel.booking | проживание | Aufenthalt | séjour | estancia |
| vocab.medical.service | процедура | Eingriff | acte | procedimiento |
| vocab.medical.staff | специалист | Behandler(in) | praticien | profesional |
| vocab.restaurant.booking | бронирование | Reservierung | réservation | reserva |
| vocab.fitness.booking | занятие | Einheit | séance | sesión |
| vocab.fitness.staff | тренер | Trainer(in) | coach | entrenador |
| vocab.other.staff | сотрудник | Mitarbeiter(in) | membre de l'équipe | miembro del equipo |

The "same key set" test fails until all five files carry every key, which is the point.

- [ ] **Step 5: Run the locale tests**

```bash
cd /c/wamp64/www/Hexa-Tech-portal/frontend && npx tsc -b && npx vitest run src/portal src/i18n 2>&1 | tail -20
```
Expected: pass, and `tsc` is clean.

- [ ] **Step 6: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-portal && git add frontend/src/portal/i18n frontend/src/i18n/localeCompleteness.test.ts && git commit -q -F - <<'EOF'
Give the member portal its strings in five languages

The old portal had none: every word was English with hotel wording.
The portal bundle registers under `portal.*`, industry nouns are
translated rather than borrowed from the admin's English-only
vocabulary layer, and the locale sweep now scans the portal so a key
missing in any language fails the suite.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 10: Types, the portal API client, the UI primitives

**Files:**
- Create: `frontend/src/portal/lib/types.ts`, `frontend/src/portal/lib/portalApi.ts`, `frontend/src/portal/ui/Button.tsx`, `Card.tsx`, `Sheet.tsx`, `Tabs.tsx`, `Field.tsx`, `Toggle.tsx`, `Skeleton.tsx`, `EmptyState.tsx`, `Notice.tsx`, `Chip.tsx`, `Money.tsx`, `frontend/src/portal/ui/primitives.test.tsx` (`DateTime.tsx` needs the provider and is created in Task 11)

**Interfaces:**
- Produces the exported types below and `portalApi` with `bootstrap()`, `bookings(scope, page)`, `booking(kind, id)`, `card()`, `benefits()`, `requestBenefit(id)`, `cancelBenefitRequest(id)`, `rewards()`, `redeem(id)`, `redemptions()`, `offers()`, `claimOffer(id)`, `pointsHistory(page)`, `updateProfile(payload)`, `changePassword(payload)`, `referral()`, `appleWalletLink()`, `googleWallet()`, `deleteAccount(payload)`; `apiMessage(error: unknown, fallback: string): string`.
- Produces the components: `Button({variant: 'primary'|'secondary'|'ghost'|'danger', size?: 'md'|'sm', loading?, full?})`, `Card({tone?: 'paper'|'spotlight', className?})`, `Sheet({open, onClose, title, children, footer?})`, `Tabs({value, onChange, items: {key,label,badge?}[]})`, `Field({label, hint?, error?, children})`, `Toggle({label, hint?, checked, onChange, disabled?})`, `Skeleton({className})`, `EmptyState({icon?, title, body?, action?})`, `Notice({tone: 'info'|'success'|'warning'|'danger', children})`, `Chip({tone?: 'neutral'|'accent'|'success'|'warning'|'danger', children})`, `Money({amount, currency})`.
- Consumes: `formatMoney` (Task 8).

- [ ] **Step 1: Write the failing render test**

`frontend/src/portal/ui/primitives.test.tsx`:
```tsx
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Button } from './Button'
import { Sheet } from './Sheet'
import { Tabs } from './Tabs'
import { Toggle } from './Toggle'
import { Chip } from './Chip'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, fallback?: string) => fallback ?? _k, i18n: { language: 'en' } }),
}))

/**
 * Render-to-string, no DOM (vitest.config.ts is environment: 'node').
 * These pin the contracts a screen reader and a thumb depend on, not the
 * pixels: roles, labels, disabled states, the 44px target.
 */
describe('portal primitives', () => {
  it('a loading button is disabled and announces busy', () => {
    const html = renderToStaticMarkup(<Button variant="primary" loading>Save</Button>)
    expect(html).toContain('disabled=""')
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('min-h-11')
  })

  it('a closed sheet renders nothing; an open one is a labelled dialog', () => {
    expect(renderToStaticMarkup(<Sheet open={false} onClose={() => {}} title="T">x</Sheet>)).toBe('')
    const html = renderToStaticMarkup(<Sheet open onClose={() => {}} title="Redeem">body</Sheet>)
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('aria-labelledby="p-sheet-title"')
    expect(html).toContain('Redeem')
  })

  it('tabs expose the selected one', () => {
    const html = renderToStaticMarkup(
      <Tabs value="b" onChange={() => {}} items={[{ key: 'a', label: 'A' }, { key: 'b', label: 'B', badge: 3 }]} />,
    )
    expect(html).toContain('role="tablist"')
    expect(html).toMatch(/aria-selected="true"[^>]*>[^<]*B/)
    expect(html).toContain('>3<')
  })

  it('a toggle is a switch with its label', () => {
    const html = renderToStaticMarkup(<Toggle label="Push" checked onChange={() => {}} />)
    expect(html).toContain('role="switch"')
    expect(html).toContain('aria-checked="true"')
    expect(html).toContain('aria-label="Push"')
  })

  it('chips only use portal tones', () => {
    const html = renderToStaticMarkup(<Chip tone="success">Paid</Chip>)
    expect(html).toContain('p-success')
    expect(html).not.toMatch(/text-white|dark-/)
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
cd /c/wamp64/www/Hexa-Tech-portal/frontend && npx vitest run src/portal/ui 2>&1 | tail -10
```
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the types and the client**

`frontend/src/portal/lib/types.ts`:
```ts
import type { PortalAccent } from '../theme/applyPortalTheme'

export interface PortalVenue {
  name: string
  logo_url: string | null
  industry: string
  currency: string
  timezone: string
  contact: { email: string | null; phone: string | null }
  accent: PortalAccent
  display_face: string
}

export interface PortalCapabilities {
  loyalty: boolean
  services: boolean
  stays: boolean
  chat: boolean
  payments: { services: boolean; stays: boolean; publishable_key: string | null }
}

export interface PortalPolicies {
  services_cancel_hours: number
  booking_cancel_hours: number
  services_cancellation_policy: string
}

export interface Tier { id: number; name: string; color_hex?: string | null }

export interface Activity {
  id: number
  type: string
  points: number
  balance_after?: number | null
  description?: string | null
  created_at: string
  is_reversed?: boolean
}

export interface BenefitPreview {
  id: number
  name: string
  category?: string | null
  display?: string | null
  value_type?: string | null
  value_amount?: number | null
}

export interface PortalMember {
  member_number: string
  name: string
  tier: Tier | null
  current_points: number
  lifetime_points: number
  referral_code: string | null
  progress: { percentage: number; points_needed: number; next_tier: Tier | null }
  recent_activity: Activity[]
  marketing_consent: boolean
  email_notifications: boolean
  push_notifications: boolean
  member_since: string
  user: { id: number; name: string; email: string; phone: string | null; language: string | null; nationality?: string | null; avatar_url?: string | null }
  benefits: BenefitPreview[]
}

export interface PortalBootstrap {
  venue: PortalVenue
  capabilities: PortalCapabilities
  policies: PortalPolicies
  member: PortalMember | null
  counts: { unread_notifications: number; upcoming_bookings: number }
}

export type BookingKind = 'service' | 'stay'

export interface PortalBooking {
  kind: BookingKind
  id: number
  reference: string
  title: string
  subtitle: string | null
  starts_at: string | null
  ends_at: string | null
  status: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | string
  payment_status: string | null
  total: number
  currency: string
  discount: { amount: number; label: string } | null
  can_cancel: boolean
  cancel_deadline: string | null
  notes: string | null
  party_size: number | null
  guests: number | null
  nights: number | null
}

export interface Paginated<T> { data: T[]; meta: { scope: string; page: number; per_page: number; total: number } }

export interface CardPayload { member_number: string; qr_svg?: string | null; qr_image?: string | null }

export interface Benefit {
  tier_benefit_id: number
  benefit_id: number
  name: string
  category?: string | null
  description?: string | null
  display?: string | null
  fulfillment_mode?: string | null
  requestable: boolean
  request?: { id: number; status: string; requested_at?: string } | null
  last_fulfilled_at?: string | null
}

export interface Reward {
  id: number
  name: string
  description?: string | null
  category?: string | null
  image_url?: string | null
  points_cost: number
  stock?: number | null
  per_member_limit?: number | null
  can_afford: boolean
  claimed_by_me: number
  remaining_for_me: number | null
  in_stock: boolean | null
}

export interface Redemption {
  id: number
  code: string
  status: 'pending' | 'fulfilled' | 'cancelled' | string
  points_spent: number
  created_at: string
  reward?: { id: number; name: string; category?: string | null; image_url?: string | null; points_cost: number } | null
}

export interface Offer {
  id: number
  title: string
  description?: string | null
  type?: string | null
  value?: number | string | null
  image_url?: string | null
  end_date?: string | null
  terms_conditions?: string | null
  usage_limit?: number | null
  times_used?: number | null
}

export interface Claim {
  id: number
  status: string
  claimed_at?: string | null
  used_at?: string | null
  expires_at?: string | null
  offer?: Offer | null
}

export interface LaravelPage<T> { data: T[]; current_page: number; last_page: number; total: number }
```

`frontend/src/portal/lib/portalApi.ts`:
```ts
import { api } from '../../lib/api'
import type {
  Benefit, BookingKind, CardPayload, Claim, LaravelPage, Offer, Paginated, PortalBooking, PortalBootstrap, Redemption, Reward, Activity,
} from './types'

/**
 * Every call the portal makes, in one place, typed. Member endpoints only —
 * the sweep in tokens.test.ts refuses `/v1/admin/` anywhere in this folder.
 */
export const portalApi = {
  bootstrap: (): Promise<PortalBootstrap> => api.get('/v1/member/portal').then(r => r.data),
  bookings: (scope: 'upcoming' | 'past', page = 1): Promise<Paginated<PortalBooking>> =>
    api.get('/v1/member/portal/bookings', { params: { scope, page } }).then(r => r.data),
  booking: (kind: BookingKind, id: number): Promise<PortalBooking> =>
    api.get(`/v1/member/portal/bookings/${kind}/${id}`).then(r => r.data),
  card: (): Promise<CardPayload> => api.get('/v1/member/card').then(r => r.data),
  benefits: (): Promise<{ tier: string | null; benefits: Benefit[] }> => api.get('/v1/member/benefits').then(r => r.data),
  requestBenefit: (tierBenefitId: number) => api.post(`/v1/member/benefits/${tierBenefitId}/request`).then(r => r.data),
  cancelBenefitRequest: (requestId: number) => api.delete(`/v1/member/benefits/requests/${requestId}`).then(r => r.data),
  rewards: (): Promise<{ rewards: Reward[]; current_points: number }> => api.get('/v1/member/rewards').then(r => r.data),
  redeem: (rewardId: number): Promise<{ redemption: Redemption; message: string }> =>
    api.post(`/v1/member/rewards/${rewardId}/redeem`).then(r => r.data),
  redemptions: (): Promise<{ redemptions: Redemption[] }> => api.get('/v1/member/my/redemptions').then(r => r.data),
  offers: (): Promise<{ general: Offer[]; personalized: Claim[] }> => api.get('/v1/member/offers').then(r => r.data),
  claimOffer: (offerId: number) => api.post(`/v1/member/offers/${offerId}/claim`).then(r => r.data),
  pointsHistory: (page: number): Promise<LaravelPage<Activity>> =>
    api.get('/v1/member/points/history', { params: { page, per_page: 20 } }).then(r => r.data),
  updateProfile: (payload: Record<string, unknown>) => api.put('/v1/member/profile', payload).then(r => r.data),
  changePassword: (payload: { current_password: string; password: string; password_confirmation: string }) =>
    api.put('/v1/member/password', payload).then(r => r.data),
  referral: (): Promise<{ referral_code: string | null; referral_link: string | null; total_referrals: number; rewarded_referrals: number }> =>
    api.get('/v1/member/referral').then(r => r.data),
  appleWalletLink: (): Promise<{ url: string; expires_in: number }> => api.get('/v1/member/card/apple-wallet/link').then(r => r.data),
  googleWallet: (): Promise<{ saveUrl?: string; save_url?: string }> => api.get('/v1/member/card/google-wallet').then(r => r.data),
  deleteAccount: (payload: Record<string, string>) => api.delete('/v1/member/account', { data: payload }).then(r => r.data),
}

/** The server's sentence when it sent one, else the caller's fallback. */
export function apiMessage(error: unknown, fallback: string): string {
  const res = (error as { response?: { data?: { message?: string; error?: string; errors?: Record<string, string[]> } } })?.response
  const first = res?.data?.errors ? Object.values(res.data.errors)[0]?.[0] : undefined
  return first || res?.data?.message || fallback
}
```

`deleteAccount` sends `{ password, confirmation: 'DELETE' }`, the two fields `MemberController::deleteAccount()` validates (verified on main).

- [ ] **Step 4: Write the primitives**

`frontend/src/portal/ui/Button.tsx`:
```tsx
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANT: Record<Variant, string> = {
  primary:   'bg-p-accent text-p-accent-ink hover:bg-p-accent-deep',
  secondary: 'bg-p-surface text-p-text border border-p-border hover:bg-p-surface-2',
  ghost:     'bg-transparent text-p-accent-deep hover:bg-p-accent/10',
  danger:    'bg-p-danger/10 text-p-danger hover:bg-p-danger/15',
}

export function Button({
  variant = 'primary', size = 'md', loading = false, full = false, className = '', children, disabled, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'md' | 'sm'; loading?: boolean; full?: boolean; children: ReactNode }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center gap-2 font-semibold rounded-p-control p-lift
                  disabled:opacity-50 disabled:pointer-events-none
                  ${size === 'sm' ? 'text-xs px-3 min-h-9' : 'text-sm px-4 min-h-11'}
                  ${full ? 'w-full' : ''} ${VARIANT[variant]} ${className}`}
    >
      {loading && <Loader2 size={15} className="animate-spin" aria-hidden />}
      {children}
    </button>
  )
}
```

`frontend/src/portal/ui/Card.tsx`:
```tsx
import type { HTMLAttributes, ReactNode } from 'react'

/**
 * Paper by default. `spotlight` is the one dark band the page is allowed —
 * the member card — and it inverts the surface tokens locally so children
 * keep using `p-*` classes and read correctly on it in both modes.
 */
export function Card({ tone = 'paper', className = '', children, ...rest }: HTMLAttributes<HTMLDivElement> & { tone?: 'paper' | 'spotlight'; children: ReactNode }) {
  const spotlight = tone === 'spotlight'
  return (
    <div
      {...rest}
      data-portal-theme={spotlight ? 'dark' : undefined}
      data-portal={spotlight ? '' : undefined}
      className={`rounded-p-card border border-p-border bg-p-surface shadow-p ${spotlight ? 'overflow-hidden' : ''} ${className}`}
    >
      {children}
    </div>
  )
}
```
(`data-portal` + `data-portal-theme="dark"` on the spotlight card re-enters the token scope with the dark values — see portal.css — so the card is dark in light mode and stays dark in dark mode.)

`frontend/src/portal/ui/Sheet.tsx`:
```tsx
import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/**
 * Bottom sheet on phones, centred dialog from `sm`. Traps focus while open,
 * closes on Escape and on the backdrop, and hands focus back to whatever
 * opened it — the three things the old portal's modal did not do.
 */
export function Sheet({ open, onClose, title, children, footer }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode
}) {
  const { t } = useTranslation()
  const panel = useRef<HTMLDivElement>(null)
  const opener = useRef<Element | null>(null)

  useEffect(() => {
    if (!open) return
    opener.current = document.activeElement
    const node = panel.current
    const focusable = () => Array.from(node?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) ?? [])
    focusable()[0]?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
      if (e.key !== 'Tab') return
      const items = focusable()
      if (items.length === 0) return
      const first = items[0], last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
      ;(opener.current as HTMLElement | null)?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="absolute inset-0 bg-p-text/40" aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="p-sheet-title"
        className="relative w-full sm:max-w-md max-h-[88vh] overflow-y-auto bg-p-surface text-p-text rounded-t-p-card sm:rounded-p-card shadow-p p-5 p-rise"
        style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-start justify-between gap-4 mb-3">
          <h2 id="p-sheet-title" className="font-p-display text-xl leading-tight">{title}</h2>
          <button onClick={onClose} aria-label={t('portal.common.close', 'Close')} className="shrink-0 -m-2 p-2 rounded-p-control text-p-text-2 hover:text-p-text min-h-11 min-w-11 flex items-center justify-center">
            <X size={18} />
          </button>
        </div>
        <div className="text-sm">{children}</div>
        {footer && <div className="mt-5 flex gap-2 justify-end">{footer}</div>}
      </div>
    </div>
  )
}
```

`frontend/src/portal/ui/Tabs.tsx`:
```tsx
export function Tabs({ value, onChange, items }: {
  value: string; onChange: (key: string) => void; items: Array<{ key: string; label: string; badge?: number }>
}) {
  return (
    <div role="tablist" className="flex gap-1 p-1 rounded-p-control bg-p-surface-2 overflow-x-auto">
      {items.map(item => {
        const active = item.key === value
        return (
          <button
            key={item.key}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.key)}
            className={`flex-1 whitespace-nowrap min-h-10 px-3 rounded-[10px] text-sm font-medium transition-colors
                        ${active ? 'bg-p-surface text-p-text shadow-p' : 'text-p-text-2 hover:text-p-text'}`}
          >
            {item.label}
            {item.badge != null && item.badge > 0 && (
              <span className="ml-1.5 inline-flex min-w-5 h-5 px-1.5 items-center justify-center rounded-full bg-p-accent text-p-accent-ink text-[11px] font-bold">{item.badge}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
```

`frontend/src/portal/ui/Field.tsx`:
```tsx
import type { ReactNode } from 'react'

export const INPUT_CLASS =
  'w-full min-h-11 bg-p-surface border border-p-border rounded-p-control px-3 py-2 text-base sm:text-sm text-p-text ' +
  'placeholder:text-p-text-2 focus:border-p-accent focus:outline-none disabled:opacity-60'

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-p-text-2 mb-1">{label}</span>
      {children}
      {error ? <span className="block text-xs text-p-danger mt-1">{error}</span>
             : hint ? <span className="block text-[11px] text-p-text-2 mt-1">{hint}</span> : null}
    </label>
  )
}
```
(`text-base` on phones keeps iOS from zooming into inputs; the admin's index.css does the same at 16px.)

`frontend/src/portal/ui/Toggle.tsx`:
```tsx
export function Toggle({ label, hint, checked, onChange, disabled }: {
  label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 min-h-11">
      <div className="min-w-0">
        <p className="text-sm text-p-text">{label}</p>
        {hint && <p className="text-[11px] text-p-text-2 mt-0.5">{hint}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`shrink-0 w-11 h-6 rounded-full transition-colors relative disabled:opacity-50 ${checked ? 'bg-p-accent' : 'bg-p-border'}`}
      >
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-p-surface shadow-p transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </button>
    </div>
  )
}
```

`frontend/src/portal/ui/Skeleton.tsx`:
```tsx
export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-p-control bg-p-surface-2 ${className}`} />
}

export function PageSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <Skeleton className="h-44" />
      <div className="grid grid-cols-2 gap-3"><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
      <Skeleton className="h-32" />
    </div>
  )
}
```

`frontend/src/portal/ui/EmptyState.tsx`:
```tsx
import type { ReactNode } from 'react'
import { Card } from './Card'

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <Card className="p-8 text-center">
      {icon && <div className="mx-auto mb-3 w-11 h-11 rounded-full bg-p-accent/10 text-p-accent-deep flex items-center justify-center">{icon}</div>}
      <p className="text-sm font-semibold text-p-text">{title}</p>
      {body && <p className="text-sm text-p-text-2 mt-1">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </Card>
  )
}
```

`frontend/src/portal/ui/Notice.tsx`:
```tsx
import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react'

const TONE = {
  info:    'border-p-border bg-p-surface-2 text-p-text',
  success: 'border-p-success/30 bg-p-success/10 text-p-success',
  warning: 'border-p-warning/30 bg-p-warning/10 text-p-warning',
  danger:  'border-p-danger/30 bg-p-danger/10 text-p-danger',
} as const

export function Notice({ tone = 'info', children }: { tone?: keyof typeof TONE; children: ReactNode }) {
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'info' ? Info : AlertTriangle
  return (
    <div role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'} className={`flex gap-2 rounded-p-control border p-3 text-sm ${TONE[tone]}`}>
      <Icon size={16} className="shrink-0 mt-px" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  )
}
```

`frontend/src/portal/ui/Chip.tsx`:
```tsx
import type { ReactNode } from 'react'

const TONE = {
  neutral: 'bg-p-surface-2 text-p-text-2',
  accent:  'bg-p-accent/10 text-p-accent-deep',
  success: 'bg-p-success/10 text-p-success',
  warning: 'bg-p-warning/10 text-p-warning',
  danger:  'bg-p-danger/10 text-p-danger',
} as const

export function Chip({ tone = 'neutral', children }: { tone?: keyof typeof TONE; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${TONE[tone]}`}>{children}</span>
}
```

`frontend/src/portal/ui/Money.tsx`:
```tsx
import { useTranslation } from 'react-i18next'
import { formatMoney } from '../lib/money'

export function Money({ amount, currency, className = '' }: { amount: number; currency: string; className?: string }) {
  const { i18n } = useTranslation()
  return <span className={`tabular-nums ${className}`}>{formatMoney(amount, currency, i18n.language)}</span>
}
```

- [ ] **Step 5: Run the primitives test and the type check**

```bash
cd /c/wamp64/www/Hexa-Tech-portal/frontend && npx tsc -b && npx vitest run src/portal 2>&1 | tail -20
```
Expected: pass, `tsc` clean.

- [ ] **Step 6: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-portal && git add frontend/src/portal/lib frontend/src/portal/ui && git commit -q -F - <<'EOF'
Add the member portal's primitives and typed client

Twelve small components on the p-* tokens — a sheet that traps focus
and closes on Escape, tabs and toggles with their roles, a spotlight
card that re-enters the dark token scope — and one typed client for
every member endpoint the portal calls.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 11: Provider, shell, routes — the portal boots

**Files:**
- Create: `frontend/src/portal/PortalProvider.tsx`, `frontend/src/portal/PortalShell.tsx`, `frontend/src/portal/PortalApp.tsx`, `frontend/src/portal/PortalShell.test.tsx`, `frontend/src/portal/lib/vocab.ts`, `frontend/src/portal/ui/DateTime.tsx`, placeholder-free first versions of `frontend/src/portal/pages/Home.tsx`, `Rewards.tsx`, `Bookings.tsx`, `Activity.tsx`, `Profile.tsx` (each renders its title and a `PageSkeleton` until its own task fills it — real, shippable code from the first commit)
- Modify: `frontend/src/App.tsx:9, 27-36, 192-203, 275-286`

**Interfaces:**
- Produces: `usePortal(): { data: PortalBootstrap | undefined; isLoading: boolean; isError: boolean; error: unknown; refetch: () => void }`, `PortalContext`; `PortalShell({ children })`; `PortalApp()` mounted at `/portal/*`; `vocabIndustry(industry: string): VocabIndustry` and `useVocab(): (noun: VocabNoun) => string` where `VocabNoun = 'booking' | 'booking_plural' | 'service' | 'service_plural' | 'staff' | 'venue' | 'visit'` and `VocabIndustry = 'hotel' | 'beauty' | 'medical' | 'restaurant' | 'fitness' | 'other'`; `DateTime({iso, mode: 'day'|'datetime'|'time'})`.
- Consumes: `portalApi.bootstrap()`, `applyPortalTheme/clearPortalTheme`, `registerPortalLocales()`, `useAuthStore`, `logoutAndRedirect`.

- [ ] **Step 1: Write the failing shell test**

`frontend/src/portal/PortalShell.test.tsx`:
```tsx
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { PortalContext, type PortalContextValue } from './PortalProvider'
import { PortalShell } from './PortalShell'
import type { PortalBootstrap } from './lib/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, fallback?: string) => fallback ?? _k, i18n: { language: 'en' } }),
}))
vi.mock('../stores/authStore', () => ({
  useAuthStore: () => ({ user: { id: 1, name: 'Ada Lovelace', email: 'ada@example.test', user_type: 'member' }, token: 't' }),
}))
vi.mock('../lib/logout', () => ({ logoutAndRedirect: vi.fn() }))

const base: PortalBootstrap = {
  venue: {
    name: 'Numa Skin Lab', logo_url: null, industry: 'beauty', currency: 'EUR', timezone: 'Europe/Riga',
    contact: { email: null, phone: null },
    accent: { hex: '#b04a6e', ink: '#ffffff', deep: '#8e3b58', dark_hex: '#e38ab0', dark_ink: '#1a0b12', dark_deep: '#f0b4cd' },
    display_face: 'cormorant',
  },
  capabilities: { loyalty: true, services: true, stays: false, chat: true, payments: { services: false, stays: false, publishable_key: null } },
  policies: { services_cancel_hours: 24, booking_cancel_hours: 48, services_cancellation_policy: '' },
  member: null,
  counts: { unread_notifications: 0, upcoming_bookings: 2 },
}

function render(data: PortalBootstrap) {
  const value: PortalContextValue = { data, isLoading: false, isError: false, error: null, refetch: () => {} }
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/portal']}>
      <PortalContext.Provider value={value}>
        <PortalShell><p>page</p></PortalShell>
      </PortalContext.Provider>
    </MemoryRouter>,
  )
}

describe('PortalShell', () => {
  it('is the token scope and names the venue', () => {
    const html = render(base)
    expect(html).toContain('data-portal=""')
    expect(html).toContain('Numa Skin Lab')
    expect(html).toContain('page')
  })

  it('shows Rewards only for a loyalty venue', () => {
    expect(render(base)).toContain('href="/portal/rewards"')
    expect(render({ ...base, capabilities: { ...base.capabilities, loyalty: false } })).not.toContain('href="/portal/rewards"')
  })

  it('never links to a Book page in this phase', () => {
    expect(render(base)).not.toContain('href="/portal/book"')
  })

  it('badges the bookings tab with the upcoming count', () => {
    expect(render(base)).toMatch(/href="\/portal\/bookings"[\s\S]*?>2</)
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
cd /c/wamp64/www/Hexa-Tech-portal/frontend && npx vitest run src/portal/PortalShell 2>&1 | tail -10
```
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the provider**

`frontend/src/portal/PortalProvider.tsx`:
```tsx
import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { portalApi } from './lib/portalApi'
import type { PortalBootstrap } from './lib/types'
import { applyPortalTheme, clearPortalTheme } from './theme/applyPortalTheme'

export interface PortalContextValue {
  data: PortalBootstrap | undefined
  isLoading: boolean
  isError: boolean
  error: unknown
  refetch: () => void
}

export const PortalContext = createContext<PortalContextValue>({
  data: undefined, isLoading: true, isError: false, error: null, refetch: () => {},
})

export function usePortal(): PortalContextValue {
  return useContext(PortalContext)
}

const MANIFEST_PORTAL = '/manifest.webmanifest?app=portal'

/**
 * Loads the one bootstrap payload and paints the venue: accent variables on
 * <html>, the document title, the portal's own install manifest. Everything
 * it touches outside React is undone on unmount, so a member signing out
 * into the staff login page gets the admin chrome back.
 */
export function PortalProvider({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation()
  const query = useQuery({
    queryKey: ['portal-bootstrap'],
    queryFn: portalApi.bootstrap,
    staleTime: 60_000,
    retry: (count, error) => {
      const status = (error as { response?: { status?: number } })?.response?.status
      return status !== 403 && status !== 401 && count < 2
    },
  })

  useEffect(() => {
    const root = document.documentElement
    const data = query.data
    if (!data) return
    applyPortalTheme(root, { accent: data.venue.accent, display_face: data.venue.display_face })
    const previousTitle = document.title
    document.title = data.venue.name
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
    const previousManifest = link?.getAttribute('href') ?? null
    link?.setAttribute('href', MANIFEST_PORTAL)
    const serverLanguage = data.member?.user.language
    if (serverLanguage && serverLanguage !== i18n.language && i18n.options.supportedLngs && (i18n.options.supportedLngs as string[]).includes(serverLanguage)) {
      void i18n.changeLanguage(serverLanguage)
    }
    return () => {
      clearPortalTheme(root)
      document.title = previousTitle
      if (link && previousManifest) link.setAttribute('href', previousManifest)
    }
  }, [query.data, i18n])

  return (
    <PortalContext.Provider value={{ data: query.data, isLoading: query.isLoading, isError: query.isError, error: query.error, refetch: () => { void query.refetch() } }}>
      {children}
    </PortalContext.Provider>
  )
}
```

- [ ] **Step 4: Write the shell**

`frontend/src/portal/PortalShell.tsx`:
```tsx
import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Home, Gift, CalendarDays, User, LogOut } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { logoutAndRedirect } from '../lib/logout'
import { usePortal } from './PortalProvider'
import { Notice } from './ui/Notice'
import { Button } from './ui/Button'
import { PageSkeleton } from './ui/Skeleton'

/**
 * The member's frame: venue name up top, a thumb-reachable bar on phones,
 * tabs from `sm`. Destinations follow what the venue can do — no Rewards
 * for a clinic, no Book until phase 2 ships it — so nothing points at a
 * page that would be empty.
 */
export function PortalShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const { data, isLoading, isError, error, refetch } = usePortal()

  const items = [
    { to: '/portal', label: t('portal.nav.home', 'Home'), icon: Home, end: true, show: true, badge: 0 },
    { to: '/portal/rewards', label: t('portal.nav.rewards', 'Rewards'), icon: Gift, end: false, show: !!data?.capabilities.loyalty, badge: 0 },
    { to: '/portal/bookings', label: t('portal.nav.bookings', 'Bookings'), icon: CalendarDays, end: false, show: true, badge: data?.counts.upcoming_bookings ?? 0 },
    { to: '/portal/profile', label: t('portal.nav.profile', 'Profile'), icon: User, end: false, show: true, badge: 0 },
  ].filter(i => i.show)

  const firstName = user?.name?.split(' ')[0]
  const status = (error as { response?: { status?: number; data?: { error?: string } } })?.response
  const portalOff = status?.status === 403 && status.data?.error === 'portal_disabled'

  return (
    <div data-portal="" className="min-h-screen flex flex-col font-p-body">
      <header className="sticky top-0 z-30 bg-p-bg/90 backdrop-blur border-b border-p-border">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {data?.venue.logo_url && <img src={data.venue.logo_url} alt="" className="h-7 w-7 rounded-full object-cover" />}
            <span className="font-p-display text-lg truncate">{data?.venue.name ?? t('portal.shell.membership', 'My membership')}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {firstName && <span className="hidden sm:inline text-sm text-p-text-2">{t('portal.shell.greeting', 'Hello, {{name}}', { name: firstName })}</span>}
            <button
              onClick={() => { void logoutAndRedirect('/login') }}
              className="flex items-center gap-1.5 text-xs text-p-text-2 hover:text-p-text rounded-p-control px-2 min-h-11"
            >
              <LogOut size={14} aria-hidden /> {t('portal.common.sign_out', 'Sign out')}
            </button>
          </div>
        </div>
        <nav className="hidden sm:block border-t border-p-border" aria-label={t('portal.shell.menu', 'Menu')}>
          <div className="max-w-3xl mx-auto px-4 flex gap-1">
            {items.map(({ to, label, icon: Icon, end, badge }) => (
              <NavLink key={to} to={to} end={end}
                className={({ isActive }) => `flex items-center gap-2 px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${isActive ? 'border-p-accent text-p-text' : 'border-transparent text-p-text-2 hover:text-p-text'}`}>
                <Icon size={15} aria-hidden /> {label}
                {badge > 0 && <span className="ml-1 rounded-full bg-p-accent text-p-accent-ink text-[10px] font-bold px-1.5">{badge}</span>}
              </NavLink>
            ))}
          </div>
        </nav>
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-5 pb-24 sm:pb-8">
        {isLoading && <PageSkeleton />}
        {isError && portalOff && <Notice tone="warning">{t('portal.shell.portal_off', 'The member portal is switched off for this venue. Please contact them directly.')}</Notice>}
        {isError && !portalOff && (
          <div className="space-y-3">
            <Notice tone="danger">{t('portal.common.error', 'Something went wrong. Please try again.')}</Notice>
            <Button variant="secondary" onClick={refetch}>{t('portal.common.retry', 'Try again')}</Button>
          </div>
        )}
        {!isLoading && !isError && children}
      </main>

      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-30 bg-p-surface/95 backdrop-blur border-t border-p-border" aria-label={t('portal.shell.menu', 'Menu')} style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className={`grid ${items.length === 3 ? 'grid-cols-3' : 'grid-cols-4'}`}>
          {items.map(({ to, label, icon: Icon, end, badge }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) => `relative flex flex-col items-center gap-0.5 py-2 min-h-14 text-[11px] font-medium transition-colors ${isActive ? 'text-p-accent-deep' : 'text-p-text-2'}`}>
              <Icon size={20} aria-hidden />
              {label}
              {badge > 0 && <span className="absolute top-1.5 right-[calc(50%-18px)] rounded-full bg-p-accent text-p-accent-ink text-[10px] font-bold px-1.5">{badge}</span>}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
```

Also create the two modules that depend on the provider (kept out of Tasks 9 and 10 so those tasks type-check on their own):

`frontend/src/portal/lib/vocab.ts`:
```ts
import { useTranslation } from 'react-i18next'
import { usePortal } from '../PortalProvider'

/**
 * Industry nouns, translated. The admin's lib/vocabulary.ts is English-only;
 * a member reading the portal in Russian must not meet "Treatment" in the
 * middle of a Russian sentence, so the nouns live in the portal bundle under
 * vocab.<industry>.<noun> and resolve through i18next like everything else.
 */
export type VocabIndustry = 'hotel' | 'beauty' | 'medical' | 'restaurant' | 'fitness' | 'other'
export type VocabNoun = 'booking' | 'booking_plural' | 'service' | 'service_plural' | 'staff' | 'venue' | 'visit'

const KNOWN: readonly VocabIndustry[] = ['hotel', 'beauty', 'medical', 'restaurant', 'fitness']

export function vocabIndustry(industry: string | null | undefined): VocabIndustry {
  return (KNOWN as readonly string[]).includes(industry ?? '') ? (industry as VocabIndustry) : 'other'
}

export function useVocab(): (noun: VocabNoun) => string {
  const { t } = useTranslation()
  const { data } = usePortal()
  const industry = vocabIndustry(data?.venue.industry)
  return (noun) => t(`portal.vocab.${industry}.${noun}`)
}
```

`frontend/src/portal/ui/DateTime.tsx`:
```tsx
import { useTranslation } from 'react-i18next'
import { usePortal } from '../PortalProvider'
import { formatDateTime, formatDay, formatTime } from '../lib/dates'

export function DateTime({ iso, mode }: { iso: string; mode: 'day' | 'datetime' | 'time' }) {
  const { i18n } = useTranslation()
  const { data } = usePortal()
  const tz = data?.venue.timezone
  const text = mode === 'day' ? formatDay(iso, i18n.language)
    : mode === 'time' ? formatTime(iso, i18n.language, tz)
    : formatDateTime(iso, i18n.language, tz)
  return <time dateTime={iso}>{text}</time>
}
```

- [ ] **Step 5: Write the routes and the first page files**

`frontend/src/portal/PortalApp.tsx`:
```tsx
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { registerPortalLocales } from './i18n'
import { PortalProvider } from './PortalProvider'
import { PortalShell } from './PortalShell'
import { Home } from './pages/Home'
import { Rewards } from './pages/Rewards'
import { Bookings } from './pages/Bookings'
import { Activity } from './pages/Activity'
import { Profile } from './pages/Profile'

registerPortalLocales()

/**
 * Everything under /portal/* for a signed-in member. Staff are sent to the
 * console; nobody without a token gets past the login. Join and claim are
 * public and live outside this tree (App.tsx).
 */
export function PortalApp() {
  const { token, user } = useAuthStore()
  if (!token) return <Navigate to="/login" replace />
  if (user?.user_type === 'staff') return <Navigate to="/" replace />

  return (
    <PortalProvider>
      <PortalShell>
        <Routes>
          <Route index element={<Home />} />
          <Route path="rewards" element={<Rewards />} />
          <Route path="bookings" element={<Bookings />} />
          <Route path="bookings/:kind/:id" element={<Bookings />} />
          <Route path="activity" element={<Activity />} />
          <Route path="profile" element={<Profile />} />
          <Route path="*" element={<Navigate to="/portal" replace />} />
        </Routes>
      </PortalShell>
    </PortalProvider>
  )
}
```

First versions of the five pages, each a real component that the later task replaces wholesale. Same shape for all five (`Home` shown; `Rewards`, `Bookings`, `Activity`, `Profile` differ only in the exported name and the `t()` key `portal.nav.<name>`):
```tsx
import { useTranslation } from 'react-i18next'
import { PageSkeleton } from '../ui/Skeleton'

export function Home() {
  const { t } = useTranslation()
  return (
    <div className="space-y-4">
      <h1 className="font-p-display text-2xl">{t('portal.nav.home', 'Home')}</h1>
      <PageSkeleton />
    </div>
  )
}
```

- [ ] **Step 6: Mount it in App.tsx**

In `frontend/src/App.tsx`:
- delete line 9 (`import { PortalLayout } …`) and lines 27-36 (the six `Portal*` lazy imports and the join/claim ones);
- add, next to the other lazy imports:
```tsx
// Member portal. One lazy chunk so a staff session never downloads it;
// join and claim are public entry points and stay outside its guard.
const PortalRoutes = lazy(() => import('./portal/PortalApp').then(m => ({ default: m.PortalApp })))
const PortalJoin   = lazy(() => import('./portal/pages/Join').then(m => ({ default: m.Join })))
const PortalClaim  = lazy(() => import('./portal/pages/Claim').then(m => ({ default: m.Claim })))
```
- delete the `MemberRoute` function (lines 183-203);
- replace lines 275-286 (the two public routes and the six member routes) with:
```tsx
          {/* Public member entry points. Outside the portal guard: nobody
              signing up or claiming an account has a session yet. */}
          <Route path="/portal/join"  element={<ChunkErrorBoundary><Suspense fallback={<PageLoader />}><PortalJoin /></Suspense></ChunkErrorBoundary>} />
          <Route path="/portal/claim" element={<ChunkErrorBoundary><Suspense fallback={<PageLoader />}><PortalClaim /></Suspense></ChunkErrorBoundary>} />

          {/* Member portal — same login, different app. */}
          <Route path="/portal/*" element={<ChunkErrorBoundary><Suspense fallback={<PageLoader />}><PortalRoutes /></Suspense></ChunkErrorBoundary>} />
```
Until Task 16 creates `portal/pages/Join.tsx` and `Claim.tsx`, keep the two old imports pointing at `./pages/portal/PortalJoin` / `./pages/portal/PortalClaim` (`m.PortalJoin`, `m.PortalClaim`) so `tsc` passes now; Task 16 switches them.

- [ ] **Step 7: Type-check, run the portal tests, look at it**

```bash
cd /c/wamp64/www/Hexa-Tech-portal/frontend && npx tsc -b && npx vitest run src/portal src/i18n 2>&1 | tail -20
```
Expected: pass.

Then run it for real. Backend on a port of its own from the worktree, frontend dev server pointed at it:
```bash
cd /c/wamp64/www/Hexa-Tech-portal && /c/wamp64/bin/php/php8.4.20/php.exe artisan serve --host=127.0.0.1 --port=8010
```
```bash
cd /c/wamp64/www/Hexa-Tech-portal/frontend && VITE_API_URL=http://127.0.0.1:8010/api npm run dev
```
Open `http://localhost:5173/portal/join?org=<a local venue's widget token>` (read one with `/c/wamp64/bin/php/php8.4.20/php.exe artisan tinker --execute="echo App\Models\Organization::first()->widget_token;"`), register a member, and confirm `/portal` shows the venue name in the header, the bar with three or four items, and the skeleton pages. Screenshot at 390 and 1440 into `.superpowers/shots/portal-v2/shell-*.png` (the folder is git-excluded).

- [ ] **Step 8: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-portal && git add frontend/src/portal frontend/src/App.tsx && git commit -q -F - <<'EOF'
Boot the member portal on its own shell

One lazy chunk at /portal/*: a provider that loads the bootstrap
payload and paints the venue (accent variables, title, the portal's
manifest), a shell whose destinations follow the venue's capabilities,
and the route table. Pages arrive one task at a time on this frame.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 12: Home — the card, the next booking, wallet buttons

**Files:**
- Create (replace the Task 11 stub): `frontend/src/portal/pages/Home.tsx`, `frontend/src/portal/pages/MemberCard.tsx`, `frontend/src/portal/pages/WalletButtons.tsx`, `frontend/src/portal/pages/Home.test.tsx`

**Interfaces:**
- Consumes: `usePortal()`, `portalApi.card()/bookings()/appleWalletLink()/googleWallet()`, `useVocab()`, `Money`, `DateTime`, `Card`, `Button`, `Chip`, `EmptyState`, `Notice`.
- Produces: `MemberCard({ member, loyalty })` (reused by nothing else in phase 1; phase 2 reuses it on the booking review step), `WalletButtons()`.

- [ ] **Step 1: Write the failing render test**

`frontend/src/portal/pages/Home.test.tsx`:
```tsx
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PortalContext, type PortalContextValue } from '../PortalProvider'
import { Home } from './Home'
import type { PortalBootstrap, PortalMember } from '../lib/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, fallback?: string | Record<string, unknown>, opts?: Record<string, unknown>) => {
      const vars = typeof fallback === 'object' ? fallback : opts
      let text = typeof fallback === 'string' ? fallback : _k
      for (const [k, v] of Object.entries(vars ?? {})) text = text.replace(`{{${k}}}`, String(v))
      return text
    },
    i18n: { language: 'en' },
  }),
}))
vi.mock('../lib/portalApi', () => ({
  portalApi: { card: () => new Promise(() => {}), bookings: () => new Promise(() => {}) },
  apiMessage: (_e: unknown, f: string) => f,
}))

const member: PortalMember = {
  member_number: 'HL-000123', name: 'Ada Lovelace', tier: { id: 2, name: 'Gold', color_hex: '#FFD700' },
  current_points: 1250, lifetime_points: 4100, referral_code: 'ADA1', progress: { percentage: 25, points_needed: 3750, next_tier: { id: 3, name: 'Platinum' } },
  recent_activity: [{ id: 1, type: 'earn', points: 120, description: 'Facial', created_at: '2026-09-01T10:00:00Z' }],
  marketing_consent: false, email_notifications: true, push_notifications: true, member_since: '2026-01-15',
  user: { id: 1, name: 'Ada Lovelace', email: 'ada@example.test', phone: null, language: 'en' }, benefits: [],
}
const base: PortalBootstrap = {
  venue: { name: 'Numa', logo_url: null, industry: 'beauty', currency: 'EUR', timezone: 'Europe/Riga', contact: { email: 'hi@numa.test', phone: null },
    accent: { hex: '#b04a6e', ink: '#ffffff', deep: '#8e3b58', dark_hex: '#e38ab0', dark_ink: '#1a0b12', dark_deep: '#f0b4cd' }, display_face: 'cormorant' },
  capabilities: { loyalty: true, services: true, stays: false, chat: true, payments: { services: false, stays: false, publishable_key: null } },
  policies: { services_cancel_hours: 24, booking_cancel_hours: 48, services_cancellation_policy: '' },
  member, counts: { unread_notifications: 0, upcoming_bookings: 0 },
}

function render(data: PortalBootstrap) {
  const value: PortalContextValue = { data, isLoading: false, isError: false, error: null, refetch: () => {} }
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter><PortalContext.Provider value={value}><Home /></PortalContext.Provider></MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Home', () => {
  it('shows the balance, the tier, the progress and the member number', () => {
    const html = render(base)
    expect(html).toContain('1,250')
    expect(html).toContain('Gold')
    expect(html).toContain('Platinum')
    expect(html).toContain('HL-000123')
    expect(html).toContain('href="/portal/rewards?tab=catalogue"')
  })

  it('hides every points element for a venue without loyalty but keeps the member number', () => {
    const html = render({ ...base, capabilities: { ...base.capabilities, loyalty: false } })
    expect(html).not.toContain('1,250')
    expect(html).not.toContain('href="/portal/rewards')
    expect(html).toContain('HL-000123')
  })

  it('offers the venue contact when it has one', () => {
    expect(render(base)).toContain('hi@numa.test')
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
cd /c/wamp64/www/Hexa-Tech-portal/frontend && npx vitest run src/portal/pages/Home 2>&1 | tail -10
```
Expected: FAIL — the stub renders no balance.

- [ ] **Step 3: Write the card, the wallet buttons and the page**

`frontend/src/portal/pages/MemberCard.tsx`:
```tsx
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { portalApi } from '../lib/portalApi'
import type { PortalMember } from '../lib/types'
import { Card } from '../ui/Card'
import { WalletButtons } from './WalletButtons'

/**
 * The portal's signature element and the thing shown at the desk. Dark in
 * both modes (Card tone="spotlight"), the tier colour as a halo, the QR on
 * white because scanners need it that way.
 */
export function MemberCard({ member, loyalty }: { member: PortalMember; loyalty: boolean }) {
  const { t } = useTranslation()
  const { data: card } = useQuery({ queryKey: ['portal-card'], queryFn: portalApi.card, staleTime: Infinity })
  const tierColor = member.tier?.color_hex || undefined

  return (
    <Card tone="spotlight" className="relative p-5 p-rise">
      <div aria-hidden className="absolute -top-24 -right-16 w-56 h-56 rounded-full blur-3xl opacity-25" style={{ background: tierColor || 'rgb(var(--p-accent))' }} />

      <div className="relative flex items-start justify-between gap-4">
        <div>
          {loyalty ? (
            <>
              <p className="text-[11px] uppercase tracking-widest text-p-text-2">{t('portal.home.balance', 'Points balance')}</p>
              <p className="font-p-display text-5xl leading-tight tabular-nums text-p-text">{member.current_points.toLocaleString()}</p>
              <p className="text-[11px] text-p-text-2 mt-1">{t('portal.home.lifetime', '{{count}} earned all time', { count: member.lifetime_points.toLocaleString() })}</p>
            </>
          ) : (
            <p className="font-p-display text-2xl leading-tight text-p-text">{member.name}</p>
          )}
        </div>
        {loyalty && member.tier && (
          <span className="shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-full border border-p-border text-p-text" style={tierColor ? { color: tierColor, borderColor: `${tierColor}66`, background: `${tierColor}1f` } : undefined}>
            {member.tier.name}
          </span>
        )}
      </div>

      {loyalty && member.progress?.next_tier && (
        <div className="relative mt-5">
          <div className="flex justify-between text-[11px] text-p-text-2 mb-1.5">
            <span>{t('portal.home.progress_to', 'Progress to {{tier}}', { tier: member.progress.next_tier.name })}</span>
            <span className="tabular-nums">{t('portal.home.points_to_go', '{{count}} points to go', { count: member.progress.points_needed.toLocaleString() })}</span>
          </div>
          <div className="h-1.5 rounded-full bg-p-surface-2 overflow-hidden" role="progressbar" aria-valuenow={member.progress.percentage} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full" style={{ width: `${Math.max(member.progress.percentage, 2)}%`, background: tierColor || 'rgb(var(--p-accent))' }} />
          </div>
        </div>
      )}

      <div className="relative mt-5 pt-4 border-t border-p-border flex items-center gap-4">
        {(card?.qr_svg || card?.qr_image) && (
          // White in both modes because scanners need it so — a literal, not a token, on purpose.
          <div className="rounded-lg p-1.5 shrink-0" style={{ background: '#ffffff' }}>
            {card.qr_svg
              // Generated server-side by our own QR library from the member number; no user input reaches it.
              ? <div className="w-20 h-20 [&>svg]:w-full [&>svg]:h-full" dangerouslySetInnerHTML={{ __html: card.qr_svg }} />
              : <img src={card.qr_image!} alt="" className="w-20 h-20" />}
          </div>
        )}
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-widest text-p-text-2">{t('portal.home.member_number', 'Member number')}</p>
          <p className="font-mono text-sm font-semibold truncate text-p-text">{member.member_number}</p>
          <p className="text-[11px] text-p-text-2 mt-1">{t('portal.home.show_at_counter', 'Show this at the counter to earn or redeem.')}</p>
        </div>
      </div>

      {loyalty && <WalletButtons />}
    </Card>
  )
}
```

`frontend/src/portal/pages/WalletButtons.tsx`:
```tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Wallet } from 'lucide-react'
import { portalApi, apiMessage } from '../lib/portalApi'
import { Button } from '../ui/Button'
import { Notice } from '../ui/Notice'

/**
 * Apple needs a Safari navigation to a one-time URL (the token never rides
 * a query string); Google hands back a save URL. Either endpoint answers
 * 503 when the venue has not set the pass up, which is a sentence, not an
 * error.
 */
export function WalletButtons() {
  const { t } = useTranslation()
  const [busy, setBusy] = useState<'apple' | 'google' | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const isApple = typeof navigator !== 'undefined' && /iPhone|iPad|Macintosh/.test(navigator.userAgent)

  const open = async (which: 'apple' | 'google') => {
    setBusy(which); setNotice(null)
    try {
      if (which === 'apple') {
        const { url } = await portalApi.appleWalletLink()
        window.location.href = url
      } else {
        const res = await portalApi.googleWallet()
        const url = res.saveUrl ?? res.save_url
        if (!url) throw new Error('no url')
        window.location.href = url
      }
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status
      setNotice(status === 503 || status === 404
        ? t('portal.home.wallet_unavailable', 'Wallet passes are not set up for this venue yet.')
        : apiMessage(e, t('portal.home.wallet_error', 'Could not prepare the pass. Please try again.')))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="relative mt-4 space-y-2">
      <div className="flex flex-col sm:flex-row gap-2">
        {isApple && (
          <Button variant="secondary" size="sm" loading={busy === 'apple'} onClick={() => { void open('apple') }}>
            <Wallet size={14} aria-hidden /> {t('portal.home.wallet_apple', 'Add to Apple Wallet')}
          </Button>
        )}
        <Button variant="secondary" size="sm" loading={busy === 'google'} onClick={() => { void open('google') }}>
          <Wallet size={14} aria-hidden /> {t('portal.home.wallet_google', 'Add to Google Wallet')}
        </Button>
      </div>
      {notice && <Notice tone="info">{notice}</Notice>}
    </div>
  )
}
```

`frontend/src/portal/pages/Home.tsx`:
```tsx
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowRight, CalendarDays, Gift, Sparkles } from 'lucide-react'
import { usePortal } from '../PortalProvider'
import { portalApi } from '../lib/portalApi'
import { useVocab } from '../lib/vocab'
import { formatDay } from '../lib/dates'
import { Card } from '../ui/Card'
import { Chip } from '../ui/Chip'
import { DateTime } from '../ui/DateTime'
import { Money } from '../ui/Money'
import { EmptyState } from '../ui/EmptyState'
import { MemberCard } from './MemberCard'

/**
 * First screenful answers what a member opens the portal for: how many
 * points, what level, what to show at the desk, and when they are next
 * expected. Everything else is one tap away.
 */
export function Home() {
  const { t, i18n } = useTranslation()
  const { data } = usePortal()
  const vocab = useVocab()
  const { data: upcoming } = useQuery({ queryKey: ['portal-bookings', 'upcoming', 1], queryFn: () => portalApi.bookings('upcoming', 1) })

  if (!data) return null
  const { member, capabilities, venue } = data
  const next = upcoming?.data[0]

  return (
    <div className="space-y-5">
      {member && <MemberCard member={member} loyalty={capabilities.loyalty} />}

      <section>
        <h2 className="text-sm font-semibold text-p-text mb-2">{t('portal.home.next_booking', 'Your next {{noun}}', { noun: vocab('booking') })}</h2>
        {next ? (
          <Link to={`/portal/bookings/${next.kind}/${next.id}`} className="block">
            <Card className="p-4 p-lift flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-p-accent/10 text-p-accent-deep flex items-center justify-center shrink-0"><CalendarDays size={18} aria-hidden /></div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">{next.title}</p>
                <p className="text-xs text-p-text-2">
                  {next.starts_at && <DateTime iso={next.starts_at} mode={next.kind === 'stay' ? 'day' : 'datetime'} />}
                  {next.subtitle && next.kind === 'service' && ` · ${next.subtitle}`}
                </p>
              </div>
              <div className="text-right shrink-0">
                <Money amount={next.total} currency={next.currency} className="text-sm font-semibold" />
                <div className="mt-1"><Chip tone={next.status === 'confirmed' ? 'success' : 'neutral'}>{t(`portal.bookings.status.${next.status}`, next.status)}</Chip></div>
              </div>
            </Card>
          </Link>
        ) : (
          <EmptyState icon={<CalendarDays size={18} aria-hidden />} title={t('portal.home.no_upcoming', 'Nothing booked yet.')} />
        )}
      </section>

      {capabilities.loyalty && (
        <div className="grid grid-cols-2 gap-3">
          <Link to="/portal/rewards?tab=catalogue" className="block">
            <Card className="p-4 p-lift h-full">
              <Gift size={18} className="text-p-accent-deep mb-2" aria-hidden />
              <p className="text-sm font-semibold">{t('portal.home.quick_rewards', 'Spend points')}</p>
              <p className="text-[11px] text-p-text-2">{t('portal.home.quick_rewards_hint', 'Browse the rewards catalogue')}</p>
            </Card>
          </Link>
          <Link to="/portal/rewards?tab=offers" className="block">
            <Card className="p-4 p-lift h-full">
              <Sparkles size={18} className="text-p-accent-deep mb-2" aria-hidden />
              <p className="text-sm font-semibold">{t('portal.home.quick_offers', 'Your offers')}</p>
              <p className="text-[11px] text-p-text-2">{t('portal.home.quick_offers_hint', 'Discounts available to you')}</p>
            </Card>
          </Link>
        </div>
      )}

      {capabilities.loyalty && member && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold">{t('portal.home.recent_activity', 'Recent activity')}</h2>
            <Link to="/portal/activity" className="flex items-center gap-1 text-xs text-p-accent-deep">{t('portal.common.see_all', 'See all')} <ArrowRight size={12} aria-hidden /></Link>
          </div>
          {member.recent_activity?.length ? (
            <Card className="overflow-hidden divide-y divide-p-border">
              {member.recent_activity.map(a => (
                <div key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm truncate">{a.description || a.type}</p>
                    <p className="text-[11px] text-p-text-2">{formatDay(a.created_at, i18n.language)}</p>
                  </div>
                  <span className={`shrink-0 text-sm font-semibold tabular-nums ${a.points >= 0 ? 'text-p-success' : 'text-p-text-2'}`}>{a.points >= 0 ? '+' : ''}{a.points.toLocaleString()}</span>
                </div>
              ))}
            </Card>
          ) : (
            <EmptyState title={t('portal.home.no_activity', 'Your points will appear here after your first visit.')} />
          )}
        </section>
      )}

      <p className="text-center text-[11px] text-p-text-2">
        {member && t('portal.home.member_since', 'Member since {{date}}', { date: formatDay(member.member_since, i18n.language) })}
        {(venue.contact.email || venue.contact.phone) && (
          <>
            {' · '}
            <a href={venue.contact.email ? `mailto:${venue.contact.email}` : `tel:${venue.contact.phone}`} className="text-p-accent-deep">
              {t('portal.home.contact', 'Questions? Contact {{venue}}', { venue: venue.name })}
            </a>
            {venue.contact.email && <span className="sr-only">{venue.contact.email}</span>}
          </>
        )}
      </p>
    </div>
  )
}
```

- [ ] **Step 4: Run the tests, then look**

```bash
cd /c/wamp64/www/Hexa-Tech-portal/frontend && npx tsc -b && npx vitest run src/portal 2>&1 | tail -20
```
Expected: pass. Then, with the dev server from Task 11 running, screenshot `/portal` at 390 and 1440, light and dark (toggle the OS setting or emulate `prefers-color-scheme` in DevTools), into `.superpowers/shots/portal-v2/home-*.png`. Check against spec §4: the card is the one dark band, the balance is in the display face, the bar is reachable, nothing is Inter-only-dark-neon.

- [ ] **Step 5: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-portal && git add frontend/src/portal/pages && git commit -q -F - <<'EOF'
Build the member's home: card, next booking, wallet

The card is the portal's one dark band and the thing shown at the
desk; the next appointment or stay sits under it; wallet passes are a
tap for venues that set them up. A venue without loyalty gets the same
home with every points element gone.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 13: Rewards hub — benefits, catalogue, offers, my codes

**Files:**
- Create (replace the stub): `frontend/src/portal/pages/Rewards.tsx`, `frontend/src/portal/pages/rewards/BenefitsTab.tsx`, `CatalogueTab.tsx`, `OffersTab.tsx`, `CodesTab.tsx`, `frontend/src/portal/pages/rewards/offerLabel.ts`, `frontend/src/portal/pages/rewards/offerLabel.test.ts`

**Interfaces:**
- Consumes: `portalApi.benefits/requestBenefit/cancelBenefitRequest/rewards/redeem/redemptions/offers/claimOffer`, `Tabs`, `Sheet`, `Card`, `Button`, `Chip`, `EmptyState`, `Notice`, `formatDay`.
- Produces: `offerValueLabel(offer, t): string | null`.

- [ ] **Step 1: Write the failing test**

`frontend/src/portal/pages/rewards/offerLabel.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { offerValueLabel } from './offerLabel'

const t = (key: string, fallback: string, vars?: Record<string, unknown>) =>
  Object.entries(vars ?? {}).reduce((s, [k, v]) => s.replace(`{{${k}}}`, String(v)), fallback || key)

describe('offerValueLabel', () => {
  it('reads the three money-shaped offer types', () => {
    expect(offerValueLabel({ id: 1, title: 'x', type: 'discount', value: 15 }, t)).toBe('15% off')
    expect(offerValueLabel({ id: 1, title: 'x', type: 'percent_discount', value: '10' }, t)).toBe('10% off')
    expect(offerValueLabel({ id: 1, title: 'x', type: 'fixed_amount', value: 25 }, t)).toBe('25 off')
    expect(offerValueLabel({ id: 1, title: 'x', type: 'points_multiplier', value: 2 }, t)).toBe('2x points')
  })
  it('says nothing for a type it cannot price', () => {
    expect(offerValueLabel({ id: 1, title: 'x', type: 'free_night', value: 1 }, t)).toBeNull()
    expect(offerValueLabel({ id: 1, title: 'x', type: 'discount', value: 0 }, t)).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
cd /c/wamp64/www/Hexa-Tech-portal/frontend && npx vitest run src/portal/pages/rewards 2>&1 | tail -8
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write the label helper and the hub**

`frontend/src/portal/pages/rewards/offerLabel.ts`:
```ts
import type { Offer } from '../../lib/types'

type T = (key: string, fallback: string, vars?: Record<string, unknown>) => string

/** "15% off" / "25 off" / "2x points" — only for types the engine can price. */
export function offerValueLabel(offer: Offer, t: T): string | null {
  const value = Number(offer.value ?? 0)
  if (!value) return null
  const type = String(offer.type ?? '').toLowerCase()
  if (type.includes('percent') || type === 'discount') return t('portal.rewards.percent_off', '{{value}}% off', { value })
  if (type.includes('amount') || type.includes('fixed')) return t('portal.rewards.amount_off', '{{value}} off', { value })
  if (type.includes('point')) return t('portal.rewards.points_multiplier', '{{value}}x points', { value })
  return null
}
```

`frontend/src/portal/pages/Rewards.tsx`:
```tsx
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { usePortal } from '../PortalProvider'
import { Tabs } from '../ui/Tabs'
import { BenefitsTab } from './rewards/BenefitsTab'
import { CatalogueTab } from './rewards/CatalogueTab'
import { OffersTab } from './rewards/OffersTab'
import { CodesTab } from './rewards/CodesTab'

const TABS = ['benefits', 'catalogue', 'offers', 'codes'] as const
type Tab = (typeof TABS)[number]

/** One destination for everything the level earns; the tab survives reload via ?tab=. */
export function Rewards() {
  const { t } = useTranslation()
  const { data } = usePortal()
  const [params, setParams] = useSearchParams()
  const tab: Tab = (TABS as readonly string[]).includes(params.get('tab') ?? '') ? (params.get('tab') as Tab) : 'benefits'

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="font-p-display text-2xl">{t('portal.rewards.title', 'Rewards')}</h1>
        {data?.member && (
          <span className="text-sm text-p-text-2">{t('portal.rewards.you_have', 'You have {{count}} points', { count: data.member.current_points.toLocaleString() })}</span>
        )}
      </div>
      <Tabs
        value={tab}
        onChange={key => setParams({ tab: key }, { replace: true })}
        items={[
          { key: 'benefits', label: t('portal.rewards.tab_benefits', 'Benefits') },
          { key: 'catalogue', label: t('portal.rewards.tab_catalogue', 'Catalogue') },
          { key: 'offers', label: t('portal.rewards.tab_offers', 'Offers') },
          { key: 'codes', label: t('portal.rewards.tab_codes', 'My codes') },
        ]}
      />
      {tab === 'benefits' && <BenefitsTab />}
      {tab === 'catalogue' && <CatalogueTab />}
      {tab === 'offers' && <OffersTab />}
      {tab === 'codes' && <CodesTab />}
    </div>
  )
}
```

`frontend/src/portal/pages/rewards/BenefitsTab.tsx` (ports `PortalBenefits.tsx`'s logic onto the tokens):
```tsx
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { BadgeCheck, Clock, Crown } from 'lucide-react'
import toast from 'react-hot-toast'
import { portalApi, apiMessage } from '../../lib/portalApi'
import { formatDay } from '../../lib/dates'
import { Card } from '../../ui/Card'
import { Button } from '../../ui/Button'
import { EmptyState } from '../../ui/EmptyState'
import { PageSkeleton } from '../../ui/Skeleton'
import { Notice } from '../../ui/Notice'

export function BenefitsTab() {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['portal-benefits'], queryFn: portalApi.benefits })
  const invalidate = () => qc.invalidateQueries({ queryKey: ['portal-benefits'] })

  const request = useMutation({
    mutationFn: portalApi.requestBenefit,
    onSuccess: () => { toast.success(t('portal.rewards.request_sent', 'Requested')); void invalidate() },
    onError: e => toast.error(apiMessage(e, t('portal.rewards.request_failed', 'Could not send that request'))),
  })
  const cancel = useMutation({
    mutationFn: portalApi.cancelBenefitRequest,
    onSuccess: () => { toast.success(t('portal.rewards.request_cancelled', 'Request cancelled')); void invalidate() },
    onError: e => toast.error(apiMessage(e, t('portal.rewards.request_failed', 'Could not send that request'))),
  })

  if (isLoading) return <PageSkeleton />
  if (isError) return <div className="space-y-3"><Notice tone="danger">{t('portal.common.error', 'Something went wrong. Please try again.')}</Notice><Button variant="secondary" onClick={() => { void refetch() }}>{t('portal.common.retry', 'Try again')}</Button></div>

  const benefits = data?.benefits ?? []
  if (benefits.length === 0) {
    return <EmptyState icon={<Crown size={18} aria-hidden />} title={t('portal.rewards.benefits_empty', 'No benefits on your level yet. Keep earning points to unlock them.')} />
  }

  return (
    <div className="space-y-3">
      {data?.tier && <p className="text-xs text-p-text-2">{t('portal.rewards.tier_level', '{{tier}} level', { tier: data.tier })}</p>}
      {benefits.map(b => {
        const open = b.request
        return (
          <Card key={b.tier_benefit_id} className={`p-4 ${open ? 'border-p-accent/40' : ''}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold">{b.name}</h2>
                {b.description && <p className="text-xs text-p-text-2 mt-0.5">{b.description}</p>}
              </div>
              {b.display && <span className="shrink-0 text-xs font-semibold text-p-accent-deep">{b.display}</span>}
            </div>
            <div className="mt-3">
              {open ? (
                <div className="flex items-center justify-between gap-3">
                  <p className="flex items-center gap-1.5 text-[11px] text-p-accent-deep"><Clock size={13} aria-hidden />
                    {open.status === 'approved' ? t('portal.rewards.approved', 'Approved — ready when you are') : t('portal.rewards.requested', 'Requested — the venue will confirm')}
                  </p>
                  {(open.status === 'pending' || open.status === 'eligible') && (
                    <Button variant="ghost" size="sm" loading={cancel.isPending} onClick={() => cancel.mutate(open.id)}>{t('portal.rewards.cancel_request', 'Cancel request')}</Button>
                  )}
                </div>
              ) : b.requestable ? (
                <Button full loading={request.isPending} onClick={() => request.mutate(b.tier_benefit_id)}>{t('portal.rewards.request', 'Request this')}</Button>
              ) : (
                <p className="flex items-center gap-1.5 text-[11px] text-p-text-2"><BadgeCheck size={13} className="text-p-success" aria-hidden />
                  {b.fulfillment_mode === 'voucher' ? t('portal.rewards.voucher', 'Issued as a voucher — ask at the desk') : t('portal.rewards.automatic', 'Applied automatically')}
                </p>
              )}
              {b.last_fulfilled_at && !open && <p className="text-[10px] text-p-text-2 mt-1.5">{t('portal.rewards.last_used', 'Last used {{date}}', { date: formatDay(b.last_fulfilled_at, i18n.language) })}</p>}
            </div>
          </Card>
        )
      })}
    </div>
  )
}
```

`frontend/src/portal/pages/rewards/CatalogueTab.tsx` (ports `PortalRewards.tsx`; reads the API's real `claimed_by_me` / `can_afford` fields, and the redeem sheet keeps the code on screen instead of a toast):
```tsx
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Check, Gift } from 'lucide-react'
import { portalApi, apiMessage } from '../../lib/portalApi'
import type { Reward } from '../../lib/types'
import { Card } from '../../ui/Card'
import { Button } from '../../ui/Button'
import { Sheet } from '../../ui/Sheet'
import { EmptyState } from '../../ui/EmptyState'
import { Notice } from '../../ui/Notice'
import { PageSkeleton } from '../../ui/Skeleton'

export function CatalogueTab() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [confirming, setConfirming] = useState<Reward | null>(null)
  const [code, setCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['portal-rewards'], queryFn: portalApi.rewards })

  const redeem = useMutation({
    mutationFn: portalApi.redeem,
    onSuccess: res => {
      setConfirming(null)
      setCode(res.redemption?.code ?? null)
      void qc.invalidateQueries({ queryKey: ['portal-rewards'] })
      void qc.invalidateQueries({ queryKey: ['portal-bootstrap'] })
      void qc.invalidateQueries({ queryKey: ['portal-redemptions'] })
    },
    onError: e => { setConfirming(null); setCode(null); setError(apiMessage(e, t('portal.rewards.redeem_failed', 'Could not redeem that reward'))) },
  })

  if (isLoading) return <PageSkeleton />
  if (isError) return <div className="space-y-3"><Notice tone="danger">{t('portal.common.error', 'Something went wrong. Please try again.')}</Notice><Button variant="secondary" onClick={() => { void refetch() }}>{t('portal.common.retry', 'Try again')}</Button></div>

  const rewards = data?.rewards ?? []
  const balance = data?.current_points ?? 0

  return (
    <div className="space-y-4">
      {error && <Notice tone="danger">{error}</Notice>}
      {code && <Notice tone="success">{t('portal.rewards.redeemed', 'Redeemed — your code is {{code}}', { code })} <span className="font-mono">{code}</span></Notice>}
      {rewards.length === 0 && <EmptyState icon={<Gift size={18} aria-hidden />} title={t('portal.rewards.catalogue_empty', 'No rewards are available right now. Check back soon.')} />}
      <div className="grid sm:grid-cols-2 gap-3">
        {rewards.map(r => {
          const short = Math.max(0, r.points_cost - balance)
          const limitReached = r.per_member_limit != null && r.claimed_by_me >= r.per_member_limit
          const outOfStock = r.in_stock === false
          return (
            <Card key={r.id} className="overflow-hidden flex flex-col">
              {r.image_url && <img src={r.image_url} alt="" className="w-full h-28 object-cover" loading="lazy" />}
              <div className="p-4 flex flex-col gap-2 grow">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold truncate">{r.name}</h2>
                    {r.category && <p className="text-[11px] text-p-text-2">{r.category}</p>}
                  </div>
                  <span className="shrink-0 text-sm font-bold text-p-accent-deep tabular-nums">{r.points_cost.toLocaleString()}</span>
                </div>
                {r.description && <p className="text-xs text-p-text-2 line-clamp-2">{r.description}</p>}
                <div className="mt-auto pt-2">
                  {limitReached ? <p className="flex items-center gap-1.5 text-xs text-p-text-2"><Check size={13} aria-hidden /> {t('portal.rewards.already_claimed', 'Already claimed')}</p>
                  : outOfStock ? <p className="text-xs text-p-text-2">{t('portal.rewards.out_of_stock', 'Out of stock')}</p>
                  : short > 0 ? <p className="text-xs text-p-text-2 tabular-nums">{t('portal.rewards.points_needed', '{{count}} more points needed', { count: short.toLocaleString() })}</p>
                  : <Button full onClick={() => { setError(null); setConfirming(r) }}>{t('portal.rewards.redeem', 'Redeem')}</Button>}
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      <Sheet
        open={!!confirming}
        onClose={() => setConfirming(null)}
        title={t('portal.rewards.redeem_title', 'Redeem {{name}}?', { name: confirming?.name ?? '' })}
        footer={<>
          <Button variant="ghost" onClick={() => setConfirming(null)}>{t('portal.common.cancel', 'Cancel')}</Button>
          <Button loading={redeem.isPending} onClick={() => confirming && redeem.mutate(confirming.id)}>{t('portal.common.confirm', 'Confirm')}</Button>
        </>}
      >
        <p className="text-p-text-2">{t('portal.rewards.redeem_body', "This spends {{count}} points. You'll get a code to show at the desk.", { count: (confirming?.points_cost ?? 0).toLocaleString() })}</p>
      </Sheet>
    </div>
  )
}
```

`frontend/src/portal/pages/rewards/OffersTab.tsx` (ports `PortalOffers.tsx`):
```tsx
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { BadgeCheck, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'
import { portalApi, apiMessage } from '../../lib/portalApi'
import { formatDay } from '../../lib/dates'
import { Card } from '../../ui/Card'
import { Button } from '../../ui/Button'
import { EmptyState } from '../../ui/EmptyState'
import { Notice } from '../../ui/Notice'
import { PageSkeleton } from '../../ui/Skeleton'
import { offerValueLabel } from './offerLabel'

export function OffersTab() {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['portal-offers'], queryFn: portalApi.offers })
  const claim = useMutation({
    mutationFn: portalApi.claimOffer,
    onSuccess: () => { toast.success(t('portal.rewards.claimed', 'Offer claimed — show it at the desk')); void qc.invalidateQueries({ queryKey: ['portal-offers'] }) },
    onError: e => toast.error(apiMessage(e, t('portal.rewards.claim_failed', 'Could not claim that offer'))),
  })

  if (isLoading) return <PageSkeleton />
  if (isError) return <div className="space-y-3"><Notice tone="danger">{t('portal.common.error', 'Something went wrong. Please try again.')}</Notice><Button variant="secondary" onClick={() => { void refetch() }}>{t('portal.common.retry', 'Try again')}</Button></div>

  const claimed = (data?.personalized ?? []).filter(c => c.offer)
  const claimedIds = new Set(claimed.map(c => c.offer?.id))
  const available = (data?.general ?? []).filter(o => !claimedIds.has(o.id))
  const lang = i18n.language

  return (
    <div className="space-y-6">
      {claimed.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-p-text-2 uppercase tracking-wider">{t('portal.rewards.offers_yours', 'Yours to use')}</h2>
          {claimed.map(c => {
            const used = !!c.used_at
            const label = c.offer ? offerValueLabel(c.offer, t) : null
            return (
              <Card key={c.id} className={`p-4 ${used ? 'opacity-60' : 'border-p-accent/40'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold truncate">{c.offer?.title}</h3>
                    {c.offer?.description && <p className="text-xs text-p-text-2 mt-0.5 line-clamp-2">{c.offer.description}</p>}
                  </div>
                  {label && <span className="shrink-0 text-sm font-bold text-p-accent-deep">{label}</span>}
                </div>
                <p className="mt-3 flex items-center gap-1.5 text-[11px] text-p-text-2">
                  <BadgeCheck size={13} className={used ? '' : 'text-p-success'} aria-hidden />
                  {used ? t('portal.rewards.used_on', 'Used {{date}}', { date: formatDay(c.used_at!, lang) })
                    : c.offer?.end_date ? t('portal.rewards.valid_until', 'Valid until {{date}}', { date: formatDay(c.offer.end_date, lang) })
                    : t('portal.rewards.ready_to_use', 'Ready to use — show this at the desk')}
                </p>
              </Card>
            )
          })}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-xs font-semibold text-p-text-2 uppercase tracking-wider">{t('portal.rewards.offers_available', 'Available to you')}</h2>
        {available.length === 0 ? (
          <EmptyState icon={<Sparkles size={18} aria-hidden />} title={t('portal.rewards.offers_empty', "No offers right now. We'll let you know when something arrives.")} />
        ) : available.map(o => {
          const label = offerValueLabel(o, t)
          const full = o.usage_limit != null && (o.times_used ?? 0) >= o.usage_limit
          return (
            <Card key={o.id} className="overflow-hidden">
              {o.image_url && <img src={o.image_url} alt="" className="w-full h-28 object-cover" loading="lazy" />}
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold truncate">{o.title}</h3>
                    {o.description && <p className="text-xs text-p-text-2 mt-0.5">{o.description}</p>}
                  </div>
                  {label && <span className="shrink-0 text-sm font-bold text-p-accent-deep">{label}</span>}
                </div>
                {o.end_date && <p className="text-[11px] text-p-text-2 mt-2">{t('portal.rewards.ends', 'Ends {{date}}', { date: formatDay(o.end_date, lang) })}</p>}
                <div className="mt-3">
                  {full ? <p className="text-xs text-p-text-2">{t('portal.rewards.fully_claimed', 'Fully claimed')}</p>
                    : <Button full loading={claim.isPending} onClick={() => claim.mutate(o.id)}>{t('portal.rewards.claim', 'Claim offer')}</Button>}
                </div>
                {o.terms_conditions && <p className="text-[10px] text-p-text-2 mt-2 leading-relaxed">{o.terms_conditions}</p>}
              </div>
            </Card>
          )
        })}
      </section>
    </div>
  )
}
```

`frontend/src/portal/pages/rewards/CodesTab.tsx`:
```tsx
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Ticket } from 'lucide-react'
import { portalApi } from '../../lib/portalApi'
import { formatDay } from '../../lib/dates'
import { Card } from '../../ui/Card'
import { Chip } from '../../ui/Chip'
import { EmptyState } from '../../ui/EmptyState'
import { PageSkeleton } from '../../ui/Skeleton'

/** The codes a member redeemed — kept, not flashed once in a toast. */
export function CodesTab() {
  const { t, i18n } = useTranslation()
  const { data, isLoading } = useQuery({ queryKey: ['portal-redemptions'], queryFn: portalApi.redemptions })
  if (isLoading) return <PageSkeleton />
  const rows = data?.redemptions ?? []
  if (rows.length === 0) return <EmptyState icon={<Ticket size={18} aria-hidden />} title={t('portal.rewards.codes_empty', 'Codes you redeem will be kept here.')} />

  const tone = (s: string) => (s === 'pending' ? 'accent' : s === 'fulfilled' ? 'success' : 'neutral')
  const label = (s: string) => s === 'pending' ? t('portal.rewards.code_pending', 'Show at the desk') : s === 'fulfilled' ? t('portal.rewards.code_fulfilled', 'Used') : t('portal.rewards.code_cancelled', 'Cancelled')

  return (
    <div className="space-y-3">
      <p className="text-xs text-p-text-2">{t('portal.rewards.codes_hint', 'Each code works once. The venue marks it used when you present it.')}</p>
      {rows.map(r => (
        <Card key={r.id} className={`p-4 flex items-center justify-between gap-3 ${r.status !== 'pending' ? 'opacity-70' : ''}`}>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{r.reward?.name}</p>
            <p className="text-[11px] text-p-text-2">{formatDay(r.created_at, i18n.language)} · {r.points_spent.toLocaleString()} {t('portal.common.points', 'points')}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="font-mono text-sm font-semibold tracking-wider">{r.code}</p>
            <div className="mt-1"><Chip tone={tone(r.status)}>{label(r.status)}</Chip></div>
          </div>
        </Card>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Type-check, test, look**

```bash
cd /c/wamp64/www/Hexa-Tech-portal/frontend && npx tsc -b && npx vitest run src/portal src/i18n 2>&1 | tail -20
```
Expected: pass. Screenshot `/portal/rewards?tab=benefits|catalogue|offers|codes` at 390 and 1440 into `.superpowers/shots/portal-v2/rewards-*.png`; redeem one reward on the local venue and confirm the code appears in the notice and again under My codes.

- [ ] **Step 5: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-portal && git add frontend/src/portal/pages && git commit -q -F - <<'EOF'
Gather benefits, catalogue, offers and codes under Rewards

Three destinations become one hub with four tabs, which frees the bar
for Book and Bookings. A redeemed code stays on screen and is listed
under My codes with its state — the old portal showed it once in a
toast and never again.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 14: Bookings list, detail sheet, and the Activity page

**Files:**
- Create (replace the stubs): `frontend/src/portal/pages/Bookings.tsx`, `frontend/src/portal/pages/BookingRow.tsx`, `frontend/src/portal/pages/BookingSheet.tsx`, `frontend/src/portal/pages/Activity.tsx`, `frontend/src/portal/pages/Bookings.test.tsx`

**Interfaces:**
- Consumes: `portalApi.bookings/booking/pointsHistory`, `useVocab`, `Tabs`, `Sheet`, `Card`, `Chip`, `Money`, `DateTime`, `EmptyState`, `usePortal` (policies, venue contact).
- Produces: `BookingRow({ booking, onOpen })`, `BookingSheet({ kind, id, onClose })`; `statusTone(status): ChipTone`.

- [ ] **Step 1: Write the failing render test**

`frontend/src/portal/pages/Bookings.test.tsx`:
```tsx
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { PortalContext, type PortalContextValue } from '../PortalProvider'
import { BookingRow, statusTone } from './BookingRow'
import type { PortalBooking, PortalBootstrap } from '../lib/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, fallback?: string | Record<string, unknown>, opts?: Record<string, unknown>) => {
      const vars = typeof fallback === 'object' ? fallback : opts
      let text = typeof fallback === 'string' ? fallback : k
      for (const [key, v] of Object.entries(vars ?? {})) text = text.replace(`{{${key}}}`, String(v))
      return text
    },
    i18n: { language: 'en' },
  }),
}))

const data = {
  venue: { timezone: 'Europe/Riga', name: 'Numa', industry: 'beauty', currency: 'EUR', logo_url: null, contact: { email: null, phone: null },
    accent: { hex: '#b04a6e', ink: '#ffffff', deep: '#8e3b58', dark_hex: '#e38ab0', dark_ink: '#1a0b12', dark_deep: '#f0b4cd' }, display_face: 'cormorant' },
  capabilities: { loyalty: true, services: true, stays: false, chat: true, payments: { services: false, stays: false, publishable_key: null } },
  policies: { services_cancel_hours: 24, booking_cancel_hours: 48, services_cancellation_policy: '' },
  member: null, counts: { unread_notifications: 0, upcoming_bookings: 1 },
} as PortalBootstrap

const service: PortalBooking = {
  kind: 'service', id: 7, reference: 'SVC-ABC12345', title: 'Facial', subtitle: 'Mara', starts_at: '2026-10-03T07:30:00Z', ends_at: '2026-10-03T08:15:00Z',
  status: 'confirmed', payment_status: 'unpaid', total: 60, currency: 'EUR', discount: null, can_cancel: false, cancel_deadline: null,
  notes: null, party_size: 1, guests: null, nights: null,
}
const stay: PortalBooking = { ...service, kind: 'stay', id: 9, reference: 'BK-1', title: 'Sea view', subtitle: null, starts_at: '2026-10-10', ends_at: '2026-10-12', total: 240, status: 'cancelled', guests: 2, nights: 2 }

function render(b: PortalBooking) {
  const value: PortalContextValue = { data, isLoading: false, isError: false, error: null, refetch: () => {} }
  return renderToStaticMarkup(<MemoryRouter><PortalContext.Provider value={value}><BookingRow booking={b} onOpen={() => {}} /></PortalContext.Provider></MemoryRouter>)
}

describe('BookingRow', () => {
  it('renders an appointment in the venue timezone with its price and status', () => {
    const html = render(service)
    expect(html).toContain('Facial')
    expect(html).toContain('10:30')
    expect(html).toContain('€60.00')
    expect(html).toContain('Confirmed')
  })
  it('renders a stay as calendar dates with nights and guests', () => {
    const html = render(stay)
    expect(html).toContain('10 Oct 2026')
    expect(html).toContain('2 nights · 2 guests')
    expect(html).toContain('Cancelled')
  })
  it('maps statuses to tones', () => {
    expect(statusTone('confirmed')).toBe('success')
    expect(statusTone('pending')).toBe('warning')
    expect(statusTone('cancelled')).toBe('danger')
    expect(statusTone('completed')).toBe('neutral')
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
cd /c/wamp64/www/Hexa-Tech-portal/frontend && npx vitest run src/portal/pages/Bookings 2>&1 | tail -10
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write the row, the sheet, the list, the activity page**

`frontend/src/portal/pages/BookingRow.tsx`:
```tsx
import { useTranslation } from 'react-i18next'
import { CalendarDays, BedDouble } from 'lucide-react'
import type { PortalBooking } from '../lib/types'
import { Card } from '../ui/Card'
import { Chip } from '../ui/Chip'
import { DateTime } from '../ui/DateTime'
import { Money } from '../ui/Money'

export type ChipTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger'

export function statusTone(status: string): ChipTone {
  switch (status) {
    case 'confirmed': case 'in_progress': return 'success'
    case 'pending': return 'warning'
    case 'cancelled': return 'danger'
    default: return 'neutral'
  }
}

export function BookingRow({ booking: b, onOpen }: { booking: PortalBooking; onOpen: () => void }) {
  const { t } = useTranslation()
  const Icon = b.kind === 'stay' ? BedDouble : CalendarDays
  return (
    <button onClick={onOpen} className="block w-full text-left">
      <Card className="p-4 p-lift flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-p-accent/10 text-p-accent-deep flex items-center justify-center shrink-0"><Icon size={18} aria-hidden /></div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate">{b.title}</p>
          <p className="text-xs text-p-text-2 truncate">
            {b.starts_at && <DateTime iso={b.starts_at} mode={b.kind === 'stay' ? 'day' : 'datetime'} />}
            {b.kind === 'stay' && b.nights != null && b.guests != null && ` · ${t('portal.bookings.nights_guests', '{{nights}} nights · {{guests}} guests', { nights: b.nights, guests: b.guests })}`}
            {b.kind === 'service' && b.subtitle && ` · ${b.subtitle}`}
          </p>
        </div>
        <div className="text-right shrink-0">
          <Money amount={b.total} currency={b.currency} className="text-sm font-semibold" />
          <div className="mt-1"><Chip tone={statusTone(b.status)}>{t(`portal.bookings.status.${b.status}`, b.status)}</Chip></div>
        </div>
      </Card>
    </button>
  )
}
```

`frontend/src/portal/pages/BookingSheet.tsx`:
```tsx
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { usePortal } from '../PortalProvider'
import { portalApi } from '../lib/portalApi'
import type { BookingKind } from '../lib/types'
import { Sheet } from '../ui/Sheet'
import { Chip } from '../ui/Chip'
import { DateTime } from '../ui/DateTime'
import { Money } from '../ui/Money'
import { Notice } from '../ui/Notice'
import { Skeleton } from '../ui/Skeleton'
import { statusTone } from './BookingRow'

export function BookingSheet({ kind, id, onClose }: { kind: BookingKind; id: number; onClose: () => void }) {
  const { t } = useTranslation()
  const { data: portal } = usePortal()
  const { data: b, isLoading, isError } = useQuery({ queryKey: ['portal-booking', kind, id], queryFn: () => portalApi.booking(kind, id), retry: false })

  const Row = ({ label, children }: { label: string; children: ReactNode }) => (
    <div className="flex justify-between gap-4 py-2 border-b border-p-border last:border-0">
      <span className="text-p-text-2">{label}</span>
      <span className="text-right text-p-text">{children}</span>
    </div>
  )
  const venue = portal?.venue
  const contact = venue?.contact.phone || venue?.contact.email

  return (
    <Sheet open onClose={onClose} title={b?.title ?? t('portal.bookings.title', 'Bookings')}>
      {isLoading && <div className="space-y-2"><Skeleton className="h-5" /><Skeleton className="h-5" /><Skeleton className="h-5" /></div>}
      {isError && <Notice tone="danger">{t('portal.bookings.not_found', 'We could not find that booking.')}</Notice>}
      {b && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Chip tone={statusTone(b.status)}>{t(`portal.bookings.status.${b.status}`, b.status)}</Chip>
            <span className="font-mono text-xs text-p-text-2">{b.reference}</span>
          </div>
          <div className="text-sm">
            <Row label={t('portal.bookings.when', 'When')}>
              {b.starts_at && <DateTime iso={b.starts_at} mode={b.kind === 'stay' ? 'day' : 'datetime'} />}
              {b.kind === 'stay' && b.ends_at && <> – <DateTime iso={b.ends_at} mode="day" /></>}
            </Row>
            {b.kind === 'service' && b.subtitle && <Row label={t('portal.bookings.with', 'With')}>{b.subtitle}</Row>}
            {b.kind === 'stay' && b.nights != null && b.guests != null && (
              <Row label={t('portal.bookings.guests', 'Guests')}>{t('portal.bookings.nights_guests', '{{nights}} nights · {{guests}} guests', { nights: b.nights, guests: b.guests })}</Row>
            )}
            {b.kind === 'service' && b.party_size != null && b.party_size > 1 && <Row label={t('portal.bookings.guests', 'Guests')}>{t('portal.bookings.party', 'For {{count}} people', { count: b.party_size })}</Row>}
            {b.discount && <Row label={t('portal.bookings.discount', 'Member discount')}>−<Money amount={b.discount.amount} currency={b.currency} /> · {b.discount.label}</Row>}
            <Row label={t('portal.bookings.total', 'Total')}><Money amount={b.total} currency={b.currency} className="font-semibold" /></Row>
            {b.payment_status && <Row label={t('portal.bookings.payment', 'Payment')}>{t(`portal.bookings.payment_status.${b.payment_status}`, b.payment_status)}</Row>}
            {b.notes && <Row label={t('portal.bookings.notes', 'Your notes')}>{b.notes}</Row>}
          </div>
          {b.kind === 'service' && portal?.policies.services_cancellation_policy && (
            <div>
              <p className="text-xs font-semibold text-p-text-2 mb-1">{t('portal.bookings.policy', 'Cancellation policy')}</p>
              <p className="text-xs text-p-text-2 whitespace-pre-line">{portal.policies.services_cancellation_policy}</p>
            </div>
          )}
          {b.status !== 'cancelled' && b.status !== 'completed' && venue && (
            <Notice tone="info">
              {t('portal.bookings.contact_to_change', 'To change or cancel, contact {{venue}}.', { venue: venue.name })}
              {contact && <> <a className="text-p-accent-deep underline" href={venue.contact.phone ? `tel:${venue.contact.phone}` : `mailto:${venue.contact.email}`}>{contact}</a></>}
            </Notice>
          )}
        </div>
      )}
    </Sheet>
  )
}
```

`frontend/src/portal/pages/Bookings.tsx`:
```tsx
import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CalendarDays } from 'lucide-react'
import { portalApi } from '../lib/portalApi'
import { useVocab } from '../lib/vocab'
import type { BookingKind } from '../lib/types'
import { Tabs } from '../ui/Tabs'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import { Notice } from '../ui/Notice'
import { PageSkeleton } from '../ui/Skeleton'
import { BookingRow } from './BookingRow'
import { BookingSheet } from './BookingSheet'

/**
 * Upcoming and past, across appointments and stays. The detail is a sheet
 * addressed by URL (/portal/bookings/:kind/:id) so Home's "next booking"
 * card and a confirmation email can both land on it.
 */
export function Bookings() {
  const { t } = useTranslation()
  const vocab = useVocab()
  const navigate = useNavigate()
  const { kind, id } = useParams<{ kind: BookingKind; id: string }>()
  const [params, setParams] = useSearchParams()
  const scope = params.get('scope') === 'past' ? 'past' : 'upcoming'
  const [page, setPage] = useState(1)

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['portal-bookings', scope, page],
    queryFn: () => portalApi.bookings(scope, page),
    placeholderData: keepPreviousData,
  })

  const rows = data?.data ?? []
  const lastPage = data ? Math.max(1, Math.ceil(data.meta.total / data.meta.per_page)) : 1

  return (
    <div className="space-y-4">
      <h1 className="font-p-display text-2xl">{t('portal.bookings.title', 'Bookings')}</h1>
      <Tabs
        value={scope}
        onChange={key => { setPage(1); setParams({ scope: key }, { replace: true }) }}
        items={[{ key: 'upcoming', label: t('portal.bookings.upcoming', 'Upcoming') }, { key: 'past', label: t('portal.bookings.past', 'Past') }]}
      />

      {isLoading && <PageSkeleton />}
      {isError && <div className="space-y-3"><Notice tone="danger">{t('portal.common.error', 'Something went wrong. Please try again.')}</Notice><Button variant="secondary" onClick={() => { void refetch() }}>{t('portal.common.retry', 'Try again')}</Button></div>}

      {data && rows.length === 0 && (
        <EmptyState
          icon={<CalendarDays size={18} aria-hidden />}
          title={scope === 'upcoming'
            ? t('portal.bookings.empty_upcoming', 'No upcoming {{noun}}.', { noun: vocab('booking_plural') })
            : t('portal.bookings.empty_past', 'No past {{noun}} yet.', { noun: vocab('booking_plural') })}
        />
      )}

      <div className="space-y-3">
        {rows.map(b => <BookingRow key={`${b.kind}-${b.id}`} booking={b} onOpen={() => navigate(`/portal/bookings/${b.kind}/${b.id}?scope=${scope}`)} />)}
      </div>

      {lastPage > 1 && (
        <div className="flex items-center justify-between">
          <Button variant="secondary" size="sm" disabled={page <= 1 || isFetching} onClick={() => setPage(p => p - 1)}>{t('portal.common.previous', 'Previous')}</Button>
          <span className="text-xs text-p-text-2 tabular-nums">{t('portal.common.page_of', 'Page {{page}} of {{total}}', { page, total: lastPage })}</span>
          <Button variant="secondary" size="sm" disabled={page >= lastPage || isFetching} onClick={() => setPage(p => p + 1)}>{t('portal.common.next', 'Next')}</Button>
        </div>
      )}

      {kind && id && (kind === 'service' || kind === 'stay') && (
        <BookingSheet kind={kind} id={Number(id)} onClose={() => navigate(`/portal/bookings?scope=${scope}`, { replace: true })} />
      )}
    </div>
  )
}
```

`frontend/src/portal/pages/Activity.tsx` (ports `PortalActivity.tsx`):
```tsx
import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { portalApi } from '../lib/portalApi'
import { formatDay } from '../lib/dates'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import { Notice } from '../ui/Notice'
import { PageSkeleton } from '../ui/Skeleton'

export function Activity() {
  const { t, i18n } = useTranslation()
  const [page, setPage] = useState(1)
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['portal-activity', page], queryFn: () => portalApi.pointsHistory(page), placeholderData: keepPreviousData,
  })
  const typeLabel = (type: string) => t(`portal.activity.type.${type}`, type)

  if (isLoading) return <PageSkeleton />
  if (isError) return <div className="space-y-3"><Notice tone="danger">{t('portal.common.error', 'Something went wrong. Please try again.')}</Notice><Button variant="secondary" onClick={() => { void refetch() }}>{t('portal.common.retry', 'Try again')}</Button></div>

  const rows = data?.data ?? []
  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="font-p-display text-2xl">{t('portal.activity.title', 'Activity')}</h1>
        {!!data?.total && <span className="text-xs text-p-text-2 tabular-nums">{t('portal.activity.entries', '{{count}} entries', { count: data.total.toLocaleString() })}</span>}
      </div>
      {rows.length === 0 ? <EmptyState title={t('portal.activity.empty', 'No points activity yet. Your first visit will show up here.')} /> : (
        <Card className="overflow-hidden divide-y divide-p-border">
          {rows.map(a => (
            <div key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className={`text-sm truncate ${a.is_reversed ? 'line-through text-p-text-2' : ''}`}>{a.description || typeLabel(a.type)}</p>
                <p className="text-[11px] text-p-text-2">{typeLabel(a.type)} · {formatDay(a.created_at, i18n.language)}{a.is_reversed && ` · ${t('portal.activity.reversed', 'reversed')}`}</p>
              </div>
              <div className="shrink-0 text-right">
                <span className={`text-sm font-semibold tabular-nums ${a.points >= 0 ? 'text-p-success' : 'text-p-text-2'}`}>{a.points >= 0 ? '+' : ''}{a.points.toLocaleString()}</span>
                {a.balance_after != null && <p className="text-[10px] text-p-text-2 tabular-nums">{t('portal.activity.balance', 'balance {{count}}', { count: a.balance_after.toLocaleString() })}</p>}
              </div>
            </div>
          ))}
        </Card>
      )}
      {(data?.last_page ?? 1) > 1 && (
        <div className="flex items-center justify-between">
          <Button variant="secondary" size="sm" disabled={page <= 1 || isFetching} onClick={() => setPage(p => Math.max(1, p - 1))}>{t('portal.common.previous', 'Previous')}</Button>
          <span className="text-xs text-p-text-2 tabular-nums">{t('portal.common.page_of', 'Page {{page}} of {{total}}', { page: data?.current_page, total: data?.last_page })}</span>
          <Button variant="secondary" size="sm" disabled={page >= (data?.last_page ?? 1) || isFetching} onClick={() => setPage(p => p + 1)}>{t('portal.common.next', 'Next')}</Button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Type-check, test, look**

```bash
cd /c/wamp64/www/Hexa-Tech-portal/frontend && npx tsc -b && npx vitest run src/portal src/i18n 2>&1 | tail -20
```
Expected: pass. Seed the local member a service booking (admin → Service bookings → new, with the member's email) and a past one; screenshot `/portal/bookings`, `/portal/bookings?scope=past`, the sheet, and `/portal/activity` at 390 and 1440 into `.superpowers/shots/portal-v2/bookings-*.png`.

- [ ] **Step 5: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-portal && git add frontend/src/portal/pages && git commit -q -F - <<'EOF'
Show a member their bookings and their ledger

Upcoming and past across appointments and stays, a detail sheet the
home card and emails can deep-link to, the venue's contact for changes
until self-service cancellation lands, and the full points history.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 15: Profile — details, language, preferences, password, referral, deletion

**Files:**
- Create (replace the stub): `frontend/src/portal/pages/Profile.tsx`, `frontend/src/portal/pages/profile/PasswordSheet.tsx`, `frontend/src/portal/pages/profile/DeleteAccountSheet.tsx`, `frontend/src/portal/pages/profile/ReferralCard.tsx`, `frontend/src/portal/pages/profile/LanguageSelect.tsx`

**Interfaces:**
- Consumes: `portalApi.updateProfile/changePassword/referral/deleteAccount`, `SUPPORTED_LANGUAGES` from `../../i18n`, `logoutAndRedirect`, `Field/INPUT_CLASS`, `Toggle`, `Sheet`, `Button`, `Card`, `Notice`.
- `MemberController::deleteAccount()` validates `password` (`required|string`) and `confirmation` (`required|string|in:DELETE`), verified on main; `DeleteAccountSheet` below sends exactly those two fields.

- [ ] **Step 1: Write the page**

`frontend/src/portal/pages/profile/LanguageSelect.tsx`:
```tsx
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { SUPPORTED_LANGUAGES, type LangCode } from '../../../i18n'
import { portalApi } from '../../lib/portalApi'
import { Field, INPUT_CLASS } from '../../ui/Field'

/**
 * Writes `users.language` through the member profile endpoint — never the
 * admin preferences endpoint the staff switcher uses, which answers 403 to
 * a member and fires the subscription wall.
 */
export function LanguageSelect() {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const save = useMutation({
    mutationFn: (language: LangCode) => portalApi.updateProfile({ language }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['portal-bootstrap'] }) },
  })
  const current = SUPPORTED_LANGUAGES.find(l => l.code === i18n.language)?.code ?? SUPPORTED_LANGUAGES.find(l => l.code === i18n.resolvedLanguage)?.code ?? 'en'

  return (
    <Field label={t('portal.profile.language', 'Language')}>
      <select
        value={current}
        onChange={e => { const code = e.target.value as LangCode; void i18n.changeLanguage(code); save.mutate(code) }}
        className={INPUT_CLASS}
      >
        {SUPPORTED_LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
      </select>
    </Field>
  )
}
```

`frontend/src/portal/pages/profile/PasswordSheet.tsx`:
```tsx
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { portalApi, apiMessage } from '../../lib/portalApi'
import { Sheet } from '../../ui/Sheet'
import { Button } from '../../ui/Button'
import { Field, INPUT_CLASS } from '../../ui/Field'
import { Notice } from '../../ui/Notice'

export function PasswordSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const change = useMutation({
    mutationFn: portalApi.changePassword,
    onSuccess: () => { setError(null); setDone(true) },
    onError: e => setError(apiMessage(e, t('portal.profile.password_failed', 'Could not change the password'))),
  })

  return (
    <Sheet open={open} onClose={() => { setDone(false); setError(null); onClose() }} title={t('portal.profile.password_change', 'Change password')}>
      {done ? (
        <Notice tone="success">{t('portal.profile.password_changed', 'Password changed. Other devices have been signed out.')}</Notice>
      ) : (
        <form
          className="space-y-3"
          onSubmit={e => {
            e.preventDefault()
            const fd = new FormData(e.currentTarget)
            const password = String(fd.get('password') ?? '')
            const confirmation = String(fd.get('password_confirmation') ?? '')
            if (password !== confirmation) { setError(t('portal.profile.password_mismatch', "Those two passwords don't match.")); return }
            change.mutate({ current_password: String(fd.get('current_password') ?? ''), password, password_confirmation: confirmation })
          }}
        >
          {error && <Notice tone="danger">{error}</Notice>}
          <Field label={t('portal.profile.password_current', 'Current password')}><input name="current_password" type="password" required autoComplete="current-password" className={INPUT_CLASS} /></Field>
          <Field label={t('portal.profile.password_new', 'New password')} hint={t('portal.profile.password_hint', 'At least 8 characters')}><input name="password" type="password" required minLength={8} autoComplete="new-password" className={INPUT_CLASS} /></Field>
          <Field label={t('portal.profile.password_confirm', 'Confirm new password')}><input name="password_confirmation" type="password" required minLength={8} autoComplete="new-password" className={INPUT_CLASS} /></Field>
          <Button type="submit" full loading={change.isPending}>{t('portal.profile.password_change', 'Change password')}</Button>
        </form>
      )}
    </Sheet>
  )
}
```

`frontend/src/portal/pages/profile/DeleteAccountSheet.tsx`:
```tsx
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { portalApi, apiMessage } from '../../lib/portalApi'
import { logoutAndRedirect } from '../../../lib/logout'
import { Sheet } from '../../ui/Sheet'
import { Button } from '../../ui/Button'
import { Field, INPUT_CLASS } from '../../ui/Field'
import { Notice } from '../../ui/Notice'

export function DeleteAccountSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const [error, setError] = useState<string | null>(null)
  const remove = useMutation({
    mutationFn: portalApi.deleteAccount,
    onSuccess: () => { void logoutAndRedirect('/login') },
    onError: e => setError(apiMessage(e, t('portal.profile.delete_failed', 'Could not delete the account'))),
  })

  return (
    <Sheet open={open} onClose={onClose} title={t('portal.profile.delete_title', 'Delete account')}>
      <form
        className="space-y-3"
        onSubmit={e => {
          e.preventDefault()
          const fd = new FormData(e.currentTarget)
          // MemberController::deleteAccount() validates `password` and `confirmation` (in:DELETE).
          remove.mutate({ password: String(fd.get('password') ?? ''), confirmation: String(fd.get('confirmation') ?? '') })
        }}
      >
        <Notice tone="danger">{t('portal.profile.delete_body', 'This removes your membership and points at this venue. It cannot be undone.')}</Notice>
        {error && <Notice tone="danger">{error}</Notice>}
        <Field label={t('portal.profile.delete_password', 'Your password')}><input name="password" type="password" required autoComplete="current-password" className={INPUT_CLASS} /></Field>
        <Field label={t('portal.profile.delete_confirm_label', 'Type DELETE to confirm')}><input name="confirmation" required pattern="DELETE" autoComplete="off" className={INPUT_CLASS} /></Field>
        <Button type="submit" variant="danger" full loading={remove.isPending}>{t('portal.profile.delete_button', 'Delete my account')}</Button>
      </form>
    </Sheet>
  )
}
```

`frontend/src/portal/pages/profile/ReferralCard.tsx`:
```tsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Check, Copy, Share2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { portalApi } from '../../lib/portalApi'
import { Card } from '../../ui/Card'
import { Button } from '../../ui/Button'

/** The link, not just the code: a friend who taps it lands on the venue's join page with the code filled in. */
export function ReferralCard() {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const { data } = useQuery({ queryKey: ['portal-referral'], queryFn: portalApi.referral })
  const link = data?.referral_link
  if (!data) return null

  const share = async () => {
    if (!link) return
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try { await navigator.share({ url: link }); return } catch { /* dismissed */ }
    }
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800) }
    catch { toast.error(t('portal.common.error', 'Something went wrong. Please try again.')) }
  }

  return (
    <Card className="p-4">
      <h2 className="text-sm font-semibold mb-1">{t('portal.profile.invite_title', 'Invite a friend')}</h2>
      <p className="text-xs text-p-text-2 mb-3">{t('portal.profile.invite_body', "Share your link — you'll both be rewarded when they join.")}</p>
      {link ? (
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <code className="flex-1 min-w-0 truncate bg-p-surface-2 border border-p-border rounded-p-control px-3 py-2 text-xs">{link}</code>
          <Button variant="secondary" size="sm" onClick={() => { void share() }}>
            {copied ? <Check size={14} className="text-p-success" aria-hidden /> : typeof navigator !== 'undefined' && 'share' in navigator ? <Share2 size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
            {copied ? t('portal.common.copied', 'Copied') : t('portal.profile.invite_share', 'Share my link')}
          </Button>
        </div>
      ) : (
        <p className="text-xs text-p-text-2">{t('portal.profile.invite_unavailable', 'Referral links are not available yet.')}</p>
      )}
      {data.total_referrals > 0 && <p className="text-[11px] text-p-text-2 mt-2">{t('portal.profile.invite_stats', '{{count}} friends joined', { count: data.total_referrals })}</p>}
    </Card>
  )
}
```

`frontend/src/portal/pages/Profile.tsx`:
```tsx
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { usePortal } from '../PortalProvider'
import { portalApi, apiMessage } from '../lib/portalApi'
import { logoutAndRedirect } from '../../lib/logout'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { Field, INPUT_CLASS } from '../ui/Field'
import { Toggle } from '../ui/Toggle'
import { LanguageSelect } from './profile/LanguageSelect'
import { PasswordSheet } from './profile/PasswordSheet'
import { DeleteAccountSheet } from './profile/DeleteAccountSheet'
import { ReferralCard } from './profile/ReferralCard'

export function Profile() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { data } = usePortal()
  const [password, setPassword] = useState(false)
  const [remove, setRemove] = useState(false)

  const save = useMutation({
    mutationFn: portalApi.updateProfile,
    onSuccess: () => { toast.success(t('portal.common.saved', 'Saved')); void qc.invalidateQueries({ queryKey: ['portal-bootstrap'] }) },
    onError: e => toast.error(apiMessage(e, t('portal.profile.save_failed', 'Could not save your changes'))),
  })

  const member = data?.member
  const user = member?.user
  if (!data) return null

  return (
    <div className="space-y-5">
      <h1 className="font-p-display text-2xl">{t('portal.profile.title', 'Profile')}</h1>

      {/* Uncontrolled and re-seeded by key: mirroring server state into
          useState needed an effect that re-fired on every refetch and quietly
          discarded whatever the member was mid-way through typing. */}
      <form
        key={user?.email ?? 'profile'}
        onSubmit={e => {
          e.preventDefault()
          const fd = new FormData(e.currentTarget)
          save.mutate({ name: String(fd.get('name') ?? ''), phone: String(fd.get('phone') ?? ''), date_of_birth: String(fd.get('date_of_birth') ?? '') || null })
        }}
      >
        <Card className="p-4 space-y-3">
          <Field label={t('portal.profile.name', 'Name')}><input name="name" defaultValue={user?.name ?? ''} autoComplete="name" className={INPUT_CLASS} /></Field>
          <Field label={t('portal.profile.email', 'Email')} hint={t('portal.profile.email_hint', 'Contact the venue if you need to change this')}><input value={user?.email ?? ''} disabled className={INPUT_CLASS} /></Field>
          <Field label={t('portal.profile.phone', 'Phone')}><input name="phone" type="tel" defaultValue={user?.phone ?? ''} autoComplete="tel" className={INPUT_CLASS} /></Field>
          <Field label={t('portal.profile.birthday', 'Date of birth')}><input name="date_of_birth" type="date" defaultValue={(user as { date_of_birth?: string | null } | undefined)?.date_of_birth ?? ''} className={INPUT_CLASS} /></Field>
          <LanguageSelect />
          <Button type="submit" loading={save.isPending}>{t('portal.common.save', 'Save changes')}</Button>
        </Card>
      </form>

      {member && (
        <Card className="p-4">
          <h2 className="text-sm font-semibold mb-2">{t('portal.profile.communication', 'Communication')}</h2>
          <Toggle label={t('portal.profile.marketing', 'Offers and news by email')} hint={t('portal.profile.marketing_hint', 'Occasional emails about rewards, offers and events. You can turn this off at any time.')}
            checked={!!member.marketing_consent} disabled={save.isPending} onChange={v => save.mutate({ marketing_consent: v })} />
          <Toggle label={t('portal.profile.push', 'Push notifications')} hint={t('portal.profile.push_hint', 'Points updates and reminders on your phone.')}
            checked={!!member.push_notifications} disabled={save.isPending} onChange={v => save.mutate({ push_notifications: v })} />
          <p className="text-[11px] text-p-text-2 pt-2 leading-relaxed">{t('portal.profile.service_messages', "You'll still receive service messages about your account — password resets, booking confirmations and similar — regardless of these settings.")}</p>
        </Card>
      )}

      {data.capabilities.loyalty && <ReferralCard />}

      <Card className="p-4 flex items-center justify-between gap-3">
        <div><h2 className="text-sm font-semibold">{t('portal.profile.password_title', 'Password')}</h2></div>
        <Button variant="secondary" size="sm" onClick={() => setPassword(true)}>{t('portal.profile.password_change', 'Change password')}</Button>
      </Card>

      <div className="flex items-center justify-between gap-3 pt-2">
        <Button variant="ghost" size="sm" onClick={() => { void logoutAndRedirect('/login') }}>{t('portal.common.sign_out', 'Sign out')}</Button>
        <Button variant="ghost" size="sm" className="text-p-danger" onClick={() => setRemove(true)}>{t('portal.profile.delete_title', 'Delete account')}</Button>
      </div>
      {member && <p className="text-center text-[11px] text-p-text-2">{t('portal.profile.member_number', 'Member number {{number}}', { number: member.member_number })}</p>}

      <PasswordSheet open={password} onClose={() => setPassword(false)} />
      <DeleteAccountSheet open={remove} onClose={() => setRemove(false)} />
    </div>
  )
}
```

The profile endpoint's `updateProfile()` validates `date_of_birth` as `sometimes|nullable|date`; sending `null` for an empty field is accepted. `getMemberSummary()`'s `user` block does not carry `date_of_birth` today — add `'date_of_birth'` to the `->only(...)` list in `LoyaltyService::getMemberSummary()` (line 843) and to `MemberController::profile()`'s `user` block is already there; then drop the cast in the `defaultValue` above and add `date_of_birth?: string | null` to `PortalMember['user']` in `types.ts`.

- [ ] **Step 2: Type-check, test, look**

```bash
cd /c/wamp64/www/Hexa-Tech-portal/frontend && npx tsc -b && npx vitest run src/portal src/i18n 2>&1 | tail -20
```
Expected: pass. In the browser: change the language to Russian and confirm every portal string flips and the choice survives a reload (the bootstrap carries `member.user.language`); change the password and confirm a second browser session is signed out; share the referral link; open the delete sheet and cancel. Screenshot `/portal/profile` at 390 and 1440, light and dark.

- [ ] **Step 3: Backend follow-through and its test**

If Step 1 changed `getMemberSummary()`, run the loyalty suite:
```bash
cd /c/wamp64/www/Hexa-Tech-portal && /c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Loyalty/ && /c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Member/
```
Expected: 0 failed.

- [ ] **Step 4: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-portal && git add frontend/src/portal app/Services/LoyaltyService.php && git commit -q -F - <<'EOF'
Let a member manage their own account from the portal

Details, language (written through the member profile endpoint, not
the admin one), consent toggles, a password change that signs other
devices out, the referral link with native share, and account deletion
behind a typed confirmation.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 16: Join and Claim, painted in the venue's colour before any session

**Files:**
- Create: `frontend/src/portal/pages/Join.tsx`, `frontend/src/portal/pages/Claim.tsx`, `frontend/src/portal/pages/PublicShell.tsx`, `frontend/src/portal/pages/Join.test.tsx`
- Modify: `frontend/src/App.tsx` (the two lazy imports switch to `./portal/pages/Join` / `./portal/pages/Claim`, exports `Join` / `Claim`)

**Interfaces:**
- Consumes: `GET /v1/public/join/{token}` (now with `theme`, Task 2), `POST /v1/auth/register`, `POST /v1/auth/send-code`, `POST /v1/auth/claim`, `applyPortalTheme`, `registerPortalLocales`, `useAuthStore().setAuth`.
- Produces: `PublicShell({ theme?, children })` — the `[data-portal]` scope for pages without a session.

- [ ] **Step 1: Write the failing render test**

`frontend/src/portal/pages/Join.test.tsx`:
```tsx
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Join } from './Join'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, fallback?: string | Record<string, unknown>, opts?: Record<string, unknown>) => {
      const vars = typeof fallback === 'object' ? fallback : opts
      let text = typeof fallback === 'string' ? fallback : k
      for (const [key, v] of Object.entries(vars ?? {})) text = text.replace(`{{${key}}}`, String(v))
      return text
    },
    i18n: { language: 'en' },
  }),
}))
vi.mock('../../stores/authStore', () => ({ useAuthStore: (sel: (s: { setAuth: () => void }) => unknown) => sel({ setAuth: () => {} }) }))
vi.mock('../../lib/api', () => ({ api: { get: () => new Promise(() => {}), post: () => new Promise(() => {}) } }))
vi.mock('../i18n', () => ({ registerPortalLocales: () => {} }))

function render(path: string) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={[path]}><Join /></MemoryRouter></QueryClientProvider>,
  )
}

describe('Join', () => {
  it('refuses a link without a venue code, inside the portal token scope', () => {
    const html = render('/portal/join')
    expect(html).toContain('data-portal=""')
    expect(html).toContain('This link is incomplete')
    expect(html).not.toContain('hotel')
  })
  it('shows a skeleton while the venue context loads', () => {
    expect(render('/portal/join?org=abc')).toContain('aria-busy="true"')
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
cd /c/wamp64/www/Hexa-Tech-portal/frontend && npx vitest run src/portal/pages/Join 2>&1 | tail -8
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write the public shell and both pages**

`frontend/src/portal/pages/PublicShell.tsx`:
```tsx
import { useEffect, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AlertTriangle } from 'lucide-react'
import { registerPortalLocales } from '../i18n'
import { applyPortalTheme, clearPortalTheme, type PortalThemeInput } from '../theme/applyPortalTheme'
import { Card } from '../ui/Card'

registerPortalLocales()

/** The token scope for pages that have no session yet; paints the venue when the join context carries a theme. */
export function PublicShell({ theme, children }: { theme?: PortalThemeInput | null; children: ReactNode }) {
  useEffect(() => {
    if (!theme) return
    const root = document.documentElement
    applyPortalTheme(root, theme)
    return () => clearPortalTheme(root)
  }, [theme])

  return (
    <div data-portal="" className="min-h-screen flex items-center justify-center p-4 font-p-body">
      <Card className="w-full max-w-sm p-6 p-rise">{children}</Card>
    </div>
  )
}

export function Problem({ title, body }: { title: string; body: string }) {
  const { t } = useTranslation()
  return (
    <div className="text-center">
      <div className="w-11 h-11 rounded-full bg-p-warning/10 text-p-warning flex items-center justify-center mx-auto mb-3"><AlertTriangle size={20} aria-hidden /></div>
      <h1 className="font-p-display text-xl mb-1">{title}</h1>
      <p className="text-sm text-p-text-2">{body}</p>
      <Link to="/login" className="inline-block mt-4 text-sm text-p-accent-deep">{t('portal.join.go_sign_in', 'Go to sign in')}</Link>
    </div>
  )
}
```

`frontend/src/portal/pages/Join.tsx`:
```tsx
import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Sparkles } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuthStore } from '../../stores/authStore'
import { apiMessage } from '../lib/portalApi'
import type { PortalThemeInput } from '../theme/applyPortalTheme'
import { Button } from '../ui/Button'
import { Field, INPUT_CLASS } from '../ui/Field'
import { Notice } from '../ui/Notice'
import { PageSkeleton } from '../ui/Skeleton'
import { PublicShell, Problem } from './PublicShell'

interface JoinContext {
  organization: { id: number; name: string }
  accepting_joins: boolean
  starting_tier?: string
  welcome_bonus?: number
  theme?: PortalThemeInput & { logo_url?: string | null }
  error?: string
}

/**
 * Public member sign-up. Registration is tenant-scoped, so the link carries
 * the venue's widget token (`?org=`); without it the page says so rather
 * than guess a venue. `?ref=` pre-fills a friend's referral code.
 */
export function Join() {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const setAuth = useAuthStore(s => s.setAuth)
  const orgToken = params.get('org') ?? ''
  const refCode = params.get('ref') ?? ''
  const [error, setError] = useState<string | null>(null)

  const { data: ctx, isLoading, isError } = useQuery<JoinContext>({
    queryKey: ['join-context', orgToken],
    queryFn: () => api.get(`/v1/public/join/${orgToken}`).then(r => r.data),
    enabled: !!orgToken,
    retry: false,
  })

  const register = useMutation({
    mutationFn: (payload: Record<string, string>) => api.post('/v1/auth/register', { ...payload, org_token: orgToken }).then(r => r.data),
    onSuccess: data => { setAuth(data.token, data.user, data.staff ?? null); navigate('/portal', { replace: true }) },
    onError: e => setError(apiMessage(e, t('portal.join.failed', 'Could not create your account.'))),
  })

  if (!orgToken) {
    return <PublicShell><Problem title={t('portal.join.incomplete_title', 'This link is incomplete')} body={t('portal.join.incomplete_body', "Sign-up links include a code that tells us which programme you're joining. Please use the link the venue gave you.")} /></PublicShell>
  }
  if (isLoading) return <PublicShell><PageSkeleton /></PublicShell>
  if (isError || !ctx?.accepting_joins) {
    return <PublicShell theme={ctx?.theme}><Problem title={t('portal.join.closed_title', "Sign-up isn't available")} body={ctx?.error || t('portal.join.closed_body', 'This sign-up link is not valid, or the programme is not open for new members yet. Please check with the venue.')} /></PublicShell>
  }

  return (
    <PublicShell theme={ctx.theme}>
      <div className="text-center mb-6">
        {ctx.theme?.logo_url
          ? <img src={ctx.theme.logo_url} alt="" className="w-12 h-12 rounded-full object-cover mx-auto mb-3" />
          : <div className="w-11 h-11 rounded-full bg-p-accent/10 text-p-accent-deep flex items-center justify-center mx-auto mb-3"><Sparkles size={20} aria-hidden /></div>}
        <h1 className="font-p-display text-2xl">{t('portal.join.title', 'Join {{venue}}', { venue: ctx.organization.name })}</h1>
        <p className="text-sm text-p-text-2 mt-1">
          {ctx.welcome_bonus ? t('portal.join.with_bonus', 'Start with {{count}} points on us.', { count: ctx.welcome_bonus.toLocaleString() }) : t('portal.join.no_bonus', 'Earn points every time you visit.')}
        </p>
      </div>

      {error && <div className="mb-4"><Notice tone="danger">{error}</Notice></div>}

      <form
        className="space-y-3"
        onSubmit={e => {
          e.preventDefault(); setError(null)
          const fd = new FormData(e.currentTarget)
          const password = String(fd.get('password') ?? '')
          if (password !== String(fd.get('password_confirmation') ?? '')) { setError(t('portal.profile.password_mismatch', "Those two passwords don't match.")); return }
          register.mutate({ name: String(fd.get('name') ?? ''), email: String(fd.get('email') ?? ''), phone: String(fd.get('phone') ?? ''), password, password_confirmation: password, referral_code: String(fd.get('referral_code') ?? '') })
        }}
      >
        <Field label={t('portal.join.name', 'Your name')}><input name="name" required autoComplete="name" className={INPUT_CLASS} /></Field>
        <Field label={t('portal.join.email', 'Email')}><input name="email" type="email" required autoComplete="email" className={INPUT_CLASS} /></Field>
        <Field label={t('portal.join.phone', 'Phone (optional)')}><input name="phone" type="tel" autoComplete="tel" className={INPUT_CLASS} /></Field>
        <Field label={t('portal.join.password', 'Password')} hint={t('portal.profile.password_hint', 'At least 8 characters')}><input name="password" type="password" required minLength={8} autoComplete="new-password" className={INPUT_CLASS} /></Field>
        <Field label={t('portal.join.password_confirm', 'Confirm password')}><input name="password_confirmation" type="password" required minLength={8} autoComplete="new-password" className={INPUT_CLASS} /></Field>
        <Field label={t('portal.join.referral', 'Referral code (optional)')} hint={refCode ? t('portal.join.referral_prefilled', "Your friend's code is filled in — you'll both be rewarded") : t('portal.join.referral_hint', "If a friend gave you a code, you'll both be rewarded")}>
          <input name="referral_code" defaultValue={refCode} autoComplete="off" className={INPUT_CLASS} />
        </Field>
        <Button type="submit" full loading={register.isPending}>{t('portal.join.submit', 'Create my membership')}</Button>
      </form>

      <div className="mt-5 space-y-2 text-center text-xs text-p-text-2">
        <p>{t('portal.join.already', 'Already a member?')} <Link to="/login" className="text-p-accent-deep">{t('portal.join.sign_in', 'Sign in')}</Link></p>
        <p>{t('portal.join.existing', 'Been a customer for a while?')} <Link to="/portal/claim" className="text-p-accent-deep">{t('portal.join.set_up', 'Set up your existing account')}</Link></p>
      </div>
    </PublicShell>
  )
}
```

`frontend/src/portal/pages/Claim.tsx` (ports `PortalClaim.tsx` onto `PublicShell`, `Field`, `Button`, `Notice`; same two steps, same 429 handling; every string through `t('portal.claim.*')`; no theme is available without a token, so it renders in the generic accent):
```tsx
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { KeyRound, MailCheck } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuthStore } from '../../stores/authStore'
import { apiMessage } from '../lib/portalApi'
import { Button } from '../ui/Button'
import { Field, INPUT_CLASS } from '../ui/Field'
import { Notice } from '../ui/Notice'
import { PublicShell } from './PublicShell'

export function Claim() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const setAuth = useAuthStore(s => s.setAuth)
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const sendCode = useMutation({
    mutationFn: (address: string) => api.post('/v1/auth/send-code', { email: address }).then(r => r.data),
    onSuccess: () => { setError(null); setStep('code') },
    onError: e => {
      const status = (e as { response?: { status?: number } })?.response?.status
      if (status === 429) { setError(t('portal.claim.rate_limited', 'A code was just sent. Please wait a minute before asking for another.')); setStep('code'); return }
      setError(apiMessage(e, t('portal.claim.send_failed', 'Could not send a code to that address.')))
    },
  })
  const claim = useMutation({
    mutationFn: (p: { code: string; password: string }) => api.post('/v1/auth/claim', { email, code: p.code, password: p.password, password_confirmation: p.password }).then(r => r.data),
    onSuccess: data => { setAuth(data.token, data.user, data.staff ?? null); navigate('/portal', { replace: true }) },
    onError: e => setError(apiMessage(e, t('portal.claim.claim_failed', 'That code did not work. Check it and try again.'))),
  })

  return (
    <PublicShell>
      <div className="text-center mb-6">
        <div className="w-11 h-11 rounded-full bg-p-accent/10 text-p-accent-deep flex items-center justify-center mx-auto mb-3">{step === 'email' ? <KeyRound size={20} aria-hidden /> : <MailCheck size={20} aria-hidden />}</div>
        <h1 className="font-p-display text-2xl">{t('portal.claim.title', 'Set up your account')}</h1>
        <p className="text-sm text-p-text-2 mt-1">{step === 'email' ? t('portal.claim.intro', 'Already a customer? Choose a password to see your points online.') : t('portal.claim.code_sent', "We've sent a 6-digit code to {{email}}.", { email })}</p>
      </div>
      {error && <div className="mb-4"><Notice tone="danger">{error}</Notice></div>}
      {notice && <div className="mb-4"><Notice tone="info">{notice}</Notice></div>}

      {step === 'email' ? (
        <form className="space-y-3" onSubmit={e => { e.preventDefault(); setError(null); const a = String(new FormData(e.currentTarget).get('email') ?? '').trim(); setEmail(a); sendCode.mutate(a) }}>
          <Field label={t('portal.claim.email', 'Your email')} hint={t('portal.claim.email_hint', 'Use the address the venue has on file for you')}><input name="email" type="email" required autoComplete="email" className={INPUT_CLASS} /></Field>
          <Button type="submit" full loading={sendCode.isPending}>{t('portal.claim.send_code', 'Send me a code')}</Button>
        </form>
      ) : (
        <form className="space-y-3" onSubmit={e => {
          e.preventDefault(); setError(null)
          const fd = new FormData(e.currentTarget)
          const password = String(fd.get('password') ?? '')
          if (password !== String(fd.get('password_confirmation') ?? '')) { setError(t('portal.profile.password_mismatch', "Those two passwords don't match.")); return }
          claim.mutate({ code: String(fd.get('code') ?? '').trim(), password })
        }}>
          <Field label={t('portal.claim.code', '6-digit code')}><input name="code" required inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="123456" className={INPUT_CLASS} /></Field>
          <Field label={t('portal.claim.password', 'Choose a password')} hint={t('portal.profile.password_hint', 'At least 8 characters')}><input name="password" type="password" required minLength={8} autoComplete="new-password" className={INPUT_CLASS} /></Field>
          <Field label={t('portal.claim.password_confirm', 'Confirm password')}><input name="password_confirmation" type="password" required minLength={8} autoComplete="new-password" className={INPUT_CLASS} /></Field>
          <Button type="submit" full loading={claim.isPending}>{t('portal.claim.finish', 'Finish setup')}</Button>
          <Button type="button" variant="ghost" full size="sm" disabled={sendCode.isPending} onClick={() => { setError(null); setNotice(null); sendCode.mutate(email, { onSuccess: () => setNotice(t('portal.claim.resent', 'A new code is on its way.')) }) }}>{t('portal.claim.resend', "Didn't get it? Send another code")}</Button>
          <Button type="button" variant="ghost" full size="sm" onClick={() => { setStep('email'); setError(null); setNotice(null) }}>{t('portal.claim.change_email', 'Use a different email')}</Button>
        </form>
      )}
      <p className="text-xs text-p-text-2 text-center mt-5">{t('portal.claim.already_set_up', 'Already set up?')} <Link to="/login" className="text-p-accent-deep">{t('portal.join.sign_in', 'Sign in')}</Link></p>
    </PublicShell>
  )
}
```

In `frontend/src/App.tsx`, switch the two lazy imports to `./portal/pages/Join` (`m.Join`) and `./portal/pages/Claim` (`m.Claim`).

- [ ] **Step 4: Type-check, test, look**

```bash
cd /c/wamp64/www/Hexa-Tech-portal/frontend && npx tsc -b && npx vitest run src/portal src/i18n 2>&1 | tail -20
```
Expected: pass. Open `/portal/join?org=<token>` for a venue with a colour set and one without: the first paints that colour, the second the industry default. Screenshot both plus `/portal/claim` at 390 and 1440 into `.superpowers/shots/portal-v2/join-*.png`.

- [ ] **Step 5: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-portal && git add frontend/src/portal frontend/src/App.tsx && git commit -q -F - <<'EOF'
Paint the join and claim pages in the venue's colour

The join context now carries the theme, so a sign-up form shows the
venue's accent and logo before anyone has a session; both pages leave
the hotel wording behind and speak all five languages.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 17: Retire the old portal, verify the whole, document it

**Files:**
- Delete: `frontend/src/pages/portal/` (all nine files)
- Create: `docs/member-portal.md`
- Modify: `CLAUDE.md` (one pointer line under "Landing-page code rules" heading's sibling — add a "Member portal code rules" section)

- [ ] **Step 1: Delete the old pages and prove nothing imports them**

```bash
cd /c/wamp64/www/Hexa-Tech-portal && git rm -q -r frontend/src/pages/portal && grep -rn "pages/portal" frontend/src </dev/null || echo "no references"
```
Expected: `no references`.

- [ ] **Step 2: The full frontend battery**

```bash
cd /c/wamp64/www/Hexa-Tech-portal/frontend && npx tsc -b && npx vitest run 2>&1 | tail -15 && grep -c "FILL.woff2" src/portal/theme/portal.css
```
Expected: `tsc` silent; vitest shows only the 3 pre-existing `plannerMeta` failures; the grep prints `0`.

- [ ] **Step 3: The backend batteries, by directory, foreground**

```bash
cd /c/wamp64/www/Hexa-Tech-portal && for d in tests/Feature/Member/ tests/Feature/Loyalty/ tests/Feature/Booking/ tests/Feature/Landing/ tests/Feature/Pwa/ tests/Feature/Mail/ tests/Feature/Admin/ tests/Feature/Auth/ tests/Unit/; do echo "== $d"; /c/wamp64/bin/php/php8.4.20/php.exe artisan test "$d" 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Tests:|FAIL|⨯" ; done
```
Expected: every `Tests:` line shows 0 failed. Read each line yourself.

- [ ] **Step 4: Eyes — the house-style checklist on the real thing**

With the dev server running, take the final set at 390 and 1440, light and dark: `/portal`, `/portal/rewards` (four tabs), `/portal/bookings` (list + sheet), `/portal/activity`, `/portal/profile` (+ password sheet), `/portal/join?org=…`, `/portal/claim`. Then go down spec §4's bar line by line and write the answers into `.superpowers/sdd/2026-08-26-landing-phase-3c-plan-a-design/progress.md` under a "Portal v2 phase 1 — quality bar" heading:

1. Not the dark-neon-Inter default — the paper surfaces and the display face are visible on every page.
2. Two typefaces — the display face on titles and the balance, Inter for the rest.
3. Surface rhythm — the member card is the only dark band on Home; nothing else is.
4. The card is on screen on the phone without scrolling past the header.
5. The bar is fixed on phones and the primary action of each page is reachable with a thumb.
6. Copy is honest — no invented numbers, the wallet notice says "not set up" rather than failing silently.
7. Contrast — sample body text and secondary text on paper and on the card in both modes with the DevTools contrast picker; each ≥ 4.5:1.
8. Motion — only the card rises; with "reduce motion" on nothing moves.
9. One signature element — the card.
10. Images have alt text (decorative ones `alt=""`); no unused assets shipped.

Then Chanel's rule: remove one decorative element the pages do not need (the candidate is the card's blurred halo if the tier colour already reads; decide by looking) and commit that as its own small change.

- [ ] **Step 5: Write the runbook**

`docs/member-portal.md`:
```markdown
# Member portal (web) — how it is built and checked

The member portal is the customer-facing half of the SPA: `/portal/*`, one lazy chunk
(`frontend/src/portal/`), served on the admin hosts for users with `user_type = member`.
Spec: `docs/superpowers/specs/2026-09-23-member-portal-v2-design.md`.

## Backend

- `GET /api/v1/member/portal` (`Member\Portal\PortalController`) is the shell's one startup call:
  venue identity + accent tokens (`App\Services\Portal\PortalTheme`, contrast-checked by
  `App\Support\Accent`), capabilities (`App\Services\Booking\BookingCapability`), policies,
  the member summary, counts.
- `GET /api/v1/member/portal/bookings` and `…/bookings/{service|stay}/{id}`
  (`App\Services\Portal\MemberBookingQuery`): the member's bookings across `service_bookings`
  and `booking_mirror`, owned by `member_id`, a linked guest, or the member's email inside their
  organisation.
- The `member/portal` prefix sits behind `member.only` (403 `member_only` for staff tokens,
  403 `portal_disabled` when the `portal_enabled` setting is false).
- Everything else the portal calls is the mobile app's member API, unchanged.
- Public: `GET /api/v1/public/join/{token}` carries `theme`; `GET /manifest.webmanifest?app=portal`
  is the portal's install manifest.

## Frontend rules (enforced by `frontend/src/portal/tokens.test.ts`)

- Only `p-*` colour classes (`bg-p-surface`, `text-p-text-2`, `bg-p-accent/10`, …) from
  `frontend/src/portal/theme/portal.css`; never `dark-*`, `t-*`, `primary-*`, `text-white`.
- Never call `/v1/admin/*`.
- Every string: `t('portal.<key>', 'English fallback')`, with the key in all five
  `frontend/src/portal/i18n/portal.<lang>.json` files (`localeCompleteness.test.ts` and
  `portalLocales.test.ts` enforce it). Industry nouns come from `useVocab()`.
- Light first, dark by OS preference; the accent arrives from the server and is written by
  `applyPortalTheme()`; display face per industry from the self-hosted landing fonts.

## Running it locally

```
cd /c/wamp64/www/<worktree> && /c/wamp64/bin/php/php8.4.20/php.exe artisan serve --host=127.0.0.1 --port=8010
cd frontend && VITE_API_URL=http://127.0.0.1:8010/api npm run dev
```
Join a venue at `http://localhost:5173/portal/join?org=<organizations.widget_token>`.

## Checks

- Backend: `artisan test tests/Feature/Member/` (portal tests live in `tests/Feature/Member/Portal/`),
  plus `tests/Feature/Booking/BookingCapabilityTest.php`, `tests/Feature/Pwa/`, `tests/Feature/Mail/`.
- Frontend: `cd frontend && npx tsc -b && npx vitest run` (3 `plannerMeta` failures are pre-existing).
- Eyes first: screenshots at 390 and 1440, light and dark, against spec §4's quality bar.
```

In `CLAUDE.md`, after the "Landing-page code rules" section, add:
```markdown
## Member-portal code rules

- `frontend/src/portal/` uses only `p-*` tokens and member endpoints; every string is `t('portal.…')` in all five
  locales; new API lives under `member/portal/*` and the mobile app's member endpoints keep their shapes. Read
  `docs/member-portal.md` before touching it.
```

- [ ] **Step 6: Commit, and record the state in the ledger**

```bash
cd /c/wamp64/www/Hexa-Tech-portal && git add -A frontend/src docs/member-portal.md CLAUDE.md && git status --short | grep -v "^D  frontend/src/pages/portal" ; git commit -q -F - <<'EOF'
Retire the first member portal and document the second

The nine pages under frontend/src/pages/portal are replaced by the
portal chunk; docs/member-portal.md records how it is built, the two
rules its sweep enforces, and how to run and check it.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
git log --oneline origin/main..HEAD
```
Expected: the phase 1 commits, no build outputs (`frontend/dist`, `public/spa`, `resources/spa-shell`) among them.

Append to `.superpowers/sdd/2026-08-26-landing-phase-3c-plan-a-design/progress.md`: the phase 1 tip hash, the battery results (each `Tests:` line), the screenshot folder, and the quality-bar answers. Then request the whole-branch review (the execution method the owner chose says which kind) before the deploy round.

---

## Self-review (done while writing; kept so a reader sees what was checked)

- **Spec coverage, §5.1 pages:** Home (Task 12), Rewards with the four tabs incl. My codes (13), Bookings list + sheet (14), Profile with language/toggles/password/referral/deletion (15), Join + Claim rethemed with the venue theme (16, backed by Task 2), Activity kept as a page off Home's "See all" (14). §5.2 bootstrap (3, count wired in 4). §5.3 query rules (4). §5.4 admin card, email links, join theme (6, 5, 2). §5.5 tests: bootstrap, query, join theme, manifest (3, 4, 2, 7), shell/formatters/sweep/locale sweep (11, 8, 8, 9). §4 tokens, accent, type, layout, motion, quality bar (8, 11, 17). §8 rows that apply to phase 1: portal disabled (3 + 11 shell notice), staff token (3), member without loyalty row (3 via `MemberProvisioner`), not_found (4). §10 phase 1 probe items are the deploy round's, outside this plan.
- **Not in this plan, on purpose:** `applies_to` on benefits (phase 2 column); the "Book" destination (phase 2); `.ics` download (phase 2); cancellation (phase 3); a `portal_enabled` switch in the admin Settings UI (the setting is honoured now; the switch lands with phase 2's settings registry work).
- **Placeholders:** the six `FILL.woff2` in Task 8 are filled in the same step from the real folder listing and Task 17 greps for leftovers; the delete-account field names in Task 15 were verified against the controller while planning.
- **Pre-flight corrections (SDD setup, 2026-09-23):** the portal stylesheet import moved to the first line of `index.css`; bare `en` resolves to `en-GB` in the formatters so day-first dates match the tests; `vocab.ts` and `DateTime.tsx` moved from Tasks 9/10 into Task 11 so every task type-checks on its own; the Home test expects the full `?tab=catalogue` href; the QR wrapper paints white with an inline style rather than `bg-white`, which the sweep forbids; `CatalogueTab` declares its error state before the mutation that sets it; `BookingSheet` imports `ReactNode`.
- **Type consistency:** `PortalContextValue`/`usePortal()` (11) is what `DateTime` (10), `vocab` (9), `Home` (12), `BookingSheet` (14), `Profile` (15) consume; `PortalBooking` keys in `types.ts` (10) match `MemberBookingQuery`'s DTO (4) including `nights`/`guests`; `statusTone` is exported from `BookingRow` (14) and consumed by `BookingSheet`; `INPUT_CLASS` (10) is used by 15 and 16; `apiMessage` (10) by 12–16; `PortalTheme::for()` keys (2) match `PortalThemeInput`/`PortalAccent` (8) and `PortalVenue.accent` (10).
- **Review Focus:** each of the five lines names its test and task; all five are in the tasks above.

