<?php

namespace Tests\Feature\Stripe;

use App\Models\BookingMirror;
use App\Models\Organization;
use App\Services\BookingRefundService;
use App\Services\SmoobuClient;
use App\Services\StripeService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use Mockery;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\Concerns\SetsUpServiceBookingSchema;
use Tests\TestCase;

/**
 * The money paths against Stripe itself, in TEST mode (step 4g of the stack plan, 2 Nov 2026: stripe-php 22, API
 * version 2026-10-28.endive). Each check goes through the application's own code — StripeService, the refund service,
 * the capture command, the Stripe webhook endpoint — with a venue whose keys are Stripe test keys:
 *
 *  - a payment intent created, confirmed with a test card, captured; another released (cancelled);
 *  - a declined card, and a card that asks for 3-D Secure (left waiting for the guest, nothing taken);
 *  - refunds, partial then full, and a repeated refund that Stripe answers as a replay (nothing new made);
 *  - `charge.refunded` and the dispute events, delivered to the webhook endpoint as events signed with a local
 *    webhook secret, carrying the real objects Stripe returned;
 *  - the capture command (`bookings:capture-pending-pis`) on a booking whose card is only authorised;
 *  - a combination booking: one payment for two rooms, refunded in part and in full, each room its share.
 *
 * Runs only when STRIPE_TEST_SECRET (an `sk_test_` key) is in the environment and the database is SQLite in memory,
 * so the key is never written to disk; otherwise every test is skipped. With STRIPE_LIVE_RECORD set to a file path,
 * each check appends what Stripe answered (one JSON line), for comparing two library versions.
 */
class LiveTestModeTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema, SetsUpServiceBookingSchema;

    private const WEBHOOK_SECRET = 'whsec_live_check_local_only';

    private Organization $org;
    private string $key;
    private \Stripe\StripeClient $raw;

    protected function setUp(): void
    {
        parent::setUp();
        $key = getenv('STRIPE_TEST_SECRET') ?: '';
        if ($key === '') {
            $this->markTestSkipped('STRIPE_TEST_SECRET is not set: live Stripe test-mode checks are skipped.');
        }
        if (!str_starts_with($key, 'sk_test_')) {
            $this->fail('STRIPE_TEST_SECRET must be a Stripe TEST secret key (sk_test_…).');
        }
        if (DB::connection()->getDriverName() !== 'sqlite' || DB::connection()->getDatabaseName() !== ':memory:') {
            $this->markTestSkipped('Live checks run only on SQLite in memory, so the test key never reaches a disk.');
        }
        $this->key = $key;

        $this->setUpBookingRefundSchema();
        $this->setUpLoyaltySchema();
        $this->setUpServiceBookingSchema();
        $this->setUpCapturePendingSchema();
        if (!Schema::hasTable('stripe_webhook_events')) {
            Schema::create('stripe_webhook_events', function ($t) {
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
        foreach (['booking_mirror', 'service_bookings'] as $table) {
            if (!Schema::hasColumn($table, 'dispute_lost_amount')) {
                Schema::table($table, fn ($t) => $t->decimal('dispute_lost_amount', 10, 2)->nullable());
            }
        }
        Mail::fake();

        $this->org = Organization::create(['name' => 'Live Check Hotel', 'slug' => 'live-check-' . uniqid()]);
        app()->instance('current_organization_id', $this->org->id);
        foreach ([
            'stripe_secret_key' => $key,
            'stripe_publishable_key' => 'pk_test_not_used_server_side',
            'stripe_webhook_secret' => self::WEBHOOK_SECRET,
            'stripe_currency' => 'eur',
            'booking_payment_enabled' => 'true',
        ] as $k => $v) {
            $row = \App\Models\HotelSetting::withoutGlobalScopes()->firstOrNew(['organization_id' => $this->org->id, 'key' => $k]);
            $row->forceFill(['organization_id' => $this->org->id, 'type' => 'string', 'group' => 'booking', 'label' => $k]);
            $row->value = $v;
            $row->save();
        }
        \App\Models\HotelSetting::flushCacheFor($this->org->id);
        app()->forgetInstance(StripeService::class);

        // A client of the test's own, for what a guest's browser or the Stripe Dashboard would do (confirm a card,
        // refund by hand, close a dispute), on the same API version as the application.
        $this->raw = new \Stripe\StripeClient(array_filter(['api_key' => $key,
            'stripe_version' => defined(StripeService::class . '::API_VERSION') ? StripeService::API_VERSION : null]));

        $smoobu = Mockery::mock(SmoobuClient::class);
        $smoobu->shouldReceive('cancelReservation')->andReturn(['ok' => true]);
        $smoobu->shouldIgnoreMissing();
        $this->app->instance(SmoobuClient::class, $smoobu);
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        Mockery::close();
        parent::tearDown();
    }

    private function stripe(): StripeService
    {
        return app(StripeService::class);
    }

    /** Appends what Stripe answered to STRIPE_LIVE_RECORD, when set: the fields a comparison of two versions reads. */
    private function record(string $check, array $fields): void
    {
        $path = getenv('STRIPE_LIVE_RECORD');
        if ($path) {
            file_put_contents($path, json_encode(['check' => $check] + $fields) . "\n", FILE_APPEND);
        }
    }

    private static function shape(\Stripe\StripeObject $o, array $keys): array
    {
        $a = $o->toArray();
        $out = ['keys' => array_keys($a)];
        foreach ($keys as $k) {
            $out[$k] = $a[$k] ?? null;
        }

        return $out;
    }

    /** A payment intent made by the application, confirmed with $card as the guest's browser would. */
    private function authorised(float $amount, string $card = 'pm_card_visa', array $meta = []): \Stripe\PaymentIntent
    {
        $made = $this->stripe()->createPaymentIntent($amount, 'Live check', ['org_id' => (string) $this->org->id, 'kind' => 'live_check'] + $meta);
        $this->assertStringStartsWith('pi_', $made['payment_intent_id']);
        $this->assertStringContainsString('_secret_', $made['client_secret']);

        return $this->raw->paymentIntents->confirm($made['payment_intent_id'],
            ['payment_method' => $card, 'return_url' => 'https://example.test/return']);
    }

    private function signed(array $event): \Illuminate\Testing\TestResponse
    {
        $payload = json_encode($event);
        $t = time();

        return $this->call('POST', '/api/v1/booking/webhooks/stripe', [], [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_STRIPE_SIGNATURE' => 't=' . $t . ',v1=' . hash_hmac('sha256', $t . '.' . $payload, self::WEBHOOK_SECRET),
        ], $payload);
    }

    private function event(string $type, \Stripe\StripeObject $object): array
    {
        return ['id' => 'evt_live_' . uniqid(), 'object' => 'event', 'type' => $type, 'livemode' => false,
            'api_version' => $this->raw->getStripeVersion(), 'created' => time(),
            'data' => ['object' => json_decode(json_encode($object->toArray()), true)]];
    }

    private function room(array $own): int
    {
        return DB::table('booking_mirror')->insertGetId(array_merge([
            'organization_id' => $this->org->id, 'reservation_id' => 'R-' . uniqid(), 'booking_state' => 'confirmed', 'internal_status' => 'confirmed',
            'channel_name' => 'Website', 'guest_name' => 'Ada Lovelace', 'guest_email' => 'ada@example.test',
            'arrival_date' => now()->addDays(10)->toDateString(), 'departure_date' => now()->addDays(12)->toDateString(),
            'payment_status' => 'paid', 'payment_method' => 'stripe', 'created_at' => now(), 'updated_at' => now(),
        ], $own));
    }

    private function row(int $id): object
    {
        return DB::table('booking_mirror')->where('id', $id)->first();
    }

    public function test_a_payment_is_authorised_captured_and_another_released(): void
    {
        $pi = $this->authorised(150.00);
        $this->assertSame('requires_capture', $pi->status);
        $this->assertSame(15000, $pi->amount);
        $this->assertSame('manual', $pi->capture_method);
        $this->assertFalse($pi->livemode);

        $read = $this->stripe()->retrievePaymentIntent($pi->id, ['latest_charge']);
        $this->assertSame('live_check', $read->metadata->kind);
        $this->assertSame((string) $this->org->id, $read->metadata->org_id);
        $this->assertSame(15000, $read->latest_charge->amount);
        $this->assertFalse($read->latest_charge->captured);

        $captured = $this->stripe()->capturePaymentIntent($pi->id);
        $this->assertSame('succeeded', $captured->status);
        $this->assertSame(15000, $captured->amount_received);

        $other = $this->authorised(80.00);
        $released = $this->stripe()->cancelPaymentIntent($other->id);
        $this->assertSame('canceled', $released->status);
        $this->assertSame('abandoned', $released->cancellation_reason);

        $this->record('payment_intent', [
            'authorised' => self::shape($pi, ['status', 'amount', 'currency', 'capture_method', 'automatic_payment_methods']),
            'charge' => self::shape($read->latest_charge, ['amount', 'captured', 'status', 'paid']),
            'captured' => self::shape($captured, ['status', 'amount_received']),
            'released' => self::shape($released, ['status', 'cancellation_reason']),
        ]);
    }

    public function test_a_declined_card_and_a_card_that_asks_for_3d_secure(): void
    {
        try {
            $this->authorised(40.00, 'pm_card_chargeDeclined');
            $this->fail('A declined card must not authorise.');
        } catch (\Stripe\Exception\CardException $e) {
            $this->assertSame('card_declined', $e->getStripeCode());
            $this->assertSame(402, $e->getHttpStatus());
            $declineCode = $e->getDeclineCode();
        }

        $pi = $this->authorised(40.00, 'pm_card_authenticationRequired');
        $this->assertSame('requires_action', $pi->status);
        $this->assertSame('redirect_to_url', $pi->next_action->type);
        $this->assertSame(0, (int) $pi->amount_capturable);
        $this->stripe()->cancelPaymentIntent($pi->id);

        $this->record('declines', ['decline_code' => $declineCode,
            'three_d_secure' => self::shape($pi, ['status', 'amount_capturable']) + ['next_action' => $pi->next_action->type]]);
    }

    public function test_refunds_partial_full_and_a_replay(): void
    {
        $pi = $this->authorised(120.00);
        $this->stripe()->capturePaymentIntent($pi->id);

        $partial = $this->stripe()->refund($pi->id, 20.00, 'requested_by_customer');
        $this->assertSame('succeeded', $partial->status);
        $this->assertSame(2000, $partial->amount);
        $this->assertFalse(StripeService::wasReplayed($partial));

        // The same amount again within Stripe's 24 hours: the idempotency key (payment + amount) makes it a replay.
        $again = $this->stripe()->refund($pi->id, 20.00, 'requested_by_customer');
        $this->assertSame($partial->id, $again->id);
        $this->assertTrue(StripeService::wasReplayed($again));

        $rest = $this->stripe()->refund($pi->id);
        $this->assertSame(10000, $rest->amount);
        $all = $this->stripe()->refundsForPaymentIntent($pi->id);
        $this->assertCount(2, $all);
        $this->assertSame(12000, array_sum(array_map(fn ($r) => $r->amount, $all)));
        $this->assertSame($rest->id, $this->stripe()->retrieveRefund($rest->id)->id);

        $this->record('refunds', ['partial' => self::shape($partial, ['status', 'amount', 'reason', 'currency']),
            'replayed' => StripeService::wasReplayed($again), 'full' => self::shape($rest, ['status', 'amount'])]);
    }

    public function test_charge_refunded_webhook_records_a_refund_made_at_stripe(): void
    {
        $pi = $this->authorised(200.00);
        $this->stripe()->capturePaymentIntent($pi->id);
        $id = $this->room(['booking_reference' => 'BK-LIVE-1', 'price_total' => 200, 'price_paid' => 200, 'stripe_payment_intent_id' => $pi->id]);

        // Refunded by hand in the Dashboard: the application learns it from charge.refunded.
        $this->raw->refunds->create(['payment_intent' => $pi->id, 'amount' => 5000]);
        $charge = $this->raw->charges->retrieve($pi->latest_charge, ['expand' => ['refunds']]);
        $this->assertSame(5000, $charge->amount_refunded);
        $this->signed($this->event('charge.refunded', $charge))->assertOk();

        $row = $this->row($id);
        $this->assertSame('partially_refunded', $row->payment_status);
        $this->assertEquals(50.0, (float) $row->refunded_amount);

        // The same event again changes nothing (one record per refund).
        $this->signed($this->event('charge.refunded', $charge))->assertOk();
        $this->assertEquals(50.0, (float) $this->row($id)->refunded_amount);

        $this->raw->refunds->create(['payment_intent' => $pi->id]);
        $charge = $this->raw->charges->retrieve($pi->latest_charge, ['expand' => ['refunds']]);
        $this->signed($this->event('charge.refunded', $charge))->assertOk();
        $this->assertSame('refunded', $this->row($id)->payment_status);
        $this->assertEquals(200.0, (float) $this->row($id)->refunded_amount);

        $this->record('charge_refunded', ['charge' => self::shape($charge, ['amount', 'amount_refunded', 'refunded', 'payment_intent'])]);
    }

    public function test_a_dispute_opened_then_lost_reaches_the_webhook(): void
    {
        $pi = $this->authorised(90.00, 'pm_card_createDispute');
        $this->stripe()->capturePaymentIntent($pi->id);
        $id = $this->room(['booking_reference' => 'BK-LIVE-D', 'price_total' => 90, 'price_paid' => 90, 'stripe_payment_intent_id' => $pi->id]);

        $dispute = null;
        for ($i = 0; $i < 20 && $dispute === null; $i++) {
            $dispute = $this->raw->disputes->all(['payment_intent' => $pi->id, 'limit' => 1])->data[0] ?? null;
            if ($dispute === null) {
                usleep(1_500_000);
            }
        }
        $this->assertNotNull($dispute, 'Stripe opens the test dispute within seconds of the capture.');
        $this->assertSame($pi->id, $dispute->payment_intent);

        $this->signed($this->event('charge.dispute.created', $dispute))->assertOk();
        $this->assertSame('disputed', $this->row($id)->payment_status);

        $closed = $this->raw->disputes->close($dispute->id); // accept it: the dispute is lost
        $this->assertSame('lost', $closed->status);
        $this->signed($this->event('charge.dispute.closed', $closed))->assertOk();

        $row = $this->row($id);
        $this->assertSame('refunded', $row->payment_status);
        $this->assertEquals(90.0, (float) $row->refunded_amount);
        $this->assertEquals(90.0, (float) $row->dispute_lost_amount);
        $this->assertSame('confirmed', $row->booking_state, 'the booking itself is left for staff');

        $this->record('dispute', ['created' => self::shape($dispute, ['status', 'amount', 'reason', 'payment_intent']),
            'closed' => self::shape($closed, ['status', 'amount'])]);
    }

    public function test_the_capture_command_captures_an_authorised_booking(): void
    {
        $pi = $this->authorised(75.00);
        $id = $this->room(['booking_reference' => 'BK-LIVE-C', 'price_total' => 75, 'payment_status' => 'authorized',
            'stripe_payment_intent_id' => $pi->id, 'created_at' => now()->subMinutes(20), 'updated_at' => now()->subMinutes(20)]);

        $this->assertSame(0, Artisan::call('bookings:capture-pending-pis', ['--org' => $this->org->id]));

        $this->assertSame('succeeded', $this->raw->paymentIntents->retrieve($pi->id)->status);
        $this->assertSame('paid', $this->row($id)->payment_status);
        $this->record('capture_command', ['row' => (array) $this->row($id) ? ['payment_status' => $this->row($id)->payment_status] : []]);
    }

    public function test_a_combination_is_one_payment_refunded_room_by_room(): void
    {
        $pi = $this->authorised(360.00);
        $this->stripe()->capturePaymentIntent($pi->id);
        $group = 'grp-live-' . uniqid();
        $lead = $this->room(['booking_group_id' => $group, 'apartment_id' => 101, 'apartment_name' => 'Sea view', 'booking_reference' => 'BK-LIVE-101',
            'price_total' => 200, 'price_paid' => 200, 'stripe_payment_intent_id' => $pi->id]);
        $other = $this->room(['booking_group_id' => $group, 'apartment_id' => 102, 'apartment_name' => 'Garden', 'booking_reference' => 'BK-LIVE-102',
            'price_total' => 160, 'price_paid' => 160]);

        // Staff refund 60.00 on the Garden room's page: it goes to that room first.
        $refunds = app(BookingRefundService::class);
        $part = $refunds->applyRefund(BookingMirror::withoutGlobalScopes()->find($other), 60.00, 'requested_by_customer', forRoomId: $other);
        $this->assertFalse($part['is_full']);
        $this->assertStringStartsWith('re_', $part['refund_id']);
        $this->assertSame(6000, $this->raw->refunds->retrieve($part['refund_id'])->amount);
        $this->assertEquals(60.0, (float) $this->row($other)->refunded_amount);
        $this->assertNull($this->row($lead)->refunded_amount);

        // Then the rest, from the lead: every room ends refunded, each its own total.
        $full = $refunds->applyRefund(BookingMirror::withoutGlobalScopes()->find($lead));
        $this->assertTrue($full['is_full']);
        $this->assertSame(36000, $this->raw->paymentIntents->retrieve($pi->id, ['expand' => ['latest_charge']])->latest_charge->amount_refunded);
        $this->assertSame(['refunded', 'refunded'], [$this->row($lead)->payment_status, $this->row($other)->payment_status]);
        $this->assertEquals(200.0, (float) $this->row($lead)->refunded_amount);
        $this->assertEquals(160.0, (float) $this->row($other)->refunded_amount);

        // Stripe's charge.refunded for the same refunds records nothing new.
        $charge = $this->raw->charges->retrieve($pi->latest_charge, ['expand' => ['refunds']]);
        $this->signed($this->event('charge.refunded', $charge))->assertOk();
        $this->assertEquals(200.0, (float) $this->row($lead)->refunded_amount);
        $this->assertEquals(160.0, (float) $this->row($other)->refunded_amount);

        $this->record('combination', ['lead' => (float) $this->row($lead)->refunded_amount, 'other' => (float) $this->row($other)->refunded_amount]);
    }
}
