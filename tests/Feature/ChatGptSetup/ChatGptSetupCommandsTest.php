<?php

namespace Tests\Feature\ChatGptSetup;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Laravel\Passport\ClientRepository;
use Laravel\Passport\Passport;
use Tests\TestCase;

class ChatGptSetupCommandsTest extends TestCase
{
    private const CALLBACK = 'https://chatgpt.com/connector_platform/oauth/callback';

    private const LOOPBACK = 'http://127.0.0.1:45678/oauth/callback';

    private static ?array $keys = null;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        foreach (glob(database_path('migrations/2016_06_01_*oauth*.php')) as $path) {
            (require $path)->up();
        }
        (require database_path('migrations/2026_09_09_120000_bind_plugin_oauth_grants_to_organization.php'))->up();
        Schema::create('organizations', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->boolean('is_active')->default(true);
            $table->timestamp('saas_deleted_at')->nullable();
        });
        DB::table('organizations')->insert(['id' => 2, 'name' => 'FDS Cards']);
        if (self::$keys === null) {
            // Test-only keys stay in memory. Never call passport:keys from setup.
            $options = ['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA];
            $bundledConfig = dirname(PHP_BINARY).'/extras/ssl/openssl.cnf';
            if (is_file($bundledConfig)) {
                $options['config'] = $bundledConfig;
            }
            $key = openssl_pkey_new($options);
            openssl_pkey_export($key, $private, options: $options);
            self::$keys = [$private, openssl_pkey_get_details($key)['key']];
            $otherKey = openssl_pkey_new($options);
            self::$keys[] = openssl_pkey_get_details($otherKey)['key'];
        }
        config([
            'chatgpt.enabled' => true,
            'chatgpt.url' => 'https://app.hexa-tech.uk',
            'chatgpt.client_id' => '',
            'chatgpt.redirect_uris' => [self::CALLBACK],
            'chatgpt.organization_ids' => [2],
            'chatgpt.all_organizations' => false,
            'passport.private_key' => self::$keys[0],
            'passport.public_key' => self::$keys[1],
        ]);
    }

    public function test_client_setup_reuses_an_exact_named_client_and_never_creates_a_secret(): void
    {
        $args = ['--redirect-uri' => [self::CALLBACK, self::LOOPBACK, self::CALLBACK]];
        $this->assertSame(0, Artisan::call('chatgpt:client', $args));
        $client = Passport::client()->newQuery()->sole();
        $this->assertFalse($client->confidential());
        $this->assertNull($client->getRawOriginal('secret'));
        $this->assertSame(['authorization_code', 'refresh_token'], $client->grant_types);
        $this->assertCount(2, $client->redirect_uris);
        $this->assertStringContainsString('CHATGPT_PLUGIN_CLIENT_ID='.$client->id, Artisan::output());
        $this->assertSame(0, Artisan::call('chatgpt:client', $args));
        $this->assertDatabaseCount('oauth_clients', 1);
        $this->assertSame('', config('chatgpt.client_id'));
        $this->assertSame(self::$keys[0], config('passport.private_key'));
        Http::assertNothingSent();
    }

    public function test_client_update_changes_only_the_selected_public_client_and_is_idempotent(): void
    {
        $client = app(ClientRepository::class)->createAuthorizationCodeGrantClient('Hexa-Tech', [self::CALLBACK], false);
        $other = app(ClientRepository::class)->createAuthorizationCodeGrantClient('Other application', [self::CALLBACK], true);
        $otherBefore = $other->fresh()->getRawOriginal();
        config(['chatgpt.client_id' => $client->id]);
        $args = ['--redirect-uri' => [self::CALLBACK, self::LOOPBACK]];
        $this->assertSame(0, Artisan::call('chatgpt:client', $args));
        $first = $client->fresh()->getRawOriginal();
        $this->assertSame(0, Artisan::call('chatgpt:client', $args));
        $this->assertSame($first, $client->fresh()->getRawOriginal());
        $this->assertSame($otherBefore, $other->fresh()->getRawOriginal());
        $this->assertDatabaseCount('oauth_clients', 2);
    }

    public function test_client_setup_refuses_ambiguous_or_incompatible_clients_without_mutation(): void
    {
        $client = app(ClientRepository::class)->createAuthorizationCodeGrantClient('Hexa-Tech', [self::CALLBACK], false);
        $before = $client->fresh()->getRawOriginal();
        $this->assertSame(1, Artisan::call('chatgpt:client', ['--redirect-uri' => [self::LOOPBACK]]));
        $this->assertSame($before, $client->fresh()->getRawOriginal());
        $client->forceFill(['revoked' => true])->save();
        config(['chatgpt.client_id' => $client->id]);
        $this->assertSame(1, Artisan::call('chatgpt:client', ['--redirect-uri' => [self::CALLBACK]]));
        $this->assertTrue($client->fresh()->revoked);
        $secretClient = app(ClientRepository::class)->createAuthorizationCodeGrantClient('Secret application', [self::CALLBACK], true);
        $secret = $secretClient->getRawOriginal('secret');
        $this->assertSame(1, Artisan::call('chatgpt:client', ['--client-id' => $secretClient->id, '--redirect-uri' => [self::CALLBACK]]));
        $this->assertSame($secret, $secretClient->fresh()->getRawOriginal('secret'));
        $this->assertStringNotContainsString($secret, Artisan::output());
        $this->assertDatabaseCount('oauth_clients', 2);
    }

    public function test_client_setup_rejects_inexact_or_insecure_callbacks_before_writing(): void
    {
        foreach ([[], ['https://chatgpt.com/*'], ['https://chatgpt.com/%2a'], ['http://chatgpt.com/callback'],
            ['http://localhost/callback'], ['http://localhost:0/callback'], ['https://chatgpt.com/%00'],
            ['https://user:CALLBACK_SECRET@chatgpt.com/callback'],
            ['https://chatgpt.com/callback#fragment'], ['https://chatgpt.com/a,https://chatgpt.com/b']] as $redirects) {
            $this->assertSame(1, Artisan::call('chatgpt:client', ['--redirect-uri' => $redirects]));
            $this->assertStringNotContainsString('CALLBACK_SECRET', Artisan::output());
        }
        $this->assertDatabaseCount('oauth_clients', 0);
    }

    public function test_status_passes_for_complete_setup_without_writes_network_or_secret_output(): void
    {
        $client = app(ClientRepository::class)->createAuthorizationCodeGrantClient('Hexa-Tech', [self::CALLBACK], false);
        config(['chatgpt.client_id' => $client->id]);
        $before = $client->fresh()->getRawOriginal();
        $this->assertSame(0, Artisan::call('chatgpt:status', ['--resource' => 'https://app.hexa-tech.uk/mcp']));
        $output = Artisan::output();
        $this->assertStringContainsString('PASS Passport signing key pair', $output);
        $this->assertStringContainsString('PASS Exact callback allowlist', $output);
        $this->assertStringContainsString('Pilot organization #2: FDS Cards (active)', $output);
        $this->assertStringNotContainsString('PRIVATE KEY', $output);
        $this->assertStringNotContainsString(self::$keys[0], $output);
        $this->assertStringNotContainsString(self::$keys[1], $output);
        $this->assertSame($before, $client->fresh()->getRawOriginal());
        $this->assertDatabaseCount('oauth_access_tokens', 0);
        Http::assertNothingSent();
    }

    public function test_status_reports_missing_tenant_columns_and_fails_closed_for_empty_or_unavailable_pilots(): void
    {
        Schema::table('oauth_access_tokens', fn (Blueprint $table) => $table->dropIndex(['plugin_organization_id']));
        Schema::table('oauth_access_tokens', fn (Blueprint $table) => $table->dropColumn('plugin_organization_id'));
        config(['chatgpt.organization_ids' => []]);
        $this->assertSame(1, Artisan::call('chatgpt:status'));
        $output = Artisan::output();
        $this->assertStringContainsString('Missing or incomplete tables: oauth_access_tokens', $output);
        $this->assertStringContainsString('Pilot allowlist is empty', $output);
        config(['chatgpt.organization_ids' => [2, 999]]);
        DB::table('organizations')->where('id', 2)->update(['is_active' => false]);
        $this->assertSame(1, Artisan::call('chatgpt:status'));
        $output = Artisan::output();
        $this->assertStringContainsString('FAIL Pilot organization #2: FDS Cards (unavailable)', $output);
        $this->assertStringContainsString('FAIL Pilot organization #999: not found (unavailable)', $output);
    }

    public function test_status_detects_disabled_plugin_wrong_resource_bad_keys_and_callback_mismatch(): void
    {
        $client = app(ClientRepository::class)->createAuthorizationCodeGrantClient('Hexa-Tech', [self::LOOPBACK], false);
        config(['chatgpt.client_id' => $client->id, 'chatgpt.enabled' => false, 'passport.private_key' => 'INVALID_PRIVATE_SECRET']);
        $this->assertSame(1, Artisan::call('chatgpt:status', ['--resource' => 'https://other.example/mcp']));
        $output = Artisan::output();
        foreach (['FAIL Plugin enabled', 'FAIL MCP resource', 'FAIL Exact callback allowlist', 'FAIL Passport signing key pair'] as $message) {
            $this->assertStringContainsString($message, $output);
        }
        $this->assertStringNotContainsString('INVALID_PRIVATE_SECRET', $output);
        config(['chatgpt.url' => 'https://user:ORIGIN_SECRET@app.hexa-tech.uk']);
        $this->assertSame(1, Artisan::call('chatgpt:status'));
        $output = Artisan::output();
        $this->assertStringNotContainsString('ORIGIN_SECRET', $output);
        $this->assertStringContainsString('FAIL Canonical HTTPS origin', $output);
    }

    public function test_status_requires_matching_key_pair_and_supports_explicit_all_organization_mode(): void
    {
        $client = app(ClientRepository::class)->createAuthorizationCodeGrantClient('Hexa-Tech', [self::CALLBACK], false);
        config(['chatgpt.client_id' => $client->id, 'chatgpt.organization_ids' => [], 'chatgpt.all_organizations' => true]);
        $this->assertSame(0, Artisan::call('chatgpt:status'));
        $this->assertStringContainsString('All organizations explicitly enabled', Artisan::output());
        config(['passport.public_key' => self::$keys[2]]);
        $this->assertSame(1, Artisan::call('chatgpt:status'));
        $this->assertStringContainsString('FAIL Passport signing key pair', Artisan::output());
        // Public material cannot serve as the signing private key.
        config(['passport.private_key' => self::$keys[1], 'passport.public_key' => self::$keys[1]]);
        $this->assertSame(1, Artisan::call('chatgpt:status'));
        $this->assertStringContainsString('FAIL Passport signing key pair', Artisan::output());
    }
}
