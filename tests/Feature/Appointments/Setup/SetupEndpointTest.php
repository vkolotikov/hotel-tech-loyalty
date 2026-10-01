<?php

namespace Tests\Feature\Appointments\Setup;

use App\Models\ServiceMasterTimeOff;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class SetupEndpointTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    public function test_a_manager_reads_the_whole_setup(): void
    {
        ServiceMasterTimeOff::create(['service_master_id' => $this->master->id, 'date' => '2026-10-04']); // yesterday
        ServiceMasterTimeOff::create(['service_master_id' => $this->master->id, 'date' => '2026-10-09', 'start_time' => '12:00:00', 'end_time' => '14:00:00', 'reason' => 'Dentist']);

        $json = $this->asStaff()->getJson($this->api('setup'))->assertOk()->json();

        $this->assertTrue($json['can_manage']);
        $this->assertNull($json['my_team_member_id']);
        $this->assertSame([
            'id' => $this->service->id, 'name' => 'Deep Tissue Massage', 'category_id' => null, 'duration_minutes' => 45,
            'buffer_after_minutes' => 0, 'price' => 60, 'currency' => 'EUR', 'short_description' => null, 'is_active' => true,
            'performers' => [['id' => $this->master->id, 'duration_minutes' => null, 'price' => null]],
        ], $json['services'][0]);
        $member = $json['team'][0];
        $this->assertSame(['Mara Ilves', 7], [$member['name'], count($member['week'])]);
        $this->assertSame(['day_of_week' => 0, 'start_time' => '09:00', 'end_time' => '17:00', 'is_active' => true], $member['week'][0]);
        $this->assertSame([['date' => '2026-10-09', 'start_time' => '12:00', 'end_time' => '14:00', 'reason' => 'Dentist']], array_map(fn ($o) => array_diff_key($o, ['id' => 1]), $member['time_off']));
        $this->assertContains($this->staff->id, array_column($json['staff_accounts'], 'user_id'));
        $this->assertSame(15, $json['settings']['slot_step']);
        $this->assertSame('timezone', $json['checklist']['steps'][0]['key']);
    }

    public function test_staff_read_setup_without_the_accounts_and_with_their_own_team_member(): void
    {
        $user = $this->staffUser($this->org, ['role' => 'staff']);
        $this->master->forceFill(['user_id' => $user->id])->save();

        $json = $this->actingAs($user, 'sanctum')->getJson($this->api('setup'))->assertOk()->json();

        $this->assertFalse($json['can_manage']);
        $this->assertSame($this->master->id, $json['my_team_member_id']);
        $this->assertSame([], $json['staff_accounts']);
    }

    public function test_copying_the_booking_link_ticks_the_online_step(): void
    {
        $user = $this->staffUser($this->org, ['role' => 'staff']);

        $this->actingAs($user, 'sanctum')->postJson($this->api('setup/checklist/link-copied'))
            ->assertOk()
            ->assertJsonPath('checklist.steps.4.key', 'online')
            ->assertJsonPath('checklist.steps.4.done', true);
    }
}
