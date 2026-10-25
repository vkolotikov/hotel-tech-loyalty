<?php

namespace Tests\Unit\Loyalty;

use App\Models\LoyaltyEvent;
use App\Services\Loyalty\Events\EventClock;
use PHPUnit\Framework\TestCase;

/**
 * Event times (release 8, spec 2026-10-25 §4), by value: the venue's wall clock read and written as digits whatever
 * form the driver hands back (never converted, an offset ignored), a time that does not exist refused, where an event
 * is in its life against the venue's "now", and the English the notices say.
 */
class EventClockTest extends TestCase
{
    private function event(string $start, string $end, string $status = LoyaltyEvent::PUBLISHED): LoyaltyEvent
    {
        return (new LoyaltyEvent())->forceFill(['organization_id' => 1, 'starts_at' => $start, 'ends_at' => $end, 'status' => $status]);
    }

    public function test_stored_times_read_as_their_digits_whatever_the_driver_hands_back(): void
    {
        $this->assertSame('2026-10-09 18:00:00', EventClock::digits('2026-10-09 18:00:00'));
        $this->assertSame('2026-10-09 18:00:00', EventClock::digits('2026-10-09T18:00:00+03:00'), 'an offset is ignored, never applied');
        $this->assertSame('2026-10-09T18:00', EventClock::wall('2026-10-09 18:00:00'));
        $this->assertSame('2026-10-09T18:00', EventClock::wall(new \DateTimeImmutable('2026-10-09 18:00:00', new \DateTimeZone('Asia/Tokyo'))));
        $this->assertNull(EventClock::digits(null));
    }

    public function test_a_wall_clock_time_is_written_as_digits_and_a_time_that_does_not_exist_is_refused(): void
    {
        $this->assertSame('2026-10-09 18:00:00', EventClock::stored('2026-10-09T18:00'));
        $this->assertNull(EventClock::stored('2026-09-31T18:00'));
        $this->assertNull(EventClock::stored('2026-10-09T25:00'));
        $this->assertNull(EventClock::stored('2026-10-09 18:00'));
        $this->assertNull(EventClock::stored('2026-10-09T18:00:00'));
    }

    public function test_the_phase_follows_the_venues_now_and_the_status(): void
    {
        $event = $this->event('2026-10-09 18:00:00', '2026-10-09 21:00:00');
        $this->assertSame('upcoming', EventClock::phase($event, '2026-10-09 17:59:59'));
        $this->assertSame('on_now', EventClock::phase($event, '2026-10-09 18:00:00'));
        $this->assertSame('on_now', EventClock::phase($event, '2026-10-09 20:59:00'));
        $this->assertSame('ended', EventClock::phase($event, '2026-10-09 21:00:00'));
        $this->assertSame('draft', EventClock::phase($this->event('2026-10-09 18:00:00', '2026-10-09 21:00:00', LoyaltyEvent::DRAFT), '2026-10-01 00:00:00'));
        $this->assertSame('cancelled', EventClock::phase($this->event('2026-10-09 18:00:00', '2026-10-09 21:00:00', LoyaltyEvent::CANCELLED), '2026-10-01 00:00:00'));
        $this->assertSame('2026-10-09', EventClock::day($event));
    }

    public function test_a_venue_day_ends_at_the_next_midnight(): void
    {
        $this->assertSame('2026-10-10 00:00:00', EventClock::dayAfter('2026-10-09'));
        $this->assertSame('2027-01-01 00:00:00', EventClock::dayAfter('2026-12-31'));
    }

    public function test_the_notices_say_when_in_english(): void
    {
        $this->assertSame('Fri 9 Oct, 18:00–21:00', EventClock::sayWhen($this->event('2026-10-09 18:00:00', '2026-10-09 21:00:00')));
        $this->assertSame('Fri 9 Oct 22:00 – Sat 10 Oct 02:00', EventClock::sayWhen($this->event('2026-10-09 22:00:00', '2026-10-10 02:00:00')));
    }
}
