<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\LoyaltyMember;
use App\Models\PointsTransaction;
use App\Models\Stamp;
use App\Models\StampCard;
use App\Services\Loyalty\Programme\ProgrammeOptions;
use App\Services\Loyalty\Stamps\StampCards;
use App\Services\Loyalty\Visits\Visit;
use App\Services\MemberMergeService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\LoyaltyWorkspace\CreditSchema;
use Tests\Concerns\LoyaltyWorkspace\MembershipSchema;
use Tests\Concerns\LoyaltyWorkspace\PushSchema;
use Tests\Concerns\LoyaltyWorkspace\VisitsSchema;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/**
 * Two members merged (MemberMergeService, release 7 §3 "Merge and erasure"): the loser's stamps and cards become the
 * winner's through StampCards::beforeMerge — one stamp a venue day (the winner's kept), completed cards kept and
 * numbered after the winner's, two open cards made one and completed if that fills it, the open card always last.
 */
class StampMergeTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace, MembershipSchema, VisitsSchema, CreditSchema, PushSchema;

    private StampCards $stamps;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->buildMembershipSchema();
        $this->buildVisitsSchema();
        $this->buildCreditSchema();
        $this->buildPushSchema();
        $this->stamps = app(StampCards::class);
    }

    /** One stamp each on the given days of October, references unique across the test. */
    private function stampDays(LoyaltyMember $member, int ...$days): void
    {
        static $ref = 100;
        foreach ($days as $day) {
            $this->stamps->stamp($member, new Visit(Visit::APPOINTMENT, 'service_booking', ++$ref, 10.0, sprintf('2026-10-%02d', $day)));
        }
    }

    /** @return list<array{int, int, int, bool}> the member's cards: number, stamps, stamps on it, completed */
    private function cardsOf(LoyaltyMember $member): array
    {
        return StampCard::withoutGlobalScopes()->where('member_id', $member->id)->orderBy('number')->get()
            ->map(fn (StampCard $c) => [(int) $c->number, (int) $c->stamps_count, Stamp::withoutGlobalScopes()->where('stamp_card_id', $c->id)->count(), $c->completed_at !== null])
            ->all();
    }

    private function merge(LoyaltyMember $winner, LoyaltyMember $loser): array
    {
        return app(MemberMergeService::class)->merge($winner->fresh(), $loser->fresh());
    }

    public function test_a_day_both_have_keeps_the_winners_stamp_and_the_merge_records_the_dropped_one(): void
    {
        ProgrammeOptions::save($this->org->id, ['stamps_enabled' => true, 'stamps_per_card' => 10], $this->manager);
        $this->stampDays($this->ada, 1, 3);
        $this->stampDays($this->grace, 3, 4);

        $result = $this->merge($this->ada, $this->grace);

        $this->assertSame(['2026-10-01', '2026-10-03', '2026-10-04'], Stamp::withoutGlobalScopes()->where('member_id', $this->ada->id)->orderBy('venue_day')->get()->map->day()->all());
        $this->assertSame([[1, 3, 3, false]], $this->cardsOf($this->ada));
        $this->assertSame(0, StampCard::withoutGlobalScopes()->where('member_id', $this->grace->id)->count());
        $this->assertGreaterThanOrEqual(1, $result['moved']['stamps']);
        $dropped = json_decode((string) DB::table('member_merges')->where('surviving_member_id', $this->ada->id)->value('merged_data'), true)['dropped'];
        $this->assertSame(1, $dropped['stamps']);
    }

    public function test_completed_cards_are_kept_the_losers_after_the_winners_and_the_open_card_last(): void
    {
        ProgrammeOptions::save($this->org->id, ['stamps_enabled' => true, 'stamps_per_card' => 2], $this->manager);
        $this->stampDays($this->ada, 1, 2, 3);          // Ada: card 1 complete, card 2 open with 1
        $this->stampDays($this->grace, 11, 12, 13, 14); // Grace: cards 1 and 2 complete

        $this->merge($this->ada, $this->grace);

        $this->assertSame([[1, 2, 2, true], [2, 2, 2, true], [3, 2, 2, true], [4, 1, 1, false]], $this->cardsOf($this->ada));
        $this->assertSame(3, $this->stamps->forMember($this->ada->fresh())['completed_cards']);
        // The next stamp goes on the open card, the last one.
        $this->stampDays($this->ada->fresh(), 20);
        $this->assertSame([4, 2, 2, true], $this->cardsOf($this->ada)[3]);
    }

    public function test_the_losers_open_card_alone_becomes_the_winners_open_card(): void
    {
        ProgrammeOptions::save($this->org->id, ['stamps_enabled' => true, 'stamps_per_card' => 2], $this->manager);
        $this->stampDays($this->ada, 1, 2);    // Ada: card 1 complete, nothing open
        $this->stampDays($this->grace, 5);     // Grace: card 1 open with 1

        $this->merge($this->ada, $this->grace);

        $this->assertSame([[1, 2, 2, true], [2, 1, 1, false]], $this->cardsOf($this->ada));
    }

    public function test_two_open_cards_that_fill_one_complete_it_for_the_winner_and_the_latest_stamps_open_the_next(): void
    {
        ProgrammeOptions::save($this->org->id, ['stamps_enabled' => true, 'stamps_per_card' => 3, 'stamp_reward_points' => 100], $this->manager);
        $this->stampDays($this->ada, 1, 2);
        $this->stampDays($this->grace, 3, 4);

        $this->merge($this->ada, $this->grace);

        $this->assertSame([[1, 3, 3, true], [2, 1, 1, false]], $this->cardsOf($this->ada));
        $second = StampCard::withoutGlobalScopes()->where('member_id', $this->ada->id)->where('number', 2)->firstOrFail();
        $this->assertSame('2026-10-04', Stamp::withoutGlobalScopes()->where('stamp_card_id', $second->id)->firstOrFail()->day());
        $first = StampCard::withoutGlobalScopes()->where('member_id', $this->ada->id)->where('number', 1)->firstOrFail();
        $line = PointsTransaction::withoutGlobalScopes()->where('idempotency_key', "stamp_card_{$first->id}")->firstOrFail();
        $this->assertSame($this->ada->id, (int) $line->member_id);
        // Ada's 1,500, Grace's 200 and the full card's 100.
        $this->assertSame(1800, (int) $this->ada->fresh()->current_points);
        $this->assertTrue(DB::table('push_notifications')->where('member_id', $this->ada->id)->where('type', StampCards::PUSH_TYPE)->exists());
    }

    public function test_a_merge_without_stamps_on_either_side_changes_nothing(): void
    {
        $result = $this->merge($this->ada, $this->grace);

        $this->assertSame(0, StampCard::withoutGlobalScopes()->count());
        $this->assertSame(0, $result['moved']['stamps'] ?? 0);
    }
}
