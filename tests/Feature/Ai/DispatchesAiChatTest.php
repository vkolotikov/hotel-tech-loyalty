<?php

namespace Tests\Feature\Ai;

use App\Exceptions\RetryableAiException;
use App\Models\AiUsageLog;
use App\Services\Ai\AnthropicSdk;
use App\Traits\DispatchesAiChat;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * The chat widget's provider calls (DispatchesAiChat), owner 2026-11-01:
 *
 *   - Claude goes through the official SDK — API version 2026-10-21, the key
 *     as a bearer token — and never receives temperature, top_p or top_k
 *     (every current Claude model refuses a non-default temperature, and that
 *     API version refuses all three on every model). Effort `low` goes only
 *     to the models that accept it. The reply is the text blocks, so a
 *     thinking block in front is skipped; a refusal or a reply with no text
 *     is a failed call. 429 / 529 / 5xx are RetryableAiException, and the
 *     SDK itself never retries (withRetry() is the only loop).
 *   - gpt-5.6-* take the Responses API with no temperature, like gpt-5.5.
 *   - Gemini 3+ keeps its own temperature; Gemini 2.x still gets the setting.
 */
class DispatchesAiChatTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema;

    protected function setUp(): void
    {
        parent::setUp();
        config([
            'services.anthropic.api_key'     => 'claude-test-key',
            'openai.api_key'                 => 'openai-test-key',
            'services.google.gemini_api_key' => 'gemini-test-key',
        ]);
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        parent::tearDown();
    }

    // ── Claude ──────────────────────────────────────────────────────────

    public function test_claude_request_is_api_version_2026_10_21_with_a_bearer_key_and_no_sampling_settings(): void
    {
        Http::fake(function (Request $request) {
            $this->assertSame('POST', $request->method());
            $this->assertSame('https://api.anthropic.com/v1/messages', $request->url());
            $this->assertSame('2026-10-21', $request->header('anthropic-version')[0] ?? null);
            $this->assertSame('Bearer claude-test-key', $request->header('Authorization')[0] ?? null);
            $this->assertSame([], $request->header('x-api-key'));

            $body = $request->data();
            $this->assertSame('claude-haiku-5-5', $body['model']);
            $this->assertSame(512, $body['max_tokens']);
            $this->assertSame('You are the concierge.', $body['system']);
            $this->assertSame([['role' => 'user', 'content' => 'Is breakfast included?']], $body['messages']);
            $this->assertSame([], array_values(array_intersect(['temperature', 'top_p', 'top_k', 'thinking'], array_keys($body))));
            $this->assertSame(['effort' => 'low'], $body['output_config']);

            return Http::response($this->claudeMessage([['type' => 'text', 'text' => 'Yes, from 7 to 10.']]));
        });

        $reply = $this->dispatcher()->chat('anthropic', 'You are the concierge.',
            [['role' => 'user', 'content' => 'Is breakfast included?']], 'claude-haiku-5-5', 0.9, 512,
            ['top_p' => 0.8, 'reasoning_effort' => 'xhigh']);

        $this->assertSame('Yes, from 7 to 10.', $reply);
        Http::assertSentCount(1);
    }

    #[DataProvider('effortModels')]
    public function test_effort_is_sent_only_to_models_that_accept_it(string $model, bool $takesEffort): void
    {
        $this->assertSame($takesEffort, AnthropicSdk::takesEffort($model));

        Http::fake(function (Request $request) use ($model, $takesEffort) {
            $body = $request->data();
            $this->assertSame($model, $body['model']);
            $this->assertSame($takesEffort, array_key_exists('output_config', $body));
            $this->assertArrayNotHasKey('temperature', $body);

            return Http::response($this->claudeMessage([['type' => 'text', 'text' => 'Hello']]));
        });

        $this->assertSame('Hello', $this->dispatcher()->chat('anthropic', 'sys', [['role' => 'user', 'content' => 'Hi']], $model, 0.7, 300));
    }

    public static function effortModels(): array
    {
        return [
            'Haiku 5.5'         => ['claude-haiku-5-5', true],
            'Sonnet 5.5'        => ['claude-sonnet-5-5', true],
            'Opus 5.5'          => ['claude-opus-5-5', true],
            'Sonnet 5'          => ['claude-sonnet-5', true],
            'saved Opus 4.6'    => ['claude-opus-4-6', true],
            'saved Sonnet 4.6'  => ['claude-sonnet-4-6', true],
            'saved Haiku 4.5'   => ['claude-haiku-4-5-20251001', false],
            'Sonnet 4.5'        => ['claude-sonnet-4-5', false],
            'dated Sonnet 4'    => ['claude-sonnet-4-20250514', false],
        ];
    }

    public function test_the_reply_is_the_text_blocks_after_a_thinking_block(): void
    {
        Http::fake(fn () => Http::response($this->claudeMessage([
            ['type' => 'thinking', 'thinking' => 'The guest asks about parking.', 'signature' => 'sig-test'],
            ['type' => 'text', 'text' => 'Parking is free '],
            ['type' => 'text', 'text' => 'for guests.'],
        ])));

        $this->assertSame('Parking is free for guests.',
            $this->dispatcher()->chat('anthropic', 'sys', [['role' => 'user', 'content' => 'Parking?']], 'claude-haiku-5-5', 0.7, 400));
    }

    public function test_a_refusal_is_a_failed_call_not_an_empty_answer(): void
    {
        Http::fake(fn () => Http::response($this->claudeMessage([], 'refusal')));

        try {
            $this->dispatcher()->chat('anthropic', 'sys', [['role' => 'user', 'content' => 'Hi']], 'claude-haiku-5-5', 0.7, 400);
            $this->fail('A refusal must fail the call.');
        } catch (\RuntimeException $e) {
            $this->assertNotInstanceOf(RetryableAiException::class, $e);
            $this->assertStringContainsString('refused', $e->getMessage());
        }
        Http::assertSentCount(1);
    }

    public function test_a_reply_with_no_text_is_a_failed_call(): void
    {
        // Only thinking, cut off by max_tokens: storing '' would also break the
        // conversation's next request, which Claude refuses with an empty turn.
        Http::fake(fn () => Http::response($this->claudeMessage(
            [['type' => 'thinking', 'thinking' => 'Let me think…', 'signature' => 'sig-test']], 'max_tokens')));

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('no text');
        $this->dispatcher()->chat('anthropic', 'sys', [['role' => 'user', 'content' => 'Hi']], 'claude-haiku-5-5', 0.7, 50);
    }

    public function test_a_429_is_retryable_with_the_retry_after_delay(): void
    {
        Http::fake(fn () => Http::response(
            ['type' => 'error', 'error' => ['type' => 'rate_limit_error', 'message' => 'Slow down']], 429, ['retry-after' => '7']));

        try {
            $this->dispatcher()->attempt(AnthropicSdk::client('claude-test-key', 60), $this->claudeParams(), 'claude-haiku-5-5');
            $this->fail('A 429 must be retryable.');
        } catch (RetryableAiException $e) {
            $this->assertSame(429, $e->getCode());
            $this->assertSame(7, $e->retryDelay);
            $this->assertStringContainsString('Slow down', $e->getMessage());
        }
        // The SDK makes one attempt; DispatchesAiChat::withRetry() owns retries.
        Http::assertSentCount(1);
    }

    #[DataProvider('serverFailures')]
    public function test_overloaded_and_server_errors_are_retryable_after_one_second(int $status): void
    {
        Http::fake(fn () => Http::response(['type' => 'error', 'error' => ['type' => 'overloaded_error', 'message' => 'Busy']], $status));

        try {
            $this->dispatcher()->attempt(AnthropicSdk::client('claude-test-key', 60), $this->claudeParams(), 'claude-haiku-5-5');
            $this->fail("A {$status} must be retryable.");
        } catch (RetryableAiException $e) {
            $this->assertSame($status, $e->getCode());
            $this->assertSame(1, $e->retryDelay);
        }
        Http::assertSentCount(1);
    }

    public static function serverFailures(): array
    {
        return ['500' => [500], '503' => [503], 'overloaded 529' => [529]];
    }

    public function test_a_bad_request_is_a_plain_failure_and_not_retried(): void
    {
        Http::fake(fn () => Http::response(
            ['type' => 'error', 'error' => ['type' => 'invalid_request_error', 'message' => 'model: not found']], 400));

        try {
            $this->dispatcher()->chat('anthropic', 'sys', [['role' => 'user', 'content' => 'Hi']], 'claude-haiku-5-5', 0.7, 300);
            $this->fail('A 400 must fail the call.');
        } catch (\RuntimeException $e) {
            $this->assertNotInstanceOf(RetryableAiException::class, $e);
            $this->assertStringContainsString('400', $e->getMessage());
            $this->assertStringContainsString('model: not found', $e->getMessage());
        }
        Http::assertSentCount(1);
    }

    public function test_a_429_then_a_reply_is_retried_once_by_the_trait_loop(): void
    {
        Http::fakeSequence('api.anthropic.com/*')
            ->push(['type' => 'error', 'error' => ['type' => 'rate_limit_error', 'message' => 'Slow down']], 429, ['retry-after' => '1'])
            ->push($this->claudeMessage([['type' => 'text', 'text' => 'Back again']]));

        $this->assertSame('Back again',
            $this->dispatcher()->chat('anthropic', 'sys', [['role' => 'user', 'content' => 'Hi']], 'claude-sonnet-5-5', 0.7, 300));
        Http::assertSentCount(2);
    }

    public function test_a_connection_failure_goes_through_the_trait_loop_and_then_fails(): void
    {
        // The SDK's transport hands Laravel's ConnectionException straight
        // back, so withRetry() retries it as it did before the SDK.
        $attempts = 0;
        Http::fake(function () use (&$attempts) {
            $attempts++;
            throw new \Illuminate\Http\Client\ConnectionException('Connection refused');
        });

        try {
            $this->dispatcher()->chat('anthropic', 'sys', [['role' => 'user', 'content' => 'Hi']], 'claude-haiku-5-5', 0.7, 300);
            $this->fail('An unreachable API must fail the call.');
        } catch (\RuntimeException $e) {
            $this->assertStringContainsString('after 3 attempts', $e->getMessage());
            $this->assertStringContainsString('Connection refused', $e->getMessage());
        }
        $this->assertSame(3, $attempts);
    }

    public function test_usage_is_recorded_with_the_new_models_price(): void
    {
        $this->setUpAiUsageSchema();
        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);

        Http::fake(fn () => Http::response($this->claudeMessage(
            [['type' => 'text', 'text' => 'Hello']], 'end_turn', ['input_tokens' => 1_000_000, 'output_tokens' => 200_000])));

        $this->dispatcher()->chat('anthropic', 'sys', [['role' => 'user', 'content' => 'Hi']], 'claude-haiku-5-5', 0.7, 300, [], 'website_chatbot');

        $row = AiUsageLog::where('organization_id', $org->id)->sole();
        $this->assertSame('claude-haiku-5-5', $row->model);
        $this->assertSame('website_chatbot', $row->feature);
        $this->assertSame(1_000_000, (int) $row->input_tokens);
        $this->assertSame(200_000, (int) $row->output_tokens);
        // $0.10 per MTok in + $0.50 per MTok out → $0.10 + $0.10 = 20 cents.
        $this->assertSame(20, (int) $row->cost_cents);
    }

    // ── OpenAI ──────────────────────────────────────────────────────────

    #[DataProvider('gpt56Models')]
    public function test_gpt_5_6_models_take_the_responses_api_with_no_temperature(string $model): void
    {
        Http::fake(function (Request $request) use ($model) {
            $this->assertSame('https://api.openai.com/v1/responses', $request->url());
            $body = $request->data();
            $this->assertSame($model, $body['model']);
            $this->assertSame('sys', $body['instructions']);
            $this->assertSame(['effort' => 'low'], $body['reasoning']);
            $this->assertArrayNotHasKey('temperature', $body);
            $this->assertArrayNotHasKey('top_p', $body);

            return Http::response(['output_text' => 'Hello from ' . $model, 'usage' => ['input_tokens' => 5, 'output_tokens' => 3]]);
        });

        // With the venue's saved effort, and with none saved (the default for these is low too).
        $this->assertSame("Hello from {$model}", $this->dispatcher()->chat('openai', 'sys',
            [['role' => 'user', 'content' => 'Hi']], $model, 0.7, 800, ['reasoning_effort' => 'low', 'top_p' => 0.5]));
        $this->assertSame("Hello from {$model}", $this->dispatcher()->chat('openai', 'sys',
            [['role' => 'user', 'content' => 'Hi']], $model, 0.7, 800));
        Http::assertSentCount(2);
    }

    public static function gpt56Models(): array
    {
        return ['Terra' => ['gpt-5.6-terra'], 'Luna' => ['gpt-5.6-luna']];
    }

    // ── Gemini ──────────────────────────────────────────────────────────

    #[DataProvider('geminiModels')]
    public function test_gemini_3_keeps_its_own_temperature_and_gemini_2_still_gets_the_setting(string $model, bool $getsTemperature): void
    {
        Http::fake(function (Request $request) use ($model, $getsTemperature) {
            $this->assertStringStartsWith("https://generativelanguage.googleapis.com/v1beta/models/{$model}:generateContent", $request->url());
            $config = $request->data()['generationConfig'];
            $this->assertSame(600, $config['maxOutputTokens']);
            $this->assertSame($getsTemperature, array_key_exists('temperature', $config));

            return Http::response(['candidates' => [['content' => ['parts' => [
                ['text' => 'Thinking it over', 'thought' => true],
                ['text' => 'Check-in is from 3 pm.'],
            ]]]]]);
        });

        $this->assertSame('Check-in is from 3 pm.', $this->dispatcher()->chat('google', 'sys',
            [['role' => 'user', 'content' => 'Check-in?']], $model, 0.7, 600));
    }

    public static function geminiModels(): array
    {
        return [
            'Gemini 3.5 Flash-Lite' => ['gemini-3.5-flash-lite', false],
            'saved Gemini 2.5 Flash' => ['gemini-2.5-flash', true],
        ];
    }

    // ── Helpers ─────────────────────────────────────────────────────────

    private function dispatcher(): object
    {
        return new class {
            use DispatchesAiChat;

            public function chat(string $provider, string $system, array $messages, string $model, float $temperature, int $maxTokens, array $extra = [], string $feature = 'chat'): string
            {
                return $this->callProvider($provider, $system, $messages, $model, $temperature, $maxTokens, $extra, $feature);
            }

            public function attempt(\Anthropic\Client $client, array $params, string $model): string
            {
                return $this->anthropicAttempt($client, $params, $model, 'chat');
            }
        };
    }

    private function claudeParams(): array
    {
        return ['model' => 'claude-haiku-5-5', 'maxTokens' => 300, 'messages' => [['role' => 'user', 'content' => 'Hi']]];
    }

    private function claudeMessage(array $content, string $stopReason = 'end_turn', array $usage = ['input_tokens' => 20, 'output_tokens' => 10]): array
    {
        return ['id' => 'msg_test', 'type' => 'message', 'role' => 'assistant', 'model' => 'claude-haiku-5-5',
            'content' => $content, 'stop_reason' => $stopReason, 'stop_sequence' => null, 'usage' => $usage];
    }
}
