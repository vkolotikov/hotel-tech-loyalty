<?php

namespace Tests\Feature\Booking;

use App\Models\AuditLog;
use App\Models\BookingMirror;
use App\Models\MemberOffer;
use App\Models\PointsTransaction;
use App\Models\RewardRedemption;
use App\Models\ServiceBooking;
use App\Mail\BookingRefundMail;
use App\Services\Booking\CancellationException;
use App\Services\Booking\MemberCancellation;
use App\Services\Loyalty\BookingPointsService;
use App\Services\SmoobuClient;
use App\Services\StripeService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Mockery;
use Stripe\PaymentIntent;
use Stripe\Refund;
use Tests\Concerns\SeedsDiscountFixture;
use Tests\Concerns\SeedsPointsFixture;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\Concerns\SetsUpServiceBookingSchema;
use Tests\Concerns\SetsUpStayBookingSchema;
use Tests\TestCase;

class MemberCancellationTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema, SetsUpServiceBookingSchema, SetsUpStayBookingSchema, SeedsDiscountFixture, SeedsPointsFixture;

    protected $stripe;
    protected $smoobu;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpMinimalSchema();
        $this->setUpLoyaltyAwardSchema();
        $this->setUpServiceBookingSchema();
        $this->setUpStayBookingSchema();
        $this->setUpDiscountTables();

        $fixture = $this->seedPointsFixture();
        $this->orgId = $fixture['orgId'];
        $this->member = $fixture['member'];

        $this->stripe = Mockery::mock(StripeService::class);
        $this->stripe->shouldReceive('isEnabled')->andReturn(true)->byDefault();
        $this->app->instance(StripeService::class, $this->stripe);

        $this->smoobu = Mockery::mock(SmoobuClient::class);
        $this->app->instance(SmoobuClient::class, $this->smoobu);
        Mail::fake();
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        Mockery::close();
        parent::tearDown();
    }

    protected function cancellation(): MemberCancellation
    {
        return $this->app->make(MemberCancellation::class);
    }

    protected function appointment(array $attrs = []): ServiceBooking
    {
        return $this->pointsBooking($this->orgId, $this->member, array_merge([
            'status' => 'confirmed', 'payment_status' => 'unpaid',
            'start_at' => now()->addDays(3), 'end_at' => now()->addDays(3)->addMinutes(45),
        ], $attrs));
    }

    public function test_an_unpaid_appointment_is_cancelled_with_nothing_to_return(): void
    {
        $this->stripe->shouldNotReceive('retrievePaymentIntent');
        $b = $this->appointment();

        $out = $this->cancellation()->cancelService($this->orgId, $b->id);

        $this->assertSame('service', $out->kind);
        $this->assertSame('none', $out->money);
        $fresh = $b->fresh();
        $this->assertSame('cancelled', $fresh->status);
        $this->assertSame('member_portal', $fresh->cancellation_reason);
        $this->assertNotNull($fresh->cancelled_at);
        $this->assertSame('unpaid', $fresh->payment_status);
        $this->assertSame(['outcome' => 'none', 'amount' => 0.0, 'currency' => 'EUR', 'coupon_released' => false, 'points_reversed' => 0], $out->toArray());
    }

    public function test_a_held_card_is_released_and_a_captured_payment_refunded(): void
    {
        $held = $this->appointment(['payment_status' => 'authorized', 'stripe_payment_intent_id' => 'pi_held']);
        $paid = $this->appointment(['payment_status' => 'paid', 'stripe_payment_intent_id' => 'pi_paid', 'start_at' => now()->addDays(4), 'end_at' => now()->addDays(4)->addMinutes(45)]);
        $this->stripe->shouldReceive('retrievePaymentIntent')->with('pi_held', ['latest_charge'])->andReturn(PaymentIntent::constructFrom(['id' => 'pi_held', 'status' => 'requires_capture']));
        $this->stripe->shouldReceive('cancelPaymentIntent')->once()->with('pi_held', 'requested_by_customer')->andReturn(PaymentIntent::constructFrom(['id' => 'pi_held', 'status' => 'canceled']));
        $this->stripe->shouldReceive('retrievePaymentIntent')->with('pi_paid', ['latest_charge'])->andReturn(PaymentIntent::constructFrom(['id' => 'pi_paid', 'status' => 'succeeded']));
        $this->stripe->shouldReceive('refund')->once()->with('pi_paid', null, 'requested_by_customer')->andReturn(Refund::constructFrom(['id' => 're_9', 'status' => 'succeeded']));

        $a = $this->cancellation()->cancelService($this->orgId, $held->id);
        $b = $this->cancellation()->cancelService($this->orgId, $paid->id);

        $this->assertSame('released', $a->money);
        $this->assertSame('cancelled', $held->fresh()->payment_status);
        $this->assertSame('refunded', $b->money);
        $this->assertSame(54.0, $b->amount);
        $this->assertSame('refunded', $paid->fresh()->payment_status);
        $this->assertSame('re_9', $paid->fresh()->last_refund_id);
        $this->assertEquals(54.0, (float) $paid->fresh()->refunded_amount);
    }

    public function test_a_refund_that_fails_leaves_the_booking_exactly_as_it_was(): void
    {
        $claim = $this->claimedOffer('fixed_amount', 6);
        $claim->forceFill(['used_at' => now(), 'status' => 'used', 'used_reference' => 'SVC-KEEP0001'])->save();
        $b = $this->appointment(['booking_reference' => 'SVC-KEEP0001', 'payment_status' => 'paid', 'stripe_payment_intent_id' => 'pi_paid', 'discount_source' => 'offer', 'discount_source_id' => $claim->id]);
        $this->stripe->shouldReceive('retrievePaymentIntent')->andReturn(PaymentIntent::constructFrom(['id' => 'pi_paid', 'status' => 'succeeded']));
        $this->stripe->shouldReceive('refund')->andThrow(new \RuntimeException('stripe down'));

        try {
            $this->cancellation()->cancelService($this->orgId, $b->id);
            $this->fail('a failed refund must not cancel');
        } catch (CancellationException $e) {
            $this->assertSame('refund_failed', $e->errorCode);
        }

        $this->assertSame('confirmed', $b->fresh()->status);
        $this->assertSame('paid', $b->fresh()->payment_status);
        $this->assertNotNull(MemberOffer::findOrFail($claim->id)->used_at, 'the coupon stays used while the booking stands');
    }

    public function test_the_offer_coupon_comes_back_only_when_this_booking_used_it(): void
    {
        $claim = $this->claimedOffer('fixed_amount', 6);
        $claim->forceFill(['used_at' => now(), 'status' => 'used', 'used_reference' => 'SVC-MINE0001'])->save();
        $mine = $this->appointment(['booking_reference' => 'SVC-MINE0001', 'discount_source' => 'offer', 'discount_source_id' => $claim->id]);

        $out = $this->cancellation()->cancelService($this->orgId, $mine->id);

        $this->assertTrue($out->couponReleased);
        $back = MemberOffer::findOrFail($claim->id);
        $this->assertNull($back->used_at);
        $this->assertSame('claimed', $back->status);
        $this->assertNull($back->used_reference);

        // The same claim, used at the counter since (no reference, or another booking's).
        $claim->forceFill(['used_at' => now(), 'status' => 'used', 'used_reference' => 'SVC-OTHER001'])->save();
        $other = $this->appointment(['booking_reference' => 'SVC-THIS0002', 'discount_source' => 'offer', 'discount_source_id' => $claim->id, 'start_at' => now()->addDays(5), 'end_at' => now()->addDays(5)->addMinutes(45)]);

        $again = $this->cancellation()->cancelService($this->orgId, $other->id);

        $this->assertFalse($again->couponReleased);
        $this->assertSame('SVC-OTHER001', MemberOffer::findOrFail($claim->id)->used_reference);
    }

    public function test_a_reward_code_comes_back_as_pending(): void
    {
        $red = $this->redemption('fixed_amount', 10);
        $red->forceFill(['status' => RewardRedemption::STATUS_FULFILLED, 'fulfilled_at' => now(), 'notes' => 'Applied to SVC-RWD00001'])->save();
        $b = $this->appointment(['booking_reference' => 'SVC-RWD00001', 'discount_source' => 'reward', 'discount_source_id' => $red->id]);

        $out = $this->cancellation()->cancelService($this->orgId, $b->id);

        $this->assertTrue($out->couponReleased);
        $back = RewardRedemption::findOrFail($red->id);
        $this->assertSame(RewardRedemption::STATUS_PENDING, $back->status);
        $this->assertNull($back->fulfilled_at);
        $this->assertNull($back->notes);
    }

    public function test_a_tier_benefit_has_nothing_to_release(): void
    {
        $b = $this->appointment(['discount_source' => 'tier_benefit', 'discount_source_id' => 3]);
        $this->assertFalse($this->cancellation()->cancelService($this->orgId, $b->id)->couponReleased);
    }

    public function test_points_already_awarded_for_the_booking_are_reversed(): void
    {
        $b = $this->appointment();
        $tx = app(\App\Services\LoyaltyService::class)->awardPoints($this->member, 810, 'Appointment', 'earn', null, 'service_booking', $b->id, 54.0, null, null, 'booking_completed', 'service_booking', (string) $b->id, "booking_points_service_{$b->id}");

        $out = $this->cancellation()->cancelService($this->orgId, $b->id);

        $this->assertSame(810, $out->pointsReversed);
        $this->assertTrue((bool) PointsTransaction::findOrFail($tx->id)->is_reversed);
        $this->assertSame(0, (int) $this->member->fresh()->current_points);
    }

    /**
     * Found by the task 23 live pass on PostgreSQL: a points reversal that
     * failed inside cancelService()'s one transaction was caught and logged,
     * but on PostgreSQL the failed statement had already aborted the
     * transaction — the commit became a rollback, and the member was told
     * "cancelled" while the booking stayed confirmed. sqlite cannot show
     * that, so this pins the cure structurally: every reversal runs in its
     * own SAVEPOINT (one level below cancelService()'s transaction), the way
     * cancelStay()'s reverseStayPoints() already does.
     */
    public function test_each_points_reversal_runs_in_its_own_savepoint_so_a_failure_cannot_abort_the_cancellation(): void
    {
        $b = $this->appointment();
        app(\App\Services\LoyaltyService::class)->awardPoints($this->member, 810, 'Appointment', 'earn', null, 'service_booking', $b->id, 54.0);
        $levels = [];
        $loyalty = Mockery::mock(\App\Services\LoyaltyService::class)->makePartial();
        $loyalty->shouldReceive('reverseTransaction')->andReturnUsing(function () use (&$levels) {
            $levels[] = DB::transactionLevel();
            throw new \RuntimeException('the reversal failed');
        });
        $this->app->instance(\App\Services\LoyaltyService::class, $loyalty);
        $base = DB::transactionLevel();

        $out = $this->cancellation()->cancelService($this->orgId, $b->id);

        $this->assertSame([$base + 2], $levels, 'cancelService() is one level; its reversal must be one SAVEPOINT deeper');
        $this->assertSame(0, $out->pointsReversed);
        $this->assertSame('cancelled', $b->fresh()->status);
    }

    public function test_the_window_the_state_and_the_organisation_are_enforced(): void
    {
        $cases = [
            'outside_policy'    => $this->appointment(['start_at' => now()->addHours(5), 'end_at' => now()->addHours(6)]),
            'not_cancellable'   => $this->appointment(['status' => 'completed']),
            'already_cancelled' => $this->appointment(['status' => 'cancelled']),
        ];
        foreach ($cases as $code => $booking) {
            try {
                $this->cancellation()->cancelService($this->orgId, $booking->id);
                $this->fail($code);
            } catch (CancellationException $e) {
                $this->assertSame($code, $e->errorCode);
            }
        }

        // The ambient tenant (bound by seedPointsFixture() to $this->orgId for
        // the whole test) is unbound here so this sub-case exercises what it
        // means to: a booking looked up under an $orgId that doesn't own it,
        // not the separate ambient-tenant guard (its own tests below).
        $b = $this->appointment();
        app()->forgetInstance('current_organization_id');
        try {
            $this->cancellation()->cancelService($this->orgId + 1, $b->id);
            $this->fail('another organisation');
        } catch (CancellationException $e) {
            $this->assertSame('not_found', $e->errorCode);
        }
        $this->assertSame('confirmed', $b->fresh()->status);
    }

    /** A caller passing an $orgId that disagrees with the ambient tenant is a programming error, not something a member did. */
    public function test_a_mismatched_ambient_tenant_is_refused_before_anything_is_read(): void
    {
        $this->stripe->shouldNotReceive('retrievePaymentIntent');
        $b = $this->appointment();

        try {
            // current_organization_id is bound to $this->orgId by seedPointsFixture(); calling for a different org must be refused before the booking is even looked up.
            $this->cancellation()->cancelService($this->orgId + 1, $b->id);
            $this->fail('a mismatched ambient tenant must be refused');
        } catch (\LogicException $e) {
            // expected
        }

        $this->assertSame('confirmed', $b->fresh()->status);
    }

    /** With no ambient tenant bound at all, cancelService() binds one for the duration and restores "not bound" afterward. */
    public function test_with_no_ambient_tenant_cancelservice_binds_one_for_the_duration_and_restores_it(): void
    {
        $this->stripe->shouldNotReceive('retrievePaymentIntent');
        $b = $this->appointment();
        app()->forgetInstance('current_organization_id');
        $this->assertFalse(app()->bound('current_organization_id'));

        $out = $this->cancellation()->cancelService($this->orgId, $b->id);

        $this->assertSame('none', $out->money);
        $this->assertSame('cancelled', $b->fresh()->status);
        $this->assertFalse(app()->bound('current_organization_id'), 'the ambient tenant binding must be restored to "not bound" afterward');
    }

    /** Stripe switched off at the venue, reached through cancelService() itself rather than giveBack() directly. */
    public function test_refund_unavailable_through_cancelservice_leaves_the_booking_unchanged(): void
    {
        $this->stripe->shouldReceive('isEnabled')->andReturn(false);
        $b = $this->appointment(['payment_status' => 'paid', 'stripe_payment_intent_id' => 'pi_paid']);

        try {
            $this->cancellation()->cancelService($this->orgId, $b->id);
            $this->fail('no Stripe, no refund');
        } catch (CancellationException $e) {
            $this->assertSame('refund_unavailable', $e->errorCode);
            $this->assertSame(409, $e->status);
        }
        $this->assertSame('confirmed', $b->fresh()->status);
        $this->assertSame('paid', $b->fresh()->payment_status);
    }

    /** A booking id that was never real. */
    public function test_a_nonexistent_booking_id_is_not_found(): void
    {
        $this->stripe->shouldNotReceive('retrievePaymentIntent');

        try {
            $this->cancellation()->cancelService($this->orgId, 999999999);
            $this->fail('a nonexistent booking must be not_found');
        } catch (CancellationException $e) {
            $this->assertSame('not_found', $e->errorCode);
            $this->assertSame(404, $e->status);
        }
    }

    /** Already refunded (by the venue, outside the member's own cancellation) is money already touched, not this endpoint's to touch again. */
    public function test_not_cancellable_because_the_payment_is_already_refunded(): void
    {
        $this->stripe->shouldNotReceive('retrievePaymentIntent');
        $b = $this->appointment(['payment_status' => 'refunded']);

        try {
            $this->cancellation()->cancelService($this->orgId, $b->id);
            $this->fail('an already-refunded booking must not be cancellable here');
        } catch (CancellationException $e) {
            $this->assertSame('not_cancellable', $e->errorCode);
            $this->assertSame(422, $e->status);
        }
        $this->assertSame('confirmed', $b->fresh()->status);
    }

    protected function stay(array $attrs = []): BookingMirror
    {
        static $n = 0;
        $n++;
        return BookingMirror::withoutGlobalScopes()->create(array_merge([
            'organization_id' => $this->orgId, 'reservation_id' => (string) (880000 + $n), 'booking_reference' => 'BK-CANCEL' . $n,
            'booking_state' => 'confirmed', 'internal_status' => 'confirmed', 'apartment_id' => '101', 'apartment_name' => 'Sea view',
            'channel_name' => 'Member portal', 'member_id' => $this->member->id, 'guest_name' => 'Ada Lovelace', 'guest_email' => 'ada@example.test',
            'arrival_date' => now()->addDays(10)->toDateString(), 'departure_date' => now()->addDays(12)->toDateString(),
            'price_total' => 180, 'list_total' => 200, 'discount_amount' => 20, 'payment_status' => 'open', 'payment_method' => 'pay_at_venue',
        ], $attrs));
    }

    protected function freshStay(BookingMirror $m): BookingMirror
    {
        return BookingMirror::withoutGlobalScopes()->findOrFail($m->id);
    }

    public function test_a_stay_paid_at_the_venue_is_cancelled_here_and_at_the_pms(): void
    {
        $this->stripe->shouldNotReceive('retrievePaymentIntent');
        $m = $this->stay();
        $this->smoobu->shouldReceive('cancelReservation')->once()->with($m->reservation_id)->andReturn([]);

        $out = $this->cancellation()->cancelStay($this->orgId, $m->id);

        $this->assertSame('stay', $out->kind);
        $this->assertSame('none', $out->money);
        $this->assertFalse($out->memberMailed);
        $fresh = $this->freshStay($m);
        $this->assertSame('cancelled', $fresh->internal_status);
        $this->assertSame('cancelled', $fresh->booking_state);
        $this->assertSame('member_portal', $fresh->cancellation_reason);
        $this->assertNotNull($fresh->cancelled_at);
        $this->assertSame('open', $fresh->payment_status);
    }

    public function test_a_held_card_on_a_stay_is_released(): void
    {
        $m = $this->stay(['payment_status' => 'authorized', 'payment_method' => 'stripe', 'stripe_payment_intent_id' => 'pi_stay']);
        $this->stripe->shouldReceive('retrievePaymentIntent')->with('pi_stay')->andReturn(PaymentIntent::constructFrom(['id' => 'pi_stay', 'status' => 'requires_capture']));
        $this->stripe->shouldReceive('cancelPaymentIntent')->once()->with('pi_stay', 'requested_by_customer')->andReturn(PaymentIntent::constructFrom(['id' => 'pi_stay', 'status' => 'canceled']));
        $this->stripe->shouldNotReceive('refund');
        $this->smoobu->shouldReceive('cancelReservation')->once()->andReturnUsing(function () use ($m) {
            // Money first, cancel second — the PMS cancel must run after
            // phase 1 has already committed the row as cancelled, not while
            // its transaction (and the row lock) is still open.
            $this->assertSame('cancelled', $this->freshStay($m)->internal_status, 'the PMS cancel must run after the row is committed cancelled');
            return [];
        });

        $out = $this->cancellation()->cancelStay($this->orgId, $m->id);

        $this->assertSame('released', $out->money);
        $this->assertSame(180.0, $out->amount);
        $this->assertSame('cancelled', $this->freshStay($m)->payment_status);
        $this->assertSame('cancelled', $this->freshStay($m)->internal_status);
    }

    public function test_a_paid_stay_is_refunded_through_the_refund_service(): void
    {
        $m = $this->stay(['payment_status' => 'paid', 'payment_method' => 'stripe', 'stripe_payment_intent_id' => 'pi_stay', 'price_paid' => 180]);
        $tx = app(\App\Services\LoyaltyService::class)->awardPoints($this->member, 2700, 'Stay', 'earn', null, 'booking_mirror', $m->id, 180.0, null, null, 'booking_completed', 'booking_mirror', (string) $m->id, "booking_points_stay_{$m->id}");
        $this->stripe->shouldReceive('retrievePaymentIntent')->with('pi_stay')->andReturn(PaymentIntent::constructFrom(['id' => 'pi_stay', 'status' => 'succeeded']));
        $this->stripe->shouldReceive('refund')->once()->with('pi_stay', null, 'requested_by_customer')->andReturn(Refund::constructFrom(['id' => 're_stay', 'status' => 'succeeded']));
        $this->smoobu->shouldReceive('cancelReservation')->once()->with($m->reservation_id)->andReturn([]);

        $out = $this->cancellation()->cancelStay($this->orgId, $m->id);

        $this->assertSame('refunded', $out->money);
        $this->assertSame(180.0, $out->amount);
        $this->assertSame(2700, $out->pointsReversed);
        $this->assertTrue($out->memberMailed);
        $fresh = $this->freshStay($m);
        $this->assertSame('refunded', $fresh->payment_status);
        $this->assertSame('re_stay', $fresh->last_refund_id);
        $this->assertSame('cancelled', $fresh->internal_status);
        $this->assertSame('member_portal', $fresh->cancellation_reason);
        $this->assertTrue((bool) PointsTransaction::findOrFail($tx->id)->is_reversed);
        Mail::assertQueued(BookingRefundMail::class, 1);
        // applyRefund() commits its own RefundAttempt row before it ever
        // calls Stripe — phase 2 runs outside any transaction of ours, so
        // that row survives regardless of what happens afterward.
        $this->assertSame(1, DB::table('refund_attempts')->where('mirror_id', $m->id)->count());
    }

    public function test_a_refund_that_fails_leaves_the_stay_standing(): void
    {
        $claim = $this->claimedOffer('fixed_amount', 20);
        $m = $this->stay(['payment_status' => 'paid', 'payment_method' => 'stripe', 'stripe_payment_intent_id' => 'pi_stay', 'discount_source' => 'offer', 'discount_source_id' => $claim->id]);
        $claim->forceFill(['used_at' => now(), 'status' => 'used', 'used_reference' => $m->booking_reference])->save();
        $this->stripe->shouldReceive('retrievePaymentIntent')->andReturn(PaymentIntent::constructFrom(['id' => 'pi_stay', 'status' => 'succeeded']));
        $this->stripe->shouldReceive('refund')->andThrow(new \RuntimeException('stripe down'));
        $this->smoobu->shouldNotReceive('cancelReservation');

        try {
            $this->cancellation()->cancelStay($this->orgId, $m->id);
            $this->fail('a failed refund must not cancel');
        } catch (CancellationException $e) {
            $this->assertSame('refund_failed', $e->errorCode);
            $this->assertSame(502, $e->status);
        }

        $fresh = $this->freshStay($m);
        $this->assertSame('confirmed', $fresh->internal_status);
        $this->assertSame('paid', $fresh->payment_status);
        $this->assertNull($fresh->cancelled_at);
        $this->assertNotNull(MemberOffer::findOrFail($claim->id)->used_at);
    }

    public function test_a_pms_that_refuses_is_audited_and_the_stay_is_still_cancelled(): void
    {
        $m = $this->stay();
        $this->smoobu->shouldReceive('cancelReservation')->once()->andThrow(new \RuntimeException('Smoobu API error: 500'));

        $this->cancellation()->cancelStay($this->orgId, $m->id);

        $this->assertSame('cancelled', $this->freshStay($m)->internal_status);
        $this->assertSame(1, AuditLog::withoutGlobalScopes()->where('action', 'booking.pms.cancel_failed')->where('subject_id', $m->id)->count());
    }

    public function test_a_stay_the_pms_never_received_is_not_cancelled_there(): void
    {
        $this->smoobu->shouldNotReceive('cancelReservation');
        $m = $this->stay(['reservation_id' => 'LOCAL-ABCDEFGHIJ', 'internal_status' => 'pending_pms_sync']);

        $this->cancellation()->cancelStay($this->orgId, $m->id);

        $this->assertSame('cancelled', $this->freshStay($m)->internal_status);
    }

    public function test_the_stays_coupon_comes_back(): void
    {
        $claim = $this->claimedOffer('fixed_amount', 20);
        $m = $this->stay(['discount_source' => 'offer', 'discount_source_id' => $claim->id]);
        $claim->forceFill(['used_at' => now(), 'status' => 'used', 'used_reference' => $m->booking_reference])->save();
        $this->smoobu->shouldReceive('cancelReservation')->andReturn([]);

        $this->assertTrue($this->cancellation()->cancelStay($this->orgId, $m->id)->couponReleased);
        $this->assertNull(MemberOffer::findOrFail($claim->id)->used_at);
    }

    public function test_a_stay_outside_its_window_on_another_channel_or_in_a_group_is_refused(): void
    {
        $this->smoobu->shouldNotReceive('cancelReservation');
        $cases = [
            'outside_policy'    => $this->stay(['arrival_date' => now()->addDay()->toDateString(), 'departure_date' => now()->addDays(3)->toDateString()]),
            'not_cancellable'   => $this->stay(['channel_name' => 'Booking.com', 'payment_status' => 'channel_managed']),
            'already_cancelled' => $this->stay(['internal_status' => 'cancelled', 'booking_state' => 'cancelled']),
        ];
        foreach ($cases as $code => $stay) {
            try {
                $this->cancellation()->cancelStay($this->orgId, $stay->id);
                $this->fail($code);
            } catch (CancellationException $e) {
                $this->assertSame($code, $e->errorCode);
            }
        }

        try {
            $this->cancellation()->cancelStay($this->orgId, $this->stay(['booking_group_id' => 'a3f0c2de-0000-4000-8000-000000000001'])->id);
            $this->fail('a combination is the venue\'s to cancel');
        } catch (CancellationException $e) {
            $this->assertSame('not_cancellable', $e->errorCode);
        }
    }

    public function test_payments_switched_off_since_the_stay_was_paid_cannot_return_money(): void
    {
        $this->stripe->shouldReceive('isEnabled')->andReturn(false);
        $this->smoobu->shouldNotReceive('cancelReservation');
        $m = $this->stay(['payment_status' => 'paid', 'payment_method' => 'stripe', 'stripe_payment_intent_id' => 'pi_stay']);

        try {
            $this->cancellation()->cancelStay($this->orgId, $m->id);
            $this->fail('no Stripe, no refund');
        } catch (CancellationException $e) {
            $this->assertSame('refund_unavailable', $e->errorCode);
        }
        $this->assertSame('confirmed', $this->freshStay($m)->internal_status);
    }

    /**
     * BookingPointsService::awardForStay() excludes by booking_state and
     * internal_status; a stay cancelStay() cancelled must never be picked
     * up by the points-award command again. Proved
     * against a positive control — the identical fixture, left uncancelled,
     * DOES earn — so the null is shown to come from the cancellation and
     * not from some other gate (loyalty off, points off, payment not
     * collected) that would return null anyway.
     */
    public function test_a_cancelled_stay_is_invisible_to_the_points_command_but_the_same_fixture_uncancelled_earns(): void
    {
        $this->stripe->shouldNotReceive('retrievePaymentIntent');
        $control = $this->stay(['payment_status' => 'paid', 'price_paid' => 180, 'departure_date' => now()->subDay()->toDateString()]);
        $cancelled = $this->stay(['payment_status' => 'paid', 'price_paid' => 180, 'departure_date' => now()->subDay()->toDateString()]);
        $this->smoobu->shouldReceive('cancelReservation')->once()->andReturn([]);

        // Positive control: the identical fixture, never cancelled, earns.
        $earned = app(BookingPointsService::class)->awardForStay($this->freshStay($control));
        $this->assertNotNull($earned, 'the fixture must be one that would otherwise earn, or the null below proves nothing');

        $this->cancellation()->cancelStay($this->orgId, $cancelled->id);

        $this->assertNull(app(BookingPointsService::class)->awardForStay($this->freshStay($cancelled)));
    }

    /** The tenant guard cancelStay() has, mirroring cancelService()'s. */
    public function test_a_mismatched_ambient_tenant_is_refused_before_anything_is_read_for_a_stay(): void
    {
        $this->smoobu->shouldNotReceive('cancelReservation');
        $m = $this->stay();

        try {
            // current_organization_id is bound to $this->orgId by seedPointsFixture(); calling for a different org must be refused before the stay is even looked up.
            $this->cancellation()->cancelStay($this->orgId + 1, $m->id);
            $this->fail('a mismatched ambient tenant must be refused');
        } catch (\LogicException $e) {
            // expected
        }

        $this->assertSame('confirmed', $this->freshStay($m)->internal_status);
    }

    /** With no ambient tenant bound at all, cancelStay() binds one for the duration and restores "not bound" afterward. */
    public function test_with_no_ambient_tenant_cancelstay_binds_one_for_the_duration_and_restores_it(): void
    {
        $m = $this->stay();
        $this->smoobu->shouldReceive('cancelReservation')->once()->andReturn([]);
        app()->forgetInstance('current_organization_id');
        $this->assertFalse(app()->bound('current_organization_id'));

        $out = $this->cancellation()->cancelStay($this->orgId, $m->id);

        $this->assertSame('none', $out->money);
        $this->assertFalse(app()->bound('current_organization_id'), 'the ambient tenant binding must be restored to "not bound" afterward');
    }

    /** A stay id that was never real. */
    public function test_a_nonexistent_stay_id_is_not_found(): void
    {
        $this->stripe->shouldNotReceive('retrievePaymentIntent');
        $this->smoobu->shouldNotReceive('cancelReservation');

        try {
            $this->cancellation()->cancelStay($this->orgId, 999999999);
            $this->fail('a nonexistent stay must be not_found');
        } catch (CancellationException $e) {
            $this->assertSame('not_found', $e->errorCode);
            $this->assertSame(404, $e->status);
        }
    }

    /** A stay looked up under an $orgId that doesn't own it — the ambient tenant must be unbound first, or this exercises the guard above instead. */
    public function test_a_stay_looked_up_under_another_organisation_is_not_found(): void
    {
        $this->smoobu->shouldNotReceive('cancelReservation');
        $m = $this->stay();
        app()->forgetInstance('current_organization_id');

        try {
            $this->cancellation()->cancelStay($this->orgId + 1, $m->id);
            $this->fail('another organisation');
        } catch (CancellationException $e) {
            $this->assertSame('not_found', $e->errorCode);
        }
        $this->assertSame('confirmed', $this->freshStay($m)->internal_status);
    }

    /** A second, concurrent cancel of the same stay fails fast instead of queueing behind the first. */
    public function test_cancel_in_progress_when_the_cache_lock_is_held(): void
    {
        $this->smoobu->shouldNotReceive('cancelReservation');
        $m = $this->stay();
        $held = Cache::lock("portal-cancel:stay:{$m->id}", 60);
        $this->assertTrue($held->get());

        try {
            $this->cancellation()->cancelStay($this->orgId, $m->id);
            $this->fail('a concurrent cancel must be refused');
        } catch (CancellationException $e) {
            $this->assertSame('cancel_in_progress', $e->errorCode);
            $this->assertSame(409, $e->status);
        } finally {
            $held->release();
        }
        $this->assertSame('confirmed', $this->freshStay($m)->internal_status);
    }

    /** Stripe's own "the intent is already canceled" is recorded as released, with no second cancelPaymentIntent call. */
    public function test_an_intent_already_canceled_is_recorded_as_released(): void
    {
        $m = $this->stay(['payment_status' => 'authorized', 'payment_method' => 'stripe', 'stripe_payment_intent_id' => 'pi_stay']);
        $this->stripe->shouldReceive('retrievePaymentIntent')->with('pi_stay')->andReturn(PaymentIntent::constructFrom(['id' => 'pi_stay', 'status' => 'canceled']));
        $this->stripe->shouldNotReceive('cancelPaymentIntent');
        $this->stripe->shouldNotReceive('refund');
        $this->smoobu->shouldReceive('cancelReservation')->once()->andReturn([]);

        $out = $this->cancellation()->cancelStay($this->orgId, $m->id);

        $this->assertSame('released', $out->money);
        $this->assertSame('cancelled', $this->freshStay($m)->payment_status);
    }

    /** cancelPaymentIntent() itself failing is a 502, and the stay stands. */
    public function test_cancel_payment_intent_failing_leaves_the_stay_standing(): void
    {
        $m = $this->stay(['payment_status' => 'authorized', 'payment_method' => 'stripe', 'stripe_payment_intent_id' => 'pi_stay']);
        $this->stripe->shouldReceive('retrievePaymentIntent')->with('pi_stay')->andReturn(PaymentIntent::constructFrom(['id' => 'pi_stay', 'status' => 'requires_capture']));
        $this->stripe->shouldReceive('cancelPaymentIntent')->once()->andThrow(new \RuntimeException('stripe down'));
        $this->smoobu->shouldNotReceive('cancelReservation');

        try {
            $this->cancellation()->cancelStay($this->orgId, $m->id);
            $this->fail('a failed cancelPaymentIntent must not cancel');
        } catch (CancellationException $e) {
            $this->assertSame('refund_failed', $e->errorCode);
            $this->assertSame(502, $e->status);
        }

        $fresh = $this->freshStay($m);
        $this->assertSame('confirmed', $fresh->internal_status);
        $this->assertSame('authorized', $fresh->payment_status);
    }

    /** retrievePaymentIntent() itself failing is a 502, and the stay stands. */
    public function test_retrieve_payment_intent_failing_returns_502(): void
    {
        $m = $this->stay(['payment_status' => 'authorized', 'payment_method' => 'stripe', 'stripe_payment_intent_id' => 'pi_stay']);
        $this->stripe->shouldReceive('retrievePaymentIntent')->with('pi_stay')->andThrow(new \RuntimeException('stripe down'));
        $this->smoobu->shouldNotReceive('cancelReservation');

        try {
            $this->cancellation()->cancelStay($this->orgId, $m->id);
            $this->fail('a failed retrievePaymentIntent must not cancel');
        } catch (CancellationException $e) {
            $this->assertSame('refund_failed', $e->errorCode);
            $this->assertSame(502, $e->status);
        }

        $this->assertSame('confirmed', $this->freshStay($m)->internal_status);
    }

    /** A refund on a stay with a coupon releases it. */
    public function test_a_refund_on_a_stay_with_a_coupon_releases_it(): void
    {
        $claim = $this->claimedOffer('fixed_amount', 20);
        $m = $this->stay(['payment_status' => 'paid', 'payment_method' => 'stripe', 'stripe_payment_intent_id' => 'pi_stay', 'discount_source' => 'offer', 'discount_source_id' => $claim->id]);
        $claim->forceFill(['used_at' => now(), 'status' => 'used', 'used_reference' => $m->booking_reference])->save();
        $this->stripe->shouldReceive('retrievePaymentIntent')->with('pi_stay')->andReturn(PaymentIntent::constructFrom(['id' => 'pi_stay', 'status' => 'succeeded']));
        $this->stripe->shouldReceive('refund')->once()->with('pi_stay', null, 'requested_by_customer')->andReturn(Refund::constructFrom(['id' => 're_stay2', 'status' => 'succeeded']));
        $this->smoobu->shouldReceive('cancelReservation')->once()->andReturn([]);

        $out = $this->cancellation()->cancelStay($this->orgId, $m->id);

        $this->assertTrue($out->couponReleased);
        $this->assertNull(MemberOffer::findOrFail($claim->id)->used_at);
    }

    /** Stripe answers a refund call with "the charge is already refunded" (dashboard, or an earlier attempt whose write failed) — recorded as refunded without a second refund() call. */
    public function test_a_charge_already_refunded_at_stripe_is_recorded_without_a_second_stripe_call(): void
    {
        $m = $this->stay(['payment_status' => 'paid', 'payment_method' => 'stripe', 'stripe_payment_intent_id' => 'pi_stay']);
        $this->stripe->shouldReceive('retrievePaymentIntent')->with('pi_stay')->andReturn(PaymentIntent::constructFrom(['id' => 'pi_stay', 'status' => 'succeeded']));
        $this->stripe->shouldReceive('refund')->once()->with('pi_stay', null, 'requested_by_customer')->andThrow(
            \Stripe\Exception\InvalidRequestException::factory('The charge ch_1 has already been refunded.', 400, null, null, null, 'charge_already_refunded')
        );
        $this->smoobu->shouldReceive('cancelReservation')->once()->with($m->reservation_id)->andReturn([]);

        $out = $this->cancellation()->cancelStay($this->orgId, $m->id);

        $this->assertSame('refunded', $out->money);
        $fresh = $this->freshStay($m);
        $this->assertSame('refunded', $fresh->payment_status);
        $this->assertSame('cancelled', $fresh->internal_status);
        $this->assertNull($fresh->last_refund_id);
        Mail::assertQueued(BookingRefundMail::class, 1);
    }

    /**
     * A failure between the refund (already committed at Stripe and
     * locally by applyRefund()) and the final
     * write is not silently absorbed — it must reach the caller as an
     * error, leaving the stay refunded-but-not-cancelled — and is healed
     * by the member simply cancelling again: the second call recognises
     * the money is already back in full and finishes without calling
     * Stripe a second time or sending a second mail.
     */
    public function test_a_failure_after_the_refund_is_healed_by_cancelling_again(): void
    {
        $claim = $this->claimedOffer('fixed_amount', 20);
        $m = $this->stay(['payment_status' => 'paid', 'payment_method' => 'stripe', 'stripe_payment_intent_id' => 'pi_stay', 'discount_source' => 'offer', 'discount_source_id' => $claim->id]);
        $claim->forceFill(['used_at' => now(), 'status' => 'used', 'used_reference' => $m->booking_reference])->save();
        $this->stripe->shouldReceive('retrievePaymentIntent')->with('pi_stay')->andReturn(PaymentIntent::constructFrom(['id' => 'pi_stay', 'status' => 'succeeded']));
        $this->stripe->shouldReceive('refund')->once()->with('pi_stay', null, 'requested_by_customer')->andReturn(Refund::constructFrom(['id' => 're_stay', 'status' => 'succeeded']));
        $this->smoobu->shouldReceive('cancelReservation')->once()->with($m->reservation_id)->andReturn([]);

        // Simulate a failure in phase 3 (after the refund has already gone
        // through and committed): a model event throws the first time
        // BookingMirror is saved with internal_status becoming 'cancelled'
        // for this row — that is phase 3's own save(), never phase 2's
        // (applyRefund() never touches internal_status), so it does not
        // fire during the refund itself. The retry's save succeeds.
        $attempts = 0;
        BookingMirror::saving(function ($model) use ($m, &$attempts) {
            if ((int) $model->getKey() === $m->id && $model->internal_status === 'cancelled' && ++$attempts === 1) {
                throw new \RuntimeException('simulated phase 3 failure');
            }
        });

        try {
            $this->cancellation()->cancelStay($this->orgId, $m->id);
            $this->fail('a phase 3 failure must surface as an error, not be swallowed');
        } catch (\Throwable $e) {
            // expected: not swallowed
        }

        $fresh = $this->freshStay($m);
        $this->assertSame('refunded', $fresh->payment_status, 'the refund itself must stand — it already happened at Stripe');
        $this->assertNotSame('cancelled', $fresh->internal_status, 'phase 3 rolled back, so the cancellation itself must not have been recorded');

        $out = $this->cancellation()->cancelStay($this->orgId, $m->id);

        $this->assertSame('refunded', $out->money);
        $this->assertSame(180.0, $out->amount);
        $this->assertTrue($out->couponReleased);
        $this->assertFalse($out->memberMailed, 'the convergence path sends no second mail — the first call already did');
        $this->assertSame('cancelled', $this->freshStay($m)->internal_status);
        Mail::assertQueued(BookingRefundMail::class, 1);
    }

    /** An appointment whose money is already back in full, but which was never cancelled, is finished with no Stripe call. */
    public function test_a_fully_refunded_appointment_that_was_never_cancelled_is_finished_without_stripe(): void
    {
        $this->stripe->shouldNotReceive('retrievePaymentIntent');
        $this->stripe->shouldNotReceive('refund');
        $this->stripe->shouldNotReceive('cancelPaymentIntent');
        $claim = $this->claimedOffer('fixed_amount', 6);
        $b = $this->appointment(['booking_reference' => 'SVC-CONV0001', 'payment_status' => 'refunded', 'refunded_amount' => 54, 'stripe_payment_intent_id' => 'pi_paid', 'last_refund_id' => 're_hook', 'discount_source' => 'offer', 'discount_source_id' => $claim->id]);
        $claim->forceFill(['used_at' => now(), 'status' => 'used', 'used_reference' => 'SVC-CONV0001'])->save();
        app(\App\Services\LoyaltyService::class)->awardPoints($this->member, 810, 'Appointment', 'earn', null, 'service_booking', $b->id, 54.0, null, null, 'booking_completed', 'service_booking', (string) $b->id, "booking_points_service_{$b->id}");

        $out = $this->cancellation()->cancelService($this->orgId, $b->id);

        $this->assertSame('refunded', $out->money);
        $this->assertSame(54.0, $out->amount);
        $this->assertTrue($out->couponReleased);
        $this->assertSame(810, $out->pointsReversed);
        $fresh = $b->fresh();
        $this->assertSame('cancelled', $fresh->status);
        $this->assertSame('member_portal', $fresh->cancellation_reason);
        $this->assertSame('refunded', $fresh->payment_status, 'the money columns are left as recorded');
        $this->assertSame('re_hook', $fresh->last_refund_id);
        $this->assertNull(MemberOffer::findOrFail($claim->id)->used_at);
    }

    /** Partially refunded, disputed, or "refunded" for less than the total is still not the member's to cancel; a full refund still obeys the deadline and the status. */
    public function test_a_partial_or_disputed_refund_is_still_not_cancellable_and_a_full_one_still_obeys_the_policy(): void
    {
        $this->stripe->shouldNotReceive('retrievePaymentIntent');
        $cases = [
            'not_cancellable'   => [
                $this->appointment(['payment_status' => 'partially_refunded', 'refunded_amount' => 20]),
                $this->appointment(['payment_status' => 'refunded', 'refunded_amount' => 20]),
                $this->appointment(['payment_status' => 'disputed']),
            ],
            'outside_policy'    => [$this->appointment(['payment_status' => 'refunded', 'refunded_amount' => 54, 'start_at' => now()->addHours(5), 'end_at' => now()->addHours(6)])],
            'already_cancelled' => [$this->appointment(['payment_status' => 'refunded', 'refunded_amount' => 54, 'status' => 'cancelled'])],
        ];
        foreach ($cases as $code => $bookings) {
            foreach ($bookings as $b) {
                try {
                    $this->cancellation()->cancelService($this->orgId, $b->id);
                    $this->fail($code);
                } catch (CancellationException $e) {
                    $this->assertSame($code, $e->errorCode);
                }
                $this->assertNull($b->fresh()->cancellation_reason);
            }
        }
    }

    /**
     * The retry after a failure between the refund and the last write is
     * decided on cancelled_at, not internal_status — the PMS sync marks the
     * stay cancelled within seconds of the refund path's PMS cancellation,
     * and deciding on internal_status there would wrongly answer
     * already_cancelled, leaving the coupon unreturned.
     */
    public function test_a_refunded_stay_the_pms_sync_already_marked_cancelled_is_finished_by_the_retry(): void
    {
        $this->stripe->shouldNotReceive('retrievePaymentIntent');
        $this->stripe->shouldNotReceive('refund');
        $this->smoobu->shouldNotReceive('cancelReservation');
        $claim = $this->claimedOffer('fixed_amount', 20);
        $m = $this->stay(['payment_status' => 'refunded', 'refunded_amount' => 180, 'payment_method' => 'stripe', 'stripe_payment_intent_id' => 'pi_stay', 'internal_status' => 'cancelled', 'booking_state' => 'cancelled', 'discount_source' => 'offer', 'discount_source_id' => $claim->id]);
        $this->memberStartedMarker($m); // The refund is the member's own cancellation's, not staff's.
        $claim->forceFill(['used_at' => now(), 'status' => 'used', 'used_reference' => $m->booking_reference])->save();

        $out = $this->cancellation()->cancelStay($this->orgId, $m->id);

        $this->assertSame('refunded', $out->money);
        $this->assertSame(180.0, $out->amount);
        $this->assertTrue($out->couponReleased);
        $this->assertTrue($out->pmsCancelled, 'the row already says the PMS reservation is cancelled');
        $this->assertNotNull($this->freshStay($m)->cancelled_at);
        $this->assertNull(MemberOffer::findOrFail($claim->id)->used_at);
        $this->assertSame(1, AuditLog::withoutGlobalScopes()->where('action', 'booking.member_cancelled')->where('subject_id', $m->id)->count());
    }

    /** cancelled_at set means the member's cancellation finished, whatever the PMS sync has written since. */
    public function test_a_stay_with_cancelled_at_set_is_already_cancelled_whatever_its_status_says(): void
    {
        $this->stripe->shouldNotReceive('retrievePaymentIntent');
        $this->smoobu->shouldNotReceive('cancelReservation');
        $m = $this->stay(['cancelled_at' => now()->subHour(), 'cancellation_reason' => 'member_portal', 'internal_status' => 'confirmed', 'booking_state' => 'confirmed']);

        try {
            $this->cancellation()->cancelStay($this->orgId, $m->id);
            $this->fail('already cancelled');
        } catch (CancellationException $e) {
            $this->assertSame('already_cancelled', $e->errorCode);
        }
        $this->assertSame(0, AuditLog::withoutGlobalScopes()->where('action', 'booking.member_cancelled')->where('subject_id', $m->id)->count());
    }

    /** A staff partial refund that lands between phase 1 and the refund is not refunded on top of — not_cancellable, no Stripe refund. */
    public function test_a_partial_refund_landing_between_the_check_and_the_refund_stops_the_cancellation(): void
    {
        $m = $this->stay(['payment_status' => 'paid', 'payment_method' => 'stripe', 'stripe_payment_intent_id' => 'pi_stay']);
        $this->stripe->shouldReceive('retrievePaymentIntent')->with('pi_stay')->andReturnUsing(function () use ($m) {
            // Staff refund 50 while phase 1 is reading Stripe; it commits
            // with phase 1, before phase 2's own fresh read.
            DB::table('booking_mirror')->where('id', $m->id)->update(['payment_status' => 'partially_refunded', 'refunded_amount' => 50]);
            return PaymentIntent::constructFrom(['id' => 'pi_stay', 'status' => 'succeeded']);
        });
        $this->stripe->shouldNotReceive('refund');
        $this->smoobu->shouldNotReceive('cancelReservation');

        try {
            $this->cancellation()->cancelStay($this->orgId, $m->id);
            $this->fail('a partially refunded stay must not be refunded again');
        } catch (CancellationException $e) {
            $this->assertSame('not_cancellable', $e->errorCode);
        }
        $fresh = $this->freshStay($m);
        $this->assertNull($fresh->cancelled_at);
        $this->assertEquals(50.0, (float) $fresh->refunded_amount);
        $this->assertSame(0, DB::table('refund_attempts')->where('mirror_id', $m->id)->count());
    }

    /** Stripe says "already refunded" and the webhook has recorded it meanwhile — straight to phase 3, no second applyRefund(). */
    public function test_charge_already_refunded_with_the_refund_already_recorded_goes_straight_to_the_last_step(): void
    {
        $m = $this->stay(['payment_status' => 'paid', 'payment_method' => 'stripe', 'stripe_payment_intent_id' => 'pi_stay']);
        $this->stripe->shouldReceive('retrievePaymentIntent')->with('pi_stay')->andReturn(PaymentIntent::constructFrom(['id' => 'pi_stay', 'status' => 'succeeded']));
        $this->stripe->shouldReceive('refund')->once()->andReturnUsing(function () use ($m) {
            DB::table('booking_mirror')->where('id', $m->id)->update(['payment_status' => 'refunded', 'refunded_amount' => 180, 'last_refund_id' => 're_hook']);
            throw \Stripe\Exception\InvalidRequestException::factory('The charge ch_1 has already been refunded.', 400, null, null, null, 'charge_already_refunded');
        });
        $this->smoobu->shouldNotReceive('cancelReservation');

        $out = $this->cancellation()->cancelStay($this->orgId, $m->id);

        $this->assertSame('refunded', $out->money);
        $this->assertSame(180.0, $out->amount);
        $fresh = $this->freshStay($m);
        $this->assertNotNull($fresh->cancelled_at);
        $this->assertSame('re_hook', $fresh->last_refund_id, 'nothing re-recorded the refund');
        $this->assertSame(1, DB::table('refund_attempts')->where('mirror_id', $m->id)->count(), 'the failed first attempt only — no second applyRefund()');
        Mail::assertNotQueued(BookingRefundMail::class);
    }

    /** Phase 3 re-checks cancelled_at under its row lock — a cancellation finished meanwhile elsewhere gets no second audit row and no second coupon release. */
    public function test_the_last_step_does_not_write_twice_when_another_cancel_finished_meanwhile(): void
    {
        $claim = $this->claimedOffer('fixed_amount', 20);
        $m = $this->stay(['payment_status' => 'paid', 'payment_method' => 'stripe', 'stripe_payment_intent_id' => 'pi_stay', 'discount_source' => 'offer', 'discount_source_id' => $claim->id]);
        $claim->forceFill(['used_at' => now(), 'status' => 'used', 'used_reference' => $m->booking_reference])->save();
        $this->stripe->shouldReceive('retrievePaymentIntent')->with('pi_stay')->andReturn(PaymentIntent::constructFrom(['id' => 'pi_stay', 'status' => 'succeeded']));
        $this->stripe->shouldReceive('refund')->once()->andReturnUsing(function () use ($m) {
            // Another app instance finishes the same cancellation while this one is at Stripe.
            DB::table('booking_mirror')->where('id', $m->id)->update(['cancelled_at' => now(), 'cancellation_reason' => 'member_portal']);
            return Refund::constructFrom(['id' => 're_stay', 'status' => 'succeeded']);
        });
        $this->smoobu->shouldReceive('cancelReservation')->andReturn([]);

        try {
            $this->cancellation()->cancelStay($this->orgId, $m->id);
            $this->fail('the second finisher must stop');
        } catch (CancellationException $e) {
            $this->assertSame('already_cancelled', $e->errorCode);
        }
        $this->assertSame(0, AuditLog::withoutGlobalScopes()->where('action', 'booking.member_cancelled')->where('subject_id', $m->id)->count());
        $this->assertNotNull(MemberOffer::findOrFail($claim->id)->used_at, 'not released a second time by this call');
    }

    /** The convergence path counts the points the earlier refund reversed, like every other path. */
    public function test_points_reversed_are_counted_the_same_way_on_the_convergence_path(): void
    {
        $m = $this->stay(['payment_status' => 'refunded', 'refunded_amount' => 180, 'payment_method' => 'stripe', 'stripe_payment_intent_id' => 'pi_stay', 'booking_state' => 'cancelled']);
        $this->memberStartedMarker($m); // The refund is the member's own cancellation's, not staff's.
        $tx = app(\App\Services\LoyaltyService::class)->awardPoints($this->member, 2700, 'Stay', 'earn', null, 'booking_mirror', $m->id, 180.0, null, null, 'booking_completed', 'booking_mirror', (string) $m->id, "booking_points_stay_{$m->id}");
        app(\App\Services\LoyaltyService::class)->reverseTransaction($tx, 'Booking refunded'); // what the earlier applyRefund() did
        $this->stripe->shouldNotReceive('refund');

        $this->assertSame(2700, $this->cancellation()->cancelStay($this->orgId, $m->id)->pointsReversed);
    }

    /** The PMS result travels in the outcome — true, false (refused), null (nothing there to cancel) — on the released/none and the refunded paths. */
    public function test_the_outcome_carries_what_the_pms_said(): void
    {
        $ok = $this->stay();
        $refused = $this->stay();
        $local = $this->stay(['reservation_id' => 'LOCAL-ABCDEFGHIJ', 'internal_status' => 'pending_pms_sync']);
        $paid = $this->stay(['payment_status' => 'paid', 'payment_method' => 'stripe', 'stripe_payment_intent_id' => 'pi_stay']);
        $this->smoobu->shouldReceive('cancelReservation')->with($ok->reservation_id)->andReturn([]);
        $this->smoobu->shouldReceive('cancelReservation')->with($refused->reservation_id)->andThrow(new \RuntimeException('Smoobu API error: 500'));
        $this->smoobu->shouldReceive('cancelReservation')->with($paid->reservation_id)->andThrow(new \RuntimeException('cURL error 28'));
        $this->stripe->shouldReceive('retrievePaymentIntent')->with('pi_stay')->andReturn(PaymentIntent::constructFrom(['id' => 'pi_stay', 'status' => 'succeeded']));
        $this->stripe->shouldReceive('refund')->once()->andReturn(Refund::constructFrom(['id' => 're_stay', 'status' => 'succeeded']));

        $this->assertTrue($this->cancellation()->cancelStay($this->orgId, $ok->id)->pmsCancelled);
        $this->assertFalse($this->cancellation()->cancelStay($this->orgId, $refused->id)->pmsCancelled);
        $this->assertNull($this->cancellation()->cancelStay($this->orgId, $local->id)->pmsCancelled);
        $this->assertFalse($this->cancellation()->cancelStay($this->orgId, $paid->id)->pmsCancelled);
        $this->assertNull($this->cancellation()->cancelService($this->orgId, $this->appointment()->id)->pmsCancelled);
        $this->assertArrayNotHasKey('pms_cancelled', $this->cancellation()->cancelService($this->orgId, $this->appointment(['start_at' => now()->addDays(5), 'end_at' => now()->addDays(5)->addHour()])->id)->toArray());
    }

    /**
     * A stay's coupon carries BM:{mirror id}, which survives the PMS sync /
     * bookings:retry-pms-sync rewriting booking_reference; a stay whose
     * coupon reference is the legacy booking reference instead still gets
     * its coupon back.
     */
    public function test_the_stays_coupon_comes_back_by_its_mirror_reference_after_the_booking_reference_changed(): void
    {
        $this->smoobu->shouldReceive('cancelReservation')->andReturn([]);
        $offer = $this->claimedOffer('fixed_amount', 20);
        $m = $this->stay(['discount_source' => 'offer', 'discount_source_id' => $offer->id]);
        $offer->forceFill(['used_at' => now(), 'status' => 'used', 'used_reference' => 'BM:' . $m->id])->save();
        DB::table('booking_mirror')->where('id', $m->id)->update(['booking_reference' => 'BK-REWRITTEN']);

        $this->assertTrue($this->cancellation()->cancelStay($this->orgId, $m->id)->couponReleased);
        $this->assertNull(MemberOffer::findOrFail($offer->id)->used_at);

        $legacy = $this->claimedOffer('fixed_amount', 20);
        $old = $this->stay(['discount_source' => 'offer', 'discount_source_id' => $legacy->id]);
        $legacy->forceFill(['used_at' => now(), 'status' => 'used', 'used_reference' => $old->booking_reference])->save();

        $this->assertTrue($this->cancellation()->cancelStay($this->orgId, $old->id)->couponReleased);
        $this->assertNull(MemberOffer::findOrFail($legacy->id)->used_at);
    }

    /** The marker cancelStay() commits right before it asks for a captured stay's refund. */
    private function memberStartedMarker(BookingMirror $m): void
    {
        AuditLog::create(['organization_id' => $this->orgId, 'action' => MemberCancellation::STARTED, 'subject_type' => 'booking_mirror', 'subject_id' => $m->id, 'description' => 'test marker']);
    }

    /**
     * A stay staff cancelled and refunded (statuses cancelled, refunded in
     * full, no marker of the member's own cancellation) is not the
     * member's to stamp — already_cancelled, nothing written.
     */
    public function test_a_stay_staff_cancelled_and_refunded_is_already_cancelled_and_nothing_is_written(): void
    {
        $this->stripe->shouldNotReceive('retrievePaymentIntent');
        $this->stripe->shouldNotReceive('refund');
        $this->smoobu->shouldNotReceive('cancelReservation');
        $claim = $this->claimedOffer('fixed_amount', 20);
        $m = $this->stay(['payment_status' => 'refunded', 'refunded_amount' => 180, 'payment_method' => 'stripe', 'stripe_payment_intent_id' => 'pi_stay', 'internal_status' => 'cancelled', 'booking_state' => 'cancelled', 'discount_source' => 'offer', 'discount_source_id' => $claim->id]);
        $claim->forceFill(['used_at' => now(), 'status' => 'used', 'used_reference' => 'BM:' . $m->id])->save();
        $before = $this->freshStay($m)->getAttributes();

        try {
            $this->cancellation()->cancelStay($this->orgId, $m->id);
            $this->fail('a staff-cancelled, refunded stay is not the member\'s to cancel');
        } catch (CancellationException $e) {
            $this->assertSame('already_cancelled', $e->errorCode);
            $this->assertSame(409, $e->status);
        }

        $this->assertSame($before, $this->freshStay($m)->getAttributes());
        $this->assertNotNull(MemberOffer::findOrFail($claim->id)->used_at);
        $this->assertSame(0, AuditLog::withoutGlobalScopes()->where('action', 'booking.member_cancelled')->where('subject_id', $m->id)->count());
        $this->assertFalse(\App\Services\Portal\MemberBookingQuery::stayDto($this->freshStay($m))['can_cancel']);
    }

    /** A refund recorded on a stay that still stands (dashboard / webhook) converges with no marker, like an appointment's. */
    public function test_a_refund_recorded_on_a_stay_that_still_stands_converges_without_a_marker(): void
    {
        $this->stripe->shouldNotReceive('refund');
        $this->smoobu->shouldNotReceive('cancelReservation');
        $m = $this->stay(['payment_status' => 'refunded', 'refunded_amount' => 180, 'payment_method' => 'stripe', 'stripe_payment_intent_id' => 'pi_stay']);

        $out = $this->cancellation()->cancelStay($this->orgId, $m->id);

        $this->assertSame('refunded', $out->money);
        $this->assertNotNull($this->freshStay($m)->cancelled_at);
    }

    /** The marker is committed before applyRefund() asks Stripe for the refund. */
    public function test_the_member_path_commits_its_marker_before_the_refund(): void
    {
        $m = $this->stay(['payment_status' => 'paid', 'payment_method' => 'stripe', 'stripe_payment_intent_id' => 'pi_stay']);
        $this->stripe->shouldReceive('retrievePaymentIntent')->with('pi_stay')->andReturn(PaymentIntent::constructFrom(['id' => 'pi_stay', 'status' => 'succeeded']));
        $this->stripe->shouldReceive('refund')->once()->andReturnUsing(function () use ($m) {
            $this->assertSame(1, AuditLog::withoutGlobalScopes()->where('action', MemberCancellation::STARTED)->where('subject_id', $m->id)->count(), 'written before the refund');
            $this->assertSame(0, DB::transactionLevel() - $this->baseLevel, 'and not inside a transaction of ours');
            return Refund::constructFrom(['id' => 're_stay', 'status' => 'succeeded']);
        });
        $this->smoobu->shouldReceive('cancelReservation')->andReturn([]);
        $this->baseLevel = DB::transactionLevel();

        $this->assertSame('refunded', $this->cancellation()->cancelStay($this->orgId, $m->id)->money);
    }

    private int $baseLevel = 0;

    /**
     * The booking DTO offers "Cancel booking" for exactly what the cancel
     * endpoint would finish — a refunded stay of our own cancellation, an
     * appointment refunded in full that still stands.
     */
    public function test_the_booking_dto_offers_a_cancel_the_endpoint_would_finish(): void
    {
        $ours = $this->stay(['payment_status' => 'refunded', 'refunded_amount' => 180, 'payment_method' => 'stripe', 'stripe_payment_intent_id' => 'pi_stay', 'internal_status' => 'cancelled', 'booking_state' => 'cancelled']);
        $this->memberStartedMarker($ours);
        $appointment = $this->appointment(['payment_status' => 'refunded', 'refunded_amount' => 54, 'stripe_payment_intent_id' => 'pi_paid']);

        $this->assertTrue(\App\Services\Portal\MemberBookingQuery::stayDto($this->freshStay($ours))['can_cancel']);
        $this->assertNotNull(\App\Services\Portal\MemberBookingQuery::stayDto($this->freshStay($ours))['cancel_deadline']);
        $this->assertTrue(\App\Services\Portal\MemberBookingQuery::serviceDto($appointment->fresh())['can_cancel']);
        $this->assertFalse(\App\Services\Portal\MemberBookingQuery::serviceDto($this->appointment(['payment_status' => 'refunded', 'refunded_amount' => 54, 'status' => 'cancelled'])->fresh())['can_cancel']);
    }

    /** Every successful member cancellation writes exactly one booking.member_cancelled audit row. */
    public function test_one_member_cancelled_audit_row_per_cancellation(): void
    {
        $m = $this->stay();
        $this->smoobu->shouldReceive('cancelReservation')->once()->andReturn([]);

        $this->cancellation()->cancelStay($this->orgId, $m->id);

        $this->assertSame(1, AuditLog::withoutGlobalScopes()->where('action', 'booking.member_cancelled')->where('subject_id', $m->id)->count());
    }
}
