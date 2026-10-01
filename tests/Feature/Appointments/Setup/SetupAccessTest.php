<?php

namespace Tests\Feature\Appointments\Setup;

use App\Models\ServiceMaster;
use App\Services\Appointments\AppointmentRefused;
use App\Services\Appointments\Setup\SetupAccess;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class SetupAccessTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    public function test_owners_and_managers_manage_and_everyone_else_does_not(): void
    {
        $this->assertTrue(SetupAccess::canManage($this->staff)); // the fixture's caller is a manager
        $this->assertTrue(SetupAccess::canManage($this->staffUser($this->org, ['role' => 'super_admin'])));
        $this->assertFalse(SetupAccess::canManage($this->staffUser($this->org, ['role' => 'staff'])));
        $this->assertFalse(SetupAccess::canManage($this->staffUser($this->org, ['role' => 'receptionist'])));
    }

    public function test_a_manager_of_another_organisation_is_not_a_manager_here(): void
    {
        $user = $this->staffUser($this->org, ['role' => 'staff']);
        $other = $this->otherOrganization();
        DB::table('staff')->insert(['organization_id' => $other->id, 'user_id' => $user->id, 'role' => 'manager', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);

        $this->assertFalse(SetupAccess::canManage($user));
    }

    public function test_the_own_team_member_is_the_one_linked_to_the_sign_in(): void
    {
        $user = $this->staffUser($this->org, ['role' => 'staff']);
        $this->assertNull(SetupAccess::ownTeamMemberId($user));

        $this->master->forceFill(['user_id' => $user->id])->save();
        $this->assertSame($this->master->id, SetupAccess::ownTeamMemberId($user));

        SetupAccess::requireTimeOffRight($user, $this->master); // allowed: no exception
        $this->addToAssertionCount(1);
    }

    public function test_a_deactivated_staff_row_gives_no_setup_rights(): void
    {
        $manager = $this->staffUser($this->org, ['role' => 'manager', 'is_active' => false]);
        $this->assertFalse(SetupAccess::canManage($manager));

        $staff = $this->staffUser($this->org, ['role' => 'staff', 'is_active' => false]);
        $this->master->forceFill(['user_id' => $staff->id])->save();
        $this->expectException(AppointmentRefused::class);
        SetupAccess::requireTimeOffRight($staff, $this->master);
    }

    public function test_staff_may_not_touch_someone_elses_time_off_or_manage(): void
    {
        $user = $this->staffUser($this->org, ['role' => 'staff']);
        $someoneElse = ServiceMaster::create(['name' => 'Ilze Ozola', 'is_active' => true]);

        try {
            SetupAccess::requireTimeOffRight($user, $someoneElse);
            $this->fail('time off on someone else was allowed');
        } catch (AppointmentRefused $e) {
            $this->assertSame('not_allowed', $e->errorCode);
            $this->assertSame(403, $e->status);
        }

        $this->expectException(AppointmentRefused::class);
        SetupAccess::requireManager($user);
    }
}
