<?php

namespace Tests\Feature\Booking;

use App\Models\BookingMirror;
use App\Models\HotelSetting;
use App\Models\Organization;
use App\Models\ServiceBooking;
use App\Services\Booking\CancellationPolicy;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

class CancellationPolicyTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema;

    private Organization $org;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpBookingRefundSchema(); // organizations, hotel_settings, booking_mirror
        if (!Schema::hasColumn('organizations', 'timezone')) {
            Schema::table('organizations', fn ($t) => $t->string('timezone')->nullable());
        }
        $this->org = Organization::create(['name' => 'Seaside Hotel', 'slug' => 'seaside-' . uniqid(), 'timezone' => 'Europe/Riga']);
        app()->instance('current_organization_id', $this->org->id);
        $this->travelTo('2026-10-01 09:00:00'); // UTC; Riga is UTC+3 on this date
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        parent::tearDown();
    }

    private function setting(string $key, string $value): void
    {
        $row = new HotelSetting();
        $row->organization_id = $this->org->id;
        $row->key = $key;
        $row->value = $value;
        $row->save();
        HotelSetting::flushCacheFor($this->org->id);
    }

    private function service(array $attrs = []): ServiceBooking
    {
        return (new ServiceBooking())->forceFill(array_merge([
            'organization_id' => $this->org->id, 'status' => 'confirmed', 'payment_status' => 'unpaid',
            'start_at' => now()->addDays(3), 'end_at' => now()->addDays(3)->addHour(),
        ], $attrs));
    }

    private function stay(array $attrs = []): BookingMirror
    {
        return (new BookingMirror())->forceFill(array_merge([
            'organization_id' => $this->org->id, 'internal_status' => 'confirmed', 'booking_state' => 'confirmed',
            'channel_name' => 'Member portal', 'payment_status' => 'paid', 'booking_group_id' => null,
            'arrival_date' => '2026-10-10', 'departure_date' => '2026-10-12',
        ], $attrs));
    }

    /**
     * start_at digits are the venue's wall clock. The clock is 09:00 UTC =
     * 12:00 in Riga, so "25 h away" is 13:00 Riga tomorrow and its deadline
     * 13:00 Riga today — the same instant, 10:00 UTC.
     */
    public function test_a_service_booking_can_be_cancelled_until_the_venues_hours_before_it_starts(): void
    {
        $p = CancellationPolicy::forService($this->service(['start_at' => '2026-10-02 13:00:00'])); // 25 h away, default 24
        $this->assertTrue($p['can_cancel']);
        $this->assertNull($p['reason']);
        $this->assertSame('2026-10-01T13:00:00+03:00', $p['deadline']->toIso8601String());

        $late = CancellationPolicy::forService($this->service(['start_at' => '2026-10-02 11:00:00'])); // 23 h away
        $this->assertFalse($late['can_cancel']);
        $this->assertSame('outside_policy', $late['reason']);
        $this->assertNotNull($late['deadline'], 'the portal can still say when it ended');
    }

    /**
     * An appointment's stored digits are the venue's wall clock. 10:00 on
     * 1 October in Riga is 07:00 UTC; 24 hours before it is 30 September
     * 10:00 Riga — 07:00 UTC.
     */
    public function test_an_appointments_deadline_is_counted_from_the_venues_clock(): void
    {
        $b = $this->service(['start_at' => '2026-10-01 10:00:00']);

        $p = CancellationPolicy::forService($b, CarbonImmutable::parse('2026-09-30 06:59:59', 'UTC'));
        $this->assertSame('2026-09-30T10:00:00+03:00', $p['deadline']->toIso8601String());
        $this->assertTrue($p['can_cancel'], 'one second before');

        $at = CancellationPolicy::forService($b, CarbonImmutable::parse('2026-09-30 07:00:00', 'UTC'));
        $this->assertFalse($at['can_cancel'], 'at the deadline');
        $this->assertSame('outside_policy', $at['reason']);

        $this->assertFalse(CancellationPolicy::forService($b, CarbonImmutable::parse('2026-09-30 07:00:01', 'UTC'))['can_cancel'], 'one second after');
    }

    public function test_an_appointment_that_started_on_the_venues_clock_has_started(): void
    {
        $this->setting('services_cancel_hours', '0');
        $b = $this->service(['start_at' => '2026-10-01 10:00:00']); // 07:00 UTC

        $this->assertTrue(CancellationPolicy::forService($b, CarbonImmutable::parse('2026-10-01 06:59:59', 'UTC'))['can_cancel']);
        $this->assertFalse(CancellationPolicy::forService($b, CarbonImmutable::parse('2026-10-01 07:30:00', 'UTC'))['can_cancel'], '10:30 Riga: it has started, though "10:00 UTC" is still ahead');
    }

    /** Digits on the Riga clock: it is 12:00 there. */
    public function test_the_venues_own_hours_are_used(): void
    {
        $this->setting('services_cancel_hours', '2');
        $this->assertTrue(CancellationPolicy::forService($this->service(['start_at' => '2026-10-01 15:00:00']))['can_cancel']);

        $this->setting('services_cancel_hours', '0');
        $this->assertTrue(CancellationPolicy::forService($this->service(['start_at' => '2026-10-01 12:30:00']))['can_cancel'], 'zero hours: until it starts');
        $this->assertFalse(CancellationPolicy::forService($this->service(['start_at' => '2026-10-01 11:30:00']))['can_cancel'], 'never once it has started');
    }

    public function test_only_pending_and_confirmed_service_bookings_that_were_not_refunded(): void
    {
        $this->assertTrue(CancellationPolicy::forService($this->service(['status' => 'pending']))['can_cancel']);
        foreach (['in_progress', 'completed'] as $status) {
            $this->assertSame('not_cancellable', CancellationPolicy::forService($this->service(['status' => $status]))['reason'], $status);
        }
        foreach (['cancelled', 'no_show'] as $status) {
            $this->assertSame('already_cancelled', CancellationPolicy::forService($this->service(['status' => $status]))['reason'], $status);
        }
        $this->assertSame('not_cancellable', CancellationPolicy::forService($this->service(['payment_status' => 'refunded']))['reason']);
    }

    public function test_a_stay_is_measured_from_the_check_in_time_in_the_venues_own_zone(): void
    {
        // Arrival 10 Oct, check-in 15:00 Riga = 12:00 UTC; 48 h before = 8 Oct 12:00 UTC.
        $p = CancellationPolicy::forStay($this->stay());
        $this->assertTrue($p['can_cancel']);
        $this->assertSame('2026-10-08T12:00:00+00:00', $p['deadline']->utc()->toIso8601String());

        $this->travelTo('2026-10-08 12:30:00');
        $late = CancellationPolicy::forStay($this->stay());
        $this->assertFalse($late['can_cancel']);
        $this->assertSame('outside_policy', $late['reason']);
    }

    public function test_the_venues_check_in_time_and_the_bookings_own_are_used(): void
    {
        $this->setting('booking_policies', json_encode(['check_in_time' => '18:00']));
        $this->assertSame('2026-10-08T15:00:00+00:00', CancellationPolicy::forStay($this->stay())['deadline']->utc()->toIso8601String());
        $this->assertSame('2026-10-08T09:00:00+00:00', CancellationPolicy::forStay($this->stay(['check_in_time' => '12:00:00']))['deadline']->utc()->toIso8601String());
    }

    public function test_only_a_direct_single_room_stay_with_untouched_money(): void
    {
        $this->assertTrue(CancellationPolicy::forStay($this->stay(['channel_name' => 'Website', 'internal_status' => 'new']))['can_cancel']);
        $this->assertTrue(CancellationPolicy::forStay($this->stay(['internal_status' => 'pending_pms_sync', 'payment_status' => 'open']))['can_cancel']);

        foreach ([
            'another channel'   => ['channel_name' => 'Booking.com'],
            'no channel'        => ['channel_name' => null],
            'a combination'     => ['booking_group_id' => 'a3f0c2de-0000-4000-8000-000000000001'],
            'checked in'        => ['internal_status' => 'checked-in'],
            'checked out'       => ['internal_status' => 'checked-out'],
            'refunded'          => ['payment_status' => 'refunded'],
            'partly refunded'   => ['payment_status' => 'partially_refunded'],
            'disputed'          => ['payment_status' => 'disputed'],
            'channel managed'   => ['payment_status' => 'channel_managed'],
            'no arrival date'   => ['arrival_date' => null],
        ] as $case => $attrs) {
            $this->assertSame('not_cancellable', CancellationPolicy::forStay($this->stay($attrs))['reason'], $case);
        }
        $this->assertSame('already_cancelled', CancellationPolicy::forStay($this->stay(['internal_status' => 'cancelled']))['reason']);
        $this->assertSame('already_cancelled', CancellationPolicy::forStay($this->stay(['booking_state' => 'cancelled']))['reason']);
    }

    public function test_a_broken_timezone_falls_back_instead_of_failing(): void
    {
        Organization::withoutGlobalScopes()->whereKey($this->org->id)->update(['timezone' => 'Mars/Olympus']);
        $this->assertTrue(CancellationPolicy::forStay($this->stay())['can_cancel']);
    }

    /** A list of stays reads the organisation and the settings once per request, not once per row. */
    public function test_forstay_reads_the_venue_once_for_a_whole_list(): void
    {
        $this->app->forgetScopedInstances();
        $queries = [];
        \Illuminate\Support\Facades\DB::listen(function ($q) use (&$queries) {
            $queries[] = $q->sql;
        });

        $answers = [];
        foreach (['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13'] as $day) {
            $answers[] = CancellationPolicy::forStay($this->stay(['arrival_date' => $day]))['deadline']->toIso8601String();
        }

        $this->assertSame(['2026-10-08T15:00:00+03:00', '2026-10-09T15:00:00+03:00', '2026-10-10T15:00:00+03:00', '2026-10-11T15:00:00+03:00'], $answers);
        $this->assertLessThanOrEqual(1, count(array_filter($queries, fn ($sql) => str_contains($sql, 'organizations'))), 'the organisation is read once');
        $this->assertLessThanOrEqual(1, count(array_filter($queries, fn ($sql) => str_contains($sql, 'hotel_settings'))), 'the settings are read once');
    }
}
