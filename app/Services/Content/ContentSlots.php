<?php

namespace App\Services\Content;

use Carbon\CarbonImmutable;

/**
 * Open slots (spec 2026-10-14 §6.6): one per active channel and weekday its
 * `frequency` ticks, from the venue's today on, where the brand has no post
 * on that day for that platform other than an archived one (a skipped post
 * fills its slot on purpose). A channel with no ticked day has none.
 * Pure: the caller loads the channels and the days already taken.
 */
final class ContentSlots
{
    private const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

    /**
     * @param list<array{platform: string, frequency: array<string, bool>|null}> $channels
     * @param array<string, true> $taken keys "Y-m-d|platform"
     * @return list<array{date: string, platform: string}>
     */
    public static function open(array $channels, array $taken, string $from, string $to, string $today): array
    {
        $out = [];
        $seen = [];
        for ($day = CarbonImmutable::parse(max($from, $today)); $day->format('Y-m-d') <= $to; $day = $day->addDay()) {
            $date = $day->format('Y-m-d');
            $weekday = self::DAYS[$day->dayOfWeekIso - 1];
            foreach ($channels as $channel) {
                $platform = (string) $channel['platform'];
                $key = "{$date}|{$platform}";
                $frequency = (array) ($channel['frequency'] ?? []);
                if (!($frequency[$weekday] ?? false)) {
                    continue;
                }
                if (isset($taken[$key]) || isset($seen[$key])) {
                    continue;
                }
                $seen[$key] = true;
                $out[] = ['date' => $date, 'platform' => $platform];
            }
        }

        return $out;
    }
}
