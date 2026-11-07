<?php

namespace Tests\Feature\AdminAccess;

use App\Http\Middleware\AdminAccess;
use App\Models\Organization;
use App\Models\User;
use App\Support\AdminAccess\AccessMap;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Symfony\Component\HttpFoundation\Response;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

/**
 * HexaTech CRM sold on its own (owner 2026-11-07: "AI chat widget + CRM … one portal … sold separately as a module"):
 * its own billing product `crm_chat` puts an organisation on the `crm` module, which reaches the workspace, the full
 * admin's chat and CRM endpoints it works on, and its account — nothing of loyalty, bookings or the full admin's
 * settings. The full suite's own `crm` and `chat` products never make a module customer.
 */
class CrmModuleAccessTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
        config(['admin_access.mode' => 'enforce']);
    }

    private function onProducts(array $products): Organization
    {
        $this->org->forceFill(['entitled_products' => $products])->save();

        return $this->org->fresh();
    }

    private function decide(User $user, string $method, string $uri): Response
    {
        $request = Request::create('/' . ltrim($uri, '/'), $method);
        $route = Route::getRoutes()->match($request);
        $request->setRouteResolver(fn () => $route);
        $request->setUserResolver(fn () => $user);

        return app(AdminAccess::class)->handle($request, fn () => response('passed'));
    }

    private function assertPassed(Response $response, string $why = ''): void
    {
        $this->assertSame('passed', $response->getContent(), $why . ' ' . $response->getContent());
    }

    private function assertNotInPlan(Response $response, string $why = ''): void
    {
        $this->assertSame(403, $response->getStatusCode(), $why . ' ' . $response->getContent());
        $this->assertSame('not_in_plan', json_decode($response->getContent(), true)['error'], $why);
    }

    public function test_crm_alone_has_its_workspace_lands_there_and_has_no_other(): void
    {
        $org = $this->onProducts(['crm_chat']);

        $this->assertSame(['crm'], $org->planModules());
        $this->assertSame(['enabled' => true, 'landing' => true], $org->workspace('crm'));
        $this->assertSame(['enabled' => false, 'landing' => false], $org->workspace('loyalty'));
        $this->assertSame(['enabled' => false, 'landing' => false], $org->workspace('content'));
        $this->assertSame(['enabled' => false, 'landing' => false], $org->workspace('appointments'));
        $this->assertSame(['crm' => ['landing' => true, 'only' => true]], $org->workspacesPayload());
        $this->assertTrue($org->holdsModule('crm'));
        $this->assertFalse($org->holdsModule('loyalty'));
        $this->assertTrue(Organization::lacksModule($org->id, 'loyalty'), 'no programme, no member sign-up without Loyalty');
    }

    public function test_the_full_suites_crm_and_chat_products_stay_a_full_customer(): void
    {
        // Starter and Growth hold `crm` (and `chat`): they must never become organisations on modules.
        $this->assertNull($this->onProducts(['crm', 'loyalty'])->planModules(), 'Starter');
        $this->assertNull($this->onProducts(['crm', 'loyalty', 'booking', 'chat'])->planModules(), 'Growth');
        $this->assertNull($this->onProducts(['crm_chat', 'crm'])->planModules(), 'any full product makes a full customer');
        $org = $this->onProducts(['crm', 'loyalty', 'booking', 'chat']);
        $this->assertTrue($org->workspaceEnabled('crm'), 'a full customer has the workspace by default');
        $this->assertSame(['landing' => false], $org->workspacesPayload()['crm']);
    }

    public function test_crm_with_another_module_lands_on_the_first_in_module_order(): void
    {
        $org = $this->onProducts(['crm_chat', 'loyalty']);
        $this->assertSame(['loyalty', 'crm'], $org->planModules());
        $this->assertSame(['landing' => false, 'only' => true], $org->workspacesPayload()['crm']);

        $org->setWorkspace('crm', true, landing: true);
        $this->assertSame(['enabled' => true, 'landing' => true], $org->fresh()->workspace('crm'));
        $this->assertSame(['enabled' => true, 'landing' => false], $org->fresh()->workspace('loyalty'));
    }

    public function test_the_plan_slug_decides_when_billing_sent_no_products(): void
    {
        $this->org->forceFill(['entitled_products' => [], 'plan_slug' => 'crm_pro'])->save();
        $this->assertSame(['crm'], $this->org->fresh()->planModules());
        $this->assertSame(['crm' => 'pro'], $this->org->fresh()->planTiers());

        $this->org->forceFill(['plan_slug' => 'content_lite-crm'])->save();
        $this->assertSame(['content', 'crm'], $this->org->fresh()->planModules());
        $this->assertSame(['content' => 'lite', 'crm' => 'standard'], $this->org->fresh()->planTiers());
    }

    public function test_crm_reaches_its_workspace_the_chat_and_crm_endpoints_and_its_account_only(): void
    {
        $this->onProducts(['crm_chat']);

        $this->assertSame(['account', 'crm', 'chat'], AccessMap::productsFor(['crm']));
        foreach ([
            ['GET', 'api/v1/admin/crm/bootstrap'],
            ['GET', 'api/v1/admin/crm/today'],
            ['GET', 'api/v1/admin/crm/bot-gaps'],
            ['POST', 'api/v1/admin/crm/conversations/1/draft'],
            ['GET', 'api/v1/admin/chat-inbox'],
            ['POST', 'api/v1/admin/chat-inbox/1/messages'],
            ['GET', 'api/v1/admin/visitors'],
            ['GET', 'api/v1/admin/widget-config'],
            ['PUT', 'api/v1/admin/chatbot-config/behavior'],
            ['GET', 'api/v1/admin/knowledge/items'],
            ['GET', 'api/v1/admin/inquiries'],
            ['GET', 'api/v1/admin/deals'],
            ['GET', 'api/v1/admin/guests'],
            ['GET', 'api/v1/admin/tasks'],
            ['GET', 'api/v1/admin/pipelines'],
            ['GET', 'api/v1/admin/team'],
            ['GET', 'api/v1/auth/modules'],
            ['GET', 'api/v1/admin/me/preferences'],
        ] as [$method, $uri]) {
            $this->assertPassed($this->decide($this->staff, $method, $uri), "{$method} {$uri}");
        }

        foreach ([
            'api/v1/admin/loyalty/bootstrap',
            'api/v1/admin/content/bootstrap',
            'api/v1/admin/appointments/bootstrap',
            'api/v1/admin/members',
            'api/v1/admin/bookings',
            'api/v1/admin/settings',
            'api/v1/admin/dashboard/summary',
        ] as $uri) {
            $this->assertNotInPlan($this->decide($this->staff, 'GET', $uri), $uri);
        }
    }

    public function test_another_module_alone_does_not_reach_the_crm(): void
    {
        $this->onProducts(['loyalty']);
        $this->assertNotInPlan($this->decide($this->staff, 'GET', 'api/v1/admin/crm/bootstrap'));
        $this->assertNotInPlan($this->decide($this->staff, 'GET', 'api/v1/admin/chat-inbox'));
        $this->assertNotInPlan($this->decide($this->staff, 'GET', 'api/v1/admin/inquiries'));
    }

    public function test_the_workspace_command_refuses_what_the_plan_decides(): void
    {
        $this->onProducts(['content']);
        $this->artisan('workspace:crm', ['org' => $this->org->id, '--on' => true])
            ->expectsOutputToContain('without HexaTech CRM')->assertFailed();

        $this->onProducts(['crm_chat']);
        $this->artisan('workspace:crm', ['org' => $this->org->id, '--off' => true])
            ->expectsOutputToContain('cannot be switched off')->assertFailed();

        $this->onProducts(['crm', 'loyalty', 'booking', 'chat']);
        $this->artisan('workspace:crm', ['org' => $this->org->id, '--off' => true])->expectsOutputToContain('HexaTech CRM off')->assertSuccessful();
        $this->assertFalse($this->org->fresh()->workspaceEnabled('crm'));
        $this->artisan('workspace:crm', ['--list' => true])->expectsOutputToContain((string) $this->org->name)->assertSuccessful();
        $this->artisan('workspace:crm', ['org' => $this->org->id, '--on' => true, '--landing' => true])->expectsOutputToContain('HexaTech CRM ON, landing on')->assertSuccessful();
        $this->assertSame(['enabled' => true, 'landing' => true], $this->org->fresh()->workspace('crm'));
    }
}
