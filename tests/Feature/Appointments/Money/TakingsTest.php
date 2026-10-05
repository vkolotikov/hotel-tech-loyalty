<?php

namespace Tests\Feature\Appointments\Money;

use App\Models\ServiceBookingPayment;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class TakingsTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
        $this->org->forceFill(['timezone' => 'Europe/Riga'])->save();
        app()->forgetScopedInstances();
    }

    private function moneyAt(string $utc, string $kind, string $method, float $amount): void
    {
        $this->travelTo(CarbonImmutable::parse($utc));
        $b = $this->seedBooking(['booking_reference' => 'SVC-' . strtoupper(substr(md5($utc . $method . $kind), 0, 8)), 'start_at' => '2026-10-05 10:00:00', 'end_at' => '2026-10-05 10:45:00']);
        ServiceBookingPayment::create(['service_booking_id' => $b->id, 'kind' => $kind, 'method' => $method, 'amount' => $amount, 'currency' => 'EUR', 'note' => $kind === 'refund' ? 'Goodwill' : null, 'actor_user_id' => $this->staff->id]);
    }

    public function test_a_day_on_the_venues_clock_totals_each_method_in_and_out(): void
    {
        $this->moneyAt('2026-10-05 06:00:00', 'payment', 'cash', 40);
        $this->moneyAt('2026-10-05 20:30:00', 'payment', 'cash', 20);     // 23:30 in Riga: still the 5th
        $this->moneyAt('2026-10-05 21:30:00', 'payment', 'cash', 99);     // 00:30 on the 6th in Riga
        $this->moneyAt('2026-10-05 09:00:00', 'payment', 'card_desk', 45);
        $this->moneyAt('2026-10-05 10:00:00', 'refund', 'cash', 5);

        $r = $this->asStaff()->getJson($this->api('takings?date=2026-10-05'))->assertOk();
        $r->assertJsonPath('totals.EUR.cash', ['in' => 60, 'out' => 5])
          ->assertJsonPath('totals.EUR.card_desk', ['in' => 45, 'out' => 0])
          ->assertJsonCount(4, 'rows')
          ->assertJsonPath('rows.0.by', $this->staff->name);
    }

    public function test_online_card_payments_of_the_days_appointments_are_shown_for_reference(): void
    {
        $this->seedBooking(['payment_status' => 'paid', 'stripe_payment_intent_id' => 'pi_day1', 'start_at' => '2026-10-05 15:00:00', 'end_at' => '2026-10-05 15:45:00']);
        $this->seedBooking(['payment_status' => 'paid', 'stripe_payment_intent_id' => 'pi_mock_x', 'start_at' => '2026-10-05 16:00:00', 'end_at' => '2026-10-05 16:45:00']);

        $this->asStaff()->getJson($this->api('takings?date=2026-10-05'))->assertOk()->assertJsonPath('online.EUR', 60);
    }

    public function test_only_managers_see_takings(): void
    {
        $this->actingAs($this->staffUser($this->org, ['role' => 'staff']), 'sanctum')
            ->getJson($this->api('takings?date=2026-10-05'))->assertStatus(403)->assertJsonPath('error', 'not_allowed');
        $this->asStaff()->getJson($this->api('takings?date=05-10-2026'))->assertStatus(422);
    }
}
