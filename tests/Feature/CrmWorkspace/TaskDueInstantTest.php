<?php

namespace Tests\Feature\CrmWorkspace;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpCrmWorkspace;
use Tests\TestCase;

/**
 * `admin/tasks` `due_at` (2026-11-08): a time sent with an offset is stored as the instant it names (UTC); one sent
 * without an offset keeps its digits as before. A lead's follow-up day is the venue's day of that instant, and the
 * "due today" list is the venue's day. The clock: Wednesday 4 November 2026, 12:00 in Riga (10:00 UTC).
 */
class TaskDueInstantTest extends TestCase
{
    use DatabaseTransactions, SetsUpCrmWorkspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpCrmWorkspace();
        $this->setUpCustomFieldsSchema();
        if (!Schema::hasColumn('tasks', 'custom_data')) {
            Schema::table('tasks', fn ($t) => $t->text('custom_data')->nullable());
        }
    }

    private function storedDueAt(int $id): string
    {
        return substr((string) DB::table('tasks')->where('id', $id)->value('due_at'), 0, 19);
    }

    public function test_a_time_with_an_offset_is_stored_as_its_instant_and_answered_as_one(): void
    {
        $created = $this->asStaffMember()->postJson($this->adminApi('tasks'), ['title' => 'Call Ada back', 'due_at' => '2026-11-04T15:30:00+02:00'])
            ->assertCreated()->json();
        $this->assertSame('2026-11-04 13:30:00', $this->storedDueAt($created['id']));
        $this->assertSame('2026-11-04T13:30:00.000000Z', $created['due_at']);

        $this->asStaffMember()->putJson($this->adminApi("tasks/{$created['id']}"), ['due_at' => '2026-11-05T09:00:00.000Z'])->assertOk()
            ->assertJsonPath('due_at', '2026-11-05T09:00:00.000000Z');
        $this->assertSame('2026-11-05 09:00:00', $this->storedDueAt($created['id']));

        $this->asStaffMember()->putJson($this->adminApi("tasks/{$created['id']}"), ['due_at' => '2026-11-05T08:00:00-05:00'])->assertOk();
        $this->assertSame('2026-11-05 13:00:00', $this->storedDueAt($created['id']));
    }

    public function test_a_time_without_an_offset_keeps_its_digits(): void
    {
        $id = $this->asStaffMember()->postJson($this->adminApi('tasks'), ['title' => 'Send the offer', 'due_at' => '2026-11-04T15:30'])->assertCreated()->json('id');
        $this->assertSame('2026-11-04 15:30:00', $this->storedDueAt($id));

        $this->asStaffMember()->putJson($this->adminApi("tasks/{$id}"), ['due_at' => '2026-11-06 08:15:00'])->assertOk();
        $this->assertSame('2026-11-06 08:15:00', $this->storedDueAt($id));

        $this->asStaffMember()->putJson($this->adminApi("tasks/{$id}"), ['due_at' => null])->assertOk();
        $this->assertNull(DB::table('tasks')->where('id', $id)->value('due_at'));
    }

    public function test_the_leads_follow_up_day_and_due_today_are_the_venues_day(): void
    {
        $lead = $this->lead();
        // Wednesday 22:30 UTC is already 00:30 on Thursday in Riga: the lead's follow-up day is Thursday.
        $this->asStaffMember()->postJson($this->adminApi('tasks'), ['title' => 'Early call', 'inquiry_id' => $lead, 'due_at' => '2026-11-04T22:30:00.000Z'])->assertCreated();
        $this->assertSame('2026-11-05', substr((string) DB::table('inquiries')->where('id', $lead)->value('next_task_due'), 0, 10));

        // 23:30 on Wednesday in Riga (21:30 UTC) is today's; 00:30 on Thursday (22:30 UTC, still Wednesday in UTC) is not.
        $this->asStaffMember()->postJson($this->adminApi('tasks'), ['title' => 'Late call', 'due_at' => '2026-11-04T23:30:00+02:00'])->assertCreated();
        $titles = collect($this->asStaffMember()->getJson($this->adminApi('tasks?status=due_today'))->assertOk()->json('data'))->pluck('title')->all();
        $this->assertSame(['Late call'], $titles);
    }
}
