<?php

namespace Tests\Unit\Appointments;

use App\Services\Appointments\Insights\VisitGroup;
use Carbon\CarbonImmutable;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/** Part G §4.2: every appointment falls into exactly one group, by what it is now. */
class VisitGroupTest extends TestCase
{
    private static function at(string $time, string $zone = 'UTC'): CarbonImmutable
    {
        return CarbonImmutable::parse($time, $zone);
    }

    /** @return array<string, array{0: string, 1: ?string}> */
    public static function statuses(): array
    {
        return [
            'completed'         => ['completed', 'done'],
            'no-show'           => ['no_show', 'no_show'],
            'pending, past'     => ['pending', 'unmarked'],
            'confirmed, past'   => ['confirmed', 'unmarked'],
            'in progress, past' => ['in_progress', 'unmarked'],
            'unknown'           => ['failed', null],
        ];
    }

    #[DataProvider('statuses')]
    public function test_each_status_has_one_group(string $status, ?string $group): void
    {
        $this->assertSame($group, VisitGroup::of($status, self::at('2026-10-05 09:00'), null, self::at('2026-10-05 10:00'), 24));
    }

    public function test_a_live_appointment_is_ahead_until_its_start(): void
    {
        $now = self::at('2026-10-05 10:00');
        $this->assertSame('ahead', VisitGroup::of('confirmed', self::at('2026-10-05 10:01'), null, $now, 24));
        $this->assertSame('unmarked', VisitGroup::of('confirmed', self::at('2026-10-05 10:00'), null, $now, 24));
        $this->assertSame('unmarked', VisitGroup::of('pending', self::at('2026-10-05 09:59'), null, $now, 24));
    }

    public function test_a_cancellation_is_late_only_after_the_free_cancellation_deadline(): void
    {
        $start = self::at('2026-10-06 10:00');
        $now = self::at('2026-10-07 12:00');
        $this->assertSame('early_cancel', VisitGroup::of('cancelled', $start, self::at('2026-10-05 10:00:00'), $now, 24)); // at the deadline
        $this->assertSame('late_cancel', VisitGroup::of('cancelled', $start, self::at('2026-10-05 10:00:01'), $now, 24));
        $this->assertSame('late_cancel', VisitGroup::of('cancelled', $start, self::at('2026-10-06 11:00'), $now, 24)); // after the start
        $this->assertSame('early_cancel', VisitGroup::of('cancelled', $start, null, $now, 24)); // no time recorded: nobody is blamed
    }

    public function test_a_zero_hour_window_makes_only_a_cancellation_after_the_start_late(): void
    {
        $start = self::at('2026-10-06 10:00');
        $now = self::at('2026-10-07 12:00');
        $this->assertSame('early_cancel', VisitGroup::of('cancelled', $start, self::at('2026-10-06 09:59'), $now, 0));
        $this->assertSame('late_cancel', VisitGroup::of('cancelled', $start, self::at('2026-10-06 10:01'), $now, 0));
    }

    public function test_the_window_is_counted_in_real_hours_across_a_clock_change(): void
    {
        // Riga goes from +03:00 to +02:00 at 04:00 on Sunday 25 October 2026. 24 real hours before 10:00 that day is
        // 11:00 on the 24th by the wall clock, not 10:00.
        $start = self::at('2026-10-25 10:00', 'Europe/Riga');
        $now = self::at('2026-10-26 12:00', 'Europe/Riga');
        $this->assertSame('early_cancel', VisitGroup::of('cancelled', $start, self::at('2026-10-24 10:30', 'Europe/Riga'), $now, 24));
        $this->assertSame('late_cancel', VisitGroup::of('cancelled', $start, self::at('2026-10-24 11:30', 'Europe/Riga'), $now, 24));
    }

    public function test_bookings_due_are_the_four_groups_the_venue_kept_time_for(): void
    {
        $this->assertSame(['done', 'no_show', 'unmarked', 'late_cancel'], VisitGroup::DUE);
        $this->assertSame(['done', 'no_show', 'unmarked', 'late_cancel', 'early_cancel', 'ahead'], VisitGroup::ALL);
    }
}
