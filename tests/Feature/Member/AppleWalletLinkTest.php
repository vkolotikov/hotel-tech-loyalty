<?php

namespace Tests\Feature\Member;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Schema;

/**
 * GET /v1/member/card/apple-wallet/link and the ?pass= exchange.
 *
 * A Safari navigation to a .pkpass URL cannot carry an Authorization
 * header, so the app used to open
 *   /v1/member/card/apple-wallet?token=<the member's Sanctum token>
 * — a never-expiring credential in a query string, written to access logs,
 * Safari history and every proxy in between. One leaked log line was
 * permanent account access.
 *
 * Now the app asks, authenticated by header, for a single-use two-minute
 * link, and the public route accepts only that. The ?token= door is gone.
 */
class AppleWalletLinkTest extends MemberEndpointTestCase
{
    private const LINK     = '/api/v1/member/card/apple-wallet/link';
    private const DOWNLOAD = '/api/v1/member/card/apple-wallet';

    protected function setUp(): void
    {
        parent::setUp();

        // apple() looks the tenant's wallet configuration up after it has
        // authenticated the nonce; with no row it answers 503 "not enabled",
        // which is the clean, deterministic end of the happy path here.
        if (!Schema::hasTable('wallet_configs')) {
            Schema::create('wallet_configs', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->string('apple_pass_type_id')->nullable();
                $t->string('apple_team_id')->nullable();
                $t->string('apple_organization_name')->nullable();
                $t->string('apple_cert_path')->nullable();
                $t->text('apple_cert_password')->nullable();
                $t->string('apple_wwdr_path')->nullable();
                $t->string('google_issuer_id')->nullable();
                $t->string('google_class_suffix')->nullable();
                $t->string('google_service_account_path')->nullable();
                $t->boolean('is_active')->default(true);
                $t->timestamps();
            });
        }
    }

    public function test_the_link_endpoint_requires_a_signed_in_member(): void
    {
        $this->getJson(self::LINK)->assertStatus(401);
    }

    public function test_the_link_is_a_single_use_two_minute_nonce_bound_to_the_member(): void
    {
        ['user' => $user, 'token' => $token] = $this->member($this->tenant());

        $response = $this->withToken($token)->getJson(self::LINK)->assertStatus(200);

        $url = (string) $response->json('url');
        $this->assertMatchesRegularExpression('#/api/v1/member/card/apple-wallet\?pass=([0-9a-f]{64})$#', $url);
        $this->assertSame(120, $response->json('expires_in'));
        $this->assertStringNotContainsString($token, $url, 'The member token must never appear in the download URL.');

        preg_match('/pass=([0-9a-f]{64})$/', $url, $m);
        $this->assertSame($user->id, Cache::get('wallet_pass_nonce:' . $m[1]),
            'The nonce must resolve to the member who asked for it, and to nobody else.');
    }

    public function test_the_nonce_is_consumed_on_first_use_and_refused_after(): void
    {
        ['token' => $token] = $this->member($this->tenant());

        $url = (string) $this->withToken($token)->getJson(self::LINK)->json('url');
        preg_match('/pass=([0-9a-f]{64})$/', $url, $m);

        // The test client keeps withToken()'s Authorization header for every
        // later request, and the sanctum guard keeps the user it resolved for
        // the rest of the process; a Safari navigation carries neither, and
        // neither may these.
        $this->flushHeaders();
        $this->app['auth']->forgetGuards();

        // First use: authenticated by the nonce alone — no header, no token.
        // The tenant has no wallet configuration, so the pass itself is
        // "not enabled" (503); what matters is that the request got PAST
        // authentication and that the nonce is now gone.
        $first = $this->get($url);
        $this->assertSame(503, $first->getStatusCode(), 'The nonce did not authenticate the download: ' . $first->getContent());
        $this->assertNull(Cache::get('wallet_pass_nonce:' . $m[1]), 'A used nonce must be deleted, not merely expired.');

        // Second use of the same link: refused.
        $this->get($url)->assertStatus(401);
    }

    public function test_a_raw_token_in_the_query_string_no_longer_opens_the_door(): void
    {
        ['token' => $token] = $this->member($this->tenant());

        $this->get(self::DOWNLOAD . '?token=' . urlencode($token))->assertStatus(401);
        $this->get(self::DOWNLOAD)->assertStatus(401);
        $this->get(self::DOWNLOAD . '?pass=' . str_repeat('0', 64))->assertStatus(401);
    }
}
