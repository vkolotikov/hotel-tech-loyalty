<?php

namespace Tests\Feature\TimeWorkspace;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpTimeWorkspace;
use Tests\TestCase;

/** The backlog as the workspace reads it (2026-11-09): the full admin's own choice of rows, in the workspace's shape. */
class BacklogTest extends TestCase
{
    use DatabaseTransactions, SetsUpTimeWorkspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpTimeWorkspace();
    }

    public function test_mine_and_the_pool_follow_the_full_admins_rules_including_skills(): void
    {
        $mine = $this->task(['task_date' => null, 'assigned_to_user_id' => $this->anna->id, 'title' => 'In Anna’s bucket', 'duration_minutes' => 45]);
        $housekeeping = $this->task(['task_date' => null, 'title' => 'Pool: housekeeping', 'task_group' => 'Housekeeping']);
        $front = $this->task(['task_date' => null, 'title' => 'Pool: front office', 'task_group' => 'Front Office']);
        DB::table('planner_subtasks')->insert(['organization_id' => $this->org->id, 'task_id' => $mine, 'title' => 'Step', 'is_done' => true, 'created_at' => now()]);

        $own = $this->actingAs($this->anna, 'sanctum')->getJson($this->timeApi('backlog?scope=mine'))->assertOk()->json('tasks');
        $this->assertSame([$mine], array_column($own, 'id'));
        $this->assertSame([45, 'u' . $this->anna->id, 1, 1], [$own[0]['minutes'], $own[0]['owner'], $own[0]['subtasks_done'], $own[0]['subtasks_total']]);

        $pool = $this->actingAs($this->anna, 'sanctum')->getJson($this->timeApi('backlog?scope=pool'))->assertOk()->json('tasks');
        $this->assertSame([$housekeeping], array_column($pool, 'id'), 'Anna may take Housekeeping only');
        $this->assertEqualsCanonicalizing([$housekeeping, $front], array_column($this->asManager()->getJson($this->timeApi('backlog?scope=pool'))->json('tasks'), 'id'));
    }

    public function test_the_teams_buckets_are_a_managers(): void
    {
        $this->task(['task_date' => null, 'assigned_to_user_id' => $this->boris->id, 'title' => 'Boris later']);

        $this->asStaffMember()->getJson($this->timeApi('backlog?scope=team'))->assertStatus(403);
        $team = $this->asManager()->getJson($this->timeApi('backlog?scope=team'))->assertOk()->json();
        $boris = collect($team['buckets'])->firstWhere('key', 'u' . $this->boris->id);
        $this->assertSame(['Boris later'], array_column($boris['tasks'], 'title'));
    }
}
