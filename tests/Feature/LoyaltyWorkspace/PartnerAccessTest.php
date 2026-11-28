<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\Staff;
use App\Models\ScanEvent;
use App\Services\Loyalty\Access\AccessPlaces;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\LoyaltyWorkspace\AccessSchema;
use Tests\Concerns\LoyaltyWorkspace\EventsSchema;
use Tests\Concerns\LoyaltyWorkspace\ValiditySchema;
use Tests\Concerns\LoyaltyWorkspace\MembershipSchema;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

class PartnerAccessTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace, AccessSchema, EventsSchema, ValiditySchema, MembershipSchema;

    private int $door;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->buildValiditySchema();
        $this->buildAccessSchema();
        $this->buildEventsSchema();
        $this->buildMembershipSchema();
        foreach (['planner_skills', 'last_login_at'] as $column) {
            if (!Schema::hasColumn('staff', $column)) Schema::table('staff', fn ($t) => $t->text($column)->nullable());
        }
        if (!Schema::hasColumn('staff', 'loyalty_scan_only')) {
            Schema::table('staff', function ($t) {
                $t->boolean('loyalty_scan_only')->default(false);
                $t->json('loyalty_place_ids')->nullable();
            });
        }
        $this->door = app(AccessPlaces::class)->create($this->org->id, ['name' => 'Partner entrance', 'admits' => 'all'], $this->manager)->id;
        Staff::where('user_id', $this->staffMember->id)->first()->forceFill([
            'loyalty_scan_only' => true, 'loyalty_place_ids' => [$this->door],
        ])->save();
    }

    public function test_partners_cannot_open_the_directory_or_mutate_settings_even_in_report_mode(): void
    {
        config(['admin_access.mode' => 'report']);
        $this->asStaffMember()->getJson($this->api('members'))->assertForbidden()->assertJsonPath('error', 'scan_only');
        $this->postJson($this->api('scan'), ['code' => $this->ada->member_number])->assertForbidden();
        $this->putJson($this->api('members/'.$this->ada->id.'/membership'), ['membership_mode' => 'earned', 'idempotency_key' => 'no'])->assertForbidden();
    }

    public function test_partner_context_has_only_their_active_places(): void
    {
        $this->asStaffMember()->getJson($this->api('partner/context'))->assertOk()
            ->assertJsonCount(1, 'places')->assertJsonPath('places.0.id', $this->door);
    }

    public function test_a_scan_checks_in_once_and_does_not_expose_contact_points_or_history(): void
    {
        $body = ['code' => $this->ada->member_number, 'place_id' => $this->door, 'idempotency_key' => 'partner-1'];
        $answer = $this->asStaffMember()->postJson($this->api('partner/scan'), $body)->assertOk()
            ->assertJsonPath('verdict.granted', true)->assertJsonPath('member.name', 'Ada Lovelace');
        foreach (['email', 'phone', 'current_points', 'lifetime_points', 'user', 'history'] as $private) {
            $this->assertArrayNotHasKey($private, $answer->json('member'));
        }
        $this->postJson($this->api('partner/scan'), $body)->assertOk()->assertJsonPath('verdict.entry_id', $answer->json('verdict.entry_id'));
        $this->assertSame(1, ScanEvent::where('member_id', $this->ada->id)->count());
    }

    public function test_revoking_a_place_blocks_even_a_previously_successful_replay(): void
    {
        $body = ['code' => $this->ada->member_number, 'place_id' => $this->door, 'idempotency_key' => 'revoked'];
        $this->asStaffMember()->postJson($this->api('partner/scan'), $body)->assertOk();
        Staff::where('user_id', $this->staffMember->id)->first()->forceFill(['loyalty_place_ids' => []])->save();
        $this->postJson($this->api('partner/scan'), $body)->assertForbidden();
        $this->assertSame(1, ScanEvent::where('member_id', $this->ada->id)->count());
    }

    public function test_a_different_place_is_refused_before_any_scan_is_logged(): void
    {
        $other = app(AccessPlaces::class)->create($this->org->id, ['name' => 'Unassigned', 'admits' => 'all'], $this->manager);
        $this->asStaffMember()->postJson($this->api('partner/scan'), ['code' => $this->ada->member_number, 'place_id' => $other->id, 'idempotency_key' => 'outside'])->assertForbidden();
        $this->assertSame(0, ScanEvent::count());
    }

    public function test_manager_invites_a_restricted_account_using_the_existing_activation_flow(): void
    {
        \Illuminate\Support\Facades\Mail::fake();
        $email = 'partner-local@example.test';
        $answer = $this->asManager()->postJson($this->api('partners/invite'), ['name' => 'Partner desk', 'email' => $email,
            'loyalty_place_ids' => [$this->door], 'role' => 'super_admin', 'can_award_points' => true])->assertOk();
        $staff = Staff::findOrFail($answer->json('staff_id'));
        $this->assertSame('staff', $staff->role);
        $this->assertTrue($staff->loyalty_scan_only);
        $this->assertFalse($staff->can_award_points);
        $this->assertFalse($staff->can_redeem_points);
        $this->assertSame([$this->door], $staff->loyalty_place_ids);
        $invite = \App\Models\EmailVerificationCode::where('user_id', $staff->user_id)->where('purpose', 'claim')->firstOrFail();
        $this->assertNull($invite->verified_at);
        $this->postJson($this->api('partners/invite'), ['name' => 'Partner desk', 'email' => $email, 'loyalty_place_ids' => [$this->door]])->assertOk();
        $this->assertSame(1, Staff::where('user_id', $staff->user_id)->count());
    }

    public function test_invites_reject_unassigned_places_and_existing_unrestricted_team_accounts(): void
    {
        \Illuminate\Support\Facades\Mail::fake();
        $this->asManager()->postJson($this->api('partners/invite'), ['name' => 'Desk', 'email' => 'local@example.test', 'loyalty_place_ids' => [999999]])->assertUnprocessable();
        $this->postJson($this->api('partners/invite'), ['name' => 'Manager', 'email' => $this->manager->email, 'loyalty_place_ids' => [$this->door]])->assertUnprocessable();
        $this->assertFalse(Staff::where('user_id', $this->manager->id)->first()->loyalty_scan_only);
    }

    public function test_separate_operators_do_not_share_a_replay_entry_and_revocation_stops_the_account(): void
    {
        $body = ['code' => $this->ada->member_number, 'place_id' => $this->door, 'idempotency_key' => 'same-device-key'];
        $first = $this->asStaffMember()->postJson($this->api('partner/scan'), $body)->assertOk()->json('verdict.entry_id');
        $second = $this->staffUser($this->org, ['role' => 'staff']);
        Staff::where('user_id', $second->id)->first()->forceFill(['loyalty_scan_only' => true, 'loyalty_place_ids' => [$this->door]])->save();
        $this->actingAs($second, 'sanctum')->postJson($this->api('partner/scan'), $body)->assertOk()->assertJsonPath('verdict.entry_id', $first + 1);
        Staff::where('user_id', $second->id)->update(['is_active' => false]);
        config(['admin_access.mode' => 'report']);
        $this->postJson($this->api('partner/scan'), $body)->assertForbidden();
    }
}
