<?php

namespace Tests\Feature\Appointments\Money;

use App\Models\ServiceBooking;
use App\Models\ServiceBookingPayment;
use App\Services\Appointments\AppointmentPresenter;
use App\Services\Appointments\Money\AppointmentMoney;
use App\Services\Booking\CancellationPolicy;
use App\Services\Booking\ServiceBookingRefund;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Queue;
use Illuminate\Testing\TestResponse;
use Mockery;
use Stripe\Refund;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\Concerns\TakesDeposits;
use Tests\TestCase;

/** Part H §6: what Cancel, No-show, Move and Reopen in the workspace do with a booking-page deposit. */
class DepositCancelTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema, TakesDeposits;

    private $stripe;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
        Queue::fake();
        $this->stripe = $this->stripeForDeposits();
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    private function act(ServiceBooking $b, string $action, array $extra = [], $as = null): TestResponse
    {
        return ($as ? $this->actingAs($as, 'sanctum') : $this->asStaff())->postJson($this->api("bookings/{$b->id}/actions"), [
            'action' => $action, 'revision' => AppointmentPresenter::revision($b->fresh()), 'reason' => 'Client ill',
        ] + $extra);
    }

    /** The server's deposit consequence for one action, as the panel receives it. */
    private function depositLine(ServiceBooking $b, string $action): ?array
    {
        $actions = collect($this->asStaff()->getJson($this->api("bookings/{$b->id}"))->assertOk()->json('booking.actions'));

        return $actions->firstWhere('key', $action)['consequences']['deposit'] ?? null;
    }

    private function refunds(int $times = 1, float $amount = 12.0): void
    {
        $this->stripe->shouldReceive('refund')->times($times)
            ->withArgs(fn ($pi, $a) => str_starts_with((string) $pi, 'pi_dep_') && abs((float) $a - $amount) < 0.001)
            ->andReturn(Refund::constructFrom(['id' => 're_dep', 'status' => 'succeeded']));
    }

    public function test_cancelled_in_time_the_deposit_goes_back_whoever_cancels(): void
    {
        $b = $this->takenDeposit();
        $this->assertSame(['code' => 'goes_back', 'amount' => 12, 'currency' => 'EUR', 'cancel_hours' => 24], $this->depositLine($b, 'cancel'));
        $this->refunds();

        $this->act($b, 'cancel', [], $this->staffUser($this->org, ['role' => 'staff']))->assertOk()
            ->assertJsonPath('booking.status', 'cancelled')
            ->assertJsonPath('booking.payment.raw', 'refunded');

        $refund = ServiceBookingPayment::where('kind', 'refund')->sole();
        $this->assertSame(['online_card', 12.0], [$refund->method, $refund->amount]);
    }

    public function test_cancelled_late_the_venue_keeps_it(): void
    {
        $b = $this->takenDeposit();
        $this->travelTo(CarbonImmutable::parse('2026-10-05 10:00:01'));
        $this->assertSame('kept_late', $this->depositLine($b, 'cancel')['code']);
        $this->stripe->shouldNotReceive('refund');

        $this->act($b, 'cancel')->assertOk()
            ->assertJsonPath('booking.status', 'cancelled')
            ->assertJsonPath('booking.money.to_refund', 0)
            ->assertJsonPath('booking.money.refundable_online', 12);
        $this->assertSame('unpaid', $b->fresh()->payment_status);
    }

    public function test_the_line_turns_from_goes_back_to_kept_one_second_after_the_deadline_in_riga(): void
    {
        $this->setSetting('hotel_timezone', 'Europe/Riga');
        $b = $this->takenDeposit(); // tomorrow 10:00 in Riga = 07:00 UTC, so the deadline is today 07:00 UTC

        $this->travelTo(CarbonImmutable::parse('2026-10-05 07:00:00', 'UTC'));
        $this->assertSame('goes_back', $this->depositLine($b, 'cancel')['code']);
        $this->travelTo(CarbonImmutable::parse('2026-10-05 07:00:01', 'UTC'));
        $this->assertSame('kept_late', $this->depositLine($b, 'cancel')['code']);
    }

    public function test_a_no_show_keeps_the_deposit(): void
    {
        $b = $this->takenDeposit();
        $this->assertSame('kept', $this->depositLine($b, 'no_show')['code']);
        $this->stripe->shouldNotReceive('refund');

        $this->act($b, 'no_show')->assertOk()->assertJsonPath('booking.status', 'no_show');
        $this->assertSame(0, ServiceBookingPayment::where('kind', 'refund')->count());
    }

    public function test_a_refund_stripe_refuses_cancels_nothing(): void
    {
        $b = $this->takenDeposit();
        $this->stripe->shouldReceive('refund')->andThrow(new \RuntimeException('card closed'));

        $this->act($b, 'cancel')->assertStatus(422)->assertJsonPath('error', 'deposit_refund_failed');

        $this->assertSame('confirmed', $b->fresh()->status);
        $this->assertSame(0, ServiceBookingPayment::where('kind', 'refund')->count());
    }

    // Final review (plan ruling 3 vs spec §6.1): in time the whole deposit goes back whoever cancels — a manager's card
    // line can add to it, never take from it, and it stays one Stripe refund.
    public function test_in_time_a_managers_card_line_gives_back_at_least_the_deposit(): void
    {
        $b = $this->takenDeposit();
        $this->refunds(1, 12.0);

        $this->act($b, 'cancel', ['refunds' => [['via' => 'online_card', 'amount' => 5]]])->assertOk();
        $this->assertSame(12.0, ServiceBookingPayment::where('kind', 'refund')->sole()->amount);
    }

    public function test_late_a_managers_card_line_is_goodwill_as_typed(): void
    {
        $b = $this->takenDeposit();
        $this->travelTo(CarbonImmutable::parse('2026-10-05 12:00:00'));
        $this->refunds(1, 5.0);

        $this->act($b, 'cancel', ['refunds' => [['via' => 'online_card', 'amount' => 5]]])->assertOk();
        $this->assertSame(5.0, ServiceBookingPayment::where('kind', 'refund')->sole()->amount);
    }

    // Final review M4: with Stripe switched off the card cannot be refunded here — the cancellation still goes ahead and
    // the deposit is left to refund (a manager gives it back another way); nothing blocks staff.
    public function test_with_stripe_switched_off_an_in_time_cancel_goes_ahead_and_leaves_the_deposit_to_refund(): void
    {
        $b = $this->takenDeposit();
        $this->stripe->shouldReceive('isEnabled')->andReturn(false);
        $this->stripe->shouldNotReceive('refund');

        $this->act($b, 'cancel')->assertOk()
            ->assertJsonPath('booking.status', 'cancelled')
            ->assertJsonPath('booking.money.to_refund', 12);
    }

    public function test_a_manager_can_give_a_kept_deposit_back(): void
    {
        $b = $this->takenDeposit();
        $this->travelTo(CarbonImmutable::parse('2026-10-05 12:00:00'));
        $this->act($b, 'cancel')->assertOk();
        $this->refunds();

        $after = app(AppointmentMoney::class)->refund($b->id, 12, 'online_card', 'Goodwill', AppointmentPresenter::revision($b->fresh()), $this->staff);
        $this->assertSame('refunded', $after->payment_status);
        $this->assertSame(12.0, AppointmentMoney::summary($after)['paid_back']);
    }

    public function test_a_deposit_still_only_held_is_left_to_the_capture_job(): void
    {
        $b = $this->seedDepositBooking();
        $this->assertSame('goes_back', $this->depositLine($b, 'cancel')['code']);
        $this->stripe->shouldNotReceive('refund');

        $this->act($b, 'cancel')->assertOk()->assertJsonPath('booking.status', 'cancelled');
        $this->assertSame('authorized', $b->fresh()->payment_status, 'the capture job releases it');
    }

    public function test_moving_keeps_the_terms_against_the_new_start(): void
    {
        $b = $this->takenDeposit();
        $this->asStaff()->patchJson($this->api("bookings/{$b->id}"), [
            'start' => '2026-10-07T14:00', 'master_id' => $this->master->id, 'revision' => AppointmentPresenter::revision($b->fresh()),
        ])->assertOk();

        $this->assertSame(['amount' => 12, 'percent' => 20, 'cancel_hours' => 24], $b->fresh()->meta['deposit']);
        $this->travelTo(CarbonImmutable::parse('2026-10-05 11:00:00')); // late for the old start, in time for the new one
        $this->assertSame('goes_back', $this->depositLine($b, 'cancel')['code']);
    }

    public function test_reopen_is_refused_after_a_refunded_deposit_and_allowed_after_a_kept_one(): void
    {
        $refunded = $this->takenDeposit();
        $this->refunds();
        $this->act($refunded, 'cancel')->assertOk();
        $this->act($refunded, 'reopen')->assertStatus(422)->assertJsonPath('error', 'money_returned');

        $kept = $this->takenDeposit(['start_at' => '2026-10-05 15:00:00', 'end_at' => '2026-10-05 15:45:00']); // window closed yesterday
        $this->act($kept, 'cancel')->assertOk();
        $this->act($kept, 'reopen')->assertOk()->assertJsonPath('booking.status', 'confirmed');
    }

    public function test_a_booking_without_a_deposit_has_no_deposit_line(): void
    {
        $this->assertNull($this->depositLine($this->seedBooking(), 'cancel'));
    }

    public function test_the_member_portal_counts_the_window_the_booking_was_made_with(): void
    {
        $this->setSetting('services_cancel_hours', '48'); // changed after the booking was made on 24
        $b = $this->takenDeposit();

        $this->assertSame('2026-10-05T10:00:00+00:00', CancellationPolicy::forService($b)['deadline']->utc()->toIso8601String());
    }

    public function test_the_member_portal_names_the_deposit_it_releases(): void
    {
        $b = $this->seedDepositBooking();
        $pi = $b->stripe_payment_intent_id;
        $this->stripe->shouldReceive('retrievePaymentIntent')->andReturn($this->depositIntent($pi));
        $this->stripe->shouldReceive('cancelPaymentIntent')->once()->with($pi, 'requested_by_customer');

        $out = app(ServiceBookingRefund::class)->giveBack($b);
        $this->assertSame(['released', 12.0], [$out['money'], $out['amount']]);
    }
}
