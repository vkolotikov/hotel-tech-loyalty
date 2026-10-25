<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\EventAttendance;
use App\Models\EventRegistration;
use App\Models\LoyaltyMember;
use App\Services\Loyalty\Events\EventRows;
use App\Services\MemberMergeService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\LoyaltyWorkspace\AccessSchema;
use Tests\Concerns\LoyaltyWorkspace\CreditSchema;
use Tests\Concerns\LoyaltyWorkspace\EventsSchema;
use Tests\Concerns\LoyaltyWorkspace\MembershipSchema;
use Tests\Concerns\LoyaltyWorkspace\PushSchema;
use Tests\Concerns\LoyaltyWorkspace\ValiditySchema;
use Tests\Concerns\LoyaltyWorkspace\VisitsSchema;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/**
 * Two members merged (MemberMergeService, release 8 §4) through EventMerge::beforeMerge: one sign-up and one check-in
 * per event — the winner's kept, the loser's duplicates dropped and counted, the loser's others moved; a standing
 * sign-up of either kept for the merged member; a walk-in who had signed up under the other account no longer counted
 * twice.
 */
class EventMergeTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace, MembershipSchema, AccessSchema, EventsSchema, ValiditySchema, VisitsSchema, CreditSchema, PushSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->buildMembershipSchema();
        $this->buildAccessSchema();
        $this->buildEventsSchema();
        $this->buildValiditySchema();
        $this->buildVisitsSchema();
        $this->buildCreditSchema();
        $this->buildPushSchema();
    }

    private function signUp(int $eventId, LoyaltyMember $member, string $status = 'signed_up', string $at = '2026-10-01 10:00:00'): void
    {
        DB::table('loyalty_event_registrations')->insert(['organization_id' => $this->org->id, 'loyalty_event_id' => $eventId, 'member_id' => $member->id, 'status' => $status, 'source' => 'portal',
            'signed_up_at' => $at, 'cancelled_at' => $status === 'cancelled' ? '2026-10-02 10:00:00' : null, 'created_at' => now(), 'updated_at' => now()]);
    }

    private function attend(int $eventId, LoyaltyMember $member, bool $walkIn): void
    {
        DB::table('loyalty_event_attendances')->insert(['organization_id' => $this->org->id, 'loyalty_event_id' => $eventId, 'member_id' => $member->id, 'checked_in_at' => now(), 'walk_in' => $walkIn, 'created_at' => now(), 'updated_at' => now()]);
    }

    public function test_one_sign_up_and_one_check_in_per_event_are_kept_for_the_merged_member(): void
    {
        $both = $this->makeEvent(['title' => 'Both', 'sign_up' => true])->id;
        $loserOnly = $this->makeEvent(['title' => 'Loser only', 'sign_up' => true])->id;
        $revived = $this->makeEvent(['title' => 'Revived', 'sign_up' => true])->id;
        $walked = $this->makeEvent(['title' => 'Walked in', 'sign_up' => true])->id;

        $this->signUp($both, $this->ada);
        $this->signUp($both, $this->grace);
        $this->attend($both, $this->ada, false);
        $this->attend($both, $this->grace, false);
        $this->signUp($loserOnly, $this->grace);
        $this->attend($loserOnly, $this->grace, false);
        // Ada cancelled, Grace's sign-up stands: the merged member keeps a place, from Grace's time.
        $this->signUp($revived, $this->ada, 'cancelled', '2026-10-01 09:00:00');
        $this->signUp($revived, $this->grace, 'signed_up', '2026-10-03 12:00:00');
        // Ada walked in; Grace had signed up: one person, signed up.
        $this->attend($walked, $this->ada, true);
        $this->signUp($walked, $this->grace);

        $result = app(MemberMergeService::class)->merge($this->ada->fresh(), $this->grace->fresh());

        $this->assertSame(0, EventRegistration::query()->where('member_id', $this->grace->id)->count() + EventAttendance::query()->where('member_id', $this->grace->id)->count());
        $this->assertSame([$both, $loserOnly, $revived, $walked], EventRegistration::query()->where('member_id', $this->ada->id)->orderBy('loyalty_event_id')->pluck('loyalty_event_id')->map(fn ($id) => (int) $id)->all());
        $this->assertSame([$both, $loserOnly, $walked], EventAttendance::query()->where('member_id', $this->ada->id)->orderBy('loyalty_event_id')->pluck('loyalty_event_id')->map(fn ($id) => (int) $id)->all());

        $revivedRow = EventRegistration::query()->where('member_id', $this->ada->id)->where('loyalty_event_id', $revived)->firstOrFail();
        $this->assertSame(['signed_up', '2026-10-03 12:00:00', null], [$revivedRow->status, $revivedRow->signed_up_at->format('Y-m-d H:i:s'), $revivedRow->cancelled_at]);
        $this->assertFalse((bool) EventAttendance::query()->where('loyalty_event_id', $walked)->value('walk_in'));
        $this->assertSame(['signed_up' => 1, 'checked_in' => 1, 'walk_ins' => 0], EventRows::counts($this->org->id, [$walked])[$walked]);

        $dropped = json_decode((string) DB::table('member_merges')->where('surviving_member_id', $this->ada->id)->value('merged_data'), true)['dropped'];
        $this->assertSame(3, $dropped['loyalty_event_registrations'], 'a sign-up and a check-in for Both, a sign-up for Revived');
        $this->assertArrayHasKey('moved', $result);
    }
}
