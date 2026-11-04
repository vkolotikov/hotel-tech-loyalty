<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\Guest;
use App\Models\LoyaltyMember;
use App\Models\User;
use App\Services\GuestMemberLinkService;
use App\Services\Loyalty\Members\MemberDetails;
use App\Services\Loyalty\Members\OwnAccount;
use App\Services\Loyalty\LoyaltyRefused;
use App\Services\MemberMergeService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\LoyaltyWorkspace\MembershipSchema;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/**
 * A membership's sign-in account is its organisation's own member account (security review, 2026-11-04). `users` has
 * no tenant scope, and a guest created anywhere (the booking widget, the chatbot, an import) used to be wrapped around
 * ANY account with the same address: another venue's member, or a staff login of any organisation. That venue could
 * then change the account's email, reset its password and sign in as its owner, or erase or merge it away. Now a guest
 * is linked only to this organisation's own member account, every writer of a member's account refuses another's, and
 * `php artisan loyalty:foreign-accounts` finds and detaches the links made before.
 */
class ForeignAccountsTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace, MembershipSchema;

    /** @var array{org: \App\Models\Organization, tier: \App\Models\LoyaltyTier, member: LoyaltyMember} */
    private array $elsewhere;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->buildMembershipSchema();
        $this->elsewhere = $this->otherOrganization();
    }

    /** A guest of this organisation, created as the widget creates one (the model's auto-enrolment runs). */
    private function guest(string $email, string $name = 'Booked Guest'): Guest
    {
        return Guest::create(['organization_id' => $this->org->id, 'full_name' => $name, 'email' => $email]);
    }

    /** Another organisation's owner, a staff login. */
    private function foreignOwner(): User
    {
        return User::create([
            'organization_id' => $this->elsewhere['org']->id, 'name' => 'Other Owner', 'email' => 'owner@elsewhere.test',
            'password' => bcrypt('secret-pass-1'), 'user_type' => 'staff',
        ]);
    }

    /** A membership of THIS organisation pointing at another organisation's account, as the old link made. */
    private function foreignLinkedMember(User $account): LoyaltyMember
    {
        $member = LoyaltyMember::create([
            'organization_id' => $this->org->id, 'user_id' => $account->id, 'tier_id' => $this->tiers['silver']->id,
            'member_number' => 'LS-FOREIGN', 'current_points' => 40, 'lifetime_points' => 40, 'is_active' => true,
            'joined_at' => now(), 'qr_code_token' => bin2hex(random_bytes(16)), 'referral_code' => strtoupper(bin2hex(random_bytes(4))),
        ]);
        DB::table('guests')->insert(['organization_id' => $this->org->id, 'member_id' => $member->id, 'full_name' => 'Name We Hold',
            'email' => $account->email, 'created_at' => now(), 'updated_at' => now()]);

        return $member;
    }

    /** @return array<string, mixed> what a user row held, to prove it was not touched */
    private function snapshot(User $user): array
    {
        return (array) DB::table('users')->where('id', $user->id)->first();
    }

    // ─── Linking a guest ────────────────────────────────────────────────

    public function test_a_guest_with_another_organisations_owner_address_stays_a_guest(): void
    {
        $owner = $this->foreignOwner();
        $before = $this->snapshot($owner);

        $guest = $this->guest('Owner@Elsewhere.test ');

        $this->assertNull($guest->fresh()->member_id);
        $this->assertFalse(LoyaltyMember::query()->where('user_id', $owner->id)->exists());
        $this->assertSame($before, $this->snapshot($owner));
        $this->assertNull(app(GuestMemberLinkService::class)->ensureMemberForGuest($guest->fresh()));
        $this->assertFalse(app(GuestMemberLinkService::class)->linkGuestToMember($guest->fresh()));
    }

    public function test_a_guest_with_another_venues_members_address_stays_a_guest(): void
    {
        $theirs = $this->elsewhere['member']->user;
        $before = $this->snapshot($theirs);

        $guest = $this->guest($theirs->email);

        $this->assertNull($guest->fresh()->member_id);
        $this->assertSame(1, LoyaltyMember::withoutGlobalScopes()->where('user_id', $theirs->id)->count());
        $this->assertSame($before, $this->snapshot($theirs));
        $this->assertFalse(app(GuestMemberLinkService::class)->linkGuestToMember($guest->fresh()));
    }

    public function test_a_guest_with_a_staff_login_of_this_organisation_stays_a_guest(): void
    {
        $guest = $this->guest($this->manager->email);

        $this->assertNull($guest->fresh()->member_id);
        $this->assertFalse(LoyaltyMember::withoutGlobalScopes()->where('user_id', $this->manager->id)->exists());
    }

    public function test_a_guest_with_this_venues_members_address_is_linked_to_that_member(): void
    {
        $guest = $this->guest(strtoupper($this->ada->user->email));

        $this->assertSame($this->ada->id, (int) $guest->fresh()->member_id);
    }

    public function test_a_guest_with_a_new_address_becomes_a_member_with_an_account_of_this_organisation(): void
    {
        $guest = $this->guest('first.visit@example.test', 'First Visit');

        $member = LoyaltyMember::query()->find($guest->fresh()->member_id);
        $this->assertNotNull($member);
        $this->assertTrue(OwnAccount::holds($member));
        $this->assertSame('first.visit@example.test', $member->user->email);
    }

    // ─── Writers refuse another's account ──────────────────────────────

    public function test_editing_a_member_linked_elsewhere_never_writes_that_account(): void
    {
        $owner = $this->foreignOwner();
        $member = $this->foreignLinkedMember($owner);
        $before = $this->snapshot($owner);

        $this->asManager()->putJson($this->api("members/{$member->id}"), [
            'name' => 'Taken Over', 'email' => 'attacker@example.test', 'phone' => null, 'language' => null,
            'nationality' => null, 'date_of_birth' => null, 'marketing_consent' => false,
        ])->assertStatus(409)->assertJsonPath('error', 'account_elsewhere');
        $this->assertSame($before, $this->snapshot($owner));

        try {
            app(MemberDetails::class)->update($member->fresh(), [], ['email' => 'attacker@example.test'], $this->manager);
            $this->fail('the account of another organisation was written');
        } catch (LoyaltyRefused $e) {
            $this->assertSame(409, $e->status);
        }
        $this->assertSame($before, $this->snapshot($owner));

        // The membership itself is still this venue's to manage.
        app(MemberDetails::class)->update($member->fresh(), ['tier_id' => $this->tiers['gold']->id], [], $this->manager);
        $this->assertSame($this->tiers['gold']->id, (int) $member->fresh()->tier_id);
    }

    public function test_erasing_a_member_linked_elsewhere_leaves_that_account_and_its_sign_in_alone(): void
    {
        $owner = $this->foreignOwner();
        $owner->createToken('admin-spa');
        $member = $this->foreignLinkedMember($owner);
        $before = $this->snapshot($owner);

        $this->asManager()->postJson($this->api("members/{$member->id}/erase"), ['confirm_name' => 'Other Owner'])
            ->assertOk()->assertJsonPath('member.is_erased', true);

        $this->assertSame($before, $this->snapshot($owner));
        $this->assertSame(1, DB::table('personal_access_tokens')->where('tokenable_id', $owner->id)->count());
        $member = $member->fresh('user');
        $this->assertNotSame($owner->id, (int) $member->user_id);
        $this->assertTrue(OwnAccount::holds($member));
    }

    public function test_merging_away_a_member_linked_elsewhere_keeps_that_account_and_its_own_membership(): void
    {
        $theirs = $this->elsewhere['member'];
        $member = $this->foreignLinkedMember($theirs->user);
        $before = $this->snapshot($theirs->user);

        app(MemberMergeService::class)->merge($this->ada, $member, $this->manager->id, 'Same person');

        $this->assertNull(LoyaltyMember::withoutGlobalScopes()->find($member->id));
        $this->assertSame($before, $this->snapshot($theirs->user));
        $this->assertNotNull(LoyaltyMember::withoutGlobalScopes()->find($theirs->id));
    }

    public function test_merging_away_a_member_with_its_own_account_still_deletes_that_account(): void
    {
        $graceUser = $this->grace->user_id;

        app(MemberMergeService::class)->merge($this->ada, $this->grace, $this->manager->id, 'Same person');

        $this->assertFalse(DB::table('users')->where('id', $graceUser)->exists());
    }

    // ─── The repair command ─────────────────────────────────────────────

    public function test_the_command_lists_links_made_before_and_detaches_them_on_request(): void
    {
        $owner = $this->foreignOwner();
        $member = $this->foreignLinkedMember($owner);
        $before = $this->snapshot($owner);

        $this->artisan('loyalty:foreign-accounts')->expectsOutputToContain('1 membership(s) linked')->assertSuccessful();
        $this->assertSame($owner->id, (int) $member->fresh()->user_id);

        $this->artisan('loyalty:foreign-accounts', ['--org' => $this->elsewhere['org']->id])
            ->expectsOutputToContain('No membership')->assertSuccessful();

        $this->artisan('loyalty:foreign-accounts', ['--detach' => true])->expectsOutputToContain('Detached 1')->assertSuccessful();

        $member = $member->fresh('user');
        $this->assertTrue(OwnAccount::holds($member));
        $this->assertSame('Name We Hold', $member->user->name);
        $this->assertSame(40, (int) $member->current_points);
        $this->assertSame($before, $this->snapshot($owner));
        $this->artisan('loyalty:foreign-accounts')->expectsOutputToContain('No membership')->assertSuccessful();
    }
}
