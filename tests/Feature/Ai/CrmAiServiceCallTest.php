<?php

namespace Tests\Feature\Ai;

use App\Exceptions\AiModelNotAllowed;
use App\Models\AiUsageLog;
use App\Models\Organization;
use App\Services\CrmAiService;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Http;
use ReflectionMethod;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks CrmAiService::call — the admin AI Claude HTTP path.
 * Used by the admin AI chat (35+ tools) AND the public chat
 * widget's lead-extraction path. The retry + usage tracking
 * has been the cause of multiple Nightwatch incidents per the
 * docblock comments; locking the behaviour pins these fixes.
 *
 * Why this matters more than most HTTP-mocked tests:
 *
 *   - The retry loop's `usleep($attempt * 500_000)` for connection
 *     failures + `sleep($delay)` for 429 mean a bad implementation
 *     could ddos itself or hang. Retry budget + max-attempts is
 *     real money.
 *   - AiUsageService::recordUsage feeds the per-org plan cap.
 *     A regression that drops usage tracking breaks billing.
 *   - The "no service-level admin_ai gate" comment is documented
 *     as the fix for a CRITICAL incident that broke public lead
 *     capture for every Starter/Growth tenant. Lock the absence
 *     of that gate.
 *   - AiModelNotAllowed throws at call() entry when the org's
 *     plan_features.ai_allowed_models doesn't include the model.
 *     Without this, restricted-plan orgs would hit Anthropic +
 *     pay for tokens they're not entitled to.
 *
 * call() is private; tests invoke via ReflectionMethod since
 * promoting to public would expand the API surface unnecessarily
 * — chat()/extractLead()/etc. are the documented public entry
 * points.
 */
class CrmAiServiceCallTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private CrmAiService $service;
    private ReflectionMethod $call;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAiUsageSchema();

        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);

        // Config the service: API key + model. The constructor
        // reads these once.
        config([
            'services.anthropic.api_key' => 'sk-ant-test',
            'services.anthropic.model'   => 'claude-sonnet-test',
        ]);

        $this->service = new CrmAiService();
        $this->call = new ReflectionMethod($this->service, 'call');
        $this->call->setAccessible(true);
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        parent::tearDown();
    }

    private function invoke(array $messages = [], string $system = 'You are helpful', array $tools = []): array
    {
        return $this->call->invokeArgs(
            $this->service,
            [$system, $messages, $tools, null],
        );
    }

    public function test_successful_response_returns_decoded_json_and_records_usage(): void
    {
        // The happy path: 200 returns the Anthropic JSON verbatim
        // AND records a row in ai_usage_logs with the model name
        // + token counts + feature='crm_chat'.
        Http::fake([
            'api.anthropic.com/*' => Http::response([
                'content' => [['type' => 'text', 'text' => 'Hello back']],
                'usage'   => ['input_tokens' => 12, 'output_tokens' => 8],
            ], 200),
        ]);

        $result = $this->invoke([
            ['role' => 'user', 'content' => 'hi'],
        ]);

        $this->assertSame('Hello back', $result['content'][0]['text']);

        $usage = AiUsageLog::first();
        $this->assertNotNull($usage,
            'Successful call must record an ai_usage_logs row.');
        $this->assertSame('claude-sonnet-test', $usage->model);
        $this->assertSame(12, (int) $usage->input_tokens);
        $this->assertSame(8, (int) $usage->output_tokens);
        $this->assertSame('crm_chat', $usage->feature);
    }

    public function test_429_triggers_retry_then_succeeds(): void
    {
        // The canonical rate-limit recovery path. First call 429
        // (Anthropic ratelimit), retry succeeds.
        Http::fakeSequence('api.anthropic.com/*')
            ->push('', 429, ['retry-after' => '1'])
            ->push([
                'content' => [['type' => 'text', 'text' => 'OK now']],
                'usage'   => ['input_tokens' => 5, 'output_tokens' => 3],
            ], 200);

        $result = $this->invoke([['role' => 'user', 'content' => 'try']]);

        $this->assertSame('OK now', $result['content'][0]['text']);
        Http::assertSentCount(2);
    }

    public function test_500_triggers_retry_then_succeeds(): void
    {
        // 500 (server error) — retried per the docblock contract.
        Http::fakeSequence('api.anthropic.com/*')
            ->push('Server error', 500)
            ->push([
                'content' => [['type' => 'text', 'text' => 'Recovered']],
                'usage'   => ['input_tokens' => 1, 'output_tokens' => 1],
            ], 200);

        $result = $this->invoke([['role' => 'user', 'content' => 'x']]);

        $this->assertSame('Recovered', $result['content'][0]['text']);
        Http::assertSentCount(2);
    }

    public function test_529_overloaded_triggers_retry(): void
    {
        // 529 is Anthropic's "we're overloaded" — same treatment
        // as 429+500 per the docblock.
        Http::fakeSequence('api.anthropic.com/*')
            ->push('overloaded', 529)
            ->push([
                'content' => [['type' => 'text', 'text' => 'OK']],
                'usage'   => ['input_tokens' => 1, 'output_tokens' => 1],
            ], 200);

        $result = $this->invoke([['role' => 'user', 'content' => 'x']]);

        $this->assertSame('OK', $result['content'][0]['text']);
        Http::assertSentCount(2);
    }

    public function test_4xx_non_429_does_not_retry(): void
    {
        // Critical: a 400/401/403 etc must NOT retry. They reflect
        // a real client problem (bad API key, malformed request,
        // missing field) that retry can't fix.
        Http::fake([
            'api.anthropic.com/*' => Http::response('Bad request', 400),
        ]);

        $result = $this->invoke([['role' => 'user', 'content' => 'x']]);

        // No exception — the service returns a graceful text fallback.
        $this->assertStringContainsString('API error 400',
            $result['content'][0]['text']);
        Http::assertSentCount(1);
    }

    public function test_400_response_text_carries_body_preview(): void
    {
        // The body preview (first 500 chars) must surface in the
        // graceful fallback text so logs/audit show WHY.
        Http::fake([
            'api.anthropic.com/*' => Http::response(
                '{"error":{"type":"invalid_request_error","message":"missing field: model"}}',
                400,
            ),
        ]);

        $result = $this->invoke([['role' => 'user', 'content' => 'x']]);

        $this->assertStringContainsString('missing field: model',
            $result['content'][0]['text'],
            'Error fallback must include the body preview.');
    }

    public function test_exhausted_retries_return_graceful_fallback_text(): void
    {
        // Persistent 500s — exhaust the 3 attempts. Must NOT
        // throw; returns a text-only content block so the
        // upstream chat() method renders a graceful "AI service
        // unreachable" message to the admin.
        Http::fake([
            'api.anthropic.com/*' => Http::response('persistent', 500),
        ]);

        $result = $this->invoke([['role' => 'user', 'content' => 'x']]);

        $this->assertArrayHasKey('content', $result);
        $this->assertSame('text', $result['content'][0]['type']);

        // 3 attempts total.
        Http::assertSentCount(3);
    }

    public function test_AiModelNotAllowed_throws_when_plan_does_not_include_model(): void
    {
        // The plan-cap gate: the org's plan_features.ai_allowed_models
        // is a restricted list. The current $this->model isn't in
        // it. call() must throw AiModelNotAllowed BEFORE hitting
        // Anthropic.
        $org = Organization::find(app('current_organization_id'));
        // plan_features is array-cast on the model; pass the
        // actual array (NOT json_encode'd) so the cast handles
        // serialization on save.
        $org->forceFill([
            'plan_features' => ['ai_allowed_models' => ['claude-haiku-only']],
        ])->save();

        // Refresh container binding so the AiUsageService picks up
        // the updated org row (not cached state).
        app()->forgetInstance('current_organization_id');
        app()->instance('current_organization_id', $org->id);

        // No HTTP::fake — if we accidentally make the call, the
        // test framework's Http guard will surface it.
        $this->expectException(AiModelNotAllowed::class);

        $this->invoke([['role' => 'user', 'content' => 'x']]);
    }

    public function test_no_model_restriction_when_ai_allowed_models_is_empty(): void
    {
        // Empty allowlist = no restriction (the back-compat
        // default). The call MUST proceed.
        $org = Organization::find(app('current_organization_id'));
        $org->forceFill([
            'plan_features' => ['ai_allowed_models' => []],
        ])->save();

        Http::fake([
            'api.anthropic.com/*' => Http::response([
                'content' => [['type' => 'text', 'text' => 'OK']],
                'usage'   => ['input_tokens' => 1, 'output_tokens' => 1],
            ], 200),
        ]);

        $result = $this->invoke([['role' => 'user', 'content' => 'x']]);

        $this->assertSame('OK', $result['content'][0]['text']);
    }

    public function test_no_service_level_admin_ai_gate_per_docblock(): void
    {
        // CRITICAL regression guard: the docblock explicitly
        // documents that the service-level admin_ai gate was a
        // mistake — it broke lead extraction for every
        // Starter/Growth tenant's PUBLIC chat widget. The gate
        // lives at the route middleware now, not here. Test that
        // call() runs for an org WITHOUT the admin_ai feature.
        $org = Organization::find(app('current_organization_id'));
        $org->forceFill([
            'plan_features' => [
                'admin_ai' => false,
                // ai_allowed_models absent = no restriction
            ],
        ])->save();

        Http::fake([
            'api.anthropic.com/*' => Http::response([
                'content' => [['type' => 'text', 'text' => 'still works']],
                'usage'   => ['input_tokens' => 1, 'output_tokens' => 1],
            ], 200),
        ]);

        // MUST NOT throw FeatureNotEntitled — the docblock
        // explicitly says the service-level gate was a mistake.
        $result = $this->invoke([['role' => 'user', 'content' => 'x']]);

        $this->assertSame('still works', $result['content'][0]['text']);
    }

    public function test_request_body_includes_model_messages_and_system(): void
    {
        // Request shape contract: the POST body to Anthropic
        // includes the model + messages + system + max_tokens.
        // Tools array is only added when non-empty.
        Http::fake([
            'api.anthropic.com/*' => Http::response([
                'content' => [['type' => 'text', 'text' => 'OK']],
                'usage'   => ['input_tokens' => 1, 'output_tokens' => 1],
            ], 200),
        ]);

        $this->invoke(
            [['role' => 'user', 'content' => 'hello']],
            'You are a helpful CRM assistant',
        );

        Http::assertSent(function ($request) {
            $body = $request->data();
            return $body['model']       === 'claude-sonnet-test'
                && $body['system']      === 'You are a helpful CRM assistant'
                && $body['max_tokens']  === 4096
                && $body['messages'][0]['content'] === 'hello'
                && !array_key_exists('tools', $body); // empty tools omitted
        });
    }

    public function test_request_includes_tools_when_provided(): void
    {
        // When tools are passed, they appear in the request body.
        Http::fake([
            'api.anthropic.com/*' => Http::response([
                'content' => [['type' => 'text', 'text' => 'OK']],
                'usage'   => ['input_tokens' => 1, 'output_tokens' => 1],
            ], 200),
        ]);

        $tools = [['name' => 'sample_tool', 'description' => 'test', 'input_schema' => []]];
        $this->invoke([['role' => 'user', 'content' => 'x']], 'sys', $tools);

        Http::assertSent(function ($request) use ($tools) {
            $body = $request->data();
            return ($body['tools'] ?? null) === $tools;
        });
    }

    public function test_request_includes_anthropic_auth_headers(): void
    {
        // Required Anthropic headers: x-api-key + anthropic-version.
        // A regression dropping either bombs with 401.
        Http::fake([
            'api.anthropic.com/*' => Http::response([
                'content' => [['type' => 'text', 'text' => 'OK']],
                'usage'   => ['input_tokens' => 1, 'output_tokens' => 1],
            ], 200),
        ]);

        $this->invoke([['role' => 'user', 'content' => 'x']]);

        Http::assertSent(function ($request) {
            return $request->header('x-api-key')[0] === 'sk-ant-test'
                && $request->header('anthropic-version')[0] === '2023-06-01';
        });
    }
}
