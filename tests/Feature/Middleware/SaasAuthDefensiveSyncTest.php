<?php

namespace Tests\Feature\Middleware;

use App\Http\Middleware\SaasAuthMiddleware;
use App\Models\Organization;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use ReflectionMethod;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks SaasAuthMiddleware::maybeSyncEntitlements() defensive
 * sync (June 7 2026 audit fix).
 *
 * Production incident this guards against:
 *   - SaaS catalog mid-migration / partial outage → bootstrap
 *     returns 200 with `features: {}` for ACTIVE customers
 *   - Pre-fix the loyalty cache was blindly overwritten with
 *     the empty map → every Enterprise customer lost their
 *     full feature set for the 5-min sync window
 *   - 5 minutes is forever in admin SPA terms — sidebar items
 *     disappear, admin AI button vanishes, modal cascade
 *     surfaces 'feature locked' on EVERY restricted route
 *
 * Defense pattern:
 *
 *   subActive = sub != null AND status IN ['ACTIVE', 'TRIALING']
 *
 *   if (!subActive OR featuresArray NOT EMPTY):
 *     plan_features = featuresArray   ← legit cancellation OR fresh data
 *   else:
 *     PRESERVE cache                  ← ACTIVE customer + empty payload =
 *                                       SaaS bug, NOT downgrade
 *
 * Legitimate cancellations (sub=null OR CANCELED/UNPAID/EXPIRED)
 * STILL clear features as expected. Only the active-but-empty
 * case engages the preserve path.
 *
 * The 5-min freshness gate (entitlements_synced_at) is the OTHER
 * half of the contract — fresh orgs skip the HTTP call entirely.
 *
 * Direct ReflectionMethod invocation against the private method
 * keeps tests focused on the algorithm — no JWT generation, no
 * route dispatch.
 */
class SaasAuthDefensiveSyncTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private SaasAuthMiddleware $middleware;
    private ReflectionMethod $reflect;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpMinimalSchema();

        // Minimal-schema orgs table lacks the entitlement columns
        // the middleware reads/writes. Add for this suite.
        if (!Schema::hasColumn('organizations', 'entitlements_synced_at')) {
            Schema::table('organizations', function ($t) {
                $t->timestamp('entitlements_synced_at')->nullable();
            });
        }
        if (!Schema::hasColumn('organizations', 'plan_slug')) {
            Schema::table('organizations', function ($t) {
                $t->string('plan_slug', 32)->nullable();
            });
        }
        if (!Schema::hasColumn('organizations', 'trial_end')) {
            Schema::table('organizations', function ($t) {
                $t->timestamp('trial_end')->nullable();
                $t->timestamp('period_end')->nullable();
                $t->text('entitled_products')->nullable();
            });
        }

        // SaaS API base URL — required, else maybeSyncEntitlements
        // bails before the HTTP call.
        Config::set('services.saas.api_url', 'https://saas.test/api');

        $this->middleware = new SaasAuthMiddleware();
        $this->reflect = new ReflectionMethod($this->middleware, 'maybeSyncEntitlements');
        $this->reflect->setAccessible(true);
    }

    /** Build a Request with a Bearer-token Authorization header. */
    private function requestWithToken(string $token = 'fake-bearer-token'): Request
    {
        $r = Request::create('/v1/admin/whatever', 'GET');
        $r->headers->set('Authorization', "Bearer {$token}");
        return $r;
    }

    /** Build an org that's stale enough to trigger a sync. */
    private function staleOrg(array $attrs = []): Organization
    {
        return OrganizationFactory::new()->create(array_merge([
            'plan_features'           => ['campaigns' => true, 'admin_ai' => true],
            'plan_slug'               => 'enterprise',
            'subscription_status'     => 'ACTIVE',
            'entitlements_synced_at'  => now()->subHour(), // stale: >5min old
        ], $attrs));
    }

    private function invokeSync(Organization $org, ?Request $request = null): void
    {
        $this->reflect->invoke(
            $this->middleware,
            $org,
            $request ?? $this->requestWithToken(),
        );
    }

    /* ─── THE defensive guard — empty features for ACTIVE customer ─── */

    public function test_active_sub_with_empty_features_preserves_cached_entitlements(): void
    {
        // THE critical preservation path. Bootstrap returns 200
        // but `features: {}` while the customer is still on an
        // ACTIVE plan — must be treated as a SaaS bug, NOT a
        // downgrade. Cached features stay intact for the next
        // poll cycle.
        $org = $this->staleOrg([
            'plan_features' => ['campaigns' => true, 'admin_ai' => true],
        ]);

        Http::fake([
            'saas.test/api/tools/bootstrap' => Http::response([
                'subscription' => ['plan' => ['slug' => 'enterprise'], 'status' => 'ACTIVE'],
                'features'     => [], // ← empty payload from SaaS
            ], 200),
        ]);

        $this->invokeSync($org);

        $this->assertSame(
            ['campaigns' => true, 'admin_ai' => true],
            $org->plan_features,
            'CRITICAL: empty features for ACTIVE sub MUST preserve cached entitlements (no nuke during SaaS bug).',
        );
    }

    public function test_trialing_sub_with_empty_features_preserves_cached_entitlements(): void
    {
        // TRIALING is treated as active per the same rule —
        // ?trial customers see the same UX brittleness if
        // sidebar items vanish for 5 min.
        $org = $this->staleOrg([
            'plan_features'       => ['campaigns' => true],
            'subscription_status' => 'TRIALING',
        ]);

        Http::fake([
            'saas.test/api/tools/bootstrap' => Http::response([
                'subscription' => ['plan' => ['slug' => 'growth'], 'status' => 'TRIALING'],
                'features'     => [],
            ], 200),
        ]);

        $this->invokeSync($org);

        $this->assertSame(
            ['campaigns' => true],
            $org->plan_features,
            'TRIALING sub with empty payload MUST preserve cached features.',
        );
    }

    /* ─── Fresh (non-empty) features from SaaS — always written ─── */

    public function test_active_sub_with_non_empty_features_overwrites_cached(): void
    {
        // The normal path: bootstrap returns the real feature map
        // and we cache it. Defensive preservation MUST NOT block
        // legitimate updates.
        $org = $this->staleOrg([
            'plan_features' => ['old_feature' => true],
        ]);

        Http::fake([
            'saas.test/api/tools/bootstrap' => Http::response([
                'subscription' => ['plan' => ['slug' => 'enterprise'], 'status' => 'ACTIVE'],
                'features'     => ['campaigns' => true, 'admin_ai' => true, 'new_feature' => true],
            ], 200),
        ]);

        $this->invokeSync($org);

        $this->assertSame(
            ['campaigns' => true, 'admin_ai' => true, 'new_feature' => true],
            $org->plan_features,
            'Non-empty payload MUST overwrite cache normally.',
        );
    }

    /* ─── Legitimate cancellation — features cleared ─── */

    public function test_canceled_sub_with_empty_features_clears_cache(): void
    {
        // Cancellation IS a legit downgrade. CANCELED + empty
        // features MUST clear the cached map — the customer no
        // longer has access.
        $org = $this->staleOrg([
            'plan_features'       => ['campaigns' => true, 'admin_ai' => true],
            'subscription_status' => 'CANCELED',
        ]);

        Http::fake([
            'saas.test/api/tools/bootstrap' => Http::response([
                'subscription' => ['plan' => ['slug' => null], 'status' => 'CANCELED'],
                'features'     => [],
            ], 200),
        ]);

        $this->invokeSync($org);

        $this->assertSame([], $org->plan_features,
            'CANCELED + empty features MUST clear cache (legit downgrade).');
    }

    public function test_unpaid_sub_with_empty_features_clears_cache(): void
    {
        // Stripe dunning terminal state (UNPAID after retries
        // run out) is also a legit downgrade.
        $org = $this->staleOrg(['plan_features' => ['campaigns' => true]]);

        Http::fake([
            'saas.test/api/tools/bootstrap' => Http::response([
                'subscription' => ['plan' => ['slug' => null], 'status' => 'UNPAID'],
                'features'     => [],
            ], 200),
        ]);

        $this->invokeSync($org);

        $this->assertSame([], $org->plan_features,
            'UNPAID + empty features MUST clear cache.');
    }

    public function test_no_sub_object_in_response_preserves_features_and_status(): void
    {
        // The brief gap between Stripe Checkout success + webhook
        // processing can return a bootstrap response with no
        // `subscription` key. Treat as 'no change' rather than
        // 'downgrade to NO_PLAN'.
        $org = $this->staleOrg([
            'plan_features'       => ['campaigns' => true],
            'subscription_status' => 'ACTIVE',
            'plan_slug'           => 'enterprise',
        ]);

        Http::fake([
            'saas.test/api/tools/bootstrap' => Http::response([
                // no `subscription` key
                'features' => ['new_feature' => true],
            ], 200),
        ]);

        $this->invokeSync($org);

        $this->assertSame('ACTIVE', $org->subscription_status,
            'Missing subscription key MUST NOT null plan_slug/status (Checkout grace window).');
        $this->assertSame('enterprise', $org->plan_slug);
    }

    /* ─── 5-min freshness gate ─── */

    public function test_fresh_org_skips_http_call_entirely(): void
    {
        // entitlements_synced_at < 5min → skip sync, no HTTP call,
        // no state change. Without this gate every request hits
        // SaaS — kills the platform under load.
        $org = $this->staleOrg([
            'entitlements_synced_at' => now()->subMinute(), // fresh: <5min
        ]);

        Http::fake([
            'saas.test/*' => Http::response(['features' => ['new' => true]], 200),
        ]);

        $this->invokeSync($org);

        Http::assertNothingSent();
    }

    public function test_stale_org_triggers_http_call(): void
    {
        // Counterpoint: stale orgs DO sync. Locks the freshness
        // gate is correctly inclusive (>5min triggers).
        $org = $this->staleOrg(['entitlements_synced_at' => now()->subMinutes(10)]);

        Http::fake([
            'saas.test/api/tools/bootstrap' => Http::response([
                'subscription' => ['plan' => ['slug' => 'enterprise'], 'status' => 'ACTIVE'],
                'features'     => ['campaigns' => true],
            ], 200),
        ]);

        $this->invokeSync($org);

        Http::assertSent(fn ($r) => str_contains($r->url(), '/tools/bootstrap'));
    }

    /* ─── Best-effort error handling ─── */

    public function test_5xx_from_saas_preserves_cache_and_does_not_throw(): void
    {
        // SaaS outage MUST NOT throw — best-effort. Cached features
        // stay intact so the admin SPA keeps working.
        $org = $this->staleOrg([
            'plan_features' => ['campaigns' => true, 'admin_ai' => true],
        ]);

        Http::fake([
            'saas.test/api/tools/bootstrap' => Http::response('Internal Server Error', 500),
        ]);

        // Must not throw.
        $this->invokeSync($org);

        $this->assertSame(
            ['campaigns' => true, 'admin_ai' => true],
            $org->plan_features,
            'SaaS 5xx MUST preserve cache.',
        );
    }

    public function test_connection_exception_preserves_cache_and_does_not_throw(): void
    {
        // Network failure mid-call. Same best-effort guarantee.
        $org = $this->staleOrg([
            'plan_features' => ['campaigns' => true],
        ]);

        Http::fake([
            'saas.test/api/tools/bootstrap' => function () {
                throw new \Illuminate\Http\Client\ConnectionException('Network down');
            },
        ]);

        $this->invokeSync($org);

        $this->assertSame(
            ['campaigns' => true],
            $org->plan_features,
        );
    }

    /* ─── Configuration guards ─── */

    public function test_missing_saas_api_url_skips_sync(): void
    {
        // Defensive: if the SaaS URL isn't configured, skip the
        // sync rather than fire-and-fail against an empty host.
        Config::set('services.saas.api_url', '');
        $org = $this->staleOrg();

        Http::fake();

        $this->invokeSync($org);

        Http::assertNothingSent();
    }

    public function test_missing_bearer_token_skips_sync(): void
    {
        // Bootstrap requires the user's SaaS JWT. No token → no
        // call — can't sync without identity.
        $org = $this->staleOrg();
        Http::fake();

        // Request with no Authorization header.
        $r = Request::create('/v1/admin/whatever', 'GET');
        $this->invokeSync($org, $r);

        Http::assertNothingSent();
    }
}
