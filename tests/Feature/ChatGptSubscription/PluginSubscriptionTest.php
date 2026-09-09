<?php

namespace Tests\Feature\ChatGptSubscription;

use App\Http\Controllers\Api\Internal\InternalEntitlementController;
use App\Http\Middleware\Plugin\CheckPluginSubscription;
use App\Models\Organization;
use App\Models\User;
use App\OAuth\PluginSubscriptionCache;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Http\Request;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Sleep;
use Symfony\Component\HttpFoundation\Response;
use Tests\TestCase;

class PluginSubscriptionTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        config([
            'services.saas.api_url' => 'https://billing.example.test/api',
            'services.saas.jwt_secret' => 'test-signature-key',
            'chatgpt.billing_user_ids' => [],
            'chatgpt.subscription_max_age_seconds' => 300,
        ]);
        Schema::create('organizations', function (Blueprint $table): void {
            $table->id();
            $table->string('name');
            $table->boolean('is_active')->default(true);
            $table->string('saas_org_id')->nullable();
            $table->timestamp('saas_deleted_at')->nullable();
            $table->string('subscription_status')->nullable();
            $table->string('plan_slug')->nullable();
            $table->timestamp('trial_end')->nullable();
            $table->timestamp('period_end')->nullable();
            $table->timestamp('entitlements_synced_at')->nullable();
            $table->json('plan_features')->nullable();
            $table->json('entitled_products')->nullable();
            $table->timestamps();
        });
        Schema::create('users', function (Blueprint $table): void {
            $table->id();
            $table->string('name');
            $table->string('email');
            $table->string('user_type');
            $table->unsignedBigInteger('organization_id');
            $table->timestamps();
        });
        Schema::create('staff', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('user_id');
            $table->unsignedBigInteger('organization_id');
            $table->boolean('is_active')->default(true);
        });
        DB::table('organizations')->insert([
            'id' => 1, 'name' => 'Business', 'saas_org_id' => 'org-a',
            'subscription_status' => 'ACTIVE', 'plan_features' => '{"crm":"true"}',
            'plan_slug' => 'growth', 'entitled_products' => '["crm"]',
            'entitlements_synced_at' => now()->subDay(),
        ]);
        $this->staffUser(7, 1, 'staff@example.test');
        $this->staffUser(8, 1, 'other@example.test');
        $this->staffUser(9, 1, 'owner@example.test');
    }

    public function test_fresh_shared_entitlements_never_replace_independent_billing_verification(): void
    {
        DB::table('organizations')->update(['entitlements_synced_at' => now()]);
        $before = Organization::findOrFail(1)->getAttributes();
        $this->billing(null);

        $this->assertSame(403, $this->checkSubscription()->getStatusCode());
        Http::assertSentCount(2);
        // A legacy SPA sync may preserve ACTIVE while advancing its timestamp.
        // The plugin denies access without changing that existing infrastructure.
        $this->assertSame($before, Organization::findOrFail(1)->getAttributes());
    }

    public function test_billing_uses_separate_signed_authentication_without_changing_tool_identity(): void
    {
        $before = Organization::findOrFail(1)->getAttributes();
        $this->billing('ACTIVE');
        $response = $this->checkSubscription();
        $this->assertSame(200, $response->getStatusCode());
        $this->assertSame(7, json_decode($response->getContent(), true)['user_id']);
        Http::assertSent(fn ($request) => str_ends_with($request->url(), '/auth/service-token')
            && $request->hasHeader('X-Service-Signature', hash_hmac('sha256', 'staff@example.test|org-a', 'test-signature-key'))
            && $request['email'] === 'staff@example.test' && $request['orgId'] === 'org-a');
        Http::assertSent(fn ($request) => str_ends_with($request->url(), '/tools/bootstrap')
            && $request->hasHeader('Authorization', 'Bearer separate-service-test-token'));
        Http::assertNotSent(fn ($request) => $request->hasHeader('Authorization', 'Bearer mcp-only-test-token'));
        $this->assertSame($before, Organization::findOrFail(1)->getAttributes());
    }

    public function test_verified_snapshot_is_reused_for_the_same_requesting_user(): void
    {
        $this->billing('ACTIVE');
        $this->assertSame(200, $this->checkSubscription()->getStatusCode());
        $this->assertSame(200, $this->checkSubscription()->getStatusCode());
        Http::assertSentCount(2);
    }

    public function test_snapshot_expiry_is_capped_at_five_minutes_despite_fresh_shared_timestamp(): void
    {
        config(['chatgpt.subscription_max_age_seconds' => 86400]);
        Http::fake([
            '*/auth/service-token' => Http::response(['token' => 'test-token']),
            '*/tools/bootstrap' => Http::sequence()
                ->push(['subscription' => ['status' => 'ACTIVE']])
                ->push(['subscription' => null]),
        ]);
        $this->assertSame(200, $this->checkSubscription()->getStatusCode());

        $this->travel(301)->seconds();
        DB::table('organizations')->update(['entitlements_synced_at' => now()]);
        $this->assertSame(403, $this->checkSubscription()->getStatusCode());
        Http::assertSentCount(4);
        $this->assertSame('ACTIVE', Organization::findOrFail(1)->subscription_status);
    }

    public function test_signed_webhook_invalidates_existing_plugin_snapshot(): void
    {
        Http::fake([
            '*/auth/service-token' => Http::response(['token' => 'test-token']),
            '*/tools/bootstrap' => Http::sequence()
                ->push(['subscription' => ['status' => 'ACTIVE']])
                ->push(['subscription' => null]),
        ]);
        $this->assertSame(200, $this->checkSubscription()->getStatusCode());
        $version = PluginSubscriptionCache::version(1);
        $this->assertSame(200, $this->bust()->getStatusCode());
        $this->assertNotSame($version, PluginSubscriptionCache::version(1));
        $this->assertSame(403, $this->checkSubscription()->getStatusCode());
        Http::assertSentCount(4);
    }

    public function test_webhook_during_refresh_rejects_late_active_response_and_refetches(): void
    {
        $bootstrapCalls = 0;
        Http::fake(function ($request) use (&$bootstrapCalls) {
            if (str_ends_with($request->url(), '/auth/service-token')) {
                return Http::response(['token' => 'test-token']);
            }
            $bootstrapCalls++;
            if ($bootstrapCalls === 1) {
                $this->assertSame(200, $this->bust()->getStatusCode());

                return Http::response(['subscription' => ['status' => 'ACTIVE']]);
            }

            return Http::response(['subscription' => null]);
        });

        $this->assertSame(503, $this->checkSubscription()->getStatusCode());
        $this->assertSame(403, $this->checkSubscription()->getStatusCode());
        $this->assertSame(2, $bootstrapCalls);
        $this->assertNull(Organization::findOrFail(1)->entitlements_synced_at);
    }

    public function test_missing_version_key_cannot_resurrect_a_pre_invalidation_snapshot(): void
    {
        Http::fake([
            '*/auth/service-token' => Http::response(['token' => 'test-token']),
            '*/tools/bootstrap' => Http::sequence()
                ->push(['subscription' => ['status' => 'ACTIVE']])
                ->push(['subscription' => null]),
        ]);
        $this->assertSame(200, $this->checkSubscription()->getStatusCode());
        $this->assertSame(200, $this->bust()->getStatusCode());
        // Cache eviction can remove the version independently of old snapshots.
        Cache::forget('chatgpt.subscription-version:1');
        $this->assertSame(403, $this->checkSubscription()->getStatusCode());
        Http::assertSentCount(4);
    }

    public function test_no_subscription_or_cancellation_is_cached_as_denied_without_org_mutation(): void
    {
        $before = Organization::findOrFail(1)->getAttributes();
        $this->billing('CANCELED');
        $this->assertSame(403, $this->checkSubscription()->getStatusCode());
        $this->assertSame(403, $this->checkSubscription()->getStatusCode());
        Http::assertSentCount(2);
        $this->assertSame($before, Organization::findOrFail(1)->getAttributes());
    }

    public function test_user_specific_failure_backoff_does_not_block_other_staff(): void
    {
        Http::fake(function ($request) {
            if (str_ends_with($request->url(), '/auth/service-token')) {
                return $request['email'] === 'staff@example.test'
                    ? Http::response(['error' => 'Not a member'], 403)
                    : Http::response(['token' => 'test-token']);
            }

            return Http::response(['subscription' => ['status' => 'ACTIVE']]);
        });
        $this->assertSame(503, $this->checkSubscription(7)->getStatusCode());
        $this->assertSame(503, $this->checkSubscription(7)->getStatusCode());
        $this->assertSame(200, $this->checkSubscription(8)->getStatusCode());
        Http::assertSentCount(3);
        $this->assertSame('ACTIVE', Organization::findOrFail(1)->subscription_status);
    }

    public function test_inflight_lock_for_one_user_does_not_block_another(): void
    {
        config(['chatgpt.subscription_lock_wait_seconds' => 0]);
        $key = PluginSubscriptionCache::snapshotKey(1, 7, 7, PluginSubscriptionCache::version(1));
        $lock = Cache::lock($key.':lock', 15);
        $this->assertTrue($lock->get());
        $this->billing('ACTIVE');

        try {
            $this->assertSame(503, $this->checkSubscription(7)->getStatusCode());
            $this->assertSame(200, $this->checkSubscription(8)->getStatusCode());
            Http::assertSentCount(2);
        } finally {
            $lock->release();
        }
    }

    public function test_transient_service_connection_failure_is_retried_without_changing_identity(): void
    {
        Sleep::fake();
        $attempts = 0;
        Http::fake(function ($request) use (&$attempts) {
            if (str_ends_with($request->url(), '/auth/service-token')) {
                if (++$attempts === 1) {
                    throw new ConnectionException('Private upstream URL and credentials must not be exposed.');
                }
                return Http::response(['token' => 'separate-service-test-token']);
            }
            return Http::response(['subscription' => ['status' => 'ACTIVE']]);
        });
        try {
            $response = $this->checkSubscription();
            $this->assertSame(200, $response->getStatusCode());
            $this->assertSame(7, json_decode($response->getContent(), true)['user_id']);
            $this->assertSame(2, $attempts);
            $this->assertSame(200, $this->checkSubscription()->getStatusCode());
            $this->assertSame(2, $attempts);
            Http::assertNotSent(fn ($request) => $request->hasHeader('Authorization', 'Bearer mcp-only-test-token'));
        } finally {
            Sleep::fake(false);
        }
    }

    public function test_transient_bootstrap_server_failure_is_retried_and_cancellation_still_denies(): void
    {
        Sleep::fake();
        Http::fake([
            '*/auth/service-token' => Http::response(['token' => 'test-token']),
            '*/tools/bootstrap' => Http::sequence()->push([], 503)
                ->push(['subscription' => ['status' => 'CANCELED']]),
        ]);
        try {
            $this->assertSame(403, $this->checkSubscription()->getStatusCode());
            Http::assertSentCount(3);
        } finally {
            Sleep::fake(false);
        }
    }

    public function test_waiting_request_reuses_concurrent_snapshot_or_failure_without_another_fetch(): void
    {
        foreach ([true, false] as $successful) {
            PluginSubscriptionCache::invalidate(1);
            $key = PluginSubscriptionCache::snapshotKey(1, 7, 7, PluginSubscriptionCache::version(1));
            $lock = Cache::lock($key.':lock', 30);
            $this->assertTrue($lock->get());
            Sleep::fake(true, true);
            Sleep::whenFakingSleep(function () use ($key, $lock, $successful) {
                Cache::put($successful ? $key : $key.':unavailable',
                    $successful ? ['status' => 'ACTIVE', 'trial_end' => null] : true, 30);
                $lock->release();
            });
            try {
                $this->assertSame($successful ? 200 : 503, $this->checkSubscription()->getStatusCode());
                Http::assertNothingSent();
            } finally {
                $lock->release();
                Sleep::fake(false);
                $this->travelBack();
            }
        }
    }

    public function test_tool_call_verification_failure_is_an_actionable_tool_error_without_executing_it(): void
    {
        config(['services.saas.jwt_secret' => '']);
        $request = Request::create('/mcp', 'POST', server: ['CONTENT_TYPE' => 'application/json'], content: json_encode([
            'jsonrpc' => '2.0', 'id' => 'lead-check', 'method' => 'tools/call',
            'params' => ['name' => 'list_leads', 'arguments' => []],
        ]));
        $request->setUserResolver(fn () => User::findOrFail(7));
        $executed = false;
        $response = app(CheckPluginSubscription::class)->handle($request, function () use (&$executed) {
            $executed = true;
            return response()->json(['unexpected' => true]);
        });
        $data = json_decode($response->getContent(), true);
        $this->assertFalse($executed);
        $this->assertSame(200, $response->getStatusCode());
        $this->assertSame('lead-check', $data['id']);
        $this->assertTrue($data['result']['isError']);
        $this->assertStringContainsString('30 seconds', $data['result']['content'][0]['text']);
        $this->assertStringContainsString('not run', $data['result']['content'][0]['text']);
        $this->assertSame('30', $response->headers->get('Retry-After'));
        Http::assertNothingSent();
    }

    public function test_exhausted_connections_back_off_without_disclosing_exception_details(): void
    {
        Sleep::fake();
        $attempts = 0;
        Http::fake(function () use (&$attempts) {
            $attempts++;
            throw new ConnectionException('PRIVATE-UPSTREAM-CREDENTIAL');
        });
        try {
            foreach ([1, 2] as $call) {
                $response = $this->checkSubscription();
                $this->assertSame(503, $response->getStatusCode());
                $this->assertSame(2, $attempts);
                $this->assertStringNotContainsString('PRIVATE-UPSTREAM-CREDENTIAL', $response->getContent());
            }
        } finally {
            Sleep::fake(false);
        }
    }

    public function test_unavailable_discovery_notifications_and_malformed_calls_keep_transport_failure(): void
    {
        config(['services.saas.jwt_secret' => '']);
        foreach ([
            ['jsonrpc' => '2.0', 'id' => 1, 'method' => 'initialize'],
            ['jsonrpc' => '2.0', 'method' => 'notifications/initialized'],
            ['jsonrpc' => '2.0', 'id' => 2, 'method' => 'tools/call'],
            ['jsonrpc' => '2.0', 'id' => 3, 'method' => 'tools/call', 'params' => ['name' => 'list_leads', 'arguments' => 'bad']],
        ] as $payload) {
            $request = Request::create('/mcp', 'POST', server: ['CONTENT_TYPE' => 'application/json'], content: json_encode($payload));
            $request->setUserResolver(fn () => User::findOrFail(7));
            $response = app(CheckPluginSubscription::class)->handle($request, fn () => $this->fail('No downstream execution is allowed.'));
            $this->assertSame(503, $response->getStatusCode());
            $this->assertSame('subscription_unavailable', json_decode($response->getContent(), true)['error']);
        }
        Http::assertNothingSent();
    }

    public function test_active_same_org_billing_principal_supports_local_staff_without_replacing_identity(): void
    {
        config(['chatgpt.billing_user_ids' => [9]]);
        $this->billing('ACTIVE');
        $response = $this->checkSubscription(7);
        $this->assertSame(200, $response->getStatusCode());
        $this->assertSame(7, json_decode($response->getContent(), true)['user_id']);
        Http::assertSent(fn ($request) => str_ends_with($request->url(), '/auth/service-token')
            && $request['email'] === 'owner@example.test' && $request['orgId'] === 'org-a'
            && $request->hasHeader('X-Service-Signature', hash_hmac('sha256', 'owner@example.test|org-a', 'test-signature-key')));
        $this->assertSame(1, User::findOrFail(7)->organization_id);
    }

    public function test_cross_org_inactive_member_and_mismatched_staff_principals_are_excluded(): void
    {
        DB::table('users')->where('id', 9)->update(['organization_id' => 20]);
        DB::table('staff')->where('user_id', 9)->update(['organization_id' => 20]);
        $this->staffUser(10, 1, 'inactive@example.test', ['is_active' => false]);
        $this->staffUser(11, 1, 'member@example.test');
        DB::table('users')->where('id', 11)->update(['user_type' => 'member']);
        $this->staffUser(12, 1, 'wrong-staff-org@example.test', ['organization_id' => 20]);
        config(['chatgpt.billing_user_ids' => [9, 10, 11, 12]]);
        $this->billing('ACTIVE');

        $this->assertSame(200, $this->checkSubscription(7)->getStatusCode());
        Http::assertSent(fn ($request) => str_ends_with($request->url(), '/auth/service-token')
            && $request['email'] === 'staff@example.test' && $request['orgId'] === 'org-a');
        Http::assertSentCount(2);
    }

    public function test_changed_billing_principal_does_not_reuse_old_snapshot(): void
    {
        config(['chatgpt.billing_user_ids' => [9]]);
        $this->billing('ACTIVE');
        $this->assertSame(200, $this->checkSubscription()->getStatusCode());
        DB::table('staff')->where('user_id', 9)->update(['is_active' => false]);
        $this->assertSame(200, $this->checkSubscription()->getStatusCode());
        Http::assertSentCount(4);
        Http::assertSent(fn ($request) => str_ends_with($request->url(), '/auth/service-token')
            && $request['email'] === 'staff@example.test');
    }

    public function test_malformed_bootstrap_payloads_fail_closed(): void
    {
        $payload = [];
        Http::fake(function ($request) use (&$payload) {
            return str_ends_with($request->url(), '/auth/service-token')
                ? Http::response(['token' => 'test-token'])
                : Http::response($payload);
        });
        foreach ([
            ['features' => []],
            ['subscription' => 'ACTIVE'],
            ['subscription' => ['status' => 'ACTIVE', 'trialEnd' => []]],
            ['subscription' => ['status' => 'TRIALING', 'trialEnd' => 'invalid-date-value']],
        ] as $payload) {
            PluginSubscriptionCache::invalidate(1);
            $this->assertSame(503, $this->checkSubscription()->getStatusCode());
        }
        Http::assertSentCount(8);
    }

    public function test_remote_trial_expiry_is_enforced_even_with_cached_trial_snapshot(): void
    {
        $this->billing('TRIALING', now()->addMinute()->toIso8601String());
        $this->assertSame(200, $this->checkSubscription()->getStatusCode());
        $this->travel(61)->seconds();
        $this->assertSame(403, $this->checkSubscription()->getStatusCode());
        Http::assertSentCount(2);
    }

    public function test_standalone_subscription_and_trial_expiry_are_enforced_without_billing_calls(): void
    {
        DB::table('organizations')->update(['saas_org_id' => null, 'subscription_status' => 'TRIALING', 'trial_end' => now()->subDay()]);
        $this->assertSame(403, $this->checkSubscription()->getStatusCode());
        DB::table('organizations')->update(['trial_end' => now()->addDay()]);
        $this->assertSame(200, $this->checkSubscription()->getStatusCode());
        DB::table('organizations')->update(['is_active' => false]);
        $this->assertSame(403, $this->checkSubscription()->getStatusCode());
        Http::assertNothingSent();
    }

    public function test_missing_billing_configuration_fails_closed_without_network_requests(): void
    {
        config(['services.saas.jwt_secret' => '']);
        $this->assertSame(503, $this->checkSubscription()->getStatusCode());
        Http::assertNothingSent();
    }

    public function test_invalid_webhook_signature_cannot_invalidate_verified_snapshot(): void
    {
        $version = PluginSubscriptionCache::version(1);
        $this->assertSame(401, $this->bust('invalid-signature')->getStatusCode());
        $this->assertSame($version, PluginSubscriptionCache::version(1));
    }

    private function checkSubscription(int $userId = 7): Response
    {
        $request = Request::create('/mcp', 'POST', server: ['HTTP_AUTHORIZATION' => 'Bearer mcp-only-test-token']);
        $request->setUserResolver(fn () => User::findOrFail($userId));

        return app(CheckPluginSubscription::class)->handle($request,
            fn (Request $request) => response()->json(['ok' => true, 'user_id' => $request->user()->id]));
    }

    private function billing(?string $status, ?string $trialEnd = null): void
    {
        Http::fake([
            'https://billing.example.test/api/auth/service-token' => Http::response(['token' => 'separate-service-test-token']),
            'https://billing.example.test/api/tools/bootstrap' => Http::response([
                'subscription' => $status === null ? null : ['status' => $status, 'trialEnd' => $trialEnd, 'plan' => ['slug' => 'enterprise']],
                'features' => [], 'entitled_product_slugs' => [],
            ]),
        ]);
    }

    private function staffUser(int $id, int $orgId, string $email, array $staffOverride = []): void
    {
        DB::table('users')->insert(['id' => $id, 'name' => 'Test Staff', 'email' => $email,
            'user_type' => 'staff', 'organization_id' => $orgId]);
        DB::table('staff')->insert(array_merge(['user_id' => $id, 'organization_id' => $orgId, 'is_active' => true], $staffOverride));
    }

    private function bust(?string $signature = null): Response
    {
        $body = json_encode(['saas_org_id' => 'org-a']);
        $request = Request::create('/api/internal/entitlements/bust', 'POST', server: [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_X_SIGNATURE' => $signature ?? hash_hmac('sha256', $body, 'test-signature-key'),
        ], content: $body);

        return app(InternalEntitlementController::class)->bust($request);
    }
}
