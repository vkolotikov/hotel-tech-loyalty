<?php

namespace Tests\Feature\Member\Portal;

use App\Mail\AdminBookingCancelledMail;
use App\Mail\BookingCancelledMail;
use App\Mail\BookingRefundMail;
use App\Models\AuditLog;
use App\Models\BookingMirror;
use App\Models\MemberOffer;
use App\Services\Booking\MemberCancellation;
use Illuminate\Support\Facades\Mail;
use Stripe\PaymentIntent;
use Stripe\Refund;
use Tests\Concerns\SeedsDiscountFixture;
use Tests\Concerns\SetsUpStayBookingSchema;
use Tests\Feature\Member\MemberEndpointTestCase;

/**
 * Release 5, part C (built in release 4 as part D): a member-portal
 * combination (StayCombination) is cancelled whole — every room or none, the
 * one payment returned first (released, or refunded once for all the rooms),
 * the rooms cancelled second — and shows in the member's bookings as one
 * booking.
 *
 * The rows are written here as BookingEngineService::confirmMemberCombo()
 * writes them: two rooms of one stay, one group id, the portal channel, the
 * member, each with its share of the one price (180 + 144 = 324), the
 * payment on the lead room only.
 */
class PortalCombinationCancellationTest extends MemberEndpointTestCase
{
    use SetsUpStayBookingSchema, SeedsDiscountFixture, StayPortalFixture;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpStayPortal();
        // The venue's notification goes to its staff.
        \Illuminate\Support\Facades\DB::table('users')->insert(['name' => 'Front desk', 'email' => 'desk@seaside.test', 'password' => bcrypt('x'), 'user_type' => 'staff', 'organization_id' => $this->org->id, 'created_at' => now(), 'updated_at' => now()]);
    }

    /** @return array{0: BookingMirror, 1: BookingMirror} */
    /** How many combinations this test has written: each one's reservations are its own (production's unique organization_id + reservation_id). */
    private int $combinations = 0;

    private function combination(array $both = [], array $second = []): array
    {
        $group = 'c0mb0000-0000-4000-8000-' . str_pad((string) random_int(1, 999999999), 12, '0', STR_PAD_LEFT);
        $n = ++$this->combinations;
        $row = fn (array $own) => BookingMirror::withoutGlobalScopes()->create(array_merge([
            'organization_id' => $this->org->id, 'booking_group_id' => $group,
            'booking_type' => 'reservation', 'booking_state' => 'confirmed', 'internal_status' => 'confirmed',
            'channel_name' => 'Member portal', 'member_id' => $this->member->id, 'guest_name' => 'App Member', 'guest_email' => $this->user->email,
            'arrival_date' => $this->checkIn, 'departure_date' => $this->checkOut,
            'payment_status' => 'open', 'payment_method' => 'pay_at_venue',
        ], $both, $own));

        $lead = $row(['reservation_id' => sprintf('99%02d01', $n), 'booking_reference' => 'BK-C1', 'apartment_id' => '101', 'apartment_name' => 'Sea view', 'adults' => 2, 'children' => 0, 'price_total' => 180, 'list_total' => 200, 'discount_amount' => 20]);
        // Release 5: the lead room carries the one payment; the other room none (booking_mirror_org_pi_unique).
        $other = $row(array_merge(['reservation_id' => sprintf('99%02d02', $n), 'booking_reference' => 'BK-C2', 'apartment_id' => '102', 'apartment_name' => 'Garden', 'adults' => 2, 'children' => 0, 'price_total' => 144, 'list_total' => 160, 'discount_amount' => 16, 'stripe_payment_intent_id' => null], $second));

        return [$lead, $other];
    }

    private function as(?string $token = null)
    {
        $this->flushHeaders();
        $this->app['auth']->forgetGuards();

        return $this->withToken($token ?? $this->token);
    }

    private function cancel(int $id)
    {
        return $this->as()->postJson("/api/v1/member/portal/bookings/stay/{$id}/cancel");
    }

    private function fresh(BookingMirror $m): BookingMirror
    {
        return BookingMirror::withoutGlobalScopes()->findOrFail($m->id);
    }

    private function paidOnline(string $status, string $pi = 'pi_combo'): array
    {
        return ['payment_method' => 'stripe', 'stripe_payment_intent_id' => $pi, 'payment_status' => $status];
    }

    public function test_a_combination_paid_at_the_venue_is_cancelled_whole_and_both_sides_hear_of_it(): void
    {
        [$lead, $other] = $this->combination();
        $this->smoobu->shouldReceive('cancelReservation')->once()->with('990101')->andReturn([]);
        $this->smoobu->shouldReceive('cancelReservation')->once()->with('990102')->andReturn([]);

        $res = $this->cancel($lead->id)->assertOk();

        $res->assertJsonPath('booking.id', $lead->id)->assertJsonPath('booking.title', 'Sea view + Garden')->assertJsonPath('booking.status', 'cancelled')
            ->assertJsonPath('booking.can_cancel', false)->assertJsonPath('refund.outcome', 'none');
        foreach ([$lead, $other] as $m) {
            $m = $this->fresh($m);
            $this->assertNotNull($m->cancelled_at);
            $this->assertSame('cancelled', $m->internal_status);
            $this->assertSame(MemberCancellation::REASON, $m->cancellation_reason);
        }
        $this->assertSame(2, AuditLog::withoutGlobalScopes()->where('action', 'booking.member_cancelled')->count(), 'one per room');
        Mail::assertQueued(BookingCancelledMail::class, 1);
        Mail::assertQueued(BookingCancelledMail::class, fn (BookingCancelledMail $m) => $m->title === 'Sea view + Garden' && $m->bookingReference === 'BK-C1, BK-C2');
        Mail::assertQueued(AdminBookingCancelledMail::class, fn (AdminBookingCancelledMail $m) => $m->title === 'Sea view + Garden' && $m->pmsFailed === false);
    }

    public function test_cancelling_any_room_cancels_the_whole_combination(): void
    {
        [$lead, $other] = $this->combination();
        $this->smoobu->shouldReceive('cancelReservation')->twice()->andReturn([]);

        $this->cancel($other->id)->assertOk()->assertJsonPath('booking.id', $lead->id)->assertJsonPath('booking.status', 'cancelled');

        $this->assertNotNull($this->fresh($lead)->cancelled_at);
        $this->assertNotNull($this->fresh($other)->cancelled_at);
        $this->cancel($lead->id)->assertStatus(409)->assertJsonPath('error', 'already_cancelled');
    }

    public function test_a_held_card_is_released_once_for_every_room(): void
    {
        [$lead, $other] = $this->combination($this->paidOnline('authorized'));
        $stripe = $this->stripe();
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_combo')->andReturn(PaymentIntent::constructFrom(['id' => 'pi_combo', 'status' => 'requires_capture']));
        $stripe->shouldReceive('cancelPaymentIntent')->once()->with('pi_combo', 'requested_by_customer');
        $stripe->shouldNotReceive('refund');
        $this->smoobu->shouldReceive('cancelReservation')->twice()->andReturn([]);

        // Asked through the room that carries no payment: the lead's payment is the one released.
        $this->cancel($other->id)->assertOk()->assertJsonPath('booking.id', $lead->id)->assertJsonPath('refund.outcome', 'released')->assertJsonPath('refund.amount', 324.0);

        $this->assertSame(['cancelled', 'cancelled'], [(string) $this->fresh($lead)->payment_status, (string) $this->fresh($other)->payment_status]);
        $this->assertSame(2, BookingMirror::withoutGlobalScopes()->whereKey([$lead->id, $other->id])->whereNotNull('cancelled_at')->count());
    }

    public function test_a_captured_payment_is_refunded_once_for_the_whole_combination_then_every_room_is_cancelled(): void
    {
        [$lead, $other] = $this->combination($this->paidOnline('paid'));
        $stripe = $this->stripe();
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_combo')->andReturn(PaymentIntent::constructFrom(['id' => 'pi_combo', 'status' => 'succeeded']));
        $stripe->shouldReceive('refund')->once()->withArgs(fn (string $pi, ?float $amount = null) => $pi === 'pi_combo' && $amount === null)
            ->andReturn(Refund::constructFrom(['id' => 're_combo', 'status' => 'succeeded']));
        $this->smoobu->shouldReceive('cancelReservation')->twice()->andReturn([]);

        $this->cancel($lead->id)->assertOk()->assertJsonPath('refund.outcome', 'refunded')->assertJsonPath('refund.amount', 324.0)
            ->assertJsonPath('booking.status', 'cancelled');

        foreach ([[$lead, 180.0], [$other, 144.0]] as [$m, $share]) {
            $m = $this->fresh($m);
            $this->assertSame('refunded', (string) $m->payment_status);
            $this->assertEquals($share, (float) $m->refunded_amount, 'each room records its own share');
            $this->assertNotNull($m->cancelled_at);
            $this->assertSame(1, AuditLog::withoutGlobalScopes()->where('action', MemberCancellation::STARTED)->where('subject_id', $m->id)->count());
        }
        // One refund, one mail: it names both rooms and the whole amount (release 5), so — as for one room — no second mail.
        Mail::assertQueued(BookingRefundMail::class, 1);
        Mail::assertQueued(BookingRefundMail::class, fn (BookingRefundMail $m) => $m->unitName === 'Sea view + Garden' && $m->bookingReference === 'BK-C1, BK-C2' && $m->refundAmount === 324.0 && $m->isFull);
        Mail::assertNotQueued(BookingCancelledMail::class);
        Mail::assertQueued(AdminBookingCancelledMail::class, fn (AdminBookingCancelledMail $m) => $m->title === 'Sea view + Garden');
    }

    public function test_a_refund_that_fails_leaves_every_room_standing(): void
    {
        [$lead, $other] = $this->combination($this->paidOnline('paid'));
        $stripe = $this->stripe();
        $stripe->shouldReceive('retrievePaymentIntent')->andReturn(PaymentIntent::constructFrom(['id' => 'pi_combo', 'status' => 'succeeded']));
        $stripe->shouldReceive('refund')->andThrow(new \RuntimeException('stripe down'));
        $this->smoobu->shouldNotReceive('cancelReservation');

        $this->cancel($lead->id)->assertStatus(409)->assertJsonPath('error', 'refund_outcome_unknown');

        foreach ([$lead, $other] as $m) {
            $m = $this->fresh($m);
            $this->assertNull($m->cancelled_at);
            $this->assertSame('confirmed', $m->internal_status);
            $this->assertSame('paid', (string) $m->payment_status);
        }
        Mail::assertNothingQueued();
    }

    public function test_money_already_back_in_full_finishes_the_cancellation_without_asking_stripe(): void
    {
        [$lead, $other] = $this->combination($this->paidOnline('refunded'), ['refunded_amount' => 144]);
        BookingMirror::withoutGlobalScopes()->whereKey($lead->id)->update(['refunded_amount' => 180]);
        $stripe = $this->stripe();
        $stripe->shouldNotReceive('retrievePaymentIntent');
        $stripe->shouldNotReceive('refund');

        $this->cancel($lead->id)->assertOk()->assertJsonPath('refund.outcome', 'refunded')->assertJsonPath('refund.amount', 324.0);
        $this->assertNotNull($this->fresh($other)->cancelled_at);
    }

    public function test_a_room_the_venue_changed_on_its_own_makes_the_combination_the_venues_to_cancel(): void
    {
        [$lead, $other] = $this->combination([], ['internal_status' => 'cancelled', 'booking_state' => 'cancelled']);
        $this->smoobu->shouldNotReceive('cancelReservation');

        $this->cancel($lead->id)->assertStatus(422)->assertJsonPath('error', 'not_cancellable');
        $this->assertNull($this->fresh($lead)->cancelled_at);

        [$disputedLead] = $this->combination($this->paidOnline('paid'), ['payment_status' => 'disputed']);
        $this->cancel($disputedLead->id)->assertStatus(422)->assertJsonPath('error', 'not_cancellable');

        // A dispute as the webhook records it: on every room of the payment.
        [$bothDisputed, $alsoDisputed] = $this->combination($this->paidOnline('disputed', 'pi_combo_disputed'));
        $this->stripe()->shouldNotReceive('refund');
        $this->cancel($alsoDisputed->id)->assertStatus(422)->assertJsonPath('error', 'not_cancellable');
        $this->assertNull($this->fresh($bothDisputed)->cancelled_at);
        $this->as()->getJson("/api/v1/member/portal/bookings/stay/{$bothDisputed->id}")->assertOk()->assertJsonPath('can_cancel', false);
    }

    public function test_past_the_deadline_the_member_is_told_to_contact_the_venue(): void
    {
        [$lead] = $this->combination(['arrival_date' => now()->addDay()->toDateString(), 'departure_date' => now()->addDays(3)->toDateString()]);
        $this->smoobu->shouldNotReceive('cancelReservation');

        $this->cancel($lead->id)->assertStatus(422)->assertJsonPath('error', 'outside_policy');
    }

    public function test_the_coupon_comes_back_once_by_the_lead_rooms_reference(): void
    {
        $claim = $this->claim(50);
        [$lead, $other] = $this->combination(['discount_source' => 'offer', 'discount_source_id' => $claim->id]);
        $claim->forceFill(['used_at' => now(), 'status' => 'used', 'used_reference' => 'BM:' . $lead->id])->save();
        $this->smoobu->shouldReceive('cancelReservation')->twice()->andReturn([]);

        $this->cancel($other->id)->assertOk()->assertJsonPath('refund.coupon_released', true);

        $this->assertNull(MemberOffer::findOrFail($claim->id)->used_at);
    }

    public function test_the_bookings_list_shows_a_combination_as_one_booking(): void
    {
        [$lead, $other] = $this->combination();

        $list = $this->as()->getJson('/api/v1/member/portal/bookings?scope=upcoming')->assertOk()->json('data');

        $this->assertCount(1, $list);
        $this->assertSame($lead->id, $list[0]['id']);
        $this->assertSame('Sea view + Garden', $list[0]['title']);
        $this->assertEquals(324.0, $list[0]['total']);
        $this->assertEquals(36.0, $list[0]['discount']['amount']);
        $this->assertSame(4, $list[0]['guests']);
        $this->assertTrue($list[0]['can_cancel']);
        $this->assertSame([$lead->id, $other->id], array_column($list[0]['rooms'], 'id'));

        $this->as()->getJson("/api/v1/member/portal/bookings/stay/{$other->id}")->assertOk()->assertJsonPath('id', $lead->id)->assertJsonPath('rooms.1.title', 'Garden');
    }

    /** A lone row with a group id is not a combination (a staff group, the widget's): it keeps the old rule. */
    public function test_a_single_room_of_a_group_is_still_the_venues(): void
    {
        $m = BookingMirror::withoutGlobalScopes()->create([
            'organization_id' => $this->org->id, 'booking_group_id' => 'a3f0c2de-0000-4000-8000-000000000001', 'reservation_id' => '990199', 'booking_reference' => 'BK-LONE',
            'booking_state' => 'confirmed', 'internal_status' => 'confirmed', 'apartment_id' => '101', 'apartment_name' => 'Sea view',
            'channel_name' => 'Member portal', 'member_id' => $this->member->id, 'guest_email' => $this->user->email,
            'arrival_date' => $this->checkIn, 'departure_date' => $this->checkOut, 'price_total' => 180, 'payment_status' => 'open', 'payment_method' => 'pay_at_venue',
        ]);

        $this->as()->getJson("/api/v1/member/portal/bookings/stay/{$m->id}")->assertOk()->assertJsonPath('can_cancel', false)->assertJsonMissingPath('rooms');
        $this->cancel($m->id)->assertStatus(422)->assertJsonPath('error', 'not_cancellable');
    }

    /** The widget's own combination (channel Website, no member) is untouched by any of this. */
    public function test_the_widgets_own_combination_is_not_a_portal_combination(): void
    {
        // The member's own guest, so the widget's rows are theirs to see (MemberBookingQuery's guest rule).
        app()->instance('current_organization_id', $this->org->id);
        $guest = app(\App\Services\GuestMemberLinkService::class)->ensureGuestForMember($this->member);
        app()->forgetInstance('current_organization_id');
        [$lead] = $this->combination(['channel_name' => 'Website', 'member_id' => null, 'guest_id' => $guest->id]);

        $list = $this->as()->getJson('/api/v1/member/portal/bookings?scope=upcoming')->assertOk()->json('data');

        $this->assertCount(2, $list, 'two rows, as before');
        $this->assertFalse($list[0]['can_cancel']);
        $this->cancel($lead->id)->assertStatus(422)->assertJsonPath('error', 'not_cancellable');
    }
}
