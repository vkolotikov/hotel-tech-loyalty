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
 * A refund made in the Stripe dashboard for a service booking's payment is
 * recorded on the booking — read from the charge's own cumulative fields
 * (amount_refunded / amount_captured / refunded), not from
 * `charge.refunds` (not always present, and Stripe lists it newest-first,
 * so naively taking the last entry would name the OLDEST refund).
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

    private function refundEvent(string $pi, int $orgId, Charge $charge, ?string $eventId = null): void
    {
        $controller = app(BookingPublicController::class);
        (new \ReflectionMethod($controller, 'handleChargeRefunded'))->invoke($controller, $charge, $orgId, $eventId);
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

        $this->refundEvent('pi_svc_1', $this->org->id, $this->chargeEvent('pi_svc_1', 5400, 5400, true, [
            ['id' => 're_dash_1', 'amount' => 5400, 'created' => 100],
        ]));

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
        $charge = $this->chargeEvent('pi_svc_1', 5400, 5400, true, [['id' => 're_dash_1', 'amount' => 5400, 'created' => 100]]);
        $this->refundEvent('pi_svc_1', $this->org->id, $charge);
        $this->refundEvent('pi_svc_1', $this->org->id, $charge);
        $this->assertSame(1, DB::table('audit_logs')->where('action', 'service_booking.refunded')->where('subject_id', $id)->count());
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

    public function test_a_payment_no_booking_of_this_organisation_carries_is_still_reported(): void
    {
        $this->booking(['organization_id' => $this->org->id + 1]);
        $this->refundEvent('pi_svc_1', $this->org->id, $this->chargeEvent('pi_svc_1', 5400, 5400, true, [
            ['id' => 're_1', 'amount' => 5400, 'created' => 100],
        ]));
        $this->assertSame(1, DB::table('audit_logs')->where('action', 'stripe.webhook.cross_tenant_attempt')->count());
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

        $this->assertSame(3, DB::table('audit_logs')->where('action', 'service_booking.refunded')->where('subject_id', $id)->count());
    }

    public function test_redelivery_of_the_same_refund_event_is_recorded_once(): void
    {
        $id = $this->booking();
        $charge = $this->chargeEvent('pi_svc_1', 5400, 5400, true, [['id' => 're_1', 'amount' => 5400, 'created' => 100]]);
        $this->refundEvent('pi_svc_1', $this->org->id, $charge);
        $this->refundEvent('pi_svc_1', $this->org->id, $charge);
        $this->assertSame(1, DB::table('audit_logs')->where('action', 'service_booking.refunded')->where('subject_id', $id)->count());
    }

    public function test_a_payload_without_a_refunds_key_is_still_recorded_from_amount_refunded(): void
    {
        $id = $this->booking();
        $this->refundEvent('pi_svc_1', $this->org->id, $this->chargeEvent('pi_svc_1', 5400, 5400, true, null));
        $row = DB::table('service_bookings')->where('id', $id)->first();
        $this->assertSame('refunded', $row->payment_status);
        $this->assertEquals(54.0, (float) $row->refunded_amount);
        // No `refunds` payload to name a newer one — the stored value (none
        // yet, so null) is left as it was.
        $this->assertNull($row->last_refund_id);
    }

    public function test_a_refund_already_recorded_by_the_portal_is_not_overwritten(): void
    {
        $id = $this->booking(['payment_status' => 'refunded', 'refunded_amount' => 54, 'refunded_at' => now(), 'last_refund_id' => 're_portal_1']);
        $this->refundEvent('pi_svc_1', $this->org->id, $this->chargeEvent('pi_svc_1', 5400, 5400, true, [
            ['id' => 're_portal_1', 'amount' => 5400, 'created' => 100],
        ]));
        $this->assertSame(0, DB::table('audit_logs')->where('action', 'service_booking.refunded')->where('subject_id', $id)->count());
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

    // ── Never moves backwards: Stripe does not guarantee webhook delivery
    //    order, so a later delivery carrying a SMALLER cumulative amount
    //    than what is already stored must never undo what a later (in real
    //    time), larger event already recorded. ────────────────────────────

    public function test_events_delivered_out_of_order_50_then_20_keep_the_larger_amount(): void
    {
        $id = $this->booking();

        $this->refundEvent('pi_svc_1', $this->org->id, $this->chargeEvent('pi_svc_1', 5000, 5400, false, [
            ['id' => 're_1', 'amount' => 5000, 'created' => 200],
        ]));
        $row = DB::table('service_bookings')->where('id', $id)->first();
        $this->assertSame('partially_refunded', $row->payment_status);
        $this->assertEquals(50.0, (float) $row->refunded_amount);
        $this->assertSame(1, DB::table('audit_logs')->where('action', 'service_booking.refunded')->where('subject_id', $id)->count());

        // An older event (a smaller cumulative amount) arrives late.
        $this->refundEvent('pi_svc_1', $this->org->id, $this->chargeEvent('pi_svc_1', 2000, 5400, false, [
            ['id' => 're_early', 'amount' => 2000, 'created' => 100],
        ]));
        $row = DB::table('service_bookings')->where('id', $id)->first();
        $this->assertSame('partially_refunded', $row->payment_status);
        $this->assertEquals(50.0, (float) $row->refunded_amount, 'a lower, out-of-order amount must never move the stored amount backwards');
        $this->assertSame('re_1', $row->last_refund_id);
        $this->assertSame(1, DB::table('audit_logs')->where('action', 'service_booking.refunded')->where('subject_id', $id)->count(), 'the out-of-order, lower event writes no second audit');
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
        ]));
        $row = DB::table('service_bookings')->where('id', $id)->first();
        $this->assertSame('refunded', $row->payment_status);
        $this->assertEquals(54.0, (float) $row->refunded_amount);
        $this->assertSame(1, DB::table('audit_logs')->where('action', 'service_booking.refunded')->where('subject_id', $id)->count());
    }

    /**
     * The webhook dispatcher (stripeWebhook()) commits the event-id dedup
     * row BEFORE handing off to this handler. If recording the refund then
     * fails, the event must not be left marked processed with the refund
     * never recorded — the dedup row is removed so Stripe's retry gets a
     * fresh attempt, and the failure is rethrown so Stripe actually sees
     * one and retries.
     */
    public function test_a_db_failure_recording_a_refund_removes_the_dedup_mark_so_a_retry_is_processed(): void
    {
        $id = $this->booking();
        $eventId = 'evt_test_dbfail_1';
        DB::table('stripe_webhook_events')->insert([
            'organization_id' => $this->org->id, 'event_id' => $eventId, 'event_type' => 'charge.refunded',
            'payment_intent_id' => 'pi_svc_1', 'charge_id' => 'ch_1', 'received_at' => now(),
            'created_at' => now(), 'updated_at' => now(),
        ]);

        \App\Models\ServiceBooking::saving(function (\App\Models\ServiceBooking $m) {
            throw new \RuntimeException('simulated db failure');
        });

        try {
            $threw = false;
            try {
                $this->refundEvent('pi_svc_1', $this->org->id, $this->chargeEvent('pi_svc_1', 5400, 5400, true, [
                    ['id' => 're_1', 'amount' => 5400, 'created' => 100],
                ]), $eventId);
            } catch (\RuntimeException $e) {
                $threw = true;
                $this->assertSame('simulated db failure', $e->getMessage());
            }
            $this->assertTrue($threw, 'the DB failure must propagate so Stripe sees a failure response and retries');

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
