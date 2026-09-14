<?php

namespace Tests\Feature\Voice;

use App\Voice\VoiceGateway;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;

class VoiceGatewayTest extends VoiceTestCase
{
    /** Queue OpenAI chat-completion responses in order. */
    private function fakeModel(array ...$replies): void
    {
        $sequence = Http::sequence();
        foreach ($replies as $reply) {
            $sequence->push($reply, 200);
        }
        Http::fake(['api.openai.com/*' => $sequence]);
    }

    private function toolCall(string $name, array $arguments): array
    {
        return ['choices' => [['message' => ['role' => 'assistant', 'content' => null,
            'tool_calls' => [['id' => 'call_1', 'type' => 'function', 'function' => [
                'name' => $name, 'arguments' => json_encode($arguments)]]]]]],
            'usage' => ['prompt_tokens' => 10, 'completion_tokens' => 5]];
    }

    private function finalAnswer(string $text): array
    {
        return ['choices' => [['message' => ['role' => 'assistant', 'content' => $text]]],
            'usage' => ['prompt_tokens' => 10, 'completion_tokens' => 5]];
    }

    public function test_a_question_is_answered_by_calling_a_tool_then_speaking(): void
    {
        config(['openai.api_key' => 'test-key']);
        $this->fakeModel(
            $this->toolCall('voice_lead_count', []),
            $this->finalAnswer('You have two leads today.'));

        $turn = app(VoiceGateway::class)->turn($this->staff, 'how many leads today', 'session-1');

        $this->assertSame('You have two leads today.', $turn['spoken']);
        $this->assertSame(['voice_lead_count'], $turn['tools_used']);
    }

    public function test_a_turn_stops_after_the_tool_call_ceiling(): void
    {
        config(['openai.api_key' => 'test-key', 'voice.max_tool_calls' => 2]);
        $this->fakeModel(
            $this->toolCall('voice_lead_count', []),
            $this->toolCall('voice_lead_count', []),
            $this->toolCall('voice_lead_count', []),
            $this->finalAnswer('unused'));

        $turn = app(VoiceGateway::class)->turn($this->staff, 'loop forever', 'session-2');

        $this->assertCount(2, $turn['tools_used']);
        // A ceiling hit is spoken, never silent.
        $this->assertNotSame('', $turn['spoken']);
    }

    public function test_the_model_cannot_save_a_note_without_proposing_it_first(): void
    {
        config(['openai.api_key' => 'test-key']);
        $this->fakeModel(
            $this->toolCall('voice_commit_note',
                ['request_id' => '9133341b-c7da-4126-a6cb-fc302bdb170b']),
            $this->finalAnswer('I could not save that.'));

        $turn = app(VoiceGateway::class)->turn($this->staff, 'just save it', 'session-3');

        $this->assertSame(['voice_commit_note'], $turn['tools_used']);
        $this->assertSame('', (string) DB::table('service_bookings')->where('id', 1)->value('staff_notes'),
            'Nothing may be written without a proposal.');
    }

    public function test_a_denied_organization_never_reaches_the_model(): void
    {
        config(['openai.api_key' => 'test-key', 'voice.organization_ids' => []]);
        Http::fake(['api.openai.com/*' => Http::response([], 200)]);

        $this->expectException(\Illuminate\Auth\Access\AuthorizationException::class);
        app(VoiceGateway::class)->turn($this->staff, 'how many leads today', 'session-4');
    }

    public function test_a_long_conversation_never_sends_a_tool_result_without_its_request(): void
    {
        // Each question calls two tools, so a fixed message count cuts through the
        // middle of a question. That is what OpenAI rejected with HTTP 400 on the
        // fourth question of a live Echo session.
        config(['openai.api_key' => 'test-key']);
        $twoTools = ['choices' => [['message' => ['role' => 'assistant', 'content' => null, 'tool_calls' => [
            ['id' => 'call_a', 'type' => 'function', 'function' => ['name' => 'voice_lead_count', 'arguments' => '{}']],
            ['id' => 'call_b', 'type' => 'function', 'function' => ['name' => 'voice_next_bookings', 'arguments' => '{}']],
        ]]]], 'usage' => ['prompt_tokens' => 10, 'completion_tokens' => 5]];

        $replies = [];
        for ($question = 1; $question <= 6; $question++) {
            $replies[] = $twoTools;
            $replies[] = $this->finalAnswer("Answer {$question}.");
        }
        $this->fakeModel(...$replies);

        for ($question = 1; $question <= 6; $question++) {
            $this->assertSame("Answer {$question}.",
                app(VoiceGateway::class)->turn($this->staff, "question {$question}", 'long-session')['spoken']);
        }

        foreach (Http::recorded() as [$request]) {
            $messages = $request->data()['messages'];
            foreach ($messages as $index => $message) {
                if ($message['role'] !== 'tool') {
                    continue;
                }
                $previous = $index - 1;
                while ($previous >= 0 && $messages[$previous]['role'] === 'tool') {
                    $previous--;
                }
                $this->assertTrue($previous >= 0 && $messages[$previous]['role'] === 'assistant'
                    && ! empty($messages[$previous]['tool_calls']), "A tool result at {$index} was sent without its request.");
            }
        }
    }

    public function test_the_model_is_told_todays_date_in_the_organization_timezone(): void
    {
        // Without it, "and yesterday?" has nothing to count back from.
        config(['openai.api_key' => 'test-key']);
        $this->fakeModel($this->finalAnswer('Fine.'));

        app(VoiceGateway::class)->turn($this->staff, 'and yesterday?', 'dated-session');

        $system = Http::recorded()[0][0]->data()['messages'][0]['content'];
        $this->assertStringContainsString('2026-09-12', $system);
        $this->assertStringContainsString('Europe/Riga', $system);
    }

    public function test_newer_models_get_their_own_token_and_reasoning_settings(): void
    {
        config(['openai.api_key' => 'test-key', 'voice.model' => 'gpt-5.4', 'voice.reasoning_effort' => 'none']);
        $this->fakeModel($this->finalAnswer('Fine.'), $this->finalAnswer('Fine.'));

        app(VoiceGateway::class)->turn($this->staff, 'hello', 'model-a');
        config(['voice.model' => 'gpt-4.1']);
        app(VoiceGateway::class)->turn($this->staff, 'hello', 'model-b');

        $first = Http::recorded()[0][0]->data();
        $second = Http::recorded()[1][0]->data();

        $this->assertSame(['gpt-5.4', 400, 'none'], [$first['model'], $first['max_completion_tokens'], $first['reasoning_effort']]);
        $this->assertArrayNotHasKey('max_tokens', $first, 'GPT-5 models reject max_tokens.');
        $this->assertSame('gpt-4.1', $second['model']);
        $this->assertArrayNotHasKey('reasoning_effort', $second, 'Non-reasoning models reject reasoning_effort.');
    }

    public function test_a_read_only_turn_neither_offers_nor_runs_note_tools(): void
    {
        config(['openai.api_key' => 'test-key']);
        $this->fakeModel(
            $this->toolCall('voice_propose_note',
                ['subject_type' => 'booking', 'subject_id' => 'service:1', 'body' => 'Quiet room']),
            $this->finalAnswer('Adding notes is turned off on this device.'));

        $turn = app(VoiceGateway::class)->turn($this->staff, 'note that they want a quiet room', 'session-5',
            allowWrites: false);

        $this->assertSame(['voice_propose_note'], $turn['tools_used']);

        $recorded = Http::recorded();
        $offered = array_column(array_column($recorded[0][0]->data()['tools'], 'function'), 'name');
        $this->assertNotContains('voice_propose_note', $offered);
        $this->assertNotContains('voice_commit_note', $offered);

        $toolReply = collect($recorded[1][0]->data()['messages'])->firstWhere('role', 'tool');
        $this->assertStringContainsString('turned off', $toolReply['content']);
    }
}
