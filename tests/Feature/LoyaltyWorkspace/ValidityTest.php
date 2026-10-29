<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\AuditLog;
use App\Models\LoyaltyMember;
use App\Services\Loyalty\Members\MemberErasure;
use App\Services\Loyalty\Members\MembershipValidity;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use Tests\Concerns\LoyaltyWorkspace\MembershipSchema;
use Tests\Concerns\LoyaltyWorkspace\ValiditySchema;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/**
 * A membership's end date in the workspace (release 8, spec 2026-10-25 §3): `PUT members/{id}/validity` — a manager
 * sets a date, extends by 1, 3 or 6 months or a year from the later of the venue's today and the current end, or
 * removes it; a past date is refused; every change is audited with the old and new date and clears the reminder's
 * mark; a retry with the same key writes nothing and the same key with another change is `key_reused`. The member row
 * answers `valid_until` and `membership_state`, and the list shows Expiring soon and Expired with their numbers.
 *
 * The clock is SetsUpLoyaltyWorkspace's: Monday 5 October 2026, 09:00 UTC, a venue on UTC.
 */
class ValidityTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace, MembershipSchema, ValiditySchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->buildMembershipSchema();
        $this->buildValiditySchema();
    }

    /** @param array<string, mixed> $body */
    private function change(int $memberId, array $body, bool $manager = true, array $headers = []): TestResponse
    {
        return ($manager ? $this->asManager() : $this->asStaffMember())->putJson($this->api("members/{$memberId}/validity"), $body, $headers);
    }

    private function stored(LoyaltyMember $m): array
    {
        $row = DB::table('loyalty_members')->where('id', $m->id)->first(['membership_valid_until', 'membership_reminded_for']);

        return [$row->membership_valid_until, $row->membership_reminded_for];
    }

    public function test_a_manager_sets_a_date_and_the_answer_is_the_member_their_date_and_its_state(): void
    {
        $this->change($this->grace->id, ['valid_until' => '2027-10-03'])->assertOk()
            ->assertJsonPath('valid_until', '2027-10-03')
            ->assertJsonPath('state', 'active')
            ->assertJsonPath('changed', true)
            ->assertJsonPath('replayed', false)
            ->assertJsonPath('member.id', $this->grace->id)
            ->assertJsonPath('member.valid_until', '2027-10-03')
            ->assertJsonPath('member.membership_state', 'active')
            ->assertJsonPath('member.referral_code', $this->grace->referral_code);

        // Stored as a plain day, the same on every database.
        $this->assertSame(['2027-10-03', null], $this->stored($this->grace));

        $audit = AuditLog::query()->where('action', 'member.validity_changed')->firstOrFail();
        $this->assertSame(['valid_until' => null], $audit->old_values);
        $this->assertSame(['valid_until' => '2027-10-03'], $audit->new_values);
        $this->assertSame((int) $this->grace->id, (int) $audit->subject_id);
        $this->assertSame((int) $this->manager->id, (int) $audit->causer_id);
    }

    public function test_extend_counts_from_the_later_of_today_and_the_current_end(): void
    {
        // No end date: from today (31 days on: not yet "expiring", which is 30 days or fewer).
        $this->change($this->grace->id, ['extend' => '1m'])->assertOk()->assertJsonPath('valid_until', '2026-11-05')->assertJsonPath('state', 'active');
        // An end in the future: from it.
        $this->change($this->grace->id, ['extend' => '1y'])->assertOk()->assertJsonPath('valid_until', '2027-11-05')->assertJsonPath('state', 'active');

        // An end that has passed: from today again.
        DB::table('loyalty_members')->where('id', $this->ada->id)->update(['membership_valid_until' => '2026-09-30']);
        $this->asManager()->getJson($this->api("members/{$this->ada->id}"))->assertOk()->assertJsonPath('member.membership_state', 'expired');
        $this->change($this->ada->id, ['extend' => '3m'])->assertOk()->assertJsonPath('valid_until', '2027-01-05');
        $this->change($this->ada->id, ['extend' => '6m'])->assertOk()->assertJsonPath('valid_until', '2027-07-05');

        $this->assertSame(4, AuditLog::query()->where('action', 'member.validity_changed')->count());
        $last = AuditLog::query()->where('action', 'member.validity_changed')->latest('id')->first();
        $this->assertSame(['valid_until' => '2027-01-05'], $last->old_values);
        $this->assertSame(['valid_until' => '2027-07-05', 'extend' => '6m'], $last->new_values);
    }

    public function test_a_month_without_the_day_ends_on_its_last_day(): void
    {
        DB::table('loyalty_members')->where('id', $this->grace->id)->update(['membership_valid_until' => '2027-01-31']);

        $this->change($this->grace->id, ['extend' => '1m'])->assertOk()->assertJsonPath('valid_until', '2027-02-28');
    }

    public function test_remove_the_end_date_and_a_change_that_keeps_the_date_writes_nothing(): void
    {
        $this->change($this->grace->id, ['valid_until' => '2027-03-01'])->assertOk();
        $this->change($this->grace->id, ['valid_until' => '2027-03-01'])->assertOk()->assertJsonPath('changed', false);
        $this->assertSame(1, AuditLog::query()->where('action', 'member.validity_changed')->count());

        $this->change($this->grace->id, ['valid_until' => null])->assertOk()
            ->assertJsonPath('valid_until', null)->assertJsonPath('state', 'active')->assertJsonPath('changed', true);
        $this->assertSame([null, null], $this->stored($this->grace));
        $this->assertSame(['valid_until' => '2027-03-01'], AuditLog::query()->where('action', 'member.validity_changed')->latest('id')->first()->old_values);
    }

    public function test_a_past_date_and_a_body_that_is_not_one_change_are_refused(): void
    {
        $this->change($this->grace->id, ['valid_until' => '2026-10-04'])->assertStatus(422)->assertJsonValidationErrors('valid_until');
        $this->change($this->grace->id, ['valid_until' => '2026-02-30'])->assertStatus(422)->assertJsonValidationErrors('valid_until');
        $this->change($this->grace->id, ['valid_until' => '05.10.2027'])->assertStatus(422)->assertJsonValidationErrors('valid_until');
        $this->change($this->grace->id, ['valid_until' => '2099-01-01'])->assertStatus(422)->assertJsonValidationErrors('valid_until');
        $this->change($this->grace->id, ['extend' => '2y'])->assertStatus(422)->assertJsonValidationErrors('extend');
        $this->change($this->grace->id, [])->assertStatus(422)->assertJsonValidationErrors('valid_until');
        $this->change($this->grace->id, ['valid_until' => '2027-01-01', 'extend' => '1m'])->assertStatus(422)->assertJsonValidationErrors('valid_until');

        // Today itself is the last day of a membership, and may be set.
        $this->change($this->grace->id, ['valid_until' => '2026-10-05'])->assertOk()->assertJsonPath('state', 'expiring');
        $this->assertSame(1, AuditLog::query()->where('action', 'member.validity_changed')->count());
    }

    public function test_only_a_manager_changes_it_and_only_for_this_organisations_living_members(): void
    {
        $this->change($this->grace->id, ['valid_until' => '2027-01-01'], manager: false)->assertStatus(403)->assertJsonPath('error', 'not_allowed');

        ['member' => $theirs] = $this->otherOrganization();
        $this->change($theirs->id, ['valid_until' => '2027-01-01'])->assertStatus(404)->assertJsonPath('error', 'not_found');

        $this->grace->user->forceFill(['email' => MemberErasure::stubEmail((int) $this->grace->id)])->save();
        $this->change($this->grace->id, ['valid_until' => '2027-01-01'])->assertStatus(409)->assertJsonPath('error', 'already_erased');
        // A member who deleted their own account is refused the same way.
        $this->ada->user->forceFill(['email' => MemberErasure::selfDeletedEmail((int) $this->ada->user_id)])->save();
        $this->change($this->ada->id, ['valid_until' => '2027-01-01'])->assertStatus(409)->assertJsonPath('error', 'already_erased');

        $this->assertSame(0, AuditLog::query()->where('action', 'member.validity_changed')->count());
        $this->assertSame([null, null], $this->stored($this->grace));
    }

    public function test_a_retry_with_the_same_key_writes_nothing_and_another_change_under_it_is_refused(): void
    {
        $this->change($this->grace->id, ['extend' => '1m', 'idempotency_key' => 'press-1'])->assertOk()->assertJsonPath('valid_until', '2026-11-05');
        // A second Extend with the same key (a double press, a retried request): the first answer, no second month.
        $this->change($this->grace->id, ['extend' => '1m', 'idempotency_key' => 'press-1'])->assertOk()
            ->assertJsonPath('valid_until', '2026-11-05')->assertJsonPath('replayed', true)->assertJsonPath('changed', false);
        $this->change($this->grace->id, ['extend' => '3m', 'idempotency_key' => 'press-1'])->assertStatus(409)->assertJsonPath('error', 'key_reused');

        // The header is read when the body names no key; a key is the member's own.
        $this->change($this->grace->id, ['extend' => '1m'], headers: ['Idempotency-Key' => 'press-2'])->assertOk()->assertJsonPath('valid_until', '2026-12-05');
        $this->change($this->grace->id, ['extend' => '1m'], headers: ['Idempotency-Key' => 'press-2'])->assertOk()->assertJsonPath('replayed', true);
        $this->change($this->ada->id, ['extend' => '1m', 'idempotency_key' => 'press-1'])->assertOk()->assertJsonPath('valid_until', '2026-11-05')->assertJsonPath('replayed', false);

        $this->assertSame(3, AuditLog::query()->where('action', 'member.validity_changed')->count());
    }

    public function test_a_changed_date_can_be_reminded_again(): void
    {
        DB::table('loyalty_members')->where('id', $this->grace->id)->update(['membership_valid_until' => '2026-10-15', 'membership_reminded_for' => '2026-10-15']);

        $this->change($this->grace->id, ['extend' => '1y'])->assertOk()->assertJsonPath('valid_until', '2027-10-15');

        $this->assertSame(['2027-10-15', null], $this->stored($this->grace));
    }

    public function test_the_row_says_the_state_on_the_venues_clock(): void
    {
        $at = fn (string $date) => DB::table('loyalty_members')->where('id', $this->grace->id)->update(['membership_valid_until' => $date]);
        $state = fn () => $this->asStaffMember()->getJson($this->api("members/{$this->grace->id}"))->assertOk()->json('member');

        $this->assertSame(['valid_until' => null, 'membership_state' => 'active'], array_intersect_key($state(), array_flip(['valid_until', 'membership_state'])));
        $at('2026-11-04');
        $this->assertSame('expiring', $state()['membership_state']);
        $at('2026-11-05');
        $this->assertSame('active', $state()['membership_state']);
        $at('2026-10-05');
        $this->assertSame('expiring', $state()['membership_state']);
        $at('2026-10-04');
        $this->assertSame('expired', $state()['membership_state']);

        // A switched-off member reads as off, whatever the date.
        DB::table('loyalty_members')->where('id', $this->grace->id)->update(['is_active' => false]);
        $this->assertSame(['valid_until' => '2026-10-04', 'membership_state' => 'off'], array_intersect_key($state(), array_flip(['valid_until', 'membership_state'])));

        // At 23:30 in Riga on the 4th it is already the 5th there: an end on the 4th has passed.
        DB::table('loyalty_members')->where('id', $this->grace->id)->update(['is_active' => true]);
        $this->travelTo(\Carbon\CarbonImmutable::parse('2026-10-04 21:30:00'));
        $this->org->forceFill(['timezone' => 'Europe/Riga'])->save();
        app()->forgetScopedInstances();
        $this->assertSame('expired', MembershipValidity::summaryFor($this->grace->fresh())['state']);
    }

    public function test_the_list_shows_expiring_and_expired_members_and_counts_them(): void
    {
        $soon = $this->makeMember('Soon Ending', 'soon@example.test');
        $gone = $this->makeMember('Long Gone', 'gone@example.test');
        $later = $this->makeMember('Much Later', 'later@example.test');
        $offAndGone = $this->makeMember('Off And Gone', 'off@example.test', ['is_active' => false]);
        foreach ([[$soon, '2026-10-20'], [$gone, '2026-09-01'], [$later, '2027-06-01'], [$offAndGone, '2026-01-01']] as [$m, $date]) {
            DB::table('loyalty_members')->where('id', $m->id)->update(['membership_valid_until' => $date]);
        }

        $ids = fn (string $state) => array_column($this->asStaffMember()->getJson($this->api("members?state={$state}"))->assertOk()->json('members'), 'id');

        $this->assertSame([$soon->id], $ids('expiring'));
        $this->assertSame([$gone->id], $ids('expired'));
        // Active still means switched on, whatever the date (as before release 8).
        $this->assertContains($gone->id, $ids('active'));
        $this->assertNotContains($offAndGone->id, $ids('expired'));

        $this->asStaffMember()->getJson($this->api('members'))->assertOk()
            ->assertJsonPath('figures.expiring', 1)
            ->assertJsonPath('figures.expired', 1)
            ->assertJsonPath('members.0.membership_state', 'active');
        $this->asStaffMember()->getJson($this->api('members?state=expiring'))->assertOk()
            ->assertJsonPath('members.0.valid_until', '2026-10-20')->assertJsonPath('members.0.membership_state', 'expiring');
    }

    public function test_a_merged_member_keeps_the_later_end_date(): void
    {
        $at = fn (LoyaltyMember $m, ?string $date, ?string $reminded = null) => DB::table('loyalty_members')->where('id', $m->id)
            ->update(['membership_valid_until' => $date, 'membership_reminded_for' => $reminded]);
        $kept = function (LoyaltyMember $winner, LoyaltyMember $loser): array {
            $winner = $winner->fresh();
            MembershipValidity::keptOnMerge($winner, $loser->fresh());
            $winner->save();

            return $this->stored($winner);
        };

        $at($this->ada, '2027-01-01');
        $at($this->grace, '2027-06-01', '2027-06-01');
        $this->assertSame(['2027-06-01', '2027-06-01'], $kept($this->ada, $this->grace), 'the later end, with its reminder');

        $at($this->ada, '2027-06-01');
        $at($this->grace, '2026-12-01');
        $this->assertSame(['2027-06-01', null], $kept($this->ada, $this->grace), 'the winner\'s is later: kept');

        // A duplicate made without an end date never lifts a paid membership's end, nor does it gain one by losing.
        $at($this->ada, null);
        $at($this->grace, '2027-03-01');
        $this->assertSame(['2027-03-01', null], $kept($this->ada, $this->grace));
        $at($this->ada, '2027-03-01');
        $at($this->grace, null);
        $this->assertSame(['2027-03-01', null], $kept($this->ada, $this->grace));
    }
}
