<?php

namespace Tests\Feature\AdminAccess;

use App\Models\EmailVerificationCode;
use App\Http\Middleware\AdminAccess;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use App\Services\PlanLimitGuard;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class OwnerInvariantTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
        Mail::fake();
        Http::preventStrayRequests();
        config(['admin_access.mode' => 'enforce']);
        if (!Schema::hasColumn('staff', 'planner_skills')) {
            Schema::table('staff', fn ($t) => $t->text('planner_skills')->nullable());
        }
        if (!Schema::hasTable('email_verification_codes')) {
            Schema::create('email_verification_codes', function ($t) {
                $t->id(); $t->unsignedBigInteger('user_id')->nullable(); $t->string('purpose', 16)->nullable();
                $t->string('email'); $t->string('code', 6); $t->timestamp('expires_at');
                $t->timestamp('verified_at')->nullable(); $t->timestamps();
            });
        }
    }

    public function test_reinvite_preserves_owner_role_capabilities_and_binds_claim_to_identity(): void
    {
        $owner = $this->staffUser($this->org, ['role' => 'super_admin', 'can_manage_offers' => true]);
        $this->actingAs($this->staff, 'sanctum')->postJson('/api/v1/admin/team/invite', [
            'email' => $owner->email, 'name' => 'Existing owner', 'role' => 'manager', 'can_manage_offers' => false,
        ])->assertOk();
        $this->assertDatabaseHas('staff', ['user_id' => $owner->id, 'role' => 'super_admin', 'is_active' => true, 'can_manage_offers' => true]);
        $this->assertDatabaseHas('email_verification_codes', ['user_id' => $owner->id, 'purpose' => 'claim', 'email' => $owner->email]);
    }

    public function test_reinvite_does_not_reactivate_inactive_colleague(): void
    {
        $colleague = $this->staffUser($this->org, ['role' => 'staff', 'is_active' => false]);
        $this->actingAs($this->staff, 'sanctum')->postJson('/api/v1/admin/team/invite', [
            'email' => $colleague->email, 'name' => 'Inactive colleague', 'role' => 'manager',
        ])->assertOk();
        $this->assertDatabaseHas('staff', ['user_id' => $colleague->id, 'role' => 'staff', 'is_active' => false]);
    }

    public function test_manager_cannot_demote_or_deactivate_owner(): void
    {
        $owner = $this->staffUser($this->org, ['role' => 'super_admin']);
        $id = DB::table('staff')->where('user_id', $owner->id)->value('id');
        $this->actingAs($this->staff, 'sanctum')->putJson('/api/v1/admin/team/'.$id, ['role' => 'manager'])->assertForbidden();
        $this->patchJson('/api/v1/admin/team/'.$id.'/deactivate')->assertForbidden();
        $this->patchJson('/api/v1/admin/team/'.$id.'/reactivate')->assertForbidden();
        $this->assertDatabaseHas('staff', ['id' => $id, 'role' => 'super_admin', 'is_active' => true]);
    }

    public function test_last_owner_cannot_demote_self_but_another_owner_can_manage_them(): void
    {
        DB::table('staff')->where('user_id', $this->staff->id)->update(['role' => 'super_admin']);
        $id = DB::table('staff')->where('user_id', $this->staff->id)->value('id');
        $this->actingAs($this->staff, 'sanctum')->putJson('/api/v1/admin/team/'.$id, ['role' => 'manager'])->assertUnprocessable();
        $this->staffUser($this->org, ['role' => 'super_admin']);
        $this->putJson('/api/v1/admin/team/'.$id, ['role' => 'manager'])->assertOk();
        $this->assertDatabaseHas('staff', ['id' => $id, 'role' => 'manager']);
    }

    public function test_only_explicit_report_mode_disables_enforcement(): void
    {
        foreach (['enforce', '', 'typo', null] as $mode) {
            config(['admin_access.mode' => $mode]);
            $this->assertTrue(AdminAccess::enforcing());
        }
        config(['admin_access.mode' => 'report']);
        $this->assertFalse(AdminAccess::enforcing());
    }

    public function test_only_active_colleagues_consume_seats_and_an_invite_can_use_the_last_seat(): void
    {
        $this->org->update(['plan_features' => ['max_team_members' => '2']]);
        foreach (range(1, 3) as $unused) $this->staffUser($this->org, ['is_active' => false]);
        $this->assertSame(['count' => 1, 'limit' => 2], app(PlanLimitGuard::class)->usage(PlanLimitGuard::KEY_TEAM));
        $this->actingAs($this->staff, 'sanctum')->postJson('/api/v1/admin/team/invite', [
            'email' => 'last-seat@example.test', 'name' => 'Last seat', 'role' => 'staff',
        ])->assertOk();
        $this->assertSame(['count' => 2, 'limit' => 2], app(PlanLimitGuard::class)->usage(PlanLimitGuard::KEY_TEAM));
        $this->postJson('/api/v1/admin/team/invite', [
            'email' => 'over-cap@example.test', 'name' => 'Over cap', 'role' => 'staff',
        ])->assertStatus(402)->assertJsonPath('reason', 'plan_limit');
        $this->assertDatabaseMissing('users', ['email' => 'over-cap@example.test']);
    }

    public function test_expired_module_customers_can_still_manage_their_account_team(): void
    {
        $this->org->update(['subscription_status' => 'EXPIRED', 'entitled_products' => ['content'], 'plan_slug' => 'content']);
        $this->actingAs($this->staff, 'sanctum')->getJson('/api/v1/admin/team')->assertOk();
    }

    public function test_reactivation_requires_a_free_seat_but_inactive_edits_and_reinvites_do_not(): void
    {
        $this->org->update(['plan_features' => ['max_team_members' => '1']]);
        $inactive = $this->staffUser($this->org, ['role' => 'staff', 'is_active' => false]);
        $id = $inactive->staff->id;
        $this->actingAs($this->staff, 'sanctum')->patchJson('/api/v1/admin/team/'.$id.'/reactivate')
            ->assertStatus(402)->assertJsonPath('reason', 'plan_limit');
        $this->putJson('/api/v1/admin/team/'.$id, ['department' => 'Editorial'])->assertOk();
        $this->postJson('/api/v1/admin/team/invite', [
            'email' => $inactive->email, 'name' => 'Inactive', 'role' => 'manager',
        ])->assertOk();
        $this->assertDatabaseHas('staff', ['id' => $id, 'is_active' => false, 'role' => 'staff', 'department' => 'Editorial']);
        $this->assertDatabaseMissing('audit_logs', ['action' => 'team.reactivate', 'subject_id' => $id]);
        $this->org->update(['plan_features' => ['max_team_members' => '2']]);
        $this->patchJson('/api/v1/admin/team/'.$id.'/reactivate')->assertOk();
        $this->patchJson('/api/v1/admin/team/'.$id.'/reactivate')->assertOk();
        $this->assertDatabaseHas('staff', ['id' => $id, 'is_active' => true]);
    }

    public function test_reinviting_an_active_colleague_at_capacity_preserves_their_existing_access(): void
    {
        $this->org->update(['plan_features' => ['max_team_members' => '2']]);
        $existing = $this->staffUser($this->org, ['role' => 'staff']);
        $this->actingAs($this->staff, 'sanctum')->postJson('/api/v1/admin/team/invite', [
            'email' => $existing->email, 'name' => 'Existing', 'role' => 'manager',
        ])->assertOk();
        $this->assertDatabaseHas('staff', ['id' => $existing->staff->id, 'role' => 'staff', 'is_active' => true]);
        $this->assertSame(2, app(PlanLimitGuard::class)->usage(PlanLimitGuard::KEY_TEAM)['count']);
    }
}
