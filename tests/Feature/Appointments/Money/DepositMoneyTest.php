<?php

namespace Tests\Feature\Appointments\Money;

use App\Models\ServiceBookingPayment;
use App\Services\Appointments\AppointmentPresenter;
use App\Services\Appointments\AppointmentRefused;
use App\Services\Appointments\Money\AppointmentMoney;
use App\Services\Appointments\Money\TakingsReport;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Mockery;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\Concerns\TakesDeposits;
use Tests\TestCase;

class DepositMoneyTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema, TakesDeposits;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
        $this->stripeForDeposits();
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    public function test_a_held_deposit_is_held_and_the_rest_is_owed(): void
    {
        $s = AppointmentMoney::summary($this->seedDepositBooking());

        $this->assertSame([12.0, 0.0, 48.0], [$s['held_online'], $s['paid_online'], $s['owed']]);
        $this->assertSame(['amount' => 12.0, 'percent' => 20, 'cancel_hours' => 24, 'refund_until' => '2026-10-05T10:00:00+00:00'], $s['deposit']);
    }

    public function test_a_charged_deposit_is_one_card_payment_in_the_ledger_and_the_label_stays_unpaid(): void
    {
        $b = $this->takenDeposit();

        $row = ServiceBookingPayment::sole();
        $this->assertSame(['payment', 'online_card', 12.0, 'EUR', 'Deposit', null], [$row->kind, $row->method, $row->amount, $row->currency, $row->note, $row->actor_user_id]);
        $this->assertSame('unpaid', $b->payment_status);
        $this->assertFalse((bool) $b->meta['paid_at_desk']);

        $s = AppointmentMoney::summary($b);
        $this->assertSame([0.0, 12.0, 0.0, 48.0, 12.0, 0.0, true], [$s['held_online'], $s['paid_online'], $s['paid_desk'], $s['owed'], $s['refundable_online'], $s['refundable_desk'], $s['can_take']]);
        $this->assertSame('deposit_paid', AppointmentPresenter::paymentState($b));
    }

    public function test_recording_it_twice_records_it_once(): void
    {
        $b = $this->takenDeposit();
        app(AppointmentMoney::class)->recordDeposit($b);

        $this->assertSame(1, ServiceBookingPayment::count());
    }

    public function test_take_payment_asks_for_the_rest_and_then_it_is_paid(): void
    {
        $b = $this->takenDeposit();
        $money = app(AppointmentMoney::class);

        try {
            $money->takePayment($b->id, 60, 'cash', null, AppointmentPresenter::revision($b), $this->staff);
            $this->fail('more than is owed was taken');
        } catch (AppointmentRefused $e) {
            $this->assertSame(['amount_too_large', 48.0], [$e->errorCode, $e->extra['max']]);
        }

        $paid = $money->takePayment($b->id, 48, 'cash', null, AppointmentPresenter::revision($b->fresh()), $this->staff);
        $s = AppointmentMoney::summary($paid);
        $this->assertSame(['paid', 12.0, 48.0, 0.0], [$paid->payment_status, $s['paid_online'], $s['paid_desk'], $s['owed']]);
    }

    public function test_a_deposit_of_the_whole_price_marks_it_paid_by_card(): void
    {
        $b = $this->takenDeposit([], 60.0);

        $this->assertSame('paid', $b->payment_status);
        $this->assertSame('paid_by_card', AppointmentPresenter::paymentState($b));
        $this->assertSame(60.0, AppointmentMoney::summary($b)['paid_online']);
    }

    public function test_a_kept_deposit_is_not_left_to_refund(): void
    {
        $b = $this->takenDeposit();
        $b->update(['status' => 'cancelled', 'cancelled_at' => '2026-10-05 12:00:00']); // after the 10:00 deadline

        $s = AppointmentMoney::summary($b->fresh());
        $this->assertSame(0.0, $s['to_refund']);
        $this->assertSame(12.0, $s['refundable_online'], 'a manager can still give it back');
    }

    // Final review M1/M4: cancelled in time with nothing given back (Stripe off, a charge recorded late) — it is owed back.
    public function test_a_deposit_cancelled_in_time_and_not_given_back_is_left_to_refund(): void
    {
        $b = $this->takenDeposit();
        $b->update(['status' => 'cancelled', 'cancelled_at' => now()]); // 06:00, deadline 10:00

        $this->assertSame(12.0, AppointmentMoney::summary($b->fresh())['to_refund']);
    }

    public function test_the_takings_count_a_deposit_once(): void
    {
        $this->takenDeposit([], 60.0); // paid in full by card, the visit is tomorrow

        $today = TakingsReport::for($this->org->id, '2026-10-05');
        $this->assertSame(['in' => 60.0, 'out' => 0.0], $today['totals']['EUR']['online_card']);
        $this->assertSame([], TakingsReport::for($this->org->id, '2026-10-06')['online'], 'not again as the visit day\'s card money');
    }
}
