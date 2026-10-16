<?php

namespace App\Services\Content;

use App\Models\ContentPlannerChannel;
use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerProfile;
use App\Services\Appointments\VenueClock;
use Carbon\CarbonImmutable;

/**
 * Posting goals and streaks (spec 2026-10-15 §7), on the venue's clock. Each active channel's posts_per_week is its
 * weekly target, summed per platform (posts carry a platform, not a channel). Progress counts posts marked published
 * in the venue's week (Monday–Sunday) and the ones planned (dated in the week; not published, archived or skipped —
 * the Plan's own figures leave skipped posts out too). The streak counts the weeks in a row in which every target was
 * met — completed weeks back to the week the oldest channel with a target was added (target history is not kept), plus
 * the current week once met.
 */
final class ContentGoals
{
    public const LOOK_BACK_WEEKS = 52;

    /**
     * @return array{week: array{from: string, to: string}, platforms: list<array{platform: string, target: int, published: int, planned: int}>, streak: array{weeks: int, current_met: bool, at_risk: bool, short_by: int}}
     */
    public static function for(ContentPlannerProfile $profile, int $orgId): array
    {
        $now = VenueClock::now($orgId); // the venue's digits, labelled UTC
        $zone = VenueClock::zone($orgId);
        $monday = $now->startOfWeek(CarbonImmutable::MONDAY)->startOfDay();
        $week = ['from' => $monday->toDateString(), 'to' => $monday->addDays(6)->toDateString()];
        $none = ['week' => $week, 'platforms' => [], 'streak' => ['weeks' => 0, 'current_met' => false, 'at_risk' => false, 'short_by' => 0]];

        $channels = ContentPlannerChannel::where('planner_profile_id', $profile->id)->where('active', true)
            ->where('posts_per_week', '>', 0)->orderBy('id')->get(['platform', 'posts_per_week', 'created_at']);
        $targets = [];
        foreach ($channels as $channel) {
            $targets[(string) $channel->platform] = ($targets[(string) $channel->platform] ?? 0) + (int) $channel->posts_per_week;
        }
        if ($targets === []) {
            return $none;
        }

        // Published posts of the look-back, by the venue's week of their published_at.
        $since = CarbonImmutable::parse($monday->subWeeks(self::LOOK_BACK_WEEKS)->format('Y-m-d H:i:s'), $zone)->utc();
        $published = [];
        $posts = ContentPlannerPost::where('planner_profile_id', $profile->id)->where('status', 'published')
            ->whereIn('platform', array_keys($targets))->where('published_at', '>=', $since)->get(['platform', 'published_at']);
        foreach ($posts as $post) {
            $weekOf = CarbonImmutable::parse($post->published_at)->setTimezone($zone)->startOfWeek(CarbonImmutable::MONDAY)->toDateString();
            $published[$weekOf][(string) $post->platform] = ($published[$weekOf][(string) $post->platform] ?? 0) + 1;
        }
        $planned = ContentPlannerPost::where('planner_profile_id', $profile->id)
            ->whereNotIn('status', ['published', 'archived', 'skipped'])->whereIn('platform', array_keys($targets))
            ->whereDate('scheduled_date', '>=', $week['from'])->whereDate('scheduled_date', '<=', $week['to'])
            ->get(['platform'])->countBy('platform')->all();

        $met = fn (string $weekStart): bool => collect($targets)->every(fn (int $target, string $platform) => ($published[$weekStart][$platform] ?? 0) >= $target);
        $currentMet = $met($week['from']);
        $firstTargetWeek = CarbonImmutable::parse($channels->min('created_at'))->setTimezone($zone)->startOfWeek(CarbonImmutable::MONDAY)->toDateString();
        $completed = 0;
        for ($k = 1; $k <= self::LOOK_BACK_WEEKS; $k++) {
            $start = $monday->subWeeks($k)->toDateString();
            if ($start < $firstTargetWeek || !$met($start)) {
                break;
            }
            $completed++;
        }
        $shortBy = (int) collect($targets)->sum(fn (int $target, string $platform) => max(0, $target - ($published[$week['from']][$platform] ?? 0)));

        return [
            'week'      => $week,
            'platforms' => collect($targets)->map(fn (int $target, string $platform) => [
                'platform'  => $platform,
                'target'    => $target,
                'published' => $published[$week['from']][$platform] ?? 0,
                'planned'   => (int) ($planned[$platform] ?? 0),
            ])->values()->all(),
            'streak'    => [
                'weeks'       => $completed + ($currentMet ? 1 : 0),
                'current_met' => $currentMet,
                'at_risk'     => $completed >= 1 && !$currentMet && $now->dayOfWeekIso >= 5,
                'short_by'    => $currentMet ? 0 : $shortBy,
            ],
        ];
    }
}
