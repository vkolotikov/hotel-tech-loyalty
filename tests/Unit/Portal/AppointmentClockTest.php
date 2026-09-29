<?php

namespace Tests\Unit\Portal;

use App\Models\Organization;
use App\Services\Portal\AppointmentClock;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Appointment digits are stored as the venue's wall clock in a column without
 * a time zone; AppointmentClock is the portal's one place that turns them into
 * true instants (and what the client sends back into the stored form). At a
 * UTC venue every conversion is the identity.
 */
class AppointmentClockTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema;

    public function test_summer_digits_in_riga_carry_plus_three(): void
    {
        $at = AppointmentClock::toInstant('2026-10-01 10:00:00', 'Europe/Riga');

        $this->assertSame('2026-10-01T10:00:00+03:00', $at->toIso8601String());
        $this->assertSame('2026-10-01T07:00:00+00:00', $at->utc()->toIso8601String());
        $this->assertSame('2026-10-01T10:00:00+03:00', AppointmentClock::iso('2026-10-01 10:00:00', 'Europe/Riga'));
    }

    public function test_winter_digits_in_riga_carry_plus_two(): void
    {
        $this->assertSame('2026-12-01T10:00:00+02:00', AppointmentClock::iso('2026-12-01 10:00:00', 'Europe/Riga'));
    }

    public function test_the_digits_are_read_never_converted(): void
    {
        // The model hands over a Carbon in the application zone (UTC), and the
        // scheduler emits `+00:00` strings: both carry the wall-clock digits.
        $model = CarbonImmutable::parse('2026-10-01 10:00:00', 'UTC');
        $this->assertSame('2026-10-01T10:00:00+03:00', AppointmentClock::iso($model, 'Europe/Riga'));
        $this->assertSame('2026-10-01T10:00:00+03:00', AppointmentClock::iso('2026-10-01T10:00:00+00:00', 'Europe/Riga'));
        // Even a value in another zone gives up its own digits, not its instant.
        $this->assertSame('2026-10-01T10:00:00+03:00', AppointmentClock::iso(new \DateTimeImmutable('2026-10-01 10:00:00', new \DateTimeZone('America/New_York')), 'Europe/Riga'));
        $this->assertSame('Europe/Riga', AppointmentClock::toInstant('2026-10-01 10:00:00', 'Europe/Riga')->getTimezone()->getName());
    }

    public function test_a_utc_venue_is_the_identity(): void
    {
        $this->assertSame('2026-10-01T10:00:00+00:00', AppointmentClock::iso('2026-10-01 10:00:00', 'UTC'));
        $this->assertSame('2026-10-01T10:00:00+00:00', AppointmentClock::iso('2026-10-01T10:00:00+00:00', 'UTC'));
        $this->assertSame(
            CarbonImmutable::parse('2026-10-01T10:00:00+00:00')->getTimestamp(),
            AppointmentClock::toInstant(CarbonImmutable::parse('2026-10-01 10:00:00', 'UTC'), 'UTC')->getTimestamp(),
        );
        $this->assertTrue(AppointmentClock::existsLocally('2026-10-01 10:00:00', 'UTC'));
    }

    public function test_the_hour_a_daylight_saving_change_skips_does_not_exist(): void
    {
        // Riga, Sunday 29 March 2026: the clocks go from 03:00 straight to 04:00.
        $this->assertFalse(AppointmentClock::existsLocally('2026-03-29 03:00:00', 'Europe/Riga'));
        $this->assertFalse(AppointmentClock::existsLocally('2026-03-29T03:30:00+00:00', 'Europe/Riga'));
        $this->assertFalse(AppointmentClock::existsLocally('2026-03-29 03:59:00', 'Europe/Riga'));
        $this->assertTrue(AppointmentClock::existsLocally('2026-03-29 02:59:00', 'Europe/Riga'));
        $this->assertTrue(AppointmentClock::existsLocally('2026-03-29 04:00:00', 'Europe/Riga'));
        $this->assertTrue(AppointmentClock::existsLocally('2026-03-29 03:30:00', 'UTC'));
    }

    public function test_the_hour_that_occurs_twice_keeps_its_digits(): void
    {
        // Riga, Sunday 25 October 2026: 03:00–03:59 happens twice; PHP picks one occurrence.
        $this->assertTrue(AppointmentClock::existsLocally('2026-10-25 03:30:00', 'Europe/Riga'));
        $this->assertStringStartsWith('2026-10-25T03:30:00+0', AppointmentClock::iso('2026-10-25 03:30:00', 'Europe/Riga'));
    }

    public static function clientForms(): array
    {
        return [
            'Z'                         => ['2026-10-01T14:00:00Z'],
            'plus zero'                 => ['2026-10-01T14:00:00+00:00'],
            'the venue offset'          => ['2026-10-01T14:00:00+03:00'],
            'a western offset'          => ['2026-10-01T14:00:00-04:00'],
            'fractional seconds, Z'     => ['2026-10-01T14:00:00.000Z'],
            'fractional seconds, +3'    => ['2026-10-01T14:00:00.123456+03:00'],
            'no seconds'                => ['2026-10-01T14:00+03:00'],
            'space, no offset'          => ['2026-10-01 14:00:00'],
        ];
    }

    #[DataProvider('clientForms')]
    public function test_what_the_client_sends_becomes_exactly_what_the_scheduler_emits(string $raw): void
    {
        $this->assertSame('2026-10-01T14:00:00+00:00', AppointmentClock::fromClient($raw));
    }

    public function test_from_client_is_byte_for_byte_the_schedulers_own_format(): void
    {
        // ServiceSchedulingService::availableSlots() keys slots by CarbonImmutable::toIso8601String() in the app zone.
        $scheduler = CarbonImmutable::parse('2026-10-01 14:00:00')->toIso8601String();
        $this->assertSame($scheduler, AppointmentClock::fromClient($scheduler));
    }

    public function test_a_broken_zone_falls_back_to_the_application_zone(): void
    {
        $this->assertSame('2026-10-01T10:00:00+00:00', AppointmentClock::iso('2026-10-01 10:00:00', 'Mars/Olympus'));
        $this->assertSame('2026-10-01T10:00:00+00:00', AppointmentClock::iso('2026-10-01 10:00:00', ''));
    }

    /** The same test as PortalBootstrap::timezone(): an abbreviation or an offset is not a venue's zone; another name for UTC is UTC. */
    public function test_an_abbreviation_or_an_offset_falls_back_as_the_venue_zone_does(): void
    {
        $this->assertSame('2026-10-01T10:00:00+00:00', AppointmentClock::iso('2026-10-01 10:00:00', 'EET'));
        $this->assertSame('2026-10-01T10:00:00+00:00', AppointmentClock::iso('2026-10-01 10:00:00', '+03:00'));
        $this->assertSame('UTC', AppointmentClock::toInstant('2026-10-01 10:00:00', 'Etc/UTC')->getTimezone()->getName());
        $this->assertSame('2026-10-01T10:00:00-04:00', AppointmentClock::iso('2026-10-01 10:00:00', 'US/Eastern'));
    }

    public function test_the_zone_is_the_venues_and_is_read_once_per_organisation(): void
    {
        $this->setUpBookingRefundSchema(); // organizations + hotel_settings: the zone's two sources
        if (!Schema::hasColumn('organizations', 'timezone')) {
            Schema::table('organizations', fn ($t) => $t->string('timezone', 64)->nullable());
        }
        $riga = Organization::create(['name' => 'Riga', 'slug' => 'riga-' . uniqid(), 'timezone' => 'Europe/Riga']);
        $mars = Organization::create(['name' => 'Mars', 'slug' => 'mars-' . uniqid(), 'timezone' => 'Mars/Olympus']);
        $none = Organization::create(['name' => 'None', 'slug' => 'none-' . uniqid()]);

        DB::enableQueryLog();
        DB::flushQueryLog();
        $this->assertSame('Europe/Riga', AppointmentClock::zoneFor($riga->id));
        $this->assertCount(2, DB::getQueryLog(), 'one read of the organisation, one of its time zone setting');
        $this->assertSame('Europe/Riga', AppointmentClock::zoneFor($riga->id));
        $this->assertSame('Europe/Riga', AppointmentClock::zoneFor($riga->id));
        $this->assertCount(2, DB::getQueryLog(), 'a second call for the same organisation reads nothing, however many rows ask');

        $this->assertSame('UTC', AppointmentClock::zoneFor($mars->id), 'a zone PHP cannot construct falls back');
        $this->assertSame('UTC', AppointmentClock::zoneFor($none->id), 'no zone at all falls back');
        $this->assertSame('UTC', AppointmentClock::zoneFor(987654), 'an unknown organisation falls back');
    }

    public function test_the_memo_is_forgotten_with_the_scoped_instances(): void
    {
        $this->setUpBookingRefundSchema(); // organizations + hotel_settings: the zone's two sources
        if (!Schema::hasColumn('organizations', 'timezone')) {
            Schema::table('organizations', fn ($t) => $t->string('timezone', 64)->nullable());
        }
        $org = Organization::create(['name' => 'Riga', 'slug' => 'riga-' . uniqid(), 'timezone' => 'Europe/Riga']);
        $this->assertSame('Europe/Riga', AppointmentClock::zoneFor($org->id));

        DB::table('organizations')->where('id', $org->id)->update(['timezone' => 'Pacific/Auckland']);
        // A queue worker (between jobs) and Octane (between requests) forget scoped instances.
        $this->app->forgetScopedInstances();

        $this->assertSame('Pacific/Auckland', AppointmentClock::zoneFor($org->id));
    }
}
