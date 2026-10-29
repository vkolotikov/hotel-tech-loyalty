<?php

namespace Tests\Feature\Stripe;

use App\Models\LoyaltyMember;
use App\Models\Organization;
use App\Models\PointsTransaction;
use App\Services\LoyaltyService;
use App\Services\SmoobuClient;
use App\Services\StripeService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use Mockery;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\Concerns\SetsUpServiceBookingSchema;
use Tests\TestCase;

/**
 * Release 6, item 1: a dispute the venue lost (`charge.dispute.closed`, status
 * `lost`) is recorded. Before, the webhook called applyRefund(), which refuses
 * a `disputed` row — every room stayed `disputed` and nothing was recorded.
 * Now the money is recorded as gone back on every room of the payment (the lead
 * and the rooms that follow it), each its own share, `refunded` (or
 * `partially_refunded` for a dispute of part of it), and the points of every
 * room refunded in full are reversed as a refund reverses them. The booking
 * itself is left as staff left it: no PMS cancellation, no booking_state
 * change, no refund mail. The same for a service booking's payment, whose
 * dispute now reaches its organisation. What a dispute took is kept apart
 * (`dispute_lost_amount`): Stripe's refunded total leaves it out, so a refund
 * reported after it is recorded in full. All rooms are recorded in one
 * transaction: a failure keeps nothing and Stripe delivers the event again.
 *
 * Rows are written as production's schema takes them (the test runs on
 * PostgreSQL too). Stripe, Smoobu and the points ledger are mocks.
 */
class LostDisputeTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema, SetsUpServiceBookingSchema;
    use \Tests\Concerns\MocksCurrentStripeRefunds;

    private Organization $org;
    private int $memberId;
    private $loyalty;
    private $smoobu;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpBookingRefundSchema();
        $this->setUpLoyaltySchema();
        $this->setUpServiceBookingSchema();
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
        // What a lost dispute took, kept apart from refunds (migration 2026_10_23_160000).
        foreach (['booking_mirror', 'service_bookings'] as $table) {
            if (!Schema::hasColumn($table, 'dispute_lost_amount')) {
                Schema::table($table, fn ($t) => $t->decimal('dispute_lost_amount', 10, 2)->nullable());
            }
        }
        Mail::fake();
        $this->org = Organization::create(['name' => 'Seaside Hotel', 'slug' => 'seaside-' . uniqid()]);
        app()->instance('current_organization_id', $this->org->id);
        $this->memberId = $this->member();

        $stripe = Mockery::mock(StripeService::class);
        $this->mockCurrentRefunds($stripe);
        $stripe->shouldReceive('isEnabled')->andReturn(true);
        $stripe->shouldReceive('constructWebhookEvent')->andReturnUsing(fn (string $payload) => \Stripe\Event::constructFrom(json_decode($payload, true)));
        $stripe->shouldNotReceive('refund');
        $this->app->instance(StripeService::class, $stripe);
        $this->smoobu = Mockery::mock(SmoobuClient::class);
        $this->smoobu->shouldNotReceive('cancelReservation');
        $this->app->instance(SmoobuClient::class, $this->smoobu);
        $this->loyalty = Mockery::mock(LoyaltyService::class);
        $this->app->instance(LoyaltyService::class, $this->loyalty);
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        Mockery::close();
        parent::tearDown();
    }

    /** A member production's schema accepts (tier, user, the NOT NULL tokens). */
    private function member(): int
    {
        $tier = \App\Models\LoyaltyTier::create(['organization_id' => $this->org->id, 'name' => 'Gold', 'min_points' => 0, 'earn_rate' => 1, 'is_active' => true]);
        $user = \App\Models\User::create(['name' => 'Ada', 'email' => 'ada_' . uniqid('', true) . '@example.test', 'password' => bcrypt('secret-pass-1'), 'user_type' => 'member', 'organization_id' => $this->org->id]);

        return (int) LoyaltyMember::create(['organization_id' => $this->org->id, 'user_id' => $user->id, 'tier_id' => $tier->id, 'member_number' => 'HL-' . $user->id, 'current_points' => 0, 'lifetime_points' => 0]
            + (Schema::hasColumn('loyalty_members', 'qr_code_token') ? ['qr_code_token' => bin2hex(random_bytes(16))] : [])
            + (Schema::hasColumn('loyalty_members', 'referral_code') ? ['referral_code' => strtoupper(bin2hex(random_bytes(4)))] : []))->id;
    }

    /** The points a booking earned (one earn transaction). */
    private function earned(string $type, int $referenceId, int $points): int
    {
        $row = ['organization_id' => $this->org->id, 'member_id' => $this->memberId, 'type' => 'earn', 'points' => $points, 'balance_after' => $points,
            'description' => 'Earned', 'reference_type' => $type, 'reference_id' => $referenceId, 'is_reversed' => false, 'created_at' => now(), 'updated_at' => now()];

        return DB::table('points_transactions')->insertGetId(array_filter($row, fn ($k) => Schema::hasColumn('points_transactions', $k), ARRAY_FILTER_USE_KEY));
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

    /** @return array{0: int, 1: int} 101 Sea view (the lead, 200.00, carries the payment) and 102 Garden (160.00) */
    private function group(): array
    {
        $g = 'grp-' . uniqid();

        return [
            $this->room(['booking_group_id' => $g, 'apartment_id' => 101, 'apartment_name' => 'Sea view', 'booking_reference' => 'BK-101', 'price_total' => 200, 'price_paid' => 200, 'stripe_payment_intent_id' => 'pi_dispute_1']),
            $this->room(['booking_group_id' => $g, 'apartment_id' => 102, 'apartment_name' => 'Garden', 'booking_reference' => 'BK-102', 'price_total' => 160, 'price_paid' => 160]),
        ];
    }

    private function row(int $id): object
    {
        return DB::table('booking_mirror')->where('id', $id)->first();
    }

    private function deliver(string $type, array $dispute): void
    {
        $this->postJson('/api/v1/booking/webhooks/stripe', [
            'id' => 'evt_' . uniqid(), 'object' => 'event', 'type' => $type, 'data' => ['object' => $dispute],
        ], ['Stripe-Signature' => 't=1,v1=test'])->assertOk();
    }

    /** A Dispute as Stripe sends it: no metadata of its own, the payment's id, the disputed amount. */
    private function dispute(string $pi, int $amount, string $status, string $currency = 'eur', string $id = 'dp_1'): array
    {
        return ['id' => $id, 'object' => 'dispute', 'payment_intent' => $pi, 'amount' => $amount, 'currency' => $currency, 'reason' => 'fraudulent', 'status' => $status];
    }

    public function test_a_lost_dispute_records_the_money_on_every_room_reverses_the_points_and_leaves_the_booking(): void
    {
        [$lead, $other] = $this->group();
        $leadTx = $this->earned('booking_mirror', $lead, 200);
        $otherTx = $this->earned('booking_mirror', $other, 160);
        $reversed = [];
        $this->loyalty->shouldReceive('reverseTransaction')->twice()->andReturnUsing(function (PointsTransaction $tx) use (&$reversed) {
            $reversed[] = (int) $tx->id;
            // Model the real ledger's durable marker so the recovery hook sees the settled reversal.
            $tx->update(['is_reversed' => true]);
            return $tx;
        });

        $this->deliver('charge.dispute.created', $this->dispute('pi_dispute_1', 36000, 'needs_response'));
        $this->assertSame(['disputed', 'disputed'], [$this->row($lead)->payment_status, $this->row($other)->payment_status]);

        $this->deliver('charge.dispute.closed', $this->dispute('pi_dispute_1', 36000, 'lost'));

        foreach ([[$lead, 200.0], [$other, 160.0]] as [$id, $share]) {
            $row = $this->row($id);
            $this->assertSame('refunded', $row->payment_status, 'the money is recorded as gone back');
            $this->assertEquals($share, (float) $row->refunded_amount, 'each room its own share');
            $this->assertSame('dispute_dp_1', $row->last_refund_id);
            $this->assertNotNull($row->refunded_at);
            $this->assertSame('confirmed', $row->booking_state, 'the booking is left as it is: staff decide');
            $this->assertSame('confirmed', $row->internal_status);
        }
        $this->assertEqualsCanonicalizing([$leadTx, $otherTx], $reversed, "every room's points are reversed");
        $this->assertSame(2, PointsTransaction::whereIn('id', [$leadTx, $otherTx])->where('is_reversed', true)->count());
        $audits = DB::table('audit_logs')->where('action', 'booking_dispute_lost')->orderBy('subject_id')->get();
        $this->assertSame([$lead, $other], $audits->pluck('subject_id')->map(fn ($v) => (int) $v)->all());
        $this->assertSame('dp_1', json_decode($audits[0]->new_values, true)['dispute_id']);
        $this->assertSame('fraudulent', json_decode($audits[0]->new_values, true)['dispute_reason']);
        Mail::assertNothingQueued();

        // Delivered again (a new event id): nothing changes, nothing is reversed twice.
        $this->deliver('charge.dispute.closed', $this->dispute('pi_dispute_1', 36000, 'lost'));
        $this->assertSame(2, DB::table('audit_logs')->where('action', 'booking_dispute_lost')->count());
    }

    public function test_a_dispute_lost_for_part_of_one_rooms_payment_records_that_part(): void
    {
        $id = $this->room(['apartment_id' => 101, 'apartment_name' => 'Sea view', 'price_total' => 200, 'price_paid' => 200, 'stripe_payment_intent_id' => 'pi_dispute_part', 'payment_status' => 'disputed']);
        $this->earned('booking_mirror', $id, 200);
        $this->loyalty->shouldNotReceive('reverseTransaction');

        $this->deliver('charge.dispute.closed', $this->dispute('pi_dispute_part', 5000, 'lost', 'eur', 'dp_part'));

        $row = $this->row($id);
        $this->assertSame('partially_refunded', $row->payment_status);
        $this->assertEquals(50.0, (float) $row->refunded_amount);
        $this->assertSame('dispute_dp_part', $row->last_refund_id);
        $this->assertSame('confirmed', $row->booking_state);
    }

    /** Item 6 pin: a yen dispute's amount is yen, not hundredths of a yen. */
    public function test_a_lost_yen_dispute_records_yen(): void
    {
        $id = $this->room(['apartment_id' => 101, 'apartment_name' => 'Sea view', 'price_total' => 12000, 'price_paid' => 12000, 'stripe_payment_intent_id' => 'pi_dispute_yen', 'payment_status' => 'disputed']);
        $this->loyalty->shouldNotReceive('reverseTransaction');

        $this->deliver('charge.dispute.closed', $this->dispute('pi_dispute_yen', 12000, 'lost', 'jpy', 'dp_yen'));

        $this->assertSame('refunded', $this->row($id)->payment_status);
        $this->assertEquals(12000.0, (float) $this->row($id)->refunded_amount);
    }

    public function test_a_won_dispute_records_no_money(): void
    {
        [$lead, $other] = $this->group();
        $this->loyalty->shouldNotReceive('reverseTransaction');
        $this->deliver('charge.dispute.created', $this->dispute('pi_dispute_1', 36000, 'needs_response'));

        $this->deliver('charge.dispute.closed', $this->dispute('pi_dispute_1', 36000, 'won'));

        $this->assertSame(['paid', 'paid'], [$this->row($lead)->payment_status, $this->row($other)->payment_status]);
        $this->assertNull($this->row($lead)->refunded_amount);
        $this->assertSame(0, DB::table('audit_logs')->where('action', 'booking_dispute_lost')->count());
    }

    private function serviceBooking(array $own = []): int
    {
        return DB::table('service_bookings')->insertGetId(array_merge([
            'organization_id' => $this->org->id, 'booking_reference' => 'SVC-' . strtoupper(substr(uniqid(), -8)), 'service_id' => 1,
            'customer_name' => 'Ada', 'customer_email' => 'ada@example.test', 'start_at' => now()->addDay(), 'end_at' => now()->addDay()->addHour(), 'duration_minutes' => 60,
            'total_amount' => 54, 'currency' => 'EUR', 'status' => 'confirmed', 'payment_status' => 'paid', 'stripe_payment_intent_id' => 'pi_svc_dispute',
            'created_at' => now(), 'updated_at' => now(),
        ], $own));
    }

    public function test_a_lost_dispute_on_a_service_booking_is_recorded_on_it(): void
    {
        $id = $this->serviceBooking();
        $tx = $this->earned('service_booking', $id, 54);
        $this->loyalty->shouldReceive('reverseTransaction')->once()->with(Mockery::on(fn ($t) => (int) $t->id === $tx), Mockery::any(), Mockery::any())
            ->andReturnUsing(function (PointsTransaction $line) { $line->update(['is_reversed' => true]); return $line; });

        // The dispute carries no metadata: its organisation is found through the booking that carries the payment.
        $this->deliver('charge.dispute.created', $this->dispute('pi_svc_dispute', 5400, 'needs_response', 'eur', 'dp_svc'));
        $this->assertSame(0, DB::table('audit_logs')->where('action', 'stripe.webhook.cross_tenant_attempt')->count());
        $this->deliver('charge.dispute.closed', $this->dispute('pi_svc_dispute', 5400, 'lost', 'eur', 'dp_svc'));

        $row = DB::table('service_bookings')->where('id', $id)->first();
        $this->assertSame('refunded', $row->payment_status);
        $this->assertEquals(54.0, (float) $row->refunded_amount);
        $this->assertSame('dispute_dp_svc', $row->last_refund_id);
        $this->assertSame('confirmed', $row->status, 'the booking is left as it is');
        $this->assertSame(1, DB::table('audit_logs')->where('action', 'service_booking.dispute_lost')->where('subject_id', $id)->count());
        $this->assertTrue(PointsTransaction::findOrFail($tx)->is_reversed);

        // Delivered again: once.
        $this->deliver('charge.dispute.closed', $this->dispute('pi_svc_dispute', 5400, 'lost', 'eur', 'dp_svc'));
        $this->assertSame(1, DB::table('audit_logs')->where('action', 'service_booking.dispute_lost')->count());
    }

    public function test_a_service_bookings_dispute_lost_for_part_of_it_keeps_its_points(): void
    {
        $id = $this->serviceBooking(['stripe_payment_intent_id' => 'pi_svc_part']);
        $this->earned('service_booking', $id, 54);
        $this->loyalty->shouldNotReceive('reverseTransaction');

        $this->deliver('charge.dispute.closed', $this->dispute('pi_svc_part', 2000, 'lost', 'eur', 'dp_svc_part'));

        $row = DB::table('service_bookings')->where('id', $id)->first();
        $this->assertSame('partially_refunded', $row->payment_status);
        $this->assertEquals(20.0, (float) $row->refunded_amount);
    }

    /** A `charge.refunded` event as Stripe sends it: the charge's cumulative `amount_refunded`, which counts refunds only. */
    private function refunded(string $pi, int $amountMinor, int $refundedMinor, string $refundId): void
    {
        $this->providerRefunds($pi, [['id' => $refundId, 'amount' => $refundedMinor]]);
        $this->postJson('/api/v1/booking/webhooks/stripe', [
            'id' => 'evt_' . uniqid(), 'object' => 'event', 'type' => 'charge.refunded', 'data' => ['object' => [
                'id' => 'ch_' . $pi, 'object' => 'charge', 'payment_intent' => $pi, 'amount' => $amountMinor, 'amount_captured' => $amountMinor,
                'amount_refunded' => $refundedMinor, 'currency' => 'eur', 'refunded' => $refundedMinor >= $amountMinor,
                'metadata' => ['org_id' => (string) $this->org->id],
                'refunds' => ['object' => 'list', 'data' => [['id' => $refundId, 'object' => 'refund', 'amount' => $refundedMinor, 'created' => time()]]],
            ]],
        ], ['Stripe-Signature' => 't=1,v1=test'])->assertOk();
    }

    /** Review of release 6: a dispute lost for 80 of 200, then the other 120 refunded — Stripe reports 120 refunded, not 200. */
    public function test_a_refund_after_a_lost_dispute_is_compared_with_refunds_only(): void
    {
        $id = $this->room(['reservation_id' => 'LOCAL-' . uniqid(), 'apartment_id' => 101, 'apartment_name' => 'Sea view', 'price_total' => 200, 'price_paid' => 200, 'stripe_payment_intent_id' => 'pi_dispute_then_refund', 'payment_status' => 'disputed']);
        $this->loyalty->shouldNotReceive('reverseTransaction');

        $this->deliver('charge.dispute.closed', $this->dispute('pi_dispute_then_refund', 8000, 'lost', 'eur', 'dp_80'));
        $this->assertEquals(80.0, (float) $this->row($id)->refunded_amount);
        $this->assertEquals(80.0, (float) $this->row($id)->dispute_lost_amount);

        $this->refunded('pi_dispute_then_refund', 20000, 12000, 're_rest');

        $row = $this->row($id);
        $this->assertSame('refunded', $row->payment_status, 'everything is gone back: 80 lost, 120 refunded');
        $this->assertEquals(200.0, (float) $row->refunded_amount);
        $this->assertEquals(80.0, (float) $row->dispute_lost_amount);
    }

    /** A refund made before the dispute whose event arrives after the dispute is recorded. */
    public function test_a_refund_reported_after_a_lost_dispute_is_recorded(): void
    {
        $id = $this->room(['reservation_id' => 'LOCAL-' . uniqid(), 'apartment_id' => 101, 'apartment_name' => 'Sea view', 'price_total' => 200, 'price_paid' => 200, 'stripe_payment_intent_id' => 'pi_refund_late', 'payment_status' => 'disputed']);
        $this->loyalty->shouldNotReceive('reverseTransaction');

        $this->deliver('charge.dispute.closed', $this->dispute('pi_refund_late', 15000, 'lost', 'eur', 'dp_150'));
        $this->refunded('pi_refund_late', 20000, 5000, 're_early');

        $this->assertSame('refunded', $this->row($id)->payment_status);
        $this->assertEquals(200.0, (float) $this->row($id)->refunded_amount);
    }

    public function test_a_service_booking_refund_after_a_lost_dispute_keeps_what_the_dispute_took(): void
    {
        $id = $this->serviceBooking(['stripe_payment_intent_id' => 'pi_svc_both']);
        $this->loyalty->shouldNotReceive('reverseTransaction');

        $this->deliver('charge.dispute.closed', $this->dispute('pi_svc_both', 2000, 'lost', 'eur', 'dp_svc_20'));
        $this->refunded('pi_svc_both', 5400, 3400, 're_svc_rest');

        $row = DB::table('service_bookings')->where('id', $id)->first();
        $this->assertSame('refunded', $row->payment_status);
        $this->assertEquals(54.0, (float) $row->refunded_amount, '20 lost and 34 refunded');
        $this->assertEquals(20.0, (float) $row->dispute_lost_amount);

        // The same refund event again: nothing moves.
        $this->refunded('pi_svc_both', 5400, 3400, 're_svc_rest');
        $this->assertEquals(54.0, (float) DB::table('service_bookings')->where('id', $id)->value('refunded_amount'));
    }

    public function test_a_lost_dispute_that_fails_part_way_keeps_nothing_and_stripe_delivers_it_again(): void
    {
        [$lead, $other] = $this->group();
        $this->loyalty->shouldNotReceive('reverseTransaction');
        $this->deliver('charge.dispute.created', $this->dispute('pi_dispute_1', 36000, 'needs_response'));
        $fail = true;
        \App\Models\BookingMirror::updating(function ($m) use (&$fail, $other) {
            if ($fail && (int) $m->id === $other) {
                throw new \RuntimeException('the room could not be written');
            }
        });
        $event = ['id' => 'evt_lost_once', 'object' => 'event', 'type' => 'charge.dispute.closed', 'data' => ['object' => $this->dispute('pi_dispute_1', 36000, 'lost')]];

        $this->postJson('/api/v1/booking/webhooks/stripe', $event, ['Stripe-Signature' => 't=1,v1=test'])->assertStatus(500);

        $this->assertSame(['disputed', 'disputed'], [$this->row($lead)->payment_status, $this->row($other)->payment_status], 'nothing of it was kept');
        $this->assertNull($this->row($lead)->last_refund_id);
        $this->assertSame(0, DB::table('stripe_webhook_events')->where('event_id', 'evt_lost_once')->count(), 'Stripe delivers it again');

        $fail = false;
        $this->postJson('/api/v1/booking/webhooks/stripe', $event, ['Stripe-Signature' => 't=1,v1=test'])->assertOk();

        $this->assertSame(['refunded', 'refunded'], [$this->row($lead)->payment_status, $this->row($other)->payment_status]);
        $this->assertSame(2, DB::table('audit_logs')->where('action', 'booking_dispute_lost')->count());
    }
}
