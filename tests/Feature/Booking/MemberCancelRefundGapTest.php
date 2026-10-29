<?php

namespace Tests\Feature\Booking;

use App\Models\AuditLog;
use App\Models\BookingMirror;
use App\Models\Organization;
use App\Services\Booking\MemberCancellation;
use App\Services\SmoobuClient;
use App\Services\StripeService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Mockery;
use Stripe\PaymentIntent;
use Stripe\Refund;
use Tests\Concerns\SeedsDiscountFixture;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\Concerns\SetsUpServiceBookingSchema;
use Tests\Concerns\SetsUpStayBookingSchema;
use Tests\TestCase;

/**
 * Release 6, item 2, as a member's stay cancellation sees it: applyRefund()
 * now reads the stay again once it holds the payment's refund lock. A refund
 * the `charge.refunded` webhook recorded in the gap between the cancellation's
 * own read and that lock (a dashboard refund, say) is refused there as already
 * done — no second refund is asked of Stripe — and the cancellation finishes
 * with the money already back in full, as a retry would. A partial refund in
 * the gap: the rest is refunded and the stay recorded at its own total.
 * Rows are written as production's schema takes them.
 */
class MemberCancelRefundGapTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema, SetsUpServiceBookingSchema, SetsUpStayBookingSchema, SeedsDiscountFixture;

    // $orgId: SeedsDiscountFixture's own property, set in setUp().
    private $stripe;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpMinimalSchema();
        $this->setUpLoyaltyAwardSchema();
        $this->setUpServiceBookingSchema();
        $this->setUpStayBookingSchema();
        $this->setUpDiscountTables();
        Mail::fake();
        $this->orgId = Organization::create(['name' => 'Seaside Hotel', 'slug' => 'seaside-' . uniqid()])->id;
        app()->instance('current_organization_id', $this->orgId);

        $this->stripe = Mockery::mock(StripeService::class);
        $this->stripe->shouldReceive('isEnabled')->andReturn(true);
        $this->stripe->shouldReceive('retrievePaymentIntent')->andReturn(PaymentIntent::constructFrom(['id' => 'pi_gap', 'status' => 'succeeded']));
        $this->app->instance(StripeService::class, $this->stripe);
        $smoobu = Mockery::mock(SmoobuClient::class);
        $smoobu->shouldReceive('cancelReservation')->andReturn([]);
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

    private function stay(): BookingMirror
    {
        return BookingMirror::withoutGlobalScopes()->create([
            'organization_id' => $this->orgId, 'reservation_id' => '880901', 'booking_reference' => 'BK-GAP1',
            'booking_state' => 'confirmed', 'internal_status' => 'confirmed', 'apartment_id' => '101', 'apartment_name' => 'Sea view',
            'channel_name' => 'Member portal', 'member_id' => 41, 'guest_name' => 'Ada Lovelace', 'guest_email' => 'ada@example.test',
            'arrival_date' => now()->addDays(10)->toDateString(), 'departure_date' => now()->addDays(12)->toDateString(),
            'price_total' => 180, 'price_paid' => 180, 'payment_status' => 'paid', 'payment_method' => 'stripe', 'stripe_payment_intent_id' => 'pi_gap',
        ]);
    }

    /** The webhook records a refund right after the cancellation wrote its "started" marker, before the refund lock is taken. */
    private function webhookRecordsInTheGap(BookingMirror $m, float $amount, string $status): void
    {
        AuditLog::created(function (AuditLog $row) use ($m, $amount, $status) {
            if ($row->action === 'booking.member_cancel_started' && (int) $row->subject_id === $m->id) {
                DB::table('booking_mirror')->where('id', $m->id)->update(['payment_status' => $status, 'refunded_amount' => $amount, 'refunded_at' => now(), 'last_refund_id' => 're_dashboard']);
            }
        });
    }

    public function test_a_refund_recorded_in_the_gap_finishes_the_cancellation_without_a_second_refund(): void
    {
        $m = $this->stay();
        $this->webhookRecordsInTheGap($m, 180, 'refunded');
        $this->stripe->shouldNotReceive('refund');

        $out = app(MemberCancellation::class)->cancelStay($this->orgId, $m->id);

        $this->assertSame('refunded', $out->money);
        $this->assertSame(180.0, $out->amount);
        $fresh = BookingMirror::withoutGlobalScopes()->findOrFail($m->id);
        $this->assertNotNull($fresh->cancelled_at);
        $this->assertSame('cancelled', $fresh->internal_status);
        $this->assertSame('re_dashboard', $fresh->last_refund_id, 'the one refund, recorded once');
        $this->assertSame(0, DB::table('audit_logs')->where('action', 'booking_refunded')->count(), 'nothing recorded a second time');
    }

    /**
     * A partial refund recorded in the gap: the rest is refunded (Stripe gives back what is left of the charge) and the
     * stay is recorded at its own total — never above it, as the stale row would have had it.
     */
    public function test_a_partial_refund_in_the_gap_is_completed_and_recorded_at_the_stays_total(): void
    {
        $m = $this->stay();
        $this->webhookRecordsInTheGap($m, 50, 'partially_refunded');
        $this->stripe->shouldReceive('refund')->once()->with('pi_gap', null, 'requested_by_customer', \Mockery::any(), \Mockery::any(), \Mockery::any())->andReturn(Refund::constructFrom(['id' => 're_rest', 'status' => 'succeeded', 'object' => 'refund', 'amount' => 13000, 'currency' => 'eur']));

        $out = app(MemberCancellation::class)->cancelStay($this->orgId, $m->id);

        $this->assertSame('refunded', $out->money);
        $fresh = BookingMirror::withoutGlobalScopes()->findOrFail($m->id);
        $this->assertSame('refunded', $fresh->payment_status);
        $this->assertEquals(180.0, (float) $fresh->refunded_amount, '50 before plus the 130 left: the total, not 230');
        $this->assertNotNull($fresh->cancelled_at);
    }
}
