<?php

namespace Tests\Feature\Appointments\Messages;

use App\Models\ClientMessage;
use App\Models\User;
use App\Services\Appointments\Messages\MessageLocale;
use App\Services\Appointments\Messages\MessageRecipient;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class RecipientAndLocaleTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    public function test_the_booking_email_comes_first_trimmed_then_the_clients(): void
    {
        $client = $this->seedClient(['email' => 'sophie@example.test', 'email_key' => 'sophie@example.test']);

        $this->assertSame('ADA@Example.Test', MessageRecipient::for($this->seedBooking(['customer_email' => '  ADA@Example.Test ', 'guest_id' => $client->id])));
        $this->assertSame('sophie@example.test', MessageRecipient::for($this->seedBooking(['customer_email' => 'n/a', 'guest_id' => $client->id, 'start_at' => '2026-10-06 12:00:00', 'end_at' => '2026-10-06 12:45:00'])));
        $this->assertSame('sophie@example.test', MessageRecipient::for($this->seedBooking(['customer_email' => '', 'guest_id' => $client->id, 'start_at' => '2026-10-06 13:00:00', 'end_at' => '2026-10-06 13:45:00'])));
        $this->assertNull(MessageRecipient::for($this->seedBooking(['customer_email' => '', 'start_at' => '2026-10-06 14:00:00', 'end_at' => '2026-10-06 14:45:00'])));
    }

    public function test_a_language_is_read_from_codes_and_names_in_either_tongue(): void
    {
        foreach (['ru' => 'ru', 'ru-RU' => 'ru', 'RU_ru' => 'ru', 'Russian' => 'ru', 'russian ' => 'ru', 'Русский' => 'ru',
                  'Deutsch' => 'de', 'german' => 'de', 'Français' => 'fr', 'francais' => 'fr', 'Español' => 'es', 'English' => 'en', 'en-GB' => 'en'] as $raw => $code) {
            $this->assertSame($code, MessageLocale::normalise($raw), $raw);
        }
        foreach (['Latvian', 'lv', '', null, 'xx-YY'] as $raw) {
            $this->assertNull(MessageLocale::normalise($raw), (string) $raw);
        }
    }

    public function test_the_member_comes_first_then_the_client_record_then_the_venue(): void
    {
        $client = $this->seedClient(['preferred_language' => 'Deutsch']);
        $booking = $this->seedBooking(['guest_id' => $client->id, 'member_id' => $this->member->id]);
        User::whereKey($this->member->user_id)->update(['language' => 'fr']);

        $this->assertSame('fr', MessageLocale::for($booking, 'es'));

        User::whereKey($this->member->user_id)->update(['language' => null]);
        $this->assertSame('de', MessageLocale::for($booking->fresh(), 'es'));

        $client->update(['preferred_language' => 'Latvian']);
        $this->assertSame('es', MessageLocale::for($booking->fresh(), 'es'));
    }

    public function test_one_reminder_per_appointment_time_and_the_api_shape(): void
    {
        $booking = $this->seedBooking();
        $row = fn (string $kind, string $start) => ClientMessage::create([
            'service_booking_id' => $booking->id, 'kind' => $kind, 'channel' => 'email', 'recipient' => 'a@example.test',
            'locale' => 'en', 'status' => 'queued', 'for_start_at' => $start,
        ]);

        $first = $row('reminder', '2026-10-06 10:00:00');
        $row('moved', '2026-10-06 10:00:00');
        $row('moved', '2026-10-06 10:00:00'); // moved twice to the same time: allowed
        $row('reminder', '2026-10-06 14:00:00'); // another time: allowed

        $this->assertSame(['kind' => 'reminder', 'status' => 'queued', 'reason' => null, 'recipient' => 'a@example.test', 'at' => $first->created_at->toIso8601String()], $first->toApi());

        $this->expectException(UniqueConstraintViolationException::class);
        $row('reminder', '2026-10-06 10:00:00');
    }

    public function test_the_migration_builds_the_table_and_its_index(): void
    {
        Schema::drop('client_messages');
        (require base_path('database/migrations/2026_10_05_100000_create_client_messages.php'))->up();

        $this->assertSame(
            ['id', 'organization_id', 'service_booking_id', 'kind', 'channel', 'recipient', 'locale', 'status', 'reason', 'for_start_at', 'previous_start_at', 'actor_user_id', 'sent_at', 'created_at', 'updated_at'],
            Schema::getColumnListing('client_messages'),
        );
        $this->test_one_reminder_per_appointment_time_and_the_api_shape();
    }
}
