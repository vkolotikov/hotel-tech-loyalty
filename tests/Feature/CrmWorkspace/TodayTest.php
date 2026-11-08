<?php

namespace Tests\Feature\CrmWorkspace;

use App\Models\Organization;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpCrmWorkspace;
use Tests\TestCase;

/** HexaTech CRM's Today (2026-11-07): the full admin's own definitions, the venue's day, this organisation only. */
class TodayTest extends TestCase
{
    use DatabaseTransactions, SetsUpCrmWorkspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpCrmWorkspace();
    }

    public function test_chats_that_wait_for_a_person_come_first_with_the_visitors_last_words(): void
    {
        $waiting = $this->chat(['status' => 'waiting', 'visitor_name' => 'Maria'], [['visitor', 'Hello', 30], ['ai', 'Hi! How can I help?', 29], ['visitor', 'Can I move my appointment to Friday?', 5]]);
        $this->chat(['status' => 'active', 'assigned_to' => $this->manager->id], [['visitor', 'Is the car park free?', 10]]);
        $this->chat(['status' => 'resolved', 'last_message_at' => now()->subDays(2), 'updated_at' => now()->subDays(2)]);
        // A widget opened and never written in is no chat, here as in the inbox's list and stats.
        $this->chat(['status' => 'active'], [['ai', 'Welcome!', 3]]);

        $chats = $this->asStaffMember()->getJson($this->crmApi('today'))->assertOk()->json('chats');

        $this->assertSame([1, 2, 1], [$chats['waiting'], $chats['open'], $chats['unassigned']]);
        $this->assertSame($waiting, $chats['list'][0]['id']);
        $this->assertSame('Maria', $chats['list'][0]['name']);
        $this->assertSame('Can I move my appointment to Friday?', $chats['list'][0]['excerpt']);
    }

    public function test_follow_ups_are_due_by_the_venues_day_and_closed_leads_never_count(): void
    {
        // 10:00 UTC is 12:00 in Riga: the venue's day is 4 November.
        $overdue = $this->lead(['next_task_due' => '2026-11-02', 'next_task_type' => 'call', 'total_value' => 300]);
        $today = $this->lead(['next_task_due' => '2026-11-04', 'total_value' => 200.5], 'Grace Hopper');
        $this->lead(['next_task_due' => '2026-11-06']);
        $this->lead(['next_task_due' => '2026-11-01', 'status' => 'Lost']);
        $this->lead(['next_task_due' => '2026-11-01', 'next_task_completed' => true]);
        $this->lead(['created_at' => now()->subHours(3)], 'New Person');

        $body = $this->asStaffMember()->getJson($this->crmApi('today'))->assertOk()->json();

        $this->assertSame('2026-11-04', $body['today']);
        $this->assertSame([1, 1, 1], [$body['leads']['overdue'], $body['leads']['due_today'], $body['leads']['new']]);
        $this->assertSame([$overdue, $today], array_column($body['leads']['follow_ups'], 'id'));
        $this->assertTrue($body['leads']['follow_ups'][0]['overdue']);
        $this->assertFalse($body['leads']['follow_ups'][1]['overdue']);
        $this->assertSame('New Person', $body['leads']['new_list'][0]['name']);
        $this->assertSame(5, $body['pipeline']['open_count'], 'Lost is not open');
        $this->assertEquals(500.5, $body['pipeline']['open_value']);
    }

    public function test_your_tasks_are_yours_due_by_the_end_of_the_venues_day(): void
    {
        $insert = fn (array $row) => DB::table('tasks')->insertGetId($row + ['organization_id' => $this->org->id, 'title' => 'Task', 'created_at' => now(), 'updated_at' => now()]);
        $late = $insert(['assigned_to' => $this->staffMember->id, 'due_at' => now()->subDay(), 'title' => 'Send the price list']);
        // 21:30 UTC is 23:30 in Riga: still today there.
        $tonight = $insert(['assigned_to' => $this->staffMember->id, 'due_at' => '2026-11-04 21:30:00']);
        $insert(['assigned_to' => $this->staffMember->id, 'due_at' => '2026-11-04 22:30:00']);
        $insert(['assigned_to' => $this->manager->id, 'due_at' => now()]);
        $insert(['assigned_to' => $this->staffMember->id, 'due_at' => now(), 'completed_at' => now()]);

        $tasks = $this->asStaffMember()->getJson($this->crmApi('today'))->assertOk()->json('tasks');

        $this->assertSame([1, 1], [$tasks['overdue'], $tasks['due_today']]);
        $this->assertSame([$late, $tonight], array_column($tasks['list'], 'id'));
        $this->assertTrue($tasks['list'][0]['overdue']);
    }

    public function test_the_week_of_chat_and_nothing_of_another_organisation(): void
    {
        $this->chat(['status' => 'resolved', 'messages_count' => 4]);
        $this->chat(['status' => 'resolved', 'messages_count' => 3, 'assigned_to' => $this->manager->id, 'lead_captured' => true]);
        $this->chat(['status' => 'active', 'messages_count' => 0]);

        $prior = app('current_organization_id');
        app()->forgetInstance('current_organization_id');
        $other = Organization::create(['name' => 'Elsewhere', 'slug' => 'else-' . uniqid('', true)]);
        app()->instance('current_organization_id', $prior);
        DB::table('chat_conversations')->insert(['organization_id' => $other->id, 'status' => 'waiting', 'messages_count' => 2, 'created_at' => now(), 'updated_at' => now(), 'last_message_at' => now()]);
        $theirGuest = DB::table('guests')->insertGetId(['organization_id' => $other->id, 'full_name' => 'Someone Else', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('inquiries')->insert(['organization_id' => $other->id, 'guest_id' => $theirGuest, 'status' => 'New', 'next_task_due' => '2026-11-01', 'next_task_completed' => false, 'created_at' => now(), 'updated_at' => now()]);

        $body = $this->asStaffMember()->getJson($this->crmApi('today'))->assertOk()->json();

        $this->assertSame(['conversations' => 2, 'ai_resolved' => 1, 'leads_from_chat' => 1], $body['week']);
        $this->assertSame(0, $body['chats']['waiting']);
        $this->assertSame(0, $body['leads']['overdue']);
    }
}
