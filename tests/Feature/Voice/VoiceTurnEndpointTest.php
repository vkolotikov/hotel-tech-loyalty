<?php

namespace Tests\Feature\Voice;

use Illuminate\Support\Facades\Http;

class VoiceTurnEndpointTest extends VoiceTestCase
{
    private const PATH = '/api/v1/admin/voice/turn';

    protected function setUp(): void
    {
        parent::setUp();

        // Strip only the authentication, tenancy and billing stack this route
        // shares with every other admin endpoint. The voice capability gate
        // lives inside the gateway rather than in middleware, so it still runs
        // here — which is what the refusal test below actually exercises.
        // Class names, not aliases: withoutMiddleware() matches on the class.
        $this->withoutMiddleware([
            \App\Http\Middleware\SaasAuthMiddleware::class,
            \App\Http\Middleware\CheckSubscription::class,
            \App\Http\Middleware\TenantMiddleware::class,
            \App\Http\Middleware\BrandMiddleware::class,
            \App\Http\Middleware\AdminMiddleware::class,
        ]);
    }

    private function fakeAnswer(string $text): void
    {
        config(['openai.api_key' => 'test-key']);
        Http::fake(['api.openai.com/*' => Http::response([
            'choices' => [['message' => ['role' => 'assistant', 'content' => $text]]],
            'usage' => ['prompt_tokens' => 5, 'completion_tokens' => 3]], 200)]);
    }

    public function test_a_signed_in_staff_member_gets_a_spoken_answer(): void
    {
        $this->fakeAnswer('Two leads today.');

        $this->postJson(self::PATH, ['said' => 'how many leads today'])
            ->assertOk()
            ->assertJsonPath('spoken', 'Two leads today.')
            ->assertJsonStructure(['spoken', 'tools_used', 'session_id']);
    }

    public function test_the_endpoint_refuses_an_organization_without_voice_access(): void
    {
        $this->fakeAnswer('unused');
        config(['voice.organization_ids' => []]);

        $this->postJson(self::PATH, ['said' => 'how many leads today'])
            ->assertForbidden()
            ->assertJsonStructure(['message']);
    }

    public function test_a_blank_utterance_is_rejected(): void
    {
        $this->postJson(self::PATH, ['said' => '   '])->assertStatus(422);
        $this->postJson(self::PATH, [])->assertStatus(422);
    }

    public function test_the_same_session_id_is_returned_so_a_conversation_can_continue(): void
    {
        $this->fakeAnswer('Two leads today.');

        $this->postJson(self::PATH, ['said' => 'how many leads', 'session_id' => 'kitchen-tablet'])
            ->assertOk()
            ->assertJsonPath('session_id', 'kitchen-tablet');
    }
}
