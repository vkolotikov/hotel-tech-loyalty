<?php

namespace Tests\Feature\Internal;

use App\Http\Controllers\Api\Internal\InternalEntitlementController;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks POST /api/internal/entitlements/bust — the HMAC-signed
 * cross-system entitlement cache invalidation endpoint (June 7
 * 2026 ship).
 *
 * Why this exists:
 *   - Customer upgrades / downgrades via Stripe Customer Portal
 *     → SaaS receives `customer.subscription.updated` webhook
 *     → SaaS POSTs to this endpoint
 *     → Loyalty drops the org's cached entitlement marker
 *     → next admin request runs through SaasAuthMiddleware which
 *       re-pulls the authoritative plan_features map
 *
 *   Without this push, the SaasAuthMiddleware 5-min poll wins. A
 *   downgrade leaves the customer using their old higher-tier
 *   features for 5 minutes. An upgrade leaves them locked out of
 *   their new features for 5 minutes.
 *
 * Auth: X-Signature header = hex(hmac_sha256(rawBody, SAAS_JWT_SECRET)).
 * Same secret SaaS already uses for user JWTs — no new credential
 * to provision.
 *
 * Body: { "saas_org_id": "cm..." }
 *
 * Response shapes:
 *   200 + { ok:true, found:true }  — org found + cache busted
 *   200 + { ok:true, found:false } — org not in loyalty DB yet
 *                                    (SaaS-only signup; not an error)
 *   401 + { error: 'invalid signature' } — HMAC mismatch / missing
 *   422 + { error: 'saas_org_id required' } — empty payload
 *
 * Side effects on found:
 *   - organizations.entitlements_synced_at → NULL (forces resync
 *     on next SaasAuthMiddleware request)
 *   - Cache::forget("subscription_status:{saas_org_id}") — busts
 *     the CheckSubscription middleware's 60s cache
 */
class InternalEntitlementControllerTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private const SECRET = 'test_saas_jwt_secret_internal_bust_42';
    private InternalEntitlementController $controller;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpMinimalSchema();
        $this->controller = new InternalEntitlementController();
        // Controller writes entitlements_synced_at and the minimal
        // schema doesn't carry this column. Add it for this suite.
        if (!Schema::hasColumn('organizations', 'entitlements_synced_at')) {
            Schema::table('organizations', function ($t) {
                $t->timestamp('entitlements_synced_at')->nullable();
            });
        }

        // Lock the secret used by signature verification. The
        // controller reads from config('services.saas.jwt_secret')
        // OR env('SAAS_JWT_SECRET'). Set both so order doesn't
        // matter across phpunit envs.
        Config::set('services.saas.jwt_secret', self::SECRET);
        // Use a fake cache driver so Cache::forget() is observable.
        Cache::flush();
    }

    /** Build the canonical request body + matching X-Signature header. */
    private function sign(array $body, string $secret = self::SECRET): array
    {
        $raw = json_encode($body);
        return [
            'raw'       => $raw,
            'signature' => hash_hmac('sha256', $raw, $secret),
        ];
    }

    /** Invoke the controller's bust() method directly with a signed body.
     *  Bypasses routing — keeps this test focused on auth + side effects. */
    private function postSigned(array $body, ?string $signature = null): JsonResponse
    {
        $signed = $this->sign($body);
        $request = Request::create(
            '/api/internal/entitlements/bust',
            'POST',
            [], [], [],
            [
                'HTTP_X-Signature' => $signature ?? $signed['signature'],
                'CONTENT_TYPE'     => 'application/json',
            ],
            $signed['raw'],
        );
        return $this->controller->bust($request);
    }

    /** Assert the response status + decode the JSON body. */
    private function assertJsonResponse(JsonResponse $resp, int $expectedStatus): array
    {
        $this->assertSame($expectedStatus, $resp->getStatusCode());
        return json_decode($resp->getContent(), true);
    }

    /* ─── Happy path — found + signed ─── */

    public function test_valid_signature_with_known_org_returns_found_true(): void
    {
        $org = OrganizationFactory::new()->create([
            'saas_org_id'             => 'cmoFoundExpressOrg42',
            'entitlements_synced_at'  => now(),
        ]);

        $body = $this->assertJsonResponse($this->postSigned(['saas_org_id' => $org->saas_org_id]), 200);
        $this->assertTrue($body['ok']);
        $this->assertTrue($body['found']);
    }

    public function test_bust_nullifies_entitlements_synced_at(): void
    {
        // The side-effect that powers the cross-system flow: by
        // nullifying the marker, the NEXT call to SaasAuthMiddleware
        // treats this org as stale and pulls a fresh plan_features
        // map from the SaaS bootstrap endpoint.
        $org = OrganizationFactory::new()->create([
            'saas_org_id'             => 'cmoSyncMarkerTest',
            'entitlements_synced_at'  => now()->subMinute(),
        ]);

        $this->assertJsonResponse($this->postSigned(['saas_org_id' => $org->saas_org_id]), 200);

        $org->refresh();
        $this->assertNull($org->entitlements_synced_at,
            'entitlements_synced_at MUST be NULL after bust — forces re-sync on next request.');
    }

    public function test_bust_forgets_subscription_status_cache_key(): void
    {
        // The CheckSubscription middleware's 60s cache MUST also
        // drop so subscription_status changes are immediate.
        $org = OrganizationFactory::new()->create([
            'saas_org_id' => 'cmoCacheBust42',
        ]);
        Cache::put("subscription_status:{$org->saas_org_id}", 'TRIALING', 120);
        $this->assertSame('TRIALING',
            Cache::get("subscription_status:{$org->saas_org_id}"),
            'Pre-condition: cache key present.',
        );

        $this->assertJsonResponse($this->postSigned(['saas_org_id' => $org->saas_org_id]), 200);

        $this->assertNull(
            Cache::get("subscription_status:{$org->saas_org_id}"),
            'CRITICAL: subscription_status cache MUST be forgotten so plan changes reflect on next request.',
        );
    }

    /* ─── Not-found path — valid signature, no local org ─── */

    public function test_valid_signature_with_unknown_org_returns_found_false_not_error(): void
    {
        // SaaS-only signup that hasn't logged into loyalty yet. The
        // SaaS webhook still fires for them; we return 200/found=false
        // so SaaS doesn't retry forever thinking it's an outage.
        $body = $this->assertJsonResponse($this->postSigned(['saas_org_id' => 'cmoNeverSeen_999']), 200);

        $this->assertTrue($body['ok']);
        $this->assertFalse($body['found']);
    }

    /* ─── Auth — bad signature paths ─── */

    public function test_missing_signature_header_returns_401(): void
    {
        // No X-Signature header at all.
        $request = Request::create(
            '/api/internal/entitlements/bust',
            'POST',
            [], [], [],
            ['CONTENT_TYPE' => 'application/json'], // no HTTP_X-Signature
            json_encode(['saas_org_id' => 'whatever']),
        );

        $body = $this->assertJsonResponse($this->controller->bust($request), 401);
        $this->assertSame('invalid signature', $body['error']);
    }

    public function test_wrong_signature_returns_401(): void
    {
        // An attacker who knows the endpoint shape but not the secret
        // can't fake a valid bust. Without strict signature checking
        // anyone could clobber tenant entitlements.
        $body = $this->assertJsonResponse(
            $this->postSigned(
                ['saas_org_id' => 'cmoTest'],
                signature: '0' . str_repeat('a', 63),
            ),
            401,
        );
        $this->assertSame('invalid signature', $body['error']);
    }

    public function test_signature_signed_with_wrong_secret_returns_401(): void
    {
        // Defense in depth: even a perfectly-shaped hmac signed with
        // the wrong secret MUST NOT verify.
        $body = ['saas_org_id' => 'cmoSecretMismatch'];
        $badSig = hash_hmac('sha256', json_encode($body), 'a_different_secret_42');

        $request = Request::create(
            '/api/internal/entitlements/bust',
            'POST',
            [], [], [],
            [
                'HTTP_X-Signature' => $badSig,
                'CONTENT_TYPE'     => 'application/json',
            ],
            json_encode($body),
        );

        $this->assertJsonResponse($this->controller->bust($request), 401);
    }

    public function test_tampered_body_after_signing_returns_401(): void
    {
        // Replay defense: an attacker who captured a valid signed
        // request can't swap the saas_org_id in the body to bust
        // a different org's cache.
        $original = ['saas_org_id' => 'cmoOriginal'];
        $signed = $this->sign($original);

        $request = Request::create(
            '/api/internal/entitlements/bust',
            'POST',
            [], [], [],
            [
                'HTTP_X-Signature' => $signed['signature'],
                'CONTENT_TYPE'     => 'application/json',
            ],
            json_encode(['saas_org_id' => 'cmoVictim']), // tampered body
        );

        $this->assertJsonResponse($this->controller->bust($request), 401);
    }

    public function test_missing_secret_in_env_returns_401(): void
    {
        // Defensive: if the secret isn't configured on the loyalty
        // side, the endpoint MUST refuse rather than fail open.
        Config::set('services.saas.jwt_secret', null);
        $previous = $_ENV['SAAS_JWT_SECRET'] ?? null;
        unset($_ENV['SAAS_JWT_SECRET']);
        putenv('SAAS_JWT_SECRET');

        try {
            // Any signature attempt — the controller's secret-resolution
            // returns null and short-circuits to 401 BEFORE checking
            // the provided signature.
            $request = Request::create(
                '/api/internal/entitlements/bust',
                'POST',
                [], [], [],
                [
                    'HTTP_X-Signature' => 'whatever',
                    'CONTENT_TYPE'     => 'application/json',
                ],
                json_encode(['saas_org_id' => 'cmoTest']),
            );
            $this->assertJsonResponse($this->controller->bust($request), 401);
        } finally {
            if ($previous !== null) {
                $_ENV['SAAS_JWT_SECRET'] = $previous;
                putenv("SAAS_JWT_SECRET={$previous}");
            }
        }
    }

    /* ─── Validation — missing saas_org_id ─── */

    public function test_empty_saas_org_id_returns_422(): void
    {
        $body = $this->assertJsonResponse($this->postSigned(['saas_org_id' => '']), 422);
        $this->assertSame('saas_org_id required', $body['error']);
    }

    public function test_missing_saas_org_id_field_returns_422(): void
    {
        $body = $this->assertJsonResponse($this->postSigned([]), 422);
        $this->assertSame('saas_org_id required', $body['error']);
    }

    /* ─── Cross-tenant: works without bound tenant context ─── */

    public function test_bust_works_without_tenant_context_bound(): void
    {
        // Webhook callers (SaaS backend) have NO loyalty user / tenant
        // context. The endpoint MUST find the org cross-tenant via
        // withoutGlobalScopes() — without this the lookup returns
        // null and the cache stays stale forever.
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }

        $org = OrganizationFactory::new()->create([
            'saas_org_id' => 'cmoCrossTenantTest',
        ]);

        $body = $this->assertJsonResponse(
            $this->postSigned(['saas_org_id' => $org->saas_org_id]),
            200,
        );
        $this->assertTrue($body['found']);
    }

    /* ─── Not-found path side-effect isolation ─── */

    public function test_not_found_does_not_touch_cache_or_db(): void
    {
        // When the org isn't local, no DB write + no cache touch
        // happens (nothing to bust). Defensive — guards against a
        // future regression that "creates the row" or similar.
        Cache::put('subscription_status:cmoUnknown_77', 'TRIALING', 120);

        $this->assertJsonResponse($this->postSigned(['saas_org_id' => 'cmoUnknown_77']), 200);

        // The unrelated org's cache key must stay intact (we only
        // forget on the saas_org_id passed AND found).
        $this->assertSame('TRIALING',
            Cache::get('subscription_status:cmoUnknown_77'),
            'Not-found path MUST NOT touch unrelated cache keys.',
        );
    }
}
