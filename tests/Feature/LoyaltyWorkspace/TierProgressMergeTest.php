<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\LoyaltyMember;
use App\Services\Loyalty\Visits\TierCounters;
use App\Services\Loyalty\Visits\Visit;
use App\Services\MemberMergeService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\LoyaltyWorkspace\CreditSchema;
use Tests\Concerns\LoyaltyWorkspace\MembershipSchema;
use Tests\Concerns\LoyaltyWorkspace\PushSchema;
use Tests\Concerns\LoyaltyWorkspace\TierCountsSchema;
use Tests\Concerns\LoyaltyWorkspace\ValiditySchema;
use Tests\Concerns\LoyaltyWorkspace\VisitsSchema;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/**
 * Two members merged (release 8, spec 2026-10-25 §3): a visit counts once per member per venue day, so a day both
 * accounts visited counts once for the kept member — the earliest of the day's rows keeps the visit — and
 * `qualifying_visits` is read again from the rows, the visits taken back left out.
 */
class TierProgressMergeTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace, MembershipSchema, VisitsSchema, CreditSchema, PushSchema, TierCountsSchema, ValiditySchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->buildMembershipSchema();
        $this->buildVisitsSchema();
        $this->buildCreditSchema();
        $this->buildPushSchema();
        $this->buildTierCountsSchema();
        $this->buildValiditySchema();
    }

    private function visit(LoyaltyMember $m, int $ref, string $day, ?float $amount = null): void
    {
        app(TierCounters::class)->count($m, new Visit(Visit::CHECK_IN, 'scan_event', $ref, $amount, $day));
    }

    public function test_a_day_both_members_visited_counts_once_for_the_kept_member(): void
    {
        $this->visit($this->ada, 1, '2026-10-01');
        $this->visit($this->ada, 2, '2026-10-03', 20.0);
        $this->visit($this->grace, 3, '2026-10-03', 15.0);   // the same day as Ada's second
        $this->visit($this->grace, 4, '2026-10-04');
        $this->visit($this->grace, 5, '2026-10-02');
        app(TierCounters::class)->uncount((int) $this->org->id, 'scan_event', 5); // taken back before the merge
        $this->assertSame([2, 2], [(int) $this->ada->fresh()->qualifying_visits, (int) $this->grace->fresh()->qualifying_visits]);

        app(MemberMergeService::class)->merge($this->ada->fresh(), $this->grace->fresh());

        $this->assertSame(3, (int) $this->ada->fresh()->qualifying_visits, 'the 1st, the 3rd once, the 4th');
        $days = DB::table('tier_qualification_counts')->where('member_id', $this->ada->id)->whereNull('reversed_at')->orderBy('id')->get(['reference_id', 'visits', 'venue_day'])
            ->map(fn ($r) => [(int) $r->reference_id, (int) $r->visits, $r->venue_day])->all();
        $this->assertSame([[1, 1, '2026-10-01'], [2, 1, '2026-10-03'], [3, 0, '2026-10-03'], [4, 1, '2026-10-04']], $days);
        // The spend of both visits of the 3rd still counts.
        $this->assertSame('35.00', number_format((float) DB::table('loyalty_members')->where('id', $this->ada->id)->value('qualifying_spend'), 2, '.', ''));

        // And the day keeps its one visit should its counted one be taken back later.
        app(TierCounters::class)->uncount((int) $this->org->id, 'scan_event', 2);
        $this->assertSame(3, (int) $this->ada->fresh()->qualifying_visits);
    }
}
