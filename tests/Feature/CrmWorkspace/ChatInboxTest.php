<?php

namespace Tests\Feature\CrmWorkspace;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use OpenAI\Laravel\Facades\OpenAI;
use Tests\Concerns\SetsUpCrmWorkspace;
use Tests\TestCase;

/**
 * The full admin's inbox endpoints the CRM works on (2026-11-08): the stats count the chats the list shows, a
 * transcript signs each team message with its sender, a thread shows the reader's own rating of an answer, and refusals carry codes (transcription unavailable, a brief
 * the AI could not write).
 */
class ChatInboxTest extends TestCase
{
    use DatabaseTransactions, SetsUpCrmWorkspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpCrmWorkspace();
        foreach ([
            'active_agent_name' => fn ($t) => $t->string('active_agent_name')->nullable(),
            'visitor_ip' => fn ($t) => $t->string('visitor_ip')->nullable(),
            'visitor_country' => fn ($t) => $t->string('visitor_country')->nullable(),
            'visitor_city' => fn ($t) => $t->string('visitor_city')->nullable(),
            'ai_brief' => fn ($t) => $t->text('ai_brief')->nullable(),
            'ai_brief_at' => fn ($t) => $t->timestamp('ai_brief_at')->nullable(),
        ] as $column => $add) {
            if (!Schema::hasColumn('chat_conversations', $column)) {
                Schema::table('chat_conversations', $add);
            }
        }
        foreach (['attachment_url', 'attachment_type'] as $column) {
            if (!Schema::hasColumn('chat_messages', $column)) {
                Schema::table('chat_messages', fn ($t) => $t->string($column)->nullable());
            }
        }
    }

    public function test_the_stats_count_the_chats_the_list_shows(): void
    {
        $this->chat(['status' => 'active'], [['visitor', 'Hello?', 5]]);
        $this->chat(['status' => 'waiting', 'visitor_email' => 'ada@example.test'], [['ai', 'Welcome!', 5]]);
        // The widget opened on a page and nobody wrote: not a chat.
        $this->chat(['status' => 'active'], [['ai', 'Welcome!', 5]]);
        $this->chat(['status' => 'active']);

        $stats = $this->asStaffMember()->getJson($this->adminApi('chat-inbox/stats'))->assertOk()->json();
        $this->assertSame([1, 1, 2, 2, 2], [$stats['active'], $stats['waiting'], $stats['total'], $stats['active_24h'], $stats['unassigned']]);
    }

    public function test_a_thread_shows_the_readers_own_rating_of_an_answer(): void
    {
        $chat = $this->chat([], [['visitor', 'How much?', 10], ['ai', 'It costs 20 €.', 9]]);
        $answer = (int) DB::table('chat_messages')->where('conversation_id', $chat)->where('sender_type', 'ai')->value('id');
        foreach ([[$this->manager, 'good', 5], [$this->staffMember, 'bad', 3]] as [$user, $rating, $ago]) {
            DB::table('chat_message_feedback')->insert(['organization_id' => $this->org->id, 'message_id' => $answer, 'user_id' => $user->id, 'rating' => $rating, 'applied_to_training' => false, 'created_at' => now()->subMinutes($ago), 'updated_at' => now()->subMinutes($ago)]);
        }

        $rating = fn ($as) => collect($as->getJson($this->adminApi("chat-inbox/{$chat}"))->assertOk()->json('messages'))
            ->firstWhere('id', $answer)['feedback']['rating'] ?? null;
        $this->assertSame('good', $rating($this->asManager()), 'the manager sees their own rating, not the newer one');
        $this->assertSame('bad', $rating($this->asStaffMember()));
    }

    public function test_a_transcript_signs_each_team_message_with_its_sender(): void
    {
        $chat = $this->chat(['active_agent_name' => 'Whoever Answers Now'], [['visitor', 'Hello?', 10]]);
        foreach ([[$this->manager, 'I will check.', 9], [$this->staffMember, 'Here is the price.', 8]] as [$user, $text, $ago]) {
            DB::table('chat_messages')->insert(['organization_id' => $this->org->id, 'conversation_id' => $chat, 'sender_type' => 'agent', 'sender_user_id' => $user->id, 'content' => $text, 'content_type' => 'text', 'is_read' => true, 'created_at' => now()->subMinutes($ago)]);
        }

        $text = $this->asStaffMember()->get($this->adminApi("chat-inbox/{$chat}/transcript"))->assertOk()->getContent();
        $this->assertStringContainsString("{$this->manager->name}: I will check.", $text);
        $this->assertStringContainsString("{$this->staffMember->name}: Here is the price.", $text);
        $this->assertStringNotContainsString('Whoever Answers Now', $text);

        $html = $this->asStaffMember()->get($this->adminApi("chat-inbox/{$chat}/transcript?format=html"))->assertOk()->getContent();
        $this->assertStringContainsString(e($this->staffMember->name), $html);
    }

    public function test_transcription_unavailable_carries_its_code(): void
    {
        if (filled(env('OPENAI_API_KEY'))) {
            $this->markTestSkipped('An OpenAI key is set in this environment.');
        }
        config(['openai.api_key' => null]);

        $this->asStaffMember()->post($this->adminApi('chat-inbox/transcribe'), ['audio' => UploadedFile::fake()->create('reply.mp3', 4, 'audio/mpeg')], ['Accept' => 'application/json'])
            ->assertStatus(503)->assertJsonPath('error', 'transcription_unavailable');
    }

    public function test_a_brief_the_ai_could_not_write_carries_its_code(): void
    {
        OpenAI::fake([new \RuntimeException('upstream secret internals')]);
        $chat = $this->chat([], [['visitor', 'Do you have parking?', 3]]);

        $response = $this->asStaffMember()->getJson($this->adminApi("engagement/conversations/{$chat}/brief"))->assertOk()
            ->assertJsonPath('data.code', 'ai_failed')
            ->assertJsonPath('data.brief', null);
        $this->assertNotNull($response->json('data.error'), 'the sentence stays beside the code');
        $this->assertStringNotContainsString('secret internals', $response->getContent());
    }
}
