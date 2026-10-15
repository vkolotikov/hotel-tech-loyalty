<?php

namespace Tests\Unit\Content;

use App\Services\Content\ContentSlots;
use PHPUnit\Framework\TestCase;

class ContentSlotsTest extends TestCase
{
    private const DAYS = ['mon' => false, 'tue' => false, 'wed' => false, 'thu' => false, 'fri' => false, 'sat' => false, 'sun' => false];

    private function channel(string $platform, array $on): array
    {
        return ['platform' => $platform, 'frequency' => array_merge(self::DAYS, array_fill_keys($on, true))];
    }

    public function test_a_slot_is_a_ticked_weekday_of_an_active_channel_from_today_on(): void
    {
        $slots = ContentSlots::open([$this->channel('instagram', ['mon', 'wed'])], [], '2026-10-01', '2026-10-11', '2026-10-05');

        // 1 Oct (Thu) … 4 Oct are before today; Mon 5 and Wed 7 are open; nothing after Sun 11.
        $this->assertSame([['date' => '2026-10-05', 'platform' => 'instagram'], ['date' => '2026-10-07', 'platform' => 'instagram']], $slots);
    }

    public function test_a_taken_day_is_not_open_and_a_channel_without_days_has_none(): void
    {
        $slots = ContentSlots::open(
            [$this->channel('instagram', ['mon', 'wed']), $this->channel('linkedin', []), ['platform' => 'x', 'frequency' => null]],
            ['2026-10-05|instagram' => true],
            '2026-10-05', '2026-10-07', '2026-10-05',
        );

        $this->assertSame([['date' => '2026-10-07', 'platform' => 'instagram']], $slots);
    }

    public function test_two_channels_on_one_platform_make_one_slot_and_a_range_before_today_none(): void
    {
        $this->assertCount(1, ContentSlots::open([$this->channel('instagram', ['mon']), $this->channel('instagram', ['mon'])], [], '2026-10-05', '2026-10-05', '2026-10-05'));
        $this->assertSame([], ContentSlots::open([$this->channel('instagram', ['mon'])], [], '2026-09-28', '2026-10-04', '2026-10-05'));
    }
}
