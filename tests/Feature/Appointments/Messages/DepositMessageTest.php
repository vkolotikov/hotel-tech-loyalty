<?php

namespace Tests\Feature\Appointments\Messages;

use App\Mail\AppointmentMessageMail;
use App\Models\ClientMessage;
use App\Models\ServiceBooking;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Mockery;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\Concerns\TakesDeposits;
use Tests\TestCase;

/** Part H §6.3: the cancellation email says what happened to the deposit, in the client's language. */
class DepositMessageTest extends TestCase
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

    private function mail(ServiceBooking $b, string $kind, string $locale = 'en'): AppointmentMessageMail
    {
        $message = ClientMessage::create([
            'service_booking_id' => $b->id, 'kind' => $kind, 'channel' => 'email', 'recipient' => 'ada@example.test',
            'locale' => $locale, 'status' => 'queued', 'for_start_at' => '2026-10-06 10:00:00',
        ]);

        return new AppointmentMessageMail($message, $b->fresh(['service', 'master']));
    }

    public function test_a_cancellation_in_time_says_the_deposit_is_being_refunded(): void
    {
        $mail = $this->mail($this->takenDeposit(['status' => 'cancelled', 'cancelled_at' => now(), 'refunded_amount' => 12]), 'cancelled');

        $this->assertSame('Your deposit of EUR 12.00 is being refunded to your card.', $mail->lines()['deposit']);
        $this->assertStringContainsString('Your deposit of EUR 12.00 is being refunded to your card.', $mail->render());
    }

    public function test_a_late_cancellation_says_the_deposit_is_kept(): void
    {
        $b = $this->takenDeposit(['status' => 'cancelled', 'cancelled_at' => '2026-10-05 12:00:00']); // after the 10:00 deadline

        $this->assertSame('The deposit of EUR 12.00 is kept, as the visit was cancelled less than 24 hours before.', $this->mail($b, 'cancelled')->lines()['deposit']);
    }

    // Final review I3: the words follow the money — a late cancellation whose deposit a manager gave back says so.
    public function test_a_kept_deposit_given_back_as_goodwill_says_it_is_refunded(): void
    {
        $b = $this->takenDeposit(['status' => 'cancelled', 'cancelled_at' => '2026-10-05 12:00:00', 'refunded_amount' => 12]);

        $this->assertSame('Your deposit of EUR 12.00 is being refunded to your card.', $this->mail($b, 'cancelled')->lines()['deposit']);
    }

    public function test_a_deposit_still_only_held_follows_the_window(): void
    {
        $inTime = $this->seedDepositBooking(['status' => 'cancelled', 'cancelled_at' => now()]);
        $late = $this->seedDepositBooking(['status' => 'cancelled', 'cancelled_at' => '2026-10-05 12:00:00']);

        $this->assertSame('Your deposit of EUR 12.00 is being refunded to your card.', $this->mail($inTime, 'cancelled')->lines()['deposit']);
        $this->assertStringStartsWith('The deposit of EUR 12.00 is kept', $this->mail($late, 'cancelled')->lines()['deposit']);
    }

    public function test_only_a_cancellation_of_a_deposit_booking_mentions_a_deposit(): void
    {
        $this->assertNull($this->mail($this->takenDeposit(), 'confirmed')->lines()['deposit']);
        $this->assertNull($this->mail($this->seedBooking(['status' => 'cancelled', 'cancelled_at' => now()]), 'cancelled')->lines()['deposit']);
    }

    public function test_both_lines_are_in_every_language(): void
    {
        $inTime = $this->takenDeposit(['status' => 'cancelled', 'cancelled_at' => now(), 'refunded_amount' => 12]);
        $late = $this->takenDeposit(['status' => 'cancelled', 'cancelled_at' => '2026-10-05 12:00:00']);
        foreach (['ru', 'de', 'fr', 'es'] as $locale) {
            foreach (['refunded' => $inTime, 'kept' => $late] as $key => $b) {
                $line = $this->mail($b, 'cancelled', $locale)->lines()['deposit'];
                $this->assertStringContainsString('EUR 12.00', $line, "{$locale}/{$key}");
                $this->assertNotSame(__("client_messages.deposit.{$key}", ['amount' => 'EUR 12.00', 'hours' => 24], 'en'), $line, "{$locale}/{$key} is translated");
            }
        }
    }
}
