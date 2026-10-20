<?php

namespace Tests\Unit\Content;

use App\Services\Content\PromotionSchedule;
use PHPUnit\Framework\TestCase;

/** Spreading a promotion's posts (spec 2026-10-20 §4.3). Monday 5 October 2026 starts the weeks below. */
class PromotionScheduleTest extends TestCase
{
    private const EVERY_DAY = [];

    private static function channel(string $platform, array $days = self::EVERY_DAY, ?string $time = null): array
    {
        return ['platform' => $platform, 'days' => $days, 'time' => $time];
    }

    public function test_channels_take_turns_even_on_different_weekdays(): void
    {
        $plan = PromotionSchedule::plan([1, 2], 3, [self::channel('instagram', ['mon', 'wed', 'fri']), self::channel('linkedin', ['tue', 'thu'])], '2026-10-05', '2026-10-18', 3);

        $this->assertSame(6, $plan['wanted']);
        $this->assertSame(6, $plan['fit']);
        foreach ([1, 2] as $page) {
            $platforms = array_column(array_filter($plan['posts'], fn ($post) => $post['page'] === $page), 'platform');
            $this->assertCount(3, $platforms);
            $this->assertContains('instagram', $platforms, "page {$page}");
            $this->assertContains('linkedin', $platforms, "page {$page}");
        }
        $weeks = array_count_values(array_map(fn ($post) => date('o-W', strtotime($post['date'])), $plan['posts']));
        $this->assertSame([3, 3], array_values($weeks));
        foreach ($plan['posts'] as $post) {
            $weekday = strtolower(date('D', strtotime($post['date'])));
            $this->assertContains($weekday, $post['platform'] === 'instagram' ? ['mon', 'wed', 'fri'] : ['tue', 'thu']);
        }
    }

    public function test_posts_are_spaced_evenly_over_the_whole_period(): void
    {
        $plan = PromotionSchedule::plan([1], 4, [self::channel('facebook')], '2026-10-05', '2026-11-29', 3);

        $this->assertSame(['2026-10-12', '2026-10-26', '2026-11-09', '2026-11-23'], array_column($plan['posts'], 'date'));
    }

    public function test_the_pace_limits_how_many_fit(): void
    {
        $plan = PromotionSchedule::plan([1], 10, [self::channel('facebook')], '2026-10-05', '2026-10-18', 3);

        $this->assertSame(10, $plan['wanted']);
        $this->assertSame(6, $plan['fit']);
        $this->assertCount(6, $plan['posts']);
    }

    public function test_never_two_posts_on_one_channel_on_one_day(): void
    {
        $plan = PromotionSchedule::plan([1], 10, [self::channel('instagram'), self::channel('facebook')], '2026-10-05', '2026-10-11', 21);

        $this->assertSame(10, $plan['fit']);
        $keys = array_map(fn ($post) => $post['date'] . '|' . $post['platform'], $plan['posts']);
        $this->assertSame($keys, array_values(array_unique($keys)));
    }

    public function test_no_page_twice_on_a_day_while_another_page_can_take_the_place(): void
    {
        $plan = PromotionSchedule::plan([1, 2], 7, [self::channel('instagram'), self::channel('facebook')], '2026-10-05', '2026-10-11', 14);

        $this->assertSame(14, $plan['fit']);
        $byDay = [];
        foreach ($plan['posts'] as $post) {
            $byDay[$post['date']][] = $post['page'];
        }
        $this->assertCount(7, $byDay);
        foreach ($byDay as $day => $pages) {
            $this->assertEqualsCanonicalizing([1, 2], $pages, $day);
        }
    }

    public function test_pages_come_round_by_round_and_times_are_the_channels(): void
    {
        $plan = PromotionSchedule::plan([10, 20, 30], 2, [self::channel('facebook', self::EVERY_DAY, '18:00')], '2026-10-05', '2026-10-10', 7);

        $this->assertSame([10, 20, 30, 10, 20, 30], array_column($plan['posts'], 'page'));
        $this->assertSame([0, 0, 0, 1, 1, 1], array_column($plan['posts'], 'round'));
        $this->assertSame(['18:00'], array_values(array_unique(array_column($plan['posts'], 'time'))));
    }

    public function test_a_channel_without_days_posts_on_sundays_too(): void
    {
        $plan = PromotionSchedule::plan([1], 1, [self::channel('facebook')], '2026-10-11', '2026-10-11', 3);

        $this->assertSame([['page' => 1, 'round' => 0, 'date' => '2026-10-11', 'time' => null, 'platform' => 'facebook']], $plan['posts']);
    }

    public function test_nothing_fits_without_channels_or_days(): void
    {
        $this->assertSame(['wanted' => 2, 'fit' => 0, 'posts' => []], PromotionSchedule::plan([1, 2], 1, [], '2026-10-05', '2026-10-11', 3));
        $this->assertSame(0, PromotionSchedule::plan([1], 1, [self::channel('facebook')], '2026-10-12', '2026-10-05', 3)['fit']);
    }

    public function test_off_turn_it_prefers_a_channel_without_another_post_that_day(): void
    {
        $plan = PromotionSchedule::plan([1], 1, [self::channel('linkedin', ['sun']), self::channel('instagram'), self::channel('facebook')],
            '2026-10-05', '2026-10-07', 3, ['2026-10-06|instagram' => true]);

        $this->assertSame([['page' => 1, 'round' => 0, 'date' => '2026-10-06', 'time' => null, 'platform' => 'facebook']], $plan['posts']);
    }
}
