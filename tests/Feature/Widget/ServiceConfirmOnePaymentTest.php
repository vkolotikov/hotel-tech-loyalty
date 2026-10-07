<?php

namespace Tests\Feature\Widget;

use App\Mail\ServiceBookingConfirmationMail;
use App\Models\HotelSetting;
use App\Models\Organization;
use App\Models\Service;
use App\Models\ServiceBooking;
use App\Models\ServiceBookingSubmission;
use App\Models\ServiceMaster;
use App\Services\StripeService;
use Illuminate\Support\Facades\Mail;
use Mockery;
use Stripe\PaymentIntent;
use Tests\Concerns\SetsUpServiceBookingSchema;
use Tests\Feature\Member\MemberEndpointTestCase;

/**
 * The public services confirm (POST /api/v1/services/confirm, the venue's
 * widget token and nothing else) against the database rule that one payment
 * pays for one service booking. The first booking on a payment is stored
 * exactly as before; a second booking naming the same payment — checked
 * before the insert, or refused by the unique index when two confirms race —
 * is answered 409 in one plain sentence, and nothing is cancelled, refunded
 * or captured for it. Stripe is a Mockery mock throughout.
 */
class ServiceConfirmOnePaymentTest extends MemberEndpointTestCase
{
    use SetsUpServiceBookingSchema;

    private const USED = 'This payment has already been used for a booking.';

    private Organization $org;
    private Service $service;
    private ServiceMaster $master;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpServiceBookingSchema();
        $this->org = $this->tenant();
        ['service' => $this->service, 'master' => $this->master] = $this->seedBookableService($this->org->id);
        $this->travelTo(now()->next('Monday')->setTime(8, 0));
        Mail::fake();
    }

    /**
     * Stripe enabled; every intent is authorised (`requires_capture`) until
     * it is captured, then `succeeded`. Records the captured ids.
     */
    private function stripe(array &$captured = []): Mockery\MockInterface
    {
        $stripe = Mockery::mock(StripeService::class);
        $stripe->shouldReceive('isEnabled')->andReturn(true);
        $stripe->shouldReceive('retrievePaymentIntent')->andReturnUsing(function (string $id) use (&$captured) {
            return $this->intent($id, in_array($id, $captured, true) ? 'succeeded' : 'requires_capture');
        });
        $stripe->shouldReceive('capturePaymentIntent')->andReturnUsing(function (string $id) use (&$captured) {
            $captured[] = $id;
            return $this->intent($id, 'succeeded');
        });
        $stripe->shouldNotReceive('cancelPaymentIntent');
        $stripe->shouldNotReceive('refund');
        $this->app->instance(StripeService::class, $stripe);

        return $stripe;
    }

    private function intent(string $id, string $status): PaymentIntent
    {
        return PaymentIntent::constructFrom(['id' => $id, 'status' => $status, 'amount' => 6000, 'currency' => 'eur']);
    }

    private function confirm(string $time, array $extra = [], ?Organization $org = null, ?Service $service = null, ?ServiceMaster $master = null, ?string $key = null)
    {
        $org ??= $this->org;
        $this->flushHeaders();

        return $this->withHeader('Idempotency-Key', $key ?? 'widget-' . uniqid('', true))
            ->postJson('/api/v1/services/confirm?org=' . $org->fresh()->widget_token, array_merge([
                'service_id'        => ($service ?? $this->service)->id,
                'service_master_id' => ($master ?? $this->master)->id,
                'start_at'          => now()->setTime(...explode(':', $time))->toIso8601String(),
                'party_size'        => 1,
                'customer_name'     => 'Ada Guest',
                'customer_email'    => 'Ada.Guest@Example.test',
            ], $extra));
    }

    private function rows(): \Illuminate\Support\Collection
    {
        return ServiceBooking::withoutGlobalScopes()->orderBy('id')->get();
    }

    private function assertPlainRefusal($response): void
    {
        $response->assertStatus(409)->assertExactJson(['error' => self::USED]);
        foreach (['SQLSTATE', 'service_bookings', 'unique', 'pi_'] as $leak) {
            $this->assertStringNotContainsStringIgnoringCase($leak, $response->getContent());
        }
    }

    private function failedReasons(): array
    {
        return ServiceBookingSubmission::withoutGlobalScopes()->where('outcome', 'failed')->orderBy('id')->pluck('error_message')->all();
    }

    public function test_the_first_booking_on_a_payment_is_stored_as_before(): void
    {
        $captured = [];
        $this->stripe($captured);

        $res = $this->confirm('10:00', ['payment_intent_id' => 'pi_first']);

        $res->assertStatus(201);
        $this->assertSame(['booking_reference', 'booking', 'payment_capture_pending'], array_keys($res->json()));
        $this->assertFalse($res->json('payment_capture_pending'));
        $this->assertSame(['pi_first'], $captured, 'captured once, right after the insert');

        $b = $this->rows()->sole();
        $this->assertSame($b->booking_reference, $res->json('booking_reference'));
        $this->assertSame($b->booking_reference, $res->json('booking.booking_reference'));
        $this->assertSame('pi_first', $res->json('booking.stripe_payment_intent_id'));
        $this->assertSame('paid', $res->json('booking.payment_status'));
        $this->assertSame($this->org->id, (int) $b->organization_id);
        $this->assertSame($this->service->id, (int) $b->service_id);
        $this->assertSame($this->master->id, (int) $b->service_master_id);
        $this->assertSame('ada.guest@example.test', $b->customer_email);
        $this->assertSame('Ada Guest', $b->customer_name);
        $this->assertSame(1, $b->party_size);
        $this->assertSame(45, $b->duration_minutes);
        $this->assertSame('60.00', $b->service_price);
        $this->assertSame('0.00', $b->extras_total);
        $this->assertSame('60.00', $b->total_amount);
        $this->assertSame('EUR', $b->currency);
        $this->assertSame('confirmed', $b->status);
        $this->assertSame('paid', $b->payment_status);
        $this->assertSame('pi_first', $b->stripe_payment_intent_id);
        $this->assertSame('widget', $b->source);
        $this->assertNull($b->member_id);
        $this->assertSame(now()->setTime(10, 0)->format('Y-m-d H:i'), $b->start_at->format('Y-m-d H:i'));

        $submission = ServiceBookingSubmission::withoutGlobalScopes()->sole();
        $this->assertSame('success', $submission->outcome);
        $this->assertSame($b->id, (int) $submission->service_booking_id);
        Mail::assertQueued(ServiceBookingConfirmationMail::class);
    }

    public function test_a_second_booking_on_the_same_payment_is_refused_in_plain_words(): void
    {
        $captured = [];
        $this->stripe($captured);
        $this->confirm('10:00', ['payment_intent_id' => 'pi_used'])->assertStatus(201);
        $first = $this->rows()->sole();

        $this->assertPlainRefusal($this->confirm('12:00', ['payment_intent_id' => 'pi_used']));

        $this->assertSame([$first->id], $this->rows()->pluck('id')->all(), 'no second row');
        $this->assertSame(['pi_used'], $captured, 'captured once, for the first booking only');
        $kept = $first->fresh();
        $this->assertSame('pi_used', $kept->stripe_payment_intent_id);
        $this->assertSame('paid', $kept->payment_status);
        $this->assertSame('confirmed', $kept->status);
        $this->assertSame(['payment already used'], $this->failedReasons());
        Mail::assertQueued(ServiceBookingConfirmationMail::class, 1);
    }

    /**
     * A database the migration left without the index (it found repeated
     * references already there): the check before the insert refuses on its
     * own.
     */
    public function test_the_check_before_the_insert_refuses_without_the_index(): void
    {
        (require base_path('database/migrations/2026_10_01_100000_service_bookings_unique_payment.php'))->down();
        $captured = [];
        $this->stripe($captured);
        $this->confirm('10:00', ['payment_intent_id' => 'pi_used'])->assertStatus(201);

        $this->assertPlainRefusal($this->confirm('12:00', ['payment_intent_id' => 'pi_used']));

        $this->assertSame(1, $this->rows()->count());
        $this->assertSame(['pi_used'], $captured);
        $this->assertSame(['payment already used'], $this->failedReasons());
    }

    /**
     * Two confirms naming the same payment at the same moment: both pass the
     * check before the insert, and the unique index refuses the second
     * insert. Simulated by writing the other request's booking between this
     * request's check and its insert (the `creating` event); here that
     * booking shares this request's rolled-back transaction, in production
     * it is another request's committed row.
     */
    public function test_two_confirms_at_the_same_moment_are_refused_the_same_way(): void
    {
        $captured = [];
        $this->stripe($captured);
        $raced = false;
        ServiceBooking::creating(function (ServiceBooking $b) use (&$raced) {
            if ($raced || $b->stripe_payment_intent_id !== 'pi_race') {
                return;
            }
            $raced = true;
            \Illuminate\Support\Facades\DB::table('service_bookings')->insert([
                'organization_id' => $b->organization_id, 'booking_reference' => 'SVC-RACE0001',
                'service_id' => $b->service_id, 'service_master_id' => $b->service_master_id,
                'customer_name' => 'Other Guest', 'customer_email' => 'other@example.test',
                'start_at' => now()->setTime(14, 0), 'end_at' => now()->setTime(14, 45), 'duration_minutes' => 45,
                'status' => 'confirmed', 'payment_status' => 'authorized', 'stripe_payment_intent_id' => 'pi_race',
                'source' => 'widget', 'created_at' => now(), 'updated_at' => now(),
            ]);
        });

        $this->assertPlainRefusal($this->confirm('10:00', ['payment_intent_id' => 'pi_race']));

        $this->assertTrue($raced, 'the other booking was written between the check and the insert');
        $this->assertSame(0, $this->rows()->count(), 'nothing from this request is stored');
        $this->assertSame([], $captured, 'nothing captured for a refused reuse');
        $this->assertSame(['payment already used'], $this->failedReasons());
        Mail::assertNothingQueued();
    }

    public function test_bookings_without_a_payment_are_stored_as_before(): void
    {
        $captured = [];
        $this->stripe($captured);

        $this->confirm('10:00')->assertStatus(201)->assertJsonMissingPath('payment_capture_pending');
        $this->confirm('12:00', ['payment_intent_id' => null])->assertStatus(201);

        $this->assertSame([], $captured);
        $rows = $this->rows();
        $this->assertCount(2, $rows);
        $this->assertSame([null, null], $rows->pluck('stripe_payment_intent_id')->all());
        $this->assertSame(['unpaid', 'unpaid'], $rows->pluck('payment_status')->all());
        $this->assertSame([], $this->failedReasons());
    }

    public function test_the_same_payment_in_another_organisation_is_that_organisations_own(): void
    {
        $this->stripe();
        $this->confirm('10:00', ['payment_intent_id' => 'pi_shared'])->assertStatus(201);

        // The first request bound its tenant and brand to the container; what follows belongs to another venue.
        app()->forgetInstance('current_organization_id');
        app()->forgetInstance('current_brand_id');
        $other = $this->tenant('Other Venue');
        ['service' => $service, 'master' => $master] = $this->seedBookableService($other->id);
        $this->confirm('10:00', ['payment_intent_id' => 'pi_shared'], $other, $service, $master)->assertStatus(201);

        $this->assertSame([$this->org->id, $other->id], $this->rows()->pluck('organization_id')->map(fn ($id) => (int) $id)->all());
    }

    /**
     * A mock payment (`pi_mock_…`) is trusted by its prefix and never sent to
     * Stripe. /services/payment-intent mints a fresh one per call, so two
     * bookings carry two ids and both are stored as before. The same mock id
     * sent twice was stored twice before this rule; now the second is refused
     * like any reused payment, with the index and without it (a database the
     * migration left alone).
     */
    #[\PHPUnit\Framework\Attributes\DataProvider('withAndWithoutTheIndex')]
    public function test_mock_payments_are_stored_as_before_and_a_repeated_mock_id_is_refused(bool $index): void
    {
        if (!$index) {
            (require base_path('database/migrations/2026_10_01_100000_service_bookings_unique_payment.php'))->down();
        }
        $stripe = Mockery::mock(StripeService::class);
        $stripe->shouldReceive('isEnabled')->andReturn(true);
        $stripe->shouldNotReceive('retrievePaymentIntent');
        $stripe->shouldNotReceive('capturePaymentIntent');
        $stripe->shouldNotReceive('cancelPaymentIntent');
        $this->app->instance(StripeService::class, $stripe);
        // Mock payments exist only while the venue's test mode is on (2026-10-07: with it off they are refused).
        $this->testMode();

        $this->confirm('10:00', ['payment_intent_id' => 'pi_mock_aaaa'])->assertStatus(201)->assertJsonMissingPath('payment_capture_pending');
        $this->confirm('12:00', ['payment_intent_id' => 'pi_mock_bbbb'])->assertStatus(201);
        $this->assertSame(['paid', 'paid'], $this->rows()->pluck('payment_status')->all());
        Mail::assertNothingQueued();

        $this->assertPlainRefusal($this->confirm('14:00', ['payment_intent_id' => 'pi_mock_aaaa']));
        $this->assertSame(['pi_mock_aaaa', 'pi_mock_bbbb'], $this->rows()->pluck('stripe_payment_intent_id')->all());
        $this->assertSame(['payment already used'], $this->failedReasons());
    }

    public static function withAndWithoutTheIndex(): array
    {
        return ['with the index' => [true], 'without the index' => [false]];
    }

    /** The venue's booking test mode switched on (the setting the full admin writes). */
    private function testMode(): void
    {
        $row = new HotelSetting();
        $row->organization_id = $this->org->id;
        $row->key = 'booking_mock_mode';
        $row->value = 'true';
        $row->group = 'booking';
        $row->save();
        HotelSetting::flushCacheFor($this->org->id);
    }

    // Owner 2026-10-07 ("fix all these small issues"): a `pi_mock_…` id counts only while the venue's test mode is on;
    // with it off it is a made-up payment and never a paid booking.
    public function test_a_mock_payment_with_test_mode_off_is_refused_and_nothing_is_booked(): void
    {
        $stripe = Mockery::mock(StripeService::class);
        $stripe->shouldReceive('isEnabled')->andReturn(true);
        $stripe->shouldNotReceive('retrievePaymentIntent');
        $this->app->instance(StripeService::class, $stripe);

        $this->confirm('10:00', ['payment_intent_id' => 'pi_mock_forged'])
            ->assertStatus(400)->assertExactJson(['error' => 'Payment has not been completed.']);
        $this->assertSame(0, $this->rows()->count());
    }

    /**
     * Any other unique violation keeps the answer it had: without a payment
     * on the request, a clash on booking_reference is answered 409 with the
     * exception's own message, as every RuntimeException here is. (Forced by
     * handing the insert a reference another booking holds.)
     */
    public function test_another_unique_violation_keeps_its_answer(): void
    {
        $this->stripe();
        $this->confirm('10:00')->assertStatus(201);
        $taken = $this->rows()->sole()->booking_reference;
        ServiceBooking::creating(fn (ServiceBooking $b) => $b->booking_reference = $taken);

        $res = $this->confirm('12:00');

        $res->assertStatus(409);
        $message = (string) $res->json('error');
        $this->assertSame(['error'], array_keys($res->json()));
        $this->assertStringContainsString('booking_reference', $message);
        $this->assertSame([$message], $this->failedReasons());
        $this->assertSame(1, $this->rows()->count());
    }

    /**
     * The same on a request that carries a payment no booking holds: the
     * clash is on booking_reference, not on the payment rule, so the guest is
     * not told their payment is used and the log keeps the real fault.
     */
    public function test_another_unique_violation_on_a_paid_request_keeps_its_answer(): void
    {
        $captured = [];
        $this->stripe($captured);
        $this->confirm('10:00')->assertStatus(201);
        $taken = $this->rows()->sole()->booking_reference;
        ServiceBooking::creating(fn (ServiceBooking $b) => $b->booking_reference = $taken);

        $res = $this->confirm('12:00', ['payment_intent_id' => 'pi_innocent']);

        $res->assertStatus(409);
        $message = (string) $res->json('error');
        $this->assertSame(['error'], array_keys($res->json()));
        $this->assertNotSame(self::USED, $message);
        $this->assertStringContainsString('booking_reference', $message);
        $this->assertSame([$message], $this->failedReasons());
        $this->assertSame(1, $this->rows()->count());
        $this->assertSame([], $captured);
    }

    /**
     * An honest retry: the same confirm sent again with the same
     * Idempotency-Key after the first one succeeded is answered by the
     * endpoint's replay, which runs before any payment check — the same
     * booking, no second row, no refusal.
     */
    public function test_a_retry_with_the_same_key_replays_the_booking(): void
    {
        $captured = [];
        $this->stripe($captured);
        $first = $this->confirm('10:00', ['payment_intent_id' => 'pi_retry'], key: 'widget-retry-key-0001');
        $first->assertStatus(201);

        $again = $this->confirm('10:00', ['payment_intent_id' => 'pi_retry'], key: 'widget-retry-key-0001');

        $again->assertStatus(200);
        $this->assertSame(['booking_reference', 'booking', 'replayed'], array_keys($again->json()));
        $this->assertTrue($again->json('replayed'));
        $this->assertSame($first->json('booking_reference'), $again->json('booking_reference'));
        $this->assertSame($first->json('booking.id'), $again->json('booking.id'));
        $this->assertSame('pi_retry', $again->json('booking.stripe_payment_intent_id'));
        $this->assertSame(1, $this->rows()->count());
        $this->assertSame(['pi_retry'], $captured, 'captured once, by the first confirm');
        $this->assertSame([], $this->failedReasons());
    }

    /** A slot that is taken keeps its own answer, whatever payment the request names. */
    public function test_a_taken_slot_is_still_answered_as_a_taken_slot(): void
    {
        $this->stripe();
        $this->confirm('10:00', ['payment_intent_id' => 'pi_slot'])->assertStatus(201);

        $res = $this->confirm('10:00', ['payment_intent_id' => 'pi_slot']);

        $res->assertStatus(409);
        $this->assertNotSame(self::USED, $res->json('error'));
        $this->assertSame(1, $this->rows()->count());
    }
}
