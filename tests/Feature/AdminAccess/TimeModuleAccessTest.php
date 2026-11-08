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
 * HexaTech Time Planner sold on its own (owner 2026-11-09: "make it a module sold separately like CRM and also included
 * in the enterprise plan"): its own billing product `time_planner` puts an organisation on the `time` module, which
 * reaches the workspace, the staff Planner's endpoints it works on (`admin/planner*`), its own settings and its
 * account — nothing of the CRM, loyalty, bookings or the full admin's settings. A full customer keeps it as before.
 */
class TimeModuleAccessTest extends TestCase
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

    public function test_the_time_planner_alone_has_its_workspace_lands_there_and_has_no_other(): void
    {
        $org = $this->onProducts(['time_planner']);

        $this->assertSame(['time'], $org->planModules());
        $this->assertSame(['enabled' => true, 'landing' => true], $org->workspace('time'));
        foreach (['appointments', 'loyalty', 'content', 'crm'] as $other) {
            $this->assertSame(['enabled' => false, 'landing' => false], $org->workspace($other), $other);
        }
        $this->assertSame(['time' => ['landing' => true, 'only' => true]], $org->workspacesPayload());
        $this->assertTrue($org->holdsModule('time'));
        $this->assertTrue(Organization::lacksModule($org->id, 'loyalty'));
    }

    public function test_a_full_customer_keeps_it_and_another_module_alone_does_not_have_it(): void
    {
        $org = $this->onProducts(['crm', 'loyalty', 'booking', 'chat']);
        $this->assertNull($org->planModules(), 'Enterprise and Growth stay full customers');
        $this->assertSame(['landing' => false], $org->workspacesPayload()['time']);

        $this->assertFalse($this->onProducts(['crm_chat'])->workspaceEnabled('time'));
        $this->assertNull($this->onProducts(['time_planner', 'crm'])->planModules(), 'any full product makes a full customer');
    }

    public function test_with_another_module_it_lands_on_the_first_in_module_order_and_the_slug_decides_without_products(): void
    {
        $org = $this->onProducts(['time_planner', 'crm_chat']);
        $this->assertSame(['crm', 'time'], $org->planModules());
        $this->assertSame(['landing' => false, 'only' => true], $org->workspacesPayload()['time']);

        $this->org->forceFill(['entitled_products' => [], 'plan_slug' => 'loyalty_lite-time_pro'])->save();
        $this->assertSame(['loyalty', 'time'], $this->org->fresh()->planModules());
        $this->assertSame(['loyalty' => 'lite', 'time' => 'pro'], $this->org->fresh()->planTiers());
    }

    public function test_it_reaches_the_workspace_the_planner_its_settings_and_its_account_only(): void
    {
        $this->onProducts(['time_planner']);

        $this->assertSame(['account', 'time'], AccessMap::productsFor(['time']));
        foreach ([
            ['GET', 'api/v1/admin/time/bootstrap'],
            ['GET', 'api/v1/admin/time/today'],
            ['POST', 'api/v1/admin/time/plan'],
            ['GET', 'api/v1/admin/time/settings'],
            ['GET', 'api/v1/admin/planner/tasks'],
            ['POST', 'api/v1/admin/planner/tasks'],
            ['PATCH', 'api/v1/admin/planner/tasks/1/move'],
            ['GET', 'api/v1/admin/planner/backlog'],
            ['GET', 'api/v1/admin/planner/templates'],
            ['GET', 'api/v1/admin/team'],
            ['GET', 'api/v1/auth/modules'],
        ] as [$method, $uri]) {
            $this->assertPassed($this->decide($this->staff, $method, $uri), "{$method} {$uri}");
        }

        foreach ([
            'api/v1/admin/crm-settings',
            'api/v1/admin/crm/bootstrap',
            'api/v1/admin/inquiries',
            'api/v1/admin/chat-inbox',
            'api/v1/admin/loyalty/bootstrap',
            'api/v1/admin/appointments/bootstrap',
            'api/v1/admin/members',
            'api/v1/admin/settings',
        ] as $uri) {
            $this->assertNotInPlan($this->decide($this->staff, 'GET', $uri), $uri);
        }
    }

    public function test_another_module_alone_does_not_reach_the_planner(): void
    {
        $this->onProducts(['crm_chat']);
        $this->assertNotInPlan($this->decide($this->staff, 'GET', 'api/v1/admin/time/bootstrap'));
        $this->assertNotInPlan($this->decide($this->staff, 'GET', 'api/v1/admin/planner/tasks'));
    }

    public function test_the_workspace_command_refuses_what_the_plan_decides(): void
    {
        $this->onProducts(['content']);
        $this->artisan('workspace:time', ['org' => $this->org->id, '--on' => true])
            ->expectsOutputToContain('without HexaTech Time Planner')->assertFailed();

        $this->onProducts(['time_planner']);
        $this->artisan('workspace:time', ['org' => $this->org->id, '--off' => true])
            ->expectsOutputToContain('cannot be switched off')->assertFailed();

        $this->onProducts(['crm', 'loyalty', 'booking', 'chat']);
        $this->artisan('workspace:time', ['org' => $this->org->id, '--off' => true])->expectsOutputToContain('HexaTech Time Planner off')->assertSuccessful();
        $this->assertFalse($this->org->fresh()->workspaceEnabled('time'));
        $this->artisan('workspace:time', ['--list' => true])->expectsOutputToContain((string) $this->org->name)->assertSuccessful();
    }
}
