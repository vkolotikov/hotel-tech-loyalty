<?php

namespace Tests\Feature\Appointments\Money;

use App\Services\Appointments\Money\Deposits;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Mockery;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\Concerns\TakesDeposits;
use Tests\TestCase;

class DepositTermsTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema, TakesDeposits;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    public function test_the_deposit_is_the_percent_of_the_price_to_the_cent(): void
    {
        $this->assertSame(12.0, Deposits::amountFor(60, 20));
        $this->assertSame(9.0, Deposits::amountFor(59.99, 15));   // 8.9985
        $this->assertSame(11.0, Deposits::amountFor(33.33, 33));  // 10.9989
        $this->assertSame(60.0, Deposits::amountFor(60, 100));
    }

    public function test_a_free_booking_or_one_below_stripes_minimum_takes_no_deposit(): void
    {
        $this->assertNull(Deposits::amountFor(0, 20));
        $this->assertNull(Deposits::amountFor(2, 20));            // 0.40
        $this->assertSame(0.5, Deposits::amountFor(2.5, 20));
    }

    public function test_terms_need_the_switch_stripe_and_stripes_currency(): void
    {
        $stripe = $this->stripeForDeposits();
        $this->assertNull(Deposits::termsFor(60, 'EUR'), 'off until a manager switches it on');

        $this->depositsOn(20, 24);
        $this->assertSame(['amount' => 12.0, 'percent' => 20, 'cancel_hours' => 24, 'currency' => 'EUR'], Deposits::termsFor(60, 'eur'));
        $this->assertNull(Deposits::termsFor(60, 'GBP'));
        $this->assertSame('currency_mismatch', Deposits::unavailableReason('GBP'));
        $this->assertNull(Deposits::termsFor(0, 'EUR'));

        $this->setSetting('booking_mock_mode', 'true');
        $this->assertSame('mock_mode', Deposits::unavailableReason('EUR'));
        $this->setSetting('booking_mock_mode', 'false');

        $stripe->shouldReceive('isEnabled')->andReturn(false);
        $this->assertSame('payments_off', Deposits::unavailableReason('EUR'));
        $this->assertNull(Deposits::termsFor(60, 'EUR'));
    }

    public function test_the_deadline_counts_back_from_the_visits_start(): void
    {
        $b = $this->seedDepositBooking(); // tomorrow 10:00, venue on UTC, 24 hours

        $this->assertSame('2026-10-05T10:00:00+00:00', Deposits::refundUntil($b)->toIso8601String());
        $this->assertSame('Mon 5 Oct 2026, 10:00', Deposits::untilText($b));
        $this->assertSame(['amount' => 12.0, 'percent' => 20, 'cancel_hours' => 24], Deposits::of($b));
    }

    public function test_exactly_at_the_deadline_is_in_time_on_the_venues_clock(): void
    {
        $this->setSetting('hotel_timezone', 'Europe/Riga');
        $b = $this->seedDepositBooking(); // 10:00 in Riga = 07:00 UTC

        $this->assertSame('2026-10-05T07:00:00+00:00', Deposits::refundUntil($b)->utc()->toIso8601String());
        $this->assertSame('Mon 5 Oct 2026, 10:00', Deposits::untilText($b));
        $this->assertTrue(Deposits::inTime($b, CarbonImmutable::parse('2026-10-05 07:00:00', 'UTC')));
        $this->assertFalse(Deposits::inTime($b, CarbonImmutable::parse('2026-10-05 07:00:01', 'UTC')));
    }

    public function test_a_booking_without_terms_has_none(): void
    {
        $b = $this->seedBooking();

        $this->assertNull(Deposits::of($b));
        $this->assertNull(Deposits::refundUntil($b));
        $this->assertFalse(Deposits::inTime($b, now()));
        $this->assertNull(Deposits::forClient($b));
    }
}
