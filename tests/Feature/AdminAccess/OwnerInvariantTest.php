<?php

namespace Tests\Feature\AdminAccess;

use App\Models\EmailVerificationCode;
use App\Http\Middleware\AdminAccess;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
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
}
