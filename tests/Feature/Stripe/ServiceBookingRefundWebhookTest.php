<?php

namespace Tests\Feature\Stripe;

use App\Models\Organization;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Stripe\Charge;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\Concerns\SetsUpServiceBookingSchema;
use Tests\TestCase;

/**
 * Refund webhooks trigger a current provider read. Delayed event payloads cannot
 * overwrite newer provider state, and failed writes remain retryable.
 */
class ServiceBookingRefundWebhookTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema, SetsUpServiceBookingSchema;
    use \Tests\Concerns\MocksCurrentStripeRefunds;

    private Organization $org;
    private $stripe;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpBookingRefundSchema();
        $this->setUpServiceBookingSchema();
        $this->setUpLoyaltySchema();
        if (!\Illuminate\Support\Facades\Schema::hasTable('stripe_webhook_events')) {
            \Illuminate\Support\Facades\Schema::create('stripe_webhook_events', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->string('event_id', 80);
                $t->string('event_type', 80);
                $t->string('payment_intent_id', 80)->nullable();
                $t->string('charge_id', 80)->nullable();
                $t->timestamp('received_at')->useCurrent();
                $t->timestamps();
                $t->unique(['organization_id', 'event_id'], 'stripe_webhook_events_dedup_unique');
            });
        }
        $this->org = Organization::create(['name' => 'Numa', 'slug' => 'numa-' . uniqid()]);
        app()->instance('current_organization_id', $this->org->id);
        $this->stripe = \Mockery::mock(\App\Services\StripeService::class);
        $this->mockCurrentRefunds($this->stripe);
        $this->stripe->shouldReceive('isEnabled')->andReturn(true);
        $this->stripe->shouldReceive('constructWebhookEvent')->andReturnUsing(fn ($payload) => \Stripe\Event::constructFrom(json_decode($payload, true)));
        $this->app->instance(\App\Services\StripeService::class, $this->stripe);
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        parent::tearDown();
    }

    /** @param array<int, array{id: string, amount: int, created?: int}>|null $refundsData null = no `refunds` key at all on the payload. */
    private function chargeEvent(string $pi, int $amountRefunded, int $amountCaptured, bool $refundedFlag, ?array $refundsData = null, string $currency = 'eur'): Charge
    {
        $payload = [
            'id' => 'ch_1',
            'payment_intent' => $pi,
            'amount' => $amountCaptured,
            'amount_captured' => $amountCaptured,
            'amount_refunded' => $amountRefunded,
            'currency' => $currency,
            'refunded' => $refundedFlag,
        ];
        if ($refundsData !== null) {
            $payload['refunds'] = ['data' => $refundsData];
        }
        return Charge::constructFrom($payload);
    }

    private function refundEvent(string $pi, int $orgId, Charge $charge, ?string $eventId = null, bool $current = true, int $expectedStatus = 200): void
    {
        if ($current && isset($charge->refunds)) {
            $this->providerRefunds($pi, $charge->refunds->data ? array_map(fn ($refund) => $refund->toArray(), $charge->refunds->data) : [], (string) $charge->currency);
        }
        $object = $charge->toArray();
        $object['metadata'] = ['org_id' => (string) $orgId];
        $this->postJson('/api/v1/booking/webhooks/stripe', [
            'id' => $eventId ?? 'evt_'.uniqid(), 'object' => 'event', 'type' => 'charge.refunded', 'data' => ['object' => $object],
        ], ['Stripe-Signature' => 't=1,v1=test'])->assertStatus($expectedStatus);
    }

    private function booking(array $attrs = []): int
    {
        $orgId = $attrs['organization_id'] ?? $this->org->id;
        $serviceId = DB::table('services')->insertGetId([
            'organization_id' => $orgId, 'name' => 'Refund test service', 'price' => 54,
            'created_at' => now(), 'updated_at' => now(),
        ]);
        return DB::table('service_bookings')->insertGetId(array_merge([
            'organization_id' => $this->org->id, 'booking_reference' => 'SVC-' . strtoupper(uniqid()), 'service_id' => $serviceId,
            'customer_name' => 'Ada', 'customer_email' => 'ada@example.test', 'start_at' => now()->addDay(), 'end_at' => now()->addDay()->addHour(), 'duration_minutes' => 60,
            'total_amount' => 54, 'currency' => 'EUR', 'status' => 'cancelled', 'payment_status' => 'paid', 'stripe_payment_intent_id' => 'pi_svc_1',
            'created_at' => now(), 'updated_at' => now(),
        ], $attrs));
    }

    private function signedProvider(?callable $read = null): void
    {
        $stripe = \Mockery::mock(\App\Services\StripeService::class);
        $stripe->shouldReceive('isEnabled')->andReturn(true);
        $stripe->shouldReceive('constructWebhookEvent')->andReturnUsing(fn ($payload, $signature) =>
            \Stripe\Webhook::constructEvent($payload, $signature, 'whsec_refund_test'));
        if ($read) {
            $stripe->shouldReceive('refundsForPaymentIntent')->andReturnUsing($read);
        } else {
            $this->mockCurrentRefunds($stripe);
        }
        $this->app->instance(\App\Services\StripeService::class, $stripe);
    }

    private function signedEvent(string $id, string $type, array $object, bool $valid = true): \Illuminate\Testing\TestResponse
    {
        $object['metadata'] = ['org_id' => (string) $this->org->id];
        $payload = json_encode(['id' => $id, 'object' => 'event', 'type' => $type, 'data' => ['object' => $object]], JSON_THROW_ON_ERROR);
        $timestamp = time();
        $signature = hash_hmac('sha256', $timestamp.'.'.$payload, $valid ? 'whsec_refund_test' : 'wrong_secret');
        return $this->call('POST', '/api/v1/booking/webhooks/stripe', [], [], [], [
            'CONTENT_TYPE' => 'application/json', 'HTTP_STRIPE_SIGNATURE' => 't='.$timestamp.',v1='.$signature,
        ], $payload);
    }

    public function test_signed_refund_lifecycle_uses_current_provider_status_even_after_a_stale_success_event(): void
    {
        $id = $this->booking();
        $this->signedProvider();
        $refund = ['id' => 're_lifecycle', 'object' => 'refund', 'payment_intent' => 'pi_svc_1', 'amount' => 2000, 'currency' => 'eur', 'created' => time()];
        $this->providerRefunds('pi_svc_1', [$refund + ['status' => 'pending']]);
        $this->signedEvent('evt_pending', 'refund.created', $refund + ['status' => 'pending'])->assertOk();
        $this->assertDatabaseHas('service_bookings', ['id' => $id, 'payment_status' => 'paid', 'refunded_amount' => 0]);
        $this->assertDatabaseHas('refund_operations', ['refund_id' => 're_lifecycle', 'status' => 'pending'], 'refund_journal');
        $this->assertSame(0, DB::table('service_booking_payments')->where('service_booking_id', $id)->where('kind', 'refund')->count());

        $this->providerRefunds('pi_svc_1', [$refund + ['status' => 'succeeded']]);
        $this->signedEvent('evt_succeeded', 'refund.updated', $refund + ['status' => 'succeeded'])->assertOk();
        $this->assertDatabaseHas('service_bookings', ['id' => $id, 'payment_status' => 'partially_refunded', 'refunded_amount' => 20]);
        $this->assertDatabaseHas('refund_operations', ['refund_id' => 're_lifecycle', 'status' => 'succeeded'], 'refund_journal');
        $this->assertSame(1, DB::table('service_booking_payments')->where('service_booking_id', $id)->where('kind', 'refund')->count());

        $this->providerRefunds('pi_svc_1', [$refund + ['status' => 'failed']]);
        $this->signedEvent('evt_failed', 'refund.failed', $refund + ['status' => 'failed'])->assertOk();
        $this->assertDatabaseHas('service_bookings', ['id' => $id, 'payment_status' => 'paid', 'refunded_amount' => 0]);
        $this->assertDatabaseHas('refund_operations', ['refund_id' => 're_lifecycle', 'status' => 'failed'], 'refund_journal');

        $stale = $this->chargeEvent('pi_svc_1', 2000, 5400, false, [$refund + ['status' => 'succeeded']])->toArray();
        $this->signedEvent('evt_stale_success', 'charge.refunded', $stale)->assertOk();
        // Production has no outer transaction here. Isolate the intentional unique-key
        // violation so PostgreSQL does not abort DatabaseTransactions' test wrapper.
        DB::beginTransaction();
        try {
            $this->signedEvent('evt_stale_success', 'charge.refunded', $stale)->assertOk()->assertJsonPath('duplicate', true);
        } finally {
            DB::rollBack();
        }
        $this->assertDatabaseHas('service_bookings', ['id' => $id, 'payment_status' => 'paid', 'refunded_amount' => 0]);
        $this->assertSame(1, DB::table('service_booking_payments')->where('service_booking_id', $id)->where('kind', 'refund')->count(), 'The immutable history remains once; current failed provider status excludes it from totals.');
        $this->assertSame(['re_lifecycle' => 'failed'], \App\Services\Booking\RefundOperations::statuses($this->org->id, ['re_lifecycle']));
        $this->assertSame(4, DB::table('stripe_webhook_events')->where('organization_id', $this->org->id)->count());
    }

    public function test_signed_provider_read_failure_is_retryable_without_dedup_or_partial_money_writes(): void
    {
        $id = $this->booking();
        $attempts = 0;
        $this->signedProvider(function ($pi) use (&$attempts) {
            $this->assertSame('pi_svc_1', $pi);
            if (++$attempts === 1) throw new \RuntimeException('simulated provider unavailable');
            return [];
        });
        $refund = ['id' => 're_read_failure', 'object' => 'refund', 'payment_intent' => 'pi_svc_1', 'amount' => 2000, 'currency' => 'eur', 'status' => 'pending'];
        $this->signedEvent('evt_read_failure', 'refund.updated', $refund)->assertStatus(503);
        $this->assertSame(0, DB::table('stripe_webhook_events')->where('event_id', 'evt_read_failure')->count());
        $this->assertDatabaseHas('service_bookings', ['id' => $id, 'payment_status' => 'paid', 'refunded_amount' => null]);
        $this->assertSame(0, DB::table('service_booking_payments')->where('service_booking_id', $id)->count());
        $this->signedEvent('evt_read_failure', 'refund.updated', $refund)->assertOk();
        $this->assertSame(2, $attempts);
        $this->assertSame(1, DB::table('stripe_webhook_events')->where('event_id', 'evt_read_failure')->count());
    }

    public function test_invalid_signature_cannot_reconcile_provider_refunds(): void
    {
        $id = $this->booking();
        $this->signedProvider(fn () => throw new \RuntimeException('Provider must not be read for an invalid signature'));
        $this->signedEvent('evt_invalid_signature', 'refund.updated', [
            'id' => 're_invalid', 'object' => 'refund', 'payment_intent' => 'pi_svc_1', 'amount' => 5400, 'currency' => 'eur', 'status' => 'succeeded',
        ], valid: false)->assertStatus(400);
        $this->assertSame(0, DB::table('stripe_webhook_events')->where('event_id', 'evt_invalid_signature')->count());
        $this->assertDatabaseHas('service_bookings', ['id' => $id, 'payment_status' => 'paid', 'refunded_amount' => null]);
    }

    public function test_a_refund_for_a_service_bookings_payment_is_recorded_on_the_booking(): void
    {
        $id = $this->booking();

        $this->refundEvent('pi_svc_1', $this->org->id, $this->chargeEvent('pi_svc_1', 5400, 5400, true, [
            ['id' => 're_dash_1', 'amount' => 5400, 'created' => 100],
        ]));

        $row = DB::table('service_bookings')->where('id', $id)->first();
        $this->assertSame('refunded', $row->payment_status);
        $this->assertEquals(54.0, (float) $row->refunded_amount);
        $this->assertSame('re_dash_1', $row->last_refund_id);
        $this->assertNotNull($row->refunded_at);
        $this->assertSame(1, DB::table('audit_logs')->where('action', 'service_booking.refund_reconciled')->where('subject_id', $id)->count());
        $this->assertSame(0, DB::table('audit_logs')->where('action', 'stripe.webhook.cross_tenant_attempt')->count());
    }

    public function test_the_same_refund_delivered_twice_is_recorded_once(): void
    {
        $id = $this->booking();
        $charge = $this->chargeEvent('pi_svc_1', 5400, 5400, true, [['id' => 're_dash_1', 'amount' => 5400, 'created' => 100]]);
        $this->refundEvent('pi_svc_1', $this->org->id, $charge);
        $this->refundEvent('pi_svc_1', $this->org->id, $charge);
        $this->assertSame(1, DB::table('audit_logs')->where('action', 'service_booking.refund_reconciled')->where('subject_id', $id)->count());
    }

    public function test_a_partial_refund_is_recorded_as_partial(): void
    {
        $id = $this->booking();
        $this->refundEvent('pi_svc_1', $this->org->id, $this->chargeEvent('pi_svc_1', 2000, 5400, false, [
            ['id' => 're_1', 'amount' => 2000, 'created' => 100],
        ]));
        $row = DB::table('service_bookings')->where('id', $id)->first();
        $this->assertSame('partially_refunded', $row->payment_status);
        $this->assertEquals(20.0, (float) $row->refunded_amount);
    }

    public function test_a_payment_of_another_organisation_is_never_mutated(): void
    {
        $foreign = Organization::create(['name' => 'Other venue', 'slug' => 'foreign-'.uniqid()]);
        $id = $this->booking(['organization_id' => $foreign->id]);
        $this->refundEvent('pi_svc_1', $this->org->id, $this->chargeEvent('pi_svc_1', 5400, 5400, true, [
            ['id' => 're_1', 'amount' => 5400, 'created' => 100],
        ]));
        $this->assertSame(0.0, (float) DB::table('service_bookings')->where('id', $id)->value('refunded_amount'));
        $this->assertSame(0, \App\Services\Booking\RefundOperations::connection()->table('refund_operations')->where('organization_id', $foreign->id)->count());
    }

    /** Two partial refunds in sequence (each event carries the cumulative amount so far), then a full refund. */
    public function test_two_sequential_partial_refunds_then_a_full_refund(): void
    {
        $id = $this->booking();

        $this->refundEvent('pi_svc_1', $this->org->id, $this->chargeEvent('pi_svc_1', 2000, 5400, false, [
            ['id' => 're_1', 'amount' => 2000, 'created' => 100],
        ]));
        $row = DB::table('service_bookings')->where('id', $id)->first();
        $this->assertSame('partially_refunded', $row->payment_status);
        $this->assertEquals(20.0, (float) $row->refunded_amount);
        $this->assertSame('re_1', $row->last_refund_id);

        $this->refundEvent('pi_svc_1', $this->org->id, $this->chargeEvent('pi_svc_1', 5000, 5400, false, [
            ['id' => 're_1', 'amount' => 2000, 'created' => 100],
            ['id' => 're_2', 'amount' => 3000, 'created' => 200],
        ]));
        $row = DB::table('service_bookings')->where('id', $id)->first();
        $this->assertSame('partially_refunded', $row->payment_status);
        $this->assertEquals(50.0, (float) $row->refunded_amount);
        $this->assertSame('re_2', $row->last_refund_id);

        $this->refundEvent('pi_svc_1', $this->org->id, $this->chargeEvent('pi_svc_1', 5400, 5400, true, [
            ['id' => 're_1', 'amount' => 2000, 'created' => 100],
            ['id' => 're_2', 'amount' => 3000, 'created' => 200],
            ['id' => 're_3', 'amount' => 400, 'created' => 300],
        ]));
        $row = DB::table('service_bookings')->where('id', $id)->first();
        $this->assertSame('refunded', $row->payment_status);
        $this->assertEquals(54.0, (float) $row->refunded_amount);
        $this->assertSame('re_3', $row->last_refund_id);

        $this->assertSame(3, DB::table('audit_logs')->where('action', 'service_booking.refund_reconciled')->where('subject_id', $id)->count());
    }

    public function test_redelivery_of_the_same_refund_event_is_recorded_once(): void
    {
        $id = $this->booking();
        $charge = $this->chargeEvent('pi_svc_1', 5400, 5400, true, [['id' => 're_1', 'amount' => 5400, 'created' => 100]]);
        $this->refundEvent('pi_svc_1', $this->org->id, $charge);
        $this->refundEvent('pi_svc_1', $this->org->id, $charge);
        $this->assertSame(1, DB::table('audit_logs')->where('action', 'service_booking.refund_reconciled')->where('subject_id', $id)->count());
    }

    public function test_a_payload_without_a_refunds_key_is_recorded_from_the_provider_read(): void
    {
        $id = $this->booking();
        $this->providerRefunds('pi_svc_1', [['id' => 're_provider_full', 'amount' => 5400]]);
        $this->refundEvent('pi_svc_1', $this->org->id, $this->chargeEvent('pi_svc_1', 5400, 5400, true, null));
        $row = DB::table('service_bookings')->where('id', $id)->first();
        $this->assertSame('refunded', $row->payment_status);
        $this->assertEquals(54.0, (float) $row->refunded_amount);
        // The provider read supplies the refund ID even when the event has no list.
        $this->assertSame('re_provider_full', $row->last_refund_id);
    }

    public function test_a_refund_already_recorded_by_the_portal_is_not_overwritten(): void
    {
        $id = $this->booking(['payment_status' => 'refunded', 'refunded_amount' => 54, 'refunded_at' => now(), 'last_refund_id' => 're_portal_1']);
        $this->refundEvent('pi_svc_1', $this->org->id, $this->chargeEvent('pi_svc_1', 5400, 5400, true, [
            ['id' => 're_portal_1', 'amount' => 5400, 'created' => 100],
        ]));
        $this->assertSame(0, DB::table('audit_logs')->where('action', 'service_booking.refund_reconciled')->where('subject_id', $id)->count());
        $row = DB::table('service_bookings')->where('id', $id)->first();
        $this->assertSame('re_portal_1', $row->last_refund_id);
    }

    public function test_a_zero_decimal_currency_amount_is_not_divided(): void
    {
        $id = $this->booking(['currency' => 'JPY', 'total_amount' => 5400]);
        $this->refundEvent('pi_svc_1', $this->org->id, $this->chargeEvent('pi_svc_1', 5400, 5400, true, [
            ['id' => 're_jpy_1', 'amount' => 5400, 'created' => 100],
        ], 'jpy'));
        $row = DB::table('service_bookings')->where('id', $id)->first();
        $this->assertSame('refunded', $row->payment_status);
        $this->assertEquals(5400.0, (float) $row->refunded_amount);
    }

    // A stale event must not replace current provider state.

    public function test_events_delivered_out_of_order_50_then_20_keep_the_larger_amount(): void
    {
        $id = $this->booking();

        $this->refundEvent('pi_svc_1', $this->org->id, $this->chargeEvent('pi_svc_1', 5000, 5400, false, [
            ['id' => 're_1', 'amount' => 5000, 'created' => 200],
        ]));
        $row = DB::table('service_bookings')->where('id', $id)->first();
        $this->assertSame('partially_refunded', $row->payment_status);
        $this->assertEquals(50.0, (float) $row->refunded_amount);
        $this->assertSame(1, DB::table('audit_logs')->where('action', 'service_booking.refund_reconciled')->where('subject_id', $id)->count());

        // An older event (a smaller cumulative amount) arrives late.
        $this->refundEvent('pi_svc_1', $this->org->id, $this->chargeEvent('pi_svc_1', 2000, 5400, false, [
            ['id' => 're_early', 'amount' => 2000, 'created' => 100],
        ]), current: false);
        $row = DB::table('service_bookings')->where('id', $id)->first();
        $this->assertSame('partially_refunded', $row->payment_status);
        $this->assertEquals(50.0, (float) $row->refunded_amount, 'a lower, out-of-order amount must never move the stored amount backwards');
        $this->assertSame('re_1', $row->last_refund_id);
        $this->assertSame(1, DB::table('audit_logs')->where('action', 'service_booking.refund_reconciled')->where('subject_id', $id)->count(), 'the out-of-order, lower event writes no second audit');
    }

    public function test_a_full_refund_then_an_out_of_order_partial_stays_refunded(): void
    {
        $id = $this->booking();

        $this->refundEvent('pi_svc_1', $this->org->id, $this->chargeEvent('pi_svc_1', 5400, 5400, true, [
            ['id' => 're_full', 'amount' => 5400, 'created' => 300],
        ]));
        $row = DB::table('service_bookings')->where('id', $id)->first();
        $this->assertSame('refunded', $row->payment_status);
        $this->assertEquals(54.0, (float) $row->refunded_amount);

        // A partial event (lower cumulative amount, delivered late) must not
        // regress the status back to partially_refunded.
        $this->refundEvent('pi_svc_1', $this->org->id, $this->chargeEvent('pi_svc_1', 2000, 5400, false, [
            ['id' => 're_partial_late', 'amount' => 2000, 'created' => 150],
        ]), current: false);
        $row = DB::table('service_bookings')->where('id', $id)->first();
        $this->assertSame('refunded', $row->payment_status);
        $this->assertEquals(54.0, (float) $row->refunded_amount);
        $this->assertSame(1, DB::table('audit_logs')->where('action', 'service_booking.refund_reconciled')->where('subject_id', $id)->count());
    }

    /**
     * The webhook dispatcher (stripeWebhook()) commits the event-id dedup
     * row BEFORE handing off to this handler. If recording the refund then
     * fails, the event must not be left marked processed with the refund
     * never recorded — the dedup row is removed so Stripe's retry gets a
     * fresh attempt, and the dispatcher returns HTTP 503 so Stripe sees
     * one and retries.
     */
    public function test_a_db_failure_recording_a_refund_removes_the_dedup_mark_so_a_retry_is_processed(): void
    {
        $id = $this->booking();
        $eventId = 'evt_test_dbfail_1';

        \App\Models\ServiceBooking::saving(function (\App\Models\ServiceBooking $m) {
            throw new \RuntimeException('simulated db failure');
        });

        try {
            $this->refundEvent('pi_svc_1', $this->org->id, $this->chargeEvent('pi_svc_1', 5400, 5400, true, [
                ['id' => 're_1', 'amount' => 5400, 'created' => 100],
            ]), $eventId, expectedStatus: 503);

            $this->assertSame(0, DB::table('stripe_webhook_events')->where('event_id', $eventId)->count(), "the dedup mark must be removed so Stripe's retry is processed");
            $row = DB::table('service_bookings')->where('id', $id)->first();
            $this->assertSame('paid', $row->payment_status, 'the failed write must not have partially applied');
        } finally {
            \App\Models\ServiceBooking::flushEventListeners();
        }

        // The retry: same event, no throw this time — must actually record it.
        $this->refundEvent('pi_svc_1', $this->org->id, $this->chargeEvent('pi_svc_1', 5400, 5400, true, [
            ['id' => 're_1', 'amount' => 5400, 'created' => 100],
        ]), $eventId);
        $row = DB::table('service_bookings')->where('id', $id)->first();
        $this->assertSame('refunded', $row->payment_status);
    }
}
