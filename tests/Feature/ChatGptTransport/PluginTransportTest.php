<?php

namespace Tests\Feature\ChatGptTransport;

use App\Http\Middleware\AdminMiddleware;
use App\Http\Middleware\Plugin\CheckPluginSubscription;
use App\Http\Middleware\Plugin\AuthenticatePluginToken;
use App\Http\Middleware\TenantMiddleware;
use Illuminate\Support\Facades\URL;
use Tests\TestCase;

class PluginTransportTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['app.url' => 'http://localhost', 'chatgpt.url' => 'http://localhost', 'chatgpt.enabled' => true]);
        URL::forceRootUrl('http://localhost');
    }

    private function bypassIdentityForProtocolTests(): void
    {
        // Authentication and tenant enforcement have their own full-stack tests.
        // These cases exercise the real HTTP transport and registered tool schemas.
        $this->withoutMiddleware([
            AuthenticatePluginToken::class,
            TenantMiddleware::class,
            AdminMiddleware::class,
            CheckPluginSubscription::class,
        ]);
    }

    public function test_disabled_plugin_fails_closed_for_all_transport_methods(): void
    {
        config(['chatgpt.enabled' => false]);
        $this->postJson('/mcp', [])->assertNotFound();
        $this->get('/mcp')->assertNotFound();
        $this->delete('/mcp')->assertNotFound();
    }

    public function test_unknown_origin_and_other_app_hosts_are_rejected(): void
    {
        $this->postJson('/mcp', [], ['Origin' => 'https://untrusted.example'])->assertForbidden();
        $this->postJson('http://other.example/mcp', [])->assertNotFound();
    }

    public function test_browser_preflight_allows_only_configured_origins_and_mcp_headers(): void
    {
        config(['chatgpt.allowed_origins' => ['https://inspector.example.test']]);
        $response = $this->options('/mcp', [], ['Origin' => 'https://inspector.example.test',
            'Access-Control-Request-Method' => 'POST',
            'Access-Control-Request-Headers' => 'authorization,content-type,mcp-protocol-version']);
        $response->assertNoContent()->assertHeader('Access-Control-Allow-Origin', 'https://inspector.example.test');
        $this->assertStringContainsString('MCP-Protocol-Version', $response->headers->get('Access-Control-Allow-Headers'));
        $this->options('/mcp', [], ['Origin' => 'https://untrusted.example'])->assertForbidden()
            ->assertHeaderMissing('Access-Control-Allow-Origin');
        config(['chatgpt.enabled' => false]);
        $this->options('/mcp', [], ['Origin' => 'https://inspector.example.test'])->assertNotFound()
            ->assertHeaderMissing('Access-Control-Allow-Origin');
    }

    public function test_transport_bounds_payload_and_requires_json(): void
    {
        $this->withHeader('Authorization', 'Bearer invalid')
            ->post('/mcp', ['body' => 'text'])->assertStatus(415);
        $this->postJson('/mcp', ['body' => str_repeat('x', 65537)])->assertStatus(413);
    }

    public function test_the_voice_endpoint_gets_the_same_payload_and_json_limits(): void
    {
        // The guard matched the literal path 'mcp', so a second MCP server
        // mounted beneath it would otherwise take unbounded, untyped bodies.
        $this->withHeader('Authorization', 'Bearer invalid')
            ->post('/mcp/voice', ['body' => 'text'])->assertStatus(415);
        $this->postJson('/mcp/voice', ['body' => str_repeat('x', 65537)])->assertStatus(413);
    }

    public function test_bodyless_authentication_probe_gets_oauth_challenge_without_content_type(): void
    {
        $response = $this->call('POST', '/mcp');
        $response->assertUnauthorized();
        $this->assertStringContainsString('resource_metadata=', $response->headers->get('WWW-Authenticate', ''));
        $this->assertStringContainsString('no-store', $response->headers->get('Cache-Control', ''));
    }

    public function test_unauthenticated_client_gets_discovery_challenge(): void
    {
        $response = $this->postJson('/mcp', ['jsonrpc' => '2.0', 'id' => 1, 'method' => 'tools/list']);
        $response->assertUnauthorized();
        $this->assertStringContainsString('resource_metadata=', $response->headers->get('WWW-Authenticate', ''));
        $this->assertStringContainsString('no-store', $response->headers->get('Cache-Control', ''));
    }

    public function test_initialize_and_notifications_use_real_mcp_transport(): void
    {
        $this->bypassIdentityForProtocolTests();
        $response = $this->postJson('/mcp', [
            'jsonrpc' => '2.0', 'id' => 1, 'method' => 'initialize',
            'params' => ['protocolVersion' => '2025-06-18', 'capabilities' => [], 'clientInfo' => ['name' => 'test', 'version' => '1.0']],
        ]);
        $response->assertOk()->assertJsonPath('result.protocolVersion', '2025-06-18');
        $this->assertNotEmpty($response->json('result.serverInfo.name'));
        $this->assertStringContainsString('no-store', $response->headers->get('Cache-Control', ''));
        $this->postJson('/mcp', ['jsonrpc' => '2.0', 'method' => 'notifications/initialized'])->assertStatus(202);
        $this->get('/mcp')->assertStatus(405)->assertHeader('Allow', 'POST');
    }

    public function test_catalog_has_only_scoped_lead_customer_and_booking_tools(): void
    {
        $this->bypassIdentityForProtocolTests();
        $response = $this->postJson('/mcp', ['jsonrpc' => '2.0', 'id' => 2, 'method' => 'tools/list']);
        $response->assertOk();
        $tools = collect($response->json('result.tools'))->keyBy('name');
        $this->assertEqualsCanonicalizing([
            'list_leads', 'search_customers', 'get_customer', 'list_bookings', 'get_booking', 'add_customer_note', 'add_booking_note',
        ], $tools->keys()->all());
        $this->assertEmpty($tools['list_leads']['inputSchema']['required'] ?? []);
        $this->assertSame(25, $tools['list_leads']['inputSchema']['properties']['limit']['maximum']);
        $this->assertSame('date', $tools['list_leads']['inputSchema']['properties']['from']['format']);
        $this->assertContains('query', $tools['search_customers']['inputSchema']['required']);
        $this->assertStringContainsString('list_leads', $tools['search_customers']['inputSchema']['properties']['query']['description']);
        foreach ($tools as $name => $tool) {
            $this->assertSame('object', $tool['inputSchema']['type']);
            $this->assertSame(! str_starts_with($name, 'add_'), $tool['annotations']['readOnlyHint']);
            $this->assertSame(false, $tool['annotations']['destructiveHint']);
            $this->assertSame(false, $tool['annotations']['openWorldHint']);
            $schemes = $tool['securitySchemes'] ?? $tool['_meta']['securitySchemes'] ?? [];
            $this->assertSame([['type' => 'oauth2', 'scopes' => ['mcp:use']]], $schemes);
        }
    }

    public function test_unknown_methods_return_protocol_error(): void
    {
        $this->bypassIdentityForProtocolTests();
        $this->postJson('/mcp', ['jsonrpc' => '2.0', 'id' => 3, 'method' => 'admin/deleteEverything'])
            ->assertOk()->assertJsonPath('error.code', -32601);
    }
}
