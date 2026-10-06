<?php

namespace App\Services\Appointments\Insights;

use App\Services\Appointments\AppointmentRefused;
use Carbon\CarbonImmutable;

/**
 * The venue days an Insights view covers, both included (Part G spec §4.1),
 * and the period it is compared with (§4.7). Dates are venue dates: no time
 * zone is involved here.
 */
final class InsightsPeriod
{
    public const MAX_DAYS = 366;

    private function __construct(public readonly string $from, public readonly string $to)
    {
    }

    public static function fromInput(mixed $from, mixed $to): self
    {
        $a = self::date($from);
        $b = self::date($to);
        if ($a === null || $b === null || $a > $b || self::span($a, $b) > self::MAX_DAYS) {
            throw new AppointmentRefused('invalid_period', 'Choose a period of up to a year.', 422);
        }

        return new self($a, $b);
    }

    public function days(): int
    {
        return self::span($this->from, $this->to);
    }

    /** Appointments in the period start at or after From 00:00 and before this day 00:00 (wall-clock digits). */
    public function dayAfter(): string
    {
        return self::day($this->to)->addDay()->format('Y-m-d');
    }

    public function isCalendarMonth(): bool
    {
        $first = self::day($this->from);

        return $first->day === 1 && $this->to === $first->endOfMonth()->format('Y-m-d');
    }

    /** A whole calendar month → the month before; anything else → the same number of days just before. */
    public function previous(): self
    {
        $first = self::day($this->from);
        if ($this->isCalendarMonth()) {
            $month = $first->subMonthNoOverflow();

            return new self($month->startOfMonth()->format('Y-m-d'), $month->endOfMonth()->format('Y-m-d'));
        }

        return new self($first->subDays($this->days())->format('Y-m-d'), $first->subDay()->format('Y-m-d'));
    }

    /** @return array{from: string, to: string, days: int} */
    public function toApi(): array
    {
        return ['from' => $this->from, 'to' => $this->to, 'days' => $this->days()];
    }

    private static function date(mixed $value): ?string
    {
        if (!is_string($value) || preg_match('/^\d{4}-\d{2}-\d{2}$/', $value) !== 1) {
            return null;
        }

        // 2026-02-30 would roll over to 2 March: only a date that reads back unchanged exists.
        return self::day($value)->format('Y-m-d') === $value ? $value : null;
    }

    private static function day(string $date): CarbonImmutable
    {
        return CarbonImmutable::createFromFormat('!Y-m-d', $date, 'UTC');
    }

    private static function span(string $from, string $to): int
    {
        return intdiv(self::day($to)->getTimestamp() - self::day($from)->getTimestamp(), 86400) + 1;
    }
}
