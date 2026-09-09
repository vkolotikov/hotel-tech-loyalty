<?php

namespace Tests\Feature\WidgetRealtime;

use App\Services\KnowledgeService;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class WidgetRealtimeSessionTest extends TestCase
{
    private const KEY = '4cbf87b1-21eb-4ae2-8b58-3e854b0127df';
    private const ENDPOINT = '/api/v1/widget/'.self::KEY.'/realtime-session';
    private const UPSTREAM = 'https://api.openai.com/v1/realtime/client_secrets';

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        config(['services.openai.api_key' => 'test-server-only-key']);
        Cache::flush();
        Schema::create('chat_widget_configs', function ($t) {
            $t->id();
            $t->unsignedBigInteger('organization_id');
            $t->unsignedBigInteger('brand_id');
            $t->string('widget_key');
            $t->boolean('is_active');
            $t->string('company_name')->nullable();
        });
        Schema::create('chatbot_behavior_configs', function ($t) {
            $t->id();
            $t->unsignedBigInteger('organization_id');
            $t->unsignedBigInteger('brand_id');
        });
        Schema::create('voice_agent_configs', function ($t) {
            $t->id();
            $t->unsignedBigInteger('organization_id');
            $t->boolean('is_active');
            $t->boolean('realtime_enabled');
            $t->string('realtime_model')->nullable();
            $t->string('voice')->nullable();
            $t->string('language')->nullable();
            $t->text('voice_instructions')->nullable();
            $t->float('temperature')->nullable();
        });
        DB::table('chat_widget_configs')->insert(['organization_id' => 19, 'brand_id' => 23,
            'widget_key' => self::KEY, 'is_active' => true, 'company_name' => 'Test venue']);
        DB::table('voice_agent_configs')->insert(['organization_id' => 19, 'is_active' => true,
            'realtime_enabled' => true, 'realtime_model' => 'gpt-4o-realtime-preview', 'voice' => 'alloy',
            'language' => 'fr', 'voice_instructions' => 'Answer only from the venue knowledge.', 'temperature' => 1.5]);
        $this->mock(KnowledgeService::class)->shouldReceive('getKnowledgeContext')
            ->withArgs(fn ($query, $orgId) => $orgId === 19)->andReturn('Venue knowledge.');
    }

    protected function tearDown(): void
    {
        app()->forgetInstance('current_organization_id');
        app()->forgetInstance('current_brand_id');
        parent::tearDown();
    }

    public function test_real_widget_route_mints_ga_secret_with_its_own_configuration(): void
    {
        DB::table('voice_agent_configs')->insert(['organization_id' => 20, 'is_active' => true,
            'realtime_enabled' => true, 'voice_instructions' => 'FOREIGN PRIVATE INSTRUCTIONS']);
        app()->instance('current_organization_id', 20);
        $this->success();

        $this->postJson(self::ENDPOINT)->assertOk()
            ->assertJsonPath('client_secret', 'ephemeral-test-secret')->assertJsonPath('session_id', 'sess-test')
            ->assertJsonPath('model', 'gpt-realtime-1.5')->assertJsonPath('voice', 'alloy')
            ->assertJsonPath('language', 'fr')->assertJsonPath('language_name', 'French')
            ->assertHeader('Cache-Control', 'no-store, private')->assertDontSee('test-server-only-key');

        Http::assertSentCount(1);
        Http::assertSent(function ($request) {
            $data = $request->data();
            $this->assertSame(['anchor' => 'created_at', 'seconds' => 60], $data['expires_after']);
            $session = $data['session'] ?? [];
            $this->assertSame('realtime', $session['type']);
            $this->assertSame(['audio'], $session['output_modalities']);
            $this->assertSame('alloy', $session['audio']['output']['voice']);
            $this->assertSame(['model' => 'whisper-1', 'language' => 'fr'], $session['audio']['input']['transcription']);
            $this->assertSame(['type' => 'semantic_vad', 'eagerness' => 'low'], $session['audio']['input']['turn_detection']);
            $this->assertStringContainsString('Always speak and respond in French', $session['instructions']);
            $this->assertStringContainsString('Venue knowledge.', $session['instructions']);
            $this->assertStringNotContainsString('FOREIGN', $session['instructions']);
            foreach (['modalities', 'voice', 'temperature', 'input_audio_transcription', 'turn_detection'] as $legacy) {
                $this->assertArrayNotHasKey($legacy, $session);
            }
            return $request->url() === self::UPSTREAM && ! $request->hasHeader('OpenAI-Beta')
                && $request->hasHeader('Authorization', 'Bearer test-server-only-key');
        });
    }

    #[DataProvider('models')]
    public function test_only_retired_models_are_replaced_without_updating_saved_settings(?string $stored, string $expected): void
    {
        DB::table('voice_agent_configs')->update(['realtime_model' => $stored]);
        $this->success();
        $this->postJson(self::ENDPOINT)->assertOk()->assertJsonPath('model', $expected);
        Http::assertSent(fn ($request) => $request['session']['model'] === $expected);
        $this->assertSame($stored, DB::table('voice_agent_configs')->value('realtime_model'));
    }

    public static function models(): array
    {
        return [[null, 'gpt-realtime-1.5'], ['gpt-4o-realtime-preview-2025-06-03', 'gpt-realtime-1.5'],
            ['gpt-4o-mini-realtime-preview-2024-12-17', 'gpt-realtime-mini'],
            ['gpt-realtime-1.5', 'gpt-realtime-1.5'], ['gpt-realtime-mini', 'gpt-realtime-mini'],
            ['custom-realtime-model', 'custom-realtime-model']];
    }

    public function test_tts_only_voice_uses_supported_voice_and_auto_language_omits_transcription_hint(): void
    {
        DB::table('voice_agent_configs')->update(['voice' => 'nova', 'language' => 'auto']);
        $this->success();
        $this->postJson(self::ENDPOINT)->assertOk()->assertJsonPath('voice', 'alloy');
        Http::assertSent(fn ($request) => $request['session']['audio']['output']['voice'] === 'alloy'
            && ! isset($request['session']['audio']['input']['transcription']['language']));
        $this->assertSame('nova', DB::table('voice_agent_configs')->value('voice'));
    }

    public function test_invalid_keys_and_disabled_voice_do_not_call_openai(): void
    {
        foreach (['invalid-key', 'undefined', 'null'] as $key) {
            $this->getJson('/api/v1/widget/'.$key.'/config')->assertNotFound();
            $this->postJson('/api/v1/widget/'.$key.'/realtime-session')->assertNotFound();
        }
        DB::table('voice_agent_configs')->update(['realtime_enabled' => false]);
        $this->postJson(self::ENDPOINT)->assertForbidden();
        DB::table('voice_agent_configs')->update(['realtime_enabled' => true, 'is_active' => false]);
        $this->postJson(self::ENDPOINT)->assertForbidden();
        DB::table('chat_widget_configs')->update(['is_active' => false]);
        $this->postJson(self::ENDPOINT)->assertNotFound();
        Http::assertNothingSent();
    }

    public function test_upstream_rejection_is_a_failure_with_safe_diagnostics_and_no_raw_body(): void
    {
        Log::spy();
        Http::fake([self::UPSTREAM => Http::response(['error' => ['message' => 'PRIVATE-UPSTREAM-TEXT',
            'code' => 'model_not_found', 'type' => 'invalid_request_error', 'param' => 'session.model']], 400,
            ['x-request-id' => 'req-test-123'])]);
        $this->postJson(self::ENDPOINT)->assertStatus(502)->assertJsonPath('upstream_status', 400)
            ->assertJsonMissingPath('client_secret')->assertDontSee('PRIVATE-UPSTREAM-TEXT');
        Log::shouldHaveReceived('warning')->once()->with('widget.realtime_session.failed',
            \Mockery::on(fn ($context) => $context['status'] === 400 && $context['reason'] === 'upstream_rejected'
                && $context['request_id'] === 'req-test-123' && $context['error_code'] === 'model_not_found'
                && ! str_contains(json_encode($context), 'PRIVATE-UPSTREAM-TEXT')));
        Http::assertSentCount(1);
    }

    public function test_connection_errors_return_a_reported_gateway_failure_without_exposing_credentials(): void
    {
        Log::spy();
        $attempts = 0;
        Http::fake(function () use (&$attempts) {
            $attempts++;
            throw new ConnectionException('PRIVATE CONNECTION CREDENTIAL');
        });
        $this->postJson(self::ENDPOINT)->assertStatus(502)->assertJsonMissingPath('client_secret')
            ->assertDontSee('PRIVATE CONNECTION CREDENTIAL');
        Log::shouldHaveReceived('warning')->once()->with('widget.realtime_session.failed',
            \Mockery::on(fn ($context) => $context['reason'] === 'connection_failed'));
        $this->assertSame(1, $attempts);
    }

    public function test_malformed_success_payloads_are_never_reported_as_connected(): void
    {
        foreach ([[], ['value' => ''], ['value' => ['not-a-token']], ['value' => 'a-secret'],
            ['value' => 'a-secret', 'expires_at' => now()->subSecond()->timestamp]] as $payload) {
            Http::fake([self::UPSTREAM => Http::response($payload)]);
            $this->postJson(self::ENDPOINT)->assertStatus(502)->assertJsonMissingPath('client_secret')
                ->assertDontSee('a-secret');
        }
    }

    private function success(): void
    {
        Http::fake([self::UPSTREAM => Http::response(['value' => 'ephemeral-test-secret',
            'expires_at' => now()->addMinute()->timestamp, 'session' => ['id' => 'sess-test']])]);
    }
}
