<?php

namespace Tests\Unit\Appointments;

use App\Services\Booking\Setup\WeeklyHours;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class WeeklyHoursTest extends TestCase
{
    private function rejects(array $rows, string $key): void
    {
        try {
            WeeklyHours::normalise($rows, 'week');
            $this->fail('accepted ' . json_encode($rows));
        } catch (ValidationException $e) {
            $this->assertArrayHasKey($key, $e->errors());
        }
    }

    public function test_good_rows_come_back_in_the_stored_form(): void
    {
        $this->assertSame([
            ['day_of_week' => 1, 'start_time' => '09:00:00', 'end_time' => '13:00:00', 'is_active' => true],
            ['day_of_week' => 1, 'start_time' => '14:00:00', 'end_time' => '24:00:00', 'is_active' => true],
        ], WeeklyHours::normalise([
            ['day_of_week' => '1', 'start_time' => '09:00', 'end_time' => '13:00'],
            ['day_of_week' => 1, 'start_time' => '14:00:00', 'end_time' => '24:00'],
        ]));
    }

    public function test_bad_times_days_order_and_overlaps_are_refused(): void
    {
        $this->rejects([['day_of_week' => 1, 'start_time' => '25:00', 'end_time' => '26:00']], 'week.0');
        $this->rejects([['day_of_week' => 1, 'start_time' => '9:00', 'end_time' => '17:00']], 'week.0');
        $this->rejects([['day_of_week' => 7, 'start_time' => '09:00', 'end_time' => '17:00']], 'week.0');
        $this->rejects([['day_of_week' => 1, 'start_time' => '24:00', 'end_time' => '24:00']], 'week.0');
        $this->rejects([['day_of_week' => 1, 'start_time' => '18:00', 'end_time' => '09:00']], 'week.0');
        $this->rejects([
            ['day_of_week' => 2, 'start_time' => '09:00', 'end_time' => '13:00'],
            ['day_of_week' => 2, 'start_time' => '12:30', 'end_time' => '17:00'],
        ], 'week.1');
        $this->rejects(array_map(fn ($h) => ['day_of_week' => 3, 'start_time' => sprintf('%02d:00', $h), 'end_time' => sprintf('%02d:30', $h)], range(8, 14)), 'week.6');
    }

    public function test_an_inactive_row_never_overlaps(): void
    {
        $rows = WeeklyHours::normalise([
            ['day_of_week' => 2, 'start_time' => '09:00', 'end_time' => '13:00'],
            ['day_of_week' => 2, 'start_time' => '12:00', 'end_time' => '17:00', 'is_active' => false],
        ]);
        $this->assertFalse($rows[1]['is_active']);
        $this->assertSame([2 => [[540, 780]]], WeeklyHours::windowsByDay($rows));
    }

    public function test_minutes_of(): void
    {
        $this->assertSame(570, WeeklyHours::minutesOf('09:30'));
        $this->assertSame(570, WeeklyHours::minutesOf('09:30:00'));
        $this->assertSame(1440, WeeklyHours::minutesOf('24:00:00'));
    }
}
