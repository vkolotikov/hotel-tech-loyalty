<?php

namespace Tests\Feature\Member;

use App\Models\LoyaltyMember;
use App\Models\Organization;
use App\Models\PointsTransaction;
use App\Models\Referral;
use App\Models\User;
use App\Services\Loyalty\Programme\ProgrammeOptions;
use App\Services\Loyalty\Visits\ReferralRewards;
use App\Services\Loyalty\Visits\Visit;
use App\Services\Loyalty\Visits\VisitRecorder;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\LoyaltyWorkspace\CreditSchema;
use Tests\Concerns\LoyaltyWorkspace\TierCountsSchema;
use Tests\Concerns\LoyaltyWorkspace\VisitsSchema;

/**
 * Referrals rewarded at the friend's first visit (release 7, spec 2026-10-25 §4.5), through the real public sign-up:
 *
 *   - `first_visit` (the default): sign-up writes the referral `pending` and pays nothing; the friend's first visit
 *     (VisitRecorder → ReferralRewards::qualify) pays both bonuses once, keys `referral_{id}_referrer` / `_referee`,
 *     and stamps the row qualified and rewarded.
 *   - `signup`: both paid at sign-up, as sign-up always did.
 *   - referrals off: sign-up ignores the code, GET member/referral answers `enabled: false` with nothing to share, and
 *     a referral already pending waits until they are on again.
 *   - a self-referral, or a second referral of a referee already rewarded, pays nothing.
 */
class ReferralRewardsTest extends MemberEndpointTestCase
{
    use VisitsSchema, CreditSchema, TierCountsSchema, \Tests\Concerns\LoyaltyWorkspace\ValiditySchema;

    protected function setUp(): void
    {
        parent::setUp();
        if (!Schema::hasTable('referrals')) {
            Schema::create('referrals', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id')->nullable();
                $t->unsignedBigInteger('referrer_id');
                $t->unsignedBigInteger('referee_id');
                $t->string('status', 20)->default('pending');
                $t->integer('referrer_points_awarded')->default(0);
                $t->integer('referee_points_awarded')->default(0);
                $t->timestamp('qualified_at')->nullable();
                $t->timestamp('rewarded_at')->nullable();
                $t->timestamps();
                $t->unique(['referrer_id', 'referee_id']);
            });
        }
        $this->buildVisitsSchema();
        $this->buildCreditSchema();
        $this->buildTierCountsSchema();
        // Release 8: the counters' visits and venue day.
        $this->buildValiditySchema();
    }

    /** The venue's options, written under its own organisation. */
    private function setOptions(Organization $org, array $changes): void
    {
        $prior = app()->bound('current_organization_id') ? app('current_organization_id') : null;
        app()->instance('current_organization_id', $org->id);
        ProgrammeOptions::save($org->id, $changes, null);
        $prior === null ? app()->forgetInstance('current_organization_id') : app()->instance('current_organization_id', $prior);
    }

    /** A friend joins through the public sign-up with a code. */
    private function join(Organization $org, ?string $code): LoyaltyMember
    {
        $email = 'friend_' . uniqid('', true) . '@example.test';
        $this->postJson(self::REGISTER, [
            'name' => 'Fern Friend', 'email' => $email, 'password' => 'Sup3rSecret!1', 'password_confirmation' => 'Sup3rSecret!1',
            'org_token' => $org->fresh()->widget_token, 'referral_code' => $code,
        ])->assertStatus(201);
        foreach (['current_organization_id', 'current_brand_id'] as $bound) {
            if (app()->bound($bound)) {
                app()->forgetInstance($bound);
            }
        }
        $this->app['auth']->forgetGuards();

        $user = User::withoutGlobalScopes()->where('email', $email)->firstOrFail();

        return LoyaltyMember::withoutGlobalScopes()->where('user_id', $user->id)->firstOrFail();
    }

    private function referrer(Organization $org): LoyaltyMember
    {
        $member = $this->member($org)['member'];
        LoyaltyMember::withoutGlobalScopes()->whereKey($member->id)->update(['referral_code' => 'FERN' . $member->id]);

        return $member->fresh();
    }

    private function points(LoyaltyMember $m): int
    {
        return (int) LoyaltyMember::withoutGlobalScopes()->whereKey($m->id)->value('current_points');
    }

    private function visit(LoyaltyMember $m, int $ref = 1): void
    {
        $prior = app()->bound('current_organization_id') ? app('current_organization_id') : null;
        app()->instance('current_organization_id', $m->organization_id);
        app(VisitRecorder::class)->record(LoyaltyMember::withoutGlobalScopes()->findOrFail($m->id), new Visit(Visit::CHECK_IN, 'scan_event', $ref, null, now()->toDateString()));
        $prior === null ? app()->forgetInstance('current_organization_id') : app()->instance('current_organization_id', $prior);
    }

    private function referral(LoyaltyMember $referee): ?Referral
    {
        return Referral::withoutGlobalScopes()->where('referee_id', $referee->id)->first();
    }

    public function test_by_default_sign_up_writes_a_pending_referral_and_the_first_visit_pays_both_once(): void
    {
        $org = $this->tenant();
        $alice = $this->referrer($org);
        $aliceBefore = $this->points($alice);

        $fern = $this->join($org, $alice->referral_code);

        $referral = $this->referral($fern);
        $this->assertSame(['pending', 0, 0], [$referral->status, (int) $referral->referrer_points_awarded, (int) $referral->referee_points_awarded]);
        $this->assertNull($referral->qualified_at);
        $this->assertSame((int) $alice->id, (int) $fern->referred_by);
        $this->assertSame($aliceBefore, $this->points($alice));
        $this->assertSame(500, $this->points($fern), 'the welcome bonus only');
        $this->assertSame(0, PointsTransaction::withoutGlobalScopes()->where('type', 'referral')->count());

        $this->visit($fern, 1);

        $referral->refresh();
        $this->assertSame(['rewarded', 250, 250], [$referral->status, (int) $referral->referrer_points_awarded, (int) $referral->referee_points_awarded]);
        $this->assertNotNull($referral->qualified_at);
        $this->assertNotNull($referral->rewarded_at);
        $this->assertSame($aliceBefore + 250, $this->points($alice));
        $this->assertSame(750, $this->points($fern));
        $this->assertSame(1, PointsTransaction::withoutGlobalScopes()->where('idempotency_key', "referral_{$referral->id}_referrer")->where('member_id', $alice->id)->where('type', 'referral')->count());
        $this->assertSame(1, PointsTransaction::withoutGlobalScopes()->where('idempotency_key', "referral_{$referral->id}_referee")->where('member_id', $fern->id)->where('type', 'referral')->count());

        // The next visit, or the same one recorded again: nothing more.
        $this->visit($fern, 2);
        $this->assertFalse(app(ReferralRewards::class)->qualify($fern->fresh(), new Visit(Visit::CHECK_IN, 'scan_event', 3, null, now()->toDateString())));
        $this->assertSame($aliceBefore + 250, $this->points($alice));
        $this->assertSame(750, $this->points($fern));
    }

    public function test_a_venue_that_rewards_at_sign_up_pays_both_there_with_its_own_amounts(): void
    {
        $org = $this->tenant();
        $this->setOptions($org, ['referral_reward_on' => 'signup', 'referrer_bonus_points' => 100, 'referee_bonus_points' => 40, 'welcome_bonus_points' => 0]);
        $alice = $this->referrer($org);
        $aliceBefore = $this->points($alice);

        $fern = $this->join($org, $alice->referral_code);

        $referral = $this->referral($fern);
        $this->assertSame(['rewarded', 100, 40], [$referral->status, (int) $referral->referrer_points_awarded, (int) $referral->referee_points_awarded]);
        $this->assertSame($aliceBefore + 100, $this->points($alice));
        $this->assertSame(40, $this->points($fern), 'no welcome bonus at 0, the referee bonus');
        $this->assertSame(1, PointsTransaction::withoutGlobalScopes()->where('idempotency_key', "referral_{$referral->id}_referee")->count());

        $this->visit($fern);
        $this->assertSame($aliceBefore + 100, $this->points($alice));
    }

    public function test_with_referrals_off_sign_up_ignores_the_code_and_nothing_is_offered_to_share(): void
    {
        $org = $this->tenant();
        $alice = $this->referrer($org);
        $this->setOptions($org, ['referral_enabled' => false]);

        $fern = $this->join($org, $alice->referral_code);

        $this->assertNull($fern->referred_by);
        $this->assertNull($this->referral($fern));

        ['token' => $token] = $this->member($org);
        $this->withToken($token)->getJson('/api/v1/member/referral')->assertOk()
            ->assertJsonPath('enabled', false)->assertJsonPath('referral_code', null)->assertJsonPath('referral_link', null);
    }

    public function test_a_pending_referral_waits_while_referrals_are_off(): void
    {
        $org = $this->tenant();
        $alice = $this->referrer($org);
        $fern = $this->join($org, $alice->referral_code);
        $this->setOptions($org, ['referral_enabled' => false]);

        $this->visit($fern, 1);
        $this->assertSame('pending', $this->referral($fern)->status);

        $this->setOptions($org, ['referral_enabled' => true]);
        $this->visit($fern, 2);
        $this->assertSame('rewarded', $this->referral($fern)->status);
    }

    public function test_the_referral_endpoint_says_when_both_are_rewarded(): void
    {
        $org = $this->tenant();
        ['token' => $token] = $this->member($org);

        $this->withToken($token)->getJson('/api/v1/member/referral')->assertOk()
            ->assertJsonPath('enabled', true)->assertJsonPath('reward_on', 'first_visit')
            ->assertJsonPath('referrer_bonus_points', 250)->assertJsonPath('referee_bonus_points', 250);
    }

    public function test_an_unknown_code_writes_nothing_and_another_venues_code_is_unknown(): void
    {
        $org = $this->tenant();
        $elsewhere = $this->tenant('Elsewhere');
        $bob = $this->referrer($elsewhere);

        $fern = $this->join($org, 'NOSUCHCODE');
        $gus = $this->join($org, $bob->referral_code);

        $this->assertNull($this->referral($fern));
        $this->assertNull($this->referral($gus));
        $this->assertNull($gus->referred_by);
    }

    public function test_a_second_referral_of_a_rewarded_referee_and_a_self_referral_pay_nothing(): void
    {
        $org = $this->tenant();
        $alice = $this->referrer($org);
        $bob = $this->referrer($org);
        $fern = $this->join($org, $alice->referral_code);
        $this->visit($fern, 1);
        $this->assertSame('rewarded', $this->referral($fern)->status);

        // A second referral of Fern (say, two accounts merged), and Bob referring himself.
        $second = Referral::withoutGlobalScopes()->create(['organization_id' => $org->id, 'referrer_id' => $bob->id, 'referee_id' => $fern->id, 'status' => 'pending']);
        LoyaltyMember::withoutGlobalScopes()->whereKey($fern->id)->update(['referred_by' => $bob->id]);
        $self = Referral::withoutGlobalScopes()->create(['organization_id' => $org->id, 'referrer_id' => $bob->id, 'referee_id' => $bob->id, 'status' => 'pending']);
        LoyaltyMember::withoutGlobalScopes()->whereKey($bob->id)->update(['referred_by' => $bob->id]);
        $bobBefore = $this->points($bob);

        $this->visit($fern, 2);
        $this->visit($bob, 3);

        $this->assertSame('pending', $second->fresh()->status);
        $this->assertSame('pending', $self->fresh()->status);
        $this->assertSame($bobBefore, $this->points($bob));
    }

    public function test_with_expiry_never_a_new_member_has_no_expiry_date(): void
    {
        $org = $this->tenant();
        $this->setOptions($org, ['points_expiry_months' => 0, 'welcome_bonus_points' => 0]);

        $fern = $this->join($org, null);

        $this->assertNull($fern->points_expiry_date);
    }
}
