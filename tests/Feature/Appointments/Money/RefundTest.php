<?php

namespace Tests\Feature\Appointments\Money;

use App\Models\PointsTransaction;
use App\Models\ServiceBookingPayment;
use App\Services\Appointments\AppointmentPresenter;
use App\Services\Loyalty\BookingPointsService;
use App\Services\StripeService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Mockery;
use Stripe\Refund;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class RefundTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    private $stripe;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
        $this->stripe = Mockery::mock(StripeService::class);
        $this->stripe->shouldReceive('isEnabled')->andReturn(true)->byDefault();
        $this->app->instance(StripeService::class, $this->stripe);
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    private function refund($booking, array $body, $as = null): \Illuminate\Testing\TestResponse
    {
        return ($as ? $this->actingAs($as, 'sanctum') : $this->asStaff())
            ->postJson($this->api("bookings/{$booking->id}/refunds"), $body + ['reason' => 'Goodwill', 'revision' => AppointmentPresenter::revision($booking->fresh())]);
    }

    private function paidAtDesk(float $amount, array $attrs = [])
    {
        $b = $this->seedBooking($attrs);
        ServiceBookingPayment::create(['service_booking_id' => $b->id, 'kind' => 'payment', 'method' => 'cash', 'amount' => $amount, 'currency' => 'EUR', 'actor_user_id' => $this->staff->id]);

        return $b;
    }

    public function test_a_manager_gives_cash_back_and_staff_may_not(): void
    {
        $b = $this->paidAtDesk(60);

        $this->refund($b, ['amount' => 10, 'via' => 'cash'], $this->staffUser($this->org, ['role' => 'staff']))
            ->assertStatus(403)->assertJsonPath('error', 'not_allowed');

        $this->refund($b, ['amount' => 10, 'via' => 'cash'])->assertOk()
            ->assertJsonPath('booking.money.refunded_desk', 10)
            ->assertJsonPath('booking.money.movements.0.kind', 'refund')
            ->assertJsonPath('booking.money.movements.0.note', 'Goodwill')
            ->assertJsonPath('booking.payment.raw', 'partially_refunded');
    }

    public function test_limits_and_a_reason_are_required(): void
    {
        $b = $this->paidAtDesk(20);
        $this->refund($b, ['amount' => 21, 'via' => 'cash'])->assertStatus(422)->assertJsonPath('error', 'refund_too_large')->assertJsonPath('max', 20);
        $this->refund($b, ['amount' => 5, 'via' => 'online_card'])->assertStatus(422)->assertJsonPath('error', 'refund_too_large')->assertJsonPath('max', 0);
        $this->asStaff()->postJson($this->api("bookings/{$b->id}/refunds"), ['amount' => 5, 'via' => 'cash', 'reason' => '', 'revision' => AppointmentPresenter::revision($b->fresh())])->assertStatus(422);
    }

    public function test_a_card_paid_online_is_refunded_through_stripe_for_the_amount_given(): void
    {
        $b = $this->seedBooking(['payment_status' => 'paid', 'stripe_payment_intent_id' => 'pi_paid9']);
        $this->stripe->shouldReceive('refund')->once()
            ->withArgs(fn ($pi, $amount, $reason, $key) => $pi === 'pi_paid9' && abs($amount - 25.0) < 0.001 && $reason === 'requested_by_customer' && str_starts_with($key, "appt-refund-{$b->id}-"))
            ->andReturn(Refund::constructFrom(['id' => 're_77', 'status' => 'succeeded']));

        $this->refund($b, ['amount' => 25, 'via' => 'online_card'])->assertOk()
            ->assertJsonPath('booking.money.refunded_online', 25)
            ->assertJsonPath('booking.money.refundable_online', 35)
            ->assertJsonPath('booking.payment.raw', 'partially_refunded');

        $this->assertSame('re_77', ServiceBookingPayment::value('stripe_refund_id'));
        $this->assertSame(['re_77', 25.0], [$b->fresh()->last_refund_id, (float) $b->fresh()->refunded_amount]);
    }

    public function test_a_failed_stripe_refund_leaves_nothing_behind(): void
    {
        $b = $this->seedBooking(['payment_status' => 'paid', 'stripe_payment_intent_id' => 'pi_paid8']);
        $this->stripe->shouldReceive('refund')->andThrow(new \RuntimeException('Card network unavailable'));

        $this->refund($b, ['amount' => 25, 'via' => 'online_card'])->assertStatus(409)
            ->assertJsonPath('error', 'refund_failed')
            ->assertJson(['message' => 'The card refund did not go through: Card network unavailable']);

        $this->assertSame(0, ServiceBookingPayment::count());
        $this->assertSame(['paid', null], [$b->fresh()->payment_status, $b->fresh()->refunded_amount !== null ? (float) $b->fresh()->refunded_amount : null]);
    }

    public function test_a_wrong_desk_entry_is_corrected_and_the_money_is_owed_again(): void
    {
        // €60 was entered as cash; the client paid by card at the desk. A goodwill refund never re-opens what is
        // owed (R1); a correction does, so the right payment can be taken.
        $b = $this->paidAtDesk(60, ['member_id' => $this->member->id, 'status' => 'completed']);
        app(BookingPointsService::class)->awardForServiceBooking($b->fresh());

        $this->refund($b, ['amount' => 60, 'via' => 'cash', 'corrects' => true, 'reason' => 'Entered as cash, paid by card'])->assertOk()
            ->assertJsonPath('booking.money.paid_desk', 0)
            ->assertJsonPath('booking.money.refunded_desk', 0)
            ->assertJsonPath('booking.money.owed', 60)
            ->assertJsonPath('booking.money.can_take', true)
            ->assertJsonPath('booking.money.movements.0.corrects', true)
            ->assertJsonPath('booking.payment.raw', 'unpaid');

        $this->asStaff()->postJson($this->api("bookings/{$b->id}/payments"), ['amount' => 60, 'method' => 'card_desk', 'revision' => AppointmentPresenter::revision($b->fresh())])
            ->assertOk()->assertJsonPath('booking.money.owed', 0)->assertJsonPath('booking.payment.raw', 'paid');

        // A correction is no refund to the client: the visit keeps its points.
        $this->assertGreaterThan(0, (int) PointsTransaction::where('reference_type', 'service_booking')->where('reference_id', $b->id)->value('points'));
        $this->assertFalse((bool) PointsTransaction::where('reference_type', 'service_booking')->where('reference_id', $b->id)->where('points', '>', 0)->value('is_reversed'));
    }

    public function test_only_money_recorded_at_the_desk_can_be_corrected(): void
    {
        $card = $this->seedBooking(['payment_status' => 'paid', 'stripe_payment_intent_id' => 'pi_corr1']);
        $this->stripe->shouldNotReceive('refund');
        $this->refund($card, ['amount' => 10, 'via' => 'online_card', 'corrects' => true])->assertStatus(422)->assertJsonPath('error', 'not_allowed');

        // Marked paid before Part E: no recorded payment to correct.
        $legacy = $this->seedBooking(['payment_status' => 'paid', 'start_at' => '2026-10-06 12:00:00', 'end_at' => '2026-10-06 12:45:00']);
        $this->refund($legacy, ['amount' => 10, 'via' => 'cash', 'corrects' => true])->assertStatus(422)
            ->assertJsonPath('error', 'refund_too_large')->assertJsonPath('max', 0);
    }

    public function test_a_card_refund_retried_after_a_lost_answer_sends_stripe_the_same_key(): void
    {
        // Stripe made the refund but the answer never came back: the retry must not refund twice.
        $b = $this->seedBooking(['payment_status' => 'paid', 'stripe_payment_intent_id' => 'pi_lost1']);
        $keys = [];
        $this->stripe->shouldReceive('refund')->times(3)->andReturnUsing(function ($pi, $amount, $reason, $key) use (&$keys) {
            $keys[] = $key;
            if (count($keys) === 1) {
                throw new \RuntimeException('Timed out');
            }

            return Refund::constructFrom(['id' => 're_lost' . count($keys), 'status' => 'succeeded']);
        });

        $this->refund($b, ['amount' => 25, 'via' => 'online_card'])->assertStatus(409)->assertJsonPath('error', 'refund_failed');
        // Meanwhile the desk takes money for someone else, so the ledger's next row id moves on (as PostgreSQL's
        // sequence always does after a rollback).
        $this->paidAtDesk(30, ['start_at' => '2026-10-06 12:00:00', 'end_at' => '2026-10-06 12:45:00']);
        $this->refund($b, ['amount' => 25, 'via' => 'online_card'])->assertOk()->assertJsonPath('booking.money.refunded_online', 25);
        $this->assertSame($keys[0], $keys[1]);

        // A second refund of the same amount is a new refund, with a new key.
        $this->refund($b, ['amount' => 25, 'via' => 'online_card'])->assertOk()->assertJsonPath('booking.money.refunded_online', 50);
        $this->assertNotSame($keys[1], $keys[2]);
    }

    public function test_online_payments_switched_off_refuse_a_card_refund_but_not_cash(): void
    {
        $this->stripe->shouldReceive('isEnabled')->andReturn(false);
        $b = $this->seedBooking(['payment_status' => 'paid', 'stripe_payment_intent_id' => 'pi_paid7']);

        $this->refund($b, ['amount' => 5, 'via' => 'online_card'])->assertStatus(409)->assertJsonPath('error', 'refund_unavailable');
    }

    public function test_a_full_refund_takes_the_points_back_once_and_a_part_refund_keeps_them(): void
    {
        $b = $this->paidAtDesk(60, ['member_id' => $this->member->id, 'status' => 'completed']);
        app(BookingPointsService::class)->awardForServiceBooking($b->fresh());
        $earned = PointsTransaction::where('reference_type', 'service_booking')->where('reference_id', $b->id)->value('points');
        $this->assertGreaterThan(0, $earned);

        $this->refund($b, ['amount' => 20, 'via' => 'cash'])->assertOk();
        $this->assertFalse((bool) PointsTransaction::where('reference_type', 'service_booking')->where('reference_id', $b->id)->where('points', '>', 0)->value('is_reversed'));

        $this->refund($b, ['amount' => 40, 'via' => 'cash'])->assertOk()->assertJsonPath('booking.payment.raw', 'refunded');
        $this->assertTrue((bool) PointsTransaction::where('reference_type', 'service_booking')->where('reference_id', $b->id)->where('points', '>', 0)->value('is_reversed'));
        // LoyaltyService::reverseTransaction() writes one `reverse` row pointing at the earn row (no booking reference).
        $earn = PointsTransaction::where('reference_type', 'service_booking')->where('reference_id', $b->id)->where('points', '>', 0)->value('id');
        $this->assertSame(1, PointsTransaction::where('reversal_of_id', $earn)->count());
    }
}
