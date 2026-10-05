<?php

namespace Tests\Feature\Appointments\Messages;

use App\Jobs\DeliverClientMessage;
use App\Mail\AppointmentMessageMail;
use App\Models\ClientMessage;
use App\Models\EmailSuppression;
use App\Services\Appointments\Messages\ClientMessenger;
use Illuminate\Database\Events\TransactionBeginning;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class ClientMessengerTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    private function messenger(): ClientMessenger
    {
        return app(ClientMessenger::class);
    }

    public function test_the_venue_setting_decides_when_staff_said_nothing(): void
    {
        Queue::fake();
        $booking = $this->seedBooking(['customer_email' => 'sophie@example.test']);

        $off = $this->messenger()->afterStaffAction($booking, 'booked', null, $this->staff);
        $this->assertSame(['skipped', 'not_requested'], [$off->status, $off->reason]);

        $this->setClientMessages(true);
        $on = $this->messenger()->afterStaffAction($booking, 'booked', null, $this->staff);
        $this->assertSame(['queued', null, 'sophie@example.test', 'en', $this->staff->id], [$on->status, $on->reason, $on->recipient, $on->locale, (int) $on->actor_user_id]);
        Queue::assertPushed(DeliverClientMessage::class, fn ($job) => $job->clientMessageId === $on->id);

        $no = $this->messenger()->afterStaffAction($booking, 'booked', false, $this->staff);
        $this->assertSame(['skipped', 'not_requested'], [$no->status, $no->reason]);
    }

    public function test_nobody_to_tell_or_a_suppressed_address_is_skipped_and_said_so(): void
    {
        Queue::fake();
        $nobody = $this->messenger()->afterStaffAction($this->seedBooking(['customer_email' => '']), 'booked', true, $this->staff);
        $this->assertSame(['skipped', 'no_recipient', null], [$nobody->status, $nobody->reason, $nobody->recipient]);

        EmailSuppression::suppress('bounced@example.test', EmailSuppression::HARD_BOUNCE);
        $suppressed = $this->messenger()->afterStaffAction($this->seedBooking(['customer_email' => 'bounced@example.test', 'start_at' => '2026-10-06 12:00:00', 'end_at' => '2026-10-06 12:45:00']), 'booked', true, $this->staff);
        $this->assertSame(['skipped', 'suppressed'], [$suppressed->status, $suppressed->reason]);

        Queue::assertNothingPushed();
    }

    public function test_delivery_sends_the_mail_and_marks_the_row(): void
    {
        Mail::fake();
        $booking = $this->seedBooking(['customer_email' => 'sophie@example.test']);

        $row = $this->messenger()->afterStaffAction($booking, 'booked', true, $this->staff);

        Mail::assertSent(AppointmentMessageMail::class, fn ($mail) => $mail->hasTo('sophie@example.test') && $mail->message->id === $row->id);
        $this->assertSame('sent', $row->fresh()->status);
        $this->assertNotNull($row->fresh()->sent_at);
    }

    public function test_a_message_whose_time_no_longer_holds_is_not_sent(): void
    {
        Queue::fake();
        $booking = $this->seedBooking(['customer_email' => 'sophie@example.test']);
        $booked = $this->messenger()->afterStaffAction($booking, 'booked', true, $this->staff);
        $confirmed = $this->messenger()->afterStaffAction($booking, 'confirmed', true, $this->staff);

        // Moved before "booked" left: that email names a time that no longer holds.
        $booking->update(['start_at' => '2026-10-06 15:00:00', 'end_at' => '2026-10-06 15:45:00']);
        Mail::fake();
        (new DeliverClientMessage($booked->id))->handle();
        $this->assertSame(['skipped', 'stale'], [$booked->fresh()->status, $booked->fresh()->reason]);

        // Back at its time but cancelled before "confirmed" left.
        $booking->update(['start_at' => '2026-10-06 10:00:00', 'end_at' => '2026-10-06 10:45:00', 'status' => 'cancelled']);
        (new DeliverClientMessage($confirmed->id))->handle();
        $this->assertSame(['skipped', 'stale'], [$confirmed->fresh()->status, $confirmed->fresh()->reason]);
        Mail::assertNothingSent();
    }

    public function test_a_cancellation_is_sent_for_a_cancelled_appointment(): void
    {
        Mail::fake();
        $booking = $this->seedBooking(['customer_email' => 'sophie@example.test', 'status' => 'cancelled']);

        $row = $this->messenger()->afterStaffAction($booking, 'cancelled', true, $this->staff);

        $this->assertSame('sent', $row->fresh()->status);
    }

    public function test_a_mail_failure_marks_the_row_failed_and_never_reaches_the_staff_action(): void
    {
        Mail::shouldReceive('to')->andThrow(new \RuntimeException('SMTP down'));
        $booking = $this->seedBooking(['customer_email' => 'sophie@example.test']);

        $row = $this->messenger()->afterStaffAction($booking, 'booked', true, $this->staff);

        $this->assertSame(['failed', 'mail_error'], [$row->fresh()->status, $row->fresh()->reason]);
    }

    public function test_the_log_itself_failing_never_reaches_the_staff_action(): void
    {
        Schema::drop('client_messages');

        $row = $this->messenger()->afterStaffAction($this->seedBooking(['customer_email' => 'sophie@example.test']), 'booked', true, $this->staff);

        $this->assertFalse($row->exists);
        $this->assertSame(['failed', 'mail_error'], [$row->status, $row->reason]);
    }

    public function test_the_message_is_written_in_its_own_savepoint_so_it_cannot_abort_the_staff_actions_transaction(): void
    {
        // On PostgreSQL a failed statement aborts the whole transaction it runs in; the full admin's create calls the
        // sender inside its own transaction (plan ruling R6), so the sender must run in a savepoint of its own.
        Queue::fake();
        $booking = $this->seedBooking(['customer_email' => 'sophie@example.test']);
        $opened = [];
        Event::listen(TransactionBeginning::class, function () use (&$opened) { $opened[] = DB::transactionLevel(); });

        DB::transaction(function () use ($booking, &$opened) {
            $outer = DB::transactionLevel();
            $opened = [];
            $this->messenger()->afterStaffAction($booking, 'booked', true, $this->staff);
            $this->assertContains($outer + 1, $opened);
            $this->assertSame($outer, DB::transactionLevel());
        });
    }

    public function test_any_valid_address_fits_the_log(): void
    {
        // sqlite ignores string lengths, so the column is read from the migration: an address may be 320 characters.
        $this->assertMatchesRegularExpression("/->string\('recipient', 320\)/", file_get_contents(base_path('database/migrations/2026_10_05_100000_create_client_messages.php')));
    }

    public function test_one_reminder_per_appointment_time(): void
    {
        Queue::fake();
        $booking = $this->seedBooking(['customer_email' => 'sophie@example.test']);

        $first = $this->messenger()->remind($booking);
        $this->assertSame(['reminder', 'queued', null], [$first->kind, $first->status, $first->actor_user_id]);
        $this->assertNull($this->messenger()->remind($booking));

        $booking->update(['start_at' => '2026-10-06 15:00:00', 'end_at' => '2026-10-06 15:45:00']);
        $this->assertNotNull($this->messenger()->remind($booking->fresh()));
        Queue::assertPushed(DeliverClientMessage::class, 2);
    }

    public function test_the_delivery_job_gives_back_the_tenant_it_found(): void
    {
        // A queue worker runs many jobs in one process: the next job must not inherit this organisation's tenant.
        Queue::fake();
        $row = $this->messenger()->afterStaffAction($this->seedBooking(['customer_email' => 'sophie@example.test']), 'booked', true, $this->staff);
        Mail::fake();

        app()->instance('current_organization_id', 777777);
        (new DeliverClientMessage($row->id))->handle();
        $this->assertSame(777777, app('current_organization_id'));

        $second = $this->messenger()->afterStaffAction($this->seedBooking(['customer_email' => 'b@example.test', 'start_at' => '2026-10-06 12:00:00', 'end_at' => '2026-10-06 12:45:00']), 'booked', true, $this->staff);
        app()->forgetInstance('current_organization_id');
        (new DeliverClientMessage($second->id))->handle();
        $this->assertFalse(app()->bound('current_organization_id'));
        app()->instance('current_organization_id', $this->org->id);

        $this->assertSame(['sent', 'sent'], [$row->fresh()->status, $second->fresh()->status]);
    }

    public function test_a_reminder_that_cannot_be_recorded_is_logged_not_thrown(): void
    {
        // The command walks a venue's appointments one by one; one that fails must not stop the others.
        Schema::drop('client_messages');

        $this->assertNull($this->messenger()->remind($this->seedBooking(['customer_email' => 'sophie@example.test'])));
    }

    public function test_the_language_follows_the_client_then_the_venue(): void
    {
        Queue::fake();
        $this->setClientMessages(true, 0, 'de');
        $client = $this->seedClient(['email' => 'sophie@example.test', 'email_key' => 'sophie@example.test', 'preferred_language' => 'Русский']);

        $this->assertSame('ru', $this->messenger()->afterStaffAction($this->seedBooking(['customer_email' => '', 'guest_id' => $client->id]), 'booked', null, $this->staff)->locale);
        $this->assertSame('de', $this->messenger()->afterStaffAction($this->seedBooking(['customer_email' => 'x@example.test', 'start_at' => '2026-10-06 12:00:00', 'end_at' => '2026-10-06 12:45:00']), 'booked', null, $this->staff)->locale);
    }
}
