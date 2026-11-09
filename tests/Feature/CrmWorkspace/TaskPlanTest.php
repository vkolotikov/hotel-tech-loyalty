<?php

namespace Tests\Feature\CrmWorkspace;

use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpCrmWorkspace;
use Tests\TestCase;

/**
 * A task's plan (2026-11-09, the task form redesigned for HexaTech CRM and the full admin): its priority, its length and
 * how often it repeats are saved and answered; before, the full admin's drawer sent them inside `custom_data`, which
 * keeps only the organisation's own custom fields, so they were lost. A repeating task needs a day, and completing one
 * adds the next, on the venue's clock, once. The clock: Wednesday 4 November 2026, 12:00 in Riga (10:00 UTC).
 */
class TaskPlanTest extends TestCase
{
    use DatabaseTransactions, SetsUpCrmWorkspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpCrmWorkspace();
        $this->setUpCustomFieldsSchema();
        foreach ([
            'custom_data' => fn ($t) => $t->text('custom_data')->nullable(),
            'recurring_rule' => fn ($t) => $t->text('recurring_rule')->nullable(),
            'priority' => fn ($t) => $t->string('priority', 10)->nullable(),
            'duration_minutes' => fn ($t) => $t->unsignedSmallInteger('duration_minutes')->nullable(),
        ] as $column => $add) {
            if (!Schema::hasColumn('tasks', $column)) {
                Schema::table('tasks', $add);
            }
        }
        if (!Schema::hasTable('activities')) {
            Schema::create('activities', fn ($t) => [$t->bigIncrements('id'), $t->unsignedBigInteger('organization_id'), $t->unsignedBigInteger('brand_id')->nullable(),
                $t->unsignedBigInteger('inquiry_id')->nullable(), $t->unsignedBigInteger('guest_id')->nullable(), $t->string('type', 32), $t->string('subject')->nullable(),
                $t->text('body')->nullable(), $t->text('metadata')->nullable(), $t->unsignedBigInteger('created_by')->nullable(), $t->timestamp('occurred_at')->nullable(), $t->timestamps()]);
        }
    }

    public function test_priority_length_and_repeat_are_saved_and_answered(): void
    {
        $task = $this->asStaffMember()->postJson($this->adminApi('tasks'), [
            'type' => 'call', 'title' => 'Call Ada', 'due_at' => '2026-11-05T07:30:00.000Z',
            'priority' => 'high', 'duration_minutes' => 45, 'recurring_rule' => ['freq' => 'weekly', 'by' => 'ignored'],
        ])->assertCreated()->assertJsonPath('priority', 'high')->assertJsonPath('duration_minutes', 45)
            ->assertJsonPath('recurring_rule', ['freq' => 'weekly'])->json();

        $this->asStaffMember()->putJson($this->adminApi("tasks/{$task['id']}"), ['priority' => 'low', 'duration_minutes' => null, 'recurring_rule' => null])
            ->assertOk()->assertJsonPath('priority', 'low')->assertJsonPath('duration_minutes', null)->assertJsonPath('recurring_rule', null);

        // A change that names none of them leaves them as they are.
        $this->asStaffMember()->putJson($this->adminApi("tasks/{$task['id']}"), ['title' => 'Call Ada again'])->assertOk()->assertJsonPath('priority', 'low');
    }

    public function test_the_plans_values_are_checked(): void
    {
        foreach ([['priority' => 'urgent'], ['duration_minutes' => 2], ['duration_minutes' => 900], ['recurring_rule' => ['freq' => 'hourly']]] as $bad) {
            $this->asStaffMember()->postJson($this->adminApi('tasks'), ['title' => 'Something', 'due_at' => '2026-11-05T07:30:00Z'] + $bad)
                ->assertStatus(422);
        }
    }

    public function test_a_repeating_task_needs_a_day(): void
    {
        $this->asStaffMember()->postJson($this->adminApi('tasks'), ['title' => 'Weekly round', 'recurring_rule' => ['freq' => 'weekly']])
            ->assertStatus(422)->assertJsonValidationErrors('recurring_rule');

        $id = $this->asStaffMember()->postJson($this->adminApi('tasks'), ['title' => 'Weekly round', 'due_at' => '2026-11-05T07:30:00Z', 'recurring_rule' => ['freq' => 'weekly']])
            ->assertCreated()->json('id');
        // Taking the day away from a repeating task is refused too.
        $this->asStaffMember()->putJson($this->adminApi("tasks/{$id}"), ['due_at' => null])->assertStatus(422)->assertJsonValidationErrors('recurring_rule');
        $this->asStaffMember()->putJson($this->adminApi("tasks/{$id}"), ['due_at' => null, 'recurring_rule' => null])->assertOk();
    }

    public function test_completing_a_repeating_task_adds_the_next_one_on_the_venues_clock_once(): void
    {
        // Every week on Thursday at 09:30 in Riga (07:30 UTC), with its plan.
        $id = $this->asStaffMember()->postJson($this->adminApi('tasks'), [
            'type' => 'meeting', 'title' => 'Team round', 'description' => 'Agenda in the drive', 'due_at' => '2026-11-05T07:30:00Z',
            'priority' => 'high', 'duration_minutes' => 30, 'recurring_rule' => ['freq' => 'weekly'],
        ])->assertCreated()->json('id');

        $next = $this->asStaffMember()->postJson($this->adminApi("tasks/{$id}/complete"))->assertOk()->json('next_task');
        $this->assertNotNull($next);
        $this->assertSame(['Team round', 'Agenda in the drive', 'meeting', 'high', 30, ['freq' => 'weekly']], [$next['title'], $next['description'], $next['type'], $next['priority'], $next['duration_minutes'], $next['recurring_rule']]);
        $this->assertSame('2026-11-12 07:30:00', substr((string) DB::table('tasks')->where('id', $next['id'])->value('due_at'), 0, 19));

        // Completing it again (after a reopen) does not add a second one while the first exists.
        $this->asStaffMember()->postJson($this->adminApi("tasks/{$id}/reopen"))->assertOk();
        $this->asStaffMember()->postJson($this->adminApi("tasks/{$id}/complete"))->assertOk()->assertJsonPath('next_task', null);
        $this->assertSame(2, DB::table('tasks')->count());
    }

    public function test_an_overdue_repeating_task_moves_its_next_one_ahead_of_now_and_keeps_the_time_across_a_clock_change(): void
    {
        // Every day at 09:00 in Riga, due Friday 23 October (summer time, 06:00 UTC; the clocks went back on the 25th); done
        // on Wednesday 4 November.
        $id = $this->asStaffMember()->postJson($this->adminApi('tasks'), ['title' => 'Check the bookings', 'due_at' => '2026-10-23T06:00:00Z', 'recurring_rule' => ['freq' => 'daily']])
            ->assertCreated()->json('id');

        $next = $this->asStaffMember()->postJson($this->adminApi("tasks/{$id}/complete"))->assertOk()->json('next_task');
        // The next one is Thursday 5 November at 09:00 in Riga, winter time now: 07:00 UTC.
        $this->assertSame('2026-11-05 07:00:00', substr((string) DB::table('tasks')->where('id', $next['id'])->value('due_at'), 0, 19));
        $this->assertTrue(CarbonImmutable::parse($next['due_at'])->isFuture());
    }

    public function test_a_task_that_does_not_repeat_adds_nothing(): void
    {
        $id = $this->asStaffMember()->postJson($this->adminApi('tasks'), ['title' => 'Once', 'due_at' => '2026-11-05T07:30:00Z'])->assertCreated()->json('id');
        $this->asStaffMember()->postJson($this->adminApi("tasks/{$id}/complete"))->assertOk()->assertJsonPath('next_task', null);
        $this->assertSame(1, DB::table('tasks')->count());
    }
}
