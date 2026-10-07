<?php

namespace Tests\Feature\Appointments\Money;

use App\Models\ServiceBooking;
use App\Models\ServiceBookingPayment;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Mockery;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\Concerns\TakesDeposits;
use Tests\TestCase;

/** Part H §5.4–5.5: the capture job and the orphan release with booking-page deposits. */
class DepositJobsTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema, TakesDeposits;

    private $stripe;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
        $this->setUpCapturePendingSchema();
        $this->stripe = $this->stripeForDeposits();
        $this->setSetting('booking_payment_enabled', 'true');
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    private function capture(): void
    {
        $this->travel(10)->minutes(); // the job leaves bookings younger than 5 minutes to confirm()
        $this->assertSame(0, Artisan::call('bookings:capture-pending-pis'));
    }

    public function test_a_deposit_whose_charge_was_missed_is_charged_and_recorded_as_a_deposit(): void
    {
        $b = $this->seedDepositBooking();
        $pi = $b->stripe_payment_intent_id;
        $this->stripe->shouldReceive('retrievePaymentIntent')->andReturn($this->depositIntent($pi));
        $this->stripe->shouldReceive('capturePaymentIntent')->once()->with($pi)->andReturn($this->depositIntent($pi, 12.0, [], 'succeeded'));
        $this->stripe->shouldNotReceive('cancelPaymentIntent');

        $this->capture();

        $this->assertSame('unpaid', $b->fresh()->payment_status, 'never "paid" for a deposit');
        $this->assertSame([12.0, 'online_card'], [ServiceBookingPayment::sole()->amount, ServiceBookingPayment::sole()->method]);
    }

    public function test_a_deposit_charged_but_not_recorded_is_recorded(): void
    {
        $b = $this->seedDepositBooking();
        $this->stripe->shouldReceive('retrievePaymentIntent')->andReturn($this->depositIntent($b->stripe_payment_intent_id, 12.0, [], 'succeeded'));
        $this->stripe->shouldNotReceive('capturePaymentIntent');

        $this->capture();

        $this->assertSame('unpaid', $b->fresh()->payment_status);
        $this->assertSame(1, ServiceBookingPayment::count());
    }

    public function test_a_booking_cancelled_in_time_has_its_deposit_hold_released(): void
    {
        $b = $this->seedDepositBooking(['status' => 'cancelled', 'cancelled_at' => now()]); // 06:00, deadline 10:00
        $pi = $b->stripe_payment_intent_id;
        $this->stripe->shouldReceive('retrievePaymentIntent')->andReturn($this->depositIntent($pi));
        $this->stripe->shouldNotReceive('capturePaymentIntent');
        $this->stripe->shouldReceive('cancelPaymentIntent')->once()->with($pi, 'abandoned')->andReturn($this->depositIntent($pi, 12.0, [], 'canceled'));

        $this->capture();

        $this->assertSame('cancelled', $b->fresh()->payment_status);
        $this->assertSame(0, ServiceBookingPayment::count());
    }

    public function test_a_late_cancellation_and_a_no_show_have_their_deposit_charged_and_kept(): void
    {
        // Today 15:00: the 24-hour window closed yesterday.
        $late = $this->seedDepositBooking(['status' => 'cancelled', 'cancelled_at' => now(), 'start_at' => '2026-10-05 15:00:00', 'end_at' => '2026-10-05 15:45:00']);
        $noShow = $this->seedDepositBooking(['status' => 'no_show', 'start_at' => '2026-10-05 07:00:00', 'end_at' => '2026-10-05 07:45:00']);
        $this->stripe->shouldReceive('retrievePaymentIntent')->andReturnUsing(fn (string $id) => $this->depositIntent($id));
        $this->stripe->shouldReceive('capturePaymentIntent')->twice()->andReturnUsing(fn (string $id) => $this->depositIntent($id, 12.0, [], 'succeeded'));
        $this->stripe->shouldNotReceive('cancelPaymentIntent');

        $this->capture();

        $this->assertSame(2, ServiceBookingPayment::where('method', 'online_card')->where('kind', 'payment')->count());
        $this->assertSame(['unpaid', 'unpaid'], [$late->fresh()->payment_status, $noShow->fresh()->payment_status]);
    }

    public function test_an_abandoned_deposit_is_released_and_one_a_booking_carries_is_never_touched(): void
    {
        $carried = $this->seedDepositBooking();
        $orphan = $this->depositIntent('pi_dep_orphan');
        $kept = $this->depositIntent($carried->stripe_payment_intent_id);
        $this->stripe->shouldReceive('listPaymentIntents')->once()->andReturn([$orphan, $kept]);
        $this->stripe->shouldReceive('retrievePaymentIntent')->once()->with('pi_dep_orphan', ['latest_charge'])->andReturn($orphan);
        $this->stripe->shouldReceive('cancelPaymentIntent')->once()->with('pi_dep_orphan', 'abandoned');

        $this->assertSame(0, Artisan::call('bookings:release-orphan-portal-holds'));

        $this->assertSame(1, DB::table('audit_logs')->where('action', 'portal.hold.orphan_released')->count());
        $this->assertSame('authorized', ServiceBooking::find($carried->id)->payment_status);
    }
}
