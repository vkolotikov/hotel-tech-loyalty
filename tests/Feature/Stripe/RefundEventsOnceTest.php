<?php

namespace Tests\Feature\Stripe;

use App\Mail\BookingRefundMail;
use App\Models\BookingMirror;
use App\Models\Organization;
use App\Models\RefundAttempt;
use App\Services\BookingRefundService;
use App\Services\SmoobuClient;
use App\Services\StripeService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use Mockery;
use Stripe\Refund;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Release 6, item 2: a stay's refund is recorded exactly once with no time
 * window. BookingRefundService::applyRefund() holds the payment's refund lock
 * (`refund:{payer}`, in the store every container sees) around its Stripe call
 * and its stamp; the `charge.refunded` webhook compares Stripe's cumulative
 * `amount_refunded` with what the rooms hold, and writes the difference, under
 * the same lock (recordStripeRefund()). The 60-second RefundAttempt skip is
 * gone: a second dashboard refund seconds after the first is recorded.
 *
 * Stripe and Smoobu are mocks; nothing leaves the process. "Mid-flight" is the
 * Stripe refund call itself: the mock delivers the refund's own webhook from
 * inside it, while applyRefund() holds the lock.
 */
class RefundEventsOnceTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema;

    private Organization $org;
    private $stripe;
    private $smoobu;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpBookingRefundSchema();
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
        // Production's `refund_attempts_replay_unique` (mirror, intent, requested_at in whole seconds), which the
        // SQLite test schema lacks: two recordings of one payment in one second must both get their attempt row.
        if (!Schema::hasIndex('refund_attempts', 'refund_attempts_replay_unique')) {
            Schema::table('refund_attempts', fn ($t) => $t->unique(['mirror_id', 'payment_intent_id', 'requested_at'], 'refund_attempts_replay_unique'));
        }
        Mail::fake();
        // A webhook that finds the lock held does not wait in a test: it answers at once so Stripe delivers again.
        config(['services.stripe.refund_lock_wait' => 0]);
        $this->org = Organization::create(['name' => 'Seaside Hotel', 'slug' => 'seaside-' . uniqid()]);
        app()->instance('current_organization_id', $this->org->id);

        $this->stripe = Mockery::mock(StripeService::class);
        $this->stripe->shouldReceive('isEnabled')->andReturn(true);
        $this->stripe->shouldReceive('constructWebhookEvent')->andReturnUsing(fn (string $payload) => \Stripe\Event::constructFrom(json_decode($payload, true)));
        $this->app->instance(StripeService::class, $this->stripe);
        $this->smoobu = Mockery::mock(SmoobuClient::class);
        $this->app->instance(SmoobuClient::class, $this->smoobu);
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        Mockery::close();
        parent::tearDown();
    }

    private function stay(float $total = 200.0, string $pi = 'pi_refund_1', array $own = []): int
    {
        return DB::table('booking_mirror')->insertGetId(array_merge([
            'organization_id' => $this->org->id, 'reservation_id' => 'R-' . uniqid(), 'booking_reference' => 'BK-' . substr(uniqid(), -6),
            'booking_state' => 'confirmed', 'internal_status' => 'confirmed', 'channel_name' => 'Website',
            'apartment_id' => 101, 'apartment_name' => 'Sea view', 'guest_name' => 'Ada Lovelace', 'guest_email' => 'ada@example.test',
            'arrival_date' => now()->addDays(10)->toDateString(), 'departure_date' => now()->addDays(12)->toDateString(),
            'price_total' => $total, 'price_paid' => $total, 'payment_status' => 'paid', 'payment_method' => 'stripe',
            'stripe_payment_intent_id' => $pi, 'created_at' => now(), 'updated_at' => now(),
        ], $own));
    }

    private function row(int $id): object
    {
        return DB::table('booking_mirror')->where('id', $id)->first();
    }

    /** A `charge.refunded` event as Stripe sends it: the charge's cumulative amount_refunded, its refunds newest first. */
    private function event(string $id, int $refundedMinor, array $refunds, string $pi = 'pi_refund_1', int $amountMinor = 20000, string $currency = 'eur'): array
    {
        return [
            'id' => $id, 'object' => 'event', 'type' => 'charge.refunded',
            'data' => ['object' => [
                'id' => 'ch_' . $pi, 'object' => 'charge', 'payment_intent' => $pi, 'amount' => $amountMinor, 'amount_captured' => $amountMinor,
                'amount_refunded' => $refundedMinor, 'currency' => $currency, 'refunded' => $refundedMinor >= $amountMinor,
                'metadata' => ['org_id' => (string) $this->org->id],
                'refunds' => ['object' => 'list', 'data' => $refunds],
            ]],
        ];
    }

    private function deliver(array $event)
    {
        return $this->postJson('/api/v1/booking/webhooks/stripe', $event, ['Stripe-Signature' => 't=1,v1=test']);
    }

    private function refundAudits(): int
    {
        return DB::table('audit_logs')->where('organization_id', $this->org->id)->where('action', 'booking_refunded')->count();
    }

    public function test_an_admin_refund_and_its_own_webhook_arriving_mid_flight_record_it_once(): void
    {
        $id = $this->stay();
        $this->smoobu->shouldReceive('cancelReservation')->once()->andReturn([]);
        $event = $this->event('evt_admin_1', 20000, [['id' => 're_admin_1', 'object' => 'refund', 'amount' => 20000, 'created' => time()]]);
        $midFlight = null;
        $this->stripe->shouldReceive('refund')->once()->andReturnUsing(function () use ($event, &$midFlight) {
            // Stripe has refunded and its event arrives while our call still holds the lock.
            $midFlight = $this->deliver($event);
            return Refund::constructFrom(['id' => 're_admin_1', 'object' => 'refund', 'amount' => 20000, 'currency' => 'eur']);
        });

        $outcome = app(BookingRefundService::class)->applyRefund(BookingMirror::withoutGlobalScopes()->find($id), null, 'requested_by_customer');

        $midFlight->assertStatus(500);
        $this->assertSame(0, DB::table('stripe_webhook_events')->where('event_id', 'evt_admin_1')->count(), 'the event that found the lock held is delivered again');
        $this->assertTrue($outcome['is_full']);

        // Stripe delivers it again: nothing new.
        $this->deliver($event)->assertOk();

        $row = $this->row($id);
        $this->assertSame('refunded', $row->payment_status);
        $this->assertEquals(200.0, (float) $row->refunded_amount);
        $this->assertSame('re_admin_1', $row->last_refund_id);
        $this->assertSame(1, $this->refundAudits(), 'recorded once');
        $this->assertSame(1, RefundAttempt::query()->count());
        Mail::assertQueued(BookingRefundMail::class, 1);
    }

    public function test_two_dashboard_refunds_ten_seconds_apart_are_both_recorded(): void
    {
        $id = $this->stay();
        $this->stripe->shouldNotReceive('refund');
        $this->smoobu->shouldNotReceive('cancelReservation');
        $t0 = now()->getTimestamp();

        $this->deliver($this->event('evt_dash_1', 3000, [['id' => 're_dash_1', 'object' => 'refund', 'amount' => 3000, 'created' => $t0]]))->assertOk();
        $this->assertEquals(30.0, (float) $this->row($id)->refunded_amount);

        $this->travel(10)->seconds();
        $this->deliver($this->event('evt_dash_2', 8000, [
            ['id' => 're_dash_2', 'object' => 'refund', 'amount' => 5000, 'created' => $t0 + 10],
            ['id' => 're_dash_1', 'object' => 'refund', 'amount' => 3000, 'created' => $t0],
        ]))->assertOk();

        $row = $this->row($id);
        $this->assertSame('partially_refunded', $row->payment_status);
        $this->assertEquals(80.0, (float) $row->refunded_amount, 'the second refund, ten seconds later, is recorded too');
        $this->assertSame('re_dash_2', $row->last_refund_id);
        $this->assertSame(2, $this->refundAudits());
    }

    /** In the same second too: `refund_attempts_replay_unique` never refuses the second recording. */
    public function test_two_dashboard_refunds_in_the_same_second_are_both_recorded(): void
    {
        $id = $this->stay();
        $this->travelTo(now()->startOfSecond());
        $t0 = now()->getTimestamp();

        $this->deliver($this->event('evt_same_1', 3000, [['id' => 're_same_1', 'object' => 'refund', 'amount' => 3000, 'created' => $t0]]))->assertOk();
        $this->deliver($this->event('evt_same_2', 8000, [
            ['id' => 're_same_2', 'object' => 'refund', 'amount' => 5000, 'created' => $t0 + 1],
            ['id' => 're_same_1', 'object' => 'refund', 'amount' => 3000, 'created' => $t0],
        ]))->assertOk();

        $this->assertEquals(80.0, (float) $this->row($id)->refunded_amount);
        $this->assertSame(2, $this->refundAudits());
        $this->assertSame(2, RefundAttempt::query()->where('mirror_id', $id)->count(), 'each recording has its own attempt row');
    }

    public function test_a_redelivery_or_an_older_event_records_nothing(): void
    {
        $id = $this->stay();
        $this->smoobu->shouldNotReceive('cancelReservation');
        $t0 = now()->getTimestamp();
        $first = $this->event('evt_old_1', 3000, [['id' => 're_old_1', 'object' => 'refund', 'amount' => 3000, 'created' => $t0]]);
        $second = $this->event('evt_old_2', 8000, [
            ['id' => 're_old_2', 'object' => 'refund', 'amount' => 5000, 'created' => $t0 + 5],
            ['id' => 're_old_1', 'object' => 'refund', 'amount' => 3000, 'created' => $t0],
        ]);

        $this->deliver($second)->assertOk();
        // The same refunds delivered again under a new event id (the same id is the dedup table's own, pinned in
        // StripeWebhookEventDedupTest), and the older event arriving late.
        $this->deliver(['id' => 'evt_old_2b'] + $second)->assertOk();
        $this->deliver($first)->assertOk();

        $row = $this->row($id);
        $this->assertEquals(80.0, (float) $row->refunded_amount, 'never more, never backwards');
        $this->assertSame('re_old_2', $row->last_refund_id);
        $this->assertSame(1, $this->refundAudits());
        Mail::assertQueued(BookingRefundMail::class, 1);
    }

    /** The row is read again once the lock is held: a refund recorded meanwhile is counted, never overwritten. */
    public function test_an_admin_refund_counts_a_refund_recorded_while_it_waited(): void
    {
        $id = $this->stay();
        $stale = BookingMirror::withoutGlobalScopes()->find($id);
        DB::table('booking_mirror')->where('id', $id)->update(['payment_status' => 'partially_refunded', 'refunded_amount' => 50, 'last_refund_id' => 're_dash_x']);
        $this->stripe->shouldReceive('refund')->once()->andReturn(Refund::constructFrom(['id' => 're_admin_2', 'object' => 'refund', 'amount' => 5000, 'currency' => 'eur']));

        app(BookingRefundService::class)->applyRefund($stale, 50.0, 'requested_by_customer');

        $this->assertEquals(100.0, (float) $this->row($id)->refunded_amount, '50 recorded before plus the 50 just refunded');
        $this->assertSame('partially_refunded', $this->row($id)->payment_status);
    }

    /**
     * A refund whose answer came too late for us (the short timeout under the lock) but which Stripe made: its webhook
     * records it, and the staff member's retry gets the same refund back from Stripe (the idempotency key) — recorded
     * once, never twice.
     */
    public function test_a_retry_answered_with_a_refund_already_recorded_records_nothing_more(): void
    {
        $id = $this->stay();
        $this->deliver($this->event('evt_late_1', 5000, [['id' => 're_late_1', 'object' => 'refund', 'amount' => 5000, 'created' => time()]]))->assertOk();
        $this->assertEquals(50.0, (float) $this->row($id)->refunded_amount);
        $this->stripe->shouldReceive('refund')->once()->andReturn(Refund::constructFrom(['id' => 're_late_1', 'object' => 'refund', 'amount' => 5000, 'currency' => 'eur']));

        $outcome = app(BookingRefundService::class)->applyRefund(BookingMirror::withoutGlobalScopes()->find($id), 50.0, 'requested_by_customer');

        $this->assertSame('re_late_1', $outcome['refund_id']);
        $this->assertFalse($outcome['is_full']);
        $this->assertTrue($outcome['no_new_refund'], 'staff are told no new refund was made');
        $this->assertEquals(50.0, (float) $this->row($id)->refunded_amount, 'the same refund is not recorded twice');
        $this->assertSame(1, $this->refundAudits());
    }

    /** A refund as Stripe answers a request it replays (`Idempotent-Replayed: true`): one it made for an earlier request with the same key. */
    private function replayed(string $id, int $amountMinor): Refund
    {
        $refund = Refund::constructFrom(['id' => $id, 'object' => 'refund', 'amount' => $amountMinor, 'currency' => 'eur']);
        $refund->setLastResponse(new \Stripe\ApiResponse('{}', 200, new \Stripe\Util\CaseInsensitiveArray(['Idempotent-Replayed' => 'true']), []));

        return $refund;
    }

    /** What Stripe holds as refunded on the payment's charge, read under the lock. */
    private function chargeRefunded(int $refundedMinor, string $pi = 'pi_refund_1'): void
    {
        $this->stripe->shouldReceive('retrievePaymentIntent')->with($pi, ['latest_charge'])->andReturn(\Stripe\PaymentIntent::constructFrom([
            'id' => $pi, 'object' => 'payment_intent', 'status' => 'succeeded',
            'latest_charge' => ['id' => 'ch_' . $pi, 'object' => 'charge', 'amount' => 20000, 'amount_refunded' => $refundedMinor, 'currency' => 'eur'],
        ]));
    }

    /**
     * Review of release 6: the refund's webhook came without the `refunds` list (API versions since 2022-11-15), so it
     * recorded the money but not the refund's id; the staff member's retry gets the same refund back, marked replayed.
     * Stripe's own refunded total says it is recorded already: nothing more is.
     */
    public function test_a_retry_after_an_event_without_the_refunds_list_records_nothing_more(): void
    {
        $id = $this->stay();
        $event = $this->event('evt_no_list', 5000, []);
        unset($event['data']['object']['refunds']);
        $this->deliver($event)->assertOk();
        $this->assertEquals(50.0, (float) $this->row($id)->refunded_amount);
        $this->stripe->shouldReceive('refund')->once()->andReturn($this->replayed('re_late_1', 5000));
        $this->chargeRefunded(5000);

        $outcome = app(BookingRefundService::class)->applyRefund(BookingMirror::withoutGlobalScopes()->find($id), 50.0, 'requested_by_customer');

        $this->assertTrue($outcome['no_new_refund']);
        $this->assertFalse($outcome['recorded_later']);
        $this->assertEquals(50.0, (float) $this->row($id)->refunded_amount, 'recorded once, for the 50 actually refunded');
        $this->assertSame('partially_refunded', $this->row($id)->payment_status);
        $this->assertSame(1, $this->refundAudits());
        Mail::assertQueued(\App\Mail\BookingRefundMail::class, 1);
    }

    /** A replayed refund nothing here has recorded yet (its webhook has not come): recorded now, once — the webhook then finds nothing new. */
    public function test_a_replayed_refund_not_recorded_yet_is_recorded_once(): void
    {
        $id = $this->stay();
        $this->stripe->shouldReceive('refund')->once()->andReturn($this->replayed('re_late_2', 5000));
        $this->chargeRefunded(5000);

        $outcome = app(BookingRefundService::class)->applyRefund(BookingMirror::withoutGlobalScopes()->find($id), 50.0, 'requested_by_customer');
        $this->deliver($this->event('evt_late_2', 5000, [['id' => 're_late_2', 'object' => 'refund', 'amount' => 5000, 'created' => time()]]))->assertOk();

        $this->assertArrayNotHasKey('no_new_refund', $outcome);
        $this->assertEquals(50.0, (float) $this->row($id)->refunded_amount);
        $this->assertSame('re_late_2', $this->row($id)->last_refund_id);
        $this->assertSame(1, $this->refundAudits());
    }

    /** A replayed refund whose charge cannot be read: nothing is recorded now, and staff are told it shows once Stripe confirms it. */
    public function test_a_replayed_refund_whose_charge_cannot_be_read_records_nothing_and_says_so(): void
    {
        $id = $this->stay();
        $this->stripe->shouldReceive('refund')->once()->andReturn($this->replayed('re_late_3', 5000));
        $this->stripe->shouldReceive('retrievePaymentIntent')->andThrow(new \Stripe\Exception\ApiConnectionException('Request timed out'));

        $outcome = app(BookingRefundService::class)->applyRefund(BookingMirror::withoutGlobalScopes()->find($id), 50.0, 'requested_by_customer');

        $this->assertTrue($outcome['no_new_refund']);
        $this->assertTrue($outcome['recorded_later']);
        $this->assertNull($this->row($id)->refunded_amount);
        $this->assertSame(0, $this->refundAudits());
    }

    /** Stripe does not answer in time: whether it refunded is unknown — nothing is recorded, and staff are told to retry only the same amount. */
    public function test_a_refund_stripe_does_not_answer_in_time_is_reported_as_unknown(): void
    {
        $id = $this->stay();
        $this->stripe->shouldReceive('refund')->once()->andThrow(new \Stripe\Exception\ApiConnectionException('Request timed out after 15 seconds'));

        try {
            app(BookingRefundService::class)->applyRefund(BookingMirror::withoutGlobalScopes()->find($id), 50.0, 'requested_by_customer');
            $this->fail('a refund Stripe did not answer must not read as made or as failed');
        } catch (\App\Services\Booking\RefundOutcomeUnknown $e) {
            $this->assertStringContainsString('use exactly the same amount', $e->getMessage());
        }

        $this->assertNull($this->row($id)->refunded_amount);
        $this->assertStringContainsString('timed out', (string) DB::table('refund_attempts')->where('mirror_id', $id)->value('error'));
    }

    /** Item 6 pin: a zero-decimal currency's refund event is recorded in yen, not hundredths of a yen. */
    public function test_a_yen_refund_event_is_recorded_in_yen(): void
    {
        $id = $this->stay(12000.0, 'pi_yen_1');
        $this->smoobu->shouldReceive('cancelReservation')->once()->andReturn([]);

        $this->deliver($this->event('evt_yen_1', 12000, [['id' => 're_yen_1', 'object' => 'refund', 'amount' => 12000, 'created' => time()]], 'pi_yen_1', 12000, 'jpy'))->assertOk();

        $this->assertSame('refunded', $this->row($id)->payment_status);
        $this->assertEquals(12000.0, (float) $this->row($id)->refunded_amount);
    }

    /** The refund lock is in the store every container sees (SharedCache): one held there makes an admin refund wait, then refuse. */
    public function test_an_admin_refund_waits_for_the_payments_lock_in_the_shared_store(): void
    {
        $id = $this->stay();
        $lock = \App\Support\SharedCache::store()->lock("refund:{$id}", 30);
        $this->assertTrue($lock->get());
        $this->stripe->shouldNotReceive('refund');

        try {
            app(BookingRefundService::class)->applyRefund(BookingMirror::withoutGlobalScopes()->find($id));
            $this->fail('a refund must not run while another holds the lock');
        } catch (\RuntimeException $e) {
            $this->assertStringContainsString('Another refund is currently being processed', $e->getMessage());
        } finally {
            $lock->release();
        }
        $this->assertSame('paid', $this->row($id)->payment_status);
    }
}
