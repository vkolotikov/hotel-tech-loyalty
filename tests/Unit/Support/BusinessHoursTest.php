<?php

namespace Tests\Unit\Support;

use App\Support\BusinessHours;
use Illuminate\Support\Carbon;
use PHPUnit\Framework\TestCase;

/**
 * The rule that decides whether a venue's widget says it is open.
 *
 * The bug these pin: the admin editor deletes a day from business_hours when
 * the venue toggles it off, but the code read an absent day as "not configured
 * for today = open". So a salon that switched Sunday off had its chat widget
 * greeting visitors on Sunday as though someone were there.
 */
class BusinessHoursTest extends TestCase
{
    private const WEEKDAYS = [
        'mon' => [['open' => '09:00', 'close' => '17:00']],
        'tue' => [['open' => '09:00', 'close' => '17:00']],
        'wed' => [['open' => '09:00', 'close' => '17:00']],
        'thu' => [['open' => '09:00', 'close' => '17:00']],
        'fri' => [['open' => '09:00', 'close' => '17:00']],
    ];

    private function sunday(string $time = '10:00'): Carbon
    {
        return Carbon::parse("2026-08-23 {$time}:00", 'UTC');   // a Sunday
    }

    private function monday(string $time = '10:00'): Carbon
    {
        return Carbon::parse("2026-08-24 {$time}:00", 'UTC');   // a Monday
    }

    public function test_a_day_the_venue_switched_off_is_closed(): void
    {
        // The bug. Sunday is absent because the editor deleted it.
        $this->assertFalse(BusinessHours::isOpenAt(self::WEEKDAYS, $this->sunday()));
    }

    public function test_a_venue_that_never_configured_hours_is_open(): void
    {
        // Must not change: most venues have never opened the hours editor, and
        // telling them they are shut is a worse bug than the one being fixed.
        $this->assertTrue(BusinessHours::isOpenAt(null, $this->sunday()));
        $this->assertTrue(BusinessHours::isOpenAt([], $this->sunday()));
        $this->assertTrue(BusinessHours::isOpenAt('not an array', $this->sunday()));
    }

    public function test_a_configured_day_is_open_inside_its_window(): void
    {
        $this->assertTrue(BusinessHours::isOpenAt(self::WEEKDAYS, $this->monday('10:00')));
    }

    public function test_a_configured_day_is_closed_outside_its_window(): void
    {
        $this->assertFalse(BusinessHours::isOpenAt(self::WEEKDAYS, $this->monday('20:00')));
        $this->assertFalse(BusinessHours::isOpenAt(self::WEEKDAYS, $this->monday('08:00')));
    }

    public function test_the_window_boundaries_are_inclusive(): void
    {
        $this->assertTrue(BusinessHours::isOpenAt(self::WEEKDAYS, $this->monday('09:00')));
        $this->assertTrue(BusinessHours::isOpenAt(self::WEEKDAYS, $this->monday('17:00')));
    }

    public function test_an_empty_array_for_a_day_is_closed(): void
    {
        $hours = self::WEEKDAYS + ['sun' => []];

        $this->assertFalse(BusinessHours::isOpenAt($hours, $this->sunday()));
    }

    public function test_blank_times_are_closed(): void
    {
        // Clearing a time input stores empty strings; the editor's own UI
        // renders that day as closed.
        $hours = self::WEEKDAYS + ['sun' => [['open' => '', 'close' => '']]];

        $this->assertFalse(BusinessHours::isOpenAt($hours, $this->sunday()));
    }

    public function test_one_blank_time_is_closed_not_half_open(): void
    {
        $hours = self::WEEKDAYS + ['sun' => [['open' => '09:00', 'close' => '']]];

        $this->assertFalse(BusinessHours::isOpenAt($hours, $this->sunday()));
    }

    public function test_several_windows_in_one_day_are_all_considered(): void
    {
        // The editor writes one slot per day, but the API validates only
        // `nullable|array`, so a split shift can be stored by other means and
        // must not be truncated to the first window.
        $hours = ['sun' => [
            ['open' => '09:00', 'close' => '12:00'],
            ['open' => '15:00', 'close' => '19:00'],
        ]];

        $this->assertTrue(BusinessHours::isOpenAt($hours, $this->sunday('16:00')));
        $this->assertFalse(BusinessHours::isOpenAt($hours, $this->sunday('13:00')));
    }

    public function test_a_blank_first_window_does_not_hide_a_real_second_one(): void
    {
        $hours = ['sun' => [
            ['open' => '', 'close' => ''],
            ['open' => '15:00', 'close' => '19:00'],
        ]];

        $this->assertTrue(BusinessHours::isOpenAt($hours, $this->sunday('16:00')));
    }

    public function test_malformed_windows_do_not_throw(): void
    {
        // The endpoint validates only `nullable|array`, so anything can be
        // stored. A public widget must degrade, never 500.
        foreach ([['sun' => 'closed'], ['sun' => [null]], ['sun' => [['open' => 5]]], ['sun' => [true]]] as $hours) {
            $this->assertFalse(BusinessHours::isOpenAt($hours, $this->sunday()));
        }
    }

    public function test_day_keys_match_what_the_editor_writes(): void
    {
        $this->assertSame('sun', BusinessHours::dayKey($this->sunday()));
        $this->assertSame('mon', BusinessHours::dayKey($this->monday()));
    }
}
