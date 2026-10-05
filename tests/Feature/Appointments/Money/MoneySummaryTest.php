<?php

namespace Tests\Feature\Appointments\Money;

use App\Models\ServiceBookingPayment;
use App\Services\Appointments\Money\AppointmentMoney;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class MoneySummaryTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    private function row($booking, string $kind, string $method, float $amount): void
    {
        ServiceBookingPayment::create([
            'service_booking_id' => $booking->id, 'kind' => $kind, 'method' => $method, 'amount' => $amount,
            'currency' => 'EUR', 'note' => $kind === 'refund' ? 'Goodwill' : null, 'actor_user_id' => $this->staff->id,
        ]);
    }

    private function figures($booking): array
    {
        return AppointmentMoney::summary($booking->fresh());
    }

    public function test_an_unpaid_appointment_owes_its_total(): void
    {
        $s = $this->figures($this->seedBooking());

        $this->assertSame([60.0, 0.0, 0.0, 60.0, true, false], [$s['total'], $s['paid_desk'], $s['paid_in'], $s['owed'], $s['can_take'], $s['legacy_marked_paid']]);
        $this->assertSame('unpaid', AppointmentMoney::statusFor($s));
    }

    public function test_a_part_payment_leaves_the_rest_owed_and_the_label_unpaid(): void
    {
        $b = $this->seedBooking();
        $this->row($b, 'payment', 'cash', 20);

        $s = $this->figures($b);
        $this->assertSame([20.0, 40.0], [$s['paid_desk'], $s['owed']]);
        $this->assertSame('unpaid', AppointmentMoney::statusFor($s));

        $this->row($b, 'payment', 'card_desk', 40);
        $s = $this->figures($b);
        $this->assertSame([0.0, false], [$s['owed'], $s['can_take']]);
        $this->assertSame('paid', AppointmentMoney::statusFor($s));
        $this->assertSame(['card_desk', 'cash'], array_column($s['movements'], 'method')); // newest first
    }

    public function test_a_refund_never_makes_money_owed_again(): void
    {
        $b = $this->seedBooking();
        $this->row($b, 'payment', 'cash', 60);
        $this->row($b, 'refund', 'cash', 10);

        $s = $this->figures($b);
        $this->assertSame([0.0, 50.0, 0.0], [$s['owed'], $s['refundable_desk'], $s['refundable_online']]);
        $this->assertSame('partially_refunded', AppointmentMoney::statusFor($s));

        $this->row($b, 'refund', 'cash', 50);
        $this->assertSame('refunded', AppointmentMoney::statusFor($this->figures($b)));
    }

    public function test_a_card_held_online_covers_the_total_and_the_label_is_left_to_the_capture_job(): void
    {
        $s = $this->figures($this->seedBooking(['payment_status' => 'authorized', 'stripe_payment_intent_id' => 'pi_held1']));

        $this->assertSame([60.0, 0.0, false], [$s['held_online'], $s['owed'], $s['can_take']]);
        $this->assertNull(AppointmentMoney::statusFor($s));
    }

    public function test_a_card_paid_online_is_refundable_through_stripe_and_follows_refunded_amount(): void
    {
        $b = $this->seedBooking(['payment_status' => 'partially_refunded', 'stripe_payment_intent_id' => 'pi_paid1', 'refunded_amount' => 15]);

        $s = $this->figures($b);
        $this->assertSame([60.0, 15.0, 45.0, 0.0, 0.0], [$s['paid_online'], $s['refunded_online'], $s['refundable_online'], $s['refundable_desk'], $s['owed']]);
        $this->assertSame('partially_refunded', AppointmentMoney::statusFor($s));
    }

    public function test_a_demo_payment_is_not_a_card_payment(): void
    {
        $s = $this->figures($this->seedBooking(['payment_status' => 'paid', 'stripe_payment_intent_id' => 'pi_mock_1']));

        $this->assertSame([0.0, 0.0], [$s['paid_online'], $s['refundable_online']]);
    }

    public function test_a_booking_marked_paid_before_part_e_owes_nothing_and_can_be_refunded_at_the_desk(): void
    {
        $b = $this->seedBooking(['payment_status' => 'paid']);

        $s = $this->figures($b);
        $this->assertSame([true, 0.0, 60.0, false], [$s['legacy_marked_paid'], $s['owed'], $s['refundable_desk'], $s['can_take']]);

        $this->row($b, 'refund', 'cash', 60);
        $b->update(['payment_status' => 'refunded']);
        $s = $this->figures($b);
        $this->assertTrue($s['legacy_marked_paid']); // still recognised after its refund (R2)
        $this->assertSame(['refunded', 0.0], [AppointmentMoney::statusFor($s), $s['refundable_desk']]);
    }

    public function test_a_cancelled_appointment_owes_nothing_and_shows_what_is_left_to_refund(): void
    {
        $b = $this->seedBooking();
        $this->row($b, 'payment', 'cash', 30);
        $b->update(['status' => 'cancelled']);

        $s = $this->figures($b);
        $this->assertSame([0.0, 30.0, false], [$s['owed'], $s['to_refund'], $s['can_take']]);
    }

    public function test_the_migration_builds_the_table(): void
    {
        \Illuminate\Support\Facades\Schema::drop('service_booking_payments');
        (require base_path('database/migrations/2026_10_06_100000_create_service_booking_payments.php'))->up();

        $this->assertSame(
            ['id', 'organization_id', 'service_booking_id', 'kind', 'method', 'amount', 'currency', 'note', 'corrects', 'stripe_refund_id', 'actor_user_id', 'created_at', 'updated_at'],
            \Illuminate\Support\Facades\Schema::getColumnListing('service_booking_payments'),
        );
    }

    public function test_a_movement_says_who_and_when(): void
    {
        $b = $this->seedBooking();
        $this->row($b, 'payment', 'cash', 20);

        $m = $this->figures($b)['movements'][0];
        $this->assertSame(['payment', 'cash', 20.0, 'EUR', null, $this->staff->name], [$m['kind'], $m['method'], $m['amount'], $m['currency'], $m['note'], $m['by']]);
        $this->assertNotNull($m['at']);
    }
}
