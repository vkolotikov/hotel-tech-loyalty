<?php

namespace Tests\Feature\TimeWorkspace;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\Concerns\SetsUpTimeWorkspace;
use Tests\TestCase;

/** Tasks from text or a voice note, the AI's review, and the voice note's text (2026-11-09). Nothing here writes a task. */
class CaptureReviewVoiceTest extends TestCase
{
    use DatabaseTransactions, SetsUpTimeWorkspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpTimeWorkspace();
        $this->setting('planner_groups', [['name' => 'Housekeeping'], ['name' => 'Maintenance']]);
        $this->setting('planner_channels', [['key' => 'deep_clean', 'label' => 'Deep clean', 'icon' => 'sparkles', 'color' => '#10b981', 'groups' => []]]);
    }

    public function test_capture_matches_people_types_tasks_and_days_and_estimates_a_missing_length(): void
    {
        foreach (['2026-11-01', '2026-11-02', '2026-11-03'] as $i => $day) {
            $this->task(['task_date' => $day, 'task_category' => 'deep_clean', 'duration_minutes' => [80, 90, 100][$i], 'completed' => true, 'status' => 'done']);
        }
        $this->claudeAnswers('save_tasks', ['tasks' => [
            ['title' => 'Deep clean room 204', 'date' => '2026-11-05', 'start_time' => '10:00', 'priority' => 'High', 'task_group' => 'housekeeping', 'task' => 'deep clean', 'person_name' => 'Anna', 'subtasks' => ['Strip beds', 'Steam carpets']],
            ['title' => 'Boiler check', 'date' => '2026-02-30', 'duration_minutes' => 45, 'task_group' => 'Plumbing', 'person_name' => 'Somebody Else'],
            ['title' => '   '],
        ]]);
        $before = DB::table('planner_tasks')->count();

        $tasks = $this->asStaffMember()->postJson($this->timeApi('capture'), ['text' => 'Tomorrow at 10 Anna must deep clean 204, urgent. Also the boiler check, 45 min.', 'lang' => 'en'])
            ->assertOk()->json('tasks');

        $this->assertCount(2, $tasks);
        $this->assertSame(['2026-11-05', '10:00', 'High', 'Housekeeping', 'deep_clean', 'u' . $this->anna->id, (int) $this->anna->id, 'Anna Berzina'],
            [$tasks[0]['task_date'], $tasks[0]['start_time'], $tasks[0]['priority'], $tasks[0]['task_group'], $tasks[0]['task_category'], $tasks[0]['person'], $tasks[0]['assigned_to_user_id'], $tasks[0]['employee_name']]);
        $this->assertSame([90, true], [$tasks[0]['duration_minutes'], $tasks[0]['estimated']], 'the median of three finished deep cleans');
        $this->assertSame(['Strip beds', 'Steam carpets'], $tasks[0]['subtasks']);
        $this->assertSame([null, null, 45, null, 'Somebody Else'], [$tasks[1]['task_date'], $tasks[1]['task_group'], $tasks[1]['duration_minutes'], $tasks[1]['person'], $tasks[1]['person_named']]);
        $this->assertSame($before, DB::table('planner_tasks')->count(), 'a capture writes nothing');
        $this->assertSame('time_capture', DB::table('ai_usage_logs')->where('organization_id', $this->org->id)->value('feature'));
        Http::assertSent(fn ($request) => str_contains($request->body(), 'Anna Berzina') && str_contains($request->body(), '2026-11-04'));
    }

    public function test_capture_and_review_refuse_in_our_words(): void
    {
        Http::fake();
        DB::table('ai_usage_logs')->insert(['organization_id' => $this->org->id, 'model' => 'claude-sonnet-test', 'feature' => 'time_plan', 'cost_cents' => 1000, 'created_at' => now()]);
        $this->asStaffMember()->postJson($this->timeApi('capture'), ['text' => 'Call the bank'])->assertStatus(403)->assertJsonPath('error', 'ai_budget_used_up');
        $this->asStaffMember()->postJson($this->timeApi('review'), ['kind' => 'day', 'date' => '2026-11-04'])->assertStatus(403)->assertJsonPath('error', 'ai_budget_used_up');
        Http::assertNothingSent();

        DB::table('ai_usage_logs')->delete();
        \Illuminate\Support\Facades\Cache::flush();
        Http::fake(['api.anthropic.com/*' => Http::response('{"type":"error","error":{"type":"invalid_request_error","message":"secret provider detail"}}', 400)]);
        $response = $this->asStaffMember()->postJson($this->timeApi('capture'), ['text' => 'Call the bank'])->assertStatus(502)->assertJsonPath('error', 'ai_failed');
        $this->assertStringNotContainsString('secret provider detail', $response->getContent());

        config(['services.anthropic.api_key' => '']);
        $this->asStaffMember()->postJson($this->timeApi('capture'), ['text' => 'Call the bank'])->assertStatus(503)->assertJsonPath('error', 'ai_unavailable');
    }

    public function test_a_review_keeps_only_actions_on_this_days_tasks_and_the_teams_people(): void
    {
        $task = $this->task(['assigned_to_user_id' => $this->boris->id, 'title' => 'Inventory', 'start_time' => '13:00', 'duration_minutes' => 480]);
        $this->claudeAnswers('review_time', [
            'summary'     => 'Boris is overbooked; Sam has room.',
            'highlights'  => ['Two people have free afternoons.'],
            'suggestions' => [
                ['title' => 'Give the inventory to Sam', 'detail' => 'He has four free hours.', 'action' => ['type' => 'assign', 'task_id' => $task, 'person' => 'u' . $this->staffMember->id]],
                ['title' => 'Move a task nobody has', 'action' => ['type' => 'move_day', 'task_id' => 999999, 'date' => '2026-11-05']],
                ['title' => 'To a stranger', 'action' => ['type' => 'assign', 'task_id' => $task, 'person' => 'u424242']],
                ['title' => 'Start it earlier', 'action' => ['type' => 'set_time', 'task_id' => $task, 'start_time' => '25:00']],
            ],
        ]);

        $review = $this->asManager()->postJson($this->timeApi('review'), ['kind' => 'day', 'date' => '2026-11-04'])->assertOk()->json();

        $this->assertSame('Boris is overbooked; Sam has room.', $review['summary']);
        $this->assertSame(['type' => 'assign', 'task_id' => $task, 'person' => 'u' . $this->staffMember->id], $review['suggestions'][0]['action']);
        $this->assertNull($review['suggestions'][1]['action']);
        $this->assertNull($review['suggestions'][2]['action']);
        $this->assertNull($review['suggestions'][3]['action']);
        $this->assertSame('time_review', DB::table('ai_usage_logs')->where('organization_id', $this->org->id)->value('feature'));
    }

    public function test_a_period_review_reads_the_insights(): void
    {
        $this->task(['task_date' => '2026-11-02', 'completed' => true, 'status' => 'done', 'assigned_to_user_id' => $this->anna->id]);
        $this->claudeAnswers('review_time', ['summary' => 'A steady week.']);

        $this->asManager()->postJson($this->timeApi('review'), ['kind' => 'period', 'from' => '2026-11-01', 'to' => '2026-11-04'])->assertOk()->assertJsonPath('summary', 'A steady week.');
        Http::assertSent(fn ($request) => str_contains($request->body(), 'completion_pct'));
    }

    /** A tenth of a second of silence as a real WAV file, so the upload's type is sniffed as audio. */
    private function recording(string $name = 'note.wav'): UploadedFile
    {
        $samples = str_repeat("\0\0", 1600);
        $wav = 'RIFF' . pack('V', 36 + strlen($samples)) . 'WAVEfmt ' . pack('VvvVVvv', 16, 1, 1, 16000, 32000, 2, 16)
            . 'data' . pack('V', strlen($samples)) . $samples;

        return UploadedFile::fake()->createWithContent($name, $wav);
    }

    public function test_a_voice_note_becomes_text_and_without_a_key_the_workspace_says_so(): void
    {
        $audio = $this->recording();
        config(['openai.api_key' => '']);
        putenv('OPENAI_API_KEY');
        $this->asStaffMember()->post($this->timeApi('transcribe'), ['audio' => $audio], ['Accept' => 'application/json'])
            ->assertStatus(503)->assertJsonPath('error', 'transcription_unavailable');

        config(['openai.api_key' => 'test-openai-not-real']);
        Http::fake(['api.openai.com/v1/audio/transcriptions' => Http::response(['text' => ' Call the bank tomorrow at ten. ', 'language' => 'en'], 200)]);
        $this->asStaffMember()->post($this->timeApi('transcribe'), ['audio' => $this->recording(), 'language' => 'en-GB'], ['Accept' => 'application/json'])
            ->assertOk()->assertJsonPath('text', 'Call the bank tomorrow at ten.');
        Http::assertSent(fn ($request) => str_contains($request->url(), 'audio/transcriptions'));

        // The inbox's dictation answers as before through the same rule.
        $this->asStaffMember()->post(rtrim((string) config('app.url'), '/') . '/api/v1/admin/chat-inbox/transcribe', ['audio' => $this->recording('reply.wav')], ['Accept' => 'application/json'])
            ->assertOk()->assertJsonPath('text', 'Call the bank tomorrow at ten.');
    }
}
