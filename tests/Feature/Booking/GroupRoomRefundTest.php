<?php

namespace Tests\Feature\Booking;

use App\Http\Controllers\Api\V1\Admin\BookingAdminController;
use App\Mail\BookingRefundMail;
use App\Models\BookingMirror;
use App\Services\BookingRefundService;
use App\Services\SmoobuClient;
use App\Services\StripeService;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Mockery;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Release 5, part C, review fix 1: the full admin's refund on ONE room of a
 * multi-room stay (one payment, carried by the lead room) is that room's.
 * With no amount it refunds the room's own remaining total — what the dialog
 * promises ("full refund of" the room's total) — never the whole payment; the
 * money is recorded on that room, the other rooms keep their status and
 * their Smoobu reservation. A single room is refunded exactly as before.
 *
 * Rows are written as production's schema takes them (the test runs on
 * PostgreSQL too). Stripe and Smoobu are mocks.
 */
class GroupRoomRefundTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema;

    private int $orgId;
    private $stripe;
    private $smoobu;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpBookingRefundSchema();
        $this->setUpBookingAdminSchema();
        Mail::fake();
        $this->orgId = OrganizationFactory::new()->create()->id;
        app()->instance('current_organization_id', $this->orgId);

        $this->stripe = Mockery::mock(StripeService::class);
        $this->stripe->shouldReceive('isEnabled')->andReturn(true);
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

    private function room(array $attrs): int
    {
        return DB::table('booking_mirror')->insertGetId(array_merge([
            'organization_id' => $this->orgId, 'reservation_id' => 'R-' . uniqid(), 'booking_state' => 'confirmed', 'internal_status' => 'confirmed',
            'channel_name' => 'Website', 'guest_name' => 'Ada Lovelace', 'guest_email' => 'ada@example.test',
            'arrival_date' => now()->addDays(10)->toDateString(), 'departure_date' => now()->addDays(12)->toDateString(),
            'payment_status' => 'paid', 'payment_method' => 'stripe', 'created_at' => now(), 'updated_at' => now(),
        ], $attrs));
    }

    /** @return array{0: int, 1: int} the lead (Sea view, 200, carries the payment) and the other room (Garden, 160) */
    private function group(): array
    {
        return [
            $this->room(['booking_group_id' => 'grp-1', 'apartment_name' => 'Sea view', 'booking_reference' => 'BK-101', 'reservation_id' => '880101', 'price_total' => 200, 'price_paid' => 200, 'stripe_payment_intent_id' => 'pi_room_1']),
            $this->room(['booking_group_id' => 'grp-1', 'apartment_name' => 'Garden', 'booking_reference' => 'BK-102', 'reservation_id' => '880102', 'price_total' => 160, 'price_paid' => 160]),
        ];
    }

    private function refund(int $id, array $body = [])
    {
        return app(BookingAdminController::class)->refund(Request::create('/x', 'POST', $body), $id, app(BookingRefundService::class));
    }

    private function row(int $id): object
    {
        return DB::table('booking_mirror')->where('id', $id)->first();
    }

    private function fakeRefund(string $id): \Stripe\Refund
    {
        return \Stripe\Refund::constructFrom(['id' => $id, 'object' => 'refund', 'status' => 'succeeded']);
    }

    public function test_a_refund_with_no_amount_on_one_room_refunds_that_room_only(): void
    {
        [$lead, $other] = $this->group();
        $this->stripe->shouldReceive('refund')->once()->with('pi_room_1', 160.0, null)->andReturn($this->fakeRefund('re_room_1'));
        $this->smoobu->shouldReceive('cancelReservation')->once()->with('880102')->andReturn([]);

        $res = $this->refund($other);

        $this->assertSame(200, $res->getStatusCode());
        $this->assertFalse($res->getData(true)['refund_outcome']['is_full'], 'one room of the payment, not the whole of it');
        $this->assertSame('refunded', $this->row($other)->payment_status);
        $this->assertEquals(160.0, (float) $this->row($other)->refunded_amount);
        $this->assertSame('cancelled', $this->row($other)->booking_state, 'the refunded room is cancelled at Smoobu');
        $this->assertSame('paid', $this->row($lead)->payment_status, 'the other room keeps its status');
        $this->assertNull($this->row($lead)->refunded_amount);
        $this->assertSame('confirmed', $this->row($lead)->booking_state, 'and its Smoobu reservation');
        Mail::assertQueued(BookingRefundMail::class, fn (BookingRefundMail $m) => $m->unitName === 'Garden' && $m->bookingReference === 'BK-102' && $m->refundAmount === 160.0 && !$m->isFull);
    }

    public function test_a_refund_on_the_lead_rooms_page_is_the_lead_rooms_own(): void
    {
        [$lead, $other] = $this->group();
        $this->stripe->shouldReceive('refund')->once()->with('pi_room_1', 200.0, null)->andReturn($this->fakeRefund('re_room_2'));
        $this->smoobu->shouldReceive('cancelReservation')->once()->with('880101')->andReturn([]);

        $this->refund($lead);

        $this->assertSame('refunded', $this->row($lead)->payment_status);
        $this->assertSame('paid', $this->row($other)->payment_status);

        // The other room can still be refunded afterwards, through the lead's payment.
        // (A later staff action: production's `refund_attempts_replay_unique`
        // refuses a second attempt on the same payment within the same second.)
        $this->travel(2)->seconds();
        $this->stripe->shouldReceive('refund')->once()->with('pi_room_1', 160.0, null)->andReturn($this->fakeRefund('re_room_3'));
        $this->smoobu->shouldReceive('cancelReservation')->once()->with('880102')->andReturn([]);
        $second = $this->refund($other);
        $this->assertSame(200, $second->getStatusCode(), json_encode($second->getData(true)));
        $this->assertSame('refunded', $this->row($other)->payment_status);
    }

    public function test_a_part_of_one_rooms_total_is_recorded_on_that_room(): void
    {
        [$lead, $other] = $this->group();
        $this->stripe->shouldReceive('refund')->once()->with('pi_room_1', 50.0, 'requested_by_customer')->andReturn($this->fakeRefund('re_room_4'));
        $this->smoobu->shouldNotReceive('cancelReservation');

        $this->refund($other, ['amount' => 50, 'reason' => 'requested_by_customer']);

        $this->assertSame('partially_refunded', $this->row($other)->payment_status);
        $this->assertEquals(50.0, (float) $this->row($other)->refunded_amount);
        $this->assertSame('paid', $this->row($lead)->payment_status);
        $this->assertNull($this->row($lead)->refunded_amount);
    }

    public function test_a_room_with_nothing_left_to_refund_is_refused(): void
    {
        [, $other] = $this->group();
        DB::table('booking_mirror')->where('id', $other)->update(['refunded_amount' => 160, 'payment_status' => 'partially_refunded']);
        $this->stripe->shouldNotReceive('refund');

        $res = $this->refund($other);

        $this->assertSame(422, $res->getStatusCode());
        $this->assertSame('This room has nothing left to refund.', $res->getData(true)['error']);
    }

    /** One room is refunded exactly as before: no amount is the whole payment, recorded on the room. */
    public function test_a_single_room_is_refunded_as_before(): void
    {
        $id = $this->room(['apartment_name' => 'Sea view', 'reservation_id' => '880201', 'price_total' => 200, 'price_paid' => 200, 'stripe_payment_intent_id' => 'pi_single_room']);
        $this->stripe->shouldReceive('refund')->once()->with('pi_single_room', null, null)->andReturn($this->fakeRefund('re_single_1'));
        $this->smoobu->shouldReceive('cancelReservation')->once()->with('880201')->andReturn([]);

        $res = $this->refund($id);

        $this->assertTrue($res->getData(true)['refund_outcome']['is_full']);
        $this->assertSame('refunded', $this->row($id)->payment_status);
        $this->assertEquals(200.0, (float) $this->row($id)->refunded_amount);
    }
}
