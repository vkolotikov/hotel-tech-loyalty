<?php

namespace Tests\Feature\ChatGptAuth;

use App\Http\Middleware\Plugin\AuthenticatePluginToken;
use App\Models\PluginUser;
use App\Models\User;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\URL;
use Laravel\Passport\ClientRepository;
use Lcobucci\JWT\Configuration;
use Lcobucci\JWT\Encoding\JoseEncoder;
use Lcobucci\JWT\Signer\Key\InMemory;
use Lcobucci\JWT\Signer\Rsa\Sha256;
use Lcobucci\JWT\Token\Parser;
use Tests\TestCase;

class PluginOAuthTest extends TestCase
{
    private const ORIGIN = 'https://app.hexa-tech.uk';

    private const CALLBACK = 'https://chatgpt.com/connector_platform/oauth/callback';

    private string $clientId;

    private string $verifier;

    private static ?array $keys = null;

    protected function setUp(): void
    {
        parent::setUp();
        if (self::$keys === null) {
            // Ephemeral test-only RSA keys; nothing is written to app storage.
            $openssl = ['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA];
            $bundledConfig = dirname(PHP_BINARY).'/extras/ssl/openssl.cnf';
            if (is_file($bundledConfig)) {
                $openssl['config'] = $bundledConfig;
            }
            $key = openssl_pkey_new($openssl);
            openssl_pkey_export($key, $private, options: $openssl);
            self::$keys = [$private, openssl_pkey_get_details($key)['key']];
        }
        config([
            'chatgpt.enabled' => true,
            'chatgpt.organization_ids' => [1, 2],
            'chatgpt.url' => self::ORIGIN,
            'chatgpt.redirect_uris' => [self::CALLBACK],
            'passport.private_key' => self::$keys[0],
            'passport.public_key' => self::$keys[1],
            'session.driver' => 'array',
        ]);
        URL::forceRootUrl(self::ORIGIN);
        URL::forceScheme('https');
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('email');
            $table->string('password');
            $table->string('user_type');
            $table->unsignedBigInteger('organization_id')->nullable();
            $table->rememberToken();
            $table->timestamps();
        });
        Schema::create('organizations', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->boolean('is_active')->default(true);
            $table->timestamp('saas_deleted_at')->nullable();
            $table->string('saas_org_id')->nullable();
            $table->string('subscription_status')->default('ACTIVE');
            $table->timestamp('trial_end')->nullable();
            $table->timestamp('entitlements_synced_at')->nullable();
        });
        Schema::create('staff', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id');
            $table->unsignedBigInteger('organization_id');
            $table->boolean('is_active')->default(true);
        });
        Schema::create('personal_access_tokens', function (Blueprint $table) {
            $table->id();
            $table->morphs('tokenable');
            $table->string('name');
            $table->string('token', 64)->unique();
            $table->text('abilities')->nullable();
            $table->timestamp('last_used_at')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamps();
        });
        foreach (glob(database_path('migrations/2016_06_01_*oauth*.php')) as $path) {
            (require $path)->up();
        }
        (require database_path('migrations/2026_09_09_120000_bind_plugin_oauth_grants_to_organization.php'))->up();
        DB::table('organizations')->insert(['id' => 1, 'name' => 'Test Hotel']);
        DB::table('users')->insert(['id' => 1, 'name' => 'Staff', 'email' => 'staff@example.test',
            'password' => 'unused', 'user_type' => 'staff', 'organization_id' => 1]);
        DB::table('staff')->insert(['user_id' => 1, 'organization_id' => 1]);
        $client = app(ClientRepository::class)->createAuthorizationCodeGrantClient(
            'Hexa-Tech ChatGPT', [self::CALLBACK], confidential: false,
        );
        $this->clientId = (string) $client->id;
        config(['chatgpt.client_id' => $this->clientId]);
        $this->verifier = str_repeat('v', 64);
        Route::post('/plugin-auth-test', fn () => response()->json(['user' => request()->user()->id]))
            ->middleware(AuthenticatePluginToken::class);
        Route::post('/sanctum-auth-test', fn () => response()->json(['user' => request()->user()->id]))
            ->middleware(['saas.auth', 'auth:sanctum']);
    }

    public function test_discovery_and_disabled_endpoints(): void
    {
        $this->getJson(self::ORIGIN.'/.well-known/oauth-authorization-server')
            ->assertOk()->assertJsonPath('code_challenge_methods_supported.0', 'S256')
            ->assertJsonMissingPath('registration_endpoint');
        config(['chatgpt.enabled' => false]);
        $this->getJson(self::ORIGIN.'/.well-known/oauth-authorization-server')->assertNotFound();
        $this->postJson(self::ORIGIN.'/oauth/token')->assertNotFound();
        $this->assertFalse(Route::has('passport.clients.store'));
    }

    public function test_authorization_rejects_missing_pkce_wrong_resource_and_callback(): void
    {
        foreach ([['code_challenge_method' => 'plain'], ['code_challenge' => ''],
            ['redirect_uri' => self::CALLBACK.'/attacker'], ['resource' => 'https://other.test/mcp'],
            ['scope' => '*'], ['client_id' => 'other-client']] as $override) {
            $this->getJson($this->authorizationUrl($override))->assertStatus(400);
        }
    }

    public function test_guest_is_sent_to_bridge_and_bridge_requires_app_bearer(): void
    {
        $url = $this->authorizationUrl();
        $this->get($url)->assertRedirect(self::ORIGIN.'/plugin/login');
        $this->get(self::ORIGIN.'/plugin/login')->assertOk()->assertSee('Continue with signed-in account');
        $this->postJson(self::ORIGIN.'/plugin/session')->assertUnauthorized();
        $token = User::findOrFail(1)->createToken('test-app')->plainTextToken;
        Auth::forgetGuards();
        $this->withHeader('Authorization', 'Bearer '.$token)
            ->postJson(self::ORIGIN.'/plugin/session')->assertOk()
            ->assertJsonPath('redirect', Request::create($url)->fullUrl());
        $this->assertAuthenticatedAs(PluginUser::findOrFail(1), 'plugin-web');
        $this->assertGuest('web');
    }

    public function test_code_pkce_token_resource_tenant_and_endpoint_isolation(): void
    {
        $code = $this->approve();
        Auth::forgetGuards();
        $this->exchange($code, ['code_verifier' => str_repeat('x', 64)])->assertStatus(400);
        $tokens = $this->exchange($code)->assertOk()->json();
        $claims = (new Parser(new JoseEncoder))->parse($tokens['access_token'])->claims();
        $this->assertContains(self::ORIGIN.'/mcp', $claims->get('aud'));
        $this->assertSame(1, $claims->get('organization_id'));
        Auth::forgetGuards();
        $this->withHeader('Authorization', 'Bearer '.$tokens['access_token'])
            ->postJson(self::ORIGIN.'/plugin-auth-test')->assertOk()->assertJsonPath('user', 1);
        Auth::forgetGuards();
        $this->postJson(self::ORIGIN.'/sanctum-auth-test')->assertUnauthorized();
        Auth::forgetGuards();
        $appToken = User::findOrFail(1)->createToken('app')->plainTextToken;
        $this->withHeader('Authorization', 'Bearer '.$appToken)
            ->postJson(self::ORIGIN.'/plugin-auth-test')->assertUnauthorized();
        $this->exchange($code)->assertStatus(400); // one-time authorization code
    }

    public function test_deny_never_issues_token(): void
    {
        $this->actingAs(PluginUser::findOrFail(1), 'plugin-web');
        $this->readyBridge();
        $this->get($this->authorizationUrl())->assertOk();
        $response = $this->delete(self::ORIGIN.'/oauth/authorize', ['auth_token' => session('authToken')]);
        $response->assertRedirect();
        $this->assertStringContainsString('error=access_denied', $response->headers->get('Location'));
        $this->assertSame(0, DB::table('oauth_access_tokens')->count());
    }

    public function test_moved_organization_rejects_pending_code_and_existing_tokens(): void
    {
        $code = $this->approve();
        DB::table('users')->where('id', 1)->update(['organization_id' => 2]);
        Auth::forgetGuards();
        $this->exchange($code)->assertStatus(400);
        DB::table('users')->where('id', 1)->update(['organization_id' => 1]);
        $tokens = $this->exchange($code)->assertOk()->json();
        DB::table('users')->where('id', 1)->update(['organization_id' => 2]);
        Auth::forgetGuards();
        $this->withHeader('Authorization', 'Bearer '.$tokens['access_token'])
            ->postJson(self::ORIGIN.'/plugin-auth-test')->assertUnauthorized();
        $this->refresh($tokens['refresh_token'])->assertStatus(400);
    }

    public function test_refresh_rotates_and_inactive_staff_cannot_refresh(): void
    {
        $tokens = $this->exchange($this->approve())->assertOk()->json();
        $next = $this->refresh($tokens['refresh_token'])->assertOk()->json();
        $this->refresh($tokens['refresh_token'])->assertStatus(400);
        DB::table('staff')->update(['is_active' => false]);
        $this->refresh($next['refresh_token'])->assertStatus(400);
    }

    public function test_consent_cannot_be_approved_after_account_moves_organization(): void
    {
        $this->actingAs(PluginUser::findOrFail(1), 'plugin-web');
        $this->readyBridge();
        $this->get($this->authorizationUrl())->assertOk();
        DB::table('users')->where('id', 1)->update(['organization_id' => 2]);
        $this->post(self::ORIGIN.'/oauth/authorize', ['auth_token' => session('authToken')])->assertStatus(401);
        $this->assertSame(0, DB::table('oauth_auth_codes')->count());
    }

    public function test_existing_web_cookie_cannot_replace_invalid_or_revoked_bridge_bearer(): void
    {
        $this->get($this->authorizationUrl())->assertRedirect();
        $this->actingAs(User::findOrFail(1), 'web');
        $this->withHeader('Authorization', 'Bearer 999|invalid')
            ->postJson(self::ORIGIN.'/plugin/session')->assertUnauthorized();
        $token = User::findOrFail(1)->createToken('revoked')->plainTextToken;
        DB::table('personal_access_tokens')->delete();
        $this->withHeader('Authorization', 'Bearer '.$token)
            ->postJson(self::ORIGIN.'/plugin/session')->assertUnauthorized();
        $this->assertGuest('plugin-web');
    }

    public function test_old_plugin_session_requires_fresh_app_bearer_for_each_connection(): void
    {
        $this->actingAs(PluginUser::findOrFail(1), 'plugin-web');
        $this->get($this->authorizationUrl())->assertRedirect(self::ORIGIN.'/plugin/login');
        $this->assertGuest('plugin-web');
        $this->actingAs(PluginUser::findOrFail(1), 'plugin-web');
        $this->readyBridge();
        $this->get($this->authorizationUrl())->assertOk();
        $this->get($this->authorizationUrl())->assertRedirect(self::ORIGIN.'/plugin/login');
    }

    public function test_real_mcp_tools_list_accepts_exchanged_oauth_token_and_sets_tenant(): void
    {
        $tokens = $this->exchange($this->approve())->assertOk()->json();
        Auth::forgetGuards();
        // Real token, tenant, staff and subscription middleware all run.
        $response = $this->withHeaders([
            'Authorization' => 'Bearer '.$tokens['access_token'],
            'Accept' => 'application/json, text/event-stream',
        ])->postJson(self::ORIGIN.'/mcp', ['jsonrpc' => '2.0', 'id' => 1, 'method' => 'tools/list']);
        $response->assertOk();
        $this->assertStringContainsString('search_customers', $response->getContent());
        $this->assertSame(1, app('current_organization_id'));
        $this->call('POST', self::ORIGIN.'/mcp', [], [], [], [
            'HTTP_AUTHORIZATION' => 'Bearer '.$tokens['access_token'],
            'CONTENT_TYPE' => 'text/plain',
        ], 'not json')->assertStatus(415);
    }

    public function test_pilot_restriction_blocks_linking_existing_tokens_and_refresh(): void
    {
        $tokens = $this->exchange($this->approve())->assertOk()->json();
        config(['chatgpt.organization_ids' => [], 'chatgpt.all_organizations' => false]);
        Auth::forgetGuards();
        $this->withHeader('Authorization', 'Bearer '.$tokens['access_token'])
            ->postJson(self::ORIGIN.'/plugin-auth-test')->assertUnauthorized();
        $this->refresh($tokens['refresh_token'])->assertStatus(400);
        $this->actingAs(PluginUser::findOrFail(1), 'plugin-web');
        $this->readyBridge();
        $this->get($this->authorizationUrl())->assertForbidden();
    }

    public function test_mcp_quota_isolated_between_businesses_on_the_same_ip(): void
    {
        $this->freezeTime();
        $tokensA = $this->exchange($this->approve())->assertOk()->json();
        DB::table('organizations')->insert(['id' => 2, 'name' => 'Second business']);
        DB::table('users')->insert(['id' => 2, 'name' => 'Second staff', 'email' => 'second@example.test',
            'password' => 'unused', 'user_type' => 'staff', 'organization_id' => 2]);
        DB::table('staff')->insert(['user_id' => 2, 'organization_id' => 2]);
        $this->actingAs(PluginUser::findOrFail(2), 'plugin-web');
        $this->readyBridge();
        $this->get($this->authorizationUrl())->assertOk();
        $approved = $this->post(self::ORIGIN.'/oauth/authorize', ['auth_token' => session('authToken')])->assertRedirect();
        parse_str(parse_url($approved->headers->get('Location'), PHP_URL_QUERY), $query);
        $tokensB = $this->exchange($query['code'])->assertOk()->json();
        Cache::flush();
        $call = function ($token) {
            Auth::forgetGuards();
            Auth::shouldUse('web');

            return $this->withHeader('Authorization', 'Bearer '.$token)->postJson(self::ORIGIN.'/mcp',
                ['jsonrpc' => '2.0', 'id' => 1, 'method' => 'tools/list']);
        };
        for ($i = 0; $i < 60; $i++) {
            $call($tokensA['access_token'])->assertOk();
        }
        $call($tokensA['access_token'])->assertStatus(429);
        $call($tokensB['access_token'])->assertOk();
    }

    public function test_portal_disconnect_invalidates_actual_oauth_token_and_refresh(): void
    {
        $tokens = $this->exchange($this->approve())->assertOk()->json();
        $appToken = User::findOrFail(1)->createToken('portal')->plainTextToken;
        Auth::forgetGuards();
        Auth::shouldUse('web');
        $this->withHeader('Authorization', 'Bearer '.$appToken)
            ->deleteJson(self::ORIGIN.'/api/v1/auth/plugin-connections')->assertOk();
        Auth::forgetGuards();
        Auth::shouldUse('web');
        $this->withHeader('Authorization', 'Bearer '.$tokens['access_token'])
            ->postJson(self::ORIGIN.'/mcp', ['jsonrpc' => '2.0', 'id' => 1, 'method' => 'tools/list'])->assertUnauthorized();
        $this->refresh($tokens['refresh_token'])->assertStatus(400);
    }

    public function test_revoked_access_token_and_tampered_signature_are_rejected(): void
    {
        $tokens = $this->exchange($this->approve())->assertOk()->json();
        Auth::forgetGuards();
        $parts = explode('.', $tokens['access_token']);
        $parts[1] = rtrim(strtr(base64_encode('{"sub":"999"}'), '+/', '-_'), '=');
        $this->withHeader('Authorization', 'Bearer '.implode('.', $parts))
            ->postJson(self::ORIGIN.'/plugin-auth-test')->assertUnauthorized();
        DB::table('oauth_access_tokens')->update(['revoked' => true]);
        Auth::forgetGuards();
        $this->withHeader('Authorization', 'Bearer '.$tokens['access_token'])
            ->postJson(self::ORIGIN.'/plugin-auth-test')->assertUnauthorized();
        $this->refresh($tokens['refresh_token'])->assertStatus(400);
    }

    public function test_bridge_and_consent_keep_framework_csrf_protection(): void
    {
        $this->app->bind(PreventRequestForgery::class, fn ($app) => new class($app, $app['encrypter']) extends PreventRequestForgery
        {
            protected function runningUnitTests()
            {
                return false;
            }
        });
        $this->get($this->authorizationUrl())->assertRedirect();
        $token = User::findOrFail(1)->createToken('app')->plainTextToken;
        $this->withHeader('Authorization', 'Bearer '.$token)
            ->postJson(self::ORIGIN.'/plugin/session')->assertStatus(419);
        $this->withHeader('X-CSRF-TOKEN', session()->token())
            ->postJson(self::ORIGIN.'/plugin/session')->assertOk();
        $this->get($this->authorizationUrl())->assertOk();
        $this->withHeader('X-CSRF-TOKEN', 'invalid')
            ->postJson(self::ORIGIN.'/oauth/authorize', ['auth_token' => session('authToken')])->assertStatus(419);
        $this->assertSame(0, DB::table('oauth_auth_codes')->count());
    }

    public function test_correctly_signed_token_still_requires_resource_audience_scope_and_expiry(): void
    {
        $tokens = $this->exchange($this->approve())->assertOk()->json();
        $claims = (new Parser(new JoseEncoder))->parse($tokens['access_token'])->claims();
        $jwt = Configuration::forAsymmetricSigner(
            new Sha256,
            InMemory::plainText(self::$keys[0]),
            InMemory::plainText(self::$keys[1]),
        );
        foreach (['audience', 'scope', 'expiry'] as $missing) {
            $token = $jwt->builder()
                ->permittedFor($this->clientId, $missing === 'audience' ? 'https://other.test/mcp' : self::ORIGIN.'/mcp')
                ->issuedBy(self::ORIGIN)->identifiedBy($claims->get('jti'))->relatedTo('1')
                ->issuedAt(new \DateTimeImmutable('-2 hours'))->canOnlyBeUsedAfter(new \DateTimeImmutable('-2 hours'))
                ->expiresAt(new \DateTimeImmutable($missing === 'expiry' ? '-1 hour' : '+1 hour'))
                ->withClaim('scopes', $missing === 'scope' ? [] : ['mcp:use'])
                ->withClaim('organization_id', 1)
                ->getToken($jwt->signer(), $jwt->signingKey())->toString();
            Auth::forgetGuards();
            $this->withHeader('Authorization', 'Bearer '.$token)
                ->postJson(self::ORIGIN.'/plugin-auth-test')->assertStatus($missing === 'scope' ? 403 : 401);
        }
    }

    private function authorizationUrl(array $override = []): string
    {
        return self::ORIGIN.'/oauth/authorize?'.http_build_query(array_merge([
            'client_id' => $this->clientId, 'redirect_uri' => self::CALLBACK, 'prompt' => 'consent',
            'response_type' => 'code', 'scope' => 'mcp:use', 'state' => 'state-test',
            'resource' => self::ORIGIN.'/mcp', 'code_challenge_method' => 'S256',
            'code_challenge' => rtrim(strtr(base64_encode(hash('sha256', $this->verifier, true)), '+/', '-_'), '='),
        ], $override));
    }

    private function approve(): string
    {
        $this->actingAs(PluginUser::findOrFail(1), 'plugin-web');
        $this->readyBridge();
        $this->get($this->authorizationUrl())->assertOk()->assertSee('Allow access');
        $response = $this->post(self::ORIGIN.'/oauth/authorize', ['auth_token' => session('authToken')]);
        $response->assertRedirect();
        parse_str(parse_url($response->headers->get('Location'), PHP_URL_QUERY), $query);
        $this->assertSame('state-test', $query['state']);

        return $query['code'];
    }

    private function exchange(string $code, array $override = [])
    {
        return $this->postJson(self::ORIGIN.'/oauth/token', array_merge([
            'grant_type' => 'authorization_code', 'client_id' => $this->clientId,
            'redirect_uri' => self::CALLBACK, 'code' => $code, 'code_verifier' => $this->verifier,
            'resource' => self::ORIGIN.'/mcp',
        ], $override));
    }

    private function readyBridge(): void
    {
        $this->withSession(['plugin.bridge_ready' => [
            'target' => hash('sha256', Request::create($this->authorizationUrl())->fullUrl()), 'until' => time() + 120,
        ]]);
    }

    private function refresh(string $token)
    {
        return $this->postJson(self::ORIGIN.'/oauth/token', [
            'grant_type' => 'refresh_token', 'client_id' => $this->clientId,
            'refresh_token' => $token, 'resource' => self::ORIGIN.'/mcp',
        ]);
    }
}
