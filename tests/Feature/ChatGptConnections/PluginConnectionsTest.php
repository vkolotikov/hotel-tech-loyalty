<?php

namespace Tests\Feature\ChatGptConnections;

use App\Models\User;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Schema;
use Laravel\Passport\ClientRepository;
use Laravel\Passport\Passport;
use Tests\TestCase;

class PluginConnectionsTest extends TestCase
{
    private const ENDPOINT = '/api/v1/auth/plugin-connections';

    private string $clientId;

    private string $otherClientId;

    protected function setUp(): void
    {
        parent::setUp();

        config(['chatgpt.enabled' => true, 'chatgpt.organization_ids' => [10], 'chatgpt.all_organizations' => false]);

        Schema::create('users', function (Blueprint $table): void {
            $table->id();
            $table->string('name');
            $table->string('email');
            $table->string('password');
            $table->string('user_type');
            $table->unsignedBigInteger('organization_id')->nullable();
            $table->rememberToken();
            $table->timestamps();
        });
        Schema::create('personal_access_tokens', function (Blueprint $table): void {
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

        DB::table('users')->insert([
            ['id' => 1, 'name' => 'First Staff', 'email' => 'first@example.test', 'password' => 'unused', 'user_type' => 'staff', 'organization_id' => 10],
            ['id' => 2, 'name' => 'Other Staff', 'email' => 'other@example.test', 'password' => 'unused', 'user_type' => 'staff', 'organization_id' => 10],
            ['id' => 3, 'name' => 'Member', 'email' => 'member@example.test', 'password' => 'unused', 'user_type' => 'member', 'organization_id' => 10],
            ['id' => 4, 'name' => 'Unassigned', 'email' => 'unassigned@example.test', 'password' => 'unused', 'user_type' => 'staff', 'organization_id' => null],
        ]);
        $this->clientId = (string) app(ClientRepository::class)->createAuthorizationCodeGrantClient(
            'Hexa-Tech ChatGPT', ['https://chatgpt.com/callback'], confidential: false,
        )->id;
        $this->otherClientId = (string) app(ClientRepository::class)->createAuthorizationCodeGrantClient(
            'Other Integration', ['https://example.test/callback'], confidential: false,
        )->id;
        config(['chatgpt.client_id' => $this->clientId]);
    }

    public function test_lists_only_current_users_workspace_and_plugin_with_safe_metadata(): void
    {
        $this->accessToken('own');
        $this->accessToken('colleague', ['user_id' => 2]);
        $this->accessToken('previous-workspace', ['plugin_organization_id' => 20]);
        $this->accessToken('other-client', ['client_id' => $this->otherClientId]);
        $this->accessToken('unbound', ['plugin_organization_id' => null]);
        $this->accessToken('revoked', ['revoked' => true]);

        $this->signIn();
        $response = $this->getJson(self::ENDPOINT)->assertOk()
            ->assertJsonPath('enabled', true)->assertJsonPath('configured', true)
            ->assertJsonCount(1, 'connections')->assertJsonPath('connections.0.id', 'own');
        $entry = $response->json('connections.0');
        $this->assertEqualsCanonicalizing(['id', 'name', 'scopes', 'created_at', 'expires_at'], array_keys($entry));
        $this->assertSame(['mcp:use'], $entry['scopes']);
        $this->assertSame('Hexa-Tech ChatGPT and Codex', $entry['name']);
        $this->assertStringContainsString('no-store', $response->headers->get('Cache-Control'));
    }

    public function test_expired_access_remains_visible_while_it_can_refresh(): void
    {
        $this->accessToken('refreshable', ['expires_at' => now()->subHour()]);
        $this->refreshToken('usable-refresh', 'refreshable');
        $this->accessToken('fully-expired', ['expires_at' => now()->subHour()]);
        $this->refreshToken('expired-refresh', 'fully-expired', ['expires_at' => now()->subMinute()]);
        $this->accessToken('revoked-refresh', ['expires_at' => now()->subHour()]);
        $this->refreshToken('disabled-refresh', 'revoked-refresh', ['revoked' => true]);

        $this->signIn();
        $this->getJson(self::ENDPOINT)->assertOk()->assertJsonCount(1, 'connections')
            ->assertJsonPath('connections.0.id', 'refreshable');
    }

    public function test_disconnect_revokes_own_tokens_and_pending_codes_without_touching_other_access(): void
    {
        $this->accessToken('own');
        $this->refreshToken('own-refresh', 'own');
        // Include old token rows so no lingering refresh can escape revocation.
        $this->accessToken('rotated-parent', ['revoked' => true]);
        $this->refreshToken('old-refresh', 'rotated-parent');
        $this->authCode('pending');
        foreach (['colleague' => ['user_id' => 2], 'previous-workspace' => ['plugin_organization_id' => 20],
            'other-client' => ['client_id' => $this->otherClientId]] as $id => $override) {
            $this->accessToken($id, $override);
            $this->refreshToken($id.'-refresh', $id);
            $this->authCode($id.'-code', $override);
        }

        $this->signIn();
        $this->deleteJson(self::ENDPOINT)->assertOk()->assertExactJson(['success' => true]);
        foreach (['own', 'rotated-parent'] as $id) {
            $this->assertTrue(Passport::token()->newQuery()->findOrFail($id)->revoked);
        }
        foreach (['own-refresh', 'old-refresh'] as $id) {
            $this->assertTrue(Passport::refreshToken()->newQuery()->findOrFail($id)->revoked);
        }
        $this->assertTrue(Passport::authCode()->newQuery()->findOrFail('pending')->revoked);
        foreach (['colleague', 'previous-workspace', 'other-client'] as $id) {
            $this->assertFalse(Passport::token()->newQuery()->findOrFail($id)->revoked);
            $this->assertFalse(Passport::refreshToken()->newQuery()->findOrFail($id.'-refresh')->revoked);
            $this->assertFalse(Passport::authCode()->newQuery()->findOrFail($id.'-code')->revoked);
        }
        $this->assertSame(1, DB::table('personal_access_tokens')->count());
        Auth::forgetGuards();
        $this->getJson(self::ENDPOINT)->assertOk()->assertJsonCount(0, 'connections');
        $this->deleteJson(self::ENDPOINT)->assertOk()->assertExactJson(['success' => true]);
    }

    public function test_disabled_integration_and_revoked_client_do_not_prevent_disconnection(): void
    {
        $this->accessToken('own');
        $this->refreshToken('own-refresh', 'own');
        config(['chatgpt.enabled' => false]);
        Passport::client()->newQuery()->whereKey($this->clientId)->update(['revoked' => true]);

        $this->signIn();
        $this->getJson(self::ENDPOINT)->assertOk()->assertJsonPath('enabled', false)->assertJsonCount(1, 'connections');
        $this->deleteJson(self::ENDPOINT)->assertOk();
        $this->assertTrue(Passport::refreshToken()->newQuery()->findOrFail('own-refresh')->revoked);
    }

    public function test_unconfigured_integration_has_safe_empty_state_and_idempotent_disconnect(): void
    {
        config(['chatgpt.enabled' => false, 'chatgpt.client_id' => '']);
        $this->signIn();
        $this->getJson(self::ENDPOINT)->assertOk()
            ->assertExactJson(['enabled' => false, 'configured' => false, 'connections' => []]);
        $this->deleteJson(self::ENDPOINT)->assertOk()->assertExactJson(['success' => true]);
    }

    public function test_removal_from_pilot_does_not_hide_grants_or_prevent_disconnection(): void
    {
        $this->accessToken('own');
        config(['chatgpt.organization_ids' => [20]]);
        $this->signIn();
        $this->getJson(self::ENDPOINT)->assertOk()->assertJsonPath('enabled', false)->assertJsonCount(1, 'connections');
        $this->deleteJson(self::ENDPOINT)->assertOk();
        $this->assertTrue(Passport::token()->newQuery()->findOrFail('own')->revoked);
    }

    public function test_guests_members_and_staff_without_workspace_cannot_manage_grants(): void
    {
        $this->accessToken('own');
        $this->getJson(self::ENDPOINT)->assertUnauthorized();
        $this->deleteJson(self::ENDPOINT)->assertUnauthorized();
        foreach ([3, 4] as $userId) {
            $this->signIn($userId);
            $this->getJson(self::ENDPOINT)->assertForbidden();
            $this->deleteJson(self::ENDPOINT)->assertForbidden();
        }
        $this->assertFalse(Passport::token()->newQuery()->findOrFail('own')->revoked);
    }

    public function test_all_revocations_roll_back_if_pending_code_update_fails(): void
    {
        $this->accessToken('own');
        $this->refreshToken('own-refresh', 'own');
        $this->authCode('pending');
        DB::unprepared("CREATE TRIGGER refuse_code_revocation BEFORE UPDATE ON oauth_auth_codes BEGIN SELECT RAISE(ABORT, 'test transaction failure'); END");

        $this->signIn();
        $this->deleteJson(self::ENDPOINT)->assertStatus(500);
        $this->assertFalse(Passport::token()->newQuery()->findOrFail('own')->revoked);
        $this->assertFalse(Passport::refreshToken()->newQuery()->findOrFail('own-refresh')->revoked);
        $this->assertFalse(Passport::authCode()->newQuery()->findOrFail('pending')->revoked);
    }

    public function test_management_routes_do_not_depend_on_subscription_brand_or_plugin_enablement(): void
    {
        $route = Route::getRoutes()->match(\Illuminate\Http\Request::create(self::ENDPOINT));
        $middleware = $route->gatherMiddleware();
        $this->assertContains('auth:sanctum', $middleware);
        $this->assertContains('admin', $middleware);
        $this->assertNotContains('check.subscription', $middleware);
        $this->assertNotContains('brand', $middleware);
        $this->assertNotContains(\App\Http\Middleware\Plugin\GuardPluginTransport::class, $middleware);
    }

    private function signIn(int $userId = 1): void
    {
        Auth::forgetGuards();
        $this->withToken(User::findOrFail($userId)->createToken('app-session')->plainTextToken);
    }

    private function accessToken(string $id, array $override = []): void
    {
        Passport::token()->newQuery()->create(array_merge([
            'id' => $id, 'user_id' => 1, 'plugin_organization_id' => 10, 'client_id' => $this->clientId,
            'name' => null, 'scopes' => ['mcp:use'], 'revoked' => false, 'expires_at' => now()->addHour(),
        ], $override));
    }

    private function refreshToken(string $id, string $accessTokenId, array $override = []): void
    {
        Passport::refreshToken()->newQuery()->create(array_merge([
            'id' => $id, 'access_token_id' => $accessTokenId, 'revoked' => false, 'expires_at' => now()->addDays(30),
        ], $override));
    }

    private function authCode(string $id, array $override = []): void
    {
        Passport::authCode()->newQuery()->create(array_merge([
            'id' => $id, 'user_id' => 1, 'plugin_organization_id' => 10, 'client_id' => $this->clientId,
            'scopes' => json_encode(['mcp:use']), 'revoked' => false, 'expires_at' => now()->addMinutes(10),
        ], $override));
    }
}
