<?php

namespace Tests\Unit\Appointments;

use App\Services\Appointments\VenueClock;
use Carbon\CarbonImmutable;
use Tests\TestCase;

class VenueClockTest extends TestCase
{
    public function test_wall_prints_the_stored_digits_with_no_offset(): void
    {
        $this->assertSame('2026-10-06T10:00', VenueClock::wall('2026-10-06 10:00:00'));
        $this->assertSame('2026-10-06T10:00', VenueClock::wall(CarbonImmutable::parse('2026-10-06 10:00:00')));
        $this->assertSame('2026-10-06T10:00', VenueClock::wall('2026-10-06T10:00:00+00:00'));
        $this->assertNull(VenueClock::wall(null));
    }

    public function test_parse_accepts_only_the_wall_clock_form(): void
    {
        $this->assertSame('2026-10-06 10:00:00', VenueClock::parse('2026-10-06T10:00')?->format('Y-m-d H:i:s'));

        foreach (['2026-10-06 10:00', '2026-10-06T10:00:00', '2026-10-06T10:00Z', '2026-10-06T10:00+03:00', '2026-02-31T10:00', '2026-10-06T25:00', 'tomorrow', ''] as $bad) {
            $this->assertNull(VenueClock::parse($bad), "accepted: {$bad}");
        }
    }
}
