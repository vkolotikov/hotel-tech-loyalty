<?php

namespace Tests\Feature\Planner;

use App\Http\Controllers\Api\V1\Admin\PlannerController;
use App\Models\PlannerTask;
use App\Models\Staff;
use App\Models\User;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * POST planner/tasks/{task}/release: the assignee, or a manager (staff role super_admin or manager, active, in the
 * task's organisation), sends a task back to the pool; nobody else may. Until 2026-10-31 the manager check asked
 * spatie/laravel-permission's hasRole(), but no Spatie role is ever created here, so managers were always refused.
 */
class PlannerReleaseTaskTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private int $orgId;
    private PlannerTask $task;
    private User $assignee;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpMinimalSchema();
        if (!Schema::hasTable('planner_tasks')) {
            Schema::create('planner_tasks', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id');
                $table->unsignedBigInteger('assigned_to_user_id')->nullable();
                $table->string('employee_name')->nullable();
                $table->string('title')->nullable();
                $table->date('task_date')->nullable();
                $table->string('status')->nullable();
                $table->boolean('completed')->default(false);
                $table->timestamp('completed_at')->nullable();
                $table->string('pool_horizon')->nullable();
                $table->date('pool_due_date')->nullable();
                $table->timestamps();
            });
        }
        if (!Schema::hasTable('planner_subtasks')) {
            Schema::create('planner_subtasks', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id');
                $table->unsignedBigInteger('task_id');
                $table->string('title')->nullable();
                $table->timestamps();
            });
        }
        foreach (['role' => fn ($t) => $t->string('role')->nullable(), 'is_active' => fn ($t) => $t->boolean('is_active')->default(true)] as $column => $add) {
            if (Schema::hasTable('staff') && !Schema::hasColumn('staff', $column)) {
                Schema::table('staff', $add);
            }
        }
        if (!Schema::hasTable('staff')) {
            Schema::create('staff', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id');
                $table->unsignedBigInteger('user_id')->nullable();
                $table->string('role')->nullable();
                $table->boolean('is_active')->default(true);
                $table->timestamps();
            });
        }

        $this->orgId = OrganizationFactory::new()->create()->id;
        app()->instance('current_organization_id', $this->orgId);
        $this->assignee = $this->user('assignee', 'staff');
        $this->task = PlannerTask::create(['organization_id' => $this->orgId, 'title' => 'Restock the minibar',
            'assigned_to_user_id' => $this->assignee->id, 'employee_name' => 'Assignee']);
    }

    protected function tearDown(): void
    {
        app()->forgetInstance('current_organization_id');
        parent::tearDown();
    }

    private function user(string $name, ?string $role, bool $active = true, ?int $orgId = null): User
    {
        $user = User::forceCreate(['organization_id' => $orgId ?? $this->orgId, 'name' => $name,
            'email' => $name . '-' . uniqid() . '@example.test', 'user_type' => 'staff']);
        if ($role !== null) {
            Staff::withoutGlobalScopes()->forceCreate(['organization_id' => $orgId ?? $this->orgId,
                'user_id' => $user->id, 'role' => $role, 'is_active' => $active]);
        }

        return $user;
    }

    private function release(User $as): int
    {
        $request = Request::create('/api/v1/admin/planner/tasks/' . $this->task->id . '/release', 'POST');
        $request->setUserResolver(fn () => $as);

        return app(PlannerController::class)->releaseTask($request, $this->task->id)->getStatusCode();
    }

    public function test_the_assignee_releases_their_own_task(): void
    {
        $this->assertSame(200, $this->release($this->assignee));
        $this->assertNull($this->task->fresh()->assigned_to_user_id);
        $this->assertNull($this->task->fresh()->employee_name);
    }

    public function test_a_manager_or_super_admin_releases_a_colleagues_task(): void
    {
        foreach (['manager', 'super_admin'] as $role) {
            $this->task->forceFill(['assigned_to_user_id' => $this->assignee->id])->save();
            $this->assertSame(200, $this->release($this->user($role, $role)), $role);
            $this->assertNull($this->task->fresh()->assigned_to_user_id, $role);
        }
    }

    public function test_plain_staff_an_inactive_manager_and_another_organisations_manager_are_refused(): void
    {
        $otherOrg = OrganizationFactory::new()->create()->id;
        foreach ([$this->user('colleague', 'staff'), $this->user('former', 'manager', active: false),
            $this->user('nostaff', null), $this->user('elsewhere', 'manager', orgId: $otherOrg)] as $user) {
            $this->assertSame(403, $this->release($user), $user->name);
        }
        $this->assertSame($this->assignee->id, $this->task->fresh()->assigned_to_user_id);
    }
}
