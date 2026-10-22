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
}
