<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\AuditLog;
use App\Models\LoyaltyMember;
use App\Models\PointsTransaction;
use App\Models\Reward;
use App\Models\RewardRedemption;
use App\Models\Stamp;
use App\Models\StampCard;
use App\Services\Loyalty\Programme\ProgrammeOptions;
use App\Services\Loyalty\Stamps\StampCards;
use App\Services\Loyalty\Visits\Visit;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\LoyaltyWorkspace\CreditSchema;
use Tests\Concerns\LoyaltyWorkspace\PushSchema;
use Tests\Concerns\LoyaltyWorkspace\VisitsSchema;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/**
 * The stamp card (release 7, spec 2026-10-25 §2) through StampCards, the only writer of stamps and cards: one stamp a
 * venue day and one per reference, the card opened with the venue's number then, a full card completed in the same
 * step (points, or a free reward — the points when the reward is gone), the member told, a reversal's stamp taken off
 * an open card only, and the screens' shape.
 */
class StampCardsTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace, VisitsSchema, CreditSchema, PushSchema;

    private StampCards $stamps;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->buildVisitsSchema();
        $this->buildCreditSchema();
        $this->buildPushSchema();
        $this->stamps = app(StampCards::class);
    }

    /** @param array<string, mixed> $changes */
    private function setOptions(array $changes): void
    {
        ProgrammeOptions::save($this->org->id, $changes, $this->manager);
    }

    private function visit(string $day, ?int $ref = null, string $source = Visit::APPOINTMENT, string $type = 'service_booking'): Visit
    {
        return new Visit($source, $ref !== null ? $type : null, $ref, 50.0, $day);
    }

    public function test_nothing_is_stamped_while_the_stamp_card_is_off(): void
    {
        $this->assertNull($this->stamps->stamp($this->grace, $this->visit('2026-10-05', 1)));
        $this->assertSame(0, Stamp::withoutGlobalScopes()->count());
        $this->assertSame(0, StampCard::withoutGlobalScopes()->count());
    }

    public function test_the_first_stamp_opens_a_card_with_the_venues_number_and_answers_the_card(): void
    {
        $this->setOptions(['stamps_enabled' => true, 'stamps_per_card' => 5]);

        $answer = $this->stamps->stamp($this->grace, $this->visit('2026-10-05', 11));

        $card = StampCard::withoutGlobalScopes()->where('member_id', $this->grace->id)->firstOrFail();
        $this->assertSame(['added' => true, 'card' => ['id' => $card->id, 'number' => 1, 'stamps_count' => 1, 'stamps_needed' => 5, 'completed_at' => null], 'completed' => null], $answer);
        $stamp = Stamp::withoutGlobalScopes()->where('member_id', $this->grace->id)->firstOrFail();
        $this->assertSame('2026-10-05', $stamp->day());
        $this->assertSame(['appointment', 'service_booking', 11, $this->org->id], [$stamp->source, $stamp->reference_type, $stamp->reference_id, (int) $stamp->organization_id]);
    }

    public function test_one_stamp_a_venue_day_and_a_reference_once(): void
    {
        $this->setOptions(['stamps_enabled' => true]);
        $this->stamps->stamp($this->grace, $this->visit('2026-10-05', 1));

        $sameDay = $this->stamps->stamp($this->grace, $this->visit('2026-10-05', 2, Visit::STAY, 'booking_mirror'));
        $this->assertFalse($sameDay['added']);
        $this->assertSame('already_today', $sameDay['reason']);
        $this->assertSame(1, $sameDay['card']['stamps_count']);

        // The nightly sweep repeats itself: the same booking again, another day, is recorded once.
        $again = $this->stamps->stamp($this->grace, $this->visit('2026-10-06', 1));
        $this->assertSame(['added' => false, 'reason' => 'already_recorded'], ['added' => $again['added'], 'reason' => $again['reason']]);

        $next = $this->stamps->stamp($this->grace, $this->visit('2026-10-06', 3));
        $this->assertTrue($next['added']);
        $this->assertSame(2, $next['card']['stamps_count']);
        $this->assertSame(2, Stamp::withoutGlobalScopes()->where('member_id', $this->grace->id)->count());
    }

    public function test_a_full_card_gives_its_points_once_and_tells_the_member_and_the_next_stamp_opens_the_next_card(): void
    {
        $this->setOptions(['stamps_enabled' => true, 'stamps_per_card' => 2, 'stamp_reward_points' => 100]);
        $this->stamps->stamp($this->grace, $this->visit('2026-10-03', 1));

        $full = $this->stamps->stamp($this->grace, $this->visit('2026-10-04', 2));

        $card = StampCard::withoutGlobalScopes()->where('member_id', $this->grace->id)->firstOrFail();
        $this->assertNotNull($card->completed_at);
        $this->assertSame(['card_id' => $card->id, 'number' => 1, 'reward' => ['kind' => 'points', 'points' => 100]], $full['completed']);
        $this->assertSame(2, $full['card']['stamps_count']);
        $this->assertNotNull($full['card']['completed_at']);

        $line = PointsTransaction::withoutGlobalScopes()->where('idempotency_key', "stamp_card_{$card->id}")->firstOrFail();
        $this->assertSame(['bonus', 100, 0, 'Stamp card 1 complete'], [$line->type, (int) $line->points, (int) $line->qualifying_points, $line->description]);
        $this->assertSame('points', $card->reward_kind);
        $this->assertSame((int) $line->id, $card->reward_points_transaction_id);
        $this->assertSame(300, (int) $this->grace->fresh()->current_points);
        $this->assertSame(200, (int) $this->grace->fresh()->qualifying_points, 'a full card is not qualifying');

        $push = DB::table('push_notifications')->where('member_id', $this->grace->id)->where('type', StampCards::PUSH_TYPE)->first();
        $this->assertNotNull($push);
        $this->assertSame('Your card is full!', $push->title);
        $this->assertStringContainsString('100 bonus points', $push->body);

        $after = $this->stamps->stamp($this->grace, $this->visit('2026-10-05', 3));
        $this->assertSame([2, 1, null], [$after['card']['number'], $after['card']['stamps_count'], $after['completed']]);
        $this->assertSame(1, PointsTransaction::withoutGlobalScopes()->where('reference_type', 'stamp_card')->count());
    }

    public function test_a_new_number_of_stamps_applies_to_new_cards_only(): void
    {
        $this->setOptions(['stamps_enabled' => true, 'stamps_per_card' => 3]);
        $this->stamps->stamp($this->grace, $this->visit('2026-10-01', 1));
        $this->setOptions(['stamps_per_card' => 2]);

        $second = $this->stamps->stamp($this->grace, $this->visit('2026-10-02', 2));
        $this->assertSame([2, 3, null], [$second['card']['stamps_count'], $second['card']['stamps_needed'], $second['completed']]);
        $third = $this->stamps->stamp($this->grace, $this->visit('2026-10-03', 3));
        $this->assertNotNull($third['completed']);
        $fourth = $this->stamps->stamp($this->grace, $this->visit('2026-10-04', 4));
        $this->assertSame([2, 2], [$fourth['card']['number'], $fourth['card']['stamps_needed']]);
    }

    public function test_a_full_card_can_give_a_free_reward_from_the_catalogue(): void
    {
        $coffee = Reward::create(['name' => 'Coffee', 'points_cost' => 300, 'stock' => 5, 'is_active' => true]);
        $this->setOptions(['stamps_enabled' => true, 'stamps_per_card' => 2, 'stamp_reward_kind' => 'reward', 'stamp_reward_id' => $coffee->id]);
        $this->stamps->stamp($this->grace, $this->visit('2026-10-04', 1));

        $full = $this->stamps->stamp($this->grace, $this->visit('2026-10-05', 2));

        $redemption = RewardRedemption::withoutGlobalScopes()->where('member_id', $this->grace->id)->firstOrFail();
        $this->assertSame(['kind' => 'reward', 'redemption_id' => $redemption->id, 'reward_name' => 'Coffee', 'code' => $redemption->code], $full['completed']['reward']);
        $this->assertSame(['pending', 0, $coffee->id, $this->org->id], [$redemption->status, (int) $redemption->points_spent, (int) $redemption->reward_id, (int) $redemption->organization_id]);
        $this->assertMatchesRegularExpression('/^REW-[A-Z0-9]{8}$/', $redemption->code);
        $this->assertSame(4, (int) $coffee->fresh()->stock);
        $this->assertSame(200, (int) $this->grace->fresh()->current_points, 'a free reward costs no points');
        $this->assertTrue(AuditLog::query()->where('action', 'reward_redemption_issued')->where('subject_id', $redemption->id)->exists());
        $card = StampCard::withoutGlobalScopes()->where('member_id', $this->grace->id)->firstOrFail();
        $this->assertSame(['reward', $redemption->id], [$card->reward_kind, $card->reward_redemption_id]);
        $push = DB::table('push_notifications')->where('member_id', $this->grace->id)->where('type', StampCards::PUSH_TYPE)->first();
        $this->assertStringContainsString("Show code {$redemption->code}", $push->body);
    }

    public function test_a_reward_that_is_gone_gives_the_points_instead_and_is_audited(): void
    {
        $coffee = Reward::create(['name' => 'Coffee', 'points_cost' => 300, 'stock' => 0, 'is_active' => true]);
        $this->setOptions(['stamps_enabled' => true, 'stamps_per_card' => 2, 'stamp_reward_kind' => 'reward', 'stamp_reward_id' => $coffee->id, 'stamp_reward_points' => 75]);
        $this->stamps->stamp($this->grace, $this->visit('2026-10-04', 1));

        $full = $this->stamps->stamp($this->grace, $this->visit('2026-10-05', 2));

        $this->assertSame(['kind' => 'points', 'points' => 75], $full['completed']['reward']);
        $this->assertSame(0, RewardRedemption::withoutGlobalScopes()->count());
        $this->assertSame(275, (int) $this->grace->fresh()->current_points);
        $audit = AuditLog::query()->where('action', 'loyalty.stamp_reward_missing')->firstOrFail();
        $this->assertSame($coffee->id, $audit->new_values['reward_id']);
    }

    public function test_a_reversal_takes_the_stamp_off_an_open_card_and_leaves_a_completed_card_standing(): void
    {
        $this->setOptions(['stamps_enabled' => true, 'stamps_per_card' => 2]);
        $this->stamps->stamp($this->grace, $this->visit('2026-10-01', 1));
        $this->stamps->stamp($this->grace, $this->visit('2026-10-02', 2));
        $this->stamps->stamp($this->grace, $this->visit('2026-10-03', 3));

        // On the open card (card 2): off, the count down; again: nothing.
        $this->stamps->removeFor($this->org->id, 'service_booking', 3, $this->manager);
        $this->stamps->removeFor($this->org->id, 'service_booking', 3, $this->manager);
        $open = StampCard::withoutGlobalScopes()->where('member_id', $this->grace->id)->where('number', 2)->firstOrFail();
        $this->assertSame(0, (int) $open->stamps_count);
        $this->assertFalse(Stamp::withoutGlobalScopes()->where('reference_id', 3)->exists());
        $this->assertSame(1, AuditLog::query()->where('action', 'loyalty.stamp_removed')->count());

        // On the completed card: the stamp stands, audited once however often the reversal runs.
        $this->stamps->removeFor($this->org->id, 'service_booking', 1, null);
        $this->stamps->removeFor($this->org->id, 'service_booking', 1, null);
        $this->assertTrue(Stamp::withoutGlobalScopes()->where('reference_id', 1)->exists());
        $this->assertSame(2, (int) StampCard::withoutGlobalScopes()->where('member_id', $this->grace->id)->where('number', 1)->value('stamps_count'));
        $this->assertSame(1, AuditLog::query()->where('action', 'loyalty.stamp_kept')->count());

        // A reference never stamped: nothing.
        $this->stamps->removeFor($this->org->id, 'service_booking', 999, null);
        $this->assertSame(2, Stamp::withoutGlobalScopes()->count());
    }

    public function test_it_works_with_no_tenant_bound_as_the_nightly_sweep_and_webhooks_run_it(): void
    {
        $this->setOptions(['stamps_enabled' => true, 'stamps_per_card' => 2, 'stamp_reward_points' => 40]);
        $this->stamps->stamp($this->grace, $this->visit('2026-10-04', 1, Visit::STAY, 'booking_mirror'));
        app()->forgetInstance('current_organization_id');
        $grace = LoyaltyMember::withoutGlobalScopes()->findOrFail($this->grace->id);

        $full = $this->stamps->stamp($grace, $this->visit('2026-10-05', 2, Visit::STAY, 'booking_mirror'));
        $this->stamps->removeFor($this->org->id, 'booking_mirror', 2, null);

        $this->assertSame(['kind' => 'points', 'points' => 40], $full['completed']['reward']);
        $this->assertFalse(app()->bound('current_organization_id'), 'the binding is put back as it was');
        $this->assertSame(240, (int) LoyaltyMember::withoutGlobalScopes()->findOrFail($this->grace->id)->current_points);
        $this->assertSame($this->org->id, (int) PointsTransaction::withoutGlobalScopes()->where('reference_type', 'stamp_card')->value('organization_id'));
        app()->instance('current_organization_id', $this->org->id);
    }

    public function test_a_stamp_the_unique_index_refuses_after_the_checks_is_answered_and_the_transaction_stays_usable(): void
    {
        $this->setOptions(['stamps_enabled' => true]);
        $this->stamps->stamp($this->grace, $this->visit('2026-10-04', 1));
        $card = StampCard::withoutGlobalScopes()->where('member_id', $this->grace->id)->firstOrFail();

        // Another writer's stamp of the same day lands between the checks under the lock and the insert (the open
        // card's read): the index refuses ours, in its own savepoint, and the answer says why.
        $raced = false;
        DB::connection()->beforeExecuting(function (string $query) use (&$raced, $card) {
            if (!$raced && str_starts_with(strtolower(ltrim($query)), 'select') && str_contains($query, 'stamp_cards') && str_contains($query, 'completed_at')) {
                $raced = true;
                DB::table('stamps')->insert(['organization_id' => $this->org->id, 'member_id' => $this->grace->id, 'stamp_card_id' => $card->id,
                    'source' => 'check_in', 'venue_day' => '2026-10-05', 'created_at' => now(), 'updated_at' => now()]);
            }
        });

        $answer = $this->stamps->stamp($this->grace, $this->visit('2026-10-05', 2));

        $this->assertTrue($raced);
        $this->assertSame(['added' => false, 'reason' => 'already_today'], ['added' => $answer['added'], 'reason' => $answer['reason']]);
        $this->assertSame(2, Stamp::withoutGlobalScopes()->where('member_id', $this->grace->id)->count());
        $this->assertSame(1, (int) $card->fresh()->stamps_count, 'the refused stamp counted nothing');
    }

    public function test_a_bad_day_or_source_is_refused(): void
    {
        $this->setOptions(['stamps_enabled' => true]);

        $this->expectException(\InvalidArgumentException::class);
        $this->stamps->stamp($this->grace, new Visit(Visit::CHECK_IN, null, null, null, '05/10/2026'));
    }

    public function test_the_screens_see_the_open_card_its_stamps_the_completed_cards_and_what_they_gave(): void
    {
        $this->setOptions(['stamps_enabled' => true, 'stamps_per_card' => 2, 'stamp_reward_points' => 100]);
        $this->stamps->stamp($this->grace, new Visit(Visit::CHECK_IN, 'scan_event', 7, null, '2026-10-01', $this->staffMember));
        $this->stamps->stamp($this->grace, $this->visit('2026-10-02', 2));
        $this->stamps->stamp($this->grace, new Visit(Visit::PURCHASE, 'scan_event', 8, 12.5, '2026-10-03', $this->staffMember));

        $staff = $this->stamps->forMember($this->grace, forStaff: true);
        $this->assertTrue($staff['enabled']);
        $this->assertSame(2, $staff['stamps_per_card']);
        $this->assertSame(['kind' => 'points', 'points' => 100], $staff['reward']);
        $this->assertSame(1, $staff['completed_cards']);
        $this->assertSame([2, 1, 2], [$staff['card']['number'], $staff['card']['stamps_count'], $staff['card']['stamps_needed']]);
        $this->assertSame('2026-10-03', $staff['card']['stamps'][0]['venue_day']);
        $this->assertSame('purchase', $staff['card']['stamps'][0]['source']);
        $this->assertSame($this->staffMember->name, $staff['card']['stamps'][0]['by']);
        $this->assertSame(['scan_event', 8], [$staff['card']['stamps'][0]['reference_type'], $staff['card']['stamps'][0]['reference_id']]);
        $this->assertSame(['2026-10-03', '2026-10-02', '2026-10-01'], array_column($staff['history']['stamps'], 'venue_day'));
        $this->assertSame([2, 1, 1], array_column($staff['history']['stamps'], 'card_number'));
        $this->assertSame(['kind' => 'points', 'points' => 100], $staff['history']['cards'][0]['reward']);
        $this->assertSame(1, $staff['history']['cards'][0]['number']);

        $own = $this->stamps->forMember($this->grace);
        $this->assertSame(['venue_day' => '2026-10-03', 'source' => 'purchase'], $own['card']['stamps'][0]);
        $this->assertSame(['venue_day' => '2026-10-01', 'source' => 'check_in', 'card_number' => 1], $own['history']['stamps'][2]);
    }
}
