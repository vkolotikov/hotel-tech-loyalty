<?php

namespace Tests\Feature\Booking;

use App\Models\AuditLog;
use App\Models\BookingHold;
use App\Models\BookingMirror;
use App\Models\BookingSubmission;
use App\Models\Organization;
use App\Services\Booking\PaymentUnverifiable;
use App\Services\BookingEngineService;
use App\Services\SmoobuClient;
use App\Services\StripeService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Mockery;
use Stripe\PaymentIntent;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\Concerns\SetsUpStayBookingSchema;
use Tests\TestCase;

/**
 * Release 6, items 3 and 8 — the public widget's stay confirm under its locks:
 *
 *  - its combination takes every room's `room:{org}:{unit}` lock once,
 *    ascending, then the hold row, and re-checks every room against our
 *    bookings and the PMS under them (as the portal's combination does); a
 *    room taken meanwhile is refused with the combination's own "no longer
 *    available" answer, nothing is written and a reservation already made at
 *    the PMS is cancelled again;
 *  - a confirm that names a payment reads it again once the hold row is held,
 *    before the PMS is asked: a payment cancelled meanwhile (the rescue of a
 *    racing request) is refused — "Payment has not been completed." — instead
 *    of a stay written without a live payment; a Stripe that cannot be asked
 *    is PaymentUnverifiable (the controller's 503, nothing released).
 *
 * The widget's own tests in BookingEngineConfirmTest pin that nothing else
 * changed. Smoobu and Stripe are Mockery mocks.
 */
class WidgetStayUnderLockTest extends TestCase
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
        $this->org->forceFill(['widget_token' => 'wtok_' . Str::random(16)])->save();
        app()->instance('current_organization_id', $this->org->id);
        $this->seedRoom($this->org->id);
        $this->seedRoom($this->org->id, ['pms_id' => '102', 'name' => 'Garden', 'slug' => 'garden', 'base_price' => 80, 'sort_order' => 1]);

        $this->checkIn = now()->addDays(10)->toDateString();
        $this->checkOut = now()->addDays(12)->toDateString();

        $this->smoobu = Mockery::mock(SmoobuClient::class);
        $this->app->instance(SmoobuClient::class, $this->smoobu);
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

    private function nights(bool $available = true): array
    {
        $out = [];
        for ($d = now()->addDays(10); $d->toDateString() < $this->checkOut; $d = $d->copy()->addDay()) {
            $out[$d->toDateString()] = ['available' => $available, 'price' => 100.0, 'min_stay' => 1];
        }

        return $out;
    }

    /** Smoobu answers the per-day rates for both rooms ($taken: these units are not free) and takes reservations. */
    private function smoobuAnswers(array $taken = []): void
    {
        $this->smoobu->shouldReceive('getDailyRates')->andReturnUsing(fn ($in, $out, array $units) => collect($units)
            ->mapWithKeys(fn ($u) => [(string) $u => $this->nights(!in_array((string) $u, $taken, true))])->all());
        $this->smoobu->shouldReceive('getRates')->andReturnUsing(fn ($in, $out, array $units) => ['data' => collect($units)
            ->mapWithKeys(fn ($u) => [(string) $u => ['available' => !in_array((string) $u, $taken, true), 'price' => 200.0]])->all()]);
        $this->smoobu->shouldReceive('resolveDirectChannelId')->andReturn(7);
        $this->smoobu->shouldReceive('getPriceElements')->byDefault()->andReturn([]);
    }

    private function guest(): array
    {
        return ['first_name' => 'Ada', 'last_name' => 'Lovelace', 'email' => 'ada@example.test', 'phone' => '+37120000000'];
    }

    private function hold(array $payload = []): BookingHold
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

    /** A two-room widget hold, as quoteCombo() writes it: 101 Sea view (200.00) + 102 Garden (160.00). */
    private function comboHold(): BookingHold
    {
        return $this->hold([
            'is_combo' => true, 'unit_id' => null, 'unit_name' => null,
            'rooms' => [
                ['unit_id' => '101', 'unit_name' => 'Sea view', 'room_total' => 200.0, 'price_per_night' => 100.0, 'max_guests' => 2],
                ['unit_id' => '102', 'unit_name' => 'Garden', 'room_total' => 160.0, 'price_per_night' => 80.0, 'max_guests' => 2],
            ],
            'adults' => 4, 'room_total' => 360.0, 'gross_total' => 360.0,
        ]);
    }

    private function mirrors(): \Illuminate\Support\Collection
    {
        return BookingMirror::withoutGlobalScopes()->where('organization_id', $this->org->id)->orderBy('id')->get();
    }

    private function booked(string $unit): void
    {
        BookingMirror::withoutGlobalScopes()->create([
            'organization_id' => $this->org->id, 'reservation_id' => 'R-' . uniqid(), 'booking_state' => 'confirmed', 'internal_status' => 'confirmed',
            'apartment_id' => $unit, 'arrival_date' => $this->checkIn, 'departure_date' => $this->checkOut, 'price_total' => 160,
        ]);
    }

    /** Stripe on; the intent reads as $status (or the call throws $status). */
    private function stripeReads(string|\Throwable $status, array &$clients = []): void
    {
        $stripe = Mockery::mock(StripeService::class);
        $stripe->shouldReceive('isEnabled')->andReturn(true);
        $stripe->shouldReceive('retrievePaymentIntent')->andReturnUsing(function (string $id) use ($status, &$clients) {
            $clients[] = \Stripe\ApiRequestor::httpClient()->getTimeout();
            if ($status instanceof \Throwable) {
                throw $status;
            }

            return PaymentIntent::constructFrom(['id' => $id, 'object' => 'payment_intent', 'status' => $status, 'amount' => 20000, 'currency' => 'eur']);
        });
        $this->app->instance(StripeService::class, $stripe);
    }

    private function paid(BookingHold $hold, string $pi = 'pi_widget_live'): array
    {
        return ['hold_token' => $hold->hold_token, 'guest' => $this->guest(), 'payment_intent_id' => $pi, 'payment_method' => 'stripe', 'payment_status' => 'authorized'];
    }

    // ── Item 3: the widget's combination under its room locks ──────────

    public function test_a_combination_whose_room_was_booked_meanwhile_is_refused_and_nothing_is_written(): void
    {
        $this->smoobuAnswers();
        $this->smoobu->shouldNotReceive('createReservation');
        $hold = $this->comboHold();
        $this->booked('102');

        try {
            $this->engine->confirm(['hold_token' => $hold->hold_token, 'guest' => $this->guest()]);
            $this->fail('a room taken meanwhile must be refused');
        } catch (\RuntimeException $e) {
            $this->assertSame('Room "Garden" is no longer available. Please choose a different combination.', $e->getMessage());
        }

        $this->assertCount(1, $this->mirrors(), 'nothing written beside the booking that took the room');
        $this->assertSame('active', $hold->fresh()->status);
        $this->assertSame(['inventory_unavailable'], BookingSubmission::query()->where('outcome', 'failure')->pluck('failure_code')->all(), 'logged after the rollback (R5-6)');
    }

    public function test_a_combination_whose_room_the_pms_says_is_taken_is_refused(): void
    {
        $this->smoobuAnswers(['102']);
        $this->smoobu->shouldNotReceive('createReservation');
        $hold = $this->comboHold();

        $this->expectExceptionMessage('Room "Garden" is no longer available. Please choose a different combination.');
        try {
            $this->engine->confirm(['hold_token' => $hold->hold_token, 'guest' => $this->guest()]);
        } finally {
            $this->assertCount(0, $this->mirrors());
            $this->assertSame('active', $hold->fresh()->status);
        }
    }

    public function test_a_combination_the_pms_cannot_be_asked_about_is_a_503_and_nothing_is_written(): void
    {
        $this->smoobu->shouldReceive('getDailyRates')->andThrow(new \Exception('cURL error 28: Operation timed out'));
        $this->smoobu->shouldReceive('getRates')->andThrow(new \Exception('cURL error 28: Operation timed out'));
        $this->smoobu->shouldReceive('resolveDirectChannelId')->andReturn(7);
        $this->smoobu->shouldNotReceive('createReservation');
        $hold = $this->comboHold();

        try {
            $this->engine->confirm(['hold_token' => $hold->hold_token, 'guest' => $this->guest()]);
            $this->fail('the PMS could not be asked');
        } catch (HttpException $e) {
            $this->assertSame(503, $e->getStatusCode());
        }
        $this->assertCount(0, $this->mirrors());
        $this->assertSame(1, AuditLog::withoutGlobalScopes()->where('action', 'booking.confirm.pms_transient_skip')->count());
    }

    public function test_a_write_that_fails_after_the_reservations_cancels_them_at_the_pms(): void
    {
        $this->smoobuAnswers();
        $next = 555401;
        $this->smoobu->shouldReceive('createReservation')->twice()->andReturnUsing(function () use (&$next) {
            $id = $next++;
            return ['id' => $id, 'reference-id' => 'BK-' . $id];
        });
        $cancelled = [];
        $this->smoobu->shouldReceive('cancelReservation')->andReturnUsing(function ($id) use (&$cancelled) {
            $cancelled[] = (string) $id;
            return [];
        });
        $hold = $this->comboHold();
        $inserts = 0;
        DB::beforeExecuting(function (string $query) use (&$inserts) {
            if (str_starts_with(strtolower(ltrim($query)), 'insert') && str_contains($query, 'booking_mirror') && ++$inserts === 2) {
                throw new \RuntimeException('simulated write failure');
            }
        });

        try {
            $this->engine->confirm(['hold_token' => $hold->hold_token, 'guest' => $this->guest()]);
            $this->fail('the second room could not be written');
        } catch (\RuntimeException $e) {
            $this->assertSame('simulated write failure', $e->getMessage());
        }

        $this->assertSame(['555401', '555402'], $cancelled, 'nothing is left booked at the PMS');
        $this->assertCount(0, $this->mirrors());
        $this->assertSame('active', $hold->fresh()->status);
    }

    /** The locks themselves: every room once, ascending, then the hold row — on PostgreSQL, where they are taken. */
    public function test_a_combination_takes_every_rooms_lock_once_ascending_then_the_hold(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            $this->markTestSkipped('Advisory and row locks are taken only on PostgreSQL (structural order: tests/Unit/Booking/LockOrderTest.php).');
        }
        $this->smoobuAnswers();
        $next = 555501;
        $this->smoobu->shouldReceive('createReservation')->twice()->andReturnUsing(function () use (&$next) {
            $id = $next++;
            return ['id' => $id, 'reference-id' => 'BK-' . $id];
        });
        $hold = $this->hold([
            'is_combo' => true, 'unit_id' => null, 'unit_name' => null, 'adults' => 4, 'room_total' => 360.0, 'gross_total' => 360.0,
            // Listed out of order: the locks still go ascending.
            'rooms' => [
                ['unit_id' => '102', 'unit_name' => 'Garden', 'room_total' => 160.0, 'price_per_night' => 80.0, 'max_guests' => 2],
                ['unit_id' => '101', 'unit_name' => 'Sea view', 'room_total' => 200.0, 'price_per_night' => 100.0, 'max_guests' => 2],
            ],
        ]);
        $trace = [];
        DB::listen(function ($q) use (&$trace) {
            if (str_contains($q->sql, 'pg_advisory_xact_lock')) {
                $trace[] = 'lock:' . $q->bindings[0];
            } elseif (str_contains($q->sql, 'booking_holds') && str_contains(strtolower($q->sql), 'for update')) {
                $trace[] = 'hold';
            }
        });

        $this->engine->confirm(['hold_token' => $hold->hold_token, 'guest' => $this->guest()]);

        $org = $this->org->id;
        $this->assertSame(["lock:room:{$org}:101", "lock:room:{$org}:102", 'hold'], $trace);
        $this->assertCount(2, $this->mirrors());
    }

    // ── Item 8: the payment read again under the hold's lock ───────────

    public function test_a_payment_cancelled_meanwhile_is_refused_before_the_pms_is_asked(): void
    {
        $this->smoobuAnswers();
        $this->smoobu->shouldNotReceive('createReservation');
        $this->stripeReads('canceled');
        $hold = $this->hold();

        try {
            $this->engine->confirm($this->paid($hold));
            $this->fail('a cancelled payment must not book');
        } catch (\RuntimeException $e) {
            $this->assertSame('Payment has not been completed.', $e->getMessage());
            $this->assertNotInstanceOf(PaymentUnverifiable::class, $e);
        }

        $this->assertCount(0, $this->mirrors(), 'no stay without a live payment');
        $this->assertSame('active', $hold->fresh()->status);
        $this->assertSame(['payment_not_completed'], BookingSubmission::query()->where('outcome', 'failure')->pluck('failure_code')->all());
    }

    public function test_a_stripe_outage_at_the_recheck_writes_nothing_and_is_unverifiable(): void
    {
        $this->smoobuAnswers();
        $this->smoobu->shouldNotReceive('createReservation');
        $this->stripeReads(new \Stripe\Exception\ApiConnectionException('Request timed out'));
        $hold = $this->hold();

        $this->expectException(PaymentUnverifiable::class);
        try {
            $this->engine->confirm($this->paid($hold));
        } finally {
            $this->assertCount(0, $this->mirrors());
            $this->assertSame('active', $hold->fresh()->status);
            $this->assertSame(['payment_check_failed'], BookingSubmission::query()->where('outcome', 'failure')->pluck('failure_code')->all());
        }
    }

    public function test_a_live_payment_is_read_again_with_the_short_timeout_and_the_stay_is_booked(): void
    {
        $this->smoobuAnswers();
        $this->smoobu->shouldReceive('createReservation')->once()->andReturn(['id' => 555601, 'reference-id' => 'BK-555601']);
        $timeouts = [];
        $this->stripeReads('requires_capture', $timeouts);
        $hold = $this->hold();

        $this->engine->confirm($this->paid($hold));

        $this->assertSame([StripeService::LOCKED_READ_TIMEOUT], $timeouts, 'read once, under the lock, with the short timeout');
        $this->assertSame('pi_widget_live', $this->mirrors()->sole()->stripe_payment_intent_id);
    }

    public function test_a_combinations_payment_cancelled_meanwhile_is_refused_before_any_reservation(): void
    {
        $this->smoobuAnswers();
        $this->smoobu->shouldNotReceive('createReservation');
        $this->stripeReads('canceled');
        $hold = $this->comboHold();

        $this->expectExceptionMessage('Payment has not been completed.');
        try {
            $this->engine->confirm($this->paid($hold));
        } finally {
            $this->assertCount(0, $this->mirrors());
        }
    }

    public function test_a_test_mode_payment_or_a_venue_without_stripe_is_not_read(): void
    {
        $this->smoobuAnswers();
        $this->smoobu->shouldReceive('createReservation')->twice()->andReturn(['id' => 555701, 'reference-id' => 'BK-555701'], ['id' => 555702, 'reference-id' => 'BK-555702']);
        $stripe = Mockery::mock(StripeService::class);
        $stripe->shouldReceive('isEnabled')->andReturn(false);
        $stripe->shouldNotReceive('retrievePaymentIntent');
        $this->app->instance(StripeService::class, $stripe);

        $this->engine->confirm(['hold_token' => $this->hold()->hold_token, 'guest' => $this->guest(), 'payment_intent_id' => 'pi_mock_x', 'payment_method' => 'mock', 'payment_status' => 'paid']);
        $this->engine->confirm($this->paid($this->hold(['unit_id' => '102', 'unit_name' => 'Garden']), 'pi_stripe_off'));

        $this->assertCount(2, $this->mirrors());
    }

    // ── Through the public endpoint ────────────────────────────────────

    /** POST /api/v1/booking/confirm: Stripe answers the controller's check, then cannot be reached under the lock. */
    public function test_the_public_confirm_answers_503_and_releases_nothing_when_the_recheck_cannot_read_the_payment(): void
    {
        $this->smoobuAnswers();
        $this->smoobu->shouldNotReceive('createReservation');
        $hold = $this->hold();
        $reads = 0;
        $stripe = Mockery::mock(StripeService::class);
        $stripe->shouldReceive('isEnabled')->andReturn(true);
        $stripe->shouldReceive('retrievePaymentIntent')->andReturnUsing(function (string $id) use (&$reads, $hold) {
            if (++$reads === 1) {
                return PaymentIntent::constructFrom(['id' => $id, 'status' => 'requires_capture', 'amount' => 20000, 'currency' => 'eur', 'metadata' => ['hold_token' => $hold->hold_token, 'org_id' => (string) $this->org->id]]);
            }
            throw new \Stripe\Exception\ApiConnectionException('Request timed out');
        });
        $stripe->shouldNotReceive('cancelPaymentIntent');
        $stripe->shouldNotReceive('refund');
        $this->app->instance(StripeService::class, $stripe);

        app()->forgetInstance('current_organization_id');
        $res = $this->postJson('/api/v1/booking/confirm', ['hold_token' => $hold->hold_token, 'guest' => $this->guest(), 'payment_intent_id' => 'pi_widget_live'], ['X-Org-Token' => $this->org->widget_token]);
        app()->instance('current_organization_id', $this->org->id);

        $res->assertStatus(503)->assertExactJson(['error' => PaymentUnverifiable::MESSAGE, 'code' => 'payment_check_failed']);
        $this->assertSame(2, $reads, 'read by the controller, then under the lock; never by a rescue');
        $this->assertCount(0, $this->mirrors());
        $this->assertSame('active', $hold->fresh()->status);
        $this->assertSame(0, AuditLog::withoutGlobalScopes()->where('action', 'like', 'booking.confirm.pi_%')->count(), 'no rescue ran');
    }
}
