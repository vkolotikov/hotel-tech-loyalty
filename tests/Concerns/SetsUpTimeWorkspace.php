<?php

namespace Tests\Concerns;

use App\Models\User;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Everything a HexaTech Time Planner test needs (2026-11-09), on top of the CRM workspace's set-up (Harbour Clinic in
 * Europe/Riga, a manager and a staff member, the clock fixed at Wednesday 4 November 2026, 10:00 UTC = 12:00 at the
 * venue): the planner's tables as the migrations build them, the staff planner columns, `crm_settings`, the plan's
 * `time_management`, and two more people — Anna (staff, Housekeeping only) and Boris (staff, any type).
 *
 * Tasks are written with DB::table and plain `Y-m-d` days, as PostgreSQL holds them.
 */
trait SetsUpTimeWorkspace
{
    use SetsUpCrmWorkspace;

    protected User $anna;
    protected User $boris;

    protected function setUpTimeWorkspace(): void
    {
        $this->setUpCrmWorkspace();
        $this->buildTimeTables();

        $this->org->forceFill(['plan_features' => ['time_management' => 'true', 'ai_monthly_cost_cents' => '1000']])->save();
        DB::table('users')->where('id', $this->manager->id)->update(['name' => 'Maria Manager']);
        DB::table('users')->where('id', $this->staffMember->id)->update(['name' => 'Sam Staff']);
        $this->manager->refresh();
        $this->staffMember->refresh();
        $this->anna = $this->person('Anna Berzina', ['planner_skills' => json_encode(['Housekeeping'])]);
        $this->boris = $this->person('Boris Ozols');
        config(['services.anthropic.api_key' => 'test-key-not-real', 'services.anthropic.model' => 'claude-sonnet-test']);
    }

    /** Another active staff member of the organisation. */
    protected function person(string $name, array $staff = []): User
    {
        $user = $this->staffUser($this->org, ['role' => 'staff'] + $staff);
        DB::table('users')->where('id', $user->id)->update(['name' => $name]);

        return $user->refresh();
    }

    /** On the admin host, as an absolute address. */
    protected function timeApi(string $path): string
    {
        return rtrim((string) config('app.url'), '/') . '/api/v1/admin/time/' . ltrim($path, '/');
    }

    /** A planner task of this organisation. */
    protected function task(array $attributes = []): int
    {
        return DB::table('planner_tasks')->insertGetId($attributes + [
            'organization_id' => $this->org->id,
            'title'           => 'Task ' . uniqid(),
            'task_date'       => '2026-11-04',
            'status'          => 'todo',
            'priority'        => 'Normal',
            'completed'       => false,
            'created_at'      => now()->subDay(),
            'updated_at'      => now()->subDay(),
        ]);
    }

    protected function setting(string $key, mixed $value): void
    {
        DB::table('crm_settings')->updateOrInsert(
            ['organization_id' => $this->org->id, 'key' => $key],
            ['value' => json_encode($value), 'created_at' => now(), 'updated_at' => now()],
        );
    }

    /** A Claude reply that calls `$tool` with `$input`. */
    protected function claudeAnswers(string $tool, array $input): void
    {
        \Illuminate\Support\Facades\Http::fake([
            'api.anthropic.com/*' => \Illuminate\Support\Facades\Http::response([
                'id' => 'msg_test', 'type' => 'message', 'role' => 'assistant', 'model' => 'claude-sonnet-test',
                'content' => [['type' => 'tool_use', 'id' => 'toolu_test', 'name' => $tool, 'input' => $input]],
                'stop_reason' => 'tool_use',
                'usage' => ['input_tokens' => 900, 'output_tokens' => 200],
            ], 200),
        ]);
    }

    protected function buildTimeTables(): void
    {
        foreach ([
            'planner_skills'  => fn (Blueprint $t) => $t->text('planner_skills')->nullable(),
            'planner_profile' => fn (Blueprint $t) => $t->text('planner_profile')->nullable(),
            'last_login_at'   => fn (Blueprint $t) => $t->timestamp('last_login_at')->nullable(),
        ] as $column => $add) {
            if (!Schema::hasColumn('staff', $column)) {
                Schema::table('staff', $add);
            }
        }
        if (!Schema::hasColumn('users', 'avatar_url')) {
            Schema::table('users', fn (Blueprint $t) => $t->string('avatar_url')->nullable());
        }
        if (!Schema::hasTable('planner_tasks')) {
            Schema::create('planner_tasks', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->string('employee_name', 150)->nullable();
                $t->unsignedBigInteger('assigned_to_user_id')->nullable();
                $t->string('title', 200);
                $t->date('task_date')->nullable();
                $t->string('start_time', 8)->nullable();
                $t->string('end_time', 8)->nullable();
                $t->string('status', 20)->default('Pending');
                $t->string('priority', 10)->default('Medium');
                $t->string('task_group', 80)->nullable();
                $t->string('task_category', 120)->nullable();
                $t->integer('duration_minutes')->nullable();
                $t->boolean('completed')->default(false);
                $t->text('description')->nullable();
                $t->string('recurring', 16)->nullable();
                $t->date('recurring_until')->nullable();
                $t->unsignedBigInteger('recurring_parent_id')->nullable();
                $t->string('pool_horizon', 16)->nullable();
                $t->date('pool_due_date')->nullable();
                $t->timestamp('completed_at')->nullable();
                $t->timestamp('started_at')->nullable();
                $t->unsignedInteger('actual_minutes')->nullable();
                $t->timestamps();
            });
        }
        if (!Schema::hasTable('planner_subtasks')) {
            Schema::create('planner_subtasks', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('task_id');
                $t->string('title', 200);
                $t->boolean('is_done')->default(false);
                $t->timestamp('created_at')->nullable();
            });
        }
        if (!Schema::hasTable('planner_day_notes')) {
            Schema::create('planner_day_notes', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->date('note_date');
                $t->text('note_text')->nullable();
                $t->timestamps();
            });
        }
        if (!Schema::hasTable('crm_settings')) {
            Schema::create('crm_settings', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->string('key', 100);
                $t->text('value')->nullable();
                $t->timestamps();
            });
        }
    }
}
