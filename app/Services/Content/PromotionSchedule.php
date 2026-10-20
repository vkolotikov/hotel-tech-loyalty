<?php

namespace App\Services\Content;

use Carbon\CarbonImmutable;

/**
 * Spreading a promotion's posts (spec 2026-10-20 §4.3). Round by round over the pages; a slot is a day a ticked channel
 * posts on, holding one post; each ISO week holds at most the pace. Each post takes the free slot nearest its ideal day
 * (the posts spaced evenly over the whole period), scoring 3 days against a channel that is not its turn's, 1 against a
 * day this promotion already uses and ½ against a channel the brand already posts on that day; the same page goes twice
 * on one day only when nothing else is free; ties go to the earlier day, then the ticked order. Pure.
 */
final class PromotionSchedule
{
    private const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

    /**
     * Days a post moves to keep its turn's channel. 2 lost to distance when channels post on different weekdays (an
     * off-turn Instagram day one day away beat the turn's LinkedIn day three days away), so a page got one channel only.
     */
    private const OFF_TURN = 3;

    /**
     * @param list<int> $pages
     * @param list<array{platform: string, days: list<string>, time: ?string}> $channels
     * @param array<string, true> $taken
     * @return array{wanted: int, fit: int, posts: list<array{page: int, round: int, date: string, time: ?string, platform: string}>}
     */
    public static function plan(array $pages, int $perPage, array $channels, string $from, string $to, int $perWeek, array $taken = []): array
    {
        $wanted = count($pages) * max(0, $perPage);
        $slots = [];
        $days = 0;
        if ($channels !== [] && $from <= $to) {
            for ($day = CarbonImmutable::parse($from); $day->format('Y-m-d') <= $to; $day = $day->addDay()) {
                $weekday = self::WEEKDAYS[$day->dayOfWeekIso - 1];
                foreach ($channels as $channel) {
                    if ($channel['days'] === [] || in_array($weekday, $channel['days'], true)) {
                        $slots[] = ['date' => $day->format('Y-m-d'), 'platform' => $channel['platform'], 'week' => $day->format('o-W'), 'day' => $days];
                    }
                }
                $days++;
            }
        }
        $room = [];
        foreach ($slots as $slot) {
            $room[$slot['week']] = ($room[$slot['week']] ?? 0) + 1;
        }
        $capacity = 0;
        foreach ($room as $week => $count) {
            $room[$week] = min($perWeek, $count);
            $capacity += $room[$week];
        }
        $fit = min($wanted, $capacity);

        $queue = [];
        for ($round = 0; $round < $perPage; $round++) {
            foreach (array_values($pages) as $index => $page) {
                $queue[] = ['page' => (int) $page, 'index' => $index, 'round' => $round];
            }
        }
        $order = array_column($channels, 'platform');
        $times = [];
        foreach ($channels as $channel) {
            $times[$channel['platform']] ??= $channel['time'];
        }

        $used = [];
        $inWeek = [];
        $onDay = [];
        $pageOnDay = [];
        $posts = [];
        for ($k = 0; $k < $fit; $k++) {
            $item = $queue[$k];
            $ideal = (int) floor(($k + 0.5) * $days / $fit);
            $turn = $order[($item['index'] + $item['round']) % count($order)];
            $best = null;
            $bestScore = INF;
            $fallback = null;
            $fallbackScore = INF;
            foreach ($slots as $i => $slot) {
                $key = $slot['date'] . '|' . $slot['platform'];
                if (isset($used[$key]) || ($inWeek[$slot['week']] ?? 0) >= $room[$slot['week']]) {
                    continue;
                }
                $score = abs($slot['day'] - $ideal)
                    + ($slot['platform'] === $turn ? 0 : self::OFF_TURN)
                    + (isset($onDay[$slot['date']]) ? 1 : 0)
                    + (isset($taken[$key]) ? 0.5 : 0);
                if (isset($pageOnDay[$item['page'] . '|' . $slot['date']])) {
                    if ($score < $fallbackScore) {
                        $fallbackScore = $score;
                        $fallback = $i;
                    }
                    continue;
                }
                if ($score < $bestScore) {
                    $bestScore = $score;
                    $best = $i;
                }
            }
            $chosen = $best ?? $fallback;
            if ($chosen === null) {
                break;
            }
            $slot = $slots[$chosen];
            $used[$slot['date'] . '|' . $slot['platform']] = true;
            $inWeek[$slot['week']] = ($inWeek[$slot['week']] ?? 0) + 1;
            $onDay[$slot['date']] = true;
            $pageOnDay[$item['page'] . '|' . $slot['date']] = true;
            $posts[] = ['page' => $item['page'], 'round' => $item['round'], 'date' => $slot['date'], 'time' => $times[$slot['platform']] ?? null, 'platform' => $slot['platform']];
        }
        usort($posts, fn (array $a, array $b) => [$a['date'], array_search($a['platform'], $order, true)] <=> [$b['date'], array_search($b['platform'], $order, true)]);

        return ['wanted' => $wanted, 'fit' => count($posts), 'posts' => $posts];
    }
}
