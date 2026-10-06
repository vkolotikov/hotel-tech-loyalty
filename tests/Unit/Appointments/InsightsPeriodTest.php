<?php

namespace Tests\Unit\Appointments;

use App\Services\Appointments\AppointmentRefused;
use App\Services\Appointments\Insights\InsightsPeriod;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/** Part G §4.1 and §4.7: the period, and the one it is compared with. */
class InsightsPeriodTest extends TestCase
{
    private static function before(string $from, string $to): array
    {
        $p = InsightsPeriod::fromInput($from, $to)->previous();

        return [$p->from, $p->to];
    }

    public function test_a_calendar_month_is_compared_with_the_whole_month_before(): void
    {
        $this->assertSame(['2026-09-01', '2026-09-30'], self::before('2026-10-01', '2026-10-31'));
        $this->assertSame(['2026-02-01', '2026-02-28'], self::before('2026-03-01', '2026-03-31'));
        $this->assertSame(['2025-12-01', '2025-12-31'], self::before('2026-01-01', '2026-01-31'));
        $this->assertTrue(InsightsPeriod::fromInput('2026-02-01', '2026-02-28')->isCalendarMonth());
        $this->assertFalse(InsightsPeriod::fromInput('2026-10-01', '2026-10-15')->isCalendarMonth());
    }

    public function test_anything_else_is_compared_with_the_same_number_of_days_just_before(): void
    {
        $this->assertSame(['2026-09-28', '2026-10-04'], self::before('2026-10-05', '2026-10-11')); // a Monday–Sunday week
        $this->assertSame(['2026-09-23', '2026-10-02'], self::before('2026-10-03', '2026-10-12')); // ten days
        $this->assertSame(['2026-09-16', '2026-09-30'], self::before('2026-10-01', '2026-10-15')); // half a month
        $this->assertSame(['2026-10-04', '2026-10-04'], self::before('2026-10-05', '2026-10-05')); // one day
    }

    public function test_it_knows_its_length_and_the_day_after(): void
    {
        $p = InsightsPeriod::fromInput('2026-10-05', '2026-10-11');
        $this->assertSame(7, $p->days());
        $this->assertSame('2026-10-12', $p->dayAfter());
        $this->assertSame(['from' => '2026-10-05', 'to' => '2026-10-11', 'days' => 7], $p->toApi());
        $this->assertSame('2027-01-01', InsightsPeriod::fromInput('2026-12-31', '2026-12-31')->dayAfter());
    }

    public function test_up_to_366_days_are_allowed(): void
    {
        $this->assertSame(366, InsightsPeriod::fromInput('2026-01-01', '2027-01-01')->days());
    }

    /** @return array<string, array{0: mixed, 1: mixed}> */
    public static function refused(): array
    {
        return [
            '367 days'          => ['2026-01-01', '2027-01-02'],
            'from after to'     => ['2026-10-12', '2026-10-11'],
            'a day that is not' => ['2026-02-30', '2026-03-05'],
            'no from'           => [null, '2026-10-11'],
            'no to'             => ['2026-10-05', null],
            'short form'        => ['2026-10-5', '2026-10-11'],
            'a word'            => ['yesterday', '2026-10-11'],
            'an array'          => [['2026-10-05'], '2026-10-11'],
        ];
    }

    #[DataProvider('refused')]
    public function test_a_bad_period_is_refused(mixed $from, mixed $to): void
    {
        try {
            InsightsPeriod::fromInput($from, $to);
            $this->fail('accepted');
        } catch (AppointmentRefused $e) {
            $this->assertSame('invalid_period', $e->errorCode);
            $this->assertSame(422, $e->status);
            $this->assertSame('Choose a period of up to a year.', $e->getMessage());
        }
    }
}
