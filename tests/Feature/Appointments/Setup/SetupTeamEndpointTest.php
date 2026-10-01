<?php

namespace Tests\Feature\Appointments\Setup;

use App\Models\ServiceMaster;
use App\Models\ServiceMasterTimeOff;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class SetupTeamEndpointTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    private function week(array $days): array
    {
        return array_map(fn ($d) => ['day_of_week' => $d, 'start_time' => '09:00', 'end_time' => '17:00'], $days);
    }

    public function test_a_manager_adds_a_team_member_linked_to_a_sign_in(): void
    {
        $user = $this->staffUser($this->org, ['role' => 'staff']);

        $this->asStaff()->postJson($this->api('setup/team'), [
            'name' => 'Ilze Ozola', 'user_id' => $user->id, 'services' => [['id' => $this->service->id]],
        ])->assertCreated()->assertJsonPath('team_member.user_id', $user->id)->assertJsonPath('team_member.services.0.id', $this->service->id);

        // One team member per sign-in.
        $this->asStaff()->postJson($this->api('setup/team'), ['name' => 'Again', 'user_id' => $user->id])
            ->assertStatus(422)->assertJsonValidationErrors('user_id');
    }

    public function test_a_sign_in_from_another_organisation_cannot_be_linked(): void
    {
        $outsider = $this->staffUser($this->otherOrganization(), ['role' => 'staff']);

        $this->asStaff()->postJson($this->api('setup/team'), ['name' => 'Outsider', 'user_id' => $outsider->id])
            ->assertStatus(422)->assertJsonValidationErrors('user_id');
    }

    public function test_staff_cannot_add_or_change_team_members_or_hours(): void
    {
        $staff = $this->actingAs($this->staffUser($this->org, ['role' => 'staff']), 'sanctum');

        $staff->postJson($this->api('setup/team'), ['name' => 'X'])->assertStatus(403);
        $staff->patchJson($this->api("setup/team/{$this->master->id}"), ['name' => 'X'])->assertStatus(403);
        $staff->putJson($this->api("setup/team/{$this->master->id}/hours"), ['week' => []])->assertStatus(403);
    }

    public function test_deactivating_or_taking_a_service_away_previews_the_appointments(): void
    {
        $this->seedBooking();

        $this->asStaff()->patchJson($this->api("setup/team/{$this->master->id}") . '?dry_run=1', ['is_active' => false])
            ->assertOk()->assertJsonPath('dry_run', true)->assertJsonPath('total', 1);
        $this->asStaff()->patchJson($this->api("setup/team/{$this->master->id}") . '?dry_run=1', ['services' => []])
            ->assertOk()->assertJsonPath('total', 1);
        $this->assertTrue((bool) ServiceMaster::find($this->master->id)->is_active);

        $this->asStaff()->patchJson($this->api("setup/team/{$this->master->id}"), ['is_active' => false])
            ->assertOk()->assertJsonPath('team_member.is_active', false)->assertJsonPath('total', 1);
    }

    public function test_hours_are_validated_previewed_and_replaced(): void
    {
        $this->seedBooking(); // Tuesday 10:00

        $this->asStaff()->putJson($this->api("setup/team/{$this->master->id}/hours"), ['week' => [['day_of_week' => 2, 'start_time' => '17:00', 'end_time' => '09:00']]])
            ->assertStatus(422)->assertJsonValidationErrors('week.0');
        $this->asStaff()->putJson($this->api("setup/team/{$this->master->id}/hours") . '?dry_run=1', ['week' => [['day_of_week' => 2, 'start_time' => '17:00', 'end_time' => '09:00']]])
            ->assertStatus(422);

        $this->asStaff()->putJson($this->api("setup/team/{$this->master->id}/hours") . '?dry_run=1', ['week' => $this->week([1, 3, 4, 5])])
            ->assertOk()->assertJsonPath('total', 1);
        $this->assertSame(7, DB::table('service_master_schedules')->where('service_master_id', $this->master->id)->count());

        $this->asStaff()->putJson($this->api("setup/team/{$this->master->id}/hours"), ['week' => $this->week([1, 3, 4, 5])])
            ->assertOk()->assertJsonCount(4, 'team_member.week')->assertJsonPath('total', 1);
    }

    public function test_staff_manage_their_own_time_off_and_nobody_elses(): void
    {
        $user = $this->staffUser($this->org, ['role' => 'staff']);
        $this->master->forceFill(['user_id' => $user->id])->save();
        $someoneElse = ServiceMaster::create(['name' => 'Ilze Ozola', 'is_active' => true]);
        $this->seedBooking();
        $staff = $this->actingAs($user, 'sanctum');

        $staff->postJson($this->api("setup/team/{$this->master->id}/time-off") . '?dry_run=1', ['from' => '2026-10-06'])
            ->assertOk()->assertJsonPath('total', 1);
        $this->assertSame(0, ServiceMasterTimeOff::count());

        $staff->postJson($this->api("setup/team/{$this->master->id}/time-off"), ['from' => '2026-10-06', 'to' => '2026-10-07', 'reason' => 'Holiday'])
            ->assertCreated()->assertJsonCount(2, 'team_member.time_off');
        $staff->postJson($this->api("setup/team/{$someoneElse->id}/time-off"), ['from' => '2026-10-06'])->assertStatus(403);

        $entry = ServiceMasterTimeOff::where('service_master_id', $this->master->id)->first();
        $staff->deleteJson($this->api("setup/team/{$this->master->id}/time-off/{$entry->id}"))->assertOk()->assertJsonCount(1, 'team_member.time_off');
        $staff->deleteJson($this->api("setup/team/{$this->master->id}/time-off/{$entry->id}"))->assertStatus(404);

        // A manager may do it for anyone.
        $this->asStaff()->postJson($this->api("setup/team/{$someoneElse->id}/time-off"), ['from' => '2026-10-08', 'start_time' => '12:00', 'end_time' => '13:00'])
            ->assertCreated()->assertJsonPath('team_member.time_off.0.start_time', '12:00');
    }
}
