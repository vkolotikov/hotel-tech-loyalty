<?php

namespace App\Services\Loyalty\Overview;

use App\Services\Appointments\VenueClock;
use App\Services\Loyalty\Insights\InsightsPeriod;
use Carbon\CarbonImmutable;

/** Insights' venue-calendar starts, with a single exclusive as-of end (never future activity). */
final class OverviewPeriod
{
    public readonly CarbonImmutable $now;
    public readonly InsightsPeriod $period;
    public readonly string $zone;

    public function __construct(int $orgId, string $choice)
    {
        $this->now = CarbonImmutable::now('UTC');
        $this->zone = VenueClock::zone($orgId);
        $this->period = InsightsPeriod::of($choice, $this->now->setTimezone($this->zone)->toDateString(), $this->zone);
    }

    public function between($query, string $column)
    {
        return $query->where($column, '>=', $this->period->startUtc())->where($column, '<', $this->now->format('Y-m-d H:i:s'));
    }

    public function payload(): array
    {
        return ['choice' => $this->period->choice, 'from' => $this->period->from, 'to' => $this->period->to,
            'start' => $this->period->startUtc(), 'end' => $this->now->toIso8601String(), 'timezone' => $this->zone];
    }
}
