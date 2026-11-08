<?php

namespace Tests\Feature\CrmWorkspace;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpCrmWorkspace;
use Tests\TestCase;

/**
 * The inbox's feedback endpoint (`chat-inbox/messages/{id}/feedback`, 2026-11-08): only a manager's corrected answer
 * teaches the assistant (the "AI Corrections" knowledge); a staff member's is kept on their feedback row as a
 * suggestion for a manager to check. Resending without a comment keeps the comment.
 */
class TeachTheAssistantTest extends TestCase
{
    use DatabaseTransactions, SetsUpCrmWorkspace;

    private int $answer;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpCrmWorkspace();

        $chat = $this->chat(['visitor_name' => 'Maria'], [['visitor', 'How much is a consultation?', 10], ['ai', 'It costs 20 €.', 9]]);
        $this->answer = (int) DB::table('chat_messages')->where('conversation_id', $chat)->where('sender_type', 'ai')->value('id');
    }

    private function feedback(array $body)
    {
        return $this->postJson($this->adminApi("chat-inbox/messages/{$this->answer}/feedback"), $body);
    }

    public function test_a_staff_members_correction_is_a_suggestion_and_teaches_nothing(): void
    {
        $this->asStaffMember()->feedback(['rating' => 'bad', 'comment' => 'Wrong price', 'corrected_answer' => 'A first consultation costs 45 €.', 'apply_to_training' => true])
            ->assertOk()
            ->assertJsonPath('applied_to_training', false)
            ->assertJsonPath('suggested', true)
            ->assertJsonPath('suggested_answer', 'A first consultation costs 45 €.');

        $this->assertSame(0, DB::table('knowledge_items')->count(), 'a staff member teaches nothing');
        $this->assertSame('A first consultation costs 45 €.', DB::table('chat_message_feedback')->where('user_id', $this->staffMember->id)->value('suggested_answer'));

        // The manager's list shows the suggestion, who made it, and who rated it.
        $gap = $this->asManager()->getJson($this->crmApi('bot-gaps'))->assertOk()->json('data.0');
        $this->assertSame(['A first consultation costs 45 €.', $this->staffMember->name, $this->staffMember->id],
            [$gap['suggested_answer'], $gap['suggested_by'], $gap['rated_by_id']]);
    }

    public function test_a_managers_correction_teaches_the_assistant(): void
    {
        $this->asManager()->feedback(['rating' => 'bad', 'corrected_answer' => 'A first consultation costs 45 €.', 'apply_to_training' => true])
            ->assertOk()
            ->assertJsonPath('applied_to_training', true)
            ->assertJsonPath('suggested', false)
            ->assertJsonPath('suggested_answer', null);

        $item = DB::table('knowledge_items')->first();
        $this->assertSame(['How much is a consultation?', 'A first consultation costs 45 €.'], [$item->question, $item->answer]);
        $this->assertSame('AI Corrections', DB::table('knowledge_categories')->where('id', $item->category_id)->value('name'));
        $this->assertSame([], $this->asManager()->getJson($this->crmApi('bot-gaps'))->assertOk()->json('data'), 'a taught answer leaves the list');
    }

    public function test_a_resend_without_a_comment_keeps_the_comment_and_an_explicit_one_replaces_it(): void
    {
        $this->asStaffMember()->feedback(['rating' => 'bad', 'comment' => 'Wrong price'])->assertOk();
        $this->asStaffMember()->feedback(['rating' => 'bad', 'corrected_answer' => 'It costs 45 €.', 'apply_to_training' => true])
            ->assertOk()->assertJsonPath('comment', 'Wrong price');
        $this->asStaffMember()->feedback(['rating' => 'good'])->assertOk()->assertJsonPath('comment', 'Wrong price');
        $this->asStaffMember()->feedback(['rating' => 'bad', 'comment' => 'Still wrong'])->assertOk()->assertJsonPath('comment', 'Still wrong');
        $this->asStaffMember()->feedback(['rating' => 'bad', 'comment' => null])->assertOk()->assertJsonPath('comment', null);

        $this->assertSame(1, DB::table('chat_message_feedback')->count(), 'one row per person and answer');
        $this->assertSame('It costs 45 €.', DB::table('chat_message_feedback')->value('suggested_answer'), 'the suggestion stays');
    }
}
