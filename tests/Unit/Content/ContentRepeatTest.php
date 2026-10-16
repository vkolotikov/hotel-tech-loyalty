<?php

namespace Tests\Unit\Content;

use App\Services\Content\ContentRepeat;
use PHPUnit\Framework\TestCase;

/** The days a repeated post's copies land on (spec 2026-10-15 §8). */
class ContentRepeatTest extends TestCase
{
    public function test_weekly_and_fortnightly_copies_keep_the_weekday_and_include_the_last_day(): void
    {
        $this->assertSame(['2026-10-14', '2026-10-21', '2026-10-28'], ContentRepeat::dates('2026-10-07', 'week', '2026-10-28', '2026-10-05'));
        $this->assertSame(['2026-10-21', '2026-11-04'], ContentRepeat::dates('2026-10-07', '2weeks', '2026-11-10', '2026-10-05'));
    }

    public function test_monthly_copies_take_the_months_last_day_when_it_is_shorter(): void
    {
        $this->assertSame(['2028-02-29', '2028-03-31'], ContentRepeat::dates('2028-01-31', 'month', '2028-03-31', '2028-01-01'));
        $this->assertSame(['2026-11-15', '2026-12-15'], ContentRepeat::dates('2026-10-15', 'month', '2026-12-31', '2026-10-05'));
    }

    public function test_days_already_gone_are_left_out(): void
    {
        $this->assertSame(['2026-10-07'], ContentRepeat::dates('2026-09-23', 'week', '2026-10-07', '2026-10-05'));
    }
}
