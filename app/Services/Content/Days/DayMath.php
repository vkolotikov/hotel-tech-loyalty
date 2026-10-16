<?php

namespace App\Services\Content\Days;

use Carbon\CarbonImmutable;

/**
 * Date arithmetic for the built-in days (spec 2026-10-16 Appendix A) on plain `Y-m-d` strings: Easter, the nth or last
 * weekday of a month, and the rules the tables use. Weekdays are ISO: 1 = Monday … 7 = Sunday.
 */
final class DayMath
{
    /** Easter Sunday of a Gregorian year (the anonymous Gregorian computus); no calendar extension needed. */
    public static function easter(int $year): string
    {
        $a = $year % 19;
        $b = intdiv($year, 100);
        $c = $year % 100;
        $d = intdiv($b, 4);
        $e = $b % 4;
        $f = intdiv($b + 8, 25);
        $g = intdiv($b - $f + 1, 3);
        $h = (19 * $a + $b - $d - $g + 15) % 30;
        $i = intdiv($c, 4);
        $k = $c % 4;
        $l = (32 + 2 * $e + 2 * $i - $h - $k) % 7;
        $m = intdiv($a + 11 * $h + 22 * $l, 451);
        $month = intdiv($h + $l - 7 * $m + 114, 31);
        $day = (($h + $l - 7 * $m + 114) % 31) + 1;

        return sprintf('%04d-%02d-%02d', $year, $month, $day);
    }

    /** The day `$n` days after (before, when negative) `$day`. */
    public static function add(string $day, int $n): string
    {
        return CarbonImmutable::createFromFormat('!Y-m-d', $day, 'UTC')->addDays($n)->format('Y-m-d');
    }

    public static function weekday(string $day): int
    {
        return (int) CarbonImmutable::createFromFormat('!Y-m-d', $day, 'UTC')->format('N');
    }

    public static function isWeekend(string $day): bool
    {
        return self::weekday($day) >= 6;
    }

    /** The `$n`th `$weekday` of a month (`$n` = 1 for the first). */
    public static function nth(int $year, int $month, int $weekday, int $n): string
    {
        $first = sprintf('%04d-%02d-01', $year, $month);

        return self::add($first, (($weekday - self::weekday($first) + 7) % 7) + 7 * ($n - 1));
    }

    /** The last `$weekday` of a month. */
    public static function last(int $year, int $month, int $weekday): string
    {
        $end = CarbonImmutable::create($year, $month, 1, 0, 0, 0, 'UTC')->endOfMonth()->format('Y-m-d');

        return self::add($end, -((self::weekday($end) - $weekday + 7) % 7));
    }

    /** A rule of the tables, for a year. */
    public static function on(array $rule, int $year): string
    {
        return match ($rule[0]) {
            'fixed'  => sprintf('%04d-%02d-%02d', $year, $rule[1], $rule[2]),
            'easter' => self::add(self::easter($year), $rule[1]),
            'nth'    => self::nth($year, $rule[1], $rule[2], $rule[3]),
            'last'   => self::last($year, $rule[1], $rule[2]),
            // Ireland's St Brigid's Day: 1 February when that is a Friday, else the first Monday of February.
            'brigid' => self::weekday(sprintf('%04d-02-01', $year)) === 5 ? sprintf('%04d-02-01', $year) : self::nth($year, 2, 1, 1),
            // France's Mother's Day: the last Sunday of May, or the first Sunday of June when Pentecost falls on it.
            'fr_mothers' => self::last($year, 5, 7) === self::add(self::easter($year), 49) ? self::nth($year, 6, 7, 1) : self::last($year, 5, 7),
            // Black Friday: the day after the fourth Thursday of November.
            'black_friday' => self::add(self::nth($year, 11, 4, 4), 1),
        };
    }
}
