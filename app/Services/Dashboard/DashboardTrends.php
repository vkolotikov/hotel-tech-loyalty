<?php

namespace App\Services\Dashboard;

use App\Models\Booking;
use App\Models\ChatConversation;
use App\Models\Inquiry;
use App\Models\LoyaltyMember;
use App\Models\PointsTransaction;
use App\Models\ServiceBooking;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

/**
 * The full admin dashboard's day-by-day figures (2026-11-09, "KPI, main graphs"): one aligned series per measure over
 * the last 7, 14, 30 or 90 days, each with its total and the previous period's, so every tile draws its sparkline and
 * its change from one request. Reads only, under the request's tenant and brand scopes, cached for five minutes per
 * organisation, brand and period.
 *
 * Each measure keeps the definition the dashboard already used: booking revenue and bookings by the day they were
 * made (AnalyticsService's), appointments by their own day without cancelled or no-show ones (its service trends),
 * members by the day they joined, points as earned and redeemed by unreversed lines, leads and website chats by the day
 * they came in. Days are the database's dates, as everywhere on this dashboard. A measure whose table cannot be read
 * answers null rather than failing the whole dashboard.
 */
final class DashboardTrends
{
    public const PERIODS = [7, 14, 30, 90];

    public const DEFAULT_PERIOD = 30;

    /**
     * @return array{days: int, from: string, to: string, dates: list<string>, series: array<string, list<float>|null>, totals: array<string, array{current: float, previous: float, change: float|null}|null>}
     */
    public function for(int $days): array
    {
        $days = in_array($days, self::PERIODS, true) ? $days : self::DEFAULT_PERIOD;
        $brand = app()->bound('current_brand_id') ? (app('current_brand_id') ?: 'all') : 'all';
        $org = app()->bound('current_organization_id') ? app('current_organization_id') : 'none';

        return Cache::remember("dashboard:trends:{$days}:org:{$org}:brand:{$brand}", 300, fn () => $this->compute($days, CarbonImmutable::now()));
    }

    /**
     * @return array{days: int, from: string, to: string, dates: list<string>, series: array<string, list<float>|null>, totals: array<string, array{current: float, previous: float, change: float|null}|null>}
     */
    public function compute(int $days, CarbonImmutable $now): array
    {
        $to = $now->endOfDay();
        $from = $now->startOfDay()->subDays($days - 1);
        $prevTo = $from->subSecond();
        $prevFrom = $from->subDays($days);

        $dates = [];
        for ($d = $from; $d <= $to; $d = $d->addDay()) {
            $dates[] = $d->format('Y-m-d');
        }

        $series = [];
        $totals = [];
        foreach ($this->measures() as $name => [$query, $column, $aggregate]) {
            try {
                $rows = $query()
                    ->whereBetween($column, [$from->format('Y-m-d H:i:s'), $to->format('Y-m-d H:i:s')])
                    ->selectRaw("DATE({$column}) as day, {$aggregate} as value")
                    ->groupByRaw("DATE({$column})")
                    ->toBase()
                    ->get();
                $byDay = [];
                foreach ($rows as $row) {
                    $byDay[substr((string) $row->day, 0, 10)] = (float) $row->value;
                }
                $line = array_map(static fn (string $day) => round($byDay[$day] ?? 0.0, 2), $dates);

                $previous = (float) ($query()
                    ->whereBetween($column, [$prevFrom->format('Y-m-d H:i:s'), $prevTo->format('Y-m-d H:i:s')])
                    ->selectRaw("{$aggregate} as value")
                    ->toBase()
                    ->value('value') ?? 0);
            } catch (\Throwable $e) {
                Log::info('dashboard.trends.measure_unavailable', ['measure' => $name, 'error' => $e->getMessage()]);
                $series[$name] = null;
                $totals[$name] = null;

                continue;
            }

            $current = round(array_sum($line), 2);
            $series[$name] = $line;
            $totals[$name] = [
                'current' => $current,
                'previous' => round($previous, 2),
                'change' => $previous > 0 ? round((($current - $previous) / $previous) * 100, 1) : null,
            ];
        }

        return [
            'days' => $days,
            'from' => $from->format('Y-m-d'),
            'to' => $to->format('Y-m-d'),
            'dates' => $dates,
            'series' => $series,
            'totals' => $totals,
        ];
    }

    /**
     * name => [a fresh query, the date column, the aggregate].
     *
     * @return array<string, array{0: \Closure(): Builder<\Illuminate\Database\Eloquent\Model>, 1: string, 2: string}>
     */
    private function measures(): array
    {
        $liveServices = static fn () => ServiceBooking::query()->whereNotIn('status', ['cancelled', 'no_show']);
        $points = static fn () => PointsTransaction::query()->where('is_reversed', false);

        return [
            'revenue' => [static fn () => Booking::query(), 'created_at', 'COALESCE(SUM(total_amount), 0)'],
            'bookings' => [static fn () => Booking::query(), 'created_at', 'COUNT(*)'],
            'services' => [$liveServices, 'start_at', 'COUNT(*)'],
            'service_revenue' => [$liveServices, 'start_at', 'COALESCE(SUM(total_amount), 0)'],
            'members' => [static fn () => LoyaltyMember::query(), 'joined_at', 'COUNT(*)'],
            'points_earned' => [static fn () => $points()->where('points', '>', 0), 'created_at', 'COALESCE(SUM(points), 0)'],
            'points_redeemed' => [static fn () => $points()->where('type', 'redeem'), 'created_at', 'COALESCE(SUM(ABS(points)), 0)'],
            'leads' => [static fn () => Inquiry::query(), 'created_at', 'COUNT(*)'],
            'chats' => [static fn () => ChatConversation::query(), 'created_at', 'COUNT(*)'],
        ];
    }
}
