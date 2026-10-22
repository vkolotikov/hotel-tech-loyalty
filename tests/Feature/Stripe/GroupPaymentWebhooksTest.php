<?php

namespace Tests\Feature\Stripe;

use App\Http\Controllers\Api\V1\BookingPublicController;
use App\Mail\BookingRefundMail;
use App\Models\BookingMirror;
use App\Models\Organization;
use App\Models\RefundAttempt;
use App\Services\SmoobuClient;
use App\Services\StripeService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use Mockery;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Release 5, part C: one PaymentIntent, several rooms — the lead room carries
 * the intent, the other rooms of its group carry none (production's
 * `booking_mirror_org_pi_unique`, which the test schema has) and follow it.
 * Every Stripe webhook that finds a stay by its intent finds the lead, and
 * must bring the rooms that follow it along: paid, cancelled, refunded (in
 * full or in part, each room its own share) and disputed land on every room
 * of the payment. Stripe and Smoobu are mocks; nothing leaves the process.
 *
 * The group: 101 "Sea view" (the lead, 200.00) and 102 "Garden" (160.00),
 * one payment of 360.00.
 */
class GroupPaymentWebhooksTest extends TestCase
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
        Mail::fake();
        $this->org = Organization::create(['name' => 'Seaside Hotel', 'slug' => 'seaside-' . uniqid()]);

        $this->stripe = Mockery::mock(StripeService::class);
        $this->stripe->shouldReceive('isEnabled')->andReturn(true);
        $this->stripe->shouldReceive('constructWebhookEvent')->andReturnUsing(fn (string $payload) => \Stripe\Event::constructFrom(json_decode($payload, true)));
        $this->stripe->shouldNotReceive('refund');
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

    /** @return array{0: int, 1: int} the lead's id and the other room's */
    private function group(string $status = 'authorized', ?int $orgId = null, string $pi = 'pi_group_1'): array
    {
        $orgId ??= $this->org->id;
        $groupId = 'grp-' . uniqid();
        $row = fn (array $own) => DB::table('booking_mirror')->insertGetId(array_merge([
            'organization_id' => $orgId, 'booking_group_id' => $groupId, 'booking_state' => 'confirmed', 'internal_status' => 'confirmed',
            'channel_name' => 'Website', 'guest_name' => 'Ada Lovelace', 'guest_email' => 'ada@example.test',
            'arrival_date' => now()->addDays(10)->toDateString(), 'departure_date' => now()->addDays(12)->toDateString(),
            'payment_status' => $status, 'payment_method' => 'stripe', 'created_at' => now(), 'updated_at' => now(),
        ], $own));

        return [
            $row(['reservation_id' => 'R-101-' . uniqid(), 'booking_reference' => 'BK-101', 'apartment_id' => 101, 'apartment_name' => 'Sea view', 'price_total' => 200, 'stripe_payment_intent_id' => $pi]),
            $row(['reservation_id' => 'R-102-' . uniqid(), 'booking_reference' => 'BK-102', 'apartment_id' => 102, 'apartment_name' => 'Garden', 'price_total' => 160, 'stripe_payment_intent_id' => null]),
        ];
    }

    private function row(int $id): object
    {
        return DB::table('booking_mirror')->where('id', $id)->first();
    }

    private function deliver(string $type, array $object): void
    {
        $this->postJson('/api/v1/booking/webhooks/stripe', [
            'id' => 'evt_' . uniqid(), 'object' => 'event', 'type' => $type, 'data' => ['object' => $object],
        ], ['Stripe-Signature' => 't=1,v1=test'])->assertOk();
    }

    private function intent(string $pi = 'pi_group_1', int $amount = 36000): array
    {
        return ['id' => $pi, 'object' => 'payment_intent', 'amount' => $amount, 'currency' => 'eur', 'status' => 'succeeded', 'metadata' => ['org_id' => (string) $this->org->id]];
    }

    private function charge(int $refunded, array $refunds, string $pi = 'pi_group_1'): array
    {
        return [
            'id' => 'ch_group_1', 'object' => 'charge', 'payment_intent' => $pi, 'amount' => 36000, 'amount_captured' => 36000,
            'amount_refunded' => $refunded, 'currency' => 'eur', 'refunded' => $refunded >= 36000,
            'metadata' => ['org_id' => (string) $this->org->id],
            'refunds' => ['object' => 'list', 'data' => $refunds],
        ];
    }

    public function test_payment_intent_succeeded_pays_every_room_each_its_own_total(): void
    {
        [$lead, $other] = $this->group();

        $this->deliver('payment_intent.succeeded', $this->intent());

        $this->assertSame('paid', $this->row($lead)->payment_status);
        $this->assertSame('paid', $this->row($other)->payment_status, 'the room that follows the lead is paid with it');
        $this->assertEquals(200.0, (float) $this->row($lead)->price_paid, "the lead records its own share, not the whole payment's");
        $this->assertEquals(160.0, (float) $this->row($other)->price_paid);
    }

    public function test_payment_intent_succeeded_leaves_a_room_already_past_capture_alone(): void
    {
        [$lead, $other] = $this->group();
        DB::table('booking_mirror')->where('id', $other)->update(['payment_status' => 'refunded']);

        $this->deliver('payment_intent.succeeded', $this->intent());

        $this->assertSame('paid', $this->row($lead)->payment_status);
        $this->assertSame('refunded', $this->row($other)->payment_status);
    }

    public function test_payment_intent_canceled_cancels_every_room_with_an_audit_row_each(): void
    {
        [$lead, $other] = $this->group();

        $this->deliver('payment_intent.canceled', ['status' => 'canceled', 'cancellation_reason' => 'automatic'] + $this->intent());

        $this->assertSame('cancelled', $this->row($lead)->payment_status);
        $this->assertSame('cancelled', $this->row($other)->payment_status);
        $audits = DB::table('audit_logs')->where('action', 'booking.payment.canceled')->orderBy('subject_id')->get();
        $this->assertSame([$lead, $other], $audits->pluck('subject_id')->map(fn ($id) => (int) $id)->all());
        $this->assertSame('authorized', json_decode($audits[1]->new_values, true)['prior_status']);
    }

    public function test_a_refund_made_at_stripe_in_full_reaches_every_room_once(): void
    {
        [$lead, $other] = $this->group('paid');
        $this->smoobu->shouldReceive('cancelReservation')->twice()->andReturn([]);

        $this->deliver('charge.refunded', $this->charge(36000, [['id' => 're_full_1', 'object' => 'refund', 'amount' => 36000, 'reason' => 'requested_by_customer']]));

        foreach ([[$lead, 200.0], [$other, 160.0]] as [$id, $share]) {
            $row = $this->row($id);
            $this->assertSame('refunded', $row->payment_status);
            $this->assertEquals($share, (float) $row->refunded_amount, 'each room records its own share');
            $this->assertSame('re_full_1', $row->last_refund_id);
            $this->assertSame('cancelled', $row->booking_state, 'each room is cancelled at the PMS');
        }
        Mail::assertQueued(BookingRefundMail::class, 1);
        Mail::assertQueued(BookingRefundMail::class, fn (BookingRefundMail $m) => $m->unitName === 'Sea view + Garden' && $m->bookingReference === 'BK-101, BK-102' && $m->refundAmount === 360.0 && $m->isFull);

        // The same refund delivered again (a new event id) changes nothing.
        $this->deliver('charge.refunded', $this->charge(36000, [['id' => 're_full_1', 'object' => 'refund', 'amount' => 36000]]));
        Mail::assertQueued(BookingRefundMail::class, 1);
    }

    /** Release 4's known limit, settled: a partial refund of the one payment is partial on every room — never "full" because it covers the lead's own share. */
    public function test_a_partial_refund_at_stripe_is_partial_on_every_room_each_its_share(): void
    {
        [$lead, $other] = $this->group('paid');
        $this->smoobu->shouldNotReceive('cancelReservation');

        $this->deliver('charge.refunded', $this->charge(22500, [['id' => 're_part_1', 'object' => 'refund', 'amount' => 22500]]));

        $this->assertSame('partially_refunded', $this->row($lead)->payment_status, '225 of 360 is more than the lead room costs, and still not the whole payment');
        $this->assertSame('partially_refunded', $this->row($other)->payment_status);
        $this->assertEquals(125.0, (float) $this->row($lead)->refunded_amount);
        $this->assertEquals(100.0, (float) $this->row($other)->refunded_amount, 'the shares add up to what came back: 125 + 100 = 225');
        Mail::assertQueued(BookingRefundMail::class, fn (BookingRefundMail $m) => $m->refundAmount === 225.0 && !$m->isFull);
    }

    public function test_a_refund_of_ours_still_in_flight_on_the_lead_is_not_applied_twice(): void
    {
        [$lead, $other] = $this->group('paid');
        RefundAttempt::create(['organization_id' => $this->org->id, 'mirror_id' => $lead, 'payment_intent_id' => 'pi_group_1', 'requested_at' => now()]);

        $this->deliver('charge.refunded', $this->charge(36000, [['id' => 're_ours_1', 'object' => 'refund', 'amount' => 36000]]));

        $this->assertSame('paid', $this->row($lead)->payment_status);
        $this->assertSame('paid', $this->row($other)->payment_status);
        Mail::assertNothingQueued();
    }

    public function test_a_dispute_flags_every_room_and_winning_it_restores_every_room(): void
    {
        [$lead, $other] = $this->group('paid');
        $dispute = ['id' => 'dp_1', 'object' => 'dispute', 'payment_intent' => 'pi_group_1', 'reason' => 'fraudulent', 'status' => 'needs_response'];

        $this->deliver('charge.dispute.created', $dispute);

        $this->assertSame('disputed', $this->row($lead)->payment_status);
        $this->assertSame('disputed', $this->row($other)->payment_status);
        $this->assertSame(2, DB::table('audit_logs')->where('action', 'booking_disputed')->count());

        $this->deliver('charge.dispute.closed', ['status' => 'won'] + $dispute);

        $this->assertSame('paid', $this->row($lead)->payment_status);
        $this->assertSame('paid', $this->row($other)->payment_status);
        $this->assertSame(2, DB::table('audit_logs')->where('action', 'booking_dispute_won')->count());
    }

    /** The widget's own capture right after its confirm (markMirrorPaid()) pays the rooms that follow the lead too. */
    public function test_the_widgets_capture_after_confirm_pays_every_room(): void
    {
        [$lead, $other] = $this->group();
        $controller = app(BookingPublicController::class);

        (new \ReflectionMethod($controller, 'markMirrorPaid'))->invoke($controller, 'pi_group_1', $this->org->id);

        $this->assertSame(['paid', 'paid'], [$this->row($lead)->payment_status, $this->row($other)->payment_status]);
        $this->assertEquals([200.0, 160.0], [(float) $this->row($lead)->price_paid, (float) $this->row($other)->price_paid]);
    }

    public function test_another_organisations_group_on_the_same_intent_id_is_never_touched(): void
    {
        $otherOrg = Organization::create(['name' => 'Hill Hotel', 'slug' => 'hill-' . uniqid()]);
        [$theirLead, $theirOther] = $this->group('authorized', $otherOrg->id);
        [$lead, $other] = $this->group();

        $this->deliver('payment_intent.canceled', ['status' => 'canceled', 'cancellation_reason' => 'abandoned'] + $this->intent());

        $this->assertSame('cancelled', $this->row($lead)->payment_status);
        $this->assertSame('cancelled', $this->row($other)->payment_status);
        $this->assertSame('authorized', $this->row($theirLead)->payment_status);
        $this->assertSame('authorized', $this->row($theirOther)->payment_status);
    }

    /** One room keeps the write it always had: `price_paid` is the intent's own amount. */
    public function test_a_single_room_is_paid_as_before(): void
    {
        $id = DB::table('booking_mirror')->insertGetId([
            'organization_id' => $this->org->id, 'reservation_id' => 'R-1', 'booking_state' => 'confirmed', 'internal_status' => 'confirmed',
            'price_total' => 200, 'payment_status' => 'authorized', 'payment_method' => 'stripe', 'stripe_payment_intent_id' => 'pi_single_1',
            'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->deliver('payment_intent.succeeded', $this->intent('pi_single_1', 19900));

        $this->assertSame('paid', $this->row($id)->payment_status);
        $this->assertEquals(199.0, (float) $this->row($id)->price_paid);
    }
}
