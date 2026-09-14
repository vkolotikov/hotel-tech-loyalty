<?php

namespace Tests\Feature\Voice;

use App\Voice\TurnSession;
use Tests\TestCase;

class TurnSessionTest extends TestCase
{
    /** A question answered after one data lookup that returned two tool results. */
    private function turn(int $n): array
    {
        return [
            ['role' => 'user', 'content' => "question {$n}"],
            ['role' => 'assistant', 'content' => null, 'tool_calls' => [
                ['id' => "call_{$n}a", 'type' => 'function', 'function' => ['name' => 'voice_lead_count', 'arguments' => '{}']],
                ['id' => "call_{$n}b", 'type' => 'function', 'function' => ['name' => 'voice_next_bookings', 'arguments' => '{}']],
            ]],
            ['role' => 'tool', 'tool_call_id' => "call_{$n}a", 'content' => '{}'],
            ['role' => 'tool', 'tool_call_id' => "call_{$n}b", 'content' => '{}'],
            ['role' => 'assistant', 'content' => "answer {$n}"],
        ];
    }

    public function test_history_is_trimmed_by_whole_questions_so_a_tool_result_never_loses_its_request(): void
    {
        // Five-message questions make a fixed message count cut mid-question,
        // which is exactly what OpenAI rejected on the fourth spoken question.
        $session = new TurnSession;
        $session->remember(8, 'kitchen', array_merge(...array_map(fn ($n) => $this->turn($n), range(1, 8))));

        $history = $session->history(8, 'kitchen');

        $this->assertSame('user', $history[0]['role'], 'History must start at the beginning of a question.');
        foreach ($history as $index => $message) {
            if ($message['role'] !== 'tool') {
                continue;
            }
            $previous = $index - 1;
            while ($previous >= 0 && $history[$previous]['role'] === 'tool') {
                $previous--;
            }
            $this->assertTrue($previous >= 0 && $history[$previous]['role'] === 'assistant'
                && ! empty($history[$previous]['tool_calls']), "Tool result at {$index} has lost its request.");
        }
        $this->assertSame('answer 8', end($history)['content'], 'The newest question is always kept.');
    }

    public function test_a_single_very_long_question_is_kept_whole(): void
    {
        $session = new TurnSession;
        $long = [['role' => 'user', 'content' => 'question']];
        for ($i = 0; $i < 12; $i++) {
            $long[] = ['role' => 'assistant', 'content' => null, 'tool_calls' => [
                ['id' => "call_{$i}", 'type' => 'function', 'function' => ['name' => 'voice_lead_count', 'arguments' => '{}']]]];
            $long[] = ['role' => 'tool', 'tool_call_id' => "call_{$i}", 'content' => '{}'];
        }
        $long[] = ['role' => 'assistant', 'content' => 'answer'];

        $session->remember(8, 'long', $long);

        $this->assertSame('user', $session->history(8, 'long')[0]['role']);
    }
}
