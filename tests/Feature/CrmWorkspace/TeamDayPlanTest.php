<?php

namespace Tests\Feature\CrmWorkspace;

use App\Models\Brand;
use App\Models\Organization;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpTimeWorkspace;
use Tests\TestCase;

class TeamDayPlanTest extends TestCase
{
    use DatabaseTransactions, SetsUpTimeWorkspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpTimeWorkspace();
        if (!Schema::hasColumn('tasks', 'priority')) Schema::table('tasks', fn ($t) => $t->string('priority')->nullable());
    }

    private function crmTask(string $title, array $details = []): void
    {
        DB::table('tasks')->insert($details + ['organization_id' => $this->org->id, 'title' => $title, 'type' => 'custom',
            'due_at' => '2026-11-04 09:00:00', 'assigned_to' => $this->anna->id, 'description' => 'private detail']);
    }

    private function plan(string $query = ''): array
    {
        return $this->asStaffMember()->getJson($this->crmApi('team-day-plan'.$query))->assertOk()->json();
    }

    public function test_shared_plan_uses_venue_days_and_combines_dated_work_under_the_real_person_once(): void
    {
        $this->task(['title' => 'Artwork proof', 'employee_name' => 'anna berzina', 'status' => 'in_progress', 'start_time' => '09:15']);
        $this->task(['title' => 'Approval', 'assigned_to_user_id' => $this->anna->id, 'priority' => 'High', 'status' => 'blocked']);
        $this->task(['title' => 'Sent', 'completed' => true]);
        $this->task(['title' => 'Tomorrow', 'task_date' => '2026-11-05']);
        $this->crmTask('Local midnight', ['due_at' => '2026-11-03 22:00:00']);
        $this->crmTask('Outside', ['due_at' => '2026-11-04 22:00:00']);
        $plan = $this->plan('?brand_id=all');
        $this->assertSame([true, '2026-11-04', 4, 1], [$plan['planner'], $plan['date'], $plan['total'], $plan['done']]);
        $people = array_column($plan['people'], null, 'key');
        $this->assertSame([], $people['u'.$this->boris->id]['tasks']);
        $this->assertSame(1, $people['unassigned']['done']);
        $tasks = $people['u'.$this->anna->id]['tasks'];
        $this->assertSame(['Artwork proof', 'Approval', 'Local midnight'], array_column($tasks, 'title'));
        $this->assertSame(['09:15', null, null], array_column($tasks, 'time'));
        $this->assertSame(['in_progress', 'blocked', 'todo'], array_column($tasks, 'status'));
        $this->assertSame(['Approval', 'Artwork proof', 'Local midnight'], array_column($plan['top_tasks'], 'title'));
        $this->assertStringNotContainsString('private detail', json_encode($plan));
        $this->assertSame(2, $this->plan('?date=2026-11-05&brand_id=all')['total']);
        $this->getJson($this->crmApi('team-day-plan?date=2026-02-30'))->assertUnprocessable();
    }

    public function test_existing_planner_writes_appear_on_the_board_and_own_day_permissions_apply(): void
    {
        $this->setting('planner_planning_mode', 'own');
        $this->task(['title' => 'Another person', 'assigned_to_user_id' => $this->anna->id]);
        $body = ['title' => 'Prepare samples', 'task_date' => '2026-11-04', 'start_time' => '14:30'];
        $this->asStaffMember()->postJson($this->adminApi('planner/tasks'), $body + ['assigned_to_user_id' => $this->anna->id])->assertForbidden();
        $id = $this->postJson($this->adminApi('planner/tasks'), $body + ['assigned_to_user_id' => $this->staffMember->id])->assertCreated()->json('id');
        $people = array_column($this->plan()['people'], null, 'key');
        $this->assertFalse($people['u'.$this->anna->id]['assignable']);
        $this->assertFalse($people['u'.$this->anna->id]['tasks'][0]['editable']);
        $this->assertTrue($people['u'.$this->staffMember->id]['tasks'][0]['editable']);
        $this->patchJson($this->adminApi("planner/tasks/$id/status"), ['status' => 'done'])->assertOk();
        $this->assertSame(1, $this->plan()['done']);
    }

    public function test_crm_only_plan_includes_visible_legacy_lead_tasks_and_separates_brands_and_tenants(): void
    {
        $this->org->forceFill(['plan_features' => ['crm' => 'true']])->save();
        $north = Brand::create(['organization_id' => $this->org->id, 'name' => 'North', 'slug' => 'north', 'widget_token' => str()->random(32)]);
        $tenant = Organization::create(['name' => 'Elsewhere', 'slug' => 'elsewhere-'.uniqid()]);
        $lead = $this->lead();
        $hidden = $this->lead(['brand_id' => $north->id]);
        $this->crmTask('Legacy visible', ['inquiry_id' => $lead]);
        $this->crmTask('Legacy other brand', ['inquiry_id' => $hidden]);
        $this->crmTask('New visible', ['brand_id' => $this->brandId]);
        $this->crmTask('Other tenant', ['organization_id' => $tenant->id]);
        $this->crmTask('Shared');
        $this->task(['title' => 'Planner only']);
        $this->staffMember->brands()->attach($this->brandId);
        $plan = $this->plan('?brand_id=all');
        $this->assertFalse($plan['planner']);
        $this->assertSame(2, $plan['total']);
        $this->assertEqualsCanonicalizing(['New visible', 'Legacy visible'], array_column($plan['top_tasks'], 'title'));
    }
}
