<?php

namespace Tests\Feature\Ai;

use App\Http\Controllers\Api\V1\Admin\ChatbotConfigController;
use App\Http\Controllers\Api\V1\Admin\CrmAiController;
use App\Http\Controllers\Api\V1\Admin\SettingsController;
use App\Models\HotelSetting;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use ReflectionMethod;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * The admin's other direct Claude calls, moved to the official SDK (API
 * version 2026-10-21, bearer key, no sampling settings) on 2026-11-01:
 *
 *   - POST /v1/admin/chatbot-config/probe-model asks the Models API about the
 *     chosen id (no tokens spent) and reports active / deprecated / retired /
 *     unknown; the OpenAI probe finds the new gpt-5.6 ids in /v1/models.
 *   - Settings → Integrations → Test (Anthropic) lists one model.
 *   - GET /v1/admin/crm-ai/diagnose sends one tiny message.
 */
class AnthropicCallSitesTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema;

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.anthropic.api_key' => 'claude-test-key', 'openai.api_key' => 'openai-test-key']);
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        parent::tearDown();
    }

    public function test_the_probe_reports_a_current_claude_model_from_the_models_api(): void
    {
        Http::fake(function (HttpRequest $request) {
            $this->assertSame('GET', $request->method());
            $this->assertSame('https://api.anthropic.com/v1/models/claude-haiku-5-5', $request->url());
            $this->assertSame('2026-10-21', $request->header('anthropic-version')[0] ?? null);
            $this->assertSame('Bearer claude-test-key', $request->header('Authorization')[0] ?? null);

            return Http::response($this->modelInfo('claude-haiku-5-5', 'active'));
        });

        $this->assertSame(['available' => true, 'message' => 'Available'], $this->probe('anthropic', 'claude-haiku-5-5'));
        Http::assertSentCount(1);
    }

    public function test_the_probe_says_when_a_saved_claude_model_is_deprecated_or_retired(): void
    {
        Http::fakeSequence('api.anthropic.com/*')
            ->push($this->modelInfo('claude-opus-4-6', 'deprecated', '2027-02-01T00:00:00Z'))
            ->push($this->modelInfo('claude-sonnet-4-20250514', 'retired'));

        $deprecated = $this->probe('anthropic', 'claude-opus-4-6');
        $this->assertTrue($deprecated['available']);
        $this->assertStringContainsString('deprecated (retires 2027-02-01)', $deprecated['message']);

        $retired = $this->probe('anthropic', 'claude-sonnet-4-20250514');
        $this->assertFalse($retired['available']);
        $this->assertStringContainsString('Retired', $retired['message']);
    }

    public function test_the_probe_reports_an_unknown_claude_model_with_the_api_message(): void
    {
        Http::fake(fn () => Http::response(
            ['type' => 'error', 'error' => ['type' => 'not_found_error', 'message' => 'model: claude-nope']], 404));

        $this->assertSame(['available' => false, 'message' => 'HTTP 404: model: claude-nope'], $this->probe('anthropic', 'claude-nope'));
    }

    public function test_the_openai_probe_finds_the_new_gpt_5_6_models(): void
    {
        Http::fake(['api.openai.com/v1/models' => Http::response(['data' => [
            ['id' => 'gpt-5.5'], ['id' => 'gpt-5.6-terra'], ['id' => 'gpt-5.6-luna'],
        ]])]);

        $this->assertTrue($this->probe('openai', 'gpt-5.6-terra')['available']);
        $this->assertTrue($this->probe('openai', 'gpt-5.6-luna')['available']);
        $this->assertFalse($this->probe('openai', 'gpt-5.6-sol')['available']);
    }

    public function test_the_settings_key_check_lists_one_model_through_the_sdk(): void
    {
        $this->venueWithClaudeKey('venue-claude-key');

        Http::fake(function (HttpRequest $request) {
            $this->assertSame('GET', $request->method());
            $this->assertStringStartsWith('https://api.anthropic.com/v1/models', $request->url());
            $this->assertSame('2026-10-21', $request->header('anthropic-version')[0] ?? null);
            $this->assertSame('Bearer venue-claude-key', $request->header('Authorization')[0] ?? null);

            return Http::response(['data' => [$this->modelInfo('claude-haiku-5-5', 'active')], 'has_more' => true,
                'first_id' => 'claude-haiku-5-5', 'last_id' => 'claude-haiku-5-5']);
        });

        $this->assertSame(['success' => true, 'message' => 'Connected'], $this->keyCheck());
        Http::assertSentCount(1);
    }

    public function test_the_settings_key_check_reports_a_refused_key_by_its_status(): void
    {
        $this->venueWithClaudeKey('venue-claude-key');
        Http::fake(fn () => Http::response(['type' => 'error', 'error' => ['type' => 'authentication_error', 'message' => 'invalid x-api-key']], 401));

        $this->assertSame(['success' => false, 'message' => 'HTTP 401'], $this->keyCheck());
        Http::assertSentCount(1);
    }

    public function test_the_crm_ai_diagnosis_sends_one_tiny_message_with_no_sampling_settings(): void
    {
        config(['services.anthropic.model' => 'claude-sonnet-5']);
        Http::fake(function (HttpRequest $request) {
            $this->assertSame('https://api.anthropic.com/v1/messages', $request->url());
            $this->assertSame('2026-10-21', $request->header('anthropic-version')[0] ?? null);
            $body = $request->data();
            $this->assertSame('claude-sonnet-5', $body['model']);
            $this->assertSame([], array_values(array_intersect(['temperature', 'top_p', 'top_k'], array_keys($body))));

            return Http::response(['id' => 'msg_test', 'type' => 'message', 'role' => 'assistant', 'model' => 'claude-sonnet-5',
                'content' => [['type' => 'thinking', 'thinking' => '…', 'signature' => 'sig'], ['type' => 'text', 'text' => 'Hi!']],
                'stop_reason' => 'end_turn', 'stop_sequence' => null, 'usage' => ['input_tokens' => 3, 'output_tokens' => 2]]);
        });

        $checks = (new CrmAiController)->diagnose()->getData(true);
        $this->assertSame(200, $checks['api_status']);
        $this->assertSame('Hi!', $checks['api_body_preview']);
        Http::assertSentCount(1);
    }

    private function probe(string $provider, string $model): array
    {
        $request = Request::create('/api/v1/admin/chatbot-config/probe-model', 'POST', ['provider' => $provider, 'model_name' => $model]);

        return app(ChatbotConfigController::class)->probeModel($request)->getData(true);
    }

    private function venueWithClaudeKey(string $key): void
    {
        $this->setUpMinimalSchema();
        if (!Schema::hasTable('hotel_settings')) {
            Schema::create('hotel_settings', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id');
                $table->string('key', 100);
                $table->text('value')->nullable();
                $table->string('type', 32)->nullable();
                $table->string('group', 32)->nullable();
                $table->string('label')->nullable();
                $table->text('description')->nullable();
                $table->string('scope', 16)->default('company');
                $table->timestamps();
            });
        }
        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);
        HotelSetting::create(['key' => 'ai_anthropic_api_key', 'value' => $key, 'type' => 'string', 'group' => 'integrations']);
    }

    private function keyCheck(): array
    {
        $method = new ReflectionMethod(SettingsController::class, 'testAnthropic');

        return $method->invoke(app(SettingsController::class))->getData(true);
    }

    private function modelInfo(string $id, string $lifecycle, ?string $retiresAt = null): array
    {
        return [
            'type' => 'model', 'id' => $id, 'display_name' => $id, 'created_at' => '2026-07-01T00:00:00Z',
            'lifecycle' => $lifecycle, 'deprecated_at' => $lifecycle === 'active' ? null : '2026-10-01T00:00:00Z',
            'retires_at' => $retiresAt, 'max_input_tokens' => 200000, 'max_tokens' => 64000, 'line' => null, 'capabilities' => null,
        ];
    }
}
