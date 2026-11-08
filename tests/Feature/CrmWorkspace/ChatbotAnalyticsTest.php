<?php

namespace Tests\Feature\CrmWorkspace;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpCrmWorkspace;
use Tests\TestCase;

/**
 * Chatbot analytics (`chatbot/analytics`, 2026-11-08): days, hours and weekdays are the venue's, not UTC's. The
 * endpoint is PostgreSQL SQL (production's database), so this runs there only (`scripts/test-pg.sh`); on the tests'
 * SQLite it is skipped. The clock: Wednesday 4 November 2026, 10:00 UTC, 12:00 in Riga (UTC+2).
 */
class ChatbotAnalyticsTest extends TestCase
{
    use DatabaseTransactions, SetsUpCrmWorkspace;

    protected function setUp(): void
    {
        parent::setUp();
        if (DB::connection()->getDriverName() !== 'pgsql') {
            $this->markTestSkipped('Chatbot analytics is PostgreSQL SQL; run with scripts/test-pg.sh.');
        }
        $this->setUpCrmWorkspace();
    }

    public function test_days_hours_and_weekdays_are_the_venues(): void
    {
        // Tuesday 3 November, 22:30 UTC = Wednesday 4 November, 00:30 in Riga.
        $late = now()->setDate(2026, 11, 3)->setTime(22, 30);
        $chat = DB::table('chat_conversations')->insertGetId(['organization_id' => $this->org->id, 'brand_id' => $this->brandId, 'status' => 'active', 'messages_count' => 1, 'created_at' => $late, 'updated_at' => $late, 'last_message_at' => $late]);
        DB::table('chat_messages')->insert(['organization_id' => $this->org->id, 'conversation_id' => $chat, 'sender_type' => 'visitor', 'content' => 'Are you open tonight?', 'created_at' => $late]);

        $data = $this->asManager()->getJson($this->adminApi('chatbot/analytics?days=7'))->assertOk()->json();

        $trend = collect($data['trend'])->keyBy('date');
        $this->assertSame('2026-11-04', $data['trend'][6]['date'], 'the last day of the window is the venue\'s today');
        $this->assertSame(1, $trend['2026-11-04']['count'], 'the chat began on Wednesday at the venue');
        $this->assertSame(0, $trend['2026-11-03']['count']);

        $hours = collect($data['hourly_distribution'])->keyBy('hour');
        $this->assertSame([1, 0], [$hours[0]['replies'], $hours[22]['replies']], 'written at 00:30 on the venue\'s clock');

        $weekdays = collect($data['weekday_distribution'])->keyBy('label');
        $this->assertSame([1, 0], [$weekdays['Wed']['replies'], $weekdays['Tue']['replies']]);
        $this->assertSame(1, $data['overview']['total_conversations']);
    }
}
