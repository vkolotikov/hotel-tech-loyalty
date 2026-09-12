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
}
