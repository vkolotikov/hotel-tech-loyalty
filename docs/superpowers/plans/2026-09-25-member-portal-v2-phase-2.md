# Member Portal v2 — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A signed-in member books a service from the web portal at their member price, applies one coupon (a claimed offer code or a typed reward code), pays with Stripe when the venue takes online payment or pays at the venue otherwise, and earns points when the booking is completed — with the admin forms that make tier benefits, offers and rewards enforceable.

**Architecture:** The backend grows one pricing layer over the existing engines: `DiscountService::quoteForBooking()` (scope-aware, explicit coupons only) wrapped by `MemberPricing` (quote, persist, consume), a `CouponResolver` for codes, a `ServiceQuoteBuilder` shared by the widget and the portal for list totals, and a `PortalServiceBookingController` that mirrors the widget's config/calendar/availability/quote/payment-intent/confirm sequence under the member's identity. Completion awards points through `BookingPointsService`, called explicitly from the two admin status endpoints. The frontend adds a `Book` flow to `frontend/src/portal/` (four steps, one lazy chunk), a Stripe Payment Element mounted with the portal's tokens, and typed fields on the admin Tiers, Offers and Rewards forms.

**Tech Stack:** Laravel 13 (PHP 8.4), Sanctum, PHPUnit on in-memory sqlite with the repo's minimal-schema traits; React 19, react-router 7, TanStack Query 5, Tailwind 3.4, i18next, Vitest (node environment, render-to-string). New dependencies: `@stripe/stripe-js` and `@stripe/react-stripe-js` (spec §3.1). Nothing else.

**Spec:** `docs/superpowers/specs/2026-09-23-member-portal-v2-design.md` — §3.2–3.3 (architecture, data flow), §6 (phase 2, all of it), §8 (errors), §9 (security), §10 (rollout), §11 (rulings). Read it first; the plan argues from it. Planning notes with exact line references for every existing class this plan touches: `.superpowers/sdd/portal-v2-phase-2-notes/{engine,discount,frontend}-facts.md` (untracked; read them when a task names a file you have not seen).

## Global Constraints

- Work in worktree `C:\wamp64\www\Hexa-Tech-portal`, branch `feature/member-portal-v2-phase-2` (cut from production main `b9355315c`). Never push this branch to `main`; never commit `frontend/dist`, `public/spa` or `resources/spa-shell/index.html` from it. The branch has no upstream; if you ever push it, push with `git push -u origin feature/member-portal-v2-phase-2`.
- PHP is always `/c/wamp64/bin/php/php8.4.20/php.exe`. NEVER run a bare `php artisan test`; every run is scoped to a directory or file, run in the foreground, and you read the `Tests:` summary line yourself (pipe through `sed 's/\x1b\[[0-9;]*m//g' | grep Tests:` if colour hides it).
- Tests run on in-memory sqlite (`phpunit.xml`), so Postgres-only SQL (`pg_advisory_xact_lock`, `ilike`, `->`) must be behind a driver check; Task 2's `AdvisoryLock` is the only place the lock statement may appear in new code.
- Run `/c/wamp64/bin/php/php8.4.20/php.exe artisan view:clear` after every Blade change before testing.
- Frontend commands run in `C:\wamp64\www\Hexa-Tech-portal\frontend`; `node_modules` there is a junction to the main checkout's `node_modules` (never delete it; `cmd /c rmdir` it before the worktree is ever removed). Checks: `npx tsc -b && npx vitest run` (3 `plannerMeta` failures are pre-existing) and `npx eslint src/portal`.
- Every commit message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Use the Edit/Write tools for file changes; Git Bash for POSIX commands.
- Portal code (`frontend/src/portal/**`) uses only `p-*` colour classes and the portal `ui/*` primitives; never `/v1/admin/*` (`tokens.test.ts` enforces both). Every portal string is `t('portal.<key>', 'English fallback')` with the key in all five `portal.<lang>.json` files (`portalLocales.test.ts` and `localeCompleteness.test.ts` enforce it); write real translations, never English placeholders.
- New API only under `member/portal/*`; every existing member endpoint keeps its shape except the one the spec removes (`POST member/service-bookings`, ruling portal-8). Error bodies from new endpoints are `{error: <snake_code>, message: <English sentence>}`.
- The server recomputes every amount at quote, payment-intent and confirm and never trusts a client total (spec §3.3). PaymentIntent metadata carries `org_id` and `member_id`; both are checked at confirm (§9).
- Migrations are additive, guarded with `hasColumn`/`hasTable`, and reversible (§6.8).
- Body text contrast ≥ 4.5:1 in light and dark; the four booking steps are verified by eye at 390 and 1440 before tests are trusted (Task 21).

## Review Focus

Inputs the spec implies but no task's tests exercised at first draft; each now has a test in the task named.

1. A member whose tier benefit is **"10% off, services"** books with a **fixed-amount offer coupon worth less** than the tier discount: the quote must apply the benefit, mark the coupon `outbid`, and confirm must leave the claim unused — Task 3 `test_an_outbid_coupon_is_reported_and_not_applied`, Task 9 `test_an_outbid_coupon_is_not_consumed_at_confirm`.
2. A **replayed confirm** with the same `Idempotency-Key` after the first succeeded must return the same booking and consume nothing twice; a replay with a **different body** under the same key must be refused — Task 9 `test_replay_returns_the_same_booking_and_consumes_once` and `test_a_replayed_key_with_a_different_body_is_refused`.
3. A PaymentIntent created for **another organisation** or **another member**, or for a **different amount** than the recomputed total, must be refused with 409 `payment_mismatch` and cancelled — Task 9 `test_a_payment_intent_for_another_org_member_or_amount_is_refused`.
4. A venue whose **services currency differs from its Stripe currency** must quote `payment.mode = 'at_venue'` even with Stripe enabled, and `payment-intent` must answer 409 `pay_at_venue` — Task 8 `test_a_currency_mismatch_quotes_pay_at_venue`.
5. A completed booking must award points **once** even when the admin marks it complete through **bulk** and then again through the single endpoint, and never when the member's venue has **loyalty off** — Task 11 `test_bulk_and_single_completion_award_once` and `test_no_points_without_loyalty`.

## Rulings made while planning (spec silent; the owner may overturn any)

- **plan2-1** Tests must exercise a full confirm, so the advisory lock is taken through `App\Support\AdvisoryLock::transaction()` which issues `pg_advisory_xact_lock` on Postgres and a plain transaction elsewhere. The widget's confirm is left on its inline statement this phase (no test covers it; migrating it is a phase 3 clean-up).
- **plan2-2** Points on completion are awarded by explicit calls from both admin status endpoints (`updateStatus` and `bulk`), not by a model observer, because `bulk` writes through the query builder and fires no events. `BookingPointsService` is idempotent so a double call is harmless.
- **plan2-3** The payment mode is the venue's, not the member's: when `capabilities.payments.services` is true the member pays online and confirm requires a PaymentIntent; otherwise pay at venue. A "pay at venue even though we take cards" choice needs a venue setting and is deferred (with the §8 "Stripe unavailable → offer pay at venue" fallback) to phase 3; in this phase a 503 at payment-intent asks the member to retry.
- **plan2-4** The admin offer type list keeps its existing values and gains `fixed_amount`; the engine already reads `discount` as percent and `fixed_amount` as fixed. `cashback`, `free_night`, `upgrade` stay non-money types the engine ignores.
- **plan2-5** `LoyaltyService::pointsForSpend()` is the one formula (`points_per_currency` base × tier `earn_rate` × event multiplier × tier points multiplier, null-safe on a missing tier); `calculateEarnedPoints()` delegates to it so its signature survives.
- **plan2-6** The portal catalogue and the widget's `config()` share `ServiceCatalogue::build()`; the widget's `quote()` and `computeTotal()` share `ServiceQuoteBuilder` with the portal, pinned by a parity test on the public quote endpoint (which sqlite can run: no lock).
- **plan2-7** Extras are offered on the Review step as a checklist (quantity 1 each, per-person extras multiplied by party size), because the widget offers them and the quote already prices them. Party size is a stepper 1–10 shown only when the service allows more than one (the catalogue has no flag, so it is always shown, default 1).
- **plan2-8** `services_max_advance_days` is enforced server-side for the portal (`calendar` clips its range, `availability` answers 422 `too_far_ahead`); the widget is unchanged.

## File map

Backend (create unless marked modify):

| File | Responsibility |
|---|---|
| `database/migrations/2026_09_25_100000_member_portal_phase_2.php` | every §6.8 column, guarded and reversible |
| `app/Models/{SpecialOffer,MemberOffer,Reward,TierBenefit,ServiceBooking}.php` (modify) | fillables/casts for the new columns; `SpecialOffer::scopeActive` inclusive end date |
| `app/Http/Controllers/Api/V1/Admin/SettingsController.php` (modify, registry at `:405-518`) | seeds the five §6.8 settings rows |
| `app/Support/AdvisoryLock.php` | driver-aware transactional advisory lock |
| `app/Services/Booking/ServiceQuoteBuilder.php` | list totals for a service booking (slot, master override, extras, lead time) |
| `app/Services/Booking/ServiceCatalogue.php` | categories/services/masters/extras/rules for an organisation |
| `app/Services/Booking/BookingScope.php`, `CouponSelection.php`, `CouponException.php`, `PricingResult.php` | value objects |
| `app/Services/Booking/CouponResolver.php` | code → coupon; selection → validated candidate; consume |
| `app/Services/DiscountService.php` (modify) | `quoteForBooking()` |
| `app/Services/Booking/MemberPricing.php` | quote/columns/consume over the engine |
| `app/Services/GuestMemberLinkService.php` (modify) | `ensureGuestForMember()` |
| `app/Http/Controllers/Api/V1/Member/Portal/PortalCouponController.php` | `POST member/portal/coupons/resolve` |
| `app/Http/Controllers/Api/V1/Member/Portal/PortalServiceBookingController.php` | services, calendar, availability, quote, payment-intent, confirm |
| `app/Services/Portal/MemberBookingQuery.php` (modify `:145-164`) | `discount` from the new columns |
| `app/Http/Controllers/Api/V1/ServicePublicController.php` (modify) | `config()` → `ServiceCatalogue`; `quote()`/`computeTotal()` → `ServiceQuoteBuilder`; policy key fix at `:687-690` |
| `app/Mail/ServiceBookingConfirmationMail.php` + `resources/views/emails/service-booking-confirmation.blade.php` (modify) | optional discount line |
| `app/Services/Loyalty/BookingPointsService.php`, `app/Services/LoyaltyService.php` (modify `:385-411`) | points on completion |
| `app/Http/Controllers/Api/V1/Admin/ServiceBookingController.php` (modify `:206-245`, `:432-470`) | award points after completion; expose member + discount in list/detail |
| `app/Http/Controllers/Api/V1/Admin/{BenefitAdminController,OffersAdminController,RewardAdminController,DiscountController}.php` (modify) | typed fields, code, applies_to, tenant-scoped `useOffer` |
| `app/Http/Controllers/Api/V1/Member/OfferController.php` (modify `:52`) | `tier_ids` enforced on claim |
| `app/Console/Commands/TypeBenefits.php`, `app/Services/LoyaltyPresetService.php` (modify) | `loyalty:type-benefits`; presets seed typed benefits |
| `app/Http/Controllers/Api/V1/Member/MemberServiceBookingController.php` (delete), `routes/api.php` (modify) | routes; the removed endpoint |
| `tests/Feature/Booking/{ServiceQuoteBuilderTest,ServiceCatalogueTest,DiscountServiceBookingTest,MemberPricingTest,BookingPointsServiceTest,Phase2MigrationTest}.php`, `tests/Feature/Member/Portal/{PortalCouponTest,PortalServiceCatalogueTest,PortalServiceBookingTest}.php`, `tests/Feature/Admin/{TypedBenefitsTest,OfferCodesTest,TypeBenefitsCommandTest,ServiceBookingPointsTest}.php`, `tests/Feature/Loyalty/OfferSecurityTest.php`, `tests/Concerns/SetsUpServiceBookingSchema.php` | tests and the shared schema trait |

Frontend (create unless marked modify):

| File | Responsibility |
|---|---|
| `frontend/package.json` (modify) | the two Stripe packages |
| `frontend/src/portal/lib/types.ts`, `portalApi.ts` (modify) | catalogue, slot, quote, coupon, confirm types and calls |
| `frontend/src/portal/lib/ics.ts` | `.ics` text for a booking DTO |
| `frontend/src/portal/lib/stripe.ts` | `loadStripe` singleton + appearance from the portal tokens |
| `frontend/src/portal/ui/Stepper.tsx` | numeric stepper (party size) |
| `frontend/src/portal/i18n/portal.{en,ru,de,fr,es}.json` (modify) | the `book` block and admin-facing labels |
| `frontend/src/portal/pages/book/{Book,ServiceStep,StaffStep,WhenStep,ReviewStep,PriceBreakdown,CouponField,PayStep,StripePayment}.tsx` | the flow |
| `frontend/src/portal/pages/book/*.test.tsx` | render tests |
| `frontend/src/portal/{PortalApp,PortalShell,PortalShell.test}.tsx`, `pages/Home.tsx`, `pages/Bookings.tsx`, `pages/BookingSheet.tsx` (modify) | route, nav item, Book prompt, confirmation banner + calendar link |
| `frontend/src/pages/{Tiers,Offers,Rewards,ServiceBookings}.tsx` + `frontend/src/i18n/locales/*/common.json` (modify) | admin forms and badges |
| `docs/member-portal.md`, `CLAUDE.md` (modify) | phase 2 rules |

---

### Task 1: Schema, models and settings registry for phase 2

**Files:**
- Create: `database/migrations/2026_09_25_100000_member_portal_phase_2.php`
- Modify: `app/Models/SpecialOffer.php` (fillable `:19-23`, `scopeActive` `:45-50`), `app/Models/MemberOffer.php` (fillable), `app/Models/Reward.php` (fillable + casts), `app/Models/TierBenefit.php` (fillable), `app/Models/ServiceBooking.php` (fillable `:16-25`, casts), `app/Http/Controllers/Api/V1/Admin/SettingsController.php` (the defaults registry inside `ensureTenantHasDefaultSettings()`, `:405-518`)
- Test: `tests/Feature/Booking/Phase2MigrationTest.php`

**Interfaces:**
- Produces: columns per spec §6.8 — `special_offers.code` (string 24, nullable), `special_offers.applies_to` (string 12, default `all`), `member_offers.used_reference` (string 32, nullable), `rewards.discount_type` (string 20, nullable), `rewards.discount_value` (decimal 10,2 nullable), `rewards.applies_to` (string 12 default `all`), `tier_benefits.applies_to` (string 12 default `all`), `service_bookings.list_amount` (decimal 10,2 nullable), `discount_amount` (decimal 10,2 default 0), `discount_source` (string 20 nullable), `discount_source_id` (unsignedBigInteger nullable), `discount_label` (string 120 nullable), `points_awarded_at` (timestamp nullable); unique index `special_offers_org_code_unique (organization_id, code)`. Settings rows `services_require_staff_confirmation` (`false`), `points_on_bookings` (`true`), `services_cancel_hours` (`24`), `booking_cancel_hours` (`48`), `portal_enabled` (`true`) seeded by the registry.

- [ ] **Step 1: Write the failing test**

```php
<?php
// tests/Feature/Booking/Phase2MigrationTest.php
namespace Tests\Feature\Booking;

use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

class Phase2MigrationTest extends TestCase
{
    use SetsUpMinimalSchema;

    private function migration(): object
    {
        return require base_path('database/migrations/2026_09_25_100000_member_portal_phase_2.php');
    }

    private function baseTables(): void
    {
        $this->setUpMinimalSchema();
        Schema::create('special_offers', function ($t) { $t->id(); $t->unsignedBigInteger('organization_id')->nullable(); $t->string('title'); $t->string('type', 30); $t->decimal('value', 8, 2)->default(0); $t->timestamps(); });
        Schema::create('member_offers', function ($t) { $t->id(); $t->unsignedBigInteger('member_id'); $t->unsignedBigInteger('offer_id'); $t->timestamp('used_at')->nullable(); $t->string('status', 20)->default('available'); $t->timestamps(); });
        Schema::create('rewards', function ($t) { $t->id(); $t->unsignedBigInteger('organization_id'); $t->string('name'); $t->integer('points_cost'); $t->timestamps(); });
        Schema::create('tier_benefits', function ($t) { $t->id(); $t->unsignedBigInteger('tier_id'); $t->unsignedBigInteger('benefit_id'); $t->string('value_type', 24)->default('text'); $t->timestamps(); });
        Schema::create('service_bookings', function ($t) { $t->id(); $t->unsignedBigInteger('organization_id'); $t->decimal('total_amount', 10, 2)->default(0); $t->string('status', 30)->default('pending'); $t->timestamps(); });
    }

    public function test_it_adds_every_phase_2_column_and_is_idempotent(): void
    {
        $this->baseTables();
        $m = $this->migration();
        $m->up();
        $m->up(); // guarded: a second run must not throw

        foreach ([
            'special_offers'  => ['code', 'applies_to'],
            'member_offers'   => ['used_reference'],
            'rewards'         => ['discount_type', 'discount_value', 'applies_to'],
            'tier_benefits'   => ['applies_to'],
            'service_bookings'=> ['list_amount', 'discount_amount', 'discount_source', 'discount_source_id', 'discount_label', 'points_awarded_at'],
        ] as $table => $cols) {
            foreach ($cols as $col) {
                $this->assertTrue(Schema::hasColumn($table, $col), "$table.$col");
            }
        }
    }

    public function test_down_removes_what_up_added_and_nothing_else(): void
    {
        $this->baseTables();
        $m = $this->migration();
        $m->up();
        $m->down();
        $this->assertFalse(Schema::hasColumn('special_offers', 'code'));
        $this->assertFalse(Schema::hasColumn('service_bookings', 'discount_amount'));
        $this->assertTrue(Schema::hasColumn('service_bookings', 'total_amount'));
        $this->assertTrue(Schema::hasColumn('member_offers', 'used_at'));
    }

    public function test_the_settings_registry_seeds_the_phase_2_rows(): void
    {
        $this->baseTables();
        Schema::create('hotel_settings', function ($t) { $t->id(); $t->unsignedBigInteger('organization_id')->nullable(); $t->string('key'); $t->text('value')->nullable(); $t->string('type', 20)->default('string'); $t->string('group', 40)->default('general'); $t->string('label')->nullable(); $t->string('scope', 20)->default('tenant'); $t->timestamps(); });
        $org = \App\Models\Organization::create(['name' => 'Numa', 'slug' => 'numa']);
        app()->instance('current_organization_id', $org->id);

        $controller = new \App\Http\Controllers\Api\V1\Admin\SettingsController();
        (new \ReflectionMethod($controller, 'ensureTenantHasDefaultSettings'))->invoke($controller);

        $rows = \App\Models\HotelSetting::withoutGlobalScopes()->where('organization_id', $org->id)->pluck('value', 'key');
        $this->assertSame('false', $rows['services_require_staff_confirmation']);
        $this->assertSame('true', $rows['points_on_bookings']);
        $this->assertSame('24', $rows['services_cancel_hours']);
        $this->assertSame('48', $rows['booking_cancel_hours']);
        $this->assertSame('true', $rows['portal_enabled']);
    }
}
```

If `ensureTenantHasDefaultSettings()` reads columns the minimal `hotel_settings` table above lacks, add them to the `Schema::create` in the test (read `:405-518` first); do not weaken the assertions.

- [ ] **Step 2: Run it to verify it fails**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Booking/Phase2MigrationTest.php`
Expected: FAIL — the migration file does not exist.

- [ ] **Step 3: Write the migration**

```php
<?php
// database/migrations/2026_09_25_100000_member_portal_phase_2.php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Member portal phase 2: coupons on offers, typed discounts on rewards, a
 * booking scope on every discount source, and the persisted discount on a
 * service booking. Every change is additive and guarded so the migration
 * can run on a database that already carries part of it.
 */
return new class extends Migration
{
    public function up(): void
    {
        $this->addColumns('special_offers', function (Blueprint $t, array $has) {
            if (!$has['code']) $t->string('code', 24)->nullable()->after('value');
            if (!$has['applies_to']) $t->string('applies_to', 12)->default('all')->after('code');
        }, ['code', 'applies_to']);
        if (Schema::hasColumn('special_offers', 'organization_id') && !$this->hasIndex('special_offers', 'special_offers_org_code_unique')) {
            Schema::table('special_offers', fn (Blueprint $t) => $t->unique(['organization_id', 'code'], 'special_offers_org_code_unique'));
        }

        $this->addColumns('member_offers', function (Blueprint $t, array $has) {
            if (!$has['used_reference']) $t->string('used_reference', 32)->nullable()->after('used_at');
        }, ['used_reference']);

        $this->addColumns('rewards', function (Blueprint $t, array $has) {
            if (!$has['discount_type']) $t->string('discount_type', 20)->nullable();
            if (!$has['discount_value']) $t->decimal('discount_value', 10, 2)->nullable();
            if (!$has['applies_to']) $t->string('applies_to', 12)->default('all');
        }, ['discount_type', 'discount_value', 'applies_to']);

        $this->addColumns('tier_benefits', function (Blueprint $t, array $has) {
            if (!$has['applies_to']) $t->string('applies_to', 12)->default('all');
        }, ['applies_to']);

        $this->addColumns('service_bookings', function (Blueprint $t, array $has) {
            if (!$has['list_amount']) $t->decimal('list_amount', 10, 2)->nullable();
            if (!$has['discount_amount']) $t->decimal('discount_amount', 10, 2)->default(0);
            if (!$has['discount_source']) $t->string('discount_source', 20)->nullable();
            if (!$has['discount_source_id']) $t->unsignedBigInteger('discount_source_id')->nullable();
            if (!$has['discount_label']) $t->string('discount_label', 120)->nullable();
            if (!$has['points_awarded_at']) $t->timestamp('points_awarded_at')->nullable();
        }, ['list_amount', 'discount_amount', 'discount_source', 'discount_source_id', 'discount_label', 'points_awarded_at']);
    }

    public function down(): void
    {
        if (Schema::hasTable('special_offers')) {
            if ($this->hasIndex('special_offers', 'special_offers_org_code_unique')) {
                Schema::table('special_offers', fn (Blueprint $t) => $t->dropUnique('special_offers_org_code_unique'));
            }
            $this->dropColumns('special_offers', ['code', 'applies_to']);
        }
        $this->dropColumns('member_offers', ['used_reference']);
        $this->dropColumns('rewards', ['discount_type', 'discount_value', 'applies_to']);
        $this->dropColumns('tier_benefits', ['applies_to']);
        $this->dropColumns('service_bookings', ['list_amount', 'discount_amount', 'discount_source', 'discount_source_id', 'discount_label', 'points_awarded_at']);
    }

    /** @param string[] $cols */
    private function addColumns(string $table, callable $define, array $cols): void
    {
        if (!Schema::hasTable($table)) return;
        $has = [];
        foreach ($cols as $c) $has[$c] = Schema::hasColumn($table, $c);
        if (!in_array(false, $has, true)) return;
        Schema::table($table, fn (Blueprint $t) => $define($t, $has));
    }

    /** @param string[] $cols */
    private function dropColumns(string $table, array $cols): void
    {
        if (!Schema::hasTable($table)) return;
        $present = array_values(array_filter($cols, fn ($c) => Schema::hasColumn($table, $c)));
        if ($present === []) return;
        Schema::table($table, fn (Blueprint $t) => $t->dropColumn($present));
    }

    private function hasIndex(string $table, string $index): bool
    {
        return collect(Schema::getIndexes($table))->contains(fn ($i) => ($i['name'] ?? null) === $index);
    }
};
```

- [ ] **Step 4: Update the models and the registry**

`SpecialOffer` fillable gains `code`, `applies_to`; `scopeActive` becomes end-date inclusive (spec §6.7):

```php
public function scopeActive($query)
{
    return $query->where('is_active', true)
        ->where('start_date', '<=', now()->toDateString())
        ->where('end_date', '>=', now()->toDateString());
}
```

(Compare dates as dates; today's date on the last day of an offer must pass. Keep whatever other conditions the current scope has — read `:45-50` first.)

`MemberOffer` fillable gains `used_reference`. `Reward` fillable gains `discount_type`, `discount_value`, `applies_to`; casts `discount_value` → `decimal:2`. `TierBenefit` fillable gains `applies_to`. `ServiceBooking` fillable gains `list_amount`, `discount_amount`, `discount_source`, `discount_source_id`, `discount_label`, `points_awarded_at`; casts `list_amount`/`discount_amount` → `decimal:2`, `points_awarded_at` → `datetime`.

In `SettingsController::ensureTenantHasDefaultSettings()` add five rows to the registry array in the same shape as its neighbours (`['key' => …, 'value' => …, 'type' => …, 'group' => …, 'label' => …]`):

```php
['key' => 'services_require_staff_confirmation', 'value' => 'false', 'type' => 'boolean', 'group' => 'booking', 'label' => 'Member portal bookings need staff confirmation'],
['key' => 'points_on_bookings',                  'value' => 'true',  'type' => 'boolean', 'group' => 'loyalty', 'label' => 'Award points when a booking is completed'],
['key' => 'services_cancel_hours',               'value' => '24',    'type' => 'integer', 'group' => 'booking', 'label' => 'Free cancellation window for appointments (hours)'],
['key' => 'booking_cancel_hours',                'value' => '48',    'type' => 'integer', 'group' => 'booking', 'label' => 'Free cancellation window for stays (hours)'],
['key' => 'portal_enabled',                      'value' => 'true',  'type' => 'boolean', 'group' => 'loyalty', 'label' => 'Member web portal'],
```

Use the `group` names the registry already uses for booking and loyalty keys (read the neighbours; if the groups are named differently, match them).

- [ ] **Step 5: Run the test to verify it passes**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Booking/Phase2MigrationTest.php`
Expected: `Tests: 3 passed`.

- [ ] **Step 6: Commit**

```bash
git add database/migrations/2026_09_25_100000_member_portal_phase_2.php app/Models/SpecialOffer.php app/Models/MemberOffer.php app/Models/Reward.php app/Models/TierBenefit.php app/Models/ServiceBooking.php app/Http/Controllers/Api/V1/Admin/SettingsController.php tests/Feature/Booking/Phase2MigrationTest.php
git commit -m "Add the phase 2 portal columns, offer codes and the settings the portal reads

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: AdvisoryLock, ServiceQuoteBuilder, ServiceCatalogue — and the widget uses them

**Files:**
- Create: `app/Support/AdvisoryLock.php`, `app/Services/Booking/ServiceQuoteBuilder.php`, `app/Services/Booking/ExtraLeadTimeException.php`, `app/Services/Booking/ServiceCatalogue.php`, `tests/Concerns/SetsUpServiceBookingSchema.php`
- Modify: `app/Http/Controllers/Api/V1/ServicePublicController.php` — `config()` `:28-134` (catalogue part), `quote()` `:182-270`, `computeTotal()` `:844-862`
- Test: `tests/Feature/Booking/ServiceQuoteBuilderTest.php`, `tests/Feature/Booking/ServiceCatalogueTest.php`

**Interfaces:**
- Produces: `App\Support\AdvisoryLock::transaction(string $key, callable $fn): mixed` — runs `$fn` inside `DB::transaction()`, taking `pg_advisory_xact_lock(hashtext($key))` first when `DB::getDriverName() === 'pgsql'`.
- Produces: `App\Services\Booking\ServiceQuoteBuilder::build(Service $service, ?int $masterId, string $startAt, int $partySize = 1, array $extras = []): array` returning `['master' => ServiceMaster, 'start' => CarbonImmutable, 'end' => CarbonImmutable, 'duration_minutes' => int, 'service_price' => float, 'extras' => [['id','name','unit_price','quantity','line_total']], 'extras_total' => float, 'list_total' => float, 'currency' => string]`; throws `RuntimeException` (slot taken, from `reserveSlot()`) and `ExtraLeadTimeException` (message names the extra). `$extras` is `[['id' => int, 'quantity' => int]]`.
- Produces: `App\Services\Booking\ServiceCatalogue::build(int $orgId): array` with keys `categories`, `services`, `masters`, `extras`, `rules` where `rules = ['currency', 'lead_minutes', 'slot_step', 'max_advance_days', 'allow_master_choice', 'cancellation_policy']` — the exact arrays `config()` returns today (`:28-134`), moved.
- Produces: trait `Tests\Concerns\SetsUpServiceBookingSchema` with `setUpServiceBookingSchema(): void` (creates `service_master_schedules`, `service_master_time_off`, `service_extras`, `service_bookings` with every real column incl. Task 1's, `service_booking_extras`, `service_booking_submissions`, `hotel_settings` if missing — each guarded by `hasTable`) and `seedBookableService(int $orgId, array $overrides = []): array{service: Service, master: ServiceMaster}` (a service at 60.00 EUR, 45 min, one active master with a Monday–Sunday 09:00–17:00 schedule, pivot with no overrides). It calls `setUpServiceCatalogSchema()` from `SetsUpMinimalSchema` for the catalogue tables; read `tests/Concerns/SetsUpMinimalSchema.php:1011` and `tests/Concerns/SetsUpLandingSchema.php:98-141` and copy the column shapes from there and from the migration `2026_04_18_100001` (`:131-206`).

- [ ] **Step 1: Write the failing tests**

```php
<?php
// tests/Feature/Booking/ServiceQuoteBuilderTest.php
namespace Tests\Feature\Booking;

use App\Models\ServiceExtra;
use App\Services\Booking\ExtraLeadTimeException;
use App\Services\Booking\ServiceQuoteBuilder;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\Concerns\SetsUpServiceBookingSchema;
use Tests\TestCase;

class ServiceQuoteBuilderTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema, SetsUpServiceBookingSchema;

    private int $orgId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpMinimalSchema();
        $this->setUpServiceBookingSchema();
        $this->orgId = \App\Models\Organization::create(['name' => 'Numa', 'slug' => 'numa'])->id;
        app()->instance('current_organization_id', $this->orgId);
    }

    private function nextMonday(): string
    {
        return now()->next('Monday')->setTime(10, 0)->toIso8601String();
    }

    public function test_it_prices_the_service_with_the_master_override_and_extras(): void
    {
        ['service' => $service, 'master' => $master] = $this->seedBookableService($this->orgId);
        DB::table('service_master_service')->where('service_id', $service->id)->where('service_master_id', $master->id)->update(['price_override' => 70]);
        $extra = ServiceExtra::create(['organization_id' => $this->orgId, 'name' => 'Hot towel', 'price' => 5, 'price_type' => 'per_person', 'is_active' => true]);

        $q = app(ServiceQuoteBuilder::class)->build($service, $master->id, $this->nextMonday(), 2, [['id' => $extra->id, 'quantity' => 1]]);

        $this->assertSame(70.0, $q['service_price']);
        $this->assertSame(10.0, $q['extras'][0]['line_total']);   // per person × party 2
        $this->assertSame(10.0, $q['extras_total']);
        $this->assertSame(80.0, $q['list_total']);
        $this->assertSame('EUR', $q['currency']);
        $this->assertSame(45, $q['duration_minutes']);
        $this->assertSame($master->id, $q['master']->id);
    }

    public function test_an_extra_needing_more_lead_time_than_the_slot_allows_is_refused(): void
    {
        ['service' => $service, 'master' => $master] = $this->seedBookableService($this->orgId);
        $extra = ServiceExtra::create(['organization_id' => $this->orgId, 'name' => 'Cake', 'price' => 20, 'price_type' => 'flat', 'lead_time_hours' => 24 * 30, 'is_active' => true]);

        $this->expectException(ExtraLeadTimeException::class);
        app(ServiceQuoteBuilder::class)->build($service, $master->id, $this->nextMonday(), 1, [['id' => $extra->id, 'quantity' => 1]]);
    }

    public function test_a_taken_slot_throws_the_scheduler_error(): void
    {
        ['service' => $service, 'master' => $master] = $this->seedBookableService($this->orgId);
        $start = now()->next('Monday')->setTime(10, 0);
        DB::table('service_bookings')->insert(['organization_id' => $this->orgId, 'booking_reference' => 'SVC-TAKEN001', 'service_id' => $service->id, 'service_master_id' => $master->id, 'customer_name' => 'X', 'customer_email' => 'x@example.test', 'start_at' => $start, 'end_at' => $start->copy()->addMinutes(45), 'duration_minutes' => 45, 'service_price' => 60, 'extras_total' => 0, 'total_amount' => 60, 'currency' => 'EUR', 'status' => 'confirmed', 'payment_status' => 'unpaid', 'source' => 'widget', 'created_at' => now(), 'updated_at' => now()]);

        $this->expectException(\RuntimeException::class);
        app(ServiceQuoteBuilder::class)->build($service, $master->id, $start->toIso8601String());
    }

    public function test_the_public_quote_endpoint_prices_through_the_builder(): void
    {
        ['service' => $service, 'master' => $master] = $this->seedBookableService($this->orgId);
        \App\Models\Organization::whereKey($this->orgId)->update(['widget_token' => 'wt-quote-test']);
        app()->forgetInstance('current_organization_id');

        $res = $this->postJson('/api/v1/services/quote?org=wt-quote-test', ['service_id' => $service->id, 'service_master_id' => $master->id, 'start_at' => $this->nextMonday(), 'party_size' => 1]);

        $res->assertOk()->assertJsonPath('total_amount', 60)->assertJsonPath('service.id', $service->id)->assertJsonPath('extras_total', 0);
    }
}
```

```php
<?php
// tests/Feature/Booking/ServiceCatalogueTest.php
namespace Tests\Feature\Booking;

use App\Models\HotelSetting;
use App\Services\Booking\ServiceCatalogue;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\Concerns\SetsUpServiceBookingSchema;
use Tests\TestCase;

class ServiceCatalogueTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema, SetsUpServiceBookingSchema;

    public function test_it_lists_services_masters_extras_and_the_org_rules(): void
    {
        $this->setUpMinimalSchema();
        $this->setUpServiceBookingSchema();
        $orgId = \App\Models\Organization::create(['name' => 'Numa', 'slug' => 'numa'])->id;
        app()->instance('current_organization_id', $orgId);
        ['service' => $service, 'master' => $master] = $this->seedBookableService($orgId);
        HotelSetting::withoutGlobalScopes()->create(['organization_id' => $orgId, 'key' => 'services_max_advance_days', 'value' => '30']);
        HotelSetting::flushCacheFor($orgId);

        $c = app(ServiceCatalogue::class)->build($orgId);

        $this->assertSame($service->id, $c['services'][0]['id']);
        $this->assertSame(60.0, $c['services'][0]['price']);
        $this->assertContains($master->id, $c['services'][0]['master_ids']);
        $this->assertSame($master->id, $c['masters'][0]['id']);
        $this->assertSame([], $c['extras']);
        $this->assertSame(30, $c['rules']['max_advance_days']);
        $this->assertSame(60, $c['rules']['lead_minutes']);
        $this->assertSame('EUR', $c['rules']['currency']);
    }

    public function test_the_public_config_endpoint_keeps_its_shape(): void
    {
        $this->setUpMinimalSchema();
        $this->setUpServiceBookingSchema();
        $org = \App\Models\Organization::create(['name' => 'Numa', 'slug' => 'numa', 'widget_token' => 'wt-config-test']);
        $this->seedBookableService($org->id);

        $res = $this->getJson('/api/v1/services/config?org=wt-config-test');

        $res->assertOk();
        foreach (['categories', 'services', 'masters', 'extras', 'currency', 'lead_minutes', 'slot_step', 'max_advance_days', 'allow_master_choice', 'require_deposit', 'deposit_percent', 'cancellation_policy', 'style', 'payment_enabled', 'stripe_publishable_key', 'mock_mode'] as $key) {
            $this->assertArrayHasKey($key, $res->json(), $key);
        }
        $this->assertArrayNotHasKey('rules', $res->json());
    }
}
```

- [ ] **Step 2: Run them to verify they fail**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Booking/ServiceQuoteBuilderTest.php tests/Feature/Booking/ServiceCatalogueTest.php`
Expected: FAIL — trait and classes missing.

- [ ] **Step 3: Write the schema trait**

```php
<?php
// tests/Concerns/SetsUpServiceBookingSchema.php
namespace Tests\Concerns;

use App\Models\Service;
use App\Models\ServiceMaster;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The tables a service booking touches end to end, shaped like the real
 * migrations (2026_04_18_100001 and later), so a test can run the portal's
 * quote and confirm against sqlite. Builds on setUpServiceCatalogSchema().
 */
trait SetsUpServiceBookingSchema
{
    protected function setUpServiceBookingSchema(): void
    {
        $this->setUpServiceCatalogSchema();

        if (!Schema::hasTable('service_master_schedules')) {
            Schema::create('service_master_schedules', function (Blueprint $t) {
                $t->id(); $t->unsignedBigInteger('organization_id')->nullable(); $t->unsignedBigInteger('service_master_id');
                $t->unsignedTinyInteger('weekday'); $t->string('start_time', 8); $t->string('end_time', 8); $t->boolean('is_active')->default(true); $t->timestamps();
            });
        }
        if (!Schema::hasTable('service_master_time_off')) {
            Schema::create('service_master_time_off', function (Blueprint $t) {
                $t->id(); $t->unsignedBigInteger('organization_id')->nullable(); $t->unsignedBigInteger('service_master_id');
                $t->dateTime('start_at'); $t->dateTime('end_at'); $t->string('reason')->nullable(); $t->timestamps();
            });
        }
        if (!Schema::hasTable('service_extras')) {
            Schema::create('service_extras', function (Blueprint $t) {
                $t->id(); $t->unsignedBigInteger('organization_id')->nullable(); $t->unsignedBigInteger('brand_id')->nullable();
                $t->string('name'); $t->text('description')->nullable(); $t->decimal('price', 10, 2)->default(0); $t->string('price_type', 20)->default('flat');
                $t->integer('duration_minutes')->nullable(); $t->integer('lead_time_hours')->nullable(); $t->string('image')->nullable(); $t->string('icon')->nullable();
                $t->string('category')->nullable(); $t->string('currency', 10)->nullable(); $t->boolean('is_active')->default(true); $t->integer('sort_order')->default(0); $t->timestamps();
            });
        }
        if (!Schema::hasTable('service_bookings')) {
            Schema::create('service_bookings', function (Blueprint $t) {
                $t->id(); $t->unsignedBigInteger('organization_id'); $t->unsignedBigInteger('brand_id')->nullable(); $t->string('booking_reference', 20)->unique();
                $t->unsignedBigInteger('service_id'); $t->unsignedBigInteger('service_master_id')->nullable(); $t->unsignedBigInteger('guest_id')->nullable(); $t->unsignedBigInteger('member_id')->nullable();
                $t->string('customer_name', 200); $t->string('customer_email'); $t->string('customer_phone', 40)->nullable(); $t->integer('party_size')->default(1);
                $t->dateTime('start_at'); $t->dateTime('end_at'); $t->integer('duration_minutes'); $t->decimal('service_price', 10, 2)->default(0); $t->decimal('extras_total', 10, 2)->default(0);
                $t->decimal('total_amount', 10, 2)->default(0); $t->string('currency', 10)->default('EUR'); $t->string('status', 30)->default('pending'); $t->string('payment_status', 30)->default('unpaid');
                $t->string('stripe_payment_intent_id')->nullable(); $t->string('source', 30)->default('widget'); $t->text('customer_notes')->nullable(); $t->text('staff_notes')->nullable();
                $t->dateTime('cancelled_at')->nullable(); $t->string('cancellation_reason', 500)->nullable(); $t->json('meta')->nullable();
                $t->decimal('list_amount', 10, 2)->nullable(); $t->decimal('discount_amount', 10, 2)->default(0); $t->string('discount_source', 20)->nullable(); $t->unsignedBigInteger('discount_source_id')->nullable();
                $t->string('discount_label', 120)->nullable(); $t->timestamp('points_awarded_at')->nullable(); $t->timestamps();
            });
        }
        if (!Schema::hasTable('service_booking_extras')) {
            Schema::create('service_booking_extras', function (Blueprint $t) {
                $t->id(); $t->unsignedBigInteger('service_booking_id'); $t->unsignedBigInteger('service_extra_id')->nullable(); $t->string('name'); $t->decimal('unit_price', 10, 2); $t->integer('quantity')->default(1); $t->decimal('line_total', 10, 2); $t->timestamps();
            });
        }
        if (!Schema::hasTable('service_booking_submissions')) {
            Schema::create('service_booking_submissions', function (Blueprint $t) {
                $t->id(); $t->unsignedBigInteger('organization_id')->nullable(); $t->string('idempotency_key', 80)->nullable(); $t->string('source', 30)->nullable(); $t->string('outcome', 20);
                $t->unsignedBigInteger('service_booking_id')->nullable(); $t->string('customer_email')->nullable(); $t->string('customer_name')->nullable(); $t->json('request_payload')->nullable(); $t->json('response_payload')->nullable(); $t->text('error_message')->nullable(); $t->timestamps();
            });
        }
        if (!Schema::hasTable('hotel_settings')) {
            Schema::create('hotel_settings', function (Blueprint $t) {
                $t->id(); $t->unsignedBigInteger('organization_id')->nullable(); $t->string('key'); $t->text('value')->nullable(); $t->string('type', 20)->default('string'); $t->string('group', 40)->default('general'); $t->string('label')->nullable(); $t->string('scope', 20)->default('tenant'); $t->timestamps();
            });
        }
    }

    /** @return array{service: Service, master: ServiceMaster} */
    protected function seedBookableService(int $orgId, array $overrides = []): array
    {
        $service = Service::withoutGlobalScopes()->create(array_merge([
            'organization_id' => $orgId, 'name' => 'Deep Tissue Massage', 'duration_minutes' => 45, 'buffer_after_minutes' => 0, 'price' => 60, 'currency' => 'EUR', 'is_active' => true,
        ], $overrides));
        $master = ServiceMaster::withoutGlobalScopes()->create(['organization_id' => $orgId, 'name' => 'Mara Ilves', 'is_active' => true]);
        DB::table('service_master_service')->insert(['service_id' => $service->id, 'service_master_id' => $master->id, 'price_override' => null, 'duration_override_minutes' => null]);
        foreach (range(0, 6) as $weekday) {
            DB::table('service_master_schedules')->insert(['organization_id' => $orgId, 'service_master_id' => $master->id, 'weekday' => $weekday, 'start_time' => '09:00', 'end_time' => '17:00', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
        }
        return ['service' => $service, 'master' => $master];
    }
}
```

Check the real column names of `service_master_schedules` (`weekday` vs `day_of_week`, time column types) in `tests/Concerns/SetsUpLandingSchema.php:141` and the schedule migration before trusting the shape above; the scheduler's `workingWindowsForDate()` is the consumer. If `service_master_service` in `setUpServiceCatalogSchema()` lacks a column the insert names, add it there.

- [ ] **Step 4: Write AdvisoryLock, the exception, the builder and the catalogue**

```php
<?php
// app/Support/AdvisoryLock.php
namespace App\Support;

use Illuminate\Support\Facades\DB;

/**
 * A transaction that first takes a Postgres advisory lock on a string key,
 * so two confirms for the same master serialise instead of both passing
 * the availability check. On every other driver (the test suite runs on
 * sqlite) it is a plain transaction: sqlite serialises writers itself.
 */
final class AdvisoryLock
{
    public static function transaction(string $key, callable $fn): mixed
    {
        return DB::transaction(function () use ($key, $fn) {
            if (DB::getDriverName() === 'pgsql') {
                DB::statement('SELECT pg_advisory_xact_lock(hashtext(?))', [$key]);
            }
            return $fn();
        });
    }
}
```

```php
<?php
// app/Services/Booking/ExtraLeadTimeException.php
namespace App\Services\Booking;

/** An extra whose lead time cannot be met by the chosen slot (answers 422). */
class ExtraLeadTimeException extends \RuntimeException {}
```

```php
<?php
// app/Services/Booking/ServiceQuoteBuilder.php
namespace App\Services\Booking;

use App\Models\Service;
use App\Models\ServiceExtra;
use App\Services\ServiceSchedulingService;
use Carbon\CarbonImmutable;

/**
 * The list price of a service booking before any member discount: the
 * scheduler's reservation check (master, duration, price override) plus
 * the extras with their per-person maths and lead-time guard. The widget
 * and the portal both price through here so they can never disagree.
 */
final class ServiceQuoteBuilder
{
    public function __construct(private readonly ServiceSchedulingService $scheduler) {}

    /**
     * @param array<int, array{id:int, quantity?:int}> $extras
     * @return array{master:\App\Models\ServiceMaster, start:CarbonImmutable, end:CarbonImmutable, duration_minutes:int, service_price:float, extras:array, extras_total:float, list_total:float, currency:string}
     * @throws \RuntimeException when the slot is taken (scheduler message)
     * @throws ExtraLeadTimeException
     */
    public function build(Service $service, ?int $masterId, string $startAt, int $partySize = 1, array $extras = []): array
    {
        $slot = $this->scheduler->reserveSlot($service, $masterId, $startAt);
        $start = CarbonImmutable::parse($slot['start']);
        $lines = $this->extraLines($extras, $partySize, $start);
        $extrasTotal = round(array_sum(array_column($lines, 'line_total')), 2);
        $servicePrice = round((float) $slot['price'], 2);

        return [
            'master'           => $slot['master'],
            'start'            => $start,
            'end'              => CarbonImmutable::parse($slot['end']),
            'duration_minutes' => (int) $slot['duration_minutes'],
            'service_price'    => $servicePrice,
            'extras'           => $lines,
            'extras_total'     => $extrasTotal,
            'list_total'       => round($servicePrice + $extrasTotal, 2),
            'currency'         => strtoupper($service->currency ?: 'EUR'),
        ];
    }

    /** @return array<int, array{id:int, name:string, unit_price:float, quantity:int, line_total:float}> */
    private function extraLines(array $extras, int $partySize, CarbonImmutable $start): array
    {
        if ($extras === []) return [];
        $ids = array_map(fn ($e) => (int) $e['id'], $extras);
        $rows = ServiceExtra::whereIn('id', $ids)->where('is_active', true)->get()->keyBy('id');
        $lines = [];
        foreach ($extras as $e) {
            $row = $rows->get((int) $e['id']);
            if (!$row) continue;
            if ($row->lead_time_hours && $start->lessThan(now()->addHours((int) $row->lead_time_hours))) {
                throw new ExtraLeadTimeException("{$row->name} needs {$row->lead_time_hours} hours' notice.");
            }
            $qty = max(1, (int) ($e['quantity'] ?? 1));
            $units = $row->price_type === 'per_person' ? $qty * max(1, $partySize) : $qty;
            $lines[] = ['id' => $row->id, 'name' => $row->name, 'unit_price' => round((float) $row->price, 2), 'quantity' => $qty, 'line_total' => round((float) $row->price * $units, 2)];
        }
        return $lines;
    }
}
```

`ServiceCatalogue::build(int $orgId)` is the catalogue half of `ServicePublicController::config()` (`:28-110`), moved verbatim into a class with the org id as input (the queries already run under the bound tenant; keep them, and keep `withoutGlobalScopes()->where('organization_id', $orgId)` if the controller does that). The `rules` array reads the six settings exactly as `config()` does (`HotelSetting::getValue('services_currency', 'EUR')`, `services_lead_minutes` 60, `services_slot_step` 15, `services_max_advance_days` 60, `services_allow_master_choice`, `services_cancellation_policy`), cast to the same types.

- [ ] **Step 5: Make the widget controller delegate**

In `ServicePublicController`:
- `config()`: after `bindOrg()`, `$cat = app(ServiceCatalogue::class)->build($orgId);` then return `array_merge(['categories' => $cat['categories'], 'services' => …, 'masters' => …, 'extras' => …], $cat['rules'], [the deposit keys, 'style' => …, 'payment_enabled' => …, 'stripe_publishable_key' => …, 'mock_mode' => …])` so the response keys are unchanged (Task 2's shape test pins them; `rules` itself is not emitted).
- `quote()`: replace the inline reserve + extras maths with `$q = app(ServiceQuoteBuilder::class)->build($service, $masterId, $startAt, $partySize, $extras)`; catch `ExtraLeadTimeException` → 422 `{error}`, `RuntimeException` → 409 `{error}`; build the same response keys from `$q` (`service_price`, `extras`, `extras_total`, `total_amount = list_total`, `currency`, `master`, `start_at`, `end_at`, `duration_minutes`).
- `computeTotal()` (`:844-862`): body becomes `return app(ServiceQuoteBuilder::class)->build(...)['list_total'];` with the same arguments it derived before (it must now also throw `ExtraLeadTimeException`; the two callers `paymentIntent()` and `confirm()` catch `RuntimeException` already — `ExtraLeadTimeException` extends it, so they answer 409 where they answered 409 before; that is acceptable for the widget this phase).

- [ ] **Step 6: Run the tests to verify they pass**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Booking/ServiceQuoteBuilderTest.php tests/Feature/Booking/ServiceCatalogueTest.php tests/Feature/Widget/ tests/Feature/Booking/BookingCapabilityTest.php`
Expected: all pass (`Tests: 6 passed` for the two new files plus the existing widget and capability suites unchanged).

- [ ] **Step 7: Commit**

```bash
git add app/Support/AdvisoryLock.php app/Services/Booking/ServiceQuoteBuilder.php app/Services/Booking/ExtraLeadTimeException.php app/Services/Booking/ServiceCatalogue.php app/Http/Controllers/Api/V1/ServicePublicController.php tests/Concerns/SetsUpServiceBookingSchema.php tests/Feature/Booking/ServiceQuoteBuilderTest.php tests/Feature/Booking/ServiceCatalogueTest.php
git commit -m "Price service bookings and list the catalogue through one builder the widget and portal share

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: `DiscountService::quoteForBooking()` — scope, explicit coupons, outbid

**Files:**
- Create: `app/Services/Booking/BookingScope.php`, `app/Services/Booking/CouponSelection.php`, `app/Services/Booking/CouponException.php`, `app/Services/Booking/CouponResolver.php`
- Modify: `app/Services/DiscountService.php` (add `quoteForBooking()` after `quote()` `:156`; extract the two discount formulas into a private `discountFor(string $type, float $value, float $amount): float` used by both)
- Test: `tests/Feature/Booking/DiscountServiceBookingTest.php`

**Interfaces:**
- Produces: `enum App\Services\Booking\BookingScope: string { case Services = 'services'; case Stays = 'stays'; public function admits(?string $appliesTo): bool }` — true when `$appliesTo` is null, `'all'`, or equals `$this->value`.
- Produces: `final readonly class App\Services\Booking\CouponSelection { public function __construct(public ?int $memberOfferId = null, public ?int $redemptionId = null) {} public static function fromArray(?array $a): ?self; public function isOffer(): bool; }` — `fromArray` returns null for null/empty; throws `CouponException('coupon_ambiguous')` when both ids are set.
- Produces: `class App\Services\Booking\CouponException extends \RuntimeException { public function __construct(public readonly string $errorCode, string $message) }` with codes `coupon_not_found`, `coupon_not_yours`, `coupon_used`, `coupon_expired`, `coupon_wrong_tier`, `coupon_no_capacity`, `coupon_limit_reached`, `coupon_untyped`, `coupon_ambiguous`.
- Produces: `App\Services\Booking\CouponResolver`:
  - `candidate(LoyaltyMember $member, CouponSelection $sel, BookingScope $scope): array` → `['source' => 'offer'|'reward', 'source_id' => int (member_offer id | redemption id), 'label' => string, 'type' => 'percent_discount'|'fixed_amount', 'value' => float, 'applies' => bool]`; throws `CouponException` when the row is not the member's, is used/fulfilled/cancelled, expired, or (reward) untyped. `applies` is false when the source's `applies_to` excludes the scope (the quote then reports `coupon.status = 'wrong_scope'`).
  - `resolveCode(LoyaltyMember $member, string $code): array` (Task 4 fills it; declare it now returning `[]`).
  - `consume(array $candidate, string $reference): void` — offer: `member_offers` row → `used_at = now(), status = 'used', used_reference = $reference`; reward: redemption → `status = 'fulfilled', fulfilled_at = now(), notes = "Applied to {$reference}"`. Both `lockForUpdate()` and re-check the row is still unused (throw `coupon_used` otherwise).
- Produces: `DiscountService::quoteForBooking(LoyaltyMember $member, float $amount, BookingScope $scope, ?CouponSelection $coupon = null): array` → `['amount', 'discount', 'total', 'applied' => ['source' => 'tier_benefit'|'offer'|'reward', 'source_id' => int, 'label', 'type', 'value', 'discount'] | null, 'coupon' => ['source', 'source_id', 'label', 'status' => 'applied'|'outbid'|'wrong_scope', 'discount' => float] | null, 'currency' => string]` where `currency` is passed in by the caller in a later task — for now `config('app.currency', 'EUR')`, same as `quote()`. Automatic candidates are the member's active tier benefits with `value_type` `percent_discount`/`fixed_amount`, `value_amount > 0` and `$scope->admits($tb->applies_to)`; a `tier_benefit` candidate carries `source_id = $tb->id`. The explicit coupon (when given and `applies`) is the only other candidate. Best single wins; when the coupon exists but is not `applied`, `coupon.status` says why.

- [ ] **Step 1: Write the failing test**

```php
<?php
// tests/Feature/Booking/DiscountServiceBookingTest.php
namespace Tests\Feature\Booking;

use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Models\MemberOffer;
use App\Models\Reward;
use App\Models\RewardRedemption;
use App\Models\SpecialOffer;
use App\Models\TierBenefit;
use App\Services\Booking\BookingScope;
use App\Services\Booking\CouponException;
use App\Services\Booking\CouponSelection;
use App\Services\DiscountService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

class DiscountServiceBookingTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema;

    private int $orgId;
    private LoyaltyMember $member;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpMinimalSchema();
        $this->setUpLoyaltySchema(); // tiers, members, benefit_definitions, tier_benefits, special_offers, member_offers — read SetsUpMinimalSchema:1110 and add rewards/reward_redemptions below if it lacks them
        foreach (['special_offers' => ['code' => 'string', 'applies_to' => 'string'], 'member_offers' => ['used_reference' => 'string'], 'tier_benefits' => ['applies_to' => 'string']] as $table => $cols) {
            foreach ($cols as $col => $type) {
                if (!Schema::hasColumn($table, $col)) Schema::table($table, fn ($t) => $t->{$type}($col)->nullable());
            }
        }
        if (!Schema::hasTable('rewards')) {
            Schema::create('rewards', function ($t) { $t->id(); $t->unsignedBigInteger('organization_id'); $t->string('name'); $t->integer('points_cost'); $t->string('discount_type', 20)->nullable(); $t->decimal('discount_value', 10, 2)->nullable(); $t->string('applies_to', 12)->default('all'); $t->boolean('is_active')->default(true); $t->timestamps(); });
        }
        if (!Schema::hasTable('reward_redemptions')) {
            Schema::create('reward_redemptions', function ($t) { $t->id(); $t->unsignedBigInteger('organization_id'); $t->unsignedBigInteger('member_id'); $t->unsignedBigInteger('reward_id'); $t->integer('points_spent'); $t->string('code', 16); $t->string('status', 16)->default('pending'); $t->text('notes')->nullable(); $t->timestamp('fulfilled_at')->nullable(); $t->timestamp('cancelled_at')->nullable(); $t->timestamps(); });
        }
        $this->orgId = \App\Models\Organization::create(['name' => 'Numa', 'slug' => 'numa'])->id;
        app()->instance('current_organization_id', $this->orgId);
        $tier = LoyaltyTier::create(['organization_id' => $this->orgId, 'name' => 'Gold', 'min_points' => 0, 'earn_rate' => 1.5, 'is_active' => true]);
        $user = \App\Models\User::create(['name' => 'Ada', 'email' => 'ada@example.test', 'password' => bcrypt('secret-pass-1'), 'user_type' => 'member', 'organization_id' => $this->orgId]);
        $this->member = LoyaltyMember::create(['organization_id' => $this->orgId, 'user_id' => $user->id, 'tier_id' => $tier->id, 'member_number' => 'HL-1', 'current_points' => 500]);
    }

    private function benefit(string $type, float $amount, string $appliesTo = 'all'): TierBenefit
    {
        $def = \App\Models\BenefitDefinition::create(['organization_id' => $this->orgId, 'name' => "$amount $type", 'code' => 'b'.uniqid(), 'category' => 'discount', 'is_active' => true]);
        return TierBenefit::create(['organization_id' => $this->orgId, 'tier_id' => $this->member->tier_id, 'benefit_id' => $def->id, 'value_type' => $type, 'value_amount' => $amount, 'applies_to' => $appliesTo, 'is_active' => true]);
    }

    private function claimedOffer(string $type, float $value, string $appliesTo = 'all'): MemberOffer
    {
        $offer = SpecialOffer::create(['organization_id' => $this->orgId, 'title' => "Offer $value", 'description' => '-', 'type' => $type, 'value' => $value, 'start_date' => now()->subDay()->toDateString(), 'end_date' => now()->addDays(7)->toDateString(), 'is_active' => true, 'applies_to' => $appliesTo]);
        return MemberOffer::create(['organization_id' => $this->orgId, 'member_id' => $this->member->id, 'offer_id' => $offer->id, 'status' => 'claimed', 'claimed_at' => now(), 'expires_at' => now()->addDays(7)]);
    }

    private function redemption(?string $type, ?float $value): RewardRedemption
    {
        $reward = Reward::create(['organization_id' => $this->orgId, 'name' => 'Reward', 'points_cost' => 100, 'discount_type' => $type, 'discount_value' => $value, 'is_active' => true]);
        return RewardRedemption::create(['organization_id' => $this->orgId, 'member_id' => $this->member->id, 'reward_id' => $reward->id, 'points_spent' => 100, 'code' => 'REW-TEST0001', 'status' => 'pending']);
    }

    public function test_only_benefits_admitted_by_the_scope_apply_automatically(): void
    {
        $this->benefit('percent_discount', 10, 'stays');
        $this->benefit('percent_discount', 5, 'services');
        $q = app(DiscountService::class)->quoteForBooking($this->member, 100, BookingScope::Services);
        $this->assertSame(5.0, $q['discount']);
        $this->assertSame('tier_benefit', $q['applied']['source']);
        $this->assertNull($q['coupon']);
    }

    public function test_a_claimed_offer_is_not_a_candidate_unless_selected(): void
    {
        $claim = $this->claimedOffer('discount', 20);
        $svc = app(DiscountService::class);
        $this->assertSame(0.0, $svc->quoteForBooking($this->member, 100, BookingScope::Services)['discount']);
        $q = $svc->quoteForBooking($this->member, 100, BookingScope::Services, new CouponSelection(memberOfferId: $claim->id));
        $this->assertSame(20.0, $q['discount']);
        $this->assertSame('offer', $q['applied']['source']);
        $this->assertSame('applied', $q['coupon']['status']);
    }

    public function test_an_outbid_coupon_is_reported_and_not_applied(): void
    {
        $this->benefit('percent_discount', 10, 'all');
        $claim = $this->claimedOffer('fixed_amount', 5);
        $q = app(DiscountService::class)->quoteForBooking($this->member, 100, BookingScope::Services, new CouponSelection(memberOfferId: $claim->id));
        $this->assertSame(10.0, $q['discount']);
        $this->assertSame('tier_benefit', $q['applied']['source']);
        $this->assertSame('outbid', $q['coupon']['status']);
        $this->assertSame(5.0, $q['coupon']['discount']);
    }

    public function test_a_typed_reward_code_is_a_coupon_and_an_untyped_one_is_refused(): void
    {
        $typed = $this->redemption('fixed_amount', 15);
        $q = app(DiscountService::class)->quoteForBooking($this->member, 100, BookingScope::Services, new CouponSelection(redemptionId: $typed->id));
        $this->assertSame(15.0, $q['discount']);
        $this->assertSame('reward', $q['applied']['source']);

        $untyped = $this->redemption(null, null);
        $this->expectException(CouponException::class);
        $this->expectExceptionMessage('coupon_untyped');
        app(DiscountService::class)->quoteForBooking($this->member, 100, BookingScope::Services, new CouponSelection(redemptionId: $untyped->id));
    }

    public function test_the_discount_never_exceeds_the_bill_and_nothing_stacks(): void
    {
        $this->benefit('fixed_amount', 500, 'all');
        $claim = $this->claimedOffer('discount', 50);
        $q = app(DiscountService::class)->quoteForBooking($this->member, 80, BookingScope::Services, new CouponSelection(memberOfferId: $claim->id));
        $this->assertSame(80.0, $q['discount']);
        $this->assertSame(0.0, $q['total']);
    }

    public function test_a_coupon_that_is_not_the_members_or_already_used_is_refused(): void
    {
        $claim = $this->claimedOffer('discount', 20);
        DB::table('member_offers')->where('id', $claim->id)->update(['used_at' => now(), 'status' => 'used']);
        try {
            app(DiscountService::class)->quoteForBooking($this->member, 100, BookingScope::Services, new CouponSelection(memberOfferId: $claim->id));
            $this->fail('used coupon accepted');
        } catch (CouponException $e) {
            $this->assertSame('coupon_used', $e->errorCode);
        }
        $this->expectException(CouponException::class);
        app(DiscountService::class)->quoteForBooking($this->member, 100, BookingScope::Services, new CouponSelection(memberOfferId: 999999));
    }

    public function test_a_coupon_outside_the_scope_is_reported_as_wrong_scope(): void
    {
        $claim = $this->claimedOffer('discount', 20, 'stays');
        $q = app(DiscountService::class)->quoteForBooking($this->member, 100, BookingScope::Services, new CouponSelection(memberOfferId: $claim->id));
        $this->assertSame(0.0, $q['discount']);
        $this->assertSame('wrong_scope', $q['coupon']['status']);
    }
}
```

`CouponException::__construct(string $code, string $message)` must set `$this->message` to a sentence that *starts with* the code (e.g. `"coupon_untyped: This reward has no money value and cannot be used as a coupon."`) so `expectExceptionMessage('coupon_untyped')` matches and the controller can still show the sentence part; expose the code as a public readonly property too.

- [ ] **Step 2: Run it to verify it fails**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Booking/DiscountServiceBookingTest.php`
Expected: FAIL — `BookingScope` not found.

- [ ] **Step 3: Write the value objects and the resolver's candidate/consume**

```php
<?php
// app/Services/Booking/BookingScope.php
namespace App\Services\Booking;

enum BookingScope: string
{
    case Services = 'services';
    case Stays = 'stays';

    /** A discount source with applies_to = all (or unset) admits every scope. */
    public function admits(?string $appliesTo): bool
    {
        return $appliesTo === null || $appliesTo === '' || $appliesTo === 'all' || $appliesTo === $this->value;
    }
}
```

```php
<?php
// app/Services/Booking/CouponSelection.php
namespace App\Services\Booking;

/** Exactly one coupon the member chose: a claimed offer or a pending reward redemption. */
final readonly class CouponSelection
{
    public function __construct(public ?int $memberOfferId = null, public ?int $redemptionId = null)
    {
        if ($memberOfferId !== null && $redemptionId !== null) {
            throw new CouponException('coupon_ambiguous', 'Choose one coupon at a time.');
        }
    }

    public static function fromArray(?array $a): ?self
    {
        if (!$a) return null;
        $offer = isset($a['member_offer_id']) ? (int) $a['member_offer_id'] : null;
        $red = isset($a['redemption_id']) ? (int) $a['redemption_id'] : null;
        if ($offer === null && $red === null) return null;
        return new self($offer, $red);
    }

    public function isOffer(): bool { return $this->memberOfferId !== null; }
}
```

```php
<?php
// app/Services/Booking/CouponException.php
namespace App\Services\Booking;

class CouponException extends \RuntimeException
{
    public function __construct(public readonly string $errorCode, string $message)
    {
        parent::__construct("{$errorCode}: {$message}");
    }

    /** The sentence without the code prefix, for API bodies. */
    public function sentence(): string
    {
        return substr($this->getMessage(), strlen($this->errorCode) + 2);
    }
}
```

```php
<?php
// app/Services/Booking/CouponResolver.php
namespace App\Services\Booking;

use App\Models\LoyaltyMember;
use App\Models\MemberOffer;
use App\Models\RewardRedemption;
use App\Services\DiscountService;

/**
 * Turns the member's coupon choice into a discount candidate the engine can
 * weigh, and consumes it once a booking is confirmed. Every lookup asserts
 * the row belongs to this member inside this organisation.
 */
final class CouponResolver
{
    public function candidate(LoyaltyMember $member, CouponSelection $sel, BookingScope $scope): array
    {
        return $sel->isOffer() ? $this->offerCandidate($member, $sel->memberOfferId, $scope) : $this->rewardCandidate($member, $sel->redemptionId, $scope);
    }

    /** Filled in by the coupon endpoint task; a code becomes a selection summary. */
    public function resolveCode(LoyaltyMember $member, string $code): array
    {
        return [];
    }

    public function consume(array $candidate, string $reference): void
    {
        if ($candidate['source'] === 'offer') {
            $claim = MemberOffer::whereKey($candidate['source_id'])->lockForUpdate()->first();
            if (!$claim || $claim->used_at !== null) throw new CouponException('coupon_used', 'This offer has already been used.');
            $claim->forceFill(['used_at' => now(), 'status' => 'used', 'used_reference' => $reference])->save();
            return;
        }
        $red = RewardRedemption::whereKey($candidate['source_id'])->lockForUpdate()->first();
        if (!$red || $red->status !== RewardRedemption::STATUS_PENDING) throw new CouponException('coupon_used', 'This reward code has already been used.');
        $red->forceFill(['status' => RewardRedemption::STATUS_FULFILLED, 'fulfilled_at' => now(), 'notes' => "Applied to {$reference}"])->save();
    }

    private function offerCandidate(LoyaltyMember $member, int $memberOfferId, BookingScope $scope): array
    {
        $claim = MemberOffer::with('offer')->whereKey($memberOfferId)->first();
        if (!$claim || (int) $claim->member_id !== (int) $member->id || (int) ($claim->organization_id ?? $member->organization_id) !== (int) $member->organization_id) {
            throw new CouponException('coupon_not_found', 'We could not find that offer on your account.');
        }
        if ($claim->used_at !== null || $claim->status === 'used') throw new CouponException('coupon_used', 'This offer has already been used.');
        $offer = $claim->offer;
        if (!$offer || !$offer->is_active) throw new CouponException('coupon_expired', 'This offer is no longer available.');
        if (($claim->expires_at && $claim->expires_at->isPast()) || ($offer->end_date && $offer->end_date->endOfDay()->isPast())) {
            throw new CouponException('coupon_expired', 'This offer has expired.');
        }
        $type = $this->moneyType($offer->type);
        if ($type === null) throw new CouponException('coupon_untyped', 'This offer has no money value and cannot be used as a coupon.');

        return ['source' => 'offer', 'source_id' => $claim->id, 'label' => $offer->title, 'type' => $type, 'value' => (float) $offer->value, 'applies' => $scope->admits($offer->applies_to)];
    }

    private function rewardCandidate(LoyaltyMember $member, int $redemptionId, BookingScope $scope): array
    {
        $red = RewardRedemption::with('reward')->whereKey($redemptionId)->first();
        if (!$red || (int) $red->member_id !== (int) $member->id || (int) $red->organization_id !== (int) $member->organization_id) {
            throw new CouponException('coupon_not_found', 'We could not find that reward code on your account.');
        }
        if ($red->status !== RewardRedemption::STATUS_PENDING) throw new CouponException('coupon_used', 'This reward code has already been used.');
        $reward = $red->reward;
        $type = $reward ? $this->moneyType($reward->discount_type) : null;
        if ($type === null || (float) $reward->discount_value <= 0) throw new CouponException('coupon_untyped', 'This reward has no money value and cannot be used as a coupon.');

        return ['source' => 'reward', 'source_id' => $red->id, 'label' => $reward->name, 'type' => $type, 'value' => (float) $reward->discount_value, 'applies' => $scope->admits($reward->applies_to)];
    }

    /** The engine's loose type match (DiscountService::quote) made explicit. */
    private function moneyType(?string $type): ?string
    {
        $t = strtolower((string) $type);
        if ($t === DiscountService::PERCENT || $t === 'discount' || str_contains($t, 'percent')) return DiscountService::PERCENT;
        if ($t === DiscountService::FIXED || str_contains($t, 'amount') || str_contains($t, 'fixed')) return DiscountService::FIXED;
        return null;
    }
}
```

`MemberOffer` must have an `offer()` BelongsTo and `RewardRedemption` a `reward()` BelongsTo; both exist (`OfferController` and `RewardController` eager-load them) — verify and add if not.

- [ ] **Step 4: Add `quoteForBooking()` to `DiscountService`**

```php
/**
 * The booking flavour of quote(): automatic tier benefits filtered by the
 * booking's scope, and the one coupon the member explicitly chose. Nothing
 * else is a candidate — a claim the member did not pick is never consumed.
 */
public function quoteForBooking(LoyaltyMember $member, float $amount, BookingScope $scope, ?CouponSelection $coupon = null): array
{
    $candidates = [];
    foreach ($this->benefitsFor($member) as $tb) {
        if (!in_array($tb->value_type, [self::PERCENT, self::FIXED], true) || (float) $tb->value_amount <= 0) continue;
        if (!$scope->admits($tb->applies_to ?? 'all')) continue;
        $candidates[] = ['source' => 'tier_benefit', 'source_id' => $tb->id, 'label' => $tb->benefit?->name ?? 'Member discount', 'type' => $tb->value_type, 'value' => (float) $tb->value_amount, 'discount' => $this->discountFor($tb->value_type, (float) $tb->value_amount, $amount)];
    }

    $couponOut = null;
    if ($coupon !== null) {
        $c = app(CouponResolver::class)->candidate($member, $coupon, $scope);
        $c['discount'] = $this->discountFor($c['type'], $c['value'], $amount);
        $couponOut = ['source' => $c['source'], 'source_id' => $c['source_id'], 'label' => $c['label'], 'status' => $c['applies'] ? 'applied' : 'wrong_scope', 'discount' => $c['discount']];
        if ($c['applies']) $candidates[] = $c;
    }

    usort($candidates, fn ($a, $b) => $b['discount'] <=> $a['discount']);
    $best = $candidates[0] ?? null;
    if ($best) unset($best['applies']);
    $discount = $best ? min($best['discount'], $amount) : 0.0;
    if ($couponOut && $couponOut['status'] === 'applied' && ($best === null || $best['source'] === 'tier_benefit')) {
        $couponOut['status'] = 'outbid';
    }

    return [
        'amount'   => round($amount, 2),
        'discount' => round($discount, 2),
        'total'    => round($amount - $discount, 2),
        'applied'  => $best,
        'coupon'   => $couponOut,
        'currency' => config('app.currency', 'EUR'),
    ];
}

private function discountFor(string $type, float $value, float $amount): float
{
    return $type === self::PERCENT
        ? round($amount * min($value, 100) / 100, 2)
        : round(min($value, $amount), 2);
}
```

Refactor the two formula sites inside `quote()` (`:75-156`) to call `discountFor()` so the counter flow and the booking flow share the maths; `quote()`'s behaviour and output must not change (the Loyalty suite pins it).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Booking/DiscountServiceBookingTest.php tests/Feature/Loyalty/`
Expected: `Tests: 7 passed` for the new file; the Loyalty suite unchanged (285 passed on main).

- [ ] **Step 6: Commit**

```bash
git add app/Services/Booking/BookingScope.php app/Services/Booking/CouponSelection.php app/Services/Booking/CouponException.php app/Services/Booking/CouponResolver.php app/Services/DiscountService.php tests/Feature/Booking/DiscountServiceBookingTest.php
git commit -m "Quote bookings with scoped tier benefits and only the coupon the member chose

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 4: Security fixes on the paths the portal calls (spec §6.7)

**Files:**
- Modify: `app/Http/Controllers/Api/V1/Admin/DiscountController.php` (`useOffer` `:74`), `app/Http/Controllers/Api/V1/Member/OfferController.php` (`claim` `:52`), `routes/api.php` (the three discount routes at `:722-724`)
- Test: `tests/Feature/Loyalty/OfferSecurityTest.php`

**Interfaces:**
- Consumes: `SpecialOffer::scopeActive` (inclusive end date, Task 1), `SpecialOffer::scopeForTier`.
- Produces: `useOffer` answers 404 for a claim outside the caller's organisation; `claim` answers 422 `{error: 'wrong_tier', message}` when `tier_ids` is set and excludes the member's tier; the discount routes carry `staff.can:can_redeem_points` (the alias other admin routes use — read `routes/api.php` for the exact middleware spelling near `:722`).

- [ ] **Step 1: Write the failing test**

```php
<?php
// tests/Feature/Loyalty/OfferSecurityTest.php
namespace Tests\Feature\Loyalty;

use App\Models\MemberOffer;
use App\Models\SpecialOffer;
use Illuminate\Support\Facades\Schema;
use Tests\Feature\Member\MemberEndpointTestCase;

class OfferSecurityTest extends MemberEndpointTestCase
{
    private function offersSchema(): void
    {
        $this->setUpLoyaltySchema();
        foreach (['code' => 'string', 'applies_to' => 'string'] as $col => $type) {
            if (!Schema::hasColumn('special_offers', $col)) Schema::table('special_offers', fn ($t) => $t->{$type}($col)->nullable());
        }
    }

    private function offer(int $orgId, array $attrs = []): SpecialOffer
    {
        return SpecialOffer::withoutGlobalScopes()->create(array_merge(['organization_id' => $orgId, 'title' => 'Ten off', 'description' => '-', 'type' => 'discount', 'value' => 10, 'start_date' => now()->subDay()->toDateString(), 'end_date' => now()->addDays(3)->toDateString(), 'is_active' => true], $attrs));
    }

    public function test_a_gold_only_code_cannot_be_claimed_by_a_bronze_member(): void
    {
        $this->offersSchema();
        $org = $this->tenant();
        ['token' => $token, 'member' => $member] = $this->member($org);
        $gold = \App\Models\LoyaltyTier::create(['organization_id' => $org->id, 'name' => 'Gold', 'min_points' => 5000, 'earn_rate' => 2, 'is_active' => true]);
        $offer = $this->offer($org->id, ['tier_ids' => [$gold->id]]);

        $this->withToken($token)->postJson("/api/v1/member/offers/{$offer->id}/claim")->assertStatus(422)->assertJsonPath('error', 'wrong_tier');
        $this->assertSame(0, MemberOffer::where('member_id', $member->id)->count());
    }

    public function test_an_offer_ending_today_can_still_be_claimed(): void
    {
        $this->offersSchema();
        $org = $this->tenant();
        ['token' => $token] = $this->member($org);
        $offer = $this->offer($org->id, ['end_date' => now()->toDateString()]);

        $this->withToken($token)->postJson("/api/v1/member/offers/{$offer->id}/claim")->assertOk();
    }

    public function test_staff_of_one_venue_cannot_mark_another_venues_claim_used(): void
    {
        $this->offersSchema();
        $orgA = $this->tenant('A');
        $orgB = $this->tenant('B');
        ['member' => $memberB] = $this->member($orgB);
        $offerB = $this->offer($orgB->id);
        $claim = MemberOffer::create(['organization_id' => $orgB->id, 'member_id' => $memberB->id, 'offer_id' => $offerB->id, 'status' => 'claimed', 'claimed_at' => now()]);

        $staffA = $this->staffUser($orgA); // helper below
        $this->actingAs($staffA, 'sanctum')->postJson("/api/v1/admin/discounts/offers/{$claim->id}/use")->assertStatus(404);
        $this->assertNull($claim->fresh()->used_at);
    }

    /** A staff user with can_redeem_points for the admin discount routes. */
    private function staffUser(\App\Models\Organization $org): \App\Models\User
    {
        $user = \App\Models\User::create(['name' => 'Staff', 'email' => 'staff-'.$org->id.'@example.test', 'password' => bcrypt('secret-pass-1'), 'user_type' => 'staff', 'organization_id' => $org->id]);
        // The brand middleware and staff.can need their tables; copy the guarded creates from tests/Feature/Member/Portal/PortalBootstrapTest.php (the staff-token test) or tests/Feature/Admin/MemberPortalLinkTest.php, then insert a staff row with can_redeem_points = true.
        return $user;
    }
}
```

Read how `tests/Feature/Admin/MemberPortalLinkTest.php` builds an admin caller (staff table, brand pivot, subscription status) and reuse that shape in `staffUser()`; if the admin discount route also sits behind `check.subscription`, set the org's `subscription_status` as that test does.

- [ ] **Step 2: Run it to verify it fails**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Loyalty/OfferSecurityTest.php`
Expected: FAIL — the bronze member claims the gold offer (200), and the cross-tenant use answers 200.

- [ ] **Step 3: Fix the three paths**

`OfferController::claim` — after `SpecialOffer::active()->findOrFail($offerId)` and before the capacity checks:

```php
$tierIds = array_map('intval', (array) ($offer->tier_ids ?? []));
if ($tierIds !== [] && !in_array((int) $member->tier_id, $tierIds, true)) {
    return response()->json(['error' => 'wrong_tier', 'message' => 'This offer is for another membership level.'], 422);
}
```

`DiscountController::useOffer` — replace `MemberOffer::whereKey($id)` with a lookup that joins the member's organisation:

```php
$orgId = app('current_organization_id');
$claim = MemberOffer::whereKey($id)->whereHas('member', fn ($q) => $q->withoutGlobalScopes()->where('organization_id', $orgId))->lockForUpdate()->first();
if (!$claim) return response()->json(['error' => 'not_found', 'message' => 'Claim not found.'], 404);
```

(`MemberOffer::member()` must exist as a BelongsTo to `LoyaltyMember`; add it if missing.) Routes: append `->middleware('staff.can:can_redeem_points')` to the discount group or each of the three routes, matching the spelling other admin routes use.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Loyalty/OfferSecurityTest.php tests/Feature/Loyalty/ tests/Feature/Member/`
Expected: `Tests: 3 passed` for the new file; both suites otherwise unchanged.

- [ ] **Step 5: Commit**

```bash
git add app/Http/Controllers/Api/V1/Admin/DiscountController.php app/Http/Controllers/Api/V1/Member/OfferController.php app/Models/MemberOffer.php routes/api.php tests/Feature/Loyalty/OfferSecurityTest.php
git commit -m "Scope offer use to the venue, enforce tier targeting on claims, gate the discount routes

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Coupon codes — `CouponResolver::resolveCode()` and `POST member/portal/coupons/resolve`

**Files:**
- Create: `app/Http/Controllers/Api/V1/Member/Portal/PortalCouponController.php`
- Modify: `app/Services/Booking/CouponResolver.php` (`resolveCode`), `routes/api.php` (inside the `member/portal` group `:409-415`)
- Test: `tests/Feature/Member/Portal/PortalCouponTest.php`

**Interfaces:**
- Consumes: `CouponResolver::candidate()`, `CouponException`, `DiscountService::offerHasCapacity()`, `SpecialOffer::scopeActive`, `scopeForTier`.
- Produces: `CouponResolver::resolveCode(LoyaltyMember $member, string $code): array` → for an offer code `['kind' => 'offer', 'coupon' => ['member_offer_id' => int], 'label' => title, 'value_label' => e.g. '10% off' | '€5 off', 'valid_until' => 'YYYY-MM-DD'|null]`; for a `REW-` code `['kind' => 'reward', 'coupon' => ['redemption_id' => int], 'label' => reward name, 'value_label', 'valid_until' => null]`. Codes are trimmed and upper-cased. Offer resolution: active offer in the member's organisation with that `code`, `tier_ids` admits the member's tier (else `coupon_wrong_tier`), `offerHasCapacity()` (else `coupon_no_capacity`), the member's existing claim reused when unused (used → `coupon_used`), else a new claim created exactly as `OfferController::claim` does (status `claimed`, `claimed_at`, `expires_at = end_date->endOfDay()`, `times_used++`) under `lockForUpdate()` on the offer; the offer's money type must resolve (else `coupon_untyped`). Reward resolution: the member's own pending redemption with that code (anyone else's → `coupon_not_found`, fulfilled/cancelled → `coupon_used`, untyped → `coupon_untyped`).
- Produces: `POST /api/v1/member/portal/coupons/resolve {code}` → 200 with the array above; `CouponException` → 422 `{error: <code>, message: sentence()}`; validation → 422; throttled `throttle:5,1` keyed per member (route middleware `throttle:portal-coupon` with a named limiter defined in `AppServiceProvider` or `bootstrap/app.php` as `RateLimiter::for('portal-coupon', fn ($r) => Limit::perMinute(5)->by('coupon:'.$r->user()?->id))` — put it where the app defines its other named limiters; grep `RateLimiter::for`).

- [ ] **Step 1: Write the failing test**

```php
<?php
// tests/Feature/Member/Portal/PortalCouponTest.php
namespace Tests\Feature\Member\Portal;

use App\Models\MemberOffer;
use App\Models\Reward;
use App\Models\RewardRedemption;
use App\Models\SpecialOffer;
use Illuminate\Support\Facades\Schema;
use Tests\Feature\Member\MemberEndpointTestCase;

class PortalCouponTest extends MemberEndpointTestCase
{
    private \App\Models\Organization $org;
    private string $token;
    private \App\Models\LoyaltyMember $member;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltySchema();
        foreach (['code' => 'string', 'applies_to' => 'string'] as $col => $type) {
            if (!Schema::hasColumn('special_offers', $col)) Schema::table('special_offers', fn ($t) => $t->{$type}($col)->nullable());
        }
        if (!Schema::hasColumn('member_offers', 'used_reference')) Schema::table('member_offers', fn ($t) => $t->string('used_reference', 32)->nullable());
        if (!Schema::hasTable('rewards')) Schema::create('rewards', function ($t) { $t->id(); $t->unsignedBigInteger('organization_id'); $t->string('name'); $t->integer('points_cost'); $t->string('discount_type', 20)->nullable(); $t->decimal('discount_value', 10, 2)->nullable(); $t->string('applies_to', 12)->default('all'); $t->boolean('is_active')->default(true); $t->timestamps(); });
        if (!Schema::hasTable('reward_redemptions')) Schema::create('reward_redemptions', function ($t) { $t->id(); $t->unsignedBigInteger('organization_id'); $t->unsignedBigInteger('member_id'); $t->unsignedBigInteger('reward_id'); $t->integer('points_spent'); $t->string('code', 16); $t->string('status', 16)->default('pending'); $t->text('notes')->nullable(); $t->timestamp('fulfilled_at')->nullable(); $t->timestamp('cancelled_at')->nullable(); $t->timestamps(); });
        $this->org = $this->tenant();
        ['token' => $this->token, 'member' => $this->member] = $this->member($this->org);
    }

    private function offer(array $attrs = []): SpecialOffer
    {
        return SpecialOffer::withoutGlobalScopes()->create(array_merge(['organization_id' => $this->org->id, 'title' => 'Welcome ten', 'description' => '-', 'type' => 'discount', 'value' => 10, 'code' => 'WELCOME10', 'start_date' => now()->subDay()->toDateString(), 'end_date' => now()->addDays(3)->toDateString(), 'is_active' => true], $attrs));
    }

    private function resolve(string $code)
    {
        return $this->withToken($this->token)->postJson('/api/v1/member/portal/coupons/resolve', ['code' => $code]);
    }

    public function test_an_offer_code_creates_or_reuses_the_members_claim(): void
    {
        $offer = $this->offer();
        $first = $this->resolve(' welcome10 ')->assertOk();
        $first->assertJsonPath('kind', 'offer')->assertJsonPath('label', 'Welcome ten')->assertJsonPath('value_label', '10% off');
        $claimId = $first->json('coupon.member_offer_id');
        $this->assertSame(1, MemberOffer::where('member_id', $this->member->id)->count());
        $this->resolve('WELCOME10')->assertOk()->assertJsonPath('coupon.member_offer_id', $claimId);
        $this->assertSame(1, $offer->fresh()->times_used);
    }

    public function test_wrong_tier_expired_capacity_and_used_answer_specific_codes(): void
    {
        $gold = \App\Models\LoyaltyTier::create(['organization_id' => $this->org->id, 'name' => 'Gold', 'min_points' => 5000, 'earn_rate' => 2, 'is_active' => true]);
        $this->offer(['code' => 'GOLDONLY', 'tier_ids' => [$gold->id]]);
        $this->resolve('GOLDONLY')->assertStatus(422)->assertJsonPath('error', 'coupon_wrong_tier');

        $this->offer(['code' => 'OLD', 'end_date' => now()->subDay()->toDateString()]);
        $this->resolve('OLD')->assertStatus(422)->assertJsonPath('error', 'coupon_not_found');

        $this->offer(['code' => 'FULL', 'usage_limit' => 1, 'times_used' => 1]);
        $this->resolve('FULL')->assertStatus(422)->assertJsonPath('error', 'coupon_no_capacity');

        $used = $this->offer(['code' => 'USED']);
        MemberOffer::create(['organization_id' => $this->org->id, 'member_id' => $this->member->id, 'offer_id' => $used->id, 'status' => 'used', 'claimed_at' => now(), 'used_at' => now()]);
        $this->resolve('USED')->assertStatus(422)->assertJsonPath('error', 'coupon_used');
    }

    public function test_a_reward_code_resolves_only_for_its_owner_and_only_when_typed(): void
    {
        $reward = Reward::create(['organization_id' => $this->org->id, 'name' => 'Fifteen off', 'points_cost' => 100, 'discount_type' => 'fixed_amount', 'discount_value' => 15, 'is_active' => true]);
        $mine = RewardRedemption::create(['organization_id' => $this->org->id, 'member_id' => $this->member->id, 'reward_id' => $reward->id, 'points_spent' => 100, 'code' => 'REW-MINE0001', 'status' => 'pending']);
        $this->resolve('rew-mine0001')->assertOk()->assertJsonPath('kind', 'reward')->assertJsonPath('coupon.redemption_id', $mine->id);

        ['member' => $other] = $this->member($this->org, 'other-pass-123');
        RewardRedemption::create(['organization_id' => $this->org->id, 'member_id' => $other->id, 'reward_id' => $reward->id, 'points_spent' => 100, 'code' => 'REW-OTHER001', 'status' => 'pending']);
        $this->resolve('REW-OTHER001')->assertStatus(422)->assertJsonPath('error', 'coupon_not_found');

        $coffee = Reward::create(['organization_id' => $this->org->id, 'name' => 'Free coffee', 'points_cost' => 50, 'is_active' => true]);
        RewardRedemption::create(['organization_id' => $this->org->id, 'member_id' => $this->member->id, 'reward_id' => $coffee->id, 'points_spent' => 50, 'code' => 'REW-COFFEE01', 'status' => 'pending']);
        $this->resolve('REW-COFFEE01')->assertStatus(422)->assertJsonPath('error', 'coupon_untyped');
    }

    public function test_the_sixth_failed_resolution_in_a_minute_is_throttled(): void
    {
        foreach (range(1, 5) as $i) $this->resolve("NOPE$i")->assertStatus(422);
        $this->resolve('NOPE6')->assertStatus(429);
    }
}
```

`$this->member($org, 'other-pass-123')` registers a second member; if `MemberEndpointTestCase::member()` derives the email from a fixed string, extend it with an optional `$email` argument (keep the default) so two members can coexist.

- [ ] **Step 2: Run it to verify it fails**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Member/Portal/PortalCouponTest.php`
Expected: FAIL — 404 on the route.

- [ ] **Step 3: Implement `resolveCode()`**

```php
public function resolveCode(LoyaltyMember $member, string $code): array
{
    $code = strtoupper(trim($code));
    if ($code === '') throw new CouponException('coupon_not_found', 'Enter a code.');
    return str_starts_with($code, 'REW-') ? $this->resolveRewardCode($member, $code) : $this->resolveOfferCode($member, $code);
}

private function resolveOfferCode(LoyaltyMember $member, string $code): array
{
    return DB::transaction(function () use ($member, $code) {
        $offer = SpecialOffer::withoutGlobalScopes()->where('organization_id', $member->organization_id)->active()->whereRaw('UPPER(code) = ?', [$code])->lockForUpdate()->first();
        if (!$offer) throw new CouponException('coupon_not_found', 'We do not recognise that code.');
        $tierIds = array_map('intval', (array) ($offer->tier_ids ?? []));
        if ($tierIds !== [] && !in_array((int) $member->tier_id, $tierIds, true)) throw new CouponException('coupon_wrong_tier', 'This code is for another membership level.');
        if ($this->moneyType($offer->type) === null) throw new CouponException('coupon_untyped', 'This offer has no money value and cannot be used as a coupon.');

        $claim = MemberOffer::where('member_id', $member->id)->where('offer_id', $offer->id)->first();
        if ($claim && ($claim->used_at !== null || $claim->status === 'used')) throw new CouponException('coupon_used', 'You have already used this code.');
        if (!$claim) {
            if (!app(DiscountService::class)->offerHasCapacity($offer)) throw new CouponException('coupon_no_capacity', 'This code has been fully claimed.');
            $claim = MemberOffer::create(['organization_id' => $member->organization_id, 'member_id' => $member->id, 'offer_id' => $offer->id, 'status' => 'claimed', 'claimed_at' => now(), 'expires_at' => $offer->end_date?->copy()->endOfDay()]);
            $offer->increment('times_used');
        }
        return ['kind' => 'offer', 'coupon' => ['member_offer_id' => $claim->id], 'label' => $offer->title, 'value_label' => $this->valueLabel($this->moneyType($offer->type), (float) $offer->value), 'valid_until' => $offer->end_date?->toDateString()];
    });
}

private function resolveRewardCode(LoyaltyMember $member, string $code): array
{
    $red = RewardRedemption::with('reward')->where('organization_id', $member->organization_id)->where('member_id', $member->id)->whereRaw('UPPER(code) = ?', [$code])->first();
    if (!$red) throw new CouponException('coupon_not_found', 'We do not recognise that code on your account.');
    if ($red->status !== RewardRedemption::STATUS_PENDING) throw new CouponException('coupon_used', 'This reward code has already been used.');
    $type = $red->reward ? $this->moneyType($red->reward->discount_type) : null;
    if ($type === null || (float) $red->reward->discount_value <= 0) throw new CouponException('coupon_untyped', 'This reward has no money value and cannot be used as a coupon.');
    return ['kind' => 'reward', 'coupon' => ['redemption_id' => $red->id], 'label' => $red->reward->name, 'value_label' => $this->valueLabel($type, (float) $red->reward->discount_value), 'valid_until' => null];
}

private function valueLabel(string $type, float $value): string
{
    return $type === DiscountService::PERCENT ? rtrim(rtrim(number_format($value, 2, '.', ''), '0'), '.') . '% off' : number_format($value, 2) . ' off';
}
```

`value_label` is a server-side English fallback; the portal renders its own label from `type`/`value` when it has them (Task 17) — also return `'type' => $type, 'value' => $value` in both arrays so the client can localise.

- [ ] **Step 4: Write the controller and route**

```php
<?php
// app/Http/Controllers/Api/V1/Member/Portal/PortalCouponController.php
namespace App\Http\Controllers\Api\V1\Member\Portal;

use App\Http\Controllers\Controller;
use App\Services\Booking\CouponException;
use App\Services\Booking\CouponResolver;
use App\Services\MemberProvisioner;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PortalCouponController extends Controller
{
    public function resolve(Request $request, CouponResolver $resolver, MemberProvisioner $provisioner): JsonResponse
    {
        $data = $request->validate(['code' => 'required|string|min:2|max:32']);
        $member = $provisioner->ensureForUser($request->user());
        if (!$member) return response()->json(['error' => 'no_membership', 'message' => 'Your membership is not set up yet.'], 422);
        try {
            return response()->json($resolver->resolveCode($member, $data['code']));
        } catch (CouponException $e) {
            return response()->json(['error' => $e->errorCode, 'message' => $e->sentence()], 422);
        }
    }
}
```

Route (inside the `member/portal` group):

```php
Route::post('coupons/resolve', [\App\Http\Controllers\Api\V1\Member\Portal\PortalCouponController::class, 'resolve'])->middleware('throttle:portal-coupon');
```

Named limiter, next to the app's other `RateLimiter::for` definitions:

```php
RateLimiter::for('portal-coupon', fn (Request $r) => Limit::perMinute(5)->by('portal-coupon:' . ($r->user()?->id ?? $r->ip())));
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Member/Portal/PortalCouponTest.php tests/Feature/Booking/DiscountServiceBookingTest.php`
Expected: `Tests: 4 passed` + `7 passed`.

- [ ] **Step 6: Commit**

```bash
git add app/Services/Booking/CouponResolver.php app/Http/Controllers/Api/V1/Member/Portal/PortalCouponController.php routes/api.php app/Providers/AppServiceProvider.php tests/Feature/Member/Portal/PortalCouponTest.php tests/Feature/Member/MemberEndpointTestCase.php
git commit -m "Resolve offer and reward codes into coupons the member can apply

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

(Adjust the provider path to wherever the limiter landed.)

---

### Task 6: `MemberPricing` and `ensureGuestForMember()`

**Files:**
- Create: `app/Services/Booking/PricingResult.php`, `app/Services/Booking/MemberPricing.php`
- Modify: `app/Services/GuestMemberLinkService.php` (add `ensureGuestForMember()` next to `ensureMemberForGuest()` `:50`)
- Test: `tests/Feature/Booking/MemberPricingTest.php`

**Interfaces:**
- Consumes: `DiscountService::quoteForBooking()`, `CouponResolver::consume()`, `BookingScope`, `CouponSelection`.
- Produces: `final readonly class PricingResult { public function __construct(public float $list, public float $discount, public float $total, public ?array $applied, public ?array $coupon, public string $currency) {} public function toArray(): array; public function couponConsumable(): bool }` — `couponConsumable()` is true when `applied` is the coupon (`applied.source` is `offer`/`reward`).
- Produces: `App\Services\Booking\MemberPricing`:
  - `quote(LoyaltyMember $member, float $listAmount, string $currency, BookingScope $scope, ?CouponSelection $coupon = null): PricingResult` — currency is the booking's (Task 2's `currency`), never `config('app.currency')`.
  - `quoteWithoutMember(float $listAmount, string $currency): PricingResult` — zero discount (a venue without loyalty, or a member with no tier).
  - `columns(PricingResult $p): array` → `['list_amount' => …, 'discount_amount' => …, 'discount_source' => applied.source|null, 'discount_source_id' => applied.source_id|null, 'discount_label' => applied.label|null (max 120 chars), 'total_amount' => …]`.
  - `consume(PricingResult $p, string $reference): void` — calls `CouponResolver::consume(applied, reference)` only when `couponConsumable()`; a no-op otherwise (an outbid coupon is left untouched, spec §6.3).
- Produces: `GuestMemberLinkService::ensureGuestForMember(LoyaltyMember $member): Guest` — the first guest in the member's organisation with `member_id = member.id`, else the guest with the member's email (case-insensitive) which is then linked (`member_id` set), else a new guest (`organization_id`, `member_id`, name/email/phone from the user, `lead_source = 'Member Portal'`). Must not trigger a second member enrolment: `Guest::created` auto-enrols a member (engine map) — create the guest with `member_id` already set so the hook sees a linked guest (read `app/Models/Guest.php`'s `created` hook first; if it enrols regardless, use `Guest::withoutEvents()` for this create and say so in a comment).

- [ ] **Step 1: Write the failing test**

```php
<?php
// tests/Feature/Booking/MemberPricingTest.php
namespace Tests\Feature\Booking;

use App\Models\Guest;
use App\Models\MemberOffer;
use App\Services\Booking\BookingScope;
use App\Services\Booking\CouponSelection;
use App\Services\Booking\MemberPricing;
use App\Services\GuestMemberLinkService;

/** Shares the fixture of DiscountServiceBookingTest: copy its setUp(), benefit() and claimedOffer() helpers. */
class MemberPricingTest extends DiscountServiceBookingTest
{
    public function test_it_quotes_in_the_bookings_currency_and_maps_the_persisted_columns(): void
    {
        $this->benefit('percent_discount', 10, 'services');
        $p = app(MemberPricing::class)->quote($this->member, 80, 'GBP', BookingScope::Services);
        $this->assertSame('GBP', $p->currency);
        $this->assertSame(72.0, $p->total);
        $cols = app(MemberPricing::class)->columns($p);
        $this->assertSame(['list_amount' => 80.0, 'discount_amount' => 8.0, 'discount_source' => 'tier_benefit', 'total_amount' => 72.0], array_intersect_key($cols, array_flip(['list_amount', 'discount_amount', 'discount_source', 'total_amount'])));
        $this->assertNotNull($cols['discount_source_id']);
    }

    public function test_consume_marks_an_applied_offer_used_and_leaves_an_outbid_one(): void
    {
        $claim = $this->claimedOffer('discount', 20);
        $pricing = app(MemberPricing::class);
        $applied = $pricing->quote($this->member, 100, 'EUR', BookingScope::Services, new CouponSelection(memberOfferId: $claim->id));
        $pricing->consume($applied, 'SVC-TEST0001');
        $this->assertSame('SVC-TEST0001', MemberOffer::find($claim->id)->used_reference);

        $this->benefit('percent_discount', 50, 'all');
        $claim2 = $this->claimedOffer('discount', 5);
        $outbid = $pricing->quote($this->member, 100, 'EUR', BookingScope::Services, new CouponSelection(memberOfferId: $claim2->id));
        $this->assertSame('outbid', $outbid->coupon['status']);
        $pricing->consume($outbid, 'SVC-TEST0002');
        $this->assertNull(MemberOffer::find($claim2->id)->used_at);
    }

    public function test_a_member_without_a_tier_gets_the_list_price(): void
    {
        $this->member->forceFill(['tier_id' => null])->save();
        $p = app(MemberPricing::class)->quote($this->member->fresh(), 50, 'EUR', BookingScope::Services);
        $this->assertSame(0.0, $p->discount);
        $this->assertSame(50.0, $p->total);
    }

    public function test_ensure_guest_for_member_links_by_email_then_creates_once(): void
    {
        $svc = app(GuestMemberLinkService::class);
        $existing = Guest::withoutEvents(fn () => Guest::create(['organization_id' => $this->orgId, 'first_name' => 'Ada', 'last_name' => 'L', 'email' => 'ADA@example.test']));
        $g1 = $svc->ensureGuestForMember($this->member);
        $this->assertSame($existing->id, $g1->id);
        $this->assertSame($this->member->id, (int) $g1->member_id);
        $g2 = $svc->ensureGuestForMember($this->member);
        $this->assertSame($g1->id, $g2->id);
        $this->assertSame(1, Guest::withoutGlobalScopes()->where('organization_id', $this->orgId)->count());
    }
}
```

Making the fixture reusable: change `DiscountServiceBookingTest`'s `setUp()`, `benefit()`, `claimedOffer()`, `redemption()` to `protected` and its properties to `protected` (the subclass above relies on it; PHPUnit runs the parent's tests again under the child's name, which is acceptable here — or move the fixture into a `tests/Concerns/SeedsDiscountFixture.php` trait used by both; do the trait if the duplicated run bothers the reviewer). `guests` columns: read `setUpMinimalSchema()` (`:28`) for the guest table's actual columns (`first_name`/`last_name` vs `name`) and adapt the test and the service.

- [ ] **Step 2: Run it to verify it fails**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Booking/MemberPricingTest.php`
Expected: FAIL — `MemberPricing` not found.

- [ ] **Step 3: Write PricingResult, MemberPricing and the guest link**

```php
<?php
// app/Services/Booking/PricingResult.php
namespace App\Services\Booking;

final readonly class PricingResult
{
    public function __construct(
        public float $list,
        public float $discount,
        public float $total,
        public ?array $applied,
        public ?array $coupon,
        public string $currency,
    ) {}

    public function couponConsumable(): bool
    {
        return $this->applied !== null && in_array($this->applied['source'], ['offer', 'reward'], true);
    }

    public function toArray(): array
    {
        return [
            'list_amount'  => $this->list,
            'discount'     => $this->applied ? ['amount' => $this->discount, 'label' => $this->applied['label'], 'source' => $this->applied['source']] : null,
            'coupon'       => $this->coupon,
            'total_amount' => $this->total,
            'currency'     => $this->currency,
        ];
    }
}
```

```php
<?php
// app/Services/Booking/MemberPricing.php
namespace App\Services\Booking;

use App\Models\LoyaltyMember;
use App\Services\DiscountService;

/**
 * The member price of a booking: the engine's scoped quote in the booking's
 * own currency, the columns a booking row stores, and the coupon write that
 * happens inside the confirm transaction.
 */
final class MemberPricing
{
    public function __construct(private readonly DiscountService $discounts, private readonly CouponResolver $coupons) {}

    public function quote(LoyaltyMember $member, float $listAmount, string $currency, BookingScope $scope, ?CouponSelection $coupon = null): PricingResult
    {
        $q = $this->discounts->quoteForBooking($member, round($listAmount, 2), $scope, $coupon);
        return new PricingResult($q['amount'], $q['discount'], $q['total'], $q['applied'], $q['coupon'], strtoupper($currency));
    }

    public function quoteWithoutMember(float $listAmount, string $currency): PricingResult
    {
        $list = round($listAmount, 2);
        return new PricingResult($list, 0.0, $list, null, null, strtoupper($currency));
    }

    public function columns(PricingResult $p): array
    {
        return [
            'list_amount'        => $p->list,
            'discount_amount'    => $p->discount,
            'discount_source'    => $p->applied['source'] ?? null,
            'discount_source_id' => $p->applied['source_id'] ?? null,
            'discount_label'     => isset($p->applied['label']) ? mb_substr($p->applied['label'], 0, 120) : null,
            'total_amount'       => $p->total,
        ];
    }

    /** Inside the booking transaction only. An outbid coupon is left untouched. */
    public function consume(PricingResult $p, string $reference): void
    {
        if ($p->couponConsumable()) $this->coupons->consume($p->applied, $reference);
    }
}
```

`ensureGuestForMember()`:

```php
public function ensureGuestForMember(LoyaltyMember $member): Guest
{
    $orgId = (int) $member->organization_id;
    $linked = Guest::withoutGlobalScopes()->where('organization_id', $orgId)->where('member_id', $member->id)->orderBy('id')->first();
    if ($linked) return $linked;

    $email = strtolower(trim((string) $member->user?->email));
    if ($email !== '') {
        $byEmail = Guest::withoutGlobalScopes()->where('organization_id', $orgId)->whereRaw('LOWER(email) = ?', [$email])->orderBy('id')->first();
        if ($byEmail) { $byEmail->forceFill(['member_id' => $member->id])->save(); return $byEmail; }
    }

    // Created with member_id already set so the Guest::created hook sees a
    // linked guest and does not enrol a second membership.
    return Guest::withoutGlobalScopes()->create([
        'organization_id' => $orgId, 'member_id' => $member->id,
        'first_name' => $this->firstName($member), 'last_name' => $this->lastName($member),
        'email' => $email ?: null, 'phone' => $member->user?->phone, 'lead_source' => 'Member Portal',
    ]);
}
```

(Match the guest name columns to the model; `firstName()/lastName()` split `user.name` on the first space.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Booking/MemberPricingTest.php tests/Feature/Booking/DiscountServiceBookingTest.php`
Expected: all pass (the parent's 7 run twice if you subclassed, plus 4 new).

- [ ] **Step 5: Commit**

```bash
git add app/Services/Booking/PricingResult.php app/Services/Booking/MemberPricing.php app/Services/GuestMemberLinkService.php tests/Feature/Booking/MemberPricingTest.php tests/Feature/Booking/DiscountServiceBookingTest.php
git commit -m "Wrap the booking quote in MemberPricing and give every member a linked guest

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: `PortalServiceBookingController` — catalogue, calendar, availability

**Files:**
- Create: `app/Http/Controllers/Api/V1/Member/Portal/PortalServiceBookingController.php`
- Modify: `routes/api.php` (`member/portal` group)
- Test: `tests/Feature/Member/Portal/PortalServiceCatalogueTest.php`

**Interfaces:**
- Consumes: `ServiceCatalogue::build()`, `ServiceSchedulingService::availableSlots()/availableDates()`, `MemberPricing::quote()`, `BookingCapability::appointmentsBookable()`, `PortalBootstrap`'s loyalty rule (`:44-48` — extract it into a public static `PortalBootstrap::loyaltyOn(int $orgId): bool` if it is not already callable).
- Produces:
  - `GET member/portal/services` → `{categories, services: [catalogue service + member_price: float], masters, extras, rules, pricing: {automatic: {label, type, value} | null}}`. `member_price` = `MemberPricing::quote(member, price, currency, Services)->total` per service (no coupon); when loyalty is off or the member has no tier, `member_price === price` and `pricing.automatic` is null. 404 `{error: 'not_bookable'}` when `appointmentsBookable()` is false.
  - `GET member/portal/services/calendar?service_id&master_id?&start&end` → `{available_dates}`; the range is clipped to `[today, today + max_advance_days]`; a service outside the org → 404 `not_found`.
  - `GET member/portal/services/availability?service_id&master_id?&date` → `{slots}`; `date` beyond `today + max_advance_days` → 422 `{error: 'too_far_ahead'}`; the slot list applies `services_lead_minutes` and `services_slot_step` exactly as the widget (`availableSlots($service, $date, $masterId, slot_step, lead_minutes)`).
  - Constructor-injected: `ServiceCatalogue`, `ServiceSchedulingService`, `MemberPricing`, `MemberProvisioner`, `BookingCapability`. A private `member(Request): ?LoyaltyMember` (provisioner) and `service(int $id): Service` (`Service::withoutGlobalScopes()->where('organization_id', app('current_organization_id'))->where('is_active', true)->findOrFail($id)` → the framework 404 is turned into `{error: 'not_found'}` by catching `ModelNotFoundException`).

- [ ] **Step 1: Write the failing test**

```php
<?php
// tests/Feature/Member/Portal/PortalServiceCatalogueTest.php
namespace Tests\Feature\Member\Portal;

use App\Models\HotelSetting;
use App\Models\TierBenefit;
use Tests\Concerns\SetsUpServiceBookingSchema;
use Tests\Feature\Member\MemberEndpointTestCase;

class PortalServiceCatalogueTest extends MemberEndpointTestCase
{
    use SetsUpServiceBookingSchema;

    private \App\Models\Organization $org;
    private string $token;
    private \App\Models\LoyaltyMember $member;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpServiceBookingSchema();
        $this->setUpLoyaltySchema();
        if (!\Illuminate\Support\Facades\Schema::hasColumn('tier_benefits', 'applies_to')) \Illuminate\Support\Facades\Schema::table('tier_benefits', fn ($t) => $t->string('applies_to', 12)->default('all'));
        $this->org = $this->tenant();
        ['token' => $this->token, 'member' => $this->member] = $this->member($this->org);
    }

    private function setting(string $key, string $value): void
    {
        HotelSetting::withoutGlobalScopes()->updateOrCreate(['organization_id' => $this->org->id, 'key' => $key], ['value' => $value, 'group' => 'booking']);
        HotelSetting::flushCacheFor($this->org->id);
    }

    private function tenPercentOnServices(): void
    {
        $def = \App\Models\BenefitDefinition::create(['organization_id' => $this->org->id, 'name' => '10% off treatments', 'code' => 'ten', 'category' => 'discount', 'is_active' => true]);
        TierBenefit::create(['organization_id' => $this->org->id, 'tier_id' => $this->member->tier_id, 'benefit_id' => $def->id, 'value_type' => 'percent_discount', 'value_amount' => 10, 'applies_to' => 'services', 'is_active' => true]);
    }

    public function test_the_catalogue_carries_the_member_price(): void
    {
        $this->seedBookableService($this->org->id);
        $this->tenPercentOnServices();
        $res = $this->withToken($this->token)->getJson('/api/v1/member/portal/services')->assertOk();
        $res->assertJsonPath('services.0.price', 60)->assertJsonPath('services.0.member_price', 54)->assertJsonPath('pricing.automatic.value', 10)->assertJsonPath('rules.slot_step', 15);
    }

    public function test_without_a_benefit_the_member_price_is_the_list_price(): void
    {
        $this->seedBookableService($this->org->id);
        $this->withToken($this->token)->getJson('/api/v1/member/portal/services')->assertOk()->assertJsonPath('services.0.member_price', 60)->assertJsonPath('pricing.automatic', null);
    }

    public function test_a_venue_with_nothing_bookable_answers_not_bookable(): void
    {
        $this->withToken($this->token)->getJson('/api/v1/member/portal/services')->assertStatus(404)->assertJsonPath('error', 'not_bookable');
    }

    public function test_slots_respect_lead_time_and_the_advance_window(): void
    {
        ['service' => $service] = $this->seedBookableService($this->org->id);
        $this->setting('services_max_advance_days', '7');
        $this->setting('services_lead_minutes', '120');
        $this->travelTo(now()->next('Monday')->setTime(8, 0));

        $today = $this->withToken($this->token)->getJson("/api/v1/member/portal/services/availability?service_id={$service->id}&date=" . now()->toDateString())->assertOk();
        $labels = array_column($today->json('slots'), 'time_label');
        $this->assertNotContains('09:00', $labels, 'inside the two-hour lead time');
        $this->assertContains('10:00', $labels);

        $this->withToken($this->token)->getJson("/api/v1/member/portal/services/availability?service_id={$service->id}&date=" . now()->addDays(8)->toDateString())->assertStatus(422)->assertJsonPath('error', 'too_far_ahead');

        $cal = $this->withToken($this->token)->getJson("/api/v1/member/portal/services/calendar?service_id={$service->id}&start=" . now()->toDateString() . '&end=' . now()->addDays(30)->toDateString())->assertOk();
        $this->assertCount(8, $cal->json('available_dates'), 'today plus seven days, every day scheduled');
    }

    public function test_another_venues_service_is_not_found(): void
    {
        $other = $this->tenant('Other');
        ['service' => $foreign] = $this->seedBookableService($other->id);
        $this->seedBookableService($this->org->id);
        $this->withToken($this->token)->getJson("/api/v1/member/portal/services/availability?service_id={$foreign->id}&date=" . now()->toDateString())->assertStatus(404)->assertJsonPath('error', 'not_found');
    }
}
```

The `time_label` format is whatever `availableSlots()` emits (`H:i`); check `ServiceSchedulingService::availableSlots()` (`:67`) and adjust the two `assertContains` strings to it.

- [ ] **Step 2: Run it to verify it fails**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Member/Portal/PortalServiceCatalogueTest.php`
Expected: FAIL — 404 on the routes.

- [ ] **Step 3: Write the controller (these three actions) and the routes**

```php
<?php
// app/Http/Controllers/Api/V1/Member/Portal/PortalServiceBookingController.php
namespace App\Http\Controllers\Api\V1\Member\Portal;

use App\Http\Controllers\Controller;
use App\Models\HotelSetting;
use App\Models\LoyaltyMember;
use App\Models\Service;
use App\Services\Booking\BookingCapability;
use App\Services\Booking\BookingScope;
use App\Services\Booking\MemberPricing;
use App\Services\Booking\ServiceCatalogue;
use App\Services\MemberProvisioner;
use App\Services\Portal\PortalBootstrap;
use App\Services\ServiceSchedulingService;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The member's own copy of the widget's booking sequence: catalogue with
 * member prices, calendar, slots, quote, payment intent, confirm. Every
 * action runs under the member's organisation (tenant middleware) and
 * recomputes prices on the server.
 */
class PortalServiceBookingController extends Controller
{
    public function __construct(
        private readonly ServiceCatalogue $catalogue,
        private readonly ServiceSchedulingService $scheduler,
        private readonly MemberPricing $pricing,
        private readonly MemberProvisioner $provisioner,
        private readonly BookingCapability $capability,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $orgId = (int) app('current_organization_id');
        if (!$this->capability->appointmentsBookable($orgId)) {
            return response()->json(['error' => 'not_bookable', 'message' => 'This venue does not take online appointments.'], 404);
        }
        $cat = $this->catalogue->build($orgId);
        $member = $this->loyaltyMember($request);
        $automatic = null;
        foreach ($cat['services'] as &$svc) {
            $p = $member ? $this->pricing->quote($member, (float) $svc['price'], $svc['currency'] ?: $cat['rules']['currency'], BookingScope::Services) : $this->pricing->quoteWithoutMember((float) $svc['price'], $svc['currency'] ?: $cat['rules']['currency']);
            $svc['member_price'] = $p->total;
            if ($automatic === null && $p->applied && $p->applied['source'] === 'tier_benefit') {
                $automatic = ['label' => $p->applied['label'], 'type' => $p->applied['type'], 'value' => $p->applied['value']];
            }
        }
        unset($svc);
        return response()->json($cat + ['pricing' => ['automatic' => $automatic]], 200, [], JSON_PRESERVE_ZERO_FRACTION);
    }

    public function calendar(Request $request): JsonResponse
    {
        $data = $request->validate(['service_id' => 'required|integer', 'master_id' => 'nullable|integer', 'start' => 'required|date', 'end' => 'required|date|after_or_equal:start']);
        $service = $this->service((int) $data['service_id']);
        if ($service instanceof JsonResponse) return $service;
        $today = CarbonImmutable::today();
        $last = $today->addDays($this->maxAdvanceDays());
        $start = max(CarbonImmutable::parse($data['start']), $today);
        $end = min(CarbonImmutable::parse($data['end']), $last);
        if ($end->lessThan($start)) return response()->json(['available_dates' => []]);
        return response()->json(['available_dates' => $this->scheduler->availableDates($service, $start->toDateString(), $end->toDateString(), $data['master_id'] ?? null)]);
    }

    public function availability(Request $request): JsonResponse
    {
        $data = $request->validate(['service_id' => 'required|integer', 'master_id' => 'nullable|integer', 'date' => 'required|date|after_or_equal:today']);
        $service = $this->service((int) $data['service_id']);
        if ($service instanceof JsonResponse) return $service;
        if (CarbonImmutable::parse($data['date'])->greaterThan(CarbonImmutable::today()->addDays($this->maxAdvanceDays()))) {
            return response()->json(['error' => 'too_far_ahead', 'message' => 'That date is beyond the booking window.'], 422);
        }
        $slots = $this->scheduler->availableSlots($service, $data['date'], $data['master_id'] ?? null, (int) HotelSetting::getValue('services_slot_step', 15), (int) HotelSetting::getValue('services_lead_minutes', 60));
        return response()->json(['slots' => $slots]);
    }

    // quote(), paymentIntent(), confirm() — Tasks 8 and 9.

    private function loyaltyMember(Request $request): ?LoyaltyMember
    {
        if (!PortalBootstrap::loyaltyOn((int) app('current_organization_id'))) return null;
        $m = $this->provisioner->ensureForUser($request->user());
        return $m && $m->tier_id ? $m : null;
    }

    private function service(int $id): Service|JsonResponse
    {
        try {
            return Service::withoutGlobalScopes()->where('organization_id', app('current_organization_id'))->where('is_active', true)->findOrFail($id);
        } catch (ModelNotFoundException) {
            return response()->json(['error' => 'not_found', 'message' => 'We could not find that service.'], 404);
        }
    }

    private function maxAdvanceDays(): int
    {
        return max(1, (int) HotelSetting::getValue('services_max_advance_days', 60));
    }
}
```

Routes inside the `member/portal` group:

```php
Route::get('services', [PortalServiceBookingController::class, 'index']);
Route::get('services/calendar', [PortalServiceBookingController::class, 'calendar']);
Route::get('services/availability', [PortalServiceBookingController::class, 'availability']);
```

(With the FQCN or a `use` at the top of the file, matching the file's style.) `PortalBootstrap::loyaltyOn(int $orgId): bool` — extract the existing check (active tier and industry has loyalty, `:44-48`) into this public static and call it from where it lived.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Member/Portal/`
Expected: `Tests: 5 passed` for the new file; the rest of the portal suite unchanged.

- [ ] **Step 5: Commit**

```bash
git add app/Http/Controllers/Api/V1/Member/Portal/PortalServiceBookingController.php app/Services/Portal/PortalBootstrap.php routes/api.php tests/Feature/Member/Portal/PortalServiceCatalogueTest.php
git commit -m "Serve the member's service catalogue with member prices, calendar and slots

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 8: Quote and payment intent

**Files:**
- Modify: `app/Http/Controllers/Api/V1/Member/Portal/PortalServiceBookingController.php` (add `quote()`, `paymentIntent()`, a private `buildQuote()`), `routes/api.php`
- Test: `tests/Feature/Member/Portal/PortalServiceBookingTest.php` (quote and payment-intent cases; Task 9 adds the confirm cases to the same file)

**Interfaces:**
- Consumes: `ServiceQuoteBuilder::build()`, `ExtraLeadTimeException`, `MemberPricing`, `CouponSelection::fromArray()`, `CouponException`, `StripeService::{isEnabled, currency, createPaymentIntent}`, `HotelSetting::getValue('booking_mock_mode')`, `services_currency`.
- Produces: request body shared by quote/payment-intent/confirm — `QUOTE_RULES = ['service_id' => 'required|integer', 'master_id' => 'nullable|integer', 'start_at' => 'required|date', 'party_size' => 'nullable|integer|min:1|max:10', 'extras' => 'nullable|array|max:20', 'extras.*.id' => 'required_with:extras|integer', 'extras.*.quantity' => 'nullable|integer|min:1|max:10', 'coupon' => 'nullable|array', 'coupon.member_offer_id' => 'nullable|integer', 'coupon.redemption_id' => 'nullable|integer']`.
- Produces: private `buildQuote(Request $request, array $data): array` returning `['service' => Service, 'q' => builder array, 'pricing' => PricingResult, 'payment' => ['mode' => 'online'|'at_venue', 'reason' => null|'payments_off'|'currency_mismatch'|'mock_mode'], 'policy' => ['cancellation_policy' => ?string, 'cancel_hours' => int]]`; throws `RuntimeException` (409 `slot_taken`), `ExtraLeadTimeException` (422 `extra_lead_time`), `CouponException` (422 `<code>`). `payment.mode` is `online` when `StripeService::isEnabled()`, mock mode is off, and `strtoupper(q.currency) === strtoupper(stripe->currency())` — the same rule `PortalBootstrap::capabilities()` uses (`:81-109`); reuse that logic by extracting it into `PortalBootstrap::paymentMode(string $currency): array{mode, reason}` (public static or a small service) so the two never drift.
- Produces: `POST member/portal/services/quote` → 200 `{service: {id, name, duration_minutes}, master: {id, name} | null, start_at, end_at, duration_minutes, currency, lines: {service_price, extras: [{id, name, unit_price, quantity, line_total}], extras_total}, list_amount, discount: {amount, label, source} | null, coupon: {source, source_id, label, status, discount} | null, total_amount, payment: {mode, reason}, policy: {cancellation_policy, cancel_hours}}`.
- Produces: `POST member/portal/services/payment-intent` (same body) → 200 `{client_secret, payment_intent_id, amount, currency}`; `payment.mode === 'at_venue'` → 409 `{error: 'pay_at_venue'}`; `total_amount <= 0` → 409 `{error: 'nothing_to_pay'}`; Stripe throws → 503 `{error: 'payment_unavailable'}`. The PI is created with `createPaymentIntent($total, "Service booking: {$service->name}", ['kind' => 'portal_service_booking', 'org_id' => $orgId, 'member_id' => $member->id, 'service_id' => …, 'start_at' => iso, 'total' => number_format($total, 2, '.', '')])`. The member row is required for payment-intent and confirm (`ensureForUser()`; null → 422 `no_membership`). Note: `StripeService::createPaymentIntent()` returns `client_secret` + `payment_intent_id`; the amount it charges is `$total` in the Stripe currency, which `payment.mode` guaranteed equals the booking currency.

- [ ] **Step 1: Write the failing tests**

```php
<?php
// tests/Feature/Member/Portal/PortalServiceBookingTest.php
namespace Tests\Feature\Member\Portal;

use App\Models\HotelSetting;
use App\Models\MemberOffer;
use App\Models\ServiceBooking;
use App\Models\SpecialOffer;
use App\Models\TierBenefit;
use App\Services\StripeService;
use Illuminate\Support\Facades\Schema;
use Mockery;
use Tests\Concerns\SetsUpServiceBookingSchema;
use Tests\Feature\Member\MemberEndpointTestCase;

class PortalServiceBookingTest extends MemberEndpointTestCase
{
    use SetsUpServiceBookingSchema;

    private \App\Models\Organization $org;
    private string $token;
    private \App\Models\LoyaltyMember $member;
    private \App\Models\Service $service;
    private \App\Models\ServiceMaster $master;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpServiceBookingSchema();
        $this->setUpLoyaltySchema();
        foreach (['special_offers' => ['code' => 'string', 'applies_to' => 'string'], 'member_offers' => ['used_reference' => 'string'], 'tier_benefits' => ['applies_to' => 'string']] as $table => $cols) {
            foreach ($cols as $col => $type) if (!Schema::hasColumn($table, $col)) Schema::table($table, fn ($t) => $t->{$type}($col)->nullable());
        }
        $this->org = $this->tenant();
        ['token' => $this->token, 'member' => $this->member] = $this->member($this->org);
        ['service' => $this->service, 'master' => $this->master] = $this->seedBookableService($this->org->id);
        $this->travelTo(now()->next('Monday')->setTime(8, 0));
    }

    private function setting(string $key, string $value): void
    {
        HotelSetting::withoutGlobalScopes()->updateOrCreate(['organization_id' => $this->org->id, 'key' => $key], ['value' => $value, 'group' => 'booking']);
        HotelSetting::flushCacheFor($this->org->id);
    }

    private function body(array $extra = []): array
    {
        return array_merge(['service_id' => $this->service->id, 'master_id' => $this->master->id, 'start_at' => now()->setTime(10, 0)->toIso8601String(), 'party_size' => 1], $extra);
    }

    private function tenPercent(): void
    {
        $def = \App\Models\BenefitDefinition::create(['organization_id' => $this->org->id, 'name' => '10% off treatments', 'code' => 'ten', 'category' => 'discount', 'is_active' => true]);
        TierBenefit::create(['organization_id' => $this->org->id, 'tier_id' => $this->member->tier_id, 'benefit_id' => $def->id, 'value_type' => 'percent_discount', 'value_amount' => 10, 'applies_to' => 'services', 'is_active' => true]);
    }

    private function claim(float $value, string $type = 'fixed_amount'): MemberOffer
    {
        $offer = SpecialOffer::withoutGlobalScopes()->create(['organization_id' => $this->org->id, 'title' => "$value off", 'description' => '-', 'type' => $type, 'value' => $value, 'start_date' => now()->subDay()->toDateString(), 'end_date' => now()->addDays(3)->toDateString(), 'is_active' => true]);
        return MemberOffer::create(['organization_id' => $this->org->id, 'member_id' => $this->member->id, 'offer_id' => $offer->id, 'status' => 'claimed', 'claimed_at' => now()]);
    }

    /** Stripe enabled in EUR with a mock that records what it was asked to create. */
    private function stripe(bool $enabled = true, string $currency = 'eur'): Mockery\MockInterface
    {
        $stripe = Mockery::mock(StripeService::class);
        $stripe->shouldReceive('isEnabled')->andReturn($enabled);
        $stripe->shouldReceive('currency')->andReturn($currency);
        $stripe->shouldReceive('publishableKey')->andReturn('pk_test_x');
        $this->app->instance(StripeService::class, $stripe);
        return $stripe;
    }

    public function test_quote_itemises_the_member_price_and_reports_pay_at_venue_without_stripe(): void
    {
        $this->tenPercent();
        $res = $this->withToken($this->token)->postJson('/api/v1/member/portal/services/quote', $this->body())->assertOk();
        $res->assertJsonPath('list_amount', 60)->assertJsonPath('discount.amount', 6)->assertJsonPath('discount.source', 'tier_benefit')->assertJsonPath('total_amount', 54)->assertJsonPath('payment.mode', 'at_venue')->assertJsonPath('payment.reason', 'payments_off')->assertJsonPath('currency', 'EUR')->assertJsonPath('master.id', $this->master->id);
    }

    public function test_a_selected_coupon_beats_the_benefit_or_is_reported_outbid(): void
    {
        $this->tenPercent();
        $big = $this->claim(20);
        $this->withToken($this->token)->postJson('/api/v1/member/portal/services/quote', $this->body(['coupon' => ['member_offer_id' => $big->id]]))->assertOk()->assertJsonPath('total_amount', 40)->assertJsonPath('coupon.status', 'applied');
        $small = $this->claim(2);
        $this->withToken($this->token)->postJson('/api/v1/member/portal/services/quote', $this->body(['coupon' => ['member_offer_id' => $small->id]]))->assertOk()->assertJsonPath('total_amount', 54)->assertJsonPath('coupon.status', 'outbid');
    }

    public function test_a_taken_slot_and_a_bad_coupon_answer_their_codes(): void
    {
        ServiceBooking::create(['organization_id' => $this->org->id, 'service_id' => $this->service->id, 'service_master_id' => $this->master->id, 'customer_name' => 'X', 'customer_email' => 'x@example.test', 'start_at' => now()->setTime(10, 0), 'end_at' => now()->setTime(10, 45), 'duration_minutes' => 45, 'service_price' => 60, 'total_amount' => 60, 'currency' => 'EUR', 'status' => 'confirmed', 'payment_status' => 'unpaid']);
        $this->withToken($this->token)->postJson('/api/v1/member/portal/services/quote', $this->body())->assertStatus(409)->assertJsonPath('error', 'slot_taken');
        $this->withToken($this->token)->postJson('/api/v1/member/portal/services/quote', $this->body(['start_at' => now()->setTime(11, 0)->toIso8601String(), 'coupon' => ['member_offer_id' => 424242]]))->assertStatus(422)->assertJsonPath('error', 'coupon_not_found');
    }

    public function test_a_currency_mismatch_quotes_pay_at_venue(): void
    {
        $this->setting('booking_payment_enabled', 'true');
        $this->stripe(true, 'gbp');
        $this->withToken($this->token)->postJson('/api/v1/member/portal/services/quote', $this->body())->assertOk()->assertJsonPath('payment.mode', 'at_venue')->assertJsonPath('payment.reason', 'currency_mismatch');
        $this->withToken($this->token)->postJson('/api/v1/member/portal/services/payment-intent', $this->body())->assertStatus(409)->assertJsonPath('error', 'pay_at_venue');
    }

    public function test_payment_intent_is_created_for_the_discounted_total_with_the_members_metadata(): void
    {
        $this->tenPercent();
        $stripe = $this->stripe();
        $stripe->shouldReceive('createPaymentIntent')->once()->withArgs(function (float $amount, string $desc, array $meta) {
            return $amount === 54.0 && $meta['org_id'] === $this->org->id && $meta['member_id'] === $this->member->id && $meta['kind'] === 'portal_service_booking';
        })->andReturn(['client_secret' => 'pi_1_secret', 'payment_intent_id' => 'pi_1']);
        $this->withToken($this->token)->postJson('/api/v1/member/portal/services/payment-intent', $this->body())->assertOk()->assertJsonPath('payment_intent_id', 'pi_1')->assertJsonPath('amount', 54);
    }

    public function test_stripe_failure_at_payment_intent_answers_503(): void
    {
        $stripe = $this->stripe();
        $stripe->shouldReceive('createPaymentIntent')->andThrow(new \RuntimeException('stripe down'));
        $this->withToken($this->token)->postJson('/api/v1/member/portal/services/payment-intent', $this->body())->assertStatus(503)->assertJsonPath('error', 'payment_unavailable');
    }
}
```

`booking_payment_enabled` is read by `StripeService::boot()`, which the mock replaces, so `isEnabled()` is entirely the mock's answer; the `setting()` call in the mismatch test is belt and braces. Read `PortalBootstrapTest.php:280` (`test_online_payment_needs_stripe_and_a_matching_currency_per_booking_kind`) for how that suite mocks Stripe and copy its shape if it differs.

- [ ] **Step 2: Run them to verify they fail**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Member/Portal/PortalServiceBookingTest.php`
Expected: FAIL — 404 on the quote route.

- [ ] **Step 3: Implement `buildQuote()`, `quote()`, `paymentIntent()`**

```php
private const QUOTE_RULES = [
    'service_id' => 'required|integer', 'master_id' => 'nullable|integer', 'start_at' => 'required|date',
    'party_size' => 'nullable|integer|min:1|max:10', 'extras' => 'nullable|array|max:20',
    'extras.*.id' => 'required_with:extras|integer', 'extras.*.quantity' => 'nullable|integer|min:1|max:10',
    'coupon' => 'nullable|array', 'coupon.member_offer_id' => 'nullable|integer', 'coupon.redemption_id' => 'nullable|integer',
];

public function quote(Request $request, ServiceQuoteBuilder $builder): JsonResponse
{
    $data = $request->validate(self::QUOTE_RULES);
    try {
        return response()->json($this->quotePayload($this->buildQuote($request, $data, $builder)), 200, [], JSON_PRESERVE_ZERO_FRACTION);
    } catch (\Throwable $e) {
        return $this->quoteError($e);
    }
}

public function paymentIntent(Request $request, ServiceQuoteBuilder $builder, StripeService $stripe): JsonResponse
{
    $data = $request->validate(self::QUOTE_RULES);
    $member = $this->provisioner->ensureForUser($request->user());
    if (!$member) return response()->json(['error' => 'no_membership', 'message' => 'Your membership is not set up yet.'], 422);
    try {
        $b = $this->buildQuote($request, $data, $builder);
    } catch (\Throwable $e) {
        return $this->quoteError($e);
    }
    if ($b['payment']['mode'] !== 'online') return response()->json(['error' => 'pay_at_venue', 'message' => 'This venue takes payment at the venue.'], 409);
    $total = $b['pricing']->total;
    if ($total <= 0) return response()->json(['error' => 'nothing_to_pay', 'message' => 'There is nothing to pay online for this booking.'], 409);
    try {
        $pi = $stripe->createPaymentIntent($total, "Service booking: {$b['service']->name}", [
            'kind' => 'portal_service_booking', 'org_id' => (int) app('current_organization_id'), 'member_id' => (int) $member->id,
            'service_id' => (int) $b['service']->id, 'start_at' => $b['q']['start']->toIso8601String(), 'total' => number_format($total, 2, '.', ''),
        ]);
    } catch (\Throwable $e) {
        \Log::warning('portal.payment_intent_failed', ['org' => app('current_organization_id'), 'error' => $e->getMessage()]);
        return response()->json(['error' => 'payment_unavailable', 'message' => 'Online payment is unavailable right now. Please try again in a moment.'], 503);
    }
    return response()->json(['client_secret' => $pi['client_secret'], 'payment_intent_id' => $pi['payment_intent_id'], 'amount' => $total, 'currency' => $b['pricing']->currency], 200, [], JSON_PRESERVE_ZERO_FRACTION);
}

/** @throws \RuntimeException|ExtraLeadTimeException|CouponException */
private function buildQuote(Request $request, array $data, ServiceQuoteBuilder $builder): array
{
    $service = $this->service((int) $data['service_id']);
    if ($service instanceof JsonResponse) throw new ModelNotFoundException();
    $q = $builder->build($service, $data['master_id'] ?? null, $data['start_at'], (int) ($data['party_size'] ?? 1), $data['extras'] ?? []);
    $member = $this->loyaltyMember($request);
    $pricing = $member
        ? $this->pricing->quote($member, $q['list_total'], $q['currency'], BookingScope::Services, CouponSelection::fromArray($data['coupon'] ?? null))
        : $this->pricing->quoteWithoutMember($q['list_total'], $q['currency']);
    if (!$member && !empty($data['coupon'])) throw new CouponException('coupon_not_found', 'Coupons need an active membership.');
    return [
        'service' => $service, 'q' => $q, 'pricing' => $pricing,
        'payment' => PortalBootstrap::paymentMode($q['currency']),
        'policy'  => ['cancellation_policy' => HotelSetting::getValue('services_cancellation_policy') ?: null, 'cancel_hours' => (int) HotelSetting::getValue('services_cancel_hours', 24)],
    ];
}

private function quotePayload(array $b): array
{
    $q = $b['q'];
    return [
        'service' => ['id' => $b['service']->id, 'name' => $b['service']->name, 'duration_minutes' => $q['duration_minutes']],
        'master' => $q['master'] ? ['id' => $q['master']->id, 'name' => $q['master']->name] : null,
        'start_at' => $q['start']->toIso8601String(), 'end_at' => $q['end']->toIso8601String(), 'duration_minutes' => $q['duration_minutes'],
        'lines' => ['service_price' => $q['service_price'], 'extras' => $q['extras'], 'extras_total' => $q['extras_total']],
    ] + $b['pricing']->toArray() + ['payment' => $b['payment'], 'policy' => $b['policy']];
}

private function quoteError(\Throwable $e): JsonResponse
{
    return match (true) {
        $e instanceof CouponException      => response()->json(['error' => $e->errorCode, 'message' => $e->sentence()], 422),
        $e instanceof ExtraLeadTimeException => response()->json(['error' => 'extra_lead_time', 'message' => $e->getMessage()], 422),
        $e instanceof ModelNotFoundException => response()->json(['error' => 'not_found', 'message' => 'We could not find that service.'], 404),
        $e instanceof \RuntimeException    => response()->json(['error' => 'slot_taken', 'message' => 'That time was just taken. Please pick another.'], 409),
        default => throw $e,
    };
}
```

`PortalBootstrap::paymentMode(string $currency): array` — `['mode' => 'online'|'at_venue', 'reason' => null|'payments_off'|'mock_mode'|'currency_mismatch']`, built from the existing capability code (`:81-109`); `capabilities()` then uses it for both kinds. Routes: `Route::post('services/quote', …)`, `Route::post('services/payment-intent', …)->middleware('throttle:30,1')`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Member/Portal/`
Expected: `Tests: 6 passed` for this file; the portal suite otherwise unchanged.

- [ ] **Step 5: Commit**

```bash
git add app/Http/Controllers/Api/V1/Member/Portal/PortalServiceBookingController.php app/Services/Portal/PortalBootstrap.php routes/api.php tests/Feature/Member/Portal/PortalServiceBookingTest.php
git commit -m "Quote a member's service booking and open a payment intent for the discounted total

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Confirm — lock, recompute, PaymentIntent checks, booking row, coupon, replay

**Files:**
- Modify: `app/Http/Controllers/Api/V1/Member/Portal/PortalServiceBookingController.php` (add `confirm()`), `app/Services/Portal/MemberBookingQuery.php` (`serviceDto` `:145-164`: `discount` from the columns, `notes` unchanged), `routes/api.php`
- Test: `tests/Feature/Member/Portal/PortalServiceBookingTest.php` (confirm cases)

**Interfaces:**
- Consumes: `AdvisoryLock::transaction()`, `buildQuote()`, `MemberPricing::{columns, consume}`, `GuestMemberLinkService::ensureGuestForMember()`, `StripeService::{retrievePaymentIntent, cancelPaymentIntent}`, `ServiceBookingSubmission`, `MemberBookingQuery::serviceDto()`.
- Produces: `POST member/portal/services/confirm` body = `QUOTE_RULES` + `['payment_intent_id' => 'nullable|string|max:255', 'notes' => 'nullable|string|max:2000']`; header `Idempotency-Key` required (8–80 chars; missing → 422 `idempotency_key_required`). Flow:
  1. Replay: a `service_booking_submissions` row with this key, `outcome = 'success'`, this org and `customer_email = member email` → 200 `{booking: serviceDto(...), replayed: true}`; same key with a **different** request body hash (`sha256` of the canonical JSON of the validated body, stored in `request_payload._hash`) → 409 `{error: 'idempotency_conflict'}`.
  2. `member = ensureForUser()` (null → 422 `no_membership`).
  3. Outside the lock: `buildQuote()` once to learn the payment mode; if `online` and no `payment_intent_id` → 422 `payment_required`. If `payment_intent_id`: `retrievePaymentIntent()`; require `metadata.org_id == org`, `metadata.member_id == member`, `status ∈ {succeeded, requires_capture}`, and `amount == round(total * 100)` — any mismatch → cancel the PI (`cancelPaymentIntent($id, 'mismatch')`, best effort) and 409 `payment_mismatch`. (Recompute inside the lock and compare again, see 4.)
  4. `AdvisoryLock::transaction("svcm:{$masterId}"` or `"svc:{$serviceId}"`, fn): re-run `buildQuote()` (slot re-check + pricing recompute); if a PI was given and the recomputed total differs from the PI amount → throw a `PaymentMismatch` (private exception class in the controller file) that the outer catch turns into the 409 above; create `ServiceBooking` with `organization_id`, `brand_id` (the member's default brand if the model has one; null otherwise), `service_id`, `service_master_id`, `guest_id = ensureGuestForMember(member)->id`, `member_id`, `customer_name/email/phone` from the user, `party_size`, `start_at/end_at/duration_minutes`, `service_price`, `extras_total`, `currency`, `MemberPricing::columns()`, `status = services_require_staff_confirmation ? 'pending' : 'confirmed'`, `payment_status = online ? (pi status succeeded ? 'paid' : 'authorized') : 'unpaid'`, `stripe_payment_intent_id`, `source = 'member_portal'`, `customer_notes = notes`; the extras rows (`ServiceBookingExtra` with `service_booking_id, service_extra_id, name, unit_price, quantity, line_total`); `MemberPricing::consume(pricing, reference)`; the submission row (`idempotency_key, source 'member_portal', outcome 'success', service_booking_id, customer_email, customer_name, request_payload (validated body + _hash), response_payload (the DTO)`).
  5. After commit: Task 10's side effects (a protected `afterConfirm(ServiceBooking, bool $online)` hook that Task 10 fills; in this task it only calls `capturePaymentIntentIfNeeded`-equivalent: nothing — capture is left to the cron, spec §6.4).
  6. 201 `{booking: serviceDto, replayed: false}`.
  Failures inside the lock: `RuntimeException` (slot) → 409 `slot_taken`; `CouponException` → 422; `PaymentMismatch` → cancel PI, 409; anything else → log, 500 `{error: 'confirm_failed'}` — each also writes a submission row with `outcome = 'failed'` and `error_message` (same shape as `ServicePublicController::logSubmission()` `:864-882`).
- Produces: `MemberBookingQuery::serviceDto()` returns `discount: {amount: float, label: string} | null` from `discount_amount > 0` (`label` = `discount_label ?? 'Member discount'`), and `total` stays `total_amount`.

- [ ] **Step 1: Add the failing confirm tests**

```php
    private function confirm(array $body, string $key = 'idem-key-0001')
    {
        return $this->withToken($this->token)->withHeader('Idempotency-Key', $key)->postJson('/api/v1/member/portal/services/confirm', $body);
    }

    public function test_confirm_writes_the_member_guest_source_and_discount_and_consumes_the_coupon_once(): void
    {
        $this->tenPercent();
        $claim = $this->claim(20);
        $res = $this->confirm($this->body(['coupon' => ['member_offer_id' => $claim->id], 'notes' => 'Window seat']))->assertStatus(201);
        $res->assertJsonPath('replayed', false)->assertJsonPath('booking.kind', 'service')->assertJsonPath('booking.total', 40)->assertJsonPath('booking.discount.amount', 20)->assertJsonPath('booking.status', 'confirmed')->assertJsonPath('booking.payment_status', 'unpaid');

        $b = ServiceBooking::withoutGlobalScopes()->first();
        $this->assertSame($this->member->id, (int) $b->member_id);
        $this->assertNotNull($b->guest_id);
        $this->assertSame('member_portal', $b->source);
        $this->assertSame('offer', $b->discount_source);
        $this->assertSame(60.0, (float) $b->list_amount);
        $this->assertSame('Window seat', $b->customer_notes);
        $this->assertSame($b->booking_reference, MemberOffer::find($claim->id)->used_reference);
    }

    public function test_replay_returns_the_same_booking_and_consumes_once(): void
    {
        $claim = $this->claim(20);
        $body = $this->body(['coupon' => ['member_offer_id' => $claim->id]]);
        $first = $this->confirm($body)->assertStatus(201)->json('booking.id');
        $again = $this->confirm($body)->assertOk();
        $this->assertSame($first, $again->json('booking.id'));
        $this->assertTrue($again->json('replayed'));
        $this->assertSame(1, ServiceBooking::withoutGlobalScopes()->count());
        $this->assertSame(1, MemberOffer::whereNotNull('used_at')->count());
    }

    public function test_a_replayed_key_with_a_different_body_is_refused(): void
    {
        $this->confirm($this->body())->assertStatus(201);
        $this->confirm($this->body(['start_at' => now()->setTime(12, 0)->toIso8601String()]))->assertStatus(409)->assertJsonPath('error', 'idempotency_conflict');
    }

    public function test_an_outbid_coupon_is_not_consumed_at_confirm(): void
    {
        $this->tenPercent();
        $small = $this->claim(2);
        $this->confirm($this->body(['coupon' => ['member_offer_id' => $small->id]]))->assertStatus(201)->assertJsonPath('booking.total', 54);
        $this->assertNull(MemberOffer::find($small->id)->used_at);
    }

    public function test_a_slot_race_answers_409_and_writes_nothing(): void
    {
        $this->confirm($this->body(), 'key-a')->assertStatus(201);
        $this->confirm($this->body(), 'key-b')->assertStatus(409)->assertJsonPath('error', 'slot_taken');
        $this->assertSame(1, ServiceBooking::withoutGlobalScopes()->count());
    }

    public function test_staff_confirmation_setting_makes_the_booking_pending(): void
    {
        $this->setting('services_require_staff_confirmation', 'true');
        $this->confirm($this->body())->assertStatus(201)->assertJsonPath('booking.status', 'pending');
    }

    public function test_online_mode_requires_a_payment_intent_and_checks_it(): void
    {
        $this->tenPercent();
        $stripe = $this->stripe();
        $this->confirm($this->body())->assertStatus(422)->assertJsonPath('error', 'payment_required');

        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_ok')->andReturn(['id' => 'pi_ok', 'status' => 'requires_capture', 'amount' => 5400, 'currency' => 'eur', 'metadata' => ['org_id' => (string) $this->org->id, 'member_id' => (string) $this->member->id]]);
        $this->confirm($this->body(['payment_intent_id' => 'pi_ok']))->assertStatus(201)->assertJsonPath('booking.payment_status', 'authorized');
        $this->assertSame('pi_ok', ServiceBooking::withoutGlobalScopes()->first()->stripe_payment_intent_id);
    }

    public function test_a_payment_intent_for_another_org_member_or_amount_is_refused(): void
    {
        $stripe = $this->stripe();
        $stripe->shouldReceive('cancelPaymentIntent')->times(3);
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_org')->andReturn(['status' => 'requires_capture', 'amount' => 6000, 'metadata' => ['org_id' => '999', 'member_id' => (string) $this->member->id]]);
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_member')->andReturn(['status' => 'requires_capture', 'amount' => 6000, 'metadata' => ['org_id' => (string) $this->org->id, 'member_id' => '999']]);
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_amount')->andReturn(['status' => 'requires_capture', 'amount' => 100, 'metadata' => ['org_id' => (string) $this->org->id, 'member_id' => (string) $this->member->id]]);
        foreach (['pi_org', 'pi_member', 'pi_amount'] as $i => $id) {
            $this->confirm($this->body(['payment_intent_id' => $id]), "key-$i")->assertStatus(409)->assertJsonPath('error', 'payment_mismatch');
        }
        $this->assertSame(0, ServiceBooking::withoutGlobalScopes()->count());
    }

    public function test_the_bookings_list_shows_the_new_booking_with_its_discount(): void
    {
        $this->tenPercent();
        $this->confirm($this->body())->assertStatus(201);
        $this->withToken($this->token)->getJson('/api/v1/member/portal/bookings?scope=upcoming')->assertOk()->assertJsonPath('data.0.discount.amount', 6)->assertJsonPath('data.0.total', 54);
    }
```

`retrievePaymentIntent()`'s real return shape: read `StripeService::retrievePaymentIntent()` — if it returns a Stripe `PaymentIntent` object rather than an array, build the mock returns with `\Stripe\PaymentIntent::constructFrom([...])` and read fields with `->status`, `->amount`, `->metadata['org_id']`; adapt the controller code below to the real shape.

- [ ] **Step 2: Run them to verify they fail**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Member/Portal/PortalServiceBookingTest.php`
Expected: the 9 new cases FAIL (404 on confirm); the 6 earlier pass.

- [ ] **Step 3: Implement `confirm()`**

```php
public function confirm(Request $request, ServiceQuoteBuilder $builder, StripeService $stripe, GuestMemberLinkService $guests): JsonResponse
{
    $data = $request->validate(self::QUOTE_RULES + ['payment_intent_id' => 'nullable|string|max:255', 'notes' => 'nullable|string|max:2000']);
    $key = trim((string) $request->header('Idempotency-Key'));
    if (strlen($key) < 8 || strlen($key) > 80) return response()->json(['error' => 'idempotency_key_required', 'message' => 'Send an Idempotency-Key header of 8 to 80 characters.'], 422);
    $orgId = (int) app('current_organization_id');
    $user = $request->user();
    $hash = hash('sha256', json_encode($this->canonical($data)));

    $prior = ServiceBookingSubmission::withoutGlobalScopes()->where('organization_id', $orgId)->where('idempotency_key', $key)->where('customer_email', $user->email)->where('outcome', 'success')->latest('id')->first();
    if ($prior) {
        if (($prior->request_payload['_hash'] ?? null) !== $hash) return response()->json(['error' => 'idempotency_conflict', 'message' => 'This key was already used for a different booking.'], 409);
        $booking = ServiceBooking::withoutGlobalScopes()->find($prior->service_booking_id);
        return response()->json(['booking' => $booking ? MemberBookingQuery::serviceDto($booking) : null, 'replayed' => true], 200, [], JSON_PRESERVE_ZERO_FRACTION);
    }

    $member = $this->provisioner->ensureForUser($user);
    if (!$member) return response()->json(['error' => 'no_membership', 'message' => 'Your membership is not set up yet.'], 422);

    try {
        $pre = $this->buildQuote($request, $data, $builder);
    } catch (\Throwable $e) {
        return $this->quoteError($e);
    }
    $online = $pre['payment']['mode'] === 'online' && $pre['pricing']->total > 0;
    $piId = $data['payment_intent_id'] ?? null;
    if ($online && !$piId) return response()->json(['error' => 'payment_required', 'message' => 'Please complete the payment first.'], 422);
    $pi = null;
    if ($piId) {
        $pi = $this->verifiedIntent($stripe, $piId, $orgId, (int) $member->id, $pre['pricing']->total);
        if ($pi instanceof JsonResponse) return $pi;
    }

    $masterId = $data['master_id'] ?? null;
    $lockKey = $masterId ? "svcm:{$masterId}" : "svc:{$data['service_id']}";
    try {
        $booking = AdvisoryLock::transaction($lockKey, function () use ($request, $data, $builder, $member, $guests, $pi, $piId, $online, $user, $orgId, $key, $hash) {
            $b = $this->buildQuote($request, $data, $builder);
            if ($pi && (int) round($b['pricing']->total * 100) !== (int) $this->intentAmount($pi)) throw new PaymentMismatch();
            $q = $b['q'];
            $requireStaff = filter_var(HotelSetting::getValue('services_require_staff_confirmation', false), FILTER_VALIDATE_BOOLEAN);
            $booking = ServiceBooking::create([
                'organization_id' => $orgId, 'service_id' => $b['service']->id, 'service_master_id' => $q['master']?->id,
                'guest_id' => $guests->ensureGuestForMember($member)->id, 'member_id' => $member->id,
                'customer_name' => $user->name, 'customer_email' => $user->email, 'customer_phone' => $user->phone,
                'party_size' => (int) ($data['party_size'] ?? 1), 'start_at' => $q['start'], 'end_at' => $q['end'], 'duration_minutes' => $q['duration_minutes'],
                'service_price' => $q['service_price'], 'extras_total' => $q['extras_total'], 'currency' => $q['currency'],
                'status' => $requireStaff ? 'pending' : 'confirmed',
                'payment_status' => $online ? ($this->intentStatus($pi) === 'succeeded' ? 'paid' : 'authorized') : 'unpaid',
                'stripe_payment_intent_id' => $piId, 'source' => 'member_portal', 'customer_notes' => $data['notes'] ?? null,
            ] + $this->pricing->columns($b['pricing']));
            foreach ($q['extras'] as $line) {
                ServiceBookingExtra::create(['service_booking_id' => $booking->id, 'service_extra_id' => $line['id'], 'name' => $line['name'], 'unit_price' => $line['unit_price'], 'quantity' => $line['quantity'], 'line_total' => $line['line_total']]);
            }
            $this->pricing->consume($b['pricing'], $booking->booking_reference);
            $dto = MemberBookingQuery::serviceDto($booking->fresh(['service', 'master']));
            ServiceBookingSubmission::create(['organization_id' => $orgId, 'idempotency_key' => $key, 'source' => 'member_portal', 'outcome' => 'success', 'service_booking_id' => $booking->id, 'customer_email' => $user->email, 'customer_name' => $user->name, 'request_payload' => $data + ['_hash' => $hash], 'response_payload' => $dto]);
            return $booking;
        });
    } catch (PaymentMismatch) {
        $this->cancelQuietly($stripe, $piId);
        $this->logFailure($orgId, $key, $data, $user, 'payment_mismatch');
        return response()->json(['error' => 'payment_mismatch', 'message' => 'The payment no longer matches the price. Please pay again.'], 409);
    } catch (CouponException | ExtraLeadTimeException | \RuntimeException $e) {
        $this->logFailure($orgId, $key, $data, $user, $e->getMessage());
        return $this->quoteError($e);
    } catch (\Throwable $e) {
        \Log::error('portal.confirm_failed', ['org' => $orgId, 'error' => $e->getMessage()]);
        $this->logFailure($orgId, $key, $data, $user, $e->getMessage());
        return response()->json(['error' => 'confirm_failed', 'message' => 'We could not complete the booking. Please try again.'], 500);
    }

    $this->afterConfirm($booking->fresh(['service', 'master', 'extras']), $online);
    return response()->json(['booking' => MemberBookingQuery::serviceDto($booking->fresh(['service', 'master'])), 'replayed' => false], 201, [], JSON_PRESERVE_ZERO_FRACTION);
}

/** Side effects after commit (emails, realtime, audit) — filled in by the next task. */
protected function afterConfirm(ServiceBooking $booking, bool $online): void {}

private function verifiedIntent(StripeService $stripe, string $piId, int $orgId, int $memberId, float $total): mixed
{
    try { $pi = $stripe->retrievePaymentIntent($piId); } catch (\Throwable) { $pi = null; }
    $meta = $pi ? $this->intentMetadata($pi) : [];
    $ok = $pi && in_array($this->intentStatus($pi), ['succeeded', 'requires_capture'], true)
        && (int) ($meta['org_id'] ?? 0) === $orgId && (int) ($meta['member_id'] ?? 0) === $memberId
        && (int) $this->intentAmount($pi) === (int) round($total * 100);
    if ($ok) return $pi;
    $this->cancelQuietly($stripe, $piId);
    return response()->json(['error' => 'payment_mismatch', 'message' => 'The payment does not match this booking. Please pay again.'], 409);
}

private function canonical(array $data): array { ksort($data); foreach ($data as $k => $v) if (is_array($v)) $data[$k] = $this->canonical($v); return $data; }
private function cancelQuietly(StripeService $stripe, ?string $piId): void { if ($piId) { try { $stripe->cancelPaymentIntent($piId, 'mismatch'); } catch (\Throwable) {} } }
private function intentStatus(mixed $pi): string { return is_array($pi) ? (string) ($pi['status'] ?? '') : (string) ($pi->status ?? ''); }
private function intentAmount(mixed $pi): int { return is_array($pi) ? (int) ($pi['amount'] ?? 0) : (int) ($pi->amount ?? 0); }
private function intentMetadata(mixed $pi): array { $m = is_array($pi) ? ($pi['metadata'] ?? []) : ($pi->metadata ?? []); return is_array($m) ? $m : (method_exists($m, 'toArray') ? $m->toArray() : (array) $m); }
private function logFailure(int $orgId, string $key, array $data, $user, string $error): void
{
    try { ServiceBookingSubmission::create(['organization_id' => $orgId, 'idempotency_key' => $key, 'source' => 'member_portal', 'outcome' => 'failed', 'customer_email' => $user->email, 'customer_name' => $user->name, 'request_payload' => $data, 'error_message' => mb_substr($error, 0, 1000)]); } catch (\Throwable) {}
}
```

Plus, at the bottom of the file: `final class PaymentMismatch extends \RuntimeException {}` (same namespace; catch it before the generic `RuntimeException` branch, as the code above does). `ServiceBookingSubmission` must cast `request_payload`/`response_payload` to array (check the model). Route: `Route::post('services/confirm', …)->middleware('throttle:30,1')`.

`MemberBookingQuery::serviceDto()`:

```php
'discount' => (float) $b->discount_amount > 0 ? ['amount' => round((float) $b->discount_amount, 2), 'label' => $b->discount_label ?: 'Member discount'] : null,
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Member/Portal/ tests/Feature/Booking/`
Expected: `Tests: 15 passed` for `PortalServiceBookingTest`; every other file unchanged.

- [ ] **Step 5: Commit**

```bash
git add app/Http/Controllers/Api/V1/Member/Portal/PortalServiceBookingController.php app/Services/Portal/MemberBookingQuery.php routes/api.php tests/Feature/Member/Portal/PortalServiceBookingTest.php
git commit -m "Confirm a member's service booking under the slot lock with the payment checked and the coupon consumed once

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: After confirm — emails (policy key fixed, discount line), venue notification, realtime, audit; retire the old endpoint

**Files:**
- Modify: `PortalServiceBookingController.php` (`afterConfirm()`), `app/Http/Controllers/Api/V1/ServicePublicController.php:687-690` (policy key), `app/Mail/ServiceBookingConfirmationMail.php` (+ `?float $discountAmount = null, ?string $discountLabel = null, ?string $paymentStatus = null` constructor params after `$industry`, passed to the view), `resources/views/emails/service-booking-confirmation.blade.php` (a discount row and a "paid / card held / pay at venue" line, `{{ }}` only), `routes/api.php` (remove `POST member/service-bookings`), delete `app/Http/Controllers/Api/V1/Member/MemberServiceBookingController.php`
- Test: `tests/Feature/Member/Portal/PortalServiceBookingTest.php` (two more cases), `tests/Feature/Mail/ServiceBookingConfirmationPolicyTest.php`

**Interfaces:**
- Consumes: `ServiceBookingConfirmationMail` ctor (`:26-47`), `AdminBookingNotificationMail` (kind `service`, as `ServicePublicController::sendServiceBookingEmails()` `:675-840` builds it — read it and reuse the same arguments), `AdminNotificationService::send($orgId, $mailable)`, `RealtimeEventService::dispatch(string $type, string $title, ?string $body, array $data, ?int $orgId)`, `AuditLog::create([...])`, `BookingMembershipMail` (not needed: the booker is already a member).
- Produces: `afterConfirm()` queues `ServiceBookingConfirmationMail` to the member with the discount line and payment wording, sends the venue notification, dispatches a realtime event `service_booking.created` titled `New appointment from the member portal`, and writes an audit row `service_booking.portal_confirmed`; every side effect is wrapped in `try/catch` + `Log::warning` so a mail failure never fails a confirmed booking. The widget's confirmation mail starts reading `services_cancellation_policy` (the key the admin saves).

- [ ] **Step 1: Write the failing tests**

Append to `PortalServiceBookingTest`:

```php
    public function test_confirm_queues_the_confirmation_mail_with_the_discount_and_notifies_the_venue(): void
    {
        \Illuminate\Support\Facades\Mail::fake();
        $this->tenPercent();
        $this->setting('services_cancellation_policy', 'Free cancellation up to 24 hours before.');
        $this->confirm($this->body())->assertStatus(201);
        \Illuminate\Support\Facades\Mail::assertQueued(\App\Mail\ServiceBookingConfirmationMail::class, function ($mail) {
            $html = $mail->render();
            return str_contains($html, 'Free cancellation up to 24 hours before.') && str_contains($html, '10% off treatments') && str_contains($html, 'Pay at the venue');
        });
    }

    public function test_the_old_member_service_booking_endpoint_is_gone(): void
    {
        $this->withToken($this->token)->postJson('/api/v1/member/service-bookings', $this->body())->assertStatus(404);
    }
```

`tests/Feature/Mail/ServiceBookingConfirmationPolicyTest.php` renders `ServiceBookingConfirmationMail` directly with `cancellationPolicy: 'X'` and `discountAmount: 6.0, discountLabel: 'Ten off', paymentStatus: 'authorized'` and asserts the rendered HTML contains `X`, `Ten off`, the formatted `6.00` and the words `Card held`; a second case with `discountAmount: null` asserts no discount row (assert the label string `Member discount` is absent). Read `tests/Feature/Mail/BookingMembershipMailTest.php` for the render pattern this suite uses.

If `Mail::assertQueued` cannot see the mail because the send path uses `AdminNotificationService`/`Mail::to()->queue()` differently, assert with `Mail::assertQueued` for the member mail and `Mail::assertSent`/`assertQueued` for `AdminBookingNotificationMail` according to how `AdminNotificationService::send()` dispatches (read it).

- [ ] **Step 2: Run them to verify they fail**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Member/Portal/PortalServiceBookingTest.php tests/Feature/Mail/ServiceBookingConfirmationPolicyTest.php`
Expected: FAIL — no mail queued; the old endpoint still answers 201/422.

- [ ] **Step 3: Implement**

`afterConfirm()`:

```php
protected function afterConfirm(ServiceBooking $booking, bool $online): void
{
    $orgId = (int) $booking->organization_id;
    $hotelName = (string) (\App\Models\Organization::withoutGlobalScopes()->whereKey($orgId)->value('name') ?? config('app.name'));
    $policy = HotelSetting::getValue('services_cancellation_policy') ?: null;
    try {
        \Illuminate\Support\Facades\Mail::to($booking->customer_email)->queue(new ServiceBookingConfirmationMail(
            guestName: $booking->customer_name, hotelName: $hotelName, bookingReference: $booking->booking_reference,
            serviceName: $booking->service?->name ?? 'Appointment', masterName: $booking->master?->name,
            startAt: $booking->start_at->toIso8601String(), durationMinutes: (int) $booking->duration_minutes, partySize: (int) $booking->party_size,
            servicePrice: (float) $booking->service_price, extrasTotal: (float) $booking->extras_total, grossTotal: (float) $booking->total_amount, currency: $booking->currency,
            extras: $booking->extras->map(fn ($e) => ['name' => $e->name, 'quantity' => $e->quantity, 'line_total' => (float) $e->line_total])->all(),
            cancellationPolicy: $policy, industry: PortalTheme::industryFor($orgId) /* or however phase 1 resolves the industry */,
            discountAmount: (float) $booking->discount_amount > 0 ? (float) $booking->discount_amount : null, discountLabel: $booking->discount_label, paymentStatus: $booking->payment_status,
        ));
    } catch (\Throwable $e) { \Log::warning('portal.confirm_mail_failed', ['booking' => $booking->id, 'error' => $e->getMessage()]); }
    try {
        app(AdminNotificationService::class)->send($orgId, new AdminBookingNotificationMail(/* the same arguments ServicePublicController::sendServiceBookingEmails() passes for kind 'service', from $booking */));
    } catch (\Throwable $e) { \Log::warning('portal.confirm_admin_mail_failed', ['booking' => $booking->id, 'error' => $e->getMessage()]); }
    try {
        app(RealtimeEventService::class)->dispatch('service_booking.created', 'New appointment from the member portal', "{$booking->customer_name} · {$booking->service?->name}", ['service_booking_id' => $booking->id, 'source' => 'member_portal'], $orgId);
    } catch (\Throwable $e) { \Log::warning('portal.confirm_realtime_failed', ['booking' => $booking->id, 'error' => $e->getMessage()]); }
    try {
        \App\Models\AuditLog::create(['organization_id' => $orgId, 'user_id' => null, 'action' => 'service_booking.portal_confirmed', 'description' => "Member portal booking {$booking->booking_reference}" . ($online ? ' (paid online)' : ' (pay at venue)')]);
    } catch (\Throwable) {}
}
```

Match the constructor argument names to `ServiceBookingConfirmationMail` (`:26-47`) and the industry resolver phase 1 uses (`PortalTheme`/`PortalBootstrap` — grep `industry` in `app/Services/Portal/`). In the Blade view add, after the totals rows:

```blade
@if (!empty($discountLabel) && !empty($discountAmount))
<tr><td class="lbl">{{ $discountLabel }}</td><td class="val">−{{ number_format($discountAmount, 2) }} {{ $currency }}</td></tr>
@endif
@if ($paymentStatus === 'paid')
<p>Paid online.</p>
@elseif ($paymentStatus === 'authorized')
<p>Card held — charged after your visit.</p>
@elseif ($paymentStatus === 'unpaid')
<p>Pay at the venue.</p>
@endif
```

(Use the view's existing row/paragraph classes; `{{ }}` only.) Change `ServicePublicController.php:689` to `'services_cancellation_policy'`. Remove the route at `routes/api.php:392` with a one-line comment (`// POST member/service-bookings retired 2026-09 (spec ruling portal-8): the portal books through member/portal/services/*`), delete the controller, run `view:clear`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan view:clear && /c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Member/ tests/Feature/Mail/ tests/Feature/Widget/`
Expected: all pass (`PortalServiceBookingTest` 17, Mail suite +2).

- [ ] **Step 5: Commit**

```bash
git add -A app/Http/Controllers/Api/V1/Member/Portal/PortalServiceBookingController.php app/Http/Controllers/Api/V1/ServicePublicController.php app/Mail/ServiceBookingConfirmationMail.php resources/views/emails/service-booking-confirmation.blade.php routes/api.php app/Http/Controllers/Api/V1/Member/MemberServiceBookingController.php tests/Feature/Member/Portal/PortalServiceBookingTest.php tests/Feature/Mail/ServiceBookingConfirmationPolicyTest.php
git commit -m "Send the member's confirmation with the discount and policy, notify the venue, retire the old member booking endpoint

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Points when a booking completes — `BookingPointsService`

**Files:**
- Create: `app/Services/Loyalty/BookingPointsService.php`
- Modify: `app/Services/LoyaltyService.php` (`pointsForSpend()` new; `calculateEarnedPoints()` `:385-411` delegates), `app/Http/Controllers/Api/V1/Admin/ServiceBookingController.php` (`bulk` `:206-245`, `updateStatus` `:432-470`)
- Test: `tests/Feature/Booking/BookingPointsServiceTest.php`, `tests/Feature/Admin/ServiceBookingPointsTest.php`

**Interfaces:**
- Produces: `LoyaltyService::pointsForSpend(LoyaltyMember $member, float $amount, ?int $propertyId = null, ?int $outletId = null): int` = `(int) floor($amount × points_per_currency × earnRate × bestActiveMultiplier × pointsMultiplierFor)` where `points_per_currency = (float) HotelSetting::getValue('points_per_currency', 1)` (≤ 0 → 1), `earnRate = (float) ($member->tier?->earn_rate ?? 1.0)` with the outlet override as today. `calculateEarnedPoints()` keeps its signature and returns `pointsForSpend($member, $amount, $propertyId, $outletId)`.
- Produces: `App\Services\Loyalty\BookingPointsService::awardForServiceBooking(ServiceBooking $booking): ?PointsTransaction` — returns null (no write) unless: `status === 'completed'`, `points_awarded_at === null`, `member_id` set and the member exists in the same org, `PortalBootstrap::loyaltyOn(org)`, `points_on_bookings` setting truthy (default true), `total_amount > 0`, `payment_status !== 'refunded'`. Awards via `awardPoints($member, $points, "Appointment {$booking->booking_reference}", 'earn', null, 'service_booking', $booking->id, (float) $booking->total_amount, null, null, 'booking_completed', 'service_booking', (string) $booking->id, "booking_points_service_{$booking->id}")` and stamps `points_awarded_at` (query-builder update, no events). Zero computed points → stamps `points_awarded_at` and returns null (so it is never retried). Runs the settings read under the booking's org (`app()->instance('current_organization_id', …)` is already bound in the admin request; the service must not assume it — pass the org explicitly to `HotelSetting` via `withoutGlobalScopes()->where('organization_id', …)->where('key', …)->value('value')`).
- Produces: `Admin\ServiceBookingController::updateStatus()` calls `app(BookingPointsService::class)->awardForServiceBooking($booking->fresh())` after its transaction when the resulting status is `completed`; `bulk()` does the same for each row after its transaction when `action` is `mark_complete` or `mark_status` with value `completed`. Both wrapped in `try/catch` + `Log::warning('service_booking.points_failed')`.

- [ ] **Step 1: Write the failing tests**

```php
<?php
// tests/Feature/Booking/BookingPointsServiceTest.php
namespace Tests\Feature\Booking;

use App\Models\HotelSetting;
use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Models\PointsTransaction;
use App\Models\ServiceBooking;
use App\Services\Loyalty\BookingPointsService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\Concerns\SetsUpServiceBookingSchema;
use Tests\TestCase;

class BookingPointsServiceTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema, SetsUpServiceBookingSchema;

    private int $orgId;
    private LoyaltyMember $member;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpMinimalSchema();
        $this->setUpLoyaltyAwardSchema(); // members, tiers, points_transactions, expiry buckets, audit, domain events — read SetsUpMinimalSchema:586
        $this->setUpServiceBookingSchema();
        $this->orgId = \App\Models\Organization::create(['name' => 'Numa', 'slug' => 'numa', 'industry' => 'beauty'])->id;
        app()->instance('current_organization_id', $this->orgId);
        $tier = LoyaltyTier::create(['organization_id' => $this->orgId, 'name' => 'Gold', 'min_points' => 0, 'earn_rate' => 1.5, 'is_active' => true]);
        $user = \App\Models\User::create(['name' => 'Ada', 'email' => 'ada@example.test', 'password' => bcrypt('secret-pass-1'), 'user_type' => 'member', 'organization_id' => $this->orgId]);
        $this->member = LoyaltyMember::create(['organization_id' => $this->orgId, 'user_id' => $user->id, 'tier_id' => $tier->id, 'member_number' => 'HL-1', 'current_points' => 0, 'lifetime_points' => 0]);
        HotelSetting::withoutGlobalScopes()->create(['organization_id' => $this->orgId, 'key' => 'points_per_currency', 'value' => '10']);
        HotelSetting::flushCacheFor($this->orgId);
    }

    private function booking(array $attrs = []): ServiceBooking
    {
        ['service' => $service, 'master' => $master] = $this->seedBookableService($this->orgId);
        return ServiceBooking::create(array_merge(['organization_id' => $this->orgId, 'service_id' => $service->id, 'service_master_id' => $master->id, 'member_id' => $this->member->id, 'customer_name' => 'Ada', 'customer_email' => 'ada@example.test', 'start_at' => now()->subDay(), 'end_at' => now()->subDay()->addMinutes(45), 'duration_minutes' => 45, 'service_price' => 60, 'total_amount' => 54, 'list_amount' => 60, 'discount_amount' => 6, 'currency' => 'EUR', 'status' => 'completed', 'payment_status' => 'paid', 'source' => 'member_portal'], $attrs));
    }

    public function test_it_awards_floor_of_paid_amount_times_base_times_tier_rate_once(): void
    {
        $b = $this->booking();
        $svc = app(BookingPointsService::class);
        $tx = $svc->awardForServiceBooking($b);
        $this->assertSame(810, $tx->points); // 54 × 10 × 1.5
        $this->assertSame('service_booking', $tx->reference_type);
        $this->assertNotNull($b->fresh()->points_awarded_at);
        $this->assertNull($svc->awardForServiceBooking($b->fresh()));
        $this->assertSame(1, PointsTransaction::where('member_id', $this->member->id)->count());
        $this->assertSame(810, (int) $this->member->fresh()->current_points);
    }

    public function test_nothing_is_awarded_unless_completed_and_enabled(): void
    {
        $svc = app(BookingPointsService::class);
        $this->assertNull($svc->awardForServiceBooking($this->booking(['status' => 'confirmed'])));
        HotelSetting::withoutGlobalScopes()->create(['organization_id' => $this->orgId, 'key' => 'points_on_bookings', 'value' => 'false']);
        HotelSetting::flushCacheFor($this->orgId);
        $this->assertNull($svc->awardForServiceBooking($this->booking()));
        $this->assertSame(0, PointsTransaction::count());
    }

    public function test_no_points_without_loyalty(): void
    {
        LoyaltyTier::where('organization_id', $this->orgId)->update(['is_active' => false]);
        \Illuminate\Support\Facades\Cache::flush();
        $this->assertNull(app(BookingPointsService::class)->awardForServiceBooking($this->booking()));
    }

    public function test_a_member_without_a_tier_still_earns_at_the_base_rate(): void
    {
        $this->member->forceFill(['tier_id' => null])->save();
        $tx = app(BookingPointsService::class)->awardForServiceBooking($this->booking());
        $this->assertSame(540, $tx->points); // 54 × 10 × 1.0
    }
}
```

```php
<?php
// tests/Feature/Admin/ServiceBookingPointsTest.php — bulk and single completion award once
```

Build it on the same fixture as `BookingPointsServiceTest` (extract a `tests/Concerns/SeedsPointsFixture.php` trait if cleaner) plus an admin caller (copy `staffUser()` from Task 4's test, with whatever permission the admin service-booking routes require — read `routes/api.php` around the `service-bookings` admin routes). Cases: `test_bulk_and_single_completion_award_once` — `POST /api/v1/admin/service-bookings/bulk {ids: [id], action: 'mark_complete'}` then `PATCH /api/v1/admin/service-bookings/{id}/status {status: 'completed'}`; assert exactly one `points_transactions` row. `test_the_widget_booking_without_a_member_earns_nothing` — a booking with `member_id = null` marked complete writes no row.

- [ ] **Step 2: Run them to verify they fail**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Booking/BookingPointsServiceTest.php tests/Feature/Admin/ServiceBookingPointsTest.php`
Expected: FAIL — class missing.

- [ ] **Step 3: Implement**

```php
<?php
// app/Services/Loyalty/BookingPointsService.php
namespace App\Services\Loyalty;

use App\Models\HotelSetting;
use App\Models\LoyaltyMember;
use App\Models\PointsTransaction;
use App\Models\ServiceBooking;
use App\Services\LoyaltyService;
use App\Services\Portal\PortalBootstrap;
use Illuminate\Support\Facades\DB;

/**
 * Points for a completed booking: paid amount × the venue's base rate × the
 * member's tier rate × any live multipliers, written once per booking under
 * the ledger's idempotency key and stamped on the booking.
 */
final class BookingPointsService
{
    public function __construct(private readonly LoyaltyService $loyalty) {}

    public function awardForServiceBooking(ServiceBooking $booking): ?PointsTransaction
    {
        $orgId = (int) $booking->organization_id;
        if ($booking->status !== 'completed' || $booking->points_awarded_at !== null || !$booking->member_id) return null;
        if ($booking->payment_status === 'refunded' || (float) $booking->total_amount <= 0) return null;
        if (!$this->enabled($orgId) || !PortalBootstrap::loyaltyOn($orgId)) return null;
        $member = LoyaltyMember::withoutGlobalScopes()->where('organization_id', $orgId)->whereKey($booking->member_id)->with('tier')->first();
        if (!$member) return null;

        $points = $this->loyalty->pointsForSpend($member, (float) $booking->total_amount);
        $tx = null;
        if ($points > 0) {
            $tx = $this->loyalty->awardPoints(
                $member, $points, "Appointment {$booking->booking_reference}", 'earn', null,
                'service_booking', $booking->id, (float) $booking->total_amount, null, null,
                'booking_completed', 'service_booking', (string) $booking->id, "booking_points_service_{$booking->id}",
            );
        }
        DB::table('service_bookings')->where('id', $booking->id)->update(['points_awarded_at' => now()]);
        return $tx;
    }

    private function enabled(int $orgId): bool
    {
        $raw = HotelSetting::withoutGlobalScopes()->where('organization_id', $orgId)->where('key', 'points_on_bookings')->value('value');
        return $raw === null || filter_var($raw, FILTER_VALIDATE_BOOLEAN);
    }
}
```

`LoyaltyService`:

```php
/** One formula for "how many points does this spend earn", null-safe on a member without a tier. */
public function pointsForSpend(LoyaltyMember $member, float $amount, ?int $propertyId = null, ?int $outletId = null): int
{
    $base = (float) HotelSetting::getValue('points_per_currency', 1);
    if ($base <= 0) $base = 1.0;
    $earnRate = (float) ($member->tier?->earn_rate ?? 1.0);
    if ($outletId) { $outlet = \App\Models\Outlet::find($outletId); if ($outlet?->earn_rate_override) $earnRate = (float) $outlet->earn_rate_override; }
    if ($earnRate <= 0) $earnRate = 1.0;
    $multiplier = $this->bestActiveMultiplier($member, $propertyId);
    $tierMultiplier = app(DiscountService::class)->pointsMultiplierFor($member, $propertyId);
    return (int) floor($amount * $base * $earnRate * $multiplier * $tierMultiplier);
}

public function calculateEarnedPoints(LoyaltyMember $member, float $amount, ?int $outletId = null, ?int $propertyId = null): int
{
    return $this->pointsForSpend($member, $amount, $propertyId, $outletId);
}
```

Admin controller: after `updateStatus()`'s transaction, `if (($data['status'] ?? null) === 'completed') { try { app(BookingPointsService::class)->awardForServiceBooking($booking->fresh()); } catch (\Throwable $e) { \Log::warning('service_booking.points_failed', ['id' => $booking->id, 'error' => $e->getMessage()]); } }`; in `bulk()`, after `DB::transaction`, `if ($validated['action'] === 'mark_complete' || ($validated['action'] === 'mark_status' && ($validated['value'] ?? null) === 'completed')) foreach ($rows as $b) { try { app(BookingPointsService::class)->awardForServiceBooking($b->fresh()); } catch (\Throwable $e) { \Log::warning(...); } }`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Booking/BookingPointsServiceTest.php tests/Feature/Admin/ServiceBookingPointsTest.php tests/Feature/Loyalty/`
Expected: `4 passed` + `2 passed`; Loyalty suite unchanged.

- [ ] **Step 5: Commit**

```bash
git add app/Services/Loyalty/BookingPointsService.php app/Services/LoyaltyService.php app/Http/Controllers/Api/V1/Admin/ServiceBookingController.php tests/Feature/Booking/BookingPointsServiceTest.php tests/Feature/Admin/ServiceBookingPointsTest.php
git commit -m "Award points once when a member's appointment is completed

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 12: Admin API — typed tier benefits, offer codes, reward discounts, booking exposure

**Files:**
- Modify: `app/Http/Controllers/Api/V1/Admin/BenefitAdminController.php` (`assignTierBenefit` `:96-137`), `app/Http/Controllers/Api/V1/Admin/OffersAdminController.php` (`store` `:40-60`, `update` `:80`), `app/Http/Controllers/Api/V1/Admin/RewardAdminController.php` (store/update validation), `app/Http/Controllers/Api/V1/Admin/ServiceBookingController.php` (index/show payloads), the tier listing endpoint `frontend/src/pages/Tiers.tsx` reads (find it by the URL the page calls)
- Test: `tests/Feature/Admin/TypedBenefitsTest.php`, `tests/Feature/Admin/OfferCodesTest.php`

**Interfaces:**
- Produces: `POST admin/tier-benefits` accepts `applies_to` (`in:all,services,stays`); **re-assigning without `value_type` keeps the stored typed value** (only a request that carries `value_type` changes `value_type`/`value_amount`); the response `tier_benefit` carries `applies_to`; the tier listing includes `value_type`, `value_amount`, `applies_to` per assigned benefit.
- Produces: offers `store`/`update` validate `code` (`nullable|string|min:4|max:24|regex:/^[A-Za-z0-9-]+$/`, stored upper-cased and trimmed, unique per organisation → 422 `{message: 'That code is already used by another offer.'}`), `applies_to` (`nullable|in:all,services,stays`), `per_member_limit`, `tier_ids` (`nullable|array`, each an id of one of the org's tiers), and `type` gains `fixed_amount`. `update` validates the same subset it accepts (today it is `$request->only()`, unvalidated) and keeps the image handling.
- Produces: rewards `store`/`update` accept `discount_type` (`nullable|in:percent_discount,fixed_amount`), `discount_value` (`nullable|numeric|min:0.01|max:100000`, ≤ 100 for percent → else 422), `applies_to`; `discount_value` is `required_with:discount_type`.
- Produces: admin service bookings `index`/`show` include `member: {id, name, member_number} | null`, `discount: {amount, label} | null`, `list_amount`, `source` — extend the existing payload without renaming keys.

- [ ] **Step 1: Write the failing tests**

```php
<?php
// tests/Feature/Admin/TypedBenefitsTest.php
namespace Tests\Feature\Admin;

use App\Models\BenefitDefinition;
use App\Models\LoyaltyTier;
use App\Models\TierBenefit;
use Illuminate\Support\Facades\Schema;
use Tests\Feature\Member\MemberEndpointTestCase;

class TypedBenefitsTest extends MemberEndpointTestCase
{
    use \Tests\Concerns\MakesAdminCaller; // the staffUser() helper from Task 4, moved into a trait: staffUser(Organization, array $can = []): User

    private \App\Models\Organization $org;
    private \App\Models\User $admin;
    private LoyaltyTier $tier;
    private BenefitDefinition $def;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltySchema();
        if (!Schema::hasColumn('tier_benefits', 'applies_to')) Schema::table('tier_benefits', fn ($t) => $t->string('applies_to', 12)->default('all'));
        $this->org = $this->tenant();
        $this->admin = $this->staffUser($this->org, ['can_manage_offers' => true]);
        $this->tier = LoyaltyTier::withoutGlobalScopes()->where('organization_id', $this->org->id)->firstOrFail();
        $this->def = BenefitDefinition::create(['organization_id' => $this->org->id, 'name' => 'Treatment discount', 'code' => 'treat', 'category' => 'discount', 'is_active' => true]);
    }

    private function assign(array $body)
    {
        return $this->actingAs($this->admin, 'sanctum')->postJson('/api/v1/admin/tier-benefits', array_merge(['tier_id' => $this->tier->id, 'benefit_id' => $this->def->id], $body));
    }

    public function test_a_typed_assignment_is_stored_and_survives_a_prose_only_reassign(): void
    {
        $this->assign(['value' => '10% off treatments', 'value_type' => 'percent_discount', 'value_amount' => 10, 'applies_to' => 'services'])->assertOk()->assertJsonPath('tier_benefit.applies_to', 'services');
        $this->assign(['value' => '10% off treatments (updated)'])->assertOk();
        $tb = TierBenefit::where('tier_id', $this->tier->id)->where('benefit_id', $this->def->id)->firstOrFail();
        $this->assertSame('percent_discount', $tb->value_type);
        $this->assertSame(10.0, (float) $tb->value_amount);
        $this->assertSame('services', $tb->applies_to);
        $this->assertSame('10% off treatments (updated)', $tb->value);
    }

    public function test_an_explicit_text_type_resets_the_amount(): void
    {
        $this->assign(['value_type' => 'fixed_amount', 'value_amount' => 5])->assertOk();
        $this->assign(['value_type' => 'text', 'value' => 'A warm welcome'])->assertOk();
        $tb = TierBenefit::where('tier_id', $this->tier->id)->firstOrFail();
        $this->assertSame('text', $tb->value_type);
        $this->assertNull($tb->value_amount);
    }

    public function test_a_reward_discount_is_validated(): void
    {
        $this->actingAs($this->admin, 'sanctum')->postJson('/api/v1/admin/rewards', ['name' => 'Big', 'points_cost' => 100, 'discount_type' => 'percent_discount', 'discount_value' => 150])->assertStatus(422);
        $this->actingAs($this->admin, 'sanctum')->postJson('/api/v1/admin/rewards', ['name' => 'Fifteen', 'points_cost' => 100, 'discount_type' => 'percent_discount', 'discount_value' => 15])->assertStatus(201)->assertJsonPath('reward.applies_to', 'all');
    }
}
```

```php
<?php
// tests/Feature/Admin/OfferCodesTest.php
namespace Tests\Feature\Admin;

use App\Models\SpecialOffer;
use Illuminate\Support\Facades\Schema;
use Tests\Feature\Member\MemberEndpointTestCase;

class OfferCodesTest extends MemberEndpointTestCase
{
    use \Tests\Concerns\MakesAdminCaller;

    private \App\Models\Organization $org;
    private \App\Models\User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltySchema();
        foreach (['code' => 'string', 'applies_to' => 'string'] as $col => $type) if (!Schema::hasColumn('special_offers', $col)) Schema::table('special_offers', fn ($t) => $t->{$type}($col)->nullable());
        $this->org = $this->tenant();
        $this->admin = $this->staffUser($this->org, ['can_manage_offers' => true]);
    }

    private function offer(array $body = [])
    {
        return $this->actingAs($this->admin, 'sanctum')->postJson('/api/v1/admin/offers', array_merge(['title' => 'Welcome', 'description' => 'Ten off', 'type' => 'discount', 'value' => 10, 'start_date' => now()->toDateString(), 'end_date' => now()->addDays(10)->toDateString()], $body));
    }

    public function test_a_code_is_stored_upper_cased_and_unique_per_venue(): void
    {
        $this->offer(['code' => ' welcome10 '])->assertStatus(201);
        $this->assertSame('WELCOME10', SpecialOffer::withoutGlobalScopes()->where('organization_id', $this->org->id)->value('code'));
        $this->offer(['code' => 'welcome10', 'title' => 'Again'])->assertStatus(422);

        $other = $this->tenant('Other');
        $otherAdmin = $this->staffUser($other, ['can_manage_offers' => true]);
        $this->actingAs($otherAdmin, 'sanctum')->postJson('/api/v1/admin/offers', ['title' => 'Welcome', 'description' => 'x', 'type' => 'discount', 'value' => 10, 'code' => 'WELCOME10', 'start_date' => now()->toDateString(), 'end_date' => now()->addDays(10)->toDateString()])->assertStatus(201);
    }

    public function test_fixed_amount_tier_targeting_and_scope_are_accepted(): void
    {
        $tier = \App\Models\LoyaltyTier::withoutGlobalScopes()->where('organization_id', $this->org->id)->firstOrFail();
        $id = $this->offer(['type' => 'fixed_amount', 'value' => 5, 'tier_ids' => [$tier->id], 'per_member_limit' => 1, 'applies_to' => 'services'])->assertStatus(201)->json('offer.id');
        $this->actingAs($this->admin, 'sanctum')->putJson("/api/v1/admin/offers/{$id}", ['applies_to' => 'stays'])->assertOk();
        $this->assertSame('stays', SpecialOffer::withoutGlobalScopes()->find($id)->applies_to);
    }
}
```

Read the admin offers/rewards routes and response shapes (`OffersAdminController::store` returns which key? `RewardAdminController::store`?) and adapt `json('offer.id')` / `assertJsonPath('reward.applies_to')` to the actual keys. `tests/Concerns/MakesAdminCaller.php` holds Task 4's `staffUser()` (move it there in this task and make Task 4's test use the trait).

- [ ] **Step 2: Run them to verify they fail**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Admin/TypedBenefitsTest.php tests/Feature/Admin/OfferCodesTest.php`
Expected: FAIL — the re-assign resets to text; the code is not stored.

- [ ] **Step 3: Implement**

`assignTierBenefit()` — replace `updateOrCreate` with:

```php
$tb = TierBenefit::firstOrNew(['tier_id' => $validated['tier_id'], 'benefit_id' => $validated['benefit_id'], 'property_id' => $validated['property_id'] ?? null]);
$tb->fill(['value' => $validated['value'] ?? $tb->value, 'custom_description' => $validated['custom_description'] ?? $tb->custom_description, 'is_active' => true]);
if ($request->has('value_type')) {
    $tb->value_type = $validated['value_type'] ?: 'text';
    $tb->value_amount = $tb->value_type === 'text' ? null : ($validated['value_amount'] ?? null);
}
if ($request->has('applies_to')) $tb->applies_to = $validated['applies_to'] ?: 'all';
if (!$tb->exists) { $tb->organization_id = app('current_organization_id'); $tb->value_type ??= 'text'; $tb->applies_to ??= 'all'; }
$tb->save();
```

with `'applies_to' => 'nullable|in:all,services,stays'` added to the rules. Offers — add the rules, normalise the code, check uniqueness (`SpecialOffer::withoutGlobalScopes()->where('organization_id', $orgId)->where('code', $code)->when(isset($offer), fn ($q) => $q->whereKeyNot($offer->id))->exists()` → 422), validate `tier_ids.*` against `LoyaltyTier::where('organization_id', $orgId)->pluck('id')`; extend `type` with `fixed_amount`; do the same in `update()` with `sometimes` rules. Rewards — the three rules plus the ≤ 100 guard. Service bookings — `->with(['member.user'])` and the three keys.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Admin/ tests/Feature/Loyalty/`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add app/Http/Controllers/Api/V1/Admin/ tests/Feature/Admin/TypedBenefitsTest.php tests/Feature/Admin/OfferCodesTest.php tests/Concerns/MakesAdminCaller.php tests/Feature/Loyalty/OfferSecurityTest.php
git commit -m "Let admins type benefits, code offers and price rewards without losing what they saved

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: `loyalty:type-benefits` and typed presets

**Files:**
- Create: `app/Console/Commands/TypeBenefits.php`
- Modify: `app/Services/LoyaltyPresetService.php` (where presets create perk rows — grep `off` / `BenefitDefinition::create` in it; add a `TierBenefit` with `value_type`, `value_amount`, `applies_to` for every money-shaped perk the preset prints)
- Test: `tests/Feature/Admin/TypeBenefitsCommandTest.php`

**Interfaces:**
- Produces: `loyalty:type-benefits {--org=} {--apply}`. For every `tier_benefits` row with `value_type = 'text'` and a non-empty `value`: `/^\s*(\d+(?:\.\d+)?)\s*%\s*off\b/i` → `percent_discount`; `/^\s*(?:€|\$|£|EUR|USD|GBP)\s*(\d+(?:\.\d+)?)\s*off\b/i` → `fixed_amount`; `applies_to` = `services` when the text matches `/treatment|service|appointment|class|session|massage|facial/i`, `stays` when `/night|stay|room/i`, else `all`. Dry run (default) prints a table `id | tier | text | → type amount scope` and the count; `--apply` writes and prints the same table; unparseable rows are listed under "Left as text".

- [ ] **Step 1: Write the failing test**

```php
<?php
// tests/Feature/Admin/TypeBenefitsCommandTest.php
namespace Tests\Feature\Admin;

use App\Models\BenefitDefinition;
use App\Models\LoyaltyTier;
use App\Models\TierBenefit;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

class TypeBenefitsCommandTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema;

    private int $orgId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpMinimalSchema();
        $this->setUpLoyaltySchema();
        if (!Schema::hasColumn('tier_benefits', 'applies_to')) Schema::table('tier_benefits', fn ($t) => $t->string('applies_to', 12)->default('all'));
        $this->orgId = \App\Models\Organization::create(['name' => 'Numa', 'slug' => 'numa'])->id;
        $tier = LoyaltyTier::create(['organization_id' => $this->orgId, 'name' => 'Gold', 'min_points' => 0, 'earn_rate' => 1, 'is_active' => true]);
        foreach (['10% off treatments', '€5 off your next stay', 'Free coffee'] as $i => $text) {
            $def = BenefitDefinition::create(['organization_id' => $this->orgId, 'name' => "B$i", 'code' => "b$i", 'category' => 'perk', 'is_active' => true]);
            TierBenefit::create(['organization_id' => $this->orgId, 'tier_id' => $tier->id, 'benefit_id' => $def->id, 'value' => $text, 'value_type' => 'text', 'is_active' => true]);
        }
    }

    public function test_dry_run_lists_the_parseable_rows_and_writes_nothing(): void
    {
        $this->artisan('loyalty:type-benefits', ['--org' => $this->orgId])->expectsOutputToContain('2 benefit(s) would be typed')->assertExitCode(0);
        $this->assertSame(3, TierBenefit::where('value_type', 'text')->count());
    }

    public function test_apply_types_percent_and_fixed_rows_and_leaves_prose(): void
    {
        $this->artisan('loyalty:type-benefits', ['--org' => $this->orgId, '--apply' => true])->assertExitCode(0);
        $rows = TierBenefit::orderBy('id')->get();
        $this->assertSame(['percent_discount', 10.0, 'services'], [$rows[0]->value_type, (float) $rows[0]->value_amount, $rows[0]->applies_to]);
        $this->assertSame(['fixed_amount', 5.0, 'stays'], [$rows[1]->value_type, (float) $rows[1]->value_amount, $rows[1]->applies_to]);
        $this->assertSame('text', $rows[2]->value_type);
    }

    public function test_presets_seed_at_least_one_typed_benefit(): void
    {
        // Call the preset service the way tests/Feature/Loyalty/ already does (grep LoyaltyPresetService there) for a beauty preset on $this->orgId.
        app(\App\Services\LoyaltyPresetService::class)->apply($this->orgId, 'beauty'); // adapt to the real method name/signature
        $this->assertTrue(TierBenefit::withoutGlobalScopes()->where('organization_id', $this->orgId)->where('value_type', 'percent_discount')->exists());
    }
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Admin/TypeBenefitsCommandTest.php`
Expected: FAIL — command not found.

- [ ] **Step 3: Write the command and the preset change**

```php
<?php
// app/Console/Commands/TypeBenefits.php
namespace App\Console\Commands;

use App\Models\TierBenefit;
use Illuminate\Console\Command;

/**
 * Turns prose benefit values of the exact shapes "NN% off …" and "<currency>NN off …"
 * into typed values the discount engine enforces. Dry-run by default.
 */
class TypeBenefits extends Command
{
    protected $signature = 'loyalty:type-benefits {--org= : Only this organisation} {--apply : Write the typed values}';
    protected $description = 'Type prose tier benefits (NN% off, €NN off) so bookings can apply them';

    public function handle(): int
    {
        $rows = TierBenefit::withoutGlobalScopes()->with('tier')->where('value_type', 'text')->whereNotNull('value')
            ->when($this->option('org'), fn ($q, $org) => $q->where('organization_id', (int) $org))->orderBy('id')->get();
        $plan = []; $left = [];
        foreach ($rows as $tb) {
            $typed = self::parse((string) $tb->value);
            if ($typed) $plan[] = [$tb->id, $tb->tier?->name ?? $tb->tier_id, $tb->value, $typed['type'], $typed['amount'], $typed['scope']];
            else $left[] = [$tb->id, $tb->value];
        }
        $this->table(['id', 'tier', 'text', 'type', 'amount', 'scope'], $plan);
        if ($left) { $this->line('Left as text:'); $this->table(['id', 'text'], $left); }
        if (!$this->option('apply')) { $this->info(count($plan) . ' benefit(s) would be typed. Run with --apply to write.'); return self::SUCCESS; }
        foreach ($plan as [$id, , , $type, $amount, $scope]) {
            TierBenefit::withoutGlobalScopes()->whereKey($id)->update(['value_type' => $type, 'value_amount' => $amount, 'applies_to' => $scope]);
        }
        $this->info(count($plan) . ' benefit(s) typed.');
        return self::SUCCESS;
    }

    /** @return array{type:string, amount:float, scope:string}|null */
    public static function parse(string $text): ?array
    {
        $scope = preg_match('/treatment|service|appointment|class|session|massage|facial/i', $text) ? 'services' : (preg_match('/night|stay|room/i', $text) ? 'stays' : 'all');
        if (preg_match('/^\s*(\d+(?:\.\d+)?)\s*%\s*off\b/i', $text, $m)) return ['type' => 'percent_discount', 'amount' => (float) $m[1], 'scope' => $scope];
        if (preg_match('/^\s*(?:€|\$|£|EUR|USD|GBP)\s*(\d+(?:\.\d+)?)\s*off\b/i', $text, $m)) return ['type' => 'fixed_amount', 'amount' => (float) $m[1], 'scope' => $scope];
        return null;
    }
}
```

Presets: where a preset writes its perk texts, run each through `TypeBenefits::parse()` and create the `TierBenefit` with the typed fields when it parses (so the command and the presets agree on what "typed" means).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Admin/TypeBenefitsCommandTest.php tests/Feature/Loyalty/`
Expected: `3 passed`; Loyalty suite unchanged.

- [ ] **Step 5: Commit**

```bash
git add app/Console/Commands/TypeBenefits.php app/Services/LoyaltyPresetService.php tests/Feature/Admin/TypeBenefitsCommandTest.php
git commit -m "Type the prose benefits presets and admins already wrote so the engine can enforce them

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 14: Frontend foundations — Stripe packages, types, API client, `book` copy, Stepper, ics

**Files:**
- Modify: `frontend/package.json` + `package-lock.json`, `frontend/src/portal/lib/types.ts`, `frontend/src/portal/lib/portalApi.ts`, `frontend/src/portal/i18n/portal.{en,ru,de,fr,es}.json`
- Create: `frontend/src/portal/ui/Stepper.tsx`, `frontend/src/portal/ui/Stepper.test.tsx`, `frontend/src/portal/lib/ics.ts`, `frontend/src/portal/lib/ics.test.ts`, `frontend/src/portal/lib/stripe.ts`

**Interfaces:**
- Produces (append to `lib/types.ts`):

```ts
export interface CatalogueService { id: number; category_id: number | null; name: string; description: string | null; short_description: string | null; duration_minutes: number; price: number; member_price: number; currency: string | null; image: string | null; master_ids: number[] }
export interface CatalogueMaster { id: number; name: string; title: string | null; avatar: string | null; service_ids: number[] }
export interface CatalogueExtra { id: number; name: string; description: string | null; price: number; price_type: string; lead_time_hours: number | null }
export interface CatalogueRules { currency: string; lead_minutes: number; slot_step: number; max_advance_days: number; allow_master_choice: boolean; cancellation_policy: string | null }
export interface Catalogue { categories: { id: number; name: string }[]; services: CatalogueService[]; masters: CatalogueMaster[]; extras: CatalogueExtra[]; rules: CatalogueRules; pricing: { automatic: { label: string; type: string; value: number } | null } }
export interface Slot { start: string; end: string; duration_minutes: number; time_label: string; masters: number[] }
export type CouponRef = { member_offer_id: number } | { redemption_id: number }
export interface QuoteBody { service_id: number; master_id?: number | null; start_at: string; party_size?: number; extras?: { id: number; quantity?: number }[]; coupon?: CouponRef | null }
export interface QuoteLine { id: number; name: string; unit_price: number; quantity: number; line_total: number }
export interface Quote { service: { id: number; name: string; duration_minutes: number }; master: { id: number; name: string } | null; start_at: string; end_at: string; duration_minutes: number; currency: string; lines: { service_price: number; extras: QuoteLine[]; extras_total: number }; list_amount: number; discount: { amount: number; label: string; source: string } | null; coupon: { source: 'offer' | 'reward'; source_id: number; label: string; status: 'applied' | 'outbid' | 'wrong_scope'; discount: number } | null; total_amount: number; payment: { mode: 'online' | 'at_venue'; reason: string | null }; policy: { cancellation_policy: string | null; cancel_hours: number } }
export interface ResolvedCoupon { kind: 'offer' | 'reward'; coupon: CouponRef; label: string; type: 'percent_discount' | 'fixed_amount'; value: number; value_label: string; valid_until: string | null }
export interface ConfirmBody extends QuoteBody { payment_intent_id?: string | null; notes?: string | null }
export interface PaymentIntentReply { client_secret: string; payment_intent_id: string; amount: number; currency: string }
```

- Produces (append to `portalApi`):

```ts
catalogue: () => api.get<Catalogue>('/v1/member/portal/services').then(r => r.data),
calendar: (serviceId: number, masterId: number | null, start: string, end: string) => api.get<{ available_dates: string[] }>('/v1/member/portal/services/calendar', { params: { service_id: serviceId, master_id: masterId ?? undefined, start, end } }).then(r => r.data),
availability: (serviceId: number, masterId: number | null, date: string) => api.get<{ slots: Slot[] }>('/v1/member/portal/services/availability', { params: { service_id: serviceId, master_id: masterId ?? undefined, date } }).then(r => r.data),
quote: (body: QuoteBody) => api.post<Quote>('/v1/member/portal/services/quote', body).then(r => r.data),
paymentIntent: (body: QuoteBody) => api.post<PaymentIntentReply>('/v1/member/portal/services/payment-intent', body).then(r => r.data),
confirm: (body: ConfirmBody, idempotencyKey: string) => api.post<{ booking: PortalBooking; replayed: boolean }>('/v1/member/portal/services/confirm', body, { headers: { 'Idempotency-Key': idempotencyKey } }).then(r => r.data),
resolveCoupon: (code: string) => api.post<ResolvedCoupon>('/v1/member/portal/coupons/resolve', { code }).then(r => r.data),
```

and a named export `apiErrorCode(e: unknown): string | null` returning `(e as {response?: {data?: {error?: string}}})?.response?.data?.error ?? null`.

- Produces: `Stepper`, `buildIcs`/`downloadIcs`, `stripeFor`/`stripeAppearance` (code below), and the `book` block in five bundles.

- [ ] **Step 1: Write the failing tests**

```tsx
// frontend/src/portal/ui/Stepper.test.tsx
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Stepper } from './Stepper'

describe('Stepper', () => {
  it('shows the value and disables the edge buttons at the limits', () => {
    const atMin = renderToStaticMarkup(<Stepper label="People" value={1} min={1} max={10} onChange={() => {}} />)
    expect(atMin).toContain('>1<')
    expect(atMin).toMatch(/aria-label="Fewer"[^>]*disabled/)
    const atMax = renderToStaticMarkup(<Stepper label="People" value={10} min={1} max={10} onChange={() => {}} />)
    expect(atMax).toMatch(/aria-label="More"[^>]*disabled/)
    expect(atMax).toContain('aria-live="polite"')
  })
})
```

```ts
// frontend/src/portal/lib/ics.test.ts
import { describe, expect, it } from 'vitest'
import { buildIcs } from './ics'
import type { PortalBooking } from './types'

const booking: PortalBooking = { kind: 'service', id: 7, reference: 'SVC-ABC12345', title: 'Facial', subtitle: 'with Mara', starts_at: '2026-10-03T07:30:00Z', ends_at: '2026-10-03T08:15:00Z', status: 'confirmed', payment_status: 'unpaid', total: 60, currency: 'EUR', discount: null, can_cancel: false, cancel_deadline: null, notes: null, party_size: 1, guests: null, nights: null }

describe('buildIcs', () => {
  it('writes a UTC event with the reference as its uid, CRLF ends and folded long lines', () => {
    const ics = buildIcs({ ...booking, notes: 'x'.repeat(120) }, { name: 'Numa', timezone: 'Europe/Riga' })
    expect(ics).toContain('BEGIN:VCALENDAR\r\n')
    expect(ics).toContain('UID:SVC-ABC12345@hexa-tech\r\n')
    expect(ics).toContain('DTSTART:20261003T073000Z\r\n')
    expect(ics).toContain('DTEND:20261003T081500Z\r\n')
    expect(ics).toContain('SUMMARY:Facial\r\n')
    expect(ics.split('\r\n').every(l => Buffer.byteLength(l, 'utf8') <= 75)).toBe(true)
    expect(ics).toContain('\r\n ') // a folded continuation
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd frontend && npx vitest run src/portal/ui/Stepper.test.tsx src/portal/lib/ics.test.ts`
Expected: FAIL — modules missing.

- [ ] **Step 3: Install the packages and write the modules**

`cd frontend && npm install @stripe/stripe-js @stripe/react-stripe-js` (only `package.json` and `package-lock.json` change; the junctioned `node_modules` receives the packages).

```tsx
// frontend/src/portal/ui/Stepper.tsx
import { Minus, Plus } from 'lucide-react'

interface Props { label: string; value: number; min: number; max: number; onChange: (v: number) => void; fewerLabel?: string; moreLabel?: string }

/** A labelled −/+ pair for small counts. 44 px targets; the value is announced. */
export function Stepper({ label, value, min, max, onChange, fewerLabel = 'Fewer', moreLabel = 'More' }: Props) {
  const btn = 'w-11 h-11 rounded-p-control border border-p-border bg-p-surface text-p-text flex items-center justify-center disabled:opacity-40'
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm">{label}</span>
      <div className="flex items-center gap-2">
        <button type="button" className={btn} aria-label={fewerLabel} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}><Minus size={16} aria-hidden /></button>
        <span className="w-8 text-center tabular-nums" aria-live="polite">{value}</span>
        <button type="button" className={btn} aria-label={moreLabel} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}><Plus size={16} aria-hidden /></button>
      </div>
    </div>
  )
}
```

```ts
// frontend/src/portal/lib/ics.ts
import type { PortalBooking } from './types'

const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const escape = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

/** RFC 5545 folding: lines longer than 75 octets continue on the next line after a single space. */
function fold(line: string): string {
  const out: string[] = []
  let cur = ''
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch, 'utf8') > (out.length === 0 ? 75 : 74)) { out.push(cur); cur = ch } else cur += ch
  }
  out.push(cur)
  return out.join('\r\n ')
}

export function buildIcs(b: PortalBooking, venue: { name: string; timezone: string }): string {
  const description = [`Reference ${b.reference}`, b.subtitle ?? '', b.notes ?? ''].filter(Boolean).join('\\n')
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Hexa-Tech//Member portal//EN', 'BEGIN:VEVENT',
    `UID:${b.reference}@hexa-tech`, `DTSTAMP:${stamp(new Date().toISOString())}`, `DTSTART:${stamp(b.starts_at)}`, `DTEND:${stamp(b.ends_at ?? b.starts_at)}`,
    `SUMMARY:${escape(b.title)}`, `DESCRIPTION:${escape(description)}`, `LOCATION:${escape(venue.name)}`, 'END:VEVENT', 'END:VCALENDAR',
  ]
  return lines.map(fold).join('\r\n') + '\r\n'
}

export function downloadIcs(text: string, filename: string): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return
  const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' }))
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
```

`Buffer` is available in the node test environment; in the browser bundle use `new TextEncoder().encode(s).length` instead — write a tiny `byteLength(s)` helper that picks whichever exists so the same code runs in both.

```ts
// frontend/src/portal/lib/stripe.ts
import { loadStripe, type Appearance, type Stripe } from '@stripe/stripe-js'

const cache = new Map<string, Promise<Stripe | null>>()
export function stripeFor(publishableKey: string): Promise<Stripe | null> {
  if (!cache.has(publishableKey)) cache.set(publishableKey, loadStripe(publishableKey))
  return cache.get(publishableKey)!
}

const rgb = (root: HTMLElement | null, name: string, fallback: string) => {
  const v = root ? getComputedStyle(root).getPropertyValue(name).trim() : ''
  return v ? `rgb(${v.split(/\s+/).join(' ')})` : fallback
}

/** Stripe's Payment Element painted with the portal's own tokens. */
export function stripeAppearance(root: HTMLElement | null, dark: boolean): Appearance {
  return {
    theme: dark ? 'night' : 'stripe',
    variables: {
      colorPrimary: rgb(root, '--p-accent', '#2F5D8A'), colorBackground: rgb(root, '--p-surface', dark ? '#0F1113' : '#FFFFFF'),
      colorText: rgb(root, '--p-text', dark ? '#F2F2F0' : '#17191C'), colorTextSecondary: rgb(root, '--p-text-2', '#5F646B'),
      colorDanger: rgb(root, '--p-danger', '#B3261E'), borderRadius: '12px',
      fontFamily: root ? getComputedStyle(root).getPropertyValue('--p-font-body').trim() || 'system-ui, sans-serif' : 'system-ui, sans-serif',
    },
    rules: { '.Input': { borderColor: rgb(root, '--p-border', '#E4E1DA') } },
  }
}
```

The `book` block, English (write real ru/de/fr/es translations beside it; the key sets must match):

```json
"book": {
  "title": "Book", "step_service": "Service", "step_staff": "Who", "step_when": "When", "step_review": "Review", "step_pay": "Pay",
  "your_price": "Your price", "list_price": "List price", "member_price_note": "{{label}} applied",
  "any_staff": "Anyone available", "choose_staff": "Choose who you'd like", "pick_day": "Pick a day",
  "no_slots": "No times left on this day.", "no_days": "No days available in the next {{count}} days.", "lead_note": "Times are shown in the venue's local time.",
  "party_size": "How many people", "fewer": "Fewer", "more": "More", "extras": "Add-ons", "notes": "Anything we should know?", "notes_hint": "Optional",
  "coupon": "Coupon", "coupon_code": "Have a code?", "coupon_apply": "Apply", "coupon_remove": "Remove", "coupon_applied": "{{label}} applied",
  "coupon_outbid": "Your membership discount is better than {{label}}, so we kept the bigger saving. The coupon stays available.",
  "coupon_wrong_scope": "{{label}} does not apply to {{noun}}.", "coupon_yours": "Your coupons", "coupon_none": "No coupons yet. Codes from the venue go here.",
  "coupon_invalid": "That code did not work.", "coupon_used": "That coupon has already been used.", "coupon_expired": "That coupon has expired.",
  "coupon_wrong_tier": "That code is for another membership level.", "coupon_no_capacity": "That code has been fully claimed.", "coupon_untyped": "That reward cannot be used as a coupon.",
  "subtotal": "Subtotal", "discount": "Discount", "total": "Total", "pay_online": "Pay now", "pay_at_venue": "Pay at the venue", "pay_at_venue_note": "Nothing to pay now. Settle up when you visit.",
  "card_loading": "Loading secure payment…", "card_unavailable": "Online payment is unavailable right now. Please try again in a moment.",
  "confirm": "Confirm booking", "confirming": "Confirming…", "slot_taken": "That time was just taken. Please pick another.", "payment_mismatch": "The price changed. Please review and pay again.",
  "confirmed_title": "You're booked", "confirmed_body": "Reference {{reference}}. We've emailed the details.", "add_to_calendar": "Add to calendar",
  "change": "Change", "continue": "Continue", "back": "Back", "cta_home": "Book {{noun}}", "not_bookable": "Online booking is not available for this venue yet."
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx tsc -b && npx vitest run`
Expected: the two new files pass; `portalLocales.test.ts`, `localeCompleteness.test.ts`, `tokens.test.ts` still pass; 3 known `plannerMeta` failures only.

- [ ] **Step 5: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/portal/lib/types.ts frontend/src/portal/lib/portalApi.ts frontend/src/portal/lib/ics.ts frontend/src/portal/lib/ics.test.ts frontend/src/portal/lib/stripe.ts frontend/src/portal/ui/Stepper.tsx frontend/src/portal/ui/Stepper.test.tsx frontend/src/portal/i18n/
git commit -m "Add the booking types, API calls, copy and Stripe loader the portal's Book flow needs

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 15: Book page — service, staff and time steps

**Files:**
- Create: `frontend/src/portal/pages/book/Book.tsx`, `ServiceStep.tsx`, `StaffStep.tsx`, `WhenStep.tsx`, `steps.ts`, `book.test.tsx`
- Modify: `frontend/src/portal/PortalApp.tsx` (add `<Route path="book" element={<Book />} />`)

**Interfaces:**
- Produces (`steps.ts`): `export type Step = 'service' | 'staff' | 'when' | 'review' | 'pay'`; `export interface BookState { step: Step; serviceId: number | null; masterId: number | null; startAt: string | null; partySize: number; extras: number[]; coupon: CouponRef | null; notes: string }`; `export const initialState: BookState`; `export function nextStep(s: BookState, catalogue: Catalogue): Step` (skips `staff` when `!rules.allow_master_choice` or fewer than two masters serve the service).
- Produces: `Book()` — loads `['portal-catalogue']`; holds `BookState`; mirrors `service`, `master`, `date` to the query string; renders `<StepStrip>` (the five `book.step_*` labels, current in `font-semibold text-p-text`, done ones as buttons that jump back, later ones `text-p-text-2`) and the step component; `capabilities.services === false` → `EmptyState` `book.not_bookable`. Review and Pay steps come from Tasks 16 and 17 (import them; until then render `null` for those steps — the test for this task does not reach them).
- Produces: `ServiceStep({ catalogue, onPick })`, `StaffStep({ catalogue, serviceId, value, onPick })`, `WhenStep({ serviceId, masterId, rules, value, onPick })` as below.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/portal/pages/book/book.test.tsx
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PortalContext, type PortalContextValue } from '../../PortalProvider'
import type { Catalogue, PortalBootstrap, Slot } from '../../lib/types'
import { Book } from './Book'
import { WhenStep } from './WhenStep'

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
vi.mock('../../lib/portalApi', () => ({
  portalApi: { catalogue: () => new Promise(() => {}), calendar: () => new Promise(() => {}), availability: () => new Promise(() => {}), offers: () => new Promise(() => {}), redemptions: () => new Promise(() => {}) },
  apiMessage: (_e: unknown, f: string) => f, apiErrorCode: () => null,
}))

const catalogue: Catalogue = {
  categories: [{ id: 1, name: 'Massage' }],
  services: [
    { id: 11, category_id: 1, name: 'Deep Tissue', description: null, short_description: '45 minutes of relief', duration_minutes: 45, price: 60, member_price: 54, currency: 'EUR', image: null, master_ids: [5, 6] },
    { id: 12, category_id: 1, name: 'Hot Stone', description: null, short_description: null, duration_minutes: 60, price: 80, member_price: 80, currency: 'EUR', image: null, master_ids: [5] },
  ],
  masters: [{ id: 5, name: 'Mara', title: null, avatar: null, service_ids: [11, 12] }, { id: 6, name: 'Ilse', title: null, avatar: null, service_ids: [11] }],
  extras: [], rules: { currency: 'EUR', lead_minutes: 60, slot_step: 15, max_advance_days: 30, allow_master_choice: true, cancellation_policy: null },
  pricing: { automatic: { label: '10% off treatments', type: 'percent_discount', value: 10 } },
}
const base: PortalBootstrap = {
  venue: { name: 'Numa', logo_url: null, industry: 'beauty', currency: 'EUR', timezone: 'Europe/Riga', contact: { email: null, phone: null }, accent: { hex: '#b04a6e', ink: '#ffffff', deep: '#8e3b58', dark_hex: '#e38ab0', dark_ink: '#1a0b12', dark_deep: '#f0b4cd' }, display_face: 'cormorant' },
  capabilities: { loyalty: true, services: true, stays: false, chat: false, payments: { services: false, stays: false, publishable_key: null } },
  policies: { services_cancel_hours: 24, booking_cancel_hours: 48, services_cancellation_policy: '' },
  member: null, counts: { unread_notifications: 0, upcoming_bookings: 0 },
}

function render(ui: React.ReactElement, data = base, seed?: (c: QueryClient) => void, path = '/portal/book') {
  const client = new QueryClient()
  seed?.(client)
  const value: PortalContextValue = { data, isLoading: false, isError: false, error: null, refetch: () => {} }
  return renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><PortalContext.Provider value={value}>{ui}</PortalContext.Provider></MemoryRouter></QueryClientProvider>)
}

describe('Book', () => {
  it('lists services with the member price and the automatic discount label', () => {
    const html = render(<Book />, base, c => c.setQueryData(['portal-catalogue'], catalogue))
    expect(html).toContain('Deep Tissue')
    expect(html).toContain('Hot Stone')
    expect(html).toContain('10% off treatments')
    expect(html).toContain('54') // member price
    expect(html).toContain('Your price')
  })

  it('tells a member the venue does not book online instead of listing services', () => {
    const html = render(<Book />, { ...base, capabilities: { ...base.capabilities, services: false } }, c => c.setQueryData(['portal-catalogue'], catalogue))
    expect(html).toContain('Online booking is not available for this venue yet.')
    expect(html).not.toContain('Deep Tissue')
  })
})

describe('WhenStep', () => {
  const slots: Slot[] = [{ start: '2026-10-05T09:00:00Z', end: '2026-10-05T09:45:00Z', duration_minutes: 45, time_label: '09:00', masters: [5] }, { start: '2026-10-05T10:00:00Z', end: '2026-10-05T10:45:00Z', duration_minutes: 45, time_label: '10:00', masters: [5] }]
  it('shows the slot labels for the selected day and greys days with nothing available', () => {
    const html = render(<WhenStep serviceId={11} masterId={null} rules={catalogue.rules} value={null} onPick={() => {}} />, base, c => {
      c.setQueryData(['portal-calendar', 11, null, '2026-10-05', '2026-10-11'], { available_dates: ['2026-10-05', '2026-10-07'] })
      c.setQueryData(['portal-slots', 11, null, '2026-10-05'], { slots })
    }, '/portal/book?service=11&date=2026-10-05')
    expect(html).toContain('09:00')
    expect(html).toContain('10:00')
    expect(html).toContain('aria-disabled="true"') // an unavailable day in the strip
    expect(html).toContain("Times are shown in the venue's local time.")
  })

  it('says when a day has no times left', () => {
    const html = render(<WhenStep serviceId={11} masterId={null} rules={catalogue.rules} value={null} onPick={() => {}} />, base, c => {
      c.setQueryData(['portal-calendar', 11, null, '2026-10-05', '2026-10-11'], { available_dates: ['2026-10-05'] })
      c.setQueryData(['portal-slots', 11, null, '2026-10-05'], { slots: [] })
    }, '/portal/book?service=11&date=2026-10-05')
    expect(html).toContain('No times left on this day.')
  })
})
```

`WhenStep` reads the selected day from `?date=` (falls back to today) and the strip window from that day for 7 days, so the seeded keys above are deterministic; the strip's first day is the selected day. Use `vi.useFakeTimers().setSystemTime(new Date('2026-10-05T06:00:00Z'))` in a `beforeAll` if the component derives "today" — keep the key shapes exactly as seeded.

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && npx vitest run src/portal/pages/book`
Expected: FAIL — modules missing.

- [ ] **Step 3: Write the step model, the three steps and the page**

```ts
// frontend/src/portal/pages/book/steps.ts
import type { Catalogue, CouponRef } from '../../lib/types'

export type Step = 'service' | 'staff' | 'when' | 'review' | 'pay'
export const STEPS: Step[] = ['service', 'staff', 'when', 'review', 'pay']

export interface BookState { step: Step; serviceId: number | null; masterId: number | null; startAt: string | null; partySize: number; extras: number[]; coupon: CouponRef | null; notes: string }
export const initialState: BookState = { step: 'service', serviceId: null, masterId: null, startAt: null, partySize: 1, extras: [], coupon: null, notes: '' }

export function mastersFor(catalogue: Catalogue, serviceId: number | null) {
  return catalogue.masters.filter(m => serviceId !== null && m.service_ids.includes(serviceId))
}

/** The staff step is skipped when the venue hides the choice or only one person does the service. */
export function nextStep(s: BookState, catalogue: Catalogue): Step {
  const i = STEPS.indexOf(s.step)
  let next = STEPS[Math.min(i + 1, STEPS.length - 1)]
  if (next === 'staff' && (!catalogue.rules.allow_master_choice || mastersFor(catalogue, s.serviceId).length < 2)) next = 'when'
  return next
}
```

```tsx
// frontend/src/portal/pages/book/ServiceStep.tsx
import { useTranslation } from 'react-i18next'
import { Card } from '../../ui/Card'
import { Chip } from '../../ui/Chip'
import { Money } from '../../ui/Money'
import type { Catalogue, CatalogueService } from '../../lib/types'

export function ServiceStep({ catalogue, onPick }: { catalogue: Catalogue; onPick: (serviceId: number) => void }) {
  const { t } = useTranslation()
  const groups = catalogue.categories.map(c => ({ ...c, services: catalogue.services.filter(s => s.category_id === c.id) })).filter(g => g.services.length)
  const orphans = catalogue.services.filter(s => !catalogue.categories.some(c => c.id === s.category_id))
  if (orphans.length) groups.push({ id: 0, name: '', services: orphans })
  const currency = catalogue.rules.currency
  return (
    <div className="space-y-6">
      {catalogue.pricing.automatic && <Chip tone="accent">{t('portal.book.member_price_note', '{{label}} applied', { label: catalogue.pricing.automatic.label })}</Chip>}
      {groups.map(g => (
        <section key={g.id} className="space-y-3">
          {g.name && <h2 className="font-p-display text-xl">{g.name}</h2>}
          {g.services.map(s => <ServiceCard key={s.id} service={s} currency={s.currency ?? currency} onPick={onPick} />)}
        </section>
      ))}
    </div>
  )
}

function ServiceCard({ service: s, currency, onPick }: { service: CatalogueService; currency: string; onPick: (id: number) => void }) {
  const { t } = useTranslation()
  const discounted = s.member_price < s.price
  return (
    <Card>
      <button type="button" className="w-full text-left flex items-start justify-between gap-4 min-h-[44px]" onClick={() => onPick(s.id)}>
        <span>
          <span className="block font-medium">{s.name}</span>
          {s.short_description && <span className="block text-sm text-p-text-2 mt-0.5">{s.short_description}</span>}
          <span className="block text-xs text-p-text-2 mt-1">{s.duration_minutes} min</span>
        </span>
        <span className="text-right shrink-0">
          {discounted && <span className="block text-xs text-p-text-2 line-through"><Money amount={s.price} currency={currency} /></span>}
          <span className="block font-p-display text-lg"><Money amount={s.member_price} currency={currency} /></span>
          {discounted && <span className="block text-[11px] text-p-accent-deep">{t('portal.book.your_price', 'Your price')}</span>}
        </span>
      </button>
    </Card>
  )
}
```

```tsx
// frontend/src/portal/pages/book/StaffStep.tsx
import { useTranslation } from 'react-i18next'
import { Card } from '../../ui/Card'
import type { Catalogue } from '../../lib/types'
import { mastersFor } from './steps'

export function StaffStep({ catalogue, serviceId, value, onPick }: { catalogue: Catalogue; serviceId: number | null; value: number | null; onPick: (masterId: number | null) => void }) {
  const { t } = useTranslation()
  const options = [{ id: null as number | null, name: t('portal.book.any_staff', 'Anyone available'), title: null as string | null }, ...mastersFor(catalogue, serviceId)]
  return (
    <div className="space-y-3">
      <h2 className="font-p-display text-xl">{t('portal.book.choose_staff', "Choose who you'd like")}</h2>
      {options.map(m => (
        <Card key={String(m.id)}>
          <button type="button" aria-pressed={value === m.id} className={`w-full text-left min-h-[44px] flex items-center justify-between ${value === m.id ? 'font-semibold' : ''}`} onClick={() => onPick(m.id)}>
            <span>{m.name}{m.title && <span className="block text-sm text-p-text-2">{m.title}</span>}</span>
          </button>
        </Card>
      ))}
    </div>
  )
}
```

```tsx
// frontend/src/portal/pages/book/WhenStep.tsx
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { portalApi } from '../../lib/portalApi'
import { formatDay, resolveLocale } from '../../lib/dates'
import { Skeleton } from '../../ui/Skeleton'
import { EmptyState } from '../../ui/EmptyState'
import type { CatalogueRules } from '../../lib/types'

const isoDay = (d: Date) => d.toISOString().slice(0, 10)
const addDays = (day: string, n: number) => { const d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return isoDay(d) }

interface Props { serviceId: number; masterId: number | null; rules: CatalogueRules; value: string | null; onPick: (startAt: string) => void }

/** A seven-day strip and the scheduler's slots for the chosen day; times are the venue's own labels. */
export function WhenStep({ serviceId, masterId, rules, value, onPick }: Props) {
  const { t, i18n } = useTranslation()
  const [params, setParams] = useSearchParams()
  const today = isoDay(new Date())
  const selected = params.get('date') ?? today
  const [from, setFrom] = useState(selected)
  const to = addDays(from, 6)
  const last = addDays(today, rules.max_advance_days)

  const calendar = useQuery({ queryKey: ['portal-calendar', serviceId, masterId, from, to], queryFn: () => portalApi.calendar(serviceId, masterId, from, to) })
  const slots = useQuery({ queryKey: ['portal-slots', serviceId, masterId, selected], queryFn: () => portalApi.availability(serviceId, masterId, selected) })
  const available = new Set(calendar.data?.available_dates ?? [])
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i))
  const locale = resolveLocale(i18n.language)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button type="button" className="w-11 h-11 rounded-p-control border border-p-border disabled:opacity-40" aria-label={t('portal.common.previous', 'Previous')} disabled={from <= today} onClick={() => setFrom(addDays(from, -7) < today ? today : addDays(from, -7))}><ChevronLeft size={18} aria-hidden /></button>
        <div className="flex-1 grid grid-cols-7 gap-1">
          {days.map(d => {
            const ok = available.has(d) && d <= last
            return (
              <button key={d} type="button" aria-disabled={!ok} aria-pressed={d === selected} disabled={!ok}
                className={`min-h-[56px] rounded-p-control text-xs flex flex-col items-center justify-center ${d === selected ? 'bg-p-accent text-p-accent-ink' : ok ? 'bg-p-surface border border-p-border' : 'text-p-text-2 opacity-50'}`}
                onClick={() => { params.set('date', d); setParams(params, { replace: true }) }}>
                <span>{formatDay(d, locale, { weekday: 'short' })}</span>
                <span className="font-semibold text-sm">{d.slice(8, 10)}</span>
              </button>
            )
          })}
        </div>
        <button type="button" className="w-11 h-11 rounded-p-control border border-p-border disabled:opacity-40" aria-label={t('portal.common.next', 'Next')} disabled={to >= last} onClick={() => setFrom(addDays(from, 7))}><ChevronRight size={18} aria-hidden /></button>
      </div>

      {slots.isPending && <Skeleton className="h-24" />}
      {slots.isSuccess && slots.data.slots.length === 0 && <EmptyState title={t('portal.book.no_slots', 'No times left on this day.')} />}
      {slots.isSuccess && slots.data.slots.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {slots.data.slots.map(s => (
            <button key={s.start} type="button" aria-pressed={value === s.start} className={`min-h-[44px] rounded-p-control border ${value === s.start ? 'bg-p-accent text-p-accent-ink border-p-accent' : 'bg-p-surface border-p-border'}`} onClick={() => onPick(s.start)}>{s.time_label}</button>
          ))}
        </div>
      )}
      {calendar.isSuccess && available.size === 0 && <EmptyState title={t('portal.book.no_days', 'No days available in the next {{count}} days.', { count: rules.max_advance_days })} />}
      <p className="text-xs text-p-text-2">{t('portal.book.lead_note', "Times are shown in the venue's local time.")}</p>
    </div>
  )
}
```

`formatDay`'s signature: read `lib/dates.ts`; if it has no options argument, add an optional `Intl.DateTimeFormatOptions` third parameter (default unchanged) rather than a second formatter.

```tsx
// frontend/src/portal/pages/book/Book.tsx
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CalendarX } from 'lucide-react'
import { usePortal } from '../../PortalProvider'
import { portalApi } from '../../lib/portalApi'
import { PageSkeleton } from '../../ui/Skeleton'
import { EmptyState } from '../../ui/EmptyState'
import { ServiceStep } from './ServiceStep'
import { StaffStep } from './StaffStep'
import { WhenStep } from './WhenStep'
import { ReviewStep } from './ReviewStep'
import { PayStep } from './PayStep'
import { STEPS, initialState, nextStep, type BookState, type Step } from './steps'
import type { Quote } from '../../lib/types'

export function Book() {
  const { t } = useTranslation()
  const { data } = usePortal()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [state, setState] = useState<BookState>(() => ({ ...initialState, serviceId: params.get('service') ? Number(params.get('service')) : null, masterId: params.get('master') ? Number(params.get('master')) : null, step: params.get('service') ? 'when' : 'service' }))
  const [quote, setQuote] = useState<Quote | null>(null)
  const catalogue = useQuery({ queryKey: ['portal-catalogue'], queryFn: portalApi.catalogue, enabled: data?.capabilities.services === true })

  if (data && !data.capabilities.services) return <EmptyState icon={<CalendarX size={22} aria-hidden />} title={t('portal.book.not_bookable', 'Online booking is not available for this venue yet.')} />
  if (!catalogue.data) return <PageSkeleton />
  const cat = catalogue.data

  const go = (patch: Partial<BookState>, step?: Step) => {
    const next = { ...state, ...patch }
    next.step = step ?? nextStep(next, cat)
    setState(next)
    if (patch.serviceId !== undefined) params.set('service', String(patch.serviceId))
    if (patch.masterId !== undefined) { if (patch.masterId === null) params.delete('master'); else params.set('master', String(patch.masterId)) }
    setParams(params, { replace: true })
  }
  const labels: Record<Step, string> = { service: t('portal.book.step_service', 'Service'), staff: t('portal.book.step_staff', 'Who'), when: t('portal.book.step_when', 'When'), review: t('portal.book.step_review', 'Review'), pay: t('portal.book.step_pay', 'Pay') }
  const current = STEPS.indexOf(state.step)

  return (
    <div className="space-y-5">
      <h1 className="font-p-display text-2xl">{t('portal.book.title', 'Book')}</h1>
      <ol className="flex gap-3 text-sm overflow-x-auto" aria-label={t('portal.book.title', 'Book')}>
        {STEPS.map((s, i) => (
          <li key={s} aria-current={s === state.step ? 'step' : undefined} className={s === state.step ? 'font-semibold text-p-text' : 'text-p-text-2'}>
            {i < current ? <button type="button" className="underline-offset-2 hover:underline" onClick={() => setState({ ...state, step: s })}>{labels[s]}</button> : labels[s]}
          </li>
        ))}
      </ol>
      {state.step === 'service' && <ServiceStep catalogue={cat} onPick={id => go({ serviceId: id, masterId: null, startAt: null, extras: [], coupon: null })} />}
      {state.step === 'staff' && <StaffStep catalogue={cat} serviceId={state.serviceId} value={state.masterId} onPick={m => go({ masterId: m, startAt: null })} />}
      {state.step === 'when' && state.serviceId !== null && <WhenStep serviceId={state.serviceId} masterId={state.masterId} rules={cat.rules} value={state.startAt} onPick={start => go({ startAt: start })} />}
      {state.step === 'review' && <ReviewStep catalogue={cat} state={state} onChange={patch => setState({ ...state, ...patch })} onBack={() => setState({ ...state, step: 'when' })} onContinue={q => { setQuote(q); setState({ ...state, step: 'pay' }) }} />}
      {state.step === 'pay' && quote && <PayStep quote={quote} state={state} onBack={(to) => setState({ ...state, step: to })} onDone={b => navigate(`/portal/bookings/${b.kind}/${b.id}?confirmed=1`)} />}
    </div>
  )
}
```

Until Tasks 16 and 17 land, create `ReviewStep.tsx` and `PayStep.tsx` as stubs exporting components that render `null` with the prop types above (`{ catalogue, state, onChange, onBack, onContinue }` and `{ quote, state, onBack, onDone }`), so the page type-checks; the next two tasks replace them.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx tsc -b && npx vitest run && npx eslint src/portal`
Expected: `book.test.tsx` 4 passed; sweeps green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/portal/pages/book frontend/src/portal/PortalApp.tsx frontend/src/portal/lib/dates.ts
git commit -m "Let a member pick a service, a person and a time in the portal

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 16: Review step — price breakdown, coupons, extras, party size, notes

**Files:**
- Create: `frontend/src/portal/pages/book/PriceBreakdown.tsx`, `CouponField.tsx`, `review.test.tsx`
- Modify: `frontend/src/portal/pages/book/ReviewStep.tsx` (replace the stub)

**Interfaces:**
- Produces: `PriceBreakdown({ quote })`, `CouponField({ value, onChange, quote })`, `ReviewStep({ catalogue, state, onChange, onBack, onContinue })` as below. Query keys: `['portal-quote', body]` (the quote), `['portal-offers']`, `['portal-redemptions']` (reused from the rewards tabs).

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/portal/pages/book/review.test.tsx  (same mocks/render helper as book.test.tsx — extract them into ./testUtils.tsx and import in both)
import { describe, expect, it } from 'vitest'
import { render, base, catalogue } from './testUtils'
import { PriceBreakdown } from './PriceBreakdown'
import { CouponField } from './CouponField'
import type { Quote } from '../../lib/types'

const quote: Quote = {
  service: { id: 11, name: 'Deep Tissue', duration_minutes: 45 }, master: { id: 5, name: 'Mara' }, start_at: '2026-10-05T09:00:00Z', end_at: '2026-10-05T09:45:00Z', duration_minutes: 45, currency: 'EUR',
  lines: { service_price: 60, extras: [{ id: 3, name: 'Hot towel', unit_price: 5, quantity: 1, line_total: 5 }], extras_total: 5 },
  list_amount: 65, discount: { amount: 6.5, label: '10% off treatments', source: 'tier_benefit' }, coupon: null, total_amount: 58.5,
  payment: { mode: 'at_venue', reason: 'payments_off' }, policy: { cancellation_policy: 'Free cancellation up to 24 hours before.', cancel_hours: 24 },
}

describe('PriceBreakdown', () => {
  it('itemises the lines, the discount and the total', () => {
    const html = render(<PriceBreakdown quote={quote} />)
    expect(html).toContain('Hot towel')
    expect(html).toContain('Subtotal')
    expect(html).toContain('10% off treatments')
    expect(html).toContain('−') // the discount sign
    expect(html).toContain('58.50')
  })
  it('explains an outbid coupon and warns on a wrong-scope one', () => {
    const outbid = render(<PriceBreakdown quote={{ ...quote, coupon: { source: 'offer', source_id: 1, label: 'Five off', status: 'outbid', discount: 5 } }} />)
    expect(outbid).toContain('we kept the bigger saving')
    const wrong = render(<PriceBreakdown quote={{ ...quote, coupon: { source: 'offer', source_id: 1, label: 'Stay deal', status: 'wrong_scope', discount: 0 } }} />)
    expect(wrong).toContain('role="alert"')
  })
})

describe('CouponField', () => {
  it('lists the member\'s unused claims and pending reward codes as chips, plus the code box', () => {
    const html = render(<CouponField value={null} onChange={() => {}} quote={quote} />, base, c => {
      c.setQueryData(['portal-offers'], { general: [], personalized: [{ id: 21, status: 'claimed', claimed_at: '2026-09-01', used_at: null, expires_at: null, offer: { id: 1, title: 'Welcome ten', description: '', type: 'discount', value: 10, image_url: null, end_date: null, terms_conditions: null, usage_limit: null, times_used: 0 } }] })
      c.setQueryData(['portal-redemptions'], { redemptions: [{ id: 31, code: 'REW-ABCD1234', status: 'pending', points_spent: 100, created_at: '2026-09-01', reward: { id: 2, name: 'Fifteen off', category: null, image_url: null, points_cost: 100 } }] })
    })
    expect(html).toContain('Welcome ten')
    expect(html).toContain('Fifteen off')
    expect(html).toContain('Have a code?')
    expect(html).toContain('aria-pressed="false"')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && npx vitest run src/portal/pages/book/review.test.tsx`
Expected: FAIL — modules missing.

- [ ] **Step 3: Write the three components**

```tsx
// frontend/src/portal/pages/book/PriceBreakdown.tsx
import { useTranslation } from 'react-i18next'
import { Money } from '../../ui/Money'
import { Notice } from '../../ui/Notice'
import { useVocab } from '../../lib/vocab'
import type { Quote } from '../../lib/types'

export function PriceBreakdown({ quote: q }: { quote: Quote }) {
  const { t } = useTranslation()
  const vocab = useVocab()
  const row = (label: string, amount: number, opts: { strong?: boolean; negative?: boolean } = {}) => (
    <div className={`flex justify-between gap-3 ${opts.strong ? 'font-p-display text-lg' : 'text-sm'}`}><span>{label}</span><span className="tabular-nums">{opts.negative && '−'}<Money amount={amount} currency={q.currency} /></span></div>
  )
  return (
    <div className="space-y-2">
      {row(q.service.name, q.lines.service_price)}
      {q.lines.extras.map(l => row(`${l.name}${l.quantity > 1 ? ` × ${l.quantity}` : ''}`, l.line_total))}
      <div className="border-t border-p-border pt-2">{row(t('portal.book.subtotal', 'Subtotal'), q.list_amount)}</div>
      {q.discount && row(q.discount.label, q.discount.amount, { negative: true })}
      <div className="border-t border-p-border pt-2">{row(t('portal.book.total', 'Total'), q.total_amount, { strong: true })}</div>
      {q.coupon?.status === 'outbid' && <Notice tone="info">{t('portal.book.coupon_outbid', 'Your membership discount is better than {{label}}, so we kept the bigger saving. The coupon stays available.', { label: q.coupon.label })}</Notice>}
      {q.coupon?.status === 'wrong_scope' && <Notice tone="warning">{t('portal.book.coupon_wrong_scope', '{{label}} does not apply to {{noun}}.', { label: q.coupon.label, noun: vocab('booking_plural') })}</Notice>}
    </div>
  )
}
```

```tsx
// frontend/src/portal/pages/book/CouponField.tsx
import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { apiErrorCode, portalApi } from '../../lib/portalApi'
import { Button } from '../../ui/Button'
import { Field, INPUT_CLASS } from '../../ui/Field'
import { Notice } from '../../ui/Notice'
import type { Claim, CouponRef, Quote, Redemption } from '../../lib/types'

const sameRef = (a: CouponRef | null, b: CouponRef) => !!a && JSON.stringify(a) === JSON.stringify(b)
const KNOWN = ['coupon_used', 'coupon_expired', 'coupon_wrong_tier', 'coupon_no_capacity', 'coupon_untyped'] as const

export function CouponField({ value, onChange, quote }: { value: CouponRef | null; onChange: (c: CouponRef | null) => void; quote: Quote | null }) {
  const { t } = useTranslation()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [applied, setApplied] = useState<string | null>(null)
  const offers = useQuery({ queryKey: ['portal-offers'], queryFn: portalApi.offers })
  const redemptions = useQuery({ queryKey: ['portal-redemptions'], queryFn: portalApi.redemptions })
  const resolve = useMutation({
    mutationFn: (c: string) => portalApi.resolveCoupon(c),
    onSuccess: r => { setError(null); setApplied(r.label); onChange(r.coupon); setCode('') },
    onError: e => { const c = apiErrorCode(e); setError(t(`portal.book.${(KNOWN as readonly string[]).includes(c ?? '') ? c : 'coupon_invalid'}`, 'That code did not work.')) },
  })
  const claims: Claim[] = (offers.data?.personalized ?? []).filter(c => !c.used_at && c.status !== 'used')
  const codes: Redemption[] = (redemptions.data?.redemptions ?? []).filter(r => r.status === 'pending')
  const chip = (ref: CouponRef, label: string, key: string) => {
    const on = sameRef(value, ref)
    return <button key={key} type="button" aria-pressed={on} className={`min-h-[44px] px-3 rounded-p-control border text-sm ${on ? 'bg-p-accent text-p-accent-ink border-p-accent' : 'bg-p-surface border-p-border'}`} onClick={() => { setError(null); setApplied(null); onChange(on ? null : ref) }}>{label}</button>
  }
  return (
    <section className="space-y-3" aria-label={t('portal.book.coupon', 'Coupon')}>
      <h3 className="text-sm font-medium">{t('portal.book.coupon_yours', 'Your coupons')}</h3>
      {claims.length + codes.length === 0
        ? <p className="text-sm text-p-text-2">{t('portal.book.coupon_none', 'No coupons yet. Codes from the venue go here.')}</p>
        : <div className="flex flex-wrap gap-2">{claims.map(c => chip({ member_offer_id: c.id }, c.offer.title, `o${c.id}`))}{codes.map(r => chip({ redemption_id: r.id }, r.reward?.name ?? r.code, `r${r.id}`))}</div>}
      <form className="flex gap-2 items-end" onSubmit={e => { e.preventDefault(); if (code.trim()) resolve.mutate(code.trim()) }}>
        <div className="flex-1"><Field label={t('portal.book.coupon_code', 'Have a code?')}><input className={INPUT_CLASS} value={code} onChange={e => setCode(e.target.value.toUpperCase())} autoCapitalize="characters" maxLength={32} /></Field></div>
        <Button type="submit" variant="secondary" loading={resolve.isPending}>{t('portal.book.coupon_apply', 'Apply')}</Button>
      </form>
      {error && <Notice tone="danger">{error}</Notice>}
      {applied && quote?.coupon?.status === 'applied' && <Notice tone="success">{t('portal.book.coupon_applied', '{{label}} applied', { label: applied })}</Notice>}
      {value && <Button type="button" variant="ghost" size="sm" onClick={() => { onChange(null); setApplied(null); setError(null) }}>{t('portal.book.coupon_remove', 'Remove')}</Button>}
    </section>
  )
}
```

```tsx
// frontend/src/portal/pages/book/ReviewStep.tsx
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { apiErrorCode, portalApi } from '../../lib/portalApi'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { Field, INPUT_CLASS } from '../../ui/Field'
import { Notice } from '../../ui/Notice'
import { Skeleton } from '../../ui/Skeleton'
import { Stepper } from '../../ui/Stepper'
import { Toggle } from '../../ui/Toggle'
import { Money } from '../../ui/Money'
import { DateTime } from '../../ui/DateTime'
import { PriceBreakdown } from './PriceBreakdown'
import { CouponField } from './CouponField'
import type { BookState } from './steps'
import type { Catalogue, Quote, QuoteBody } from '../../lib/types'

interface Props { catalogue: Catalogue; state: BookState; onChange: (patch: Partial<BookState>) => void; onBack: () => void; onContinue: (quote: Quote) => void }

export function quoteBody(s: BookState): QuoteBody {
  return { service_id: s.serviceId!, master_id: s.masterId, start_at: s.startAt!, party_size: s.partySize, extras: s.extras.map(id => ({ id, quantity: 1 })), coupon: s.coupon }
}

export function ReviewStep({ catalogue, state, onChange, onBack, onContinue }: Props) {
  const { t } = useTranslation()
  const [notes, setNotes] = useState(state.notes)
  useEffect(() => { const h = setTimeout(() => onChange({ notes }), 300); return () => clearTimeout(h) }, [notes]) // eslint-disable-line react-hooks/exhaustive-deps
  const body = useMemo(() => quoteBody(state), [state.serviceId, state.masterId, state.startAt, state.partySize, state.extras, state.coupon]) // eslint-disable-line react-hooks/exhaustive-deps
  const quote = useQuery({ queryKey: ['portal-quote', body], queryFn: () => portalApi.quote(body), retry: false })
  const code = quote.isError ? apiErrorCode(quote.error) : null
  const service = catalogue.services.find(s => s.id === state.serviceId)

  return (
    <div className="space-y-5">
      <Card>
        <p className="font-medium">{service?.name}</p>
        {state.startAt && <p className="text-sm text-p-text-2"><DateTime iso={state.startAt} mode="datetime" /></p>}
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>{t('portal.book.change', 'Change')}</Button>
      </Card>
      <Stepper label={t('portal.book.party_size', 'How many people')} value={state.partySize} min={1} max={10} onChange={v => onChange({ partySize: v })} fewerLabel={t('portal.book.fewer', 'Fewer')} moreLabel={t('portal.book.more', 'More')} />
      {catalogue.extras.length > 0 && (
        <section className="space-y-2"><h3 className="text-sm font-medium">{t('portal.book.extras', 'Add-ons')}</h3>
          {catalogue.extras.map(x => <Toggle key={x.id} label={x.name} hint={<Money amount={x.price} currency={catalogue.rules.currency} /> as unknown as string} checked={state.extras.includes(x.id)} onChange={on => onChange({ extras: on ? [...state.extras, x.id] : state.extras.filter(id => id !== x.id) })} />)}
        </section>
      )}
      <Field label={t('portal.book.notes', 'Anything we should know?')} hint={t('portal.book.notes_hint', 'Optional')}><textarea className={INPUT_CLASS} rows={3} maxLength={500} value={notes} onChange={e => setNotes(e.target.value)} /></Field>
      <CouponField value={state.coupon} onChange={c => onChange({ coupon: c })} quote={quote.data ?? null} />
      {quote.isPending && <Skeleton className="h-28" />}
      {code === 'slot_taken' && <Notice tone="warning">{t('portal.book.slot_taken', 'That time was just taken. Please pick another.')} <button type="button" className="underline" onClick={onBack}>{t('portal.book.change', 'Change')}</button></Notice>}
      {quote.isError && code !== 'slot_taken' && !code?.startsWith('coupon_') && <Notice tone="danger">{t('portal.common.error', 'Something went wrong. Please try again.')}</Notice>}
      {quote.data && <Card tone="paper"><PriceBreakdown quote={quote.data} /></Card>}
      {quote.data?.policy.cancellation_policy && <p className="text-xs text-p-text-2"><span className="font-medium">{t('portal.bookings.policy', 'Cancellation policy')}:</span> {quote.data.policy.cancellation_policy}</p>}
      <Button type="button" full disabled={!quote.data} onClick={() => quote.data && onContinue(quote.data)}>{t('portal.book.continue', 'Continue')}</Button>
    </div>
  )
}
```

If `Toggle`'s `hint` prop is typed as `string`, widen it to `ReactNode` in `ui/Toggle.tsx` (one-line change) instead of the cast above. A coupon error from the quote (`coupon_*`) clears the selection: add `useEffect(() => { if (code?.startsWith('coupon_')) onChange({ coupon: null }) }, [code])` with the same eslint note.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx tsc -b && npx vitest run && npx eslint src/portal`
Expected: `review.test.tsx` 3 passed; sweeps green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/portal/pages/book frontend/src/portal/ui/Toggle.tsx
git commit -m "Show the member their price, let them add extras and apply one coupon

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 17: Pay step, confirm, and the confirmation banner with calendar download

**Files:**
- Create: `frontend/src/portal/pages/book/StripePayment.tsx`, `pay.test.tsx`
- Modify: `frontend/src/portal/pages/book/PayStep.tsx` (replace the stub), `frontend/src/portal/pages/Bookings.tsx` (`?confirmed=1` banner), `frontend/src/portal/pages/BookingSheet.tsx` (`Add to calendar`)

**Interfaces:**
- Produces: `PayStep({ quote, state, onBack(to: 'when' | 'review'), onDone(booking) })`, `StripePayment({ clientSecret, publishableKey, onPaid(paymentIntentId), payLabel })` (default export, lazy), the Bookings banner and the sheet action, as below.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/portal/pages/book/pay.test.tsx
import { describe, expect, it, vi } from 'vitest'
import { render, base } from './testUtils'
import { PayStep } from './PayStep'
import { initialState } from './steps'
import type { Quote } from '../../lib/types'

vi.mock('./StripePayment', () => ({ default: () => <div data-stripe-mounted="1" /> }))

const quote: Quote = { service: { id: 11, name: 'Deep Tissue', duration_minutes: 45 }, master: null, start_at: '2026-10-05T09:00:00Z', end_at: '2026-10-05T09:45:00Z', duration_minutes: 45, currency: 'EUR', lines: { service_price: 60, extras: [], extras_total: 0 }, list_amount: 60, discount: null, coupon: null, total_amount: 60, payment: { mode: 'at_venue', reason: 'payments_off' }, policy: { cancellation_policy: null, cancel_hours: 24 } }
const state = { ...initialState, serviceId: 11, startAt: '2026-10-05T09:00:00Z', step: 'pay' as const }

describe('PayStep', () => {
  it('at the venue: explains there is nothing to pay now and offers confirm', () => {
    const html = render(<PayStep quote={quote} state={state} onBack={() => {}} onDone={() => {}} />)
    expect(html).toContain('Nothing to pay now')
    expect(html).toContain('Confirm booking')
    expect(html).not.toContain('Loading secure payment')
  })
  it('online: asks for the payment intent and shows the loading copy first', () => {
    const online = { ...quote, payment: { mode: 'online' as const, reason: null } }
    const html = render(<PayStep quote={online} state={state} onBack={() => {}} onDone={() => {}} />, { ...base, capabilities: { ...base.capabilities, payments: { services: true, stays: false, publishable_key: 'pk_test_x' } } })
    expect(html).toContain('Loading secure payment')
    expect(html).not.toContain('Confirm booking')
  })
})
```

Plus two cases in `Bookings.test.tsx` / a new `bookingSheet.test.tsx`: `?confirmed=1` renders "You're booked" with the reference of the seeded booking; the sheet renders "Add to calendar".

- [ ] **Step 2: Run** `cd frontend && npx vitest run src/portal/pages/book/pay.test.tsx src/portal/pages/Bookings.test.tsx` → FAIL.

- [ ] **Step 3: Write PayStep, StripePayment, the banner and the sheet action**

```tsx
// frontend/src/portal/pages/book/StripePayment.tsx
import { useEffect, useMemo, useState } from 'react'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { Button } from '../../ui/Button'
import { Notice } from '../../ui/Notice'
import { stripeAppearance, stripeFor } from '../../lib/stripe'

interface Props { clientSecret: string; publishableKey: string; onPaid: (paymentIntentId: string) => void; payLabel: string }

/** Stripe's Payment Element in the portal's colours; only ever loaded on the Pay step. */
export default function StripePayment({ clientSecret, publishableKey, onPaid, payLabel }: Props) {
  const stripePromise = useMemo(() => stripeFor(publishableKey), [publishableKey])
  const [dark, setDark] = useState(false)
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-portal]')
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    setDark(root?.dataset.portalTheme === 'dark' || (root?.dataset.portalTheme !== 'light' && mq.matches))
  }, [])
  const appearance = useMemo(() => stripeAppearance(document.querySelector<HTMLElement>('[data-portal]'), dark), [dark])
  return (
    <Elements stripe={stripePromise} options={{ clientSecret, appearance }}>
      <PayForm onPaid={onPaid} payLabel={payLabel} />
    </Elements>
  )
}

function PayForm({ onPaid, payLabel }: { onPaid: (id: string) => void; payLabel: string }) {
  const stripe = useStripe()
  const elements = useElements()
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pay = async () => {
    if (!stripe || !elements) return
    setBusy(true); setError(null)
    const result = await stripe.confirmPayment({ elements, redirect: 'if_required', confirmParams: { return_url: window.location.href } })
    setBusy(false)
    if (result.error) { setError(result.error.message ?? 'Payment failed'); return }
    const pi = result.paymentIntent
    if (pi && (pi.status === 'requires_capture' || pi.status === 'succeeded')) onPaid(pi.id)
    else setError('Payment was not completed')
  }
  return (
    <div className="space-y-3">
      <PaymentElement onReady={() => setReady(true)} />
      {error && <Notice tone="danger">{error}</Notice>}
      <Button type="button" full disabled={!ready} loading={busy} onClick={pay}>{payLabel}</Button>
    </div>
  )
}
```

```tsx
// frontend/src/portal/pages/book/PayStep.tsx
import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { usePortal } from '../../PortalProvider'
import { apiErrorCode, portalApi } from '../../lib/portalApi'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { Notice } from '../../ui/Notice'
import { Skeleton } from '../../ui/Skeleton'
import { PriceBreakdown } from './PriceBreakdown'
import { quoteBody } from './ReviewStep'
import type { BookState } from './steps'
import type { PortalBooking, Quote } from '../../lib/types'

const StripePayment = lazy(() => import('./StripePayment'))

interface Props { quote: Quote; state: BookState; onBack: (to: 'when' | 'review') => void; onDone: (booking: PortalBooking) => void }

export function PayStep({ quote, state, onBack, onDone }: Props) {
  const { t } = useTranslation()
  const { data } = usePortal()
  const online = quote.payment.mode === 'online' && quote.total_amount > 0
  const key = useRef<string>(typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `k-${Date.now()}-${Math.random()}`)
  const [error, setError] = useState<string | null>(null)

  const intent = useMutation({ mutationFn: () => portalApi.paymentIntent(quoteBody(state)) })
  useEffect(() => { if (online) intent.mutate() }, [online]) // eslint-disable-line react-hooks/exhaustive-deps

  const confirm = useMutation({
    mutationFn: (paymentIntentId: string | null) => portalApi.confirm({ ...quoteBody(state), notes: state.notes || null, payment_intent_id: paymentIntentId }, key.current),
    onSuccess: r => onDone(r.booking),
    onError: e => {
      const code = apiErrorCode(e)
      if (code === 'slot_taken') { setError(t('portal.book.slot_taken', 'That time was just taken. Please pick another.')); onBack('when'); return }
      if (code === 'payment_mismatch') { setError(t('portal.book.payment_mismatch', 'The price changed. Please review and pay again.')); onBack('review'); return }
      setError(t('portal.common.error', 'Something went wrong. Please try again.'))
    },
  })

  return (
    <div className="space-y-5">
      <Card tone="paper"><PriceBreakdown quote={quote} /></Card>
      {error && <Notice tone="danger">{error}</Notice>}
      {!online && (
        <>
          <Notice tone="info">{t('portal.book.pay_at_venue_note', 'Nothing to pay now. Settle up when you visit.')}</Notice>
          <Button type="button" full loading={confirm.isPending} onClick={() => confirm.mutate(null)}>{confirm.isPending ? t('portal.book.confirming', 'Confirming…') : t('portal.book.confirm', 'Confirm booking')}</Button>
        </>
      )}
      {online && intent.isPending && <><p className="text-sm text-p-text-2">{t('portal.book.card_loading', 'Loading secure payment…')}</p><Skeleton className="h-40" /></>}
      {online && intent.isError && (
        <Notice tone="warning">{apiErrorCode(intent.error) === 'pay_at_venue' ? t('portal.book.pay_at_venue_note', 'Nothing to pay now. Settle up when you visit.') : t('portal.book.card_unavailable', 'Online payment is unavailable right now. Please try again in a moment.')} <button type="button" className="underline" onClick={() => intent.mutate()}>{t('portal.common.retry', 'Try again')}</button></Notice>
      )}
      {online && intent.data && data?.capabilities.payments.publishable_key && (
        <Suspense fallback={<Skeleton className="h-40" />}>
          <StripePayment clientSecret={intent.data.client_secret} publishableKey={data.capabilities.payments.publishable_key} payLabel={t('portal.book.pay_online', 'Pay now')} onPaid={id => confirm.mutate(id)} />
        </Suspense>
      )}
      {confirm.isPending && online && <p className="text-sm text-p-text-2">{t('portal.book.confirming', 'Confirming…')}</p>}
    </div>
  )
}
```

Bookings page: read `confirmed` from the search params; when set and the sheet's booking is loaded (or the list contains the `:id`), render `<Notice tone="success"><strong>{t('portal.book.confirmed_title', "You're booked")}</strong> {t('portal.book.confirmed_body', 'Reference {{reference}}. We\'ve emailed the details.', { reference })}</Notice>` above the tabs. BookingSheet: a `Button variant="secondary" size="sm"` labelled `portal.book.add_to_calendar` calling `downloadIcs(buildIcs(b, { name: venue.name, timezone: venue.timezone }), `${b.reference}.ics`)`.

- [ ] **Step 4: Run** `cd frontend && npx tsc -b && npx vitest run && npx eslint src/portal` → pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/portal/pages/book frontend/src/portal/pages/Bookings.tsx frontend/src/portal/pages/BookingSheet.tsx frontend/src/portal/pages/Bookings.test.tsx
git commit -m "Take the payment with Stripe or at the venue, confirm the booking and offer a calendar file

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 18: Wire the flow into the shell — nav item, Home prompt, tests

**Files:**
- Modify: `frontend/src/portal/PortalShell.tsx` (`:23-28`, `:94`), `PortalShell.test.tsx` (`:63-65`), `frontend/src/portal/pages/Home.tsx`, `Home.test.tsx`

- [ ] **Step 1: Write the failing tests** — in `PortalShell.test.tsx` replace the "never links to Book" case with:

```tsx
it('links to Book when the venue takes appointments and not otherwise', () => {
  expect(render(withCaps({ services: true }))).toContain('href="/portal/book"')
  expect(render(withCaps({ services: false }))).not.toContain('href="/portal/book"')
})
it('lays five items out in five columns on phones', () => {
  expect(render(withCaps({ services: true, loyalty: true }))).toContain('grid-cols-5')
})
```

(`withCaps` = the file's existing bootstrap factory with capability overrides.) In `Home.test.tsx`: `it('invites the member to book when nothing is booked', () => { expect(render(base, clientWith([]))).toContain('href="/portal/book"') })`.

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** — nav item `{ to: '/portal/book', label: t('portal.nav.book', 'Book'), icon: CalendarPlus, show: !!caps?.services }` inserted after Home; the grid class from `const COLS: Record<number, string> = { 3: 'grid-cols-3', 4: 'grid-cols-4', 5: 'grid-cols-5' }`; Home: when `capabilities.services` and the upcoming list has loaded empty, a primary `Link` styled as a button (`bg-p-accent text-p-accent-ink rounded-p-control min-h-[44px] …`) with `t('portal.book.cta_home', 'Book {{noun}}', { noun: vocab('booking') })`; when there is an upcoming booking, the same link as a secondary quick action. Update the shell's doc comment (`:12-17`).

- [ ] **Step 4: Run** `cd frontend && npx tsc -b && npx vitest run && npx eslint src/portal` → pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/portal/PortalShell.tsx frontend/src/portal/PortalShell.test.tsx frontend/src/portal/pages/Home.tsx frontend/src/portal/pages/Home.test.tsx
git commit -m "Put Book in the portal's navigation and on the home page

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 19: Admin screens — typed benefits, offer codes, reward discounts, portal bookings badge

**Files:**
- Modify: `frontend/src/pages/Tiers.tsx` (`TierBenefit` interface `:45-53`, assign form `:437-446`, list `:426-433`), `frontend/src/pages/Offers.tsx` (form init `:130-134`, type select `:231`, fields near `:250`), `frontend/src/pages/Rewards.tsx` (reward form), `frontend/src/pages/ServiceBookings.tsx` (list rows + detail: source badge, member link, discount line), `frontend/src/i18n/locales/{en,ru,de,fr,es}/common.json` (admin keys)
- Test: `frontend/src/pages/Tiers.benefits.test.tsx` (or extend an existing Tiers test if one exists), `frontend/src/pages/ServiceBookings.portal.test.tsx`

**Interfaces:**
- Tiers assign form: `value_type` select (text / percent_discount / fixed_amount / points_multiplier / free_item, labels from `DiscountService::VALUE_TYPES` order), `value_amount` number input shown for the three numeric types, `applies_to` select (all / services / stays); the list shows `display` as "10% off · services"; posting includes the three fields; editing an assigned benefit pre-fills them (so re-assigning never resets).
- Offers form: `code` (upper-cased on blur, 4–24), `tier_ids` multi-select from `/v1/admin/tiers`, `per_member_limit`, `applies_to`; `type` gains `fixed_amount`; the 422 message from the server is shown by the form's existing error toast.
- Rewards form: `discount_type` select (none / percent / fixed), `discount_value`, `applies_to`.
- Service bookings: a "Member portal" `Chip` when `source === 'member_portal'`, the member's name linking to the member page when `member` is present, and "List X · Discount −Y (label)" under the total when `discount`.
- Admin keys (`common.json`, all five): `tiers.value_type`, `tiers.value_amount`, `tiers.applies_to`, `tiers.applies.all|services|stays`, `tiers.types.text|percent_discount|fixed_amount|points_multiplier|free_item`, `offers.form.code`, `offers.form.code_hint` ("Members type this in the portal"), `offers.form.tiers`, `offers.form.per_member_limit`, `offers.form.applies_to`, `offers.types.fixed_amount`, `rewards.form.discount_type`, `rewards.form.discount_value`, `rewards.form.applies_to`, `service_bookings.source_portal` ("Member portal"), `service_bookings.list_price`, `service_bookings.discount`.

- [ ] **Step 1: Write the failing tests**

Admin pages are large and fetch on mount; test the extracted pieces, not the pages. Extract two small components in this task and test those:

```tsx
// frontend/src/components/admin/BenefitValueFields.tsx — the typed part of the Tiers assign form
import { useTranslation } from 'react-i18next'

export const VALUE_TYPES = ['text', 'percent_discount', 'fixed_amount', 'points_multiplier', 'free_item'] as const
export type ValueType = typeof VALUE_TYPES[number]
export const SCOPES = ['all', 'services', 'stays'] as const
export type Scope = typeof SCOPES[number]
export interface BenefitValue { value: string; value_type: ValueType; value_amount: string; applies_to: Scope }

export function BenefitValueFields({ value, onChange }: { value: BenefitValue; onChange: (v: BenefitValue) => void }) {
  const { t } = useTranslation()
  const numeric = value.value_type === 'percent_discount' || value.value_type === 'fixed_amount' || value.value_type === 'points_multiplier'
  const cls = 'w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white'
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <label className="block text-sm text-[#a0a0a0]">{t('tiers.value_type', 'Value type')}
        <select className={cls} value={value.value_type} onChange={e => onChange({ ...value, value_type: e.target.value as ValueType })}>
          {VALUE_TYPES.map(v => <option key={v} value={v}>{t(`tiers.types.${v}`, v)}</option>)}
        </select>
      </label>
      {numeric && <label className="block text-sm text-[#a0a0a0]">{t('tiers.value_amount', 'Amount')}
        <input className={cls} type="number" min={0} step="0.01" value={value.value_amount} onChange={e => onChange({ ...value, value_amount: e.target.value })} />
      </label>}
      <label className="block text-sm text-[#a0a0a0]">{t('tiers.applies_to', 'Applies to')}
        <select className={cls} value={value.applies_to} onChange={e => onChange({ ...value, applies_to: e.target.value as Scope })}>
          {SCOPES.map(s => <option key={s} value={s}>{t(`tiers.applies.${s}`, s)}</option>)}
        </select>
      </label>
    </div>
  )
}

/** "10% off · services" — the line the Tiers list prints for an assigned benefit. */
export function benefitDisplay(tb: { value: string | null; value_type: string; value_amount: number | string | null; applies_to?: string | null }, t: (k: string, f: string) => string): string {
  const amount = Number(tb.value_amount ?? 0)
  const typed = tb.value_type === 'percent_discount' ? `${amount}% off` : tb.value_type === 'fixed_amount' ? `${amount.toFixed(2)} off` : tb.value_type === 'points_multiplier' ? `${amount}× points` : (tb.value ?? '')
  const scope = tb.applies_to && tb.applies_to !== 'all' ? ` · ${t(`tiers.applies.${tb.applies_to}`, tb.applies_to)}` : ''
  return typed + scope
}
```

```tsx
// frontend/src/components/admin/ServiceBookingPricing.tsx — the source badge, member link and discount line for a row/detail
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

interface Row { source: string; member?: { id: number; name: string; member_number: string } | null; list_amount?: number | null; discount?: { amount: number; label: string } | null; total_amount: number | string; currency: string }

export function ServiceBookingPricing({ row }: { row: Row }) {
  const { t } = useTranslation()
  return (
    <div className="text-xs text-[#a0a0a0] space-y-0.5">
      {row.source === 'member_portal' && <span className="inline-block px-2 py-0.5 rounded bg-primary-500/20 text-primary-300">{t('service_bookings.source_portal', 'Member portal')}</span>}
      {row.member && <div><Link className="underline" to={`/members/${row.member.id}`}>{row.member.name}</Link> · {row.member.member_number}</div>}
      {row.discount && <div>{t('service_bookings.list_price', 'List')} {Number(row.list_amount ?? 0).toFixed(2)} · {t('service_bookings.discount', 'Discount')} −{row.discount.amount.toFixed(2)} ({row.discount.label})</div>}
    </div>
  )
}
```

Tests (`frontend/src/components/admin/BenefitValueFields.test.tsx`, `ServiceBookingPricing.test.tsx`, render-to-string with the admin `react-i18next` mock the other `src/pages/*.test.tsx` files use): the fields render the amount input only for numeric types; `benefitDisplay` gives `10% off · services` and falls back to the prose for `text`; the pricing component shows the badge, the member link `href="/members/7"` and the `−6.00` discount line for a portal row, and nothing but the total for a widget row.

- [ ] **Step 2: Run** `cd frontend && npx vitest run src/components/admin` → FAIL.

- [ ] **Step 3: Implement and wire** — write the two components; in `Tiers.tsx` extend the `TierBenefit` interface with `value_type`, `value_amount`, `applies_to`, replace the assign form's free-text-only input with `<BenefitValueFields>` (+ the existing `value` text input), post all four fields, pre-fill them when an assigned benefit is edited, and print `benefitDisplay(tb, t)` in the list; in `Offers.tsx` add `code` (upper-cased on blur, `maxLength 24`), `tier_ids` (checkbox list from `/v1/admin/tiers`), `per_member_limit`, `applies_to`, and `fixed_amount` in the type select; in `Rewards.tsx` add `discount_type` / `discount_value` / `applies_to`; in `ServiceBookings.tsx` render `<ServiceBookingPricing row={b} />` under the total in the list row and in the detail panel. Add the admin keys to the five `common.json` files (the admin completeness sweep scans `src/pages` and `src/components`; confirm its `SCAN_TARGETS`).

- [ ] **Step 4: Run** `cd frontend && npx tsc -b && npx vitest run` → pass (3 known plannerMeta only).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/admin frontend/src/pages/Tiers.tsx frontend/src/pages/Offers.tsx frontend/src/pages/Rewards.tsx frontend/src/pages/ServiceBookings.tsx frontend/src/i18n/locales
git commit -m "Give admins the typed benefit, offer code and reward discount fields, and show portal bookings as such

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 20: Runbook, CLAUDE.md, spec notes

**Files:**
- Modify: `docs/member-portal.md` (a "Booking (phase 2)" section: endpoints, the pricing rule in one paragraph, coupon codes, payment modes, points on completion, the admin fields, how to test a payment locally — Stripe test keys in the venue's settings with mock mode off), `CLAUDE.md` "Member-portal code rules" (+ "Prices are computed server-side at quote, payment-intent and confirm; the client never sends a total. Coupons are explicit; automatic benefits are scoped by `applies_to`."), `docs/superpowers/specs/2026-09-23-member-portal-v2-design.md` (a note under §6 recording rulings plan2-1..8 by reference to this plan; the §6.4 endpoint list stays)
- Test: none (docs); `git diff --stat` shows only those three files.

- [ ] Steps: write → commit `Document how the portal books, prices and pays`.

---

### Task 21: Eyes first, batteries, a real test-mode payment

**Files:**
- Modify: whatever the eyes-first pass finds (each fix test-first in its own commit, as phase 1's Task 17 did)
- Screenshots: `C:\wamp64\www\Hexa-Tech-portal\.superpowers\shots\portal-v2-phase-2\` — `book-service`, `book-when`, `book-review`, `book-pay-online`, `book-pay-venue`, `book-done` at 390 and 1440, light and dark (24 shots), plus `admin-tiers-assign-1440`, `admin-offers-form-1440`, `admin-service-bookings-1440`

**Steps:**
- [ ] Start the rig as `docs/member-portal.md` says (artisan serve on 8010, Vite with `VITE_API_URL`); seed a local venue with a rota (`seedBookableSchedule`-shaped data through the admin screens or tinker), a Gold tier with a typed `10% off treatments` benefit (`services`), an offer with code `WELCOME10`, a typed reward; join as a member.
- [ ] Walk the four steps at 390 and 1440, light and dark; check against the spec §4 quality bar and the house style (two faces, one accent, the total in the display face, 44 px targets, contrast ≥ 4.5:1 measured on the discount and warning tones); apply Chanel's rule once.
- [ ] Real payment: put the owner's **Stripe test-mode** keys into the local venue's settings (Settings → Integrations → Stripe; `booking_payment_enabled` on, `booking_mock_mode` off, `stripe_currency` = the services currency). Pay with `4242 4242 4242 4242`; confirm the booking lands `authorized`, the Stripe dashboard shows the PI in `requires_capture` with the org/member metadata, and `bookings:capture-pending-pis --dry-run` lists it. If no test keys are available locally, run the at-venue path end to end, record "online path verified by tests only" in the report, and list the test-mode run as an owner item for the deploy day. Never commit or echo the keys.
- [ ] Batteries: `tests/Feature/Member/`, `tests/Feature/Loyalty/`, `tests/Feature/Booking/`, `tests/Feature/Mail/`, `tests/Feature/Admin/`, `tests/Feature/Widget/`, `tests/Feature/Landing/`, `tests/Unit/` (each by directory, foreground, read the `Tests:` line); `cd frontend && npx tsc -b && npx vitest run && npx eslint src/portal`.
- [ ] Ledger: the quality-bar answers and the screenshot list in the SDD ledger; report DONE / DONE_WITH_CONCERNS.

---

## Self-review (done while writing; the executor re-checks after Task 21)

- **Spec coverage:** §6.1 steps 1–5 → Tasks 7, 8, 9, 15–17; §6.2 → Tasks 3, 6; §6.3 → Tasks 3, 5; §6.4 → Tasks 9, 10 (incl. the policy key and the endpoint removal); §6.5 → Tasks 12, 13, 19; §6.6 → Task 11; §6.7 → Tasks 1 (scopeActive), 4; §6.8 → Task 1; §6.9 tests → each task's test file plus Task 21; §8 error codes → Tasks 8, 9, 17; §9 → Tasks 8, 9 (metadata checks), 5 (throttle), 4 (tenant scope); §10 phase 2 probe → the deploy round after this plan. Deferred by ruling: pay-at-venue fallback on a Stripe outage (plan2-3), the widget's own lock (plan2-1).
- **Types:** `BookingScope`, `CouponSelection`, `CouponException`, `PricingResult`, `MemberPricing`, `CouponResolver`, `ServiceQuoteBuilder`, `ServiceCatalogue`, `BookingPointsService`, `PortalBootstrap::{loyaltyOn, paymentMode}` are named identically in every task that uses them; the quote payload keys in Task 8 match the `Quote` type in Task 14; the confirm body keys match `ConfirmBody`.
- **Placeholders:** none; where a task asks the implementer to read a neighbouring line range before choosing a name, the range is given.
- **Review Focus:** the five lines each name a test in Tasks 3, 8, 9, 11.

## Execution handoff

Plan complete. The owner chose subagent-driven execution for phase 1; the same method is preserved for phase 2 unless the owner says otherwise. Execution starts only after the owner's review of this plan.
