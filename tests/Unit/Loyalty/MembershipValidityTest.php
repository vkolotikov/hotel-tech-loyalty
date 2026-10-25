<?php

namespace Tests\Unit\Loyalty;

use App\Services\Loyalty\Members\MembershipValidity;
use PHPUnit\Framework\TestCase;

/**
 * A membership's end date by value (release 8, spec 2026-10-25 §3): its state on a venue day, the end Extend gives, the
 * days between two days, and what reads as a day.
 */
class MembershipValidityTest extends TestCase
{
    public function test_the_state_on_a_venue_day(): void
    {
        $this->assertSame('active', MembershipValidity::stateOf(null, true, '2026-10-05'));
        $this->assertSame('active', MembershipValidity::stateOf('2026-11-05', true, '2026-10-05'));   // 31 days left
        $this->assertSame('expiring', MembershipValidity::stateOf('2026-11-04', true, '2026-10-05')); // 30 days left
        $this->assertSame('expiring', MembershipValidity::stateOf('2026-10-05', true, '2026-10-05')); // the last day
        $this->assertSame('expired', MembershipValidity::stateOf('2026-10-04', true, '2026-10-05'));
        $this->assertSame('off', MembershipValidity::stateOf('2027-01-01', false, '2026-10-05'));
        $this->assertSame('off', MembershipValidity::stateOf(null, false, '2026-10-05'));
    }

    public function test_extend_counts_from_the_later_of_today_and_the_end_and_keeps_the_month_end(): void
    {
        $this->assertSame('2026-11-05', MembershipValidity::extended(null, '2026-10-05', 1));
        $this->assertSame('2027-01-05', MembershipValidity::extended('2026-09-01', '2026-10-05', 3));
        $this->assertSame('2027-04-03', MembershipValidity::extended('2026-10-03', '2026-10-01', 6));
        $this->assertSame('2027-10-03', MembershipValidity::extended('2026-10-03', '2026-10-03', 12));
        $this->assertSame('2027-02-28', MembershipValidity::extended('2027-01-31', '2026-10-05', 1));
        $this->assertSame('2028-02-28', MembershipValidity::extended('2027-02-28', '2026-10-05', 12));
        $this->assertSame('2028-02-29', MembershipValidity::extended('2028-01-31', '2026-10-05', 1));
        $this->assertSame(['1m' => 1, '3m' => 3, '6m' => 6, '1y' => 12], MembershipValidity::EXTENSIONS);
    }

    public function test_days_between_and_what_reads_as_a_day(): void
    {
        $this->assertSame(14, MembershipValidity::daysBetween('2026-10-05', '2026-10-19'));
        $this->assertSame(-1, MembershipValidity::daysBetween('2026-10-05', '2026-10-04'));
        $this->assertSame(0, MembershipValidity::daysBetween('2026-03-29', '2026-03-29'));
        // Across a clock change the count is in whole days.
        $this->assertSame(1, MembershipValidity::daysBetween('2026-03-28', '2026-03-29'));

        $this->assertTrue(MembershipValidity::isDay('2028-02-29'));
        foreach (['2027-02-29', '2027-13-01', '27-01-01', '2027-1-1', '01.01.2027', '', null, 20270101] as $bad) {
            $this->assertFalse(MembershipValidity::isDay($bad), var_export($bad, true));
        }
    }
}
