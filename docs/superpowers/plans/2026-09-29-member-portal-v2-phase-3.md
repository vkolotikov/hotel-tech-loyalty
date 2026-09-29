# Member Portal v2 — Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A signed-in member books a room from the web portal at their member price with one coupon, pays with Stripe or at the venue, and can cancel their own service booking or stay inside the venue's cancellation window with the money returned, the coupon released and the points reversed — plus the two admin defects the owner reported and the items phase 2 deferred.

**Architecture:** The stays engine (`BookingEngineService`) stays the one writer of a stay; it gains a driver-aware lock, two in-transaction hooks and the member columns, and its widget behaviour is pinned by the first happy-path tests it has ever had. The portal wraps it with `PortalStayBookingController` (catalogue, availability, quote, payment intent, confirm) using a hold that carries its owner, the same `MemberPricing` and `PortalPaymentIntentGuard` phase 2 built, and the hold itself as the idempotency key. Cancellation is one service, `MemberCancellation`, Stripe-first under a row lock, with a small `CancellationPolicy` that both the booking DTOs and the cancel endpoint read. The frontend adds a `stay/` flow beside `book/` and a cancel action in the booking sheet.

**Tech Stack:** Laravel 13 (PHP 8.4), Sanctum, PHPUnit on in-memory sqlite with the repo's minimal-schema traits; React 19, react-router 7, TanStack Query 5, Tailwind 3.4, i18next, Vitest (node environment, render-to-string). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-23-member-portal-v2-design.md` — §7 (phase 3), §8 (errors), §9 (security), §10 (rollout), §11 (rulings), §12 (out of scope). Read it first. Where this plan departs from §7 it says so under "Rulings made while planning", with the reason. Planning notes with exact line references for every existing class this plan touches (untracked; read the one a task names): `.superpowers/sdd/portal-v2-phase-3-notes/{stays-engine-facts,cancellation-facts,carried-over-and-gating-facts,design-decisions}.md`.

## Global Constraints

- Work in worktree `C:\wamp64\www\Hexa-Tech-portal`, branch `feature/member-portal-v2-phase-3` (cut from production main `f2e8ee3d6`). Never push this branch to `main`; never commit `frontend/dist`, `public/spa` or `resources/spa-shell/index.html` from it. The branch has no upstream; if you ever push it, push with `git push -u origin feature/member-portal-v2-phase-3`.
- PHP is always `/c/wamp64/bin/php/php8.4.20/php.exe`. NEVER run a bare `php artisan test`; every run is scoped to a directory or file, run in the foreground with `--no-ansi`, and you read the `Tests:` summary line yourself.
- Tests run on in-memory sqlite (`phpunit.xml`), so Postgres-only SQL must be behind a driver check; `App\Support\AdvisoryLock` is the only place `pg_advisory_xact_lock` may appear in code this plan writes or touches.
- The local PostgreSQL database is shared with other checkouts: never `migrate` without `--path`, never `migrate:fresh`, never a truncating seeder. Only Task 23 runs this phase's one migration locally, by `--path`.
- Run `/c/wamp64/bin/php/php8.4.20/php.exe artisan view:clear` after every Blade change before testing.
- Frontend commands run in `C:\wamp64\www\Hexa-Tech-portal\frontend`; `node_modules` there is a real directory (it holds `@stripe/*`) — never delete it, never run `npm install` for a package this plan does not name (it names none). Checks: `npx tsc -b && npx vitest run` (3 `plannerMeta` failures are pre-existing) and `npx eslint src/portal`.
- Every commit message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` — that exact line, whatever model you are. Use the Edit/Write tools for file changes; Git Bash for POSIX commands.
- Portal code (`frontend/src/portal/**`) uses only `p-*` colour classes and the portal `ui/*` primitives; never `/v1/admin/*` (`tokens.test.ts` enforces both). Every portal string is `t('portal.<key>', 'English fallback')` with the key in all five `portal.<lang>.json` files (`portalLocales.test.ts` and `localeCompleteness.test.ts` enforce it); write real translations (en, ru, de, fr, es), never English placeholders.
- New API only under `member/portal/*`; every existing member endpoint keeps its shape except the one the spec removes (`POST member/reservations`, ruling portal-8). Error bodies from new endpoints are `{error: <snake_code>, message: <English sentence>}`.
- The server recomputes every amount at quote, payment-intent and confirm and never trusts a client total (spec §3.3). PaymentIntent metadata carries `org_id` and `member_id`; both are checked at confirm (§9).
- Money rules carried from phase 2, all binding here: one PaymentIntent pays for exactly one booking; a failed confirm releases the member's own hold; an intent a booking carries is never cancelled by a failed confirm; nobody can cancel an intent whose metadata names another member or organisation.
- The public booking widget (`/api/v1/booking/*`) must behave exactly as before: same request and response shapes, same mirror columns, same Smoobu payload for a booking without a member. Task 2's tests pin this before Task 3 changes the engine.
- Every Smoobu and Stripe touchpoint in tests is a Mockery mock; no test makes a real HTTP call. No Stripe key is ever written into a file, a test, a commit or a log.
- Migrations are additive, guarded with `hasColumn`/`hasTable`, and reversible (§6.8). The production deploy runs them with `--force`: a migration must never fail on unexpected data — it skips and logs instead.
- Body text contrast ≥ 4.5:1 in light and dark; every new screen is verified by eye at 390 and 1440 before tests are trusted (Task 23).

## Review Focus

Inputs the spec implies but no task's tests exercised at first draft; each now has a test in the task named.

1. A member **confirms a stay twice** (double tap, or a retry after a timeout) with the same hold: one mirror, one Smoobu reservation, one coupon consumption, and the second answer is the first booking with `replayed: true` — Task 8 `test_a_second_confirm_on_the_same_hold_replays_the_booking`.
2. A hold **quoted by one member** is used by another member of the same venue at payment-intent or confirm: 404 `hold_not_found`, nothing charged, nothing released — Task 7 `test_another_members_hold_answers_404`, Task 8 `test_another_members_hold_cannot_be_confirmed`.
3. The engine **fails after the mirror is committed** (the Smoobu price-breakdown call throws): the member still gets their booking and the authorised card is NOT released — Task 2 `test_a_price_breakdown_failure_after_commit_does_not_fail_the_confirm`, Task 8 `test_a_failure_after_the_booking_exists_never_releases_the_payment`.
4. A member cancels a booking whose **card is only authorised, not yet captured** (inside the first minutes): the hold is cancelled, not refunded, and the capture job never charges it afterwards — Task 11 `test_an_uncaptured_hold_is_cancelled_not_refunded`, Task 14 `test_a_cancelled_stay_is_released_not_captured`.
5. A member presses **Cancel twice**, or cancels a booking staff already cancelled: one refund, one coupon release, one email; the second answer is 409 `already_cancelled` — Task 13 `test_cancelling_twice_refunds_once`.
6. The 5-minute **Smoobu sync runs over a portal stay**: the channel stays "Member portal", the member link and the refund status survive — Task 3 `test_the_sync_keeps_the_portal_fields`.

## Rulings made while planning (spec silent or contradicted by the code; the owner may overturn any)

- **plan3-1** The portal books **single rooms only**. The spec's combination stays (§7.1, ruling portal-9) are deferred: `confirmCombo()` has no room lock, no inventory re-check and no live Smoobu re-check, and member money must not go through it. The portal's availability answer leaves `combinations` out; a party too large for any room is told to contact the venue. Cost if wrong: large parties book by phone or through the public widget.
- **plan3-2** `capabilities.stays` is "at least one active room and the Smoobu integration switched on"; the `industry === 'hotel'` condition goes (CLAUDE.md: booking is gated on capability, not industry). With Smoobu off the engine writes a mirror nobody can see, so stays are not offered. Cost if wrong: a non-hotel venue with active rooms shows "Book a stay" to members — it already sells those rooms on its public widget.
- **plan3-3** The engine changes are made inside `BookingEngineService::confirm()` rather than in a parallel portal confirm: one writer per booking kind (spec ruling portal-8's reason). The widget path is pinned by tests first (Task 2).
- **plan3-4** A stay's idempotency key is its hold: a hold is consumed once, and a confirm on a consumed hold of the same member replays the booking. No `Idempotency-Key` header on the stays confirm.
- **plan3-5** The PaymentIntent of a portal stay names its hold under the metadata key `portal_hold_token`, not `hold_token`: the latter makes `StripeService` derive a Stripe idempotency key (a cancelled intent would be handed back on a retry) and makes the webhook's orphan recovery write a "Website" mirror with no member.
- **plan3-6** Portal stays are captured by the ten-minute capture job, as portal services are, not synchronously. A cancellation inside those minutes therefore releases a hold instead of refunding a charge.
- **plan3-7** A pay-at-venue stay stores `payment_status = 'open'` (an existing enum case the portal already labels) and `payment_method = 'pay_at_venue'`.
- **plan3-8** The Smoobu sync keeps what the portal wrote: the channel name, the member's guest link, a refund/dispute/cancelled/authorised payment status, and a member cancellation (Task 3). Cost if wrong: a status Smoobu legitimately changed is not mirrored for those rows; staff see it in Smoobu.
- **plan3-9** Cancellation is Stripe-first under a row lock: the booking becomes cancelled only once the money is returned (or none was taken). A Stripe failure answers 502 `refund_failed` and changes nothing. Cancellation fees and partial refunds stay out of scope (spec §12): a self-service cancellation always returns the full amount.
- **plan3-10** A released, never-captured hold stores `payment_status = 'cancelled'`; a returned capture stores `refunded` (the spec says `refunded` for both; "refunded" for money that never left the card is wrong on the member's screen). The capture job's US spelling `canceled` is corrected to `cancelled`.
- **plan3-11** A stay is self-cancellable only when it is a direct booking (`channel_name` "Website" or "Member portal"), is not part of a combination (`booking_group_id` null), and its payment is not refunded, partially refunded, disputed or channel-managed. The deadline is the arrival date at the venue's check-in time (`booking_policies.check_in_time`, default 15:00) in the venue's timezone, minus `booking_cancel_hours`.
- **plan3-12** `booking_mirror.member_id` is an indexed column without a database foreign key, like `service_bookings.member_id` (the guarded migration cannot add one to an existing table on every driver).
- **plan3-13** Staff-side cancellation is unchanged (spec §7.2); the capture job releases the hold of any cancelled booking, service or stay (Task 14).
- **plan3-15** `capabilities.stays`, like `capabilities.services`, needs a membership row: quote, payment intent and confirm all refuse without one, and the portal must not offer a page that cannot finish.
- **plan3-16** The sidebar item for the service BOOKINGS list is relabelled "… bookings" for the industries whose vocabulary gave it the same word as the catalogue (beauty, medical, education, other); the catalogue keeps the industry's word.
- **plan3-14** Not built in this phase, recorded in the runbook: redirect payment methods, "pay at the venue although we take cards", combination stays, and serialising the `svc:` and `svcm:` slot locks against each other.

**Decided by the owner on 2026-09-29, after reading this plan:**

- **Every industry has memberships**, medical included — Task 24 (rulings plan3-17 … plan3-21 are there). Portal booking without a membership row is therefore not built: a venue gets its membership rows with its programme.
- **The public booking is not to be changed.** It works for the venues that use it. That covers the add-on pricing (`calcExtras()` charges price × quantity whatever the add-on's type): it stays, and the portal shows the engine's own line totals, never a price it multiplied itself. It is also the reason the "widget" tests of Task 2 exist: no task of this plan may change what the public widget asks, answers, stores or sends.

**Execution order:** Tasks 1 to 21, then 24, then 22 (documents) and 23 (verification).

## File map

Backend (create unless marked modify):

| File | Responsibility |
|---|---|
| `database/migrations/2026_09_30_100000_member_portal_phase_3.php` | every column and index of this phase, guarded and reversible |
| `app/Models/{BookingMirror,ServiceBooking}.php` (modify) | fillables/casts for the new columns |
| `tests/Concerns/SetsUpStayBookingSchema.php` | the tables a stay touches end to end, shaped like the real migrations |
| `app/Services/Booking/StayConfirmHooks.php` | the two in-transaction hooks `BookingEngineService::confirm()` calls |
| `app/Services/BookingEngineService.php` (modify) | lock through `AdvisoryLock`, `Log` import, hooks, member columns, Smoobu payload, sync pins, emails |
| `app/Mail/BookingConfirmationMail.php` + `resources/views/emails/booking-confirmation.blade.php` (modify) | discount line; policy key |
| `app/Services/Booking/StayCatalogue.php` | rooms, extras, policies, limits for an organisation |
| `app/Services/Booking/StayQuoteService.php`, `StayQuoteException.php` | engine quote → member price → the hold carries its owner |
| `app/Services/Booking/BookingCapability.php` (modify) | `staysBookableOnline()` |
| `app/Services/Booking/PortalStayHooks.php` | the portal's implementation of `StayConfirmHooks` |
| `app/Services/Booking/PortalStayNotifier.php` | realtime event and audit row after a portal stay |
| `app/Services/Booking/PortalPaymentIntentGuard.php` (modify) | `verifyStay()`; `carried()` reads both tables |
| `app/Http/Controllers/Api/V1/Member/Portal/PortalStayBookingController.php` | index, availability, quote, paymentIntent, confirm |
| `app/Services/Portal/PortalBootstrap.php` (modify) | `capabilities.stays`, stays policy, timezone fallback |
| `app/Services/Loyalty/BookingPointsService.php` (modify), `app/Console/Commands/AwardStayPoints.php` | points for completed stays |
| `app/Services/Booking/CancellationPolicy.php` | can this booking be cancelled by its member, and until when |
| `app/Services/Portal/MemberBookingQuery.php` (modify) | `can_cancel`, `cancel_deadline`, stay discount/notes/status, `member_id` ownership for stays |
| `app/Services/Booking/ServiceBookingRefund.php` | returns the money of a service booking: cancel a hold or refund a capture |
| `app/Services/Booking/MemberCancellation.php`, `CancellationException.php`, `CouponRelease.php` | the cancellation itself |
| `app/Services/Booking/PortalCancellationNotifier.php`, `app/Mail/{BookingCancelledMail,AdminBookingCancelledMail}.php`, `resources/views/emails/{booking-cancelled,admin-booking-cancelled}.blade.php` | what happens after |
| `app/Http/Controllers/Api/V1/Member/Portal/PortalBookingController.php` (modify) | `cancel()` |
| `app/Console/Commands/CapturePendingPaymentIntents.php` (modify) | cancelled stays; spelling |
| `app/Http/Controllers/Api/V1/BookingPublicController.php` (modify, `handleChargeRefunded` only) | a refund on a service booking's intent is recorded, not reported as a cross-tenant attempt |
| `app/Console/Commands/ReleaseOrphanPortalHolds.php`, `app/Services/StripeService.php` (modify) | the orphaned-authorisation sweeper |
| `app/Console/Commands/DiagOrphanStripePis.php` (modify) | knows service bookings |
| `app/Http/Controllers/Api/V1/{ServicePublicController,Widget/WidgetChatController,Admin/ServiceBookingController}.php` (modify) | inline lock statement → `AdvisoryLock::within()` |
| `app/Http/Controllers/Api/V1/Member/MemberReservationController.php` (delete), `routes/api.php`, `routes/console.php` (modify) | routes, schedule, the retired endpoint |
| `tests/Feature/Booking/{Phase3MigrationTest,BookingEngineConfirmTest,BookingEngineSyncPinTest,StayCatalogueTest,StayQuoteServiceTest,AwardStayPointsTest,CancellationPolicyTest,ServiceBookingRefundTest,MemberCancellationTest,ReleaseOrphanPortalHoldsTest}.php`, `tests/Feature/Member/Portal/{PortalStayCatalogueTest,PortalStayBookingTest,PortalCancellationTest}.php`, `tests/Feature/Mail/BookingCancelledMailTest.php` | tests |

Frontend (create unless marked modify):

| File | Responsibility |
|---|---|
| `frontend/src/portal/lib/{types,portalApi}.ts` (modify) | stay types and calls, the cancel call, the new error codes |
| `frontend/src/portal/i18n/portal.{en,ru,de,fr,es}.json` (modify) | the `stay` block, cancel copy, new error sentences |
| `frontend/src/portal/pages/stay/{StayBook,staySteps,DatesStep,RoomStep,StayReviewStep,StayPriceBreakdown,StayPayStep}.tsx/.ts` | the stay flow |
| `frontend/src/portal/pages/stay/{stayTestUtils}.tsx`, `frontend/src/portal/pages/stay/*.test.ts(x)` | fixtures and tests |
| `frontend/src/portal/pages/book/{CouponField,StepStrip}.tsx` (modify) | accept any quote that carries a `coupon`; any flow's step names |
| `frontend/src/portal/pages/BookEntry.tsx` | where "Book" leads: the one flow a venue has, or a choice between the two |
| `frontend/src/portal/pages/{cancelBooking.ts,CancelPanel.tsx}`, `frontend/src/portal/pages/{BookingSheet,Home}.tsx` (modify), `frontend/src/portal/{PortalApp,PortalShell}.tsx` (modify) | the cancel decisions and panel; the sheet, routes, nav |
| `frontend/src/lib/{menuVisibility.ts,industryGating.ts,vocabulary.ts}`, `frontend/src/components/{MenuSettings,Layout}.tsx`, `frontend/src/components/settings/BookingTab.tsx` (create/modify) | admin: truthful sidebar menu, distinct labels, cancel-hours fields |
| `docs/member-portal.md`, `CLAUDE.md`, the spec (modify) | phase 3 rules |

---

## Part A — Foundations

### Task 1: Schema, models and the stay test schema

**Files:**
- Create: `database/migrations/2026_09_30_100000_member_portal_phase_3.php`
- Modify: `app/Models/BookingMirror.php` (`$fillable` at `:22-37`, `$casts` at `:39-57`), `app/Models/ServiceBooking.php` (`$fillable` at `:16-26`, `$casts` at `:28-41`)
- Create: `tests/Concerns/SetsUpStayBookingSchema.php`
- Modify: `tests/Concerns/SetsUpMinimalSchema.php` (`setUpBookingRefundSchema()` at `:98-130`)
- Test: `tests/Feature/Booking/Phase3MigrationTest.php`

**Interfaces:**
- Consumes: nothing from this plan.
- Produces:
  - `booking_mirror` columns `member_id` (unsigned big integer, nullable), `list_total` decimal(12,2) nullable, `discount_amount` decimal(12,2) default 0, `discount_source` string(20) nullable, `discount_source_id` unsigned big integer nullable, `discount_label` string(120) nullable, `points_awarded_at` timestamp nullable, `cancelled_at` timestamp nullable, `cancellation_reason` string(60) nullable; index `booking_mirror_org_member_index (organization_id, member_id)`.
  - `service_bookings` columns `refunded_amount` decimal(10,2) nullable, `refunded_at` timestamp nullable, `last_refund_id` string nullable; partial unique index `service_bookings_org_pi_unique (organization_id, stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL` — created only when the table holds no duplicates.
  - `member_offers.used_reference` widened from 32 to 60.
  - Trait `Tests\Concerns\SetsUpStayBookingSchema` with `setUpStayBookingSchema(): void`, `seedRoom(int $orgId, array $overrides = []): \App\Models\BookingRoom` (defaults: `pms_id '101'`, `name 'Sea view'`, `max_guests 2`, `base_price 100`, `inventory_count 1`) and `seedStayExtra(int $orgId, array $overrides = []): \App\Models\BookingExtra` (defaults: `name 'Breakfast'`, `price 15`, `price_type 'per_stay'`).

- [ ] **Step 1: Write the failing migration test**

Create `tests/Feature/Booking/Phase3MigrationTest.php`:

```php
<?php

namespace Tests\Feature\Booking;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

class Phase3MigrationTest extends TestCase
{
    use SetsUpMinimalSchema;

    private function migration(): object
    {
        return require base_path('database/migrations/2026_09_30_100000_member_portal_phase_3.php');
    }

    private function baseTables(): void
    {
        $this->setUpMinimalSchema();
        Schema::create('booking_mirror', function ($t) { $t->id(); $t->unsignedBigInteger('organization_id'); $t->string('reservation_id', 30)->nullable(); $t->decimal('price_total', 12, 2)->default(0); $t->timestamps(); });
        Schema::create('service_bookings', function ($t) { $t->id(); $t->unsignedBigInteger('organization_id'); $t->decimal('total_amount', 10, 2)->default(0); $t->string('stripe_payment_intent_id')->nullable(); $t->timestamps(); });
        Schema::create('member_offers', function ($t) { $t->id(); $t->unsignedBigInteger('member_id'); $t->unsignedBigInteger('offer_id'); $t->timestamp('used_at')->nullable(); $t->string('used_reference', 32)->nullable(); $t->timestamps(); });
    }

    private function hasIndex(string $table, string $name): bool
    {
        return collect(Schema::getIndexes($table))->contains(fn ($i) => ($i['name'] ?? null) === $name);
    }

    public function test_it_adds_every_phase_3_column_and_is_idempotent(): void
    {
        $this->baseTables();
        $m = $this->migration();
        $m->up();
        $m->up(); // guarded: a second run must not throw

        foreach ([
            'booking_mirror'   => ['member_id', 'list_total', 'discount_amount', 'discount_source', 'discount_source_id', 'discount_label', 'points_awarded_at', 'cancelled_at', 'cancellation_reason'],
            'service_bookings' => ['refunded_amount', 'refunded_at', 'last_refund_id'],
        ] as $table => $cols) {
            foreach ($cols as $col) {
                $this->assertTrue(Schema::hasColumn($table, $col), "$table.$col");
            }
        }
        $this->assertTrue($this->hasIndex('booking_mirror', 'booking_mirror_org_member_index'));
        $this->assertTrue($this->hasIndex('service_bookings', 'service_bookings_org_pi_unique'));
    }

    public function test_a_sixty_character_reference_fits_after_the_migration(): void
    {
        $this->baseTables();
        $this->migration()->up();
        $ref = str_repeat('R', 60);
        DB::table('member_offers')->insert(['member_id' => 1, 'offer_id' => 1, 'used_reference' => $ref, 'created_at' => now(), 'updated_at' => now()]);
        $this->assertSame($ref, DB::table('member_offers')->value('used_reference'));
    }

    public function test_duplicate_payment_references_skip_the_unique_index_instead_of_failing(): void
    {
        $this->baseTables();
        foreach ([1, 2] as $n) {
            DB::table('service_bookings')->insert(['organization_id' => 7, 'stripe_payment_intent_id' => 'pi_same', 'created_at' => now(), 'updated_at' => now()]);
        }

        $this->migration()->up(); // must not throw

        $this->assertFalse($this->hasIndex('service_bookings', 'service_bookings_org_pi_unique'));
        $this->assertSame(2, DB::table('service_bookings')->where('stripe_payment_intent_id', 'pi_same')->count(), 'the migration never edits a payment reference');
        $this->assertTrue(Schema::hasColumn('service_bookings', 'refunded_amount'), 'the columns are still added');
    }

    public function test_the_same_payment_reference_may_repeat_across_organisations_and_nulls_are_free(): void
    {
        $this->baseTables();
        $this->migration()->up();
        DB::table('service_bookings')->insert(['organization_id' => 1, 'stripe_payment_intent_id' => 'pi_a', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('service_bookings')->insert(['organization_id' => 2, 'stripe_payment_intent_id' => 'pi_a', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('service_bookings')->insert(['organization_id' => 1, 'stripe_payment_intent_id' => null, 'created_at' => now(), 'updated_at' => now()]);
        DB::table('service_bookings')->insert(['organization_id' => 1, 'stripe_payment_intent_id' => null, 'created_at' => now(), 'updated_at' => now()]);

        $this->expectException(\Illuminate\Database\QueryException::class);
        DB::table('service_bookings')->insert(['organization_id' => 1, 'stripe_payment_intent_id' => 'pi_a', 'created_at' => now(), 'updated_at' => now()]);
    }

    public function test_down_removes_what_up_added_and_nothing_else(): void
    {
        $this->baseTables();
        $m = $this->migration();
        $m->up();
        $m->down();
        $this->assertFalse(Schema::hasColumn('booking_mirror', 'member_id'));
        $this->assertFalse(Schema::hasColumn('service_bookings', 'refunded_amount'));
        $this->assertFalse($this->hasIndex('service_bookings', 'service_bookings_org_pi_unique'));
        $this->assertTrue(Schema::hasColumn('booking_mirror', 'price_total'));
        $this->assertTrue(Schema::hasColumn('member_offers', 'used_reference'));
    }
}
```

- [ ] **Step 2: Run it to see it fail**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Booking/Phase3MigrationTest.php --no-ansi`
Expected: FAIL — `require(): Failed opening required '…2026_09_30_100000_member_portal_phase_3.php'`.

- [ ] **Step 3: Write the migration**

Create `database/migrations/2026_09_30_100000_member_portal_phase_3.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

/**
 * Member portal phase 3: the member and their discount on a stay, what a
 * cancellation and a refund leave behind, and the database's own guarantee
 * that one payment pays for one service booking. Every change is additive
 * and guarded so the migration can run on a database that already carries
 * part of it, and it never fails on data it did not expect.
 */
return new class extends Migration
{
    private const MIRROR = ['member_id', 'list_total', 'discount_amount', 'discount_source', 'discount_source_id', 'discount_label', 'points_awarded_at', 'cancelled_at', 'cancellation_reason'];
    private const SERVICE = ['refunded_amount', 'refunded_at', 'last_refund_id'];

    public function up(): void
    {
        $this->addColumns('booking_mirror', function (Blueprint $t, array $has) {
            if (!$has['member_id']) $t->unsignedBigInteger('member_id')->nullable();
            if (!$has['list_total']) $t->decimal('list_total', 12, 2)->nullable();
            if (!$has['discount_amount']) $t->decimal('discount_amount', 12, 2)->default(0);
            if (!$has['discount_source']) $t->string('discount_source', 20)->nullable();
            if (!$has['discount_source_id']) $t->unsignedBigInteger('discount_source_id')->nullable();
            if (!$has['discount_label']) $t->string('discount_label', 120)->nullable();
            if (!$has['points_awarded_at']) $t->timestamp('points_awarded_at')->nullable();
            if (!$has['cancelled_at']) $t->timestamp('cancelled_at')->nullable();
            if (!$has['cancellation_reason']) $t->string('cancellation_reason', 60)->nullable();
        }, self::MIRROR);
        if (Schema::hasTable('booking_mirror') && !$this->hasIndex('booking_mirror', 'booking_mirror_org_member_index')) {
            Schema::table('booking_mirror', fn (Blueprint $t) => $t->index(['organization_id', 'member_id'], 'booking_mirror_org_member_index'));
        }

        $this->addColumns('service_bookings', function (Blueprint $t, array $has) {
            if (!$has['refunded_amount']) $t->decimal('refunded_amount', 10, 2)->nullable();
            if (!$has['refunded_at']) $t->timestamp('refunded_at')->nullable();
            if (!$has['last_refund_id']) $t->string('last_refund_id')->nullable();
        }, self::SERVICE);
        $this->uniquePaymentReference();

        if (Schema::hasTable('member_offers') && Schema::hasColumn('member_offers', 'used_reference')) {
            Schema::table('member_offers', fn (Blueprint $t) => $t->string('used_reference', 60)->nullable()->change());
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('service_bookings') && $this->hasIndex('service_bookings', 'service_bookings_org_pi_unique')) {
            DB::statement('DROP INDEX service_bookings_org_pi_unique');
        }
        $this->dropColumns('service_bookings', self::SERVICE);

        if (Schema::hasTable('booking_mirror') && $this->hasIndex('booking_mirror', 'booking_mirror_org_member_index')) {
            Schema::table('booking_mirror', fn (Blueprint $t) => $t->dropIndex('booking_mirror_org_member_index'));
        }
        $this->dropColumns('booking_mirror', self::MIRROR);
        // member_offers.used_reference stays at 60: narrowing it could truncate a reference written since.
    }

    /**
     * One payment pays for one service booking, as a database constraint
     * (PortalPaymentIntentGuard::assertUnused() is the application's own
     * check). A partial index, so bookings without a payment are free.
     * If the table already holds a repeated reference the index is NOT
     * created and nothing is edited: a payment reference is what the
     * capture job and a refund look a booking up by.
     */
    private function uniquePaymentReference(): void
    {
        if (!Schema::hasTable('service_bookings') || !Schema::hasColumn('service_bookings', 'stripe_payment_intent_id')) return;
        if ($this->hasIndex('service_bookings', 'service_bookings_org_pi_unique')) return;

        $duplicates = DB::table('service_bookings')
            ->select('organization_id', 'stripe_payment_intent_id')
            ->whereNotNull('stripe_payment_intent_id')
            ->groupBy('organization_id', 'stripe_payment_intent_id')
            ->havingRaw('COUNT(*) > 1')
            ->limit(20)
            ->get();
        if ($duplicates->isNotEmpty()) {
            Log::warning('member_portal_phase_3: service_bookings holds repeated payment references; the unique index was not created', [
                'organizations' => $duplicates->pluck('organization_id')->unique()->values()->all(),
                'count' => $duplicates->count(),
            ]);
            return;
        }

        DB::statement('CREATE UNIQUE INDEX service_bookings_org_pi_unique ON service_bookings (organization_id, stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL');
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

- [ ] **Step 4: Run the migration test**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Booking/Phase3MigrationTest.php --no-ansi`
Expected: `Tests:    5 passed`.

If `test_down_removes…` fails on sqlite with "error in index … after drop column": the `booking_mirror_org_member_index` drop must run before `dropColumns('booking_mirror', …)` — it does in the code above; check you did not reorder it.

- [ ] **Step 5: Models**

In `app/Models/BookingMirror.php` append to `$fillable` (after `'extras_json',`):

```php
        'member_id', 'list_total', 'discount_amount', 'discount_source', 'discount_source_id', 'discount_label',
        'points_awarded_at', 'cancelled_at', 'cancellation_reason',
```

and to `$casts` (after `'extras_json'       => 'array',`):

```php
        'list_total'        => 'decimal:2',
        'discount_amount'   => 'decimal:2',
        'points_awarded_at' => 'datetime',
        'cancelled_at'      => 'datetime',
```

and add the relation after `notes()`:

```php
    public function member(): BelongsTo
    {
        return $this->belongsTo(LoyaltyMember::class, 'member_id');
    }
```

In `app/Models/ServiceBooking.php` append to `$fillable` (after `'points_awarded_at',`):

```php
        'refunded_amount', 'refunded_at', 'last_refund_id',
```

and to `$casts`:

```php
        'refunded_amount'   => 'decimal:2',
        'refunded_at'       => 'datetime',
```

- [ ] **Step 6: The stay test schema trait**

Create `tests/Concerns/SetsUpStayBookingSchema.php`. It builds on three helpers of `SetsUpMinimalSchema` and adds every column the real migrations carry that those thin tables lack (the list is in `.superpowers/sdd/portal-v2-phase-3-notes/stays-engine-facts.md` §3 and §7); a class that uses it must also `use SetsUpMinimalSchema`.

```php
<?php

namespace Tests\Concerns;

use App\Models\BookingExtra;
use App\Models\BookingRoom;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The tables a stay touches end to end — quote, hold, confirm, mirror,
 * price elements, submission log, sync — shaped like the real migrations
 * (2026_04_01_200001_create_booking_engine_tables and the additions listed
 * in stays-engine-facts.md §3, plus 2026_09_30_100000_member_portal_phase_3),
 * so a test can run BookingEngineService::confirm() against sqlite.
 *
 * Requires the consumer to also `use SetsUpMinimalSchema`.
 */
trait SetsUpStayBookingSchema
{
    protected function setUpStayBookingSchema(): void
    {
        $this->setUpBookingConfirmSchema();   // booking_mirror (thin), booking_holds, booking_idempotency_keys, audit_logs, hotel_settings
        $this->setUpAvailabilitySchema();     // brands, booking_rooms
        $this->setUpBookingAdminSchema();     // booking_submissions, booking_notes, booking_price_elements (thin)
        $this->setUpRealtimeEventsSchema();

        $this->ensureStayColumns('booking_mirror', [
            'booking_type'       => fn (Blueprint $t) => $t->string('booking_type', 40)->nullable(),
            'channel_id'         => fn (Blueprint $t) => $t->string('channel_id', 20)->nullable(),
            'channel_name'       => fn (Blueprint $t) => $t->string('channel_name', 80)->nullable(),
            'guest_id'           => fn (Blueprint $t) => $t->unsignedBigInteger('guest_id')->nullable(),
            'guest_language'     => fn (Blueprint $t) => $t->string('guest_language', 10)->nullable(),
            'adults'             => fn (Blueprint $t) => $t->smallInteger('adults')->nullable(),
            'children'           => fn (Blueprint $t) => $t->smallInteger('children')->nullable(),
            'check_in_time'      => fn (Blueprint $t) => $t->time('check_in_time')->nullable(),
            'check_out_time'     => fn (Blueprint $t) => $t->time('check_out_time')->nullable(),
            'prepayment_amount'  => fn (Blueprint $t) => $t->decimal('prepayment_amount', 12, 2)->nullable(),
            'prepayment_paid'    => fn (Blueprint $t) => $t->boolean('prepayment_paid')->default(false),
            'deposit_amount'     => fn (Blueprint $t) => $t->decimal('deposit_amount', 12, 2)->nullable(),
            'deposit_paid'       => fn (Blueprint $t) => $t->boolean('deposit_paid')->default(false),
            'notice'             => fn (Blueprint $t) => $t->text('notice')->nullable(),
            'assistant_notice'   => fn (Blueprint $t) => $t->text('assistant_notice')->nullable(),
            'guest_app_url'      => fn (Blueprint $t) => $t->string('guest_app_url')->nullable(),
            'invoice_state'      => fn (Blueprint $t) => $t->string('invoice_state', 40)->default('none'),
            'source_created_at'  => fn (Blueprint $t) => $t->timestamp('source_created_at')->nullable(),
            'source_updated_at'  => fn (Blueprint $t) => $t->timestamp('source_updated_at')->nullable(),
            'synced_at'          => fn (Blueprint $t) => $t->timestamp('synced_at')->nullable(),
            'lifecycle_counted_at' => fn (Blueprint $t) => $t->timestamp('lifecycle_counted_at')->nullable(),
            'raw_json'           => fn (Blueprint $t) => $t->text('raw_json')->nullable(),
            'extras_json'        => fn (Blueprint $t) => $t->text('extras_json')->nullable(),
            'pms_sync_attempts'  => fn (Blueprint $t) => $t->integer('pms_sync_attempts')->default(0),
            'pms_sync_last_attempt_at' => fn (Blueprint $t) => $t->timestamp('pms_sync_last_attempt_at')->nullable(),
            'pms_sync_last_error' => fn (Blueprint $t) => $t->text('pms_sync_last_error')->nullable(),
            // Phase 3 (2026_09_30_100000).
            'member_id'          => fn (Blueprint $t) => $t->unsignedBigInteger('member_id')->nullable(),
            'list_total'         => fn (Blueprint $t) => $t->decimal('list_total', 12, 2)->nullable(),
            'discount_amount'    => fn (Blueprint $t) => $t->decimal('discount_amount', 12, 2)->default(0),
            'discount_source'    => fn (Blueprint $t) => $t->string('discount_source', 20)->nullable(),
            'discount_source_id' => fn (Blueprint $t) => $t->unsignedBigInteger('discount_source_id')->nullable(),
            'discount_label'     => fn (Blueprint $t) => $t->string('discount_label', 120)->nullable(),
            'points_awarded_at'  => fn (Blueprint $t) => $t->timestamp('points_awarded_at')->nullable(),
            'cancelled_at'       => fn (Blueprint $t) => $t->timestamp('cancelled_at')->nullable(),
            'cancellation_reason' => fn (Blueprint $t) => $t->string('cancellation_reason', 60)->nullable(),
        ]);

        $this->ensureStayColumns('booking_price_elements', [
            'reservation_id'          => fn (Blueprint $t) => $t->string('reservation_id')->nullable(),
            'remote_price_element_id' => fn (Blueprint $t) => $t->string('remote_price_element_id', 30)->nullable(),
            'element_type'            => fn (Blueprint $t) => $t->string('element_type', 40)->nullable(),
            'quantity'                => fn (Blueprint $t) => $t->integer('quantity')->default(1),
            'tax'                     => fn (Blueprint $t) => $t->decimal('tax', 12, 2)->nullable(),
            'currency_code'           => fn (Blueprint $t) => $t->string('currency_code', 3)->nullable(),
            'sort_order'              => fn (Blueprint $t) => $t->integer('sort_order')->default(0),
            'raw_json'                => fn (Blueprint $t) => $t->text('raw_json')->nullable(),
            'synced_at'               => fn (Blueprint $t) => $t->timestamp('synced_at')->nullable(),
        ]);

        $this->ensureStayColumns('booking_submissions', [
            'brand_id'        => fn (Blueprint $t) => $t->unsignedBigInteger('brand_id')->nullable(),
            'request_id'      => fn (Blueprint $t) => $t->string('request_id')->nullable(),
            'idempotency_key' => fn (Blueprint $t) => $t->string('idempotency_key')->nullable(),
            'outcome'         => fn (Blueprint $t) => $t->string('outcome', 30)->nullable(),
            'failure_code'    => fn (Blueprint $t) => $t->string('failure_code')->nullable(),
            'failure_message' => fn (Blueprint $t) => $t->text('failure_message')->nullable(),
            'guest_id'        => fn (Blueprint $t) => $t->unsignedBigInteger('guest_id')->nullable(),
            'guest_name'      => fn (Blueprint $t) => $t->string('guest_name')->nullable(),
            'guest_email'     => fn (Blueprint $t) => $t->string('guest_email')->nullable(),
            'guest_phone'     => fn (Blueprint $t) => $t->string('guest_phone')->nullable(),
            'unit_id'         => fn (Blueprint $t) => $t->string('unit_id')->nullable(),
            'unit_name'       => fn (Blueprint $t) => $t->string('unit_name')->nullable(),
            'check_in'        => fn (Blueprint $t) => $t->date('check_in')->nullable(),
            'check_out'       => fn (Blueprint $t) => $t->date('check_out')->nullable(),
            'adults'          => fn (Blueprint $t) => $t->integer('adults')->nullable(),
            'children'        => fn (Blueprint $t) => $t->integer('children')->nullable(),
            'gross_total'     => fn (Blueprint $t) => $t->decimal('gross_total', 12, 2)->nullable(),
            'payment_method'  => fn (Blueprint $t) => $t->string('payment_method', 40)->nullable(),
            'payment_status'  => fn (Blueprint $t) => $t->string('payment_status', 40)->nullable(),
            'payload_json'    => fn (Blueprint $t) => $t->text('payload_json')->nullable(),
        ]);

        // linkOrCreateGuest() writes guest_type; GuestLifecycleService writes the counters.
        $this->ensureStayColumns('guests', [
            'guest_type'       => fn (Blueprint $t) => $t->string('guest_type', 32)->nullable(),
            'last_activity_at' => fn (Blueprint $t) => $t->timestamp('last_activity_at')->nullable(),
            'total_stays'      => fn (Blueprint $t) => $t->integer('total_stays')->default(0),
            'total_nights'     => fn (Blueprint $t) => $t->integer('total_nights')->default(0),
            'total_revenue'    => fn (Blueprint $t) => $t->decimal('total_revenue', 12, 2)->default(0),
            'first_stay_date'  => fn (Blueprint $t) => $t->date('first_stay_date')->nullable(),
            'last_stay_date'   => fn (Blueprint $t) => $t->date('last_stay_date')->nullable(),
        ]);

        if (!Schema::hasTable('booking_extras')) {
            Schema::create('booking_extras', function (Blueprint $t) {
                $t->id();
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('brand_id')->nullable();
                $t->string('name');
                $t->text('description')->nullable();
                $t->decimal('price', 10, 2)->default(0);
                $t->string('price_type')->default('per_stay');
                $t->unsignedSmallInteger('lead_time_hours')->default(0);
                $t->string('currency', 10)->default('EUR');
                $t->string('image')->nullable();
                $t->string('icon')->nullable();
                $t->string('category')->nullable();
                $t->integer('sort_order')->default(0);
                $t->boolean('is_active')->default(true);
                $t->timestamps();
            });
        }
    }

    /** @param array<string, callable(Blueprint):void> $columns */
    private function ensureStayColumns(string $table, array $columns): void
    {
        $missing = array_filter(array_keys($columns), fn (string $c) => !Schema::hasColumn($table, $c));
        if ($missing === []) return;
        Schema::table($table, function (Blueprint $t) use ($columns, $missing) {
            foreach ($missing as $c) $columns[$c]($t);
        });
    }

    protected function seedRoom(int $orgId, array $overrides = []): BookingRoom
    {
        return BookingRoom::withoutGlobalScopes()->create(array_merge([
            'organization_id' => $orgId, 'pms_id' => '101', 'name' => 'Sea view', 'slug' => 'sea-view',
            'max_guests' => 2, 'bedrooms' => 1, 'base_price' => 100, 'inventory_count' => 1,
            'currency' => 'EUR', 'is_active' => true, 'sort_order' => 0,
        ], $overrides));
    }

    protected function seedStayExtra(int $orgId, array $overrides = []): BookingExtra
    {
        return BookingExtra::withoutGlobalScopes()->create(array_merge([
            'organization_id' => $orgId, 'name' => 'Breakfast', 'price' => 15, 'price_type' => 'per_stay',
            'lead_time_hours' => 0, 'currency' => 'EUR', 'is_active' => true, 'sort_order' => 0,
        ], $overrides));
    }
}
```

`BookingRoom` and `BookingExtra` may not list `organization_id` in `$fillable` (`BelongsToOrganization` sets it from the bound tenant on create). If `seedRoom()` writes a room with the wrong or a null organisation, bind the tenant first in the caller (`app()->instance('current_organization_id', $orgId)`) — every test in this plan that seeds a room does.

- [ ] **Step 6b: The thin mirror every other suite builds gets the phase 3 columns**

`SetsUpMinimalSchema::setUpBookingRefundSchema()` (`tests/Concerns/SetsUpMinimalSchema.php:98-130`) creates the `booking_mirror` that the Member, Loyalty and Booking suites all run against. From Task 10 on, `MemberBookingQuery` names `booking_mirror.member_id` in every query, so that table must carry the column in every suite. In its `Schema::create('booking_mirror', …)` closure, after `$table->string('internal_status', 32)->nullable();` add:

```php
                // Member portal phase 3 (2026_09_30_100000) and the two
                // columns the portal reads beside them.
                $table->string('channel_name', 80)->nullable();
                $table->text('notice')->nullable();
                $table->unsignedBigInteger('member_id')->nullable();
                $table->decimal('list_total', 12, 2)->nullable();
                $table->decimal('discount_amount', 12, 2)->default(0);
                $table->string('discount_source', 20)->nullable();
                $table->unsignedBigInteger('discount_source_id')->nullable();
                $table->string('discount_label', 120)->nullable();
                $table->timestamp('points_awarded_at')->nullable();
                $table->timestamp('cancelled_at')->nullable();
                $table->string('cancellation_reason', 60)->nullable();
```

`SetsUpStayBookingSchema::ensureStayColumns()` skips what already exists, so the two definitions cannot collide.

- [ ] **Step 7: Prove the trait builds**

Add `use Tests\Concerns\SetsUpStayBookingSchema;` to `Phase3MigrationTest`'s imports, the trait to its `use` line (`use SetsUpMinimalSchema, SetsUpStayBookingSchema;`), and one test — it keeps the trait honest against the models it serves (every test starts on an empty in-memory database, so this one builds its own tables and the others theirs):

```php
    public function test_the_stay_test_schema_holds_everything_the_models_write(): void
    {
        $this->setUpStayBookingSchema();

        foreach ((new \App\Models\BookingMirror())->getFillable() as $col) {
            $this->assertTrue(Schema::hasColumn('booking_mirror', $col), "booking_mirror.$col");
        }
        foreach ((new \App\Models\BookingSubmission())->getFillable() as $col) {
            $this->assertTrue(Schema::hasColumn('booking_submissions', $col), "booking_submissions.$col");
        }
        foreach ((new \App\Models\BookingPriceElement())->getFillable() as $col) {
            $this->assertTrue(Schema::hasColumn('booking_price_elements', $col), "booking_price_elements.$col");
        }
        foreach ((new \App\Models\BookingExtra())->getFillable() as $col) {
            $this->assertTrue(Schema::hasColumn('booking_extras', $col), "booking_extras.$col");
        }
    }
```

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Booking/Phase3MigrationTest.php --no-ansi`
Expected: `Tests:    6 passed`. A missing column names itself in the failure message; add it to the trait with the type the real migration gives it.

- [ ] **Step 8: Neighbouring suites still pass**

Run, one after the other: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Booking/ --no-ansi`, `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Member/ --no-ansi`, `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Loyalty/ --no-ansi`
Expected: every test passes (Booking 205 before this task, 211 after; Member 96; Loyalty 289).

- [ ] **Step 9: Commit**

```bash
git add database/migrations/2026_09_30_100000_member_portal_phase_3.php app/Models/BookingMirror.php app/Models/ServiceBooking.php tests/Concerns/SetsUpStayBookingSchema.php tests/Concerns/SetsUpMinimalSchema.php tests/Feature/Booking/Phase3MigrationTest.php
git commit -m "Add the phase 3 columns, the payment-reference index and the stay test schema

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: The engine can be tested — driver-aware lock, the missing import, and the widget's behaviour pinned

`BookingEngineService::confirm()` has never had a test past its pre-flight checks: it issues `pg_advisory_xact_lock` inline, which sqlite cannot run. This task changes two lines of the engine and writes the tests that pin what the public widget gets today, so Task 3 can change the engine without changing the widget.

**Files:**
- Modify: `app/Services/BookingEngineService.php` (imports `:5-23`; lock statement `:322`)
- Test: `tests/Feature/Booking/BookingEngineConfirmTest.php`

**Interfaces:**
- Consumes: `Tests\Concerns\SetsUpStayBookingSchema` (Task 1); `App\Support\AdvisoryLock::within(string $key): void` (phase 2).
- Produces: a test class whose helpers Task 3 extends — `hold(array $payload = []): \App\Models\BookingHold`, `smoobuAccepts(array $reservation = []): void`, `guest(): array`.

- [ ] **Step 1: Write the failing tests**

Create `tests/Feature/Booking/BookingEngineConfirmTest.php`:

```php
<?php

namespace Tests\Feature\Booking;

use App\Mail\BookingConfirmationMail;
use App\Models\AuditLog;
use App\Models\BookingHold;
use App\Models\BookingMirror;
use App\Models\BookingPriceElement;
use App\Models\BookingSubmission;
use App\Models\Organization;
use App\Services\BookingEngineService;
use App\Services\SmoobuClient;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Mockery;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\Concerns\SetsUpStayBookingSchema;
use Tests\TestCase;

/**
 * BookingEngineService::confirm() past its pre-flight checks: what a
 * confirmed stay writes and sends. Every Smoobu call is a Mockery mock.
 *
 * The tests named "widget" pin what the public booking widget gets today;
 * they must keep passing, unchanged, through every later change to the
 * engine.
 */
class BookingEngineConfirmTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema, SetsUpStayBookingSchema;

    protected Organization $org;
    protected $smoobu;
    protected BookingEngineService $engine;
    protected string $checkIn;
    protected string $checkOut;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpStayBookingSchema();
        $this->setUpLoyaltySchema();
        Mail::fake();

        $this->org = Organization::create(['name' => 'Seaside Hotel', 'slug' => 'seaside-' . uniqid()]);
        app()->instance('current_organization_id', $this->org->id);
        $this->seedRoom($this->org->id);

        $this->checkIn = now()->addDays(10)->toDateString();
        $this->checkOut = now()->addDays(12)->toDateString();

        $this->smoobu = Mockery::mock(SmoobuClient::class);
        $this->engine = new BookingEngineService($this->smoobu);
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        Mockery::close();
        parent::tearDown();
    }

    /** A two-night hold on room 101 for 200.00, as BookingEngineService::quote() writes it. */
    protected function hold(array $payload = []): BookingHold
    {
        return BookingHold::create([
            'hold_token'   => Str::random(48),
            'status'       => 'active',
            'expires_at'   => now()->addMinutes(10),
            'payload_json' => array_merge([
                'unit_id' => '101', 'unit_name' => 'Sea view',
                'check_in' => $this->checkIn, 'check_out' => $this->checkOut, 'nights' => 2,
                'adults' => 2, 'children' => 0,
                'room_total' => 200.0, 'extras' => [], 'extras_total' => 0.0, 'gross_total' => 200.0,
                'currency' => 'EUR', 'price_per_night' => 100.0,
            ], $payload),
        ]);
    }

    /** Smoobu says every night is free and accepts the reservation. */
    protected function smoobuAccepts(array $reservation = []): void
    {
        $nights = [];
        for ($d = now()->addDays(10); $d->toDateString() < $this->checkOut; $d = $d->copy()->addDay()) {
            $nights[$d->toDateString()] = ['available' => true, 'price' => 100.0, 'min_stay' => 1];
        }
        $this->smoobu->shouldReceive('getDailyRates')->andReturn(['101' => $nights]);
        $this->smoobu->shouldReceive('resolveDirectChannelId')->andReturn(7);
        $this->smoobu->shouldReceive('createReservation')->byDefault()->andReturn(array_merge(['id' => 555001, 'reference-id' => 'BK-ABC12345'], $reservation));
        $this->smoobu->shouldReceive('getPriceElements')->byDefault()->andReturn([]);
    }

    protected function guest(): array
    {
        return ['first_name' => 'Ada', 'last_name' => 'Lovelace', 'email' => 'ada@example.test', 'phone' => '+37120000000'];
    }

    public function test_widget_confirm_writes_the_mirror_consumes_the_hold_and_answers_the_reference(): void
    {
        $this->smoobuAccepts();
        $hold = $this->hold();

        $res = $this->engine->confirm(['hold_token' => $hold->hold_token, 'guest' => $this->guest()]);

        $this->assertTrue($res['success']);
        $this->assertSame('BK-ABC12345', $res['booking_reference']);
        $this->assertSame('555001', $res['reservation_id']);
        $this->assertEquals(200.0, $res['gross_total']);

        $mirror = BookingMirror::withoutGlobalScopes()->where('organization_id', $this->org->id)->sole();
        $this->assertSame('Website', $mirror->channel_name);
        $this->assertSame('confirmed', $mirror->internal_status);
        $this->assertSame('confirmed', $mirror->booking_state);
        $this->assertSame('101', (string) $mirror->apartment_id);
        $this->assertEquals(200.0, (float) $mirror->price_total);
        $this->assertNull($mirror->payment_status);
        $this->assertNull($mirror->stripe_payment_intent_id);
        $this->assertSame('ada@example.test', $mirror->guest_email);
        $this->assertNotNull($mirror->guest_id, 'the widget links or creates a CRM guest by email');
        $this->assertNull($mirror->member_id);
        $this->assertEquals(0.0, (float) $mirror->discount_amount);
        $this->assertNull($mirror->notice);

        $this->assertSame('consumed', $hold->fresh()->status);
    }

    public function test_widget_confirm_sends_smoobu_the_gross_total_and_an_itemised_receipt(): void
    {
        $this->smoobuAccepts();
        $extra = $this->seedStayExtra($this->org->id);
        $hold = $this->hold(['extras' => [['id' => (string) $extra->id, 'quantity' => 2]], 'extras_total' => 30.0, 'gross_total' => 230.0]);

        $sent = null;
        $this->smoobu->shouldReceive('createReservation')->once()->with(Mockery::on(function (array $p) use (&$sent) {
            $sent = $p;
            return true;
        }))->andReturn(['id' => 555002, 'reference-id' => 'BK-WIDGET02']);

        $this->engine->confirm(['hold_token' => $hold->hold_token, 'guest' => $this->guest(), 'special_requests' => 'Late arrival']);

        $this->assertSame(101, $sent['apartmentId']);
        $this->assertEquals(230.0, $sent['price']);
        $this->assertEquals(0.0, $sent['price-paid']);
        $this->assertSame(7, $sent['channelId']);
        $this->assertSame('Late arrival', $sent['notice']);
        $this->assertStringContainsString('Booked via: Website / Direct widget', $sent['assistant-notice']);
        $this->assertStringNotContainsString('discount', strtolower($sent['assistant-notice']));
        $this->assertSame(['basePrice', 'addon'], array_column($sent['priceElements'], 'type'));
        $this->assertEquals(200.0, $sent['priceElements'][0]['amount']);
        $this->assertEquals(30.0, $sent['priceElements'][1]['amount']);
    }

    public function test_widget_confirm_stores_the_line_items_the_log_the_audit_row_and_queues_the_mail(): void
    {
        $this->smoobuAccepts();
        $hold = $this->hold();

        $this->engine->confirm(['hold_token' => $hold->hold_token, 'guest' => $this->guest()], null, 'req-1', '203.0.113.9');

        $mirror = BookingMirror::withoutGlobalScopes()->where('organization_id', $this->org->id)->sole();
        $rows = BookingPriceElement::withoutGlobalScopes()->where('booking_mirror_id', $mirror->id)->orderBy('sort_order')->get();
        $this->assertSame(['accommodation'], $rows->pluck('element_type')->all());
        $this->assertEquals(100.0, (float) $rows[0]->amount);
        $this->assertSame(2, (int) $rows[0]->quantity);

        $this->assertSame(1, BookingSubmission::withoutGlobalScopes()->where('organization_id', $this->org->id)->where('outcome', 'success')->count());
        $this->assertSame(1, AuditLog::withoutGlobalScopes()->where('action', 'booking.confirmed')->where('subject_id', $mirror->id)->count());
        Mail::assertQueued(BookingConfirmationMail::class, fn (BookingConfirmationMail $m) => $m->hasTo('ada@example.test') && $m->grossTotal === 200.0);
    }

    public function test_a_paid_widget_confirm_stores_the_payment_and_tells_smoobu_it_is_paid(): void
    {
        $this->smoobuAccepts();
        $hold = $this->hold();
        $sent = null;
        $this->smoobu->shouldReceive('createReservation')->once()->with(Mockery::on(function (array $p) use (&$sent) {
            $sent = $p;
            return true;
        }))->andReturn(['id' => 555003, 'reference-id' => 'BK-PAID0003']);

        $this->engine->confirm(['hold_token' => $hold->hold_token, 'guest' => $this->guest(), 'payment_intent_id' => 'pi_widget_1', 'payment_method' => 'stripe', 'payment_status' => 'authorized']);

        $mirror = BookingMirror::withoutGlobalScopes()->where('organization_id', $this->org->id)->sole();
        $this->assertSame('authorized', $mirror->payment_status);
        $this->assertSame('stripe', $mirror->payment_method);
        $this->assertSame('pi_widget_1', $mirror->stripe_payment_intent_id);
        $this->assertEquals(200.0, $sent['price-paid']);
        $this->assertSame(1, $sent['priceStatus']);
    }

    public function test_a_smoobu_rejection_writes_nothing_and_leaves_the_hold_active(): void
    {
        $this->smoobuAccepts();
        $this->smoobu->shouldReceive('createReservation')->once()->andThrow(new \RuntimeException('Smoobu API error: 422 POST /reservations — apartment not available'));
        $hold = $this->hold();

        try {
            $this->engine->confirm(['hold_token' => $hold->hold_token, 'guest' => $this->guest()]);
            $this->fail('a rejected reservation must throw');
        } catch (\RuntimeException $e) {
            $this->assertStringContainsString('no longer available', $e->getMessage());
        }

        $this->assertSame(0, BookingMirror::withoutGlobalScopes()->where('organization_id', $this->org->id)->count());
        $this->assertSame('active', $hold->fresh()->status);
    }

    public function test_a_transient_smoobu_failure_writes_a_local_mirror_for_the_retry_job(): void
    {
        $this->smoobuAccepts();
        $this->smoobu->shouldReceive('createReservation')->once()->andThrow(new \RuntimeException('cURL error 28: Operation timed out'));
        $hold = $this->hold();

        $res = $this->engine->confirm(['hold_token' => $hold->hold_token, 'guest' => $this->guest()]);

        $mirror = BookingMirror::withoutGlobalScopes()->where('organization_id', $this->org->id)->sole();
        $this->assertSame('pending_pms_sync', $mirror->internal_status);
        $this->assertStringStartsWith('LOCAL-', $mirror->reservation_id);
        $this->assertStringStartsWith('LOC-', $res['booking_reference']);
    }

    public function test_a_room_already_booked_for_the_dates_is_refused(): void
    {
        $this->smoobuAccepts();
        BookingMirror::withoutGlobalScopes()->create([
            'organization_id' => $this->org->id, 'reservation_id' => 'R-1', 'booking_state' => 'confirmed', 'internal_status' => 'confirmed',
            'apartment_id' => '101', 'arrival_date' => $this->checkIn, 'departure_date' => $this->checkOut, 'price_total' => 200,
        ]);
        $hold = $this->hold();

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('no longer available for the selected dates');
        $this->engine->confirm(['hold_token' => $hold->hold_token, 'guest' => $this->guest()]);
    }

    /** Review Focus 3. BookingEngineService called `Log::warning()` without importing the facade. */
    public function test_a_price_breakdown_failure_after_commit_does_not_fail_the_confirm(): void
    {
        $this->smoobuAccepts();
        $this->smoobu->shouldReceive('getPriceElements')->once()->andThrow(new \RuntimeException('Smoobu API error: 500'));
        $hold = $this->hold();

        $res = $this->engine->confirm(['hold_token' => $hold->hold_token, 'guest' => $this->guest()]);

        $this->assertTrue($res['success']);
        $this->assertSame(1, BookingMirror::withoutGlobalScopes()->where('organization_id', $this->org->id)->count());
    }
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Booking/BookingEngineConfirmTest.php --no-ansi`
Expected: FAIL. Every test that reaches the transaction fails with `SQLSTATE[HY000]: General error: 1 no such function: pg_advisory_xact_lock` (or `near "(": syntax error`).

- [ ] **Step 3: The two engine changes**

In `app/Services/BookingEngineService.php`:

(a) Imports — add, in alphabetical position:

```php
use App\Support\AdvisoryLock;
```

after `use App\Models\Organization;`, and

```php
use Illuminate\Support\Facades\Log;
```

after `use Illuminate\Support\Facades\DB;`.

(b) Replace line 322

```php
            DB::statement('SELECT pg_advisory_xact_lock(hashtext(?))', [$lockKey]);
```

with

```php
            AdvisoryLock::within($lockKey);
```

Nothing else changes. On PostgreSQL `AdvisoryLock::within()` issues the identical statement; on every other driver it does nothing.

- [ ] **Step 4: Run the tests**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Booking/BookingEngineConfirmTest.php --no-ansi`
Expected: `Tests:    8 passed`.

If a test fails on a missing column or table, the engine writes something the test schema lacks: add the column to `SetsUpStayBookingSchema` (Task 1) with the type the real migration gives it — never change the engine to fit the test schema. If `test_widget_confirm_stores_the_line_items…` fails on `Mail::assertQueued`, read `storage/logs/laravel.log` for `Booking confirmation email failed`: `sendBookingEmails()` swallows its own errors.

- [ ] **Step 5: Neighbouring suites**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Booking/ --no-ansi` and `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Unit/Booking/ --no-ansi`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add app/Services/BookingEngineService.php tests/Feature/Booking/BookingEngineConfirmTest.php
git commit -m "Pin what a confirmed stay writes, and let the engine run on any driver

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: The engine carries a member — hooks, member columns, the Smoobu receipt, and a sync that keeps them

**Files:**
- Create: `app/Services/Booking/StayConfirmHooks.php`
- Modify: `app/Services/BookingEngineService.php` — `confirm()` signature `:231`; guest link `:309`; transaction closure `:319-321`; before `// ── Create reservation in Smoobu` `:519`; assistant notice `:589` and `:672-673`; price elements `:684-697` and `:752`; mirror create `:883-911`; after `persistPriceElements` `:917`; `upsertBookingFromData()` `:1460-1525`; `persistPriceElements()` `:2271-2326`
- Test: `tests/Feature/Booking/BookingEngineConfirmTest.php` (add), `tests/Feature/Booking/BookingEngineSyncPinTest.php` (create)

**Interfaces:**
- Consumes: Task 2's test helpers.
- Produces:
  - `interface App\Services\Booking\StayConfirmHooks { public function beforeReservation(array $payload): void; public function afterMirror(\App\Models\BookingMirror $mirror, array $payload): void; }`
  - `BookingEngineService::confirm(array $data, ?string $idempotencyKey = null, ?string $requestId = null, ?string $ip = null, ?StayConfirmHooks $hooks = null): array`
  - Hold payload keys the engine now reads (all optional; a hold without them behaves exactly as before): `member_id` (int), `list_total` (float), `discount` (float), `discount_source` (string), `discount_source_id` (int), `discount_label` (string), `channel_name` (string).
  - `$data` keys the engine now reads: `guest_id` (int, optional — when present no guest is looked up or created by email).
  - For a hold that carries `member_id`, the mirror also stores `notice` = `$data['special_requests']`.

- [ ] **Step 1: Write the failing engine tests**

Add to `tests/Feature/Booking/BookingEngineConfirmTest.php` (imports: `use App\Services\Booking\StayConfirmHooks;`, `use App\Models\Guest;`):

```php
    /** A hold as the portal's quote writes it: 10% member discount on 200.00. */
    private function memberHold(array $payload = []): BookingHold
    {
        return $this->hold(array_merge([
            'member_id' => 41, 'list_total' => 200.0, 'discount' => 20.0, 'discount_source' => 'tier_benefit',
            'discount_source_id' => 9, 'discount_label' => 'Gold: 10% off stays', 'gross_total' => 180.0,
            'channel_name' => 'Member portal',
        ], $payload));
    }

    private function recordingHooks(array &$calls, ?\Throwable $failBefore = null): StayConfirmHooks
    {
        return new class($calls, $failBefore) implements StayConfirmHooks {
            public function __construct(private array &$calls, private ?\Throwable $failBefore) {}
            public function beforeReservation(array $payload): void
            {
                $this->calls[] = 'before';
                if ($this->failBefore) throw $this->failBefore;
            }
            public function afterMirror(BookingMirror $mirror, array $payload): void
            {
                $this->calls[] = 'after:' . $mirror->id;
            }
        };
    }

    public function test_a_member_hold_stamps_the_member_the_discount_the_channel_and_the_notes(): void
    {
        $this->smoobuAccepts();
        $guest = Guest::withoutGlobalScopes()->create(['organization_id' => $this->org->id, 'first_name' => 'Ada', 'last_name' => 'Lovelace', 'full_name' => 'Ada Lovelace', 'email' => 'other-address@example.test', 'member_id' => 41]);
        $hold = $this->memberHold();

        $this->engine->confirm(['hold_token' => $hold->hold_token, 'guest' => $this->guest(), 'guest_id' => $guest->id, 'special_requests' => 'Quiet room please', 'payment_status' => 'open', 'payment_method' => 'pay_at_venue']);

        $mirror = BookingMirror::withoutGlobalScopes()->where('organization_id', $this->org->id)->sole();
        $this->assertSame('Member portal', $mirror->channel_name);
        $this->assertSame(41, (int) $mirror->member_id);
        $this->assertSame($guest->id, (int) $mirror->guest_id, 'the member\'s own guest, not one found by email');
        $this->assertEquals(200.0, (float) $mirror->list_total);
        $this->assertEquals(20.0, (float) $mirror->discount_amount);
        $this->assertSame('tier_benefit', $mirror->discount_source);
        $this->assertSame(9, (int) $mirror->discount_source_id);
        $this->assertSame('Gold: 10% off stays', $mirror->discount_label);
        $this->assertEquals(180.0, (float) $mirror->price_total);
        $this->assertSame('Quiet room please', $mirror->notice);
        $this->assertSame('open', $mirror->payment_status);
        $this->assertSame('pay_at_venue', $mirror->payment_method);
        $this->assertSame(1, Guest::withoutGlobalScopes()->where('organization_id', $this->org->id)->count(), 'no second guest is created for the email');
    }

    public function test_smoobu_gets_the_discounted_price_and_a_receipt_that_adds_up(): void
    {
        $this->smoobuAccepts();
        $hold = $this->memberHold();
        $sent = null;
        $this->smoobu->shouldReceive('createReservation')->once()->with(Mockery::on(function (array $p) use (&$sent) {
            $sent = $p;
            return true;
        }))->andReturn(['id' => 555010, 'reference-id' => 'BK-MEMBER10']);

        $this->engine->confirm(['hold_token' => $hold->hold_token, 'guest' => $this->guest()]);

        $this->assertEquals(180.0, $sent['price']);
        $this->assertStringContainsString('Booked via: Member portal', $sent['assistant-notice']);
        $this->assertStringContainsString('Gold: 10% off stays', $sent['assistant-notice']);
        $this->assertStringContainsString('-€20.00', $sent['assistant-notice']);
        $this->assertStringContainsString('Total: €180.00', $sent['assistant-notice']);
        $this->assertEquals(180.0, array_sum(array_column($sent['priceElements'], 'amount')), 'Smoobu adds the elements up; they must equal the price');
        $this->assertEquals(180.0, $sent['priceElements'][0]['amount']);
    }

    public function test_a_discount_larger_than_the_room_total_sends_no_price_elements(): void
    {
        $this->smoobuAccepts();
        $extra = $this->seedStayExtra($this->org->id, ['price' => 300]);
        $hold = $this->memberHold(['extras' => [['id' => (string) $extra->id, 'quantity' => 1]], 'extras_total' => 300.0, 'list_total' => 500.0, 'discount' => 250.0, 'gross_total' => 250.0]);
        $sent = null;
        $this->smoobu->shouldReceive('createReservation')->once()->with(Mockery::on(function (array $p) use (&$sent) {
            $sent = $p;
            return true;
        }))->andReturn(['id' => 555011, 'reference-id' => 'BK-MEMBER11']);

        $this->engine->confirm(['hold_token' => $hold->hold_token, 'guest' => $this->guest()]);

        $this->assertEquals(250.0, $sent['price']);
        $this->assertArrayNotHasKey('priceElements', $sent, 'a base price below zero is never sent; the top-level price is the truth');
    }

    public function test_the_stored_line_items_carry_the_discount_as_a_negative_row(): void
    {
        $this->smoobuAccepts();
        $hold = $this->memberHold();

        $this->engine->confirm(['hold_token' => $hold->hold_token, 'guest' => $this->guest()]);

        $mirror = BookingMirror::withoutGlobalScopes()->where('organization_id', $this->org->id)->sole();
        $rows = BookingPriceElement::withoutGlobalScopes()->where('booking_mirror_id', $mirror->id)->orderBy('sort_order')->get();
        $this->assertSame(['accommodation', 'discount'], $rows->pluck('element_type')->all());
        $this->assertEquals(-20.0, (float) $rows[1]->amount);
        $this->assertSame('Gold: 10% off stays', $rows[1]->name);
    }

    public function test_the_hooks_run_inside_the_transaction_in_order(): void
    {
        $this->smoobuAccepts();
        $hold = $this->memberHold();
        $calls = [];

        $this->engine->confirm(['hold_token' => $hold->hold_token, 'guest' => $this->guest()], null, null, null, $this->recordingHooks($calls));

        $mirror = BookingMirror::withoutGlobalScopes()->where('organization_id', $this->org->id)->sole();
        $this->assertSame(['before', 'after:' . $mirror->id], $calls);
    }

    public function test_a_hook_that_refuses_stops_the_booking_before_smoobu_is_asked(): void
    {
        $this->smoobuAccepts();
        $this->smoobu->shouldNotReceive('createReservation');
        $hold = $this->memberHold();
        $calls = [];

        try {
            $this->engine->confirm(['hold_token' => $hold->hold_token, 'guest' => $this->guest()], null, null, null, $this->recordingHooks($calls, new \DomainException('coupon gone')));
            $this->fail('the hook\'s exception must reach the caller');
        } catch (\DomainException $e) {
            $this->assertSame('coupon gone', $e->getMessage());
        }

        $this->assertSame(['before'], $calls);
        $this->assertSame(0, BookingMirror::withoutGlobalScopes()->where('organization_id', $this->org->id)->count());
        $this->assertSame('active', $hold->fresh()->status);
    }
```

- [ ] **Step 2: Write the failing sync tests**

Create `tests/Feature/Booking/BookingEngineSyncPinTest.php`:

```php
<?php

namespace Tests\Feature\Booking;

use App\Models\BookingMirror;
use App\Models\Guest;
use App\Models\Organization;
use App\Services\BookingEngineService;
use App\Services\SmoobuClient;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Mockery;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\Concerns\SetsUpStayBookingSchema;
use Tests\TestCase;

/** What the five-minute Smoobu sync may and may not overwrite on a mirror we wrote ourselves. */
class BookingEngineSyncPinTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema, SetsUpStayBookingSchema;

    private Organization $org;
    private BookingEngineService $engine;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpStayBookingSchema();
        $this->org = Organization::create(['name' => 'Seaside Hotel', 'slug' => 'seaside-' . uniqid()]);
        app()->instance('current_organization_id', $this->org->id);
        $smoobu = Mockery::mock(SmoobuClient::class);
        $smoobu->shouldReceive('getPriceElements')->andReturn([]);
        $this->engine = new BookingEngineService($smoobu);
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        Mockery::close();
        parent::tearDown();
    }

    private function mirror(array $attrs = []): BookingMirror
    {
        return BookingMirror::withoutGlobalScopes()->create(array_merge([
            'organization_id' => $this->org->id, 'reservation_id' => '777001', 'booking_reference' => 'BK-SYNC0001',
            'booking_state' => 'confirmed', 'internal_status' => 'confirmed', 'apartment_id' => '101', 'apartment_name' => 'Sea view',
            'channel_name' => 'Member portal', 'guest_email' => 'ada@example.test', 'guest_name' => 'Ada Lovelace',
            'arrival_date' => now()->addDays(10)->toDateString(), 'departure_date' => now()->addDays(12)->toDateString(),
            'price_total' => 180, 'payment_status' => 'open', 'payment_method' => 'pay_at_venue', 'member_id' => 41,
        ], $attrs));
    }

    /** What Smoobu sends back for the same reservation. */
    private function smoobu(array $over = []): array
    {
        return array_merge([
            'id' => 777001, 'reference-id' => 'BK-SYNC0001', 'type' => 'reservation',
            'arrival' => now()->addDays(10)->toDateString(), 'departure' => now()->addDays(12)->toDateString(),
            'apartment' => ['id' => 101, 'name' => 'Sea view'], 'channel' => ['id' => 7, 'name' => 'Direct booking'],
            'guest-name' => 'Ada Lovelace', 'email' => 'ada@example.test', 'adults' => 2, 'children' => 0,
            'price' => 180, 'price-paid' => 'No',
        ], $over);
    }

    /** Review Focus 6. */
    public function test_the_sync_keeps_the_portal_fields(): void
    {
        $guest = Guest::withoutGlobalScopes()->create(['organization_id' => $this->org->id, 'first_name' => 'Ada', 'last_name' => 'L', 'full_name' => 'Ada L', 'email' => 'members-own@example.test', 'member_id' => 41]);
        $mirror = $this->mirror(['guest_id' => $guest->id, 'discount_amount' => 20, 'list_total' => 200, 'discount_label' => 'Gold']);

        $this->engine->upsertBookingFromData($this->smoobu());

        $fresh = $mirror->fresh();
        $this->assertSame('Member portal', $fresh->channel_name);
        $this->assertSame($guest->id, (int) $fresh->guest_id, 'the email lookup found no guest; the member\'s link must survive');
        $this->assertSame(41, (int) $fresh->member_id);
        $this->assertEquals(20.0, (float) $fresh->discount_amount);
        $this->assertSame('open', $fresh->payment_status);
    }

    public function test_the_sync_still_keeps_website_for_a_widget_booking(): void
    {
        $mirror = $this->mirror(['channel_name' => 'Website', 'member_id' => null]);
        $this->engine->upsertBookingFromData($this->smoobu());
        $this->assertSame('Website', $mirror->fresh()->channel_name);
    }

    public function test_the_sync_relabels_a_booking_it_did_not_write(): void
    {
        $mirror = $this->mirror(['channel_name' => 'Airbnb', 'member_id' => null, 'payment_status' => 'channel_managed']);
        $this->engine->upsertBookingFromData($this->smoobu(['channel' => ['id' => 3, 'name' => 'Booking.com']]));
        $this->assertSame('Booking.com', $mirror->fresh()->channel_name);
    }

    public function test_a_refund_and_an_authorisation_are_never_overwritten(): void
    {
        foreach (['refunded', 'partially_refunded', 'disputed', 'cancelled', 'authorized'] as $i => $status) {
            $mirror = $this->mirror(['reservation_id' => (string) (777100 + $i), 'payment_status' => $status, 'stripe_payment_intent_id' => 'pi_' . $status]);
            $this->engine->upsertBookingFromData($this->smoobu(['id' => 777100 + $i, 'price-paid' => 'Yes']));
            $this->assertSame($status, $mirror->fresh()->payment_status, $status);
        }
    }

    public function test_a_member_stay_paid_at_the_venue_becomes_paid_when_smoobu_says_so(): void
    {
        $mirror = $this->mirror();
        $this->engine->upsertBookingFromData($this->smoobu(['price-paid' => 'Yes']));
        $this->assertSame('paid', $mirror->fresh()->payment_status);
    }

    public function test_a_member_stay_paid_online_is_not_reopened_by_smoobu(): void
    {
        $mirror = $this->mirror(['payment_status' => 'paid', 'payment_method' => 'stripe', 'stripe_payment_intent_id' => 'pi_paid']);
        $this->engine->upsertBookingFromData($this->smoobu(['price-paid' => 'No']));
        $this->assertSame('paid', $mirror->fresh()->payment_status);
    }

    public function test_a_member_cancellation_is_not_resurrected(): void
    {
        $mirror = $this->mirror(['internal_status' => 'cancelled', 'booking_state' => 'cancelled', 'cancelled_at' => now(), 'cancellation_reason' => 'member_portal']);
        $this->engine->upsertBookingFromData($this->smoobu()); // Smoobu still says "reservation": its own cancel failed
        $fresh = $mirror->fresh();
        $this->assertSame('cancelled', $fresh->internal_status);
        $this->assertSame('cancelled', $fresh->booking_state);
    }
}
```

- [ ] **Step 3: Run both to see them fail**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Booking/BookingEngineConfirmTest.php tests/Feature/Booking/BookingEngineSyncPinTest.php --no-ansi`
Expected: FAIL — `Interface "App\Services\Booking\StayConfirmHooks" not found`; in the sync test `channel_name` is `Direct booking`, `guest_id` is null, and the payment statuses are overwritten.

- [ ] **Step 4: The hooks interface**

Create `app/Services/Booking/StayConfirmHooks.php`:

```php
<?php

namespace App\Services\Booking;

use App\Models\BookingMirror;

/**
 * What a caller of BookingEngineService::confirm() may do inside the
 * engine's own transaction, under the room lock.
 *
 * beforeReservation() runs after the hold, the inventory and the live
 * availability have been re-checked and BEFORE the reservation is sent to
 * the PMS: anything that can still refuse the booking (a payment already
 * spent, a coupon just used, a price that moved) belongs here, where a
 * refusal costs nothing. Throw to refuse; the exception reaches the caller
 * and the transaction rolls back.
 *
 * afterMirror() runs after the mirror and its line items are written and
 * before the transaction commits: writes that must exist exactly when the
 * booking does. It must not throw for anything it could have checked in
 * beforeReservation() — by now the PMS holds a reservation.
 */
interface StayConfirmHooks
{
    public function beforeReservation(array $payload): void;

    public function afterMirror(BookingMirror $mirror, array $payload): void;
}
```

- [ ] **Step 5: `confirm()` — signature, guest, hooks**

In `app/Services/BookingEngineService.php` add the import `use App\Services\Booking\StayConfirmHooks;` (after `use App\Models\Organization;`), then:

(a) Signature, line 231:

```php
    public function confirm(array $data, ?string $idempotencyKey = null, ?string $requestId = null, ?string $ip = null, ?StayConfirmHooks $hooks = null): array
```

(b) Guest link, line 309 — replace

```php
        $guestId = $this->linkOrCreateGuest($guest, $orgId);
```

with

```php
        // A caller that already knows the guest (the member portal links the
        // member's own CRM guest) names it; nobody is looked up by email then.
        $guestId = isset($data['guest_id']) ? (int) $data['guest_id'] : $this->linkOrCreateGuest($guest, $orgId);
```

(c) The transaction closure's `use` list, lines 319-321 — add `$hooks`:

```php
        [$mirror, $result, $internalStatus, $pmsResult] = DB::transaction(function () use (
            $hold, $payload, $orgId, $apartmentId, $data, $guest, $guestId, $requestId, $idempotencyKey, $lockKey, $hooks
        ) {
```

(d) Immediately before the comment line `// ── Create reservation in Smoobu ────────────────────────` (line 519) insert:

```php
            // The caller's last word before the PMS is asked (see StayConfirmHooks).
            $hooks?->beforeReservation($payload);

```

(e) Immediately after `$this->persistPriceElements($mirror, $payload, $orgId);` (line 917) insert:

```php
            $hooks?->afterMirror($mirror, $payload);
```

- [ ] **Step 6: `confirm()` — the Smoobu receipt**

(a) Line 589 — replace

```php
                $sourceLines = ['Booked via: Website / Direct widget'];
```

with

```php
                $fromPortal = ($payload['channel_name'] ?? null) === 'Member portal';
                $sourceLines = [$fromPortal ? 'Booked via: Member portal' : 'Booked via: Website / Direct widget'];
                $discount = round((float) ($payload['discount'] ?? 0), 2);
```

(b) Lines 672-673 — replace

```php
                $breakdownLines[] = '─────────────';
                $breakdownLines[] = 'Total: €' . number_format($grossTotal, 2, '.', '');
```

with

```php
                if ($discount > 0) {
                    $breakdownLines[] = sprintf(
                        '%s: -€%s',
                        (string) ($payload['discount_label'] ?? 'Member discount'),
                        number_format($discount, 2, '.', '')
                    );
                }
                $breakdownLines[] = '─────────────';
                $breakdownLines[] = 'Total: €' . number_format($grossTotal, 2, '.', '');
```

(c) In the `basePrice` element (line 693) — replace

```php
                    'amount'       => round($roomTotal, 2),
```

with

```php
                    // A member discount comes off the accommodation line, so
                    // Smoobu's own sum of the elements equals `price`.
                    'amount'       => round($roomTotal - $discount, 2),
```

(d) Immediately after the closing `];` of `$smoobuPayload = [ … ];` (the array that ends with `'type' => 'reservation',`, line 760) insert:

```php
                // A discount larger than the accommodation line cannot be shown
                // as a base price; the top-level `price` stays the truth.
                if ($discount > round($roomTotal, 2)) {
                    unset($smoobuPayload['priceElements']);
                }
```

- [ ] **Step 7: `confirm()` — the mirror**

In the `BookingMirror::create([ … ])` call (lines 883-911): replace

```php
                'channel_name'      => 'Website',
```

with

```php
                'channel_name'      => $payload['channel_name'] ?? 'Website',
```

and replace the closing `]);` of that call with

```php
            ] + $this->memberColumns($payload, $data));
```

Add the private method next to `linkOrCreateGuest()`:

```php
    /**
     * The member and their discount, from a hold the member portal quoted
     * (App\Services\Booking\StayQuoteService). A hold without a member —
     * every widget hold — adds nothing, so the widget's mirror is what it
     * always was.
     */
    private function memberColumns(array $payload, array $data): array
    {
        if (empty($payload['member_id'])) {
            return [];
        }

        return [
            'member_id'          => (int) $payload['member_id'],
            'list_total'         => $payload['list_total'] ?? $payload['gross_total'],
            'discount_amount'    => round((float) ($payload['discount'] ?? 0), 2),
            'discount_source'    => $payload['discount_source'] ?? null,
            'discount_source_id' => $payload['discount_source_id'] ?? null,
            'discount_label'     => isset($payload['discount_label']) ? mb_substr((string) $payload['discount_label'], 0, 120) : null,
            'notice'             => trim((string) ($data['special_requests'] ?? '')) ?: null,
        ];
    }
```

- [ ] **Step 8: `persistPriceElements()` — the discount row**

Replace the whole method (lines 2271-2326) with:

```php
    /**
     * Write a BookingPriceElement row for the room, one per selected extra
     * and, for a member booking, one negative row for the discount, so the
     * admin booking detail page can render the full price breakdown.
     */
    private function persistPriceElements(BookingMirror $mirror, array $payload, ?int $orgId): void
    {
        $reservationId = (string) ($mirror->reservation_id ?? '');
        $currency      = $payload['currency'] ?? 'EUR';
        $nights        = max(1, (int) ($payload['nights'] ?? 1));
        $sortOrder     = 0;

        // Room (accommodation) line — quantity is nights so admin sees
        // "€120.00 × 3" rather than a flat lump sum.
        $perNight = (float) ($payload['price_per_night']
            ?? (($payload['room_total'] ?? 0) / max(1, $nights)));

        BookingPriceElement::create([
            'organization_id'  => $orgId,
            'booking_mirror_id'=> $mirror->id,
            'reservation_id'   => $reservationId,
            'element_type'     => 'accommodation',
            'name'             => $payload['unit_name'] ?? 'Accommodation',
            'amount'           => round($perNight, 2),
            'quantity'         => $nights,
            'currency_code'    => $currency,
            'sort_order'       => $sortOrder++,
        ]);

        // Extras: re-resolve names + per-unit amounts from the saved settings
        // so the admin sees the same labels the customer picked.
        $extras    = $payload['extras'] ?? [];
        $adults    = (int) ($payload['adults'] ?? 1);
        $allExtras = empty($extras) ? collect() : collect($this->loadExtrasConfig());

        foreach ($extras as $item) {
            $extraId = $item['id'] ?? null;
            $qty     = max(1, (int) ($item['quantity'] ?? 1));
            $def     = $allExtras->firstWhere('id', $extraId);
            if (!$def) continue;

            $unitPrice = (float) ($def['price'] ?? 0);
            if (($def['type'] ?? 'per_stay') === 'per_guest') {
                $unitPrice *= max(1, $adults);
            }

            BookingPriceElement::create([
                'organization_id'  => $orgId,
                'booking_mirror_id'=> $mirror->id,
                'reservation_id'   => $reservationId,
                'element_type'     => 'extra',
                'name'             => $def['name'] ?? ($def['label'] ?? 'Extra'),
                'amount'           => round($unitPrice, 2),
                'quantity'         => $qty,
                'currency_code'    => $currency,
                'sort_order'       => $sortOrder++,
            ]);
        }

        $discount = round((float) ($payload['discount'] ?? 0), 2);
        if ($discount > 0) {
            BookingPriceElement::create([
                'organization_id'  => $orgId,
                'booking_mirror_id'=> $mirror->id,
                'reservation_id'   => $reservationId,
                'element_type'     => 'discount',
                'name'             => mb_substr((string) ($payload['discount_label'] ?? 'Member discount'), 0, 180),
                'amount'           => -$discount,
                'quantity'         => 1,
                'currency_code'    => $currency,
                'sort_order'       => $sortOrder++,
            ]);
        }
    }
```

The only behavioural change for a hold without a discount is none: the early `return` on "no extras" became a loop over an empty list.

- [ ] **Step 9: `upsertBookingFromData()` — the pins**

Replace the block from `$existing = null;` (line 1460) through the `$resolvedChannel = …;` statement (line 1487) with:

```php
        $existing = null;
        $existingChannel = null;
        $existingHadStripe = false;
        $existingPriceTotal = null;
        $existingHadBreakdown = false;
        if (!empty($data['id'])) {
            // `id` is needed alongside the snapshot fields so the existsHadBreakdown
            // lookup below can use the relational booking_price_elements table.
            // Note: there is no `price_breakdown` column on booking_mirror — the
            // breakdown lives in the relational `booking_price_elements` table.
            $existing = BookingMirror::withoutGlobalScopes()
                ->where('organization_id', $orgId)
                ->where('reservation_id', $clip((string) $data['id'], 30))
                ->first(['id', 'channel_name', 'stripe_payment_intent_id', 'price_total', 'member_id', 'guest_id', 'payment_status', 'internal_status', 'booking_state', 'cancelled_at']);
            if ($existing) {
                $existingChannel      = $existing->channel_name;
                $existingHadStripe    = !empty($existing->stripe_payment_intent_id);
                $existingPriceTotal   = $existing->price_total !== null ? (float) $existing->price_total : null;
                $existingHadBreakdown = $existing->priceElements()->exists();
            }
        }
        $smoobuChannel = $clip($strOrNull($channel['name'] ?? null), 80);
        // A booking we wrote keeps our own channel name: "Website" for the
        // widget (also recognised by its Stripe intent), "Member portal" for
        // the portal. Anything else is Smoobu's to name.
        $resolvedChannel = match (true) {
            $existingChannel === 'Member portal'                  => 'Member portal',
            $existingChannel === 'Website' || $existingHadStripe  => 'Website',
            default                                               => $smoobuChannel,
        };

        // What the sync must not overwrite on a mirror we wrote ourselves.
        $byMember = $existing && !empty($existing->member_id);
        // The member's own guest link: an email lookup can come back empty
        // (the guest row carries another address) and must not unlink them.
        if ($byMember && $existing->guest_id) {
            $guestId = (int) $existing->guest_id;
        }
        // Money states Smoobu knows nothing about: a refund, a dispute, a
        // released hold, and an authorisation the capture job has yet to take.
        // And a member's online payment is never reopened by Smoobu's flag.
        $current = $existing ? (string) $existing->payment_status : '';
        if (in_array($current, ['refunded', 'partially_refunded', 'disputed', 'cancelled', 'authorized'], true)
            || ($byMember && $current === 'paid' && $paymentStatus !== PaymentStatus::Paid->value)) {
            $paymentStatus = $current;
        }
        // A cancellation made here (cancelled_at is ours; Smoobu's own
        // cancellations arrive as type "cancellation") stays a cancellation
        // even when the PMS-side cancel failed and Smoobu still lists it.
        if ($existing && $existing->cancelled_at !== null) {
            $internalStatus = 'cancelled';
            $bookingState = 'cancelled';
        }
```

The `BookingMirror::updateOrCreate()` call below it is unchanged: it already writes `$resolvedChannel`, `$guestId`, `$paymentStatus`, `$internalStatus` and `$bookingState`.

One caution: `->first([...])` names `member_id` and `cancelled_at`, which exist only after this phase's migration. The deploy runs migrations before the new code serves; locally, Task 23 runs the migration by `--path` before the live pass.

- [ ] **Step 10: Run the tests**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Booking/BookingEngineConfirmTest.php tests/Feature/Booking/BookingEngineSyncPinTest.php --no-ansi`
Expected: `Tests:    21 passed` (14 + 7). The eight tests of Task 2 pass unchanged — if one of them needed an edit, the widget's behaviour changed: undo the engine change that caused it.

- [ ] **Step 11: Neighbouring suites**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Booking/ --no-ansi`, `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Unit/Booking/ --no-ansi`, `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Unit/Services/ --no-ansi`
Expected: all pass.

- [ ] **Step 12: Commit**

```bash
git add app/Services/Booking/StayConfirmHooks.php app/Services/BookingEngineService.php tests/Feature/Booking/BookingEngineConfirmTest.php tests/Feature/Booking/BookingEngineSyncPinTest.php
git commit -m "Let a stay carry its member and discount, and keep them through the sync

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Stay emails — the discount line, the policy the venue actually saved, no "set your password" to a member

**Files:**
- Modify: `app/Mail/BookingConfirmationMail.php` (constructor `:32-75`), `resources/views/emails/booking-confirmation.blade.php` (`:163-175`, `:259-263`), `app/Services/BookingEngineService.php` (`sendBookingEmails()` `:1983-2213`)
- Test: `tests/Feature/Mail/BookingConfirmationMailTest.php` (add), `tests/Feature/Booking/BookingEngineConfirmTest.php` (add)

**Interfaces:**
- Consumes: Task 3's hold payload keys (`member_id`, `discount`, `discount_label`, `list_total`).
- Produces: `BookingConfirmationMail` gains two trailing constructor parameters, `?float $discountAmount = null` and `?string $discountLabel = null`; existing callers are unaffected.

- [ ] **Step 1: Write the failing tests**

Add to `tests/Feature/Mail/BookingConfirmationMailTest.php`:

```php
    public function test_a_member_discount_is_shown_between_the_lines_and_the_total(): void
    {
        $html = $this->makeMail(['grossTotal' => 450.00, 'discountAmount' => 50.00, 'discountLabel' => 'Gold: 10% off stays'])->render();

        $this->assertStringContainsString('Gold: 10% off stays', $html);
        $this->assertStringContainsString('−EUR 50.00', $html);
        $this->assertLessThan(strpos($html, 'EUR 450.00'), strpos($html, 'Gold: 10% off stays'), 'the discount sits above the total');
    }

    public function test_no_discount_row_without_a_discount(): void
    {
        $html = $this->makeMail()->render();
        $this->assertStringNotContainsString('−EUR', $html);
    }

    public function test_the_cancellation_policy_the_venue_saved_is_shown(): void
    {
        // Settings → Booking saves the text under `cancellation_policy`; the
        // template used to read `cancellation` and never showed it.
        $html = $this->makeMail(['policies' => ['cancellation_policy' => 'Free cancellation until 48 hours before arrival.']])->render();
        $this->assertStringContainsString('Free cancellation until 48 hours before arrival.', $html);

        $legacy = $this->makeMail(['policies' => ['cancellation' => 'Older key still works.']])->render();
        $this->assertStringContainsString('Older key still works.', $legacy);
    }
```

Add to `tests/Feature/Booking/BookingEngineConfirmTest.php` (imports: `use App\Mail\BookingMembershipMail;`, `use App\Mail\AdminBookingNotificationMail;`, `use App\Models\LoyaltyMember;`, `use App\Models\LoyaltyTier;`, `use App\Models\User;`):

```php
    /** A member of this venue who has never been sent the "set your password" mail. */
    private function unwelcomedMember(string $email): LoyaltyMember
    {
        $tier = LoyaltyTier::create(['organization_id' => $this->org->id, 'name' => 'Gold', 'min_points' => 0, 'is_active' => true]);
        $user = User::create(['name' => 'Ada Lovelace', 'email' => $email, 'password' => bcrypt('secret-pass-1'), 'user_type' => 'member', 'organization_id' => $this->org->id]);
        return LoyaltyMember::create(['organization_id' => $this->org->id, 'user_id' => $user->id, 'tier_id' => $tier->id, 'member_number' => 'HL-' . uniqid(), 'current_points' => 0]);
    }

    public function test_a_member_booking_mail_carries_the_discount_and_no_membership_invitation(): void
    {
        $this->smoobuAccepts();
        $member = $this->unwelcomedMember('ada@example.test');
        $hold = $this->memberHold(['member_id' => $member->id]);

        $this->engine->confirm(['hold_token' => $hold->hold_token, 'guest' => $this->guest()]);

        Mail::assertQueued(BookingConfirmationMail::class, fn (BookingConfirmationMail $m) => $m->grossTotal === 180.0 && $m->discountAmount === 20.0 && $m->discountLabel === 'Gold: 10% off stays');
        Mail::assertNotQueued(BookingMembershipMail::class);
        $this->assertNull($member->fresh()->welcomed_at, 'a portal booking is not the member\'s welcome');
    }

    public function test_a_widget_booking_by_a_new_member_still_gets_the_invitation(): void
    {
        $this->smoobuAccepts();
        $this->unwelcomedMember('ada@example.test');
        $hold = $this->hold();

        $this->engine->confirm(['hold_token' => $hold->hold_token, 'guest' => $this->guest()]);

        Mail::assertQueued(BookingMembershipMail::class);
    }
```

`welcomed_at` and the `email_verification_codes` table may be missing from the sqlite schema; if `test_a_widget_booking…` fails with the mail not queued, read `storage/logs/laravel.log` for `Booking membership email failed` and add the missing column or table in this test's own `setUp()` override (guarded with `Schema::hasColumn` / `Schema::hasTable`), shaped like the real migration.

- [ ] **Step 2: Run them to see them fail**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Mail/BookingConfirmationMailTest.php tests/Feature/Booking/BookingEngineConfirmTest.php --no-ansi`
Expected: FAIL — `Unknown named parameter $discountAmount`; the membership mail is queued for the member hold.

- [ ] **Step 3: The mailable**

In `app/Mail/BookingConfirmationMail.php`, after `public ?string $industry = null,` add:

```php
        // Member portal: the discount between the lines and the total.
        public ?float $discountAmount = null,
        public ?string $discountLabel = null,
```

- [ ] **Step 4: The template**

In `resources/views/emails/booking-confirmation.blade.php`, between the `@endif` that closes the "Extras subtotal" row (line 168) and the `</table>` on line 169, insert:

```blade
            @if(($discountAmount ?? 0) > 0)
                <tr>
                    <td class="lbl">{{ $discountLabel ?: 'Member discount' }}</td>
                    <td class="val">−{{ $currency }} {{ number_format($discountAmount, 2) }}</td>
                </tr>
            @endif
```

and replace lines 259-263

```blade
        @if(!empty($policies['cancellation']))
            <p style="font-size:12px;color:rgba(255,255,255,0.6);line-height:1.65;margin:14px 0 0;">
                <strong style="color:rgba(255,255,255,0.82);">Cancellation policy:</strong> {{ $policies['cancellation'] }}
            </p>
        @endif
```

with

```blade
        @php $cancellationPolicy = $policies['cancellation_policy'] ?? $policies['cancellation'] ?? null; @endphp
        @if(!empty($cancellationPolicy))
            <p style="font-size:12px;color:rgba(255,255,255,0.6);line-height:1.65;margin:14px 0 0;">
                <strong style="color:rgba(255,255,255,0.82);">Cancellation policy:</strong> {{ $cancellationPolicy }}
            </p>
        @endif
```

Then run `/c/wamp64/bin/php/php8.4.20/php.exe artisan view:clear`.

- [ ] **Step 5: `sendBookingEmails()`**

In `app/Services/BookingEngineService.php`:

(a) In the `new BookingConfirmationMail(` call, after the `industry: …,` argument add:

```php
                discountAmount: round((float) ($payload['discount'] ?? 0), 2) > 0 ? round((float) $payload['discount'], 2) : null,
                discountLabel: $payload['discount_label'] ?? null,
```

(b) In the `new \App\Mail\AdminBookingNotificationMail(` call, replace

```php
                    specialRequests:  $payload['special_requests'] ?? null,
```

with

```php
                    specialRequests:  $this->venueNote($payload, $mirror),
```

and add the private method after `sendBookingEmails()`:

```php
    /**
     * What the venue's notification says under "special requests": for a
     * member-portal booking, where it came from and the discount (the
     * notification has no field of its own for either), then the guest's
     * own words. A widget booking is its special requests, as before.
     */
    private function venueNote(array $payload, ?BookingMirror $mirror): ?string
    {
        $own = $payload['special_requests'] ?? $mirror?->notice;
        if (empty($payload['member_id'])) {
            return $own ?: null;
        }

        $parts = ['Member portal'];
        $discount = round((float) ($payload['discount'] ?? 0), 2);
        if ($discount > 0) {
            $parts[] = sprintf('Discount: -%s %s (%s)', number_format($discount, 2), $payload['currency'] ?? 'EUR', $payload['discount_label'] ?? 'member discount');
        }
        if ($own) {
            $parts[] = $own;
        }

        return implode(' — ', $parts);
    }
```

(c) The membership invitation (section `// 2) Membership Invitation Email`) — wrap the whole `try { … } catch (\Throwable $e) { … }` block in:

```php
        // A booking made in the member portal was made by someone who is
        // already signed in: they need no "set your password" mail.
        if (empty($payload['member_id'])) {
            // … the existing try/catch block, unchanged …
        }
```

- [ ] **Step 6: Run the tests**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Mail/BookingConfirmationMailTest.php tests/Feature/Booking/BookingEngineConfirmTest.php --no-ansi`
Expected: all pass (the mail test's count grows by 3, the engine test is at 16).

- [ ] **Step 7: Commit**

```bash
git add app/Mail/BookingConfirmationMail.php resources/views/emails/booking-confirmation.blade.php app/Services/BookingEngineService.php tests/Feature/Mail/BookingConfirmationMailTest.php tests/Feature/Booking/BookingEngineConfirmTest.php
git commit -m "Show the member discount and the saved policy in the stay confirmation

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
## Part B — Booking a stay

### Task 5: Rooms, availability and the capability

**Files:**
- Create: `app/Services/Booking/StayCatalogue.php`, `app/Services/Booking/StayQuoteException.php`, `app/Services/Booking/StayQuoteService.php` (this task writes `rules()`, `assertStayAllowed()` and `pricedMember()`; Task 6 adds `quote()`), `app/Http/Controllers/Api/V1/Member/Portal/PortalStayBookingController.php` (this task writes `index()` and `availability()`)
- Modify: `app/Services/Booking/BookingCapability.php`, `app/Services/Portal/PortalBootstrap.php` (`timezone()` `:68-71`, `build()` `:84-88`, `capabilities()` `:141-176`), `app/Http/Controllers/Api/V1/Member/Portal/PortalServiceBookingController.php` (`venueToday()` `:612-618`), `routes/api.php` (the `member/portal` group `:407-423`)
- Create: `tests/Feature/Member/Portal/StayPortalFixture.php`
- Test: `tests/Feature/Member/Portal/PortalStayCatalogueTest.php` (create), `tests/Feature/Member/Portal/PortalBootstrapTest.php` (modify)

**Interfaces:**
- Consumes: `SetsUpStayBookingSchema` (Task 1); `MemberPricing::quote()`, `MemberPricing::quoteWithoutMember()`, `BookingScope::Stays`, `MemberProvisioner::ensureForUser()`, `PortalBootstrap::paymentMode()` and `::loyaltyOn()` (phase 2); `AvailabilityService::check(string $checkIn, string $checkOut, int $adults = 2, int $children = 0): array`.
- Produces:
  - `BookingCapability::staysBookableOnline(int $orgId): bool`
  - `PortalBootstrap::timezone(Organization $org): string` — now always a valid zone; `PortalBootstrap::venueToday(int $orgId): \Carbon\CarbonImmutable` (midnight today in the venue's zone)
  - bootstrap `policies` gains `booking_cancellation_policy` (string), `check_in_time` (string, `HH:MM`, default `15:00`), `check_out_time` (string, default `11:00`)
  - `StayCatalogue::build(int $orgId): array{rooms: list<array>, extras: list<array>, policies: array{check_in_time: string, check_out_time: string, cancellation_policy: ?string, payment_terms: ?string, cancel_hours: int}, rules: array{currency: string, min_nights: int, max_nights: int}}`
  - `StayQuoteException extends \RuntimeException` with `public readonly string $errorCode` and `public readonly int $status`; constructor `(string $errorCode, string $message, int $status)`
  - `StayQuoteService::rules(): array{currency: string, min_nights: int, max_nights: int}`; `assertStayAllowed(string $checkIn, string $checkOut): int` (nights; throws `StayQuoteException('invalid_stay', …, 422)`); `pricedMember(\App\Models\User $user): ?\App\Models\LoyaltyMember`
  - Routes `GET member/portal/stays`, `GET member/portal/stays/availability`
  - Trait `Tests\Feature\Member\Portal\StayPortalFixture` with `setUpStayPortal(): void`, `setting(string $key, string $value): void`, `stripe(bool $enabled = true, string $currency = 'eur'): \Mockery\MockInterface`, `smoobuRates(float $total = 200.0): void`, `tenPercentOnStays(): void`, `claim(float $value, string $type = 'fixed_amount', string $appliesTo = 'all'): \App\Models\MemberOffer`, and the properties `$org`, `$token`, `$user`, `$member`, `$smoobu`, `$checkIn`, `$checkOut` (two nights, ten days out).

- [ ] **Step 1: The shared fixture**

Create `tests/Feature/Member/Portal/StayPortalFixture.php`:

```php
<?php

namespace Tests\Feature\Member\Portal;

use App\Models\BenefitDefinition;
use App\Models\HotelSetting;
use App\Models\MemberOffer;
use App\Models\Organization;
use App\Models\SpecialOffer;
use App\Models\TierBenefit;
use App\Models\User;
use App\Services\SmoobuClient;
use App\Services\StripeService;
use Illuminate\Support\Facades\Mail;
use Mockery;

/**
 * A hotel with one room (101 "Sea view", two guests, 100.00 a night), one
 * member signed in through the real register endpoint, and Smoobu replaced
 * by a Mockery mock in the container — no test here makes an HTTP call.
 *
 * For classes that extend MemberEndpointTestCase and also
 * `use SetsUpStayBookingSchema, SeedsDiscountFixture` (the latter declares
 * `$member` and the discount tables).
 */
trait StayPortalFixture
{
    protected Organization $org;
    protected User $user;
    protected string $token;
    protected $smoobu;
    protected string $checkIn;
    protected string $checkOut;

    protected function setUpStayPortal(): void
    {
        $this->setUpStayBookingSchema();
        $this->setUpLoyaltySchema();
        $this->setUpDiscountTables();
        Mail::fake();

        $this->org = $this->tenant();
        ['token' => $this->token, 'member' => $this->member, 'user' => $this->user] = $this->member($this->org);

        app()->instance('current_organization_id', $this->org->id);
        $this->seedRoom($this->org->id);
        app()->forgetInstance('current_organization_id');

        $this->checkIn = now()->addDays(10)->toDateString();
        $this->checkOut = now()->addDays(12)->toDateString();

        $this->smoobu = Mockery::mock(SmoobuClient::class);
        $this->app->instance(SmoobuClient::class, $this->smoobu);
    }

    protected function setting(string $key, string $value): void
    {
        // organization_id is not fillable on HotelSetting (BelongsToOrganization
        // sets it from the bound tenant), so it is set on the model directly.
        $row = HotelSetting::withoutGlobalScopes()->where('organization_id', $this->org->id)->where('key', $key)->first() ?? new HotelSetting();
        $row->organization_id = $this->org->id;
        $row->key = $key;
        $row->value = $value;
        $row->group = 'booking';
        $row->save();
        HotelSetting::flushCacheFor($this->org->id);
    }

    /** Stripe enabled in EUR, as a mock that records what it was asked. */
    protected function stripe(bool $enabled = true, string $currency = 'eur'): Mockery\MockInterface
    {
        $stripe = Mockery::mock(StripeService::class);
        $stripe->shouldReceive('isEnabled')->andReturn($enabled);
        $stripe->shouldReceive('currency')->andReturn($currency);
        $stripe->shouldReceive('publishableKey')->andReturn('pk_test_x');
        $stripe->shouldReceive('toSmallestUnit')->passthru();
        $this->app->instance(StripeService::class, $stripe);
        return $stripe;
    }

    /** Smoobu prices room 101 at $total for the fixture's two nights and says it is free. */
    protected function smoobuRates(float $total = 200.0): void
    {
        $rate = ['available' => true, 'price' => $total, 'price_per_night' => round($total / 2, 2), 'min_stay' => 1, 'currency' => 'EUR'];
        $this->smoobu->shouldReceive('getDailyRates')->byDefault()->andReturn([]);
        $this->smoobu->shouldReceive('getRates')->byDefault()->andReturn(['data' => ['101' => $rate]]);
        $this->smoobu->shouldReceive('checkAvailability')->byDefault()->andReturn(['available' => ['101'], 'prices' => ['101' => ['price' => $total]]]);
    }

    protected function tenPercentOnStays(): void
    {
        $def = BenefitDefinition::create(['organization_id' => $this->org->id, 'name' => '10% off stays', 'code' => 'ten-stays', 'category' => 'discount', 'is_active' => true]);
        TierBenefit::create(['organization_id' => $this->org->id, 'tier_id' => $this->member->tier_id, 'benefit_id' => $def->id, 'value_type' => 'percent_discount', 'value_amount' => 10, 'applies_to' => 'stays', 'is_active' => true]);
    }

    protected function claim(float $value, string $type = 'fixed_amount', string $appliesTo = 'all'): MemberOffer
    {
        $offer = SpecialOffer::withoutGlobalScopes()->create(['organization_id' => $this->org->id, 'title' => "$value off", 'description' => '-', 'type' => $type, 'value' => $value, 'applies_to' => $appliesTo, 'start_date' => now()->subDay()->toDateString(), 'end_date' => now()->addDays(30)->toDateString(), 'is_active' => true]);
        return MemberOffer::create(['organization_id' => $this->org->id, 'member_id' => $this->member->id, 'offer_id' => $offer->id, 'status' => 'claimed', 'claimed_at' => now()]);
    }
}
```

If the container does not hand the mock to `BookingEngineService` or `AvailabilityService` (a service provider that builds either by hand with `new SmoobuClient`), bind those services too at the end of `setUpStayPortal()`: `$this->app->bind(\App\Services\AvailabilityService::class, fn () => new \App\Services\AvailabilityService($this->smoobu));` and the same for `BookingEngineService`.

- [ ] **Step 2: Write the failing tests**

Create `tests/Feature/Member/Portal/PortalStayCatalogueTest.php`:

```php
<?php

namespace Tests\Feature\Member\Portal;

use App\Models\BookingRoom;
use Tests\Concerns\SeedsDiscountFixture;
use Tests\Concerns\SetsUpStayBookingSchema;
use Tests\Feature\Member\MemberEndpointTestCase;

class PortalStayCatalogueTest extends MemberEndpointTestCase
{
    use SetsUpStayBookingSchema, SeedsDiscountFixture, StayPortalFixture;

    private const ROOMS = '/api/v1/member/portal/stays';
    private const FREE = '/api/v1/member/portal/stays/availability';

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpStayPortal();
    }

    private function free(array $query = [])
    {
        return $this->withToken($this->token)->getJson(self::FREE . '?' . http_build_query(array_merge(['check_in' => $this->checkIn, 'check_out' => $this->checkOut, 'adults' => 2, 'children' => 0], $query)));
    }

    public function test_the_catalogue_lists_rooms_extras_policies_and_limits(): void
    {
        app()->instance('current_organization_id', $this->org->id);
        $extra = $this->seedStayExtra($this->org->id);
        $this->seedRoom($this->org->id, ['pms_id' => '102', 'name' => 'Closed wing', 'slug' => 'closed', 'is_active' => false]);
        app()->forgetInstance('current_organization_id');
        $this->setting('booking_policies', json_encode(['check_in_time' => '16:00', 'check_out_time' => '10:00', 'cancellation_policy' => 'Free until two days before.']));
        $this->setting('booking_min_nights', '2');
        $this->setting('booking_max_nights', '14');
        $this->setting('booking_cancel_hours', '48');
        $this->tenPercentOnStays();

        $json = $this->withToken($this->token)->getJson(self::ROOMS)->assertOk()->json();

        $this->assertSame(['101'], array_column($json['rooms'], 'id'), 'inactive rooms are not offered');
        $this->assertSame('Sea view', $json['rooms'][0]['name']);
        $this->assertSame(2, $json['rooms'][0]['max_guests']);
        $this->assertEquals(100.0, $json['rooms'][0]['base_price']);
        $this->assertSame((string) $extra->id, $json['extras'][0]['id']);
        $this->assertEquals(15.0, $json['extras'][0]['price']);
        $this->assertSame('16:00', $json['policies']['check_in_time']);
        $this->assertSame('Free until two days before.', $json['policies']['cancellation_policy']);
        $this->assertSame(48, $json['policies']['cancel_hours']);
        $this->assertSame(['currency' => 'EUR', 'min_nights' => 2, 'max_nights' => 14], $json['rules']);
        $this->assertSame('10% off stays', $json['pricing']['automatic']['label']);
        $this->assertSame('at_venue', $json['payment']['mode']);
        $this->assertArrayNotHasKey('style', $json, 'the widget\'s styling is not the portal\'s');
    }

    public function test_a_venue_without_rooms_or_with_smoobu_off_answers_not_bookable(): void
    {
        $this->setting('smoobu_enabled', 'false');
        $this->withToken($this->token)->getJson(self::ROOMS)->assertStatus(404)->assertJsonPath('error', 'not_bookable');

        $this->setting('smoobu_enabled', 'true');
        $this->flushHeaders();
        BookingRoom::withoutGlobalScopes()->where('organization_id', $this->org->id)->update(['is_active' => false]);
        $this->withToken($this->token)->getJson(self::ROOMS)->assertStatus(404)->assertJsonPath('error', 'not_bookable');
    }

    public function test_availability_lists_free_rooms_with_the_member_total(): void
    {
        $this->smoobuRates(200.0);
        $this->tenPercentOnStays();

        $json = $this->free()->assertOk()->json();

        $this->assertSame(2, $json['nights']);
        $this->assertFalse($json['party_too_large']);
        $this->assertCount(1, $json['rooms']);
        $this->assertSame('101', $json['rooms'][0]['id']);
        $this->assertEquals(200.0, $json['rooms'][0]['total_price']);
        $this->assertEquals(180.0, $json['rooms'][0]['member_total']);
        $this->assertEquals(100.0, $json['rooms'][0]['price_per_night']);
        $this->assertSame('EUR', $json['rooms'][0]['currency']);
        $this->assertArrayNotHasKey('combinations', $json, 'combination stays are not sold in the portal (plan3-1)');
    }

    public function test_a_party_too_large_for_any_room_is_told_so(): void
    {
        $this->smoobuRates(200.0);
        app()->instance('current_organization_id', $this->org->id);
        $this->seedRoom($this->org->id, ['pms_id' => '102', 'name' => 'Garden', 'slug' => 'garden']);
        app()->forgetInstance('current_organization_id');
        $this->smoobu->shouldReceive('getRates')->andReturn(['data' => [
            '101' => ['available' => true, 'price' => 200.0, 'min_stay' => 1],
            '102' => ['available' => true, 'price' => 180.0, 'min_stay' => 1],
        ]]);

        $json = $this->free(['adults' => 4])->assertOk()->json();

        $this->assertSame([], $json['rooms']);
        $this->assertTrue($json['party_too_large']);
    }

    public function test_a_stay_outside_the_venues_limits_is_refused(): void
    {
        $this->setting('booking_min_nights', '3');
        $this->free()->assertStatus(422)->assertJsonPath('error', 'invalid_stay');

        $this->setting('booking_min_nights', '1');
        $this->setting('booking_max_nights', '5');
        $this->flushHeaders();
        $this->free(['check_out' => now()->addDays(20)->toDateString()])->assertStatus(422)->assertJsonPath('error', 'invalid_stay');
    }

    public function test_a_check_in_in_the_past_is_refused(): void
    {
        $this->free(['check_in' => now()->subDay()->toDateString()])->assertStatus(422);
    }

    public function test_a_venue_with_a_broken_timezone_still_answers(): void
    {
        \Illuminate\Support\Facades\DB::table('organizations')->where('id', $this->org->id)->update(['timezone' => 'Mars/Olympus']);
        $this->smoobuRates(200.0);
        $this->free()->assertOk();
    }
}
```

If `organizations.timezone` does not exist in the sqlite schema, add it in this test's `setUp()` as `PortalBootstrapTest::setUp()` does (`:48-52`).

In `tests/Feature/Member/Portal/PortalBootstrapTest.php` replace `test_a_rota_switches_services_on_and_rooms_switch_stays_on_for_hotels_only` with:

```php
    public function test_a_rota_switches_services_on_and_rooms_switch_stays_on_whatever_the_industry(): void
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
        $this->assertTrue($json['capabilities']['stays'], 'an active room');

        // Booking is gated on capability, not on industry (CLAUDE.md; plan3-2).
        DB::table('organizations')->where('id', $org->id)->update(['industry' => 'beauty']);
        $this->flushHeaders();
        $json = $this->withToken($token)->getJson(self::ENDPOINT)->assertOk()->json();
        $this->assertTrue($json['capabilities']['stays'], 'a salon that has rooms to sell sells them');
        $this->assertSame('cormorant', $json['venue']['display_face']);
    }

    public function test_stays_are_not_offered_while_smoobu_is_switched_off(): void
    {
        $org = $this->tenant();
        ['token' => $token] = $this->member($org);
        DB::table('booking_rooms')->insert([
            'organization_id' => $org->id, 'pms_id' => 'r1', 'name' => 'Sea view', 'max_guests' => 2,
            'base_price' => 120, 'is_active' => true, 'created_at' => now(), 'updated_at' => now(),
        ]);
        $this->setting($org, 'smoobu_enabled', 'false', 'integrations');

        $json = $this->withToken($token)->getJson(self::ENDPOINT)->assertOk()->json();
        $this->assertFalse($json['capabilities']['stays'], 'the engine would write a booking nobody can see');
    }

    public function test_the_bootstrap_carries_the_stay_policy(): void
    {
        $org = $this->tenant();
        ['token' => $token] = $this->member($org);
        $this->setting($org, 'booking_policies', json_encode(['check_in_time' => '16:00', 'cancellation_policy' => 'Free until two days before.']), 'booking');

        $json = $this->withToken($token)->getJson(self::ENDPOINT)->assertOk()->json();
        $this->assertSame('Free until two days before.', $json['policies']['booking_cancellation_policy']);
        $this->assertSame('16:00', $json['policies']['check_in_time']);
        $this->assertSame('11:00', $json['policies']['check_out_time']);
    }
```

`rota()` and `setting()` are the file's own helpers (`:154-182`).

- [ ] **Step 3: Run them to see them fail**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Member/Portal/PortalStayCatalogueTest.php tests/Feature/Member/Portal/PortalBootstrapTest.php --no-ansi`
Expected: FAIL — 404 on `member/portal/stays` (no route); the salon still reports `stays: false`.

- [ ] **Step 4: Capability and bootstrap**

In `app/Services/Booking/BookingCapability.php` add (imports: `use App\Models\HotelSetting;`):

```php
    /**
     * Rooms to sell AND a PMS to write the stay to. With the Smoobu
     * integration switched off the engine books against a mock and the
     * mirror it writes is hidden from staff and from the member
     * (IntegrationDataScope), so nothing is offered online. The switch is
     * read for the named organisation — a public request has no bound tenant.
     */
    public function staysBookableOnline(int $orgId): bool
    {
        if (!$this->staysBookable($orgId)) {
            return false;
        }
        $switch = HotelSetting::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('key', 'smoobu_enabled')
            ->value('value');

        return $switch === null || filter_var($switch, FILTER_VALIDATE_BOOLEAN);
    }
```

In `app/Services/Portal/PortalBootstrap.php`:

(a) Replace `timezone()` with (import `use Carbon\CarbonImmutable;`):

```php
    /**
     * The venue's own time zone — what the portal sends as
     * `venue.timezone` and what every booking window counts days in.
     * A value PHP does not know (the column is free text) falls back to
     * the application's zone instead of failing every date calculation.
     */
    public static function timezone(Organization $org): string
    {
        $zone = trim((string) $org->timezone);
        if ($zone !== '' && in_array($zone, \DateTimeZone::listIdentifiers(), true)) {
            return $zone;
        }

        return config('app.timezone', 'UTC');
    }

    /** Midnight today in the venue's own time zone. */
    public static function venueToday(int $orgId): CarbonImmutable
    {
        $org = Organization::withoutGlobalScopes()->find($orgId);
        $zone = $org ? self::timezone($org) : config('app.timezone', 'UTC');

        return CarbonImmutable::now($zone)->startOfDay();
    }

    /** The venue's stay policies as saved in Settings → Booking (`booking_policies`, JSON). */
    public static function stayPolicies(): array
    {
        $raw = HotelSetting::getValue('booking_policies', '');
        $p = is_array($raw) ? $raw : (json_decode((string) $raw, true) ?: []);

        return [
            'check_in_time'       => self::clock($p['check_in_time'] ?? null, '15:00'),
            'check_out_time'      => self::clock($p['check_out_time'] ?? null, '11:00'),
            'cancellation_policy' => trim((string) ($p['cancellation_policy'] ?? $p['cancellation'] ?? '')) ?: null,
            'payment_terms'       => trim((string) ($p['payment_terms'] ?? '')) ?: null,
        ];
    }

    /** "16:00", "4:00" or "16:00:00" → "16:00"; anything else → $default. */
    private static function clock(mixed $value, string $default): string
    {
        return is_string($value) && preg_match('/^(\d{1,2}):(\d{2})(:\d{2})?$/', trim($value), $m) && (int) $m[1] < 24 && (int) $m[2] < 60
            ? sprintf('%02d:%02d', (int) $m[1], (int) $m[2])
            : $default;
    }
```

(b) In `build()` replace the `'policies' => [ … ],` entry with:

```php
            'policies'     => [
                'services_cancel_hours'        => (int) HotelSetting::getValue('services_cancel_hours', 24),
                'booking_cancel_hours'         => (int) HotelSetting::getValue('booking_cancel_hours', 48),
                'services_cancellation_policy' => (string) HotelSetting::getValue('services_cancellation_policy', ''),
                'booking_cancellation_policy'  => (string) (self::stayPolicies()['cancellation_policy'] ?? ''),
                'check_in_time'                => self::stayPolicies()['check_in_time'],
                'check_out_time'               => self::stayPolicies()['check_out_time'],
            ],
```

(c) In `capabilities()` replace the docblock and the `'stays'` line:

```php
    /**
     * `services` and `stays` both need a membership row as well as a
     * bookable venue: the portal's quote, payment-intent and confirm all
     * answer `no_membership` without one, and the portal must not offer a
     * page that cannot work. A membership row exists whenever the venue has
     * an active tier (MemberProvisioner). Neither asks about the industry:
     * booking is gated on what the venue can actually sell.
     */
```

```php
            'stays'    => $hasMember && $this->capability->staysBookableOnline($org->id),
```

The `$industry` parameter of `capabilities()` is now unused; remove it from the signature and from the call in `build()`.

(d) In `PortalServiceBookingController::venueToday()` replace the body with `return PortalBootstrap::venueToday((int) app('current_organization_id'));` and drop the now-unused `use App\Models\Organization;` import if nothing else in the file uses it.

- [ ] **Step 5: The catalogue**

Create `app/Services/Booking/StayCatalogue.php`:

```php
<?php

namespace App\Services\Booking;

use App\Models\BookingExtra;
use App\Models\BookingRoom;
use App\Models\HotelSetting;
use App\Services\Portal\PortalBootstrap;

/**
 * What a venue sells as a stay: its active rooms, the extras it offers
 * with them, its policies and its limits — the public booking widget's
 * `config` without the widget's styling or its payment keys.
 *
 * A room's id is its PMS id when it has one, else its own id, as a string:
 * the key the engine, the availability service and the mirror all use.
 */
final class StayCatalogue
{
    public function build(int $orgId): array
    {
        $rooms = BookingRoom::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get()
            ->map(fn (BookingRoom $r) => [
                'id'                => $r->pms_id ?: (string) $r->id,
                'name'              => $r->name,
                'description'       => $r->description,
                'short_description' => $r->short_description,
                'max_guests'        => (int) $r->max_guests,
                'bedrooms'          => (int) $r->bedrooms,
                'bed_type'          => $r->bed_type,
                'size'              => $r->size,
                'image'             => $r->image,
                'gallery'           => $r->gallery ?? [],
                'amenities'         => $r->amenities ?? [],
                'tags'              => $r->tags ?? [],
                'base_price'        => (float) $r->base_price,
            ])->values()->all();

        $extras = BookingExtra::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get()
            ->map(fn (BookingExtra $e) => [
                'id'              => (string) $e->id,
                'name'            => $e->name,
                'description'     => $e->description,
                'price'           => (float) $e->price,
                'price_type'      => $e->price_type,
                'lead_time_hours' => (int) ($e->lead_time_hours ?? 0),
                'image'           => $e->image,
                'icon'            => $e->icon,
                'category'        => $e->category,
            ])->values()->all();

        return [
            'rooms'    => $rooms,
            'extras'   => $extras,
            'policies' => PortalBootstrap::stayPolicies() + ['cancel_hours' => (int) HotelSetting::getValue('booking_cancel_hours', 48)],
            'rules'    => [
                'currency'   => strtoupper((string) HotelSetting::getValue('booking_currency', 'EUR')),
                'min_nights' => max(1, (int) HotelSetting::getValue('booking_min_nights', 1)),
                'max_nights' => max(1, (int) HotelSetting::getValue('booking_max_nights', 30)),
            ],
        ];
    }
}
```

- [ ] **Step 6: The exception and the first half of the quote service**

Create `app/Services/Booking/StayQuoteException.php`:

```php
<?php

namespace App\Services\Booking;

/** A stay the portal cannot quote or book, with the code and status the portal answers. */
final class StayQuoteException extends \RuntimeException
{
    public function __construct(public readonly string $errorCode, string $message, public readonly int $status)
    {
        parent::__construct($message);
    }
}
```

Create `app/Services/Booking/StayQuoteService.php`:

```php
<?php

namespace App\Services\Booking;

use App\Models\HotelSetting;
use App\Models\LoyaltyMember;
use App\Models\User;
use App\Services\BookingEngineService;
use App\Services\MemberProvisioner;
use App\Services\Portal\PortalBootstrap;
use Carbon\CarbonImmutable;

/**
 * The member's price for a stay. The engine quotes the room and writes the
 * hold, exactly as it does for the public widget; this service then prices
 * the hold for the member and writes the member onto it, so the hold can
 * only be paid for and confirmed by the member it was quoted to.
 */
final class StayQuoteService
{
    public function __construct(
        private readonly BookingEngineService $engine,
        private readonly MemberPricing $pricing,
        private readonly MemberProvisioner $provisioner,
    ) {}

    /** @return array{currency: string, min_nights: int, max_nights: int} */
    public function rules(): array
    {
        return [
            'currency'   => strtoupper((string) HotelSetting::getValue('booking_currency', 'EUR')),
            'min_nights' => max(1, (int) HotelSetting::getValue('booking_min_nights', 1)),
            'max_nights' => max(1, (int) HotelSetting::getValue('booking_max_nights', 30)),
        ];
    }

    /**
     * The number of nights, once the dates fit the venue's limits. The
     * engine's own quote() checks none of these (only the availability
     * search does), so a request built by hand could otherwise hold and
     * pay for a stay the venue does not sell.
     *
     * @throws StayQuoteException
     */
    public function assertStayAllowed(string $checkIn, string $checkOut): int
    {
        $in = CarbonImmutable::parse($checkIn)->startOfDay();
        $out = CarbonImmutable::parse($checkOut)->startOfDay();
        $nights = (int) $in->diffInDays($out);
        $today = PortalBootstrap::venueToday((int) app('current_organization_id'))->toDateString();
        $rules = $this->rules();

        if ($in->toDateString() < $today || $nights < 1) {
            throw new StayQuoteException('invalid_stay', 'Those dates cannot be booked.', 422);
        }
        if ($nights < $rules['min_nights']) {
            throw new StayQuoteException('invalid_stay', "The shortest stay here is {$rules['min_nights']} nights.", 422);
        }
        if ($nights > $rules['max_nights']) {
            throw new StayQuoteException('invalid_stay', "The longest stay you can book online is {$rules['max_nights']} nights.", 422);
        }

        return $nights;
    }

    /** The member whose tier prices a booking, or null where the venue runs no loyalty programme or the member has no tier. */
    public function pricedMember(User $user): ?LoyaltyMember
    {
        if (!PortalBootstrap::loyaltyOn((int) app('current_organization_id'))) {
            return null;
        }
        $member = $this->provisioner->ensureForUser($user);

        return $member && $member->tier_id ? $member : null;
    }
}
```

`$engine` and `$pricing` are used by `quote()` in Task 6.

- [ ] **Step 7: The controller and the routes**

Create `app/Http/Controllers/Api/V1/Member/Portal/PortalStayBookingController.php`:

```php
<?php

namespace App\Http\Controllers\Api\V1\Member\Portal;

use App\Http\Controllers\Controller;
use App\Services\AvailabilityService;
use App\Services\Booking\BookingCapability;
use App\Services\Booking\BookingScope;
use App\Services\Booking\MemberPricing;
use App\Services\Booking\StayCatalogue;
use App\Services\Booking\StayQuoteException;
use App\Services\Booking\StayQuoteService;
use App\Services\MemberProvisioner;
use App\Services\Portal\PortalBootstrap;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The member's own copy of the booking widget's stay sequence: rooms,
 * availability, quote, payment intent, confirm. Every action runs under
 * the member's organisation (tenant middleware), sells single rooms only
 * (plan3-1) and recomputes prices on the server.
 */
class PortalStayBookingController extends Controller
{
    public function __construct(
        private readonly StayCatalogue $catalogue,
        private readonly StayQuoteService $quotes,
        private readonly MemberPricing $pricing,
        private readonly MemberProvisioner $provisioner,
        private readonly BookingCapability $capability,
    ) {}

    public function index(Request $request): JsonResponse
    {
        if ($refusal = $this->notBookable($request)) {
            return $refusal;
        }
        $cat = $this->catalogue->build((int) app('current_organization_id'));
        $currency = $cat['rules']['currency'];

        // The member's automatic benefit on a stay, named once for the whole
        // page: a probe price is enough to learn which benefit applies.
        $automatic = null;
        if ($member = $this->quotes->pricedMember($request->user())) {
            $p = $this->pricing->quote($member, 100.0, $currency, BookingScope::Stays);
            if ($p->applied && $p->applied['source'] === 'tier_benefit') {
                $automatic = ['label' => $p->applied['label'], 'type' => $p->applied['type'], 'value' => $p->applied['value']];
            }
        }

        return response()->json($cat + ['pricing' => ['automatic' => $automatic], 'payment' => PortalBootstrap::paymentMode($currency)]);
    }

    public function availability(Request $request, AvailabilityService $availability): JsonResponse
    {
        if ($refusal = $this->notBookable($request)) {
            return $refusal;
        }
        $today = PortalBootstrap::venueToday((int) app('current_organization_id'))->toDateString();
        $data = $request->validate([
            'check_in'  => 'required|date_format:Y-m-d|after_or_equal:' . $today,
            'check_out' => 'required|date_format:Y-m-d|after:check_in',
            'adults'    => 'nullable|integer|min:1|max:20',
            'children'  => 'nullable|integer|min:0|max:10',
        ]);
        try {
            $nights = $this->quotes->assertStayAllowed($data['check_in'], $data['check_out']);
        } catch (StayQuoteException $e) {
            return $this->refuse($e);
        }

        $found = $availability->check($data['check_in'], $data['check_out'], (int) ($data['adults'] ?? 2), (int) ($data['children'] ?? 0));
        $currency = $this->quotes->rules()['currency'];
        $member = $this->quotes->pricedMember($request->user());

        $rooms = [];
        foreach ($found['available'] ?? [] as $room) {
            $total = (float) $room['total_price'];
            $price = $member
                ? $this->pricing->quote($member, $total, $currency, BookingScope::Stays)
                : $this->pricing->quoteWithoutMember($total, $currency);
            $rooms[] = [
                'id' => (string) $room['id'], 'name' => $room['name'], 'short_description' => $room['short_description'] ?? null,
                'max_guests' => (int) $room['max_guests'], 'bedrooms' => (int) ($room['bedrooms'] ?? 0), 'bed_type' => $room['bed_type'] ?? null,
                'size' => $room['size'] ?? null, 'image' => $room['image'] ?? null, 'gallery' => $room['gallery'] ?? [], 'amenities' => $room['amenities'] ?? [],
                'price_per_night' => (float) $room['price_per_night'], 'total_price' => $total, 'member_total' => $price->total,
                'currency' => $currency, 'min_stay' => (int) ($room['min_stay'] ?? 1),
            ];
        }

        return response()->json([
            'rooms'  => $rooms,
            'nights' => $nights,
            // The engine can offer two or three rooms together; the portal
            // does not sell those (plan3-1) and says so instead.
            'party_too_large' => $rooms === [] && !empty($found['combinations']),
        ]);
    }

    /** Stays need rooms, a PMS to write to, and a membership row — the bootstrap's `capabilities.stays`. */
    private function notBookable(Request $request): ?JsonResponse
    {
        if (!$this->capability->staysBookableOnline((int) app('current_organization_id'))) {
            return response()->json(['error' => 'not_bookable', 'message' => 'This venue does not take online stay bookings.'], 404);
        }
        if (!$this->provisioner->ensureForUser($request->user())) {
            return response()->json(['error' => 'not_bookable', 'message' => 'Online booking needs a membership at this venue.'], 404);
        }

        return null;
    }

    private function refuse(StayQuoteException $e): JsonResponse
    {
        return response()->json(['error' => $e->errorCode, 'message' => $e->getMessage()], $e->status);
    }
}
```

In `routes/api.php`, inside the `member/portal` group after the `services/confirm` route, add:

```php
            Route::get('stays', [\App\Http\Controllers\Api\V1\Member\Portal\PortalStayBookingController::class, 'index']);
            Route::get('stays/availability', [\App\Http\Controllers\Api\V1\Member\Portal\PortalStayBookingController::class, 'availability']);
```

- [ ] **Step 8: Run the tests**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Member/Portal/ --no-ansi`
Expected: all pass, `PortalStayCatalogueTest` with 7 tests.

- [ ] **Step 9: Commit**

```bash
git add app/Services/Booking/StayCatalogue.php app/Services/Booking/StayQuoteException.php app/Services/Booking/StayQuoteService.php app/Services/Booking/BookingCapability.php app/Services/Portal/PortalBootstrap.php app/Http/Controllers/Api/V1/Member/Portal/PortalStayBookingController.php app/Http/Controllers/Api/V1/Member/Portal/PortalServiceBookingController.php routes/api.php tests/Feature/Member/Portal/
git commit -m "Offer rooms and availability in the portal, by what the venue can sell

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: The quote — a hold that belongs to its member

**Files:**
- Modify: `app/Services/BookingEngineService.php` (`calcExtras()` `:2423-2451`), `app/Services/Booking/StayQuoteService.php`, `app/Http/Controllers/Api/V1/Member/Portal/PortalStayBookingController.php`, `routes/api.php`
- Test: `tests/Feature/Member/Portal/PortalStayBookingTest.php` (create)

**Interfaces:**
- Consumes: Task 5's service, exception and fixture; `BookingEngineService::quote(array $data): array` (returns `hold_token`, `expires_at`, `unit_id`, `unit_name`, `check_in`, `check_out`, `nights`, `adults`, `children`, `room_total`, `extras_total`, `gross_total`, `currency`, `price_per_night`; throws `\InvalidArgumentException` for an unknown room or an extra whose lead time cannot be met, `\RuntimeException` when the room is not available); `CouponSelection::fromArray(?array): ?CouponSelection`.
- Produces:
  - `BookingEngineService::extrasLines(array $extras, int $adults): array` — `list<array{id: string, name: string, unit_price: float, quantity: int, line_total: float}>`, the engine's own arithmetic; `calcExtras()` is its sum.
  - `StayQuoteService::quote(\App\Models\User $user, \App\Models\LoyaltyMember $member, array $data): array{hold: \App\Models\BookingHold, engine: array, lines: array, pricing: PricingResult}`
  - `StayQuoteService::ownHold(\App\Models\LoyaltyMember $member, string $token): ?\App\Models\BookingHold`
  - `StayQuoteService::reprice(\App\Models\User $user, array $payload): PricingResult`
  - `StayQuoteService::payload(array $quote): array` — the JSON the quote endpoint answers (shape below)
  - Hold payload keys written by the portal: `member_id`, `user_id`, `list_total`, `discount`, `discount_source`, `discount_source_id`, `discount_label`, `coupon` (`{member_offer_id}` | `{redemption_id}` | null), `channel_name` = `'Member portal'`, and `gross_total` replaced by the member's total.
  - Route `POST member/portal/stays/quote`, answering:

```json
{
  "hold_token": "…48 chars…", "expires_at": "2026-10-09T10:10:00+00:00",
  "room": {"id": "101", "name": "Sea view"},
  "check_in": "2026-10-09", "check_out": "2026-10-11", "nights": 2, "adults": 2, "children": 0,
  "lines": {"room_total": 200, "price_per_night": 100, "extras": [{"id": "3", "name": "Breakfast", "unit_price": 15, "quantity": 2, "line_total": 30}], "extras_total": 30},
  "list_amount": 230, "discount": {"amount": 23, "label": "10% off stays", "source": "tier_benefit"}, "coupon": null, "total_amount": 207, "currency": "EUR",
  "payment": {"mode": "at_venue", "reason": "payments_off"},
  "policy": {"cancellation_policy": "Free until two days before.", "cancel_hours": 48, "check_in_time": "15:00", "check_out_time": "11:00"}
}
```

- [ ] **Step 1: Write the failing tests**

Create `tests/Feature/Member/Portal/PortalStayBookingTest.php`:

```php
<?php

namespace Tests\Feature\Member\Portal;

use App\Models\BookingHold;
use Tests\Concerns\SeedsDiscountFixture;
use Tests\Concerns\SetsUpStayBookingSchema;
use Tests\Feature\Member\MemberEndpointTestCase;

class PortalStayBookingTest extends MemberEndpointTestCase
{
    use SetsUpStayBookingSchema, SeedsDiscountFixture, StayPortalFixture;

    private const QUOTE = '/api/v1/member/portal/stays/quote';

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpStayPortal();
        $this->smoobuRates(200.0);
    }

    protected function body(array $extra = []): array
    {
        return array_merge(['unit_id' => '101', 'check_in' => $this->checkIn, 'check_out' => $this->checkOut, 'adults' => 2, 'children' => 0], $extra);
    }

    protected function quote(array $extra = [])
    {
        return $this->withToken($this->token)->postJson(self::QUOTE, $this->body($extra));
    }

    protected function holdOf(string $token): BookingHold
    {
        return BookingHold::withoutGlobalScopes()->where('hold_token', $token)->sole();
    }

    public function test_quote_itemises_the_member_price_and_writes_the_member_into_the_hold(): void
    {
        $this->tenPercentOnStays();
        app()->instance('current_organization_id', $this->org->id);
        $extra = $this->seedStayExtra($this->org->id);
        app()->forgetInstance('current_organization_id');

        $res = $this->quote(['extras' => [['id' => (string) $extra->id, 'quantity' => 2]]])->assertOk();

        $res->assertJsonPath('room.id', '101')->assertJsonPath('nights', 2)
            ->assertJsonPath('lines.room_total', 200)->assertJsonPath('lines.extras_total', 30)
            ->assertJsonPath('lines.extras.0.name', 'Breakfast')->assertJsonPath('lines.extras.0.quantity', 2)->assertJsonPath('lines.extras.0.line_total', 30)
            ->assertJsonPath('list_amount', 230)->assertJsonPath('discount.amount', 23)->assertJsonPath('discount.source', 'tier_benefit')
            ->assertJsonPath('total_amount', 207)->assertJsonPath('currency', 'EUR')
            ->assertJsonPath('payment.mode', 'at_venue')->assertJsonPath('policy.cancel_hours', 48)->assertJsonPath('policy.check_in_time', '15:00');

        $payload = $this->holdOf($res->json('hold_token'))->payload_json;
        $this->assertSame($this->member->id, (int) $payload['member_id']);
        $this->assertSame($this->user->id, (int) $payload['user_id']);
        $this->assertEquals(230.0, $payload['list_total']);
        $this->assertEquals(23.0, $payload['discount']);
        $this->assertSame('tier_benefit', $payload['discount_source']);
        $this->assertSame('10% off stays', $payload['discount_label']);
        $this->assertEquals(207.0, $payload['gross_total'], 'what the payment charges and Smoobu is told');
        $this->assertEquals(200.0, $payload['room_total'], 'the list price of the room is kept');
        $this->assertSame('Member portal', $payload['channel_name']);
        $this->assertNull($payload['coupon']);
    }

    public function test_the_extras_lines_add_up_to_the_engines_own_total(): void
    {
        app()->instance('current_organization_id', $this->org->id);
        $a = $this->seedStayExtra($this->org->id, ['name' => 'Breakfast', 'price' => 12.35, 'price_type' => 'per_person']);
        $b = $this->seedStayExtra($this->org->id, ['name' => 'Parking', 'price' => 7.10, 'price_type' => 'per_night']);
        app()->forgetInstance('current_organization_id');

        $json = $this->quote(['extras' => [['id' => (string) $a->id, 'quantity' => 3], ['id' => (string) $b->id, 'quantity' => 1]]])->assertOk()->json();

        $this->assertEqualsWithDelta(array_sum(array_column($json['lines']['extras'], 'line_total')), $json['lines']['extras_total'], 0.001);
        $this->assertEqualsWithDelta($json['lines']['room_total'] + $json['lines']['extras_total'], $json['list_amount'], 0.001);
    }

    public function test_a_selected_coupon_beats_the_benefit_or_is_reported_outbid(): void
    {
        $this->tenPercentOnStays();
        $big = $this->claim(50);
        $res = $this->quote(['coupon' => ['member_offer_id' => $big->id]])->assertOk()->assertJsonPath('total_amount', 150)->assertJsonPath('coupon.status', 'applied');
        $this->assertSame(['member_offer_id' => $big->id], $this->holdOf($res->json('hold_token'))->payload_json['coupon']);
        $this->assertSame('offer', $this->holdOf($res->json('hold_token'))->payload_json['discount_source']);

        $small = $this->claim(5);
        $this->quote(['coupon' => ['member_offer_id' => $small->id]])->assertOk()->assertJsonPath('total_amount', 180)->assertJsonPath('coupon.status', 'outbid');
    }

    public function test_a_coupon_for_services_only_is_reported_and_not_applied(): void
    {
        $spa = $this->claim(50, 'fixed_amount', 'services');
        $this->quote(['coupon' => ['member_offer_id' => $spa->id]])->assertOk()->assertJsonPath('total_amount', 200)->assertJsonPath('coupon.status', 'wrong_scope');
    }

    public function test_a_bad_coupon_an_unknown_room_and_a_taken_room_answer_their_codes(): void
    {
        $this->quote(['coupon' => ['member_offer_id' => 424242]])->assertStatus(422)->assertJsonPath('error', 'coupon_not_found');
        $this->quote(['unit_id' => '999'])->assertStatus(404)->assertJsonPath('error', 'not_found');

        \App\Models\BookingMirror::withoutGlobalScopes()->create([
            'organization_id' => $this->org->id, 'reservation_id' => 'R-1', 'booking_state' => 'confirmed', 'internal_status' => 'confirmed',
            'apartment_id' => '101', 'arrival_date' => $this->checkIn, 'departure_date' => $this->checkOut, 'price_total' => 200,
        ]);
        $this->quote()->assertStatus(409)->assertJsonPath('error', 'room_unavailable');
    }

    public function test_more_guests_than_the_room_holds_and_a_stay_too_short_are_refused(): void
    {
        $this->quote(['adults' => 2, 'children' => 1])->assertStatus(422)->assertJsonPath('error', 'invalid_stay');
        $this->setting('booking_min_nights', '3');
        $this->quote()->assertStatus(422)->assertJsonPath('error', 'invalid_stay');
        $this->assertSame(0, BookingHold::withoutGlobalScopes()->count(), 'a refused stay holds nothing');
    }

    public function test_an_extra_that_needs_more_notice_is_refused(): void
    {
        app()->instance('current_organization_id', $this->org->id);
        $slow = $this->seedStayExtra($this->org->id, ['name' => 'Wedding cake', 'lead_time_hours' => 24 * 30]);
        app()->forgetInstance('current_organization_id');

        $this->quote(['extras' => [['id' => (string) $slow->id, 'quantity' => 1]]])->assertStatus(422)->assertJsonPath('error', 'extra_lead_time');
    }

    public function test_quote_needs_a_membership_row(): void
    {
        \App\Models\LoyaltyMember::withoutGlobalScopes()->whereKey($this->member->id)->delete();
        \App\Models\LoyaltyTier::withoutGlobalScopes()->where('organization_id', $this->org->id)->update(['is_active' => false]);

        $this->quote()->assertStatus(422)->assertJsonPath('error', 'no_membership');
    }

    public function test_a_currency_mismatch_and_mock_mode_quote_pay_at_venue(): void
    {
        $this->stripe(true, 'gbp');
        $this->quote()->assertOk()->assertJsonPath('payment.mode', 'at_venue')->assertJsonPath('payment.reason', 'currency_mismatch');

        $this->stripe(true, 'eur');
        $this->flushHeaders();
        $this->quote()->assertOk()->assertJsonPath('payment.mode', 'online');

        $this->setting('booking_mock_mode', 'true');
        $this->flushHeaders();
        $this->quote()->assertOk()->assertJsonPath('payment.mode', 'at_venue')->assertJsonPath('payment.reason', 'mock_mode');
    }
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Member/Portal/PortalStayBookingTest.php --no-ansi`
Expected: FAIL — 404/405 on `member/portal/stays/quote`.

- [ ] **Step 3: The engine names its extras lines**

In `app/Services/BookingEngineService.php` replace `calcExtras()` (lines 2423-2451) with:

```php
    /**
     * The selected extras as priced lines — the one arithmetic every total
     * is built from. `line_total` is left unrounded, exactly as calcExtras()
     * has always summed it, so the total below is bit-for-bit what it was.
     *
     * @return list<array{id: string, name: string, unit_price: float, quantity: int, line_total: float}>
     */
    public function extrasLines(array $extras, int $adults): array
    {
        // Single source of truth — loadExtrasConfig() prefers the
        // booking_extras DB table (what the widget shows) over the legacy
        // JSON setting.
        $allExtras = collect($this->loadExtrasConfig());
        $lines     = [];

        foreach ($extras as $item) {
            $extraId = (string) ($item['id'] ?? '');
            $qty     = $item['quantity'] ?? 1;
            // Compare as string so a numeric DB id matches the widget's
            // stringified id payload regardless of which side cast it.
            $def     = $allExtras->first(fn ($e) => (string) ($e['id'] ?? '') === $extraId);
            if (!$def) continue;

            $price = (float) ($def['price'] ?? 0);
            $type  = $def['price_type'] ?? $def['type'] ?? 'per_stay';
            $unit  = $type === 'per_guest' ? $price * $adults : $price;

            $lines[] = [
                'id'         => $extraId,
                'name'       => (string) ($def['name'] ?? 'Extra'),
                'unit_price' => $unit,
                'quantity'   => (int) $qty,
                'line_total' => $unit * $qty,
            ];
        }

        return $lines;
    }

    private function calcExtras(array $extras, int $adults): float
    {
        $total = 0.0;
        foreach ($this->extrasLines($extras, $adults) as $line) {
            $total += $line['line_total'];
        }

        return $total;
    }
```

`$price * $adults * $qty` and `($price * $adults) * $qty` are the same floating-point operations in the same order, so `calcExtras()` returns what it returned before. Run `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Booking/BookingEngineConfirmTest.php --no-ansi` — still green.

- [ ] **Step 4: `StayQuoteService` — quote, ownHold, reprice, payload**

Add to `app/Services/Booking/StayQuoteService.php` (imports: `use App\Models\BookingHold;`, `use App\Models\BookingRoom;`):

```php
    /**
     * @param array{unit_id: string, check_in: string, check_out: string, adults?: int, children?: int, extras?: array, coupon?: ?array} $data
     * @return array{hold: BookingHold, engine: array, lines: array, pricing: PricingResult}
     *
     * @throws StayQuoteException  the stay cannot be sold as asked
     * @throws CouponException     the chosen coupon does not resolve
     */
    public function quote(User $user, LoyaltyMember $member, array $data): array
    {
        $orgId = (int) app('current_organization_id');
        $adults = (int) ($data['adults'] ?? 2);
        $children = (int) ($data['children'] ?? 0);
        $this->assertStayAllowed($data['check_in'], $data['check_out']);

        $room = BookingRoom::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('is_active', true)
            ->where(fn ($q) => $q->where('pms_id', (string) $data['unit_id'])->orWhere('id', (int) $data['unit_id']))
            ->first();
        if (!$room) {
            throw new StayQuoteException('not_found', 'We could not find that room.', 404);
        }
        if ($adults + $children > (int) $room->max_guests) {
            throw new StayQuoteException('invalid_stay', "{$room->name} sleeps up to {$room->max_guests}.", 422);
        }

        // The coupon is resolved BEFORE the engine writes a hold: a refused
        // coupon must not leave a hold behind.
        $priced = $this->pricedMember($user);
        $selection = CouponSelection::fromArray($data['coupon'] ?? null);
        if ($selection && !$priced) {
            throw new CouponException('coupon_not_found', 'Coupons need an active membership.');
        }

        $extras = array_map(fn (array $x) => ['id' => (string) $x['id'], 'quantity' => (int) ($x['quantity'] ?? 1)], $data['extras'] ?? []);
        try {
            $engine = $this->engine->quote([
                'unit_id' => $room->pms_id ?: (string) $room->id,
                'check_in' => $data['check_in'], 'check_out' => $data['check_out'],
                'adults' => $adults, 'children' => $children, 'extras' => $extras,
            ]);
        } catch (\InvalidArgumentException $e) {
            throw str_contains($e->getMessage(), 'Unknown unit')
                ? new StayQuoteException('not_found', 'We could not find that room.', 404)
                : new StayQuoteException('extra_lead_time', $e->getMessage(), 422);
        } catch (StayQuoteException $e) {
            throw $e;
        } catch (\RuntimeException) {
            throw new StayQuoteException('room_unavailable', 'That room is not available for these dates.', 409);
        }

        $hold = BookingHold::withoutGlobalScopes()->where('organization_id', $orgId)->where('hold_token', $engine['hold_token'])->firstOrFail();
        try {
            $pricing = $this->price($priced, (float) $engine['gross_total'], $selection);
        } catch (\Throwable $e) {
            // The engine has already written its hold; a quote that ends in
            // a refusal leaves none behind.
            $hold->delete();
            throw $e;
        }

        $payload = $hold->payload_json;
        $hold->payload_json = array_merge($payload, [
            'member_id'          => (int) $member->id,
            'user_id'            => (int) $user->id,
            'list_total'         => $pricing->list,
            'discount'           => $pricing->discount,
            'discount_source'    => $pricing->applied['source'] ?? null,
            'discount_source_id' => $pricing->applied['source_id'] ?? null,
            'discount_label'     => isset($pricing->applied['label']) ? mb_substr((string) $pricing->applied['label'], 0, 120) : null,
            'coupon'             => $data['coupon'] ?? null,
            'gross_total'        => $pricing->total,
            'channel_name'       => 'Member portal',
        ]);
        $hold->save();

        return ['hold' => $hold, 'engine' => $engine, 'lines' => $this->engine->extrasLines($extras, $adults), 'pricing' => $pricing];
    }

    /** The hold with this token when this member quoted it; null for anyone else's, the widget's, or none. */
    public function ownHold(LoyaltyMember $member, string $token): ?BookingHold
    {
        $hold = BookingHold::withoutGlobalScopes()
            ->where('organization_id', (int) $member->organization_id)
            ->where('hold_token', $token)
            ->first();

        return $hold && (int) ($hold->payload_json['member_id'] ?? 0) === (int) $member->id ? $hold : null;
    }

    /**
     * The member's price for a hold, computed again from the hold's own
     * list total and coupon: the payment intent and the confirm both charge
     * what this says today, not what the quote said then.
     *
     * @throws CouponException
     */
    public function reprice(User $user, array $payload): PricingResult
    {
        $list = (float) ($payload['list_total'] ?? $payload['gross_total'] ?? 0);

        return $this->price($this->pricedMember($user), $list, CouponSelection::fromArray($payload['coupon'] ?? null));
    }

    /** @param array{hold: BookingHold, engine: array, lines: array, pricing: PricingResult} $quote */
    public function payload(array $quote): array
    {
        $e = $quote['engine'];
        $policies = PortalBootstrap::stayPolicies();

        return [
            'hold_token' => $quote['hold']->hold_token,
            'expires_at' => $quote['hold']->expires_at?->toIso8601String(),
            'room'       => ['id' => (string) $e['unit_id'], 'name' => $e['unit_name']],
            'check_in'   => $e['check_in'], 'check_out' => $e['check_out'], 'nights' => (int) $e['nights'],
            'adults'     => (int) $e['adults'], 'children' => (int) $e['children'],
            'lines'      => [
                'room_total'      => round((float) $e['room_total'], 2),
                'price_per_night' => round((float) $e['price_per_night'], 2),
                'extras'          => array_map(fn (array $l) => ['id' => $l['id'], 'name' => $l['name'], 'unit_price' => round($l['unit_price'], 2), 'quantity' => $l['quantity'], 'line_total' => round($l['line_total'], 2)], $quote['lines']),
                'extras_total'    => round((float) $e['extras_total'], 2),
            ],
        ] + $quote['pricing']->toArray() + [
            'payment' => PortalBootstrap::paymentMode($quote['pricing']->currency),
            'policy'  => [
                'cancellation_policy' => $policies['cancellation_policy'],
                'cancel_hours'        => (int) HotelSetting::getValue('booking_cancel_hours', 48),
                'check_in_time'       => $policies['check_in_time'],
                'check_out_time'      => $policies['check_out_time'],
            ],
        ];
    }

    private function price(?LoyaltyMember $priced, float $list, ?CouponSelection $selection): PricingResult
    {
        $currency = $this->rules()['currency'];

        return $priced
            ? $this->pricing->quote($priced, $list, $currency, BookingScope::Stays, $selection)
            : $this->pricing->quoteWithoutMember($list, $currency);
    }
```

- [ ] **Step 5: The endpoint**

Add to `PortalStayBookingController` (imports: `use App\Services\Booking\CouponException;`):

```php
    /** Shared by quote() and nothing else: the payment intent and the confirm name a hold, never a room. */
    private const QUOTE_RULES = [
        'unit_id' => 'required|string|max:20', 'check_in' => 'required|date_format:Y-m-d', 'check_out' => 'required|date_format:Y-m-d|after:check_in',
        'adults' => 'nullable|integer|min:1|max:20', 'children' => 'nullable|integer|min:0|max:10',
        'extras' => 'nullable|array|max:20', 'extras.*.id' => 'required_with:extras', 'extras.*.quantity' => 'nullable|integer|min:1|max:10',
        'coupon' => 'nullable|array', 'coupon.member_offer_id' => 'nullable|integer', 'coupon.redemption_id' => 'nullable|integer',
    ];

    /**
     * The member's itemised price for a stay, and a hold on it that only
     * this member can pay for and confirm. Every quote writes a new hold; a
     * hold reserves nothing (availability counts bookings, not holds) and
     * lapses on its own.
     */
    public function quote(Request $request): JsonResponse
    {
        if ($refusal = $this->notBookableFor($request)) {
            return $refusal;
        }
        $data = $request->validate(self::QUOTE_RULES);
        $member = $this->provisioner->ensureForUser($request->user());

        try {
            return response()->json($this->quotes->payload($this->quotes->quote($request->user(), $member, $data)));
        } catch (StayQuoteException $e) {
            return $this->refuse($e);
        } catch (CouponException $e) {
            return response()->json(['error' => $e->errorCode, 'message' => $e->sentence()], 422);
        }
    }

    /** As notBookable(), but a missing membership is the write paths' own code. */
    private function notBookableFor(Request $request): ?JsonResponse
    {
        if (!$this->capability->staysBookableOnline((int) app('current_organization_id'))) {
            return response()->json(['error' => 'not_bookable', 'message' => 'This venue does not take online stay bookings.'], 404);
        }
        if (!$this->provisioner->ensureForUser($request->user())) {
            return response()->json(['error' => 'no_membership', 'message' => 'Your membership is not set up yet.'], 422);
        }

        return null;
    }
```

Route, after `stays/availability`:

```php
            Route::post('stays/quote', [\App\Http\Controllers\Api\V1\Member\Portal\PortalStayBookingController::class, 'quote']);
```

- [ ] **Step 6: Run the tests**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Member/Portal/PortalStayBookingTest.php --no-ansi`
Expected: `Tests:    9 passed`.

- [ ] **Step 7: Commit**

```bash
git add app/Services/BookingEngineService.php app/Services/Booking/StayQuoteService.php app/Http/Controllers/Api/V1/Member/Portal/PortalStayBookingController.php routes/api.php tests/Feature/Member/Portal/PortalStayBookingTest.php
git commit -m "Quote a stay at the member's price on a hold that names its member

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Payment intent — bound to the hold, the member and the amount

**Files:**
- Modify: `app/Services/Booking/PortalPaymentIntentGuard.php`, `app/Http/Controllers/Api/V1/Member/Portal/PortalStayBookingController.php`, `routes/api.php`
- Test: `tests/Unit/Booking/PortalPaymentIntentGuardTest.php` (add), `tests/Feature/Member/Portal/PortalStayBookingTest.php` (add)

**Interfaces:**
- Consumes: `StayQuoteService::ownHold()`, `::reprice()` (Task 6); `StripeService::createPaymentIntent(float $amount, string $description, array $metadata = [], array $options = []): array{client_secret: string, payment_intent_id: string}`.
- Produces:
  - `PortalPaymentIntentGuard::verifyStay(string $piId, int $orgId, int $memberId, string $holdToken, float $total): mixed` — throws `PaymentMismatch`; cancels an owned, uncarried, mismatched intent before throwing, exactly as `verify()` does.
  - `PortalPaymentIntentGuard::carried()` (private) is true when a `ServiceBooking` OR a `BookingMirror` of the organisation carries the intent; `assertUnused()` and `release()` therefore cover stays.
  - Route `POST member/portal/stays/payment-intent` `{hold_token}` → `{client_secret, payment_intent_id, amount, currency}`; errors `hold_not_found` 404, `hold_expired` 409, `price_changed` 409, `pay_at_venue` 409, `nothing_to_pay` 409, `payment_unavailable` 503.
  - PaymentIntent metadata: `kind = 'portal_stay_booking'`, `org_id`, `member_id`, `portal_hold_token`, `total`.

- [ ] **Step 1: Write the failing guard tests**

Read `tests/Unit/Booking/PortalPaymentIntentGuardTest.php` first and reuse its own helpers for the Stripe mock and the intent double (it builds `Stripe\PaymentIntent::constructFrom([...])`); add:

```php
    private function stayIntent(array $top = [], array $meta = []): \Stripe\PaymentIntent
    {
        return \Stripe\PaymentIntent::constructFrom(array_merge(['id' => 'pi_stay', 'status' => 'requires_capture', 'amount' => 18000, 'currency' => 'eur'], $top, [
            'metadata' => array_merge(['kind' => 'portal_stay_booking', 'org_id' => '7', 'member_id' => '41', 'portal_hold_token' => 'HOLD-A'], $meta),
        ]));
    }

    public function test_a_stay_intent_is_accepted_only_for_its_own_hold_member_org_and_amount(): void
    {
        $stripe = $this->stripeReturning($this->stayIntent());
        $stripe->shouldNotReceive('cancelPaymentIntent');
        $guard = new PortalPaymentIntentGuard($stripe);

        $this->assertSame('pi_stay', $guard->verifyStay('pi_stay', 7, 41, 'HOLD-A', 180.0)->id);
    }

    public function test_a_stay_intent_for_another_hold_or_amount_is_cancelled_and_refused(): void
    {
        foreach ([['HOLD-B', 180.0], ['HOLD-A', 200.0]] as [$hold, $total]) {
            $stripe = $this->stripeReturning($this->stayIntent());
            $stripe->shouldReceive('cancelPaymentIntent')->once()->with('pi_stay', 'abandoned');
            try {
                (new PortalPaymentIntentGuard($stripe))->verifyStay('pi_stay', 7, 41, $hold, $total);
                $this->fail('a mismatch must throw');
            } catch (PaymentMismatch) {
                $this->addToAssertionCount(1);
            }
        }
    }

    public function test_a_strangers_stay_intent_is_refused_and_left_alone(): void
    {
        foreach ([[8, 41], [7, 42]] as [$org, $member]) {
            $stripe = $this->stripeReturning($this->stayIntent());
            $stripe->shouldNotReceive('cancelPaymentIntent');
            try {
                (new PortalPaymentIntentGuard($stripe))->verifyStay('pi_stay', $org, $member, 'HOLD-A', 180.0);
                $this->fail('a stranger\'s intent must throw');
            } catch (PaymentMismatch) {
                $this->addToAssertionCount(1);
            }
        }
    }

    public function test_a_service_intent_cannot_pay_for_a_stay(): void
    {
        $stripe = $this->stripeReturning($this->stayIntent([], ['kind' => 'portal_service_booking', 'portal_hold_token' => null, 'service_id' => '3']));
        $stripe->shouldReceive('cancelPaymentIntent')->once();
        $this->expectException(PaymentMismatch::class);
        (new PortalPaymentIntentGuard($stripe))->verifyStay('pi_stay', 7, 41, 'HOLD-A', 180.0);
    }

    public function test_an_intent_a_stay_carries_is_never_released_and_cannot_be_spent_again(): void
    {
        \Illuminate\Support\Facades\DB::table('booking_mirror')->insert(['organization_id' => 7, 'reservation_id' => 'R-9', 'stripe_payment_intent_id' => 'pi_stay', 'price_total' => 180, 'created_at' => now(), 'updated_at' => now()]);
        $stripe = \Mockery::mock(\App\Services\StripeService::class);
        $stripe->shouldNotReceive('retrievePaymentIntent');
        $stripe->shouldNotReceive('cancelPaymentIntent');
        $guard = new PortalPaymentIntentGuard($stripe);

        $guard->release('pi_stay', 7, 41);
        $this->expectException(\App\Services\Booking\PaymentAlreadyUsed::class);
        $guard->assertUnused('pi_stay', 7);
    }
```

`stripeReturning()` stands for whatever helper the file already has that returns a `StripeService` mock whose `retrievePaymentIntent()` answers the given intent and whose `toSmallestUnit()` and `currency()` work; if it has none, add one:

```php
    private function stripeReturning(\Stripe\PaymentIntent $pi): \Mockery\MockInterface
    {
        $stripe = \Mockery::mock(\App\Services\StripeService::class);
        $stripe->shouldReceive('retrievePaymentIntent')->andReturn($pi);
        $stripe->shouldReceive('currency')->andReturn('eur');
        $stripe->shouldReceive('toSmallestUnit')->passthru();
        return $stripe;
    }
```

The last test needs a `booking_mirror` table: make sure the file's `setUp()` calls `setUpBookingRefundSchema()` (add `use Tests\Concerns\SetsUpMinimalSchema;` and the call if it builds `service_bookings` another way).

- [ ] **Step 2: Write the failing endpoint tests**

Add to `tests/Feature/Member/Portal/PortalStayBookingTest.php` (imports: `use Stripe\PaymentIntent;`):

```php
    private const INTENT = '/api/v1/member/portal/stays/payment-intent';

    protected function intent(string $holdToken, ?string $token = null)
    {
        return $this->withToken($token ?? $this->token)->postJson(self::INTENT, ['hold_token' => $holdToken]);
    }

    public function test_payment_intent_charges_the_discounted_total_with_the_members_metadata_and_extends_the_hold(): void
    {
        $this->tenPercentOnStays();
        $stripe = $this->stripe();
        $hold = $this->quote()->assertOk()->json('hold_token');
        $this->travel(8)->minutes();

        $stripe->shouldReceive('createPaymentIntent')->once()->withArgs(function (float $amount, string $desc, array $meta, array $options) use ($hold) {
            return $amount === 180.0
                && $meta['kind'] === 'portal_stay_booking' && $meta['org_id'] === $this->org->id && $meta['member_id'] === $this->member->id
                && $meta['portal_hold_token'] === $hold && !array_key_exists('hold_token', $meta)
                && $options === ['allow_redirects' => 'never'];
        })->andReturn(['client_secret' => 'pi_1_secret', 'payment_intent_id' => 'pi_1']);

        $this->flushHeaders();
        $this->intent($hold)->assertOk()->assertJsonPath('payment_intent_id', 'pi_1')->assertJsonPath('amount', 180)->assertJsonPath('currency', 'EUR');
        $this->assertTrue($this->holdOf($hold)->expires_at->greaterThan(now()->addMinutes(14)), 'paying takes time; the hold gets fifteen more minutes');
    }

    /** Review Focus 2. */
    public function test_another_members_hold_answers_404(): void
    {
        $stripe = $this->stripe();
        $stripe->shouldNotReceive('createPaymentIntent');
        $hold = $this->quote()->assertOk()->json('hold_token');
        ['token' => $stranger] = $this->member($this->org);

        $this->flushHeaders();
        $this->intent($hold, $stranger)->assertStatus(404)->assertJsonPath('error', 'hold_not_found');
        $this->flushHeaders();
        $this->intent('no-such-hold')->assertStatus(404)->assertJsonPath('error', 'hold_not_found');
    }

    public function test_a_widget_hold_cannot_be_paid_through_the_portal(): void
    {
        $this->stripe()->shouldNotReceive('createPaymentIntent');
        app()->instance('current_organization_id', $this->org->id);
        $widget = \App\Models\BookingHold::create(['hold_token' => str_repeat('w', 48), 'status' => 'active', 'expires_at' => now()->addMinutes(10), 'payload_json' => ['unit_id' => '101', 'gross_total' => 200.0]]);
        app()->forgetInstance('current_organization_id');

        $this->intent($widget->hold_token)->assertStatus(404)->assertJsonPath('error', 'hold_not_found');
    }

    public function test_an_expired_hold_a_changed_price_and_a_free_stay_answer_their_codes(): void
    {
        $this->stripe()->shouldNotReceive('createPaymentIntent');
        $claim = $this->claim(50);
        $hold = $this->quote(['coupon' => ['member_offer_id' => $claim->id]])->assertOk()->json('hold_token');

        // The coupon was used elsewhere since the quote: the hold's price no longer holds.
        $claim->forceFill(['used_at' => now(), 'status' => 'used'])->save();
        $this->flushHeaders();
        $this->intent($hold)->assertStatus(422)->assertJsonPath('error', 'coupon_used');

        $fresh = $this->quote()->assertOk()->json('hold_token');
        $this->tenPercentOnStays(); // a benefit the quote did not have
        $this->flushHeaders();
        $this->intent($fresh)->assertStatus(409)->assertJsonPath('error', 'price_changed');

        $late = $this->quote()->assertOk()->json('hold_token');
        $this->travel(11)->minutes();
        $this->flushHeaders();
        $this->intent($late)->assertStatus(409)->assertJsonPath('error', 'hold_expired');
    }

    public function test_pay_at_venue_and_nothing_to_pay_and_a_stripe_failure(): void
    {
        $hold = $this->quote()->assertOk()->json('hold_token');
        $this->flushHeaders();
        $this->intent($hold)->assertStatus(409)->assertJsonPath('error', 'pay_at_venue');

        $stripe = $this->stripe();
        $free = $this->quote(['coupon' => ['member_offer_id' => $this->claim(500)->id]])->assertOk()->assertJsonPath('total_amount', 0)->json('hold_token');
        $this->flushHeaders();
        $this->intent($free)->assertStatus(409)->assertJsonPath('error', 'nothing_to_pay');

        $stripe->shouldReceive('createPaymentIntent')->andThrow(new \RuntimeException('stripe down'));
        $again = $this->quote()->assertOk()->json('hold_token');
        $this->flushHeaders();
        $this->intent($again)->assertStatus(503)->assertJsonPath('error', 'payment_unavailable');
    }
```

- [ ] **Step 3: Run them to see them fail**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Unit/Booking/PortalPaymentIntentGuardTest.php tests/Feature/Member/Portal/PortalStayBookingTest.php --no-ansi`
Expected: FAIL — `Call to undefined method …::verifyStay()`; no `payment-intent` route.

- [ ] **Step 4: The guard**

In `app/Services/Booking/PortalPaymentIntentGuard.php` (import `use App\Models\BookingMirror;`):

(a) Update the class docblock's first sentence to: "Binds a Stripe PaymentIntent to exactly one confirm(). The portal writes org_id and member_id into every intent's metadata, plus service_id and start_at for an appointment or portal_hold_token for a stay; this is the one place that checks them (plus status and amount) before a confirm is allowed to spend the intent, …" (the rest unchanged).

(b) Replace `verify()` with a version that shares its body with the new `verifyStay()`:

```php
    /**
     * Retrieve the intent and return it only when every one of status, org,
     * member, service, slot and amount matches. Before throwing on a
     * mismatch, cancels the intent — but ONLY when its own metadata names
     * this organisation AND this member; another member's or
     * organisation's intent is refused and left untouched (a member must
     * never be able to cancel a stranger's payment by guessing its id). A
     * retrieval failure (Stripe error, unknown id) throws without a cancel
     * attempt — there is nothing known about the intent to cancel.
     *
     * @throws PaymentMismatch
     */
    public function verify(string $piId, int $orgId, int $memberId, int $serviceId, \DateTimeInterface $startAt, float $total): mixed
    {
        return $this->check($piId, $orgId, $memberId, $total, fn (array $meta) => (int) ($meta['service_id'] ?? 0) === $serviceId
            && $this->sameInstant($meta['start_at'] ?? null, $startAt));
    }

    /**
     * The same checks for a stay: the intent must have been created for
     * this very hold. An intent made for an appointment, or for another
     * hold of the same member, is a mismatch.
     *
     * @throws PaymentMismatch
     */
    public function verifyStay(string $piId, int $orgId, int $memberId, string $holdToken, float $total): mixed
    {
        return $this->check($piId, $orgId, $memberId, $total, fn (array $meta) => ($meta['kind'] ?? null) === 'portal_stay_booking'
            && $holdToken !== '' && hash_equals($holdToken, (string) ($meta['portal_hold_token'] ?? '')));
    }

    /** @param callable(array): bool $isForThisBooking */
    private function check(string $piId, int $orgId, int $memberId, float $total, callable $isForThisBooking): mixed
    {
        try {
            $pi = $this->stripe->retrievePaymentIntent($piId);
        } catch (\Throwable) {
            throw new PaymentMismatch();
        }

        $meta = $this->metadata($pi);
        $owned = (int) ($meta['org_id'] ?? 0) === $orgId && (int) ($meta['member_id'] ?? 0) === $memberId;

        $ok = $owned
            && in_array($this->status($pi), ['succeeded', 'requires_capture'], true)
            && $isForThisBooking($meta)
            && $this->amountMatches($pi, $total);

        if ($ok) {
            return $pi;
        }

        // $pi is already in hand here — cancel through the same object
        // rather than release()'s own (necessarily fresh) retrieval. But
        // never cancel an intent a real booking already relies on — a
        // member could otherwise void the payment for a booking they
        // already hold by resubmitting its intent id for a different slot.
        if ($owned && !$this->carried($piId, $orgId)) {
            $this->cancel($piId, 'abandoned');
        }
        throw new PaymentMismatch();
    }
```

(c) Replace `carried()`:

```php
    /** True when a booking of this organisation — an appointment or a stay — already carries this PaymentIntent: the one condition under which it must never be cancelled. */
    private function carried(string $piId, int $orgId): bool
    {
        return ServiceBooking::withoutGlobalScopes()
                ->where('organization_id', $orgId)
                ->where('stripe_payment_intent_id', $piId)
                ->exists()
            || BookingMirror::withoutGlobalScopes()
                ->where('organization_id', $orgId)
                ->where('stripe_payment_intent_id', $piId)
                ->exists();
    }
```

- [ ] **Step 5: The endpoint**

Add to `PortalStayBookingController` (imports: `use App\Models\BookingHold;`, `use App\Models\LoyaltyMember;`, `use App\Services\Booking\PricingResult;`, `use App\Services\StripeService;`, `use Illuminate\Support\Facades\Log;`):

```php
    /**
     * A Stripe PaymentIntent for what the hold costs this member today,
     * carrying the organisation, the member and the hold in its metadata so
     * confirm() can check all three before trusting it.
     */
    public function paymentIntent(Request $request, StripeService $stripe): JsonResponse
    {
        if ($refusal = $this->notBookableFor($request)) {
            return $refusal;
        }
        $data = $request->validate(['hold_token' => 'required|string|max:64']);
        $member = $this->provisioner->ensureForUser($request->user());

        $ready = $this->readyHold($request, $member, $data['hold_token']);
        if ($ready instanceof JsonResponse) {
            return $ready;
        }
        [$hold, $pricing] = $ready;

        if (PortalBootstrap::paymentMode($pricing->currency)['mode'] !== 'online') {
            return response()->json(['error' => 'pay_at_venue', 'message' => 'This venue takes payment at the venue.'], 409);
        }
        if ($pricing->total <= 0) {
            return response()->json(['error' => 'nothing_to_pay', 'message' => 'There is nothing to pay online for this booking.'], 409);
        }

        $p = $hold->payload_json;
        try {
            $pi = $stripe->createPaymentIntent($pricing->total, "Stay: {$p['unit_name']} ({$p['check_in']} — {$p['check_out']})", [
                'kind'              => 'portal_stay_booking',
                'org_id'            => (int) app('current_organization_id'),
                'member_id'         => (int) $member->id,
                // Not `hold_token`: that key belongs to the public widget's
                // intents (StripeService derives an idempotency key from it and
                // the webhook's orphan recovery writes a "Website" booking).
                'portal_hold_token' => $hold->hold_token,
                'total'             => number_format($pricing->total, 2, '.', ''),
            ], ['allow_redirects' => 'never']);
        } catch (\Throwable $e) {
            Log::warning('portal.stay_payment_intent_failed', ['org' => app('current_organization_id'), 'error' => $e->getMessage()]);
            return response()->json(['error' => 'payment_unavailable', 'message' => 'Online payment is unavailable right now. Please try again in a moment.'], 503);
        }

        // Entering a card takes longer than a quote lasts.
        $hold->forceFill(['expires_at' => now()->addMinutes(15)])->save();

        return response()->json([
            'client_secret'     => $pi['client_secret'],
            'payment_intent_id' => $pi['payment_intent_id'],
            'amount'            => $pricing->total,
            'currency'          => $pricing->currency,
        ]);
    }

    /**
     * This member's hold, still active, at a price that still stands — or
     * the answer that says why not. Used by paymentIntent() and confirm().
     *
     * @return array{0: BookingHold, 1: PricingResult}|JsonResponse
     */
    private function readyHold(Request $request, LoyaltyMember $member, string $token): array|JsonResponse
    {
        $hold = $this->quotes->ownHold($member, $token);
        if (!$hold) {
            return response()->json(['error' => 'hold_not_found', 'message' => 'We could not find that booking. Please start again.'], 404);
        }
        if (!$hold->isActive()) {
            return response()->json(['error' => 'hold_expired', 'message' => 'This took a little too long. Please check the price again.'], 409);
        }
        try {
            $pricing = $this->quotes->reprice($request->user(), $hold->payload_json);
        } catch (CouponException $e) {
            return response()->json(['error' => $e->errorCode, 'message' => $e->sentence()], 422);
        }
        if (abs($pricing->total - (float) $hold->payload_json['gross_total']) > 0.004) {
            return response()->json(['error' => 'price_changed', 'message' => 'The price has changed. Please check it again.'], 409);
        }

        return [$hold, $pricing];
    }
```

Route, after `stays/quote`:

```php
            Route::post('stays/payment-intent', [\App\Http\Controllers\Api\V1\Member\Portal\PortalStayBookingController::class, 'paymentIntent'])
                ->middleware('throttle:30,1');
```

- [ ] **Step 6: Run the tests**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Unit/Booking/PortalPaymentIntentGuardTest.php tests/Feature/Member/Portal/PortalStayBookingTest.php tests/Feature/Member/Portal/PortalServiceBookingTest.php --no-ansi`
Expected: all pass (`PortalStayBookingTest` at 14; the service booking test unchanged — `verify()` behaves as before).

- [ ] **Step 7: Commit**

```bash
git add app/Services/Booking/PortalPaymentIntentGuard.php app/Http/Controllers/Api/V1/Member/Portal/PortalStayBookingController.php routes/api.php tests/Unit/Booking/PortalPaymentIntentGuardTest.php tests/Feature/Member/Portal/PortalStayBookingTest.php
git commit -m "Take a stay's payment for its own hold, member and amount only

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Confirm — the engine writes the stay, the portal guards the money and the coupon

**Files:**
- Create: `app/Services/Booking/PortalStayHooks.php`, `app/Services/Booking/PortalStayNotifier.php`
- Modify: `app/Services/Booking/CouponResolver.php` (add `rereference()`), `app/Services/Portal/MemberBookingQuery.php` (`stayDto()` `:167-199`: discount and notes), `app/Http/Controllers/Api/V1/Member/Portal/PortalStayBookingController.php`, `routes/api.php`
- Test: `tests/Feature/Member/Portal/PortalStayBookingTest.php` (add)

**Interfaces:**
- Consumes: `BookingEngineService::confirm(array $data, ?string $idempotencyKey, ?string $requestId, ?string $ip, ?StayConfirmHooks $hooks): array` and `StayConfirmHooks` (Task 3); `PortalPaymentIntentGuard::verifyStay()`, `::assertUnused()`, `::release()` (Task 7); `StayQuoteService::ownHold()`, `::reprice()`; `MemberPricing::consume(PricingResult $p, string $reference): void`; `GuestMemberLinkService::ensureGuestForMember(LoyaltyMember): Guest`; `AdvisoryLock::within(string)`; `MemberBookingQuery::stayDto(BookingMirror): array`.
- Produces:
  - `CouponResolver::rereference(array $candidate, string $from, string $to): void` — moves a consumed coupon's reference from a provisional value to the booking's own.
  - `PortalStayHooks` implementing `StayConfirmHooks`; constructor `(PortalPaymentIntentGuard $guard, MemberPricing $pricing, CouponResolver $coupons, PricingResult $price, int $orgId, int $holdId, string $holdToken, ?string $paymentIntentId)`; `PortalStayHooks::provisionalReference(string $holdToken): string` (static) = `'H:' . substr($holdToken, 0, 30)`.
  - The hold payload gains `mirror_id` once booked.
  - Route `POST member/portal/stays/confirm` `{hold_token, payment_intent_id?, special_requests?}` → 201 `{booking: <stay DTO>, replayed: false}`, 200 `{…, replayed: true}` on a repeat; errors `hold_not_found` 404, `hold_expired` 409, `price_changed` 409, `payment_required` 422, `payment_mismatch` 409, `coupon_*` 422, `room_unavailable` 409, `pms_unavailable` 503, `confirm_failed` 500, `no_membership` 422.

- [ ] **Step 1: Write the failing tests**

Add to `tests/Feature/Member/Portal/PortalStayBookingTest.php` (imports: `use App\Models\BookingMirror;`, `use App\Models\MemberOffer;`, `use App\Models\AuditLog;`, `use App\Mail\BookingConfirmationMail;`, `use Illuminate\Support\Facades\Mail;`):

```php
    private const CONFIRM = '/api/v1/member/portal/stays/confirm';

    protected function confirm(string $holdToken, array $extra = [], ?string $token = null)
    {
        $this->flushHeaders();
        return $this->withToken($token ?? $this->token)->postJson(self::CONFIRM, array_merge(['hold_token' => $holdToken], $extra));
    }

    /** Smoobu says the nights are free at confirm and accepts the reservation. */
    protected function smoobuBooks(array $reservation = []): void
    {
        $this->smoobu->shouldReceive('resolveDirectChannelId')->andReturn(7);
        $this->smoobu->shouldReceive('createReservation')->byDefault()->andReturn(array_merge(['id' => 555001, 'reference-id' => 'BK-ABC12345'], $reservation));
        $this->smoobu->shouldReceive('getPriceElements')->byDefault()->andReturn([]);
    }

    protected function stayIntent(string $holdToken, array $top = [], array $meta = []): PaymentIntent
    {
        return PaymentIntent::constructFrom(array_merge(['id' => 'pi_stay', 'status' => 'requires_capture', 'amount' => 20000, 'currency' => 'eur'], $top, [
            'metadata' => array_merge(['kind' => 'portal_stay_booking', 'org_id' => (string) $this->org->id, 'member_id' => (string) $this->member->id, 'portal_hold_token' => $holdToken], $meta),
        ]));
    }

    protected function mirrors()
    {
        return BookingMirror::withoutGlobalScopes()->where('organization_id', $this->org->id);
    }

    public function test_confirm_books_the_stay_for_the_member_at_the_member_price(): void
    {
        $this->smoobuBooks();
        $this->tenPercentOnStays();
        $hold = $this->quote()->assertOk()->json('hold_token');

        $res = $this->confirm($hold, ['special_requests' => 'Quiet room please'])->assertStatus(201);

        $res->assertJsonPath('replayed', false)->assertJsonPath('booking.kind', 'stay')->assertJsonPath('booking.reference', 'BK-ABC12345')
            ->assertJsonPath('booking.total', 180)->assertJsonPath('booking.payment_status', 'open')->assertJsonPath('booking.status', 'confirmed');

        $m = $this->mirrors()->sole();
        $this->assertSame($this->member->id, (int) $m->member_id);
        $this->assertSame('Member portal', $m->channel_name);
        $this->assertEquals(200.0, (float) $m->list_total);
        $this->assertEquals(20.0, (float) $m->discount_amount);
        $this->assertEquals(180.0, (float) $m->price_total);
        $this->assertSame('pay_at_venue', $m->payment_method);
        $this->assertSame('Quiet room please', $m->notice);
        $this->assertSame('App Member', $m->guest_name);
        $this->assertSame($this->user->email, $m->guest_email);
        $guest = \App\Models\Guest::withoutGlobalScopes()->findOrFail($m->guest_id);
        $this->assertSame($this->member->id, (int) $guest->member_id);

        $holdRow = $this->holdOf($hold);
        $this->assertSame('consumed', $holdRow->status);
        $this->assertSame($m->id, (int) $holdRow->payload_json['mirror_id']);
        $this->assertSame(1, AuditLog::withoutGlobalScopes()->where('action', 'booking.portal_confirmed')->where('subject_id', $m->id)->count());
        Mail::assertQueued(BookingConfirmationMail::class, fn (BookingConfirmationMail $mail) => $mail->hasTo($this->user->email) && $mail->discountAmount === 20.0);
    }

    public function test_confirm_consumes_the_coupon_once_under_the_bookings_own_reference(): void
    {
        $this->smoobuBooks();
        $claim = $this->claim(50);
        $hold = $this->quote(['coupon' => ['member_offer_id' => $claim->id]])->assertOk()->json('hold_token');

        $this->confirm($hold)->assertStatus(201)->assertJsonPath('booking.total', 150)->assertJsonPath('booking.discount.amount', 50);

        $used = MemberOffer::findOrFail($claim->id);
        $this->assertNotNull($used->used_at);
        $this->assertSame('BK-ABC12345', $used->used_reference, 'not the provisional hold reference');
        $this->assertSame('offer', $this->mirrors()->sole()->discount_source);
        $this->assertSame($claim->id, (int) $this->mirrors()->sole()->discount_source_id);
    }

    public function test_an_outbid_coupon_is_not_consumed(): void
    {
        $this->smoobuBooks();
        $this->tenPercentOnStays();
        $small = $this->claim(5);
        $hold = $this->quote(['coupon' => ['member_offer_id' => $small->id]])->assertOk()->json('hold_token');

        $this->confirm($hold)->assertStatus(201)->assertJsonPath('booking.total', 180);
        $this->assertNull(MemberOffer::findOrFail($small->id)->used_at);
    }

    /** Review Focus 1. */
    public function test_a_second_confirm_on_the_same_hold_replays_the_booking(): void
    {
        $this->smoobuBooks();
        $this->smoobu->shouldReceive('createReservation')->once()->andReturn(['id' => 555001, 'reference-id' => 'BK-ABC12345']);
        $claim = $this->claim(50);
        $hold = $this->quote(['coupon' => ['member_offer_id' => $claim->id]])->assertOk()->json('hold_token');

        $first = $this->confirm($hold)->assertStatus(201)->json('booking.id');
        $again = $this->confirm($hold)->assertOk();

        $again->assertJsonPath('replayed', true)->assertJsonPath('booking.id', $first);
        $this->assertSame(1, $this->mirrors()->count());
        $this->assertSame(1, MemberOffer::whereNotNull('used_at')->count());
        Mail::assertQueued(BookingConfirmationMail::class, 1);
    }

    /** Review Focus 2. */
    public function test_another_members_hold_cannot_be_confirmed(): void
    {
        $this->smoobu->shouldNotReceive('createReservation');
        $hold = $this->quote()->assertOk()->json('hold_token');
        ['token' => $stranger] = $this->member($this->org);

        $this->confirm($hold, [], $stranger)->assertStatus(404)->assertJsonPath('error', 'hold_not_found');
        $this->assertSame('active', $this->holdOf($hold)->status);
        $this->assertSame(0, $this->mirrors()->count());
    }

    public function test_online_mode_requires_a_payment_intent_and_checks_it(): void
    {
        $this->smoobuBooks();
        $stripe = $this->stripe();
        $hold = $this->quote()->assertOk()->json('hold_token');

        $this->confirm($hold)->assertStatus(422)->assertJsonPath('error', 'payment_required');
        $this->assertSame('active', $this->holdOf($hold)->status);

        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_stay')->andReturn($this->stayIntent($hold));
        $this->confirm($hold, ['payment_intent_id' => 'pi_stay'])->assertStatus(201)->assertJsonPath('booking.payment_status', 'authorized');

        $m = $this->mirrors()->sole();
        $this->assertSame('pi_stay', $m->stripe_payment_intent_id);
        $this->assertSame('stripe', $m->payment_method);
    }

    public function test_a_payment_for_another_hold_member_or_amount_is_refused(): void
    {
        $this->smoobu->shouldNotReceive('createReservation');
        $stripe = $this->stripe();
        $hold = $this->quote()->assertOk()->json('hold_token');

        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_other_hold')->andReturn($this->stayIntent('ANOTHER-HOLD', ['id' => 'pi_other_hold']));
        $stripe->shouldReceive('cancelPaymentIntent')->once()->with('pi_other_hold', 'abandoned');
        $this->confirm($hold, ['payment_intent_id' => 'pi_other_hold'])->assertStatus(409)->assertJsonPath('error', 'payment_mismatch');

        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_short')->andReturn($this->stayIntent($hold, ['id' => 'pi_short', 'amount' => 100]));
        $stripe->shouldReceive('cancelPaymentIntent')->once()->with('pi_short', 'abandoned');
        $this->confirm($hold, ['payment_intent_id' => 'pi_short'])->assertStatus(409)->assertJsonPath('error', 'payment_mismatch');

        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_stranger')->andReturn($this->stayIntent($hold, ['id' => 'pi_stranger'], ['member_id' => '999999']));
        $stripe->shouldNotReceive('cancelPaymentIntent')->with('pi_stranger', Mockery::any());
        $this->confirm($hold, ['payment_intent_id' => 'pi_stranger'])->assertStatus(409)->assertJsonPath('error', 'payment_mismatch');

        $this->assertSame(0, $this->mirrors()->count());
    }

    public function test_a_payment_already_spent_on_a_booking_is_refused_and_left_alone(): void
    {
        $this->smoobu->shouldNotReceive('createReservation');
        $stripe = $this->stripe();
        $stripe->shouldNotReceive('cancelPaymentIntent');
        $hold = $this->quote()->assertOk()->json('hold_token');
        BookingMirror::withoutGlobalScopes()->create(['organization_id' => $this->org->id, 'reservation_id' => 'R-OLD', 'apartment_id' => '202', 'price_total' => 200, 'stripe_payment_intent_id' => 'pi_stay', 'member_id' => $this->member->id, 'arrival_date' => now()->addDays(40)->toDateString(), 'departure_date' => now()->addDays(42)->toDateString()]);
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_stay')->andReturn($this->stayIntent($hold));

        $this->confirm($hold, ['payment_intent_id' => 'pi_stay'])->assertStatus(409)->assertJsonPath('error', 'payment_mismatch');
        $this->assertSame(1, $this->mirrors()->count());
        $this->assertSame('active', $this->holdOf($hold)->status);
    }

    public function test_a_room_taken_since_the_quote_releases_the_hold_on_the_card(): void
    {
        $this->smoobuBooks();
        $stripe = $this->stripe();
        $hold = $this->quote()->assertOk()->json('hold_token');
        BookingMirror::withoutGlobalScopes()->create(['organization_id' => $this->org->id, 'reservation_id' => 'R-1', 'booking_state' => 'confirmed', 'internal_status' => 'confirmed', 'apartment_id' => '101', 'arrival_date' => $this->checkIn, 'departure_date' => $this->checkOut, 'price_total' => 200]);
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_stay')->andReturn($this->stayIntent($hold));
        $stripe->shouldReceive('cancelPaymentIntent')->once()->with('pi_stay', 'abandoned');

        $this->confirm($hold, ['payment_intent_id' => 'pi_stay'])->assertStatus(409)->assertJsonPath('error', 'room_unavailable');
        $this->assertSame(1, $this->mirrors()->count());
    }

    public function test_a_coupon_used_since_the_quote_refuses_the_booking_before_smoobu_is_asked(): void
    {
        $this->smoobuBooks();
        $this->smoobu->shouldNotReceive('createReservation');
        $claim = $this->claim(50);
        $hold = $this->quote(['coupon' => ['member_offer_id' => $claim->id]])->assertOk()->json('hold_token');
        $claim->forceFill(['used_at' => now(), 'status' => 'used', 'used_reference' => 'SVC-ELSEWHERE'])->save();

        $this->confirm($hold)->assertStatus(422)->assertJsonPath('error', 'coupon_used');
        $this->assertSame(0, $this->mirrors()->count());
        $this->assertSame('SVC-ELSEWHERE', MemberOffer::findOrFail($claim->id)->used_reference);
    }

    public function test_a_smoobu_rejection_leaves_the_coupon_unused_and_releases_the_payment(): void
    {
        $this->smoobuBooks();
        $this->smoobu->shouldReceive('createReservation')->once()->andThrow(new \RuntimeException('Smoobu API error: 422 POST /reservations — apartment not available'));
        $stripe = $this->stripe();
        $claim = $this->claim(50);
        $hold = $this->quote(['coupon' => ['member_offer_id' => $claim->id]])->assertOk()->json('hold_token');
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_stay')->andReturn($this->stayIntent($hold, ['amount' => 15000]));
        $stripe->shouldReceive('cancelPaymentIntent')->once()->with('pi_stay', 'abandoned');

        $this->confirm($hold, ['payment_intent_id' => 'pi_stay'])->assertStatus(409)->assertJsonPath('error', 'room_unavailable');

        $this->assertNull(MemberOffer::findOrFail($claim->id)->used_at, 'the engine\'s rollback took the consumption with it');
        $this->assertSame(0, $this->mirrors()->count());
    }

    public function test_a_pms_outage_answers_503_and_releases_the_payment(): void
    {
        $this->smoobu->shouldReceive('getDailyRates')->andThrow(new \RuntimeException('cURL error 28: timed out'));
        $this->smoobu->shouldReceive('getRates')->andReturnUsing(function () {
            static $n = 0;
            if ($n++ === 0) return ['data' => ['101' => ['available' => true, 'price' => 200.0, 'price_per_night' => 100.0, 'min_stay' => 1]]];
            throw new \RuntimeException('cURL error 28: timed out');
        });
        $stripe = $this->stripe();
        $hold = $this->quote()->assertOk()->json('hold_token');
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_stay')->andReturn($this->stayIntent($hold));
        $stripe->shouldReceive('cancelPaymentIntent')->once()->with('pi_stay', 'abandoned');

        $this->confirm($hold, ['payment_intent_id' => 'pi_stay'])->assertStatus(503)->assertJsonPath('error', 'pms_unavailable');
        $this->assertSame(0, $this->mirrors()->count());
    }

    /** Review Focus 3. */
    public function test_a_failure_after_the_booking_exists_never_releases_the_payment(): void
    {
        $this->smoobuBooks();
        $stripe = $this->stripe();
        $stripe->shouldNotReceive('cancelPaymentIntent');
        $hold = $this->quote()->assertOk()->json('hold_token');
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_stay')->andReturn($this->stayIntent($hold));

        // The engine's last write after the commit fails (its success log).
        \App\Models\BookingSubmission::creating(function () {
            throw new \RuntimeException('disk full');
        });

        $res = $this->confirm($hold, ['payment_intent_id' => 'pi_stay']);
        \App\Models\BookingSubmission::flushEventListeners();

        $res->assertStatus(201)->assertJsonPath('booking.kind', 'stay')->assertJsonPath('booking.payment_status', 'authorized');
        $this->assertSame(1, $this->mirrors()->count());
    }

    public function test_an_expired_hold_and_a_price_that_moved_answer_their_codes(): void
    {
        $this->smoobu->shouldNotReceive('createReservation');
        $hold = $this->quote()->assertOk()->json('hold_token');
        $this->tenPercentOnStays();
        $this->confirm($hold)->assertStatus(409)->assertJsonPath('error', 'price_changed');

        $late = $this->quote()->assertOk()->json('hold_token');
        $this->travel(11)->minutes();
        $this->confirm($late)->assertStatus(409)->assertJsonPath('error', 'hold_expired');
    }
```

- [ ] **Step 2: Run them to see them fail**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Member/Portal/PortalStayBookingTest.php --no-ansi`
Expected: FAIL — no `stays/confirm` route.

- [ ] **Step 3: `CouponResolver::rereference()`**

Add to `app/Services/Booking/CouponResolver.php` after `consume()`:

```php
    /**
     * Moves a coupon this request consumed from a provisional reference to
     * the booking's own. A stay is booked at the PMS inside the same
     * transaction that consumes the coupon, and its reference is the PMS's
     * to give — so the coupon is consumed first (a refusal then costs
     * nothing) under a reference made from the hold, and renamed here once
     * the booking exists. Touches nothing that does not carry $from.
     */
    public function rereference(array $candidate, string $from, string $to): void
    {
        if ($candidate['source'] === 'offer') {
            MemberOffer::whereKey($candidate['source_id'])->where('used_reference', $from)->update(['used_reference' => mb_substr($to, 0, 60)]);
            return;
        }
        RewardRedemption::whereKey($candidate['source_id'])->where('notes', "Applied to {$from}")->update(['notes' => "Applied to {$to}"]);
    }
```

- [ ] **Step 4: The hooks**

Create `app/Services/Booking/PortalStayHooks.php`:

```php
<?php

namespace App\Services\Booking;

use App\Models\BookingHold;
use App\Models\BookingMirror;
use App\Support\AdvisoryLock;

/**
 * What the member portal does inside the engine's transaction when it
 * books a stay (see StayConfirmHooks): before the PMS is asked, the payment
 * is proven unspent and the coupon is taken; once the stay exists, the
 * coupon is given the stay's own reference and the hold remembers which
 * stay it became — which is what makes a repeated confirm a replay.
 */
final class PortalStayHooks implements StayConfirmHooks
{
    public function __construct(
        private readonly PortalPaymentIntentGuard $guard,
        private readonly MemberPricing $pricing,
        private readonly CouponResolver $coupons,
        private readonly PricingResult $price,
        private readonly int $orgId,
        private readonly int $holdId,
        private readonly string $holdToken,
        private readonly ?string $paymentIntentId,
    ) {}

    /** `used_reference` is 60 characters; a hold token is 48. */
    public static function provisionalReference(string $holdToken): string
    {
        return 'H:' . substr($holdToken, 0, 30);
    }

    /**
     * @throws PaymentAlreadyUsed
     * @throws CouponException
     */
    public function beforeReservation(array $payload): void
    {
        if ($this->paymentIntentId !== null) {
            // One PaymentIntent pays for exactly one booking. The room lock
            // the engine holds serialises confirms for this room; a lock on
            // the intent itself serialises two confirms that carry the same
            // intent for different rooms.
            AdvisoryLock::within('pi:' . $this->paymentIntentId);
            $this->guard->assertUnused($this->paymentIntentId, $this->orgId);
        }

        $this->pricing->consume($this->price, self::provisionalReference($this->holdToken));
    }

    public function afterMirror(BookingMirror $mirror, array $payload): void
    {
        if ($this->price->couponConsumable()) {
            $this->coupons->rereference(
                $this->price->applied,
                self::provisionalReference($this->holdToken),
                (string) ($mirror->booking_reference ?: $mirror->reservation_id),
            );
        }

        $hold = BookingHold::withoutGlobalScopes()->whereKey($this->holdId)->first();
        if ($hold) {
            $hold->payload_json = array_merge($hold->payload_json ?? [], ['mirror_id' => (int) $mirror->id]);
            $hold->save();
        }
    }
}
```

- [ ] **Step 5: The notifier**

Create `app/Services/Booking/PortalStayNotifier.php`:

```php
<?php

namespace App\Services\Booking;

use App\Models\AuditLog;
use App\Models\BookingMirror;
use App\Services\RealtimeEventService;
use Illuminate\Support\Facades\Log;

/**
 * What the portal adds after a stay is booked. The engine has already sent
 * the member's confirmation and the venue's notification mail
 * (BookingEngineService::sendBookingEmails()); this adds the realtime event
 * for the staff dashboard and the audit row that says where the booking
 * came from. The booking is committed by the time this runs, so neither
 * may turn into an error for the member.
 */
class PortalStayNotifier
{
    public function notify(BookingMirror $mirror, bool $online): void
    {
        $orgId = (int) $mirror->organization_id;

        try {
            app(RealtimeEventService::class)->dispatch(
                'booking.created',
                'New stay from the member portal',
                "{$mirror->guest_name} · {$mirror->apartment_name} · {$mirror->arrival_date?->toDateString()}",
                ['mirror_id' => $mirror->id, 'source' => 'member_portal', 'action_url' => "/bookings/{$mirror->id}"],
                $orgId,
            );
        } catch (\Throwable $e) {
            Log::warning('portal.stay_realtime_failed', ['mirror' => $mirror->id, 'error' => $e->getMessage()]);
        }

        try {
            AuditLog::create([
                'organization_id' => $orgId,
                'subject_type'    => 'booking_mirror',
                'subject_id'      => $mirror->id,
                'action'          => 'booking.portal_confirmed',
                'description'     => 'Member portal stay ' . ($mirror->booking_reference ?: $mirror->reservation_id) . ($online ? ' (paid online)' : ' (pay at venue)'),
            ]);
        } catch (\Throwable $e) {
            Log::warning('portal.stay_audit_failed', ['mirror' => $mirror->id, 'error' => $e->getMessage()]);
        }
    }
}
```

- [ ] **Step 6: The endpoint**

Add to `PortalStayBookingController` (imports: `use App\Models\BookingMirror;`, `use App\Services\BookingEngineService;`, `use App\Services\Booking\CouponResolver;`, `use App\Services\Booking\PaymentAlreadyUsed;`, `use App\Services\Booking\PaymentMismatch;`, `use App\Services\Booking\PortalPaymentIntentGuard;`, `use App\Services\Booking\PortalStayHooks;`, `use App\Services\Booking\PortalStayNotifier;`, `use App\Services\GuestMemberLinkService;`, `use App\Services\Portal\MemberBookingQuery;`, `use Symfony\Component\HttpKernel\Exception\HttpException;`):

```php
    /**
     * Book the stay the hold describes. The engine does the booking — the
     * room lock, the re-checks, the PMS, the mirror, the mails — exactly as
     * it does for the public widget; this method decides whether it may
     * (the hold is this member's, the price still stands, the payment is
     * for this hold) and what happens to the payment when it does not.
     *
     * A hold is booked once: a second confirm of the same hold answers the
     * booking it became.
     */
    public function confirm(Request $request, BookingEngineService $engine, GuestMemberLinkService $guests, PortalPaymentIntentGuard $guard, CouponResolver $coupons): JsonResponse
    {
        $data = $request->validate([
            'hold_token'        => 'required|string|max:64',
            'payment_intent_id' => 'nullable|string|max:255',
            'special_requests'  => 'nullable|string|max:2000',
        ]);
        $orgId = (int) app('current_organization_id');
        $user = $request->user();
        $piId = $data['payment_intent_id'] ?? null;

        $member = $this->provisioner->ensureForUser($user);
        if (!$member) {
            // No member id — nothing can be verified as owned, so nothing is released.
            return response()->json(['error' => 'no_membership', 'message' => 'Your membership is not set up yet.'], 422);
        }
        $memberId = (int) $member->id;

        $hold = $this->quotes->ownHold($member, $data['hold_token']);
        if ($hold && ($booked = $this->bookingOf($hold, $orgId))) {
            // Never through fail(): this booking carries whatever paid for it.
            return response()->json(['booking' => MemberBookingQuery::stayDto($booked), 'replayed' => true]);
        }

        $ready = $this->readyHold($request, $member, $data['hold_token']);
        if ($ready instanceof JsonResponse) {
            // hold_not_found releases nothing: the hold is not this member's,
            // so nothing says the payment is either. The rest release.
            return $ready->getStatusCode() === 404 ? $ready : $this->fail($ready, $piId, $orgId, $memberId, $guard);
        }
        [$hold, $pricing] = $ready;

        $online = PortalBootstrap::paymentMode($pricing->currency)['mode'] === 'online' && $pricing->total > 0;
        if ($online && !$piId) {
            return response()->json(['error' => 'payment_required', 'message' => 'Please complete the payment first.'], 422);
        }
        if (!$online && $piId) {
            return $this->fail(response()->json(['error' => 'payment_mismatch', 'message' => 'This venue takes payment at the venue.'], 409), $piId, $orgId, $memberId, $guard);
        }
        $pi = null;
        if ($piId) {
            try {
                $pi = $guard->verifyStay($piId, $orgId, $memberId, $hold->hold_token, $pricing->total);
            } catch (PaymentMismatch) {
                // verifyStay() already cancelled an owned, mismatched intent; fail() would cancel it twice.
                return response()->json(['error' => 'payment_mismatch', 'message' => 'The payment does not match this booking. Please pay again.'], 409);
            }
        }

        [$first, $last] = $this->names((string) $user->name);
        $hooks = new PortalStayHooks($guard, $this->pricing, $coupons, $pricing, $orgId, (int) $hold->id, $hold->hold_token, $piId);

        try {
            $engine->confirm([
                'hold_token'        => $hold->hold_token,
                'guest'             => ['first_name' => $first, 'last_name' => $last, 'email' => $user->email, 'phone' => $user->phone],
                'guest_id'          => $guests->ensureGuestForMember($member)->id,
                'special_requests'  => $data['special_requests'] ?? null,
                'payment_intent_id' => $piId,
                'payment_method'    => $online ? 'stripe' : 'pay_at_venue',
                'payment_status'    => $online ? ($this->intentStatus($pi) === 'succeeded' ? 'paid' : 'authorized') : 'open',
            ], null, $request->header('X-Request-Id'), $request->ip(), $hooks);
        } catch (PaymentAlreadyUsed) {
            // The intent already pays for a booking: it is never released here.
            return response()->json(['error' => 'payment_mismatch', 'message' => 'The payment no longer matches this booking. Please pay again.'], 409);
        } catch (\Throwable $e) {
            // Whatever failed, a booking that exists stays booked and paid:
            // the engine sends mails and writes its logs after it commits.
            if ($booked = $this->bookingOf($hold->fresh(), $orgId)) {
                Log::error('portal.stay_confirm_failed_after_commit', ['org' => $orgId, 'mirror' => $booked->id, 'exception' => get_class($e), 'error' => $e->getMessage()]);
                return $this->booked($booked, $online);
            }
            return $this->fail($this->confirmError($e, $orgId, $piId), $piId, $orgId, $memberId, $guard);
        }

        $booked = $this->bookingOf($hold->fresh(), $orgId);
        if (!$booked) {
            Log::error('portal.stay_confirm_lost', ['org' => $orgId, 'hold' => $hold->id, 'payment_intent' => $piId]);
            return response()->json(['error' => 'confirm_failed', 'message' => 'We could not complete the booking. Please contact the venue before trying again.'], 500);
        }

        return $this->booked($booked, $online);
    }

    private function booked(BookingMirror $mirror, bool $online): JsonResponse
    {
        app(PortalStayNotifier::class)->notify($mirror, $online);

        return response()->json(['booking' => MemberBookingQuery::stayDto($mirror), 'replayed' => false], 201);
    }

    /** The stay a consumed hold became, read without the Smoobu scope (the member's own booking, whatever the switch says). */
    private function bookingOf(?BookingHold $hold, int $orgId): ?BookingMirror
    {
        $id = (int) ($hold?->payload_json['mirror_id'] ?? 0);
        if (!$hold || $hold->status !== 'consumed' || $id === 0) {
            return null;
        }

        return BookingMirror::withoutGlobalScopes()->where('organization_id', $orgId)->whereKey($id)->first();
    }

    /**
     * Every error exit of confirm() that knows a payment_intent_id runs its
     * response through here. PortalPaymentIntentGuard::release() refuses to
     * cancel an intent a booking carries or one whose metadata does not name
     * this organisation and member, so this is always safe to call.
     */
    private function fail(JsonResponse $response, ?string $piId, int $orgId, int $memberId, PortalPaymentIntentGuard $guard): JsonResponse
    {
        $guard->release($piId, $orgId, $memberId);

        return $response;
    }

    private function confirmError(\Throwable $e, int $orgId, ?string $piId): JsonResponse
    {
        if ($e instanceof CouponException) {
            return response()->json(['error' => $e->errorCode, 'message' => $e->sentence()], 422);
        }
        if ($e instanceof HttpException && $e->getStatusCode() === 503) {
            return response()->json(['error' => 'pms_unavailable', 'message' => 'We could not reach the booking system. Please try again in a moment.'], 503);
        }
        if ($e instanceof \RuntimeException && str_contains($e->getMessage(), 'Hold expired')) {
            return response()->json(['error' => 'hold_expired', 'message' => 'This took a little too long. Please check the price again.'], 409);
        }
        if ($e instanceof \RuntimeException && str_contains($e->getMessage(), 'PMS configuration')) {
            Log::error('portal.stay_confirm_pms_configuration', ['org' => $orgId, 'error' => $e->getMessage()]);
            return response()->json(['error' => 'pms_unavailable', 'message' => 'We could not complete the booking. Please contact the venue.'], 503);
        }
        if ($e instanceof \RuntimeException && !($e instanceof \Illuminate\Database\QueryException)) {
            // The engine's own refusals: the room was taken here or on another channel.
            return response()->json(['error' => 'room_unavailable', 'message' => 'That room was just booked. Please choose another.'], 409);
        }

        Log::error('portal.stay_confirm_failed', ['org' => $orgId, 'exception' => get_class($e), 'error' => $e->getMessage(), 'payment_intent' => $piId]);
        return response()->json(['error' => 'confirm_failed', 'message' => 'We could not complete the booking. Please try again.'], 500);
    }

    /** "Ada King Lovelace" → ["Ada", "King Lovelace"]; one word → [word, word] (the engine and the PMS both want a last name). */
    private function names(string $name): array
    {
        $parts = preg_split('/\s+/', trim($name), 2) ?: [];
        $first = $parts[0] ?? 'Member';

        return [$first !== '' ? $first : 'Member', $parts[1] ?? ($first !== '' ? $first : 'Member')];
    }

    /** retrievePaymentIntent() returns a Stripe\PaymentIntent; tolerates an array too (test doubles). */
    private function intentStatus(mixed $pi): string
    {
        return is_array($pi) ? (string) ($pi['status'] ?? '') : (string) ($pi->status ?? '');
    }
```

Route, after `stays/payment-intent`:

```php
            Route::post('stays/confirm', [\App\Http\Controllers\Api\V1\Member\Portal\PortalStayBookingController::class, 'confirm'])
                ->middleware('throttle:30,1');
```

- [ ] **Step 6b: The stay DTO carries the discount and the member's notes**

In `app/Services/Portal/MemberBookingQuery.php`, in `stayDto()` (`:167-199`), replace

```php
            'discount'        => null,
```

with

```php
            'discount'        => (float) $m->discount_amount > 0 ? ['amount' => round((float) $m->discount_amount, 2), 'label' => $m->discount_label ?: 'Member discount'] : null,
```

and, only for a booking made in the portal (the PMS sync fills `notice` for every other booking with whatever the channel sent, which is not the member's to read back), replace

```php
            'notes'           => null,
```

with

```php
            'notes'           => $m->member_id ? ($m->notice ?: null) : null,
```

`can_cancel` and `cancel_deadline` stay as they are until Task 10.

- [ ] **Step 7: Run the tests**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Member/Portal/PortalStayBookingTest.php --no-ansi`
Expected: `Tests:    28 passed`.

`test_a_failure_after_the_booking_exists…` registers a model event that throws; if it leaks into a later test, `flushEventListeners()` was not reached — wrap the confirm call in `try { … } finally { BookingSubmission::flushEventListeners(); }`.

- [ ] **Step 8: Neighbouring suites**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Member/ --no-ansi`, `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Booking/ --no-ansi`, `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Unit/Booking/ --no-ansi`
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add app/Services/Booking/PortalStayHooks.php app/Services/Booking/PortalStayNotifier.php app/Services/Booking/CouponResolver.php app/Services/Portal/MemberBookingQuery.php app/Http/Controllers/Api/V1/Member/Portal/PortalStayBookingController.php routes/api.php tests/Feature/Member/Portal/PortalStayBookingTest.php
git commit -m "Confirm a member's stay through the engine, once per hold

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Points for a completed stay

**Files:**
- Modify: `app/Services/Loyalty/BookingPointsService.php`, `routes/console.php`
- Create: `app/Console/Commands/AwardStayPoints.php`
- Test: `tests/Feature/Booking/AwardStayPointsTest.php`

**Interfaces:**
- Consumes: `LoyaltyService::pointsForSpend(LoyaltyMember $member, float $amount): int`, `LoyaltyService::awardPoints(...)` (positional, as `awardForServiceBooking()` calls it); `PortalBootstrap::loyaltyOn(int)`, `::venueToday(int)`.
- Produces:
  - `BookingPointsService::awardForStay(\App\Models\BookingMirror $mirror): ?\App\Models\PointsTransaction` — ledger `reference_type = 'booking_mirror'`, `reference_id = mirror id`, idempotency key `booking_points_stay_{id}`; stamps `booking_mirror.points_awarded_at`.
  - Command `bookings:award-stay-points {--org=} {--dry-run}`, scheduled daily at 04:15.

- [ ] **Step 1: Write the failing tests**

Create `tests/Feature/Booking/AwardStayPointsTest.php`:

```php
<?php

namespace Tests\Feature\Booking;

use App\Models\BookingMirror;
use App\Models\HotelSetting;
use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Models\PointsTransaction;
use App\Services\Loyalty\BookingPointsService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Cache;
use Tests\Concerns\SeedsPointsFixture;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\Concerns\SetsUpServiceBookingSchema;
use Tests\Concerns\SetsUpStayBookingSchema;
use Tests\TestCase;

class AwardStayPointsTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema, SetsUpServiceBookingSchema, SetsUpStayBookingSchema, SeedsPointsFixture;

    private int $orgId;
    private LoyaltyMember $member;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpMinimalSchema();
        $this->setUpLoyaltyAwardSchema();
        $this->setUpServiceBookingSchema();
        $this->setUpStayBookingSchema();

        $fixture = $this->seedPointsFixture(); // 10 points per currency unit, tier rate 1.5
        $this->orgId = $fixture['orgId'];
        $this->member = $fixture['member'];
    }

    private function stay(array $attrs = []): BookingMirror
    {
        static $n = 0;
        return BookingMirror::withoutGlobalScopes()->create(array_merge([
            'organization_id' => $this->orgId, 'reservation_id' => 'R-' . (++$n), 'booking_reference' => 'BK-STAY' . $n,
            'booking_state' => 'confirmed', 'internal_status' => 'checked-out', 'apartment_id' => '101', 'apartment_name' => 'Sea view',
            'channel_name' => 'Member portal', 'member_id' => $this->member->id,
            'arrival_date' => now()->subDays(3)->toDateString(), 'departure_date' => now()->subDay()->toDateString(),
            'price_total' => 180, 'list_total' => 200, 'discount_amount' => 20, 'payment_status' => 'paid', 'payment_method' => 'stripe',
        ], $attrs));
    }

    public function test_a_finished_stay_earns_on_what_was_paid_once(): void
    {
        $stay = $this->stay();
        $svc = app(BookingPointsService::class);

        $tx = $svc->awardForStay($stay);

        $this->assertNotNull($tx);
        $this->assertSame(2700, $tx->points); // 180 x 10 x 1.5
        $this->assertSame('booking_mirror', $tx->reference_type);
        $this->assertSame($stay->id, (int) $tx->reference_id);
        $this->assertNotNull($stay->fresh()->points_awarded_at);
        $this->assertNull($svc->awardForStay($stay->fresh()));
        $this->assertSame(1, PointsTransaction::where('member_id', $this->member->id)->count());
    }

    public function test_nothing_is_earned_before_departure_or_on_a_cancelled_or_refunded_stay_or_without_a_member(): void
    {
        $svc = app(BookingPointsService::class);

        $this->assertNull($svc->awardForStay($this->stay(['departure_date' => now()->addDay()->toDateString(), 'internal_status' => 'checked-in'])));
        $this->assertNull($svc->awardForStay($this->stay(['departure_date' => now()->toDateString()])), 'the day of departure is not over');
        $this->assertNull($svc->awardForStay($this->stay(['internal_status' => 'cancelled'])));
        $this->assertNull($svc->awardForStay($this->stay(['booking_state' => 'cancelled'])));
        $this->assertNull($svc->awardForStay($this->stay(['payment_status' => 'refunded'])));
        $this->assertNull($svc->awardForStay($this->stay(['payment_status' => 'cancelled'])));
        $this->assertNull($svc->awardForStay($this->stay(['member_id' => null])));
        $this->assertSame(0, PointsTransaction::count());
    }

    public function test_no_points_when_the_venue_switched_them_off_or_runs_no_programme(): void
    {
        HotelSetting::withoutGlobalScopes()->create(['organization_id' => $this->orgId, 'key' => 'points_on_bookings', 'value' => 'false']);
        HotelSetting::flushCacheFor($this->orgId);
        $this->assertNull(app(BookingPointsService::class)->awardForStay($this->stay()));

        HotelSetting::withoutGlobalScopes()->where('organization_id', $this->orgId)->where('key', 'points_on_bookings')->delete();
        HotelSetting::flushCacheFor($this->orgId);
        LoyaltyTier::where('organization_id', $this->orgId)->update(['is_active' => false]);
        Cache::flush();
        $this->assertNull(app(BookingPointsService::class)->awardForStay($this->stay()));
    }

    public function test_the_daily_command_awards_every_finished_member_stay_once(): void
    {
        $a = $this->stay();
        $b = $this->stay(['price_total' => 100]);
        $upcoming = $this->stay(['departure_date' => now()->addDays(5)->toDateString(), 'internal_status' => 'confirmed']);
        $guest = $this->stay(['member_id' => null]);
        app()->forgetInstance('current_organization_id'); // the scheduler binds no tenant

        $this->artisan('bookings:award-stay-points')->assertExitCode(0);
        $this->artisan('bookings:award-stay-points')->assertExitCode(0);

        $this->assertSame(2, PointsTransaction::withoutGlobalScopes()->where('reference_type', 'booking_mirror')->count());
        $this->assertSame(2700 + 1500, (int) LoyaltyMember::withoutGlobalScopes()->findOrFail($this->member->id)->current_points);
        $this->assertNotNull($a->fresh()->points_awarded_at);
        $this->assertNotNull($b->fresh()->points_awarded_at);
        $this->assertNull($upcoming->fresh()->points_awarded_at);
        $this->assertNull($guest->fresh()->points_awarded_at);
    }

    public function test_a_dry_run_awards_nothing(): void
    {
        $stay = $this->stay();
        app()->forgetInstance('current_organization_id');

        $this->artisan('bookings:award-stay-points', ['--dry-run' => true])->assertExitCode(0);

        $this->assertSame(0, PointsTransaction::withoutGlobalScopes()->count());
        $this->assertNull($stay->fresh()->points_awarded_at);
    }
}
```

`$mirror->fresh()` runs through `IntegrationDataScope`; if it returns null with no tenant bound, read the row with `BookingMirror::withoutGlobalScopes()->find($id)` in the assertions instead.

- [ ] **Step 2: Run them to see them fail**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Booking/AwardStayPointsTest.php --no-ansi`
Expected: FAIL — `Call to undefined method …::awardForStay()`.

- [ ] **Step 3: `awardForStay()`**

In `app/Services/Loyalty/BookingPointsService.php` (import `use App\Models\BookingMirror;`), update the class docblock's second paragraph to add: "Stays are awarded by the daily `bookings:award-stay-points` command: a stay is complete when its departure date has passed, and nothing in the application marks that moment." and add after `awardForServiceBooking()`:

```php
    /**
     * Points for a member's stay once it is over: the day after departure
     * in the venue's own time zone, on what the member paid. The ledger row
     * names the mirror (`booking_mirror`), which is what a later refund
     * reverses (BookingRefundService::reverseLoyaltyPoints()).
     */
    public function awardForStay(BookingMirror $mirror): ?PointsTransaction
    {
        $orgId = (int) $mirror->organization_id;

        if (!$mirror->member_id || $mirror->points_awarded_at !== null || !$mirror->departure_date) {
            return null;
        }
        if (in_array((string) $mirror->internal_status, ['cancelled', 'no-show', 'no_show'], true) || (string) $mirror->booking_state === 'cancelled') {
            return null;
        }
        if (in_array((string) $mirror->payment_status, ['refunded', 'partially_refunded', 'cancelled', 'canceled', 'disputed'], true) || (float) $mirror->price_total <= 0) {
            return null;
        }
        if ($mirror->departure_date->toDateString() >= PortalBootstrap::venueToday($orgId)->toDateString()) {
            return null;
        }
        if (!$this->pointsOnBookingsEnabled($orgId) || !PortalBootstrap::loyaltyOn($orgId)) {
            return null;
        }

        return $this->underBookingOrg($orgId, function () use ($mirror, $orgId) {
            $member = LoyaltyMember::withoutGlobalScopes()
                ->where('organization_id', $orgId)
                ->whereKey($mirror->member_id)
                ->with('tier')
                ->first();
            if (!$member) {
                return null;
            }

            $points = $this->loyalty->pointsForSpend($member, (float) $mirror->price_total);
            $reference = $mirror->booking_reference ?: $mirror->reservation_id;

            $tx = null;
            if ($points > 0) {
                $tx = $this->loyalty->awardPoints(
                    $member,
                    $points,
                    "Stay {$reference}",
                    'earn',
                    null,
                    'booking_mirror',
                    $mirror->id,
                    (float) $mirror->price_total,
                    null,
                    null,
                    'booking_completed',
                    'booking_mirror',
                    (string) $mirror->id,
                    "booking_points_stay_{$mirror->id}",
                );
            }

            // Zero computed points still stamps the stay, or it would be
            // looked at again every night.
            DB::table('booking_mirror')->where('id', $mirror->id)->update(['points_awarded_at' => now()]);

            return $tx;
        });
    }
```

- [ ] **Step 4: The command**

Create `app/Console/Commands/AwardStayPoints.php`:

```php
<?php

namespace App\Console\Commands;

use App\Models\BookingMirror;
use App\Services\Loyalty\BookingPointsService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

/**
 * Awards points for members' stays that ended. Nothing in the application
 * marks the moment a stay ends (the PMS sync relabels it some minutes or
 * hours later), so this looks every day for member stays whose departure
 * date has passed and that have not been awarded yet.
 *
 * Safe to run twice: BookingPointsService::awardForStay() is idempotent on
 * the ledger's key and stamps the stay. Looks back 60 days, so a stay
 * missed during an outage is still awarded.
 */
class AwardStayPoints extends Command
{
    protected $signature = 'bookings:award-stay-points
                            {--org= : Limit to a single organization id}
                            {--dry-run : Report what would be awarded without writing}';

    protected $description = 'Award loyalty points for members\' stays that have ended.';

    public function handle(BookingPointsService $points): int
    {
        $org = $this->option('org') ? (int) $this->option('org') : null;
        $dry = (bool) $this->option('dry-run');
        $awarded = 0;
        $seen = 0;

        BookingMirror::withoutGlobalScopes()
            ->whereNotNull('member_id')
            ->whereNull('points_awarded_at')
            // The day boundary is each venue's own; awardForStay() checks it.
            ->whereDate('departure_date', '<=', now()->addDay()->toDateString())
            ->whereDate('departure_date', '>=', now()->subDays(60)->toDateString())
            ->when($org, fn ($q) => $q->where('organization_id', $org))
            ->orderBy('id')
            ->chunkById(200, function ($stays) use ($points, $dry, &$awarded, &$seen) {
                foreach ($stays as $stay) {
                    $seen++;
                    if ($dry) {
                        $this->line("[dry-run] stay #{$stay->id} (org {$stay->organization_id}, departed {$stay->departure_date?->toDateString()})");
                        continue;
                    }
                    try {
                        if ($points->awardForStay($stay)) {
                            $awarded++;
                        }
                    } catch (\Throwable $e) {
                        Log::error('bookings:award-stay-points failed for a stay', ['mirror' => $stay->id, 'error' => $e->getMessage()]);
                    }
                }
            });

        $this->info($dry ? "{$seen} stay(s) would be looked at." : "{$awarded} stay(s) awarded of {$seen} looked at.");

        return self::SUCCESS;
    }
}
```

In `routes/console.php`, after the `bookings:capture-pending-pis` block, add:

```php
// Points for members' stays that ended. A stay has no "completed" moment of
// its own, so this looks once a day for member stays whose departure date
// has passed (in the venue's own time zone) and awards them once.
Schedule::command('bookings:award-stay-points')
    ->dailyAt('04:15')
    ->withoutOverlapping(30);
```

- [ ] **Step 5: Run the tests**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Booking/AwardStayPointsTest.php tests/Feature/Booking/BookingPointsServiceTest.php --no-ansi`
Expected: all pass (5 new).

- [ ] **Step 6: Commit**

```bash
git add app/Services/Loyalty/BookingPointsService.php app/Console/Commands/AwardStayPoints.php routes/console.php tests/Feature/Booking/AwardStayPointsTest.php
git commit -m "Award points for a member's stay once it has ended

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
## Part C — Cancelling a booking

### Task 10: The cancellation policy, and bookings that say whether they can be cancelled

**Files:**
- Create: `app/Services/Booking/CancellationPolicy.php`
- Modify: `app/Services/Portal/MemberBookingQuery.php` (`stays()` `:98-106`, `serviceDto()` `:141-165`, `stayDto()` `:167-199`)
- Test: `tests/Feature/Booking/CancellationPolicyTest.php` (create), `tests/Feature/Member/Portal/PortalBookingsTest.php` (modify)

**Interfaces:**
- Consumes: `PortalBootstrap::timezone(Organization): string`, `PortalBootstrap::stayPolicies(): array` (Task 5); settings `services_cancel_hours` (24), `booking_cancel_hours` (48).
- Produces:
  - `CancellationPolicy::forService(\App\Models\ServiceBooking $b, ?\DateTimeInterface $now = null): array{can_cancel: bool, deadline: ?\Carbon\CarbonImmutable, reason: ?string}`
  - `CancellationPolicy::forStay(\App\Models\BookingMirror $m, ?\DateTimeInterface $now = null): array` (same shape)
  - reasons: `CancellationPolicy::ALREADY_CANCELLED = 'already_cancelled'`, `::NOT_CANCELLABLE = 'not_cancellable'`, `::OUTSIDE_POLICY = 'outside_policy'`; `reason` is null exactly when `can_cancel` is true.
  - Booking DTOs: `can_cancel` (bool) and `cancel_deadline` (ISO 8601 string, present whenever the booking is of a cancellable kind and state — also after the deadline has passed — else null); `payment_status` never `canceled` (normalised to `cancelled`); a stay whose `booking_state` is `cancelled` reports `status: 'cancelled'`; stays are also owned through `booking_mirror.member_id`.

- [ ] **Step 1: Write the failing policy tests**

Create `tests/Feature/Booking/CancellationPolicyTest.php`:

```php
<?php

namespace Tests\Feature\Booking;

use App\Models\BookingMirror;
use App\Models\HotelSetting;
use App\Models\Organization;
use App\Models\ServiceBooking;
use App\Services\Booking\CancellationPolicy;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

class CancellationPolicyTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema;

    private Organization $org;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpBookingRefundSchema(); // organizations, hotel_settings, booking_mirror
        if (!Schema::hasColumn('organizations', 'timezone')) {
            Schema::table('organizations', fn ($t) => $t->string('timezone')->nullable());
        }
        $this->org = Organization::create(['name' => 'Seaside Hotel', 'slug' => 'seaside-' . uniqid(), 'timezone' => 'Europe/Riga']);
        app()->instance('current_organization_id', $this->org->id);
        $this->travelTo('2026-10-01 09:00:00'); // UTC; Riga is UTC+3 on this date
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        parent::tearDown();
    }

    private function setting(string $key, string $value): void
    {
        $row = new HotelSetting();
        $row->organization_id = $this->org->id;
        $row->key = $key;
        $row->value = $value;
        $row->save();
        HotelSetting::flushCacheFor($this->org->id);
    }

    private function service(array $attrs = []): ServiceBooking
    {
        return (new ServiceBooking())->forceFill(array_merge([
            'organization_id' => $this->org->id, 'status' => 'confirmed', 'payment_status' => 'unpaid',
            'start_at' => now()->addDays(3), 'end_at' => now()->addDays(3)->addHour(),
        ], $attrs));
    }

    private function stay(array $attrs = []): BookingMirror
    {
        return (new BookingMirror())->forceFill(array_merge([
            'organization_id' => $this->org->id, 'internal_status' => 'confirmed', 'booking_state' => 'confirmed',
            'channel_name' => 'Member portal', 'payment_status' => 'paid', 'booking_group_id' => null,
            'arrival_date' => '2026-10-10', 'departure_date' => '2026-10-12',
        ], $attrs));
    }

    public function test_a_service_booking_can_be_cancelled_until_the_venues_hours_before_it_starts(): void
    {
        $p = CancellationPolicy::forService($this->service(['start_at' => '2026-10-02 10:00:00'])); // 25 h away, default 24
        $this->assertTrue($p['can_cancel']);
        $this->assertNull($p['reason']);
        $this->assertSame('2026-10-01T10:00:00+00:00', $p['deadline']->toIso8601String());

        $late = CancellationPolicy::forService($this->service(['start_at' => '2026-10-02 08:00:00'])); // 23 h away
        $this->assertFalse($late['can_cancel']);
        $this->assertSame('outside_policy', $late['reason']);
        $this->assertNotNull($late['deadline'], 'the portal can still say when it ended');
    }

    public function test_the_venues_own_hours_are_used(): void
    {
        $this->setting('services_cancel_hours', '2');
        $this->assertTrue(CancellationPolicy::forService($this->service(['start_at' => '2026-10-01 12:00:00']))['can_cancel']);

        $this->setting('services_cancel_hours', '0');
        $this->assertTrue(CancellationPolicy::forService($this->service(['start_at' => '2026-10-01 09:30:00']))['can_cancel'], 'zero hours: until it starts');
        $this->assertFalse(CancellationPolicy::forService($this->service(['start_at' => '2026-10-01 08:30:00']))['can_cancel'], 'never once it has started');
    }

    public function test_only_pending_and_confirmed_service_bookings_that_were_not_refunded(): void
    {
        $this->assertTrue(CancellationPolicy::forService($this->service(['status' => 'pending']))['can_cancel']);
        foreach (['in_progress', 'completed'] as $status) {
            $this->assertSame('not_cancellable', CancellationPolicy::forService($this->service(['status' => $status]))['reason'], $status);
        }
        foreach (['cancelled', 'no_show'] as $status) {
            $this->assertSame('already_cancelled', CancellationPolicy::forService($this->service(['status' => $status]))['reason'], $status);
        }
        $this->assertSame('not_cancellable', CancellationPolicy::forService($this->service(['payment_status' => 'refunded']))['reason']);
    }

    public function test_a_stay_is_measured_from_the_check_in_time_in_the_venues_own_zone(): void
    {
        // Arrival 10 Oct, check-in 15:00 Riga = 12:00 UTC; 48 h before = 8 Oct 12:00 UTC.
        $p = CancellationPolicy::forStay($this->stay());
        $this->assertTrue($p['can_cancel']);
        $this->assertSame('2026-10-08T12:00:00+00:00', $p['deadline']->utc()->toIso8601String());

        $this->travelTo('2026-10-08 12:30:00');
        $late = CancellationPolicy::forStay($this->stay());
        $this->assertFalse($late['can_cancel']);
        $this->assertSame('outside_policy', $late['reason']);
    }

    public function test_the_venues_check_in_time_and_the_bookings_own_are_used(): void
    {
        $this->setting('booking_policies', json_encode(['check_in_time' => '18:00']));
        $this->assertSame('2026-10-08T15:00:00+00:00', CancellationPolicy::forStay($this->stay())['deadline']->utc()->toIso8601String());
        $this->assertSame('2026-10-08T09:00:00+00:00', CancellationPolicy::forStay($this->stay(['check_in_time' => '12:00:00']))['deadline']->utc()->toIso8601String());
    }

    public function test_only_a_direct_single_room_stay_with_untouched_money(): void
    {
        $this->assertTrue(CancellationPolicy::forStay($this->stay(['channel_name' => 'Website', 'internal_status' => 'new']))['can_cancel']);
        $this->assertTrue(CancellationPolicy::forStay($this->stay(['internal_status' => 'pending_pms_sync', 'payment_status' => 'open']))['can_cancel']);

        foreach ([
            'another channel'   => ['channel_name' => 'Booking.com'],
            'no channel'        => ['channel_name' => null],
            'a combination'     => ['booking_group_id' => 'a3f0c2de-0000-4000-8000-000000000001'],
            'checked in'        => ['internal_status' => 'checked-in'],
            'checked out'       => ['internal_status' => 'checked-out'],
            'refunded'          => ['payment_status' => 'refunded'],
            'partly refunded'   => ['payment_status' => 'partially_refunded'],
            'disputed'          => ['payment_status' => 'disputed'],
            'channel managed'   => ['payment_status' => 'channel_managed'],
            'no arrival date'   => ['arrival_date' => null],
        ] as $case => $attrs) {
            $this->assertSame('not_cancellable', CancellationPolicy::forStay($this->stay($attrs))['reason'], $case);
        }
        $this->assertSame('already_cancelled', CancellationPolicy::forStay($this->stay(['internal_status' => 'cancelled']))['reason']);
        $this->assertSame('already_cancelled', CancellationPolicy::forStay($this->stay(['booking_state' => 'cancelled']))['reason']);
    }

    public function test_a_broken_timezone_falls_back_instead_of_failing(): void
    {
        Organization::withoutGlobalScopes()->whereKey($this->org->id)->update(['timezone' => 'Mars/Olympus']);
        $this->assertTrue(CancellationPolicy::forStay($this->stay())['can_cancel']);
    }
}
```

- [ ] **Step 2: Write the failing DTO tests**

In `tests/Feature/Member/Portal/PortalBookingsTest.php`:

(a) In `test_the_detail_carries_what_the_sheet_shows` replace `$this->assertFalse($json['can_cancel']);` with:

```php
        $this->assertTrue($json['can_cancel'], 'confirmed, three days away, default 24 hours');
        $this->assertNotNull($json['cancel_deadline']);
```

(b) Add:

```php
    public function test_a_booking_inside_the_window_or_already_over_cannot_be_cancelled(): void
    {
        $org = $this->tenant();
        ['token' => $token, 'member' => $member] = $this->member($org);
        $soon = $this->serviceBooking($org, ['member_id' => $member->id, 'start_at' => now()->addHours(5), 'end_at' => now()->addHours(6)]);
        $done = $this->serviceBooking($org, ['member_id' => $member->id, 'status' => 'completed', 'start_at' => now()->subDay(), 'end_at' => now()->subDay()->addHour()]);

        $a = $this->withToken($token)->getJson(self::LIST . "/service/{$soon}")->assertOk()->json();
        $this->assertFalse($a['can_cancel']);
        $this->assertNotNull($a['cancel_deadline'], 'the portal says when free cancellation ended');

        $this->flushHeaders();
        $b = $this->withToken($token)->getJson(self::LIST . "/service/{$done}")->assertOk()->json();
        $this->assertFalse($b['can_cancel']);
        $this->assertNull($b['cancel_deadline']);
    }

    public function test_a_stay_is_owned_by_its_member_column_and_reports_its_discount_and_cancellation(): void
    {
        $org = $this->tenant();
        ['token' => $token, 'member' => $member] = $this->member($org);
        $own = $this->stay($org, ['member_id' => $member->id, 'guest_id' => null, 'guest_email' => 'someone-else@example.test', 'channel_name' => 'Member portal', 'price_total' => 180, 'list_total' => 200, 'discount_amount' => 20, 'discount_label' => 'Gold: 10% off stays', 'notice' => 'Quiet room please']);
        $ota = $this->stay($org, ['member_id' => $member->id, 'channel_name' => 'Booking.com', 'payment_status' => 'channel_managed', 'notice' => 'Channel note']);

        $json = $this->withToken($token)->getJson(self::LIST . "/stay/{$own}")->assertOk()->json();
        $this->assertSame(['amount' => 20.0, 'label' => 'Gold: 10% off stays'], $json['discount']);
        $this->assertSame('Quiet room please', $json['notes']);
        $this->assertTrue($json['can_cancel']);
        $this->assertNotNull($json['cancel_deadline']);

        $this->flushHeaders();
        $other = $this->withToken($token)->getJson(self::LIST . "/stay/{$ota}")->assertOk()->json();
        $this->assertFalse($other['can_cancel'], 'a booking another channel manages is not ours to cancel');
        $this->assertNull($other['cancel_deadline']);
    }

    public function test_a_stay_cancelled_by_a_refund_and_the_old_spelling_both_read_cancelled(): void
    {
        $org = $this->tenant();
        ['token' => $token, 'member' => $member] = $this->member($org);
        // BookingRefundService marks booking_state, not internal_status.
        $refunded = $this->stay($org, ['member_id' => $member->id, 'booking_state' => 'cancelled', 'internal_status' => 'confirmed', 'payment_status' => 'refunded']);
        $old = $this->serviceBooking($org, ['member_id' => $member->id, 'status' => 'cancelled', 'payment_status' => 'canceled']);

        $a = $this->withToken($token)->getJson(self::LIST . "/stay/{$refunded}")->assertOk()->json();
        $this->assertSame('cancelled', $a['status']);
        $this->assertFalse($a['can_cancel']);

        $this->flushHeaders();
        $b = $this->withToken($token)->getJson(self::LIST . "/service/{$old}")->assertOk()->json();
        $this->assertSame('cancelled', $b['payment_status']);
    }
```

`$this->stay()` inserts through the query builder; the columns it now names (`member_id`, `channel_name`, `list_total`, `discount_amount`, `discount_label`, `notice`, `booking_state`) exist in the thin mirror since Task 1 Step 6b.

- [ ] **Step 3: Run them to see them fail**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Booking/CancellationPolicyTest.php tests/Feature/Member/Portal/PortalBookingsTest.php --no-ansi`
Expected: FAIL — `Class "App\Services\Booking\CancellationPolicy" not found`; `can_cancel` is false.

- [ ] **Step 4: The policy**

Create `app/Services/Booking/CancellationPolicy.php`:

```php
<?php

namespace App\Services\Booking;

use App\Models\BookingMirror;
use App\Models\HotelSetting;
use App\Models\Organization;
use App\Models\ServiceBooking;
use App\Services\Portal\PortalBootstrap;
use Carbon\CarbonImmutable;

/**
 * May the member cancel this booking themselves, and until when.
 *
 * One answer for the booking list, the booking sheet and the cancel
 * endpoint: the portal shows a Cancel button exactly when the endpoint
 * would accept it. A cancellation made here always returns the full
 * amount, so anything whose money is not simply "paid by the member to the
 * venue, untouched" — a refund already made, a dispute, a booking another
 * channel collects for — is the venue's to handle.
 *
 * The settings are read for the bound organisation (HotelSetting::getValue).
 */
final class CancellationPolicy
{
    public const ALREADY_CANCELLED = 'already_cancelled';
    public const NOT_CANCELLABLE = 'not_cancellable';
    public const OUTSIDE_POLICY = 'outside_policy';

    private const SERVICE_OPEN = ['pending', 'confirmed'];
    private const SERVICE_DEAD = ['cancelled', 'no_show'];
    private const STAY_OPEN = ['new', 'confirmed', 'pending_pms_sync'];
    private const STAY_DEAD = ['cancelled', 'no-show', 'no_show'];
    /** Bookings we wrote ourselves; every other channel collects and cancels for itself. */
    private const DIRECT_CHANNELS = ['Website', 'Member portal'];
    private const MONEY_TOUCHED = ['refunded', 'partially_refunded', 'disputed', 'channel_managed'];

    /** @return array{can_cancel: bool, deadline: ?CarbonImmutable, reason: ?string} */
    public static function forService(ServiceBooking $b, ?\DateTimeInterface $now = null): array
    {
        if (in_array((string) $b->status, self::SERVICE_DEAD, true)) {
            return self::no(self::ALREADY_CANCELLED);
        }
        if (!in_array((string) $b->status, self::SERVICE_OPEN, true) || !$b->start_at || in_array((string) $b->payment_status, self::MONEY_TOUCHED, true)) {
            return self::no(self::NOT_CANCELLABLE);
        }

        $hours = max(0, (int) HotelSetting::getValue('services_cancel_hours', 24));

        return self::until(CarbonImmutable::instance($b->start_at)->subHours($hours), $now);
    }

    /** @return array{can_cancel: bool, deadline: ?CarbonImmutable, reason: ?string} */
    public static function forStay(BookingMirror $m, ?\DateTimeInterface $now = null): array
    {
        if (in_array((string) $m->internal_status, self::STAY_DEAD, true) || (string) $m->booking_state === 'cancelled') {
            return self::no(self::ALREADY_CANCELLED);
        }
        if (!in_array((string) $m->internal_status, self::STAY_OPEN, true)
            || !in_array((string) $m->channel_name, self::DIRECT_CHANNELS, true)
            || !empty($m->booking_group_id)
            || in_array((string) $m->payment_status, self::MONEY_TOUCHED, true)
            || !$m->arrival_date) {
            return self::no(self::NOT_CANCELLABLE);
        }

        $org = Organization::withoutGlobalScopes()->find($m->organization_id);
        $zone = $org ? PortalBootstrap::timezone($org) : config('app.timezone', 'UTC');
        $clock = self::clock($m->check_in_time) ?? PortalBootstrap::stayPolicies()['check_in_time'];
        $hours = max(0, (int) HotelSetting::getValue('booking_cancel_hours', 48));

        $arrival = CarbonImmutable::parse($m->arrival_date->toDateString() . ' ' . $clock . ':00', $zone);

        return self::until($arrival->subHours($hours), $now);
    }

    private static function until(CarbonImmutable $deadline, ?\DateTimeInterface $now): array
    {
        $now = $now ? CarbonImmutable::instance($now) : CarbonImmutable::now();

        return $now->lessThan($deadline)
            ? ['can_cancel' => true, 'deadline' => $deadline, 'reason' => null]
            : ['can_cancel' => false, 'deadline' => $deadline, 'reason' => self::OUTSIDE_POLICY];
    }

    private static function no(string $reason): array
    {
        return ['can_cancel' => false, 'deadline' => null, 'reason' => $reason];
    }

    /** The mirror's own check-in time ("15:00:00"), as "15:00"; null when it has none or it is midnight (the PMS's "not set"). */
    private static function clock(mixed $time): ?string
    {
        if (!is_string($time) || !preg_match('/^(\d{1,2}):(\d{2})/', $time, $m)) {
            return null;
        }
        $clock = sprintf('%02d:%02d', (int) $m[1], (int) $m[2]);

        return $clock === '00:00' ? null : $clock;
    }
}
```

- [ ] **Step 5: The DTOs and the ownership**

In `app/Services/Portal/MemberBookingQuery.php` (import `use App\Services\Booking\CancellationPolicy;`):

(a) `stays()` — the mirror has its member column now:

```php
    private function stays(LoyaltyMember $member): Builder
    {
        // Keep TenantScope (the request has bound the tenant) and the Smoobu
        // scope, and name the org too.
        return $this->owned(
            BookingMirror::query()->where('booking_mirror.organization_id', $member->organization_id),
            $member, 'member_id', 'guest_id', 'guest_email',
        );
    }
```

(b) In `serviceDto()` replace the three lines `'payment_status' => …`, `'can_cancel' => false,`, `'cancel_deadline' => null,` with:

```php
            'payment_status'  => self::payment($b->payment_status),
```

```php
            'can_cancel'      => $policy['can_cancel'],
            'cancel_deadline' => $policy['deadline']?->toIso8601String(),
```

and add as the method's first line `$policy = CancellationPolicy::forService($b);`.

(c) In `stayDto()` add as the first line `$policy = CancellationPolicy::forStay($m);`, replace the status `match` with

```php
        $internal = (string) $m->internal_status;
        $status = match (true) {
            // BookingRefundService marks a cancelled stay on booking_state.
            in_array($internal, self::STAY_DEAD, true), (string) $m->booking_state === 'cancelled' => 'cancelled',
            $internal === 'checked-out'               => 'completed',
            $internal === 'checked-in'                => 'in_progress',
            default                                   => 'confirmed',
        };
```

and replace `'payment_status' => …`, `'can_cancel' => false,`, `'cancel_deadline' => null,` with

```php
            'payment_status'  => self::payment($m->payment_status instanceof \BackedEnum ? $m->payment_status->value : $m->payment_status),
```

```php
            'can_cancel'      => $policy['can_cancel'],
            'cancel_deadline' => $policy['deadline']?->toIso8601String(),
```

(d) Add the helper at the end of the class:

```php
    /** One spelling: the capture job used to write Stripe's own `canceled`. */
    private static function payment(mixed $status): ?string
    {
        $status = $status === null ? null : (string) $status;

        return $status === 'canceled' ? 'cancelled' : $status;
    }
```

(e) In the class docblock replace the sentence that begins "A booking belongs to the member when" so that it names the member column for both tables, and delete nothing else.

- [ ] **Step 6: Run the tests**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Booking/CancellationPolicyTest.php --no-ansi` then `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Member/ --no-ansi`
Expected: policy `Tests:    7 passed`; the Member suite all green. A Member test that fails on `no such column: booking_mirror.member_id` builds its own `booking_mirror`: add the column there, guarded, as its `setUp()` does for the others.

- [ ] **Step 7: Commit**

```bash
git add app/Services/Booking/CancellationPolicy.php app/Services/Portal/MemberBookingQuery.php tests/Feature/Booking/CancellationPolicyTest.php tests/Feature/Member/Portal/PortalBookingsTest.php
git commit -m "Tell a member whether and until when a booking can be cancelled

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Cancelling a service booking — the money back, the coupon back

**Files:**
- Create: `app/Services/Booking/CancellationException.php`, `app/Services/Booking/CancellationOutcome.php`, `app/Services/Booking/CouponRelease.php`, `app/Services/Booking/ServiceBookingRefund.php`, `app/Services/Booking/MemberCancellation.php` (this task writes `cancelService()`; Task 12 adds `cancelStay()`)
- Modify: `tests/Concerns/SetsUpServiceBookingSchema.php` (the three refund columns, in both the `Schema::create` and the `addColumnsIfMissing` list)
- Test: `tests/Feature/Booking/ServiceBookingRefundTest.php`, `tests/Feature/Booking/MemberCancellationTest.php`

**Interfaces:**
- Consumes: `CancellationPolicy::forService()` (Task 10); `StripeService::isEnabled(): bool`, `retrievePaymentIntent(string): \Stripe\PaymentIntent`, `cancelPaymentIntent(string $id, string $reason = 'abandoned'): \Stripe\PaymentIntent`, `refund(string $pi, ?float $amount = null, ?string $reason = null, ?string $idempotencyKey = null): \Stripe\Refund`; `LoyaltyService::reverseTransaction(PointsTransaction, string $reason, ?User $staff = null): PointsTransaction`.
- Produces:
  - `CancellationException extends \RuntimeException` — `public readonly string $errorCode`, `public readonly int $status`; constructor `(string $errorCode, string $message, int $status)`.
  - `CancellationOutcome` (final readonly): `string $kind` (`'service'|'stay'`), `ServiceBooking|BookingMirror $booking`, `string $money` (`'none'|'released'|'refunded'`), `float $amount`, `string $currency`, `bool $couponReleased`, `int $pointsReversed`, `bool $memberMailed`; `toArray(): array{outcome: string, amount: float, currency: string, coupon_released: bool, points_reversed: int}`.
  - `CouponRelease::release(?string $source, ?int $sourceId, string $reference): bool`
  - `ServiceBookingRefund::giveBack(ServiceBooking $b): array{money: 'none'|'released'|'refunded', amount: float, columns: array}` — throws `CancellationException` (`refund_unavailable` 409, `refund_failed` 502).
  - `MemberCancellation::cancelService(int $orgId, int $bookingId): CancellationOutcome` — throws `CancellationException` (`not_found` 404, `already_cancelled` 409, `not_cancellable` 422, `outside_policy` 422, and the refund's own).
  - `MemberCancellation::REASON = 'member_portal'`.

- [ ] **Step 1: Test schema**

In `tests/Concerns/SetsUpServiceBookingSchema.php` add to the `Schema::create('service_bookings', …)` closure after `points_awarded_at`:

```php
                // Phase 3 (2026_09_30_100000).
                $t->decimal('refunded_amount', 10, 2)->nullable();
                $t->timestamp('refunded_at')->nullable();
                $t->string('last_refund_id')->nullable();
```

and to the `addColumnsIfMissing('service_bookings', [ … ])` list:

```php
                'refunded_amount'    => fn (Blueprint $t) => $t->decimal('refunded_amount', 10, 2)->nullable(),
                'refunded_at'        => fn (Blueprint $t) => $t->timestamp('refunded_at')->nullable(),
                'last_refund_id'     => fn (Blueprint $t) => $t->string('last_refund_id')->nullable(),
```

- [ ] **Step 2: Write the failing refund tests**

Create `tests/Feature/Booking/ServiceBookingRefundTest.php`:

```php
<?php

namespace Tests\Feature\Booking;

use App\Models\Organization;
use App\Models\ServiceBooking;
use App\Services\Booking\CancellationException;
use App\Services\Booking\ServiceBookingRefund;
use App\Services\StripeService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Mockery;
use Stripe\PaymentIntent;
use Stripe\Refund;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\Concerns\SetsUpServiceBookingSchema;
use Tests\TestCase;

class ServiceBookingRefundTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema, SetsUpServiceBookingSchema;

    private Organization $org;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpServiceBookingSchema();
        $this->org = Organization::create(['name' => 'Numa', 'slug' => 'numa-' . uniqid()]);
        app()->instance('current_organization_id', $this->org->id);
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        Mockery::close();
        parent::tearDown();
    }

    private function booking(array $attrs = []): ServiceBooking
    {
        return (new ServiceBooking())->forceFill(array_merge([
            'organization_id' => $this->org->id, 'booking_reference' => 'SVC-TEST0001', 'status' => 'confirmed',
            'payment_status' => 'authorized', 'stripe_payment_intent_id' => 'pi_1', 'total_amount' => 54, 'currency' => 'EUR',
        ], $attrs));
    }

    private function stripe(?string $status, bool $enabled = true): Mockery\MockInterface
    {
        $stripe = Mockery::mock(StripeService::class);
        $stripe->shouldReceive('isEnabled')->andReturn($enabled);
        if ($status !== null) {
            $stripe->shouldReceive('retrievePaymentIntent')->with('pi_1')->andReturn(PaymentIntent::constructFrom(['id' => 'pi_1', 'status' => $status, 'amount' => 5400, 'currency' => 'eur']));
        }
        return $stripe;
    }

    public function test_a_booking_without_an_online_payment_has_nothing_to_give_back(): void
    {
        $stripe = Mockery::mock(StripeService::class);
        $stripe->shouldNotReceive('retrievePaymentIntent');

        foreach ([['payment_status' => 'unpaid', 'stripe_payment_intent_id' => null], ['payment_status' => 'paid', 'stripe_payment_intent_id' => 'pi_mock_abc']] as $attrs) {
            $r = (new ServiceBookingRefund($stripe))->giveBack($this->booking($attrs));
            $this->assertSame(['money' => 'none', 'amount' => 0.0, 'columns' => []], $r);
        }
    }

    /** Review Focus 4. */
    public function test_an_uncaptured_hold_is_cancelled_not_refunded(): void
    {
        $stripe = $this->stripe('requires_capture');
        $stripe->shouldReceive('cancelPaymentIntent')->once()->with('pi_1', 'requested_by_customer')->andReturn(PaymentIntent::constructFrom(['id' => 'pi_1', 'status' => 'canceled']));
        $stripe->shouldNotReceive('refund');

        $r = (new ServiceBookingRefund($stripe))->giveBack($this->booking());

        $this->assertSame('released', $r['money']);
        $this->assertSame(54.0, $r['amount']);
        $this->assertSame(['payment_status' => 'cancelled'], $r['columns']);
    }

    public function test_a_captured_payment_is_refunded_in_full(): void
    {
        $stripe = $this->stripe('succeeded');
        $stripe->shouldReceive('refund')->once()->with('pi_1', null, 'requested_by_customer')->andReturn(Refund::constructFrom(['id' => 're_1', 'status' => 'succeeded', 'amount' => 5400]));
        $stripe->shouldNotReceive('cancelPaymentIntent');
        $this->travelTo('2026-10-01 09:00:00');

        $r = (new ServiceBookingRefund($stripe))->giveBack($this->booking(['payment_status' => 'paid']));

        $this->assertSame('refunded', $r['money']);
        $this->assertSame(54.0, $r['amount']);
        $this->assertSame('refunded', $r['columns']['payment_status']);
        $this->assertSame(54.0, $r['columns']['refunded_amount']);
        $this->assertSame('re_1', $r['columns']['last_refund_id']);
        $this->assertSame('2026-10-01 09:00:00', $r['columns']['refunded_at']->format('Y-m-d H:i:s'));
    }

    public function test_a_hold_stripe_already_let_go_is_recorded_without_another_call(): void
    {
        $stripe = $this->stripe('canceled');
        $stripe->shouldNotReceive('cancelPaymentIntent');
        $stripe->shouldNotReceive('refund');

        $r = (new ServiceBookingRefund($stripe))->giveBack($this->booking());

        $this->assertSame('released', $r['money']);
        $this->assertSame(['payment_status' => 'cancelled'], $r['columns']);
    }

    public function test_an_unfinished_payment_is_cancelled(): void
    {
        $stripe = $this->stripe('requires_payment_method');
        $stripe->shouldReceive('cancelPaymentIntent')->once()->andReturn(PaymentIntent::constructFrom(['id' => 'pi_1', 'status' => 'canceled']));

        $this->assertSame('released', (new ServiceBookingRefund($stripe))->giveBack($this->booking(['payment_status' => 'pending']))['money']);
    }

    public function test_a_stripe_failure_is_reported_and_nothing_is_claimed(): void
    {
        $down = Mockery::mock(StripeService::class);
        $down->shouldReceive('isEnabled')->andReturn(true);
        $down->shouldReceive('retrievePaymentIntent')->andThrow(new \RuntimeException('stripe down'));

        $refusing = $this->stripe('succeeded');
        $refusing->shouldReceive('refund')->andThrow(new \RuntimeException('charge already refunded'));

        foreach ([$down, $refusing] as $stripe) {
            try {
                (new ServiceBookingRefund($stripe))->giveBack($this->booking(['payment_status' => 'paid']));
                $this->fail('a failed refund must throw');
            } catch (CancellationException $e) {
                $this->assertSame('refund_failed', $e->errorCode);
                $this->assertSame(502, $e->status);
            }
        }
    }

    public function test_payments_switched_off_since_the_booking_cannot_return_money(): void
    {
        try {
            (new ServiceBookingRefund($this->stripe(null, false)))->giveBack($this->booking(['payment_status' => 'paid']));
            $this->fail('no Stripe, no refund');
        } catch (CancellationException $e) {
            $this->assertSame('refund_unavailable', $e->errorCode);
            $this->assertSame(409, $e->status);
        }
    }
}
```

- [ ] **Step 3: Write the failing cancellation tests**

Create `tests/Feature/Booking/MemberCancellationTest.php`:

```php
<?php

namespace Tests\Feature\Booking;

use App\Models\MemberOffer;
use App\Models\PointsTransaction;
use App\Models\RewardRedemption;
use App\Models\ServiceBooking;
use App\Services\Booking\CancellationException;
use App\Services\Booking\MemberCancellation;
use App\Services\StripeService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Mockery;
use Stripe\PaymentIntent;
use Stripe\Refund;
use Tests\Concerns\SeedsDiscountFixture;
use Tests\Concerns\SeedsPointsFixture;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\Concerns\SetsUpServiceBookingSchema;
use Tests\Concerns\SetsUpStayBookingSchema;
use Tests\TestCase;

class MemberCancellationTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema, SetsUpServiceBookingSchema, SetsUpStayBookingSchema, SeedsDiscountFixture, SeedsPointsFixture;

    protected $stripe;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpMinimalSchema();
        $this->setUpLoyaltyAwardSchema();
        $this->setUpServiceBookingSchema();
        $this->setUpStayBookingSchema();
        $this->setUpDiscountTables();

        $fixture = $this->seedPointsFixture();
        $this->orgId = $fixture['orgId'];
        $this->member = $fixture['member'];

        $this->stripe = Mockery::mock(StripeService::class);
        $this->stripe->shouldReceive('isEnabled')->andReturn(true)->byDefault();
        $this->app->instance(StripeService::class, $this->stripe);
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        Mockery::close();
        parent::tearDown();
    }

    protected function cancellation(): MemberCancellation
    {
        return $this->app->make(MemberCancellation::class);
    }

    protected function appointment(array $attrs = []): ServiceBooking
    {
        return $this->pointsBooking($this->orgId, $this->member, array_merge([
            'status' => 'confirmed', 'payment_status' => 'unpaid',
            'start_at' => now()->addDays(3), 'end_at' => now()->addDays(3)->addMinutes(45),
        ], $attrs));
    }

    public function test_an_unpaid_appointment_is_cancelled_with_nothing_to_return(): void
    {
        $this->stripe->shouldNotReceive('retrievePaymentIntent');
        $b = $this->appointment();

        $out = $this->cancellation()->cancelService($this->orgId, $b->id);

        $this->assertSame('service', $out->kind);
        $this->assertSame('none', $out->money);
        $fresh = $b->fresh();
        $this->assertSame('cancelled', $fresh->status);
        $this->assertSame('member_portal', $fresh->cancellation_reason);
        $this->assertNotNull($fresh->cancelled_at);
        $this->assertSame('unpaid', $fresh->payment_status);
        $this->assertSame(['outcome' => 'none', 'amount' => 0.0, 'currency' => 'EUR', 'coupon_released' => false, 'points_reversed' => 0], $out->toArray());
    }

    public function test_a_held_card_is_released_and_a_captured_payment_refunded(): void
    {
        $held = $this->appointment(['payment_status' => 'authorized', 'stripe_payment_intent_id' => 'pi_held']);
        $paid = $this->appointment(['payment_status' => 'paid', 'stripe_payment_intent_id' => 'pi_paid', 'start_at' => now()->addDays(4), 'end_at' => now()->addDays(4)->addMinutes(45)]);
        $this->stripe->shouldReceive('retrievePaymentIntent')->with('pi_held')->andReturn(PaymentIntent::constructFrom(['id' => 'pi_held', 'status' => 'requires_capture']));
        $this->stripe->shouldReceive('cancelPaymentIntent')->once()->with('pi_held', 'requested_by_customer')->andReturn(PaymentIntent::constructFrom(['id' => 'pi_held', 'status' => 'canceled']));
        $this->stripe->shouldReceive('retrievePaymentIntent')->with('pi_paid')->andReturn(PaymentIntent::constructFrom(['id' => 'pi_paid', 'status' => 'succeeded']));
        $this->stripe->shouldReceive('refund')->once()->with('pi_paid', null, 'requested_by_customer')->andReturn(Refund::constructFrom(['id' => 're_9', 'status' => 'succeeded']));

        $a = $this->cancellation()->cancelService($this->orgId, $held->id);
        $b = $this->cancellation()->cancelService($this->orgId, $paid->id);

        $this->assertSame('released', $a->money);
        $this->assertSame('cancelled', $held->fresh()->payment_status);
        $this->assertSame('refunded', $b->money);
        $this->assertSame(54.0, $b->amount);
        $this->assertSame('refunded', $paid->fresh()->payment_status);
        $this->assertSame('re_9', $paid->fresh()->last_refund_id);
        $this->assertEquals(54.0, (float) $paid->fresh()->refunded_amount);
    }

    public function test_a_refund_that_fails_leaves_the_booking_exactly_as_it_was(): void
    {
        $claim = $this->claimedOffer('fixed_amount', 6);
        $claim->forceFill(['used_at' => now(), 'status' => 'used', 'used_reference' => 'SVC-KEEP0001'])->save();
        $b = $this->appointment(['booking_reference' => 'SVC-KEEP0001', 'payment_status' => 'paid', 'stripe_payment_intent_id' => 'pi_paid', 'discount_source' => 'offer', 'discount_source_id' => $claim->id]);
        $this->stripe->shouldReceive('retrievePaymentIntent')->andReturn(PaymentIntent::constructFrom(['id' => 'pi_paid', 'status' => 'succeeded']));
        $this->stripe->shouldReceive('refund')->andThrow(new \RuntimeException('stripe down'));

        try {
            $this->cancellation()->cancelService($this->orgId, $b->id);
            $this->fail('a failed refund must not cancel');
        } catch (CancellationException $e) {
            $this->assertSame('refund_failed', $e->errorCode);
        }

        $this->assertSame('confirmed', $b->fresh()->status);
        $this->assertSame('paid', $b->fresh()->payment_status);
        $this->assertNotNull(MemberOffer::findOrFail($claim->id)->used_at, 'the coupon stays used while the booking stands');
    }

    public function test_the_offer_coupon_comes_back_only_when_this_booking_used_it(): void
    {
        $claim = $this->claimedOffer('fixed_amount', 6);
        $claim->forceFill(['used_at' => now(), 'status' => 'used', 'used_reference' => 'SVC-MINE0001'])->save();
        $mine = $this->appointment(['booking_reference' => 'SVC-MINE0001', 'discount_source' => 'offer', 'discount_source_id' => $claim->id]);

        $out = $this->cancellation()->cancelService($this->orgId, $mine->id);

        $this->assertTrue($out->couponReleased);
        $back = MemberOffer::findOrFail($claim->id);
        $this->assertNull($back->used_at);
        $this->assertSame('claimed', $back->status);
        $this->assertNull($back->used_reference);

        // The same claim, used at the counter since (no reference, or another booking's).
        $claim->forceFill(['used_at' => now(), 'status' => 'used', 'used_reference' => 'SVC-OTHER001'])->save();
        $other = $this->appointment(['booking_reference' => 'SVC-THIS0002', 'discount_source' => 'offer', 'discount_source_id' => $claim->id, 'start_at' => now()->addDays(5), 'end_at' => now()->addDays(5)->addMinutes(45)]);

        $again = $this->cancellation()->cancelService($this->orgId, $other->id);

        $this->assertFalse($again->couponReleased);
        $this->assertSame('SVC-OTHER001', MemberOffer::findOrFail($claim->id)->used_reference);
    }

    public function test_a_reward_code_comes_back_as_pending(): void
    {
        $red = $this->redemption('fixed_amount', 10);
        $red->forceFill(['status' => RewardRedemption::STATUS_FULFILLED, 'fulfilled_at' => now(), 'notes' => 'Applied to SVC-RWD00001'])->save();
        $b = $this->appointment(['booking_reference' => 'SVC-RWD00001', 'discount_source' => 'reward', 'discount_source_id' => $red->id]);

        $out = $this->cancellation()->cancelService($this->orgId, $b->id);

        $this->assertTrue($out->couponReleased);
        $back = RewardRedemption::findOrFail($red->id);
        $this->assertSame(RewardRedemption::STATUS_PENDING, $back->status);
        $this->assertNull($back->fulfilled_at);
        $this->assertNull($back->notes);
    }

    public function test_a_tier_benefit_has_nothing_to_release(): void
    {
        $b = $this->appointment(['discount_source' => 'tier_benefit', 'discount_source_id' => 3]);
        $this->assertFalse($this->cancellation()->cancelService($this->orgId, $b->id)->couponReleased);
    }

    public function test_points_already_awarded_for_the_booking_are_reversed(): void
    {
        $b = $this->appointment();
        $tx = app(\App\Services\LoyaltyService::class)->awardPoints($this->member, 810, 'Appointment', 'earn', null, 'service_booking', $b->id, 54.0, null, null, 'booking_completed', 'service_booking', (string) $b->id, "booking_points_service_{$b->id}");

        $out = $this->cancellation()->cancelService($this->orgId, $b->id);

        $this->assertSame(810, $out->pointsReversed);
        $this->assertTrue((bool) PointsTransaction::findOrFail($tx->id)->is_reversed);
        $this->assertSame(0, (int) $this->member->fresh()->current_points);
    }

    public function test_the_window_the_state_and_the_organisation_are_enforced(): void
    {
        $cases = [
            'outside_policy'    => $this->appointment(['start_at' => now()->addHours(5), 'end_at' => now()->addHours(6)]),
            'not_cancellable'   => $this->appointment(['status' => 'completed']),
            'already_cancelled' => $this->appointment(['status' => 'cancelled']),
        ];
        foreach ($cases as $code => $booking) {
            try {
                $this->cancellation()->cancelService($this->orgId, $booking->id);
                $this->fail($code);
            } catch (CancellationException $e) {
                $this->assertSame($code, $e->errorCode);
            }
        }

        $b = $this->appointment();
        try {
            $this->cancellation()->cancelService($this->orgId + 1, $b->id);
            $this->fail('another organisation');
        } catch (CancellationException $e) {
            $this->assertSame('not_found', $e->errorCode);
        }
        $this->assertSame('confirmed', $b->fresh()->status);
    }
}
```

- [ ] **Step 4: Run them to see them fail**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Booking/ServiceBookingRefundTest.php tests/Feature/Booking/MemberCancellationTest.php --no-ansi`
Expected: FAIL — `Class "App\Services\Booking\ServiceBookingRefund" not found`.

- [ ] **Step 5: The value classes**

Create `app/Services/Booking/CancellationException.php`:

```php
<?php

namespace App\Services\Booking;

/** A cancellation the portal cannot make, with the code and status it answers. */
final class CancellationException extends \RuntimeException
{
    public function __construct(public readonly string $errorCode, string $message, public readonly int $status)
    {
        parent::__construct($message);
    }
}
```

Create `app/Services/Booking/CancellationOutcome.php`:

```php
<?php

namespace App\Services\Booking;

use App\Models\BookingMirror;
use App\Models\ServiceBooking;

/** What a member's cancellation did: to the booking, the money, the coupon and the points. */
final readonly class CancellationOutcome
{
    /**
     * @param 'service'|'stay' $kind
     * @param 'none'|'released'|'refunded' $money  nothing was taken online; a hold on the card was let go; a payment was refunded
     * @param bool $memberMailed  the refund's own mail already told the member (a refunded stay)
     */
    public function __construct(
        public string $kind,
        public ServiceBooking|BookingMirror $booking,
        public string $money,
        public float $amount,
        public string $currency,
        public bool $couponReleased,
        public int $pointsReversed,
        public bool $memberMailed = false,
    ) {}

    public function toArray(): array
    {
        return [
            'outcome'         => $this->money,
            'amount'          => $this->amount,
            'currency'        => $this->currency,
            'coupon_released' => $this->couponReleased,
            'points_reversed' => $this->pointsReversed,
        ];
    }
}
```

Create `app/Services/Booking/CouponRelease.php`:

```php
<?php

namespace App\Services\Booking;

use App\Models\MemberOffer;
use App\Models\RewardRedemption;

/**
 * Gives a coupon back when the booking that used it is cancelled — and only
 * then: the row must still say it was used by THIS booking. A claim can
 * also be marked used at the counter (no reference) or by a later booking,
 * and neither is this cancellation's to undo.
 *
 * `special_offers.times_used` counts claims, not uses, and is not touched.
 */
final class CouponRelease
{
    public function release(?string $source, ?int $sourceId, string $reference): bool
    {
        if (!$sourceId || $reference === '') {
            return false;
        }

        if ($source === 'offer') {
            return MemberOffer::whereKey($sourceId)
                ->where('used_reference', $reference)
                ->update(['used_at' => null, 'status' => 'claimed', 'used_reference' => null]) === 1;
        }

        if ($source === 'reward') {
            return RewardRedemption::whereKey($sourceId)
                ->where('status', RewardRedemption::STATUS_FULFILLED)
                ->where('notes', "Applied to {$reference}")
                ->update(['status' => RewardRedemption::STATUS_PENDING, 'fulfilled_at' => null, 'notes' => null]) === 1;
        }

        return false;
    }
}
```

- [ ] **Step 6: `ServiceBookingRefund`**

Create `app/Services/Booking/ServiceBookingRefund.php`:

```php
<?php

namespace App\Services\Booking;

use App\Models\ServiceBooking;
use App\Services\StripeService;
use Illuminate\Support\Facades\Log;

/**
 * Returns the money of a service booking that is being cancelled: lets go
 * of a card that is only held, refunds a payment that was taken. Decides
 * by what Stripe says the payment is now, not by what the row last heard.
 *
 * Returns the columns the booking should store; writes nothing itself, so
 * the caller can store them together with the cancellation. Safe to call
 * again after a failure further on: a hold already let go is recorded as
 * such, and Stripe answers a repeated full refund of the same payment with
 * the first one (StripeService::refund()'s idempotency key).
 */
final class ServiceBookingRefund
{
    public function __construct(private readonly StripeService $stripe) {}

    /**
     * @return array{money: 'none'|'released'|'refunded', amount: float, columns: array}
     *
     * @throws CancellationException
     */
    public function giveBack(ServiceBooking $b): array
    {
        $pi = (string) $b->stripe_payment_intent_id;
        if ($pi === '' || str_starts_with($pi, 'pi_mock_')) {
            return ['money' => 'none', 'amount' => 0.0, 'columns' => []];
        }
        if (!$this->stripe->isEnabled()) {
            throw new CancellationException('refund_unavailable', 'Online payments are switched off at this venue, so the payment cannot be returned here. Please contact the venue.', 409);
        }

        $amount = round((float) $b->total_amount, 2);
        try {
            $status = (string) ($this->stripe->retrievePaymentIntent($pi)->status ?? '');

            if ($status === 'canceled') {
                return ['money' => 'released', 'amount' => $amount, 'columns' => ['payment_status' => 'cancelled']];
            }
            if ($status === 'succeeded') {
                $refund = $this->stripe->refund($pi, null, 'requested_by_customer');

                return ['money' => 'refunded', 'amount' => $amount, 'columns' => [
                    'payment_status'  => 'refunded',
                    'refunded_amount' => $amount,
                    'refunded_at'     => now(),
                    'last_refund_id'  => (string) ($refund->id ?? ''),
                ]];
            }

            // requires_capture (a held card) and every unfinished state.
            $this->stripe->cancelPaymentIntent($pi, 'requested_by_customer');

            return ['money' => 'released', 'amount' => $amount, 'columns' => ['payment_status' => 'cancelled']];
        } catch (CancellationException $e) {
            throw $e;
        } catch (\Throwable $e) {
            Log::error('portal.service_refund_failed', ['org' => $b->organization_id, 'booking' => $b->id, 'payment_intent' => $pi, 'error' => $e->getMessage()]);
            throw new CancellationException('refund_failed', 'We could not return the payment just now, so the booking was not cancelled. Please try again in a moment.', 502);
        }
    }
}
```

- [ ] **Step 7: `MemberCancellation::cancelService()`**

Create `app/Services/Booking/MemberCancellation.php`:

```php
<?php

namespace App\Services\Booking;

use App\Models\PointsTransaction;
use App\Models\ServiceBooking;
use App\Services\LoyaltyService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * A member cancels their own booking. The order is the point: under a lock
 * on the booking, the policy is checked, then the money is returned, and
 * only then is the booking cancelled and its coupon given back. A payment
 * that cannot be returned leaves the booking standing (plan3-9).
 *
 * Whose booking it is, is the caller's to establish (MemberBookingQuery);
 * this class is told which organisation it must belong to.
 */
final class MemberCancellation
{
    public const REASON = 'member_portal';

    public function __construct(
        private readonly ServiceBookingRefund $serviceRefund,
        private readonly CouponRelease $coupons,
        private readonly LoyaltyService $loyalty,
    ) {}

    /** @throws CancellationException */
    public function cancelService(int $orgId, int $bookingId): CancellationOutcome
    {
        return DB::transaction(function () use ($orgId, $bookingId) {
            $b = ServiceBooking::withoutGlobalScopes()
                ->where('organization_id', $orgId)
                ->whereKey($bookingId)
                ->lockForUpdate()
                ->first();
            if (!$b) {
                throw new CancellationException('not_found', 'We could not find that booking.', 404);
            }
            $this->assertAllowed(CancellationPolicy::forService($b));

            $money = $this->serviceRefund->giveBack($b);

            $b->forceFill([
                'status'              => 'cancelled',
                'cancelled_at'        => now(),
                'cancellation_reason' => self::REASON,
            ] + $money['columns'])->save();

            return new CancellationOutcome(
                kind: 'service',
                booking: $b,
                money: $money['money'],
                amount: $money['amount'],
                currency: strtoupper((string) ($b->currency ?: 'EUR')),
                couponReleased: $this->coupons->release($b->discount_source, $b->discount_source_id ? (int) $b->discount_source_id : null, (string) $b->booking_reference),
                pointsReversed: $this->reversePoints('service_booking', (int) $b->id, "Appointment {$b->booking_reference} cancelled"),
            );
        });
    }

    /** @throws CancellationException */
    private function assertAllowed(array $policy): void
    {
        if ($policy['can_cancel']) {
            return;
        }
        throw match ($policy['reason']) {
            CancellationPolicy::ALREADY_CANCELLED => new CancellationException('already_cancelled', 'This booking is already cancelled.', 409),
            CancellationPolicy::OUTSIDE_POLICY    => new CancellationException('outside_policy', 'Free cancellation has ended for this booking. Please contact the venue.', 422),
            default                               => new CancellationException('not_cancellable', 'This booking cannot be cancelled here. Please contact the venue.', 422),
        };
    }

    /** Reverses every point the ledger awarded for this booking; returns how many. A reversal that fails is logged, never the cancellation's failure. */
    private function reversePoints(string $referenceType, int $referenceId, string $reason): int
    {
        $total = 0;
        $rows = PointsTransaction::withoutGlobalScopes()
            ->where('reference_type', $referenceType)
            ->where('reference_id', $referenceId)
            ->where('points', '>', 0)
            ->where('is_reversed', false)
            ->get();
        foreach ($rows as $tx) {
            try {
                $this->loyalty->reverseTransaction($tx, $reason);
                $total += (int) $tx->points;
            } catch (\Throwable $e) {
                Log::warning('portal.cancel_points_reversal_failed', ['transaction' => $tx->id, 'error' => $e->getMessage()]);
            }
        }

        return $total;
    }
}
```

- [ ] **Step 8: Run the tests**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Booking/ServiceBookingRefundTest.php tests/Feature/Booking/MemberCancellationTest.php --no-ansi`
Expected: refund `Tests:    7 passed`, cancellation `Tests:    8 passed`.

`test_a_refund_that_fails_leaves_the_booking_exactly_as_it_was` relies on the transaction rolling back; under `DatabaseTransactions` the inner transaction is a savepoint and rolls back the same way.

- [ ] **Step 9: Commit**

```bash
git add app/Services/Booking/CancellationException.php app/Services/Booking/CancellationOutcome.php app/Services/Booking/CouponRelease.php app/Services/Booking/ServiceBookingRefund.php app/Services/Booking/MemberCancellation.php tests/Concerns/SetsUpServiceBookingSchema.php tests/Feature/Booking/ServiceBookingRefundTest.php tests/Feature/Booking/MemberCancellationTest.php
git commit -m "Cancel a member's appointment: the money back first, then the booking and its coupon

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: Cancelling a stay

**Files:**
- Modify: `app/Services/Booking/MemberCancellation.php`
- Test: `tests/Feature/Booking/MemberCancellationTest.php` (add)

**Interfaces:**
- Consumes: `CancellationPolicy::forStay()` (Task 10); `BookingRefundService::applyRefund(BookingMirror $mirror, ?float $amount = null, ?string $reason = null, ?string $stripeRefundId = null, bool $issueStripeRefund = true, ?User $staff = null): array{is_full: bool, refund_id: ?string, reversed_points: int, pms_cancelled: bool, email_sent: bool}` (throws `\RuntimeException`); `SmoobuClient::cancelReservation(string $reservationId): array`; `StripeService` as in Task 11.
- Produces: `MemberCancellation::cancelStay(int $orgId, int $mirrorId): CancellationOutcome` — same errors as `cancelService()` plus `cancel_in_progress` 409. The constructor gains `StripeService $stripe`, `BookingRefundService $stayRefund`, `SmoobuClient $smoobu`.

How the money of a stay is returned, by what Stripe says the payment is now:

| The stay's payment | What happens | `money` | `payment_status` afterwards |
|---|---|---|---|
| none online (`pay_at_venue`, no intent, mock) | nothing | `none` | unchanged |
| a held card (`requires_capture`) or unfinished | the intent is cancelled | `released` | `cancelled` |
| Stripe already let it go (`canceled`) | nothing | `released` | `cancelled` |
| taken (`succeeded`) | `BookingRefundService::applyRefund()` — Stripe refund, points reversal, PMS cancellation, refund mail, audit | `refunded` | `refunded` |

For the first three rows this class cancels the reservation at the PMS itself; a PMS that refuses is audited and does not stop the cancellation (the sync keeps a cancellation made here, Task 3).

- [ ] **Step 1: Write the failing tests**

Add to `tests/Feature/Booking/MemberCancellationTest.php` (imports: `use App\Models\AuditLog;`, `use App\Models\BookingMirror;`, `use App\Mail\BookingRefundMail;`, `use App\Services\SmoobuClient;`, `use Illuminate\Support\Facades\Mail;`). In `setUp()`, after the Stripe mock, add:

```php
        $this->smoobu = Mockery::mock(SmoobuClient::class);
        $this->app->instance(SmoobuClient::class, $this->smoobu);
        Mail::fake();
```

and the property `protected $smoobu;`. Then:

```php
    protected function stay(array $attrs = []): BookingMirror
    {
        static $n = 0;
        $n++;
        return BookingMirror::withoutGlobalScopes()->create(array_merge([
            'organization_id' => $this->orgId, 'reservation_id' => (string) (880000 + $n), 'booking_reference' => 'BK-CANCEL' . $n,
            'booking_state' => 'confirmed', 'internal_status' => 'confirmed', 'apartment_id' => '101', 'apartment_name' => 'Sea view',
            'channel_name' => 'Member portal', 'member_id' => $this->member->id, 'guest_name' => 'Ada Lovelace', 'guest_email' => 'ada@example.test',
            'arrival_date' => now()->addDays(10)->toDateString(), 'departure_date' => now()->addDays(12)->toDateString(),
            'price_total' => 180, 'list_total' => 200, 'discount_amount' => 20, 'payment_status' => 'open', 'payment_method' => 'pay_at_venue',
        ], $attrs));
    }

    protected function freshStay(BookingMirror $m): BookingMirror
    {
        return BookingMirror::withoutGlobalScopes()->findOrFail($m->id);
    }

    public function test_a_stay_paid_at_the_venue_is_cancelled_here_and_at_the_pms(): void
    {
        $this->stripe->shouldNotReceive('retrievePaymentIntent');
        $m = $this->stay();
        $this->smoobu->shouldReceive('cancelReservation')->once()->with($m->reservation_id)->andReturn([]);

        $out = $this->cancellation()->cancelStay($this->orgId, $m->id);

        $this->assertSame('stay', $out->kind);
        $this->assertSame('none', $out->money);
        $this->assertFalse($out->memberMailed);
        $fresh = $this->freshStay($m);
        $this->assertSame('cancelled', $fresh->internal_status);
        $this->assertSame('cancelled', $fresh->booking_state);
        $this->assertSame('member_portal', $fresh->cancellation_reason);
        $this->assertNotNull($fresh->cancelled_at);
        $this->assertSame('open', $fresh->payment_status);
    }

    public function test_a_held_card_on_a_stay_is_released(): void
    {
        $m = $this->stay(['payment_status' => 'authorized', 'payment_method' => 'stripe', 'stripe_payment_intent_id' => 'pi_stay']);
        $this->stripe->shouldReceive('retrievePaymentIntent')->with('pi_stay')->andReturn(PaymentIntent::constructFrom(['id' => 'pi_stay', 'status' => 'requires_capture']));
        $this->stripe->shouldReceive('cancelPaymentIntent')->once()->with('pi_stay', 'requested_by_customer')->andReturn(PaymentIntent::constructFrom(['id' => 'pi_stay', 'status' => 'canceled']));
        $this->stripe->shouldNotReceive('refund');
        $this->smoobu->shouldReceive('cancelReservation')->once()->andReturn([]);

        $out = $this->cancellation()->cancelStay($this->orgId, $m->id);

        $this->assertSame('released', $out->money);
        $this->assertSame(180.0, $out->amount);
        $this->assertSame('cancelled', $this->freshStay($m)->payment_status);
        $this->assertSame('cancelled', $this->freshStay($m)->internal_status);
    }

    public function test_a_paid_stay_is_refunded_through_the_refund_service(): void
    {
        $m = $this->stay(['payment_status' => 'paid', 'payment_method' => 'stripe', 'stripe_payment_intent_id' => 'pi_stay', 'price_paid' => 180]);
        $tx = app(\App\Services\LoyaltyService::class)->awardPoints($this->member, 2700, 'Stay', 'earn', null, 'booking_mirror', $m->id, 180.0, null, null, 'booking_completed', 'booking_mirror', (string) $m->id, "booking_points_stay_{$m->id}");
        $this->stripe->shouldReceive('retrievePaymentIntent')->with('pi_stay')->andReturn(PaymentIntent::constructFrom(['id' => 'pi_stay', 'status' => 'succeeded']));
        $this->stripe->shouldReceive('refund')->once()->with('pi_stay', null, 'requested_by_customer')->andReturn(Refund::constructFrom(['id' => 're_stay', 'status' => 'succeeded']));
        $this->smoobu->shouldReceive('cancelReservation')->once()->with($m->reservation_id)->andReturn([]);

        $out = $this->cancellation()->cancelStay($this->orgId, $m->id);

        $this->assertSame('refunded', $out->money);
        $this->assertSame(180.0, $out->amount);
        $this->assertSame(2700, $out->pointsReversed);
        $this->assertTrue($out->memberMailed);
        $fresh = $this->freshStay($m);
        $this->assertSame('refunded', $fresh->payment_status);
        $this->assertSame('re_stay', $fresh->last_refund_id);
        $this->assertSame('cancelled', $fresh->internal_status);
        $this->assertSame('member_portal', $fresh->cancellation_reason);
        $this->assertTrue((bool) PointsTransaction::findOrFail($tx->id)->is_reversed);
        Mail::assertQueued(BookingRefundMail::class, 1);
    }

    public function test_a_refund_that_fails_leaves_the_stay_standing(): void
    {
        $claim = $this->claimedOffer('fixed_amount', 20);
        $m = $this->stay(['payment_status' => 'paid', 'payment_method' => 'stripe', 'stripe_payment_intent_id' => 'pi_stay', 'discount_source' => 'offer', 'discount_source_id' => $claim->id]);
        $claim->forceFill(['used_at' => now(), 'status' => 'used', 'used_reference' => $m->booking_reference])->save();
        $this->stripe->shouldReceive('retrievePaymentIntent')->andReturn(PaymentIntent::constructFrom(['id' => 'pi_stay', 'status' => 'succeeded']));
        $this->stripe->shouldReceive('refund')->andThrow(new \RuntimeException('stripe down'));
        $this->smoobu->shouldNotReceive('cancelReservation');

        try {
            $this->cancellation()->cancelStay($this->orgId, $m->id);
            $this->fail('a failed refund must not cancel');
        } catch (CancellationException $e) {
            $this->assertSame('refund_failed', $e->errorCode);
            $this->assertSame(502, $e->status);
        }

        $fresh = $this->freshStay($m);
        $this->assertSame('confirmed', $fresh->internal_status);
        $this->assertSame('paid', $fresh->payment_status);
        $this->assertNull($fresh->cancelled_at);
        $this->assertNotNull(MemberOffer::findOrFail($claim->id)->used_at);
    }

    public function test_a_pms_that_refuses_is_audited_and_the_stay_is_still_cancelled(): void
    {
        $m = $this->stay();
        $this->smoobu->shouldReceive('cancelReservation')->once()->andThrow(new \RuntimeException('Smoobu API error: 500'));

        $this->cancellation()->cancelStay($this->orgId, $m->id);

        $this->assertSame('cancelled', $this->freshStay($m)->internal_status);
        $this->assertSame(1, AuditLog::withoutGlobalScopes()->where('action', 'booking.pms.cancel_failed')->where('subject_id', $m->id)->count());
    }

    public function test_a_stay_the_pms_never_received_is_not_cancelled_there(): void
    {
        $this->smoobu->shouldNotReceive('cancelReservation');
        $m = $this->stay(['reservation_id' => 'LOCAL-ABCDEFGHIJ', 'internal_status' => 'pending_pms_sync']);

        $this->cancellation()->cancelStay($this->orgId, $m->id);

        $this->assertSame('cancelled', $this->freshStay($m)->internal_status);
    }

    public function test_the_stays_coupon_comes_back(): void
    {
        $claim = $this->claimedOffer('fixed_amount', 20);
        $m = $this->stay(['discount_source' => 'offer', 'discount_source_id' => $claim->id]);
        $claim->forceFill(['used_at' => now(), 'status' => 'used', 'used_reference' => $m->booking_reference])->save();
        $this->smoobu->shouldReceive('cancelReservation')->andReturn([]);

        $this->assertTrue($this->cancellation()->cancelStay($this->orgId, $m->id)->couponReleased);
        $this->assertNull(MemberOffer::findOrFail($claim->id)->used_at);
    }

    public function test_a_stay_outside_its_window_on_another_channel_or_in_a_group_is_refused(): void
    {
        $this->smoobu->shouldNotReceive('cancelReservation');
        $cases = [
            'outside_policy'    => $this->stay(['arrival_date' => now()->addDay()->toDateString(), 'departure_date' => now()->addDays(3)->toDateString()]),
            'not_cancellable'   => $this->stay(['channel_name' => 'Booking.com', 'payment_status' => 'channel_managed']),
            'already_cancelled' => $this->stay(['internal_status' => 'cancelled', 'booking_state' => 'cancelled']),
        ];
        foreach ($cases as $code => $stay) {
            try {
                $this->cancellation()->cancelStay($this->orgId, $stay->id);
                $this->fail($code);
            } catch (CancellationException $e) {
                $this->assertSame($code, $e->errorCode);
            }
        }

        try {
            $this->cancellation()->cancelStay($this->orgId, $this->stay(['booking_group_id' => 'a3f0c2de-0000-4000-8000-000000000001'])->id);
            $this->fail('a combination is the venue\'s to cancel');
        } catch (CancellationException $e) {
            $this->assertSame('not_cancellable', $e->errorCode);
        }
    }

    public function test_payments_switched_off_since_the_stay_was_paid_cannot_return_money(): void
    {
        $this->stripe->shouldReceive('isEnabled')->andReturn(false);
        $this->smoobu->shouldNotReceive('cancelReservation');
        $m = $this->stay(['payment_status' => 'paid', 'payment_method' => 'stripe', 'stripe_payment_intent_id' => 'pi_stay']);

        try {
            $this->cancellation()->cancelStay($this->orgId, $m->id);
            $this->fail('no Stripe, no refund');
        } catch (CancellationException $e) {
            $this->assertSame('refund_unavailable', $e->errorCode);
        }
        $this->assertSame('confirmed', $this->freshStay($m)->internal_status);
    }
```

`BookingRefundService` writes a `refund_attempts` row and takes a cache lock; both exist in the test schema (`setUpBookingRefundSchema()`, the array cache store).

- [ ] **Step 2: Run them to see them fail**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Booking/MemberCancellationTest.php --no-ansi`
Expected: FAIL — `Call to undefined method …::cancelStay()`.

- [ ] **Step 3: `cancelStay()`**

In `app/Services/Booking/MemberCancellation.php` add the imports `use App\Models\AuditLog;`, `use App\Models\BookingMirror;`, `use App\Models\HotelSetting;`, `use App\Services\BookingRefundService;`, `use App\Services\SmoobuClient;`, `use App\Services\StripeService;`, `use Illuminate\Support\Facades\Cache;`; replace the constructor with

```php
    public function __construct(
        private readonly ServiceBookingRefund $serviceRefund,
        private readonly CouponRelease $coupons,
        private readonly LoyaltyService $loyalty,
        private readonly StripeService $stripe,
        private readonly BookingRefundService $stayRefund,
        private readonly SmoobuClient $smoobu,
    ) {}
```

and add after `cancelService()`:

```php
    /**
     * A stay is not cancelled inside one database transaction: its refund
     * (BookingRefundService) talks to Stripe and the PMS and keeps its own
     * record of each attempt, which must survive a failure. A lock on the
     * stay makes a second cancel wait out the first instead.
     *
     * @throws CancellationException
     */
    public function cancelStay(int $orgId, int $mirrorId): CancellationOutcome
    {
        $lock = Cache::lock("portal-cancel:stay:{$mirrorId}", 60);
        if (!$lock->get()) {
            throw new CancellationException('cancel_in_progress', 'This booking is being cancelled. Please check it again in a moment.', 409);
        }

        try {
            $m = BookingMirror::withoutGlobalScopes()->where('organization_id', $orgId)->whereKey($mirrorId)->first();
            if (!$m) {
                throw new CancellationException('not_found', 'We could not find that booking.', 404);
            }
            $this->assertAllowed(CancellationPolicy::forStay($m));

            $money = $this->stayMoney($m);
            $reference = (string) ($m->booking_reference ?: $m->reservation_id);

            return DB::transaction(function () use ($m, $money, $reference) {
                $m = BookingMirror::withoutGlobalScopes()->whereKey($m->id)->lockForUpdate()->firstOrFail();
                $m->forceFill([
                    'internal_status'     => 'cancelled',
                    'booking_state'       => 'cancelled',
                    'cancelled_at'        => now(),
                    'cancellation_reason' => self::REASON,
                ] + $money['columns'])->save();

                return new CancellationOutcome(
                    kind: 'stay',
                    booking: $m,
                    money: $money['money'],
                    amount: $money['amount'],
                    currency: strtoupper((string) HotelSetting::getValue('booking_currency', 'EUR')),
                    couponReleased: $this->coupons->release($m->discount_source, $m->discount_source_id ? (int) $m->discount_source_id : null, $reference),
                    // A refund reverses the points itself; the other paths do it here.
                    pointsReversed: $money['points'] + $this->reversePoints('booking_mirror', (int) $m->id, "Stay {$reference} cancelled"),
                    memberMailed: $money['mailed'],
                );
            });
        } finally {
            $lock->release();
        }
    }

    /**
     * @return array{money: 'none'|'released'|'refunded', amount: float, columns: array, points: int, mailed: bool}
     *
     * @throws CancellationException
     */
    private function stayMoney(BookingMirror $m): array
    {
        $pi = (string) $m->stripe_payment_intent_id;
        $amount = round((float) $m->price_total, 2);

        if ($pi === '' || str_starts_with($pi, 'pi_mock_') || $m->payment_method === 'mock') {
            $this->cancelAtPms($m);
            return ['money' => 'none', 'amount' => 0.0, 'columns' => [], 'points' => 0, 'mailed' => false];
        }
        if (!$this->stripe->isEnabled()) {
            throw new CancellationException('refund_unavailable', 'Online payments are switched off at this venue, so the payment cannot be returned here. Please contact the venue.', 409);
        }

        try {
            $status = (string) ($this->stripe->retrievePaymentIntent($pi)->status ?? '');

            if ($status === 'succeeded') {
                // Stripe refund, points reversal, PMS cancellation, the member's refund mail and the audit row.
                $done = $this->stayRefund->applyRefund($m, null, 'requested_by_customer', null, true, null);

                return ['money' => 'refunded', 'amount' => $amount, 'columns' => [], 'points' => (int) $done['reversed_points'], 'mailed' => (bool) $done['email_sent']];
            }
            if ($status !== 'canceled') {
                $this->stripe->cancelPaymentIntent($pi, 'requested_by_customer');
            }
        } catch (CancellationException $e) {
            throw $e;
        } catch (\Throwable $e) {
            Log::error('portal.stay_refund_failed', ['org' => $m->organization_id, 'mirror' => $m->id, 'payment_intent' => $pi, 'error' => $e->getMessage()]);
            throw new CancellationException('refund_failed', 'We could not return the payment just now, so the booking was not cancelled. Please try again in a moment.', 502);
        }

        $this->cancelAtPms($m);

        return ['money' => 'released', 'amount' => $amount, 'columns' => ['payment_status' => 'cancelled'], 'points' => 0, 'mailed' => false];
    }

    /** Best effort: a PMS that refuses is the venue's to clear up, never the member's failure. */
    private function cancelAtPms(BookingMirror $m): void
    {
        $id = (string) $m->reservation_id;
        if ($id === '' || str_starts_with($id, 'LOCAL-') || $m->payment_method === 'mock') {
            return;
        }
        try {
            $this->smoobu->cancelReservation($id);
        } catch (\Throwable $e) {
            Log::warning('portal.stay_pms_cancel_failed', ['mirror' => $m->id, 'reservation' => $id, 'error' => $e->getMessage()]);
            try {
                AuditLog::create([
                    'organization_id' => (int) $m->organization_id,
                    'action'          => 'booking.pms.cancel_failed',
                    'subject_type'    => 'booking_mirror',
                    'subject_id'      => $m->id,
                    'new_values'      => ['reservation_id' => $id, 'error' => mb_substr($e->getMessage(), 0, 500), 'source' => self::REASON],
                    'description'     => "The member cancelled stay #{$m->id} but the PMS refused the cancellation — cancel reservation {$id} in Smoobu",
                ]);
            } catch (\Throwable) {
                // best effort
            }
        }
    }
```

`BookingRefundService::applyRefund()` wraps a Stripe failure in (or rethrows it as) a `\RuntimeException`; the `catch (\Throwable)` above turns either into `refund_failed`.

- [ ] **Step 4: Run the tests**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Booking/MemberCancellationTest.php tests/Feature/Booking/BookingRefundServiceTest.php tests/Feature/Booking/BookingRefundServiceComboTest.php --no-ansi`
Expected: all pass (`MemberCancellationTest` at 17).

- [ ] **Step 5: Commit**

```bash
git add app/Services/Booking/MemberCancellation.php tests/Feature/Booking/MemberCancellationTest.php
git commit -m "Cancel a member's stay: release the hold or refund, then the PMS and the coupon

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: The cancel endpoint, and what the member and the venue hear

**Files:**
- Create: `app/Mail/BookingCancelledMail.php`, `app/Mail/AdminBookingCancelledMail.php`, `resources/views/emails/booking-cancelled.blade.php`, `resources/views/emails/admin-booking-cancelled.blade.php`, `app/Services/Booking/PortalCancellationNotifier.php`
- Modify: `app/Http/Controllers/Api/V1/Member/Portal/PortalBookingController.php`, `routes/api.php`
- Test: `tests/Feature/Member/Portal/PortalCancellationTest.php`, `tests/Feature/Mail/BookingCancelledMailTest.php`

**Interfaces:**
- Consumes: `MemberCancellation::cancelService()`, `::cancelStay()`, `CancellationOutcome`, `CancellationException` (Tasks 11–12); `MemberBookingQuery::find(LoyaltyMember, string $kind, int $id): ?array`; `AdminNotificationService::send(?int $orgId, Mailable $mailable): int`; `RealtimeEventService::dispatch(string $type, string $title, string $body, array $data, ?int $orgId)`.
- Produces:
  - Route `POST member/portal/bookings/{kind}/{id}/cancel` (kind `service|stay`, numeric id, `throttle:20,1`) → 200 `{booking: <DTO>, refund: {outcome, amount, currency, coupon_released, points_reversed}}`; errors `not_found` 404, `already_cancelled` 409, `cancel_in_progress` 409, `not_cancellable` 422, `outside_policy` 422, `refund_unavailable` 409, `refund_failed` 502.
  - `BookingCancelledMail(string $guestName, string $hotelName, string $bookingReference, string $title, string $when, string $money, float $amount, string $currency, string $supportEmail, ?string $industry = null)` — `$money` is `'none'|'released'|'refunded'`.
  - `AdminBookingCancelledMail(string $kind, string $hotelName, string $bookingReference, string $guestName, ?string $guestEmail, string $title, string $when, string $money, float $amount, string $currency, bool $couponReleased, string $adminUrl)`
  - `PortalCancellationNotifier::notify(CancellationOutcome $outcome): void`

- [ ] **Step 1: Write the failing mail tests**

Create `tests/Feature/Mail/BookingCancelledMailTest.php`:

```php
<?php

namespace Tests\Feature\Mail;

use App\Mail\AdminBookingCancelledMail;
use App\Mail\BookingCancelledMail;
use Tests\TestCase;

class BookingCancelledMailTest extends TestCase
{
    private function mail(array $over = []): BookingCancelledMail
    {
        return new BookingCancelledMail(...array_merge([
            'guestName' => 'Ada Lovelace', 'hotelName' => 'Seaside Hotel', 'bookingReference' => 'BK-ABC12345',
            'title' => 'Sea view', 'when' => 'Oct 10, 2026 – Oct 12, 2026', 'money' => 'none', 'amount' => 0.0,
            'currency' => 'EUR', 'supportEmail' => 'hello@seaside.test', 'industry' => 'hotel',
        ], $over));
    }

    public function test_the_subject_names_the_venue_and_the_reference(): void
    {
        $this->assertSame('Booking cancelled — Seaside Hotel · BK-ABC12345', $this->mail()->envelope()->subject);
        $this->assertSame('Appointment cancelled — Seaside Hotel · SVC-AB12CD34', $this->mail(['industry' => 'beauty', 'bookingReference' => 'SVC-AB12CD34'])->envelope()->subject);
    }

    public function test_the_body_says_what_happened_to_the_money(): void
    {
        $none = $this->mail()->render();
        $this->assertStringContainsString('BK-ABC12345', $none);
        $this->assertStringContainsString('Sea view', $none);
        $this->assertStringContainsString('Nothing was charged', $none);

        $released = $this->mail(['money' => 'released', 'amount' => 180.0])->render();
        $this->assertStringContainsString('The hold of EUR 180.00 on your card has been released', $released);
        $this->assertStringNotContainsString('refund', strtolower($released));

        $refunded = $this->mail(['money' => 'refunded', 'amount' => 54.0])->render();
        $this->assertStringContainsString('EUR 54.00', $refunded);
        $this->assertStringContainsString('5–10 business days', $refunded);
        $this->assertStringContainsString('hello@seaside.test', $refunded);
    }

    public function test_the_venue_is_told_who_what_and_what_was_returned(): void
    {
        $mail = new AdminBookingCancelledMail(
            kind: 'stay', hotelName: 'Seaside Hotel', bookingReference: 'BK-ABC12345', guestName: 'Ada Lovelace', guestEmail: 'ada@example.test',
            title: 'Sea view', when: 'Oct 10, 2026 – Oct 12, 2026', money: 'refunded', amount: 180.0, currency: 'EUR', couponReleased: true, adminUrl: 'https://app.example.test',
        );

        $this->assertSame('Cancelled by the member — stay BK-ABC12345', $mail->envelope()->subject);
        $html = $mail->render();
        $this->assertStringContainsString('Ada Lovelace', $html);
        $this->assertStringContainsString('ada@example.test', $html);
        $this->assertStringContainsString('Refunded: EUR 180.00', $html);
        $this->assertStringContainsString('The coupon used for this booking was returned to the member', $html);
    }
}
```

- [ ] **Step 2: Write the failing endpoint tests**

Create `tests/Feature/Member/Portal/PortalCancellationTest.php`:

```php
<?php

namespace Tests\Feature\Member\Portal;

use App\Mail\AdminBookingCancelledMail;
use App\Mail\BookingCancelledMail;
use App\Mail\BookingRefundMail;
use App\Models\AuditLog;
use App\Models\BookingMirror;
use App\Models\MemberOffer;
use App\Models\ServiceBooking;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Stripe\PaymentIntent;
use Stripe\Refund;
use Tests\Concerns\SeedsDiscountFixture;
use Tests\Concerns\SetsUpServiceBookingSchema;
use Tests\Concerns\SetsUpStayBookingSchema;
use Tests\Feature\Member\MemberEndpointTestCase;

class PortalCancellationTest extends MemberEndpointTestCase
{
    use SetsUpServiceBookingSchema, SetsUpStayBookingSchema, SeedsDiscountFixture, StayPortalFixture;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpStayPortal();
        $this->setUpServiceBookingSchema();
        // The venue's notification goes to its staff.
        DB::table('users')->insert(['name' => 'Front desk', 'email' => 'desk@seaside.test', 'password' => bcrypt('x'), 'user_type' => 'staff', 'organization_id' => $this->org->id, 'created_at' => now(), 'updated_at' => now()]);
    }

    private function appointment(array $attrs = []): ServiceBooking
    {
        app()->instance('current_organization_id', $this->org->id);
        ['service' => $service, 'master' => $master] = $this->seedBookableService($this->org->id);
        $b = ServiceBooking::create(array_merge([
            'organization_id' => $this->org->id, 'service_id' => $service->id, 'service_master_id' => $master->id, 'member_id' => $this->member->id,
            'customer_name' => 'App Member', 'customer_email' => $this->user->email,
            'start_at' => now()->addDays(3), 'end_at' => now()->addDays(3)->addMinutes(45), 'duration_minutes' => 45,
            'service_price' => 60, 'total_amount' => 54, 'list_amount' => 60, 'discount_amount' => 6, 'currency' => 'EUR',
            'status' => 'confirmed', 'payment_status' => 'unpaid', 'source' => 'member_portal',
        ], $attrs));
        app()->forgetInstance('current_organization_id');
        return $b;
    }

    private function stay(array $attrs = []): BookingMirror
    {
        static $n = 0;
        $n++;
        return BookingMirror::withoutGlobalScopes()->create(array_merge([
            'organization_id' => $this->org->id, 'reservation_id' => (string) (990000 + $n), 'booking_reference' => 'BK-PORTAL' . $n,
            'booking_state' => 'confirmed', 'internal_status' => 'confirmed', 'apartment_id' => '101', 'apartment_name' => 'Sea view',
            'channel_name' => 'Member portal', 'member_id' => $this->member->id, 'guest_name' => 'App Member', 'guest_email' => $this->user->email,
            'adults' => 2, 'children' => 0, 'arrival_date' => $this->checkIn, 'departure_date' => $this->checkOut,
            'price_total' => 180, 'payment_status' => 'open', 'payment_method' => 'pay_at_venue',
        ], $attrs));
    }

    private function cancel(string $kind, int $id, ?string $token = null)
    {
        $this->flushHeaders();
        return $this->withToken($token ?? $this->token)->postJson("/api/v1/member/portal/bookings/{$kind}/{$id}/cancel");
    }

    public function test_a_member_cancels_an_appointment_and_both_sides_hear_of_it(): void
    {
        $b = $this->appointment();

        $res = $this->cancel('service', $b->id)->assertOk();

        $res->assertJsonPath('booking.status', 'cancelled')->assertJsonPath('booking.can_cancel', false)->assertJsonPath('booking.id', $b->id)
            ->assertJsonPath('refund.outcome', 'none')->assertJsonPath('refund.coupon_released', false);
        $this->assertSame('cancelled', ServiceBooking::withoutGlobalScopes()->findOrFail($b->id)->status);

        Mail::assertQueued(BookingCancelledMail::class, fn (BookingCancelledMail $m) => $m->hasTo($this->user->email) && $m->bookingReference === $b->booking_reference && $m->money === 'none');
        Mail::assertQueued(AdminBookingCancelledMail::class, fn (AdminBookingCancelledMail $m) => $m->hasTo('desk@seaside.test') && $m->kind === 'service');
        $this->assertSame(1, AuditLog::withoutGlobalScopes()->where('action', 'service_booking.member_cancelled')->where('subject_id', $b->id)->count());
        $this->assertSame(1, DB::table('realtime_events')->where('organization_id', $this->org->id)->where('type', 'booking.cancelled')->count());
    }

    public function test_a_paid_appointment_is_refunded_and_its_coupon_returned(): void
    {
        $claim = $this->claim(6);
        $b = $this->appointment(['payment_status' => 'paid', 'stripe_payment_intent_id' => 'pi_paid', 'discount_source' => 'offer', 'discount_source_id' => $claim->id]);
        $claim->forceFill(['used_at' => now(), 'status' => 'used', 'used_reference' => $b->booking_reference])->save();
        $stripe = $this->stripe();
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_paid')->andReturn(PaymentIntent::constructFrom(['id' => 'pi_paid', 'status' => 'succeeded']));
        $stripe->shouldReceive('refund')->once()->andReturn(Refund::constructFrom(['id' => 're_1', 'status' => 'succeeded']));

        $this->cancel('service', $b->id)->assertOk()
            ->assertJsonPath('refund.outcome', 'refunded')->assertJsonPath('refund.amount', 54)->assertJsonPath('refund.currency', 'EUR')->assertJsonPath('refund.coupon_released', true)
            ->assertJsonPath('booking.payment_status', 'refunded');

        $this->assertNull(MemberOffer::findOrFail($claim->id)->used_at);
        Mail::assertQueued(BookingCancelledMail::class, fn (BookingCancelledMail $m) => $m->money === 'refunded' && $m->amount === 54.0);
    }

    public function test_a_member_cancels_a_stay(): void
    {
        $m = $this->stay();
        $this->smoobu->shouldReceive('cancelReservation')->once()->with($m->reservation_id)->andReturn([]);

        $this->cancel('stay', $m->id)->assertOk()
            ->assertJsonPath('booking.kind', 'stay')->assertJsonPath('booking.status', 'cancelled')->assertJsonPath('refund.outcome', 'none');

        Mail::assertQueued(BookingCancelledMail::class, fn (BookingCancelledMail $mail) => $mail->hasTo($this->user->email) && $mail->title === 'Sea view');
        Mail::assertQueued(AdminBookingCancelledMail::class, fn (AdminBookingCancelledMail $mail) => $mail->kind === 'stay');
        $this->assertSame(1, AuditLog::withoutGlobalScopes()->where('action', 'booking.member_cancelled')->where('subject_id', $m->id)->count());
    }

    public function test_a_refunded_stay_sends_the_member_one_mail_not_two(): void
    {
        $m = $this->stay(['payment_status' => 'paid', 'payment_method' => 'stripe', 'stripe_payment_intent_id' => 'pi_stay', 'price_paid' => 180]);
        $stripe = $this->stripe();
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_stay')->andReturn(PaymentIntent::constructFrom(['id' => 'pi_stay', 'status' => 'succeeded']));
        $stripe->shouldReceive('refund')->once()->andReturn(Refund::constructFrom(['id' => 're_stay', 'status' => 'succeeded']));
        $this->smoobu->shouldReceive('cancelReservation')->once()->andReturn([]);

        $this->cancel('stay', $m->id)->assertOk()->assertJsonPath('refund.outcome', 'refunded')->assertJsonPath('refund.amount', 180);

        Mail::assertQueued(BookingRefundMail::class, 1);
        Mail::assertNotQueued(BookingCancelledMail::class);
        Mail::assertQueued(AdminBookingCancelledMail::class, 1);
    }

    /** Review Focus 5. */
    public function test_cancelling_twice_refunds_once(): void
    {
        $b = $this->appointment(['payment_status' => 'paid', 'stripe_payment_intent_id' => 'pi_paid']);
        $stripe = $this->stripe();
        $stripe->shouldReceive('retrievePaymentIntent')->andReturn(PaymentIntent::constructFrom(['id' => 'pi_paid', 'status' => 'succeeded']));
        $stripe->shouldReceive('refund')->once()->andReturn(Refund::constructFrom(['id' => 're_1', 'status' => 'succeeded']));

        $this->cancel('service', $b->id)->assertOk();
        $this->cancel('service', $b->id)->assertStatus(409)->assertJsonPath('error', 'already_cancelled');

        Mail::assertQueued(BookingCancelledMail::class, 1);
        Mail::assertQueued(AdminBookingCancelledMail::class, 1);
    }

    public function test_a_booking_staff_already_cancelled_cannot_be_cancelled_again(): void
    {
        $this->stripe()->shouldNotReceive('refund');
        $b = $this->appointment(['status' => 'cancelled', 'cancelled_at' => now(), 'cancellation_reason' => 'Staff: double booking']);

        $this->cancel('service', $b->id)->assertStatus(409)->assertJsonPath('error', 'already_cancelled');
        $this->assertSame('Staff: double booking', ServiceBooking::withoutGlobalScopes()->findOrFail($b->id)->cancellation_reason);
        Mail::assertNothingQueued();
    }

    public function test_outside_the_window_the_member_is_told_to_contact_the_venue(): void
    {
        $soon = $this->appointment(['start_at' => now()->addHours(5), 'end_at' => now()->addHours(6)]);
        $this->cancel('service', $soon->id)->assertStatus(422)->assertJsonPath('error', 'outside_policy');

        $stay = $this->stay(['arrival_date' => now()->addDay()->toDateString(), 'departure_date' => now()->addDays(3)->toDateString()]);
        $this->smoobu->shouldNotReceive('cancelReservation');
        $this->cancel('stay', $stay->id)->assertStatus(422)->assertJsonPath('error', 'outside_policy');

        $this->assertSame('confirmed', ServiceBooking::withoutGlobalScopes()->findOrFail($soon->id)->status);
        Mail::assertNothingQueued();
    }

    public function test_nobody_cancels_another_members_booking_or_another_venues(): void
    {
        $b = $this->appointment();
        $m = $this->stay();
        ['token' => $stranger] = $this->member($this->org);
        $elsewhere = $this->tenant('Other Venue');
        ['token' => $foreign] = $this->member($elsewhere);
        $this->smoobu->shouldNotReceive('cancelReservation');

        foreach ([$stranger, $foreign] as $token) {
            $this->cancel('service', $b->id, $token)->assertStatus(404)->assertJsonPath('error', 'not_found');
            $this->cancel('stay', $m->id, $token)->assertStatus(404)->assertJsonPath('error', 'not_found');
        }
        $this->assertSame('confirmed', ServiceBooking::withoutGlobalScopes()->findOrFail($b->id)->status);
        $this->assertSame('confirmed', BookingMirror::withoutGlobalScopes()->findOrFail($m->id)->internal_status);
    }

    public function test_a_refund_that_fails_answers_502_and_tells_nobody(): void
    {
        $b = $this->appointment(['payment_status' => 'paid', 'stripe_payment_intent_id' => 'pi_paid']);
        $stripe = $this->stripe();
        $stripe->shouldReceive('retrievePaymentIntent')->andReturn(PaymentIntent::constructFrom(['id' => 'pi_paid', 'status' => 'succeeded']));
        $stripe->shouldReceive('refund')->andThrow(new \RuntimeException('stripe down'));

        $this->cancel('service', $b->id)->assertStatus(502)->assertJsonPath('error', 'refund_failed');

        $this->assertSame('confirmed', ServiceBooking::withoutGlobalScopes()->findOrFail($b->id)->status);
        Mail::assertNothingQueued();
    }

    public function test_an_unknown_kind_and_a_staff_token_are_refused(): void
    {
        $b = $this->appointment();
        $this->cancel('table', $b->id)->assertStatus(404);
    }
}
```

If the `users` insert in `setUp()` fails on a missing column, shape it like the staff user `PortalBootstrapTest` creates for its staff-token test. If the venue's mail is not queued, read how `AdminNotificationService::resolveRecipients()` finds its recipients (`app/Services/AdminNotificationService.php:20-62`) and seed what it reads (a setting such as `booking_notification_emails`, or a `staff` row) — the assertion is that the venue is told, not which table names the recipient.

- [ ] **Step 3: Run them to see them fail**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Mail/BookingCancelledMailTest.php tests/Feature/Member/Portal/PortalCancellationTest.php --no-ansi`
Expected: FAIL — `Class "App\Mail\BookingCancelledMail" not found`; 404/405 on the cancel route.

- [ ] **Step 4: The member's mail**

Create `app/Mail/BookingCancelledMail.php`:

```php
<?php

namespace App\Mail;

use App\Models\Organization;
use App\Services\IndustryPrompts\IndustryPromptService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Tells a member the booking they cancelled in the portal is cancelled,
 * and what happened to their money: nothing was charged, a hold on the
 * card was released, or a payment is being refunded.
 *
 * Not sent for a refunded stay: BookingRefundService sends its own
 * BookingRefundMail, which says the same.
 */
class BookingCancelledMail extends Mailable implements ShouldQueue
{
    use Concerns\SendsAsVenue;

    use Queueable, SerializesModels;

    public $tries = 3;
    public $backoff = [60, 300, 900];

    /** @param 'none'|'released'|'refunded' $money */
    public function __construct(
        public string $guestName,
        public string $hotelName,
        public string $bookingReference,
        public string $title,
        public string $when,
        public string $money,
        public float $amount,
        public string $currency,
        public string $supportEmail,
        public ?string $industry = null,
    ) {
        // Capture the acting tenant NOW; envelope() runs later in the
        // worker, where no org is bound. See Concerns\SendsAsVenue.
        $this->captureVenue();
    }

    public function envelope(): Envelope
    {
        $noun = match ($this->industry) {
            'beauty', 'medical' => 'Appointment',
            default             => 'Booking',
        };

        return new Envelope(
            subject: "{$noun} cancelled — {$this->hotelName} · {$this->bookingReference}",
            from:    $this->venueFrom(),
            replyTo: $this->venueReplyTo(),
        );
    }

    public function content(): Content
    {
        $industry = $this->industry ?? Organization::DEFAULT_INDUSTRY;

        return new Content(
            view: 'emails.booking-cancelled',
            with: ['industry' => $industry, 'profile' => app(IndustryPromptService::class)->for($industry)],
        );
    }
}
```

Create `resources/views/emails/booking-cancelled.blade.php`:

```blade
@extends('emails.layouts.luxury')

@section('title', 'Your booking is cancelled')

@section('hero')
    <p class="hero-eyebrow">Cancelled</p>
    <h1 class="hero-headline">{{ $hotelName }}</h1>
    <p class="hero-subline">
        Your booking is cancelled, {{ $guestName }} — reference
        <strong style="color:#e3c66a;letter-spacing:1px;">{{ $bookingReference }}</strong>.
    </p>
@endsection

@section('main')
    <p>Dear {{ $guestName }},</p>
    <p>As you asked, we have cancelled your booking at {{ $hotelName }}.</p>

    <div class="panel">
        <div class="panel-title">What was cancelled</div>
        <table role="presentation" class="row" cellpadding="0" cellspacing="0" border="0">
            <tr><td class="lbl">Reference</td><td class="val">{{ $bookingReference }}</td></tr>
            <tr><td class="lbl">Booking</td><td class="val">{{ $title }}</td></tr>
            <tr><td class="lbl">When</td><td class="val">{{ $when }}</td></tr>
        </table>
    </div>

    @if ($money === 'refunded')
        <p>
            <strong>Your payment.</strong><br>
            We have refunded <strong>{{ strtoupper($currency) }} {{ number_format($amount, 2) }}</strong> to the card you paid with.
            Refunds typically appear on your statement within <strong>5–10 business days</strong>, depending on your bank.
        </p>
    @elseif ($money === 'released')
        <p>
            <strong>Your payment.</strong><br>
            The hold of {{ strtoupper($currency) }} {{ number_format($amount, 2) }} on your card has been released; nothing was charged.
            Your bank may show the pending amount for a few more days before it disappears.
        </p>
    @else
        <p>Nothing was charged for this booking, so there is nothing to return.</p>
    @endif

    <p>
        If this was not you, or anything looks wrong, please reply to this email or contact us at
        <a href="mailto:{{ $supportEmail }}" style="color:#e3c66a;">{{ $supportEmail }}</a>
        and quote reference <strong>{{ $bookingReference }}</strong>.
    </p>

    <p>
        We hope to welcome you another time,<br>
        The {{ $hotelName }} team
    </p>
@endsection
```

- [ ] **Step 5: The venue's mail**

Create `app/Mail/AdminBookingCancelledMail.php`:

```php
<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Tells the venue's staff a member cancelled a booking in the portal:
 * who, what, and what was returned to them. Sent through
 * AdminNotificationService, which queues it to the venue's recipients.
 */
class AdminBookingCancelledMail extends Mailable
{
    use Queueable, SerializesModels;

    /**
     * @param 'service'|'stay' $kind
     * @param 'none'|'released'|'refunded' $money
     */
    public function __construct(
        public string $kind,
        public string $hotelName,
        public string $bookingReference,
        public string $guestName,
        public ?string $guestEmail,
        public string $title,
        public string $when,
        public string $money,
        public float $amount,
        public string $currency,
        public bool $couponReleased,
        public string $adminUrl,
    ) {}

    public function envelope(): Envelope
    {
        $what = $this->kind === 'stay' ? 'stay' : 'appointment';

        return new Envelope(subject: "Cancelled by the member — {$what} {$this->bookingReference}");
    }

    public function content(): Content
    {
        return new Content(view: 'emails.admin-booking-cancelled');
    }
}
```

Create `resources/views/emails/admin-booking-cancelled.blade.php`:

```blade
@extends('emails.layouts.luxury')

@section('title', 'A member cancelled a booking')

@section('hero')
    <p class="hero-eyebrow">Cancelled in the member portal</p>
    <h1 class="hero-headline">{{ $bookingReference }}</h1>
    <p class="hero-subline">{{ $guestName }} cancelled {{ $kind === 'stay' ? 'a stay' : 'an appointment' }} at {{ $hotelName }}.</p>
@endsection

@section('main')
    <div class="panel">
        <div class="panel-title">The booking</div>
        <table role="presentation" class="row" cellpadding="0" cellspacing="0" border="0">
            <tr><td class="lbl">Reference</td><td class="val">{{ $bookingReference }}</td></tr>
            <tr><td class="lbl">Member</td><td class="val">{{ $guestName }}</td></tr>
            @if ($guestEmail)
                <tr><td class="lbl">Email</td><td class="val">{{ $guestEmail }}</td></tr>
            @endif
            <tr><td class="lbl">Booking</td><td class="val">{{ $title }}</td></tr>
            <tr><td class="lbl">When</td><td class="val">{{ $when }}</td></tr>
        </table>
    </div>

    <div class="panel">
        <div class="panel-title">The money</div>
        @if ($money === 'refunded')
            <p>Refunded: {{ strtoupper($currency) }} {{ number_format($amount, 2) }}, in full, to the member's card.</p>
        @elseif ($money === 'released')
            <p>Released: the hold of {{ strtoupper($currency) }} {{ number_format($amount, 2) }} on the member's card. Nothing was charged.</p>
        @else
            <p>Nothing was paid online for this booking.</p>
        @endif
        @if ($couponReleased)
            <p>The coupon used for this booking was returned to the member.</p>
        @endif
    </div>

    <p>The time is free to book again. <a href="{{ $adminUrl }}" style="color:#e3c66a;">Open the console</a></p>
@endsection
```

Run `/c/wamp64/bin/php/php8.4.20/php.exe artisan view:clear`.

- [ ] **Step 6: The notifier**

Create `app/Services/Booking/PortalCancellationNotifier.php`:

```php
<?php

namespace App\Services\Booking;

use App\Mail\AdminBookingCancelledMail;
use App\Mail\BookingCancelledMail;
use App\Models\AuditLog;
use App\Models\BookingMirror;
use App\Models\HotelSetting;
use App\Models\Organization;
use App\Models\ServiceBooking;
use App\Services\AdminNotificationService;
use App\Services\Portal\PortalBootstrap;
use App\Services\Portal\PortalTheme;
use App\Services\RealtimeEventService;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * Everything that happens after a member's cancellation is done: the
 * member's mail, the venue's mail, a realtime event for the staff
 * dashboard and an audit row. The cancellation is committed by the time
 * this runs, so no failure here may reach the member.
 */
class PortalCancellationNotifier
{
    public function notify(CancellationOutcome $o): void
    {
        $b = $o->booking;
        $orgId = (int) $b->organization_id;
        $org = Organization::withoutGlobalScopes()->find($orgId);
        $hotel = (string) (HotelSetting::getValue('company_name') ?: $org?->name ?: config('app.name'));
        $facts = $this->facts($o, $org);

        if (!$o->memberMailed && $facts['email']) {
            try {
                Mail::to($facts['email'])->queue(new BookingCancelledMail(
                    guestName: $facts['name'], hotelName: $hotel, bookingReference: $facts['reference'], title: $facts['title'], when: $facts['when'],
                    money: $o->money, amount: $o->amount, currency: $o->currency,
                    supportEmail: (string) ($org?->email ?: HotelSetting::getValue('mail_reply_to', 'support@hotel-tech.ai')),
                    industry: $org ? PortalTheme::for($org)['industry'] : null,
                ));
            } catch (\Throwable $e) {
                Log::warning('portal.cancel_mail_failed', ['kind' => $o->kind, 'booking' => $b->id, 'error' => $e->getMessage()]);
            }
        }

        try {
            app(AdminNotificationService::class)->send($orgId, new AdminBookingCancelledMail(
                kind: $o->kind, hotelName: $hotel, bookingReference: $facts['reference'], guestName: $facts['name'], guestEmail: $facts['email'],
                title: $facts['title'], when: $facts['when'], money: $o->money, amount: $o->amount, currency: $o->currency, couponReleased: $o->couponReleased,
                adminUrl: rtrim(config('app.frontend_url') ?? config('app.url') ?? '', '/'),
            ));
        } catch (\Throwable $e) {
            Log::warning('portal.cancel_admin_mail_failed', ['kind' => $o->kind, 'booking' => $b->id, 'error' => $e->getMessage()]);
        }

        try {
            app(RealtimeEventService::class)->dispatch(
                'booking.cancelled',
                'Cancelled in the member portal',
                "{$facts['name']} · {$facts['title']} · {$facts['when']}",
                [$o->kind === 'stay' ? 'mirror_id' : 'service_booking_id' => $b->id, 'source' => MemberCancellation::REASON, 'refund' => $o->money],
                $orgId,
            );
        } catch (\Throwable $e) {
            Log::warning('portal.cancel_realtime_failed', ['kind' => $o->kind, 'booking' => $b->id, 'error' => $e->getMessage()]);
        }

        try {
            AuditLog::create([
                'organization_id' => $orgId,
                'subject_type'    => $o->kind === 'stay' ? 'booking_mirror' : ServiceBooking::class,
                'subject_id'      => $b->id,
                'action'          => $o->kind === 'stay' ? 'booking.member_cancelled' : 'service_booking.member_cancelled',
                'new_values'      => $o->toArray(),
                'description'     => "The member cancelled {$facts['reference']} in the portal (payment: {$o->money})",
            ]);
        } catch (\Throwable $e) {
            Log::warning('portal.cancel_audit_failed', ['kind' => $o->kind, 'booking' => $b->id, 'error' => $e->getMessage()]);
        }
    }

    /** @return array{name: string, email: ?string, reference: string, title: string, when: string} */
    private function facts(CancellationOutcome $o, ?Organization $org): array
    {
        $b = $o->booking;
        if ($b instanceof BookingMirror) {
            return [
                'name'      => $b->guest_name ?: 'Guest',
                'email'     => $b->guest_email ?: null,
                'reference' => (string) ($b->booking_reference ?: $b->reservation_id),
                'title'     => $b->apartment_name ?: 'Stay',
                'when'      => trim(($b->arrival_date?->format('M j, Y') ?? '') . ' – ' . ($b->departure_date?->format('M j, Y') ?? ''), ' –'),
            ];
        }

        $b->loadMissing(['service', 'master']);
        $zone = $org ? PortalBootstrap::timezone($org) : config('app.timezone', 'UTC');

        return [
            'name'      => $b->customer_name ?: 'Guest',
            'email'     => $b->customer_email ?: null,
            'reference' => (string) $b->booking_reference,
            'title'     => ($b->service?->name ?? 'Appointment') . ($b->master?->name ? " · {$b->master->name}" : ''),
            'when'      => $b->start_at ? $b->start_at->copy()->timezone($zone)->format('M j, Y · H:i') : '',
        ];
    }
}
```

- [ ] **Step 7: The endpoint**

In `app/Http/Controllers/Api/V1/Member/Portal/PortalBookingController.php` add the imports `use App\Services\Booking\CancellationException;`, `use App\Services\Booking\MemberCancellation;`, `use App\Services\Booking\PortalCancellationNotifier;`, `use Illuminate\Support\Facades\Log;` and the method:

```php
    /**
     * POST /v1/member/portal/bookings/{kind}/{id}/cancel
     *
     * The member's own booking, inside the venue's cancellation window:
     * the money is returned, then the booking is cancelled. Answers the
     * booking as it is now and what happened to the money.
     */
    public function cancel(Request $request, string $kind, int $id, MemberCancellation $cancellation, PortalCancellationNotifier $notifier): JsonResponse
    {
        $member = $request->user()->loyaltyMember;
        // Ownership is the list's own rule: a booking the member cannot see, they cannot cancel.
        if (!$member || !$this->bookings->find($member, $kind, $id)) {
            return response()->json(['error' => 'not_found', 'message' => 'We could not find that booking.'], 404);
        }

        try {
            $outcome = $kind === 'stay'
                ? $cancellation->cancelStay((int) $member->organization_id, $id)
                : $cancellation->cancelService((int) $member->organization_id, $id);
        } catch (CancellationException $e) {
            return response()->json(['error' => $e->errorCode, 'message' => $e->getMessage()], $e->status);
        }

        try {
            $notifier->notify($outcome);
        } catch (\Throwable $e) {
            Log::warning('portal.cancel_notify_failed', ['kind' => $kind, 'booking' => $id, 'error' => $e->getMessage()]);
        }

        return response()->json([
            'booking' => $this->bookings->find($member, $kind, $id),
            'refund'  => $outcome->toArray(),
        ], 200, [], JSON_PRESERVE_ZERO_FRACTION);
    }
```

`JSON_PRESERVE_ZERO_FRACTION` makes `refund.amount` `54.0`; `assertJsonPath('refund.amount', 54)` compares strictly — if it fails on `54.0 !== 54`, assert `54.0` in the two tests that read it (the booking DTOs on this controller already carry floats the same way).

In `routes/api.php`, after the `bookings/{kind}/{id}` route:

```php
            Route::post('bookings/{kind}/{id}/cancel', [\App\Http\Controllers\Api\V1\Member\Portal\PortalBookingController::class, 'cancel'])
                ->whereIn('kind', ['service', 'stay'])
                ->whereNumber('id')
                ->middleware('throttle:20,1');
```

- [ ] **Step 8: Run the tests**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Mail/BookingCancelledMailTest.php tests/Feature/Member/Portal/PortalCancellationTest.php --no-ansi`
Expected: mail `Tests:    3 passed`, endpoint `Tests:    10 passed`.

- [ ] **Step 9: Neighbouring suites**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Member/ --no-ansi`, `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Mail/ --no-ansi`
Expected: all pass.

- [ ] **Step 10: Commit**

```bash
git add app/Mail/BookingCancelledMail.php app/Mail/AdminBookingCancelledMail.php resources/views/emails/booking-cancelled.blade.php resources/views/emails/admin-booking-cancelled.blade.php app/Services/Booking/PortalCancellationNotifier.php app/Http/Controllers/Api/V1/Member/Portal/PortalBookingController.php routes/api.php tests/Feature/Mail/BookingCancelledMailTest.php tests/Feature/Member/Portal/PortalCancellationTest.php
git commit -m "Let a member cancel a booking in the portal and tell both sides

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 14: The capture job never charges a cancelled stay; a refund made at Stripe is recorded on a service booking

**Files:**
- Modify: `app/Console/Commands/CapturePendingPaymentIntents.php` (`processBooking()` `:188-298`; the three `'canceled'` writes at `:284`, `:378`, `:408`; the class docblock), `app/Http/Controllers/Api/V1/BookingPublicController.php` (`handleChargeRefunded()` `:1683-1711`)
- Test: `tests/Feature/Booking/CapturePendingPaymentIntentsTest.php` (add and modify), `tests/Feature/Stripe/ServiceBookingRefundWebhookTest.php` (create)

**Interfaces:**
- Consumes: nothing from this plan beyond Task 1's columns.
- Produces: audit actions `booking.capture.cancelled_booking` and `booking.capture.needs_refund` (subject `booking_mirror`); `payment_status` `cancelled` wherever the job wrote `canceled`; audit action `service_booking.refunded` from the webhook.

- [ ] **Step 1: Write the failing job tests**

In `tests/Feature/Booking/CapturePendingPaymentIntentsTest.php`:

(a) In `test_a_cancelled_or_no_show_booking_has_its_hold_cancelled_not_captured` change both `assertSame('canceled', …)` to `assertSame('cancelled', …)`.

(b) Add:

```php
    private function stayRow(array $attrs): int
    {
        return \DB::table('booking_mirror')->insertGetId(array_merge([
            'organization_id'          => app('current_organization_id'),
            'reservation_id'           => 'R-' . uniqid(),
            'booking_state'            => 'confirmed',
            'internal_status'          => 'confirmed',
            'payment_status'           => 'authorized',
            'payment_method'           => 'stripe',
            'stripe_payment_intent_id' => 'pi_test_stay_1',
            'price_total'              => 180,
            'created_at'               => now()->subHour(),
            'updated_at'               => now()->subHour(),
        ], $attrs));
    }

    /** Review Focus 4. */
    public function test_a_cancelled_stay_is_released_not_captured(): void
    {
        $byStatus = $this->stayRow(['internal_status' => 'cancelled', 'stripe_payment_intent_id' => 'pi_test_stay_a']);
        $byState = $this->stayRow(['booking_state' => 'cancelled', 'stripe_payment_intent_id' => 'pi_test_stay_b']);
        $stripe = $this->enabledStripe('requires_capture');
        $stripe->shouldNotReceive('capturePaymentIntent');
        $stripe->shouldReceive('cancelPaymentIntent')->once()->with('pi_test_stay_a', 'abandoned')->andReturn(\Stripe\PaymentIntent::constructFrom(['id' => 'pi_test_stay_a', 'status' => 'canceled']));
        $stripe->shouldReceive('cancelPaymentIntent')->once()->with('pi_test_stay_b', 'abandoned')->andReturn(\Stripe\PaymentIntent::constructFrom(['id' => 'pi_test_stay_b', 'status' => 'canceled']));

        $this->runCron();

        $this->assertSame('cancelled', \DB::table('booking_mirror')->where('id', $byStatus)->value('payment_status'));
        $this->assertSame('cancelled', \DB::table('booking_mirror')->where('id', $byState)->value('payment_status'));
        $this->assertSame(2, $this->audits('booking.capture.cancelled_booking'));
    }

    public function test_a_cancelled_stay_whose_payment_was_already_taken_is_flagged_once_and_left_alone(): void
    {
        $id = $this->stayRow(['internal_status' => 'cancelled']);
        $stripe = $this->enabledStripe('succeeded');
        $stripe->shouldNotReceive('capturePaymentIntent');
        $stripe->shouldNotReceive('cancelPaymentIntent');

        $this->runCron();
        $this->runCron();

        $this->assertSame('authorized', \DB::table('booking_mirror')->where('id', $id)->value('payment_status'), 'a cancelled stay is never marked paid by the job');
        $this->assertSame(1, $this->audits('booking.capture.needs_refund'));
    }

    public function test_a_confirmed_stay_is_captured_as_before(): void
    {
        $id = $this->stayRow([]);
        $stripe = $this->enabledStripe('requires_capture');
        $stripe->shouldReceive('capturePaymentIntent')->once()->with('pi_test_stay_1')->andReturn(\Stripe\PaymentIntent::constructFrom(['id' => 'pi_test_stay_1', 'status' => 'succeeded']));

        $this->runCron();

        $this->assertSame('paid', \DB::table('booking_mirror')->where('id', $id)->value('payment_status'));
    }

    public function test_an_intent_stripe_cancelled_is_recorded_with_one_spelling(): void
    {
        $stay = $this->stayRow([]);
        $service = $this->serviceBooking('confirmed', 'pi_test_gone_1');
        $this->enabledStripe('canceled');

        $this->runCron();

        $this->assertSame('cancelled', \DB::table('booking_mirror')->where('id', $stay)->value('payment_status'));
        $this->assertSame('cancelled', \DB::table('service_bookings')->where('id', $service)->value('payment_status'));
    }

    public function test_a_dry_run_releases_nothing_for_a_cancelled_stay(): void
    {
        $id = $this->stayRow(['internal_status' => 'cancelled']);
        $stripe = $this->enabledStripe('requires_capture');
        $stripe->shouldNotReceive('cancelPaymentIntent');

        $this->runCron(['--dry-run' => true]);

        $this->assertStringContainsString("[dry-run] would cancel the hold on cancelled booking #{$id}", Artisan::output());
        $this->assertSame('authorized', \DB::table('booking_mirror')->where('id', $id)->value('payment_status'));
    }
```

- [ ] **Step 2: Write the failing webhook test**

Create `tests/Feature/Stripe/ServiceBookingRefundWebhookTest.php`:

```php
<?php

namespace Tests\Feature\Stripe;

use App\Http\Controllers\Api\V1\BookingPublicController;
use App\Models\Organization;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Stripe\Charge;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\Concerns\SetsUpServiceBookingSchema;
use Tests\TestCase;

/**
 * A refund made in the Stripe dashboard for a service booking's payment
 * used to be reported as a cross-tenant attempt, because the webhook only
 * knew stays. It is recorded on the booking instead.
 */
class ServiceBookingRefundWebhookTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema, SetsUpServiceBookingSchema;

    private Organization $org;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpBookingRefundSchema();
        $this->setUpServiceBookingSchema();
        $this->org = Organization::create(['name' => 'Numa', 'slug' => 'numa-' . uniqid()]);
        app()->instance('current_organization_id', $this->org->id);
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        parent::tearDown();
    }

    private function refunded(string $pi, int $orgId, int $amount = 5400): void
    {
        $charge = Charge::constructFrom(['id' => 'ch_1', 'payment_intent' => $pi, 'refunds' => ['data' => [['id' => 're_dash_1', 'amount' => $amount, 'reason' => 'requested_by_customer']]]]);
        $controller = app(BookingPublicController::class);
        (new \ReflectionMethod($controller, 'handleChargeRefunded'))->invoke($controller, $charge, $orgId);
    }

    private function booking(array $attrs = []): int
    {
        return DB::table('service_bookings')->insertGetId(array_merge([
            'organization_id' => $this->org->id, 'booking_reference' => 'SVC-' . strtoupper(uniqid()), 'service_id' => 1,
            'customer_name' => 'Ada', 'customer_email' => 'ada@example.test', 'start_at' => now()->addDay(), 'end_at' => now()->addDay()->addHour(), 'duration_minutes' => 60,
            'total_amount' => 54, 'currency' => 'EUR', 'status' => 'cancelled', 'payment_status' => 'paid', 'stripe_payment_intent_id' => 'pi_svc_1',
            'created_at' => now(), 'updated_at' => now(),
        ], $attrs));
    }

    public function test_a_refund_for_a_service_bookings_payment_is_recorded_on_the_booking(): void
    {
        $id = $this->booking();

        $this->refunded('pi_svc_1', $this->org->id);

        $row = DB::table('service_bookings')->where('id', $id)->first();
        $this->assertSame('refunded', $row->payment_status);
        $this->assertEquals(54.0, (float) $row->refunded_amount);
        $this->assertSame('re_dash_1', $row->last_refund_id);
        $this->assertNotNull($row->refunded_at);
        $this->assertSame(1, DB::table('audit_logs')->where('action', 'service_booking.refunded')->where('subject_id', $id)->count());
        $this->assertSame(0, DB::table('audit_logs')->where('action', 'stripe.webhook.cross_tenant_attempt')->count());
    }

    public function test_the_same_refund_delivered_twice_is_recorded_once(): void
    {
        $id = $this->booking();
        $this->refunded('pi_svc_1', $this->org->id);
        $this->refunded('pi_svc_1', $this->org->id);
        $this->assertSame(1, DB::table('audit_logs')->where('action', 'service_booking.refunded')->where('subject_id', $id)->count());
    }

    public function test_a_partial_refund_is_recorded_as_partial(): void
    {
        $id = $this->booking();
        $this->refunded('pi_svc_1', $this->org->id, 2000);
        $row = DB::table('service_bookings')->where('id', $id)->first();
        $this->assertSame('partially_refunded', $row->payment_status);
        $this->assertEquals(20.0, (float) $row->refunded_amount);
    }

    public function test_a_payment_no_booking_of_this_organisation_carries_is_still_reported(): void
    {
        $this->booking(['organization_id' => $this->org->id + 1]);
        $this->refunded('pi_svc_1', $this->org->id);
        $this->assertSame(1, DB::table('audit_logs')->where('action', 'stripe.webhook.cross_tenant_attempt')->count());
    }
}
```

If the controller cannot be built by `app()` in a test, construct it as `ConfirmValidationRescueTest` does.

- [ ] **Step 3: Run them to see them fail**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Booking/CapturePendingPaymentIntentsTest.php tests/Feature/Stripe/ServiceBookingRefundWebhookTest.php --no-ansi`
Expected: FAIL — a cancelled stay is captured; `canceled` is written; the webhook writes `cross_tenant_attempt`.

- [ ] **Step 4: The job**

In `app/Console/Commands/CapturePendingPaymentIntents.php`:

(a) In `processBooking()`, immediately after `$status = (string) ($intent->status ?? '');` insert:

```php
        // A stay cancelled inside the capture window — by the member, by
        // staff, or by the PMS — must not be charged: release a hold that is
        // still open, and flag, never touch, one whose payment was already
        // taken (a refund is a person's decision).
        if (in_array((string) $mirror->internal_status, ['cancelled', 'no-show', 'no_show'], true) || (string) $mirror->booking_state === 'cancelled') {
            if ($status === 'requires_capture') {
                return $this->releaseCancelledBooking($stripe, $mirror, $piId, $dryRun);
            }
            if ($status === 'succeeded') {
                return $this->flagBookingForRefund($mirror, $piId, $dryRun);
            }
        }
```

(b) Add the two methods after `processBooking()`:

```php
    /** A cancelled stay whose card is still only held: cancel the hold instead of capturing it. */
    private function releaseCancelledBooking(StripeService $stripe, BookingMirror $mirror, string $piId, bool $dryRun): string
    {
        if ($dryRun) {
            $this->line("[dry-run] would cancel the hold on cancelled booking #{$mirror->id} (PI {$piId})");
            return 'released';
        }
        try {
            $stripe->cancelPaymentIntent($piId, 'abandoned');
        } catch (\Throwable $e) {
            Log::error('Capture cron — cancel of a cancelled booking\'s hold failed', [
                'mirror_id' => $mirror->id,
                'pi_id'     => $piId,
                'error'     => $e->getMessage(),
            ]);
            return 'failed';
        }
        try {
            $mirror->update(['payment_status' => 'cancelled']);
        } catch (\Throwable) {}
        $this->auditOutcome($mirror->organization_id, 'booking.capture.cancelled_booking', $piId, [
            'mirror_id' => $mirror->id,
        ], "Booking #{$mirror->id} is cancelled; PI {$piId} was cancelled instead of captured", 'booking_mirror', (int) $mirror->id);
        return 'released';
    }

    /** A cancelled stay whose payment was already taken: left as it is and flagged with one audit row. */
    private function flagBookingForRefund(BookingMirror $mirror, string $piId, bool $dryRun): string
    {
        if ($dryRun) {
            $this->line("[dry-run] would flag booking #{$mirror->id} for a refund (PI {$piId} already captured)");
            return 'needs_refund';
        }
        $flagged = AuditLog::withoutGlobalScopes()
            ->where('organization_id', $mirror->organization_id)
            ->where('action', 'booking.capture.needs_refund')
            ->where('subject_type', 'booking_mirror')
            ->where('subject_id', $mirror->id)
            ->exists();
        if (!$flagged) {
            $this->auditOutcome($mirror->organization_id, 'booking.capture.needs_refund', $piId, [
                'mirror_id' => $mirror->id,
            ], "Booking #{$mirror->id} is cancelled but PI {$piId} was already captured — refund it from the booking's page if due", 'booking_mirror', (int) $mirror->id);
        }
        return 'needs_refund';
    }
```

(c) In `handle()`, in the `foreach ($bookings as $mirror)` switch add the two cases the service loop already has:

```php
                case 'released':         $released++;         break;
                case 'needs_refund':     $needsRefund++;      break;
```

(d) Replace the three writes of `'canceled'` — `$mirror->update(['payment_status' => 'canceled']);` in `processBooking()`, and both `$booking->update(['payment_status' => 'canceled']);` (in `processServiceBooking()` and `releaseCancelledServiceBooking()`) — with `'cancelled'`, and the two audit descriptions that end "flipped to canceled" with "flipped to cancelled". Stripe's own status string `canceled` in the comparisons (`$status === 'canceled'`) is Stripe's and stays.

(e) In the class docblock add, under the service-booking paragraph: "Stays follow the same rule since member portal phase 3: a cancelled stay's open hold is cancelled, and a payment already taken is flagged with `booking.capture.needs_refund`."

- [ ] **Step 5: The webhook**

In `app/Http/Controllers/Api/V1/BookingPublicController.php`, in `handleChargeRefunded()`, replace the opening of the `if (!$mirror) {` block so it reads:

```php
        if (!$mirror) {
            // Not a stay: a service booking's payment, refunded at Stripe.
            if ($this->recordServiceBookingRefund($charge, (string) $paymentIntentId, $orgId)) {
                return;
            }
            \App\Models\AuditLog::create([
```

(the rest of the block unchanged) and add the private method after `handleChargeRefunded()`:

```php
    /**
     * A refund made at Stripe (the dashboard, a dispute lost) for a payment
     * a service booking of this organisation carries: the booking records
     * it. True when such a booking exists — also when this very refund was
     * already recorded, which a redelivered event is.
     */
    private function recordServiceBookingRefund(\Stripe\Charge $charge, string $paymentIntentId, int $orgId): bool
    {
        $booking = \App\Models\ServiceBooking::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('stripe_payment_intent_id', $paymentIntentId)
            ->first();
        if (!$booking) {
            return false;
        }

        $refunds = $charge->refunds->data ?? [];
        if (empty($refunds)) {
            return true;
        }
        $latest = end($refunds);
        $refundId = is_object($latest) ? ($latest->id ?? null) : ($latest['id'] ?? null);
        if ($refundId !== null && $booking->last_refund_id === $refundId) {
            return true;
        }

        $cents = array_sum(array_map(fn ($r) => (int) (is_object($r) ? ($r->amount ?? 0) : ($r['amount'] ?? 0)), $refunds));
        $total = round((float) $booking->total_amount, 2);
        $refunded = round($cents / 100, 2);

        $booking->forceFill([
            'payment_status'  => $refunded >= $total - 0.01 ? 'refunded' : 'partially_refunded',
            'refunded_amount' => $refunded,
            'refunded_at'     => now(),
            'last_refund_id'  => $refundId,
        ])->save();

        \App\Models\AuditLog::create([
            'organization_id' => $orgId,
            'action'          => 'service_booking.refunded',
            'subject_type'    => \App\Models\ServiceBooking::class,
            'subject_id'      => $booking->id,
            'new_values'      => ['payment_intent_id' => $paymentIntentId, 'refund_id' => $refundId, 'refunded' => $refunded, 'source' => 'stripe_webhook'],
            'description'     => "Stripe refunded {$refunded} of {$total} on service booking {$booking->booking_reference}",
        ]);

        return true;
    }
```

`$cents / 100` is wrong for a zero-decimal currency; the stays path (`handleChargeRefunded()` below) has the same assumption and neither is changed here — it is recorded under "Deferred, known" in Task 22.

- [ ] **Step 6: Run the tests**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Booking/CapturePendingPaymentIntentsTest.php tests/Feature/Stripe/ --no-ansi`
Expected: all pass (the job's test grows by 5, the webhook's 4 are new).

- [ ] **Step 7: Commit**

```bash
git add app/Console/Commands/CapturePendingPaymentIntents.php app/Http/Controllers/Api/V1/BookingPublicController.php tests/Feature/Booking/CapturePendingPaymentIntentsTest.php tests/Feature/Stripe/ServiceBookingRefundWebhookTest.php
git commit -m "Never capture a cancelled stay, and record a Stripe refund on a service booking

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
## Part D — The portal

Every frontend test renders to a string (`renderToStaticMarkup`): effects and handlers never run. Every decision therefore lives in a pure function with its own test, and the component only applies it; a reviewer hand-traces the effect that does the applying. This is the rule phase 2 learned the hard way — keep to it.

### Task 15: Frontend foundations — types, calls, copy in five languages

**Files:**
- Modify: `frontend/src/portal/lib/types.ts`, `frontend/src/portal/lib/portalApi.ts`, `frontend/src/portal/lib/portalApi.test.ts`, `frontend/src/portal/i18n/portal.{en,ru,de,fr,es}.json`, `frontend/src/portal/pages/book/StepStrip.tsx`, `frontend/src/portal/pages/book/CouponField.tsx`, `frontend/src/portal/pages/book/testUtils.tsx`, and every test file that builds a `PortalBootstrap` by hand (`PortalShell.test.tsx`, `pages/Home.test.tsx`, `pages/bookingSheet.test.tsx`, `pages/Bookings.test.tsx` — `npx tsc -b` names any other)

**Interfaces:**
- Consumes: the JSON of Tasks 5–8 and 13.
- Produces (all in `lib/types.ts`): `StayRoom`, `StayExtra`, `StayPolicies`, `StayCatalogue`, `AvailableRoom`, `StayAvailability`, `StayQuoteBody`, `StayQuoteLine`, `StayQuote`, `StayConfirmBody`, `CancelReply`, `Priced` (`{ coupon: Quote['coupon'] }`); `PortalPolicies` gains `booking_cancellation_policy`, `check_in_time`, `check_out_time`.
- Produces (in `lib/portalApi.ts`): `portalApi.stayCatalogue()`, `.stayAvailability(checkIn, checkOut, adults, children)`, `.stayQuote(body)`, `.stayPaymentIntent(holdToken)`, `.stayConfirm(body)`, `.cancelBooking(kind, id)`; `cancelErrorKey(code: string | null): string`, `cancelErrorFallback(code: string | null): string`; `bookErrorKey`/`bookErrorFallback` know `hold_expired`, `price_changed`, `room_unavailable`, `pms_unavailable`, `invalid_stay`, `hold_not_found`.
- Produces: `StepStrip<S extends string>` (generic over the step name); `CouponField`'s `quote` prop is `Priced | null`.

- [ ] **Step 1: Write the failing tests**

In `frontend/src/portal/lib/portalApi.test.ts`:

(a) extend `BOOK_ERROR_CODES` with `'hold_expired', 'price_changed', 'room_unavailable', 'pms_unavailable', 'invalid_stay', 'hold_not_found'`;

(b) change the import to `import { apiErrorCode, bookErrorFallback, bookErrorKey, cancelErrorFallback, cancelErrorKey } from './portalApi'` and add:

```ts
const CANCEL_ERROR_CODES = ['outside_policy', 'not_cancellable', 'already_cancelled', 'cancel_in_progress', 'refund_failed', 'refund_unavailable']

describe('cancelErrorKey', () => {
  it('maps every cancellation code to its own portal.bookings.cancel_error.<code> key', () => {
    for (const code of CANCEL_ERROR_CODES) {
      expect(cancelErrorKey(code)).toBe(`portal.bookings.cancel_error.${code}`)
    }
  })

  it('falls back to the generic error for an unrecognised or missing code', () => {
    expect(cancelErrorKey('not_found')).toBe('portal.common.error')
    expect(cancelErrorKey(null)).toBe('portal.common.error')
  })
})

describe('cancelErrorFallback', () => {
  it('is byte-identical to the English bundle for every code cancelErrorKey knows', () => {
    const bundle = (en.bookings as unknown as { cancel_error: Record<string, string> }).cancel_error
    for (const code of CANCEL_ERROR_CODES) {
      expect(cancelErrorFallback(code)).toBe(bundle[code])
    }
  })

  it('falls back to the generic sentence for an unrecognised or missing code', () => {
    expect(cancelErrorFallback('not_found')).toBe(en.common.error)
    expect(cancelErrorFallback(null)).toBe(en.common.error)
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run (in `frontend/`): `npx vitest run src/portal/lib/portalApi.test.ts`
Expected: FAIL — `cancelErrorKey` is not exported; the new book codes map to `portal.common.error`.

- [ ] **Step 3: Types**

In `frontend/src/portal/lib/types.ts`:

(a) replace `PortalPolicies` with

```ts
export interface PortalPolicies {
  services_cancel_hours: number
  booking_cancel_hours: number
  services_cancellation_policy: string
  booking_cancellation_policy: string
  /** The venue's check-in and check-out times, "HH:MM", in the venue's own time zone. */
  check_in_time: string
  check_out_time: string
}
```

(b) append:

```ts
// ─── Stay booking (the stay flow) ───────────────────────────────────────────
//
// These mirror the server's JSON key for key: StayCatalogue::build(),
// PortalStayBookingController::availability() and StayQuoteService::payload().
// A room's id is a string (the PMS id when the room has one).

export interface StayRoom {
  id: string; name: string; description: string | null; short_description: string | null
  max_guests: number; bedrooms: number; bed_type: string | null; size: string | null
  image: string | null; gallery: string[]; amenities: string[]; tags: string[]; base_price: number
}

export interface StayExtra {
  id: string; name: string; description: string | null; price: number; price_type: string
  lead_time_hours: number; image: string | null; icon: string | null; category: string | null
}

export interface StayPolicies { check_in_time: string; check_out_time: string; cancellation_policy: string | null; payment_terms: string | null; cancel_hours: number }

export interface StayRules { currency: string; min_nights: number; max_nights: number }

export interface StayCatalogue {
  rooms: StayRoom[]
  extras: StayExtra[]
  policies: StayPolicies
  rules: StayRules
  pricing: { automatic: { label: string; type: string; value: number } | null }
  payment: Quote['payment']
}

export interface AvailableRoom {
  id: string; name: string; short_description: string | null; max_guests: number; bedrooms: number
  bed_type: string | null; size: string | null; image: string | null; gallery: string[]; amenities: string[]
  price_per_night: number; total_price: number; member_total: number; currency: string; min_stay: number
}

export interface StayAvailability { rooms: AvailableRoom[]; nights: number; party_too_large: boolean }

export interface StayQuoteBody {
  unit_id: string; check_in: string; check_out: string; adults: number; children: number
  extras?: { id: string; quantity?: number }[]; coupon?: CouponRef | null
}

export interface StayQuoteLine { id: string; name: string; unit_price: number; quantity: number; line_total: number }

export interface StayQuote {
  hold_token: string
  expires_at: string | null
  room: { id: string; name: string }
  check_in: string
  check_out: string
  nights: number
  adults: number
  children: number
  lines: { room_total: number; price_per_night: number; extras: StayQuoteLine[]; extras_total: number }
  list_amount: number
  discount: Quote['discount']
  coupon: Quote['coupon']
  total_amount: number
  currency: string
  payment: Quote['payment']
  policy: { cancellation_policy: string | null; cancel_hours: number; check_in_time: string; check_out_time: string }
}

export interface StayConfirmBody { hold_token: string; payment_intent_id?: string | null; special_requests?: string | null }

/** Anything that carries a coupon verdict — a service quote or a stay quote. */
export interface Priced { coupon: Quote['coupon'] }

export interface CancelReply {
  booking: PortalBooking
  refund: { outcome: 'none' | 'released' | 'refunded'; amount: number; currency: string; coupon_released: boolean; points_reversed: number }
}
```

- [ ] **Step 4: Calls and error maps**

In `frontend/src/portal/lib/portalApi.ts`:

(a) extend the type import with `CancelReply, StayAvailability, StayCatalogue, StayConfirmBody, StayQuote, StayQuoteBody`;

(b) add to the `portalApi` object, after `resolveCoupon`:

```ts

  // ─── Stay booking (the stay flow) ────────────────────────────────────────
  stayCatalogue: (): Promise<StayCatalogue> => api.get('/v1/member/portal/stays').then(r => r.data),
  stayAvailability: (checkIn: string, checkOut: string, adults: number, children: number): Promise<StayAvailability> =>
    api.get('/v1/member/portal/stays/availability', { params: { check_in: checkIn, check_out: checkOut, adults, children } }).then(r => r.data),
  stayQuote: (body: StayQuoteBody): Promise<StayQuote> => api.post('/v1/member/portal/stays/quote', body).then(r => r.data),
  stayPaymentIntent: (holdToken: string): Promise<PaymentIntentReply> =>
    api.post('/v1/member/portal/stays/payment-intent', { hold_token: holdToken }).then(r => r.data),
  // No Idempotency-Key: a hold is booked once, and a repeated confirm answers the booking it became.
  stayConfirm: (body: StayConfirmBody): Promise<{ booking: PortalBooking; replayed: boolean }> =>
    api.post('/v1/member/portal/stays/confirm', body).then(r => r.data),

  // ─── Cancellation ────────────────────────────────────────────────────────
  cancelBooking: (kind: BookingKind, id: number): Promise<CancelReply> =>
    api.post(`/v1/member/portal/bookings/${kind}/${id}/cancel`).then(r => r.data),
```

(c) add to `BOOK_ERROR_FALLBACK`:

```ts
  hold_expired: 'This took a little too long. Please check the price again.',
  price_changed: 'The price has changed. Please check it again.',
  room_unavailable: 'That room was just booked. Please choose another.',
  pms_unavailable: 'We could not reach the booking system. Please try again in a moment.',
  invalid_stay: 'Those dates cannot be booked online.',
  hold_not_found: 'We could not find that booking. Please start again.',
```

and extend the comment above the map: "… and the stay flow's own codes (`hold_expired`, `price_changed`, `room_unavailable`, `pms_unavailable`, `invalid_stay`, `hold_not_found`)."

(d) append:

```ts
/**
 * Every code the cancel endpoint can answer with, mapped to the exact English sentence
 * `portal.bookings.cancel_error.<code>` carries in the bundle. `not_found` is left out on purpose: the
 * sheet that offers Cancel has already loaded the booking, so it falls back to the generic error.
 * `portalApi.test.ts` proves each one is byte-identical to `portal.en.json`.
 */
const CANCEL_ERROR_FALLBACK: Record<string, string> = {
  outside_policy: 'Free cancellation has ended for this booking. Please contact the venue.',
  not_cancellable: 'This booking cannot be cancelled here. Please contact the venue.',
  already_cancelled: 'This booking is already cancelled.',
  cancel_in_progress: 'This booking is being cancelled. Please check it again in a moment.',
  refund_failed: 'We could not return the payment just now, so the booking was not cancelled. Please try again in a moment.',
  refund_unavailable: 'The payment cannot be returned here. Please contact the venue.',
}

export function cancelErrorKey(code: string | null): string {
  return code !== null && code in CANCEL_ERROR_FALLBACK ? `portal.bookings.cancel_error.${code}` : 'portal.common.error'
}

export function cancelErrorFallback(code: string | null): string {
  return (code !== null && CANCEL_ERROR_FALLBACK[code]) || 'Something went wrong. Please try again.'
}
```

- [ ] **Step 5: `StepStrip` and `CouponField` accept the stay flow**

`frontend/src/portal/pages/book/StepStrip.tsx` — make it generic over the step name (the markup does not change):

```tsx
export interface StepStripProps<S extends string> {
  steps: S[]
  current: S
  labels: Record<S, string>
  ariaLabel: string
  /** True while a card is held against an unconfirmed booking (`!canLeavePay(visit)` — see `steps.ts`) —
   *  every earlier step's button is disabled, with `aria-disabled` and no click handler, rather than let
   *  the member navigate away from an authorised, un-booked charge with no way back to it. */
  locked: boolean
  onJump: (step: S) => void
}
```

```tsx
export function StepStrip<S extends string>({ steps, current, labels, ariaLabel, locked, onJump }: StepStripProps<S>) {
```

and delete the now-unused `import type { Step } from './steps'`.

`frontend/src/portal/pages/book/CouponField.tsx` — in the import replace `Quote` with `Priced`, and in `Props` replace `quote: Quote | null` with `quote: Priced | null`. Nothing else: the component only reads `quote?.coupon?.status`.

- [ ] **Step 6: Fixtures**

Every hand-built `PortalBootstrap` needs the three new policy fields. In `frontend/src/portal/pages/book/testUtils.tsx` and in each test file named above replace

```ts
policies: { services_cancel_hours: 24, booking_cancel_hours: 48, services_cancellation_policy: '' },
```

with

```ts
policies: { services_cancel_hours: 24, booking_cancel_hours: 48, services_cancellation_policy: '', booking_cancellation_policy: '', check_in_time: '15:00', check_out_time: '11:00' },
```

- [ ] **Step 7: Copy, in five languages**

Add the keys below to each bundle: the six sentences into the existing `book` object, the `cancel…` keys and the `cancel_error` object into the existing `bookings` object, and the new top-level `stay` object after `book`. Keep each file's existing formatting (several keys per line). `{{…}}` placeholders are copied exactly.

`portal.en.json`:

```json
"book": {
  "hold_expired": "This took a little too long. Please check the price again.",
  "price_changed": "The price has changed. Please check it again.",
  "room_unavailable": "That room was just booked. Please choose another.",
  "pms_unavailable": "We could not reach the booking system. Please try again in a moment.",
  "invalid_stay": "Those dates cannot be booked online.",
  "hold_not_found": "We could not find that booking. Please start again."
},
"bookings": {
  "cancel": "Cancel booking", "cancel_title": "Cancel this booking?", "cancel_keep": "Keep it", "cancel_confirm": "Yes, cancel it", "cancelling": "Cancelling…",
  "cancel_until": "Free cancellation until", "cancel_ended": "Free cancellation ended",
  "cancel_refund": "We will refund {{amount}} to the card you paid with.", "cancel_release": "The hold on your card will be released. Nothing is charged.",
  "cancel_nothing": "Nothing has been charged for this booking.",
  "cancelled_done": "Your booking is cancelled.", "cancelled_refunded": "We have refunded {{amount}}. It can take 5–10 business days to reach your account.",
  "cancelled_released": "The hold on your card has been released.", "cancelled_coupon": "Your coupon is back with your coupons.",
  "cancel_error": {
    "outside_policy": "Free cancellation has ended for this booking. Please contact the venue.",
    "not_cancellable": "This booking cannot be cancelled here. Please contact the venue.",
    "already_cancelled": "This booking is already cancelled.",
    "cancel_in_progress": "This booking is being cancelled. Please check it again in a moment.",
    "refund_failed": "We could not return the payment just now, so the booking was not cancelled. Please try again in a moment.",
    "refund_unavailable": "The payment cannot be returned here. Please contact the venue."
  }
},
"stay": {
  "title": "Book a stay", "step_dates": "Dates", "step_room": "Room", "step_review": "Review", "step_pay": "Pay",
  "heading_dates": "When would you like to stay?", "heading_room": "Choose a room", "heading_review": "Check the details", "heading_pay": "Confirm your stay",
  "check_in": "Arrival", "check_out": "Departure", "adults": "Adults", "children": "Children", "nights_count": "Nights: {{count}}",
  "see_rooms": "See rooms", "pick_dates": "Choose your arrival and departure dates.",
  "min_nights": "The shortest stay here is {{count}} nights.", "max_nights": "The longest stay you can book online is {{count}} nights.",
  "no_rooms": "No rooms are free for these dates.", "change_dates": "Change dates",
  "party_too_large": "No single room fits your party. Please contact {{venue}} and we will arrange it.",
  "sleeps": "Sleeps {{count}}", "per_night": "{{price}} a night", "total_for_stay": "Total for your stay", "choose": "Choose",
  "extras": "Add-ons", "requests": "Special requests", "requests_hint": "Optional", "room_line": "{{room}} · nights: {{count}}",
  "guests_line": "Adults: {{adults}} · children: {{children}}", "arrival_from": "Arrival from {{time}}", "departure_by": "Departure by {{time}}",
  "free_cancellation": "Free cancellation up to {{count}} hours before arrival.", "confirm": "Confirm stay",
  "chooser_title": "What would you like to book?", "chooser_appointment": "An appointment", "chooser_appointment_hint": "A time with one of our team",
  "chooser_stay": "A stay", "chooser_stay_hint": "A room for one night or more", "cta_home": "Book a stay"
}
```

`portal.ru.json`:

```json
"book": {
  "hold_expired": "Это заняло слишком много времени. Проверьте цену ещё раз.",
  "price_changed": "Цена изменилась. Проверьте её ещё раз.",
  "room_unavailable": "Этот номер только что забронировали. Выберите другой.",
  "pms_unavailable": "Не удалось связаться с системой бронирования. Попробуйте чуть позже.",
  "invalid_stay": "Эти даты нельзя забронировать онлайн.",
  "hold_not_found": "Мы не нашли это бронирование. Начните заново."
},
"bookings": {
  "cancel": "Отменить бронирование", "cancel_title": "Отменить это бронирование?", "cancel_keep": "Оставить", "cancel_confirm": "Да, отменить", "cancelling": "Отменяем…",
  "cancel_until": "Бесплатная отмена до", "cancel_ended": "Бесплатная отмена закончилась",
  "cancel_refund": "Мы вернём {{amount}} на карту, которой вы платили.", "cancel_release": "Блокировка суммы на карте будет снята. Ничего не списывается.",
  "cancel_nothing": "За это бронирование ничего не списано.",
  "cancelled_done": "Бронирование отменено.", "cancelled_refunded": "Мы вернули {{amount}}. Деньги поступят на счёт в течение 5–10 рабочих дней.",
  "cancelled_released": "Блокировка суммы на карте снята.", "cancelled_coupon": "Купон снова среди ваших купонов.",
  "cancel_error": {
    "outside_policy": "Срок бесплатной отмены этого бронирования истёк. Свяжитесь с заведением.",
    "not_cancellable": "Это бронирование нельзя отменить здесь. Свяжитесь с заведением.",
    "already_cancelled": "Это бронирование уже отменено.",
    "cancel_in_progress": "Это бронирование сейчас отменяется. Проверьте его через минуту.",
    "refund_failed": "Сейчас не удалось вернуть оплату, поэтому бронирование не отменено. Попробуйте чуть позже.",
    "refund_unavailable": "Вернуть оплату здесь нельзя. Свяжитесь с заведением."
  }
},
"stay": {
  "title": "Забронировать проживание", "step_dates": "Даты", "step_room": "Номер", "step_review": "Проверка", "step_pay": "Оплата",
  "heading_dates": "Когда вы хотите приехать?", "heading_room": "Выберите номер", "heading_review": "Проверьте детали", "heading_pay": "Подтвердите проживание",
  "check_in": "Заезд", "check_out": "Выезд", "adults": "Взрослые", "children": "Дети", "nights_count": "Ночей: {{count}}",
  "see_rooms": "Показать номера", "pick_dates": "Выберите даты заезда и выезда.",
  "min_nights": "Минимальный срок проживания — ночей: {{count}}.", "max_nights": "Онлайн можно забронировать не больше ночей: {{count}}.",
  "no_rooms": "На эти даты свободных номеров нет.", "change_dates": "Изменить даты",
  "party_too_large": "Ни один номер не вмещает всю вашу компанию. Свяжитесь с {{venue}}, и мы всё устроим.",
  "sleeps": "Гостей: до {{count}}", "per_night": "{{price}} за ночь", "total_for_stay": "Итого за проживание", "choose": "Выбрать",
  "extras": "Дополнительно", "requests": "Особые пожелания", "requests_hint": "Необязательно", "room_line": "{{room}} · ночей: {{count}}",
  "guests_line": "Взрослых: {{adults}} · детей: {{children}}", "arrival_from": "Заезд с {{time}}", "departure_by": "Выезд до {{time}}",
  "free_cancellation": "Бесплатная отмена не позднее чем за {{count}} ч до заезда.", "confirm": "Подтвердить проживание",
  "chooser_title": "Что вы хотите забронировать?", "chooser_appointment": "Запись на услугу", "chooser_appointment_hint": "Время у одного из наших специалистов",
  "chooser_stay": "Проживание", "chooser_stay_hint": "Номер на одну ночь или дольше", "cta_home": "Забронировать проживание"
}
```

`portal.de.json`:

```json
"book": {
  "hold_expired": "Das hat etwas zu lange gedauert. Bitte prüfen Sie den Preis noch einmal.",
  "price_changed": "Der Preis hat sich geändert. Bitte prüfen Sie ihn noch einmal.",
  "room_unavailable": "Dieses Zimmer wurde gerade gebucht. Bitte wählen Sie ein anderes.",
  "pms_unavailable": "Das Buchungssystem ist gerade nicht erreichbar. Bitte versuchen Sie es gleich noch einmal.",
  "invalid_stay": "Diese Daten können nicht online gebucht werden.",
  "hold_not_found": "Wir konnten diese Buchung nicht finden. Bitte beginnen Sie von vorn."
},
"bookings": {
  "cancel": "Buchung stornieren", "cancel_title": "Diese Buchung stornieren?", "cancel_keep": "Behalten", "cancel_confirm": "Ja, stornieren", "cancelling": "Wird storniert…",
  "cancel_until": "Kostenlose Stornierung bis", "cancel_ended": "Die kostenlose Stornierung endete am",
  "cancel_refund": "Wir erstatten {{amount}} auf die Karte, mit der Sie bezahlt haben.", "cancel_release": "Die Reservierung des Betrags auf Ihrer Karte wird aufgehoben. Es wird nichts abgebucht.",
  "cancel_nothing": "Für diese Buchung wurde nichts abgebucht.",
  "cancelled_done": "Ihre Buchung ist storniert.", "cancelled_refunded": "Wir haben {{amount}} erstattet. Es kann 5–10 Werktage dauern, bis der Betrag auf Ihrem Konto ist.",
  "cancelled_released": "Die Reservierung des Betrags auf Ihrer Karte wurde aufgehoben.", "cancelled_coupon": "Ihr Gutschein ist wieder bei Ihren Gutscheinen.",
  "cancel_error": {
    "outside_policy": "Die kostenlose Stornierung ist für diese Buchung abgelaufen. Bitte wenden Sie sich an das Haus.",
    "not_cancellable": "Diese Buchung kann hier nicht storniert werden. Bitte wenden Sie sich an das Haus.",
    "already_cancelled": "Diese Buchung ist bereits storniert.",
    "cancel_in_progress": "Diese Buchung wird gerade storniert. Bitte sehen Sie gleich noch einmal nach.",
    "refund_failed": "Die Zahlung konnte gerade nicht zurückgegeben werden, deshalb wurde die Buchung nicht storniert. Bitte versuchen Sie es gleich noch einmal.",
    "refund_unavailable": "Die Zahlung kann hier nicht zurückgegeben werden. Bitte wenden Sie sich an das Haus."
  }
},
"stay": {
  "title": "Aufenthalt buchen", "step_dates": "Daten", "step_room": "Zimmer", "step_review": "Prüfen", "step_pay": "Bezahlen",
  "heading_dates": "Wann möchten Sie kommen?", "heading_room": "Wählen Sie ein Zimmer", "heading_review": "Prüfen Sie die Angaben", "heading_pay": "Aufenthalt bestätigen",
  "check_in": "Anreise", "check_out": "Abreise", "adults": "Erwachsene", "children": "Kinder", "nights_count": "Nächte: {{count}}",
  "see_rooms": "Zimmer anzeigen", "pick_dates": "Wählen Sie Ihre An- und Abreise.",
  "min_nights": "Der kürzeste Aufenthalt hier: {{count}} Nächte.", "max_nights": "Online buchbar sind höchstens {{count}} Nächte.",
  "no_rooms": "Für diese Daten ist kein Zimmer frei.", "change_dates": "Daten ändern",
  "party_too_large": "Kein einzelnes Zimmer bietet Platz für Ihre Gruppe. Bitte wenden Sie sich an {{venue}}, wir kümmern uns darum.",
  "sleeps": "Für bis zu {{count}} Gäste", "per_night": "{{price}} pro Nacht", "total_for_stay": "Gesamtpreis für Ihren Aufenthalt", "choose": "Auswählen",
  "extras": "Extras", "requests": "Besondere Wünsche", "requests_hint": "Optional", "room_line": "{{room}} · Nächte: {{count}}",
  "guests_line": "Erwachsene: {{adults}} · Kinder: {{children}}", "arrival_from": "Anreise ab {{time}}", "departure_by": "Abreise bis {{time}}",
  "free_cancellation": "Kostenlose Stornierung bis {{count}} Stunden vor der Anreise.", "confirm": "Aufenthalt bestätigen",
  "chooser_title": "Was möchten Sie buchen?", "chooser_appointment": "Einen Termin", "chooser_appointment_hint": "Eine Zeit bei jemandem aus unserem Team",
  "chooser_stay": "Einen Aufenthalt", "chooser_stay_hint": "Ein Zimmer für eine Nacht oder länger", "cta_home": "Aufenthalt buchen"
}
```

`portal.fr.json`:

```json
"book": {
  "hold_expired": "Cela a pris un peu trop de temps. Veuillez vérifier le prix à nouveau.",
  "price_changed": "Le prix a changé. Veuillez le vérifier à nouveau.",
  "room_unavailable": "Cette chambre vient d'être réservée. Veuillez en choisir une autre.",
  "pms_unavailable": "Le système de réservation est injoignable. Veuillez réessayer dans un instant.",
  "invalid_stay": "Ces dates ne peuvent pas être réservées en ligne.",
  "hold_not_found": "Nous n'avons pas trouvé cette réservation. Veuillez recommencer."
},
"bookings": {
  "cancel": "Annuler la réservation", "cancel_title": "Annuler cette réservation ?", "cancel_keep": "La garder", "cancel_confirm": "Oui, annuler", "cancelling": "Annulation…",
  "cancel_until": "Annulation gratuite jusqu'au", "cancel_ended": "L'annulation gratuite a pris fin le",
  "cancel_refund": "Nous rembourserons {{amount}} sur la carte utilisée pour le paiement.", "cancel_release": "Le montant bloqué sur votre carte sera libéré. Rien n'est débité.",
  "cancel_nothing": "Rien n'a été débité pour cette réservation.",
  "cancelled_done": "Votre réservation est annulée.", "cancelled_refunded": "Nous avons remboursé {{amount}}. Le montant peut mettre 5 à 10 jours ouvrés à apparaître sur votre compte.",
  "cancelled_released": "Le montant bloqué sur votre carte a été libéré.", "cancelled_coupon": "Votre coupon est de nouveau parmi vos coupons.",
  "cancel_error": {
    "outside_policy": "L'annulation gratuite n'est plus possible pour cette réservation. Veuillez contacter l'établissement.",
    "not_cancellable": "Cette réservation ne peut pas être annulée ici. Veuillez contacter l'établissement.",
    "already_cancelled": "Cette réservation est déjà annulée.",
    "cancel_in_progress": "Cette réservation est en cours d'annulation. Veuillez vérifier dans un instant.",
    "refund_failed": "Le paiement n'a pas pu être restitué pour le moment, la réservation n'a donc pas été annulée. Veuillez réessayer dans un instant.",
    "refund_unavailable": "Le paiement ne peut pas être restitué ici. Veuillez contacter l'établissement."
  }
},
"stay": {
  "title": "Réserver un séjour", "step_dates": "Dates", "step_room": "Chambre", "step_review": "Vérification", "step_pay": "Paiement",
  "heading_dates": "Quand souhaitez-vous venir ?", "heading_room": "Choisissez une chambre", "heading_review": "Vérifiez les détails", "heading_pay": "Confirmez votre séjour",
  "check_in": "Arrivée", "check_out": "Départ", "adults": "Adultes", "children": "Enfants", "nights_count": "Nuits : {{count}}",
  "see_rooms": "Voir les chambres", "pick_dates": "Choisissez vos dates d'arrivée et de départ.",
  "min_nights": "Le séjour le plus court ici : {{count}} nuits.", "max_nights": "En ligne, vous pouvez réserver au plus {{count}} nuits.",
  "no_rooms": "Aucune chambre n'est libre à ces dates.", "change_dates": "Changer les dates",
  "party_too_large": "Aucune chambre ne peut accueillir tout votre groupe. Veuillez contacter {{venue}}, nous nous en occupons.",
  "sleeps": "Jusqu'à {{count}} personnes", "per_night": "{{price}} la nuit", "total_for_stay": "Total de votre séjour", "choose": "Choisir",
  "extras": "Suppléments", "requests": "Demandes particulières", "requests_hint": "Facultatif", "room_line": "{{room}} · nuits : {{count}}",
  "guests_line": "Adultes : {{adults}} · enfants : {{children}}", "arrival_from": "Arrivée à partir de {{time}}", "departure_by": "Départ avant {{time}}",
  "free_cancellation": "Annulation gratuite jusqu'à {{count}} heures avant l'arrivée.", "confirm": "Confirmer le séjour",
  "chooser_title": "Que souhaitez-vous réserver ?", "chooser_appointment": "Un rendez-vous", "chooser_appointment_hint": "Un créneau avec un membre de notre équipe",
  "chooser_stay": "Un séjour", "chooser_stay_hint": "Une chambre pour une nuit ou plus", "cta_home": "Réserver un séjour"
}
```

`portal.es.json`:

```json
"book": {
  "hold_expired": "Esto ha tardado un poco más de la cuenta. Compruebe el precio de nuevo.",
  "price_changed": "El precio ha cambiado. Compruébelo de nuevo.",
  "room_unavailable": "Esa habitación acaba de reservarse. Elija otra.",
  "pms_unavailable": "No hemos podido conectar con el sistema de reservas. Inténtelo de nuevo en un momento.",
  "invalid_stay": "Esas fechas no se pueden reservar en línea.",
  "hold_not_found": "No hemos encontrado esa reserva. Empiece de nuevo."
},
"bookings": {
  "cancel": "Cancelar la reserva", "cancel_title": "¿Cancelar esta reserva?", "cancel_keep": "Mantenerla", "cancel_confirm": "Sí, cancelar", "cancelling": "Cancelando…",
  "cancel_until": "Cancelación gratuita hasta el", "cancel_ended": "La cancelación gratuita terminó el",
  "cancel_refund": "Le devolveremos {{amount}} a la tarjeta con la que pagó.", "cancel_release": "Se liberará el importe retenido en su tarjeta. No se cobra nada.",
  "cancel_nothing": "No se ha cobrado nada por esta reserva.",
  "cancelled_done": "Su reserva está cancelada.", "cancelled_refunded": "Hemos devuelto {{amount}}. Puede tardar entre 5 y 10 días hábiles en llegar a su cuenta.",
  "cancelled_released": "Se ha liberado el importe retenido en su tarjeta.", "cancelled_coupon": "Su cupón vuelve a estar entre sus cupones.",
  "cancel_error": {
    "outside_policy": "La cancelación gratuita de esta reserva ha terminado. Póngase en contacto con el establecimiento.",
    "not_cancellable": "Esta reserva no se puede cancelar aquí. Póngase en contacto con el establecimiento.",
    "already_cancelled": "Esta reserva ya está cancelada.",
    "cancel_in_progress": "Esta reserva se está cancelando. Compruébela de nuevo en un momento.",
    "refund_failed": "Ahora mismo no hemos podido devolver el pago, así que la reserva no se ha cancelado. Inténtelo de nuevo en un momento.",
    "refund_unavailable": "El pago no se puede devolver aquí. Póngase en contacto con el establecimiento."
  }
},
"stay": {
  "title": "Reservar una estancia", "step_dates": "Fechas", "step_room": "Habitación", "step_review": "Revisión", "step_pay": "Pago",
  "heading_dates": "¿Cuándo le gustaría venir?", "heading_room": "Elija una habitación", "heading_review": "Revise los detalles", "heading_pay": "Confirme su estancia",
  "check_in": "Llegada", "check_out": "Salida", "adults": "Adultos", "children": "Niños", "nights_count": "Noches: {{count}}",
  "see_rooms": "Ver habitaciones", "pick_dates": "Elija sus fechas de llegada y de salida.",
  "min_nights": "La estancia más corta aquí: {{count}} noches.", "max_nights": "En línea puede reservar como máximo {{count}} noches.",
  "no_rooms": "No hay habitaciones libres para estas fechas.", "change_dates": "Cambiar las fechas",
  "party_too_large": "Ninguna habitación tiene sitio para todo su grupo. Póngase en contacto con {{venue}} y lo organizamos.",
  "sleeps": "Hasta {{count}} personas", "per_night": "{{price}} por noche", "total_for_stay": "Total de su estancia", "choose": "Elegir",
  "extras": "Extras", "requests": "Peticiones especiales", "requests_hint": "Opcional", "room_line": "{{room}} · noches: {{count}}",
  "guests_line": "Adultos: {{adults}} · niños: {{children}}", "arrival_from": "Llegada a partir de las {{time}}", "departure_by": "Salida antes de las {{time}}",
  "free_cancellation": "Cancelación gratuita hasta {{count}} horas antes de la llegada.", "confirm": "Confirmar la estancia",
  "chooser_title": "¿Qué le gustaría reservar?", "chooser_appointment": "Una cita", "chooser_appointment_hint": "Una hora con alguien de nuestro equipo",
  "chooser_stay": "Una estancia", "chooser_stay_hint": "Una habitación para una noche o más", "cta_home": "Reservar una estancia"
}
```

Counts are written "Nights: 2", never "2 nights": the bundle has no plural forms and Russian has three.

- [ ] **Step 8: Run the checks**

Run (in `frontend/`): `npx tsc -b && npx vitest run src/portal && npx eslint src/portal`
Expected: `tsc` and `eslint` clean; vitest green — `portalLocales.test.ts` proves the five bundles carry the same keys, `localeCompleteness.test.ts` that none is empty.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/portal
git commit -m "Add the stay and cancellation types, calls and copy in five languages

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 16: The stay flow — dates, guests and room

**Files:**
- Create: `frontend/src/portal/pages/stay/staySteps.ts`, `frontend/src/portal/pages/stay/staySteps.test.ts`, `frontend/src/portal/pages/stay/DatesStep.tsx`, `frontend/src/portal/pages/stay/RoomStep.tsx`, `frontend/src/portal/pages/stay/StayBook.tsx`, `frontend/src/portal/pages/stay/stayTestUtils.tsx`, `frontend/src/portal/pages/stay/stayBook.test.tsx`

**Interfaces:**
- Consumes: Task 15's types and calls; `PayVisit`, `newPayVisit`, `canLeavePay` from `pages/book/steps.ts`; `StepStrip`, `BookNotice` from `pages/book/`; `venueToday`, `formatDay`, `resolveLocale` from `lib/dates.ts`.
- Produces (from `staySteps.ts`):
  - `type StayStep = 'dates' | 'room' | 'review' | 'pay'`, `STAY_STEPS: StayStep[]`
  - `interface StayState { step; checkIn: string | null; checkOut: string | null; adults: number; children: number; roomId: string | null; extras: string[]; coupon: CouponRef | null; requests: string; notice: { step: StayStep; code: string } | null; quote: StayQuote | null; visit: PayVisit | null }`, `initialStayState`
  - `type StayReviewPatch = Partial<Pick<StayState, 'extras' | 'coupon' | 'requests'>>`
  - `type StayAction` — `setDates {checkIn, checkOut}`, `setGuests {adults, children}`, `search`, `pickRoom {roomId}`, `patchReview {patch}`, `continueToPay {requests, quote, visit}`, `jump {step}`, `bounce {to: 'dates'|'room'|'review', code, clearRoom}`, `visit {patch}`, `reset`
  - `stayReducer(state, action): StayState`
  - `addDays(day: string, n: number): string`, `nightsBetween(checkIn: string, checkOut: string): number`
  - `datesProblem(checkIn, checkOut, rules: StayRules, today: string): { code: 'pick_dates' | 'min_nights' | 'max_nights'; count: number } | null`
  - `stayFocusTarget(step: StayStep, hasNotice: boolean)`, `afterStayQuoteError(code)`, `afterStayConfirmError(code)` (both used by Task 17)
  - `stayQuoteBody(state: StayState): StayQuoteBody`
- Produces: `<StayBook />` — Task 17 fills its `review` and `pay` steps; this task renders `dates` and `room`.

- [ ] **Step 1: Write the failing reducer tests**

Create `frontend/src/portal/pages/stay/staySteps.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { newPayVisit } from '../book/steps'
import type { StayQuote } from '../../lib/types'
import {
  addDays, afterStayConfirmError, afterStayQuoteError, datesProblem, initialStayState, nightsBetween, stayFocusTarget, stayQuoteBody, stayReducer, type StayState,
} from './staySteps'

const rules = { currency: 'EUR', min_nights: 2, max_nights: 14 }
const picked: StayState = { ...initialStayState, checkIn: '2026-10-10', checkOut: '2026-10-12', adults: 2, children: 1 }
const quote = { hold_token: 'H', total_amount: 180 } as unknown as StayQuote
const visit = newPayVisit((() => { let n = 0; return () => `id-${n++}` })())

describe('dates', () => {
  it('adds days across a month end and counts nights', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(nightsBetween('2026-10-10', '2026-10-12')).toBe(2)
    expect(nightsBetween('2026-10-30', '2026-11-02')).toBe(3)
    expect(nightsBetween('2026-10-12', '2026-10-10')).toBe(-2)
  })

  it('names what is wrong with a pair of dates, or nothing', () => {
    expect(datesProblem(null, null, rules, '2026-10-01')).toEqual({ code: 'pick_dates', count: 0 })
    expect(datesProblem('2026-10-10', null, rules, '2026-10-01')).toEqual({ code: 'pick_dates', count: 0 })
    expect(datesProblem('2026-09-30', '2026-10-03', rules, '2026-10-01')).toEqual({ code: 'pick_dates', count: 0 })
    expect(datesProblem('2026-10-10', '2026-10-10', rules, '2026-10-01')).toEqual({ code: 'pick_dates', count: 0 })
    expect(datesProblem('2026-10-10', '2026-10-11', rules, '2026-10-01')).toEqual({ code: 'min_nights', count: 2 })
    expect(datesProblem('2026-10-10', '2026-10-25', rules, '2026-10-01')).toEqual({ code: 'max_nights', count: 14 })
    expect(datesProblem('2026-10-10', '2026-10-12', rules, '2026-10-01')).toBeNull()
    expect(datesProblem('2026-10-01', '2026-10-03', rules, '2026-10-01')).toBeNull()
  })
})

describe('stayReducer', () => {
  it('moving the arrival past the departure clears the departure; new dates drop the room and its quote', () => {
    const withRoom: StayState = { ...picked, roomId: '101', quote, extras: ['3'], step: 'review' }
    const next = stayReducer(withRoom, { type: 'setDates', checkIn: '2026-10-15', checkOut: '2026-10-12' })
    expect(next.checkIn).toBe('2026-10-15')
    expect(next.checkOut).toBeNull()
    expect(next.roomId).toBeNull()
    expect(next.quote).toBeNull()
    expect(next.extras).toEqual(['3'])
  })

  it('changing the party drops the room too: a room is chosen for a party', () => {
    const next = stayReducer({ ...picked, roomId: '101' }, { type: 'setGuests', adults: 4, children: 0 })
    expect(next).toMatchObject({ adults: 4, children: 0, roomId: null })
  })

  it('search goes to the rooms, a room goes to review', () => {
    expect(stayReducer(picked, { type: 'search' }).step).toBe('room')
    expect(stayReducer({ ...picked, step: 'room' }, { type: 'pickRoom', roomId: '101' })).toMatchObject({ roomId: '101', step: 'review' })
  })

  it('a new room forgets the coupon verdict of the old one but keeps the choices', () => {
    const next = stayReducer({ ...picked, roomId: '101', coupon: { member_offer_id: 7 }, extras: ['3'], quote }, { type: 'pickRoom', roomId: '102' })
    expect(next.coupon).toEqual({ member_offer_id: 7 })
    expect(next.extras).toEqual(['3'])
    expect(next.quote).toBeNull()
  })

  it('continue carries the requests with the quote in one step', () => {
    const next = stayReducer({ ...picked, roomId: '101', step: 'review' }, { type: 'continueToPay', requests: 'Quiet room', quote, visit })
    expect(next).toMatchObject({ step: 'pay', requests: 'Quiet room', quote, visit })
  })

  it('a bounce drops the visit and the quote, shows the code, and clears the room only when told', () => {
    const paying: StayState = { ...picked, roomId: '101', quote, visit, step: 'pay' }
    const toRoom = stayReducer(paying, { type: 'bounce', to: 'room', code: 'room_unavailable', clearRoom: true })
    expect(toRoom).toMatchObject({ step: 'room', roomId: null, visit: null, quote: null, notice: { step: 'room', code: 'room_unavailable' } })
    const toReview = stayReducer(paying, { type: 'bounce', to: 'review', code: 'price_changed', clearRoom: false })
    expect(toReview).toMatchObject({ step: 'review', roomId: '101', visit: null, quote: null, notice: { step: 'review', code: 'price_changed' } })
  })

  it('every choice the member makes clears the notice', () => {
    const noticed: StayState = { ...picked, roomId: '101', step: 'review', notice: { step: 'review', code: 'price_changed' } }
    expect(stayReducer(noticed, { type: 'patchReview', patch: { extras: ['3'] } }).notice).toBeNull()
    expect(stayReducer(noticed, { type: 'jump', step: 'dates' }).notice).toBeNull()
    expect(stayReducer(noticed, { type: 'setGuests', adults: 1, children: 0 }).notice).toBeNull()
  })

  it('a late callback cannot bring a dropped visit back', () => {
    expect(stayReducer({ ...picked, visit: null }, { type: 'visit', patch: { paid: true } }).visit).toBeNull()
    expect(stayReducer({ ...picked, visit }, { type: 'visit', patch: { held: true } }).visit).toMatchObject({ held: true })
  })

  it('reset is a clean start', () => {
    expect(stayReducer({ ...picked, roomId: '101', quote, visit, step: 'pay' }, { type: 'reset' })).toEqual(initialStayState)
  })
})

describe('stayQuoteBody', () => {
  it('names the room, the dates, the party, one of each extra and the coupon', () => {
    expect(stayQuoteBody({ ...picked, roomId: '101', extras: ['3', '5'], coupon: { redemption_id: 9 }, requests: 'ignored here' })).toEqual({
      unit_id: '101', check_in: '2026-10-10', check_out: '2026-10-12', adults: 2, children: 1,
      extras: [{ id: '3', quantity: 1 }, { id: '5', quantity: 1 }], coupon: { redemption_id: 9 },
    })
  })
})

describe('afterStayQuoteError', () => {
  it('a coupon error clears the coupon and names the code', () => {
    expect(afterStayQuoteError('coupon_used')).toEqual({ patch: { coupon: null }, noticeCode: 'coupon_used', to: null })
  })

  it('a room that is gone sends the member back to the rooms; bad dates back to the dates', () => {
    expect(afterStayQuoteError('room_unavailable')).toEqual({ patch: null, noticeCode: 'room_unavailable', to: 'room' })
    expect(afterStayQuoteError('not_found')).toEqual({ patch: null, noticeCode: 'room_unavailable', to: 'room' })
    expect(afterStayQuoteError('invalid_stay')).toEqual({ patch: null, noticeCode: 'invalid_stay', to: 'dates' })
  })

  it('nothing for an add-on error (shown in place), an unknown code, or no error', () => {
    expect(afterStayQuoteError('extra_lead_time')).toBeNull()
    expect(afterStayQuoteError('something_else')).toBeNull()
    expect(afterStayQuoteError(null)).toBeNull()
  })
})

describe('afterStayConfirmError', () => {
  it('no answer at all: stay and retry — the same hold and payment are sent again, and a hold is booked once', () => {
    expect(afterStayConfirmError(null)).toEqual({ to: null, clearRoom: false })
  })

  it('the room is gone: back to the rooms without it', () => {
    expect(afterStayConfirmError('room_unavailable')).toEqual({ to: 'room', clearRoom: true })
  })

  it('bad dates: back to the dates', () => {
    expect(afterStayConfirmError('invalid_stay')).toEqual({ to: 'dates', clearRoom: true })
  })

  it('every other answer of the server: back to review, which asks for a fresh price and a fresh hold', () => {
    for (const code of ['hold_expired', 'price_changed', 'payment_mismatch', 'payment_required', 'coupon_used', 'pms_unavailable', 'confirm_failed', 'hold_not_found', 'no_membership', 'never_seen_before']) {
      expect(afterStayConfirmError(code)).toEqual({ to: 'review', clearRoom: false })
    }
  })
})

describe('stayFocusTarget', () => {
  it('the notice first, else the heading of the step', () => {
    expect(stayFocusTarget('room', true)).toEqual({ kind: 'notice' })
    expect(stayFocusTarget('room', false)).toEqual({ kind: 'heading', step: 'room' })
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/portal/pages/stay/staySteps.test.ts`
Expected: FAIL — `Cannot find module './staySteps'`.

- [ ] **Step 3: `staySteps.ts`**

Create `frontend/src/portal/pages/stay/staySteps.ts`:

```ts
import type { CouponRef, StayQuote, StayQuoteBody, StayRules } from '../../lib/types'
import type { PayVisit } from '../book/steps'

export type StayStep = 'dates' | 'room' | 'review' | 'pay'
export const STAY_STEPS: StayStep[] = ['dates', 'room', 'review', 'pay']

export interface StayState {
  step: StayStep
  /** Calendar days, `YYYY-MM-DD`, in the venue's own calendar. */
  checkIn: string | null
  checkOut: string | null
  adults: number
  children: number
  /** A room's id is a string: the PMS id when the room has one. */
  roomId: string | null
  /** Extra ids; one of each. */
  extras: string[]
  coupon: CouponRef | null
  requests: string
  /** The error CODE to show on the step a bounce landed on; cleared by the member's next choice. */
  notice: { step: StayStep; code: string } | null
  /** The quote the member accepted with Review's Continue — what Pay charges and confirms. It names the hold. */
  quote: StayQuote | null
  visit: PayVisit | null
}

export const initialStayState: StayState = {
  step: 'dates', checkIn: null, checkOut: null, adults: 2, children: 0, roomId: null, extras: [], coupon: null, requests: '',
  notice: null, quote: null, visit: null,
}

export type StayReviewPatch = Partial<Pick<StayState, 'extras' | 'coupon' | 'requests'>>

export type StayAction =
  | { type: 'setDates'; checkIn: string | null; checkOut: string | null }
  | { type: 'setGuests'; adults: number; children: number }
  | { type: 'search' }
  | { type: 'pickRoom'; roomId: string }
  | { type: 'patchReview'; patch: StayReviewPatch }
  /** Review's Continue: the requests typed there travel WITH the step change. */
  | { type: 'continueToPay'; requests: string; quote: StayQuote; visit: PayVisit }
  | { type: 'jump'; step: StayStep }
  /** A quote or confirm error that sends the member back. The server has released whatever it held. */
  | { type: 'bounce'; to: 'dates' | 'room' | 'review'; code: string; clearRoom: boolean }
  | { type: 'visit'; patch: Partial<PayVisit> }
  | { type: 'reset' }

/**
 * Every state transition of the stay flow, pure, so each is unit-tested directly (the frontend tests render to
 * a string and never run a handler). `StayBook.tsx` dispatches these through `useReducer`; no handler builds
 * the next state from a `state` its render closure captured.
 *
 * A room is chosen for a set of dates and a party: changing either drops the room and the quote made for it.
 * Extras, the coupon and the requests are the member's own choices and survive.
 */
export function stayReducer(state: StayState, action: StayAction): StayState {
  switch (action.type) {
    case 'setDates': {
      const checkOut = action.checkIn && action.checkOut && action.checkOut > action.checkIn ? action.checkOut : null
      return { ...state, checkIn: action.checkIn, checkOut, roomId: null, quote: null, notice: null }
    }
    case 'setGuests':
      return { ...state, adults: action.adults, children: action.children, roomId: null, quote: null, notice: null }
    case 'search':
      return { ...state, step: 'room', notice: null }
    case 'pickRoom':
      return { ...state, roomId: action.roomId, quote: null, notice: null, step: 'review' }
    case 'patchReview':
      return { ...state, ...action.patch, notice: null }
    case 'continueToPay':
      return { ...state, requests: action.requests, quote: action.quote, visit: action.visit, notice: null, step: 'pay' }
    case 'jump':
      return { ...state, step: action.step, notice: null }
    case 'bounce':
      return {
        ...state,
        step: action.to,
        roomId: action.clearRoom ? null : state.roomId,
        quote: null,
        visit: null,
        notice: { step: action.to, code: action.code },
      }
    case 'visit':
      // A late callback (Stripe answering after the visit was dropped) must not bring a dropped visit back.
      return state.visit ? { ...state, visit: { ...state.visit, ...action.patch } } : state
    case 'reset':
      return initialStayState
  }
}

/** Calendar arithmetic in UTC, so a day never shifts with the clock or the client's zone. */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function nightsBetween(checkIn: string, checkOut: string): number {
  return Math.round((Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / 86_400_000)
}

/**
 * What stops these dates from being searched, or null. The server enforces the same (`invalid_stay`); this is
 * what lets the page say which rule, before asking. `today` is the venue's own day.
 */
export function datesProblem(checkIn: string | null, checkOut: string | null, rules: StayRules, today: string): { code: 'pick_dates' | 'min_nights' | 'max_nights'; count: number } | null {
  if (!checkIn || !checkOut || checkIn < today || checkOut <= checkIn) return { code: 'pick_dates', count: 0 }
  const nights = nightsBetween(checkIn, checkOut)
  if (nights < rules.min_nights) return { code: 'min_nights', count: rules.min_nights }
  if (nights > rules.max_nights) return { code: 'max_nights', count: rules.max_nights }
  return null
}

/** The requests are sent at confirm, never here: they cost nothing, so they must not ask for a new price. */
export function stayQuoteBody(state: StayState): StayQuoteBody {
  return {
    unit_id: state.roomId!,
    check_in: state.checkIn!,
    check_out: state.checkOut!,
    adults: state.adults,
    children: state.children,
    extras: state.extras.map(id => ({ id, quantity: 1 })),
    coupon: state.coupon,
  }
}

export type StayFocusTarget = { kind: 'notice' } | { kind: 'heading'; step: StayStep }

export function stayFocusTarget(step: StayStep, hasNotice: boolean): StayFocusTarget {
  return hasNotice ? { kind: 'notice' } : { kind: 'heading', step }
}

/**
 * What an error from the stay quote means for Review. A `coupon_*` error clears the coupon and is shown next
 * to it; a room that is gone (`room_unavailable`, or `not_found` for a room the venue switched off since)
 * sends the member back to the rooms; dates the venue does not sell, back to the dates. `extra_lead_time` is
 * shown in place, next to the add-ons. Anything else gets Review's own "try again".
 */
export function afterStayQuoteError(code: string | null): { patch: StayReviewPatch | null; noticeCode: string; to: 'dates' | 'room' | null } | null {
  if (code === null) return null
  if (code.startsWith('coupon_')) return { patch: { coupon: null }, noticeCode: code, to: null }
  if (code === 'room_unavailable' || code === 'not_found') return { patch: null, noticeCode: 'room_unavailable', to: 'room' }
  if (code === 'invalid_stay') return { patch: null, noticeCode: 'invalid_stay', to: 'dates' }
  return null
}

export interface StayConfirmDecision {
  /** Which step to go back to, or `null` to stay on Pay and offer a retry of the same confirm. */
  to: 'dates' | 'room' | 'review' | null
  clearRoom: boolean
}

/**
 * What an error from the stay confirm means for Pay. No answer at all (a network error) stays on Pay: the
 * retry sends the same hold and the same payment, and a hold is booked once — if the first attempt did book,
 * the retry answers that booking. Every answer the server gives means it has released whatever it held, so
 * the member goes back: to the rooms when the room is gone, to the dates when the dates are, and otherwise to
 * Review, which asks for a fresh price and with it a fresh hold.
 */
export function afterStayConfirmError(code: string | null): StayConfirmDecision {
  if (code === null) return { to: null, clearRoom: false }
  if (code === 'room_unavailable') return { to: 'room', clearRoom: true }
  if (code === 'invalid_stay') return { to: 'dates', clearRoom: true }
  return { to: 'review', clearRoom: false }
}
```

Run: `npx vitest run src/portal/pages/stay/staySteps.test.ts` — expected: all pass.

- [ ] **Step 4: Write the failing page tests**

Create `frontend/src/portal/pages/stay/stayTestUtils.tsx`:

```tsx
import { base } from '../book/testUtils'
import type { PortalBootstrap, StayAvailability, StayCatalogue, StayQuote } from '../../lib/types'

/** Fixtures for the stay flow's tests; the render helpers are `pages/book/testUtils`' own. */

export const stayCatalogue: StayCatalogue = {
  rooms: [
    { id: '101', name: 'Sea view', description: null, short_description: 'A balcony over the bay', max_guests: 2, bedrooms: 1, bed_type: 'King', size: '24 m²', image: null, gallery: [], amenities: ['Balcony'], tags: [], base_price: 100 },
    { id: '102', name: 'Garden', description: null, short_description: null, max_guests: 3, bedrooms: 1, bed_type: null, size: null, image: null, gallery: [], amenities: [], tags: [], base_price: 90 },
  ],
  extras: [{ id: '3', name: 'Breakfast', description: null, price: 15, price_type: 'per_stay', lead_time_hours: 0, image: null, icon: null, category: null }],
  policies: { check_in_time: '15:00', check_out_time: '11:00', cancellation_policy: 'Free until two days before.', payment_terms: null, cancel_hours: 48 },
  rules: { currency: 'EUR', min_nights: 1, max_nights: 30 },
  pricing: { automatic: { label: '10% off stays', type: 'percent_discount', value: 10 } },
  payment: { mode: 'at_venue', reason: 'payments_off' },
}

export const availability: StayAvailability = {
  nights: 2,
  party_too_large: false,
  rooms: [
    { id: '101', name: 'Sea view', short_description: 'A balcony over the bay', max_guests: 2, bedrooms: 1, bed_type: 'King', size: '24 m²', image: null, gallery: [], amenities: ['Balcony'], price_per_night: 100, total_price: 200, member_total: 180, currency: 'EUR', min_stay: 1 },
    { id: '102', name: 'Garden', short_description: null, max_guests: 3, bedrooms: 1, bed_type: null, size: null, image: null, gallery: [], amenities: [], price_per_night: 90, total_price: 180, member_total: 180, currency: 'EUR', min_stay: 1 },
  ],
}

export const stayQuote: StayQuote = {
  hold_token: 'HOLD-TOKEN-1', expires_at: '2026-10-01T09:10:00Z', room: { id: '101', name: 'Sea view' },
  check_in: '2026-10-10', check_out: '2026-10-12', nights: 2, adults: 2, children: 0,
  lines: { room_total: 200, price_per_night: 100, extras: [{ id: '3', name: 'Breakfast', unit_price: 15, quantity: 1, line_total: 15 }], extras_total: 15 },
  list_amount: 215, discount: { amount: 21.5, label: '10% off stays', source: 'tier_benefit' }, coupon: null, total_amount: 193.5, currency: 'EUR',
  payment: { mode: 'at_venue', reason: 'payments_off' },
  policy: { cancellation_policy: 'Free until two days before.', cancel_hours: 48, check_in_time: '15:00', check_out_time: '11:00' },
}

export const stayVenue: PortalBootstrap = {
  ...base,
  venue: { ...base.venue, name: 'Seaside Hotel', industry: 'hotel', contact: { email: 'hello@seaside.test', phone: null } },
  capabilities: { ...base.capabilities, services: false, stays: true },
}
```

Create `frontend/src/portal/pages/stay/stayBook.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { render, renderAsync } from '../book/testUtils'
import { DatesStep } from './DatesStep'
import { RoomStep } from './RoomStep'
import { StayBook } from './StayBook'
import { initialStayState } from './staySteps'
import { availability, stayCatalogue, stayVenue } from './stayTestUtils'

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
vi.mock('../../lib/portalApi', async () => {
  const actual = await vi.importActual<typeof import('../../lib/portalApi')>('../../lib/portalApi')
  const never = () => new Promise(() => {})
  return { ...actual, portalApi: { ...actual.portalApi, stayCatalogue: never, stayAvailability: never, stayQuote: never, stayPaymentIntent: never, stayConfirm: never, offers: never, redemptions: never } }
})

const noop = () => {}
const picked = { ...initialStayState, checkIn: '2026-10-10', checkOut: '2026-10-12' }

describe('StayBook', () => {
  it('says so when the venue sells no stays online', () => {
    const html = render(<StayBook />, { ...stayVenue, capabilities: { ...stayVenue.capabilities, stays: false } })
    expect(html).toContain('Online booking is not available for this venue yet.')
  })

  it('starts on the dates, with the four steps named', () => {
    const html = render(<StayBook />, stayVenue, c => c.setQueryData(['portal-stay-catalogue'], stayCatalogue), '/portal/book/stay')
    expect(html).toContain('Book a stay')
    for (const label of ['Dates', 'Room', 'Review', 'Pay']) expect(html).toContain(label)
    expect(html).toMatch(/<h2[^>]*tabindex="-1"[^>]*data-step-heading="dates"/)
    expect(html).toContain('10% off stays applied')
  })

  it('offers a retry when the rooms cannot be loaded', async () => {
    const html = await renderAsync(<StayBook />, stayVenue, async c => {
      await c.prefetchQuery({ queryKey: ['portal-stay-catalogue'], queryFn: () => Promise.reject(new Error('down')), retry: false })
    }, '/portal/book/stay')
    expect(html).toContain('Something went wrong. Please try again.')
    expect(html).toContain('Try again')
  })
})

describe('DatesStep', () => {
  it('asks for both dates and the party, and holds the search back until the dates are chosen', () => {
    const html = render(<DatesStep state={initialStayState} rules={stayCatalogue.rules} timezone="Europe/Riga" onDates={noop} onGuests={noop} onSearch={noop} />, stayVenue)
    expect(html).toContain('Arrival')
    expect(html).toContain('Departure')
    expect(html).toContain('Adults')
    expect(html).toContain('Children')
    expect(html).toMatch(/<input[^>]*type="date"[^>]*min="\d{4}-\d{2}-\d{2}"/)
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>See rooms/)
    expect(html).toContain('Choose your arrival and departure dates.')
  })

  it('counts the nights and lets the member search once the dates fit', () => {
    const html = render(<DatesStep state={picked} rules={stayCatalogue.rules} timezone="Europe/Riga" onDates={noop} onGuests={noop} onSearch={noop} />, stayVenue)
    expect(html).toContain('Nights: 2')
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>See rooms/)
  })

  it('names the venue\'s own limit when the stay is too short or too long', () => {
    const short = render(<DatesStep state={picked} rules={{ ...stayCatalogue.rules, min_nights: 3 }} timezone="Europe/Riga" onDates={noop} onGuests={noop} onSearch={noop} />, stayVenue)
    expect(short).toContain('The shortest stay here is 3 nights.')
    expect(short).toMatch(/<button[^>]*disabled=""[^>]*>See rooms/)
    const long = render(<DatesStep state={{ ...picked, checkOut: '2026-10-30' }} rules={{ ...stayCatalogue.rules, max_nights: 14 }} timezone="Europe/Riga" onDates={noop} onGuests={noop} onSearch={noop} />, stayVenue)
    expect(long).toContain('The longest stay you can book online is 14 nights.')
  })

  it('the departure cannot be before the day after the arrival', () => {
    const html = render(<DatesStep state={picked} rules={stayCatalogue.rules} timezone="Europe/Riga" onDates={noop} onGuests={noop} onSearch={noop} />, stayVenue)
    expect(html).toContain('min="2026-10-11"')
  })
})

describe('RoomStep', () => {
  const key = ['portal-stay-availability', '2026-10-10', '2026-10-12', 2, 0]

  it('lists the free rooms with the price a night, the total and the member\'s own total', () => {
    const html = render(<RoomStep state={picked} onPick={noop} onChangeDates={noop} />, stayVenue, c => c.setQueryData(key, availability))
    expect(html).toContain('Sea view')
    expect(html).toContain('A balcony over the bay')
    expect(html).toContain('Sleeps 2')
    expect(html).toContain('Garden')
    expect(html).toContain('Sleeps 3')
    expect(html).toMatch(/line-through[^>]*>.*200/s)
    expect(html).toContain('180')
    expect(html).toMatch(/<h2[^>]*tabindex="-1"[^>]*data-step-heading="room"/)
  })

  it('strikes no price through when the member pays the list price', () => {
    const html = render(<RoomStep state={picked} onPick={noop} onChangeDates={noop} />, stayVenue, c => c.setQueryData(key, { ...availability, rooms: [availability.rooms[1]] }))
    expect(html).not.toContain('line-through')
  })

  it('says when nothing is free and offers other dates', () => {
    const html = render(<RoomStep state={picked} onPick={noop} onChangeDates={noop} />, stayVenue, c => c.setQueryData(key, { rooms: [], nights: 2, party_too_large: false }))
    expect(html).toContain('No rooms are free for these dates.')
    expect(html).toContain('Change dates')
  })

  it('tells a party too large for any room to contact the venue, with the venue\'s contact', () => {
    const html = render(<RoomStep state={{ ...picked, adults: 5 }} onPick={noop} onChangeDates={noop} />, stayVenue, c => c.setQueryData(['portal-stay-availability', '2026-10-10', '2026-10-12', 5, 0], { rooms: [], nights: 2, party_too_large: true }))
    expect(html).toContain('No single room fits your party. Please contact Seaside Hotel and we will arrange it.')
    expect(html).toContain('href="mailto:hello@seaside.test"')
    expect(html).not.toContain('No rooms are free for these dates.')
  })

  it('shows a skeleton while loading and a retry when the search fails', async () => {
    expect(render(<RoomStep state={picked} onPick={noop} onChangeDates={noop} />, stayVenue)).not.toContain('Sea view')
    const html = await renderAsync(<RoomStep state={picked} onPick={noop} onChangeDates={noop} />, stayVenue, async c => {
      await c.prefetchQuery({ queryKey: key, queryFn: () => Promise.reject({ response: { status: 422, data: { error: 'invalid_stay' } } }), retry: false })
    })
    expect(html).toContain('Those dates cannot be booked online.')
    expect(html).toContain('Change dates')
  })
})
```

Run: `npx vitest run src/portal/pages/stay/stayBook.test.tsx` — expected: FAIL, the three components do not exist.

- [ ] **Step 5: `DatesStep`**

Create `frontend/src/portal/pages/stay/DatesStep.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import { venueToday } from '../../lib/dates'
import { Button } from '../../ui/Button'
import { Field, INPUT_CLASS } from '../../ui/Field'
import { Notice } from '../../ui/Notice'
import { Stepper } from '../../ui/Stepper'
import { addDays, datesProblem, nightsBetween, type StayState } from './staySteps'
import type { StayRules } from '../../lib/types'

interface Props {
  state: StayState
  rules: StayRules
  timezone: string
  onDates: (checkIn: string | null, checkOut: string | null) => void
  onGuests: (adults: number, children: number) => void
  onSearch: () => void
}

/**
 * Arrival, departure and who is coming. The browser's own date picker: it is the one every member already
 * knows on their own phone, it speaks their language, and it is reachable by keyboard and screen reader
 * without a line of ours. "Today" is the venue's day, not the member's.
 */
export function DatesStep({ state, rules, timezone, onDates, onGuests, onSearch }: Props) {
  const { t } = useTranslation()
  const today = venueToday(timezone)
  const problem = datesProblem(state.checkIn, state.checkOut, rules, today)
  const nights = state.checkIn && state.checkOut ? nightsBetween(state.checkIn, state.checkOut) : 0

  const sentence = problem === null ? null
    : problem.code === 'min_nights' ? t('portal.stay.min_nights', 'The shortest stay here is {{count}} nights.', { count: problem.count })
    : problem.code === 'max_nights' ? t('portal.stay.max_nights', 'The longest stay you can book online is {{count}} nights.', { count: problem.count })
    : t('portal.stay.pick_dates', 'Choose your arrival and departure dates.')

  return (
    <div className="space-y-5">
      <h2 tabIndex={-1} data-step-heading="dates" className="sr-only">{t('portal.stay.heading_dates', 'When would you like to stay?')}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label={t('portal.stay.check_in', 'Arrival')}>
          <input
            type="date"
            className={INPUT_CLASS}
            min={today}
            value={state.checkIn ?? ''}
            onChange={e => onDates(e.target.value || null, state.checkOut)}
          />
        </Field>
        <Field label={t('portal.stay.check_out', 'Departure')}>
          <input
            type="date"
            className={INPUT_CLASS}
            min={addDays(state.checkIn ?? today, 1)}
            value={state.checkOut ?? ''}
            onChange={e => onDates(state.checkIn, e.target.value || null)}
          />
        </Field>
      </div>

      <div className="space-y-3">
        <Stepper
          label={t('portal.stay.adults', 'Adults')}
          value={state.adults}
          min={1}
          max={10}
          onChange={v => onGuests(v, state.children)}
          fewerLabel={t('portal.book.fewer', 'Fewer')}
          moreLabel={t('portal.book.more', 'More')}
        />
        <Stepper
          label={t('portal.stay.children', 'Children')}
          value={state.children}
          min={0}
          max={6}
          onChange={v => onGuests(state.adults, v)}
          fewerLabel={t('portal.book.fewer', 'Fewer')}
          moreLabel={t('portal.book.more', 'More')}
        />
      </div>

      {problem === null
        ? <p className="text-sm text-p-text-2">{t('portal.stay.nights_count', 'Nights: {{count}}', { count: nights })}</p>
        : problem.code === 'pick_dates'
          ? <p className="text-sm text-p-text-2">{sentence}</p>
          : <Notice tone="warning">{sentence}</Notice>}

      <Button type="button" full disabled={problem !== null} onClick={onSearch}>{t('portal.stay.see_rooms', 'See rooms')}</Button>
    </div>
  )
}
```

- [ ] **Step 6: `RoomStep`**

Create `frontend/src/portal/pages/stay/RoomStep.tsx`:

```tsx
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { BedDouble } from 'lucide-react'
import { usePortal } from '../../PortalProvider'
import { apiErrorCode, bookErrorFallback, bookErrorKey, portalApi } from '../../lib/portalApi'
import { formatDay } from '../../lib/dates'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { EmptyState } from '../../ui/EmptyState'
import { Money } from '../../ui/Money'
import { Notice } from '../../ui/Notice'
import { Skeleton } from '../../ui/Skeleton'
import type { AvailableRoom } from '../../lib/types'
import type { StayState } from './staySteps'

interface Props { state: StayState; onPick: (roomId: string) => void; onChangeDates: () => void }

/** The rooms free for the chosen dates and party, cheapest first, each with the member's own total. */
export function RoomStep({ state, onPick, onChangeDates }: Props) {
  const { t, i18n } = useTranslation()
  const { data } = usePortal()
  const { checkIn, checkOut, adults, children } = state
  // `retryOnMount: false`: a failed search stays failed, with its own way out, instead of refetching
  // silently every time the member steps back onto it.
  const free = useQuery({
    queryKey: ['portal-stay-availability', checkIn, checkOut, adults, children],
    queryFn: () => portalApi.stayAvailability(checkIn as string, checkOut as string, adults, children),
    enabled: !!checkIn && !!checkOut,
    retryOnMount: false,
  })
  const code = free.isError ? apiErrorCode(free.error) : null
  const venue = data?.venue
  const contact = venue?.contact.phone || venue?.contact.email

  return (
    <div className="space-y-4">
      <h2 tabIndex={-1} data-step-heading="room" className="sr-only">{t('portal.stay.heading_room', 'Choose a room')}</h2>
      <Card className="p-4 flex items-start justify-between gap-4">
        <div className="min-w-0 text-sm">
          <p className="font-medium">{checkIn && formatDay(checkIn, i18n.language)} – {checkOut && formatDay(checkOut, i18n.language)}</p>
          <p className="text-p-text-2">{t('portal.stay.guests_line', 'Adults: {{adults}} · children: {{children}}', { adults, children })}</p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onChangeDates}>{t('portal.book.change', 'Change')}</Button>
      </Card>

      {free.isPending && <div className="space-y-3"><Skeleton className="h-28" /><Skeleton className="h-28" /></div>}

      {free.isError && (
        <div className="space-y-3">
          <Notice tone={code === 'invalid_stay' ? 'warning' : 'danger'}>{t(bookErrorKey(code), bookErrorFallback(code))}</Notice>
          {code === 'invalid_stay'
            ? <Button variant="secondary" size="sm" onClick={onChangeDates}>{t('portal.stay.change_dates', 'Change dates')}</Button>
            : <Button variant="secondary" size="sm" onClick={() => { void free.refetch() }}>{t('portal.common.retry', 'Try again')}</Button>}
        </div>
      )}

      {free.data && free.data.rooms.length === 0 && free.data.party_too_large && venue && (
        <Notice tone="info">
          {t('portal.stay.party_too_large', 'No single room fits your party. Please contact {{venue}} and we will arrange it.', { venue: venue.name })}
          {contact && <> <a className="text-p-accent-deep underline" href={venue.contact.phone ? `tel:${venue.contact.phone}` : `mailto:${venue.contact.email}`}>{contact}</a></>}
        </Notice>
      )}

      {free.data && free.data.rooms.length === 0 && !free.data.party_too_large && (
        <EmptyState
          icon={<BedDouble size={18} aria-hidden />}
          title={t('portal.stay.no_rooms', 'No rooms are free for these dates.')}
          action={<Button variant="secondary" size="sm" onClick={onChangeDates}>{t('portal.stay.change_dates', 'Change dates')}</Button>}
        />
      )}

      {free.data?.rooms.map(room => <RoomCard key={room.id} room={room} onPick={onPick} />)}
    </div>
  )
}

function RoomCard({ room, onPick }: { room: AvailableRoom; onPick: (id: string) => void }) {
  const { t } = useTranslation()
  const discounted = room.member_total < room.total_price
  return (
    <Card className="overflow-hidden">
      {room.image && <img src={room.image} alt="" loading="lazy" className="w-full h-40 object-cover" />}
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-p-display text-xl leading-tight">{room.name}</p>
            {room.short_description && <p className="text-sm text-p-text-2 mt-0.5">{room.short_description}</p>}
            <p className="text-xs text-p-text-2 mt-1">
              {t('portal.stay.sleeps', 'Sleeps {{count}}', { count: room.max_guests })}
              {room.bed_type && ` · ${room.bed_type}`}
              {room.size && ` · ${room.size}`}
            </p>
          </div>
          <div className="text-right shrink-0">
            {discounted && <span className="block text-xs text-p-text-2 line-through"><span className="sr-only">{t('portal.book.list_price', 'List price')}</span><Money amount={room.total_price} currency={room.currency} /></span>}
            <span className="block font-p-display text-lg">{discounted && <span className="sr-only">{t('portal.book.your_price', 'Your price')}</span>}<Money amount={room.member_total} currency={room.currency} /></span>
            <span className="block text-[11px] text-p-text-2">{t('portal.stay.total_for_stay', 'Total for your stay')}</span>
          </div>
        </div>
        <Button type="button" full onClick={() => onPick(room.id)}>{t('portal.stay.choose', 'Choose')}</Button>
      </div>
    </Card>
  )
}
```

The price a night is left off the card on purpose: the member's discount is on the stay, and two prices with two units side by side read as four numbers at 390 px. One struck list total, one total to pay.

- [ ] **Step 7: `StayBook`**

Create `frontend/src/portal/pages/stay/StayBook.tsx`:

```tsx
import { useEffect, useReducer, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CalendarX } from 'lucide-react'
import { usePortal } from '../../PortalProvider'
import { portalApi } from '../../lib/portalApi'
import { PageSkeleton } from '../../ui/Skeleton'
import { EmptyState } from '../../ui/EmptyState'
import { Notice } from '../../ui/Notice'
import { Button } from '../../ui/Button'
import { Chip } from '../../ui/Chip'
import { StepStrip } from '../book/StepStrip'
import { BookNotice } from '../book/BookNotice'
import { canLeavePay } from '../book/steps'
import { DatesStep } from './DatesStep'
import { RoomStep } from './RoomStep'
import { STAY_STEPS, initialStayState, stayFocusTarget, stayReducer, type StayStep } from './staySteps'

/**
 * The four-step stay flow: dates, room, review, pay. All of its state is in memory: a stay's price is held
 * for minutes, so a refresh starts again rather than resume a quote that has lapsed.
 */
export function StayBook() {
  const { t } = useTranslation()
  const { data } = usePortal()
  // Every transition goes through `stayReducer` (staySteps.ts), never `{ ...state, … }` from this render's closure.
  const [state, dispatch] = useReducer(stayReducer, initialStayState)
  const catalogue = useQuery({ queryKey: ['portal-stay-catalogue'], queryFn: portalApi.stayCatalogue, enabled: data?.capabilities.stays === true, retryOnMount: false })

  // After a step change, keyboard focus moves to the new step's heading — or to the notice a bounce carried.
  // Keyed on the step actually shown: the first mount (and StrictMode's repeat of it) moves nothing.
  const rootRef = useRef<HTMLDivElement>(null)
  const noticeRef = useRef<HTMLDivElement>(null)
  const focusedStep = useRef(state.step)
  const hasNotice = state.notice !== null && state.notice.step === state.step
  useEffect(() => {
    if (focusedStep.current === state.step) return
    focusedStep.current = state.step
    const target = stayFocusTarget(state.step, hasNotice)
    const el = target.kind === 'notice' ? noticeRef.current : rootRef.current?.querySelector<HTMLElement>(`[data-step-heading="${target.step}"]`)
    el?.focus()
  }, [state.step, hasNotice])

  if (!data) return <PageSkeleton />
  if (!data.capabilities.stays) return <EmptyState icon={<CalendarX size={22} aria-hidden />} title={t('portal.book.not_bookable', 'Online booking is not available for this venue yet.')} />
  if (catalogue.isError) {
    return (
      <div className="space-y-3">
        <Notice tone="danger">{t('portal.common.error', 'Something went wrong. Please try again.')}</Notice>
        <Button variant="secondary" size="sm" onClick={() => { void catalogue.refetch() }}>{t('portal.common.retry', 'Try again')}</Button>
      </div>
    )
  }
  if (!catalogue.data) return <PageSkeleton />
  const cat = catalogue.data

  const labels: Record<StayStep, string> = {
    dates: t('portal.stay.step_dates', 'Dates'),
    room: t('portal.stay.step_room', 'Room'),
    review: t('portal.stay.step_review', 'Review'),
    pay: t('portal.stay.step_pay', 'Pay'),
  }

  return (
    <div className="space-y-5" ref={rootRef}>
      <h1 className="font-p-display text-2xl">{t('portal.stay.title', 'Book a stay')}</h1>
      <StepStrip steps={STAY_STEPS} current={state.step} labels={labels} ariaLabel={t('portal.stay.title', 'Book a stay')} locked={!canLeavePay(state.visit)} onJump={step => dispatch({ type: 'jump', step })} />
      {hasNotice && <BookNotice code={state.notice!.code} ref={noticeRef} />}
      {state.step === 'dates' && (
        <>
          {cat.pricing.automatic && <Chip tone="accent">{t('portal.book.member_price_note', '{{label}} applied', { label: cat.pricing.automatic.label })}</Chip>}
          <DatesStep
            state={state}
            rules={cat.rules}
            timezone={data.venue.timezone}
            onDates={(checkIn, checkOut) => dispatch({ type: 'setDates', checkIn, checkOut })}
            onGuests={(adults, children) => dispatch({ type: 'setGuests', adults, children })}
            onSearch={() => dispatch({ type: 'search' })}
          />
        </>
      )}
      {state.step === 'room' && (
        <RoomStep state={state} onPick={roomId => dispatch({ type: 'pickRoom', roomId })} onChangeDates={() => dispatch({ type: 'jump', step: 'dates' })} />
      )}
    </div>
  )
}
```

- [ ] **Step 8: Run the checks**

Run: `npx tsc -b && npx vitest run src/portal && npx eslint src/portal`
Expected: clean and green.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/portal/pages/stay
git commit -m "Start the stay flow: dates, party and the rooms that are free

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 17: The stay flow — review and pay

**Files:**
- Create: `frontend/src/portal/pages/stay/StayPriceBreakdown.tsx`, `frontend/src/portal/pages/stay/StayReviewStep.tsx`, `frontend/src/portal/pages/stay/StayPayStep.tsx`, `frontend/src/portal/pages/stay/stayReview.test.tsx`, `frontend/src/portal/pages/stay/stayPay.test.tsx`
- Modify: `frontend/src/portal/pages/stay/StayBook.tsx`

**Interfaces:**
- Consumes: Task 16's reducer and decisions; `CouponField` (`quote: Priced | null`); `StripePayment` (default export, lazy) with props `clientSecret`, `publishableKey`, `payLabel`, `paymentFailedMessage`, `paymentIncompleteMessage`, `onPayStart`, `onPayFailed`, `onPaid(paymentIntentId)`; `newPayVisit(random)`.
- Produces: `stayQuoteQueryOptions(body: StayQuoteBody)` (query key `['portal-stay-quote', body]`); `<StayReviewStep catalogue state onChange onBack onBounce onContinue />`; `<StayPayStep quote state visit onVisitChange onBack onDone />`; payment-intent query key `['portal-stay-payment-intent', visit.nonce]`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/portal/pages/stay/stayReview.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { render, renderAsync } from '../book/testUtils'
import { StayPriceBreakdown } from './StayPriceBreakdown'
import { StayReviewStep, stayQuoteQueryOptions } from './StayReviewStep'
import { initialStayState, stayQuoteBody, type StayState } from './staySteps'
import { stayCatalogue, stayQuote, stayVenue } from './stayTestUtils'

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
vi.mock('../../lib/portalApi', async () => {
  const actual = await vi.importActual<typeof import('../../lib/portalApi')>('../../lib/portalApi')
  const never = () => new Promise(() => {})
  return { ...actual, portalApi: { ...actual.portalApi, stayQuote: never, offers: never, redemptions: never, resolveCoupon: never } }
})

const noop = () => {}
const state: StayState = { ...initialStayState, step: 'review', checkIn: '2026-10-10', checkOut: '2026-10-12', roomId: '101', extras: ['3'] }
const key = stayQuoteQueryOptions(stayQuoteBody(state)).queryKey
const review = (s: StayState = state) => <StayReviewStep catalogue={stayCatalogue} state={s} onChange={noop} onBack={noop} onBounce={noop} onContinue={noop} />

describe('StayPriceBreakdown', () => {
  it('itemises the room, the add-ons, the member discount and the total — every number the server\'s', () => {
    const html = render(<StayPriceBreakdown quote={stayQuote} />, stayVenue)
    expect(html).toContain('Sea view · nights: 2')
    expect(html).toContain('Breakfast')
    expect(html).toContain('Subtotal')
    expect(html).toContain('10% off stays')
    expect(html).toContain('−')
    expect(html).toContain('193.50')
    expect(html.indexOf('Subtotal')).toBeLessThan(html.indexOf('10% off stays'))
    expect(html.indexOf('10% off stays')).toBeLessThan(html.indexOf('Total'))
  })

  it('says why a coupon was not used', () => {
    const outbid = render(<StayPriceBreakdown quote={{ ...stayQuote, coupon: { source: 'offer', source_id: 7, label: '5 off', status: 'outbid', discount: 5 } }} />, stayVenue)
    expect(outbid).toContain('Your membership discount is better than 5 off')
    const wrong = render(<StayPriceBreakdown quote={{ ...stayQuote, coupon: { source: 'offer', source_id: 7, label: 'Spa day', status: 'wrong_scope', discount: 0 } }} />, stayVenue)
    expect(wrong).toContain('Spa day does not apply to stays.')
  })
})

describe('StayReviewStep', () => {
  it('shows what is being booked, the add-ons, the price and the venue\'s terms once the quote has landed', () => {
    const html = render(review(), stayVenue, c => c.setQueryData(key, stayQuote))
    expect(html).toMatch(/<h2[^>]*tabindex="-1"[^>]*data-step-heading="review"/)
    expect(html).toContain('Sea view')
    expect(html).toContain('Adults: 2 · children: 0')
    expect(html).toContain('Add-ons')
    expect(html).toContain('Breakfast')
    expect(html).toContain('Special requests')
    expect(html).toContain('193.50')
    expect(html).toContain('Arrival from 15:00')
    expect(html).toContain('Departure by 11:00')
    expect(html).toContain('Free cancellation up to 48 hours before arrival.')
    expect(html).toContain('Free until two days before.')
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Continue/)
  })

  it('holds Continue back until there is a price', () => {
    const html = render(review(), stayVenue)
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Continue/)
    expect(html).not.toContain('Subtotal')
  })

  it('says nothing about free cancellation when the venue gives no hours', () => {
    const html = render(review(), stayVenue, c => c.setQueryData(key, { ...stayQuote, policy: { ...stayQuote.policy, cancel_hours: 0 } }))
    expect(html).not.toContain('Free cancellation up to')
  })

  it('an add-on that needs more notice is said next to the add-ons', async () => {
    const html = await renderAsync(review(), stayVenue, async c => {
      await c.prefetchQuery({ queryKey: key, queryFn: () => Promise.reject({ response: { status: 422, data: { error: 'extra_lead_time' } } }), retry: false })
    })
    expect(html).toContain('One of the add-ons needs more notice than this time allows.')
    expect(html).not.toContain('Something went wrong')
  })

  it('an error it cannot explain offers a retry', async () => {
    const html = await renderAsync(review(), stayVenue, async c => {
      await c.prefetchQuery({ queryKey: key, queryFn: () => Promise.reject(new Error('down')), retry: false })
    })
    expect(html).toContain('Something went wrong. Please try again.')
    expect(html).toContain('Try again')
  })

  it('never keeps a price: a quote is asked again every time Review is shown', () => {
    const options = stayQuoteQueryOptions(stayQuoteBody(state))
    expect(options.gcTime).toBe(0)
    expect(options.staleTime).toBe(0)
    expect(options.retry).toBe(false)
  })
})
```

Create `frontend/src/portal/pages/stay/stayPay.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { render, renderAsync } from '../book/testUtils'
import { newPayVisit, type PayVisit } from '../book/steps'
import { StayPayStep } from './StayPayStep'
import { initialStayState, type StayState } from './staySteps'
import { stayQuote, stayVenue } from './stayTestUtils'

/**
 * As for the appointment's PayStep (see pages/book/pay.test.tsx): the bounce after a confirm error, the
 * query invalidation and everything inside StripePayment live in effects and handlers this renderer never
 * runs. The decisions they apply are pure functions tested in staySteps.test.ts; the wiring is reviewed by
 * hand. `StripePayment` is lazy, so a test that reaches it sees the Suspense fallback, never the mock.
 */

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
vi.mock('../book/StripePayment', () => ({ default: () => <div data-stripe-mounted="1" /> }))
vi.mock('../../lib/portalApi', async () => {
  const actual = await vi.importActual<typeof import('../../lib/portalApi')>('../../lib/portalApi')
  const never = () => new Promise(() => {})
  return { ...actual, portalApi: { ...actual.portalApi, stayPaymentIntent: never, stayConfirm: never } }
})

const noop = () => {}
const state: StayState = { ...initialStayState, step: 'pay', checkIn: '2026-10-10', checkOut: '2026-10-12', roomId: '101', quote: stayQuote }
const online = { ...stayQuote, payment: { mode: 'online' as const, reason: null } }
const onlineVenue = { ...stayVenue, capabilities: { ...stayVenue.capabilities, payments: { services: false, stays: true, publishable_key: 'pk_test_x' } } }
const visit: PayVisit = newPayVisit((() => { let n = 0; return () => `fixed-${n++}` })())
const pay = (quote = stayQuote, v = visit) => <StayPayStep quote={quote} state={state} visit={v} onVisitChange={noop} onBack={noop} onDone={noop} />

describe('StayPayStep', () => {
  it('says which room and which nights right above the price the member is confirming', () => {
    const html = render(pay(), stayVenue)
    expect(html).toMatch(/<h2[^>]*tabindex="-1"[^>]*data-step-heading="pay"/)
    expect(html).toContain('Sea view')
    expect(html).toContain('Adults: 2 · children: 0')
    expect(html.indexOf('Sea view')).toBeLessThan(html.indexOf('Confirm stay'))
  })

  it('at the venue: explains there is nothing to pay now and offers confirm', () => {
    const html = render(pay(), stayVenue)
    expect(html).toContain('Nothing to pay now')
    expect(html).toContain('Confirm stay')
    expect(html).not.toContain('Loading secure payment')
  })

  it('online: asks for the payment intent and shows the loading copy first', () => {
    const html = render(pay(online), onlineVenue)
    expect(html).toContain('Loading secure payment')
    expect(html).not.toContain('Confirm stay')
  })

  it('online without a publishable key: card unavailable, never a blank step', () => {
    const html = render(pay(online), stayVenue)
    expect(html).toContain('Online payment is unavailable right now. Please try again in a moment.')
    expect(html).not.toContain('Loading secure payment')
    expect(html).not.toContain('Confirm stay')
  })

  it('nothing_to_pay and pay_at_venue from the payment-intent call offer confirm without a card', async () => {
    for (const code of ['nothing_to_pay', 'pay_at_venue']) {
      const html = await renderAsync(pay(online), onlineVenue, async c => {
        await c.prefetchQuery({ queryKey: ['portal-stay-payment-intent', visit.nonce], queryFn: () => Promise.reject({ response: { status: 409, data: { error: code } } }), retry: false })
      })
      expect(html, code).toContain('Nothing to pay now')
      expect(html, code).toContain('Confirm stay')
    }
  })

  it('a payment-intent failure shows the card-unavailable notice with a retry', async () => {
    const html = await renderAsync(pay(online), onlineVenue, async c => {
      await c.prefetchQuery({ queryKey: ['portal-stay-payment-intent', visit.nonce], queryFn: () => Promise.reject({ response: { status: 503, data: { error: 'payment_unavailable' } } }), retry: false })
    })
    expect(html).toContain('Online payment is unavailable right now. Please try again in a moment.')
    expect(html).toContain('Try again')
  })

  it('a visit that already knows it needs no card never asks for an intent again', () => {
    const html = render(pay(online, { ...visit, noCard: true }), onlineVenue)
    expect(html).toContain('Confirm stay')
    expect(html).not.toContain('Loading secure payment')
  })

  it('once the card is held, the card form is gone', () => {
    const html = render(pay(online, { ...visit, paid: true, held: true, paymentIntentId: 'pi_1' }), onlineVenue, c => c.setQueryData(['portal-stay-payment-intent', visit.nonce], { client_secret: 's', payment_intent_id: 'pi_1', amount: 193.5, currency: 'EUR' }))
    expect(html).not.toContain('Loading secure payment')
    expect(html).not.toContain('Confirm stay')
  })
})
```

Run: `npx vitest run src/portal/pages/stay` — expected: FAIL, the three components do not exist.

- [ ] **Step 2: `StayPriceBreakdown`**

Create `frontend/src/portal/pages/stay/StayPriceBreakdown.tsx`:

```tsx
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Money } from '../../ui/Money'
import { Notice } from '../../ui/Notice'
import type { StayQuote } from '../../lib/types'

function Row({ label, children, strong = false, negative = false }: { label: string; children: ReactNode; strong?: boolean; negative?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? 'font-p-display text-lg' : 'text-sm'}`}>
      <span>{label}</span>
      <span className="tabular-nums">{negative && '−'}{children}</span>
    </div>
  )
}

/** Every number here comes straight from the server's quote; nothing is computed client-side. */
export function StayPriceBreakdown({ quote: q }: { quote: StayQuote }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-2">
      <Row label={t('portal.stay.room_line', '{{room}} · nights: {{count}}', { room: q.room.name, count: q.nights })}><Money amount={q.lines.room_total} currency={q.currency} /></Row>
      {q.lines.extras.map(l => (
        <Row key={l.id} label={`${l.name}${l.quantity > 1 ? ` × ${l.quantity}` : ''}`}><Money amount={l.line_total} currency={q.currency} /></Row>
      ))}
      <div className="border-t border-p-border pt-2">
        <Row label={t('portal.book.subtotal', 'Subtotal')}><Money amount={q.list_amount} currency={q.currency} /></Row>
      </div>
      {q.discount && (
        <Row label={q.discount.label} negative><Money amount={q.discount.amount} currency={q.currency} /></Row>
      )}
      <div className="border-t border-p-border pt-2">
        <Row label={t('portal.book.total', 'Total')} strong><Money amount={q.total_amount} currency={q.currency} /></Row>
      </div>
      {q.coupon?.status === 'outbid' && (
        <Notice tone="info">
          {t('portal.book.coupon_outbid', 'Your membership discount is better than {{label}}, so we kept the bigger saving. The coupon stays available.', { label: q.coupon.label })}
        </Notice>
      )}
      {q.coupon?.status === 'wrong_scope' && (
        <Notice tone="warning">
          {t('portal.book.coupon_wrong_scope', '{{label}} does not apply to {{noun}}.', { label: q.coupon.label, noun: t('portal.vocab.hotel.booking_plural', 'stays') })}
        </Notice>
      )}
    </div>
  )
}
```

The noun is the hotel vocabulary's on purpose: this is a stay whatever the venue's industry (a salon that sells rooms still sells stays).

- [ ] **Step 3: `StayReviewStep`**

Create `frontend/src/portal/pages/stay/StayReviewStep.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { apiErrorCode, bookErrorFallback, bookErrorKey, portalApi } from '../../lib/portalApi'
import { formatDay } from '../../lib/dates'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { Field, INPUT_CLASS } from '../../ui/Field'
import { Money } from '../../ui/Money'
import { Notice } from '../../ui/Notice'
import { Skeleton } from '../../ui/Skeleton'
import { Toggle } from '../../ui/Toggle'
import { CouponField } from '../book/CouponField'
import { StayPriceBreakdown } from './StayPriceBreakdown'
import { afterStayQuoteError, stayQuoteBody, type StayReviewPatch, type StayState } from './staySteps'
import type { CouponRef, StayCatalogue, StayQuote, StayQuoteBody } from '../../lib/types'

export interface StayReviewStepProps {
  catalogue: StayCatalogue
  state: StayState
  onChange: (patch: StayReviewPatch) => void
  onBack: () => void
  /** A quote error that belongs to an earlier step (the room is gone, the dates are not sold). */
  onBounce: (to: 'dates' | 'room', code: string) => void
  /** The requests travel with the quote in ONE call. */
  onContinue: (quote: StayQuote, requests: string) => void
}

/**
 * The quote query. `retry: false` — a 409/422 is the server's answer, not a hiccup. `staleTime: 0` and
 * `gcTime: 0` — a price the member is about to accept is always the server's answer for the current choice,
 * and a quote names a hold that lapses: a cached one must never be handed back.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function stayQuoteQueryOptions(body: StayQuoteBody) {
  return { queryKey: ['portal-stay-quote', body], queryFn: () => portalApi.stayQuote(body), retry: false, retryOnMount: false, staleTime: 0, gcTime: 0 } as const
}

export function StayReviewStep({ catalogue, state, onChange, onBack, onBounce, onContinue }: StayReviewStepProps) {
  const { t, i18n } = useTranslation()
  // Local: the requests do not affect the price, so typing must not touch the quote's inputs.
  const [requests, setRequests] = useState(state.requests)
  const body = useMemo(() => stayQuoteBody(state), [state])
  const quote = useQuery(stayQuoteQueryOptions(body))
  const code = quote.isError ? apiErrorCode(quote.error) : null
  const decision = afterStayQuoteError(code)
  const otherError = quote.isError && decision === null && code !== 'extra_lead_time'

  // The error CODE, kept in state: clearing the coupon changes the query key, the query moves on, and a
  // value derived from `code` would vanish with it before the member could read why the coupon was dropped.
  const [couponNotice, setCouponNotice] = useState<string | null>(null)
  const couponErrorMessage = couponNotice ? t(bookErrorKey(couponNotice), bookErrorFallback(couponNotice)) : null

  // The decision is `afterStayQuoteError()`, a pure function with its own tests; this effect only applies
  // it. `state.coupon`, `onChange` and `onBounce` are read and deliberately left out of the deps: the
  // handlers are fresh closures every render, and this must run when the error appears, not on every render.
  useEffect(() => {
    const result = afterStayQuoteError(code)
    if (!result) return
    if (result.to) {
      onBounce(result.to, result.noticeCode)
      return
    }
    if (result.patch && state.coupon !== null) {
      onChange(result.patch)
      setCouponNotice(result.noticeCode)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  const handleCouponChange = (c: CouponRef | null) => {
    setCouponNotice(null)
    onChange({ coupon: c })
  }

  const room = catalogue.rooms.find(r => r.id === state.roomId)
  const policy = quote.data?.policy

  return (
    <div className="space-y-5">
      <h2 tabIndex={-1} data-step-heading="review" className="sr-only">{t('portal.stay.heading_review', 'Check the details')}</h2>
      <Card className="p-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-medium">{quote.data?.room.name ?? room?.name}</p>
          <p className="text-sm text-p-text-2">{state.checkIn && formatDay(state.checkIn, i18n.language)} – {state.checkOut && formatDay(state.checkOut, i18n.language)}</p>
          <p className="text-sm text-p-text-2">{t('portal.stay.guests_line', 'Adults: {{adults}} · children: {{children}}', { adults: state.adults, children: state.children })}</p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>{t('portal.book.change', 'Change')}</Button>
      </Card>

      {catalogue.extras.length > 0 && (
        <section className="space-y-1">
          <h3 className="text-sm font-medium">{t('portal.stay.extras', 'Add-ons')}</h3>
          {catalogue.extras.map(x => (
            <Toggle
              key={x.id}
              label={x.name}
              hint={<Money amount={x.price} currency={catalogue.rules.currency} />}
              checked={state.extras.includes(x.id)}
              onChange={on => onChange({ extras: on ? [...state.extras, x.id] : state.extras.filter(id => id !== x.id) })}
            />
          ))}
          {code === 'extra_lead_time' && <Notice tone="warning">{t(bookErrorKey(code), bookErrorFallback(code))}</Notice>}
        </section>
      )}

      <Field label={t('portal.stay.requests', 'Special requests')} hint={t('portal.stay.requests_hint', 'Optional')}>
        <textarea className={INPUT_CLASS} rows={3} maxLength={500} value={requests} onChange={e => setRequests(e.target.value)} />
      </Field>

      <CouponField value={state.coupon} onChange={handleCouponChange} quote={quote.data ?? null} quoteErrorMessage={couponErrorMessage} />

      {quote.isPending && <Skeleton className="h-28" />}

      {otherError && (
        <div className="space-y-3">
          <Notice tone="danger">{t('portal.common.error', 'Something went wrong. Please try again.')}</Notice>
          <Button variant="secondary" size="sm" onClick={() => { void quote.refetch() }}>{t('portal.common.retry', 'Try again')}</Button>
        </div>
      )}

      {quote.data && <Card tone="paper" className="p-4"><StayPriceBreakdown quote={quote.data} /></Card>}

      {policy && (
        <div className="text-xs text-p-text-2 space-y-1">
          <p>{t('portal.stay.arrival_from', 'Arrival from {{time}}', { time: policy.check_in_time })} · {t('portal.stay.departure_by', 'Departure by {{time}}', { time: policy.check_out_time })}</p>
          {policy.cancel_hours > 0 && <p>{t('portal.stay.free_cancellation', 'Free cancellation up to {{count}} hours before arrival.', { count: policy.cancel_hours })}</p>}
          {policy.cancellation_policy && <p><span className="font-medium">{t('portal.bookings.policy', 'Cancellation policy')}:</span> {policy.cancellation_policy}</p>}
        </div>
      )}

      <Button type="button" full disabled={!quote.data} onClick={() => { if (quote.data) onContinue(quote.data, requests) }}>
        {t('portal.book.continue', 'Continue')}
      </Button>
    </div>
  )
}
```

- [ ] **Step 4: `StayPayStep`**

Create `frontend/src/portal/pages/stay/StayPayStep.tsx`:

```tsx
import { Suspense, lazy, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { usePortal } from '../../PortalProvider'
import { apiErrorCode, bookErrorFallback, bookErrorKey, portalApi } from '../../lib/portalApi'
import { formatDay } from '../../lib/dates'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { Notice } from '../../ui/Notice'
import { Skeleton } from '../../ui/Skeleton'
import type { PayVisit } from '../book/steps'
import { StayPriceBreakdown } from './StayPriceBreakdown'
import { afterStayConfirmError, type StayState } from './staySteps'
import type { PortalBooking, StayQuote } from '../../lib/types'

const StripePayment = lazy(() => import('../book/StripePayment'))

export interface StayPayStepProps {
  /** The quote the member accepted; it names the hold everything here pays for and confirms. */
  quote: StayQuote
  state: StayState
  /** The current attempt to pay, owned by `StayBook` so it lives as long as the attempt, not this component. */
  visit: PayVisit
  onVisitChange: (patch: Partial<PayVisit>) => void
  onBack: (to: 'dates' | 'room' | 'review', code: string) => void
  onDone: (booking: PortalBooking) => void
}

/** The payment-intent call's two ways of saying there is nothing to charge online. */
const NOTHING_TO_CHARGE = new Set(['nothing_to_pay', 'pay_at_venue'])
/** Its ways of saying the hold itself no longer stands: not a card problem, so not a card retry. */
const HOLD_GONE = new Set(['hold_expired', 'price_changed', 'hold_not_found'])

const freshId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `k-${Date.now()}-${Math.random()}`)

export function StayPayStep({ quote, state, visit, onVisitChange, onBack, onDone }: StayPayStepProps) {
  const { t, i18n } = useTranslation()
  const { data, refetch } = usePortal()
  const qc = useQueryClient()

  const online = quote.payment.mode === 'online'
  const publishableKey = data?.capabilities.payments.publishable_key ?? null
  // The mode comes from the quote, the key from the bootstrap; a missing key is never a blank step.
  const noKey = online && !publishableKey

  // ONE payment-intent request per visit: keyed on `visit.nonce`, every automatic refetch off, `gcTime: 0`.
  // A cached, server-cancelled intent must never be handed back, and nothing may swap the `clientSecret`
  // a mounted `<Elements>` already has. Disabled once a card is held or the visit needs no card.
  const intent = useQuery({
    queryKey: ['portal-stay-payment-intent', visit.nonce],
    queryFn: () => portalApi.stayPaymentIntent(quote.hold_token),
    enabled: online && !!publishableKey && !visit.paid && !visit.noCard,
    staleTime: Infinity,
    gcTime: 0,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
    retryOnMount: false,
  })
  const intentErrorCode = intent.isError ? apiErrorCode(intent.error) : null
  const nothingToCharge = visit.noCard || (intentErrorCode !== null && NOTHING_TO_CHARGE.has(intentErrorCode))
  const holdGone = intentErrorCode !== null && HOLD_GONE.has(intentErrorCode)
  const payAtVenue = !online || nothingToCharge
  // A fresh nonce, not a refetch of the one that failed.
  const retryIntent = () => onVisitChange({ nonce: freshId() })

  useEffect(() => {
    if (nothingToCharge && !visit.noCard) onVisitChange({ noCard: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nothingToCharge])

  // The hold lapsed or its price moved before a card was ever asked for: back to Review, which asks for a
  // fresh price and with it a fresh hold. Nothing is held yet, so nothing needs releasing.
  useEffect(() => {
    if (holdGone) onBack('review', intentErrorCode as string)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdGone, intentErrorCode])

  const confirm = useMutation({
    mutationFn: (paymentIntentId: string | null) =>
      portalApi.stayConfirm({ hold_token: quote.hold_token, payment_intent_id: paymentIntentId, special_requests: state.requests || null }),
    onSuccess: r => {
      if (visit.paid) qc.removeQueries({ queryKey: ['portal-stay-payment-intent'] })
      // Everything the booking could have changed: the list, the upcoming count, the coupons, the rooms free.
      qc.invalidateQueries({ queryKey: ['portal-bookings'] })
      qc.invalidateQueries({ queryKey: ['portal-bootstrap'] })
      qc.invalidateQueries({ queryKey: ['portal-offers'] })
      qc.invalidateQueries({ queryKey: ['portal-redemptions'] })
      qc.invalidateQueries({ queryKey: ['portal-stay-availability'] })
      onDone(r.booking)
    },
    onError: () => {
      if (visit.paid) qc.removeQueries({ queryKey: ['portal-stay-payment-intent'] })
    },
  })
  const confirmErrorCode = confirm.isError ? apiErrorCode(confirm.error) : null
  const confirmDecision = confirm.isError ? afterStayConfirmError(confirmErrorCode) : null

  // The decision is `afterStayConfirmError()`, a pure function with its own tests; this effect applies it.
  // Keyed on primitives: the decision is a fresh object every call.
  useEffect(() => {
    if (!confirm.isError) return
    const decision = afterStayConfirmError(confirmErrorCode)
    if (decision.to) {
      qc.invalidateQueries({ queryKey: ['portal-stay-availability'] })
      onBack(decision.to, confirmErrorCode as string)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirm.isError, confirmErrorCode])

  const onPayStart = () => onVisitChange({ held: true })
  const onPayFailed = () => onVisitChange({ held: false })
  const onPaid = (paymentIntentId: string) => {
    onVisitChange({ paymentIntentId, paid: true, held: true })
    confirm.mutate(paymentIntentId)
  }
  const retryConfirm = () => confirm.mutate(visit.paymentIntentId)

  return (
    <div className="space-y-5">
      <h2 tabIndex={-1} data-step-heading="pay" className="sr-only">{t('portal.stay.heading_pay', 'Confirm your stay')}</h2>
      {/* What and when, on the screen where the member commits to it. */}
      <Card tone="paper" className="p-4 space-y-3">
        <div className="text-sm text-p-text-2">
          <p className="text-p-text font-medium">{quote.room.name}</p>
          <p>{formatDay(quote.check_in, i18n.language)} – {formatDay(quote.check_out, i18n.language)}</p>
          <p>{t('portal.stay.guests_line', 'Adults: {{adults}} · children: {{children}}', { adults: quote.adults, children: quote.children })}</p>
        </div>
        <StayPriceBreakdown quote={quote} />
      </Card>

      {noKey && (
        <Notice tone="warning">
          {t('portal.book.card_unavailable', 'Online payment is unavailable right now. Please try again in a moment.')}{' '}
          <button type="button" className="underline" onClick={() => { void refetch() }}>{t('portal.common.retry', 'Try again')}</button>
        </Notice>
      )}

      {!noKey && payAtVenue && (
        <>
          <Notice tone="info">{t('portal.book.pay_at_venue_note', 'Nothing to pay now. Settle up when you visit.')}</Notice>
          <Button type="button" full loading={confirm.isPending} onClick={() => confirm.mutate(null)}>
            {confirm.isPending ? t('portal.book.confirming', 'Confirming…') : t('portal.stay.confirm', 'Confirm stay')}
          </Button>
        </>
      )}

      {!noKey && online && !payAtVenue && !visit.paid && (
        <>
          {!intent.data && !intent.isError && (
            <>
              <p className="text-sm text-p-text-2">{t('portal.book.card_loading', 'Loading secure payment…')}</p>
              <Skeleton className="h-40" />
            </>
          )}
          {intent.isError && !holdGone && (
            <Notice tone="warning">
              {t('portal.book.card_unavailable', 'Online payment is unavailable right now. Please try again in a moment.')}{' '}
              <button type="button" className="underline" onClick={retryIntent}>{t('portal.common.retry', 'Try again')}</button>
            </Notice>
          )}
          {intent.data && (
            <Suspense fallback={<Skeleton className="h-40" />}>
              <StripePayment
                key={intent.data.client_secret}
                clientSecret={intent.data.client_secret}
                publishableKey={publishableKey as string}
                payLabel={t('portal.book.pay_online', 'Pay now')}
                paymentFailedMessage={t('portal.book.payment_failed', 'The payment did not go through. Please check the card details or try another card.')}
                paymentIncompleteMessage={t('portal.book.payment_incomplete', 'The payment was not completed. Please try again.')}
                onPayStart={onPayStart}
                onPayFailed={onPayFailed}
                onPaid={onPaid}
              />
            </Suspense>
          )}
        </>
      )}

      {visit.paid && confirm.isPending && <p className="text-sm text-p-text-2">{t('portal.book.confirming', 'Confirming…')}</p>}

      {confirm.isError && confirmDecision && !confirmDecision.to && (
        <Notice tone="danger">
          {t(bookErrorKey(confirmErrorCode), bookErrorFallback(confirmErrorCode))}{' '}
          <button type="button" className="underline" onClick={retryConfirm}>{t('portal.common.retry', 'Try again')}</button>
        </Notice>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Wire the two steps into `StayBook`**

In `frontend/src/portal/pages/stay/StayBook.tsx`:

(a) imports — add `import { useNavigate } from 'react-router-dom'`, `import { StayReviewStep } from './StayReviewStep'`, `import { StayPayStep } from './StayPayStep'`, extend the `../book/steps` import to `{ canLeavePay, newPayVisit }` and the `./staySteps` import with `afterStayConfirmError`;

(b) above the component:

```tsx
const randomId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `k-${Date.now()}-${Math.random()}`)
```

(c) inside the component, after `usePortal()`: `const navigate = useNavigate()`;

(d) after the `room` step's block, before the closing `</div>`:

```tsx
      {state.step === 'review' && state.roomId !== null && (
        <StayReviewStep
          catalogue={cat}
          state={state}
          onChange={patch => dispatch({ type: 'patchReview', patch })}
          onBack={() => dispatch({ type: 'jump', step: 'room' })}
          onBounce={(to, code) => dispatch({ type: 'bounce', to, code, clearRoom: true })}
          onContinue={(quote, requests) => dispatch({ type: 'continueToPay', quote, requests, visit: newPayVisit(randomId) })}
        />
      )}
      {state.step === 'pay' && state.quote && state.visit && (
        <StayPayStep
          quote={state.quote}
          state={state}
          visit={state.visit}
          onVisitChange={patch => dispatch({ type: 'visit', patch })}
          onBack={(to, code) => dispatch({ type: 'bounce', to, code, clearRoom: afterStayConfirmError(code).clearRoom })}
          onDone={b => { dispatch({ type: 'reset' }); navigate(`/portal/bookings/${b.kind}/${b.id}?confirmed=1`) }}
        />
      )}
```

Hand-trace, and write the trace into your report: (1) Review's Continue → `continueToPay` stores the quote, the requests and a new visit in one dispatch; (2) Pay's `intent` query runs once for `visit.nonce`; (3) `onPaid` marks the visit paid and held, then confirms with the intent's id; (4) a confirm error with a code bounces through `afterStayConfirmError`, dropping the visit and the quote; without a code it stays, and Retry re-sends the same hold and intent id; (5) `hold_expired` from the payment-intent call bounces to Review, which re-quotes on mount because its query has `gcTime: 0`.

- [ ] **Step 6: Run the checks**

Run: `npx tsc -b && npx vitest run src/portal && npx eslint src/portal`
Expected: clean and green.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/portal/pages/stay
git commit -m "Finish the stay flow: review, coupon, payment and confirmation

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 18: Into the shell — one Book entry, a chooser when the venue sells both

**Files:**
- Create: `frontend/src/portal/pages/BookEntry.tsx`, `frontend/src/portal/pages/bookEntry.test.tsx`
- Modify: `frontend/src/portal/PortalApp.tsx`, `frontend/src/portal/PortalShell.tsx`, `frontend/src/portal/PortalShell.test.tsx`, `frontend/src/portal/pages/Home.tsx`, `frontend/src/portal/pages/Home.test.tsx`

**Interfaces:**
- Consumes: `<Book />` (`pages/book/Book`), `<StayBook />` (Task 16–17).
- Produces: `bookDestination(capabilities: { services: boolean; stays: boolean }, hasServiceParam: boolean): 'appointment' | 'stay' | 'choose' | 'none'`; routes `/portal/book` (entry), `/portal/book/stay`, `/portal/book/appointment`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/portal/pages/bookEntry.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { render, base } from './book/testUtils'
import { BookEntry, bookDestination } from './BookEntry'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, fallback?: string) => fallback ?? _k, i18n: { language: 'en' } }),
}))
vi.mock('./book/Book', () => ({ Book: () => <div data-flow="appointment" /> }))
vi.mock('./stay/StayBook', () => ({ StayBook: () => <div data-flow="stay" /> }))

const caps = (services: boolean, stays: boolean) => ({ ...base, capabilities: { ...base.capabilities, services, stays } })

describe('bookDestination', () => {
  it('goes straight to the only thing the venue sells', () => {
    expect(bookDestination({ services: true, stays: false }, false)).toBe('appointment')
    expect(bookDestination({ services: false, stays: true }, false)).toBe('stay')
  })

  it('asks when the venue sells both — unless the link already names a service', () => {
    expect(bookDestination({ services: true, stays: true }, false)).toBe('choose')
    expect(bookDestination({ services: true, stays: true }, true)).toBe('appointment')
  })

  it('has nowhere to go when the venue sells neither', () => {
    expect(bookDestination({ services: false, stays: false }, false)).toBe('none')
    expect(bookDestination({ services: false, stays: false }, true)).toBe('none')
  })
})

describe('BookEntry', () => {
  it('opens the appointment flow for a venue that only takes appointments', () => {
    expect(render(<BookEntry />, caps(true, false))).toContain('data-flow="appointment"')
  })

  it('opens the stay flow for a venue that only sells stays', () => {
    expect(render(<BookEntry />, caps(false, true))).toContain('data-flow="stay"')
  })

  it('offers both, as two links a thumb can reach', () => {
    const html = render(<BookEntry />, caps(true, true))
    expect(html).toContain('What would you like to book?')
    expect(html).toContain('href="/portal/book/appointment"')
    expect(html).toContain('href="/portal/book/stay"')
    expect(html).toContain('An appointment')
    expect(html).toContain('A stay')
    expect(html).not.toContain('data-flow=')
  })

  it('keeps a link that names a service working', () => {
    expect(render(<BookEntry />, caps(true, true), undefined, '/portal/book?service=11')).toContain('data-flow="appointment"')
  })

  it('says so when nothing can be booked online', () => {
    expect(render(<BookEntry />, caps(false, false))).toContain('Online booking is not available for this venue yet.')
  })
})
```

In `frontend/src/portal/PortalShell.test.tsx` replace `links to Book when the venue takes appointments and not otherwise` with:

```tsx
  it('links to Book when the venue takes appointments or sells stays, and not otherwise', () => {
    expect(render(withCaps({ services: true, stays: false }))).toContain('href="/portal/book"')
    expect(render(withCaps({ services: false, stays: true }))).toContain('href="/portal/book"')
    expect(render(withCaps({ services: false, stays: false }))).not.toContain('href="/portal/book"')
  })

  it('never shows more than one Book item', () => {
    const html = render(withCaps({ services: true, stays: true }))
    expect(html.match(/href="\/portal\/book"/g)?.length).toBe(2) // the tab bar and the phone bar
    expect(html).toContain('grid-cols-5')
  })
```

In `frontend/src/portal/pages/Home.test.tsx` add (the file's own `base`, `render` and `clientWith` helpers):

```tsx
  it('offers to book a stay at a venue that only sells stays', () => {
    const html = render({ ...base, capabilities: { ...base.capabilities, services: false, stays: true } }, clientWith([]))
    expect(html).toContain('href="/portal/book"')
    expect(html).toContain('Book a stay')
  })

  it('offers nothing to book at a venue that sells neither', () => {
    const html = render({ ...base, capabilities: { ...base.capabilities, services: false, stays: false } }, clientWith([]))
    expect(html).not.toContain('href="/portal/book"')
  })
```

Run: `npx vitest run src/portal/pages/bookEntry.test.tsx src/portal/PortalShell.test.tsx src/portal/pages/Home.test.tsx` — expected: FAIL.

- [ ] **Step 2: `BookEntry`**

Create `frontend/src/portal/pages/BookEntry.tsx`:

```tsx
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BedDouble, CalendarPlus, CalendarX, ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { usePortal } from '../PortalProvider'
import { Card } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'
import { PageSkeleton } from '../ui/Skeleton'
import { Book } from './book/Book'
import { StayBook } from './stay/StayBook'

/**
 * Where "Book" leads: straight into the one flow a venue has, or to a choice when it has both. A link that
 * already names a service (`?service=`) is an appointment link and skips the choice.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function bookDestination(capabilities: { services: boolean; stays: boolean }, hasServiceParam: boolean): 'appointment' | 'stay' | 'choose' | 'none' {
  const { services, stays } = capabilities
  if (services && stays) return hasServiceParam ? 'appointment' : 'choose'
  if (services) return 'appointment'
  if (stays) return 'stay'
  return 'none'
}

function Choice({ to, icon, title, hint }: { to: string; icon: ReactNode; title: string; hint: string }) {
  return (
    <Link to={to} className="block">
      <Card className="p-4 p-lift flex items-center gap-3 min-h-[72px]">
        <div className="w-11 h-11 rounded-full bg-p-accent/10 text-p-accent-deep flex items-center justify-center shrink-0">{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="font-p-display text-lg leading-tight">{title}</p>
          <p className="text-sm text-p-text-2">{hint}</p>
        </div>
        <ChevronRight size={18} className="text-p-text-2 shrink-0" aria-hidden />
      </Card>
    </Link>
  )
}

export function BookEntry() {
  const { t } = useTranslation()
  const { data } = usePortal()
  const [params] = useSearchParams()
  if (!data) return <PageSkeleton />

  const destination = bookDestination(data.capabilities, params.has('service'))
  if (destination === 'appointment') return <Book />
  if (destination === 'stay') return <StayBook />
  if (destination === 'none') return <EmptyState icon={<CalendarX size={22} aria-hidden />} title={t('portal.book.not_bookable', 'Online booking is not available for this venue yet.')} />

  return (
    <div className="space-y-4">
      <h1 className="font-p-display text-2xl">{t('portal.stay.chooser_title', 'What would you like to book?')}</h1>
      <Choice to="/portal/book/appointment" icon={<CalendarPlus size={20} aria-hidden />} title={t('portal.stay.chooser_appointment', 'An appointment')} hint={t('portal.stay.chooser_appointment_hint', 'A time with one of our team')} />
      <Choice to="/portal/book/stay" icon={<BedDouble size={20} aria-hidden />} title={t('portal.stay.chooser_stay', 'A stay')} hint={t('portal.stay.chooser_stay_hint', 'A room for one night or more')} />
    </div>
  )
}
```

- [ ] **Step 3: Routes, nav, Home**

`frontend/src/portal/PortalApp.tsx` — replace the `Book` import with

```tsx
import { Book } from './pages/book/Book'
import { StayBook } from './pages/stay/StayBook'
import { BookEntry } from './pages/BookEntry'
```

and the `book` route with

```tsx
          <Route path="book" element={<BookEntry />} />
          <Route path="book/appointment" element={<Book />} />
          <Route path="book/stay" element={<StayBook />} />
```

`frontend/src/portal/PortalShell.tsx` — in `items`, the Book entry's `show` becomes

```tsx
show: !!data?.capabilities.services || !!data?.capabilities.stays,
```

and in the component's docblock "no Book for a venue that doesn't take appointments" becomes "no Book for a venue that sells neither appointments nor stays".

`frontend/src/portal/pages/Home.tsx` — above the `return`, add

```tsx
  const canBook = capabilities.services || capabilities.stays
  // A venue that sells only stays says so; every other venue keeps its own noun ("Book appointment").
  const bookLabel = capabilities.stays && !capabilities.services
    ? t('portal.stay.cta_home', 'Book a stay')
    : t('portal.book.cta_home', 'Book {{noun}}', { noun: vocab('booking') })
```

and in the two places that render the Book link replace `capabilities.services &&` with `canBook &&` and the link's text `{t('portal.book.cta_home', 'Book {{noun}}', { noun: vocab('booking') })}` with `{bookLabel}`.

- [ ] **Step 4: Run the checks**

Run: `npx tsc -b && npx vitest run src/portal && npx eslint src/portal`
Expected: clean and green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/portal
git commit -m "Lead Book to the flow the venue has, or to a choice when it has both

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 19: Cancelling from the booking sheet

**Files:**
- Create: `frontend/src/portal/pages/cancelBooking.ts`, `frontend/src/portal/pages/cancelBooking.test.ts`, `frontend/src/portal/pages/CancelPanel.tsx`, `frontend/src/portal/pages/cancelPanel.test.tsx`
- Modify: `frontend/src/portal/pages/BookingSheet.tsx`, `frontend/src/portal/pages/bookingSheet.test.tsx`

**Interfaces:**
- Consumes: `portalApi.cancelBooking(kind, id): Promise<CancelReply>`, `cancelErrorKey`, `cancelErrorFallback`, `apiErrorCode` (Task 15); the booking DTO's `can_cancel`, `cancel_deadline`, `payment_status`, `discount` (Task 10).
- Produces:
  - `cancelOffer(b: PortalBooking, now: Date): 'offer' | 'ended' | 'contact' | 'none'`
  - `moneyPromise(b: PortalBooking): 'refund' | 'release' | 'nothing'`
  - `afterCancelError(code: string | null): { closes: boolean; refetch: boolean }`
  - `<CancelPanel booking stage error result onAsk onKeep onConfirm />` with `stage: 'idle' | 'asking' | 'cancelling' | 'done'`

- [ ] **Step 1: Write the failing decision tests**

Create `frontend/src/portal/pages/cancelBooking.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { PortalBooking } from '../lib/types'
import { afterCancelError, cancelOffer, moneyPromise } from './cancelBooking'

const now = new Date('2026-10-01T09:00:00Z')
const booking: PortalBooking = {
  kind: 'service', id: 7, reference: 'SVC-ABC12345', title: 'Facial', subtitle: 'Mara', starts_at: '2026-10-03T07:30:00Z', ends_at: '2026-10-03T08:15:00Z',
  status: 'confirmed', payment_status: 'paid', total: 60, currency: 'EUR', discount: null, can_cancel: true, cancel_deadline: '2026-10-02T07:30:00Z',
  notes: null, party_size: 1, guests: null, nights: null,
}

describe('cancelOffer', () => {
  it('offers cancellation exactly when the server says the booking can be cancelled', () => {
    expect(cancelOffer(booking, now)).toBe('offer')
    expect(cancelOffer({ ...booking, status: 'pending' }, now)).toBe('offer')
  })

  it('says free cancellation has ended once the deadline the server named has passed', () => {
    expect(cancelOffer({ ...booking, can_cancel: false, cancel_deadline: '2026-09-30T07:30:00Z' }, now)).toBe('ended')
  })

  it('points to the venue for a live booking that cannot be cancelled here at all', () => {
    expect(cancelOffer({ ...booking, can_cancel: false, cancel_deadline: null }, now)).toBe('contact')
    expect(cancelOffer({ ...booking, can_cancel: false, cancel_deadline: null, status: 'in_progress' }, now)).toBe('contact')
  })

  it('says nothing for a booking that is over or already cancelled', () => {
    expect(cancelOffer({ ...booking, can_cancel: false, status: 'cancelled' }, now)).toBe('none')
    expect(cancelOffer({ ...booking, can_cancel: false, status: 'completed' }, now)).toBe('none')
  })

  it('trusts the server over the clock: a deadline still ahead with can_cancel false is not an offer', () => {
    expect(cancelOffer({ ...booking, can_cancel: false, cancel_deadline: '2026-10-02T07:30:00Z' }, now)).toBe('contact')
  })
})

describe('moneyPromise', () => {
  it('promises a refund for a payment taken, a release for a card held, nothing otherwise', () => {
    expect(moneyPromise({ ...booking, payment_status: 'paid' })).toBe('refund')
    expect(moneyPromise({ ...booking, payment_status: 'authorized' })).toBe('release')
    for (const status of ['unpaid', 'open', 'pending', null, 'mock', 'something_new']) {
      expect(moneyPromise({ ...booking, payment_status: status })).toBe('nothing')
    }
  })

  it('promises nothing for a booking that cost nothing', () => {
    expect(moneyPromise({ ...booking, payment_status: 'paid', total: 0 })).toBe('nothing')
  })
})

describe('afterCancelError', () => {
  it('a booking that turns out to be cancelled, or no longer cancellable, reloads and leaves the question', () => {
    for (const code of ['already_cancelled', 'outside_policy', 'not_cancellable']) {
      expect(afterCancelError(code)).toEqual({ closes: true, refetch: true })
    }
  })

  it('a refund that failed, a cancellation in flight or no answer at all keeps the question open for another try', () => {
    for (const code of ['refund_failed', 'cancel_in_progress', 'refund_unavailable', null, 'never_seen']) {
      expect(afterCancelError(code)).toEqual({ closes: false, refetch: false })
    }
  })
})
```

Run: `npx vitest run src/portal/pages/cancelBooking.test.ts` — expected: FAIL, no module.

- [ ] **Step 2: The decisions**

Create `frontend/src/portal/pages/cancelBooking.ts`:

```ts
import type { PortalBooking } from '../lib/types'

/**
 * What the booking sheet says about cancelling. The server decides whether a booking can be cancelled
 * (`can_cancel`): the button appears exactly when the endpoint would accept it. `cancel_deadline` is only
 * used to say WHEN — until when it is free, or when that ended.
 */
export function cancelOffer(b: PortalBooking, now: Date): 'offer' | 'ended' | 'contact' | 'none' {
  if (b.status === 'cancelled' || b.status === 'completed') return 'none'
  if (b.can_cancel) return 'offer'
  if (b.cancel_deadline && new Date(b.cancel_deadline).getTime() <= now.getTime()) return 'ended'
  return 'contact'
}

/**
 * What the member is told will happen to their money BEFORE they confirm. A promise, so it errs towards
 * saying less: only a payment the booking records as taken is promised back, only a card it records as held
 * is promised released. What actually happened comes back from the server afterwards.
 */
export function moneyPromise(b: PortalBooking): 'refund' | 'release' | 'nothing' {
  if (b.total <= 0) return 'nothing'
  if (b.payment_status === 'paid') return 'refund'
  if (b.payment_status === 'authorized') return 'release'
  return 'nothing'
}

/**
 * What a failed cancellation means for the sheet. When the booking itself has changed under the member
 * (someone cancelled it, the window closed) the question is withdrawn and the booking reloaded, so the sheet
 * shows what is true now. Anything else leaves the question open: nothing was changed, and trying again is safe.
 */
export function afterCancelError(code: string | null): { closes: boolean; refetch: boolean } {
  const changed = code === 'already_cancelled' || code === 'outside_policy' || code === 'not_cancellable'
  return { closes: changed, refetch: changed }
}
```

- [ ] **Step 3: Write the failing panel tests**

Create `frontend/src/portal/pages/cancelPanel.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { CancelPanel, type CancelPanelProps } from './CancelPanel'
import type { PortalBooking } from '../lib/types'

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

const booking: PortalBooking = {
  kind: 'service', id: 7, reference: 'SVC-ABC12345', title: 'Facial', subtitle: 'Mara', starts_at: '2026-10-03T07:30:00Z', ends_at: '2026-10-03T08:15:00Z',
  status: 'confirmed', payment_status: 'paid', total: 60, currency: 'EUR', discount: { amount: 6, label: 'Autumn code' }, can_cancel: true, cancel_deadline: '2026-10-02T07:30:00Z',
  notes: null, party_size: 1, guests: null, nights: null,
}
const venue = { name: 'Numa', timezone: 'Europe/Riga', contact: { email: 'hi@numa.test', phone: null } }
const noop = () => {}
const panel = (over: Partial<CancelPanelProps> = {}) => renderToStaticMarkup(
  <CancelPanel booking={booking} venue={venue} offer="offer" stage="idle" error={null} result={null} onAsk={noop} onKeep={noop} onConfirm={noop} {...over} />,
)

describe('CancelPanel', () => {
  it('offers to cancel and says until when it is free', () => {
    const html = panel()
    expect(html).toContain('Cancel booking')
    expect(html).toContain('Free cancellation until')
    expect(html).toContain('<time')
    expect(html).not.toContain('Yes, cancel it')
  })

  it('asks before it cancels, and says what happens to the money and the coupon first', () => {
    const html = panel({ stage: 'asking' })
    expect(html).toContain('Cancel this booking?')
    expect(html).toContain('We will refund')
    expect(html).toContain('60')
    expect(html).toContain('to the card you paid with.')
    expect(html).toContain('Keep it')
    expect(html).toContain('Yes, cancel it')
    expect(html.indexOf('Keep it')).toBeLessThan(html.indexOf('Yes, cancel it'))
  })

  it('promises a release for a held card and nothing for an unpaid booking', () => {
    expect(panel({ stage: 'asking', booking: { ...booking, payment_status: 'authorized' } })).toContain('The hold on your card will be released. Nothing is charged.')
    const unpaid = panel({ stage: 'asking', booking: { ...booking, payment_status: 'unpaid', discount: null } })
    expect(unpaid).toContain('Nothing has been charged for this booking.')
    expect(unpaid).not.toContain('refund')
  })

  it('is busy, and cannot be pressed twice, while it cancels', () => {
    const html = panel({ stage: 'cancelling' })
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-busy="true"[^>]*>.*Cancelling…/s)
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Keep it/)
  })

  it('says why it could not cancel, in the question itself, and lets the member try again', () => {
    const html = panel({ stage: 'asking', error: 'refund_failed' })
    expect(html).toContain('We could not return the payment just now, so the booking was not cancelled.')
    expect(html).toContain('Yes, cancel it')
  })

  it('says what was done once it is done', () => {
    const refunded = panel({ offer: 'none', stage: 'done', result: { outcome: 'refunded', amount: 54, currency: 'EUR', coupon_released: true, points_reversed: 0 } })
    expect(refunded).toContain('Your booking is cancelled.')
    expect(refunded).toContain('We have refunded')
    expect(refunded).toContain('54')
    expect(refunded).toContain('5–10 business days')
    expect(refunded).toContain('Your coupon is back with your coupons.')
    expect(refunded).not.toContain('Cancel booking')

    const released = panel({ offer: 'none', stage: 'done', result: { outcome: 'released', amount: 54, currency: 'EUR', coupon_released: false, points_reversed: 0 } })
    expect(released).toContain('The hold on your card has been released.')
    expect(released).not.toContain('coupon')
  })

  it('says when free cancellation ended and how to reach the venue', () => {
    const html = panel({ offer: 'ended', booking: { ...booking, can_cancel: false, cancel_deadline: '2026-09-30T07:30:00Z' } })
    expect(html).toContain('Free cancellation ended')
    expect(html).toContain('To change or cancel, contact Numa.')
    expect(html).toContain('href="mailto:hi@numa.test"')
    expect(html).not.toContain('Cancel booking')
  })

  it('points to the venue for a booking that cannot be cancelled here', () => {
    const html = panel({ offer: 'contact', booking: { ...booking, can_cancel: false, cancel_deadline: null } })
    expect(html).toContain('To change or cancel, contact Numa.')
    expect(html).not.toContain('Free cancellation')
  })

  it('says nothing for a booking that is over', () => {
    expect(panel({ offer: 'none', booking: { ...booking, can_cancel: false, status: 'completed' } })).toBe('')
  })
})
```

- [ ] **Step 4: `CancelPanel`**

Create `frontend/src/portal/pages/CancelPanel.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import { cancelErrorFallback, cancelErrorKey } from '../lib/portalApi'
import { formatDateTime } from '../lib/dates'
import { formatMoney } from '../lib/money'
import { Button } from '../ui/Button'
import { Notice } from '../ui/Notice'
import { moneyPromise } from './cancelBooking'
import type { CancelReply, PortalBooking } from '../lib/types'

export interface CancelPanelProps {
  booking: PortalBooking
  venue: { name: string; timezone: string; contact: { email: string | null; phone: string | null } }
  /** `cancelOffer(booking, now)` — decided by the sheet, so this stays a pure picture of it. */
  offer: 'offer' | 'ended' | 'contact' | 'none'
  stage: 'idle' | 'asking' | 'cancelling' | 'done'
  /** The server's error code from the last attempt, shown inside the question. */
  error: string | null
  result: CancelReply['refund'] | null
  onAsk: () => void
  onKeep: () => void
  onConfirm: () => void
}

/**
 * The foot of the booking sheet: cancel, the question before it, and what was done after. It holds no state
 * and makes no call — the sheet owns both — so every stage can be rendered and read in a test.
 */
export function CancelPanel({ booking: b, venue, offer, stage, error, result, onAsk, onKeep, onConfirm }: CancelPanelProps) {
  const { t, i18n } = useTranslation()
  const contact = venue.contact.phone || venue.contact.email
  const money = (amount: number, currency: string) => formatMoney(amount, currency, i18n.language)
  // A date is an element, not a word in a sentence: the label and the <time> sit side by side, in the
  // venue's own time zone, and no translation has to place a date inside its grammar.
  const deadline = b.cancel_deadline
    ? <time dateTime={b.cancel_deadline}>{formatDateTime(b.cancel_deadline, i18n.language, venue.timezone)}</time>
    : null

  if (stage === 'done' && result) {
    return (
      <Notice tone="success">
        <p className="font-semibold">{t('portal.bookings.cancelled_done', 'Your booking is cancelled.')}</p>
        {result.outcome === 'refunded' && <p>{t('portal.bookings.cancelled_refunded', 'We have refunded {{amount}}. It can take 5–10 business days to reach your account.', { amount: money(result.amount, result.currency) })}</p>}
        {result.outcome === 'released' && <p>{t('portal.bookings.cancelled_released', 'The hold on your card has been released.')}</p>}
        {result.coupon_released && <p>{t('portal.bookings.cancelled_coupon', 'Your coupon is back with your coupons.')}</p>}
      </Notice>
    )
  }

  if (offer === 'none') return null

  if (offer === 'ended' || offer === 'contact') {
    return (
      <Notice tone="info">
        {offer === 'ended' && deadline && <p>{t('portal.bookings.cancel_ended', 'Free cancellation ended')} {deadline}</p>}
        <p>
          {t('portal.bookings.contact_to_change', 'To change or cancel, contact {{venue}}.', { venue: venue.name })}
          {contact && <> <a className="text-p-accent-deep underline" href={venue.contact.phone ? `tel:${venue.contact.phone}` : `mailto:${venue.contact.email}`}>{contact}</a></>}
        </p>
      </Notice>
    )
  }

  if (stage === 'idle') {
    return (
      <div className="space-y-2">
        {deadline && <p className="text-xs text-p-text-2">{t('portal.bookings.cancel_until', 'Free cancellation until')} {deadline}</p>}
        <Button type="button" variant="danger" size="sm" onClick={onAsk}>{t('portal.bookings.cancel', 'Cancel booking')}</Button>
      </div>
    )
  }

  const promise = moneyPromise(b)
  const busy = stage === 'cancelling'
  return (
    <div role="group" aria-labelledby="p-cancel-title" className="rounded-p-card border border-p-border p-4 space-y-3">
      <p id="p-cancel-title" className="font-semibold">{t('portal.bookings.cancel_title', 'Cancel this booking?')}</p>
      <div className="text-sm text-p-text-2 space-y-1">
        {promise === 'refund' && <p>{t('portal.bookings.cancel_refund', 'We will refund {{amount}} to the card you paid with.', { amount: money(b.total, b.currency) })}</p>}
        {promise === 'release' && <p>{t('portal.bookings.cancel_release', 'The hold on your card will be released. Nothing is charged.')}</p>}
        {promise === 'nothing' && <p>{t('portal.bookings.cancel_nothing', 'Nothing has been charged for this booking.')}</p>}
      </div>
      {error && <Notice tone="danger">{t(cancelErrorKey(error), cancelErrorFallback(error))}</Notice>}
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="secondary" disabled={busy} onClick={onKeep}>{t('portal.bookings.cancel_keep', 'Keep it')}</Button>
        <Button type="button" variant="danger" loading={busy} onClick={onConfirm}>
          {busy ? t('portal.bookings.cancelling', 'Cancelling…') : t('portal.bookings.cancel_confirm', 'Yes, cancel it')}
        </Button>
      </div>
    </div>
  )
}
```

The question says nothing about a coupon: the booking only knows it carried a discount, not whether that was a coupon or the member's own tier benefit, and "will be returned" is wrong for a benefit. The coupon is mentioned afterwards, when the server has said one was released (`result.coupon_released`).

The panel uses `formatDateTime` and `formatMoney` directly rather than the `DateTime` and `Money` components: those read the portal context, and this panel is given everything it shows.

- [ ] **Step 5: Wire it into the sheet**

In `frontend/src/portal/pages/BookingSheet.tsx`:

(a) imports — `import { useState, type ReactNode } from 'react'`, `import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'`, `import { apiErrorCode, portalApi } from '../lib/portalApi'`, `import { afterCancelError, cancelOffer } from './cancelBooking'`, `import { CancelPanel } from './CancelPanel'`, `import type { BookingKind, CancelReply } from '../lib/types'`;

(b) inside the component, after the `useQuery`:

```tsx
  const qc = useQueryClient()
  const [stage, setStage] = useState<'idle' | 'asking' | 'done'>('idle')
  const [result, setResult] = useState<CancelReply['refund'] | null>(null)
  const cancel = useMutation({
    mutationFn: () => portalApi.cancelBooking(kind, id),
    onSuccess: r => {
      setResult(r.refund)
      setStage('done')
      // The sheet shows the booking as it is now; the list, the upcoming count and the coupons follow.
      qc.setQueryData(['portal-booking', kind, id], r.booking)
      qc.invalidateQueries({ queryKey: ['portal-bookings'] })
      qc.invalidateQueries({ queryKey: ['portal-bootstrap'] })
      qc.invalidateQueries({ queryKey: ['portal-offers'] })
      qc.invalidateQueries({ queryKey: ['portal-redemptions'] })
      qc.invalidateQueries({ queryKey: ['portal-slots'] })
      qc.invalidateQueries({ queryKey: ['portal-calendar'] })
      qc.invalidateQueries({ queryKey: ['portal-stay-availability'] })
    },
    onError: e => {
      // The decision is `afterCancelError()`, a pure function with its own tests.
      const decision = afterCancelError(apiErrorCode(e))
      if (decision.refetch) qc.invalidateQueries({ queryKey: ['portal-booking', kind, id] })
      if (decision.closes) setStage('idle')
    },
  })
  const cancelError = cancel.isError ? apiErrorCode(cancel.error) ?? 'unknown' : null
```

(c) replace the policy block and the trailing contact `Notice` (from `{b.kind === 'service' && portal?.policies.services_cancellation_policy && (` to the end of the `{b.status !== 'cancelled' && … <Notice tone="info">…</Notice>)}` block) with:

```tsx
          {policyText(b.kind, portal?.policies) && (
            <div>
              <p className="text-xs font-semibold text-p-text-2 mb-1">{t('portal.bookings.policy', 'Cancellation policy')}</p>
              <p className="text-xs text-p-text-2 whitespace-pre-line">{policyText(b.kind, portal?.policies)}</p>
            </div>
          )}
          {venue && (
            <CancelPanel
              booking={b}
              venue={venue}
              offer={cancelOffer(b, new Date())}
              stage={cancel.isPending ? 'cancelling' : stage}
              error={stage === 'asking' ? cancelError : null}
              result={result}
              onAsk={() => { cancel.reset(); setStage('asking') }}
              onKeep={() => { cancel.reset(); setStage('idle') }}
              onConfirm={() => cancel.mutate()}
            />
          )}
```

(d) above the component:

```tsx
function policyText(kind: BookingKind, policies: { services_cancellation_policy: string; booking_cancellation_policy: string } | undefined): string | null {
  const text = kind === 'stay' ? policies?.booking_cancellation_policy : policies?.services_cancellation_policy
  return text ? text : null
}
```

`new Date()` is read during render: it decides only between "ended" and "contact" for a booking the server already refuses to cancel, so a stale minute changes a sentence, never what the member can do.

Hand-trace, and write the trace into your report: Cancel → `asking`; Keep → `idle`; Yes → the mutation is pending (`cancelling`, both buttons disabled); success → the booking in the cache is the cancelled one, the panel shows `done`; `refund_failed` → the question stays with the sentence; `already_cancelled` → the question is withdrawn and the booking reloads.

- [ ] **Step 6: The sheet's own tests**

In `frontend/src/portal/pages/bookingSheet.test.tsx` extend the `portalApi` mock to `vi.mock('../lib/portalApi', async () => { const actual = await vi.importActual<typeof import('../lib/portalApi')>('../lib/portalApi'); const never = () => new Promise(() => {}); return { ...actual, portalApi: { ...actual.portalApi, booking: never, cancelBooking: never } } })`, give the fixture booking `cancel_deadline: '2026-10-02T07:30:00Z'`, and add:

```tsx
  it('offers cancellation for a booking the server says can be cancelled', () => {
    const client = new QueryClient()
    client.setQueryData(['portal-booking', 'service', 7], booking)
    const html = render(client)
    expect(html).toContain('Cancel booking')
    expect(html).not.toContain('To change or cancel, contact')
  })

  it('points to the venue instead when it cannot', () => {
    const client = new QueryClient()
    client.setQueryData(['portal-booking', 'service', 7], { ...booking, can_cancel: false, cancel_deadline: null })
    const html = render(client)
    expect(html).not.toContain('Cancel booking')
    expect(html).toContain('To change or cancel, contact Numa.')
  })

  it('shows the stay\'s own policy for a stay and the services\' for an appointment', () => {
    const client = new QueryClient()
    client.setQueryData(['portal-booking', 'service', 7], booking)
    const html = render(client, { ...data, policies: { ...data.policies, services_cancellation_policy: 'Appointments: a day ahead.', booking_cancellation_policy: 'Stays: two days ahead.' } })
    expect(html).toContain('Appointments: a day ahead.')
    expect(html).not.toContain('Stays: two days ahead.')
  })
```

(give the file's `render` helper an optional second parameter `bootstrap: PortalBootstrap = data`).

- [ ] **Step 7: Run the checks**

Run: `npx tsc -b && npx vitest run src/portal && npx eslint src/portal`
Expected: clean and green.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/portal
git commit -m "Cancel a booking from its sheet, with the question first and the outcome after

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
## Part E — Admin, carried-over items, documents, verification

### Task 20: Admin — a sidebar menu that tells the truth, distinct labels, and the cancellation hours

The owner opened Settings → Sidebar Menu, saw "Members & Loyalty … Visible", and could not find the group in the sidebar: the venue's industry hides it, and the settings page never looked. The same screen shows two sidebar items called "Procedures". And the two cancellation windows this phase enforces have no field anywhere.

**Files:**
- Create: `frontend/src/lib/menuVisibility.ts`, `frontend/src/lib/menuVisibility.test.ts`, `frontend/src/components/Layout.navLabels.test.ts`
- Modify: `frontend/src/lib/industryGating.ts`, `frontend/src/components/MenuSettings.tsx`, `frontend/src/lib/vocabulary.ts`, `frontend/src/lib/vocabulary.test.ts`, `frontend/src/components/Layout.tsx` (comment at `:542-550` only), `frontend/src/components/settings/BookingTab.tsx`

**Interfaces:**
- Consumes: `navGroups` (exported by `Layout.tsx`), `vocabularyFor(industry)`, `TOGGLEABLE`, `LOCKED`.
- Produces:
  - `industryHiddenGroupsFor(industry: IndustryId | null | undefined): ReadonlyArray<string>` (in `industryGating.ts`; `useIndustryHiddenGroups()` is built on it)
  - `type GroupVisibility = 'visible' | 'hidden' | 'industry'`; `groupVisibility(label: string, hidden: readonly string[], industryHidden: readonly string[]): GroupVisibility`; `visibleGroupCount(toggleable: readonly string[], lockedCount: number, hidden: readonly string[], industryHidden: readonly string[]): number`
  - Settings → Booking saves `booking_cancel_hours` and `services_cancel_hours`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/lib/menuVisibility.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { industryHiddenGroupsFor } from './industryGating'
import { groupVisibility, visibleGroupCount } from './menuVisibility'

const TOGGLEABLE = ['AI Chat', 'Landing pages', 'Members & Loyalty', 'Bookings', 'CRM & Marketing', 'Operations']

describe('industryHiddenGroupsFor', () => {
  it('hides Members & Loyalty for a medical venue and nothing for a hotel', () => {
    expect(industryHiddenGroupsFor('medical')).toEqual(['Members & Loyalty'])
    expect(industryHiddenGroupsFor('hotel')).toEqual([])
  })

  it('hides nothing for a session that does not know its industry', () => {
    expect(industryHiddenGroupsFor(null)).toEqual([])
    expect(industryHiddenGroupsFor(undefined)).toEqual([])
  })
})

describe('groupVisibility', () => {
  it('says what the sidebar really does', () => {
    expect(groupVisibility('Bookings', [], [])).toBe('visible')
    expect(groupVisibility('Bookings', ['Bookings'], [])).toBe('hidden')
    expect(groupVisibility('Members & Loyalty', [], ['Members & Loyalty'])).toBe('industry')
  })

  it('the industry wins over the saved list: a toggle cannot bring the group back', () => {
    expect(groupVisibility('Members & Loyalty', ['Members & Loyalty'], ['Members & Loyalty'])).toBe('industry')
  })
})

describe('visibleGroupCount', () => {
  it('counts what the sidebar shows', () => {
    expect(visibleGroupCount(TOGGLEABLE, 2, [], [])).toBe(8)
    expect(visibleGroupCount(TOGGLEABLE, 2, ['AI Chat'], [])).toBe(7)
    expect(visibleGroupCount(TOGGLEABLE, 2, [], ['Members & Loyalty'])).toBe(7)
    expect(visibleGroupCount(TOGGLEABLE, 2, ['Members & Loyalty', 'AI Chat'], ['Members & Loyalty'])).toBe(6)
  })

  it('ignores a saved label that names no group', () => {
    expect(visibleGroupCount(TOGGLEABLE, 2, ['A group that was renamed'], [])).toBe(8)
  })
})
```

Create `frontend/src/components/Layout.navLabels.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { navGroups } from './Layout'
import { vocabularyFor } from '../lib/vocabulary'
import type { IndustryId } from '../lib/industryHosts'

const INDUSTRIES: IndustryId[] = ['hotel', 'beauty', 'medical', 'restaurant', 'legal', 'real_estate', 'education', 'fitness', 'other']

/**
 * Two sidebar items with the same name are one item nobody can tell apart. The vocabulary relabels items
 * one at a time, so nothing stopped it from giving two of them the same word — a clinic's sidebar read
 * "Procedures" twice (the bookings list and the catalogue).
 */
describe('sidebar labels', () => {
  for (const industry of INDUSTRIES) {
    it(`${industry}: no two items of a group share a label`, () => {
      const vocab = vocabularyFor(industry)
      for (const group of navGroups) {
        const labels = group.items.map(i => vocab(i.defaultLabel) ?? i.defaultLabel)
        const twice = labels.filter((l, n) => labels.indexOf(l) !== n)
        expect(twice, `${industry} · ${group.defaultLabel}: ${twice.join(', ')}`).toEqual([])
      }
    })
  }
})
```

In `frontend/src/lib/vocabulary.test.ts` change the two expectations this task deliberately changes — line 49 to `expect(vocab('Services')).toBe('Treatment bookings')` and line 65 to `expect(vocab('Services')).toBe('Procedure bookings')` — and add to the medical test `expect(vocab('Rooms & Services')).toBe('Procedures')`.

Run (in `frontend/`): `npx vitest run src/lib/menuVisibility.test.ts src/components/Layout.navLabels.test.ts src/lib/vocabulary.test.ts`
Expected: FAIL — no `menuVisibility` module; beauty, medical, education and other each repeat a label in "Bookings".

- [ ] **Step 2: `industryGating.ts` and `menuVisibility.ts`**

In `frontend/src/lib/industryGating.ts`:

(a) replace the comment above `INDUSTRY_HIDDEN_GROUPS` (lines 36-46) with:

```ts
/**
 * Nav groups (Layout.tsx navGroups[].defaultLabel) hidden for an industry.
 * These hides are not the admin's to undo: Settings → Sidebar Menu can
 * hide more, never less (union). That page shows a group hidden here as
 * "Hidden for your industry" instead of offering a toggle that would do
 * nothing.
 *
 * Each entry should be a `defaultLabel` from the navGroups array in
 * Layout.tsx, NOT a translated or industry-relabelled version. The
 * Layout.tsx visibility filter applies industry hides BEFORE label
 * resolution so this stays language-stable.
 */
```

(b) in the comment above `other: []` in `INDUSTRY_HIDDEN_ITEMS` replace "nothing extra hidden beyond the group-level booking hide" with "nothing extra hidden";

(c) replace `useIndustryHiddenGroups()` with:

```ts
/** The canonical group defaultLabels hidden for an industry. Pure: the Settings page and its tests use it too. */
export function industryHiddenGroupsFor(industry: IndustryId | null | undefined): ReadonlyArray<string> {
  return (industry ? INDUSTRY_HIDDEN_GROUPS[industry] : []) ?? []
}

/** Hook — returns the list of canonical group defaultLabels hidden by industry. */
export function useIndustryHiddenGroups(): ReadonlyArray<string> {
  const industry = useAuthStore(s => s.user?.industry)
  return useMemo(() => industryHiddenGroupsFor(industry), [industry])
}
```

Create `frontend/src/lib/menuVisibility.ts`:

```ts
/**
 * What the sidebar really does with a group, for the page that lets an admin change it. Three layers decide
 * (Layout.tsx): the venue's industry, the organisation's saved list, and a staff member's own whitelist. The
 * Sidebar Menu page edits only the second, so it has to say when the first has already decided.
 */
export type GroupVisibility = 'visible' | 'hidden' | 'industry'

export function groupVisibility(label: string, hidden: readonly string[], industryHidden: readonly string[]): GroupVisibility {
  if (industryHidden.includes(label)) return 'industry'
  return hidden.includes(label) ? 'hidden' : 'visible'
}

export function visibleGroupCount(toggleable: readonly string[], lockedCount: number, hidden: readonly string[], industryHidden: readonly string[]): number {
  return toggleable.filter(label => groupVisibility(label, hidden, industryHidden) === 'visible').length + lockedCount
}
```

- [ ] **Step 3: `MenuSettings.tsx`**

(a) imports — add `Lock` to the `lucide-react` import, and:

```tsx
import { useIndustryHiddenGroups } from '../lib/industryGating'
import { groupVisibility, visibleGroupCount } from '../lib/menuVisibility'
```

(b) inside `MenuSettings()`, after `const vocab = useVocabulary()`:

```tsx
  // What the venue's industry has already hidden. This page cannot change it, so it says so
  // instead of showing "Visible" next to a group nobody can find in the sidebar.
  const industryHidden = useIndustryHiddenGroups()
```

(c) replace `const visibleCount = TOGGLEABLE.length - hidden.length + LOCKED.length` with:

```tsx
  const visibleCount = visibleGroupCount(TOGGLEABLE.map(g => g.label), LOCKED.length, hidden, industryHidden)
```

(d) in the intro paragraph, after "…so this page itself can never be hidden." add a sentence: ` Some groups are switched off for a type of business; those are marked below and cannot be switched on here.`

(e) replace the body of `TOGGLEABLE.map(g => { … })` with:

```tsx
          {TOGGLEABLE.map(g => {
            const state = groupVisibility(g.label, hidden, industryHidden)
            const isHidden = state !== 'visible'
            const Icon = g.icon
            const row = (
              <>
                <div className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: g.accent + '25', color: g.accent }}>
                  <Icon size={15} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className={'text-sm font-bold flex items-baseline gap-2 ' + (isHidden ? 'line-through text-gray-500' : 'text-white')}>
                    <span>{vocab(g.label) ?? g.label}</span>
                    {/* Show the canonical English identity in a small chip
                        when the displayed label differs — so the admin
                        understands the toggle still keys on
                        "Members & Loyalty" regardless of industry. */}
                    {vocab(g.label) && (
                      <span className="text-[10px] font-normal text-gray-500 uppercase tracking-wide" title="Saved settings use this canonical English label">
                        ({g.label})
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-gray-500 line-clamp-1">
                    {state === 'industry' ? 'Switched off for your type of business. It cannot be switched on from this page.' : g.description}
                  </div>
                </div>
                <div className={'flex items-center gap-1.5 text-[11px] font-bold px-2 py-1 rounded-md ' +
                  (state === 'industry' ? 'bg-gray-500/10 text-gray-400' : isHidden ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400')}>
                  {state === 'industry' ? <><Lock size={11} /> Hidden for your industry</>
                    : isHidden ? <><EyeOff size={11} /> Hidden</> : <><Eye size={11} /> Visible</>}
                </div>
              </>
            )
            // A group the industry hides is a fact, not a switch: a row, not a button.
            return state === 'industry' ? (
              <div key={g.label} data-group={g.label} data-visibility="industry"
                className="w-full flex items-center gap-3 p-2.5 rounded-lg border text-left bg-dark-bg/50 border-dark-border opacity-60">
                {row}
              </div>
            ) : (
              <button
                key={g.label}
                data-group={g.label}
                data-visibility={state}
                onClick={() => toggle(g.label)}
                className={'w-full flex items-center gap-3 p-2.5 rounded-lg border text-left transition-colors ' +
                  (isHidden
                    ? 'bg-dark-bg/50 border-dark-border opacity-50 hover:opacity-80'
                    : 'bg-dark-bg border-dark-border hover:border-' + g.accent)}>
                {row}
              </button>
            )
          })}
```

(f) in the file's top docblock replace "(matching the `NavGroup.label` strings in Layout.tsx)" with "(matching the `NavGroup.defaultLabel` strings in Layout.tsx)".

In `frontend/src/components/Layout.tsx`, in the comment that describes the visibility filter (lines 542-550), replace "3 layers" with "4 layers" and add the missing one to its list, last: "4. the venue's industry (`industryGating.ts`) — never undone by the three above".

- [ ] **Step 4: Distinct labels**

In `frontend/src/lib/vocabulary.ts`:

- beauty: `'Services':          'Treatment bookings',`
- medical: `'Services':          'Procedure bookings',`
- education: `'Services':          'Course bookings',`
- other: add `'Services':          'Service bookings',` above `'Rooms & Services':  'Services',`

and add to the file's docblock, after the "No group/item label collisions" paragraph:

```ts
 * **No two items of one group share a label.** "Services" is the list of
 * service BOOKINGS (/service-bookings); "Rooms & Services" is the catalogue
 * (/booking-rooms). Relabelling both with the industry's word for a
 * service gave a clinic two items called "Procedures". The bookings list
 * says "… bookings". `Layout.navLabels.test.ts` guards every industry.
```

- [ ] **Step 5: The cancellation hours**

In `frontend/src/components/settings/BookingTab.tsx`:

(a) in the stays block, immediately after the `</div>` that closes the "Nights (min–max)" field (line 459) and inside the same grid, add:

```tsx
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Free cancellation (hours before arrival)</label>
              <input type="number" value={getVal('booking_cancel_hours') || '48'} min={0} max={720}
                onChange={e => handleChange('booking_cancel_hours', e.target.value)} className={inputClass} />
              <p className="text-[10px] text-gray-500 mt-1">Members can cancel a stay themselves until then, counted from the check-in time. 0 = until check-in.</p>
            </div>
```

(b) in the services block, after the "Max Advance (days)" field's closing `</div>` (line 533), add:

```tsx
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Free cancellation (hours before)</label>
              <input type="number" value={getVal('services_cancel_hours') || '24'} min={0} max={720}
                onChange={e => handleChange('services_cancel_hours', e.target.value)} className={inputClass} />
            </div>
```

and under the services "Cancellation Policy" textarea add `<p className="text-[10px] text-gray-500 mt-1">The text members read. The hours above are what the member portal enforces; keep the two in step.</p>`, and the same sentence under the stays "Cancellation Policy" textarea.

Both keys are already in the settings registry (`SettingsController::ensureTenantHasDefaultSettings()`), so `handleChange` saves them like every other field of this tab.

- [ ] **Step 6: Run the checks**

Run: `npx tsc -b && npx vitest run src/lib src/components && npx eslint src/lib src/components/MenuSettings.tsx src/components/settings/BookingTab.tsx`
Expected: clean; the three test files green, `MenuSettings.navGroupParity.test.ts` still green.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib frontend/src/components
git commit -m "Make the sidebar menu page truthful, tell sidebar items apart, add the cancellation hours

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 21: Carried over from phase 2 — orphaned holds, one lock helper, a diagnostic that knows services, the retired endpoint

**Files:**
- Modify: `app/Services/StripeService.php`, `app/Console/Commands/DiagOrphanStripePis.php`, `app/Http/Controllers/Api/V1/ServicePublicController.php` (`:352`), `app/Http/Controllers/Api/V1/Widget/WidgetChatController.php` (`:2617`), `app/Http/Controllers/Api/V1/Admin/ServiceBookingController.php` (`:395`), `routes/api.php` (`:369-372`), `routes/console.php`
- Create: `app/Console/Commands/ReleaseOrphanPortalHolds.php`
- Delete: `app/Http/Controllers/Api/V1/Member/MemberReservationController.php`
- Test: `tests/Feature/Booking/ReleaseOrphanPortalHoldsTest.php`, `tests/Feature/Booking/DiagOrphanStripePisTest.php`, `tests/Unit/Support/AdvisoryLockOnlyTest.php`, `tests/Feature/Member/RetiredEndpointsTest.php`

**Interfaces:**
- Consumes: `AdvisoryLock::within()`, `AdvisoryLock::transaction()`.
- Produces:
  - `StripeService::listPaymentIntents(int $createdFrom, int $createdTo): iterable` — every PaymentIntent of the bound organisation's Stripe account created in the window, auto-paged.
  - Command `bookings:release-orphan-portal-holds {--org=} {--dry-run} {--minutes=45}`, scheduled every thirty minutes; audit action `portal.hold.orphan_released`.
  - `POST /api/v1/member/reservations` no longer exists.

- [ ] **Step 1: Write the failing tests**

Create `tests/Feature/Booking/ReleaseOrphanPortalHoldsTest.php`:

```php
<?php

namespace Tests\Feature\Booking;

use App\Models\HotelSetting;
use App\Models\Organization;
use App\Services\StripeService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Mockery;
use Stripe\PaymentIntent;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\Concerns\SetsUpServiceBookingSchema;
use Tests\TestCase;

/**
 * A member's card was authorised, then the browser closed before the
 * booking was written: nothing in the database carries the payment, so
 * nothing looked for it and the hold sat on the card for a week.
 */
class ReleaseOrphanPortalHoldsTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema, SetsUpServiceBookingSchema;

    private Organization $org;
    private $stripe;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpCapturePendingSchema();
        $this->setUpServiceBookingSchema();
        $this->org = Organization::create(['name' => 'Seaside Hotel', 'slug' => 'seaside-' . uniqid()]);
        $row = new HotelSetting();
        $row->organization_id = $this->org->id;
        $row->key = 'booking_payment_enabled';
        $row->value = 'true';
        $row->save();

        $this->stripe = Mockery::mock(StripeService::class);
        $this->stripe->shouldReceive('isEnabled')->andReturn(true);
        $this->app->instance(StripeService::class, $this->stripe);
        $this->travelTo('2026-10-01 12:00:00');
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        Mockery::close();
        parent::tearDown();
    }

    private function intent(string $id, array $top = [], array $meta = []): PaymentIntent
    {
        return PaymentIntent::constructFrom(array_merge(['id' => $id, 'status' => 'requires_capture', 'amount' => 18000, 'currency' => 'eur', 'created' => now()->subHours(2)->timestamp], $top, [
            'metadata' => array_merge(['kind' => 'portal_stay_booking', 'org_id' => (string) $this->org->id, 'member_id' => '41', 'portal_hold_token' => 'H'], $meta),
        ]));
    }

    private function run_(array $options = []): string
    {
        $this->artisan('bookings:release-orphan-portal-holds', $options)->assertExitCode(0);
        return \Illuminate\Support\Facades\Artisan::output();
    }

    public function test_a_held_card_no_booking_carries_is_released(): void
    {
        $this->stripe->shouldReceive('listPaymentIntents')->once()->andReturn([$this->intent('pi_orphan'), $this->intent('pi_orphan_svc', [], ['kind' => 'portal_service_booking'])]);
        $this->stripe->shouldReceive('cancelPaymentIntent')->once()->with('pi_orphan', 'abandoned');
        $this->stripe->shouldReceive('cancelPaymentIntent')->once()->with('pi_orphan_svc', 'abandoned');

        $this->artisan('bookings:release-orphan-portal-holds')->assertExitCode(0);

        $this->assertSame(2, DB::table('audit_logs')->where('action', 'portal.hold.orphan_released')->where('organization_id', $this->org->id)->count());
    }

    public function test_a_payment_a_booking_carries_is_never_touched(): void
    {
        DB::table('booking_mirror')->insert(['organization_id' => $this->org->id, 'reservation_id' => 'R-1', 'stripe_payment_intent_id' => 'pi_stay', 'price_total' => 180, 'created_at' => now(), 'updated_at' => now()]);
        DB::table('service_bookings')->insert(['organization_id' => $this->org->id, 'booking_reference' => 'SVC-1', 'service_id' => 1, 'customer_name' => 'A', 'customer_email' => 'a@example.test', 'start_at' => now(), 'end_at' => now(), 'duration_minutes' => 45, 'stripe_payment_intent_id' => 'pi_service', 'created_at' => now(), 'updated_at' => now()]);
        $this->stripe->shouldReceive('listPaymentIntents')->andReturn([$this->intent('pi_stay'), $this->intent('pi_service', [], ['kind' => 'portal_service_booking'])]);
        $this->stripe->shouldNotReceive('cancelPaymentIntent');

        $this->artisan('bookings:release-orphan-portal-holds')->assertExitCode(0);

        $this->assertSame(0, DB::table('audit_logs')->where('action', 'portal.hold.orphan_released')->count());
    }

    public function test_only_the_portals_own_old_held_intents_of_this_organisation(): void
    {
        $this->stripe->shouldReceive('listPaymentIntents')->andReturn([
            $this->intent('pi_widget', [], ['kind' => null, 'hold_token' => 'W']),                       // the public widget's
            $this->intent('pi_no_meta', ['metadata' => []]),                                            // somebody else's integration
            $this->intent('pi_fresh', ['created' => now()->subMinutes(10)->timestamp]),                 // the member may still be paying
            $this->intent('pi_unfinished', ['status' => 'requires_payment_method']),                    // no card is held
            $this->intent('pi_taken', ['status' => 'succeeded']),                                       // captured: a refund is a person's decision
            $this->intent('pi_gone', ['status' => 'canceled']),
            $this->intent('pi_other_org', [], ['org_id' => (string) ($this->org->id + 1)]),
        ]);
        $this->stripe->shouldNotReceive('cancelPaymentIntent');

        $this->artisan('bookings:release-orphan-portal-holds')->assertExitCode(0);
    }

    public function test_a_dry_run_names_the_hold_and_releases_nothing(): void
    {
        $this->stripe->shouldReceive('listPaymentIntents')->andReturn([$this->intent('pi_orphan')]);
        $this->stripe->shouldNotReceive('cancelPaymentIntent');

        $this->assertStringContainsString('[dry-run] would release pi_orphan', $this->run_(['--dry-run' => true]));
        $this->assertSame(0, DB::table('audit_logs')->count());
    }

    public function test_a_stripe_failure_for_one_venue_does_not_stop_the_run(): void
    {
        $this->stripe->shouldReceive('listPaymentIntents')->andThrow(new \RuntimeException('stripe down'));

        $this->artisan('bookings:release-orphan-portal-holds')->assertExitCode(0);
    }

    public function test_a_venue_without_online_payments_is_not_asked(): void
    {
        HotelSetting::withoutGlobalScopes()->where('organization_id', $this->org->id)->where('key', 'booking_payment_enabled')->update(['value' => 'false']);
        $this->stripe->shouldNotReceive('listPaymentIntents');

        $this->artisan('bookings:release-orphan-portal-holds')->assertExitCode(0);
    }
}
```

Create `tests/Feature/Booking/DiagOrphanStripePisTest.php`:

```php
<?php

namespace Tests\Feature\Booking;

use App\Models\Organization;
use App\Services\StripeService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Mockery;
use Stripe\PaymentIntent;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\Concerns\SetsUpServiceBookingSchema;
use Tests\TestCase;

class DiagOrphanStripePisTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema, SetsUpServiceBookingSchema;

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        Mockery::close();
        parent::tearDown();
    }

    public function test_a_payment_a_service_booking_carries_is_not_an_orphan(): void
    {
        $this->setUpCapturePendingSchema();
        $this->setUpServiceBookingSchema();
        $org = Organization::create(['name' => 'Numa', 'slug' => 'numa-' . uniqid()]);
        DB::table('booking_mirror')->insert(['organization_id' => $org->id, 'reservation_id' => 'R-1', 'stripe_payment_intent_id' => 'pi_stay', 'price_total' => 180, 'created_at' => now(), 'updated_at' => now()]);
        DB::table('service_bookings')->insert(['organization_id' => $org->id, 'booking_reference' => 'SVC-1', 'service_id' => 1, 'customer_name' => 'A', 'customer_email' => 'a@example.test', 'start_at' => now(), 'end_at' => now(), 'duration_minutes' => 45, 'stripe_payment_intent_id' => 'pi_service', 'created_at' => now(), 'updated_at' => now()]);

        $stripe = Mockery::mock(StripeService::class);
        $stripe->shouldReceive('isEnabled')->andReturn(true);
        $stripe->shouldReceive('listPaymentIntents')->once()->andReturn(array_map(
            fn (string $id) => PaymentIntent::constructFrom(['id' => $id, 'status' => 'requires_capture', 'amount' => 5400, 'currency' => 'eur', 'created' => now()->subHour()->timestamp, 'metadata' => ['kind' => 'portal_service_booking']]),
            ['pi_stay', 'pi_service', 'pi_orphan'],
        ));
        $this->app->instance(StripeService::class, $stripe);

        Artisan::call('diag:orphan-stripe-pis', ['--org' => $org->id, '--json' => true]);
        $report = json_decode(Artisan::output(), true);

        $this->assertSame(3, $report['scanned']);
        $this->assertSame(['pi_orphan'], array_column($report['orphans'], 'pi_id'));
        $this->assertSame('portal_service_booking', $report['orphans'][0]['metadata']['kind']);
    }
}
```

Create `tests/Unit/Support/AdvisoryLockOnlyTest.php`:

```php
<?php

namespace Tests\Unit\Support;

use PHPUnit\Framework\TestCase;
use Symfony\Component\Finder\Finder;

/**
 * A string-keyed Postgres advisory lock is taken in one place,
 * App\Support\AdvisoryLock, behind its driver check. Anywhere else it is a
 * statement the test suite's sqlite cannot run — which is how the stays
 * confirm went untested for a year.
 */
class AdvisoryLockOnlyTest extends TestCase
{
    public function test_the_string_keyed_lock_statement_appears_only_in_the_helper(): void
    {
        $offenders = [];
        foreach ((new Finder())->files()->in(dirname(__DIR__, 3) . '/app')->name('*.php') as $file) {
            if (str_contains($file->getContents(), 'pg_advisory_xact_lock(hashtext(') && $file->getFilename() !== 'AdvisoryLock.php') {
                $offenders[] = $file->getRelativePathname();
            }
        }

        $this->assertSame([], $offenders);
    }
}
```

(`BrandController`'s two-integer form `pg_advisory_xact_lock(?, ?)` is another statement and is left alone.)

Create `tests/Feature/Member/RetiredEndpointsTest.php`:

```php
<?php

namespace Tests\Feature\Member;

class RetiredEndpointsTest extends MemberEndpointTestCase
{
    /** Spec ruling portal-8: nothing calls it, and two write paths per booking kind invite drift. */
    public function test_the_old_member_reservation_endpoint_is_gone(): void
    {
        $org = $this->tenant();
        ['token' => $token] = $this->member($org);

        $status = $this->withToken($token)->postJson('/api/v1/member/reservations', ['check_in' => now()->addDays(3)->toDateString(), 'check_out' => now()->addDays(5)->toDateString()])->status();

        $this->assertContains($status, [404, 405]);
        $this->assertFalse(class_exists(\App\Http\Controllers\Api\V1\Member\MemberReservationController::class));
    }
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Booking/ReleaseOrphanPortalHoldsTest.php tests/Feature/Booking/DiagOrphanStripePisTest.php tests/Unit/Support/AdvisoryLockOnlyTest.php tests/Feature/Member/RetiredEndpointsTest.php --no-ansi`
Expected: FAIL — no such command; `listPaymentIntents` does not exist; three offenders named (`ServicePublicController`, `WidgetChatController`, `Admin/ServiceBookingController`); the endpoint answers 422 or 201.

- [ ] **Step 3: `StripeService::listPaymentIntents()`**

Add to `app/Services/StripeService.php` after `retrievePaymentIntent()`:

```php
    /**
     * Every PaymentIntent of this organisation's Stripe account created in
     * the window (unix timestamps, inclusive), across all pages. For the
     * two jobs that look for payments the database does not know about.
     *
     * @return iterable<\Stripe\PaymentIntent>
     */
    public function listPaymentIntents(int $createdFrom, int $createdTo): iterable
    {
        $this->boot();

        if (!$this->client) {
            throw new \RuntimeException('Stripe is not configured for this organization.');
        }

        return $this->client->paymentIntents
            ->all(['created' => ['gte' => $createdFrom, 'lte' => $createdTo], 'limit' => 100])
            ->autoPagingIterator();
    }
```

- [ ] **Step 4: The sweeper**

Create `app/Console/Commands/ReleaseOrphanPortalHolds.php`:

```php
<?php

namespace App\Console\Commands;

use App\Models\AuditLog;
use App\Models\BookingMirror;
use App\Models\HotelSetting;
use App\Models\ServiceBooking;
use App\Services\StripeService;
use App\Support\AdvisoryLock;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

/**
 * Releases card holds the member portal took for a booking that was never
 * written: the card was authorised, then the browser closed or the
 * connection dropped before confirm. No row carries such a payment, so
 * the capture job never sees it; without this the hold sits on the
 * member's card until Stripe's authorisation lapses (about a week).
 *
 * Deliberately narrow. It releases a payment only when ALL of these hold:
 *   - the portal made it (metadata `kind` is portal_service_booking or
 *     portal_stay_booking) for THIS organisation (metadata `org_id`);
 *   - a card is held and nothing was taken (`requires_capture`);
 *   - it is older than --minutes (default 45: a stay's hold lives fifteen
 *     minutes from the payment step) and younger than six days;
 *   - no service booking and no stay of the organisation carries it —
 *     checked under the same lock the portal's confirm takes on the
 *     payment, so a confirm in flight is waited out, never raced.
 * A captured payment is never touched: returning money is a person's decision.
 */
class ReleaseOrphanPortalHolds extends Command
{
    protected $signature = 'bookings:release-orphan-portal-holds
                            {--org= : Limit to a single organization id}
                            {--dry-run : Report what would be released without calling Stripe}
                            {--minutes=45 : How old a hold must be before it is released}';

    protected $description = 'Release card holds the member portal took for bookings that were never written.';

    private const KINDS = ['portal_service_booking', 'portal_stay_booking'];

    public function handle(StripeService $stripe): int
    {
        $dry = (bool) $this->option('dry-run');
        $minutes = max(20, (int) $this->option('minutes'));
        $released = 0;

        $orgIds = HotelSetting::withoutGlobalScopes()
            ->where('key', 'booking_payment_enabled')
            ->where('value', 'true')
            ->when($this->option('org'), fn ($q) => $q->where('organization_id', (int) $this->option('org')))
            ->pluck('organization_id')
            ->unique();

        foreach ($orgIds as $orgId) {
            $orgId = (int) $orgId;
            app()->instance('current_organization_id', $orgId);
            try {
                if (!$stripe->isEnabled()) {
                    continue;
                }
                foreach ($stripe->listPaymentIntents(now()->subDays(6)->timestamp, now()->subMinutes($minutes)->timestamp) as $pi) {
                    if ($this->isOrphanedHold($pi, $orgId) && $this->release($stripe, $pi, $orgId, $dry)) {
                        $released++;
                    }
                }
            } catch (\Throwable $e) {
                // One venue's Stripe being down must not stop the others.
                Log::warning('bookings:release-orphan-portal-holds failed for a venue', ['org' => $orgId, 'error' => $e->getMessage()]);
            }
        }
        app()->forgetInstance('current_organization_id');

        $this->info(($dry ? '[dry-run] ' : '') . "{$released} hold(s) " . ($dry ? 'would be released.' : 'released.'));

        return self::SUCCESS;
    }

    private function isOrphanedHold(object $pi, int $orgId): bool
    {
        $meta = $this->metadata($pi);

        return (string) ($pi->status ?? '') === 'requires_capture'
            && in_array($meta['kind'] ?? null, self::KINDS, true)
            && (int) ($meta['org_id'] ?? 0) === $orgId
            && !$this->carried((string) $pi->id, $orgId);
    }

    private function release(StripeService $stripe, object $pi, int $orgId, bool $dry): bool
    {
        $id = (string) $pi->id;
        if ($dry) {
            $this->line("[dry-run] would release {$id} (org {$orgId}, " . ($this->metadata($pi)['kind'] ?? '') . ')');
            return true;
        }

        // The portal's confirm locks the payment before it writes the booking
        // that carries it; taking the same lock here means a confirm in flight
        // has either committed (and the payment is carried) or not started.
        return (bool) AdvisoryLock::transaction('pi:' . $id, function () use ($stripe, $pi, $id, $orgId) {
            if ($this->carried($id, $orgId)) {
                return false;
            }
            try {
                $stripe->cancelPaymentIntent($id, 'abandoned');
            } catch (\Throwable $e) {
                Log::warning('bookings:release-orphan-portal-holds could not cancel a hold', ['org' => $orgId, 'payment_intent' => $id, 'error' => $e->getMessage()]);
                return false;
            }
            AuditLog::create([
                'organization_id' => $orgId,
                'action'          => 'portal.hold.orphan_released',
                'subject_type'    => 'stripe_payment',
                'subject_id'      => null,
                'new_values'      => ['payment_intent_id' => $id, 'amount' => (int) ($pi->amount ?? 0), 'currency' => (string) ($pi->currency ?? ''), 'metadata' => $this->metadata($pi)],
                'description'     => "Released the card hold {$id}: the member portal took it for a booking that was never written",
            ]);

            return true;
        });
    }

    private function carried(string $piId, int $orgId): bool
    {
        return ServiceBooking::withoutGlobalScopes()->where('organization_id', $orgId)->where('stripe_payment_intent_id', $piId)->exists()
            || BookingMirror::withoutGlobalScopes()->where('organization_id', $orgId)->where('stripe_payment_intent_id', $piId)->exists();
    }

    private function metadata(object $pi): array
    {
        $m = $pi->metadata ?? [];

        return is_array($m) ? $m : (method_exists($m, 'toArray') ? $m->toArray() : (array) $m);
    }
}
```

In `routes/console.php`, after the `bookings:award-stay-points` block:

```php
// Card holds the member portal took for a booking that was never written
// (the browser closed between authorisation and confirm). No row carries
// them, so the capture job cannot see them; this releases them after 45
// minutes instead of leaving them on the member's card for a week.
Schedule::command('bookings:release-orphan-portal-holds')
    ->everyThirtyMinutes()
    ->withoutOverlapping(20);
```

- [ ] **Step 5: The diagnostic knows service bookings**

In `app/Console/Commands/DiagOrphanStripePis.php`:

(a) import `use App\Models\ServiceBooking;`; change `$description` to `'Find Stripe PaymentIntents that no stay and no service booking carries.'` and the class docblock's first sentence to "…find ones that NO BookingMirror row and NO ServiceBooking row carries…";

(b) replace the block from `$client = $this->resolveStripeClient($stripe);` through the `try { $piList = … } catch { … }` with:

```php
        // The customer's email is a best-effort extra read straight from the
        // Stripe client; the list itself goes through the service.
        $client = $this->resolveStripeClient($stripe);

        $sinceTs = now()->subHours($hours)->timestamp;

        $this->info(sprintf(
            'Listing PaymentIntents for org %d (%s) since %s (%dh window)...',
            $orgId,
            $org->name,
            date('c', $sinceTs),
            $hours,
        ));

        $orphans = [];
        $totalScanned = 0;

        try {
            $intents = $stripe->listPaymentIntents($sinceTs, now()->timestamp);
        } catch (\Throwable $e) {
            $this->error('Stripe list failed: ' . $e->getMessage());
            return self::FAILURE;
        }
```

(c) change the loop header to `foreach ($intents as $pi) {` and the lookup inside it to:

```php
            try {
                $carried = BookingMirror::withoutGlobalScopes()->where('organization_id', $orgId)->where('stripe_payment_intent_id', $pi->id)->exists()
                    || ServiceBooking::withoutGlobalScopes()->where('organization_id', $orgId)->where('stripe_payment_intent_id', $pi->id)->exists();
            } catch (\Throwable $e) {
                $carried = false;
            }

            if ($carried) {
                continue;
            }
```

(d) in the orphan row replace `'customer_email' => $this->resolveCustomerEmail($client, $pi),` with `'customer_email' => $client ? $this->resolveCustomerEmail($client, $pi) : (!empty($pi->receipt_email) ? (string) $pi->receipt_email : null),`;

(e) replace the "No orphan…" line with `'No orphan PaymentIntents found. Every PI is carried by a stay or a service booking.'`, and add the kind to the table's metadata summary: before `if ($orgIdMeta !== null) {` insert `if (!empty($o['metadata']['kind'])) { $metaSummary .= $o['metadata']['kind']; }` and make the two appends below it use `($metaSummary ? ' ' : '')` as the second already does.

- [ ] **Step 6: One lock helper**

In each of `app/Http/Controllers/Api/V1/ServicePublicController.php` (line 352), `app/Http/Controllers/Api/V1/Widget/WidgetChatController.php` (line 2617) and `app/Http/Controllers/Api/V1/Admin/ServiceBookingController.php` (line 395) replace the statement

```php
DB::statement('SELECT pg_advisory_xact_lock(hashtext(?))', [$lockKey]);
```

(in `WidgetChatController` it is written `\Illuminate\Support\Facades\DB::statement(…)`) with

```php
\App\Support\AdvisoryLock::within($lockKey);
```

The surrounding `DB::transaction(…)` and the lock keys stay exactly as they are: on PostgreSQL the same statement runs at the same point of the same transaction.

- [ ] **Step 7: Retire the endpoint**

Delete `app/Http/Controllers/Api/V1/Member/MemberReservationController.php`. In `routes/api.php` replace lines 369-372 (the three comment lines and the `Route::post('reservations', …)` line) with:

```php
            // POST member/reservations retired 2026-10 (spec ruling portal-8): the portal books stays through member/portal/stays/*
```

Then confirm nothing else names it: `grep -rn "MemberReservationController" app routes tests` prints only `tests/Feature/Member/RetiredEndpointsTest.php`.

- [ ] **Step 8: Run the tests**

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Booking/ReleaseOrphanPortalHoldsTest.php tests/Feature/Booking/DiagOrphanStripePisTest.php tests/Unit/Support/ tests/Feature/Member/RetiredEndpointsTest.php --no-ansi`
Expected: all pass.

Then the suites the three controllers live under: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Widget/ --no-ansi`, `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Admin/ --no-ansi`, `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Booking/ --no-ansi`
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add -A app/Console/Commands app/Services/StripeService.php app/Http/Controllers/Api/V1 routes tests/Feature/Booking tests/Unit/Support tests/Feature/Member/RetiredEndpointsTest.php
git commit -m "Release orphaned portal holds, take every slot lock through the helper, retire the old endpoint

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 22: Runbook, CLAUDE.md, spec notes

**Files:**
- Modify: `docs/member-portal.md`, `CLAUDE.md`, `docs/superpowers/specs/2026-09-23-member-portal-v2-design.md`

**Interfaces:**
- Consumes: everything above. Produces nothing code reads.

- [ ] **Step 1: `docs/member-portal.md`**

(a) At the top, where the document says what the portal can do, add stays and cancellation to the list, and correct the sentence on ownership (contradiction 5 in `carried-over-and-gating-facts.md`): a booking belongs to the member by `member_id` on both `service_bookings` and `booking_mirror`, by a guest linked to the member, or by a verified email.

(b) After the section "Booking (phase 2)" add:

````markdown
## Stays (phase 3)

A member books a room at `/portal/book/stay` in four steps: dates and party, room, review, pay.

| Endpoint | What it does |
|---|---|
| `GET member/portal/stays` | active rooms, extras, policies, limits, the member's automatic benefit, the payment mode |
| `GET member/portal/stays/availability?check_in&check_out&adults&children` | free rooms with the list total and the member's total |
| `POST member/portal/stays/quote` | the engine's quote at the member's price; writes a hold that names the member |
| `POST member/portal/stays/payment-intent {hold_token}` | a PaymentIntent for the hold's total; extends the hold to fifteen minutes |
| `POST member/portal/stays/confirm {hold_token, payment_intent_id?, special_requests?}` | books through `BookingEngineService::confirm()` |

**What is sold.** Single rooms only. The engine can offer two or three rooms together to a large party; the portal does not sell those (the combined confirm has no room lock and no re-checks) and tells the party to contact the venue. `capabilities.stays` is true when the venue has an active room, the Smoobu integration is switched on, and the member has a membership row — whatever the venue's industry.

**The hold.** Every quote writes a new row in `booking_holds` (ten minutes; fifteen from the payment step). The portal writes onto its payload `member_id`, `user_id`, `list_total`, `discount`, `discount_source`, `discount_source_id`, `discount_label`, `coupon`, `channel_name = "Member portal"`, and replaces `gross_total` with the member's total, which is what the payment charges, the mirror stores and Smoobu is told. A hold reserves nothing: availability counts bookings. A hold can be paid for and confirmed only by the member it names; anybody else gets 404 `hold_not_found`.

**Booked once.** A hold is consumed by the confirm that books it and remembers the stay it became (`payload.mirror_id`). A second confirm of the same hold answers that stay with `replayed: true`. There is no `Idempotency-Key` header on this endpoint.

**The engine.** `BookingEngineService::confirm()` is still the one writer of a stay. For a hold that names a member it stores the member, the discount and the special requests on the mirror, names the channel "Member portal", and sends Smoobu the discounted price with the discount taken off the accommodation line. The portal passes it two hooks (`StayConfirmHooks`): before the PMS is asked, the payment is proven unspent and the coupon is consumed; after the mirror is written, the coupon gets the booking's reference. A refusal before the PMS costs nothing; a Smoobu rejection rolls the coupon back.

**Payment.** The PaymentIntent's metadata is `kind = portal_stay_booking`, `org_id`, `member_id`, `portal_hold_token`, `total` — not `hold_token`, which belongs to the public widget's intents. Confirm checks the organisation, the member, the hold and the amount. The card is held at confirm (`payment_status = authorized`) and captured by `bookings:capture-pending-pis` within ten minutes. A stay paid at the venue stores `payment_status = open`, `payment_method = pay_at_venue`.

**The Smoobu sync** keeps what the portal wrote: the channel name, the member's guest link, a payment status of `refunded`, `partially_refunded`, `disputed`, `cancelled` or `authorized`, a member's online payment that Smoobu reports as unpaid, and a cancellation made here.

**Points** for a stay are awarded the day after departure by `bookings:award-stay-points` (daily, 04:15), on what the member paid, once.

## Cancellation (phase 3)

`POST member/portal/bookings/{kind}/{id}/cancel` — the member's own booking, while `can_cancel` is true.

| | Appointment | Stay |
|---|---|---|
| Status | `pending`, `confirmed` | `new`, `confirmed`, `pending_pms_sync` |
| Also | payment not refunded or disputed | booked directly ("Website" or "Member portal"), not part of a combination, payment not refunded, partly refunded, disputed or channel-managed |
| Until | start − `services_cancel_hours` (24) | arrival at the check-in time, venue time zone − `booking_cancel_hours` (48) |

Both hours are in Settings → Booking. The policy TEXT next to them is what members read; the hours are what is enforced.

**Order.** Under a lock on the booking: the policy is checked, the money is returned, then the booking is cancelled, its coupon given back and its points reversed. If the money cannot be returned the booking stays as it was and the member is told to try again (502 `refund_failed`).

| The payment | What happens | `payment_status` after |
|---|---|---|
| none online | nothing | unchanged |
| a held card | the intent is cancelled | `cancelled` |
| taken | refunded in full | `refunded` |

A stay's refund goes through `BookingRefundService::applyRefund()` (Stripe, points, Smoobu, the refund mail, `refund_attempts`). A service booking's goes through `ServiceBookingRefund` and is recorded on the booking (`refunded_amount`, `refunded_at`, `last_refund_id`).

**What both sides hear.** The member gets `BookingCancelledMail` (or, for a refunded stay, the refund mail, which says the same). The venue gets `AdminBookingCancelledMail`, a realtime event `booking.cancelled`, and an audit row (`service_booking.member_cancelled` / `booking.member_cancelled`).

**A coupon comes back** only when the row still says this booking used it (`member_offers.used_reference`, or the redemption's note). A claim marked used at the counter, or by a later booking, is left alone.

**Staff-side cancellation is unchanged**: it sets the status and nothing else. `bookings:capture-pending-pis` releases the open hold of any cancelled booking, appointment or stay, and flags a payment already taken (`…capture.needs_refund`) for a person to refund.
````

(c) In "Payments an operator must handle by hand": rewrite the first bullet — a cancellation the MEMBER makes returns the money itself; the bullet now covers bookings STAFF cancel after capture, for both kinds, and names both audit actions (`service_booking.capture.needs_refund`, `booking.capture.needs_refund`). Replace the second bullet ("A hold left by a browser closed…") with: "A card hold left by a browser that closed between authorisation and confirm is released by `bookings:release-orphan-portal-holds` (every thirty minutes, holds older than 45 minutes) and audited as `portal.hold.orphan_released`. `diag:orphan-stripe-pis --org=N` lists every payment no booking carries." Add a bullet: "A refund made in the Stripe dashboard for a service booking's payment is recorded on the booking by the webhook (`service_booking.refunded`)."

(d) Replace "Deferred, known" with the list as it stands after this phase:

````markdown
## Deferred, known

- **Memberships for medical venues.** A medical venue has no loyalty programme by product decision; the admin hides "Members & Loyalty" and Settings → Booking for it. Portal booking needs a membership row, which exists only where the venue has an active tier. The owner's decision is open.
- **Portal booking without a membership row** — follows from the above.
- **Combination stays** in the portal: `confirmCombo()` needs a room lock and the re-checks the single-room confirm has.
- **Extras pricing on stays.** `BookingEngineService::extrasLines()` charges price × quantity for every extra the admin can save (`per_night`, `per_person`, `per_person_night` are not multiplied). The portal shows the engine's own line totals. Changing it changes what the public widget charges.
- **Redirect-based payment methods** stay off in the portal (`allow_redirects: 'never'`); a return handler has to restore the flow's state after the redirect.
- **"Pay at the venue although we take cards"** when Stripe is unavailable: needs a venue setting.
- **The `svc:` and `svcm:` slot locks** do not serialise each other (an "anyone available" confirm and a named-master confirm for the same master).
- **The engine's literal `EUR`** in holds, the Smoobu receipt and the confirm response; the portal reports `booking_currency` and takes online payment only when it equals Stripe's currency.
- **Zero-decimal currencies in the refund webhook** (`amount / 100`), stays and services alike.
- **Cancellation fees and partial refunds** (spec §12).
- The unique index on `service_bookings (organization_id, stripe_payment_intent_id)` is created by the phase 3 migration unless the table holds a repeated reference; the migration then logs a warning and creates nothing. Check the log after the deploy.
````

- [ ] **Step 2: `CLAUDE.md`**

In "Member-portal code rules" add:

```markdown
- A stay has one writer, `BookingEngineService::confirm()`. The portal reaches it through `StayConfirmHooks`; it
  never writes a mirror itself. The public widget's behaviour is pinned by `BookingEngineConfirmTest`'s "widget"
  tests — a change that needs one of them edited is a change to the widget.
- A string-keyed advisory lock is taken through `App\Support\AdvisoryLock` only (`AdvisoryLockOnlyTest`).
- Cancellation returns the money first and cancels second; a payment that cannot be returned leaves the booking
  standing. Nothing cancels a PaymentIntent a booking carries except that booking's own cancellation.
- The portal decides nothing about money on the client: `can_cancel`, every total and every outcome are the server's.
```

- [ ] **Step 3: The spec**

In `docs/superpowers/specs/2026-09-23-member-portal-v2-design.md`, under the heading of §7, add a note in the style of §6's "Built 2026-09" note:

```markdown
> **Built 2026-10, with these departures** (plan `docs/superpowers/plans/2026-09-29-member-portal-v2-phase-3.md`,
> rulings plan3-1 … plan3-21; decision #5 "no patient loyalty programme" reversed by the owner): single rooms only, combinations deferred (portal-9 not built); the stays payment
> intent stayed in the portal controller, keyed on a hold that names its member (`portal_hold_token`), and
> `paymentIntentForHold()` was not extracted; a hold is its own idempotency key; a released hold stores
> `payment_status = cancelled`, a refund `refunded`; stays are gated on capability and the Smoobu switch, not on
> the hotel industry; `MemberBookingQuery` lives in `App\Services\Portal`.
```

and in §3.2 correct the namespace of `MemberBookingQuery` to `App\Services\Portal`.

- [ ] **Step 4: Commit**

```bash
git add docs/member-portal.md CLAUDE.md docs/superpowers/specs/2026-09-23-member-portal-v2-design.md
git commit -m "Document stays, cancellation and what phase 3 leaves for later

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 23: Eyes first, a live pass on local PostgreSQL, batteries

Phase 2's tests were green while every first confirm failed on PostgreSQL (`guests.full_name` NOT NULL): the sqlite schemas are written by hand. Nothing that inserts a row is done until it has inserted one into the real schema.

**Files:**
- Create: `.superpowers/sdd/<this plan's workspace>/task-23-report.md` (the report), screenshots beside it
- Modify: whatever the pass finds, each fix with its own test and commit

**Interfaces:**
- Consumes: the whole branch.
- Produces: the report the final review reads.

- [ ] **Step 1: The migration, by path, on the local database**

```bash
cd /c/wamp64/www/Hexa-Tech-portal
/c/wamp64/bin/php/php8.4.20/php.exe artisan migrate --path=database/migrations/2026_09_30_100000_member_portal_phase_3.php
/c/wamp64/bin/php/php8.4.20/php.exe artisan migrate:status --no-ansi | grep member_portal_phase_3
```

Expected: `Ran`. Never `migrate` without `--path`, never `migrate:fresh`: the database is shared with other checkouts. Then compare every column this phase writes with the real table: `/c/wamp64/bin/php/php8.4.20/php.exe artisan db:table booking_mirror --no-ansi` and `… db:table service_bookings`, `… db:table booking_holds`, `… db:table guests`, `… db:table member_offers` — note each NOT NULL column without a default that a new insert of this phase does not set, and fix the insert (with a test that would have caught it).

- [ ] **Step 2: A venue to try it on**

Use a local venue that has: an active tier, a member who can sign in, at least two active rooms with a base price (one for two guests, one for three), one active extra, `booking_policies` with a check-in time and a policy text, `booking_cancel_hours = 48`, the Smoobu integration switched on with no API key (the client then runs in mock mode: reservations get a made-up id, nothing leaves the machine), and online payments off. Record the organisation id and the member's email in the report — never a password or a key.

- [ ] **Step 3: Eyes first**

Build and serve the SPA as the repo's README describes for local work, sign in as the member, and capture each screen at 390 × 844 and 1440 × 900, light and dark (OS preference), into the report's folder:

1. Book — the chooser (a venue with both capabilities) and the direct entry (stays only)
2. Dates — empty; two nights chosen; a stay shorter than the venue's minimum
3. Rooms — two rooms, one discounted; nothing free; a party too large
4. Review — with an extra switched on, a coupon applied, a coupon outbid
5. Pay — pay at the venue
6. Bookings — the confirmation banner, the stay in the list, the stay's sheet with "Cancel booking"
7. The cancel question, and the sheet after cancelling
8. A booking outside its window (the contact notice, "Free cancellation ended …")
9. Admin — Settings → Sidebar Menu for a medical venue ("Hidden for your industry") and for a hotel; the sidebar of a medical venue ("Procedure bookings" and "Procedures"); Settings → Booking with the two hours fields

Look at every capture against the house style (`hexatech-house-style`): two typefaces, body contrast ≥ 4.5:1 in both modes, touch targets ≥ 44 px at 390, no horizontal scroll, the primary action reachable without scrolling past the fold on Pay. Write down what you changed because of what you saw. Then remove one thing: the weakest decorative element of the stay flow.

- [ ] **Step 4: The live pass**

With the member signed in, on local PostgreSQL:

1. Quote, confirm (pay at venue): one row in `booking_mirror` with `member_id`, `channel_name = 'Member portal'`, `list_total`, `discount_amount`, `notice`; the hold `consumed` with `mirror_id`; one `booking_price_elements` row per line including the discount; the confirmation mail in the log mailer with the discount line.
2. Confirm the same hold again (repeat the request from the browser's network panel): 200, `replayed: true`, still one mirror.
3. A coupon: quote with it, confirm; `member_offers.used_reference` is the booking's reference.
4. Run the sync over it: `/c/wamp64/bin/php/php8.4.20/php.exe artisan bookings:sync-pms --org=<id>` (mock mode returns nothing to sync; then call `upsertBookingFromData()` for the mirror's reservation id from `artisan tinker` with a Smoobu-shaped array naming another channel) — the channel, the member and the payment status are unchanged.
5. Cancel the stay in the portal: `internal_status = cancelled`, `cancelled_at`, `cancellation_reason = member_portal`; the coupon is `claimed` again; both mails in the log; the sheet shows the outcome.
6. Cancel an appointment the same way.
7. Try to cancel again (repeat the request): 409 `already_cancelled`.
8. `/c/wamp64/bin/php/php8.4.20/php.exe artisan bookings:award-stay-points --dry-run` and `… bookings:release-orphan-portal-holds --dry-run` run and exit 0.
9. Two browsers, the same room and dates, confirm in both: one books, the other answers `room_unavailable`.

Write PHP you need for this into a scratch file with the Write tool and run it with `artisan tinker --execute="require '<path>';"`; do not paste multi-line PHP into the shell.

The card path cannot be tried locally (no venue here has Stripe keys, and none is to be given one). It is covered by the tests and by the hand traces of Tasks 17 and 19; say so in the report. The owner's first booking on the live venue is the first real card.

- [ ] **Step 5: Batteries**

Each in the foreground, read the `Tests:` line yourself:

```bash
P=/c/wamp64/bin/php/php8.4.20/php.exe
$P artisan view:clear
for d in tests/Feature/Member tests/Feature/Loyalty tests/Feature/Booking tests/Feature/Mail tests/Feature/Admin tests/Feature/Widget tests/Feature/Stripe tests/Feature/Pwa tests/Feature/Auth tests/Feature/Setup tests/Unit; do
  echo "== $d"; $P artisan test "$d" --no-ansi 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E 'Tests:|FAILED|Errors' ; done
```

The Landing suite outruns ten minutes in one run: run it as three chunks of thirteen files in parallel, as the phase 2 archive's `task-21-report.md` records. Then, in `frontend/`: `npx tsc -b && npx vitest run && npx eslint src/portal src/lib src/components/MenuSettings.tsx`.

Expected: every PHP suite green; vitest green except the 3 pre-existing `plannerMeta` failures; `tsc` and `eslint` clean. Record every `Tests:` line in the report.

- [ ] **Step 6: Report and commit**

Write `task-23-report.md`: what was looked at, what was changed because of it, every `Tests:` line, what was not verified and why (the card path; a real Smoobu account). Commit the fixes as they were made; the report stays in the workspace.

---

### Task 24: Memberships for every industry (owner's decision, 2026-09-29)

**Runs after Task 21 and before Tasks 22 and 23** (the documents and the verification pass cover it). The owner decided: every industry has memberships, medical included. Until now a medical venue got no tiers, no Members group in the admin, no Loyalty settings, no Scan item — and with them no member prices, no coupons and no portal booking. The owner also ruled that the public booking stays exactly as it is; nothing in this task touches it.

**Files:**
- Modify: `app/Services/IndustryPrompts/IndustryPromptService.php` (`medical()` `:166-271`), `app/Services/LoyaltyPresetService.php` (`NO_PROGRAMME_INDUSTRIES` `:150`, `apply()` `:263-295` and the settings block `:456-469`, `PRESETS`), `app/Services/OrganizationSetupService.php` (comments `:296-302`, `:375-383`), `app/Http/Controllers/Api/V1/Auth/AuthController.php` (`:659-663`, comments `:680-686`, `:1182-1190`), `app/Services/Portal/PortalBootstrap.php` (docblock of `loyaltyOn()`), `frontend/src/lib/industryGating.ts`, `frontend/src/lib/vocabulary.ts`, `frontend/src/pages/Setup.tsx` (`:43`)
- Create: `app/Console/Commands/ProvisionLoyaltyProgramme.php`, `frontend/src/lib/industryGating.test.ts`
- Test: `tests/Unit/IndustryPrompts/IndustryPromptServiceTest.php`, `tests/Feature/Loyalty/LoyaltyPresetServiceTest.php`, `tests/Feature/Setup/OrganizationSetupServiceTest.php`, `tests/Feature/Member/Portal/PortalBootstrapTest.php` (all modify), `tests/Feature/Loyalty/ProvisionLoyaltyProgrammeTest.php` (create)

**Interfaces:**
- Consumes: `LoyaltyPresetService::apply(string $key, int $organizationId): array`; `industryHiddenGroupsFor()` (Task 20).
- Produces:
  - `IndustryPromptService::for('medical')->hasLoyalty === true`, `passLabel 'Patient Card'`, `passDescription 'Clinic membership card'`.
  - `LoyaltyPresetService::PRESETS['medical']`; `NO_PROGRAMME_INDUSTRIES = []` (the constant stays: `OrganizationSetupService` reads it); a preset may carry `'points_on_bookings' => false`, written as the setting of that name on a clean replace.
  - Command `loyalty:provision-programme {--org=} {--all} {--apply}` — dry run unless `--apply`.
  - `industryHiddenItemsFor(industry)`, `industryHiddenSettingsTabsFor(industry)` (pure, exported, the hooks are built on them).
  - No industry hides the "Members & Loyalty" group, the Loyalty settings tab or the Booking settings tab.

**Rulings for this task (the owner may overturn any):**
- **plan3-17** A clinic's programme starts with points for bookings switched OFF (`points_on_bookings = false`): inducements for medical services are regulated in several countries, and a clinic that may and wants to reward visits switches it on in Settings. Member prices, coupons and portal booking work without points.
- **plan3-18** The medical preset's perks carry no percentage or amount ("10% off …"): a perk written that way becomes an automatic discount on every booking, which is the clinic's decision to make, not a default.
- **plan3-19** Existing venues are not changed by the deploy. A venue that has no active tier gets its programme when someone applies a preset in Members, or when an operator runs `loyalty:provision-programme --org=N --apply`. Patients are not enrolled in bulk and nobody is emailed: a member row is created when a patient registers, signs in to the portal, or is enrolled by staff.
- **plan3-20** Settings → Booking is shown for every industry. It was hidden for non-hotel venues "until the Appointment Engine settings ship"; meanwhile it is the only place where a venue sets its service slot step, lead time, cancellation policy, the cancellation hours of this phase, and switches online payment on.
- **plan3-21** The Member App settings tab stays hidden where it was: there is no patient mobile app.

- [ ] **Step 1: Write the failing backend tests**

(a) `tests/Unit/IndustryPrompts/IndustryPromptServiceTest.php` — replace `test_medical_has_loyalty_is_false_per_product_decision` and `test_all_other_industries_have_loyalty_true` with:

```php
    /* ─── Every industry has memberships (owner's decision, 2026-09-29) ─── */

    public function test_every_industry_has_loyalty(): void
    {
        // Decision #5 (medical has no loyalty programme) was reversed by the
        // owner: every industry has memberships, medical included.
        foreach (['hotel', 'beauty', 'medical', 'restaurant', 'legal', 'real_estate', 'education', 'fitness', 'other'] as $industry) {
            $this->assertTrue($this->service->for($industry)->hasLoyalty, "{$industry} MUST have hasLoyalty=true.");
        }
    }

    public function test_the_medical_card_is_a_patient_card(): void
    {
        $profile = $this->service->for('medical');
        $this->assertSame('Patient Card', $profile->passLabel);
        $this->assertSame('Clinic membership card', $profile->passDescription);
    }

    public function test_the_medical_safety_rules_are_untouched_by_the_membership(): void
    {
        $profile = $this->service->for('medical');
        $this->assertStringContainsString('NEVER diagnose', $profile->guardrails);
        $this->assertStringContainsString('NEVER recommend, dose, or advise on medication', $profile->guardrails);
        $this->assertNotSame('', $profile->adminGuardrails);
    }
```

and update the class docblock's paragraph on "Medical decision #5 invariant" to say the decision was reversed on 2026-09-29.

(b) `tests/Feature/Loyalty/LoyaltyPresetServiceTest.php` — delete `test_apply_medical_short_circuits_with_noop_summary`, `test_medical_gets_no_rewards_because_it_gets_no_programme` and `test_medical_is_recommended_nothing_because_it_gets_no_programme`; update the class docblock's contract 2; add:

```php
    /* ─── medical: a programme like every other industry ────────────────── */

    public function test_apply_medical_writes_a_patient_programme(): void
    {
        $summary = $this->service->apply('medical', $this->orgId);

        $this->assertArrayNotHasKey('noop', $summary);
        $this->assertTrue($summary['replaced']);
        $this->assertSame(['Patient', 'Care Plus'], LoyaltyTier::withoutGlobalScopes()
            ->where('organization_id', $this->orgId)->orderBy('min_points')->pluck('name')->all());
        $this->assertGreaterThan(0, BenefitDefinition::withoutGlobalScopes()->where('organization_id', $this->orgId)->count());
        $this->assertSame('medical', CrmSetting::where('key', 'members_preset')->first()->value);
    }

    public function test_a_clinics_programme_starts_without_points_for_bookings(): void
    {
        $this->service->apply('medical', $this->orgId);

        $this->assertSame('false', HotelSetting::withoutGlobalScopes()
            ->where('organization_id', $this->orgId)->where('key', 'points_on_bookings')->value('value'));

        // No other preset switches them off.
        $other = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $other->id);
        $this->service->apply('beauty', $other->id);
        $this->assertNull(HotelSetting::withoutGlobalScopes()
            ->where('organization_id', $other->id)->where('key', 'points_on_bookings')->first());
    }

    public function test_a_clinic_that_already_has_members_keeps_its_own_choice_about_points(): void
    {
        $tier = LoyaltyTierFactory::new()->create(['organization_id' => $this->orgId, 'name' => 'Bronze']);
        LoyaltyMember::withoutGlobalScopes()->create(['organization_id' => $this->orgId, 'user_id' => 1, 'tier_id' => $tier->id, 'member_number' => 'HL-1']);

        $summary = $this->service->apply('medical', $this->orgId);

        $this->assertFalse($summary['replaced']);
        $this->assertNull(HotelSetting::withoutGlobalScopes()
            ->where('organization_id', $this->orgId)->where('key', 'points_on_bookings')->first());
        $this->assertContains('Bronze', LoyaltyTier::withoutGlobalScopes()->where('organization_id', $this->orgId)->pluck('name')->all());
    }

    public function test_no_medical_perk_is_an_automatic_discount(): void
    {
        foreach (LoyaltyPresetService::PRESETS['medical']['tiers'] as $tier) {
            foreach ($tier['perks'] as $perk) {
                $this->assertNull(\App\Console\Commands\TypeBenefits::parse($perk), "'{$perk}' would discount every booking");
            }
        }
    }

    public function test_medical_is_recommended_its_own_preset(): void
    {
        \App\Models\Organization::withoutGlobalScopes()->where('id', $this->orgId)->update(['industry' => 'medical']);

        $this->assertSame('medical', collect($this->service->listPresets()['presets'])->firstWhere('recommended', true)['key'] ?? null);
    }

    public function test_no_industry_is_left_without_a_programme(): void
    {
        $this->assertSame([], LoyaltyPresetService::NO_PROGRAMME_INDUSTRIES);
        foreach (\App\Models\Organization::INDUSTRIES as $industry) {
            $key = is_string($industry) ? $industry : (string) key([$industry]);
            $summary = $this->service->apply($key, OrganizationFactory::new()->create()->id);
            $this->assertArrayNotHasKey('noop', $summary, $key);
            $this->assertGreaterThan(0, $summary['tiers_set'], $key);
        }
    }
```

`Organization::INDUSTRIES` (`app/Models/Organization.php:29-35`) may be a list of ids or a map of id → label; read it and iterate its ids. If the `LoyaltyMember` insert needs more columns in this test's schema, give it what `setUpLoyaltyPresetSchema()` requires.

(c) `tests/Feature/Setup/OrganizationSetupServiceTest.php` — replace `test_medical_org_gets_no_loyalty_settings_at_all` with:

```php
    public function test_medical_org_gets_the_operational_loyalty_settings_like_every_industry(): void
    {
        // Every industry has memberships (owner's decision, 2026-09-29).
        $org = $this->freshBeautyOrg();
        $org->update(['industry' => 'medical']);

        $this->service->setupDefaults($org->fresh());

        foreach (['referrer_bonus_points', 'points_expiry_months', 'points_per_currency'] as $key) {
            $this->assertNotNull(HotelSetting::where('key', $key)->first(), "Medical org must have loyalty setting '{$key}'.");
        }
    }
```

(d) `tests/Feature/Member/Portal/PortalBootstrapTest.php` — replace `test_a_medical_venue_gets_the_portal_without_loyalty` with:

```php
    public function test_a_medical_venue_gets_the_portal_with_its_membership(): void
    {
        $org = $this->tenant('Forma Dental');
        ['token' => $token] = $this->member($org);
        DB::table('organizations')->where('id', $org->id)->update(['industry' => 'medical']);
        $this->rota($org);

        $json = $this->withToken($token)->getJson(self::ENDPOINT)->assertOk()->json();

        $this->assertTrue($json['capabilities']['loyalty']);
        $this->assertTrue($json['capabilities']['services'], 'a clinic with a rota takes appointments in the portal');
        $this->assertNotNull($json['member']);
        $this->assertSame('fraunces', $json['venue']['display_face']);
    }
```

(e) Create `tests/Feature/Loyalty/ProvisionLoyaltyProgrammeTest.php`:

```php
<?php

namespace Tests\Feature\Loyalty;

use App\Models\LoyaltyTier;
use App\Models\Organization;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

class ProvisionLoyaltyProgrammeTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyPresetSchema();
        if (!Schema::hasColumn('organizations', 'industry')) {
            Schema::table('organizations', fn ($t) => $t->string('industry', 32)->nullable());
        }
        if (!Schema::hasTable('rewards')) {
            Schema::create('rewards', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('brand_id')->nullable();
                $t->string('name');
                $t->text('description')->nullable();
                $t->string('category', 60)->nullable();
                $t->integer('points_cost')->default(0);
                $t->boolean('is_active')->default(true);
                $t->integer('sort_order')->default(0);
                $t->timestamps();
            });
        }
        Mail::fake();
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        parent::tearDown();
    }

    private function org(string $industry, bool $withTier = false): Organization
    {
        $org = Organization::create(['name' => ucfirst($industry) . ' venue', 'slug' => $industry . '-' . uniqid(), 'industry' => $industry]);
        if ($withTier) {
            LoyaltyTier::withoutGlobalScopes()->create(['organization_id' => $org->id, 'name' => 'Own tier', 'min_points' => 0, 'is_active' => true]);
        }
        return $org;
    }

    private function tiers(Organization $org): array
    {
        return LoyaltyTier::withoutGlobalScopes()->where('organization_id', $org->id)->orderBy('min_points')->pluck('name')->all();
    }

    public function test_it_only_reports_until_told_to_apply(): void
    {
        $clinic = $this->org('medical');

        Artisan::call('loyalty:provision-programme', ['--all' => true]);

        $this->assertStringContainsString("would give org {$clinic->id}", Artisan::output());
        $this->assertSame([], $this->tiers($clinic));
    }

    public function test_it_gives_a_venue_without_tiers_its_industrys_programme(): void
    {
        $clinic = $this->org('medical');
        $salon = $this->org('beauty');

        $this->artisan('loyalty:provision-programme', ['--all' => true, '--apply' => true])->assertExitCode(0);

        $this->assertSame(['Patient', 'Care Plus'], $this->tiers($clinic));
        $this->assertSame(['Welcome', 'Devotee', 'Inner Circle'], $this->tiers($salon));
        Mail::assertNothingQueued();
        Mail::assertNothingSent();
    }

    public function test_a_venue_that_has_a_tier_is_left_exactly_as_it_is(): void
    {
        $own = $this->org('medical', withTier: true);

        $this->artisan('loyalty:provision-programme', ['--all' => true, '--apply' => true])->assertExitCode(0);

        $this->assertSame(['Own tier'], $this->tiers($own));
    }

    public function test_one_venue_can_be_named_and_a_scope_is_required(): void
    {
        $a = $this->org('medical');
        $b = $this->org('medical');

        $this->artisan('loyalty:provision-programme', ['--apply' => true])->assertExitCode(1);
        $this->assertSame([], $this->tiers($a));

        $this->artisan('loyalty:provision-programme', ['--org' => $a->id, '--apply' => true])->assertExitCode(0);
        $this->assertSame(['Patient', 'Care Plus'], $this->tiers($a));
        $this->assertSame([], $this->tiers($b));
    }

    public function test_it_leaves_no_tenant_bound_behind(): void
    {
        $this->org('medical');
        $this->artisan('loyalty:provision-programme', ['--all' => true, '--apply' => true])->assertExitCode(0);
        $this->assertFalse(app()->bound('current_organization_id'));
    }
}
```

Run: `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Unit/IndustryPrompts/IndustryPromptServiceTest.php tests/Feature/Loyalty/LoyaltyPresetServiceTest.php tests/Feature/Loyalty/ProvisionLoyaltyProgrammeTest.php tests/Feature/Setup/OrganizationSetupServiceTest.php tests/Feature/Member/Portal/PortalBootstrapTest.php --no-ansi`
Expected: FAIL — medical has no loyalty, no `medical` preset, no command.

- [ ] **Step 2: The medical profile**

In `app/Services/IndustryPrompts/IndustryPromptService.php`, in `medical()`, replace `hasLoyalty: false,` with:

```php
            // Every industry has memberships (owner's decision, 2026-09-29,
            // reversing decision #5). The safety guardrails above are about
            // what the assistant may SAY and are untouched by it.
            hasLoyalty: true,
            passLabel: 'Patient Card',
            passDescription: 'Clinic membership card',
```

In `app/Services/IndustryPrompts/IndustryPromptProfile.php` update the docblock of `$hasLoyalty` (`:28`) and the `passLabel` note (`:56`): no industry is without loyalty any more; the flag stays for a future one.

- [ ] **Step 3: The preset**

In `app/Services/LoyaltyPresetService.php`:

(a) `public const NO_PROGRAMME_INDUSTRIES = [];` with the docblock above it replaced by:

```php
    /**
     * Industries that get NO loyalty programme at all. Empty since
     * 2026-09-29: the owner decided every industry has memberships, medical
     * included. The constant stays because OrganizationSetupService reads
     * it, and because an industry added later may need it; whatever is
     * listed here must also be hidden in
     * frontend/src/lib/industryGating.ts, and the other way round.
     */
```

(b) In `apply()` replace the comment above the `if (in_array($key, self::NO_PROGRAMME_INDUSTRIES, true)) {` block with `// An industry with no programme (none today — see NO_PROGRAMME_INDUSTRIES): stamp the picker, write nothing else.` The block itself stays.

(c) In the settings loop of the clean-replace branch, after the `foreach ([ 'points_per_currency' => … ] as …) { … }` loop, add:

```php
                // A preset may start with points for bookings switched off
                // (a clinic: inducements for medical services are regulated
                // in several countries). Only ever written on a clean
                // replace, so a venue's own choice is never overwritten.
                if (array_key_exists('points_on_bookings', $preset)) {
                    HotelSetting::withoutGlobalScopes()->updateOrCreate(
                        ['organization_id' => $organizationId, 'key' => 'points_on_bookings'],
                        ['value' => $preset['points_on_bookings'] ? 'true' : 'false', 'type' => 'boolean', 'group' => 'loyalty', 'label' => 'Points on Bookings'],
                    );
                    $summary['points_on_bookings'] = (bool) $preset['points_on_bookings'];
                }
```

(d) Add to `PRESETS`, after `'fitness'`:

```php
        'medical' => [
            'label'         => 'Clinic — Patient membership',
            'description'   => 'Patient to Care Plus. A membership for regular patients: priority booking and the member prices you choose. Points for bookings start switched off.',
            'icon'          => 'stethoscope',
            'welcome_bonus' => 50,
            'points_per_currency' => 1,
            'points_expiry_months' => 24,
            'referrer_bonus' => 100,
            'referee_bonus' => 50,
            'points_on_bookings' => false,
            // No perk here is written as "NN% off …": such a perk becomes an
            // automatic discount on every booking (typeParseablePerks), and
            // what a clinic discounts is the clinic's decision.
            'tiers' => [
                ['name' => 'Patient',   'min_points' => 0,    'earn_rate' => 1.0, 'color_hex' => '#7dd3fc', 'perks' => ['Online booking', 'Appointment reminders']],
                ['name' => 'Care Plus', 'min_points' => 1000, 'earn_rate' => 1.0, 'color_hex' => '#0284c7', 'perks' => ['Priority appointment slots', 'Annual check-up reminder']],
            ],
            'rewards' => [
                ['name' => 'Priority Appointment',  'points_cost' => 300,  'category' => 'service', 'description' => 'The next available slot, held for you.'],
                ['name' => 'Extended Consultation', 'points_cost' => 1200, 'category' => 'service', 'description' => 'Extra time with your practitioner at your next visit.'],
            ],
            'benefits' => [
                ['name' => 'Priority Booking',      'code' => 'priority_booking',      'description' => 'Priority access to appointments',        'category' => 'service'],
                ['name' => 'Appointment Reminders', 'code' => 'appointment_reminders', 'description' => 'Reminders before every appointment',     'category' => 'service'],
                ['name' => 'Check-up Reminder',     'code' => 'checkup_reminder',      'description' => 'A yearly reminder to book your check-up', 'category' => 'service'],
            ],
        ],
```

(e) Correct the stale comment in `apply()`'s docblock area that said legal and real estate have no programme (it is the one replaced in (b)), and the class docblock's "Six starter membership programs" line above `PRESETS` to "Starter membership programmes, one or more per industry."

- [ ] **Step 4: The comments and the acknowledge text that said medical has none**

- `app/Services/OrganizationSetupService.php`: in the comment at `:296-302` replace "Medical orgs skip loyalty entirely (decision #5)." with "Every industry runs a programme (owner's decision, 2026-09-29)."; in the comment at `:375-383` replace "Medical stays excluded (no patient loyalty)." with "No industry is excluded today."
- `app/Http/Controllers/Api/V1/Auth/AuthController.php`: replace the ternary at `:661-663` with its second branch alone —

```php
                    'Loyalty tiers + benefits will be added by name (existing tiers + benefits preserved); welcome bonus reseeded ONLY for orgs without members',
```

  and remove the two comment lines above it that describe the medical short-circuit; in the comments at `:680-686` and `:1182-1190` replace the medical lines with "medical → its own `medical` preset" and the legal/real_estate/education line with "legal → professional_services; real_estate, education → their own presets". The `loyalty_noop` audit fields stay (they are false for every industry now).
- `app/Services/Portal/PortalBootstrap.php`: in `loyaltyOn()`'s docblock replace "(medical, for one, does not)" with "(every industry does today)".

- [ ] **Step 5: The command**

Create `app/Console/Commands/ProvisionLoyaltyProgramme.php`:

```php
<?php

namespace App\Console\Commands;

use App\Models\LoyaltyTier;
use App\Models\Organization;
use App\Services\LoyaltyPresetService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

/**
 * Gives a venue that has no membership programme the starter programme of
 * its industry. For venues created while their industry had none (medical,
 * before 2026-09-29) and for any venue whose tiers were never set up.
 *
 * It touches only venues without a single active tier, applies the same
 * preset a new signup of that industry gets, enrols nobody and emails
 * nobody. It reports unless told to --apply, and wants to be told which
 * venues: --org=N or --all.
 */
class ProvisionLoyaltyProgramme extends Command
{
    protected $signature = 'loyalty:provision-programme
                            {--org= : One organization id}
                            {--all : Every organization without an active tier}
                            {--apply : Write; without it the command only reports}';

    protected $description = 'Give venues that have no membership programme the starter programme of their industry.';

    public function handle(LoyaltyPresetService $presets): int
    {
        if (!$this->option('org') && !$this->option('all')) {
            $this->error('Name the venues: --org=<id> or --all.');
            return self::FAILURE;
        }
        $apply = (bool) $this->option('apply');
        $prior = app()->bound('current_organization_id') ? app('current_organization_id') : null;
        $done = 0;

        try {
            $orgs = Organization::withoutGlobalScopes()
                ->when($this->option('org'), fn ($q) => $q->whereKey((int) $this->option('org')))
                ->orderBy('id')
                ->get();

            foreach ($orgs as $org) {
                $hasTier = LoyaltyTier::withoutGlobalScopes()->where('organization_id', $org->id)->where('is_active', true)->exists();
                if ($hasTier) {
                    continue;
                }
                $industry = (string) $org->resolved_industry;

                if (!$apply) {
                    $this->line("would give org {$org->id} ({$org->name}) the '{$industry}' programme");
                    $done++;
                    continue;
                }

                // The preset's settings and picker stamp are written for the bound tenant.
                app()->instance('current_organization_id', (int) $org->id);
                try {
                    $summary = $presets->apply($industry, (int) $org->id);
                    $this->line("org {$org->id} ({$org->name}): '{$industry}' — {$summary['tiers_added']} tier(s), {$summary['benefits_added']} benefit(s), {$summary['rewards_added']} reward(s)");
                    $done++;
                } catch (\Throwable $e) {
                    // One venue failing must not stop the others.
                    Log::error('loyalty:provision-programme failed for a venue', ['org' => $org->id, 'industry' => $industry, 'error' => $e->getMessage()]);
                    $this->warn("org {$org->id}: {$e->getMessage()}");
                }
            }
        } finally {
            if ($prior !== null) {
                app()->instance('current_organization_id', $prior);
            } else {
                app()->forgetInstance('current_organization_id');
            }
        }

        $this->info($apply ? "{$done} venue(s) given a programme." : "{$done} venue(s) would be given a programme. Run with --apply to write.");

        return self::SUCCESS;
    }
}
```

- [ ] **Step 6: Run the backend tests**

Run the command of Step 1, then `/c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Loyalty/ --no-ansi`, `… tests/Feature/Setup/ --no-ansi`, `… tests/Feature/Member/ --no-ansi`, `… tests/Feature/Auth/ --no-ansi`, `… tests/Unit/IndustryPrompts/ --no-ansi`, `… tests/Feature/Booking/ --no-ansi`.
Expected: all pass. A test elsewhere that still pins "medical has no loyalty" (the wallet pass, the member chat prompt, a mail) is pinning the reversed decision: change its expectation to the new rule and say so in the report — do not restore the old behaviour to satisfy it. `tests/Concerns/SeedsPointsFixture.php`'s docblock names medical as "the industry that deliberately has none"; correct the sentence.

- [ ] **Step 7: Write the failing frontend tests**

Create `frontend/src/lib/industryGating.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { industryHiddenGroupsFor, industryHiddenItemsFor, industryHiddenSettingsTabsFor } from './industryGating'
import { vocabularyFor } from './vocabulary'
import type { IndustryId } from './industryHosts'

const INDUSTRIES: IndustryId[] = ['hotel', 'beauty', 'medical', 'restaurant', 'legal', 'real_estate', 'education', 'fitness', 'other']

describe('every industry has memberships (owner\'s decision, 2026-09-29)', () => {
  it('no industry hides the Members & Loyalty group', () => {
    for (const industry of INDUSTRIES) {
      expect(industryHiddenGroupsFor(industry), industry).not.toContain('Members & Loyalty')
    }
  })

  it('no industry hides the Loyalty settings', () => {
    for (const industry of INDUSTRIES) {
      expect(industryHiddenSettingsTabsFor(industry), industry).not.toContain('loyalty')
    }
  })

  it('a clinic can scan the card it now issues', () => {
    expect(industryHiddenItemsFor('medical')).not.toContain('Scan')
    expect(industryHiddenItemsFor('medical')).toContain('Deals')
  })
})

describe('Settings → Booking', () => {
  it('is shown for every industry: it holds the service rules, the cancellation hours and online payment', () => {
    for (const industry of INDUSTRIES) {
      expect(industryHiddenSettingsTabsFor(industry), industry).not.toContain('booking')
    }
  })

  it('the Member App tab stays hidden where there is no member app', () => {
    for (const industry of ['medical', 'legal', 'real_estate', 'education'] as IndustryId[]) {
      expect(industryHiddenSettingsTabsFor(industry), industry).toContain('mobile_app')
    }
  })
})

describe('a session that does not know its industry', () => {
  it('hides nothing', () => {
    expect(industryHiddenItemsFor(undefined)).toEqual([])
    expect(industryHiddenSettingsTabsFor(null)).toEqual([])
  })
})

describe('medical vocabulary', () => {
  it('names the programme for patients', () => {
    expect(vocabularyFor('medical')('Loyalty Program')).toBe('Patient Programme')
  })
})
```

In `frontend/src/lib/menuVisibility.test.ts` (Task 20) replace the first test of `industryHiddenGroupsFor` — no industry hides a group any more:

```ts
  it('hides no group for any industry today', () => {
    expect(industryHiddenGroupsFor('medical')).toEqual([])
    expect(industryHiddenGroupsFor('hotel')).toEqual([])
  })
```

(`groupVisibility` and `visibleGroupCount` keep their `'industry'` state and their tests: they are given the hidden list, and an industry added later may hide a group again.)

Run (in `frontend/`): `npx vitest run src/lib/industryGating.test.ts src/lib/menuVisibility.test.ts` — expected: FAIL.

- [ ] **Step 8: The admin**

`frontend/src/lib/industryGating.ts`:

(a) in the header docblock replace the paragraph "**Decision #4 + #5 …**" sentence "Only items that are genuinely irrelevant to a vertical get hidden here." by adding after it: "Decision #5 (no patient loyalty programme) was reversed by the owner on 2026-09-29: every industry has memberships.";

(b) `INDUSTRY_HIDDEN_GROUPS.medical` becomes `[]` with the comment `// Every industry has memberships (owner's decision, 2026-09-29).`;

(c) `INDUSTRY_HIDDEN_ITEMS.medical` becomes `['Deals']` — keep the Deals comment, delete the Scan entry and its comment;

(d) `INDUSTRY_HIDDEN_SETTINGS_TABS`: remove `'booking'` from every industry and `'loyalty'` from medical, so that the map reads

```ts
const INDUSTRY_HIDDEN_SETTINGS_TABS: Record<IndustryId, ReadonlyArray<string>> = {
  hotel: [],
  // Settings → Booking is shown for every industry: it is where a venue
  // sets its service slot step, lead time, cancellation policy and hours,
  // and switches online payment on. (It was hidden for non-hotel venues
  // until dedicated appointment settings shipped; they never did, and the
  // venues were left with no way to reach any of it.)
  beauty: [],
  medical: [
    'mobile_app',  // Member App tab — no patient mobile app
  ],
  restaurant: [],
  legal: ['mobile_app'],
  real_estate: ['mobile_app'],
  education: ['mobile_app'],
  fitness: [],
  other: [],
}
```

(e) add the two pure functions and build the hooks on them, as Task 20 did for groups:

```ts
/** The canonical nav-item defaultLabels hidden for an industry. */
export function industryHiddenItemsFor(industry: IndustryId | null | undefined): ReadonlyArray<string> {
  return (industry ? INDUSTRY_HIDDEN_ITEMS[industry] : []) ?? []
}

/** The Settings tab ids hidden for an industry. */
export function industryHiddenSettingsTabsFor(industry: IndustryId | null | undefined): ReadonlyArray<string> {
  return (industry ? INDUSTRY_HIDDEN_SETTINGS_TABS[industry] : []) ?? []
}
```

```ts
export function useIndustryHiddenItems(): ReadonlyArray<string> {
  const industry = useAuthStore(s => s.user?.industry)
  return useMemo(() => industryHiddenItemsFor(industry), [industry])
}

export function useIndustryHiddenSettingsTabs(): ReadonlyArray<string> {
  const industry = useAuthStore(s => s.user?.industry)
  return useMemo(() => industryHiddenSettingsTabsFor(industry), [industry])
}
```

`frontend/src/lib/vocabulary.ts`, medical map: add `'Loyalty Program':   'Patient Programme',` after `'Hotel Info'`.

`frontend/src/pages/Setup.tsx` line 43: medical's `defaultFeatures` becomes `['bookings', 'loyalty', 'ai_chat', 'crm', 'operations']` (without it the wizard writes "Members & Loyalty" into the venue's own hidden list).

- [ ] **Step 9: Run the frontend checks**

Run: `npx tsc -b && npx vitest run src/lib src/components src/pages/Setup* && npx eslint src/lib src/pages/Setup.tsx`
Expected: clean and green. A Settings or Layout test that pinned a hidden tab or group for an industry is pinning the old rule: change its expectation.

- [ ] **Step 10: Commit**

```bash
git add -A app/Services app/Console/Commands/ProvisionLoyaltyProgramme.php app/Http/Controllers/Api/V1/Auth/AuthController.php frontend/src/lib frontend/src/pages/Setup.tsx tests
git commit -m "Give every industry a membership programme, medical included

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

In Task 22's runbook text, the "Deferred, known" bullets "Memberships for medical venues" and "Portal booking without a membership row" are replaced by one: "**A venue without an active tier** has no membership rows and so no portal booking; `loyalty:provision-programme --org=N --apply` gives it its industry's starter programme. Venues created as medical before 2026-09-29 are in this state unless they were another industry first." And the runbook gains, under Cancellation, the sentence that Settings → Booking is now shown for every industry.

---

## Self-review (done while writing; the executor re-checks after Task 23)

**Spec coverage, §7.**

| Spec | Task | Note |
|---|---|---|
| §7.1 `GET stays` | 5 | |
| §7.1 availability, "including the 2–3-room combinations" | 5 | combinations left out — plan3-1 |
| §7.1 quote, hold payload gains the member and the discount | 6 | payload key `discount`, as the spec names it |
| §7.1 payment intent, "the hold must carry this member's id" | 7 | not extracted into the engine — plan3-5 and the Task 22 spec note |
| §7.1 confirm, member and discount on the mirror, channel, Smoobu gets the discounted price, coupon in the same transaction | 3, 8 | through `StayConfirmHooks` |
| §7.1 combination discount split | — | deferred — plan3-1 |
| §7.1 `POST member/reservations` retired | 21 | the mobile app's source (`hotel-tech/apps/loyalty`) was searched: no caller |
| §7.2 cancel endpoint, the two windows, `outside_policy` | 10, 13 | |
| §7.2 services: refund step, mail, venue notification, points | 11, 13 | |
| §7.2 stays: `applyRefund()`, then cancelled | 12 | plus the two paths `applyRefund()` cannot take (a held card, nothing paid) |
| §7.2 coupon released | 11, 12 | |
| §7.3 schema | 1 | plus `cancelled_at`, `cancellation_reason`, the refund columns, the index |
| §7.4 tests | 2–14 | `PortalStayBookingTest`, `PortalCancellationTest`, `AwardStayPointsTest` |
| §8 `hold_expired` "re-quotes automatically once" | 17 | the bounce to Review re-quotes on mount |
| §8 `payment_mismatch` | 7, 8 | |
| §9 metadata carries org and member, both checked | 7, 8 | |
| §10 phase 3 probes | — | the deploy round's, after the owner's "yes" |

**Carried over from phase 2** (runbook "Deferred, known"): unique index — Task 1; orphaned holds — Task 21; timezone fallback — Task 5; inline lock statements — Task 21; still deferred, with reasons, in Task 22: redirect methods, pay-at-venue fallback, `svc:`/`svcm:`, booking without a membership row.

**The owner's two reports:** the sidebar menu page and the duplicate label — Task 20. The owner's decision that every industry has memberships — Task 24, from the list in `carried-over-and-gating-facts.md` §A6.

**Type consistency.** `StayConfirmHooks::beforeReservation(array)` / `afterMirror(BookingMirror, array)` — Tasks 3, 8. Hold payload keys `member_id`, `list_total`, `discount`, `discount_source`, `discount_source_id`, `discount_label`, `coupon`, `channel_name`, `mirror_id` — Tasks 3, 6, 8. `CancellationOutcome::toArray()` keys `outcome`, `amount`, `currency`, `coupon_released`, `points_reversed` — Tasks 11, 13, 15 (`CancelReply['refund']`), 19. `CancellationPolicy` reasons — Tasks 10, 11. Query keys `['portal-stay-catalogue']`, `['portal-stay-availability', checkIn, checkOut, adults, children]`, `['portal-stay-quote', body]`, `['portal-stay-payment-intent', nonce]` — Tasks 16, 17, 19.

**Placeholders.** None: every code step carries its code, every test its assertions.

## Execution handoff

The owner chose subagent-driven execution for every phase of this project. After the owner has read this plan and said it captures what they want: REQUIRED SUB-SKILL `superpowers:subagent-driven-development`, in worktree `C:\wamp64\www\Hexa-Tech-portal` on `feature/member-portal-v2-phase-3`. Tasks 3, 8, 11, 12 and 14 move money or guard it: review them on the most capable model.
