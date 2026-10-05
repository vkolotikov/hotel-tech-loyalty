# HexaTech Appointments Part E — Money at the desk — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The desk records what a client paid (amount, method, who, when). A manager gives money back, through Stripe
or at the desk, also while cancelling. Staff bookings for members get the portal's member price and coupons. A
manager can count any day's takings. The full admin shows the same money, read-only.

**Architecture:**
- **The ledger.** `service_booking_payments` holds one row per payment or refund.
- **One money service.** `AppointmentMoney` computes the figures, writes the ledger and keeps the booking's existing
  `payment_status` and `refunded_amount` in step, under the booking's row lock (and the `pi:` lock for Stripe). It
  also takes points back on a full refund.
- **Pricing.** `StaffPricing` reuses the portal's `MemberPricing` and `CouponResolver` for the staff booking writer and
  a quote endpoint.
- **Takings.** `TakingsReport` reads one venue day.

**Tech Stack:** Laravel 13 / PHP 8.4, PHPUnit on sqlite with the repo's schema traits, Mockery for `StripeService`;
React 19, TanStack Query 5, i18next (five bundles), Vitest static render.

**Spec:** `docs/superpowers/specs/2026-10-05-appointments-money-at-the-desk-design.md` (approved 2026-10-05, commit
`4053613a1`). Planning ruling R1 below corrects its `owed` formula; the spec is corrected in the same commit as this
plan.

## Global Constraints

- **PHP and test runs.** PHP is `/c/wamp64/bin/php/php8.4.20/php.exe`. Run one test path (or a few named files) per
  `artisan test` call; never a bare `php artisan test`. Helper:
  `bash .superpowers/sdd/2026-09-30-appointments-workspace/tools/t.sh <path> [<path> …]` from the feature worktree
  `C:\wamp64\www\Hexa-Tech-appointments` (branch `feature/appointments-workspace`). It prints the runner's `Tests:` line
  last.
- **Frontend checks.** `bash .superpowers/sdd/2026-09-30-appointments-workspace/tools/fe.sh [vitest paths]`. Files
  changed outside `src/appointments` also get `cd frontend && npx eslint <files>`, compared with the file's findings
  before the change. Known failures: the 3 `plannerMeta` tests and the `bookingSheet.test.tsx` clock test.
- **Migration.** One, additive: `service_booking_payments`. Local PostgreSQL is shared: never run `artisan migrate`
  locally. Tests build the table in sqlite (`SetsUpAppointmentsSchema`).
- **Untouched:** the widget, the portal, `CapturePendingPaymentIntents`, `ServiceBookingRefund`, `MemberCancellation`,
  `BookingRefundService` and the stays' `BookingAdminController`.
- **`payment_status`.** Only today's values (`unpaid`, `paid`, `partially_refunded`, `refunded`); never written while a
  card is held online (`authorized`/`pending`).
- **Money.** Amounts are rounded to 2 decimals; comparisons allow 0.004.
- **Times.** The venue's wall clock for appointment times (`VenueClock`), real instants for ledger `created_at`.
- **Workspace rules.** `frontend/src/appointments/` uses only `a-*` colour tokens and only `/v1/admin/appointments/…`
  API paths. Every visible string is `t('…', 'English fallback')` and exists in all five bundles.
- **Commits.** Never commit `frontend/dist`, `public/spa` or `resources/spa-shell` on the feature branch. Stage files
  by name. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. No push, no deploy.

## Review Focus

1. **A double click on "Record payment".** Two requests with the same revision: the second meets the row lock, sees
   the new revision and is refused 409 `stale`. One ledger row only. (Task 2 tests it.)
2. **A Stripe refund that fails.** No ledger row stays, `refunded_amount` is unchanged, and the appointment (in
   cancel-with-refund) stays not cancelled. (Tasks 3 and 4 test it.)
3. **A partial desk refund, then more owed?** A refund never makes money owed again (R1): €45 paid in cash, €10 given
   back, then owed is 0 and the status is `partially_refunded`. (Task 1 tests it.)
4. **A coupon changed between quote and save.** The save is refused 409 `price_changed` with the new quote, and
   nothing is used. A retried save with the same key uses the coupon once. (Task 5 tests it.)
5. **Takings across midnight in Riga.** A cash payment at 23:30 Riga time on the 5th counts on the 5th, not the 6th
   (UTC). (Task 6 tests it.)

## Planning rulings (deviations from the spec, found while writing the code)

- **R1.** `owed` = max(0, total − held_online − paid_online − paid_desk). Desk refunds are not subtracted, so a
  refund never makes money owed again. That is consistent with online refunds, which never re-open what is owed. The
  spec's §4 formula subtracted desk refunds; it is corrected in this commit. Cost if wrong: a refund made to correct a
  wrong desk entry does not re-open the difference; staff record the right payment again instead.
- **R2.** "Older bookings marked paid" (`legacy_marked_paid`) is exact: no real card, no ledger payment rows, and the
  status is `paid`, or the status is `partially_refunded`/`refunded` with desk refunds on the ledger. So a legacy
  booking refunded at the desk stays recognised. Cost if wrong: none.
- **R3.** "Take payment" and "Refund" are not entries in the server's action list (the list keeps status changes).
  The detail's `money.can_take` and the bootstrap's `staff.can_manage` drive the two buttons. "Mark paid at venue" is
  removed from the action list, the runner and the panel; its strings stay in the bundles (the locale families still
  list them). Cost if wrong: none.
- **R4.** In cancel-with-refund, each refund's reason is the cancellation reason, or "Appointment cancelled" when none
  is given. Cost if wrong: none.
- **R5.** The Stripe refund call happens inside the database transaction (after the ledger row is inserted). A Stripe
  success followed by a later database failure in the same transaction would leave Stripe refunded with no row. The
  existing `charge.refunded` webhook then still writes `refunded_amount`. Cost if wrong: a rare row missing from the
  ledger; the booking's `refunded_amount` stays right.
- **R6.** The coupon list shows a label only (offer title, reward name). A typed code answers with
  `CouponResolver::resolveCode()`'s own summary, which carries `value_label`. Cost if wrong: the list shows "Summer
  10%" without a separate "10%" column.
- **R7.** Coupon and Stripe errors keep the server's English sentence (the workspace shows a fallback when a code has
  no translation). The new money codes (`amount_too_large`, `refund_too_large`, `refund_unavailable`,
  `reason_required`, `note_required`, `invalid_amount`, `price_changed`) are translated. Cost if wrong: a Stripe
  failure reason shows in English.

## File map

| File | Change |
|---|---|
| `database/migrations/2026_10_06_100000_create_service_booking_payments.php` | new |
| `app/Models/ServiceBookingPayment.php` | new |
| `app/Services/Appointments/Money/AppointmentMoney.php` | new: figures, take payment, refunds |
| `app/Services/Appointments/Money/StaffPricing.php` | new: member price for staff bookings |
| `app/Services/Appointments/Money/TakingsReport.php` | new |
| `app/Services/Loyalty/BookingPointsService.php` | `reverseForServiceBooking()` |
| `app/Services/Appointments/AppointmentActions.php`, `AppointmentActionRunner.php` | mark-paid removed; cancel with refunds |
| `app/Services/Appointments/AppointmentPresenter.php` | detail `money` |
| `app/Services/Appointments/StaffBookingWriter.php` | member price, coupon, `expected_total` |
| `app/Http/Controllers/Api/V1/Admin/Appointments/MoneyController.php` | new: payments, refunds, takings |
| `app/Http/Controllers/Api/V1/Admin/Appointments/PriceController.php` | new: quote, coupons, resolve |
| `app/Http/Controllers/Api/V1/Admin/Appointments/BookingController.php`, `BootstrapController.php` | create body, cancel refunds; `staff.can_manage` |
| `app/Http/Controllers/Api/V1/Admin/ServiceBookingController.php` | `money` on show; the label and `mark_paid` refused |
| `routes/api.php` | the workspace's new routes |
| `tests/Concerns/SetsUpAppointmentsSchema.php` | the ledger table |
| `tests/Feature/Appointments/Money/*.php` | new tests |
| existing tests named in Tasks 2 and 7 | mark-paid and the payment label |
| `frontend/src/appointments/lib/types.ts`, `lib/api.ts` | types and calls |
| `frontend/src/appointments/panel/MoneyBlock.tsx`, `TakePaymentForm.tsx`, `RefundForm.tsx`, `moneyLines.ts` | new |
| `frontend/src/appointments/panel/AppointmentPanel.tsx`, `AppointmentView.tsx`, `ActionConfirm.tsx`, `CreateForm.tsx`, `panelState.ts`, `consequences.ts` | wiring |
| `frontend/src/appointments/takings/TakingsPage.tsx` | new |
| `frontend/src/appointments/AppointmentsApp.tsx`, `AppointmentsShell.tsx` | route and menu |
| five `appointments.<lang>.json`, `appointmentsLocales.test.ts` | strings |
| `frontend/src/components/DeskMoney.tsx`, `frontend/src/pages/ServiceBookings.tsx`, five `common.json` | full admin |
| `docs/appointments-workspace.md` | runbook |

## Before you start

- [ ] Run `../subagent-driven-development/scripts/sdd-workspace docs/superpowers/plans/2026-10-06-appointments-money-at-the-desk.md`
  and use the directory it prints as `<ws>`. Create `<ws>/tools/`. Copy
  `.superpowers/sdd/archive/2026-10-05-appointments-client-messages/tools/suite-by-dir.sh` to `<ws>/tools/` and change
  its `ws=` line to `<ws>`.
- [ ] Baseline: run `bash <ws>/tools/suite-by-dir.sh baseline` in the background before editing any PHP file. While
  it runs, only frontend files may change.

---

### Task 1: The ledger and the figures

**Files:**
- Create:
  - `database/migrations/2026_10_06_100000_create_service_booking_payments.php`
  - `app/Models/ServiceBookingPayment.php`
  - `app/Services/Appointments/Money/AppointmentMoney.php` (figures and status only, in this task)
- Modify: `tests/Concerns/SetsUpAppointmentsSchema.php` (the ledger table)
- Test: `tests/Feature/Appointments/Money/MoneySummaryTest.php`

**Interfaces:**
- Produces:
  - `ServiceBookingPayment` (BelongsToOrganization):
    - `KINDS = ['payment','refund']`, `DESK_METHODS = ['cash','card_desk','transfer','other']`;
    - relations `booking()` and `actor()`;
    - `toApi(): array{id:int, kind:string, method:string, amount:float, currency:string, note:?string, by:?string, at:?string}`.
  - `AppointmentMoney::summary(ServiceBooking $b): array`, with the keys `total, currency, held_online,
    paid_online, refunded_online, paid_desk, refunded_desk, legacy_marked_paid, owed, to_refund, refundable_online,
    refundable_desk, paid_in, paid_back, can_take, movements`.
  - `AppointmentMoney::statusFor(array $summary): ?string` (null = leave `payment_status` alone).
  - `AppointmentMoney::TAKE_FROM = ['pending','confirmed','in_progress','completed']`.

- [ ] **Step 1: The fixture table.** In `tests/Concerns/SetsUpAppointmentsSchema.php`, after the `email_suppressions`
  block, add:

```php
        // Part E's money ledger, as the 2026_10_06 migration builds it.
        if (!Schema::hasTable('service_booking_payments')) {
            Schema::create('service_booking_payments', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('service_booking_id');
                $t->string('kind', 8);
                $t->string('method', 16);
                $t->decimal('amount', 10, 2);
                $t->string('currency', 3);
                $t->string('note', 200)->nullable();
                $t->string('stripe_refund_id', 64)->nullable();
                $t->unsignedBigInteger('actor_user_id')->nullable();
                $t->timestamps();
            });
        }
```

- [ ] **Step 2: Write the failing test** `tests/Feature/Appointments/Money/MoneySummaryTest.php`:

```php
<?php

namespace Tests\Feature\Appointments\Money;

use App\Models\ServiceBookingPayment;
use App\Services\Appointments\Money\AppointmentMoney;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class MoneySummaryTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    private function row($booking, string $kind, string $method, float $amount): void
    {
        ServiceBookingPayment::create([
            'service_booking_id' => $booking->id, 'kind' => $kind, 'method' => $method, 'amount' => $amount,
            'currency' => 'EUR', 'note' => $kind === 'refund' ? 'Goodwill' : null, 'actor_user_id' => $this->staff->id,
        ]);
    }

    private function figures($booking): array
    {
        return AppointmentMoney::summary($booking->fresh());
    }

    public function test_an_unpaid_appointment_owes_its_total(): void
    {
        $s = $this->figures($this->seedBooking());

        $this->assertSame([60.0, 0.0, 0.0, 60.0, true, false], [$s['total'], $s['paid_desk'], $s['paid_in'], $s['owed'], $s['can_take'], $s['legacy_marked_paid']]);
        $this->assertSame('unpaid', AppointmentMoney::statusFor($s));
    }

    public function test_a_part_payment_leaves_the_rest_owed_and_the_label_unpaid(): void
    {
        $b = $this->seedBooking();
        $this->row($b, 'payment', 'cash', 20);

        $s = $this->figures($b);
        $this->assertSame([20.0, 40.0], [$s['paid_desk'], $s['owed']]);
        $this->assertSame('unpaid', AppointmentMoney::statusFor($s));

        $this->row($b, 'payment', 'card_desk', 40);
        $s = $this->figures($b);
        $this->assertSame([0.0, false], [$s['owed'], $s['can_take']]);
        $this->assertSame('paid', AppointmentMoney::statusFor($s));
        $this->assertSame(['card_desk', 'cash'], array_column($s['movements'], 'method')); // newest first
    }

    public function test_a_refund_never_makes_money_owed_again(): void
    {
        $b = $this->seedBooking();
        $this->row($b, 'payment', 'cash', 60);
        $this->row($b, 'refund', 'cash', 10);

        $s = $this->figures($b);
        $this->assertSame([0.0, 50.0, 0.0], [$s['owed'], $s['refundable_desk'], $s['refundable_online']]);
        $this->assertSame('partially_refunded', AppointmentMoney::statusFor($s));

        $this->row($b, 'refund', 'cash', 50);
        $this->assertSame('refunded', AppointmentMoney::statusFor($this->figures($b)));
    }

    public function test_a_card_held_online_covers_the_total_and_the_label_is_left_to_the_capture_job(): void
    {
        $s = $this->figures($this->seedBooking(['payment_status' => 'authorized', 'stripe_payment_intent_id' => 'pi_held1']));

        $this->assertSame([60.0, 0.0, false], [$s['held_online'], $s['owed'], $s['can_take']]);
        $this->assertNull(AppointmentMoney::statusFor($s));
    }

    public function test_a_card_paid_online_is_refundable_through_stripe_and_follows_refunded_amount(): void
    {
        $b = $this->seedBooking(['payment_status' => 'partially_refunded', 'stripe_payment_intent_id' => 'pi_paid1', 'refunded_amount' => 15]);

        $s = $this->figures($b);
        $this->assertSame([60.0, 15.0, 45.0, 0.0, 0.0], [$s['paid_online'], $s['refunded_online'], $s['refundable_online'], $s['refundable_desk'], $s['owed']]);
        $this->assertSame('partially_refunded', AppointmentMoney::statusFor($s));
    }

    public function test_a_demo_payment_is_not_a_card_payment(): void
    {
        $s = $this->figures($this->seedBooking(['payment_status' => 'paid', 'stripe_payment_intent_id' => 'pi_mock_1']));

        $this->assertSame([0.0, 0.0], [$s['paid_online'], $s['refundable_online']]);
    }

    public function test_a_booking_marked_paid_before_part_e_owes_nothing_and_can_be_refunded_at_the_desk(): void
    {
        $b = $this->seedBooking(['payment_status' => 'paid']);

        $s = $this->figures($b);
        $this->assertSame([true, 0.0, 60.0, false], [$s['legacy_marked_paid'], $s['owed'], $s['refundable_desk'], $s['can_take']]);

        $this->row($b, 'refund', 'cash', 60);
        $b->update(['payment_status' => 'refunded']);
        $s = $this->figures($b);
        $this->assertTrue($s['legacy_marked_paid']); // still recognised after its refund (R2)
        $this->assertSame(['refunded', 0.0], [AppointmentMoney::statusFor($s), $s['refundable_desk']]);
    }

    public function test_a_cancelled_appointment_owes_nothing_and_shows_what_is_left_to_refund(): void
    {
        $b = $this->seedBooking();
        $this->row($b, 'payment', 'cash', 30);
        $b->update(['status' => 'cancelled']);

        $s = $this->figures($b);
        $this->assertSame([0.0, 30.0, false], [$s['owed'], $s['to_refund'], $s['can_take']]);
    }

    public function test_the_migration_builds_the_table(): void
    {
        \Illuminate\Support\Facades\Schema::drop('service_booking_payments');
        (require base_path('database/migrations/2026_10_06_100000_create_service_booking_payments.php'))->up();

        $this->assertSame(
            ['id', 'organization_id', 'service_booking_id', 'kind', 'method', 'amount', 'currency', 'note', 'stripe_refund_id', 'actor_user_id', 'created_at', 'updated_at'],
            \Illuminate\Support\Facades\Schema::getColumnListing('service_booking_payments'),
        );
    }

    public function test_a_movement_says_who_and_when(): void
    {
        $b = $this->seedBooking();
        $this->row($b, 'payment', 'cash', 20);

        $m = $this->figures($b)['movements'][0];
        $this->assertSame(['payment', 'cash', 20.0, 'EUR', null, $this->staff->name], [$m['kind'], $m['method'], $m['amount'], $m['currency'], $m['note'], $m['by']]);
        $this->assertNotNull($m['at']);
    }
}
```

- [ ] **Step 3: Run it.**
  - Run: `bash .superpowers/sdd/2026-09-30-appointments-workspace/tools/t.sh tests/Feature/Appointments/Money/MoneySummaryTest.php`
  - Expected: FAIL — `Class "App\Models\ServiceBookingPayment" not found`.

- [ ] **Step 4: Write the migration** `database/migrations/2026_10_06_100000_create_service_booking_payments.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Money at the desk (Part E): one row per payment taken or refund given for
 * a service booking — cash, card at the desk, transfer, other, or a refund
 * through Stripe of the online card payment. Rows are never edited or
 * deleted; a correction is a refund. Additive and reversible.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('service_booking_payments')) {
            return;
        }

        Schema::create('service_booking_payments', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('service_booking_id');
            $table->string('kind', 8);
            $table->string('method', 16);
            $table->decimal('amount', 10, 2);
            $table->string('currency', 3);
            $table->string('note', 200)->nullable();
            $table->string('stripe_refund_id', 64)->nullable();
            $table->unsignedBigInteger('actor_user_id')->nullable();
            $table->timestamps();
            $table->index('service_booking_id');
            $table->index(['organization_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('service_booking_payments');
    }
};
```

- [ ] **Step 5: Write the model** `app/Models/ServiceBookingPayment.php`:

```php
<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One payment taken or refund given for a service booking (Part E). Never edited or deleted. */
class ServiceBookingPayment extends Model
{
    use BelongsToOrganization;

    public const KINDS = ['payment', 'refund'];

    public const DESK_METHODS = ['cash', 'card_desk', 'transfer', 'other'];

    protected $fillable = [
        'organization_id', 'service_booking_id', 'kind', 'method', 'amount', 'currency', 'note', 'stripe_refund_id', 'actor_user_id',
    ];

    protected $casts = ['amount' => 'float'];

    public function booking(): BelongsTo
    {
        return $this->belongsTo(ServiceBooking::class, 'service_booking_id');
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_user_id');
    }

    /** What the screens show. `at` is a real instant (UTC). */
    public function toApi(): array
    {
        return [
            'id'       => (int) $this->id,
            'kind'     => (string) $this->kind,
            'method'   => (string) $this->method,
            'amount'   => round((float) $this->amount, 2),
            'currency' => (string) $this->currency,
            'note'     => $this->note,
            'by'       => $this->actor?->name,
            'at'       => $this->created_at?->toIso8601String(),
        ];
    }
}
```

- [ ] **Step 6: Write the service (figures only)** `app/Services/Appointments/Money/AppointmentMoney.php`:

```php
<?php

namespace App\Services\Appointments\Money;

use App\Models\ServiceBooking;
use App\Models\ServiceBookingPayment;
use App\Services\Appointments\AppointmentActions;
use Illuminate\Support\Collection;

/**
 * The money of an appointment (Part E spec §4–§5): what it costs, what was
 * paid online and at the desk, what went back and what is still owed. The
 * one writer of the desk ledger (service_booking_payments) and of the
 * booking's payment label while no card is held online.
 */
final class AppointmentMoney
{
    /** Statuses a payment can be taken in. */
    public const TAKE_FROM = ['pending', 'confirmed', 'in_progress', 'completed'];

    /** @return array<string, mixed> */
    public static function summary(ServiceBooking $b): array
    {
        $rows = ServiceBookingPayment::withoutGlobalScopes()->with('actor')
            ->where('service_booking_id', $b->id)->orderByDesc('id')->get();

        return self::figures($b, $rows);
    }

    /** The label after a movement; null while a card is held online (the capture job owns that label). */
    public static function statusFor(array $s): ?string
    {
        return match (true) {
            $s['held_online'] > 0                   => null,
            $s['paid_in'] <= 0                      => 'unpaid',
            $s['paid_back'] >= $s['paid_in'] - 0.004 => 'refunded',
            $s['paid_back'] > 0                     => 'partially_refunded',
            $s['owed'] > 0                          => 'unpaid',
            default                                 => 'paid',
        };
    }

    /** @param Collection<int, ServiceBookingPayment> $rows */
    private static function figures(ServiceBooking $b, Collection $rows): array
    {
        $total = round((float) $b->total_amount, 2);
        $card = AppointmentActions::carriesCardPayment($b);
        $label = (string) $b->payment_status;
        $payments = $rows->where('kind', 'payment');
        $deskRefunds = $rows->where('kind', 'refund')->where('method', '!=', 'online_card');

        $held = $card && in_array($label, ['authorized', 'pending'], true) ? $total : 0.0;
        $paidOnline = $card && in_array($label, ['paid', 'partially_refunded', 'refunded'], true) ? $total : 0.0;
        $refundedOnline = $card ? round((float) ($b->refunded_amount ?? 0), 2) : 0.0;
        $paidDesk = round((float) $payments->sum('amount'), 2);
        $refundedDesk = round((float) $deskRefunds->sum('amount'), 2);
        // Marked paid before Part E (R2): a label with no money recorded behind it.
        $legacy = !$card && $payments->isEmpty()
            && ($label === 'paid' || (in_array($label, ['partially_refunded', 'refunded'], true) && $deskRefunds->isNotEmpty()));
        $legacyPaid = $legacy ? $total : 0.0;

        $closed = in_array((string) $b->status, ['cancelled', 'no_show'], true);
        // A refund never makes money owed again (R1).
        $owed = ($closed || $legacy) ? 0.0 : max(0.0, round($total - $held - $paidOnline - $paidDesk, 2));
        $paidIn = round($paidOnline + $paidDesk + $legacyPaid, 2);
        $paidBack = round($refundedOnline + $refundedDesk, 2);

        return [
            'total'              => $total,
            'currency'           => strtoupper((string) ($b->currency ?: 'EUR')),
            'held_online'        => $held,
            'paid_online'        => $paidOnline,
            'refunded_online'    => $refundedOnline,
            'paid_desk'          => $paidDesk,
            'refunded_desk'      => $refundedDesk,
            'legacy_marked_paid' => $legacy,
            'owed'               => $owed,
            'to_refund'          => $closed ? max(0.0, round($paidIn - $paidBack, 2)) : 0.0,
            'refundable_online'  => $paidOnline > 0 ? max(0.0, round($paidOnline - $refundedOnline, 2)) : 0.0,
            'refundable_desk'    => max(0.0, round($paidDesk + $legacyPaid - $refundedDesk, 2)),
            'paid_in'            => $paidIn,
            'paid_back'          => $paidBack,
            'can_take'           => $owed > 0 && in_array((string) $b->status, self::TAKE_FROM, true),
            'movements'          => $rows->map(fn (ServiceBookingPayment $r) => $r->toApi())->values()->all(),
        ];
    }
}
```

- [ ] **Step 7: Run it.**
  - Run: same command as Step 3.
  - Expected: PASS (10 tests).

- [ ] **Step 8: Commit** with the subject "Keep a ledger of desk payments and refunds, and work out what is owed":

```bash
git add database/migrations/2026_10_06_100000_create_service_booking_payments.php app/Models/ServiceBookingPayment.php app/Services/Appointments/Money/AppointmentMoney.php tests/Concerns/SetsUpAppointmentsSchema.php tests/Feature/Appointments/Money/MoneySummaryTest.php
git commit -F <ws>/tools/commit-1.txt
```

---

### Task 2: Take payment

**Files:**
- Modify:
  - `app/Services/Appointments/Money/AppointmentMoney.php` (constructor, `takePayment`, `settle`)
  - `app/Services/Appointments/AppointmentActions.php`, `AppointmentActionRunner.php` (mark-paid removed, R3)
  - `app/Services/Appointments/AppointmentPresenter.php` (`money`)
  - `app/Http/Controllers/Api/V1/Admin/Appointments/BootstrapController.php` (`staff.can_manage`)
  - `routes/api.php`
  - `tests/Feature/Appointments/AppointmentActionsTest.php`, `AppointmentActionEndpointTest.php` (mark-paid removed)
- Create: `app/Http/Controllers/Api/V1/Admin/Appointments/MoneyController.php` (`payments` only in this task)
- Test: `tests/Feature/Appointments/Money/TakePaymentTest.php`

**Interfaces:**
- Consumes: `AppointmentMoney::summary`, `statusFor`, `TAKE_FROM` (Task 1)
- Produces:
  - `AppointmentMoney::__construct(StripeService $stripe, BookingPointsService $points)`;
  - `takePayment(int $id, float $amount, string $method, ?string $note, string $revision, User $actor): ServiceBooking`;
  - private `settle(ServiceBooking $b, User $actor, string $action, array $new, string $summary): void`;
  - `POST admin/appointments/bookings/{id}/payments {amount, method, note?, revision}` → `{booking}`;
  - detail `money`; bootstrap `staff.can_manage`.

- [ ] **Step 1: Write the failing test** `tests/Feature/Appointments/Money/TakePaymentTest.php`:

```php
<?php

namespace Tests\Feature\Appointments\Money;

use App\Models\AuditLog;
use App\Models\ServiceBookingPayment;
use App\Services\Appointments\AppointmentPresenter;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class TakePaymentTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    private function pay($booking, array $body, $as = null): \Illuminate\Testing\TestResponse
    {
        return ($as ? $this->actingAs($as, 'sanctum') : $this->asStaff())
            ->postJson($this->api("bookings/{$booking->id}/payments"), $body + ['revision' => AppointmentPresenter::revision($booking->fresh())]);
    }

    public function test_any_staff_member_records_a_payment_and_the_appointment_says_what_is_left(): void
    {
        $b = $this->seedBooking();
        $staff = $this->staffUser($this->org, ['role' => 'staff']);

        $this->pay($b, ['amount' => 20, 'method' => 'cash'], $staff)->assertOk()
            ->assertJsonPath('booking.money.paid_desk', 20)
            ->assertJsonPath('booking.money.owed', 40)
            ->assertJsonPath('booking.money.movements.0.method', 'cash')
            ->assertJsonPath('booking.money.movements.0.by', $staff->name)
            ->assertJsonPath('booking.payment.raw', 'unpaid');

        $this->pay($b, ['amount' => 40, 'method' => 'card_desk'])->assertOk()
            ->assertJsonPath('booking.money.owed', 0)
            ->assertJsonPath('booking.money.can_take', false)
            ->assertJsonPath('booking.payment.raw', 'paid');

        $this->assertSame(2, AuditLog::where('action', 'service_booking.payment_taken')->count());
    }

    public function test_no_more_than_is_owed_and_no_payment_while_a_card_is_held(): void
    {
        $b = $this->seedBooking();
        $this->pay($b, ['amount' => 61, 'method' => 'cash'])->assertStatus(422)
            ->assertJsonPath('error', 'amount_too_large')->assertJsonPath('max', 60);

        $held = $this->seedBooking(['payment_status' => 'authorized', 'stripe_payment_intent_id' => 'pi_held2', 'start_at' => '2026-10-06 12:00:00', 'end_at' => '2026-10-06 12:45:00']);
        $this->pay($held, ['amount' => 10, 'method' => 'cash'])->assertStatus(422)->assertJsonPath('error', 'not_allowed');
    }

    public function test_other_needs_a_note_and_the_method_and_amount_are_checked(): void
    {
        $b = $this->seedBooking();
        $this->pay($b, ['amount' => 10, 'method' => 'other'])->assertStatus(422)->assertJsonPath('error', 'note_required');
        $this->pay($b, ['amount' => 10, 'method' => 'bitcoin'])->assertStatus(422);
        $this->pay($b, ['amount' => 0, 'method' => 'cash'])->assertStatus(422);
        $this->pay($b, ['amount' => 10, 'method' => 'other', 'note' => 'Gift voucher 1234'])->assertOk()
            ->assertJsonPath('booking.money.movements.0.note', 'Gift voucher 1234');
    }

    public function test_a_double_click_records_once(): void
    {
        $b = $this->seedBooking();
        $revision = AppointmentPresenter::revision($b->fresh());

        $this->asStaff()->postJson($this->api("bookings/{$b->id}/payments"), ['amount' => 20, 'method' => 'cash', 'revision' => $revision])->assertOk();
        $this->travel(1)->seconds();
        $this->asStaff()->postJson($this->api("bookings/{$b->id}/payments"), ['amount' => 20, 'method' => 'cash', 'revision' => $revision])
            ->assertStatus(409)->assertJsonPath('error', 'stale');

        $this->assertSame(1, ServiceBookingPayment::count());
    }

    public function test_cancelled_or_no_show_appointments_take_nothing(): void
    {
        foreach (['cancelled', 'no_show'] as $i => $status) {
            $b = $this->seedBooking(['status' => $status, 'start_at' => sprintf('2026-10-06 %02d:00:00', 11 + $i), 'end_at' => sprintf('2026-10-06 %02d:45:00', 11 + $i)]);
            $this->pay($b, ['amount' => 10, 'method' => 'cash'])->assertStatus(422)->assertJsonPath('error', 'not_allowed');
        }
    }

    public function test_mark_paid_at_venue_is_gone_and_the_bootstrap_says_who_may_manage(): void
    {
        $b = $this->seedBooking();
        $actions = collect($this->asStaff()->getJson($this->api("bookings/{$b->id}"))->json('booking.actions'))->pluck('key')->all();
        $this->assertNotContains('mark_paid_at_venue', $actions);
        $this->asStaff()->postJson($this->api("bookings/{$b->id}/actions"), ['action' => 'mark_paid_at_venue', 'revision' => AppointmentPresenter::revision($b->fresh())])
            ->assertStatus(422)->assertJsonPath('error', 'not_allowed');

        $this->asStaff()->getJson($this->api('bootstrap'))->assertJsonPath('staff.can_manage', true);
        $this->actingAs($this->staffUser($this->org, ['role' => 'staff']), 'sanctum')->getJson($this->api('bootstrap'))->assertJsonPath('staff.can_manage', false);
    }
}
```

- [ ] **Step 2: Run it.**
  - Run: `bash .superpowers/sdd/2026-09-30-appointments-workspace/tools/t.sh tests/Feature/Appointments/Money/TakePaymentTest.php`
  - Expected: FAIL — 404 on `…/payments` (no route) and `staff.can_manage` missing.

- [ ] **Step 3: The service.** In `AppointmentMoney`, add the imports
  `use App\Models\AuditLog; use App\Models\User; use App\Services\Appointments\AppointmentRefused; use App\Services\Appointments\StaleAppointment; use App\Services\Loyalty\BookingPointsService; use App\Services\StripeService; use Illuminate\Support\Facades\DB;`,
  then add after the constants:

```php
    public function __construct(private readonly StripeService $stripe, private readonly BookingPointsService $points)
    {
    }

    /** Any staff member: money taken at the desk, up to what is owed. */
    public function takePayment(int $id, float $amount, string $method, ?string $note, string $revision, User $actor): ServiceBooking
    {
        $amount = round($amount, 2);
        $note = $note !== null && trim($note) !== '' ? mb_substr(trim($note), 0, 200) : null;
        if (!in_array($method, ServiceBookingPayment::DESK_METHODS, true)) {
            throw new AppointmentRefused('invalid_method', 'Choose how the client paid.', 422);
        }
        if ($method === 'other' && $note === null) {
            throw new AppointmentRefused('note_required', 'Say how the client paid.', 422);
        }
        if ($amount <= 0) {
            throw new AppointmentRefused('invalid_amount', 'Enter an amount above zero.', 422);
        }

        return DB::transaction(function () use ($id, $amount, $method, $note, $revision, $actor) {
            $b = ServiceBooking::lockForUpdate()->find($id)
                ?? throw new AppointmentRefused('not_found', 'This appointment no longer exists.', 404);
            StaleAppointment::unless($b, $revision);

            $s = self::summary($b);
            if (!$s['can_take']) {
                throw new AppointmentRefused('not_allowed', 'Nothing can be taken for this appointment.', 422);
            }
            if ($amount > $s['owed'] + 0.004) {
                throw new AppointmentRefused('amount_too_large', "At most {$s['owed']} {$s['currency']} is owed.", 422, ['max' => $s['owed']]);
            }

            ServiceBookingPayment::create([
                'service_booking_id' => $b->id, 'kind' => 'payment', 'method' => $method, 'amount' => $amount,
                'currency' => $s['currency'], 'note' => $note, 'actor_user_id' => $actor->id,
            ]);
            $this->settle($b, $actor, 'service_booking.payment_taken', ['amount' => $amount, 'method' => $method], "payment of {$amount} {$s['currency']} ({$method})");

            return $b->fresh();
        });
    }

    /**
     * After a movement: the label from the new figures (never while a card is
     * held online), the booking touched so every open screen's revision moves,
     * and the audit row with the actor.
     */
    private function settle(ServiceBooking $b, User $actor, string $action, array $new, string $summary): void
    {
        $old = ['payment_status' => (string) $b->payment_status];
        $status = self::statusFor(self::summary($b));
        if ($status !== null && $status !== (string) $b->payment_status) {
            $b->update(['payment_status' => $status]);
        } else {
            $b->touch();
        }
        AuditLog::record($action, $b, $new + ['payment_status' => (string) $b->payment_status], $old, $actor, "Appointment {$b->booking_reference}: {$summary}");
    }
```

- [ ] **Step 4: Remove "Mark paid at venue" (R3).**
  - In `AppointmentActions`:
    - delete the `'mark_paid_at_venue' => [...]` line from `FROM`;
    - delete its arm in `allowed()` (the comment line and the `'mark_paid_at_venue' => …` line);
    - delete its arm in `consequences()` (`'mark_paid_at_venue' => 'marked_only',`).
  - In `AppointmentActionRunner`:
    - delete `'mark_paid_at_venue' => ['payment_status' => 'paid'],`;
    - change the class comment "(or, for "paid at venue", the payment label)" to "(payments and refunds are AppointmentMoney's)".
  - In `tests/Feature/Appointments/AppointmentActionsTest.php`:
    - remove `'mark_paid_at_venue'` from the expected lists on lines 34–36 (the `completed` row becomes `[]`) and from
      the key list on line 55;
    - delete the four assertions on lines 63–66 and the one on line 126. If a test method is left with no assertion,
      delete the method.
  - In `tests/Feature/Appointments/AppointmentActionEndpointTest.php`, delete the test holding lines 214–219 (the
    mark-paid test); Take payment's tests replace it.

- [ ] **Step 5: The presenter and the bootstrap.**
  - In `AppointmentPresenter::detail()`, add `use App\Services\Appointments\Money\AppointmentMoney;` and, after
    `'messages' => …`, the entry `'money' => AppointmentMoney::summary($b),`.
  - In `BootstrapController::show()`, add `use App\Services\Appointments\Setup\SetupAccess;` and change the `'staff'`
    entry to
    `'staff' => ['name' => (string) $user->name, 'role' => $staff?->role, 'can_manage' => SetupAccess::canManage($user)],`.

- [ ] **Step 6: The controller** `app/Http/Controllers/Api/V1/Admin/Appointments/MoneyController.php`:

```php
<?php

namespace App\Http\Controllers\Api\V1\Admin\Appointments;

use App\Http\Controllers\Controller;
use App\Models\ServiceBookingPayment;
use App\Services\Appointments\AppointmentPresenter;
use App\Services\Appointments\Money\AppointmentMoney;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Money at the desk (Part E): payments by any staff member; refunds and takings by managers. */
class MoneyController extends Controller
{
    public function payments(Request $request, int $id, AppointmentMoney $money, AppointmentPresenter $presenter): JsonResponse
    {
        $data = $request->validate([
            'amount'   => 'required|numeric|min:0.01|max:100000',
            'method'   => ['required', 'string', Rule::in(ServiceBookingPayment::DESK_METHODS)],
            'note'     => 'nullable|string|max:200',
            'revision' => 'required|string|max:64',
        ]);

        try {
            $booking = $money->takePayment($id, (float) $data['amount'], $data['method'], $data['note'] ?? null, $data['revision'], $request->user());
        } catch (StaleAppointment $e) {
            return $this->stale($e, $presenter);
        }

        return response()->json(['booking' => $presenter->detail($booking)]);
    }

    /** Someone changed the appointment first: answer with what it is now (as BookingController does). */
    private function stale(StaleAppointment $e, AppointmentPresenter $presenter): JsonResponse
    {
        return response()->json([
            'error'   => 'stale',
            'message' => $e->getMessage(),
            'current' => $presenter->detail($e->booking->fresh()),
        ], 409);
    }
}
```

  Add `use App\Services\Appointments\StaleAppointment;` to the imports. A `StaleAppointment` has no renderer of its
  own, so an uncaught one would answer 500.

  The validation answers the `bitcoin` and `0` cases with Laravel's 422. The service's own checks are the second
  line, used by the cancel flow later.

- [ ] **Step 7: The route.** In `routes/api.php`, after the `bookings/{id}/actions` line (line 1301), add:

```php
                Route::post('bookings/{id}/payments', [\App\Http\Controllers\Api\V1\Admin\Appointments\MoneyController::class, 'payments'])->whereNumber('id');
```

- [ ] **Step 8: Run it.**
  - Run: same command as Step 2, then `tests/Feature/Appointments`, then `tests/Feature/AdminAccess` (the map
    covers every route) and `tests/Feature/RouteControllersExistTest.php tests/Feature/RouteUniquenessTest.php`.
  - Expected: PASS (6 new); everything else as the baseline.
  - If the `stale` test passes without travelling 1 second, keep the travel anyway: the revision includes `updated_at`
    to the second.

- [ ] **Step 9: Commit** with the subject "Take payments at the desk instead of marking appointments paid":

```bash
git add app/Services/Appointments/Money/AppointmentMoney.php app/Services/Appointments/AppointmentActions.php app/Services/Appointments/AppointmentActionRunner.php app/Services/Appointments/AppointmentPresenter.php app/Http/Controllers/Api/V1/Admin/Appointments/BootstrapController.php app/Http/Controllers/Api/V1/Admin/Appointments/MoneyController.php routes/api.php tests/Feature/Appointments/AppointmentActionsTest.php tests/Feature/Appointments/AppointmentActionEndpointTest.php tests/Feature/Appointments/Money/TakePaymentTest.php
git commit -F <ws>/tools/commit-2.txt
```

---

### Task 3: Refunds

**Files:**
- Modify:
  - `app/Services/Appointments/Money/AppointmentMoney.php` (`refund`, `refundInLock`, `afterRefunds`)
  - `app/Services/Loyalty/BookingPointsService.php` (`reverseForServiceBooking`)
  - `app/Http/Controllers/Api/V1/Admin/Appointments/MoneyController.php` (`refunds`)
  - `routes/api.php`
- Test: `tests/Feature/Appointments/Money/RefundTest.php`

**Interfaces:**
- Consumes: Task 2's service.
- Produces:
  - `AppointmentMoney::refund(int $id, float $amount, string $via, string $reason, string $revision, User $actor): ServiceBooking`;
  - `refundInLock(ServiceBooking $locked, float $amount, string $via, string $reason, User $actor): ServiceBookingPayment`
    (inside the caller's transaction with the row locked);
  - `afterRefunds(ServiceBooking $b, User $actor): void` (after commit);
  - `BookingPointsService::reverseForServiceBooking(ServiceBooking $booking, ?User $staff = null): int`;
  - `POST admin/appointments/bookings/{id}/refunds {amount, via, reason, revision}` → `{booking}` (managers).

- [ ] **Step 1: Write the failing test** `tests/Feature/Appointments/Money/RefundTest.php`:

```php
<?php

namespace Tests\Feature\Appointments\Money;

use App\Models\PointsTransaction;
use App\Models\ServiceBookingPayment;
use App\Services\Appointments\AppointmentPresenter;
use App\Services\Loyalty\BookingPointsService;
use App\Services\StripeService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Mockery;
use Stripe\Refund;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class RefundTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    private $stripe;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
        $this->stripe = Mockery::mock(StripeService::class);
        $this->stripe->shouldReceive('isEnabled')->andReturn(true)->byDefault();
        $this->app->instance(StripeService::class, $this->stripe);
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    private function refund($booking, array $body, $as = null): \Illuminate\Testing\TestResponse
    {
        return ($as ? $this->actingAs($as, 'sanctum') : $this->asStaff())
            ->postJson($this->api("bookings/{$booking->id}/refunds"), $body + ['reason' => 'Goodwill', 'revision' => AppointmentPresenter::revision($booking->fresh())]);
    }

    private function paidAtDesk(float $amount, array $attrs = [])
    {
        $b = $this->seedBooking($attrs);
        ServiceBookingPayment::create(['service_booking_id' => $b->id, 'kind' => 'payment', 'method' => 'cash', 'amount' => $amount, 'currency' => 'EUR', 'actor_user_id' => $this->staff->id]);

        return $b;
    }

    public function test_a_manager_gives_cash_back_and_staff_may_not(): void
    {
        $b = $this->paidAtDesk(60);

        $this->refund($b, ['amount' => 10, 'via' => 'cash'], $this->staffUser($this->org, ['role' => 'staff']))
            ->assertStatus(403)->assertJsonPath('error', 'not_allowed');

        $this->refund($b, ['amount' => 10, 'via' => 'cash'])->assertOk()
            ->assertJsonPath('booking.money.refunded_desk', 10)
            ->assertJsonPath('booking.money.movements.0.kind', 'refund')
            ->assertJsonPath('booking.money.movements.0.note', 'Goodwill')
            ->assertJsonPath('booking.payment.raw', 'partially_refunded');
    }

    public function test_limits_and_a_reason_are_required(): void
    {
        $b = $this->paidAtDesk(20);
        $this->refund($b, ['amount' => 21, 'via' => 'cash'])->assertStatus(422)->assertJsonPath('error', 'refund_too_large')->assertJsonPath('max', 20);
        $this->refund($b, ['amount' => 5, 'via' => 'online_card'])->assertStatus(422)->assertJsonPath('error', 'refund_too_large')->assertJsonPath('max', 0);
        $this->asStaff()->postJson($this->api("bookings/{$b->id}/refunds"), ['amount' => 5, 'via' => 'cash', 'reason' => '', 'revision' => AppointmentPresenter::revision($b->fresh())])->assertStatus(422);
    }

    public function test_a_card_paid_online_is_refunded_through_stripe_for_the_amount_given(): void
    {
        $b = $this->seedBooking(['payment_status' => 'paid', 'stripe_payment_intent_id' => 'pi_paid9']);
        $this->stripe->shouldReceive('refund')->once()
            ->withArgs(fn ($pi, $amount, $reason, $key) => $pi === 'pi_paid9' && abs($amount - 25.0) < 0.001 && $reason === 'requested_by_customer' && str_starts_with($key, "appt-refund-{$b->id}-"))
            ->andReturn(Refund::constructFrom(['id' => 're_77', 'status' => 'succeeded']));

        $this->refund($b, ['amount' => 25, 'via' => 'online_card'])->assertOk()
            ->assertJsonPath('booking.money.refunded_online', 25)
            ->assertJsonPath('booking.money.refundable_online', 35)
            ->assertJsonPath('booking.payment.raw', 'partially_refunded');

        $this->assertSame('re_77', ServiceBookingPayment::value('stripe_refund_id'));
        $this->assertSame(['re_77', 25.0], [$b->fresh()->last_refund_id, (float) $b->fresh()->refunded_amount]);
    }

    public function test_a_failed_stripe_refund_leaves_nothing_behind(): void
    {
        $b = $this->seedBooking(['payment_status' => 'paid', 'stripe_payment_intent_id' => 'pi_paid8']);
        $this->stripe->shouldReceive('refund')->andThrow(new \RuntimeException('Card network unavailable'));

        $this->refund($b, ['amount' => 25, 'via' => 'online_card'])->assertStatus(409)
            ->assertJsonPath('error', 'refund_failed')
            ->assertJson(['message' => 'The card refund did not go through: Card network unavailable']);

        $this->assertSame(0, ServiceBookingPayment::count());
        $this->assertSame(['paid', null], [$b->fresh()->payment_status, $b->fresh()->refunded_amount !== null ? (float) $b->fresh()->refunded_amount : null]);
    }

    public function test_online_payments_switched_off_refuse_a_card_refund_but_not_cash(): void
    {
        $this->stripe->shouldReceive('isEnabled')->andReturn(false);
        $b = $this->seedBooking(['payment_status' => 'paid', 'stripe_payment_intent_id' => 'pi_paid7']);

        $this->refund($b, ['amount' => 5, 'via' => 'online_card'])->assertStatus(409)->assertJsonPath('error', 'refund_unavailable');
    }

    public function test_a_full_refund_takes_the_points_back_once_and_a_part_refund_keeps_them(): void
    {
        $b = $this->paidAtDesk(60, ['member_id' => $this->member->id, 'status' => 'completed']);
        app(BookingPointsService::class)->awardForServiceBooking($b->fresh());
        $earned = PointsTransaction::where('reference_type', 'service_booking')->where('reference_id', $b->id)->value('points');
        $this->assertGreaterThan(0, $earned);

        $this->refund($b, ['amount' => 20, 'via' => 'cash'])->assertOk();
        $this->assertFalse((bool) PointsTransaction::where('reference_type', 'service_booking')->where('reference_id', $b->id)->where('points', '>', 0)->value('is_reversed'));

        $this->refund($b, ['amount' => 40, 'via' => 'cash'])->assertOk()->assertJsonPath('booking.payment.raw', 'refunded');
        $this->assertTrue((bool) PointsTransaction::where('reference_type', 'service_booking')->where('reference_id', $b->id)->where('points', '>', 0)->value('is_reversed'));
        $this->assertSame(1, PointsTransaction::where('reference_type', 'service_booking')->where('reference_id', $b->id)->where('points', '<', 0)->count());
    }
}
```

- [ ] **Step 2: Run it.**
  - Run: `bash .superpowers/sdd/2026-09-30-appointments-workspace/tools/t.sh tests/Feature/Appointments/Money/RefundTest.php`
  - Expected: FAIL — 404 (no route).
  - If the points test's reversal row is written with a different sign or `reference_type`, read
    `LoyaltyService::reverseTransaction()`. Assert what it writes (the reversal's own row) and ledger it.

- [ ] **Step 3: Points reversal.** In `BookingPointsService`, add `use App\Models\PointsTransaction;` and
  `use App\Models\User;` if missing, and the method:

```php
    /**
     * A refunded visit's points go back (Part E: full refunds only, called once
     * what was paid reaches zero). Every earn transaction of this booking not
     * yet reversed is reversed through the ledger's own reversal.
     */
    public function reverseForServiceBooking(ServiceBooking $booking, ?User $staff = null): int
    {
        $total = 0;
        $txs = PointsTransaction::withoutGlobalScopes()
            ->where('reference_type', 'service_booking')->where('reference_id', $booking->id)
            ->where('points', '>', 0)->where('is_reversed', false)->get();
        foreach ($txs as $tx) {
            $this->loyalty->reverseTransaction($tx, "Appointment {$booking->booking_reference} refunded", $staff);
            $total += (int) $tx->points;
        }

        return $total;
    }
```

- [ ] **Step 4: The service.** In `AppointmentMoney`, add `use App\Support\AdvisoryLock;` and
  `use Illuminate\Support\Facades\Log;` and these methods:

```php
    /** Managers (checked by the caller): money back, through Stripe or at the desk. */
    public function refund(int $id, float $amount, string $via, string $reason, string $revision, User $actor): ServiceBooking
    {
        $b = DB::transaction(function () use ($id, $amount, $via, $reason, $revision, $actor) {
            $b = ServiceBooking::lockForUpdate()->find($id)
                ?? throw new AppointmentRefused('not_found', 'This appointment no longer exists.', 404);
            StaleAppointment::unless($b, $revision);
            $this->refundInLock($b, $amount, $via, $reason, $actor);

            return $b;
        });
        $this->afterRefunds($b->fresh(), $actor);

        return $b->fresh();
    }

    /**
     * One refund inside the caller's transaction, the booking row already
     * locked. A Stripe refund also takes the `pi:` lock (the order the portal
     * and the capture job use: row first, then `pi:`). The ledger row is
     * written first so the Stripe idempotency key can name it; a Stripe
     * failure throws and the caller's transaction takes the row back (R5).
     */
    public function refundInLock(ServiceBooking $b, float $amount, string $via, string $reason, User $actor): ServiceBookingPayment
    {
        $amount = round($amount, 2);
        $reason = mb_substr(trim($reason), 0, 200);
        if ($reason === '') {
            throw new AppointmentRefused('reason_required', 'Say why the money goes back.', 422);
        }
        if ($amount <= 0) {
            throw new AppointmentRefused('invalid_amount', 'Enter an amount above zero.', 422);
        }
        $s = self::summary($b);
        $base = ['service_booking_id' => $b->id, 'kind' => 'refund', 'amount' => $amount, 'currency' => $s['currency'], 'note' => $reason, 'actor_user_id' => $actor->id];

        if ($via === 'online_card') {
            if ($amount > $s['refundable_online'] + 0.004) {
                throw new AppointmentRefused('refund_too_large', "At most {$s['refundable_online']} {$s['currency']} can go back to the card.", 422, ['max' => $s['refundable_online']]);
            }
            if (!$this->stripe->isEnabled()) {
                throw new AppointmentRefused('refund_unavailable', 'Online payments are switched off at this venue, so the card cannot be refunded here.', 409);
            }
            $pi = (string) $b->stripe_payment_intent_id;
            AdvisoryLock::within('pi:' . $pi);
            $row = ServiceBookingPayment::create($base + ['method' => 'online_card']);
            try {
                $refund = $this->stripe->refund($pi, $amount, 'requested_by_customer', "appt-refund-{$b->id}-{$row->id}");
            } catch (\Throwable $e) {
                throw new AppointmentRefused('refund_failed', 'The card refund did not go through: ' . $e->getMessage(), 409);
            }
            $refundId = (string) ($refund->id ?? '');
            $row->forceFill(['stripe_refund_id' => $refundId !== '' ? $refundId : null])->save();
            $b->update([
                'refunded_amount' => round((float) ($b->refunded_amount ?? 0) + $amount, 2),
                'refunded_at'     => now(),
                'last_refund_id'  => $refundId !== '' ? $refundId : $b->last_refund_id,
            ]);
        } elseif (in_array($via, ServiceBookingPayment::DESK_METHODS, true)) {
            if ($amount > $s['refundable_desk'] + 0.004) {
                throw new AppointmentRefused('refund_too_large', "At most {$s['refundable_desk']} {$s['currency']} was paid at the desk.", 422, ['max' => $s['refundable_desk']]);
            }
            $row = ServiceBookingPayment::create($base + ['method' => $via]);
        } else {
            throw new AppointmentRefused('invalid_method', 'Choose how the money goes back.', 422);
        }

        $this->settle($b, $actor, 'service_booking.refunded', ['amount' => $amount, 'method' => $via, 'reason' => $reason], "refund of {$amount} {$s['currency']} ({$via})");

        return $row;
    }

    /** After the refunds commit: a visit whose money all went back gives its points back, once. */
    public function afterRefunds(ServiceBooking $b, User $actor): void
    {
        $s = self::summary($b);
        if ($b->points_awarded_at === null || $s['paid_in'] <= 0 || $s['paid_back'] < $s['paid_in'] - 0.004) {
            return;
        }
        try {
            $this->points->reverseForServiceBooking($b, $actor);
        } catch (\Throwable $e) {
            Log::warning('service_booking.points_reversal_failed', ['id' => $b->id, 'error' => $e->getMessage()]);
        }
    }
```

- [ ] **Step 5: The controller and route.** In `MoneyController`, add `use App\Services\Appointments\Setup\SetupAccess;` and:

```php
    public function refunds(Request $request, int $id, AppointmentMoney $money, AppointmentPresenter $presenter): JsonResponse
    {
        SetupAccess::requireManager($request->user());
        $data = $request->validate([
            'amount'   => 'required|numeric|min:0.01|max:100000',
            'via'      => ['required', 'string', Rule::in([...ServiceBookingPayment::DESK_METHODS, 'online_card'])],
            'reason'   => 'required|string|max:200',
            'revision' => 'required|string|max:64',
        ]);

        try {
            $booking = $money->refund($id, (float) $data['amount'], $data['via'], $data['reason'], $data['revision'], $request->user());
        } catch (StaleAppointment $e) {
            return $this->stale($e, $presenter);
        }

        return response()->json(['booking' => $presenter->detail($booking)]);
    }
```

  In `routes/api.php`, after the payments route:

```php
                Route::post('bookings/{id}/refunds', [\App\Http\Controllers\Api\V1\Admin\Appointments\MoneyController::class, 'refunds'])->whereNumber('id');
```

- [ ] **Step 6: Run it.**
  - Run: same command as Step 2, then `tests/Feature/Appointments` and `tests/Feature/Loyalty`.
  - Expected: PASS (6 new); the rest as the baseline.

- [ ] **Step 7: Commit** with the subject "Let managers refund, through Stripe or at the desk":

```bash
git add app/Services/Appointments/Money/AppointmentMoney.php app/Services/Loyalty/BookingPointsService.php app/Http/Controllers/Api/V1/Admin/Appointments/MoneyController.php routes/api.php tests/Feature/Appointments/Money/RefundTest.php
git commit -F <ws>/tools/commit-3.txt
```

---

### Task 4: Cancel with refund

**Files:**
- Modify:
  - `app/Services/Appointments/AppointmentActionRunner.php` (`run(…, array $refunds = [])`)
  - `app/Http/Controllers/Api/V1/Admin/Appointments/BookingController.php` (`action` validates and passes `refunds`)
- Test: `tests/Feature/Appointments/Money/CancelWithRefundTest.php`

**Interfaces:**
- Consumes: `AppointmentMoney::refundInLock`, `afterRefunds` (Task 3); `SetupAccess::requireManager`
- Produces:
  - `AppointmentActionRunner::run(int $id, string $action, string $revision, ?string $reason, User $actor, array $refunds = []): array`;
  - `POST bookings/{id}/actions` accepts `refunds: [{via, amount}]` (cancel only; managers).

- [ ] **Step 1: Write the failing test** `tests/Feature/Appointments/Money/CancelWithRefundTest.php`:

```php
<?php

namespace Tests\Feature\Appointments\Money;

use App\Models\ServiceBookingPayment;
use App\Services\Appointments\AppointmentPresenter;
use App\Services\StripeService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Queue;
use Mockery;
use Stripe\Refund;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class CancelWithRefundTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    private $stripe;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
        Queue::fake();
        $this->stripe = Mockery::mock(StripeService::class);
        $this->stripe->shouldReceive('isEnabled')->andReturn(true)->byDefault();
        $this->app->instance(StripeService::class, $this->stripe);
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    private function cancel($b, array $extra = [], $as = null): \Illuminate\Testing\TestResponse
    {
        return ($as ? $this->actingAs($as, 'sanctum') : $this->asStaff())->postJson($this->api("bookings/{$b->id}/actions"), [
            'action' => 'cancel', 'revision' => AppointmentPresenter::revision($b->fresh()), 'reason' => 'Client ill',
        ] + $extra);
    }

    public function test_a_manager_cancels_and_refunds_the_card_and_the_cash_in_one_step(): void
    {
        $b = $this->seedBooking(['payment_status' => 'paid', 'stripe_payment_intent_id' => 'pi_both', 'total_amount' => 60]);
        $this->stripe->shouldReceive('refund')->once()->andReturn(Refund::constructFrom(['id' => 're_1', 'status' => 'succeeded']));

        $this->cancel($b, ['refunds' => [['via' => 'online_card', 'amount' => 60]]])->assertOk()
            ->assertJsonPath('booking.status', 'cancelled')
            ->assertJsonPath('booking.money.to_refund', 0)
            ->assertJsonPath('booking.payment.raw', 'refunded')
            ->assertJsonPath('booking.money.movements.0.note', 'Client ill');
    }

    public function test_a_failed_card_refund_leaves_the_appointment_standing(): void
    {
        $b = $this->seedBooking(['payment_status' => 'paid', 'stripe_payment_intent_id' => 'pi_fail']);
        $this->stripe->shouldReceive('refund')->andThrow(new \RuntimeException('declined'));

        $this->cancel($b, ['refunds' => [['via' => 'online_card', 'amount' => 60]]])->assertStatus(409)->assertJsonPath('error', 'refund_failed');

        $this->assertSame(['confirmed', 'paid'], [$b->fresh()->status, $b->fresh()->payment_status]);
        $this->assertSame(0, ServiceBookingPayment::count());
    }

    public function test_staff_cancel_without_refunding_and_see_what_is_left_to_refund(): void
    {
        $b = $this->seedBooking();
        ServiceBookingPayment::create(['service_booking_id' => $b->id, 'kind' => 'payment', 'method' => 'cash', 'amount' => 45, 'currency' => 'EUR', 'actor_user_id' => $this->staff->id]);
        $staff = $this->staffUser($this->org, ['role' => 'staff']);

        $this->cancel($b, ['refunds' => [['via' => 'cash', 'amount' => 45]]], $staff)->assertStatus(403)->assertJsonPath('error', 'not_allowed');
        $this->cancel($b, [], $staff)->assertOk()->assertJsonPath('booking.money.to_refund', 45);
    }

    public function test_a_zero_line_is_ignored_and_refunds_are_for_cancel_only(): void
    {
        $b = $this->seedBooking();
        $this->cancel($b, ['refunds' => [['via' => 'cash', 'amount' => 0]]])->assertOk()->assertJsonPath('booking.status', 'cancelled');

        $other = $this->seedBooking(['status' => 'pending', 'start_at' => '2026-10-06 12:00:00', 'end_at' => '2026-10-06 12:45:00']);
        $this->asStaff()->postJson($this->api("bookings/{$other->id}/actions"), [
            'action' => 'confirm', 'revision' => AppointmentPresenter::revision($other->fresh()), 'refunds' => [['via' => 'cash', 'amount' => 5]],
        ])->assertStatus(422);
    }
}
```

- [ ] **Step 2: Run it.**
  - Run: `bash .superpowers/sdd/2026-09-30-appointments-workspace/tools/t.sh tests/Feature/Appointments/Money/CancelWithRefundTest.php`
  - Expected: FAIL. The refunds are ignored: the card test cancels without a refund.

- [ ] **Step 3: The runner.**
  - In `AppointmentActionRunner`:
    - add `use App\Services\Appointments\Money\AppointmentMoney;` and `use App\Services\Appointments\Setup\SetupAccess;`;
    - add `private readonly AppointmentMoney $money,` to the constructor;
    - change the signature to `public function run(int $id, string $action, string $revision, ?string $reason, User $actor, array $refunds = []): array`.
  - At the top of `run()`, after the action check:

```php
        $refunds = array_values(array_filter($refunds, fn (array $r) => round((float) ($r['amount'] ?? 0), 2) > 0));
        if ($refunds !== [] && $action !== 'cancel') {
            throw new AppointmentRefused('not_allowed', 'Money goes back only with a cancellation or a refund.', 422);
        }
        if ($refunds !== []) {
            SetupAccess::requireManager($actor);
        }
```

  - The transaction's closure gains `$refunds` in its `use (...)` list.
  - Inside the transaction:
    - after `$reason = …;` and before `$patch = match ($action) {`, add:

```php
            // Cancel with refund (Part E): the money first, under this same row lock; a refused or failed refund
            // throws and nothing — not even the cancellation — is kept.
            foreach ($refunds as $r) {
                $this->money->refundInLock($booking, (float) $r['amount'], (string) $r['via'], $reason ?? 'Appointment cancelled', $actor);
            }
```

    - `refundInLock` runs `settle()`, which changes `payment_status`, so `$old` (taken before) keeps the label from
      before the refunds. That is the intended audit.
  - After the transaction, before `$points = null;`, add:

```php
        if ($refunds !== []) {
            $this->money->afterRefunds($booking->fresh(), $actor);
        }
```

- [ ] **Step 4: The controller.**
  - In `Appointments\BookingController::action()`, add to the validation:

```php
            'refunds'          => 'nullable|array|max:2',
            'refunds.*.via'    => ['required', 'string', Rule::in(['online_card', 'cash', 'card_desk', 'transfer', 'other'])],
            'refunds.*.amount' => 'required|numeric|min:0|max:100000',
```

  - Add `use Illuminate\Validation\Rule;` if missing, and pass `$data['refunds'] ?? []` as the sixth argument of
    `$runner->run(...)`.
  - Part D's message code after it stays as it is.

- [ ] **Step 5: Run it.**
  - Run: same command as Step 2, then `tests/Feature/Appointments`.
  - Expected: PASS (4 new); the rest as the baseline.

- [ ] **Step 6: Commit** with the subject "Refund in the same step as a cancellation":

```bash
git add app/Services/Appointments/AppointmentActionRunner.php app/Http/Controllers/Api/V1/Admin/Appointments/BookingController.php tests/Feature/Appointments/Money/CancelWithRefundTest.php
git commit -F <ws>/tools/commit-4.txt
```

---

### Task 5: Member price and coupons for staff bookings

**Files:**
- Create:
  - `app/Services/Appointments/Money/StaffPricing.php`
  - `app/Http/Controllers/Api/V1/Admin/Appointments/PriceController.php`
- Modify:
  - `app/Services/Appointments/StaffBookingWriter.php`
  - `app/Http/Controllers/Api/V1/Admin/Appointments/BookingController.php` (`store` validates `coupon`, `expected_total`)
  - `routes/api.php`
  - `tests/Concerns/SetsUpAppointmentsSchema.php` (the discount tables)
- Test: `tests/Feature/Appointments/Money/StaffPricingTest.php`

**Interfaces:**
- Produces:
  - `StaffPricing::price(Guest $client, float $list, string $currency, ?CouponSelection $coupon): PricingResult`;
  - `StaffPricing::quote(Guest $client, Service $service, ServiceMaster $master, string $startIso, ?CouponSelection $coupon): PricingResult`;
  - `StaffPricing::consume(PricingResult $p, string $reference): void`;
  - `GET admin/appointments/quote?client_id&service_id&master_id&start&coupon[member_offer_id|redemption_id]` →
    `PricingResult::toArray() + {member: bool}`;
  - `GET admin/appointments/clients/{id}/coupons` → `{coupons: [{kind, coupon, label}]}`;
  - `POST admin/appointments/clients/{id}/coupons/resolve {code}` → `{coupon: CouponResolver summary}`;
  - `POST bookings` accepts `coupon` and `expected_total`; 409 `price_changed` with `quote`.

- [ ] **Step 0: The discount tables in the appointments fixture.** Existing tests already book member clients through
  the workspace (`CreateAppointmentTest` uses `seedMemberClient()`), and after this task that path asks
  `DiscountService`, which reads `tier_benefits`, `special_offers`, `member_offers`, `rewards` and
  `reward_redemptions`.
  - In `SetsUpAppointmentsSchema::setUpAppointments()`, after the `service_booking_payments` block, add:

```php
        // Part E prices members through DiscountService: build its tables (the discount fixture's own builder, run on
        // a throwaway object so this trait does not take on SeedsDiscountFixture's properties).
        (new class { use \Tests\Concerns\SeedsDiscountFixture; public function build(): void { $this->setUpDiscountTables(); } })->build();
```

  - A fixture member with no tier benefits keeps the list price, so existing totals do not move.

- [ ] **Step 1: Write the failing test** `tests/Feature/Appointments/Money/StaffPricingTest.php`. It uses the
  discount fixture's seed helpers on the appointments fixture's member:

```php
<?php

namespace Tests\Feature\Appointments\Money;

use App\Models\MemberOffer;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;
use Tests\Concerns\SeedsDiscountFixture;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class StaffPricingTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema, SeedsDiscountFixture;

    private $client;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
        $this->setUpDiscountTables();
        $this->orgId = $this->org->id;
        Queue::fake();
        $this->client = $this->seedMemberClient();
    }

    private function quote(array $extra = []): \Illuminate\Testing\TestResponse
    {
        return $this->asStaff()->getJson($this->api('quote?' . http_build_query(array_merge([
            'client_id' => $this->client->id, 'service_id' => $this->service->id, 'master_id' => $this->master->id, 'start' => '2026-10-06T10:00',
        ], $extra))));
    }

    private function book(array $extra = [], ?string $key = null): \Illuminate\Testing\TestResponse
    {
        return $this->asStaff()->postJson($this->api('bookings'), array_merge([
            'client_id' => $this->client->id, 'service_id' => $this->service->id, 'master_id' => $this->master->id, 'start' => '2026-10-06T10:00',
        ], $extra), ['Idempotency-Key' => $key ?? (string) Str::uuid()]);
    }

    public function test_a_member_is_quoted_and_booked_at_the_member_price(): void
    {
        $this->benefit('percent_discount', 10, 'services');

        $this->quote()->assertOk()
            ->assertJsonPath('member', true)
            ->assertJsonPath('list_amount', 60)
            ->assertJsonPath('total_amount', 54)
            ->assertJsonPath('discount.source', 'tier_benefit');

        $this->book(['expected_total' => 54])->assertStatus(201)
            ->assertJsonPath('booking.price.total', 54)
            ->assertJsonPath('booking.price.list', 60);
    }

    public function test_a_non_member_is_quoted_the_list_price_and_may_not_use_a_coupon(): void
    {
        $this->client = $this->seedClient(['email' => 'nm@example.test', 'email_key' => 'nm@example.test']);
        $this->quote()->assertOk()->assertJsonPath('member', false)->assertJsonPath('total_amount', 60);
        $this->quote(['coupon' => ['member_offer_id' => 1]])->assertStatus(422)->assertJsonPath('error', 'coupon_not_found');
    }

    public function test_the_members_coupon_is_listed_applied_and_used_once_on_save(): void
    {
        $claim = $this->claimedOffer('fixed_amount', 15, 'services');

        $this->asStaff()->getJson($this->api("clients/{$this->client->id}/coupons"))->assertOk()
            ->assertJsonPath('coupons.0.coupon.member_offer_id', $claim->id);

        $coupon = ['member_offer_id' => $claim->id];
        $this->quote(['coupon' => $coupon])->assertJsonPath('total_amount', 45);

        $key = (string) Str::uuid();
        $this->book(['coupon' => $coupon, 'expected_total' => 45], $key)->assertStatus(201)->assertJsonPath('booking.price.total', 45);
        $this->book(['coupon' => $coupon, 'expected_total' => 45], $key)->assertOk()->assertJsonPath('replayed', true);

        $this->assertNotNull(MemberOffer::find($claim->id)->used_at);
        $this->asStaff()->getJson($this->api("clients/{$this->client->id}/coupons"))->assertJsonPath('coupons', []);
    }

    public function test_a_price_that_changed_since_the_quote_is_refused_and_nothing_is_used(): void
    {
        $claim = $this->claimedOffer('fixed_amount', 15, 'services');

        $this->book(['coupon' => ['member_offer_id' => $claim->id], 'expected_total' => 50])->assertStatus(409)
            ->assertJsonPath('error', 'price_changed')
            ->assertJsonPath('quote.total_amount', 45);

        $this->assertNull(MemberOffer::find($claim->id)->used_at);
    }

    public function test_a_code_the_client_shows_is_resolved_for_this_member(): void
    {
        $this->redemption('fixed', 5);

        $this->asStaff()->postJson($this->api("clients/{$this->client->id}/coupons/resolve"), ['code' => 'rew-test0001'])->assertOk()
            ->assertJsonPath('coupon.kind', 'reward');
        $this->asStaff()->postJson($this->api("clients/{$this->client->id}/coupons/resolve"), ['code' => 'NOPE'])->assertStatus(422)
            ->assertJsonPath('error', 'coupon_not_found');
    }
}
```

- [ ] **Step 2: Run it.**
  - Run: `bash .superpowers/sdd/2026-09-30-appointments-workspace/tools/t.sh tests/Feature/Appointments/Money/StaffPricingTest.php`
  - Expected: FAIL — 404 on `quote`.
  - If `SeedsDiscountFixture` and `SetsUpAppointmentsSchema` both declaring `$member` raises a trait conflict, add
    `use SeedsDiscountFixture { SeedsDiscountFixture::setUpDiscountTables insteadof … }` only if PHP asks. Identical
    property declarations are compatible.
  - If the fixture's member tier was not the one `benefit()` attaches to, `benefit()` uses `$this->member->tier_id`,
    which is the appointments fixture's member. That is correct.

- [ ] **Step 3: `StaffPricing`** `app/Services/Appointments/Money/StaffPricing.php`:

```php
<?php

namespace App\Services\Appointments\Money;

use App\Models\Guest;
use App\Models\LoyaltyMember;
use App\Models\Service;
use App\Models\ServiceMaster;
use App\Services\Booking\BookingScope;
use App\Services\Booking\CouponException;
use App\Services\Booking\CouponSelection;
use App\Services\Booking\MemberPricing;
use App\Services\Booking\PricingResult;
use App\Services\Portal\PortalBootstrap;
use App\Services\ServiceSchedulingService;

/**
 * The price of an appointment staff book (Part E spec §6): the slot's list
 * price, then — for a member of a venue with an active programme — the
 * portal's own member price and the member's chosen coupon. Staff and the
 * portal price through the same MemberPricing, so they cannot disagree.
 */
final class StaffPricing
{
    public function __construct(private readonly ServiceSchedulingService $scheduler, private readonly MemberPricing $pricing)
    {
    }

    public static function memberFor(Guest $client): ?LoyaltyMember
    {
        if (!$client->member_id || !PortalBootstrap::loyaltyOn((int) app('current_organization_id'))) {
            return null;
        }

        return LoyaltyMember::whereKey($client->member_id)->first();
    }

    public function price(Guest $client, float $list, string $currency, ?CouponSelection $coupon): PricingResult
    {
        $member = self::memberFor($client);
        if ($member === null) {
            if ($coupon !== null) {
                throw new CouponException('coupon_not_found', 'Coupons need an active membership.');
            }

            return $this->pricing->quoteWithoutMember($list, $currency);
        }

        return $this->pricing->quote($member, $list, $currency, BookingScope::Services, $coupon);
    }

    /** @throws \RuntimeException when the slot is not free (the scheduler's own message) */
    public function quote(Guest $client, Service $service, ServiceMaster $master, string $startIso, ?CouponSelection $coupon): PricingResult
    {
        $slot = $this->scheduler->reserveSlot($service, $master->id, $startIso);

        return $this->price($client, (float) $slot['price'], $service->currency ?: 'EUR', $coupon);
    }

    /** Inside the booking transaction only. */
    public function consume(PricingResult $p, string $reference): void
    {
        $this->pricing->consume($p, $reference);
    }
}
```

- [ ] **Step 4: The writer.** In `StaffBookingWriter`:
  - add `use App\Services\Appointments\Money\StaffPricing; use App\Services\Booking\CouponException; use App\Services\Booking\CouponSelection;`;
  - the constructor becomes
    `public function __construct(private readonly ServiceSchedulingService $scheduler, private readonly StaffPricing $pricing)`;
  - the docblock `@param` gains `coupon?: ?array, expected_total?: ?float`;
  - the hash array gains two entries:

```php
            'coupon'         => $data['coupon'] ?? null,
            'expected_total' => isset($data['expected_total']) ? round((float) $data['expected_total'], 2) : null,
```

  - inside the lock, right after `$slot = $this->scheduler->reserveSlot(...)`:

```php
                try {
                    $pricing = $this->pricing->price($guest, (float) $slot['price'], $service->currency ?: 'EUR', CouponSelection::fromArray($data['coupon'] ?? null));
                } catch (CouponException $e) {
                    throw new AppointmentRefused($e->errorCode, $e->sentence(), 422);
                }
                if (isset($data['expected_total']) && abs($pricing->total - (float) $data['expected_total']) > 0.004) {
                    throw new AppointmentRefused('price_changed', 'The price changed — check it and save again.', 409, ['quote' => $pricing->toArray()]);
                }
```

  - in `ServiceBooking::create([...])`:
    - replace `'total_amount' => round((float) $slot['price'], 2),` with nothing;
    - add `...$this->pricing->columns($pricing),` at the end of the array, with `$this->pricing->columns` delegating to
      `MemberPricing::columns`. Add to `StaffPricing`:

```php
    /** The price columns a booking row stores. */
    public function columns(PricingResult $p): array
    {
        return $this->pricing->columns($p);
    }
```

  - after `ServiceBookingSubmission::create([...]);`, add `$this->pricing->consume($pricing, $booking->booking_reference);`;
  - before the existing `catch (\RuntimeException)`, add a catch that keeps refusals as they are (an
    `AppointmentRefused` is a `\DomainException`, but `CouponException` is a `\RuntimeException` and is mapped above):

```php
        } catch (AppointmentRefused $e) {
            throw $e;
```

- [ ] **Step 5: The controller.**
  - In `Appointments\BookingController::store()`, the validation gains:

```php
            'coupon'                 => 'nullable|array',
            'coupon.member_offer_id' => 'nullable|integer',
            'coupon.redemption_id'   => 'nullable|integer',
            'expected_total'         => 'nullable|numeric|min:0|max:100000',
```

  - Create `app/Http/Controllers/Api/V1/Admin/Appointments/PriceController.php`:

```php
<?php

namespace App\Http\Controllers\Api\V1\Admin\Appointments;

use App\Http\Controllers\Controller;
use App\Models\Guest;
use App\Models\MemberOffer;
use App\Models\RewardRedemption;
use App\Models\Service;
use App\Models\ServiceMaster;
use App\Services\Appointments\AppointmentRefused;
use App\Services\Appointments\Money\StaffPricing;
use App\Services\Appointments\StaffBookingWriter;
use App\Services\Booking\CouponException;
use App\Services\Booking\CouponResolver;
use App\Services\Booking\CouponSelection;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** The price of an appointment staff are about to book, and the member's coupons (Part E §6). */
class PriceController extends Controller
{
    public function quote(Request $request, StaffPricing $pricing, StaffBookingWriter $writer): JsonResponse
    {
        $data = $request->validate([
            'client_id'              => 'required|integer',
            'service_id'             => 'required|integer',
            'master_id'              => 'required|integer',
            'start'                  => 'required|string|max:16',
            'coupon'                 => 'nullable|array',
            'coupon.member_offer_id' => 'nullable|integer',
            'coupon.redemption_id'   => 'nullable|integer',
        ]);
        $client = Guest::find($data['client_id']) ?? throw new AppointmentRefused('client_not_found', 'This client no longer exists.', 404);
        $service = Service::where('is_active', true)->find($data['service_id']) ?? throw new AppointmentRefused('service_not_found', 'This service no longer exists.', 404);
        $master = ServiceMaster::where('is_active', true)->find($data['master_id']) ?? throw new AppointmentRefused('master_not_found', 'This team member no longer exists.', 404);
        $start = $writer->startOrRefuse($data['start'], (int) app('current_organization_id'));

        try {
            $p = $pricing->quote($client, $service, $master, $start->toIso8601String(), CouponSelection::fromArray($data['coupon'] ?? null));
        } catch (CouponException $e) {
            throw new AppointmentRefused($e->errorCode, $e->sentence(), 422);
        } catch (\PDOException $e) {
            throw $e;
        } catch (\RuntimeException) {
            throw new AppointmentRefused('slot_taken', "That time is not free for {$master->name}. Choose another.", 409);
        }

        return response()->json($p->toArray() + ['member' => StaffPricing::memberFor($client) !== null]);
    }

    public function coupons(int $id): JsonResponse
    {
        $member = $this->memberOf($id);
        if ($member === null) {
            return response()->json(['coupons' => []]);
        }

        $offers = MemberOffer::with('offer')->where('member_id', $member->id)->where('status', 'claimed')->whereNull('used_at')
            ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()))->get()
            ->filter(fn (MemberOffer $c) => $c->offer !== null)
            ->map(fn (MemberOffer $c) => ['kind' => 'offer', 'coupon' => ['member_offer_id' => $c->id], 'label' => (string) $c->offer->title]);
        $rewards = RewardRedemption::with('reward')->where('member_id', $member->id)->where('status', RewardRedemption::STATUS_PENDING)->get()
            ->filter(fn (RewardRedemption $r) => $r->reward !== null && (float) $r->reward->discount_value > 0)
            ->map(fn (RewardRedemption $r) => ['kind' => 'reward', 'coupon' => ['redemption_id' => $r->id], 'label' => (string) $r->reward->name]);

        return response()->json(['coupons' => $offers->concat($rewards)->values()->all()]);
    }

    public function resolveCoupon(Request $request, int $id, CouponResolver $resolver): JsonResponse
    {
        $data = $request->validate(['code' => 'required|string|max:64']);
        $member = $this->memberOf($id) ?? throw new AppointmentRefused('coupon_not_found', 'Coupons need an active membership.', 422);
        try {
            return response()->json(['coupon' => $resolver->resolveCode($member, $data['code'])]);
        } catch (CouponException $e) {
            throw new AppointmentRefused($e->errorCode, $e->sentence(), 422);
        }
    }

    private function memberOf(int $clientId): ?\App\Models\LoyaltyMember
    {
        $client = Guest::find($clientId) ?? throw new AppointmentRefused('client_not_found', 'This client no longer exists.', 404);

        return StaffPricing::memberFor($client);
    }
}
```

  - In `routes/api.php`, after `clients/{id}`:

```php
                Route::get('clients/{id}/coupons', [\App\Http\Controllers\Api\V1\Admin\Appointments\PriceController::class, 'coupons'])->whereNumber('id');
                Route::post('clients/{id}/coupons/resolve', [\App\Http\Controllers\Api\V1\Admin\Appointments\PriceController::class, 'resolveCoupon'])->whereNumber('id');
                Route::get('quote', [\App\Http\Controllers\Api\V1\Admin\Appointments\PriceController::class, 'quote']);
```

- [ ] **Step 6: Run it.**
  - Run: same command as Step 2, then `tests/Feature/Appointments`, `tests/Feature/Booking` and `tests/Feature/AdminAccess`.
  - Expected: PASS (5 new); the rest as the baseline.
  - A test that builds `StaffBookingWriter` by hand with one argument fails. Construct it through the container
    instead and ledger it.

- [ ] **Step 7: Commit** with the subject "Give members their price and coupons when staff book":

```bash
git add app/Services/Appointments/Money/StaffPricing.php app/Services/Appointments/StaffBookingWriter.php app/Http/Controllers/Api/V1/Admin/Appointments/PriceController.php app/Http/Controllers/Api/V1/Admin/Appointments/BookingController.php routes/api.php tests/Concerns/SetsUpAppointmentsSchema.php tests/Feature/Appointments/Money/StaffPricingTest.php
git commit -F <ws>/tools/commit-5.txt
```

---

### Task 6: Takings

**Files:**
- Create: `app/Services/Appointments/Money/TakingsReport.php`
- Modify: `app/Http/Controllers/Api/V1/Admin/Appointments/MoneyController.php` (`takings`), `routes/api.php`
- Test: `tests/Feature/Appointments/Money/TakingsTest.php`

**Interfaces:**
- Produces:
  - `TakingsReport::for(int $orgId, string $date): array{date: string, totals: array<string, array<string, array{in: float, out: float}>>, rows: list<array>, online: array<string, float>}`.
    `totals` is keyed by currency, then method (`cash`, `card_desk`, `transfer`, `other`, `online_card`); `online` is
    keyed by currency.
  - `GET admin/appointments/takings?date=Y-m-d` (managers).

- [ ] **Step 1: Write the failing test** `tests/Feature/Appointments/Money/TakingsTest.php`:

```php
<?php

namespace Tests\Feature\Appointments\Money;

use App\Models\ServiceBookingPayment;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class TakingsTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
        $this->org->forceFill(['timezone' => 'Europe/Riga'])->save();
        app()->forgetScopedInstances();
    }

    private function moneyAt(string $utc, string $kind, string $method, float $amount): void
    {
        $this->travelTo(CarbonImmutable::parse($utc));
        $b = $this->seedBooking(['booking_reference' => 'SVC-' . strtoupper(substr(md5($utc . $method . $kind), 0, 8)), 'start_at' => '2026-10-05 10:00:00', 'end_at' => '2026-10-05 10:45:00']);
        ServiceBookingPayment::create(['service_booking_id' => $b->id, 'kind' => $kind, 'method' => $method, 'amount' => $amount, 'currency' => 'EUR', 'note' => $kind === 'refund' ? 'Goodwill' : null, 'actor_user_id' => $this->staff->id]);
    }

    public function test_a_day_on_the_venues_clock_totals_each_method_in_and_out(): void
    {
        $this->moneyAt('2026-10-05 06:00:00', 'payment', 'cash', 40);
        $this->moneyAt('2026-10-05 20:30:00', 'payment', 'cash', 20);     // 23:30 in Riga: still the 5th
        $this->moneyAt('2026-10-05 21:30:00', 'payment', 'cash', 99);     // 00:30 on the 6th in Riga
        $this->moneyAt('2026-10-05 09:00:00', 'payment', 'card_desk', 45);
        $this->moneyAt('2026-10-05 10:00:00', 'refund', 'cash', 5);

        $r = $this->asStaff()->getJson($this->api('takings?date=2026-10-05'))->assertOk();
        $r->assertJsonPath('totals.EUR.cash', ['in' => 60, 'out' => 5])
          ->assertJsonPath('totals.EUR.card_desk', ['in' => 45, 'out' => 0])
          ->assertJsonCount(4, 'rows')
          ->assertJsonPath('rows.0.by', $this->staff->name);
    }

    public function test_online_card_payments_of_the_days_appointments_are_shown_for_reference(): void
    {
        $this->seedBooking(['payment_status' => 'paid', 'stripe_payment_intent_id' => 'pi_day1', 'start_at' => '2026-10-05 15:00:00', 'end_at' => '2026-10-05 15:45:00']);
        $this->seedBooking(['payment_status' => 'paid', 'stripe_payment_intent_id' => 'pi_mock_x', 'start_at' => '2026-10-05 16:00:00', 'end_at' => '2026-10-05 16:45:00']);

        $this->asStaff()->getJson($this->api('takings?date=2026-10-05'))->assertOk()->assertJsonPath('online.EUR', 60);
    }

    public function test_only_managers_see_takings(): void
    {
        $this->actingAs($this->staffUser($this->org, ['role' => 'staff']), 'sanctum')
            ->getJson($this->api('takings?date=2026-10-05'))->assertStatus(403)->assertJsonPath('error', 'not_allowed');
        $this->asStaff()->getJson($this->api('takings?date=05-10-2026'))->assertStatus(422);
    }
}
```

- [ ] **Step 2: Run it.**
  - Run: `bash .superpowers/sdd/2026-09-30-appointments-workspace/tools/t.sh tests/Feature/Appointments/Money/TakingsTest.php`
  - Expected: FAIL — 404.

- [ ] **Step 3: The report** `app/Services/Appointments/Money/TakingsReport.php`:

```php
<?php

namespace App\Services\Appointments\Money;

use App\Models\ServiceBooking;
use App\Models\ServiceBookingPayment;
use App\Scopes\BrandScope;
use App\Services\Appointments\AppointmentActions;
use App\Services\Appointments\VenueClock;
use Carbon\CarbonImmutable;

/**
 * One day's takings on the venue's clock (Part E §7): money in and out at
 * the desk and through Stripe refunds made here, by method, and — for
 * reference — what this day's appointments were paid online by card.
 */
final class TakingsReport
{
    public const METHODS = ['cash', 'card_desk', 'transfer', 'other', 'online_card'];

    public static function for(int $orgId, string $date): array
    {
        $zone = VenueClock::zone($orgId);
        $from = CarbonImmutable::createFromFormat('!Y-m-d', $date, $zone);
        $to = $from->addDay();

        $rows = ServiceBookingPayment::with(['actor', 'booking'])
            ->where('created_at', '>=', $from->utc()->format('Y-m-d H:i:s'))
            ->where('created_at', '<', $to->utc()->format('Y-m-d H:i:s'))
            ->orderBy('id')->get();

        $totals = [];
        foreach ($rows as $r) {
            $cur = (string) $r->currency;
            $totals[$cur] ??= array_fill_keys(self::METHODS, ['in' => 0.0, 'out' => 0.0]);
            $side = $r->kind === 'payment' ? 'in' : 'out';
            $totals[$cur][$r->method][$side] = round($totals[$cur][$r->method][$side] + (float) $r->amount, 2);
        }

        $online = [];
        $paid = ServiceBooking::query()->withoutGlobalScope(BrandScope::class)
            ->where('start_at', '>=', $from->format('Y-m-d') . ' 00:00:00')
            ->where('start_at', '<', $to->format('Y-m-d') . ' 00:00:00')
            ->whereIn('payment_status', ['paid', 'partially_refunded', 'refunded'])->get()
            ->filter(fn (ServiceBooking $b) => AppointmentActions::carriesCardPayment($b));
        foreach ($paid as $b) {
            $cur = strtoupper((string) ($b->currency ?: 'EUR'));
            $online[$cur] = round(($online[$cur] ?? 0) + (float) $b->total_amount, 2);
        }

        return [
            'date'   => $date,
            'totals' => $totals,
            'rows'   => $rows->map(fn (ServiceBookingPayment $r) => $r->toApi() + [
                'reference' => $r->booking?->booking_reference,
                'client'    => $r->booking?->customer_name,
            ])->values()->all(),
            'online' => $online,
        ];
    }
}
```

- [ ] **Step 4: The controller and route.**
  - In `MoneyController`, add `use App\Services\Appointments\Money\TakingsReport;` and:

```php
    public function takings(Request $request): JsonResponse
    {
        SetupAccess::requireManager($request->user());
        $data = $request->validate(['date' => 'required|date_format:Y-m-d']);

        return response()->json(TakingsReport::for((int) app('current_organization_id'), $data['date']));
    }
```

  - Route, after the refunds route:

```php
                Route::get('takings', [\App\Http\Controllers\Api\V1\Admin\Appointments\MoneyController::class, 'takings']);
```

- [ ] **Step 5: Run it.**
  - Run: same command as Step 2.
  - Expected: PASS (3 tests). If `assertJsonPath('totals.EUR.cash', ['in' => 60, 'out' => 5])` fails only on
    `60` vs `60.0`, compare with `assertEqualsCanonicalizing` on `json('totals.EUR.cash')` and ledger it.

- [ ] **Step 6: Commit** with the subject "Show a day's takings to managers":

```bash
git add app/Services/Appointments/Money/TakingsReport.php app/Http/Controllers/Api/V1/Admin/Appointments/MoneyController.php routes/api.php tests/Feature/Appointments/Money/TakingsTest.php
git commit -F <ws>/tools/commit-6.txt
```

---

### Task 7: The full admin reads the money and stops labelling it

**Files:**
- Modify:
  - `app/Http/Controllers/Api/V1/Admin/ServiceBookingController.php` (`show`, `updateStatus`, `bulk`)
  - `tests/Feature/Appointments/Messages/FullAdminMessagesTest.php` (line 40)
- Test: `tests/Feature/Appointments/Money/FullAdminMoneyTest.php`

**Interfaces:**
- Consumes: `AppointmentMoney::summary` (Task 1)
- Produces:
  - `GET /v1/admin/service-bookings/{id}` gains `money`;
  - `PATCH …/status` refuses `payment_status` (422);
  - `POST …/bulk` refuses `mark_paid` (422).

- [ ] **Step 1: Write the failing test** `tests/Feature/Appointments/Money/FullAdminMoneyTest.php`:

```php
<?php

namespace Tests\Feature\Appointments\Money;

use App\Models\ServiceBookingPayment;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class FullAdminMoneyTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    public function test_the_drawer_reads_the_same_money(): void
    {
        $b = $this->seedBooking();
        ServiceBookingPayment::create(['service_booking_id' => $b->id, 'kind' => 'payment', 'method' => 'cash', 'amount' => 20, 'currency' => 'EUR', 'actor_user_id' => $this->staff->id]);

        $this->asStaff()->getJson("/api/v1/admin/service-bookings/{$b->id}")->assertOk()
            ->assertJsonPath('money.paid_desk', 20)
            ->assertJsonPath('money.owed', 40)
            ->assertJsonPath('money.movements.0.method', 'cash');
    }

    public function test_nobody_labels_a_booking_paid_without_money_behind_it(): void
    {
        $b = $this->seedBooking();

        $this->asStaff()->patchJson("/api/v1/admin/service-bookings/{$b->id}/status", ['payment_status' => 'paid'])->assertStatus(422);
        $this->asStaff()->postJson('/api/v1/admin/service-bookings/bulk', ['ids' => [$b->id], 'action' => 'mark_paid'])->assertStatus(422);

        $this->assertSame('unpaid', $b->fresh()->payment_status);
        $this->asStaff()->patchJson("/api/v1/admin/service-bookings/{$b->id}/status", ['status' => 'in_progress'])->assertOk();
    }
}
```

- [ ] **Step 2: Run it.**
  - Run: `bash .superpowers/sdd/2026-09-30-appointments-workspace/tools/t.sh tests/Feature/Appointments/Money/FullAdminMoneyTest.php`
  - Expected: FAIL — `money` missing, and both label requests answer 200.

- [ ] **Step 3: Implement** in `ServiceBookingController`:
  - add `use App\Services\Appointments\Money\AppointmentMoney;`;
  - in `show()`, before the return: `$arr['money'] = AppointmentMoney::summary($booking);`;
  - in `updateStatus()`'s validation, replace the `'payment_status' => …` rule with
    `'payment_status' => 'prohibited',` (money goes through the workspace, Part E);
  - in `bulk()`'s validation, the action list becomes `in:cancel,mark_complete,mark_no_show,mark_status`, and the
    match arm `'mark_paid' => ['payment_status' => 'paid'],` is deleted.
  - In `tests/Feature/Appointments/Messages/FullAdminMessagesTest.php` line 40, replace `['payment_status' => 'paid']`
    with `['staff_notes' => 'Phoned to confirm']` (the line asserts that a change which is not a status change sends
    nothing).

- [ ] **Step 4: Run it.**
  - Run: same command as Step 2, then `tests/Feature/Appointments`, `tests/Feature/Admin`, `tests/Feature/AdminAccess`
    and `tests/Feature/ChatGptPortalNotes tests/Feature/Member/Portal`.
  - Expected: PASS (2 new); the rest as the baseline. A test that sent `payment_status` to the status endpoint or
    `mark_paid` to bulk gets that request changed to a status change, and the change is ledgered.

- [ ] **Step 5: Commit** with the subject "Show the money in the full admin and stop labelling bookings paid":

```bash
git add app/Http/Controllers/Api/V1/Admin/ServiceBookingController.php tests/Feature/Appointments/Messages/FullAdminMessagesTest.php tests/Feature/Appointments/Money/FullAdminMoneyTest.php
git commit -F <ws>/tools/commit-7.txt
```

---

### Task 8: The workspace's Money block, Take payment and Refund

**Files:**
- Create:
  - `frontend/src/appointments/panel/MoneyBlock.tsx`, `TakePaymentForm.tsx`, `RefundForm.tsx`, `moneyLines.ts`
  - `<ws>/tools/add-parte-strings.cjs`
- Modify:
  - `frontend/src/appointments/lib/types.ts`, `lib/api.ts`
  - `frontend/src/appointments/panel/panelState.ts`, `AppointmentPanel.tsx`, `AppointmentView.tsx`, `ActionConfirm.tsx`, `consequences.ts`
  - five `appointments.<lang>.json`, `appointmentsLocales.test.ts`
  - the panel tests that list `mark_paid_at_venue` (`appointmentView.test.tsx`, `consequences.test.ts`)
- Test: `frontend/src/appointments/panel/money.test.tsx`

**Interfaces:**
- Consumes: the detail `money`, the bootstrap `staff.can_manage`, `POST …/payments`, `POST …/refunds` (Tasks 1–3)
- Produces:
  - types `DeskMethod`, `RefundVia`, `MoneyMovement`, `MoneyInfo`;
  - `appointmentsApi.takePayment(id, body)` and `appointmentsApi.refund(id, body)`;
  - `MoneyBlock({ money, locale, zone })`;
  - `TakePaymentForm({ booking, saving, error, onSave, onBack })`;
  - `RefundForm({ booking, saving, error, onSave, onBack })`;
  - `refundWays(money): RefundVia[]`;
  - `PanelState` view subs `pay` and `refund`; events `startPay` and `startRefund`.

- [ ] **Step 1: The strings.** Write `<ws>/tools/add-parte-strings.cjs` with the Write tool. It has the same shape as
  Part D's `add-partd-strings.cjs`:
  - `workspace` adds top-level `money` and `takings` blocks and `nav.takings`;
  - `admin` adds a top-level `desk_money` block to each `common.json`.

```js
// node <ws>/tools/add-parte-strings.cjs workspace|admin — run from the feature worktree root.
const fs = require('fs')
const which = process.argv[2]
const M = { cash: 'Cash', card_desk: 'Card at the desk', transfer: 'Bank transfer', other: 'Other', online_card: 'Card, through Stripe' }
const W = {
  en: { nav: 'Takings',
    money: { title: 'Money', total: 'Total', paid_online: 'Paid online by card', held_online: 'Card held online', paid_desk: 'Paid at the desk', refunded: 'Refunded', owed: 'Still owed', to_refund: '{{amount}} to refund — a manager can refund it', legacy: 'Marked paid (no amount recorded)', take: 'Take payment', refund: 'Refund', amount: 'Amount', how: 'How', note: 'Note', reason: 'Reason', save_payment: 'Record payment', save_refund: 'Refund {{amount}}', max: 'At most {{amount}}', by: 'by {{name}}', cancel_title: 'Money back', cancel_online: 'Refund the card (through Stripe)', cancel_desk: 'Give back at the desk', cancel_staff: '{{amount}} was paid — a manager can refund it.',
      method: M, kind: { payment: 'Payment', refund: 'Refund' },
      price: { list: 'List price', discount: 'Member discount', coupon: 'Coupon', none: 'No coupon', code: 'Code', apply: 'Apply', total: 'Total' } },
    takings: { title: 'Takings', day: 'Day', method: 'Method', in: 'In', out: 'Out', net: 'Net', none: 'No money was recorded on this day.', online: 'Paid online for this day\'s appointments: {{amount}}', time: 'Time', client: 'Client', reference: 'Reference', by: 'Recorded by' },
    errors: { amount_too_large: 'That is more than is owed.', refund_too_large: 'That is more than can go back this way.', refund_unavailable: 'Online payments are switched off at this venue, so the card cannot be refunded here.', reason_required: 'Say why the money goes back.', note_required: 'Say how the client paid.', invalid_amount: 'Enter an amount above zero.', price_changed: 'The price changed — check it and save again.' } },
  ru: { nav: 'Касса',
    money: { title: 'Оплата', total: 'Итого', paid_online: 'Оплачено онлайн картой', held_online: 'Сумма заблокирована на карте', paid_desk: 'Оплачено на месте', refunded: 'Возвращено', owed: 'Осталось оплатить', to_refund: 'К возврату {{amount}} — вернуть может менеджер', legacy: 'Отмечено как оплачено (сумма не записана)', take: 'Принять оплату', refund: 'Вернуть деньги', amount: 'Сумма', how: 'Способ', note: 'Примечание', reason: 'Причина', save_payment: 'Записать оплату', save_refund: 'Вернуть {{amount}}', max: 'Не больше {{amount}}', by: '{{name}}', cancel_title: 'Возврат денег', cancel_online: 'Вернуть на карту (через Stripe)', cancel_desk: 'Вернуть на месте', cancel_staff: 'Оплачено {{amount}} — вернуть деньги может менеджер.',
      method: { cash: 'Наличные', card_desk: 'Карта на месте', transfer: 'Банковский перевод', other: 'Другое', online_card: 'Карта, через Stripe' }, kind: { payment: 'Оплата', refund: 'Возврат' },
      price: { list: 'Цена по прайсу', discount: 'Скидка участника', coupon: 'Купон', none: 'Без купона', code: 'Код', apply: 'Применить', total: 'Итого' } },
    takings: { title: 'Касса', day: 'День', method: 'Способ', in: 'Приход', out: 'Расход', net: 'Итого', none: 'В этот день денег не записано.', online: 'Оплачено онлайн за записи этого дня: {{amount}}', time: 'Время', client: 'Клиент', reference: 'Номер записи', by: 'Записал(а)' },
    errors: { amount_too_large: 'Это больше, чем осталось оплатить.', refund_too_large: 'Столько нельзя вернуть этим способом.', refund_unavailable: 'Онлайн-оплата в заведении выключена, поэтому вернуть на карту здесь нельзя.', reason_required: 'Укажите причину возврата.', note_required: 'Укажите, как клиент оплатил.', invalid_amount: 'Введите сумму больше нуля.', price_changed: 'Цена изменилась — проверьте и сохраните снова.' } },
  de: { nav: 'Kasse',
    money: { title: 'Zahlung', total: 'Gesamt', paid_online: 'Online per Karte bezahlt', held_online: 'Betrag auf der Karte reserviert', paid_desk: 'Vor Ort bezahlt', refunded: 'Erstattet', owed: 'Noch offen', to_refund: '{{amount}} zu erstatten — eine Leitung kann erstatten', legacy: 'Als bezahlt markiert (kein Betrag erfasst)', take: 'Zahlung annehmen', refund: 'Erstatten', amount: 'Betrag', how: 'Wie', note: 'Notiz', reason: 'Grund', save_payment: 'Zahlung erfassen', save_refund: '{{amount}} erstatten', max: 'Höchstens {{amount}}', by: 'von {{name}}', cancel_title: 'Geld zurück', cancel_online: 'Auf die Karte erstatten (über Stripe)', cancel_desk: 'Vor Ort zurückgeben', cancel_staff: '{{amount}} wurde bezahlt — eine Leitung kann erstatten.',
      method: { cash: 'Bar', card_desk: 'Karte vor Ort', transfer: 'Überweisung', other: 'Sonstiges', online_card: 'Karte, über Stripe' }, kind: { payment: 'Zahlung', refund: 'Erstattung' },
      price: { list: 'Listenpreis', discount: 'Mitgliederrabatt', coupon: 'Gutschein', none: 'Kein Gutschein', code: 'Code', apply: 'Anwenden', total: 'Gesamt' } },
    takings: { title: 'Kasse', day: 'Tag', method: 'Art', in: 'Ein', out: 'Aus', net: 'Saldo', none: 'An diesem Tag wurde kein Geld erfasst.', online: 'Online bezahlt für die Termine dieses Tages: {{amount}}', time: 'Zeit', client: 'Kunde', reference: 'Referenz', by: 'Erfasst von' },
    errors: { amount_too_large: 'Das ist mehr als offen ist.', refund_too_large: 'So viel kann auf diesem Weg nicht zurück.', refund_unavailable: 'Online-Zahlungen sind hier ausgeschaltet; die Karte kann hier nicht erstattet werden.', reason_required: 'Geben Sie den Grund der Erstattung an.', note_required: 'Geben Sie an, wie der Kunde bezahlt hat.', invalid_amount: 'Geben Sie einen Betrag über null ein.', price_changed: 'Der Preis hat sich geändert — prüfen und erneut speichern.' } },
  fr: { nav: 'Caisse',
    money: { title: 'Paiement', total: 'Total', paid_online: 'Payé en ligne par carte', held_online: 'Montant bloqué sur la carte', paid_desk: 'Payé sur place', refunded: 'Remboursé', owed: 'Reste à payer', to_refund: '{{amount}} à rembourser — un responsable peut rembourser', legacy: 'Marqué payé (aucun montant enregistré)', take: 'Encaisser', refund: 'Rembourser', amount: 'Montant', how: 'Comment', note: 'Note', reason: 'Motif', save_payment: 'Enregistrer le paiement', save_refund: 'Rembourser {{amount}}', max: 'Au plus {{amount}}', by: 'par {{name}}', cancel_title: 'Remboursement', cancel_online: 'Rembourser la carte (via Stripe)', cancel_desk: 'Rendre sur place', cancel_staff: '{{amount}} a été payé — un responsable peut rembourser.',
      method: { cash: 'Espèces', card_desk: 'Carte sur place', transfer: 'Virement', other: 'Autre', online_card: 'Carte, via Stripe' }, kind: { payment: 'Paiement', refund: 'Remboursement' },
      price: { list: 'Prix catalogue', discount: 'Remise membre', coupon: 'Coupon', none: 'Sans coupon', code: 'Code', apply: 'Appliquer', total: 'Total' } },
    takings: { title: 'Caisse', day: 'Jour', method: 'Moyen', in: 'Entrées', out: 'Sorties', net: 'Solde', none: 'Aucun argent enregistré ce jour-là.', online: 'Payé en ligne pour les rendez-vous du jour : {{amount}}', time: 'Heure', client: 'Client', reference: 'Référence', by: 'Enregistré par' },
    errors: { amount_too_large: 'C’est plus que le reste à payer.', refund_too_large: 'On ne peut pas rendre autant de cette façon.', refund_unavailable: 'Les paiements en ligne sont désactivés ici ; la carte ne peut pas être remboursée ici.', reason_required: 'Indiquez le motif du remboursement.', note_required: 'Indiquez comment le client a payé.', invalid_amount: 'Saisissez un montant supérieur à zéro.', price_changed: 'Le prix a changé — vérifiez et enregistrez à nouveau.' } },
  es: { nav: 'Caja',
    money: { title: 'Pago', total: 'Total', paid_online: 'Pagado en línea con tarjeta', held_online: 'Importe retenido en la tarjeta', paid_desk: 'Pagado en el local', refunded: 'Devuelto', owed: 'Pendiente', to_refund: '{{amount}} por devolver — un responsable puede devolverlo', legacy: 'Marcado como pagado (sin importe registrado)', take: 'Cobrar', refund: 'Devolver', amount: 'Importe', how: 'Cómo', note: 'Nota', reason: 'Motivo', save_payment: 'Registrar pago', save_refund: 'Devolver {{amount}}', max: 'Como máximo {{amount}}', by: 'por {{name}}', cancel_title: 'Devolución', cancel_online: 'Devolver a la tarjeta (con Stripe)', cancel_desk: 'Devolver en el local', cancel_staff: 'Se pagaron {{amount}} — un responsable puede devolverlo.',
      method: { cash: 'Efectivo', card_desk: 'Tarjeta en el local', transfer: 'Transferencia', other: 'Otro', online_card: 'Tarjeta, con Stripe' }, kind: { payment: 'Pago', refund: 'Devolución' },
      price: { list: 'Precio de lista', discount: 'Descuento de socio', coupon: 'Cupón', none: 'Sin cupón', code: 'Código', apply: 'Aplicar', total: 'Total' } },
    takings: { title: 'Caja', day: 'Día', method: 'Medio', in: 'Entradas', out: 'Salidas', net: 'Saldo', none: 'No se registró dinero este día.', online: 'Pagado en línea por las citas del día: {{amount}}', time: 'Hora', client: 'Cliente', reference: 'Referencia', by: 'Registrado por' },
    errors: { amount_too_large: 'Es más de lo pendiente.', refund_too_large: 'No se puede devolver tanto de esta forma.', refund_unavailable: 'Los pagos en línea están desactivados aquí; la tarjeta no se puede devolver aquí.', reason_required: 'Indique el motivo de la devolución.', note_required: 'Indique cómo pagó el cliente.', invalid_amount: 'Introduzca un importe mayor que cero.', price_changed: 'El precio cambió — revíselo y guarde de nuevo.' } },
}
const A = {
  en: { title: 'Money', paid_online: 'Paid online by card', held_online: 'Card held online', paid_desk: 'Paid at the desk', refunded: 'Refunded', owed: 'Still owed', to_refund: 'To refund', legacy: 'Marked paid (no amount recorded)', open: 'Take payment / Refund in HexaTech Appointments', method: M, kind: { payment: 'Payment', refund: 'Refund' } },
  ru: { title: 'Оплата', paid_online: 'Оплачено онлайн картой', held_online: 'Сумма заблокирована на карте', paid_desk: 'Оплачено на месте', refunded: 'Возвращено', owed: 'Осталось оплатить', to_refund: 'К возврату', legacy: 'Отмечено как оплачено (сумма не записана)', open: 'Принять оплату / вернуть в HexaTech Appointments', method: W.ru.money.method, kind: W.ru.money.kind },
  de: { title: 'Zahlung', paid_online: 'Online per Karte bezahlt', held_online: 'Betrag auf der Karte reserviert', paid_desk: 'Vor Ort bezahlt', refunded: 'Erstattet', owed: 'Noch offen', to_refund: 'Zu erstatten', legacy: 'Als bezahlt markiert (kein Betrag erfasst)', open: 'Zahlung annehmen / erstatten in HexaTech Appointments', method: W.de.money.method, kind: W.de.money.kind },
  fr: { title: 'Paiement', paid_online: 'Payé en ligne par carte', held_online: 'Montant bloqué sur la carte', paid_desk: 'Payé sur place', refunded: 'Remboursé', owed: 'Reste à payer', to_refund: 'À rembourser', legacy: 'Marqué payé (aucun montant enregistré)', open: 'Encaisser / rembourser dans HexaTech Appointments', method: W.fr.money.method, kind: W.fr.money.kind },
  es: { title: 'Pago', paid_online: 'Pagado en línea con tarjeta', held_online: 'Importe retenido en la tarjeta', paid_desk: 'Pagado en el local', refunded: 'Devuelto', owed: 'Pendiente', to_refund: 'Por devolver', legacy: 'Marcado como pagado (sin importe registrado)', open: 'Cobrar / devolver en HexaTech Appointments', method: W.es.money.method, kind: W.es.money.kind },
}
function block(key, value, eol) { return `  "${key}": ` + JSON.stringify(value, null, 2).split('\n').join(eol + '  ') }
function appendTopLevel(raw, file, key, value) {
  if (raw.includes(`\n  "${key}": {`)) { console.log(`${file}: ${key} already there`); return raw }
  const eol = raw.includes('\r\n') ? '\r\n' : '\n'
  const body = raw.slice(0, raw.lastIndexOf('}')).replace(/\s*$/, '')
  raw = body + ',' + eol + block(key, value, eol) + eol + '}' + eol
  JSON.parse(raw); console.log(`${file}: ${key} added`); return raw
}
function insertInto(raw, file, parentLine, line) {
  if (raw.includes(line.trim())) return raw
  const m = raw.match(parentLine)
  if (!m) throw new Error(`${file}: ${parentLine} not found`)
  raw = raw.replace(m[0], m[0] + line)
  JSON.parse(raw); return raw
}
for (const lang of Object.keys(W)) {
  if (which === 'workspace') {
    const file = `frontend/src/appointments/i18n/appointments.${lang}.json`
    let raw = fs.readFileSync(file, 'utf8')
    const eol = raw.includes('\r\n') ? '\r\n' : '\n'
    raw = appendTopLevel(raw, file, 'money', W[lang].money)
    raw = appendTopLevel(raw, file, 'takings', W[lang].takings)
    raw = insertInto(raw, file, /"nav": \{ /, `"takings": ${JSON.stringify(W[lang].nav)}, `)
    for (const [code, text] of Object.entries(W[lang].errors)) {
      raw = insertInto(raw, file, /\r?\n  "error": \{\r?\n/, `    "${code}": ${JSON.stringify(text)},${eol}`)
    }
    fs.writeFileSync(file, raw); console.log(`${file}: written`)
  } else if (which === 'admin') {
    const file = `frontend/src/i18n/locales/${lang}/common.json`
    fs.writeFileSync(file, appendTopLevel(fs.readFileSync(file, 'utf8'), file, 'desk_money', A[lang]))
  } else {
    throw new Error('say workspace or admin')
  }
}
```

  Before running it, read the bundles' `nav` and `error` lines:
  `grep -n '"nav"\|^  "error"' frontend/src/appointments/i18n/appointments.en.json`.
  - `nav` is one line, `"nav": { "calendar": …, "setup": … }`, so `"takings"` goes in after `{ `.
  - `error` is a block at two spaces.
  - If either differs, adapt the two patterns and ledger it.

  Then run `node <ws>/tools/add-parte-strings.cjs workspace`.

- [ ] **Step 2: Write the failing test** `frontend/src/appointments/panel/money.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { AppointmentDetail, MoneyInfo } from '../lib/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en' },
  }),
}))

const { MoneyBlock } = await import('./MoneyBlock')
const { TakePaymentForm } = await import('./TakePaymentForm')
const { RefundForm } = await import('./RefundForm')
const { refundWays } = await import('./moneyLines')
const { panelReducer, CLOSED } = await import('./panelState')

const money = (over: Partial<MoneyInfo> = {}): MoneyInfo => ({
  total: 60, currency: 'EUR', held_online: 0, paid_online: 0, refunded_online: 0, paid_desk: 20, refunded_desk: 0,
  legacy_marked_paid: false, owed: 40, to_refund: 0, refundable_online: 0, refundable_desk: 20, paid_in: 20, paid_back: 0, can_take: true,
  movements: [{ id: 1, kind: 'payment', method: 'cash', amount: 20, currency: 'EUR', note: null, by: 'Mara', at: '2026-10-05T06:00:00+00:00' }],
  ...over,
})
const booking = (m: MoneyInfo) => ({ id: 1, revision: 'r', money: m, client: { name: 'Sophie' } }) as unknown as AppointmentDetail

describe('MoneyBlock', () => {
  it('says what was paid, how, by whom, and what is still owed', () => {
    const html = renderToStaticMarkup(<MoneyBlock money={money()} locale="en" zone="Europe/Riga" />)
    expect(html).toContain('Paid at the desk')
    expect(html).toContain('Still owed')
    expect(html).toContain('Cash')
    expect(html).toContain('by Mara')
  })

  it('names an older booking marked paid, a card held online, and money left to refund', () => {
    expect(renderToStaticMarkup(<MoneyBlock money={money({ legacy_marked_paid: true, movements: [], paid_desk: 0, owed: 0 })} locale="en" zone="UTC" />)).toContain('Marked paid (no amount recorded)')
    expect(renderToStaticMarkup(<MoneyBlock money={money({ held_online: 60, owed: 0, paid_desk: 0, movements: [] })} locale="en" zone="UTC" />)).toContain('Card held online')
    expect(renderToStaticMarkup(<MoneyBlock money={money({ to_refund: 20, owed: 0 })} locale="en" zone="UTC" />)).toContain('to refund')
  })
})

describe('the forms', () => {
  it('Take payment starts at what is owed and offers the four desk methods', () => {
    const html = renderToStaticMarkup(<TakePaymentForm booking={booking(money())} saving={false} error={null} onSave={() => {}} onBack={() => {}} />)
    expect(html).toContain('value="40"')
    for (const m of ['Cash', 'Card at the desk', 'Bank transfer', 'Other']) expect(html, m).toContain(m)
    expect(html).not.toContain('Stripe')
  })

  it('Refund offers only the ways money can go back, each with its limit', () => {
    expect(refundWays(money())).toEqual(['cash', 'card_desk', 'transfer', 'other'])
    expect(refundWays(money({ refundable_desk: 0, refundable_online: 60, paid_online: 60 }))).toEqual(['online_card'])
    expect(refundWays(money({ refundable_desk: 0 }))).toEqual([])
    const html = renderToStaticMarkup(<RefundForm booking={booking(money({ refundable_online: 60, paid_online: 60 }))} saving={false} error={null} onSave={() => {}} onBack={() => {}} />)
    expect(html).toContain('Card, through Stripe')
    expect(html).toContain('Reason')
  })
})

describe('panel state', () => {
  it('opens the payment and refund steps from the summary and returns on done', () => {
    const view = panelReducer(CLOSED, { type: 'openView', id: 4 })
    expect(panelReducer(view, { type: 'startPay' })).toMatchObject({ sub: 'pay' })
    const refund = panelReducer(view, { type: 'startRefund' })
    expect(refund).toMatchObject({ sub: 'refund' })
    expect(panelReducer(refund, { type: 'done', outcome: null })).toMatchObject({ sub: 'summary' })
  })
})
```

- [ ] **Step 3: Run it.**
  - Run: `bash .superpowers/sdd/2026-09-30-appointments-workspace/tools/fe.sh src/appointments/panel/money.test.tsx`
  - Expected: FAIL — `Failed to load url ./MoneyBlock`.

- [ ] **Step 4: Types and API.** In `lib/types.ts`:
  - remove `'mark_paid_at_venue'` from `ActionKey`;
  - add:

```ts
export type DeskMethod = 'cash' | 'card_desk' | 'transfer' | 'other'
export type RefundVia = DeskMethod | 'online_card'
export interface MoneyMovement { id: number; kind: 'payment' | 'refund'; method: RefundVia; amount: number; currency: string; note: string | null; by: string | null; at: string | null }
/** The money of an appointment (Part E), worked out by the server. */
export interface MoneyInfo {
  total: number; currency: string; held_online: number; paid_online: number; refunded_online: number
  paid_desk: number; refunded_desk: number; legacy_marked_paid: boolean; owed: number; to_refund: number
  refundable_online: number; refundable_desk: number; paid_in: number; paid_back: number; can_take: boolean
  movements: MoneyMovement[]
}
```

  - `AppointmentDetail` gains `money?: MoneyInfo`;
  - `Bootstrap.staff` becomes `{ name: string; role: string | null; can_manage?: boolean }`.

  In `lib/api.ts`, import `DeskMethod` and `RefundVia`, and add to `appointmentsApi`:

```ts
  takePayment: (id: number, body: { amount: number; method: DeskMethod; note?: string; revision: string }): Promise<{ booking: AppointmentDetail }> =>
    watched(api.post(`${BASE}/bookings/${id}/payments`, body)),

  refund: (id: number, body: { amount: number; via: RefundVia; reason: string; revision: string }): Promise<{ booking: AppointmentDetail }> =>
    watched(api.post(`${BASE}/bookings/${id}/refunds`, body)),
```

  and give `act`'s body type `refunds?: { via: RefundVia; amount: number }[]`.

- [ ] **Step 5: The pieces.**
  `panel/moneyLines.ts`:

```ts
import type { DeskMethod, MoneyInfo, RefundVia } from '../lib/types'

export const DESK_METHODS: DeskMethod[] = ['cash', 'card_desk', 'transfer', 'other']
export const METHOD_FALLBACK: Record<RefundVia, string> = { cash: 'Cash', card_desk: 'Card at the desk', transfer: 'Bank transfer', other: 'Other', online_card: 'Card, through Stripe' }

/** The ways money can go back now: through Stripe while the online card has some left; at the desk while desk money has some left. */
export function refundWays(m: MoneyInfo): RefundVia[] {
  return [...(m.refundable_online > 0 ? ['online_card' as const] : []), ...(m.refundable_desk > 0 ? DESK_METHODS : [])]
}

/** The most that can go back one way. */
export function refundMax(m: MoneyInfo, via: RefundVia): number {
  return via === 'online_card' ? m.refundable_online : m.refundable_desk
}
```

  `panel/MoneyBlock.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import { money as fmt } from '../../lib/money'
import type { MoneyInfo } from '../lib/types'
import { formatInstant } from '../lib/wallClock'
import { METHOD_FALLBACK } from './moneyLines'

/** What the appointment costs, what came in and went back, what is still owed, and every movement (Part E). */
export function MoneyBlock({ money: m, locale, zone }: { money: MoneyInfo; locale: string; zone: string }) {
  const { t } = useTranslation()
  const row = (label: string, amount: number, strong = false) => (
    <div className="flex justify-between gap-3"><dt className="text-a-text-2">{label}</dt><dd className={strong ? 'font-semibold text-a-text' : 'text-a-text'}>{fmt(amount, m.currency)}</dd></div>
  )

  return (
    <section className="rounded-lg border border-a-border p-3 text-sm space-y-2">
      <h3 className="font-semibold text-a-text">{t('appointments.money.title', 'Money')}</h3>
      <dl className="space-y-1">
        {m.held_online > 0 && row(t('appointments.money.held_online', 'Card held online'), m.held_online)}
        {m.paid_online > 0 && row(t('appointments.money.paid_online', 'Paid online by card'), m.paid_online)}
        {m.paid_desk > 0 && row(t('appointments.money.paid_desk', 'Paid at the desk'), m.paid_desk)}
        {m.paid_back > 0 && row(t('appointments.money.refunded', 'Refunded'), m.paid_back)}
        {m.owed > 0 && row(t('appointments.money.owed', 'Still owed'), m.owed, true)}
      </dl>
      {m.legacy_marked_paid && <p className="text-a-text-2">{t('appointments.money.legacy', 'Marked paid (no amount recorded)')}</p>}
      {m.to_refund > 0 && <p className="text-a-text">{t('appointments.money.to_refund', '{{amount}} to refund — a manager can refund it', { amount: fmt(m.to_refund, m.currency) })}</p>}
      {m.movements.length > 0 && (
        <ol className="space-y-1 border-t border-a-border pt-2">
          {m.movements.map(mv => (
            <li key={mv.id} className="flex flex-wrap gap-x-2 text-a-text-2">
              <span className="font-medium text-a-text">{t(`appointments.money.kind.${mv.kind}`, mv.kind === 'payment' ? 'Payment' : 'Refund')}</span>
              <span>{fmt(mv.amount, mv.currency)}</span>
              <span>{t(`appointments.money.method.${mv.method}`, METHOD_FALLBACK[mv.method])}</span>
              {mv.by && <span>{t('appointments.money.by', 'by {{name}}', { name: mv.by })}</span>}
              {mv.at && <time dateTime={mv.at}>{formatInstant(mv.at, locale, zone)}</time>}
              {mv.note && <span className="w-full">{mv.note}</span>}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
```

  `panel/TakePaymentForm.tsx`:

```tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AppointmentDetail, DeskMethod } from '../lib/types'
import { Button } from '../ui/Button'
import { Field } from '../ui/Field'
import { Notice } from '../ui/Notice'
import { DESK_METHODS, METHOD_FALLBACK } from './moneyLines'
import type { PanelError } from './panelState'

const control = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text'

/** Money taken at the desk: the amount starts at what is owed; "other" needs a note. */
export function TakePaymentForm({ booking, saving, error, onSave, onBack }: {
  booking: AppointmentDetail; saving: boolean; error: PanelError | null
  onSave: (body: { amount: number; method: DeskMethod; note?: string }) => void; onBack: () => void
}) {
  const { t } = useTranslation()
  const owed = booking.money?.owed ?? 0
  const [amount, setAmount] = useState(String(owed))
  const [method, setMethod] = useState<DeskMethod>('cash')
  const [note, setNote] = useState('')
  const value = Number(amount)
  const ready = value > 0 && value <= owed + 0.004 && (method !== 'other' || note.trim() !== '')

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (ready && !saving) onSave({ amount: value, method, ...(note.trim() ? { note: note.trim() } : {}) }) }}>
      <div className="text-base font-semibold text-a-text">{t('appointments.money.take', 'Take payment')}</div>
      <Field label={t('appointments.money.amount', 'Amount')}>
        <input type="number" inputMode="decimal" step="0.01" min="0.01" max={owed} className={control} value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Field label={t('appointments.money.how', 'How')}>
        <select className={control} value={method} onChange={(e) => setMethod(e.target.value as DeskMethod)}>
          {DESK_METHODS.map(m => <option key={m} value={m}>{t(`appointments.money.method.${m}`, METHOD_FALLBACK[m])}</option>)}
        </select>
      </Field>
      <Field label={t('appointments.money.note', 'Note')}>
        <input className={control} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      {error && <Notice tone="danger">{t(`appointments.error.${error.code}`, error.message)}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!ready} loading={saving}>{t('appointments.money.save_payment', 'Record payment')}</Button>
        <Button type="button" variant="ghost" disabled={saving} onClick={onBack}>{t('appointments.common.back', 'Back')}</Button>
      </div>
    </form>
  )
}
```

  `panel/RefundForm.tsx`:

```tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { money as fmt } from '../../lib/money'
import type { AppointmentDetail, RefundVia } from '../lib/types'
import { Button } from '../ui/Button'
import { Field } from '../ui/Field'
import { Notice } from '../ui/Notice'
import { METHOD_FALLBACK, refundMax, refundWays } from './moneyLines'
import type { PanelError } from './panelState'

const control = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text'

/** Managers: money back one way at a time, with a reason. */
export function RefundForm({ booking, saving, error, onSave, onBack }: {
  booking: AppointmentDetail; saving: boolean; error: PanelError | null
  onSave: (body: { amount: number; via: RefundVia; reason: string }) => void; onBack: () => void
}) {
  const { t } = useTranslation()
  const m = booking.money!
  const ways = refundWays(m)
  const [via, setVia] = useState<RefundVia>(ways[0] ?? 'cash')
  const max = refundMax(m, via)
  const [amount, setAmount] = useState(String(max))
  const [reason, setReason] = useState('')
  const value = Number(amount)
  const ready = ways.includes(via) && value > 0 && value <= max + 0.004 && reason.trim() !== ''

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (ready && !saving) onSave({ amount: value, via, reason: reason.trim() }) }}>
      <div className="text-base font-semibold text-a-text">{t('appointments.money.refund', 'Refund')}</div>
      <Field label={t('appointments.money.how', 'How')}>
        <select className={control} value={via} onChange={(e) => { const v = e.target.value as RefundVia; setVia(v); setAmount(String(refundMax(m, v))) }}>
          {ways.map(w => <option key={w} value={w}>{t(`appointments.money.method.${w}`, METHOD_FALLBACK[w])}</option>)}
        </select>
      </Field>
      <Field label={t('appointments.money.amount', 'Amount')} hint={t('appointments.money.max', 'At most {{amount}}', { amount: fmt(max, m.currency) })}>
        <input type="number" inputMode="decimal" step="0.01" min="0.01" max={max} className={control} value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Field label={t('appointments.money.reason', 'Reason')}>
        <input className={control} maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      {error && <Notice tone="danger">{t(`appointments.error.${error.code}`, error.message)}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="danger" disabled={!ready} loading={saving}>{t('appointments.money.save_refund', 'Refund {{amount}}', { amount: fmt(value > 0 ? value : 0, m.currency) })}</Button>
        <Button type="button" variant="ghost" disabled={saving} onClick={onBack}>{t('appointments.common.back', 'Back')}</Button>
      </div>
    </form>
  )
}
```

  If `Field` has no `hint` prop, check `ui/Field.tsx`: Setup's currency field passes `hint`, so it exists.

- [ ] **Step 6: Panel state and wiring.**
  - In `panelState.ts`:
    - the view `sub` union becomes `'summary' | 'move' | 'confirm' | 'pay' | 'refund'`;
    - add the events `| { type: 'startPay' } | { type: 'startRefund' }`;
    - add these view cases:

```ts
      case 'startPay':
        return { ...state, sub: 'pay', action: null, error: null, outcome: null, told: null }
      case 'startRefund':
        return { ...state, sub: 'refund', action: null, error: null, outcome: null, told: null }
```

  - In `AppointmentView.tsx`:
    - remove the `['mark_paid_at_venue', …]` entry from `labels`;
    - add the props `canManage: boolean; onPay: () => void; onRefund: () => void`;
    - import `MoneyBlock` and `refundWays`;
    - render `{b.money && <MoneyBlock money={b.money} locale={locale} zone={zone} />}` after the client section;
    - inside the buttons row, after the offered actions, add:

```tsx
        {b.money?.can_take && <Button type="button" size="sm" variant="secondary" disabled={saving} onClick={onPay}>{t('appointments.money.take', 'Take payment')}</Button>}
        {canManage && b.money && refundWays(b.money).length > 0 && <Button type="button" size="sm" variant="secondary" disabled={saving} onClick={onRefund}>{t('appointments.money.refund', 'Refund')}</Button>}
```

  - In `ActionConfirm.tsx`, remove the `mark_paid_at_venue` entry of `TITLE`.
  - In `consequences.ts`, remove `'mark_paid_at_venue'` from `NEEDS_CONFIRM`.
  - In `AppointmentPanel.tsx`:
    - import `RefundForm`, `TakePaymentForm` and the types `DeskMethod` and `RefundVia`;
    - add `const canManage = boot.staff.can_manage ?? false`;
    - add the handlers:

```tsx
  const pay = async (body: { amount: number; method: DeskMethod; note?: string }) => {
    if (!booking) return
    dispatch({ type: 'saving' })
    try { const r = await appointmentsApi.takePayment(booking.id, { ...body, revision: booking.revision }); settle(r.booking, null) } catch (e) { refuse(e) }
  }
  const giveBack = async (body: { amount: number; via: RefundVia; reason: string }) => {
    if (!booking) return
    dispatch({ type: 'saving' })
    try { const r = await appointmentsApi.refund(booking.id, { ...body, revision: booking.revision }); settle(r.booking, null) } catch (e) { refuse(e) }
  }
```

    - pass `canManage={canManage} onPay={() => dispatch({ type: 'startPay' })} onRefund={() => dispatch({ type: 'startRefund' })}`
      to `AppointmentView`;
    - render:

```tsx
        {state.mode === 'view' && booking && state.sub === 'pay' && (
          <TakePaymentForm booking={booking} saving={state.saving} error={state.error} onSave={(b) => { void pay(b) }} onBack={() => dispatch({ type: 'back' })} />
        )}
        {state.mode === 'view' && booking && state.sub === 'refund' && booking.money && (
          <RefundForm booking={booking} saving={state.saving} error={state.error} onSave={(b) => { void giveBack(b) }} onBack={() => dispatch({ type: 'back' })} />
        )}
```

  - Existing tests:
    - `appointmentView.test.tsx`, `consequences.test.ts` and any test that lists `mark_paid_at_venue` lose that key;
    - tests that render `AppointmentView` gain `canManage={false} onPay={() => {}} onRefund={() => {}}`;
    - ledger each.

- [ ] **Step 7: Locale families.** In `appointmentsLocales.test.ts` `FAMILIES`, add:

```ts
  'money.method': ['cash', 'card_desk', 'transfer', 'other', 'online_card'],
  'money.kind': ['payment', 'refund'],
```

  and add `'amount_too_large', 'refund_too_large', 'refund_unavailable', 'reason_required', 'note_required', 'invalid_amount', 'price_changed'`
  to the `error` family.

- [ ] **Step 8: Run them.**
  - Run: `bash .superpowers/sdd/2026-09-30-appointments-workspace/tools/fe.sh`
  - Expected: vitest PASS (5 new), tsc 0, eslint 0.

- [ ] **Step 9: Commit** with the subject "Show the money and take payments and refunds in the workspace":

```bash
git add frontend/src/appointments/lib/types.ts frontend/src/appointments/lib/api.ts frontend/src/appointments/panel/MoneyBlock.tsx frontend/src/appointments/panel/TakePaymentForm.tsx frontend/src/appointments/panel/RefundForm.tsx frontend/src/appointments/panel/moneyLines.ts frontend/src/appointments/panel/panelState.ts frontend/src/appointments/panel/AppointmentPanel.tsx frontend/src/appointments/panel/AppointmentView.tsx frontend/src/appointments/panel/ActionConfirm.tsx frontend/src/appointments/panel/consequences.ts frontend/src/appointments/panel/money.test.tsx frontend/src/appointments/i18n/appointmentsLocales.test.ts frontend/src/appointments/i18n/appointments.en.json frontend/src/appointments/i18n/appointments.ru.json frontend/src/appointments/i18n/appointments.de.json frontend/src/appointments/i18n/appointments.fr.json frontend/src/appointments/i18n/appointments.es.json
git commit -F <ws>/tools/commit-8.txt
```

  Also `git add` each existing test file Step 6 changed.

---

### Task 9: Refund lines on Cancel, and the member price on New appointment

**Files:**
- Modify:
  - `frontend/src/appointments/lib/types.ts`, `lib/api.ts` (quote and coupons)
  - `frontend/src/appointments/panel/ActionConfirm.tsx`, `AppointmentPanel.tsx`, `CreateForm.tsx`, `panelState.ts`
- Test: `frontend/src/appointments/panel/cancelAndPrice.test.tsx`

**Interfaces:**
- Consumes:
  - `act` with `refunds` (Task 4);
  - `GET quote`, `GET clients/{id}/coupons`, `POST …/coupons/resolve`;
  - `POST bookings` with `coupon` and `expected_total` (Task 5).
- Produces:
  - types `CouponRef`, `CouponOption`, `PriceQuote`;
  - `appointmentsApi.quote(params)`, `coupons(clientId)` and `resolveCoupon(clientId, code)`;
  - `CreateDraft.coupon: CouponRef | null`;
  - `ActionConfirm` props `canManage` and `refunds`/`onRefunds`;
  - `CancelRefunds { online: string; desk: string; deskMethod: DeskMethod }`.

- [ ] **Step 1: Write the failing test** `frontend/src/appointments/panel/cancelAndPrice.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ActionInfo, AppointmentDetail, MoneyInfo, PriceQuote } from '../lib/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en' },
  }),
}))
vi.mock('../lib/vocab', () => ({ useVocab: () => (k: string) => k }))

const { ActionConfirm } = await import('./ActionConfirm')
const { CreateForm } = await import('./CreateForm')
const { emptyDraft, draftBody } = await import('./panelState')

const money = (over: Partial<MoneyInfo>): MoneyInfo => ({ total: 60, currency: 'EUR', held_online: 0, paid_online: 0, refunded_online: 0, paid_desk: 0, refunded_desk: 0, legacy_marked_paid: false, owed: 60, to_refund: 0, refundable_online: 0, refundable_desk: 0, paid_in: 0, paid_back: 0, can_take: true, movements: [], ...over })
const cancel: ActionInfo = { key: 'cancel', allowed: true, consequences: { payment: 'none', points: null, coupon: 'none', message: 'ask' } }
const booking = (m: MoneyInfo) => ({ id: 1, client: { name: 'Sophie' }, client_email: null, start: '2026-10-06T10:00', end: '2026-10-06T10:45', money: m }) as unknown as AppointmentDetail
const confirm = (m: MoneyInfo, canManage: boolean) => renderToStaticMarkup(
  <ActionConfirm booking={booking(m)} action={cancel} reason="" saving={false} error={null} tell={false} onTell={() => {}}
    canManage={canManage} refunds={{ online: String(m.refundable_online), desk: String(m.refundable_desk), deskMethod: 'cash' }} onRefunds={() => {}}
    onReason={() => {}} onConfirm={() => {}} onBack={() => {}} />,
)

describe('Cancel with refund', () => {
  it('offers a manager the card and the desk lines, filled with everything refundable', () => {
    const html = confirm(money({ paid_online: 60, refundable_online: 60, paid_desk: 10, refundable_desk: 10 }), true)
    expect(html).toContain('Refund the card (through Stripe)')
    expect(html).toContain('value="60"')
    expect(html).toContain('Give back at the desk')
    expect(html).toContain('value="10"')
  })

  it('tells staff a manager can refund, and asks nothing when nothing was paid', () => {
    expect(confirm(money({ paid_desk: 45, refundable_desk: 45 }), false)).toContain('a manager can refund it')
    expect(confirm(money({}), true)).not.toContain('Money back')
  })
})

describe('New appointment price', () => {
  const quote: PriceQuote = { list_amount: 60, discount: { amount: 6, label: 'Gold 10%', source: 'tier_benefit' }, coupon: null, total_amount: 54, currency: 'EUR', member: true }
  const sophie = { id: 5, name: 'Sophie', phone: null, email: null, member: { id: 9, number: 'HL-9', tier: 'Gold', points: 0 } }
  const render = (extra: Record<string, unknown>) => renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <CreateForm draft={{ ...emptyDraft('2026-10-06'), masterId: 1, serviceId: 3, client: sophie, time: '10:00' }} masters={[{ id: 1, name: 'Mara', title: null, avatar: null, days: {} }]}
        services={[{ id: 3, name: 'Cut', duration_minutes: 45, buffer_after_minutes: 0, price: 60, currency: 'EUR', master_ids: [1] }]}
        slots={{ slots: [{ start: '2026-10-06T10:00', end: '2026-10-06T10:45', label: '10:00' }], duration_minutes: 45, price: 60, currency: 'EUR' }}
        slotsLoading={false} today="2026-10-06" saving={false} error={null} onEdit={() => {}} onSave={() => {}} tell={false} onTell={() => {}}
        quote={quote} coupons={[{ kind: 'offer', coupon: { member_offer_id: 7 }, label: 'Summer 15' }]} onResolveCode={async () => {}} {...extra} />
    </QueryClientProvider>,
  )

  it('shows the list price, the member discount, the total and the members coupons', () => {
    const html = render({})
    expect(html).toContain('Gold 10%')
    expect(html).toContain('Summer 15')
    expect(html).toContain('No coupon')
  })

  it('sends the chosen coupon with the booking', () => {
    const body = draftBody({ ...emptyDraft('2026-10-06'), time: '10:00', masterId: 1, serviceId: 3, client: sophie, coupon: { member_offer_id: 7 } })
    expect(body).toMatchObject({ coupon: { member_offer_id: 7 } })
    expect(draftBody({ ...emptyDraft('2026-10-06'), time: '10:00', masterId: 1, serviceId: 3, client: sophie })).not.toHaveProperty('coupon')
  })
})
```

- [ ] **Step 2: Run it.**
  - Run: `bash .superpowers/sdd/2026-09-30-appointments-workspace/tools/fe.sh src/appointments/panel/cancelAndPrice.test.tsx`
  - Expected: FAIL (tsc: the unknown props and `PriceQuote`; vitest: the missing lines).

- [ ] **Step 3: Types and API.** In `lib/types.ts`:

```ts
export type CouponRef = { member_offer_id: number } | { redemption_id: number }
export interface CouponOption { kind: 'offer' | 'reward'; coupon: CouponRef; label: string; value_label?: string }
/** The price staff are about to book at (Part E): the portal's own member price. */
export interface PriceQuote {
  list_amount: number; discount: { amount: number; label: string; source: string } | null
  coupon: { status?: string; label?: string } | null; total_amount: number; currency: string; member: boolean
}
```

  - `CreateBody` gains `coupon?: CouponRef; expected_total?: number`.

  In `lib/api.ts`, import them and add:

```ts
  quote: (p: { client_id: number; service_id: number; master_id: number; start: Wall; coupon?: CouponRef | null }): Promise<PriceQuote> =>
    watched(api.get(`${BASE}/quote`, { params: { ...p, coupon: p.coupon ?? undefined } })),

  coupons: (clientId: number): Promise<{ coupons: CouponOption[] }> => watched(api.get(`${BASE}/clients/${clientId}/coupons`)),

  resolveCoupon: (clientId: number, code: string): Promise<{ coupon: CouponOption }> =>
    watched(api.post(`${BASE}/clients/${clientId}/coupons/resolve`, { code })),
```

- [ ] **Step 4: The draft.** In `panelState.ts`:
  - `CreateDraft` gains `coupon: CouponRef | null` (import the type);
  - `emptyDraft` sets `coupon: null`;
  - `draftBody` adds `...(draft.coupon ? { coupon: draft.coupon } : {})`;
  - add `export interface CancelRefunds { online: string; desk: string; deskMethod: DeskMethod }`.

- [ ] **Step 5: The Cancel lines.** In `ActionConfirm.tsx`:
  - add the props `canManage: boolean; refunds: CancelRefunds; onRefunds: (r: CancelRefunds) => void`;
  - import `money as fmt` from `'../../lib/money'`, `DESK_METHODS` and `METHOD_FALLBACK` from `'./moneyLines'`, and
    `CancelRefunds` from `'./panelState'`;
  - after the reason field (cancel only), add:

```tsx
      {action.key === 'cancel' && booking.money && (booking.money.refundable_online > 0 || booking.money.refundable_desk > 0) && (
        canManage ? (
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-a-text">{t('appointments.money.cancel_title', 'Money back')}</legend>
            {booking.money.refundable_online > 0 && (
              <Field label={t('appointments.money.cancel_online', 'Refund the card (through Stripe)')}>
                <input type="number" step="0.01" min="0" max={booking.money.refundable_online} className="w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text"
                  value={refunds.online} onChange={(e) => onRefunds({ ...refunds, online: e.target.value })} />
              </Field>
            )}
            {booking.money.refundable_desk > 0 && (
              <Field label={t('appointments.money.cancel_desk', 'Give back at the desk')}>
                <div className="flex gap-2">
                  <input type="number" step="0.01" min="0" max={booking.money.refundable_desk} className="w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text"
                    value={refunds.desk} onChange={(e) => onRefunds({ ...refunds, desk: e.target.value })} />
                  <select className="rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text" value={refunds.deskMethod} onChange={(e) => onRefunds({ ...refunds, deskMethod: e.target.value as CancelRefunds['deskMethod'] })}>
                    {DESK_METHODS.map(m => <option key={m} value={m}>{t(`appointments.money.method.${m}`, METHOD_FALLBACK[m])}</option>)}
                  </select>
                </div>
              </Field>
            )}
          </fieldset>
        ) : (
          <p className="text-sm text-a-text">{t('appointments.money.cancel_staff', '{{amount}} was paid — a manager can refund it.', { amount: fmt(booking.money.refundable_online + booking.money.refundable_desk, booking.money.currency) })}</p>
        )
      )}
```

  - In `AppointmentPanel.tsx`, keep the refund lines' state keyed by step, as the "tell" choice is:

```tsx
  const refundDefaults = (): CancelRefunds => ({ online: String(booking?.money?.refundable_online ?? 0), desk: String(booking?.money?.refundable_desk ?? 0), deskMethod: 'cash' })
  const [refundChoice, setRefundChoice] = useState<{ key: string; value: CancelRefunds } | null>(null)
  const refunds = refundChoice !== null && refundChoice.key === tellKey ? refundChoice.value : refundDefaults()
```

  - Pass `canManage={canManage} refunds={refunds} onRefunds={(value) => setRefundChoice({ key: tellKey, value })}`
    to `ActionConfirm`.
  - In `act`, for `cancel` with `canManage`, add to the body:

```tsx
        ...(action === 'cancel' && canManage ? { refunds: [
          { via: 'online_card' as const, amount: Number(refunds.online) || 0 },
          { via: refunds.deskMethod, amount: Number(refunds.desk) || 0 },
        ].filter(r => r.amount > 0) } : {}),
```

- [ ] **Step 6: The price.** In `CreateForm.tsx`:
  - add the props `quote?: PriceQuote; coupons: CouponOption[]; onResolveCode: (code: string) => Promise<void>`;
  - import `useState`;
  - replace the price line of the summary `dl` with:

```tsx
          {p.quote ? (
            <>
              {p.quote.discount && <div className="flex justify-between"><dt className="text-a-text-2">{t('appointments.money.price.list', 'List price')}</dt><dd className="text-a-text">{money(p.quote.list_amount, p.quote.currency)}</dd></div>}
              {p.quote.discount && <div className="flex justify-between"><dt className="text-a-text-2">{p.quote.discount.label}</dt><dd className="text-a-text">−{money(p.quote.discount.amount, p.quote.currency)}</dd></div>}
              <div className="flex justify-between"><dt className="text-a-text-2">{t('appointments.money.price.total', 'Total')}</dt><dd className="font-semibold text-a-text">{money(p.quote.total_amount, p.quote.currency)}</dd></div>
            </>
          ) : (
            <div className="flex justify-between"><dt className="text-a-text-2">{t('appointments.panel.price', 'Price')}</dt><dd className="font-semibold text-a-text">{money(p.slots.price, p.slots.currency)}</dd></div>
          )}
```

    If the existing price line uses different markup, keep its look and only branch on `p.quote`. Ledger it.
  - Below the summary, for a member client:

```tsx
      {draft.client?.member && (
        <Field label={t('appointments.money.price.coupon', 'Coupon')}>
          <select className={control} value={draft.coupon ? JSON.stringify(draft.coupon) : ''} onChange={(e) => p.onEdit({ coupon: e.target.value ? JSON.parse(e.target.value) : null })}>
            <option value="">{t('appointments.money.price.none', 'No coupon')}</option>
            {p.coupons.map(c => <option key={JSON.stringify(c.coupon)} value={JSON.stringify(c.coupon)}>{c.label}</option>)}
          </select>
          <CouponCode onResolve={p.onResolveCode} />
        </Field>
      )}
```

  - Add the small `CouponCode` component in the same file:

```tsx
function CouponCode({ onResolve }: { onResolve: (code: string) => Promise<void> }) {
  const { t } = useTranslation()
  const [code, setCode] = useState('')
  return (
    <div className="mt-2 flex gap-2">
      <input className={control} placeholder={t('appointments.money.price.code', 'Code')} value={code} onChange={(e) => setCode(e.target.value)} />
      <Button type="button" variant="secondary" disabled={code.trim() === ''} onClick={() => { void onResolve(code.trim()).then(() => setCode('')) }}>{t('appointments.money.price.apply', 'Apply')}</Button>
    </div>
  )
}
```

  - In `AppointmentPanel.tsx`:
    - the quote and the coupons queries:

```tsx
  const quoteParams = draft && draft.client && draft.serviceId !== null && draft.masterId !== null && draft.time !== null
    ? { client_id: draft.client.id, service_id: draft.serviceId, master_id: draft.masterId, start: makeWall(draft.date, minutesOf(draft.time)), coupon: draft.coupon }
    : null
  const quote = useQuery({ queryKey: ['appointments', 'quote', quoteParams], queryFn: () => appointmentsApi.quote(quoteParams!), enabled: quoteParams !== null, retry: false })
  const coupons = useQuery({ queryKey: ['appointments', 'coupons', draft?.client?.id ?? null], queryFn: () => appointmentsApi.coupons(draft!.client!.id), enabled: !!draft?.client?.member })
  const resolveCode = async (code: string) => {
    if (!draft?.client) return
    try {
      const { coupon } = await appointmentsApi.resolveCoupon(draft.client.id, code)
      void queryClient.invalidateQueries({ queryKey: ['appointments', 'coupons'] })
      dispatch({ type: 'edit', patch: { coupon: coupon.coupon }, key: newKey() })
    } catch (e) {
      const f = failureOf(e)
      dispatch({ type: 'failed', error: { code: f.code, message: f.message } })
    }
  }
```

    - import `makeWall` and `minutesOf` from `'../lib/wallClock'`;
    - pass `quote={quote.data} coupons={coupons.data?.coupons ?? []} onResolveCode={resolveCode}` to `CreateForm`;
    - in `save`, send `...(quote.data ? { expected_total: quote.data.total_amount } : {})`;
    - on a `price_changed` failure, run `void queryClient.invalidateQueries({ queryKey: ['appointments', 'quote'] })`.
  - Existing tests that render `CreateForm` or `ActionConfirm` gain the new props (`quote={undefined} coupons={[]}
    onResolveCode={async () => {}}` and `canManage={false} refunds={{ online: '0', desk: '0', deskMethod: 'cash' }}
    onRefunds={() => {}}`). Ledger each.

- [ ] **Step 7: Run them.**
  - Run: `bash .superpowers/sdd/2026-09-30-appointments-workspace/tools/fe.sh`
  - Expected: vitest PASS (4 new), tsc 0, eslint 0.

- [ ] **Step 8: Commit** with the subject "Refund while cancelling, and show the member price on New appointment":

```bash
git add frontend/src/appointments/lib/types.ts frontend/src/appointments/lib/api.ts frontend/src/appointments/panel/ActionConfirm.tsx frontend/src/appointments/panel/AppointmentPanel.tsx frontend/src/appointments/panel/CreateForm.tsx frontend/src/appointments/panel/panelState.ts frontend/src/appointments/panel/cancelAndPrice.test.tsx
git commit -F <ws>/tools/commit-9.txt
```

  Also `git add` each existing test file Step 6 changed.

---

### Task 10: Takings in the workspace

**Files:**
- Create: `frontend/src/appointments/takings/TakingsPage.tsx`
- Modify: `frontend/src/appointments/lib/types.ts`, `lib/api.ts`, `AppointmentsApp.tsx`, `AppointmentsShell.tsx`
- Test: `frontend/src/appointments/takings/takings.test.tsx`

**Interfaces:**
- Consumes: `GET takings?date` (Task 6), the bootstrap `staff.can_manage` (Task 2)
- Produces: types `Takings`, `TakingsRow`; `appointmentsApi.takings(date)`; route `/appointments/takings`; a menu item
  for managers.

- [ ] **Step 1: Write the failing test** `frontend/src/appointments/takings/takings.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Takings } from '../lib/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en' },
  }),
}))

const { TakingsView } = await import('./TakingsPage')

const day: Takings = {
  date: '2026-10-05',
  totals: { EUR: { cash: { in: 60, out: 5 }, card_desk: { in: 45, out: 0 }, transfer: { in: 0, out: 0 }, other: { in: 0, out: 0 }, online_card: { in: 0, out: 0 } } },
  rows: [{ id: 1, kind: 'payment', method: 'cash', amount: 60, currency: 'EUR', note: null, by: 'Mara', at: '2026-10-05T06:00:00+00:00', reference: 'SVC-1', client: 'Sophie' }],
  online: { EUR: 120 },
}

describe('Takings', () => {
  it('totals each method in and out, lists every movement, and shows what was paid online', () => {
    const html = renderToStaticMarkup(<TakingsView data={day} locale="en" zone="Europe/Riga" />)
    expect(html).toContain('Cash')
    expect(html).toContain('Card at the desk')
    expect(html).toContain('SVC-1')
    expect(html).toContain('Sophie')
    expect(html).toContain('Paid online for this day')
    expect(html).not.toContain('Bank transfer') // methods with nothing that day are left out
  })

  it('says so when nothing was recorded', () => {
    expect(renderToStaticMarkup(<TakingsView data={{ ...day, totals: {}, rows: [], online: {} }} locale="en" zone="UTC" />)).toContain('No money was recorded on this day.')
  })
})
```

- [ ] **Step 2: Run it.**
  - Run: `bash .superpowers/sdd/2026-09-30-appointments-workspace/tools/fe.sh src/appointments/takings/takings.test.tsx`
  - Expected: FAIL — `Failed to load url ./TakingsPage`.

- [ ] **Step 3: Types and API.** In `lib/types.ts`:

```ts
export interface TakingsRow extends MoneyMovement { reference: string | null; client: string | null }
export interface Takings {
  date: DateKey
  totals: Record<string, Record<RefundVia, { in: number; out: number }>>
  rows: TakingsRow[]
  online: Record<string, number>
}
```

  In `lib/api.ts`, import `Takings` and add:

```ts
  takings: (date: DateKey): Promise<Takings> => watched(api.get(`${BASE}/takings`, { params: { date } })),
```

- [ ] **Step 4: The page** `frontend/src/appointments/takings/TakingsPage.tsx`:

```tsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { money as fmt } from '../../lib/money'
import { useBoot } from '../AppointmentsProvider'
import { appointmentsApi } from '../lib/api'
import type { DateKey, RefundVia, Takings } from '../lib/types'
import { formatInstant } from '../lib/wallClock'
import { METHOD_FALLBACK } from '../panel/moneyLines'
import { Field } from '../ui/Field'
import { Notice } from '../ui/Notice'

const METHODS: RefundVia[] = ['cash', 'card_desk', 'transfer', 'other', 'online_card']

/** One day's takings for cashing up (Part E, managers only; the server refuses everyone else). */
export function TakingsPage() {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const [date, setDate] = useState<DateKey>(boot.venue.today)
  const q = useQuery({ queryKey: ['appointments', 'takings', date], queryFn: () => appointmentsApi.takings(date) })

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <h1 className="text-xl font-semibold text-a-text">{t('appointments.takings.title', 'Takings')}</h1>
      <Field label={t('appointments.takings.day', 'Day')}>
        <input type="date" className="rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text" value={date} onChange={(e) => { if (e.target.value) setDate(e.target.value) }} />
      </Field>
      {q.isError && <Notice tone="danger">{t('appointments.common.error', 'Something went wrong. Please try again.')}</Notice>}
      {q.data && <TakingsView data={q.data} locale={i18n.language || 'en'} zone={boot.venue.timezone} />}
    </div>
  )
}

export function TakingsView({ data, locale, zone }: { data: Takings; locale: string; zone: string }) {
  const { t } = useTranslation()
  const currencies = Object.keys(data.totals)

  if (data.rows.length === 0 && Object.keys(data.online).length === 0) {
    return <p className="text-sm text-a-text-2">{t('appointments.takings.none', 'No money was recorded on this day.')}</p>
  }

  return (
    <div className="space-y-4 text-sm">
      {currencies.map(cur => (
        <table key={cur} className="w-full max-w-xl">
          <thead><tr className="text-left text-a-text-2"><th className="py-1">{t('appointments.takings.method', 'Method')}</th><th className="text-right">{t('appointments.takings.in', 'In')}</th><th className="text-right">{t('appointments.takings.out', 'Out')}</th><th className="text-right">{t('appointments.takings.net', 'Net')}</th></tr></thead>
          <tbody>
            {METHODS.filter(m => data.totals[cur][m].in > 0 || data.totals[cur][m].out > 0).map(m => (
              <tr key={m} className="border-t border-a-border">
                <td className="py-1 text-a-text">{t(`appointments.money.method.${m}`, METHOD_FALLBACK[m])}</td>
                <td className="text-right">{fmt(data.totals[cur][m].in, cur)}</td>
                <td className="text-right">{fmt(data.totals[cur][m].out, cur)}</td>
                <td className="text-right font-semibold">{fmt(data.totals[cur][m].in - data.totals[cur][m].out, cur)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
      {Object.entries(data.online).map(([cur, amount]) => (
        <p key={cur} className="text-a-text-2">{t('appointments.takings.online', "Paid online for this day's appointments: {{amount}}", { amount: fmt(amount, cur) })}</p>
      ))}
      {data.rows.length > 0 && (
        <ol className="space-y-1">
          {data.rows.map(r => (
            <li key={r.id} className="flex flex-wrap gap-x-3 border-t border-a-border pt-1 text-a-text-2">
              {r.at && <time dateTime={r.at}>{formatInstant(r.at, locale, zone)}</time>}
              <span className="text-a-text">{r.client ?? '—'}</span>
              <span>{r.reference}</span>
              <span>{t(`appointments.money.kind.${r.kind}`, r.kind === 'payment' ? 'Payment' : 'Refund')}</span>
              <span>{t(`appointments.money.method.${r.method}`, METHOD_FALLBACK[r.method])}</span>
              <span className="font-semibold text-a-text">{r.kind === 'refund' ? '−' : ''}{fmt(r.amount, r.currency)}</span>
              {r.by && <span>{r.by}</span>}
              {r.note && <span className="w-full">{r.note}</span>}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Route and menu.**
  - In `AppointmentsApp.tsx`, import `TakingsPage` and add `<Route path="takings" element={<TakingsPage />} />` after
    the setup route.
  - In `AppointmentsShell.tsx`, import `Wallet` from `lucide-react`.
  - Build `nav` with the item for managers only (`data` is the bootstrap answer there; if the shell names it
    differently, use that name and ledger it):

```tsx
    ...(data?.staff.can_manage ? [{ to: '/appointments/takings', end: false, icon: Wallet, label: t('appointments.nav.takings', 'Takings') }] : []),
```

    placed before the Setup item.

- [ ] **Step 6: Run them.**
  - Run: `bash .superpowers/sdd/2026-09-30-appointments-workspace/tools/fe.sh`
  - Expected: vitest PASS (2 new; `AppointmentsShell.test.tsx` still passes), tsc 0, eslint 0.

- [ ] **Step 7: Commit** with the subject "Show managers a day's takings in the workspace":

```bash
git add frontend/src/appointments/takings/TakingsPage.tsx frontend/src/appointments/takings/takings.test.tsx frontend/src/appointments/lib/types.ts frontend/src/appointments/lib/api.ts frontend/src/appointments/AppointmentsApp.tsx frontend/src/appointments/AppointmentsShell.tsx
git commit -F <ws>/tools/commit-10.txt
```

---

### Task 11: The full admin shows the money

**Files:**
- Create: `frontend/src/components/DeskMoney.tsx`
- Modify: `frontend/src/pages/ServiceBookings.tsx`, five `frontend/src/i18n/locales/<lang>/common.json`
- Test: `frontend/src/components/deskMoney.test.tsx`

**Interfaces:**
- Consumes: the full admin detail `money` (Task 7); `<ws>/tools/add-parte-strings.cjs admin`
- Produces: `DeskMoney({ money, bookingId })`; the drawer without its payment select; the bulk bar without "Mark
  Paid".

- [ ] **Step 1: The strings.** Run `node <ws>/tools/add-parte-strings.cjs admin`.
  Expected: five "desk_money added" lines.

- [ ] **Step 2: Write the failing test** `frontend/src/components/deskMoney.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, fallback: string, vars?: Record<string, unknown>) => fallback.replace(/\{\{(\w+)\}\}/g, (_, n) => String((vars ?? {})[n] ?? '')) }),
}))

const { DeskMoney } = await import('./DeskMoney')

const money = { total: 60, currency: 'EUR', held_online: 0, paid_online: 0, refunded_online: 0, paid_desk: 20, refunded_desk: 0, legacy_marked_paid: false, owed: 40, to_refund: 0, refundable_online: 0, refundable_desk: 20, paid_in: 20, paid_back: 0, can_take: true,
  movements: [{ id: 1, kind: 'payment', method: 'cash', amount: 20, currency: 'EUR', note: null, by: 'Mara', at: '2026-10-05T06:00:00+00:00' }] }

describe('DeskMoney', () => {
  it('shows the money read-only and sends staff to the workspace to take or refund', () => {
    const html = renderToStaticMarkup(<MemoryRouter><DeskMoney money={money as never} bookingId={42} /></MemoryRouter>)
    expect(html).toContain('Paid at the desk')
    expect(html).toContain('Still owed')
    expect(html).toContain('Mara')
    expect(html).toContain('/appointments?open=42')
    expect(html).not.toContain('<input')
  })
})

describe('the Service bookings page', () => {
  it('no longer labels a booking paid', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../pages/ServiceBookings.tsx'), 'utf8')
    expect(src).not.toContain("runBulk('mark_paid')")
    expect(src).not.toMatch(/payment_status: paymentStatus/)
    expect(src).toContain('<DeskMoney')
  })

  it('is said in all five languages', () => {
    for (const lang of ['en', 'ru', 'de', 'fr', 'es']) {
      const bundle = JSON.parse(fs.readFileSync(path.resolve(__dirname, `../i18n/locales/${lang}/common.json`), 'utf8'))
      expect(Object.keys(bundle.desk_money.method).sort(), lang).toEqual(['card_desk', 'cash', 'online_card', 'other', 'transfer'])
    }
  })
})
```

- [ ] **Step 3: Run it.**
  - Run: `cd frontend && npx vitest run src/components/deskMoney.test.tsx`
  - Expected: FAIL — `Failed to load url ./DeskMoney`.

- [ ] **Step 4: The component** `frontend/src/components/DeskMoney.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { money as fmt } from '../lib/money'
import type { MoneyInfo } from '../appointments/lib/types'

const METHOD: Record<string, string> = { cash: 'Cash', card_desk: 'Card at the desk', transfer: 'Bank transfer', other: 'Other', online_card: 'Card, through Stripe' }

/** The full admin's read-only view of an appointment's money (Part E); taking and refunding live in the workspace. */
export function DeskMoney({ money: m, bookingId }: { money: MoneyInfo; bookingId: number }) {
  const { t } = useTranslation()
  const row = (label: string, amount: number) => (
    <div className="flex justify-between"><span className="text-gray-400">{label}</span><span className="text-white">{fmt(amount, m.currency)}</span></div>
  )

  return (
    <div className="space-y-2 text-xs">
      <p className="text-xs font-semibold text-gray-300">{t('desk_money.title', 'Money')}</p>
      {m.held_online > 0 && row(t('desk_money.held_online', 'Card held online'), m.held_online)}
      {m.paid_online > 0 && row(t('desk_money.paid_online', 'Paid online by card'), m.paid_online)}
      {m.paid_desk > 0 && row(t('desk_money.paid_desk', 'Paid at the desk'), m.paid_desk)}
      {m.paid_back > 0 && row(t('desk_money.refunded', 'Refunded'), m.paid_back)}
      {m.owed > 0 && row(t('desk_money.owed', 'Still owed'), m.owed)}
      {m.to_refund > 0 && row(t('desk_money.to_refund', 'To refund'), m.to_refund)}
      {m.legacy_marked_paid && <p className="text-gray-400">{t('desk_money.legacy', 'Marked paid (no amount recorded)')}</p>}
      {m.movements.map(mv => (
        <p key={mv.id} className="text-gray-400">
          {t(`desk_money.kind.${mv.kind}`, mv.kind === 'payment' ? 'Payment' : 'Refund')} · {fmt(mv.amount, mv.currency)} · {t(`desk_money.method.${mv.method}`, METHOD[mv.method] ?? mv.method)}{mv.by ? ` · ${mv.by}` : ''}{mv.note ? ` · ${mv.note}` : ''}
        </p>
      ))}
      <Link to={`/appointments?open=${bookingId}`} className="inline-block text-emerald-400 hover:text-emerald-300 font-semibold">{t('desk_money.open', 'Take payment / Refund in HexaTech Appointments')}</Link>
    </div>
  )
}
```

- [ ] **Step 5: The page.** In `ServiceBookings.tsx`:
  - import `DeskMoney`;
  - in the bulk bar, delete the "Mark Paid" button (the `runBulk('mark_paid')` button, including its icon and text). If
    `CheckCheck` is then unused, remove it from the `lucide-react` import;
  - in `BookingDetailDrawer`:
    - delete the `paymentStatus` state, the Payment `<select>` and its label wrapper;
    - in `save`'s body, delete `payment_status: paymentStatus,`;
    - render `{detail?.money && <DeskMoney money={detail.money} bookingId={booking.id} />}` above the status field;
  - the page's list filter on payment status (line ~380) and the table's payment badge stay: they only read.

- [ ] **Step 6: Run them.**
  - Run: `cd frontend && npx vitest run src/components/deskMoney.test.tsx src/components/tellClient.test.tsx && npx tsc -b && npx eslint src/components/DeskMoney.tsx src/components/deskMoney.test.tsx src/pages/ServiceBookings.tsx`
  - Expected:
    - vitest PASS (3 new, and Part D's `tellClient` test still passes);
    - tsc 0;
    - eslint: `ServiceBookings.tsx` has no findings beyond its 19 existing ones, and the new files are clean.

- [ ] **Step 7: Commit** with the subject "Show the money in the full admin and drop its paid label":

```bash
git add frontend/src/components/DeskMoney.tsx frontend/src/components/deskMoney.test.tsx frontend/src/pages/ServiceBookings.tsx frontend/src/i18n/locales/en/common.json frontend/src/i18n/locales/ru/common.json frontend/src/i18n/locales/de/common.json frontend/src/i18n/locales/fr/common.json frontend/src/i18n/locales/es/common.json
git commit -F <ws>/tools/commit-11.txt
```

---

### Task 12: The runbook, the whole branch and the browser

**Files:**
- Modify: `docs/appointments-workspace.md`

- [ ] **Step 1: The runbook.** In `docs/appointments-workspace.md`:
  - **The actions table** ("What each action really does"):
    - the "Mark paid at venue" row is replaced by a "Take payment" row: "A ledger row (amount, method, who, when); the
      label follows what is owed. Can't: take more than is owed, or take while a card is held online.";
    - a "Refund (managers)" row is added: "Card through Stripe (exact amount, idempotent) or money back at the desk,
      with a reason; a full refund takes the visit's points back. Can't: refund more than came in that way.";
    - the Cancel row's "Refund a captured payment — nothing does" becomes "A manager refunds in the same step (Stripe
      first; a failed refund leaves it standing)."
  - **A new section, "Money at the desk (Part E, 2026-10-06)",** before "Deploying it":
    - the methods;
    - who may do what;
    - what is owed (R1);
    - the label rules;
    - cancel with refund;
    - points;
    - member price and coupons;
    - Takings;
    - the full admin's read-only drawer;
    - the code (`app/Services/Appointments/Money/…`, `MoneyController`, `PriceController`) and the tests
      (`tests/Feature/Appointments/Money/`).
  - **"What this milestone does not do":**
    - drop "staff refunds and a real desk-payment record";
    - drop "member price or coupons at a staff booking";
    - add "no-show and late-cancel fees, tips, receipts".
  - **"Deploying it" gains:**
    - (Part E) one additive migration (`service_booking_payments`);
    - "Mark paid at venue" becomes Take payment / Refund;
    - staff bookings for members get the member price;
    - the full admin loses its Payment dropdown and bulk "Mark Paid", and its status endpoint refuses
      `payment_status`.
  - **Commit** with the subject "Document money at the desk":

```bash
git add docs/appointments-workspace.md
git commit -F <ws>/tools/commit-12.txt
```

- [ ] **Step 2: The whole branch, backend.** Run `bash <ws>/tools/suite-by-dir.sh after` (in the background).
  - Expected: every group `exit=0`, as in the baseline, plus the new `tests/Feature/Appointments` tests.

- [ ] **Step 3: The whole branch, frontend.** Run `cd frontend && npx vitest run` and `npx tsc -b`.
  - Expected: only the known failures (3 `plannerMeta`, `bookingSheet`); tsc 0.

- [ ] **Step 4: The browser** (local; the owner's standing ruling for local checks: create the new table for the
  check and drop it afterwards; use and never drop it if it already exists).
  - **Setup:**
    - Run `php artisan tinker --execute="echo Illuminate\Support\Facades\Schema::hasTable('service_booking_payments') ? 'there' : 'absent';"`.
    - If it prints `absent`, run
      `php artisan tinker --execute="(require 'database/migrations/2026_10_06_100000_create_service_booking_payments.php')->up();"`.
    - Start the two servers as in Part D (`artisan serve` on 8010 with `MAIL_MAILER=log`, `QUEUE_CONNECTION=sync`;
      vite on 5180).
    - Sign in as the tester (manager: `appointments-tester@example.test`, password in
      `.superpowers/sdd/2026-09-30-appointments-workspace/task-14-brief.md`, not echoed).
  - **Check:**
    - an unpaid appointment shows Money with "Still owed"; Take payment €20 cash, then the rest by card at the
      desk; the label becomes paid and both rows show who;
    - Refund €10 cash with a reason: "Refunded €10", status partially refunded;
    - Cancel a paid appointment: the refund lines are filled; confirm; the appointment is cancelled with the refund
      row;
    - a non-manager (`setup-staff@example.test`) sees no Refund button, no Takings menu, and on Cancel "a manager can
      refund it";
    - New appointment for a member client shows the member discount and a coupon list; the save stores the total;
    - Takings for today lists the movements and totals per method;
    - the full admin's drawer shows Money read-only with the link; the Payment select and the bulk "Mark Paid" are
      gone;
    - at 390 px, the Money block, the forms and Takings wrap without sideways scroll.
  - **Afterwards:**
    - drop the table if this check created it
      (`php artisan tinker --execute="Illuminate\Support\Facades\Schema::dropIfExists('service_booking_payments');"`);
    - stop the servers;
    - ledger what was seen (screenshots `.superpowers/shots/appointments/partE-*.png` in the main checkout).
  - A Stripe refund cannot be tried locally (no real PaymentIntent). It is proven by Task 3's tests and on production
    by the owner.

- [ ] **Step 5: Done.** All twelve tasks are complete in the ledger. Hand over to the final whole-branch review.
