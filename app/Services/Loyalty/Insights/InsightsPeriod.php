<?php

namespace App\Services\Loyalty\Insights;

use Carbon\CarbonImmutable;

/**
 * The period an Insights view covers and its buckets, on the venue's clock
 * (spec 2026-10-21 release 2 §5). Three choices, each ending today and made of
 * whole buckets but the last, which runs to today:
 *
 *  - `30d`: by day, today and the 29 days before;
 *  - `90d`: by week, weeks starting on Monday and keyed by their Monday, this
 *    week and the 12 before (85 to 91 days);
 *  - `12m`: by month, keyed `YYYY-MM`, this month and the 11 before.
 *
 * Each bucket's start is the start of its venue day as a UTC
 * `Y-m-d H:i:s` string, the way the database stores instants, so a stored
 * time is placed by comparing strings (a binary search), with no time-zone
 * work per row and a daylight-saving change counted where it happens.
 */
final class InsightsPeriod
{
    public const CHOICES = ['30d', '90d', '12m'];
    public const DEFAULT = '30d';

    /**
     * @param list<string> $keys   The buckets' keys, oldest first.
     * @param list<string> $bounds Each bucket's start in UTC, then the end of the period (the start of tomorrow).
     */
    private function __construct(
        public readonly string $choice,
        public readonly string $bucket,
        public readonly string $from,
        public readonly string $to,
        public readonly array $keys,
        private readonly array $bounds,
    ) {
    }

    /** @param string $today The venue's date (`VenueClock::today`). */
    public static function of(string $choice, string $today, string $zone): self
    {
        $day = self::date($today);

        [$bucket, $starts, $keys] = match ($choice) {
            '90d' => (function () use ($day) {
                $monday = $day->subDays($day->dayOfWeekIso - 1);
                $starts = array_map(fn (int $i) => $monday->subWeeks(12 - $i)->format('Y-m-d'), range(0, 12));

                return ['week', $starts, $starts];
            })(),
            '12m' => (function () use ($day) {
                $first = $day->startOfMonth();
                $starts = array_map(fn (int $i) => $first->subMonthsNoOverflow(11 - $i)->format('Y-m-d'), range(0, 11));

                return ['month', $starts, array_map(fn (string $d) => substr($d, 0, 7), $starts)];
            })(),
            default => (function () use ($day) {
                $starts = array_map(fn (int $i) => $day->subDays(29 - $i)->format('Y-m-d'), range(0, 29));

                return ['day', $starts, $starts];
            })(),
        };

        $bounds = array_map(fn (string $d) => self::dayStartUtc($d, $zone), $starts);
        $bounds[] = self::dayStartUtc($day->addDay()->format('Y-m-d'), $zone);

        return new self(in_array($choice, self::CHOICES, true) ? $choice : self::DEFAULT, $bucket, $starts[0], $today, $keys, $bounds);
    }

    /** Explicit completed venue days, in seven-day buckets anchored to the selected start. */
    public static function range(string $from, string $to, string $zone): self
    {
        $keys = [];
        for ($day = $from; $day <= $to; $day = self::addDays($day, 7)) {
            $keys[] = $day;
        }
        $bounds = array_map(fn (string $d) => self::dayStartUtc($d, $zone), $keys);
        $bounds[] = self::dayStartUtc(self::addDays($to, 1), $zone);

        return new self('custom', 'week', $from, $to, $keys, $bounds);
    }

    /** The first instant of the period, in UTC as stored. */
    public function startUtc(): string
    {
        return $this->bounds[0];
    }

    /** The first instant after the period (tomorrow's start at the venue), in UTC as stored. */
    public function endUtc(): string
    {
        return $this->bounds[count($this->bounds) - 1];
    }

    /** One zero per bucket, in the buckets' order. @return list<int> */
    public function zeros(): array
    {
        return array_fill(0, count($this->keys), 0);
    }

    /**
     * The bucket a stored UTC instant falls in, or null outside the period. Reads `Y-m-d H:i:s` (a `T` and any
     * fraction of a second or offset after the seconds are ignored: stored instants are UTC).
     */
    public function indexOf(?string $stored): ?int
    {
        if ($stored === null || $stored === '') {
            return null;
        }
        $at = substr(str_replace('T', ' ', $stored), 0, 19);
        $last = count($this->bounds) - 1;
        if ($at < $this->bounds[0] || $at >= $this->bounds[$last]) {
            return null;
        }

        // The last bucket whose start is at or before the instant.
        $lo = 0;
        $hi = $last - 1;
        while ($lo < $hi) {
            $mid = intdiv($lo + $hi + 1, 2);
            if ($this->bounds[$mid] <= $at) {
                $lo = $mid;
            } else {
                $hi = $mid - 1;
            }
        }

        return $lo;
    }

    /** The start of a venue day as a UTC instant, written as the database stores one. */
    public static function dayStartUtc(string $date, string $zone): string
    {
        return CarbonImmutable::createFromFormat('!Y-m-d', $date, $zone)->utc()->format('Y-m-d H:i:s');
    }

    /** A venue date `n` days away (negative: before). */
    public static function addDays(string $date, int $n): string
    {
        return self::date($date)->addDays($n)->format('Y-m-d');
    }

    /** Whole days from one venue date to another. */
    public static function daysBetween(string $from, string $to): int
    {
        return intdiv(self::date($to)->getTimestamp() - self::date($from)->getTimestamp(), 86400);
    }

    private static function date(string $date): CarbonImmutable
    {
        return CarbonImmutable::createFromFormat('!Y-m-d', $date, 'UTC');
    }
}
