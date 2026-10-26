<?php

namespace Tests\Unit\Loyalty;

use App\Services\Loyalty\Setup\SetupProgress;
use PHPUnit\Framework\TestCase;

/** "Start here" (release 10): the steps from their counts, read by value. */
class SetupProgressTest extends TestCase
{
    public function test_each_step_is_done_when_it_counts_something_and_ways_when_no_warning_is_left(): void
    {
        $read = SetupProgress::read(['programme' => 1, 'tiers' => 3, 'ways' => 2, 'rewards' => 0, 'logo' => 0, 'member' => 12, 'scan' => 0]);

        $this->assertSame([
            ['key' => 'programme', 'done' => true, 'count' => 1],
            ['key' => 'tiers', 'done' => true, 'count' => 3],
            ['key' => 'ways', 'done' => false, 'count' => 2],
            ['key' => 'rewards', 'done' => false, 'count' => 0],
            ['key' => 'logo', 'done' => false, 'count' => 0],
            ['key' => 'member', 'done' => true, 'count' => 12],
            ['key' => 'scan', 'done' => false, 'count' => 0],
        ], $read['steps']);
        $this->assertSame(3, $read['done']);
        $this->assertSame(7, $read['total']);
    }

    public function test_the_steps_keep_their_order_and_a_missing_count_is_not_done(): void
    {
        $read = SetupProgress::read(['ways' => 0]);

        $this->assertSame(SetupProgress::STEPS, array_column($read['steps'], 'key'));
        $this->assertSame(['ways'], array_column(array_filter($read['steps'], fn (array $s) => $s['done']), 'key'));
        $this->assertSame(1, $read['done']);
    }
}
