<?php

namespace Tests\Feature\CrmWorkspace;

use App\Models\Organization;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpCrmWorkspace;
use Tests\TestCase;

/** "Teach the assistant" (2026-11-07): answers rated wrong and not yet corrected, with the question they answered. */
class BotGapsTest extends TestCase
{
    use DatabaseTransactions, SetsUpCrmWorkspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpCrmWorkspace();
    }

    private function answerOf(int $conversation): int
    {
        return (int) DB::table('chat_messages')->where('conversation_id', $conversation)->where('sender_type', 'ai')->orderByDesc('id')->value('id');
    }

    private function rate(int $message, string $rating, bool $applied = false, ?int $user = null): void
    {
        DB::table('chat_message_feedback')->insert(['organization_id' => $this->org->id, 'message_id' => $message, 'user_id' => $user ?? $this->staffMember->id, 'rating' => $rating, 'comment' => 'Wrong price', 'applied_to_training' => $applied, 'created_at' => now(), 'updated_at' => now()]);
    }

    public function test_a_wrong_answer_is_listed_with_its_question_until_someone_teaches_the_right_one(): void
    {
        $chat = $this->chat(['visitor_name' => 'Maria'], [['visitor', 'How much is a consultation?', 10], ['ai', 'It costs 20 €.', 9]]);
        $answer = $this->answerOf($chat);
        $this->rate($answer, 'bad');

        $gaps = $this->asStaffMember()->getJson($this->crmApi('bot-gaps'))->assertOk()->json('data');
        $this->assertCount(1, $gaps);
        $this->assertSame([$answer, $chat, 'Maria', 'How much is a consultation?', 'It costs 20 €.', 'Wrong price', true, 1],
            [$gaps[0]['message_id'], $gaps[0]['conversation_id'], $gaps[0]['visitor'], $gaps[0]['question'], $gaps[0]['answer'], $gaps[0]['comment'], $gaps[0]['teachable'], $gaps[0]['ratings']]);

        // A manager's correction (the inbox's feedback with apply_to_training) takes it off the list for everyone.
        $this->rate($answer, 'bad', applied: true, user: $this->manager->id);
        $this->assertSame([], $this->asStaffMember()->getJson($this->crmApi('bot-gaps'))->assertOk()->json('data'));
    }

    public function test_good_answers_and_another_organisations_are_not_listed(): void
    {
        $good = $this->chat([], [['visitor', 'Are you open on Sunday?', 5], ['ai', 'Yes, 10 to 16.', 4]]);
        $this->rate($this->answerOf($good), 'good');

        $prior = app('current_organization_id');
        app()->forgetInstance('current_organization_id');
        $other = Organization::create(['name' => 'Elsewhere', 'slug' => 'else-' . uniqid('', true)]);
        app()->instance('current_organization_id', $prior);
        $theirs = DB::table('chat_conversations')->insertGetId(['organization_id' => $other->id, 'status' => 'active', 'created_at' => now(), 'updated_at' => now()]);
        $theirAnswer = DB::table('chat_messages')->insertGetId(['organization_id' => $other->id, 'conversation_id' => $theirs, 'sender_type' => 'ai', 'content' => 'Theirs', 'created_at' => now()]);
        DB::table('chat_message_feedback')->insert(['organization_id' => $other->id, 'message_id' => $theirAnswer, 'user_id' => $this->manager->id, 'rating' => 'bad', 'applied_to_training' => false, 'created_at' => now(), 'updated_at' => now()]);

        $this->assertSame([], $this->asManager()->getJson($this->crmApi('bot-gaps'))->assertOk()->json('data'));
    }

    public function test_an_answer_without_a_question_cannot_be_taught(): void
    {
        $chat = $this->chat([], [['ai', 'Welcome! Ask me anything.', 5]]);
        $this->rate($this->answerOf($chat), 'bad');

        $gaps = $this->asStaffMember()->getJson($this->crmApi('bot-gaps'))->assertOk()->json('data');
        $this->assertSame([null, false], [$gaps[0]['question'], $gaps[0]['teachable']]);
    }
}
