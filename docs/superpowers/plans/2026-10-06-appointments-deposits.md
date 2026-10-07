# Appointments Part H — Deposits for Online Bookings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A venue can ask clients who book on its online booking page for a card deposit that goes back automatically when they cancel in time and is kept on a late cancellation or a no-show.

**Architecture:** One small domain class, `App\Services\Appointments\Money\Deposits`, owns the terms: the amount, the switch, whether Stripe can take one, and the refund deadline from the booking's own `meta.deposit`. The booking page's existing API (`ServicePublicController`) creates, checks and charges the deposit intent. Part E's ledger records the money (`payment` / `online_card` / "Deposit"), so every money screen counts it with no special case. `DepositRule` runs on every staff cancellation: in time it refunds through Part E's `refundInLock`, late it keeps. The booking page gets its deposit step only inside Blade `@if ($deposit)` blocks, so every venue without deposits gets a byte-identical page.

**Tech Stack:** Laravel 13 / PHP 8.4, PostgreSQL (SQLite in tests), Stripe PHP SDK (mocked with Mockery in tests), Stripe.js Payment Element on the Blade booking page, React 19 + TanStack Query + i18next for the workspace, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-06-appointments-deposits-design.md` (approved by the owner 2026-10-06, "it is ok lets proceed").

## Global Constraints

- Deposits stay off at every venue until a manager switches them on. The deploy changes nothing for clients (spec §11).
- With deposits off, the booking page's rendered output is byte-identical to today's; a test compares it with a fixture recorded before any Blade change (spec §4.2).
- deposit = round(quoted total × percent ÷ 100, 2). The quoted total includes extras (`list_total`). The server works it out in `quote()`, `paymentIntent()` and `confirm()`; the page never sends an amount (spec §4.3).
- No deposit for a free service or one below Stripe's minimum, 0.50 in the venue currency (spec §4.2).
- Percent 1–100. Switching on from Setup with the untouched stored default (100) proposes 20% (spec §4.1).
- Deposits can be switched on only when Stripe is connected (`booking_payment_enabled` true and a secret key) and the venue's currency equals `stripe_currency`. Otherwise the answer is 422 `deposits_unavailable` (spec §4.1, §8).
- The booking keeps its terms in `meta.deposit = { amount, percent, cancel_hours }`. The refund deadline is `AppointmentClock::toInstant(start_at) − cancel_hours`, in real hours, from the visit's current start. Exactly at the deadline is in time (spec §5.2, §7).
- The deposit is a ledger row (`kind` payment, `method` online_card, `note` "Deposit"). The booking is never marked `paid` because a deposit came in; the label follows Part E's `statusFor` (spec §5.1, §5.3).
- Refusals: 422 `deposit_mismatch` (confirm), 422 `deposit_refund_failed` (nothing cancelled), 422 `deposits_unavailable` (Setup), and `deposit_required` with the booking page link (chat) (spec §8).
- Staff-facing words go in five languages (en, ru, de, fr, es). The client's cancellation email (Part D) is in five languages already and its deposit line is too. The booking page and `ServiceBookingConfirmationMail` are English-only today and stay so (see Rulings below).
- No migration. No saved cards, no fee beyond the deposit, no deposits for member-portal or staff bookings, no payment links, no per-service amounts, no client self-cancellation from the booking page (spec §10).
- PHP is always `/c/wamp64/bin/php/php8.4.20/php.exe`. Never run a bare `php artisan test`; run it by file or directory and read the `Tests:` line. Never `artisan migrate` locally (the local PostgreSQL is shared). Run `artisan view:clear` after every Blade change.
- Frontend: `cd frontend && npx tsc -b && npx vitest run` (3 `plannerMeta` failures are pre-existing). Never commit `frontend/dist`, `public/spa` or `resources/spa-shell` from this branch.
- Edit files with the Edit tool, not `sed` or `python -c` (CRLF hazards). Stage files by name. Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Work in `C:\wamp64\www\Hexa-Tech-appointments` on `feature/appointments-workspace`. Every path below is relative to it.

## Plan-level rulings (decided while writing the plan; the executor carries them)

1. **The booking page stays English.** It has no dictionary today (its words are English plus the industry vocabulary), and the spec's five-language rule covers staff and client messages that already have dictionaries. The deposit step's words are English, like the rest of the page. Cost if wrong: a later pass adds a dictionary to the page.
2. **The member portal's cancel of a booking-page deposit booking honours that booking's terms.** `MemberBookingQuery` lists booking-page bookings made with the member's email, so a member can cancel one. `CancellationPolicy::forService` takes the deadline from `meta.deposit.cancel_hours`, and `ServiceBookingRefund::giveBack` reports the deposit rather than the whole price. Portal bookings themselves never carry `meta.deposit`, so they are unchanged. The portal keeps its own strict "before the deadline" (`<`); staff cancels use "at or before" (`<=`). Cost if wrong: one second's difference at the deadline.
3. **A manager who names a card refund on the cancel sheet decides the card refund.** In that case the automatic deposit refund is skipped, so a deposit is never refunded twice and Stripe is never called after a refund that already went through. Cost if wrong: a manager who types less than the deposit in time refunds less than the rule would.
4. **A deposit still only held (capture pending) is not touched at cancel time.** The capture job releases it when the booking was cancelled in time, and captures and keeps it otherwise (spec §5.4). The cancel itself never fails on Stripe in that case. Cost if wrong: the hold lingers up to 10 minutes.
5. **The chat decides "a deposit is due" from the service's list price**, before a slot is reserved. Cost if wrong: a team member with a price of 0 on a paid service is sent to the page needlessly.
6. **The cancel sheet's card refund line starts at 0 for a deposit booking** (Part E prefilled it with the whole refundable amount). The line is still offered, as goodwill for a late cancellation (spec §6.2), but a manager pressing Cancel never gives back a kept deposit by accident.
7. **A capture-job edge:** a deposit charged at Stripe whose booking was cancelled in time before the charge was recorded is recorded and then flagged with the existing `service_booking.capture.needs_refund` audit row, for a manager's refund. Cost if wrong: a rare deposit waits for a person instead of going back by itself.

## Review Focus

1. **A client goes Back from the deposit step and picks another time or other extras.** The intent made for the first choice must not book the second; `confirm()` refuses it (`deposit_mismatch`) and releases it, and the page asks for a new intent every time it enters the step. Test: Task 2 `test_a_deposit_for_another_time_is_refused_and_released`.
2. **A venue east of UTC, exactly at the deadline.** At 10:00 Riga time (07:00 UTC) for a visit 24 hours later, the cancel is in time; one second later it is late. Tests: Task 1 `test_exactly_at_the_deadline_is_in_time_on_the_venues_clock`, Task 5 `test_the_line_turns_from_goes_back_to_kept_one_second_after_the_deadline_in_riga`.
3. **The same deposit intent sent twice** (double tap, a second tab). The second answer is 409 "already used", and the intent is never cancelled: it pays the first booking. Test: Task 2 `test_the_same_deposit_books_once_and_its_payment_is_never_released`.
4. **The price changes between the card form and confirm.** A service repriced in between makes the deposit wrong. It is refused (`deposit_mismatch`), the hold is released, and nothing is booked. Test: Task 2 `test_a_deposit_for_another_amount_is_refused_and_released`.
5. **A bulk cancel in the full admin where Stripe refuses one deposit refund.** The other bookings are cancelled, the refused one stays as it was, and the answer names it. Test: Task 5 `test_a_bulk_cancel_keeps_only_the_booking_whose_refund_was_refused`.

## File map

| File | Responsibility | Task |
|---|---|---|
| `app/Services/Appointments/Money/Deposits.php` (new) | The terms: amount, switch, availability, deadline, client/staff views, booking page URL | 1, 2, 3, 7 |
| `app/Services/Appointments/Money/DepositRefused.php` (new) | `deposit_required` / `deposit_mismatch` from `confirm()` | 2 |
| `app/Services/Appointments/Money/DepositRule.php` (new) | What a cancellation does to a deposit | 5 |
| `app/Services/Appointments/Money/AppointmentMoney.php` | Ledger counts online deposit rows; `recordDeposit()` | 1 |
| `app/Services/Appointments/AppointmentPresenter.php` | `deposit_paid` payment state | 1 |
| `app/Services/Appointments/Money/TakingsReport.php` | A deposit counted once (ledger), not again as "paid online" | 1 |
| `app/Http/Controllers/Api/V1/ServicePublicController.php` | quote / payment-intent / confirm / capture / email | 2 |
| `app/Mail/ServiceBookingConfirmationMail.php`, `resources/views/emails/service-booking-confirmation.blade.php` | Deposit line in the booking email | 2 |
| `routes/web.php`, `resources/views/services-widget.blade.php` | The deposit step on the page | 3 |
| `app/Console/Commands/CapturePendingPaymentIntents.php` | Delayed capture of a deposit | 4 |
| `app/Services/Booking/PortalPaymentIntentGuard.php`, `app/Console/Commands/ReleaseOrphanPortalHolds.php` | Abandoned deposits released | 4 |
| `app/Services/Appointments/AppointmentActionRunner.php`, `AppointmentActions.php` | Workspace cancel + consequence codes | 5 |
| `app/Http/Controllers/Api/V1/Admin/ServiceBookingController.php` | Full admin `updateStatus` / `destroy` / `bulk` | 5 |
| `app/Services/Booking/CancellationPolicy.php`, `ServiceBookingRefund.php` | Portal honours the booking's terms | 5 |
| `app/Mail/AppointmentMessageMail.php`, `resources/views/emails/appointment-message.blade.php`, `lang/{en,ru,de,fr,es}/client_messages.php` | Cancellation email deposit line | 6 |
| `app/Http/Controllers/Api/V1/Widget/WidgetChatController.php`, `public/widget/hotel-chat.js` | Chat sends deposit bookings to the page | 7 |
| `app/Services/Booking/Setup/BookingRules.php`, `app/Http/Controllers/Api/V1/Admin/Appointments/SetupSettingsController.php` | Setup switch + percent + guard | 8 |
| `frontend/src/appointments/**`, `frontend/src/components/settings/BookingTab.tsx`, `frontend/src/pages/ServiceBookings.tsx` | Screens and words | 9 |
| `docs/appointments-workspace.md` | Owner runbook section | 10 |
| `tests/Concerns/TakesDeposits.php` (new) | Test helpers | 1 |

Task dependencies: 1 → everything; 2 → 3, 4; 5 → 6, 9; 8 → 9.

---

### Task 1: Deposit terms and the money they make

**Files:**
- Create: `app/Services/Appointments/Money/Deposits.php`
- Create: `tests/Concerns/TakesDeposits.php`
- Modify: `app/Services/Appointments/Money/AppointmentMoney.php` (`settle()` 209-224, `summary()` 227-233, `amountsFrom()` 289-336, new `recordDeposit()`)
- Modify: `app/Services/Appointments/AppointmentPresenter.php` (`paymentState()` ~47-63)
- Modify: `app/Services/Appointments/Money/TakingsReport.php:40-45`
- Test: `tests/Feature/Appointments/Money/DepositTermsTest.php`, `tests/Feature/Appointments/Money/DepositMoneyTest.php`

**Interfaces:**
- Consumes: `PortalBootstrap::paymentMode(string $currency): array{mode, reason}`, `AppointmentClock::toInstant()/zoneFor()`, `HotelSetting::getValue()`, Part E's `AppointmentMoney`.
- Produces (later tasks rely on these exact names):
  - `Deposits::KIND = 'service_deposit'`, `Deposits::SOURCE = 'services_widget'`, `Deposits::MINIMUM = 0.50`, `Deposits::PROPOSED_PERCENT = 20`
  - `Deposits::amountFor(float $total, int $percent): ?float`
  - `Deposits::switchedOn(): bool`, `Deposits::percent(): int`, `Deposits::cancelHours(): int` (bound organisation)
  - `Deposits::unavailableReason(string $currency): ?string` (`payments_off` | `mock_mode` | `currency_mismatch` | null)
  - `Deposits::onlineNow(string $currency): bool`
  - `Deposits::termsFor(float $total, string $currency): ?array{amount: float, percent: int, cancel_hours: int, currency: string}`
  - `Deposits::of(ServiceBooking $b): ?array{amount: float, percent: int, cancel_hours: int}`
  - `Deposits::refundUntil(ServiceBooking $b): ?CarbonImmutable` (UTC instant)
  - `Deposits::inTime(ServiceBooking $b, \DateTimeInterface $when): bool`
  - `Deposits::untilText(ServiceBooking $b): ?string` ("Mon 5 Oct 2026, 10:00" on the venue's clock)
  - `Deposits::forClient(ServiceBooking $b): ?array{amount, currency, percent, cancel_hours, refund_until: ?string}`
  - `Deposits::forStaff(ServiceBooking $b): ?array{amount, percent, cancel_hours, refund_until: ?string (ISO instant)}`
  - `AppointmentMoney::recordDeposit(ServiceBooking $b, ?User $actor = null): void`
  - `AppointmentMoney::summary()` gains the key `deposit` (= `Deposits::forStaff()`)
  - `AppointmentPresenter::paymentState()` may return `deposit_paid`
  - Trait `Tests\Concerns\TakesDeposits`: `setSetting()`, `depositsOn()`, `depositsOff()`, `stripeForDeposits()`, `depositIntent()`, `seedDepositBooking()`, `takenDeposit()`

- [ ] **Step 1: Write the test helpers**

Create `tests/Concerns/TakesDeposits.php`:

```php
<?php

namespace Tests\Concerns;

use App\Models\HotelSetting;
use App\Models\ServiceBooking;
use App\Services\Appointments\Money\AppointmentMoney;
use App\Services\StripeService;
use Mockery;
use Stripe\PaymentIntent;

/**
 * Part H: a venue that takes deposits, for a test that also uses
 * SetsUpAppointmentsSchema. Provides its settings, a Stripe that is on in
 * euros (a Mockery mock), deposit intents as Stripe returns them, and
 * booking-page bookings that carry a deposit.
 */
trait TakesDeposits
{
    /** One setting of the test organisation, with the caches its readers keep dropped. */
    protected function setSetting(string $key, string $value): void
    {
        $row = HotelSetting::withoutGlobalScopes()->firstOrNew(['organization_id' => $this->org->id, 'key' => $key]);
        if (!$row->exists) {
            $row->forceFill(['organization_id' => $this->org->id, 'type' => 'string', 'group' => 'booking', 'label' => $key]);
        }
        $row->value = $value;
        $row->save();
        HotelSetting::flushCacheFor($this->org->id);
        app()->forgetScopedInstances();
    }

    protected function depositsOn(int $percent = 20, int $cancelHours = 24): void
    {
        $this->setSetting('services_require_deposit', 'true');
        $this->setSetting('services_deposit_percent', (string) $percent);
        $this->setSetting('services_cancel_hours', (string) $cancelHours);
    }

    protected function depositsOff(): void
    {
        $this->setSetting('services_require_deposit', 'false');
    }

    /** Stripe on, in euros, amounts in cents. Each test adds the calls it expects. */
    protected function stripeForDeposits(): Mockery\MockInterface
    {
        $stripe = Mockery::mock(StripeService::class);
        $stripe->shouldReceive('isEnabled')->andReturn(true)->byDefault();
        $stripe->shouldReceive('currency')->andReturn('eur')->byDefault();
        $stripe->shouldReceive('publishableKey')->andReturn('pk_test_deposits')->byDefault();
        $stripe->shouldReceive('toSmallestUnit')->andReturnUsing(fn ($amount, $currency = null) => (int) round((float) $amount * 100))->byDefault();
        $this->app->instance(StripeService::class, $stripe);

        return $stripe;
    }

    /** A deposit intent as Stripe returns it: this venue's, for the seeded service tomorrow at 10:00. */
    protected function depositIntent(string $id, float $amount = 12.0, array $meta = [], string $status = 'requires_capture'): PaymentIntent
    {
        $created = now()->subHours(2)->timestamp;

        return PaymentIntent::constructFrom([
            'id' => $id, 'status' => $status, 'amount' => (int) round($amount * 100), 'currency' => 'eur', 'created' => $created,
            'latest_charge' => ['id' => 'ch_' . $id, 'object' => 'charge', 'created' => $created, 'captured' => $status === 'succeeded'],
            'metadata' => array_merge([
                'kind' => 'service_deposit', 'org_id' => (string) $this->org->id, 'service_id' => (string) $this->service->id,
                'start_at' => '2026-10-06T10:00:00+00:00', 'source' => 'services_widget',
            ], $meta),
        ]);
    }

    /** A booking-page booking tomorrow 10:00 whose deposit is still only held on the card (nothing in the ledger yet). */
    protected function seedDepositBooking(array $attrs = [], float $deposit = 12.0, int $cancelHours = 24): ServiceBooking
    {
        return $this->seedBooking(array_merge([
            'source'                   => 'widget',
            'customer_email'           => 'ada@example.test',
            'payment_status'           => 'authorized',
            'stripe_payment_intent_id' => 'pi_dep_' . substr(md5(uniqid('', true)), 0, 10),
            'meta'                     => ['deposit' => ['amount' => $deposit, 'percent' => 20, 'cancel_hours' => $cancelHours]],
        ], $attrs));
    }

    /** The same booking with its deposit charged and recorded. */
    protected function takenDeposit(array $attrs = [], float $deposit = 12.0, int $cancelHours = 24): ServiceBooking
    {
        $b = $this->seedDepositBooking($attrs, $deposit, $cancelHours);
        app(AppointmentMoney::class)->recordDeposit($b);

        return $b->fresh();
    }
}
```

- [ ] **Step 2: Write the failing terms test**

Create `tests/Feature/Appointments/Money/DepositTermsTest.php`:

```php
<?php

namespace Tests\Feature\Appointments\Money;

use App\Services\Appointments\Money\Deposits;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Mockery;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\Concerns\TakesDeposits;
use Tests\TestCase;

class DepositTermsTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema, TakesDeposits;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    public function test_the_deposit_is_the_percent_of_the_price_to_the_cent(): void
    {
        $this->assertSame(12.0, Deposits::amountFor(60, 20));
        $this->assertSame(9.0, Deposits::amountFor(59.99, 15));   // 8.9985
        $this->assertSame(11.0, Deposits::amountFor(33.33, 33));  // 10.9989
        $this->assertSame(60.0, Deposits::amountFor(60, 100));
    }

    public function test_a_free_booking_or_one_below_stripes_minimum_takes_no_deposit(): void
    {
        $this->assertNull(Deposits::amountFor(0, 20));
        $this->assertNull(Deposits::amountFor(2, 20));            // 0.40
        $this->assertSame(0.5, Deposits::amountFor(2.5, 20));
    }

    public function test_terms_need_the_switch_stripe_and_stripes_currency(): void
    {
        $stripe = $this->stripeForDeposits();
        $this->assertNull(Deposits::termsFor(60, 'EUR'), 'off until a manager switches it on');

        $this->depositsOn(20, 24);
        $this->assertSame(['amount' => 12.0, 'percent' => 20, 'cancel_hours' => 24, 'currency' => 'EUR'], Deposits::termsFor(60, 'eur'));
        $this->assertNull(Deposits::termsFor(60, 'GBP'));
        $this->assertSame('currency_mismatch', Deposits::unavailableReason('GBP'));
        $this->assertNull(Deposits::termsFor(0, 'EUR'));

        $this->setSetting('booking_mock_mode', 'true');
        $this->assertSame('mock_mode', Deposits::unavailableReason('EUR'));
        $this->setSetting('booking_mock_mode', 'false');

        $stripe->shouldReceive('isEnabled')->andReturn(false);
        $this->assertSame('payments_off', Deposits::unavailableReason('EUR'));
        $this->assertNull(Deposits::termsFor(60, 'EUR'));
    }

    public function test_the_deadline_counts_back_from_the_visits_start(): void
    {
        $b = $this->seedDepositBooking(); // tomorrow 10:00, venue on UTC, 24 hours

        $this->assertSame('2026-10-05T10:00:00+00:00', Deposits::refundUntil($b)->toIso8601String());
        $this->assertSame('Mon 5 Oct 2026, 10:00', Deposits::untilText($b));
        $this->assertSame(['amount' => 12.0, 'percent' => 20, 'cancel_hours' => 24], Deposits::of($b));
    }

    public function test_exactly_at_the_deadline_is_in_time_on_the_venues_clock(): void
    {
        $this->setSetting('hotel_timezone', 'Europe/Riga');
        $b = $this->seedDepositBooking(); // 10:00 in Riga = 07:00 UTC

        $this->assertSame('2026-10-05T07:00:00+00:00', Deposits::refundUntil($b)->utc()->toIso8601String());
        $this->assertSame('Mon 5 Oct 2026, 10:00', Deposits::untilText($b));
        $this->assertTrue(Deposits::inTime($b, CarbonImmutable::parse('2026-10-05 07:00:00', 'UTC')));
        $this->assertFalse(Deposits::inTime($b, CarbonImmutable::parse('2026-10-05 07:00:01', 'UTC')));
    }

    public function test_a_booking_without_terms_has_none(): void
    {
        $b = $this->seedBooking();

        $this->assertNull(Deposits::of($b));
        $this->assertNull(Deposits::refundUntil($b));
        $this->assertFalse(Deposits::inTime($b, now()));
        $this->assertNull(Deposits::forClient($b));
    }
}
```

- [ ] **Step 3: Run it and watch it fail**

Run: `cd /c/wamp64/www/Hexa-Tech-appointments && /c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Appointments/Money/DepositTermsTest.php`
Expected: FAIL — `Class "App\Services\Appointments\Money\Deposits" not found`.

- [ ] **Step 4: Write `Deposits`**

Create `app/Services/Appointments/Money/Deposits.php`:

```php
<?php

namespace App\Services\Appointments\Money;

use App\Models\HotelSetting;
use App\Models\ServiceBooking;
use App\Services\Portal\AppointmentClock;
use App\Services\Portal\PortalBootstrap;
use Carbon\CarbonImmutable;

/**
 * Deposits for online bookings (Part H): what a booking made on the booking
 * page pays now, and until when a cancellation gives it back. The venue's
 * settings are the full admin's own (`services_require_deposit`,
 * `services_deposit_percent`, `services_cancel_hours`), read for the bound
 * organisation; a booking keeps the terms it was made on in
 * `meta.deposit`, so changing a setting later never changes a booking
 * already made.
 */
final class Deposits
{
    /** The metadata `kind` of a deposit's payment intent. */
    public const KIND = 'service_deposit';

    /** The metadata `source` of a deposit's payment intent: the booking page. */
    public const SOURCE = 'services_widget';

    /** Stripe's smallest charge, near enough in every currency the venues use (spec §4.2). */
    public const MINIMUM = 0.50;

    /** What Setup proposes when deposits are first switched on (spec §4.1). */
    public const PROPOSED_PERCENT = 20;

    /** Percent of the price, to the cent; null for a free booking or one below Stripe's minimum. */
    public static function amountFor(float $total, int $percent): ?float
    {
        $total = round($total, 2);
        $amount = round($total * max(1, min(100, $percent)) / 100, 2);

        return $total > 0 && $amount >= self::MINIMUM ? $amount : null;
    }

    public static function switchedOn(): bool
    {
        return filter_var(HotelSetting::getValue('services_require_deposit', false), FILTER_VALIDATE_BOOL);
    }

    public static function percent(): int
    {
        return max(1, min(100, (int) HotelSetting::getValue('services_deposit_percent', 100)));
    }

    public static function cancelHours(): int
    {
        return max(0, (int) HotelSetting::getValue('services_cancel_hours', 24));
    }

    /** Why Stripe cannot take a deposit in this currency now — the portal's own payment check — or null when it can. */
    public static function unavailableReason(string $currency): ?string
    {
        return PortalBootstrap::paymentMode($currency)['reason'];
    }

    /** Deposits are switched on and Stripe can take them in this currency now. */
    public static function onlineNow(string $currency): bool
    {
        return self::switchedOn() && self::unavailableReason($currency) === null;
    }

    /**
     * The terms a booking at this price is made on, or null when it takes no
     * deposit: switched off, Stripe unable (off, test mode, another currency),
     * or a price that asks for none.
     *
     * @return array{amount: float, percent: int, cancel_hours: int, currency: string}|null
     */
    public static function termsFor(float $total, string $currency): ?array
    {
        if (!self::onlineNow($currency)) {
            return null;
        }
        $percent = self::percent();
        $amount = self::amountFor($total, $percent);

        return $amount === null ? null : [
            'amount' => $amount, 'percent' => $percent, 'cancel_hours' => self::cancelHours(), 'currency' => strtoupper($currency),
        ];
    }

    /**
     * The booking's own terms, as agreed when it was made; null for every other booking.
     *
     * @return array{amount: float, percent: int, cancel_hours: int}|null
     */
    public static function of(ServiceBooking $b): ?array
    {
        $d = ((array) ($b->meta ?? []))['deposit'] ?? null;
        if (!is_array($d) || !isset($d['amount'])) {
            return null;
        }

        return ['amount' => round((float) $d['amount'], 2), 'percent' => (int) ($d['percent'] ?? 0), 'cancel_hours' => max(0, (int) ($d['cancel_hours'] ?? 0))];
    }

    /** The last moment a cancellation gives the deposit back: the visit's current start, less the agreed hours, in real hours. */
    public static function refundUntil(ServiceBooking $b): ?CarbonImmutable
    {
        $d = self::of($b);
        if ($d === null || !$b->start_at) {
            return null;
        }

        return AppointmentClock::toInstant($b->start_at, AppointmentClock::zoneFor((int) $b->organization_id))
            ->utc()->subHours($d['cancel_hours']);
    }

    /** Cancelled at $when: in time up to and including the deadline (spec §7). */
    public static function inTime(ServiceBooking $b, \DateTimeInterface $when): bool
    {
        $until = self::refundUntil($b);

        return $until !== null && CarbonImmutable::instance($when)->lessThanOrEqualTo($until);
    }

    /** The deadline as the client reads it, on the venue's clock: "Mon 5 Oct 2026, 10:00". */
    public static function untilText(ServiceBooking $b): ?string
    {
        return self::refundUntil($b)?->setTimezone(AppointmentClock::zoneFor((int) $b->organization_id))->format('D j M Y, H:i');
    }

    /** What the booking page and its email show. */
    public static function forClient(ServiceBooking $b): ?array
    {
        $d = self::of($b);

        return $d === null ? null : $d + ['currency' => strtoupper((string) ($b->currency ?: 'EUR')), 'refund_until' => self::untilText($b)];
    }

    /** What the workspace shows: the terms and the deadline as a real instant (the screen prints it on the venue's clock). */
    public static function forStaff(ServiceBooking $b): ?array
    {
        $d = self::of($b);

        return $d === null ? null : $d + ['refund_until' => self::refundUntil($b)?->toIso8601String()];
    }
}
```

- [ ] **Step 5: Run the terms test**

Run: `cd /c/wamp64/www/Hexa-Tech-appointments && /c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Appointments/Money/DepositTermsTest.php`
Expected: `Tests: 6 passed`. Two failures need a closer look rather than a code change:
- If the Riga deadline reads 08:00 UTC, the venue zone was not picked up. Check that `setSetting()` dropped the scoped instances.
- If `untilText` shows another format, check that PHP's `D j M Y` is in use.

- [ ] **Step 6: Write the failing money test**

Create `tests/Feature/Appointments/Money/DepositMoneyTest.php`:

```php
<?php

namespace Tests\Feature\Appointments\Money;

use App\Models\ServiceBookingPayment;
use App\Services\Appointments\AppointmentPresenter;
use App\Services\Appointments\AppointmentRefused;
use App\Services\Appointments\Money\AppointmentMoney;
use App\Services\Appointments\Money\TakingsReport;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Mockery;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\Concerns\TakesDeposits;
use Tests\TestCase;

class DepositMoneyTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema, TakesDeposits;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
        $this->stripeForDeposits();
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    public function test_a_held_deposit_is_held_and_the_rest_is_owed(): void
    {
        $s = AppointmentMoney::summary($this->seedDepositBooking());

        $this->assertSame([12.0, 0.0, 48.0], [$s['held_online'], $s['paid_online'], $s['owed']]);
        $this->assertSame(['amount' => 12.0, 'percent' => 20, 'cancel_hours' => 24, 'refund_until' => '2026-10-05T10:00:00+00:00'], $s['deposit']);
    }

    public function test_a_charged_deposit_is_one_card_payment_in_the_ledger_and_the_label_stays_unpaid(): void
    {
        $b = $this->takenDeposit();

        $row = ServiceBookingPayment::sole();
        $this->assertSame(['payment', 'online_card', 12.0, 'EUR', 'Deposit', null], [$row->kind, $row->method, $row->amount, $row->currency, $row->note, $row->actor_user_id]);
        $this->assertSame('unpaid', $b->payment_status);
        $this->assertFalse((bool) $b->meta['paid_at_desk']);

        $s = AppointmentMoney::summary($b);
        $this->assertSame([0.0, 12.0, 0.0, 48.0, 12.0, 0.0, true], [$s['held_online'], $s['paid_online'], $s['paid_desk'], $s['owed'], $s['refundable_online'], $s['refundable_desk'], $s['can_take']]);
        $this->assertSame('deposit_paid', AppointmentPresenter::paymentState($b));
    }

    public function test_recording_it_twice_records_it_once(): void
    {
        $b = $this->takenDeposit();
        app(AppointmentMoney::class)->recordDeposit($b);

        $this->assertSame(1, ServiceBookingPayment::count());
    }

    public function test_take_payment_asks_for_the_rest_and_then_it_is_paid(): void
    {
        $b = $this->takenDeposit();
        $money = app(AppointmentMoney::class);

        try {
            $money->takePayment($b->id, 60, 'cash', null, AppointmentPresenter::revision($b), $this->staff);
            $this->fail('more than is owed was taken');
        } catch (AppointmentRefused $e) {
            $this->assertSame(['amount_too_large', 48.0], [$e->errorCode, $e->extra['max']]);
        }

        $paid = $money->takePayment($b->id, 48, 'cash', null, AppointmentPresenter::revision($b->fresh()), $this->staff);
        $s = AppointmentMoney::summary($paid);
        $this->assertSame(['paid', 12.0, 48.0, 0.0], [$paid->payment_status, $s['paid_online'], $s['paid_desk'], $s['owed']]);
    }

    public function test_a_deposit_of_the_whole_price_marks_it_paid_by_card(): void
    {
        $b = $this->takenDeposit([], 60.0);

        $this->assertSame('paid', $b->payment_status);
        $this->assertSame('paid_by_card', AppointmentPresenter::paymentState($b));
        $this->assertSame(60.0, AppointmentMoney::summary($b)['paid_online']);
    }

    public function test_a_kept_deposit_is_not_left_to_refund(): void
    {
        $b = $this->takenDeposit();
        $b->update(['status' => 'cancelled', 'cancelled_at' => now()]);

        $s = AppointmentMoney::summary($b->fresh());
        $this->assertSame(0.0, $s['to_refund']);
        $this->assertSame(12.0, $s['refundable_online'], 'a manager can still give it back');
    }

    public function test_the_takings_count_a_deposit_once(): void
    {
        $this->takenDeposit([], 60.0); // paid in full by card, the visit is tomorrow

        $today = TakingsReport::for($this->org->id, '2026-10-05');
        $this->assertSame(['in' => 60.0, 'out' => 0.0], $today['totals']['EUR']['online_card']);
        $this->assertSame([], TakingsReport::for($this->org->id, '2026-10-06')['online'], 'not again as the visit day\'s card money');
    }
}
```

- [ ] **Step 7: Run it and watch it fail**

Run: `cd /c/wamp64/www/Hexa-Tech-appointments && /c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Appointments/Money/DepositMoneyTest.php`
Expected: FAIL — `Call to undefined method ...AppointmentMoney::recordDeposit()` and the `deposit` key missing.

- [ ] **Step 8: Teach the money about deposits**

In `app/Services/Appointments/Money/AppointmentMoney.php`:

(a) Add `recordDeposit()` right after `afterRefunds()`:

```php
    /**
     * The booking page's deposit, charged at Stripe (Part H §5.1): one ledger
     * row — payment, online_card, "Deposit" — and the label from the money,
     * never `paid` for a part. Safe to call twice (confirm() and the capture
     * job both may): the second call finds the row and does nothing.
     */
    public function recordDeposit(ServiceBooking $b, ?User $actor = null): void
    {
        $deposit = Deposits::of($b);
        if ($deposit === null) {
            return;
        }

        DB::transaction(function () use ($b, $deposit, $actor) {
            $locked = ServiceBooking::withoutGlobalScopes()->lockForUpdate()->find($b->id);
            if (!$locked || ServiceBookingPayment::withoutGlobalScopes()->where('service_booking_id', $locked->id)
                    ->where('kind', 'payment')->where('method', 'online_card')->exists()) {
                return;
            }
            $currency = strtoupper((string) ($locked->currency ?: 'EUR'));
            ServiceBookingPayment::create([
                'organization_id' => $locked->organization_id, 'service_booking_id' => $locked->id, 'kind' => 'payment',
                'method' => 'online_card', 'amount' => $deposit['amount'], 'currency' => $currency, 'note' => 'Deposit',
                'actor_user_id' => $actor?->id,
            ]);
            // The card is charged: what came in is the ledger's now, and the label follows it.
            $locked->payment_status = 'unpaid';
            $this->settle($locked, $actor, 'service_booking.deposit_taken', ['amount' => $deposit['amount']], "deposit of {$deposit['amount']} {$currency}");
        });
    }
```

(b) In `settle()`, replace the signature and the first lines down to `$meta['paid_at_desk'] = …` with:

```php
    private function settle(ServiceBooking $b, ?User $actor, string $action, array $new, string $summary): void
    {
        // The label as it was stored: recordDeposit() moves it off "authorized" in memory just before.
        $old = ['payment_status' => (string) $b->getOriginal('payment_status')];
        $meta = (array) ($b->meta ?? []);
        $meta['money_version'] = (int) ($meta['money_version'] ?? 0) + 1;
        // For screens that read the label without the ledger (cardPaid()): this booking's money came in at the desk.
        // A deposit paid on the booking page (online_card) is card money, not the desk's (Part H).
        $meta['paid_at_desk'] = ServiceBookingPayment::withoutGlobalScopes()
            ->where('service_booking_id', $b->id)->where('kind', 'payment')->whereIn('method', ServiceBookingPayment::DESK_METHODS)->exists();
```

(the rest of `settle()` stays as it is).

(c) In `summary()`, replace the return with:

```php
        return self::amountsFrom($b, $rows) + [
            'deposit'   => Deposits::forStaff($b),
            'movements' => $rows->map(fn (ServiceBookingPayment $r) => $r->toApi())->values()->all(),
        ];
```

(d) In `amountsFrom()`, replace the lines from `$payments = $rows->where('kind', 'payment');` through `$refundedDesk = …` with:

```php
        $deposit = Deposits::of($b);
        $payments = $rows->where('kind', 'payment');
        // Part H: a deposit paid on the booking page is card money the ledger records (online_card), not the desk's.
        $online = $payments->where('method', 'online_card');
        $desk = $payments->where('method', '!=', 'online_card');
        $deskRefunds = $rows->where('kind', 'refund')->where('method', '!=', 'online_card');
        $corrections = $deskRefunds->filter(fn (ServiceBookingPayment $r) => (bool) $r->corrects);

        // A deposit booking holds (or took) its deposit, never the whole price.
        $held = self::cardHeld($b) ? ($deposit['amount'] ?? $total) : 0.0;
        $paidOnline = round(($deposit === null && self::cardPaid($b, $desk->isNotEmpty()) ? $total : 0.0) + (float) $online->sum('amount'), 2);
        $refundedOnline = $card ? round((float) ($b->refunded_amount ?? 0), 2) : 0.0;
        $corrected = round((float) $corrections->sum('amount'), 2);
        // A corrected entry was never paid: it leaves the desk money, not the refunds.
        $paidDesk = max(0.0, round((float) $desk->sum('amount') - $corrected, 2));
        $refundedDesk = round((float) $deskRefunds->sum('amount') - $corrected, 2);
```

Then, still in `amountsFrom()`, replace the `'to_refund'` line with:

```php
            // A kept deposit is the venue's (Part H): its card money is not "to refund" after a cancellation.
            'to_refund'          => $closed ? max(0.0, round($paidIn - $paidBack - ($deposit !== null ? max(0.0, $paidOnline - $refundedOnline) : 0.0), 2)) : 0.0,
```

Leave the `$legacy` line as it is (it reads `$payments`; a booking without a card has no online rows).

- [ ] **Step 9: The row's payment state, and the takings**

In `app/Services/Appointments/AppointmentPresenter.php` `paymentState()`, replace the `'unpaid'` arm with:

```php
            // Part H: a booking-page deposit came in and the rest is due at the venue.
            'unpaid'                => $card && Deposits::of($b) !== null ? 'deposit_paid' : 'not_paid_online',
```

and add `use App\Services\Appointments\Money\Deposits;` to its imports.

In `app/Services/Appointments/Money/TakingsReport.php`, replace the filter line with:

```php
            // Card money Stripe took: a card booking paid at the desk, or a booking-page deposit, is in the ledger rows above instead.
            ->filter(fn (ServiceBooking $b) => AppointmentMoney::cardPaid($b) && Deposits::of($b) === null);
```

- [ ] **Step 10: Run both tests, then Part E's money tests**

Run: `cd /c/wamp64/www/Hexa-Tech-appointments && /c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Appointments/Money/`
Expected: every test passes (`DepositTermsTest` 6, `DepositMoneyTest` 7, and Part E's own unchanged).

- [ ] **Step 11: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-appointments
git add app/Services/Appointments/Money/Deposits.php app/Services/Appointments/Money/AppointmentMoney.php app/Services/Appointments/AppointmentPresenter.php app/Services/Appointments/Money/TakingsReport.php tests/Concerns/TakesDeposits.php tests/Feature/Appointments/Money/DepositTermsTest.php tests/Feature/Appointments/Money/DepositMoneyTest.php
git commit -m "$(cat <<'EOF'
Deposits: the terms a booking-page booking pays on, and the ledger row its deposit becomes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: The booking page's API takes the deposit

**Files:**
- Create: `app/Services/Appointments/Money/DepositRefused.php`
- Modify: `app/Services/Appointments/Money/Deposits.php` (add `metadataOf()`, `assertPays()`)
- Modify: `app/Http/Controllers/Api/V1/ServicePublicController.php` (`quote()` 162-180, `paymentIntent()` 228-249, `confirm()` 319-515, `capturePaymentIntentIfNeeded()` 591-625, `sendServiceBookingEmails()` 711-735, new `releaseDeposit()`)
- Modify: `app/Mail/ServiceBookingConfirmationMail.php` (constructor), `resources/views/emails/service-booking-confirmation.blade.php:92-99`
- Test: `tests/Feature/Widget/ServiceDepositBookingTest.php`

**Interfaces:**
- Consumes: Task 1's `Deposits::termsFor/of/forClient/untilText/KIND/SOURCE`, `AppointmentMoney::recordDeposit()`, `TakesDeposits`.
- Produces:
  - `DepositRefused` (a `\DomainException`, `public readonly string $reason` of `deposit_required` | `deposit_mismatch`)
  - `Deposits::metadataOf(mixed $intent): array`
  - `Deposits::assertPays(mixed $intent, array $deposit, int $orgId, int $serviceId, \DateTimeInterface|string $start): void`
  - Public API: `POST /v1/services/quote` adds `deposit` {amount, percent, cancel_hours, currency} when one is due. `POST /v1/services/payment-intent` answers {client_secret, payment_intent_id, deposit} for a deposit. `POST /v1/services/confirm` answers 422 {error, code: deposit_required|deposit_mismatch} or 409 {error, code: slot_taken} after releasing, and adds `deposit` {amount, currency, percent, cancel_hours, refund_until} to its 201.
  - `ServiceBookingConfirmationMail` gains `?float $depositAmount = null, ?string $depositRefundUntil = null`.

- [ ] **Step 1: Write the failing test**

Create `tests/Feature/Widget/ServiceDepositBookingTest.php`:

```php
<?php

namespace Tests\Feature\Widget;

use App\Mail\ServiceBookingConfirmationMail;
use App\Models\ServiceBooking;
use App\Models\ServiceBookingPayment;
use App\Services\Appointments\Money\AppointmentMoney;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Mail;
use Illuminate\Testing\TestResponse;
use Mockery;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\Concerns\TakesDeposits;
use Tests\TestCase;

/**
 * Part H: the booking page's API at a venue that takes a 20% deposit. The
 * seeded service is 60.00 EUR, tomorrow at 10:00 with the seeded team
 * member. Stripe is a Mockery mock.
 */
class ServiceDepositBookingTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema, TakesDeposits;

    private $stripe;
    private array $captured = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
        Mail::fake();
        $this->stripe = $this->stripeForDeposits();
        $this->depositsOn(20, 24);
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    private function body(array $extra = []): array
    {
        return array_merge([
            'service_id' => $this->service->id, 'service_master_id' => $this->master->id,
            'start_at' => '2026-10-06T10:00:00+00:00', 'party_size' => 1,
        ], $extra);
    }

    private function confirm(array $extra = [], ?string $key = null): TestResponse
    {
        return $this->withHeader('Idempotency-Key', $key ?? 'dep-' . uniqid('', true))
            ->postJson('/api/v1/services/confirm', $this->body(['customer_name' => 'Ada Guest', 'customer_email' => 'ada@example.test'] + $extra));
    }

    /** Stripe holds $intent until it is captured, then reports it succeeded. */
    private function holds($intent): void
    {
        $this->stripe->shouldReceive('retrievePaymentIntent')->andReturnUsing(function (string $id) use ($intent) {
            return in_array($id, $this->captured, true) ? $this->depositIntent($id, $intent->amount / 100, [], 'succeeded') : $intent;
        });
        $this->stripe->shouldReceive('capturePaymentIntent')->andReturnUsing(function (string $id) {
            $this->captured[] = $id;
            return $this->depositIntent($id, 12.0, [], 'succeeded');
        });
    }

    public function test_the_quote_names_the_deposit(): void
    {
        // JSON carries 12.0 as 12 (no JSON_PRESERVE_ZERO_FRACTION), and assertJsonPath compares with assertSame.
        $this->postJson('/api/v1/services/quote', $this->body())->assertOk()
            ->assertJsonPath('deposit', ['amount' => 12, 'percent' => 20, 'cancel_hours' => 24, 'currency' => 'EUR']);

        $this->depositsOff();
        $this->assertArrayNotHasKey('deposit', $this->postJson('/api/v1/services/quote', $this->body())->assertOk()->json());
    }

    public function test_the_payment_intent_is_for_the_deposit_only(): void
    {
        $orgId = (string) $this->org->id;
        $this->stripe->shouldReceive('createPaymentIntent')->once()
            ->withArgs(fn ($amount, $description, $meta, $options) => $amount === 12.0
                && $meta['kind'] === 'service_deposit' && $meta['source'] === 'services_widget' && $meta['org_id'] === $orgId
                && $meta['service_id'] === (string) $this->service->id && ($options['allow_redirects'] ?? null) === 'never')
            ->andReturn(['client_secret' => 'cs_1', 'payment_intent_id' => 'pi_dep_1']);

        $this->postJson('/api/v1/services/payment-intent', $this->body())->assertOk()
            ->assertJsonPath('payment_intent_id', 'pi_dep_1')
            ->assertJsonPath('deposit.amount', 12);
    }

    public function test_a_booking_without_its_deposit_is_refused(): void
    {
        $this->confirm()->assertStatus(422)->assertJsonPath('code', 'deposit_required');
        $this->assertSame(0, ServiceBooking::count());
    }

    public function test_a_held_deposit_books_and_is_charged_and_recorded(): void
    {
        $this->holds($this->depositIntent('pi_dep_ok'));
        $this->stripe->shouldNotReceive('cancelPaymentIntent');

        $this->confirm(['payment_intent_id' => 'pi_dep_ok'])->assertStatus(201)
            ->assertJsonPath('deposit.amount', 12)
            ->assertJsonPath('deposit.refund_until', 'Mon 5 Oct 2026, 10:00')
            ->assertJsonPath('payment_capture_pending', false);

        $b = ServiceBooking::sole();
        $this->assertSame(['pi_dep_ok'], $this->captured);
        $this->assertSame(['amount' => 12, 'percent' => 20, 'cancel_hours' => 24], $b->meta['deposit']);
        $this->assertSame('unpaid', $b->payment_status, 'a deposit never marks the booking paid');
        $this->assertSame(['payment', 'online_card', 12.0], [ServiceBookingPayment::sole()->kind, ServiceBookingPayment::sole()->method, ServiceBookingPayment::sole()->amount]);
        $this->assertSame(48.0, AppointmentMoney::summary($b)['owed']);
        Mail::assertQueued(ServiceBookingConfirmationMail::class, fn ($m) => $m->depositAmount === 12.0 && $m->depositRefundUntil === 'Mon 5 Oct 2026, 10:00');
    }

    public function test_a_deposit_for_another_amount_is_refused_and_released(): void
    {
        $this->service->update(['price' => 80]); // repriced after the card form was filled: the deposit is now 16.00
        $this->holds($this->depositIntent('pi_dep_old'));
        $this->stripe->shouldReceive('cancelPaymentIntent')->once()->with('pi_dep_old', 'abandoned');

        $this->confirm(['payment_intent_id' => 'pi_dep_old'])->assertStatus(422)->assertJsonPath('code', 'deposit_mismatch');
        $this->assertSame(0, ServiceBooking::count());
        $this->assertSame([], $this->captured);
    }

    public function test_a_deposit_for_another_time_is_refused_and_released(): void
    {
        $this->holds($this->depositIntent('pi_dep_11', 12.0, ['start_at' => '2026-10-06T11:00:00+00:00']));
        $this->stripe->shouldReceive('cancelPaymentIntent')->once()->with('pi_dep_11', 'abandoned');

        $this->confirm(['payment_intent_id' => 'pi_dep_11'])->assertStatus(422)->assertJsonPath('code', 'deposit_mismatch');
        $this->assertSame(0, ServiceBooking::count());
    }

    public function test_a_time_taken_meanwhile_releases_the_deposit(): void
    {
        $this->seedBooking(); // the same person, tomorrow 10:00
        $this->holds($this->depositIntent('pi_dep_late'));
        $this->stripe->shouldReceive('cancelPaymentIntent')->once()->with('pi_dep_late', 'abandoned');

        $res = $this->confirm(['payment_intent_id' => 'pi_dep_late'])->assertStatus(409)->assertJsonPath('code', 'slot_taken');
        $this->assertStringEndsWith('Your card was not charged.', $res->json('error'));
        $this->assertSame([], $this->captured);
    }

    public function test_the_same_deposit_books_once_and_its_payment_is_never_released(): void
    {
        $this->holds($this->depositIntent('pi_dep_twice'));
        $this->stripe->shouldNotReceive('cancelPaymentIntent');

        $this->confirm(['payment_intent_id' => 'pi_dep_twice'], 'key-1')->assertStatus(201);
        $this->confirm(['payment_intent_id' => 'pi_dep_twice'], 'key-1')->assertOk()->assertJsonPath('replayed', true);
        $this->confirm(['payment_intent_id' => 'pi_dep_twice', 'start_at' => '2026-10-06T11:00:00+00:00'], 'key-2')
            ->assertStatus(409)->assertJsonPath('error', 'This payment has already been used for a booking.');
        $this->confirm(['payment_intent_id' => 'pi_dep_twice'], 'key-3')->assertStatus(409); // the same time again: taken, nothing released

        $this->assertSame(1, ServiceBooking::count());
    }

    public function test_a_capture_that_does_not_go_through_leaves_the_deposit_to_the_job(): void
    {
        $this->stripe->shouldReceive('retrievePaymentIntent')->andReturn($this->depositIntent('pi_dep_slow'));
        $this->stripe->shouldReceive('capturePaymentIntent')->andThrow(new \RuntimeException('stripe busy'));

        $this->confirm(['payment_intent_id' => 'pi_dep_slow'])->assertStatus(201)->assertJsonPath('payment_capture_pending', true);

        $b = ServiceBooking::sole();
        $this->assertSame('authorized', $b->payment_status);
        $this->assertSame(12, $b->meta['deposit']['amount']);
        $this->assertSame(0, ServiceBookingPayment::count());
    }

    public function test_with_deposits_off_a_booking_needs_no_card(): void
    {
        $this->depositsOff();
        $this->stripe->shouldNotReceive('createPaymentIntent');

        $this->confirm()->assertStatus(201);
        $b = ServiceBooking::sole();
        $this->assertSame('unpaid', $b->payment_status);
        $this->assertNull($b->meta['deposit'] ?? null);
    }

    public function test_a_free_service_takes_no_deposit(): void
    {
        $this->service->update(['price' => 0]);

        $this->confirm()->assertStatus(201);
        $this->assertNull(ServiceBooking::sole()->meta['deposit'] ?? null);
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd /c/wamp64/www/Hexa-Tech-appointments && /c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Widget/ServiceDepositBookingTest.php`
Expected: FAIL. The deposit tests fail on the missing `deposit` key and `code`. `test_with_deposits_off_a_booking_needs_no_card` and `test_a_free_service_takes_no_deposit` pass already, which is correct: they pin today's behaviour.

If the seeded team member's price for the service does not follow `service.price` (the reservation reads its own price), the repricing and free-service tests need the service-master pivot price changed too. That is a test fix with a ledger ruling, not a code change.

- [ ] **Step 3: The refusal and the intent check**

Create `app/Services/Appointments/Money/DepositRefused.php`:

```php
<?php

namespace App\Services\Appointments\Money;

/**
 * The booking page's confirm refuses a booking whose deposit is missing
 * (`deposit_required`) or is not this booking's (`deposit_mismatch`).
 * A \DomainException, so confirm()'s catch of the scheduler's
 * \RuntimeException ("slot taken") never takes it for one.
 */
final class DepositRefused extends \DomainException
{
    public function __construct(public readonly string $reason, string $message)
    {
        parent::__construct($message);
    }
}
```

Add to `Deposits` (with `use App\Services\Appointments\VenueClock;` and `use App\Services\StripeService;`):

```php
    /** A Stripe intent's metadata as a plain array (Stripe keeps every value a string). */
    public static function metadataOf(mixed $intent): array
    {
        $raw = is_array($intent) ? ($intent['metadata'] ?? null) : ($intent->metadata ?? null);

        return is_array($raw) ? $raw : (is_object($raw) && method_exists($raw, 'toArray') ? $raw->toArray() : []);
    }

    /**
     * The intent pays exactly this booking's deposit: a deposit intent of this
     * venue, for this service at this time, for this amount in this currency.
     * The time is compared as the venue's wall clock (both sides come from the
     * scheduler's own start).
     *
     * @param array{amount: float, currency: string} $deposit
     * @throws DepositRefused
     */
    public static function assertPays(mixed $intent, array $deposit, int $orgId, int $serviceId, \DateTimeInterface|string $start): void
    {
        if ($intent === null) {
            throw new DepositRefused('deposit_required', 'A deposit is needed to book this time. Please try again.');
        }
        $meta = self::metadataOf($intent);
        $pays = ($meta['kind'] ?? null) === self::KIND
            && (int) ($meta['org_id'] ?? 0) === $orgId
            && (int) ($meta['service_id'] ?? 0) === $serviceId
            && VenueClock::wall((string) ($meta['start_at'] ?? '')) === VenueClock::wall($start)
            && strtoupper((string) ($intent->currency ?? '')) === $deposit['currency']
            && (int) ($intent->amount ?? -1) === app(StripeService::class)->toSmallestUnit($deposit['amount'], $deposit['currency']);
        if (!$pays) {
            throw new DepositRefused('deposit_mismatch', 'The deposit does not match this booking. Your card was not charged; please try again.');
        }
    }
```

- [ ] **Step 4: quote() and paymentIntent()**

In `ServicePublicController` add the imports `use App\Services\Appointments\Money\AppointmentMoney;`, `use App\Services\Appointments\Money\DepositRefused;` and `use App\Services\Appointments\Money\Deposits;`.

In `quote()`, replace `return response()->json([` … `]);` (the final return) with the same array followed by the deposit:

```php
        $deposit = Deposits::termsFor((float) $q['list_total'], (string) $q['currency']);

        return response()->json([
            'service' => [
                'id'    => $service->id,
                'name'  => $service->name,
                'price' => $q['service_price'],
            ],
            'master' => [
                'id'   => $q['master']->id,
                'name' => $q['master']->name,
            ],
            'start_at'         => $q['start']->toIso8601String(),
            'end_at'           => $q['end']->toIso8601String(),
            'duration_minutes' => $q['duration_minutes'],
            'service_price'    => $q['service_price'],
            'extras'           => $q['extras'],
            'extras_total'     => $q['extras_total'],
            'total_amount'     => $q['list_total'],
            'currency'         => $q['currency'],
        // Part H: what the booking page asks for now, at a venue that takes deposits.
        ] + ($deposit !== null ? ['deposit' => $deposit] : []));
```

In `paymentIntent()`, insert right after `$orgId = app('current_organization_id');`:

```php
        // Part H: at a venue that takes deposits the intent is for the deposit only — the server's figure, held on
        // the card (manual capture, no redirect methods) until confirm() saves the booking and charges it.
        $deposit = Deposits::termsFor((float) $total, (string) ($service->currency ?: 'EUR'));
        if ($deposit !== null) {
            try {
                $intent = $stripe->createPaymentIntent(
                    $deposit['amount'],
                    "Deposit: {$service->name}",
                    [
                        'org_id'     => (string) $orgId,
                        'service_id' => (string) $service->id,
                        'start_at'   => $reservation['start']->toIso8601String(),
                        'kind'       => Deposits::KIND,
                        'source'     => Deposits::SOURCE,
                    ],
                    ['allow_redirects' => 'never'],
                );

                return response()->json($intent + ['deposit' => $deposit]);
            } catch (\Throwable $e) {
                return response()->json(['error' => 'Failed to create payment: ' . $e->getMessage()], 500);
            }
        }
```

- [ ] **Step 5: confirm() checks, stores and releases**

In `confirm()`:

(a) Just before `$paymentStatus = 'unpaid';` add `$intent = null; // Part H: kept for the deposit check in the lock`. The existing `$intent = $stripe->retrievePaymentIntent(...)` line then assigns it.

(b) Change the transaction's `use (...)` list to `use ($data, $service, $scheduler, $orgId, $paymentStatus, $lockKey, $source, $intent, $isMockBooking)`.

(c) Right after the `PaymentAlreadyUsed` check (`throw new PaymentAlreadyUsed();` and its closing brace), insert:

```php
                // Part H: a venue that takes deposits needs this booking's own deposit, held on the card, before the
                // booking is saved — worked out here from the price in the lock, never taken from the page.
                $deposit = $isMockBooking ? null : Deposits::termsFor(round($servicePrice + $extrasTotal, 2), (string) ($service->currency ?: 'EUR'));
                if ($deposit !== null) {
                    Deposits::assertPays($intent, $deposit, (int) $orgId, (int) $service->id, $reservation['start']);
                }
```

(d) Close the `ServiceBooking::create([...])` array with the terms appended. Replace

```php
                    'customer_notes'    => $data['customer_notes'] ?? null,
                ]);
```

(the one inside `confirm()`, just before `foreach ($extraRows as $row)`) with:

```php
                    'customer_notes'    => $data['customer_notes'] ?? null,
                ] + ($deposit !== null ? ['meta' => ['deposit' => ['amount' => $deposit['amount'], 'percent' => $deposit['percent'], 'cancel_hours' => $deposit['cancel_hours']]]] : []));
```

(e) Add a first catch, before `} catch (PaymentAlreadyUsed) {`:

```php
        } catch (DepositRefused $e) {
            if ($e->reason === 'deposit_mismatch') {
                $this->releaseDeposit($intent, $orgId);
            }
            $this->logSubmission($orgId, $idempotency, $data, null, 'failed', $e->reason);
            return response()->json(['error' => $e->getMessage(), 'code' => $e->reason], 422);
```

(f) Replace the `\RuntimeException` and `\Throwable` catches with:

```php
        } catch (\RuntimeException $e) {
            // reserveSlot threw — the requested slot was taken by a concurrent
            // confirm while we were waiting for the advisory lock. A deposit held
            // for it goes back at once (Part H).
            $released = $this->releaseDeposit($intent, $orgId);
            $this->logSubmission($orgId, $idempotency, $data, null, 'failed', $e->getMessage());
            return response()->json(['error' => $e->getMessage() . ($released ? ' Your card was not charged.' : '')] + ($released ? ['code' => 'slot_taken'] : []), 409);
        } catch (\Throwable $e) {
            $this->releaseDeposit($intent, $orgId);
            $this->logSubmission($orgId, $idempotency, $data, null, 'failed', $e->getMessage());
            return response()->json(['error' => 'Failed to create booking: ' . $e->getMessage()], 500);
        }
```

(For a booking without a deposit, `releaseDeposit()` returns false, so both answers stay exactly as before.)

(g) Right after the `$captureFlag = $this->capturePaymentIntentIfNeeded(...);` statement, add:

```php
        // Part H: the deposit's ledger row moved the label; what is emailed and answered is the booking as it is now.
        if (Deposits::of($booking) !== null) {
            $booking->refresh();
        }
```

and right before `return response()->json($payload, 201);` add:

```php
        if (($deposit = Deposits::forClient($booking)) !== null) {
            $payload['deposit'] = $deposit;
        }
```

(h) Add the helper after `paymentRuleBroken()`:

```php
    /**
     * Part H: a deposit held for a booking that was not saved goes back at
     * once (the orphan release would do it within the hour). Only this
     * venue's own deposit intent, only while it is still just held, and
     * never one a booking already carries.
     */
    private function releaseDeposit(mixed $intent, ?int $orgId): bool
    {
        if ($intent === null || !$orgId) {
            return false;
        }
        $meta = Deposits::metadataOf($intent);
        $id = (string) ($intent->id ?? '');
        if ($id === '' || ($meta['kind'] ?? null) !== Deposits::KIND || (int) ($meta['org_id'] ?? 0) !== $orgId
            || (string) ($intent->status ?? '') !== 'requires_capture'
            || ServiceBooking::withoutGlobalScopes()->where('organization_id', $orgId)->where('stripe_payment_intent_id', $id)->exists()) {
            return false;
        }
        try {
            app(StripeService::class)->cancelPaymentIntent($id, 'abandoned');

            return true;
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning('service_deposit.release_failed', ['pi' => $id, 'error' => $e->getMessage()]);

            return false;
        }
    }
```

- [ ] **Step 6: Charging records the deposit, not "paid"**

In `capturePaymentIntentIfNeeded()`:

(a) In the `if ($status === 'succeeded')` branch, replace the inner `try { … } catch (\Throwable) {}` with:

```php
            try {
                if (Deposits::of($booking) !== null) {
                    app(AppointmentMoney::class)->recordDeposit($booking);
                } elseif (in_array($booking->payment_status, ['authorized', 'pending', null, ''], true)) {
                    $booking->update(['payment_status' => 'paid']);
                }
            } catch (\Throwable) {}
```

(b) After `$stripe->capturePaymentIntent($intentId);`, replace the inner `try { $booking->update(['payment_status' => 'paid']); } catch (\Throwable) {}` with:

```php
            try {
                if (Deposits::of($booking) !== null) {
                    // Part H: a deposit is part of the price — a ledger payment, never the whole booking marked paid.
                    app(AppointmentMoney::class)->recordDeposit($booking);
                } else {
                    $booking->update(['payment_status' => 'paid']);
                }
            } catch (\Throwable) {}
```

- [ ] **Step 7: The booking email's deposit line**

In `app/Mail/ServiceBookingConfirmationMail.php`, add to the constructor, right after `public ?string $paymentStatus = null,`:

```php
        // Part H: the deposit paid on the booking page, and until when a
        // cancellation gives it back (the venue's clock). Null otherwise.
        public ?float $depositAmount = null,
        public ?string $depositRefundUntil = null,
```

In `resources/views/emails/service-booking-confirmation.blade.php`, right after the `@endif` that closes the `@if ($paymentStatus === 'paid')` block, add:

```blade
        @if (!empty($depositAmount))
            <p style="font-size:12px;color:rgba(255,255,255,0.62);margin:12px 0 0;">
                Deposit paid: {{ $currency }} {{ number_format($depositAmount, 2) }}.
                @if ($depositAmount < $grossTotal)
                    You pay the rest at the venue.
                @endif
                @if (!empty($depositRefundUntil))
                    Cancel by {{ $depositRefundUntil }} for a full refund of your deposit; after that, or if you don't come, the venue keeps it.
                @endif
            </p>
        @endif
```

In `ServicePublicController::sendServiceBookingEmails()`, add to the `new \App\Mail\ServiceBookingConfirmationMail(...)` arguments, after `industry: …`:

```php
                    depositAmount: Deposits::of($booking)['amount'] ?? null,
                    depositRefundUntil: Deposits::untilText($booking),
```

- [ ] **Step 8: Run the test, the widget suite and the money suite**

Run: `cd /c/wamp64/www/Hexa-Tech-appointments && /c/wamp64/bin/php/php8.4.20/php.exe artisan view:clear && /c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Widget/ && /c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Appointments/Money/`
Expected: every test passes, `ServiceConfirmOnePaymentTest` unchanged among them (its response keys are exact, and a booking without a deposit gains no key).

- [ ] **Step 9: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-appointments
git add app/Services/Appointments/Money/DepositRefused.php app/Services/Appointments/Money/Deposits.php app/Http/Controllers/Api/V1/ServicePublicController.php app/Mail/ServiceBookingConfirmationMail.php resources/views/emails/service-booking-confirmation.blade.php tests/Feature/Widget/ServiceDepositBookingTest.php
git commit -m "$(cat <<'EOF'
Booking page API: quote, hold, check and charge the deposit; release it when the booking is not made

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: The booking page asks for the deposit

**Files:**
- Create: `tests/Fixtures/services-widget-deposits-off.html` (recorded from today's view, Step 1)
- Modify: `app/Services/Appointments/Money/Deposits.php` (add `pageOn()`)
- Modify: `routes/web.php:258-334` (both booking page routes)
- Modify: `resources/views/services-widget.blade.php` (eight `@if ($deposit ?? false)` blocks)
- Test: `tests/Feature/Widget/ServicesWidgetDepositPageTest.php`

**Interfaces:**
- Consumes: Task 2's API (`quote.deposit`, `payment-intent` → `{client_secret, payment_intent_id, deposit}`, `confirm` → `deposit` / `code`).
- Produces: `Deposits::pageOn(int $orgId): bool`. The view variable `$deposit` (bool, optional; missing means off).

- [ ] **Step 1: Record today's page before touching the view**

This must run before any change to `services-widget.blade.php`. It is today's output, the fixture the spec compares against.

```bash
cd /c/wamp64/www/Hexa-Tech-appointments && git diff --quiet HEAD -- resources/views/services-widget.blade.php && /c/wamp64/bin/php/php8.4.20/php.exe artisan view:clear && /c/wamp64/bin/php/php8.4.20/php.exe artisan tinker --execute="file_put_contents(base_path('tests/Fixtures/services-widget-deposits-off.html'), view('services-widget', ['orgId' => 'tok_fixture', 'lang' => 'en', 'color' => '#2d6a4f', 'apiBase' => 'https://app.test/api', 'industry' => 'beauty', 'vocab' => \App\Services\IndustryPrompts\BookingWidgetVocab::for('beauty')])->render());" && wc -c tests/Fixtures/services-widget-deposits-off.html
```

Expected: a byte count over 40000. If `git diff --quiet` stops the chain, the view was already changed: restore it with `git checkout -- resources/views/services-widget.blade.php` first.

- [ ] **Step 2: Write the failing test**

Create `tests/Feature/Widget/ServicesWidgetDepositPageTest.php`:

```php
<?php

namespace Tests\Feature\Widget;

use App\Services\IndustryPrompts\BookingWidgetVocab;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\Concerns\TakesDeposits;
use Tests\TestCase;

/**
 * Part H: the booking page changes only for a venue that switched deposits
 * on (spec §4.2). With them off, its output is byte for byte what it was
 * before Part H (the fixture was recorded from the view as it stood).
 */
class ServicesWidgetDepositPageTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema, TakesDeposits;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    private function page(array $extra = []): string
    {
        return str_replace("\r\n", "\n", view('services-widget', array_merge([
            'orgId' => 'tok_fixture', 'lang' => 'en', 'color' => '#2d6a4f', 'apiBase' => 'https://app.test/api',
            'industry' => 'beauty', 'vocab' => BookingWidgetVocab::for('beauty'),
        ], $extra))->render());
    }

    public function test_with_deposits_off_the_page_is_exactly_as_before(): void
    {
        $before = str_replace("\r\n", "\n", file_get_contents(base_path('tests/Fixtures/services-widget-deposits-off.html')));

        $this->assertSame($before, $this->page());
        $this->assertSame($before, $this->page(['deposit' => false]));
    }

    public function test_with_deposits_on_the_page_has_its_deposit_step(): void
    {
        $html = $this->page(['deposit' => true]);

        foreach (['https://js.stripe.com/v3/', 'function renderDepositStep', 'data-act="pay"', 'Continue to deposit', 'Deposit now', 'deposit-card', 'case 8: html += renderDepositStep()'] as $part) {
            $this->assertStringContainsString($part, $html);
        }
    }

    public function test_the_routes_turn_the_step_on_only_where_deposits_are_on(): void
    {
        $url = '/services-widget?org=' . $this->org->id;
        $this->get($url)->assertOk()->assertDontSee('function renderDepositStep', false);

        $this->depositsOn();
        $this->get($url)->assertOk()->assertSee('function renderDepositStep', false);
    }
}
```

- [ ] **Step 3: Run it and watch it fail**

Run: `cd /c/wamp64/www/Hexa-Tech-appointments && /c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Widget/ServicesWidgetDepositPageTest.php`
Expected: `test_with_deposits_off_the_page_is_exactly_as_before` PASSES (nothing changed yet; it pins the fixture). The other two FAIL (no deposit step yet).

- [ ] **Step 4: The routes pass `$deposit`**

Add to `Deposits` (no new imports needed):

```php
    /** The booking page carries its deposit step: the venue switched deposits on. The API decides per booking whether one is due. */
    public static function pageOn(int $orgId): bool
    {
        return filter_var(
            HotelSetting::withoutGlobalScopes()->where('organization_id', $orgId)->where('key', 'services_require_deposit')->value('value'),
            FILTER_VALIDATE_BOOL,
        );
    }
```

In `routes/web.php`, `/services-widget`: after `$vocab    = \App\Services\IndustryPrompts\BookingWidgetVocab::for($industry);` add

```php
    // Part H: the deposit step is in the page only where deposits are switched on; every other page is as before.
    $deposit = $org ? \App\Services\Appointments\Money\Deposits::pageOn((int) $org->id) : false;
```

and change `compact('orgId', 'lang', 'color', 'apiBase', 'industry', 'vocab')` (the `services-widget` one) to `compact('orgId', 'lang', 'color', 'apiBase', 'industry', 'vocab', 'deposit')`.

In `/services/{token}`, add `'deposit'  => \App\Services\Appointments\Money\Deposits::pageOn((int) $org->id),` after `'vocab'    => $vocab,`.

- [ ] **Step 5: The deposit step in the view**

Each block below is a separate edit in `resources/views/services-widget.blade.php`. Every Blade directive sits at column 0 on its own line. Blade then outputs nothing for it when `$deposit` is off, so the deposits-off page stays identical.

(a) Render switch — after `      case 7: html += renderStep7Confirm(); break` add:

```
@if ($deposit ?? false)
      case 8: html += renderDepositStep(); break
@endif
```

(b) In `render()`, replace

```
    app.innerHTML = html
    bindEvents()
```

with

```
    app.innerHTML = html
    bindEvents()
@if ($deposit ?? false)
    if (state.step === 8) mountDeposit()
@endif
```

(c) Stepper — after `    var current = state.step === 7 ? 6 : state.step` add:

```
@if ($deposit ?? false)
    if (state.step === 8) current = 6
@endif
```

(d) Step 6's button — replace the line `    h += (state.submitting ? 'Booking…' : 'Confirm booking') + '</button></div>'` with:

```
@if ($deposit ?? false)
    h += (state.submitting ? 'Booking…' : (depositDue() ? 'Continue to deposit' : 'Confirm booking')) + '</button></div>'
@else
    h += (state.submitting ? 'Booking…' : 'Confirm booking') + '</button></div>'
@endif
```

(e) Step 7 — after `    if (ref) h += '<div class="confirm-ref">' + escapeHtml(ref) + '</div>'` add:

```
@if ($deposit ?? false)
    if (b.deposit) h += '<div class="confirm-sub">Deposit paid: ' + escapeHtml(fmtMoney(b.deposit.amount, b.deposit.currency)) + '.' + (b.deposit.refund_until ? ' Cancel by ' + escapeHtml(b.deposit.refund_until) + ' for a full refund of your deposit.' : '') + '</div>'
@endif
```

(f) Summary — after `      h += '<div class="summary-total"><span>Total</span><span class="val">' + fmtMoney(q.total_amount, q.currency) + '</span></div>'` add:

```
@if ($deposit ?? false)
      if (q.deposit) h += '<div class="summary-row"><span class="lbl">Deposit now</span><span class="val">' + fmtMoney(q.deposit.amount, q.currency) + '</span></div>'
@endif
```

(g) `handle()` — after `  function handle(act, el, e) {` add:

```
@if ($deposit ?? false)
    if (handleDeposit(act)) return
@endif
```

(h) The module — before the line `  // ─── Go ───────────────────────────────────────────────────────────` add:

```
@if ($deposit ?? false)
  // ─── Deposit (Part H) ─────────────────────────────────────────────
  // In the page only for a venue that switched deposits on. The server
  // works the amount out (quote.deposit); this step asks for the deposit's
  // payment intent, shows Stripe's own card fields (the Payment Element)
  // and books once the card is authorised. confirm() charges the deposit
  // right after saving the booking, or releases it when the time was taken.
  function emptyDeposit() {
    return { stripe: null, elements: null, element: null, intent: null, loading: false, paying: false, error: null }
  }
  var dep = emptyDeposit()

  function depositDue() {
    return !!(state.quote && state.quote.deposit && state.config && state.config.stripe_publishable_key)
  }

  function loadStripe() {
    if (window.Stripe) return Promise.resolve(window.Stripe)
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script')
      s.src = 'https://js.stripe.com/v3/'
      s.onload = function () { window.Stripe ? resolve(window.Stripe) : reject(new Error('stripe')) }
      s.onerror = function () { reject(new Error('stripe')) }
      document.head.appendChild(s)
    })
  }

  function depositBody() {
    var svc = getService()
    return {
      service_id: svc.id,
      service_master_id: state.masterId || undefined,
      start_at: state.startAt,
      party_size: state.partySize,
      extras: state.extras,
    }
  }

  // Every visit to this step asks for a new intent: the time or the extras
  // may have changed since the last one, and confirm() refuses an intent
  // made for another time or amount.
  function startDeposit() {
    if (!state.customer.name || !state.customer.email) {
      alert('Please enter your name and email.')
      return
    }
    dep = emptyDeposit()
    dep.loading = true
    state.step = 8
    render()
    Promise.all([loadStripe(), post('/v1/services/payment-intent', depositBody())]).then(function (r) {
      var res = r[1]
      dep.loading = false
      if (!res.ok || !res.body || !res.body.client_secret || !res.body.deposit) {
        dep.error = (res.body && res.body.error) || 'The deposit could not be prepared. Please try again.'
        render()
        return
      }
      dep.intent = res.body
      dep.stripe = window.Stripe(state.config.stripe_publishable_key)
      dep.elements = dep.stripe.elements({ clientSecret: res.body.client_secret })
      dep.element = dep.elements.create('payment')
      render()
    }, function () {
      dep.loading = false
      dep.error = 'The card form could not be loaded. Check your connection and try again.'
      render()
    })
  }

  // render() rebuilds the page: Stripe's card fields go back into the new box.
  function mountDeposit() {
    var box = document.getElementById('deposit-card')
    if (!box || !dep.element) return
    try { dep.element.unmount() } catch (e) {}
    dep.element.mount(box)
  }

  function payDeposit() {
    if (!dep.stripe || !dep.elements || dep.paying) return
    dep.paying = true
    dep.error = null
    render()
    dep.stripe.confirmPayment({
      elements: dep.elements,
      redirect: 'if_required',
      confirmParams: {
        return_url: location.href,
        payment_method_data: { billing_details: { name: state.customer.name, email: state.customer.email } },
      },
    }).then(function (result) {
      if (result.error) {
        dep.paying = false
        dep.error = result.error.message || 'Your card was not accepted.'
        render()
        return
      }
      bookWithDeposit(dep.intent.payment_intent_id)
    }, function () {
      dep.paying = false
      dep.error = 'The card could not be checked. Please try again.'
      render()
    })
  }

  function bookWithDeposit(intentId) {
    var body = depositBody()
    body.customer_name = state.customer.name
    body.customer_email = state.customer.email
    body.customer_phone = state.customer.phone
    body.customer_notes = state.customer.notes
    body.payment_intent_id = intentId
    body.source = state.source
    post('/v1/services/confirm', body, { 'Idempotency-Key': state.idempotencyKey }).then(function (res) {
      dep.paying = false
      if (res.ok) {
        state.booking = res.body
        state.step = 7
        render()
        return
      }
      var message = (res.body && res.body.error) || 'Booking failed. Please try again.'
      if (res.body && res.body.code === 'slot_taken') {
        // The server released the deposit: nothing was charged. Choose another time.
        alert(message)
        dep = emptyDeposit()
        state.idempotencyKey = uuid()
        selectDate(state.date)
        return
      }
      // Any other refusal may have spent the intent: the step starts again.
      dep = emptyDeposit()
      dep.error = message
      render()
    }, function () {
      dep.paying = false
      dep.error = 'No answer from the server. If you are not booked, the hold on your card is released within the hour.'
      render()
    })
  }

  function renderDepositStep() {
    var q = state.quote || {}
    var d = q.deposit || {}
    var h = '<div class="card">'
    h += '<h2 class="card-title">Deposit</h2>'
    if (Number(d.amount) >= Number(q.total_amount)) {
      h += '<p class="card-sub">Pay <strong>' + escapeHtml(fmtMoney(d.amount, q.currency)) + '</strong> now to book.</p>'
    } else {
      h += '<p class="card-sub">Pay a deposit of <strong>' + escapeHtml(fmtMoney(d.amount, q.currency)) + '</strong> now (' + escapeHtml(String(d.percent)) + '% of ' + escapeHtml(fmtMoney(q.total_amount, q.currency)) + '). You pay the rest at the venue.</p>'
    }
    h += '<p class="card-sub">' + (Number(d.cancel_hours) > 0
      ? 'Cancel at least ' + escapeHtml(String(d.cancel_hours)) + ' hours before for a full refund of your deposit; after that, or if you don\'t come, the venue keeps it.'
      : 'Cancel before your visit for a full refund of your deposit; if you don\'t come, the venue keeps it.') + '</p>'
    if (dep.loading) h += '<div class="loading"><div class="spinner"></div><div>Preparing the card form…</div></div>'
    h += '<div id="deposit-card" class="field"></div>'
    if (dep.error) h += '<div class="error-box" role="alert">' + escapeHtml(dep.error) + '</div>'
    h += '<div class="btn-row"><button class="btn btn-outline" data-act="deposit-back"' + (dep.paying ? ' disabled' : '') + '>Back</button>'
    if (dep.element) {
      h += '<button class="btn btn-primary" data-act="pay"' + (dep.paying ? ' disabled' : '') + '>' + (dep.paying ? 'Paying…' : 'Pay ' + escapeHtml(fmtMoney(d.amount, q.currency)) + ' and book') + '</button>'
    } else if (!dep.loading) {
      h += '<button class="btn btn-primary" data-act="deposit-retry">Try again</button>'
    }
    h += '</div></div>'
    return h
  }

  function handleDeposit(act) {
    if (act === 'submit' && depositDue()) { startDeposit(); return true }
    if (act === 'pay') { payDeposit(); return true }
    if (act === 'deposit-retry') { startDeposit(); return true }
    if (act === 'deposit-back') { dep = emptyDeposit(); state.step = 6; render(); return true }
    if (act === 'again') dep = emptyDeposit()
    return false
  }
@endif
```

- [ ] **Step 6: Run the page test and the widget suite**

Run: `cd /c/wamp64/www/Hexa-Tech-appointments && /c/wamp64/bin/php/php8.4.20/php.exe artisan view:clear && /c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Widget/`
Expected: every test passes, including `test_with_deposits_off_the_page_is_exactly_as_before`. If it fails, a directive is not at column 0 or a block left a blank line. Diff the two strings and fix the view, never the fixture.

- [ ] **Step 7: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-appointments
git add app/Services/Appointments/Money/Deposits.php routes/web.php resources/views/services-widget.blade.php tests/Fixtures/services-widget-deposits-off.html tests/Feature/Widget/ServicesWidgetDepositPageTest.php
git commit -m "$(cat <<'EOF'
Booking page: a deposit step with Stripe's card fields, only where deposits are on

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Delayed charges and abandoned deposits

**Files:**
- Modify: `app/Console/Commands/CapturePendingPaymentIntents.php` (`decideServiceBooking()` ~759, new `decideDeposit()`)
- Modify: `app/Services/Booking/PortalPaymentIntentGuard.php` (const + `releaseOrphan()` :310)
- Modify: `app/Console/Commands/ReleaseOrphanPortalHolds.php:115`
- Test: `tests/Feature/Appointments/Money/DepositJobsTest.php`

**Interfaces:**
- Consumes: `Deposits::of/inTime/KIND`, `AppointmentMoney::recordDeposit()`.
- Produces: `PortalPaymentIntentGuard::ORPHAN_KINDS` (portal kinds + `service_deposit`).

- [ ] **Step 1: Write the failing test**

Create `tests/Feature/Appointments/Money/DepositJobsTest.php`:

```php
<?php

namespace Tests\Feature\Appointments\Money;

use App\Models\ServiceBooking;
use App\Models\ServiceBookingPayment;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Mockery;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\Concerns\TakesDeposits;
use Tests\TestCase;

/** Part H §5.4–5.5: the capture job and the orphan release with booking-page deposits. */
class DepositJobsTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema, TakesDeposits;

    private $stripe;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
        $this->setUpCapturePendingSchema();
        $this->stripe = $this->stripeForDeposits();
        $this->setSetting('booking_payment_enabled', 'true');
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    private function capture(): void
    {
        $this->travel(10)->minutes(); // the job leaves bookings younger than 5 minutes to confirm()
        $this->assertSame(0, Artisan::call('bookings:capture-pending-pis'));
    }

    public function test_a_deposit_whose_charge_was_missed_is_charged_and_recorded_as_a_deposit(): void
    {
        $b = $this->seedDepositBooking();
        $pi = $b->stripe_payment_intent_id;
        $this->stripe->shouldReceive('retrievePaymentIntent')->andReturn($this->depositIntent($pi));
        $this->stripe->shouldReceive('capturePaymentIntent')->once()->with($pi)->andReturn($this->depositIntent($pi, 12.0, [], 'succeeded'));
        $this->stripe->shouldNotReceive('cancelPaymentIntent');

        $this->capture();

        $this->assertSame('unpaid', $b->fresh()->payment_status, 'never "paid" for a deposit');
        $this->assertSame([12.0, 'online_card'], [ServiceBookingPayment::sole()->amount, ServiceBookingPayment::sole()->method]);
    }

    public function test_a_deposit_charged_but_not_recorded_is_recorded(): void
    {
        $b = $this->seedDepositBooking();
        $this->stripe->shouldReceive('retrievePaymentIntent')->andReturn($this->depositIntent($b->stripe_payment_intent_id, 12.0, [], 'succeeded'));
        $this->stripe->shouldNotReceive('capturePaymentIntent');

        $this->capture();

        $this->assertSame('unpaid', $b->fresh()->payment_status);
        $this->assertSame(1, ServiceBookingPayment::count());
    }

    public function test_a_booking_cancelled_in_time_has_its_deposit_hold_released(): void
    {
        $b = $this->seedDepositBooking(['status' => 'cancelled', 'cancelled_at' => now()]); // 06:00, deadline 10:00
        $pi = $b->stripe_payment_intent_id;
        $this->stripe->shouldReceive('retrievePaymentIntent')->andReturn($this->depositIntent($pi));
        $this->stripe->shouldNotReceive('capturePaymentIntent');
        $this->stripe->shouldReceive('cancelPaymentIntent')->once()->with($pi, 'abandoned')->andReturn($this->depositIntent($pi, 12.0, [], 'canceled'));

        $this->capture();

        $this->assertSame('cancelled', $b->fresh()->payment_status);
        $this->assertSame(0, ServiceBookingPayment::count());
    }

    public function test_a_late_cancellation_and_a_no_show_have_their_deposit_charged_and_kept(): void
    {
        // Today 15:00: the 24-hour window closed yesterday.
        $late = $this->seedDepositBooking(['status' => 'cancelled', 'cancelled_at' => now(), 'start_at' => '2026-10-05 15:00:00', 'end_at' => '2026-10-05 15:45:00']);
        $noShow = $this->seedDepositBooking(['status' => 'no_show', 'start_at' => '2026-10-05 07:00:00', 'end_at' => '2026-10-05 07:45:00']);
        $this->stripe->shouldReceive('retrievePaymentIntent')->andReturnUsing(fn (string $id) => $this->depositIntent($id));
        $this->stripe->shouldReceive('capturePaymentIntent')->twice()->andReturnUsing(fn (string $id) => $this->depositIntent($id, 12.0, [], 'succeeded'));
        $this->stripe->shouldNotReceive('cancelPaymentIntent');

        $this->capture();

        $this->assertSame(2, ServiceBookingPayment::where('method', 'online_card')->where('kind', 'payment')->count());
        $this->assertSame(['unpaid', 'unpaid'], [$late->fresh()->payment_status, $noShow->fresh()->payment_status]);
    }

    public function test_an_abandoned_deposit_is_released_and_one_a_booking_carries_is_never_touched(): void
    {
        $carried = $this->seedDepositBooking();
        $orphan = $this->depositIntent('pi_dep_orphan');
        $kept = $this->depositIntent($carried->stripe_payment_intent_id);
        $this->stripe->shouldReceive('listPaymentIntents')->once()->andReturn([$orphan, $kept]);
        $this->stripe->shouldReceive('retrievePaymentIntent')->once()->with('pi_dep_orphan', ['latest_charge'])->andReturn($orphan);
        $this->stripe->shouldReceive('cancelPaymentIntent')->once()->with('pi_dep_orphan', 'abandoned');

        $this->assertSame(0, Artisan::call('bookings:release-orphan-portal-holds'));

        $this->assertSame(1, DB::table('audit_logs')->where('action', 'portal.hold.orphan_released')->count());
        $this->assertSame('authorized', ServiceBooking::find($carried->id)->payment_status);
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd /c/wamp64/www/Hexa-Tech-appointments && /c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Appointments/Money/DepositJobsTest.php`
Expected: FAIL. The first test gets `paid` instead of `unpaid`. The cancelled-in-time test may pass already (the job releases every cancelled hold), which is correct. The late/no-show test fails because the job releases instead of capturing. The orphan test fails because `service_deposit` is not a releasable kind.

- [ ] **Step 3: The capture job's deposit branch**

In `CapturePendingPaymentIntents.php`, add the imports `use App\Services\Appointments\Money\AppointmentMoney;` and `use App\Services\Appointments\Money\Deposits;`.

In `decideServiceBooking()`, right after `$status = (string) ($intent->status ?? '');`, add:

```php
        // Part H: a booking-page deposit is charged and recorded as a ledger payment (never `paid` for a part). A
        // booking cancelled in time has its hold released; one cancelled late, or a no-show, has it charged and kept.
        if (Deposits::of($fresh) !== null && in_array($status, ['requires_capture', 'succeeded'], true)) {
            return $this->decideDeposit($stripe, $fresh, $piId, $status, $observedPaymentStatus, $dryRun, $audits, $fallback);
        }
```

Add the method after `decideServiceBooking()`:

```php
    /** Part H §5.4: a deposit whose charge confirm() did not finish. */
    private function decideDeposit(StripeService $stripe, ServiceBooking $fresh, string $piId, string $status, string $observedPaymentStatus, bool $dryRun, array &$audits, array &$fallback): array
    {
        $cancelledInTime = (string) $fresh->status === 'cancelled' && Deposits::inTime($fresh, $fresh->cancelled_at ?? now());
        if ($status === 'requires_capture' && $cancelledInTime) {
            return $this->releaseCancelledServiceBooking($stripe, $fresh, $piId, $observedPaymentStatus, $dryRun, $audits);
        }
        $outcome = $status === 'requires_capture' ? 'captured' : 'already_captured';
        if ($dryRun) {
            $this->line("[dry-run] would charge and record the deposit of service booking #{$fresh->id} (PI {$piId})");
            return $this->tally([$outcome => 1]);
        }
        if ($status === 'requires_capture') {
            try {
                $stripe->capturePaymentIntent($piId);
            } catch (\Throwable $e) {
                Log::error('Capture cron (service) — deposit capture failed', ['service_booking_id' => $fresh->id, 'pi_id' => $piId, 'error' => $e->getMessage()]);
                return $this->tally(['failed' => 1]);
            }
            $fallback['tally'] = $this->tally(['captured' => 1]);
            $audits[] = [
                'org' => $fresh->organization_id, 'action' => 'service_booking.capture.recovered', 'pi' => $piId,
                'extra' => ['service_booking_id' => $fresh->id, 'deposit' => true],
                'description' => "Charged the deposit PI {$piId} via cron after sync capture missed",
            ];
        }
        $this->guarded(
            fn () => app(AppointmentMoney::class)->recordDeposit($fresh),
            'Capture cron (service) — deposit record failed', ['service_booking_id' => $fresh->id],
        );
        if ($status === 'succeeded' && $cancelledInTime) {
            // Charged before the in-time cancellation could release it: a manager's refund gives it back (Part E).
            return $this->flagServiceBookingForRefund($fresh, $piId, false, $audits);
        }

        return $this->tally([$outcome => 1]);
    }
```

- [ ] **Step 4: The orphan release covers deposits**

In `PortalPaymentIntentGuard.php`, right after the `PORTAL_KINDS` constant add:

```php
    /** Holds the orphan release may cancel: the portal's, and the booking page's deposits (Part H §5.5). */
    public const ORPHAN_KINDS = [...self::PORTAL_KINDS, \App\Services\Appointments\Money\Deposits::KIND];
```

In `releaseOrphan()`, change `if (!in_array($meta['kind'] ?? null, self::PORTAL_KINDS, true)) {` to `if (!in_array($meta['kind'] ?? null, self::ORPHAN_KINDS, true)) {`.

In `ReleaseOrphanPortalHolds::isOrphanedHold()`, change `PortalPaymentIntentGuard::PORTAL_KINDS` to `PortalPaymentIntentGuard::ORPHAN_KINDS`.

- [ ] **Step 5: Run the new test and the existing job tests**

Run: `cd /c/wamp64/www/Hexa-Tech-appointments && /c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Appointments/Money/DepositJobsTest.php && /c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Booking/CapturePendingPaymentIntentsTest.php && /c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Booking/ReleaseOrphanPortalHoldsTest.php`
Expected: all pass. The existing tests' bookings carry no `meta.deposit`, so their paths are unchanged.

- [ ] **Step 6: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-appointments
git add app/Console/Commands/CapturePendingPaymentIntents.php app/Services/Booking/PortalPaymentIntentGuard.php app/Console/Commands/ReleaseOrphanPortalHolds.php tests/Feature/Appointments/Money/DepositJobsTest.php
git commit -m "$(cat <<'EOF'
Capture job and orphan release: a delayed deposit is charged as a deposit or released by its window

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Cancelling keeps or returns the deposit

**Files:**
- Create: `app/Services/Appointments/Money/DepositRule.php`
- Modify: `app/Services/Appointments/AppointmentActionRunner.php` (constructor, `run()`)
- Modify: `app/Services/Appointments/AppointmentActions.php` (`consequences()`, new `depositFor()`, class docblock)
- Modify: `app/Http/Controllers/Api/V1/Admin/ServiceBookingController.php` (`bulk()` 240-330, `updateStatus()` 549-610, `destroy()` 612-635)
- Modify: `app/Services/Booking/CancellationPolicy.php` (`forService()`), `app/Services/Booking/ServiceBookingRefund.php` (`giveBack()` :45)
- Test: `tests/Feature/Appointments/Money/DepositCancelTest.php`, `tests/Feature/Appointments/FullAdminDepositCancelTest.php`

**Interfaces:**
- Consumes: `Deposits::of/inTime`, `AppointmentMoney::summary/refundInLock/afterRefunds`, `TakesDeposits`.
- Produces:
  - `DepositRule::OPEN`, `DepositRule::applies(ServiceBooking $b): bool`, `DepositRule::onCancel(ServiceBooking $b, User $actor, ?\DateTimeInterface $now = null): string` (`none` | `kept` | `released` | `refunded`)
  - `AppointmentActions::consequences()` gains `deposit`: `null` or `{code: 'goes_back'|'kept_late'|'kept', amount: float, currency: string, cancel_hours: int}`
  - Full admin bulk answer gains `failed: string[]` (references), only when some failed.

- [ ] **Step 1: Write the failing workspace test**

Create `tests/Feature/Appointments/Money/DepositCancelTest.php`:

```php
<?php

namespace Tests\Feature\Appointments\Money;

use App\Models\ServiceBooking;
use App\Models\ServiceBookingPayment;
use App\Services\Appointments\AppointmentPresenter;
use App\Services\Appointments\Money\AppointmentMoney;
use App\Services\Booking\CancellationPolicy;
use App\Services\Booking\ServiceBookingRefund;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Queue;
use Illuminate\Testing\TestResponse;
use Mockery;
use Stripe\Refund;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\Concerns\TakesDeposits;
use Tests\TestCase;

/** Part H §6: what Cancel, No-show, Move and Reopen in the workspace do with a booking-page deposit. */
class DepositCancelTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema, TakesDeposits;

    private $stripe;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
        Queue::fake();
        $this->stripe = $this->stripeForDeposits();
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    private function act(ServiceBooking $b, string $action, array $extra = [], $as = null): TestResponse
    {
        return ($as ? $this->actingAs($as, 'sanctum') : $this->asStaff())->postJson($this->api("bookings/{$b->id}/actions"), [
            'action' => $action, 'revision' => AppointmentPresenter::revision($b->fresh()), 'reason' => 'Client ill',
        ] + $extra);
    }

    /** The server's deposit consequence for one action, as the panel receives it. */
    private function depositLine(ServiceBooking $b, string $action): ?array
    {
        $actions = collect($this->asStaff()->getJson($this->api("bookings/{$b->id}"))->assertOk()->json('booking.actions'));

        return $actions->firstWhere('key', $action)['consequences']['deposit'] ?? null;
    }

    private function refunds(int $times = 1, float $amount = 12.0): void
    {
        $this->stripe->shouldReceive('refund')->times($times)
            ->withArgs(fn ($pi, $a) => str_starts_with((string) $pi, 'pi_dep_') && abs((float) $a - $amount) < 0.001)
            ->andReturn(Refund::constructFrom(['id' => 're_dep', 'status' => 'succeeded']));
    }

    public function test_cancelled_in_time_the_deposit_goes_back_whoever_cancels(): void
    {
        $b = $this->takenDeposit();
        $this->assertSame(['code' => 'goes_back', 'amount' => 12, 'currency' => 'EUR', 'cancel_hours' => 24], $this->depositLine($b, 'cancel'));
        $this->refunds();

        $this->act($b, 'cancel', [], $this->staffUser($this->org, ['role' => 'staff']))->assertOk()
            ->assertJsonPath('booking.status', 'cancelled')
            ->assertJsonPath('booking.payment.raw', 'refunded');

        $refund = ServiceBookingPayment::where('kind', 'refund')->sole();
        $this->assertSame(['online_card', 12.0], [$refund->method, $refund->amount]);
    }

    public function test_cancelled_late_the_venue_keeps_it(): void
    {
        $b = $this->takenDeposit();
        $this->travelTo(CarbonImmutable::parse('2026-10-05 10:00:01'));
        $this->assertSame('kept_late', $this->depositLine($b, 'cancel')['code']);
        $this->stripe->shouldNotReceive('refund');

        $this->act($b, 'cancel')->assertOk()
            ->assertJsonPath('booking.status', 'cancelled')
            ->assertJsonPath('booking.money.to_refund', 0)
            ->assertJsonPath('booking.money.refundable_online', 12);
        $this->assertSame('unpaid', $b->fresh()->payment_status);
    }

    public function test_the_line_turns_from_goes_back_to_kept_one_second_after_the_deadline_in_riga(): void
    {
        $this->setSetting('hotel_timezone', 'Europe/Riga');
        $b = $this->takenDeposit(); // tomorrow 10:00 in Riga = 07:00 UTC, so the deadline is today 07:00 UTC

        $this->travelTo(CarbonImmutable::parse('2026-10-05 07:00:00', 'UTC'));
        $this->assertSame('goes_back', $this->depositLine($b, 'cancel')['code']);
        $this->travelTo(CarbonImmutable::parse('2026-10-05 07:00:01', 'UTC'));
        $this->assertSame('kept_late', $this->depositLine($b, 'cancel')['code']);
    }

    public function test_a_no_show_keeps_the_deposit(): void
    {
        $b = $this->takenDeposit();
        $this->assertSame('kept', $this->depositLine($b, 'no_show')['code']);
        $this->stripe->shouldNotReceive('refund');

        $this->act($b, 'no_show')->assertOk()->assertJsonPath('booking.status', 'no_show');
        $this->assertSame(0, ServiceBookingPayment::where('kind', 'refund')->count());
    }

    public function test_a_refund_stripe_refuses_cancels_nothing(): void
    {
        $b = $this->takenDeposit();
        $this->stripe->shouldReceive('refund')->andThrow(new \RuntimeException('card closed'));

        $this->act($b, 'cancel')->assertStatus(422)->assertJsonPath('error', 'deposit_refund_failed');

        $this->assertSame('confirmed', $b->fresh()->status);
        $this->assertSame(0, ServiceBookingPayment::where('kind', 'refund')->count());
    }

    public function test_a_manager_who_names_the_card_refund_decides_it(): void
    {
        $b = $this->takenDeposit();
        $this->refunds(1, 5.0);

        $this->act($b, 'cancel', ['refunds' => [['via' => 'online_card', 'amount' => 5]]])->assertOk();
        $this->assertSame(5.0, ServiceBookingPayment::where('kind', 'refund')->sole()->amount);
    }

    public function test_a_manager_can_give_a_kept_deposit_back(): void
    {
        $b = $this->takenDeposit();
        $this->travelTo(CarbonImmutable::parse('2026-10-05 12:00:00'));
        $this->act($b, 'cancel')->assertOk();
        $this->refunds();

        $after = app(AppointmentMoney::class)->refund($b->id, 12, 'online_card', 'Goodwill', AppointmentPresenter::revision($b->fresh()), $this->staff);
        $this->assertSame('refunded', $after->payment_status);
        $this->assertSame(12.0, AppointmentMoney::summary($after)['paid_back']);
    }

    public function test_a_deposit_still_only_held_is_left_to_the_capture_job(): void
    {
        $b = $this->seedDepositBooking();
        $this->assertSame('goes_back', $this->depositLine($b, 'cancel')['code']);
        $this->stripe->shouldNotReceive('refund');

        $this->act($b, 'cancel')->assertOk()->assertJsonPath('booking.status', 'cancelled');
        $this->assertSame('authorized', $b->fresh()->payment_status, 'the capture job releases it');
    }

    public function test_moving_keeps_the_terms_against_the_new_start(): void
    {
        $b = $this->takenDeposit();
        $this->asStaff()->patchJson($this->api("bookings/{$b->id}"), [
            'start' => '2026-10-07T14:00', 'master_id' => $this->master->id, 'revision' => AppointmentPresenter::revision($b->fresh()),
        ])->assertOk();

        $this->assertSame(['amount' => 12, 'percent' => 20, 'cancel_hours' => 24], $b->fresh()->meta['deposit']);
        $this->travelTo(CarbonImmutable::parse('2026-10-05 11:00:00')); // late for the old start, in time for the new one
        $this->assertSame('goes_back', $this->depositLine($b, 'cancel')['code']);
    }

    public function test_reopen_is_refused_after_a_refunded_deposit_and_allowed_after_a_kept_one(): void
    {
        $refunded = $this->takenDeposit();
        $this->refunds();
        $this->act($refunded, 'cancel')->assertOk();
        $this->act($refunded, 'reopen')->assertStatus(422)->assertJsonPath('error', 'money_returned');

        $kept = $this->takenDeposit(['start_at' => '2026-10-05 15:00:00', 'end_at' => '2026-10-05 15:45:00']); // window closed yesterday
        $this->act($kept, 'cancel')->assertOk();
        $this->act($kept, 'reopen')->assertOk()->assertJsonPath('booking.status', 'confirmed');
    }

    public function test_a_booking_without_a_deposit_has_no_deposit_line(): void
    {
        $this->assertNull($this->depositLine($this->seedBooking(), 'cancel'));
    }

    public function test_the_member_portal_counts_the_window_the_booking_was_made_with(): void
    {
        $this->setSetting('services_cancel_hours', '48'); // changed after the booking was made on 24
        $b = $this->takenDeposit();

        $this->assertSame('2026-10-05T10:00:00+00:00', CancellationPolicy::forService($b)['deadline']->utc()->toIso8601String());
    }

    public function test_the_member_portal_names_the_deposit_it_releases(): void
    {
        $b = $this->seedDepositBooking();
        $pi = $b->stripe_payment_intent_id;
        $this->stripe->shouldReceive('retrievePaymentIntent')->andReturn($this->depositIntent($pi));
        $this->stripe->shouldReceive('cancelPaymentIntent')->once()->with($pi, 'requested_by_customer');

        $out = app(ServiceBookingRefund::class)->giveBack($b);
        $this->assertSame(['released', 12.0], [$out['money'], $out['amount']]);
    }
}
```

- [ ] **Step 2: Write the failing full-admin test**

Create `tests/Feature/Appointments/FullAdminDepositCancelTest.php`:

```php
<?php

namespace Tests\Feature\Appointments;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Queue;
use Mockery;
use Stripe\Refund;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\Concerns\TakesDeposits;
use Tests\TestCase;

/** Part H §6.1: the full admin's status change, delete and bulk cancel follow the deposit's window too. */
class FullAdminDepositCancelTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema, TakesDeposits;

    private $stripe;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments(enabled: false);
        Queue::fake();
        $this->stripe = $this->stripeForDeposits();
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    private function refundOk(string $pi): void
    {
        $this->stripe->shouldReceive('refund')->once()->withArgs(fn ($id) => $id === $pi)
            ->andReturn(Refund::constructFrom(['id' => 're_' . $pi, 'status' => 'succeeded']));
    }

    public function test_a_status_change_to_cancelled_refunds_in_time_and_keeps_late(): void
    {
        $inTime = $this->takenDeposit();
        $this->refundOk($inTime->stripe_payment_intent_id);
        $this->asStaff()->patchJson("/api/v1/admin/service-bookings/{$inTime->id}/status", ['status' => 'cancelled'])->assertOk();
        $this->assertSame(['cancelled', 'refunded'], [$inTime->fresh()->status, $inTime->fresh()->payment_status]);

        $late = $this->takenDeposit(['start_at' => '2026-10-05 15:00:00', 'end_at' => '2026-10-05 15:45:00']);
        $this->asStaff()->patchJson("/api/v1/admin/service-bookings/{$late->id}/status", ['status' => 'cancelled'])->assertOk();
        $this->assertSame(['cancelled', 'unpaid'], [$late->fresh()->status, $late->fresh()->payment_status]);
    }

    public function test_a_refused_refund_leaves_the_booking_as_it_was(): void
    {
        $b = $this->takenDeposit();
        $this->stripe->shouldReceive('refund')->andThrow(new \RuntimeException('card closed'));

        $this->asStaff()->patchJson("/api/v1/admin/service-bookings/{$b->id}/status", ['status' => 'cancelled'])
            ->assertStatus(422)->assertJsonPath('error', 'deposit_refund_failed');
        $this->assertSame('confirmed', $b->fresh()->status);
    }

    public function test_delete_follows_the_same_rule(): void
    {
        $b = $this->takenDeposit();
        $this->refundOk($b->stripe_payment_intent_id);

        $this->asStaff()->deleteJson("/api/v1/admin/service-bookings/{$b->id}")->assertOk();
        $this->assertSame(['cancelled', 'refunded'], [$b->fresh()->status, $b->fresh()->payment_status]);
    }

    public function test_a_bulk_cancel_keeps_only_the_booking_whose_refund_was_refused(): void
    {
        $refused = $this->takenDeposit();
        $refunded = $this->takenDeposit(['start_at' => '2026-10-06 12:00:00', 'end_at' => '2026-10-06 12:45:00']);
        $plain = $this->seedBooking(['start_at' => '2026-10-06 14:00:00', 'end_at' => '2026-10-06 14:45:00']);
        $this->stripe->shouldReceive('refund')->withArgs(fn ($id) => $id === $refused->stripe_payment_intent_id)->andThrow(new \RuntimeException('card closed'));
        $this->refundOk($refunded->stripe_payment_intent_id);

        $res = $this->asStaff()->postJson('/api/v1/admin/service-bookings/bulk', ['ids' => [$refused->id, $refunded->id, $plain->id], 'action' => 'cancel'])
            ->assertOk()->assertJsonPath('updated', 2)->assertJsonPath('failed', [$refused->booking_reference]);
        $this->assertStringContainsString($refused->booking_reference, $res->json('message'));

        $this->assertSame('confirmed', $refused->fresh()->status);
        $this->assertSame(['cancelled', 'refunded'], [$refunded->fresh()->status, $refunded->fresh()->payment_status]);
        $this->assertSame('cancelled', $plain->fresh()->status);
    }

    public function test_a_bulk_status_change_to_cancelled_follows_the_rule(): void
    {
        $b = $this->takenDeposit();
        $this->refundOk($b->stripe_payment_intent_id);

        $this->asStaff()->postJson('/api/v1/admin/service-bookings/bulk', ['ids' => [$b->id], 'action' => 'mark_status', 'value' => 'cancelled'])
            ->assertOk()->assertJsonMissingPath('failed');
        $this->assertSame(['cancelled', 'refunded'], [$b->fresh()->status, $b->fresh()->payment_status]);
    }
}
```

- [ ] **Step 3: Run both and watch them fail**

Run: `cd /c/wamp64/www/Hexa-Tech-appointments && /c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Appointments/Money/DepositCancelTest.php && /c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Appointments/FullAdminDepositCancelTest.php`
Expected: FAIL. There is no `deposit` consequence, no refund on cancel and no `failed` list. A few tests pass already, which is right because they pin what must not change: late keeps, no-show keeps, held left alone, no line for a plain booking, reopen allowed after a kept deposit.

- [ ] **Step 4: The rule**

Create `app/Services/Appointments/Money/DepositRule.php`:

```php
<?php

namespace App\Services\Appointments\Money;

use App\Models\ServiceBooking;
use App\Models\User;
use App\Services\Appointments\AppointmentRefused;

/**
 * What a staff cancellation does to a booking-page deposit (Part H §6.1),
 * one rule for every path: the workspace's Cancel, and the full admin's
 * status change, delete and bulk cancel.
 *  - Cancelled at or before the deadline: the deposit goes back to the card
 *    now, whoever cancels. A deposit still only held is released by the
 *    capture job.
 *  - Cancelled later: the venue keeps it. A manager may still give it back
 *    with Part E's refund.
 * A no-show is not a cancellation: its deposit is kept and nothing runs.
 */
final class DepositRule
{
    /** The statuses a cancellation can come from. */
    public const OPEN = ['pending', 'confirmed', 'in_progress'];

    public function __construct(private readonly AppointmentMoney $money)
    {
    }

    /** The booking carries a deposit and is still open, so a cancellation decides what happens to it. */
    public static function applies(ServiceBooking $b): bool
    {
        return Deposits::of($b) !== null && in_array((string) $b->status, self::OPEN, true);
    }

    /**
     * Inside the caller's transaction, the booking row locked, before the
     * cancellation is saved. A refund Stripe refuses throws, so nothing is
     * cancelled.
     *
     * @return 'none'|'kept'|'released'|'refunded'
     */
    public function onCancel(ServiceBooking $b, User $actor, ?\DateTimeInterface $now = null): string
    {
        if (!self::applies($b)) {
            return 'none';
        }
        if (!Deposits::inTime($b, $now ?? now())) {
            return 'kept';
        }
        $back = AppointmentMoney::summary($b)['refundable_online'];
        if ($back <= 0) {
            return 'released';
        }
        try {
            $this->money->refundInLock($b, $back, 'online_card', 'Deposit: cancelled in time', $actor);
        } catch (AppointmentRefused $e) {
            if (in_array($e->errorCode, ['refund_failed', 'refund_unavailable'], true)) {
                throw new AppointmentRefused('deposit_refund_failed', 'The deposit could not be refunded just now. Try again.', 422);
            }
            throw $e;
        }

        return 'refunded';
    }
}
```

- [ ] **Step 5: The workspace runner and its consequence codes**

In `AppointmentActionRunner.php`:
- Add `use App\Services\Appointments\Money\DepositRule;`.
- Add the constructor parameter `private readonly DepositRule $deposits,` after `private readonly CouponRelease $coupons,`.
- In the class docblock, change "It writes the appointment's own status (payments and refunds are AppointmentMoney's) and nothing else — no payment, refund or message is triggered from here." to "It writes the appointment's own status (payments and refunds are AppointmentMoney's); the one refund it starts is a booking-page deposit's on a cancellation in time (Part H, DepositRule). No payment or message is triggered from here."
- Change `$preview = null;` to `$preview = null;\n        $depositBack = false;` and the closure's `use (...)` to add `&$depositBack`.
- After the `foreach ($refunds as $r) { … }` loop add:

```php
            // Part H: a booking-page deposit follows its window — refunded now when cancelled in time, kept when late —
            // unless a manager named a card refund on this cancellation: that refund is then the decision (ruling 3).
            if ($action === 'cancel' && !in_array('online_card', array_map(fn (array $r) => (string) $r['via'], $refunds), true)) {
                $depositBack = $this->deposits->onCancel($booking, $actor) === 'refunded';
            }
```

- Change `if ($refunds !== []) {` (the one calling `afterRefunds`) to `if ($refunds !== [] || $depositBack) {`.

In `AppointmentActions.php`:
- Add `use App\Services\Appointments\Money\DepositRule;` and `use App\Services\Appointments\Money\Deposits;`.
- In the class docblock, replace "- nothing refunds a captured payment on a staff cancellation, and nothing flags it either: the job never visits a booking already `paid`;" with "- nothing refunds a captured payment on a staff cancellation, and nothing flags it either: the job never visits a booking already `paid` — except a booking-page deposit, which goes back on a cancellation in time (Part H, DepositRule);".
- Update the `consequences()` `@return` to `array{payment: string, points: ?array{points: int, reason: ?string}, coupon: string, message: string, deposit: ?array{code: string, amount: float, currency: string, cancel_hours: int}}`, and add to its returned array after `'message' => …,`:

```php
            // Part H: what a cancel or a no-show does to a booking-page deposit; null for every other booking.
            'deposit' => self::depositFor($b, $action),
```

- Add the method before `stillAhead()`:

```php
    /**
     * Part H §6.2: `goes_back` (cancelled in time: refunded now, or the hold
     * released), `kept_late`, or `kept` (a no-show), with the amount at
     * stake; null when the booking has no deposit left to decide about.
     *
     * @return array{code: string, amount: float, currency: string, cancel_hours: int}|null
     */
    private static function depositFor(ServiceBooking $b, string $action): ?array
    {
        if (!in_array($action, ['cancel', 'no_show'], true) || !DepositRule::applies($b)) {
            return null;
        }
        $s = AppointmentMoney::summary($b);
        $amount = $s['held_online'] > 0 ? $s['held_online'] : $s['refundable_online'];
        if ($amount <= 0) {
            return null;
        }

        return [
            'code'         => $action === 'no_show' ? 'kept' : (Deposits::inTime($b, now()) ? 'goes_back' : 'kept_late'),
            'amount'       => round($amount, 2),
            'currency'     => $s['currency'],
            'cancel_hours' => Deposits::of($b)['cancel_hours'],
        ];
    }
```

- [ ] **Step 6: The full admin's three cancel paths**

In `ServiceBookingController.php` add `use App\Services\Appointments\AppointmentRefused;` and `use App\Services\Appointments\Money\DepositRule;`.

`updateStatus()`: inside the transaction, right after the line `$before = ['status' => (string) $booking->status, 'payment_status' => (string) $booking->payment_status];`, add:

```php
            // Part H: a booking-page deposit follows its window — refunded now when cancelled in time, kept when late.
            // A refund Stripe refuses throws (422 deposit_refund_failed) and nothing is saved.
            if (($data['status'] ?? null) === 'cancelled' && DepositRule::applies($booking)) {
                app(DepositRule::class)->onCancel($booking, $request->user());
            }
```

`destroy()`: replace the three lines from `$booking = ServiceBooking::findOrFail($id);` through `$booking->update(['status' => 'cancelled', 'cancelled_at' => now()]);` with:

```php
        // Under the row lock, so a deposit's refund (Part H) and the cancellation are one step.
        [$booking, $before] = DB::transaction(function () use ($id, $request) {
            $booking = ServiceBooking::lockForUpdate()->findOrFail($id);
            $before = ['status' => (string) $booking->status];
            if (DepositRule::applies($booking)) {
                app(DepositRule::class)->onCancel($booking, $request->user());
            }
            $booking->update(['status' => 'cancelled', 'cancelled_at' => now()]);

            return [$booking, $before];
        });
```

`bulk()`: replace the block from `$updated = 0;` through the end of the `DB::transaction(function () use ($rows, $validated, &$updated, &$patches) { … });` with:

```php
        $updated = 0;
        $patches = [];
        // Part H: a booking with a booking-page deposit is cancelled on its own, its refund first (DepositRule). One whose
        // refund Stripe refuses stays as it was, and the others go ahead.
        $cancels = $validated['action'] === 'cancel' || ($validated['action'] === 'mark_status' && ($validated['value'] ?? null) === 'cancelled');
        $alone = $cancels ? $rows->filter(fn (ServiceBooking $b) => DepositRule::applies($b))->pluck('id')->all() : [];
        $failed = [];
        foreach ($rows->whereIn('id', $alone) as $b) {
            try {
                DB::transaction(function () use ($b, $request) {
                    $locked = ServiceBooking::lockForUpdate()->findOrFail($b->id);
                    app(DepositRule::class)->onCancel($locked, $request->user());
                    $locked->update(['status' => 'cancelled', 'cancelled_at' => $locked->cancelled_at ?? now()]);
                });
                $patches[$b->id] = ['status' => 'cancelled'];
                $updated++;
            } catch (AppointmentRefused) {
                $failed[$b->id] = (string) $b->booking_reference;
            }
        }
        DB::transaction(function () use ($rows, $validated, $alone, &$updated, &$patches) {
            foreach ($rows as $b) {
                if (in_array($b->id, $alone, true)) {
                    continue;
                }
                $patch = match ($validated['action']) {
                    'cancel'        => ['status' => 'cancelled', 'cancelled_at' => now()],
                    'mark_complete' => ['status' => 'completed'],
                    'mark_no_show'  => ['status' => 'no_show'],
                    'mark_status'   => ['status' => $validated['value'] ?? $b->status],
                };
                ServiceBooking::where('id', $b->id)->lockForUpdate()->update($patch);
                $patches[$b->id] = $patch;
                $updated++;
            }
        });
        // A booking left as it was is neither audited nor messaged below.
        $rows = $rows->reject(fn (ServiceBooking $b) => isset($failed[$b->id]))->values();
```

and replace the final `return response()->json([…]);` with:

```php
        $message = "{$updated} booking" . ($updated === 1 ? '' : 's') . ' updated.';
        if ($failed !== []) {
            $message .= ' Not cancelled — the deposit could not be refunded just now: ' . implode(', ', $failed) . '. Try again.';
        }

        return response()->json([
            'updated' => $updated,
            'message' => $message,
            'client_messages' => $counts,
        ] + ($failed !== [] ? ['failed' => array_values($failed)] : []));
```

- [ ] **Step 7: The member portal honours the booking's terms (ruling 2)**

In `CancellationPolicy::forService()`, replace `$hours = max(0, (int) HotelSetting::getValue('services_cancel_hours', 24));` with:

```php
        // A booking-page deposit booking keeps the window it was made on (Part H §5.2).
        $hours = Deposits::of($b)['cancel_hours'] ?? max(0, (int) HotelSetting::getValue('services_cancel_hours', 24));
```

and add `use App\Services\Appointments\Money\Deposits;`.

In `ServiceBookingRefund::giveBack()`, replace `$amount = round((float) $b->total_amount, 2);` with:

```php
        // A booking-page deposit booking's card carries the deposit, not the whole price (Part H).
        $amount = round((float) (Deposits::of($b)['amount'] ?? $b->total_amount), 2);
```

and add `use App\Services\Appointments\Money\Deposits;`.

- [ ] **Step 8: Run the two tests and the suites they touch**

Run: `cd /c/wamp64/www/Hexa-Tech-appointments && for t in tests/Feature/Appointments/Money/ tests/Feature/Appointments/FullAdminDepositCancelTest.php tests/Feature/Appointments/AppointmentActionEndpointTest.php tests/Feature/Appointments/AppointmentActionsTest.php tests/Feature/Appointments/ReopenTest.php tests/Feature/Appointments/FullAdminAuditActorTest.php tests/Feature/Member/; do /c/wamp64/bin/php/php8.4.20/php.exe artisan test $t 2>&1 | grep -E "Tests:|FAIL" ; done`
Expected: every `Tests:` line shows no failures.

- [ ] **Step 9: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-appointments
git add app/Services/Appointments/Money/DepositRule.php app/Services/Appointments/AppointmentActionRunner.php app/Services/Appointments/AppointmentActions.php app/Http/Controllers/Api/V1/Admin/ServiceBookingController.php app/Services/Booking/CancellationPolicy.php app/Services/Booking/ServiceBookingRefund.php tests/Feature/Appointments/Money/DepositCancelTest.php tests/Feature/Appointments/FullAdminDepositCancelTest.php
git commit -m "$(cat <<'EOF'
Cancelling: a deposit goes back in time and is kept when late, on every cancel path

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: The client is told what happened to the deposit

**Files:**
- Modify: `app/Mail/AppointmentMessageMail.php` (`lines()`, new `depositLine()`)
- Modify: `resources/views/emails/appointment-message.blade.php`
- Modify: `lang/en/client_messages.php`, `lang/ru/client_messages.php`, `lang/de/client_messages.php`, `lang/fr/client_messages.php`, `lang/es/client_messages.php`
- Test: `tests/Feature/Appointments/Messages/DepositMessageTest.php`

**Interfaces:**
- Consumes: `Deposits::of/inTime`.
- Produces: `AppointmentMessageMail::lines()['deposit']` (`?string`). Language keys `client_messages.deposit.refunded` (`:amount`) and `client_messages.deposit.kept` (`:amount`, `:hours`).

- [ ] **Step 1: Write the failing test**

Create `tests/Feature/Appointments/Messages/DepositMessageTest.php`:

```php
<?php

namespace Tests\Feature\Appointments\Messages;

use App\Mail\AppointmentMessageMail;
use App\Models\ClientMessage;
use App\Models\ServiceBooking;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Mockery;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\Concerns\TakesDeposits;
use Tests\TestCase;

/** Part H §6.3: the cancellation email says what happened to the deposit, in the client's language. */
class DepositMessageTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema, TakesDeposits;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
        $this->stripeForDeposits();
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    private function mail(ServiceBooking $b, string $kind, string $locale = 'en'): AppointmentMessageMail
    {
        $message = ClientMessage::create([
            'service_booking_id' => $b->id, 'kind' => $kind, 'channel' => 'email', 'recipient' => 'ada@example.test',
            'locale' => $locale, 'status' => 'queued', 'for_start_at' => '2026-10-06 10:00:00',
        ]);

        return new AppointmentMessageMail($message, $b->fresh(['service', 'master']));
    }

    public function test_a_cancellation_in_time_says_the_deposit_is_being_refunded(): void
    {
        $mail = $this->mail($this->takenDeposit(['status' => 'cancelled', 'cancelled_at' => now()]), 'cancelled');

        $this->assertSame('Your deposit of EUR 12.00 is being refunded to your card.', $mail->lines()['deposit']);
        $this->assertStringContainsString('Your deposit of EUR 12.00 is being refunded to your card.', $mail->render());
    }

    public function test_a_late_cancellation_says_the_deposit_is_kept(): void
    {
        $b = $this->takenDeposit(['status' => 'cancelled', 'cancelled_at' => '2026-10-05 12:00:00']); // after the 10:00 deadline

        $this->assertSame('The deposit of EUR 12.00 is kept, as the visit was cancelled less than 24 hours before.', $this->mail($b, 'cancelled')->lines()['deposit']);
    }

    public function test_only_a_cancellation_of_a_deposit_booking_mentions_a_deposit(): void
    {
        $this->assertNull($this->mail($this->takenDeposit(), 'confirmed')->lines()['deposit']);
        $this->assertNull($this->mail($this->seedBooking(['status' => 'cancelled', 'cancelled_at' => now()]), 'cancelled')->lines()['deposit']);
    }

    public function test_both_lines_are_in_every_language(): void
    {
        $inTime = $this->takenDeposit(['status' => 'cancelled', 'cancelled_at' => now()]);
        $late = $this->takenDeposit(['status' => 'cancelled', 'cancelled_at' => '2026-10-05 12:00:00']);
        foreach (['ru', 'de', 'fr', 'es'] as $locale) {
            foreach (['refunded' => $inTime, 'kept' => $late] as $key => $b) {
                $line = $this->mail($b, 'cancelled', $locale)->lines()['deposit'];
                $this->assertStringContainsString('EUR 12.00', $line, "{$locale}/{$key}");
                $this->assertNotSame(__("client_messages.deposit.{$key}", ['amount' => 'EUR 12.00', 'hours' => 24], 'en'), $line, "{$locale}/{$key} is translated");
            }
        }
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd /c/wamp64/www/Hexa-Tech-appointments && /c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Appointments/Messages/DepositMessageTest.php`
Expected: FAIL with `Undefined array key "deposit"`.

- [ ] **Step 3: The words**

In each `lang/{locale}/client_messages.php`, add after the `'book_again' => …,` line:

| Locale | Lines |
|---|---|
| en | `'deposit' => ['refunded' => 'Your deposit of :amount is being refunded to your card.', 'kept' => 'The deposit of :amount is kept, as the visit was cancelled less than :hours hours before.'],` |
| ru | `'deposit' => ['refunded' => 'Ваш депозит :amount возвращается на вашу карту.', 'kept' => 'Депозит :amount не возвращается: визит отменён менее чем за :hours ч.'],` |
| de | `'deposit' => ['refunded' => 'Ihre Anzahlung von :amount wird auf Ihre Karte zurückerstattet.', 'kept' => 'Die Anzahlung von :amount wird einbehalten, da weniger als :hours Stunden vorher storniert wurde.'],` |
| fr | `'deposit' => ['refunded' => 'Votre acompte de :amount est remboursé sur votre carte.', 'kept' => 'L’acompte de :amount est conservé, l’annulation ayant eu lieu moins de :hours heures avant.'],` |
| es | `'deposit' => ['refunded' => 'Le devolvemos a su tarjeta el depósito de :amount.', 'kept' => 'El depósito de :amount no se devuelve, ya que la cita se canceló con menos de :hours horas de antelación.'],` |

- [ ] **Step 4: The line in the mail**

In `AppointmentMessageMail::lines()`, add to the returned array after `'closing' => …,`:

```php
            // Part H §6.3: what a cancellation did to the booking-page deposit.
            'deposit'   => $kind === 'cancelled' ? self::depositLine($b, $t) : null,
```

Add the method after `lines()` (and `use App\Services\Appointments\Money\Deposits;`):

```php
    /** Part H: refunded (cancelled in time) or kept (cancelled late); null for a booking without a deposit. */
    private static function depositLine(ServiceBooking $b, \Closure $t): ?string
    {
        $d = Deposits::of($b);
        if ($d === null) {
            return null;
        }
        $amount = strtoupper((string) ($b->currency ?: 'EUR')) . ' ' . number_format($d['amount'], 2);

        return Deposits::inTime($b, $b->cancelled_at ?? now())
            ? $t('deposit.refunded', ['amount' => $amount])
            : $t('deposit.kept', ['amount' => $amount, 'hours' => $d['cancel_hours']]);
    }
```

In `resources/views/emails/appointment-message.blade.php`, after the `@endforeach` of the rows, add:

```blade
    @if (!empty($deposit))
        <p>{{ $deposit }}</p>
    @endif
```

- [ ] **Step 5: Run the messages suite**

Run: `cd /c/wamp64/www/Hexa-Tech-appointments && /c/wamp64/bin/php/php8.4.20/php.exe artisan view:clear && /c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Appointments/Messages/`
Expected: every test passes (`AppointmentMessageMailTest` unchanged: its bookings carry no deposit).

- [ ] **Step 6: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-appointments
git add app/Mail/AppointmentMessageMail.php resources/views/emails/appointment-message.blade.php lang/en/client_messages.php lang/ru/client_messages.php lang/de/client_messages.php lang/fr/client_messages.php lang/es/client_messages.php tests/Feature/Appointments/Messages/DepositMessageTest.php
git commit -m "$(cat <<'EOF'
Client messages: the cancellation email says whether the deposit is refunded or kept

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: The chat sends deposit bookings to the booking page

**Files:**
- Modify: `app/Services/Appointments/Money/Deposits.php` (add `bookingPageUrl()`)
- Modify: `app/Http/Controllers/Api/V1/Widget/WidgetChatController.php` (`bookService()` 2579-2664, `buildWidgetSystemPrompt()` 2666 + the In-Chat Booking rules ~2882, `sendMessage()` ~909)
- Modify: `public/widget/hotel-chat.js` (the booking card's failure branch, ~1695)
- Test: `tests/Feature/Booking/ChatDepositTest.php`

**Interfaces:**
- Consumes: `Deposits::termsFor/onlineNow`, `BookingRules::currency()`.
- Produces: `Deposits::bookingPageUrl(int $orgId, ?int $serviceId = null, ?int $masterId = null): ?string`. `POST /v1/widget/{key}/book-service` answers 422 `{error: 'deposit_required', message, booking_url}` at a deposit venue. `buildWidgetSystemPrompt(..., bool $depositsOnline = false)`.

- [ ] **Step 1: Write the failing test**

Create `tests/Feature/Booking/ChatDepositTest.php`:

```php
<?php

namespace Tests\Feature\Booking;

use App\Http\Controllers\Api\V1\Widget\WidgetChatController;
use App\Models\ServiceBooking;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Mockery;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\Concerns\TakesDeposits;
use Tests\TestCase;

/** Part H §4.4: at a venue with deposits the chat does not book services itself; it sends the visitor to the booking page. */
class ChatDepositTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema, TakesDeposits;

    private string $key;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
        $this->stripeForDeposits();
        // The chat widget's config, as WidgetConfigCacheBustTest builds it.
        if (!Schema::hasTable('chat_widget_configs')) {
            Schema::create('chat_widget_configs', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('brand_id')->nullable();
                $t->string('widget_key', 64)->nullable();
                $t->string('api_key', 100)->nullable();
                $t->string('company_name')->nullable();
                $t->string('header_title')->nullable();
                $t->string('welcome_message')->nullable();
                $t->boolean('is_active')->default(true);
                $t->timestamps();
            });
        }
        $this->key = (string) Str::uuid();
        DB::table('chat_widget_configs')->insert(['organization_id' => $this->org->id, 'widget_key' => $this->key, 'company_name' => 'Lumière Salon', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
        $this->org->forceFill(['widget_token' => 'wt-lumiere'])->save();
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    private function book(): TestResponse
    {
        return $this->postJson("/api/v1/widget/{$this->key}/book-service", [
            'service_id' => $this->service->id, 'service_master_id' => $this->master->id, 'start_at' => '2026-10-06T10:00:00+00:00',
            'customer_name' => 'Ada Guest', 'customer_email' => 'ada@example.test',
        ]);
    }

    public function test_at_a_venue_with_deposits_the_chat_sends_the_visitor_to_the_booking_page(): void
    {
        $this->depositsOn();

        $this->book()->assertStatus(422)
            ->assertJsonPath('error', 'deposit_required')
            ->assertJsonPath('booking_url', url('/services/wt-lumiere') . '?service=' . $this->service->id . '&master=' . $this->master->id);
        $this->assertSame(0, ServiceBooking::count());
    }

    public function test_without_deposits_the_chat_books_as_before(): void
    {
        $this->book()->assertStatus(201);
        $this->assertSame('chat_widget', ServiceBooking::sole()->source);
    }

    public function test_the_assistant_is_told_the_card_leads_to_the_booking_page(): void
    {
        $chat = app(WidgetChatController::class);
        $prompt = new \ReflectionMethod($chat, 'buildWidgetSystemPrompt');

        $this->assertStringContainsString('asks for a deposit', $prompt->invoke($chat, null, '', 'Lumière Salon', 'en', '', '', 'beauty', true));
        $this->assertStringNotContainsString('asks for a deposit', $prompt->invoke($chat, null, '', 'Lumière Salon', 'en', '', '', 'beauty', false));
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd /c/wamp64/www/Hexa-Tech-appointments && /c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Booking/ChatDepositTest.php`
Expected: FAIL. The first test gets 201 instead of 422. The prompt test errors on the eighth argument (an unknown parameter is ignored, so the assertion fails). `test_without_deposits_the_chat_books_as_before` passes, which pins today's behaviour.

If the first request 500s on `brands` (`resolveWidget()` looks up the default brand), set `brand_id` on the inserted config to an existing brand of the organisation instead. That is a test fix with a ledger ruling.

- [ ] **Step 3: The link and the answer**

Add to `Deposits` (with `use App\Models\Organization;`):

```php
    /** The venue's booking page, with the chosen service and team member already picked; null without a booking link. */
    public static function bookingPageUrl(int $orgId, ?int $serviceId = null, ?int $masterId = null): ?string
    {
        $token = (string) (Organization::withoutGlobalScopes()->whereKey($orgId)->value('widget_token') ?? '');
        if ($token === '') {
            return null;
        }
        $query = array_filter(['service' => $serviceId, 'master' => $masterId]);

        return url('/services/' . $token) . ($query !== [] ? '?' . http_build_query($query) : '');
    }
```

In `WidgetChatController::bookService()`, right after the `if (!$service) { … }` block, add:

```php
        // Part H §4.4: a venue that asks for a deposit takes it on its booking page; the chat sends the visitor there
        // instead of booking without it (ruling 5: decided on the service's list price).
        if (\App\Services\Appointments\Money\Deposits::termsFor((float) $service->price, (string) ($service->currency ?: 'EUR')) !== null) {
            return response()->json([
                'error'       => 'deposit_required',
                'message'     => 'This venue asks for a deposit when you book online. Please finish your booking on the booking page.',
                'booking_url' => \App\Services\Appointments\Money\Deposits::bookingPageUrl($orgId, (int) $service->id, isset($data['service_master_id']) ? (int) $data['service_master_id'] : null),
            ], 422);
        }
```

- [ ] **Step 4: The assistant's instruction**

Change the signature to `private function buildWidgetSystemPrompt(?ChatbotBehaviorConfig $config, string $knowledgeContext, string $companyName, ?string $userLang = null, string $bookingContext = '', string $bookingWidgetUrl = '', string $industry = 'hotel', bool $depositsOnline = false): string`.

After the line `$parts[] = "- Emit at most ONE BOOKING_CONFIRM per reply. Briefly summarise the booking in words above the block.";` add:

```php
        if ($depositsOnline) {
            $parts[] = "- This venue asks for a deposit when a service is booked online. The BOOKING_CONFIRM card then opens the venue's booking page, where the visitor pays the deposit and finishes the booking. Say so in one short sentence above the block, and never claim the booking is made.";
        }
```

In `sendMessage()`, change the call to

```php
        // Part H: a venue taking deposits books services on its booking page, where the deposit is paid.
        $depositsOnline = \App\Services\Appointments\Money\Deposits::onlineNow(\App\Services\Booking\Setup\BookingRules::currency());
        $systemPrompt = $this->buildWidgetSystemPrompt($behaviorConfig, $knowledgeContext, $config->company_name, $request->input('lang'), $bookingContextStr, $bookingWidgetUrl, $industry, $depositsOnline);
```

- [ ] **Step 5: The chat card offers the link**

In `public/widget/hotel-chat.js`, in the booking card's `else` branch, replace

```js
              var msg = (res.body && (res.body.message || res.body.error)) || 'Could not complete booking.';
              if (statusEl) { statusEl.style.display = 'block'; statusEl.textContent = msg; }
```

with

```js
              var msg = (res.body && (res.body.message || res.body.error)) || 'Could not complete booking.';
              if (statusEl) { statusEl.style.display = 'block'; statusEl.textContent = msg; }
              // Part H: a venue that takes deposits books on its booking page — offer the page, not "Try again".
              if (res.body && res.body.booking_url && statusEl) {
                var link = document.createElement('a');
                link.href = res.body.booking_url;
                link.target = '_blank';
                link.rel = 'noopener';
                link.textContent = 'Open the booking page';
                link.style.cssText = 'display:block;margin-top:6px;color:inherit;text-decoration:underline;font-weight:600';
                statusEl.appendChild(link);
                if (goBtn) goBtn.style.display = 'none';
                if (cancelBtn) cancelBtn.disabled = false;
                return;
              }
```

- [ ] **Step 6: Run the test and the chat-adjacent suites**

Run: `cd /c/wamp64/www/Hexa-Tech-appointments && /c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Booking/ && /c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Widget/ && node --check public/widget/hotel-chat.js`
Expected: every test passes, and `node --check` prints nothing.

- [ ] **Step 7: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-appointments
git add app/Services/Appointments/Money/Deposits.php app/Http/Controllers/Api/V1/Widget/WidgetChatController.php public/widget/hotel-chat.js tests/Feature/Booking/ChatDepositTest.php
git commit -m "$(cat <<'EOF'
Chat: at a venue with deposits, the booking card leads to the booking page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Setup switches deposits on

**Files:**
- Modify: `app/Services/Booking/Setup/BookingRules.php` (`rules()`, `read()`, `write()`)
- Modify: `app/Http/Controllers/Api/V1/Admin/Appointments/SetupSettingsController.php` (`update()`)
- Modify: `app/Services/Appointments/Money/Deposits.php` (add `REASONS`)
- Test: `tests/Feature/Appointments/Setup/SetupDepositsTest.php`

**Interfaces:**
- Consumes: `Deposits::switchedOn/percent/cancelHours/unavailableReason/PROPOSED_PERCENT`.
- Produces: settings keys `deposits_on` (bool), `deposit_percent` (int), `deposits_available` (bool), `deposits_reason` (`payments_off`|`mock_mode`|`currency_mismatch`|null), `cancel_hours` (int). Writable `deposits_on` and `deposit_percent` (1–100). Refusal 422 `{error: 'deposits_unavailable', message, reason}`. `Deposits::REASONS`.

- [ ] **Step 1: Write the failing test**

Create `tests/Feature/Appointments/Setup/SetupDepositsTest.php`:

```php
<?php

namespace Tests\Feature\Appointments\Setup;

use App\Services\Appointments\Money\Deposits;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Mockery;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\Concerns\TakesDeposits;
use Tests\TestCase;

/** Part H §4.1: the workspace Setup's "Deposits for online bookings", written to the full admin's own settings. */
class SetupDepositsTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema, TakesDeposits;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    public function test_setup_shows_them_off_proposes_twenty_percent_and_says_why_they_cannot_be_taken(): void
    {
        $this->asStaff()->getJson($this->api('setup'))->assertOk()
            ->assertJsonPath('settings.deposits_on', false)
            ->assertJsonPath('settings.deposit_percent', 20)
            ->assertJsonPath('settings.deposits_available', false)
            ->assertJsonPath('settings.deposits_reason', 'payments_off')
            ->assertJsonPath('settings.cancel_hours', 24);
    }

    public function test_switching_on_without_stripe_is_refused(): void
    {
        $this->asStaff()->patchJson($this->api('setup/settings'), ['deposits_on' => true, 'deposit_percent' => 20])
            ->assertStatus(422)->assertJsonPath('error', 'deposits_unavailable')->assertJsonPath('reason', 'payments_off');

        $this->assertFalse(Deposits::pageOn($this->org->id));
    }

    public function test_a_manager_switches_them_on_and_the_booking_page_reads_the_same_settings(): void
    {
        $this->stripeForDeposits();

        $this->asStaff()->patchJson($this->api('setup/settings'), ['deposits_on' => true, 'deposit_percent' => 25])->assertOk()
            ->assertJsonPath('settings.deposits_on', true)
            ->assertJsonPath('settings.deposit_percent', 25)
            ->assertJsonPath('settings.deposits_available', true);

        $this->getJson('/api/v1/services/config')->assertOk()
            ->assertJsonPath('require_deposit', true)
            ->assertJsonPath('deposit_percent', 25);
    }

    public function test_a_currency_stripe_does_not_take_is_refused(): void
    {
        $this->stripeForDeposits()->shouldReceive('currency')->andReturn('gbp');

        $this->asStaff()->patchJson($this->api('setup/settings'), ['deposits_on' => true])
            ->assertStatus(422)->assertJsonPath('reason', 'currency_mismatch');
    }

    public function test_the_percent_keeps_to_one_to_a_hundred(): void
    {
        $this->stripeForDeposits();
        foreach ([0, 101] as $bad) {
            $this->asStaff()->patchJson($this->api('setup/settings'), ['deposits_on' => true, 'deposit_percent' => $bad])
                ->assertStatus(422)->assertJsonValidationErrors('deposit_percent');
        }
    }

    public function test_only_a_manager_switches_deposits(): void
    {
        $this->actingAs($this->staffUser($this->org, ['role' => 'staff']), 'sanctum')
            ->patchJson($this->api('setup/settings'), ['deposits_on' => true])->assertStatus(403);
    }

    public function test_a_stored_percent_is_shown_as_it_is_while_deposits_are_on(): void
    {
        $this->stripeForDeposits();
        $this->depositsOn(100);
        $this->asStaff()->getJson($this->api('setup'))->assertJsonPath('settings.deposit_percent', 100);

        $this->depositsOff();
        $this->asStaff()->getJson($this->api('setup'))->assertJsonPath('settings.deposit_percent', 20);
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd /c/wamp64/www/Hexa-Tech-appointments && /c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Appointments/Setup/SetupDepositsTest.php`
Expected: FAIL — `settings.deposits_on` missing, and switching on is not refused.

- [ ] **Step 3: The settings**

Add to `Deposits`:

```php
    /** Why Setup refuses to switch deposits on (the screen words it in five languages from the reason). */
    public const REASONS = [
        'payments_off'      => 'Switch on online payments with your Stripe keys in the full admin (Settings → Booking) first.',
        'mock_mode'         => 'Bookings are in test mode in the full admin: deposits need real payments.',
        'currency_mismatch' => 'Stripe takes payments in another currency than your prices.',
    ];
```

In `BookingRules`:
- `use App\Services\Appointments\Money\Deposits;`
- In `rules()`, add:

```php
            'deposits_on'     => 'sometimes|boolean',
            'deposit_percent' => 'sometimes|integer|min:1|max:100',
```

- In `read()`, before `return [`, add `$currency = self::currency(); $depositsOn = Deposits::switchedOn(); $percent = Deposits::percent(); $reason = Deposits::unavailableReason($currency);`. Change `'currency' => self::currency(),` to `'currency' => $currency,`, and add at the end of the array:

```php
            // Part H: the full admin's own deposit settings. Its untouched default is 100%; Setup proposes 20%.
            'deposits_on'        => $depositsOn,
            'deposit_percent'    => !$depositsOn && $percent === 100 ? Deposits::PROPOSED_PERCENT : $percent,
            'deposits_available' => $reason === null,
            'deposits_reason'    => $reason,
            'cancel_hours'       => Deposits::cancelHours(),
```

- In `write()`, inside the transaction after the `client_messages_language` block, add:

```php
            if (array_key_exists('deposits_on', $data)) {
                self::put($orgId, 'services_require_deposit', $data['deposits_on'] ? 'true' : 'false', 'boolean', 'booking', 'Require Deposit');
            }
            if (array_key_exists('deposit_percent', $data)) {
                self::put($orgId, 'services_deposit_percent', (string) (int) $data['deposit_percent'], 'integer', 'booking', 'Deposit Percent');
            }
```

- [ ] **Step 4: The guard**

In `SetupSettingsController::update()`, right after `$org = $request->attributes->get('workspace_org');`, add:

```php
        // Part H §4.1: deposits go on only where Stripe can take them, in the venue's currency (the new one when it changes too).
        if (!empty($data['deposits_on'])) {
            $reason = Deposits::unavailableReason($data['currency'] ?? BookingRules::currency());
            if ($reason !== null) {
                throw new AppointmentRefused('deposits_unavailable', Deposits::REASONS[$reason], 422, ['reason' => $reason]);
            }
        }
```

and add `use App\Services\Appointments\AppointmentRefused;` and `use App\Services\Appointments\Money\Deposits;`.

- [ ] **Step 5: Run the Setup suite**

Run: `cd /c/wamp64/www/Hexa-Tech-appointments && /c/wamp64/bin/php/php8.4.20/php.exe artisan test tests/Feature/Appointments/Setup/`
Expected: every test passes (`SetupSettingsEndpointTest` and `BookingRulesTest` unchanged; Stripe is off there, so `deposits_reason` is `payments_off`).

- [ ] **Step 6: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-appointments
git add app/Services/Booking/Setup/BookingRules.php app/Http/Controllers/Api/V1/Admin/Appointments/SetupSettingsController.php app/Services/Appointments/Money/Deposits.php tests/Feature/Appointments/Setup/SetupDepositsTest.php
git commit -m "$(cat <<'EOF'
Setup: switch deposits on with a percent, only where Stripe can take them

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: The screens and their words

**Files:**
- Modify: `frontend/src/appointments/lib/types.ts` (`PaymentState`, `Consequences`, `MoneyInfo`, `SetupSettings`, `SettingsBody`, new `DepositConsequence`, `DepositTerms`)
- Modify: `frontend/src/appointments/panel/consequences.ts`, `panel/ActionConfirm.tsx`, `panel/panelState.ts`, `panel/AppointmentPanel.tsx:127`
- Modify: `frontend/src/appointments/setup/SettingsTab.tsx`, `setup/FailureNotice.tsx`
- Modify: `frontend/src/appointments/i18n/appointments.{en,ru,de,fr,es}.json`
- Modify: `frontend/src/components/settings/BookingTab.tsx:550`, `frontend/src/pages/ServiceBookings.tsx:205-212`
- Test: `frontend/src/appointments/panel/deposit.test.tsx` (new), `frontend/src/appointments/setup/settingsTab.test.tsx`

**Interfaces:**
- Consumes: Task 5's `consequences.deposit`, Task 1's `money.deposit`, Task 8's settings keys, Task 5's bulk `failed`.
- Produces: `refundDefaultsFor(money: MoneyInfo | null | undefined): CancelRefunds` (panelState). Types `DepositConsequence`, `DepositTerms`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/appointments/panel/deposit.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ActionInfo, AppointmentDetail, DepositConsequence, MoneyInfo } from '../lib/types'
import { money as fmt } from '../../lib/money'

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
const { consequenceLines } = await import('./consequences')
const { refundDefaultsFor } = await import('./panelState')

const deposit = (code: DepositConsequence['code']): DepositConsequence => ({ code, amount: 12, currency: 'EUR', cancel_hours: 24 })
const action = (key: 'cancel' | 'no_show', d: DepositConsequence | null): ActionInfo => ({
  key, allowed: true, consequences: { payment: 'none', points: null, coupon: 'none', message: key === 'cancel' ? 'ask' : 'none', deposit: d },
})
const money = (over: Partial<MoneyInfo>): MoneyInfo => ({
  total: 60, currency: 'EUR', held_online: 0, paid_online: 12, refunded_online: 0, paid_desk: 0, refunded_desk: 0, legacy_marked_paid: false,
  owed: 48, to_refund: 0, refundable_online: 12, refundable_desk: 0, paid_in: 12, paid_back: 0, can_take: true, movements: [],
  deposit: { amount: 12, percent: 20, cancel_hours: 24, refund_until: '2026-10-05T10:00:00+00:00' }, ...over,
})

describe('the deposit line', () => {
  it('says the deposit goes back when cancelled in time, in place of the payment line', () => {
    const lines = consequenceLines(action('cancel', deposit('goes_back')))
    expect(lines[0]).toMatchObject({ key: 'appointments.consequence.deposit.goes_back', tone: 'plain', vars: { amount: fmt(12, 'EUR') } })
    expect(lines.map(l => l.key)).not.toContain('appointments.consequence.payment.none')
  })

  it('warns that the venue keeps it when cancelled late, naming the window', () => {
    expect(consequenceLines(action('cancel', deposit('kept_late')))[0]).toMatchObject({
      key: 'appointments.consequence.deposit.kept_late', tone: 'warning', vars: { amount: fmt(12, 'EUR'), hours: 24 },
    })
  })

  it('warns that the venue keeps it on a no-show', () => {
    expect(consequenceLines(action('no_show', deposit('kept')))[0].key).toBe('appointments.consequence.deposit.kept')
  })

  it('leaves a booking without a deposit as before', () => {
    expect(consequenceLines(action('cancel', null))[0].key).toBe('appointments.consequence.payment.none')
  })
})

describe('the cancel sheet with a deposit', () => {
  it('starts the card refund at nothing, so a kept deposit never goes back by accident', () => {
    expect(refundDefaultsFor(money({}))).toEqual({ online: '0', desk: '0', deskMethod: 'cash' })
    expect(refundDefaultsFor(money({ deposit: null, paid_online: 60, refundable_online: 60 }))).toEqual({ online: '60', desk: '0', deskMethod: 'cash' })
    expect(refundDefaultsFor(undefined)).toEqual({ online: '0', desk: '0', deskMethod: 'cash' })
  })

  it('does not tell staff that a manager must refund what the deposit rule takes care of', () => {
    const booking = { id: 1, client: { name: 'Sophie' }, client_email: null, start: '2026-10-06T10:00', end: '2026-10-06T10:45', money: money({}) } as unknown as AppointmentDetail
    const html = renderToStaticMarkup(
      <ActionConfirm booking={booking} action={action('cancel', deposit('goes_back'))} reason="" saving={false} error={null} tell={false} onTell={() => {}}
        canManage={false} onReason={() => {}} onConfirm={() => {}} onBack={() => {}} />,
    )
    expect(html).toContain('goes back to the client')
    expect(html).not.toContain('a manager can refund it')
  })
})
```

In `frontend/src/appointments/setup/settingsTab.test.tsx`, add the five new fields to the `settings` fixture (`deposits_on: false, deposit_percent: 20, deposits_available: true, deposits_reason: null, cancel_hours: 24`) and append:

```tsx
describe('deposits', () => {
  it('switching on sends the proposed percent with it, and only what changed after that', () => {
    const draft = settingsDraftOf(settings)
    expect(changedSettings({ ...draft, deposits_on: true }, settings)).toEqual({ deposits_on: true, deposit_percent: 20 })
    const on = { ...settings, deposits_on: true, deposit_percent: 25 }
    expect(changedSettings(settingsDraftOf(on), on)).toEqual({})
    expect(changedSettings({ ...settingsDraftOf(on), deposit_percent: '30' }, on)).toEqual({ deposit_percent: 30 })
    expect(changedSettings({ ...settingsDraftOf(on), deposits_on: false }, on)).toEqual({ deposits_on: false })
  })

  it('shows the switch and the venue\'s window', () => {
    const html = renderToStaticMarkup(<SettingsTab data={data} refresh={() => {}} />)
    expect(html).toContain('Deposits for online bookings')
    expect(html).toContain('at least 24 hours before')
  })

  it('keeps the switch off and says why when Stripe cannot take deposits', () => {
    const off = { ...settings, deposits_available: false, deposits_reason: 'currency_mismatch' as const }
    const html = renderToStaticMarkup(<SettingsTab data={{ ...data, settings: off }} refresh={() => {}} />)
    expect(html).toContain('another currency')
    expect(html).toMatch(/disabled=""\/>Ask for a deposit/)
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd /c/wamp64/www/Hexa-Tech-appointments/frontend && npx vitest run src/appointments/panel/deposit.test.tsx src/appointments/setup/settingsTab.test.tsx`
Expected: FAIL — `refundDefaultsFor` is not exported, there is no deposit line, and the Setup section is missing.

- [ ] **Step 3: The types**

In `frontend/src/appointments/lib/types.ts`:
- Add `| 'deposit_paid'` to `PaymentState`.
- Above `export interface Consequences`, add:

```ts
/** Part H: what a cancel or a no-show does to a booking-page deposit, worked out by the server. */
export interface DepositConsequence { code: 'goes_back' | 'kept_late' | 'kept'; amount: number; currency: string; cancel_hours: number }
/** Part H: a booking's deposit terms, as agreed at booking. `refund_until` is a real instant. */
export interface DepositTerms { amount: number; percent: number; cancel_hours: number; refund_until: string | null }
```

- In `Consequences`, after `message: 'none' | 'ask'`, add `/** Part H: absent or null for every booking without a deposit. */\n  deposit?: DepositConsequence | null`.
- In `MoneyInfo`, after `correctable_desk?: number; corrected_desk?: number`, add `/** Part H: the booking-page deposit's terms; null for every other booking. */\n  deposit?: DepositTerms | null`.
- In `SetupSettings`, after the client-messages line, add:

```ts
  /** Part H: deposits for online bookings — the full admin's own settings; available only with Stripe in the venue's currency. */
  deposits_on: boolean; deposit_percent: number; deposits_available: boolean
  deposits_reason: 'payments_off' | 'mock_mode' | 'currency_mismatch' | null; cancel_hours: number
```

- In `SettingsBody`'s `Pick`, add `| 'deposits_on' | 'deposit_percent'`.

Run `npx tsc -b` once here. It names every other `SetupSettings` fixture that now lacks the five fields; add them (`deposits_on: false, deposit_percent: 20, deposits_available: false, deposits_reason: 'payments_off', cancel_hours: 24`).

- [ ] **Step 4: The consequence line and the cancel sheet**

In `panel/consequences.ts`, change the type import to `import type { ActionInfo, ActionKey, DepositConsequence, PointsPreview } from '../lib/types'`, add `import { money } from '../../lib/money'`, and add after the `PAYMENT` map:

```ts
// Part H: a booking-page deposit's own line, in place of the payment line.
const DEPOSIT: Record<DepositConsequence['code'], Omit<Line, 'key' | 'vars'>> = {
  goes_back: { fallback: 'The deposit ({{amount}}) goes back to the client’s card.', tone: 'plain' },
  kept_late: { fallback: 'The venue keeps the deposit ({{amount}}): cancelled less than {{hours}} h before the visit.', tone: 'warning' },
  kept:      { fallback: 'The venue keeps the deposit ({{amount}}).', tone: 'warning' },
}
```

In `consequenceLines()`, change `const { payment, points, coupon } = action.consequences` to `const { payment, points, coupon, deposit } = action.consequences`, and the payment `if` to:

```ts
  if (deposit) {
    lines.push({ key: `appointments.consequence.deposit.${deposit.code}`, ...DEPOSIT[deposit.code], vars: { amount: money(deposit.amount, deposit.currency), hours: deposit.cancel_hours } })
  } else if (payment !== 'none' || action.key === 'cancel' || action.key === 'no_show') {
```

(the body of the old `if` stays as it is).

In `panel/panelState.ts`, add `MoneyInfo` to the type import and add after `CancelRefunds`:

```ts
/** The cancel sheet's refund lines to start from (Part E). A booking-page deposit starts at nothing: its own rule decides (Part H). */
export function refundDefaultsFor(money: MoneyInfo | null | undefined): CancelRefunds {
  return { online: money?.deposit ? '0' : String(money?.refundable_online ?? 0), desk: String(money?.refundable_desk ?? 0), deskMethod: 'cash' }
}
```

In `panel/AppointmentPanel.tsx`, add `refundDefaultsFor` to the `./panelState` import and replace line 127 with `const refundDefaults = (): CancelRefunds => refundDefaultsFor(booking?.money)`.

In `panel/ActionConfirm.tsx`, add before `return (`:

```tsx
  // Part H: a booking-page deposit follows its own rule (the line above); staff are told only of the rest a manager can refund.
  const staffDue = booking.money ? (action.consequences.deposit ? 0 : booking.money.refundable_online) + booking.money.refundable_desk : 0
```

and replace the staff branch `<p className="text-sm text-a-text">{t('appointments.money.cancel_staff', '{{amount}} was paid — a manager can refund it.', { amount: fmt(booking.money.refundable_online + booking.money.refundable_desk, booking.money.currency) })}</p>` with:

```tsx
          staffDue > 0 && <p className="text-sm text-a-text">{t('appointments.money.cancel_staff', '{{amount}} was paid — a manager can refund it.', { amount: fmt(staffDue, booking.money.currency) })}</p>
```

- [ ] **Step 5: Setup's section and its refusal**

In `setup/SettingsTab.tsx`:
- Add the reasons' fallbacks after `MESSAGE_LANGUAGES`:

```tsx
// Part H: why Stripe cannot take deposits yet (the server's `deposits_reason`).
const DEPOSIT_REASON: Record<string, string> = {
  payments_off: 'Switch on online payments with your Stripe keys in the full admin (Settings → Booking) to take deposits.',
  mock_mode: 'Bookings are in test mode in the full admin (Settings → Booking): deposits need real payments.',
  currency_mismatch: 'Stripe takes payments in another currency than your prices. Make them the same to take deposits.',
}
```

- `SettingsDraft`: add `deposits_on: boolean; deposit_percent: string`.
- `settingsDraftOf`: add `deposits_on: s.deposits_on, deposit_percent: String(s.deposit_percent),`.
- `changedSettings`: add before `return body`:

```ts
  if (draft.deposits_on !== s.deposits_on) body.deposits_on = draft.deposits_on
  // Switching on sends the percent too: what Setup proposes (20%) is not stored yet.
  if (draft.deposits_on && (!s.deposits_on || Number(draft.deposit_percent) !== s.deposit_percent)) body.deposit_percent = Number(draft.deposit_percent)
```

- Add this section right after the `settings-online` section's closing `</section>`:

```tsx
          <section aria-labelledby="settings-deposits" className="space-y-3">
            <h2 id="settings-deposits" className="text-sm font-semibold text-a-text">{t('appointments.setup.deposits.title', 'Deposits for online bookings')}</h2>
            <p className="text-sm text-a-text-2">{t('appointments.setup.deposits.intro', 'Clients booking on your booking page pay part of the price by card. Cancelled at least {{hours}} hours before, it goes back automatically; cancelled later, or a no-show, and the venue keeps it. The rest is paid at the venue.', { hours: s.cancel_hours })}</p>
            {!s.deposits_available && s.deposits_reason && (
              <Notice tone="info">{t(`appointments.setup.deposits.reason.${s.deposits_reason}`, DEPOSIT_REASON[s.deposits_reason])}</Notice>
            )}
            <label className="flex items-center gap-2 text-sm text-a-text">
              <input type="checkbox" checked={draft.deposits_on} disabled={!s.deposits_available && !s.deposits_on} onChange={(e) => set({ deposits_on: e.target.checked })} />
              {t('appointments.setup.deposits.on', 'Ask for a deposit')}
            </label>
            {draft.deposits_on && (
              <Field label={t('appointments.setup.deposits.percent', 'Deposit (% of the price)')}>
                <input type="number" min={1} max={100} value={draft.deposit_percent} onChange={(e) => set({ deposit_percent: e.target.value })} className={input} />
              </Field>
            )}
          </section>
```

In `setup/FailureNotice.tsx`, add after the `not_allowed` line:

```tsx
  if (failure.code === 'deposits_unavailable') return <Notice tone="danger">{t('appointments.error.deposits_unavailable', failure.message)}</Notice>
```

- [ ] **Step 6: The words in five languages**

Add these keys to each `frontend/src/appointments/i18n/appointments.{locale}.json`, nested where the dots say. `payment.deposit_paid` goes into the existing `payment` object, `consequence.deposit.*` into a new `deposit` object inside `consequence`, `error.*` into `error`, and `setup.deposits.*` into a new `deposits` object inside `setup`:

| Key | en | ru | de | fr | es |
|---|---|---|---|---|---|
| `payment.deposit_paid` | Deposit paid | Депозит оплачен | Anzahlung bezahlt | Acompte payé | Depósito pagado |
| `consequence.deposit.goes_back` | The deposit ({{amount}}) goes back to the client’s card. | Депозит ({{amount}}) вернётся на карту клиента. | Die Anzahlung ({{amount}}) geht auf die Karte des Kunden zurück. | L’acompte ({{amount}}) est remboursé sur la carte du client. | El depósito ({{amount}}) vuelve a la tarjeta del cliente. |
| `consequence.deposit.kept_late` | The venue keeps the deposit ({{amount}}): cancelled less than {{hours}} h before the visit. | Депозит ({{amount}}) остаётся у заведения: отмена менее чем за {{hours}} ч до визита. | Die Anzahlung ({{amount}}) bleibt beim Betrieb: weniger als {{hours}} Std. vor dem Termin storniert. | L’établissement garde l’acompte ({{amount}}) : annulé moins de {{hours}} h avant la visite. | El local se queda el depósito ({{amount}}): cancelada con menos de {{hours}} h de antelación. |
| `consequence.deposit.kept` | The venue keeps the deposit ({{amount}}). | Депозит ({{amount}}) остаётся у заведения. | Die Anzahlung ({{amount}}) bleibt beim Betrieb. | L’établissement garde l’acompte ({{amount}}). | El local se queda el depósito ({{amount}}). |
| `error.deposit_refund_failed` | The deposit could not be refunded just now. Try again. | Сейчас не удалось вернуть депозит. Попробуйте ещё раз. | Die Anzahlung konnte gerade nicht erstattet werden. Bitte erneut versuchen. | L’acompte n’a pas pu être remboursé pour l’instant. Réessayez. | No se ha podido devolver el depósito ahora mismo. Inténtelo de nuevo. |
| `error.deposits_unavailable` | Deposits need online payments through Stripe in the venue’s currency. | Для депозитов нужна онлайн-оплата через Stripe в валюте заведения. | Anzahlungen brauchen Online-Zahlungen über Stripe in der Währung des Betriebs. | Les acomptes demandent les paiements en ligne via Stripe dans la devise de l’établissement. | Los depósitos necesitan pagos en línea con Stripe en la moneda del local. |
| `setup.deposits.title` | Deposits for online bookings | Депозит при онлайн-записи | Anzahlung bei Online-Buchungen | Acomptes pour les réservations en ligne | Depósitos en las reservas en línea |
| `setup.deposits.intro` | Clients booking on your booking page pay part of the price by card. Cancelled at least {{hours}} hours before, it goes back automatically; cancelled later, or a no-show, and the venue keeps it. The rest is paid at the venue. | Клиенты, записывающиеся на вашей странице, платят часть цены картой. При отмене не позднее чем за {{hours}} ч она возвращается автоматически; при более поздней отмене или неявке остаётся у заведения. Остальное оплачивается на месте. | Wer über Ihre Buchungsseite bucht, zahlt einen Teil des Preises per Karte. Bei Stornierung mindestens {{hours}} Stunden vorher geht er automatisch zurück; bei späterer Stornierung oder Nichterscheinen behält ihn der Betrieb. Den Rest zahlt der Kunde vor Ort. | Les clients qui réservent sur votre page paient une partie du prix par carte. Annulée au moins {{hours}} heures avant, elle est remboursée automatiquement ; annulée plus tard, ou en cas d’absence, l’établissement la garde. Le reste se paie sur place. | Quien reserva en su página paga parte del precio con tarjeta. Si cancela con al menos {{hours}} horas de antelación, se le devuelve automáticamente; si cancela más tarde o no se presenta, el local se lo queda. El resto se paga en el local. |
| `setup.deposits.on` | Ask for a deposit | Брать депозит | Anzahlung verlangen | Demander un acompte | Pedir un depósito |
| `setup.deposits.percent` | Deposit (% of the price) | Депозит (% от цены) | Anzahlung (% vom Preis) | Acompte (% du prix) | Depósito (% del precio) |
| `setup.deposits.reason.payments_off` | Switch on online payments with your Stripe keys in the full admin (Settings → Booking) to take deposits. | Чтобы брать депозит, включите онлайн-оплату с ключами Stripe в полной админке (Настройки → Бронирование). | Schalten Sie im vollen Admin (Einstellungen → Buchung) Online-Zahlungen mit Ihren Stripe-Schlüsseln ein, um Anzahlungen zu nehmen. | Activez les paiements en ligne avec vos clés Stripe dans l’administration complète (Paramètres → Réservation) pour prendre des acomptes. | Active los pagos en línea con sus claves de Stripe en la administración completa (Ajustes → Reservas) para cobrar depósitos. |
| `setup.deposits.reason.mock_mode` | Bookings are in test mode in the full admin (Settings → Booking): deposits need real payments. | Бронирования в тестовом режиме (полная админка, Настройки → Бронирование): для депозитов нужны настоящие платежи. | Buchungen sind im Testmodus (voller Admin, Einstellungen → Buchung): Anzahlungen brauchen echte Zahlungen. | Les réservations sont en mode test (administration complète, Paramètres → Réservation) : les acomptes demandent de vrais paiements. | Las reservas están en modo de prueba (administración completa, Ajustes → Reservas): los depósitos necesitan pagos reales. |
| `setup.deposits.reason.currency_mismatch` | Stripe takes payments in another currency than your prices. Make them the same to take deposits. | Stripe принимает платежи в другой валюте, чем ваши цены. Сделайте их одинаковыми, чтобы брать депозит. | Stripe nimmt Zahlungen in einer anderen Währung an als Ihre Preise. Gleichen Sie sie an, um Anzahlungen zu nehmen. | Stripe encaisse dans une autre devise que vos prix. Alignez-les pour prendre des acomptes. | Stripe cobra en una moneda distinta de la de sus precios. Haga que coincidan para cobrar depósitos. |

Edit the JSON with the Edit tool and keep each file valid. The locales test (`appointmentsLocales.test.ts`) checks that all five files have the same keys.

- [ ] **Step 7: The full admin's two small pieces**

In `frontend/src/components/settings/BookingTab.tsx:550`, change `min={5}` to `min={1}` (the workspace and the server allow 1–100).

In `frontend/src/pages/ServiceBookings.tsx` `runBulk`, replace `toast.success(res.message || 'Updated')` with:

```ts
      // Part H: a booking whose deposit refund Stripe refused stays as it was; the server's message names it.
      if (res.failed?.length) toast.error(res.message)
      else toast.success(res.message || 'Updated')
```

- [ ] **Step 8: Type-check and run the whole frontend suite**

Run: `cd /c/wamp64/www/Hexa-Tech-appointments/frontend && npx tsc -b && npx vitest run 2>&1 | tail -n 15`
Expected: `tsc` prints nothing, and Vitest reports only the 3 pre-existing `plannerMeta` failures. The new `deposit.test.tsx` and the settings tests pass, and the locales and token sweeps pass.

- [ ] **Step 9: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-appointments
git add frontend/src/appointments/lib/types.ts frontend/src/appointments/panel/consequences.ts frontend/src/appointments/panel/ActionConfirm.tsx frontend/src/appointments/panel/panelState.ts frontend/src/appointments/panel/AppointmentPanel.tsx frontend/src/appointments/panel/deposit.test.tsx frontend/src/appointments/setup/SettingsTab.tsx frontend/src/appointments/setup/FailureNotice.tsx frontend/src/appointments/setup/settingsTab.test.tsx frontend/src/appointments/i18n/appointments.en.json frontend/src/appointments/i18n/appointments.ru.json frontend/src/appointments/i18n/appointments.de.json frontend/src/appointments/i18n/appointments.fr.json frontend/src/appointments/i18n/appointments.es.json frontend/src/components/settings/BookingTab.tsx frontend/src/pages/ServiceBookings.tsx
git status --short frontend/dist public/spa resources/spa-shell   # must print nothing staged from these
git commit -m "$(cat <<'EOF'
Workspace: the deposit lines, the Setup switch and percent, in five languages

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

Also stage any other fixture files `tsc -b` made you change in Step 3, by name.

---

### Task 10: Runbook, whole suites, and the browser check

**Files:**
- Modify: `docs/appointments-workspace.md` (new section before `## Deploying it`)
- Workspace only (not committed): `.superpowers/sdd/2026-10-06-appointments-deposits/suite-by-dir.sh`, its results, screenshots

- [ ] **Step 1: The runbook section**

Add before `## Deploying it` in `docs/appointments-workspace.md`:

```markdown
## Deposits for online bookings (Part H, 2026-10-06)

A venue can ask clients who book on its **online booking page** for a card deposit. Member-portal and staff bookings
are unchanged.

**Switching it on.** Workspace → Setup → "Deposits for online bookings": a switch and a percent (1–100; 20% is
proposed). It writes the full admin's own settings (`services_require_deposit`, `services_deposit_percent`), so
Settings → Booking shows the same values. It switches on only when Stripe is connected
(`booking_payment_enabled` and a secret key), test mode is off, and Stripe's currency is the venue's; otherwise
Setup says which is missing. The window is the full admin's `services_cancel_hours` (default 24).

**What the client does.** After their details, the page asks for "a deposit of €12.00 now (20% of €60.00)" with
Stripe's card fields, then "Pay €12.00 and book". The card is held, the booking saved under the scheduler's lock, and
the deposit charged at once. A refused card books nothing; a time taken meanwhile releases the hold ("Your card was
not charged"). Free services and deposits under 0.50 skip the step. The confirmation screen and email say until when
a cancellation gives the deposit back (the venue's clock).

**What staff see.** The deposit is a ledger payment ("Card, through Stripe", note "Deposit"): Paid online €12.00 ·
Still owed €48.00; Take payment asks for the rest; Takings and Insights count it once. The row says "Deposit paid".

**Cancelling.** At or before the deadline (the visit's current start minus the hours agreed at booking), the deposit
goes back to the card automatically, whoever cancels: workspace, full admin status change, delete or bulk cancel.
If Stripe refuses, nothing is cancelled (`deposit_refund_failed`). After the deadline, or on a no-show, the venue
keeps it; a manager can still refund it as goodwill (Refund, or the cancel sheet's card line, which starts at 0).
The client's cancellation email (Part D) says which.

**Behind the scenes.** The capture job finishes a deposit charge that confirm() missed (as a deposit, never "paid"),
releases the hold of a booking cancelled in time, and charges and keeps one cancelled late or a no-show. The orphan
release cancels deposit holds that never became a booking after 45 minutes. At a deposit venue, the chat's booking
card opens the booking page instead of booking.

**Switching it off** stops new deposits; bookings already made keep their terms. No migration.

**Owner's first live check:** switch deposits on at your venue, make a small real booking on the booking page, cancel
it in time from the workspace, and see the refund arrive on the card.
```

- [ ] **Step 2: Every PHP suite, directory by directory**

```bash
cd /c/wamp64/www/Hexa-Tech-appointments
ws=.superpowers/sdd/2026-10-06-appointments-deposits
cp .superpowers/sdd/archive/2026-10-06-appointments-insights/tools/suite-by-dir.sh $ws/suite-by-dir.sh
```

Edit `$ws/suite-by-dir.sh` with the Edit tool: change the `ws=` line to `ws=.superpowers/sdd/2026-10-06-appointments-deposits`. Then run it in the background (`bash $ws/suite-by-dir.sh final`) and wait for its notification. Do not edit `app/` or `tests/` while it runs.

Expected: every line of `$ws/final.txt` shows `exit=0`. The last full record, the polish deploy's `.superpowers/sdd/archive/2026-10-06-appointments-polish/final.txt`, was green in all 64 groups, so any failure is this part's. Fix it test-first and rerun that directory.

- [ ] **Step 3: The frontend suite and a build check (not committed)**

Run: `cd /c/wamp64/www/Hexa-Tech-appointments/frontend && npx tsc -b && npx vitest run 2>&1 | tail -n 8 && npm run build 2>&1 | tail -n 5 && cd .. && git status --short frontend/dist public/spa resources/spa-shell`
Expected: only the 3 `plannerMeta` failures, and a build that ends without errors. Then restore the built folders (`git checkout -- frontend/dist public/spa resources/spa-shell` and `git clean -fd -- frontend/dist public/spa resources/spa-shell`), so `git status --short` shows none of them.

- [ ] **Step 4: The browser check (needs the owner's Stripe TEST keys)**

Ask the owner to put the venue's Stripe **test** keys into their local organisation's Settings → Booking (publishable and secret, `booking_payment_enabled` on, currency matching the services). Never paste keys into this conversation and never echo them. If the owner declines, check the page with deposits on up to the card form (without a key the step says the card form could not be loaded), and ledger a ruling that the card payment was not checked in a browser.

With keys in place, on the local copy (no `artisan migrate`; Part H adds no table):
1. Workspace → Setup: switch deposits on at 20%; then open the full admin's Settings → Booking and see the same values.
2. The booking page `/services/{token}` at 1440 px: book the 60.00 service with `4242 4242 4242 4242`. Check the deposit step's words, "Pay EUR 12.00 and book", the confirmation's "Deposit paid … Cancel by …", and in the workspace "Paid online €12.00 · Still owed €48.00" and "Deposit paid".
3. A declined card (`4000 0000 0000 0002`): Stripe's reason is shown and nothing is booked.
4. A 3-D Secure card (`4000 0027 6000 3184`): the bank's dialog, then booked.
5. Cancel the first booking in time from the workspace: "The deposit (€12.00) goes back to the client's card." Then see the refund in the money block and in Stripe's test dashboard.
6. The same flow at 390 px (no horizontal scroll), and an accessibility pass (axe, or Lighthouse's accessibility audit) on the deposit step.
7. Switch deposits off: the page is the old page (the deposits-off fixture test already proves the bytes).
8. Clean up: switch deposits back to how the owner had them. Delete the test bookings by reference (with their ledger rows, extras and submission rows) from the local database, and say in the hand-over which rows were removed.

Screenshots go to the plan's workspace, not the repository.

- [ ] **Step 5: Commit the runbook**

```bash
cd /c/wamp64/www/Hexa-Tech-appointments
git add docs/appointments-workspace.md
git commit -m "$(cat <<'EOF'
Runbook: deposits for online bookings (Part H)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-review (done while writing)

- **Spec coverage:**
  - §4.1 → Task 8 + Task 9 (Setup).
  - §4.2 → Tasks 2–3 (page, outcomes, confirmation screen, email).
  - §4.3 → Tasks 1–2 (amount, server-side, mismatch).
  - §4.4 → Task 7 (chat).
  - §5.1–5.3 → Task 1 (ledger row, owed, label, terms).
  - §5.4 → Task 2 (confirm captures) + Task 4 (job).
  - §5.5 → Task 4 (orphan release).
  - §6.1 → Task 5 (every path, refusal).
  - §6.2 → Task 5 (codes) + Task 9 (lines).
  - §6.3 → Task 6 (email).
  - §6.4 → Task 5 (reopen, move).
  - §7 → Tasks 1, 2, 5 (switched off later, price change, double submit, time zone, portal, staff).
  - §8 → Tasks 2, 5, 7, 8.
  - §9 → the tests in each task.
  - §10 → nothing built beyond it.
  - §11 → Task 10 runbook; the deploy itself is a separate, owner-approved step after the final review.
- **Placeholders:** none. Every code step carries its code, and every run step its command and expected outcome.
- **Names across tasks:**
  - `Deposits::termsFor/of/inTime/untilText/forClient/forStaff/pageOn/bookingPageUrl/onlineNow/metadataOf/assertPays/REASONS` are produced in Tasks 1, 2, 3, 7 and 8, and consumed only after them.
  - `DepositRule::applies/onCancel` are produced and consumed in Task 5.
  - `AppointmentMoney::recordDeposit` is produced in Task 1 and consumed in Tasks 2 and 4.
  - `refundDefaultsFor` and `DepositConsequence` are produced and consumed in Task 9.
- **Review Focus:** each of the five lines has its named test in its owning task (Tasks 1, 2 and 5).
