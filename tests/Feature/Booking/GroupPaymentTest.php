<?php

namespace Tests\Feature\Booking;

use App\Models\BookingMirror;
use App\Services\Booking\GroupPayment;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Release 5, part C: the rows one PaymentIntent pays for — the lead room that
 * carries it and the rooms of its group that carry none — and nothing else:
 * not another group, not another organisation, not a room with an intent of
 * its own. The test schema has production's `booking_mirror_org_pi_unique`.
 */
class GroupPaymentTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema;

    private int $orgId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpBookingRefundSchema();
        $this->orgId = OrganizationFactory::new()->create()->id;
    }

    private function row(array $attrs): int
    {
        return DB::table('booking_mirror')->insertGetId(array_merge([
            'organization_id' => $this->orgId, 'reservation_id' => 'R-' . uniqid(), 'price_total' => 100,
            'payment_status' => 'authorized', 'payment_method' => 'stripe', 'created_at' => now(), 'updated_at' => now(),
        ], $attrs));
    }

    public function test_the_rows_of_an_intent_are_its_lead_and_the_rooms_that_follow_it(): void
    {
        $lead = $this->row(['booking_group_id' => 'g-1', 'stripe_payment_intent_id' => 'pi_g1']);
        $second = $this->row(['booking_group_id' => 'g-1']);
        $third = $this->row(['booking_group_id' => 'g-1', 'stripe_payment_intent_id' => '']);
        $this->row(['booking_group_id' => 'g-2']);
        $this->row(['booking_group_id' => 'g-1', 'stripe_payment_intent_id' => 'pi_other']);
        $foreignOrg = OrganizationFactory::new()->create()->id;
        $this->row(['organization_id' => $foreignOrg, 'booking_group_id' => 'g-1']);
        $this->row(['organization_id' => $foreignOrg, 'booking_group_id' => 'g-9', 'stripe_payment_intent_id' => 'pi_g1']);

        $this->assertSame([$lead, $second, $third], GroupPayment::rows($this->orgId, 'pi_g1')->pluck('id')->all());
        $this->assertSame([$lead, $second, $third], GroupPayment::rows($this->orgId, 'pi_g1', true)->pluck('id')->all(), 'the locked read is the same rows');
        $this->assertSame([], GroupPayment::rows($this->orgId, '')->all());
        $this->assertSame([$second, $third], GroupPayment::followers(BookingMirror::withoutGlobalScopes()->find($lead))->pluck('id')->all());
        $this->assertSame($lead, GroupPayment::payer(BookingMirror::withoutGlobalScopes()->find($second))->id, 'a room that follows pays through its lead');
        $this->assertSame($lead, GroupPayment::payer(BookingMirror::withoutGlobalScopes()->find($lead))->id);
    }

    public function test_a_single_room_is_a_group_of_one(): void
    {
        $id = $this->row(['stripe_payment_intent_id' => 'pi_single']);
        $this->row(['stripe_payment_intent_id' => null]);

        $this->assertSame([$id], GroupPayment::rows($this->orgId, 'pi_single')->pluck('id')->all());
        $this->assertSame([], GroupPayment::followers(BookingMirror::withoutGlobalScopes()->find($id))->all());
    }

    public function test_the_index_refuses_a_second_row_with_the_same_intent(): void
    {
        $this->row(['booking_group_id' => 'g-1', 'stripe_payment_intent_id' => 'pi_twice']);

        $this->expectException(\Illuminate\Database\UniqueConstraintViolationException::class);
        $this->row(['booking_group_id' => 'g-1', 'stripe_payment_intent_id' => 'pi_twice']);
    }

    // ── allocateRefund(): where a part of the one payment that comes back belongs ──

    /** @return list<array{id: int, total: float, refunded: float, cancelled: bool}> */
    private function rooms(array ...$rooms): array
    {
        return array_map(fn (array $r) => ['id' => $r[0], 'total' => (float) $r[1], 'refunded' => (float) ($r[2] ?? 0), 'cancelled' => (bool) ($r[3] ?? false)], $rooms);
    }

    public function test_a_refund_for_one_room_goes_to_that_room_first(): void
    {
        $this->assertSame([1 => 0.0, 2 => 160.0], GroupPayment::allocateRefund($this->rooms([1, 200], [2, 160]), 160.0, 2));
        $this->assertSame([1 => 10.0, 2 => 160.0], GroupPayment::allocateRefund($this->rooms([1, 200], [2, 160]), 170.0, 2), 'beyond the room, to the rest');
    }

    public function test_a_cancelled_room_takes_the_money_before_the_live_rooms(): void
    {
        $this->assertSame([1 => 0.0, 2 => 160.0], GroupPayment::allocateRefund($this->rooms([1, 200], [2, 160, 0, true]), 160.0));
        $this->assertSame([1 => 0.0, 2 => 100.0], GroupPayment::allocateRefund($this->rooms([1, 200], [2, 160, 60, true]), 40.0), 'up to what it has left');
        $this->assertSame([1 => 20.0, 2 => 160.0], GroupPayment::allocateRefund($this->rooms([1, 200], [2, 160, 0, true]), 180.0), 'the rest to the live rooms');
    }

    public function test_the_rest_is_shared_in_proportion_and_adds_up_to_the_cent(): void
    {
        $after = GroupPayment::allocateRefund($this->rooms([1, 100], [2, 100], [3, 100]), 100.0);
        $this->assertEqualsWithDelta(100.0, array_sum($after), 0.0001);
        $this->assertSame([1 => 33.34, 2 => 33.33, 3 => 33.33], $after);

        $after = GroupPayment::allocateRefund($this->rooms([1, 200, 50], [2, 160]), 90.0);
        $this->assertEqualsWithDelta(140.0, array_sum($after), 0.0001, 'what was refunded before, plus this refund');
        $this->assertSame([1 => 93.55, 2 => 46.45], $after, 'in proportion to what each room has LEFT (150 : 160): 43.55 + 46.45');
    }

    public function test_no_room_is_refunded_more_than_it_cost(): void
    {
        $this->assertSame([1 => 200.0, 2 => 160.0], GroupPayment::allocateRefund($this->rooms([1, 200], [2, 160]), 999.0, 1));
        $this->assertSame([1 => 200.0, 2 => 160.0], GroupPayment::allocateRefund($this->rooms([1, 200, 200], [2, 160, 160]), 10.0));
    }
}
