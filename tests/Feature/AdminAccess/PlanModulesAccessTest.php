<?php

namespace Tests\Feature\AdminAccess;

use App\Http\Middleware\AdminAccess;
use App\Models\LoyaltyTier;
use App\Models\Organization;
use App\Models\User;
use App\Services\GuestMemberLinkService;
use App\Services\Portal\PortalBootstrap;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Symfony\Component\HttpFoundation\Response;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

/**
 * HexaTech Loyalty and Content sold on their own (owner 2026-11-02), beside the Appointments plan: an organisation on
 * modules has the workspaces it bought, lands on one of them, reaches nothing else of the admin, and what a missing
 * module would do stays off.
 */
class PlanModulesAccessTest extends TestCase
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

    public function test_loyalty_alone_has_its_workspace_lands_there_and_has_no_other(): void
    {
        $org = $this->onProducts(['loyalty']);

        $this->assertSame(['loyalty'], $org->planModules());
        $this->assertSame(['enabled' => true, 'landing' => true], $org->workspace('loyalty'));
        $this->assertSame(['enabled' => false, 'landing' => false], $org->workspace('content'));
        $this->assertSame(['enabled' => false, 'landing' => false], $org->workspace('appointments'));
        $this->assertFalse($org->appointmentsOnly());
        $this->assertSame(['loyalty' => ['landing' => true, 'only' => true]], $org->workspacesPayload());
        $this->assertTrue($org->holdsModule('loyalty'));
        $this->assertFalse($org->holdsModule('content'));
    }

    public function test_two_modules_land_on_the_first_unless_an_operator_chose_the_other(): void
    {
        $org = $this->onProducts(['content', 'loyalty']);
        $this->assertSame(['loyalty', 'content'], $org->planModules());
        $this->assertSame(['content' => ['landing' => false, 'only' => true], 'loyalty' => ['landing' => true, 'only' => true]], $org->workspacesPayload());

        $org->setWorkspace('content', true, landing: true);
        $this->assertSame(['enabled' => true, 'landing' => true], $org->fresh()->workspace('content'));
        $this->assertSame(['enabled' => true, 'landing' => false], $org->fresh()->workspace('loyalty'));

        // An operator's switch cannot take a bought workspace away.
        $org->setWorkspace('loyalty', false);
        $this->assertTrue($org->fresh()->workspaceEnabled('loyalty'));
    }

    public function test_appointments_with_loyalty_is_on_modules_not_the_full_admin(): void
    {
        $org = $this->onProducts(['appointments', 'booking', 'loyalty']);

        $this->assertSame(['appointments', 'loyalty'], $org->planModules());
        $this->assertFalse($org->appointmentsOnly(), 'not the Appointments plan alone');
        $payload = $org->workspacesPayload();
        $this->assertTrue($payload['appointments']['only']);
        $this->assertTrue($payload['appointments']['landing']);
        $this->assertSame(['landing' => false, 'only' => true], $payload['loyalty']);
        $this->assertArrayNotHasKey('content', $payload);
    }

    public function test_the_plan_slug_decides_when_billing_sent_no_products(): void
    {
        $this->org->forceFill(['entitled_products' => [], 'plan_slug' => 'loyalty-content'])->save();
        $this->assertSame(['loyalty', 'content'], $this->org->fresh()->planModules());

        $this->org->forceFill(['plan_slug' => 'growth'])->save();
        $this->assertNull($this->org->fresh()->planModules());
        $this->assertTrue($this->org->fresh()->holdsModule('content'), 'a full customer holds every product area');
    }

    public function test_the_operators_not_only_mark_makes_a_full_customer_whatever_billing_says(): void
    {
        $this->onProducts(['loyalty']);
        $this->org->setAppointmentsOnly(false);

        $org = $this->org->fresh();
        $this->assertNull($org->planModules());
        $this->assertTrue($org->workspaceEnabled('content'));
    }

    public function test_loyalty_alone_reaches_its_workspace_and_account_and_nothing_else(): void
    {
        $this->onProducts(['loyalty']);

        $this->assertPassed($this->decide($this->staff, 'GET', 'api/v1/admin/loyalty/bootstrap'));
        $this->assertPassed($this->decide($this->staff, 'GET', 'api/v1/admin/me/preferences'));
        $this->assertPassed($this->decide($this->staff, 'GET', 'api/v1/auth/modules'));
        $this->assertPassed($this->decide($this->staff, 'POST', 'api/v1/auth/modules/add'));

        $this->assertNotInPlan($this->decide($this->staff, 'GET', 'api/v1/admin/content/bootstrap'));
        $this->assertNotInPlan($this->decide($this->staff, 'GET', 'api/v1/admin/appointments/bootstrap'));
        $this->assertNotInPlan($this->decide($this->staff, 'GET', 'api/v1/admin/bookings'));
        $this->assertNotInPlan($this->decide($this->staff, 'GET', 'api/v1/admin/settings'));
        $this->assertNotInPlan($this->decide($this->staff, 'POST', 'api/v1/auth/billing/checkout'), 'the full admin\'s Billing');
        // The full admin's own loyalty endpoints are the same product area: the server lets them through, the
        // screens are not shown (the SPA sends staff of an organisation on modules to its workspace).
        $this->assertPassed($this->decide($this->staff, 'GET', 'api/v1/admin/members'));
    }

    public function test_content_alone_reaches_content_and_both_reach_both(): void
    {
        $this->onProducts(['content']);
        $this->assertPassed($this->decide($this->staff, 'GET', 'api/v1/admin/content/bootstrap'));
        $this->assertNotInPlan($this->decide($this->staff, 'GET', 'api/v1/admin/loyalty/bootstrap'));

        $this->onProducts(['loyalty', 'content']);
        $this->assertPassed($this->decide($this->staff, 'GET', 'api/v1/admin/content/bootstrap'));
        $this->assertPassed($this->decide($this->staff, 'GET', 'api/v1/admin/loyalty/bootstrap'));
        $this->assertNotInPlan($this->decide($this->staff, 'GET', 'api/v1/admin/appointments/bootstrap'));
    }

    public function test_a_full_customer_is_unchanged(): void
    {
        $this->onProducts(['crm', 'loyalty', 'booking', 'chat']);
        $this->assertPassed($this->decide($this->staff, 'GET', 'api/v1/admin/members'));
        $this->assertPassed($this->decide($this->staff, 'POST', 'api/v1/auth/billing/checkout'));
        $this->assertNull($this->org->fresh()->planModules());
    }

    public function test_plan_and_products_is_read_by_staff_and_changed_by_managers(): void
    {
        $this->onProducts(['loyalty']);
        $staff = $this->staffUser($this->org, ['role' => 'staff']);

        $this->assertPassed($this->decide($staff, 'GET', 'api/v1/auth/modules'));
        $refused = $this->decide($staff, 'POST', 'api/v1/auth/modules/add');
        $this->assertSame(403, $refused->getStatusCode());
        $this->assertSame('not_allowed', json_decode($refused->getContent(), true)['error']);
    }

    public function test_an_organisation_on_modules_manages_its_own_team(): void
    {
        $this->onProducts(['loyalty']);
        $staff = $this->staffUser($this->org, ['role' => 'staff']);

        $this->assertPassed($this->decide($this->staff, 'GET', 'api/v1/admin/team'));
        $this->assertPassed($this->decide($this->staff, 'POST', 'api/v1/admin/team/invite'));
        $this->assertPassed($this->decide($staff, 'GET', 'api/v1/admin/team'));
        $refused = $this->decide($staff, 'POST', 'api/v1/admin/team/invite');
        $this->assertSame('not_allowed', json_decode($refused->getContent(), true)['error']);
    }

    public function test_without_the_loyalty_module_there_is_no_programme(): void
    {
        LoyaltyTier::withoutGlobalScopes()->where('organization_id', $this->org->id)->update(['is_active' => true]);
        $this->assertGreaterThan(0, LoyaltyTier::withoutGlobalScopes()->where('organization_id', $this->org->id)->count(), 'the fixture seeds tiers');

        $this->onProducts(['loyalty']);
        $this->assertTrue(PortalBootstrap::loyaltyOn($this->org->id));
        $this->assertFalse(Organization::lacksModule($this->org->id, 'loyalty'));

        $this->onProducts(['content']);
        $this->assertFalse(PortalBootstrap::loyaltyOn($this->org->id));
        $this->assertTrue(Organization::lacksModule($this->org->id, 'loyalty'));
        $this->assertNull(app(GuestMemberLinkService::class)->ensureMemberForGuest($this->seedClient()));

        $this->onProducts(['appointments', 'booking', 'loyalty']);
        $this->assertTrue(PortalBootstrap::loyaltyOn($this->org->id), 'Appointments with Loyalty has the programme');
    }

    public function test_the_workspace_commands_refuse_a_module_the_plan_lacks(): void
    {
        $this->onProducts(['content']);

        $this->artisan('workspace:loyalty', ['org' => $this->org->id, '--on' => true])
            ->expectsOutputToContain('without HexaTech Loyalty')->assertFailed();
        $this->artisan('workspace:content', ['org' => $this->org->id, '--on' => true])->assertSuccessful();
        $this->artisan('workspace:content', ['org' => $this->org->id, '--off' => true])
            ->expectsOutputToContain('cannot be switched off')->assertFailed();

        $this->onProducts(['appointments', 'booking', 'loyalty']);
        $this->artisan('workspace:appointments', ['org' => $this->org->id, '--off' => true])->assertFailed();
    }
}
